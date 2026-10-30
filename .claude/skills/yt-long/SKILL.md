---
name: yt-long
description: Work on a long YouTube video (20 to 40 min, edit.json "format":"long"): write chapters, the YouTube title and description, the name tag, pick the thumbnail, and pick Shorts. Use for "rozdziały", "chapters", "opis na YouTube", "tytuł", "miniaturka", "thumbnail", "zrób Shorty", or any request on a reel whose edit.json has "format": "long".
---

# A long YouTube video

A project with `"format": "long"` in `projects/<slug>/edit.json` is a YouTube video, not a reel.
It shows only `picture`, `label` and `zoom` effects. No hook, end card, cover or Instagram caption.
All times in edit.json are SOURCE seconds (seconds into the user's original video).

Everything for YouTube is in `edit.long`:
- `chapters`: `[{ "at": <source s>, "title": "..." }]`. First at 0. 3 or more. 10 s or more apart.
- `title`: the YouTube title, max 100 characters.
- `description`: 2 to 4 short paragraphs. NO chapter list in it: the page adds it from `chapters`.
- `nameTag`: `{ "name": "<brand.name>", "line": "<short role, in brand.language>", "at": <source s>, "duration": 4 }` or null.
- `subtitles` (burned in, default false), `chapterCards` (chapter title on screen), `zoomJumps`.
- `thumbnail`: `{ "t": <source s>, "title": "max 5 words", "accent": "optional" }`.

## Steps

1. Read the whole video: `npm run transcript -- <slug>`. Each line is a sentence with source times.
2. Chapters: one at every real topic change, usually every 2 to 5 minutes (5 to 10 chapters for
   30 min). The first is at 0 (an intro title like "Wstęp" only if the start is really an intro;
   else name what the user starts with). Put each chapter 0.1 s before the first word of the sentence
   that starts the topic. Titles: 2 to 6 words, concrete, the user's words, Polish if the user speaks Polish
   ("Trencz: jak go nosić", not "Część 2"). No numbering, no emoji.
3. Title: the search phrase first (what people type on YouTube, e.g. "Płaszcz na jesień 2026"),
   then a promise. Max 70 characters is best, 100 is the limit. No clickbait the user would not say.
4. Description: first 2 lines matter most (shown above "more"): what the video gives and the search
   phrase. Then 1 to 3 short paragraphs. The user's voice (`voice.md`; in Polish informal "Ty"/"Was"). Mention a product of the user's (for example an ebook) only if
   the user asked. No hashtags spam (max 3 at the end).
5. Name tag: offer it when the user introduces themselves; put it 1 to 2 s after the user starts talking.
6. Write it with a small Edit of `edit.long` in `projects/<slug>/edit.json` (re-read it right
   before), then run `npm run check -- <slug>` and fix every problem.
7. Shorts: if the user asks, pick 3 to 5 moments with the /reel-highlights rules (20 to 60 s, one
   complete idea, strong first sentence) and make each with
   `curl -s -X POST localhost:8787/api/projects/<slug>/clip -H 'content-type: application/json' -d '{"start":12.3,"end":48.9,"title":"Short title"}'`.
   On a long video each one becomes a NEW vertical reel that needs a few minutes of preparing.
8. Tell the user in 2 to 4 short sentences what you wrote. The user copies the title and description from
   the YouTube panel on the page.

Never post to YouTube. Never delete anything. Polish text must be correct Polish, word for word
as the user would say it.
