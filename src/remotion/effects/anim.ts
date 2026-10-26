// Shared motion curves. All frame-based, no CSS transitions.
import { Easing, interpolate, spring } from 'remotion';
import { FPS } from '../../shared/types';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Sticker pop: fast, a little overshoot.
export const popIn = (local: number, delay = 0) =>
  spring({ frame: local - delay, fps: FPS, config: { damping: 11, stiffness: 190, mass: 0.6 } });

// Soft, no overshoot.
export const easeIn = (local: number, delay = 0, durationInFrames = 18) =>
  spring({ frame: local - delay, fps: FPS, config: { damping: 200 }, durationInFrames });

// 1 -> 0 over the last `len` frames of an effect.
export const outro = (local: number, frames: number, len = 9) =>
  interpolate(local, [frames - len, frames], [1, 0], { ...CLAMP, easing: Easing.in(Easing.cubic) });

export const lerp = (t: number, a: number, b: number) => a + (b - a) * t;

export { CLAMP };
