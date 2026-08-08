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
  font: string;
  /** weight — real for variable/multi-master faces (the outlines carry
   *  the axis), optical fattening for single-master ones */
  weight: number;
  customFonts: string[];
  /** letterform ink (+ optional vertical gradient) */
  fill: string;
  inkGrad: boolean;
  fill2: string;
  /** the blob: wrap + body + everything behind the ink (+ optional gradient) */
  blob: string;
  blobGrad: boolean;
  blob2: string;
  /** blob wrap width around the letterforms, px at the 52px master scale */
  strokeW: number;
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
  /** pattern inside the letterforms — UIKM's letterform pattern system */
  pattern: { on: boolean; style: string; scale: number; angle: number; opacity: number };
  /** pattern inside the STROKE — the blob wears the seamless cell */
  blobPattern: { on: boolean; style: string; scale: number; angle: number; opacity: number };
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

/** A style is everything about a look EXCEPT the user's words and their
 *  registered fonts — applying one restyles the words in place. */
export type SplashStyle = Omit<SplashLook, "text" | "customFonts">;

export const SPLASH_STAGE_CHIPS = ["#EAD4B4", "#101318", "#F4F1EA", "#E8402A"] as const;

/* The factory look — the approved GOOD DAY retro sticker. */
const GOOD_DAY: SplashStyle = {
  font: "Modak",
  weight: 400,
  fill: "#E8402A",
  inkGrad: false,
  fill2: "#B7231A",
  blob: "#221E1F",
  blobGrad: false,
  blob2: "#3E3357",
  strokeW: 8,
  depth: 14,
  shadow: 25,
  lineHeight: 105,
  align: "center",
  posterFit: false,
  groove: 0,
  pattern: { on: false, style: "stripes", scale: 100, angle: 0, opacity: 30 },
  blobPattern: { on: false, style: "dots", scale: 100, angle: 0, opacity: 30 },
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
  {
    id: "print-shop", name: "Print Shop",
    style: {
      ...GOOD_DAY,
      font: "Bungee",
      fill: "#F4F1EA", inkGrad: false,
      blob: "#1C1917", blobGrad: false,
      strokeW: 6, depth: 8, shadow: 15, bounce: 0, lineHeight: 100,
      shine: false,
      pattern: { on: true, style: "dots", scale: 120, angle: 0, opacity: 18 },
      stage: { mode: "color", color: "#E8402A" },
    },
  },
];

export const SPLASH_DEFAULT: SplashLook = {
  text: "GOOD\nDAY",
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
  t.outline = { on: false, color: look.blob, color2: null, width: 2, behind: true };
  t.shadow = { on: false, color: look.blob, x: 0, y: 3, blur: 2, opacity: 50 };
  t.emboss = { on: false, strength: 0, softness: 30, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
  t.glow = { on: false, color: look.fill, size: 10, opacity: 80 };
  t.glints = { on: look.glints.on, opacity: look.glints.opacity, style: look.glints.style, blend: look.glints.blend };
  t.stripes = {
    on: look.pattern.on,
    angle: look.pattern.angle,
    opacity: look.pattern.opacity,
    style: look.pattern.style as NonNullable<GenConfig["type"]["stripes"]>["style"],
    scale: look.pattern.scale,
  };
  t.noise = { on: false, amount: 35, scale: 50 };
  t.shine = { on: look.shine, size: look.shineSize, inset: look.shineInset, round: look.shineRound, opacity: look.shineOpacity, color: look.shineColor, blend: look.shineBlend };
  t.dim = {
    on: true,
    depth: look.depth,
    color: look.blob,
    sticker: look.strokeW,
    stickerColor: look.blob,   // wrap and body are ONE blob unless the
    stickerColor2: look.blobGrad ? look.blob2 : null, // gradient splits it
    rim: 0,
    rimColor: look.blob,
    shadow: look.shadow,
    gloss: look.gloss,
    glossCover: look.glossCover,
    glossBlend: look.glossBlend,
    tilt: look.bounce,
    drift: 55,               // the lean is part of the look itself
    pattern: { ...look.blobPattern },
  };
  c.lighting = { ...c.lighting, angle: look.lightAngle, highlight: 70, lowlight: 50 };
  c.effects = { ...c.effects, Bevel: look.fill, Glow: look.fill };
  return c;
}
