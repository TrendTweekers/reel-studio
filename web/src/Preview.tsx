import { useEffect, useRef, useState, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Reel } from '../../src/remotion/Reel';
import type { Edit, ReelProps } from '../../src/shared/types';
import { FPS, HEIGHT, WIDTH } from '../../src/shared/types';
import { totalFrames } from '../../src/shared/time';
import type { FileItem } from './api';
import type { Change } from './Editor';
import { useT } from './i18n';
import { fmtTime } from './ui';

export function Preview({
  playerRef,
  props,
  edit,
  change,
  music,
  onFrame,
  onNeedMusic,
}: {
  playerRef: RefObject<PlayerRef | null>;
  props: ReelProps;
  edit: Edit;
  change: Change;
  music: FileItem[];
  onFrame: (f: number) => void;
  onNeedMusic: () => void;
}) {
  const { t } = useT();
  const total = totalFrames(edit);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastMusic = useRef<string | null>(edit.sound.music);
  if (edit.sound.music) lastMusic.current = edit.sound.music;
  const lastSent = useRef(0);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onUpdate = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      const now = performance.now();
      if (now - lastSent.current > 180) {
        lastSent.current = now;
        onFrame(e.detail.frame);
      }
    };
    const onSeek = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      onFrame(e.detail.frame);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('frameupdate', onUpdate);
    p.addEventListener('seeked', onSeek);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    p.addEventListener('ended', onPause);
    return () => {
      p.removeEventListener('frameupdate', onUpdate);
      p.removeEventListener('seeked', onSeek);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
      p.removeEventListener('ended', onPause);
    };
  }, [playerRef, onFrame]);

  const musicOn = !!edit.sound.music;
  const toggleMusic = (on: boolean) => {
    if (on && !lastMusic.current && !music.length) {
      onNeedMusic();
      return;
    }
    change((e) => ({ ...e, sound: { ...e.sound, music: on ? (lastMusic.current ?? music[0]?.file ?? null) : null } }));
  };

  const pct = total > 1 ? (frame / (total - 1)) * 100 : 0;

  return (
    <div className="stage">
      <div className="stage-frame">
        <Player
          ref={playerRef}
          component={Reel}
          inputProps={props}
          durationInFrames={total}
          fps={FPS}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          controls={false}
          clickToPlay
          doubleClickToFullscreen
          acknowledgeRemotionLicense
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div className="transport">
        <button className="play-btn" onClick={() => playerRef.current?.toggle()} aria-label={playing ? t('pause') : t('play')}>
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
            </svg>
          )}
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={Math.min(frame, total - 1)}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => {
            const f = Number(e.target.value);
            setFrame(f);
            playerRef.current?.seekTo(f);
          }}
          aria-label={t('scrubber')}
        />
        <span className="time">
          {fmtTime(frame / FPS)} <span className="muted">/ {fmtTime(total / FPS)}</span>
        </span>
      </div>

      <p className="keys-hint">{t('spaceHint')}</p>
      <div className="toggles">
        <Toggle on={edit.sound.effects} label={t('togSfx')} set={(v) => change((e) => ({ ...e, sound: { ...e.sound, effects: v } }))} />
        <Toggle on={musicOn} label={t('togMusic')} set={toggleMusic} />
        <Toggle on={edit.toggles.zoomJumps} label={t('togZoom')} set={(v) => change((e) => ({ ...e, toggles: { ...e.toggles, zoomJumps: v } }))} />
        <Toggle on={edit.toggles.glowAboveHead} label={t('togGlow')} set={(v) => change((e) => ({ ...e, toggles: { ...e.toggles, glowAboveHead: v } }))} />
      </div>
    </div>
  );
}

function Toggle({ on, label, set }: { on: boolean; label: string; set: (v: boolean) => void }) {
  return (
    <label className={`toggle ${on ? 'on' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="box" aria-hidden>
        {on ? '✓' : ''}
      </span>
      {label}
    </label>
  );
}
