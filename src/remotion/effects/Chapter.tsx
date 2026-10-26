// "[ text ]" chapter title near the top, with a thin rule drawing out under it.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { easeIn, outro } from './anim';
import { shadowFor } from '../legibility';

export const Chapter: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const raw = (e.text ?? '').trim().replace(/^\[\s*|\s*\]$/g, '');
  if (!raw) return null;
  const t = easeIn(frame, 0, 18);
  const line = easeIn(frame, 6, 24);
  const o = outro(frame, e.frames, 10);
  if (!e.rect) return null;
  const top = e.rect.y;
  const color = props.edit.style.hookColor;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: t * o,
          color,
          fontFamily: hookFont,
          textShadow: shadowFor(props.edit.style.hookColor),
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontStyle: 'italic',
            letterSpacing: '0.03em',
            transform: `translateY(${(1 - t) * 14}px)`,
            filter: t < 0.999 ? `blur(${(1 - t) * 6}px)` : undefined,
          }}
        >
          [ {raw} ]
        </div>
        <div
          style={{
            marginTop: 16,
            height: 1.5,
            width: interpolate(line, [0, 1], [0, 260]),
            background: color,
            opacity: 0.85,
            boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
