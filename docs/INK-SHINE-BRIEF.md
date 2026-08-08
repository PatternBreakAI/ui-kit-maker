# Ink Shine — handoff brief for the UI Kit Maker app session

Owner-approved treatment (2026-08-08, Splash Text experiment): highlights
that mimic light falling on the letterforms — hand-inked white crescents
on each glyph's lit edges. **The owner wants this in UI Kit Maker too.**
No stars with it: the star glints are a separate treatment and the owner
approved shine explicitly WITHOUT them.

## What it looks like

Each letterform gets its own custom highlight derived from its actual
shape: bowls get shoulder sweeps, stems get caps, counters get little
dots. Nothing is authored per letter — it falls out of the geometry, for
any face, any label, and it follows per-letter tilt because it computes
from final rendered alpha.

## The technique (owner's concept, engine implementation)

The sliver of a shape that "sees the light" is the part of the shape that
its own shadow-side copy does not cover:

1. **Erode** the glyph alpha by `inset` px — the shine floats inside the
   letter instead of touching the outline (hand-inked placement). Side
   effect worth keeping: features thinner than ~2×inset get no shine,
   which reads intentional.
2. **Offset** the eroded alpha AWAY from the key light — with the master
   light overhead that's straight down by `size` px. Direction comes from
   the same `(lx, ly)` the emboss/gloss layers use, so shine swings with
   `lighting.angle` automatically.
3. **Composite `out`** (original minus offset copy): what survives is a
   sliver hugging every lit edge — the crescents.
4. **Round the caps**: Gaussian blur at ~0.6×`round`, then a steep alpha
   threshold (`feComponentTransfer` linear slope 14, intercept −5.6).
   Same trick as "gooey" filters — blur+threshold turns sharp sliver ends
   into rounded ink shapes.
5. **Flood** with the shine color (default white) at `opacity`, composite
   `in`, paint above the face/gloss layers, below glints.

All SVG 1.1 primitives in one filter, applied to ONE extra glyph-run copy
(text node in the classic pipeline, the compound word path in outline
mode — both work). Region is a bounded `userSpaceOnUse` rect sized from
the label (the Safari discipline every text filter here follows).

## MERGE COORDINATION (added 2026-08-08, after the app session shipped)

The app session's `claude/app-tweaks` branch (commit `8253a6c`) ported
this engine block onto main-based code and wired the panel — including
the Cap rounding knob (0–6 px, step 0.5, default 2), whose semantics the
Splash surface now mirrors. **Both branches therefore carry the engine
block.** Whichever PR merges second will conflict in `bevel.ts`/
`model.ts`: resolve by keeping the **text-effects branch's version** —
it is the superset (identical recipe, plus vector-outline `textPath`
support via `fxText`). The panel wiring from `app-tweaks` is the keeper
on the UI side.

## Where it already lives (engine is DONE, shared)

- **Model**: `TypeCfg.shine` in `src/generator/model.ts` —
  `{ on, size, inset, round, opacity, color? }`, sizes in px at the 52px
  master scale (same convention as `outline.width`). Optional and
  default-off: absent = byte-identical renders everywhere.
- **Renderer**: search `ink shine` in `src/generator/bevel.ts` — the
  filter (`id …tsh`) and the `shineLayer` emission in the label group.
  Skips `disabled` state like the other type effects.
- **Preset hygiene**: `applyTextPreset` already `delete t.shine` — a
  one-click treatment fully defines the look, as with `dim`/`fillStops`.
- Ships on branch `claude/text-effects-generator-vi6dis` (PR #236).

## What the app session needs to do

1. **Panel wiring only** — typography section (`src/ui/Panel.tsx`), an
   `FxToggle` "Shine" following the Glow block's pattern:
   - Size slider 1–10 (step 0.5), Inset 0–6 (step 0.5), **Opacity
     0–100**, and a **Blend `fieldbox` select over `BLEND_MODES`**
     (owner-required, glints-style — the engine wraps the layer in
     `mix-blend-mode` for anything but `normal`). Behind an `Adv` fold:
     Round 0–6 and the color `Well` (default white).
   - Writes via the usual `update((c) => { c.type.shine = … })`.
2. **State forks**: nothing special — `shine` rides `type`, which already
   forks per state via `stateDesigns`.
3. **Exports**: nothing to do — the filter rasterizes correctly through
   the sealed-`<img>` PNG path and ships in SVG singles/packs as-is.
4. **Optional, owner call**: a "Shine" entry (or shine-on variants) in
   `TEXT_PRESETS`. Do not pair it with star glints in any preset.
5. **Verify at extremes** per working agreements: max size on a thin face
   (Silkscreen), long label, hero scale, and a Safari pass alongside the
   other new type filters on the branch.

## Knob semantics (for control copy)

| Knob | Range | Meaning |
|---|---|---|
| size | 1–10 | how far the light reaches — crescent thickness |
| inset | 0–6 | gap between shine and the letter edge |
| round | 0–6 | cap rounding (blur+threshold strength) |
| opacity | 0–100 | ink strength |
| color | hex | shine ink, default `#FFFFFF` |
| blend | BLEND_MODES | composite against the faces — `normal` (flat ink), `overlay`/`soft-light` (glassy lift on gradients) |

Splash Text's surface exposes only size + inset (fixed round 2, opacity
100, white) — a reasonable default set if the kit panel wants to start
minimal too.
