// "My look" page: her own reel shown with one option per card (palettes, fonts, captions, effects,
// transitions), plus notes. Saving makes her own style "My look", sets it as the default for new
// videos, can apply it to this reel, and writes her likes to brand.md for Claude.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Edit, Effect, EffectKind, Word } from '../../src/shared/types';
import { NEEDS_CUTOUT } from '../../src/shared/types';
import { outputDuration, outputWords } from '../../src/shared/time';
import { api, HttpError, type LookPatch, type LookStillReq, type ProjectDetail } from './api';
import { fmt, LOOK_CARDS, useT, type StrKey } from './i18n';
import { go, TopRight } from './App';
import { Check } from './ui';

type Tab = 'palettes' | 'fonts' | 'captions' | 'effects' | 'transitions' | 'notes';
const TABS: Tab[] = ['palettes', 'fonts', 'captions', 'effects', 'transitions', 'notes'];
const SINGLE: Tab[] = ['palettes', 'fonts', 'captions'];

type Card = { id: string; tab: Exclude<Tab, 'notes'>; req: LookStillReq; style?: Partial<Edit['style']>; toggles?: Partial<Edit['toggles']>; cutout?: boolean };
type Draft = { take: Record<string, string[]>; more: string[]; notes: string; applyHere: boolean };
type Still = { state: 'wait' | 'ok' | 'fail'; url?: string };

const DRAFT_KEY = 'reel-studio-look-draft';
const emptyDraft = (): Draft => ({ take: {}, more: [], notes: '', applyHere: true });
const readDraft = (): Draft => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (d && typeof d === 'object') return { ...emptyDraft(), ...d };
  } catch {
    /* ignore */
  }
  return emptyDraft();
};
const writeDraft = (d: Draft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
};

const PALETTES: [string, Partial<Edit['style']>][] = [
  ['pal-cream', { hookColor: '#F5EFE6', accentColor: '#1B1715', vibe: 'editorial' }],
  ['pal-wine', { hookColor: '#F5EFE6', accentColor: '#8A3344', vibe: 'editorial' }],
  ['pal-blush', { hookColor: '#FBF4EE', accentColor: '#E8C4BC', vibe: 'glow' }],
  ['pal-olive', { hookColor: '#F3EEDF', accentColor: '#9A9A68', vibe: 'film' }],
  ['pal-noir', { hookColor: '#FFFFFF', accentColor: '#111111', vibe: 'clean' }],
  ['pal-camel', { hookColor: '#F5EFE6', accentColor: '#C19A6B', vibe: 'film' }],
];
const FONTS: [string, Partial<Edit['style']>][] = [
  ['font-vogue', { hookFont: 'Playfair Display', subtitleFont: 'Helvetica Neue' }],
  ['font-luxury', { hookFont: 'Cormorant Garamond', subtitleFont: 'DM Sans' }],
  ['font-bazaar', { hookFont: 'Bodoni Moda', subtitleFont: 'Inter' }],
  ['font-modern', { hookFont: 'Instrument Serif', subtitleFont: 'Helvetica Neue' }],
  ['font-friendly', { hookFont: 'DM Serif Display', subtitleFont: 'Montserrat' }],
  ['font-diary', { hookFont: 'Fraunces', subtitleFont: 'Courier Prime' }],
];
const CAPTIONS: [string, Partial<Edit['style']>][] = [
  ['cap-clean', { subtitleStyle: 'clean', subtitlePosition: 'lower' }],
  ['cap-box', { subtitleStyle: 'box', subtitlePosition: 'lower' }],
  ['cap-karaoke', { subtitleStyle: 'karaoke', subtitlePosition: 'middle' }],
  ['cap-pop', { subtitleStyle: 'pop', subtitlePosition: 'lower' }],
  ['cap-head', { subtitleStyle: 'clean', subtitlePosition: 'above-head' }],
  ['cap-off', { subtitleStyle: 'off', subtitlePosition: 'lower' }],
];
type FxSample = Omit<Effect, 'id' | 'at' | 'word'>;
// A sample of each effect, with Polish texts from her world. `img` = needs a board picture.
const EFFECTS: { kind: EffectKind; fx: FxSample; img?: 'need' | 'nice' }[] = [
  { kind: 'picture', fx: { kind: 'picture', duration: 2.5 }, img: 'need' },
  { kind: 'label', fx: { kind: 'label', duration: 2.5, text: 'nowość' } },
  { kind: 'zoom', fx: { kind: 'zoom', duration: 1.6, scale: 1.3 } },
  { kind: 'glass', fx: { kind: 'glass', duration: 2.5, text: 'botki' } },
  { kind: 'behind', fx: { kind: 'behind', duration: 2.5, text: 'JESIEŃ' } },
  { kind: 'chapter', fx: { kind: 'chapter', duration: 2.5, text: '[moje typy]' } },
  { kind: 'checklist', fx: { kind: 'checklist', duration: 3, text: 'Na jesień', items: ['botki', 'torebka', 'płaszcz'] } },
  { kind: 'phone', fx: { kind: 'phone', duration: 2.5 }, img: 'need' },
  { kind: 'emoji', fx: { kind: 'emoji', duration: 1.6, text: '🤍' } },
  { kind: 'chart', fx: { kind: 'chart', duration: 3, text: 'Ile razy to noszę', items: ['Botki: 12', 'Torebka: 20', 'Płaszcz: 35'] } },
  { kind: 'cover', fx: { kind: 'cover', duration: 2.5, text: 'JESIEŃ', items: ['Moje typy', 'Botki, które kocham', 'Kod -20%'] } },
  { kind: 'framebreak', fx: { kind: 'framebreak', duration: 2.5 }, img: 'nice' },
  { kind: 'papercut', fx: { kind: 'papercut', duration: 2.5 } },
  { kind: 'greenscreen', fx: { kind: 'greenscreen', duration: 2.5 }, img: 'nice' },
  { kind: 'orbit', fx: { kind: 'orbit', duration: 3, items: ['botki', 'torebka', 'płaszcz', 'szal'] } },
  { kind: 'doodle', fx: { kind: 'doodle', duration: 2.5 } },
  { kind: 'ui', fx: { kind: 'ui', duration: 3, text: 'Nowa wiadomość', items: ['Gdzie kupić te botki?', '♥ 2 431', 'botki skarpetkowe'] } },
  { kind: 'vertigo', fx: { kind: 'vertigo', duration: 2.5 } },
  { kind: 'pullback', fx: { kind: 'pullback', duration: 2.5 } },
];
const TR_NAMES: Record<string, string> = { 'tr-zoom': 'zoom jumps', 'tr-through': 'zoom-through cuts', 'tr-flash': 'flash cuts', 'tr-none': 'none, clean cuts only' };

// Words for the effect samples: kept, after the hook, real words (not "i", "to"), spread out.
const sampleWords = (edit: Edit, words: Word[], n: number) => {
  const kept = outputDuration(edit.segments);
  const after = (edit.hook?.until ?? 0) + 0.8;
  const ow = outputWords(words, edit.segments, edit.wordFixes).filter((w) => w.start > after && w.end < kept - 3.2 && w.text.replace(/[^\p{L}]/gu, '').length >= 4);
  if (!ow.length) return [];
  return Array.from({ length: n }, (_, i) => {
    const w = ow[Math.min(ow.length - 1, Math.floor(((i * 7) % n + 0.5) * (ow.length / n)))];
    return { at: words[w.index].start, word: w.text.replace(/[.,!?;:]+$/, '') };
  });
};

const buildCards = (edit: Edit, words: Word[], board: string[]): Card[] => {
  // Palettes and fonts show her hook; a reel without one borrows its title for the picture.
  const hook: LookPatch['hook'] = edit.hook ?? { text: edit.title || 'Moje jesienne typy', until: 3 };
  const cards: Card[] = [];
  for (const [id, style] of PALETTES) cards.push({ id, tab: 'palettes', style, req: { patch: { style, hook }, moment: 'hook' } });
  for (const [id, style] of FONTS) cards.push({ id, tab: 'fonts', style, req: { patch: { style, hook }, moment: 'hook' } });
  for (const [id, style] of CAPTIONS) cards.push({ id, tab: 'captions', style, req: { patch: { style }, moment: 'caption' } });
  const picture = board[0];
  const fxList = EFFECTS.filter((e) => e.img !== 'need' || picture);
  const spots = sampleWords(edit, words, fxList.length + 3);
  const spot = (i: number) => spots[i] ?? { at: edit.segments[0]?.start ?? 0, word: '' };
  fxList.forEach((e, i) => {
    const fx = { ...e.fx, ...(e.img && picture ? { image: picture } : {}), ...spot(i) };
    cards.push({ id: `fx-${e.kind}`, tab: 'effects', cutout: NEEDS_CUTOUT.includes(e.kind), req: { patch: {}, effect: fx, moment: 'effect' } });
  });
  const n = fxList.length;
  cards.push({ id: 'tr-zoom', tab: 'transitions', toggles: { zoomJumps: true }, req: { patch: { toggles: { zoomJumps: true } }, effect: { kind: 'zoom', duration: 1.4, scale: 1.22, ...spot(n) }, moment: 'effect' } });
  cards.push({ id: 'tr-through', tab: 'transitions', req: { patch: {}, effect: { kind: 'zoomthrough', duration: 0.6, ...spot(n + 1) }, moment: 'effect' } });
  cards.push({ id: 'tr-flash', tab: 'transitions', req: { patch: {}, effect: { kind: 'flash', duration: 0.2, ...spot(n + 2) }, moment: 'effect' } });
  cards.push({ id: 'tr-none', tab: 'transitions', toggles: { zoomJumps: false }, req: { patch: { toggles: { zoomJumps: false } }, moment: 'mid' } });
  return cards;
};

export function LookBuilder({ slug }: { slug: string }) {
  const { t, lang } = useT();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [board, setBoard] = useState<string[] | null>(null);
  const [tab, setTab] = useState<Tab>('palettes');
  const [draft, setDraftState] = useState<Draft>(readDraft);
  const [stills, setStills] = useState<Record<string, Still>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => {
    setDraftState((d) => {
      const n = fn(d);
      writeDraft(n);
      return n;
    });
  }, []);

  useEffect(() => {
    api.project(slug).then(setDetail, () => setFailed(true));
    api.board().then(
      (b) => setBoard(b.map((x) => x.file)),
      () => setBoard([]),
    );
  }, [slug]);

  const ready = !!detail?.edit && detail.status.step !== 'error' && !['queued', 'uploading', 'normalize', 'transcribe', 'faces', 'autoedit'].includes(detail.status.step);
  const cards = useMemo(() => (ready && detail?.edit && board ? buildCards(detail.edit, detail.words, board) : []), [ready, detail, board]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // ---- pictures: two at a time, the open tab first ----
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const pending = useRef<Card[]>([]);
  const active = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const pump = useCallback(() => {
    while (active.current < 2 && pending.current.length) {
      let i = pending.current.findIndex((c) => c.tab === tabRef.current);
      if (i < 0) i = 0;
      const [card] = pending.current.splice(i, 1);
      active.current++;
      api
        .lookStill(slug, card.req)
        .then(
          (r) => alive.current && setStills((s) => ({ ...s, [card.id]: { state: 'ok', url: r.url } })),
          () => alive.current && setStills((s) => ({ ...s, [card.id]: { state: 'fail' } })),
        )
        .finally(() => {
          active.current--;
          if (alive.current) pump();
        });
    }
  }, [slug]);
  useEffect(() => {
    if (!cards.length) return;
    pending.current = [...cards];
    setStills(Object.fromEntries(cards.map((c) => [c.id, { state: 'wait' } as Still])));
    pump();
  }, [cards, pump]);
  useEffect(() => pump(), [tab, pump]);
  const retry = (card: Card) => {
    setStills((s) => ({ ...s, [card.id]: { state: 'wait' } }));
    pending.current.unshift(card);
    pump();
  };

  // ---- choices ----
  const taken = (c: Card) => (draft.take[c.tab] ?? []).includes(c.id);
  const liked = (c: Card) => draft.more.includes(c.id);
  const toggleTake = (c: Card) =>
    setDraft((d) => {
      const cur = d.take[c.tab] ?? [];
      let next: string[];
      if (cur.includes(c.id)) next = cur.filter((x) => x !== c.id);
      else if (SINGLE.includes(c.tab)) next = [c.id];
      else if (c.id === 'tr-none') next = [c.id];
      else next = [...cur.filter((x) => x !== 'tr-none'), c.id];
      return { ...d, take: { ...d.take, [c.tab]: next } };
    });
  const toggleMore = (c: Card) => setDraft((d) => ({ ...d, more: d.more.includes(c.id) ? d.more.filter((x) => x !== c.id) : [...d.more, c.id] }));
  const countOf = (tb: Tab) => (tb === 'notes' ? (draft.notes.trim() ? 1 : 0) : new Set([...(draft.take[tb] ?? []), ...draft.more.filter((id) => byId.get(id)?.tab === tb)]).size);
  const total = TABS.reduce((n, tb) => n + countOf(tb), 0);

  const name = (id: string, l = lang) => LOOK_CARDS[l][id]?.[0] ?? id;
  const desc = (id: string) => LOOK_CARDS[lang][id]?.[1] ?? '';

  const save = async () => {
    if (!detail?.edit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const pick = (tb: Tab) => (draft.take[tb] ?? []).map((id) => byId.get(id)).filter((c): c is Card => !!c);
      const style: Partial<Edit['style']> = {};
      for (const tb of SINGLE) for (const c of pick(tb)) Object.assign(style, c.style);
      const tr = pick('transitions');
      const toggles: Partial<Edit['toggles']> = tr.length ? { zoomJumps: tr.some((c) => c.id === 'tr-zoom') } : {};
      const en = (id: string) => name(id, 'en');
      const summary = [
        pick('palettes')[0] && `palette ${en(pick('palettes')[0].id)}`,
        pick('fonts')[0] && `fonts ${en(pick('fonts')[0].id)} (${LOOK_CARDS.en[pick('fonts')[0].id][1]})`,
        pick('captions')[0] && `captions ${en(pick('captions')[0].id)}`,
      ].filter(Boolean);
      const r = await api.saveLook({
        slug,
        style,
        toggles,
        brand: {
          summary: summary.length ? `${summary.join(', ')}. Saved as the style "My look", the default for new reels.` : '',
          effects: pick('effects').map((c) => en(c.id)),
          more: draft.more.filter((id) => byId.has(id)).map((id) => {
            const c = byId.get(id)!;
            return c.tab === 'effects' ? en(id) : `${en(id)} (${c.tab.replace(/s$/, '')})`;
          }),
          transitions: tr.map((c) => TR_NAMES[c.id]),
          notes: draft.notes,
        },
      });
      await api.setDefaultStyle(r.id);
      if (draft.applyHere) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const d = await api.project(slug);
          if (!d.edit) break;
          try {
            await api.saveEdit(slug, { ...d.edit, style: { ...r.style }, toggles: { ...r.toggles }, styleId: r.id }, d.editVersion);
            break;
          } catch (e) {
            if (!(e instanceof HttpError && e.status === 409) || attempt === 2) throw e;
          }
        }
      }
      try {
        sessionStorage.setItem('reel-studio-look-saved', draft.applyHere ? 'reel' : 'new');
      } catch {
        /* ignore */
      }
      go(`/p/${encodeURIComponent(slug)}`);
    } catch {
      setError(t('lookSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const tabKeys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`look-tab-${next}`)?.focus();
  };

  const shown = cards.filter((c) => c.tab === tab);

  return (
    <div className="look">
      <header className="topbar">
        <button className="back" onClick={() => go(`/p/${encodeURIComponent(slug)}`)}>
          ← {t('lookBackReel')}
        </button>
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">{t('lookTitle')}</span>
        </div>
        <TopRight />
      </header>

      <main className="look-main">
        <div className="look-head">
          <h1 className="serif-title">{t('lookHomeTitle')}</h1>
          <p className="muted">{t('lookIntro')}</p>
        </div>

        {failed || (detail && !ready) ? (
          <p className="muted center look-empty">{t('lookNotReady')}</p>
        ) : (
          <>
            <div className="look-tabs" role="tablist" aria-label={t('lookTitle')}>
              {TABS.map((tb) => {
                const n = countOf(tb);
                return (
                  <button
                    key={tb}
                    id={`look-tab-${tb}`}
                    role="tab"
                    aria-selected={tab === tb}
                    aria-controls="look-panel"
                    tabIndex={tab === tb ? 0 : -1}
                    className={`chip ${tab === tb ? 'on' : ''}`}
                    onClick={() => setTab(tb)}
                    onKeyDown={tabKeys}
                  >
                    {t(`lookTab_${tb}` as StrKey)}
                    {n > 0 && <span className="look-count">{n}</span>}
                  </button>
                );
              })}
            </div>

            <section id="look-panel" role="tabpanel" aria-labelledby={`look-tab-${tab}`} className="look-panel">
              {tab === 'notes' ? (
                <label className="look-notes">
                  <span className="serif-title">{t('lookNotesLabel')}</span>
                  <textarea rows={7} value={draft.notes} maxLength={600} placeholder={t('lookNotesPh')} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </label>
              ) : (
                <>
                  <p className="muted small look-rule">{SINGLE.includes(tab) ? t('lookSingle') : t('lookMulti')}</p>
                  <div className="look-grid">
                    {(shown.length ? shown : Array.from({ length: 6 }, () => null)).map((c, i) => {
                      if (!c)
                        return (
                          <div key={i} className="look-card">
                            <div className="look-pic shimmer" />
                          </div>
                        );
                      const st = stills[c.id] ?? { state: 'wait' };
                      const on = taken(c);
                      const more = liked(c);
                      return (
                        <article key={c.id} className={`look-card ${on ? 'on' : ''}`}>
                          <div className={`look-pic ${st.state === 'wait' ? 'shimmer' : ''}`} onClick={() => toggleTake(c)} aria-hidden>
                            <span className="look-num">{String(i + 1).padStart(2, '0')}</span>
                            {st.state === 'ok' && st.url && <img src={st.url} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add('in')} />}
                            {st.state === 'wait' && <span className="look-pic-note">{t('lookMaking')}</span>}
                            {st.state === 'fail' && (
                              <span className="look-pic-note fail">
                                {t('lookNoPicture')}
                                <button
                                  className="link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    retry(c);
                                  }}
                                >
                                  {t('lookRetry')}
                                </button>
                              </span>
                            )}
                          </div>
                          <div className="look-body">
                            <h3 className="look-name">{name(c.id)}</h3>
                            <p className="look-desc">
                              {desc(c.id)}
                              {c.cutout && !detail?.hasCutout && <span className="muted"> ({t('lookNeedsCutout')})</span>}
                            </p>
                            <div className="look-toggles">
                              <button className={`look-tog take ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleTake(c)}>
                                <span aria-hidden>{on ? '✓' : '+'}</span> {t('lookTake')}
                              </button>
                              <button className={`look-tog more ${more ? 'on' : ''}`} aria-pressed={more} onClick={() => toggleMore(c)}>
                                <span aria-hidden>{more ? '♥' : '♡'}</span> {t('lookMore')}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {ready && (
        <div className="look-bar" role="region" aria-label={t('lookSave')}>
          <div className="look-bar-in">
            <span className="look-bar-count">{fmt(t('lookChosen'), { n: total })}</span>
            <Check checked={draft.applyHere} onChange={(v) => setDraft((d) => ({ ...d, applyHere: v }))} label={t('lookApplyHere')} />
            <span className="look-bar-space" />
            {error && (
              <span className="error-text" role="alert">
                {error}
              </span>
            )}
            <button
              className="btn"
              disabled={!total || saving}
              onClick={() => {
                if (confirm(t('lookResetQ'))) setDraft((d) => ({ ...emptyDraft(), applyHere: d.applyHere }));
              }}
            >
              {t('lookReset')}
            </button>
            <button className="btn primary" disabled={!total || saving} title={!total ? t('lookNothing') : undefined} onClick={() => void save()}>
              {saving ? t('saving') : t('lookSave')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
