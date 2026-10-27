// Run: npx tsx server/title.test.ts
// The title must never be a file name, because some styles print the title in the video.
import assert from 'node:assert/strict';
import type { Word } from '../src/shared/types';
import { autoTitle, isGenericTitle, titleFromWords } from './title';

const w = (text: string, i: number): Word => ({ text, start: i, end: i + 0.4 }) as Word;
const words = 'Cześć, dziś pokażę Wam trzy płaszcze na jesień. I jeszcze coś'.split(' ').map(w);

const generic = [
  'IMG_4821', 'IMG_E4821', 'IMG 4821', 'img_4821.MOV', 'IMG_4821 copy', 'IMG_4821 copy 2', 'IMG_4821 (1)', 'Kopia IMG_4821',
  'Copy of IMG_4821', 'IMG_4821-2', 'VID_20261026_101112', 'VID-20261026-WA0003', 'PXL_20261026_101112345', 'MOV_0012',
  'DSC_0001', 'DSCF1234', 'MVI_1234', 'GOPR0001', 'DJI_0001', 'RPReplay_Final1698765432', 'ScreenRecording_10-26-2026 10-11-12',
  'Screen Recording 2026-10-26 at 10.11.12', 'source', 'Source', 'video', 'untitled', 'trim', '4821', '20261026_101112',
  'abc123', 'X7', 'reel 2', '',
];
const real = ['Jesienne stylizacje', 'Jesienne stylizacje 2', 'paulina test kozaki torebka', 'Płaszcz na jesień', 'Moje 3 płaszcze', 'Kozaki', 'Vogue look'];

for (const g of generic) assert.equal(isGenericTitle(g), true, `should be generic: "${g}"`);
for (const r of real) assert.equal(isGenericTitle(r), false, `should be kept: "${r}"`);

assert.equal(titleFromWords(words), 'Dziś pokażę Wam trzy płaszcze na jesień');
for (const g of generic) {
  const t = autoTitle(g, words);
  assert.equal(t.title, 'Dziś pokażę Wam trzy płaszcze na jesień', g);
  // With no words: no title at all, never the file name.
  assert.equal(autoTitle(g, []).title, '', g);
}
for (const r of real) assert.equal(autoTitle(r, words).title, r);

console.log(`title: ${generic.length} file names replaced, ${real.length} real names kept. OK`);
