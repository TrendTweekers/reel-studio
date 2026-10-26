// Big words in a frosted-glass panel. backdrop-filter blurs the video behind it in Chrome;
// the translucent white background is the fallback when it does not.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { glassMetrics, type TimedEffect } from '../model';
import { easeIn, outro } from './anim';

export const Glass: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const text = (e.text ?? '').trim();
  if (!text) return null;
  const t = easeIn(frame, 0, 16);
  const o = outro(frame, e.frames, 10);
  if (!e.rect) return null;
  const { size, w } = glassMetrics(text);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: e.rect.x,
          top: e.rect.y,
          width: w,
          display: 'flex',
          justifyContent: 'center',
          opacity: t * o,
          transformOrigin: '0 0',
          transform: `scale(${e.scale}) translate(${w / 2}px, ${e.rect.h / e.scale / 2}px) scale(${interpolate(t, [0, 1], [0.88, 1]) * interpolate(o, [0, 1], [1.04, 1])}) translate(${-w / 2}px, ${-e.rect.h / e.scale / 2}px)`,
        }}
      >
        <div
          style={{
            padding: '40px 64px 46px',
            borderRadius: 44,
            background: 'linear-gradient(160deg, rgba(255,255,255,0.30), rgba(255,255,255,0.12))',
            backdropFilter: 'blur(26px) saturate(140%)',
            WebkitBackdropFilter: 'blur(26px) saturate(140%)',
            border: '1.5px solid rgba(255,255,255,0.55)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.6)',
            color: props.edit.style.hookColor,
            fontFamily: hookFont,
            fontStyle: 'italic',
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            whiteSpace: 'pre-line',
            textShadow: '0 2px 18px rgba(0,0,0,0.18)',
            boxSizing: 'border-box',
            width: w,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
