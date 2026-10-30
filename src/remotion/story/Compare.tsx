// Two sides, stacked like a magazine "this, not that": the "no" side first, muted and struck
// through with a drawn line; then the "yes" side in full colour with the accent mark.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { breakLines } from '../model';
import { BOX, BOX_H, breath, caps, cueFrames, draw, fitText, reveal, serif, SERIF_W, useScene } from './kit';

const LABELS: Record<string, [string, string]> = { pl: ['nie', 'tak'], en: ['no', 'yes'] };

export const Compare: React.FC = () => {
  const frame = useCurrentFrame();
  const { props, hookFont, model } = useReel();
  const { scene, frames, first, theme } = useScene();
  const [no, yes] = [(scene.items?.[0] ?? '').trim(), (scene.items?.[1] ?? '').trim()];
  const [noL, yesL] = LABELS[props.edit.language] ?? LABELS.pl;
  const heading = (scene.text ?? '').trim();
  const head = heading ? fitText(heading, { maxW: BOX.w, maxLines: 2, max: 96, min: 56 }) : null;
  const headH = head ? head.lines.length * head.size * 1.06 + 64 : 0;
  // Per side: what is left after the heading, the divider (60+60) and the two label rows (~60 each).
  const room = (BOX_H - headH - 122 - 2 * 62) / 2 - 16;
  // One size for both sides so neither looks louder by accident.
  let size = 96;
  for (; size > 40; size -= 2) {
    const ok = [no, yes].every((t) => {
      const l = breakLines(t, size, SERIF_W, BOX.w);
      return l.every((x) => x.length * size * SERIF_W <= BOX.w) && l.length * size * 1.08 <= room;
    });
    if (ok) break;
  }
  const cues = cueFrames([no, yes], scene, model.words);
  const yesAt = Math.max(cues[1], Math.min(Math.round(frames * 0.4), 40));
  const b = breath(frame, frames);
  const hr = reveal(frame, 0, first, 18);
  const nr = reveal(frame, first ? 0 : 6, first, 18);
  const strike = first ? 1 : draw(frame, 18, 18);
  const yr = reveal(frame, yesAt, first && yesAt <= 6, 18);
  const div = first ? 1 : draw(frame, 10, 30);

  const side = (text: string, label: string, isYes: boolean, r: number) => {
    const lines = breakLines(text, size, SERIF_W, BOX.w);
    return (
      <div style={{ opacity: r, transform: `translateY(${(1 - r) * 24}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, color: isYes ? theme.text : theme.soft }}>
          {isYes ? <div style={{ width: 14, height: 14, borderRadius: 7, background: theme.line }} /> : null}
          <div style={caps(hookFont, 34)}>{label}</div>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ position: 'relative', display: 'table', ...serif(hookFont, size, isYes), lineHeight: 1.08, whiteSpace: 'nowrap', color: isYes ? theme.text : theme.soft }}>
            {l}
            {isYes ? null : (
              <div style={{ position: 'absolute', left: -6, right: -6, top: '56%', height: Math.max(2, size * 0.035), background: theme.line, transformOrigin: '0 50%', transform: `scaleX(${interpolateStrike(strike, i, lines.length)})` }} />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: theme.text, transform: `translateY(${-b * 16}px)` }}>
      {head ? (
        <div style={{ marginBottom: 64, opacity: hr, transform: `translateY(${(1 - hr) * 18}px)` }}>
          {head.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, head.size), whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
      {side(no, noL, false, nr)}
      <div style={{ height: 1.5, background: theme.faint, margin: '60px 0', transformOrigin: '0 50%', transform: `scaleX(${div})` }} />
      {side(yes, yesL, true, yr)}
    </div>
  );
};

// The strike runs line after line, like one pen stroke.
const interpolateStrike = (p: number, i: number, n: number) => Math.max(0, Math.min(1, p * n - i));
