// The paper under every scene, the small page number on top, and the scene transitions.
// One visual language: a soft rise out of a slight blur. Three variants so cuts do not repeat:
// rise (up out of blur), unveil (a hairline sweeps up and uncovers the scene), focus (settles from 106%).
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { BOX, CLAMP, CREAM, draw, ease, mix, serif, type Theme } from './kit';

export const OUT = 8; // frames the old scene keeps fading while the next one comes in
const IN = 14;

// Paper grain is static (one SVG noise, no per-frame cost); only a soft light drifts across it.
export const Background: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const lx = 50 + Math.sin(t * 0.21) * 18;
  const ly = 28 + Math.cos(t * 0.17) * 10;
  // A saturated accent paper takes less light, or it reads as a white blotch.
  const light = theme.dark ? 'rgba(255,240,220,0.07)' : theme.bg === CREAM ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.26)';
  const edge = theme.dark ? 'rgba(0,0,0,0.45)' : mix(theme.bg, '#5a4632', 0.22);
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 45% at ${lx}% ${ly}%, ${light} 0%, rgba(255,255,255,0) 70%)` }} />
      <AbsoluteFill
        style={{ background: `radial-gradient(ellipse 85% 75% at 50% 42%, rgba(0,0,0,0) 58%, ${edge} 140%)`, opacity: theme.dark ? 1 : 0.55 }}
      />
      <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity: theme.dark ? 0.08 : 0.07, mixBlendMode: theme.dark ? 'screen' : 'multiply' }}>
        <filter id="story-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#story-paper)" />
      </svg>
    </AbsoluteFill>
  );
};

// "N° 03" and a hairline that draws to the right edge with each new scene.
const Folio: React.FC<{ index: number; count: number; theme: Theme; first: boolean }> = ({ index, count, theme, first }) => {
  const frame = useCurrentFrame();
  const { hookFont } = useReel();
  const r = first ? 1 : draw(frame, 4, 26);
  const n = String(index + 1).padStart(2, '0');
  const of = String(count).padStart(2, '0');
  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y - 64, width: BOX.w, display: 'flex', alignItems: 'center', gap: 22, color: theme.soft }}>
      <div style={{ ...serif(hookFont, 34, true), whiteSpace: 'nowrap' }}>
        N° {n}
        <span style={{ opacity: 0.55 }}> / {of}</span>
      </div>
      <div style={{ flex: 1, height: 1.5, background: theme.faint, transformOrigin: '0 50%', transform: `scaleX(${r})` }} />
    </div>
  );
};

export const SceneShell: React.FC<{
  index: number;
  count: number;
  frames: number;
  exitAtEnd: boolean; // the last scene fades out into the end card
  theme: Theme;
  children: React.ReactNode;
}> = ({ index, count, frames, exitAtEnd, theme, children }) => {
  const frame = useCurrentFrame();
  const first = index === 0;
  // The new scene waits a few frames so the two texts barely overlap.
  const e = first ? 1 : ease(frame, 4, IN);
  const xStart = exitAtEnd ? frames - OUT : frames;
  const x = interpolate(frame, [xStart, xStart + OUT], [1, 0], { ...CLAMP, easing: Easing.out(Easing.quad) });
  const variant = first ? -1 : (index - 1) % 3;

  let style: React.CSSProperties = {};
  let sweep: number | null = null;
  if (variant === 0) style = { opacity: e, transform: `translateY(${(1 - e) * 44}px)`, filter: e < 0.99 ? `blur(${(1 - e) * 9}px)` : undefined };
  else if (variant === 1) {
    const edge = (1 - e) * 100;
    style = { clipPath: `inset(${edge}% 0 0 0)`, transform: `translateY(${(1 - e) * 18}px)` };
    sweep = e < 0.995 ? edge : null;
  } else if (variant === 2) style = { opacity: e, transform: `scale(${1.06 - 0.06 * e})`, filter: e < 0.99 ? `blur(${(1 - e) * 6}px)` : undefined };

  // Exit, same for all: lift a little, soften, fade.
  const exitStyle: React.CSSProperties =
    x < 1 ? { opacity: x, transform: `translateY(${(1 - x) * -26}px)`, filter: `blur(${(1 - x) * 5}px)` } : {};

  return (
    <AbsoluteFill style={exitStyle}>
      <AbsoluteFill style={style}>
        <Folio index={index} count={count} theme={theme} first={first} />
        {children}
      </AbsoluteFill>
      {sweep !== null ? (
        <div style={{ position: 'absolute', left: 0, width: WIDTH, top: (sweep / 100) * HEIGHT - 1, height: 2, background: theme.line, opacity: Math.min(1, sweep / 12) }} />
      ) : null}
    </AbsoluteFill>
  );
};
