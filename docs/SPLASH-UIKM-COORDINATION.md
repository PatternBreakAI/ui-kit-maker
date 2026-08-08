# Splash ⇄ UIKM coordination — questions & requests for the app session

From the Splash Text session (branch `claude/text-effects-generator-vi6dis`,
PR #236), 2026-08-08. Owner asked what we need from each other; this is
the list.

## 1. Merge order for the shine duplication (the one real conflict)

Both branches carry the `type.shine` engine block (yours ported from the
brief onto main-based code; ours is the same recipe plus vector-outline
`textPath` support). Detail in `docs/INK-SHINE-BRIEF.md` § MERGE
COORDINATION. Request — either:

- **(a)** merge `app-tweaks` first; we'll resolve on our side by keeping
  our engine block and your panel wiring (we've planned for this), or
- **(b)** if ours merges first, rebase `app-tweaks` dropping your
  `bevel.ts`/`model.ts` hunks (they'll already be upstream, superset),
  keeping only the Panel wiring.

Preference: (a) — your branch is smaller and closer to main.

## 2. Adopt, don't rebuild — engine additions living on our branch

All default-off, all byte-identical for existing kits, all potentially
useful in the kit editor when you want them:

| Addition | What it is |
|---|---|
| `type.outline.behind` | stroke as ONE whole-word underlayer — no glyph's stroke crosses an overlapping neighbor (thick kit outlines have this bug today) |
| `type.dim` | dimensional type: smooth-sweep extrusion + drift lean, wrap (sticker), rim, ground shadow, candy gloss, per-letter tilt; wrap is true stroke geometry in outline mode |
| `type.fillStops` | multi-stop letter gradients (banded gold/chrome/silver) |
| `type.noise` | shell micro-texture clipped into letterforms |
| `TextPathOpt` (`build`/`renderTypeSpecimen` opts) | the word as one compound vector path — outlines via opentype.js (new dep), kerned layout, multiline, envelope distortion in `src/splash/outline.ts` |

One hard-won lesson worth stealing: **never dilate letterforms with
feMorphology for a wrap/outline** — box kernel, corners square off. Use
round-join stroke geometry on the outline path (what we do in path mode).

## 3. Questions for you

1. **Safari pass** — your shine commit verified headless; ours likewise.
   All the new type filters (shine, dim, grain) follow the bounded
   userSpaceOnUse discipline, but neither session has real Safari eyes
   yet. Do you have a Safari round planned that could sweep both sets?
2. **Tier gating** — Splash currently ships ungated (lab surface): PNG at
   4x, zoom uncapped, SVG free. Before any public release it should
   presumably ride `capsOf(tier)`/`guardedExport` like the kit. Is the
   entitlements surface stable enough for us to wire against, and is
   there an ExportKind you'd want us to use (`svg`? a new `splash`)?
3. **API stability** — we import `fileToBgDataUrl` + `hydrate` from
   `@/generator/store`, `CANVAS_BGS`/`GAME_FONTS`/`registerCustomFont`
   from model, `inlineKitFace`/`downloadSvg`/`downloadPng` from
   exportUtils, and `Slider`/`FontPicker` from `src/ui/controls.tsx` (the
   shared module extracted on our branch). Treat those as shared API —
   shout before reshaping them.
4. **Cloud presets, later** — if Splash looks become publishable like kit
   presets, we'd want a `splash-*` preset shape in the same cloud preset
   system rather than a parallel one. No action now; flagging so the
   schema conversation happens before we need it.

## 4. Standing requests

- If you touch label rendering in `bevel.ts`'s type layer, mind the
  `TP2`/`fxText` branches — every text-layer emission must go through
  them or path mode silently loses that layer.

## 5. Standardize the shared chrome (owner mandate, 2026-08-08)

The owner asked Splash for a pull-out tray, then corrected course: "just
do what UIKM is doing and let me pull it in my browser… we need even this
functionality standardized between apps." Splash now carries a verbatim
copy of your `panel-resize` sash (6px column, col-resize cursor, 300–560
clamp, width persisted). That's the second copy of that muscle memory —
proposal: lift the sash (handler trio + clamp + persistence) into the
shared Bench (`src/ui/controls.tsx` or a sibling module) so both apps —
and every app after — pull one implementation. Same story ahead for any
other cross-app chrome (zoom floater, stage chips).

## 6. Heads-up: Splash's remit grew (owner, 2026-08-08)

The owner's framing now: Splash = ALL of UIKM's type functionality as a
standalone app, plus its own moves (one-path words, poster fit, groove,
envelope, blob extrusion). Expect Splash to progressively wire up every
type control your panel has (shadow/emboss/glow/case/size/spacing/
highlight/presets…). Two additive API changes shipped on our branch in
service of this — flag if either collides with your plans:

- `FontPicker` gained an optional `fonts?: string[]` curation prop
  (absent = full catalog, unchanged).
- New `registerCuratedFont(name, { css, caps, factor })` beside
  `registerCustomFont` — a curated shelf registers faces with their REAL
  capabilities; curated entries win over broad-guess ones and can't be
  downgraded by a later freeform add. `registerCustomFont` signature
  untouched.

Longer-term: the typography inspector sections themselves are the next
thing worth sharing (prop-driven Bench modules both panels compose), so
the two apps never wire the same control twice.

(Withdrawn 2026-08-08: an earlier bullet here forbade pairing star
glints with ink shine in presets. The owner clarified that "minus the
stars" was a call about the Splash default look, not a rule — combine
them freely where a look wants both.)
