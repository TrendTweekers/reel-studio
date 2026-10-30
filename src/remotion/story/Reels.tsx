// Her other reels as three framed cards: the middle one rises first, the side ones slide out
// from behind it and settle at a slight tilt; all play muted and float gently.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { ClipVideo, REEL_RATIO, useClips } from '../effects/reels';
import { BOX, BOX_H, breath, ease, fitText, ITALIC_W, reveal, serif, useScene } from './kit';

export const Reels: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  // useClips reads only reels (and the edit); the rest makes it a valid TimedEffect.
  const fx: TimedEffect = { id: scene.id, kind: 'files', at: scene.at, duration: frames / FPS, reels: scene.reels, from: scene.from, frames, rotation: 0, side: 'left', rect: null, scale: 1 };
  const clips = useClips(fx, 3);
  const heading = (scene.text ?? '').trim();
  const head = heading ? fitText(heading, { maxW: BOX.w, maxLines: 2, max: 92, min: 54 }) : null;
  const headH = head ? head.lines.length * head.size * 1.06 + 60 : 0;
  const mainH = Math.min(760, BOX_H - headH - 40);
  const mainW = Math.round(mainH * REEL_RATIO);
  const sideW = Math.round(mainW * 0.74);
  const sideH = Math.round(sideW / REEL_RATIO);
  const b = breath(frame, frames);
  const hr = reveal(frame, 0, first, 18);
  const m = first ? 1 : ease(frame, 4, 22);
  const s = first ? 1 : ease(frame, 14, 26);
  const t = frame / FPS;
  const cardTop = BOX.y + headH + (BOX_H - headH - mainH) / 2;
  const cx = BOX.x + BOX.w / 2;
  const border = theme.dark ? '#2a2622' : '#FBF8F3';
  const card = (i: number, w: number, h: number, x: number, rot: number, o: number, z: number, delay: number) =>
    clips[i] ? (
      <div
        key={clips[i].key}
        style={{
          position: 'absolute',
          left: x - w / 2,
          top: cardTop + (mainH - h) / 2 + Math.sin(t * 1.1 + i * 2) * 6,
          width: w,
          height: h,
          padding: 10,
          boxSizing: 'border-box',
          background: border,
          opacity: o,
          zIndex: z,
          transform: `rotate(${rot}deg)`,
          boxShadow: theme.dark ? '0 30px 60px rgba(0,0,0,0.55)' : '0 26px 50px rgba(60,40,20,0.20), 0 4px 12px rgba(60,40,20,0.10)',
        }}
      >
        <ClipVideo clip={clips[i]} delay={delay} style={{ width: '100%', height: '100%' }} />
      </div>
    ) : null;
  const spread = mainW * 0.62 * s;

  return (
    <div style={{ position: 'absolute', inset: 0, color: theme.text }}>
      {head ? (
        <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, textAlign: 'center', opacity: hr, transform: `translateY(${(1 - hr) * 18}px)` }}>
          {head.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, head.size, i === 1), whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + b * 0.03})`, transformOrigin: `${cx}px ${cardTop + mainH / 2}px` }}>
        {card(1, sideW, sideH, cx - spread, -5 * s, s, 1, 14)}
        {card(2, sideW, sideH, cx + spread, 5 * s, s, 1, 14)}
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, transform: `translateY(${(1 - m) * 60}px)` }}>{card(0, mainW, mainH, cx, 0, m, 2, 4)}</div>
      </div>
      {clips[0]?.title ? (
        <div style={{ position: 'absolute', left: BOX.x, width: BOX.w, top: cardTop + mainH + 28, textAlign: 'center', color: theme.soft, opacity: s }}>
          <div style={{ ...serif(hookFont, fitText(clips[0].title, { maxW: BOX.w - 200, maxLines: 1, max: 38, min: 28, charW: ITALIC_W }).size, true), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clips[0].title}</div>
        </div>
      ) : null}
    </div>
  );
};
