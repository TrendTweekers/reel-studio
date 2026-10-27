// Cover still for the Reel (1080x1920) and for the profile grid (1080x1440, the middle 3:4 crop).
// Everything is laid out on the full 9:16 canvas; the grid version just shows its middle band,
// so the grid file is an exact preview of what Instagram crops.
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { lightFilter } from './parts/Vibe';
import { COVER_GRID, HEIGHT, WIDTH, type CoverProps } from '../shared/types';
import { CREAM, isDark } from './color';
import { fontFamily } from './fonts';
import { clamp, overlaps, type Rect } from './model';

const BAND_TOP = (HEIGHT - COVER_GRID.height) / 2; // 240
const BAND_BOTTOM = BAND_TOP + COVER_GRID.height; // 1680
const MARGIN = 80; // breathing room inside the grid band
const SIDE = 72;
const TEXT_W = WIDTH - 2 * SIDE;
const FACE_GAP = 44;

type Block = { size: number; accentSize: number; h: number };

const lineCount = (text: string, size: number, italic = false) =>
  text ? Math.max(1, Math.ceil((text.length * size * (italic ? 0.46 : 0.5)) / TEXT_W)) : 0;

// Font size for a magazine-style title: as big as fits, at most 3 lines, the longest word on one line.
const measure = (title: string, accent: string, k = 1): Block => {
  const longestWord = Math.max(4, ...`${title} ${accent}`.split(/\s+/).map((w) => w.length));
  const chars = Math.max(title.length, 1);
  const lines = chars <= 10 ? 1 : chars <= 24 ? 2 : 3;
  let size = Math.min(190, (TEXT_W * lines) / (chars * 0.5), TEXT_W / (longestWord * 0.56));
  size = clamp(size, 84, 190) * k;
  const accentSize = size * 0.86;
  const h =
    lineCount(title, size) * size * 0.98 +
    (accent ? lineCount(accent, accentSize, true) * accentSize * 1.0 + size * 0.06 : 0);
  return { size, accentSize, h };
};

type Placement = { top: number; block: Block; edge: 'top' | 'bottom' | 'center' };

const place = (layout: 'top' | 'center' | 'bottom', title: string, accent: string, face: Rect | null): Placement => {
  const lo = BAND_TOP + MARGIN;
  const hi = BAND_BOTTOM - MARGIN;
  const full = measure(title, accent);
  const at = (edge: Placement['edge'], b: Block): number =>
    edge === 'top' ? lo : edge === 'bottom' ? hi - b.h : (lo + hi) / 2 - b.h / 2;
  const hits = (top: number, b: Block) =>
    face !== null && overlaps({ x: SIDE, y: top, w: TEXT_W, h: b.h }, face, FACE_GAP);

  if (!hits(at(layout, full), full)) return { top: at(layout, full), block: full, edge: layout };
  if (!face) return { top: at(layout, full), block: full, edge: layout };

  // Free room above and below the face, inside the band.
  const above = face.y - FACE_GAP - lo;
  const below = hi - (face.y + face.h + FACE_GAP);
  const order: ('above' | 'below')[] =
    layout === 'top' ? ['above', 'below'] : layout === 'bottom' ? ['below', 'above'] : above >= below ? ['above', 'below'] : ['below', 'above'];
  // Prefer the layout's own side at full size, then the other side at full size, then shrink (to 65%).
  for (const k of [1, 0.9, 0.8, 0.72, 0.65]) {
    const b = measure(title, accent, k);
    for (const side of order) {
      if (side === 'above' && above >= b.h) return { top: lo, block: b, edge: 'top' };
      if (side === 'below' && below >= b.h) return { top: hi - b.h, block: b, edge: 'bottom' };
    }
  }
  // Nothing fits cleanly: the bigger free side, as small as allowed.
  const b = measure(title, accent, 0.65);
  return above >= below ? { top: lo, block: b, edge: 'top' } : { top: hi - b.h, block: b, edge: 'bottom' };
};

// Faint static film grain (a still has no frames to animate).
const Grain: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.13, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
    <svg width="100%" height="100%">
      <filter id="cover-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#cover-grain)" />
    </svg>
  </AbsoluteFill>
);

export const Cover: React.FC<CoverProps> = ({ cover, style, light, urls, face, grid }) => {
  const hookFont = fontFamily(style.hookFont);
  const title = (cover.title ?? '').trim();
  const accent = (cover.accent ?? '').trim();
  const showText = cover.layout !== 'none' && (title || accent);
  const faceRect: Rect | null = face
    ? { x: face.x * WIDTH, y: face.y * HEIGHT, w: face.w * WIDTH, h: face.h * HEIGHT }
    : null;
  const p = showText ? place(cover.layout as 'top' | 'center' | 'bottom', title || accent, title ? accent : '', faceRect) : null;
  const darkText = isDark(style.hookColor);
  const scrimColor = darkText ? '245,239,230' : '12,10,8';
  const scrimA = darkText ? 0.5 : 0.42;

  let scrim: React.CSSProperties | null = null;
  if (p) {
    const pad = 300;
    const top = p.top - pad;
    const h = p.block.h + pad * 2;
    const dir = p.edge === 'top' ? 'to bottom' : p.edge === 'bottom' ? 'to top' : 'to bottom';
    scrim =
      p.edge === 'center'
        ? {
            top,
            height: h,
            background: `linear-gradient(to bottom, rgba(${scrimColor},0) 0%, rgba(${scrimColor},${scrimA * 0.8}) 35%, rgba(${scrimColor},${scrimA * 0.8}) 65%, rgba(${scrimColor},0) 100%)`,
          }
        : {
            top: p.edge === 'top' ? 0 : top,
            height: p.edge === 'top' ? p.top + p.block.h + pad : HEIGHT - top,
            background: `linear-gradient(${dir}, rgba(${scrimColor},${scrimA}) 0%, rgba(${scrimColor},${scrimA * 0.75}) 45%, rgba(${scrimColor},0) 100%)`,
          };
  }

  const canvas = (
    <div style={{ position: 'absolute', left: 0, top: grid ? -BAND_TOP : 0, width: WIDTH, height: HEIGHT }}>
      <Img src={urls.frame} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: lightFilter(light) }} />
      {style.vibe === 'glow' ? (
        <AbsoluteFill style={{ background: 'rgba(255,240,226,0.08)', mixBlendMode: 'screen' }} />
      ) : null}
      {scrim ? <div style={{ position: 'absolute', left: 0, right: 0, ...scrim }} /> : null}
      {p ? (
        <div
          style={{
            position: 'absolute',
            left: SIDE,
            width: TEXT_W,
            top: p.top,
            textAlign: 'center',
            fontFamily: hookFont,
            color: style.hookColor,
            textShadow: darkText ? '0 2px 20px rgba(255,250,240,0.35)' : '0 3px 30px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.2)',
            textWrap: 'balance',
          }}
        >
          <div style={{ fontSize: p.block.size, lineHeight: 0.98, letterSpacing: '-0.035em', fontWeight: 400 }}>
            {title || accent}
          </div>
          {title && accent ? (
            <div
              style={{
                fontSize: p.block.accentSize,
                lineHeight: 1.0,
                fontStyle: 'italic',
                letterSpacing: '-0.02em',
                marginTop: p.block.size * 0.06,
              }}
            >
              {accent}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
      {canvas}
      {style.vibe === 'film' ? <Grain /> : null}
      {style.vibe === 'editorial' ? (
        <div style={{ position: 'absolute', inset: 30, border: `1.5px solid ${CREAM}`, opacity: 0.85 }} />
      ) : null}
    </AbsoluteFill>
  );
};
