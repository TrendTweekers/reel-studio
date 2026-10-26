import { useEffect, useRef, useState } from 'react';
import { api, type HistoryItem } from './api';
import { fmt, useT, type StrKey } from './i18n';
import { fmtTime } from './ui';

// Earlier saved versions of edit.json (kept by the server). Restore is undoable like any server change.
export function VersionsMenu({ slug, restore }: { slug: string; restore: (id: string) => Promise<void> }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api
      .history(slug)
      .then((h) => setItems([...h].sort((a, b) => b.at.localeCompare(a.at))))
      .catch(() => setItems([]));
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, slug]);

  return (
    <div className="versions" ref={box}>
      <button className="icon-btn" title={t('versions')} aria-label={t('versions')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ◷
      </button>
      {open && (
        <div className="versions-menu" role="menu">
          <div className="group-label">{t('versions')}</div>
          {items === null ? (
            <p className="muted small">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="muted small">{t('versionsEmpty')}</p>
          ) : (
            <ul>
              {items.slice(0, 50).map((h) => (
                <li key={h.id}>
                  <span className="v-time">
                    {new Date(h.at).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="v-meta">
                    {t(`by_${h.by}` as StrKey) || h.by} · {fmt(t('nEffects'), { n: h.effects })} · {fmtTime(h.seconds)}
                  </span>
                  <button
                    className="link-btn"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(h.id);
                      try {
                        await restore(h.id);
                        setOpen(false);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === h.id ? '…' : t('restore')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
