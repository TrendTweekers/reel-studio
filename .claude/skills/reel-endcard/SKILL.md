---
name: reel-endcard
description: Add or change the closing "comment KEYWORD" card that sells the user's product (for example an ebook) at the end of a reel, and track which reel brought sales. Use for "end card", "add the ebook at the end", "karta końcowa", "komentuj słowo", "which reel sold".
---

# End card that sells

The end card shows after the user's last word: the product cover (an ebook in the Polish example below), "Napisz w komentarzu", a big KEYWORD,
and "a wyślę Ci link do ebooka". People comment the word, the user (or their DM automation) sends the
link. A DIFFERENT keyword per reel shows which reel brought the buyers, without any tracking links.

1. Pick the keyword: one short word in the user's language, in caps, without Polish letters if Polish (people type it fast on
   a phone; Polish fashion examples): JESIEN, BOTKI, TOREBKA, PLASZCZ. It must be new: check the other reels
   (`curl -s localhost:8787/api/projects`, then each reel's edit `endCard.keyword`) and keywords.md.
2. Ebook cover: a board picture (ls board). If there is none, ask the user to add the cover to the board.
3. Set in edit.json:
   `"endCard": {"enabled": true, "keyword": "BOTKI", "line": "Napisz w komentarzu", "sub": "a wyślę Ci link do ebooka", "image": "<board file>", "seconds": 3}`
   The card adds `seconds` to the video. Then `npm run check -- <slug>`.
4. Make the caption's call to action use the same keyword (see /reel-caption).
5. Add a line to `keywords.md` (create it if missing): `| date | reel title | KEYWORD | ebook |`.
   When the user later tells you results ("BOTKI got 140 comments, 23 sales"), add them to that line.
   When the user asks "which reels sell", read keywords.md and answer with the numbers.
