// Building blocks for the "show my reels" effects (envelope, folder, polaroid, conveyor, files,
// clothesline). They show her OTHER finished reels, playing muted inside small cards.
//   useClips(e, n)                 n clips to show. e.reels (project names) first, else her newest reels.
//                                  Not enough finished reels: the rest are short parts of THIS video,
//                                  so the effect always works, also on her very first reel.
//   <ClipVideo clip={c} delay={d} style={...} />
//                                  the clip, muted, object-fit cover, starting to play d frames after
//                                  the effect starts (use the frame the card appears). Size it with style.
//   REEL_RATIO                     9/16: width / height of a reel card.
import React from 'react';
import { OffthreadVideo, Sequence } from 'remotion';
import { FPS } from '../../shared/types';
import { outputToSource } from '../../shared/time';
import { useReel } from '../context';
import type { TimedEffect } from '../model';

export const REEL_RATIO = 9 / 16;

export type Clip = {
  key: string;
  src: string;
  trimBefore: number; // frames into the file where it starts playing
  title: string; // her reel title, or '' for a part of this video
  own: boolean; // true = a part of this video (no other reel to show)
};

export const useClips = (e: TimedEffect, n: number): Clip[] => {
  const { props, model } = useReel();
  const all = props.reels ?? [];
  const wanted = (e.reels ?? []).filter(Boolean);
  const picked = wanted.length ? wanted.map((s) => all.find((c) => c.slug === s)).filter((c) => !!c) : all;
  const out: Clip[] = picked.slice(0, n).map((c) => ({
    key: c.slug,
    src: c.url,
    // Start a little in, past the first frame, so the card shows a real moment. Short reels from 0.
    trimBefore: Math.round(Math.min(1.2, Math.max(0, c.duration - 4)) * FPS),
    title: c.title,
    own: false,
  }));
  // Fill up with parts of this video, spread over the whole edit (never the moment playing now).
  const missing = n - out.length;
  const outSeconds = model.total / FPS;
  for (let i = 0; i < missing; i++) {
    const t = ((i + 0.5) / missing) * outSeconds * 0.9;
    const src = outputToSource(t, props.edit.segments);
    out.push({ key: `own-${i}`, src: props.urls.video, trimBefore: Math.round(src * FPS), title: '', own: true });
  }
  return out;
};

export const ClipVideo: React.FC<{ clip: Clip; delay?: number; style?: React.CSSProperties }> = ({ clip, delay = 0, style }) => (
  <div style={{ overflow: 'hidden', background: '#1c1a18', ...style }}>
    <Sequence from={Math.max(0, Math.round(delay))} layout="none" name={`reel ${clip.key}`}>
      <OffthreadVideo src={clip.src} trimBefore={clip.trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </Sequence>
  </div>
);
