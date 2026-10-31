import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StorySettings } from '../../src/shared/types';
import { api, HttpError, postForm, ServerDownError, type FileItem, type StoryMode, type StorySeconds, type VoiceState } from './api';
import { errText, fmt, num, useT, type StrKey } from './i18n';
import { go, TopRight } from './App';
import { PictureGrid } from './PictureGrid';
import { Chips, fmtTime } from './ui';

// "Film z tekstu": a video with no camera. Topic -> Claude writes a script -> she edits it -> a voice
// (her recording, an audio file, or the computer voice) -> the server makes the video.
// mode 'product': instead of a topic she describes her app, website or product and picks screenshots;
// Claude then writes about the product and plans product scenes (screen, click, type, logos, price).

type Stage = 1 | 2 | 3;
type VoiceMode = 'record' | 'upload' | 'ai';
type Background = StorySettings['background'];
type Draft = {
  stage: Stage;
  topic: string;
  seconds: StorySeconds;
  language: 'pl' | 'en';
  title: string;
  script: string;
  background: Background;
  mode: VoiceMode | null;
  product?: { name: string; what: string; audience: string; screenshots: string[] };
};

// One draft per kind, so a product video in progress never mixes with a creator one.
const draftKey = (m: StoryMode) => (m === 'product' ? 'reel-studio-story-draft-product' : 'reel-studio-story-draft');
const WORDS_PER_SECOND = 2.4;
export const AUDIO_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.caf,.ogg,.webm';

const readDraft = (m: StoryMode): Partial<Draft> => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(m)) || '{}') as Partial<Draft>;
  } catch {
    return {};
  }
};
const writeDraft = (m: StoryMode, d: Draft) => {
  try {
    localStorage.setItem(draftKey(m), JSON.stringify(d));
  } catch {
    /* private window */
  }
};
const clearDraft = (m: StoryMode) => {
  try {
    localStorage.removeItem(draftKey(m));
  } catch {
    /* ignore */
  }
};

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
// The first sentence, for the voice preview (never very long).
const firstSentence = (s: string) => {
  const one = s.trim().split(/(?<=[.!?…])\s+/)[0] ?? '';
  return one.length > 220 ? `${one.slice(0, 217).replace(/\s+\S*$/, '')}…` : one;
};

export function StoryNew({ mode: kind = 'creator' }: { mode?: StoryMode }) {
  const { t, lang } = useT();
  const product = kind === 'product';
  const d0 = useMemo(() => readDraft(kind), [kind]);
  const [stage, setStage] = useState<Stage>(d0.stage && d0.script ? d0.stage : 1);
  const [topic, setTopic] = useState(d0.topic ?? '');
  const [seconds, setSeconds] = useState<StorySeconds>(d0.seconds ?? 45);
  const [language, setLanguage] = useState<'pl' | 'en'>(d0.language ?? lang);
  const [title, setTitle] = useState(d0.title ?? '');
  const [script, setScript] = useState(d0.script ?? '');
  const [background, setBackground] = useState<Background>(d0.background ?? 'cream');
  const [mode, setMode] = useState<VoiceMode | null>(d0.mode ?? null);
  // What Claude wrote last, to ask before throwing her own changes away.
  const written = useRef(d0.script ?? '');
  const [writing, setWriting] = useState<number | null>(null); // since (ms) while Claude writes
  const [writeErr, setWriteErr] = useState<string | null>(null);
  const [accent, setAccent] = useState('#7b2d3b');
  // The voice she gives: her recording or a file.
  const [ownAudio, setOwnAudio] = useState<{ file: File; url: string; from: 'record' | 'upload' } | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // Product mode: what the product is, and the screenshots the scenes show.
  const [pName, setPName] = useState(d0.product?.name ?? '');
  const [pWhat, setPWhat] = useState(d0.product?.what ?? '');
  const [pAudience, setPAudience] = useState(d0.product?.audience ?? '');
  const [shots, setShots] = useState<string[]>(d0.product?.screenshots ?? []);
  const [board, setBoard] = useState<FileItem[]>([]);
  useEffect(() => {
    if (product) api.board().then(setBoard, () => {});
  }, [product]);

  useEffect(() => {
    writeDraft(kind, { stage, topic, seconds, language, title, script, background, mode, ...(product ? { product: { name: pName, what: pWhat, audience: pAudience, screenshots: shots } } : {}) });
  }, [kind, product, stage, topic, seconds, language, title, script, background, mode, pName, pWhat, pAudience, shots]);

  useEffect(() => {
    api
      .styles()
      .then((r) => {
        const s = r.styles.find((x) => x.id === r.defaultStyle) ?? r.styles[0];
        if (s?.style.accentColor) setAccent(s.style.accentColor);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (writing === null) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [writing]);

  useEffect(
    () => () => {
      if (ownAudio) URL.revokeObjectURL(ownAudio.url);
    },
    [ownAudio],
  );

  const why = useCallback(
    (e: unknown, fallback: StrKey) => {
      if (e instanceof ServerDownError) return t('serverDown');
      if (e instanceof HttpError) {
        if (e.status === 404) return t('storyNeedsRestart');
        return errText(t, e.body?.code as string | undefined, e.body?.error as string | undefined) || t(fallback);
      }
      const x = e as { code?: string; serverText?: string; status?: number };
      if (x?.status === 404) return t('storyNeedsRestart');
      return errText(t, x?.code, x?.serverText) || t(fallback);
    },
    [t],
  );

  // Screenshots that are still on the board (she may have deleted one since).
  const liveShots = board.length ? shots.filter((f) => board.some((b) => b.file === f)) : shots;
  const canWrite = product ? !!pName.trim() && !!pWhat.trim() : !!topic.trim();
  const write = async () => {
    if (!canWrite || writing !== null) return;
    if (script.trim() && script !== written.current && !confirm(t('storyRewriteQ'))) return;
    setWriteErr(null);
    setWriting(Date.now());
    try {
      // The server always wants a topic; for a product it is the product in one line.
      const r = product
        ? await api.storyScript(`${pName.trim()}: ${pWhat.trim()}`, language, seconds, 'product', {
            name: pName.trim(),
            what: pWhat.trim(),
            audience: pAudience.trim(),
            screenshots: liveShots,
          })
        : await api.storyScript(topic.trim(), language, seconds);
      setScript(r.script ?? '');
      written.current = r.script ?? '';
      if (r.title) setTitle(r.title);
      setStage(2);
    } catch (e) {
      setWriteErr(why(e, 'storyWriteFailed'));
    } finally {
      setWriting(null);
    }
  };

  // ---------- computer voice ----------
  const loadVoice = useCallback(async () => {
    try {
      const v = await api.voiceState();
      setVoice(v);
      setVoiceErr(null);
      return v;
    } catch (e) {
      setVoiceErr(why(e, 'voiceFailed'));
      return null;
    }
  }, [why]);
  useEffect(() => {
    if (stage === 3) void loadVoice();
  }, [stage, loadVoice]);
  useEffect(() => {
    if (!voice?.installing) return;
    const id = setInterval(() => void loadVoice(), 1500);
    return () => clearInterval(id);
  }, [voice?.installing, loadVoice]);

  const words = countWords(script);
  const estSec = Math.round(words / WORDS_PER_SECOND);
  const lengthNote = !words ? '' : estSec > seconds * 1.25 ? fmt(t('storyTooLong'), { s: seconds }) : estSec < seconds * 0.6 ? t('storyShort') : '';

  // Her recording or file, only for the choice she has open now.
  const own = ownAudio && ((mode === 'record' && ownAudio.from === 'record') || (mode === 'upload' && ownAudio.from === 'upload')) ? ownAudio : null;
  const canMake = !!script.trim() && (mode === 'ai' ? !!voice?.ready : !!own) && sending === null;

  const make = async () => {
    if (!canMake || !mode) return;
    setSendErr(null);
    setSending(0);
    const fd = new FormData();
    const finalTitle = title.trim() || script.trim().split(/\s+/).slice(0, 6).join(' ');
    fd.append('title', finalTitle);
    fd.append('script', script.trim());
    fd.append('language', language);
    fd.append('voice', mode === 'ai' ? 'ai' : 'own');
    fd.append('background', background);
    fd.append('mode', kind);
    if (mode !== 'ai' && own) fd.append('audio', own.file, own.file.name);
    try {
      const r = await postForm<{ slug: string }>('/api/projects/story', fd, (p) => setSending(p)).promise;
      if (!r.slug) throw new Error('no slug');
      clearDraft(kind);
      go(`/p/${encodeURIComponent(r.slug)}`);
    } catch (e) {
      setSendErr(why(e, 'storyMakeFailed'));
      setSending(null);
    }
  };

  const steps: [Stage, StrKey][] = [
    [1, 'storyStep1'],
    [2, 'storyStep2'],
    [3, 'storyStep3'],
  ];
  const elapsed = writing ? Math.floor((Date.now() - writing) / 1000) : 0;
  const swatches: { v: Background; color: string; label: StrKey }[] = [
    { v: 'cream', color: '#f6f1ea', label: 'bgCream' },
    { v: 'ink', color: '#1b1715', label: 'bgInk' },
    { v: 'accent', color: accent, label: 'bgAccent' },
  ];

  return (
    <div className="home story-new">
      <header className="topbar">
        <button className="back" onClick={() => go('/')}>
          ← {t('back')}
        </button>
        <div className="brand">
          <span className="brand-mark">K</span>
          <span className="brand-name">Klipownia</span>
        </div>
        <TopRight />
      </header>

      <main className="story-main">
        <h1 className="serif-title story-h1">{product ? t('productTitle') : t('fmtStory')}</h1>
        <p className="muted story-lead">{product ? t('productLead') : t('storyLead')}</p>

        <ol className="story-steps" aria-label={product ? t('productTitle') : t('fmtStory')}>
          {steps.map(([n, key]) => (
            <li key={n} className={stage === n ? 'now' : stage > n ? 'done' : ''}>
              <button disabled={n > stage || writing !== null || sending !== null} onClick={() => setStage(n)} aria-current={stage === n ? 'step' : undefined}>
                <span className="story-step-n">{stage > n ? '✓' : n}</span>
                {t(key)}
              </button>
            </li>
          ))}
        </ol>

        {stage === 1 && (
          <section className="story-card">
            {writing !== null ? (
              <div className="story-writing" role="status">
                <span className="spinner" aria-hidden />
                <div>
                  <h2 className="serif-title">{t('storyWriting')}</h2>
                  <p className="muted">{t('storyWritingNote')}</p>
                  <p className="muted small mono">{fmtTime(elapsed)}</p>
                </div>
              </div>
            ) : (
              <>
                {product ? (
                  <>
                    <label className="field">
                      <span className="story-label">{t('productNameQ')}</span>
                      <input className="big-input" value={pName} placeholder={t('productNamePh')} onChange={(e) => setPName(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="story-label">{t('productWhatQ')}</span>
                      <input type="text" value={pWhat} placeholder={t('productWhatPh')} onChange={(e) => setPWhat(e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="story-label">{t('productAudienceQ')}</span>
                      <input type="text" value={pAudience} placeholder={t('productAudiencePh')} onChange={(e) => setPAudience(e.target.value)} />
                    </label>
                    <div className="field">
                      <span className="story-label">{t('productShotsQ')}</span>
                      <p className={`muted small shots-why ${liveShots.length ? '' : 'warn'}`}>{t('productShotsWhy')}</p>
                      <PictureGrid
                        board={board}
                        setBoard={setBoard}
                        isOn={(f) => liveShots.includes(f)}
                        onPick={(f) => setShots((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f].slice(0, 8)))}
                      />
                      <p className="muted small">{liveShots.length ? fmt(t('productShotsPicked'), { n: liveShots.length }) : t('productShotsNone')}</p>
                    </div>
                  </>
                ) : (
                  <label className="field">
                    <span className="story-label">{t('storyTopicQ')}</span>
                    <textarea
                      className="story-topic"
                      rows={3}
                      value={topic}
                      placeholder={t('storyTopicPh')}
                      onChange={(e) => setTopic(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void write();
                      }}
                    />
                  </label>
                )}
                <div className="story-opts">
                  <div className="group">
                    <div className="group-label">{t('storyLength')}</div>
                    <Chips<string> value={String(seconds)} options={[30, 45, 60].map((s) => ({ value: String(s), label: `${s} s` }))} onChange={(v) => setSeconds(Number(v) as StorySeconds)} />
                  </div>
                  <div className="group">
                    <div className="group-label">{t('storyLanguage')}</div>
                    <Chips
                      value={language}
                      options={[
                        { value: 'pl', label: t('langPl') },
                        { value: 'en', label: t('langEn') },
                      ]}
                      onChange={setLanguage}
                    />
                  </div>
                </div>
                {writeErr && <p className="error-text">{writeErr}</p>}
                <div className="story-actions">
                  <button className="btn primary story-go" onClick={() => void write()} disabled={!canWrite}>
                    ✦ {t('storyWrite')}
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setWriteErr(null);
                      setStage(2);
                    }}
                  >
                    {script.trim() ? t('storyBackToText') : t('storyOwnText')}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {stage === 2 && (
          <section className="story-card">
            <label className="field">
              <span className="story-label">{t('storyTitle')}</span>
              <input className="big-input" value={title} placeholder={t('storyTitlePh')} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span className="story-label">{t('storyText')}</span>
              <textarea className="story-script" rows={12} value={script} placeholder={t('storyTextPh')} onChange={(e) => setScript(e.target.value)} />
            </label>
            <p className="story-count">
              {fmt(t('storyCount'), { n: words, s: num(estSec, lang, 0) })}
              {lengthNote && <span className="story-length-note"> · {lengthNote}</span>}
            </p>
            {writing !== null && (
              <div className="story-writing inline" role="status">
                <span className="spinner" aria-hidden />
                <span>
                  {t('storyWriting')} <span className="muted mono">{fmtTime(elapsed)}</span>
                </span>
              </div>
            )}
            {writeErr && <p className="error-text">{writeErr}</p>}

            <div className="group">
              <div className="group-label">{t('storyBackground')}</div>
              <div className="bg-swatches" role="radiogroup" aria-label={t('storyBackground')}>
                {swatches.map((s) => (
                  <button key={s.v} role="radio" aria-checked={background === s.v} className={`bg-swatch ${background === s.v ? 'on' : ''}`} onClick={() => setBackground(s.v)}>
                    <span className="bg-dot" style={{ background: s.color }} />
                    {t(s.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="story-actions">
              <button className="btn primary story-go" onClick={() => setStage(3)} disabled={!script.trim() || writing !== null}>
                {t('storyNextVoice')} →
              </button>
              {canWrite && (
                <button className="btn" onClick={() => void write()} disabled={writing !== null}>
                  ↻ {t('storyRewrite')}
                </button>
              )}
              <button className="link-btn" onClick={() => setStage(1)} disabled={writing !== null}>
                {product ? t('productChange') : t('storyChangeTopic')}
              </button>
            </div>
          </section>
        )}

        {stage === 3 && (
          <section className="story-card">
            <div className="group-label">{t('storyVoiceQ')}</div>
            <div className="voice-opts" role="radiogroup" aria-label={t('storyVoiceQ')}>
              {(['record', 'upload', 'ai'] as const).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={`voice-opt ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)} disabled={sending !== null}>
                  <VoiceIcon kind={m} />
                  <span className="voice-name">{t(`voice_${m}` as StrKey)}</span>
                  <span className="voice-sub">{t(`voiceSub_${m}` as StrKey)}</span>
                </button>
              ))}
            </div>

            {mode === 'record' && (
              <RecordOwn
                script={script}
                audio={ownAudio?.from === 'record' ? ownAudio : null}
                onAudio={(file) => setOwnAudio(file ? { file, url: URL.createObjectURL(file), from: 'record' } : null)}
              />
            )}
            {mode === 'upload' && (
              <UploadOwn audio={ownAudio?.from === 'upload' ? ownAudio : null} onAudio={(file) => setOwnAudio(file ? { file, url: URL.createObjectURL(file), from: 'upload' } : null)} />
            )}
            {mode === 'ai' && <VoiceLine voice={voice} voiceErr={voiceErr} reload={loadVoice} script={script} language={language} why={why} />}

            {sendErr && <p className="error-text">{sendErr}</p>}
            <div className="story-make">
              <button className="btn primary huge" onClick={() => void make()} disabled={!canMake}>
                {sending !== null ? `${t('storySending')} ${Math.round(sending * 100)}%` : t('storyMake')}
              </button>
              {!canMake && sending === null && <p className="muted small center">{mode ? t('storyMakeNeedVoice') : t('storyMakeNeedChoice')}</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function VoiceIcon({ kind }: { kind: VoiceMode }) {
  return (
    <span className="voice-icon" aria-hidden>
      {kind === 'record' ? (
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
        </svg>
      ) : kind === 'upload' ? (
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V6l10-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 9v6M8 6v12M12 3v18M16 7v10M20 10v4" />
        </svg>
      )}
    </span>
  );
}

// ---------- the recorder (her voice, and the 15 s sample) ----------

type RecState = 'idle' | 'asking' | 'recording';
type RecError = 'denied' | 'nomic' | 'unsupported' | 'failed';

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
};

export function useRecorder({ maxSeconds, name, onDone }: { maxSeconds?: number; name: string; onDone: (file: File, seconds: number) => void }) {
  const [state, setState] = useState<RecState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<RecError | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const started = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
  }, []);
  useEffect(
    () => () => {
      try {
        if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('unsupported');
      return;
    }
    setState('asking');
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const n = (e as DOMException)?.name;
      setError(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'nomic' : 'failed');
      setState('idle');
      return;
    }
    stream.current = s;
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      cleanup();
      setError('unsupported');
      setState('idle');
      return;
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    r.onstop = () => {
      const secs = (Date.now() - started.current) / 1000;
      cleanup();
      setState('idle');
      const type = r.mimeType || mime || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, { type });
      if (blob.size) onDoneRef.current(new File([blob], `${name}.${ext}`, { type }), secs);
      else setError('failed');
    };
    // A small level meter, so she sees the microphone hears her.
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        const secs = (Date.now() - started.current) / 1000;
        setSeconds(secs);
        if (maxSeconds && secs >= maxSeconds) stop();
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      /* no meter then */
    }
    rec.current = r;
    started.current = Date.now();
    setSeconds(0);
    r.start(250);
    setState('recording');
  }, [cleanup, maxSeconds, name, stop]);

  // Without the meter the timer still runs.
  useEffect(() => {
    if (state !== 'recording' || audioCtx.current) return;
    const id = setInterval(() => {
      const secs = (Date.now() - started.current) / 1000;
      setSeconds(secs);
      if (maxSeconds && secs >= maxSeconds) stop();
    }, 200);
    return () => clearInterval(id);
  }, [state, maxSeconds, stop]);

  return { state, seconds, level, error, start, stop };
}

export function RecErrorLine({ error }: { error: RecError | null }) {
  const { t } = useT();
  if (!error) return null;
  return <p className="error-text rec-error">{t(`recErr_${error}` as StrKey)}</p>;
}

export function LevelMeter({ level }: { level: number }) {
  return (
    <span className="rec-level" aria-hidden>
      {[0.08, 0.2, 0.35, 0.5, 0.7].map((th, i) => (
        <i key={i} className={level > th ? 'on' : ''} />
      ))}
    </span>
  );
}

function RecordOwn({ script, audio, onAudio }: { script: string; audio: { file: File; url: string } | null; onAudio: (f: File | null) => void }) {
  const { t, lang } = useT();
  const r = useRecorder({ name: 'moje-nagranie', onDone: (f) => onAudio(f) });
  const prompter = useRef<HTMLDivElement>(null);
  const [rolling, setRolling] = useState(false);
  const [speed, setSpeed] = useState(1);
  const pos = useRef(0);
  const recording = r.state === 'recording';

  // The teleprompter scrolls by itself while she records, at about her reading speed.
  useEffect(() => {
    const box = prompter.current;
    if (!box || !rolling) return;
    let last = performance.now();
    let id = 0;
    pos.current = box.scrollTop;
    const readSec = Math.max(8, countWords(script) / WORDS_PER_SECOND);
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const travel = box.scrollHeight - box.clientHeight;
      // She may scroll by hand: follow from where she left it.
      if (Math.abs(box.scrollTop - pos.current) > 2) pos.current = box.scrollTop;
      pos.current = Math.min(travel, pos.current + (travel / readSec) * speed * dt);
      box.scrollTop = pos.current;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [rolling, speed, script]);

  useEffect(() => {
    if (!recording) setRolling(false);
  }, [recording]);

  const startRec = async () => {
    if (prompter.current) prompter.current.scrollTop = 0;
    pos.current = 0;
    onAudio(null);
    await r.start();
  };
  useEffect(() => {
    // Start rolling a moment after the recording starts, so she can take a breath.
    if (!recording) return;
    const id = setTimeout(() => setRolling(true), 1500);
    return () => clearTimeout(id);
  }, [recording]);

  return (
    <div className="voice-panel">
      <p className="muted small">{t('recIntro')}</p>
      <div className={`teleprompter ${recording ? 'live' : ''}`} ref={prompter} tabIndex={0} aria-label={t('storyText')}>
        <div className="tp-pad" />
        {script.split(/\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="tp-pad end" />
      </div>
      <div className="tp-controls">
        <button className="btn small-btn" onClick={() => setRolling((v) => !v)} disabled={!recording && !script.trim()}>
          {rolling ? `❚❚ ${t('tpPause')}` : `▶ ${t('tpRoll')}`}
        </button>
        <span className="tp-speed">
          <button className="btn small-btn" onClick={() => setSpeed((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))} aria-label={t('tpSlower')}>
            −
          </button>
          <span className="muted small">
            {t('tpSpeed')} {num(Math.round(speed * 100), lang, 0)}%
          </span>
          <button className="btn small-btn" onClick={() => setSpeed((s) => Math.min(1.8, Math.round((s + 0.1) * 10) / 10))} aria-label={t('tpFaster')}>
            +
          </button>
        </span>
      </div>

      <div className="rec-row">
        {recording ? (
          <button className="btn rec-btn on" onClick={r.stop}>
            <span className="rec-dot" aria-hidden /> {t('recStop')}
          </button>
        ) : (
          <button className="btn rec-btn" onClick={() => void startRec()} disabled={r.state === 'asking'}>
            <span className="rec-dot" aria-hidden /> {audio ? t('recAgain') : t('recStart')}
          </button>
        )}
        {recording && (
          <>
            <span className="mono rec-time">{fmtTime(r.seconds)}</span>
            <LevelMeter level={r.level} />
          </>
        )}
        {r.state === 'asking' && <span className="muted small">{t('recAsking')}</span>}
      </div>
      <RecErrorLine error={r.error} />
      {audio && !recording && (
        <div className="rec-result">
          <span className="ok-mark">✓</span>
          <span>{t('recDone')}</span>
          <audio controls src={audio.url} preload="metadata" />
        </div>
      )}
    </div>
  );
}

function UploadOwn({ audio, onAudio }: { audio: { file: File; url: string } | null; onAudio: (f: File | null) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return;
    const okType = f.type.startsWith('audio/') || /\.(m4a|mp3|wav|aac|caf|ogg|webm|mp4)$/i.test(f.name);
    setErr(!okType);
    if (okType) onAudio(f);
  };
  return (
    <div className="voice-panel">
      <div
        className="dropzone audio-drop"
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <input ref={input} type="file" accept={AUDIO_ACCEPT} hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
        <div className="drop-title small-title">{audio ? t('audioChange') : t('audioDrop')}</div>
        <div className="muted small">{t('audioHint')}</div>
      </div>
      {err && <p className="error-text">{t('audioBadFile')}</p>}
      {audio && (
        <div className="rec-result">
          <span className="ok-mark">✓</span>
          <span className="audio-name">{audio.file.name}</span>
          <audio controls src={audio.url} preload="metadata" />
        </div>
      )}
    </div>
  );
}

// The computer voice, in short: is it there, does it have her sample, and a quick listen.
// Download and the voice sample live in Settings, so this page stays about the video.
function VoiceLine({
  voice,
  voiceErr,
  reload,
  script,
  language,
  why,
}: {
  voice: VoiceState | null;
  voiceErr: string | null;
  reload: () => Promise<VoiceState | null>;
  script: string;
  language: 'pl' | 'en';
  why: (e: unknown, fallback: StrKey) => string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => player.current?.pause(), []);
  // While the voice downloads (started in Settings), follow it here too.
  useEffect(() => {
    if (!voice?.installing) return;
    const id = setInterval(() => void reload(), 1500);
    return () => clearInterval(id);
  }, [voice?.installing, reload]);

  const preview = async () => {
    if (playing) {
      player.current?.pause();
      setPlaying(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.voicePreview(firstSentence(script) || t('voiceSampleText'), language, !!voice?.sample);
      player.current?.pause();
      const a = new Audio(r.url);
      player.current = a;
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      await a.play();
      setPlaying(true);
    } catch (e) {
      setErr(e instanceof HttpError && e.body?.code === 'busy' ? t('voicePreviewBusy') : why(e, 'voicePreviewFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!voice) {
    return (
      <div className="voice-panel">
        {voiceErr ? (
          <>
            <p className="error-text">{voiceErr}</p>
            <button className="btn" onClick={() => void reload()}>
              {t('retry')}
            </button>
          </>
        ) : (
          <p className="muted">{t('loading')}</p>
        )}
      </div>
    );
  }

  const settingsLink = (
    <a className="btn small-btn" href="#/settings/voice">
      {t('voiceSettingsLink')} →
    </a>
  );
  return (
    <div className="voice-panel voice-line">
      {!voice.ready ? (
        <>
          <p className="voice-state">{voice.installing ? `${t('voiceInstalling')} ${Math.round((voice.progress || 0) * 100)}%` : t('voiceNotInstalled')}</p>
          {settingsLink}
        </>
      ) : (
        <>
          <p className="voice-state">{voice.sample ? `✓ ${t('voiceWithSample')}` : t('voiceNoSample')}</p>
          {!voice.sample && <p className="sample-why">{t('sampleWhy')}</p>}
          <div className="voice-ready">
            <button className="btn" onClick={() => void preview()} disabled={busy || !script.trim()}>
              {busy ? `${t('voicePreparing')}…` : playing ? `❚❚ ${t('voiceStop')}` : `▶ ${t('voiceListen')}`}
            </button>
            {!voice.sample && settingsLink}
            {busy && <span className="muted small">{t('voicePreparingNote')}</span>}
          </div>
        </>
      )}
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
