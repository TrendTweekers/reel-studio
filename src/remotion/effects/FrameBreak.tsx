// FRAME BREAK: her video shrinks into a framed print on a backdrop, and she steps OUT of it: her
// body stays inside the print, her head and shoulders stand over the top edge at full size.
// In: the print shrinks from full screen (spring, ~0.4 s). Out: it grows back to full screen.
// Backdrop: the board picture e.image (if given), else a blurred, darkened copy of her room.
// Without a cut-out: the same framed print, but nobody steps out of it.
//
// This file also holds the small helpers the other scenes share (camera, median face, backdrops).
import React, { useMemo, useState } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { SAFE, SAFE_BOTTOM, clamp, type Rect, type TimedEffect } from '../model';
import { Grade, footageFilterFor } from '../parts/Vibe';
import { Footage, Person, useAbsFrame, useBoardUrl, useHasCutout } from './footage';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const PRINT_WHITE = '#FBF8F3';

// ---------- shared scene helpers ----------

// The same jump-cut / zoom camera and colour filter as the main video, so a scene that starts or
// ends at full screen matches the base video pixel for pixel (and useFace() boxes line up).
export const SceneCamera: React.FC<{ e: TimedEffect; children: React.ReactNode; style?: React.CSSProperties }> = ({
  e,
  children,
  style,
}) => {
  const { model, props } = useReel();
  const [outer, inner] = model.camera(useAbsFrame(e));
  // `style` (clip-path, overflow, opacity) goes on an untransformed wrapper, so a clip stays in
  // screen pixels while the camera zooms inside it.
  return (
    <AbsoluteFill style={style}>
      <AbsoluteFill
        style={{
          transformOrigin: `${outer.ox}px ${outer.oy}px`,
          transform: outer.s === 1 ? undefined : `scale(${outer.s})`,
          filter: footageFilterFor(props.edit),
        }}
      >
        <AbsoluteFill
          style={{ transformOrigin: `${inner.ox}px ${inner.oy}px`, transform: inner.s === 1 ? undefined : `scale(${inner.s})` }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// The vibe's grade (glow haze / warm film wash). The base video gets it under the scenes, so a scene
// that redraws the footage puts it back on top to stay seamless.
export const SceneGrade = Grade;

// Her face box over the whole effect (median of samples): steady, and not fooled by one stale sample.
export const useMedianFace = (e: TimedEffect): Rect => {
  const { model } = useReel();
  return useMemo(() => {
    const samples: Rect[] = [];
    const end = Math.min(e.from + e.frames, model.total) - 1;
    for (let f = e.from; f <= Math.max(e.from, end); f += 3) samples.push(model.faceRect(f));
    const med = (k: keyof Rect) => samples.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    return { x: med('x'), y: med('y'), w: med('w'), h: med('h') };
  }, [model, e.from, e.frames]);
};

// 0 -> 1 progress of a scene: a spring in over `inLen` frames, an eased return over the last `outLen`.
export const sceneProgress = (frame: number, frames: number, inLen: number, outLen: number, overshoot = true) => {
  const iL = Math.max(3, Math.min(inLen, Math.floor(frames / 3)));
  const oL = Math.max(3, Math.min(outLen, Math.floor(frames / 3)));
  const inn = spring({
    frame,
    fps: FPS,
    config: overshoot ? { damping: 15, stiffness: 150, mass: 0.7 } : { damping: 200 },
    durationInFrames: iL,
  });
  const out = interpolate(frame, [frames - oL, frames - 1], [1, 0], { ...CL, easing: Easing.inOut(Easing.cubic) });
  return inn * out;
};

// A board picture that reports a failed load (then the caller falls back, never a blank card).
export const useBoardImage = (name?: string) => {
  const board = useBoardUrl();
  const [failed, setFailed] = useState(false);
  const src = failed ? null : board(name);
  return { src, onError: () => setFailed(true) };
};

// Fine paper: warm cream with soft mottling and a fine tooth. Static (paper does not boil).
// Drawn at half size and scaled up, so the noise costs a quarter.
export const PaperTexture: React.FC<{ tone?: string; id: string }> = ({ tone = '#EFE7DB', id }) => (
  <AbsoluteFill style={{ background: tone }}>
    <svg
      width={WIDTH / 2}
      height={HEIGHT / 2}
      viewBox={`0 0 ${WIDTH / 2} ${HEIGHT / 2}`}
      style={{ position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT }}
    >
      <filter id={`${id}-mottle`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves={3} seed={7} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.25  0 0 0 -1.6 1.05" />
      </filter>
      <filter id={`${id}-tooth`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 -2.2 1.25" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id}-mottle)`} opacity={0.22} />
      <rect width="100%" height="100%" filter={`url(#${id}-tooth)`} opacity={0.32} />
    </svg>
    {/* soft light from the top, a touch darker at the edges, like a sheet on a table */}
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 85% 70% at 50% 35%, rgba(255,252,246,0.35) 0%, rgba(255,252,246,0) 60%, rgba(70,50,30,0.10) 100%)',
      }}
    />
  </AbsoluteFill>
);

// The room as a backdrop: a quarter-size copy, blurred, then scaled up 4x (a blur on 1080x1920 is
// expensive; on 270x480 it is cheap and looks the same once scaled).
export const QuarterBlurRoom: React.FC<{ e: TimedEffect; dim?: number }> = ({ e, dim = 0.42 }) => (
  <AbsoluteFill style={{ overflow: 'hidden', background: '#1d1a17' }}>
    <div style={{ position: 'absolute', inset: 0, transformOrigin: '50% 50%', transform: 'scale(1.15)' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: WIDTH / 4,
          height: HEIGHT / 4,
          overflow: 'hidden',
          transformOrigin: '0 0',
          transform: 'scale(4)',
          filter: 'blur(6px) saturate(0.8)',
        }}
      >
        <div style={{ width: WIDTH, height: HEIGHT, transformOrigin: '0 0', transform: 'scale(0.25)' }}>
          <Footage e={e} />
        </div>
      </div>
    </div>
    <AbsoluteFill style={{ background: `rgba(38,28,20,${dim})` }} />
  </AbsoluteFill>
);

// A backdrop picture: cover-fit, slow drift, a light veil so a print on top reads.
export const BoardBackdrop: React.FC<{ src: string; onError: () => void; frame: number; frames: number; veil?: number }> = ({
  src,
  onError,
  frame,
  frames,
  veil = 0.12,
}) => {
  const k = interpolate(frame, [0, Math.max(1, frames)], [1.04, 1.1], CL);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#EFE7DB' }}>
      <Img
        src={src}
        onError={onError}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${k})`, transformOrigin: '50% 40%' }}
      />
      <AbsoluteFill style={{ background: `rgba(30,24,18,${veil})` }} />
    </AbsoluteFill>
  );
};

// ---------- the effect ----------

export const FrameBreak: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const hasCutout = useHasCutout();
  const face = useMedianFace(e);
  const img = useBoardImage(e.image);
  const t = sceneProgress(frame, e.frames, 13, 11);

  // The print opening, in footage pixels. With a cut-out its top edge crosses her at the chest, so
  // her head and shoulders stand above it; the footage's own top edge is pushed just off screen, so
  // her hair never shows a flat cut. Without a cut-out the print is simply the whole video.
  const cut = clamp(face.y + face.h * 1.45, 300, 1150);
  const win: Rect = hasCutout ? { x: 70, y: cut, w: WIDTH - 140, h: 0 } : { x: 0, y: 0, w: WIDTH, h: HEIGHT };
  if (hasCutout) win.h = Math.min(HEIGHT - 30, win.y + win.w * 1.3) - win.y;
  const bottom = win.y + win.h;
  // Scale about the top centre; ty = where the footage's top edge lands on screen.
  const S = hasCutout ? Math.min(0.82, (SAFE_BOTTOM - 10 + 40) / bottom) : Math.min(0.7, (SAFE_BOTTOM - SAFE.top - 60) / HEIGHT);
  const ty = hasCutout ? -40 : (SAFE.top + SAFE_BOTTOM) / 2 - (HEIGHT * S) / 2 - 20;
  const tilt = (e.rotation >= 0 ? 1 : -1) * clamp(Math.abs(e.rotation) * 0.5, 1.5, 2.6);

  const s = interpolate(t, [0, 1], [1, S]);
  const rot = tilt * t;
  // The opening grows from the whole frame (t=0) to the print window (t=1).
  const L = interpolate(t, [0, 1], [0, win.x]);
  const T = interpolate(t, [0, 1], [0, win.y]);
  const R = interpolate(t, [0, 1], [WIDTH, win.x + win.w]);
  const B = interpolate(t, [0, 1], [HEIGHT, win.y + win.h]);
  const border = (hasCutout ? 30 : 34) * t;

  const group: React.CSSProperties = {
    transformOrigin: `${WIDTH / 2}px 0px`,
    transform: `translateY(${ty * t}px) rotate(${rot}deg) scale(${s})`,
  };
  // Feather the cut-out where it meets the video's own left / right / top edges (an arm or a boot
  // reaching out of shot would otherwise end in a hard straight line).
  const feather = `linear-gradient(to right, transparent 0px, #000 70px, #000 ${WIDTH - 70}px, transparent ${WIDTH}px), linear-gradient(to bottom, transparent 0px, #000 60px)`;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {img.src ? (
        <BoardBackdrop src={img.src} onError={img.onError} frame={frame} frames={e.frames} veil={0.18} />
      ) : (
        <QuarterBlurRoom e={e} />
      )}
      <AbsoluteFill style={group}>
        {/* the print: white border + soft shadow */}
        <div
          style={{
            position: 'absolute',
            left: L - border,
            top: T - border,
            width: R - L + 2 * border,
            height: B - T + 2 * border,
            background: PRINT_WHITE,
            borderRadius: 3 * t,
            boxShadow: `0 ${40 * t}px ${80 * t}px rgba(0,0,0,${0.35 * t}), 0 ${8 * t}px ${18 * t}px rgba(0,0,0,${0.2 * t})`,
          }}
        />
        <SceneCamera e={e} style={{ clipPath: `inset(${T}px ${WIDTH - R}px ${HEIGHT - B}px ${L}px)` }}>
          <Footage e={e} />
        </SceneCamera>
        {/* a hairline inner edge, like a mounted photo */}
        <div
          style={{
            position: 'absolute',
            left: L,
            top: T,
            width: R - L,
            height: B - T,
            boxShadow: `inset 0 0 0 ${1.5 * t}px rgba(0,0,0,0.10)`,
          }}
        />
        {hasCutout ? (
          // Her, above the print's top edge only: the head and shoulders step out over the border.
          <AbsoluteFill
            style={{
              clipPath: `inset(0 0 ${HEIGHT - T}px 0)`,
              filter: t > 0.02 ? `drop-shadow(0 ${14 * t}px ${16 * t}px rgba(0,0,0,${0.3 * t}))` : undefined,
            }}
          >
            <SceneCamera e={e}>
              <Person
                e={e}
                style={{
                  maskImage: feather,
                  WebkitMaskImage: feather,
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                }}
              />
            </SceneCamera>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>
      <SceneGrade />
    </AbsoluteFill>
  );
};
