// The YouTube thumbnail still (composition "Thumbnail", 1280x720).
// A wide frame fills the canvas; a tall frame sits sharp on one side over a blurred fill of itself.
// The title (hook font, bold, as big as fits) sits on the side away from her face, over a soft scrim.
// No title = the clean frame with the light fix.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Img } from 'remotion';
import { THUMBNAIL, type ThumbnailProps } from '../../shared/types';
import { CREAM, isDark } from '../color';
import { boldWeight, fontFamily } from '../fonts';
import { lightFilter } from '../parts/Vibe';

const { width: W, height: H } = THUMBNAIL;
const M = 64; // outer margin
const MAX_SIZE = 168;
const MIN_SIZE = 54;

// Natural aspect (w/h) of the frame image, read once (blocks the render until known).
const useAspect = (src: string) => {
  const [aspect, setAspect] = useState<number | null>(null);
  const [handle] = useState(() => delayRender(`thumbnail frame ${src}`));
  useEffect(() => {
    const img = new Image();
    const done = (a: number) => {
      setAspect(a);
      continueRender(handle);
    };
    img.onload = () => done(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9);
    img.onerror = () => done(16 / 9);
    img.src = src;
  }, [src, handle]);
  return aspect;
};

// Shrinks the font until the block fits its box (real measurement, after the fonts loaded).
const useFit = (key: string, boxW: number, boxH: number) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(MAX_SIZE);
  const [handle, setHandle] = useState<number | null>(null);
  useLayoutEffect(() => {
    setSize(MAX_SIZE);
    setHandle(delayRender(`fit thumbnail title`));
  }, [key, boxW, boxH]);
  useLayoutEffect(() => {
    if (handle === null) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) {
        continueRender(handle);
        setHandle(null);
        return;
      }
      const tooBig = el.scrollHeight > boxH + 1 || el.scrollWidth > boxW + 1;
      if (tooBig && size > MIN_SIZE) setSize((s) => Math.max(MIN_SIZE, Math.floor(s * 0.94)));
      else {
        continueRender(handle);
        setHandle(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [size, handle, boxW, boxH]);
  return { ref, size };
};

export const Thumbnail: React.FC<ThumbnailProps> = ({ frame, title, accent, style, light, face }) => {
  const aspect = useAspect(frame);
  const t = (title ?? '').trim();
  const a = (accent ?? '').trim();
  const hasText = !!(t || a);
  const filter = lightFilter(light);
  const tall = aspect !== null && aspect < 1;

  // Where her face is on the canvas (0..1 of the frame -> canvas px).
  const panelW = Math.round(H * (aspect ?? 1));
  const faceCx = face ? face.x + face.w / 2 : 0.5;
  // Tall frame: the sharp panel goes on the face's side of the canvas... the title takes the rest.
  const panelSide: 'left' | 'right' = faceCx < 0.42 ? 'left' : 'right';
  const panelX = panelSide === 'right' ? W - panelW - M * 0.75 : M * 0.75;
  const faceLeft = tall ? panelX + (face ? face.x : 0.35) * panelW : (face ? face.x : 0.35) * W;
  const faceRight = tall ? panelX + (face ? face.x + face.w : 0.65) * panelW : (face ? face.x + face.w : 0.65) * W;
  const faceMid = (faceLeft + faceRight) / 2;

  // The title takes the side away from her face.
  const textSide: 'left' | 'right' = tall ? (panelSide === 'right' ? 'left' : 'right') : faceMid < W / 2 ? 'right' : 'left';
  const free = textSide === 'right' ? W - M - (tall ? panelX + panelW + 40 : faceRight + 40) : (tall ? panelX - 40 : faceLeft - 40) - M;
  const boxW = Math.round(Math.max(W * 0.4, Math.min(W * (tall ? 0.6 : 0.56), free)));
  const boxH = H - M * 2 - 40;
  const { ref, size } = useFit(`${t}|${a}|${style.hookFont}`, boxW, boxH);

  const hook = fontFamily(style.hookFont);
  const darkText = isDark(style.hookColor);
  const sc = darkText ? '245,239,230' : '12,10,8';
  const dir = textSide === 'left' ? 'to right' : 'to left';

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0c0b', overflow: 'hidden' }}>
      {aspect === null ? null : tall ? (
        <>
          <Img
            src={frame}
            style={{
              position: 'absolute',
              inset: -60,
              width: W + 120,
              height: H + 120,
              objectFit: 'cover',
              filter: `blur(38px) brightness(0.62) saturate(0.9) ${filter ?? ''}`.trim(),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: panelX,
              top: 0,
              width: panelW,
              height: H,
              boxShadow: `0 0 0 3px ${CREAM}, 0 30px 80px rgba(0,0,0,0.5)`,
            }}
          >
            <Img src={frame} style={{ width: '100%', height: '100%', objectFit: 'cover', filter }} />
          </div>
        </>
      ) : (
        <Img src={frame} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter }} />
      )}
      {hasText ? (
        <>
          <AbsoluteFill
            style={{
              background: `linear-gradient(${dir}, rgba(${sc},${tall ? 0.55 : 0.78}) 0%, rgba(${sc},${tall ? 0.35 : 0.55}) ${tall ? 40 : 38}%, rgba(${sc},0) ${tall ? 62 : 68}%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              [textSide]: M,
              top: M,
              bottom: M,
              width: boxW,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: textSide === 'left' ? 'flex-start' : 'flex-end',
            }}
          >
            <div style={{ width: 70, height: 4, background: style.accentColor, marginBottom: size * 0.28 }} />
            <div
              ref={ref}
              style={{
                width: boxW,
                maxHeight: boxH,
                textAlign: textSide,
                fontFamily: hook,
                color: style.hookColor,
                textShadow: darkText ? '0 2px 18px rgba(255,250,240,0.45)' : '0 4px 24px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.35)',
                overflowWrap: 'normal',
              }}
            >
              {t ? (
                <div style={{ fontSize: size, lineHeight: 0.98, fontWeight: boldWeight(style.hookFont), letterSpacing: '-0.025em', textWrap: 'balance' }}>
                  {t}
                </div>
              ) : null}
              {a ? (
                <div
                  style={{
                    fontSize: t ? size * 0.66 : size,
                    lineHeight: 1.05,
                    fontStyle: 'italic',
                    fontWeight: 400,
                    color: t ? style.accentColor : style.hookColor,
                    marginTop: t ? size * 0.12 : 0,
                    letterSpacing: '-0.01em',
                    textWrap: 'balance',
                  }}
                >
                  {a}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
