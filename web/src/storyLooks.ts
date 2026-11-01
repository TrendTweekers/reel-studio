// The background choices for a video from text, shared by the new-video page and the scenes panel.
// Each swatch is a tiny CSS preview of the look (paper, ink and its texture).
import type { StorySettings } from '../../src/shared/types';
import type { StrKey } from './i18n';

export type StorySwatch = { v: StorySettings['background']; color: string; label: StrKey };

export const storySwatches = (accent: string): StorySwatch[] => [
  { v: 'cream', color: '#f6f1ea', label: 'bgCream' },
  { v: 'ink', color: '#1b1715', label: 'bgInk' },
  { v: 'accent', color: accent, label: 'bgAccent' },
  // newsprint: grey-warm paper with a dot screen and a thin double rule
  { v: 'gazeta', color: 'linear-gradient(#1c1b19, #1c1b19) 5px 9px / 18px 1.5px no-repeat, linear-gradient(#1c1b19, #1c1b19) 5px 12px / 18px 1px no-repeat, radial-gradient(circle, rgba(28,27,25,0.35) 0 0.8px, transparent 1.3px) 0 0 / 4px 4px, #ece8dd', label: 'bgGazeta' },
  // riso: blue-black ink and a warm second ink slipped against it
  { v: 'riso', color: 'radial-gradient(circle at 60% 60%, #e8532f 0 6px, transparent 6.5px), radial-gradient(circle at 46% 46%, #1e2547 0 6px, transparent 6.5px), #f2ede3', label: 'bgRiso' },
  // film: near black, a warm light and letterbox bars
  { v: 'noir', color: 'linear-gradient(#000 0 4px, transparent 4px calc(100% - 4px), #000 calc(100% - 4px)), radial-gradient(circle at 50% 45%, rgba(210,168,94,0.55), rgba(13,11,10,1) 70%)', label: 'bgNoir' },
];
