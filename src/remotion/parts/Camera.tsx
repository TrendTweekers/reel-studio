// Applies the jump-cut punch and the 'zoom' effect punch to whatever it wraps.
// Two nested layers so both zooms compose exactly like the model's faceRect().
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import type { Zoom } from '../model';

const zoomStyle = (z: Zoom): React.CSSProperties => ({
  transformOrigin: `${z.ox}px ${z.oy}px`,
  transform: z.s === 1 ? undefined : `scale(${z.s})`,
});

export const Camera: React.FC<{ children: React.ReactNode; filter?: string }> = ({ children, filter }) => {
  const frame = useCurrentFrame();
  const { model } = useReel();
  const [outer, inner] = model.camera(frame);
  return (
    <AbsoluteFill style={{ ...zoomStyle(outer), filter }}>
      <AbsoluteFill style={zoomStyle(inner)}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
