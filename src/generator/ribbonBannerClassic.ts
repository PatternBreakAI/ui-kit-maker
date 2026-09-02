/* ── Classic Ribbon Banner — the owner's ribbon commission (sketch pass) ──
   GEOMETRY RE-AUTHORED 2026-09-01 (second pass) to the owner's exact-shape
   ruling on the branch preview — a reference image captioned "this is the
   shape exactly", four verdicts, and the owner's own construction recipe —
   then TRIMMED 2026-09-02 on the owner's third note ("the end flaps are a
   bit too wide": 94 → 75) and TRIMMED AGAIN on their fourth ("let's
   shorten those edges to about the width of those red boxes" — the two
   red rings they drew measure ~0.185 of the panel's width, i.e. ~50 of
   the panel's 272): each tail's visible reach beyond the panel is now 50
   (75 → 50, about a third off again), the panel box itself untouched
   through both trims. The rulings:

   · "main banner and tails need to be the same height"
   · "sides of the banner need to go straight up and down vertically"
   · "main banner and tails can be staggered vertically but each piece
     should measure the exact same height from top to bottom"
   · the recipe: "the tails were made by making copies of the main banner,
     making them less wide, pushing them to the back and pushing them
     inwards a few hundred pixels, then I add points on the center outside
     of each tail, then pushed those pixels in (toward the center) a few
     hundred pixels... then the underside of the banner (or connectors)
     are just lines drawn in to connect the angles"

   Built exactly by that recipe, in a 372×100 box (~3.72:1 after the
   second trim; the owner's width corrections supersede the reference's
   measured 4.6):
   · CENTER PANEL: a sharp-cornered rectangle, VERTICAL sides, its top
     edge the banner's topmost line — x 50–322 (272 wide, ~73% of the
     width), y 0–72. Piece height H = 72. UNCHANGED by both trims.
   · TAILS: COPIES of the panel rectangle made less wide (86 each: 50
     visible + the 36 tuck), pushed behind and staggered DOWN by 28
     (~39% of H) — so each tail band runs y 28–100: the SAME 72 height
     as the panel, exactly, by construction. Outer edges vertical
     (x 0 / x 372, corners stacked); inner ends tuck under the panel,
     running 36 past the panel's side (x 50→86 left, 322→286 right).
     One added midpoint on each OUTER edge pushed toward center forms
     the V notch: apex 37 in (~43% of the tail's width — the ratio the
     owner approved, held through the trim), vertically centered on the
     band (y 64). The apex stays 13 clear of the panel's edge, so the
     whole V lives in the visible run and the swallow-tail still reads.
   · FOLDS ("the underside of the banner... just lines drawn in to
     connect the angles"): right triangles from the panel's bottom
     corner to the tail's inner-bottom corner, closed on the tail's
     inner edge at panel-bottom height — (50,72)-(86,100)-(86,72)
     and its mirror. The tuck run held at 36, so the fold triangle is
     byte-for-byte the same size and slope as both earlier passes.
   · BONES: panel 4 corners · each tail 5 vertices (outer-top, inner-top,
     inner-bottom, outer-bottom, notch apex) behind the panel with its
     inner run overlapped · folds 3-vertex right triangles.
     Z-order unchanged: tails behind → folds → panel front.

   PAINT IS STILL THE KIT'S: every part maps to a kit role in bevel's
   ribbonbanner case (the render-capabilities contract). The strictSilhouette
   is the same construction unioned into ONE closed M/L/Z path
   (mirror-symmetric about x=186, touches all four edges of its 372×100
   box — see the round's geometry self-check). It is the kit shell's
   outline, so bevel wall, extrusion and shadow sweep the whole ribbon in
   one pass — the one-slab depth as before. The panel's corners are SHARP
   by authored intent (the reference shows no rounding); the kit's material
   dressing may still soften the rim the way it dresses any silhouette,
   but the geometry itself carries no radius. The center panel is a TEXT
   FIELD by construction: words ride a live label seat (the kit's
   lettering), never baked into the art. */

export const RIBBON_BANNER_CLASSIC = {
  id: "ribbonbannerclassic",
  name: "Classic Ribbon Banner",
  viewBox: [0, 0, 372, 100] as [number, number, number, number],
  strictSilhouette: {
    d: "M 50 0 L 322 0 L 322 28 L 372 28 L 335 64 L 372 100 L 286 100 L 286 72 L 86 72 L 86 100 L 0 100 L 37 64 L 0 28 L 50 28 Z",
  },
  parts: {
    leftTail: "M 0 28 L 86 28 L 86 100 L 0 100 L 37 64 Z",
    rightTail: "M 372 28 L 286 28 L 286 100 L 372 100 L 335 64 Z",
    leftFold: "M 50 72 L 86 100 L 86 72 Z",
    rightFold: "M 322 72 L 286 100 L 286 72 Z",
    centerPanel: "M 50 0 L 322 0 L 322 72 L 50 72 Z",
    panelTopCatch: "M 54 4 L 318 4 L 318 10 L 54 10 Z",
    panelBottomShadow: "M 54 65.5 L 318 65.5 L 318 69.5 L 54 69.5 Z",
    leftTailHighlight: "M 5.3 32 L 84 32 L 84 38 L 13 38 Z",
    rightTailHighlight: "M 366.7 32 L 288 32 L 288 38 L 359 38 Z",
    /* the fold-light wedges are GONE (owner corner mockup, 2026-09-02:
       "fill in this corner with one color") — each fold is one flat
       opaque dark now, painted in bevel's ribbonbanner case. */
  },
  /** authored house-glint seats — the kit's glint star at (x, y),
   *  point-radius s, rotation r°, in the same 372×100 box */
  glints: [
    { x: 59, y: 7, s: 5, r: -8 },
    { x: 313, y: 13, s: 3.2, r: 8 },
  ],
  source: "Geometry authored in-house for UI Kit Maker, 2026-09-01/02, by the owner's own construction recipe against their exact-shape reference (tails as same-height copies of the banner, staggered behind, V notches pushed in from an added outer midpoint, fold connectors drawn to close the angles), with the owner's two flap trims (visible tail reach 94 → 75 → 50, sized to their red-ring markup) — superseding both the ingest pack's paths and the first re-authoring; construction and part scheme follow the pack's assembly, under the creative direction of Chevon Hicks.",
  license: "original work",
} as const;
