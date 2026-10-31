// Render a story video (edit.format 'story') on a real project's words and voice, to look at it.
// Needs Klipownia running (media comes from :8787).
//   npx tsx scripts/story-still.ts <slug> <patch.json> [--at 1.5,4,9] [--scenes] [--bg cream|ink|accent]
//                                  [--out dir] [--video 3,12] [--keep]
// patch.json = an Edit patch merged over the project's edit.json (format 'story' + story settings).
// --at = OUTPUT seconds. --scenes = two stills per scene (just after it settles, and near its end).
// --video a,b = an mp4 of output seconds a..b. Hook and effects are removed unless --keep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { FPS, type Edit, type ReelProps } from '../src/shared/types';
import { timedScenes } from '../src/shared/story';
import { herReels } from '../server/reels';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, patchFile, ...rest] = process.argv.slice(2);
if (!slug || !patchFile) {
  console.error('usage: npx tsx scripts/story-still.ts <slug> <patch.json> [--at 1.5,4] [--scenes] [--bg ink] [--out dir] [--video 3,12] [--keep]');
  process.exit(2);
}
const opt = (k: string) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const dir = path.join(ROOT, 'projects', slug);
const base: Edit = JSON.parse(fs.readFileSync(path.join(dir, 'edit.json'), 'utf8'));
const patch = JSON.parse(fs.readFileSync(path.resolve(patchFile), 'utf8')) as Partial<Edit>;
const edit: Edit = { ...base, format: 'story', ...patch, style: { ...base.style, ...(patch.style ?? {}) } };
if (!rest.includes('--keep')) {
  edit.effects = patch.effects ?? [];
  edit.hook = patch.hook ?? null;
}
const bg = opt('--bg');
if (bg && edit.story) edit.story = { ...edit.story, background: bg as 'cream' | 'ink' | 'accent' };
if (!edit.story) throw new Error('the patch needs "story": { script, voice, background, scenes }');

const out = path.resolve(opt('--out') ?? path.join(ROOT, 'fx-test', 'story'));
fs.mkdirSync(out, { recursive: true });
const ORIGIN = 'http://localhost:8787';
const inputProps: ReelProps = {
  edit,
  words: JSON.parse(fs.readFileSync(path.join(dir, 'words.json'), 'utf8')),
  faces: [], // a story has no face
  urls: {
    video: `${ORIGIN}/media/${slug}/proxy.mp4`,
    cutout: null,
    board: `${ORIGIN}/board/`,
    sfx: `${ORIGIN}/sfx/`,
    music: `${ORIGIN}/music/`,
  },
  reels: herReels(path.join(ROOT, 'projects'), ORIGIN, slug),
};

const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps, logLevel: 'error' });
const last = composition.durationInFrames - 1;
const shots: { frame: number; name: string }[] = [];
for (const s of (opt('--at') ?? '').split(',').filter(Boolean)) shots.push({ frame: Math.round(Number(s) * FPS), name: `t${s}` });
if (rest.includes('--scenes')) {
  for (const s of timedScenes(edit)) {
    const tag = `${String(s.index + 1).padStart(2, '0')}-${s.kind}`;
    shots.push({ frame: s.from + Math.min(s.frames - 1, 40), name: `${tag}-a` });
    shots.push({ frame: s.from + Math.max(0, s.frames - 14), name: `${tag}-b` });
  }
}
const prefix = edit.story.background;
for (const sh of shots) {
  const file = path.join(out, `${prefix}-${sh.name}.jpg`);
  await renderStill({ composition, serveUrl, inputProps, frame: Math.min(last, Math.max(0, sh.frame)), imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5, output: file, logLevel: 'error' });
  console.log(file);
}
const video = opt('--video');
if (video) {
  const [a, b] = video.split(',').map((x) => Math.round(Number(x) * FPS));
  const file = path.join(out, `${prefix}-${video.replace(',', '-')}.mp4`);
  await renderMedia({ composition, serveUrl, inputProps, codec: 'h264', frameRange: [Math.max(0, a), Math.min(last, b)], scale: 0.5, outputLocation: file, logLevel: 'error', timeoutInMilliseconds: 120000, concurrency: 2 });
  console.log(file);
}
