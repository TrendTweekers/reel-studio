---
name: reel-cover
description: Make the cover (thumbnail) of a reel for Instagram and TikTok. Use for "make a cover", "zrób okładkę", "thumbnail", "miniaturka", "which frame is best for the cover".
---

# Cover

A cover = one good frame of the user plus an optional title in the user's hook font. Two files are made:
`covers/cover-9x16.jpg` (Reel and TikTok cover) and `covers/cover-3x4.jpg` (how it shows on the user's
Instagram profile grid, which crops the middle 3:4).

1. Find good frames: `curl -s -X POST localhost:8787/api/projects/<slug>/covers/find`, then
   `curl -s localhost:8787/api/projects/<slug>/covers` until `candidates` is not empty. The
   candidates are sorted best first (sharp, eyes open, face well placed).
2. Look at the top candidates yourself (Read `projects/<slug>/<file>`; `file` already starts with `covers/`). Pick the one with
   the best expression for the topic. If the user named a moment ("when I hold the coat"), find it with
   `npm run words -- <slug> <word>` and use that time.
3. Set `cover` in edit.json: `{"t": <source seconds>, "title": "...", "accent": "...", "layout": "top"}`.
   Title: 2 to 5 words that say what the reel gives ("3 płaszcze na jesień", "Capsule w 10 rzeczy").
   It can match the hook, but shorter. `layout`: top, center, bottom (away from the user's face), or
   "none" for a clean frame. Run `npm run check -- <slug>`.
4. Render: `curl -s -X POST localhost:8787/api/projects/<slug>/covers/render`, then
   `curl -s localhost:8787/api/projects/<slug>/covers` until `rendering` is false. Read both
   images and check the title does not cover the user's face and reads well on the grid crop.
5. Tell the user where they are and open the folder: `open projects/<slug>/covers`. On Instagram the user
   picks the cover when posting: "Edit cover" -> "Add from camera roll".
