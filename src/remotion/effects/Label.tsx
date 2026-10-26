// A small paper tag ("editing") with a punched hole and string, beside her face.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CREAM, INK } from '../color';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { outro, popIn } from './anim';

export const Label: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { subFont } = useReel();
  if (!e.rect || !e.text) return null;
  const { x, y, w, h } = e.rect;
  const p = popIn(frame);
  const o = outro(frame, e.frames, 7);
  const pointLeft = e.side === 'right'; // the tag points at her face
  const tilt = e.rotation * 0.7 + Math.sin(frame / 9) * 0.8 * p;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          opacity: Math.min(1, p * 2) * o,
          transform: `rotate(${tilt}deg) scale(${interpolate(p, [0, 1], [0.4, 1]) * interpolate(o, [0, 1], [0.8, 1])})`,
          transformOrigin: pointLeft ? '0% 50%' : '100% 50%',
          filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.22)) drop-shadow(0 1px 2px rgba(0,0,0,0.18))',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: CREAM,
            clipPath: pointLeft
              ? 'polygon(34px 0, 100% 0, 100% 100%, 34px 100%, 0 50%)'
              : 'polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: pointLeft ? '0 26px 0 56px' : '0 56px 0 26px',
            fontFamily: subFont,
            fontSize: Math.round(38 * e.scale),
            fontWeight: 500,
            letterSpacing: '0.01em',
            color: INK,
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: h / 2 - 7,
              [pointLeft ? 'left' : 'right']: 24,
              width: 14,
              height: 14,
              borderRadius: 7,
              background: 'rgba(20,18,16,0.85)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
            }}
          />
          {e.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
