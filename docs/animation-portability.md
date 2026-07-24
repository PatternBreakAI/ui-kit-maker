# Animation portability — taking kit motion into pro tools (seed)

Status: **thinking-ahead document** (like Smart Help was) — the product
owner expects pros to carry our work into After Effects or Rive, and
some will want our ANIMATIONS, not just our stills.

## What we have today

Every kit animation is one of two dialects, both deliberately simple:

| Dialect | Where | Examples |
|---|---|---|
| SMIL (inside the SVG) | renderer output — travels with any export automatically | spinner breathe, dialogue-arrow bob, health-globe wave/swirl/bubbles, wheel rim comet + armed pulse |
| CSS keyframes | app chrome + kit page classes | shine sweep, loot ignition/burst, motion demos |
| rAF value tweens | LiveArt only (interaction) | revolver spin, carousel glide, progress replays |

SMIL is the portable core: an exported SVG **already animates** in any
browser and in tools that honor SMIL. The rAF tweens are interaction
logic — they become state machines elsewhere, not baked timelines.

## Porting routes, in order of leverage

1. **Animated SVG export (free today).** The SVG/HTML exports already
   carry the SMIL layers. Document it on the Resources page: "drop the
   exported SVG in a browser/embed — it moves."
2. **Lottie.** Our SMIL vocabulary (transform rotate/translate, d-morph
   between same-structure paths, opacity/dash values with keySplines)
   maps 1:1 onto Lottie's animatable properties. A `toLottie()` pass
   over the renderer's animation calls is feasible BECAUSE we already
   route all motion through a handful of helper shapes — keep it that
   way. Deliverable: per-piece `.json` next to the SVG in the game-kit
   zip. AE imports Lottie via Bodymovin; so do engines.
3. **Rive.** Better fit for the INTERACTIVE pieces (wheel, carousel,
   sliders): our editing contracts ("value = rotation", "value =
   position") are literally Rive state-machine inputs. Route: export
   the layered SVG (named groups already exist for Figma) + a manifest
   `{ input: "value", mapping: ... }` documenting each contract, so a
   Rive author rebuilds the rig in minutes instead of reverse-
   engineering it.
4. **Sprite-sheet frames.** Fallback for engines without vector motion:
   render N frames of any SMIL piece by sweeping the value/clock —
   the pure-function renderer makes this trivial (`renderKit(cfg, id,
   size, state, value)` per frame).

## Design rule to keep NOW so this stays cheap

- All renderer motion goes through the same few patterns (rotate,
  translate bob, opacity pulse, dash sweep, same-structure d-morph) —
  never freeform per-piece timeline code.
- Every animated piece's contract already names its driving value —
  that IS the state-machine input. Keep writing them.
- Reduced-motion parity: anything exported must degrade to the static
  frame, same as in-app.
