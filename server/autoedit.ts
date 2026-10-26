// The automatic first edit: cut pauses and filler sounds, pick a hook, add a few zooms and pictures.
// Runs after transcription. Re-running it with keepEffects only changes the cuts.
import type { Edit, Effect, FirstEditSummary, Segment, Word } from '../src/shared/types';
import { outputDuration, sourceToOutput } from '../src/shared/time';
import { BUILT_IN_STYLES, type EditingStyle } from '../src/shared/styles';

// Whisper writes "yyy" as "Y" / "y," and "mmm" as "M,". Plain a/e/i/o/u/w/z are Polish words, so
// they are never fillers.
const FILLER = /^(y+|e{2,}|m+|hm+|mhm|eh+|em+|um+|uh+|uhm+)$/;
export const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const isFiller = (w: Word) => FILLER.test(bare(w.text));

const PAD_BEFORE = 0.08;
const PAD_AFTER = 0.14;

export const cutPauses = (words: Word[], duration: number, pauseGap = 0.4): Segment[] => {
  const spoken = words.filter((w) => !isFiller(w));
  if (!spoken.length) return [{ start: 0, end: duration }];
  const segs: Segment[] = [];
  let cur: Segment = { start: Math.max(0, spoken[0].start - PAD_BEFORE), end: spoken[0].end + PAD_AFTER };
  for (let i = 1; i < spoken.length; i++) {
    const w = spoken[i];
    if (w.start - spoken[i - 1].end >= pauseGap) {
      segs.push(cur);
      cur = { start: Math.max(cur.end, w.start - PAD_BEFORE), end: w.end + PAD_AFTER };
    } else {
      cur.end = w.end + PAD_AFTER;
    }
  }
  segs.push(cur);
  return segs
    .map((s) => ({ start: +s.start.toFixed(3), end: +Math.min(duration, s.end).toFixed(3) }))
    .filter((s) => s.end - s.start > 0.12);
};

const sentenceEnd = (t: string) => /[.!?…]$/.test(t);
const clauseEnd = (t: string) => /[.!?…,;:]$/.test(t);
// A hook never ends on one of these short words ("...płaszcz w", "...outfit na").
const FUNCTION_WORDS = new Set(['z', 'za', 'w', 'we', 'i', 'a', 'na', 'do', 'to', 'że', 'o', 'od', 'po', 'dla', 'ze', 'u', 'bo', 'czy', 'jak', 'ale', 'albo', 'oraz', 'przez', 'pod', 'nad', 'przy', 'bez', 'the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'for', 'with', 'my', 'your']);
const GREETING = /^(cześć|czesc|hej|hejka|siema|hello|hi|hey|witajcie|witam|kochani|dziewczyny)$/;
const isNumber = (t: string) => /^\d/.test(bare(t));
const badEnd = (ws: Word[], i: number) => FUNCTION_WORDS.has(bare(ws[i].text)) || (i + 1 < ws.length && isNumber(ws[i + 1].text) && !clauseEnd(ws[i].text));

// The words of the hook: the whole sentence when it is short, else up to the end of a sentence or
// clause within 4 to 8 words, else 8 words cut back so it does not end on a short function word.
const hookWords = (sentence: Word[]): Word[] => {
  const ws = sentence.slice();
  // No filler and no greeting at the start ("Cześć, dziś pokażę..." -> "dziś pokażę...").
  while (ws.length && (isFiller(ws[0]) || (ws.length > 4 && GREETING.test(bare(ws[0].text))))) ws.shift();
  if (!ws.length) return [];
  if (ws[0].text !== sentence[0].text) ws[0] = { ...ws[0], text: ws[0].text.charAt(0).toUpperCase() + ws[0].text.slice(1) };
  if (ws.length <= 8 && !badEnd(ws, ws.length - 1)) return ws;
  for (let i = Math.min(7, ws.length - 1); i >= 3; i--) if (clauseEnd(ws[i].text) && !badEnd(ws, i)) return ws.slice(0, i + 1);
  for (let i = Math.min(7, ws.length - 1); i >= 3; i--) if (!badEnd(ws, i)) return ws.slice(0, i + 1);
  let n = Math.min(ws.length, 3);
  while (n > 1 && badEnd(ws, n - 1)) n--;
  return ws.slice(0, n);
};

const makeHook = (words: Word[], segments: Segment[]): Edit['hook'] => {
  const spoken = words.filter((w) => !isFiller(w));
  if (!spoken.length) return null;
  // The hook is the first real sentence: skip greetings and very short openers ("Cześć!", "Hej kochani!").
  const sentences: Word[][] = [[]];
  for (const w of spoken) {
    sentences[sentences.length - 1].push(w);
    if (sentenceEnd(w.text) || /,$/.test(w.text) && sentences[sentences.length - 1].length >= 9) sentences.push([]);
  }
  const isOpener = (ws: Word[]) => ws.length <= 3 && ws.every((w) => GREETING.test(bare(w.text)) || bare(w.text).length <= 3);
  const chosen = sentences.find((ws) => ws.length >= 3 && !isOpener(ws)) ?? sentences.find((ws) => ws.length) ?? [];
  const first = hookWords(chosen);
  if (!first.length) return null;
  const join = (ws: Word[]) => ws.map((w) => w.text).join(' ');
  const clean = (ws: Word[]) => join(ws).replace(/[.!?…,;:]+$/, '');
  const comma = first.findIndex((w, i) => i < first.length - 1 && /,$/.test(w.text));
  const end = sourceToOutput(first[first.length - 1].end, segments) ?? 2;
  const until = +Math.min(Math.max(end + 0.8, 2.2), 4.5).toFixed(2);
  if (comma >= 1) return { text: join(first.slice(0, comma + 1)).replace(/[.!?…;:]+$/, ''), accent: clean(first.slice(comma + 1)), until };
  return { text: clean(first), until };
};

const id = (n: number) => 'a' + n.toString(36) + Math.random().toString(36).slice(2, 6);

const autoEffects = (words: Word[], segments: Segment[], board: string[], hookUntil: number, pace: EditingStyle['pace']): Effect[] => {
  const kept = words
    .map((w, i) => ({ w, i, out: sourceToOutput(w.start, segments) }))
    .filter((x) => x.out !== null && !isFiller(x.w)) as { w: Word; i: number; out: number }[];
  const effects: Effect[] = [];
  let lastPicture = hookUntil;
  let lastZoom = 1.5;
  let n = 0;
  let pic = 0;
  for (const { w, out } of kept) {
    const len = bare(w.text).length;
    // A picture about every 4 s on a longer word, while we still have board pictures.
    if (board.length && pic < board.length && out - lastPicture >= pace.pictureEvery && len >= 6) {
      effects.push({ id: id(n++), kind: 'picture', at: w.start, duration: 1.6, word: w.text, image: board[pic++], position: 'auto', sfx: 'default' });
      lastPicture = out;
      continue;
    }
    // A zoom about every 6 s, on a word that ends a sentence or is stressed by length.
    if (out - lastZoom >= pace.zoomEvery && (len >= 7 || /[!?]$/.test(w.text))) {
      effects.push({ id: id(n++), kind: 'zoom', at: w.start, duration: 0.8, word: w.text, scale: 1.25, sfx: 'none' });
      lastZoom = out;
    }
  }
  return effects;
};

export const firstEdit = (opts: { title: string; language: string; duration: number; words: Word[]; board: string[]; look?: EditingStyle }): Edit => {
  const look = opts.look ?? BUILT_IN_STYLES[0];
  const segments = cutPauses(opts.words, opts.duration, look.pace.pauseGap);
  const hook = makeHook(opts.words, segments);
  return {
    version: 1,
    title: opts.title,
    language: opts.language,
    source: { duration: opts.duration, width: 1080, height: 1920 },
    segments,
    hook,
    style: { ...look.style },
    sound: { ...look.sound, music: null, musicVolume: 0.25, duck: true },
    toggles: { ...look.toggles },
    styleId: look.id,
    effects: autoEffects(opts.words, segments, opts.board, hook?.until ?? 0, look.pace),
  };
};

// What the first edit did, in numbers, for the "what I did" card on the page.
export const summarizeFirstEdit = (edit: Edit): FirstEditSummary => {
  const dur = edit.source.duration;
  let pausesCut = 0;
  let prev = 0;
  for (const s of edit.segments) {
    if (s.start - prev > 0.1) pausesCut++;
    prev = s.end;
  }
  if (dur - prev > 0.1) pausesCut++;
  const hook = edit.hook ? [edit.hook.text, edit.hook.accent].filter(Boolean).join(' ') : null;
  return { pausesCut, secondsSaved: +Math.max(0, dur - outputDuration(edit.segments)).toFixed(1), hook, effects: edit.effects.length };
};
