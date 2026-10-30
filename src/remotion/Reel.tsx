// The Reel. Layer order, bottom to top (a story video draws <StoryScenes> instead of the footage layers):
//   footage (camera) -> grade -> 'behind' type -> cutout (camera) -> scenes (own footage) -> hook
//   -> stickers/cards/overlays
//   -> subtitles -> flash -> frame / grain / progress bar.  Sound runs alongside.
// Works in @remotion/player (editor preview) and in renderMedia (final render).
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { isStory } from '../shared/story';
import { SCENE_KINDS, STORY_SKIP_KINDS, type EffectKind, type ReelProps } from '../shared/types';
import { ReelContext, type ReelCtx } from './context';
import { fontFamily } from './fonts';
import { buildModel } from './model';
import { Camera } from './parts/Camera';
import { Effects } from './parts/Effects';
import { EndCard } from './parts/EndCard';
import { Hook } from './parts/Hook';
import { Sound } from './parts/Sound';
import { Subtitles } from './parts/Subtitles';
import { CutoutTrack, VideoTrack, VoiceTrack } from './parts/VideoTrack';
import { Finish, Grade, footageFilterFor } from './parts/Vibe';
import { StoryScenes } from './story/StoryScenes';

const OVERLAYS: EffectKind[] = ['envelope', 'folder', 'polaroid', 'conveyor', 'files', 'clothesline', 'orbit', 'doodle', 'ui', 'picture', 'phone', 'label', 'emoji', 'glass', 'chapter', 'checklist', 'chart'];
// A story has no person on camera: no footage layers, and no overlays that need her.
const STORY_OVERLAYS = OVERLAYS.filter((k) => !STORY_SKIP_KINDS.includes(k));

export const Reel: React.FC<ReelProps> = (props) => {
  const model = useMemo(() => buildModel(props), [props]);
  const hookFont = fontFamily(props.edit.style.hookFont);
  const subFont = fontFamily(props.edit.style.subtitleFont);
  const ctx = useMemo<ReelCtx>(() => ({ props, model, hookFont, subFont }), [props, model, hookFont, subFont]);
  // The 'editorial' vibe frames footage with a cream border, title and "No 01" in the corners. On story
  // paper those read as faint ghost marks (and clash with the scene's own page number): drop them.
  const finishCtx = useMemo<ReelCtx>(
    () =>
      isStory(props.edit) && props.edit.style.vibe === 'editorial'
        ? { ...ctx, props: { ...props, edit: { ...props.edit, style: { ...props.edit.style, vibe: 'clean' } } } }
        : ctx,
    [ctx, props],
  );
  const filter = footageFilterFor(props.edit);
  const story = isStory(props.edit);

  return (
    <ReelContext.Provider value={ctx}>
      <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
        {story ? (
          <StoryScenes />
        ) : (
          <>
            <Camera filter={filter}>
              <VideoTrack />
            </Camera>
            <Grade />
            <Effects kinds={['behind']} />
            {props.urls.cutout ? (
              <Camera filter={filter}>
                <CutoutTrack />
              </Camera>
            ) : null}
            <Effects kinds={SCENE_KINDS} />
          </>
        )}
        <Hook />
        <Effects kinds={story ? STORY_OVERLAYS : OVERLAYS} />
        <Subtitles />
        <Effects kinds={['flash']} />
        <EndCard />
        <ReelContext.Provider value={finishCtx}>
          <Finish />
        </ReelContext.Provider>
        <VoiceTrack />
        <Sound />
      </AbsoluteFill>
    </ReelContext.Provider>
  );
};
