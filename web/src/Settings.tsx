import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrandSettings } from '../../src/shared/types';
import { api, HttpError, ServerDownError, type LicenceState, type UpdateState, type VoiceState } from './api';
import { useBrand } from './brand';
import { go, TopRight } from './App';
import { errText, fmt, num, useT, type StrKey } from './i18n';
import { AccentPick, BrandExtraFields, ClaudeCheck, LogoPick, UsePick } from './Setup';
import { AUDIO_ACCEPT, LevelMeter, RecErrorLine, useRecorder } from './StoryNew';
import { APP_VERSION } from './version';
import { Check, Chips, fmtTime } from './ui';

// Settings: who you are, language, the computer voice, the licence key, about.

const SAMPLE_MIN = 10;
const SAMPLE_MAX = 20;

export function Settings({ section }: { section: string | null }) {
  const { t } = useT();
  useEffect(() => {
    if (!section) return;
    const id = setTimeout(() => document.getElementById(`set-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => clearTimeout(id);
  }, [section]);

  return (
    <div className="home settings-page">
      <header className="topbar">
        <button className="back" onClick={() => (history.length > 1 ? history.back() : go('/'))}>
          ← {t('back')}
        </button>
        <div className="brand">
          <span className="brand-mark">K</span>
          <span className="brand-name">Klipownia</span>
        </div>
        <TopRight />
      </header>
      <main className="story-main settings-main">
        <h1 className="serif-title story-h1">{t('settings')}</h1>
        <nav className="settings-nav" aria-label={t('settings')}>
          {(['brand', 'language', 'voice', 'claude', 'licence', 'about'] as const).map((s) => (
            <a key={s} href={`#/settings/${s}`} className={section === s ? 'on' : ''}>
              {t(`set_${s}` as StrKey)}
            </a>
          ))}
        </nav>
        <BrandSection />
        <LanguageSection />
        <section className="story-card settings-card" id="set-voice">
          <h2 className="serif-title">{t('set_voice')}</h2>
          <VoiceSettings />
        </section>
        <section className="story-card settings-card" id="set-claude">
          <h2 className="serif-title">{t('set_claude')}</h2>
          <p className="muted">{t('setupClaudeLead')}</p>
          <ClaudeCheck />
        </section>
        <LicenceSection />
        <AboutSection />
      </main>
    </div>
  );
}

function BrandSection() {
  const { t } = useT();
  const { brand, saveBrand } = useBrand();
  const [draft, setDraft] = useState<BrandSettings>(brand);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Follow the loaded brand until she starts changing things.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setDraft(brand);
  }, [brand]);
  const set = (p: Partial<BrandSettings>) => {
    touched.current = true;
    setState('idle');
    setDraft((d) => ({ ...d, ...p }));
  };
  const save = async () => {
    setState('saving');
    try {
      // Saving here also counts as a finished setup.
      const saved = await saveBrand({ ...brand, ...draft, language: brand.language, name: draft.name.trim(), done: true });
      setDraft(saved);
      touched.current = false;
      setState('saved');
    } catch {
      setState('error');
    }
  };
  return (
    <section className="story-card settings-card" id="set-brand">
      <h2 className="serif-title">{t('set_brand')}</h2>
      <label className="field">
        <span>{t('brandName')}</span>
        <input className="big-input" value={draft.name} placeholder={t('brandNamePh')} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <BrandExtraFields draft={draft} set={set} />
      <div className="group">
        <div className="group-label">{t('setupUseQ')}</div>
        <UsePick value={draft.use} onChange={(use) => set({ use })} />
      </div>
      <AccentPick value={draft.accent} onChange={(accent) => set({ accent })} />
      <LogoPick value={draft.logo} onChange={(logo) => set({ logo })} />
      <div className="story-actions">
        <button className="btn primary" onClick={() => void save()} disabled={state === 'saving' || !draft.name.trim()}>
          {state === 'saving' ? t('saving') : t('save')}
        </button>
        {state === 'saved' && <span className="ok-line">✓ {t('saved')}</span>}
        {state === 'error' && <span className="error-text">{t('setupSaveFailed')}</span>}
        <a className="link-btn" href="#/setup">
          {t('setupAgain')}
        </a>
      </div>
    </section>
  );
}

function LanguageSection() {
  const { t, lang, setLang } = useT();
  return (
    <section className="story-card settings-card" id="set-language">
      <h2 className="serif-title">{t('set_language')}</h2>
      <p className="muted">{t('setLanguageLead')}</p>
      <Chips
        value={lang}
        options={[
          { value: 'pl', label: 'Polski' },
          { value: 'en', label: 'English' },
        ]}
        onChange={setLang}
      />
    </section>
  );
}

function LicenceSection() {
  const { t } = useT();
  const [lic, setLic] = useState<LicenceState | null>(null);
  const [key, setKey] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'missing'>('idle');
  useEffect(() => {
    api.licence().then(
      (l) => {
        setLic(l);
        setKey(l.key ?? '');
      },
      (e) => setState(e instanceof HttpError && e.status === 404 ? 'missing' : 'idle'),
    );
  }, []);
  const save = async () => {
    setState('saving');
    try {
      const l = await api.saveLicence(key.trim());
      setLic(l);
      setKey(l.key ?? '');
      setState('idle');
    } catch (e) {
      setState(e instanceof HttpError && e.status === 404 ? 'missing' : 'error');
    }
  };
  // The server shows the key masked ("ABCD…WXYZ"); the field keeps what she typed until she changes it.
  const same = !!lic?.key && (key.trim() === lic.key || (key.trim().startsWith(lic.key.slice(0, 4)) && key.trim().endsWith(lic.key.slice(-4))));
  const saved = same && (lic?.status === 'saved' || lic?.status === 'valid');
  const bad = same && lic && ['invalid', 'revoked', 'limit'].includes(lic.status);
  const down = same && lic?.status === 'down';
  const [upd, setUpd] = useState<UpdateState | null>(null);
  const [updState, setUpdState] = useState<'idle' | 'checking' | 'error'>('idle');
  const checkUpdate = async () => {
    setUpdState('checking');
    try {
      setUpd(await api.updateCheck());
      setUpdState('idle');
    } catch {
      setUpdState('error');
    }
  };
  return (
    <section className="story-card settings-card" id="set-licence">
      <h2 className="serif-title">{t('set_licence')}</h2>
      <p className="muted">{t('licenceLead')}</p>
      <div className="licence-row">
        <label className="field">
          <span>{t('licenceKey')}</span>
          <input type="text" className="mono" value={key} spellCheck={false} autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" onChange={(e) => setKey(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => void save()} disabled={state === 'saving' || !key.trim() || saved}>
          {state === 'saving' ? t('saving') : t('save')}
        </button>
      </div>
      {saved && <p className="ok-line">✓ {lic?.status === 'valid' ? t('licenceValid') : t('licenceSaved')}{lic?.email ? ` · ${lic.email}` : ''}</p>}
      {bad && <p className="error-text">{t(lic.status === 'limit' ? 'licenceLimit' : lic.status === 'revoked' ? 'licenceRevoked' : 'licenceInvalid')}</p>}
      {down && <p className="muted small">{t('licenceDown')}</p>}
      {state === 'error' && <p className="error-text">{t('licenceFailed')}</p>}
      {state === 'missing' && <p className="muted small">{t('licenceNoServer')}</p>}
      {lic?.status === 'valid' && (
        <div className="licence-row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => void checkUpdate()} disabled={updState === 'checking'}>
            {updState === 'checking' ? t('updateChecking') : t('updateCheck')}
          </button>
          {upd && !upd.available && updState === 'idle' && <span className="muted small">{upd.reason === 'down' ? t('licenceDown') : fmt(t('updateNone'), { v: upd.current })}</span>}
          {upd?.available && <span className="ok-line">{fmt(t('updateAvailable'), { v: upd.latest ?? '' })}</span>}
          {updState === 'error' && <span className="error-text">{t('licenceFailed')}</span>}
        </div>
      )}
      {upd?.available && <p className="muted small">{t('updateHow')}</p>}
    </section>
  );
}

function AboutSection() {
  const { t } = useT();
  return (
    <section className="story-card settings-card" id="set-about">
      <h2 className="serif-title">{t('set_about')}</h2>
      <p>
        Klipownia <span className="mono">{fmt(t('aboutVersion'), { v: APP_VERSION })}</span>
      </p>
      <p className="muted">{t('aboutLocal')}</p>
      <div className="remotion-note">
        <p>{t('aboutRemotion')}</p>
        <a href="https://remotion.pro" target="_blank" rel="noreferrer">
          remotion.pro ↗
        </a>
      </div>
    </section>
  );
}

// ---------- the computer voice: download, a sample of her voice, a preview ----------

export function VoiceSettings() {
  const { t, lang } = useT();
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'install' | 'preview' | 'sample' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [useSample, setUseSample] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const player = useRef<HTMLAudioElement | null>(null);
  const [sampleFile, setSampleFile] = useState<{ file: File; url: string; seconds: number | null } | null>(null);
  const [recordingSample, setRecordingSample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRecorder({
    maxSeconds: SAMPLE_MAX,
    name: 'probka-glosu',
    onDone: (file, seconds) => setSampleFile({ file, url: URL.createObjectURL(file), seconds }),
  });

  const why = useCallback(
    (e: unknown, fallback: StrKey) => {
      if (e instanceof ServerDownError) return t('serverDown');
      if (e instanceof HttpError) {
        if (e.status === 404) return t('storyNeedsRestart');
        if (e.body?.code === 'busy') return t('voicePreviewBusy');
        return errText(t, e.body?.code as string | undefined, e.body?.error as string | undefined) || t(fallback);
      }
      return t(fallback);
    },
    [t],
  );

  const reload = useCallback(async () => {
    try {
      const v = await api.voiceState();
      setVoice(v);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(why(e, 'voiceFailed'));
    }
  }, [why]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!voice?.installing) return;
    const id = setInterval(() => void reload(), 1500);
    return () => clearInterval(id);
  }, [voice?.installing, reload]);
  useEffect(() => () => player.current?.pause(), []);
  useEffect(
    () => () => {
      if (sampleFile) URL.revokeObjectURL(sampleFile.url);
    },
    [sampleFile],
  );
  useEffect(() => {
    if (rec.state === 'idle') setRecordingSample(false);
  }, [rec.state]);

  const install = async () => {
    setBusy('install');
    setErr(null);
    try {
      await api.voiceInstall();
      await reload();
    } catch (e) {
      setErr(why(e, 'voiceFailed'));
    } finally {
      setBusy(null);
    }
  };

  const preview = async () => {
    if (playing) {
      player.current?.pause();
      setPlaying(false);
      return;
    }
    setBusy('preview');
    setErr(null);
    try {
      const r = await api.voicePreview(previewText.trim() || t('voiceSampleText'), lang, !!voice?.sample && useSample);
      player.current?.pause();
      const a = new Audio(r.url);
      player.current = a;
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      await a.play();
      setPlaying(true);
    } catch (e) {
      setErr(why(e, 'voicePreviewFailed'));
    } finally {
      setBusy(null);
    }
  };

  const saveSample = async () => {
    if (!sampleFile) return;
    setBusy('sample');
    setErr(null);
    try {
      await api.voiceSample(sampleFile.file);
      setSampleFile(null);
      setUseSample(true);
      await reload();
    } catch (e) {
      setErr(why(e, 'sampleFailed'));
    } finally {
      setBusy(null);
    }
  };
  const deleteSample = async () => {
    if (!confirm(t('sampleDeleteQ'))) return;
    setBusy('sample');
    setErr(null);
    try {
      await api.voiceSampleDelete();
      await reload();
    } catch (e) {
      setErr(why(e, 'sampleFailed'));
    } finally {
      setBusy(null);
    }
  };
  // A file she already has: read its length here, so a too short one is caught before upload.
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const okType = f.type.startsWith('audio/') || /\.(m4a|mp3|wav|aac|caf|ogg|webm|mp4)$/i.test(f.name);
    if (!okType) {
      setErr(t('audioBadFile'));
      return;
    }
    setErr(null);
    const url = URL.createObjectURL(f);
    setSampleFile({ file: f, url, seconds: null });
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if (isFinite(a.duration)) setSampleFile((s) => (s && s.file === f ? { ...s, seconds: a.duration } : s));
    };
    a.src = url;
  };

  if (!voice) {
    return loadErr ? (
      <>
        <p className="error-text">{loadErr}</p>
        <button className="btn" onClick={() => void reload()}>
          {t('retry')}
        </button>
      </>
    ) : (
      <p className="muted">{t('loading')}</p>
    );
  }

  const sampleTooShort = !!sampleFile && sampleFile.seconds !== null && sampleFile.seconds < SAMPLE_MIN;
  const recording = rec.state === 'recording';

  return (
    <div className="voice-settings">
      <p className="muted">{t('voiceSetLead')}</p>
      {!voice.ready ? (
        <div className="voice-install">
          {voice.installing ? (
            <>
              <p>
                <strong>{t('voiceInstalling')}</strong>
              </p>
              <div className="bar big">
                <span style={{ width: `${Math.round((voice.progress || 0) * 100)}%` }} />
              </div>
              <p className="muted small">
                {Math.round((voice.progress || 0) * 100)}% · {t('voiceInstallingNote')}
              </p>
            </>
          ) : (
            <>
              <p>{fmt(t('voiceNeedsDownload'), { gb: num(voice.sizeGb || 4, lang, 1) })}</p>
              {voice.error && <p className="error-text">{voice.error}</p>}
              <button className="btn primary" onClick={() => void install()} disabled={busy === 'install'}>
                ↓ {voice.error ? t('voiceInstallAgain') : t('voiceInstall')}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="ok-line">✓ {t('voiceInstalledOk')}</p>
      )}

      <div className={`sample-box push ${voice.sample ? 'has' : ''}`}>
        <div className="group-label">{t('sampleTitle')}</div>
        {!voice.sample && <p className="sample-why">{t('sampleWhy')}</p>}
        {voice.sample && !sampleFile && !recordingSample ? (
          <div className="row gap">
            <span className="ok-line">✓ {t('sampleSaved')}</span>
            <button
              className="link-btn"
              onClick={() => {
                setRecordingSample(true);
                void rec.start();
              }}
              disabled={busy === 'sample'}
            >
              {t('sampleRedo')}
            </button>
            <button className="link-btn" onClick={() => fileInput.current?.click()} disabled={busy === 'sample'}>
              {t('sampleUpload')}
            </button>
            <button className="link-btn danger" onClick={() => void deleteSample()} disabled={busy === 'sample'}>
              {t('delete')}
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">{t('sampleIntro')}</p>
            {(recording || recordingSample) && <blockquote className="sample-text">{t('sampleReadText')}</blockquote>}
            <div className="rec-row">
              {recording ? (
                <button className="btn rec-btn on" onClick={rec.stop}>
                  <span className="rec-dot" aria-hidden /> {t('recStop')}
                </button>
              ) : (
                <button
                  className="btn rec-btn"
                  onClick={() => {
                    setSampleFile(null);
                    setRecordingSample(true);
                    void rec.start();
                  }}
                  disabled={rec.state === 'asking' || busy === 'sample'}
                >
                  <span className="rec-dot" aria-hidden /> {sampleFile ? t('recAgain') : t('sampleRecord')}
                </button>
              )}
              {recording && (
                <>
                  <span className="mono rec-time">
                    {fmtTime(rec.seconds)} / {fmtTime(SAMPLE_MAX)}
                  </span>
                  <LevelMeter level={rec.level} />
                </>
              )}
              {!recording && (
                <button className="link-btn" onClick={() => fileInput.current?.click()} disabled={busy === 'sample'}>
                  {t('sampleUpload')}
                </button>
              )}
              {rec.state === 'asking' && <span className="muted small">{t('recAsking')}</span>}
            </div>
            <RecErrorLine error={rec.error} />
            {sampleFile && !recording && (
              <div className="rec-result">
                <audio controls src={sampleFile.url} preload="metadata" />
                {sampleTooShort ? (
                  <span className="error-text small">{fmt(t('sampleTooShort'), { n: SAMPLE_MIN })}</span>
                ) : (
                  <button className="btn primary" onClick={() => void saveSample()} disabled={busy === 'sample'}>
                    {busy === 'sample' ? t('saving') : t('sampleSave')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} hidden onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      {voice.ready && (
        <div className="voice-preview-box">
          <div className="group-label">{t('voiceTry')}</div>
          <label className="field">
            <input type="text" value={previewText} placeholder={t('voiceSampleText')} onChange={(e) => setPreviewText(e.target.value)} />
          </label>
          <div className="voice-ready">
            <button className="btn" onClick={() => void preview()} disabled={busy === 'preview'}>
              {busy === 'preview' ? `${t('voicePreparing')}…` : playing ? `❚❚ ${t('voiceStop')}` : `▶ ${t('voiceListen')}`}
            </button>
            {voice.sample && <Check checked={useSample} onChange={setUseSample} label={t('sampleUse')} />}
            {busy === 'preview' && <span className="muted small">{t('voicePreparingNote')}</span>}
          </div>
        </div>
      )}
      {err && <p className="error-text">{err}</p>}
      <p className="voice-note">{t('voiceNote')}</p>
    </div>
  );
}
