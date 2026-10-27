// Zoom-through transition (~0.6 s). The shot rushes INTO her face (1 -> ~4, accelerating, with
// motion blur, a ghost copy for a radial smear, a cream speed vignette), a soft cream flash hides the
// midpoint, then the next moment lands from ~2.5 back to 1. First and last frames are the normal
// video: scale 1, no blur, no overlay. 2 <Footage> copies (main + ghost), small blurs only.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import type { TimedEffect, Zoom } from '../model';
import { footageFilterFor, Grade } from '../parts/Vibe';
import { CLAMP } from './anim';
import { Footage, useAbsFrame, useFace } from './footage';

const IN_PEAK = 4;
const OUT_START = 2.5;

const zoomStyle = (z: Zoom): React.CSSProperties => ({
  transformOrigin: `${z.ox}px ${z.oy}px`,
  transform: z.s === 1 ? undefined : `scale(${z.s})`,
});

// Her video exactly as the base layer shows it (same jump-cut / punch camera, same grade filter).
const CamFootage: React.FC<{ e: TimedEffect; extraFilter?: string }> = ({ e, extraFilter }) => {
  const { model, props } = useReel();
  const abs = useAbsFrame(e);
  const [outer, inner] = model.camera(Math.min(abs, model.total - 1));
  const filter = [footageFilterFor(props.edit), extraFilter].filter(Boolean).join(' ') || undefined;
  return (
    <AbsoluteFill style={{ ...zoomStyle(outer), filter }}>
      <AbsoluteFill style={zoomStyle(inner)}>
        <Footage e={e} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const ZoomThrough: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const face = useFace(e);
  const end = Math.max(2, e.frames - 1);
  const mid = end / 2;

  // speed: 0 at the ends, 1 at the midpoint. Drives blur, ghost and streaks.
  // In: frames 0..inEnd (1 -> 4, accelerating). Out: inEnd+1..end (2.5 -> 1, decelerating).
  const inEnd = Math.max(1, Math.floor(mid));
  let s = 1;
  let speed = 0;
  if (frame <= inEnd) {
    const u = interpolate(frame, [0, inEnd], [0, 1], CLAMP);
    s = 1 + (IN_PEAK - 1) * Easing.in(Easing.quad)(u);
    speed = Math.pow(u, 1.6);
  } else {
    const v = interpolate(frame, [inEnd + 1, end], [0, 1], CLAMP);
    s = OUT_START + (1 - OUT_START) * Easing.out(Easing.cubic)(v);
    speed = (1 - v) * (1 - v) * 0.85;
  }
  if (frame <= 0 || frame >= end) {
    s = 1;
    speed = 0;
  }

  // Zoom towards the face (centre of the face box, a touch above: between the eyes).
  const ox = Math.max(0, Math.min(WIDTH, face.x + face.w / 2));
  const oy = Math.max(0, Math.min(HEIGHT, face.y + face.h * 0.35));

  // Cream flash, peaks at the midpoint, gone ~3 frames either side.
  const flash = Math.pow(Math.max(0, 1 - Math.abs(frame - (inEnd + 0.5)) / 2.6), 1.5) * 0.9;
  const blur = 9 * speed; // px at full size; the render is usually half size
  const ghost = 0.42 * speed;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transformOrigin: `${ox}px ${oy}px`, transform: s === 1 ? undefined : `scale(${s})` }}>
        <CamFootage e={e} extraFilter={blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined} />
      </AbsoluteFill>
      {/* Ghost: the same frame a little smaller, half transparent: reads as a radial zoom smear. */}
      {ghost > 0.01 ? (
        <AbsoluteFill
          style={{
            transformOrigin: `${ox}px ${oy}px`,
            transform: `scale(${s * (frame <= inEnd ? 0.86 : 1.16)})`,
            opacity: ghost,
          }}
        >
          <CamFootage e={e} extraFilter={`blur(${(blur * 1.6).toFixed(2)}px)`} />
        </AbsoluteFill>
      ) : null}
      <Grade />
      {/* Speed vignette: the edges lift towards cream while it rushes, the middle stays clear. */}
      {speed > 0.02 ? (
        <AbsoluteFill
          style={{
            opacity: speed * 0.7,
            background: `radial-gradient(circle at ${ox}px ${oy}px, rgba(250,244,234,0) 0px, rgba(250,244,234,0) 320px, rgba(250,244,234,0.55) 1100px)`,
          }}
        />
      ) : null}
      {flash > 0.005 ? (
        <AbsoluteFill
          style={{
            opacity: flash,
            background: `radial-gradient(circle at ${ox}px ${oy}px, #FFFCF6 0%, #F7F0E4 55%, #EFE5D4 100%)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
