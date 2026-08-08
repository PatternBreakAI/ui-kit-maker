// The UI Generator — canonical model (v9, "hard candy").
// A layered candy-shell surface model: every visual layer of the button
// (shadow, extrusion, rim, bevel wall, face gradient, inner edge, inner glow,
// gloss, specular, bloom, texture, content) is driven by explicit tokens.
// One config drives canvas, code copy, HTML download, and exports.

// safe despite silhouettes.ts importing from here: that edge is type-only
import { SILHOUETTES } from "./silhouettes";

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
  | `lab:${string}`
  // v92 — stock organic silhouettes shipped as path data (stockShapes.ts).
  // Authored artwork, not procedural geometry; rendered through the same
  // distortion-capped transform a user import gets.
  | `stock:${string}`
  // horizontally-mirrored variant of any shape — the suffix IS the state
  | `${string}~flip`;

/** Flip plumbing: the mirrored variant of a shape is the same id with a
 *  ~flip suffix, so it persists, forks and exports exactly like a shape. */
export const isFlipShape = (s: Shape): boolean => s.endsWith("~flip");
export const baseShape = (s: Shape): Shape => (isFlipShape(s) ? s.slice(0, -5) as Shape : s);
export const flipShape = (s: Shape): Shape => (isFlipShape(s) ? baseShape(s) : `${s}~flip` as Shape);
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

/** Highlight-glint treatments for letterforms — see TypeTokens.glints. */
export type GlintStyle = "slab" | "stars" | "streak" | "sheen";
export const GLINT_STYLES: { id: GlintStyle; name: string }[] = [
  { id: "slab", name: "Specular slab & stars" },
  { id: "stars", name: "Star field" },
  { id: "streak", name: "Streak bands" },
  { id: "sheen", name: "Top sheen" },
];

export type PatternType = "none" | "stripes" | "dots" | "stars" | "checker" | "halftone"
  | "houndstooth" | "plaid" | "diamonds" | "chevron" | "waves" | "scales"
  | "triangles" | "twill" | "crosshatch" | "grid" | "sprinkles"
  | "skulls" | "crosses" | "bats" | "thorns" | "fleur";
export const PATTERN_TYPES: { id: PatternType; name: string }[] = [
  { id: "none", name: "None" },
  { id: "stripes", name: "Stripes" },
  { id: "dots", name: "Polka dots" },
  { id: "stars", name: "Stars" },
  { id: "checker", name: "Checker" },
  { id: "halftone", name: "Halftone — comic fade" },
  /* the second wave — textile classics and geometry that suit candy and
     game HUDs alike. Every cell tiles seamlessly in a square, so Scale
     and Angle stay honest at any size (owner: "houndstooth? let's get
     creative and add some options"). */
  { id: "houndstooth", name: "Houndstooth" },
  { id: "plaid", name: "Plaid" },
  { id: "diamonds", name: "Diamonds — harlequin" },
  { id: "chevron", name: "Chevron" },
  { id: "waves", name: "Waves" },
  { id: "scales", name: "Scales" },
  { id: "triangles", name: "Triangles" },
  { id: "twill", name: "Twill weave" },
  { id: "crosshatch", name: "Crosshatch" },
  { id: "grid", name: "Grid" },
  { id: "sprinkles", name: "Sprinkles" },
  /* the third wave — the Gothic drop's surface language, shipped beside
     its silhouettes (owner: "let's add some goth patterns like skulls,
     crosses, etc"). Same seamless-square contract as every wave. */
  { id: "skulls", name: "Skulls" },
  { id: "crosses", name: "Crosses — gothic" },
  { id: "bats", name: "Bats" },
  { id: "thorns", name: "Thorn vine" },
  { id: "fleur", name: "Fleur-de-lis" },
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
  /** The face tiles, plus the wall ring's OWN spec (`wall`) — fully
   *  independent type/knobs, so skulls can sit on the face while stripes
   *  run the wall. Both wall variants ride INSIDE the shell paint (no new
   *  export part), so the Unity pipeline sees richer pixels in a layer it
   *  already ships — never a new layer. `zone` is the one-day placement
   *  select this replaced (2026-08-06); hydrate folds it into `wall`. */
  pattern: { type: PatternType; scale: number; angle: number; opacity: number; color: string | null; zone?: "face" | "wall" | "both";
    wall?: { type: PatternType; scale: number; angle: number; opacity: number; color: string | null } }; // color null = tone-on-tone
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
  /** Rows and objective lines (quest lists, menus, choice lists) can speak
   *  a calmer face than the display font — null/absent = match `font`.
   *  Display faces like Fascinate are unreadable at list size (owner:
   *  "need to be able to change the list font"). */
  listFont?: string | null;
  customFonts: string[];  // user-added Google Font family names
  size: number;        // px at master scale
  weight: number;      // clamped to the face's real capabilities at edit time
  width?: number;      // `wdth` axis %, only honored when the face has the axis
  italic: boolean;
  spacing: number;     // letter-spacing, em/100 (-5..20)
  case: TextCase;
  oy?: number;         // vertical nudge px — visually center against the shell
  ox?: number;         // horizontal nudge px — same scale, sideways
  /** Line gap for stacked labels (End turn's two-word stack), % of the
   *  factory leading — 100 = factory, scales with the face size. */
  leading?: number;
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
  /** Crisp vector glints riding the letterforms, placed by the master
   *  lighting angle. `style` picks the treatment (owner: "a few styles of
   *  highlight glints to choose from"): slab = specular slab + stars (the
   *  original), stars = constellation only, streak = thin light bands,
   *  sheen = horizontal top light. `blend` composites the glints against
   *  the letter faces exactly like the shell gloss/specular blends.
   *  ox/oy nudge the whole treatment in % of the letter height. */
  glints?: { on: boolean; opacity: number; ox?: number; oy?: number; style?: GlintStyle; blend?: BlendMode };
  /** Dimensional type (Type Maker) — the glyphs themselves grow a solid
   *  body: extrusion sweep, sticker wrap, contour rim, ground shadow, hard
   *  candy gloss and per-letter tilt. All geometry derives from the glyph
   *  alpha via filter morphology (the shell extrusion's sweep trick), so
   *  any face at any size carries the treatment without stacked copies.
   *  Absent/off = byte-identical output for every existing kit. Sizes are
   *  px at the 52px master scale, like outline.width. */
  dim?: {
    on: boolean;
    depth: number;            // extrusion reach 0..28
    color: string | null;     // wall paint — null derives from the fill
    sticker: number;          // white-wrap width 0..16 (0 = off)
    stickerColor: string;
    rim: number;              // dark contour width 0..8 (0 = off)
    rimColor: string | null;  // null derives from the wall
    shadow: number;           // ground-shadow opacity 0..100 (0 = off)
    gloss: number;            // hard candy band opacity 0..100 (0 = off)
    glossCover: number;       // band coverage, % of glyph height (20..60)
    tilt: number;             // per-letter tilt & bounce 0..100
    /** Extrusion direction in screen degrees — 90 (default) is straight
     *  down; Type Maker aims it at the vanishing point per letter when the
     *  word is posed in 3D. */
    angle?: number;
  };
  fillMode: "auto" | "solid" | "gradient";
  fill: string;
  fill2: string;       // gradient bottom
  /** Multi-stop gradient fill — banded metals (gold, chrome, silver) need
   *  the hard horizon stops a two-color ramp can't hold. When present and
   *  fillMode is "gradient", these stops replace fill/fill2 in the letter
   *  gradient. Absent = the classic two-stop ramp, byte-identical. */
  fillStops?: { offset: number; color: string }[];
  /** Wave/crumple distortion over the WHOLE letter treatment (body, sticker,
   *  gloss and glints ride along) — turbulence-driven displacement, so the
   *  warp survives rasterization anywhere. Off/absent = untouched. */
  warp?: { on: boolean; amount: number; scale: number; mode?: "wave" | "crumple" };
  /** Grain inside the letterforms — the shell micro-texture recipe clipped
   *  to the glyph alpha. Off/absent = untouched. */
  noise?: { on: boolean; amount: number; scale: number };
  fillOpacity: number; // 0..100 — translucent fills read as glass
  /** color2 set = gradient stroke. `behind` renders the stroke as a separate
   *  under-layer for the whole word, so no glyph's stroke ever crosses a
   *  neighboring letter's face (tilted/overlapping letters need this). */
  outline: { on: boolean; color: string; color2: string | null; width: number; behind?: boolean };
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
  // presets define the complete treatment — dimensional body, metal bands,
  // warp and grain included
  delete t.dim;
  delete t.fillStops;
  delete t.warp;
  delete t.noise;

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
  /** Outline pass width, px — null/undefined follows Type → Outline width;
      0 removes the icon border while the text keeps its own. */
  outlineWidth?: number | null;
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
    size: 100, strokeWidth: 24, color: null, outlineWidth: null, opacity: 100, rotation: 0,
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
export const GAME_FONTS: { name: string; css: string | null; factor: number; caps: FontCaps; lang?: "zh" }[] = [
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
  { name: "Fascinate", css: "Fascinate", factor: 0.62, caps: { weights: [400] } },
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
  // measured 2026-07-30: Chango caps average 0.93em — the old 0.62 guess
  // cropped labels everywhere until real measurement landed; the factor
  // now only covers the pre-load frames
  { name: "Chango", css: "Chango", factor: 0.93, caps: { weights: [400] } },
  { name: "Boogaloo", css: "Boogaloo", factor: 0.5, caps: { weights: [400] } },
  { name: "Staatliches", css: "Staatliches", factor: 0.5, caps: { weights: [400] } },
  { name: "Grandstander", css: "Grandstander:ital,wght@0,100..900;1,100..900", factor: 0.58, caps: { wght: [100, 900, 700], italic: true } },
  // the Gothic drop's type rack (owner list, 2026-08-05) — blackletter,
  // carnival and machined display faces to pair with the new silhouettes.
  // Bangers and Staatliches from the owner's list were already above.
  { name: "New Rocker", css: "New+Rocker", factor: 0.55, caps: { weights: [400] } },
  { name: "Grenze", css: "Grenze:wght@400;700", factor: 0.52, caps: { weights: [400, 700] } },
  { name: "Pirata One", css: "Pirata+One", factor: 0.5, caps: { weights: [400] } },
  { name: "Germania One", css: "Germania+One", factor: 0.55, caps: { weights: [400] } },
  { name: "Freckle Face", css: "Freckle+Face", factor: 0.55, caps: { weights: [400] } },
  { name: "Slackey", css: "Slackey", factor: 0.6, caps: { weights: [400] } },
  { name: "Hanalei Fill", css: "Hanalei+Fill", factor: 0.55, caps: { weights: [400] } },
  { name: "Monoton", css: "Monoton", factor: 0.7, caps: { weights: [400] } },
  { name: "Michroma", css: "Michroma", factor: 0.78, caps: { weights: [400] } },
  { name: "Bruno Ace", css: "Bruno+Ace", factor: 0.72, caps: { weights: [400] } },
  { name: "Bakbak One", css: "Bakbak+One", factor: 0.62, caps: { weights: [400] } },
  /* the Chinese rack (owner: "I want to see how this UI looks with some
     chinese fonts"). `lang` drives the CTA takeover below — switching to
     a zh face swaps a recognized label for its Chinese counterpart. CJK
     glyphs run full-width, so factor 1.0 until the loaded face measures. */
  { name: "ZCOOL QingKe HuangYou", css: "ZCOOL+QingKe+HuangYou", factor: 1.0, caps: { weights: [400] }, lang: "zh" },
  { name: "ZCOOL KuaiLe", css: "ZCOOL+KuaiLe", factor: 1.0, caps: { weights: [400] }, lang: "zh" },
  { name: "Ma Shan Zheng", css: "Ma+Shan+Zheng", factor: 1.0, caps: { weights: [400] }, lang: "zh" },
  { name: "Zhi Mang Xing", css: "Zhi+Mang+Xing", factor: 1.0, caps: { weights: [400] }, lang: "zh" },
  { name: "Liu Jian Mao Cao", css: "Liu+Jian+Mao+Cao", factor: 1.0, caps: { weights: [400] }, lang: "zh" },
  { name: "Noto Sans SC", css: "Noto+Sans+SC:wght@400..900", factor: 1.0, caps: { wght: [400, 900, 900] }, lang: "zh" },
];

/* ── the CTA dictionary — takeover words ─────────────────────────────────
   When the display font switches language, a label the app RECOGNIZES
   swaps to its counterpart (owner: "default chinese words that take over
   the moment I switch to those fonts"); a bespoke label is the user's
   voice and is never touched. The untouched default "PLAY" draws a
   RANDOM entry on entering Chinese (owner: "maybe we randomize 10
   CTAs"); any other recognized CTA translates 1:1 both directions.
   `gloss` feeds the liner note beside the label field. */
export const CTA_SETS: { en: string; zh: string; gloss: string }[] = [
  { en: "PLAY", zh: "开始游戏", gloss: "start the game" },
  { en: "START", zh: "开始", gloss: "start" },
  { en: "GO!", zh: "出发！", gloss: "let's go" },
  { en: "FIRE", zh: "开火", gloss: "open fire" },
  { en: "CLAIM", zh: "领取", gloss: "claim the reward" },
  { en: "SHOP", zh: "商店", gloss: "shop" },
  { en: "UPGRADE", zh: "升级", gloss: "level up" },
  { en: "BATTLE", zh: "战斗", gloss: "battle" },
  { en: "CONTINUE", zh: "继续", gloss: "continue" },
  { en: "WIN", zh: "胜利", gloss: "victory" },
];
export function fontLang(name: string): "en" | "zh" {
  return GAME_FONTS.find((f) => f.name === name)?.lang ?? "en";
}
export function ctaEntry(label: string): (typeof CTA_SETS)[number] | undefined {
  const t = label.trim();
  return CTA_SETS.find((c) => c.en.toUpperCase() === t.toUpperCase() || c.zh === t);
}
/** The takeover: the label the new font's language wants, or null to
 *  leave the label alone. */
export function ctaForFont(label: string, fontName: string): string | null {
  const hit = ctaEntry(label);
  if (!hit) return null;
  if (fontLang(fontName) === "zh") {
    if (hit.zh === label.trim()) return null; // already Chinese
    if (hit.en === "PLAY") return CTA_SETS[Math.floor(Math.random() * CTA_SETS.length)].zh;
    return hit.zh;
  }
  return hit.zh === label.trim() ? hit.en : null; // coming home from zh
}
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

/** Canonical Unity-slug shape: lowercase, [a-z0-9-] only, never empty.
    Used at MINT time and re-applied at every USE (export paths) and LOAD
    (project docs, share links) — a slug is a zip path segment in end
    users' Unity projects, so nothing traversal-shaped may ever pass. */
export function sanitizeUnitySlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || null;
}

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
  /** Per-state icon rig (color, effects, weight…) — the GLYPH itself stays
      one decision for the whole component, like the typeface. Absent on
      older forks = mirror the master's icon. */
  icon?: IconCfg;
}

export const DESIGN_KEYS = ["shape", "effects", "face", "bevel", "candy", "lighting", "shadow", "transparency", "type"] as const;

export function pickDesign(src: StateDesign & { icon?: IconCfg }): StateDesign {
  // the icon is NOT snapshotted here: a state's icon keeps following the
  // master until the user explicitly edits icon fields in that state —
  // otherwise any state tweak would silently freeze its icon and later
  // master icon edits would "not update in real time" (owner report)
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
  /** The kit's rarity system — five tiers the loot tag and rarity frame
   *  read their stripe, aura, gem and tier word from. Editable names AND
   *  colors (developers bring their own logic); null/absent = the
   *  genre-standard factory tiers. Kit-wide by design, like canvas. */
  rarity?: { name: string; c: string }[] | null;
  /** Extra breathing room between a label and its silhouette's ends, in
   *  design px at baseline size (scales with the piece). Negative pulls
   *  tighter. The designer's dial over the measured/authored safe-area
   *  (owner: "let's add margin controls to make this an easy fix for any
   *  situation"). Absent = 0 on kits saved before the control existed. */
  contentMargin?: number;
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
  /** The starter's typography voice — a preset is a COMPLETE look, so
   *  switching starters switches the face too (owner: "when I switch
   *  presets, the fonts don't always update"). Weight only where the
   *  face is variable; single-weight faces clamp themselves. */
  font?: string;
  fontWeight?: number;
  shape: Shape;
  bevel: { width: number; softness: number };
  effects: Record<EffectRole, string>;
  candy?: Partial<{ [K in keyof CandyTokens]: Partial<CandyTokens[K]> }>;
}

/** Each preset is a different candy *construction*, not just a palette. */
export const PRESETS: Preset[] = [
  { id: "retro-diner", name: "Retro Diner", font: "Boogaloo", shape: "kenneyRect", bevel: { width: 11, softness: 70 },
    effects: { Bevel: "#D93A2B", Glow: "#FFD9A8", Highlight: "#FFF6E8", Shadow: "#66150C", "Inner Fill": "#F6E7C9" },
    candy: { pattern: { type: "checker", scale: 58, angle: 45, opacity: 20, color: null }, gloss: { height: 50, curve: 30, opacity: 66, softness: 40 }, specular: { on: true, mode: "line", size: 50, intensity: 55 }, extrusion: { depth: 12, darkness: 72 } } },
  { id: "hard-candy", name: "Hard Candy", font: "Titan One", shape: "round", bevel: { width: 10, softness: 78 },
    effects: { Bevel: "#0E9CC9", Glow: "#8FF0FF", Highlight: "#FFFFFF", Shadow: "#0A4A62", "Inner Fill": "#2CC5F0" },
    candy: { gloss: { height: 46, curve: 26, opacity: 72 }, specular: { on: true, mode: "anime" }, extrusion: { depth: 10 } } },
  { id: "royal-vault", name: "Royal Vault", font: "Cinzel", fontWeight: 700, shape: "shield", bevel: { width: 13, softness: 45 },
    effects: { Bevel: "#6C3FC9", Glow: "#C9A5FF", Highlight: "#FFEDB8", Shadow: "#251057", "Inner Fill": "#8F5BEF" },
    candy: { pattern: { type: "stars", scale: 62, angle: 0, opacity: 24, color: null }, gloss: { height: 44, curve: 22, opacity: 60, softness: 34 }, specular: { on: true, mode: "soft", size: 34, intensity: 58, softness: 60 }, innerGlow: { opacity: 66, size: 52 }, extrusion: { depth: 14, darkness: 80 } } },
  /* citrus-pop's full authored design lives in preset-citrus-pop.json
     (PRESET_DEFAULTS) — this recipe mirrors its construction for the
     surfaces that derive from recipes (preset tiles, homepage picker). */
  { id: "citrus-pop", name: "Citrus Pop", font: "Shrikhand", shape: "mazepill", bevel: { width: 11, softness: 88 },
    effects: { Bevel: "#E8890C", Glow: "#FFD34D", Highlight: "#FFF7DB", Shadow: "#7A3B00", "Inner Fill": "#FFA726" },
    candy: { pattern: { type: "stripes", scale: 100, angle: 45, opacity: 71, color: "#1d819a" }, gloss: { height: 48, curve: 30, opacity: 100, softness: 95 }, specular: { on: true, mode: "anime", size: 29, intensity: 93 }, extrusion: { depth: 11, darkness: 94 }, bloom: { opacity: 55, size: 66 } } },
  { id: "comic-pop", name: "Comic Pop", font: "Bangers", shape: "notch", bevel: { width: 12, softness: 30 },
    effects: { Bevel: "#1E1F26", Glow: "#FFE24A", Highlight: "#FFFFFF", Shadow: "#0B0B12", "Inner Fill": "#FFC61A" },
    candy: { pattern: { type: "halftone", scale: 70, angle: 0, opacity: 38, color: null }, gloss: { height: 40, curve: 18, opacity: 58, softness: 20 }, specular: { on: true, mode: "hard", size: 26, intensity: 88 }, extrusion: { depth: 13, darkness: 88 } } },
  { id: "deep-ocean", name: "Deep Ocean", font: "Paytone One", shape: "explorer", bevel: { width: 13, softness: 62 },
    effects: { Bevel: "#0A5B8F", Glow: "#4DE3FF", Highlight: "#EAFBFF", Shadow: "#04263F", "Inner Fill": "#0E7FC0" },
    candy: { gloss: { height: 40, curve: 18, opacity: 55, softness: 30 }, specular: { on: true, mode: "dual", size: 24, intensity: 62 }, innerGlow: { opacity: 70, size: 58 }, extrusion: { depth: 13, darkness: 66 } } },
  /* wager's full authored design lives in preset-wager.json
     (PRESET_DEFAULTS) — this recipe mirrors its construction for the
     surfaces that derive from recipes (preset tiles, homepage picker). */
  { id: "wager", name: "Wager", font: "Paytone One", shape: "pill", bevel: { width: 13, softness: 100 },
    effects: { Bevel: "#0a8f25", Glow: "#4dff61", Highlight: "#EAFBFF", Shadow: "#043e0e", "Inner Fill": "#66be0e" },
    candy: { pattern: { type: "dots", scale: 12, angle: 45, opacity: 71, color: "#1d819a" }, gloss: { height: 40, curve: 18, opacity: 55, softness: 30 }, specular: { on: true, mode: "dual", size: 24, intensity: 62 }, innerGlow: { opacity: 70, size: 58 }, extrusion: { depth: 13, darkness: 66 } } },
  /* schweetheart / oopsie / nope-yep: fully authored free-set candies —
     the complete designs live in their preset-*.json (PRESET_DEFAULTS);
     these recipes mirror the construction for recipe-driven surfaces. */
  { id: "schweetheart", name: "Schweetheart", font: "Fascinate", shape: "mazepill", bevel: { width: 11, softness: 88 },
    effects: { Bevel: "#7e1541", Glow: "#c6feaf", Highlight: "#fcfdfc", Shadow: "#411025", "Inner Fill": "#e8215d" },
    candy: { pattern: { type: "dots", scale: 100, angle: 45, opacity: 73, color: null }, gloss: { height: 48, curve: 30, opacity: 100, softness: 95 }, specular: { on: true, mode: "anime", size: 29, intensity: 93 }, innerGlow: { opacity: 76, size: 44 }, extrusion: { depth: 11, darkness: 94 }, bloom: { opacity: 55, size: 66 } } },
  { id: "oopsie", name: "Oopsie", font: "Black Ops One", shape: "cutline", bevel: { width: 14, softness: 28 },
    effects: { Bevel: "#7f4939", Glow: "#976f49", Highlight: "#FFE9D4", Shadow: "#26100A", "Inner Fill": "#1E1A1E" },
    candy: { pattern: { type: "stripes", scale: 100, angle: 45, opacity: 71, color: "#1d819a" }, gloss: { height: 34, curve: 10, opacity: 40, softness: 95 }, specular: { on: true, mode: "line", size: 55, intensity: 58 }, innerGlow: { opacity: 76, size: 44 }, extrusion: { depth: 14, darkness: 82 }, bloom: { opacity: 45, size: 60 } } },
  { id: "nope-yep", name: "Nope Yep", font: "Russo One", shape: "chunky", bevel: { width: 11, softness: 100 },
    effects: { Bevel: "#45C79F", Glow: "#CFFFEB", Highlight: "#FFFFFF", Shadow: "#14563F", "Inner Fill": "#7FE6C4" },
    candy: { pattern: { type: "dots", scale: 10, angle: 14, opacity: 30, color: "#1cd440" }, gloss: { height: 32, curve: 24, opacity: 58, softness: 70 }, specular: { on: true, mode: "dual", size: 26, intensity: 68, softness: 45 }, innerGlow: { opacity: 55, size: 55 }, extrusion: { depth: 10, darkness: 68 }, bloom: { opacity: 56, size: 66 } } },
  /* grape-jelly's full authored design lives in preset-grape-jelly.json
     (PRESET_DEFAULTS) — this recipe mirrors its construction for the
     surfaces that derive from recipes (preset tiles, homepage picker). */
  { id: "grape-jelly", name: "Grape Jelly", font: "Fredoka", fontWeight: 670, shape: "pill", bevel: { width: 14, softness: 0 },
    effects: { Bevel: "#8B34D8", Glow: "#E29CFF", Highlight: "#FFFFFF", Shadow: "#4A1178", "Inner Fill": "#A855F7" },
    candy: { pattern: { type: "stripes", scale: 100, angle: 45, opacity: 71, color: "#1d819a" }, gloss: { height: 40, curve: 20, opacity: 89, softness: 46 }, specular: { on: true, mode: "anime", size: 52, intensity: 35, softness: 30 }, innerGlow: { opacity: 72, size: 66 }, bloom: { opacity: 60, size: 72 }, extrusion: { depth: 14, darkness: 94 } } },
  { id: "glacier-tech", name: "Glacier Tech", font: "Orbitron", fontWeight: 700, shape: "polybar", bevel: { width: 12, softness: 22 },
    effects: { Bevel: "#4E7E9C", Glow: "#B8F1FF", Highlight: "#F0FBFF", Shadow: "#122C40", "Inner Fill": "#7FB8D9" },
    candy: { pattern: { type: "none", scale: 100, angle: 45, opacity: 0, color: null }, texture: { amount: 26, scale: 44 }, gloss: { height: 36, curve: 10, opacity: 44, softness: 16 }, specular: { on: true, mode: "sweep", size: 18, intensity: 60 }, extrusion: { depth: 13, darkness: 76 }, innerEdge: { strength: 58, width: 3 } } },
  { id: "sakura-arcade", name: "Sakura Arcade", font: "Chewy", shape: "blade", bevel: { width: 9, softness: 92 },
    effects: { Bevel: "#E064A8", Glow: "#FFC7E8", Highlight: "#FFFFFF", Shadow: "#7C2050", "Inner Fill": "#F58BC5" },
    candy: { gloss: { height: 52, curve: 36, opacity: 76, softness: 34 }, specular: { on: true, mode: "anime", size: 30, intensity: 88 }, bloom: { opacity: 62, size: 70 }, extrusion: { depth: 9 } } },
  { id: "toy-box", name: "Toy Box", font: "Chango", shape: "chunky", bevel: { width: 12, softness: 96 },
    effects: { Bevel: "#D98200", Glow: "#FFE066", Highlight: "#FFFDF2", Shadow: "#7A3D00", "Inner Fill": "#FFB020" },
    candy: { gloss: { height: 52, curve: 38, opacity: 80, softness: 42 }, specular: { on: true, mode: "dual", size: 26, intensity: 70, softness: 40 }, extrusion: { depth: 16, darkness: 70 }, pattern: { type: "dots", scale: 46, angle: 0, opacity: 30, color: null }, bloom: { opacity: 50, size: 64 } } },
  { id: "mint-cream", name: "Mint Cream", font: "Baloo 2", fontWeight: 700, shape: "chunky", bevel: { width: 11, softness: 100 },
    effects: { Bevel: "#45C79F", Glow: "#CFFFEB", Highlight: "#FFFFFF", Shadow: "#14563F", "Inner Fill": "#7FE6C4" },
    candy: { pattern: { type: "dots", scale: 40, angle: 0, opacity: 22, color: null }, gloss: { height: 54, curve: 38, opacity: 78, softness: 48 }, specular: { on: true, mode: "dual", size: 26, intensity: 68, softness: 45 }, bloom: { opacity: 56, size: 66 }, extrusion: { depth: 10, darkness: 68 } } },
  { id: "neon-versus", name: "Neon Versus", font: "Lilita One", fontWeight: 500, shape: "fighthud", bevel: { width: 10, softness: 20 },
    effects: { Bevel: "#B4126B", Glow: "#FF3EC8", Highlight: "#FFE9F7", Shadow: "#3D0430", "Inner Fill": "#1C0F2E" },
    candy: { gloss: { height: 34, curve: 12, opacity: 40, softness: 20 }, specular: { on: true, mode: "line", size: 60, intensity: 60 }, extrusion: { depth: 12, darkness: 80 }, innerGlow: { opacity: 78, size: 48 }, bloom: { opacity: 55, size: 70 }, pattern: { type: "stripes", scale: 34, angle: 65, opacity: 26, color: null } } },
  { id: "hero-chisel", name: "Hero Chisel", font: "Alfa Slab One", shape: "chamfer", bevel: { width: 14, softness: 24 },
    effects: { Bevel: "#D97706", Glow: "#FDE68A", Highlight: "#FFF7E6", Shadow: "#7C2D12", "Inner Fill": "#F59E0B" },
    candy: { gloss: { height: 38, curve: 10, opacity: 44, softness: 10 }, specular: { mode: "sweep", size: 18, intensity: 62 }, extrusion: { depth: 14, darkness: 62 }, innerEdge: { strength: 62, width: 3 }, texture: { amount: 10, scale: 50 } } },
  { id: "forest-sprite", name: "Forest Sprite", font: "Concert One", shape: "tavern", bevel: { width: 12, softness: 70 },
    effects: { Bevel: "#3E8914", Glow: "#B4F461", Highlight: "#F2FFE0", Shadow: "#1C4405", "Inner Fill": "#61B520" },
    candy: { gloss: { height: 44, curve: 26, opacity: 62 }, specular: { on: true, mode: "soft", size: 30, intensity: 55 }, extrusion: { depth: 12, darkness: 64 }, texture: { amount: 12, scale: 46 } } },
  { id: "obsidian-ember", name: "Obsidian Ember", font: "Black Ops One", shape: "cutline", bevel: { width: 14, softness: 28 },
    effects: { Bevel: "#D4491F", Glow: "#FF9A3D", Highlight: "#FFE9D4", Shadow: "#26100A", "Inner Fill": "#1E1A1E" },
    candy: { gloss: { height: 34, curve: 10, opacity: 40 }, specular: { on: true, mode: "line", size: 55, intensity: 58 }, innerGlow: { opacity: 76, size: 44 }, extrusion: { depth: 14, darkness: 82 }, innerEdge: { strength: 66, width: 3 } } },
  { id: "bubble-pop", name: "Bubble Pop", font: "Bungee", shape: "round", bevel: { width: 8, softness: 100 },
    effects: { Bevel: "#E1408F", Glow: "#FFC1DE", Highlight: "#FFFFFF", Shadow: "#8C1D53", "Inner Fill": "#F868B1" },
    candy: { gloss: { height: 50, curve: 34, opacity: 78, softness: 30 }, specular: { mode: "anime", size: 30, intensity: 92 }, bloom: { opacity: 62, size: 68 }, extrusion: { depth: 9 } } },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function defaultStates(): Record<GenStateName, StateAdjust> {
  return {
    default: { brightness: 5, saturation: 0, glow: 0, lift: 0, opacity: 100 },
    /* hover glows FULL by default (owner mandate, 2026-08-04): it's the
       recipe applied by hand to nearly every kit anyway, it reads as
       "look here" in tutorials and onboarding, and removing it from the
       few pieces that don't want it is one slider. */
    hover: { brightness: 8, saturation: 0, glow: 100, lift: -3, opacity: 100 },
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
  } else {
    // non-jump rolls change the CUT too — from the BUTTON rack plus the
    // Gothic drop (owner: "make sure the new silhouettes appear in the
    // relevant random generators"); banners, plaques and HUD rails still
    // read wrong as a master button shape, and preset jumps above keep
    // their curated cuts
    const rack = SILHOUETTES.filter((m) => (m.category === "Buttons" || m.gothicCut) && !m.preview && m.id !== c.shape);
    c = { ...c, shape: rack[Math.floor(Math.random() * rack.length)].id };
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
  /* the WHOLE wardrobe, derived from the real list — this roll was still
     hardcoded to the original six, so the later waves (houndstooth, chevron,
     skulls…) never reached the homepage's RANDOMIZE, which takes this config
     wholesale. "none" stays the rare roll, same odds as the app's button. */
  const pats = PATTERN_TYPES.filter((t) => t.id !== "none");
  const patType: PatternType = Math.random() < 0.12 ? "none" : pats[Math.floor(Math.random() * pats.length)].id;
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
  | "seasontrack" | "achievetoast"
  // vNext — the staging bay: pieces landing here ship STAGED (admin-only)
  // until released from the kit page's bay
  | "orderticket"
  // rewards & chests pack (staged)
  | "chest" | "giftbox" | "rewardcard" | "qtybadge" | "rewardtray" | "claimbtn" | "chestpanel";
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
export type SlotKind = "free" | "choice" | "value" | "locked" | "color";
export type SlotDef = {
  id: string; name: string; kind: SlotKind;
  /** choice: the curated list, first entry is the default */
  choices?: string[];
  /** free: the specimen text shown when the slot is untouched;
      color: the factory hex the well shows before it's touched */
  def?: string;
  maxLen?: number;
  /** shown in the i card and on locked/value clicks — the no-dead-clicks text */
  note?: string;
};
/* The wheels' pickable glyph set — display names that resolve to
   STOCK_ICONS keys by lowercasing (Heart → heart). "Factory" is the honest
   unset state: each slot keeps its own factory glyph, so the panel never
   claims every sector is a heart. Curated to glyphs that read at
   wheel-sector size. */
const GLYPH_CHOICES = ["Factory", "Heart", "Star", "Zap", "Check", "Gem", "Warning", "Skull", "Trophy", "Sword", "Shield", "Gift", "Hand"];
/* Inventory-flavored picks (armory + loot), plus Empty to clear a cell —
   Factory keeps each cell's own stock glyph, same honesty rule as the
   wheels. All names resolve to STOCK_ICONS keys by lowercasing. */
const INV_GLYPHS = ["Factory", "Empty", "Sword", "Shield", "Helmet", "Shirt", "Boots", "Flask", "Scroll", "Key", "Gem", "Zap", "Skull", "Heart", "Star", "Trophy", "Gift", "Bag", "Lock", "Crosshair"];
const STREAK_GLYPHS = ["Factory", "None", "Zap", "Star", "Skull", "Trophy", "Sword", "Crosshair", "Heart", "Gem", "Warning", "Check"];

export const KIT_SLOTS: Partial<Record<KitComponentId, SlotDef[]>> = {
  cardback: [
    { id: "emblem", name: "Emblem size", kind: "choice", choices: ["Standard", "Small", "Large", "Hero"],
      note: "The set emblem's footprint — Standard is the factory 44% of the card's width; Hero nearly fills the face. Swap the glyph itself under Icon; the text field turns the back into a deck cover." },
    { id: "sparkles", name: "Corner sparkles", kind: "choice", choices: ["On", "Off"],
      note: "The four corner glints. Off reads cleaner on busy themes and photo backdrops." },
    { id: "frame", name: "Inner frame", kind: "choice", choices: ["On", "Off"],
      note: "The frame line echoing the silhouette inside the wall — the classic card-back border." },
  ],
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
  tacho: [
    { id: "unit", name: "Unit", kind: "choice", choices: ["RPM ×1000", "RPM"],
      note: "Tachometers read in revs — the ×1000 form is how real clusters print it." },
    { id: "readout", name: "Readout", kind: "value",
      note: "Driven by the value slider — needle and number move together." },
  ],
  waypoint: [
    { id: "unit", name: "Distance unit", kind: "choice", choices: ["m", "ft", "km", "mi"],
      note: "A distance reads as navigation because its unit is real." },
    { id: "readout", name: "Distance", kind: "value",
      note: "Driven by the value slider." },
  ],
  questpanel: [
    { id: "eyebrow", name: "Eyebrow", kind: "free", def: "SIDE QUEST", maxLen: 24,
      note: "The small caption above the quest name." },
    { id: "eyebrowColor", name: "Eyebrow color", kind: "color", def: "#FFFFFF",
      note: "The caption's ink — factory is a quiet translucent white; a picked color prints solid." },
    { id: "obj1", name: "Objective 1", kind: "free", def: "Reach the vault gate", maxLen: 40 },
    { id: "obj2", name: "Objective 2", kind: "free", def: "Recover ember shards", maxLen: 40 },
    { id: "obj3", name: "Objective 3", kind: "free", def: "Return to Elder Rowan", maxLen: 40 },
  ],
  dialoguebox: [
    { id: "speaker", name: "Speaker", kind: "free", def: "ELDER ROWAN", maxLen: 24 },
    { id: "line2", name: "Second line", kind: "free", def: "Take the ember pass at first light.", maxLen: 60 },
    { id: "bodyColor", name: "Body text color", kind: "color", def: "#1A2418",
      note: "The reading lines' own ink — the speaker plate keeps the kit's type color, so the body can go dark for the light face without touching the title." },
  ],
  chatbubble: [
    { id: "sender", name: "Sender", kind: "free", def: "NOVA_KNIGHT", maxLen: 20 },
    { id: "time", name: "Timestamp", kind: "free", def: "14:02", maxLen: 8 },
  ],
  ammo: [
    /* both counts are the piece's real content — the prototyper stages the
       exact frame (owner: "couldn't find the value slider for this") */
    { id: "mag", name: "Magazine", kind: "free", def: "24", maxLen: 4,
      note: "The live round count — the big number." },
    { id: "reserve", name: "Reserve", kind: "free", def: "90", maxLen: 4,
      note: "The backup count after the slash. Clear it for a bare magazine readout." },
    { id: "gap", name: "Reserve gap", kind: "choice", choices: ["Factory", "Snug", "Roomy", "Wide"],
      note: "Air between the count and the slash — wide display faces read better with more." },
  ],
  spinwheel: [
    /* the fortune wheel was a fixed picture — count, jackpot and glyphs are
       its real content, and the face now wears the kit's own pattern,
       lighting and icon size (owner: "make this wheel editable… more in
       line with the kit design") */
    { id: "wedges", name: "Wedges", kind: "choice", choices: ["8", "6", "10", "12"],
      note: "How many prizes the wheel offers. The jackpot wedges stay opposite each other whatever the count." },
    { id: "jackpot", name: "Jackpot color", kind: "color", def: "#FACC15",
      note: "The winning wedge's ink — gold by factory. The other wedges are mixed from your Color map." },
    { id: "glyph1", name: "Glyph 1", kind: "choice", choices: GLYPH_CHOICES },
    { id: "glyph2", name: "Glyph 2", kind: "choice", choices: GLYPH_CHOICES },
    { id: "glyph3", name: "Glyph 3", kind: "choice", choices: GLYPH_CHOICES },
    { id: "glyph4", name: "Glyph 4", kind: "choice", choices: GLYPH_CHOICES,
      note: "Four glyphs cycle around the wheel. Their size and weight follow Typography → Icons like every other glyph in the kit." },
  ],
  respawn: [
    /* the GO frame is reached by dragging Value to zero — and its words
       are content (owner: "how do i edit the GO state") */
    { id: "goword", name: "Ready word", kind: "free", def: "GO", maxLen: 10,
      note: "The celebration word at zero. Drag the Value slider to 0 to stage the GO frame; the readout counts down to it." },
    { id: "goheading", name: "Ready heading", kind: "free", def: "REDEPLOY", maxLen: 24,
      note: "The heading the GO frame swaps in — the countdown heading is the piece's label in Typography." },
    { id: "readycolor", name: "Ready color", kind: "color", def: "#4ADE80",
      note: "The celebration ink — the GO word, its pulse, and the hue the countdown and bar warm toward. Factory is the arcade ready-green." },
    { id: "barheight", name: "Bar height", kind: "choice", choices: ["Standard", "Slim", "Chunky", "Hidden"],
      note: "The countdown strip's weight — Hidden drops it entirely for a pure readout." },
  ],
  streakmeter: [
    /* the ignition glyph is the meter's whole story (owner: "need to be
       able to control / customize the icon on the streak counter") */
    { id: "endicon", name: "Ignition icon", kind: "choice", choices: STREAK_GLYPHS,
      note: "The glyph that lights when the streak fills — Factory is the zap. None removes it; size and weight follow Typography → Icons." },
  ],
  invgrid: [
    /* every cell's glyph is content (owner: "I should be able to change
       the icons in the text section") — nine wells, three spares */
    { id: "cell1", name: "Cell 1 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell2", name: "Cell 2 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell3", name: "Cell 3 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell4", name: "Cell 4 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell5", name: "Cell 5 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell6", name: "Cell 6 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell7", name: "Cell 7 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell8", name: "Cell 8 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell9", name: "Cell 9 item", kind: "choice", choices: INV_GLYPHS,
      note: "Cells 10–12 are the empty wells — pick a glyph for any cell (or Empty to clear one); Factory keeps the stock loadout." },
    { id: "cell10", name: "Cell 10 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell11", name: "Cell 11 item", kind: "choice", choices: INV_GLYPHS },
    { id: "cell12", name: "Cell 12 item", kind: "choice", choices: INV_GLYPHS },
  ],
  emotewheel: [
    /* the wheel was barely editable ("this component isn't very editable",
       owner) — count and every sector emote are the wheel's real content */
    { id: "sectors", name: "Sectors", kind: "choice", choices: ["4", "6", "8"],
      note: "How many emotes the wheel offers. Selection still rides the Value slider and play-mode clicks; sector slots past the count are ignored." },
    { id: "emote1", name: "Sector 1 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote2", name: "Sector 2 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote3", name: "Sector 3 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote4", name: "Sector 4 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote5", name: "Sector 5 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote6", name: "Sector 6 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote7", name: "Sector 7 emote", kind: "choice", choices: GLYPH_CHOICES },
    { id: "emote8", name: "Sector 8 emote", kind: "choice", choices: GLYPH_CHOICES },
  ],
  friendrow: [
    { id: "status", name: "Status line", kind: "free", def: "In Match · Ranked", maxLen: 32,
      note: "Online rows show this; offline rows show last-seen." },
    { id: "cta", name: "Button word", kind: "free", def: "JOIN", maxLen: 10 },
  ],
  scorebug: [
    { id: "scoreA", name: "Home score", kind: "free", def: "2", maxLen: 3 },
    { id: "scoreB", name: "Away score", kind: "free", def: "1", maxLen: 3 },
  ],
  nameplate: [
    { id: "ribbon", name: "Title ribbon", kind: "free", def: "PIT CHAMPION", maxLen: 24 },
  ],
  dialog: [
    { id: "cta1", name: "Confirm button", kind: "free", def: "CLAIM", maxLen: 12 },
    { id: "cta2", name: "Dismiss button", kind: "free", def: "LATER", maxLen: 12 },
  ],
  pricebtn: [
    { id: "ribbon", name: "Ribbon", kind: "free", def: "BEST VALUE", maxLen: 16 },
  ],
  achievetoast: [
    { id: "eyebrow", name: "Eyebrow", kind: "free", def: "ACHIEVEMENT UNLOCKED", maxLen: 28 },
    { id: "eyebrowColor", name: "Eyebrow color", kind: "color", def: "#FACC15",
      note: "The announcement line's ink — gold is the factory setting because unlocks read as gold." },
    { id: "eyebrowStroke", name: "Eyebrow stroke", kind: "color", def: "#141A28",
      note: "The thin keyline around the announcement letters — keeps them legible over bright shells. Factory is a soft translucent dark; a picked color prints solid." },
  ],
  movecounter: [
    { id: "caption", name: "Caption", kind: "free", def: "MOVES", maxLen: 12 },
    { id: "readout", name: "Count", kind: "value", note: "Driven by the value slider." },
  ],
  orderticket: [
    { id: "num", name: "Order number", kind: "free", def: "#07", maxLen: 5 },
    { id: "i1", name: "Line 1", kind: "free", def: "Flour · eggs · milk", maxLen: 26 },
    { id: "i2", name: "Line 2", kind: "free", def: "Flip until golden", maxLen: 26 },
    { id: "i3", name: "Line 3", kind: "free", def: "Serve with syrup", maxLen: 26 },
    { id: "timer", name: "Time left", kind: "value", note: "Driven by the value slider — 100% is a fresh ticket, 0% is overdue." },
  ],
  chest: [
    { id: "tier", name: "Chest tier", kind: "choice", choices: ["Wood", "Iron", "Gold", "Premium", "Event"], note: "Wood/Iron/Gold are the small/medium/large ladder; Premium and Event are the specials. The trim wears the tier; the body stays the kit's material." },
    { id: "variant", name: "Gate", kind: "choice", choices: ["Timed", "Locked", "Plain"], note: "Timed shows the countdown plate; Locked wears the padlock (key-gated, no timer)." },
    { id: "time", name: "Unlock", kind: "value", note: "Driven by the value slider — 100% just started, 0% is READY to open. Disabled = already opened." },
  ],
  giftbox: [
    { id: "tag", name: "Tag", kind: "choice", choices: ["Plain", "Daily", "Surprise", "Milestone"], note: "Daily wears the banner, Surprise the ?, Milestone adds the progress ring." },
    { id: "ready", name: "Readiness", kind: "value", note: "Driven by the value slider — at 100% the gift glows ready to claim. Disabled = claimed." },
  ],
  rewardcard: [
    { id: "qty", name: "Quantity", kind: "free", def: "×3", maxLen: 8 },
    { id: "kind", name: "Face", kind: "choice", choices: ["Revealed", "Mystery"], note: "Mystery hides the reward as a ? silhouette — the pre-reveal card." },
    { id: "tierv", name: "Rarity", kind: "value", note: "Driven by the value slider — the card's aura walks the kit's rarity tiers (see Color → Rarity tiers)." },
  ],
  rewardtray: [
    { id: "title", name: "Title", kind: "free", def: "REWARDS", maxLen: 16 },
    { id: "q1", name: "Qty 1", kind: "free", def: "×120", maxLen: 6 },
    { id: "q2", name: "Qty 2", kind: "free", def: "×3", maxLen: 6 },
    { id: "q3", name: "Qty 3", kind: "free", def: "×1", maxLen: 6 },
    { id: "q4", name: "Qty 4", kind: "free", def: "×2", maxLen: 6 },
    { id: "reveal", name: "Reveal", kind: "value", note: "Driven by the value slider — slots flip from ? to revealed left to right; 100% is the full summary." },
  ],
  claimbtn: [
    { id: "mode", name: "Mode", kind: "choice", choices: ["Claim all", "2x by ad"], note: "Claim-all wears the gift; the ad take wears the play badge and the ×2 ribbon." },
  ],
  leaderboard: [
    { id: "title", name: "Title", kind: "free", def: "TOP 5", maxLen: 16 },
    { id: "n1", name: "1st name", kind: "free", def: "HAM", maxLen: 12 },
    { id: "t1", name: "1st time", kind: "free", def: "1:21.548", maxLen: 10 },
    { id: "n2", name: "2nd name", kind: "free", def: "VER", maxLen: 12 },
    { id: "t2", name: "2nd time", kind: "free", def: "+0.842", maxLen: 10 },
    { id: "n3", name: "3rd name", kind: "free", def: "YOU", maxLen: 12 },
    { id: "t3", name: "3rd time", kind: "free", def: "+2.156", maxLen: 10 },
    { id: "n4", name: "4th name", kind: "free", def: "LEC", maxLen: 12 },
    { id: "t4", name: "4th time", kind: "free", def: "+3.271", maxLen: 10 },
    { id: "n5", name: "5th name", kind: "free", def: "PIA", maxLen: 12 },
    { id: "t5", name: "5th time", kind: "free", def: "+4.712", maxLen: 10 },
  ],
  listmenu: [
    { id: "row1", name: "Row 1", kind: "free", def: "Equip", maxLen: 18 },
    { id: "row2", name: "Row 2", kind: "free", def: "Inspect", maxLen: 18 },
    { id: "row3", name: "Row 3", kind: "free", def: "Reinforce", maxLen: 18 },
    { id: "row4", name: "Row 4", kind: "free", def: "Drop", maxLen: 18 },
  ],
  choicelist: [
    { id: "c1", name: "Choice 1", kind: "free", def: "Ask about the ruins", maxLen: 40 },
    { id: "c2", name: "Choice 2", kind: "free", def: "Show the sealed letter", maxLen: 40 },
    { id: "c3", name: "Choice 3", kind: "free", def: "Leave — for now", maxLen: 40 },
  ],
  dropdown: [
    { id: "o1", name: "Option 1", kind: "free", def: "Option one", maxLen: 24 },
    { id: "o2", name: "Option 2", kind: "free", def: "Option two", maxLen: 24 },
    { id: "o3", name: "Option 3", kind: "free", def: "Option three", maxLen: 24 },
  ],
  flipclock: [
    { id: "tag1", name: "Tag 1", kind: "free", def: "DAYS", maxLen: 10 },
    { id: "tag2", name: "Tag 2", kind: "free", def: "HOURS", maxLen: 10 },
    { id: "tag3", name: "Tag 3", kind: "free", def: "MINUTES", maxLen: 10 },
    { id: "tag4", name: "Tag 4", kind: "free", def: "SECONDS", maxLen: 10 },
  ],
  equipselector: [
    { id: "item1", name: "Item 1", kind: "free", def: "FIELD TONIC", maxLen: 18 },
    { id: "item2", name: "Item 2", kind: "free", def: "SHOCK CHARGE", maxLen: 18 },
    { id: "item3", name: "Item 3", kind: "free", def: "PRISM MINE", maxLen: 18 },
  ],
  seasontrack: [
    { id: "laneA", name: "Top lane", kind: "free", def: "FREE", maxLen: 12 },
    { id: "laneB", name: "Bottom lane", kind: "free", def: "PREMIUM", maxLen: 12 },
  ],
  weaponwheel: [
    { id: "w1", name: "Chamber 1", kind: "free", def: "BLADE", maxLen: 10 },
    { id: "w2", name: "Chamber 2", kind: "free", def: "VOLT", maxLen: 10 },
    { id: "w3", name: "Chamber 3", kind: "free", def: "TONIC", maxLen: 10 },
    { id: "w4", name: "Chamber 4", kind: "free", def: "AEGIS", maxLen: 10 },
    { id: "w5", name: "Chamber 5", kind: "free", def: "PICK", maxLen: 10 },
    { id: "w6", name: "Chamber 6", kind: "free", def: "PRISM", maxLen: 10 },
    { id: "hint", name: "Hint line", kind: "free", def: "RELEASE TO EQUIP", maxLen: 24 },
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
  dropdown: {
    what: "A select control — one value on show, the whole list on demand; the Pressed state here draws it open. The menu rows speak three voices: resting, HIGHLIGHTED (the row under the cursor — its bar borrows this kit's Hover recipe, so tuning your Hover state retunes the menu too), and SELECTED (the check — the choice that is currently true). Highlighted moves constantly; selected only changes when you commit. Mixing them up is one of the most common menu mistakes in games.",
    history: "Games inherited the dropdown from the desktop — the Macintosh (1984) fixed the pattern of a closed value unfolding into a list, and PC strategy and sim UIs that already leaned on desktop conventions (SimCity 2000 (1993), Civilization II (1996)) brought it into games. It settled where games are configured rather than played: the settings screen.",
    games: "Baldur's Gate 3 (2023) and Cyberpunk 2077 (2020) for modern PC settings dropdowns · as the counter-pattern, console games since the PlayStation era mostly use left/right option cyclers instead — a d-pad hates scrolling nested lists, which is why Gran Turismo and FIFA settings flip through values in place rather than dropping a menu.",
    links: [
      { label: "Drop-down list — the desktop pattern games inherited", url: "https://en.wikipedia.org/wiki/Drop-down_list" },
      { label: "Game UI Database — thousands of real game settings screens", url: "https://www.gameuidatabase.com/" },
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
  secondary: {
    what: "The companion action — the industry says secondary button. It is the SAME button as your primary (same silhouette, bevel, gloss, states) with exactly two things turned down: the candy face washes almost all the way toward the surface, and the label ink trades white for a tint of your Bevel color. Every screen has one action the game wants (PLAY, CLAIM) and companions that must exist without competing (Back, Not now) — the pair encodes that choice physically, so the eye lands on the primary first, every time.",
    history: "The two-volume button pair is older than games: the Macintosh (1984) fixed the dialog convention of one emphasized default beside quieter alternatives, and games absorbed it through their settings screens and confirm dialogs. Mobile free-to-play hardened it into grammar — when every screen sells one thing, Candy Crush Saga (2012) and Clash of Clans (2012) made the wanted answer candy-bright and the polite refusal matte. A gray stock secondary next to a candy primary reads as borrowed furniture, which is why this kit cuts both buttons from the same material and only changes the volume.",
    games: "Fortnite (2017) — a lobby built so one loud PLAY outranks a dozen quiet doors · Hades (2020) for disciplined loud/quiet pairs in shops and prompts · counter-example: dark-pattern purchase dialogs that make BOTH buttons shout (or swap their positions) to farm misclicks — players notice, and reviews say so.",
    links: [
      { label: "Material Design — button hierarchy, the reference write-up", url: "https://m3.material.io/components/buttons/overview" },
      { label: "Game UI Database — thousands of real game dialogs and lobbies", url: "https://www.gameuidatabase.com/" },
    ],
  },
  ghost: {
    what: "The quietest rung of the ladder — primary speaks, secondary accompanies, ghost whispers. Same washed-face treatment as the secondary on a smaller, icon-less frame, for actions that must exist but should nearly disappear: skip, dismiss, \"maybe later\", the legal link under a big decision.",
    history: "The name comes from the flat-design web (~2013–2014): transparent buttons with hairline borders floating on hero images, back when every startup homepage had one. Games were flattening at the same time, and the ghost settled where games whisper — the press-to-continue prompt, the skip control, the fine-print action under a paywall.",
    games: "Destiny (2014) for whisper-quiet menu chrome around loud reward moments · Alto's Adventure (2015) for menus that nearly dissolve into the scene · counter-example: the skip button in mobile ads, ghosted specifically so you miss it — your game earns goodwill by making skip honest.",
    links: [
      { label: "Flat design — the era that named the ghost button", url: "https://en.wikipedia.org/wiki/Flat_design" },
      { label: "Game UI Database — thousands of real game menu screens", url: "https://www.gameuidatabase.com/" },
    ],
  },
};

/* `staged: true` = in the staging bay — bundled but admin-only until the
   owner releases it (app_settings key "component_releases"). Every public
   surface must hide staged pieces that aren't released; the landing never
   shows staged at all (its roster is filtered at the engine boundary).

   `utility` — the owner's BACKGROUND ranking (2026-08-07, not surfaced in
   any UI yet; "I may want to use it as a sort later on"). Ask of each
   piece: a developer's "how can I use this?" and a designer's "how can I
   customize this?"
     1 = visually useful only (demo dressing, screen-pattern flavor)
     2 = prototyper/designer-useful (mockups, boards, SVG exports)
     3 = developer-useful in engine too (ships in the Unity kit) — implies
         the previous two.
   Unset reads as 3: most pieces are full engine citizens, and the honest
   mechanical test for tier 3 is presence in the engine export. Tag only
   deliberate exceptions. */
export const KIT_COMPONENTS: { id: KitComponentId; name: string; staged?: true; utility?: 1 | 2 | 3 }[] = [
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
  /* back in the bay while its editing controls are built out — it shipped
     before it spoke the kit's design language (owner, 2026-08-02) */
  { id: "spinwheel", name: "Spin wheel", staged: true },
  { id: "dailycell", name: "Daily reward" },
  { id: "combo", name: "Combo burst" },
  { id: "movecounter", name: "Move counter" },
  { id: "orderticket", name: "Order ticket", staged: true },
  { id: "chest", name: "Treasure chest", staged: true },
  { id: "giftbox", name: "Gift box", staged: true },
  { id: "rewardcard", name: "Reward card", staged: true },
  { id: "qtybadge", name: "Quantity badge", staged: true },
  { id: "rewardtray", name: "Reward tray", staged: true },
  { id: "claimbtn", name: "Claim button", staged: true },
  { id: "chestpanel", name: "Chest opening", staged: true },
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
/** The staging bay's roster — every piece still awaiting the owner's release. */
export const STAGED_KIT = new Set<KitComponentId>(KIT_COMPONENTS.filter((c) => c.staged).map((c) => c.id));

/* ── GROUPS — the middle scope between one piece and the whole kit ──
   Families that read as a set on screen, so a maker restyles the set in
   one move ("If I change the text on one racing hud, I'd like it to
   change on all the racing huds" — owner). Membership mirrors the kit
   page's own sections, so what looks like a family IS the family. A
   piece belongs to at most one group; anything unlisted simply has no
   group and its scope picker offers Kit and Piece only. */
export const KIT_GROUPS: { id: string; name: string; members: KitComponentId[] }[] = [
  { id: "buttons", name: "Buttons", members: ["primary", "secondary", "small", "ghost", "iconbtn", "pricebtn", "claimbtn", "endturn", "padbtn", "keycap"] },
  { id: "choice", name: "Choice controls", members: ["checkbox", "radio", "toggle", "segment", "stepper"] },
  { id: "fields", name: "Fields", members: ["input", "searchfield", "dropdown", "setrow", "listmenu"] },
  { id: "bars", name: "Bars & meters", members: ["progress", "segbar", "slider", "loadbar", "xpbar", "heartmeter", "energymeter", "capturemeter", "streakmeter", "vsbar", "cooldown"] },
  { id: "chrome", name: "System chrome", members: ["dialog", "toast", "tooltip", "scrollbar", "pagedots", "steps", "spinner", "notifydot"] },
  { id: "racing", name: "Racing HUD", members: ["speedo", "speedo2", "tacho", "laptimes", "telemetry", "compass"] },
  { id: "rpg", name: "RPG & MMO", members: ["questpanel", "dialoguebox", "choicelist", "partyframe", "invgrid", "slot", "datarow", "nameplate", "loottag", "skillnode", "equipslot", "levelnode"] },
  { id: "shooter", name: "Shooter & action", members: ["ammo", "killfeed", "dmgnumber", "respawn", "waypoint", "weaponwheel", "equipselector", "buffframe", "hotbar", "crosshair"] },
  { id: "casual", name: "Casual & mobile", members: ["combo", "movecounter", "booster", "dailycell", "spinwheel", "flipclock", "resource", "currency"] },
  { id: "rewards", name: "Rewards & chests", members: ["chest", "giftbox", "rewardcard", "rewardtray", "pack", "cardback", "qtybadge", "seasontrack"] },
  { id: "social", name: "Strategy & social", members: ["friendrow", "chatbubble", "clancrest", "emotewheel", "unitplate", "buildqueue", "techcard", "scorebug", "leaderboard", "achievetoast"] },
];
const GROUP_OF = new Map<KitComponentId, { id: string; name: string; members: KitComponentId[] }>();
for (const g of KIT_GROUPS) for (const m of g.members) if (!GROUP_OF.has(m)) GROUP_OF.set(m, g);
/** The group a piece belongs to, or null when it stands alone. */
export const groupOf = (id: KitComponentId | null | undefined) => (id ? GROUP_OF.get(id) ?? null : null);
/** True when a piece may be SHOWN: released pieces for everyone, staged
 *  pieces only for the admin (who tests them before release). */
export const kitVisible = (id: KitComponentId, releases: Record<string, string>, admin: boolean): boolean =>
  !STAGED_KIT.has(id) || releases[id] === "released" || admin;

/** How much label a piece can carry. Reading-line pieces (dialogue lines,
 *  toasts, messages) hold sentences; identity labels stay tight. The old
 *  blanket 32 cut the dialogue box's own 40-char default off mid-word
 *  (owner: "text entry field cuts off too early"). Caps are sized to what
 *  each piece renders without spilling its face — not to a round number. */
export const LABEL_MAX: Partial<Record<KitComponentId, number>> = {
  dialoguebox: 48, dialog: 48, tooltip: 48, toast: 40, chatbubble: 40,
  killfeed: 44, input: 40, searchfield: 36, achievetoast: 40, questpanel: 40,
};
export const labelMaxOf = (id: KitComponentId | null | undefined): number => (id && LABEL_MAX[id]) || 32;

/* Components whose FRAME keeps the Default design in every state — the
   hot element (selected cell, the mark, the knob) carries the state, and
   the Global sliders still apply. Derived from bevel's pinDesign call
   sites; the Panel shows a hint so state-editing these doesn't read as
   dead controls (owner: "specular light isn't editable here"). */
export const PINNED_CHROME = new Set<KitComponentId>([
  "checkbox", "chestpanel", "choicelist", "dialog", "dialoguebox", "flipclock",
  "invgrid", "listmenu", "movecounter", "questpanel", "radio", "respawn",
  "rewardtray", "scorebug", "scrollbar", "seasontrack", "setrow", "stopwatch",
]);

/* v70 · SPARSE forks. A component's fork stores only the design paths the
   user actually changed on that piece — everything else keeps following the
   parent design live. (Full-snapshot forks froze a component forever: one
   rim tweak and the piece stopped auto-updating with the kit.) */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type KitDesign = DeepPartial<StateDesign> & {
  stateDesigns?: GenConfig["stateDesigns"];
  /** Per-piece state ADJUSTMENTS (brightness/glow/lift…) — pinned the first
   *  time a focused piece's state sliders move, so "edits save into this
   *  piece" holds for the Global section too. Absent = follow the master. */
  states?: GenConfig["states"];
  /** Per-piece icon RIG (size, offsets, rotation, colors…) — pinned the
   *  first time a focused piece's icon dials move, so resizing one glyph
   *  can't resize every glyph in the kit. Absent = follow the master rig. */
  icon?: DeepPartial<IconCfg>;
};

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
 *  design; untouched paths flow through live. Content and canvas stay
 *  shared — the fork is about the look, not the words. State adjustments
 *  follow the master until the piece pins its own (kd.states). */
export function applyKitDesign(cfg: GenConfig, kd?: KitDesign | null): GenConfig {
  if (!kd) return cfg;
  const out = { ...cfg, stateDesigns: kd.stateDesigns ?? cfg.stateDesigns, states: kd.states ?? cfg.states } as GenConfig;
  if (kd.icon !== undefined) out.icon = deepMergeDesign(cfg.icon, kd.icon) as IconCfg;
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

/** The icon-rig paths where `b` departs from `a` — what a focused icon edit
 *  pins. The glyph itself (`def`) pins as one value: half a glyph, with the
 *  library from one icon and the name from another, is no glyph at all. */
export function iconRigDiff(a: IconCfg, b: IconCfg): KitDesign["icon"] | undefined {
  const d = deepDiff(a, b) as Record<string, unknown> | undefined;
  if (d && "def" in d) d.def = JSON.parse(JSON.stringify(b.def));
  return d as KitDesign["icon"] | undefined;
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
  /* one build eagerly snapshotted the icon into every state fork — inside
     per-piece forks too. A pinned state icon that still equals the piece's
     own rig is pure freeze with no intent behind it: drop it so the state
     follows the rig again (same heal as healStateIconPins on the master). */
  const healPieceStateIcons = (kd: KitDesign) => {
    if (!kd.stateDesigns) return;
    const rig = kd.icon !== undefined ? deepMergeDesign(cfg.icon, kd.icon) : cfg.icon;
    for (const sd of Object.values(kd.stateDesigns)) {
      if (sd?.icon && JSON.stringify(sd.icon) === JSON.stringify(rig)) { delete sd.icon; changed = true; }
    }
  };
  for (const [id, kd] of Object.entries(forks) as [KitComponentId, KitDesign][]) {
    if (!kd) continue;
    healPieceStateIcons(kd);
    if (!isFull(kd)) { out[id] = kd; continue; }
    changed = true;
    const d = designDiff(pickDesign(cfg), kd as unknown as StateDesign);
    // the diff speaks design keys only — the piece's state forks and pinned
    // state adjustments must survive the rebuild
    const extras: KitDesign = {
      ...(kd.stateDesigns && Object.keys(kd.stateDesigns).length ? { stateDesigns: kd.stateDesigns } : {}),
      ...(kd.states ? { states: kd.states } : {}),
      ...(kd.icon !== undefined ? { icon: kd.icon } : {}),
    };
    if (d || Object.keys(extras).length) out[id] = { ...(d ?? {}), ...extras };
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
  orderticket: "round",
  rewardcard: "kenneyRect",
  rewardtray: "kenneyRect",
  chestpanel: "kenneyRect",
  claimbtn: "chunky",
  qtybadge: "pill",
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
/* The pieces that ship as nine-sliced sprites, by their Unity family name.
   Drives the "Unity slicing" editor in Component content and the export's
   user-override lookup (owner: "maybe a manual setting in addition can't
   hurt... you could edit it if need be"). Values are DESIGN-space px; the
   export scales them to sprite px. */
export const KIT_SLICEABLE: Partial<Record<KitComponentId, string>> = {
  primary: "button-primary", secondary: "button-secondary", small: "button-small",
  chip: "chip", tab: "tab", input: "input", panel: "panel", header: "header-banner",
  datarow: "list-row", slot: "item-slot",
};
export interface KitSlice { left: number; right: number; top: number; bottom: number }

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
