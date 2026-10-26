import { FPS, type FaceSample, type Segment, type Word } from './types';

// Total output length in seconds after the cuts.
export const outputDuration = (segments: Segment[]) =>
  segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);

export const outputFrames = (segments: Segment[]) => Math.max(1, Math.round(outputDuration(segments) * FPS));

// Source seconds -> output seconds. A time inside a cut snaps to the start of the next kept part.
// Returns null when the time is after the last kept part.
export const sourceToOutput = (t: number, segments: Segment[]): number | null => {
  let acc = 0;
  for (const s of segments) {
    if (t < s.start) return acc;
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return null;
};

// Output seconds -> source seconds.
export const outputToSource = (t: number, segments: Segment[]): number => {
  let acc = 0;
  for (const s of segments) {
    const len = s.end - s.start;
    if (t <= acc + len) return s.start + (t - acc);
    acc += len;
  }
  const last = segments[segments.length - 1];
  return last ? last.end : 0;
};

// Each kept part placed on the output timeline, in frames. The video component plays one
// <Sequence> per part.
export const segmentFrames = (segments: Segment[]) => {
  let from = 0;
  return segments.map((s) => {
    const frames = Math.max(1, Math.round((s.end - s.start) * FPS));
    const item = { from, durationInFrames: frames, startFrom: Math.round(s.start * FPS), segment: s };
    from += frames;
    return item;
  });
};

// Words that survive the cuts, with output times.
export const outputWords = (words: Word[], segments: Segment[], fixes?: Record<string, string>) =>
  words.flatMap((w, i) => {
    const mid = (w.start + w.end) / 2;
    const kept = segments.some((s) => mid >= s.start && mid <= s.end);
    if (!kept) return [];
    const start = sourceToOutput(w.start, segments);
    const end = sourceToOutput(w.end, segments);
    if (start === null || end === null) return [];
    return [{ index: i, text: fixes?.[String(i)] ?? w.text, start, end: Math.max(end, start + 0.05) }];
  });

// Face box at a source time, linearly between samples. Falls back to a centred head.
export const faceAt = (t: number, faces: FaceSample[]): FaceSample => {
  if (!faces.length) return { t, x: 0.35, y: 0.22, w: 0.3, h: 0.17 };
  if (t <= faces[0].t) return faces[0];
  const last = faces[faces.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = faces.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (faces[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = faces[lo];
  const b = faces[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const mix = (p: number, q: number) => p + (q - p) * k;
  return { t, x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) };
};

// Full video length in frames: the kept parts plus the end card, if it is on.
export const endCardFrames = (edit: { endCard?: { enabled: boolean; seconds: number } }) =>
  edit.endCard?.enabled ? Math.max(1, Math.round(Math.min(6, Math.max(1, edit.endCard.seconds)) * FPS)) : 0;

export const totalFrames = (edit: { segments: Segment[]; endCard?: { enabled: boolean; seconds: number } }) =>
  outputFrames(edit.segments) + endCardFrames(edit);
