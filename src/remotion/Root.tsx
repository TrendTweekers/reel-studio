import React from 'react';
import { Composition } from 'remotion';
import { COVER_GRID, FPS, HEIGHT, WIDTH, type CoverProps, type ReelProps } from '../shared/types';
import { totalFrames } from '../shared/time';
import { Cover } from './Cover';
import { Reel } from './Reel';
import { sample, sampleCover } from './sample';

export const Root: React.FC = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={totalFrames(sample.edit)}
      defaultProps={sample satisfies ReelProps}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props.edit) })}
    />
    <Composition
      id="Cover"
      component={Cover}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={1}
      defaultProps={{ ...sampleCover, grid: false } satisfies CoverProps}
    />
    <Composition
      id="CoverGrid"
      component={Cover}
      fps={FPS}
      width={COVER_GRID.width}
      height={COVER_GRID.height}
      durationInFrames={1}
      defaultProps={{ ...sampleCover, grid: true } satisfies CoverProps}
    />
  </>
);
