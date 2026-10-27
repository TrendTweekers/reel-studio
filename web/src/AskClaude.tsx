import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Segment, Word } from '../../src/shared/types';
import { api, HttpError, type AskState, type FileItem } from './api';
import { isWordKept } from './editState';
import { IG_PROMPTS } from '../../src/shared/igPrompts';
import type { StrKey } from './i18n';

// What she adds after each Instagram helper text.
const TOPIC_PH: Record<string, StrKey> = {
  week: 'ph_topics',
  trends: 'ph_accounts',
  caption: 'ph_caption',
  replies: 'ph_comments',
  profile: 'ph_bio',
  audit: 'ph_numbers',
};
import { errText, fmt, useT, type Lang } from './i18n';

// Activity text from the server is English. Known ones get a Polish version.
const ACTIVITY_PL: Record<string, string> = {
  Thinking: 'Myślę',
  Writing: 'Piszę odpowiedź',
  Working: 'Pracuję',
  'Reading your words': 'Czytam Twoje słowa',
  'Reading the whole video': 'Czytam cały film',
  'Looking at the reel': 'Oglądam rolkę',
  'Changing the reel': 'Zmieniam rolkę',
  'Checking the edit': 'Sprawdzam montaż',
  'Making the video': 'Robię film',
  'Making a clip': 'Robię fragment',
  'Working on the cover': 'Pracuję nad okładką',
  'Using a skill': 'Pracuję',
};
const activityText = (a: string | null, lang: Lang) => (a ? (lang === 'pl' ? ACTIVITY_PL[a] ?? a : a) : null);

const clean = (s: string) => s.replace(/[.,!?;:„”"“…()]+/g, '').trim();

export function AskClaude({
  slug,
  words,
  segments,
  board,
  duration,
  onRunning,
  onClose,
  draft,
}: {
  slug: string;
  words: Word[];
  segments: Segment[];
  board: FileItem[];
  duration: number;
  onRunning: (running: boolean) => void;
  onClose: () => void;
  draft?: { text: string; id: number } | null;
}) {
  const { t, lang } = useT();
  const [st, setSt] = useState<AskState>({ running: false, activity: null, messages: [] });
  const [text, setText] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // The Instagram helper buttons: open or closed is remembered on this Mac.
  const [igOpen, setIgOpen] = useState(() => {
    try {
      return localStorage.getItem('rs-ig-open') !== '0';
    } catch {
      return true;
    }
  });
  const [skill, setSkill] = useState<string | undefined>();
  const toggleIg = () =>
    setIgOpen((o) => {
      try {
        localStorage.setItem('rs-ig-open', o ? '0' : '1');
      } catch {
        /* private window */
      }
      return !o;
    });
  const fill = (value: string, withSkill?: string, placeholder?: string) => {
    // Fill only; she sends with Enter. A click never starts a run. A helper that needs her topic ends
    // with a selected "[your topic]", so what she types replaces it.
    const full = placeholder ? `${value.replace(/\s+$/, '')} ${placeholder}` : value;
    setText(full);
    setSkill(withSkill);
    setTimeout(() => {
      input.current?.focus();
      if (placeholder) input.current?.setSelectionRange(full.length - placeholder.length, full.length);
      else input.current?.setSelectionRange(full.length, full.length);
    }, 0);
  };
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.ask(slug);
      setSt(s);
      onRunning(s.running);
      return s;
    } catch {
      return null;
    }
  }, [slug, onRunning]);

  useEffect(() => {
    let alive = true;
    let id: number | undefined;
    const tick = async () => {
      const s = await load();
      if (alive) id = window.setTimeout(tick, s?.running ? 1200 : 5000);
    };
    void tick();
    input.current?.focus();
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [load]);

  // Text put in the box from elsewhere on the page (filled, never sent).
  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    setTimeout(() => input.current?.focus(), 30);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [st.messages.length, st.running]);

  // Examples built from this reel: a real word she says, a real board picture.
  const examples = useMemo(() => {
    const kept = words.filter((w) => isWordKept(w, segments)).map((w) => clean(w.text));
    const long = kept.filter((w) => w.length >= 5).sort((a, b) => b.length - a.length);
    const word = long[Math.min(2, long.length - 1)] ?? kept[0];
    const out: string[] = [];
    if (word && board.length) out.push(fmt(t('askExBoard'), { f: board[0].file.replace(/\.[a-z0-9]+$/i, ''), w: word }));
    else if (word) out.push(fmt(t('askExPicture'), { w: word }));
    out.push(duration > 45 ? t('askExClips') : t('askExShorter'));
    out.push(t('askExCover'), t('askExStyle'));
    return out;
  }, [words, segments, board, duration, t]);

  const send = async () => {
    const m = text.trim();
    if (!m || st.running || sending) return;
    setSendErr(null);
    setSending(true);
    try {
      await api.askSend(slug, m, skill);
      setText('');
      setSkill(undefined);
      setSt((s) => ({ ...s, running: true, activity: 'Thinking', messages: [...s.messages, { role: 'user', text: m, at: new Date().toISOString() }] }));
      onRunning(true);
    } catch (e) {
      setSendErr(e instanceof HttpError && e.status === 409 ? t('askBusy') : t('askSendFailed'));
    } finally {
      setSending(false);
    }
    void load();
  };

  const stop = async () => {
    try {
      await api.askStop(slug);
    } catch {
      /* ignore */
    }
    void load();
  };

  const clear = async () => {
    if (st.running) return;
    try {
      await api.askClear(slug);
    } catch {
      /* ignore */
    }
    void load();
  };

  return (
    <aside className="ask-dock" aria-label={t('askTitle')}>
      <header className="ask-head">
        <span className="ask-spark" aria-hidden>
          ✦
        </span>
        <h2 className="serif-title">{t('askTitle')}</h2>
        {st.messages.length > 0 && !st.running && (
          <button className="link-btn" onClick={clear}>
            {t('askNew')}
          </button>
        )}
        <button className="x" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </header>

      <div className="ask-list" ref={list}>
        {st.messages.length === 0 ? (
          <div className="ask-empty">
            <p className="muted">{t('askIntro')}</p>
            <div className="ask-examples">
              {examples.map((ex) => (
                <button
                  key={ex}
                  className="chip"
                  onClick={() => fill(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          st.messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'error' ? errText(t, m.code, m.text) || m.text : m.text}
            </div>
          ))
        )}
        {st.running && (
          <div className="ask-activity">
            <span className="ask-wave" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>{activityText(st.activity, lang) ?? t('askWorking')}…</span>
            <button className="link-btn danger" onClick={stop}>
              {t('askStop')}
            </button>
          </div>
        )}
      </div>

      <div className={`ig-helpers${igOpen ? ' open' : ''}`}>
        <button type="button" className="ig-toggle" onClick={toggleIg} aria-expanded={igOpen}>
          <span>{t('igHelpers')}</span>
          <span aria-hidden>{igOpen ? '▾' : '▸'}</span>
        </button>
        {igOpen && (
          <>
            <p className="ig-hint muted">{t('igHint')}</p>
            <div className="ig-chips">
              {IG_PROMPTS.map((p) => (
                <button key={p.id} type="button" className="chip" disabled={st.running} onClick={() => fill(p.text[lang], p.skill, p.topic ? t(TOPIC_PH[p.id] ?? 'ph_topic') : undefined)}>
                  {p.label[lang]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {sendErr && <div className="msg error inline">{sendErr}</div>}
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={input}
          rows={2}
          value={text}
          placeholder={st.running ? t('askWait') : t('askPlaceholder')}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value.trim()) setSkill(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="ask-send" type="submit" disabled={st.running || sending || !text.trim()} aria-label={t('askSend')}>
          ↑
        </button>
      </form>
    </aside>
  );
}
