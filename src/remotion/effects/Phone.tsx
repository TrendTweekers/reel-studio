// A phone mock-up (pure CSS, no product artwork) holding a board picture; slides in from the side.
import React, { useState } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import type { TimedEffect } from '../model';
import { useReel } from '../context';
import { BoardImage } from './Picture';
import { CLAMP } from './anim';

export const Phone: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props } = useReel();
  const [failed, setFailed] = useState(false);
  if (!e.rect || !e.image || failed) return null;
  const { x, y, w, h } = e.rect;
  const fromRight = x + w / 2 > 540;
  const inn = spring({ frame, fps: FPS, config: { damping: 15, stiffness: 120, mass: 0.8 } });
  const out = interpolate(frame, [e.frames - 12, e.frames], [0, 1], CLAMP);
  const travel = (fromRight ? 1 : -1) * (w + 240);
  const dx = travel * (1 - inn) + travel * out * out;
  const tilt = (fromRight ? -1 : 1) * 5 + (1 - inn) * (fromRight ? 8 : -8) + Math.sin(frame / 22) * 0.6;
  const bezel = 14;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y + Math.sin(frame / 18) * 5,
          width: w,
          height: h,
          transform: `translateX(${dx}px) rotate(${tilt}deg)`,
          borderRadius: 66,
          background: 'linear-gradient(145deg, #2b2a29, #0d0c0c 55%, #1d1c1b)',
          padding: bezel,
          boxSizing: 'border-box',
          boxShadow:
            '0 40px 80px rgba(0,0,0,0.38), 0 8px 18px rgba(0,0,0,0.25), inset 0 0 0 2px rgba(255,255,255,0.08), inset 0 0 0 5px #050505',
        }}
      >
        {/* side buttons */}
        <div style={{ position: 'absolute', left: -4, top: 170, width: 4, height: 70, borderRadius: 2, background: '#1a1919' }} />
        <div style={{ position: 'absolute', left: -4, top: 260, width: 4, height: 70, borderRadius: 2, background: '#1a1919' }} />
        <div style={{ position: 'absolute', right: -4, top: 210, width: 4, height: 110, borderRadius: 2, background: '#1a1919' }} />
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden', background: '#000' }}>
          <BoardImage src={props.urls.board + e.image} style={{ width: '100%', height: '100%' }} onFail={() => setFailed(true)} />
          {/* glass sheen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%)',
            }}
          />
          {/* island */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: '50%',
              width: 112,
              height: 34,
              marginLeft: -56,
              borderRadius: 17,
              background: '#000',
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
