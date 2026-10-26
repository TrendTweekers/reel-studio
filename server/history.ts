// Version history of edit.json. Every server write first saves the version it replaces in
// projects/<slug>/history/<id>.json (newest 50 kept). Claude edits edit.json directly; those
// writes are noticed on the next read (the page polls /version every 2 s) and the version they
// replaced is saved too.
import fs from 'node:fs';
import path from 'node:path';
import type { Edit, HistoryEntry } from '../src/shared/types';
import { outputDuration } from '../src/shared/time';

type By = HistoryEntry['by'];
const KEEP = 50;

export const makeHistory = (projectDir: (slug: string) => string) => {
  const editPath = (slug: string) => path.join(projectDir(slug), 'edit.json');
  const histDir = (slug: string) => path.join(projectDir(slug), 'history');
  const indexPath = (slug: string) => path.join(histDir(slug), 'index.json');
  // Last content we saw per reel, with its mtime and who wrote it.
  const seen = new Map<string, { mtimeMs: number; content: string; by: By }>();

  type Index = { by: Record<string, By>; current?: { mtimeMs: number; by: By } };
  const readIndex = (slug: string): Index => {
    try {
      return JSON.parse(fs.readFileSync(indexPath(slug), 'utf8')) as Index;
    } catch {
      return { by: {} };
    }
  };
  const writeIndex = (slug: string, idx: Index) => {
    fs.mkdirSync(histDir(slug), { recursive: true });
    const tmp = indexPath(slug) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx));
    fs.renameSync(tmp, indexPath(slug));
  };

  const stat = (slug: string) => {
    try {
      return fs.statSync(editPath(slug));
    } catch {
      return null;
    }
  };

  const ids = (slug: string) =>
    fs.existsSync(histDir(slug))
      ? fs
          .readdirSync(histDir(slug))
          .filter((f) => /^\d{4}-\d\d-\d\dT[\d-]+Z\.json$/.test(f))
          .map((f) => f.slice(0, -5))
          .sort()
      : [];

  // Saves one version (the file content) as a history entry.
  const save = (slug: string, content: string, at: Date, by: By) => {
    const all = ids(slug);
    const last = all[all.length - 1];
    if (last && fs.readFileSync(path.join(histDir(slug), `${last}.json`), 'utf8') === content) return;
    fs.mkdirSync(histDir(slug), { recursive: true });
    let id = at.toISOString().replace(/[:.]/g, '-');
    for (let i = 1; fs.existsSync(path.join(histDir(slug), `${id}.json`)); i++) id = new Date(at.getTime() + i).toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(histDir(slug), `${id}.json`), content);
    const idx = readIndex(slug);
    idx.by[id] = by;
    const keep = [...all, id].sort();
    for (const old of keep.slice(0, Math.max(0, keep.length - KEEP))) {
      fs.rmSync(path.join(histDir(slug), `${old}.json`), { force: true });
      delete idx.by[old];
    }
    writeIndex(slug, idx);
  };

  // Who wrote the file now on disk: what we remember, else what the index says, else Claude.
  const writerOf = (slug: string, mtimeMs: number): By => {
    const s = seen.get(slug);
    if (s && Math.abs(s.mtimeMs - mtimeMs) < 1) return s.by;
    const cur = readIndex(slug).current;
    if (cur && Math.abs(cur.mtimeMs - mtimeMs) < 1) return cur.by;
    return 'claude';
  };

  // Call on every read. Notices a write we did not make (Claude) and saves the version it replaced.
  const observe = (slug: string) => {
    try {
      const st = stat(slug);
      if (!st) return;
      const s = seen.get(slug);
      if (s && Math.abs(s.mtimeMs - st.mtimeMs) < 1) return;
      const content = fs.readFileSync(editPath(slug), 'utf8');
      if (s && s.content !== content) save(slug, s.content, new Date(s.mtimeMs), s.by);
      const by = s ? 'claude' : writerOf(slug, st.mtimeMs);
      seen.set(slug, { mtimeMs: st.mtimeMs, content, by });
    } catch (e) {
      console.error(`history observe ${slug}:`, e);
    }
  };

  // The one way the server writes edit.json.
  const write = (slug: string, edit: Edit, by: By, opts: { always?: boolean } = {}) => {
    observe(slug);
    const p = editPath(slug);
    const st = stat(slug);
    if (st) {
      try {
        const prevBy = writerOf(slug, st.mtimeMs);
        // Page saves come in bursts (one per change). Inside a burst only the version before the
        // burst is kept: a page version younger than 30 s replaced by another page save is skipped.
        const burst = !opts.always && by === 'page' && prevBy === 'page' && Date.now() - st.mtimeMs < 30000;
        if (!burst) save(slug, fs.readFileSync(p, 'utf8'), st.mtime, prevBy);
      } catch (e) {
        console.error(`history save ${slug}:`, e);
      }
    }
    const content = JSON.stringify(edit, null, 2);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, p);
    const now = fs.statSync(p).mtimeMs;
    seen.set(slug, { mtimeMs: now, content, by });
    try {
      const idx = readIndex(slug);
      idx.current = { mtimeMs: now, by };
      writeIndex(slug, idx);
    } catch {
      /* history is a convenience */
    }
  };

  const list = (slug: string): HistoryEntry[] => {
    observe(slug);
    const idx = readIndex(slug);
    return ids(slug)
      .reverse()
      .flatMap((id) => {
        try {
          const e = JSON.parse(fs.readFileSync(path.join(histDir(slug), `${id}.json`), 'utf8')) as Edit;
          const at = id.replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, '$1:$2:$3.$4Z');
          return [{ id, at, effects: e.effects?.length ?? 0, seconds: +outputDuration(e.segments ?? []).toFixed(1), by: idx.by[id] ?? 'claude' }];
        } catch {
          return [];
        }
      });
  };

  const get = (slug: string, id: string): Edit | null => {
    if (!/^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(histDir(slug), `${id}.json`), 'utf8')) as Edit;
    } catch {
      return null;
    }
  };

  const forget = (slug: string) => seen.delete(slug);

  return { observe, write, list, get, forget };
};
