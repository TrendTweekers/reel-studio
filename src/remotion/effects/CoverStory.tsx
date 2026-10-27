// Magazine cover. Her video gets a warm print grade; a huge masthead (e.text, hook font) runs across
// the top BEHIND her head (footage -> masthead -> <Person>), with cover lines (e.items) in two
// columns below her face, an issue line and a small barcode at the bottom-left corner.
// Without the cut-out the masthead is drawn in front, moved/sized so it never covers her face.
// Entry: a quick cream flash, then the cover type settles in. Exit: the whole cover fades out
// over the same footage, so it hands back to the normal video without a jump.
import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from 'remotion';
import { WIDTH } from '../../shared/types';
import { INK } from '../color';
import { useReel } from '../context';
import { fontFamily } from '../fonts';
import { RIGHT_UI, SAFE, SAFE_BOTTOM, type TimedEffect, type Zoom } from '../model';
import { footageFilterFor, Grade } from '../parts/Vibe';
import { CLAMP, easeIn, outro } from './anim';
import { Footage, Person, useAbsFrame, useHasCutout } from './footage';

const PRINT = 'sepia(0.16) contrast(1.06) saturate(0.92) brightness(1.01)';
const PAPER = '#FBF6EC';

const zoomStyle = (z: Zoom): React.CSSProperties => ({
  transformOrigin: `${z.ox}px ${z.oy}px`,
  transform: z.s === 1 ? undefined : `scale(${z.s})`,
});

// Her video (or cut-out) exactly as the base layer frames it, plus the print grade.
const Cam: React.FC<{ e: TimedEffect; person?: boolean }> = ({ e, person }) => {
  const { model, props } = useReel();
  const abs = useAbsFrame(e);
  const [outer, inner] = model.camera(Math.min(abs, model.total - 1));
  const filter = [footageFilterFor(props.edit), PRINT].filter(Boolean).join(' ');
  return (
    <AbsoluteFill style={{ ...zoomStyle(outer), filter }}>
      <AbsoluteFill style={zoomStyle(inner)}>{person ? <Person e={e} /> : <Footage e={e} />}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// Deterministic barcode bars (seeded by the effect id).
const Barcode: React.FC<{ seed: string; color: string }> = ({ seed, color }) => {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; x < 150; i++) {
      const w = 1.5 + Math.floor(random(`${seed}-w${i}`) * 3) * 1.5;
      if (i % 2 === 0) out.push({ x, w });
      x += w + 1.2;
    }
    return out;
  }, [seed]);
  const digits = useMemo(
    () => Array.from({ length: 12 }, (_, i) => Math.floor(random(`${seed}-d${i}`) * 10)).join(''),
    [seed],
  );
  return (
    <div style={{ background: PAPER, padding: '10px 12px 6px', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
      <svg width={150} height={52} viewBox="0 0 150 52" style={{ display: 'block' }}>
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.w} height={52} fill={color} />
        ))}
      </svg>
      <div style={{ font: '500 13px/1.2 "Helvetica Neue", Helvetica, Arial, sans-serif', letterSpacing: '0.18em', color, marginTop: 4, textAlign: 'center' }}>
        {digits}
      </div>
    </div>
  );
};

export const CoverStory: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { props, model, hookFont } = useReel();
  const cutout = useHasCutout();
  const accent = props.edit.style.accentColor || '#E9D3A6';
  const serif = fontFamily('Instrument Serif');
  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const title = ((e.text ?? '').trim() || 'STYL').toUpperCase();
  const items = (e.items ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);

  // Her head over the whole effect (face box grown for hair), so nothing lands on it.
  const head = model.headSpan(e.from, e.from + e.frames - 1);
  const headBottom = head.y + head.h;

  const hNow = model.headRect(Math.min(useAbsFrame(e), model.total - 1));
  const headMask = `radial-gradient(ellipse ${Math.round(hNow.w * 0.78)}px ${Math.round(hNow.h * 0.74)}px at ${Math.round(
    hNow.x + hNow.w / 2,
  )}px ${Math.round(hNow.y + hNow.h * 0.5)}px, black 84%, transparent 100%)`;

  // ---- masthead layout ----
  const maxW = WIDTH - 2 * SAFE.side - 10;
  const charW = 0.56; // Instrument/Playfair caps, a little generous
  let size = Math.min(470, maxW / (title.length * charW));
  let mastTop = SAFE.top - size * 0.12; // the cap tops sit on the safe line
  let mastColor = INK;
  let mastFront = !cutout;
  if (!cutout) {
    const room = head.y - SAFE.top - 20; // free band above her head
    if (room >= size * 0.78) {
      // fits above the head as is
    } else if (room >= 150) {
      size = Math.min(size, room / 0.78);
    } else {
      // No room above: put it on the band under her chin, in cream so it reads on clothes.
      size = Math.min(size, 300);
      mastTop = headBottom + 24 - size * 0.12;
      mastColor = PAPER;
    }
  }
  const mastBottom = mastTop + size * 0.95;

  // ---- cover lines layout: two columns under her face ----
  const linesTop = Math.max(mastFront ? mastBottom + 40 : 0, headBottom + 40, 900);
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);
  const colW = 360;
  const rightEdge = RIGHT_UI.x - 10;

  // ---- motion ----
  const flash = interpolate(frame, [0, 2, 9], [0, 0.9, 0], { ...CLAMP, easing: Easing.out(Easing.quad) });
  const o = outro(frame, e.frames, 10);
  const mast = easeIn(frame, 2, 16);
  const dust = (i: number) => easeIn(frame, 8 + i * 4, 14);

  const line = (text: string, i: number, lead: boolean, align: 'left' | 'right') => {
    const t = dust(i);
    return (
      <div
        key={`${align}-${i}`}
        style={{
          opacity: t,
          transform: `translateY(${(1 - t) * 18}px)`,
          textAlign: align,
          marginBottom: 34,
        }}
      >
        <div
          style={{
            fontFamily: sans,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '0.32em',
            color: accent,
            marginBottom: 8,
            textShadow: '0 1px 8px rgba(0,0,0,0.35)',
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </div>
        <div
          style={{
            fontFamily: lead ? hookFont : serif,
            fontStyle: lead ? 'italic' : 'normal',
            fontSize: lead ? 60 : 44,
            lineHeight: 1.04,
            color: PAPER,
            textShadow: '0 2px 18px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {text}
        </div>
      </div>
    );
  };

  const masthead = (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width: WIDTH,
        top: mastTop,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        fontFamily: hookFont,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        color: mastColor,
        opacity: mast,
        transform: `translateY(${(1 - mast) * -30}px) scale(${interpolate(mast, [0, 1], [1.06, 1])})`,
        textShadow: mastColor === PAPER ? '0 4px 30px rgba(0,0,0,0.35)' : '0 0 40px rgba(250,245,236,0.35)',
      }}
    >
      {title}
    </div>
  );

  // Issue line: thin rule + small caps, under the masthead (behind her with the cut-out).
  const issue = (
    <div
      style={{
        position: 'absolute',
        left: SAFE.side + 10,
        right: WIDTH - rightEdge,
        top: mastBottom + 6,
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: sans,
        fontSize: 19,
        fontWeight: 600,
        letterSpacing: '0.34em',
        color: mastColor,
        opacity: mast * 0.9,
        borderTop: `1.5px solid ${mastColor}`,
        paddingTop: 10,
      }}
    >
      <span>N° 01</span>
      <span>WYDANIE SPECJALNE</span>
    </div>
  );

  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Cam e={e} />
      <Grade />
      {/* Warm paper tone + a soft darker foot so the cover lines read. */}
      <AbsoluteFill style={{ background: 'rgba(255,214,170,0.07)', mixBlendMode: 'multiply' }} />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0) ${Math.round((linesTop / 1920) * 100) - 8}%, rgba(20,14,8,0.28) 100%)`,
        }}
      />
      {mastFront ? null : (
        <>
          {masthead}
          {issue}
        </>
      )}
      {/* Only her head comes back over the masthead (soft oval around the head box), so the title
          stays readable over the hair and room on both sides of her face. */}
      {cutout ? (
        <AbsoluteFill style={{ maskImage: headMask, WebkitMaskImage: headMask }}>
          <Cam e={e} person />
        </AbsoluteFill>
      ) : null}
      {mastFront ? (
        <>
          {masthead}
          {issue}
        </>
      ) : null}
      {/* Cover lines */}
      <div style={{ position: 'absolute', left: SAFE.side + 10, top: linesTop, width: colW }}>
        {left.map((t, k) => line(t, k * 2, k === 0, 'left'))}
      </div>
      <div style={{ position: 'absolute', left: rightEdge - colW, top: linesTop + 110, width: colW }}>
        {right.map((t, k) => line(t, k * 2 + 1, false, 'right'))}
      </div>
      {/* Barcode, bottom-left corner of the safe area */}
      <div style={{ position: 'absolute', left: SAFE.side + 10, top: SAFE_BOTTOM - 100, opacity: dust(4) }}>
        <Barcode seed={e.id} color={INK} />
      </div>
      <AbsoluteFill style={{ background: '#FFFBF3', opacity: flash, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
