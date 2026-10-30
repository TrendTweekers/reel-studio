// The Polaroid print: a cream and ink instant camera fires (small flash), a print slides up out of
// the slot on its top, gets pulled out, tilts into place a bit larger while the camera slides away,
// and the picture develops: dark and milky at first, then her reel (muted) over ~1.2 s.
// e.text = optional handwritten caption on the white bottom of the print (hookFont italic).
// Layers, back to front: the rear lip of the camera top, the print (clipped at the slot line, so it
// comes out from between the rear and the front), the camera front. Once fully out, the print is free.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { INK } from '../color';
import { useReel } from '../context';
import type { TimedEffect } from '../model';
import { CLAMP, lerp, outro, popIn } from './anim';
import { placeObject } from './cursor';
import { ClipVideo, useClips } from './reels';

// Camera, unscaled.
const CW = 400;
const CH = 290;
// Print while inside the camera; an instant print is portrait with a thick white bottom.
const PB = 14; // border
const PBOT = 74; // bottom border
const IW = 272;
const IH = Math.round(IW * (4 / 3));
const PW = IW + 2 * PB;
const PH = IH + PB + PBOT;
const GROW = 1.22; // the print once out
// The whole thing: print above the camera.
const SW = Math.max(CW, PW * GROW) + 20;
const SH = PH + CH + 10;
const CAM_Y = SH - CH;
const SLOT_Y = CAM_Y + 4;

// The shutter fires right away: the 'camera-shutter' sound plays at the effect start.
export const POLAROID_SHUTTER_AT = 4;
const EJECT = [9, 40] as const;
const DEVELOP_FROM = 44;
const DEVELOP_LEN = Math.round(1.2 * FPS);

const Camera: React.FC<{ flash: number; font: string }> = ({ flash, font }) => (
  <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
    <defs>
      <linearGradient id="pl-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F6F1E8" />
        <stop offset="1" stopColor="#E4D9C7" />
      </linearGradient>
      <radialGradient id="pl-glass" cx="0.38" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#4A4F5C" />
        <stop offset="0.55" stopColor="#1B1C21" />
        <stop offset="1" stopColor="#0B0B0D" />
      </radialGradient>
      <linearGradient id="pl-flash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#D9D3C9" />
      </linearGradient>
    </defs>
    {/* Body. */}
    <rect x={0} y={0} width={CW} height={CH} rx={46} fill="url(#pl-body)" style={{ filter: 'drop-shadow(0 22px 34px rgba(0,0,0,0.30))' }} />
    <rect x={1.5} y={1.5} width={CW - 3} height={CH - 3} rx={45} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2} />
    {/* A thin ink band at the base, like the grip trim on a good camera. */}
    <path d={`M 0 ${CH - 62} H ${CW} V ${CH - 46} Q ${CW} ${CH} ${CW - 46} ${CH} H 46 Q 0 ${CH} 0 ${CH - 46} Z`} fill={INK} opacity={0.92} />
    <text x={CW - 34} y={CH - 20} textAnchor="end" fontFamily={font} fontStyle="italic" fontSize={24} fill="#F5EFE6" opacity={0.75}>
      instant
    </text>
    {/* The slot the print comes out of. */}
    <rect x={(CW - PW - 16) / 2} y={2} width={PW + 16} height={7} rx={3.5} fill="#2A2622" opacity={0.85} />
    {/* Flash window (ribbed), lights up when it fires. */}
    <rect x={34} y={34} width={104} height={50} rx={10} fill="url(#pl-flash)" stroke="rgba(20,18,16,0.25)" strokeWidth={1.5} />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <line key={i} x1={46 + i * 13} y1={40} x2={46 + i * 13} y2={78} stroke="rgba(20,18,16,0.12)" strokeWidth={2} />
    ))}
    <rect x={34} y={34} width={104} height={50} rx={10} fill="#FFFDF5" opacity={flash} />
    {/* Viewfinder. */}
    <rect x={CW - 104} y={36} width={66} height={44} rx={10} fill={INK} />
    <rect x={CW - 96} y={43} width={30} height={14} rx={5} fill="#5B6070" opacity={0.6} />
    {/* Lens: ink barrel, rings, glass with a soft reflection. */}
    <circle cx={CW / 2} cy={150} r={96} fill={INK} />
    <circle cx={CW / 2} cy={150} r={96} fill="none" stroke="#CFC5B5" strokeWidth={2.5} />
    <circle cx={CW / 2} cy={150} r={86} fill="none" stroke="#3A3631" strokeWidth={3} />
    <circle cx={CW / 2} cy={150} r={70} fill="#242220" />
    <circle cx={CW / 2} cy={150} r={56} fill="url(#pl-glass)" />
    <ellipse cx={CW / 2 - 18} cy={128} rx={20} ry={11} fill="#FFFFFF" opacity={0.22} transform={`rotate(-30 ${CW / 2 - 18} 128)`} />
    <circle cx={CW / 2 + 22} cy={170} r={5} fill="#FFFFFF" opacity={0.12} />
  </svg>
);

export const Polaroid: React.FC<{ e: TimedEffect }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { model, hookFont } = useReel();
  const caption = (e.text ?? '').trim();
  const [clip] = useClips(e, 1);

  // ---- Layout once for the whole effect.
  const spot = placeObject(e, model, SW, SH);
  const tilt = e.side === 'left' ? -4 : 4; // leans outward, away from her

  // ---- Motion.
  const appear = popIn(frame);
  const end = outro(frame, e.frames, 12);
  const shot = POLAROID_SHUTTER_AT;
  const flash = interpolate(frame, [shot, shot + 1, shot + 9], [0, 1, 0], CLAMP);
  const recoil = interpolate(frame, [shot, shot + 2, shot + 7], [0, 1, 0], CLAMP);
  // The motor pushes the print out in small steps, slowing at the end.
  const ej = interpolate(frame, [EJECT[0], EJECT[1]], [0, 1], { ...CLAMP, easing: Easing.out(Easing.quad) });
  const stepped = ej - Math.sin(ej * Math.PI * 7) * 0.012 * (1 - ej);
  // Then pulled free: a soft spring into its final place.
  const lift = spring({ frame: frame - EJECT[1], fps: FPS, config: { damping: 16, stiffness: 70, mass: 0.9 } });
  const free = frame >= EJECT[1];
  const camAway = interpolate(frame, [EJECT[1] + 4, EJECT[1] + 22], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });

  const camY = CAM_Y + (1 - appear) * 40 + camAway * 150 + recoil * 4;

  // Print centre: in the slot (rising), then to the middle of the stack, bigger and tilted.
  const inX = SW / 2;
  const inY = camY + (SLOT_Y - CAM_Y) - stepped * PH + PH / 2; // rides with the camera (pop-in, recoil)
  const outX = SW / 2;
  const outY = SH / 2 + 10;
  const px = free ? lerp(lift, inX, outX) : inX;
  const py = free ? lerp(lift, SLOT_Y - PH / 2, outY) : inY; // free: starts where it left the slot, not with the camera
  const ps = (free ? lerp(lift, 1, GROW) : 1) * lerp(end, 0.86, 1);
  const pr = free ? lerp(lift, 0, tilt) + Math.sin(frame / 24) * 0.4 * lift : 0;

  // Develop: dark blue-black, then milky, then the picture comes up.
  const dev = interpolate(frame, [DEVELOP_FROM, DEVELOP_FROM + DEVELOP_LEN], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.sin) });
  const dark = interpolate(dev, [0, 0.55], [1, 0], CLAMP);
  const milk = interpolate(dev, [0.15, 0.5, 1], [0, 0.55, 0], CLAMP);
  const capOp = interpolate(frame, [DEVELOP_FROM + DEVELOP_LEN - 10, DEVELOP_FROM + DEVELOP_LEN + 6], [0, 1], CLAMP);

  const print = (
    <div
      style={{
        position: 'absolute',
        left: px - PW / 2,
        top: py - PH / 2,
        width: PW,
        height: PH,
        transform: `rotate(${pr}deg) scale(${ps})`,
        background: '#FBF9F4',
        borderRadius: 3,
        boxShadow: free ? `0 ${14 + lift * 12}px ${26 + lift * 18}px rgba(0,0,0,${0.18 + lift * 0.1})` : '0 2px 6px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ position: 'absolute', left: PB, top: PB, width: IW, height: IH, overflow: 'hidden', background: '#1E1F24' }}>
        <ClipVideo
          clip={clip}
          delay={EJECT[0]}
          style={{
            width: '100%',
            height: '100%',
            filter: `saturate(${lerp(dev, 0.25, 1)}) contrast(${lerp(dev, 0.75, 1)}) sepia(${lerp(dev, 0.25, 0)})`,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: '#23252C', opacity: dark }} />
        <div style={{ position: 'absolute', inset: 0, background: '#D8D2C6', opacity: milk, mixBlendMode: 'screen' }} />
        {/* A whisper of gloss, so it reads as a print, not a screen. */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%)' }} />
      </div>
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 14,
            height: PBOT - 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: hookFont,
            fontStyle: 'italic',
            fontSize: caption.length > 18 ? 28 : 34,
            color: '#2A2622',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            opacity: capOp,
            transform: `rotate(-1.5deg)`,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );

  const camOp = interpolate(frame, [0, 5], [0, 1], CLAMP) * (1 - camAway) * end;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: spot.x,
          top: spot.y,
          width: SW,
          height: SH,
          transformOrigin: '0 0',
          transform: `scale(${spot.k})`,
        }}
      >
        {/* Rear top housing of the camera: the print slides out in front of it, from the slot
            between it and the body. Ink, with a light top edge so it reads on dark clothes too. */}
        <div
          style={{
            position: 'absolute',
            left: (SW - CW) / 2 + 26,
            top: camY - 40,
            width: CW - 52,
            height: 70,
            borderRadius: '22px 22px 0 0',
            background: 'linear-gradient(180deg, #3A352F, #191715 60%)',
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.22), 0 -1px 0 rgba(245,239,230,0.35)',
            opacity: camOp,
          }}
        />
        {/* Shutter button on the housing. */}
        <div
          style={{
            position: 'absolute',
            left: (SW - CW) / 2 + CW - 104,
            top: camY - 54 + recoil * 6,
            width: 50,
            height: 22,
            borderRadius: '11px 11px 3px 3px',
            background: 'linear-gradient(180deg, #F6F0E6, #D6C9B2)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.3)',
            opacity: camOp,
          }}
        />
        {free ? null : (
          // Clipped at the slot line: the part still inside the camera is not drawn.
          <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: camY + (SLOT_Y - CAM_Y), overflow: 'hidden', opacity: frame >= EJECT[0] ? end : 0 }}>{print}</div>
        )}
        <div
          style={{
            position: 'absolute',
            left: (SW - CW) / 2,
            top: camY,
            width: CW,
            height: CH,
            opacity: camOp,
            transform: `scale(${interpolate(appear, [0, 1], [0.86, 1])})`,
            transformOrigin: '50% 100%',
          }}
        >
          <Camera flash={flash} font={hookFont} />
          {/* The flash bloom, soft and short. */}
          <div
            style={{
              position: 'absolute',
              left: -80,
              top: -90,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,253,245,0.95) 0%, rgba(255,253,245,0.35) 35%, rgba(255,253,245,0) 70%)',
              opacity: flash,
            }}
          />
        </div>
        {free ? <div style={{ opacity: end }}>{print}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
