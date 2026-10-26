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
