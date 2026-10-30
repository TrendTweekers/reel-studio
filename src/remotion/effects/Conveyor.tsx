// The factory line: a dark conveyor belt runs across the frame behind her at shoulder height, and
// her reels stand on it and ride from left to right in a steady stream (6 cards on a loop, at most
// 5 on screen). The belt ribs and the rollers move at exactly the speed of the cards.
// In: the belt draws itself in from the left and the cards stand up one by one. Out: the line
// speeds up and the belt wipes away to the right.
// With the cut-out the belt sits just under her chin, so the cards pass behind her head and neck.
// Without it the belt goes lower (her chest), so no card ever reaches her face.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { clamp, SAFE, SAFE_BOTTOM, type TimedEffect } from '../model';
import { CLAMP, easeIn, outro } from './anim';
import { CamPerson, useHasCutout } from './footage';
import { ClipVideo, REEL_RATIO, useClips } from './reels';

const N = 6;
const TOP_D = 26; // belt top surface, seen from a little above
const FRONT_D = 34; // belt front side with the rollers
const RIB = 34; // distance between the belt's ribs
const ROLLER = 108; // distance between rollers
const SPEED = 7; // px per frame (210 px/s)

export const Conveyor: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const hasCutout = useHasCutout();
  const clips = useClips(e, N);
  // The belt height is fixed for the whole effect (a belt that drifts would look broken): her face
  // averaged over the whole effect, so a step closer half-way does not hide the line.
  const { model } = useReel();
  let fy = 0;
  let fh = 0;
  const steps = Math.max(1, Math.ceil(e.frames / 3));
  for (let k = 0; k < steps; k++) {
    const r = model.faceRect(clamp(e.from + k * 3, 0, model.total - 1));
    fy += r.y / steps;
    fh += r.h / steps;
  }

  // ---- Sizes. The card height is what fits between the safe top and the belt.
  const chin = fy + fh;
  const want = 320;
  let beltY: number; // top edge of the belt's top surface
  let CH: number;
  if (hasCutout) {
    // Just under her chin: the cards stand beside her head, where the room shows. Lower (on her
    // shoulders) her body hides the whole line as soon as she stands close to the camera.
    beltY = clamp(chin + fh * 0.18, SAFE.top + 260, SAFE_BOTTOM - 200);
    CH = clamp(beltY + TOP_D / 2 - SAFE.top - 12, 220, want);
  } else {
    CH = want;
    beltY = clamp(chin + 28 + CH - TOP_D / 2, SAFE.top + 260, SAFE_BOTTOM - 200);
  }
  const CW = CH * REEL_RATIO;
  const SP = Math.max(CW + 70, (WIDTH + CW) / 4.6); // spacing: never more than 5 cards on screen
  const LOOP = N * SP;
  const stand = beltY + TOP_D * 0.55; // where a card's bottom touches the belt

  // ---- Motion. The line runs at a steady speed and speeds up at the end.
  const F = e.frames;
  const boostFrom = F - 16;
  const travel = (t: number) => SPEED * t + 2.4 * Math.max(0, t - boostFrom) ** 2;
  const pos = travel(frame);
  const wipeIn = easeIn(frame, 0, 16);
  const wipeOut = interpolate(frame, [F - 12, F], [0, 1], CLAMP);
  const o = outro(frame, F, 10);

  const xOf = (i: number, p: number) => {
    const x = i * SP + p + CW; // card centre before wrapping
    return ((((x + CW) % LOOP) + LOOP) % LOOP) - CW; // wraps at the left, off screen
  };
  const onScreen = (x: number) => x + CW / 2 > 0 && x - CW / 2 < WIDTH;
  // First frame each card is on screen: its video starts there.
  const firstSeen = clips.map((_, i) => {
    for (let f = 0; f < F; f++) if (onScreen(xOf(i, travel(f)))) return f;
    return F;
  });

  // ---- The belt.
  const belt = () => {
    const ribOff = ((pos % RIB) + RIB) % RIB;
    const ribs: React.ReactNode[] = [];
    for (let x = -RIB + ribOff; x < WIDTH + RIB; x += RIB) {
      // Slight perspective: the far end of each rib leans toward the middle of the frame.
      const lean = (x - WIDTH / 2) * 0.035;
      ribs.push(<line key={x} x1={x} y1={beltY + TOP_D} x2={x - lean} y2={beltY} stroke="rgba(255,255,255,0.07)" strokeWidth={2} />);
    }
    const rollers: React.ReactNode[] = [];
    const ry = beltY + TOP_D + FRONT_D / 2;
    const rr = FRONT_D / 2 - 5;
    const rollOff = ((pos % ROLLER) + ROLLER) % ROLLER;
    const ang = (pos / rr) * (180 / Math.PI); // rolls without slipping
    for (let x = -ROLLER + rollOff + ROLLER / 2; x < WIDTH + ROLLER; x += ROLLER) {
      rollers.push(
        <g key={x} transform={`translate(${x} ${ry})`}>
          <circle r={rr} fill="#2B2825" stroke="#4A4540" strokeWidth={1.5} />
          <g transform={`rotate(${ang})`}>
            <line x1={-rr + 3} y1={0} x2={rr - 3} y2={0} stroke="#6A635B" strokeWidth={2} />
            <line x1={0} y1={-rr + 3} x2={0} y2={rr - 3} stroke="#6A635B" strokeWidth={2} />
          </g>
          <circle r={3} fill="#8A8278" />
        </g>
      );
    }
    return (
      <svg width={WIDTH} height={1920} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <linearGradient id="cvTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24211E" />
            <stop offset="1" stopColor="#151311" />
          </linearGradient>
          <linearGradient id="cvFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B1917" />
            <stop offset="1" stopColor="#0E0D0C" />
          </linearGradient>
          <linearGradient id="cvShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,0.32)" />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        {/* Soft shadow under the belt. */}
        <rect x={0} y={beltY + TOP_D + FRONT_D} width={WIDTH} height={46} fill="url(#cvShadow)" />
        <rect x={0} y={beltY} width={WIDTH} height={TOP_D} fill="url(#cvTop)" />
        {ribs}
        {/* A thin highlight on the far edge and a metal rail on the front. */}
        <line x1={0} y1={beltY + 0.5} x2={WIDTH} y2={beltY + 0.5} stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} />
        <rect x={0} y={beltY + TOP_D} width={WIDTH} height={FRONT_D} fill="url(#cvFront)" />
        <rect x={0} y={beltY + TOP_D} width={WIDTH} height={3} fill="#5A544D" />
        {rollers}
        <rect x={0} y={beltY + TOP_D + FRONT_D - 3} width={WIDTH} height={3} fill="#3A3632" />
      </svg>
    );
  };

  const cards = clips.map((clip, i) => {
    const x = xOf(i, pos);
    if (!onScreen(x)) return null;
    // Cards on screen at the start stand up one by one, left to right (as the belt draws in).
    // Cards that arrive later come in already standing.
    const delay = 6 + clamp(x / WIDTH, 0, 1) * 14;
    const up = firstSeen[i] === 0 ? spring({ frame: frame - delay, fps: FPS, config: { damping: 14, stiffness: 120, mass: 0.7 } }) : 1;
    if (up <= 0.001) return null;
    // A tiny rock, as if the belt were not perfectly smooth.
    const rock = Math.sin((pos + i * 57) / 46) * 0.8;
    return (
      <React.Fragment key={clip.key}>
        <div
          style={{
            position: 'absolute',
            left: x - CW * 0.55,
            top: stand - 9,
            width: CW * 1.1,
            height: 18,
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            opacity: Math.min(1, up),
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: x - CW / 2,
            top: stand - CH,
            width: CW,
            height: CH,
            transformOrigin: '50% 100%',
            transform: `rotate(${rock}deg) scaleY(${up})`,
            borderRadius: CW * 0.08,
            padding: 5,
            boxSizing: 'border-box',
            background: '#FBF8F3',
            boxShadow: '0 12px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          <ClipVideo clip={clip} delay={firstSeen[i]} style={{ width: '100%', height: '100%', borderRadius: CW * 0.08 - 4 }} />
        </div>
      </React.Fragment>
    );
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          opacity: o,
          clipPath: `inset(0 ${(1 - wipeIn) * 100}% 0 ${wipeOut * 100}%)`,
        }}
      >
        {belt()}
        {cards}
      </AbsoluteFill>
      {hasCutout ? <CamPerson e={e} /> : null}
    </AbsoluteFill>
  );
};
