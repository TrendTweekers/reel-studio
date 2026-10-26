// One big emoji that pops in and wobbles, beside her head on the open side.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { SAFE, SAFE_BOTTOM, SAFE_RIGHT, clamp, rightLimit, type TimedEffect } from '../model';
import { outro, popIn } from './anim';

const SIZE = 210;

export const Emoji: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model } = useReel();
  const text = (e.text ?? '✨').trim();
  const face = model.headRect(e.from);
  let cx: number;
  let cy: number;
  switch (e.position) {
    case 'center':
      cx = WIDTH / 2;
      cy = HEIGHT / 2;
      break;
    case 'top':
      cx = WIDTH / 2;
      cy = SAFE.top + 160;
      break;
    case 'bottom':
      cx = WIDTH / 2;
      cy = SAFE_BOTTOM - 340;
      break;
    case 'left':
      cx = SAFE.side + SIZE / 2 + 20;
      cy = face.y + face.h / 2;
      break;
    case 'right':
      cx = SAFE_RIGHT - SIZE / 2 - 20;
      cy = face.y + face.h / 2;
      break;
    case 'above-head':
      cx = face.x + face.w / 2;
      cy = face.y - SIZE * 0.65;
      break;
    default:
      cx = e.side === 'right' ? face.x + face.w + SIZE * 0.75 : face.x - SIZE * 0.75;
      cy = face.y + face.h * 0.2;
  }
  cy = clamp(cy, SAFE.top + SIZE / 2, SAFE_BOTTOM - SIZE / 2);
  cx = clamp(cx, SAFE.side + SIZE / 2, rightLimit(cy - SIZE / 2, SIZE) - SIZE / 2);
  const p = popIn(frame);
  const o = outro(frame, e.frames, 7);
  const wobble = Math.sin(frame * 0.38) * 10 * Math.exp(-frame / 40) + Math.sin(frame * 0.12) * 3;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: cx - SIZE / 2,
          top: cy - SIZE / 2,
          width: SIZE,
          height: SIZE,
          fontSize: SIZE * 0.82,
          lineHeight: `${SIZE}px`,
          textAlign: 'center',
          opacity: Math.min(1, p * 2) * o,
          transform: `scale(${interpolate(p, [0, 1], [0.2, 1]) * interpolate(o, [0, 1], [0.5, 1])}) rotate(${wobble + e.rotation}deg)`,
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.25))',
          fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
