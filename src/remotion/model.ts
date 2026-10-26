// Pure, deterministic timing + layout for one Reel. Built once per props (useMemo in Reel.tsx)
// and shared with every layer through ReelContext. Everything here is in OUTPUT frames and
// composition pixels (1080x1920).
//
// Layout is ONE pass that knows every text and sticker, in this order:
//   hook -> chapters -> 'behind' type -> captions -> stickers (picture/phone/label) -> cards
//   (checklist/glass) -> a last caption pass that moves or hides any caption still touching a card.
// Nothing is ever placed on the head box (face box grown to include hair), and nothing leaves
// the safe area (Instagram header, caption/UI band, the right-hand button column).
import { Easing, interpolate, random, spring } from 'remotion';
import { FPS, HEIGHT, WIDTH, type Effect, type ReelProps } from '../shared/types';
import { endCardFrames, faceAt, outputFrames, outputToSource, outputWords, segmentFrames, sourceToOutput } from '../shared/time';

// Instagram / TikTok UI covers these edges.
export const SAFE = { top: 220, bottom: 380, side: 60 } as const;
export const SAFE_BOTTOM = HEIGHT - SAFE.bottom; // 1540
export const SAFE_RIGHT = WIDTH - SAFE.side; // 1020
// The like / comment / share / audio column on the right.
export const RIGHT_UI = { x: WIDTH - 150, y0: 900, y1: 1700 } as const;
// Right edge allowed for a box spanning y..y+h.
export const rightLimit = (y: number, h: number) => (y + h > RIGHT_UI.y0 && y < RIGHT_UI.y1 ? RIGHT_UI.x : SAFE_RIGHT);

// Captions: centred a little left of the canvas centre, clear of the button column.
export const CAPTION_MAX_W = 820;
export const CAPTION_CX = WIDTH / 2 - 40;

export type Rect = { x: number; y: number; w: number; h: number };

export const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const insideSafe = (r: Rect, bottom = SAFE_BOTTOM) =>
  r.x >= SAFE.side - 1 && r.x + r.w <= rightLimit(r.y, r.h) + 1 && r.y >= SAFE.top - 1 && r.y + r.h <= bottom + 1;

export type Zoom = { s: number; ox: number; oy: number };

export type OutWord = { index: number; text: string; from: number; to: number };

export type Chunk = {
  from: number;
  to: number;
  words: OutWord[];
  top: number; // caption block top, px
  rect: Rect; // estimated caption block
  hidden: boolean; // a card owns this moment and there was no room for the caption
};

export type Side = 'left' | 'right';

export type TimedEffect = Effect & {
  from: number; // output frame where it starts
  frames: number; // length in frames
  rotation: number; // deterministic tilt in degrees
  side: Side; // side away from the face at the start
  rect: Rect | null; // placed box (after scale). null for a sticker with no room: it is skipped.
  scale: number; // scale chosen to fit (cards, behind type, chapter), else 1
};

export type HookLayout = {
  size: number; // main line font size (after fit)
  lines: string[]; // main text, already broken into lines
  accentLines: string[];
  sub: string;
  top: number;
  height: number;
  rect: Rect;
  where: 'above' | 'below';
};

export type Model = {
  total: number; // frames of the cut video (the end card comes after this)
  cardFrames: number; // end card length, 0 when off
  compFrames: number; // whole composition = total + cardFrames
  segs: ReturnType<typeof segmentFrames>;
  words: OutWord[];
  chunks: Chunk[];
  effects: TimedEffect[];
  speech: Float32Array; // 0..1 per output frame, smoothed "she is talking" envelope
  segmentIndexAt: (frame: number) => number;
  camera: (frame: number) => [Zoom, Zoom]; // [jump zoom (outer), effect zoom (inner)]
  faceRect: (frame: number) => Rect; // face box on screen (after the camera), px
  headRect: (frame: number) => Rect; // face box grown to cover hair, px
  headSpan: (from: number, to: number) => Rect; // union of the head box over a frame range
  hookFrames: number; // 0 when no hook
  hook: HookLayout | null;
};

const FACE_GAP = 30;
export const CAPTION_LEAD = 2; // captions appear 2 frames before the word, so the eye is on time

// ---------- Polish-aware chunking ----------
// Words that must not end a caption chunk or a line: they belong to the next word.
export const CLINGY = /^(a|i|o|u|w|z|we|ze|na|do|od|po|za|że|to|ku|by|bo|nad|pod|przy|dla|bez|czy|jak|ani|oraz|albo|lub|ale)$/i;
export const isClingy = (t: string) => CLINGY.test(t.replace(/[„"“”'(]/g, '')) && !/[.,!?;:…]$/.test(t);

const PUNCT = /[.,!?;:…—–)"”]$/;

const makeChunkGroups = (words: OutWord[]): OutWord[][] => {
  const groups: OutWord[][] = [];
  let cur: OutWord[] = [];
  const chars = (ws: OutWord[]) => ws.reduce((n, w) => n + w.text.length + 1, 0);
  words.forEach((w, i) => {
    const last = cur[cur.length - 1];
    if (cur.length >= 2 && chars(cur) + w.text.length > 22 && !(last && isClingy(last.text))) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.from - w.to : 99;
    const strong = /[.!?…]$/.test(w.text);
    const wantBreak = !next || cur.length >= 4 || strong || gap > 0.4 * FPS || (PUNCT.test(w.text) && cur.length >= 2);
    // Never close a chunk on a one-letter word / preposition: carry it into the next chunk.
    const hang = next && isClingy(w.text) && gap <= 0.4 * FPS && cur.length < 6;
    if (wantBreak && !hang) {
      groups.push(cur);
      cur = [];
    }
  });
  if (cur.length) groups.push(cur);
  return groups;
};

const speechEnvelope = (words: OutWord[], total: number) => {
  const raw = new Float32Array(total);
  const RISE = 5; // frames before a word the music starts to dip
  const FALL = 9; // frames after a word it starts to come back
  for (const w of words) {
    for (let f = Math.max(0, w.from - RISE); f < Math.min(total, w.to + FALL); f++) {
      const v = f < w.from ? (f - (w.from - RISE)) / RISE : f > w.to ? 1 - (f - w.to) / FALL : 1;
      if (v > raw[f]) raw[f] = v;
    }
  }
  // Moving average, then gentle ease: no steps, so no clicks.
  const out = new Float32Array(total);
  const R = 3;
  for (let f = 0; f < total; f++) {
    let sum = 0;
    let n = 0;
    for (let k = -R; k <= R; k++) {
      const j = f + k;
      if (j >= 0 && j < total) {
        sum += raw[j];
        n++;
      }
    }
    const v = sum / Math.max(1, n);
    out[f] = v * v * (3 - 2 * v);
  }
  return out;
};

export const applyZoom = (z: Zoom, x: number, y: number) => ({ x: z.ox + z.s * (x - z.ox), y: z.oy + z.s * (y - z.oy) });

// Punch-in on the stressed word. It holds until `hold` frames (the next cut, or the effect end)
// and only eases out when there is no cut to hide the way back.
export const zoomEnvelope = (local: number, frames: number, easeOut: boolean) => {
  if (local < 0 || local >= frames) return 0;
  const inn = spring({ frame: local, fps: FPS, config: { damping: 18, stiffness: 190, mass: 0.6 } });
  if (!easeOut) return inn;
  const outLen = Math.min(12, Math.floor(frames / 2));
  const out = interpolate(local, [frames - outLen, frames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  return inn * out;
};

// ---------- text measuring (estimates, deliberately a little generous) ----------
const SERIF_CHAR = 0.5; // average glyph width / font size, serif regular
const SERIF_ITALIC_CHAR = 0.45;
export const SANS_CHAR = 0.58;

// Greedy line breaking that keeps clingy words with the next word.
export const breakLines = (text: string, size: number, charW: number, maxW: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  // glue clingy words to the next
  const units: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let u = words[i];
    while (isClingy(words[i]) && i + 1 < words.length) {
      i++;
      u += ' ' + words[i];
    }
    units.push(u);
  }
  const lines: string[] = [];
  let cur = '';
  for (const u of units) {
    const cand = cur ? `${cur} ${u}` : u;
    if (cur && cand.length * size * charW > maxW) {
      lines.push(cur);
      cur = u;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  // Balance two-line results: move words down while the first line is clearly longer.
  if (lines.length === 2) {
    let [a, b] = lines;
    for (;;) {
      const parts = a.split(' ');
      if (parts.length < 2) break;
      const moved = parts[parts.length - 1];
      const na = parts.slice(0, -1).join(' ');
      const nb = `${moved} ${b}`;
      if (nb.length * size * charW > maxW || nb.length > a.length) break;
      if (Math.abs(na.length - nb.length) >= Math.abs(a.length - b.length)) break;
      a = na;
      b = nb;
    }
    return [a, b];
  }
  return lines;
};

// Checklist card and glass panel base sizes (before any shrink).
export const CHECKLIST_W = 760;
export const checklistSize = (e: Effect) => ({
  w: CHECKLIST_W,
  h: 94 + (e.text?.trim() ? 82 : 0) + (e.items ?? []).length * 86,
});
export const glassMetrics = (text: string) => {
  const lines = text.split(/\n/);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const size = Math.round(Math.max(76, Math.min(140, 760 / (longest * 0.5))));
  const textW = Math.min(760, longest * size * 0.47);
  const nLines = lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * size * 0.47) / 760)), 0);
  return { size, w: textW + 128 + 3, h: nLines * size * 1.02 + 86 + 3 };
};

export const PICTURE_SIZE = { w: 340, h: 404 };
export const PHONE_SIZE = { w: 290, h: 594 };
export const labelSize = (text: string) => ({ w: Math.min(560, 70 + text.length * 25), h: 86 });

export const captionFontSize = (style: string) => (style === 'pop' ? 66 : style === 'box' ? 58 : 64);

const estimateCaption = (words: OutWord[], fs: number, boxed: boolean, top: number): Rect => {
  const chars = words.reduce((n, w) => n + w.text.length + 1, 0);
  const textW = chars * fs * SANS_CHAR;
  const lines = Math.max(1, Math.ceil(textW / CAPTION_MAX_W));
  const w = Math.min(CAPTION_MAX_W, textW) + (boxed ? 52 : 0);
  const h = lines * fs * 1.2 + (boxed ? 36 : 0);
  return { x: CAPTION_CX - w / 2, y: top, w, h };
};

type Placed = { rect: Rect; from: number; to: number; kind: string };

export const buildModel = (props: ReelProps): Model => {
  const { edit } = props;
  const segments = edit.segments;
  const total = outputFrames(segments);
  const segs = segmentFrames(segments);

  const words: OutWord[] = outputWords(props.words, segments, edit.wordFixes)
    .filter((w) => w.text.trim().length > 0)
    .map((w) => ({
      index: w.index,
      text: w.text.trim(),
      from: Math.round(w.start * FPS),
      to: Math.max(Math.round(w.start * FPS) + 1, Math.round(w.end * FPS)),
    }));

  const segmentIndexAt = (frame: number) => {
    for (let i = segs.length - 1; i >= 0; i--) if (frame >= segs[i].from) return i;
    return 0;
  };

  const sourceFace = (frame: number) => faceAt(outputToSource(frame / FPS, segments), props.faces);
  const faceCenterPx = (frame: number) => {
    const f = sourceFace(frame);
    return { x: (f.x + f.w / 2) * WIDTH, y: (f.y + f.h / 2) * HEIGHT };
  };

  // ---- Effects on the output timeline.
  const effects: TimedEffect[] = [];
  for (const e of edit.effects) {
    const start = sourceToOutput(e.at, segments);
    if (start === null) continue;
    const from = Math.round(start * FPS);
    if (from >= total) continue;
    let frames = Math.max(1, Math.round(e.duration * FPS));
    if (e.kind === 'flash') frames = 6;
    frames = Math.min(frames, total - from);
    if (frames <= 0) continue;
    const c = faceCenterPx(from);
    effects.push({
      ...e,
      from,
      frames,
      rotation: (random(`rot-${e.id}`) * 2 - 1) * 6,
      side: c.x < WIDTH / 2 ? 'right' : 'left',
      rect: null,
      scale: 1,
    });
  }
  effects.sort((a, b) => a.from - b.from);

  // ---- Camera: jump zooms only on longer segments, never two in a row, varied 1.06..1.15.
  const MAX_TOTAL_ZOOM = 1.35;
  const jumpScales = segs.map(() => 1);
  if (edit.toggles.zoomJumps) {
    let prevZoomed = true; // never zoom the first segment
    segs.forEach((s, i) => {
      const long = s.durationInFrames >= 1.2 * FPS;
      if (long && !prevZoomed) {
        jumpScales[i] = 1.06 + random(`jump-${i}-${s.startFrom}`) * 0.09;
        prevZoomed = true;
      } else prevZoomed = false;
    });
  }
  const zooms = effects
    .filter((e) => e.kind === 'zoom')
    .map((z) => {
      // Hold to the cut when the cut comes within 3 s; then the cut hides the way back.
      const k = segmentIndexAt(z.from);
      const segEnd = segs[k].from + segs[k].durationInFrames;
      const holdToCut = segEnd - z.from <= 3 * FPS;
      return { e: z, until: holdToCut ? Math.max(segEnd, z.from + 1) : z.from + z.frames, easeOut: !holdToCut };
    });

  const camera = (frame: number): [Zoom, Zoom] => {
    const k = segmentIndexAt(frame);
    const jumpScale = jumpScales[k] ?? 1;
    const o1 = faceCenterPx(segs[k]?.from ?? 0);
    let best: Zoom = { s: 1, ox: WIDTH / 2, oy: HEIGHT / 2 };
    let bestEnv = 0;
    for (const z of zooms) {
      const env = zoomEnvelope(frame - z.e.from, z.until - z.e.from, z.easeOut);
      if (env > bestEnv) {
        bestEnv = env;
        const o = faceCenterPx(z.e.from);
        const target = Math.min(z.e.scale ?? 1.25, MAX_TOTAL_ZOOM / jumpScale);
        best = { s: 1 + (target - 1) * env, ox: o.x, oy: o.y };
      }
    }
    return [{ s: jumpScale, ox: o1.x, oy: o1.y }, best];
  };

  const faceRect = (frame: number): Rect => {
    const f = sourceFace(frame);
    const [outer, inner] = camera(frame);
    const map = (x: number, y: number) => {
      const a = applyZoom(inner, x, y);
      return applyZoom(outer, a.x, a.y);
    };
    const tl = map(f.x * WIDTH, f.y * HEIGHT);
    const br = map((f.x + f.w) * WIDTH, (f.y + f.h) * HEIGHT);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  };

  // The face detector boxes forehead-to-chin. Hair sits above it and around it.
  const headRect = (frame: number): Rect => {
    const f = faceRect(frame);
    return { x: f.x - f.w * 0.14, y: f.y - f.h * 0.45, w: f.w * 1.28, h: f.h * 1.5 };
  };

  const headSpan = (from: number, to: number): Rect => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const end = Math.max(from, Math.min(to, total - 1));
    for (let f = from; f <= end; f += 3) {
      const r = headRect(Math.min(f, total - 1));
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const placed: Placed[] = [];
  const during = (from: number, to: number) => placed.filter((p) => p.from < to && from < p.to);

  // A top text block: above the head if it fits at >= minScale, else under the chin, above the captions.
  const CAPTION_TOP_LOW = SAFE_BOTTOM - 110 - 77; // where a one-line lower caption starts
  const placeTopBand = (from: number, to: number, h: number, minScale: number) => {
    const head = headSpan(from, to);
    const top0 = SAFE.top + 10;
    const aboveRoom = head.y - FACE_GAP - top0;
    if (aboveRoom >= h * minScale) {
      const scale = Math.min(1, aboveRoom / h);
      return { top: Math.max(top0, head.y - FACE_GAP - h * scale), scale, where: 'above' as const };
    }
    const below = head.y + head.h + FACE_GAP;
    const belowRoom = CAPTION_TOP_LOW - 24 - below;
    if (belowRoom >= h * minScale) {
      return { top: below, scale: Math.min(1, belowRoom / h), where: 'below' as const };
    }
    // No clean room (very big face): the lower third, on its scrim.
    const scale = Math.max(minScale, Math.min(1, (CAPTION_TOP_LOW - 24 - top0) / h));
    return { top: CAPTION_TOP_LOW - 24 - h * scale, scale, where: 'below' as const };
  };

  // ---- 1. Hook (visible from frame 0).
  const hookFrames = edit.hook ? Math.min(total, Math.round(edit.hook.until * FPS)) : 0;
  let hook: HookLayout | null = null;
  if (edit.hook && hookFrames > 0) {
    const maxW = WIDTH - 2 * SAFE.side - 20;
    const text = edit.hook.text.trim();
    const accent = (edit.hook.accent ?? '').trim();
    // Prefer one line per part (down to 80 px), then two lines per part (down to 64 px).
    let size = 112;
    let lines: string[] = [];
    let accentLines: string[] = [];
    const fit = (maxLines: number, minSize: number) => {
      for (let sz = 112; sz >= minSize; sz -= 4) {
        const l = breakLines(text, sz, SERIF_CHAR, maxW);
        const a = accent ? breakLines(accent, sz * 1.06, SERIF_ITALIC_CHAR, maxW) : [];
        if (l.length <= maxLines && a.length <= maxLines) {
          size = sz;
          lines = l;
          accentLines = a;
          return true;
        }
      }
      return false;
    };
    if (!fit(1, 80) && !fit(2, 64)) {
      size = 64;
      lines = breakLines(text, size, SERIF_CHAR, maxW);
      accentLines = accent ? breakLines(accent, size * 1.06, SERIF_ITALIC_CHAR, maxW) : [];
    }
    const subRaw = (edit.hook.sub ?? '').trim();
    const sub = subRaw ? `[ ${subRaw.replace(/^\[\s*|\s*\]$/g, '')} ]` : '';
    const height = lines.length * size * 1.04 + accentLines.length * size * 1.06 * 1.04 + (sub ? 70 : 0);
    const pl = placeTopBand(0, hookFrames, height, 0.85);
    const k = pl.scale;
    const s2 = Math.round(size * k);
    const h2 = height * k;
    hook = {
      size: s2,
      lines,
      accentLines,
      sub,
      top: pl.top,
      height: h2,
      rect: { x: SAFE.side, y: pl.top, w: WIDTH - 2 * SAFE.side, h: h2 },
      where: pl.where,
    };
    placed.push({ rect: hook.rect, from: 0, to: hookFrames, kind: 'hook' });
  }

  // ---- 2. Chapters: in the free band, clear of the hook.
  for (const e of effects) {
    if (e.kind !== 'chapter') continue;
    const h = 84;
    const to = e.from + e.frames;
    const pl = placeTopBand(e.from, to, h, 1);
    let top = e.position === 'bottom' ? CAPTION_TOP_LOW - 24 - h : pl.top;
    for (const p of during(e.from, to)) {
      if (overlaps({ x: 0, y: top, w: WIDTH, h }, p.rect, 16)) top = p.rect.y + p.rect.h + 20;
    }
    e.rect = { x: WIDTH / 2 - 300, y: top, w: 600, h };
    placed.push({ rect: e.rect, from: e.from, to, kind: 'chapter' });
  }

  // ---- 3. 'behind' type. With a cutout it sits behind her head / shoulders; without one it is
  // drawn over her, so it goes into the free band like the hook.
  const hasCutout = Boolean(props.urls.cutout);
  for (const e of effects) {
    if (e.kind !== 'behind') continue;
    const text = (e.text ?? '').trim();
    const chars = Math.max(2, Array.from(text).length);
    // Big, but at most ~70% of the width so the word can sit beside her head, not only behind it.
    const full = Math.round(clamp(Math.min((WIDTH - 80) / (chars * 0.55), 760 / (chars * 0.56)), 170, 400));
    const to = e.from + e.frames;
    if (hasCutout) {
      // The median face over the effect (the first frame can be a stale sample right after a cut).
      const samples: Rect[] = [];
      for (let f = e.from; f < Math.min(to, total); f += 3) samples.push(faceRect(f));
      const med = (k: keyof Rect) => [...samples].map((r) => r[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
      const face: Rect = { x: med('x'), y: med('y'), w: med('w'), h: med('h') };
      const big = face.h > 300;
      // The letters run at head height: the head cuts into the middle of the word and the rest
      // stays readable on both sides (lower would hide most of it behind her body).
      const cy = big ? face.y + face.h * 0.35 : face.y + face.h * 0.55;
      const y = clamp(cy - full * 0.5, SAFE.top, CAPTION_TOP_LOW - 24 - full);
      // Slide the word towards the open side so only about a quarter of it hides behind her head.
      const head: Rect = { x: face.x - face.w * 0.14, y: face.y - face.h * 0.45, w: face.w * 1.28, h: face.h * 1.5 };
      const textW = Math.min(WIDTH - 80, chars * full * 0.56);
      const headCx = head.x + head.w / 2;
      const dir = headCx < WIDTH / 2 ? 1 : -1;
      const cx = clamp(headCx + dir * (head.w / 2 + textW * 0.25), 40 + textW / 2, WIDTH - 40 - textW / 2);
      e.rect = { x: cx - textW / 2, y, w: textW, h: full };
      e.scale = 1;
    } else {
      const pl = placeTopBand(e.from, to, full, 0.55);
      const textW = Math.min(WIDTH - 80, chars * full * pl.scale * 0.56);
      e.rect = { x: WIDTH / 2 - textW / 2, y: pl.top, w: textW, h: full * pl.scale };
      e.scale = pl.scale;
    }
    placed.push({ rect: e.rect, from: e.from, to, kind: 'behind' });
  }

  // ---- 4. Captions.
  const subStyle = edit.style.subtitleStyle;
  const fs = captionFontSize(subStyle);
  const boxed = subStyle === 'box';
  const groups = subStyle === 'off' ? [] : makeChunkGroups(words);
  const chunks: Chunk[] = groups.map((g, i) => {
    const next = groups[i + 1];
    const end = g[g.length - 1].to + Math.round(0.45 * FPS);
    const from = Math.max(0, g[0].from - CAPTION_LEAD);
    const to = next ? Math.min(next[0].from - CAPTION_LEAD, end) : Math.min(total, end);
    return { from, to: Math.max(from + 1, to), words: g, top: 0, rect: { x: 0, y: 0, w: 0, h: 0 }, hidden: false };
  });

  const placeCaption = (c: Chunk, obstacles: Rect[]): number | null => {
    const head = headSpan(c.from, c.to);
    const h = estimateCaption(c.words, fs, boxed, 0).h;
    const lower = CAPTION_TOP_LOW + 77 - h;
    const middle = HEIGHT * 0.52 - h / 2;
    const above = head.y - 36 - h;
    const below = head.y + head.h + 36;
    const pos = edit.style.subtitlePosition;
    const base = pos === 'lower' ? [lower, below, middle] : pos === 'middle' ? [middle, below, lower] : [above, below, lower];
    const extra = obstacles.flatMap((o) => [o.y + o.h + 22, o.y - 22 - h]);
    const ok = (t: number) => {
      const r = estimateCaption(c.words, fs, boxed, t);
      return (
        insideSafe(r, SAFE_BOTTOM - 10) && !overlaps(r, head, 16) && !obstacles.some((o) => overlaps(r, o, 12))
      );
    };
    return [...base, ...extra].find(ok) ?? null;
  };

  for (const c of chunks) {
    const obstacles = during(c.from, c.to).map((p) => p.rect);
    let top = placeCaption(c, obstacles);
    if (top === null) top = placeCaption(c, []) ?? CAPTION_TOP_LOW;
    c.top = top;
    c.rect = estimateCaption(c.words, fs, boxed, top);
  }
  const captionPlaced: Placed[] = chunks.map((c) => ({ rect: c.rect, from: c.from, to: c.to, kind: 'caption' }));
  placed.push(...captionPlaced);

  // ---- 5. Stickers: picture / phone / label. Never on the head, a caption or each other.
  const freeAt = (r: Rect, from: number, to: number, head: Rect) =>
    insideSafe(r) && !overlaps(r, head, 20) && !during(from, to).some((p) => overlaps(p.rect, r, 20));

  for (const e of effects) {
    if (e.kind !== 'picture' && e.kind !== 'phone' && e.kind !== 'label') continue;
    const base =
      e.kind === 'picture' ? PICTURE_SIZE : e.kind === 'phone' ? PHONE_SIZE : labelSize(e.text ?? '');
    const to = e.from + e.frames;
    const head = headSpan(e.from, to);
    const away = e.side;
    const other: Side = away === 'right' ? 'left' : 'right';
    let rect: Rect | null = null;
    for (const k of [1, 0.88, 0.75]) {
      const w = base.w * k;
      const h = base.h * k;
      const xOf = (s: Side, y: number) => (s === 'right' ? rightLimit(y, h) - 16 - w : SAFE.side + 16);
      const candidates: Rect[] = [];
      const pos = e.position ?? 'auto';
      const cx = WIDTH / 2 - w / 2;
      if (pos === 'top') candidates.push({ x: cx, y: SAFE.top + 20, w, h });
      if (pos === 'bottom') candidates.push({ x: cx, y: CAPTION_TOP_LOW - 30 - h, w, h });
      if (pos === 'center') candidates.push({ x: cx, y: HEIGHT / 2 - h / 2, w, h });
      if (pos === 'above-head') candidates.push({ x: clamp(head.x + head.w / 2 - w / 2, SAFE.side, SAFE_RIGHT - w), y: head.y - 24 - h, w, h });
      const sides: Side[] = pos === 'left' ? ['left', 'right'] : pos === 'right' ? ['right', 'left'] : [away, other];
      if (e.kind === 'label') {
        // A tag sits beside the head at chin height on the open side.
        for (const s of sides) {
          const y = head.y + head.h * 0.62;
          const lx = s === 'right' ? head.x + head.w + 20 : head.x - 20 - w;
          candidates.push({ x: clamp(lx, SAFE.side, rightLimit(y, h) - w), y, w, h });
        }
      }
      const ys =
        e.kind === 'phone'
          ? [head.y + head.h * 0.5, 560, head.y + head.h + 40, 760]
          : [head.y + head.h * 0.4, head.y + head.h + 40, 560, 820, 380];
      for (const s of sides) for (const y of ys) candidates.push({ x: xOf(s, y), y, w, h });
      candidates.push({ x: cx, y: head.y + head.h + 40, w, h });
      rect = candidates.find((r) => freeAt(r, e.from, to, head)) ?? null;
      if (rect) {
        e.scale = k;
        break;
      }
    }
    e.rect = rect; // null = no room anywhere: the sticker is skipped (better than covering her)
    if (rect) placed.push({ rect, from: e.from, to, kind: e.kind });
  }

  // ---- 6. Cards: checklist / glass. At least 85% so a phone can read them.
  for (const e of effects) {
    if (e.kind !== 'checklist' && e.kind !== 'glass') continue;
    const baseSize = e.kind === 'checklist' ? checklistSize(e) : glassMetrics((e.text ?? '').trim());
    const to = e.from + e.frames;
    const head = headSpan(e.from, to);
    const away = e.side;
    const ok = (r: Rect) => insideSafe(r) && !overlaps(r, head, 24) && !during(e.from, to).some((q) => overlaps(q.rect, r, 16));
    const okNoCaptions = (r: Rect) =>
      insideSafe(r) &&
      !overlaps(r, head, 24) &&
      !during(e.from, to).some((q) => q.kind !== 'caption' && overlaps(q.rect, r, 16));
    let found: { rect: Rect; k: number } | null = null;
    const tryAll = (accept: (r: Rect) => boolean) => {
      for (const k of [1, 0.92, 0.85]) {
        const w = baseSize.w * k;
        const h = baseSize.h * k;
        const cx = WIDTH / 2 - w / 2;
        const midY = clamp(head.y + head.h / 2 - h / 2, SAFE.top, SAFE_BOTTOM - h);
        const sideX = (s: Side, y: number) => (s === 'right' ? rightLimit(y, h) - w : SAFE.side);
        const belowY = head.y + head.h + 30;
        const order: Rect[] = [
          { x: cx, y: Math.max(belowY, (SAFE.top + CAPTION_TOP_LOW) / 2 - h / 2), w, h },
          { x: cx, y: belowY, w, h },
          { x: cx, y: head.y - 30 - h, w, h },
          { x: cx, y: SAFE.top + 20, w, h },
          { x: sideX(away, midY), y: midY, w, h },
          { x: sideX(away === 'right' ? 'left' : 'right', midY), y: midY, w, h },
          { x: cx, y: CAPTION_TOP_LOW + 77 - h, w, h }, // bottom sheet over the body
          { x: cx, y: SAFE_BOTTOM - 10 - h, w, h },
        ];
        if (e.position === 'top' || e.position === 'above-head') order.unshift(order[3], order[2]);
        const hit = order.find(accept);
        if (hit) return { rect: hit, k };
      }
      return null;
    };
    // First without touching any caption; then allow covering captions (they get hidden).
    found = tryAll(ok) ?? tryAll(okNoCaptions);
    if (!found) {
      // Even the body is taken: bottom sheet at 85%, as low as the safe area allows.
      const k = 0.85;
      const w = baseSize.w * k;
      const h = baseSize.h * k;
      found = { rect: { x: WIDTH / 2 - w / 2, y: SAFE_BOTTOM - 10 - h, w, h }, k };
    }
    e.rect = found.rect;
    e.scale = found.k;
    placed.push({ rect: found.rect, from: e.from, to, kind: e.kind });
  }

  // ---- 7. Last caption pass: anything that still touches a card / sticker / big type moves or hides.
  for (const c of chunks) {
    const obstacles = placed.filter((p) => p.kind !== 'caption' && p.from < c.to && c.from < p.to).map((p) => p.rect);
    if (!obstacles.some((o) => overlaps(c.rect, o, 8))) continue;
    const top = placeCaption(c, obstacles);
    if (top === null) c.hidden = true;
    else {
      c.top = top;
      c.rect = estimateCaption(c.words, fs, boxed, top);
    }
  }

  return {
    total,
    cardFrames: endCardFrames(edit),
    compFrames: total + endCardFrames(edit),
    segs,
    words,
    chunks,
    effects,
    speech: speechEnvelope(words, total),
    segmentIndexAt,
    camera,
    faceRect,
    headRect,
    headSpan,
    hookFrames,
    hook,
  };
};
