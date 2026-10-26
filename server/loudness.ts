// Two-pass loudness normalisation to the Instagram/TikTok level (-14 LUFS, true peak -1.5 dB).
// Pass 1 measures, pass 2 applies the measured values in linear mode. Video is copied unchanged.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { track } from './jobs';

export const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 };

const ffmpeg = (args: string[]) =>
  new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const p = track(spawn('ffmpeg', ['-hide_banner', '-nostdin', ...args]));
    let stderr = '';
    p.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-20000);
    });
    p.on('error', (e) => resolve({ code: -1, stderr: e.message }));
    p.on('close', (code) => resolve({ code, stderr }));
  });

type Measured = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

export const measureLoudness = async (file: string): Promise<Measured> => {
  const { I, TP, LRA } = LOUDNESS;
  const r = await ffmpeg(['-i', file, '-vn', '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']);
  const m = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (r.code !== 0 || !m) throw new Error(`loudness measure failed (exit ${r.code}): ${r.stderr.slice(-500)}`);
  return JSON.parse(m[0]) as Measured;
};

// Normalises `input` and writes `output` (a temp path; the caller renames). Returns a log line.
export const normalizeLoudness = async (input: string, output: string): Promise<string> => {
  const m = await measureLoudness(input);
  const inI = Number(m.input_i);
  if (!Number.isFinite(inI) || inI < -60) {
    // Silence (or nearly): nothing to normalise.
    fs.copyFileSync(input, output);
    return `loudnorm skipped: input ${m.input_i} LUFS`;
  }
  const { I, TP, LRA } = LOUDNESS;
  const af =
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
    `:offset=${m.target_offset}:linear=true:print_format=summary`;
  const r = await ffmpeg(['-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-f', 'mp4', output]);
  if (r.code !== 0) {
    fs.rmSync(output, { force: true });
    throw new Error(`loudness apply failed (exit ${r.code}): ${r.stderr.slice(-500)}`);
  }
  return `loudnorm: input ${m.input_i} LUFS, TP ${m.input_tp}, LRA ${m.input_lra} -> target ${I} LUFS`;
};
