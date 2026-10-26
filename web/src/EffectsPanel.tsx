import { useState } from 'react';
import type { Edit, Effect, EffectPosition, SfxName } from '../../src/shared/types';
import { SFX_NAMES } from '../../src/shared/types';
import { sourceToOutput } from '../../src/shared/time';
import type { FileItem, SfxItem } from './api';
import type { Change } from './Editor';
import { KIND_ICON, sortEffects } from './editState';
import { useT, type StrKey } from './i18n';
import { Chips, fmtTime, Panel, playPreview } from './ui';
import { PictureGrid } from './PictureGrid';
import type { UsedBy } from './Editor';
import { sfxLabel } from './i18n';

const POSITIONS: EffectPosition[] = ['auto', 'top', 'bottom', 'left', 'right', 'above-head', 'center'];
const TEXT_KINDS = new Set(['label', 'glass', 'behind', 'chapter', 'emoji']);
const PICTURE_KINDS = new Set(['picture', 'phone']);
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
}) {
  const { t } = useT();
  const list = sortEffects(edit.effects);
  const boardUrl = (file: string) => board.find((b) => b.file === file)?.url ?? `/board/${encodeURIComponent(file)}`;

  const update = (id: string, patch: Partial<Effect>, key?: string) =>
    change((e) => ({ ...e, effects: e.effects.map((fx) => (fx.id === id ? { ...fx, ...patch } : fx)) }), key ? `${id}:${key}` : undefined);

  return (
    <Panel id="effects" title={t('effectsInReel')}>
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
                  ) : fx.kind === 'checklist' ? (
                    <span className="fx-text">{(fx.items ?? []).filter(Boolean).join(' · ')}</span>
                  ) : fx.text ? (
                    <span className="fx-text">{fx.text}</span>
                  ) : null}
                </span>
              </button>
              {isSel && <FxDetail fx={fx} update={update} change={change} board={board} setBoard={setBoard} usedBy={usedBy} edit={edit} sfx={sfx} boardUrl={boardUrl} seekSource={seekSource} onDelete={() => setSelected(null)} />}
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
}: {
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
  const { t } = useT();
  const [picking, setPicking] = useState(!fx.image && PICTURE_KINDS.has(fx.kind));
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

      {TEXT_KINDS.has(fx.kind) && (
        <label className="field">
          <span>{t('text')}</span>
          <input value={fx.text ?? ''} onChange={(e) => update(fx.id, { text: e.target.value }, 'text')} />
        </label>
      )}

      {fx.kind === 'checklist' && (
        <label className="field">
          <span>{t('items')}</span>
          <textarea rows={4} value={(fx.items ?? []).join('\n')} onChange={(e) => update(fx.id, { items: e.target.value.split('\n') }, 'items')} />
        </label>
      )}

      {fx.kind === 'zoom' && (
        <label className="field">
          <span>
            {t('zoomAmount')} <b>{(fx.scale ?? 1.25).toFixed(2)}×</b>
          </span>
          <input type="range" min={1.05} max={1.8} step={0.05} value={fx.scale ?? 1.25} onChange={(e) => update(fx.id, { scale: Number(e.target.value) }, 'scale')} />
        </label>
      )}

      {fx.kind !== 'flash' && fx.kind !== 'zoom' && (
        <div className="group">
          <div className="group-label">{t('position')}</div>
          <Chips
            value={fx.position ?? 'auto'}
            options={POSITIONS.map((p) => ({ value: p, label: t((p === 'above-head' ? 'efpos_above-head' : `pos_${p}`) as StrKey) }))}
            onChange={(v) => update(fx.id, { position: v })}
          />
        </div>
      )}

      <div className="fx-grid">
        <label className="field">
          <span>
            {t('duration')} <b>{fx.duration.toFixed(1)} s</b>
          </span>
          <input type="range" min={0.1} max={8} step={0.1} value={fx.duration} onChange={(e) => update(fx.id, { duration: Number(e.target.value) }, 'duration')} />
        </label>
        <div className="field">
          <span>{t('time')}</span>
          <div className="nudge">
            <button className="btn" onClick={() => nudge(-0.1)}>
              {t('earlier')}
            </button>
            <span className="mono">{fx.at.toFixed(2)} s</span>
            <button className="btn" onClick={() => nudge(0.1)}>
              {t('later')}
            </button>
          </div>
        </div>
      </div>

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
