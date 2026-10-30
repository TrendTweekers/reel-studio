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
- Big moments (the @viiolini set). Use 1-2 per reel, on the line that matters most:
  - Chart that grows: `{"kind":"chart","text":"Ile razy założysz botki","items":["Wrzesień: 4","Październik: 12"],"duration":3.2}`
    (items = bars "Label: number", 2-6; the biggest bar gets her accent colour).
  - Magazine cover: `{"kind":"cover","text":"STYL","items":["Botki na jesień","3 błędy"],"duration":2.8}`
    (title behind her head with the cut-out; 2-3 short cover lines).
  - Frame break `framebreak`, paper cut `papercut`, vertigo `vertigo`: no fields (optional `image` =
    board picture as backdrop for framebreak/papercut). They need the cut-out (start it as for "behind").
  - Green screen: `{"kind":"greenscreen","image":"<board file>","duration":3}` (needs the cut-out; without
    `image` she stands in a cream studio).
  - Orbit: `{"kind":"orbit","items":["botki","płaszcz"],"duration":3}` (words circle her head; optional `image`).
  - Doodles: `{"kind":"doodle","text":"to!","duration":2}` (text optional).
  - App cards: `{"kind":"ui","text":"botki na jesień","items":["Nowa wiadomość: gdzie kupiłaś?"],"duration":3}`.
  - Pull-back reveal `pullback` (2.2 s) and zoom-through cut `zoomthrough` (0.6 s, on the first word
    after a cut): no fields.
- Show my reels (her OTHER finished reels play muted in small cards; 1 per reel, when she talks about
  her reels, her work or editing). Optional `reels` = slugs of reels that have a finished video in
  `projects/<slug>/out/`; leave it out for her newest. With no finished reels they show parts of this video.
  - Envelope `{"kind":"envelope","duration":3}`: flips in behind her head, reels pour out.
  - Folder `{"kind":"folder","text":"moje rolki","duration":3}`: a cursor clicks a folder, reels fan out (text optional).
  - Polaroid `{"kind":"polaroid","text":"jesień 2026","duration":3.2}`: a camera prints a Polaroid that develops into a reel (text optional).
  - Conveyor `{"kind":"conveyor","duration":3.5}`: reels ride a conveyor belt behind her.
  - File preview `{"kind":"files","items":["final.mp4","final_FINAL.mp4","final_FINAL_v2.mp4"],"duration":3.5}`: the cursor clicks file after file, each plays.
  - Clothesline `{"kind":"clothesline","duration":3.2}`: reels hang on a line with pegs, then get pulled away.
  Envelope, conveyor and clothesline go behind her when the cut-out exists (start it as for "behind").
  Then look at your work with `npm run look -- <slug> '<effect json>' --keep`
  (renders 3 stills of the reel with that effect added into `fx-test/`; Read the jpg files).
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
