import { useCallback, useEffect, useRef, useState } from 'react';
import { api, mediaUrls, upload, type ProjectSummary, type Status, type Step } from './api';
import { errText, fmt, useT, type StrKey } from './i18n';
import { go, LangSwitch } from './App';
import type { StyleItem } from './api';
import { styleName } from './StylePanel';
import { Check, HelpTip } from './ui';

const STEPS: Step[] = ['normalize', 'transcribe', 'faces', 'autoedit', 'ready'];

export function StepList({ status }: { status: Status }) {
  const { t } = useT();
  const idx = STEPS.indexOf(status.step);
  if (status.step === 'queued') {
    return <p className="queued-line">{status.position ? fmt(t('waitingInLine'), { n: status.position }) : t('step_queued')}…</p>;
  }
  return (
    <ol className="steps">
      {STEPS.map((s, i) => {
        const state = status.step === 'ready' || i < idx ? 'done' : i === idx ? 'now' : 'todo';
        return (
          <li key={s} className={state}>
            <span className="dot" aria-hidden>
              {state === 'done' ? '✓' : ''}
            </span>
            <span className="label">{t(`step_${s}` as StrKey)}</span>
            {state === 'now' && s !== 'ready' && (
              <span className="mini-bar">
                <span style={{ width: `${Math.round((status.progress || 0) * 100)}%` }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const fmtDate = (iso: string, lang: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'long' });
};

// Long videos first (newest first), each followed by its clips.
const groupProjects = (list: ProjectSummary[]) => {
  const slugs = new Set(list.map((p) => p.slug));
  const top = list.filter((p) => !p.parent || !slugs.has(p.parent));
  return top.flatMap((p) => [p, ...list.filter((c) => c.parent === p.slug)]);
};

export function Home() {
  const { t, lang } = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [up, setUp] = useState<{ name: string; progress: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState(false);
  const [styles, setStyles] = useState<{ styles: StyleItem[]; defaultStyle: string } | null>(null);
  useEffect(() => {
    api.styles().then(setStyles).catch(() => {});
  }, []);
  const input = useRef<HTMLInputElement>(null);
  // The video she just dropped: open it by itself as soon as its first edit is ready.
  const justUploaded = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.projects();
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setProjects(groupProjects(list));
      const mine = justUploaded.current && list.find((p) => p.slug === justUploaded.current);
      if (mine && mine.status.step === 'ready') {
        justUploaded.current = null;
        window.location.hash = `#/p/${mine.slug}`;
      } else if (mine && mine.status.step === 'error') justUploaded.current = null;
    } catch {
      /* banner handles server down */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const send = (file: File | undefined) => {
    if (!file || up) return;
    setErr(null);
    setUp({ name: file.name, progress: 0 });
    const job = upload<{ slug: string }>('/api/projects', 'video', [file], (p) => setUp({ name: file.name, progress: p }), {
      'X-File-Name': encodeURIComponent(file.name),
      ...(batch ? { 'x-batch': '1' } : {}),
    });
    job.promise
      .then((r) => {
        justUploaded.current = r.slug;
        return load();
      })
      .catch(() => setErr(t('uploadFailed')))
      .finally(() => setUp(null));
  };

  const q = query.trim().toLowerCase();
  const shown = (projects ?? []).filter((p) => !q || (p.title || '').toLowerCase().includes(q) || p.slug.includes(q));

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Reel Studio</span>
        </div>
        <LangSwitch />
      </header>

      <main className="home-main">
        <div
          className={`dropzone ${over ? 'over' : ''} ${up ? 'busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            send(e.dataTransfer.files[0]);
          }}
          onClick={() => !up && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        >
          <input
            ref={input}
            type="file"
            accept="video/*,.mov,.MOV,.mp4"
            hidden
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {up ? (
            <div className="drop-progress">
              <div className="drop-title">
                {t('uploading')} <em>{up.name}</em>
              </div>
              <div className="bar big">
                <span style={{ width: `${Math.round(up.progress * 100)}%` }} />
              </div>
              <div className="muted">{Math.round(up.progress * 100)}%</div>
            </div>
          ) : (
            <>
              <div className="drop-icon" aria-hidden>
                <svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <rect x="14" y="5" width="20" height="38" rx="4" />
                  <path d="M24 16v14M18 24l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="drop-title">{t('dropTitle')}</div>
              <div className="muted">{t('dropHint')}</div>
            </>
          )}
          {err && <div className="error-text">{err}</div>}
        </div>

        <div className="batch-row">
          <Check checked={batch} onChange={setBatch} label={t('batchLabel')} />
          <HelpTip text={t('batchTip')} />
        </div>

        {styles && styles.styles.length > 0 && (
          <div className="default-style">
            <span>{t('styleNewUse')}:</span>
            <select
              value={styles.defaultStyle}
              onChange={async (e) => {
                const id = e.target.value;
                setStyles({ ...styles, defaultStyle: id });
                try {
                  await api.setDefaultStyle(id);
                } catch {
                  /* ignore */
                }
              }}
            >
              {styles.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {styleName(s, lang)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="reels-head">
          <h1 className="serif-title">{t('yourReels')}</h1>
          {projects && projects.length > 3 && (
            <input className="reel-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
          )}
        </div>
        {projects && projects.length === 0 && <p className="muted center">{t('noReels')}</p>}
        {projects && projects.length > 0 && shown.length === 0 && <p className="muted center">{t('noResults')}</p>}
        <div className="grid">
          {shown.map((p) => (
            <ReelCard key={p.slug} p={p} all={projects ?? []} reload={load} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ReelCard({ p, all, reload }: { p: ProjectSummary; all: ProjectSummary[]; reload: () => Promise<void> }) {
  const { t, lang } = useT();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.title);
  const [busy, setBusy] = useState(false);
  const ready = p.status.step === 'ready' || p.status.step === 'cutout' || p.status.step === 'covers';
  const isError = p.status.step === 'error';
  const parent = p.parent ? all.find((x) => x.slug === p.parent) : undefined;
  const clips = all.filter((c) => c.parent === p.slug).length;
  const clipWord =
    clips === 1 ? t('clipsOne') : lang === 'pl' && [2, 3, 4].includes(clips % 10) && ![12, 13, 14].includes(clips % 100) ? t('clipsMany') : t('clipsMany5');
  const urls = mediaUrls(p.slug);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', close);
    };
  }, [menu]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch {
      /* the banner shows a down server */
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => {
    const v = name.trim();
    setRenaming(false);
    if (v && v !== p.title) void act(() => api.rename(p.slug, v));
  };

  return (
    <article className={`reel-card ${ready ? 'ready' : ''} ${parent ? 'clip' : ''} ${busy ? 'busy' : ''}`} onClick={() => ready && !renaming && go(`/p/${encodeURIComponent(p.slug)}`)}>
      <div className="thumb">
        {p.status.step !== 'uploading' && p.status.step !== 'normalize' && !isError ? (
          <video src={`${urls.video}#t=0.5`} preload="metadata" muted playsInline />
        ) : (
          <div className="thumb-empty" />
        )}
        {!ready && !isError && (
          <div className="thumb-over">
            <StepList status={p.status} />
          </div>
        )}
        <button
          className="card-menu-btn"
          aria-label={t('menu')}
          onClick={(e) => {
            e.stopPropagation();
            setMenu((m) => !m);
          }}
        >
          ⋯
        </button>
        {menu && (
          <div className="card-menu" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setMenu(false);
                setName(p.title);
                setRenaming(true);
              }}
            >
              {t('rename')}
            </button>
            {isError && (
              <button
                onClick={() => {
                  setMenu(false);
                  void act(() => api.reanalyse(p.slug));
                }}
              >
                {t('retry')}
              </button>
            )}
            <button
              className="danger"
              onClick={() => {
                setMenu(false);
                if (confirm(fmt(t('deleteReelQ'), { t: p.title || t('untitled') }))) void act(() => api.deleteProject(p.slug));
              }}
            >
              {t('delete')}
            </button>
          </div>
        )}
      </div>
      <div className="card-body">
        {parent && (
          <div className="clip-from">
            ↳ {t('clipFrom')}: <em>{parent.title || t('untitled')}</em>
          </div>
        )}
        {renaming ? (
          <form
            className="rename-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)} />
          </form>
        ) : (
          <div className="card-title">{p.title || t('untitled')}</div>
        )}
        {clips > 0 && (
          <div className="clip-count">
            {clips} {clipWord}
          </div>
        )}
        <div className="card-meta">
          {isError ? (
            <span className="error-text">
              {t('step_error')}
              {p.status.code || p.status.message ? `: ${errText(t, p.status.code, p.status.message)}` : ''}
              <button
                className="link-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void act(() => api.reanalyse(p.slug));
                }}
              >
                {t('retry')}
              </button>
            </span>
          ) : ready ? (
            <span>{fmtDate(p.createdAt, lang)}</span>
          ) : (
            <span className="accent">
              {p.status.step === 'queued' && p.status.position ? fmt(t('waitingInLine'), { n: p.status.position }) : t(`step_${p.status.step}` as StrKey)}…
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
