---
name: reel-story
description: Plan or change the animated scenes of a "video from text" (Film z tekstu, edit.format "story"): no camera, her voice or the computer voice reads a script and scenes are drawn. Use when she asks for better scenes, other key words, a list, a photo from her board, a number, a quote, a compare scene, another background, or when the server asks you to plan the scenes.
---

# Scenes of a video from text

A story video has `"format": "story"` in `projects/<slug>/edit.json`. There is no person on camera:
`edit.story.scenes` are full-screen animated scenes, and the subtitles show the spoken words at the
bottom. Read `StoryScene` / `StorySceneKind` in `src/shared/types.ts` for every field.

## Steps

1. `npm run words -- <slug>` prints every spoken word with its time (`at(source)`), and
   `projects/<slug>/script.txt` is the script. The scenes follow the SPOKEN words, not the script.
2. Plan one scene per idea, about every 2 to 5 seconds. Each scene starts (`at`) on the first word
   of its idea, in source seconds. The first scene starts on the first word.
3. Write `edit.story.scenes` with the Edit tool (keep `script`, `voice`, `background`). Every scene
   needs a short unique `id`.
4. `npm run check -- <slug>` until it says OK. Do not render unless she asks.
5. Tell her in one or two short sentences, in her language, what the scenes are now.

## Scene kinds (pick what fits the words; vary them, never 3 of one kind in a row)

- `title`: the hook, big serif. `text` max 7 words; optional `items[0]` = small line under it.
- `words`: the key words of the sentence, NOT the whole sentence (the subtitles carry that).
  `text` = 2 or 3 short lines joined with `\n`, max about 8 words in total.
- `list`: when she counts ("Pierwszy... Drugi... Trzeci..."). `items` = 2 to 5 short points (max 5
  words each), `text` = optional heading. One list scene covers all the points; items appear as
  she says them.
- `number`: a number she says ("3 błędy", "70%", "200 zł"). `items[0]` = the number, `text` = what
  it means (short).
- `quote`: a strong one-line rule or opinion. `text` = the quote (max 12 words).
- `compare`: ONLY wrong vs right ("zamiast X, wybierz Y", do / don't). The no side is drawn crossed
  out and the yes side ticked. `items[0]` = the no side, `items[1]` = the yes side (max 5 words
  each), `text` = optional heading. Two equal options (two styles she both likes) are NOT a compare:
  use `words` or `list` for them.
- `photo`: one of HER board pictures (`ls board`) that really shows what she talks about. `image`
  = file name, `text` = optional short caption. Only use a picture whose file name or look matches;
  never invent a file name. No fitting picture = no photo scene.
- `reels`: her other finished reels play in cards. Use when she talks about her reels or her work.
  `reels` = slugs (leave out for her newest), `text` = optional heading.

## Taste

- Elegant and calm. Short words on screen, big type. The last scene is the call to action
  (`title` or `words`, e.g. "Zapisz na później").
- `edit.story.background`: `cream` (default, light), `ink` (black, dramatic), `accent` (her accent
  colour). Change it only when she asks.
- Normal effects still work on top (label, picture, checklist, chart, emoji, glass, chapter). Effects
  that need her on camera are ignored (see `STORY_SKIP_KINDS`).

## Product videos

When `meta.story.mode` is `'product'` (a video about an app, a website or a product), plan the
scenes like a short demo:

1. First scene: a `title` hook (what it is, or the problem it solves).
2. Show the product with real screens: `screen`, `click` and `type`.
3. List what it does with `logos` (2 to 6 names: features, tools it works with, plans) or `list`.
4. `price` near the end.
5. Last scene: the call to action (`title` or `words`, e.g. "Link w bio").

Product scene kinds (fields in `StorySceneKind`, `src/shared/types.ts`):

- `screen`: a screenshot in a device frame with a slow pan (tall screenshots scroll top to bottom).
  `image` = board file, `frame` = `phone` (tall pictures, default), `browser` (wide pictures,
  default) or `plain`, `text` = optional caption.
- `click`: like `screen`, then the cursor moves to `point` and clicks, and the view zooms there.
  `point` = `{ "x": 0..1, "y": 0..1 }` from the top-left of the picture (required). Look at the
  picture first and point at the real button. `text` = optional short label next to the point.
- `type`: text is typed into a search or prompt box. `text` = what is typed (required),
  `items[0]` = the grey placeholder, `items[1]` = the result line that appears after.
- `logos`: `items` = 2 to 6 short names (max 3 words each), `text` = optional heading.
- `price`: `items[0]` = old price (crossed out, or `""`), `items[1]` = the price (required, e.g.
  "49 zł"), `text` = what you get (short).

Only use REAL screenshots from the board (`ls board`). Never invent a file name, and never use a
picture that is not a screenshot of this product for `screen` or `click`. No fitting screenshot =
no screen scene: use `words`, `logos` or `list` instead, and tell her which screenshots to add to
the board.
