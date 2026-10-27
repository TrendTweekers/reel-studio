// "My look" page (style builder): small stills of her own reel with one option applied, and the
// save that turns her choices into her own style + lines in brand.md.
// Mounted from server/index.ts with mountLooks(app, {...}); the Host/Origin checks there run first.
import type express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Edit, Effect, ReelProps } from '../src/shared/types';
import { FPS, HOOK_FONTS, SUBTITLE_FONTS } from '../src/shared/types';
import { outputDuration, outputWords, sourceToOutput, totalFrames } from '../src/shared/time';
import type { EditingStyle } from '../src/shared/styles';

type Deps = {
  root: string;
  projects: string;
  stylesDir: string;
  settingsFile: string;
  getBundle: () => Promise<string>;
  reelProps: (slug: string) => ReelProps;
  allStyles: () => EditingStyle[];
};

export const LOOK_STYLE_ID = 'own-my-look';
const SCALE = 0.4;
const MAX_PARALLEL = 2;
const IDLE_MS = 3 * 60 * 1000;
const KEEP_STILLS = 300;

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
const isColor = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);

// ---- what the page may change in a still ----
const VIBES = ['clean', 'film', 'glow', 'editorial'] as const;
const SUB_STYLES = ['clean', 'box', 'karaoke', 'pop', 'off'] as const;
const SUB_POS = ['lower', 'middle', 'above-head'] as const;
type StylePatch = Partial<Edit['style']>;
type LookPatch = { style?: StylePatch; hook?: Edit['hook']; toggles?: Partial<Edit['toggles']> };

const cleanStyle = (s: unknown): StylePatch => {
  const o = (s ?? {}) as Record<string, unknown>;
  const out: StylePatch = {};
  const hf = oneOf(o.hookFont, HOOK_FONTS);
  if (hf) out.hookFont = hf;
  const sf = oneOf(o.subtitleFont, SUBTITLE_FONTS);
  if (sf) out.subtitleFont = sf;
  if (isColor(o.hookColor)) out.hookColor = o.hookColor as string;
  if (isColor(o.accentColor)) out.accentColor = o.accentColor as string;
  const v = oneOf(o.vibe, VIBES);
  if (v) out.vibe = v;
  const ss = oneOf(o.subtitleStyle, SUB_STYLES);
  if (ss) out.subtitleStyle = ss;
  const sp = oneOf(o.subtitlePosition, SUB_POS);
  if (sp) out.subtitlePosition = sp;
  return out;
};
const cleanToggles = (t: unknown): Partial<Edit['toggles']> => {
  const o = (t ?? {}) as Record<string, unknown>;
  const out: Partial<Edit['toggles']> = {};
  for (const k of ['zoomJumps', 'progressBar', 'grain', 'glowAboveHead'] as const) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  return out;
};
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : undefined);
const cleanHook = (h: unknown): Edit['hook'] | undefined => {
  if (h === null) return null;
  if (!h || typeof h !== 'object') return undefined;
  const o = h as Record<string, unknown>;
  const text = str(o.text);
  if (!text) return undefined;
  return { text, accent: str(o.accent), sub: str(o.sub), until: Math.max(1, Math.min(8, Number(o.until) || 3)) };
};
const cleanEffect = (e: unknown): Effect | null => {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !/^[a-z]{2,20}$/.test(o.kind)) return null;
  const at = Number(o.at);
  if (!Number.isFinite(at) || at < 0) return null;
  return {
    id: 'look',
    kind: o.kind as Effect['kind'],
    at,
    duration: Math.max(0.2, Math.min(6, Number(o.duration) || 2.5)),
    word: str(o.word, 60),
    text: str(o.text),
    items: Array.isArray(o.items) ? o.items.slice(0, 8).map((x) => str(x) ?? '').filter(Boolean) : undefined,
    image: typeof o.image === 'string' && /^[^/\\]+$/.test(o.image) && !o.image.startsWith('.') ? o.image : undefined,
    position: str(o.position, 20) as Effect['position'],
    sfx: 'none',
    scale: o.scale === undefined ? undefined : Math.max(1, Math.min(2, Number(o.scale) || 1.25)),
  };
};

// ---- the moment a card shows ----
type Moment = 'hook' | 'caption' | 'effect' | 'mid';
const pickFrame = (props: ReelProps, moment: Moment, effect: Effect | null, t?: number) => {
  const e = props.edit;
  const last = Math.max(0, totalFrames(e) - 1);
  const kept = outputDuration(e.segments);
  const clamp = (sec: number) => Math.max(0, Math.min(last, Math.round(sec * FPS)));
  if (typeof t === 'number' && Number.isFinite(t)) return clamp(t);
  if (effect) {
    const start = sourceToOutput(effect.at, e.segments) ?? kept / 2;
    const frames = effect.kind === 'flash' ? 6 : Math.round(effect.duration * FPS);
    const k = effect.kind === 'flash' ? 0.6 : effect.kind === 'zoomthrough' ? 0.25 : effect.kind === 'zoom' ? 0.5 : 0.6;
    return Math.max(0, Math.min(last, Math.round(start * FPS + frames * k)));
  }
  if (moment === 'hook' && e.hook) return clamp(Math.min(e.hook.until - 0.25, Math.max(1.1, e.hook.until * 0.6)));
  if (moment === 'caption' || moment === 'hook') {
    // A word in the middle of a sentence, after the hook: neighbours close on both sides.
    const after = e.hook ? e.hook.until + 0.6 : 0.8;
    const ow = outputWords(props.words, e.segments, e.wordFixes);
    const good = ow.filter((w, i) => i > 1 && i < ow.length - 2 && w.start > after && w.start - ow[i - 1].end < 0.25 && ow[i + 1].start - w.end < 0.25);
    const pool = good.length ? good : ow.filter((w) => w.start > after);
    const w = pool[Math.floor(pool.length * 0.3)];
    if (w) return clamp(w.start + Math.min(0.12, (w.end - w.start) * 0.5));
  }
  return clamp(kept * 0.4);
};

// ---- the video engine: shared bundle (from index.ts), one hidden browser, closed when idle ----
type Renderer = typeof import('@remotion/renderer');
type Browser = Awaited<ReturnType<Renderer['openBrowser']>>;
let browserP: Promise<Browser> | null = null;
let idle: NodeJS.Timeout | null = null;
const browser = async () => {
  if (idle) clearTimeout(idle);
  if (!browserP) {
    const R = await import('@remotion/renderer');
    browserP = R.openBrowser('chrome', { logLevel: 'error' }).catch((e) => {
      browserP = null;
      throw e;
    });
  }
  return browserP;
};
const releaseLater = () => {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    if (running > 0) return releaseLater();
    const p = browserP;
    browserP = null;
    void p?.then((b) => b.close({ silent: true })).catch(() => {});
  }, IDLE_MS);
  idle.unref();
};

// At most MAX_PARALLEL stills at a time; the same picture asked twice renders once.
let running = 0;
const waiting: (() => void)[] = [];
const slot = async () => {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
};
const free = () => {
  running--;
  waiting.shift()?.();
};
const inflight = new Map<string, Promise<void>>();

// Code version: the newest file under src/remotion and src/shared (a new effect changes the picture).
let codeKeyCache = { at: 0, key: 0 };
const newestUnder = (d: string): number => {
  let max = 0;
  try {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      max = Math.max(max, e.isDirectory() ? newestUnder(p) : fs.statSync(p).mtimeMs);
    }
  } catch {
    /* missing folder */
  }
  return max;
};

const prune = (d: string) => {
  try {
    const files = fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.jpg') && !f.startsWith('.'))
      .map((f) => ({ f, t: fs.statSync(path.join(d, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(KEEP_STILLS)) fs.rmSync(path.join(d, f), { force: true });
  } catch {
    /* ignore */
  }
};

// ---- brand.md lines ----
const MARK = '- My look:';
const oneLine = (s: string, max = 600) => s.replace(/\s+/g, ' ').trim().slice(0, max);

export function mountLooks(app: express.Express, d: Deps) {
  const codeKey = () => {
    if (Date.now() - codeKeyCache.at > 2000) codeKeyCache = { at: Date.now(), key: Math.max(newestUnder(path.join(d.root, 'src', 'remotion')), newestUnder(path.join(d.root, 'src', 'shared'))) };
    return codeKeyCache.key;
  };
  const settings = () => readJson<Record<string, unknown>>(d.settingsFile, {});
  const brandFile = path.join(d.root, 'brand.md');

  // One still of her reel with `patch` (style/hook/toggles) and optionally one effect: {patch, effect?, t?, moment?}
  app.post('/api/projects/:slug/look-still', async (req, res) => {
    const slug = req.params.slug;
    const pdir = path.join(d.projects, slug);
    if (!safeSlug(slug) || !fs.existsSync(path.join(pdir, 'edit.json')) || !fs.existsSync(path.join(pdir, 'proxy.mp4'))) {
      res.status(404).json({ error: 'No such reel' });
      return;
    }
    const base = d.reelProps(slug);
    if (!base.edit) {
      res.status(409).json({ code: 'busy', error: 'Still preparing this reel' });
      return;
    }
    const body = (req.body ?? {}) as { patch?: LookPatch; effect?: unknown; t?: unknown; moment?: unknown };
    const patch = body.patch ?? {};
    const effect = body.effect ? cleanEffect(body.effect) : null;
    if (body.effect && !effect) {
      res.status(400).json({ error: 'Not a valid effect' });
      return;
    }
    const hook = cleanHook(patch.hook);
    // Only this card's change shows: her other effects and the end card stay out of the picture.
    const edit: Edit = {
      ...base.edit,
      style: { ...base.edit.style, ...cleanStyle(patch.style) },
      toggles: { ...base.edit.toggles, ...cleanToggles(patch.toggles) },
      hook: hook === undefined ? base.edit.hook : hook,
      effects: effect ? [effect] : [],
      endCard: undefined,
      sound: { ...base.edit.sound, music: null },
    };
    const inputProps: ReelProps = { ...base, edit };
    const moment = (['hook', 'caption', 'effect', 'mid'] as const).includes(body.moment as Moment) ? (body.moment as Moment) : 'mid';
    const frame = pickFrame(inputProps, moment, effect, typeof body.t === 'number' ? body.t : undefined);
    const hash = crypto.createHash('sha1').update(JSON.stringify([codeKey(), SCALE, frame, inputProps])).digest('hex').slice(0, 20);
    const outDir = path.join(pdir, 'looks');
    const out = path.join(outDir, `${hash}.jpg`);
    const url = `/media/${encodeURIComponent(slug)}/looks/${hash}.jpg`;
    if (fs.existsSync(out)) {
      res.json({ url, cached: true });
      return;
    }
    let job = inflight.get(out);
    if (!job) {
      job = (async () => {
        await slot();
        try {
          const R = await import('@remotion/renderer');
          const [serveUrl, b] = await Promise.all([d.getBundle(), browser()]);
          const composition = await R.selectComposition({ serveUrl, id: 'Reel', inputProps, puppeteerInstance: b, logLevel: 'error' });
          fs.mkdirSync(outDir, { recursive: true });
          const tmp = path.join(outDir, `.${hash}-${Date.now()}.jpg`);
          try {
            await R.renderStill({ composition, serveUrl, inputProps, frame: Math.min(frame, composition.durationInFrames - 1), imageFormat: 'jpeg', jpegQuality: 82, scale: SCALE, output: tmp, puppeteerInstance: b, logLevel: 'error', timeoutInMilliseconds: 60000 });
            fs.renameSync(tmp, out);
          } finally {
            fs.rmSync(tmp, { force: true });
          }
          prune(outDir);
        } finally {
          free();
          releaseLater();
        }
      })().finally(() => inflight.delete(out));
      inflight.set(out, job);
    }
    try {
      await job;
      res.json({ url });
    } catch (e) {
      console.error(`look-still ${slug}:`, (e as Error).message.slice(0, 400));
      res.status(500).json({ code: 'render_failed', error: 'This picture could not be made' });
    }
  });

  // Has she saved a look once? (Home shows "Choose your look" until she has.)
  app.get('/api/look', (_req, res) => {
    const own = readJson<EditingStyle | null>(path.join(d.stylesDir, `${LOOK_STYLE_ID}.json`), null);
    res.json({ lookDone: settings().lookDone === true, styleId: own ? LOOK_STYLE_ID : null });
  });

  // Save her look: {slug, style, toggles, brand: {effects, more, transitions, notes, summary}}
  // -> styles/own-my-look.json ("My look"), lines in brand.md, settings.lookDone.
  // The page then sets it as the default (PUT /api/styles/default) and, if she asks, applies it to
  // the open reel through the normal edit save.
  app.post('/api/look', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const slug = String(b.slug ?? '');
    const edit = safeSlug(slug) ? readJson<Edit | null>(path.join(d.projects, slug, 'edit.json'), null) : null;
    if (!edit) {
      res.status(400).json({ error: 'Need a reel' });
      return;
    }
    const style: Edit['style'] = { ...edit.style, ...cleanStyle(b.style) };
    const toggles: Edit['toggles'] = { ...edit.toggles, ...cleanToggles(b.toggles) };
    const all = d.allStyles();
    const basis = all.find((s) => s.id === edit.styleId && s.id !== LOOK_STYLE_ID) ?? all[0];
    const pace = { ...basis.pace };
    const brand = (b.brand ?? {}) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => oneLine(String(x), 60)).filter(Boolean).slice(0, 30) : []);
    const transitions = list(brand.transitions);
    if (transitions.some((x) => /^none\b/i.test(x))) pace.zoomEvery = 999;
    const look: EditingStyle = {
      id: LOOK_STYLE_ID,
      name: 'My look',
      namePl: 'Mój styl',
      description: 'Made on the My look page.',
      descriptionPl: 'Zrobiony na stronie „Mój styl”.',
      style,
      sound: { effects: edit.sound.effects, defaultSfx: edit.sound.defaultSfx },
      toggles,
      pace,
    };
    fs.mkdirSync(d.stylesDir, { recursive: true });
    writeJson(path.join(d.stylesDir, `${LOOK_STYLE_ID}.json`), look);

    // brand.md: replace the earlier "My look" lines, keep everything else as it was.
    const lines: string[] = [];
    const summary = oneLine(String(brand.summary ?? ''), 300);
    if (summary) lines.push(`${MARK} ${summary}`);
    const effects = list(brand.effects);
    if (effects.length) lines.push(`${MARK} effects I like: ${effects.join(', ')}.`);
    const more = list(brand.more);
    if (more.length) lines.push(`${MARK} more like: ${more.join(', ')}.`);
    if (transitions.length) lines.push(`${MARK} transitions: ${transitions.join(', ')}.`);
    const notes = oneLine(String(brand.notes ?? ''));
    if (notes) lines.push(`${MARK} notes: ${notes}`);
    try {
      const old = fs.existsSync(brandFile) ? fs.readFileSync(brandFile, 'utf8') : '# Paulina\'s lasting preferences\n';
      const kept = old.split('\n').filter((l) => !l.startsWith(MARK));
      while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
      fs.writeFileSync(brandFile, [...kept, ...lines].join('\n') + '\n');
    } catch (e) {
      console.error('brand.md:', (e as Error).message);
    }
    writeJson(d.settingsFile, { ...settings(), lookDone: true });
    res.json({ ok: true, id: LOOK_STYLE_ID, style, toggles, brandLines: lines });
  });
}
