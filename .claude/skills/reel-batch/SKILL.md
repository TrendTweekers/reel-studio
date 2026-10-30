---
name: reel-batch
description: The user filmed several reels in one long video (one filming session). Split it into separate reels. Use for "I filmed 5 reels in one go", "split this video", "podziel ten film", "batch".
---

# Several reels in one video

How the user films for batch mode: one long video; between two reels the user says "następny" (or "next")
and pauses for 2 seconds. The app then splits by itself when the user ticks "Several reels in this
video" on the page. Without the word, long pauses (3 s or more) are used.

If the user asks you instead:
1. The long video must be a reel that is `ready` (import or drop it first).
2. Automatic split: `curl -s -X POST localhost:8787/api/projects/<slug>/split -H 'content-type: application/json' -d '{}'`
   It answers the new reels `{"slugs": [...]}`. Check them with `npm run transcript -- <new slug>`.
3. If the automatic split is wrong (a reel cut in the middle of a thought, two topics in one),
   read `npm run transcript -- <slug>` and make the clips yourself, one per topic, with
   `curl -s -X POST localhost:8787/api/projects/<slug>/clip -H 'content-type: application/json' -d '{"start":..,"end":..,"title":".."}'`
   (start 0.15 s before the first word, end 0.3 s after the last word; never include the cue word).
4. Give each new reel a short title, a strong hook and (if the user sells something in it) an end card
   with its own keyword (/reel-endcard).
5. Tell the user the list: title and length of each reel.
