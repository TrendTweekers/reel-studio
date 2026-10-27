// Panels only a long YouTube video has: chapters and on-screen extras, the YouTube texts and
// thumbnail, and Shorts (vertical reels made from one part of the long video).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edit, LongSettings, Word } from '../../src/shared/types';
import { FPS } from '../../src/shared/types';
import { chapterList, defaultLong, formatTime, fullDescription, outputChapters } from '../../src/shared/long';
import { outputToSource, sourceToOutput } from '../../src/shared/time';
import { api, HttpError, mediaUrls, type CoversState, type Step, type ThumbnailState } from './api';
import type { Change } from './Editor';
import { fmt, num, plural, useT } from './i18n';
import { Check, Group, HelpTip, Panel } from './ui';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Change edit.long, filling defaults when an older edit has none.
const setLongOn = (change: Change) => (patch: Partial<LongSettings>, key?: string) =>
  change((e) => ({ ...e, long: { ...defaultLong(), ...(e.long ?? {}), ...patch } }), key ? `long:${key}` : undefined);

// Output time of a source second as "12:34" (h:mm:ss for long videos), '—' after the last kept part.
const outTime = (src: number, edit: Edit) => {
  const o = sourceToOutput(src, edit.segments);
  return o === null ? '—' : formatTime(o);
};
const inKeptPart = (src: number, edit: Edit) => edit.segments.some((s) => src >= s.start - 0.01 && src <= s.end + 0.01);

// Copy text; select the box when the browser says no.
const useCopy = () => {
  const { t } = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string, box?: HTMLTextAreaElement | HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${id}:${t('copied')}`);
    } catch {
      box?.focus();
      box?.select();
      setCopied(`${id}:${t('copyFailed')}`);
    }
    setTimeout(() => setCopied(null), 2500);
  };
  const note = (id: string) => (copied?.startsWith(`${id}:`) ? copied.slice(id.length + 1) : null);
  return { copy, note };
};

// ---------------- Chapters & on-screen ----------------
export function ChaptersPanel({
  edit,
  change,
  frame,
  currentSource,
  seekSource,
}: {
  edit: Edit;
  change: Change;
  frame: number;
  currentSource: () => number;
  seekSource: (t: number) => void;
}) {
  const { t, lang } = useT();
  const long = { ...defaultLong(), ...(edit.long ?? {}) };
  const setLong = setLongOn(change);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // After "Add chapter here": put the cursor in that chapter's title (new or the one already there).
  useEffect(() => {
    if (focusAt === null) return;
    const el = listRef.current?.querySelector<HTMLInputElement>(`input[data-at="${focusAt}"]`);
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setFocusAt(null);
  });

  // Shown in time order; each row keeps its index in the stored list.
  const rows = useMemo(() => long.chapters.map((c, i) => ({ ...c, i })).sort((a, b) => a.at - b.at), [long.chapters]);
  const onYoutube = useMemo(() => new Set(outputChapters(edit).map((c) => c.source)), [edit]);
  const list = chapterList(edit);
  const usable = outputChapters(edit).length;

  const setChapter = (i: number, patch: Partial<{ at: number; title: string }>, key?: string) =>
    change(
      (e) => {
        const cur = e.long?.chapters ?? [];
        return { ...e, long: { ...defaultLong(), ...(e.long ?? {}), chapters: cur.map((c, k) => (k === i ? { ...c, ...patch } : c)) } };
      },
      key ? `chapter:${i}:${key}` : undefined,
    );
  const removeChapter = (i: number) =>
    change((e) => ({ ...e, long: { ...defaultLong(), ...(e.long ?? {}), chapters: (e.long?.chapters ?? []).filter((_, k) => k !== i) } }));
  const addHere = () => {
    const at = round2(currentSource());
    const near = long.chapters.find((c) => Math.abs(c.at - at) < 0.5);
    if (near) {
      setFocusAt(near.at);
      return;
    }
    change((e) => {
      const cur = e.long?.chapters ?? [];
      const chapters = [...cur, { at, title: '' }].sort((a, b) => a.at - b.at);
      return { ...e, long: { ...defaultLong(), ...(e.long ?? {}), chapters } };
    });
    setFocusAt(at);
  };

  const tag = long.nameTag ?? null;
  const setTag = (patch: Partial<NonNullable<LongSettings['nameTag']>>, key?: string) =>
    change(
      (e) => ({
        ...e,
        long: { ...defaultLong(), ...(e.long ?? {}), nameTag: { name: '', at: round2(currentSource()), duration: 4, ...(e.long?.nameTag ?? {}), ...patch } },
      }),
      key ? `nametag:${key}` : undefined,
    );

  const nowOut = frame / FPS;

  return (
    <Panel id="chapters" title={t('chapters')} hint={t('chaptersHint')}>
      {rows.length === 0 ? (
        <p className="empty-note">{t('chaptersEmpty')}</p>
      ) : (
        <ol className="chapter-list" ref={listRef}>
          {rows.map((c, k) => {
            const titled = !!c.title.trim();
            const skipped = titled && !onYoutube.has(c.at);
            const cut = !inKeptPart(c.at, edit);
            return (
              <li key={`${c.i}-${c.at}`} className={`chapter-row ${skipped || !titled ? 'warn' : ''}`}>
                <button className="chapter-time mono" onClick={() => seekSource(c.at)} title={t('chapterJump')}>
                  {k === 0 && onYoutube.has(c.at) ? '0:00' : outTime(c.at, edit)}
                </button>
                <div className="chapter-main">
                  <input
                    value={c.title}
                    placeholder={t('chapterTitlePh')}
                    data-at={c.at}
                    onChange={(e) => setChapter(c.i, { title: e.target.value }, 'title')}
                    aria-label={t('chapterTitlePh')}
                  />
                  {(!titled || skipped || cut || (k === 0 && sourceToOutput(c.at, edit.segments) !== 0 && onYoutube.has(c.at))) && (
                    <span className="chapter-note">
                      {!titled ? t('chapterNoTitle') : skipped ? t('chapterSkipped') : cut ? t('chapterCut') : t('chapterFirstZero')}
                    </span>
                  )}
                </div>
                <button className="icon-btn" onClick={() => seekSource(c.at)} aria-label={t('chapterJump')} title={t('chapterJump')}>
                  ▶
                </button>
                <button className="icon-btn danger" onClick={() => removeChapter(c.i)} aria-label={t('chapterDelete')} title={t('chapterDelete')}>
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {!list && (
        <p className="warn-text chapters-warn">{fmt(t('chaptersWarn'), { n: plural(usable, lang, t, 'chapter') })}</p>
      )}
      <button className="btn" onClick={addHere}>
        + {fmt(t('chapterAddHere'), { t: formatTime(nowOut) })}
      </button>

      <Group label={t('onScreen')}>
        <div className="onscreen-checks">
          <Check checked={long.chapterCards} label={t('longChapterCards')} onChange={(v) => setLong({ chapterCards: v })} />
          <span className="row-tip">
            <Check checked={long.subtitles} label={t('longSubtitles')} onChange={(v) => setLong({ subtitles: v })} />
            <HelpTip text={t('longSubtitlesTip')} />
          </span>
          <Check checked={long.zoomJumps} label={t('longZoom')} onChange={(v) => setLong({ zoomJumps: v })} />
        </div>
      </Group>

      <Group label={t('nameTag')}>
        <p className="muted small tight">{t('nameTagHint')}</p>
        {tag ? (
          <div className="nametag-edit">
            <div className="fx-grid">
              <label className="field">
                <span>{t('nameTagName')}</span>
                <input value={tag.name} onChange={(e) => setTag({ name: e.target.value }, 'name')} />
              </label>
              <label className="field">
                <span>{t('nameTagLine')}</span>
                <input value={tag.line ?? ''} placeholder={t('nameTagLinePh')} onChange={(e) => setTag({ line: e.target.value || undefined }, 'line')} />
              </label>
            </div>
            <div className="fx-grid">
              <div className="field">
                <span>{fmt(t('nameTagAt'), { t: outTime(tag.at, edit) })}</span>
                <div className="row gap">
                  <button className="btn" onClick={() => setTag({ at: round2(currentSource()) })}>
                    ◎ {t('nameTagHere')}
                  </button>
                  <button className="link-btn" onClick={() => seekSource(tag.at)}>
                    {t('chapterJump')}
                  </button>
                </div>
              </div>
              <label className="field">
                <span>
                  {t('duration')} <b>{num(tag.duration, lang, 1)} s</b>
                </span>
                <input type="range" min={2} max={8} step={0.5} value={tag.duration} onChange={(e) => setTag({ duration: Number(e.target.value) }, 'duration')} />
              </label>
            </div>
            <button className="link-btn danger" onClick={() => setLong({ nameTag: null })}>
              {t('nameTagRemove')}
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => setTag({})}>
            + {t('nameTagAdd')}
          </button>
        )}
      </Group>
    </Panel>
  );
}

// ---------------- YouTube: title, description, thumbnail ----------------
export function YoutubePanel({
  slug,
  edit,
  change,
  step,
  bump,
  currentSource,
  flush,
  onAsk,
  askRunning,
}: {
  slug: string;
  edit: Edit;
  change: Change;
  step: Step | undefined;
  bump: number;
  currentSource: () => number;
  flush: () => Promise<void>;
  onAsk: () => void;
  askRunning: boolean;
}) {
  const { t } = useT();
  const long = { ...defaultLong(), ...(edit.long ?? {}) };
  const setLong = setLongOn(change);
  const { copy, note } = useCopy();
  const titleBox = useRef<HTMLInputElement>(null);
  const descBox = useRef<HTMLTextAreaElement>(null);
  const title = long.title ?? '';
  const full = fullDescription(edit);
  const hasList = !!chapterList(edit);

  return (
    <Panel id="youtube" title={t('grp_youtube')} hint={t('ytHint')}>
      <button className="btn ask-yt" onClick={onAsk} disabled={askRunning}>
        <span className="ask-spark" aria-hidden>
          ✦
        </span>
        {t('ytAsk')}
      </button>
      <label className="field">
        <span className="field-row">
          {t('ytTitle')}
          <span className={`char-count ${title.length > 100 ? 'over' : ''}`}>{title.length} / 100</span>
        </span>
        <input ref={titleBox} className="big-input" value={title} onChange={(e) => setLong({ title: e.target.value || undefined }, 'title')} />
      </label>
      {title.length > 100 && <p className="error-text tight">{t('ytTitleLong')}</p>}
      <div className="row gap">
        <button className="btn" onClick={() => void copy('title', title, titleBox.current)} disabled={!title.trim()}>
          ⧉ {t('ytCopyTitle')}
        </button>
        {note('title') && <span className="muted small">{note('title')}</span>}
      </div>
      <label className="field">
        <span>{t('ytDesc')}</span>
        <textarea rows={5} value={long.description ?? ''} onChange={(e) => setLong({ description: e.target.value || undefined }, 'description')} />
      </label>
      <p className="muted small tight">{t('ytDescHint')}</p>
      <Group label={t('ytFull')}>
        {full ? <textarea ref={descBox} className="yt-full" readOnly rows={Math.min(14, full.split('\n').length + 1)} value={full} /> : <p className="empty-note">{t('ytFullEmpty')}</p>}
        {!hasList && full && <p className="warn-text small">{t('ytNoChapterList')}</p>}
        <div className="row gap">
          <button className="btn primary" onClick={() => void copy('desc', full, descBox.current)} disabled={!full}>
            ⧉ {t('ytCopyDesc')}
          </button>
          {note('desc') && <span className="muted small">{note('desc')}</span>}
        </div>
      </Group>
      <ThumbnailBlock slug={slug} edit={edit} change={change} step={step} bump={bump} currentSource={currentSource} flush={flush} />
    </Panel>
  );
}

function ThumbnailBlock({
  slug,
  edit,
  change,
  step,
  bump,
  currentSource,
  flush,
}: {
  slug: string;
  edit: Edit;
  change: Change;
  step: Step | undefined;
  bump: number;
  currentSource: () => number;
  flush: () => Promise<void>;
}) {
  const { t } = useT();
  const [covers, setCovers] = useState<CoversState | null>(null);
  const [thumb, setThumb] = useState<ThumbnailState | null>(null);
  const [missing, setMissing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);
  const th = edit.long?.thumbnail;
  const setThumbField = (patch: Partial<NonNullable<LongSettings['thumbnail']>>, key?: string) =>
    change(
      (e) => ({ ...e, long: { ...defaultLong(), ...(e.long ?? {}), thumbnail: { t: 0, ...(e.long?.thumbnail ?? {}), ...patch } } }),
      key ? `thumb:${key}` : undefined,
    );
  const pick = (time: number) =>
    change((e) => ({
      ...e,
      long: { ...defaultLong(), ...(e.long ?? {}), thumbnail: { title: e.long?.title?.slice(0, 40), ...(e.long?.thumbnail ?? {}), t: round2(time) } },
    }));

  const loadThumb = async () => {
    try {
      const s = await api.thumbnail(slug);
      setThumb(s);
      setMissing(false);
      return s;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) setMissing(true);
      return null;
    }
  };
  useEffect(() => {
    api.covers(slug).then(setCovers, () => {});
    void loadThumb().then((s) => s?.rendering && setRendering(true));
    if (step !== 'covers') setFinding(false);
  }, [slug, step, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while the thumbnail renders.
  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(async () => {
      const s = await loadThumb();
      if (!s || !s.rendering) {
        setRendering(false);
        setStamp(Date.now());
        if (s?.error) setErr(t('coverFailed'));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [rendering]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = async () => {
    setErr(null);
    setFinding(true);
    try {
      await api.findCovers(slug);
    } catch {
      setFinding(false);
      setErr(t('coverFailed'));
    }
  };
  const make = async () => {
    setErr(null);
    try {
      await flush();
      await api.renderThumbnail(slug);
      setRendering(true);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) setMissing(true);
      else setErr(t('coverFailed'));
    }
  };

  const candidates = [...(covers?.candidates ?? [])].sort((a, b) => b.score - a.score);
  const busyFinding = finding || step === 'covers';
  const frameImg = th ? candidates.find((c) => Math.abs(c.t - th.t) < 0.05)?.url : undefined;
  const bust = (u: string) => `${u}${u.includes('?') ? '&' : '?'}v=${stamp}`;

  return (
    <Group label={t('thumb')}>
      <p className="muted small tight">{t('thumbHint')}</p>
      {busyFinding ? (
        <div className="cover-finding">
          <span className="spinner" aria-hidden />
          {t('step_covers')}…
        </div>
      ) : candidates.length ? (
        <div className="cover-cands wide">
          {candidates.map((c, i) => (
            <button key={c.file} className={`cover-cand ${th && Math.abs(th.t - c.t) < 0.05 ? 'on' : ''}`} onClick={() => pick(c.t)}>
              <img src={c.url} alt="" loading="lazy" />
              {i === 0 && <span className="used-tag">{t('coverBest')}</span>}
              <span className="cand-time">{outTime(c.t, edit)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="row gap cover-actions">
        <button className="btn" onClick={find} disabled={busyFinding}>
          ✦ {candidates.length ? t('coverFindAgain') : t('coverFind')}
        </button>
        <button className="btn" onClick={() => pick(currentSource())}>
          ◎ {t('coverUseCurrent')}
        </button>
      </div>
      {th && (
        <div className="thumb-edit">
          <ThumbPreview slug={slug} edit={edit} img={frameImg} />
          <div className="cover-fields">
            <label className="field">
              <span>{t('hookText')}</span>
              <input className="big-input" value={th.title ?? ''} onChange={(e) => setThumbField({ title: e.target.value || undefined }, 'title')} />
            </label>
            <label className="field">
              <span>{t('hookAccent')}</span>
              <input className="big-input italic" value={th.accent ?? ''} onChange={(e) => setThumbField({ accent: e.target.value || undefined }, 'accent')} />
            </label>
            <p className="muted small">{fmt(t('thumbFrameAt'), { t: outTime(th.t, edit) })}</p>
            {missing ? (
              <p className="warn-text">{t('thumbMissing')}</p>
            ) : (
              <button className="btn primary huge" onClick={make} disabled={rendering}>
                {rendering ? t('thumbMaking') : t('thumbMake')}
              </button>
            )}
          </div>
        </div>
      )}
      {err && <p className="error-text">{err}</p>}
      {!rendering && thumb?.url && (
        <figure className="thumb-result">
          <img src={bust(thumb.url)} alt="" />
          <figcaption>
            <span>{t('thumbResult')}</span>
            <a href={thumb.url} download>
              ↓ {t('download')}
            </a>
          </figcaption>
        </figure>
      )}
    </Group>
  );
}

// CSS approximation of the 16:9 thumbnail: the frame plus the title in the hook font.
function ThumbPreview({ slug, edit, img }: { slug: string; edit: Edit; img?: string }) {
  const th = edit.long?.thumbnail;
  const video = useRef<HTMLVideoElement>(null);
  const at = th?.t ?? 0;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const seek = () => {
      try {
        v.currentTime = at;
      } catch {
        /* ignore */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
  }, [at, img]);
  const st = edit.style;
  return (
    <div className="thumb-preview">
      {img ? <img src={img} alt="" /> : <video ref={video} src={mediaUrls(slug).video} muted playsInline preload="auto" />}
      {(th?.title || th?.accent) && (
        <div className="thumb-title" style={{ fontFamily: `'${st.hookFont}', serif`, color: st.hookColor }}>
          {th.title && <div className="ct-main">{th.title}</div>}
          {th.accent && <div className="ct-accent">{th.accent}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------- Shorts ----------------
export type ShortRange = { start: number; end: number; title?: string };

// Seconds of a source range that survive the cuts.
const keptSeconds = (start: number, end: number, edit: Edit) =>
  edit.segments.reduce((sum, s) => sum + Math.max(0, Math.min(end, s.end) - Math.max(start, s.start)), 0);

export function ShortsPanel({
  slug,
  edit,
  words,
  range,
  setRange,
  currentSource,
  seekSource,
  flush,
  onMade,
  goHome,
}: {
  slug: string;
  edit: Edit;
  words: Word[];
  range: ShortRange | null;
  setRange: (r: ShortRange | null) => void;
  currentSource: () => number;
  seekSource: (t: number) => void;
  flush: () => Promise<void>;
  onMade: (title: string) => void;
  goHome: () => void;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const chapters = outputChapters(edit);
  const lastEnd = edit.segments.length ? edit.segments[edit.segments.length - 1].end : edit.source.duration;
  const endOf = (k: number) => (k + 1 < chapters.length ? chapters[k + 1].source : lastEnd);
  // Chapters are on the output timeline; the first one may sit at 0:00 while its source starts later.
  const startOf = (k: number) => (k === 0 ? Math.min(chapters[0].source, outputToSource(0, edit.segments)) : chapters[k].source);

  // A name from the words in the range, when she did not give one.
  const autoTitle = (r: ShortRange) => {
    const ws = words.filter((w) => w.start >= r.start - 0.05 && w.end <= r.end + 0.05).slice(0, 7);
    return ws.map((w) => w.text).join(' ').replace(/[.,!?…]+$/, '');
  };
  const title = range ? (range.title ?? autoTitle(range)) : '';
  const len = range ? keptSeconds(range.start, range.end, edit) : 0;
  const tooLong = len > 180;
  const tooShort = !!range && len < 5;

  const set = (patch: Partial<ShortRange>) => {
    setMade(null);
    setErr(null);
    const base = range ?? { start: currentSource(), end: Math.min(lastEnd, currentSource() + 45) };
    setRange({ ...base, ...patch });
  };

  const make = async () => {
    if (!range || tooLong || tooShort) return;
    setBusy(true);
    setErr(null);
    try {
      await flush();
      const name = title.trim() || edit.title;
      await api.clip(slug, round2(range.start), round2(range.end), name);
      setMade(name);
      onMade(name);
    } catch {
      setErr(t('shortFailed'));
    } finally {
      setBusy(false);
    }
  };

  const lenText = len >= 60 ? `${Math.floor(len / 60)} min ${Math.round(len % 60)} s` : `${num(Math.round(len), lang, 0)} s`;

  return (
    <Panel id="shorts" title={t('shortsTitle')} hint={t('shortsHint')}>
      {chapters.length > 0 && (
        <Group label={t('shortsFromChapter')}>
          <div className="chips">
            {chapters.map((c, k) => {
              const on = !!range && Math.abs(range.start - startOf(k)) < 0.05 && Math.abs(range.end - endOf(k)) < 0.05;
              return (
                <button key={c.source} className={`chip ${on ? 'on' : ''}`} onClick={() => (setMade(null), setRange({ start: startOf(k), end: endOf(k), title: c.title }))}>
                  {formatTime(c.at)} · {c.title}
                </button>
              );
            })}
          </div>
        </Group>
      )}
      <p className="muted small">{t('shortsOr')}</p>
      <div className="row gap">
        <button className="btn" onClick={() => set({ start: round2(currentSource()) })}>
          ⇤ {t('shortStartHere')}
        </button>
        <button className="btn" onClick={() => set({ end: round2(currentSource()) })}>
          {t('shortEndHere')} ⇥
        </button>
      </div>
      {range ? (
        <div className="short-pick">
          <p className="serif-line">
            <button className="link-btn" onClick={() => seekSource(range.start)}>
              {fmt(t('shortPart'), { a: outTime(range.start, edit), b: outTime(range.end, edit), len: lenText })}
            </button>
          </p>
          {range.end <= range.start ? (
            <p className="warn-text">{t('shortTooShort')}</p>
          ) : tooLong ? (
            <p className="warn-text">{t('shortTooLong')}</p>
          ) : tooShort ? (
            <p className="warn-text">{t('shortTooShort')}</p>
          ) : null}
          <label className="field">
            <span>{t('shortTitle')}</span>
            <input value={title} onChange={(e) => setRange({ ...range, title: e.target.value })} />
          </label>
          <button className="btn primary huge" onClick={make} disabled={busy || tooLong || tooShort}>
            {busy ? t('makingShort') : t('shortMake')}
          </button>
        </div>
      ) : (
        <p className="empty-note">{t('shortNone')}</p>
      )}
      {err && <p className="error-text">{err}</p>}
      {made && (
        <div className="short-done">
          <p>✓ {fmt(t('shortDone'), { t: made })}</p>
          <button className="link-btn" onClick={goHome}>
            {t('shortGoHome')} →
          </button>
        </div>
      )}
    </Panel>
  );
}
