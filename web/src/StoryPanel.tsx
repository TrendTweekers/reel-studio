import { useState } from 'react';
import type { Edit, ReelClip, StoryScene, StorySceneKind, StorySettings } from '../../src/shared/types';
import { FPS, STORY_PRODUCT_KINDS } from '../../src/shared/types';
import { sourceToOutput } from '../../src/shared/time';
import type { FileItem } from './api';
import type { Change } from './Editor';
import { useBrand } from './brand';
import { ReelChoice } from './EffectsPanel';
import { shortId } from './editState';
import { numFixed, useT, type StrKey } from './i18n';
import { PictureGrid } from './PictureGrid';
import { Chips, fmtTime, Panel } from './ui';

// The scenes of a story video (edit.format 'story'): what is drawn while the voice reads.
export const SCENE_KINDS_STORY: StorySceneKind[] = ['title', 'words', 'list', 'photo', 'number', 'quote', 'compare', 'reels'];
export const SCENE_ICON: Record<StorySceneKind, string> = {
  title: 'T',
  words: 'Aa',
  list: '☰',
  photo: '▣',
  number: '#',
  screen: '▭',
  click: '↖',
  type: '⌨',
  logos: '⊞',
  price: '¤',
  quote: '❝',
  compare: '⇄',
  reels: '▦',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
// Scenes that show a board picture (screenshot or photo).
const PICTURE_KINDS: StorySceneKind[] = ['photo', 'screen', 'click'];
type Frame = NonNullable<StoryScene['frame']>;
export const sortScenes = (s: StoryScene[]) => [...s].sort((a, b) => a.at - b.at);
export const defaultStory = (): StorySettings => ({ script: '', voice: 'ai', background: 'cream', scenes: [] });
export const newScene = (at: number, text: string, kind: StorySceneKind = 'words'): StoryScene => ({ id: shortId(), at: round2(at), kind, text });

// A short line for the list.
const sceneLine = (s: StoryScene) => {
  const items = (s.items ?? []).filter(Boolean);
  if (s.kind === 'number') return [items[0], s.text].filter(Boolean).join(' · ');
  if (s.kind === 'compare') return items.slice(0, 2).join(' / ') || s.text || '';
  if (s.kind === 'list') return s.text || items.join(' · ');
  if (s.kind === 'price') return [items[1], s.text].filter(Boolean).join(' · ');
  if (s.kind === 'logos') return s.text || items.join(' · ');
  return (s.text ?? '').replace(/\n+/g, ' · ');
};

export function StoryPanel({
  edit,
  change,
  board,
  setBoard,
  reels,
  frame,
  seekSource,
  currentSource,
  selected,
  setSelected,
  productMode,
}: {
  edit: Edit;
  change: Change;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  reels: ReelClip[];
  frame: number;
  seekSource: (t: number) => void;
  currentSource: () => number;
  selected: string | null;
  setSelected: (id: string | null) => void;
  productMode?: boolean; // the project was made as a product video (meta mode 'product')
}) {
  const { t } = useT();
  const { brand } = useBrand();
  // Product scenes are offered for product videos, and to anyone who makes product videos at all.
  const showProduct = !!productMode || brand.use === 'product' || brand.use === 'both';
  const story = edit.story ?? defaultStory();
  const scenes = sortScenes(story.scenes ?? []);
  const boardUrl = (file: string) => board.find((b) => b.file === file)?.url ?? `/board/${encodeURIComponent(file)}`;

  const setStory = (fn: (s: StorySettings) => StorySettings, key?: string) => change((e) => ({ ...e, story: fn(e.story ?? defaultStory()) }), key);
  const update = (id: string, patch: Partial<StoryScene>, key?: string) =>
    setStory((s) => ({ ...s, scenes: s.scenes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), key ? `scene:${id}:${key}` : undefined);

  // The scene on screen now: the last one that started.
  const nowOut = frame / FPS;
  let current: string | null = null;
  for (const s of scenes) {
    const out = sourceToOutput(s.at, edit.segments);
    if (out !== null && out <= nowOut + 0.02) current = s.id;
  }
  if (!current && scenes.length) current = scenes[0].id;

  const addHere = () => {
    const sc = newScene(currentSource(), '');
    setStory((s) => ({ ...s, scenes: sortScenes([...s.scenes, sc]) }));
    setSelected(sc.id);
  };

  const swatches: { v: StorySettings['background']; color: string; label: StrKey }[] = [
    { v: 'cream', color: '#f6f1ea', label: 'bgCream' },
    { v: 'ink', color: '#1b1715', label: 'bgInk' },
    { v: 'accent', color: edit.style.accentColor, label: 'bgAccent' },
  ];

  return (
    <Panel
      id="story"
      title={t('scenes')}
      hint={t('scenesHint')}
      aside={
        <button className="btn" onClick={addHere}>
          + {t('sceneAddHere')}
        </button>
      }
    >
      <div className="group">
        <div className="group-label">{t('storyBackground')}</div>
        <div className="bg-swatches" role="radiogroup" aria-label={t('storyBackground')}>
          {swatches.map((s) => (
            <button key={s.v} role="radio" aria-checked={story.background === s.v} className={`bg-swatch ${story.background === s.v ? 'on' : ''}`} onClick={() => setStory((x) => ({ ...x, background: s.v }))}>
              <span className="bg-dot" style={{ background: s.color }} />
              {t(s.label)}
            </button>
          ))}
        </div>
      </div>

      {!scenes.length && <p className="muted">{t('scenesNone')}</p>}
      <ul className="fx-list scene-list">
        {scenes.map((s) => {
          const out = sourceToOutput(s.at, edit.segments);
          const isSel = s.id === selected;
          return (
            <li key={s.id} id={`scene-${s.id}`} className={`fx ${isSel ? 'sel' : ''} ${s.id === current ? 'now' : ''}`}>
              <button
                className="fx-row"
                onClick={() => {
                  setSelected(isSel ? null : s.id);
                  seekSource(s.at);
                }}
              >
                <span className="fx-time">{out === null ? '·' : fmtTime(out, 1)}</span>
                <span className="fx-icon scene-icon" title={t(`scene_${s.kind}` as StrKey)}>
                  {SCENE_ICON[s.kind] ?? '?'}
                </span>
                <span className="fx-main">
                  <span className="fx-kind">{t(`scene_${s.kind}` as StrKey) || s.kind}</span>
                  {sceneLine(s) && <span className="fx-word scene-line">{sceneLine(s)}</span>}
                </span>
                <span className="fx-preview">{PICTURE_KINDS.includes(s.kind) && s.image ? <img src={boardUrl(s.image)} alt="" className="fx-thumb" onError={(e) => e.currentTarget.classList.add('missing')} /> : null}</span>
              </button>
              {isSel && <SceneDetail kinds={showProduct || STORY_PRODUCT_KINDS.includes(s.kind) ? [...SCENE_KINDS_STORY, ...STORY_PRODUCT_KINDS] : SCENE_KINDS_STORY} scene={s} update={update} setStory={setStory} board={board} setBoard={setBoard} boardUrl={boardUrl} reels={reels} seekSource={seekSource} onDelete={() => setSelected(null)} />}
            </li>
          );
        })}
      </ul>

      {story.script && (
        <details className="story-script-view">
          <summary>{t('storyScriptShow')}</summary>
          <div className="story-script-text">
            {story.script.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="muted small">{story.voice === 'ai' ? t('storyVoiceWasAi') : t('storyVoiceWasOwn')}</p>
        </details>
      )}
    </Panel>
  );
}

function SceneDetail({
  kinds,
  scene,
  update,
  setStory,
  board,
  setBoard,
  boardUrl,
  reels,
  seekSource,
  onDelete,
}: {
  kinds: StorySceneKind[];
  scene: StoryScene;
  update: (id: string, patch: Partial<StoryScene>, key?: string) => void;
  setStory: (fn: (s: StorySettings) => StorySettings, key?: string) => void;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  boardUrl: (f: string) => string;
  reels: ReelClip[];
  seekSource: (t: number) => void;
  onDelete: () => void;
}) {
  const { t, lang } = useT();
  const [picking, setPicking] = useState(PICTURE_KINDS.includes(scene.kind) && !scene.image);
  const items = scene.items ?? [];
  const setItem = (i: number, v: string) => {
    const next = [...items];
    while (next.length <= i) next.push('');
    next[i] = v;
    // Drop empty items at the end.
    while (next.length && !next[next.length - 1]) next.pop();
    update(scene.id, { items: next.length ? next : undefined }, `item${i}`);
  };
  const nudge = (d: number) => {
    const at = Math.max(0, round2(scene.at + d));
    setStory((s) => ({ ...s, scenes: sortScenes(s.scenes.map((x) => (x.id === scene.id ? { ...x, at } : x))) }), `scene:${scene.id}:at`);
    seekSource(at);
  };
  const k = scene.kind;
  const textArea = k === 'words' || k === 'quote';

  return (
    <div className="fx-detail">
      <div className="group">
        <div className="group-label">{t('sceneKind')}</div>
        <Chips
          value={k}
          options={kinds.map((v) => ({ value: v, label: `${SCENE_ICON[v]}  ${t(`scene_${v}` as StrKey)}` }))}
          onChange={(v) => {
            update(scene.id, { kind: v });
            if (PICTURE_KINDS.includes(v) && !scene.image) setPicking(true);
          }}
        />
        <p className="muted small scene-tip">{t(`sceneTip_${k}` as StrKey)}</p>
      </div>

      {PICTURE_KINDS.includes(k) && (
        <div className="group">
          <div className="fx-pic-row">
            <button className="fx-pic" onClick={() => setPicking((p) => !p)} title={t('changePicture')}>
              {scene.image ? <img src={boardUrl(scene.image)} alt="" /> : <span>+</span>}
            </button>
            <span className="muted small">{scene.image ? t('changePicture') : k === 'photo' ? t('scenePickPhoto') : t('scenePickShot')}</span>
          </div>
          {picking && (
            <PictureGrid
              board={board}
              setBoard={setBoard}
              selected={scene.image}
              onPick={(f) => {
                update(scene.id, { image: f });
                setPicking(false);
              }}
            />
          )}
        </div>
      )}

      {(k === 'screen' || k === 'click') && (
        <div className="group">
          <div className="group-label">{t('sceneFrame')}</div>
          <Chips<Frame | 'auto'>
            value={scene.frame ?? 'auto'}
            options={(['auto', 'phone', 'browser', 'plain'] as const).map((v) => ({ value: v, label: t(`frame_${v}` as StrKey) }))}
            onChange={(v) => update(scene.id, { frame: v === 'auto' ? undefined : v })}
          />
        </div>
      )}

      {k === 'click' && scene.image && <PointPicker url={boardUrl(scene.image)} point={scene.point} onChange={(point) => update(scene.id, { point }, 'point')} />}

      {k === 'price' && (
        <div className="fx-grid">
          <label className="field">
            <span>{t('scenePriceOld')}</span>
            <input value={items[0] ?? ''} placeholder="199 zł" onChange={(e) => setItem(0, e.target.value)} />
          </label>
          <label className="field">
            <span>{t('scenePrice')}</span>
            <input className="big-input" value={items[1] ?? ''} placeholder="99 zł" onChange={(e) => setItem(1, e.target.value)} />
          </label>
        </div>
      )}

      {k === 'reels' && <ReelChoice picked={scene.reels} reels={reels} onChange={(r) => update(scene.id, { reels: r })} />}

      {k === 'number' && (
        <label className="field">
          <span>{t('sceneNumber')}</span>
          <input className="big-input" value={items[0] ?? ''} placeholder="73%" onChange={(e) => setItem(0, e.target.value)} />
        </label>
      )}

      {k === 'compare' && (
        <div className="fx-grid">
          <label className="field">
            <span>{t('sceneNo')}</span>
            <textarea rows={2} value={items[0] ?? ''} onChange={(e) => setItem(0, e.target.value)} />
          </label>
          <label className="field">
            <span>{t('sceneYes')}</span>
            <textarea rows={2} value={items[1] ?? ''} onChange={(e) => setItem(1, e.target.value)} />
          </label>
        </div>
      )}

      <label className="field">
        <span>{t(`sceneText_${k}` as StrKey)}</span>
        {textArea ? (
          <textarea rows={k === 'words' ? 4 : 3} value={scene.text ?? ''} onChange={(e) => update(scene.id, { text: e.target.value || undefined }, 'text')} />
        ) : (
          <input value={scene.text ?? ''} onChange={(e) => update(scene.id, { text: e.target.value || undefined }, 'text')} />
        )}
      </label>

      {k === 'type' && (
        <>
          <label className="field">
            <span>{t('sceneTypePh')}</span>
            <input value={items[0] ?? ''} placeholder={t('sceneTypePhPh')} onChange={(e) => setItem(0, e.target.value)} />
          </label>
          <label className="field">
            <span>{t('sceneTypeResult')}</span>
            <input value={items[1] ?? ''} onChange={(e) => setItem(1, e.target.value)} />
          </label>
        </>
      )}

      {(k === 'title' || k === 'quote') && (
        <label className="field">
          <span>{k === 'title' ? t('sceneSubLine') : t('sceneAuthor')}</span>
          <input value={items[0] ?? ''} onChange={(e) => setItem(0, e.target.value)} />
        </label>
      )}

      {(k === 'list' || k === 'logos') && (
        <label className="field">
          <span>{k === 'logos' ? t('sceneTiles') : t('sceneItems')}</span>
          <textarea
            rows={4}
            value={items.join('\n')}
            onChange={(e) => {
              const v = e.target.value.split('\n');
              update(scene.id, { items: v.some(Boolean) ? v : undefined }, 'items');
            }}
          />
        </label>
      )}

      <div className="fx-grid">
        <div className="field">
          <span>{t('sceneStarts')}</span>
          <div className="nudge">
            <button className="btn" onClick={() => nudge(-0.1)}>
              {t('earlier')}
            </button>
            <span className="mono">{numFixed(scene.at, lang, 2)} s</span>
            <button className="btn" onClick={() => nudge(0.1)}>
              {t('later')}
            </button>
          </div>
        </div>
      </div>
      <p className="muted small">{t('sceneUntilNext')}</p>

      <div className="fx-actions">
        <button
          className="btn danger"
          onClick={() => {
            setStory((s) => ({ ...s, scenes: s.scenes.filter((x) => x.id !== scene.id) }));
            onDelete();
          }}
        >
          {t('delete')}
        </button>
      </div>
    </div>
  );
}

// Click on the screenshot to choose where the cursor clicks (x, y 0..1 from the top-left corner).
function PointPicker({ url, point, onChange }: { url: string; point?: StoryScene['point']; onChange: (p: { x: number; y: number }) => void }) {
  const { t } = useT();
  return (
    <div className="group">
      <div className="group-label">{t('scenePoint')}</div>
      <p className="muted small">{point ? t('scenePointHint') : t('scenePointNone')}</p>
      <div
        className="point-picker"
        role="button"
        tabIndex={0}
        aria-label={t('scenePoint')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
          onChange({ x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) });
        }}
      >
        <img src={url} alt="" draggable={false} />
        {point && (
          <span className="point-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M5 3l14 8-6 1.6 3.4 6.4-2.6 1.4-3.4-6.4L6 18z" fill="#fff" stroke="#1b1715" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
