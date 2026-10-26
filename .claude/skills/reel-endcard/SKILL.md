---
name: reel-endcard
description: Add or change the closing "comment KEYWORD" card that sells her ebook at the end of a reel, and track which reel brought sales. Use for "end card", "add the ebook at the end", "karta końcowa", "komentuj słowo", "which reel sold".
---

# End card that sells

The end card shows after her last word: the ebook cover, "Napisz w komentarzu", a big KEYWORD,
and "a wyślę Ci link do ebooka". People comment the word, she (or her DM automation) sends the
link. A DIFFERENT keyword per reel shows which reel brought the buyers, without any tracking links.

1. Pick the keyword: one short Polish word in caps without Polish letters (people type it fast on
   a phone): JESIEN, BOTKI, TOREBKA, PLASZCZ. It must be new: check the other reels
   (`curl -s localhost:8787/api/projects`, then each reel's edit `endCard.keyword`) and keywords.md.
2. Ebook cover: a board picture (ls board). If there is none, ask her to add the cover to the board.
3. Set in edit.json:
   `"endCard": {"enabled": true, "keyword": "BOTKI", "line": "Napisz w komentarzu", "sub": "a wyślę Ci link do ebooka", "image": "<board file>", "seconds": 3}`
   The card adds `seconds` to the video. Then `npm run check -- <slug>`.
4. Make the caption's call to action use the same keyword (see /reel-caption).
5. Add a line to `keywords.md` (create it if missing): `| date | reel title | KEYWORD | ebook |`.
   When she later tells you results ("BOTKI got 140 comments, 23 sales"), add them to that line.
   When she asks "which reels sell", read keywords.md and answer with the numbers.
