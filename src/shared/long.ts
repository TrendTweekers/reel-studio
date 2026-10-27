// Helpers for long YouTube videos (edit.format === 'long'). Shared by the server, the page and the video.
import { sourceToOutput } from './time';
import type { Chapter, Edit, LongSettings } from './types';

export const isLong = (edit: Pick<Edit, 'format'> | null | undefined) => edit?.format === 'long';

// Wide sources become 1920x1080; tall ones stay 1080x1920 (no crop). The proxy already has this size.
export const longSize = (edit: Pick<Edit, 'source'>) =>
  edit.source.width >= edit.source.height ? { width: 1920, height: 1080, wide: true } : { width: 1080, height: 1920, wide: false };

export const defaultLong = (): LongSettings => ({ subtitles: false, chapterCards: true, chapters: [], zoomJumps: true });

const hms = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// Chapters on the OUTPUT timeline (after the cuts), in order, with YouTube's rules applied: the first
// starts at 0:00, each lasts 10 s or more (shorter ones merge into the one before). Fewer than 3 = no
// chapter list (YouTube would ignore it).
export const outputChapters = (edit: Pick<Edit, 'segments' | 'long'>): { at: number; title: string; source: number }[] => {
  const list = [...(edit.long?.chapters ?? [])]
    .filter((c) => c.title.trim())
    .sort((a, b) => a.at - b.at)
    .map((c) => ({ at: sourceToOutput(c.at, edit.segments), title: c.title.trim(), source: c.at }))
    .filter((c): c is { at: number; title: string; source: number } => c.at !== null);
  if (!list.length) return [];
  list[0] = { ...list[0], at: 0 };
  const out: typeof list = [];
  for (const c of list) {
    const prev = out[out.length - 1];
    if (prev && c.at - prev.at < 10) continue;
    out.push(c);
  }
  return out;
};

// "0:00 Title" lines for the description, or '' when YouTube would not accept them.
export const chapterList = (edit: Pick<Edit, 'segments' | 'long'>) => {
  const ch = outputChapters(edit);
  return ch.length >= 3 ? ch.map((c) => `${hms(c.at)} ${c.title}`).join('\n') : '';
};

// The description she pastes into YouTube: her text, then the chapter list.
export const fullDescription = (edit: Pick<Edit, 'segments' | 'long'>) =>
  [edit.long?.description?.trim(), chapterList(edit)].filter(Boolean).join('\n\n');

export const formatTime = hms;
export type { Chapter };
