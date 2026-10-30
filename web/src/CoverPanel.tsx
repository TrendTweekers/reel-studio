import { useEffect, useRef, useState } from 'react';
import type { Cover, Edit } from '../../src/shared/types';
import { api, mediaUrls, type CoversState, type Step } from './api';
import type { Change } from './Editor';
import { useT, type StrKey } from './i18n';
import { Chips, fmtTime, Group, Panel } from './ui';

const LAYOUTS: Cover['layout'][] = ['top', 'center', 'bottom', 'none'];

export function CoverPanel({
  slug,
  edit,
  change,
  step,
  bump,
  currentSource,
  story,
}: {
  slug: string;
  edit: Edit;
  change: Change;
  step: Step | undefined;
  bump: number;
  currentSource: () => number;
  story?: boolean; // a video from text: no face to find the best frames, she picks the moment
}) {
  const { t } = useT();
  const [st, setSt] = useState<CoversState | null>(null);
  const [finding, setFinding] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const cover = edit.cover;

  const load = async () => {
    try {
      const s = await api.covers(slug);
      setSt(s);
      return s;
    } catch {
      return null;
    }
  };

  // Load now, and again when the "find frames" step ends.
  useEffect(() => {
    void load();
    if (step !== 'covers') setFinding(false);
  }, [slug, step, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while a cover render runs.
  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(async () => {
      const s = await load();
      if (s && !s.rendering) {
        setRendering(false);
        setStamp(Date.now());
        if (s.error) setErr(s.error);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [rendering]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (time: number) =>
    change((e) => ({
      ...e,
      cover: {
        t: Math.round(time * 100) / 100,
        layout: e.cover?.layout ?? 'top',
        title: e.cover?.title ?? e.hook?.text,
        accent: e.cover?.accent ?? e.hook?.accent,
      },
    }));
  const set = (patch: Partial<Cover>, key?: string) =>
    change((e) => ({ ...e, cover: { t: 0, layout: 'top', ...(e.cover ?? {}), ...patch } }), key ? `cover:${key}` : undefined);

  const find = async () => {
    setErr(null);
    setFinding(true);
    try {
      await api.findCovers(slug);
    } catch {
      setFinding(false);
      setErr(t('coverFailed'));
    }
  };

  const make = async () => {
    setErr(null);
    try {
      await api.renderCover(slug);
      setRendering(true);
    } catch {
      setErr(t('coverFailed'));
    }
  };

  const candidates = [...(st?.candidates ?? [])].sort((a, b) => b.score - a.score);
  const busyFinding = finding || step === 'covers';
  const frameImg = cover ? candidates.find((c) => Math.abs(c.t - cover.t) < 0.05)?.url : undefined;
  const bust = (u: string) => `${u}${u.includes('?') ? '&' : '?'}v=${stamp}`;

  return (
    <Panel id="cover" title={t('cover')} hint={story ? t('coverHintStory') : t('coverHint')}>
      {busyFinding ? (
        <div className="cover-finding">
          <span className="spinner" aria-hidden />
          {t('step_covers')}…
        </div>
      ) : candidates.length ? (
        <Group label={t('coverCandidates')}>
          <div className="cover-cands">
            {candidates.map((c, i) => (
              <button key={c.file} className={`cover-cand ${cover && Math.abs(cover.t - c.t) < 0.05 ? 'on' : ''}`} onClick={() => pick(c.t)}>
                <img src={c.url} alt="" loading="lazy" />
                {i === 0 && <span className="used-tag">{t('coverBest')}</span>}
                <span className="cand-time">{fmtTime(c.t, 1)}</span>
              </button>
            ))}
          </div>
        </Group>
      ) : null}

      <div className="row gap cover-actions">
        {!story && (
          <button className="btn" onClick={find} disabled={busyFinding}>
            ✦ {candidates.length ? t('coverFindAgain') : t('coverFind')}
          </button>
        )}
        <button className="btn" onClick={() => pick(currentSource())}>
          ◎ {t('coverUseCurrent')}
        </button>
      </div>

      {cover && (
        <div className="cover-edit">
          <CoverPreview slug={slug} cover={cover} style={edit.style} img={frameImg} />
          <div className="cover-fields">
            <label className="field">
              <span>{t('coverTitle')}</span>
              <input className="big-input" value={cover.title ?? ''} onChange={(e) => set({ title: e.target.value || undefined }, 'title')} />
            </label>
            <label className="field">
              <span>{t('hookAccent')}</span>
              <input className="big-input italic" value={cover.accent ?? ''} onChange={(e) => set({ accent: e.target.value || undefined }, 'accent')} />
            </label>
            <Group label={t('coverLayout')}>
              <Chips value={cover.layout} options={LAYOUTS.map((l) => ({ value: l, label: t(`coverLayout_${l}` as StrKey) }))} onChange={(v) => set({ layout: v })} />
            </Group>
            <p className="muted small">
              {t('coverFrameAt')} {fmtTime(cover.t, 1)} · {t('coverGuide')}
            </p>
            <button className="btn primary huge" onClick={make} disabled={rendering}>
              {rendering ? t('coverMaking') : t('coverMake')}
            </button>
          </div>
        </div>
      )}

      {err && <p className="error-text">{err}</p>}

      {!rendering && (st?.story || st?.grid) && (
        <Group label={t('coverResults')}>
          <div className="cover-results">
            {st?.story && (
              <figure>
                <img className="r916" src={bust(st.story)} alt="" />
                <figcaption>
                  <span>9:16 · Reel</span>
                  <a href={st.story} download>
                    ↓ {t('download')}
                  </a>
                </figcaption>
              </figure>
            )}
            {st?.grid && (
              <figure>
                <img className="r34" src={bust(st.grid)} alt="" />
                <figcaption>
                  <span>3:4 · {t('coverGrid')}</span>
                  <a href={st.grid} download>
                    ↓ {t('download')}
                  </a>
                </figcaption>
              </figure>
            )}
          </div>
        </Group>
      )}
    </Panel>
  );
}

// CSS approximation of the cover still: frame + title in the hook font, with the 3:4 grid guide.
function CoverPreview({ slug, cover, style, img }: { slug: string; cover: Cover; style: Edit['style']; img?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const seek = () => {
      try {
        v.currentTime = cover.t;
      } catch {
        /* ignore */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
  }, [cover.t, img]);
  return (
    <div className="cover-preview">
      {img ? <img src={img} alt="" /> : <video ref={video} src={mediaUrls(slug).video} muted playsInline preload="auto" />}
      <div className="grid-guide" aria-hidden />
      {cover.layout !== 'none' && (cover.title || cover.accent) && (
        <div className={`cover-title at-${cover.layout}`} style={{ fontFamily: `'${style.hookFont}', serif`, color: style.hookColor }}>
          {cover.title && <div className="ct-main">{cover.title}</div>}
          {cover.accent && <div className="ct-accent">{cover.accent}</div>}
        </div>
      )}
    </div>
  );
}
