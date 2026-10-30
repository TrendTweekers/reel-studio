// Small platform layer: macOS and Linux keep their old behaviour, Windows gets its own paths,
// process control and "open" commands. Used by the server, the MCP connector and the scripts.
import { spawn, spawnSync, type ChildProcess, type SpawnOptions, type SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

// The python inside a venv folder (.venv, .venv-tts).
export const venvPython = (venvDir: string) => (IS_WIN ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python'));

// Python on Windows writes cp1252 to pipes and reads files as cp1252 unless told otherwise.
if (IS_WIN) process.env.PYTHONUTF8 ??= '1';
// Our tools end themselves when this process is gone (tools/_common.py); the venv's python.exe is a
// launcher in between, so they are told which process to watch.
if (IS_WIN) process.env.REEL_PARENT_PID = String(process.pid);

// Windows: ffmpeg from winget/gyan may not be on the PATH a shortcut or Claude Desktop gives us.
// FFMPEG_BIN_DIR goes first; the usual install folders go last, so PATH still wins. No-op elsewhere.
export const addWinFfmpegToPath = () => {
  if (!IS_WIN) return;
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path';
  const parts = (process.env[key] ?? '').split(path.delimiter).filter(Boolean);
  const ok = (d?: string): d is string => !!d && fs.existsSync(d) && !parts.includes(d);
  const first = [process.env.FFMPEG_BIN_DIR].filter(ok);
  const last = [path.join(local, 'Microsoft', 'WinGet', 'Links'), path.join(pf, 'ffmpeg', 'bin'), 'C:\\ffmpeg\\bin'].filter(ok);
  process.env[key] = [...first, ...parts, ...last].join(path.delimiter);
};

// Claude Code: the native installer puts it in ~/.local/bin (claude.exe on Windows, also on PATH);
// npm puts a claude.cmd shim on PATH. A .cmd cannot be spawned without a shell, so it is resolved to what it runs.
export type Cmd = { cmd: string; pre: string[]; shell: boolean };
const onPath = (names: string[]) => {
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(d, n);
      if (d && fs.existsSync(p)) return p;
    }
  }
  return null;
};
const fromCmdShim = (shim: string): Cmd | null => {
  try {
    const text = fs.readFileSync(shim, 'utf8');
    const m = text.match(/"%dp0%\\([^"]+\.(exe|js|cjs|mjs))"/i);
    if (!m) return null;
    const target = path.join(path.dirname(shim), m[1]);
    if (!fs.existsSync(target)) return null;
    return m[2].toLowerCase() === 'exe' ? { cmd: target, pre: [], shell: false } : { cmd: process.execPath, pre: [target], shell: false };
  } catch {
    return null;
  }
};
export const claudeCommand = (): Cmd => {
  const env = process.env.CLAUDE_BIN;
  const pick = (p: string): Cmd => (IS_WIN && /\.(cmd|bat)$/i.test(p) ? (fromCmdShim(p) ?? { cmd: p, pre: [], shell: true }) : { cmd: p, pre: [], shell: false });
  if (env) return pick(env);
  // Windows: the same one `claude` in a terminal runs (PATH order). A left-over native install in
  // ~/.local/bin can be months old and logged out while the npm one on PATH works.
  if (IS_WIN) {
    const found = onPath(['claude.exe', 'claude.cmd']);
    if (found) return pick(found);
  }
  const home = path.join(os.homedir(), '.local', 'bin', IS_WIN ? 'claude.exe' : 'claude');
  if (fs.existsSync(home)) return { cmd: home, pre: [], shell: false };
  return { cmd: 'claude', pre: [], shell: false };
};
// cmd.exe quoting for the last-resort shell spawn of a .cmd we could not resolve.
const winQuote = (a: string) => (/^[\w.:\\/=-]+$/.test(a) ? a : `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1').replace(/%/g, '"%"')}"`);
export const spawnCmd = (c: Cmd, args: string[], opts: SpawnOptions = {}) =>
  c.shell
    ? spawn([c.cmd, ...c.pre, ...args].map(winQuote).join(' '), { ...opts, shell: true, windowsHide: true })
    : spawn(c.cmd, [...c.pre, ...args], { ...opts, windowsHide: true });
export const runCmdSync = (c: Cmd, args: string[], timeout: number) => {
  const r = c.shell
    ? spawnSync([c.cmd, ...c.pre, ...args].map(winQuote).join(' '), { shell: true, encoding: 'utf8', timeout, windowsHide: true })
    : spawnSync(c.cmd, [...c.pre, ...args], { encoding: 'utf8', timeout, windowsHide: true });
  if (r.error || r.status !== 0) throw r.error ?? new Error(`exit ${r.status}`);
  return r.stdout;
};

// A child that may start children of its own (python -> ffmpeg). On macOS/Linux it gets its own
// process group, so killTree stops the whole group. Windows has no groups: taskkill /t does it.
export const spawnGroup = (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio = {}) => spawn(cmd, args, { ...opts, detached: !IS_WIN, windowsHide: true });

export const killTree = (c: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') => {
  if (!c.pid || c.exitCode !== null || c.signalCode !== null) return;
  if (IS_WIN) {
    // Sync, so it also finishes while the server is exiting. /f because Windows has no SIGTERM.
    spawnSync('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-c.pid, signal);
  } catch {
    // Not a group leader (spawned without detached): stop just the child.
    try {
      c.kill(signal);
    } catch {
      /* already gone */
    }
  }
};

// Open a URL or file with the default app; show a file in the file manager.
const quiet = (cmd: string, args: string[], verbatim = false) =>
  new Promise<boolean>((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: verbatim });
    p.on('error', () => resolve(false));
    // explorer.exe exits 1 even when it worked, so on Windows "it started" is the answer.
    if (IS_WIN) p.on('spawn', () => resolve(true));
    else p.on('close', (code) => resolve(code === 0));
  });
// Linux: false, as before (no desktop on her machines; the caller shows the path instead).
export const openTarget = (target: string) => {
  if (IS_MAC) return quiet('open', [target]);
  // No cmd.exe "start": its quoting breaks on & and % in URLs and file names.
  if (IS_WIN) return quiet('rundll32.exe', ['url.dll,FileProtocolHandler', target]);
  return Promise.resolve(false);
};
export const revealFile = (abs: string) => {
  if (IS_MAC) return quiet('open', ['-R', abs]);
  // explorer only understands /select,"path" with the quotes after the comma: pass it verbatim.
  if (IS_WIN) return quiet('explorer.exe', [fs.statSync(abs).isDirectory() ? `"${abs}"` : `/select,"${abs}"`], true);
  return Promise.resolve(false);
};
export const CAN_REVEAL = IS_MAC || IS_WIN;

// A file that should appear in two reels. Symlinks need admin rights on Windows, so there it is
// a hard link (same disk) or, failing that, a copy. relTarget is relative to the link's folder.
export const linkFile = (relTarget: string, linkPath: string) => {
  if (!IS_WIN) {
    fs.symlinkSync(relTarget, linkPath);
    return;
  }
  const abs = path.resolve(path.dirname(linkPath), relTarget);
  try {
    fs.linkSync(abs, linkPath);
  } catch {
    fs.copyFileSync(abs, linkPath);
  }
};
