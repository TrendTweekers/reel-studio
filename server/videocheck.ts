// "Check my video": after a video is made, look at it the way a careful editor would before she posts.
//  1. Layout, from the same model the video is drawn with: text or a card over her face, subtitles
//     that had to hide, stickers that found no room.
//  2. Picture and sound, measured on the finished file: too dark / too bright parts, loudness.
//  3. A contact sheet (12 frames, 4x3) that Claude looks at with its own eyes.
// The server then asks Claude (her subscription, the Ask box) to read the sheet and the numbers and
// tell her in plain words what to fix. Nothing here changes the reel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildModel, type Rect } from '../src/remotion/model';
import { FPS, type ReelProps } from '../src/shared/types';
import { chapterList, isLong, longSize } from '../src/shared/long';

export type CheckReport = {
  file: string;
  sheet: string; // absolute path of the contact sheet jpg
  times: number[]; // seconds of the 12 sheet frames, left to right, top to bottom
  findings: string[]; // plain sentences with a time
  loudness: { lufs: number | null; peak: number | null };
};

const run = (cmd: string, args: string[]) =>
  new Promise<{ out: string; err: string; code: number | null }>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ out, err, code }));
  });

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h);
const cover = (face: Rect, r: Rect) => {
  const w = Math.min(face.x + face.w, r.x + r.w) - Math.max(face.x, r.x);
  const h = Math.min(face.y + face.h, r.y + r.h) - Math.max(face.y, r.y);
  return w > 0 && h > 0 ? (w * h) / Math.max(1, area(face)) : 0;
};

// Group frame hits into time ranges: [{from, to, what}]
const ranges = (hits: { f: number; what: string }[], gap = FPS) => {
  const out: { from: number; to: number; what: string }[] = [];
  for (const h of hits) {
    const last = out.find((o) => o.what === h.what && h.f - o.to <= gap);
    if (last) last.to = h.f;
    else out.push({ from: h.f, to: h.f, what: h.what });
  }
  return out;
};

export const layoutFindings = (props: ReelProps): string[] => {
  // A long YouTube video has its own calm layout (no hook, stickers or reel safe areas).
  if (isLong(props.edit)) return chapterList(props.edit) ? [] : ['There is no valid chapter list (YouTube needs 3 or more chapters, the first at 0:00, each 10 s or longer).'];
  const m = buildModel(props);
  const hits: { f: number; what: string }[] = [];
  for (let f = 0; f < m.total; f += 3) {
    const face = m.faceRect(f);
    if (m.hook && f < m.hookFrames && cover(face, m.hook.rect) > 0.2) hits.push({ f, what: 'the hook text covers your face' });
    for (const e of m.effects) {
      if (!e.rect || f < e.from || f >= e.from + e.frames) continue;
      if (e.kind === 'behind') continue; // drawn behind her on purpose
      if (cover(face, e.rect) > 0.2) hits.push({ f, what: `the ${e.kind} effect${e.word ? ` on "${e.word}"` : ''} covers your face` });
    }
    for (const c of m.chunks) {
      if (c.hidden || f < c.from || f >= c.to) continue;
      if (cover(face, c.rect) > 0.25) hits.push({ f, what: 'subtitles cover your face' });
    }
  }
  const out = ranges(hits).map((r) => `${mmss(r.from / FPS)}${r.to - r.from > FPS ? `-${mmss(r.to / FPS)}` : ''}: ${r.what}.`);
  const hidden = m.chunks.filter((c) => c.hidden);
  if (hidden.length)
    out.push(`${hidden.length} subtitle line${hidden.length > 1 ? 's are' : ' is'} hidden because a card or effect is in the way (first at ${mmss(hidden[0].from / FPS)}: "${hidden[0].words.map((w) => w.text).join(' ')}").`);
  for (const e of m.effects)
    if ((e.kind === 'picture' || e.kind === 'phone' || e.kind === 'label' || e.kind === 'chart') && !e.rect)
      out.push(`${mmss(e.from / FPS)}: the ${e.kind} effect${e.word ? ` on "${e.word}"` : ''} found no free place, so it does not show.`);
  // Two big moments at the same time look messy.
  const big = m.effects.filter((e) => ['framebreak', 'papercut', 'vertigo', 'pullback', 'greenscreen', 'cover', 'chart', 'glass', 'checklist'].includes(e.kind));
  for (let i = 1; i < big.length; i++)
    if (big[i].from < big[i - 1].from + big[i - 1].frames)
      out.push(`${mmss(big[i].from / FPS)}: two big effects (${big[i - 1].kind} and ${big[i].kind}) are on screen at the same time.`);
  return out;
};

// Brightness over time (limited range 16..235) + loudness of the finished file.
const pictureAndSound = async (video: string, duration: number, long: boolean) => {
  const out: string[] = [];
  const st = await run('ffmpeg', ['-v', 'error', '-i', video, '-vf', 'fps=2,scale=180:-2,signalstats,metadata=print:file=-', '-an', '-f', 'null', '-']);
  const y = [...st.out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((x) => Number(x[1]));
  const dark = y.map((v, i) => ({ f: i * (FPS / 2), what: 'very dark' })).filter((_, i) => y[i] < 48);
  const bright = y.map((v, i) => ({ f: i * (FPS / 2), what: 'very bright (washed out)' })).filter((_, i) => y[i] > 215);
  for (const r of ranges([...dark, ...bright])) out.push(`${mmss(r.from / FPS)}-${mmss(r.to / FPS + 0.5)}: the picture is ${r.what}.`);
  const lo = await run('ffmpeg', ['-v', 'info', '-nostats', '-i', video, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-']);
  // Read the summary at the end, not the running values printed while it measures.
  const summary = lo.err.slice(lo.err.lastIndexOf('Summary:'));
  const lufs = summary.match(/I:\s+(-?[\d.]+) LUFS/);
  const peak = summary.match(/Peak:\s+(-?[\d.]+) dBFS/);
  const loud = { lufs: lufs ? Number(lufs[1]) : null, peak: peak ? Number(peak[1]) : null };
  if (loud.lufs !== null && loud.lufs < -18) out.push(`The sound is quiet (${loud.lufs} LUFS; Instagram is about -14).`);
  if (loud.lufs !== null && loud.lufs > -10) out.push(`The sound is very loud (${loud.lufs} LUFS).`);
  if (!long && duration > 90) out.push(`The video is ${Math.round(duration)} s long; reels under 60 s usually keep more viewers.`);
  return { findings: out, loudness: loud };
};

// 12 frames: the moments with effects first, the rest spread evenly; 4 columns x 3 rows.
const contactSheet = async (video: string, duration: number, props: ReelProps, outFile: string) => {
  const wide = isLong(props.edit) && longSize(props.edit).wide;
  const fx = isLong(props.edit) ? [] : buildModel(props).effects.map((e) => (e.from + e.frames * 0.5) / FPS).filter((t) => t < duration - 0.2);
  const even = Array.from({ length: 12 }, (_, i) => ((i + 0.5) / 12) * duration);
  const picked: number[] = [];
  for (const t of [...fx, ...even]) if (picked.length < 12 && picked.every((p) => Math.abs(p - t) > 1.5)) picked.push(t);
  for (const t of even) if (picked.length < 12 && !picked.includes(t)) picked.push(t);
  const times = picked.sort((a, b) => a - b).map((t) => Math.round(t * 10) / 10);
  const tmp = fs.mkdtempSync(path.join(path.dirname(outFile), '.sheet-'));
  try {
    // Numbered without gaps and read as %02d: Windows ffmpeg builds have no -pattern_type glob.
    let n = 0;
    for (const t of times) {
      const jpg = path.join(tmp, `${String(n).padStart(2, '0')}.jpg`);
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', wide ? 'scale=480:270' : 'scale=360:640', jpg]);
      if (fs.existsSync(jpg)) n++;
    }
    const r = await run('ffmpeg', ['-v', 'error', '-y', '-start_number', '0', '-i', path.join(tmp, '%02d.jpg'), '-vf', 'tile=4x3:padding=6:color=white', '-frames:v', '1', '-q:v', '3', outFile]);
    if (r.code !== 0) throw new Error(`contact sheet failed: ${r.err.slice(-200)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return times;
};

export const checkVideo = async (video: string, props: ReelProps, checkDir: string): Promise<CheckReport> => {
  fs.mkdirSync(checkDir, { recursive: true });
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]);
  const duration = Number(probe.out.trim()) || 0;
  const sheet = path.join(checkDir, `${path.basename(video, '.mp4')}.jpg`);
  const [times, ps] = await Promise.all([contactSheet(video, duration, props, sheet), pictureAndSound(video, duration, isLong(props.edit))]);
  return { file: path.basename(video), sheet, times, findings: [...layoutFindings(props), ...ps.findings], loudness: ps.loudness };
};

// What Claude gets: the numbers and where the picture is. It answers her in the Ask box.
export const checkPrompt = (r: CheckReport) =>
  [
    `I just made the video "${r.file}". Please check it before I post it.`,
    `Look at the contact sheet ${r.sheet} with the Read tool: 12 frames, 4 per row, left to right, top to bottom, at ${r.times.map(mmss).join(', ')}.`,
    `Automatic checks found: ${r.findings.length ? r.findings.join(' ') : 'nothing.'} Loudness: ${r.loudness.lufs ?? '?'} LUFS.`,
    'Judge it like a fashion editor: her face clear, text readable, effects tasteful and not covering each other, light and colour pleasant, nothing cut off.',
    'Answer me in my language, short: if it is good, say so in one sentence. Otherwise list at most 5 problems, each with its time and the fix you suggest. Do NOT change the reel; ask me first.',
  ].join('\n');
