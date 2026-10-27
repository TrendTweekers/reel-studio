// Word-by-word captions in 2-4 word chunks. Four looks: clean, box, karaoke, pop.
// Placement (never on the head, a card, a sticker or the button column) is done once in the model.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { CREAM, INK, isDark } from '../color';
import { useReel } from '../context';
import { CLAMP } from '../effects/anim';
import { Scrim, dropFilterFor } from '../legibility';
import { CAPTION_CX, CAPTION_LEAD, CAPTION_MAX_W, captionFontSize, isClingy, type OutWord } from '../model';

// Keep a clingy word ("z", "w", "na"...) on the same line as the next word.
const glue = (words: OutWord[]) => {
  const groups: OutWord[][] = [];
  for (let i = 0; i < words.length; i++) {
    const g = [words[i]];
    while (isClingy(words[i].text) && i + 1 < words.length) g.push(words[++i]);
    groups.push(g);
  }
  return groups;
};

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { props, model, subFont } = useReel();
  const { subtitleStyle: style, accentColor } = props.edit.style;
  if (style === 'off') return null;
  const chunk = model.chunks.find((c) => frame >= c.from && frame < c.to);
  if (!chunk || chunk.hidden) return null;

  const fs = captionFontSize(style);
  const boxed = style === 'box';
  const local = frame - chunk.from;
  const enter = spring({ frame: local, fps: FPS, config: { damping: 200 }, durationInFrames: 6 });
  const exit = interpolate(frame, [chunk.to - 3, chunk.to], [1, 0], CLAMP);
  const accentOnVideo = isDark(accentColor) ? CREAM : accentColor;
  const at = frame + CAPTION_LEAD; // the eye arrives a touch before the voice

  const renderWord = (w: OutWord) => {
    const i = chunk.words.indexOf(w);
    const next = chunk.words[i + 1];
    const current = at >= w.from && (next ? at < next.from : true);
    const spoken = at >= w.from;
    const base: React.CSSProperties = { display: 'inline-block', margin: '0 0.13em', whiteSpace: 'pre' };
    let s: React.CSSProperties = base;
    if (style === 'clean') {
      s = { ...base, color: '#fff', opacity: spoken ? 1 : 0.9 };
    } else if (style === 'box') {
      s = current
        ? { ...base, color: CREAM, background: INK, borderRadius: 14, padding: '0 0.2em', margin: '0 0.06em' }
        : { ...base, color: INK, padding: '0 0.2em', margin: '0 0.06em', opacity: spoken ? 1 : 0.62 };
    } else if (style === 'karaoke') {
      const p = interpolate(at, [w.from, Math.max(w.from + 1, w.to)], [0, 100], CLAMP);
      s = {
        ...base,
        color: 'transparent',
        backgroundImage: `linear-gradient(90deg, ${accentOnVideo} ${p}%, #fff ${p}%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
      };
    } else if (style === 'pop') {
      // All words readable; the active one pops around its own centre and keeps its gaps.
      const pop = current ? spring({ frame: at - w.from, fps: FPS, config: { damping: 10, stiffness: 230, mass: 0.5 } }) : 0;
      const scale = current ? interpolate(pop, [0, 1], [0.86, 1.12]) : 1;
      s = {
        ...base,
        color: current ? accentOnVideo : '#fff',
        opacity: spoken || current ? 1 : 0.9,
        transform: `scale(${scale})`,
        transformOrigin: '50% 55%',
        margin: `0 ${0.13 + Math.max(0, scale - 1) * 0.9}em`,
      };
    }
    return (
      <span key={w.index} style={s}>
        {w.text}
      </span>
    );
  };

  const groups = glue(chunk.words).map((g, gi) =>
    g.length === 1 ? renderWord(g[0]) : (
      <span key={`g${gi}`} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
        {g.map(renderWord)}
      </span>
    ),
  );

  const rect = chunk.rect;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: enter * exit }}>
      {boxed ? null : <Scrim rect={rect} textColor="#ffffff" />}
      <div
        style={{
          position: 'absolute',
          top: chunk.top,
          left: CAPTION_CX - (CAPTION_MAX_W + 60) / 2,
          width: CAPTION_MAX_W + 60,
          display: 'flex',
          justifyContent: 'center',
          transform: `translateY(${(1 - enter) * 12}px)`,
          filter: boxed ? undefined : dropFilterFor('#ffffff'),
        }}
      >
        <div
          style={{
            maxWidth: CAPTION_MAX_W + (boxed ? 52 : 0),
            textAlign: 'center',
            fontFamily: subFont,
            fontSize: fs,
            fontWeight: style === 'clean' || style === 'box' ? 600 : 700,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            ...(boxed
              ? {
                  background: CREAM,
                  borderRadius: 26,
                  padding: '18px 26px',
                  boxShadow: '0 14px 34px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)',
                }
              : {}),
          }}
        >
          {groups}
        </div>
      </div>
    </AbsoluteFill>
  );
};
