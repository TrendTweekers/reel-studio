import { useRef, useState } from 'react';
import { api, upload, type FileItem } from './api';
import { errText, useT } from './i18n';

// Board pictures to pick from, with a first "+ Add picture" tile that uploads and picks the new file.
// isOn marks several pictures at once (pick = toggle), e.g. the screenshots of a product video.
export function PictureGrid({
  board,
  setBoard,
  onPick,
  selected,
  used,
  isOn,
}: {
  board: FileItem[];
  setBoard: (b: FileItem[]) => void;
  onPick: (file: string) => void;
  selected?: string;
  used?: (file: string) => boolean;
  isOn?: (file: string) => boolean;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async (files: File[]) => {
    if (!files.length) return;
    const before = new Set(board.map((b) => b.file));
    setProgress(0);
    setErr(null);
    try {
      await upload('/api/board', 'images', files.slice(0, 1), setProgress).promise;
      const next = await api.board();
      setBoard(next);
      const added = next.find((b) => !before.has(b.file)) ?? next.find((b) => b.file === files[0].name);
      if (added) onPick(added.file);
    } catch (e) {
      const x = e as Error & { code?: string; serverText?: string };
      setErr(errText(t, x.code, x.serverText) || t('uploadFailed'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
    {err && <p className="error-text small">{err}</p>}
    <div className="board-grid small">
      <input ref={input} type="file" accept="image/*,.heic,.HEIC" hidden onChange={(e) => (void send(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      <button className="board-item add-tile" onClick={() => input.current?.click()} disabled={progress !== null}>
        {progress !== null ? (
          <span className="small">{t('uploadingPicture')}</span>
        ) : (
          <>
            <span className="add-plus">+</span>
            <span className="small">{t('addPicture')}</span>
          </>
        )}
      </button>
      {board.map((b) => (
        <button key={b.file} className={`board-item ${(isOn ? isOn(b.file) : b.file === selected) ? 'on' : ''}`} onClick={() => onPick(b.file)}>
          <img src={b.url} alt={b.file} loading="lazy" />
          {used?.(b.file) && <span className="used-tag">{t('used')}</span>}
        </button>
      ))}
    </div>
    </>
  );
}
