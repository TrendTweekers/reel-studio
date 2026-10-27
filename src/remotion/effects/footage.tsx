// Building blocks for scene effects (framebreak, papercut, vertigo, ...). A scene draws its OWN copy of
// her video inside its window, so it can move, scale, frame or replace it.
//
// Inside an effect, useCurrentFrame() is LOCAL (0 at the effect start). <Footage> and <Person> undo
// that, so the video they show is exactly the edit at that moment (same cuts as the main video).
//   <Footage e={e} style={{ transform: 'scale(1.2)' }} />   her full video, 1080x1920, muted
//   <Person e={e} style={...} />                              only her (transparent background); null without a cutout
//   useHasCutout()                                            true when the person cut-out exists
//   useAbsFrame(e)                                            the absolute frame of the reel
//   useFace(e)                                                her face box on screen right now (px, before your transforms)
//   boardUrl(name)                                            URL of a board picture
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import type { Rect, TimedEffect } from '../model';
import { SegmentsTrack } from '../parts/VideoTrack';

export const useAbsFrame = (e: TimedEffect) => useCurrentFrame() + e.from;

export const useHasCutout = () => !!useReel().props.urls.cutout;

export const useFace = (e: TimedEffect): Rect => {
  const { model } = useReel();
  return model.faceRect(useAbsFrame(e));
};

export const useBoardUrl = () => {
  const { props } = useReel();
  return (name?: string) => (name ? props.urls.board + encodeURIComponent(name) : null);
};

const AbsoluteTime: React.FC<{ e: TimedEffect; children: React.ReactNode }> = ({ e, children }) => (
  <Sequence from={-e.from} layout="none" name="footage">
    {children}
  </Sequence>
);

export const Footage: React.FC<{ e: TimedEffect; style?: React.CSSProperties }> = ({ e, style }) => {
  const { props } = useReel();
  return (
    <AbsoluteFill style={style}>
      <AbsoluteTime e={e}>
        <SegmentsTrack src={props.urls.video} />
      </AbsoluteTime>
    </AbsoluteFill>
  );
};

export const Person: React.FC<{ e: TimedEffect; style?: React.CSSProperties }> = ({ e, style }) => {
  const { props } = useReel();
  if (!props.urls.cutout) return null;
  return (
    <AbsoluteFill style={style}>
      <AbsoluteTime e={e}>
        <SegmentsTrack src={props.urls.cutout} transparent />
      </AbsoluteTime>
    </AbsoluteFill>
  );
};
