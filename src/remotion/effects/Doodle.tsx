// Hand-drawn doodles that "boil" around her: each line draws on, then is redrawn with a new small
// wobble every 3 frames, like hand animation. An arrow points at her (with e.text hand-lettered at
// its tail), plus a few hearts, stars, sparkles and emphasis ticks around her head. Cream ink with a
// soft dark shadow, one doodle in the accent colour. Nothing is ever drawn over her face.
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { clamp, overlaps, rightLimit, SAFE, SAFE_BOTTOM, type Rect, type TimedEffect } from '../model';
import { CLAMP, outro } from './anim';
import { useAbsFrame } from './footage';

type Pt = [number, number];

const INK_CREAM = '#FBF4E2';
const BOIL = 3; // frames per drawing

// Smooth path through points (Catmull-Rom -> cubic Bézier).
const smooth = (pts: Pt[], closed = false) => {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};

const wobble = (pts: Pt[], seed: string, amp: number): Pt[] =>
  pts.map(([x, y], i) => [x + (random(`${seed}-x${i}`) * 2 - 1) * amp, y + (random(`${seed}-y${i}`) * 2 - 1) * amp]);

// Shapes in a unit box centred on 0,0 (about -1..1).
const heart = (): Pt[] =>
  Array.from({ length: 22 }, (_, i) => {
    const t = (i / 22) * Math.PI * 2;
    return [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17];
  });
const star = (): Pt[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.42 : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
const sparkle = (): Pt[] =>
  Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * Math.PI * 2;
    return [Math.cos(t) ** 3, Math.sin(t) ** 3];
  });

type Shape = { kind: 'heart' | 'star' | 'sparkle' | 'ticks'; cx: number; cy: number; size: number; rot: number; delay: number; accent: boolean; flip?: boolean };

export const Doodle: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, props, hookFont } = useReel();
  const abs = useAbsFrame(e);

  // Smoothed face (no jitter): average of the last 8 frames.
  let ax = 0;
  let ay = 0;
  let aw = 0;
  let ah = 0;
  for (let k = 0; k < 8; k++) {
    const r = model.faceRect(clamp(abs - k, 0, model.total - 1));
    ax += r.x;
    ay += r.y;
    aw += r.w;
    ah += r.h;
  }
  const face: Rect = { x: ax / 8, y: ay / 8, w: aw / 8, h: ah / 8 };
  const head: Rect = { x: face.x - face.w * 0.14, y: face.y - face.h * 0.45, w: face.w * 1.28, h: face.h * 1.5 };
  const guard: Rect = { x: face.x - 24, y: face.y - 24, w: face.w + 48, h: face.h + 48 };

  const boil = Math.floor(frame / BOIL);
  const o = outro(frame, e.frames, 8);
  const accent = props.edit.style.accentColor || '#E8C9A0';
  const text = (e.text ?? '').trim();

  const inSafe = (r: Rect) => r.x >= SAFE.side && r.x + r.w <= rightLimit(r.y, r.h) && r.y >= SAFE.top && r.y + r.h <= SAFE_BOTTOM;

  // ---- The arrow: from the open side, curving in to stop just short of her face.
  const side = e.side; // the side away from her face
  const dir = side === 'right' ? 1 : -1;
  const faceCy = face.y + face.h * 0.55;
  const tipX = side === 'right' ? face.x + face.w + 40 : face.x - 40;
  const tipY = clamp(faceCy, SAFE.top + 120, SAFE_BOTTOM - 200);
  const room = side === 'right' ? rightLimit(tipY - 200, 300) - 30 - tipX : tipX - SAFE.side - 30;
  const span = clamp(room - 20, 140, 340);
  const tail: Pt = [tipX + dir * span, tipY + 180];
  const arrowOk = room >= 140;
  const arrowPts: Pt[] = [
    tail,
    [tail[0] - dir * span * 0.18, tail[1] - 70],
    [tail[0] - dir * span * 0.42, tail[1] - 118],
    // a small hand loop
    [tail[0] - dir * span * 0.5, tail[1] - 170],
    [tail[0] - dir * span * 0.36, tail[1] - 182],
    [tail[0] - dir * span * 0.34, tail[1] - 140],
    [tail[0] - dir * span * 0.62, tail[1] - 120],
    [tipX + dir * 30, tipY + 12],
    [tipX, tipY],
  ];
  const ang = Math.atan2(tipY - (tipY + 12), tipX - (tipX + dir * 30));
  const head1: Pt[] = [
    [tipX + Math.cos(ang + Math.PI - 0.55) * 46, tipY + Math.sin(ang + Math.PI - 0.55) * 46],
    [tipX, tipY],
    [tipX + Math.cos(ang + Math.PI + 0.55) * 46, tipY + Math.sin(ang + Math.PI + 0.55) * 46],
  ];

  // ---- Small doodles around her head: candidates, kept only when inside the safe area and off her face.
  const cands: Shape[] = [
    { kind: 'heart', cx: head.x + head.w + 70, cy: head.y + head.h * 0.12, size: 58, rot: 12, delay: 6, accent: true },
    { kind: 'sparkle', cx: head.x - 60, cy: head.y + head.h * 0.2, size: 46, rot: 0, delay: 10, accent: false },
    { kind: 'star', cx: head.x - 70, cy: head.y + head.h * 0.72, size: 48, rot: -10, delay: 14, accent: false },
    { kind: 'ticks', cx: head.x + (side === 'right' ? -40 : head.w + 40), cy: head.y + head.h * 0.05, size: 64, rot: 0, delay: 2, accent: false, flip: side !== 'right' },
    { kind: 'sparkle', cx: head.x + head.w + 50, cy: head.y + head.h * 0.85, size: 40, rot: 0, delay: 16, accent: false },
    { kind: 'heart', cx: head.x - 50, cy: head.y + head.h + 40, size: 50, rot: -14, delay: 18, accent: false },
    { kind: 'star', cx: head.x + head.w * 0.5 + dir * 120, cy: head.y - 40, size: 44, rot: 8, delay: 12, accent: false },
    { kind: 'sparkle', cx: head.x + head.w / 2 - dir * 160, cy: head.y + head.h + 70, size: 40, rot: 0, delay: 20, accent: false },
  ];
  // Text box (by the arrow tail) so doodles keep off it.
  const textSize = 118;
  const textW = Math.max(1, Array.from(text).length) * textSize * 0.42 + 20;
  const textBox: Rect | null =
    text && arrowOk
      ? {
          x: clamp(tail[0] - textW / 2 + dir * 10, SAFE.side, rightLimit(tail[1], textSize) - textW),
          y: tail[1] + 14,
          w: textW,
          h: textSize,
        }
      : null;
  const arrowBox: Rect = arrowOk
    ? {
        x: Math.min(tail[0], tipX) - 20,
        y: tail[1] - 200,
        w: Math.abs(tail[0] - tipX) + 40,
        h: 220,
      }
    : { x: -999, y: -999, w: 0, h: 0 };
  const shapes: Shape[] = [];
  const taken: Rect[] = [arrowBox, ...(textBox ? [textBox] : [])];
  for (const c of cands) {
    const r: Rect = { x: c.cx - c.size * 1.2, y: c.cy - c.size * 1.2, w: c.size * 2.4, h: c.size * 2.4 };
    if (!inSafe(r) || overlaps(r, guard) || taken.some((t) => overlaps(t, r, 6))) continue;
    shapes.push(c);
    taken.push(r);
    if (shapes.length >= 4) break;
  }

  const drawOn = (delay: number, len = 9) => interpolate(frame, [delay, delay + len], [0, 1], CLAMP);

  const stroke = (d: string, key: string, t: number, color: string, width = 5.5) => (
    <path
      key={key}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width * 1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - t}
      opacity={t > 0 ? 1 : 0}
    />
  );

  const renderShape = (s: Shape, i: number) => {
    const t = drawOn(s.delay, 8);
    const seed = `dd-${e.id}-${i}-${boil}`;
    const color = s.accent ? accent : INK_CREAM;
    const tf = (pts: Pt[]): Pt[] => {
      const c = Math.cos((s.rot * Math.PI) / 180);
      const sn = Math.sin((s.rot * Math.PI) / 180);
      return pts.map(([x, y]) => [s.cx + (x * c - y * sn) * s.size, s.cy + (x * sn + y * c) * s.size]);
    };
    if (s.kind === 'ticks') {
      // three short strokes radiating from the head corner
      const f = s.flip ? -1 : 1;
      return [-0.35, 0, 0.35].map((a, k) => {
        const base = -Math.PI / 2 - f * 0.7 + a;
        const r0 = 0.25;
        const r1 = 0.95;
        const pts: Pt[] = [
          [Math.cos(base) * r0, Math.sin(base) * r0],
          [Math.cos(base) * (r0 + r1) * 0.5, Math.sin(base) * (r0 + r1) * 0.5],
          [Math.cos(base) * r1, Math.sin(base) * r1],
        ];
        const w = wobble(tf(pts), `${seed}-t${k}`, 2.2);
        return stroke(smooth(w), `s${i}-${k}`, drawOn(s.delay + k * 2, 5), color, 5);
      });
    }
    const base = s.kind === 'heart' ? heart() : s.kind === 'star' ? star() : sparkle();
    const pts = wobble(tf(base), seed, s.size * 0.06 + 1.2);
    const d = s.kind === 'star' ? 'M ' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ' Z' : smooth(pts, true);
    return stroke(d, `s${i}`, t, color, s.kind === 'sparkle' ? 4.5 : 5.5);
  };

  const arrowT = drawOn(3, 12);
  const headT = drawOn(14, 4);
  const arrowSeed = `ar-${e.id}-${boil}`;
  const textIn = interpolate(frame, [12, 18], [0, 1], CLAMP);
  const textJit = (random(`tx-${e.id}-${boil}`) * 2 - 1) * 1.2;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: o }}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        style={{ position: 'absolute', inset: 0, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.45)) drop-shadow(0 3px 8px rgba(0,0,0,0.3))' }}
      >
        {arrowOk ? (
          <>
            {stroke(smooth(wobble(arrowPts, arrowSeed, 2.6)), 'arrow', arrowT, INK_CREAM, 6)}
            {stroke(smooth(wobble(head1, `${arrowSeed}-h`, 2.2)), 'arrowhead', headT, INK_CREAM, 6)}
          </>
        ) : null}
        {shapes.map(renderShape)}
        {textBox
          ? stroke(
              smooth(
                wobble(
                  [
                    [textBox.x + 8, textBox.y + textSize * 0.98],
                    [textBox.x + textBox.w * 0.5, textBox.y + textSize * 1.02],
                    [textBox.x + textBox.w - 4, textBox.y + textSize * 0.95],
                  ],
                  `ul-${e.id}-${boil}`,
                  2.5,
                ),
              ),
              'underline',
              drawOn(18, 7),
              accent,
              5,
            )
          : null}
      </svg>
      {textBox ? (
        <div
          style={{
            position: 'absolute',
            left: textBox.x,
            top: textBox.y,
            width: textBox.w,
            textAlign: 'center',
            fontFamily: hookFont,
            fontStyle: 'italic',
            fontSize: textSize,
            lineHeight: 0.95,
            color: INK_CREAM,
            whiteSpace: 'nowrap',
            opacity: textIn,
            transform: `rotate(${-dir * 5 + textJit}deg) translateY(${(1 - textIn) * 10}px)`,
            textShadow: '0 1px 2px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.35)',
          }}
        >
          {text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
