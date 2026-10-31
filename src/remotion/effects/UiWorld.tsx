// App UI floating around her: an iOS-style notification ("<her first name> • teraz" + e.text), a search bar
// that types e.text letter by letter, chat / DM bubbles (one per e.items line; "Name: message" shows
// the name), and a like counter that counts up. 2-4 glassy cream cards pop in one by one and float
// gently. They are laid out once for the whole effect: inside the safe area, off her head, clear of
// the caption band, on the side away from her first.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from 'remotion';
import { WIDTH } from '../../shared/types';
import { INK } from '../color';
import { useReel } from '../context';
import { overlaps, rightLimit, SAFE, SAFE_BOTTOM, type Rect, type Side, type TimedEffect } from '../model';
import { CLAMP, outro, popIn } from './anim';

type Card =
  | { kind: 'notif'; text: string }
  | { kind: 'search'; text: string }
  | { kind: 'chat'; name: string | null; text: string }
  | { kind: 'like'; count: number };

const GLASS: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(252,249,243,0.9), rgba(244,238,228,0.84))',
  backdropFilter: 'blur(20px) saturate(140%)',
  WebkitBackdropFilter: 'blur(20px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.7)',
  boxShadow: '0 14px 34px rgba(0,0,0,0.20), 0 2px 6px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
  boxSizing: 'border-box',
  color: INK,
};

const est = (s: string, size: number) => Array.from(s).length * size * 0.52;

const sizeOf = (c: Card): { w: number; h: number } => {
  if (c.kind === 'notif') return { w: 640, h: est(c.text, 36) > 470 ? 172 : 132 };
  if (c.kind === 'search') return { w: Math.min(600, Math.max(420, est(c.text, 36) + 150)), h: 96 };
  if (c.kind === 'chat') {
    const w = Math.min(560, Math.max(260, est(c.text, 34) + 64));
    const lines = Math.ceil(est(c.text, 34) / (560 - 64));
    return { w, h: 44 + lines * 44 + (c.name ? 34 : 0) };
  }
  return { w: 250, h: 92 };
};

const fmtCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const Heart: React.FC<{ color: string; size: number; fill?: boolean }> = ({ color, size, fill = true }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.8 6.7 4.6c2.1-.1 3.9 1.1 5.3 3 1.4-1.9 3.2-3.1 5.3-3 3.3.2 5.2 3.6 4 6.7-1.8 4.6-9.3 9.2-9.3 9.2z"
      fill={fill ? color : 'none'}
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);

export const UiWorld: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, props, hookFont, subFont } = useReel();
  const pl = (props.edit.language || 'pl').startsWith('pl');
  const text = (e.text ?? '').trim();

  // ---- Which cards (2-4).
  const cards: Card[] = [];
  if (text) cards.push({ kind: 'notif', text });
  if (text) cards.push({ kind: 'search', text });
  for (const raw of e.items ?? []) {
    const s = String(raw).trim();
    if (!s) continue;
    const m = s.match(/^([^:]{1,28}):\s*(.+)$/);
    cards.push(m ? { kind: 'chat', name: m[1].trim(), text: m[2].trim() } : { kind: 'chat', name: null, text: s });
  }
  const likeTarget = 1200 + Math.floor(random(`likes-${e.id}`) * 3800);
  if (cards.length < 4) cards.push({ kind: 'like', count: likeTarget });
  if (cards.length > 4) cards.splice(3, cards.length - 4); // keep the first three + make room for nothing else
  if (cards.length < 2) return null;

  // ---- Layout once for the whole effect.
  const head = model.headSpan(e.from, e.from + e.frames);
  const bottom = SAFE_BOTTOM - 200; // keep the caption band free
  const away: Side = e.side;
  const other: Side = away === 'right' ? 'left' : 'right';
  const layout = (k: number): Rect[] | null => {
    const out: Rect[] = [];
    for (let i = 0; i < cards.length; i++) {
      const s = sizeOf(cards[i]);
      const w = s.w * k;
      const h = s.h * k;
      const ys: number[] = [];
      const midY = head.y + head.h * 0.5;
      for (let d = 0; d < 1400; d += 30) {
        ys.push(midY + d, midY - d);
      }
      const xOf = (side: Side | 'center', y: number) =>
        side === 'center' ? WIDTH / 2 - 30 - w / 2 : side === 'right' ? rightLimit(y, h) - 12 - w : SAFE.side + 12;
      let found: Rect | null = null;
      // Alternate sides so the cards spread: even cards on the open side first.
      const sides: (Side | 'center')[] = i % 2 === 0 ? [away, other, 'center'] : [other, away, 'center'];
      outer: for (const side of sides) {
        for (const y of ys) {
          const r: Rect = { x: xOf(side, y), y, w, h };
          if (r.y < SAFE.top + 8 || r.y + r.h > bottom || r.x < SAFE.side || r.x + r.w > rightLimit(r.y, r.h)) continue;
          if (overlaps(r, head, 28)) continue;
          if (out.some((q) => overlaps(q, r, 34))) continue;
          found = r;
          break outer;
        }
      }
      if (!found) return null;
      out.push(found);
    }
    return out;
  };
  let k = 1;
  let rects: Rect[] | null = null;
  for (const kk of [1, 0.88, 0.76, 0.66]) {
    rects = layout(kk);
    if (rects) {
      k = kk;
      break;
    }
  }
  if (!rects) {
    // Not enough room for all: drop cards from the end until it fits at the smallest size.
    while (cards.length > 1 && !rects) {
      cards.pop();
      rects = layout(0.66);
      k = 0.66;
    }
    if (!rects) return null;
  }

  const o = outro(frame, e.frames, 9);

  const renderCard = (c: Card, i: number, r: Rect) => {
    const s = sizeOf(c);
    const delay = 3 + i * 7;
    const p = popIn(frame, delay);
    const fade = interpolate(frame - delay, [0, 5], [0, 1], CLAMP);
    const float = Math.sin(frame / 22 + i * 1.7) * 6;
    const tilt = Math.sin(frame / 31 + i) * 0.5 + (i % 2 ? 1 : -1) * 0.8;
    const sc = k * interpolate(p, [0, 1], [0.82, 1]) * interpolate(o, [0, 1], [0.94, 1]);
    const local = frame - delay;
    let body: React.ReactNode = null;
    if (c.kind === 'notif') {
      body = (
        <div style={{ ...GLASS, width: s.w, height: s.h, borderRadius: 34, padding: '22px 26px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 76,
              height: 76,
              flex: '0 0 76px',
              borderRadius: 19,
              background: INK,
              color: '#F5EFE6',
              fontFamily: hookFont,
              fontSize: 50,
              fontStyle: 'italic',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              paddingBottom: 4,
              boxSizing: 'border-box',
            }}
          >
            P
          </div>
          <div style={{ flex: 1, minWidth: 0, fontFamily: subFont }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 30 }}>
              <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>{(props.brand?.name ?? '').split(' ')[0] || 'Klipownia'}</span>
              <span style={{ opacity: 0.45, fontSize: 24 }}>{pl ? 'teraz' : 'now'}</span>
            </div>
            <div style={{ fontSize: 36, lineHeight: 1.2, marginTop: 4, opacity: 0.88, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {c.text}
            </div>
          </div>
        </div>
      );
    } else if (c.kind === 'search') {
      const chars = Array.from(c.text);
      const typed = Math.max(0, Math.min(chars.length, Math.floor((local - 6) / 2)));
      const caretOn = typed < chars.length || Math.floor(frame / 8) % 2 === 0;
      body = (
        <div style={{ ...GLASS, width: s.w, height: s.h, borderRadius: 48, padding: '0 30px', display: 'flex', alignItems: 'center', gap: 18, fontFamily: subFont }}>
          <svg width="34" height="34" viewBox="0 0 24 24" style={{ flex: '0 0 34px', opacity: 0.55 }}>
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={INK} strokeWidth="2.2" />
            <path d="M15.5 15.5 L20.5 20.5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 36, letterSpacing: '-0.01em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
            <span>{chars.slice(0, typed).join('')}</span>
                        <span style={{ display: 'inline-block', width: 3, height: 42, marginLeft: 3, background: '#3B82F6', opacity: caretOn ? 0.9 : 0, borderRadius: 2 }} />
          </div>
        </div>
      );
    } else if (c.kind === 'chat') {
      const left = r.x + r.w / 2 < WIDTH / 2;
      body = (
        <div style={{ width: s.w, display: 'flex', flexDirection: 'column', alignItems: left ? 'flex-start' : 'flex-end', fontFamily: subFont }}>
          {c.name ? (
            <div style={{ fontSize: 24, fontWeight: 600, color: '#FBF4E2', textShadow: '0 1px 3px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.3)', margin: '0 18px 8px' }}>{c.name}</div>
          ) : null}
          <div
            style={{
              ...GLASS,
              maxWidth: s.w,
              borderRadius: 34,
              [left ? 'borderBottomLeftRadius' : 'borderBottomRightRadius']: 10,
              padding: '20px 30px 22px',
              fontSize: 34,
              lineHeight: 1.3,
              letterSpacing: '-0.005em',
            }}
          >
            {c.text}
          </div>
        </div>
      );
    } else {
      const t = interpolate(local, [4, Math.max(20, e.frames - delay - 18)], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
      const n = Math.round(c.count * t);
      const beat = 1 + 0.12 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (local - 2) / 10)) * Math.PI));
      body = (
        <div style={{ ...GLASS, width: s.w, height: s.h, borderRadius: 46, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 16, fontFamily: subFont }}>
          <div style={{ transform: `scale(${beat})`, display: 'flex' }}>
            <Heart color="#E0435A" size={44} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmtCount(n)}</div>
        </div>
      );
    }
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: r.x,
          top: r.y + float,
          width: s.w,
          transformOrigin: '0 0',
          transform: `scale(${sc}) translateY(${(1 - p) * 30}px) rotate(${tilt}deg)`,
          opacity: fade * o,
        }}
      >
        {body}
      </div>
    );
  };

  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{cards.map((c, i) => renderCard(c, i, rects![i]))}</AbsoluteFill>;
};
