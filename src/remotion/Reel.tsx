// The Reel. Layer order, bottom to top:
//   footage (camera) -> grade -> 'behind' type -> cutout (camera) -> scenes (own footage) -> hook
//   -> stickers/cards/overlays
//   -> subtitles -> flash -> frame / grain / progress bar.  Sound runs alongside.
// Works in @remotion/player (editor preview) and in renderMedia (final render).
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { SCENE_KINDS, type ReelProps } from '../shared/types';
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

export const Reel: React.FC<ReelProps> = (props) => {
  const model = useMemo(() => buildModel(props), [props]);
  const hookFont = fontFamily(props.edit.style.hookFont);
  const subFont = fontFamily(props.edit.style.subtitleFont);
  const ctx = useMemo<ReelCtx>(() => ({ props, model, hookFont, subFont }), [props, model, hookFont, subFont]);
  const filter = footageFilterFor(props.edit);

  return (
    <ReelContext.Provider value={ctx}>
      <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
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
        <Hook />
        <Effects kinds={['orbit', 'doodle', 'ui', 'picture', 'phone', 'label', 'emoji', 'glass', 'chapter', 'checklist', 'chart']} />
        <Subtitles />
        <Effects kinds={['flash']} />
        <EndCard />
        <Finish />
        <VoiceTrack />
        <Sound />
      </AbsoluteFill>
    </ReelContext.Provider>
  );
};
