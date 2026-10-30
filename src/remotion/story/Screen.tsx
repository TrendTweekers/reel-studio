// "screen": a real screenshot from the board in a phone / browser / plain frame. Tall screenshots
// scroll slowly from top to bottom, others drift in a little (Ken Burns).
// "click": the same frame; the cursor glides to scene.point, presses (ripple ring) and the screen
// zooms about 1.6x into that point and holds; an optional label pops up next to it.
import React from 'react';
import { Easing, Img, interpolate, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { Cursor, pressAt } from '../effects/cursor';
import { BOX, BOX_H, breath, CLAMP, ease, fitText, ITALIC_W, reveal, serif, useScene } from './kit';
import { cover, deviceLayout, DeviceFrame, EmptyScreen, useImageAspect, type FrameKind } from './Device';

const Product: React.FC<{ click: boolean }> = ({ click }) => {
  const frame = useCurrentFrame();
  const { props, hookFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const src = scene.image ? props.urls.board + encodeURIComponent(scene.image) : null;
  const aspect = useImageAspect(src);
  if (aspect === null) return null; // still measuring (the render waits for it)
  const missing = aspect === 'missing';
  const a = missing ? 0.46 : aspect;
  const kind: FrameKind = scene.frame ?? (a > 1 ? 'browser' : 'phone');

  const text = (scene.text ?? '').trim();
  const cap = !click && text ? fitText(text, { maxW: BOX.w - 60, maxLines: 2, max: 56, min: 36, charW: ITALIC_W }) : null;
  const capH = cap ? cap.lines.length * cap.size * 1.15 + 44 : 0;
  const L = deviceLayout(kind, a, BOX.x + BOX.w / 2, BOX.y + 6, BOX.w, BOX_H - capH - 12);
  const b = breath(frame, frames);
  const e = first ? 1 : ease(frame, 2, 24);

  // Where the picture sits in the screen, and how it moves.
  const point = { x: Math.min(1, Math.max(0, scene.point?.x ?? 0.5)), y: Math.min(1, Math.max(0, scene.point?.y ?? 0.5)) };
  let focus = point;
  let drift = 1;
  if (!click) {
    const probe = cover(a, L.screen, { x: 0.5, y: 0 });
    const scrolls = probe.h > L.screen.h * 1.15 || probe.w > L.screen.w * 1.15;
    const k = interpolate(frame, [8, Math.max(9, frames - 6)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
    focus = scrolls ? { x: probe.w > L.screen.w * 1.15 ? k : 0.5, y: probe.h > L.screen.h * 1.15 ? k : 0.5 } : { x: 0.5, y: 0.5 };
    drift = scrolls ? 1 : 1.07 - 0.07 * b; // a picture that fits slowly settles from 107%
  }
  const c = cover(a, L.screen, focus);
  const P = { x: point.x * c.w - c.x, y: point.y * c.h - c.y }; // the click point inside the screen

  // Click timeline (local frames): glide, press, zoom, label.
  const arrive = Math.round(Math.min(40, Math.max(22, frames * 0.3)));
  const glide = interpolate(frame, [6, arrive], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const press = pressAt(frame, arrive + 4);
  const zoom = click ? 1 + 0.6 * interpolate(frame, [arrive + 8, arrive + 34], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) }) : drift;
  const ring = interpolate(frame, [arrive + 4, arrive + 24], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const lab = reveal(frame, arrive + 16, false, 16);

  const start = { x: L.screen.x + L.screen.w * 0.86, y: L.screen.y + L.screen.h * 1.02 };
  const end = { x: L.screen.x + P.x, y: L.screen.y + P.y };
  const cur = { x: start.x + (end.x - start.x) * glide, y: start.y + (end.y - start.y) * glide - Math.sin(glide * Math.PI) * 60 };
  const label = click && text ? fitText(text, { maxW: 520, maxLines: 2, max: 40, min: 30, charW: ITALIC_W }) : null;
  const labW = label ? Math.max(...label.lines.map((l) => l.length)) * label.size * ITALIC_W + 56 : 0;
  const labX = Math.min(BOX.x + BOX.w - labW, Math.max(BOX.x, end.x + 34));
  const labY = Math.max(BOX.y, end.y - 120);

  const origin = click ? `${P.x}px ${P.y}px` : '50% 50%';
  return (
    <div style={{ position: 'absolute', inset: 0, color: theme.text }}>
      <div style={{ position: 'absolute', inset: 0, opacity: e, transform: `translateY(${(1 - e) * 50 - (click ? 0 : b * 10)}px)` }}>
        <DeviceFrame layout={L} theme={theme}>
          {missing ? (
            <EmptyScreen theme={theme} />
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '100%', transformOrigin: origin, transform: `scale(${zoom})` }}>
              <Img src={src!} style={{ position: 'absolute', left: -c.x, top: -c.y, width: c.w, height: c.h, display: 'block' }} />
            </div>
          )}
        </DeviceFrame>
        {click ? (
          <>
            {[0, 0.35].map((d, i) => {
              const r = Math.max(0, ring - d) / (1 - d);
              return r > 0 && r < 1 ? (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: end.x - 80 * r,
                    top: end.y - 80 * r,
                    width: 160 * r,
                    height: 160 * r,
                    borderRadius: '50%',
                    border: `3px solid ${theme.line}`,
                    boxShadow: '0 0 0 1.5px rgba(255,255,255,0.7)',
                    opacity: 1 - r,
                  }}
                />
              ) : null;
            })}
            <Cursor x={cur.x} y={cur.y} press={press} size={84} opacity={first ? 1 : Math.min(1, frame / 6)} />
            {label ? (
              <div
                style={{
                  position: 'absolute',
                  left: labX,
                  top: labY,
                  padding: '14px 28px',
                  borderRadius: 40,
                  background: theme.text,
                  color: theme.bg,
                  opacity: lab,
                  transform: `translateY(${(1 - lab) * 14}px) scale(${0.94 + 0.06 * lab})`,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                }}
              >
                {label.lines.map((l, i) => (
                  <div key={i} style={{ ...serif(hookFont, label.size, true), lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                    {l}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      {cap ? (
        <div style={{ position: 'absolute', left: BOX.x, width: BOX.w, top: L.outer.y + L.outer.h + 40, textAlign: 'center', color: theme.soft, opacity: reveal(frame, 16, first, 20) }}>
          {cap.lines.map((l, i) => (
            <div key={i} style={{ ...serif(hookFont, cap.size, true), lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const Screen: React.FC = () => <Product click={false} />;
export const Click: React.FC = () => <Product click />;
