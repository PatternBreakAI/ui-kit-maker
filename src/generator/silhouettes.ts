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
export type SilhouetteCategory = "Buttons" | "Blobs" | "Rails & HUD" | "Banners & Labels" | "Plaques & Frames" | "Gothic" | "Arabesque" | "Vigilante";
export const SILHOUETTE_CATEGORIES: SilhouetteCategory[] = ["Buttons", "Blobs", "Rails & HUD", "Banners & Labels", "Plaques & Frames", "Gothic", "Arabesque", "Vigilante"];

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
  /** Authored-curve outlines that take the drawing-resolution gothic
   *  offset pipeline (the curve-aware kernel; smoothness disabled).
   *  Decoupled from the thematic category — Arabesque shapes cut the
   *  same way Gothic ones do. */
  gothicCut?: boolean;
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



  /* ── Gothic — one rack, like with like (owner call, 2026-08-06):
     blades & thorns, then iron, bats, chapel crests, crypt relics,
     banners & scrolls. All authored curves on the kernel cut; the
     original nine are LIVE for every tier alongside the twelve. ── */
  { id: "stock:vesperblade", name: "Vesper Blade", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.392, content: { top: 0.246, right: 0.572, bottom: 0.237, left: 0.572 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Sleek pointed cartouche with twin side spurs." },
  { id: "stock:firstthorn", name: "First Thorn", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.648, content: { top: 0.187, right: 0.828, bottom: 0.186, left: 0.769 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Long side spears, thorn-barbed corners — the shape that taught the importer to stretch." },
  { id: "stock:thornward", name: "Thornward Plaque", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.186, content: { top: 0.374, right: 0.366, bottom: 0.221, left: 0.366 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Thorn-tipped corners under a center spire." },
  { id: "stock:briarbanner", name: "Briar Banner", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.27, content: { top: 0.313, right: 0.45, bottom: 0.209, left: 0.45 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Broad banner with gentle briar points." },
  { id: "stock:irongate", name: "Iron Gate", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.06, content: { top: 0.302, right: 0.24, bottom: 0.227, left: 0.24 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Straight plaque flanked by gate-post blades." },
  { id: "stock:ironvigil", name: "Iron Vigil", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.168, content: { top: 0.331, right: 0.348, bottom: 0.236, left: 0.348 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Carved slab flanked by wrought-iron spear posts." },
  { id: "stock:duskbat", name: "Dusk Bat", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.3, content: { top: 0.311, right: 0.48, bottom: 0.226, left: 0.48 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The friendlier bat — round wings, soft scallops." },
  { id: "stock:belfrybat", name: "Belfry Bat", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.384, content: { top: 0.404, right: 0.564, bottom: 0.357, left: 0.564 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The bat itself — scalloped wings, eared crown." },
  { id: "stock:chapelpeak", name: "Chapel Peak", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.187, content: { top: 0.238, right: 0.367, bottom: 0.216, left: 0.367 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wide plaque rising to a center gable." },
  { id: "stock:abbeycrest", name: "Abbey Crest", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.107, content: { top: 0.275, right: 0.287, bottom: 0.213, left: 0.287 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Curved crest under a small trefoil finial." },
  { id: "stock:quatrefoil", name: "Quatrefoil Crest", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.355, content: { top: 0.364, right: 0.535, bottom: 0.221, left: 0.535 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Cathedral point with a quatrefoil cut, spear ends." },
  { id: "stock:nightcompass", name: "Night Compass", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.361, content: { top: 0.271, right: 0.541, bottom: 0.265, left: 0.541 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Four-point lozenge — a compass cut for dark maps." },
  { id: "stock:fleurcrown", name: "Fleur Crown", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.199, content: { top: 0.287, right: 0.379, bottom: 0.2, left: 0.379 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Soft cartouche crowned with a fleur-de-lis finial." },
  { id: "stock:cryptmarker", name: "Crypt Marker", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.223, content: { top: 0.227, right: 0.403, bottom: 0.226, left: 0.403 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Chamfered slab, diamond finials above and below." },
  { id: "stock:cryptlantern", name: "Crypt Lantern", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.203, content: { top: 0.281, right: 0.383, bottom: 0.276, left: 0.383 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Elongated lantern gem, diamond points above and below." },
  { id: "stock:reliquary", name: "Reliquary", category: "Gothic", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.102, content: { top: 0.261, right: 0.282, bottom: 0.185, left: 0.282 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Bracketed case with pointed finials." },
  { id: "stock:evensong", name: "Evensong Banner", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.455, content: { top: 0.466, right: 0.635, bottom: 0.465, left: 0.635 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Soft vesper banner between pierced star chimes." },
  { id: "stock:hellmouth", name: "Hellmouth Scroll", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.217, content: { top: 0.389, right: 0.397, bottom: 0.36, left: 0.397 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Flame-curled ends, fanged center ridge." },
  { id: "stock:cloisterrail", name: "Cloister Rail", category: "Gothic", source: "custom (PatternBreak gothic set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.736, content: { top: 0.224, right: 0.916, bottom: 0.213, left: 0.916 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The long rail — pierced star finials on a clean span." },

  /* ── Arabesque — scrollwork that outgrew the Gothic rack (owner:
     "these shapes don't feel goth"). Same kernel cut, its own
     shelf. ── */
  { id: "stock:cloisterscroll", name: "Cloister Scroll", category: "Arabesque", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.075, content: { top: 0.276, right: 0.255, bottom: 0.16, left: 0.255 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Curled volute corners on a calm span." },
  { id: "stock:velvetplaque", name: "Velvet Plaque", category: "Arabesque", source: "custom (PatternBreak goth3 set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.261, content: { top: 0.178, right: 0.441, bottom: 0.134, left: 0.441 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The soft one — rounded cartouche, gentle swells." },

  /* ── Vigilante — the night-hero drop (owner upload, 2026-08-06),
     LIVE for every tier by owner call ("all looks great, push live").
     Three families in rack order: winged emblems, comic title plaques,
     velocity bars.
     Caps and content boxes measured from each outline as always;
     all on the kernel cut. ── */
  { id: "stock:eclipsesigil", name: "Eclipse Sigil", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.45, content: { top: 0.407, right: 0.63, bottom: 0.43, left: 0.63 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "All points, no rest — a sigil for hero moments." },
  { id: "stock:ravendart", name: "Raven Dart", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.306, content: { top: 0.303, right: 0.486, bottom: 0.293, left: 0.486 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Slim spiked banner, wingtips drawn to needles." },
  { id: "stock:starwarden", name: "Star Warden", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.255, content: { top: 0.263, right: 0.435, bottom: 0.293, left: 0.435 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Diamond crown over a guarded star emblem." },
  { id: "stock:stormburst", name: "Storm Burst", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.108, content: { top: 0.367, right: 0.288, bottom: 0.34, left: 0.288 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "A burst mid-detonation — spikes on every side." },
  { id: "stock:taloncrest", name: "Talon Crest", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.201, content: { top: 0.388, right: 0.348, bottom: 0.305, left: 0.381 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wing scallops end in curled talons." },
  { id: "stock:hornguard", name: "Horn Guard", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.118, content: { top: 0.344, right: 0.298, bottom: 0.322, left: 0.293 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Curved horns flank a crowned emblem." },
  { id: "stock:phantombanner", name: "Phantom Banner", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.129, content: { top: 0.295, right: 0.309, bottom: 0.279, left: 0.309 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "A banner with blade tips and a spiked spine." },
  { id: "stock:swiftwing", name: "Swift Wing", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.106, content: { top: 0.335, right: 0.286, bottom: 0.254, left: 0.286 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Swallowtail flare, cut for speed." },
  { id: "stock:shadowcowl", name: "Shadow Cowl", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.184, content: { top: 0.328, right: 0.364, bottom: 0.28, left: 0.364 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The full night emblem — horns, wings, curls." },
  { id: "stock:capeshield", name: "Cape Shield", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.18, content: { top: 0.27, right: 0.36, bottom: 0.28, left: 0.36 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "A shield hemmed with cape scallops." },
  { id: "stock:crestedward", name: "Crested Ward", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.116, content: { top: 0.28, right: 0.296, bottom: 0.196, left: 0.296 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Tall ward under a pointed crest." },
  { id: "stock:splashcrown", name: "Splash Crown", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.221, content: { top: 0.275, right: 0.401, bottom: 0.137, left: 0.401 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Title-card plaque with a peaked crown." },
  { id: "stock:boldmasthead", name: "Bold Masthead", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.175, content: { top: 0.195, right: 0.355, bottom: 0.193, left: 0.355 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wide chamfered masthead for loud titles." },
  { id: "stock:captionpeak", name: "Caption Peak", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.188, content: { top: 0.146, right: 0.368, bottom: 0.159, left: 0.368 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Caption slab rising to a center peak." },
  { id: "stock:inkerpanel", name: "Inker Panel", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.196, content: { top: 0.12, right: 0.376, bottom: 0.123, left: 0.376 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Low, wide panel with inked corner bites." },
  { id: "stock:kitecard", name: "Kite Card", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.367, content: { top: 0.205, right: 0.547, bottom: 0.205, left: 0.547 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Kite-cut card, points east and west." },
  { id: "stock:halftoneslab", name: "Halftone Slab", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.137, content: { top: 0.168, right: 0.317, bottom: 0.146, left: 0.317 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Clean slab with printed-notch corners." },
  { id: "stock:gutterslab", name: "Gutter Slab", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.137, content: { top: 0.164, right: 0.317, bottom: 0.129, left: 0.317 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Panel slab with gutter-cut corners." },
  { id: "stock:panelprime", name: "Panel Prime", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.137, content: { top: 0.164, right: 0.317, bottom: 0.139, left: 0.317 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "The straight-ahead comic panel." },
  { id: "stock:ridgecaption", name: "Ridge Caption", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.139, content: { top: 0.191, right: 0.319, bottom: 0.104, left: 0.319 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Caption bar under a ridged top line." },
  { id: "stock:crestpanel", name: "Crest Panel", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.201, content: { top: 0.172, right: 0.381, bottom: 0.131, left: 0.381 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Panel with a quiet crest rise." },
  { id: "stock:bracketsplash", name: "Bracket Splash", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.149, content: { top: 0.18, right: 0.329, bottom: 0.18, left: 0.329 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Splash frame with bracketed sides." },
  { id: "stock:framesplash", name: "Frame Splash", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.244, content: { top: 0.164, right: 0.424, bottom: 0.126, left: 0.424 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Full splash frame, corners stepped." },
  { id: "stock:velocityhex", name: "Velocity Hex", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.252, content: { top: 0.207, right: 0.432, bottom: 0.047, left: 0.432 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Hex bar stretched to speed." },
  { id: "stock:turbonotch", flippable: true, name: "Turbo Notch", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.235, content: { top: 0.04, right: 0.415, bottom: 0.249, left: 0.368 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Speed bar with an off-center intake notch." },
  { id: "stock:slipstreambar", flippable: true, name: "Slipstream Bar", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.167, content: { top: 0.04, right: 0.347, bottom: 0.224, left: 0.347 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "A bar caught in the slipstream — stepped tail." },
  { id: "stock:dashplate", name: "Dash Plate", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.176, content: { top: 0.239, right: 0.356, bottom: 0.04, left: 0.356 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Dash-cut plate, ready for HUD duty." },
  { id: "stock:vectorwedge", name: "Vector Wedge", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.332, content: { top: 0.041, right: 0.512, bottom: 0.263, left: 0.512 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wedge-ended vector bar." },
  { id: "stock:rushslab", flippable: true, name: "Rush Slab", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.224, content: { top: 0.195, right: 0.404, bottom: 0.04, left: 0.359 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Slab leaning into the rush." },
  { id: "stock:boostbar", flippable: true, name: "Boost Bar", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.261, content: { top: 0.04, right: 0.354, bottom: 0.201, left: 0.441 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Boost-vent bar, intake on the left." },
  { id: "stock:skewstreak", flippable: true, name: "Skew Streak", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.425, content: { top: 0.154, right: 0.605, bottom: 0.12, left: 0.343 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Full-tilt streak — everything leans." },
  { id: "stock:driftplate", name: "Drift Plate", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.174, content: { top: 0.191, right: 0.354, bottom: 0.041, left: 0.354 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Plate drifting through the corner." },
  { id: "stock:strikebar", name: "Strike Bar", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.164, content: { top: 0.18, right: 0.344, bottom: 0.132, left: 0.338 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Compact strike bar with beveled jaws." },
  { id: "stock:chargewedge", flippable: true, name: "Charge Wedge", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.263, content: { top: 0.212, right: 0.33, bottom: 0.046, left: 0.443 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Wedge charging left, tail high." },
  { id: "stock:leanrunner", flippable: true, name: "Lean Runner", category: "Vigilante", source: "custom (PatternBreak vigilante set)", license: "original", renderer: "path", gothicCut: true,
    capScale: 0.241, content: { top: 0.248, right: 0.334, bottom: 0.057, left: 0.421 }, minWidth: 96, minHeight: 40,
    supports: [...BTN, "timer"], character: "Parallelogram at a dead run." },
  /* the Settings gear component's own silhouette — unlisted from the public
     picker (preview) while the component sits in the staging bay; square by
     construction, so it never stretches */
  { id: "stock:gear", name: "Gear", category: "Plaques & Frames", source: "custom (parametric 12-tooth cog)", license: "original", renderer: "path", preview: true,
    capScale: 0.5, content: { top: 0.3, right: 0.3, bottom: 0.3, left: 0.3 }, minWidth: 64, minHeight: 64,
    supports: ["button"], character: "Twelve-tooth cog — the settings glyph as real geometry." },
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
