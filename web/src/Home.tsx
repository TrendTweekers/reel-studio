import { useCallback, useEffect, useRef, useState } from 'react';
import { api, mediaUrls, upload, type Format, type ProjectSummary, type Status, type Step } from './api';
import { errText, fmt, useT, type StrKey } from './i18n';
import { go, TopRight } from './App';
import { atHandle, useBrand } from './brand';
import type { StyleItem } from './api';
import { styleName } from './StylePanel';
import { Check, HelpTip } from './ui';

const STEPS: Step[] = ['normalize', 'transcribe', 'faces', 'autoedit', 'ready'];
// A video from text has no face to find. 'voice' (the computer voice reads the script) comes first,
// only when she chose the computer voice. Not known later, so it shows while it runs or when asked.
const STORY_STEPS: Step[] = ['normalize', 'transcribe', 'autoedit', 'ready'];

export function StepList({ status, notes, story, aiVoice }: { status: Status; notes?: boolean; story?: boolean; aiVoice?: boolean }) {
  const { t } = useT();
  const steps = story ? (aiVoice || status.step === 'voice' ? ['voice' as Step, ...STORY_STEPS] : STORY_STEPS) : STEPS;
  const idx = steps.indexOf(status.step);
  if (status.step === 'queued') {
    return <p className="queued-line">{status.position ? fmt(t('waitingInLine'), { n: status.position }) : t('step_queued')}…</p>;
  }
  return (
    <ol className="steps">
      {steps.map((s, i) => {
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
            {notes && state === 'now' && s === 'transcribe' && !story && <span className="step-note">{t('longestStep')}</span>}
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
  const { brand } = useBrand();
  // Which sections: filmed videos ("Twórcy"), product videos, or both (then with headers).
  const showCreator = brand.use !== 'product';
  const showProduct = brand.use !== 'creator';
  const both = showCreator && showProduct;
  // A person is greeted by the first name; a product or company by its full name.
  const hello = brand.name.trim() ? (brand.use === 'creator' ? brand.name.trim().split(/\s+/)[0] : brand.name.trim()) : '';
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [up, setUp] = useState<{ name: string; progress: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState(false);
  // Reel (vertical, short) or a long YouTube video. Remembered on this Mac.
  const [format, setFormatState] = useState<Format>(() => {
    try {
      return localStorage.getItem('reel-studio-format') === 'long' ? 'long' : 'reel';
    } catch {
      return 'reel';
    }
  });
  const setFormat = (f: Format) => {
    setFormatState(f);
    try {
      localStorage.setItem('reel-studio-format', f);
    } catch {
      /* private window */
    }
  };
  const long = format === 'long';
  const [styles, setStyles] = useState<{ styles: StyleItem[]; defaultStyle: string } | null>(null);
  const [lookDone, setLookDone] = useState(true);
  // The video she just dropped, while it is being edited: a wide card with the time it takes.
  const [working, setWorking] = useState<{ slug: string; duration: number | null; since: number; long: boolean } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [working]);
  const dropDuration = useRef<number | null>(null);
  useEffect(() => {
    api.styles().then(setStyles).catch(() => {});
    api.look().then((r) => setLookDone(r.lookDone), () => {});
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
        setWorking(null);
        window.location.hash = `#/p/${mine.slug}`;
      } else if (mine && mine.status.step === 'error') {
        justUploaded.current = null;
        setWorking(null);
      }
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
    // Read the length on this computer (no upload needed) for the time estimate.
    dropDuration.current = null;
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const u = URL.createObjectURL(file);
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration > 0) {
          const d = v.duration;
          dropDuration.current = d;
          setWorking((w) => (w ? { ...w, duration: d } : w));
        }
        URL.revokeObjectURL(u);
      };
      v.onerror = () => URL.revokeObjectURL(u);
      v.src = u;
    } catch {
      /* no estimate then */
    }
    const job = upload<{ slug: string }>('/api/projects', 'video', [file], (p) => setUp({ name: file.name, progress: p }), {
      'X-File-Name': encodeURIComponent(file.name),
      // "Several reels" splits a phone video; it never applies to a long YouTube video.
      ...(long ? { 'x-format': 'long' } : batch ? { 'x-batch': '1' } : {}),
    });
    job.promise
      .then((r) => {
        justUploaded.current = r.slug;
        setWorking({ slug: r.slug, duration: dropDuration.current, since: Date.now(), long });
        return load();
      })
      .catch(() => setErr(t('uploadFailed')))
      .finally(() => setUp(null));
  };

  // "Choose your look": after her first reel is ready, until she has saved a look once.
  const firstReady = (projects ?? []).find((p) => p.status.step === 'ready' || p.status.step === 'cutout' || p.status.step === 'covers');
  const q = query.trim().toLowerCase();
  const workingReel = working ? (projects ?? []).find((p) => p.slug === working.slug) : undefined;
  const elapsed = working ? Math.floor((Date.now() - working.since) / 1000) : 0;
  const shown = (projects ?? []).filter((p) => !q || (p.title || '').toLowerCase().includes(q) || p.slug.includes(q));

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Reel Studio</span>
        </div>
        <TopRight />
      </header>

      <main className="home-main">
        <div className="home-hello">
          <h1 className="serif-title">{hello ? fmt(t('helloName'), { name: hello }) : t('hello')}</h1>
          <p className="muted">
            {t('helloSub')}
            {brand.handle && <span className="home-handle"> · {atHandle(brand.handle)}</span>}
          </p>
        </div>


        {showCreator && (
          <section className="home-section creator-section">
            {both && <h2 className="home-section-title">{t('secCreator')}</h2>}
            <div className="format-pick" role="radiogroup" aria-label={t('fmtQ')}>
              <span className="format-q">{t('fmtQ')}</span>
              {(['reel', 'long'] as const).map((f) => (
                <button key={f} role="radio" aria-checked={format === f} className={`format-opt ${format === f ? 'on' : ''}`} onClick={() => setFormat(f)} disabled={!!up}>
                  <span className={`format-shape ${f}`} aria-hidden />
                  <span className="format-text">
                    <span className="format-name">{f === 'long' ? t('fmtLong') : t('fmtReel')}</span>
                    <span className="format-sub">{f === 'long' ? t('fmtLongSub') : t('fmtReelSub')}</span>
                  </span>
                </button>
              ))}
              <span className="format-or" aria-hidden>
                {t('fmtOr')}
              </span>
              <button className="format-opt story-opt" onClick={() => go('/story')} disabled={!!up}>
                <span className="format-shape story" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="format-text">
                  <span className="format-name">{t('fmtStory')}</span>
                  <span className="format-sub">{t('fmtStorySub')}</span>
                </span>
                <span className="story-arrow" aria-hidden>
                  →
                </span>
              </button>
            </div>
            <div
              className={`dropzone ${over ? 'over' : ''} ${up ? 'busy' : ''} ${long ? 'long' : ''}`}
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
                    {long ? (
                      <svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <rect x="3" y="11" width="42" height="26" rx="4" />
                        <path d="M24 16v14M18 24l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <rect x="14" y="5" width="20" height="38" rx="4" />
                        <path d="M24 16v14M18 24l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="drop-title">{long ? t('dropTitleLong') : t('dropTitle')}</div>
                  <div className="muted">{long ? t('dropHintLong') : t('dropHint')}</div>
                </>
              )}
              {err && <div className="error-text">{err}</div>}
            </div>

            {!long && (
              <div className="batch-row">
                <Check checked={batch} onChange={setBatch} label={t('batchLabel')} />
                <HelpTip text={t('batchTip')} />
              </div>
        )}
          </section>
        )}

        {showProduct && (
          <section className="home-section product-section">
            {both && <h2 className="home-section-title">{t('secProduct')}</h2>}
            <button className="product-entry" onClick={() => go('/story/product')} disabled={!!up}>
              <span className="product-icon" aria-hidden>
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="9" width="38" height="26" rx="3" />
                  <path d="M5 15h38M17 41h14M24 35v6" />
                  <path d="M27 22l6 4-3 .8 1.8 3.4-1.6.8-1.8-3.4-2.2 2z" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="format-text">
                <span className="product-name">{t('productEntry')}</span>
                <span className="format-sub">{t('productEntrySub')}</span>
              </span>
              <span className="story-arrow" aria-hidden>
                →
              </span>
            </button>
          </section>
        )}

        {working && workingReel && workingReel.status.step !== 'ready' && workingReel.status.step !== 'error' && (
          <div className="working-card" role="status">
            <div className="working-text">
              <h2 className="serif-title">{working.long ? t('workingTitleLong') : t('workingTitle')}</h2>
              <p>
                {working.long
                  ? working.duration
                    ? // About 1 minute of waiting per 2 to 3 minutes of video (measured on her Mac).
                      fmt(t('workingTimeLong'), { a: Math.max(1, Math.round(working.duration / 180)), b: Math.max(2, Math.round(working.duration / 120)) })
                    : t('workingTimeLongGeneric')
                  : working.duration
                    ? fmt(t('workingTime'), { n: Math.max(1, Math.round(working.duration / 15)) })
                    : t('workingTimeGeneric')}
              </p>
              <p className="muted small">{fmt(t('workingElapsed'), { t: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` })}</p>
            </div>
            <StepList status={workingReel.status} notes />
          </div>
        )}

        {showCreator && !lookDone && firstReady && (
          <div className="look-invite">
            <div>
              <h2 className="serif-title">{t('lookHomeTitle')}</h2>
              <p className="muted">{t('lookHomeText')}</p>
            </div>
            <button className="btn primary" onClick={() => go(`/look/${encodeURIComponent(firstReady.slug)}`)}>
              {t('lookHomeBtn')}
            </button>
          </div>
        )}

        {/* Only after she saved her own look: before that, "My look" (with pictures) is the way to choose. */}
        {lookDone && styles && styles.styles.length > 0 && (
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
          <h2 className="serif-title">{t('yourVideos')}</h2>
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
  const long = p.format === 'long';
  const story = p.format === 'story';

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
    <article className={`reel-card ${ready ? 'ready' : ''} ${parent ? 'clip' : ''} ${busy ? 'busy' : ''} ${long ? 'long' : ''}`} onClick={() => ready && !renaming && go(`/p/${encodeURIComponent(p.slug)}`)}>
      <div className="thumb">
        {p.status.step !== 'uploading' && p.status.step !== 'normalize' && p.status.step !== 'voice' && !isError ? (
          <video src={`${urls.video}#t=0.5`} preload="metadata" muted playsInline />
        ) : (
          <div className="thumb-empty" />
        )}
        <span className={`yt-badge ${story ? (p.mode === 'product' ? 'product-badge' : 'story-badge') : long ? '' : 'reel-badge'}`}>
          {long ? t('ytBadge') : story ? (p.mode === 'product' ? t('productBadge') : t('storyBadge')) : t('reelBadge')}
        </span>
        {story && ready && <span className="story-thumb-title">{p.title || t('untitled')}</span>}
        {!ready && !isError && (
          <div className="thumb-over">
            <StepList status={p.status} story={story} />
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
          <div className="card-title">
            <span>{p.title || t('untitled')}</span>
            <button
              className="title-pencil small"
              title={t('rename')}
              aria-label={t('rename')}
              onClick={(e) => {
                e.stopPropagation();
                setName(p.title);
                setRenaming(true);
              }}
            >
              ✎
            </button>
          </div>
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
              {(() => {
                // No "Something went wrong: Something went wrong".
                const why = p.status.code || p.status.message ? errText(t, p.status.code, p.status.message) : '';
                const same = (a: string, b: string) => a.replace(/[.!…\s]+$/, '').toLowerCase() === b.replace(/[.!…\s]+$/, '').toLowerCase();
                return why && !same(why, t('step_error')) ? `: ${why}` : '';
              })()}
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
