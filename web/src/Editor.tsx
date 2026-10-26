import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { Edit, ReelProps } from '../../src/shared/types';
import { FPS, HOOK_FONTS, SUBTITLE_FONTS } from '../../src/shared/types';
import { outputFrames, outputToSource, sourceToOutput, totalFrames } from '../../src/shared/time';
import {
  api,
  HttpError,
  mediaUrls,
  ServerDownError,
  type FileItem,
  type Problem,
  type ProjectDetail,
  type RenderState,
  type Variant,
  type SfxItem,
  type Status,
  type StyleItem,
} from './api';
import { editReducer, initialEditState, merge3 } from './editState';
import { errText, fmt, useT } from './i18n';
import { go, LangSwitch } from './App';
import { StepList } from './Home';
import { Preview } from './Preview';
import { WordsPanel } from './WordsPanel';
import { CoverPanel } from './CoverPanel';
import { StylePanel } from './StylePanel';
import { AskClaude } from './AskClaude';
import { VersionsMenu } from './VersionsMenu';
import { EffectsPanel } from './EffectsPanel';
import { EndCardPanel, PostPanel } from './PostPanels';
import { BoardPanel, FontsPanel, HookPanel, MusicPanel, PausesPanel, RenderPanel, SfxPanel, VibePanel } from './Panels';

export type Change = (fn: (e: Edit) => Edit, key?: string) => void;
// file -> titles of the reels that use it (this reel included as "this reel").
export type UsedBy = Map<string, string[]>;

// Fill anything missing, so a hand-written or older edit.json never crashes the page.
const withDefaults = (e: Edit): Edit => ({
  ...e,
  segments: Array.isArray(e.segments) ? e.segments : [],
  hook: e.hook ?? null,
  style: {
    hookFont: HOOK_FONTS[0],
    hookColor: '#f3e9a6',
    subtitleFont: SUBTITLE_FONTS[0],
    subtitleStyle: 'clean',
    subtitlePosition: 'lower',
    accentColor: '#7b2d3b',
    vibe: 'clean',
    ...((e.style ?? {}) as Partial<Edit['style']>),
  },
  sound: { effects: true, defaultSfx: 'pop', music: null, musicVolume: 0.25, duck: true, ...((e.sound ?? {}) as Partial<Edit['sound']>) },
  toggles: { zoomJumps: true, progressBar: false, grain: false, glowAboveHead: false, ...((e.toggles ?? {}) as Partial<Edit['toggles']>) },
  effects: Array.isArray(e.effects) ? e.effects : [],
});

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'waiting';

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function Editor({ slug }: { slug: string }) {
  const { t } = useT();
  const [state, dispatch] = useReducer(editReducer, initialEditState);
  const [detail, setDetail] = useState<Omit<ProjectDetail, 'edit'> | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [board, setBoard] = useState<FileItem[]>([]);
  const [music, setMusic] = useState<FileItem[]>([]);
  const [sfx, setSfx] = useState<SfxItem[]>([]);
  const [styles, setStyles] = useState<{ styles: StyleItem[]; defaultStyle: string }>({ styles: [], defaultStyle: '' });
  const [usedOther, setUsedOther] = useState<UsedBy>(new Map());
  const [keywordsOther, setKeywordsOther] = useState<Map<string, string[]>>(new Map());
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedFx, setSelectedFx] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [askOpen, setAskOpenState] = useState(() => readLS('reel-studio-ask-open') === '1');
  const [askRunning, setAskRunning] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [askDraft, setAskDraft] = useState<{ text: string; id: number } | null>(null);
  const [summaryHidden, setSummaryHidden] = useState(() => readLS(`reel-studio-summary-${slug}`) === '1');
  const [lastLocalChange, setLastLocalChange] = useState(0);
  const player = useRef<PlayerRef>(null);

  const setAskOpen = useCallback((v: boolean) => {
    setAskOpenState(v);
    writeLS('reel-studio-ask-open', v ? '1' : '0');
  }, []);

  const edit = state.edit;
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------- versions & saving ----------
  const knownVersion = useRef<number>(-1);
  const baseEdit = useRef<Edit | null>(null); // the last version both we and the server agreed on
  const savedRev = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const askRunningRef = useRef(false);
  const lastAskAt = useRef(0); // when Claude last worked, to name the other writer correctly
  const serverOp = useRef(false);

  const showToast = useCallback((msg: string) => setToast({ msg, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), Math.max(2600, toast.msg.length * 70));
    return () => clearTimeout(id);
  }, [toast]);

  const applyDetail = useCallback((d: ProjectDetail, fromServerChange: boolean) => {
    const { edit: e, ...rest } = d;
    setDetail(rest);
    setStatus(d.status);
    knownVersion.current = d.editVersion;
    if (e) {
      const full = withDefaults(e);
      baseEdit.current = full;
      dispatch({ type: 'load', edit: full, keepHistory: fromServerChange });
    }
  }, []);

  const claudeWasWriter = () => askRunningRef.current || Date.now() - lastAskAt.current < 60_000;

  const doSave = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (!s.edit || s.rev === savedRev.current) return;
    if (askRunningRef.current) {
      // Claude is editing the same file: wait, save when the turn ends.
      setSaveState('waiting');
      return;
    }
    const rev = s.rev;
    const sent = s.edit;
    setSaveState('saving');
    try {
      const r = await api.saveEdit(slug, sent, knownVersion.current);
      knownVersion.current = r.editVersion;
      baseEdit.current = sent;
      savedRev.current = rev;
      setSaveState(stateRef.current.rev === rev ? 'saved' : 'pending');
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        // Someone else saved first. Merge field by field, keep hers on a real clash, then save again.
        try {
          const d = await api.project(slug);
          if (d.edit) {
            const server = withDefaults(d.edit);
            const base = baseEdit.current ?? server;
            const local = stateRef.current.edit ?? sent;
            const { merged, clash } = merge3(base, server, local);
            const { edit: _e, ...rest } = d;
            setDetail(rest);
            knownVersion.current = d.editVersion;
            baseEdit.current = server;
            dispatch({ type: 'merge', server, merged });
            const claude = claudeWasWriter();
            showToast(clash ? t(claude ? 'conflict' : 'conflictOther') : t(claude ? 'mergedClaude' : 'mergedOther'));
            setSaveState('pending');
            return;
          }
        } catch {
          /* fall through to retry */
        }
      }
      setSaveState('error');
      // Try again soon. Edits are never dropped.
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flushRef.current(), 3000);
    }
  }, [slug, showToast, t]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (saving.current) await saving.current;
    if (stateRef.current.rev === savedRev.current) return;
    const p = doSave().finally(() => {
      saving.current = null;
    });
    saving.current = p;
    await p;
    // More changes arrived while saving: save them too.
    if (stateRef.current.rev !== savedRev.current && saveStateRef.current !== 'error' && !askRunningRef.current) schedule();
  }, [doSave]); // eslint-disable-line react-hooks/exhaustive-deps
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), 600);
  }, []);

  useEffect(() => {
    if (state.rev === 0 || state.rev === savedRev.current) return;
    setLastLocalChange(Date.now());
    setSaveState(askRunningRef.current ? 'waiting' : 'pending');
    schedule();
  }, [state.rev, schedule]);

  // Warn before leaving with unsaved changes; try to send them anyway.
  useEffect(() => {
    const fn = (ev: BeforeUnloadEvent) => {
      if (stateRef.current.rev !== savedRev.current) {
        const e = stateRef.current.edit;
        if (e && !askRunningRef.current) {
          try {
            fetch(`/api/projects/${encodeURIComponent(slug)}/edit`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-base-version': String(knownVersion.current) },
              body: JSON.stringify(e),
              keepalive: true,
            });
          } catch {
            /* ignore */
          }
        }
        ev.preventDefault();
        ev.returnValue = t('leaveWarning');
        return t('leaveWarning');
      }
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [slug, t]);

  const goHome = async () => {
    await flush();
    go('/');
  };

  // ---------- first load ----------
  const loadDetail = useCallback(
    async (fromServerChange: boolean) => {
      try {
        const d = await api.project(slug);
        applyDetail(d, fromServerChange);
        return d;
      } catch (e) {
        if (!(e instanceof ServerDownError) && e instanceof HttpError && e.status === 404) setNotFound(true);
        return null;
      }
    },
    [slug, applyDetail],
  );

  useEffect(() => {
    void loadDetail(false);
    api.board().then(setBoard).catch(() => {});
    api.music().then(setMusic).catch(() => {});
    api.sfx().then(setSfx).catch(() => {});
    api.styles().then(setStyles).catch(() => {});
  }, [loadDetail]);

  // Pictures used in other reels (a few small JSON files).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = (await api.projects()).filter((p) => p.slug !== slug).slice(0, 60);
        const used: UsedBy = new Map();
        const kws = new Map<string, string[]>();
        await Promise.all(
          list.map(async (p) => {
            try {
              const d = await api.project(p.slug);
              const files = new Set((d.edit?.effects ?? []).map((fx) => fx.image).filter(Boolean) as string[]);
              files.forEach((f) => used.set(f, [...(used.get(f) ?? []), p.title || p.slug]));
              const kw = d.edit?.endCard?.enabled ? d.edit.endCard.keyword : '';
              if (kw) kws.set(kw, [...(kws.get(kw) ?? []), p.title || p.slug]);
            } catch {
              /* skip */
            }
          }),
        );
        if (alive) {
          setUsedOther(used);
          setKeywordsOther(kws);
        }
      } catch {
        /* skip */
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const usedBy: UsedBy = useMemo(() => {
    const m: UsedBy = new Map(Array.from(usedOther, ([k, v]) => [k, [...v]]));
    for (const fx of edit?.effects ?? []) {
      if (fx.image && !(m.get(fx.image) ?? []).includes(t('thisReel'))) m.set(fx.image, [t('thisReel'), ...(m.get(fx.image) ?? [])]);
    }
    return m;
  }, [usedOther, edit?.effects, t]);

  // ---------- live changes (Claude, other windows) ----------
  useEffect(() => {
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const v = await api.version(slug);
        setStatus((old) => {
          if (old && old.step !== v.status.step && (v.status.step === 'ready' || v.status.step === 'error')) {
            void api.project(slug).then((d) => {
              if (!stateRef.current.edit && d.edit) applyDetail(d, false);
              else {
                const { edit: _e, ...rest } = d;
                setDetail(rest);
              }
            });
          }
          return v.status;
        });
        const localDirty = stateRef.current.rev !== savedRev.current || saving.current || serverOp.current;
        if (v.editVersion !== knownVersion.current && !localDirty && (knownVersion.current !== -1 || v.status.step === 'ready')) {
          const had = !!stateRef.current.edit;
          const d = await api.project(slug);
          if (stateRef.current.rev === savedRev.current && !saving.current && !serverOp.current) {
            applyDetail(d, had);
            if (had) showToast(claudeWasWriter() ? t('updatedByClaude') : t('mergedOther'));
          }
        }
      } catch {
        /* banner handles it */
      } finally {
        busy = false;
      }
    }, 1500);
    return () => clearInterval(id);
  }, [slug, applyDetail, showToast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- keyboard ----------
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      const input = el as HTMLInputElement;
      const textInput =
        tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(input.type));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !textInput) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !textInput) {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (textInput || e.metaKey || e.ctrlKey || e.altKey) return;
      const p = player.current;
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        p?.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (tag === 'INPUT' && input.type === 'range') return;
        e.preventDefault();
        const step = (e.shiftKey ? FPS : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
        const cur = stateRef.current.edit;
        const total = cur ? totalFrames(cur) : 1;
        if (p) p.seekTo(Math.max(0, Math.min(total - 1, p.getCurrentFrame() + step)));
      } else if (e.key === '?') {
        setShowKeys((v) => !v);
      } else if (e.key === 'Escape') {
        setShowKeys(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const change: Change = useCallback((fn, key) => dispatch({ type: 'change', fn, key }), []);

  const props: ReelProps | null = useMemo(() => {
    if (!edit || !detail) return null;
    const u = mediaUrls(slug);
    return {
      edit,
      words: detail.words,
      faces: detail.faces,
      urls: { video: u.video, cutout: detail.hasCutout ? u.cutout : null, board: u.board, sfx: u.sfx, music: u.music },
    };
  }, [edit, detail, slug]);

  const seekSource = useCallback(
    (src: number) => {
      if (!edit) return;
      const out = sourceToOutput(src, edit.segments);
      if (out === null) return;
      player.current?.seekTo(Math.round(out * FPS));
    },
    [edit],
  );

  const startCutout = useCallback(async () => {
    if (detail?.hasCutout || status?.step === 'cutout') return;
    try {
      await api.cutout(slug);
      setStatus({ step: 'cutout', progress: 0 });
    } catch {
      /* ignore */
    }
  }, [detail, status, slug]);

  // Server-side changes we asked for ourselves (no "Updated by Claude" toast).
  const runServerOp = useCallback(
    async (op: () => Promise<{ editVersion: number }>) => {
      await flush();
      serverOp.current = true;
      try {
        const r = await op();
        knownVersion.current = r.editVersion;
        const d = await api.project(slug);
        applyDetail(d, true);
      } catch {
        /* banner or nothing */
      } finally {
        serverOp.current = false;
      }
    },
    [slug, flush, applyDetail],
  );
  const runAutoedit = useCallback((gap: number) => runServerOp(() => api.autoedit(slug, gap)), [runServerOp, slug]);
  const runRestore = useCallback((id: string) => runServerOp(() => api.restore(slug, id)), [runServerOp, slug]);
  const runApplyStyle = useCallback((id: string) => runServerOp(() => api.applyStyle(slug, id)), [runServerOp, slug]);

  // Refresh renders, cut-out flag and words without touching the edit.
  const refreshMeta = useCallback(async () => {
    try {
      const d = await api.project(slug);
      const { edit: _e, ...rest } = d;
      setDetail(rest);
    } catch {
      /* ignore */
    }
  }, [slug]);

  // ---------- problems (pre-render check) ----------
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const loadProblems = useCallback(async () => {
    try {
      const r = await api.problems(slug);
      setProblems(Array.isArray(r.problems) ? r.problems : []);
    } catch {
      setProblems(null); // endpoint missing or server down: hide the check
    }
  }, [slug]);
  useEffect(() => {
    if (saveState === 'saved' || saveState === 'idle') void loadProblems();
  }, [saveState, loadProblems]);

  // ---------- Claude turn state ----------
  const [bump, setBump] = useState(0);
  const onAskRunning = useCallback(
    (running: boolean) => {
      const was = askRunningRef.current;
      askRunningRef.current = running;
      setAskRunning(running);
      if (running) lastAskAt.current = Date.now();
      if (was && !running) {
        lastAskAt.current = Date.now();
        // The turn ended: refresh the lists; queued local changes now save (and merge if needed).
        api.board().then(setBoard).catch(() => {});
        api.music().then(setMusic).catch(() => {});
        api.styles().then(setStyles).catch(() => {});
        void refreshMeta();
        void loadProblems();
        setBump((b) => b + 1);
        if (stateRef.current.rev !== savedRev.current) schedule();
      }
    },
    [refreshMeta, loadProblems, schedule],
  );

  const reloadStyles = useCallback(() => {
    api.styles().then(setStyles).catch(() => {});
  }, []);

  // ---------- render (the video): Instagram and TikTok jobs ----------
  const igJob = useRenderJob(slug, 'instagram', flush, refreshMeta);
  const tkJob = useRenderJob(slug, 'tiktok', flush, refreshMeta);
  const render = igJob.render;
  const renderStarting = igJob.starting;
  const startRender = igJob.start;

  // When did the edit last change (ours or on disk)? The version is the file time when it looks like one.
  const lastChange = Math.max(lastLocalChange, knownVersion.current > 1e12 ? knownVersion.current : 0);

  const fixProblem = useCallback((effectId?: string) => {
    if (effectId) {
      setSelectedFx(effectId);
      setTimeout(() => document.getElementById(`fx-${effectId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } else document.getElementById('panel-effects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const askDraftFn = useCallback(
    (text: string) => {
      setAskOpen(true);
      setAskDraft({ text, id: Date.now() });
    },
    [setAskOpen],
  );

  // A long video where she said "następny" between reels: offer to split it.
  const splitCount = useMemo(
    () => (detail && !detail.parent ? detail.words.filter((w) => /^n[aą]st[eę]pn[ya]\W*$/i.test(w.text.trim())).length : 0),
    [detail],
  );
  const [splitting, setSplitting] = useState(false);
  const runSplit = useCallback(async () => {
    setSplitting(true);
    try {
      await flush();
      const r = await api.split(slug);
      showToast(fmt(t('splitDone'), { n: r.slugs?.length ?? 0 }));
      setTimeout(() => go('/'), 1200);
    } catch {
      showToast(t('splitFailed'));
    } finally {
      setSplitting(false);
    }
  }, [flush, slug, showToast, t]);

  const needMusic = useCallback(() => {
    document.getElementById('panel-music')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(t('addMusicFirst'));
  }, [showToast, t]);

  // ---------- view ----------
  const saveLabel =
    saveState === 'saving' || saveState === 'pending'
      ? t('saving')
      : saveState === 'error'
        ? t('saveFailed')
        : saveState === 'saved'
          ? t('saved')
          : saveState === 'waiting'
            ? t('saving')
            : '';

  if (notFound) {
    return (
      <div className="editor-empty">
        <p>404</p>
        <button className="btn" onClick={() => go('/')}>
          ← {t('back')}
        </button>
      </div>
    );
  }

  const topJob = tkJob.render?.running && !render?.running ? tkJob : igJob;
  const rendering = !!igJob.render?.running || !!tkJob.render?.running;
  const pct = Math.round((topJob.render?.progress ?? 0) * 100);

  const header = (
    <header className="topbar editor-top">
      <button className="back" onClick={goHome}>
        ← {t('back')}
      </button>
      <div className="title-wrap">
        {edit ? (
          <input
            className="title-input"
            value={edit.title}
            placeholder={t('untitled')}
            onChange={(e) => {
              const v = e.target.value;
              change((x) => ({ ...x, title: v }), 'title');
            }}
          />
        ) : (
          <span className="title-input">{t('loading')}</span>
        )}
      </div>
      <div className="top-actions">
        <span className={`save-state ${saveState}`}>{saveLabel}</span>
        <button className="icon-btn" title={`${t('undo')} (⌘Z)`} aria-label={t('undo')} disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>
          ↶
        </button>
        <button className="icon-btn" title={`${t('redo')} (⇧⌘Z)`} aria-label={t('redo')} disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>
          ↷
        </button>
        {edit && <VersionsMenu slug={slug} restore={runRestore} />}
        {edit && (
          <button
            className={`btn top-make ${rendering ? 'running' : ''}`}
            onClick={() => (rendering ? document.getElementById('panel-render')?.scrollIntoView({ behavior: 'smooth' }) : void startRender())}
            disabled={renderStarting}
            style={rendering ? { ['--pct' as string]: `${pct}%` } : undefined}
          >
            {rendering ? (pct === 0 ? t('makingShort') : `${t('makingShort')} ${pct}%`) : t('makeVideo')}
          </button>
        )}
        {edit && !rendering && (
          <button className="btn top-tiktok" onClick={() => void tkJob.start()} disabled={tkJob.starting} title={t('makeTiktok')}>
            {t('tiktokTag')}
          </button>
        )}
        {edit && (
          <button className={`btn top-ask ${askOpen ? 'on' : ''} ${askRunning ? 'running' : ''}`} onClick={() => setAskOpen(!askOpen)} aria-pressed={askOpen}>
            <span className="ask-spark" aria-hidden>
              ✦
            </span>
            {t('askOpen')}
          </button>
        )}
        <LangSwitch />
      </div>
    </header>
  );

  if (!edit || !props || !detail) {
    return (
      <div className="editor">
        {header}
        <div className="editor-empty">
          {status && status.step !== 'ready' ? (
            <div className="processing-card">
              <h2 className="serif-title">{status.step === 'error' ? t('step_error') : t('notReady')}</h2>
              {status.step === 'error' ? (
                <p className="error-text">{errText(t, status.code, status.message)}</p>
              ) : (
                <>
                  <StepList status={status} />
                  <p className="muted">{t('processingNote')}</p>
                </>
              )}
            </div>
          ) : (
            <p className="muted">{t('loading')}</p>
          )}
        </div>
      </div>
    );
  }

  const sections: [string, string][] = [
    ['style', t('style')],
    ['endcard', t('endCard')],
    ['hook', t('hook')],
    ['fonts', t('fonts')],
    ['words', t('words')],
    ['effects', t('effectsInReel')],
    ['board', t('board')],
    ['sfx', t('soundEffects')],
    ['music', t('music')],
    ['vibe', t('vibe')],
    ['pauses', t('pauses')],
    ['cover', t('cover')],
    ['post', t('post')],
    ['render', t('render')],
  ];

  const sum = detail.summary;
  const showSummary = !!sum && !summaryHidden && (sum.pausesCut != null || sum.effects != null);

  return (
    <div className="editor">
      {header}
      {askRunning && <div className="claude-bar">{t('claudeEditing')}</div>}
      <div className={`editor-body ${askOpen ? 'ask-open' : ''}`}>
        <aside className="stage-col">
          <Preview playerRef={player} props={props} edit={edit} change={change} music={music} onFrame={setFrame} onNeedMusic={needMusic} />
        </aside>
        <main className="panels-col">
          <nav className="section-nav">
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#panel-${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`panel-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          {showSummary && sum && (
            <div className="summary-card">
              <span className="ask-spark" aria-hidden>
                ✦
              </span>
              <p>
                {fmt(t('summaryText'), {
                  pauses: sum.pausesCut ?? 0,
                  saved: Math.round((sum.secondsSaved ?? 0) * 10) / 10,
                  hook: sum.hook ? t('summaryHook') : '',
                  effects: sum.effects ? fmt(t('summaryEffects'), { n: sum.effects }) : '',
                })}
              </p>
              <button
                className="btn"
                onClick={() => {
                  setSummaryHidden(true);
                  writeLS(`reel-studio-summary-${slug}`, '1');
                }}
              >
                {t('dismiss')}
              </button>
            </div>
          )}
          {splitCount > 0 && (
            <div className="split-card">
              <div>
                <strong className="serif-line">{t('splitTitle')}</strong>
                <p className="small">{fmt(t('splitText'), { n: splitCount })}</p>
              </div>
              <button className="btn primary" onClick={runSplit} disabled={splitting}>
                {splitting ? '…' : t('splitBtn')}
              </button>
            </div>
          )}
          <StylePanel slug={slug} edit={edit} styles={styles.styles} defaultStyle={styles.defaultStyle} reloadStyles={reloadStyles} applyStyle={runApplyStyle} />
          <EndCardPanel edit={edit} change={change} board={board} setBoard={setBoard} keywordsElsewhere={keywordsOther} />
          <HookPanel edit={edit} change={change} />
          <FontsPanel edit={edit} change={change} />
          <WordsPanel
            edit={edit}
            change={change}
            words={detail.words}
            range={detail.range ?? null}
            board={board}
            setBoard={setBoard}
            frame={frame}
            hasCutout={detail.hasCutout}
            cutoutRunning={status?.step === 'cutout'}
            startCutout={startCutout}
            seekSource={seekSource}
            onAdded={(id) => setSelectedFx(id)}
          />
          <EffectsPanel
            edit={edit}
            change={change}
            board={board}
            setBoard={setBoard}
            usedBy={usedBy}
            selected={selectedFx}
            setSelected={setSelectedFx}
            seekSource={seekSource}
            sfx={sfx}
          />
          <BoardPanel board={board} setBoard={setBoard} usedBy={usedBy} />
          <SfxPanel edit={edit} change={change} sfx={sfx} />
          <MusicPanel edit={edit} change={change} music={music} setMusic={setMusic} />
          <VibePanel edit={edit} change={change} />
          <PausesPanel runAutoedit={runAutoedit} onSplit={detail.parent ? undefined : runSplit} splitting={splitting} />
          <CoverPanel
            slug={slug}
            edit={edit}
            change={change}
            step={status?.step}
            bump={bump}
            currentSource={() => outputToSource((player.current?.getCurrentFrame() ?? 0) / FPS, edit.segments)}
          />
          <PostPanel edit={edit} change={change} askDraft={askDraftFn} />
          <RenderPanel
            slug={slug}
            jobs={{ instagram: igJob, tiktok: tkJob }}
            renders={detail.renders}
            problems={problems}
            onFix={fixProblem}
            lastChange={lastChange}
          />
          {!askOpen && <p className="tip">{t('tip')}</p>}
        </main>
        {askOpen && (
          <AskClaude
            slug={slug}
            words={detail.words}
            segments={edit.segments}
            board={board}
            duration={outputFrames(edit.segments) / FPS}
            onRunning={onAskRunning}
            onClose={() => setAskOpen(false)}
            draft={askDraft}
          />
        )}
      </div>
      {/* Keep polling Claude's state while the box is closed, so the bar and queued saves still work. */}
      {!askOpen && <AskWatcher slug={slug} onRunning={onAskRunning} />}
      {showKeys && (
        <div className="keys-sheet" role="dialog" aria-label={t('shortcuts')} onClick={() => setShowKeys(false)}>
          <div className="keys-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="serif-title">{t('shortcuts')}</h2>
            <dl>
              <dt>Space</dt>
              <dd>{t('sc_space')}</dd>
              <dt>← →</dt>
              <dd>{t('sc_arrows')}</dd>
              <dt>Shift + ← →</dt>
              <dd>{t('sc_shift')}</dd>
              <dt>⌘Z / ⇧⌘Z</dt>
              <dd>{t('sc_undo')}</dd>
            </dl>
            <button className="btn" onClick={() => setShowKeys(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" key={toast.id}>
          <span className="toast-dot" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// Polls only the running flag while the Ask box is closed.
function AskWatcher({ slug, onRunning }: { slug: string; onRunning: (r: boolean) => void }) {
  useEffect(() => {
    let alive = true;
    let id: number | undefined;
    const tick = async () => {
      let running = false;
      try {
        running = (await api.ask(slug)).running;
        if (alive) onRunning(running);
      } catch {
        /* ignore */
      }
      if (alive) id = window.setTimeout(tick, running ? 1200 : 5000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [slug, onRunning]);
  return null;
}

export type RenderJob = {
  render: RenderState | null;
  starting: boolean;
  startErr: string | null;
  justDone: string | null;
  start: () => Promise<void>;
};

// One render job (Instagram or TikTok): polls its state and starts it.
function useRenderJob(slug: string, variant: Variant, flush: () => Promise<void>, onFinished: () => void): RenderJob {
  const { t } = useT();
  const [render, setRender] = useState<RenderState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const was = useRef(false);
  useEffect(() => {
    let alive = true;
    let id: number | undefined;
    const tick = async () => {
      try {
        const s = await api.renderState(slug, variant);
        if (!alive) return;
        setRender(s);
        if (was.current && !s.running) {
          onFinished();
          if (!s.error && s.file) setJustDone(s.file);
        }
        was.current = s.running;
        id = window.setTimeout(tick, s.running ? 1000 : 5000);
      } catch {
        if (alive) id = window.setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [slug, variant, onFinished]);

  const start = useCallback(async () => {
    if (starting || render?.running) return;
    setStarting(true);
    setStartErr(null);
    setJustDone(null);
    try {
      await flush();
      await api.startRender(slug, variant);
      was.current = true;
      setRender({ running: true, progress: 0 });
    } catch (e) {
      const body = e instanceof HttpError ? e.body : null;
      setStartErr(errText(t, (body?.code as string) ?? null, (body?.error as string) ?? (e as Error).message) || t('renderFailed'));
    } finally {
      setStarting(false);
    }
  }, [starting, render?.running, flush, slug, variant, t]);

  return { render, starting, startErr, justDone, start };
}
