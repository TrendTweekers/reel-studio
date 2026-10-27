// The Long (YouTube) model: everything the Long composition draws, precomputed once per props.
// Timing is in OUTPUT frames, layout in composition pixels (the size from longSize()).
// Per-frame work is a binary search into the arrays built here, never a scan.
import { outputChapters, longSize } from '../../shared/long';
import { faceAt, outputFrames, outputWords, segmentFrames, sourceToOutput } from '../../shared/time';
import { FPS, LONG_KINDS, type Effect, type FaceSample, type ReelProps } from '../../shared/types';
import { clamp, isClingy, overlaps, type Rect } from '../model';

export type LongSeg = { from: number; durationInFrames: number; startFrom: number; zoom: number; ox: number; oy: number };
export type LongZoom = { from: number; frames: number; s: number; ox: number; oy: number };
export type LongCard = { id: string; kind: 'picture' | 'label'; from: number; frames: number; side: 'left' | 'right'; x: number; y: number; h: number; image?: string; text?: string };
export type LongChapter = { from: number; frames: number; n: number; title: string; side: 'left' | 'right' };
export type LongLine = { from: number; to: number; lines: string[] };
export type LongNameTag = { from: number; frames: number; name: string; line?: string; side: 'left' | 'right' };

export type LongModel = {
  W: number;
  H: number;
  wide: boolean;
  u: number; // 1 = sizes for a 1080 short side
  margin: number; // side margin, px
  bottom: number; // bottom of the lower-third zone (above the subtitles when they are on), px from top
  subBottom: number; // bottom edge of the subtitle block, px from top
  subSize: number; // subtitle font size, px
  total: number;
  segs: LongSeg[];
  zooms: LongZoom[];
  cards: LongCard[];
  chapters: LongChapter[];
  subtitles: LongLine[];
  nameTag: LongNameTag | null;
  speech: Float32Array | null; // 0..1 per output frame, "she is talking", only when the music ducks
};

export const JUMP_ZOOM = 1.08;
export const MIN_ZOOM_CUT = 1.5; // seconds: never punch in on a shorter cut
export const CHAPTER_SECONDS = 2.5;
const SUB_LEAD = 2; // subtitles show 2 frames before the first word

const faceRect = (f: FaceSample, W: number, H: number): Rect => ({ x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H });
const faceCentre = (f: FaceSample, W: number, H: number) => ({ x: (f.x + f.w / 2) * W, y: (f.y + f.h / 2) * H });

// Deterministic "some cuts": about two out of three eligible cuts change the zoom.
const pick = (i: number) => ((Math.imul(i + 1, 2654435761) >>> 0) % 3) !== 0;

// Index of the last item with from <= frame (items sorted by from), or -1.
export const lastAtOrBefore = <T extends { from: number }>(items: T[], frame: number): number => {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].from <= frame) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
};

// ---------- subtitles: sentence-ish chunks of 1 to 2 lines ----------
const ABBR = /^(dr|np|tj|tzn|itd|itp|ok|prof|mgr|inż|św|ul|nr|mr|mrs|ms|st|vs|etc|e\.g|i\.e)\.$/i;
const STRONG_RE = /[.!?…]["”»)]?$/;
const STRONG = { test: (w: string) => STRONG_RE.test(w) && !ABBR.test(w) };
const SOFT = /[,;:—–]["”»)]?$/;

const splitLines = (words: string[], maxChars: number): string[] => {
  const text = words.join(' ');
  if (text.length <= maxChars || words.length < 2) return [text];
  let best = -1;
  let bestScore = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    if (a.length > maxChars || b.length > maxChars) continue;
    // Balanced lines, a bonus for breaking after punctuation, never after a clingy word.
    let score = Math.abs(a.length - b.length);
    if (SOFT.test(words[k - 1]) || STRONG.test(words[k - 1])) score -= 16;
    if (isClingy(words[k - 1])) score += 100;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) {
    // A very long word somewhere: break as evenly as possible.
    best = Math.max(1, Math.floor(words.length / 2));
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
};

const buildSubtitles = (ws: { text: string; start: number; end: number }[], maxChars: number): LongLine[] => {
  const groups: (typeof ws)[] = [];
  let cur: typeof ws = [];
  const chars = (g: typeof ws) => g.reduce((n, w) => n + w.text.length + 1, -1);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (cur.length && chars(cur) + 1 + w.text.length > maxChars * 2 - 2) {
      // Full: close here, but carry a trailing clingy word into the next chunk.
      const carry = cur.length > 1 && isClingy(cur[cur.length - 1].text) ? cur.pop()! : null;
      groups.push(cur);
      cur = carry ? [carry] : [];
    }
    cur.push(w);
    const next = ws[i + 1];
    const gap = next ? next.start - w.end : 99;
    const n = chars(cur);
    const long = w.end - cur[0].start > 5.5;
    const brk =
      !next ||
      gap > 0.6 ||
      (STRONG.test(w.text) && n >= 12) ||
      (SOFT.test(w.text) && n >= maxChars * 0.8) ||
      long;
    if (brk && !(next && isClingy(w.text) && gap < 0.6)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  const out: LongLine[] = groups.map((g) => ({
    from: Math.max(0, Math.round(g[0].start * FPS) - SUB_LEAD),
    to: Math.round(g[g.length - 1].end * FPS) + 10,
    lines: splitLines(
      g.map((w) => w.text),
      maxChars,
    ),
  }));
  for (let i = 0; i < out.length - 1; i++) out[i].to = Math.min(out[i].to, out[i + 1].from);
  return out.filter((l) => l.to > l.from);
};

// ---------- music ducking envelope ----------
const speechEnvelope = (ws: { start: number; end: number }[], total: number) => {
  const raw = new Float32Array(total);
  const RISE = 6;
  const FALL = 18; // short pauses keep the music down: no pumping between sentences
  for (const w of ws) {
    const a = Math.round(w.start * FPS);
    const b = Math.round(w.end * FPS);
    for (let f = Math.max(0, a - RISE); f < Math.min(total, b + FALL); f++) {
      const v = f < a ? (f - (a - RISE)) / RISE : f > b ? 1 - (f - b) / FALL : 1;
      if (v > raw[f]) raw[f] = v;
    }
  }
  // Running mean over 9 frames: smooth, so the volume never steps.
  const out = new Float32Array(total);
  const R = 4;
  let sum = 0;
  for (let f = 0; f < Math.min(total, R); f++) sum += raw[f];
  for (let f = 0; f < total; f++) {
    if (f + R < total) sum += raw[f + R];
    if (f - R - 1 >= 0) sum -= raw[f - R - 1];
    const n = Math.min(total - 1, f + R) - Math.max(0, f - R) + 1;
    const v = sum / n;
    out[f] = v * v * (3 - 2 * v);
  }
  return out;
};

export const buildLongModel = (props: ReelProps): LongModel => {
  const { edit, faces } = props;
  const { width: W, height: H, wide } = longSize(edit);
  const u = Math.min(W, H) / 1080;
  const margin = Math.round(wide ? W * 0.055 : W * 0.075);
  const total = outputFrames(edit.segments);
  const long = edit.long;
  const showSubs = !!long?.subtitles && edit.style.subtitleStyle !== 'off';
  const subSize = Math.round((wide ? 46 : 50) * u);
  const subBottom = Math.round(wide ? H - H * 0.075 : H - H * 0.11);
  const subBlock = Math.round(subSize * 1.3 * 2 + 24 * u);
  const bottom = showSubs ? subBottom - subBlock - Math.round(24 * u) : Math.round(H - (wide ? H * 0.09 : H * 0.12));

  // Chapter starts (output frames), for the zoom reset and the cards.
  const chapterList = outputChapters(edit);
  const chapterFrames = new Set(chapterList.map((c) => Math.round(c.at * FPS)));

  // ---------- footage + jump zooms ----------
  const raw = segmentFrames(edit.segments);
  let level = 0;
  const segs: LongSeg[] = raw.map((s, i) => {
    const seconds = s.durationInFrames / FPS;
    if (!long?.zoomJumps || i === 0) level = 0;
    else if (chapterFrames.has(s.from)) level = 0; // a new chapter starts wide
    else if (seconds >= MIN_ZOOM_CUT && pick(i)) level = level ? 0 : 1;
    else if (seconds < MIN_ZOOM_CUT) {
      // keep the level: a short cut never gets its own punch-in
    }
    const c = faceCentre(faceAt(s.segment.start + 0.2, faces), W, H);
    return { from: s.from, durationInFrames: s.durationInFrames, startFrom: s.startFrom, zoom: level ? JUMP_ZOOM : 1, ox: c.x, oy: c.y };
  });

  // ---------- effects ----------
  const effects = (edit.effects ?? []).filter((e) => LONG_KINDS.includes(e.kind));
  const timed = (e: Effect) => {
    const t = sourceToOutput(e.at, edit.segments);
    if (t === null) return null;
    const from = Math.round(t * FPS);
    if (from >= total) return null;
    const frames = Math.max(15, Math.min(total - from, Math.round((e.duration || 2.5) * FPS)));
    return { from, frames };
  };

  const zooms: LongZoom[] = [];
  const cards: LongCard[] = [];
  for (const e of effects) {
    const t = timed(e);
    if (!t) continue;
    const f = faceAt(e.at, faces);
    const fr = faceRect(f, W, H);
    const fc = faceCentre(f, W, H);
    if (e.kind === 'zoom') {
      zooms.push({ ...t, s: clamp(e.scale ?? 1.12, 1.02, 1.25), ox: fc.x, oy: fc.y });
      continue;
    }
    const pos = e.position;
    const side: 'left' | 'right' = pos === 'left' ? 'left' : pos === 'right' ? 'right' : fc.x < W / 2 ? 'right' : 'left';
    if (e.kind === 'picture') {
      if (!e.image) continue;
      const h = Math.round(wide ? H / 3 : Math.min(H * 0.27, W * 0.5));
      const w = h * 0.8; // estimate for placement; the real width follows the picture
      // Centre of the free band between the face and the frame edge.
      const gap = 60 * u;
      const lo = side === 'right' ? Math.max(fr.x + fr.w + gap, W / 2) : margin;
      const hi = side === 'right' ? W - margin : Math.min(fr.x - gap, W / 2);
      let x = clamp((lo + hi) / 2, side === 'right' ? lo + w / 2 : lo + w / 2, side === 'right' ? hi - w / 2 : hi - w / 2);
      if (hi - lo < w) x = side === 'right' ? W - margin - w / 2 : margin + w / 2;
      let y = H * (wide ? 0.44 : 0.56);
      const r = { x: x - w / 2, y: y - h / 2, w, h };
      if (overlaps(r, fr, 30 * u)) y = Math.min(fr.y + fr.h + 40 * u + h / 2, bottom - h / 2);
      cards.push({ id: e.id, kind: 'picture', ...t, side, x, y, h, image: e.image, text: e.text?.trim() || undefined });
    } else if (e.kind === 'label') {
      const text = (e.text ?? e.word ?? '').trim();
      if (!text) continue;
      const x = side === 'right' ? W - margin : margin;
      let y = H * (wide ? 0.11 : 0.12);
      const r = { x: side === 'right' ? x - 420 * u : x, y, w: 420 * u, h: 60 * u };
      if (overlaps(r, fr, 20 * u)) y = Math.min(fr.y + fr.h + 40 * u, bottom - 200 * u);
      cards.push({ id: e.id, kind: 'label', ...t, side, x, y, h: 60 * u, text });
    }
  }
  zooms.sort((a, b) => a.from - b.from);
  cards.sort((a, b) => a.from - b.from);

  // Lower-third side: left unless her face sits low on the left.
  const lowerSide = (atSource: number, w: number, h: number): 'left' | 'right' => {
    const fr = faceRect(faceAt(atSource, faces), W, H);
    const left = { x: margin, y: bottom - h, w, h };
    return overlaps(left, fr, 30 * u) ? 'right' : 'left';
  };

  // ---------- chapter cards ----------
  const chapters: LongChapter[] =
    long?.chapterCards && chapterList.length >= 2
      ? chapterList.slice(1).map((c, i) => ({
          from: Math.round(c.at * FPS),
          frames: Math.min(Math.round(CHAPTER_SECONDS * FPS), total - Math.round(c.at * FPS)),
          n: i + 2,
          title: c.title,
          side: lowerSide(c.source, W * (wide ? 0.42 : 0.8), 200 * u),
        }))
      : [];

  // ---------- name tag ----------
  let nameTag: LongNameTag | null = null;
  const nt = long?.nameTag;
  if (nt && nt.name.trim()) {
    const t = sourceToOutput(nt.at, edit.segments);
    if (t !== null) {
      const from = Math.round(t * FPS);
      const frames = Math.max(45, Math.min(total - from, Math.round((nt.duration || 4) * FPS)));
      if (frames > 0) nameTag = { from, frames, name: nt.name.trim(), line: nt.line?.trim() || undefined, side: lowerSide(nt.at, W * (wide ? 0.36 : 0.75), 160 * u) };
    }
  }

  // ---------- subtitles + speech ----------
  const needWords = showSubs || (!!edit.sound.music && edit.sound.duck);
  const ws = needWords ? outputWords(props.words, edit.segments, edit.wordFixes).filter((w) => w.text.trim()) : [];
  const maxChars = Math.max(20, Math.min(42, Math.floor((W - margin * 2) / (subSize * 0.52))));
  const subtitles = showSubs ? buildSubtitles(ws, maxChars) : [];
  const speech = edit.sound.music && edit.sound.duck ? speechEnvelope(ws, total) : null;

  return { W, H, wide, u, margin, bottom, subBottom, subSize, total, segs, zooms, cards, chapters, subtitles, nameTag, speech };
};
