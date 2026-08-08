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
  /** per-letter tilt & bounce 0..100 — jaunty, still one sticker */
  bounce: number;
  /** ink shine — top-light crescents on each letterform */
  shine: boolean;
  shineSize: number;   // 1..10
  shineInset: number;  // 0..6
  shineRound: number;  // 0..6 — cap rounding, UIKM's knob semantics
  shineColor: string;
  shineBlend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";
  /** whole-word shape — one object, in-plane */
  arc: number;      // -100..100
  bulge: number;    // -100..100
  stage: { mode: "color" | "transparent"; color: string; image?: string | null };
};

export const SPLASH_STAGE_CHIPS = ["#EAD4B4", "#101318", "#F4F1EA", "#E8402A"] as const;

export const SPLASH_DEFAULT: SplashLook = {
  text: "GOOD\nDAY",
  font: "Modak",
  customFonts: [],
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
  bounce: 30,
  shine: true,
  shineSize: 4,
  shineInset: 2,
  shineRound: 2,
  shineColor: "#FFFFFF",
  shineBlend: "normal",
  arc: 0,
  bulge: 0,
  stage: { mode: "color", color: "#EAD4B4" },
};

export function buildSplashCfg(look: SplashLook): GenConfig {
  const c = defaultConfig();
  const t = c.type;
  t.font = look.font;
  t.customFonts = [...look.customFonts];
  t.weight = 400;
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
  t.glints = { on: false, opacity: 85, style: "stars", blend: "normal" };
  t.stripes = {
    on: look.pattern.on,
    angle: look.pattern.angle,
    opacity: look.pattern.opacity,
    style: look.pattern.style as NonNullable<GenConfig["type"]["stripes"]>["style"],
    scale: look.pattern.scale,
  };
  t.noise = { on: false, amount: 35, scale: 50 };
  t.shine = { on: look.shine, size: look.shineSize, inset: look.shineInset, round: look.shineRound, opacity: 100, color: look.shineColor, blend: look.shineBlend };
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
    gloss: 0,
    glossCover: 35,
    tilt: look.bounce,
    drift: 55,               // the lean is part of the look itself
  };
  c.lighting = { ...c.lighting, angle: 90, highlight: 70, lowlight: 50 };
  c.effects = { ...c.effects, Bevel: look.fill, Glow: look.fill };
  return c;
}
