import { defaultConfig } from "@/generator/model";
import type { GenConfig } from "@/generator/model";

/* Splash Text — one look, purpose-built: the flat retro sticker (solid
   ink letterforms, one black blob that is wrap + leaning block-extrusion
   in a single shape, soft ground shadow, star sparkles). The page holds
   THIS small model; the engine still speaks GenConfig, so buildSplashCfg
   maps the look onto the same renderer everything else uses. */

export type SplashLook = {
  /** multiline — Return is respected; the blob wraps the whole block */
  text: string;
  /** per-letter size multipliers (1 = as set), indexed by the global
   *  glyph counter — CONTENT, like the words themselves: styles never
   *  touch it, reset keeps it */
  letterScales: number[];
  font: string;
  /** weight — real for variable/multi-master faces (the outlines carry
   *  the axis), optical fattening for single-master ones */
  weight: number;
  customFonts: string[];
  /** letterform ink (+ optional vertical gradient) */
  fill: string;
  inkGrad: boolean;
  fill2: string;
  /** the BACKSPLASH: the blob wrapping the whole word-block behind
   *  everything (+ optional gradient). Off = no wrap; the body extrusion
   *  then grows straight from the letterforms. */
  backsplash: boolean;
  blob: string;
  blobGrad: boolean;
  blob2: string;
  /** backsplash wrap width around the letterforms, px at the 52px master scale */
  strokeW: number;
  /** the TRUE stroke — a traditional contour hugging each letterform,
   *  painted above the drop shadow and backsplash, below the ink */
  stroke: { on: boolean; color: string; width: number };
  /** nested contour bands (face → keyline → border, max 3) — the
   *  display-lettering construction; the body extrudes and wraps from
   *  the OUTERMOST band */
  contours: { width: number; color: string }[];
  /** inline/inset ring inside the face — varsity, marquee, engraved */
  inline: { on: boolean; inset: number; width: number; color: string };
  /** drop shadow of letters + stroke — behind both, in FRONT of the backsplash */
  dropShadow: { on: boolean; color: string; x: number; y: number; blur: number; opacity: number };
  /** wall bevel — the chiseled hard-candy edge on the letterforms */
  wall: { on: boolean; width: number; soft: number; strength: number };
  /** block-extrusion reach, px at the 52px master scale */
  depth: number;
  /** soft ground-shadow opacity 0..100 */
  shadow: number;
  /** line height % (multiline) and block alignment */
  lineHeight: number;
  align: "left" | "center" | "right";
  /** instant typography poster — every line scales to one shared measure */
  posterFit: boolean;
  /** the 60s move — lines swell/squeeze into each other, measure pinned */
  groove: number; // 0..100
  /** pattern inside the letterforms — UIKM's letterform pattern system.
   *  color null = tone-on-tone auto; blend composites against the ink. */
  pattern: { on: boolean; style: string; scale: number; angle: number; opacity: number; color: string | null; blend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" };
  /** pattern inside the BACKSPLASH — the blob wears the seamless cell */
  blobPattern: { on: boolean; style: string; scale: number; angle: number; opacity: number; color: string | null; blend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" };
  /** hard-candy gloss band over the letter faces */
  gloss: number;      // 0..100 opacity
  glossCover: number; // 20..60 — % of glyph height the band covers
  glossBlend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";
  /** the master light — swings shine crescents and sparkle placement */
  lightAngle: number; // 0..360
  /** vector sparkles riding the letterforms, UIKM's glint system */
  glints: { on: boolean; style: "slab" | "stars" | "streak" | "sheen"; opacity: number; blend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" };
  /** per-letter tilt & bounce 0..100 — jaunty, still one sticker */
  bounce: number;
  /** ink shine — top-light crescents on each letterform */
  shine: boolean;
  shineSize: number;   // 1..10
  shineInset: number;  // 0..6
  shineRound: number;  // 0..6 — cap rounding, UIKM's knob semantics
  shineOpacity: number; // 0..100 — ink strength
  shineColor: string;
  shineBlend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";
  /** whole-word shape — one object, in-plane */
  arc: number;      // -100..100
  bulge: number;    // -100..100
  /** bulge mute — the slider keeps its setting while the effect sits out */
  bulgeOn: boolean;
  stage: { mode: "color" | "transparent"; color: string; image?: string | null };
};

/** A style is everything about a look EXCEPT the user's words, their
 *  per-letter size edits, and their registered fonts — applying one
 *  restyles the words in place. */
export type SplashStyle = Omit<SplashLook, "text" | "customFonts" | "letterScales">;

export const SPLASH_STAGE_CHIPS = ["#EAD4B4", "#101318", "#F4F1EA", "#E8402A"] as const;

/* The factory look — the approved GOOD DAY retro sticker. */
const GOOD_DAY: SplashStyle = {
  font: "Modak",
  weight: 400,
  fill: "#E8402A",
  inkGrad: false,
  fill2: "#B7231A",
  backsplash: true,
  blob: "#221E1F",
  blobGrad: false,
  blob2: "#3E3357",
  strokeW: 8,
  stroke: { on: false, color: "#FFFFFF", width: 3 },
  contours: [],
  inline: { on: false, inset: 2.5, width: 1.8, color: "#1F2A44" },
  dropShadow: { on: false, color: "#1A1A1A", x: 0, y: 6, blur: 4, opacity: 45 },
  wall: { on: false, width: 3, soft: 30, strength: 70 },
  depth: 14,
  shadow: 25,
  lineHeight: 105,
  align: "center",
  posterFit: false,
  groove: 0,
  pattern: { on: false, style: "stripes", scale: 100, angle: 0, opacity: 30, color: null, blend: "normal" },
  blobPattern: { on: false, style: "dots", scale: 100, angle: 0, opacity: 30, color: null, blend: "normal" },
  gloss: 0,
  glossCover: 38,
  glossBlend: "normal",
  lightAngle: 90,
  glints: { on: false, style: "stars", opacity: 70, blend: "normal" },
  bounce: 30,
  shine: true,
  shineSize: 4,
  shineInset: 2,
  shineRound: 2,
  shineOpacity: 100,
  shineColor: "#FFFFFF",
  shineBlend: "normal",
  arc: 0,
  bulge: 0,
  bulgeOn: true,
  stage: { mode: "color", color: "#EAD4B4" },
};

/* The starter shelf — each one owns a font, a palette and a stage so a
   single click reads as a different poster, not a recolor. */
export const SPLASH_STYLES: { id: string; name: string; style: SplashStyle }[] = [
  { id: "good-day", name: "Good Day", style: GOOD_DAY },
  {
    id: "citrus-squeeze", name: "Citrus Squeeze",
    style: {
      ...GOOD_DAY,
      font: "Luckiest Guy",
      fill: "#FFD84D", inkGrad: true, fill2: "#FF8C1A",
      blob: "#5B2B0F", blobGrad: false, blob2: "#8C4A1D",
      strokeW: 7, depth: 12, shadow: 20, bounce: 45,
      shineOpacity: 90,
      stage: { mode: "color", color: "#F4F1EA" },
    },
  },
  {
    id: "grape-soda", name: "Grape Soda",
    style: {
      ...GOOD_DAY,
      font: "Lilita One",
      fill: "#FF7ABF", inkGrad: true, fill2: "#FF3E8E",
      blob: "#5A2EE0", blobGrad: true, blob2: "#2A1670",
      strokeW: 9, depth: 16, shadow: 35, bounce: 25,
      shineColor: "#FFE9F7", shineBlend: "screen", shineOpacity: 80,
      stage: { mode: "color", color: "#101318" },
    },
  },
  /* construction recipes — the letters do the work, no backsplash:
     contour bands + directional extrusion make the silhouette */
  {
    id: "comic-pop", name: "Comic Pop",
    style: {
      ...GOOD_DAY,
      font: "Bangers",
      fill: "#FFE24D", inkGrad: true, fill2: "#FFA400",
      backsplash: false,
      blob: "#8F2600",           // the extrusion wall's ink
      contours: [{ width: 2.5, color: "#FFF3D6" }, { width: 5.5, color: "#26120B" }],
      depth: 14, shadow: 20, bounce: 12, lineHeight: 100,
      shine: false,
      stage: { mode: "color", color: "#F4F1EA" },
    },
  },
  {
    id: "varsity", name: "Varsity",
    style: {
      ...GOOD_DAY,
      font: "Archivo Black",
      fill: "#F2E7CC", inkGrad: false,
      backsplash: false,
      blob: "#0E1830",
      inline: { on: true, inset: 2.5, width: 2, color: "#1C2B4A" },
      contours: [{ width: 4, color: "#1C2B4A" }, { width: 2.5, color: "#F2E7CC" }, { width: 2.5, color: "#1C2B4A" }],
      depth: 5, shadow: 12, bounce: 0, lineHeight: 102,
      shine: false,
      stage: { mode: "color", color: "#B9352E" },
    },
  },
  {
    id: "print-shop", name: "Print Shop",
    style: {
      ...GOOD_DAY,
      font: "Bungee",
      fill: "#F4F1EA", inkGrad: false,
      blob: "#1C1917", blobGrad: false,
      strokeW: 6, depth: 8, shadow: 15, bounce: 0, lineHeight: 100,
      shine: false,
      pattern: { on: true, style: "dots", scale: 120, angle: 0, opacity: 18, color: null, blend: "normal" },
      stage: { mode: "color", color: "#E8402A" },
    },
  },
];

export const SPLASH_DEFAULT: SplashLook = {
  text: "GOOD\nDAY",
  letterScales: [],
  customFonts: [],
  ...GOOD_DAY,
};

export function buildSplashCfg(look: SplashLook): GenConfig {
  const c = defaultConfig();
  const t = c.type;
  t.font = look.font;
  t.customFonts = [...look.customFonts];
  t.weight = look.weight;
  t.size = 96;
  t.italic = false;
  t.case = "none";     // the text renders as typed
  t.spacing = 2;
  t.fillMode = look.inkGrad ? "gradient" : "solid";
  t.fill = look.fill;
  t.fill2 = look.fill2;
  t.fillOpacity = 100;
  t.highlight = "";
  delete t.fillStops;
  // the TRUE stroke — behind-mode contour of the whole word, so no
  // glyph's stroke ever crosses an overlapping neighbor's face
  t.outline = { on: look.stroke.on, color: look.stroke.color, color2: null, width: look.stroke.width, behind: true };
  // drop shadow of letters + stroke — the engine paints it inside the
  // text-fx filter group: above the backsplash, behind stroke and ink
  t.shadow = { on: look.dropShadow.on, color: look.dropShadow.color, x: look.dropShadow.x, y: look.dropShadow.y, blur: look.dropShadow.blur, opacity: look.dropShadow.opacity };
  t.emboss = { on: false, strength: 0, softness: 30, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
  t.glow = { on: false, color: look.fill, size: 10, opacity: 80 };
  t.glints = { on: look.glints.on, opacity: look.glints.opacity, style: look.glints.style, blend: look.glints.blend };
  t.stripes = {
    on: look.pattern.on,
    angle: look.pattern.angle,
    opacity: look.pattern.opacity,
    style: look.pattern.style as NonNullable<GenConfig["type"]["stripes"]>["style"],
    scale: look.pattern.scale,
    color: look.pattern.color,
    blend: look.pattern.blend,
  };
  t.wall = { on: look.wall.on, width: look.wall.width, soft: look.wall.soft, strength: look.wall.strength };
  t.contours = look.contours.filter((c) => c.width > 0.05).slice(0, 3);
  t.inline = { ...look.inline };
  t.noise = { on: false, amount: 35, scale: 50 };
  t.shine = { on: look.shine, size: look.shineSize, inset: look.shineInset, round: look.shineRound, opacity: look.shineOpacity, color: look.shineColor, blend: look.shineBlend };
  t.dim = {
    on: true,
    depth: look.depth,
    color: look.blob,
    // backsplash off = no wrap; the body then extrudes the letters directly
    sticker: look.backsplash ? look.strokeW : 0,
    stickerColor: look.blob,   // wrap and body are ONE blob unless the
    stickerColor2: look.backsplash && look.blobGrad ? look.blob2 : null, // gradient splits it
    rim: 0,
    rimColor: look.blob,
    shadow: look.shadow,
    gloss: look.gloss,
    glossCover: look.glossCover,
    glossBlend: look.glossBlend,
    tilt: look.bounce,
    drift: 55,               // the lean is part of the look itself
    pattern: look.backsplash ? { ...look.blobPattern } : { ...look.blobPattern, on: false },
  };
  c.lighting = { ...c.lighting, angle: look.lightAngle, highlight: 70, lowlight: 50 };
  c.effects = { ...c.effects, Bevel: look.fill, Glow: look.fill };
  return c;
}
