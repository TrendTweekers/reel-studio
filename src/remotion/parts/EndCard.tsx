// The closing card that sells the ebook: her last frame held, blurred and dimmed; the ebook cover
// as a tilted book; "Napisz w komentarzu" / KEYWORD / sub; the user's @handle at the bottom.
// Plays AFTER the last kept segment (model.total .. model.compFrames). Music fades under it (Sound).
import React, { useState } from 'react';
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types';
import { CREAM, isDark } from '../color';
import { useReel } from '../context';
import { CLAMP } from '../effects/anim';
import { boldWeight } from '../fonts';
import { shadowFor } from '../legibility';
import { CAPTION_CX, SAFE, SAFE_BOTTOM } from '../model';

export const END_CARD_KEYWORD_AT = 12; // frame (inside the card) where the keyword lands: the ding
// The handle at the bottom comes from the brand settings (empty = no handle line).

const COL_W = 820; // text column, clear of the right-hand button column
const BOOK = { w: 400, h: 540 };

const Book: React.FC<{ src: string; top: number; onFail: () => void }> = ({ src, top, onFail }) => {
  const frame = useCurrentFrame();
  const t = spring({ frame: frame - 3, fps: FPS, config: { damping: 15, stiffness: 120, mass: 0.8 } });
  const float = Math.sin(frame / 20) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: CAPTION_CX - BOOK.w / 2,
        top: top + float,
        width: BOOK.w,
        height: BOOK.h,
        opacity: Math.min(1, t * 1.6),
        transform: `translateY(${(1 - t) * 90}px) rotate(${-4 + (1 - t) * -6}deg) scale(${interpolate(t, [0, 1], [0.92, 1])})`,
        transformOrigin: '50% 80%',
        borderRadius: '4px 10px 10px 4px',
        overflow: 'hidden',
        boxShadow: '0 40px 70px rgba(0,0,0,0.45), 0 10px 22px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
        background: CREAM,
      }}
    >
      <Img src={src} onError={onFail} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {/* spine and page sheen, so it reads as a book, not a photo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(255,255,255,0.22) 2.5%, rgba(0,0,0,0.10) 5%, rgba(0,0,0,0) 9%), linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)',
        }}
      />
    </div>
  );
};

const CardInner: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { props, model, hookFont, subFont } = useReel();
  const card = props.edit.endCard!;
  const { hookColor, accentColor, hookFont: hookFontName } = props.edit.style;
  const [bookFailed, setBookFailed] = useState(false);
  const hasBook = Boolean(card.image) && !bookFailed;

  // Background: her last frame, frozen, pushing in slowly while it blurs and dims.
  const last = model.segs[model.segs.length - 1];
  const lastFrame = last ? last.startFrom + last.durationInFrames - 1 : 0;
  const bgT = interpolate(frame, [0, 14], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const push = interpolate(frame, [0, frames], [1, 1.08], CLAMP);

  const textColor = isDark(hookColor) ? CREAM : hookColor;
  const keyColor = !isDark(accentColor) && accentColor.toLowerCase() !== '#ffffff' ? accentColor : textColor;
  const keyword = card.keyword.trim().toUpperCase();
  const letters = Array.from(keyword);
  const keySize = Math.round(Math.max(96, Math.min(190, COL_W / (Math.max(3, letters.length) * 0.78))));

  // Vertical rhythm: book, then line / KEYWORD / sub as one block, handle at the bottom.
  const blockH = 52 + 18 + keySize + 20 + (card.sub ? 48 : 0);
  const bookTop = SAFE.top + 70;
  const blockTop = hasBook ? bookTop + BOOK.h + 70 : (SAFE.top + SAFE_BOTTOM) / 2 - blockH / 2 - 40;
  const lineT = spring({ frame: frame - 6, fps: FPS, config: { damping: 200 }, durationInFrames: 16 });
  const subT = spring({ frame: frame - 22, fps: FPS, config: { damping: 200 }, durationInFrames: 16 });
  const handleT = spring({ frame: frame - 28, fps: FPS, config: { damping: 200 }, durationInFrames: 16 });
  const shadow = shadowFor(textColor);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0c0b' }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, filter: `blur(${bgT * 16}px)` }}>
        <Freeze frame={0}>
          <OffthreadVideo src={props.urls.video} trimBefore={lastFrame} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Freeze>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(12,10,8,${0.5 * bgT})` }} />
      <AbsoluteFill
        style={{
          opacity: bgT,
          background: 'radial-gradient(ellipse 70% 55% at 50% 52%, rgba(12,10,8,0) 40%, rgba(12,10,8,0.35) 100%)',
        }}
      />
      <AbsoluteFill>
        {hasBook ? <Book src={props.urls.board + card.image} top={bookTop} onFail={() => setBookFailed(true)} /> : null}
        <div
          style={{
            position: 'absolute',
            top: blockTop,
            left: CAPTION_CX - COL_W / 2,
            width: COL_W,
            textAlign: 'center',
            color: textColor,
            textShadow: shadow,
          }}
        >
          <div
            style={{
              fontFamily: hookFont,
              fontStyle: 'italic',
              fontSize: 50,
              lineHeight: '52px',
              letterSpacing: '0.01em',
              opacity: lineT * 0.95,
              transform: `translateY(${(1 - lineT) * 12}px)`,
            }}
          >
            {card.line}
          </div>
          <div
            style={{
              marginTop: 18,
              fontFamily: hookFont,
              fontWeight: boldWeight(hookFontName) === 700 ? 500 : 400,
              fontSize: keySize,
              lineHeight: `${keySize}px`,
              color: keyColor,
              whiteSpace: 'nowrap',
            }}
          >
            {letters.map((ch, i) => {
              const t = spring({ frame: frame - (END_CARD_KEYWORD_AT - 6) - i * 2, fps: FPS, config: { damping: 200 }, durationInFrames: 18 });
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'pre',
                    opacity: t,
                    // letters settle from wide, soft and slightly low into tight tracking
                    margin: `0 ${0.04 + (1 - t) * 0.12}em`,
                    transform: `translateY(${(1 - t) * 18}px)`,
                    filter: t < 0.999 ? `blur(${(1 - t) * 8}px)` : undefined,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
          {card.sub ? (
            <div
              style={{
                marginTop: 20,
                fontFamily: subFont,
                fontSize: 38,
                fontWeight: 500,
                letterSpacing: '0.01em',
                opacity: subT * 0.9,
                transform: `translateY(${(1 - subT) * 10}px)`,
              }}
            >
              {card.sub}
            </div>
          ) : null}
        </div>
        <div
          style={{
            position: 'absolute',
            top: SAFE_BOTTOM - 70,
            left: CAPTION_CX - COL_W / 2,
            width: COL_W,
            textAlign: 'center',
            fontFamily: hookFont,
            fontStyle: 'italic',
            fontSize: 30,
            letterSpacing: '0.08em',
            color: textColor,
            opacity: handleT * 0.8,
            textShadow: shadow,
          }}
        >
          {props.brand?.handle ? `@${props.brand.handle}` : ''}
        </div>
        {/* a hairline under the keyword block, drawn out */}
        <div
          style={{
            position: 'absolute',
            top: blockTop + blockH + 26,
            left: CAPTION_CX - 70 * subT,
            width: 140 * subT,
            height: 1.5,
            background: textColor,
            opacity: 0.6,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC = () => {
  const { props, model } = useReel();
  if (!props.edit.endCard?.enabled || model.cardFrames <= 0) return null;
  return (
    <Sequence name="End card" from={model.total} durationInFrames={model.cardFrames} premountFor={20}>
      <CardInner frames={model.cardFrames} />
    </Sequence>
  );
};

