import type { Shape } from "./model";

/* ── Silhouette Library metadata ──────────────────────────────────
   Every silhouette in the app is registered here with its provenance,
   license, slice behavior and safe content area — the contract the
   silhouette memo asks for. Geometry itself lives in shapePath()
   (bevel.ts); nothing here is generated at runtime.

   `capScale`   — fixed end-cap width as a fraction of component height
                  (the three-slice boundary; center stretches, caps don't).
   `content`    — safe-area insets as fractions of height (t/r/b/l);
                  labels and icons must stay inside this region.
   `source`     — where the geometry came from. "custom" entries were
                  authored in-project; imported entries name their pack.
                  To import Kenney/OpenGameArt geometry, add the cleaned
                  SVG under docs/silhouette-sources/ and register it here.
*/
export type SilhouetteCategory = "Buttons" | "Blobs" | "Rails & HUD" | "Banners & Labels" | "Plaques & Frames" | "Gothic";
export const SILHOUETTE_CATEGORIES: SilhouetteCategory[] = ["Buttons", "Blobs", "Rails & HUD", "Banners & Labels", "Plaques & Frames", "Gothic"];

export interface SilhouetteMeta {
  id: Shape;
  name: string;
  category: SilhouetteCategory;
  source: string;
  license: string;
  /** "procedural" = geometry computed in shapePath; "path" = authored
   *  artwork resolved from the stock registry (stockShapes.ts). */
  renderer: "procedural" | "path";
  capScale: number;
  content: { top: number; right: number; bottom: number; left: number };
  minWidth: number;
  minHeight: number;
  supports: string[];
  character: string;
  /** Unlisted while under evaluation: hidden from the public picker,
   *  visible to admins for testing. A design already built on one keeps
   *  rendering and keeps its picker card. Distinct from the runtime
   *  retire list (app_settings) — this is the pre-release gate. */
  preview?: boolean;
  /** clearly-asymmetric outlines offer the horizontal flip toggle */
  flippable?: boolean;
}

const BTN = ["button", "chip", "badge", "tab", "toggle", "progress", "slider", "input"];

export const SILHOUETTES: SilhouetteMeta[] = [
  { id: "round", name: "Rounded", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.3, content: { top: 0.14, right: 0.3, bottom: 0.14, left: 0.3 }, minWidth: 72, minHeight: 40,
    supports: [...BTN, "timer"], character: "Soft rectangle — the neutral baseline." },
  { id: "pill", name: "Flat Pill", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.5, content: { top: 0.14, right: 0.5, bottom: 0.14, left: 0.5 }, minWidth: 88, minHeight: 40,
    supports: [...BTN, "timer"], character: "True capsule — semicircular ends." },
  { id: "sharp", name: "Sharp", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.24, content: { top: 0.14, right: 0.26, bottom: 0.14, left: 0.26 }, minWidth: 80, minHeight: 40,
    supports: [...BTN, "timer"], character: "Hard-edged chamfer, no rounding." },
  { id: "hex", name: "Hex", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.24, content: { top: 0.14, right: 0.3, bottom: 0.14, left: 0.3 }, minWidth: 96, minHeight: 40,
    supports: BTN, character: "Single point at each end." },
  { id: "trapezoid", name: "Trapezoid", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.16, content: { top: 0.14, right: 0.24, bottom: 0.14, left: 0.24 }, minWidth: 88, minHeight: 40,
    supports: BTN, character: "Top edge narrower than the base." },
  { id: "notch", flippable: true, name: "Notch", category: "Buttons", source: "custom", license: "original", renderer: "procedural",
    capScale: 0.28, content: { top: 0.14, right: 0.28, bottom: 0.14, left: 0.28 }, minWidth: 88, minHeight: 40,
    supports: BTN, character: "Opposing diagonal corner cuts." },
  { id: "chunky", name: "Heavy Rounded Capsule", category: "Buttons", source: "custom (Crewmate study)", license: "original", renderer: "procedural",
    capScale: 0.44, content: { top: 0.16, right: 0.44, bottom: 0.16, left: 0.44 }, minWidth: 110, minHeight: 48,
    supports: [...BTN, "timer"], character: "Toy-thick shoulders, soft inset breaks top and bottom." },
  { id: "cutline", name: "Sport Cutline", category: "Buttons", source: "custom (broadcast study)", license: "original", renderer: "procedural",
    capScale: 0.3, content: { top: 0.16, right: 0.3, bottom: 0.16, left: 0.3 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Athletic rectangle, clipped end caps." },
  { id: "polybar", name: "Racing Polybar", category: "Rails & HUD", source: "custom (automotive study)", license: "original", renderer: "procedural",
    capScale: 0.48, content: { top: 0.18, right: 0.5, bottom: 0.16, left: 0.5 }, minWidth: 130, minHeight: 44,
    supports: [...BTN, "timer"], character: "Deep top chamfers, stepped lower corners." },
  { id: "explorer", name: "Cosmic Explorer", category: "Rails & HUD", source: "custom (sci-fi study)", license: "original", renderer: "procedural",
    capScale: 0.42, content: { top: 0.16, right: 0.44, bottom: 0.16, left: 0.44 }, minWidth: 120, minHeight: 44,
    supports: [...BTN, "timer"], character: "Faceted end housings instead of arcs." },
  { id: "mazepill", name: "Retro Maze Pill", category: "Buttons", source: "custom (arcade study)", license: "original", renderer: "procedural",
    capScale: 0.42, content: { top: 0.14, right: 0.44, bottom: 0.14, left: 0.44 }, minWidth: 100, minHeight: 40,
    supports: [...BTN, "timer"], character: "Elliptical ends flatter than a pill." },
  { id: "fighthud", name: "Fighting HUD", category: "Rails & HUD", source: "custom (versus study)", license: "original", renderer: "procedural",
    capScale: 0.55, content: { top: 0.16, right: 0.58, bottom: 0.16, left: 0.58 }, minWidth: 140, minHeight: 44,
    supports: BTN, character: "Arrow brackets with inward notches." },
  { id: "crest", name: "Blade Crest", category: "Plaques & Frames", source: "custom (ceremonial study)", license: "original", renderer: "procedural",
    capScale: 0.34, content: { top: 0.16, right: 0.36, bottom: 0.28, left: 0.36 }, minWidth: 120, minHeight: 48,
    supports: ["button", "badge", "tab"], character: "Sloped shoulders, shallow center point below." },
  { id: "blade", name: "Persian Blade", category: "Banners & Labels", source: "custom (ornamental study)", license: "original", renderer: "procedural",
    capScale: 0.5, content: { top: 0.2, right: 0.55, bottom: 0.2, left: 0.55 }, minWidth: 150, minHeight: 44,
    supports: ["button", "badge", "tab"], character: "Swept side tips, concave top and bottom." },
  { id: "tavern", name: "Concave Fantasy Plaque", category: "Plaques & Frames", source: "custom (tavern study)", license: "original", renderer: "procedural",
    capScale: 0.3, content: { top: 0.2, right: 0.32, bottom: 0.2, left: 0.32 }, minWidth: 120, minHeight: 48,
    supports: BTN, character: "Bowed edges, softly concave side walls." },
  { id: "handdrawn", name: "Hand-Drawn Frame", category: "Plaques & Frames", source: "custom + Rough.js ink (seeded)", license: "original / MIT", renderer: "procedural",
    capScale: 0.24, content: { top: 0.18, right: 0.26, bottom: 0.18, left: 0.26 }, minWidth: 110, minHeight: 48,
    supports: [...BTN, "timer"], character: "Seeded ink wobble; Rough.js draws the line character only." },
  { id: "banner", name: "Pointed Banner", category: "Banners & Labels", source: "custom (ribbon study)", license: "original", renderer: "procedural",
    capScale: 0.55, content: { top: 0.16, right: 0.6, bottom: 0.16, left: 0.6 }, minWidth: 140, minHeight: 44,
    supports: ["button", "badge", "tab"], character: "Swallowtail V cut into each end." },
  { id: "shield", name: "Shield Plaque", category: "Plaques & Frames", source: "custom (heraldic study)", license: "original", renderer: "procedural",
    capScale: 0.2, content: { top: 0.14, right: 0.22, bottom: 0.34, left: 0.22 }, minWidth: 96, minHeight: 52,
    supports: ["button", "badge", "iconbtn"], character: "Flat top, walls converging to a bottom point." },
  { id: "pixelstep", name: "Pixel-Stepped Frame", category: "Buttons", source: "custom (8-bit study)", license: "original", renderer: "procedural",
    capScale: 0.24, content: { top: 0.16, right: 0.26, bottom: 0.16, left: 0.26 }, minWidth: 96, minHeight: 44,
    supports: [...BTN, "timer"], character: "Staircase-quantized corners." },
  { id: "kenneyRect", name: "Crisp Panel", category: "Buttons", source: "custom study (after a CC0 pack rectangle)", license: "original", renderer: "procedural",
    capScale: 0.12, content: { top: 0.12, right: 0.16, bottom: 0.12, left: 0.16 }, minWidth: 80, minHeight: 40,
    supports: [...BTN, "timer"], character: "The pack's signature crisp rectangle — corner radius measured at 9.4% of height." },
  { id: "kenneyTag", flippable: true, name: "Pointer Tag", category: "Banners & Labels", source: "custom study (after a CC0 pack handle)", license: "original", renderer: "procedural",
    capScale: 0.31, content: { top: 0.14, right: 0.36, bottom: 0.14, left: 0.18 }, minWidth: 96, minHeight: 40,
    supports: ["button", "chip", "badge", "tab"], character: "Pointer tag — 45° shoulders and tip rounding measured proportions, drawn as an original study." },
  { id: "doboBracket", name: "Bracket Label", category: "Banners & Labels", source: "custom study (after an itch.io label)", license: "original", renderer: "procedural",
    capScale: 0.36, content: { top: 0.14, right: 0.42, bottom: 0.14, left: 0.42 }, minWidth: 120, minHeight: 44,
    supports: ["button", "chip", "badge", "tab", "progress"], character: "Bar with half-round side lobes and meeting notches — measured proportions, drawn as an original study." },

  /* ── Blobs — authored artwork, not procedural geometry (v92) ──────────
     Drawn in-house to the published import spec and rendered through the
     same distortion-capped transform a user import gets. Safe-area insets
     below are MEASURED off each outline across the middle 64% of its
     width, not guessed — organic tops intrude further than a slab's do. */
  { id: "stock:bubbleslab", flippable: true, name: "Bubble Slab", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.39, content: { top: 0.201, right: 0.34, bottom: 0.177, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wide slab with a gentle swell top and bottom." },
  { id: "stock:teardroplozenge", flippable: true, name: "Teardrop Lozenge", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.85, content: { top: 0.123, right: 0.34, bottom: 0.151, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Full round shoulder tapering to a soft point." },
  { id: "stock:swellbar", flippable: true, name: "Swell Bar", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.85, content: { top: 0.173, right: 0.34, bottom: 0.218, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "One long S-curve — heavy at the left, lifting right." },
  { id: "stock:wavecapsule", flippable: true, name: "Wave Capsule", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.31, content: { top: 0.194, right: 0.34, bottom: 0.19, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Rounded caps under a single rolling wave." },
  { id: "stock:cobblebar", flippable: true, name: "Cobble Bar", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.85, content: { top: 0.251, right: 0.34, bottom: 0.124, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Bumpy shoulder settling into a calm right end." },
  { id: "stock:wedgeblob", flippable: true, name: "Wedge Blob", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.85, content: { top: 0.168, right: 0.34, bottom: 0.125, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Round left shoulder, straight taper to the right." },
  { id: "stock:cushionslab", flippable: true, name: "Cushion Slab", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.3, content: { top: 0.125, right: 0.34, bottom: 0.11, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The widest, softest slab — barely-there top wave." },
  { id: "stock:scallopblock", flippable: true, name: "Scallop Block", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.3, content: { top: 0.137, right: 0.34, bottom: 0.121, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Squared block with rippled, scalloped ends." },
  { id: "stock:longloaf", flippable: true, name: "Long Loaf", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.42, content: { top: 0.144, right: 0.34, bottom: 0.149, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Long and low with one soft rise." },
  { id: "stock:rollingbar", flippable: true, name: "Rolling Bar", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.3, content: { top: 0.159, right: 0.34, bottom: 0.157, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Ribbon bar — top and bottom roll in parallel." },
  { id: "stock:peanutpill", flippable: true, name: "Peanut Pill", category: "Blobs", source: "custom (PatternBreak blob set)", license: "original", renderer: "path",
    capScale: 0.37, content: { top: 0.17, right: 0.34, bottom: 0.212, left: 0.34 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Peanut profile with a clean centre waist." },

  /* ── Gothic — the goth3 drop (2026-08-05): twelve friendlier
     silhouettes replacing the original nine, live for every tier like
     the set they replace. Caps and content insets are MEASURED off each
     outline by the renderer's own slicing plus the standard 0.18h side
     gutter; verticals come from the central band's median edges plus
     0.05h. No wall cap — these drawings hold a true offset at any depth
     the slider reaches. ── */
  { id: "stock:vesperblade", name: "Vesper Blade", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.392, content: { top: 0.246, right: 0.572, bottom: 0.237, left: 0.572 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Sleek pointed cartouche with twin side spurs." },
  { id: "stock:nightcompass", name: "Night Compass", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.361, content: { top: 0.271, right: 0.541, bottom: 0.265, left: 0.541 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Four-point lozenge — a compass cut for dark maps." },
  { id: "stock:chapelpeak", name: "Chapel Peak", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.187, content: { top: 0.238, right: 0.367, bottom: 0.216, left: 0.367 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wide plaque rising to a center gable." },
  { id: "stock:fleurcrown", name: "Fleur Crown", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.199, content: { top: 0.287, right: 0.379, bottom: 0.2, left: 0.379 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Soft cartouche crowned with a fleur-de-lis finial." },
  { id: "stock:duskbat", name: "Dusk Bat", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.3, content: { top: 0.311, right: 0.48, bottom: 0.226, left: 0.48 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The friendlier bat — round wings, soft scallops." },
  { id: "stock:briarbanner", name: "Briar Banner", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.27, content: { top: 0.313, right: 0.45, bottom: 0.209, left: 0.45 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Broad banner with gentle briar points." },
  { id: "stock:irongate", name: "Iron Gate", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.06, content: { top: 0.302, right: 0.24, bottom: 0.227, left: 0.24 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Straight plaque flanked by gate-post blades." },
  { id: "stock:cloisterscroll", name: "Cloister Scroll", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.075, content: { top: 0.276, right: 0.255, bottom: 0.16, left: 0.255 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Curled volute corners on a calm span." },
  { id: "stock:abbeycrest", name: "Abbey Crest", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.107, content: { top: 0.275, right: 0.287, bottom: 0.213, left: 0.287 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Curved crest under a small trefoil finial." },
  { id: "stock:cryptlantern", name: "Crypt Lantern", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.203, content: { top: 0.281, right: 0.383, bottom: 0.276, left: 0.383 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Elongated lantern gem, diamond points above and below." },
  { id: "stock:reliquary", name: "Reliquary", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.102, content: { top: 0.261, right: 0.282, bottom: 0.185, left: 0.282 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Bracketed case with pointed finials." },
  { id: "stock:velvetplaque", name: "Velvet Plaque", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path",
    capScale: 0.261, content: { top: 0.178, right: 0.441, bottom: 0.134, left: 0.441 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The soft one — rounded cartouche, gentle swells." },
];

export function silhouetteMeta(id: Shape): SilhouetteMeta | undefined {
  // a ~flip variant reads its base's meta with the horizontal insets
  // swapped — cap zones are symmetric, text-safe areas are not
  if (id.endsWith("~flip")) {
    const base = SILHOUETTES.find((s) => s.id === id.slice(0, -5));
    return base && { ...base, content: { ...base.content, left: base.content.right, right: base.content.left } };
  }
  return SILHOUETTES.find((s) => s.id === id);
}
