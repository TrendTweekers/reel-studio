// A story video (edit.format === 'story') has no camera: this draws the whole picture instead of
// the footage. The paper background for every frame, then one <Sequence> per timed scene (local
// clock from 0, like parts/Effects.tsx). Each scene lives a few frames past its end so its exit
// overlaps the next scene's entrance.
import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { timedScenes, type TimedScene } from '../../shared/story';
import { useReel } from '../context';
import { Compare } from './Compare';
import { SceneContext, themeFor } from './kit';
import { List } from './List';
import { Logos } from './Logos';
import { NumberScene } from './NumberScene';
import { Photo } from './Photo';
import { Price } from './Price';
import { Quote } from './Quote';
import { Reels } from './Reels';
import { Click, Screen } from './Screen';
import { Background, OUT, SceneShell } from './Shell';
import { Title } from './Title';
import { Type } from './Type';
import { Words } from './Words';

const render = (s: TimedScene) => {
  switch (s.kind) {
    case 'title':
      return <Title />;
    case 'words':
      return <Words />;
    case 'list':
      return <List />;
    case 'photo':
      return <Photo />;
    case 'number':
      return <NumberScene />;
    case 'quote':
      return <Quote />;
    case 'compare':
      return <Compare />;
    case 'reels':
      return <Reels />;
    case 'screen':
      return <Screen />;
    case 'click':
      return <Click />;
    case 'type':
      return <Type />;
    case 'logos':
      return <Logos />;
    case 'price':
      return <Price />;
    default:
      return null;
  }
};

export const StoryScenes: React.FC = () => {
  const { props, model } = useReel();
  const scenes = useMemo(() => timedScenes(props.edit), [props.edit]);
  const theme = useMemo(() => themeFor(props.edit.story?.background, props.edit.style.accentColor), [props.edit.story?.background, props.edit.style.accentColor]);
  return (
    <AbsoluteFill>
      <Background theme={theme} />
      {scenes.map((s, i) => {
        const last = i === scenes.length - 1;
        const exitAtEnd = last && model.cardFrames > 0;
        return (
          <Sequence key={s.id} name={`story ${s.kind}: ${s.text ?? s.image ?? ''}`} from={s.from} durationInFrames={s.frames + (last ? 0 : OUT)} premountFor={30}>
            <SceneContext.Provider value={{ scene: s, frames: s.frames, first: i === 0, theme }}>
              <SceneShell index={i} count={scenes.length} frames={s.frames} exitAtEnd={exitAtEnd} theme={theme}>
                {render(s)}
              </SceneShell>
            </SceneContext.Provider>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
