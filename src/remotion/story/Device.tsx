// Device frames for the product scenes: a phone, a browser window or a plain rounded picture,
// drawn in the theme colours (ink body on cream, cream body on ink). The screenshot inside is laid
// out with "cover" maths we can query, so a click point on the picture maps to a screen position.
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { mix, type Theme } from './kit';

export type FrameKind = 'phone' | 'browser' | 'plain';

// The picture's width / height, measured before the frame renders (delayRender). 'missing' when the
// file does not load: the scene then shows an empty screen instead of a broken picture.
export const useImageAspect = (src: string | null): number | 'missing' | null => {
  const [state, setState] = useState<number | 'missing' | null>(src ? null : 'missing');
  const [handle] = useState(() => (src ? delayRender(`story picture ${src}`, { timeoutInMilliseconds: 20000 }) : null));
  useEffect(() => {
    if (!src || handle === null) return;
    const img = new Image();
    img.onload = () => {
      setState(img.naturalWidth / Math.max(1, img.naturalHeight));
      continueRender(handle);
    };
    img.onerror = () => {
      setState('missing');
      continueRender(handle);
    };
    img.src = src;
  }, [src, handle]);
  return state;
};

export type Box = { x: number; y: number; w: number; h: number };
export type DeviceLayout = { kind: FrameKind; outer: Box; screen: Box; radius: number; screenRadius: number };

const BAR = 62; // browser toolbar height
const BEZEL = 13;

// Biggest frame that fits maxW x maxH, centred on cx and top-aligned at top.
export const deviceLayout = (kind: FrameKind, aspect: number, cx: number, top: number, maxW: number, maxH: number): DeviceLayout => {
  if (kind === 'phone') {
    const h = Math.min(maxH, 900, (maxW / 0.49) | 0);
    const w = Math.round(h * 0.49);
    const outer = { x: cx - w / 2, y: top + (maxH - h) / 2, w, h };
    return { kind, outer, screen: { x: outer.x + BEZEL, y: outer.y + BEZEL, w: w - 2 * BEZEL, h: h - 2 * BEZEL }, radius: 72, screenRadius: 59 };
  }
  if (kind === 'browser') {
    const w = maxW;
    const sh = Math.min(maxH - BAR, Math.round(w / Math.max(0.3, aspect)));
    const outer = { x: cx - w / 2, y: top + (maxH - sh - BAR) / 2, w, h: sh + BAR };
    return { kind, outer, screen: { x: outer.x, y: outer.y + BAR, w, h: sh }, radius: 22, screenRadius: 0 };
  }
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const outer = { x: cx - w / 2, y: top + (maxH - h) / 2, w, h };
  return { kind, outer, screen: outer, radius: 20, screenRadius: 20 };
};

// How the picture covers the screen when the point `focus` (0..1 on the picture) is as central as
// the picture allows. Returns the picture size and its offset inside the screen, in px.
export const cover = (aspect: number, screen: { w: number; h: number }, focus: { x: number; y: number }, zoom = 1) => {
  const s = Math.max(screen.w / aspect, screen.h) * zoom;
  const w = s * aspect;
  const h = s;
  const clampOff = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const x = clampOff(focus.x * w - screen.w / 2, w - screen.w);
  const y = clampOff(focus.y * h - screen.h / 2, h - screen.h);
  return { w, h, x, y };
};

// The frame around `children` (the screen content, already sized to layout.screen).
export const DeviceFrame: React.FC<{ layout: DeviceLayout; theme: Theme; children: React.ReactNode; style?: React.CSSProperties }> = ({ layout, theme, children, style }) => {
  const { kind, outer, screen, radius, screenRadius } = layout;
  const shadow = theme.dark ? '0 40px 80px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.35)' : '0 40px 80px rgba(60,40,20,0.22), 0 8px 22px rgba(60,40,20,0.12)';
  const screenBox = (
    <div style={{ position: 'absolute', left: screen.x - outer.x, top: screen.y - outer.y, width: screen.w, height: screen.h, overflow: 'hidden', borderRadius: screenRadius, background: mix(theme.bg, theme.text, 0.07), boxShadow: kind === 'phone' ? `0 0 0 2.5px ${mix(theme.text, theme.bg, 0.55)}` : undefined }}>
      {children}
    </div>
  );
  if (kind === 'phone') {
    // Body in the text colour, a fine highlight ring, the island and two side keys.
    const body = theme.text;
    return (
      <div style={{ position: 'absolute', left: outer.x, top: outer.y, width: outer.w, height: outer.h, ...style }}>
        <div style={{ position: 'absolute', left: -4, top: outer.h * 0.2, width: 4, height: 70, borderRadius: 2, background: body }} />
        <div style={{ position: 'absolute', left: -4, top: outer.h * 0.2 + 90, width: 4, height: 110, borderRadius: 2, background: body }} />
        <div style={{ position: 'absolute', right: -4, top: outer.h * 0.26, width: 4, height: 140, borderRadius: 2, background: body }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: radius, background: body, boxShadow: `${shadow}, inset 0 0 0 2px ${mix(body, theme.bg, 0.25)}` }} />
        {screenBox}
        <div style={{ position: 'absolute', left: outer.w / 2 - 58, top: BEZEL + 16, width: 116, height: 34, borderRadius: 17, background: body }} />
      </div>
    );
  }
  if (kind === 'browser') {
    const chrome = mix(theme.bg, theme.text, theme.dark ? 0.1 : 0.05);
    const dot = mix(chrome, theme.text, 0.3);
    return (
      <div style={{ position: 'absolute', left: outer.x, top: outer.y, width: outer.w, height: outer.h, borderRadius: radius, overflow: 'hidden', background: chrome, boxShadow: `${shadow}, 0 0 0 1.5px ${mix(theme.bg, theme.text, 0.18)}`, ...style }}>
        <div style={{ position: 'absolute', left: 26, top: 0, height: BAR, display: 'flex', alignItems: 'center', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 15, height: 15, borderRadius: 8, background: dot }} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 150, right: 150, top: 14, height: BAR - 28, borderRadius: 17, background: mix(chrome, theme.bg, theme.dark ? 0.6 : 1), boxShadow: `inset 0 0 0 1px ${mix(chrome, theme.text, 0.12)}` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: BAR - 1, height: 1, background: mix(chrome, theme.text, 0.14) }} />
        {screenBox}
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', left: outer.x, top: outer.y, width: outer.w, height: outer.h, borderRadius: radius, boxShadow: shadow, ...style }}>
      {screenBox}
    </div>
  );
};

// An empty screen for a missing picture: quiet tone and a short accent rule, never a broken image.
export const EmptyScreen: React.FC<{ theme: Theme }> = ({ theme }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: mix(theme.bg, theme.text, 0.07) }}>
    <div style={{ width: 70, height: 1.5, background: theme.line }} />
  </div>
);
