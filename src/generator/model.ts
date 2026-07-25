// The UI Generator — canonical model (v9, "hard candy").
// A layered candy-shell surface model: every visual layer of the button
// (shadow, extrusion, rim, bevel wall, face gradient, inner edge, inner glow,
// gloss, specular, bloom, texture, content) is driven by explicit tokens.
// One config drives canvas, code copy, HTML download, and exports.

export type GenStateName = "default" | "hover" | "pressed" | "disabled";
export const STATE_NAMES: GenStateName[] = ["default", "hover", "pressed", "disabled"];

export type EffectRole = "Bevel" | "Glow" | "Highlight" | "Shadow" | "Inner Fill";
export const EFFECT_ROLES: EffectRole[] = ["Bevel", "Glow", "Highlight", "Shadow", "Inner Fill"];
export const ROLE_HINT: Record<EffectRole, string> = {
  Bevel: "shell & wall", Glow: "inner glow", Highlight: "gloss & specular", Shadow: "grounding", "Inner Fill": "candy face",
};

export type Shape =
  | "chamfer" | "pill" | "sharp" | "round" | "hex" | "trapezoid" | "notch"
  // v85 — speech bubble: rounded body + tail as one silhouette
  | "speech"
  // v19 silhouette library — procedural geometry only; material stays separate
  | "chunky" | "cutline" | "polybar" | "explorer" | "kart" | "mazepill"
  | "fighthud" | "crest" | "blade" | "tavern" | "handdrawn"
  // v20 archetypes — deep chamfer, swallowtail banner, shield, pixel steps
  | "deepchamfer" | "banner" | "shield" | "pixelstep"
  // v21 — measured from Kenney UI Pack 2.0 vector sources (CC0)
  | "kenneyRect" | "kenneyTag"
  // v22 — measured from Vector UI Pack (dobo_ui by Duplo) renders
  | "doboMarquee" | "doboRibbon" | "doboBracket"
  // v33 — user-imported flat-vector silhouettes (registry below)
  | `user:${string}`
  // v64 — Silhouette Feasibility Lab imports (importedShapes.ts). Reached
  // ONLY through the isolated lab page; never listed in the production
  // picker until the lab results are approved.
  | `lab:${string}`;
/* ── user silhouettes ─────────────────────────────────────────────
   Imported flat vectors: one closed, filled outline normalized to its own
   bounding box; the renderer stretches it into each component's frame.
   The registry is module state so the pure renderer can read it without
   store imports; the store hydrates and persists it. */
export interface UserShape { id: `user:${string}`; name: string; d: string; vb: [number, number, number, number] }
let USER_SHAPES: UserShape[] = [];
export const userShapes = (): UserShape[] => USER_SHAPES;
export function setUserShapes(list: UserShape[]) { USER_SHAPES = list; }

export const SHAPES: { id: Shape; name: string }[] = [
  { id: "round", name: "Rounded" },
  { id: "pill", name: "Pill" },
  { id: "sharp", name: "Sharp" },
  { id: "hex", name: "Hex — pointed ends" },
  { id: "trapezoid", name: "Trapezoid" },
  { id: "notch", name: "Notch — diagonal cut" },
  { id: "chunky", name: "Crewmate Chunky" },
  { id: "cutline", name: "Sport Cutline" },
  { id: "polybar", name: "Racing Polybar" },
  { id: "explorer", name: "Cosmic Explorer" },
  { id: "mazepill", name: "Retro Maze Pill" },
  { id: "fighthud", name: "Fighting HUD" },
  { id: "crest", name: "Blade Crest" },
  { id: "blade", name: "Persian Blade" },
  { id: "tavern", name: "Arcane Tavern" },
  { id: "handdrawn", name: "Hand-Drawn" },
  { id: "banner", name: "Pointed Banner" },
  { id: "shield", name: "Shield Plaque" },
  { id: "pixelstep", name: "Pixel Step" },
  { id: "kenneyRect", name: "Crisp Panel" },
  { id: "kenneyTag", name: "Pointer Tag" },
  { id: "doboBracket", name: "Bracket Label" },
  { id: "speech", name: "Speech Bubble" },
];
/** Neutral canvas surfaces only — the stage never competes with the component. */
export const CANVAS_BGS = [
  { id: "#FFFFFF", name: "White" },
  { id: "#F4F5F7", name: "Light" },
  { id: "#B9BEC6", name: "Gray" },
  { id: "#1C1D22", name: "Dark" },
  { id: "#000000", name: "Black" },
] as const;
export type CanvasBg = (typeof CANVAS_BGS)[number]["id"];
/** Perceptual darkness of any canvas color — custom colors included. */
export function isDarkBg(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const p = parseInt(hex.slice(1), 16);
  return 0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255) < 110;
}

/** Editable per-state treatment — edits apply to the selected state only. */
export interface StateAdjust {
  brightness: number; // -30..30
  saturation: number; // -100..100 (negative drains, positive enriches)
  glow: number;       // 0..100 (outer aura)
  lift: number;       // -10..10 px (negative = raised, positive = depressed)
  opacity: number;    // 0..100
}

/* Icons are parked while the hard-candy surface gets dialed in. The whole
   icon system stays intact underneath — flip this to bring it back. */
export const ICONS_ENABLED = false;

/* ── candy surface tokens — the layered shell ─────────────────── */
export type SpecularMode = "soft" | "hard" | "line" | "dual" | "anime" | "sweep";
export const SPECULAR_MODES: { id: SpecularMode; name: string }[] = [
  { id: "soft", name: "Soft spot" },
  { id: "hard", name: "Hard spot" },
  { id: "line", name: "Line streak" },
  { id: "dual", name: "Dual spot" },
  { id: "anime", name: "Anime" },
  { id: "sweep", name: "Edge sweep" },
];

/* SVG-native blend modes — mix-blend-mode is honored by every major browser's
   SVG renderer and survives copy/export because it ships as a style attr. */
export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";
export const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"];

export type PatternType = "none" | "stripes" | "dots" | "stars" | "checker" | "halftone";
export const PATTERN_TYPES: { id: PatternType; name: string }[] = [
  { id: "none", name: "None" },
  { id: "stripes", name: "Stripes" },
  { id: "dots", name: "Polka dots" },
  { id: "stars", name: "Stars" },
  { id: "checker", name: "Checker" },
  { id: "halftone", name: "Halftone — comic fade" },
];

/** Extra styling layers for bar fills — progress, sliders and data-row
 *  bars all read the same model, so one edit restyles every bar. */
export interface BarFx {
  grad2: { on: boolean; color1: string; color2: string; blend: BlendMode; opacity: number; vertical: boolean };
  glow: { on: boolean; color: string; size: number; opacity: number };
  shadow: { on: boolean; opacity: number };
}
export function defaultBarFx(): BarFx {
  return {
    grad2: { on: false, color1: "#FFFFFF", color2: "#7ADCFF", blend: "soft-light", opacity: 55, vertical: true },
    glow: { on: false, color: "#8FF0FF", size: 7, opacity: 70 },
    shadow: { on: false, opacity: 40 },
  };
}

export interface CandyTokens {
  extrusion: { depth: number; darkness: number; glow: number };   // px, 0..100, 0..100 (base glow)
  rim: { width: number; brightness: number };                     // px, 0..100
  innerEdge: { strength: number; width: number };                 // 0..100, px
  innerGlow: { opacity: number; size: number; color: string | null };   // null = Glow well
  aura: { color: string | null };                                       // state glow color; null = Glow well
  gloss: {
    on: boolean; height: number; curve: number; opacity: number; softness: number;
    layer: "below" | "above";
    fill: "highlight" | "custom" | "gradient";  // highlight = Highlight well
    tint: string; tint2: string;                // custom color / gradient top & bottom
    blend?: BlendMode;
  };
  specular: {
    on: boolean; mode: SpecularMode;
    size: number;       // px
    stretch: number;    // 10..100 — height as % of width (shape)
    intensity: number;  // 0..100
    softness: number;   // 0..100 — falloff
    angle: number;      // -80..80° on top of the light-driven tilt
    gap: number;        // 50..300 — spacing between the two events (dual / anime)
    ox: number; oy: number; // -50..50 position nudges
    blend?: BlendMode;
  };
  bloom: { opacity: number; size: number };                       // 0..100 ×2 (bounce light, unlit side)
  contact: { opacity: number };                                   // tight shadow where body meets ground
  texture: { amount: number; scale: number };                     // 0..100 ×2 (micro grain)
  pattern: { type: PatternType; scale: number; angle: number; opacity: number; color: string | null }; // null = tone-on-tone
}

/* Universal defaults — Chevon's approved settings (uigeneratorsettings_2). */
export function defaultCandy(): CandyTokens {
  return {
    extrusion: { depth: 15, darkness: 94, glow: 69 },
    rim: { width: 3, brightness: 80 },
    innerEdge: { strength: 45, width: 3 },
    innerGlow: { opacity: 55, size: 55, color: null },
    aura: { color: null },
    gloss: { on: true, height: 42, curve: 26, opacity: 72, softness: 95, layer: "below", fill: "gradient", tint: "#3391b2", tint2: "#DFF7FF" },
    specular: { on: true, mode: "anime", size: 32, stretch: 10, intensity: 38, softness: 0, angle: 0, gap: 300, ox: 33, oy: -30 },
    bloom: { opacity: 45, size: 60 },
    contact: { opacity: 32 },
    texture: { amount: 25, scale: 50 },
    pattern: { type: "stripes", scale: 100, angle: 45, opacity: 71, color: "#1d819a" },
  };
}

/* ── typography tokens ────────────────────────────────────────── */
export type TextCase = "none" | "upper" | "lower" | "title";
export interface TypeCfg {
  font: string;
  customFonts: string[];  // user-added Google Font family names
  size: number;        // px at master scale
  weight: number;      // clamped to the face's real capabilities at edit time
  width?: number;      // `wdth` axis %, only honored when the face has the axis
  italic: boolean;
  spacing: number;     // letter-spacing, em/100 (-5..20)
  case: TextCase;
  oy?: number;         // vertical nudge px — visually center against the shell
  ox?: number;         // horizontal nudge px — same scale, sideways
  /** First matching phrase inside the label renders as a brighter, illuminated
   *  portion of the same material — same font, metrics, outline, everything. */
  highlight?: string;
  /** How hard the highlight phrase lifts toward white — 0..100, default 70. */
  highlightBoost?: number;
  /** Pattern fill inside the letterforms (off by default) — any face
   *  pattern style, tone-on-tone from the shell color. scale is a percent
   *  of the natural cell size (100 = default density). */
  stripes?: { on: boolean; angle: number; opacity: number; style?: Exclude<PatternType, "none">; scale?: number };
  /** Balloon highlight following the key light — the closest the shell gets
   *  to an inflate effect without touching the glyph geometry. */
  inflate?: { on: boolean; strength: number };
  /** Crisp vector glints riding the letterforms — a specular slab clipped to
   *  the glyphs plus star sparkles, all placed by the master lighting angle.
   *  ox/oy nudge the whole treatment in % of the letter height. */
  glints?: { on: boolean; opacity: number; ox?: number; oy?: number };
  fillMode: "auto" | "solid" | "gradient";
  fill: string;
  fill2: string;       // gradient bottom
  fillOpacity: number; // 0..100 — translucent fills read as glass
  outline: { on: boolean; color: string; color2: string | null; width: number };       // color2 set = gradient stroke
  shadow: { on: boolean; color: string; x: number; y: number; blur: number; opacity: number };
  /** Relief follows the master light: highlight toward it, shade away from it.
   *  strength -100..100 (negative = deboss/engrave); distance = offset px;
   *  softness = blur; hiOpacity/shOpacity control each side independently. */
  emboss: { on: boolean; strength: number; softness: number; shSoftness?: number; distance: number; hiOpacity: number; shOpacity: number; hiColor: string; shColor: string };
  glow: { on: boolean; color: string; size: number; opacity: number };
  preset: string;
}

export const TEXT_PRESETS: { id: string; name: string }[] = [
  { id: "none", name: "None" },
  { id: "outline", name: "Outline" },
  { id: "shadow", name: "Shadow" },
  { id: "emboss", name: "Emboss" },
  { id: "innerbevel", name: "Inner Bevel" },
  { id: "glow", name: "Glow" },
  { id: "outshadow", name: "Outline + Shadow" },
  { id: "outemboss", name: "Outline + Emboss" },
  { id: "candy", name: "Candy" },
  { id: "arcade", name: "Arcade" },
  { id: "chiseled", name: "Chiseled" },
  { id: "glass", name: "Glass" },
  // v67 · genre treatments — popular video-game type languages
  { id: "fps-stencil", name: "FPS Stencil" },
  { id: "rpg-gilded", name: "Gilded RPG" },
  { id: "moba-arcane", name: "Arcane MOBA" },
  { id: "platform-bubble", name: "Bubble Platformer" },
  { id: "racer-chrome", name: "Chrome Racer" },
  { id: "fighter-impact", name: "Impact Fighter" },
  { id: "strategy-imperium", name: "Imperium Strategy" },
  { id: "horror-blight", name: "Blight Horror" },
  { id: "survival-scavenge", name: "Scavenger Survival" },
  { id: "sandbox-blocky", name: "Blocky Sandbox" },
];

/** Presets populate the typography controls — nothing locks; keep tweaking after. */
export function applyTextPreset(t: TypeCfg, id: string, palette: { dark: string; glow: string }) {
  t.preset = id;
  t.fillOpacity = 100;
  t.outline = { on: false, color: palette.dark, color2: null, width: 2.5 };
  t.shadow = { on: false, color: palette.dark, x: 0, y: 3, blur: 2, opacity: 50 };
  t.emboss = { on: false, strength: 55, softness: 30, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
  t.glow = { on: false, color: palette.glow, size: 8, opacity: 80 };
  if (id === "none") { t.fillMode = "auto"; return; }
  if (id === "outline") { t.outline.on = true; return; }
  if (id === "shadow") { t.shadow.on = true; return; }
  if (id === "emboss") { t.emboss.on = true; return; }
  if (id === "innerbevel") { t.emboss = { on: true, strength: -60, softness: 30, distance: 2, hiOpacity: 65, shOpacity: 65, hiColor: "#FFFFFF", shColor: "#04080E" }; return; }
  if (id === "glow") { t.glow.on = true; return; }
  if (id === "outshadow") { t.outline.on = true; t.shadow.on = true; return; }
  if (id === "outemboss") { t.outline.on = true; t.emboss.on = true; return; }
  if (id === "candy") {
    t.fillMode = "solid"; t.fill = "#FFFFFF";
    t.outline = { on: true, color: palette.dark, color2: null, width: 2.6 };
    t.shadow = { on: true, color: palette.dark, x: 0, y: 3, blur: 1.5, opacity: 45 };
    t.emboss = { on: true, strength: 30, softness: 25, distance: 2, hiOpacity: 75, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
    return;
  }
  if (id === "arcade") {
    t.fillMode = "gradient"; t.fill = "#FFE45C"; t.fill2 = "#FF9A3D";
    t.outline = { on: true, color: "#5A2B00", color2: null, width: 3.4 };
    t.shadow = { on: true, color: "#000000", x: 0, y: 4, blur: 0, opacity: 65 };
    return;
  }
  if (id === "chiseled") {
    t.fillMode = "gradient"; t.fill = "#F4F6F8"; t.fill2 = "#B9C0CC";
    t.emboss = { on: true, strength: -70, softness: 20, distance: 2.5, hiOpacity: 65, shOpacity: 70, hiColor: "#FFFFFF", shColor: "#04080E" };
    t.shadow = { on: true, color: palette.dark, x: 0, y: 2, blur: 1, opacity: 35 };
    return;
  }
  if (id === "glass") {
    // frosted label sealed in the shell: translucent fill, soft engrave
    t.fillMode = "solid"; t.fill = "#FFFFFF"; t.fillOpacity = 34;
    t.emboss = { on: true, strength: -48, softness: 72, distance: 2, hiOpacity: 60, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" };
    t.shadow = { on: true, color: "#FFFFFF", x: 0, y: 1, blur: 0.5, opacity: 35 };
    return;
  }
  /* ── v67 genre treatments ── */
  if (id === "fps-stencil") {
    // milspec HUD: flat plate, hard offset shadow, zero softness
    t.fillMode = "solid"; t.fill = "#E8ECEF";
    t.shadow = { on: true, color: "#0A0E12", x: 3, y: 3, blur: 0, opacity: 85 };
    return;
  }
  if (id === "rpg-gilded") {
    // loot-screen gold: warm gradient, engraved edge, ember glow
    t.fillMode = "gradient"; t.fill = "#FFE9A8"; t.fill2 = "#C9891B";
    t.outline = { on: true, color: "#4A2C05", color2: null, width: 2 };
    t.emboss = { on: true, strength: 42, softness: 28, distance: 2, hiOpacity: 80, shOpacity: 55, hiColor: "#FFF6D8", shColor: "#2A1602" };
    t.glow = { on: true, color: "#FFB63D", size: 10, opacity: 55 };
    return;
  }
  if (id === "moba-arcane") {
    // spell-blue rune light: icy gradient with a strong cast
    t.fillMode = "gradient"; t.fill = "#CDE9FF"; t.fill2 = "#6FA8FF";
    t.outline = { on: true, color: "#152352", color2: null, width: 2.2 };
    t.glow = { on: true, color: "#6FB4FF", size: 14, opacity: 90 };
    return;
  }
  if (id === "platform-bubble") {
    // Saturday-morning platformer: fat white letters, thick outline, bounce shadow
    t.fillMode = "solid"; t.fill = "#FFFFFF";
    t.outline = { on: true, color: palette.dark, color2: null, width: 4.2 };
    t.shadow = { on: true, color: palette.dark, x: 0, y: 4, blur: 0, opacity: 70 };
    t.emboss = { on: true, strength: 32, softness: 35, distance: 2, hiOpacity: 70, shOpacity: 45, hiColor: "#FFFFFF", shColor: "#04080E" };
    return;
  }
  if (id === "racer-chrome") {
    // paddock chrome: cold metal gradient with a speed-smeared shadow
    t.fillMode = "gradient"; t.fill = "#F4FBFF"; t.fill2 = "#93AABB";
    t.outline = { on: true, color: "#22303C", color2: null, width: 1.8 };
    t.shadow = { on: true, color: "#0B1218", x: 5, y: 2, blur: 1, opacity: 60 };
    return;
  }
  if (id === "fighter-impact") {
    // versus-screen slam: hot yellow, brutal black block shadow
    t.fillMode = "solid"; t.fill = "#FFE24A";
    t.outline = { on: true, color: "#14060A", color2: null, width: 4.5 };
    t.shadow = { on: true, color: "#14060A", x: 5, y: 5, blur: 0, opacity: 90 };
    t.emboss = { on: true, strength: 26, softness: 20, distance: 2, hiOpacity: 70, shOpacity: 55, hiColor: "#FFF7C9", shColor: "#3A0E00" };
    return;
  }
  if (id === "strategy-imperium") {
    // campaign-map brass: parchment tone, engraved, quiet
    t.fillMode = "solid"; t.fill = "#EADFC8";
    t.outline = { on: true, color: "#3B2B12", color2: null, width: 1.6 };
    t.emboss = { on: true, strength: -46, softness: 26, distance: 2, hiOpacity: 55, shOpacity: 70, hiColor: "#FFF4DC", shColor: "#1E1204" };
    t.shadow = { on: true, color: "#1E1204", x: 0, y: 2, blur: 2, opacity: 40 };
    return;
  }
  if (id === "horror-blight") {
    // survival horror: bone-pale letters sinking into the plate, sick glow
    t.fillMode = "solid"; t.fill = "#D8D4C8";
    t.emboss = { on: true, strength: -62, softness: 55, distance: 2.5, hiOpacity: 40, shOpacity: 80, hiColor: "#EFEBDD", shColor: "#020304" };
    t.shadow = { on: true, color: "#000000", x: 0, y: 3, blur: 4, opacity: 70 };
    t.glow = { on: true, color: "#8E1B12", size: 12, opacity: 40 };
    return;
  }
  if (id === "survival-scavenge") {
    // scrap-metal stencil: olive drab, worn soft shadow, faint moss glow
    t.fillMode = "solid"; t.fill = "#C9CDBB";
    t.shadow = { on: true, color: "#12160C", x: 0, y: 2, blur: 3, opacity: 60 };
    t.emboss = { on: true, strength: -30, softness: 40, distance: 2, hiOpacity: 45, shOpacity: 60, hiColor: "#E9EDD9", shColor: "#0A0D06" };
    t.glow = { on: true, color: "#7A8F4D", size: 8, opacity: 30 };
    return;
  }
  if (id === "sandbox-blocky") {
    // voxel sandbox: pure white, single hard pixel-drop, nothing soft
    t.fillMode = "solid"; t.fill = "#FFFFFF";
    t.outline = { on: true, color: palette.dark, color2: null, width: 2.8 };
    t.shadow = { on: true, color: palette.dark, x: 4, y: 4, blur: 0, opacity: 100 };
    return;
  }
}

/* ── icon tokens ──────────────────────────────────────────────── */
/** Normalized icon: enough raw SVG to render deterministically anywhere. */
export interface IconDef { lib: string; name: string; viewBox: string; inner: string; mode: "stroke" | "fill" }

export interface IconCfg {
  show: boolean;
  def: IconDef | null;
  placement: "left" | "right";
  only: boolean;              // icon-only (hides the label)
  size: number;               // 40..170 % of base
  strokeWidth: number;        // ×10 (5..40 → 0.5..4) for stroke libraries
  color: string | null;       // null = match text
  opacity: number;            // 0..100
  rotation: number;           // 0..360
  gap: number;                // px between text and icon
  ox: number; oy: number;     // nudge, px
  fx: { shadow: boolean; glow: boolean; emboss: boolean };
}

export const DEFAULT_ICON: IconDef = {
  lib: "lucide", name: "Play", viewBox: "0 0 24 24",
  inner: '<polygon points="6 3 20 12 6 21 6 3"/>', mode: "stroke",
};

export function defaultIconCfg(): IconCfg {
  return {
    show: true, def: { ...DEFAULT_ICON }, placement: "right", only: false,
    size: 100, strokeWidth: 24, color: null, opacity: 100, rotation: 0,
    gap: 18, ox: 0, oy: 0, fx: { shadow: false, glow: false, emboss: false },
  };
}

/** What a face can actually do — the single source of truth the editor's
 *  weight/width controls read. Variable axes carry real min/max/default;
 *  static families list only the weights the stylesheet actually loads. */
export interface FontCaps {
  /** Static weights that are really loaded (absent for variable faces). */
  weights?: number[];
  /** Variable `wght` axis: [min, max, default]. */
  wght?: [number, number, number];
  /** Variable `wdth` axis: [min, max, default] (percent). */
  wdth?: [number, number, number];
  /** True italic files exist (synthetic slant is still allowed — it is part
   *  of the approved treatment). */
  italic?: boolean;
}

/** Popular game-UI faces from Google Fonts. `factor` ≈ average glyph advance
 *  (em) used for auto-width; `css` is the families query for fonts.googleapis
 *  — variable faces request their full real axis range. */
export const GAME_FONTS: { name: string; css: string | null; factor: number; caps: FontCaps }[] = [
  { name: "Inter", css: null, factor: 0.6, caps: { wght: [100, 900, 400], italic: true } },
  { name: "Bangers", css: "Bangers", factor: 0.5, caps: { weights: [400] } },
  { name: "Luckiest Guy", css: "Luckiest+Guy", factor: 0.58, caps: { weights: [400] } },
  { name: "Press Start 2P", css: "Press+Start+2P", factor: 1.05, caps: { weights: [400] } },
  { name: "Bungee", css: "Bungee", factor: 0.72, caps: { weights: [400] } },
  { name: "Exo 2", css: "Exo+2:ital,wght@0,100..900;1,100..900", factor: 0.56, caps: { wght: [100, 900, 800], italic: true } },
  { name: "Saira", css: "Saira:ital,wght@0,100..900;1,100..900", factor: 0.56, caps: { wght: [100, 900, 800], italic: true } },
  { name: "Righteous", css: "Righteous", factor: 0.58, caps: { weights: [400] } },
  { name: "Russo One", css: "Russo+One", factor: 0.64, caps: { weights: [400] } },
  { name: "Black Ops One", css: "Black+Ops+One", factor: 0.7, caps: { weights: [400] } },
  { name: "Orbitron", css: "Orbitron:wght@400..900", factor: 0.74, caps: { wght: [400, 900, 700] } },
  { name: "Cinzel", css: "Cinzel:wght@400..900", factor: 0.62, caps: { wght: [400, 900, 700] } },
  { name: "Creepster", css: "Creepster", factor: 0.48, caps: { weights: [400] } },
  { name: "Titan One", css: "Titan+One", factor: 0.6, caps: { weights: [400] } },
  { name: "Lilita One", css: "Lilita+One", factor: 0.55, caps: { weights: [400] } },
  { name: "Chewy", css: "Chewy", factor: 0.52, caps: { weights: [400] } },
  { name: "Baloo 2", css: "Baloo+2:wght@400..800", factor: 0.58, caps: { wght: [400, 800, 700] } },
  { name: "Fredoka", css: "Fredoka:wdth,wght@75..125,300..700", factor: 0.6, caps: { wght: [300, 700, 600], wdth: [75, 125, 100] } },
  { name: "Passion One", css: "Passion+One:wght@400;700;900", factor: 0.5, caps: { weights: [400, 700, 900] } },
  { name: "Sigmar One", css: "Sigmar+One", factor: 0.66, caps: { weights: [400] } },
  { name: "Rubik Mono One", css: "Rubik+Mono+One", factor: 0.85, caps: { weights: [400] } },
  { name: "Audiowide", css: "Audiowide", factor: 0.68, caps: { weights: [400] } },
  { name: "Silkscreen", css: "Silkscreen:wght@400;700", factor: 0.72, caps: { weights: [400, 700] } },
  { name: "Pixelify Sans", css: "Pixelify+Sans:wght@400..700", factor: 0.58, caps: { wght: [400, 700, 600] } },
  { name: "Shrikhand", css: "Shrikhand", factor: 0.62, caps: { weights: [400] } },
  { name: "Concert One", css: "Concert+One", factor: 0.55, caps: { weights: [400] } },
  { name: "Paytone One", css: "Paytone+One", factor: 0.6, caps: { weights: [400] } },
  { name: "Alfa Slab One", css: "Alfa+Slab+One", factor: 0.62, caps: { weights: [400] } },
  { name: "Bowlby One SC", css: "Bowlby+One+SC", factor: 0.66, caps: { weights: [400] } },
  { name: "Modak", css: "Modak", factor: 0.6, caps: { weights: [400] } },
  { name: "Chango", css: "Chango", factor: 0.62, caps: { weights: [400] } },
  { name: "Boogaloo", css: "Boogaloo", factor: 0.5, caps: { weights: [400] } },
  { name: "Staatliches", css: "Staatliches", factor: 0.5, caps: { weights: [400] } },
  { name: "Grandstander", css: "Grandstander:ital,wght@0,100..900;1,100..900", factor: 0.58, caps: { wght: [100, 900, 700], italic: true } },
];
/* User-added Google Fonts — registered at runtime, names persisted in the
   config. Any family from fonts.google.com works; we request a broad weight
   set and expose those as a static list (no axis data is known for them). */
const customFontRegistry = new Map<string, { css: string; factor: number; caps: FontCaps }>();
export function registerCustomFont(name: string) {
  const clean = name.trim();
  if (!clean || GAME_FONTS.some((f) => f.name === clean)) return;
  customFontRegistry.set(clean, {
    css: clean.replace(/ /g, "+") + ":wght@400;500;600;700;800;900", factor: 0.62,
    caps: { weights: [400, 500, 600, 700, 800, 900] },
  });
}
export function customFontNames(): string[] { return [...customFontRegistry.keys()]; }

export function fontByName(name: string) {
  const custom = customFontRegistry.get(name);
  if (custom) return { name, ...custom };
  return GAME_FONTS.find((f) => f.name === name) ?? GAME_FONTS[0];
}

/** Clamp a requested weight into what the face can actually show. */
export function clampWeight(caps: FontCaps, w: number): number {
  if (caps.wght) return Math.max(caps.wght[0], Math.min(caps.wght[1], w));
  if (caps.weights?.length) {
    return caps.weights.reduce((best, cand) => (Math.abs(cand - w) < Math.abs(best - w) ? cand : best), caps.weights[0]);
  }
  return w;
}

export type GridStyle = "dots" | "lines" | "fine" | "both" | "off";

/** The full visual design of one state — everything that shapes the artwork.
 *  The base config holds Default's design; other states mirror it live until
 *  the user edits them with that state selected, which forks a copy. */
export interface StateDesign {
  shape: Shape;
  effects: Partial<Record<EffectRole, string>>;
  face: { mode: "light" | "dark"; contrast: number; midpoint: number };
  bevel: { width: number; softness: number; off?: boolean };
  candy: CandyTokens;
  lighting: { angle: number; highlight: number; lowlight: number; tint?: string | null };
  shadow: { distance: number; blur: number; opacity: number };
  transparency: { frame: number; interior: number; content: number };
  type: TypeCfg;
}

export const DESIGN_KEYS = ["shape", "effects", "face", "bevel", "candy", "lighting", "shadow", "transparency", "type"] as const;

export function pickDesign(src: StateDesign): StateDesign {
  return JSON.parse(JSON.stringify({
    shape: src.shape, effects: src.effects, face: src.face, bevel: src.bevel, candy: src.candy,
    lighting: src.lighting, shadow: src.shadow, transparency: src.transparency, type: src.type,
  })) as StateDesign;
}

export interface GenConfig extends StateDesign {
  presetId: string;
  /** Forked designs for non-default states. Absent = live mirror of Default. */
  stateDesigns: Partial<Record<Exclude<GenStateName, "default">, StateDesign>>;
  content: { label: string };
  icon: IconCfg;
  states: Record<GenStateName, StateAdjust>;
  visible: Record<Exclude<GenStateName, "default">, boolean>;
  canvas: string;
  /** Bar-fill styling layers (see BarFx) — optional, defaults off. */
  barFx?: BarFx;
  /** Dragger ball on sliders, toggles and joysticks — null = derived from
   *  the Bevel role like everything else. */
  knob?: { color: string | null };
}

/** Effective kit size for a component — Small retired (reads as Medium),
 *  and the default is Large everywhere. One helper so the nudge keys,
 *  exports and previews can never disagree about a component's size. */
export function effKitSize(s: KitSize | undefined): KitSize {
  return s === "s" ? "m" : (s ?? "l");
}

export interface Preset {
  id: string;
  name: string;
  shape: Shape;
  bevel: { width: number; softness: number };
  effects: Record<EffectRole, string>;
  candy?: Partial<{ [K in keyof CandyTokens]: Partial<CandyTokens[K]> }>;
}

/** Each preset is a different candy *construction*, not just a palette. */
export const PRESETS: Preset[] = [
  { id: "retro-diner", name: "Retro Diner", shape: "kenneyRect", bevel: { width: 11, softness: 70 },
    effects: { Bevel: "#D93A2B", Glow: "#FFD9A8", Highlight: "#FFF6E8", Shadow: "#66150C", "Inner Fill": "#F6E7C9" },
    candy: { pattern: { type: "checker", scale: 58, angle: 45, opacity: 20, color: null }, gloss: { height: 50, curve: 30, opacity: 66, softness: 40 }, specular: { on: true, mode: "line", size: 50, intensity: 55 }, extrusion: { depth: 12, darkness: 72 } } },
  { id: "hard-candy", name: "Hard Candy", shape: "round", bevel: { width: 10, softness: 78 },
    effects: { Bevel: "#0E9CC9", Glow: "#8FF0FF", Highlight: "#FFFFFF", Shadow: "#0A4A62", "Inner Fill": "#2CC5F0" },
    candy: { gloss: { height: 46, curve: 26, opacity: 72 }, specular: { on: true, mode: "anime" }, extrusion: { depth: 10 } } },
  { id: "royal-vault", name: "Royal Vault", shape: "shield", bevel: { width: 13, softness: 45 },
    effects: { Bevel: "#6C3FC9", Glow: "#C9A5FF", Highlight: "#FFEDB8", Shadow: "#251057", "Inner Fill": "#8F5BEF" },
    candy: { pattern: { type: "stars", scale: 62, angle: 0, opacity: 24, color: null }, gloss: { height: 44, curve: 22, opacity: 60, softness: 34 }, specular: { on: true, mode: "soft", size: 34, intensity: 58, softness: 60 }, innerGlow: { opacity: 66, size: 52 }, extrusion: { depth: 14, darkness: 80 } } },
  { id: "citrus-pop", name: "Citrus Pop", shape: "mazepill", bevel: { width: 11, softness: 88 },
    effects: { Bevel: "#E8890C", Glow: "#FFD34D", Highlight: "#FFF7DB", Shadow: "#7A3B00", "Inner Fill": "#FFA726" },
    candy: { gloss: { height: 48, curve: 30, opacity: 74 }, specular: { on: true, mode: "anime", size: 28, intensity: 80 }, extrusion: { depth: 11 }, bloom: { opacity: 55, size: 66 } } },
  { id: "comic-pop", name: "Comic Pop", shape: "notch", bevel: { width: 12, softness: 30 },
    effects: { Bevel: "#1E1F26", Glow: "#FFE24A", Highlight: "#FFFFFF", Shadow: "#0B0B12", "Inner Fill": "#FFC61A" },
    candy: { pattern: { type: "halftone", scale: 70, angle: 0, opacity: 38, color: null }, gloss: { height: 40, curve: 18, opacity: 58, softness: 20 }, specular: { on: true, mode: "hard", size: 26, intensity: 88 }, extrusion: { depth: 13, darkness: 88 } } },
  { id: "deep-ocean", name: "Deep Ocean", shape: "explorer", bevel: { width: 13, softness: 62 },
    effects: { Bevel: "#0A5B8F", Glow: "#4DE3FF", Highlight: "#EAFBFF", Shadow: "#04263F", "Inner Fill": "#0E7FC0" },
    candy: { gloss: { height: 40, curve: 18, opacity: 55, softness: 30 }, specular: { on: true, mode: "dual", size: 24, intensity: 62 }, innerGlow: { opacity: 70, size: 58 }, extrusion: { depth: 13, darkness: 66 } } },
  { id: "grape-jelly", name: "Grape Jelly", shape: "pill", bevel: { width: 9, softness: 100 },
    effects: { Bevel: "#8B34D8", Glow: "#E29CFF", Highlight: "#FFFFFF", Shadow: "#4A1178", "Inner Fill": "#A855F7" },
    candy: { gloss: { height: 54, curve: 40, opacity: 62, softness: 46 }, specular: { mode: "dual", softness: 55 }, innerGlow: { opacity: 72, size: 66 }, bloom: { opacity: 60, size: 72 }, extrusion: { depth: 12 } } },
  { id: "glacier-tech", name: "Glacier Tech", shape: "polybar", bevel: { width: 12, softness: 22 },
    effects: { Bevel: "#4E7E9C", Glow: "#B8F1FF", Highlight: "#F0FBFF", Shadow: "#122C40", "Inner Fill": "#7FB8D9" },
    candy: { pattern: { type: "none", scale: 100, angle: 45, opacity: 0, color: null }, texture: { amount: 26, scale: 44 }, gloss: { height: 36, curve: 10, opacity: 44, softness: 16 }, specular: { on: true, mode: "sweep", size: 18, intensity: 60 }, extrusion: { depth: 13, darkness: 76 }, innerEdge: { strength: 58, width: 3 } } },
  { id: "sakura-arcade", name: "Sakura Arcade", shape: "blade", bevel: { width: 9, softness: 92 },
    effects: { Bevel: "#E064A8", Glow: "#FFC7E8", Highlight: "#FFFFFF", Shadow: "#7C2050", "Inner Fill": "#F58BC5" },
    candy: { gloss: { height: 52, curve: 36, opacity: 76, softness: 34 }, specular: { on: true, mode: "anime", size: 30, intensity: 88 }, bloom: { opacity: 62, size: 70 }, extrusion: { depth: 9 } } },
  { id: "toy-box", name: "Toy Box", shape: "chunky", bevel: { width: 12, softness: 96 },
    effects: { Bevel: "#D98200", Glow: "#FFE066", Highlight: "#FFFDF2", Shadow: "#7A3D00", "Inner Fill": "#FFB020" },
    candy: { gloss: { height: 52, curve: 38, opacity: 80, softness: 42 }, specular: { on: true, mode: "dual", size: 26, intensity: 70, softness: 40 }, extrusion: { depth: 16, darkness: 70 }, pattern: { type: "dots", scale: 46, angle: 0, opacity: 30, color: null }, bloom: { opacity: 50, size: 64 } } },
  { id: "mint-cream", name: "Mint Cream", shape: "chunky", bevel: { width: 11, softness: 100 },
    effects: { Bevel: "#45C79F", Glow: "#CFFFEB", Highlight: "#FFFFFF", Shadow: "#14563F", "Inner Fill": "#7FE6C4" },
    candy: { pattern: { type: "dots", scale: 40, angle: 0, opacity: 22, color: null }, gloss: { height: 54, curve: 38, opacity: 78, softness: 48 }, specular: { on: true, mode: "dual", size: 26, intensity: 68, softness: 45 }, bloom: { opacity: 56, size: 66 }, extrusion: { depth: 10, darkness: 68 } } },
  { id: "neon-versus", name: "Neon Versus", shape: "fighthud", bevel: { width: 10, softness: 20 },
    effects: { Bevel: "#B4126B", Glow: "#FF3EC8", Highlight: "#FFE9F7", Shadow: "#3D0430", "Inner Fill": "#1C0F2E" },
    candy: { gloss: { height: 34, curve: 12, opacity: 40, softness: 20 }, specular: { on: true, mode: "line", size: 60, intensity: 60 }, extrusion: { depth: 12, darkness: 80 }, innerGlow: { opacity: 78, size: 48 }, bloom: { opacity: 55, size: 70 }, pattern: { type: "stripes", scale: 34, angle: 65, opacity: 26, color: null } } },
  { id: "hero-chisel", name: "Hero Chisel", shape: "chamfer", bevel: { width: 14, softness: 24 },
    effects: { Bevel: "#D97706", Glow: "#FDE68A", Highlight: "#FFF7E6", Shadow: "#7C2D12", "Inner Fill": "#F59E0B" },
    candy: { gloss: { height: 38, curve: 10, opacity: 44, softness: 10 }, specular: { mode: "sweep", size: 18, intensity: 62 }, extrusion: { depth: 14, darkness: 62 }, innerEdge: { strength: 62, width: 3 }, texture: { amount: 10, scale: 50 } } },
  { id: "forest-sprite", name: "Forest Sprite", shape: "tavern", bevel: { width: 12, softness: 70 },
    effects: { Bevel: "#3E8914", Glow: "#B4F461", Highlight: "#F2FFE0", Shadow: "#1C4405", "Inner Fill": "#61B520" },
    candy: { gloss: { height: 44, curve: 26, opacity: 62 }, specular: { on: true, mode: "soft", size: 30, intensity: 55 }, extrusion: { depth: 12, darkness: 64 }, texture: { amount: 12, scale: 46 } } },
  { id: "obsidian-ember", name: "Obsidian Ember", shape: "cutline", bevel: { width: 14, softness: 28 },
    effects: { Bevel: "#D4491F", Glow: "#FF9A3D", Highlight: "#FFE9D4", Shadow: "#26100A", "Inner Fill": "#1E1A1E" },
    candy: { gloss: { height: 34, curve: 10, opacity: 40 }, specular: { on: true, mode: "line", size: 55, intensity: 58 }, innerGlow: { opacity: 76, size: 44 }, extrusion: { depth: 14, darkness: 82 }, innerEdge: { strength: 66, width: 3 } } },
  { id: "bubble-pop", name: "Bubble Pop", shape: "round", bevel: { width: 8, softness: 100 },
    effects: { Bevel: "#E1408F", Glow: "#FFC1DE", Highlight: "#FFFFFF", Shadow: "#8C1D53", "Inner Fill": "#F868B1" },
    candy: { gloss: { height: 50, curve: 34, opacity: 78, softness: 30 }, specular: { mode: "anime", size: 30, intensity: 92 }, bloom: { opacity: 62, size: 68 }, extrusion: { depth: 9 } } },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function defaultStates(): Record<GenStateName, StateAdjust> {
  return {
    default: { brightness: 5, saturation: 0, glow: 0, lift: 0, opacity: 100 },
    hover: { brightness: 8, saturation: 0, glow: 38, lift: -3, opacity: 100 },
    pressed: { brightness: -6, saturation: 0, glow: 12, lift: 3, opacity: 100 },
    disabled: { brightness: 0, saturation: 0, glow: 0, lift: 0, opacity: 62 },
  };
}

/* Universal default type treatment — Chevon's approved look (v12):
   Russo One italic, white→ice gradient, soft shadow + emboss. */
export function defaultType(): TypeCfg {
  return {
    font: "Russo One", customFonts: [], size: 76, weight: 700, italic: true, spacing: 2, case: "upper",
    fillMode: "gradient", fill: "#00b5c2", fill2: "#0f96c2", fillOpacity: 100,
    outline: { on: false, color: "#0B6183", color2: null, width: 0.5 },
    shadow: { on: true, color: "#659db3", x: 0, y: 3, blur: 1.5, opacity: 45 },
    emboss: { on: true, strength: -74, softness: 0, distance: 2, hiOpacity: 70, shOpacity: 60, hiColor: "#FFFFFF", shColor: "#04080E" },
    glow: { on: true, color: "#8FF0FF", size: 15, opacity: 100 },
    preset: "candy",
  };
}

export function defaultConfig(): GenConfig {
  const p = presetById("hard-candy"); // the approved default, independent of picker order
  const candy = defaultCandy();
  applyPresetCandy(candy, p);
  return {
    presetId: p.id,
    stateDesigns: {},
    shape: "pill",
    effects: { ...p.effects },
    face: { mode: "light", contrast: 55, midpoint: 50 },
    bevel: { width: 19, softness: 78 },
    candy,
    lighting: { angle: 90, highlight: 78, lowlight: 46 },
    shadow: { distance: 28, blur: 14, opacity: 40 },
    transparency: { frame: 100, interior: 100, content: 100 },
    content: { label: "PLAY" },
    type: defaultType(),
    icon: defaultIconCfg(),
    states: defaultStates(),
    visible: { hover: true, pressed: true, disabled: true },
    canvas: "#000000",
    knob: { color: null },
  };
}

export function applyPresetCandy(candy: CandyTokens, p: Preset) {
  if (!p.candy) return;
  for (const k of Object.keys(p.candy) as (keyof CandyTokens)[]) {
    Object.assign(candy[k] as object, p.candy[k]);
  }
}

/* ── color utils ───────────────────────────────────────────────── */
export function hexMix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255), g = ch((pa >> 8) & 255, (pb >> 8) & 255), bl = ch(pa & 255, pb & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
export const lighten = (c: string, t: number) => hexMix(c, "#ffffff", t);
export const darken = (c: string, t: number) => hexMix(c, "#000000", t);
export function desaturate(c: string, t: number): string {
  const p = parseInt(c.slice(1), 16);
  const r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
  const gr = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const gray = `#${((1 << 24) | (gr << 16) | (gr << 8) | gr).toString(16).slice(1)}`;
  return hexMix(c, gray, t);
}
/** Saturation shift: k in -1..1. Negative mixes toward gray, positive pushes
 *  channels away from gray (clamped). */
export function saturate(c: string, k: number): string {
  const p = parseInt(c.slice(1), 16);
  const r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
  const gr = 0.299 * r + 0.587 * g + 0.114 * b;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(gr + (v - gr) * (1 + k))));
  return `#${((1 << 24) | (ch(r) << 16) | (ch(g) << 8) | ch(b)).toString(16).slice(1)}`;
}

export function hexRgba(c: string, alpha: number): string {
  const p = parseInt(c.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${alpha.toFixed(2)})`;
}
export function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* Color harmony engine — random rolls follow game-UI color theory instead of
   free-for-all hues. Every scheme keeps the guardrails that make candy read:
   a saturated mid-light face, a same-family darker shell, a luminous accent
   glow, a deep grounded shadow, and a near-white highlight with a hint of the
   accent temperature. */
type Harmony = "analogous" | "complementary" | "split" | "triadic" | "monochrome";

export function randomizeConfig(c: GenConfig, excludePresetIds: string[] = []): GenConfig {
  const r = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
  // v67: a third of rolls jump to a different preset CONSTRUCTION first
  // (shape, bevel, candy build) so randomize explores the whole wardrobe,
  // then the palette work below recolors it
  if (Math.random() < 0.34) {
    const pool = PRESETS.filter((p) => !excludePresetIds.includes(p.id));
    const pr = (pool.length ? pool : PRESETS)[Math.floor(Math.random() * (pool.length || PRESETS.length))];
    c = { ...c, shape: pr.shape, bevel: { ...pr.bevel } };
    const nc = JSON.parse(JSON.stringify(c.candy)) as CandyTokens;
    applyPresetCandy(nc, pr);
    c = { ...c, candy: nc };
  }
  const h = r(0, 359);
  // contrast-first: complementary-family schemes dominate; shell sits well
  // below the face, the accent well above — every roll separates cleanly.
  const roll = Math.random();
  const scheme: Harmony = roll < 0.35 ? "complementary" : roll < 0.6 ? "split" : roll < 0.8 ? "triadic" : roll < 0.95 ? "analogous" : "monochrome";
  const accentHue =
    scheme === "analogous" ? (h + r(30, 50)) % 360 :
    scheme === "complementary" ? (h + 180 + r(-10, 10) + 360) % 360 :
    scheme === "split" ? (h + (Math.random() < 0.5 ? 150 : 210) + 360) % 360 :
    scheme === "triadic" ? (h + 120) % 360 :
    h;
  const shellHue = (h + r(-8, 8) + 360) % 360;
  // lighting and speculars are intentionally untouched: a roll changes the
  // palette + wrap, never the light rig or reflections the user has set up.
  const patRoll = Math.random();
  // v67: every pattern family pulls real weight — "none" is the rare roll,
  // and the exotic wraps (halftone, stars, checker) show up for real
  const patType: PatternType = patRoll < 0.2 ? "stripes" : patRoll < 0.3 ? "none" : patRoll < 0.5 ? "dots" : patRoll < 0.68 ? "halftone" : patRoll < 0.84 ? "stars" : "checker";
  const candy = JSON.parse(JSON.stringify(c.candy)) as CandyTokens;
  candy.pattern = {
    type: patType,
    scale: r(30, 100),
    angle: r(0, 180),
    opacity: patType === "none" ? c.candy.pattern.opacity : r(24, 68),
    color: Math.random() < 0.5 ? null : hslHex(shellHue, r(55, 80), r(24, 40)),
  };
  candy.gloss = { ...candy.gloss, layer: Math.random() < 0.5 ? "above" : "below" };
  const transparency = Math.random() < 0.25
    ? { frame: 100, interior: r(72, 96), content: 100 }
    : { frame: 100, interior: 100, content: 100 };
  return {
    ...c,
    candy,
    transparency,
    effects: {
      "Inner Fill": hslHex(h, r(80, 96), r(50, 60)),          // vivid mid-light face
      Bevel: hslHex(shellHue, r(70, 88), r(28, 38)),          // shell: clearly deeper than the face
      Glow: hslHex(accentHue, r(86, 98), r(76, 88)),          // luminous accent, far above the face
      Shadow: hslHex(shellHue, r(55, 70), r(12, 20)),         // grounded near-black, still hued
      Highlight: hslHex(accentHue, r(6, 14), 99),             // near-white with accent temperature
    },
  };
}

/* ── kit ───────────────────────────────────────────────────────── */
export type KitComponentId =
  | "primary" | "secondary" | "small" | "ghost" | "iconbtn"
  | "chip" | "badge" | "tab" | "segment" | "header"
  | "checkbox" | "radio" | "toggle"
  | "slider" | "progress" | "segbar" | "emblembar" | "vsbar" | "hotbar" | "input" | "dropdown" | "panel"
  | "resource" | "datarow" | "slot" | "orb" | "ring" | "joystick"
  | "reticle" | "minimap" | "ammo" | "lives" | "bignum"
  | "flipclock" | "stopwatch" | "timerdigits"
  | "speedo" | "speedo2" | "tacho" | "circuit" | "leaderboard" | "trophy"
  | "laptimes" | "telemetry" | "startlights"
  | "cardback" | "pack"
  | "dialog" | "toast" | "tooltip" | "keycap" | "padbtn"
  | "listmenu" | "scrollbar" | "pagedots" | "steps" | "spinner"
  | "loadbar" | "setrow" | "searchfield" | "notifydot" | "avatarframe"
  | "nameplate" | "currency" | "buffframe" | "cooldown" | "stepper"
  | "healthglobe" | "xpbar" | "manarails" | "questpanel" | "dialoguebox"
  | "choicelist" | "invgrid" | "rarityframe" | "equipslot" | "skillnode"
  | "compass" | "partyframe" | "dmgnumber" | "loottag"
  | "crosshair" | "hitmarker" | "killfeed" | "magazine" | "equipselector"
  | "streakmeter" | "waypoint" | "capturemeter" | "respawn" | "dmgarc"
  | "weaponwheel"
  | "starrating" | "levelnode" | "pathconnector" | "heartmeter" | "booster"
  | "spinwheel" | "dailycell" | "combo" | "movecounter" | "pricebtn"
  | "energymeter"
  | "buildqueue" | "unitplate" | "techcard" | "popmeter" | "endturn"
  | "scorebug" | "friendrow" | "chatbubble" | "emotewheel" | "clancrest"
  | "seasontrack" | "achievetoast";
export type KitSize = "s" | "m" | "l";
/* ── Content slots — "editable within reason" ─────────────────────────
   Every piece of text a component draws is a SLOT with a kind, and the
   kind decides what editing offers (see docs/editability-audit.md):
     free    type anything (maxLen caps it)
     choice  pick from a curated list — no free typing, no exceptions
     value   the number is DRIVEN — typing it moves the component
     locked  fixed; the note explains why and points at the alternative
   The table below is the single source of truth: the renderer reads the
   chosen values, the panel GENERATES its controls from it, and the i card
   generates its "what can I edit" manual from it. Proof components first
   (speedo family); the full sweep migrates everything else onto it. */
export type SlotKind = "free" | "choice" | "value" | "locked";
export type SlotDef = {
  id: string; name: string; kind: SlotKind;
  /** choice: the curated list, first entry is the default */
  choices?: string[];
  maxLen?: number;
  /** shown in the i card and on locked/value clicks — the no-dead-clicks text */
  note?: string;
};
export const KIT_SLOTS: Partial<Record<KitComponentId, SlotDef[]>> = {
  speedo: [
    { id: "unit", name: "Unit", kind: "choice", choices: ["MPH", "KPH"],
      note: "A dial reads as an instrument because its unit is real — MPH or KPH, nothing invented." },
    { id: "readout", name: "Readout", kind: "value",
      note: "Driven by the value slider — the number and the needle move together. Set the value to stage the exact frame you want." },
  ],
  speedo2: [
    { id: "unit", name: "Unit", kind: "choice", choices: ["MPH", "KPH"],
      note: "A dial reads as an instrument because its unit is real — MPH or KPH, nothing invented." },
    { id: "readout", name: "Readout", kind: "value",
      note: "Driven by the value slider — the number and the needle move together. Set the value to stage the exact frame you want." },
  ],
};

/* ── Lessons — the authored half of the i card ────────────────────────
   What the pattern is called, where it comes from, who does it well, and
   further reading. Links open in new tabs (owner rule). One entry per
   component as the sweep reaches it. */
export type KitLesson = {
  what: string; history: string; games: string; links: { label: string; url: string }[];
};
export const KIT_LESSONS: Partial<Record<KitComponentId, KitLesson>> = {
  speedo: {
    what: "An analog gauge — the industry calls this a dial or needle gauge. Value maps to needle angle, with the danger zone marked in the alarm color.",
    history: "Pole Position (1982) showed speed as a bare number; OutRun (1986) put a dashboard under it; by Ridge Racer (1993) and Gran Turismo (1997) the skeuomorphic dial was the racing genre's signature. It survives because a needle's angle reads faster in peripheral vision than a number.",
    games: "Gran Turismo 7 (2022) for cockpit-grade dials · Forza Horizon 5 (2021) for the minimal floating dial · and as a counter-example, Mario Kart 8 (2014) has no speedometer at all — speed is told through field-of-view and motion blur.",
    links: [
      { label: "Speedometer — the real-world instrument", url: "https://en.wikipedia.org/wiki/Speedometer" },
      { label: "Game UI Database — thousands of real game HUD screenshots", url: "https://www.gameuidatabase.com/" },
    ],
  },
  speedo2: {
    what: "The HUD cut of the analog gauge — same needle physics, drawn open-faced so it can sit over gameplay without a housing.",
    history: "As the chase camera took over — OutRun (1986) through Need for Speed (1994) — the dial left the cockpit and became a floating HUD instrument, keeping the needle (fast to read) while dropping the chrome. Burnout Paradise (2008) fused it with the boost meter; F-Zero GX (2003) turned raw speed into the spectacle itself.",
    games: "Forza Horizon 5 (2021) for restraint · Burnout Paradise (2008) for speed-plus-boost in one instrument · F-Zero GX (2003) for speed as drama.",
    links: [
      { label: "Game UI Database — thousands of real game HUD screenshots", url: "https://www.gameuidatabase.com/" },
      { label: "HUDs in games — history and patterns", url: "https://en.wikipedia.org/wiki/HUD_(video_games)" },
    ],
  },
};

export const KIT_COMPONENTS: { id: KitComponentId; name: string }[] = [
  { id: "primary", name: "Primary button" },
  { id: "dialog", name: "Dialog" },
  { id: "toast", name: "Toast" },
  { id: "tooltip", name: "Tooltip" },
  { id: "keycap", name: "Key prompt" },
  { id: "padbtn", name: "Pad button" },
  { id: "listmenu", name: "List menu" },
  { id: "scrollbar", name: "Scrollbar" },
  { id: "pagedots", name: "Page dots" },
  { id: "steps", name: "Step indicator" },
  { id: "spinner", name: "Spinner" },
  { id: "loadbar", name: "Loading bar" },
  { id: "setrow", name: "Settings row" },
  { id: "searchfield", name: "Search field" },
  { id: "notifydot", name: "Notification badge" },
  { id: "avatarframe", name: "Avatar frame" },
  { id: "nameplate", name: "Nameplate" },
  { id: "currency", name: "Currency pill" },
  { id: "buffframe", name: "Buff frame" },
  { id: "cooldown", name: "Cooldown radial" },
  { id: "stepper", name: "Stepper" },
  { id: "healthglobe", name: "Health globe" },
  { id: "xpbar", name: "XP bar" },
  { id: "manarails", name: "Mana & stamina" },
  { id: "questpanel", name: "Quest tracker" },
  { id: "dialoguebox", name: "Dialogue box" },
  { id: "choicelist", name: "Dialogue choices" },
  { id: "invgrid", name: "Inventory grid" },
  { id: "rarityframe", name: "Rarity frame" },
  { id: "equipslot", name: "Equipment slot" },
  { id: "skillnode", name: "Skill node" },
  { id: "compass", name: "Compass ribbon" },
  { id: "partyframe", name: "Party frame" },
  { id: "dmgnumber", name: "Damage number" },
  { id: "loottag", name: "Loot tag" },
  { id: "crosshair", name: "Crosshair" },
  { id: "hitmarker", name: "Hit marker" },
  { id: "killfeed", name: "Kill feed" },
  { id: "magazine", name: "Magazine" },
  { id: "equipselector", name: "Equipment selector" },
  { id: "streakmeter", name: "Streak meter" },
  { id: "waypoint", name: "Waypoint" },
  { id: "capturemeter", name: "Capture point" },
  { id: "respawn", name: "Respawn timer" },
  { id: "dmgarc", name: "Damage direction" },
  { id: "weaponwheel", name: "Weapon wheel" },
  { id: "starrating", name: "Star rating" },
  { id: "levelnode", name: "Level node" },
  { id: "pathconnector", name: "Path connector" },
  { id: "heartmeter", name: "Heart meter" },
  { id: "booster", name: "Booster button" },
  { id: "spinwheel", name: "Spin wheel" },
  { id: "dailycell", name: "Daily reward" },
  { id: "combo", name: "Combo burst" },
  { id: "movecounter", name: "Move counter" },
  { id: "pricebtn", name: "Price button" },
  { id: "energymeter", name: "Energy meter" },
  { id: "buildqueue", name: "Build queue" },
  { id: "unitplate", name: "Unit plate" },
  { id: "techcard", name: "Tech card" },
  { id: "popmeter", name: "Population" },
  { id: "endturn", name: "End turn" },
  { id: "scorebug", name: "Score bug" },
  { id: "friendrow", name: "Friend row" },
  { id: "chatbubble", name: "Chat bubble" },
  { id: "emotewheel", name: "Emote wheel" },
  { id: "clancrest", name: "Clan crest" },
  { id: "seasontrack", name: "Season track" },
  { id: "achievetoast", name: "Achievement" },
  { id: "secondary", name: "Secondary button" },
  { id: "small", name: "Button (small)" },
  { id: "ghost", name: "Button (ghost)" },
  { id: "iconbtn", name: "Icon button" },
  { id: "chip", name: "Pill / Chip" },
  { id: "badge", name: "Badge" },
  { id: "tab", name: "Small tab" },
  { id: "segment", name: "Segmented control" },
  { id: "header", name: "Header banner" },
  { id: "checkbox", name: "Checkbox" },
  { id: "radio", name: "Radio button" },
  { id: "toggle", name: "Toggle" },
  { id: "slider", name: "Slider" },
  { id: "progress", name: "Progress bar" },
  { id: "segbar", name: "Segmented bar" },
  { id: "emblembar", name: "Emblem bar" },
  { id: "vsbar", name: "VS health bar" },
  { id: "hotbar", name: "Hotbar" },
  { id: "input", name: "Input field" },
  { id: "dropdown", name: "Dropdown" },
  { id: "panel", name: "Panel" },
  { id: "resource", name: "HUD counter" },
  { id: "datarow", name: "Data row" },
  { id: "slot", name: "Item slot" },
  { id: "orb", name: "Glow orb" },
  { id: "ring", name: "Progress ring" },
  { id: "flipclock", name: "Flip countdown" },
  { id: "stopwatch", name: "Stopwatch" },
  { id: "timerdigits", name: "Timer digits" },
  { id: "joystick", name: "Joystick" },
  { id: "reticle", name: "Reticle" },
  { id: "minimap", name: "Mini-map" },
  { id: "ammo", name: "Ammo counter" },
  { id: "lives", name: "Lives" },
  { id: "bignum", name: "Big number" },
  { id: "speedo", name: "Speedometer" },
  { id: "speedo2", name: "Speedo · HUD" },
  { id: "tacho", name: "Rev meter" },
  { id: "circuit", name: "Race circuit" },
  { id: "leaderboard", name: "Position list" },
  // ("trophy" renders but is deregistered — off-brand for this kit)
  { id: "laptimes", name: "Lap comparison" },
  { id: "telemetry", name: "Telemetry" },
  { id: "cardback", name: "Card back" },
  { id: "pack", name: "Card pack" },
];

/* v70 · SPARSE forks. A component's fork stores only the design paths the
   user actually changed on that piece — everything else keeps following the
   parent design live. (Full-snapshot forks froze a component forever: one
   rim tweak and the piece stopped auto-updating with the kit.) */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type KitDesign = DeepPartial<StateDesign> & { stateDesigns?: GenConfig["stateDesigns"] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/* effects is a dynamic record where keys can be REMOVED — a merge can't
   express deletion, so the whole record is treated as one leaf value */
function deepMergeDesign(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (!isObj(over) || !isObj(base)) return JSON.parse(JSON.stringify(over));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMergeDesign(base[k], v);
  return out;
}

/** Render-time merge: the fork's overridden paths sit on top of the parent
 *  design; untouched paths flow through live. Content, state-adjustments
 *  and canvas stay shared — the fork is about the look, not the words. */
export function applyKitDesign(cfg: GenConfig, kd?: KitDesign | null): GenConfig {
  if (!kd) return cfg;
  const out = { ...cfg, stateDesigns: kd.stateDesigns ?? cfg.stateDesigns } as GenConfig;
  const src = cfg as unknown as Record<string, unknown>, o = out as unknown as Record<string, unknown>;
  for (const k of DESIGN_KEYS) {
    const ov = (kd as Record<string, unknown>)[k];
    if (ov === undefined) continue;
    o[k] = k === "effects" ? JSON.parse(JSON.stringify(ov)) : deepMergeDesign(src[k], ov);
  }
  return out;
}

function deepDiff(a: unknown, b: unknown): unknown {
  if (b === undefined) return undefined; // fixed-shape objects never drop keys
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  if (!isObj(a) || !isObj(b)) return JSON.parse(JSON.stringify(b));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    const d = deepDiff(a[k], b[k]);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The design paths where `b` departs from `a` — what a focused edit pins. */
export function designDiff(a: StateDesign, b: StateDesign): KitDesign | null {
  const ra = a as unknown as Record<string, unknown>, rb = b as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of DESIGN_KEYS) {
    if (k === "effects") {
      if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) out[k] = JSON.parse(JSON.stringify(rb[k]));
    } else {
      const d = deepDiff(ra[k], rb[k]);
      if (d !== undefined) out[k] = d;
    }
  }
  return Object.keys(out).length ? (out as KitDesign) : null;
}

/** Fold a fresh edit diff into a component's existing override set. */
export function mergeKitDesign(base: KitDesign | null | undefined, d: KitDesign): KitDesign {
  const out = JSON.parse(JSON.stringify(base ?? {})) as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    out[k] = k !== "effects" && isObj(v) && isObj(out[k]) ? deepMergeDesign(out[k], v) : JSON.parse(JSON.stringify(v));
  }
  return out as KitDesign;
}

/** Older builds stored forks as FULL design snapshots — re-read them as
 *  "whatever still differs from the parent today"; identical fields resume
 *  following the parent design (the kit auto-updates again). */
export function migrateKitDesigns(cfg: GenConfig, forks: Partial<Record<KitComponentId, KitDesign>>): { forks: Partial<Record<KitComponentId, KitDesign>>; changed: boolean } {
  const out: Partial<Record<KitComponentId, KitDesign>> = {};
  let changed = false;
  const isFull = (kd: KitDesign) => DESIGN_KEYS.every((k) => (kd as Record<string, unknown>)[k] !== undefined);
  for (const [id, kd] of Object.entries(forks) as [KitComponentId, KitDesign][]) {
    if (!kd) continue;
    if (!isFull(kd)) { out[id] = kd; continue; }
    changed = true;
    const d = designDiff(pickDesign(cfg), kd as unknown as StateDesign);
    if (d) out[id] = d;
  }
  return { forks: out, changed };
}

/** Per-component text color — the answer to "changing text color changes it
 *  everywhere". A piece with an override renders every glyph it draws in its
 *  own solid color while the global Typography keeps driving the rest of the
 *  kit. State forks inherit the override too, so hover/pressed stay on-color. */
/** Resolve a component's effective icon from the per-component override
 *  and the instance's own glyph. "none" removes it (text recenters); a
 *  deliberate instance `null` (an empty slot) always stays empty. */
export function resolveKitIcon(ov: IconDef | "none" | undefined, inst: IconDef | null | undefined): IconDef | null | undefined {
  if (inst === null) return null;
  if (ov === "none") return null;
  return ov ?? inst;
}

export function applyKitTextFill(cfg: GenConfig, fill?: string | null): GenConfig {
  if (!fill) return cfg;
  const next: GenConfig = { ...cfg, type: { ...cfg.type, fillMode: "solid", fill } };
  if (cfg.stateDesigns) {
    next.stateDesigns = Object.fromEntries(Object.entries(cfg.stateDesigns).map(([s, d]) =>
      [s, d ? { ...d, type: { ...d.type, fillMode: "solid" as const, fill } } : d]));
  }
  return next;
}

/* Style is global; silhouettes are per-component. These are the curated
   defaults — the master's silhouette everywhere else, and each component
   can be overridden individually while focused. */
export const KIT_SHAPE: Partial<Record<KitComponentId, Shape>> = {
  header: "banner",
  dialog: "round",
  toast: "pill",
  tooltip: "round",
  keycap: "round",
  padbtn: "pill",
  listmenu: "kenneyRect",
  scrollbar: "pill",
  loadbar: "pill",
  setrow: "kenneyRect",
  searchfield: "pill",
  notifydot: "round",
  nameplate: "kenneyTag",
  currency: "pill",
  buffframe: "round",
  stepper: "pill",
  xpbar: "pill",
  manarails: "pill",
  questpanel: "kenneyRect",
  dialoguebox: "round",
  choicelist: "kenneyRect",
  invgrid: "kenneyRect",
  rarityframe: "kenneyRect",
  equipslot: "kenneyRect",
  skillnode: "pill",       // skill nodes live in circular sockets
  compass: "pill",
  partyframe: "kenneyRect",
  loottag: "kenneyTag",
  killfeed: "kenneyRect",
  streakmeter: "pill",
  respawn: "round",
  levelnode: "pill",        // map nodes live in circular sockets
  heartmeter: "pill",
  booster: "pill",
  dailycell: "kenneyRect",
  movecounter: "round",
  starrating: "pill",       // results pill — stars live in a themed capsule
  pricebtn: "pill",
  energymeter: "pill",
  buildqueue: "kenneyRect",
  unitplate: "kenneyRect",
  techcard: "round",
  popmeter: "pill",
  endturn: "pill",          // the chunky radial lives in a circle
  scorebug: "kenneyRect",
  friendrow: "kenneyRect",
  chatbubble: "speech",   // the tail is part of the silhouette
  clancrest: "shield",
  seasontrack: "kenneyRect",
  achievetoast: "pill",
  chip: "doboBracket",
  tab: "kenneyTag",
  badge: "shield",
  panel: "kenneyRect",
  resource: "pill",
  datarow: "kenneyRect",
  slot: "kenneyRect",
  leaderboard: "kenneyRect", // rows are rectangular content — oval shells clip them
  laptimes: "kenneyRect",    // plots are rectangular too
  telemetry: "kenneyRect",
  cardback: "round",         // portrait card — rounded rect reads as a card
  pack: "round",
  speedo: "pill",            // v72 · instruments live in CIRCULAR enclosures —
  speedo2: "pill",           // a pill on a square box is a perfect circle
  tacho: "pill",
};

/* Stock glyphs for kit components — canonical Lucide paths, embedded so the
   renderer stays pure. */
export const STOCK_ICONS: Record<string, IconDef> = {
  star: { lib: "lucide", name: "Star", viewBox: "0 0 24 24", inner: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', mode: "stroke" },
  check: { lib: "lucide", name: "Check", viewBox: "0 0 24 24", inner: '<path d="M20 6 9 17l-5-5"/>', mode: "stroke" },
  chevron: { lib: "lucide", name: "ChevronDown", viewBox: "0 0 24 24", inner: '<path d="m6 9 6 6 6-6"/>', mode: "stroke" },
  dot: { lib: "lucide", name: "CircleDot", viewBox: "0 0 24 24", inner: '<circle cx="12" cy="12" r="5"/>', mode: "fill" },
  // functional glyph set — canonical Lucide paths, same embedding rules
  play: { lib: "lucide", name: "Play", viewBox: "0 0 24 24", inner: '<polygon points="6 3 20 12 6 21 6 3"/>', mode: "stroke" },
  pause: { lib: "lucide", name: "Pause", viewBox: "0 0 24 24", inner: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>', mode: "stroke" },
  close: { lib: "lucide", name: "X", viewBox: "0 0 24 24", inner: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', mode: "stroke" },
  back: { lib: "lucide", name: "ArrowLeft", viewBox: "0 0 24 24", inner: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', mode: "stroke" },
  forward: { lib: "lucide", name: "ArrowRight", viewBox: "0 0 24 24", inner: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', mode: "stroke" },
  lock: { lib: "lucide", name: "Lock", viewBox: "0 0 24 24", inner: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', mode: "stroke" },
  unlock: { lib: "lucide", name: "LockOpen", viewBox: "0 0 24 24", inner: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>', mode: "stroke" },
  bag: { lib: "lucide", name: "ShoppingBag", viewBox: "0 0 24 24", inner: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>', mode: "stroke" },
  volume: { lib: "lucide", name: "Volume2", viewBox: "0 0 24 24", inner: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', mode: "stroke" },
  volumeOff: { lib: "lucide", name: "VolumeX", viewBox: "0 0 24 24", inner: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>', mode: "stroke" },
  info: { lib: "lucide", name: "Info", viewBox: "0 0 24 24", inner: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', mode: "stroke" },
  warning: { lib: "lucide", name: "TriangleAlert", viewBox: "0 0 24 24", inner: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', mode: "stroke" },
  refresh: { lib: "lucide", name: "RotateCw", viewBox: "0 0 24 24", inner: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>', mode: "stroke" },
  home: { lib: "lucide", name: "Home", viewBox: "0 0 24 24", inner: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', mode: "stroke" },
  search: { lib: "lucide", name: "Search", viewBox: "0 0 24 24", inner: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', mode: "stroke" },
  user: { lib: "lucide", name: "User", viewBox: "0 0 24 24", inner: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', mode: "stroke" },
  gear: { lib: "lucide", name: "Settings", viewBox: "0 0 24 24", inner: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', mode: "stroke" },
  trophy: { lib: "lucide", name: "Trophy", viewBox: "0 0 24 24", inner: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>', mode: "stroke" },
  cart: { lib: "lucide", name: "ShoppingCart", viewBox: "0 0 24 24", inner: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>', mode: "stroke" },
  gem: { lib: "lucide", name: "Gem", viewBox: "0 0 24 24", inner: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>', mode: "stroke" },
  clock: { lib: "lucide", name: "Clock", viewBox: "0 0 24 24", inner: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', mode: "stroke" },
  heart: { lib: "lucide", name: "Heart", viewBox: "0 0 24 24", inner: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>', mode: "stroke" },
  // inventory & racing glyphs — same canonical-Lucide embedding rules
  sword: { lib: "lucide", name: "Sword", viewBox: "0 0 24 24", inner: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/>', mode: "stroke" },
  shield: { lib: "lucide", name: "Shield", viewBox: "0 0 24 24", inner: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>', mode: "stroke" },
  helmet: { lib: "lucide", name: "HardHat", viewBox: "0 0 24 24", inner: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1Z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>', mode: "stroke" },
  shirt: { lib: "lucide", name: "Shirt", viewBox: "0 0 24 24", inner: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>', mode: "stroke" },
  hand: { lib: "lucide", name: "Hand", viewBox: "0 0 24 24", inner: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>', mode: "stroke" },
  boots: { lib: "lucide", name: "Footprints", viewBox: "0 0 24 24", inner: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>', mode: "stroke" },
  zap: { lib: "lucide", name: "Zap", viewBox: "0 0 24 24", inner: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', mode: "stroke" },
  flask: { lib: "lucide", name: "FlaskConical", viewBox: "0 0 24 24", inner: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>', mode: "stroke" },
  scroll: { lib: "lucide", name: "Scroll", viewBox: "0 0 24 24", inner: '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>', mode: "stroke" },
  key: { lib: "lucide", name: "Key", viewBox: "0 0 24 24", inner: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>', mode: "stroke" },
  // shooter glyphs — same canonical-Lucide embedding rules
  crosshair: { lib: "lucide", name: "Crosshair", viewBox: "0 0 24 24", inner: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>', mode: "stroke" },
  skull: { lib: "lucide", name: "Skull", viewBox: "0 0 24 24", inner: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>', mode: "stroke" },
  gift: { lib: "lucide", name: "Gift", viewBox: "0 0 24 24", inner: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>', mode: "stroke" },
};
