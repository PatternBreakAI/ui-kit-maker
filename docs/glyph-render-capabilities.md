# UI Kit Maker — Glyph Render Capabilities (companion to the Contribution Spec)

*Hand this to the art-direction AI alongside the contribution spec. It
documents what the engine ACTUALLY does with glyph geometry — verified
against the renderer source, not invented. Do not request the renderer
files; this sheet is the interface, and render proof comes from the real
app (see "The render-proof loop").*

---

## 1 · How a semantic glyph actually renders

A glyph is dressed by the SAME parametric pipeline as every button in the
kit — that is the product's core promise (one coherent material system,
deterministic, with true app-to-Unity parity). The layer cake, in paint
order, with the app's real control locations:

1. **Face** — the kit's fill treatment: solid or **two-stop gradient**
   (Color & Material → fill roles; per-state variants exist). Gradient
   direction follows the kit's fixed light model.
2. **Pattern / texture** — the kit's pattern pass at the kit's opacity
   (Color & Material → Pattern). Applies inside the silhouette.
3. **Bevel wall** — parametric edge bevel (Candy → Bevel width); reads the
   kit's Bevel/Highlight/Shadow color roles under the fixed light.
4. **Extrusion** — parametric depth walls below the face (Candy →
   Extrusion). This IS the "three-quarter" story: depth is a kit dial, lit
   consistently top-left, with contact seams and wall shading built in.
   There is no arbitrary 3D rotation/projection — depth is parametric,
   not a camera.
5. **`detail` furnishing** (your geometry) — painted in the kit's
   **Shadow role ink at 0.92 opacity**, clipped to the silhouette. This is
   the engraved-groove system: seams, rims, recesses.
6. **Base glow pooling** — inside each `detail` region, the engine pools
   the kit's inner-glow ink (soft radial, brightest inside the shadow) —
   the same machinery as button extrusion shadows. Dial: Candy →
   Extrusion → Base glow, with a **per-glyph override slot** (`detailglow`:
   follow the kit, or this glyph's own 0–100 strength).
7. **`detailLight` furnishing** (your geometry) — painted in the kit's
   **Highlight role ink at 0.55 opacity**, over the shadow pass. The
   light-catch: a recess's lower lip.
8. **Gloss / specular** — the kit's gloss geometry (Candy → Gloss /
   Specular): position, coverage, and shape are kit dials; they read the
   silhouette automatically.
9. **`glints`** (your authored seats) — the HOUSE glint star stamped at
   your (x, y, s, r) seats. Opacity/blend ride Typography → Glints when
   that treatment is on; with it off, seats still shine at authored
   strength. (This is the four-armed concave house star — the *banned*
   shape is the generic AI-sparkle motif; the house glint is the approved
   one and the only one the engine will stamp.)
10. **State glow / aura** — hover/pressed/disabled variants with per-state
    glow, lift and sink (Candy → States); plus the kit's ambient bloom.
11. **Grounding shadow** — cast/contact shadows are kit- and
    placement-level (per-copy drop-shadow dials exist on boards), not
    baked into glyph art.

**Per-glyph individuality that already exists:** a single placed glyph can
be re-dressed with its OWN design fork (Editor → This piece: its own
colors, bevel, glow — the "Casino Lavender on one piece" machinery), its
own `detailglow` strength, and a mirrored `~flip` variant. That is how a
hero coin gets a warmer face than its neighbors — through a fork the
owner dials, not through per-path paint in the geometry.

## 2 · The capability checklist, answered honestly

| Requested | Status |
|---|---|
| Independent gradient per material zone | **No, by design.** Face/bevel/extrusion each read their own color ROLES (that's zone separation), but zones are kit-driven, not per-glyph-painted. |
| Multiple gradient stops + direction | Two-stop fills; direction follows the kit light model. No per-glyph gradient authoring. |
| Per-layer opacity | Fixed per layer (detail 0.92, detailLight 0.55, glints authored/kit); pattern & glow opacity are kit dials. Not per-glyph dials. |
| Per-layer blend mode | Glints support blend via the kit's Glints treatment. No general per-layer blend. |
| Clip masks from glyph geometry | **Yes** — detail/detailLight/base-glow are silhouette-clipped automatically. |
| Multiple shadow & highlight passes | **Yes, structurally**: detail (shadow), base-glow pool, detailLight (highlight), bevel shading, gloss, specular, state glow — each its own pass. Counts are fixed; inks are kit roles. |
| Directional gloss with width/hardness/fragmentation | Gloss geometry is a kit dial set; it is kit-wide, not per-glyph. |
| Shared global light direction | **Yes** — fixed top-left light model across the entire kit. Not adjustable per glyph (coherence). |
| Separate face / bevel / extrusion materials | **Yes** — separate color roles per zone, kit-wide. |
| Per-subpath z-order and extrusion | **No, and it will not be added.** Subpaths compose one silhouette; relief is expressed via detail/detailLight. This is the line between a glyph and an illustration. |
| Inner shadow / inner highlight | **Yes** — that is exactly what detail/detailLight ARE. |
| Adjustable ambient occlusion | The base-glow pool + detail shadow serve this; strength via the `detailglow` slot + kit dials. No separate AO dial. |
| Custom glint style/scale/rotation/opacity/placement | Placement, scale, rotation: **yes, authored per seat.** Style: house star only. Opacity: kit-following. |
| Consistent rendering at every size | **Yes** — deterministic parametric render at all sizes/states. |

**The engine will not grow per-glyph paint dials** (per-zone gradients,
per-layer blend/opacity authoring, subpath z-order). Three reasons, all
load-bearing: kit coherence (glyphs must restyle with the kit like every
other piece), app-to-Unity parity (every capability must survive the
export pipeline byte-for-byte), and determinism. Do not redesign the
target around imagined dials; design geometry that SINGS under the real
stack.

## 3 · Where illustration-grade art belongs

If the locked hero-coin illustration — per-zone gold gradients, painted
occlusion, bespoke rim light — is the target LOOK, that is the **Big
Glyph class** (see the contribution spec): full-color raster art with ZERO
engine constraints, placed as artwork, with engine-side shadow/glow
effects at placement. The strongest delivery for a hero coin is BOTH:
the illustrated big glyph (the marketing/hero look) AND the semantic
silhouette sibling (the same coin as a kit-coherent icon that restyles
with every kit). They share proportions, not pixels.

## 4 · The render-proof loop (the new standard, agreed)

Never mock up an "app render" — a simulated result is disqualified as
evidence, full stop. The loop:

1. Deliver geometry per the contribution spec (JSON + raw silhouette SVG,
   with detail/detailLight/glints).
2. The owner hands it to the main engineering session, which renders it
   through the REAL engine: a contact sheet — front view, all four
   states, S/M/L, on the current kit and on a contrast kit, extrusion
   armed (the parametric ¾ depth) — actual product pixels.
3. That sheet comes back to you as ground truth. The curator questions
   are asked OF THAT SHEET, and iteration continues on geometry: deepen a
   groove (detail), move a light catch (detailLight), reseat a glint —
   then re-render.

What you control is geometry and seats; what the kit controls is paint.
A great glyph is one whose grooves, catches and glints make the KIT's
materials look expensive — on every kit, not just gold.
