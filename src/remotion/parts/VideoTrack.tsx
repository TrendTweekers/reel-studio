// The jump-cut edit. Picture: one <Sequence> per kept segment (muted video).
// Voice: one <Audio> per segment from the same proxy, overlapping the neighbours by XF frames and
// crossfading over 2*XF frames, so a cut never jumps from one waveform to another (no clicks,
// no room-tone pumping). Remotion applies volume per frame, so the fade is a short staircase.
import React from 'react';
import { Audio, OffthreadVideo, Sequence } from 'remotion';
import { useReel } from '../context';

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };
export const XF = 2; // frames of overlap on each side of a cut (crossfade = 4 frames, 133 ms)

export const VideoTrack: React.FC = () => {
  const { model, props } = useReel();
  return (
    <>
      {model.segs.map((s, i) => (
        <Sequence
          key={`cut-${i}`}
          name={`Cut ${i + 1}`}
          from={s.from}
          durationInFrames={s.durationInFrames}
          premountFor={20}
        >
          <OffthreadVideo src={props.urls.video} trimBefore={s.startFrom} muted style={fill} />
        </Sequence>
      ))}
    </>
  );
};

// The same jump-cut edit from any file with the proxy's timing (proxy.mp4 or the transparent cutout.webm).
// Scene effects draw this inside their own window; see effects/footage.tsx.
export const SegmentsTrack: React.FC<{ src: string; transparent?: boolean }> = ({ src, transparent }) => {
  const { model } = useReel();
  return (
    <>
      {model.segs.map((s, i) => (
        <Sequence key={`seg-${i}`} name={`Cut ${i + 1}`} from={s.from} durationInFrames={s.durationInFrames} premountFor={20}>
          <OffthreadVideo src={src} trimBefore={s.startFrom} transparent={transparent} muted style={fill} />
        </Sequence>
      ))}
    </>
  );
};

export const VoiceTrack: React.FC = () => {
  const { model, props } = useReel();
  const last = model.segs.length - 1;
  return (
    <>
      {model.segs.map((s, i) => {
        const lead = Math.min(i === 0 ? 0 : XF, s.from, s.startFrom); // audio before the cut
        const tail = i === last ? 0 : XF; // audio after the cut
        const from = s.from - lead;
        const dur = Math.min(model.total - from, s.durationInFrames + lead + tail);
        const rampIn = i === 0 && s.startFrom === 0 ? 0 : lead + XF; // frames of fade-in
        const rampOut = i === last ? 0 : tail + XF;
        const volume = (f: number) => {
          let v = 1;
          if (rampIn > 0 && f < rampIn) v = Math.min(v, (f + 1) / (rampIn + 1));
          if (rampOut > 0 && f >= dur - rampOut) v = Math.min(v, (dur - f) / (rampOut + 1));
          return Math.max(0, Math.min(1, v));
        };
        return (
          <Sequence key={`voice-${i}`} name={`Voice ${i + 1}`} from={from} durationInFrames={dur} layout="none">
            <Audio src={props.urls.video} trimBefore={s.startFrom - lead} volume={volume} />
          </Sequence>
        );
      })}
    </>
  );
};

// The person on a transparent background, only while a 'behind' effect needs her on top.
// Same cuts as VideoTrack, clipped to the windows of the behind effects.
export const CutoutTrack: React.FC = () => {
  const { model, props } = useReel();
  const src = props.urls.cutout;
  if (!src) return null;
  const windows = model.effects.filter((e) => e.kind === 'behind').map((e) => [e.from, e.from + e.frames] as const);
  if (!windows.length) return null;
  const merged: [number, number][] = [];
  for (const [a, b] of [...windows].sort((x, y) => x[0] - y[0])) {
    const lastW = merged[merged.length - 1];
    if (lastW && a <= lastW[1]) lastW[1] = Math.max(lastW[1], b);
    else merged.push([a, b]);
  }
  const parts: { from: number; dur: number; trim: number; key: string }[] = [];
  model.segs.forEach((s, i) => {
    for (const [a, b] of merged) {
      const from = Math.max(a, s.from);
      const to = Math.min(b, s.from + s.durationInFrames);
      if (to > from) parts.push({ from, dur: to - from, trim: s.startFrom + (from - s.from), key: `${i}-${a}` });
    }
  });
  return (
    <>
      {parts.map((p) => (
        <Sequence key={p.key} name="Cutout" from={p.from} durationInFrames={p.dur} premountFor={20}>
          <OffthreadVideo src={src} trimBefore={p.trim} transparent muted style={fill} />
        </Sequence>
      ))}
    </>
  );
};
