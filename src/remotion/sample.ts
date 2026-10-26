// Sample props for Remotion Studio / CLI tests. Fake words and faces; media from the local server.
import type { CoverProps, Edit, FaceSample, ReelProps, Word } from '../shared/types';

const ORIGIN = 'http://localhost:8787';

// Lay a sentence over time spans: [start, end, text][] -> Word[] with even word timing.
const lay = (spans: [number, number, string][]): Word[] =>
  spans.flatMap(([start, end, text]) => {
    const parts = text.split(/\s+/).filter(Boolean);
    const step = (end - start) / parts.length;
    return parts.map((t, i) => ({
      text: t,
      start: +(start + i * step).toFixed(2),
      end: +(start + (i + 0.85) * step).toFixed(2),
      prob: 0.95,
    }));
  });

const words: Word[] = lay([
  [0.2, 1.6, 'Nikt o tym nie mówi,'],
  [1.7, 3.2, 'więc ja powiem.'],
  [3.8, 5.4, 'Montaż to nie magia,'],
  [5.5, 7.1, 'to rytm i styl.'],
  [7.7, 9.3, 'Zobacz moją tablicę inspiracji,'],
  [9.4, 11.3, 'jedno ujęcie, jeden styl.'],
  [11.9, 13.4, 'Trzy kolory, jedno światło'],
  [13.5, 15.8, 'i zero chaosu. Tak wygląda mój proces.'],
]);

const faces: FaceSample[] = Array.from({ length: 9 }, (_, i) => ({
  t: i * 2,
  x: 0.361,
  y: 0.182,
  w: 0.278,
  h: 0.198,
}));

const edit: Edit = {
  version: 1,
  title: 'o montażu',
  language: 'pl',
  source: { duration: 16, width: 1080, height: 1920 },
  segments: [
    { start: 0, end: 3.3 },
    { start: 3.7, end: 7.2 },
    { start: 7.6, end: 11.4 },
    { start: 11.8, end: 16 },
  ],
  hook: { text: 'nikt o tym nie mówi,', accent: 'więc ja powiem', sub: 'o montażu', until: 2.8 },
  style: {
    hookFont: 'Playfair Display',
    hookColor: '#FBF6EE',
    subtitleFont: 'Inter',
    subtitleStyle: 'clean',
    subtitlePosition: 'lower',
    accentColor: '#E8C9A0',
    vibe: 'film',
  },
  sound: { effects: true, defaultSfx: 'pop', music: 'sample.mp3', musicVolume: 0.35, duck: true },
  toggles: { zoomJumps: true, progressBar: true, grain: false, glowAboveHead: true },
  effects: [
    { id: 'lab1', kind: 'label', at: 1.2, duration: 1.5, word: 'mówi', text: 'editing', position: 'auto', sfx: 'sticker-slap' },
    { id: 'ch1', kind: 'chapter', at: 3.8, duration: 1.6, word: 'Montaż', text: 'o montażu' },
    { id: 'pic1', kind: 'picture', at: 4.4, duration: 2.4, word: 'magia', image: 'look1.png', position: 'auto' },
    { id: 'pic2', kind: 'picture', at: 5.0, duration: 2.0, word: 'rytm', image: 'look2.png', position: 'auto', text: 'rytm' },
    { id: 'zm1', kind: 'zoom', at: 6.0, duration: 1.0, word: 'styl', scale: 1.25 },
    { id: 'fl1', kind: 'flash', at: 7.6, duration: 0.2 },
    { id: 'gl1', kind: 'glass', at: 7.8, duration: 1.4, word: 'tablicę', text: 'tablica inspiracji' },
    { id: 'bh1', kind: 'behind', at: 9.4, duration: 1.8, word: 'styl', text: 'styl' },
    { id: 'em1', kind: 'emoji', at: 11.0, duration: 1.1, text: '✨' },
    {
      id: 'ck1',
      kind: 'checklist',
      at: 11.8,
      duration: 2.4,
      text: 'mój proces',
      items: ['trzy kolory', 'jedno światło', 'zero chaosu'],
    },
    { id: 'ph1', kind: 'phone', at: 14.4, duration: 1.5, image: 'look3.png', position: 'auto', sfx: 'whoosh' },
  ],
  wordFixes: {},
};

export const sample: ReelProps = {
  edit,
  words,
  faces,
  urls: {
    video: `${ORIGIN}/media/sample/proxy.mp4`,
    cutout: `${ORIGIN}/media/sample/cutout.webm`,
    board: `${ORIGIN}/board/`,
    sfx: `${ORIGIN}/sfx/`,
    music: `${ORIGIN}/music/`,
  },
};

export const sampleCover: CoverProps = {
  cover: { t: 1.0, title: 'nikt o tym nie mówi', accent: 'o montażu', layout: 'top' },
  style: edit.style,
  urls: { frame: `${ORIGIN}/media/sample/covers/frame.jpg` },
  face: faces[0],
  grid: false,
};
