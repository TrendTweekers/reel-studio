---
name: reel-highlights
description: Cut a long video (a talk, a live, a vlog, a long try-on) into short reels with the best moments. Use for "make clips from this video", "zrób klipy", "find the best parts", "highlights", "auto clip".
---

# Highlights from a long video

1. The long video must be a project first (import it with /reel-import if needed, and wait until
   it is `ready`).
2. Read it: `npm run transcript -- <slug>`. Each line is a sentence with source times.
3. Pick 3 to 5 moments (or the number the user asked for). A good clip:
   - starts on a strong first sentence (a bold opinion, a question, a surprising fact, "most women
     make this mistake..."). Never start mid-thought or on "and", "so", "więc", "i".
   - holds ONE complete idea and ends when it is said (no cliff-hanger mid-sentence).
   - is 20 to 60 seconds (Reels sweet spot 25 to 45 s).
   - is useful or emotional on its own, without the rest of the video.
   - does not overlap another clip.
   Prefer specific, practical moments (a piece, a fit rule, a styling trick, a before/after) over
   general talk.
4. For each, make the clip: start 0.15 s before the first word, end 0.3 s after the last word:
   `curl -s -X POST localhost:8787/api/projects/<slug>/clip -H 'content-type: application/json' -d '{"start":12.34,"end":48.9,"title":"Short title"}'`
   It answers `{"slug":"<new>"}`. The clip gets pauses cut, a hook and subtitles by itself, in the
   same style as the long video.
5. Improve each clip's hook: set `hook.text` / `hook.accent` in `projects/<new>/edit.json` to a
   short, strong version of its first idea (max 8 words, the user's voice), then `npm run check -- <new>`.
6. Tell the user in a short list: clip title, length, why it is strong (one line each). They are on the
   page now under "Your reels". Offer: covers (/reel-cover) and making the videos (/reel-render).
