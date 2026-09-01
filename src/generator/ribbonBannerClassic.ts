/* ── Classic Ribbon Banner — the owner's ribbon commission (sketch pass) ──
   INGESTED VERBATIM from the ChatGPT handoff pack (ribbonBannerClassic.ts /
   ribbonbannerclassic.component.json): the authored paths are the artist's
   and are never redrawn, approximated or replaced (the pack's no-design
   rule; the crown-coin ingest discipline). PAINT IS THE KIT'S: the pack's
   purple previews are direction, not palette — every part maps to a kit
   role in bevel's ribbonbanner case (the render-capabilities contract).

   Construction (the pack's assembly): left/right swallow tails BEHIND →
   dark fold triangles where the tails tuck under → fold light catches →
   the rounded center panel IN FRONT → its bottom-shadow and top-catch
   bands + tail highlight streaks → two authored house-glint seats. The
   strictSilhouette is the same construction unioned into ONE closed
   M/L/C/Z path (mirror-symmetric about x=100, touches all four edges of
   its 200×100 box — pack validation: 12/12 PASS); it is the kit shell's
   outline, so bevel wall, extrusion and shadow sweep the whole ribbon in
   one pass — exactly the one-slab depth the pack's extruded preview
   draws. The center panel is a TEXT FIELD by construction: words ride a
   live label seat (the kit's lettering), never baked into the art. */

export const RIBBON_BANNER_CLASSIC = {
  id: "ribbonbannerclassic",
  name: "Classic Ribbon Banner",
  viewBox: [0, 0, 200, 100] as [number, number, number, number],
  strictSilhouette: {
    d: "M 46 0 L 154 0 C 157.31 0 160 2.69 160 6 L 160 34 L 200 34 L 178 67 L 200 100 L 142 100 L 160 74 L 40 74 L 58 100 L 0 100 L 22 67 L 0 34 L 40 34 L 40 6 C 40 2.69 42.69 0 46 0 Z",
  },
  parts: {
    leftTail: "M 0 34 L 58 34 L 58 100 L 0 100 L 22 67 Z",
    rightTail: "M 142 34 L 200 34 L 178 67 L 200 100 L 142 100 Z",
    leftFold: "M 40 74 L 58 100 L 58 74 Z",
    rightFold: "M 160 74 L 142 100 L 142 74 Z",
    centerPanel: "M 46 0 L 154 0 C 157.31 0 160 2.69 160 6 L 160 68 C 160 71.31 157.31 74 154 74 L 46 74 C 42.69 74 40 71.31 40 68 L 40 6 C 40 2.69 42.69 0 46 0 Z",
    panelTopCatch: "M 48 7 L 152 7 C 154.21 7 156 8.79 156 11 L 156 14 L 44 14 L 44 11 C 44 8.79 45.79 7 48 7 Z",
    panelBottomShadow: "M 44 65 L 156 65 L 156 68 C 156 69.1 155.1 70 154 70 L 46 70 C 44.9 70 44 69.1 44 68 Z",
    leftTailHighlight: "M 3 38 L 56 38 L 56 44 L 7 44 Z",
    rightTailHighlight: "M 144 38 L 197 38 L 193 44 L 144 44 Z",
    leftFoldLight: "M 42 76 L 55 95 L 55 82 Z",
    rightFoldLight: "M 158 76 L 145 95 L 145 82 Z",
  },
  /** authored house-glint seats — the kit's glint star at (x, y),
   *  point-radius s, rotation r°, in the same 200×100 box */
  glints: [
    { x: 49, y: 10, s: 4.2, r: -8 },
    { x: 151, y: 18, s: 2.8, r: 8 },
  ],
  source: "Original vector geometry authored for UI Kit Maker, 2026, by OpenAI under the creative direction of Chevon Hicks.",
  license: "original work",
} as const;
