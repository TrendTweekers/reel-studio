// Batch split: one long video with several reels in it. Between reels she says a short cue word
// ("następny", "kolejny", "next", "cięcie") on its own. Without cue words, long pauses (>= 3 s) split.
import type { Word } from '../src/shared/types';
import { bare, isFiller } from './autoedit';

export const CUE = /^(następn[ya]|kolejn[ya]|next|cięcie)$/i;
const CUE_GAP = 0.8;
const PAUSE_SPLIT = 3.0;
const MIN_PART = 6;
const PAD_START = 0.15;
const PAD_END = 0.3;
const ends = (t: string) => /[.!?…]$/.test(t);

export type Part = { start: number; end: number; words: Word[] };

// Indexes of cue words that stand nearly alone.
export const findCues = (words: Word[]) =>
  words.flatMap((w, i) => {
    if (!CUE.test(bare(w.text))) return [];
    const gapBefore = i > 0 ? w.start - words[i - 1].end : Infinity;
    const gapAfter = i < words.length - 1 ? words[i + 1].start - w.end : Infinity;
    let a = i;
    while (a > 0 && !ends(words[a - 1].text)) a--;
    let b = i;
    while (b < words.length - 1 && !ends(words[b].text)) b++;
    // Nearly alone: its own short sentence, or a pause on both sides, or a pause on one side and
    // punctuation right after it. ("Następny krok to dodatki" after a pause is not a cue.)
    const pauseOne = gapBefore >= CUE_GAP || gapAfter >= CUE_GAP;
    const alone = b - a + 1 <= 2 || (gapBefore >= CUE_GAP && gapAfter >= CUE_GAP) || (pauseOne && /[.,!?…:;]$/.test(w.text));
    return alone ? [i] : [];
  });

export const splitParts = (words: Word[], duration: number): { parts: Part[]; by: 'cue' | 'pause' | 'none' } => {
  const cues = new Set(findCues(words));
  const groups: Word[][] = [[]];
  const bounds: { lo: number; hi: number }[] = [{ lo: 0, hi: duration }];
  if (cues.size) {
    words.forEach((w, i) => {
      if (cues.has(i)) {
        bounds[bounds.length - 1].hi = w.start;
        groups.push([]);
        bounds.push({ lo: w.end, hi: duration });
      } else groups[groups.length - 1].push(w);
    });
  } else {
    words.forEach((w, i) => {
      if (i > 0 && w.start - words[i - 1].end >= PAUSE_SPLIT) {
        groups.push([]);
        bounds.push({ lo: 0, hi: duration });
      }
      groups[groups.length - 1].push(w);
    });
  }
  const parts = groups.flatMap((g, k) => {
    const spoken = g.filter((w) => !isFiller(w));
    if (!spoken.length) return [];
    const start = +Math.max(bounds[k].lo, spoken[0].start - PAD_START, 0).toFixed(3);
    const end = +Math.min(bounds[k].hi, spoken[spoken.length - 1].end + PAD_END, duration).toFixed(3);
    return end - start >= MIN_PART ? [{ start, end, words: g }] : [];
  });
  const by = cues.size ? 'cue' : groups.length > 1 ? 'pause' : 'none';
  return { parts, by };
};
