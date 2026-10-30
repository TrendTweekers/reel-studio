---
name: reel-style
description: Apply, create or change an editing style (a whole look in one go), e.g. "use the Vogue style", "make it more girl blog", "save this look as my style", "make a new style like this reel I saw", "new videos should use Film".
---

# Editing styles

A style = fonts, colours, subtitle look, vibe, sounds, zoom habits and pace. Built-in styles are in
`src/shared/styles.ts` (Editorial, Vogue, Girl blog, Film, Bold creator, Minimal). The user's own saved
styles are `styles/own-*.json`. List all: `curl -s localhost:8787/api/styles`.

- Apply to a reel (look changes; words, cuts and effects stay):
  `curl -s -X POST localhost:8787/api/projects/<slug>/style -H 'content-type: application/json' -d '{"id":"vogue"}'`
- Save a reel's current look as the user's style:
  `curl -s -X POST localhost:8787/api/styles -H 'content-type: application/json' -d '{"name":"Autumn soft","slug":"<slug>"}'`
- Style for all NEW videos: `curl -s -X PUT localhost:8787/api/styles/default -H 'content-type: application/json' -d '{"id":"girlblog"}'`
  Also add a line to brand.md ("New reels: Girl blog style").
- A new style from a description or a reel the user saw: write `styles/own-<name>.json` in the same
  shape as one entry of BUILT_IN_STYLES (fields id, name, namePl, description, descriptionPl, style,
  sound, toggles, pace). Use only fonts, sounds and vibes that exist in src/shared/types.ts. If the
  look needs an effect that does not exist yet, say so and offer /reel-new-effect.
  `pace`: pictureEvery / zoomEvery = seconds between automatic pictures / zooms (999 = none),
  pauseGap = pause length that gets cut (0.28 fast to 0.5 relaxed).
- "More X" or "less X": change only that part in the reel's edit.json (style.*, toggles.*), then
  `npm run check -- <slug>`.

The user sees the change on the page at once. Name the style the user is in when you answer.
