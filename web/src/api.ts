import type { Edit, FaceSample, Word } from '../../src/shared/types';
import type { EditingStyle } from '../../src/shared/styles';

export type StyleItem = EditingStyle & { own: boolean };

export type Step = 'queued' | 'uploading' | 'normalize' | 'transcribe' | 'faces' | 'autoedit' | 'cutout' | 'covers' | 'ready' | 'error';
export type AskMessage = { role: 'user' | 'claude' | 'error'; text: string; at: string; code?: string };
export type AskState = { running: boolean; activity: string | null; messages: AskMessage[] };
export type CoverCandidateItem = { t: number; file: string; score: number; url: string };
export type CoversState = {
  candidates: CoverCandidateItem[];
  story: string | null;
  grid: string | null;
  rendering: boolean;
  error: string | null;
};
export type Status = { step: Step; progress: number; message?: string; code?: string; position?: number };

export type ProjectSummary = { slug: string; title: string; createdAt: string; status: Status; parent?: string | null };
export type RenderInfo = { file: string; createdAt: string; url: string };
export type ProjectDetail = {
  slug: string;
  status: Status;
  edit: Edit | null;
  words: Word[];
  faces: FaceSample[];
  hasCutout: boolean;
  editVersion: number;
  renders: RenderInfo[];
  summary?: { pausesCut?: number; secondsSaved?: number; hook?: boolean | string | null; effects?: number } | null;
  range?: { start: number; end: number } | null;
  parent?: string | null;
};
export type Problem = { code: string; text: string; detail?: string; effectId?: string };
export type HistoryItem = { id: string; at: string; effects: number; seconds: number; by: 'page' | 'claude' | 'auto' };
export type RenderState = { running: boolean; progress: number; file?: string; url?: string; error?: string; code?: string; stage?: string; editChangedSince?: boolean };
export type Variant = 'instagram' | 'tiktok';
export type FileItem = { file: string; url: string };
export type SfxItem = { name: string; url: string };

export class ServerDownError extends Error {}
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown> | null,
    msg: string,
  ) {
    super(msg);
  }
}

// Every failed network call (not an HTTP error) means the local server is not reachable.
const listeners = new Set<(down: boolean) => void>();
export const onServerState = (fn: (down: boolean) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const report = (down: boolean) => listeners.forEach((fn) => fn(down));

async function req<T>(method: string, url: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'DELETE' ? { 'x-confirm': 'yes' } : {}),
        ...(extra ?? {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    report(true);
    throw new ServerDownError('server down');
  }
  // A proxy (vite dev) answers 502/504 when the real server is down.
  if (res.status === 502 || res.status === 504) {
    report(true);
    throw new ServerDownError('server down');
  }
  report(false);
  if (!res.ok) {
    let msg = `${res.status}`;
    let j: Record<string, unknown> | null = null;
    try {
      j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, j, msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const enc = encodeURIComponent;

export const api = {
  projects: () => req<ProjectSummary[]>('GET', '/api/projects'),
  project: (slug: string) => req<ProjectDetail>('GET', `/api/projects/${enc(slug)}`),
  version: (slug: string) => req<{ editVersion: number; status: Status }>('GET', `/api/projects/${enc(slug)}/version`),
  saveEdit: (slug: string, edit: Edit, baseVersion: number) =>
    req<{ editVersion: number }>('PUT', `/api/projects/${enc(slug)}/edit`, edit, { 'x-base-version': String(baseVersion) }),
  findCovers: (slug: string) => req<{ ok: boolean }>('POST', `/api/projects/${enc(slug)}/covers/find`, {}),
  covers: (slug: string) => req<CoversState>('GET', `/api/projects/${enc(slug)}/covers`),
  renderCover: (slug: string) => req<unknown>('POST', `/api/projects/${enc(slug)}/covers/render`, {}),
  autoedit: (slug: string, pauseGap?: number) =>
    req<{ editVersion: number }>('POST', `/api/projects/${enc(slug)}/autoedit`, { pauseGap }),
  cutout: (slug: string) => req<unknown>('POST', `/api/projects/${enc(slug)}/cutout`, {}),
  startRender: (slug: string, variant: Variant = 'instagram') => req<{ ok: boolean }>('POST', `/api/projects/${enc(slug)}/render`, { variant }),
  renderState: (slug: string, variant: Variant = 'instagram') =>
    req<RenderState>('GET', `/api/projects/${enc(slug)}/render${variant === 'tiktok' ? '?variant=tiktok' : ''}`),
  split: (slug: string) => req<{ slugs: string[] }>('POST', `/api/projects/${enc(slug)}/split`, {}),
  styles: () => req<{ styles: StyleItem[]; defaultStyle: string }>('GET', '/api/styles'),
  applyStyle: (slug: string, id: string) => req<{ editVersion: number }>('POST', `/api/projects/${enc(slug)}/style`, { id }),
  saveStyle: (name: string, slug: string) => req<{ id: string }>('POST', '/api/styles', { name, slug }),
  deleteStyle: (id: string) => req<unknown>('DELETE', `/api/styles/${enc(id)}`),
  setDefaultStyle: (id: string) => req<unknown>('PUT', '/api/styles/default', { id }),
  ask: (slug: string) => req<AskState>('GET', `/api/projects/${enc(slug)}/ask`),
  askSend: (slug: string, message: string) => req<{ ok: boolean }>('POST', `/api/projects/${enc(slug)}/ask`, { message }),
  askStop: (slug: string) => req<{ ok: boolean }>('POST', `/api/projects/${enc(slug)}/ask/stop`, {}),
  askClear: (slug: string) => req<unknown>('DELETE', `/api/projects/${enc(slug)}/ask`),
  history: (slug: string) => req<HistoryItem[]>('GET', `/api/projects/${enc(slug)}/history`),
  restore: (slug: string, id: string) => req<{ editVersion: number }>('POST', `/api/projects/${enc(slug)}/history/${enc(id)}/restore`, {}),
  problems: (slug: string) => req<{ problems: Problem[] }>('GET', `/api/projects/${enc(slug)}/problems`),
  reveal: (slug: string, file: string) => req<unknown>('POST', `/api/projects/${enc(slug)}/reveal`, { file }),
  rename: (slug: string, title: string) => req<unknown>('PATCH', `/api/projects/${enc(slug)}`, { title }),
  deleteProject: (slug: string) => req<unknown>('DELETE', `/api/projects/${enc(slug)}`),
  reanalyse: (slug: string) => req<unknown>('POST', `/api/projects/${enc(slug)}/reanalyse`, {}),
  board: () => req<FileItem[]>('GET', '/api/board'),
  deleteBoard: (file: string) => req<unknown>('DELETE', `/api/board/${enc(file)}`),
  music: () => req<FileItem[]>('GET', '/api/music'),
  sfx: () => req<SfxItem[]>('GET', '/api/sfx'),
};

// Multipart upload with progress. Uses XMLHttpRequest because fetch cannot report upload progress.
export function upload<T>(
  url: string,
  field: string,
  files: File[],
  onProgress?: (p: number) => void,
  headers?: Record<string, string>,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) fd.append(field, f, f.name);
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        report(false);
        try {
          resolve((xhr.responseText ? JSON.parse(xhr.responseText) : {}) as T);
        } catch {
          resolve({} as T);
        }
      } else {
        if (xhr.status === 502 || xhr.status === 504) report(true);
        const err = new Error(`${xhr.status}`) as Error & { code?: string; serverText?: string };
        try {
          const j = JSON.parse(xhr.responseText);
          err.code = j?.code;
          err.serverText = j?.error;
        } catch {
          /* not JSON */
        }
        reject(err);
      }
    };
    xhr.onerror = () => {
      report(true);
      reject(new ServerDownError('server down'));
    };
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

export const mediaUrls = (slug: string) => {
  const o = location.origin;
  return {
    video: `${o}/media/${enc(slug)}/proxy.mp4`,
    cutout: `${o}/media/${enc(slug)}/cutout.webm`,
    board: `${o}/board/`,
    sfx: `${o}/sfx/`,
    music: `${o}/music/`,
  };
};
