// Her board picture in a passe-partout: a hairline frame draws around it, the picture is
// uncovered from the bottom and slowly zooms out. A missing file shows a quiet tonal panel
// with a short accent rule (the caption stays below), never a broken image.
import React, { useState } from 'react';
import { useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { BoardImage } from '../effects/Picture';
import { BOX, BOX_H, breath, draw, fitText, ITALIC_W, mix, reveal, serif, useScene } from './kit';

export const Photo: React.FC = () => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const [failed, setFailed] = useState(false);
  const caption = (scene.text ?? '').trim();
  const cap = caption ? fitText(caption, { maxW: BOX.w - 60, maxLines: 2, max: 58, min: 38, charW: ITALIC_W }) : null;
  const capH = cap ? cap.lines.length * cap.size * 1.15 + 50 : 0;
  const h = Math.min(980, BOX_H - capH - 30);
  const w = Math.round(h * 0.8);
  const left = BOX.x + (BOX.w - w) / 2;
  const b = breath(frame, frames);
  const open = first ? 1 : draw(frame, 2, 26);
  const frameLine = first ? 1 : draw(frame, 6, 34);
  const c = reveal(frame, 18, first, 20);
  const missing = failed || !scene.image;
  const PAD = 22; // passe-partout gap between picture and hairline
  const perim = 2 * (w + h + 4 * PAD);

  const fallback = (
    <div style={{ width: '100%', height: '100%', background: mix(theme.bg, theme.text, 0.07), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, boxSizing: 'border-box' }}>
      <div style={{ width: 70, height: 1.5, background: theme.line }} />
    </div>
  );

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.text }}>
      <div style={{ position: 'relative', width: w, height: h, transform: `translateY(${-b * 12}px)` }}>
        <svg width={w + 2 * PAD + 4} height={h + 2 * PAD + 4} style={{ position: 'absolute', left: -PAD - 2, top: -PAD - 2, overflow: 'visible' }}>
          <rect x={2} y={2} width={w + 2 * PAD} height={h + 2 * PAD} fill="none" stroke={theme.line} strokeWidth={1.5} strokeDasharray={perim} strokeDashoffset={perim * (1 - frameLine)} />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            clipPath: `inset(${(1 - open) * 100}% 0 0 0)`,
            boxShadow: theme.dark ? '0 30px 60px rgba(0,0,0,0.5)' : '0 30px 60px rgba(60,40,20,0.18), 0 6px 16px rgba(60,40,20,0.10)',
          }}
        >
          {missing ? (
            fallback
          ) : (
            <BoardImage
              src={props.urls.board + encodeURIComponent(scene.image!)}
              onFail={() => setFailed(true)}
              style={{ width: '100%', height: '100%', transform: `scale(${1.12 - 0.1 * b - (1 - open) * 0.04}) translateY(${(0.5 - b) * 14}px)` }}
            />
          )}
        </div>
      </div>
      {cap ? (
        <div style={{ marginTop: 46, textAlign: 'center', color: theme.soft, opacity: c, transform: `translateY(${(1 - c) * 14}px)` }}>
          {cap.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, cap.size, true), lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
