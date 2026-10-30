// The envelope tumble: a cream envelope flips in (two half turns, like a letter thrown on a table),
// lands beside her head, the flap opens and 4 of her reels rise out of it one by one and fan out
// like a hand of cards. At the end the whole envelope flies off to its side.
// Her head usually fills the top of the frame, so there is no room above it: the envelope goes on
// the roomier side of her head. With the cut-out it tucks a little BEHIND her hair (back panel +
// open flap, cards, front pocket, then her cut-out). Without it, it stays fully clear of her face
// and the fan leans away from her.
// Everything (envelope + cards) is one rig that moves together, in envelope coordinates; the cards
// sit between the back panel and the front pocket, clipped at the envelope's bottom edge, so they
// really come out of it.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { clamp, SAFE, SAFE_BOTTOM, SAFE_RIGHT, type Rect, type TimedEffect } from '../model';
import { CLAMP, easeIn, lerp, outro } from './anim';
import { CamPerson, useAbsFrame, useHasCutout } from './footage';
import { ClipVideo, REEL_RATIO, useClips } from './reels';

const N = 4;
const V = 0.56; // depth of the pocket's V notch, as a part of the height
const SEAT = 0.62; // a card's bottom rests this deep in the envelope (just below the V)

const PAPER = '#F4ECDF';
const PAPER_DARK = '#E5D9C5'; // the inside of the envelope
const FLAP_OUT = '#EEE4D2';

// Weighted average of the face over the last 10 frames: no jitter, cuts are softened.
const useSmoothFace = (e: TimedEffect): Rect => {
  const { model } = useReel();
  const abs = useAbsFrame(e);
  let fx = 0;
  let fy = 0;
  let fw = 0;
  let fh = 0;
  let wsum = 0;
  for (let k = 0; k < 10; k++) {
    const r = model.faceRect(clamp(abs - k, 0, model.total - 1));
    const wt = 1 - k / 10;
    fx += (r.x + r.w / 2) * wt;
    fy += (r.y + r.h / 2) * wt;
    fw += r.w * wt;
    fh += r.h * wt;
    wsum += wt;
  }
  return { x: fx / wsum - fw / wsum / 2, y: fy / wsum - fh / wsum / 2, w: fw / wsum, h: fh / wsum };
};

export const Envelope: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props } = useReel();
  const hasCutout = useHasCutout();
  const face = useSmoothFace(e);
  const clips = useClips(e, N);
  const accent = props.edit.style.accentColor || '#B08D57';

  // Short effects squeeze the timeline; long ones just hold longer.
  const k = Math.min(1, e.frames / 90);
  const T = (f: number) => f * k;
  const o = outro(frame, e.frames, 16);

  // ---- Size and side: the roomier side of her head.
  const faceR = face.x + face.w;
  const roomL = face.x - SAFE.side;
  const roomR = SAFE_RIGHT - faceR;
  const s = roomR >= roomL ? 1 : -1; // +1 = right of her
  const room = Math.max(roomL, roomR);
  const W = clamp(room * (hasCutout ? 1.1 : 0.95), 300, 460);
  const H = W * 0.63;
  const FLAP = 0.5 * H;
  const CH = W * 0.72; // card
  const CW = CH * REEL_RATIO;

  // The fan, in envelope coordinates: cards turn around a point low in the envelope. Without a
  // cut-out it leans away from her face.
  const P = { x: W / 2, y: H * 0.78 };
  const R = CH / 2 + (P.y - H * SEAT); // pivot to card centre
  const fanDeg = (hasCutout ? [-27, -9, 9, 27] : [-8, 7, 21, 35]).map((a) => a * s);
  const corners = (a: number) => {
    const r = (a * Math.PI) / 180;
    const cx = P.x + Math.sin(r) * R;
    const cy = P.y - Math.cos(r) * R;
    return [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([u, v]) => ({
      x: cx + (u * CW) / 2 * Math.cos(r) - (v * CH) / 2 * Math.sin(r),
      y: cy + (u * CW) / 2 * Math.sin(r) + (v * CH) / 2 * Math.cos(r),
    }));
  };
  const pts = fanDeg.flatMap(corners);
  const fanTop = Math.min(-FLAP, ...pts.map((p) => p.y)); // highest point of the rig, rel. to its top
  const fanInner = s > 0 ? Math.min(0, ...pts.map((p) => p.x)) : Math.max(W, ...pts.map((p) => p.x)); // edge nearest her face

  // ---- Where it lands. With the cut-out: its inner corner tucked behind her hair (the face box is
  // narrower than her hair). Without: clear of her face, fan included.
  const tuck = hasCutout ? 0.14 * W - face.w * 0.12 : -(24 + (s > 0 ? -fanInner : fanInner - W));
  const exPref = s > 0 ? faceR - tuck + W / 2 : face.x + tuck - W / 2;
  const ex = clamp(exPref, SAFE.side + W / 2, SAFE_RIGHT - W / 2);
  const eyPref = face.y + face.h * 0.95; // around her chin: the top of the frame beside her head is free
  const ey = clamp(eyPref, SAFE.top + 8 - fanTop + H / 2, SAFE_BOTTOM - H / 2);
  const TILT = 3 * s; // lands a little crooked, leaning away from her

  // ---- The tumble: an arc in from the top corner on its side, spinning and flipping, settling
  // with a soft overshoot. The exit: off to its side, turning, smaller.
  const land = spring({ frame, fps: FPS, config: { damping: 15, stiffness: 80, mass: 0.9 }, durationInFrames: T(26) });
  const lin = Math.min(1, land);
  const away = 1 - o;
  const px = lerp(lin, s > 0 ? WIDTH + W * 0.6 : -W * 0.6, ex) + s * away * (W + 120);
  const py = lerp(lin, SAFE.top - 240, ey) - Math.sin(Math.PI * lin) * 110 - away * 60;
  const rz = lerp(land, s * 170, TILT) + s * away * 18;
  const flipY = Math.cos(lerp(lin, -2 * Math.PI, 0)); // two half turns: the plain side shows on the way
  const plainSide = flipY < 0;
  const sc = lerp(lin, 0.6, 1) * lerp(away, 1, 0.85);
  const op = interpolate(frame, [0, 5], [0, 1], CLAMP) * interpolate(away, [0.4, 1], [1, 0], CLAMP);

  // ---- The flap: +1 closed (points down over the pocket), -1 open (points up, behind the cards).
  const fo = easeIn(frame, T(20), T(12));
  const f = lerp(fo, 1, -1);
  const tip = FLAP * f;
  const flapPath = `M 0 0 L ${W} 0 L ${W / 2 + 22} ${tip - 9 * Math.sign(f)} Q ${W / 2} ${tip} ${W / 2 - 22} ${tip - 9 * Math.sign(f)} Z`;

  const svg = (children: React.ReactNode, shadow: string) => (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: `drop-shadow(${shadow})` }}
    >
      {children}
    </svg>
  );

  const back = plainSide
    ? // The address side: plain paper with a hairline frame.
      svg(
        <>
          <rect x={0} y={0} width={W} height={H} rx={6} fill={PAPER} />
          <rect x={16} y={16} width={W - 32} height={H - 32} rx={3} fill="none" stroke="rgba(20,18,16,0.12)" strokeWidth={1.5} />
        </>,
        '0 16px 26px rgba(0,0,0,0.28)'
      )
    : svg(
        <>
          <defs>
            <linearGradient id="envInside" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
          </defs>
          {f < 0 ? <path d={flapPath} fill={PAPER_DARK} stroke="rgba(20,18,16,0.10)" strokeWidth={1} /> : null}
          <rect x={0} y={0} width={W} height={H} rx={6} fill={PAPER_DARK} />
          {/* A soft shadow inside, at the opening, so the pocket reads as deep. */}
          <rect x={0} y={0} width={W} height={H * 0.5} rx={6} fill="url(#envInside)" />
        </>,
        '0 18px 30px rgba(0,0,0,0.30)'
      );

  const front = plainSide
    ? null
    : svg(
        <>
          <defs>
            <linearGradient id="envPocket" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F9F4EA" />
              <stop offset="1" stopColor={PAPER} />
            </linearGradient>
            <radialGradient id="envSeal" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="0.55" stopColor="rgba(0,0,0,0.06)" />
              <stop offset="1" stopColor="rgba(0,0,0,0.40)" />
            </radialGradient>
          </defs>
          <path d={`M 0 3 L ${W / 2} ${H * V} L ${W} 3 L ${W} ${H - 6} Q ${W} ${H} ${W - 6} ${H} L 6 ${H} Q 0 ${H} 0 ${H - 6} Z`} fill="url(#envPocket)" />
          {/* Fold lines of the side and bottom flaps. */}
          <path d={`M 0 ${H} L ${W * 0.4} ${H * 0.64} M ${W} ${H} L ${W * 0.6} ${H * 0.64}`} stroke="rgba(20,18,16,0.10)" strokeWidth={1.5} fill="none" />
          <path d={`M 0 3 L ${W / 2} ${H * V} L ${W} 3`} stroke="rgba(20,18,16,0.15)" strokeWidth={1.5} fill="none" />
          {f > 0 ? (
            <>
              <path d={flapPath} fill={FLAP_OUT} stroke="rgba(20,18,16,0.13)" strokeWidth={1.5} />
              {/* Wax seal on the flap tip, in her accent colour. It turns with the flap. */}
              <g transform={`translate(${W / 2} ${tip - 22 * f}) scale(1 ${f})`} opacity={interpolate(f, [0.3, 0.7], [0, 1], CLAMP)}>
                <circle r={W * 0.055} fill={accent} />
                <circle r={W * 0.055} fill="url(#envSeal)" />
                <circle r={W * 0.034} fill="none" stroke="rgba(0,0,0,0.24)" strokeWidth={2} />
                <circle r={W * 0.034} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} transform="translate(-1 -1)" />
              </g>
            </>
          ) : null}
        </>,
        '0 3px 6px rgba(0,0,0,0.14)'
      );

  // ---- The cards: each rises straight out of the pocket, then swings to its place in the fan
  // and sways a little.
  const cards = plainSide
    ? []
    : clips.map((clip, i) => {
        const start = T(30 + i * 7);
        const rise = easeIn(frame, start, T(11));
        const fan = spring({ frame: frame - start - T(7), fps: FPS, config: { damping: 13, stiffness: 90, mass: 0.8 } });
        const a = ((fanDeg[i] * fan + Math.sin((frame - start) / 17 + i * 1.9) * 1.3 * Math.min(1, fan)) * Math.PI) / 180;
        const drop = (1 - rise) * CH; // hidden in the pocket before it rises
        const cx = P.x + Math.sin(a) * R;
        const cy = P.y - Math.cos(a) * R + drop;
        return frame < start ? null : (
          <div
            key={clip.key}
            style={{
              position: 'absolute',
              left: cx - CW / 2,
              top: cy - CH / 2,
              width: CW,
              height: CH,
              transform: `rotate(${a}rad)`,
              borderRadius: CW * 0.09,
              padding: 5,
              boxSizing: 'border-box',
              background: '#FBF8F3',
              boxShadow: '0 10px 22px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.12)',
            }}
          >
            <ClipVideo clip={clip} delay={start} style={{ width: '100%', height: '100%', borderRadius: CW * 0.09 - 4 }} />
          </div>
        );
      });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: px - W / 2,
          top: py - H / 2,
          width: W,
          height: H,
          opacity: op,
          transform: `rotate(${rz}deg) scale(${sc}, ${sc * Math.max(0.03, Math.abs(flipY))})`,
        }}
      >
        {back}
        {/* Cards are cut at the envelope's bottom edge, so they can wait inside it. */}
        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(-2000px -2000px 8px -2000px)' }}>{cards}</div>
        {front}
      </div>
      {hasCutout ? <CamPerson e={e} /> : null}
    </AbsoluteFill>
  );
};
