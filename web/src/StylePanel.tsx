import { useState } from 'react';
import type { Edit } from '../../src/shared/types';
import type { EditingStyle } from '../../src/shared/styles';
import { api, type StyleItem } from './api';
import { useT } from './i18n';
import { Panel } from './ui';

// True when the reel no longer matches the style it was given (she changed fonts etc. after).
export const isEdited = (edit: Edit, s: EditingStyle) => {
  const a = edit.style;
  const b = s.style;
  const keys = Object.keys(b) as (keyof Edit['style'])[];
  if (keys.some((k) => String(a[k]).toLowerCase() !== String(b[k]).toLowerCase())) return true;
  const tk = Object.keys(s.toggles) as (keyof Edit['toggles'])[];
  if (tk.some((k) => edit.toggles[k] !== s.toggles[k])) return true;
  return edit.sound.effects !== s.sound.effects || edit.sound.defaultSfx !== s.sound.defaultSfx;
};

// Polish names for built-in styles where English is not natural (the shared file keeps the old ones).
const PL_STYLE_NAMES: Record<string, string> = { girlblog: 'Pamiętnik', film: 'Klisza' };
export const styleName = (s: EditingStyle, lang: string) =>
  lang === 'pl' ? (PL_STYLE_NAMES[s.id] && s.namePl === s.name ? PL_STYLE_NAMES[s.id] : s.namePl || s.name) : s.name || s.namePl;
const styleDesc = (s: EditingStyle, lang: string) => (lang === 'pl' ? s.descriptionPl || s.description : s.description || s.descriptionPl);

// A small tile that previews the look: hook in its font and colour, a subtitle sample, a vibe hint.
export function StyleSwatch({ s }: { s: EditingStyle }) {
  const { t } = useT();
  const st = s.style;
  const words = t('styleSample').split(' ');
  return (
    <div className={`style-tile vibe-${st.vibe} ${s.toggles.grain ? 'grain' : ''} ${s.toggles.glowAboveHead ? 'glow-head' : ''}`}>
      <div className="st-hook" style={{ fontFamily: `'${st.hookFont}', serif`, color: st.hookColor }}>
        Aa
      </div>
      {st.subtitleStyle !== 'off' && (
        <div className={`st-sub sub-${st.subtitleStyle} pos-${st.subtitlePosition}`} style={{ fontFamily: `'${st.subtitleFont}', sans-serif` }}>
          {words.map((w, i) => (
            <span key={i}>
              {i > 0 && ' '}
              <span style={i === 1 && (st.subtitleStyle === 'karaoke' || st.subtitleStyle === 'pop') ? { color: st.accentColor } : undefined} className={i === 1 ? 'hl' : ''}>
                {w}
              </span>
            </span>
          ))}
        </div>
      )}
      {s.toggles.progressBar && <div className="st-progress" style={{ background: st.accentColor }} />}
    </div>
  );
}

export function StylePanel({
  slug,
  edit,
  styles,
  defaultStyle,
  reloadStyles,
  applyStyle,
}: {
  slug: string;
  edit: Edit;
  styles: StyleItem[];
  defaultStyle: string;
  reloadStyles: () => void;
  applyStyle: (id: string) => Promise<void>;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const pick = async (id: string) => {
    setBusy(id);
    try {
      await applyStyle(id);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaveBusy(true);
    try {
      await api.saveStyle(name.trim(), slug);
      setNaming(false);
      setName('');
      reloadStyles();
    } catch {
      /* ignore */
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <Panel id="style" title={t('style')} hint={t('styleHint')}>
      <div className="style-grid">
        {styles.map((s) => {
          const on = edit.styleId === s.id;
          const edited = on && isEdited(edit, s);
          const isDefault = defaultStyle === s.id;
          return (
            <div key={s.id} className={`style-card ${on ? 'on' : ''} ${busy === s.id ? 'busy' : ''}`}>
              <button className="style-pick" onClick={() => pick(s.id)} disabled={!!busy}>
                <StyleSwatch s={s} />
                <span className="style-name">
                  {styleName(s, lang)}
                  {isDefault && (
                    <span className="star" title={t('styleDefault')}>
                      ★
                    </span>
                  )}
                </span>
                <span className="style-desc">{styleDesc(s, lang)}</span>
                <span className="style-tags">
                  {on && <span className="tag on">{edited ? t('styleEdited') : t('currentChoice')}</span>}
                  {s.own && <span className="tag">{t('styleOwn')}</span>}
                </span>
              </button>
              <div className="style-foot">
                {isDefault ? (
                  <span className="muted small">★ {t('styleDefault')}</span>
                ) : (
                  <button
                    className="link-btn"
                    onClick={async () => {
                      try {
                        await api.setDefaultStyle(s.id);
                        reloadStyles();
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    ☆ {t('styleUseDefault')}
                  </button>
                )}
                {s.own && (
                  <button
                    className="link-btn danger"
                    onClick={async () => {
                      if (!confirm(t('styleDeleteQ'))) return;
                      try {
                        await api.deleteStyle(s.id);
                        reloadStyles();
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    {t('delete')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {naming ? (
        <form
          className="style-save"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('styleNamePh')} />
          <button className="btn primary" type="submit" disabled={saveBusy || !name.trim()}>
            {t('styleSaveBtn')}
          </button>
          <button className="btn" type="button" onClick={() => setNaming(false)}>
            {t('close')}
          </button>
        </form>
      ) : (
        <button className="btn style-save-btn" onClick={() => setNaming(true)}>
          + {t('styleSave')}
        </button>
      )}
    </Panel>
  );
}
