// Sample props for the Long and Thumbnail compositions (Remotion Studio / CLI defaults).
import type { ReelProps, ThumbnailProps } from '../../shared/types';
import { sample } from '../sample';

const ORIGIN = 'http://localhost:8787';

export const sampleLong: ReelProps = {
  ...sample,
  edit: {
    ...sample.edit,
    format: 'long',
    hook: null,
    source: { ...sample.edit.source, width: 1920, height: 1080 },
    effects: sample.edit.effects.filter((e) => e.kind === 'picture' || e.kind === 'label' || e.kind === 'zoom'),
    long: {
      subtitles: true,
      chapterCards: true,
      zoomJumps: true,
      chapters: [
        { at: 0, title: 'Wstęp' },
        { at: 3.7, title: 'O montażu' },
        { at: 11.8, title: 'Mój proces' },
      ],
      nameTag: { name: 'Paulina', line: 'stylistka', at: 0.5, duration: 3 },
    },
  },
};

export const sampleThumbnail: ThumbnailProps = {
  frame: `${ORIGIN}/media/sample/covers/frame.jpg`,
  title: 'Jesienne typy',
  accent: 'które naprawdę noszę',
  style: sample.edit.style,
  face: sample.faces[0],
};
