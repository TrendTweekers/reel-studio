// "price": the old price (items[0], optional) is crossed out by a drawn line, then the big price
// (items[1]) counts down from the old one, or rises in when there is no old number; the unit sits
// beside it in italic; an accent rule, then what you get (text).
import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { BOX, BOX_H, breath, CLAMP, draw, fitText, formatAmount, parseAmount, reveal, serif, useScene } from './kit';

export const Price: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const old = (scene.items?.[0] ?? '').trim();
  const price = (scene.items?.[1] ?? '').trim();
  const what = (scene.text ?? '').trim();
  const p = parseAmount(price);
  const po = old ? parseAmount(old) : null;
  const countDown = !!(p && po && po.value > p.value);

  const oldIn = reveal(frame, 2, first, 16);
  const strike = first ? 1 : draw(frame, 10, 14);
  const priceAt = old ? 22 : 4;
  const k = first ? 1 : interpolate(frame, [priceAt, priceAt + 34], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const rise = first ? 1 : reveal(frame, priceAt, false, 20);
  let shown = price;
  let pre = '';
  let post = '';
  if (p) {
    pre = p.pre;
    post = p.post.trim();
    shown = formatAmount(p, countDown ? po!.value + (p.value - po!.value) * k : p.value);
  }
  const finalLen = (pre + (p ? formatAmount(p, Math.max(p.value, po?.value ?? 0)) : price)).length;
  const unitK = 0.4;
  const units = finalLen * 0.58 + (post ? (post.length + 0.5) * 0.46 * unitK : 0);
  const size = Math.round(Math.max(110, Math.min(380, BOX.w / Math.max(1, units))));
  const oldSize = Math.min(104, Math.round(size * 0.36));
  const mean = what ? fitText(what, { maxW: BOX.w - 40, maxLines: 3, max: 66, min: 40 }) : null;
  const rule = first ? 1 : draw(frame, priceAt + 18, 24);
  const m = reveal(frame, priceAt + 24, first, 20);
  const b = breath(frame, frames);

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.text, textAlign: 'center' }}>
      {old ? (
        <div style={{ position: 'relative', ...serif(hookFont, oldSize), color: theme.soft, whiteSpace: 'nowrap', marginBottom: 18, opacity: oldIn, transform: `translateY(${(1 - oldIn) * 14}px)` }}>
          {old}
          <div style={{ position: 'absolute', left: -10, right: -10, top: '52%', height: Math.max(2, oldSize * 0.05), background: theme.line, transformOrigin: '0 50%', transform: `scaleX(${strike}) rotate(-4deg)` }} />
        </div>
      ) : null}
      <div style={{ overflow: 'hidden', paddingBottom: size * 0.06 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums lining-nums',
            opacity: countDown ? Math.min(1, rise * 2) : rise,
            transform: `translateY(${countDown ? (1 - rise) * 20 : (1 - rise) * 100}%) scale(${1 + b * 0.035})`,
          }}
        >
          <span style={{ ...serif(hookFont, size), lineHeight: 0.95, letterSpacing: '-0.04em' }}>
            {pre}
            {shown}
          </span>
          {post ? <span style={{ ...serif(hookFont, size * unitK, true), color: theme.line, marginLeft: size * 0.06 }}>{post}</span> : null}
        </div>
      </div>
      <div style={{ width: 220, height: 2, background: theme.line, margin: '40px 0 38px', transform: `scaleX(${rule})` }} />
      {mean ? (
        <div style={{ opacity: m, transform: `translateY(${(1 - m) * 18}px)` }}>
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
