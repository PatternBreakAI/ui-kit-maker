import { defaultConfig } from "@/generator/model";
import type { GenConfig } from "@/generator/model";

/* Splash Text — one look, purpose-built: the flat retro sticker (solid
   ink letterforms, one black blob that is wrap + leaning block-extrusion
   in a single shape, soft ground shadow, star sparkles). The page holds
   THIS small model; the engine still speaks GenConfig, so buildSplashCfg
   maps the look onto the same renderer everything else uses. */

export type SplashLook = {
  text: string;
  font: string;
  customFonts: string[];
  /** letterform ink */
  fill: string;
  /** the blob: wrap + body + everything behind the ink, one color */
  blob: string;
  /** block-extrusion reach, px at the 52px master scale */
  depth: number;
  /** soft ground-shadow opacity 0..100 */
  shadow: number;
  /** per-letter tilt & bounce 0..100 — jaunty, still one sticker */
  bounce: number;
  /** ink shine — top-light crescents on each letterform */
  shine: boolean;
  shineSize: number;   // 1..10
  shineInset: number;  // 0..6
  /** whole-word shape — one object, in-plane */
  arc: number;      // -100..100
  bulge: number;    // -100..100
  stage: { mode: "color" | "transparent"; color: string };
};

export const SPLASH_STAGE_CHIPS = ["#EAD4B4", "#101318", "#F4F1EA", "#E8402A"] as const;

export const SPLASH_DEFAULT: SplashLook = {
  text: "GOOD DAY",
  font: "Modak",
  customFonts: [],
  fill: "#E8402A",
  blob: "#221E1F",
  depth: 14,
  shadow: 25,
  bounce: 30,
  shine: true,
  shineSize: 4,
  shineInset: 2,
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
  t.fillMode = "solid";
  t.fill = look.fill;
  t.fillOpacity = 100;
  t.highlight = "";
  delete t.fillStops;
  t.outline = { on: false, color: look.blob, color2: null, width: 2, behind: true };
  t.shadow = { on: false, color: look.blob, x: 0, y: 3, blur: 2, opacity: 50 };
  t.emboss = { on: false, strength: 0, softness: 30, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
  t.glow = { on: false, color: look.fill, size: 10, opacity: 80 };
  t.glints = { on: false, opacity: 85, style: "stars", blend: "normal" };
  t.stripes = { on: false, angle: 0, opacity: 30, style: "stripes", scale: 100 };
  t.noise = { on: false, amount: 35, scale: 50 };
  t.shine = { on: look.shine, size: look.shineSize, inset: look.shineInset, round: 2, opacity: 100, color: "#FFFFFF" };
  t.dim = {
    on: true,
    depth: look.depth,
    color: look.blob,
    sticker: 8,                // wrap and lean are part of the look itself,
    stickerColor: look.blob,   // not knobs — one blob, reference-faithful
    rim: 0,
    rimColor: look.blob,
    shadow: look.shadow,
    gloss: 0,
    glossCover: 35,
    tilt: look.bounce,
    drift: 55,
  };
  c.lighting = { ...c.lighting, angle: 90, highlight: 70, lowlight: 50 };
  c.effects = { ...c.effects, Bevel: look.fill, Glow: look.fill };
  return c;
}
