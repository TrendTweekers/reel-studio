import { useState } from 'react';
import type { Edit, Effect, EffectPosition, ReelClip, SfxName } from '../../src/shared/types';
import { LONG_KINDS, REEL_KINDS, SCENE_KINDS, SFX_NAMES, STORY_SKIP_KINDS } from '../../src/shared/types';
import { sourceToOutput } from '../../src/shared/time';
import type { FileItem, SfxItem } from './api';
import type { Change } from './Editor';
import { KIND_ICON, sortEffects } from './editState';
import { numFixed, useT, type StrKey } from './i18n';
import { Chips, fmtTime, Panel, playPreview } from './ui';
import { PictureGrid } from './PictureGrid';
import type { UsedBy } from './Editor';
import { sfxLabel } from './i18n';

const POSITIONS: EffectPosition[] = ['auto', 'top', 'bottom', 'left', 'right', 'above-head', 'center'];
const TEXT_KINDS = new Set(['label', 'glass', 'behind', 'chapter', 'emoji', 'cover', 'chart', 'ui', 'doodle', 'folder', 'files', 'polaroid']);
const PICTURE_KINDS = new Set(['picture', 'phone', 'greenscreen', 'framebreak', 'papercut', 'orbit']);
const NEEDS_PICTURE = new Set(['picture', 'phone']); // the others may have none (greenscreen: cream studio)
const ITEM_KINDS = new Set(['checklist', 'cover', 'orbit', 'ui', 'chart', 'files']);
// Effects that place themselves around her (no position choice).
const SELF_PLACED = new Set<string>([...SCENE_KINDS, ...REEL_KINDS, 'flash', 'zoom', 'orbit', 'doodle', 'ui']);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function EffectsPanel({
  edit,
  change,
  board,
  setBoard,
  usedBy,
  selected,
  setSelected,
  seekSource,
  sfx,
  long,
  story,
  reels = [],
}: {
  edit: Edit;
  change: Change;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  usedBy: UsedBy;
  selected: string | null;
  setSelected: (id: string | null) => void;
  seekSource: (t: number) => void;
  sfx: SfxItem[];
  long?: boolean; // a long YouTube video shows only LONG_KINDS and has no sound effects
  reels?: ReelClip[]; // her finished reels, for envelope, folder, polaroid, ...
  story?: boolean; // a video from text ignores the effects that need a person on camera
}) {
  const { t } = useT();
  const list = sortEffects(
    long ? edit.effects.filter((fx) => LONG_KINDS.includes(fx.kind)) : story ? edit.effects.filter((fx) => !STORY_SKIP_KINDS.includes(fx.kind)) : edit.effects,
  );
  const boardUrl = (file: string) => board.find((b) => b.file === file)?.url ?? `/board/${encodeURIComponent(file)}`;

  const update = (id: string, patch: Partial<Effect>, key?: string) =>
    change((e) => ({ ...e, effects: e.effects.map((fx) => (fx.id === id ? { ...fx, ...patch } : fx)) }), key ? `${id}:${key}` : undefined);

  return (
    <Panel id="effects" title={long ? t('effectsInVideo') : t('effectsInReel')}>
      {!list.length && <p className="muted">{t('noEffects')}</p>}
      <ul className="fx-list">
        {list.map((fx) => {
          const out = sourceToOutput(fx.at, edit.segments);
          const isSel = fx.id === selected;
          return (
            <li key={fx.id} id={`fx-${fx.id}`} className={`fx ${isSel ? 'sel' : ''}`}>
              <button
                className="fx-row"
                onClick={() => {
                  setSelected(isSel ? null : fx.id);
                  seekSource(fx.at);
                }}
              >
                <span className="fx-time">{out === null ? '—' : fmtTime(out, 1)}</span>
                <span className="fx-icon" title={t(`kind_${fx.kind}` as StrKey)}>
                  {KIND_ICON[fx.kind]}
                </span>
                <span className="fx-main">
                  <span className="fx-kind">{t(`kind_${fx.kind}` as StrKey)}</span>
                  {fx.word && <span className="fx-word">„{fx.word}”</span>}
                </span>
                <span className="fx-preview">
                  {PICTURE_KINDS.has(fx.kind) && fx.image ? (
                    <img src={boardUrl(fx.image)} alt="" className="fx-thumb" onError={(e) => e.currentTarget.classList.add('missing')} />
                  ) : ITEM_KINDS.has(fx.kind) && !fx.text ? (
                    <span className="fx-text">{(fx.items ?? []).filter(Boolean).join(' · ')}</span>
                  ) : fx.text ? (
                    <span className="fx-text">{fx.text}</span>
                  ) : null}
                </span>
              </button>
              {isSel && <FxDetail long={long} story={story} fx={fx} update={update} change={change} board={board} setBoard={setBoard} usedBy={usedBy} edit={edit} sfx={sfx} reels={reels} boardUrl={boardUrl} seekSource={seekSource} onDelete={() => setSelected(null)} />}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function FxDetail({
  fx,
  update,
  change,
  board,
  setBoard,
  usedBy,
  edit,
  sfx,
  boardUrl,
  seekSource,
  onDelete,
  long,
  story,
  reels,
}: {
  long?: boolean;
  story?: boolean;
  reels: ReelClip[];
  fx: Effect;
  update: (id: string, patch: Partial<Effect>, key?: string) => void;
  change: Change;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  usedBy: UsedBy;
  edit: Edit;
  sfx: SfxItem[];
  boardUrl: (f: string) => string;
  seekSource: (t: number) => void;
  onDelete: () => void;
}) {
  const { t, lang } = useT();
  const [picking, setPicking] = useState(!fx.image && NEEDS_PICTURE.has(fx.kind));
  const usedHere = new Set(edit.effects.filter((e) => e.id !== fx.id && e.image).map((e) => e.image!));

  const nudge = (d: number) => {
    const at = Math.max(0, round2(fx.at + d));
    change((e) => ({ ...e, effects: sortEffects(e.effects.map((x) => (x.id === fx.id ? { ...x, at } : x))) }), `${fx.id}:at`);
    seekSource(at);
  };

  const sfxUrl = (name: string) => sfx.find((s) => s.name === name || s.name.replace(/\.[a-z0-9]+$/i, '') === name)?.url;

  return (
    <div className="fx-detail">
      {PICTURE_KINDS.has(fx.kind) && (
        <div className="group">
          <div className="fx-pic-row">
            <button className="fx-pic" onClick={() => setPicking((p) => !p)} title={t('changePicture')}>
              {fx.image ? <img src={boardUrl(fx.image)} alt="" /> : <span>+</span>}
            </button>
            <span className="muted small">{t('changePicture')}</span>
            {fx.image && !NEEDS_PICTURE.has(fx.kind) && (
              <button className="link-btn" onClick={() => update(fx.id, { image: undefined })}>
                {t('noPicture')}
              </button>
            )}
          </div>
          {picking && (
            <PictureGrid
              board={board}
              setBoard={setBoard}
              selected={fx.image}
              used={(f) => usedHere.has(f) || (usedBy.get(f) ?? []).length > 0}
              onPick={(f) => {
                update(fx.id, { image: f });
                setPicking(false);
              }}
            />
          )}
        </div>
      )}

      {REEL_KINDS.includes(fx.kind) && <ReelPicker fx={fx} reels={reels} update={update} />}

      {TEXT_KINDS.has(fx.kind) && (
        <label className="field">
          <span>{REEL_KINDS.includes(fx.kind) ? t(`text_${fx.kind}` as StrKey) : t('text')}</span>
          <input value={fx.text ?? ''} onChange={(e) => update(fx.id, { text: e.target.value }, 'text')} />
        </label>
      )}

      {ITEM_KINDS.has(fx.kind) && (
        <label className="field">
          <span>{fx.kind === 'checklist' ? t('items') : t(`items_${fx.kind}` as StrKey)}</span>
          <textarea rows={4} value={(fx.items ?? []).join('\n')} onChange={(e) => update(fx.id, { items: e.target.value.split('\n') }, 'items')} />
        </label>
      )}

      {fx.kind === 'zoom' && (
        <label className="field">
          <span>
            {t('zoomAmount')} <b>{numFixed(fx.scale ?? 1.25, lang, 2)}×</b>
          </span>
          <input type="range" min={1.05} max={1.8} step={0.05} value={fx.scale ?? 1.25} onChange={(e) => update(fx.id, { scale: Number(e.target.value) }, 'scale')} />
        </label>
      )}

      {!SELF_PLACED.has(fx.kind) && (
        <div className="group">
          <div className="group-label">{t('position')}</div>
          <Chips
            value={fx.position ?? 'auto'}
            options={(story ? POSITIONS.filter((p) => p !== 'above-head') : POSITIONS).map((p) => ({ value: p, label: t((p === 'above-head' ? 'efpos_above-head' : `pos_${p}`) as StrKey) }))}
            onChange={(v) => update(fx.id, { position: v })}
          />
        </div>
      )}

      <div className="fx-grid">
        <label className="field">
          <span>
            {t('duration')} <b>{numFixed(fx.duration, lang, 1)} s</b>
          </span>
          <input type="range" min={0.1} max={8} step={0.1} value={fx.duration} onChange={(e) => update(fx.id, { duration: Number(e.target.value) }, 'duration')} />
        </label>
        <div className="field">
          <span>{t('time')}</span>
          <div className="nudge">
            <button className="btn" onClick={() => nudge(-0.1)}>
              {t('earlier')}
            </button>
            <span className="mono">{numFixed(fx.at, lang, 2)} s</span>
            <button className="btn" onClick={() => nudge(0.1)}>
              {t('later')}
            </button>
          </div>
        </div>
      </div>

      {!long && (
      <label className="field">
        <span>{t('sound')}</span>
        <div className="sound-row">
          <select
            value={fx.sfx ?? 'default'}
            onChange={(e) => {
              const v = e.target.value as SfxName | 'none' | 'default';
              update(fx.id, { sfx: v });
              const name = v === 'default' ? edit.sound.defaultSfx : v;
              const u = v !== 'none' ? sfxUrl(name) : undefined;
              if (u) playPreview(u);
            }}
          >
            <option value="default">
              {t('sfxDefault')} ({sfxLabel(t, edit.sound.defaultSfx)})
            </option>
            <option value="none">{t('sfxNone')}</option>
            {SFX_NAMES.map((n) => (
              <option key={n} value={n}>
                {sfxLabel(t, n)}
              </option>
            ))}
          </select>
        </div>
      </label>
      )}

      <div className="fx-actions">
        <button
          className="btn danger"
          onClick={() => {
            change((e) => ({ ...e, effects: e.effects.filter((x) => x.id !== fx.id) }));
            onDelete();
          }}
        >
          {t('delete')}
        </button>
      </div>
    </div>
  );
}

// Which of her reels the effect shows. None picked = her newest reels. Without finished reels the
// effect shows short parts of this video instead.
function ReelPicker({ fx, reels, update }: { fx: Effect; reels: ReelClip[]; update: (id: string, patch: Partial<Effect>, key?: string) => void }) {
  return <ReelChoice picked={fx.reels} reels={reels} onChange={(r) => update(fx.id, { reels: r })} />;
}

// The reel chips, shared with the story "reels" scene. undefined = her newest reels.
export function ReelChoice({ picked: raw, reels, onChange }: { picked?: string[]; reels: ReelClip[]; onChange: (reels: string[] | undefined) => void }) {
  const { t } = useT();
  const picked = (raw ?? []).filter((s) => reels.some((r) => r.slug === s));
  const toggle = (slug: string) => {
    const next = picked.includes(slug) ? picked.filter((s) => s !== slug) : [...picked, slug];
    onChange(next.length ? next : undefined);
  };
  return (
    <div className="group">
      <div className="group-label">{t('reelsToShow')}</div>
      {!reels.length ? (
        <p className="muted small">{t('reelsNone')}</p>
      ) : (
        <>
          <div className="chips">
            <button className={`chip ${picked.length ? '' : 'on'}`} aria-pressed={!picked.length} onClick={() => onChange(undefined)}>
              {t('reelsNewest')}
            </button>
            {reels.map((r) => (
              <button key={r.slug} className={`chip ${picked.includes(r.slug) ? 'on' : ''}`} aria-pressed={picked.includes(r.slug)} onClick={() => toggle(r.slug)} title={r.title}>
                {r.title.length > 28 ? `${r.title.slice(0, 27)}…` : r.title}
              </button>
            ))}
          </div>
          <p className="muted small">{t('reelsHelp')}</p>
        </>
      )}
    </div>
  );
}
