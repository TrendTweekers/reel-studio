// Reel Studio connector for the Claude Desktop chat (MCP over stdio).
// Paulina talks to Claude in her normal Claude Desktop chat; these tools let that Claude edit her
// reels the same way the /reel-* skills do in Claude Code, but through the app's local JSON API on
// http://localhost:8787. It never deletes anything and never posts anything.
//
// Run: node --import tsx mcp/server.ts   (Claude Desktop starts it; see mcp/README.md)
// stdout is the MCP channel. Everything else (Remotion logs etc.) is sent to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { checkEdit, type Problem } from '../src/shared/check';
import { IG_PROMPTS } from '../src/shared/igPrompts';
import { checkVideo } from '../server/videocheck';
import { outputDuration, outputToSource, outputWords, sourceToOutput, totalFrames } from '../src/shared/time';
import {
  FPS,
  HOOK_FONTS,
  NEEDS_CUTOUT,
  SFX_NAMES,
  SUBTITLE_FONTS,
  type CoverCandidate,
  type Edit,
  type Effect,
  type EffectKind,
  type FaceSample,
  type ReelProps,
  type Segment,
  type Word,
} from '../src/shared/types';

// ---------- stdout belongs to MCP ----------
const realWrite = process.stdout.write.bind(process.stdout) as (chunk: unknown, enc?: unknown, cb?: unknown) => boolean;
const mcpOut = new Writable({
  write(chunk, enc, cb) {
    realWrite(chunk, enc, cb);
  },
});
process.stdout.write = ((chunk: unknown, enc?: unknown, cb?: unknown) =>
  (process.stderr.write as (c: unknown, e?: unknown, cb?: unknown) => boolean)(chunk, enc, cb)) as typeof process.stdout.write;
console.log = console.error;
console.info = console.error;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Claude Desktop may start us anywhere; the video engine looks for its browser under ./node_modules.
process.chdir(ROOT);
const BRAND = path.join(ROOT, 'brand.md');
const PORT = Number(process.env.PORT ?? 8787);
const ORIGIN = `http://localhost:${PORT}`;
const IS_MAC = process.platform === 'darwin';
// Claude Desktop starts us with a short PATH. Homebrew (ffmpeg) lives here on a Mac.
for (const p of [process.env.FFMPEG_BIN_DIR, '/usr/local/bin', '/opt/homebrew/bin'])
  if (p && fs.existsSync(p) && !(process.env.PATH ?? '').split(path.delimiter).includes(p))
    process.env.PATH = `${p}${path.delimiter}${process.env.PATH ?? ''}`;

const NOT_OPEN = 'Reel Studio is not open. I can open it: call open_reel_studio.';
class NotOpen extends Error {}
class UserError extends Error {}

// ---------- API ----------
type ApiError = Error & { status?: number; body?: Record<string, unknown> | null };
async function api<T = unknown>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ORIGIN + url, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new NotOpen(NOT_OPEN);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = json as Record<string, unknown> | null;
    const err = new Error(j?.error ? String(j.error) : `HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    err.body = j;
    throw err;
  }
  return json as T;
}
const enc = encodeURIComponent;
const isUp = async () => {
  try {
    const r = await fetch(`${ORIGIN}/api/projects`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
};

type Status = { step: string; progress: number; message?: string; position?: number; queuedFor?: string };
type Project = {
  slug: string;
  status: Status;
  edit: Edit | null;
  words: Word[];
  faces: FaceSample[];
  hasCutout: boolean;
  editVersion: number;
  renders: { file: string; createdAt: string; url: string }[];
  summary?: { pausesCut?: number; secondsSaved?: number; hook?: unknown; effects?: number } | null;
  parent?: string | null;
};
const getProject = async (slug: string) => {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) throw new UserError(`"${slug}" is not a reel name. Call list_reels to see the names.`);
  try {
    return await api<Project>('GET', `/api/projects/${enc(slug)}`);
  } catch (e) {
    if ((e as ApiError).status === 404) throw new UserError(`There is no reel "${slug}". Call list_reels to see the names.`);
    throw e;
  }
};
const needEdit = (p: Project): Edit => {
  if (!p.edit) throw new UserError(`The reel "${p.slug}" is still being prepared (step: ${p.status.step}). Try again in a minute.`);
  return p.edit;
};

// Change edit.json safely: read, change, write with the version we read. If the page saved in
// between (409), read again and redo the change once.
async function mutate(slug: string, fn: (e: Edit, p: Project) => Edit | void): Promise<{ edit: Edit; project: Project }> {
  warmUp();
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = await getProject(slug);
    const edit = structuredClone(needEdit(p));
    const next = (fn(edit, p) ?? edit) as Edit;
    try {
      await api('PUT', `/api/projects/${enc(slug)}/edit`, next, { 'x-base-version': String(p.editVersion), 'x-edited-by': 'claude' });
      return { edit: next, project: p };
    } catch (e) {
      if ((e as ApiError).status === 409 && attempt === 0) continue;
      throw e;
    }
  }
  throw new UserError('The reel kept changing on the page. Try again.');
}

// ---------- checks ----------
const listFiles = async (kind: 'board' | 'music') => (await api<{ file: string }[]>('GET', `/api/${kind}`)).map((x) => x.file);
async function problems(slug: string): Promise<Problem[]> {
  try {
    const r = await api<{ problems: Problem[] }>('GET', `/api/projects/${enc(slug)}/problems`);
    return r.problems ?? [];
  } catch (e) {
    if ((e as ApiError).status !== 404 || ((e as ApiError).body?.error ?? '') === 'No such project') throw e;
    // Older app without /problems: run the same shared check here.
    const p = await getProject(slug);
    const [board, music] = await Promise.all([listFiles('board'), listFiles('music')]);
    return checkEdit(needEdit(p), { words: p.words, board: new Set(board), music: new Set(music), hasCutout: p.hasCutout });
  }
}
const problemText = (ps: Problem[]) =>
  ps.length ? `Problems (${ps.length}), fix every one:\n` + ps.map((x) => `- ${x.text}  [${x.detail}${x.effectId ? `; effect ${x.effectId}` : ''}]`).join('\n') : 'Check: OK, no problems.';
const afterChange = async (slug: string, said: string) => `${said}\n${problemText(await problems(slug))}`;

// ---------- formatting ----------
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const isKept = (w: Word, segs: Segment[]) => {
  const mid = (w.start + w.end) / 2;
  return segs.some((s) => mid >= s.start && mid <= s.end);
};
const effectLine = (e: Effect, segs: Segment[]) => {
  const out = sourceToOutput(e.at, segs);
  const what = e.text ?? e.image ?? e.items?.join(' / ') ?? (e.kind === 'zoom' ? `scale ${e.scale ?? 1.25}` : '');
  return `  ${e.id}  ${e.kind.padEnd(9)} at ${e.at.toFixed(2)}s (video ${out === null ? 'after end' : `${out.toFixed(1)}s`}), ${e.duration}s${e.word ? `, word "${e.word}"` : ''}${what ? `: ${what}` : ''}${e.position && e.position !== 'auto' ? `, ${e.position}` : ''}`;
};
const lengthOf = (e: Edit) => outputDuration(e.segments) + (e.endCard?.enabled ? e.endCard.seconds : 0);

// ---------- segment math (same as the editor page, web/src/editState.ts) ----------
const MIN_SEG = 0.04;
const MERGE_GAP = 0.06;
const normalizeSegments = (segs: Segment[]): Segment[] => {
  const sorted = segs.filter((s) => s.end - s.start >= MIN_SEG).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + MERGE_GAP) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
};
const cutRange = (segs: Segment[], a: number, b: number): Segment[] =>
  normalizeSegments(
    segs.flatMap((s) => {
      if (b <= s.start || a >= s.end) return [s];
      const parts: Segment[] = [];
      if (a > s.start) parts.push({ start: s.start, end: a });
      if (b < s.end) parts.push({ start: b, end: s.end });
      return parts;
    }),
  );
const keepRange = (segs: Segment[], a: number, b: number): Segment[] => normalizeSegments([...segs.map((s) => ({ ...s })), { start: a, end: b }]);

// ---------- effects (same defaults as the editor page) ----------
const KINDS = [
  'picture', 'label', 'zoom', 'glass', 'behind', 'chapter', 'checklist', 'flash', 'phone', 'emoji',
  'chart', 'cover', 'framebreak', 'papercut', 'greenscreen', 'orbit', 'doodle', 'ui', 'vertigo', 'pullback', 'zoomthrough',
] as const;
const DEFAULT_DURATION: Record<EffectKind, number> = {
  picture: 1.6, label: 1.4, zoom: 0.8, glass: 1.6, behind: 2.0, chapter: 2.0, emoji: 1.0, checklist: 3.5, flash: 0.2, phone: 2.0,
  framebreak: 2.5, papercut: 2.0, vertigo: 2.2, pullback: 2.2, greenscreen: 3.0, cover: 2.8, zoomthrough: 0.6, orbit: 3.0, doodle: 2.0, ui: 3.0, chart: 3.2,
};
const shortId = () => Math.random().toString(36).slice(2, 8);
const cleanWord = (s: string) => s.replace(/[.,!?;:„”"“…]+/g, '').trim();

// ---------- JSON merge patch (RFC 7386) ----------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const mergePatch = (target: unknown, patch: unknown): unknown => {
  if (!isObj(patch)) return patch;
  const out: Record<string, unknown> = isObj(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
};

// ---------- system helpers ----------
const run = (cmd: string, args: string[]) =>
  new Promise<{ code: number; out: Buffer; err: string }>((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => chunks.push(d));
    p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    p.on('error', (e) => resolve({ code: -1, out: Buffer.alloc(0), err: e.message }));
    p.on('close', (code) => resolve({ code: code ?? -1, out: Buffer.concat(chunks), err }));
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const openUrl = async (target: string, app?: string) => {
  if (!IS_MAC) return false;
  const r = await run('open', app ? ['-a', app] : [target]);
  return r.code === 0;
};
// A small JPEG (width w) of an image or a video frame, through ffmpeg. Null when ffmpeg is missing.
const smallJpeg = async (input: string, w: number, seek?: number) => {
  const args = ['-v', 'error', ...(seek !== undefined ? ['-ss', String(Math.max(0, seek))] : []), '-i', input, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
  const r = await run('ffmpeg', args);
  return r.code === 0 && r.out.length ? r.out.toString('base64') : null;
};
const mediaUrl = (slug: string, rel: string) => `${ORIGIN}/media/${enc(slug)}/${rel.split('/').map(enc).join('/')}`;

// ---------- frame preview with the real video engine ----------
// The first picture takes ~15 to 30 s (the video engine starts); after that ~1 to 3 s each.
type Renderer = typeof import('@remotion/renderer');
type Browser = Awaited<ReturnType<Renderer['openBrowser']>>;
let enginePromise: Promise<{ R: Renderer; serveUrl: string; browser: Browser }> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const engine = () => {
  if (!enginePromise) {
    enginePromise = (async () => {
      const R = await import('@remotion/renderer');
      const { bundle } = await import('@remotion/bundler');
      const [serveUrl, browser] = await Promise.all([
        bundle({ entryPoint: path.join(ROOT, 'src', 'remotion', 'index.ts') }),
        R.openBrowser('chrome', { logLevel: 'error' }),
      ]);
      return { R, serveUrl, browser };
    })().catch((e) => {
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
};
const releaseLater = () => {
  if (idleTimer) clearTimeout(idleTimer);
  // Free the hidden browser after 10 quiet minutes.
  idleTimer = setTimeout(() => {
    const p = enginePromise;
    enginePromise = null;
    void p?.then((x) => x.browser.close({ silent: true })).catch(() => {});
  }, 10 * 60 * 1000);
  idleTimer.unref();
};
// Start the engine in the background after the first change, so show_reel_frame is fast.
function warmUp() {
  if (!enginePromise) void engine().then(releaseLater, () => {});
}
const reelProps = (p: Project): ReelProps => ({
  edit: needEdit(p),
  words: p.words,
  faces: p.faces,
  urls: {
    video: `${ORIGIN}/media/${enc(p.slug)}/proxy.mp4`,
    cutout: p.hasCutout ? `${ORIGIN}/media/${enc(p.slug)}/cutout.webm` : null,
    board: `${ORIGIN}/board/`,
    sfx: `${ORIGIN}/sfx/`,
    music: `${ORIGIN}/music/`,
  },
});
const renderFrame = async (p: Project, frame: number) => {
  const { R, serveUrl, browser } = await engine();
  const inputProps = reelProps(p);
  const composition = await R.selectComposition({ serveUrl, id: 'Reel', inputProps, puppeteerInstance: browser, logLevel: 'error' });
  const out = path.join(os.tmpdir(), `reel-studio-frame-${process.pid}-${Date.now()}.jpg`);
  try {
    await R.renderStill({ composition, serveUrl, inputProps, frame, imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5, output: out, puppeteerInstance: browser, logLevel: 'error' });
    return fs.readFileSync(out).toString('base64');
  } finally {
    fs.rmSync(out, { force: true });
    releaseLater();
  }
};
// Plain words: what is on screen at output second t.
const describeFrame = (e: Edit, words: Word[], t: number) => {
  const lines: string[] = [];
  const kept = outputDuration(e.segments);
  if (t >= kept) {
    lines.push(e.endCard?.enabled ? `End card: "${e.endCard.line}" ${e.endCard.keyword}${e.endCard.sub ? ` / ${e.endCard.sub}` : ''}${e.endCard.image ? `, picture ${e.endCard.image}` : ''}.` : 'After the end of the video.');
    return lines.join('\n');
  }
  if (e.hook && t < e.hook.until) lines.push(`Hook on screen (${e.style.hookFont}): "${e.hook.text}"${e.hook.accent ? ` / "${e.hook.accent}"` : ''}${e.hook.sub ? ` / ${e.hook.sub}` : ''}.`);
  const ow = outputWords(words, e.segments, e.wordFixes);
  const near = ow.filter((w) => w.end >= t - 0.8 && w.start <= t + 0.8).map((w) => (t >= w.start && t <= w.end ? `[${w.text}]` : w.text));
  if (e.style.subtitleStyle !== 'off' && near.length) lines.push(`Subtitles (${e.style.subtitleStyle}, ${e.style.subtitlePosition}): ${near.join(' ')}`);
  for (const fx of e.effects) {
    const at = sourceToOutput(fx.at, e.segments);
    if (at !== null && t >= at && t < at + fx.duration) lines.push(`Effect showing: ${effectLine(fx, e.segments).trim()}`);
  }
  if (e.toggles.zoomJumps) lines.push('Automatic small zoom jumps are on.');
  return lines.join('\n');
};

// ---------- server ----------
const INSTRUCTIONS = `Reel Studio: Paulina Lipska's own reel editor on her Mac. These tools change her reels.
WHO: Paulina is a Polish fashion stylist and ebook author (@paulinalipska). Style "nowoczesna klasyka z twistem": elegant, editorial, calm. Cream, black and one soft accent. Serif headlines. Never loud or cheap.
TALK: answer in the language she writes in (Polish: informal "Ty"). Short sentences, plain words. No code, file names, JSON or technical words unless she asks. Say what you changed in her words ("I added your coat photo when you say płaszcz").
START: call get_preferences once at the start of a conversation and follow it. When she says something that should hold for ALL future reels, call remember_preference and tell her "Zapamiętam to." A wish for one reel only goes into that reel (update_reel), not into her preferences.
WORK: if she does not name a reel, use the newest from list_reels. Find words with get_words (search) before placing anything; never guess a time. All times in a reel are SOURCE seconds (seconds into her original video); tools that take a word index do the math for you. After every change call check_reel and fix every problem it lists. To see your result, call show_reel_frame at the moment you changed and look at the picture. She sees changes live on the editor page (offer open_reel_studio with the reel).
TASTE: fewer, better effects. About one effect every 2 to 4 seconds is plenty; pictures and labels on stressed words, not on every word; keep her face free; one idea per effect. When unsure, do less and ask.
PICTURES AND MUSIC: use only her own board pictures (list_board) and her own music (list_music). If she asks for a picture from the internet or Pinterest, tell her it can bring a copyright claim and ask her to add her own picture on the page.
NEVER delete a reel, a picture or a video file (there are no tools for it; she does that on the page herself). NEVER post anything to Instagram or TikTok; she posts herself.
AFTER A NEW REEL: offer to proofread the subtitles (get_words, then fix_word for misheard brand and fashion words).
MAKE THE VIDEO: check_reel must be OK first. make_video takes a few minutes; then call check_video, look at the picture and tell her if it is ready to post or what you would fix; then show_in_finder and say she can AirDrop it to her phone.
INSTAGRAM (before filming, after posting): for a reel idea, script or hooks, a caption check, a week plan, replies, DMs, carousels, stories or a profile check, call instagram_guide with the job and follow it. These tools work without Reel Studio open.
If a tool says Reel Studio is not open, call open_reel_studio.`;

const server = new McpServer({ name: 'reel-studio', version: '1.0.0' }, { instructions: INSTRUCTIONS });

type Extra = { _meta?: { progressToken?: string | number }; sendNotification: (n: { method: 'notifications/progress'; params: { progressToken: string | number; progress: number; total?: number; message?: string } }) => Promise<void> };
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type Result = string | Content[];
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  annotations: Record<string, boolean>,
  fn: (args: z.infer<z.ZodObject<S>>, extra: Extra) => Promise<Result>,
) {
  const handler = async (args: z.infer<z.ZodObject<S>>, extra: Extra) => {
    try {
      const r = await fn(args, extra);
      return { content: typeof r === 'string' ? [{ type: 'text' as const, text: r }] : r };
    } catch (e) {
      const msg = e instanceof NotOpen || e instanceof UserError ? e.message : `Something went wrong: ${(e as Error).message}`;
      return { content: [{ type: 'text' as const, text: msg }], isError: true };
    }
  };
  (server.registerTool as unknown as (n: string, c: unknown, h: unknown) => void)(name, { description, inputSchema: shape, annotations }, handler);
}

const slugArg = z.string().describe('The reel name (slug) from list_reels, e.g. "2026-10-26-plaszcz-na-jesien".');
const progress = async (extra: Extra, value: number, message: string) => {
  const token = extra._meta?.progressToken;
  if (token === undefined) return;
  try {
    await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: Math.round(value * 100), total: 100, message } });
  } catch {
    /* client gone */
  }
};

// ----- open / list -----
tool(
  'open_reel_studio',
  'Open the Reel Studio app on her Mac (and wait until it is ready, up to 60 s). With a reel name, also show that reel in the editor page so she can watch your changes live.',
  { slug: z.string().optional().describe('Optional reel to show in the editor page.') },
  WRITE,
  async ({ slug }) => {
    let up = await isUp();
    if (!up) {
      if (!IS_MAC) return 'Reel Studio is not running, and I can only start it on a Mac. Ask her to click "Reel Studio" in the Dock.';
      await openUrl('', 'Reel Studio');
      for (let i = 0; i < 60 && !up; i++) {
        await sleep(1000);
        up = await isUp();
      }
      if (!up) return 'I asked Reel Studio to start, but it did not answer within 60 seconds. Ask her to click "Reel Studio" in the Dock (or double-click "Start Reel Studio.command") and wait a moment.';
    }
    if (slug) {
      await getProject(slug);
      const ok = await openUrl(`${ORIGIN}/#/p/${slug}`);
      return ok ? `Reel Studio is open and shows the reel "${slug}".` : `Reel Studio is running. The reel page is ${ORIGIN}/#/p/${slug}`;
    }
    if (IS_MAC) await openUrl(ORIGIN);
    return 'Reel Studio is open.';
  },
);

tool('list_reels', 'List all her reels, newest first: name (slug), title, state, and which long video a clip comes from.', {}, READ, async () => {
  const items = await api<{ slug: string; title: string; createdAt: string; status: Status; parent?: string | null }[]>('GET', '/api/projects');
  if (!items.length) return 'No reels yet. She can drop a video from her phone on the editor page.';
  return items
    .map((p) => {
      const st = p.status.step === 'ready' ? 'ready' : p.status.step === 'error' ? `error: ${p.status.message ?? ''}` : `${p.status.step} ${Math.round(p.status.progress * 100)}%`;
      return `${p.slug}  "${p.title}"  [${st}]${p.parent ? `  (clip of ${p.parent})` : ''}${p.createdAt ? `  ${p.createdAt.slice(0, 16).replace('T', ' ')}` : ''}`;
    })
    .join('\n');
});

tool(
  'get_reel',
  'Everything about one reel in short: title, state, style, hook, length, cuts, all effects (with id, source time and video time), cover, end card, captions, music, finished videos, what the first automatic edit did, and current problems.',
  { slug: slugArg },
  READ,
  async ({ slug }) => {
    const p = await getProject(slug);
    if (!p.edit) return `Reel "${slug}" is not ready yet (step: ${p.status.step}, ${Math.round(p.status.progress * 100)}%${p.status.message ? `, ${p.status.message}` : ''}).`;
    const e = p.edit;
    let summary = p.summary ?? null;
    if (!summary) {
      try {
        summary = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', slug, 'meta.json'), 'utf8')).summary ?? null;
      } catch {
        /* none */
      }
    }
    const L: string[] = [];
    L.push(`Reel ${slug}: "${e.title}" (language ${e.language}), state ${p.status.step}${p.parent ? `, clip of ${p.parent}` : ''}`);
    L.push(`Length: ${lengthOf(e).toFixed(1)} s (source video ${e.source.duration.toFixed(1)} s, ${e.segments.length} kept parts${e.endCard?.enabled ? `, + ${e.endCard.seconds} s end card` : ''})`);
    L.push(`Style: ${e.styleId ?? 'custom'}. Hook font ${e.style.hookFont} ${e.style.hookColor}, subtitles ${e.style.subtitleFont} ${e.style.subtitleStyle} ${e.style.subtitlePosition}, accent ${e.style.accentColor}, vibe ${e.style.vibe}`);
    L.push(`Toggles: ${Object.entries(e.toggles).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')}`);
    L.push(`Sound: effects ${e.sound.effects ? 'on' : 'off'} (default ${e.sound.defaultSfx}), music ${e.sound.music ?? 'none'}${e.sound.music ? ` at ${e.sound.musicVolume}${e.sound.duck ? ', quieter while she speaks' : ''}` : ''}`);
    L.push(e.hook ? `Hook (until ${e.hook.until} s): "${e.hook.text}"${e.hook.accent ? ` / "${e.hook.accent}"` : ''}${e.hook.sub ? ` / ${e.hook.sub}` : ''}` : 'Hook: none');
    const fx = [...e.effects].sort((a, b) => a.at - b.at);
    L.push(`Effects (${fx.length}):${fx.length ? '' : ' none'}`);
    for (const x of fx) L.push(effectLine(x, e.segments));
    const fixes = Object.entries(e.wordFixes ?? {});
    if (fixes.length) L.push(`Word fixes: ${fixes.map(([i, t]) => `#${i} ${p.words[Number(i)]?.text ?? '?'} -> ${t}`).join(', ')}`);
    L.push(e.cover ? `Cover: frame at ${e.cover.t} s, layout ${e.cover.layout}${e.cover.title ? `, "${e.cover.title}"` : ''}${e.cover.accent ? ` / "${e.cover.accent}"` : ''}` : 'Cover: not set');
    L.push(e.endCard ? `End card: ${e.endCard.enabled ? 'on' : 'off'}, "${e.endCard.line}" ${e.endCard.keyword}${e.endCard.sub ? ` / ${e.endCard.sub}` : ''}, picture ${e.endCard.image ?? 'none'}, ${e.endCard.seconds} s` : 'End card: none');
    L.push(e.post ? `Instagram caption: set (keyword "${e.post.keyword ?? ''}", ${e.post.hashtags.length} hashtags)` : 'Instagram caption: none');
    L.push(e.tiktok ? `TikTok version: set${e.tiktok.hook ? `, hook "${e.tiktok.hook.text}"` : ''}` : 'TikTok version: none');
    if (summary) L.push(`First automatic edit: ${JSON.stringify(summary)}`);
    L.push(p.renders.length ? `Finished videos: ${p.renders.map((r) => r.file).join(', ')}` : 'Finished videos: none yet');
    L.push(problemText(await problems(slug)));
    return L.join('\n');
  },
);

tool(
  'get_words',
  'Her spoken words, numbered. Each line: index, source time (use for effects), time in the finished video, the word, "-> fix" if corrected, [CUT] if cut out. Use search to find a word ("płaszcz" also finds "plaszcz", "płaszczem"). Without search, use from/to for long videos.',
  {
    slug: slugArg,
    search: z.string().optional().describe('Part of a word to find; Polish letters do not matter.'),
    from: z.number().int().min(0).optional().describe('First word index to show.'),
    to: z.number().int().min(0).optional().describe('Last word index to show.'),
  },
  READ,
  async ({ slug, search, from, to }) => {
    const p = await getProject(slug);
    const e = p.edit;
    const q = search ? fold(search.trim()) : '';
    const L = [`Reel ${slug}${e ? ` ("${e.title}")` : ''}, ${p.words.length} words`, 'idx  source  video  word'];
    let shown = 0;
    let more = 0;
    p.words.forEach((w, i) => {
      if (q && !fold(w.text).includes(q)) return;
      if (from !== undefined && i < from) return;
      if (to !== undefined && i > to) return;
      if (shown >= 700) {
        more++;
        return;
      }
      const out = e ? sourceToOutput(w.start, e.segments) : w.start;
      const fixed = e?.wordFixes?.[String(i)];
      const kept = !e || isKept(w, e.segments);
      L.push(`${String(i).padStart(3)}  ${w.start.toFixed(2).padStart(6)}  ${out === null || !kept ? '  -  ' : out.toFixed(2).padStart(5)}  ${w.text}${fixed ? ` -> ${fixed}` : ''}${kept ? '' : '  [CUT]'}`);
      shown++;
    });
    if (!shown) L.push(q ? `No word contains "${search}".` : 'No words in that range.');
    if (more) L.push(`... ${more} more words. Use from/to to see them.`);
    return L.join('\n');
  },
);

tool(
  'get_transcript',
  'The whole video as sentences with source times: [start-end] (minute, length) text. Use it to understand the video, find highlights for clips, and write captions.',
  { slug: slugArg },
  READ,
  async ({ slug }) => {
    const p = await getProject(slug);
    const words = p.words;
    const L = [`Reel ${slug}, ${words.length} words, ${fmt(words.at(-1)?.end ?? 0)} long`];
    let cur: Word[] = [];
    const flush = () => {
      if (!cur.length) return;
      const a = cur[0].start;
      const b = cur[cur.length - 1].end;
      L.push(`[${a.toFixed(2)}-${b.toFixed(2)}] (${fmt(a)}, ${(b - a).toFixed(1)}s) ${cur.map((w) => w.text).join(' ')}`);
      cur = [];
    };
    words.forEach((w, i) => {
      cur.push(w);
      const next = words[i + 1];
      if (/[.!?…]$/.test(w.text) || (next && next.start - w.end > 1.2) || cur.length >= 40) flush();
    });
    flush();
    return L.join('\n');
  },
);

// ----- styles -----
type StyleItem = { id: string; name: string; namePl: string; description: string; own?: boolean };
tool('list_styles', 'The editing styles (a whole look in one click): built-in ones and her own saved ones, and which one new reels get.', {}, READ, async () => {
  const r = await api<{ styles: StyleItem[]; defaultStyle: string }>('GET', '/api/styles');
  return r.styles.map((s) => `${s.id}  ${s.name} / ${s.namePl}${s.own ? ' (her own)' : ''}${s.id === r.defaultStyle ? ' [new reels use this]' : ''}: ${s.description}`).join('\n');
});
tool(
  'apply_style',
  'Apply an editing style to a reel. The look (fonts, colours, subtitles, sounds, zoom habits) changes; words, cuts and effects stay.',
  { slug: slugArg, styleId: z.string().describe('Style id from list_styles, e.g. "editorial", "vogue", "girlblog", "film", "bold", "minimal".') },
  WRITE,
  async ({ slug, styleId }) => {
    await getProject(slug);
    try {
      await api('POST', `/api/projects/${enc(slug)}/style`, { id: styleId });
    } catch (e) {
      if ((e as ApiError).status === 400) throw new UserError(`There is no style "${styleId}". Call list_styles.`);
      throw e;
    }
    return afterChange(slug, `Style "${styleId}" applied.`);
  },
);

// ----- update_reel -----
const hookShape = z.object({ text: z.string(), accent: z.string().nullable().optional(), sub: z.string().nullable().optional(), until: z.number().min(0) }).partial();
const postShape = z.object({ caption: z.string(), hashtags: z.array(z.string()), keyword: z.string().nullable() }).partial();
const changesShape = z
  .object({
    title: z.string(),
    hook: hookShape.nullable().describe('Hook: text (big line), accent (2nd line, italic), sub (small line), until (seconds on screen). null = no hook.'),
    style: z
      .object({
        hookFont: z.enum(HOOK_FONTS),
        hookColor: z.string(),
        subtitleFont: z.enum(SUBTITLE_FONTS),
        subtitleStyle: z.enum(['clean', 'box', 'karaoke', 'pop', 'off']),
        subtitlePosition: z.enum(['lower', 'middle', 'above-head']),
        accentColor: z.string(),
        vibe: z.enum(['clean', 'film', 'glow', 'editorial']),
      })
      .partial(),
    sound: z
      .object({ effects: z.boolean(), defaultSfx: z.enum(SFX_NAMES), music: z.string().nullable().describe('File from list_music, or null for no music'), musicVolume: z.number().min(0).max(1), duck: z.boolean() })
      .partial(),
    toggles: z.object({ zoomJumps: z.boolean(), progressBar: z.boolean(), grain: z.boolean(), glowAboveHead: z.boolean() }).partial(),
    cover: z.object({ t: z.number(), title: z.string().nullable(), accent: z.string().nullable(), layout: z.enum(['top', 'center', 'bottom', 'none']) }).partial().nullable(),
    wordFixes: z.record(z.string(), z.string().nullable()).describe('word index -> corrected text; null removes a fix'),
    endCard: z
      .object({ enabled: z.boolean(), keyword: z.string(), line: z.string(), sub: z.string().nullable(), image: z.string().nullable(), seconds: z.number().min(1).max(6) })
      .partial()
      .nullable(),
    post: postShape.nullable(),
    tiktok: z.object({ hook: hookShape.nullable(), endCardLine: z.string().nullable(), post: postShape.nullable() }).partial().nullable(),
  })
  .partial()
  .strict();
tool(
  'update_reel',
  'Change reel settings with a merge patch: only the fields you send change; null removes a field. Fields: title, hook, style, sound, toggles, cover, wordFixes, endCard (the "comment KEYWORD" card that sells her ebook), post (Instagram caption {caption, hashtags without #, keyword}), tiktok ({hook, endCardLine, post}). Effects, cuts and words have their own tools.',
  { slug: slugArg, changes: changesShape },
  WRITE,
  async ({ slug, changes }) => {
    if (!Object.keys(changes).length) throw new UserError('Nothing to change.');
    const board = changes.endCard?.image ? await listFiles('board') : null;
    if (board && changes.endCard?.image && !board.includes(changes.endCard.image)) throw new UserError(`There is no board picture "${changes.endCard.image}". Pictures: ${board.join(', ') || 'none yet'}.`);
    if (changes.sound?.music) {
      const music = await listFiles('music');
      if (!music.includes(changes.sound.music)) throw new UserError(`There is no music "${changes.sound.music}". Music: ${music.join(', ') || 'none yet (she can add it on the page)'}.`);
    }
    await mutate(slug, (e) => {
      const { hook, ...rest } = changes;
      const next = mergePatch(e, rest) as Edit;
      if (hook === null) next.hook = null;
      else if (hook) {
        const h = mergePatch(e.hook ?? {}, hook) as NonNullable<Edit['hook']>;
        if (!h.text) throw new UserError('The hook needs a text.');
        if (typeof h.until !== 'number') h.until = 2.5;
        next.hook = h;
      }
      if (next.cover && (typeof next.cover.t !== 'number' || !next.cover.layout)) throw new UserError('A new cover needs t (source seconds) and layout. Use set_cover.');
      if (next.endCard && (!next.endCard.keyword || !next.endCard.line || typeof next.endCard.seconds !== 'number' || typeof next.endCard.enabled !== 'boolean'))
        throw new UserError('A new end card needs enabled, keyword, line and seconds.');
      return next;
    });
    if (changes.title) await api('PATCH', `/api/projects/${enc(slug)}`, { title: changes.title }).catch(() => {});
    return afterChange(slug, `Changed: ${Object.keys(changes).join(', ')}.`);
  },
);

// ----- effects -----
const fieldsShape = z
  .object({
    text: z.string().describe('label, glass, behind, chapter, emoji; cover title; chart title; ui main text (notification/search); doodle hand-written word'),
    items: z.array(z.string()).describe('checklist items; cover lines (2-4); orbit words (1-6); ui extra card texts; chart bars "Label: number" (2-6)'),
    image: z.string().describe('board picture file (list_board): picture, phone (required); greenscreen background, framebreak backdrop, papercut paper, orbit picture (optional)'),
    position: z.enum(['auto', 'top', 'bottom', 'left', 'right', 'above-head', 'center']),
    sfx: z.union([z.enum(SFX_NAMES), z.literal('none'), z.literal('default')]),
    scale: z.number().min(1).max(2).describe('zoom: 1.12 soft, 1.25 normal'),
    duration: z.number().min(0.1).max(10).describe('seconds on screen'),
  })
  .partial();
const placeOf = (p: Project, wordIndex?: number, at?: number) => {
  if (wordIndex !== undefined) {
    const w = p.words[wordIndex];
    if (!w) throw new UserError(`There is no word number ${wordIndex}. Use get_words.`);
    return { at: r2(w.start), word: cleanWord(p.edit?.wordFixes?.[String(wordIndex)] ?? w.text) };
  }
  if (at !== undefined) {
    const i = p.words.findIndex((w) => w.end >= at);
    return { at: r2(at), word: i >= 0 ? cleanWord(p.words[i].text) : undefined };
  }
  throw new UserError('Give wordIndex (best) or sourceSeconds.');
};
const neighbours = (e: Edit, fx: Effect) => {
  const at = sourceToOutput(fx.at, e.segments);
  if (at === null) return '';
  const close = e.effects.filter((x) => x.id !== fx.id && x.kind !== 'flash').map((x) => ({ x, d: (sourceToOutput(x.at, e.segments) ?? 1e9) - at })).filter((n) => Math.abs(n.d) < 2);
  return close.length ? `\nTaste note: ${close.map((n) => `${n.x.kind} "${n.x.word ?? ''}" ${Math.abs(n.d).toFixed(1)} s ${n.d < 0 ? 'before' : 'after'}`).join(', ')}. Keep about 2 to 4 s between effects.` : '';
};
const checkImage = async (fields: { image?: string }) => {
  if (!fields.image) return;
  const board = await listFiles('board');
  if (!board.includes(fields.image)) throw new UserError(`There is no board picture "${fields.image}". Pictures: ${board.join(', ') || 'none yet (she can add them on the page)'}.`);
};
tool(
  'add_effect',
  `Add one effect on a word. kinds: picture (her board picture pops in; needs image), label (small tag with text), zoom (punch-in on her face; scale), glass (big frosted text), behind (big text behind her; needs the cut-out, started automatically), chapter (title like "[o stylu]"), checklist (items tick one by one), flash (quick white flash), phone (phone mock-up with a board picture), emoji (one big emoji in text).
BIG MOMENTS (use 1-2 per reel, on the key line): chart (a chart card that grows; text = title, items = "Label: number" bars), cover (she is on a magazine cover; text = big title like "STYL", items = 2-3 cover lines), framebreak (video becomes a framed photo and she steps out of it; cut-out), papercut (she becomes a paper cut-out sticker; cut-out), greenscreen (she stands in front of a board picture, or a cream studio backdrop without image; cut-out), orbit (words in items, or a picture, circle around her head), doodle (hand-drawn doodles wiggle around her; text optional), ui (phone-style cards float around her: notification/search with text, items = more cards), vertigo (the room stretches away, she stays; cut-out), pullback (starts close, pulls back to reveal), zoomthrough (0.6 s fast zoom into the next shot; put it on the first word after a cut). Cut-out effects start the cut-out automatically.
Place it with wordIndex from get_words (best) or sourceSeconds.`,
  {
    slug: slugArg,
    kind: z.enum(KINDS),
    wordIndex: z.number().int().min(0).optional(),
    sourceSeconds: z.number().min(0).optional(),
    fields: fieldsShape.optional(),
  },
  WRITE,
  async ({ slug, kind, wordIndex, sourceSeconds, fields = {} }) => {
    if ((kind === 'picture' || kind === 'phone') && !fields.image) throw new UserError('This effect needs a board picture (image). Call list_board.');
    await checkImage(fields);
    let added: Effect | null = null;
    let startCutout = false;
    const { edit } = await mutate(slug, (e, p) => {
      const place = placeOf(p, wordIndex, sourceSeconds);
      const fx: Effect = { id: shortId(), kind, at: place.at, duration: DEFAULT_DURATION[kind], ...(place.word ? { word: place.word } : {}) };
      if (kind === 'picture' || kind === 'phone') fx.sfx = 'default';
      if (['label', 'glass', 'behind'].includes(kind)) fx.text = place.word;
      if (kind === 'chapter') fx.text = `[${place.word ?? ''}]`;
      if (kind === 'emoji') fx.text = '✨';
      if (kind === 'checklist') fx.items = [place.word ?? ''];
      if (kind === 'cover') fx.text = (place.word ?? 'STYL').toUpperCase();
      if (kind === 'orbit') fx.items = [place.word ?? ''];
      if (kind === 'ui' || kind === 'chart') fx.text = place.word;
      if (kind === 'zoom') {
        fx.scale = 1.25;
        fx.sfx = 'none';
      }
      Object.assign(fx, fields);
      added = fx;
      startCutout = NEEDS_CUTOUT.includes(kind) && !p.hasCutout;
      e.effects = [...e.effects, fx].sort((a, b) => a.at - b.at);
    });
    const fx = added as unknown as Effect;
    let note = '';
    if (startCutout) {
      await api('POST', `/api/projects/${enc(slug)}/cutout`, {}).catch(() => {});
      note = '\nThe person cut-out this effect needs is being made now (a few minutes). Until then the effect shows a simpler version.';
    }
    return afterChange(slug, `Added:\n${effectLine(fx, edit.segments)}${neighbours(edit, fx)}${note}`);
  },
);
tool(
  'update_effect',
  'Change one effect (id from get_reel): move it to another word (wordIndex) or time (sourceSeconds), or change its fields (text, items, image, position, sfx, scale, duration).',
  { slug: slugArg, id: z.string(), wordIndex: z.number().int().min(0).optional(), sourceSeconds: z.number().min(0).optional(), fields: fieldsShape.optional() },
  WRITE,
  async ({ slug, id, wordIndex, sourceSeconds, fields = {} }) => {
    await checkImage(fields);
    let changed: Effect | null = null;
    const { edit } = await mutate(slug, (e, p) => {
      const fx = e.effects.find((x) => x.id === id);
      if (!fx) throw new UserError(`There is no effect "${id}". Call get_reel to see the effects.`);
      if (wordIndex !== undefined || sourceSeconds !== undefined) {
        const place = placeOf(p, wordIndex, sourceSeconds);
        fx.at = place.at;
        if (place.word) fx.word = place.word;
      }
      Object.assign(fx, fields);
      e.effects.sort((a, b) => a.at - b.at);
      changed = fx;
    });
    const fx = changed as unknown as Effect;
    return afterChange(slug, `Changed:\n${effectLine(fx, edit.segments)}${neighbours(edit, fx)}`);
  },
);
tool('remove_effect', 'Take one effect out of the reel (id from get_reel). Her pictures stay on the board.', { slug: slugArg, id: z.string() }, WRITE, async ({ slug, id }) => {
  let gone: Effect | null = null;
  const { edit } = await mutate(slug, (e) => {
    gone = e.effects.find((x) => x.id === id) ?? null;
    if (!gone) throw new UserError(`There is no effect "${id}". Call get_reel to see the effects.`);
    e.effects = e.effects.filter((x) => x.id !== id);
  });
  return afterChange(slug, `Removed:\n${effectLine(gone as unknown as Effect, edit.segments)}`);
});

// ----- words and cuts -----
const rangeTool = (keep: boolean) => async ({ slug, fromIndex, toIndex }: { slug: string; fromIndex: number; toIndex: number }) => {
  if (toIndex < fromIndex) [fromIndex, toIndex] = [toIndex, fromIndex];
  let before = 0;
  const { edit, project } = await mutate(slug, (e, p) => {
    const a = p.words[fromIndex];
    const b = p.words[toIndex];
    if (!a || !b) throw new UserError(`Word numbers must be 0 to ${p.words.length - 1}. Use get_words.`);
    before = lengthOf(e);
    e.segments = keep ? keepRange(e.segments, a.start, b.end) : cutRange(e.segments, a.start, b.end);
    if (!e.segments.length) throw new UserError('That would cut everything. Nothing changed.');
  });
  const text = project.words.slice(fromIndex, toIndex + 1).map((w) => w.text).join(' ');
  return afterChange(slug, `${keep ? 'Put back' : 'Cut'} words ${fromIndex}-${toIndex}: "${text.length > 160 ? text.slice(0, 160) + '…' : text}". Length ${before.toFixed(1)} s -> ${lengthOf(edit).toFixed(1)} s.`);
};
const rangeShape = { slug: slugArg, fromIndex: z.number().int().min(0).describe('First word index (get_words)'), toIndex: z.number().int().min(0).describe('Last word index, included') };
tool('cut_words', 'Cut words out of the video (from word index to word index, both included), like selecting them on the page and pressing Cut.', rangeShape, WRITE, rangeTool(false));
tool('keep_words', 'Put cut words back into the video (from word index to word index, both included).', rangeShape, WRITE, rangeTool(true));
tool(
  'fix_word',
  'Correct a misheard word in the subtitles (brand names, fashion words like botki, torebka, szpic). The spoken sound stays; only the text changes. Empty text removes the fix.',
  { slug: slugArg, index: z.number().int().min(0), text: z.string() },
  WRITE,
  async ({ slug, index, text }) => {
    let old = '';
    await mutate(slug, (e, p) => {
      const w = p.words[index];
      if (!w) throw new UserError(`There is no word number ${index}. Use get_words.`);
      old = w.text;
      const fixes = { ...(e.wordFixes ?? {}) };
      if (text.trim()) fixes[String(index)] = text.trim();
      else delete fixes[String(index)];
      if (Object.keys(fixes).length || e.wordFixes) e.wordFixes = Object.keys(fixes).length ? fixes : undefined;
    });
    return afterChange(slug, text.trim() ? `Word ${index} "${old}" now shows as "${text.trim()}".` : `Word ${index} shows as "${old}" again.`);
  },
);
tool(
  'set_pause_tightness',
  'Re-cut the pauses of the whole reel: seconds of silence that get cut (0.25 very tight, 0.4 normal, 0.6 relaxed). This rebuilds ALL cuts, so word cuts made by hand come back; tell her that first if she made any.',
  { slug: slugArg, seconds: z.number().min(0.15).max(1.5) },
  WRITE,
  async ({ slug, seconds }) => {
    const before = lengthOf(needEdit(await getProject(slug)));
    await api('POST', `/api/projects/${enc(slug)}/autoedit`, { pauseGap: seconds });
    const after = lengthOf(needEdit(await getProject(slug)));
    return afterChange(slug, `Pauses longer than ${seconds} s are cut. Length ${before.toFixed(1)} s -> ${after.toFixed(1)} s.`);
  },
);
tool(
  'make_clip',
  'Make a new short reel from part of a longer one (source seconds; start 0.15 s before the first word, end 0.3 s after the last). It gets pauses cut, a hook and subtitles by itself, in the same style. Returns the new reel name.',
  { slug: slugArg, start: z.number().min(0), end: z.number().min(0), title: z.string().describe('Short title for the new reel') },
  WRITE,
  async ({ slug, start, end, title }) => {
    const r = await api<{ slug: string }>('POST', `/api/projects/${enc(slug)}/clip`, { start, end, title });
    const p = await getProject(r.slug);
    return `New reel "${r.slug}" (${p.edit ? lengthOf(p.edit).toFixed(1) : '?'} s). Improve its hook with update_reel, then check_reel.`;
  },
);

// ----- cover -----
type CoversState = { candidates: (CoverCandidate & { url: string })[]; story: string | null; grid: string | null; rendering: boolean; error: string | null };
tool(
  'find_cover_frames',
  'Find the best frames of her for a cover (sharp, eyes open, face well placed) and show the top ones as small pictures, best first. Takes up to a minute the first time. Then pick one with set_cover.',
  { slug: slugArg, refresh: z.boolean().optional().describe('Look again even if frames were found before') },
  READ,
  async ({ slug, refresh }, extra) => {
    let c = await api<CoversState>('GET', `/api/projects/${enc(slug)}/covers`);
    if (!c.candidates.length || refresh) {
      await api('POST', `/api/projects/${enc(slug)}/covers/find`, {}).catch((e) => {
        if ((e as ApiError).status !== 409) throw e;
      });
      const t0 = Date.now();
      await sleep(1500);
      for (;;) {
        const p = await getProject(slug);
        const busy = p.status.step === 'covers' || p.status.queuedFor === 'covers' || p.status.step === 'queued';
        c = await api<CoversState>('GET', `/api/projects/${enc(slug)}/covers`);
        if (!busy) {
          if (!c.candidates.length) return `No cover frames found${p.status.message ? `: ${p.status.message}` : ''}.`;
          break;
        }
        if (Date.now() - t0 > 4 * 60 * 1000) return 'Still looking for cover frames. Call find_cover_frames again in a minute.';
        await progress(extra, Math.min(0.95, (Date.now() - t0) / 90000), 'Looking for good frames');
        await sleep(2000);
      }
    }
    const top = [...c.candidates].sort((a, b) => b.score - a.score).slice(0, 4);
    const out: Content[] = [{ type: 'text', text: `Cover frames, best first (t = source seconds):\n${top.map((x, i) => `${i + 1}. t=${x.t.toFixed(2)} score ${x.score.toFixed(2)}`).join('\n')}${c.candidates.length > 4 ? `\n(${c.candidates.length - 4} more: ${c.candidates.slice(4).map((x) => x.t.toFixed(2)).join(', ')})` : ''}` }];
    for (const [i, x] of top.entries()) {
      const img = await smallJpeg(`${ORIGIN}${x.url}`, 270);
      if (img) out.push({ type: 'text', text: `${i + 1}. t=${x.t.toFixed(2)}` }, { type: 'image', data: img, mimeType: 'image/jpeg' });
    }
    return out;
  },
);
tool(
  'set_cover',
  'Choose the cover frame and its title. t = source seconds (from find_cover_frames, or a word time). Title: 2 to 5 words that say what the reel gives; accent = optional italic second line. layout: top / center / bottom (away from her face) or none (clean frame). Then call make_cover.',
  { slug: slugArg, t: z.number().min(0), title: z.string().optional(), accent: z.string().optional(), layout: z.enum(['top', 'center', 'bottom', 'none']) },
  WRITE,
  async ({ slug, t, title, accent, layout }) => {
    await mutate(slug, (e) => {
      e.cover = { t, layout, ...(title ? { title } : {}), ...(accent ? { accent } : {}) };
    });
    return afterChange(slug, `Cover set: frame at ${t} s, layout ${layout}${title ? `, "${title}"` : ''}${accent ? ` / "${accent}"` : ''}. Call make_cover to make the pictures.`);
  },
);
tool(
  'make_cover',
  'Make the cover pictures from the chosen cover: 9:16 (Reel and TikTok cover) and 3:4 (how it shows on her Instagram profile grid). Shows both so you can check the title does not cover her face.',
  { slug: slugArg },
  WRITE,
  async ({ slug }, extra) => {
    try {
      await api('POST', `/api/projects/${enc(slug)}/covers/render`, {});
    } catch (e) {
      if ((e as ApiError).status === 409) throw new UserError('Choose a cover frame first (set_cover).');
      throw e;
    }
    const t0 = Date.now();
    let c: CoversState;
    for (;;) {
      await sleep(2000);
      c = await api<CoversState>('GET', `/api/projects/${enc(slug)}/covers`);
      if (!c.rendering) break;
      if (Date.now() - t0 > 4 * 60 * 1000) return 'The cover is still being made. Call make_cover again in a minute.';
      await progress(extra, Math.min(0.95, (Date.now() - t0) / 60000), 'Making the cover');
    }
    if (c.error) return `The cover could not be made: ${c.error}`;
    const dir = path.join(ROOT, 'projects', slug, 'covers');
    const out: Content[] = [{ type: 'text', text: `Cover ready:\n${path.join(dir, 'cover-9x16.jpg')} (Reel / TikTok)\n${path.join(dir, 'cover-3x4.jpg')} (profile grid)\nOn Instagram she picks it when posting: "Edit cover" -> "Add from camera roll". show_in_finder with file "covers" opens the folder.` }];
    for (const [label, u] of [['9:16', c.story], ['3:4 grid', c.grid]] as const) {
      if (!u) continue;
      const img = await smallJpeg(`${ORIGIN}${u}`, 360);
      if (img) out.push({ type: 'text', text: label }, { type: 'image', data: img, mimeType: 'image/jpeg' });
    }
    return out;
  },
);

// ----- render -----
type RenderState = { running: boolean; progress: number; file?: string; url?: string; error?: string; stage?: string; position?: number };
const renderDone = (slug: string, r: RenderState) => {
  const file = path.join(ROOT, 'projects', slug, 'out', r.file ?? '');
  return `The video is ready: ${file}\nIt is 1080x1920, right for Reels and TikTok. NOW call check_video and look at it before you tell her it is done. Then call show_in_finder; she can AirDrop it to her phone and post it herself.`;
};
const waitRender = async (slug: string, extra: Extra, maxMs: number) => {
  const t0 = Date.now();
  for (;;) {
    const r = await api<RenderState>('GET', `/api/projects/${enc(slug)}/render`);
    if (!r.running) return r;
    if (Date.now() - t0 > maxMs) return r;
    await progress(extra, r.progress ?? 0, r.position ? `Waiting (number ${r.position} in line)` : `Making the video ${Math.round((r.progress ?? 0) * 100)}%`);
    await sleep(3000);
  }
};
tool(
  'make_video',
  'Make the finished MP4 of a reel (check_reel must be OK first). variant "tiktok" uses the TikTok hook and caption. Takes a few minutes; this waits up to 10 minutes and reports progress. If it stops waiting or the call times out, the video keeps being made: call video_status.',
  { slug: slugArg, variant: z.enum(['instagram', 'tiktok']).optional() },
  WRITE,
  async ({ slug, variant }, extra) => {
    const ps = await problems(slug);
    if (ps.length) return `Not started. Fix these first:\n${problemText(ps)}`;
    const before = await api<RenderState>('GET', `/api/projects/${enc(slug)}/render`);
    if (!before.running) await api('POST', `/api/projects/${enc(slug)}/render`, { ...(variant && variant !== 'instagram' ? { variant } : {}), check: false });
    await sleep(1500);
    const r = await waitRender(slug, extra, 10 * 60 * 1000);
    if (r.running) return `Still making the video (${Math.round(r.progress * 100)}%). Call video_status in a minute.`;
    if (r.error) return `The video could not be made: ${r.error}. Fix the cause (often a missing picture or music) and try again.`;
    if (!r.file) return 'The video did not start. Try again.';
    return renderDone(slug, r);
  },
);
tool('video_status', 'How far the video of a reel is (after make_video), and where the file is when ready.', { slug: slugArg }, READ, async ({ slug }) => {
  const r = await api<RenderState>('GET', `/api/projects/${enc(slug)}/render`);
  if (r.running) return r.position ? `Waiting for another video first (number ${r.position} in line).` : `Making the video: ${Math.round(r.progress * 100)}%.`;
  if (r.error) return `The last try failed: ${r.error}`;
  if (r.file) return renderDone(slug, r);
  const p = await getProject(slug);
  return p.renders.length ? `No video is being made. Finished videos: ${p.renders.map((x) => path.join(ROOT, 'projects', slug, 'out', x.file)).join(', ')}` : 'No video made yet.';
});
tool(
  'check_video',
  'Check her newest finished video before she posts it: returns a contact sheet (12 frames, 4 per row, with their times) and automatic findings (text over her face, hidden subtitles, effects that did not fit, dark or washed-out parts, loudness). LOOK at the picture like a fashion editor and tell her in plain words: good to post, or at most 5 problems with the time and the fix you suggest. Do not change the reel before she says yes.',
  { slug: slugArg },
  READ,
  async ({ slug }, extra) => {
    const p = await getProject(slug);
    const latest = p.renders.filter((r) => !/ TikTok( \(\d+\))?\.mp4$/i.test(r.file)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    if (!latest) return 'There is no finished video yet. Call make_video first.';
    await progress(extra, 0.2, 'Looking at the video');
    const r = await checkVideo(path.join(ROOT, 'projects', slug, 'out', latest.file), reelProps(p), path.join(ROOT, 'projects', slug, 'out', 'check'));
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const text = `Video: ${latest.file}\nSheet frames at: ${r.times.map(mm).join(', ')}\nLoudness: ${r.loudness.lufs ?? '?'} LUFS\nAutomatic findings:\n${r.findings.length ? r.findings.map((f) => `- ${f}`).join('\n') : '- none'}`;
    const img = fs.readFileSync(r.sheet).toString('base64');
    return [{ type: 'text', text }, { type: 'image', data: img, mimeType: 'image/jpeg' }];
  },
);
tool(
  'show_in_finder',
  'Show a finished video (or the covers) in Finder on her Mac. file = a video file name from get_reel, "covers" for the cover folder, or empty for the newest video.',
  { slug: slugArg, file: z.string().optional() },
  WRITE,
  async ({ slug, file }) => {
    const p = await getProject(slug);
    const name = file || p.renders[0]?.file;
    if (!name) return 'There is no finished video yet. Call make_video first.';
    try {
      await api('POST', `/api/projects/${enc(slug)}/reveal`, { file: name });
      return 'Shown in Finder.';
    } catch (e) {
      if ((e as ApiError).status !== 404 || (e as ApiError).body?.error === 'No such project') throw e;
    }
    // Older app without /reveal: do it here.
    if (!/^[^/\\]+$/.test(name) || name.startsWith('.')) throw new UserError('Bad file name.');
    const abs = name === 'covers' ? path.join(ROOT, 'projects', slug, 'covers') : path.join(ROOT, 'projects', slug, 'out', name);
    if (!fs.existsSync(abs)) throw new UserError(`There is no file "${name}". get_reel lists the finished videos.`);
    if (IS_MAC && (await run('open', ['-R', abs])).code === 0) return 'Shown in Finder.';
    return `The file is here: ${abs}`;
  },
);

// ----- checks, lists -----
tool('check_reel', 'Check a reel for problems (missing pictures or music, broken effects, effects on cut words, bad cover). Call after every change and fix every problem.', { slug: slugArg }, READ, async ({ slug }) => problemText(await problems(slug)));
tool('list_board', 'Her own pictures on the board (for picture, phone and end card effects).', {}, READ, async () => {
  const b = await listFiles('board');
  return b.length ? `Board pictures (${b.length}):\n${b.join('\n')}` : 'The board is empty. She can drag her pictures onto the board on the editor page.';
});
tool('list_music', 'Her music files (for sound.music in update_reel).', {}, READ, async () => {
  const m = await listFiles('music');
  return m.length ? `Music (${m.length}):\n${m.join('\n')}\nSound effects: ${SFX_NAMES.join(', ')}` : `No music yet. She can add music she has the rights to on the editor page.\nSound effects: ${SFX_NAMES.join(', ')}`;
});

// ----- preferences -----
tool('get_preferences', 'Her lasting wishes for ALL reels (brand.md). Read at the start of every conversation and follow them.', {}, READ, async () => {
  try {
    return fs.readFileSync(BRAND, 'utf8');
  } catch {
    return 'No saved preferences yet.';
  }
});
tool(
  'remember_preference',
  'Save one lasting wish that should hold for ALL future reels ("never red text", "always my logo at the end"). One short line, max 200 characters. A wish for one reel only does NOT go here. Then tell her "Zapamiętam to."',
  { text: z.string().min(2).max(200) },
  WRITE,
  async ({ text }) => {
    const line = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-*]\s*/, '');
    if (!line) throw new UserError('Nothing to remember.');
    let cur = '';
    try {
      cur = fs.readFileSync(BRAND, 'utf8');
    } catch {
      cur = "# Paulina's lasting preferences\n";
    }
    if (cur.split('\n').some((l) => l.replace(/^- /, '').trim().toLowerCase() === line.toLowerCase())) return 'Already remembered.';
    fs.appendFileSync(BRAND, `${cur.endsWith('\n') || !cur ? '' : '\n'}- ${line}\n`);
    return `Remembered: "${line}"`;
  },
);

// ----- see the result -----
tool(
  'show_reel_frame',
  'Show a picture of the reel as it looks NOW (current edit) at a moment of the finished video, so you can check your work with your own eyes: hook, subtitles, effects, her face. outputSeconds = time in the finished video (get_words shows it as "video"). The first picture takes up to ~30 s, later ones ~2 s.',
  { slug: slugArg, outputSeconds: z.number().min(0) },
  READ,
  async ({ slug, outputSeconds }, extra) => {
    const p = await getProject(slug);
    const e = needEdit(p);
    const frames = totalFrames(e);
    const frame = Math.max(0, Math.min(frames - 1, Math.round(outputSeconds * FPS)));
    const t = frame / FPS;
    const desc = describeFrame(e, p.words, t);
    const head = `Reel ${slug} at ${t.toFixed(2)} s of ${(frames / FPS).toFixed(1)} s (source ${outputToSource(Math.min(t, outputDuration(e.segments)), e.segments).toFixed(2)} s).`;
    await progress(extra, 0.1, 'Drawing the frame');
    const LIMIT = 25000;
    const still = renderFrame(p, frame);
    const timed = await Promise.race([still.then((d) => ({ d })), sleep(LIMIT).then(() => null)]).catch((err: Error) => ({ err }));
    if (timed && 'd' in timed) return [{ type: 'text', text: `${head}\n${desc}` }, { type: 'image', data: timed.d, mimeType: 'image/jpeg' }];
    still.catch(() => {});
    // Fallback: the plain video frame (no effects drawn) plus the description.
    const why = timed && 'err' in timed ? `the video engine failed (${timed.err.message})` : 'the video engine is still starting (try again in a few seconds for the full picture)';
    const src = t < outputDuration(e.segments) ? outputToSource(t, e.segments) : e.source.duration - 0.1;
    const img = await smallJpeg(`${ORIGIN}/media/${enc(slug)}/proxy.mp4`, 540, src);
    const text = `${head}\nPlain video frame only, because ${why}. On screen at this moment:\n${desc || '(no text or effects)'}`;
    return img ? [{ type: 'text', text }, { type: 'image', data: img, mimeType: 'image/jpeg' }] : `${text}\n(No picture: ffmpeg is missing.)`;
  },
);

// ----- Instagram know-how (the ig-* skills from Jake Schincariol's instagram-agent-skill, MIT) -----
// Claude Desktop does not load skill folders, so these tools hand over the same guides and scripts.
const IG_SKILLS = {
  'ig-reel': 'reel idea to 3 hooks, spoken script, on-screen text and a timed beat sheet',
  'ig-viral': 'find what works in her niche now, ranked by how far each reel beat its own account',
  'ig-caption': 'the caption, checked: what the feed shows before "more", length, hashtags, search terms',
  'ig-carousel': 'swipe posts: cover, slide copy, 1080x1350 slides',
  'ig-story': 'the daily story sequence and stickers',
  'ig-profile': 'score her profile out of 100 and rewrite what lost points',
  'ig-plan': 'the week plan: what to post, which format, when, accounts to engage with',
  'ig-human': 'remove AI tells (em dashes, stock phrases, invisible characters) from a draft',
  'ig-comment': 'comments she writes on other people\'s posts',
  'ig-reply': 'replies under her own post, sorted (keyword, lead, question...)',
  'ig-dm': 'DMs: the keyword delivery (ebook link), first message, collab pitch, follow-ups',
  'ig-repurpose': 'one long video into a week of reels and carousels',
  'ig-audit': 'post-mortem on what she already posted',
} as const;
const IG_DIR = path.join(ROOT, 'instagram');
const IG_NOTES = ['voice', 'swipe', 'plan', 'log'] as const;
const IG_SCRIPTS = {
  hooks: ['ig-reel/hookscore.py', 'text = one hook per line. Ranks them. On Polish, trust the dealbreaker notes more than the number.'],
  beats: ['ig-reel/beats.py', 'text = the spoken script, one beat per line. Times each beat; flags a slow hook, long beats, no loop.'],
  caption: ['ig-caption/caption.py', 'text = the caption. Shows what the feed shows before "more", length, hashtags, search terms.'],
  humanize: ['ig-human/humanize.py', 'text = a draft. Returns it cleaned (em dashes, curly quotes, invisible characters) plus a report.'],
  detect: ['ig-human/detect.py', 'text = a draft. Scores AI tells. English only: on Polish, read the notes, ignore the HUMAN SCORE.'],
} as const;
const igGuides = Object.entries(IG_SKILLS).map(([k, v]) => `${k}: ${v}`).join('\n');

const runPython = (script: string, args: string[], input: string) =>
  new Promise<string>((resolve, reject) => {
    const venv = path.join(ROOT, '.venv', 'bin', 'python');
    const py = fs.existsSync(venv) ? venv : 'python3';
    const p = spawn(py, [path.join(ROOT, '.claude', 'skills', script), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill(), 30000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => (clearTimeout(timer), reject(e)));
    p.on('close', (code) => {
      clearTimeout(timer);
      // humanize --report writes the report to stderr and the clean text to stdout; the others exit 1 on warnings.
      const all = [out.trim(), err.trim()].filter(Boolean).join('\n\n');
      if (!all && code !== 0) reject(new Error(`the check stopped (code ${code})`));
      else resolve(all);
    });
    p.stdin.end(input);
  });

tool(
  'instagram_guide',
  `Instagram know-how for BEFORE she films and AFTER she posts. Returns the full guide for one job; read it and follow it. These only write text: she posts, comments and sends DMs herself. Write in Polish unless she asks otherwise, in her voice (instagram_notes voice + get_preferences). Jobs:\n${igGuides}`,
  { skill: z.enum(Object.keys(IG_SKILLS) as [keyof typeof IG_SKILLS, ...(keyof typeof IG_SKILLS)[]]) },
  READ,
  async ({ skill }) => {
    const text = fs.readFileSync(path.join(ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    return `${text}\n\n---\nIN THIS CHAT: where the guide says to run a .py script, call instagram_check instead. Where it says to read or write a file in instagram/ (voice.md, swipe.md, plan.md, log.md), use instagram_notes and save_instagram_note.`;
  },
);

tool(
  'instagram_check',
  `Run one of the Instagram checks on a text and get the result. Checks:\n${Object.entries(IG_SCRIPTS).map(([k, [, d]]) => `${k}: ${d}`).join('\n')}`,
  {
    check: z.enum(Object.keys(IG_SCRIPTS) as [keyof typeof IG_SCRIPTS, ...(keyof typeof IG_SCRIPTS)[]]),
    text: z.string().min(1).max(20000),
    keywords: z.string().optional().describe('caption only: comma-separated search phrases, e.g. "botki na jesień"'),
    targetSeconds: z.number().min(5).max(180).optional().describe('beats only: the length she wants'),
  },
  READ,
  async ({ check, text, keywords, targetSeconds }) => {
    const [script] = IG_SCRIPTS[check];
    const args = ['-'];
    if (check === 'caption' && keywords) args.push('--keywords', keywords);
    if (check === 'beats' && targetSeconds) args.push('--target', String(targetSeconds));
    if (check === 'humanize') args.push('--report');
    return (await runPython(script, args, text)) || '(no output)';
  },
);

tool(
  'instagram_notes',
  'Read one of her Instagram notes: voice (how she talks, what she sells; fill it WITH her if it is mostly empty), swipe (what works in her niche, from ig-viral), plan (this week, from ig-plan), log (what she posted).',
  { name: z.enum(IG_NOTES) },
  READ,
  async ({ name }) => {
    try {
      return fs.readFileSync(path.join(IG_DIR, `${name}.md`), 'utf8');
    } catch {
      return `No ${name} note yet.`;
    }
  },
);

tool(
  'save_instagram_note',
  'Save one of her Instagram notes (voice, swipe, plan, log). mode "replace" writes the whole note (read it first and keep what is still true); "append" adds to the end (use for log). Never put passwords or private data of other people in it.',
  { name: z.enum(IG_NOTES), text: z.string().min(1).max(50000), mode: z.enum(['replace', 'append']) },
  WRITE,
  async ({ name, text, mode }) => {
    fs.mkdirSync(IG_DIR, { recursive: true });
    const file = path.join(IG_DIR, `${name}.md`);
    if (mode === 'append') fs.appendFileSync(file, (text.startsWith('\n') ? '' : '\n') + text.replace(/\s*$/, '\n'));
    else {
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, text.replace(/\s*$/, '\n'));
      fs.renameSync(tmp, file);
    }
    return `Saved the ${name} note.`;
  },
);

// The same ready requests as the buttons on the page, as a menu in Claude Desktop ("+" > Reel Studio).
for (const p of IG_PROMPTS) {
  const register = server.registerPrompt.bind(server) as unknown as (n: string, c: unknown, cb: (a: { topic?: string }) => unknown) => void;
  register(
    `ig-${p.id}`,
    {
      title: `${p.label.en} (${p.label.pl})`,
      description: p.text.en.replace(/[: ]+$/, ''),
      ...(p.topic ? { argsSchema: { topic: z.string().optional().describe('Your topic or text (optional)') } } : {}),
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: `${p.text.en}${p.topic ? (topic?.trim() || '(ask me)') : ''}\n\n(Use instagram_guide with skill "${p.skill}" and follow it.)` },
        },
      ],
    }),
  );
}

const transport = new StdioServerTransport(process.stdin, mcpOut);
await server.connect(transport);
console.error('Reel Studio connector ready');
