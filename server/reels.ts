// Her finished reels, for the "show my reels" effects (envelope, folder, polaroid, conveyor, files,
// clothesline). One clip per project: the newest Instagram render in out/ (not TikTok, not YouTube).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectMeta, ReelClip } from '../src/shared/types';

const durations = new Map<string, number>(); // "<path>|<mtime>" -> seconds

const durationOf = (file: string, mtime: number) => {
  const key = `${file}|${mtime}`;
  const known = durations.get(key);
  if (known !== undefined) return known;
  let s = 0;
  try {
    s = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 5000 }).trim()) || 0;
  } catch {
    s = 0;
  }
  durations.set(key, s);
  return s;
};

export const herReels = (projectsDir: string, origin: string, exclude?: string, max = 40): ReelClip[] => {
  const out: (ReelClip & { mtime: number })[] = [];
  let slugs: string[] = [];
  try {
    slugs = fs.readdirSync(projectsDir);
  } catch {
    return [];
  }
  for (const slug of slugs) {
    if (slug === exclude || slug.startsWith('.')) continue;
    const dir = path.join(projectsDir, slug);
    let meta: Partial<ProjectMeta> = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    } catch {
      continue;
    }
    if (meta.format === 'long') continue;
    let best: { name: string; mtime: number } | null = null;
    try {
      for (const name of fs.readdirSync(path.join(dir, 'out'))) {
        if (!name.endsWith('.mp4') || / (TikTok|YouTube)( \(\d+\))?\.mp4$/.test(name)) continue;
        const mtime = fs.statSync(path.join(dir, 'out', name)).mtimeMs;
        if (!best || mtime > best.mtime) best = { name, mtime };
      }
    } catch {
      continue;
    }
    if (!best) continue;
    const duration = durationOf(path.join(dir, 'out', best.name), best.mtime);
    if (duration < 2) continue;
    out.push({
      slug,
      title: meta.title || slug,
      url: `${origin}/media/${encodeURIComponent(slug)}/out/${encodeURIComponent(best.name)}`,
      duration,
      mtime: best.mtime,
    });
  }
  return out
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max)
    .map(({ mtime: _m, ...c }) => c);
};
