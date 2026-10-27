// VERTIGO: a dolly zoom. She (the cut-out) stays exactly the same size and place while the room
// behind her travels: it recedes around her face (1.0 -> ~0.72) over most of the effect, so the
// space "stretches" away from her, then settles back to 1.0 over the last ~10 frames and the scene
// ends on the normal video.
// Why recede and not push in: with no clean plate of the room, a pushed-in room contains a BIGGER
// copy of her that shows round her outline as a double. A receding room shrinks that copy INSIDE
// her silhouette, where the cut-out hides it. The space the room leaves at the edges is filled with
// a soft, blurred, darker copy of the room, and the room's edge is feathered into it.
// Without a cut-out: a slow, smooth push-in on the footage (1.0 -> 1.12) around her face.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { type TimedEffect } from '../model';
import { QuarterBlurRoom, SceneCamera, SceneGrade, useMedianFace } from './FrameBreak';
import { Footage, Person, useHasCutout } from './footage';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 0 -> 1 -> 0 over the effect: a long, smooth push (no overshoot), a held peak, an eased return.
const dolly = (frame: number, frames: number) => {
  const back = Math.max(4, Math.min(10, Math.floor(frames / 4)));
  const push = Math.max(6, Math.floor((frames - back) * 0.85));
  const up = interpolate(frame, [0, push], [0, 1], { ...CL, easing: Easing.inOut(Easing.sin) });
  const down = interpolate(frame, [frames - back, frames - 1], [1, 0], { ...CL, easing: Easing.inOut(Easing.cubic) });
  return up * down;
};

export const Vertigo: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const hasCutout = useHasCutout();
  const face = useMedianFace(e);
  const ox = face.x + face.w / 2;
  const oy = face.y + face.h / 2;
  const k = dolly(frame, e.frames);

  if (!hasCutout) {
    const z = 1 + 0.12 * k;
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        <AbsoluteFill style={{ transformOrigin: `${ox}px ${oy}px`, transform: `scale(${z})` }}>
          <SceneCamera e={e}>
            <Footage e={e} />
          </SceneCamera>
        </AbsoluteFill>
        <SceneGrade />
      </AbsoluteFill>
    );
  }

  const z = 1 - 0.28 * k;
  const vignette = 0.32 * k;
  // Feather the receding room's edges into the soft fill (in room pixels; scales with it).
  const fe = 140 * k;
  const feather = `linear-gradient(to right, transparent 0px, #000 ${fe}px, #000 ${WIDTH - fe}px, transparent ${WIDTH}px), linear-gradient(to bottom, transparent 0px, #000 ${fe}px, #000 ${HEIGHT - fe}px, transparent ${HEIGHT}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden', background: '#0d0c0b' }}>
      {/* the soft fill where the room has left the frame */}
      {k > 0.01 ? <QuarterBlurRoom e={e} dim={0.3} /> : null}
      {/* the room, receding around her face */}
      <AbsoluteFill
        style={{
          transformOrigin: `${ox}px ${oy}px`,
          transform: `scale(${z})`,
          maskImage: k > 0.01 ? feather : undefined,
          WebkitMaskImage: k > 0.01 ? feather : undefined,
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      >
        <SceneCamera e={e}>
          <Footage e={e} />
        </SceneCamera>
      </AbsoluteFill>
      {/* darker edges as the room falls away: the eye stays on her */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 60% at ${(ox / WIDTH) * 100}% ${(oy / HEIGHT) * 100 + 15}%, rgba(15,12,10,0) 40%, rgba(15,12,10,${vignette}) 100%)`,
        }}
      />
      {/* her, unchanged: same size, same place */}
      <AbsoluteFill style={{ filter: k > 0.02 ? `drop-shadow(0 ${10 * k}px ${24 * k}px rgba(0,0,0,${0.3 * k}))` : undefined }}>
        <SceneCamera e={e}>
          <Person e={e} />
        </SceneCamera>
      </AbsoluteFill>
      <SceneGrade />
    </AbsoluteFill>
  );
};
