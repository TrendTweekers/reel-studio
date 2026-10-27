import React from 'react';
import { Composition } from 'remotion';
import { COVER_GRID, FPS, HEIGHT, THUMBNAIL, WIDTH, type CoverProps, type ReelProps, type ThumbnailProps } from '../shared/types';
import { longSize } from '../shared/long';
import { outputFrames, totalFrames } from '../shared/time';
import { Cover } from './Cover';
import { Reel } from './Reel';
import { sample, sampleCover } from './sample';
import { LongVideo } from './long/LongVideo';
import { Thumbnail } from './long/Thumbnail';
import { sampleLong, sampleThumbnail } from './long/sample';

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
    <Composition
      id="Long"
      component={LongVideo}
      fps={FPS}
      width={longSize(sampleLong.edit).width}
      height={longSize(sampleLong.edit).height}
      durationInFrames={outputFrames(sampleLong.edit.segments)}
      defaultProps={sampleLong satisfies ReelProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: outputFrames(props.edit.segments),
        width: longSize(props.edit).width,
        height: longSize(props.edit).height,
      })}
    />
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      fps={FPS}
      width={THUMBNAIL.width}
      height={THUMBNAIL.height}
      durationInFrames={1}
      defaultProps={sampleThumbnail satisfies ThumbnailProps}
    />
  </>
);
