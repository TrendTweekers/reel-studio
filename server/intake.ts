// Files she adds to the board (pictures) and to the music folder. Names are NFC (macOS drags give
// decomposed letters), dotfiles are refused, a clash gets "-2", and iPhone HEIC photos become JPEG.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { track } from './jobs';

export const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
export const AUDIO = /\.(mp3|wav|m4a|aac|ogg)$/i;
const HEIC = /\.(heic|heif)$/i;

export const cleanName = (raw: string) =>
  raw
    .normalize('NFC')
    .replace(/[/\\:\u0000-\u001f]/g, '_')
    .trim();

// A free name in `dir`: "name.jpg", else "name-2.jpg", "name-3.jpg" ...
export const freeName = (dir: string, name: string) => {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let out = name;
  for (let i = 2; fs.existsSync(path.join(dir, out)); i++) out = `${base}-${i}${ext}`;
  return out;
};

const run = (cmd: string, args: string[]) =>
  new Promise<boolean>((resolve) => {
    const p = track(spawn(cmd, args, { stdio: 'ignore' }));
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });

// HEIC/HEIF -> JPEG. macOS has sips; elsewhere try ffmpeg.
const toJpeg = async (input: string, output: string) => {
  if (process.platform === 'darwin' && (await run('sips', ['-s', 'format', 'jpeg', input, '--out', output])) && fs.existsSync(output)) return true;
  fs.rmSync(output, { force: true });
  if ((await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', input, '-frames:v', '1', '-q:v', '2', output])) && fs.existsSync(output)) return true;
  fs.rmSync(output, { force: true });
  return false;
};

export type IntakeResult = { saved: string[]; rejected: { file: string; reason: string }[] };

// Moves uploaded temp files into `target`. kind decides which types are allowed.
export const intake = async (files: { path: string; originalname: string }[], target: string, kind: 'image' | 'audio'): Promise<IntakeResult> => {
  const out: IntakeResult = { saved: [], rejected: [] };
  for (const f of files) {
    const name = cleanName(Buffer.from(f.originalname, 'latin1').toString('utf8'));
    try {
      if (!name || name.startsWith('.')) {
        out.rejected.push({ file: name, reason: 'Hidden files are not allowed.' });
        continue;
      }
      if (kind === 'image' && HEIC.test(name)) {
        const jpg = freeName(target, name.replace(HEIC, '.jpg'));
        if (await toJpeg(f.path, path.join(target, jpg))) out.saved.push(jpg);
        else out.rejected.push({ file: name, reason: 'This iPhone photo (HEIC) could not be opened. Save it as JPEG and try again.' });
        continue;
      }
      const ok = kind === 'image' ? IMAGE.test(name) : AUDIO.test(name);
      if (!ok) {
        out.rejected.push({
          file: name,
          reason: kind === 'image' ? 'This is not a picture. Use JPG, PNG, WEBP, GIF or HEIC.' : 'This is not music. Use MP3, WAV, M4A, AAC or OGG.',
        });
        continue;
      }
      const final = freeName(target, name);
      fs.renameSync(f.path, path.join(target, final));
      out.saved.push(final);
    } finally {
      fs.rmSync(f.path, { force: true });
    }
  }
  return out;
};
