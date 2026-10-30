// A numbered list: heading, then rows that arrive when she names them. Each row brings its own
// hairline and an italic numeral in the accent colour.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { breakLines } from '../model';
import { BOX, BOX_H, breath, cueFrames, draw, fitText, reveal, serif, SERIF_W, useScene } from './kit';

const NUM_W = 120;

export const List: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont, model } = useReel();
  const { scene, frames, first, theme } = useScene();
  const items = (scene.items ?? []).map((s) => s.trim()).filter(Boolean);
  const heading = (scene.text ?? '').trim();
  const head = heading ? fitText(heading, { maxW: BOX.w, maxLines: 2, max: 104, min: 60 }) : null;
  const headH = head ? head.lines.length * head.size * 1.06 + 70 : 0;
  const n = Math.max(1, items.length);
  const rowRoom = (BOX_H - headH - 40) / n;
  // One size for all items: two lines at most, and the row must fit its share of the height.
  let size = 84;
  for (; size > 34; size -= 2) {
    const ok = items.every((t) => {
      const l = breakLines(t, size, SERIF_W, BOX.w - NUM_W);
      return l.length <= 2 && l.every((x) => x.length * size * SERIF_W <= BOX.w - NUM_W) && l.length * size * 1.1 + 56 <= rowRoom;
    });
    if (ok) break;
  }
  const cues = cueFrames(items, scene, model.words);
  const b = breath(frame, frames);
  const hr = reveal(frame, 2, first, 20);

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
        justifyContent: 'center',
        color: theme.text,
        transform: `translateY(${-b * 16}px)`,
      }}
    >
      {head ? (
        <div style={{ marginBottom: 54, opacity: hr, transform: `translateY(${(1 - hr) * 20}px)` }}>
          {head.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, head.size, i === head.lines.length - 1 && head.lines.length > 1), whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
      {items.map((t, i) => {
        const r = reveal(frame, cues[i], first, 18);
        const line = first && cues[i] <= 6 ? 1 : draw(frame, cues[i] - 2, 22);
        const lines = breakLines(t, size, SERIF_W, BOX.w - NUM_W);
        return (
          <div key={i} style={{ position: 'relative', padding: `${size * 0.42}px 0` }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, background: theme.faint, transformOrigin: '0 50%', transform: `scaleX(${line})` }} />
            <div style={{ display: 'flex', alignItems: 'baseline', opacity: r, transform: `translateX(${(1 - r) * 34}px)` }}>
              <div style={{ ...serif(hookFont, size * 0.82, true), width: NUM_W, flex: 'none', color: theme.line }}>{String(i + 1).padStart(2, '0')}</div>
              <div>
                {lines.map((l, j) => (
                  <div key={j} style={{ ...serif(hookFont, size), lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ height: 1.5, background: theme.faint, transformOrigin: '0 50%', transform: `scaleX(${first ? 1 : draw(frame, cues[cues.length - 1] ?? 0, 22)})` }} />
    </div>
  );
};
