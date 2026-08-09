# Splash Text — bevel math brief (for outside review)

2026-08-09. Written for a second opinion on our vector bevel/offset
construction. It is still producing visible clipping artifacts at
letterform tips under close inspection, and we want a critique of the
approach itself, not just the tuning. Everything below is the real
system as shipped on the branch today.

## What the machine is

A procedural display-typography engine ("Splash Text") that compiles
arbitrary user text into finished lettering treatments (comic POW!
bursts, candy, gold, ice, sports crests…). Hard constraints:

- Output is plain **SVG 1.1** (paths, gradients, masks, clipPaths, one
  gaussian blur filter) — must survive Safari, Figma and Illustrator
  import. No `feMorphology` in the render path, no CSS, no canvas.
- **Deterministic**: same text + recipe + seed → byte-identical SVG.
- **Live regeneration** while typing: ~150ms per lockup is our budget.
- Arbitrary fonts (Google Fonts TTFs via opentype.js) and arbitrary
  text. No hand-authored per-word or per-glyph corrections, ever.
- High-resolution downloads: we compile at a **16× master scale**
  (recipes are authored at a 150px em for readable numbers; every
  px-authored parameter is multiplied by 16 and the letterforms are
  typeset at a 2400px em; a single word tile emits at ~7400×5000).

## How a bevel is built (the "crescent sandwich")

There is no lighting model at render time — the bevel is the classic
designer trick: stacked fills of the same silhouette, offset and
shifted, so the overlaps read as lit and shaded slopes. For a material
with rim + bevel, the face stack paints in this order (all in one
"face" pass over the glyph silhouette):

1. **rim** — the full silhouette, filled in the rim color (reads as a
   colored crescent on the side away from the key light once the later
   layers cover the rest).
2. **lit slope** — the silhouette **contracted** by the rim inset
   (`inset = rimWidth × 0.9`) and **translated toward the key light**
   by `rimWidth × 1.05`, filled with a lightened tone. Clipped to an
   unshifted half-inset region so at needle apexes the tip cap is owned
   by the rim (see "apex handling").
3. **shade crescent** — contracted by `inset + bevelWidth × 0.45`,
   translated **away** from the light by `bevelWidth × 0.4`, dark tone.
   Clipped to layer 2's region.
4. **plateau** — the diffuse gradient, contracted by
   `inset + bevelWidth`, nudged toward the light by `bevelWidth × 0.25`.
   Clipped to layer 2's region.
5. **specular** — a hard gradient band per glyph, clipped to layer 4's
   region (gloss lives on the face, not on the rings).

The clips are SVG `clipPath`s built from the same geometry with the
same offset machinery ("a shifted contraction can never escape the
layer beneath it"). Soft profiles add a small gaussian blur to layers
2–3. Light direction comes from one LightRig; contract/translate
directions all derive from it.

## The offset math (the part we want reviewed)

Glyph outlines (opentype.js path commands) are flattened to polylines
at **~2.5px absolute sampling** (curves subdivided by control-net
length; straight segments stay single segments), grouped per glyph.
Counters are separate contours; hole-ness is decided by ray-cast
containment **parity within the same glyph only** (overlapping
neighbor glyphs — script joins, tucked lockups — must not flip a
contour into a hole).

Inward offset (`inflateOutline` with negative r) is per-vertex, not a
true polygon offset:

1. **Decimate** the contour to spacing `clamp(|r|/6, 1.5, 30)` px,
   preserving corners (turn > ~20° always survives). Rationale:
   boundary detail finer than the offset radius is geometrically
   meaningless after offsetting. A coarser copy at `clamp(|r|/2, 4, 80)`
   is kept as a containment probe.
2. For each vertex, average the two adjacent **edge normals** (ink-
   outward, using shoelace winding, hole contours flipped) into v̂.
3. **Join handling**: let `dot = |v̂ · n̂_edge|` (cosine of the half
   corner angle).
   - `dot < 0.34` (needle apex): **drop the vertex** — a bevel join;
     the neighbors' offsets bridge it with a flat cut.
   - otherwise move the vertex by the **miter length** `r / dot`.
   (Outward offsets deliberately do NOT miter — they undershoot with
   the averaged normal so wall geometry tucks under round-joined
   border strokes above it.)
4. **Validity**: the moved point must land **inside the ink** (i.e.
   inside its own contour for outers, outside for holes), tested by
   ray-cast against the coarse probe. Points that fail are dropped.
   This is our defense against the classic failure: where the feature
   is *locally thinner than the offset depth*, the two offset sides
   cross, and the crossed strip fills as a detached flake. (We shipped
   exactly those flakes at the W's needle apexes before this test.)
5. **Collapse detection**: if the offset contour's area shrinks below
   2% of the original or flips sign, the contour is considered
   collapsed. Collapsed or validity-gutted contours retry at **0.6×
   then 0.35× depth** before vanishing — a stroke too thin for the
   full bevel keeps a shallower bevel instead of losing a piece.
6. **Finish**: one Chaikin corner-cut pass (round-join look, melts
   residual bowtie lobes), then a perpendicular-deviation prune
   (`tol = max(0.12, |r| × 0.02)`) to keep path bytes sane.

Timing at 16× master scale: ~150ms per compiled lockup, all layers.
Naive validity (no decimation, full-resolution point-in-poly) was
~3s/lockup, which is why the probe exists.

## Apex handling and what still shows ("it's still clipping")

At needle apexes several defenses interact: the bevel-join drops the
apex vertex (flat chord), validity deletes crossed points, the lit
slope is clipped to an unshifted half-inset so the rim owns the tip
cap, and the specular is clipped to the plateau.

This eliminated the detached flakes and the checkered patchwork we had.
But under close zoom (~10×+ of display size) the tips still show:

- **flat chord truncations** where the bevel-join cut replaces the
  apex — the bevel ring visibly "squares off" instead of tapering to
  a point the way a true offset (or Illustrator's Offset Path with
  round joins) would round it;
- **hairline seams and slivers** where the clipped layers abut — the
  clip chords of different layers land at slightly different heights
  (each layer has a different contraction depth and shift), so the tip
  region is a stack of straight cuts rather than one resolved shape;
- occasional 1–2px **transition stubs** where the specular's clip edge
  crosses the rim boundary.

In short: each individual pathology has been patched, but the apex is
resolved by four interacting heuristics rather than by construction.
That is the smell we want an outside opinion on.

## Questions for review

1. **Is per-vertex offsetting the wrong foundation?** Should we bite
   the bullet and implement a true polygon offset with intersection
   clipping — e.g. a deterministic TS port of the Clipper-style offset
   (offset each edge, join with arcs/miters, then resolve the winding
   with a polygon clipping pass), or a straight-skeleton–based inset?
   Constraints: pure TS, deterministic, no WASM dependency preferred,
   budget ~150ms/lockup for ~6–10 offsets across ~10 glyphs at 2400px
   em. Is that budget realistic for proper offsetting at this scale?
2. **Is the crescent sandwich itself the right bevel model?** The
   alternative we already have working is true per-edge geometry: our
   extrusion module builds real wall strips per boundary edge with
   orientation classes (used for 3D walls). A bevel could be built the
   same way — per-edge quads between the silhouette and its inset,
   toned by edge normal vs light — giving a *geometrically correct*
   bevel with per-edge shading and no layer-clip interactions at tips.
   Cost: more path data, and inside corners need care. Would you go
   there, keep the stacked-fills model, or hybrid (stacked fills on
   bodies, per-edge geometry only near high-curvature/apex zones)?
3. **Apex aesthetics**: for display lettering, what SHOULD a bevel do
   at a needle apex — taper to nothing (slope narrows with the local
   thickness), round off (round join), or flat-cut (bevel join)? Is
   there a principled rule from type design / photoshop layer-style
   behavior we should copy?
4. **Any standard trick we're missing** for making N differently-inset
   shifted layers resolve cleanly at converging tips (a single shared
   "tip cap" geometry, a union clip, morphological closing before
   layering, …)?
5. Sanity-check the parameter choices: 2.5px sampling at 2400em,
   decimation at |r|/6, probe at |r|/2, bevel-join threshold
   cos ≈ 0.34 (~70° full angle), Chaikin ×1, prune at 2% of |r|.

## What NOT to relitigate

- SVG 1.1, determinism, live-typing budget, arbitrary text: fixed.
- The layered-fills *look* (flat graphic strata, one light) is the
  product's art direction; a physically-lit 3D render is not the goal.
- The 16× master scale / high-res download posture is a product
  decision and is staying.
