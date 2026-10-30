// "logos": 2 to 6 cards (tools, features, plans) in a grid of 2 columns (3 when there are 6; an odd last card is centred). Each
// card pops in when she names it (else staggered), then a thin accent tick draws in its corner.
import React from 'react';
import { spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { useReel } from '../context';
import { BOX, BOX_H, breath, cueFrames, draw, fitText, mix, reveal, serif, useScene } from './kit';

const GAP = 28;

export const Logos: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont, model } = useReel();
  const { scene, frames, first, theme } = useScene();
  const items = (scene.items ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const heading = (scene.text ?? '').trim();
  const head = heading ? fitText(heading, { maxW: BOX.w, maxLines: 2, max: 96, min: 56 }) : null;
  const headH = head ? head.lines.length * head.size * 1.06 + 60 : 0;
  const cols = items.length === 6 ? 3 : 2;
  const rows = Math.ceil(items.length / cols);
  const cardW = (BOX.w - GAP * (cols - 1)) / cols;
  const cardH = Math.min(cols === 3 ? 250 : 230, (BOX_H - headH - GAP * (rows - 1) - 20) / rows);
  const gridH = rows * cardH + (rows - 1) * GAP;
  const top = BOX.y + headH + (BOX_H - headH - gridH) / 2;
  // One type size for all cards.
  const size = Math.min(...items.map((t) => fitText(t, { maxW: cardW - 64, maxLines: 2, max: cols === 3 ? 56 : 68, min: 30, maxH: cardH - 70 }).size));
  // Spoken cues, but every card is in by 60% of the scene.
  const cues = cueFrames(items, scene, model.words).map((c, i) => Math.min(c, Math.round(8 + (i * frames * 0.5) / Math.max(1, items.length))));
  const b = breath(frame, frames);
  const hr = reveal(frame, 0, first, 18);
  const fill = theme.dark ? mix(theme.bg, theme.text, 0.07) : '#FBF8F3';

  return (
    <div style={{ position: 'absolute', inset: 0, color: theme.text, transform: `translateY(${-b * 14}px)` }}>
      {head ? (
        <div style={{ position: 'absolute', left: BOX.x, top: top - headH, width: BOX.w, opacity: hr, transform: `translateY(${(1 - hr) * 18}px)` }}>
          {head.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, head.size, i === head.lines.length - 1 && head.lines.length > 1), whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
      {items.map((t, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        // A lone last card sits in the middle of its row.
        const inRow = Math.min(cols, items.length - row * cols);
        const x = BOX.x + (BOX.w - (inRow * cardW + (inRow - 1) * GAP)) / 2 + col * (cardW + GAP);
        const y = top + row * (cardH + GAP);
        const p = first && cues[i] <= 6 ? 1 : spring({ frame: frame - cues[i], fps: FPS, config: { damping: 14, stiffness: 170, mass: 0.7 } });
        const tick = first && cues[i] <= 6 ? 1 : draw(frame, cues[i] + 10, 14);
        const lines = fitText(t, { maxW: cardW - 64, maxLines: 2, max: size, min: size }).lines;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: cardW,
              height: cardH,
              borderRadius: 26,
              background: fill,
              boxShadow: theme.dark ? `0 0 0 1.5px ${mix(theme.bg, theme.text, 0.16)}, 0 24px 48px rgba(0,0,0,0.4)` : `0 0 0 1.5px ${mix(theme.bg, theme.text, 0.1)}, 0 20px 40px rgba(60,40,20,0.12)`,
              opacity: Math.min(1, p * 1.5),
              transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p})`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 28px',
              boxSizing: 'border-box',
            }}
          >
            <svg width={40} height={40} viewBox="0 0 40 40" style={{ position: 'absolute', right: 22, top: 22 }}>
              <circle cx={20} cy={20} r={18} fill="none" stroke={theme.faint} strokeWidth={1.5} />
              <path d="M12 20.5 L18 26.5 L28.5 14" fill="none" stroke={theme.line} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tick} />
            </svg>
            {lines.map((l, j) => (
              <div key={j} style={{ ...serif(hookFont, size), lineHeight: 1.08, whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
