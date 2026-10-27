---
name: reel-render
description: Make the finished video file of a reel (MP4 for Instagram and TikTok). Use when she says "make the video", "export", "zrób film", "I want to post it".
---

# Make the video

1. `npm run check -- <slug>` must say OK first.
2. Start: `curl -s -X POST localhost:8787/api/projects/<slug>/render`
3. Follow: `curl -s localhost:8787/api/projects/<slug>/render` until `running` is false.
   A few minutes for a 1-minute reel; the first one is slower. Tell her it takes a while and she can keep editing.
4. If `error`: read it, fix the cause (often a missing picture or music file), try again.
5. The file is in `projects/<slug>/out/`. Open the folder for her: `open projects/<slug>/out`
   Tell her: AirDrop it to the phone, then post. It is 1080x1920, right for Reels and TikTok.

## Check before she posts
After each Instagram video the app checks it by itself and asks you (in the Ask box) to look at a
contact sheet of 12 frames plus automatic findings. To check again on request:
`curl -s -X POST localhost:8787/api/projects/<slug>/check -H 'content-type: application/json' -d '{"inline":true}'`
(returns the sheet path, frame times and findings; Read the sheet jpg). Answer like a fashion editor: good to
post in one sentence, or at most 5 problems with time and fix. Never change the reel before she says yes.

