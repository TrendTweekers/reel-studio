// The file preview: a light, Finder-like window (title bar with three dots, a file list on the left,
// a preview pane on the right). The cursor clicks one file after another, about every 0.7 s; the
// row highlights in ink and the preview switches to that reel, playing (muted).
// e.items = file names (default: the final_FINAL.mp4 joke), e.text = window title (default "Reels").
// Placed on the side away from her face or under her chin, never over her face.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { CREAM, INK } from '../color';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { CLAMP, lerp, outro, popIn } from './anim';
import { Cursor, placeObject, pressAt } from './cursor';
import { ClipVideo, REEL_RATIO, useClips } from './reels';

const DEFAULT_FILES = ['final.mp4', 'final_FINAL.mp4', 'final_FINAL_v2.mp4', 'final_FINAL_naprawdę.mp4'];

// Window, unscaled.
const BAR = 64; // title bar
const LIST_W = 510;
const ROW = 76;
const PAD = 22;
const PREV_H = 450;
const PREV_W = PREV_H * REEL_RATIO;
const PANE_W = PREV_W + 2 * PAD + 20;
const WW = LIST_W + PANE_W;
const WH = BAR + PREV_H + 2 * PAD + 64; // room for the file name under the preview

// One click every 0.7 s, the first one right away (Sound.tsx plays a click on each).
export const FILES_FIRST_CLICK = 6;
const STEP = Math.round(0.7 * FPS);

// Clicks that fit before the window leaves (the last reel gets at least ~0.6 s on screen).
// Local frames; Sound.tsx plays one click on each.
export const fileClicks = (files: number, frames: number) => {
  const out: number[] = [];
  for (let i = 0; i < files; i++) {
    const at = FILES_FIRST_CLICK + i * STEP;
    if (at > frames - 20) break;
    out.push(at);
  }
  return out;
};

const itemsLabel = (n: number, pl: boolean) => {
  if (!pl) return `${n} ${n === 1 ? 'item' : 'items'}`;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? 'element' : few ? 'elementy' : 'elementów'}`;
};

const FileIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width={28} height={34} viewBox="0 0 28 34" style={{ flex: '0 0 28px' }}>
    <path d="M3 1 H19 L27 9 V31 Q27 33 25 33 H3 Q1 33 1 31 V3 Q1 1 3 1 Z" fill={on ? CREAM : '#FFFFFF'} stroke={on ? CREAM : 'rgba(20,18,16,0.35)'} strokeWidth={1.4} />
    <path d="M19 1 V9 H27" fill="none" stroke={on ? 'rgba(20,18,16,0.4)' : 'rgba(20,18,16,0.3)'} strokeWidth={1.4} />
    <path d="M11 15 L19 20 L11 25 Z" fill={INK} opacity={0.75} />
  </svg>
);

export const Files: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, props, subFont } = useReel();
  const pl = (props.edit.language || 'pl').startsWith('pl');
  const given = (e.items ?? []).map((s) => String(s).trim()).filter(Boolean);
  const names = (given.length ? given : DEFAULT_FILES).slice(0, 5);
  const title = (e.text ?? '').trim() || 'Reels';

  const clicks = fileClicks(names.length, e.frames);
  const clips = useClips(e, Math.max(1, clicks.length));

  // ---- Layout once for the whole effect.
  const listH = names.length * ROW + 2 * PAD;
  const wh = Math.max(WH, BAR + listH);
  const spot = placeObject(e, model, WW, wh);
  const k = spot.k;

  // ---- Motion.
  const appear = popIn(frame);
  const end = outro(frame, e.frames, 10);
  const winScale = interpolate(appear, [0, 1], [0.9, 1]) * lerp(end, 0.94, 1);
  const winOp = interpolate(frame, [0, 5], [0, 1], CLAMP) * end;
  let sel = -1;
  clicks.forEach((c, i) => {
    if (frame >= c) sel = i;
  });

  // Cursor (window coordinates): starts below the first row, then hops row to row a little
  // before each click, eased like a hand on a trackpad.
  const rowY = (i: number) => BAR + PAD + i * ROW + ROW * 0.62;
  const rowX = (i: number) => 170 + (i % 2) * 50;
  let cx = rowX(0) + 70;
  let cy = rowY(0) + 120;
  const move = (from: number, to: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const t = interpolate(frame, [from, to], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
    if (frame >= from) {
      cx = lerp(t, a.x, b.x);
      cy = lerp(t, a.y, b.y);
    }
  };
  move(0, FILES_FIRST_CLICK - 1, { x: cx, y: cy }, { x: rowX(0), y: rowY(0) });
  for (let i = 1; i < clicks.length; i++) {
    move(clicks[i] - 10, clicks[i] - 1, { x: rowX(i - 1), y: rowY(i - 1) }, { x: rowX(i), y: rowY(i) });
  }
  const press = Math.max(...clicks.map((c) => pressAt(frame, c)), 0);

  const font: React.CSSProperties = { fontFamily: subFont, color: INK, letterSpacing: '-0.01em' };

  // The preview: the selected reel, plus the one before it while it fades away (max 2 videos).
  const preview = clicks.map((c, i) => {
    if (i !== sel && !(i === sel - 1 && frame < clicks[sel] + 6)) return null;
    const t = interpolate(frame, [c, c + 6], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
    return (
      <div key={i} style={{ position: 'absolute', inset: 0, opacity: i === sel ? t : 1, transform: `scale(${i === sel ? lerp(t, 0.96, 1) : 1})` }}>
        <ClipVideo clip={clips[i % clips.length]} delay={c} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
      </div>
    );
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: spot.x,
          top: spot.y,
          width: WW,
          height: wh,
          transformOrigin: '0 0',
          transform: `scale(${k}) translateY(${(1 - appear) * 24}px)`,
          opacity: winOp,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${winScale})`,
            borderRadius: 24,
            overflow: 'hidden',
            background: '#FBF8F3',
            border: '1px solid rgba(20,18,16,0.10)',
            boxShadow: '0 30px 70px rgba(0,0,0,0.32), 0 6px 16px rgba(0,0,0,0.16)',
          }}
        >
          {/* Title bar. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              height: BAR,
              background: 'linear-gradient(180deg, #F4EEE4, #ECE4D7)',
              borderBottom: '1px solid rgba(20,18,16,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ position: 'absolute', left: 24, top: 0, height: BAR, display: 'flex', alignItems: 'center', gap: 11 }}>
              {/* Muted versions of the traffic lights, so the window stays in her palette. */}
              {['#D9958A', '#DDBF85', '#A7BE96'].map((c) => (
                <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)' }} />
              ))}
            </div>
            <div style={{ ...font, fontSize: 27, fontWeight: 600, opacity: 0.8 }}>{title}</div>
          </div>
          {/* File list. */}
          <div style={{ position: 'absolute', left: 0, top: BAR, width: LIST_W, bottom: 0, padding: PAD, boxSizing: 'border-box' }}>
            {names.map((n, i) => {
              const on = i === sel;
              const flash = interpolate(frame - (clicks[i] ?? 1e9), [0, 4], [0.75, 1], CLAMP);
              return (
                <div
                  key={i}
                  style={{
                    ...font,
                    height: ROW,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '0 16px',
                    borderRadius: 12,
                    background: on ? INK : 'transparent',
                    opacity: on ? flash : 1,
                    color: on ? CREAM : INK,
                    fontSize: 30,
                  }}
                >
                  <FileIcon on={on} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                </div>
              );
            })}
            {/* Finder's status line, so the empty part of the list reads as a real window. */}
            <div style={{ ...font, position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontSize: 21, opacity: 0.42 }}>
              {itemsLabel(names.length, pl)}
            </div>
          </div>
          {/* Preview pane. */}
          <div
            style={{
              position: 'absolute',
              left: LIST_W,
              top: BAR,
              right: 0,
              bottom: 0,
              background: '#F1EADF',
              borderLeft: '1px solid rgba(20,18,16,0.08)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: (PANE_W - PREV_W) / 2,
                top: PAD,
                width: PREV_W,
                height: PREV_H,
                borderRadius: 12,
                background: '#E6DDCF',
                boxShadow: sel >= 0 ? '0 10px 24px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              {preview}
            </div>
            {sel >= 0 ? (
              <div style={{ position: 'absolute', left: 12, right: 12, top: PAD + PREV_H + 14, textAlign: 'center', ...font }}>
                <div style={{ fontSize: 24, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names[sel]}</div>
                <div style={{ fontSize: 20, opacity: 0.5, marginTop: 2 }}>{pl ? 'Wideo MPEG-4' : 'MPEG-4 movie'}</div>
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${winScale})`, width: WW, height: wh }}>
          <Cursor x={cx} y={cy} press={press} opacity={interpolate(frame, [0, 4], [0, 1], CLAMP)} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
