// Sound effects at each effect start, and background music with optional ducking under her voice.
// The voice itself is the audio track of the video segments (full volume, in VideoTrack).
import React, { useCallback } from 'react';
import { Audio, interpolate, Sequence } from 'remotion';
import { FPS, type SfxName } from '../../shared/types';
import { useReel } from '../context';
import { checklistTicks } from '../effects/Checklist';
import { fileClicks } from '../effects/Files';
import { FOLDER_CLICK_AT } from '../effects/Folder';
import { POLAROID_SHUTTER_AT } from '../effects/Polaroid';
import { END_CARD_KEYWORD_AT } from './EndCard';
import type { TimedEffect } from '../model';

const SFX_FRAMES = 2 * FPS; // long enough for every sound in the pack

// Level-matching for the built-in pack (measured mean levels -19..-30 dB): each sound lands about
// 12 dB under a normalised voice. Unknown names play at 0.7.
const SFX_GAIN: Record<string, number> = {
  pop: 0.38,
  ding: 0.38,
  'sticker-slap': 0.5,
  typewriter: 0.56,
  whoosh: 0.65,
  'soft-pop': 0.65,
  click: 0.8,
  'camera-shutter': 0.9,
  'double-click': 1.0,
  'soft-click': 1.0,
};

const sfxFor = (e: TimedEffect, fallback: SfxName): SfxName | null => {
  if (e.sfx === 'none') return null;
  if (e.sfx && e.sfx !== 'default') return e.sfx;
  if (e.kind === 'zoom' || e.kind === 'flash' || e.kind === 'zoomthrough' || e.kind === 'vertigo' || e.kind === 'pullback') return 'whoosh';
  if (e.kind === 'papercut') return 'sticker-slap';
  if (e.kind === 'cover' || e.kind === 'framebreak') return 'camera-shutter';
  if (e.kind === 'greenscreen' || e.kind === 'doodle') return 'soft-pop';
  if (e.kind === 'ui') return 'ding';
  if (e.kind === 'polaroid') return 'camera-shutter';
  if (e.kind === 'folder') return 'double-click';
  if (e.kind === 'files') return null; // one click per file instead
  if (e.kind === 'envelope' || e.kind === 'conveyor' || e.kind === 'clothesline') return 'whoosh';
  if (e.kind === 'checklist') return null; // one click per tick instead
  return fallback;
};

export const Sound: React.FC = () => {
  const { props, model } = useReel();
  const { sound } = props.edit;
  const cues: { at: number; name: SfxName; key: string }[] = [];
  if (sound.effects && model.cardFrames > 0) {
    // One soft ding when the end-card keyword lands.
    cues.push({ at: model.total + END_CARD_KEYWORD_AT, name: 'ding', key: 'endcard-ding' });
  }
  if (sound.effects) {
    for (const e of model.effects) {
      // A sticker that found no room is skipped, and so is its sound.
      if ((e.kind === 'picture' || e.kind === 'phone' || e.kind === 'label' || e.kind === 'chart') && !e.rect) continue;
      const name = sfxFor(e, sound.defaultSfx);
      // Sounds that land on what you see: the folder double-click, the camera shutter.
      const lag = e.kind === 'folder' ? FOLDER_CLICK_AT - 3 : e.kind === 'polaroid' ? POLAROID_SHUTTER_AT : 0;
      if (name) cues.push({ at: e.from + Math.max(0, lag), name, key: e.id });
      if (e.kind === 'files' && e.sfx !== 'none') {
        const click: SfxName = e.sfx && e.sfx !== 'default' ? e.sfx : 'click';
        const files = (e.items ?? []).filter((x) => x.trim()).length || 4;
        fileClicks(Math.min(5, files), e.frames).forEach((t, i) => cues.push({ at: e.from + t, name: click, key: `${e.id}-click${i}` }));
      }
      if (e.kind === 'checklist' && e.sfx !== 'none') {
        const tick: SfxName = e.sfx && e.sfx !== 'default' ? e.sfx : 'click';
        checklistTicks(e.frames, (e.items ?? []).length).forEach((t, i) =>
          cues.push({ at: e.from + t, name: tick, key: `${e.id}-tick${i}` }),
        );
      }
    }
  }
  return (
    <>
      {cues
        .filter((c) => c.at < model.compFrames)
        .map((c) => (
          <Sequence key={c.key} name={`sfx ${c.name}`} from={c.at} durationInFrames={Math.min(SFX_FRAMES, model.compFrames - c.at)} layout="none">
            <Audio src={`${props.urls.sfx}${c.name}.wav`} volume={SFX_GAIN[c.name] ?? 0.7} />
          </Sequence>
        ))}
      {sound.music ? <Music /> : null}
    </>
  );
};

const Music: React.FC = () => {
  const { props, model } = useReel();
  const { sound } = props.edit;
  const base = sound.musicVolume;
  const total = model.compFrames;
  const videoEnd = model.total;
  const card = model.cardFrames;
  const volume = useCallback(
    (f: number) => {
      // With an end card the music carries on under it and fades out across the card.
      const outStart = card > 0 ? videoEnd + Math.round(card * 0.25) : total - 15;
      const fade = interpolate(f, [0, 12, outStart, total], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      // The music swells back up over the last ~1.3 s of her talking (end beat for the loop).
      const release = interpolate(f, [videoEnd - 55, videoEnd - 25], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const talk = sound.duck ? (model.speech[Math.max(0, Math.min(videoEnd - 1, Math.round(f)))] ?? 0) * release : 0;
      return base * fade * (1 - 0.7 * talk);
    },
    [base, total, videoEnd, card, sound.duck, model.speech],
  );
  // extend: the volume curve follows the reel timeline, not each loop of the track
  return <Audio src={`${props.urls.music}${sound.music}`} loop loopVolumeCurveBehavior="extend" volume={volume} name="Music" />;
};
