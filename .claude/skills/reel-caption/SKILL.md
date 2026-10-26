---
name: reel-caption
description: Write the post caption, search keyword, hashtags, hook ideas and the TikTok version of one of Paulina's reels, in her voice and in Polish, and save them in the reel. Use for "write a caption", "napisz opis", "hook ideas", "hashtags", "TikTok version", "wersja na TikToka".
---

# Caption, keyword and TikTok version in her voice

1. Read what she says: `npm run transcript -- <slug>` (and `npm run words -- <slug>` for details).
   Read brand.md.
2. Pick ONE search keyword phrase: the Polish words a woman would TYPE into Instagram or TikTok
   search to find this reel ("botki na jesień", "torebka do pracy", "co założyć do szerokich
   spodni"). Instagram and TikTok search read the caption and the on-screen text; hashtags matter
   less than this phrase.
3. Her voice: warm, direct, confident stylist talking to a friend. Polish, informal "Ty".
   Practical and specific (pieces, colours, fits, occasions), never generic hype.
   "Nowoczesna klasyka z twistem". At most 2 to 3 emoji.
4. Instagram caption (`post`):
   - First line: the keyword phrase inside a short, strong sentence (it shows before "more").
   - 2 to 4 short lines of value.
   - One call to action. If the reel has an end card, repeat it: "Napisz JESIEN w komentarzu, a
     wyślę Ci link do ebooka." Otherwise: save the reel, or send it to a friend.
   - 3 to 5 hashtags (no '#' in the data): 1 to 2 broad Polish fashion tags + 2 to 3 for the topic.
5. TikTok version (`tiktok`): a DIFFERENT hook (`tiktok.hook`, same shape as `hook`) that puts the
   keyword phrase on screen in the first 2 to 3 seconds, a TikTok caption (`tiktok.post`: shorter,
   keyword first, 3 to 5 tags), and `tiktok.endCardLine` if the end card must say something else
   (TikTok: "Link w bio" instead of "Napisz w komentarzu" when she sells through the bio link).
   Never mention Instagram in the TikTok version.
6. Save into edit.json: `post: {"caption": "...", "hashtags": ["...", ...], "keyword": "..."}`
   and `tiktok: {...}`. Run `npm run check -- <slug>`.
7. Also give her 2 more hook ideas in the chat (max 8 words each; a curiosity gap or a bold
   opinion). If she likes one, put it in `hook` (Instagram) or `tiktok.hook`.
8. Do not invent facts about her products. Name an ebook only as she named it.
9. Tell her: the texts are in the "Post" panel with copy buttons, and "Make TikTok version" renders
   the TikTok file.
