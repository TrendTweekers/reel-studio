// Editing styles: one click sets the whole look of a reel. Built-in ones are here; her own saved
// styles live in styles/<id>.json (same shape) and show next to these.
import type { Edit } from './types';

export type EditingStyle = {
  id: string;
  name: string;
  namePl: string;
  description: string;
  descriptionPl: string;
  style: Edit['style'];
  sound: Pick<Edit['sound'], 'effects' | 'defaultSfx'>;
  toggles: Edit['toggles'];
  // How busy the automatic effects are: seconds between pictures / zooms in the first edit.
  pace: { pictureEvery: number; zoomEvery: number; pauseGap: number };
};

export const BUILT_IN_STYLES: EditingStyle[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    namePl: 'Magazynowy',
    description: 'Magazine look. Serif hook, calm cuts, few effects.',
    descriptionPl: 'Jak w magazynie. Szeryfowy hook, spokojne cięcia, mało efektów.',
    style: { hookFont: 'Playfair Display', hookColor: '#F5EFE6', subtitleFont: 'Helvetica Neue', subtitleStyle: 'clean', subtitlePosition: 'lower', accentColor: '#E3C9A0', vibe: 'editorial' },
    sound: { effects: true, defaultSfx: 'soft-click' },
    toggles: { zoomJumps: false, progressBar: false, grain: false, glowAboveHead: false },
    pace: { pictureEvery: 6, zoomEvery: 9, pauseGap: 0.45 },
  },
  {
    id: 'vogue',
    name: 'Vogue',
    namePl: 'Vogue',
    description: 'High fashion. Bodoni hook, black and white text, sharp jump zooms.',
    descriptionPl: 'Wysoka moda. Bodoni, czarno-biały tekst, ostre skoki zoomu.',
    style: { hookFont: 'Bodoni Moda', hookColor: '#ffffff', subtitleFont: 'DM Sans', subtitleStyle: 'box', subtitlePosition: 'lower', accentColor: '#111111', vibe: 'clean' },
    sound: { effects: true, defaultSfx: 'camera-shutter' },
    toggles: { zoomJumps: true, progressBar: false, grain: false, glowAboveHead: false },
    pace: { pictureEvery: 4, zoomEvery: 6, pauseGap: 0.35 },
  },
  {
    id: 'girlblog',
    name: 'Girl blog',
    namePl: 'Girl blog',
    description: 'Pinterest diary. Soft cream hook, butter accents, polaroids, clicks, warm glow.',
    descriptionPl: 'Pamiętnik z Pinteresta. Kremowy hook, maślane akcenty, polaroidy, kliknięcia, ciepła poświata.',
    style: { hookFont: 'Instrument Serif', hookColor: '#FBF4E2', subtitleFont: 'Helvetica Neue', subtitleStyle: 'pop', subtitlePosition: 'lower', accentColor: '#F1D98E', vibe: 'glow' },
    sound: { effects: true, defaultSfx: 'double-click' },
    toggles: { zoomJumps: true, progressBar: false, grain: true, glowAboveHead: true },
    pace: { pictureEvery: 3, zoomEvery: 7, pauseGap: 0.35 },
  },
  {
    id: 'film',
    name: 'Film',
    namePl: 'Film',
    description: 'Analog mood. Grain, Cormorant hook, slow and soft.',
    descriptionPl: 'Analogowy klimat. Ziarno, Cormorant, wolno i miękko.',
    style: { hookFont: 'Cormorant Garamond', hookColor: '#F5EFE6', subtitleFont: 'DM Sans', subtitleStyle: 'clean', subtitlePosition: 'lower', accentColor: '#E8C4BC', vibe: 'film' },
    sound: { effects: false, defaultSfx: 'soft-pop' },
    toggles: { zoomJumps: false, progressBar: false, grain: true, glowAboveHead: false },
    pace: { pictureEvery: 7, zoomEvery: 10, pauseGap: 0.5 },
  },
  {
    id: 'bold',
    name: 'Bold creator',
    namePl: 'Odważny',
    description: 'Fast and punchy. Karaoke subtitles in camel, many zooms, pops.',
    descriptionPl: 'Szybko i mocno. Napisy karaoke w kolorze camel, dużo zoomów, popy.',
    style: { hookFont: 'DM Serif Display', hookColor: '#F5EFE6', subtitleFont: 'Montserrat', subtitleStyle: 'karaoke', subtitlePosition: 'middle', accentColor: '#D9B98C', vibe: 'clean' },
    sound: { effects: true, defaultSfx: 'pop' },
    toggles: { zoomJumps: true, progressBar: false, grain: false, glowAboveHead: false },
    pace: { pictureEvery: 2.5, zoomEvery: 4, pauseGap: 0.28 },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    namePl: 'Minimalny',
    description: 'Only her and clean subtitles. No sounds, no stickers.',
    descriptionPl: 'Tylko Ty i czyste napisy. Bez dźwięków i naklejek.',
    style: { hookFont: 'Fraunces', hookColor: '#ffffff', subtitleFont: 'Inter', subtitleStyle: 'clean', subtitlePosition: 'lower', accentColor: '#ffffff', vibe: 'clean' },
    sound: { effects: false, defaultSfx: 'soft-click' },
    toggles: { zoomJumps: false, progressBar: false, grain: false, glowAboveHead: false },
    pace: { pictureEvery: 999, zoomEvery: 999, pauseGap: 0.4 },
  },
];

// Apply a style to an edit: the look, sounds and toggles change; words, cuts and effects stay.
export const applyStyle = (edit: Edit, s: EditingStyle): Edit => ({
  ...edit,
  style: { ...s.style },
  sound: { ...edit.sound, ...s.sound },
  toggles: { ...s.toggles },
  styleId: s.id,
});
