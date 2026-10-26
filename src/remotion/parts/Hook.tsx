// The opening title: a big serif line, an italic accent line, a small bracketed sub line.
// It is fully set on frame 0 (Instagram's default cover), then only settles a few pixels,
// holds, and dissolves at hook.until. Lines and position come from the model.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame } from 'remotion';
import { FPS, WIDTH } from '../../shared/types';
import { useReel } from '../context';
import { CLAMP } from '../effects/anim';
import { Scrim, shadowFor } from '../legibility';

const Line: React.FC<{ text: string; index: number; italic?: boolean; size: number }> = ({ text, index, italic, size }) => {
  const frame = useCurrentFrame();
  const t = spring({ frame: frame - index * 2, fps: FPS, config: { damping: 200 }, durationInFrames: 18 });
  return (
    <div
      style={{
        fontSize: size,
        lineHeight: 1.04,
        fontStyle: italic ? 'italic' : 'normal',
        letterSpacing: '-0.02em',
        transform: `translateY(${(1 - t) * 8}px)`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

const HookInner: React.FC<{ frames: number }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { props, model, hookFont } = useReel();
  const layout = model.hook!;
  const { hookColor } = props.edit.style;
  const glow = props.edit.toggles.glowAboveHead && layout.where === 'above';
  const out = interpolate(frame, [frames - 12, frames], [1, 0], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const subT = spring({ frame: frame - 4, fps: FPS, config: { damping: 200 }, durationInFrames: 18 });
  const size = layout.size;
  const shadow = shadowFor(hookColor);

  return (
    <AbsoluteFill style={{ opacity: out, transform: `translateY(${(1 - out) * -10}px)` }}>
      {glow ? (
        <div
          style={{
            position: 'absolute',
            left: WIDTH / 2 - 560,
            top: layout.top + layout.height / 2 - 380,
            width: 1120,
            height: 760,
            opacity: 0.7,
            background:
              'radial-gradient(ellipse 50% 46% at 50% 50%, rgba(255,232,200,0.5) 0%, rgba(255,214,170,0.22) 40%, rgba(255,200,150,0) 75%)',
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
      <Scrim rect={{ ...layout.rect, x: layout.rect.x + 60, w: layout.rect.w - 120 }} textColor={hookColor} spreadX={150} spreadY={110} />
      <div
        style={{
          position: 'absolute',
          top: layout.top,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: hookColor,
          fontFamily: hookFont,
          fontWeight: 400,
          textShadow: shadow,
        }}
      >
        {layout.lines.map((l, i) => (
          <Line key={`m${i}`} text={l} index={i} size={size} />
        ))}
        {layout.accentLines.map((l, i) => (
          <Line key={`a${i}`} text={l} index={layout.lines.length + i} italic size={Math.round(size * 1.06)} />
        ))}
        {layout.sub ? (
          <div
            style={{
              marginTop: Math.round(size * 0.2),
              fontSize: Math.max(30, Math.round(size * 0.34)),
              fontStyle: 'italic',
              letterSpacing: '0.04em',
              opacity: 0.75 + 0.2 * subT,
            }}
          >
            {layout.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Hook: React.FC = () => {
  const { props, model } = useReel();
  if (!props.edit.hook || !model.hook || model.hookFrames <= 0) return null;
  return (
    <Sequence name="Hook" from={0} durationInFrames={model.hookFrames}>
      <HookInner frames={model.hookFrames} />
    </Sequence>
  );
};
