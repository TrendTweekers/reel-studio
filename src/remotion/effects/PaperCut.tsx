// PAPER CUT: she becomes a paper cut-out sticker on a sheet of paper. A thick, slightly rounded white
// edge around her (SVG dilate filter), a soft cast shadow, a gentle paper wobble.
// In: a snappy "cut" (the room falls away in 4 frames, she pops down to sticker size with a tiny
// turn). Out: the reverse, back to the plain full-screen video.
// Background: cream paper (static noise texture), or the board picture e.image under a paper veil.
// Without a cut-out: her whole video becomes a paper print with a white border, same motion.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS, HEIGHT, WIDTH } from '../../shared/types';
import { SAFE, SAFE_BOTTOM, clamp, type TimedEffect } from '../model';
import {
  BoardBackdrop,
  PRINT_WHITE,
  PaperTexture,
  SceneCamera,
  SceneGrade,
  useBoardImage,
  useMedianFace,
} from './FrameBreak';
import { Footage, Person, useHasCutout } from './footage';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const PaperCut: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const hasCutout = useHasCutout();
  const face = useMedianFace(e);
  const img = useBoardImage(e.image);
  const id = `papercut-${e.id}`;

  // Snappy in: quick, with a little overshoot. Clean out: eased, over the last 8 frames.
  const outLen = Math.max(4, Math.min(8, Math.floor(e.frames / 4)));
  const pop = spring({ frame, fps: FPS, config: { damping: 10, stiffness: 260, mass: 0.55 } });
  const out = interpolate(frame, [e.frames - outLen, e.frames - 1], [1, 0], { ...CL, easing: Easing.inOut(Easing.cubic) });
  const t = pop * out; // 0 = plain video, 1 = sticker (overshoots a little on the way in)
  const room = interpolate(frame, [0, 4], [1, 0], CL) + interpolate(out, [0, 0.6], [1, 0], CL); // room fades away fast
  const roomOpacity = clamp(room, 0, 1);
  // the white edge "cuts" in over 3 frames and is gone before the room is fully back
  const edge = clamp(Math.min(frame / 3, 1) * interpolate(out, [0.35, 1], [0, 1], CL), 0, 1);

  // Paper wobble: slow, small, from the effect's own tilt.
  const sec = frame / FPS;
  const baseTilt = (e.rotation >= 0 ? 1 : -1) * clamp(Math.abs(e.rotation) * 0.45, 1.2, 2.6);
  const wobble = Math.sin(sec * Math.PI * 1.1 + e.rotation) * 0.7;
  const rot = (baseTilt + wobble) * t;
  const floatY = Math.sin(sec * Math.PI * 0.8) * 6 * t;

  const background = img.src ? (
    <AbsoluteFill>
      <BoardBackdrop src={img.src} onError={img.onError} frame={frame} frames={e.frames} veil={0} />
      <AbsoluteFill style={{ opacity: 0.35, mixBlendMode: 'multiply' }}>
        <PaperTexture id={id} tone="#F4EEE4" />
      </AbsoluteFill>
    </AbsoluteFill>
  ) : (
    <PaperTexture id={id} />
  );

  if (!hasCutout) {
    // Fallback: the whole video as a paper print on the sheet.
    const S = Math.min(0.72, (SAFE_BOTTOM - SAFE.top - 80) / HEIGHT);
    const s = interpolate(t, [0, 1], [1, S]);
    const cy = (SAFE.top + SAFE_BOTTOM) / 2 - 10;
    const b = 30 * clamp(t, 0, 1);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        {background}
        <AbsoluteFill
          style={{
            transformOrigin: `${WIDTH / 2}px ${HEIGHT / 2}px`,
            transform: `translateY(${(cy - HEIGHT / 2) * t + floatY}px) rotate(${rot}deg) scale(${s})`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -b,
              top: -b,
              width: WIDTH + 2 * b,
              height: HEIGHT + 2 * b,
              background: PRINT_WHITE,
              borderRadius: 4,
              boxShadow: `${14 * t}px ${30 * t}px ${50 * t}px rgba(60,40,20,${0.3 * clamp(t, 0, 1)}), 0 ${4 * t}px ${10 * t}px rgba(60,40,20,${0.18 * clamp(t, 0, 1)})`,
            }}
          />
          <SceneCamera e={e} style={{ overflow: 'hidden' }}>
            <Footage e={e} />
          </SceneCamera>
        </AbsoluteFill>
        <SceneGrade />
      </AbsoluteFill>
    );
  }

  // Sticker size: she shrinks about her face so the face stays put and the paper shows around her.
  const S = 0.8;
  const s = interpolate(t, [0, 1], [1, S]);
  const ox = face.x + face.w / 2;
  const oy = face.y + face.h / 2;
  // Keep her head inside the safe area: nudge down if the head would sit under the IG header.
  const headTopAfter = oy + (face.y - face.h * 0.5 - oy) * S;
  const nudge = Math.max(0, SAFE.top - 40 - headTopAfter) * t;
  const R = 16 * edge; // white edge, px (in footage pixels, scaled with her)

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {background}
      {/* the room, falling away in the first frames (and coming back at the end) */}
      <AbsoluteFill style={{ opacity: roomOpacity }}>
        <SceneCamera e={e}>
          <Footage e={e} />
        </SceneCamera>
      </AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={`${id}-edge`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          {/* clean the matte (drop faint fringe and specks), grow it, round it, fill it with paper
              white, and put her (on the clean matte) on top */}
          <feComponentTransfer in="SourceAlpha" result="hard">
            <feFuncA type="linear" slope={3} intercept={-1.1} />
          </feComponentTransfer>
          <feMorphology in="hard" operator="erode" radius={2} result="opened" />
          <feMorphology in="opened" operator="dilate" radius={Math.max(0.01, R + 2)} result="grown" />
          <feGaussianBlur in="grown" stdDeviation={Math.max(0.01, R * 0.35)} result="soft" />
          <feComponentTransfer in="soft" result="round">
            <feFuncA type="linear" slope={6} intercept={-2.2} />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="hard" operator="in" result="her" />
          <feFlood floodColor={PRINT_WHITE} result="white" />
          <feComposite in="white" in2="round" operator="in" result="paper" />
          <feMerge>
            <feMergeNode in="paper" />
            <feMergeNode in="her" />
          </feMerge>
        </filter>
      </svg>
      <AbsoluteFill
        style={{
          transformOrigin: `${ox}px ${oy}px`,
          transform: `translateY(${nudge + floatY}px) rotate(${rot}deg) scale(${s})`,
          filter: t > 0.02 ? `drop-shadow(${12 * t}px ${22 * t}px ${18 * t}px rgba(60,40,20,${0.32 * clamp(t, 0, 1)}))` : undefined,
        }}
      >
        <AbsoluteFill style={{ filter: R > 0.3 ? `url(#${id}-edge)` : undefined }}>
          <SceneCamera e={e}>
            <Person e={e} />
          </SceneCamera>
        </AbsoluteFill>
      </AbsoluteFill>
      <SceneGrade />
    </AbsoluteFill>
  );
};
