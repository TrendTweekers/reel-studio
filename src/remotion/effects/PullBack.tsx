// Pull-back reveal. The shot starts tight on her face (~1.8x), then eases back past full size to a
// print on a cream table (rounded corners, cream border, soft shadow), holds, and grows back to full
// screen so the last frame is the normal video again. One <Footage> copy, no big blurs.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { CREAM } from '../color';
import { useReel } from '../context';
import type { TimedEffect, Zoom } from '../model';
import { footageFilterFor, Grade } from '../parts/Vibe';
import { CLAMP } from './anim';
import { Footage, useAbsFrame, useFace } from './footage';

const TIGHT = 1.8;
const CARD = 0.82;

const zoomStyle = (z: Zoom): React.CSSProperties => ({
  transformOrigin: `${z.ox}px ${z.oy}px`,
  transform: z.s === 1 ? undefined : `scale(${z.s})`,
});

// Her video exactly as the base layer shows it (same jump-cut / punch camera, same grade filter).
const CamFootage: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const { model, props } = useReel();
  const abs = useAbsFrame(e);
  const [outer, inner] = model.camera(Math.min(abs, model.total - 1));
  return (
    <AbsoluteFill style={{ ...zoomStyle(outer), filter: footageFilterFor(props.edit) }}>
      <AbsoluteFill style={zoomStyle(inner)}>
        <Footage e={e} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const scaleAt = (f: number, n: number) => {
  const push = Math.max(4, Math.round(Math.min(9, n * 0.1)));
  const hold = Math.round(n * 0.2);
  const back = Math.round(n * 0.55);
  const ret = Math.max(back + 4, n - Math.max(10, Math.round(n * 0.18)));
  const end = n - 1;
  if (f <= push) return interpolate(f, [0, push], [1, TIGHT], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  if (f <= hold) return interpolate(f, [push, hold], [TIGHT, TIGHT * 1.02], CLAMP);
  if (f <= back) return interpolate(f, [hold, back], [TIGHT * 1.02, CARD], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  if (f <= ret) return interpolate(f, [back, ret], [CARD, CARD - 0.015], CLAMP);
  return interpolate(f, [ret, end], [CARD - 0.015, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
};

export const PullBack: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const face = useFace(e);
  const n = e.frames;
  const s = frame >= n - 1 ? 1 : scaleAt(frame, n);

  // Zoom point: her face while tight, the card centre (a little above the middle, clear of the
  // Instagram caption band) while small. Continuous because both meet at s = 1.
  const fx = Math.max(0, Math.min(WIDTH, face.x + face.w / 2));
  const fy = Math.max(0, Math.min(HEIGHT, face.y + face.h * 0.45));
  const cy = HEIGHT * 0.47;
  const k = interpolate(s, [1, 1.3], [0, 1], CLAMP);
  const ox = WIDTH / 2 + (fx - WIDTH / 2) * k;
  const oy = cy + (fy - cy) * k;
  // While tight, also slide her face towards the upper-middle, never past the frame edges.
  const room = Math.max(0, s - 1);
  const clampT = (v: number, o: number, size: number) => Math.max(-room * (size - o), Math.min(room * o, v));
  const tx = clampT((WIDTH / 2 - fx) * k, ox, WIDTH);
  const ty = clampT((HEIGHT * 0.38 - fy) * k, oy, HEIGHT);

  // How much it looks like a print: 0 at full screen, 1 at card size.
  const p = interpolate(s, [CARD, 1], [1, 0], CLAMP);
  const radius = 30 * p;
  const border = 16 * p;

  return (
    <AbsoluteFill style={{ backgroundColor: CREAM, overflow: 'hidden' }}>
      {/* Cream paper table: soft light from the top, a little darker at the edges. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 40%, rgba(255,252,246,0.9) 0%, rgba(245,239,230,0) 60%), linear-gradient(180deg, #F3EDE3 0%, #E9E0D3 100%)',
        }}
      />
      <AbsoluteFill style={{ transformOrigin: `${ox}px ${oy}px`, transform: s === 1 ? undefined : `translate(${tx}px, ${ty}px) scale(${s})` }}>
        <AbsoluteFill
          style={{
            borderRadius: radius,
            overflow: 'hidden',
            boxShadow:
              p > 0
                ? `0 0 0 ${border}px #FBF7F0, 0 ${40 * p}px ${90 * p}px rgba(40,28,16,${0.28 * p}), 0 ${8 * p}px ${22 * p}px rgba(40,28,16,${0.16 * p})`
                : undefined,
          }}
        >
          <CamFootage e={e} />
          <Grade />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
