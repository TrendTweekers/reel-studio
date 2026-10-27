import type { Edit, Effect, EffectKind, Segment, Word } from '../../src/shared/types';

// One reducer holds the Edit plus an in-memory undo/redo history.
export type EditState = {
  edit: Edit | null;
  past: Edit[];
  future: Edit[];
  // Goes up on every change made on this page. The saver watches it.
  rev: number;
  // Groups quick changes (typing) into one undo step.
  lastKey: string | null;
  lastAt: number;
};

export type EditAction =
  | { type: 'load'; edit: Edit; keepHistory: boolean }
  | { type: 'change'; fn: (e: Edit) => Edit; key?: string }
  | { type: 'merge'; server: Edit; merged: Edit }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialEditState: EditState = { edit: null, past: [], future: [], rev: 0, lastKey: null, lastAt: 0 };

const HISTORY = 200;
const GROUP_MS = 900;

export function editReducer(s: EditState, a: EditAction): EditState {
  switch (a.type) {
    case 'load':
      // From the server (first load, or a change made by Claude). Not a local change, so rev stays.
      return {
        ...s,
        edit: a.edit,
        past: a.keepHistory && s.edit ? [...s.past, s.edit].slice(-HISTORY) : [],
        future: [],
        lastKey: null,
      };
    case 'change': {
      if (!s.edit) return s;
      const next = a.fn(s.edit);
      if (next === s.edit) return s;
      const now = Date.now();
      const group = a.key != null && a.key === s.lastKey && now - s.lastAt < GROUP_MS;
      return {
        edit: next,
        past: group ? s.past : [...s.past, s.edit].slice(-HISTORY),
        future: [],
        rev: s.rev + 1,
        lastKey: a.key ?? null,
        lastAt: now,
      };
    }
    case 'merge':
      // After a save conflict: the other version goes on the undo stack, the merged one is shown and saved.
      return {
        edit: a.merged,
        past: [...s.past, a.server].slice(-HISTORY),
        future: [],
        rev: s.rev + 1,
        lastKey: null,
        lastAt: 0,
      };
    case 'undo': {
      if (!s.edit || !s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { edit: prev, past: s.past.slice(0, -1), future: [s.edit, ...s.future], rev: s.rev + 1, lastKey: null, lastAt: 0 };
    }
    case 'redo': {
      if (!s.edit || !s.future.length) return s;
      const [next, ...rest] = s.future;
      return { edit: next, past: [...s.past, s.edit], future: rest, rev: s.rev + 1, lastKey: null, lastAt: 0 };
    }
  }
}

// ---------- segments ----------

const MIN_SEG = 0.04;
const MERGE_GAP = 0.06;

export const normalizeSegments = (segs: Segment[]): Segment[] => {
  const sorted = segs.filter((s) => s.end - s.start >= MIN_SEG).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + MERGE_GAP) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
};

export const cutRange = (segs: Segment[], a: number, b: number): Segment[] =>
  normalizeSegments(
    segs.flatMap((s) => {
      if (b <= s.start || a >= s.end) return [s];
      const parts: Segment[] = [];
      if (a > s.start) parts.push({ start: s.start, end: a });
      if (b < s.end) parts.push({ start: b, end: s.end });
      return parts;
    }),
  );

export const keepRange = (segs: Segment[], a: number, b: number): Segment[] =>
  normalizeSegments([...segs.map((s) => ({ ...s })), { start: a, end: b }]);

export const isWordKept = (w: Word, segs: Segment[]) => {
  const mid = (w.start + w.end) / 2;
  return segs.some((s) => mid >= s.start && mid <= s.end);
};

// ---------- effects ----------

export const DEFAULT_DURATION: Record<EffectKind, number> = {
  picture: 1.6,
  label: 1.4,
  zoom: 0.8,
  glass: 1.6,
  behind: 2.0,
  chapter: 2.0,
  emoji: 1.0,
  checklist: 3.5,
  flash: 0.2,
  phone: 2.0,
  framebreak: 2.5,
  papercut: 2.0,
  vertigo: 2.2,
  pullback: 2.2,
  greenscreen: 3.0,
  cover: 2.8,
  zoomthrough: 0.6,
  orbit: 3.0,
  doodle: 2.0,
  ui: 3.0,
  chart: 3.2,
};

export const KIND_ICON: Record<EffectKind, string> = {
  picture: '▣',
  label: '◇',
  zoom: '⊕',
  glass: '◌',
  behind: '◐',
  chapter: '§',
  checklist: '☑',
  flash: '✦',
  phone: '▯',
  emoji: '☺',
  framebreak: '⧉',
  papercut: '✂',
  vertigo: '◎',
  pullback: '⤢',
  greenscreen: '▧',
  cover: '❖',
  zoomthrough: '➚',
  orbit: '⟳',
  doodle: '✎',
  ui: '▤',
  chart: '▥',
};

export const shortId = () => Math.random().toString(36).slice(2, 8);

const clean = (s: string) => s.replace(/[.,!?;:„”"“…]+/g, '').trim();

export const newEffect = (kind: EffectKind, w: Word, displayText: string, image?: string): Effect => {
  const word = clean(displayText);
  const e: Effect = { id: shortId(), kind, at: Math.round(w.start * 100) / 100, duration: DEFAULT_DURATION[kind], word };
  switch (kind) {
    case 'picture':
    case 'phone':
      if (image) e.image = image;
      e.sfx = 'default';
      break;
    case 'label':
    case 'glass':
    case 'behind':
      e.text = word;
      break;
    case 'chapter':
      e.text = `[${word}]`;
      break;
    case 'emoji':
      e.text = '✨';
      break;
    case 'checklist':
      e.items = [word, '', ''].filter((x, i) => i === 0 || x);
      break;
    case 'zoom':
      e.scale = 1.25;
      break;
    case 'greenscreen':
    case 'framebreak':
      if (image) e.image = image;
      break;
    case 'cover':
      e.text = word.toUpperCase();
      e.items = [];
      break;
    case 'orbit':
      e.items = [word];
      if (image) e.image = image;
      break;
    case 'ui':
      e.text = word;
      e.items = [];
      break;
    case 'chart':
      e.text = word;
      e.items = ['2024: 20', '2025: 45', '2026: 90'];
      break;
    default:
      break;
  }
  return e;
};

export const sortEffects = (fx: Effect[]) => [...fx].sort((a, b) => a.at - b.at);

// ---------- 3-way merge (base = last version we had from the server) ----------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const pick3 = <V,>(b: V, srv: V, loc: V, clash: () => void): V => {
  if (same(loc, b)) return srv;
  if (same(srv, b) || same(srv, loc)) return loc;
  clash();
  return loc; // a real clash: keep hers
};

export function merge3(base: Edit, server: Edit, local: Edit): { merged: Edit; clash: boolean } {
  let clash = false;
  const onClash = () => {
    clash = true;
  };
  const merged = { ...server } as Edit;
  const keys = new Set([...Object.keys(base), ...Object.keys(server), ...Object.keys(local)]) as Set<keyof Edit>;
  for (const k of keys) {
    if (k === 'effects' || k === 'wordFixes') continue;
    (merged as Record<string, unknown>)[k] = pick3(base[k], server[k], local[k], onClash);
  }
  // wordFixes: per key
  const wb = base.wordFixes ?? {};
  const ws = server.wordFixes ?? {};
  const wl = local.wordFixes ?? {};
  const wf: Record<string, string> = {};
  for (const k of new Set([...Object.keys(wb), ...Object.keys(ws), ...Object.keys(wl)])) {
    const v = pick3(wb[k], ws[k], wl[k], onClash);
    if (v !== undefined) wf[k] = v;
  }
  merged.wordFixes = wf;
  // effects: per id
  const byId = (fx: Effect[]) => new Map(fx.map((e) => [e.id, e]));
  const eb = byId(base.effects ?? []);
  const es = byId(server.effects ?? []);
  const el = byId(local.effects ?? []);
  const out: Effect[] = [];
  for (const id of new Set([...eb.keys(), ...es.keys(), ...el.keys()])) {
    const v = pick3(eb.get(id), es.get(id), el.get(id), onClash);
    if (v) out.push(v);
  }
  merged.effects = sortEffects(out);
  return { merged, clash };
}
