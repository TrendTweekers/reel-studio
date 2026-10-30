// Key words, one line each, revealed when she says them. Roman and italic alternate like a
// magazine headline; the newest line gets the accent underline, older lines step back a little.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { breakLines } from '../model';
import { BOX, BOX_H, breath, cueFrames, draw, ease, ITALIC_W, reveal, serif, SERIF_W, useScene } from './kit';

// One size for every line (a common type size reads as one statement).
const fitAll = (lines: string[]) => {
  for (let size = 168; size >= 56; size -= 2) {
    const rows = lines.map((l, i) => breakLines(l, size, i % 2 ? ITALIC_W : SERIF_W, BOX.w));
    const wide = rows.some((r, i) => r.some((x) => x.length * size * (i % 2 ? ITALIC_W : SERIF_W) > BOX.w));
    const h = rows.reduce((n, r) => n + r.length, 0) * size * 1.06 + (lines.length - 1) * size * 0.16;
    if (!wide && h <= BOX_H - 120) return { size, rows };
  }
  return { size: 56, rows: lines.map((l, i) => breakLines(l, 56, i % 2 ? ITALIC_W : SERIF_W, BOX.w)) };
};

export const Words: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont, model } = useReel();
  const { scene, frames, first, theme } = useScene();
  const lines = (scene.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const { size, rows } = fitAll(lines);
  const cues = cueFrames(lines, scene, model.words);
  const b = breath(frame, frames);
  const current = cues.reduce((k, c, i) => (frame >= c ? i : k), 0);

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
        gap: size * 0.16,
        transform: `translateY(${-b * 22}px)`,
      }}
    >
      {rows.map((r, i) => {
        const on = reveal(frame, cues[i], first, 18);
        const later = i < current ? ease(frame, cues[current], 16) : 0;
        const italic = i % 2 === 1;
        const u = i === current ? draw(frame, cues[i] + 8, 20) : 0;
        const right = i % 2 === 1; // italic lines sit to the right: a zig-zag, not a flush column
        return (
          <div key={i} style={{ alignSelf: right ? 'flex-end' : 'flex-start', textAlign: right ? 'right' : 'left', opacity: 1 - later * 0.5 }}>
            {r.map((x, j) => (
              <div key={j} style={{ overflow: 'hidden', paddingBottom: size * 0.1 }}>
                <div style={{ ...serif(hookFont, size, italic), whiteSpace: 'nowrap', opacity: Math.min(1, on * 3), transform: `translateY(${(1 - on) * 105}%)` }}>{x}</div>
              </div>
            ))}
            <div style={{ height: 2, marginTop: 4, background: theme.line, transformOrigin: right ? '100% 50%' : '0 50%', transform: `scaleX(${u})` }} />
          </div>
        );
      })}
    </div>
  );
};
