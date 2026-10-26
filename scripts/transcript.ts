// The transcript as sentences with times, for finding highlights in a long video.
// Usage: npm run transcript -- [slug]
// One line per sentence: [start-end] (length) text. Times are source seconds; use them for /clip.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Word } from '../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(ROOT, 'projects');
const isSlug = (s: string) => fs.existsSync(path.join(PROJECTS, s, 'words.json'));
const slug =
  process.argv[2] ??
  fs
    .readdirSync(PROJECTS)
    .filter(isSlug)
    .sort((a, b) => fs.statSync(path.join(PROJECTS, b)).mtimeMs - fs.statSync(path.join(PROJECTS, a)).mtimeMs)[0];
if (!slug || !isSlug(slug)) {
  console.log('No project with words yet.');
  process.exit(1);
}
const words: Word[] = JSON.parse(fs.readFileSync(path.join(PROJECTS, slug, 'words.json'), 'utf8'));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
console.log(`Project: ${slug}, ${words.length} words, ${fmt(words.at(-1)?.end ?? 0)} long`);
let cur: Word[] = [];
const flush = () => {
  if (!cur.length) return;
  const a = cur[0].start;
  const b = cur[cur.length - 1].end;
  console.log(`[${a.toFixed(2)}-${b.toFixed(2)}] (${fmt(a)}, ${(b - a).toFixed(1)}s) ${cur.map((w) => w.text).join(' ')}`);
  cur = [];
};
words.forEach((w, i) => {
  cur.push(w);
  const next = words[i + 1];
  const longPause = next && next.start - w.end > 1.2;
  if (/[.!?…]$/.test(w.text) || longPause || cur.length >= 40) flush();
});
flush();
