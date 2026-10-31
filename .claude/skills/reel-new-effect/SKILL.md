---
name: reel-new-effect
description: Build a new kind of effect into Klipownia (a code change), e.g. a new text animation, a new transition, a new sticker style the user saw on Instagram. Use only when no existing effect kind can do what the user wants.
---

# Add a new effect kind

This changes the app's code. Work carefully and test. It works only from the "Ask Claude" window
("Ask Claude.command"); the Ask box on the page cannot run `npx` or edit the app code. If you are in
the Ask box on the page, tell the user to open "Ask Claude.command" and ask again there.

1. Read `src/shared/types.ts` (EffectKind and Effect), `src/remotion/Reel.tsx` and one existing
   effect in `src/remotion/effects/` as the pattern. Read `/remotion-best-practices` and
   `.claude/skills/remotion-markup/` (effects, transitions, text-highlights, light-leaks,
   motion-blur, sfx) for the right Remotion way.
2. Add the kind to `EffectKind` in types.ts, write `src/remotion/effects/<Name>.tsx`, and wire it
   in where the other effects are rendered.
3. Add it to the editor page: the word popover and the effects list in `web/src/` (search for an
   existing kind such as 'glass' to find every place), with EN and PL strings in `web/src/i18n.ts`.
4. Add the kind to the KINDS list in `scripts/check-edit.ts`.
5. Rules: deterministic per frame (useCurrentFrame, interpolate, spring, random(seed); no
   Math.random, no CSS animations), keep the user's face free, respect the Instagram safe area
   (top 220 px, bottom 380 px, sides 60 px), elegant, not loud.
6. Test: `npx tsc --noEmit`, `npm run build:web`, then render a still at a frame where the effect
   shows: `npx remotion still src/remotion/index.ts Reel out/test.png --frame=<n> --props=<json file>`
   (make the props file from `curl -s localhost:8787/api/projects/<slug>` fields edit, words, faces
   plus the urls the server uses), and look at the picture.
7. Restart the server (double-click "Stop Klipownia.command", then click Klipownia in the Dock) so renders use the new code.
