// The reel title. A file name from a phone, a camera or a screen recorder says nothing
// ("IMG_4821", "IMG_E4821", "VID_20261026_101112", "IMG_4821 copy", "source"), and some styles
// print the title in the video. So such names are replaced by her first sentence, and when there
// are no words, the video gets no title at all (never the file name).
import type { Word } from '../src/shared/types';
import { isFiller } from './autoedit';

// Words that appear in camera, phone and screen-recorder file names, and in copy suffixes.
const NAME_WORDS = new Set(
  [
    'img', 'vid', 'mov', 'mvi', 'pxl', 'dsc', 'dscf', 'dscn', 'dji', 'gopr', 'gp', 'rpreplay', 'final', 'trim', 'trimmed',
    'screenrecording', 'screen', 'recording', 'nagranie', 'ekranu', 'whatsapp', 'video', 'wideo', 'film', 'movie', 'clip',
    'reel', 'rolka', 'untitled', 'bez', 'tytułu', 'source', 'copy', 'of', 'kopia', 'at', 'o', 'edit', 'export', 'new', 'nowy',
    'snapchat', 'instagram', 'tiktok', 'capcut', 'inshot', 'portrait', 'hevc', 'proxy', 'output', 'render', 'am', 'pm', 'e',
  ],
);

// True when the title is only a file name: every part is a number, a letters+digits code
// (IMG_E4821, 4K, 20261026T101112) or a word from the list above.
export const isGenericTitle = (raw: string | null | undefined) => {
  const s = (raw ?? '').normalize('NFC').trim().replace(/\.[a-z0-9]{2,4}$/i, '');
  if (!s) return true;
  const parts = s
    .toLowerCase()
    .split(/[\s_\-.()[\]{}+,~#]+/)
    .filter(Boolean);
  if (!parts.length) return true;
  return parts.every((p) => /^\d+$/.test(p) || (/\d/.test(p) && /^[\p{L}\d]+$/u.test(p)) || NAME_WORDS.has(p));
};

// Her first words as a title: "Cześć, dziś pokażę Wam trzy płaszcze." -> "Dziś pokażę Wam trzy płaszcze".
export const titleFromWords = (words: Word[]) => {
  const spoken = words.filter((w) => !isFiller(w));
  // Skip a greeting at the start ("Cześć, dziś pokażę..." -> "Dziś pokażę...").
  while (spoken.length > 3 && /^(cześć|czesc|hej|hejka|siema|hello|hi|hey|witajcie|witam|kochani|dziewczyny)$/i.test(spoken[0].text.replace(/[^\p{L}]/gu, ''))) spoken.shift();
  const out: string[] = [];
  for (const w of spoken) {
    out.push(w.text);
    if (out.length >= 5 && /[.!?…]$/.test(w.text)) break;
    if (out.length >= 7) break;
  }
  const t = out.join(' ').replace(/[.,!?…;:]+$/, '').trim();
  return out.length >= 2 ? t.charAt(0).toUpperCase() + t.slice(1) : null;
};

// The title to use after listening: keep a real name she gave the file, else her first words,
// else nothing ('' prints no title in the video; Home shows "Untitled reel").
export const autoTitle = (current: string | null | undefined, words: Word[]): { title: string; auto: boolean } => {
  if (!isGenericTitle(current)) return { title: (current ?? '').trim(), auto: false };
  return { title: titleFromWords(words) ?? '', auto: true };
};
