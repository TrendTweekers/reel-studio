import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edit, EffectKind, Word } from '../../src/shared/types';
import { FPS, LONG_KINDS, NEEDS_CUTOUT } from '../../src/shared/types';
import { outputToSource, sourceToOutput } from '../../src/shared/time';
import type { FileItem } from './api';
import type { Change } from './Editor';
import { cutRange, isWordKept, keepRange, KIND_ICON, newEffect, sortEffects } from './editState';
import { fmt, useT, type StrKey } from './i18n';
import { PictureGrid } from './PictureGrid';
import { fmtTime, Panel } from './ui';

const ACTIONS: EffectKind[] = ['picture', 'label', 'zoom', 'glass', 'behind', 'chapter', 'emoji', 'checklist', 'flash'];
// Bigger moments: scenes and animated overlays (the @viiolini set).
const SCENES: EffectKind[] = ['chart', 'cover', 'framebreak', 'papercut', 'greenscreen', 'orbit', 'doodle', 'ui', 'vertigo', 'pullback', 'zoomthrough'];
// "Show my reels": her other reels play in small cards (envelope, folder, Polaroid, ...).
const REEL_FX: EffectKind[] = ['envelope', 'folder', 'polaroid', 'conveyor', 'files', 'clothesline'];
const COLLAPSE_MIN = 6; // cut stretches at least this long fold into one line

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,!?;:„”"“…()]+/g, '')
    .trim();

type Mode = 'menu' | 'picture' | 'fix' | 'range';

export function WordsPanel({
  edit,
  change,
  words,
  range,
  board,
  setBoard,
  frame,
  hasCutout,
  cutoutRunning,
  startCutout,
  seekSource,
  onAdded,
  long,
  onShort,
}: {
  edit: Edit;
  change: Change;
  words: Word[];
  range: { start: number; end: number } | null;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  frame: number;
  hasCutout: boolean;
  cutoutRunning: boolean;
  startCutout: () => void;
  seekSource: (t: number) => void;
  onAdded: (id: string) => void;
  // Long YouTube video: only the effects it can show, and "Make a Short" on a selection.
  long?: boolean;
  onShort?: (start: number, end: number) => void;
}) {
  const actions = long ? ACTIONS.filter((k) => LONG_KINDS.includes(k)) : ACTIONS;
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [pickFor, setPickFor] = useState<EffectKind>('picture');
  const [fix, setFix] = useState('');
  const [fixAll, setFixAll] = useState(true);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const anchor = useRef<number | null>(null);
  const drag = useRef<{ start: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const fixes = edit.wordFixes ?? {};
  const textOf = (i: number) => fixes[String(i)] ?? words[i].text;
  const kept = useMemo(() => words.map((w) => isWordKept(w, edit.segments)), [words, edit.segments]);

  // Clips show only their own part of the long video.
  const visible = useMemo(() => {
    const idx: number[] = [];
    words.forEach((w, i) => {
      if (!range || (w.end >= range.start - 0.05 && w.start <= range.end + 0.05)) idx.push(i);
    });
    return idx;
  }, [words, range]);

  // Sentences: break after . ! ? … or a long silence.
  const sentences = useMemo(() => {
    const out: number[][] = [];
    let cur: number[] = [];
    visible.forEach((i, k) => {
      cur.push(i);
      const next = visible[k + 1];
      const endsSentence = /[.!?…]["”»]?$/.test(words[i].text);
      const longGap = next !== undefined && words[next].start - words[i].end > 1.5;
      if (endsSentence || longGap || cur.length >= 40 || next === undefined) {
        out.push(cur);
        cur = [];
      }
    });
    return out;
  }, [visible, words]);

  // Fully cut sentences that follow each other fold into one line.
  const blocks = useMemo(() => {
    type B = { kind: 'sent'; idx: number[] } | { kind: 'cut'; idx: number[]; key: number };
    const out: B[] = [];
    let run: number[][] = [];
    const flushRun = () => {
      const n = run.reduce((s, r) => s + r.length, 0);
      if (n >= COLLAPSE_MIN) out.push({ kind: 'cut', idx: run.flat(), key: run[0][0] });
      else run.forEach((r) => out.push({ kind: 'sent', idx: r }));
      run = [];
    };
    for (const s of sentences) {
      if (s.every((i) => !kept[i])) run.push(s);
      else {
        flushRun();
        out.push({ kind: 'sent', idx: s });
      }
    }
    flushRun();
    return out;
  }, [sentences, kept]);

  const fxWords = useMemo(() => {
    const map = new Map<number, EffectKind[]>();
    for (const fx of edit.effects) {
      let best = -1;
      let bestD = 0.35;
      words.forEach((w, i) => {
        const d = Math.abs(w.start - fx.at);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) map.set(best, [...(map.get(best) ?? []), fx.kind]);
    }
    return map;
  }, [edit.effects, words]);

  const q = fold(query);
  const matches = useMemo(() => (q ? new Set(visible.filter((i) => fold(textOf(i)).includes(q))) : null), [q, visible, fixes]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowSrc = outputToSource(frame / FPS, edit.segments);
  const current = words.findIndex((w) => nowSrc >= w.start && nowSrc < w.end + 0.04);

  // Follow playback inside the scrolling list, only when the panel is on screen and nothing is open.
  useEffect(() => {
    const box = list.current;
    if (!box || current < 0 || open !== null || box.scrollHeight <= box.clientHeight + 4) return;
    const r = box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const el = box.querySelector<HTMLElement>(`[data-i="${current}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - r.top + box.scrollTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTo({ top: top - box.clientHeight / 3, behavior: 'smooth' });
  }, [current, open]);

  const close = () => {
    setOpen(null);
    setSel(null);
    setNote(null);
  };

  useEffect(() => {
    if (open === null) return;
    const down = (e: MouseEvent) => {
      if (pop.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest?.('.word')) return;
      close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Keep the open popover on screen (it can open near the bottom of the window).
  useEffect(() => {
    if (open !== null) setTimeout(() => pop.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
  }, [open, mode]);

  const selRef = useRef(sel);
  selRef.current = sel;

  const openAt = (i: number, m: Mode) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el || !wrap.current) return;
    const box = wrap.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const width = 350;
    const left = Math.max(0, Math.min(r.left - box.left + r.width / 2 - width / 2, box.width - width));
    setPos({ top: r.bottom - box.top + 8, left });
    setOpen(i);
    setMode(m);
    setNote(null);
  };
  const openAtRef = useRef(openAt);
  openAtRef.current = openAt;

  // Finish a drag selection anywhere on the page.
  useEffect(() => {
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 60);
      const s = selRef.current;
      if (s) openAtRef.current(s[1], 'range');
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);

  const clickWord = (i: number, e: React.MouseEvent) => {
    if (justDragged.current) return;
    if (e.shiftKey && anchor.current !== null && anchor.current !== i) {
      const a = Math.min(anchor.current, i);
      const b = Math.max(anchor.current, i);
      setSel([a, b]);
      openAt(i, 'range');
      return;
    }
    seekSource(words[i].start);
    anchor.current = i;
    setSel(null);
    if (open === i && mode !== 'range') {
      close();
      return;
    }
    openAt(i, 'menu');
    setFix(textOf(i));
    setFixAll(true);
  };

  const add = (kind: EffectKind, image?: string) => {
    if (open === null) return;
    if (kind === 'picture' && !image) return; // never a picture effect without a picture
    const w = words[open];
    const fx = newEffect(kind, w, textOf(open), image);
    change((e) => ({ ...e, effects: sortEffects([...e.effects, fx]) }));
    onAdded(fx.id);
    if (NEEDS_CUTOUT.includes(kind) && !hasCutout) {
      startCutout();
      setNote(t('makingCutout'));
      return;
    }
    close();
  };

  const setRange = (a: number, b: number, keep: boolean) => {
    const s = words[a].start;
    const e2 = words[b].end;
    change((e) => ({ ...e, segments: keep ? keepRange(e.segments, s, e2) : cutRange(e.segments, s, e2) }));
    close();
  };

  const sentenceOf = (i: number) => sentences.find((s) => s.includes(i)) ?? [i];

  // The same word elsewhere (for "Fix all").
  const sameIdx = open !== null ? visible.filter((i) => fold(words[i].text) === fold(words[open].text)) : [];

  const applyFix = () => {
    if (open === null) return;
    const v = fix.trim();
    const targets = fixAll && sameIdx.length > 1 ? sameIdx : [open];
    change((e) => {
      const next = { ...(e.wordFixes ?? {}) };
      for (const i of targets) {
        if (!v || v === words[i].text) delete next[String(i)];
        else next[String(i)] = v;
      }
      return { ...e, wordFixes: next };
    });
    close();
  };

  const selCount = sel ? sel[1] - sel[0] + 1 : 0;
  const selKept = sel ? kept.slice(sel[0], sel[1] + 1).some(Boolean) : false;
  const selCut = sel ? kept.slice(sel[0], sel[1] + 1).some((k) => !k) : false;

  const chip = (i: number) => {
    const kinds = fxWords.get(i);
    const inSel = sel && i >= sel[0] && i <= sel[1];
    return (
      <button
        key={i}
        data-i={i}
        className={`word ${kept[i] ? '' : 'cut'} ${i === current ? 'now' : ''} ${open === i && !sel ? 'open' : ''} ${inSel ? 'sel' : ''} ${kinds ? 'has-fx' : ''} ${fixes[String(i)] ? 'fixed' : ''} ${matches?.has(i) ? 'match' : ''}`}
        onMouseDown={(e) => {
          if (e.button === 0 && !e.shiftKey) drag.current = { start: i, moved: false };
        }}
        onMouseEnter={() => {
          const d = drag.current;
          if (d && i !== d.start) {
            d.moved = true;
            anchor.current = d.start;
            setSel([Math.min(d.start, i), Math.max(d.start, i)]);
          }
        }}
        onClick={(e) => clickWord(i, e)}
        title={`${words[i].start.toFixed(2)} s`}
      >
        {textOf(i)}
        {kinds && (
          <span className="word-fx" aria-hidden>
            {kinds.map((k) => KIND_ICON[k]).join('')}
          </span>
        )}
      </button>
    );
  };

  const stamp = (idx: number[]) => {
    const firstKept = idx.find((i) => kept[i]);
    const out = firstKept !== undefined ? sourceToOutput(words[firstKept].start, edit.segments) : null;
    return out === null ? '—' : fmtTime(out);
  };

  return (
    <Panel
      id="words"
      title={t('words')}
      hint={t('wordsHint')}
      aside={
        <div className="word-search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchWords')} aria-label={t('searchWords')} />
          {matches && <span className="muted small">{fmt(t('matches'), { n: matches.size })}</span>}
        </div>
      }
    >
      {!words.length && <p className="muted">{t('noWords')}</p>}
      <div className="words-wrap" ref={wrap}>
        <div className={`words ${visible.length > 140 ? 'long' : ''}`} ref={list}>
          {blocks.map((b) =>
            b.kind === 'cut' && !expanded.has(b.key) ? (
              <button key={`c${b.key}`} className="cut-stretch" onClick={() => setExpanded((s) => new Set(s).add(b.key))}>
                {fmt(t('cutStretch'), { n: b.idx.length })}
              </button>
            ) : (
              <div key={`s${b.idx[0]}`} className="sentence">
                <span className="ts">{stamp(b.idx)}</span>
                <span className="sent-words">{b.idx.map(chip)}</span>
              </div>
            ),
          )}
        </div>

        {open !== null && pos && (
          <div className="popover" ref={pop} style={{ top: pos.top, left: pos.left }} role="dialog">
            <div className="pop-head">
              <span className="pop-word">{mode === 'range' && sel ? fmt(t('selectedN'), { n: selCount }) : `„${textOf(open)}”`}</span>
              <button className="x" onClick={close} aria-label={t('close')}>
                ×
              </button>
            </div>
            {note && <div className="pop-note">{note}</div>}
            {mode === 'range' && sel && (
              <div className="pop-row single">
                {selKept && (
                  <button className="pop-act wide danger" onClick={() => setRange(sel[0], sel[1], false)}>
                    <span className="pop-icon">✂</span>
                    {fmt(t('cutN'), { n: selCount })}
                  </button>
                )}
                {selCut && (
                  <button className="pop-act wide" onClick={() => setRange(sel[0], sel[1], true)}>
                    <span className="pop-icon">↺</span>
                    {fmt(t('keepN'), { n: selCount })}
                  </button>
                )}
                {onShort && (
                  <button
                    className="pop-act wide"
                    onClick={() => {
                      onShort(words[sel[0]].start, words[sel[1]].end);
                      close();
                    }}
                  >
                    <span className="pop-icon">↗</span>
                    {t('shortMake')}
                  </button>
                )}
              </div>
            )}
            {mode === 'menu' && (
              <>
                <div className="pop-grid">
                  {actions.map((k) => (
                    <button
                      key={k}
                      className="pop-act"
                      onClick={() => {
                        if (k !== 'picture') return add(k);
                        setPickFor('picture');
                        setMode('picture');
                      }}
                    >
                      <span className="pop-icon">{KIND_ICON[k]}</span>
                      {t(`act_${k}` as StrKey)}
                    </button>
                  ))}
                </div>
                {!long && <div className="group-label pop-group">{t('moreEffects')}</div>}
                {!long && (
                <div className="pop-grid">
                  {SCENES.map((k) => (
                    <button
                      key={k}
                      className="pop-act"
                      title={t(`tip_${k}` as StrKey)}
                      onClick={() => {
                        if (k !== 'greenscreen' || !board.length) return add(k); // no pictures yet: cream studio
                        setPickFor('greenscreen');
                        setMode('picture');
                      }}
                    >
                      <span className="pop-icon">{KIND_ICON[k]}</span>
                      {t(`act_${k}` as StrKey)}
                    </button>
                  ))}
                </div>
                )}
                {!long && <div className="group-label pop-group">{t('showMyReels')}</div>}
                {!long && (
                <div className="pop-grid">
                  {REEL_FX.map((k) => (
                    <button key={k} className="pop-act" title={t(`tip_${k}` as StrKey)} onClick={() => add(k)}>
                      <span className="pop-icon">{KIND_ICON[k]}</span>
                      {t(`act_${k}` as StrKey)}
                    </button>
                  ))}
                </div>
                )}
                <div className="pop-row">
                  <button className="pop-act wide" onClick={() => setMode('fix')}>
                    <span className="pop-icon">Aa</span>
                    {t('act_fix')}
                  </button>
                  <button className={`pop-act wide ${kept[open] ? 'danger' : ''}`} onClick={() => setRange(open, open, !kept[open])}>
                    <span className="pop-icon">{kept[open] ? '✂' : '↺'}</span>
                    {kept[open] ? t('act_cut') : t('act_keep')}
                  </button>
                  {(() => {
                    const s = sentenceOf(open);
                    const anyKept = s.some((i) => kept[i]);
                    return (
                      <button className={`pop-act wide span2 ${anyKept ? 'danger' : ''}`} onClick={() => setRange(s[0], s[s.length - 1], !anyKept)}>
                        <span className="pop-icon">{anyKept ? '✂' : '↺'}</span>
                        {anyKept ? t('cutSentence') : t('keepSentence')}
                      </button>
                    );
                  })()}
                </div>
              </>
            )}
            {mode === 'picture' && (
              <div className="pop-board">
                <div className="group-label">{t('changePicture')}</div>
                <PictureGrid board={board} setBoard={setBoard} onPick={(f) => add(pickFor, f)} />
                {pickFor === 'greenscreen' && (
                  <button className="link-btn" onClick={() => add('greenscreen')}>
                    {t('studioBackdrop')}
                  </button>
                )}
              </div>
            )}
            {mode === 'fix' && (
              <form
                className="pop-fix"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyFix();
                }}
              >
                <div className="pop-fix-row">
                  <input autoFocus value={fix} onChange={(e) => setFix(e.target.value)} placeholder={t('fixPlaceholder')} />
                  <button className="btn primary" type="submit">
                    {t('apply')}
                  </button>
                </div>
                {sameIdx.length > 1 && (
                  <label className={`check small ${fixAll ? 'on' : ''}`}>
                    <input type="checkbox" checked={fixAll} onChange={(e) => setFixAll(e.target.checked)} />
                    <span className="box" aria-hidden>
                      {fixAll ? '✓' : ''}
                    </span>
                    <span>{fmt(t('fixAll'), { n: sameIdx.length })}</span>
                  </label>
                )}
              </form>
            )}
          </div>
        )}
      </div>
      {cutoutRunning && !note && <p className="muted small">{t('makingCutout')}</p>}
    </Panel>
  );
}
