// Run: npx tsx server/longedit.test.ts
// Repeated takes are cut (the last take stays); normal speech and lists are never cut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Word } from '../src/shared/types';
import { autoChapters, findRetakes, longFirstEdit, subtract } from './longedit';
import { chapterList, outputChapters } from '../src/shared/long';

// Words from a sentence; "|" = a stop of 0.8 s, "/" = 0.4 s.
const say = (text: string, t0 = 0): Word[] => {
  const out: Word[] = [];
  let t = t0;
  for (const tok of text.split(' ')) {
    if (tok === '|') { t += 0.8; continue; }
    if (tok === '/') { t += 0.4; continue; }
    out.push({ text: tok, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) });
    t += 0.35;
  }
  return out;
};

// 1. A restart with the same 3 words: cut from the first take to the second.
let ws = say('Dzisiaj pokażę Wam / Dzisiaj pokażę Wam trzy płaszcze na jesień.');
let cuts = findRetakes(ws);
assert.equal(cuts.length, 1);
assert.ok(Math.abs(cuts[0].end - (ws[3].start - 0.08)) < 1e-6, 'cut ends right before the good take');

// 2. Three takes: only the last stays.
ws = say('Ten płaszcz jest | Ten płaszcz jest / Ten płaszcz jest idealny na jesień.');
cuts = findRetakes(ws);
assert.equal(cuts.length, 1, JSON.stringify(cuts));
assert.ok(Math.abs(cuts[0].end - (ws[6].start - 0.08)) < 1e-6);

// 3. Two words are enough after a long stop.
ws = say('Kolejna stylizacja, | Kolejna stylizacja to beżowy trencz.');
assert.equal(findRetakes(ws).length, 1);

// 4. Lists and normal speech are not cut.
for (const text of [
  'Po pierwsze płaszcz. / Po drugie buty. / Po trzecie torebka.',
  'To jest ważne, to jest naprawdę ważne dla mnie.',
  'Bardzo bardzo bardzo lubię ten kolor.',
  'Ten płaszcz jest piękny, a ten płaszcz obok jest tańszy.',
]) assert.equal(findRetakes(say(text)).length, 0, text);

// 5. A repeat with no stop is not a retake.
assert.equal(findRetakes(say('Dzisiaj pokażę Wam Dzisiaj pokażę Wam')).length, 0);

// 6. subtract
assert.deepEqual(subtract([{ start: 0, end: 10 }], [{ start: 2, end: 4 }]), [{ start: 0, end: 2 }, { start: 4, end: 10 }]);

// 7. Chapters on a real transcript stretched to 20 min: first at 0, 3+ apart >= 60 s, YouTube list valid.
const real: Word[] = JSON.parse(fs.readFileSync(new URL('../projects/2026-10-26-img-4821/words.json', import.meta.url), 'utf8'));
const long: Word[] = [];
for (let k = 0; k < 20; k++) for (const w of real) long.push({ ...w, start: w.start + k * 60, end: w.end + k * 60 });
const ch = autoChapters(long, 1200, 'pl');
assert.equal(ch[0].at, 0);
assert.ok(ch.length >= 3, `chapters: ${ch.length}`);
for (let i = 1; i < ch.length; i++) assert.ok(ch[i].at - ch[i - 1].at >= 60);
const edit = longFirstEdit({ title: 'Test', language: 'pl', duration: 1200, width: 1920, height: 1080, words: long });
assert.equal(edit.format, 'long');
const list = chapterList(edit);
assert.ok(list.startsWith('0:00 Wstęp'), list);
assert.equal(outputChapters(edit).length, ch.length);
console.log(`ok: ${ch.length} chapters, ${edit.long?.retakes} retakes, ${edit.segments.length} segments\n${list}`);
