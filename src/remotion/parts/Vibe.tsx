// Looks: film grain + warm grade, glow haze, editorial frame, progress bar.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { HEIGHT, WIDTH } from '../../shared/types';
import { CREAM } from '../color';
import { useReel } from '../context';

// CSS filter for the footage layers (video + cutout get the same grade).
export const footageFilter = (vibe: string): string | undefined => {
  if (vibe === 'film') return 'sepia(0.1) contrast(1.04) saturate(0.94) brightness(1.01)';
  if (vibe === 'glow') return 'brightness(1.03) contrast(0.97) saturate(1.05)';
  if (vibe === 'editorial') return 'contrast(1.03) saturate(0.92)';
  return undefined;
};

// Over the footage, under the graphics.
export const Grade: React.FC = () => {
  const { props } = useReel();
  const vibe = props.edit.style.vibe;
  if (vibe === 'film') {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill style={{ background: 'rgba(255,170,110,0.10)', mixBlendMode: 'soft-light' }} />
        <AbsoluteFill
          style={{ background: 'radial-gradient(ellipse 75% 65% at 50% 45%, rgba(0,0,0,0) 55%, rgba(20,10,0,0.32) 100%)' }}
        />
      </AbsoluteFill>
    );
  }
  if (vibe === 'glow') {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse 80% 45% at 50% 18%, rgba(255,236,214,0.34) 0%, rgba(255,236,214,0.10) 50%, rgba(255,236,214,0) 75%)',
            mixBlendMode: 'screen',
          }}
        />
        <AbsoluteFill style={{ background: 'rgba(255,244,232,0.035)', mixBlendMode: 'screen' }} />
      </AbsoluteFill>
    );
  }
  return null;
};

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  // Rendered at half size and scaled up: coarser, filmic grain and half the work.
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.16, mixBlendMode: 'overlay' }}>
      <svg width={WIDTH / 2} height={HEIGHT / 2} style={{ width: WIDTH, height: HEIGHT }} viewBox={`0 0 ${WIDTH / 2} ${HEIGHT / 2}`}>
        <filter id={`grain-${frame}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={(frame % 997) + 1} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${frame})`} />
      </svg>
    </AbsoluteFill>
  );
};

const EditorialFrame: React.FC = () => {
  const { props, hookFont } = useReel();
  const inset = 34;
  const corner: React.CSSProperties = {
    position: 'absolute',
    fontFamily: hookFont,
    fontStyle: 'italic',
    fontSize: 27,
    letterSpacing: '0.06em',
    color: CREAM,
    background: 'transparent',
    padding: '0 12px',
    textShadow: '0 1px 6px rgba(0,0,0,0.35)',
    lineHeight: '24px',
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset,
          border: `1.5px solid ${CREAM}`,
          opacity: 0.85,
          boxShadow: '0 0 8px rgba(0,0,0,0.15)',
        }}
      />
      <div style={{ ...corner, top: 232, left: 64 }}>{props.edit.title}</div>
      <div style={{ ...corner, top: 1500, left: 64 }}>№ 01</div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { props, model } = useReel();
  const p = Math.min(1, (frame + 1) / model.total);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 222, left: 60, width: WIDTH - 120, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }} />
      <div style={{ position: 'absolute', top: 222, left: 60, width: (WIDTH - 120) * p, height: 4, borderRadius: 2, background: props.edit.style.accentColor }} />
    </AbsoluteFill>
  );
};

// On top of everything.
export const Finish: React.FC = () => {
  const { props } = useReel();
  const { vibe } = props.edit.style;
  const { grain, progressBar } = props.edit.toggles;
  return (
    <>
      {vibe === 'editorial' ? <EditorialFrame /> : null}
      {vibe === 'film' || grain ? <Grain /> : null}
      {progressBar ? <ProgressBar /> : null}
    </>
  );
};
