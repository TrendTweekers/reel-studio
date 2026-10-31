---
name: ig-reply
description: >-
  Handle the comments under the user's own reels and posts - draft replies to
  the ones worth answering, sorted by which ones are. Use when the user pastes
  their comments, says "reply to these", "handle my comments", "someone said X
  on my reel", or is dealing with a critic, a hater or a lead in the comments.
---

> **For Klipownia (read first).** This skill is from Jake Schincariol's
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

# ig-reply

The comment thread under your own post is where reach is decided. Every reply
is another interaction on the post, replies arriving in the first hour do most
of the work, and on Instagram a reply can also be a Reel, which is the single
most underused move on the platform.

But the value is not equal across comments, so this skill sorts before it
writes.

## Input

The user pastes the comments, ideally with handles. Screenshots are fine. Do
not scrape the thread with a browser tool.

## Triage first

Sort every comment into one of six buckets and say the counts out loud:

| bucket | what it is | what it gets |
| --- | --- | --- |
| **KEYWORD** | the word you asked them to comment | the promised thing, sent by hand or by your approved tool |
| **LEAD** | someone describing the problem you solve | a real answer in public, then a door |
| **SUBSTANCE** | adds data, disagrees, extends | the longest reply on the thread |
| **QUESTION** | a question a lot of people have | this one becomes a Reel, not just a reply |
| **SUPPORT** | "🔥", "great post", a tag | a like, and 3 to 8 words at most |
| **NOISE** | pitch, spam, bad faith, bait | nothing, or one line and out |

Write in that order and stop when the value stops.

## The move most people miss

If a question in the comments is one that thirty other people also have,
**reply to it with a Reel**. Instagram will attach the comment to the new video
as a sticker, the person who asked gets notified, and a question with real
demand behind it becomes a post with the hook already written for you. Flag
every QUESTION that qualifies and hand it to `/ig-reel` as formula #16.

## How to reply

- **Answer the actual question.** If someone asks how, tell them how, in the
  reply. Do not send them to the DMs to hear an answer they could have had.
- **Use their name once**, at the start, without an exclamation mark.
- **Match their length.** A four-word comment does not get a four-line reply.
- **To a critic:** concede the true part first, in their words, then hold the
  line. Never delete, never get defensive, never reply twice on the same
  thread.
- **To a hater:** nothing. A reply is reach, and reach is what they came for.
  Hide the comment if it is abusive. Instagram's comment controls exist and
  using them is not losing.
- **To a lead:** answer fully in public. The door is one sentence at the end
  and it is an offer of help, not a pitch. The public answer is what makes the
  next person DM you.

## Keyword comments

If the post used a keyword ask, those comments are the whole point of the post.
Every one of them is a person who raised their hand. Reply to each, then send
what was promised. If the user has automation set up through Instagram's own
tools or an approved partner, say so and let it run; if not, the replies are
manual and that is fine at this volume. Never bulk-DM people who did not
comment.

## Output

One block, grouped by bucket, each reply copy-ready and already humanized:

```
REPLIES  ·  84 comments  ·  41 KEYWORD, 2 LEAD, 3 SUBSTANCE, 2 QUESTION, 34 SUPPORT, 2 NOISE

KEYWORD  (41)  send the clause. One line each, same warmth, not copy-paste.

LEAD
@handle - "we had this exact thing happen in June"
> The bit that fixed it for us was moving the payment trigger off approval
> entirely. Happy to send the wording if it is useful.

QUESTION -> REEL
@handle - "what do you do if they refuse to sign it?"
  34 likes on this comment. That is a Reel, not a reply. Formula #16.

NOISE  (2)  skipped. Replying gives them reach.
```

Then the gate: nothing is posted until the user says yes. They paste the
replies.
