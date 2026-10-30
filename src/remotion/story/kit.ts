// Shared bits for the story scenes: the colour world, text fitting, word cues and motion.
// Story layout: content lives in the upper two thirds (BOX), so the subtitles below never touch it.
import { createContext, useContext, type CSSProperties } from 'react';
import { Easing, interpolate, spring } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import type { TimedScene } from '../../shared/story';
import { CREAM, INK, isDark, luminance, withAlpha } from '../color';
import { breakLines, SAFE } from '../model';
import type { OutWord } from '../model';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// The scene area: below the Instagram header, above the caption band.
export const BOX = { x: 96, y: SAFE.top + 90, w: WIDTH - 192, bottom: 1250 } as const;
export const BOX_H = BOX.bottom - BOX.y;
export const BOX_CY = BOX.y + BOX_H / 2;

export type Theme = {
  bg: string;
  text: string;
  soft: string; // secondary text
  faint: string; // hairlines, numbers in the background
  line: string; // the accent line colour, readable on bg
  dark: boolean;
};

const hex = (c: string) => {
  const m = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
// a..b in sRGB, k = 0..1 (falls back to a for colours it cannot parse).
export const mix = (a: string, b: string, k: number) => {
  const p = hex(a);
  const q = hex(b);
  if (!p || !q) return a;
  const c = p.map((v, i) => Math.round(v + (q[i] - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

export const themeFor = (background: 'cream' | 'ink' | 'accent' | undefined, accent: string): Theme => {
  const bg = background === 'ink' ? '#161412' : background === 'accent' ? accent : CREAM;
  const dark = isDark(bg);
  const text = dark ? CREAM : INK;
  // The accent must read as a line on the paper; a pale gold on cream is pushed towards ink.
  let line = background === 'accent' ? text : accent;
  for (let k = 0.2; contrast(line, bg) < 2.2 && k <= 1; k += 0.2) line = mix(accent, text, k);
  return { bg, text, soft: withAlpha(text, 0.62), faint: withAlpha(text, 0.16), line, dark };
};

// ---------- text fitting ----------
// Average glyph width / font size. Generous on purpose: a line that fits here fits on screen.
export const SERIF_W = 0.5;
export const ITALIC_W = 0.46;
export const CAPS_W = 0.72; // small letterspaced capitals

export type Fit = { size: number; lines: string[] };
// Biggest size from max down to min where the text breaks into <= maxLines lines that all fit maxW
// (and maxH when given). Below min it keeps min and lets the lines grow: never overflow sideways.
export const fitText = (text: string, o: { maxW: number; maxLines: number; max: number; min: number; charW?: number; lead?: number; maxH?: number }): Fit => {
  const cw = o.charW ?? SERIF_W;
  const t = text.trim();
  const ok = (size: number, lines: string[]) =>
    lines.length <= o.maxLines &&
    lines.every((l) => l.length * size * cw <= o.maxW) &&
    (!o.maxH || lines.length * size * (o.lead ?? 1.05) <= o.maxH);
  for (let size = o.max; size >= o.min; size -= 2) {
    const lines = breakLines(t, size, cw, o.maxW);
    if (ok(size, lines)) return { size, lines };
  }
  // A single very long word: shrink further until it fits the width.
  let size = o.min;
  let lines = breakLines(t, size, cw, o.maxW);
  while (size > 24 && lines.some((l) => l.length * size * cw > o.maxW)) {
    size -= 2;
    lines = breakLines(t, size, cw, o.maxW);
  }
  return { size, lines };
};

// ---------- word cues ----------
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The local frame (inside the scene) where each text starts being spoken: the first spoken word in
// the scene that matches the text's first word, in order. No match: evenly over the first 70%.
export const cueFrames = (texts: string[], scene: TimedScene, words: OutWord[], lead = 4): number[] => {
  const inScene = words.filter((w) => w.from >= scene.from - 6 && w.from < scene.from + scene.frames);
  const n = texts.length;
  const even = (i: number) => Math.round(8 + (i / Math.max(1, n)) * scene.frames * 0.7);
  let k = 0;
  let last = -1;
  return texts.map((t, i) => {
    const first = t.trim().split(/\s+/).map(norm).find(Boolean) ?? '';
    let hit = -1;
    for (let j = k; first && j < inScene.length; j++) {
      if (norm(inScene[j].text) === first) {
        hit = j;
        break;
      }
    }
    let f: number;
    if (hit >= 0) {
      k = hit + 1;
      f = inScene[hit].from - scene.from - lead;
    } else f = even(i);
    f = Math.max(last + 6, Math.max(0, f)); // keep them in order, a few frames apart
    last = f;
    return f;
  });
};

// Share of the scene's spoken words already said at a local frame (0..1). No words: linear.
export const spokenShare = (frame: number, scene: TimedScene, words: OutWord[]) => {
  const inScene = words.filter((w) => w.from >= scene.from - 6 && w.from < scene.from + scene.frames);
  if (!inScene.length) return interpolate(frame, [6, scene.frames * 0.75], [0, 1], CLAMP);
  const at = scene.from + frame + 3;
  let said = 0;
  for (const w of inScene) if (w.from <= at) said += interpolate(at, [w.from, Math.max(w.from + 1, w.to)], [0.4, 1], CLAMP);
  return Math.min(1, said / inScene.length);
};

// ---------- motion ----------
// Soft, no overshoot, 0..1 starting at `delay`.
export const ease = (frame: number, delay = 0, dur = 18) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 200 }, durationInFrames: dur });
// A line or rule drawing across: 0..1 with an ease-out.
export const draw = (frame: number, delay = 0, dur = 22) =>
  interpolate(frame - delay, [0, dur], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
// The whole-scene breath: 0..1 across the scene, used for slow drift and scale.
export const breath = (frame: number, frames: number) => interpolate(frame, [0, Math.max(1, frames)], [0, 1], CLAMP);

// What every scene component gets from <StoryScenes>.
export type SceneCtx = {
  scene: TimedScene;
  frames: number; // the scene's own length (the exit overlaps the next scene)
  first: boolean; // the first scene is fully set on frame 0 (Instagram's cover)
  theme: Theme;
};
export const SceneContext = createContext<SceneCtx | null>(null);
export const useScene = (): SceneCtx => {
  const c = useContext(SceneContext);
  if (!c) throw new Error('useScene() outside a story scene');
  return c;
};
// A reveal at local frame `cue`: on the first scene, anything due in the first frames is already set.
export const reveal = (frame: number, cue: number, first: boolean, dur = 16) => (first && cue <= 6 ? 1 : ease(frame, cue, dur));

export const serif = (font: string, size: number, italic = false): CSSProperties => ({
  fontFamily: font,
  fontSize: size,
  fontStyle: italic ? 'italic' : 'normal',
  fontWeight: 400,
  lineHeight: 1.04,
  letterSpacing: '-0.015em',
});
export const caps = (font: string, size: number): CSSProperties => ({
  fontFamily: font,
  fontSize: size,
  textTransform: 'uppercase',
  letterSpacing: '0.32em',
  fontWeight: 400,
});

// "120 zł" -> pre '', value 120, post ' zł'. Keeps the decimal comma ("2,5"). null = no number in it.
export const parseAmount = (raw: string) => {
  const m = raw.trim().match(/^(\D*?)(\d[\d\s]*(?:[.,]\d+)?)(.*)$/);
  if (!m) return null;
  const digits = m[2].replace(/\s/g, '');
  const comma = digits.includes(',');
  const value = Number(digits.replace(',', '.'));
  const decimals = (digits.split(/[.,]/)[1] ?? '').length;
  return { pre: m[1], value, decimals, comma, post: m[3] };
};
export const formatAmount = (p: NonNullable<ReturnType<typeof parseAmount>>, v: number) => {
  const s = v.toFixed(p.decimals);
  return p.comma ? s.replace('.', ',') : s;
};

export { CREAM, INK };
