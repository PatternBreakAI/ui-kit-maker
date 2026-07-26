# The front door: how designs reach the homepage

The landing (`src/marketing/landingInit.ts`) renders with the real
engine (`src/marketing/engine.ts` → the generator's own renderer), so
what visitors meet is what the editor ships. This page documents the
rules — change the rules here and in code together.

## Design sources

| Source | Where | What it is |
|---|---|---|
| Plain recipes | `PRESETS` in `src/generator/model.ts` | Shape/color/candy recipes; render under the demo's own font & label |
| Authored designs | `src/generator/preset-<id>.json`, imported by `engine.ts` into `AUTHORED` | Full frozen constructions from the maker's app — own font, label, casing, effects |
| Hero feed | `GET /api/hero-lineup` (production only) | Owner-designated community designs; full configs, join the reel and swatch row at runtime |

To update an authored design ("re-freeze"), replace its JSON with the
maker's current export — same file, whole document. To add one, import
it in `engine.ts`'s `AUTHORED` map; the font guard (below) will tell you
if the landing needs its typeface.

## The one pipeline: `playDesign`

Every interactive path — reel stop, style chip, hero chip, reset —
applies a design through `playDesign` in `landingInit.ts`. Do not add a
new path that resolves or applies a design by hand; call `playDesign`.

Its rules:

- `auth:<id>` resolves to the authored design, `hero:<key>` to a hero
  cfg, anything else to the plain recipe.
- A **full design** (authored/hero) adopts its own label and typeface.
  Its `type.case` governs presentation — the landing never edits a
  maker's text. (This is why citrus-pop says "Play Now", not
  "PLAY NOW", and why a hero like YASS shows its maker's casing.)
- An explicit reel override (`"hard-candy|PLAY"`) displays as caps.
  Plain reel entries should always carry one.
- A plain recipe keeps whatever label is on the demo (the visitor's
  text survives style-hopping).

The style chips resolve **authored-first**: a preset with an authored
design plays that design, exactly like the gallery's `galCfgFor`.

## Fonts: two layers

1. **Build guard** — `scripts/check-landing-fonts.mjs` (runs as
   `prebuild`). Every face the landing can render at build time
   (authored preset JSONs, the demo's `FONT_CHIPS`, the default config)
   must have a self-hosted `@font-face` in `src/styles/landing.css` +
   woff2 in `src/marketing/assets/fonts/` — and nothing extra. Missing
   or orphaned faces fail the build with file-by-file instructions.
   Result: the landing makes zero external font requests for anything
   known at build time.
2. **Runtime net** — `warmFont` in `landingInit.ts` warms the lineup at
   boot and every applied cfg's face, via the editor's
   `E.ensureFont` (Google Fonts, idempotent). It skips faces already
   declared in CSS, so it only fires for what the build couldn't know:
   hero-feed designs and not-yet-refrozen presets.

The demo's font picker matches by name; a face outside its four chips
(e.g. Shrikhand) simply shows no selection.

## Known-parked

`ICONS_ENABLED = false` (`src/generator/model.ts`) parks config-driven
icons everywhere, editor included — an authored icon (citrus-pop carries
a Play triangle) renders nowhere until that flag flips. Product
decision, not a bug.

## Verifying a change

`npm run build && npm run preview`, then on the homepage: let the reel
run one full rotation; click each style chip (citrus should be "Play
Now" in Shrikhand, grape "JELLY" in Fredoka); type a label, hop styles,
confirm it survives plain chips; hit RESET on an authored style and
confirm it stays authored. Watch the console for errors and the network
panel for font requests (steady state: none).
