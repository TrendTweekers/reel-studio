// The automatic first edit of a story video (a video from text): cut the pauses in the voice, and
// make one animated scene per sentence. Claude (or she) then sharpens the scenes: better key words,
// a photo from her board, a compare scene. The scenes follow the SPOKEN words (words.json), so a
// script she changed while reading still lines up.
import type { Edit, StoryScene, StorySettings, Word } from '../src/shared/types';
import { BUILT_IN_STYLES, type EditingStyle } from '../src/shared/styles';
import { bare, cutPauses, firstEdit, isFiller } from './autoedit';

const id = (i: number) => `s${i.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (t: string) => t.replace(/\s+/g, ' ').trim();
const MIN_SCENE = 1.8; // seconds; a shorter sentence joins the one before it

type Sentence = { start: number; end: number; words: Word[]; text: string };

// Sentences from the transcript: a word that ends with . ! ? … closes one.
export const sentencesOf = (words: Word[]): Sentence[] => {
  const ws = words.filter((w) => !isFiller(w) && bare(w.text));
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const close = () => {
    if (!cur.length) return;
    out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur, text: clean(cur.map((w) => w.text).join(' ')) });
    cur = [];
  };
  for (const w of ws) {
    cur.push(w);
    if (/[.!?…]["”»]?$/.test(w.text.trim())) close();
  }
  close();
  // Very short sentences join the one before ("Tak." "I trzeci.").
  const merged: Sentence[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && s.end - s.start < MIN_SCENE) {
      last.end = s.end;
      last.words.push(...s.words);
      last.text = clean(`${last.text} ${s.text}`);
    } else merged.push({ ...s, words: [...s.words] });
  }
  return merged;
};

const ORDINAL = /^(po pierwsze|po drugie|po trzecie|pierwsz[ayie]|drug[aiey]|trzec[iaey]|czwart[yaei]|piąt[yaei]|first|second|third|fourth|fifth|\d+[.)])\b[:,]?\s*/i;
const NUMBER = /(\d+(?:[.,]\d+)?\s*(?:%|zł|pln|€|\$|tys\.?|k)?)/i;

// "Pierwszy: za długie rękawy." -> "Za długie rękawy"
const listItem = (text: string) => {
  const t = text.replace(ORDINAL, '').replace(/[.!?…]+$/, '').trim();
  const short = t.split(/\s+/).slice(0, 6).join(' ');
  return short.charAt(0).toUpperCase() + short.slice(1);
};

// Key words for a 'words' scene: at most about 9 words in 2 or 3 short lines. A long spoken sentence
// keeps only its strongest clause (the subtitles carry the rest); Claude can write better ones.
const keyLines = (text: string) => {
  const t = text.replace(/[.!?…]+$/, '');
  let parts = t.split(/[,;:]\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => p.split(' ').length <= 5)) return parts.join('\n');
  let ws = t.split(/\s+/);
  if (ws.length > 9) {
    const best = [...parts].sort((a, b) => b.replace(/\s/g, '').length - a.replace(/\s/g, '').length)[0] ?? t;
    ws = best.split(/\s+/).slice(0, 8);
  }
  const n = ws.length <= 5 ? 2 : 3;
  const per = Math.ceil(ws.length / n);
  parts = Array.from({ length: n }, (_, i) => ws.slice(i * per, (i + 1) * per).join(' ')).filter(Boolean);
  return parts.join('\n');
};

export const autoScenes = (words: Word[]): StoryScene[] => {
  const ss = sentencesOf(words);
  const scenes: StoryScene[] = [];
  let i = 0;
  while (i < ss.length) {
    const s = ss[i];
    if (i === 0) {
      scenes.push({ id: id(i), at: s.start, kind: 'title', text: s.text.replace(/[.!…]+$/, '') });
      i++;
      continue;
    }
    // Several sentences that count ("Pierwszy... Drugi... Trzeci...") become one list that grows.
    if (ORDINAL.test(s.text)) {
      const items: string[] = [];
      let j = i;
      while (j < ss.length && ORDINAL.test(ss[j].text) && items.length < 6) items.push(listItem(ss[j++].text));
      if (items.length >= 2) {
        scenes.push({ id: id(i), at: s.start, kind: 'list', items });
        i = j;
        continue;
      }
    }
    const num = s.text.match(NUMBER);
    if (num && s.words.length <= 18) {
      scenes.push({ id: id(i), at: s.start, kind: 'number', items: [num[1].replace(/\s+/g, ' ').trim()], text: s.text.replace(/[.!…]+$/, '') });
      i++;
      continue;
    }
    scenes.push({ id: id(i), at: s.start, kind: 'words', text: keyLines(s.text) });
    i++;
  }
  return scenes;
};

export const storyFirstEdit = (opts: {
  title: string;
  language: string;
  duration: number;
  words: Word[];
  script: string;
  voice: StorySettings['voice'];
  background: StorySettings['background'];
  look?: EditingStyle;
}): Edit => {
  const look = opts.look ?? BUILT_IN_STYLES[0];
  const base = firstEdit({ title: opts.title, language: opts.language, duration: opts.duration, words: opts.words, board: [], look });
  // A computer voice has no "yyy" and even pauses: cut only the long ones, so it does not sound rushed.
  const segments = opts.voice === 'ai' ? cutPauses(opts.words, opts.duration, Math.max(0.6, look.pace.pauseGap)) : base.segments;
  return {
    ...base,
    format: 'story',
    segments,
    hook: null, // the first scene is the title, so no hook text on top of it
    effects: [],
    style: { ...base.style, subtitlePosition: 'lower' },
    toggles: { ...base.toggles, zoomJumps: false, glowAboveHead: false },
    story: { script: opts.script, voice: opts.voice, background: opts.background, scenes: autoScenes(opts.words) },
  };
};
