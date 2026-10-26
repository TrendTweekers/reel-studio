import { useRef, useState } from 'react';
import type { Edit } from '../../src/shared/types';
import { HOOK_FONTS, SFX_NAMES, SUBTITLE_FONTS } from '../../src/shared/types';
import { api, upload, type FileItem, type Problem, type RenderInfo, type SfxItem } from './api';
import type { Change, RenderJob, UsedBy } from './Editor';
import { errText, fmt, FONT_CAPTIONS, sfxLabel, useT, type StrKey } from './i18n';
import { Check, Chips, Group, HelpTip, Panel, playPreview } from './ui';

type P = { edit: Edit; change: Change };

// ---------------- Hook ----------------
export function HookPanel({ edit, change }: P) {
  const { t } = useT();
  const hook = edit.hook;
  const set = (patch: Partial<NonNullable<Edit['hook']>>, key: string) =>
    change((e) => ({ ...e, hook: { text: '', until: 2.5, ...(e.hook ?? {}), ...patch } }), `hook:${key}`);
  return (
    <Panel
      id="hook"
      title={t('hook')}
      hint={t('hookHint')}
      aside={<Check checked={!!hook} label={t('hookOn')} onChange={(v) => change((e) => ({ ...e, hook: v ? { text: '', until: 2.5 } : null }))} />}
    >
      {hook && (
        <div className="hook-fields">
          <label className="field">
            <span>{t('hookText')}</span>
            <input className="big-input" value={hook.text} onChange={(e) => set({ text: e.target.value }, 'text')} />
          </label>
          <label className="field">
            <span>{t('hookAccent')}</span>
            <input className="big-input italic" value={hook.accent ?? ''} onChange={(e) => set({ accent: e.target.value || undefined }, 'accent')} />
          </label>
          <label className="field">
            <span>{t('hookSub')}</span>
            <input value={hook.sub ?? ''} onChange={(e) => set({ sub: e.target.value || undefined }, 'sub')} />
          </label>
          <label className="field">
            <span>
              {t('hookUntil')} <b>{hook.until.toFixed(1)} s</b>
            </span>
            <input type="range" min={0.5} max={8} step={0.1} value={hook.until} onChange={(e) => set({ until: Number(e.target.value) }, 'until')} />
          </label>
        </div>
      )}
    </Panel>
  );
}

// ---------------- Fonts ----------------
const SWATCHES = [
  { c: '#f3e9a6', n: 'sw_cream_yellow' },
  { c: '#f6f1ea', n: 'sw_cream' },
  { c: '#ffffff', n: 'sw_white' },
  { c: '#e8b4bc', n: 'sw_blush' },
  { c: '#c9a27e', n: 'sw_caramel' },
  { c: '#000000', n: 'sw_black' },
] as const;

function FontButtons<F extends string>({ fonts, value, onPick, sample, three }: { fonts: readonly F[]; value: F; onPick: (f: F) => void; sample: (f: F) => string; three?: boolean }) {
  const { t, lang } = useT();
  return (
    <div className={`font-grid ${three ? 'three' : ''}`}>
      {fonts.map((f) => (
        <button key={f} className={`font-btn ${f === value ? 'on' : ''}`} onClick={() => onPick(f)}>
          <span className="font-sample" style={{ fontFamily: `'${f}', ${f === 'Courier Prime' ? 'monospace' : 'serif'}` }}>
            {sample(f)}
          </span>
          <span className="font-cap">{f === value ? t('currentChoice') : FONT_CAPTIONS[lang][f] ?? ''}</span>
          <span className="font-name">{f}</span>
        </button>
      ))}
    </div>
  );
}

export function FontsPanel({ edit, change }: P) {
  const { t } = useT();
  const st = edit.style;
  const setStyle = (patch: Partial<Edit['style']>, key?: string) => change((e) => ({ ...e, style: { ...e.style, ...patch } }), key);
  const custom = !SWATCHES.some((s) => s.c.toLowerCase() === st.hookColor.toLowerCase());
  return (
    <Panel id="fonts" title={t('fonts')}>
      <Group label={t('hookFont')}>
        <FontButtons fonts={HOOK_FONTS} value={st.hookFont} onPick={(f) => setStyle({ hookFont: f })} sample={() => 'Aa Ślicznie'} three />
      </Group>
      <Group label={t('hookColour')}>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <button
              key={s.c}
              className={`swatch ${s.c.toLowerCase() === st.hookColor.toLowerCase() ? 'on' : ''}`}
              style={{ background: s.c }}
              title={t(s.n)}
              aria-label={t(s.n)}
              onClick={() => setStyle({ hookColor: s.c })}
            />
          ))}
          <label className={`swatch custom ${custom ? 'on' : ''}`} title={t('custom')} style={custom ? { background: st.hookColor } : undefined}>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(st.hookColor) ? st.hookColor : '#7b2d3b'} onChange={(e) => setStyle({ hookColor: e.target.value }, 'hookColor')} />
            {!custom && <span>+</span>}
          </label>
          <span className="muted small">{custom ? `${t('custom')} ${st.hookColor}` : ''}</span>
        </div>
      </Group>
      <Group label={t('subtitlesFont')}>
        <FontButtons fonts={SUBTITLE_FONTS} value={st.subtitleFont} onPick={(f) => setStyle({ subtitleFont: f })} sample={() => 'Aa Ąę'} />
      </Group>
      <Group label={t('subtitleStyle')}>
        <Chips
          value={st.subtitleStyle}
          options={(['clean', 'box', 'karaoke', 'pop', 'off'] as const).map((v) => ({ value: v, label: t(`sub_${v}` as StrKey) }))}
          onChange={(v) => setStyle({ subtitleStyle: v })}
        />
      </Group>
      <Group label={t('position')}>
        <Chips
          value={st.subtitlePosition}
          options={(['lower', 'middle', 'above-head'] as const).map((v) => ({ value: v, label: t(`pos_${v}` as StrKey) }))}
          onChange={(v) => setStyle({ subtitlePosition: v })}
        />
      </Group>
    </Panel>
  );
}

// ---------------- Board ----------------
export function BoardPanel({
  board,
  setBoard,
  usedBy,
}: {
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  usedBy: UsedBy;
}) {
  const { t } = useT();
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const send = (files: File[]) => {
    if (!files.length) return;
    setProgress(0);
    setUpErr(null);
    upload('/api/board', 'images', files, setProgress)
      .promise.then(() => api.board().then(setBoard))
      .catch((e: Error & { code?: string; serverText?: string }) => setUpErr(errText(t, e.code, e.serverText) || t('uploadFailed')))
      .finally(() => setProgress(null));
  };
  return (
    <Panel
      id="board"
      title={t('board')}
      hint={t('boardHint')}
      aside={
        <button className="btn" onClick={() => input.current?.click()} disabled={progress !== null}>
          + {t('addPictures')}
        </button>
      }
    >
      <input ref={input} type="file" accept="image/*,.heic,.HEIC" multiple hidden onChange={(e) => (send(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      {progress !== null && (
        <div className="bar">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {upErr && <p className="error-text">{upErr}</p>}
      <div
        className="board-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          send(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')));
        }}
      >
        {!board.length && <p className="muted">{t('boardEmpty')}</p>}
        {board.map((b) => (
          <div key={b.file} className="board-item static">
            <img src={b.url} alt={b.file} loading="lazy" />
            {(usedBy.get(b.file) ?? []).length > 0 && <span className="used-tag">{t('used')}</span>}
            <button
              className="del"
              aria-label={t('delete')}
              onClick={async () => {
                const users = usedBy.get(b.file) ?? [];
                const q = users.length ? fmt(t('pictureUsedIn'), { list: users.join(', ') }) : t('deletePictureQ');
                if (!confirm(q)) return;
                try {
                  await api.deleteBoard(b.file);
                  setBoard(await api.board());
                } catch {
                  /* ignore */
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------- Sound effects ----------------
export function SfxPanel({ edit, change, sfx }: P & { sfx: SfxItem[] }) {
  const { t } = useT();
  const [playing, setPlaying] = useState<string | null>(null);
  const url = (n: string) => sfx.find((s) => s.name === n || s.name.replace(/\.[a-z0-9]+$/i, '') === n)?.url;
  return (
    <Panel id="sfx" title={t('soundEffects')} hint={t('sfxHint')} aside={<Check checked={edit.sound.effects} label={t('sfxOn')} onChange={(v) => change((e) => ({ ...e, sound: { ...e.sound, effects: v } }))} />}>
      <div className="sfx-grid">
        {SFX_NAMES.map((n) => {
          const u = url(n);
          return (
            <button
              key={n}
              className={`sfx-btn ${playing === n ? 'playing' : ''}`}
              disabled={!u}
              onClick={() => {
                if (!u) return;
                const on = playPreview(u, () => setPlaying(null));
                setPlaying(on ? n : null);
              }}
            >
              <span className="sfx-wave" aria-hidden>
                {playing === n ? '❚❚' : '▶'}
              </span>
              {sfxLabel(t, n)}
            </button>
          );
        })}
      </div>
      <Group label={t('sfxForPicture')}>
        <Chips value={edit.sound.defaultSfx} options={SFX_NAMES.map((n) => ({ value: n, label: sfxLabel(t, n) }))} onChange={(v) => change((e) => ({ ...e, sound: { ...e.sound, defaultSfx: v } }))} />
      </Group>
    </Panel>
  );
}

// ---------------- Music ----------------
export function MusicPanel({ edit, change, music, setMusic }: P & { music: FileItem[]; setMusic: (m: FileItem[]) => void }) {
  const { t } = useT();
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const setSound = (patch: Partial<Edit['sound']>, key?: string) => change((e) => ({ ...e, sound: { ...e.sound, ...patch } }), key);
  const send = (files: File[]) => {
    if (!files.length) return;
    setProgress(0);
    upload('/api/music', 'files', files, setProgress)
      .promise.then(() => api.music().then(setMusic))
      .catch(() => {})
      .finally(() => setProgress(null));
  };
  return (
    <Panel
      id="music"
      title={t('music')}
      hint={t('musicNote')}
      aside={
        <button className="btn" onClick={() => input.current?.click()} disabled={progress !== null}>
          + {t('uploadMusic')}
        </button>
      }
    >
      <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => (send(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      {progress !== null && (
        <div className="bar">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <ul className="music-list">
        <li className={`music-item ${!edit.sound.music ? 'on' : ''}`}>
          <button className="music-pick" onClick={() => setSound({ music: null })}>
            <span className="radio" aria-hidden />
            {t('noMusic')}
          </button>
        </li>
        {music.map((m) => (
          <li key={m.file} className={`music-item ${edit.sound.music === m.file ? 'on' : ''}`}>
            <button className="music-pick" onClick={() => setSound({ music: m.file })}>
              <span className="radio" aria-hidden />
              {m.file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')}
            </button>
            <button
              className="icon-btn"
              aria-label={t('play')}
              onClick={() => {
                const on = playPreview(m.url, () => setPlaying(null));
                setPlaying(on ? m.file : null);
              }}
            >
              {playing === m.file ? '❚❚' : '▶'}
            </button>
          </li>
        ))}
      </ul>
      {!music.length && <p className="muted small">{t('musicEmpty')}</p>}
      <div className="fx-grid">
        <label className="field">
          <span>
            {t('volume')} <b>{Math.round(edit.sound.musicVolume * 100)}%</b>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={edit.sound.musicVolume} onChange={(e) => setSound({ musicVolume: Number(e.target.value) }, 'musicVolume')} />
        </label>
        <div className="field center-v">
          <Check checked={edit.sound.duck} label={t('duck')} onChange={(v) => setSound({ duck: v })} />
        </div>
      </div>
    </Panel>
  );
}

// ---------------- Vibe ----------------
const VIBE_SWATCH: Record<Edit['style']['vibe'], string> = {
  clean: 'linear-gradient(135deg,#fdfbf7,#e9e2d8)',
  film: 'linear-gradient(135deg,#d9b98c,#8a6a4b)',
  glow: 'radial-gradient(circle at 40% 30%,#fff6e8,#f0c9cf 55%,#c9a3b8)',
  editorial: 'linear-gradient(135deg,#1b1b1b,#6d6d6d 60%,#f6f1ea)',
};

export function VibePanel({ edit, change }: P) {
  const { t } = useT();
  const setStyle = (patch: Partial<Edit['style']>) => change((e) => ({ ...e, style: { ...e.style, ...patch } }));
  const setTog = (patch: Partial<Edit['toggles']>) => change((e) => ({ ...e, toggles: { ...e.toggles, ...patch } }));
  return (
    <Panel id="vibe" title={t('vibe')}>
      <div className="vibe-grid">
        {(['clean', 'film', 'glow', 'editorial'] as const).map((v) => (
          <button key={v} className={`vibe ${edit.style.vibe === v ? 'on' : ''}`} onClick={() => setStyle({ vibe: v })}>
            <span className="vibe-swatch" style={{ background: VIBE_SWATCH[v] }} />
            <span className="vibe-name">{t(`vibe_${v}` as StrKey)}</span>
            <span className="font-cap">{edit.style.vibe === v ? t('currentChoice') : t(`vibeCap_${v}` as StrKey)}</span>
          </button>
        ))}
      </div>
      <div className="row gap">
        <Check checked={edit.toggles.grain} label={t('grain')} onChange={(v) => setTog({ grain: v })} />
        <Check checked={edit.toggles.progressBar} label={t('progressBar')} onChange={(v) => setTog({ progressBar: v })} />
      </div>
    </Panel>
  );
}

// ---------------- Pauses ----------------
export function PausesPanel({ runAutoedit, onSplit, splitting }: { runAutoedit: (gap: number) => Promise<void>; onSplit?: () => void; splitting?: boolean }) {
  const { t } = useT();
  const [tight, setTight] = useState(0.5); // 0 = relaxed (0.6 s), 1 = tight (0.25 s)
  const [busy, setBusy] = useState(false);
  const gap = Math.round((0.6 - tight * 0.35) * 100) / 100;
  return (
    <Panel id="pauses" title={t('pauses')} hint={t('cutAgainNote')}>
      <div className="field">
        <span>
          {t('howTight')} <b>{gap.toFixed(2)} s</b>
        </span>
        <div className="range-labels">
          <span>{t('relaxed')}</span>
          <input type="range" min={0} max={1} step={0.01} value={tight} onChange={(e) => setTight(Number(e.target.value))} />
          <span>{t('tight')}</span>
        </div>
      </div>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await runAutoedit(gap);
          } catch {
            /* ignore */
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '…' : '✂ ' + t('cutAgain')}
      </button>
      {onSplit && (
        <div className="split-row">
          <button className="link-btn" onClick={onSplit} disabled={splitting}>
            {splitting ? '…' : `⫽ ${t('splitLink')}`}
          </button>
          <HelpTip text={t('batchTip')} />
        </div>
      )}
    </Panel>
  );
}

// ---------------- Render ----------------
const isTiktokFile = (f: string) => / TikTok\.mp4$/i.test(f);

function JobBlock({ slug, job, label, primary }: { slug: string; job: RenderJob; label: string; primary: boolean }) {
  const { t } = useT();
  const r = job.render;
  const running = !!r?.running;
  const pct = Math.round((r?.progress ?? 0) * 100);
  const err = !running && r?.error ? errText(t, r.code, r.error) || t('renderFailed') : null;
  return (
    <div className="job">
      {!running ? (
        <button className={`btn ${primary ? 'primary' : 'secondary'} huge`} onClick={() => void job.start()} disabled={job.starting}>
          {job.starting ? t('making') : label}
        </button>
      ) : (
        <div className="render-progress">
          <div className="muted">{pct === 0 ? t('preparing') : r?.stage && /sound/i.test(r.stage) ? t('finishingSound') : t('making')}</div>
          <div className="bar big">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="mono">{pct}%</div>
        </div>
      )}
      {(job.startErr || err) && <p className="error-text">{job.startErr ?? err}</p>}
      {!running && job.justDone && (
        <div className="render-done">
          <p className="serif-line">✓ {t('renderDone')}</p>
          <div className="row gap">
            {r?.url && (
              <a className="btn download" href={r.url} download>
                ↓ {t('download')}
              </a>
            )}
            <button className="btn" onClick={() => void api.reveal(slug, job.justDone!).catch(() => {})}>
              {t('showInFinder')}
            </button>
          </div>
          <p className="muted small">{t('airdropHint')}</p>
        </div>
      )}
    </div>
  );
}

export function RenderPanel({
  slug,
  jobs,
  renders,
  problems,
  onFix,
  lastChange,
}: {
  slug: string;
  jobs: { instagram: RenderJob; tiktok: RenderJob };
  renders: RenderInfo[];
  problems: Problem[] | null;
  onFix: (effectId?: string) => void;
  lastChange: number;
}) {
  const { t, lang } = useT();
  const sorted = [...renders].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const reveal = (file: string) => void api.reveal(slug, file).catch(() => {});
  const latest = (v: 'instagram' | 'tiktok') => jobs[v].render;

  return (
    <Panel id="render" title={t('render')}>
      {problems && (
        <div className={`check-box ${problems.length ? 'warn' : 'ok'}`}>
          <div className="group-label">{t('checkTitle')}</div>
          {problems.length === 0 ? (
            <p className="small">✓ {t('checkOk')}</p>
          ) : (
            <ul>
              {problems.map((p, i) => (
                <li key={i}>
                  <span>
                    {errText(t, p.code, p.text)}
                    {p.detail && <span className="muted small"> ({p.detail})</span>}
                  </span>
                  {p.effectId && (
                    <button className="link-btn" onClick={() => onFix(p.effectId)}>
                      {t('fix')} →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="jobs">
        <JobBlock slug={slug} job={jobs.instagram} label={t('makeInstagram')} primary />
        <JobBlock slug={slug} job={jobs.tiktok} label={t('makeTiktok')} primary={false} />
      </div>
      {sorted.length > 0 && (
        <Group label={t('earlierRenders')}>
          <ul className="renders">
            {sorted.map((r) => {
              const tk = isTiktokFile(r.file);
              const job = latest(tk ? 'tiktok' : 'instagram');
              const older = (job?.editChangedSince && r.file === job.file) || (lastChange > 0 && new Date(r.createdAt).getTime() < lastChange - 2000);
              return (
                <li key={r.file}>
                  <span>
                    {new Date(r.createdAt).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {tk && <span className="tk-tag">{t('tiktokTag')}</span>}
                    {older && <span className="older-tag">{t('olderThanChange')}</span>}
                  </span>
                  <span className="muted small">{r.file}</span>
                  <span className="render-links">
                    <button className="link-btn" onClick={() => reveal(r.file)}>
                      {t('showInFinder')}
                    </button>
                    <a href={r.url} download>
                      {t('download')}
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </Group>
      )}
    </Panel>
  );
}
