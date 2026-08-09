# Splash Text — product model (canonical)

2026-08-09. The product direction from the owner + outside review,
adopted before the Splash 2 prototype. This supersedes any earlier
framing of Splash as a material lab with better bevels.

## The principle

**Style first in the experience; typography first in the compiler.**

- Selecting a style (e.g. `Candy`) instantly applies a complete
  recommended treatment: font roles, casing, hierarchy, composition,
  smart distortion, appearance stack, material, lighting, optional
  scene defaults. The prebaked professional result is the magic.
- Nothing is flattened or locked. Typography, layout, appearance,
  finish and scene remain independently editable. The preset is a
  starting grammar, not a flattened artifact.
- The style supplies judgment. The editor supplies authorship.

## Compile order (never render-then-distort)

```
source text
→ semantic roles and line structure
→ typography and layout
→ per-glyph overrides
→ deformation
→ ink topology / union / welding
→ appearance construction
→ material and lighting
→ finish effects
→ scene
```

A layout change regenerates every downstream layer. The engine never
renders the completed style and then distorts the rendered result.

## Storage model

```
resolvedTreatment =
  styleRecipe
  + typographyOverrides
  + layoutOverrides
  + appearanceOverrides
  + finishOverrides
  + sceneOverrides
```

Style defaults live apart from user overrides, so restyling and
re-editing compose instead of destroying each other.

## Selection and typographic ownership

Selection levels: composition · line · glyph.

Per-glyph controls: scale X/Y, baseline shift, rotation, width,
spacing before/after, optional font override, optional face override,
front/back order where supported.

Resize behavior: **Reflow** (neighbors' advances update) ·
**Overlap** (neighbors hold position; the letter intrudes
deliberately). Both are professional lettering moves.

**Force to Column** is the existing `fit: "column"` behavior from
`src/splash/outline.ts` (`flatWordOutline`): every line scales
UNIFORMLY to one shared measure (widest line as set), with the cap
that keeps a lone punctuation line from exploding the block; stays
editable and refits as you type. Reinstate that behavior — do not
reinterpret it.

## User-facing editing stages

1. Style   2. Type   3. Layout & Shape   4. Appearance Stack
5. Finish  6. Scene

`Candy` is one style chip; palettes are controls within it.

## Gradients (full authorability)

Each Fill/Gradient layer: 2–6 stops, stop positions, per-stop opacity,
linear/radial/banded, angle, balance, spread, hardness, repeat/mirror,
glyph/line/composition space, optional link to master light, opacity,
blend. Users add, duplicate, reorder and stack fills.

## Gloss is a real layer

```
GlossLayer {
  mode: band | streak | crescent | broken
  angle · linkToLight · position · coverage · width
  leadingHardness · trailingHardness
  fragmentation · fragmentCount · fragmentLength · fragmentGap ·
  fragmentVariation · seed
  curvature · color · opacity · blend
  scope: composition | line | glyph
  clipTo: face | plateau | bevel
}
```

Two related concepts: the broad GLOSS BAND defines the highlighted
zone; the deterministic FRAGMENT MASK breaks it into hand-placed-
looking streaks. No mechanical identical highlight per glyph unless
glyph scope is chosen deliberately.

## Finish Stack (after material)

The Appearance Stack builds the lettering; the Finish Stack
art-directs the finished lettering: gloss, highlight fragments,
sparkle/glint, halftone, grain, wear, print misregistration,
chromatic fringe, edge distress. Layers support add/remove/duplicate/
reorder/hide, scope, opacity, blend, deterministic seed. Finish never
substitutes for typography controls.

## Canvas and backdrop

The whole right-hand region is the canvas — never a card or nested
preview box inside it. The floating toolbar owns the VIEWPORT
backdrop (color, transparency grid, light/dark, zoom, fit, pan);
backdrop is preview-only and never exported. Exportable backgrounds
are Scene Stack layers (`Stage Fill`, burst, plaque, rays, …).

```
viewport backdrop = preview only
scene background  = artwork
```

## Prototype proof (the gate for the Splash 2 build)

From the single `Candy` style chip, three results without changing
styles:

1. **Connected script** — Pacifico-class face, union/weld, user-edited
   line relationship, fragmented diagonal gloss, custom three-stop
   gradient.
2. **Chunky rounded** — Baloo 2, user-adjusted bevel, pattern layer,
   broad soft gloss, one glyph enlarged with Reflow.
3. **Condensed poster** — sharp display face, Force to Column, one
   glyph enlarged with Overlap, different multi-stop gradient,
   reordered depth layers, hard narrow gloss fragments, actual scene
   background.

All three must clearly share Candy's material family while feeling
individually authored.

## Known constraint notes

- Blend modes: SVG 1.1 has no mix-blend-mode; blends must be
  approximated with pre-multiplied colors/opacity or documented as a
  renderer-specific extension. Finish/gradient blend fields are part
  of the schema but resolve conservatively in the SVG 1.1 target.
- Ink welding is served by a deterministic grid-union retrace
  (Model-C-lite) until a full offset/Boolean kernel earns its place.
