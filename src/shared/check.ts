// The checks for an edit, shared by `npm run check` (for Claude) and GET /api/projects/:slug/problems
// (for the page, before "Make the video"). Each problem has a plain sentence for her and a technical
// detail for Claude.
import { HOOK_FONTS, LONG_KINDS, NEEDS_CUTOUT, SFX_NAMES, SUBTITLE_FONTS, type Edit, type Word } from './types';
import { sourceToOutput } from './time';
import { isLong, outputChapters } from './long';

export type Problem = {
  code: 'empty' | 'bad_long' | 'bad_segment' | 'bad_style' | 'music_missing' | 'picture_missing' | 'text_missing' | 'items_missing' | 'bad_effect' | 'cutout_missing' | 'bad_cover' | 'bad_fix';
  text: string; // plain words, for Paulina
  detail: string; // technical, for Claude
  effectId?: string;
};

export const KINDS = [
  'picture', 'label', 'zoom', 'glass', 'behind', 'chapter', 'checklist', 'flash', 'phone', 'emoji',
  'framebreak', 'papercut', 'vertigo', 'pullback', 'greenscreen', 'cover', 'zoomthrough', 'orbit', 'doodle', 'ui', 'chart',
];
// Plain names for her, used in problem sentences.
const NICE: Record<string, string> = {
  behind: 'Text behind me',
  framebreak: 'Frame break',
  papercut: 'Paper cut',
  vertigo: 'Vertigo',
  greenscreen: 'Green screen',
};
// "Label: 42" -> number; null when the line has no number.
export const chartValue = (item: string) => {
  const m = item.match(/(-?\d+(?:[.,]\d+)?)\s*%?\s*$/);
  return m ? Number(m[1].replace(',', '.')) : null;
};
export const POSITIONS = ['auto', 'top', 'bottom', 'left', 'right', 'above-head', 'center'];

export const checkEdit = (
  edit: Edit,
  ctx: { words: Word[]; board: Set<string>; music: Set<string>; hasCutout: boolean },
): Problem[] => {
  const out: Problem[] = [];
  const add = (p: Problem) => out.push(p);
  if (edit.version !== 1) add({ code: 'bad_segment', text: 'This reel file is damaged.', detail: 'version must be 1' });
  const dur = edit.source?.duration ?? 0;
  let prev = -1;
  for (const [i, s] of (edit.segments ?? []).entries()) {
    if (!(s.end > s.start)) add({ code: 'bad_segment', text: 'One cut part is broken.', detail: `segment ${i}: end must be after start` });
    if (s.start < prev - 1e-6) add({ code: 'bad_segment', text: 'Two cut parts overlap.', detail: `segment ${i}: segments must be in order and not overlap` });
    if (s.end > dur + 0.05) add({ code: 'bad_segment', text: 'A cut part goes past the end of the video.', detail: `segment ${i}: ends after the video (${dur.toFixed(2)} s)` });
    prev = s.end;
  }
  if (!edit.segments?.length) add({ code: 'empty', text: 'Everything is cut, so the video would be empty.', detail: 'no segments' });
  if (!HOOK_FONTS.includes(edit.style?.hookFont)) add({ code: 'bad_style', text: 'The hook font is unknown.', detail: `style.hookFont must be one of: ${HOOK_FONTS.join(', ')}` });
  if (!SUBTITLE_FONTS.includes(edit.style?.subtitleFont)) add({ code: 'bad_style', text: 'The subtitle font is unknown.', detail: `style.subtitleFont must be one of: ${SUBTITLE_FONTS.join(', ')}` });
  if (!SFX_NAMES.includes(edit.sound?.defaultSfx)) add({ code: 'bad_style', text: 'The sound effect is unknown.', detail: `sound.defaultSfx must be one of: ${SFX_NAMES.join(', ')}` });
  if (edit.sound?.music && !ctx.music.has(edit.sound.music))
    add({ code: 'music_missing', text: `The music "${edit.sound.music}" is missing. Add it again or pick other music.`, detail: `music file not found in assets/music: ${edit.sound.music}` });
  const ids = new Set<string>();
  for (const e of edit.effects ?? []) {
    const name = `effect ${e.id} (${e.kind}${e.word ? `, "${e.word}"` : ''})`;
    const on = e.word ? ` on "${e.word}"` : '';
    if (!e.id || ids.has(e.id)) add({ code: 'bad_effect', text: `An effect${on} is broken.`, detail: `${name}: id missing or used twice`, effectId: e.id });
    ids.add(e.id);
    if (!KINDS.includes(e.kind)) add({ code: 'bad_effect', text: `An effect${on} is of an unknown kind.`, detail: `${name}: unknown kind. Use one of: ${KINDS.join(', ')}`, effectId: e.id });
    if (!(e.duration > 0)) add({ code: 'bad_effect', text: `An effect${on} has no length.`, detail: `${name}: duration must be more than 0`, effectId: e.id });
    if (sourceToOutput(e.at, edit.segments) === null) add({ code: 'bad_effect', text: `An effect${on} is after the end, so it will not show.`, detail: `${name}: at=${e.at} is after the end of the edit`, effectId: e.id });
    else if (!edit.segments.some((s) => e.at >= s.start - 0.05 && e.at <= s.end))
      add({ code: 'bad_effect', text: `An effect${on} sits on a cut word, so it shows a bit later.`, detail: `${name}: at=${e.at} is inside a cut part, so it starts at the next kept part`, effectId: e.id });
    if (['framebreak', 'papercut', 'orbit'].includes(e.kind) && e.image && !ctx.board.has(e.image)) // optional picture
      add({ code: 'picture_missing', text: `The picture "${e.image}"${on} is missing. Pick another one.`, detail: `${name}: picture "${e.image}" is not in board/`, effectId: e.id });
    // greenscreen without a picture = a cream studio backdrop (fine); a missing picture is a problem.
    if (e.kind === 'greenscreen' && e.image && !ctx.board.has(e.image))
      add({ code: 'picture_missing', text: `The background picture "${e.image}"${on} is missing. Pick another one.`, detail: `${name}: image "${e.image}" is not in board/`, effectId: e.id });
    if (e.kind === 'chart' && (e.items ?? []).filter((x) => chartValue(x) !== null).length < 2)
      add({ code: 'items_missing', text: `The chart${on} needs at least 2 bars with a number, like "Wrzesień: 4".`, detail: `${name}: items must be "Label: number", at least 2`, effectId: e.id });
    if (e.kind === 'orbit' && !(e.items ?? []).some((x) => x.trim()) && !e.image)
      add({ code: 'items_missing', text: `The orbit${on} needs words or a picture to circle around you.`, detail: `${name}: needs items or image`, effectId: e.id });
    if ((e.kind === 'picture' || e.kind === 'phone') && (!e.image || !ctx.board.has(e.image)))
      add({ code: 'picture_missing', text: e.image ? `The picture "${e.image}"${on} is missing. Pick another one.` : `The picture effect${on} has no picture yet.`, detail: `${name}: picture "${e.image}" is not in board/`, effectId: e.id });
    if (['label', 'glass', 'behind', 'chapter', 'emoji'].includes(e.kind) && !e.text) add({ code: 'text_missing', text: `An effect${on} has no text.`, detail: `${name}: needs text`, effectId: e.id });
    if (e.kind === 'checklist' && !e.items?.length) add({ code: 'items_missing', text: `The list${on} is empty.`, detail: `${name}: needs items`, effectId: e.id });
    if (e.position && !POSITIONS.includes(e.position)) add({ code: 'bad_effect', text: `An effect${on} has an unknown place.`, detail: `${name}: position must be one of: ${POSITIONS.join(', ')}`, effectId: e.id });
    if (e.sfx && e.sfx !== 'none' && e.sfx !== 'default' && !SFX_NAMES.includes(e.sfx)) add({ code: 'bad_effect', text: `An effect${on} has an unknown sound.`, detail: `${name}: unknown sound "${e.sfx}"`, effectId: e.id });
    if (NEEDS_CUTOUT.includes(e.kind) && !ctx.hasCutout)
      add({ code: 'cutout_missing', text: `"${NICE[e.kind] ?? e.kind}"${on} needs the cut-out first. It is made once, in a few minutes.`, detail: `${name}: needs the person cut-out (POST /api/projects/<slug>/cutout)`, effectId: e.id });
  }
  if (edit.cover) {
    if (!['top', 'center', 'bottom', 'none'].includes(edit.cover.layout)) add({ code: 'bad_cover', text: 'The cover title place is unknown.', detail: 'cover.layout must be top, center, bottom or none' });
    if (!(edit.cover.t >= 0 && edit.cover.t <= dur)) add({ code: 'bad_cover', text: 'The cover frame is outside the video.', detail: `cover.t must be inside the video (0..${dur.toFixed(1)} s)` });
  }
  for (const k of Object.keys(edit.wordFixes ?? {}))
    if (!ctx.words[Number(k)]) add({ code: 'bad_fix', text: 'A word fix points to a word that is not there.', detail: `wordFixes: no word number ${k}` });
  if (isLong(edit)) {
    const L = edit.long;
    if (!L) add({ code: 'bad_long', text: 'The YouTube settings are missing.', detail: 'format "long" needs edit.long (LongSettings)' });
    for (const e of edit.effects ?? [])
      if (!LONG_KINDS.includes(e.kind)) add({ code: 'bad_long', text: `"${NICE[e.kind] ?? e.kind}" is not shown in a YouTube video.`, detail: `effect ${e.id}: a long video shows only ${LONG_KINDS.join(', ')}`, effectId: e.id });
    for (const c of L?.chapters ?? [])
      if (!(c.at >= 0 && c.at <= dur) || !c.title?.trim()) add({ code: 'bad_long', text: 'A chapter has no title or is outside the video.', detail: `long.chapters: at=${c.at} must be 0..${dur.toFixed(1)} with a title` });
    if (L && L.chapters.length && outputChapters(edit).length < 3)
      add({ code: 'bad_long', text: 'YouTube shows chapters only when there are 3 or more, each 10 seconds or longer.', detail: 'long.chapters: fewer than 3 valid chapters after the cuts (first is moved to 0:00, ones under 10 s apart are dropped)' });
    if (L?.nameTag && (!L.nameTag.name?.trim() || !(L.nameTag.at >= 0 && L.nameTag.at <= dur)))
      add({ code: 'bad_long', text: 'The name tag has no name or is outside the video.', detail: 'long.nameTag needs name and at inside the video' });
    if (L?.thumbnail && !(L.thumbnail.t >= 0 && L.thumbnail.t <= dur)) add({ code: 'bad_long', text: 'The thumbnail frame is outside the video.', detail: `long.thumbnail.t must be 0..${dur.toFixed(1)}` });
    if ((L?.title?.length ?? 0) > 100) add({ code: 'bad_long', text: 'The YouTube title is longer than 100 characters.', detail: 'long.title max 100 characters' });
  }
  return out;
};
