// The automatic first edit of a long YouTube video: cut pauses and filler sounds, cut the takes she
// started again ("Dzisiaj pokażę... Dzisiaj pokażę Wam trzy płaszcze"), and rough chapters that
// Claude (yt-long skill) or she can rename. No hook, no pictures: a long video stays calm.
import type { Chapter, Edit, Segment, Word } from '../src/shared/types';
import { defaultLong } from '../src/shared/long';
import { BUILT_IN_STYLES, type EditingStyle } from '../src/shared/styles';
import { bare, cutPauses, isFiller } from './autoedit';

const PAD = 0.08;

// A place where a phrase starts: the first word, after a pause, after a filler, or after punctuation.
const phraseStart = (ws: Word[], i: number, gap: number) =>
  i === 0 || ws[i].start - ws[i - 1].end >= gap || /[.!?…,;:]$/.test(ws[i - 1].text);

const same = (ws: Word[], i: number, j: number, k: number) => {
  for (let n = 0; n < k; n++) if (!ws[i + n] || !ws[j + n] || bare(ws[i + n].text) !== bare(ws[j + n].text)) return false;
  return true;
};
const letters = (ws: Word[], i: number, k: number) => ws.slice(i, i + k).reduce((s, w) => s + bare(w.text).length, 0);

// Repeated takes: a phrase that starts again with the same 3 words within 12 s, after a short stop.
// 2 words are enough when she stopped for 0.7 s or more. Cuts from the first take to the last one.
// Returns source-time ranges to remove.
export const findRetakes = (words: Word[]): Segment[] => {
  const ws = words.filter((w) => !isFiller(w) && bare(w.text));
  // Was there a filler sound ("yyy") right before this word? That counts as a stop too.
  const afterFiller = new Set<Word>();
  words.forEach((w, n) => n > 0 && isFiller(words[n - 1]) && afterFiller.add(w));
  const cuts: Segment[] = [];
  let i = 0;
  while (i < ws.length) {
    let next = -1;
    if (phraseStart(ws, i, 0.25)) {
      for (let j = i + 2; j < ws.length && ws[j].start - ws[i].start <= 12; j++) {
        const stop = ws[j].start - ws[j - 1].end;
        if (stop < 0.35 && !afterFiller.has(ws[j])) continue;
        const three = same(ws, i, j, 3) && letters(ws, i, 3) >= 8;
        const two = stop >= 0.7 && same(ws, i, j, 2) && letters(ws, i, 2) >= 7;
        if (three || two) next = j; // keep looking: the LAST matching take is the good one
      }
    }
    if (next > 0) {
      cuts.push({ start: Math.max(0, ws[i].start - PAD), end: Math.max(0, ws[next].start - PAD) });
      i = next;
    } else i++;
  }
  return cuts;
};

// Segments minus the cut ranges.
export const subtract = (segs: Segment[], cuts: Segment[]): Segment[] => {
  let out = segs.map((s) => ({ ...s }));
  for (const c of cuts) {
    out = out.flatMap((s) => {
      if (c.end <= s.start || c.start >= s.end) return [s];
      const parts: Segment[] = [];
      if (c.start - s.start > 0.12) parts.push({ start: s.start, end: c.start });
      if (s.end - c.end > 0.12) parts.push({ start: c.end, end: s.end });
      return parts;
    });
  }
  return out.map((s) => ({ start: +s.start.toFixed(3), end: +s.end.toFixed(3) }));
};

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const SHORT = new Set(['z', 'w', 'i', 'a', 'na', 'do', 'to', 'że', 'o', 'po', 'bo', 'ale', 'jak', 'się', 'the', 'a', 'and', 'of', 'to', 'in', 'so']);

// A rough title from the first words of a sentence (Claude or she writes the real one).
const roughTitle = (ws: Word[]) => {
  const pick = ws.slice(0, 6).map((w) => w.text.replace(/[.!?…,;:]+$/, ''));
  while (pick.length > 2 && SHORT.has(bare(pick[pick.length - 1]))) pick.pop();
  return capital(pick.join(' ')).slice(0, 60);
};

// Rough chapters: about every 3 to 5 minutes, at the start of the sentence after the longest pause
// near that time. Fewer than 3 possible (short video) = only the first one.
export const autoChapters = (words: Word[], duration: number, language: string): Chapter[] => {
  const ws = words.filter((w) => !isFiller(w));
  const first: Chapter = { at: 0, title: language === 'pl' ? 'Wstęp' : 'Intro' };
  if (duration < 180 || ws.length < 40) return [first];
  const n = Math.max(3, Math.min(10, Math.round(duration / 240)));
  const every = duration / n;
  const out: Chapter[] = [first];
  for (let k = 1; k < n; k++) {
    const target = k * every;
    let best = -1;
    let bestScore = -1;
    for (let i = 1; i < ws.length; i++) {
      if (Math.abs(ws[i].start - target) > every * 0.3) continue;
      const pause = ws[i].start - ws[i - 1].end;
      const score = pause + (/[.!?…]$/.test(ws[i - 1].text) ? 0.6 : 0) - Math.abs(ws[i].start - target) / every;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best > 0 && ws[best].start - out[out.length - 1].at >= 60) out.push({ at: +Math.max(0, ws[best].start - 0.1).toFixed(2), title: roughTitle(ws.slice(best)) });
  }
  return out;
};

export const longFirstEdit = (opts: { title: string; language: string; duration: number; width: number; height: number; words: Word[]; look?: EditingStyle }): Edit => {
  const look = opts.look ?? BUILT_IN_STYLES[0];
  const paused = cutPauses(opts.words, opts.duration, Math.max(0.5, look.pace.pauseGap));
  const retakes = findRetakes(opts.words);
  return {
    version: 1,
    format: 'long',
    title: opts.title,
    language: opts.language,
    source: { duration: opts.duration, width: opts.width, height: opts.height },
    segments: subtract(paused, retakes),
    hook: null,
    style: { ...look.style, subtitleStyle: 'clean', subtitlePosition: 'lower' },
    sound: { ...look.sound, effects: false, music: null, musicVolume: 0.1, duck: true },
    toggles: { zoomJumps: false, progressBar: false, grain: false, glowAboveHead: false },
    styleId: look.id,
    effects: [],
    long: { ...defaultLong(), chapters: autoChapters(opts.words, opts.duration, opts.language), title: opts.title || undefined, retakes: retakes.length },
  };
};
