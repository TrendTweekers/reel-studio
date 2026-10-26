// Font loading for the Reel. Each family loads lazily, the first time a composition asks for it,
// so a render only downloads the two families the edit uses. loadFont() blocks rendering
// (delayRender) until the files are ready, in the Player and in renderMedia alike.
import * as PlayfairDisplay from '@remotion/google-fonts/PlayfairDisplay';
import * as CormorantGaramond from '@remotion/google-fonts/CormorantGaramond';
import * as BodoniModa from '@remotion/google-fonts/BodoniModa';
import * as DMSerifDisplay from '@remotion/google-fonts/DMSerifDisplay';
import * as InstrumentSerif from '@remotion/google-fonts/InstrumentSerif';
import * as Fraunces from '@remotion/google-fonts/Fraunces';
import * as Inter from '@remotion/google-fonts/Inter';
import * as Montserrat from '@remotion/google-fonts/Montserrat';
import * as DMSans from '@remotion/google-fonts/DMSans';
import * as CourierPrime from '@remotion/google-fonts/CourierPrime';

const SUBSETS: ('latin' | 'latin-ext')[] = ['latin', 'latin-ext']; // latin-ext = Polish letters

const HELVETICA = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = 'Helvetica, Arial, sans-serif';

type Loader = () => string;

const loaders: Record<string, Loader> = {
  'Playfair Display': () => {
    PlayfairDisplay.loadFont('normal', { weights: ['400', '500', '700'], subsets: SUBSETS });
    return PlayfairDisplay.loadFont('italic', { weights: ['400', '500'], subsets: SUBSETS }).fontFamily;
  },
  'Cormorant Garamond': () => {
    CormorantGaramond.loadFont('normal', { weights: ['400', '500', '700'], subsets: SUBSETS });
    return CormorantGaramond.loadFont('italic', { weights: ['400', '500'], subsets: SUBSETS }).fontFamily;
  },
  'Bodoni Moda': () => {
    BodoniModa.loadFont('normal', { weights: ['400', '500', '700'], subsets: SUBSETS });
    return BodoniModa.loadFont('italic', { weights: ['400', '500'], subsets: SUBSETS }).fontFamily;
  },
  'DM Serif Display': () => {
    DMSerifDisplay.loadFont('normal', { weights: ['400'], subsets: SUBSETS });
    return DMSerifDisplay.loadFont('italic', { weights: ['400'], subsets: SUBSETS }).fontFamily;
  },
  'Instrument Serif': () => {
    InstrumentSerif.loadFont('normal', { weights: ['400'], subsets: SUBSETS });
    return InstrumentSerif.loadFont('italic', { weights: ['400'], subsets: SUBSETS }).fontFamily;
  },
  Fraunces: () => {
    Fraunces.loadFont('normal', { weights: ['300', '400', '700'], subsets: SUBSETS });
    return Fraunces.loadFont('italic', { weights: ['300', '400'], subsets: SUBSETS }).fontFamily;
  },
  Inter: () => Inter.loadFont('normal', { weights: ['400', '500', '600', '700'], subsets: SUBSETS }).fontFamily,
  Montserrat: () =>
    Montserrat.loadFont('normal', { weights: ['400', '500', '600', '700'], subsets: SUBSETS }).fontFamily,
  'DM Sans': () => DMSans.loadFont('normal', { weights: ['400', '500', '600', '700'], subsets: SUBSETS }).fontFamily,
  'Courier Prime': () => CourierPrime.loadFont('normal', { weights: ['400', '700'], subsets: SUBSETS }).fontFamily,
};

const SERIFS = new Set([
  'Playfair Display',
  'Cormorant Garamond',
  'Bodoni Moda',
  'DM Serif Display',
  'Instrument Serif',
  'Fraunces',
]);

const loaded = new Map<string, string>();

// CSS font-family stack for a HOOK_FONTS / SUBTITLE_FONTS name. Loads the font on first use.
export const fontFamily = (name: string): string => {
  if (name === 'Helvetica Neue') return HELVETICA;
  const cached = loaded.get(name);
  if (cached) return cached;
  const loader = loaders[name];
  if (!loader) return HELVETICA;
  const family = loader();
  const stack = `'${family}', ${SERIFS.has(name) ? SERIF_FALLBACK : name === 'Courier Prime' ? "'Courier New', monospace" : SANS_FALLBACK}`;
  loaded.set(name, stack);
  return stack;
};

// Serif used for small editorial details (chapter titles, corner text) when the hook font is loaded anyway.
export const isSerif = (name: string) => SERIFS.has(name);

// Hook fonts that ship a real bold (700). The others get their regular weight (no faux bold).
const BOLD = new Set(['Playfair Display', 'Cormorant Garamond', 'Bodoni Moda', 'Fraunces']);
export const boldWeight = (name: string) => (BOLD.has(name) ? 700 : 400);
