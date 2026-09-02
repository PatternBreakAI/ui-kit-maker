/* ── Classic Ribbon Banner — the owner's ribbon commission (sketch pass) ──
   GEOMETRY RE-AUTHORED 2026-09-01 (second pass) to the owner's exact-shape
   ruling on the branch preview — a reference image captioned "this is the
   shape exactly", four verdicts, and the owner's own construction recipe —
   then TRIMMED 2026-09-02 on the owner's third note ("the end flaps are a
   bit too wide"): each tail's visible reach beyond the panel comes in
   ~20% (94 → 75), the panel box itself untouched. The rulings:

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

   Built exactly by that recipe, in a 422×100 box (~4.2:1 after the trim;
   the owner's width correction supersedes the reference's measured 4.6):
   · CENTER PANEL: a sharp-cornered rectangle, VERTICAL sides, its top
     edge the banner's topmost line — x 75–347 (272 wide, ~64% of the
     width), y 0–72. Piece height H = 72. UNCHANGED by the trim.
   · TAILS: COPIES of the panel rectangle made less wide (111 each: 75
     visible + the 36 tuck), pushed behind and staggered DOWN by 28
     (~39% of H) — so each tail band runs y 28–100: the SAME 72 height
     as the panel, exactly, by construction. Outer edges vertical
     (x 0 / x 422, corners stacked); inner ends tuck under the panel,
     running 36 past the panel's side (x 75→111 left, 347→311 right).
     One added midpoint on each OUTER edge pushed toward center forms
     the V notch: apex 48 in (~43% of the tail's width), vertically
     centered on the band (y 64).
   · FOLDS ("the underside of the banner... just lines drawn in to
     connect the angles"): right triangles from the panel's bottom
     corner to the tail's inner-bottom corner, closed on the tail's
     inner edge at panel-bottom height — (75,72)-(111,100)-(111,72)
     and its mirror.
   · BONES: panel 4 corners · each tail 5 vertices (outer-top, inner-top,
     inner-bottom, outer-bottom, notch apex) behind the panel with its
     inner run overlapped · folds 3-vertex right triangles.
     Z-order unchanged: tails behind → folds → panel front.

   PAINT IS STILL THE KIT'S: every part maps to a kit role in bevel's
   ribbonbanner case (the render-capabilities contract). The strictSilhouette
   is the same construction unioned into ONE closed M/L/Z path
   (mirror-symmetric about x=211, touches all four edges of its 422×100
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
  viewBox: [0, 0, 422, 100] as [number, number, number, number],
  strictSilhouette: {
    d: "M 75 0 L 347 0 L 347 28 L 422 28 L 374 64 L 422 100 L 311 100 L 311 72 L 111 72 L 111 100 L 0 100 L 48 64 L 0 28 L 75 28 Z",
  },
  parts: {
    leftTail: "M 0 28 L 111 28 L 111 100 L 0 100 L 48 64 Z",
    rightTail: "M 422 28 L 311 28 L 311 100 L 422 100 L 374 64 Z",
    leftFold: "M 75 72 L 111 100 L 111 72 Z",
    rightFold: "M 347 72 L 311 100 L 311 72 Z",
    centerPanel: "M 75 0 L 347 0 L 347 72 L 75 72 Z",
    panelTopCatch: "M 79 4 L 343 4 L 343 10 L 79 10 Z",
    panelBottomShadow: "M 79 65.5 L 343 65.5 L 343 69.5 L 79 69.5 Z",
    leftTailHighlight: "M 6.5 32 L 109 32 L 109 38 L 16 38 Z",
    rightTailHighlight: "M 415.5 32 L 313 32 L 313 38 L 406 38 Z",
    leftFoldLight: "M 79 74.5 L 108 96 L 108 84 Z",
    rightFoldLight: "M 343 74.5 L 314 96 L 314 84 Z",
  },
  /** authored house-glint seats — the kit's glint star at (x, y),
   *  point-radius s, rotation r°, in the same 422×100 box */
  glints: [
    { x: 84, y: 7, s: 5, r: -8 },
    { x: 338, y: 13, s: 3.2, r: 8 },
  ],
  source: "Geometry authored in-house for UI Kit Maker, 2026-09-01/02, by the owner's own construction recipe against their exact-shape reference (tails as same-height copies of the banner, staggered behind, V notches pushed in from an added outer midpoint, fold connectors drawn to close the angles), with the owner's follow-up flap trim (visible tail reach 94 → 75) — superseding both the ingest pack's paths and the first re-authoring; construction and part scheme follow the pack's assembly, under the creative direction of Chevon Hicks.",
  license: "original work",
} as const;
