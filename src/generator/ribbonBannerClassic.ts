/* ── Classic Ribbon Banner — the owner's ribbon commission (sketch pass) ──
   GEOMETRY RE-AUTHORED 2026-09-01 to the owner's direct reference images
   ("the shape / form factor of the banner should be more like the attached
   example... copy that — added another image so you can see the bones"):
   the ingest pack's paths are SUPERSEDED by that explicit new reference
   (the owner's override of the pack's no-redraw rule). The pack's
   CONSTRUCTION survives — the same named parts, the same union-silhouette
   contract, the same z-order and glint-seat scheme — refitted to the
   reference's bones:

   · a panoramic 320×100 box (the reference's ~3.2:1)
   · CENTER PANEL: a wide, short, SHARP-CORNERED rectangle (x 75–245 —
     ~53% of the width), riding the UPPER half — its top edge IS the
     banner's topmost line (y 0–50)
   · TAILS: two wide swallow-tail flags in a near-HORIZONTAL band
     (y 25–100 — from the panel's vertical midline to well below its
     bottom; no steep drape), outer ends cut with a deep V notch (apex
     38 in — ~40% of the tail's width — vertically centered on the band)
   · FOLDS: small right triangles tucked under the panel's bottom
     corners, hypotenuse running from the panel corner down/inward to
     the tail's bottom edge — the ribbon folding behind
   · BONES: panel 4 corners · each tail 5 vertices (outer-top, notch
     apex, outer-bottom, inner-bottom, inner-top) behind the panel with
     its inner run overlapped · folds 3-vertex right triangles.
     Z-order unchanged: tails behind → folds → panel front.

   PAINT IS STILL THE KIT'S: every part maps to a kit role in bevel's
   ribbonbanner case (the render-capabilities contract). The strictSilhouette
   is the same construction unioned into ONE closed M/L/Z path
   (mirror-symmetric about x=160, touches all four edges of its 320×100
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
  viewBox: [0, 0, 320, 100] as [number, number, number, number],
  strictSilhouette: {
    d: "M 75 0 L 245 0 L 245 25 L 320 25 L 282 62.5 L 320 100 L 225 100 L 225 50 L 95 50 L 95 100 L 0 100 L 38 62.5 L 0 25 L 75 25 Z",
  },
  parts: {
    leftTail: "M 0 25 L 95 25 L 95 100 L 0 100 L 38 62.5 Z",
    rightTail: "M 320 25 L 225 25 L 225 100 L 320 100 L 282 62.5 Z",
    leftFold: "M 75 50 L 95 100 L 95 50 Z",
    rightFold: "M 245 50 L 225 100 L 225 50 Z",
    centerPanel: "M 75 0 L 245 0 L 245 50 L 75 50 Z",
    panelTopCatch: "M 79 4 L 241 4 L 241 9 L 79 9 Z",
    panelBottomShadow: "M 79 43.5 L 241 43.5 L 241 47 L 79 47 Z",
    leftTailHighlight: "M 4.5 29 L 93 29 L 93 35 L 10.5 35 Z",
    rightTailHighlight: "M 315.5 29 L 227 29 L 227 35 L 309.5 35 Z",
    leftFoldLight: "M 77 53 L 92 91 L 92 65 Z",
    rightFoldLight: "M 243 53 L 228 91 L 228 65 Z",
  },
  /** authored house-glint seats — the kit's glint star at (x, y),
   *  point-radius s, rotation r°, in the same 320×100 box */
  glints: [
    { x: 84, y: 6.5, s: 4.2, r: -8 },
    { x: 236, y: 12, s: 2.8, r: 8 },
  ],
  source: "Geometry authored in-house for UI Kit Maker, 2026-09-01, to the owner's direct reference images (superseding the ingest pack's paths); construction and part scheme follow the pack's assembly, under the creative direction of Chevon Hicks.",
  license: "original work",
} as const;
