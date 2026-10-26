// A board picture as a polaroid: white border, soft shadow, a tilt from its id.
// Pops in with overshoot, floats gently, pops out.
import React, { useState } from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { outro, popIn } from './anim';

// A missing board file hides the whole sticker (onFail), never a blank card.
export const BoardImage: React.FC<{ src: string; style?: React.CSSProperties; onFail: () => void }> = ({ src, style, onFail }) => (
  <Img src={src} onError={onFail} style={{ objectFit: 'cover', display: 'block', ...style }} />
);

export const Picture: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const [failed, setFailed] = useState(false);
  if (!e.rect || !e.image || failed) return null;
  const { x, y, w, h } = e.rect;
  const p = popIn(frame);
  const o = outro(frame, e.frames, 8);
  const scale = interpolate(p, [0, 1], [0.35, 1]) * interpolate(o, [0, 1], [0.7, 1]);
  const float = Math.sin((frame / 30) * Math.PI * 0.7 + e.rotation) * 7;
  const sway = Math.sin((frame / 30) * Math.PI * 0.5) * 0.9;
  const rot = e.rotation + (1 - p) * (e.rotation > 0 ? 10 : -10) + sway;
  const border = 16;
  const bottom = e.text ? 78 : 58;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y + float,
          width: w,
          height: h,
          opacity: Math.min(1, p * 2) * o,
          transform: `rotate(${rot}deg) scale(${scale})`,
          transformOrigin: '50% 60%',
          background: '#FBF8F3',
          padding: `${border}px ${border}px ${bottom}px`,
          boxSizing: 'border-box',
          borderRadius: 4,
          boxShadow: '0 22px 44px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.16)',
        }}
      >
        <BoardImage src={props.urls.board + e.image} style={{ width: '100%', height: '100%', borderRadius: 2 }} onFail={() => setFailed(true)} />
        {e.text ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 18,
              textAlign: 'center',
              fontFamily: hookFont,
              fontStyle: 'italic',
              fontSize: 36,
              color: '#2a2622',
            }}
          >
            {e.text}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
