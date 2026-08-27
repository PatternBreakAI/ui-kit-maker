# UI Kit Maker — Glyph Contribution Spec

*Hand this document to any AI (or human) you're collaborating with on glyph
artwork. It is self-contained: everything the engine needs to ingest new
glyphs is defined here. Deliverables that follow this spec drop straight
into the pipeline; deliverables that don't will bounce back for rework.*

UI Kit Maker has **two glyph classes** with different contracts. State which
one you're producing at the top of every delivery.

---

## Class 1 — Semantic glyphs (vector silhouettes)

These are icon silhouettes the engine dresses in the kit's full layer cake
(face, pattern, bevel wall, extrusion, glow). You supply **geometry only** —
never colors, gradients, strokes, or effects. The engine paints everything.

### Geometry contract (hard requirements)

1. **Closed, filled outlines only.** The artwork is a solid silhouette.
   Interiors read as solid; do not simulate interior detail with gaps
   unless it is a true counter-hole (like the hole in a donut).
2. **Path commands: absolute `M`, `L`, `C`, `Z` only.** No arcs (`A`), no
   relative commands, no `Q`/`S`/`T` shorthands, no transforms. Convert
   arcs to cubic Béziers before delivery.
3. **Multi-subpath is welcome** — counter-holes and islands are first-class.
   Every subpath must close with `Z`.
4. **One square-ish viewBox**, declared explicitly (e.g. `0 0 512 512`).
   Artwork should fill roughly 80–90% of the box, visually centered.
5. **No hairlines.** Any feature thinner than ~2% of the box width will
   vanish under bevel treatment. Chunky, confident silhouettes survive;
   delicate line art does not.
6. **Must read at 24 px.** Squint test: if the silhouette isn't
   recognizable at thumbnail size, simplify.

### Optional furnishing (nice to have, never required)

- `detail` — interior furnishing subpaths (same box, same command
  contract) that the engine paints in the kit's SHADOW ink, clipped to the
  silhouette. Use for recessed detail (a coin's rim bands).
- `detailLight` — light-catch subpaths painted in the kit's HIGHLIGHT ink.
  Pair with `detail` to describe an inset: shadow on the recess's upper
  wall, light on its lower wall.
- `glints` — sparkle seats: `{ x, y, s, r? }` (position, point-radius,
  optional rotation) in the same box, where the kit's glint star may
  land.

### Delivery format (per glyph)

One JSON object exactly in this shape, plus a standalone `.svg` preview of
the raw silhouette (black fill, no styling):

```json
{
  "id": "lowercasenospaces",
  "name": "Human Name",
  "category": "one of the eight below",
  "vb": [0, 0, 512, 512],
  "d": "M ... Z",
  "detail": "M ... Z (optional)",
  "detailLight": "M ... Z (optional)",
  "glints": [{ "x": 128, "y": 96, "s": 14, "r": 15 }],
  "source": "who made this geometry, and from what",
  "license": "exact license, see Provenance"
}
```

Categories (use exactly one): `Currencies & Resources`,
`Progression & Achievement`, `Boosters & Power-ups`,
`Rewards & Collections`, `Gameplay Status`, `Commerce & Economy`,
`Navigation & System`, `Social & Retention`.

---

## Class 2 — Big glyphs (raster art pieces)

Painterly/dimensional art pieces (a crown, a money bag, a cupcake) placed
as artwork on boards. These ship as pixels; the engine adds effects
(shadow, glow) at placement time — so deliver them clean.

1. **Transparent PNG** (PNG-24 with alpha). No background, no matte halo.
2. **1024–2048 px on the long side.** Subject fills the frame, centered,
   with a small breathing margin.
3. **No baked drop shadow, no baked outer glow** — the engine applies
   those per-placement. Baked-in contact shading *on the object itself*
   (inside its silhouette) is fine and good.
4. One consistent camera/lighting family per set: soft top-left key light,
   slight 3/4 dimensionality, saturated but not neon. Match the existing
   set's feel (crown, key, minecart, money bag, star) when extending it.
5. Filename = the glyph's id, lowercase (`moneybag.png`).

Delivery: the PNG(s) plus one JSON line each:
`{ "id": "...", "name": "...", "source": "...", "license": "..." }`

---

## Provenance & licensing (both classes, non-negotiable)

- Every delivery states `source` and `license` truthfully. Acceptable:
  **original work** ("authored for UI Kit Maker, 2026, by <who>"),
  **CC BY 3.0/4.0** with the exact attribution string, or **MIT/ISC**
  icon sets with the set named. Anything else: ask first.
- **No traced or near-copies of copyrighted or trademarked artwork.** No
  brand marks, no game-specific iconography from shipped titles.
- AI-generated work is acceptable **with disclosure** in `source`
  (e.g. "AI-generated, original composition, prompted by <who>") — the
  product labels AI-generated art honestly, and store packaging may
  exclude it, so the flag must be accurate.
- **Never the four-point "AI sparkle/star" motif.** House rule, zero
  exceptions, including inside compositions.

## Quality bar (what gets a delivery accepted)

- Semantic: silhouette reads at 24 px; no arcs/relative commands; subpaths
  closed; no hairlines; sensible category; honest provenance.
- Big glyph: alpha edge is clean at 100% zoom (no white fringe, no
  checkerboard remnants); consistent with the set's lighting; honest
  provenance.
- Names are semantic (what it IS, not how it looks): `magnetpull`, not
  `redswirl2`.

## What happens after delivery

Paste the JSON (and attach files) back to the main session. Ingestion
runs: geometry safety checks (the engine's offset kernel rejects
non-conforming paths), a rendered contact sheet across kit treatments for
the owner's review, and staging behind the admin gate — **nothing ships
until the owner releases it**. Attribution is generated automatically
from `source`/`license` and rides every export's papers, so those two
fields being exact matters.
