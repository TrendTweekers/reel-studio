// Mounts each effect in its own <Sequence> so it gets a local clock starting at 0.
import React from 'react';
import { Sequence } from 'remotion';
import type { EffectKind } from '../../shared/types';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { Behind } from '../effects/Behind';
import { Chapter } from '../effects/Chapter';
import { Checklist } from '../effects/Checklist';
import { Emoji } from '../effects/Emoji';
import { Flash } from '../effects/Flash';
import { Glass } from '../effects/Glass';
import { Label } from '../effects/Label';
import { Phone } from '../effects/Phone';
import { Picture } from '../effects/Picture';
import { ChartGrow } from '../effects/ChartGrow';
import { CoverStory } from '../effects/CoverStory';
import { Doodle } from '../effects/Doodle';
import { FrameBreak } from '../effects/FrameBreak';
import { GreenScreen } from '../effects/GreenScreen';
import { Orbit } from '../effects/Orbit';
import { PaperCut } from '../effects/PaperCut';
import { PullBack } from '../effects/PullBack';
import { UiWorld } from '../effects/UiWorld';
import { Vertigo } from '../effects/Vertigo';
import { ZoomThrough } from '../effects/ZoomThrough';
import { Clothesline } from '../effects/Clothesline';
import { Conveyor } from '../effects/Conveyor';
import { Envelope } from '../effects/Envelope';
import { Files } from '../effects/Files';
import { Folder } from '../effects/Folder';
import { Polaroid } from '../effects/Polaroid';

const render = (e: TimedEffect) => {
  switch (e.kind) {
    case 'picture':
      return <Picture e={e} />;
    case 'label':
      return <Label e={e} />;
    case 'glass':
      return <Glass e={e} />;
    case 'behind':
      return <Behind e={e} />;
    case 'chapter':
      return <Chapter e={e} />;
    case 'checklist':
      return <Checklist e={e} />;
    case 'flash':
      return <Flash />;
    case 'phone':
      return <Phone e={e} />;
    case 'emoji':
      return <Emoji e={e} />;
    case 'framebreak':
      return <FrameBreak e={e} />;
    case 'papercut':
      return <PaperCut e={e} />;
    case 'vertigo':
      return <Vertigo e={e} />;
    case 'pullback':
      return <PullBack e={e} />;
    case 'greenscreen':
      return <GreenScreen e={e} />;
    case 'cover':
      return <CoverStory e={e} />;
    case 'zoomthrough':
      return <ZoomThrough e={e} />;
    case 'orbit':
      return <Orbit e={e} />;
    case 'doodle':
      return <Doodle e={e} />;
    case 'ui':
      return <UiWorld e={e} />;
    case 'chart':
      return <ChartGrow e={e} />;
    case 'envelope':
      return <Envelope e={e} />;
    case 'folder':
      return <Folder e={e} />;
    case 'polaroid':
      return <Polaroid e={e} />;
    case 'conveyor':
      return <Conveyor e={e} />;
    case 'files':
      return <Files e={e} />;
    case 'clothesline':
      return <Clothesline e={e} />;
    default:
      return null; // 'zoom' is done by <Camera>
  }
};

export const Effects: React.FC<{ kinds: EffectKind[] }> = ({ kinds }) => {
  const { model } = useReel();
  return (
    <>
      {model.effects
        .filter((e) => kinds.includes(e.kind))
        .map((e) => (
          <Sequence key={e.id} name={`${e.kind}: ${e.text ?? e.image ?? e.word ?? e.id}`} from={e.from} durationInFrames={e.frames}>
            {render(e)}
          </Sequence>
        ))}
    </>
  );
};
