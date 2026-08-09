/* SPLASH LETTERING ENGINE — treatment presets.

   Phase 1 ships ONE preset end-to-end: COMIC POP, re-authored from the
   proven three-treatment sheets as pure recipe data. The construction
   values are the ones the sheets validated (Bangers, tight tracking,
   forward shear, long dark strata + saturated accent band + cream
   keyline); what's NEW here is that the light rig now drives every
   directional op, the face/gloss come from a MaterialRecipe, and the
   burst scene is derived from the composed bounds. */

import type { TreatmentRecipe } from "./recipe";

export const COMIC_POP: TreatmentRecipe = {
  id: "comic-pop",
  version: 1,
  palette: {
    stage: "#E8492B",       // comic red tile
    ray: "#F0603C",         // lighter burst wedges
    dot: "#8F2411",         // halftone ink
    ink: "#1F0D05",         // cast shadow
    depthDeep: "#2E1206",   // long dark tail
    depthAccent: "#B34A12", // saturated near band
    cap: "#33170B",         // ring closing the strata
    cream: "#FFF3D6",       // sticker keyline
    faceLit: "#FFDD45",
    faceShade: "#FF8A00",
    innerLit: "#FFE979",
    innerShade: "#FFA51F",
    gloss: "#FFFFFF",
  },
  light: {
    angle: 90,              // key light from above
    depthAngle: 56,         // strata + shadow travel down-right
    depthStep: 1.33,
    shadowLen: 29,
    shadowBlur: 3,
    shadowOpacity: 0.2,
  },
  hero: {
    fontFamily: "Bangers",
    casePolicy: "upper",
    size: 150,
    tracking: -0.015,
    rhythm: { centerScale: 0.05, jitter: 0.5 },
    shear: 5,
    depth: {
      shadow: { tok: "ink", expand: 11 },
      deep: { tok: "depthDeep", expand: 11.5, count: 15 },
      accent: { tok: "depthAccent", expand: 9.5, count: 8 },
      cap: { tok: "cap", expand: 9.5 },
      keyline: { tok: "cream", expand: 4.2 },
    },
    material: {
      id: "candy-ink",
      face: { lit: "faceLit", shade: "faceShade" },
      inner: { lit: "innerLit", shade: "innerShade", inset: 5.5 },
      gloss: { tok: "gloss", opacity: 0.42, span: 0.2 },
    },
  },
  support: {
    fontFamily: "Bangers",
    casePolicy: "upper",
    size: 150,
    tracking: -0.01,
    rhythm: { jitter: 0.5 },
    shear: 5,
    depthK: 0.66,
    depth: {
      shadow: { tok: "ink", expand: 11 },
      deep: { tok: "depthDeep", expand: 11.5, count: 15 },
      accent: { tok: "depthAccent", expand: 9.5, count: 8 },
      cap: { tok: "cap", expand: 9.5 },
      keyline: { tok: "cream", expand: 4.2 },
    },
    material: {
      id: "candy-ink",
      face: { lit: "faceLit", shade: "faceShade" },
      inner: { lit: "innerLit", shade: "innerShade", inset: 5.5 },
      gloss: { tok: "gloss", opacity: 0.42, span: 0.2 },
    },
  },
  composition: { widthMatch: 0.62, lineGap: -6 },
  scene: { kind: "burst", ray: "ray", dot: "dot", rayCount: 14, rayOpacity: 1, dotOpacity: 0.5 },
  stage: "stage",
};

export const LETTERING_PRESETS: Record<string, TreatmentRecipe> = {
  "comic-pop": COMIC_POP,
};
