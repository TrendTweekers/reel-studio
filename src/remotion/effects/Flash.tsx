import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CLAMP } from './anim';

// A 6-frame white flash: instant peak, quick falloff.
export const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: '#FFFDF9', opacity: interpolate(frame, [0, 1, 2, 5], [0.55, 0.95, 0.7, 0], CLAMP) }}
    />
  );
};
