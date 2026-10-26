---
name: reel-edit
description: Change one of Paulina's reels in plain words. Use for any request about a reel's look, words, cuts, pictures, zooms, labels, hook, subtitles, music or sound effects, e.g. "add my coat photo when I say płaszcz", "make the subtitles smaller", "cut the part where I laugh", "more zoom", "change the hook".
---

# Edit a reel

The whole edit of a reel is `projects/<slug>/edit.json`. The editor page shows your change live.

## Steps

1. Find the reel. If she did not name it, use the newest: `npm run words` prints the newest
   project, every word with its times, and the effects already there. With a name or search word:
   `npm run words -- <slug> <word>`.
2. Read `src/shared/types.ts` if you are not sure of a field.
3. Change `edit.json` with the Edit tool (small, exact edits; keep everything else).
4. Run `npm run check -- <slug>`. Fix every problem it prints. Run it again until it says OK.
5. Tell her in one or two short sentences what changed, in her language. Ask her to look at the
   page. Offer the next step ("Shall I make the video now?").

## How to do common requests

- "Picture of X when I say Y": find word Y with `npm run words -- <slug> Y`. Use its `at(source)`
  as `at`. Look in `board/` for a fitting file name (ls board). If none fits, ask her which picture,
  or to add one to the board on the page. Effect: `{"id":"<new short id>","kind":"picture","at":<t>,
  "duration":1.6,"word":"Y","image":"<file>","position":"auto","sfx":"default"}`.
- Label / glass text / text behind me / chapter / emoji: same, with `"text"`. "behind" needs the
  person cut-out: if `projects/<slug>/cutout.webm` is missing, start it with
  `curl -s -X POST http://localhost:8787/api/projects/<slug>/cutout` and tell her it takes a few minutes.
- Zoom on a word: `{"kind":"zoom","scale":1.25,"duration":0.8}`. "Less zoom": lower scale (1.12)
  or set `toggles.zoomJumps` to false.
- Checklist: `{"kind":"checklist","items":["...","..."],"duration":3.5}`.
- Cut a part: remove that time range from `segments` (split a segment in two around it). Keep a
  little air: cut from 0.05 s after the last kept word ends to 0.08 s before the next kept word starts.
  Put a part back: add the range back and merge touching segments. Segments stay sorted.
- Tighter or looser pauses: `curl -s -X POST localhost:8787/api/projects/<slug>/autoedit -H 'content-type: application/json' -d '{"pauseGap":0.3}'`
  (0.25 = very tight, 0.4 = normal, 0.6 = relaxed). This only changes cuts.
- Wrong word in subtitles (brand names!): `"wordFixes": {"<word index>": "Correct"}`.
- Hook: `hook.text` (line 1), `hook.accent` (line 2, italic), `hook.sub` (small, e.g. "[o stylu]"),
  `hook.until` (seconds on screen).
- Fonts and colours: `style.*`. Only use the names listed in types.ts.
- Music: put the file in `assets/music/` first (she can upload on the page), then `sound.music`.

## Taste

Her brand is elegant. Pictures and labels on stressed words, not on every word. Leave her face
free. One idea per effect. When unsure, do less and ask.
