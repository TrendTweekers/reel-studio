// "type": a search / prompt box. The placeholder (items[0]) waits in grey, then scene.text is typed
// at a natural, slightly uneven pace with a caret, the send button is pressed, three dots think,
// and the result (items[1]) rises in below.
import React from 'react';
import { interpolate, random, useCurrentFrame } from 'remotion';
import { useReel } from '../context';
import { breakLines } from '../model';
import { BOX, BOX_CY, CLAMP, breath, ease, fitText, mix, reveal, serif, useScene } from './kit';

const SANS_W = 0.56;

export const Type: React.FC = () => {
  const frame = useCurrentFrame();
  const { hookFont, subFont } = useReel();
  const { scene, frames, first, theme } = useScene();
  const text = (scene.text ?? '').trim();
  const placeholder = (scene.items?.[0] ?? '').trim();
  const result = (scene.items?.[1] ?? '').trim();

  const boxW = BOX.w;
  const textW = boxW - 220; // icon on the left, send button on the right
  const fit = fitText(text || ' ', { maxW: textW, maxLines: 3, max: 64, min: 32, charW: SANS_W });
  const lines = breakLines(text, fit.size, SANS_W, textW);
  const chars = lines.join('').length;

  // Per-character times: about 12 per second, faster when the scene is short, never past 55% of it.
  const t0 = first ? 4 : 14;
  const room = Math.max(12, frames * 0.55 - t0);
  const step = Math.min(30 / 12, room / Math.max(1, chars));
  const times: number[] = [];
  let t = t0;
  for (let i = 0; i < chars; i++) {
    times.push(t);
    t += step * (0.6 + 0.8 * random(`type-${scene.id}-${i}`));
  }
  const done = t;
  const shown = times.filter((x) => x <= frame).length;
  const typing = frame >= t0 && frame < done + 2;
  const caretOn = typing || Math.floor(frame / 15) % 2 === 0;

  const sendAt = done + 6;
  const press = interpolate(frame, [sendAt - 2, sendAt, sendAt + 4], [0, 1, 0], CLAMP);
  const think = frame >= sendAt + 2 && frame < sendAt + 18;
  const resAt = sendAt + 18;
  const res = result ? reveal(frame, resAt, false, 20) : 0;
  const resFit = result ? fitText(result, { maxW: BOX.w - 70, maxLines: 3, max: 66, min: 40 }) : null;

  const e = first ? 1 : ease(frame, 2, 20);
  const b = breath(frame, frames);
  const lineH = fit.size * 1.3;
  const boxH = Math.max(124, lines.length * lineH + 56);
  const resH = resFit ? resFit.lines.length * resFit.size * 1.12 + 80 : 0;
  const top = BOX_CY - (boxH + resH) / 2 - 40;
  const fill = theme.dark ? mix(theme.bg, theme.text, 0.08) : '#FFFDF9';

  // Typed characters, line by line.
  let left = shown;
  const typed = lines.map((l) => {
    const n = Math.max(0, Math.min(l.length, left));
    left -= l.length;
    return l.slice(0, n);
  });
  const caretLine = Math.max(0, typed.findIndex((l, i) => l.length < lines[i].length) === -1 ? lines.length - 1 : typed.findIndex((l, i) => l.length < lines[i].length));

  return (
    <div style={{ position: 'absolute', inset: 0, color: theme.text, transform: `translateY(${-b * 14}px)` }}>
      <div
        style={{
          position: 'absolute',
          left: BOX.x,
          top,
          width: boxW,
          height: boxH,
          borderRadius: lines.length > 1 ? 40 : boxH / 2,
          background: fill,
          boxShadow: theme.dark ? `0 0 0 1.5px ${mix(theme.bg, theme.text, 0.2)}, 0 30px 60px rgba(0,0,0,0.45)` : `0 0 0 1.5px ${mix(theme.bg, theme.text, 0.14)}, 0 26px 50px rgba(60,40,20,0.14)`,
          opacity: e,
          transform: `translateY(${(1 - e) * 30}px)`,
        }}
      >
        <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: 'absolute', left: 40, top: lines.length > 1 ? 34 : boxH / 2 - 22 }}>
          <circle cx={10.5} cy={10.5} r={6.5} fill="none" stroke={theme.soft} strokeWidth={1.6} />
          <line x1={15.4} y1={15.4} x2={20.5} y2={20.5} stroke={theme.soft} strokeWidth={1.6} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', left: 110, top: (boxH - lines.length * lineH) / 2, width: textW, fontFamily: subFont, fontSize: fit.size, lineHeight: `${lineH}px` }}>
          {shown === 0 ? (
            <div style={{ color: mix(fill, theme.text, 0.4), whiteSpace: 'nowrap', position: 'relative' }}>
              <span style={{ position: 'absolute', left: -2, top: lineH * 0.18, width: 3, height: lineH * 0.64, background: theme.line, opacity: caretOn ? 1 : 0 }} />
              {placeholder || ' '}
            </div>
          ) : (
            typed.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre', height: lineH }}>
                {l}
                {i === caretLine ? <span style={{ display: 'inline-block', width: 3, height: lineH * 0.64, marginLeft: 3, verticalAlign: 'middle', background: theme.line, opacity: caretOn ? 1 : 0 }} /> : null}
              </div>
            ))
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            right: 26,
            top: lines.length > 1 ? 26 : boxH / 2 - 36,
            width: 72,
            height: 72,
            borderRadius: 36,
            background: shown >= chars && chars > 0 ? theme.text : mix(fill, theme.text, 0.18),
            transform: `scale(${1 - press * 0.12})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={30} height={30} viewBox="0 0 24 24">
            <path d="M12 19 V5 M5.5 11.5 L12 5 L18.5 11.5" fill="none" stroke={fill} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {think ? (
        <div style={{ position: 'absolute', left: BOX.x + 40, top: top + boxH + 54, display: 'flex', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 7, background: theme.soft, opacity: 0.35 + 0.65 * Math.max(0, Math.sin(((frame - sendAt) / 6 - i * 0.7) * Math.PI)) }} />
          ))}
        </div>
      ) : null}
      {resFit ? (
        <div style={{ position: 'absolute', left: BOX.x, top: top + boxH + 50, width: BOX.w, display: 'flex', gap: 34, opacity: res, transform: `translateY(${(1 - res) * 22}px)` }}>
          <div style={{ width: 3, background: theme.line, transformOrigin: '50% 0', transform: `scaleY(${res})` }} />
          <div>
            {resFit.lines.map((l, i) => (
              <div key={i} style={{ ...serif(hookFont, resFit.size), lineHeight: 1.12, whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
