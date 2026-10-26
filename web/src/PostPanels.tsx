import { useRef, useState } from 'react';
import type { Edit, EndCard, PostText } from '../../src/shared/types';
import type { FileItem } from './api';
import type { Change } from './Editor';
import { fmt, STRINGS, useT } from './i18n';
import { PictureGrid } from './PictureGrid';
import { Check, Group, Panel } from './ui';

// "Jesień!" -> "JESIEN": upper case, no Polish letters, no spaces, max 14 characters.
const PL_MAP: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
export const normKeyword = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);

// ---------------- End card ----------------
export function EndCardPanel({
  edit,
  change,
  board,
  setBoard,
  keywordsElsewhere,
}: {
  edit: Edit;
  change: Change;
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  keywordsElsewhere: Map<string, string[]>;
}) {
  const { t } = useT();
  const ec = edit.endCard;
  const [picking, setPicking] = useState(false);
  // Default texts follow the reel's language, not the page language.
  const textLang = edit.language?.startsWith('pl') ? 'pl' : 'en';
  const set = (patch: Partial<EndCard>, key?: string) =>
    change(
      (e) => ({
        ...e,
        endCard: {
          enabled: true,
          keyword: '',
          line: STRINGS[textLang].endLineDefault,
          sub: STRINGS[textLang].endSubDefault,
          seconds: 3,
          ...(e.endCard ?? {}),
          ...patch,
        },
      }),
      key ? `end:${key}` : undefined,
    );
  const toggle = (on: boolean) => {
    if (on && !ec) set({ enabled: true, keyword: normKeyword(edit.title.split(/\s+/)[0] ?? '') });
    else set({ enabled: on });
  };
  const users = ec?.keyword ? keywordsElsewhere.get(ec.keyword) ?? [] : [];
  const img = ec?.image ? board.find((b) => b.file === ec.image) : undefined;

  return (
    <Panel id="endcard" title={t('endCard')} hint={t('endCardHint')} aside={<Check checked={!!ec?.enabled} label={t('endCardOn')} onChange={toggle} />}>
      {ec?.enabled && (
        <div className="endcard-edit">
          <div className="endcard-preview" aria-hidden>
            {img && <img src={img.url} alt="" />}
            <div className="ec-line">{ec.line}</div>
            <div className="ec-word">{ec.keyword || '…'}</div>
            {ec.sub && <div className="ec-sub">{ec.sub}</div>}
          </div>
          <div className="endcard-fields">
            <label className="field">
              <span>{t('endKeyword')}</span>
              <input className="big-input keyword-input" value={ec.keyword} maxLength={20} onChange={(e) => set({ keyword: normKeyword(e.target.value) }, 'keyword')} />
            </label>
            {users.length > 0 && <p className="warn-text">{fmt(t('endKeywordUsed'), { list: users.join(', ') })}</p>}
            <label className="field">
              <span>{t('endLine')}</span>
              <input value={ec.line} onChange={(e) => set({ line: e.target.value }, 'line')} />
            </label>
            <label className="field">
              <span>{t('endSub')}</span>
              <input value={ec.sub ?? ''} onChange={(e) => set({ sub: e.target.value || undefined }, 'sub')} />
            </label>
            <label className="field">
              <span>
                {t('endSeconds')} <b>{ec.seconds.toFixed(1)} s</b>
              </span>
              <input type="range" min={2} max={4} step={0.5} value={ec.seconds} onChange={(e) => set({ seconds: Number(e.target.value) }, 'seconds')} />
            </label>
            <Group label={t('endImage')}>
              <div className="fx-pic-row">
                <button className="fx-pic" onClick={() => setPicking((p) => !p)} title={t('changePicture')}>
                  {img ? <img src={img.url} alt="" /> : <span>+</span>}
                </button>
                {ec.image && (
                  <button className="link-btn" onClick={() => set({ image: undefined })}>
                    {t('endNoImage')}
                  </button>
                )}
              </div>
              {picking && (
                <PictureGrid
                  board={board}
                  setBoard={setBoard}
                  selected={ec.image}
                  onPick={(f) => {
                    set({ image: f });
                    setPicking(false);
                  }}
                />
              )}
            </Group>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------- Post text ----------------
const cleanTag = (s: string) => s.replace(/^#+/, '').replace(/[\s,]+/g, '').trim();
const postToText = (p?: PostText) => (p ? [p.caption.trim(), p.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n') : '');

function PostFields({ post, setPost, keyPrefix }: { post: PostText; setPost: (p: Partial<PostText>, key?: string) => void; keyPrefix: string }) {
  const { t } = useT();
  const [tag, setTag] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const addTag = () => {
    const v = cleanTag(tag);
    if (v && !post.hashtags.includes(v)) setPost({ hashtags: [...post.hashtags, v] });
    setTag('');
  };
  const copy = async () => {
    const text = postToText(post);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(t('copied'));
    } catch {
      area.current?.focus();
      area.current?.select();
      setCopied(t('copyFailed'));
    }
    setTimeout(() => setCopied(null), 2500);
  };
  return (
    <>
      <label className="field">
        <span>{t('searchPhrase')}</span>
        <input value={post.keyword ?? ''} onChange={(e) => setPost({ keyword: e.target.value || undefined }, `${keyPrefix}kw`)} />
      </label>
      <label className="field">
        <span>{t('caption')}</span>
        <textarea ref={area} rows={6} value={post.caption} onChange={(e) => setPost({ caption: e.target.value }, `${keyPrefix}cap`)} />
      </label>
      <div className="field">
        <span>{t('hashtags')}</span>
        <div className="tags">
          {post.hashtags.map((h) => (
            <span key={h} className="tag-chip">
              #{h}
              <button aria-label={t('delete')} onClick={() => setPost({ hashtags: post.hashtags.filter((x) => x !== h) })}>
                ×
              </button>
            </span>
          ))}
          <input
            value={tag}
            placeholder={t('addHashtag')}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
      </div>
      <div className="row gap">
        <button className="btn primary" onClick={copy} disabled={!post.caption.trim() && !post.hashtags.length}>
          ⧉ {t('copyCaption')}
        </button>
        {copied && <span className="muted small">{copied}</span>}
      </div>
    </>
  );
}

export function PostPanel({ edit, change, askDraft }: { edit: Edit; change: Change; askDraft: (text: string) => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<'instagram' | 'tiktok'>('instagram');
  const empty: PostText = { caption: '', hashtags: [] };
  const post = edit.post ?? empty;
  const tk = edit.tiktok ?? {};
  const tkPost = tk.post ?? empty;
  const setPost = (p: Partial<PostText>, key?: string) => change((e) => ({ ...e, post: { ...empty, ...(e.post ?? {}), ...p } }), key);
  const setTk = (p: Partial<NonNullable<Edit['tiktok']>>, key?: string) => change((e) => ({ ...e, tiktok: { ...(e.tiktok ?? {}), ...p } }), key);
  const setTkPost = (p: Partial<PostText>, key?: string) => change((e) => ({ ...e, tiktok: { ...(e.tiktok ?? {}), post: { ...empty, ...(e.tiktok?.post ?? {}), ...p } } }), key);
  const isEmpty = !post.caption && !post.hashtags.length && !tkPost.caption;

  return (
    <Panel id="post" title={t('post')} hint={t('postHint')}>
      {isEmpty && <p className="empty-note">{t('postEmpty')}</p>}
      <button className="link-btn ask-hint" onClick={() => askDraft(t('askWriteCaptionText'))}>
        ✦ {t('askWriteCaption')}
      </button>
      <div className="tabs" role="tablist">
        {(['instagram', 'tiktok'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={tab === v} className={`tab ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}>
            {v === 'instagram' ? t('tabInstagram') : t('tabTiktok')}
          </button>
        ))}
      </div>
      {tab === 'instagram' ? (
        <PostFields post={post} setPost={setPost} keyPrefix="ig" />
      ) : (
        <>
          <div className="hook-fields">
            <label className="field">
              <span>{t('tiktokHook')}</span>
              <input
                className="big-input"
                value={tk.hook?.text ?? ''}
                placeholder={edit.hook?.text ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setTk({ hook: v || tk.hook?.accent ? { until: edit.hook?.until ?? 2.5, ...(tk.hook ?? {}), text: v } : undefined }, 'tkhook');
                }}
              />
            </label>
            <label className="field">
              <span>{t('hookAccent')}</span>
              <input
                className="big-input italic"
                value={tk.hook?.accent ?? ''}
                placeholder={edit.hook?.accent ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setTk({ hook: { until: edit.hook?.until ?? 2.5, text: tk.hook?.text ?? '', ...(tk.hook ?? {}), accent: v || undefined } }, 'tkaccent');
                }}
              />
            </label>
          </div>
          <p className="muted small tight">{t('tiktokHookHint')}</p>
          <label className="field">
            <span>{t('tiktokEndLine')}</span>
            <input value={tk.endCardLine ?? ''} placeholder={edit.endCard?.line ?? ''} onChange={(e) => setTk({ endCardLine: e.target.value || undefined }, 'tkend')} />
          </label>
          <p className="muted small tight">{t('tiktokEndLineHint')}</p>
          <PostFields post={tkPost} setPost={setTkPost} keyPrefix="tk" />
        </>
      )}
    </Panel>
  );
}
