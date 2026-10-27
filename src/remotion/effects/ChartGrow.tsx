// An editorial chart card that grows: a serif title, then bars rise one after another with a soft
// spring while their numbers count up. The biggest bar (the last one on a tie) is the accent colour.
// When the series ends on its peak, a small "+400%" note appears and a thin trend line draws over the tops.
// e.text = title, e.items = "Label: number" (2-6 bars). The model places the card (e.rect, e.scale).
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { CREAM, INK, luminance, withAlpha } from '../color';
import { useReel } from '../context';
import { CHART_SIZE, type TimedEffect } from '../model';
import { CLAMP, easeIn, outro } from './anim';

export type Bar = { label: string; value: number; decimals: number; comma: boolean; suffix: string };

// "Wiosna: 20", "2026: 90", "x: 12,5", "Cena: 1 200 zł", "Wzrost - 40%". Bad lines are skipped.
export const parseBars = (items: string[] | undefined): Bar[] => {
  const out: Bar[] = [];
  for (const raw of items ?? []) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    // label, optional separator, number (spaces as thousands, comma or dot decimals), short unit.
    const m = s.match(/^(.*?)\s*[:：=–—-]?\s*([-+]?\d[\d\s  ]*(?:[.,]\d+)?)\s*(%|[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ.]{1,4})?\s*$/);
    if (!m) continue;
    const label = m[1].replace(/\s*[:：=–—-]\s*$/, '').trim();
    if (!label) continue;
    const numText = m[2].replace(/[\s  ]/g, '');
    const comma = /,\d+$/.test(numText);
    const value = Number(numText.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const dec = numText.match(/[.,](\d+)$/);
    out.push({ label, value, decimals: dec ? Math.min(2, dec[1].length) : 0, comma, suffix: m[3] ?? '' });
    if (out.length === 6) break;
  }
  return out;
};

const fmt = (v: number, b: Bar) => {
  const [int, frac] = Math.abs(v).toFixed(b.decimals).split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : int; // thin space, Polish style
  const unit = b.suffix ? (b.suffix === '%' ? '%' : ' ' + b.suffix) : '';
  return (v < 0 ? '−' : '') + grouped + (frac ? (b.comma ? ',' : '.') + frac : '') + unit;
};

// Very light accents (pale gold) are deepened a little at the foot of the bar so it reads on cream.
const deepen = (c: string, k: number) => {
  const p = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (!p) return c;
  const n = parseInt(p[1], 16);
  const ch = (sh: number) => Math.round(((n >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

export const ChartGrow: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, hookFont, subFont } = useReel();
  const bars = parseBars(e.items);
  if (!e.rect || bars.length === 0) return null;

  const W = CHART_SIZE.w;
  const H = CHART_SIZE.h;
  const accent = props.edit.style.accentColor || '#C9A46A';
  const accentLight = luminance(accent) > 0.55;
  const accentFoot = accentLight ? deepen(accent, 0.8) : accent;

  const n = bars.length;
  const max = Math.max(...bars.map((b) => b.value), 0) || 1;
  let hi = 0;
  bars.forEach((b, i) => {
    if (b.value >= bars[hi].value) hi = i;
  });

  // ---- Timing (local frames): card in, then the bars one by one across about half the effect.
  const cardIn = easeIn(frame, 0, 16);
  const o = outro(frame, e.frames, 10);
  const barStart = 12;
  const growWindow = Math.max(18, Math.min(e.frames * 0.42, 54));
  const step = n > 1 ? (growWindow - 12) / (n - 1) : 0;
  const barAt = (i: number) => Math.round(barStart + i * step);
  const grow = (i: number) => spring({ frame: frame - barAt(i), fps: FPS, config: { damping: 15, stiffness: 120, mass: 0.85 } });
  const allDone = barAt(n - 1) + 20;

  // ---- Layout inside the card (base px; the whole card is scaled by e.scale).
  const title = (e.text ?? '').trim();
  const padX = 56;
  const first = bars[0].value;
  const last = bars[n - 1].value;
  const growth = n >= 2 && hi === n - 1 && first > 0 && last > first ? Math.round(((last - first) / first) * 100) : null;
  const titleSize = title.length > 40 ? 46 : 54;
  const titleW = W - padX * 2 - (growth !== null ? 170 : 0);
  const titleLines = title ? Math.min(2, Math.ceil((title.length * titleSize * 0.43) / titleW)) : 0;
  const headerH = title ? 46 + titleLines * titleSize * 1.04 + 26 : 48;
  const labelH = 64;
  const valueH = 78;
  const plotTop = headerH + valueH;
  const plotBottom = H - 38 - labelH;
  const plotH = plotBottom - plotTop;
  const plotW = W - padX * 2;
  const slot = plotW / n;
  const barW = Math.min(118, slot * (n <= 3 ? 0.46 : 0.56));
  const heightOf = (v: number) => Math.max(6, (Math.max(0, v) / max) * plotH);
  const noteIn = easeIn(frame, allDone - 6, 16);

  // Trend line over the bar tops (only for a rising series), drawn after the bars.
  const tops = bars.map((b, i) => ({ x: padX + slot * (i + 0.5), y: plotBottom - heightOf(b.value) }));
  let path = `M ${tops[0].x} ${tops[0].y}`;
  let len = 0;
  for (let i = 1; i < n; i++) {
    const a = tops[i - 1];
    const b = tops[i];
    const mx = (a.x + b.x) / 2;
    path += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    len += Math.hypot(b.x - a.x, b.y - a.y) * 1.1;
  }
  const lineDraw = interpolate(frame, [allDone - 6, allDone + 16], [0, 1], CLAMP);
  const showLine = n >= 3 && growth !== null;
  const glow = frame > allDone ? 0.5 + 0.5 * Math.sin((frame - allDone) / 8) : 0;
  const titleIn = easeIn(frame, 4, 16);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: e.rect.x, top: e.rect.y, width: W, height: H, transform: `scale(${e.scale})`, transformOrigin: '0 0' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 38,
            overflow: 'hidden',
            background: `linear-gradient(170deg, ${withAlpha(CREAM, 0.96)} 0%, ${withAlpha('#EEE5D7', 0.94)} 100%)`,
            backdropFilter: 'blur(22px) saturate(120%)',
            WebkitBackdropFilter: 'blur(22px) saturate(120%)',
            border: '1.5px solid rgba(255,255,255,0.65)',
            boxShadow: '0 34px 70px rgba(0,0,0,0.26), 0 6px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.85)',
            opacity: cardIn * o,
            transform: `translateY(${(1 - cardIn) * 46 + (1 - o) * 18}px) scale(${interpolate(cardIn, [0, 1], [0.95, 1]) * interpolate(o, [0, 1], [0.97, 1])}) rotate(${e.rotation * 0.12}deg)`,
            transformOrigin: '50% 60%',
            color: INK,
          }}
        >
          {/* Header: serif title + growth note */}
          {title ? (
            <div
              style={{
                position: 'absolute',
                left: padX,
                top: 44,
                width: titleW,
                fontFamily: hookFont,
                fontSize: titleSize,
                lineHeight: 1.04,
                letterSpacing: '-0.01em',
                opacity: titleIn,
                transform: `translateY(${(1 - titleIn) * 12}px)`,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title}
            </div>
          ) : null}
          {growth !== null ? (
            <div
              style={{
                position: 'absolute',
                right: padX,
                top: title ? 50 : 30,
                padding: '10px 18px 11px 15px',
                borderRadius: 999,
                background: INK,
                color: CREAM,
                fontFamily: subFont,
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: noteIn,
                transform: `translateY(${(1 - noteIn) * 10}px) scale(${interpolate(noteIn, [0, 1], [0.85, 1])})`,
                transformOrigin: '100% 50%',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path d="M3 14 L9 5 L15 14" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              +{String(growth).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}%
            </div>
          ) : null}
          {title ? (
            <div style={{ position: 'absolute', left: padX, top: headerH - 6, height: 1.5, width: plotW * easeIn(frame, 8, 20), background: 'rgba(20,18,16,0.14)' }} />
          ) : null}

          {/* Faint guides */}
          {[0.5, 1].map((g) => (
            <div
              key={g}
              style={{
                position: 'absolute',
                left: padX,
                width: plotW,
                top: plotBottom - plotH * g,
                borderTop: '2px dotted rgba(20,18,16,0.12)',
                opacity: easeIn(frame, 8, 18),
              }}
            />
          ))}

          {/* Bars, values, labels */}
          {bars.map((b, i) => {
            const g = grow(i);
            const isHi = i === hi;
            const h = heightOf(b.value) * g;
            const cx = padX + slot * (i + 0.5);
            const counted = b.value * Math.min(1, g);
            const vIn = interpolate(frame - barAt(i), [1, 8], [0, 1], CLAMP);
            const lIn = easeIn(frame, barAt(i) - 8, 14);
            const r = Math.min(20, barW / 2);
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: 'absolute',
                    left: cx - barW / 2,
                    width: barW,
                    top: plotBottom - h,
                    height: h,
                    borderRadius: `${r}px ${r}px 2px 2px`,
                    background: isHi ? `linear-gradient(180deg, ${accent} 0%, ${accentFoot} 100%)` : `linear-gradient(180deg, #3A3530 0%, ${INK} 100%)`,
                    boxShadow: isHi
                      ? `0 12px ${24 + glow * 14}px ${withAlpha(accentFoot.startsWith('#') ? accentFoot : accent, 0.35 + glow * 0.15)}, inset 0 1.5px 0 rgba(255,255,255,0.55)`
                      : 'inset 0 1px 0 rgba(255,255,255,0.14)',
                    opacity: g > 0.002 ? 1 : 0,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: cx - slot / 2,
                    width: slot,
                    top: plotBottom - h - (isHi ? 74 : 58),
                    textAlign: 'center',
                    fontFamily: hookFont,
                    fontSize: isHi ? 66 : 48,
                    lineHeight: 1,
                    letterSpacing: '-0.01em',
                    fontVariantNumeric: 'tabular-nums lining-nums',
                    color: isHi ? INK : withAlpha(INK, 0.72),
                    opacity: vIn,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmt(counted, b)}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: cx - slot / 2 + 4,
                    width: slot - 8,
                    top: plotBottom + 12,
                    textAlign: 'center',
                    fontFamily: subFont,
                    fontSize: Math.min(n >= 5 ? 21 : n === 4 ? 23 : 25, ((slot - 12) / Math.max(1, b.label.length)) * 1.25),
                    lineHeight: 1.5,
                    paddingTop: 4,
                    fontWeight: isHi ? 600 : 500,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: withAlpha(INK, isHi ? 0.92 : 0.5),
                    whiteSpace: 'nowrap',
                    opacity: lIn,
                    transform: `translateY(${(1 - lIn) * 8}px)`,
                  }}
                >
                  {b.label}
                </div>
              </React.Fragment>
            );
          })}

          {/* Thin baseline */}
          <div style={{ position: 'absolute', left: padX - 8, top: plotBottom, height: 2, width: (plotW + 16) * easeIn(frame, 6, 18), background: INK, borderRadius: 1 }} />

          {showLine ? (
            <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              <g transform="translate(0,-92)">
                <path
                  d={path}
                  fill="none"
                  stroke={withAlpha(INK, 0.45)}
                  strokeWidth={2}
                  strokeDasharray={`${len} ${len}`}
                  strokeDashoffset={len * (1 - lineDraw)}
                  strokeLinecap="round"
                />
                {tops.map((t, i) => {
                  const at = i / Math.max(1, n - 1);
                  const d = lineDraw <= 0 ? 0 : interpolate(lineDraw, [at - 0.03, at + 0.06], [0, 1], CLAMP);
                  return <circle key={i} cx={t.x} cy={t.y} r={i === hi ? 7 : 5} fill={i === hi ? accent : CREAM} stroke={INK} strokeWidth={2} opacity={d} />;
                })}
              </g>
            </svg>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
