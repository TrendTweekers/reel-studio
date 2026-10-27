// Auto light fix: measure her video once and turn it into a gentle colour correction (CSS filters on
// the footage, see lightFilter in src/remotion/parts/Vibe.tsx). Phone videos in a bright room often come
// out flat and grey (whites that are not white, faded colour); this sets the white and black points,
// brings colour back and adds a hint of warmth. Every value is capped so it never looks "filtered".
import { spawn } from 'node:child_process';
import type { LightFix } from '../src/shared/types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// Raw signal stats (8-bit, limited range: black 16, white 235) from 2 frames per second.
export const measureStats = (video: string) =>
  new Promise<{ y: number; low: number; high: number; u: number; v: number; sat: number; frames: number }>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', video, '-vf', 'fps=2,scale=270:-2,signalstats,metadata=print:file=-', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const keys: Record<string, number[]> = { YAVG: [], YLOW: [], YHIGH: [], UAVG: [], VAVG: [], SATAVG: [] };
    let buf = '';
    let err = '';
    p.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) {
        const m = l.match(/lavfi\.signalstats\.(YAVG|YLOW|YHIGH|UAVG|VAVG|SATAVG)=([\d.]+)/);
        if (m) keys[m[1]].push(Number(m[2]));
      }
    });
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0 || !keys.YAVG.length) return reject(new Error(`light measure failed: ${err.slice(-300)}`));
      resolve({ y: median(keys.YAVG), low: median(keys.YLOW), high: median(keys.YHIGH), u: median(keys.UAVG), v: median(keys.VAVG), sat: median(keys.SATAVG), frames: keys.YAVG.length });
    });
  });

// Stats -> correction at strength 1. A "levels" fix: the darkest 10% go to near-black and the brightest
// 10% to near-white (phone video in window light often tops out grey), done with CSS brightness b and
// contrast c: out = (x*b - 0.5)*c + 0.5, so slope = b*c and the black point fixes c.
export const fixFromStats = (s: { y: number; low: number; high: number; u: number; v: number; sat: number }): LightFix => {
  const L = clamp((s.low - 16) / 219, 0, 0.5);
  const H = clamp((s.high - 16) / 219, L + 0.2, 1);
  const TL = 0.04;
  const TH = 0.94;
  const slope = clamp((TH - TL) / (H - L), 0.95, 1.3);
  const contrast = clamp(1 - 2 * (TL - L * slope), 0.95, 1.25);
  const brightness = clamp(slope / contrast, 0.92, 1.3);
  // Washed-out colour gets more saturation (normal phone video is ~20-30).
  const saturate = clamp(1 + ((22 - s.sat) / 22) * 0.6, 0.97, 1.35);
  // Cold cast (blue-difference above red-difference) gets warmed; always a hint of warmth for her brand.
  const cast = s.u - 128 - (s.v - 128);
  const warmth = clamp(0.02 + (cast / 12) * 0.05, 0, 0.12);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { brightness: r(brightness), contrast: r(contrast), saturate: r(saturate), warmth: r(warmth) };
};

export const measureLight = async (video: string) => fixFromStats(await measureStats(video));
