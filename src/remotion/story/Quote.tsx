// A quote in big italic. The whole quote is there as a faint ghost and fills in word by word at
// her speaking pace; a large accent quote mark above, the author in small capitals below.
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { BOX, BOX_H, breath, caps, CLAMP, draw, ease, fitText, ITALIC_W, reveal, serif, spokenShare, useScene } from './kit';

export const Quote: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont, model } = useReel();
  const { scene, frames, first, theme } = useScene();
  const text = (scene.text ?? '').trim().replace(/^[„"“”]+|[„"“”]+$/g, '');
  const author = (scene.items?.[0] ?? '').trim();
  const fit = fitText(text, { maxW: BOX.w - 40, maxLines: 7, max: 112, min: 54, charW: ITALIC_W, lead: 1.12, maxH: BOX_H - 330 });
  const total = fit.lines.reduce((n, l) => n + l.split(' ').length, 0);
  // Ahead of her voice a little, so the eye reads with her, not after her.
  const share = first ? 1 : Math.min(1, spokenShare(frame, scene, model.words) * 1.15 + 0.08);
  const filled = share * total;
  const mark = reveal(frame, 0, first, 24);
  const a = first ? 1 : ease(frame, Math.round(frames * 0.55), 20);
  const rule = first ? 1 : draw(frame, Math.round(frames * 0.5), 20);
  const b = breath(frame, frames);
  let k = 0;

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: theme.text, transform: `translateY(${-b * 16}px)` }}>
      <div
        style={{
          ...serif(hookFont, 360),
          color: theme.line,
          height: 170,
          lineHeight: 0.9,
          marginLeft: -12,
          opacity: mark,
          transform: `translateY(${(1 - mark) * 30}px)`,
        }}
      >
        “
      </div>
      <div style={{ paddingLeft: 20 }}>
        {fit.lines.map((l, i) => (
          <div key={i} style={{ ...serif(hookFont, fit.size, true), lineHeight: 1.12, whiteSpace: 'nowrap' }}>
            {l.split(' ').map((w, j) => {
              const idx = k++;
              const o = interpolate(filled, [idx, idx + 1.4], [0.16, 1], CLAMP);
              return (
                <span key={j} style={{ opacity: o }}>
                  {w}
                  {j < l.split(' ').length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {author ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 56, paddingLeft: 20, color: theme.soft }}>
          <div style={{ width: 70, height: 1.5, background: theme.line, transformOrigin: '0 50%', transform: `scaleX(${rule})` }} />
          <div style={{ ...caps(hookFont, 30), opacity: a }}>{author}</div>
        </div>
      ) : null}
    </div>
  );
};
