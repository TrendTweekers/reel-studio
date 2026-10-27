// Reel Studio local server. Serves the editor page, the media files, and runs the analysis
// tools and the render. Everything stays on this computer.
import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverCandidate, CoverProps, Edit, ErrorCode, FaceSample, ProjectMeta, ProjectStatus, ProjectStep, ReelProps, RenderVariant, Word } from '../src/shared/types';
import { faceAt } from '../src/shared/time';
import { SFX_NAMES } from '../src/shared/types';
import { checkEdit } from '../src/shared/check';
import { cutPauses, firstEdit, isFiller, summarizeFirstEdit } from './autoedit';
import { measureLight } from './light';
import { checkPrompt, checkVideo } from './videocheck';
import { BUILT_IN_STYLES, applyStyle, type EditingStyle } from '../src/shared/styles';
import { JobQueue, children, killAll, track } from './jobs';
import { PLAIN, mapError } from './errors';
import { makeHistory } from './history';
import { normalizeLoudness } from './loudness';
import { AUDIO, IMAGE, intake } from './intake';
import { splitParts } from './split';
import { mountLooks } from './looks';
import { autoTitle, isGenericTitle, titleFromWords } from './title';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(ROOT, 'projects');
const BOARD = path.join(ROOT, 'board');
const SFX = path.join(ROOT, 'assets', 'sfx');
const MUSIC = path.join(ROOT, 'assets', 'music');
const STYLES = path.join(ROOT, 'styles');
const SETTINGS = path.join(ROOT, 'settings.json');
const INCOMING = path.join(ROOT, '.incoming'); // temp folder for board/music uploads (same disk, so rename works)
const PORT = Number(process.env.PORT ?? 8787);
const ORIGIN = `http://localhost:${PORT}`;
const PYTHON = process.env.REEL_PYTHON ?? path.join(ROOT, '.venv', 'bin', 'python');
if (process.env.FFMPEG_BIN_DIR) process.env.PATH = `${process.env.FFMPEG_BIN_DIR}${path.delimiter}${process.env.PATH}`;

for (const d of [PROJECTS, BOARD, MUSIC, STYLES, INCOMING]) fs.mkdirSync(d, { recursive: true });

// A last guard: one bad event handler must never take the whole server (and every running job) down.
process.on('uncaughtException', (e) => console.error(`[${new Date().toISOString()}] uncaught exception:`, e));
process.on('unhandledRejection', (e) => console.error(`[${new Date().toISOString()}] unhandled rejection:`, e));

type Step = ProjectStep;
type Status = ProjectStatus;

const dir = (slug: string) => path.join(PROJECTS, slug);
const file = (slug: string, name: string) => path.join(dir(slug), name);
const readJson = <T>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
};
const writeJson = (p: string, data: unknown) => {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
};
const safeSlug = (s: string) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);
const safeFile = (s: string) => /^[^/\\]+$/.test(s) && !s.startsWith('.');
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const listFiles = (d: string, exts: RegExp) =>
  fs.existsSync(d) ? fs.readdirSync(d).filter((f) => exts.test(f) && !f.startsWith('.')).sort() : [];
const mtime = (p: string) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

const status = (slug: string): Status => readJson(file(slug, 'status.json'), { step: 'error', progress: 0, message: PLAIN.unknown, code: 'unknown' } as Status);
// Never throws: the reel may have been deleted while a tool was still reporting.
const setStatus = (slug: string, s: Status) => {
  try {
    if (fs.existsSync(dir(slug))) writeJson(file(slug, 'status.json'), s);
  } catch (e) {
    console.error(`setStatus ${slug}:`, (e as Error).message);
  }
};
const toolLog = (slug: string, text: string) => {
  try {
    if (fs.existsSync(dir(slug))) fs.appendFileSync(file(slug, 'tools.log'), text);
  } catch {
    /* the reel is gone */
  }
};
const meta = (slug: string) => readJson<Partial<ProjectMeta>>(file(slug, 'meta.json'), {});
const setMeta = (slug: string, patch: Partial<ProjectMeta>) => {
  try {
    if (fs.existsSync(dir(slug))) writeJson(file(slug, 'meta.json'), { ...meta(slug), ...patch });
  } catch (e) {
    console.error(`setMeta ${slug}:`, (e as Error).message);
  }
};
const editVersion = (slug: string) => Math.round(mtime(file(slug, 'edit.json')));

// Every server write of edit.json goes through history.write (saves the version it replaces).
const history = makeHistory(dir);
const writeEdit = (slug: string, edit: Edit, by: 'page' | 'claude' | 'auto', opts?: { always?: boolean }) => history.write(slug, edit, by, opts);

class ToolError extends Error {
  constructor(
    message: string,
    public code?: ErrorCode,
  ) {
    super(message);
  }
}
const plainOf = (e: unknown, fallback: ErrorCode = 'unknown') => {
  const code = (e as ToolError).code;
  return code ? { code, message: PLAIN[code] } : mapError((e as Error).message ?? String(e), fallback);
};

// Runs one tool in tools/. Each tool prints JSON lines: {"step","progress"} ... {"done":true} or {"error"}.
const runTool = (slug: string, tool: string, step: Step, args: string[] = []) =>
  new Promise<void>((resolve, reject) => {
    setStatus(slug, { step, progress: 0 });
    // Own process group, so stopping the server also stops the ffmpeg the tool started.
    const p = track(spawn(PYTHON, [path.join(ROOT, 'tools', `${tool}.py`), dir(slug), ...args], { cwd: ROOT, env: process.env, detached: true }));
    let err = '';
    let lastError = '';
    let buf = '';
    let settled = false;
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const m = JSON.parse(line);
          if (typeof m.progress === 'number') setStatus(slug, { step, progress: Math.max(0, Math.min(1, m.progress)) });
          if (m.error) lastError = String(m.error);
        } catch {
          /* not a progress line */
        }
      }
    });
    p.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    p.on('error', (e) => {
      if (settled) return;
      settled = true;
      toolLog(slug, `\n== ${tool} could not start: ${e.message}\n`);
      reject(new ToolError(`Could not start ${tool}: ${e.message}`, 'tool_missing'));
    });
    p.on('close', (code) => {
      if (settled) return;
      settled = true;
      toolLog(slug, `\n== ${tool} exit ${code}\n${err}${lastError ? `\n${lastError}\n` : ''}`);
      if (code === 0) resolve();
      else reject(new ToolError(`${lastError || `${tool} failed (exit ${code})`}\n${err.slice(-1500)}`));
    });
  });

const probeDuration = (p: string) =>
  new Promise<number>((resolve) => {
    const f = track(spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]));
    let out = '';
    f.stdout.on('data', (d: Buffer) => (out += d.toString()));
    f.on('close', () => resolve(Number(out.trim()) || 0));
    f.on('error', () => resolve(0));
  });

// ---- Editing styles ----
const ownStyles = (): EditingStyle[] => listFiles(STYLES, /\.json$/).map((f) => readJson<EditingStyle | null>(path.join(STYLES, f), null)).filter((x): x is EditingStyle => !!x?.id);
const allStyles = () => [...BUILT_IN_STYLES.map((s) => ({ ...s, own: false })), ...ownStyles().map((s) => ({ ...s, own: true }))];
const settings = () => readJson<{ defaultStyle?: string; autoCheck?: boolean }>(SETTINGS, {});
const defaultLook = () => allStyles().find((s) => s.id === settings().defaultStyle) ?? BUILT_IN_STYLES[0];

let shuttingDown = false;

// ---- Job queues ----
// analyseQ: new videos, one at a time, in order. heavyQ: cut-out, cover frames, cover stills, render.
const analyseQ = new JobQueue('analyse');
const heavyQ = new JobQueue('heavy');

const sourceOf = (slug: string) => {
  try {
    const f = fs.readdirSync(dir(slug)).find((x) => /^source\.[a-z0-9]+$/i.test(x));
    return f ? file(slug, f) : null;
  } catch {
    return null;
  }
};
const jsonArrayOk = (p: string) => {
  try {
    return Array.isArray(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch {
    return false;
  }
};

const runAnalyse = async (slug: string, force: boolean) => {
  try {
    const src = sourceOf(slug);
    if (!src) throw new ToolError('no source file', 'upload_incomplete');
    const srcTime = mtime(src);
    // Resume from the first missing output (a restart must not redo 20 minutes of work).
    const fresh = (name: string) => mtime(file(slug, name)) >= srcTime && fs.statSync(file(slug, name)).size > 1000;
    let normalized = false;
    if (!force && fs.existsSync(file(slug, 'proxy.mp4')) && fs.existsSync(file(slug, 'audio16k.wav')) && fresh('proxy.mp4') && fresh('audio16k.wav')) {
      const [pd, wd] = await Promise.all([probeDuration(file(slug, 'proxy.mp4')), probeDuration(file(slug, 'audio16k.wav'))]);
      normalized = pd > 0 && Math.abs(pd - wd) < 1;
    }
    if (!normalized) await runTool(slug, 'normalize', 'normalize');
    if (force || !jsonArrayOk(file(slug, 'words.json'))) {
      await runTool(slug, 'transcribe', 'transcribe', process.env.REEL_LANGUAGE ? ['--language', process.env.REEL_LANGUAGE] : []);
      // A file name ("IMG_4821", "VID_...", "source") never becomes the title: some styles print it.
      const m = meta(slug);
      if (isGenericTitle(m.title)) {
        const t = autoTitle(m.title, readJson<Word[]>(file(slug, 'words.json'), []));
        setMeta(slug, { title: t.title, autoTitle: true });
      }
    }
    if (force || !jsonArrayOk(file(slug, 'faces.json'))) await runTool(slug, 'faces', 'faces');
    setStatus(slug, { step: 'autoedit', progress: 0.5 });
    if (!fs.existsSync(file(slug, 'edit.json'))) {
      const transcript = readJson<{ language?: string }>(file(slug, 'transcript.json'), {});
      const edit = firstEdit({
        title: isGenericTitle(meta(slug).title) ? '' : (meta(slug).title ?? ''),
        language: transcript.language ?? 'pl',
        duration: await probeDuration(file(slug, 'proxy.mp4')),
        words: readJson(file(slug, 'words.json'), []),
        board: listFiles(BOARD, IMAGE),
        look: defaultLook(),
      });
      // Auto light fix, measured once from her video. A failed measure just leaves it off.
      try {
        edit.light = { auto: true, strength: 1, fix: await measureLight(file(slug, 'proxy.mp4')) };
      } catch (e) {
        toolLog(slug, `\n== light measure skipped: ${(e as Error).message}\n`);
      }
      writeEdit(slug, edit, 'auto');
      setMeta(slug, { summary: summarizeFirstEdit(edit) });
    }
    setStatus(slug, { step: 'ready', progress: 1 });
    const b = meta(slug).batch;
    if (b?.requested && !b.clips?.length && !b.reason) {
      const r = splitProject(slug);
      toolLog(slug, `\n== batch split: ${r.slugs.length} clips${r.reason ? ` (${r.reason})` : ''}\n`);
    }
  } catch (e) {
    // Stopped by a server shutdown: keep the step, so the next start continues from here.
    if (shuttingDown) return;
    toolLog(slug, `\n== analyse error\n${(e as Error).message}\n`);
    const m = plainOf(e);
    setStatus(slug, { step: 'error', progress: 0, code: m.code, message: m.message });
  }
};

const analyse = (slug: string, force = false) => {
  if (analyseQ.has(slug)) return false;
  analyseQ.push({
    slug,
    kind: 'analyse',
    run: () => runAnalyse(slug, force),
    onPosition: (position) => setStatus(slug, { step: 'queued', progress: 0, position, queuedFor: 'analyse' }),
  });
  return true;
};

// A heavy tool job that reports in status.json (cut-out, cover frames).
const toolJob = (slug: string, kind: 'cutout' | 'covers', tool: string, failText: string) => {
  if (heavyQ.has(slug, kind)) return false;
  heavyQ.push({
    slug,
    kind,
    onPosition: (position) => setStatus(slug, { step: 'queued', progress: 0, position, queuedFor: kind }),
    run: async () => {
      try {
        await runTool(slug, tool, kind);
        setStatus(slug, { step: 'ready', progress: 1 });
      } catch (e) {
        if (shuttingDown) return;
        const m = plainOf(e);
        setStatus(slug, { step: 'ready', progress: 1, code: m.code, message: `${failText}: ${m.message}` });
      }
    },
  });
  return true;
};
const makeCutout = (slug: string) => toolJob(slug, 'cutout', 'cutout', 'Cut-out failed');
const findCovers = (slug: string) => toolJob(slug, 'covers', 'cover_frames', 'Cover frames failed');

// ---- Render ----
type RenderJob = { running: boolean; progress: number; file?: string; error?: string; code?: ErrorCode; stage?: string; queued?: boolean; position?: number; stopped?: boolean; check?: 'started' | 'skipped'; noCheck?: boolean };
const renders = new Map<string, RenderJob>();
const cancels = new Set<() => void>();

// The render state is also kept on disk (out/render-<variant>.json), written as it changes. After a
// restart (app quit, Mac asleep, update) a file that still says "running" means the video stopped
// before it was done, so the page can say so instead of nothing.
const renderStateFile = (slug: string, variant: RenderVariant) => file(slug, `out/render-${variant}.json`);
const saveRenderState = (slug: string, variant: RenderVariant, job: RenderJob) => {
  try {
    if (!fs.existsSync(dir(slug))) return;
    fs.mkdirSync(file(slug, 'out'), { recursive: true });
    writeJson(renderStateFile(slug, variant), {
      running: job.running,
      progress: job.progress,
      stage: job.stage,
      file: job.file,
      url: job.file ? `/media/${slug}/out/${encodeURIComponent(job.file)}` : undefined,
      error: job.error,
      code: job.code,
      stopped: job.stopped || undefined,
      at: new Date().toISOString(),
    });
  } catch {
    /* a full disk must not stop the render */
  }
};
// The last known state when this server has no job in memory (it was restarted).
const savedRenderState = (slug: string, variant: RenderVariant): RenderJob | null => {
  const j = readJson<RenderJob | null>(renderStateFile(slug, variant), null);
  if (!j || typeof j !== 'object') return null;
  if (j.running) return { running: false, progress: j.progress ?? 0, stopped: true };
  if (j.file && !fs.existsSync(file(slug, `out/${j.file}`))) return null;
  return { running: false, progress: j.progress ?? 0, file: j.file, error: j.error, code: j.code, stage: j.stage, stopped: j.stopped };
};

// The bundle is rebuilt when any file under src/remotion or src/shared changes (a new effect).
const newestUnder = (d: string): number => {
  let max = 0;
  try {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      max = Math.max(max, e.isDirectory() ? Math.max(mtime(p), newestUnder(p)) : mtime(p));
    }
  } catch {
    /* missing folder */
  }
  return max;
};
let bundlePromise: Promise<string> | null = null;
let bundleKey = 0;
const getBundle = async () => {
  const key = Math.max(newestUnder(path.join(ROOT, 'src', 'remotion')), newestUnder(path.join(ROOT, 'src', 'shared')));
  if (!bundlePromise || key !== bundleKey) {
    bundleKey = key;
    const { bundle } = await import('@remotion/bundler');
    bundlePromise = bundle({ entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts') }).catch((e) => {
      bundlePromise = null;
      throw e;
    });
  }
  return bundlePromise;
};

export const reelProps = (slug: string, origin = ORIGIN): ReelProps => ({
  edit: readJson<Edit>(file(slug, 'edit.json'), null as unknown as Edit),
  words: readJson(file(slug, 'words.json'), []),
  faces: readJson(file(slug, 'faces.json'), []),
  urls: {
    video: `${origin}/media/${slug}/proxy.mp4`,
    cutout: fs.existsSync(file(slug, 'cutout.webm')) ? `${origin}/media/${slug}/cutout.webm` : null,
    board: `${origin}/board/`,
    sfx: `${origin}/sfx/`,
    music: `${origin}/music/`,
  },
});

// "<Title> <dd.mm HH-MM>.mp4" in local time. Polish letters stay; only characters that a Mac or
// Windows file system refuses are removed.
const renderName = (slug: string, variant: RenderVariant = 'instagram') => {
  const title =
    (meta(slug).title || readJson<Partial<Edit>>(file(slug, 'edit.json'), {}).title || slug)
      .normalize('NFC')
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/^[.\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .trim() || slug;
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const base = `${title} ${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}-${p2(d.getMinutes())}${variant === 'tiktok' ? ' TikTok' : ''}`;
  let name = `${base}.mp4`;
  for (let i = 2; fs.existsSync(file(slug, `out/${name}`)); i++) name = `${base} (${i}).mp4`;
  return name;
};

// The TikTok version: the same edit with its own hook and end-card line.
const variantProps = (slug: string, variant: RenderVariant): ReelProps => {
  const props = reelProps(slug);
  const tk = props.edit?.tiktok;
  if (variant !== 'tiktok' || !props.edit || !tk) return props;
  const edit: Edit = { ...props.edit };
  if (tk.hook !== undefined) edit.hook = tk.hook;
  // A TikTok line like "Link w bio" replaces the comment call to action, so the Instagram sub line
  // ("a wyślę Ci link") would contradict it: drop it unless the TikTok version sets its own.
  if (edit.endCard?.enabled && tk.endCardLine) edit.endCard = { ...edit.endCard, line: tk.endCardLine, sub: tk.endCardSub ?? '' };
  return { ...props, edit };
};
const isTikTokFile = (f: string) => / TikTok( \(\d+\))?\.mp4$/i.test(f);
const variantOf = (v: unknown): RenderVariant => (v === 'tiktok' ? 'tiktok' : 'instagram');
const renderKey = (slug: string, variant: RenderVariant) => `${slug}|${variant}`;

const doRender = async (slug: string, job: RenderJob, variant: RenderVariant = 'instagram') => {
  job.queued = false;
  delete job.position;
  job.stage = 'Preparing';
  const save = () => saveRenderState(slug, variant, job);
  let savedPct = -1;
  save();
  const outDir = file(slug, 'out');
  const tmp = path.join(outDir, `.rendering-${Date.now()}.mp4`);
  try {
    const { renderMedia, selectComposition, makeCancelSignal } = await import('@remotion/renderer');
    const serveUrl = await getBundle();
    const inputProps = variantProps(slug, variant);
    const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps });
    fs.mkdirSync(outDir, { recursive: true });
    job.stage = 'Making the video';
    save();
    const once = async () => {
      const { cancelSignal, cancel } = makeCancelSignal();
      cancels.add(cancel);
      try {
        await renderMedia({
          composition,
          serveUrl,
          codec: 'h264',
          crf: 18,
          audioBitrate: '192k',
          colorSpace: 'bt709',
          outputLocation: tmp,
          inputProps,
          cancelSignal,
          // A slow or busy Mac must not fail the render: give each frame time and use half the cores.
          timeoutInMilliseconds: 120000,
          concurrency: '50%',
          onProgress: ({ progress }) => {
            job.progress = Math.min(0.98, progress);
            const pct = Math.floor(job.progress * 100);
            if (pct !== savedPct) {
              savedPct = pct;
              save();
            }
          },
        });
      } finally {
        cancels.delete(cancel);
      }
    };
    try {
      await once();
    } catch (e) {
      if (shuttingDown) throw e;
      // One automatic retry: a timeout on a busy computer usually passes the second time.
      job.progress = 0;
      toolLog(slug, `\n== render retry after: ${(e as Error).message}\n`);
      await once();
    }
    // Instagram level loudness. On failure the video is kept as it was rendered.
    job.stage = 'Finishing sound';
    job.progress = 0.99;
    save();
    const name = renderName(slug, variant);
    const final = path.join(outDir, name);
    const norm = path.join(outDir, `.loudnorm-${Date.now()}.mp4`);
    try {
      const line = await normalizeLoudness(tmp, norm);
      fs.renameSync(norm, final);
      fs.rmSync(tmp, { force: true });
      toolLog(slug, `\n== ${line}\n`);
    } catch (e) {
      toolLog(slug, `\n== loudness failed, keeping the video as rendered: ${(e as Error).message}\n`);
      fs.rmSync(norm, { force: true });
      fs.renameSync(tmp, final);
    }
    job.file = name;
    job.progress = 1;
    job.stage = 'Done';
    // Claude checks the finished video before she posts it (Instagram version; she can turn it off).
    if (variant === 'instagram' && !job.noCheck && settings().autoCheck !== false && !asks.has(slug)) {
      job.check = 'started';
      void startVideoCheck(slug, final, inputProps);
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (shuttingDown) {
      // Reel Studio is closing: not her mistake. The next start says "stopped before it was done".
      toolLog(slug, `\n== render stopped (Reel Studio closed)\n`);
      job.stopped = true;
      job.stage = 'Stopped';
    } else {
      toolLog(slug, `\n== render failed\n${(e as Error).message}\n`);
      const m = mapError((e as Error).message, 'render_failed');
      job.code = m.code;
      job.error = m.message;
      job.stage = 'Failed';
    }
  } finally {
    job.running = false;
    save();
  }
};

// ---- Clips ----
// A clip links to its long video's proxy (and cut-out). Report a broken link; link a cut-out made
// for the long video later.
const clipStatus = (slug: string): Status | null => {
  const m = meta(slug);
  if (!m.parent) return null;
  if (!fs.existsSync(file(slug, 'proxy.mp4'))) return { step: 'error', progress: 0, code: 'parent_missing', message: PLAIN.parent_missing };
  const cut = file(slug, 'cutout.webm');
  let linkThere = false;
  try {
    fs.lstatSync(cut);
    linkThere = true;
  } catch {
    /* no link yet */
  }
  try {
    if (linkThere && !fs.existsSync(cut)) {
      fs.rmSync(cut, { force: true });
      linkThere = false;
    }
    if (!linkThere && fs.existsSync(file(m.parent, 'cutout.webm'))) fs.symlinkSync(path.join('..', m.parent, 'cutout.webm'), cut);
  } catch (e) {
    console.error(`clip cutout link ${slug}:`, (e as Error).message);
  }
  return null;
};
const statusOf = (slug: string): Status => clipStatus(slug) ?? status(slug);

// ---- HTTP ----
const app = express();

// Security. The server listens on 127.0.0.1 only, so other computers cannot reach it. These checks
// stop a website open in her browser from talking to it (cross-site requests, DNS rebinding):
// the Host must be this computer, and a request from a browser must come from this page.
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
app.use((req, res, next) => {
  if (!LOCAL_HOSTS.has(String(req.headers.host ?? ''))) {
    res.status(403).send('Forbidden');
    return;
  }
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  const fromOtherSite = (origin && !LOCAL_HOSTS.has(origin.replace(/^https?:\/\//, ''))) || (site && site !== 'same-origin' && site !== 'none');
  if (fromOtherSite && ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/'))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // Her videos and pictures: no other website may load them. same-site (the render's own server
  // on another localhost port) stays allowed.
  if (site === 'cross-site' && /^\/(media|board|music|sfx)\//.test(req.path)) {
    res.status(403).send('Forbidden');
    return;
  }
  // Deleting needs a confirmation header that only the page sends.
  if (req.method === 'DELETE' && req.headers['x-confirm'] !== 'yes') {
    res.status(428).json({ code: 'confirm_needed', error: 'Deleting needs her confirmation on the page.' });
    return;
  }
  next();
});
app.use(express.json({ limit: '5mb' }));

const toTemp = multer({ dest: INCOMING });

const slugify = (name: string) => {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
      .replace(/-$/, '') || 'reel';
  const stamp = new Date().toISOString().slice(0, 10);
  let slug = `${stamp}-${base}`;
  for (let i = 2; fs.existsSync(dir(slug)); i++) slug = `${stamp}-${base}-${i}`;
  return slug;
};

app.get('/api/projects', (_req, res) => {
  const items = fs
    .readdirSync(PROJECTS)
    .filter((s) => safeSlug(s) && fs.statSync(dir(s)).isDirectory())
    .map((slug) => {
      const m = meta(slug);
      return { slug, title: m.title ?? slug, createdAt: m.createdAt ?? '', status: statusOf(slug), parent: m.parent ?? null };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(items);
});

// Upload a new video (field "video"). The name comes from the X-File-Name header (URI-encoded), or
// else from the file name in the upload. An upload that stops half-way leaves nothing behind.
app.post('/api/projects', (req, res) => {
  const header = req.headers['x-file-name'] ? safeDecode(String(req.headers['x-file-name'])) : null;
  let slug: string | null = null;
  let accepted = false;
  const cleanup = () => {
    if (slug && !accepted) fs.rmSync(dir(slug), { recursive: true, force: true });
  };
  res.on('close', cleanup);
  const up = multer({
    limits: { files: 1 },
    storage: multer.diskStorage({
      destination: (_r, f, cb) => {
        try {
          if (slug) throw new Error('Only one video per upload');
          const name = path.basename((header ?? Buffer.from(f.originalname, 'latin1').toString('utf8')).normalize('NFC'));
          slug = slugify(name);
          fs.mkdirSync(dir(slug));
          writeJson(file(slug, 'meta.json'), {
            title: name.replace(/\.[^.]+$/, '') || 'Reel',
            createdAt: new Date().toISOString(),
            ...(req.headers['x-batch'] === '1' ? { batch: { requested: true } } : {}),
          });
          setStatus(slug, { step: 'uploading', progress: 0 });
          cb(null, dir(slug));
        } catch (e) {
          cb(e as Error, '');
        }
      },
      filename: (_r, f, cb) => cb(null, 'source' + (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.mov')),
    }),
  }).single('video');
  up(req, res, (err?: unknown) => {
    if (err || !req.file || !slug) {
      if (err) console.error('upload failed:', (err as Error).message);
      cleanup();
      if (!res.headersSent)
        res.status(400).json(err ? { code: 'upload_incomplete', error: PLAIN.upload_incomplete } : { code: 'bad_file', error: 'No video in the upload' });
      return;
    }
    accepted = true;
    analyse(slug);
    res.json({ slug });
  });
});

app.param('slug', (req, res, next, slug: string) => {
  if (!safeSlug(slug) || !fs.existsSync(dir(slug))) {
    res.status(404).json({ error: 'No such project' });
    return;
  }
  next();
});

const rendersOf = (slug: string) => {
  const outDir = file(slug, 'out');
  return listFiles(outDir, /\.mp4$/i)
    .map((f) => ({ f, t: mtime(path.join(outDir, f)) }))
    .sort((a, b) => b.t - a.t)
    .map(({ f, t }) => ({ file: f, createdAt: new Date(t).toISOString(), url: `/media/${slug}/out/${encodeURIComponent(f)}` }));
};

app.get('/api/projects/:slug', (req, res) => {
  const slug = req.params.slug;
  history.observe(slug);
  const m = meta(slug);
  res.json({
    slug,
    title: m.title ?? slug,
    status: statusOf(slug),
    edit: readJson<Edit | null>(file(slug, 'edit.json'), null),
    words: readJson(file(slug, 'words.json'), []),
    faces: readJson(file(slug, 'faces.json'), []),
    hasCutout: fs.existsSync(file(slug, 'cutout.webm')),
    editVersion: editVersion(slug),
    renders: rendersOf(slug),
    summary: m.summary ?? null,
    parent: m.parent ?? null,
    range: m.range ?? null,
  });
});

// Rename a reel: {title}. Changes the name on Home and the title in the edit.
app.patch('/api/projects/:slug', (req, res) => {
  const slug = req.params.slug;
  const title = String(req.body?.title ?? '').normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!title) {
    res.status(400).json({ error: 'Write a name' });
    return;
  }
  setMeta(slug, { title, autoTitle: false });
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  if (edit && edit.title !== title) writeEdit(slug, { ...edit, title }, 'page', { always: true });
  res.json({ ok: true, title, editVersion: editVersion(slug) });
});

app.get('/api/projects/:slug/version', (req, res) => {
  history.observe(req.params.slug);
  res.json({ editVersion: editVersion(req.params.slug), status: statusOf(req.params.slug) });
});

app.put('/api/projects/:slug/edit', (req, res) => {
  const edit = req.body as Edit;
  if (!edit || edit.version !== 1 || !Array.isArray(edit.segments) || !Array.isArray(edit.effects)) {
    res.status(400).json({ error: 'Not a valid edit' });
    return;
  }
  history.observe(req.params.slug);
  // The page sends the version it last loaded. If Claude changed edit.json since, refuse, so the
  // page reloads instead of silently overwriting Claude's change.
  const base = Number(req.headers['x-base-version'] ?? 0);
  const now = editVersion(req.params.slug);
  if (base && now && Math.abs(base - now) > 1) {
    res.status(409).json({ editVersion: now, error: 'The reel was changed by Claude' });
    return;
  }
  writeEdit(req.params.slug, edit, 'page');
  res.json({ editVersion: editVersion(req.params.slug) });
});

// Earlier versions of edit.json, newest first.
app.get('/api/projects/:slug/history', (req, res) => {
  res.json(history.list(req.params.slug));
});
app.post('/api/projects/:slug/history/:id/restore', (req, res) => {
  const slug = req.params.slug;
  const old = history.get(slug, String(req.params.id));
  if (!old || old.version !== 1 || !Array.isArray(old.segments) || !Array.isArray(old.effects)) {
    res.status(404).json({ error: 'No such version' });
    return;
  }
  writeEdit(slug, old, 'page', { always: true });
  res.json({ editVersion: editVersion(slug) });
});

// The same checks as `npm run check`, for the page before "Make the video".
app.get('/api/projects/:slug/problems', (req, res) => {
  const slug = req.params.slug;
  history.observe(slug);
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  if (!edit) {
    res.status(409).json({ error: 'The first edit is not ready yet', problems: [] });
    return;
  }
  const list = (d: string) => new Set(fs.existsSync(d) ? fs.readdirSync(d) : []);
  try {
    res.json({ problems: checkEdit(edit, { words: readJson<Word[]>(file(slug, 'words.json'), []), board: list(BOARD), music: list(MUSIC), hasCutout: fs.existsSync(file(slug, 'cutout.webm')) }) });
  } catch (e) {
    res.json({ problems: [{ code: 'bad_segment', text: 'This reel file is damaged.', detail: (e as Error).message }] });
  }
});

app.post('/api/projects/:slug/autoedit', async (req, res) => {
  const slug = req.params.slug;
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  if (!edit) {
    res.status(409).json({ error: 'The first edit is not ready yet' });
    return;
  }
  const gap = Math.min(1.5, Math.max(0.15, Number(req.body?.pauseGap ?? 0.4)));
  edit.segments = cutPauses(readJson(file(slug, 'words.json'), []), edit.source.duration || (await probeDuration(file(slug, 'proxy.mp4'))), gap);
  writeEdit(slug, edit, 'auto', { always: true });
  res.json({ editVersion: editVersion(slug) });
});

const BUSY = { code: 'busy', error: 'Still preparing this reel. Try again when it is ready.' };

app.post('/api/projects/:slug/cutout', (req, res) => {
  const slug = req.params.slug;
  if (analyseQ.has(slug)) {
    res.status(409).json(BUSY);
    return;
  }
  const started = makeCutout(slug);
  res.json({ ok: true, already: !started, position: heavyQ.position(slug, 'cutout') || undefined });
});

// Measure the light of a reel made before the auto light fix existed (or measure again) and switch it on.
app.post('/api/projects/:slug/light', async (req, res) => {
  const slug = req.params.slug;
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  if (!edit || !fs.existsSync(file(slug, 'proxy.mp4'))) {
    res.status(409).json(BUSY);
    return;
  }
  try {
    const fix = await measureLight(file(slug, 'proxy.mp4'));
    const fresh = readJson<Edit>(file(slug, 'edit.json'), edit);
    fresh.light = { auto: true, strength: fresh.light?.strength ?? 1, fix };
    writeEdit(slug, fresh, 'page', { always: true });
    res.json({ ok: true, light: fresh.light, editVersion: editVersion(slug) });
  } catch (e) {
    res.status(500).json({ code: 'unknown', error: (e as Error).message });
  }
});

app.post('/api/projects/:slug/reanalyse', (req, res) => {
  const slug = req.params.slug;
  if (meta(slug).parent) {
    res.status(409).json({ code: 'is_clip', error: 'This is a clip from a longer video. It does not need to be prepared again.' });
    return;
  }
  if (heavyQ.isActive(slug)) {
    res.status(409).json({ code: 'busy', error: 'Still working on this reel. Try again in a moment.' });
    return;
  }
  if (!sourceOf(slug)) {
    setStatus(slug, { step: 'error', progress: 0, code: 'upload_incomplete', message: PLAIN.upload_incomplete });
    res.status(409).json({ code: 'upload_incomplete', error: PLAIN.upload_incomplete });
    return;
  }
  // Default: continue from the first missing step. {full:true} redoes every step.
  analyse(slug, req.body?.full === true);
  res.json({ ok: true });
});

// A clip from a longer video: a new reel that shares the long video's files (links, not copies).
// Makes one clip reel from parent between start and end (source seconds). Returns the new slug.
const makeClip = (parent: string, parentEdit: Edit, start: number, end: number, title: string) => {
  const slug = slugify(title);
  fs.mkdirSync(dir(slug), { recursive: true });
  for (const f of ['proxy.mp4', 'cutout.webm']) if (fs.existsSync(file(parent, f))) fs.symlinkSync(path.join('..', parent, f), file(slug, f));
  for (const f of ['words.json', 'faces.json', 'transcript.json']) if (fs.existsSync(file(parent, f))) fs.copyFileSync(file(parent, f), file(slug, f));
  writeJson(file(slug, 'meta.json'), { title, createdAt: new Date().toISOString(), parent, range: { start, end } });
  const words = readJson<Word[]>(file(parent, 'words.json'), []).filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05);
  const edit = firstEdit({ title: isGenericTitle(title) ? '' : title, language: parentEdit.language, duration: parentEdit.source.duration, words, board: listFiles(BOARD, IMAGE), look: allStyles().find((x) => x.id === parentEdit.styleId) });
  edit.segments = edit.segments.map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) })).filter((s) => s.end - s.start > 0.12);
  edit.style = { ...parentEdit.style };
  edit.sound = { ...parentEdit.sound };
  edit.toggles = { ...parentEdit.toggles };
  edit.wordFixes = parentEdit.wordFixes;
  edit.styleId = parentEdit.styleId;
  if (parentEdit.light) edit.light = { ...parentEdit.light };
  writeEdit(slug, edit, 'auto');
  setStatus(slug, { step: 'ready', progress: 1 });
  return slug;
};

app.post('/api/projects/:slug/clip', (req, res) => {
  const parent = req.params.slug;
  const start = Number(req.body?.start);
  const end = Number(req.body?.end);
  const title = String(req.body?.title ?? '').trim() || `${meta(parent).title || 'Reel'} clip`;
  const parentEdit = readJson<Edit | null>(file(parent, 'edit.json'), null);
  if (!parentEdit || !fs.existsSync(file(parent, 'proxy.mp4'))) {
    res.status(409).json({ error: 'The long video is not ready yet' });
    return;
  }
  if (!(end > start) || start < 0 || end > parentEdit.source.duration + 0.5) {
    res.status(400).json({ error: `start and end must be inside 0..${parentEdit.source.duration.toFixed(1)} s` });
    return;
  }
  res.json({ slug: makeClip(parent, parentEdit, start, end, title) });
});

// Batch: split one long video into reels (cue word "następny"/"kolejny"/"next"/"cięcie" between
// reels, else pauses of 3 s or more). The long video stays; it holds the media for its clips.
type SplitResult = { status: number; slugs: string[]; reason?: string; code?: string };
const splitProject = (parent: string): SplitResult => {
  const m = meta(parent);
  if (m.parent) return { status: 409, slugs: [], code: 'is_clip', reason: 'A clip cannot be split.' };
  const done = (m.batch?.clips ?? []).filter((c) => fs.existsSync(dir(c)));
  if (done.length) return { status: 409, slugs: done, code: 'already_split', reason: 'This video is already split.' };
  const parentEdit = readJson<Edit | null>(file(parent, 'edit.json'), null);
  if (!parentEdit || !fs.existsSync(file(parent, 'proxy.mp4'))) return { status: 409, slugs: [], code: 'busy', reason: 'The long video is not ready yet.' };
  const words = readJson<Word[]>(file(parent, 'words.json'), []);
  const { parts, by } = splitParts(words, parentEdit.source.duration);
  if (parts.length < 2) {
    const reason = by === 'none' ? 'No cue word ("następny") and no long pause found, so there is nothing to split.' : 'Only one part is long enough (6 s or more), so there is nothing to split.';
    setMeta(parent, { batch: { ...m.batch, reason } });
    return { status: 409, slugs: [], code: 'nothing_to_split', reason };
  }
  const slugs = parts.map((p, i) => makeClip(parent, parentEdit, p.start, p.end, titleFromWords(p.words) ?? `${m.title || 'Reel'} ${i + 1}`));
  setMeta(parent, { batch: { ...m.batch, clips: slugs, reason: undefined } });
  return { status: 200, slugs };
};

app.post('/api/projects/:slug/split', (req, res) => {
  if (analyseQ.has(req.params.slug)) {
    res.status(409).json({ slugs: [], ...BUSY, reason: BUSY.error });
    return;
  }
  const r = splitProject(req.params.slug);
  res.status(r.status).json({ slugs: r.slugs, ...(r.reason ? { reason: r.reason, code: r.code } : {}) });
});

// Covers: find good frames, then render the cover stills.
app.post('/api/projects/:slug/covers/find', (req, res) => {
  const slug = req.params.slug;
  if (analyseQ.has(slug)) {
    res.status(409).json(BUSY);
    return;
  }
  const started = findCovers(slug);
  res.json({ ok: true, already: !started, position: heavyQ.position(slug, 'covers') || undefined });
});

// Candidate file names are paths inside the project ("covers/c01-1.50.jpg"); older ones may be bare.
const coverPath = (f: string) => (f.startsWith('covers/') ? f : `covers/${f}`);
const coverErrors = new Map<string, string>();

app.get('/api/projects/:slug/covers', (req, res) => {
  const slug = req.params.slug;
  const stamp = (f: string) => (fs.existsSync(file(slug, f)) ? `/media/${slug}/${f}?v=${Math.round(mtime(file(slug, f)))}` : null);
  res.json({
    candidates: readJson<CoverCandidate[]>(file(slug, 'covers/candidates.json'), []).map((c) => ({ ...c, url: `/media/${slug}/${coverPath(c.file).split('/').map(encodeURIComponent).join('/')}` })),
    story: stamp('covers/cover-9x16.jpg'),
    grid: stamp('covers/cover-3x4.jpg'),
    rendering: heavyQ.has(slug, 'cover-stills'),
    position: heavyQ.position(slug, 'cover-stills') || undefined,
    error: coverErrors.get(slug) ?? null,
  });
});

app.post('/api/projects/:slug/covers/render', async (req, res) => {
  const slug = req.params.slug;
  if (analyseQ.has(slug)) {
    res.status(409).json(BUSY);
    return;
  }
  if (heavyQ.has(slug, 'cover-stills')) {
    res.json({ ok: true, already: true });
    return;
  }
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  const cands = readJson<CoverCandidate[]>(file(slug, 'covers/candidates.json'), []);
  if (!edit?.cover) {
    res.status(409).json({ error: 'Pick a frame for the cover first' });
    return;
  }
  const near = cands.length ? cands.reduce((a, b) => (Math.abs(b.t - edit.cover!.t) < Math.abs(a.t - edit.cover!.t) ? b : a)) : null;
  if (!near || Math.abs(near.t - edit.cover.t) > 0.3) {
    // A frame she picked that is not a candidate: grab it now.
    fs.mkdirSync(file(slug, 'covers'), { recursive: true });
    const name = `frame-${edit.cover.t.toFixed(2)}.jpg`;
    await new Promise<void>((resolve) => {
      const f = track(spawn('ffmpeg', ['-y', '-ss', String(edit.cover!.t), '-i', file(slug, 'proxy.mp4'), '-frames:v', '1', '-q:v', '2', file(slug, `covers/${name}`)]));
      f.on('close', () => resolve());
      f.on('error', () => resolve());
    });
    cands.push({ t: edit.cover.t, file: `covers/${name}`, score: 0 });
    writeJson(file(slug, 'covers/candidates.json'), cands);
  }
  const frame = cands.reduce((a, b) => (Math.abs(b.t - edit.cover!.t) < Math.abs(a.t - edit.cover!.t) ? b : a));
  const cover = edit.cover;
  coverErrors.delete(slug);
  heavyQ.push({
    slug,
    kind: 'cover-stills',
    run: async () => {
      try {
        const { renderStill, selectComposition } = await import('@remotion/renderer');
        const serveUrl = await getBundle();
        const faces = readJson<FaceSample[]>(file(slug, 'faces.json'), []);
        for (const grid of [false, true]) {
          const inputProps: CoverProps = {
            cover,
            style: edit.style,
            light: edit.light,
            urls: { frame: `${ORIGIN}/media/${slug}/${coverPath(frame.file).split('/').map(encodeURIComponent).join('/')}` },
            face: faces.length ? faceAt(cover.t, faces) : null,
            grid,
          };
          const composition = await selectComposition({ serveUrl, id: grid ? 'CoverGrid' : 'Cover', inputProps });
          await renderStill({ composition, serveUrl, inputProps, imageFormat: 'jpeg', jpegQuality: 92, output: file(slug, `covers/cover-${grid ? '3x4' : '9x16'}.jpg`) });
        }
      } catch (e) {
        toolLog(slug, `\n== cover stills failed\n${(e as Error).message}\n`);
        coverErrors.set(slug, mapError((e as Error).message).message);
      }
    },
  });
  res.json({ ok: true, position: heavyQ.position(slug, 'cover-stills') || undefined });
});

app.post('/api/projects/:slug/render', (req, res) => {
  const slug = req.params.slug;
  const variant = variantOf(req.body?.variant);
  const key = renderKey(slug, variant);
  if (renders.get(key)?.running) {
    res.status(409).json({ code: 'busy', error: 'Already making this video' });
    return;
  }
  if (analyseQ.has(slug) || !fs.existsSync(file(slug, 'edit.json'))) {
    res.status(409).json(BUSY);
    return;
  }
  // check:false = the caller checks the video itself (the Claude Desktop connector does).
  const job: RenderJob = { running: true, progress: 0, stage: 'Waiting', queued: true, noCheck: req.body?.check === false };
  renders.set(key, job);
  saveRenderState(slug, variant, job);
  heavyQ.push({
    slug,
    kind: 'render',
    onPosition: (position) => {
      job.position = position;
    },
    run: () => doRender(slug, job, variant),
  });
  res.json({ ok: true, variant, position: job.position });
});

app.get('/api/projects/:slug/render', (req, res) => {
  const slug = req.params.slug;
  const variant = variantOf(req.query.variant);
  const list = rendersOf(slug).filter((r) => isTikTokFile(r.file) === (variant === 'tiktok'));
  const job = renders.get(renderKey(slug, variant)) ?? savedRenderState(slug, variant) ?? { running: false, progress: 0 };
  const latest = job.file ?? list[0]?.file;
  const latestTime = latest ? mtime(file(slug, `out/${latest}`)) : 0;
  res.json({
    ...job,
    variant,
    latest: latest ?? null,
    url: job.file ? `/media/${slug}/out/${encodeURIComponent(job.file)}` : undefined,
    editChangedSince: !!latestTime && mtime(file(slug, 'edit.json')) > latestTime,
  });
});

// "Show in Finder": {file} = a render name ("Title 26.10 21-05.mp4"), or "out/<name>", "covers/<name>".
app.post('/api/projects/:slug/reveal', (req, res) => {
  const slug = req.params.slug;
  let f = safeDecode(String(req.body?.file ?? '')).replace(new RegExp(`^/?media/${slug}/`), '').split('?')[0];
  if (!f.includes('/')) f = fs.existsSync(file(slug, `out/${f}`)) ? `out/${f}` : `covers/${f}`;
  const abs = path.resolve(dir(slug), f);
  const inside = ['out', 'covers'].some((d) => {
    const rel = path.relative(file(slug, d), abs);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
  if (!inside || !fs.existsSync(abs) || path.basename(abs).startsWith('.')) {
    res.status(404).json({ ok: false, error: 'No such file' });
    return;
  }
  if (process.platform !== 'darwin') {
    res.json({ ok: false, reason: 'Show in Finder works only on a Mac' });
    return;
  }
  const p = track(spawn('open', ['-R', abs], { stdio: 'ignore' }));
  p.on('error', () => {});
  res.json({ ok: true });
});

app.delete('/api/projects/:slug', (req, res) => {
  const slug = req.params.slug;
  const clips = fs.readdirSync(PROJECTS).filter((s) => safeSlug(s) && meta(s).parent === slug);
  if (clips.length) {
    res.status(409).json({ code: 'has_clips', error: `Delete its clips first: ${clips.join(', ')}` });
    return;
  }
  // Never while a tool, a render or Claude is working on it. Waiting jobs are simply dropped.
  if (analyseQ.isActive(slug) || heavyQ.isActive(slug) || asks.has(slug)) {
    res.status(409).json({ code: 'busy', error: 'Still working on this reel. Wait until it is done, then delete it.' });
    return;
  }
  analyseQ.drop(slug);
  heavyQ.drop(slug);
  renders.delete(renderKey(slug, 'instagram'));
  renders.delete(renderKey(slug, 'tiktok'));
  coverErrors.delete(slug);
  history.forget(slug);
  fs.rmSync(dir(slug), { recursive: true, force: true });
  res.json({ ok: true });
});

app.get('/api/styles', (_req, res) => res.json({ styles: allStyles(), defaultStyle: defaultLook().id }));
// Save the look of a reel as her own style: {name, slug}
app.post('/api/styles', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  const edit = readJson<Edit | null>(file(String(req.body?.slug ?? ''), 'edit.json'), null);
  if (!name || !edit || !safeSlug(String(req.body?.slug))) {
    res.status(400).json({ error: 'Need a name and a reel' });
    return;
  }
  const id = 'own-' + slugify(name).slice(11);
  const base = allStyles().find((s) => s.id === edit.styleId) ?? BUILT_IN_STYLES[0];
  const look: EditingStyle = { id, name, namePl: name, description: `Saved from "${edit.title}"`, descriptionPl: `Zapisany z „${edit.title}”`, style: { ...edit.style }, sound: { effects: edit.sound.effects, defaultSfx: edit.sound.defaultSfx }, toggles: { ...edit.toggles }, pace: base.pace };
  writeJson(path.join(STYLES, `${id}.json`), look);
  res.json({ id });
});
app.delete('/api/styles/:id', (req, res) => {
  const id = req.params.id;
  if (!/^own-[a-z0-9-]+$/.test(id)) {
    res.status(400).json({ error: 'Only your own styles can be deleted' });
    return;
  }
  fs.rmSync(path.join(STYLES, `${id}.json`), { force: true });
  res.json({ ok: true });
});
// The style new videos get: {id}
app.put('/api/styles/default', (req, res) => {
  const id = String(req.body?.id ?? '');
  if (!allStyles().some((s) => s.id === id)) {
    res.status(400).json({ error: 'No such style' });
    return;
  }
  writeJson(SETTINGS, { ...settings(), defaultStyle: id });
  res.json({ ok: true });
});
// Apply a style to a reel: {id}. The look changes; words, cuts and effects stay.
app.post('/api/projects/:slug/style', (req, res) => {
  const slug = req.params.slug;
  const look = allStyles().find((s) => s.id === String(req.body?.id ?? ''));
  const edit = readJson<Edit | null>(file(slug, 'edit.json'), null);
  if (!look || !edit) {
    res.status(400).json({ error: 'No such style or reel' });
    return;
  }
  writeEdit(slug, applyStyle(edit, look), 'page', { always: true });
  res.json({ editVersion: editVersion(slug) });
});

// ---- Ask Claude from the page ----
// Runs her own Claude Code ("claude -p") in this folder, so it uses her Claude subscription.
// One conversation per reel: the session id is kept, so Claude remembers earlier requests.
type AskCode = 'not_logged_in' | 'claude_missing' | 'stopped' | 'ask_failed';
type ChatMsg = { role: 'user' | 'claude' | 'error'; text: string; at: string; code?: AskCode };
type AskJob = { child: ReturnType<typeof spawn>; activity: string; stopped?: boolean };
const asks = new Map<string, AskJob>();
const HOME_CLAUDE = path.join(process.env.HOME ?? '', '.local', 'bin', 'claude');
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? (fs.existsSync(HOME_CLAUDE) ? HOME_CLAUDE : 'claude');
// What a page turn may do: read and edit reel files, run the word/check scripts, talk to this
// server. No other npm scripts, no shell, no code changes (those belong in "Ask Claude.command").
const HOSTS = [`localhost:${PORT}`, `http://localhost:${PORT}`];
const ALLOWED_TOOLS = [
  'Read',
  'Edit',
  'Glob',
  'Grep',
  'Skill',
  'Write',
  'Bash(npm run words *)',
  'Bash(npm run transcript *)',
  'Bash(npm run check *)',
  'Bash(npm run look *)',
  ...HOSTS.map((h) => `Bash(curl -s ${h}/*)`),
  ...HOSTS.map((h) => `Bash(curl -s -X POST ${h}/*)`),
  ...HOSTS.map((h) => `Bash(curl -s -X PUT ${h}/*)`),
  'Bash(ls *)',
  'Bash(open projects/*)',
  'Bash(.venv/bin/python .claude/skills/ig-*)',
];
// Edit rules cover every file-changing tool; Write is listed as well to be explicit.
const PROTECTED = ['package.json', 'package-lock.json', '*.command', 'server/**', 'src/**', 'tools/**', 'web/**', 'scripts/**', 'install.sh', '.claude/settings.json', '.claude/settings.local.json'];
const DISALLOWED_TOOLS = PROTECTED.flatMap((p) => [`Edit(${p})`, `Write(${p})`]);
const chatFile = (slug: string) => file(slug, 'chat.json');
const chat = (slug: string) => readJson<{ sessionId?: string; messages: ChatMsg[] }>(chatFile(slug), { messages: [] });
const writeChat = (slug: string, c: { sessionId?: string; messages: ChatMsg[] }) => {
  try {
    if (fs.existsSync(dir(slug))) writeJson(chatFile(slug), c);
  } catch (e) {
    console.error(`chat ${slug}:`, (e as Error).message);
  }
};
const pushChat = (slug: string, m: Omit<ChatMsg, 'at'>) => {
  const c = chat(slug);
  c.messages.push({ ...m, at: new Date().toISOString() });
  c.messages = c.messages.slice(-200);
  writeChat(slug, c);
};
// A short, friendly line for what Claude is doing right now.
const describeTool = (name: string, input: Record<string, unknown>) => {
  const cmd = String(input.command ?? '');
  if (name === 'Bash' && cmd.includes('npm run words')) return 'Reading your words';
  if (name === 'Bash' && cmd.includes('npm run transcript')) return 'Reading the whole video';
  if (name === 'Bash' && cmd.includes('npm run check')) return 'Checking the edit';
  if (name === 'Bash' && cmd.includes('/render')) return 'Making the video';
  if (name === 'Bash' && cmd.includes('/covers')) return 'Working on the cover';
  if (name === 'Bash' && cmd.includes('/clip')) return 'Making a clip';
  if (name === 'Edit' || name === 'Write') return 'Changing the reel';
  if (name === 'Read' || name === 'Glob' || name === 'Grep') return 'Looking at the reel';
  if (name === 'Skill') return 'Using a skill';
  return 'Working';
};

app.get('/api/projects/:slug/ask', (req, res) => {
  const slug = req.params.slug;
  res.json({ running: asks.has(slug), activity: asks.get(slug)?.activity ?? null, messages: chat(slug).messages });
});

const askSystem = (slug: string) =>
  [
    `You are working on ONE reel: projects/${slug} (slug "${slug}"). Unless she clearly names another reel, every request is about this one.`,
    'She is typing in the chat box on the Reel Studio editor page and sees the preview update live when edit.json changes.',
    'She may be changing the reel on the page at the same time: re-read edit.json right before every change, and prefer small Edit changes over Write.',
    'Never delete a reel, a picture or a video; if she asks, tell her to use the delete button on the page.',
    'Reply in 1 to 3 short sentences in the language she wrote in. Say what you changed in plain words. No code, no file names.',
    'If her request is unclear, make your best sensible guess for small things, or ask ONE short question for big things.',
  ].join(' ');

export const askArgs = (slug: string, prompt: string, resume?: string) => {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', ...ALLOWED_TOOLS, '--disallowedTools', ...DISALLOWED_TOOLS, '--append-system-prompt', askSystem(slug)];
  if (resume) args.push('--resume', resume);
  // The prompt goes after "--", so a message that starts with "-" is not read as an option.
  args.push('--', prompt);
  return args;
};

// "Check my video": measure + contact sheet, then Claude looks and answers in the Ask box.
const startVideoCheck = async (slug: string, video: string, props: ReelProps) => {
  try {
    const report = await checkVideo(video, props, file(slug, 'out/check'));
    writeJson(file(slug, 'out/check/last.json'), report);
    if (asks.has(slug)) return; // she started her own question meanwhile
    const sessionId = chat(slug).sessionId;
    pushChat(slug, { role: 'user', text: CHECK_ASK });
    startAsk(slug, checkPrompt(report), { resume: sessionId });
  } catch (e) {
    toolLog(slug, `\n== video check failed: ${(e as Error).message}\n`);
  }
};
const CHECK_ASK = 'Check my finished video / Sprawdź mój gotowy film';

// Claude checks every new Instagram video (on unless she turns it off).
app.get('/api/settings/autocheck', (_req, res) => {
  res.json({ autoCheck: settings().autoCheck !== false });
});
app.put('/api/settings/autocheck', (req, res) => {
  const autoCheck = req.body?.autoCheck !== false;
  writeJson(SETTINGS, { ...readJson<Record<string, unknown>>(SETTINGS, {}), autoCheck });
  res.json({ autoCheck });
});

app.post('/api/projects/:slug/check', async (req, res) => {
  const slug = req.params.slug;
  // {inline:true}: Claude in the Ask box asks for the report itself (sheet path + findings) and looks.
  if (req.body?.inline === true) {
    const latest = rendersOf(slug).find((r) => !isTikTokFile(r.file));
    if (!latest) {
      res.status(409).json({ code: 'no_video', error: 'Make the video first.' });
      return;
    }
    try {
      const report = await checkVideo(file(slug, `out/${latest.file}`), variantProps(slug, 'instagram'), file(slug, 'out/check'));
      res.json(report);
    } catch (e) {
      res.status(500).json({ code: 'unknown', error: (e as Error).message });
    }
    return;
  }
  if (asks.has(slug)) {
    res.status(409).json({ code: 'busy', error: 'Claude is still working on your last request' });
    return;
  }
  const latest = rendersOf(slug).find((r) => !isTikTokFile(r.file));
  if (!latest) {
    res.status(409).json({ code: 'no_video', error: 'Make the video first.' });
    return;
  }
  void startVideoCheck(slug, file(slug, `out/${latest.file}`), variantProps(slug, 'instagram'));
  res.json({ ok: true });
});

const startAsk = (slug: string, prompt: string, opts: { resume?: string; retried?: boolean }) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // always her subscription, never API billing
  const child = track(spawn(CLAUDE_BIN, askArgs(slug, prompt, opts.resume), { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }));
  const job: AskJob = { child, activity: 'Thinking' };
  asks.set(slug, job);
  let buf = '';
  let answer = '';
  let errText = '';
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      let m: { type?: string; session_id?: string; result?: string; message?: { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] } };
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.session_id && chat(slug).sessionId !== m.session_id) writeChat(slug, { ...chat(slug), sessionId: m.session_id });
      if (m.type === 'assistant') {
        for (const part of m.message?.content ?? []) {
          if (part.type === 'tool_use') job.activity = describeTool(part.name ?? '', part.input ?? {});
          if (part.type === 'text' && part.text) {
            answer = part.text;
            job.activity = 'Writing';
          }
        }
      }
      if (m.type === 'result' && m.result) answer = m.result;
    }
  });
  child.stderr?.on('data', (d: Buffer) => {
    errText = (errText + d.toString()).slice(-2000);
  });
  child.on('error', (e) => {
    errText = `${errText}\n${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}`;
  });
  child.on('close', (code) => {
    asks.delete(slug);
    if (answer.trim()) {
      pushChat(slug, { role: 'claude', text: answer.trim() });
      return;
    }
    // The saved conversation is gone (Claude Code cleans old ones): start a new one, once, with the
    // last few messages as context.
    if (!job.stopped && !opts.retried && /No conversation found/i.test(errText)) {
      const c = chat(slug);
      delete c.sessionId;
      writeChat(slug, c);
      const before = c.messages.slice(0, -1).filter((m) => m.role !== 'error').slice(-6);
      const context = before.length
        ? `Earlier in this chat (for context):\n${before.map((m) => `${m.role === 'user' ? 'Paulina' : 'Claude'}: ${m.text}`).join('\n')}\n\nHer new message:\n`
        : '';
      startAsk(slug, context + prompt, { retried: true });
      return;
    }
    const missing = /ENOENT/.test(errText);
    const notLoggedIn = /not logged in|log ?in|auth|credential/i.test(errText);
    const stopped = job.stopped || code === null;
    const errCode: AskCode = missing ? 'claude_missing' : stopped ? 'stopped' : notLoggedIn ? 'not_logged_in' : 'ask_failed';
    pushChat(slug, {
      role: 'error',
      code: errCode,
      text:
        errCode === 'claude_missing'
          ? 'Claude Code is not installed. Run "Start Reel Studio.command" once to install it.'
          : errCode === 'not_logged_in'
            ? 'Claude is not logged in. Double-click "Ask Claude.command" once and log in with your Claude account.'
            : errCode === 'stopped'
              ? 'Stopped.'
              : `Claude stopped (${errText.trim().split('\n').pop() || `exit ${code}`}).`,
    });
  });
};

app.post('/api/projects/:slug/ask', (req, res) => {
  const slug = req.params.slug;
  const message = String(req.body?.message ?? '').trim().slice(0, 4000);
  if (!message) {
    res.status(400).json({ error: 'Write what you want' });
    return;
  }
  if (asks.has(slug)) {
    res.status(409).json({ code: 'busy', error: 'Claude is still working on your last request' });
    return;
  }
  // A helper button on the page names its skill; Claude gets the hint, her chat shows only her words.
  const skill = String(req.body?.skill ?? '');
  const prompt = /^ig-[a-z]+$/.test(skill) && fs.existsSync(path.join(ROOT, '.claude', 'skills', skill)) ? `${message}\n\n(Use the /${skill} skill.)` : message;
  const sessionId = chat(slug).sessionId;
  pushChat(slug, { role: 'user', text: message });
  startAsk(slug, prompt, { resume: sessionId });
  res.json({ ok: true });
});

app.post('/api/projects/:slug/ask/stop', (req, res) => {
  const job = asks.get(req.params.slug);
  if (job) {
    job.stopped = true;
    job.child.kill('SIGTERM');
  }
  res.json({ ok: true });
});

// "New conversation": forget the chat and the Claude session for this reel (the reel itself stays).
app.delete('/api/projects/:slug/ask', (req, res) => {
  if (asks.has(req.params.slug)) {
    res.status(409).json({ code: 'busy', error: 'Claude is still working' });
    return;
  }
  writeChat(req.params.slug, { messages: [] });
  res.json({ ok: true });
});

// Board pictures, music and sound effects.
const intakeHandler = (target: string, kind: 'image' | 'audio') => async (req: express.Request, res: express.Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) {
    res.status(400).json({ code: 'no_file', error: 'No file in the upload' });
    return;
  }
  const r = await intake(files, target, kind);
  if (!r.saved.length) {
    res.status(400).json({ ok: false, code: kind === 'image' ? 'not_image' : 'not_audio', error: r.rejected.map((x) => `${x.file}: ${x.reason}`).join(' '), ...r });
    return;
  }
  res.json({ ok: true, ...r });
};
app.get('/api/board', (_req, res) => res.json(listFiles(BOARD, IMAGE).map((f) => ({ file: f, url: `/board/${encodeURIComponent(f)}` }))));
app.post('/api/board', toTemp.array('images', 200), intakeHandler(BOARD, 'image'));
app.delete('/api/board/:file', (req, res) => {
  const f = req.params.file;
  if (!safeFile(f)) {
    res.status(400).json({ error: 'Bad file name' });
    return;
  }
  fs.rmSync(path.join(BOARD, f), { force: true });
  res.json({ ok: true });
});
app.get('/api/music', (_req, res) => res.json(listFiles(MUSIC, AUDIO).map((f) => ({ file: f, url: `/music/${encodeURIComponent(f)}` }))));
app.post('/api/music', toTemp.array('files', 50), intakeHandler(MUSIC, 'audio'));
app.get('/api/sfx', (_req, res) => res.json(SFX_NAMES.map((name) => ({ name, url: `/sfx/${name}.wav` }))));

mountLooks(app, { root: ROOT, projects: PROJECTS, stylesDir: STYLES, settingsFile: SETTINGS, getBundle, reelProps, allStyles });

const media = { acceptRanges: true, fallthrough: false, dotfiles: 'deny' as const };
app.use('/media', express.static(PROJECTS, media));
app.use('/board', express.static(BOARD, media));
app.use('/sfx', express.static(SFX, media));
app.use('/music', express.static(MUSIC, media));

const WEB = path.join(ROOT, 'web', 'dist');
app.use(express.static(WEB));
app.get(/^\/(?!api|media|board|sfx|music).*/, (_req, res) => {
  if (fs.existsSync(path.join(WEB, 'index.html'))) res.sendFile(path.join(WEB, 'index.html'));
  else res.status(503).send('The editor page is not built yet. Run: npm run build:web');
});

// Errors in a route answer in JSON, never with an HTML stack trace.
app.use((err: Error & { status?: number; statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const code = err.status ?? err.statusCode ?? 500;
  if (code >= 500) console.error('route error:', err);
  if (res.headersSent) return;
  res.status(code).json({ code: code >= 500 ? 'unknown' : 'bad_request', error: code >= 500 ? PLAIN.unknown : err.message });
});

// ---- Start ----
// A project left half-way (computer slept, server closed) continues on start, oldest first.
for (const f of fs.readdirSync(INCOMING)) fs.rmSync(path.join(INCOMING, f), { recursive: true, force: true });
const resumeOrder = fs
  .readdirSync(PROJECTS)
  .filter((s) => safeSlug(s) && fs.existsSync(file(s, 'status.json')))
  .sort((a, b) => (meta(a).createdAt ?? '').localeCompare(meta(b).createdAt ?? ''));
for (const slug of resumeOrder) {
  const s = status(slug);
  const q = s.step === 'queued' ? (s.queuedFor ?? (fs.existsSync(file(slug, 'edit.json')) ? 'covers' : 'analyse')) : null;
  if (s.step === 'uploading') {
    // The upload never finished: remove the half file, tell her to drop it again.
    for (const f of fs.readdirSync(dir(slug))) if (/^source\./.test(f)) fs.rmSync(file(slug, f), { force: true });
    setStatus(slug, { step: 'error', progress: 0, code: 'upload_incomplete', message: PLAIN.upload_incomplete });
  } else if (['normalize', 'transcribe', 'faces', 'autoedit'].includes(s.step) || q === 'analyse') {
    if (sourceOf(slug)) analyse(slug);
    else setStatus(slug, { step: 'error', progress: 0, code: 'upload_incomplete', message: PLAIN.upload_incomplete });
  } else if (s.step === 'cutout' || q === 'cutout') makeCutout(slug);
  else if (s.step === 'covers' || q === 'covers') setStatus(slug, { step: 'ready', progress: 1 });
}

const server = app.listen(PORT, '127.0.0.1', () => console.log(`Reel Studio is running: ${ORIGIN}`));

// Stop every child with the server, so no tool keeps writing into a reel after a restart.
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Reel Studio is stopping (${signal}); stopping ${children.size} child process(es).`);
  for (const cancel of cancels) {
    try {
      cancel();
    } catch {
      /* already done */
    }
  }
  killAll('SIGTERM');
  server.close();
  setTimeout(() => {
    killAll('SIGKILL');
    process.exit(0);
  }, 1500);
};
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => shutdown(sig));
