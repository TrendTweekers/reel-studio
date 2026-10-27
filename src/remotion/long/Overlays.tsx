// Calm graphics over the long video: name tag, chapter cards, board pictures, small labels, subtitles.
// Every item lives in its own <Sequence> (they are few), so its animation reads a local frame.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, Sequence, useCurrentFrame } from 'remotion';
import type { Edit } from '../../shared/types';
import { CREAM, INK, isDark, withAlpha } from '../color';
import { shadowFor } from '../legibility';
import { lastAtOrBefore, type LongCard, type LongChapter, type LongModel, type LongNameTag } from './model';

const ease = Easing.bezier(0.22, 1, 0.36, 1); // soft, premium ease-out
const IN = 18;
const OUT = 14;

// 0..1 in, 1 while held, 1..0 out.
const presence = (f: number, frames: number, inF = IN, outF = OUT) =>
  Math.min(
    interpolate(f, [0, inF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }),
    interpolate(f, [frames - outF, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) }),
  );

type Fonts = { hook: string; sub: string; hookWeight: number };
type Style = Edit['style'];

// A soft dark glow in the lower corner behind lower-third text.
const CornerScrim: React.FC<{ m: LongModel; side: 'left' | 'right'; opacity: number; w: number; h: number }> = ({ m, side, opacity, w, h }) => (
  <div
    style={{
      position: 'absolute',
      [side]: 0,
      top: m.bottom - h * 1.15,
      width: w,
      height: h * 1.7,
      opacity,
      background: `radial-gradient(ellipse 100% 50% at ${side === 'left' ? '0%' : '100%'} 50%, rgba(10,8,6,0.4) 0%, rgba(10,8,6,0.24) 45%, rgba(10,8,6,0.08) 75%, rgba(10,8,6,0) 100%)`,
      pointerEvents: 'none',
    }}
  />
);

// ---------- name tag (lower third) ----------
const NameTagView: React.FC<{ m: LongModel; t: LongNameTag; fonts: Fonts; style: Style }> = ({ m, t, fonts, style }) => {
  const f = useCurrentFrame();
  const p = presence(f, t.frames, 22, 16);
  const lineP = presence(f - 8, t.frames - 8, 22, 12);
  const rule = interpolate(f, [4, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const u = m.u;
  const align = t.side === 'left' ? 'flex-start' : 'flex-end';
  const dx = (1 - p) * (t.side === 'left' ? -28 : 28) * u;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <CornerScrim m={m} side={t.side} opacity={p} w={m.W * (m.wide ? 0.5 : 0.95)} h={240 * u} />
      <div
        style={{
          position: 'absolute',
          [t.side]: m.margin,
          bottom: m.H - m.bottom,
          display: 'flex',
          flexDirection: 'column',
          alignItems: align,
          textAlign: t.side,
          color: CREAM,
        }}
      >
        <div
          style={{
            fontFamily: fonts.hook,
            fontSize: 80 * u,
            lineHeight: 1.0,
            letterSpacing: '-0.01em',
            opacity: p,
            transform: `translateX(${dx}px)`,
            textShadow: shadowFor(CREAM),
          }}
        >
          {t.name}
        </div>
        <div style={{ height: 1.5 * u, width: 72 * u * rule, background: style.accentColor, margin: `${16 * u}px 0 ${14 * u}px`, opacity: p }} />
        {t.line ? (
          <div
            style={{
              fontFamily: fonts.sub,
              fontSize: 21 * u,
              fontWeight: 500,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              opacity: lineP * 0.95,
              transform: `translateX(${(1 - lineP) * (t.side === 'left' ? -16 : 16) * u}px)`,
              textShadow: shadowFor(CREAM),
            }}
          >
            {t.line}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- chapter card ----------
const ChapterView: React.FC<{ m: LongModel; c: LongChapter; fonts: Fonts; style: Style; word: string }> = ({ m, c, fonts, style, word }) => {
  const f = useCurrentFrame();
  const p = presence(f, c.frames, 20, 16);
  const titleP = presence(f - 5, c.frames - 5, 22, 12);
  const rule = interpolate(f, [2, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const u = m.u;
  const dir = c.side === 'left' ? -1 : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <CornerScrim m={m} side={c.side} opacity={p} w={m.W * (m.wide ? 0.55 : 1)} h={280 * u} />
      <div
        style={{
          position: 'absolute',
          [c.side]: m.margin,
          bottom: m.H - m.bottom,
          maxWidth: m.W * (m.wide ? 0.44 : 0.84),
          display: 'flex',
          flexDirection: 'column',
          alignItems: c.side === 'left' ? 'flex-start' : 'flex-end',
          textAlign: c.side,
          color: CREAM,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 14 * u,
            opacity: p,
            transform: `translateX(${(1 - p) * dir * 20 * u}px)`,
            textShadow: shadowFor(CREAM),
          }}
        >
          <span style={{ fontFamily: fonts.hook, fontStyle: 'italic', fontSize: 34 * u, color: style.accentColor }}>
            {String(c.n).padStart(2, '0')}
          </span>
          <span style={{ fontFamily: fonts.sub, fontSize: 18 * u, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
            {word}
          </span>
        </div>
        <div style={{ height: 1.5 * u, width: 64 * u * rule, background: withAlpha(CREAM, 0.85), margin: `${14 * u}px 0 ${16 * u}px` }} />
        <div
          style={{
            fontFamily: fonts.hook,
            fontSize: 86 * u,
            lineHeight: 1.02,
            letterSpacing: '-0.015em',
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * 14 * u}px)`,
            textShadow: shadowFor(CREAM),
            textWrap: 'balance',
          }}
        >
          {c.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- board picture card ----------
const PictureView: React.FC<{ m: LongModel; c: LongCard; board: string; fonts: Fonts }> = ({ m, c, board, fonts }) => {
  const f = useCurrentFrame();
  const p = presence(f, c.frames, 22, 14);
  const u = m.u;
  const pad = 12 * u;
  const dir = c.side === 'right' ? 1 : -1;
  const capH = c.text ? 56 * u : 0;
  const imgH = c.h - pad * 2 - capH;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: c.x,
          top: c.y,
          transform: `translate(-50%, -50%) translateX(${(1 - p) * dir * 40 * u}px) scale(${0.97 + 0.03 * p})`,
          opacity: p,
          background: CREAM,
          padding: pad,
          paddingBottom: c.text ? 0 : pad,
          borderRadius: 3 * u,
          boxShadow: `0 ${22 * u}px ${60 * u}px rgba(0,0,0,0.34), 0 ${4 * u}px ${14 * u}px rgba(0,0,0,0.22)`,
        }}
      >
        <Img src={`${board}${encodeURIComponent(c.image ?? '')}`} style={{ display: 'block', height: imgH, width: 'auto', maxWidth: m.W * 0.4, objectFit: 'cover' }} />
        {c.text ? (
          <div
            style={{
              height: capH,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.hook,
              fontStyle: 'italic',
              fontSize: 28 * u,
              color: INK,
            }}
          >
            {c.text}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- small text label ----------
const LabelView: React.FC<{ m: LongModel; c: LongCard; fonts: Fonts; style: Style }> = ({ m, c, fonts, style }) => {
  const f = useCurrentFrame();
  const p = presence(f, c.frames, 16, 12);
  const u = m.u;
  const dir = c.side === 'right' ? 1 : -1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          [c.side]: c.side === 'right' ? m.W - c.x : c.x,
          top: c.y,
          opacity: p,
          transform: `translateX(${(1 - p) * dir * 24 * u}px)`,
          display: 'flex',
          alignItems: 'center',
          gap: 12 * u,
          padding: `${12 * u}px ${22 * u}px`,
          background: withAlpha(CREAM, 0.94),
          color: INK,
          borderRadius: 2 * u,
          boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.22)`,
          fontFamily: fonts.sub,
          fontSize: 22 * u,
          fontWeight: 500,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 7 * u, height: 7 * u, borderRadius: '50%', background: isDark(style.accentColor) ? style.accentColor : '#B08D57', flex: 'none' }} />
        {c.text}
      </div>
    </AbsoluteFill>
  );
};

export const Graphics: React.FC<{ m: LongModel; fonts: Fonts; style: Style; board: string; language: string }> = ({ m, fonts, style, board, language }) => {
  const word = language === 'pl' ? 'Rozdział' : 'Chapter';
  return (
    <>
      {m.cards.map((c) => (
        <Sequence key={c.id} name={`${c.kind} ${c.id}`} from={c.from} durationInFrames={c.frames} premountFor={c.kind === 'picture' ? 45 : 0}>
          {c.kind === 'picture' ? <PictureView m={m} c={c} board={board} fonts={fonts} /> : <LabelView m={m} c={c} fonts={fonts} style={style} />}
        </Sequence>
      ))}
      {m.chapters.map((c) => (
        <Sequence key={`ch-${c.n}`} name={`Chapter ${c.n}`} from={c.from} durationInFrames={c.frames} layout="none">
          <ChapterView m={m} c={c} fonts={fonts} style={style} word={word} />
        </Sequence>
      ))}
      {m.nameTag ? (
        <Sequence name="Name tag" from={m.nameTag.from} durationInFrames={m.nameTag.frames} layout="none">
          <NameTagView m={m} t={m.nameTag} fonts={fonts} style={style} />
        </Sequence>
      ) : null}
    </>
  );
};

// ---------- subtitles: 1 to 2 calm lines at the bottom, YouTube style ----------
export const SubtitlesView: React.FC<{ m: LongModel; font: string }> = ({ m, font }) => {
  const frame = useCurrentFrame();
  const i = lastAtOrBefore(m.subtitles, frame);
  if (i < 0) return null;
  const s = m.subtitles[i];
  if (frame >= s.to) return null;
  const u = m.u;
  // A 3-frame fade at both ends: no pop, no flicker between chunks that touch.
  const touchPrev = i > 0 && m.subtitles[i - 1].to >= s.from;
  const touchNext = i + 1 < m.subtitles.length && m.subtitles[i + 1].from <= s.to;
  const a = Math.min(touchPrev ? 1 : Math.min(1, (frame - s.from + 1) / 3), touchNext ? 1 : Math.min(1, (s.to - frame) / 3));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: m.margin,
          right: m.margin,
          bottom: m.H - m.subBottom,
          textAlign: 'center',
          fontFamily: font,
          fontSize: m.subSize,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: '0.005em',
          color: '#FFFFFF',
          opacity: a,
          // Cheap on purpose (on screen for most of a 30 min render): two small shadows, no wide glow.
          textShadow: `0 ${1 * u}px ${2 * u}px rgba(0,0,0,0.7), 0 ${2 * u}px ${10 * u}px rgba(0,0,0,0.45)`,
        }}
      >
        {s.lines.map((l, k) => (
          <div key={k}>{l}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
