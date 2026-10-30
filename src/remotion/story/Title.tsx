// Big serif title, line by line out of a mask, a short accent rule and an italic line under it.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { BOX, BOX_H, breath, draw, fitText, ITALIC_W, reveal, serif, useScene } from './kit';

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const fit = fitText(scene.text ?? '', { maxW: BOX.w, maxLines: 5, max: 196, min: 80, maxH: BOX_H - 280 });
  const sub = (scene.items?.[0] ?? '').trim();
  const subFit = sub ? fitText(sub, { maxW: BOX.w - 80, maxLines: 2, max: 54, min: 36, charW: ITALIC_W }) : null;
  const subAt = 6 + fit.lines.length * 4;
  const rule = first ? 1 : draw(frame, subAt - 2, 24);
  const s = reveal(frame, subAt + 4, first, 20);
  const b = breath(frame, frames);

  return (
    <div
      style={{
        position: 'absolute',
        left: BOX.x,
        top: BOX.y,
        width: BOX.w,
        height: BOX_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.text,
        textAlign: 'center',
        transform: `scale(${1 + b * 0.035}) translateY(${-b * 14}px)`,
      }}
    >
      {fit.lines.map((l, i) => {
        const r = reveal(frame, 4 + i * 4, first, 22);
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: fit.size * 0.08 }}>
            <div style={{ ...serif(hookFont, fit.size, i % 2 === 1 && fit.lines.length > 1), whiteSpace: 'nowrap', opacity: Math.min(1, r * 3), transform: `translateY(${(1 - r) * 105}%)` }}>{l}</div>
          </div>
        );
      })}
      {subFit ? (
        <>
          <div style={{ width: 150, height: 2, background: theme.line, margin: '44px 0 34px', transform: `scaleX(${rule})` }} />
          <div style={{ opacity: s, transform: `translateY(${(1 - s) * 16}px)`, color: theme.soft }}>
            {subFit.lines.map((l, i) => (
              <div key={i} style={{ ...serif(hookFont, subFit.size, true), lineHeight: 1.18, whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ width: 150, height: 2, background: theme.line, marginTop: 48, transform: `scaleX(${rule})` }} />
      )}
    </div>
  );
};
