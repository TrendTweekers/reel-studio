// Shows a project's words with their times, so Claude can find "when I say X".
// Usage: npm run words -- [slug] [search]
//   one line per word: index, source start (use this as effect.at), output time, the word, [CUT] if cut.
// Then the effects already in the edit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Edit, Word } from '../src/shared/types';
import { sourceToOutput } from '../src/shared/time';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(ROOT, 'projects');
const args = process.argv.slice(2);
const isSlug = (s: string) => fs.existsSync(path.join(PROJECTS, s, 'words.json'));
const newest = fs
  .readdirSync(PROJECTS)
  .filter(isSlug)
  .sort((a, b) => fs.statSync(path.join(PROJECTS, b)).mtimeMs - fs.statSync(path.join(PROJECTS, a)).mtimeMs)[0];
const slug = args[0] && isSlug(args[0]) ? args.shift()! : newest;
if (!slug) {
  console.log('No project with words yet.');
  process.exit(1);
}
const search = args.join(' ').toLowerCase();
const dir = path.join(PROJECTS, slug);
const words: Word[] = JSON.parse(fs.readFileSync(path.join(dir, 'words.json'), 'utf8'));
const edit: Edit | null = fs.existsSync(path.join(dir, 'edit.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'edit.json'), 'utf8')) : null;
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

console.log(`Project: ${slug}${edit ? `  ("${edit.title}", ${edit.language})` : ''}`);
console.log('idx  at(source)  out    word');
words.forEach((w, i) => {
  if (search && !fold(w.text).includes(fold(search))) return;
  const kept = !edit || edit.segments.some((s) => (w.start + w.end) / 2 >= s.start && (w.start + w.end) / 2 <= s.end);
  const out = edit ? sourceToOutput(w.start, edit.segments) : w.start;
  const fixed = edit?.wordFixes?.[String(i)];
  console.log(
    `${String(i).padStart(3)}  ${w.start.toFixed(2).padStart(9)}  ${out === null ? '  -  ' : out.toFixed(2).padStart(5)}  ${w.text}${fixed ? ` -> ${fixed}` : ''}${kept ? '' : '  [CUT]'}`,
  );
});
if (edit && !search) {
  console.log(`\nEffects (${edit.effects.length}):`);
  for (const e of [...edit.effects].sort((a, b) => a.at - b.at))
    console.log(`  ${e.id}  ${e.kind.padEnd(9)} at ${e.at.toFixed(2)}  ${e.duration}s  ${e.word ?? ''}  ${e.text ?? e.image ?? e.items?.join(' / ') ?? ''}`);
}
