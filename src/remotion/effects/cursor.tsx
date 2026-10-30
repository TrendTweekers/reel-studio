// Shared parts of the desktop-style reel effects (folder, files, polaroid).
//   <Cursor x y press />        a macOS-style arrow. (x, y) is the TIP. press 0..1 = the small click squeeze.
//   pressAt(local, at)          0..1..0 over 5 frames around a click at frame `at`, for <Cursor press>.
//   placeObject(e, model, w, h) where a w x h object goes: on the side away from her face, or under
//                               her chin, inside the safe area and above the caption band. Scales it
//                               down when the room is small (never past the room: her face stays free).
import React from 'react';
import { interpolate } from 'remotion';
import { WIDTH } from '../../shared/types';
import { INK } from '../color';
import { RIGHT_UI, rightLimit, SAFE, SAFE_BOTTOM, SAFE_RIGHT, type Model, type Rect, type Side, type TimedEffect } from '../model';
import { CLAMP } from './anim';

// The lower captions sit here; the objects stay above them (captions do not know about these effects).
export const OBJECT_BOTTOM = SAFE_BOTTOM - 190;

// Classic arrow shape, tip at (0, 0), in a 22 x 34 box.
const ARROW = 'M1 1 L1 27.5 L7.4 21.6 L11.6 31.4 L15.9 29.6 L11.8 20 L20.4 20 Z';

export const Cursor: React.FC<{ x: number; y: number; press?: number; size?: number; opacity?: number }> = ({
  x,
  y,
  press = 0,
  size = 62,
  opacity = 1,
}) => (
  <svg
    width={size * (22 / 34)}
    height={size}
    viewBox="0 0 22 34"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      opacity,
      overflow: 'visible',
      // Squeeze toward the tip, like the button going down.
      transformOrigin: '0 0',
      transform: `scale(${1 - press * 0.14})`,
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))',
    }}
  >
    <path d={ARROW} fill={INK} stroke="#FFFFFF" strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);

export const pressAt = (local: number, at: number) =>
  interpolate(local, [at - 2, at, at + 3], [0, 1, 0], CLAMP);

export type Spot = { x: number; y: number; w: number; h: number; k: number; where: 'side' | 'below' };

type Room = { r: Rect; where: 'side' | 'below'; side?: Side };

// The free rooms around a keep-out box: one column on each side and the band under it.
const roomsAround = (head: Rect, pad: number, bottom: number): Room[] => {
  const top = SAFE.top + 10;
  const rightX = head.x + head.w + pad;
  const belowY = Math.max(top, head.y + head.h + pad * 0.6);
  return [
    { r: { x: SAFE.side, y: top, w: head.x - pad - SAFE.side, h: bottom - top }, where: 'side', side: 'left' },
    { r: { x: rightX, y: top, w: rightLimit(head.y, head.h) - rightX, h: bottom - top }, where: 'side', side: 'right' },
    { r: { x: SAFE.side, y: belowY, w: WIDTH - 2 * SAFE.side, h: bottom - belowY }, where: 'below' },
    // Above the like / share column the right side is wider: a better spot in a close-up.
    { r: { x: rightX, y: top, w: SAFE_RIGHT - rightX, h: RIGHT_UI.y0 - top }, where: 'side', side: 'right' },
  ];
};

// Union of the bare face box (forehead to chin, no hair) over the effect.
const faceSpan = (model: Model, from: number, to: number): Rect => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let f = from; f <= Math.min(to, model.total - 1); f += 3) {
    const r = model.faceRect(f);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

// The object goes in the room that lets it be biggest; the side away from her face wins a near
// tie (less crowded than under the chin). First around her head with hair, above the caption band.
// In a close-up there is no such room: then around the bare face, down to the safe bottom (the
// captions draw on top of these effects, so they stay readable).
export const placeObject = (e: TimedEffect, model: Model, w: number, h: number, pad = 40): Spot & { head: Rect; bottom: number } => {
  const to = e.from + e.frames;
  const fit = (r: Rect) => (r.w <= 0 || r.h <= 0 ? 0 : Math.min(1, r.w / w, r.h / h));
  const score = (room: Room) => fit(room.r) * (room.where === 'side' && room.side === e.side ? 1.12 : room.where === 'side' ? 0.95 : 1);
  const pick = (head: Rect, bottom: number) => {
    const best = roomsAround(head, pad, bottom).sort((a, b) => score(b) - score(a))[0];
    return { best, head, bottom, k: fit(best.r) };
  };
  let p = pick(model.headSpan(e.from, to), OBJECT_BOTTOM);
  if (p.k < 0.6) {
    const face = faceSpan(model, e.from, to);
    const q = pick({ x: face.x - 16, y: face.y - 16, w: face.w + 32, h: face.h + 32 }, SAFE_BOTTOM);
    if (q.k > p.k) p = q;
  }
  const { best, head, bottom } = p;
  const top = SAFE.top + 10;
  // Never bigger than the room: that would cover her face. A tight room just makes it small.
  const k = Math.max(0.3, Math.min(1, p.k));
  const sw = w * k;
  const sh = h * k;
  // Centred in its room. A side object sits at her head height (where the eye already is),
  // an object under her chin sits a little high in the band so it stays near her.
  const cx = best.r.x + best.r.w / 2;
  const cy =
    best.where === 'side'
      ? Math.min(Math.max(head.y + head.h * 0.6, best.r.y + sh / 2), best.r.y + best.r.h - sh / 2)
      : best.r.y + Math.min(best.r.h, sh * 1.25) / 2;
  const x = Math.min(Math.max(cx - sw / 2, SAFE.side), rightLimit(cy - sh / 2, sh) - sw);
  const y = Math.min(Math.max(cy - sh / 2, top), bottom - sh);
  return { x, y, w: sw, h: sh, k, where: best.where, head, bottom };
};
