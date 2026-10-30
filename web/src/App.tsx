import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrandSettings } from '../../src/shared/types';
import { api, onServerState, type StoryMode } from './api';
import { BrandContext, DEFAULT_BRAND, loadBrand, storeBrand } from './brand';
import { defaultLang, hasSavedLang, LangContext, STRINGS, useT, type Lang, type StrKey } from './i18n';
import { Home } from './Home';
import { Editor } from './Editor';
import { LookBuilder } from './LookBuilder';
import { StoryNew } from './StoryNew';
import { Setup } from './Setup';
import { Settings } from './Settings';

// Tiny hash router: #/ is home, #/p/<slug> is the editor, #/look/<slug> is the "My look" page,
// #/story is a new video from text (#/story/product or #/story?mode=product: about a product),
// #/setup is the first start, #/settings (#/settings/voice opens at the voice). Hash keeps the server simple.
type Route =
  | { name: 'home' }
  | { name: 'story'; mode: StoryMode }
  | { name: 'look'; slug: string }
  | { name: 'editor'; slug: string }
  | { name: 'setup' }
  | { name: 'settings'; section: string | null };
const parseRoute = (): Route => {
  const h = location.hash;
  const story = h.match(/^#\/story(?:\/(product|creator))?\/?(?:\?(.*))?$/);
  if (story) {
    const q = new URLSearchParams(story[2] ?? '');
    return { name: 'story', mode: story[1] === 'product' || q.get('mode') === 'product' ? 'product' : 'creator' };
  }
  if (/^#\/setup\/?$/.test(h)) return { name: 'setup' };
  const set = h.match(/^#\/settings(?:\/([a-z]+))?\/?$/);
  if (set) return { name: 'settings', section: set[1] ?? null };
  const look = h.match(/^#\/look\/([^/?#]+)/);
  if (look) return { name: 'look', slug: decodeURIComponent(look[1]) };
  const m = h.match(/^#\/p\/([^/?#]+)/);
  return m ? { name: 'editor', slug: decodeURIComponent(m[1]) } : { name: 'home' };
};

export const go = (path: string) => {
  location.hash = path;
};

export function App() {
  const [route, setRoute] = useState(parseRoute);
  const [lang, setLangState] = useState<Lang>(defaultLang);
  const [down, setDown] = useState(false);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const brandRef = useRef(brand);
  brandRef.current = brand;

  useEffect(() => {
    const fn = () => setRoute(parseRoute());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => onServerState(setDown), []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const rememberLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('reel-studio-lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const saveBrand = useCallback(async (b: BrandSettings) => {
    const saved = await storeBrand(b);
    setBrand(saved);
    return saved;
  }, []);

  // The header switch also changes the saved language (Claude answers in it), once setup is done.
  const setLang = useCallback(
    (l: Lang) => {
      rememberLang(l);
      const b = brandRef.current;
      if (b.done && b.language !== l) void saveBrand({ ...b, language: l }).catch(() => {});
    },
    [rememberLang, saveBrand],
  );

  // Load the brand once. Not done and no videos yet = a new copy: show the first-start setup.
  useEffect(() => {
    let alive = true;
    const tryLoad = async () => {
      try {
        const b = await loadBrand();
        if (!alive) return;
        setBrand(b);
        setBrandLoaded(true);
        if (b.done && !hasSavedLang()) rememberLang(b.language);
        if (!b.done && parseRoute().name === 'home') {
          const list = await api.projects().catch(() => null);
          if (alive && list && list.length === 0 && parseRoute().name === 'home') go('/setup');
        }
      } catch {
        // Server down: try again soon (the banner explains).
        if (alive) setTimeout(tryLoad, 3000);
      }
    };
    void tryLoad();
    return () => {
      alive = false;
    };
  }, [rememberLang]);

  const ctx = useMemo(() => ({ lang, setLang, t: (k: StrKey) => STRINGS[lang][k] }), [lang, setLang]);
  const brandCtx = useMemo(() => ({ brand, loaded: brandLoaded, saveBrand }), [brand, brandLoaded, saveBrand]);

  return (
    <LangContext.Provider value={ctx}>
      <BrandContext.Provider value={brandCtx}>
        {down && (
          <div className="banner" role="alert">
            {ctx.t('serverDown')}
          </div>
        )}
        {route.name === 'editor' ? (
          <Editor key={route.slug} slug={route.slug} />
        ) : route.name === 'look' ? (
          <LookBuilder key={route.slug} slug={route.slug} />
        ) : route.name === 'story' ? (
          <StoryNew key={route.mode} mode={route.mode} />
        ) : route.name === 'setup' ? (
          <Setup />
        ) : route.name === 'settings' ? (
          <Settings section={route.section} />
        ) : (
          <Home />
        )}
      </BrandContext.Provider>
    </LangContext.Provider>
  );
}

export function LangSwitch() {
  return (
    <LangContext.Consumer>
      {({ lang, setLang }) => (
        <div className="lang" role="group" aria-label="Language">
          {(['pl', 'en'] as const).map((l) => (
            <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </LangContext.Consumer>
  );
}

// The gear in the header: Settings.
export function SettingsLink() {
  const { t } = useT();
  return (
    <a className="settings-link" href="#/settings" title={t('settings')} aria-label={t('settings')}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
      <span className="settings-link-text">{t('settings')}</span>
    </a>
  );
}

// Right side of every header: settings and language.
export function TopRight() {
  return (
    <div className="top-right">
      <SettingsLink />
      <LangSwitch />
    </div>
  );
}
