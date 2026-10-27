// GREEN SCREEN: she stands in front of the board picture e.image instead of her room. The picture
// is cover-fit with a slow Ken Burns drift, and it fades in / out over ~8 frames over the room.
// Her edge gets a soft light wrap (the picture's light spilling round her outline) and a cleaned
// matte, so she sits IN the picture rather than pasted on it.
// No picture: a cream studio backdrop (a seamless paper sweep) instead.
// No cut-out: the video stays as it is and the picture shows as a small framed card beside her head.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { SAFE, SAFE_BOTTOM, overlaps, rightLimit, type Rect, type TimedEffect } from '../model';
import { popIn, outro } from './anim';
import { PRINT_WHITE, PaperTexture, SceneCamera, SceneGrade, useBoardImage } from './FrameBreak';
import { Footage, Person, useHasCutout } from './footage';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const FADE = 8;

// A cream seamless backdrop: lighter in the middle, a soft floor shade low down.
const Studio: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill>
    <PaperTexture id={id} tone="#EEE6DA" />
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 70% 45% at 50% 38%, rgba(255,251,244,0.55) 0%, rgba(255,251,244,0) 70%), linear-gradient(to bottom, rgba(0,0,0,0) 62%, rgba(90,66,44,0.16) 100%)',
      }}
    />
  </AbsoluteFill>
);

// Fallback without a cut-out: the picture as a framed card beside her head (never on it).
const Card: React.FC<{ e: TimedEffect; src: string; onError: () => void }> = ({ e, src, onError }) => {
  const frame = useCurrentFrame();
  const { model } = useReel();
  const head = model.headSpan(e.from, e.from + e.frames);
  const w = 300;
  const h = 390;
  const sides = e.side === 'left' ? (['left', 'right'] as const) : (['right', 'left'] as const);
  const ys = [SAFE.top + 40, head.y + head.h + 40, 700];
  let rect: Rect | null = null;
  for (const y of ys)
    for (const s of sides) {
      const x = s === 'right' ? rightLimit(y, h) - 20 - w : SAFE.side + 20;
      const r = { x, y, w, h };
      if (!rect && y + h <= SAFE_BOTTOM - 120 && !overlaps(r, head, 24)) rect = r;
    }
  if (!rect) return null;
  const p = popIn(frame);
  const o = outro(frame, e.frames, 8);
  const rot = e.rotation * 0.6 + (1 - p) * (e.rotation > 0 ? 8 : -8);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          padding: 14,
          boxSizing: 'border-box',
          background: PRINT_WHITE,
          borderRadius: 4,
          opacity: Math.min(1, p * 2) * o,
          transform: `rotate(${rot}deg) scale(${interpolate(p, [0, 1], [0.4, 1]) * interpolate(o, [0, 1], [0.8, 1])})`,
          boxShadow: '0 22px 44px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.16)',
        }}
      >
        <Img src={src} onError={onError} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    </AbsoluteFill>
  );
};

export const GreenScreen: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const hasCutout = useHasCutout();
  const img = useBoardImage(e.image);
  const id = `greenscreen-${e.id}`;

  if (!hasCutout) return img.src ? <Card e={e} src={img.src} onError={img.onError} /> : null;

  const fade = Math.min(FADE, Math.floor(e.frames / 3));
  const a =
    interpolate(frame, [0, fade], [0, 1], { ...CL, easing: Easing.inOut(Easing.quad) }) *
    interpolate(frame, [e.frames - fade, e.frames - 1], [1, 0], { ...CL, easing: Easing.inOut(Easing.quad) });
  // Ken Burns: a slow push and a small drift across the whole effect.
  const life = interpolate(frame, [0, Math.max(1, e.frames - 1)], [0, 1], CL);
  const kb = 1.04 + 0.07 * life;
  const drift = (e.rotation >= 0 ? 1 : -1) * 18 * (life - 0.5);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {/* her room underneath, so the fade starts and ends on the normal video */}
      <SceneCamera e={e}>
        <Footage e={e} />
      </SceneCamera>
      <AbsoluteFill style={{ opacity: a }}>
        {img.src ? (
          <AbsoluteFill style={{ overflow: 'hidden', background: '#EEE6DA' }}>
            <Img
              src={img.src}
              onError={img.onError}
              style={{
                width: WIDTH,
                height: HEIGHT,
                objectFit: 'cover',
                transformOrigin: '50% 40%',
                transform: `translateX(${drift}px) scale(${kb})`,
              }}
            />
            {/* a hint of depth: the picture slightly softer and darker at the edges */}
            <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 65% at 50% 42%, rgba(0,0,0,0) 55%, rgba(30,22,14,0.18) 100%)' }} />
          </AbsoluteFill>
        ) : (
          <Studio id={id} />
        )}
      </AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={`${id}-wrap`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* clean matte: drop the faint fringe of room pixels round her */}
          <feComponentTransfer in="SourceAlpha" result="hard">
            <feFuncA type="linear" slope={2.5} intercept={-0.9} />
          </feComponentTransfer>
          <feGaussianBlur in="hard" stdDeviation={0.8} result="matte" />
          <feComposite in="SourceGraphic" in2="matte" operator="in" result="her" />
          {/* light wrap: a soft warm band just inside her outline */}
          <feMorphology in="hard" operator="erode" radius={7} result="inner" />
          <feComposite in="hard" in2="inner" operator="out" result="rim" />
          <feGaussianBlur in="rim" stdDeviation={5} result="rimSoft" />
          <feFlood floodColor="#FFF4E4" floodOpacity={0.42 * a} />
          <feComposite in2="rimSoft" operator="in" result="glow" />
          <feComposite in="glow" in2="matte" operator="in" result="wrap" />
          <feMerge>
            <feMergeNode in="her" />
            <feMergeNode in="wrap" />
          </feMerge>
        </filter>
      </svg>
      {/* her on top (only once the picture is coming in; under it she IS the room video) */}
      {a > 0.01 ? (
        <AbsoluteFill style={{ filter: `url(#${id}-wrap) drop-shadow(0 ${12 * a}px ${30 * a}px rgba(40,28,16,${0.22 * a}))` }}>
          <SceneCamera e={e} style={{ filter: `brightness(${1 + 0.03 * a}) saturate(${1 - 0.05 * a})` }}>
            <Person e={e} />
          </SceneCamera>
        </AbsoluteFill>
      ) : null}
      <SceneGrade />
    </AbsoluteFill>
  );
};
