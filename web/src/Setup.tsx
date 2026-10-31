import { useCallback, useEffect, useState } from 'react';
import type { BrandSettings } from '../../src/shared/types';
import { api, type ClaudeState, type FileItem } from './api';
import { ACCENTS, useBrand } from './brand';
import { go, LangSwitch } from './App';
import { fmt, useT, type StrKey } from './i18n';
import { PictureGrid } from './PictureGrid';

// The first start: five calm screens, one question each. Saved at the end with done = true.

type Use = BrandSettings['use'];
const STEPS = ['lang', 'name', 'use', 'look', 'claude'] as const;
type StepId = (typeof STEPS)[number];

export function Setup() {
  const { t, lang, setLang } = useT();
  const { brand, saveBrand } = useBrand();
  const [step, setStep] = useState<StepId>('lang');
  const [draft, setDraft] = useState<BrandSettings>({ ...brand, language: lang });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The brand arrives a moment after the page: fill what she set before (setup run again from Settings).
  useEffect(() => {
    setDraft((d) => (d.name || d.handle || d.website ? d : { ...brand, language: d.language }));
  }, [brand]);
  const set = (patch: Partial<BrandSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]);
  const prev = () => setStep(STEPS[Math.max(0, i - 1)]);

  const finish = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveBrand({ ...draft, name: draft.name.trim(), handle: draft.handle?.trim().replace(/^@+/, '') || undefined, website: draft.website?.trim() || undefined, done: true });
      go('/');
    } catch {
      setErr(t('setupSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const canNext = step !== 'name' || !!draft.name.trim();

  return (
    <div className="home setup">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">K</span>
          <span className="brand-name">Klipownia</span>
        </div>
        <LangSwitch />
      </header>

      <main className="setup-main">
        <div className="setup-dots" aria-label={fmt(t('setupStepOf'), { n: i + 1, all: STEPS.length })}>
          {STEPS.map((s, n) => (
            <span key={s} className={n === i ? 'now' : n < i ? 'done' : ''} />
          ))}
        </div>

        <section className="setup-card" key={step}>
          {step === 'lang' && (
            <>
              <p className="setup-kicker">{t('setupWelcome')}</p>
              <h1 className="serif-title setup-q">{t('setupLangQ')}</h1>
              <div className="setup-opts two">
                {(['pl', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={draft.language === l}
                    className={`setup-opt ${draft.language === l ? 'on' : ''}`}
                    onClick={() => {
                      set({ language: l });
                      setLang(l);
                    }}
                  >
                    <span className="setup-opt-name">{l === 'pl' ? 'Polski' : 'English'}</span>
                    <span className="setup-opt-sub">{l === 'pl' ? 'Strona i Claude mówią po polsku' : 'The page and Claude speak English'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'name' && (
            <>
              <h1 className="serif-title setup-q">{t('setupNameQ')}</h1>
              <p className="muted setup-lead">{t('setupNameLead')}</p>
              <label className="field">
                <span>{t('brandName')}</span>
                <input className="big-input" autoFocus value={draft.name} placeholder={t('brandNamePh')} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && canNext && next()} />
              </label>
              <BrandExtraFields draft={draft} set={set} />
            </>
          )}

          {step === 'use' && (
            <>
              <h1 className="serif-title setup-q">{t('setupUseQ')}</h1>
              <UsePick value={draft.use} onChange={(use) => set({ use })} />
            </>
          )}

          {step === 'look' && (
            <>
              <h1 className="serif-title setup-q">{t('setupLookQ')}</h1>
              <p className="muted setup-lead">{t('setupLookLead')}</p>
              <AccentPick value={draft.accent} onChange={(accent) => set({ accent })} />
              <LogoPick value={draft.logo} onChange={(logo) => set({ logo })} />
            </>
          )}

          {step === 'claude' && (
            <>
              <h1 className="serif-title setup-q">{t('setupClaudeQ')}</h1>
              <p className="muted setup-lead">{t('setupClaudeLead')}</p>
              <ClaudeCheck />
            </>
          )}

          {err && <p className="error-text">{err}</p>}
          <div className="setup-nav">
            {i > 0 ? (
              <button className="link-btn" onClick={prev} disabled={saving}>
                ← {t('setupBack')}
              </button>
            ) : (
              <span />
            )}
            {step === 'claude' ? (
              <button className="btn primary story-go" onClick={() => void finish()} disabled={saving}>
                {saving ? t('saving') : `${t('setupFinish')} →`}
              </button>
            ) : (
              <button className="btn primary story-go" onClick={next} disabled={!canNext}>
                {step === 'look' && !draft.accent && !draft.logo ? t('setupSkip') : t('setupNext')} →
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ---------- pieces shared with Settings ----------

export function BrandExtraFields({ draft, set }: { draft: BrandSettings; set: (p: Partial<BrandSettings>) => void }) {
  const { t } = useT();
  return (
    <div className="fx-grid setup-extra">
      <label className="field">
        <span>
          {t('brandHandle')} <em className="muted">{t('optional')}</em>
        </span>
        <span className="at-input">
          <span aria-hidden>@</span>
          <input type="text" value={(draft.handle ?? '').replace(/^@+/, '')} placeholder={t('brandHandlePh')} onChange={(e) => set({ handle: e.target.value.replace(/^@+/, '') || undefined })} />
        </span>
      </label>
      <label className="field">
        <span>
          {t('brandWebsite')} <em className="muted">{t('optional')}</em>
        </span>
        <input type="text" inputMode="url" value={draft.website ?? ''} placeholder={t('brandWebsitePh')} onChange={(e) => set({ website: e.target.value || undefined })} />
      </label>
    </div>
  );
}

export function UsePick({ value, onChange }: { value: Use; onChange: (u: Use) => void }) {
  const { t } = useT();
  return (
    <div className="setup-opts" role="radiogroup">
      {(['creator', 'product', 'both'] as const).map((u) => (
        <button key={u} role="radio" aria-checked={value === u} className={`setup-opt ${value === u ? 'on' : ''}`} onClick={() => onChange(u)}>
          <span className="setup-opt-name">{t(`use_${u}` as StrKey)}</span>
          <span className="setup-opt-sub">{t(`useSub_${u}` as StrKey)}</span>
        </button>
      ))}
    </div>
  );
}

export function AccentPick({ value, onChange }: { value?: string; onChange: (c: string | undefined) => void }) {
  const { t } = useT();
  const custom = !!value && !ACCENTS.includes(value.toLowerCase());
  return (
    <div className="group">
      <div className="group-label">{t('brandAccent')}</div>
      <div className="accent-swatches" role="radiogroup" aria-label={t('brandAccent')}>
        {ACCENTS.map((c) => (
          <button key={c} role="radio" aria-checked={value?.toLowerCase() === c} className={`accent-swatch ${value?.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
        ))}
        <label className={`accent-swatch custom ${custom ? 'on' : ''}`} title={t('custom')} style={custom ? { background: value } : undefined}>
          <input type="color" value={value ?? '#7b2d3b'} onChange={(e) => onChange(e.target.value)} aria-label={t('custom')} />
          {!custom && <span aria-hidden>+</span>}
        </label>
      </div>
    </div>
  );
}

export function LogoPick({ value, onChange }: { value?: string; onChange: (f: string | undefined) => void }) {
  const { t } = useT();
  const [board, setBoard] = useState<FileItem[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.board().then(setBoard, () => {});
  }, []);
  const url = value ? (board.find((b) => b.file === value)?.url ?? `/board/${encodeURIComponent(value)}`) : null;
  return (
    <div className="group">
      <div className="group-label">
        {t('brandLogo')} <em className="muted">{t('optional')}</em>
      </div>
      <div className="fx-pic-row">
        <button className="fx-pic logo-pic" onClick={() => setOpen((o) => !o)} title={t('brandLogoPick')}>
          {url ? <img src={url} alt="" /> : <span>+</span>}
        </button>
        <span className="muted small">{value ? t('brandLogoChange') : t('brandLogoHint')}</span>
        {value && (
          <button className="link-btn danger" onClick={() => onChange(undefined)}>
            {t('brandLogoRemove')}
          </button>
        )}
      </div>
      {open && (
        <PictureGrid
          board={board}
          setBoard={setBoard}
          selected={value}
          onPick={(f) => {
            onChange(f);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Is Claude Code on this Mac? Klipownia uses her own Claude subscription through it.
export function ClaudeCheck() {
  const { t } = useT();
  const [state, setState] = useState<ClaudeState | 'unknown' | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setBusy(true);
    try {
      setState(await api.claude());
    } catch {
      // 404 = an older server without the check; any other failure: we cannot tell either.
      setState('unknown');
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  const steps = (
    <ol className="claude-steps">
      <li>{t('claudeStep1')}</li>
      <li>
        {t('claudeStep2')}
        <code className="cmd">curl -fsSL https://claude.ai/install.sh | bash</code>
      </li>
      <li>
        {t('claudeStep3')}
        <code className="cmd">claude</code>
      </li>
      <li>{t('claudeStep4')}</li>
    </ol>
  );

  return (
    <div className="claude-check" aria-live="polite">
      {state === null ? (
        <p className="muted">{t('claudeChecking')}</p>
      ) : state === 'unknown' ? (
        <>
          <p className="claude-line">
            <span className="claude-dot unknown" aria-hidden /> {t('claudeUnknown')}
          </p>
          <details className="claude-help">
            <summary>{t('claudeHowTo')}</summary>
            {steps}
          </details>
        </>
      ) : state.installed ? (
        <>
          <p className="claude-line">
            <span className="claude-dot ok" aria-hidden /> {state.version ? fmt(t('claudeInstalledV'), { v: state.version.replace(/\s*\(.*\)\s*$/, '') }) : t('claudeInstalled')}
          </p>
          {state.loggedIn === false && (
            <>
              <p className="muted small">{t('claudeNotLoggedIn')}</p>
              <code className="cmd">claude</code>
            </>
          )}
          {state.loggedIn === true && <p className="muted small">{t('claudeLoggedIn')}</p>}
        </>
      ) : (
        <>
          <p className="claude-line">
            <span className="claude-dot no" aria-hidden /> {t('claudeMissing')}
          </p>
          {steps}
        </>
      )}
      {state !== null && (
        <button className="btn small-btn" onClick={() => void check()} disabled={busy}>
          ↻ {t('claudeRecheck')}
        </button>
      )}
    </div>
  );
}
