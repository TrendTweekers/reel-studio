// Run the critic ("builder is not the judge") on a video that is already made, and print its JSON.
//   npx tsx scripts/critic.ts <slug> [<file in out/>]   (default: the newest Instagram video)
// Measures the video, makes the contact sheet, asks a fresh Claude (her subscription), saves
// out/check/<file>.verdict.json. Does not need Klipownia running.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Edit, ReelProps } from '../src/shared/types';
import { checkVideo } from '../server/videocheck';
import { runCritic, saveVerdict, verdictFile } from '../server/critic';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, fileArg] = process.argv.slice(2);
if (!slug) {
  console.error('usage: npx tsx scripts/critic.ts <slug> [<file in out/>]');
  process.exit(2);
}
const dir = path.join(ROOT, 'projects', slug);
const read = <T>(f: string, d: T): T => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T;
  } catch {
    return d;
  }
};
const out = path.join(dir, 'out');
const name =
  fileArg ??
  fs
    .readdirSync(out)
    .filter((f) => f.endsWith('.mp4') && !f.startsWith('.') && !/ TikTok( \(\d+\))?\.mp4$/i.test(f))
    .sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs)[0];
if (!name || !fs.existsSync(path.join(out, name))) {
  console.error(`no video ${name ?? ''} in ${out}`);
  process.exit(1);
}
// Only the layout model reads these props (no rendering), so the URLs do not need a server.
const O = 'http://localhost:8787';
const props: ReelProps = {
  edit: read<Edit>('edit.json', null as unknown as Edit),
  words: read('words.json', []),
  faces: read('faces.json', []),
  urls: { video: `${O}/media/${slug}/proxy.mp4`, cutout: fs.existsSync(path.join(dir, 'cutout.webm')) ? `${O}/media/${slug}/cutout.webm` : null, board: `${O}/board/`, sfx: `${O}/sfx/`, music: `${O}/music/` },
  reels: [],
};
const language = read<{ brand?: { language?: string } }>('../../settings.json', {}).brand?.language === 'en' ? 'en' : 'pl';
const t0 = Date.now();
const report = await checkVideo(path.join(out, name), props, path.join(out, 'check'));
const t1 = Date.now();
const v = await runCritic(report, props, { cwd: ROOT, language });
saveVerdict(path.join(out, 'check'), v);
console.log(JSON.stringify(v, null, 2));
console.error(`measure + sheet ${((t1 - t0) / 1000).toFixed(1)} s, critic ${((Date.now() - t1) / 1000).toFixed(1)} s -> ${verdictFile(path.join(out, 'check'), name)}`);
