// A cream card whose items tick one by one across the effect. Sound.tsx plays a click per tick
// using the same checklistTicks() timing.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CREAM, INK } from '../color';
import { useReel } from '../context';
import { CHECKLIST_W, type TimedEffect } from '../model';
import { CLAMP, easeIn, outro, popIn } from './anim';

// Local frame of each tick.
export const checklistTicks = (frames: number, n: number) => {
  const start = 14;
  const end = Math.max(start + 1, frames - 16);
  return Array.from({ length: n }, (_, i) => Math.round(start + ((end - start) * (i + 0.35)) / n));
};


export const Checklist: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { hookFont, subFont } = useReel();
  const items = e.items ?? [];
  if (!items.length) return null;
  const ticks = checklistTicks(e.frames, items.length);
  const title = e.text?.trim();
  if (!e.rect) return null;
  const k = e.scale;
  const t = easeIn(frame, 0, 16);
  const o = outro(frame, e.frames, 10);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{ position: 'absolute', left: e.rect.x, top: e.rect.y, width: CHECKLIST_W, transform: `scale(${k})`, transformOrigin: '0 0' }}
      >
      <div
        style={{
          width: CHECKLIST_W,
          boxSizing: 'border-box',
          padding: '44px 56px 50px',
          background: CREAM,
          borderRadius: 30,
          boxShadow: '0 30px 60px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.12)',
          opacity: t * o,
          transform: `translateY(${(1 - t) * 40}px) scale(${interpolate(o, [0, 1], [0.96, 1])}) rotate(${e.rotation * 0.25}deg)`,
          color: INK,
        }}
      >
        {title ? (
          <div style={{ fontFamily: hookFont, fontSize: 56, fontStyle: 'italic', lineHeight: 1.05, marginBottom: 26, letterSpacing: '-0.01em' }}>
            {title}
          </div>
        ) : null}
        {items.map((item, i) => {
          const local = frame - ticks[i];
          const done = local >= 0;
          const pop = popIn(frame, ticks[i]);
          const draw = interpolate(local, [0, 7], [0, 1], CLAMP);
          const rowIn = easeIn(frame, 4 + i * 3, 14);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 26,
                height: 86,
                borderTop: i === 0 ? 'none' : '1px solid rgba(20,18,16,0.12)',
                opacity: rowIn,
                transform: `translateX(${(1 - rowIn) * 20}px)`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  flex: '0 0 44px',
                  borderRadius: 22,
                  border: `2px solid ${INK}`,
                  background: done ? INK : 'transparent',
                  transform: `scale(${done ? interpolate(pop, [0, 1], [0.7, 1]) : 1})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 26 26">
                  <path
                    d="M5 13.5 L10.5 19 L21 7.5"
                    fill="none"
                    stroke={CREAM}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={30}
                    strokeDashoffset={30 * (1 - draw)}
                  />
                </svg>
              </div>
              <div
                style={{
                  fontFamily: subFont,
                  fontSize: 40,
                  fontWeight: 500,
                  opacity: done ? 1 : 0.5,
                  letterSpacing: '-0.005em',
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </AbsoluteFill>
  );
};
