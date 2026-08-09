/* SPLASH LETTERING ENGINE — treatment presets.

   Three treatments re-authored as pure recipe data on the Phase-2
   engine: COMIC POP (the Phase-1 proof, now carrying the full material
   model), RETRO STICKER (script + composition-scoped sticker badge +
   swash + print field), SPORTS ARENA (arched kicker over block hero,
   vinyl material, plaque + arena glow). Each carries its Creative
   Director declarations — the pre-implementation plan the study
   requires — as data. */

import type { TreatmentRecipe } from "./recipe";

export const COMIC_POP: TreatmentRecipe = {
  id: "comic-pop",
  version: 2,
  direction: {
    hierarchy: "principal phrase dominates; connectives become small kickers (compiler default)",
    silhouette: "fat tilted Bangers mass + strata tail reads as one energetic slab",
    layerOrder: "shadow → strata tail → cap ring → cream keyline → candy face → gloss",
    material: "candy-ink: rounded bevel, rich 3-stop ramp, crisp per-letter gloss band",
    light: "warm key from above, elevation 0.6; cool-warm fill bounce lifts nothing (comic stays graphic)",
    gradientPattern: "role-space ramp on the face; no face pattern (the scene carries the halftone)",
    ornament: "burst wedges + corner halftone + a few 5-point sparks solve the empty corners",
  },
  palette: {
    stage: "#E8492B",       // comic red tile
    ray: "#F0603C",         // lighter burst wedges
    dot: "#8F2411",         // halftone ink
    spark: "#FFF3D6",       // foreground star sparks
    ink: "#1F0D05",         // cast shadow
    depthDeep: "#2E1206",   // long dark tail
    depthAccent: "#B34A12", // saturated near band
    cap: "#33170B",         // ring closing the strata
    cream: "#FFF3D6",       // sticker keyline
    faceLit: "#FFE979",
    faceMid: "#FFC94D",
    faceShade: "#FFA51F",
    gloss: "#FFFFFF",
  },
  light: {
    key: { angle: 90, elevation: 0.6, intensity: 0.85, color: "#FFF4D6", softness: 0.25 },
    fill: { enabled: false, angle: 250, intensity: 0.3, color: "#FF9E5E", softness: 0.6 },
    ambient: 0.25,
    depth: { angle: 56, step: 1.33 },
    shadow: { len: 40, blur: 3, opacity: 0.27 },
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
      profile: "rounded",
      diffuse: { type: "linear", stops: [{ tok: "faceLit", position: 0 }, { tok: "faceMid", position: 0.55 }, { tok: "faceShade", position: 1 }] },
      bevel: { width: 5.5, contrast: 0.5, profile: "hard" },
      specular: { strength: 0.5, width: 0.24, hardness: 0.95, balance: 0.13, tok: "gloss", space: "glyph" },
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
      profile: "rounded",
      diffuse: { type: "linear", stops: [{ tok: "faceLit", position: 0 }, { tok: "faceMid", position: 0.55 }, { tok: "faceShade", position: 1 }] },
      bevel: { width: 5.5, contrast: 0.5, profile: "hard" },
      specular: { strength: 0.5, width: 0.24, hardness: 0.95, balance: 0.13, tok: "gloss", space: "glyph" },
    },
  },
  composition: { widthMatch: 0.62, lineGap: -6 },
  scene: { kind: "comic-burst", ray: "ray", dot: "dot", spark: "spark", rayCount: 14, rayOpacity: 1, dotOpacity: 0.5 },
  stage: "stage",
};

export const RETRO_STICKER: TreatmentRecipe = {
  id: "retro-sticker",
  version: 2,
  direction: {
    hierarchy: "title-case script; kicker rides the hero's rising baseline",
    silhouette: "ONE sticker blob — the badge contour is composition-scoped, both lines merge",
    layerOrder: "one unified shadow + maroon strata + ONE cream sticker ring → per-role maroon keylines → red faces",
    material: "warm enamel: soft chamfer, red 3-stop ramp, restrained script-width gloss",
    light: "same key as the lockup's swash sweep; low intensity keeps it print-like",
    gradientPattern: "role-space ramp; print-dot field lives on the stage, not the face",
    ornament: "underline swash from hero bounds + ornamental rules; both solve the script's ragged bottom",
  },
  palette: {
    stage: "#17453B",
    printDot: "#0E2F28",
    rule: "#F6E8CC",
    ink: "#1B0F0A",
    maroon: "#57231A",
    cream: "#F6E8CC",
    faceLit: "#F2694F",
    faceMid: "#E8563F",
    faceShade: "#B92A18",
    gloss: "#FFD9C4",
  },
  light: {
    key: { angle: 95, elevation: 0.5, intensity: 0.55, color: "#FFF3DC", softness: 0.5 },
    fill: { enabled: false, angle: 275, intensity: 0.2, color: "#9FD8C8", softness: 0.7 },
    ambient: 0.3,
    depth: { angle: 59, step: 1.15 },
    shadow: { len: 16, blur: 2.5, opacity: 0.3 },
  },
  hero: {
    fontFamily: "Pacifico",
    casePolicy: "title",
    size: 150,
    tracking: -0.005,
    rhythm: { rise: 0.1, rotFollow: 0.8, jitter: 0.25 },
    depth: {
      // per-role: only the inner keyline — shadow/strata/contour belong
      // to the composition badge so the lockup is ONE sticker
      keyline: { tok: "maroon", expand: 4 },
    },
    material: {
      id: "retro-enamel",
      profile: "chamfer",
      diffuse: { type: "linear", stops: [{ tok: "faceLit", position: 0 }, { tok: "faceMid", position: 0.5 }, { tok: "faceShade", position: 1 }] },
      bevel: { width: 4, contrast: 0.35, profile: "soft" },
      specular: { strength: 0.3, width: 0.16, hardness: 0.6, balance: 0.12, tok: "gloss", space: "glyph" },
    },
  },
  support: {
    fontFamily: "Pacifico",
    casePolicy: "title",
    size: 150,
    tracking: 0,
    rhythm: { rise: 0.07, rotFollow: 0.8, jitter: 0.25 },
    depthK: 0.7,
    depth: {
      keyline: { tok: "maroon", expand: 4 },
    },
    material: {
      id: "retro-enamel",
      profile: "chamfer",
      diffuse: { type: "linear", stops: [{ tok: "faceLit", position: 0 }, { tok: "faceMid", position: 0.5 }, { tok: "faceShade", position: 1 }] },
      bevel: { width: 4, contrast: 0.35, profile: "soft" },
      specular: { strength: 0.3, width: 0.16, hardness: 0.6, balance: 0.12, tok: "gloss", space: "glyph" },
    },
  },
  composition: {
    widthMatch: 0.52,
    lineGap: -14,
    badge: {
      shadow: { tok: "ink", expand: 10 },
      deep: { tok: "maroon", expand: 10.5, count: 6 },
      cap: { tok: "cream", expand: 10.5 },
    },
  },
  scene: { kind: "retro-print", dot: "printDot", rule: "rule", swash: { tok: "cream", keyTok: "maroon" } },
  stage: "stage",
};

export const SPORTS_ARENA: TreatmentRecipe = {
  id: "sports-arena",
  version: 2,
  direction: {
    hierarchy: "arched condensed kicker over the block hero at equal measure (wood-type lockup)",
    silhouette: "plaque + arch + slab reads as a crest even in flat black",
    layerOrder: "arena glow → plaque → strata → contours → vinyl faces → inline rings",
    material: "sports vinyl: firm chamfer, quiet specular, navy/cream double inline",
    light: "high key, modest intensity — vinyl is matte; the arena glow is scene, not material",
    gradientPattern: "near-flat cream ramp; contrast lives in the inline rings and red accents",
    ornament: "plaque + triple rules + corner studs frame the lockup; glow pools behind the crest",
  },
  palette: {
    stage: "#DED8CA",
    glow: "#F5E9C8",
    plaque: "#F2E7CC",
    plaqueLine: "#152A4E",
    rule: "#B9352E",
    ink: "#10121A",
    navyDeep: "#101B33",
    navy: "#152A4E",
    red: "#B9352E",
    cream: "#F2E7CC",
    faceLit: "#F7EDD5",
    faceShade: "#E2D2AE",
    gloss: "#FFFFFF",
  },
  light: {
    key: { angle: 90, elevation: 0.65, intensity: 0.6, color: "#FFF9EA", softness: 0.4 },
    fill: { enabled: false, angle: 270, intensity: 0.2, color: "#C8D8F0", softness: 0.7 },
    ambient: 0.3,
    depth: { angle: 62, step: 1.1 },
    shadow: { len: 26, blur: 3, opacity: 0.24 },
  },
  hero: {
    fontFamily: "Archivo Black",
    casePolicy: "upper",
    size: 140,
    tracking: -0.008,
    rhythm: { jitter: 0 },
    depth: {
      shadow: { tok: "ink", expand: 9 },
      deep: { tok: "navyDeep", expand: 9.5, count: 13 },
      accent: { tok: "red", expand: 7.5, count: 6 },
      cap: { tok: "navy", expand: 7.5 },
      keyline: { tok: "cream", expand: 3 },
    },
    material: {
      id: "sports-vinyl",
      profile: "chamfer",
      diffuse: { type: "linear", stops: [{ tok: "faceLit", position: 0 }, { tok: "faceShade", position: 1 }] },
      bevel: { width: 4.6, contrast: 0.5, profile: "hard" },
      specular: { strength: 0.22, width: 0.12, hardness: 0.9, balance: 0.1, tok: "gloss", space: "glyph" },
      inlines: [{ tok: "navy", inset: 3.2 }, { tok: "cream", inset: 5.4 }],
    },
  },
  support: {
    fontFamily: "Anton",
    casePolicy: "upper",
    size: 140,
    tracking: 0.02,
    rhythm: { arch: 0.11, rotFollow: 1, jitter: 0 },
    depthK: 0.6,
    depth: {
      deep: { tok: "navyDeep", expand: 7.5, count: 7 },
      cap: { tok: "red", expand: 7.5 },
      keyline: { tok: "cream", expand: 3 },
    },
    material: {
      id: "sports-navy",
      profile: "flat",
      diffuse: { type: "linear", stops: [{ tok: "navy", position: 0 }, { tok: "navy", position: 1 }] },
    },
  },
  composition: { widthMatch: 1.0, lineGap: 2 },
  scene: { kind: "arena", glow: "glow", plaque: "plaque", plaqueLine: "plaqueLine", rule: "rule" },
  stage: "stage",
};

export const LETTERING_PRESETS: Record<string, TreatmentRecipe> = {
  "comic-pop": COMIC_POP,
  "retro-sticker": RETRO_STICKER,
  "sports-arena": SPORTS_ARENA,
};
