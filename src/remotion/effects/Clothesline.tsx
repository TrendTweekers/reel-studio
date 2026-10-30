// The clothesline pull: a rope sags across the frame and 3-4 of her reels hang from it on wooden
// pegs, like clothes on a line. They slide in along the rope and settle with a swing, sway a little,
// then the line is yanked: a small pull back, then everything whips off to the right, each card a
// frame behind the next and swinging back from the pull.
// With the cut-out the rope runs behind her head and the cards hang on both sides of it, the inner
// ones half behind her hair. Without it: if there is room above her head the rope runs there (cards
// drop in instead of sliding past her face, and fade if the yank carries them over it); if not, the
// line hangs lower, across her chest, below her chin.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { clamp, SAFE, SAFE_BOTTOM, SAFE_RIGHT, type TimedEffect } from '../model';
import { CLAMP, lerp } from './anim';
import { CamPerson, useAbsFrame, useHasCutout } from './footage';
import { ClipVideo, REEL_RATIO, useClips } from './reels';

const N = 4;
const SAG = 70; // how much lower the rope hangs in the middle than at the frame edges
const OMEGA = (2 * Math.PI) / 34; // a card swings back and forth in ~1.1 s
const DAMP = 0.09;
const KICK = 0.0016; // how much the line's acceleration swings the cards

// A wooden clothes peg, drawn at its own size (20 x 64), the rope crosses it at y = 22.
const Peg: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <svg width={20} height={64} viewBox="0 0 20 64" style={{ position: 'absolute', left: x - 10, top: y - 22, overflow: 'visible', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <linearGradient id="clPeg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#D9B988" />
        <stop offset="0.5" stopColor="#EAD3AC" />
        <stop offset="1" stopColor="#C4A06D" />
      </linearGradient>
    </defs>
    <rect x={1} y={0} width={8.5} height={64} rx={3.5} fill="url(#clPeg)" />
    <rect x={10.5} y={0} width={8.5} height={64} rx={3.5} fill="url(#clPeg)" />
    <line x1={10} y1={2} x2={10} y2={62} stroke="rgba(90,60,30,0.45)" strokeWidth={1} />
    {/* Grain and the steel spring. */}
    <line x1={4} y1={8} x2={4.6} y2={30} stroke="rgba(120,85,45,0.25)" strokeWidth={0.8} />
    <line x1={15} y1={36} x2={15.5} y2={58} stroke="rgba(120,85,45,0.25)" strokeWidth={0.8} />
    <rect x={0} y={27} width={20} height={5} rx={2} fill="#8D8D8D" />
    <rect x={0} y={27} width={20} height={1.6} rx={0.8} fill="#C8C8C8" />
  </svg>
);

export const Clothesline: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model } = useReel();
  const hasCutout = useHasCutout();
  const abs = useAbsFrame(e);
  const F = e.frames;

  // The line is fixed for the whole effect (a clothesline that drifts looks wrong): her face
  // averaged over the first half second.
  let fx = 0;
  let fy = 0;
  let fw = 0;
  let fh = 0;
  for (let k = 0; k < 15; k++) {
    const r = model.faceRect(clamp(e.from + k, 0, model.total - 1));
    fx += r.x / 15;
    fy += r.y / 15;
    fw += r.w / 15;
    fh += r.h / 15;
  }
  const faceR = fx + fw;
  const chin = fy + fh;

  // ---- Where the line hangs.
  const roomAbove = fy - 30 - SAFE.top >= 70;
  const chestMode = !hasCutout && !roomAbove;
  const ropeMid = hasCutout
    ? clamp(fy + fh * 0.12, SAFE.top + 70, SAFE_BOTTOM - 420) // behind her head, at forehead height
    : chestMode
      ? chin + 60 // across her chest, below her chin
      : fy - 30; // above her head
  const ropeY = (x: number) => ropeMid - SAG * ((x - WIDTH / 2) / (WIDTH / 2 + 80)) ** 2;
  const ropeSlope = (x: number) => (-2 * SAG * (x - WIDTH / 2)) / (WIDTH / 2 + 80) ** 2;

  // ---- The slots. Around her head: as many as fit on each side, inner ones first. Across her
  // chest: evenly spread.
  let CH = clamp(chestMode ? 330 : 300, 200, SAFE_BOTTOM - 40 - ropeMid);
  let slots: number[] = [];
  for (let tries = 0; tries < 6; tries++) {
    const w = CH * REEL_RATIO;
    slots = [];
    if (chestMode) {
      const span = SAFE_RIGHT - SAFE.side - w;
      for (let i = 0; i < N; i++) slots.push(SAFE.side + w / 2 + (span * i) / (N - 1));
      break;
    }
    const gap = hasCutout ? 0 : 26; // with the cut-out the inner cards tuck a little behind her hair
    const right: number[] = [];
    const left: number[] = [];
    for (let x = faceR + gap + w / 2; x + w / 2 <= SAFE_RIGHT; x += w + 26) right.push(x);
    for (let x = fx - gap - w / 2; x - w / 2 >= SAFE.side; x -= w + 26) left.push(x);
    for (let j = 0; slots.length < N && (j < right.length || j < left.length); j++) {
      if (j < right.length) slots.push(right[j]);
      if (j < left.length && slots.length < N) slots.push(left[j]);
    }
    if (slots.length >= 3) break;
    CH *= 0.88;
  }
  slots.sort((a, b) => a - b);
  const CW = CH * REEL_RATIO;
  const clips = useClips(e, slots.length);

  // ---- The line's motion along the rope (px, + = right). In: slides in from the left and stops
  // softly. Out: a small pull back, then a fast yank off to the right.
  const slideIn = !(!hasCutout && !chestMode); // above her head without a cut-out: drop in instead
  const yankAt = F - 26;
  const lineX = (t: number) => {
    const inn = slideIn ? spring({ frame: t, fps: FPS, config: { damping: 18, stiffness: 70, mass: 1 }, durationInFrames: 30 }) : 1;
    const back = interpolate(t, [yankAt, yankAt + 6, yankAt + 9], [0, -34, -30], CLAMP);
    const u = Math.max(0, t - (yankAt + 8));
    return lerp(inn, -(WIDTH + 200), 0) + back + 11 * u * u;
  };

  // Each card follows the line a frame or two late (the rope stretches), the right one leading.
  const lagOf = (i: number) => (slots.length - 1 - i) * 1.4;
  const cards = clips.map((clip, i) => {
    const lag = lagOf(i);
    // Swing: a damped pendulum pushed by the line's acceleration, integrated from the start.
    let th = 0;
    let om = 0;
    for (let t = 1; t <= frame; t++) {
      const acc = lineX(t - lag + 1) - 2 * lineX(t - lag) + lineX(t - lag - 1);
      om += -OMEGA * OMEGA * th - DAMP * om - KICK * clamp(acc, -40, 40);
      th += om;
    }
    const x = slots[i] + lineX(frame - lag);
    // Dropping in (above her head without a cut-out): from above the frame, one by one.
    const drop = slideIn ? 1 : spring({ frame: frame - 4 - i * 4, fps: FPS, config: { damping: 12, stiffness: 120, mass: 0.7 } });
    const y = ropeY(x) - (1 - drop) * (ropeMid + 200);
    const slope = (Math.atan(ropeSlope(x)) * 180) / Math.PI;
    // Soft limit: the swing never goes past ~12 degrees, however hard the pull (tasteful, not cartoonish).
    const swingDeg = 12 * Math.tanh((th * 180) / Math.PI / 12) + Math.sin((frame + i * 23) / 21) * 1.2 + slope * 0.6;
    let op = 1;
    if (!hasCutout && !chestMode) {
      // Above her head without a cut-out, the yank can carry a card over her face: fade it there.
      const raw = model.faceRect(clamp(abs, 0, model.total - 1));
      const dx = Math.abs(x - (raw.x + raw.w / 2)) - raw.w / 2 - CW / 2;
      op = interpolate(dx, [-10, 50], [0, 1], CLAMP);
    }
    // When the line moves fast, a little motion blur.
    const v = Math.abs(lineX(frame - lag) - lineX(frame - lag - 1));
    const blur = clamp((v - 14) / 10, 0, 6);
    const onScreen = (t: number) => {
      const xt = slots[i] + lineX(t - lag);
      return xt + CW / 2 + 40 > 0 && xt - CW / 2 - 40 < WIDTH;
    };
    // The video starts on the frame the card first shows.
    let start = slideIn ? 0 : 4 + i * 4;
    while (slideIn && start < F && !onScreen(start)) start++;
    return { clip, i, x, y, swingDeg, op, blur, visible: onScreen(frame), start };
  });

  // The rope draws in from the left, then fades once the cards are gone.
  const ropeIn = interpolate(frame, [0, 10], [0, 1], CLAMP);
  const ropeOp = interpolate(frame, [F - 12, F - 2], [1, 0], CLAMP);
  // The twist: short slanted strands along the rope, travelling with the line.
  const STRAND = 7;
  const twist = ((lineX(frame) % STRAND) + STRAND) % STRAND;
  const strands: React.ReactNode[] = [];
  for (let x = -80 + twist; x < WIDTH + 80; x += STRAND) {
    const y = ropeY(x);
    strands.push(<line key={x} x1={x - 2.6} y1={y + 3} x2={x + 2.6} y2={y - 3} stroke="#9F8865" strokeWidth={1.7} strokeLinecap="round" />);
  }
  const ropePath = `M -80 ${ropeY(-80)} Q ${WIDTH / 2} ${2 * ropeMid - (ropeY(-80) + ropeY(WIDTH + 80)) / 2} ${WIDTH + 80} ${ropeY(WIDTH + 80)}`;
  const rope = (
    <svg width={WIDTH} height={1920} style={{ position: 'absolute', left: 0, top: 0, opacity: ropeOp, overflow: 'visible' }}>
      <g style={{ clipPath: `inset(0 ${(1 - ropeIn) * 100}% 0 0)` }}>
        <path d={ropePath} transform="translate(0 4)" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={6} style={{ filter: 'blur(3px)' }} />
        <path d={ropePath} fill="none" stroke="#CBB898" strokeWidth={7} strokeLinecap="round" />
        {strands}
        <path d={ropePath} transform="translate(0 -2)" fill="none" stroke="rgba(255,250,240,0.45)" strokeWidth={1.2} />
      </g>
    </svg>
  );

  const drawCard = (c: (typeof cards)[number]) =>
    c.visible && c.op > 0.01 ? (
      <div
        key={c.clip.key}
        style={{
          position: 'absolute',
          left: c.x - CW / 2,
          top: c.y - 6,
          width: CW,
          height: CH + 6,
          transformOrigin: '50% 6px',
          transform: `rotate(${c.swingDeg}deg)`,
          opacity: c.op,
          filter: c.blur > 0.3 ? `blur(${c.blur}px)` : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 6,
            width: CW,
            height: CH,
            borderRadius: 4,
            padding: 6,
            boxSizing: 'border-box',
            background: '#FBF8F3',
            boxShadow: '0 14px 26px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          <ClipVideo clip={c.clip} delay={c.start} style={{ width: '100%', height: '100%', borderRadius: 2 }} />
        </div>
        <Peg x={CW * 0.22} y={6} />
        <Peg x={CW * 0.78} y={6} />
      </div>
    ) : null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {rope}
      {cards.map(drawCard)}
      {hasCutout ? <CamPerson e={e} /> : null}
    </AbsoluteFill>
  );
};
