// Job queues and child processes. One queue analyses new videos (one at a time, in order); a second
// queue runs the heavy jobs (cut-out, cover frames, cover stills, render), also one at a time, so
// 2 or 3 videos dropped in a row do not make the Mac swap.
import type { ChildProcess } from 'node:child_process';

export type JobKind = 'analyse' | 'cutout' | 'covers' | 'cover-stills' | 'render';
export type Job = { slug: string; kind: JobKind; run: () => Promise<void>; onPosition?: (position: number) => void };

export class JobQueue {
  waiting: Job[] = [];
  active: Job | null = null;
  constructor(public name: string) {}

  has = (slug: string, kind?: JobKind) =>
    [this.active, ...this.waiting].some((j) => j && j.slug === slug && (!kind || j.kind === kind));
  isActive = (slug: string, kind?: JobKind) => !!this.active && this.active.slug === slug && (!kind || this.active.kind === kind);
  position = (slug: string, kind?: JobKind) => {
    const i = this.waiting.findIndex((j) => j.slug === slug && (!kind || j.kind === kind));
    return i < 0 ? 0 : i + 1;
  };

  push(job: Job) {
    this.waiting.push(job);
    this.report();
    void this.pump();
  }

  // Removes waiting jobs of a reel (not the one running). Returns how many were removed.
  drop(slug: string) {
    const n = this.waiting.length;
    this.waiting = this.waiting.filter((j) => j.slug !== slug);
    this.report();
    return n - this.waiting.length;
  }

  private report() {
    this.waiting.forEach((j, i) => {
      try {
        j.onPosition?.(i + 1);
      } catch {
        /* the reel may be gone */
      }
    });
  }

  private async pump() {
    if (this.active || !this.waiting.length) return;
    const job = this.waiting.shift()!;
    this.active = job;
    this.report();
    try {
      await job.run();
    } catch (e) {
      console.error(`[${this.name}] ${job.kind} ${job.slug} failed:`, e);
    } finally {
      this.active = null;
      void this.pump();
    }
  }
}

// Every child process we start, so they can be stopped with the server (no orphans writing files).
export const children = new Set<ChildProcess>();
export const track = <T extends ChildProcess>(c: T): T => {
  children.add(c);
  c.once('exit', () => children.delete(c));
  c.once('error', () => children.delete(c));
  return c;
};
export const killAll = (signal: NodeJS.Signals = 'SIGTERM') => {
  for (const c of children) {
    try {
      // Tools run in their own process group (detached), so their ffmpeg children stop too.
      if (c.pid) process.kill(-c.pid, signal);
      else c.kill(signal);
    } catch {
      try {
        c.kill(signal);
      } catch {
        /* already gone */
      }
    }
  }
};
