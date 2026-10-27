// Look at a long (YouTube) video: stills and short clips of the "Long" composition, and thumbnails.
// Needs Reel Studio running (media comes from :8787).
//   npx tsx scripts/long-still.ts <slug> [--at 2,17.5,30] [--clip 10,10] [--out dir] [--edit file.json]
//                                [--scale 0.5] [--concurrency 50%] [--plain] [--music-url url/]
//                                [--thumb <source s> ["title"] ["accent"]]
// --at     output seconds for stills (default: the name tag, each chapter card, each picture/label, 1/3)
// --clip   start,seconds (output time): renders an mp4 with sound and prints the speed (frames/s)
// --edit   use this edit.json instead of the project's (the slug still gives the media)
// --plain  footage only: no overlays, subtitles or music (to measure the footage cost)
// --thumb  render the 1280x720 Thumbnail from the frame at this source second
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { faceAt, sourceToOutput } from '../src/shared/time';
import { outputChapters } from '../src/shared/long';
import { FPS, type Edit, type FaceSample, type ReelProps, type ThumbnailProps } from '../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
  console.error('usage: npx tsx scripts/long-still.ts <slug> [--at 2,17.5] [--clip 10,10] [--out dir] [--edit file] [--thumb s "title" "accent"]');
  process.exit(2);
}
const opt = (k: string) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const dir = path.join(ROOT, 'projects', slug);
const editFile = opt('--edit') ?? path.join(dir, 'edit.json');
const edit: Edit = JSON.parse(fs.readFileSync(editFile, 'utf8'));
edit.format = 'long';
if (rest.includes('--plain')) {
  edit.effects = [];
  edit.sound = { ...edit.sound, music: null };
  if (edit.long) edit.long = { ...edit.long, subtitles: false, chapterCards: false, nameTag: null };
}
const out = path.resolve(opt('--out') ?? path.join(ROOT, 'long-test'));
fs.mkdirSync(out, { recursive: true });
const scale = Number(opt('--scale') ?? 0.5);
const ORIGIN = 'http://localhost:8787';
const read = <T>(f: string, fallback: T): T => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const faces: FaceSample[] = read(path.join(dir, 'faces.json'), []);
const inputProps: ReelProps = {
  edit,
  words: read(path.join(dir, 'words.json'), []),
  faces,
  urls: {
    video: `${ORIGIN}/media/${slug}/proxy.mp4`,
    cutout: null,
    board: `${ORIGIN}/board/`,
    sfx: `${ORIGIN}/sfx/`,
    music: opt('--music-url') ?? `${ORIGIN}/music/`,
  },
};

const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts') });

// ---------- thumbnail ----------
const ti = rest.indexOf('--thumb');
if (ti >= 0) {
  const t = Number(rest[ti + 1]);
  const title = rest[ti + 2] && !rest[ti + 2].startsWith('--') ? rest[ti + 2] : undefined;
  const accent = title && rest[ti + 3] && !rest[ti + 3].startsWith('--') ? rest[ti + 3] : undefined;
  const jpg = path.join(out, `frame-${t}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', path.join(dir, 'proxy.mp4'), '-frames:v', '1', '-q:v', '2', jpg]);
  const props: ThumbnailProps = {
    frame: `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`,
    title,
    accent,
    style: edit.style,
    light: edit.light,
    face: faces.length ? faceAt(t, faces) : null,
  };
  const composition = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: props, logLevel: 'error' });
  const file = path.join(out, `thumb-${slug}-${t}${title ? '' : '-clean'}.jpg`);
  await renderStill({ composition, serveUrl, inputProps: props, frame: 0, imageFormat: 'jpeg', jpegQuality: 90, output: file, logLevel: 'error' });
  fs.rmSync(jpg);
  console.log(file);
  process.exit(0);
}

const composition = await selectComposition({ serveUrl, id: 'Long', inputProps, logLevel: 'error' });
console.log(`Long ${composition.width}x${composition.height}, ${composition.durationInFrames} frames (${(composition.durationInFrames / FPS).toFixed(1)} s)`);

// ---------- stills ----------
const toOut = (s: number) => sourceToOutput(s, edit.segments);
let times: number[] = [];
if (opt('--at')) times = opt('--at')!.split(',').map(Number);
else if (!rest.includes('--clip')) {
  const nt = edit.long?.nameTag;
  if (nt) times.push((toOut(nt.at) ?? 0) + 1.2);
  for (const c of outputChapters(edit).slice(1)) times.push(c.at + 1.2);
  for (const e of edit.effects) {
    const t = toOut(e.at);
    if (t !== null && (e.kind === 'picture' || e.kind === 'label' || e.kind === 'zoom')) times.push(t + Math.min(1.2, e.duration * 0.6));
  }
  times.push(composition.durationInFrames / FPS / 3);
}
for (const t of times) {
  const frame = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(t * FPS)));
  const file = path.join(out, `long-${slug}-${composition.width}x${composition.height}-${t.toFixed(2).replace('.', '_')}.jpg`);
  await renderStill({ composition, serveUrl, inputProps, frame, imageFormat: 'jpeg', jpegQuality: 85, scale, output: file, logLevel: 'error' });
  console.log(file);
}

// ---------- clip ----------
const clip = opt('--clip');
if (clip) {
  const [start, secs] = clip.split(',').map(Number);
  const a = Math.max(0, Math.round(start * FPS));
  const b = Math.min(composition.durationInFrames - 1, a + Math.round((secs || 10) * FPS) - 1);
  const file = path.join(out, `long-${slug}-${start}s${rest.includes('--plain') ? '-plain' : ''}.mp4`);
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: 'h264',
    frameRange: [a, b],
    scale: Number(opt('--clip-scale') ?? 1),
    outputLocation: file,
    logLevel: 'error',
    timeoutInMilliseconds: 120000,
    concurrency: opt('--concurrency') ?? '50%',
  });
  const sec = (Date.now() - t0) / 1000;
  const n = b - a + 1;
  console.log(`${file}\n${n} frames in ${sec.toFixed(1)} s = ${(n / sec).toFixed(1)} frames/s (${(n / FPS / sec).toFixed(2)}x real time)`);
}
