import { useEffect, useRef, useState, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Reel } from '../../src/remotion/Reel';
import { LongVideo } from '../../src/remotion/long/LongVideo';
import type { Edit, LongSettings, ReelProps } from '../../src/shared/types';
import { FPS, HEIGHT, WIDTH } from '../../src/shared/types';
import { outputFrames, totalFrames } from '../../src/shared/time';
import { defaultLong, formatTime, isLong, longSize, outputChapters } from '../../src/shared/long';
import { isStory } from '../../src/shared/story';
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
  // A long YouTube video: its own composition and size, no end card, chapter marks on the scrubber.
  const long = isLong(edit);
  const story = isStory(edit); // no face: no zoom jumps or glow above the head
  const size = long ? longSize(edit) : { width: WIDTH, height: HEIGHT, wide: false };
  const total = long ? outputFrames(edit.segments) : totalFrames(edit);
  const chapters = long ? outputChapters(edit) : [];
  const ls = { ...defaultLong(), ...(edit.long ?? {}) };
  const setLong = (patch: Partial<LongSettings>) => change((e) => ({ ...e, long: { ...defaultLong(), ...(e.long ?? {}), ...patch } }));
  const seek = (f: number) => {
    const c = Math.max(0, Math.min(total - 1, Math.round(f)));
    setFrame(c);
    playerRef.current?.seekTo(c);
  };
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
  const nowSec = frame / FPS;
  const nowChapter = [...chapters].reverse().find((c) => c.at <= nowSec + 0.01);
  const clock = long ? formatTime : (s: number) => fmtTime(s);

  return (
    <div className={`stage ${size.wide ? 'wide' : ''}`}>
      <div className="stage-frame">
        <Player
          ref={playerRef}
          component={long ? LongVideo : Reel}
          inputProps={props}
          durationInFrames={total}
          fps={FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
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
        {long && (
          <button className="icon-btn skip" onClick={() => seek(frame - 10 * FPS)} aria-label={t('skipBack')} title={t('skipBack')}>
            −10
          </button>
        )}
        <div className="scrub-wrap">
          <input
            className="scrubber"
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={Math.min(frame, total - 1)}
            style={{ ['--pct' as string]: `${pct}%` }}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={t('scrubber')}
          />
          {/* Chapter starts as small marks on the timeline; click one to jump there. */}
          {chapters.map((c) => (
            <button
              key={c.source}
              className={`chapter-mark ${nowChapter === c ? 'now' : ''}`}
              style={{ left: `${total > 1 ? Math.min(100, ((c.at * FPS) / (total - 1)) * 100) : 0}%` }}
              title={`${formatTime(c.at)} ${c.title}`}
              aria-label={`${formatTime(c.at)} ${c.title}`}
              onClick={() => seek(c.at * FPS)}
            />
          ))}
        </div>
        {long && (
          <button className="icon-btn skip" onClick={() => seek(frame + 10 * FPS)} aria-label={t('skipFwd')} title={t('skipFwd')}>
            +10
          </button>
        )}
        <span className="time">
          {clock(nowSec)} <span className="muted">/ {clock(total / FPS)}</span>
        </span>
      </div>
      {long && nowChapter && (
        <p className="now-chapter">
          <span className="muted">{t('nowChapter')}:</span> {nowChapter.title}
        </p>
      )}

      <p className="keys-hint">{t('spaceHint')}</p>
      <div className="toggles-head">{long ? t('inThisVideo') : t('inThisReel')}</div>
      {long ? (
        <div className="toggles">
          <Toggle on={musicOn} label={t('togMusic')} set={toggleMusic} />
          <Toggle on={ls.zoomJumps} label={t('togZoom')} set={(v) => setLong({ zoomJumps: v })} />
          <Toggle on={ls.chapterCards} label={t('togChapterCards')} set={(v) => setLong({ chapterCards: v })} />
          <Toggle on={ls.subtitles} label={t('togSubs')} set={(v) => setLong({ subtitles: v })} />
        </div>
      ) : (
        <div className="toggles">
          <Toggle on={edit.sound.effects} label={t('togSfx')} set={(v) => change((e) => ({ ...e, sound: { ...e.sound, effects: v } }))} />
          <Toggle on={musicOn} label={t('togMusic')} set={toggleMusic} />
          {!story && <Toggle on={edit.toggles.zoomJumps} label={t('togZoom')} set={(v) => change((e) => ({ ...e, toggles: { ...e.toggles, zoomJumps: v } }))} />}
          {!story && <Toggle on={edit.toggles.glowAboveHead} label={t('togGlow')} set={(v) => change((e) => ({ ...e, toggles: { ...e.toggles, glowAboveHead: v } }))} />}
        </div>
      )}
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
