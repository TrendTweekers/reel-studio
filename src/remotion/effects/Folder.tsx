// The folder fan out: a cream desktop folder sits on the side away from her face, a cursor glides in
// and double-clicks it, the front flap tips open and 4-5 of her reels fly out from between the back
// and the front, arc up and scatter across the frame with a slight tilt, playing (muted). Near the
// end everything shrinks and fades. e.text = optional small label under the folder.
// Layers, back to front: folder back, cards still inside, folder front, cards that are out, cursor.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { CREAM } from '../color';
import { useReel } from '../context';
import { overlaps, rightLimit, SAFE, type Rect, type TimedEffect } from '../model';
import { CLAMP, easeIn, lerp, outro, popIn } from './anim';
import { Cursor, placeObject, pressAt } from './cursor';
import { ClipVideo, REEL_RATIO, useClips } from './reels';

const FW = 340; // folder, unscaled
const FH = 262;
const TAB = 26; // height of the tab on the back
const LIP = 64; // the front starts this far down, so the back shows above it
const CARD_H = 360;
const CARD_W = CARD_H * REEL_RATIO;

// The double-click lands here. The 'double-click' sound plays at the effect start, so the cursor
// is already close at frame 0 and the glide is short.
export const FOLDER_CLICK_AT = 9;

// Does the straight path a -> b cross the box? (a card flying over her face would cover it)
const pathHits = (ax: number, ay: number, bx: number, by: number, box: Rect) => {
  for (let t = 0; t <= 1; t += 0.05) {
    const x = lerp(t, ax, bx);
    const y = lerp(t, ay, by);
    if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) return true;
  }
  return false;
};

export const Folder: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, hookFont } = useReel();
  const label = (e.text ?? '').trim();

  // ---- Layout once for the whole effect.
  const spot = placeObject(e, model, FW, FH + (label ? 70 : 0));
  const head = spot.head; // the keep-out box the folder was placed around
  const k = spot.k;
  const fx = spot.x + (FW * k) / 2; // folder centre
  const fy = spot.y + (FH * k) / 2;
  const folderBox: Rect = { x: spot.x, y: spot.y, w: FW * k, h: FH * k };
  const mouth = { x: fx, y: fy - (FH / 2 - LIP) * k + 10 * k }; // between back and front

  // Card landing spots: a grid over the safe area, off her head and off the folder, reachable
  // without flying over her face. Then spread out: each next card takes the spot farthest from
  // the folder and from the cards already placed.
  const faceBox: Rect = { x: head.x - 10, y: head.y - 10, w: head.w + 20, h: head.h + 20 };
  const slack = 14; // the tilt makes a card a little wider than its box
  const scatter = (ck: number) => {
    const cw = CARD_W * ck;
    const ch = CARD_H * ck;
    const cands: { x: number; y: number }[] = [];
    for (let y = SAFE.top + ch / 2 + slack; y <= spot.bottom - ch / 2 - slack; y += 40) {
      for (let x = SAFE.side + cw / 2 + slack; x <= WIDTH - SAFE.side - cw / 2 - slack; x += 40) {
        const r: Rect = { x: x - cw / 2 - slack, y: y - ch / 2 - slack, w: cw + 2 * slack, h: ch + 2 * slack };
        if (r.x + r.w > rightLimit(r.y, r.h)) continue;
        if (overlaps(r, head, 18)) continue;
        if (overlaps(r, folderBox, 12)) continue;
        if (pathHits(mouth.x, mouth.y - 60, x, y, faceBox)) continue;
        cands.push({ x, y });
      }
    }
    const out: { x: number; y: number }[] = [];
    const far = (p: { x: number; y: number }) =>
      Math.min(Math.hypot(p.x - fx, p.y - fy) * 0.85, ...out.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    while (out.length < 5 && cands.length) {
      let bi = 0;
      for (let i = 1; i < cands.length; i++) if (far(cands[i]) > far(cands[bi])) bi = i;
      // A spot right on top of another card adds nothing: stop there (fewer cards, still tidy).
      if (out.length >= 3 && far(cands[bi]) < cw * 0.75) break;
      out.push(cands.splice(bi, 1)[0]);
    }
    return out;
  };
  // Smaller cards when the frame is crowded (a close-up), so at least 3 still fit.
  let ck = Math.max(0.8, k);
  let targets = scatter(ck);
  for (const smaller of [0.62, 0.48]) {
    if (targets.length >= 3 || smaller >= ck) continue;
    ck = smaller;
    targets = scatter(ck);
  }
  const cw = CARD_W * ck;
  const ch = CARD_H * ck;
  // Fly in reading order (top first), so the fan feels deliberate, not random.
  targets.sort((a, b) => a.y - b.y || a.x - b.x);
  const clips = useClips(e, Math.max(1, targets.length));

  // ---- Motion.
  const appear = popIn(frame);
  const end = outro(frame, e.frames, 14);
  const click = FOLDER_CLICK_AT;
  const press = Math.max(pressAt(frame, click), pressAt(frame, click + 4));
  const open = easeIn(frame, click + 4, 12);
  const folderScale = k * interpolate(appear, [0, 1], [0.7, 1]) * (1 - press * 0.035) * lerp(end, 0.8, 1);
  const folderOp = interpolate(frame, [0, 5], [0, 1], CLAMP) * end;

  // Cursor: glides in from below, on the open side, eases onto the folder, clicks, then drifts off.
  const away = e.side === 'right' ? 1 : -1;
  const tip = { x: fx + 22 * k, y: fy + 18 * k };
  const inT = interpolate(frame, [0, click - 1], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const outT = interpolate(frame, [click + 10, click + 30], [0, 1], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const cur = {
    x: lerp(inT, tip.x + away * 230, tip.x) + outT * away * 120,
    y: lerp(inT, tip.y + 260, tip.y) + outT * 160,
  };
  const curOp = interpolate(frame, [0, 4], [0, 1], CLAMP) * (1 - outT);

  type Fly = { i: number; x: number; y: number; s: number; rot: number; op: number; out: boolean; delay: number };
  const flies: Fly[] = targets.map((t, i) => {
    const delay = click + 6 + i * 4;
    const p = spring({ frame: frame - delay, fps: FPS, config: { damping: 15, stiffness: 85, mass: 0.8 } });
    // An arc: first up out of the folder, then over to its spot.
    const c1 = { x: lerp(0.25, mouth.x, t.x), y: Math.min(mouth.y, t.y) - 170 * ck };
    const q = 1 - p;
    const x = q * q * mouth.x + 2 * q * p * c1.x + p * p * t.x;
    const y = q * q * mouth.y + 2 * q * p * c1.y + p * p * t.y;
    const tilt = (random(`folder-${e.id}-${i}`) * 2 - 1) * 9 + (t.x < fx ? -2 : 2);
    const float = Math.sin(frame / 19 + i * 1.3) * 4 * p;
    return {
      i,
      x,
      y: y + float,
      s: lerp(Math.min(p, 1.04), 0.3, 1) * lerp(end, 0.55, 1),
      rot: lerp(p, 0, tilt) + Math.sin(frame / 27 + i) * 0.6 * p,
      op: interpolate(frame - delay, [-1, 2], [0, 1], CLAMP) * end,
      out: p > 0.2,
      delay,
    };
  });

  const card = (f: Fly) => (
    <div
      key={f.i}
      style={{
        position: 'absolute',
        left: f.x - cw / 2,
        top: f.y - ch / 2,
        width: cw,
        height: ch,
        opacity: f.op,
        transform: `rotate(${f.rot}deg) scale(${f.s})`,
        background: '#FBF8F3',
        padding: 5,
        boxSizing: 'border-box',
        borderRadius: 18,
        boxShadow: '0 18px 36px rgba(0,0,0,0.30), 0 3px 8px rgba(0,0,0,0.16)',
      }}
    >
      <ClipVideo clip={clips[f.i % clips.length]} delay={f.delay} style={{ width: '100%', height: '100%', borderRadius: 13 }} />
    </div>
  );

  // Back and front are two boxes with the same place and scale, so cards can go between them.
  const box = (children: React.ReactNode) => (
    <div
      style={{
        position: 'absolute',
        left: fx - FW / 2,
        top: fy - FH / 2,
        width: FW,
        height: FH,
        opacity: folderOp,
        transform: `scale(${folderScale})`,
      }}
    >
      {children}
    </div>
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {box(
        // The back with its tab, a shade darker than the front, as on a real folder.
        <svg width={FW} height={FH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id={`fb-${e.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D8CAB2" />
              <stop offset="1" stopColor="#C9B89C" />
            </linearGradient>
          </defs>
          <path
            d={`M 0 14 Q 0 0 14 0 L 90 0 Q 99 0 104 6 L 112 ${TAB - 4} Q 117 ${TAB} 128 ${TAB} L ${FW - 16} ${TAB} Q ${FW} ${TAB} ${FW} ${TAB + 16} L ${FW} ${FH - 16} Q ${FW} ${FH} ${FW - 16} ${FH} L 16 ${FH} Q 0 ${FH} 0 ${FH - 16} Z`}
            fill={`url(#fb-${e.id})`}
            style={{ filter: 'drop-shadow(0 16px 26px rgba(0,0,0,0.28))' }}
          />
          {/* A sheet of paper peeking out, so the folder reads as full. */}
          <rect x={24} y={TAB + 12} width={FW - 48} height={70} rx={6} fill="#FBF8F3" opacity={0.95} />
        </svg>,
      )}
      {flies.filter((f) => !f.out).map(card)}
      {box(
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: LIP,
            width: FW,
            height: FH - LIP,
            borderRadius: 16,
            background: 'linear-gradient(180deg, #F7F1E7 0%, #EDE3D3 100%)',
            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.95), 0 -2px 10px rgba(0,0,0,0.10)',
            // The flap tips toward us from its bottom edge, which opens the mouth of the folder.
            transformOrigin: '50% 100%',
            transform: `perspective(700px) rotateX(${open * 30}deg)`,
          }}
        >
          {/* An embossed line, like the folder glyph on a Mac. */}
          <div style={{ position: 'absolute', left: 30, right: 30, top: 26, height: 2, borderRadius: 1, background: 'rgba(120,98,70,0.16)' }} />
        </div>,
      )}
      {label ? (
        <div
          style={{
            position: 'absolute',
            left: fx - 300,
            width: 600,
            top: fy + (FH * k) / 2 + 14 * k,
            textAlign: 'center',
            opacity: folderOp,
            transform: `scale(${interpolate(appear, [0, 1], [0.85, 1]) * lerp(end, 0.8, 1)})`,
            fontFamily: hookFont,
            fontStyle: 'italic',
            fontSize: 44 * k,
            lineHeight: 1.1,
            color: CREAM,
            textShadow: '0 1px 2px rgba(0,0,0,0.5), 0 3px 12px rgba(0,0,0,0.35)',
          }}
        >
          {label}
        </div>
      ) : null}
      {flies.filter((f) => f.out).map(card)}
      <Cursor x={cur.x} y={cur.y} press={press} opacity={curOp} />
    </AbsoluteFill>
  );
};
