import type { GenConfig } from "@/generator/model";

/* Type Maker launch styles — presets over the SAME engine knobs the kit
   editor drives. Each apply() mutates a fresh GenConfig's type/lighting/
   effects blocks; nothing here is a second renderer. The backdrop is a
   Type Maker surface concern (the specimen itself is shell-less), composed
   behind the art by the page and included in exports on request.

   Metallics are the launch centerpiece (owner, 2026-08-08): gold, chrome
   and silver ride the new multi-stop fillStops bands; Juice Pop rides the
   new dimensional-type block; Neon rides the classic outline+glow pair. */

/** A style's stage mood — a full-bleed radial wash the page can offer as
 *  one of its background modes (the stage itself defaults to black, like
 *  the kit editor's canvas). */
export type TmBackdrop = {
  /** radial colors, center → edge */
  from: string; to: string;
  /** faint sunburst rays (Juice Pop's stage) */
  rays?: boolean;
  /** soft ambient light tint behind the word */
  ambient?: string;
};

export type TmPreset = {
  id: string;
  name: string;
  blurb: string;
  sampleText: string;
  backdrop: TmBackdrop;
  apply: (c: GenConfig) => void;
};

const baseType = (c: GenConfig) => {
  const t = c.type;
  t.italic = false;
  t.case = "upper";
  t.spacing = 4;
  t.fillOpacity = 100;
  t.highlight = "";
  // behind: strokes never cross a neighboring letter's face (owner note)
  t.outline = { on: false, color: "#0B0E14", color2: null, width: 2, behind: true };
  t.shadow = { on: false, color: "#0B0E14", x: 0, y: 3, blur: 2, opacity: 50 };
  t.emboss = { on: false, strength: 40, softness: 30, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
  t.glow = { on: false, color: "#8FF0FF", size: 10, opacity: 80 };
  t.glints = { on: false, opacity: 50, style: "slab", blend: "normal" };
  t.stripes = { on: false, angle: 0, opacity: 30, style: "stripes", scale: 100 };
  delete t.fillStops;
  delete t.dim;
  return t;
};

export const TM_PRESETS: TmPreset[] = [
  {
    id: "juice-pop",
    name: "Juice Pop",
    blurb: "Glossy candy sticker — extrusion, white wrap, hard shine.",
    sampleText: "JUICY",
    backdrop: { from: "#FFB25E", to: "#D9580E", rays: true },
    apply: (c) => {
      const t = baseType(c);
      t.font = "Lilita One"; t.weight = 400; t.size = 84; t.spacing = 6;
      t.fillMode = "gradient"; t.fill = "#FFF3B0"; t.fill2 = "#E85D04";
      t.fillStops = [
        { offset: 0, color: "#FFF3B0" }, { offset: 0.3, color: "#FFD166" },
        { offset: 0.68, color: "#FB8B24" }, { offset: 1, color: "#E85D04" },
      ];
      t.outline = { on: true, color: "#6E2A05", color2: null, width: 3.2, behind: true };
      t.dim = { on: true, depth: 7, color: "#A34708", sticker: 6, stickerColor: "#FFFFFF", rim: 2.6, rimColor: "#6E2A05", shadow: 30, gloss: 32, glossCover: 36, tilt: 55 };
      c.lighting = { ...c.lighting, angle: 90, highlight: 78, lowlight: 46 };
      c.effects = { ...c.effects, Bevel: "#E85D04", Glow: "#FFD166" };
    },
  },
  {
    id: "liquid-gold",
    name: "Liquid Gold",
    blurb: "Banded metal, bevel light, bronze body — the flagship.",
    sampleText: "ROYAL",
    backdrop: { from: "#33261A", to: "#0F0A05", ambient: "#F4CF62" },
    apply: (c) => {
      const t = baseType(c);
      t.font = "Cinzel"; t.weight = 700; t.size = 84; t.spacing = 6;
      t.fillMode = "gradient"; t.fill = "#FFE793"; t.fill2 = "#8F5E07";
      t.fillStops = [
        { offset: 0, color: "#FFFCE8" }, { offset: 0.22, color: "#FFE793" },
        { offset: 0.45, color: "#C98F1B" }, { offset: 0.52, color: "#8F5E07" },
        { offset: 0.6, color: "#B57C12" }, { offset: 0.8, color: "#F4CF62" },
        { offset: 1, color: "#FFF7CF" },
      ];
      t.outline = { on: true, color: "#5C3C05", color2: null, width: 1.8, behind: true };
      t.emboss = { on: true, strength: 58, softness: 24, distance: 2.5, hiOpacity: 85, shOpacity: 60, hiColor: "#FFF6D8", shColor: "#2A1602" };
      t.glints = { on: true, opacity: 60, style: "sheen", blend: "normal" };
      t.dim = { on: true, depth: 9, color: "#6B4A10", sticker: 0, stickerColor: "#FFFFFF", rim: 1.6, rimColor: "#241703", shadow: 45, gloss: 26, glossCover: 30, tilt: 0 };
      c.lighting = { ...c.lighting, angle: 90, highlight: 82, lowlight: 40 };
      c.effects = { ...c.effects, Bevel: "#C98F1B", Glow: "#FFE793" };
    },
  },
  {
    id: "chrome",
    name: "Chrome",
    blurb: "Cold mirror bands with a horizon cut — racer metal.",
    sampleText: "TURBO",
    backdrop: { from: "#202A36", to: "#0A0E14", ambient: "#7FB4E0" },
    apply: (c) => {
      const t = baseType(c);
      t.font = "Michroma"; t.weight = 400; t.size = 72; t.spacing = 8;
      t.fillMode = "gradient"; t.fill = "#EAF6FF"; t.fill2 = "#2E4459";
      t.fillStops = [
        { offset: 0, color: "#EAF6FF" }, { offset: 0.38, color: "#9FC6E8" },
        { offset: 0.49, color: "#5E7F9C" }, { offset: 0.51, color: "#22364A" },
        { offset: 0.62, color: "#6E8CA6" }, { offset: 0.78, color: "#C2D8EA" },
        { offset: 1, color: "#F4FAFF" },
      ];
      t.outline = { on: true, color: "#22303C", color2: null, width: 1.8, behind: true };
      t.emboss = { on: true, strength: 48, softness: 22, distance: 2.5, hiOpacity: 82, shOpacity: 60, hiColor: "#F4FAFF", shColor: "#0B1218" };
      t.glints = { on: true, opacity: 62, style: "streak", blend: "normal" };
      t.dim = { on: true, depth: 7, color: "#31414F", sticker: 0, stickerColor: "#FFFFFF", rim: 1.4, rimColor: "#101820", shadow: 40, gloss: 0, glossCover: 30, tilt: 0 };
      c.lighting = { ...c.lighting, angle: 90, highlight: 85, lowlight: 45 };
      c.effects = { ...c.effects, Bevel: "#5E7F9C", Glow: "#9FC6E8" };
    },
  },
  {
    id: "silver",
    name: "Silver",
    blurb: "Polished sterling — quieter bands, star sparkle.",
    sampleText: "ONYX",
    backdrop: { from: "#2A303B", to: "#0D1015", ambient: "#C7D4E4" },
    apply: (c) => {
      const t = baseType(c);
      t.font = "Alfa Slab One"; t.weight = 400; t.size = 80; t.spacing = 5;
      t.fillMode = "gradient"; t.fill = "#FFFFFF"; t.fill2 = "#6E7B8C";
      t.fillStops = [
        { offset: 0, color: "#FFFFFF" }, { offset: 0.3, color: "#DDE4EC" },
        { offset: 0.48, color: "#9AA6B5" }, { offset: 0.55, color: "#6E7B8C" },
        { offset: 0.68, color: "#B9C4D2" }, { offset: 1, color: "#F2F6FA" },
      ];
      t.outline = { on: true, color: "#3A4552", color2: null, width: 1.8, behind: true };
      t.emboss = { on: true, strength: 50, softness: 26, distance: 2.5, hiOpacity: 82, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#10151C" };
      t.glints = { on: true, opacity: 58, style: "stars", blend: "normal" };
      t.dim = { on: true, depth: 7, color: "#55606E", sticker: 0, stickerColor: "#FFFFFF", rim: 1.5, rimColor: "#232B36", shadow: 40, gloss: 20, glossCover: 28, tilt: 0 };
      c.lighting = { ...c.lighting, angle: 90, highlight: 82, lowlight: 44 };
      c.effects = { ...c.effects, Bevel: "#9AA6B5", Glow: "#DDE4EC" };
    },
  },
  {
    id: "neon-sign",
    name: "Neon Sign",
    blurb: "Hot tube on a night wall — core light, wide glow.",
    sampleText: "GLOW",
    backdrop: { from: "#181034", to: "#070512", ambient: "#FF49D8" },
    apply: (c) => {
      const t = baseType(c);
      t.font = "Righteous"; t.weight = 400; t.size = 84; t.spacing = 8;
      t.fillMode = "solid"; t.fill = "#FFF5FD"; t.fillOpacity = 92;
      t.outline = { on: true, color: "#FF49D8", color2: null, width: 4.2, behind: true };
      t.glow = { on: true, color: "#FF49D8", size: 20, opacity: 95 };
      c.lighting = { ...c.lighting, angle: 90, highlight: 70, lowlight: 55 };
      c.effects = { ...c.effects, Bevel: "#FF49D8", Glow: "#FF49D8" };
    },
  },
];

export const tmPresetById = (id: string): TmPreset =>
  TM_PRESETS.find((p) => p.id === id) ?? TM_PRESETS[0];
