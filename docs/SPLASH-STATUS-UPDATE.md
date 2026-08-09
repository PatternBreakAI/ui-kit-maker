# Splash Text — status update (post-B2 round)

2026-08-09. Update for the outside reviewer following the "MODEL B
REVIEW — geometry passes, material does not yet pass" verdict and the
B2 directive. Everything below is on the branch and owner-tested.

## What was built since your last verdict

### Model B2, to the letter of the directive

`renderBevelB2` implements the profiled shared-domain bevel exactly as
prescribed, on top of Model B's non-negotiable structure (original
silhouette byte-identical, one shared ring, one shared plateau mask,
midtone base under all overlays, edge geometry as paint only):

- **Continuous directional response**: every contour is partitioned
  into edge runs by normal direction (12 bins default, one-edge overlap
  between runs). Each run's tone comes from `dot(meanNormal, keyLight)`
  — a continuous cosine response, not three orientation classes.
- **Gradients ACROSS the ring, per run**: each run is painted as a
  centered stroke carrying a linear gradient aligned to its own inward
  normal — the cosine tone at the OUTER edge, fading to transparent at
  the inner edge. The face diffuse underpaints the whole glyph, so the
  ring blends into the plateau with no seam and **no continuous dark
  boundary is possible**. The recessed-channel read is gone; grayscale
  diagnostics confirm the face reads raised.
- **Profiles as fade curves**: rounded (smooth falloff) vs hard
  (planar chamfer falloff). No blur in the ring.
- **Cool bounce**: shadow-facing runs only, ~13% opacity, 20% of ring
  width, never a circumference. Off by default.
- **Selective gloss**: ONE hard-edged role-space band masked to the
  shared plateau — no mechanical per-glyph repeats.
- **Optical width limiter**: candidate widths (1×, .85, .7, .55, .4 of
  requested) tested against plateau ≥ 70% of face area and principal
  glyphs staying plateau-dominant; one width per role. Areas estimated
  analytically per glyph (A − P·W + πW²).
- **Orientation-map diagnostic** proving directional treatment, plus
  ring-only / plateau-only / grayscale / thumbnail views.

### Material Lab results

Matrix (thin/medium × rounded/hard × directional vs B1-blurred control
× bounce) over `Dream` (Baloo 2), `WOW!` (Bangers), `W M O 8 !`.
Finalist: **thin·rounded**. The full `Dream` tile (strata + material +
light + shadow + three derived sparkles) reads as candy unlabeled at
thumbnail size; the B1 control column looks airbrushed next to B2 in
every row. The sharp-font stress test survives with clean tips.

Honest gaps carried forward from that round:
1. The limiter is **over-conservative on rounded lowercase faces**
   (the analytic estimate double-penalizes counters) — Baloo `Dream`
   gets ~1.2px authored bevel where ~2–2.5 would still be safe. Fix is
   a measured-area limiter instead of the estimate.
2. The candy strata palette is darker/plummier than the reference's
   pink-red dimensional strata — palette work, not architecture.
3. The full tile's scene is deliberately minimal (three sparkles);
   full treatment richness is future scene work.

### Shipped to a testable frontend — owner is driving it now

The owner asked to test in a real UI, so the **Candy Lab** shipped at
`?lab=candy` on the Vercel preview (unlinked from navigation; nothing
merged to main):

- Live text input (regenerates as you type, compiled at 4× master
  scale, ~10–20ms per keystroke).
- Ten fat faces from the curated shelf (Baloo 2, Bangers, Luckiest
  Guy, Titan One, Modak, Lilita One, Archivo Black, Pacifico,
  Shrikhand, Chonburi).
- Four candy palettes (Bubblegum, Blueberry, Mint, Lemon).
- Bevel width slider **with the limiter's effective-width readout**
  (the user sees "3.0 (used 1.2)" when protection kicks in).
- Rounded/hard profile, gloss strength, sparkles, cool bounce.
- Backdrop modes: card (palette tile) / dark / light — dark and light
  preview the lettering huge and unboxed, and their SVG/PNG downloads
  have **transparent backgrounds**.
- Downloads bake the full **16× master geometry** (~7000px wide for a
  single word) — the high-resolution-download promise, live.

First owner feedback ("way bigger, without the constrained background —
these are vectors right?") was incorporated same-day: fill-stage
preview + the backdrop modes above.

## Current engine stack (src/lettering/)

engine.ts (interpret / typeset / IR / pass-major emit + gradient IR) ·
material.ts (LightRig, MaterialRecipe, depth plans — still carrying the
crescent-sandwich implementation as the A/B control) · bevelB.ts
(Models B and B2 + limiter + diagnostics) · pattern.ts · scene.ts ·
recipe.ts (TreatmentRecipe compiler, 16× master scale) · materials.ts
(8 fixtures) · presets.ts (Comic Pop / Retro Sticker / Sports Arena on
the OLD material path) · candyTile.ts + CandyLabPage.tsx (the shipped
lab).

Constraints all still hold: SVG 1.1 only, byte-deterministic, ~150ms
full-tile compiles at 16×, arbitrary text/fonts, no per-word authoring.

## Questions for this round

1. **Priority call.** Four candidate next moves — what order?
   a. Measured-area limiter (kills the rounded-lowercase
      conservatism).
   b. Migrate the three existing treatment presets (Comic Pop, Retro
      Sticker, Sports Arena) from the crescent-sandwich material to
      B2-style shared-domain construction, with the material-specific
      profiles you outlined (comic: near-none/hard; sports: crisp
      planar chamfer + inlines; metal: hard + banded ramps).
   c. Script-join correctness: Pacifico-class faces stroke the hidden
      boundaries inside letter overlaps (the ring shows seams at
      joins). The clean fix is union-first geometry — your Model C
      offset/Boolean kernel. Worth building now, or acceptable to
      defer while candy ships on non-script faces?
   d. The Dream full-treatment polish (strata palette, richer candy
      scene) toward the reference tile.
2. **Candy art direction check.** With the lab live, the owner can
   screenshot any combination. What specific specimens/settings do you
   want to see to grade the material against the Candy/Soft reference
   (we'd bring you: Dream/Baloo/Bubblegum at defaults, WOW!/Bangers at
   max bevel, one script face, thumbnail strip)?
3. **Product shape sanity check.** The lab exposes raw dials (bevel
   width, profile, gloss…). The product thesis says preset-first with
   macros over recipe fields. For the eventual `?lab=splash2` surface:
   should material dials like these survive at all, or collapse into
   2–3 macro controls per material (e.g. "depth", "shine") with the
   rest recipe-owned?
