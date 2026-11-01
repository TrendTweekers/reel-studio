// "The builder is not the judge": after a video is made, a FRESH Claude (no --resume, not the Ask
// chat that edited the reel) looks at the contact sheet and the measured numbers and grades it
// against a fixed list. It may only Read (to open the sheet). It answers JSON only.
// Runs on her subscription through Claude Code, never an API key.
import fs from 'node:fs';
import path from 'node:path';
import { claudeCommand, killTree, spawnCmd } from './platform';
import { track } from './jobs';
import type { CheckReport } from './videocheck';
import { FPS, type ReelProps } from '../src/shared/types';
import { isStory, timedScenes } from '../src/shared/story';
import { isLong } from '../src/shared/long';

export type Issue = { time: string; problem: string; fix: string };
export type Verdict = { verdict: 'ship' | 'fix'; score: number; issues: Issue[]; summary: string; file: string; at: string; ms: number };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// out/check/<render name without .mp4>.verdict.json, next to the sheet jpg of the same render.
export const verdictFile = (checkDir: string, renderFile: string) => path.join(checkDir, `${path.basename(renderFile, '.mp4')}.verdict.json`);

// The facts a picture cannot tell: hook, end card, cut lengths, scenes.
const facts = (props: ReelProps) => {
  const e = props.edit;
  const out: string[] = [];
  if (e.hook) out.push(`Hook text (shown 0:00-${mmss(e.hook.until)}): "${e.hook.text}"${e.hook.accent ? ` + accent line "${e.hook.accent}"` : ''}.`);
  else if (!isLong(e)) out.push('There is no hook text.');
  if (e.endCard?.enabled) out.push(`End card (the last ${e.endCard.seconds} s): line "${e.endCard.line}", keyword "${e.endCard.keyword}"${e.endCard.sub ? `, sub "${e.endCard.sub}"` : ''}${e.endCard.image ? `, picture ${e.endCard.image}` : ', no picture'}.`);
  else out.push('No end card.');
  // Output length of every kept part: a cut under 0.4 s feels like a glitch.
  let t = 0;
  const fast: string[] = [];
  for (const s of e.segments ?? []) {
    const d = s.end - s.start;
    if (d < 0.4) fast.push(`${mmss(t)} (${d.toFixed(2)} s)`);
    t += d;
  }
  out.push(`Video length ${t.toFixed(1)} s in ${e.segments?.length ?? 0} kept parts. Parts shorter than 0.4 s: ${fast.length ? fast.join(', ') : 'none'}.`);
  out.push(`Subtitles: ${e.style?.subtitleStyle ?? '?'}, ${e.style?.subtitlePosition ?? '?'}.`);
  if (isStory(e)) {
    const sc = timedScenes(e);
    out.push(`Story video, ${sc.length} scenes: ${sc.map((s) => `${mmss(s.from / FPS)} ${s.kind}${s.text ? ` "${s.text.slice(0, 50)}"` : ''}${s.items?.length ? ` [${s.items.length} items]` : ''}${s.image ? ` (${s.image})` : ''}`).join('; ')}.`);
  } else {
    const fx = e.effects ?? [];
    out.push(`Effects: ${fx.length ? fx.map((x) => `${x.kind}${x.word ? ` on "${x.word}"` : ''} at source ${x.at.toFixed(1)} s for ${x.duration} s`).join('; ') : 'none'}.`);
  }
  return out;
};

export const criticPrompt = (r: CheckReport, props: ReelProps, language: 'pl' | 'en') =>
  [
    'You are a strict video critic. You did NOT make this video and you do not change it. You grade it before it is posted to Instagram.',
    `Open the contact sheet with the Read tool: ${r.sheet}. It has 12 frames, 4 per row, left to right, top to bottom, at ${r.times.map(mmss).join(', ')}.`,
    `Facts from the edit:\n${facts(props).join('\n')}`,
    `Measured on the finished file: ${r.findings.length ? r.findings.join(' ') : 'no automatic findings.'} Loudness ${r.loudness.lufs ?? '?'} LUFS (target about -14), peak ${r.loudness.peak ?? '?'} dBFS.`,
    [
      'Check EVERY item, one by one:',
      '1. Face: the face is clear and never covered by text, stickers or cards.',
      '2. Text: every text is readable (size, contrast) and fully inside the frame, nothing cut off at the edges.',
      '3. Effects: never two big effects on screen at the same time.',
      '4. Subtitles: never over the face.',
      '5. Hook: readable in the first frames, short enough to read in its time.',
      '6. End card: shows the right line and keyword, nothing missing or broken.',
      '7. Picture: not too dark and not washed out.',
      '8. Loudness: about -14 LUFS, not quiet, not clipping.',
      '9. Pacing: no cut faster than 0.4 s, no long dead moment.',
      '10. Story scenes (only if it is a story video): every text fits its scene, no empty scene.',
    ].join('\n'),
    'Only report problems you can see on the sheet or in the facts above. Do not invent problems. If an item is fine, do not list it.',
    'verdict "ship" = she can post it as it is (minor taste notes allowed); "fix" = at least one real problem. score 0-10 (10 = perfect). At most 6 issues, the worst first.',
    `"time" is m:ss in the video. "problem" and "fix" are short, plain words for a non-technical creator, in ${language === 'pl' ? 'Polish (informal "Ty")' : 'English'}. "fix" is an instruction another editor can apply in the edit, for example "Move the label on \\"płaszcz\\" to the right side" or "Shorten the hook to 6 words".`,
    `"summary" is ONE sentence in ${language === 'pl' ? 'Polish' : 'English'}.`,
    'Answer with ONLY this JSON, no other text, no code fence:',
    '{"verdict":"ship"|"fix","score":0-10,"issues":[{"time":"m:ss","problem":"...","fix":"..."}],"summary":"..."}',
  ].join('\n\n');

// The first {...} in the answer; clamp the fields so the page can trust them.
export const parseVerdict = (text: string): Omit<Verdict, 'file' | 'at' | 'ms'> => {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(`no JSON in the critic answer: ${text.slice(0, 200)}`);
  const j = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
  const issues = (Array.isArray(j.issues) ? j.issues : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && (x.problem || x.fix))
    .slice(0, 8)
    .map((x) => ({ time: String(x.time ?? '').slice(0, 8), problem: String(x.problem ?? '').slice(0, 300), fix: String(x.fix ?? '').slice(0, 400) }));
  const score = Math.max(0, Math.min(10, Math.round(Number(j.score) || 0)));
  const verdict = j.verdict === 'ship' ? 'ship' : 'fix';
  return { verdict, score, issues, summary: String(j.summary ?? '').slice(0, 400) };
};

// One fresh `claude -p` with only the Read tool.
export const runCritic = (report: CheckReport, props: ReelProps, opts: { cwd: string; language: 'pl' | 'en'; timeoutMs?: number }) =>
  new Promise<Verdict>((resolve, reject) => {
    const t0 = Date.now();
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // always her subscription, never API billing
    const args = [
      '-p', criticPrompt(report, props, opts.language),
      '--output-format', 'json',
      '--max-turns', '4',
      '--allowedTools', 'Read',
      '--disallowedTools', 'Bash', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'Skill', 'NotebookEdit',
    ];
    const p = track(spawnCmd(claudeCommand(), args, { cwd: opts.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }));
    let out = '';
    let err = '';
    const timer = setTimeout(() => killTree(p), opts.timeoutMs ?? 240_000);
    p.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    p.stderr?.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Claude could not start: ${e.message}`));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        if (r.is_error || typeof r.result !== 'string') throw new Error(r.result || r.subtype || 'no answer');
        resolve({ ...parseVerdict(r.result), file: report.file, at: new Date().toISOString(), ms: Date.now() - t0 });
      } catch (e) {
        reject(new Error(`the critic did not answer (exit ${code}): ${(e as Error).message} ${err.slice(-300)}`));
      }
    });
  });

export const saveVerdict = (checkDir: string, v: Verdict) => {
  fs.mkdirSync(checkDir, { recursive: true });
  fs.writeFileSync(verdictFile(checkDir, v.file), JSON.stringify(v, null, 2));
};

// The short line for her Ask chat (she still sees the result there).
export const verdictChat = (v: Verdict, language: 'pl' | 'en') => {
  const pl = language === 'pl';
  const head = v.verdict === 'ship' ? (pl ? `Sprawdziłem film: ${v.score}/10, możesz publikować.` : `I checked the video: ${v.score}/10, ready to post.`) : pl ? `Sprawdziłem film: ${v.score}/10, warto poprawić:` : `I checked the video: ${v.score}/10, worth fixing:`;
  const list = v.issues.slice(0, 5).map((i) => `• ${i.time} ${i.problem}`).join('\n');
  return [head, v.summary, list].filter(Boolean).join('\n');
};
