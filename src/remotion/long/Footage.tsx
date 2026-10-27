// The long video's picture and voice: the jump-cut edit from proxy.mp4 (already at the final size).
// Only the cuts near the current frame are mounted (a 30 min video has hundreds), each one a muted
// OffthreadVideo with its fixed jump zoom. The voice overlaps each cut by XF frames on both sides and
// crossfades, like parts/VideoTrack.tsx, so a cut never clicks.
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion';
import { lastAtOrBefore, type LongModel, type LongZoom } from './model';

const XF = 2; // frames of audio overlap on each side of a cut
const AHEAD = 45; // mount a cut this many frames before it starts (premount needs it in the tree)
const BEHIND = 4;
const PREMOUNT = 30;

// Indices of the segments to mount at this frame: the current one, its neighbours, and the ones
// starting within AHEAD frames.
const windowAt = (m: LongModel, frame: number): [number, number] => {
  const n = m.segs.length;
  if (!n) return [0, -1];
  const i = Math.max(0, lastAtOrBefore(m.segs, frame));
  let lo = i;
  while (lo > 0 && m.segs[lo - 1].from + m.segs[lo - 1].durationInFrames + BEHIND > frame) lo--;
  let hi = i;
  while (hi + 1 < n && m.segs[hi + 1].from <= frame + AHEAD) hi++;
  return [lo, hi];
};

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

export const VideoCuts: React.FC<{ m: LongModel; src: string; filter?: string }> = ({ m, src, filter }) => {
  const frame = useCurrentFrame();
  const [lo, hi] = windowAt(m, frame);
  const items: React.ReactNode[] = [];
  for (let i = lo; i <= hi; i++) {
    const s = m.segs[i];
    items.push(
      <Sequence key={`cut-${i}`} name={`Cut ${i + 1}`} from={s.from} durationInFrames={s.durationInFrames} premountFor={PREMOUNT}>
        <AbsoluteFill
          style={
            s.zoom !== 1 ? { transform: `scale(${s.zoom})`, transformOrigin: `${s.ox.toFixed(1)}px ${s.oy.toFixed(1)}px` } : undefined
          }
        >
          <OffthreadVideo src={src} trimBefore={s.startFrom} muted style={{ ...fill, filter }} />
        </AbsoluteFill>
      </Sequence>,
    );
  }
  return <>{items}</>;
};

export const VoiceCuts: React.FC<{ m: LongModel; src: string }> = ({ m, src }) => {
  const frame = useCurrentFrame();
  const last = m.segs.length - 1;
  // The audio plans never change; only which ones are mounted does.
  const plans = useMemo(
    () =>
      m.segs.map((s, i) => {
        const lead = Math.min(i === 0 ? 0 : XF, s.from, s.startFrom);
        const tail = i === last ? 0 : XF;
        const from = s.from - lead;
        const dur = Math.max(1, Math.min(m.total - from, s.durationInFrames + lead + tail));
        const rampIn = i === 0 && s.startFrom === 0 ? 0 : lead + XF;
        const rampOut = i === last ? 0 : tail + XF;
        const volume = (f: number) => {
          let v = 1;
          if (rampIn > 0 && f < rampIn) v = Math.min(v, (f + 1) / (rampIn + 1));
          if (rampOut > 0 && f >= dur - rampOut) v = Math.min(v, (dur - f) / (rampOut + 1));
          return Math.max(0, Math.min(1, v));
        };
        return { from, dur, trim: s.startFrom - lead, volume };
      }),
    [m, last],
  );
  const [lo, hi] = windowAt(m, frame);
  const items: React.ReactNode[] = [];
  for (let i = Math.max(0, lo - 1); i <= Math.min(last, hi + 1); i++) {
    const p = plans[i];
    items.push(
      <Sequence key={`voice-${i}`} name={`Voice ${i + 1}`} from={p.from} durationInFrames={p.dur} layout="none">
        <Audio src={src} trimBefore={p.trim} volume={p.volume} />
      </Sequence>,
    );
  }
  return <>{items}</>;
};

// Effect zooms (kind 'zoom'): a smooth push-in on the face, held, then an easy return.
const zoomAt = (zooms: LongZoom[], frame: number) => {
  const i = lastAtOrBefore(zooms, frame);
  if (i < 0) return null;
  const z = zooms[i];
  const local = frame - z.from;
  if (local >= z.frames) return null;
  const rise = Math.min(36, Math.round(z.frames * 0.55));
  const back = Math.min(18, Math.round(z.frames * 0.3));
  const k =
    local < z.frames - back
      ? interpolate(local, [0, rise], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
      : interpolate(local, [z.frames - back, z.frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
  return { s: 1 + (z.s - 1) * k, ox: z.ox, oy: z.oy };
};

export const EffectZoom: React.FC<{ m: LongModel; children: React.ReactNode }> = ({ m, children }) => {
  const frame = useCurrentFrame();
  const z = m.zooms.length ? zoomAt(m.zooms, frame) : null;
  return (
    <AbsoluteFill
      style={z && z.s > 1.0005 ? { transform: `scale(${z.s.toFixed(4)})`, transformOrigin: `${z.ox.toFixed(1)}px ${z.oy.toFixed(1)}px` } : undefined}
    >
      {children}
    </AbsoluteFill>
  );
};
