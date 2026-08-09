/* SPLASH LETTERING ENGINE — the material library (the study's Row B).

   Eight MaterialRecipes under ONE shared LightRig, each with its own
   palette. Same geometry + same light; only the material answers
   differently — that separation is the point of the study. The ramps
   double as the Gradient-IR demonstrations: candy's soft three-stop,
   gold's hard six-stop with a dark horizon, the cool aquatic ramp, and
   flat ink's graphic two-band. */

import type { LightRig, MaterialRecipe, DepthPlan, Palette } from "./material";
import type { PatternSpec } from "./pattern";

/** One key light, upper-left and warm; one cool bounce from lower-right;
 *  a little ambient. Every fixture below renders under exactly this. */
export const DEMO_RIG: LightRig = {
  key: { angle: 105, elevation: 0.55, intensity: 0.9, color: "#FFF6E4", softness: 0.3 },
  fill: { enabled: true, angle: 285, intensity: 0.5, color: "#7FD8FF", softness: 0.6 },
  ambient: 0.2,
  depth: { angle: 60, step: 1.2 },
  shadow: { len: 34, blur: 3.5, opacity: 0.26 },
};

export interface MaterialFixture {
  id: string;
  label: string;
  palette: Palette;
  material: MaterialRecipe;
  depth: DepthPlan;
  patterns?: PatternSpec[];
}

/** neutral construction shared by most fixtures so ONLY the material
 *  reads differently tile to tile */
const NEUTRAL_DEPTH: DepthPlan = {
  shadow: { tok: "ink", expand: 8 },
  contact: { tok: "ink", expand: 8 },
  deep: { tok: "capTone", expand: 8, count: 9 },
  cap: { tok: "capTone", expand: 8 },
  keyline: { tok: "keyTone", expand: 3.4 },
};

export const MATERIALS: MaterialFixture[] = [
  {
    id: "flat-comic-ink",
    label: "Flat comic ink",
    palette: {
      stage: "#F2ECE0", ink: "#221408", capTone: "#33210E", keyTone: "#FFF3D6",
      f0: "#FFD84D", f1: "#F09C1E",
    },
    material: {
      id: "flat-comic-ink", profile: "flat",
      // the graphic two-band ramp: value snaps, no blend
      diffuse: { type: "banded", hardness: 0.85, balance: 0.42, stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 1 }] },
    },
    depth: NEUTRAL_DEPTH,
  },
  {
    id: "enamel",
    label: "Enamel",
    palette: {
      stage: "#EFE8DA", ink: "#1D0E0A", capTone: "#3A130C", keyTone: "#F7EBD4",
      f0: "#FF7A5C", f1: "#E03A28", f2: "#9E1B10", gloss: "#FFFFFF", rimc: "#FFB9A6",
    },
    material: {
      id: "enamel", profile: "chamfer",
      diffuse: { type: "linear", stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 0.55 }, { tok: "f2", position: 1 }] },
      bevel: { width: 5, contrast: 0.5, profile: "hard" },
      specular: { strength: 0.85, width: 0.09, hardness: 1, balance: 0.09, tok: "gloss", space: "glyph" },
      rim: { strength: 0.6, width: 3.4, tok: "rimc" },
    },
    depth: NEUTRAL_DEPTH,
  },
  {
    id: "candy-plastic",
    label: "Candy plastic",
    palette: {
      stage: "#F6EEE2", ink: "#23101E", capTone: "#4A1638", keyTone: "#FFE9F4",
      f0: "#FFA6D4", f1: "#FF5FA8", f2: "#DD2E7E", gloss: "#FFFFFF", rimc: "#B5F1FF",
    },
    material: {
      id: "candy-plastic", profile: "rounded",
      // the soft three-stop candy ramp; bevel stays a light kiss — candy
      // is gloss-first, never deep-embossed
      diffuse: { type: "linear", balance: 0.45, stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 0.5 }, { tok: "f2", position: 1 }] },
      bevel: { width: 3.2, contrast: 0.26, profile: "rounded" },
      specular: { strength: 0.9, width: 0.24, hardness: 0.9, balance: 0.13, tok: "gloss", space: "glyph" },
      rim: { strength: 0.7, width: 3, tok: "rimc" },
    },
    depth: NEUTRAL_DEPTH,
  },
  {
    id: "sports-vinyl",
    label: "Sports vinyl",
    palette: {
      stage: "#E6E1D3", ink: "#10121A", capTone: "#152A4E", keyTone: "#F2E7CC",
      f0: "#F7EDD5", f1: "#E2D2AE", navy: "#152A4E", cream: "#F2E7CC", gloss: "#FFFFFF",
    },
    material: {
      id: "sports-vinyl", profile: "chamfer",
      diffuse: { type: "linear", stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 1 }] },
      bevel: { width: 5.5, contrast: 0.6, profile: "hard" },
      specular: { strength: 0.25, width: 0.12, hardness: 0.9, balance: 0.1, tok: "gloss", space: "glyph" },
      inlines: [{ tok: "navy", inset: 3.4 }, { tok: "cream", inset: 5.8 }],
    },
    depth: NEUTRAL_DEPTH,
  },
  {
    id: "gold-metal",
    label: "Gold metal",
    palette: {
      stage: "#1E2132", ink: "#05060C", capTone: "#2A2118", keyTone: "#0F0D08",
      g0: "#FFF4BE", g1: "#F7D468", g2: "#8A5E14", g3: "#F2C94C", g4: "#6B4A10", g5: "#3B2A08",
      gloss: "#FFFFFF",
    },
    material: {
      id: "gold-metal", profile: "chamfer", metallic: 1, roughness: 0.05,
      // the hard six-stop gold ramp: bright crown, dark horizon, warm
      // rebound, dark base — per glyph so every letter carries the bands
      diffuse: {
        type: "banded", hardness: 0.75, space: "glyph",
        stops: [
          { tok: "g0", position: 0 }, { tok: "g1", position: 0.3 },
          { tok: "g2", position: 0.48 }, { tok: "g3", position: 0.62 },
          { tok: "g4", position: 0.85 }, { tok: "g5", position: 1 },
        ],
      },
      bevel: { width: 4.2, contrast: 0.75, profile: "hard" },
      specular: { strength: 1, width: 0.07, hardness: 1, balance: 0.06, tok: "gloss", space: "glyph" },
    },
    depth: NEUTRAL_DEPTH,
  },
  {
    id: "ice-water",
    label: "Ice / water",
    palette: {
      stage: "#0E3A52", ink: "#041722", capTone: "#0A2A3E", keyTone: "#DFF6FF",
      f0: "#F0FCFF", f1: "#9FE6F7", f2: "#4FB6DD", gloss: "#FFFFFF", rimc: "#CFF4FF", bub: "#FFFFFF",
    },
    material: {
      id: "ice-water", profile: "pillow",
      // the cool aquatic ramp with an internal light (pillow = radial
      // plateau); ice edges are a thin frost line, not a stamped emboss
      diffuse: { type: "multi-radial", space: "glyph", stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 0.55 }, { tok: "f2", position: 1 }] },
      bevel: { width: 3, contrast: 0.24, profile: "rounded" },
      specular: { strength: 0.55, width: 0.3, hardness: 0.35, balance: 0.16, tok: "gloss", space: "glyph" },
      rim: { strength: 0.7, width: 3.2, tok: "rimc" },
      roughness: 0.15,
    },
    depth: NEUTRAL_DEPTH,
    patterns: [
      // bubbles drift on the lit side only
      { type: "dots", colors: ["bub"], scale: 17, density: 0.06, opacity: 0.5, mask: "light-side", inset: 3 },
    ],
  },
  {
    id: "neon",
    label: "Neon",
    palette: {
      stage: "#0B0B12", ink: "#000000", capTone: "#221826", keyTone: "#2A2A38",
      face: "#411431", glowc: "#FF3DA6", tube: "#FF7CC6", core: "#FFF1F9",
    },
    material: {
      id: "neon", profile: "flat",
      diffuse: { type: "linear", stops: [{ tok: "face", position: 0 }, { tok: "face", position: 1 }] },
      glow: { tok: "glowc", width: 13, strength: 0.85 },
      inlines: [{ tok: "tube", inset: 3.6 }, { tok: "core", inset: 6.4 }],
    },
    depth: {
      shadow: { tok: "ink", expand: 8 },
      cap: { tok: "capTone", expand: 6.5 },
      keyline: { tok: "keyTone", expand: 2.6 },
    },
  },
  {
    id: "retro-print",
    label: "Retro print",
    palette: {
      stage: "#20403A", ink: "#17110B", capTone: "#3B2A1A", keyTone: "#F2E3C8",
      f0: "#F2E3C8", f1: "#E3C793", grain: "#8A6A3F", grain2: "#5C452A",
    },
    material: {
      id: "retro-print", profile: "flat",
      diffuse: { type: "banded", hardness: 1, balance: 0.6, stops: [{ tok: "f0", position: 0 }, { tok: "f1", position: 1 }] },
      roughness: 1,
    },
    depth: NEUTRAL_DEPTH,
    patterns: [
      // print grain lives in the shadow, the way ink gains in a rough pass
      { type: "grain", colors: ["grain", "grain2"], scale: 14, density: 0.55, opacity: 0.5, mask: "shadow-side", inset: 1.5 },
    ],
  },
];
