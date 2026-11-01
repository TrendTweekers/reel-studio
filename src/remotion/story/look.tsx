// The three print/film looks (gazeta, riso, noir): textures and the picture treatment.
// Everything here is CSS or a static SVG; the only per-frame values come from remotion's seeded
// random(), so a frame always renders the same way (the render farm splits frames across tabs).
import React from 'react';
import { Img, random } from 'remotion';
import { GAZETA, mix, RISO, rgb01, type Theme } from './kit';

// An SVG noise tile as a CSS url(). Static images are rasterised once by Chrome, then only moved.
export const noiseTile = (o: { size: number; freq: number; seed: number; matrix: string; octaves?: number }) => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${o.size}' height='${o.size}'>` +
    `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${o.freq}' numOctaves='${o.octaves ?? 2}' seed='${o.seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='matrix' values='${o.matrix}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
};
// Colour c with alpha driven by the noise (k = contrast, b = offset): speckles of one ink.
export const speckMatrix = (c: string, k: number, b: number) => {
  const [r, g, bl] = rgb01(c);
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${bl} ${k} 0 0 0 ${b}`;
};

// A dot screen: two offset grids make the 45 degree pattern of a printed tint.
export const dotScreen = (color: string, pitch: number, r: number) => {
  const dot = `radial-gradient(circle, ${color} 0 ${r}px, transparent ${r + 0.8}px)`;
  return { backgroundImage: `${dot}, ${dot}`, backgroundSize: `${pitch}px ${pitch}px`, backgroundPosition: `0 0, ${pitch / 2}px ${pitch / 2}px` } as React.CSSProperties;
};

// Film flicker: a small seeded brightness wobble per frame, shared by the page and the pictures.
export const flicker = (frame: number) => 1 + (random(`flicker-${frame}`) - 0.5) * 0.06 + Math.sin(frame * 0.9) * 0.008;

// Duotone defs: luminance mapped ink -> second ink -> paper. soft blends a little of the original
// back in, for screenshots that must stay readable.
export const PhotoDefs: React.FC<{ theme: Theme }> = ({ theme }) => {
  if (theme.photo !== 'duotone') return null;
  // shadows in blue-black, mid tones in the warm ink, highlights left as bare paper
  const [a, m, b, c] = [rgb01(RISO.ink), rgb01(mix(RISO.ink, theme.ink2, 0.35)), rgb01(theme.ink2), rgb01(RISO.paper)];
  const table = (i: number) => `${a[i]} ${m[i]} ${b[i]} ${c[i]}`;
  const tone = (
    <>
      <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={table(0)} />
        <feFuncG type="table" tableValues={table(1)} />
        <feFuncB type="table" tableValues={table(2)} />
      </feComponentTransfer>
    </>
  );
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <filter id="story-duo" colorInterpolationFilters="sRGB">
        {tone}
      </filter>
      <filter id="story-duo-soft" colorInterpolationFilters="sRGB">
        {tone}
        <feComposite in2="SourceGraphic" operator="arithmetic" k2={0.55} k3={0.45} />
      </filter>
    </svg>
  );
};

// The CSS filter for a picture (soft = a screenshot: lighter touch so the UI stays readable).
export const photoFilter = (theme: Theme, frame: number, soft = false): string | undefined => {
  switch (theme.photo) {
    case 'halftone':
      return soft ? 'grayscale(0.5) contrast(1.04)' : 'grayscale(1) contrast(1.18) brightness(1.04)';
    case 'duotone':
      return soft ? 'url(#story-duo-soft)' : 'url(#story-duo) contrast(1.06)';
    case 'film':
      return `sepia(${soft ? 0.12 : 0.3}) saturate(${soft ? 0.9 : 0.75}) contrast(1.14) brightness(${(soft ? 0.96 : 0.97) * flicker(frame)})`;
    default:
      return undefined;
  }
};

// Layers over a picture (inside its clipped box): paper tint and dot screen, print grain, film burn.
export const PhotoGrade: React.FC<{ theme: Theme; soft?: boolean }> = ({ theme, soft }) => {
  const fill: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
  if (theme.photo === 'halftone')
    return (
      <>
        <div style={{ ...fill, background: GAZETA.paper, mixBlendMode: 'multiply', opacity: soft ? 0.5 : 0.9 }} />
        <div style={{ ...fill, ...dotScreen(GAZETA.ink, 7, 1.1), mixBlendMode: 'multiply', opacity: soft ? 0.12 : 0.22 }} />
      </>
    );
  if (theme.photo === 'duotone')
    return (
      <div
        style={{
          ...fill,
          backgroundImage: noiseTile({ size: 300, freq: 0.9, seed: 11, matrix: speckMatrix(RISO.paper, 9, -5.8) }),
          opacity: soft ? 0.3 : 0.45,
        }}
      />
    );
  if (theme.photo === 'film')
    return <div style={{ ...fill, background: 'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 120%)', opacity: soft ? 0.4 : 1 }} />;
  return null;
};

// The halftone itself (gazeta pictures): the grey picture times a dot field, thresholded hard by
// contrast(), so dark areas print as big dots and light areas as small ones. Lies on top of a faint
// continuous copy so the picture stays calm, not a stencil.
export const HalftoneCopy: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', filter: 'contrast(14)', mixBlendMode: 'multiply', opacity: 0.62, background: '#fff' }}>
    <Img src={src} style={{ ...style, objectFit: 'cover', display: 'block', filter: 'grayscale(1) contrast(1.2) blur(0.8px)' }} />
    <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.5 }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(circle, #4d4d4d 0, #fff 4.6px)',
        backgroundSize: '7px 7px',
        mixBlendMode: 'multiply',
      }}
    />
  </div>
);
