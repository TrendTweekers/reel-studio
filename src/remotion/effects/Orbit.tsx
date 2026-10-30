// Words (e.items) and/or one board picture (e.image, a small polaroid) circle her head on a tilted
// ring. Depth gives the 3D feel: items on the near side are bigger and brighter. With the person
// cut-out the far side passes BEHIND her (back items, then her cut-out, then front items); without
// it the far items shrink and fade out wherever they would cross her face.
// The ring follows her face smoothly. Items fly in to the ring, and fade at the end.
import React, { useState } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { CREAM, INK } from '../color';
import { useReel } from '../context';
import { clamp, SAFE, SAFE_BOTTOM, type Rect, type TimedEffect } from '../model';
import { CLAMP, lerp, outro } from './anim';
import { CamPerson, useAbsFrame, useHasCutout } from './footage';
import { BoardImage } from './Picture';

type Item = { kind: 'word'; text: string } | { kind: 'image'; name: string };

type Placed = { item: Item; i: number; x: number; y: number; depth: number; s: number; op: number };

const TILT = (-9 * Math.PI) / 180;
const PIC = { w: 176, h: 212 };

export const Orbit: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, props, hookFont } = useReel();
  const hasCutout = useHasCutout();
  const abs = useAbsFrame(e);
  const [picFailed, setPicFailed] = useState(false);

  const words = (e.items ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  const items: Item[] = words.map((text) => ({ kind: 'word', text }));
  if (e.image && !picFailed) items.splice(Math.min(1, items.length), 0, { kind: 'image', name: e.image });
  if (!items.length) return null;

  // Smoothed face: a weighted average over the last 10 frames (no jitter, softens cuts).
  let fx = 0;
  let fy = 0;
  let fw = 0;
  let fh = 0;
  let wsum = 0;
  for (let k = 0; k < 10; k++) {
    const f = clamp(abs - k, 0, model.total - 1);
    const r = model.faceRect(f);
    const wt = 1 - k / 10;
    fx += (r.x + r.w / 2) * wt;
    fy += (r.y + r.h / 2) * wt;
    fw += r.w * wt;
    fh += r.h * wt;
    wsum += wt;
  }
  const face: Rect = { x: fx / wsum - fw / wsum / 2, y: fy / wsum - fh / wsum / 2, w: fw / wsum, h: fh / wsum };
  const raw = model.faceRect(clamp(abs, 0, model.total - 1)); // the face right now, for the no-cutout check

  // The ring circles her head at chin height, like a tilted halo: the near side passes under her
  // chin (never over her face), the far side passes behind her face. Kept inside the safe area.
  const rx = clamp(face.w * 0.9 + 130, 300, 390);
  const ry = Math.max(rx * 0.27, face.h * 0.3);
  const margin = 85; // half a word at the side of the ring
  const cx = clamp(face.x + face.w / 2, SAFE.side + rx + margin, WIDTH - SAFE.side - rx - margin);
  const cy = clamp(face.y + face.h * 0.98, SAFE.top + ry + 40, SAFE_BOTTOM - ry - 60);
  const n = items.length;
  const speed = (Math.PI * 2) / (FPS * 4.6); // one turn in 4.6 s
  const o = outro(frame, e.frames, 12);
  const wordSize = 74;

  const placed: Placed[] = items.map((item, i) => {
    const fly = spring({ frame: frame - i * 3, fps: FPS, config: { damping: 16, stiffness: 80, mass: 0.9 } });
    // Fly in from a wide arc while spinning a little faster.
    const a = Math.PI * 0.5 + (i * Math.PI * 2) / n + frame * speed + (1 - fly) * 1.4;
    const r = lerp(Math.min(1, fly), 2.3, 1) * lerp(o, 1.18, 1);
    const ex = Math.cos(a) * rx * r;
    const ey = Math.sin(a) * ry * r;
    const x = cx + ex * Math.cos(TILT) - ey * Math.sin(TILT);
    const y = cy + ex * Math.sin(TILT) + ey * Math.cos(TILT);
    const depth = Math.sin(a); // +1 = nearest (front, lower), -1 = far (behind her head)
    const d01 = (depth + 1) / 2;
    const s = lerp(d01, 0.62, 1.12);
    let op = lerp(d01, hasCutout ? 0.7 : 0.35, 1) * interpolate(fly, [0, 0.35], [0, 1], CLAMP) * o;
    if (!hasCutout && depth < 0.1) {
      // Far side without a cut-out: fade out near her face so nothing sits on it.
      const dx = Math.abs(x - (raw.x + raw.w / 2)) - raw.w / 2;
      const dy = Math.abs(y - (raw.y + raw.h / 2)) - raw.h / 2;
      const dist = Math.max(dx, dy);
      op *= interpolate(dist, [-20, 90], [0, 1], CLAMP);
    }
    return { item, i, x, y, depth, s, op };
  });

  const draw = (p: Placed) => {
    const blur = p.depth < -0.2 ? (hasCutout ? 0 : 1.2) * (-p.depth) : 0;
    if (p.item.kind === 'image') {
      const sway = Math.sin(frame / 14 + p.i) * 3;
      return (
        <div
          key={`p${p.i}`}
          style={{
            position: 'absolute',
            left: p.x - PIC.w / 2,
            top: p.y - PIC.h / 2,
            width: PIC.w,
            height: PIC.h,
            opacity: p.op,
            transform: `scale(${p.s}) rotate(${e.rotation * 0.8 + sway}deg)`,
            background: '#FBF8F3',
            padding: '11px 11px 38px',
            boxSizing: 'border-box',
            borderRadius: 3,
            boxShadow: `0 ${10 + p.depth * 8}px ${22 + p.depth * 10}px rgba(0,0,0,${0.22 + p.depth * 0.08})`,
            filter: blur ? `blur(${blur}px)` : undefined,
          }}
        >
          <BoardImage src={props.urls.board + encodeURIComponent(p.item.name)} style={{ width: '100%', height: '100%', borderRadius: 1 }} onFail={() => setPicFailed(true)} />
        </div>
      );
    }
    return (
      <div
        key={`w${p.i}`}
        style={{
          position: 'absolute',
          left: p.x,
          top: p.y,
          transform: `translate(-50%, -50%) scale(${p.s})`,
          opacity: p.op,
          fontFamily: hookFont,
          fontStyle: 'italic',
          fontSize: wordSize,
          lineHeight: 1.1,
          letterSpacing: '-0.005em',
          color: CREAM,
          whiteSpace: 'nowrap',
          textShadow:
            '0 0 1px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45), 0 3px 10px rgba(0,0,0,0.35), 0 8px 26px rgba(0,0,0,0.3)',
          filter: blur ? `blur(${blur}px)` : undefined,
          padding: '0 6px',
        }}
      >
        {p.item.text}
      </div>
    );
  };

  // Painter's order: far first.
  const sorted = [...placed].sort((a, b) => a.depth - b.depth);
  const back = sorted.filter((p) => p.depth < 0);
  const front = sorted.filter((p) => p.depth >= 0);

  // A hairline of the ring itself, very faint, so the path reads as a halo.
  const ringOp = 0.22 * interpolate(frame, [6, 20], [0, 1], CLAMP) * o;
  const ring = (half: 'back' | 'front') => (
    <svg width={WIDTH} height={1920} style={{ position: 'absolute', left: 0, top: 0 }}>
      <g transform={`translate(${cx} ${cy}) rotate(${(TILT * 180) / Math.PI})`} opacity={ringOp}>
        <path
          d={half === 'back' ? `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0` : `M ${rx} 0 A ${rx} ${ry} 0 0 1 ${-rx} 0`}
          fill="none"
          stroke={half === 'back' ? CREAM : CREAM}
          strokeWidth={half === 'back' ? 1.5 : 2.5}
          style={{ filter: `drop-shadow(0 1px 2px ${INK})` }}
        />
      </g>
    </svg>
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {hasCutout ? ring('back') : null}
      {back.map(draw)}
      {hasCutout ? <CamPerson e={e} /> : null}
      {ring('front')}
      {front.map(draw)}
    </AbsoluteFill>
  );
};
