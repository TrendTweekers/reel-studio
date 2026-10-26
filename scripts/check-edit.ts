// Checks a project's edit.json after a change. Usage: npm run check -- <slug>   (no slug = newest project)
// Prints problems and exits 1 if any. The checks themselves are in src/shared/check.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Edit, Word } from '../src/shared/types';
import { outputDuration } from '../src/shared/time';
import { checkEdit } from '../src/shared/check';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(ROOT, 'projects');

const newest = () =>
  fs
    .readdirSync(PROJECTS)
    .filter((s) => fs.existsSync(path.join(PROJECTS, s, 'edit.json')))
    .sort((a, b) => fs.statSync(path.join(PROJECTS, b, 'edit.json')).mtimeMs - fs.statSync(path.join(PROJECTS, a, 'edit.json')).mtimeMs)[0];

const slug = process.argv[2] ?? newest();
if (!slug) {
  console.log('No project with an edit yet.');
  process.exit(1);
}
const dir = path.join(PROJECTS, slug);
if (!fs.existsSync(path.join(dir, 'edit.json'))) {
  console.log(fs.existsSync(dir) ? `${slug} is not ready yet (no edit). Wait until the page shows it as ready.` : `No reel called ${slug}.`);
  process.exit(1);
}
let edit: Edit;
try {
  edit = JSON.parse(fs.readFileSync(path.join(dir, 'edit.json'), 'utf8'));
} catch (e) {
  console.log(`edit.json is not valid JSON: ${(e as Error).message}`);
  process.exit(1);
}
const list = (d: string) => new Set(fs.existsSync(d) ? fs.readdirSync(d) : []);
const words: Word[] = fs.existsSync(path.join(dir, 'words.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'words.json'), 'utf8')) : [];
const problems = checkEdit(edit, {
  words,
  board: list(path.join(ROOT, 'board')),
  music: list(path.join(ROOT, 'assets', 'music')),
  hasCutout: fs.existsSync(path.join(dir, 'cutout.webm')),
});

if (problems.length) {
  console.log(`Problems in ${slug}/edit.json:\n- ` + problems.map((p) => p.detail).join('\n- '));
  process.exit(1);
}
console.log(`OK: ${slug}. ${edit.segments.length} parts, ${outputDuration(edit.segments).toFixed(1)} s long, ${edit.effects.length} effects.`);
