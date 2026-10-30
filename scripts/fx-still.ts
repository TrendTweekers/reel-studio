// Render one effect on a real reel, to look at it. Needs Reel Studio running (media comes from :8787).
//   npx tsx scripts/fx-still.ts <slug> '<effect json>' [--at 0.1,0.5,0.9] [--out dir] [--video] [--keep] [--no-reels] [--no-cutout]
// The effect JSON is an Effect without id; "at" = source seconds (default: 8). Only this effect is
// shown (hook off, other effects removed) unless --keep. --at = fractions of the effect's length.
// --video also renders the effect window (+0.5 s each side) as an mp4 to check the motion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { FPS, type Edit, type Effect, type ReelProps } from '../src/shared/types';
import { sourceToOutput } from '../src/shared/time';
import { herReels } from '../server/reels';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, json, ...rest] = process.argv.slice(2);
if (!slug || !json) {
  console.error("usage: npx tsx scripts/fx-still.ts <slug> '<effect json>' [--at 0.1,0.5,0.9] [--out dir] [--video] [--keep]");
  process.exit(2);
}
const opt = (k: string) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const dir = path.join(ROOT, 'projects', slug);
const edit: Edit = JSON.parse(fs.readFileSync(path.join(dir, 'edit.json'), 'utf8'));
const fx = { id: 'test', at: 8, duration: 2.5, ...JSON.parse(json) } as Effect;
if (!rest.includes('--keep')) {
  edit.effects = [];
  edit.hook = null;
}
edit.effects.push(fx);
const out = path.resolve(opt('--out') ?? path.join(ROOT, 'fx-test'));
fs.mkdirSync(out, { recursive: true });
const ORIGIN = 'http://localhost:8787';
const inputProps: ReelProps = {
  edit,
  words: JSON.parse(fs.readFileSync(path.join(dir, 'words.json'), 'utf8')),
  faces: JSON.parse(fs.readFileSync(path.join(dir, 'faces.json'), 'utf8')),
  urls: {
    video: `${ORIGIN}/media/${slug}/proxy.mp4`,
    cutout: fs.existsSync(path.join(dir, 'cutout.webm')) && !rest.includes('--no-cutout') ? `${ORIGIN}/media/${slug}/cutout.webm` : null,
    board: `${ORIGIN}/board/`,
    sfx: `${ORIGIN}/sfx/`,
    music: `${ORIGIN}/music/`,
  },
  reels: rest.includes('--no-reels') ? [] : herReels(path.join(ROOT, 'projects'), ORIGIN, slug),
};
const startOut = sourceToOutput(fx.at, edit.segments);
if (startOut === null) throw new Error(`at=${fx.at} is inside a cut-out pause; pick another time`);
const from = Math.round(startOut * FPS);
const frames = fx.kind === 'flash' ? 6 : Math.round(fx.duration * FPS);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps, logLevel: 'error' });
const fracs = (opt('--at') ?? '0.1,0.5,0.9').split(',').map(Number);
for (const f of fracs) {
  const frame = Math.min(composition.durationInFrames - 1, from + Math.round(f * (frames - 1)));
  const file = path.join(out, `${fx.kind}-${String(f).replace('.', '_')}.jpg`);
  await renderStill({ composition, serveUrl, inputProps, frame, imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5, output: file, logLevel: 'error' });
  console.log(file);
}
if (rest.includes('--video')) {
  const a = Math.max(0, from - 15);
  const b = Math.min(composition.durationInFrames - 1, from + frames + 15);
  const file = path.join(out, `${fx.kind}.mp4`);
  await renderMedia({ composition, serveUrl, inputProps, codec: 'h264', frameRange: [a, b], scale: 0.5, outputLocation: file, logLevel: 'error', timeoutInMilliseconds: 120000, concurrency: 2 });
  console.log(file);
}
