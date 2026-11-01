// The paper under every scene, the small page number on top, and the scene transitions.
// One visual language: a soft rise out of a slight blur. Three variants so cuts do not repeat:
// rise (up out of blur), unveil (a hairline sweeps up and uncovers the scene), focus (settles from 106%).
import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { withAlpha } from '../color';
import { BOX, caps, CLAMP, CREAM, draw, ease, GAZETA, mix, RISO, serif, type Theme } from './kit';
import { dotScreen, flicker, noiseTile, PhotoDefs, speckMatrix } from './look';

export const OUT = 8; // frames the old scene keeps fading while the next one comes in
const IN = 14;

// Paper grain is static (one SVG noise, no per-frame cost); only a soft light drifts across it.
const PlainPaper: React.FC<{ theme: Theme }> = ({ theme }) => {
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
      <Fibre opacity={theme.dark ? 0.08 : 0.07} screen={theme.dark} />
    </AbsoluteFill>
  );
};

const Fibre: React.FC<{ opacity: number; screen?: boolean; freq?: number }> = ({ opacity, screen, freq = 0.85 }) => (
  <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity, mixBlendMode: screen ? 'screen' : 'multiply' }}>
    <filter id={`story-paper-${freq}`}>
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={7} />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter={`url(#story-paper-${freq})`} />
  </svg>
);

// Newsprint: grey-warm paper, a faint dot screen over the whole page, slightly aged edges. Still.
const Gazeta: React.FC<{ theme: Theme }> = ({ theme }) => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <AbsoluteFill style={{ ...dotScreen(GAZETA.ink, 6, 0.9), opacity: 0.07 }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 80% at 50% 45%, rgba(0,0,0,0) 60%, ${mix(theme.bg, '#6b5a3e', 0.35)} 150%)`, opacity: 0.7 }} />
    <AbsoluteFill style={{ backgroundImage: noiseTile({ size: 360, freq: 0.55, seed: 21, matrix: speckMatrix(GAZETA.ink, 8, -5.6) }), opacity: 0.35 }} />
    <Fibre opacity={0.1} freq={0.6} />
  </AbsoluteFill>
);

// Riso: cream stock, a tint of the second ink printed as a dot gradient in one corner, and speckled
// ink grain. The grain over the type comes from <LookTop>.
const Riso: React.FC<{ theme: Theme }> = ({ theme }) => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <AbsoluteFill
      style={{
        ...dotScreen(theme.ink2, 9, 2.6),
        opacity: 0.5,
        WebkitMaskImage: 'radial-gradient(ellipse 70% 40% at 100% 0%, #000 0%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 70% 40% at 100% 0%, #000 0%, transparent 100%)',
      }}
    />
    <AbsoluteFill
      style={{
        ...dotScreen(RISO.ink, 9, 2.2),
        opacity: 0.22,
        WebkitMaskImage: 'radial-gradient(ellipse 60% 30% at 0% 100%, #000 0%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 60% 30% at 0% 100%, #000 0%, transparent 100%)',
      }}
    />
    <AbsoluteFill style={{ backgroundImage: noiseTile({ size: 320, freq: 0.75, seed: 3, matrix: speckMatrix(RISO.ink, 7, -4.6) }), opacity: 0.55 }} />
    <AbsoluteFill style={{ backgroundImage: noiseTile({ size: 320, freq: 0.7, seed: 5, matrix: speckMatrix(theme.ink2, 7, -4.8) }), opacity: 0.45 }} />
    <Fibre opacity={0.1} freq={0.6} />
  </AbsoluteFill>
);

// Film: near black with a warm pool of light that breathes; grain, bars and flicker sit on top.
const Noir: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const lx = 50 + Math.sin(frame / 30 * 0.15) * 8;
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 50% at ${lx}% 38%, rgba(120,82,40,0.22) 0%, rgba(0,0,0,0) 70%)` }} />
    </AbsoluteFill>
  );
};

export const Background: React.FC<{ theme: Theme }> = ({ theme }) => {
  if (theme.look === 'gazeta') return <Gazeta theme={theme} />;
  if (theme.look === 'riso') return <Riso theme={theme} />;
  if (theme.look === 'noir') return <Noir theme={theme} />;
  return <PlainPaper theme={theme} />;
};

// Above all scenes: riso ink drop-outs over the type, and for film the moving grain, vignette,
// flicker and the letterbox bars.
const GRAIN = [1, 2, 3, 4].map((seed) => noiseTile({ size: 256, freq: 0.95, seed, octaves: 2, matrix: '0.9 0 0 0 0.06  0.8 0 0 0 0.03  0.65 0 0 0 0  0 0 0 0 1' }));
export const LookTop: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  if (theme.look === 'riso')
    return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: noiseTile({ size: 280, freq: 0.9, seed: 9, matrix: speckMatrix(RISO.paper, 10, -6.6) }), opacity: 0.6 }} />;
  if (theme.look !== 'noir') return null;
  // Grain: one of four tiles, jumped to a seeded offset every frame, like real film.
  const ox = Math.floor(random(`gx-${frame}`) * 256);
  const oy = Math.floor(random(`gy-${frame}`) * 256);
  const f = flicker(frame);
  const bar = theme.letterbox;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ backgroundImage: GRAIN[frame % 4], backgroundPosition: `${ox}px ${oy}px`, mixBlendMode: 'overlay', opacity: 0.42 }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 78% 62% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.72) 125%)' }} />
      <AbsoluteFill style={{ background: f > 1 ? `rgba(255,236,200,${(f - 1) * 0.5})` : `rgba(0,0,0,${(1 - f) * 0.9})` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: WIDTH, height: bar, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: WIDTH, height: bar, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, top: bar, width: WIDTH, height: 1, background: 'rgba(210,168,94,0.18)' }} />
      <div style={{ position: 'absolute', left: 0, bottom: bar, width: WIDTH, height: 1, background: 'rgba(210,168,94,0.18)' }} />
    </AbsoluteFill>
  );
};

// "N° 03" and a hairline that draws to the right edge with each new scene. Each look has its own
// version: a newspaper dateline, a big riso numeral, a centred film slate.
const Folio: React.FC<{ index: number; count: number; theme: Theme; first: boolean }> = ({ index, count, theme, first }) => {
  const frame = useCurrentFrame();
  const { hookFont, subFont } = useReel();
  const r = first ? 1 : draw(frame, 4, 26);
  const n = String(index + 1).padStart(2, '0');
  const of = String(count).padStart(2, '0');
  if (theme.look === 'gazeta') {
    const rule = (h: number) => <div style={{ height: h, background: theme.text, transformOrigin: '0 50%', transform: `scaleX(${r})` }} />;
    return (
      <div style={{ position: 'absolute', left: BOX.x, top: BOX.y - 92, width: BOX.w, color: theme.text }}>
        {rule(3)}
        <div style={{ height: 4 }} />
        {rule(1)}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', padding: '12px 0 10px' }}>
          <div style={{ ...caps(hookFont, 22), letterSpacing: '0.24em' }}>
            Nr {n} <span style={{ opacity: 0.55 }}>/ {of}</span>
          </div>
        </div>
        {rule(1)}
      </div>
    );
  }
  if (theme.look === 'riso') {
    return (
      <div style={{ position: 'absolute', left: BOX.x, top: BOX.y - 112, width: BOX.w, display: 'flex', alignItems: 'flex-end', gap: 18, color: theme.text }}>
        <div style={{ fontFamily: subFont, fontWeight: 700, fontSize: 84, lineHeight: 0.8, letterSpacing: '-0.04em', color: theme.ink2, textShadow: `-3px -2px 0 ${withAlpha(RISO.ink, 0.85)}`, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
        <div style={{ fontFamily: subFont, fontWeight: 600, fontSize: 26, paddingBottom: 4, color: theme.soft }}>/ {of}</div>
        <div style={{ flex: 1, height: 3, marginBottom: 12, background: theme.text, borderRadius: 2, transformOrigin: '0 50%', transform: `scaleX(${r})` }} />
      </div>
    );
  }
  if (theme.look === 'noir') {
    return (
      <div style={{ position: 'absolute', left: BOX.x, top: BOX.y - 66, width: BOX.w, display: 'flex', alignItems: 'center', gap: 26, color: theme.line }}>
        <div style={{ flex: 1, height: 1, background: withAlpha(theme.line, 0.4), transformOrigin: '100% 50%', transform: `scaleX(${r})` }} />
        <div style={{ ...caps(hookFont, 24), whiteSpace: 'nowrap', marginRight: '-0.32em' }}>
          N° {n} <span style={{ opacity: 0.55 }}>/ {of}</span>
        </div>
        <div style={{ flex: 1, height: 1, background: withAlpha(theme.line, 0.4), transformOrigin: '0 50%', transform: `scaleX(${r})` }} />
      </div>
    );
  }
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

// The second plate slipping (print looks) or a soft gold edge light (film), on the whole scene.
// One CSS drop-shadow per scene layer: the scenes themselves stay untouched.
const contentFilter = (theme: Theme) => {
  const f: string[] = [];
  if (theme.misreg) f.push(`drop-shadow(${theme.misregPx}px ${theme.misregPx * 0.6}px 0 ${theme.misreg})`);
  if (theme.glow) f.push(`drop-shadow(0 0 7px ${theme.glow})`);
  return f.length ? f.join(' ') : undefined;
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
  const noir = theme.look === 'noir';
  // Film cuts do not slide or sweep: the old scene dips to black, the new one fades up from it.
  const variant = first ? -1 : noir ? 3 : (index - 1) % 3;

  let style: React.CSSProperties = {};
  let sweep: number | null = null;
  if (variant === 0) style = { opacity: e, transform: `translateY(${(1 - e) * 44}px)`, filter: e < 0.99 ? `blur(${(1 - e) * 9}px)` : undefined };
  else if (variant === 1) {
    const edge = (1 - e) * 100;
    style = { clipPath: `inset(${edge}% 0 0 0)`, transform: `translateY(${(1 - e) * 18}px)` };
    sweep = e < 0.995 ? edge : null;
  } else if (variant === 2) style = { opacity: e, transform: `scale(${1.06 - 0.06 * e})`, filter: e < 0.99 ? `blur(${(1 - e) * 6}px)` : undefined };
  else if (variant === 3) {
    const up = interpolate(frame, [7, 18], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
    style = { opacity: up, transform: `scale(${1.015 - 0.015 * up})` };
  }
  // The black between two film scenes: over the old scene, under the new one's content.
  const dip = variant === 3 ? interpolate(frame, [0, 5, 9, 16], [0, 1, 1, 0], CLAMP) : 0;

  // Exit, same for all: lift a little, soften, fade.
  const exitStyle: React.CSSProperties =
    x < 1 ? (noir ? { opacity: x } : { opacity: x, transform: `translateY(${(1 - x) * -26}px)`, filter: `blur(${(1 - x) * 5}px)` }) : {};
  const look = contentFilter(theme);

  return (
    <AbsoluteFill style={exitStyle}>
      {dip > 0 ? <AbsoluteFill style={{ background: '#000', opacity: dip }} /> : null}
      <AbsoluteFill style={style}>
        <PhotoDefs theme={theme} />
        <AbsoluteFill style={{ filter: look }}>
          <Folio index={index} count={count} theme={theme} first={first} />
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
      {sweep !== null ? (
        <div style={{ position: 'absolute', left: 0, width: WIDTH, top: (sweep / 100) * HEIGHT - 1, height: 2, background: theme.line, opacity: Math.min(1, sweep / 12) }} />
      ) : null}
    </AbsoluteFill>
  );
};
