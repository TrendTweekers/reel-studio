// HUGE type behind the person. Reel.tsx draws: video -> this text -> cutout video.
// The model places it (behind head/shoulders with a cutout; in the free band without one).
// Bold weight + a soft dark halo so cream type still reads on a cream room.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { INK, isDark } from '../color';
import { useReel } from '../context';
import { boldWeight } from '../fonts';
import type { TimedEffect } from '../model';
import { easeIn, outro } from './anim';

export const Behind: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const text = (e.text ?? '').trim();
  if (!text || !e.rect) return null;
  const letters = Array.from(text);
  const size = Math.round(e.rect.h);
  // Her world is bright walls and window light: big type behind her reads best in ink.
  // A dark hook colour is used as is; a light one turns into ink, with a soft cream halo that keeps
  // it legible when the background happens to be dark.
  const hook = props.edit.style.hookColor;
  const color = isDark(hook) ? hook : INK;
  const halo = '0 0 50px rgba(250,245,236,0.45), 0 2px 10px rgba(250,245,236,0.35)';
  const o = outro(frame, e.frames, 10);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: e.rect.x + e.rect.w / 2 - 700,
          width: 1400,
          top: e.rect.y,
          height: size,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          fontFamily: hookFont,
          fontWeight: boldWeight(props.edit.style.hookFont),
          fontSize: size,
          lineHeight: 0.92,
          letterSpacing: '-0.04em',
          color,
          opacity: o,
          transform: `scale(${interpolate(o, [0, 1], [1.03, 1])})`,
          textShadow: halo,
        }}
      >
        {letters.map((ch, i) => {
          const t = easeIn(frame, i * 2, 18);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                whiteSpace: 'pre',
                opacity: t,
                transform: `translateY(${(1 - t) * size * 0.3}px)`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
