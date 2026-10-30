---
name: reel-import
description: Bring a video file from the Mac (Downloads, AirDrop, Desktop, Photos export) into Reel Studio as a new reel. Use when the user says "edit the video I just AirDropped", "take the newest video from Downloads", or gives a file path.
---

# Import a video

Import of a file from Downloads works only from the "Ask Claude" window ("Ask Claude.command"), because
it needs `python3` and file lists that the Ask box on the page may not run. If you run in the Ask box
on the page and the user names a file in Downloads, tell the user: "Open Ask Claude.command and ask me there, or
just drop the file on the page." Dropping the file on the page always works.

1. Find the file. If the user did not give a path, list the newest videos:
   `ls -t ~/Downloads/*.{mov,MOV,mp4,MP4,m4v} 2>/dev/null | head -5` and ask which one if unsure.
   iPhone videos come by AirDrop to ~/Downloads.
2. Check the server: `curl -s localhost:8787/api/projects >/dev/null || echo DOWN`. If down, tell
   the user to click "Reel Studio" in the Dock and wait.
3. Upload (the name becomes the reel title):
   `curl -s -F "video=@<path>" -H "x-file-name: $(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$(basename '<path>')")" localhost:8787/api/projects`
   It answers `{"slug":"..."}`.
4. The app now prepares the video by itself (a few minutes for a 1-minute video). Check with
   `curl -s localhost:8787/api/projects/<slug>/version` until `status.step` is `ready`
   (or `error`: then read `projects/<slug>/tools.log` and explain simply).
5. Tell the user it is ready on the page, and offer: "Shall I add pictures or change the hook?"
