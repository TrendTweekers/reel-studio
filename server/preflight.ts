// The "look" before a video is made: cheap checks that catch a broken render before she waits
// minutes for it. Hard problems stop the render; soft ones are shown and the render goes on.
//  (a) every file the edit points to is there, (b) text that cannot fit, measured with the same
//  code the video uses, (c) fonts + 3 real stills from the warm bundle (blank? all the same?),
//  (d) the sound of the source video.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { breakLines, buildModel, SAFE_BOTTOM } from '../src/remotion/model';
import { BOX, BOX_H, fitText, ITALIC_W, SERIF_W } from '../src/remotion/story/kit';
import { FPS, HOOK_FONTS, NEEDS_CUTOUT, SFX_NAMES, STORY_SKIP_KINDS, SUBTITLE_FONTS, type ReelProps } from '../src/shared/types';
import { isStory, timedScenes } from '../src/shared/story';
import { isLong } from '../src/shared/long';
import { sourceToOutput } from '../src/shared/time';

export type PreflightItem = {
  level: 'hard' | 'soft';
  code: string; // the page translates pf_<code> with vars
  text: string; // plain English, for Claude and the MCP tool
  vars?: Record<string, string>;
};
export type Preflight = { ok: boolean; hard: PreflightItem[]; soft: PreflightItem[]; ms: number; stills?: { frame: number; yavg: number; flat: boolean }[] };

export type PreflightCtx = {
  dir: string; // projects/<slug>
  props: ReelProps; // with the variant applied, URLs on this server
  board: string;
  music: string;
  sfx: string;
  serveUrl: () => Promise<string>; // the warm bundle
  stills?: boolean; // false = skip the real render test (tests, speed)
};

const run = (cmd: string, args: string[]) =>
  new Promise<{ out: string; err: string; code: number | null }>((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ out, err: String(e), code: -1 }));
    p.on('close', (code) => resolve({ out, err, code }));
  });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// (a) Files.
const fileChecks = (c: PreflightCtx, add: (i: PreflightItem) => void) => {
  const { edit } = c.props;
  const has = (d: string, f: string) => fs.existsSync(path.join(d, f));
  if (!fs.existsSync(path.join(c.dir, 'proxy.mp4'))) add({ level: 'hard', code: 'proxy_missing', text: 'The prepared video file is missing. Import the video again.' });
  const pic = (f: string | undefined, where: string) => {
    if (f && !has(c.board, f)) add({ level: 'hard', code: 'image_missing', text: `The picture "${f}" (${where}) is not on the board.`, vars: { file: f, where } });
  };
  const story = isStory(edit);
  for (const e of edit.effects ?? []) {
    pic(e.image, e.word ? `${e.kind}, "${e.word}"` : e.kind);
    if (e.sfx && !['none', 'default'].includes(e.sfx) && edit.sound?.effects && (!(SFX_NAMES as readonly string[]).includes(e.sfx) || !has(c.sfx, `${e.sfx}.wav`)))
      add({ level: 'hard', code: 'sfx_missing', text: `The sound "${e.sfx}" is missing.`, vars: { file: e.sfx } });
    if (!story && NEEDS_CUTOUT.includes(e.kind) && !c.props.urls.cutout)
      add({ level: 'hard', code: 'cutout_missing', text: `The "${e.kind}" effect needs the cut-out, and it is not made yet.`, vars: { kind: e.kind } });
  }
  for (const sc of edit.story?.scenes ?? []) pic(sc.image, `scene ${sc.kind}`);
  if (edit.endCard?.enabled) pic(edit.endCard.image, 'end card');
  if (edit.sound?.music && !has(c.music, edit.sound.music)) add({ level: 'hard', code: 'music_missing', text: `The music "${edit.sound.music}" is missing.`, vars: { file: edit.sound.music } });
  const def = edit.sound?.defaultSfx;
  if (edit.sound?.effects && def && (!SFX_NAMES.includes(def) || !has(c.sfx, `${def}.wav`)))
    add({ level: 'hard', code: 'sfx_missing', text: `The sound "${def}" is missing.`, vars: { file: def } });
  if (!HOOK_FONTS.includes(edit.style?.hookFont)) add({ level: 'hard', code: 'font_unknown', text: `The hook font "${edit.style?.hookFont}" is unknown.`, vars: { font: String(edit.style?.hookFont) } });
  if (!SUBTITLE_FONTS.includes(edit.style?.subtitleFont)) add({ level: 'hard', code: 'font_unknown', text: `The subtitle font "${edit.style?.subtitleFont}" is unknown.`, vars: { font: String(edit.style?.subtitleFont) } });
};

// (b) Text that cannot fit, from the model the video is drawn with.
const reelFit = (props: ReelProps, add: (i: PreflightItem) => void) => {
  const m = buildModel(props);
  const h = m.hook;
  if (h) {
    // The model tries 1 line per part, then 2, then gives up at 64 px and lets it run long.
    // 3-4 lines is a long read (soft); 5+ cannot be read in the hook time (hard).
    const parts = [h.lines.length, h.accentLines.length];
    if (Math.max(...parts) > 4 || h.rect.y + h.rect.h > SAFE_BOTTOM)
      add({ level: 'hard', code: 'hook_too_long', text: `The hook is too long to read in time (${h.lines.length + h.accentLines.length} lines). Keep it under about 10 words.`, vars: { lines: String(h.lines.length + h.accentLines.length) } });
    else if (Math.max(...parts) > 2 || h.size < 60)
      add({ level: 'soft', code: 'hook_small', text: `The hook is long (${h.lines.length + h.accentLines.length} lines at ${h.size} px). A shorter hook reads better.`, vars: { size: String(h.size), lines: String(h.lines.length + h.accentLines.length) } });
  }
  for (const e of m.effects) {
    const at = mmss(e.from / FPS);
    if (['label', 'glass', 'chapter', 'behind', 'checklist', 'chart'].includes(e.kind) && e.rect && e.scale < 0.6)
      add({ level: 'soft', code: 'text_scaled', text: `${at}: the ${e.kind} text had to shrink to ${Math.round(e.scale * 100)}%.`, vars: { at, kind: e.kind, pct: String(Math.round(e.scale * 100)) } });
    if (['picture', 'phone', 'label'].includes(e.kind) && !e.rect)
      add({ level: 'soft', code: 'no_room', text: `${at}: the ${e.kind}${e.word ? ` on "${e.word}"` : ''} finds no free place, so it does not show.`, vars: { at, kind: e.kind } });
  }
  const hidden = m.chunks.filter((c) => c.hidden);
  if (hidden.length) add({ level: 'soft', code: 'subs_hidden', text: `${hidden.length} subtitle line(s) are hidden behind effects (first at ${mmss(hidden[0].from / FPS)}).`, vars: { n: String(hidden.length), at: mmss(hidden[0].from / FPS) } });
  return m;
};

// Story scenes: the same fitText calls the scene components make (src/remotion/story/*).
const storyFit = (props: ReelProps, add: (i: PreflightItem) => void) => {
  for (const sc of timedScenes(props.edit)) {
    const at = mmss(sc.from / FPS);
    const items = (sc.items ?? []).map((s) => s.trim()).filter(Boolean);
    const text = (sc.text ?? '').trim();
    const fits: { what: string; t: string; o: Parameters<typeof fitText>[1] }[] = [];
    if (sc.kind === 'title') fits.push({ what: 'title', t: text, o: { maxW: BOX.w, maxLines: 5, max: 196, min: 80, maxH: BOX_H - 280 } });
    if (sc.kind === 'quote') fits.push({ what: 'quote', t: text, o: { maxW: BOX.w - 40, maxLines: 7, max: 112, min: 54, charW: ITALIC_W, lead: 1.12, maxH: BOX_H - 330 } });
    if (sc.kind === 'photo' && text) fits.push({ what: 'caption', t: text, o: { maxW: BOX.w - 60, maxLines: 2, max: 58, min: 38, charW: ITALIC_W } });
    if (sc.kind === 'screen' && text) fits.push({ what: 'caption', t: text, o: { maxW: BOX.w - 60, maxLines: 2, max: 56, min: 36, charW: ITALIC_W } });
    if (sc.kind === 'click' && text) fits.push({ what: 'label', t: text, o: { maxW: 520, maxLines: 2, max: 40, min: 30, charW: ITALIC_W } });
    if ((sc.kind === 'list' || sc.kind === 'compare' || sc.kind === 'logos') && text) fits.push({ what: 'heading', t: text, o: { maxW: BOX.w, maxLines: 2, max: sc.kind === 'list' ? 104 : 96, min: sc.kind === 'list' ? 60 : 56 } });
    for (const f of fits) {
      if (!f.t) continue;
      const r = fitText(f.t, f.o);
      const lead = f.o.lead ?? 1.05;
      const over = r.lines.length > f.o.maxLines || r.lines.some((l) => l.length * r.size * (f.o.charW ?? SERIF_W) > f.o.maxW) || (!!f.o.maxH && r.lines.length * r.size * lead > f.o.maxH);
      if (over) add({ level: 'hard', code: 'scene_text_overflow', text: `${at}: the ${f.what} of the ${sc.kind} scene does not fit ("${short(f.t)}"). Make it shorter.`, vars: { at, kind: sc.kind, text: short(f.t) } });
      else if (r.size <= f.o.min) add({ level: 'soft', code: 'scene_text_small', text: `${at}: the ${f.what} of the ${sc.kind} scene is at its smallest size. Shorter reads better.`, vars: { at, kind: sc.kind } });
    }
    if (sc.kind === 'words') {
      // Words.tsx fitAll: one size for all lines, 168 down to 56.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const at56 = lines.map((l, i) => breakLines(l, 56, i % 2 ? ITALIC_W : SERIF_W, BOX.w));
      const h = at56.reduce((n, r) => n + r.length, 0) * 56 * 1.06 + (lines.length - 1) * 56 * 0.16;
      if (h > BOX_H - 120) add({ level: 'hard', code: 'scene_text_overflow', text: `${at}: the words scene has too much text to fit. Make it shorter.`, vars: { at, kind: sc.kind, text: short(text) } });
    }
    if (sc.kind === 'list' && items.length) {
      // List.tsx: two lines per point at most, each row gets its share of the height; floor 34 px.
      const headH = text ? (() => { const f = fitText(text, { maxW: BOX.w, maxLines: 2, max: 104, min: 60 }); return f.lines.length * f.size * 1.06 + 70; })() : 0;
      const rowRoom = (BOX_H - headH - 40) / items.length;
      const ok = (size: number) => items.every((t) => { const l = breakLines(t, size, SERIF_W, BOX.w - 120); return l.length <= 2 && l.length * size * 1.1 + 56 <= rowRoom; });
      if (!ok(34)) add({ level: items.length > 6 ? 'hard' : 'soft', code: 'list_too_long', text: `${at}: the list has ${items.length} points or they are too long to fit. Use 3 to 5 short points.`, vars: { at, n: String(items.length) } });
    }
    if (sc.kind === 'logos' && items.length > 6) add({ level: 'soft', code: 'logos_limit', text: `${at}: a logos scene shows only 6 names, ${items.length - 6} will not show.`, vars: { at, n: String(items.length - 6) } });
    if (!text && !items.length && !sc.image) add({ level: 'soft', code: 'scene_empty', text: `${at}: the ${sc.kind} scene is empty.`, vars: { at, kind: sc.kind } });
  }
};

// (c) Three real stills at 1/4 size: blank (one flat colour, black or white) or all the same?
const stillTest = async (c: PreflightCtx, add: (i: PreflightItem) => void, out: Preflight) => {
  const { renderStill, selectComposition, openBrowser } = await import('@remotion/renderer');
  const serveUrl = await c.serveUrl();
  const inputProps = c.props as unknown as Record<string, unknown>;
  const id = isLong(c.props.edit) ? 'Long' : 'Reel';
  const browser = await openBrowser('chrome', { chromiumOptions: {} });
  const tmp = fs.mkdtempSync(path.join(c.dir, 'out', '.preflight-'));
  try {
    const comp = await selectComposition({ serveUrl, id, inputProps, puppeteerInstance: browser, logLevel: 'error' });
    const card = c.props.edit.endCard?.enabled ? Math.round(c.props.edit.endCard.seconds * FPS) : 0;
    const last = Math.max(0, comp.durationInFrames - card - 2);
    // The middle frame: inside the first effect or scene that draws something, else the middle.
    let mid = Math.round(last / 2);
    const shown = (c.props.edit.effects ?? []).filter((e) => !(isStory(c.props.edit) && STORY_SKIP_KINDS.includes(e.kind)));
    const fx = shown.find((e) => e.kind !== 'zoom') ?? shown[0];
    const scenes = isStory(c.props.edit) ? timedScenes(c.props.edit) : [];
    if (scenes.length > 1) mid = Math.round(scenes[1].from + scenes[1].frames / 2);
    else if (fx) {
      const o = sourceToOutput(fx.at, c.props.edit.segments);
      if (o !== null) mid = Math.round(o * FPS + Math.min(fx.duration, 2) * FPS * 0.5);
    }
    const frames = [...new Set([0, Math.min(last, Math.max(1, mid)), last])];
    const files: string[] = [];
    for (const frame of frames) {
      const f = path.join(tmp, `${frame}.png`);
      await renderStill({ composition: comp, serveUrl, inputProps, frame, scale: 0.25, imageFormat: 'png', output: f, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 60000 });
      files.push(f);
    }
    out.stills = [];
    for (const [i, f] of files.entries()) {
      const st = await run('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-']);
      const num = (k: string) => Number(st.out.match(new RegExp(`signalstats\\.${k}=([\\d.]+)`))?.[1] ?? NaN);
      // signalstats reports limited range (black 16, white 235): map to 0..255 for the thresholds.
      const full = (v: number) => Math.max(0, Math.min(255, ((v - 16) * 255) / 219));
      const yavg = full(num('YAVG'));
      // Flat = the whole picture is about one brightness (a blank page, not a frame of her).
      const flat = full(num('YHIGH')) - full(num('YLOW')) < 6;
      out.stills.push({ frame: frames[i], yavg: Math.round(yavg), flat });
      if (flat && (yavg < 8 || yavg > 247))
        add({ level: 'hard', code: 'still_blank', text: `A test frame at ${mmss(frames[i] / FPS)} comes out ${yavg < 8 ? 'black' : 'white'}: nothing is drawn.`, vars: { at: mmss(frames[i] / FPS), color: yavg < 8 ? 'black' : 'white' } });
    }
    if (files.length === 3) {
      const psnr = async (a: string, b: string) => {
        const r = await run('ffmpeg', ['-v', 'info', '-nostats', '-i', a, '-i', b, '-filter_complex', 'psnr', '-f', 'null', '-']);
        const v = r.err.match(/average:(inf|[\d.]+)/)?.[1];
        return v === 'inf' ? Infinity : Number(v ?? 0);
      };
      const [p1, p2] = await Promise.all([psnr(files[0], files[1]), psnr(files[1], files[2])]);
      if (p1 > 50 && p2 > 50) add({ level: 'soft', code: 'stills_same', text: 'The beginning, middle and end look exactly the same: the video may show nothing moving.' });
    }
  } finally {
    await browser.close({ silent: true }).catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

// (d) Sound of the source: is there a voice track, and is it not silent?
const soundCheck = async (c: PreflightCtx, add: (i: PreflightItem) => void) => {
  const proxy = path.join(c.dir, 'proxy.mp4');
  if (!fs.existsSync(proxy)) return;
  // With music the reel is never silent, so no sound in the video is only a note.
  const level = c.props.edit.sound?.music ? 'soft' : 'hard';
  const pr = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', proxy]);
  if (!pr.out.trim()) {
    add({ level, code: 'no_audio', text: 'The video has no sound track.' });
    return;
  }
  // The first 2 minutes are enough to know (a long video would take too long).
  const vd = await run('ffmpeg', ['-v', 'info', '-nostats', '-t', '120', '-i', proxy, '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
  const mean = Number(vd.err.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? NaN);
  if (!Number.isNaN(mean) && mean <= -60) add({ level, code: 'silent', text: `The sound of the video is silent (${mean} dB).`, vars: { db: String(mean) } });
};

export const preflight = async (c: PreflightCtx): Promise<Preflight> => {
  const t0 = Date.now();
  const items: PreflightItem[] = [];
  const add = (i: PreflightItem) => {
    if (!items.some((x) => x.code === i.code && x.text === i.text)) items.push(i);
  };
  const out: Preflight = { ok: true, hard: [], soft: [], ms: 0 };
  fileChecks(c, add);
  try {
    if (isStory(c.props.edit)) storyFit(c.props, add);
    else if (!isLong(c.props.edit)) reelFit(c.props, add);
  } catch (e) {
    add({ level: 'hard', code: 'model_failed', text: `The layout could not be measured: ${(e as Error).message}`, vars: { msg: (e as Error).message } });
  }
  // A missing file makes the stills fail with a confusing error: test them only when files are fine.
  const filesOk = !items.some((i) => i.level === 'hard');
  await Promise.all([
    soundCheck(c, add),
    filesOk && c.stills !== false
      ? stillTest(c, add, out).catch((e) =>
          add({ level: 'hard', code: 'still_failed', text: `A test frame could not be drawn: ${String((e as Error).message).split('\n')[0].slice(0, 200)}`, vars: { msg: String((e as Error).message).split('\n')[0].slice(0, 200) } }),
        )
      : Promise.resolve(),
  ]);
  out.hard = items.filter((i) => i.level === 'hard');
  out.soft = items.filter((i) => i.level === 'soft');
  out.ok = out.hard.length === 0;
  out.ms = Date.now() - t0;
  return out;
};

// Plain words for Claude and the MCP tool.
export const preflightText = (p: Preflight) =>
  [
    p.hard.length ? `The video was not started. Fix these first:\n${p.hard.map((i) => `- ${i.text}`).join('\n')}` : '',
    p.soft.length ? `Worth a look (the video can still be made):\n${p.soft.map((i) => `- ${i.text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
