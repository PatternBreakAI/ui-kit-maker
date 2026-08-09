# Splash Text — how the art is made

Written 2026-08-08 at the owner's request, to share with ChatGPT for
feedback on the creation process. Self-contained: no codebase knowledge
assumed. Questions for the reviewer are at the end.

## The premise

Splash Text generates "super over-illustrated" lettering — retro-sticker
words, chunky poster type — as clean, portable vector art (SVG, and PNG
rasters of it). The core constraint that shapes every technique:

**Nothing is hand-drawn, ever.** All art derives programmatically from
two inputs: the text the user typed, and a set of style knobs. Any word,
any font, any knob combination must produce coherent art with no
per-letter authoring. Everything below is a consequence of that.

Secondary constraints, all hard:

- **SVG 1.1 only** — the files must open true in Figma, Illustrator, and
  every browser (Safari included, which has strict filter-region limits).
  No shaders, no canvas rasterization, no CSS 3D.
- **Vector honesty** — any "3D" is trompe-l'œil built from flat vector
  operations. We never fake detail with embedded bitmaps.
- **Live editability** — the text stays text. Art regenerates on every
  keystroke in real time, so every technique must be cheap.

## The fundamental move: the word is ONE shape

The foundation everything else stands on: the entire word/block is
converted to a **single compound vector path** (real font outlines,
kerned and laid out ourselves — multiline, per-line scaling, per-letter
tilt and per-letter size all baked into the path geometry).

Why it matters artistically:

- A stroke on that path follows every letter's contour but never crosses
  a neighboring letter's face — the word decorates as one object, the
  way a hand-lettered logo would.
- Distortions (arch, bulge, the 60s "groove" where lines swell into
  each other) bend the WHOLE block as one object: curves are subdivided
  until locally flat, then every point passes through an envelope
  function. Wood-type poster logic ("poster fit") scales each line
  uniformly to a shared measure so the stack packs like a brick.
- Per-letter edits stay proportional: a letter's size is a multiplier
  baked into layout (baseline-anchored, advances reflow), so global
  scaling scales the composition, edits included.

## The layer stack (bottom to top)

Every layer derives from the same compound path's alpha — one source of
truth, so all layers agree perfectly at any size:

1. **Stage** — flat color, transparency, or a user image.
2. **Ground shadow** — soft blur of the whole blob, dropped down.
3. **Backsplash** — the signature move: a blob that is wrap + leaning
   block-extrusion as ONE silhouette. The wrap is true stroke geometry
   (round joins following the curves — never morphological dilation,
   whose box kernel squares off corners). The extrusion is a single
   smooth morphology sweep + offset (never a ladder of stacked copies),
   and it treats the stroke as the outer boundary, so the whole blob
   extrudes as one object. Can wear a vertical gradient (painted through
   a luminance mask of the filtered silhouette) or a seamless pattern.
4. **Drop shadow** — of stroke + letters together, in front of the
   backsplash, behind everything else.
5. **True stroke** — a traditional contour hugging each letterform,
   rendered as one whole-word underlayer.
6. **Letter fill** — solid, two-stop gradient, or multi-stop banded
   gradients (gold/chrome need hard horizon stops).
7. **Letterform pattern** — seamless tiling cells (dots, stripes,
   houndstooth…) clipped inside the glyphs; tone-on-tone by default or
   any chosen ink, with blend modes.
8. **Wall bevel** — the chiseled candy edge (below).
9. **Candy gloss** — a hard-edged band across the upper glyph faces
   (gradient with a near-instant opacity cliff), optional blend mode.
10. **Ink shine** — hand-inked-looking highlight crescents (below).
11. **Grain** — micro-noise clipped into the glyphs.
12. **Sparkles** — crisp vector glints (stars/streak/sheen styles)
    clipped to ride the letter faces.

One **master light angle** steers every directional effect at once —
shine offset, bevel slope split, sparkle placement — so relighting the
piece is one dial, and the layers never disagree about where the light
is.

## Two signature techniques in detail

**Ink shine** (the owner's concept): the sliver of a shape that "sees
the light" is the part its own shadow-side copy does not cover. Erode
the glyph alpha slightly (so the shine floats inside the edge, like
hand-inked placement — and features too thin to matter get no shine,
which reads intentional), offset the eroded copy away from the light,
subtract, and the survivors are crescents hugging every lit edge: bowls
get shoulder sweeps, stems get caps, automatically, in any font. A blur
followed by a steep alpha threshold rounds the sliver tips into plump
ink shapes (the classic "gooey" trick).

**Wall bevel**: erode the glyph to a plateau; the ring between plateau
and edge is the chamfer. Split that ring directionally: offset the glyph
away from the light — what the offset copy fails to cover is the
light-facing slope (painted light); the opposite offset gives the
shade-facing slope (painted dark). A small blur models the chamfer's
curvature, and everything is clipped back to the ring so the plateau
face stays crisp — even on fat display faces whose thin features erode
away entirely.

## Craft disciplines (learned the hard way)

- Wraps/outlines are NEVER morphological dilation (box kernel = squared
  corners). Always true stroke geometry.
- Extrusion is ONE sweep, never stacked blended copies.
- Filter regions are always bounded and sized from the label itself
  (Safari refuses unbounded/oversized regions).
- Gradients through filters go via luminance masks (filters can only
  flood flat color).
- Every layer is emitted through one shared placement function, so no
  layer can ever drift out of register with the others.

## Where we want to push the art next (the ask)

The owner wants "more detailed art." Candidate directions, all feasible
within the constraints, none yet built:

1. **Secondary light** — a subtle cool rim/bounce light opposite the key
   light (second shine pass, inverted direction, low opacity, tinted).
2. **Occlusion shading** — darkening where letters meet the backsplash
   cavities (dilate-the-inverse tricks can approximate contact shadow).
3. **Halftone shading** — pattern-based tone in the bevel slopes or
   shadow side of letters (comic-print language; we already have
   seamless pattern cells).
4. **Edge wear / print misregistration** — slight offset of the fill vs
   stroke plates, or noise-eroded edges, for a vintage print feel.
5. **Texture in the extrusion wall** — the block-shadow side carrying
   subtle grain or hatching separate from the faces.
6. **Chromatic ink** — tight RGB fringe on shine/gloss for a glassy,
   printed-in-layers look.
7. **Baked-in "ink squash"** — slightly rounding/thickening glyph
   corners globally (blur+threshold on the source path) so any font
   reads more hand-pressed.

## Round 2 — progress report sent back to the reviewer (2026-08-08)

After the reviewer's construction-tier diagnosis, the same day we
shipped: multi-contour bands (≤3, cumulative stroke reaches, painted
outermost-first, with the OUTERMOST band now the silhouette the body
extrudes/wraps/shadows/masks from); inline/inset rings (erode
difference); backsplash as a toggle so directional extrusion carries
the silhouette alone; hard graphic shadows (blur-0 drop shadow of the
whole construction); and two construction-recipe starters (Comic Pop,
Varsity) with the backsplash off. Queued in the reviewer's order:
per-line styling, occlusion, alpha-height form profiles
(FLAT/ROUNDED/CHAMFER/PILLOW — the existing wall bevel becomes
CHAMFER), halftone scoped to extrusion walls, misregistration/wear as
style families, visual budgets + material-responsive shine. Follow-up
questions posed: which properties vary vs lock in per-line styling;
preferred silhouette-only occlusion recipe; feDiffuseLighting height-
field practice; a concrete starter budget matrix; and what to grade
first against the POW!/SUPER BOXING targets.

## Questions for the reviewer

1. Rank the seven directions above by perceived-craft-per-complexity —
   which two or three would make the average output read most
   "professionally illustrated"?
2. What's missing from that list? Looking at top-tier sticker/poster
   lettering (Butcher Billy, vintage Disneyland attraction posters,
   modern Dribbble type work), what specific visual devices do they use
   that a geometry-derived pipeline like ours could reproduce?
3. Our shading is currently all hard-edged or single-blur. Is there a
   principled way to get richer tonal modeling (form shadows, not just
   edge effects) from silhouette alpha alone, within SVG 1.1 filters?
4. Any traps you foresee in the seven directions — things that will look
   mechanical or repetitive across many words/fonts because they derive
   from the same geometry?
5. The look must stay coherent when a user cranks every effect at once.
   Any art-direction principles we should encode as guardrails (e.g.
   "shine and rim light never both at full strength")?
