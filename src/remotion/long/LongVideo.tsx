// The long YouTube video (composition "Long"): calm, premium, no reel busyness.
// Footage (jump cuts, light fix, gentle zoom jumps) + board pictures, labels, name tag, chapter cards,
// optional subtitles and quiet looped music. No hook, end card, grain, progress bar or sound effects.
import React, { useCallback, useMemo } from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { FPS, type ReelProps } from '../../shared/types';
import { boldWeight, fontFamily } from '../fonts';
import { footageFilterFor } from '../parts/Vibe';
import { EffectZoom, VideoCuts, VoiceCuts } from './Footage';
import { buildLongModel, type LongModel } from './model';
import { Graphics, SubtitlesView } from './Overlays';

export const LONG_MUSIC_MAX = 0.12;
const MUSIC_FADE = 2 * FPS;

const Music: React.FC<{ m: LongModel; src: string; volume: number }> = ({ m, src, volume }) => {
  const base = Math.max(0, Math.min(LONG_MUSIC_MAX, volume));
  const { total, speech } = m;
  const vol = useCallback(
    (f: number) => {
      const fadeIn = Math.min(1, Math.max(0, f / MUSIC_FADE));
      const fadeOut = Math.min(1, Math.max(0, (total - f) / MUSIC_FADE));
      const talk = speech ? (speech[Math.max(0, Math.min(total - 1, Math.round(f)))] ?? 0) : 0;
      return base * Math.min(fadeIn, fadeOut) * (1 - 0.55 * talk);
    },
    [base, total, speech],
  );
  if (base <= 0) return null;
  return <Audio src={src} loop loopVolumeCurveBehavior="extend" volume={vol} name="Music" />;
};

export const LongVideo: React.FC<ReelProps> = (props) => {
  const { edit, urls } = props;
  const m = useMemo(() => buildLongModel(props), [props]);
  const filter = useMemo(() => footageFilterFor(edit), [edit]);
  const fonts = useMemo(
    () => ({ hook: fontFamily(edit.style.hookFont), sub: fontFamily(edit.style.subtitleFont), hookWeight: boldWeight(edit.style.hookFont) }),
    [edit.style.hookFont, edit.style.subtitleFont],
  );
  const music = edit.sound.music;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
      <EffectZoom m={m}>
        <VideoCuts m={m} src={urls.video} filter={filter} />
      </EffectZoom>
      <Graphics m={m} fonts={fonts} style={edit.style} board={urls.board} language={edit.language} />
      {m.subtitles.length ? <SubtitlesView m={m} font={fonts.sub} /> : null}
      <VoiceCuts m={m} src={urls.video} />
      {music ? <Music m={m} src={`${urls.music}${encodeURIComponent(music)}`} volume={edit.sound.musicVolume} /> : null}
    </AbsoluteFill>
  );
};
