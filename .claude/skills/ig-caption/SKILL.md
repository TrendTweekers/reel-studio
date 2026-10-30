---
name: ig-caption
description: >-
  Write the Instagram caption - the line that survives the "... more" cut, the
  body, the single ask, the search terms and the three hashtags - and lint it
  before it goes out. Use when the user says "write the caption", "caption this",
  "what do I put in the description", has a reel or a carousel ready and needs
  the text, or asks about hashtags.
---

> **For this Reel Studio (read first).** This skill is from Jake Schincariol's
> instagram-agent-skill (MIT, see LICENSE in this folder), adapted for this app.
> - Who the user is: `settings.json` `brand` (name, handle, website, language, use). Read it first.
> - Every line the user will SAY, show ON SCREEN or POST (hooks, script beats, captions, replies, DMs)
>   is in the user's language (`brand.language`: Polish when `pl`, English when `en`), word for word.
>   In Polish use informal "Ty". Do this even when you talk to them in another language: explain in
>   their language, but keep those lines in the language of their content. Another language only if they ask.
> - The user's voice: `instagram/voice.md` (fill it with them if it is still empty) and `brand.md`.
> - Keywords: an end-card keyword (`/reel-endcard`, `keywords.md`) is the same as the comment
>   keyword here. Never pick a keyword that another reel already uses.
> - The scripts were made for English. On Polish text (when `brand.language` is `pl`), trust: beat timing (`beats.py`), the
>   caption preview box, length and hashtag checks (`caption.py`), and the typography clean-up
>   (`humanize.py`; Polish quotes „like this” are correct, put them back if it changes them). Ignore on Polish: the hook score number, the "ask" count, and the HUMAN
>   SCORE (they look for English words). Judge those parts yourself.
> - Never post, comment, reply or send a DM for the user. They do that themselves.
> - Notes these skills keep (swipe.md, plan.md, log.md) live in the `instagram/` folder. Put the
>   text files you feed to the scripts in `instagram/drafts/`.

# ig-caption

One tool lives in this folder and it runs:

On Windows the python is `.venv/Scripts/python` instead of `.venv/bin/python`.

```bash
.venv/bin/python .claude/skills/ig-caption/caption.py caption.txt
.venv/bin/python .claude/skills/ig-caption/caption.py caption.txt --keywords "client proposals,agency pricing"
```

It prints the caption the way the feed prints it: the first 125 characters in a
box, everything else behind the tap. Read that box before you read anything
else you wrote.

## First, decide which job this caption has

This is the decision that ruins captions when it is skipped.

**Job A: the video already hooked them.** A Reel carries its own hook in the
first two seconds, spoken and on screen. The caption is not a second hook and
competing with the video is how you lose both. Its job is the ask, the context
that makes the ask make sense, and the words people search.

**Job B: the caption is the content.** A photo, a single image, a carousel
cover that opens a loop. Here line one is the hook and it works exactly like a
Reel hook: concrete, short, and cut off at a cliff rather than mid-clause.

Ask which one you are writing. If the user has a Reel with a strong hook,
write A and say why.

## The shape

```
Line 1      125 characters of visible space. Job A: the ask, plainly.
            Job B: the hook.
            Never a greeting, never a hashtag, never an emoji as the first
            character.
Body        short paragraphs, one line of white space between each. Two to six
            of them. This is where the search terms live.
The ask     one. Comment a keyword, save it, or DM. One.
Hashtags    up to five, on their own line at the bottom, or none.
```

Limit is 2,200 characters and almost nothing needs 2,200. A caption that earns
the tap and then delivers 600 characters beats one that delivers 1,800.

## Hashtags, honestly

Hashtags are not a reach lever any more, and the platform has now said so with
a product change. **Instagram capped hashtags at five per post on 18 December
2025**, down from thirty, telling creators that "using fewer (up to 5) more
targeted hashtags, rather than many generic ones" performs better. Adam Mosseri
had already said in February 2025 that hashtags do not work to increase reach
and are a label, not a distribution lever.

So: up to five, specific, as topic labels. If the user has a block of twenty
saved in their notes app, that block is now dead weight and the linter will
fail it.

`#viral`, `#fyp`, `#explorepage`, `#foryou` describe nothing. Cut them.

## Search terms matter more than hashtags now

Instagram search reads the caption text. So the phrase the user wants to be
found for goes in the caption as a phrase a human would type, in a sentence
that reads normally. "Client proposals" as words in line three, not
"#clientproposals" in a block at the bottom.

Ask for two or three of those terms, then pass them to the linter:

```bash
.venv/bin/python .claude/skills/ig-caption/caption.py draft.txt --keywords "client proposals,agency pricing"
```

## Rules

- **No link in the caption.** Captions are not clickable. A URL in the body is
  dead text that says "I do not use this platform". Bio or DM.
- **One ask.** Two asks is the same as none. `caption.py` counts them.
- **The keyword ask needs a keyword people can type.** One word, no spaces, no
  emoji, and say it out loud in the video too. `Comment CONTRACT` works.
  `Comment "the contract guide"` does not.
- **Write the first comment separately** if there is a link. Say so in the
  receipt.
- **Emoji as punctuation, not decoration.** The linter flags anything over
  4 per 100 characters.
- **Alt text is worth 20 seconds.** For carousels and photos, write it. It is
  read by screen readers and by Instagram.

## The loop

1. Decide Job A or Job B and say which.
2. Draft it.
3. Run `/ig-human` on it. Captions are short, so slop is louder here than
   anywhere else in the pack.
4. Run `caption.py` with the user's search terms. Fix every FAIL. Decide on
   every WARN out loud rather than silently.
5. Print the copy-ready block, then the receipt:

```
CAPTION READY
job:        A - the reel carries the hook
visible:    118 of 125 characters used before the cut
ask:        one, comment CONTRACT
hashtags:   3
search:     "client proposals" in line 3, "agency pricing" in line 5
linter:     READY
```

Nothing is posted. The user pastes it.
