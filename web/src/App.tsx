import { useCallback, useEffect, useMemo, useState } from 'react';
import { onServerState } from './api';
import { defaultLang, LangContext, STRINGS, type Lang, type StrKey } from './i18n';
import { Home } from './Home';
import { Editor } from './Editor';
import { LookBuilder } from './LookBuilder';

// Tiny hash router: #/ is home, #/p/<slug> is the editor, #/look/<slug> is the "My look" page. Hash keeps the server simple.
const parseRoute = () => {
  const look = location.hash.match(/^#\/look\/([^/?#]+)/);
  if (look) return { name: 'look' as const, slug: decodeURIComponent(look[1]) };
  const m = location.hash.match(/^#\/p\/([^/?#]+)/);
  return m ? { name: 'editor' as const, slug: decodeURIComponent(m[1]) } : { name: 'home' as const };
};

export const go = (path: string) => {
  location.hash = path;
};

export function App() {
  const [route, setRoute] = useState(parseRoute);
  const [lang, setLangState] = useState<Lang>(defaultLang);
  const [down, setDown] = useState(false);

  useEffect(() => {
    const fn = () => setRoute(parseRoute());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => onServerState(setDown), []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('reel-studio-lang', l);
    } catch {
      /* ignore */
    }
  }, []);
  const ctx = useMemo(() => ({ lang, setLang, t: (k: StrKey) => STRINGS[lang][k] }), [lang, setLang]);

  return (
    <LangContext.Provider value={ctx}>
      {down && (
        <div className="banner" role="alert">
          {ctx.t('serverDown')}
        </div>
      )}
      {route.name === 'editor' ? <Editor key={route.slug} slug={route.slug} /> : route.name === 'look' ? <LookBuilder key={route.slug} slug={route.slug} /> : <Home />}
    </LangContext.Provider>
  );
}

export function LangSwitch() {
  return (
    <LangContext.Consumer>
      {({ lang, setLang }) => (
        <div className="lang" role="group" aria-label="Language">
          {(['en', 'pl'] as const).map((l) => (
            <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </LangContext.Consumer>
  );
}
