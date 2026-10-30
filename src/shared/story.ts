// Helpers for story videos (edit.format === 'story': a video from text, no camera).
import { totalFrames, sourceToOutput } from './time';
import { FPS, type Edit, type StoryScene } from './types';

export const isStory = (edit: Pick<Edit, 'format'> | null | undefined) => edit?.format === 'story';

// Scenes on the output timeline: from/frames in output frames, sorted. A scene whose start was cut
// away starts at the next kept moment; scenes that end up with no frames are dropped.
export type TimedScene = StoryScene & { from: number; frames: number; index: number };
export const timedScenes = (edit: Edit): TimedScene[] => {
  const scenes = edit.story?.scenes ?? [];
  const total = totalFrames(edit) - Math.round((edit.endCard?.enabled ? edit.endCard.seconds : 0) * FPS);
  const starts = scenes
    .map((s) => {
      let out = sourceToOutput(s.at, edit.segments);
      // Inside a cut: the next kept part.
      if (out === null) {
        const next = edit.segments.find((g) => g.start >= s.at);
        out = next ? sourceToOutput(next.start, edit.segments) : null;
      }
      return { s, from: out === null ? null : Math.round(out * FPS) };
    })
    .filter((x): x is { s: StoryScene; from: number } => x.from !== null && x.from < total)
    .sort((a, b) => a.from - b.from);
  if (starts.length) starts[0].from = 0; // the first scene always starts the video
  return starts
    .map((x, i) => ({ ...x.s, from: x.from, frames: (i + 1 < starts.length ? starts[i + 1].from : total) - x.from, index: i }))
    .filter((x) => x.frames > 0);
};
