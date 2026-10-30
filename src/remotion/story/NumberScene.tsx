// A big number that counts up ("73%", "3", "120 zł"); the unit sits beside it in italic, a rule
// draws under it, then the line that says what it means.
import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { BOX, BOX_H, breath, CLAMP, draw, fitText, parseAmount, reveal, serif, useScene } from './kit';

export const NumberScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const raw = (scene.items?.[0] ?? '').trim() || (scene.text ?? '').trim();
  const meaning = scene.items?.[0] ? (scene.text ?? '').trim() : '';
  const p = parseAmount(raw);
  const count = first ? 1 : interpolate(frame, [4, 4 + 40], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  let shown = raw;
  let post = '';
  let pre = '';
  if (p) {
    const v = (p.value * count).toFixed(p.decimals);
    shown = p.comma ? v.replace('.', ',') : v;
    pre = p.pre;
    post = p.post.trim();
  }
  // Size from the final string: digits are wide (~0.56), the unit is smaller and italic.
  const finalDigits = p ? p.value.toFixed(p.decimals) : raw;
  const unitK = 0.42;
  const units = (pre.length + finalDigits.length) * 0.58 + (post ? (post.length + 0.5) * 0.46 * unitK : 0);
  const size = Math.round(Math.max(120, Math.min(440, BOX.w / Math.max(1, units))));
  const mean = meaning ? fitText(meaning, { maxW: BOX.w - 40, maxLines: 3, max: 76, min: 44 }) : null;
  const b = breath(frame, frames);
  const rule = first ? 1 : draw(frame, 20, 26);
  const m = reveal(frame, 26, first, 20);
  const pop = first ? 1 : interpolate(frame, [2, 16], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.text, textAlign: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          opacity: pop,
          transform: `scale(${(0.94 + 0.06 * pop) * (1 + b * 0.04)})`,
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      >
        <span style={{ ...serif(hookFont, size), lineHeight: 0.9, letterSpacing: '-0.04em' }}>
          {pre}
          {shown}
        </span>
        {post ? <span style={{ ...serif(hookFont, size * unitK, true), color: theme.line, marginLeft: size * 0.06 }}>{post}</span> : null}
      </div>
      <div style={{ width: 220, height: 2, background: theme.line, margin: '46px 0 40px', transform: `scaleX(${rule})` }} />
      {mean ? (
        <div style={{ opacity: m, transform: `translateY(${(1 - m) * 18}px)`, maxWidth: BOX.w - 40 }}>
          {mean.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, mean.size), lineHeight: 1.12, whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
