import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ArrowDown, ArrowUp, BookmarkPlus, BringToFront, Copy, Download, Grid3x3, ImagePlus, LayoutTemplate, Lock, Monitor, Plus, Search, SendToBack, Shield, Smartphone, SquarePen, Trash2, Type, X } from "lucide-react";
import { useGen, rehydrateBoardBgs, boardBgFilter, boardScaleMin, drawBoardNoise, drawBoardOverlays, stampFilter, stampSvg, warpStampRaster, importUserAssetFile, kitShadowFilter, suppressCastShadow } from "@/generator/store";
import type { UserAsset, UserLogoFx } from "@/generator/store";
import { normalizeShipCopy, captureVideoPoster } from "@/generator/bgvault";
import { importBgAsset, bgAssetStatusLine, onAssetActivity, bgAssetDisplayUrl } from "@/generator/assets";
import { BACKDROP_LIBRARY, BACKDROP_CATEGORIES, backdropThumb, backdropUrl } from "@/generator/backdropLibrary";
import type { BoardDef, BoardItem } from "@/generator/store";
import { renderBevel, renderKit, glowPadOf, VALUE_DRIVEN } from "@/generator/bevel";
import { KIT_COMPONENTS, applyKitDesign, applyKitTextFill, baseOf, fontByName, kitVisible, resolveKitIcon, KIT_LABEL_EDITABLE, labelMaxOf } from "@/generator/model";
import { LIVE_GLYPHS } from "@/generator/glyphLibrary";
import { BIG_GLYPHS, BIG_GLYPH_BASE, bigGlyphById, bigGlyphThumb, bigGlyphMid, bigGlyphUrl, bigGlyphFilter, type BigGlyphDef, type BigGlyphFx } from "@/generator/bigGlyphs";
import type { GenConfig, KitComponentId } from "@/generator/model";
import { download, downloadSvg, fontDataUri } from "@/generator/exportUtils";
import { tightenSvg } from "@/marketing/engine";
import { openGate } from "@/shell/gateModal";
import { LiveArt, shellHit, imgShellHit, stillSmil, stripSmil } from "./LiveArt";

/* An SVG rasterized through an <img> — or downloaded and opened outside the
   app — is a SEALED document: it cannot see the page's loaded fonts, so any
   <text> silently falls back to a system face (owner: "the warp effects are
   cool but lose the font"). Inline the cfg's faces as data-URI @font-face
   rules before any of those trips. fontDataUri caches per family, so after
   the first fetch this is string work. Exact-name guard: fontByName falls
   back to the default face for unknown families, and embedding the WRONG
   bytes under a family's name is worse than the fallback. */
async function svgWithFaces(svg: string, pc: GenConfig): Promise<string> {
  if (!svg.includes("<text")) return svg;
  const fams = [pc.type.font, ...(pc.type.listFont ? [pc.type.listFont] : [])];
  const rules: string[] = [];
  for (const fam of fams) {
    const fd = fontByName(fam);
    const uri = await fontDataUri(fam, fd.name === fam ? fd.css ?? null : null).catch(() => null);
    if (uri) rules.push(`@font-face{font-family:"${fam.replace(/"/g, "")}";src:url(${uri}) format("woff2");}`);
  }
  return rules.length ? svg.replace(/(<svg[^>]*>)/, `$1<style>${rules.join("")}</style>`) : svg;
}

/* One piece as a TRANSPARENT-background PNG at 2× — the same sealed
   document as the SVG download, rasterized (dev field report: "export
   items as pngs without the background, not just as .svgs"). SMIL loops
   are stripped so the raster lands on the settled pose. */
async function downloadPieceRaster(pc: { svg: string; cfg: GenConfig }, name: string) {
  const svg = stripSmil(await svgWithFaces(pc.svg, pc.cfg));
  const w = +(/width="([\d.]+)"/.exec(svg)?.[1] ?? 300), h = +(/height="([\d.]+)"/.exec(svg)?.[1] ?? 150);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("piece raster failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w * 2)); cv.height = Math.max(1, Math.round(h * 2));
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  cv.toBlob((bl) => { if (bl) download(`${name}.png`, bl); }, "image/png");
}

/* ── The Board v3 — a vertical stack of named artboards ────────────
   Left: searchable asset drawer (live kit components + saved pieces).
   Center: every artboard in a scrolling column; each has its own name,
   aspect, pieces and background (cropped to the board bounds).
   Right: an InDesign-style pages tray to add / reorder / delete boards,
   then the inspector for the selected piece or the active background.
   Cmd+Z undoes (100 levels), Delete removes, Cmd+D duplicates. */

/* The full 113-piece roster, grouped by genre — every component the kit
   ships is placeable (the drawer had frozen at the pre-pack roster). */
/* Tray entries are kit ids, optionally with a render variant after "~"
   (the same suffix convention the flip shapes use): "joystick~ghost" is
   the overlay stick — one component, two placeable faces. */
const ASSET_GROUPS: { name: string; ids: string[] }[] = [
  { name: "Buttons", ids: ["primary", "secondary", "small", "ghost", "iconbtn", "pricebtn", "endturn", "keycap", "padbtn"] },
  { name: "Containers & overlays", ids: ["panel", "header", "tab", "tabback", "dropdown", "dialog", "toast", "tooltip", "listmenu", "choicelist", "scrollbar", "input", "searchfield", "setrow"] },
  { name: "HUD & readouts", ids: ["resource", "chip", "badge", "datarow", "slot", "orb", "ring", "bignum", "xpbar", "vitalbar", "currency", "healthglobe", "manarails", "buffframe", "cooldown", "notifydot", "countbadge", "avatarframe", "nameplate", "loadbar", "spinner", "pagedots", "steps", "stepper"] },
  { name: "Timers", ids: ["flipclock", "stopwatch", "timerdigits"] },
  { name: "Controls", ids: ["toggle", "slider", "progress", "segbar", "emblembar", "vsbar", "hotbar", "segment", "checkbox", "radio", "joystick", "gearicon", "trophyicon", "trophyicon~gold", "trophyicon~silver", "trophyicon~bronze", "gifticon"] },
  { name: "Shooter", ids: ["reticle", "crosshair", "hitmarker", "ammo", "magazine", "lives", "minimap", "compass", "killfeed", "weaponwheel", "equipselector", "firebutton", "joystick~ghost", "streakmeter", "waypoint", "capturemeter", "respawn", "dmgarc", "dmgnumber"] },
  { name: "RPG & progression", ids: ["questpanel", "dialoguebox", "partyframe", "unitplate", "invgrid", "rarityframe", "equipslot", "quickslots", "skillnode", "levelnode", "pathconnector", "loottag", "seasontrack", "achievetoast"] },
  { name: "Casual & mobile", ids: ["heartmeter", "energymeter", "movecounter", "orderticket", "booster", "combo", "dailycell", "spinwheel", "popmeter", "starrating"] },
  { name: "Rewards & chests", ids: ["chest", "giftbox", "rewardcard", "qtybadge", "rewardtray", "claimbtn", "chestpanel"] },
  { name: "Racing", ids: ["speedo", "speedo2", "tacho", "circuit", "leaderboard", "laptimes", "telemetry", "startlights"] },
  { name: "Strategy & score", ids: ["buildqueue", "techcard", "scorebug", "trophy"] },
  { name: "Social", ids: ["friendrow", "chatbubble", "clancrest", "emotewheel"] },
  { name: "Card battler", ids: ["cardback", "pack"] },
  /* the semantic glyph rack — registry-derived so the tray and the kit page
     can't drift; the kitVisible filter below keeps it admin-only while
     staged, then per-glyph as releases land. LIVE only — a retired glyph
     leaves the tray while its legacy placements keep rendering. */
  { name: "Semantic glyphs", ids: LIVE_GLYPHS.map((g) => `glyph${g.id}`) },
];

/* Search vocabulary: teams reach for genre words the component names don't
   carry — "results", "celebration", "saga", "lives" must land on the right
   pieces (owner: "all kit elements… just need to be surface-able by
   search"). Every piece also matches its display name, its id and its
   group name; this map only adds the words those three miss. */
const SEARCH_TERMS: Partial<Record<KitComponentId, string>> = {
  starrating: "stars results celebration win level complete replay",
  combo: "multiplier celebration results streak pop",
  bignum: "score results points celebration count",
  dmgnumber: "damage floating hit crit numbers pop",
  firebutton: "fire shoot trigger pad thumb button attack weapon armed carousel",
  countbadge: "notification count red badge alert number unread pip",
  levelnode: "saga map level select world stage lock",
  pathconnector: "saga map path world trail dots",
  heartmeter: "lives hearts refill casual",
  energymeter: "energy stamina lightning refill",
  movecounter: "moves turns remaining casual",
  dailycell: "daily rewards calendar gift streak",
  spinwheel: "spin wheel fortune prize daily lucky",
  booster: "powerup power-up consumable item casual",
  chest: "reward loot crate treasure win",
  giftbox: "present reward gift daily",
  rewardcard: "reward results win prize claim",
  rewardtray: "rewards results win row",
  claimbtn: "collect claim reward cta",
  qtybadge: "count amount quantity stack",
  chestpanel: "rewards chest opening celebration",
  achievetoast: "achievement unlock celebration banner first",
  trophy: "cup winner victory results podium gold",
  startlights: "race countdown start lights gantry",
  gearicon: "settings gear cog options config preferences menu",
  trophyicon: "trophy cup winner award champion victory first place prize",
  gifticon: "gift present box bow ribbon reward claim surprise",
  resource: "currency coins gems counter hud pill",
  currency: "coins gems gold money wallet",
  pricebtn: "buy purchase shop iap best value ribbon",
  healthglobe: "orb health hp potion diablo",
  xpbar: "experience level progress bar",
  orderticket: "cooking recipe kitchen casual timer",
  popmeter: "population supply cap strategy",
  quickslots: "equipment quadrant dpad loadout souls",
  vitalbar: "health mana bar readout hud",
};
// glyph pieces answer to "icon", their semantic name and their category
// ("currencies", "boosters"…) — registry-derived like the tray group
for (const g of LIVE_GLYPHS) {
  SEARCH_TERMS[`glyph${g.id}` as KitComponentId] = `icon glyph treated ${g.name.toLowerCase()} ${g.category.toLowerCase().replace(/[&]/g, " ")}`;
}

/* Bundled backdrops — the owner's own scenes, served from public/. A path
   URL persists (and exports); only blob: uploads stay session-only. */
const BACKDROPS: { name: string; url: string; video?: true }[] = [
  { name: "Valley", url: "/backdrops/valley.jpg" },
  { name: "FPS ruins", url: "/backdrops/fps-ruins.jpg" },
  { name: "Storm keep", url: "/backdrops/strategy-keep.jpg" },
  { name: "Tavern", url: "/backdrops/tavern.jpg" },
  { name: "City streets", url: "/backdrops/city-streets.jpg" },
  { name: "Dungeon · video", url: "/backdrops/dungeon-loop.mp4", video: true },
];

/* Starter screens — approximate compositions for the 16:9 stage, most
   with a bundled backdrop so one click reads like a real game screen.
   The user nudges from here; every piece stays a live kit asset.
   Re-swept for the post-pack roster: weapon wheel, killfeed, quest
   panel, party frames, score bug, achievement toast, social pieces. */
type Tpl = {
  bg?: string;
  /** template is composed for a specific stage — applying it retunes the
   *  active board's aspect first (the Match-3 mobile grid) */
  aspect?: "169" | "mobile";
  items: { kitId?: KitComponentId; big?: BigGlyphFx; x: number; y: number; scale?: number }[];
};
/* The Match-3 board: 7×9 big-glyph tiles at 12% (~52px — the scale-floor
   round's whole point) on the 390×844 stage. The tiles are the set's six
   true fruits (owner: "layout the fruit in a grid"). Seeded MATCHLESS the
   way a real round starts: tile kind = (col + 2·row) mod 6, so horizontal
   neighbours differ by 1 and vertical by 2 — never a 3-run — with one
   bomb dropped in as the power piece (a single bomb can't form a run). */
const M3_TILES = ["apple", "blueberry", "bananas", "lime", "grapes", "orange"];
const M3_GRID: { big: BigGlyphFx; x: number; y: number; scale: number }[] = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 7; c++) {
  const gid = r === 4 && c === 3 ? "bomb" : M3_TILES[(c + 2 * r) % 6];
  const gl = bigGlyphById(gid)!;
  M3_GRID.push({
    big: { gid },
    x: Math.round(13 + c * 52 + (52 - gl.w * 0.06) / 2),
    y: Math.round(176 + r * 52 + (52 - gl.h * 0.06) / 2),
    scale: 0.12,
  });
}
const BOARD_TEMPLATES: Record<string, Tpl> = {
  "Main menu": { items: [
    { kitId: "header", x: 560, y: 90, scale: 1.1 },
    { kitId: "primary", x: 700, y: 390, scale: 1.1 },
    { kitId: "badge", x: 1165, y: 370, scale: 0.9 },
    { kitId: "secondary", x: 610, y: 585 },
    { kitId: "ghost", x: 760, y: 780 },
    { kitId: "resource", x: 70, y: 55 },
    { kitId: "currency", x: 70, y: 160, scale: 0.9 },
    { kitId: "iconbtn", x: 1680, y: 60, scale: 0.9 },
    { kitId: "notifydot", x: 1640, y: 48, scale: 0.9 },
  ] },
  "FPS HUD": { bg: "/backdrops/fps-ruins.jpg", items: [
    { kitId: "reticle", x: 870, y: 450 },
    { kitId: "lives", x: 90, y: 55, scale: 0.85 },
    { kitId: "capturemeter", x: 760, y: 50, scale: 0.9 },
    { kitId: "minimap", x: 1540, y: 55, scale: 0.9 },
    { kitId: "killfeed", x: 1330, y: 400, scale: 0.85 },
    { kitId: "weaponwheel", x: 700, y: 560, scale: 0.7 },
    { kitId: "progress", x: 70, y: 890 },
    { kitId: "hotbar", x: 430, y: 905, scale: 0.85 },
    { kitId: "ammo", x: 1500, y: 860 },
    { kitId: "dmgnumber", x: 1060, y: 330, scale: 0.85 },
  ] },
  "Arena HUD": { items: [
    { kitId: "vsbar", x: 430, y: 40, scale: 0.9 },
    { kitId: "scorebug", x: 820, y: 170, scale: 0.85 },
    { kitId: "minimap", x: 1540, y: 130, scale: 0.9 },
    { kitId: "streakmeter", x: 60, y: 300, scale: 0.85 },
    { kitId: "joystick", x: 110, y: 600 },
    { kitId: "hotbar", x: 510, y: 890, scale: 0.9 },
    { kitId: "respawn", x: 780, y: 470, scale: 0.9 },
    { kitId: "iconbtn", x: 1720, y: 620, scale: 0.85 },
  ] },
  "RPG quest": { bg: "/backdrops/strategy-keep.jpg", items: [
    { kitId: "nameplate", x: 60, y: 50, scale: 0.9 },
    { kitId: "partyframe", x: 60, y: 210, scale: 0.85 },
    { kitId: "waypoint", x: 880, y: 40, scale: 0.85 },
    { kitId: "questpanel", x: 1290, y: 130, scale: 0.8 },
    { kitId: "loottag", x: 620, y: 430, scale: 0.85 },
    { kitId: "dialoguebox", x: 430, y: 700, scale: 0.9 },
    { kitId: "xpbar", x: 560, y: 950, scale: 0.9 },
  ] },
  "Tavern hub": { bg: "/backdrops/tavern.jpg", items: [
    { kitId: "header", x: 560, y: 40 },
    { kitId: "avatarframe", x: 60, y: 44, scale: 0.85 },
    { kitId: "currency", x: 1550, y: 50, scale: 0.85 },
    { kitId: "primary", x: 740, y: 500 },
    { kitId: "friendrow", x: 1280, y: 290, scale: 0.85 },
    { kitId: "friendrow", x: 1280, y: 420, scale: 0.85 },
    { kitId: "clancrest", x: 1340, y: 560, scale: 0.8 },
    { kitId: "chatbubble", x: 240, y: 560, scale: 0.85 },
    { kitId: "dialoguebox", x: 430, y: 760, scale: 0.9 },
  ] },
  "Card table": { bg: "/backdrops/valley.jpg", items: [
    { kitId: "scorebug", x: 780, y: 40, scale: 0.85 },
    { kitId: "chip", x: 90, y: 60, scale: 0.9 },
    { kitId: "cardback", x: 540, y: 280, scale: 0.9 },
    { kitId: "cardback", x: 810, y: 260, scale: 0.9 },
    { kitId: "pack", x: 1180, y: 260, scale: 0.9 },
    { kitId: "endturn", x: 1560, y: 830, scale: 0.9 },
    { kitId: "avatarframe", x: 70, y: 820, scale: 0.85 },
  ] },
  "Open world": { bg: "/backdrops/city-streets.jpg", items: [
    { kitId: "chip", x: 70, y: 50, scale: 0.9 },
    { kitId: "waypoint", x: 850, y: 40, scale: 0.85 },
    { kitId: "currency", x: 1550, y: 50, scale: 0.85 },
    { kitId: "toast", x: 1200, y: 170, scale: 0.85 },
    { kitId: "buffframe", x: 70, y: 560, scale: 0.85 },
    { kitId: "minimap", x: 70, y: 730, scale: 0.95 },
    { kitId: "compass", x: 620, y: 935, scale: 0.9 },
  ] },
  "Racing HUD": { items: [
    { kitId: "circuit", x: 60, y: 80 },
    { kitId: "leaderboard", x: 1460, y: 30, scale: 0.8 },
    { kitId: "telemetry", x: 1450, y: 330, scale: 0.85 },
    { kitId: "laptimes", x: 60, y: 620, scale: 0.9 },
    { kitId: "tacho", x: 1290, y: 620, scale: 1.05 },
  ] },
  "Versus": { items: [
    { kitId: "vsbar", x: 460, y: 60 },
    { kitId: "badge", x: 480, y: 300, scale: 0.9 },
    { kitId: "badge", x: 1260, y: 300, scale: 0.9 },
    { kitId: "bignum", x: 770, y: 420, scale: 1.1 },
    { kitId: "primary", x: 700, y: 790, scale: 1.05 },
  ] },
  /* the owner: "let's have a match 3 mobile template in the dropdown that
     populates the correct match 3 layout" — the real portrait shape: kit
     header (moves + timer + goal bar), the 7×9 tile grid, boosters at the
     thumb line. Released with the set (owner order, 2026-08-21). */
  "Match-3 (mobile)": { aspect: "mobile", items: [
    { kitId: "movecounter", x: 10, y: 30, scale: 0.38 },
    { kitId: "stopwatch", x: 286, y: 26, scale: 0.3 },
    { kitId: "segbar", x: 86, y: 118, scale: 0.3 },
    ...M3_GRID,
    { kitId: "booster", x: 42, y: 730, scale: 0.45 },
    { kitId: "booster", x: 148, y: 730, scale: 0.45 },
    { kitId: "booster", x: 254, y: 730, scale: 0.45 },
  ] },
  "RPG party": { items: [
    { kitId: "header", x: 560, y: 30 },
    { kitId: "datarow", x: 120, y: 350, scale: 0.9 },
    { kitId: "datarow", x: 120, y: 515, scale: 0.9 },
    { kitId: "datarow", x: 120, y: 680, scale: 0.9 },
    { kitId: "panel", x: 1220, y: 340, scale: 0.75 },
    ...[0, 1, 2, 3].map((i) => ({ kitId: "slot" as KitComponentId, x: 1220 + i * 165, y: 810, scale: 0.8 })),
    { kitId: "small", x: 70, y: 60 },
  ] },
  "Inventory": { items: [
    { kitId: "resource", x: 70, y: 55 },
    { kitId: "chip", x: 640, y: 70, scale: 0.85 },
    { kitId: "chip", x: 870, y: 70, scale: 0.85 },
    { kitId: "chip", x: 1100, y: 70, scale: 0.85 },
    ...([0, 1, 2] as const).flatMap((r) => [0, 1, 2, 3].map((c) => (
      { kitId: "slot" as KitComponentId, x: 640 + c * 180, y: 240 + r * 180, scale: 0.9 }
    ))),
    { kitId: "rarityframe", x: 1450, y: 240, scale: 0.8 },
    { kitId: "small", x: 1450, y: 700 },
  ] },
  "Level select": { items: [
    { kitId: "header", x: 560, y: 60 },
    { kitId: "ring", x: 60, y: 55, scale: 0.8 },
    { kitId: "iconbtn", x: 1680, y: 60, scale: 0.9 },
    ...[0, 1, 2, 3, 4].map((i) => ({ kitId: "slot" as KitComponentId, x: 460 + i * 210, y: 380, scale: 0.95 })),
    { kitId: "seasontrack", x: 480, y: 640, scale: 0.85 },
    { kitId: "primary", x: 700, y: 800 },
  ] },
  "Victory": { items: [
    { kitId: "header", x: 520, y: 110, scale: 1.1 },
    { kitId: "achievetoast", x: 1230, y: 130, scale: 0.85 },
    { kitId: "orb", x: 600, y: 450, scale: 0.9 },
    { kitId: "bignum", x: 770, y: 440 },
    { kitId: "orb", x: 1230, y: 450, scale: 0.9 },
    { kitId: "starrating", x: 800, y: 640, scale: 0.9 },
    { kitId: "primary", x: 700, y: 780, scale: 1.05 },
  ] },
  "Settings": { items: [
    { kitId: "header", x: 620, y: 30, scale: 0.9 },
    { kitId: "searchfield", x: 640, y: 230, scale: 0.9 },
    { kitId: "setrow", x: 640, y: 380, scale: 0.9 },
    { kitId: "slider", x: 640, y: 520 },
    { kitId: "segment", x: 640, y: 660, scale: 0.9 },
    { kitId: "dropdown", x: 1240, y: 380, scale: 0.8 },
    { kitId: "checkbox", x: 1310, y: 550 },
    { kitId: "toggle", x: 700, y: 800 },
    { kitId: "toggle", x: 1000, y: 800 },
    { kitId: "small", x: 1330, y: 710 },
  ] },
};

const STAGE: Record<"169" | "mobile", [number, number, string]> = {
  "169": [1920, 1080, "16:9"],
  mobile: [390, 844, "Mobile"],
};

const clone = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;

/* Paste-a-URL video backdrops: vet the link BEFORE the board takes it.
   https only, embeds turned away by name, then a real load test — the
   metadata handshake proves it's a direct video file, not a page. */
const checkVideoUrl = async (raw: string): Promise<{ url?: string; err?: string }> => {
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) return { err: "Paste a full https:// link." };
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return { err: "YouTube / Vimeo pages can't sit under the pieces — paste a direct .mp4 or .webm file link instead." };
  const ok = await new Promise<boolean>((res) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "metadata";
    const t = window.setTimeout(() => res(false), 8000);
    v.onloadedmetadata = () => { window.clearTimeout(t); res(true); };
    v.onerror = () => { window.clearTimeout(t); res(false); };
    v.src = url;
  });
  return ok ? { url } : { err: "That link didn't play — it needs to be a direct video file (.mp4 / .webm), not a page or an embed." };
};

/* Overlay tint per mode — shared by the live stage and the PNG export so
   what ships is exactly what the artboard showed. */

/* The bar family stretches HORIZONTALLY, 9-slice style (owner): the side
   handles re-render the track wider — caps, knob and inset stay true —
   while corners keep proportional scale. Only these components. */
const STRETCHABLE = new Set<string>(["slider", "progress", "emblembar", "segbar", "vsbar", "panel"]);
/* Blank panels stretch BOTH ways (owner: "two modes — 9-slice stretchable
   and scale... just the blank panels for now"): top/bottom handles pull the
   height, left/right the width, corners keep proportional scale. */
const STRETCHABLE_V = new Set<string>(["panel", "scrollbar"]);

const OV_TINT: Record<string, string> = { dark: "#060A14", light: "#F4F6FF" };
const ovBackground = (mode: string): string =>
  mode === "vignette"
    ? "radial-gradient(ellipse at 50% 42%, rgba(4,7,14,0) 34%, rgba(4,7,14,0.92) 100%)"
    : OV_TINT[mode] ?? "transparent";

/* Center scrim — the vignette's inverse: games dim the MIDDLE of the frame
   behind menus so the UI pops off a busy scene (owner: "subtly darken the
   middle"). Independent of the overlay mode, so it stacks on a vignette,
   rides any tint, or works alone. Ellipse 62% × 62% at 50% 46%, mirrored
   exactly in the PNG export below. */
const CENTER_SCRIM = "radial-gradient(62% 62% at 50% 46%, rgba(4,7,14,0.85) 0%, rgba(4,7,14,0.5) 45%, rgba(4,7,14,0) 100%)";

/* ── The background library: 82 owner-curated scenes, search-first ────
   Thumbs ship with the app (public/bg-thumbs); a click applies the
   full-res WebP straight from the Supabase "backgrounds" bucket — the
   board stores that URL, never pixels, so the document stays skinny and
   the darkroom/overlays work exactly as they do on uploads. STAGED:
   admins only until the owner releases it (standing rule); also absent
   when the app runs without cloud config (no bucket to serve from). */
function BackdropLibrary({ aspect, current, apply }: {
  aspect: "169" | "mobile";
  current: string | null | undefined;
  apply: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  /* a scene that never arrives (bucket missing, file missing, offline)
     must SAY so — the stage shows nothing and every dial looks broken */
  const [loadErr, setLoadErr] = useState(false);
  const applyChecked = (url: string) => {
    apply(url); // optimistic — the stage streams it the moment it exists
    const probe = new Image();
    probe.onload = () => setLoadErr(false);
    probe.onerror = () => setLoadErr(true);
    probe.src = url;
  };
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // the active board's orientation leads: 16:9 boards surface landscape
  // scenes first, mobile boards portrait — never hides the rest
  const landFirst = aspect === "169";
  const list = BACKDROP_LIBRARY
    .filter((e) => (!cat || e.cat === cat) && words.every((w) => e.hay.includes(w)))
    .sort((a, b) => (a.land === b.land ? 0 : a.land === landFirst ? -1 : 1));
  const CAP = 18;
  const shown = showAll ? list : list.slice(0, CAP);
  return (
    <div className="bd-lib">
      <div className="bd-h" style={{ marginTop: 14 }}>Scene library <span className="bd-lib-staged" title="Visible to admins only until released">staged</span></div>
      <div className="bd-libsearch">
        <Search size={13} strokeWidth={2.2} />
        <input value={q} placeholder="Search 82 scenes — cozy kitchen, neon, battle…" aria-label="Search the scene library"
          onChange={(e) => { setQ(e.target.value); setShowAll(false); }} />
        {q && <button aria-label="Clear search" onClick={() => setQ("")}><X size={12} strokeWidth={2.4} /></button>}
      </div>
      <div className="bd-libchips" role="tablist" aria-label="Scene categories">
        <button role="tab" className={cat === null ? "on" : ""} aria-selected={cat === null} onClick={() => { setCat(null); setShowAll(false); }}>All</button>
        {BACKDROP_CATEGORIES.map((c) => (
          <button key={c} role="tab" className={cat === c ? "on" : ""} aria-selected={cat === c}
            onClick={() => { setCat(cat === c ? null : c); setShowAll(false); }}>{c.replace(" & ", " · ")}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="bd-note">No scene matches — try fewer words, or another genre.</div>
      ) : (
        <div className="bd-bggrid bd-libgrid" aria-label="Library scenes">
          {shown.map((e) => {
            const url = backdropUrl(e.id);
            if (!url) return null;
            return (
              <button key={e.id} className={`bd-bgthumb${e.land ? "" : " tall"}`} title={`${e.title} · ${e.cat}`}
                aria-pressed={current === url}
                onClick={() => applyChecked(url)}>
                <img src={backdropThumb(e.id)} alt={e.title} loading="lazy" />
                <i><b style={{ background: e.dot }} />{e.title}</i>
              </button>
            );
          })}
        </div>
      )}
      {list.length > CAP && !showAll && (
        <button className="bd-libmore" onClick={() => setShowAll(true)}>Show all {list.length}</button>
      )}
      {loadErr && (
        <div className="bd-note bd-vurl-err" role="alert">
          <span>That scene didn't arrive from the cloud. If the storage bucket isn't set up yet: Supabase dashboard → Storage → new <b>public</b> bucket named exactly <b>backgrounds</b>, then drag the 82 .webp files in — the boards light up instantly, no redeploy.</span>
        </div>
      )}
      <div className="bd-note">Scenes stream from the cloud — your board saves a link, never the pixels.</div>
    </div>
  );
}

/* one idle-slice callback with a working-anyway timeout fallback; returns
   the cleanup (the active-board-first mounting round's shared scheduler) */
function idleOnce(fn: () => void): () => void {
  type IdleWin = Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  const w = window as IdleWin;
  let dead = false;
  const run = () => { if (!dead) fn(); };
  const h = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 900 }) : window.setTimeout(run, 130);
  return () => { dead = true; if (w.cancelIdleCallback) w.cancelIdleCallback(h as number); else window.clearTimeout(h as number); };
}

/* ── the backdrop never gates the pieces (owner's empty-frame round,
   2026-08-25) ── a hydrating board mounts its ITEMS immediately — kit SVGs
   render synchronously and glyph thumbs are ~3KB, usually cached — while
   the backdrop scene (often the heaviest bytes on the board) streams in
   and FADES up when its pixels are ready instead of popping in whenever
   the bytes land. Pieces on the navy stage beat an empty frame. A URL
   that has loaded once is remembered for the page's life, so re-renders,
   board switches and darkroom dial drags never re-fade (the no-flicker
   contract); the dial opacity stays inline on the layers themselves —
   the fade lives on a wrapper, so dragging Opacity is never eased. */
const bgArrived = new Set<string>();
function useBgArrival(url: string | null | undefined): boolean {
  const [ready, setReady] = useState(() => !url || bgArrived.has(url));
  useEffect(() => {
    if (!url || bgArrived.has(url)) { setReady(true); return; }
    setReady(false);
    let dead = false;
    const done = () => { bgArrived.add(url); if (!dead) setReady(true); };
    const im = new Image();
    im.onload = done;
    im.onerror = done; // a broken scene must not hold the stage dark
    im.src = url;
    return () => { dead = true; };
  }, [url]);
  return ready;
}
function BoardBackdrop({ bd }: { bd: BoardDef }) {
  const ready = useBgArrival(bd.bgImage);
  if (!bd.bgImage || !(bd.bgShow ?? true)) return null;
  const op = (bd.bgOpacity ?? 100) / 100;
  const filter = boardBgFilter(bd);
  return (
    <div className={`bd-bgin${ready ? " ready" : ""}`}>
      {bd.bgFit === "fit" ? (
        /* Fit: the WHOLE scene, over a blurred fill of itself — for scenes
           whose aspect isn't the board's (owner: portrait 9:16 art read
           "too big" on the 9:19.5 mobile stage under cover's zoom-and-crop) */
        <>
          <div className="bd-bg bd-bgblur" style={{ backgroundImage: `url(${bd.bgImage})`, opacity: op, filter: [filter, "blur(26px) brightness(0.72)"].filter(Boolean).join(" ") }} />
          <div className="bd-bg bd-bgfit" style={{ backgroundImage: `url(${bd.bgImage})`, opacity: op, filter }} />
        </>
      ) : (
        <div className="bd-bg" style={{ backgroundImage: `url(${bd.bgImage})`, opacity: op, filter }} />
      )}
    </div>
  );
}

export function BoardView({ playing }: { playing: boolean }) {
  const {
    cfg, boards, activeBoard, library, kitClones, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitNoText, kitVals, kitRow, kitBar, kitTextOy, kitTextOx, kitSlotVals, kitSubs,
    setActiveBoard, addBoard, addBoardAfter, removeBoard, duplicateBoard, renameBoard, moveBoard, clearBoard, setBoardBg,
    setBoardAspect, boardSnap, setBoardSnap, boardSafe, setBoardSafe, boardSel, setBoardSel, zoom,
    addToBoard, addKitToBoard, moveBoardItem, scaleBoardItem, rotateBoardItem, removeBoardItem,
    duplicateBoardItem, componentReleases, isAdmin, tier,
    applyBoardItemPatches, removeBoardItems, transformBoardItems,
    userAssets, addUserAssetToBoard, boardShadowLast,
  } = useGen();
  /* ── the Gate Round's two board rules (owner mandate, 2026-08-17) ──
     · exports (board PNG, piece SVG/PNG) are paid — these composites
       render entirely in the browser, so the gate is client-side by
       nature; the modal carries the pitch (sign-up for guests, Pro +
       the free Unity test kit for accounts).
     · guests get exactly ONE board — the second add opens the sign-up
       pitch instead. Existing extra boards keep working; only ADDING
       is gated, so nobody's saved desk is wrecked by the flip. */
  const paidTier = tier === "student" || tier === "pro";
  const guardExport = (run: () => void) => { if (paidTier) run(); else openGate("export"); };
  const guardAddBoard = (run: () => void) => {
    if (tier === "guest" && useGen.getState().boards.length >= 1) { openGate("board"); return; }
    run();
  };
  /* ── starter landing (owner design, field notes #3: "would be nice if it
     asked me") ── picking a starter on a board that already has pieces no
     longer piles on silently: a small modal offers Fresh board / Replace
     this board's pieces / Add on top. Replace KEEPS the board's own
     backdrop — that was the owner's whole concern; a board with no
     backdrop borrows the starter's. */
  const [starterAsk, setStarterAsk] = useState<string | null>(null);
  /* ── mobile retune (owner, field notes #3: the older starters were
     16:9-fixed) ── a 16:9-composed starter dealt onto a MOBILE frame
     reflows to the 390×844 stage the way the Match-3 template was
     hand-composed for it: positions map into the portrait frame, piece
     scale steps down to phone proportion, and a settle pass measures
     the real dealt art and pulls anything oversized or out-of-frame
     back inside (shrink to fit, 12px margins). */
  const MOBILE_DEAL_K = 0.62;
  const dealStarterItems = (t: Tpl, bdId: string) => {
    const st = useGen.getState();
    const bd = st.boards.find((b) => b.id === bdId);
    const retune = bd?.aspect === "mobile" && t.aspect !== "mobile";
    const [SW, SH] = STAGE["169"], [TW, TH] = STAGE.mobile;
    const items = retune
      ? t.items.map((it) => ({
          ...it,
          x: Math.round((it.x / SW) * TW),
          y: Math.round((it.y / SH) * TH),
          scale: +(((it.scale ?? 1) * MOBILE_DEAL_K).toFixed(2)),
        }))
      : t.items;
    const before = bd?.items.length ?? 0;
    st.addBoardItems(items);
    if (retune) window.setTimeout(() => fitMobileDeal(bdId, before), 550);
  };
  const fitMobileDeal = (bdId: string, fromIndex: number) => {
    const st = useGen.getState();
    const bd = st.boards.find((b) => b.id === bdId);
    if (!bd) return;
    const [TW, TH] = STAGE[bd.aspect];
    const M = 12;
    const patches: { id: string; scale: number; x: number; y: number }[] = [];
    for (const it of bd.items.slice(fromIndex)) {
      const r = artRectOf(bdId, it);
      if (!r || !r.w || !r.h) continue;
      const s = it.scale ?? 1;
      const f = Math.min(1, (TW - M * 2) / r.w, (TH - M * 2) / r.h);
      // art scales about the item origin — predict the shrunk shell, then
      // clamp it into the frame
      const l2 = it.x + (r.l - it.x) * f, t2 = it.y + (r.t - it.y) * f;
      const w2 = r.w * f, h2 = r.h * f;
      let dx = 0, dy = 0;
      if (l2 < M) dx = M - l2; else if (l2 + w2 > TW - M) dx = TW - M - (l2 + w2);
      if (t2 < M) dy = M - t2; else if (t2 + h2 > TH - M) dy = TH - M - (t2 + h2);
      if (f < 1 || dx || dy) patches.push({ id: it.id, scale: +(s * f).toFixed(3), x: Math.round(it.x + dx), y: Math.round(it.y + dy) });
    }
    if (patches.length) st.transformBoardItems("mobiledeal", patches);
  };
  const applyStarter = (tname: string, mode: "fresh" | "replace" | "stack") => {
    const t = BOARD_TEMPLATES[tname];
    if (!t) return;
    const st = useGen.getState();
    if (mode === "fresh") {
      // a new board takes the starter whole at its NATIVE aspect —
      // backdrop included
      st.addBoardAfter(st.activeBoard, { aspect: t.aspect ?? "169" });
      dealStarterItems(t, useGen.getState().activeBoard);
      if (t.bg) st.setBoardBg({ bgImage: t.bg, bgVideo: null, bgShow: true });
      return;
    }
    const bd = st.boards.find((b) => b.id === st.activeBoard);
    if (mode === "replace" && bd) st.removeBoardItems(bd.items.map((i) => i.id));
    // a MOBILE-specific template still retunes the board first (the
    // Match-3 grid is composed for the 390×844 portrait); a 16:9-composed
    // starter dealt onto a mobile board reflows instead of flipping it
    if (t.aspect && bd?.aspect !== t.aspect) st.setBoardAspect(t.aspect);
    dealStarterItems(t, st.activeBoard);
    if (t.bg && (mode === "stack" || !(bd?.bgImage || bd?.bgVideo))) st.setBoardBg({ bgImage: t.bg, bgVideo: null, bgShow: true });
  };
  const [q, setQ] = useState("");
  /* ── active-board-first mounting (owner, after the raster-tier round:
     "that first click still takes awhile.. I'd love for the boards to
     load faster") ── measured on a prod build (6 boards, 42 kit pieces +
     20 big glyphs, throttled 12Mbps/60ms, 4× CPU): the old
     mount-everything desk spent one 3.5s task rendering every board's
     SVG art before ANYTHING painted, and pulled every offscreen board's
     backdrop (0.8MB + a 1.9MB video) alongside the active board's own
     art. Now the ACTIVE board mounts its full stage immediately and the
     rest join one per idle slice, nearest row-neighbors first — each
     sleeping board holds a dimmed empty frame at exact stage size so the
     desk's geometry never shifts. Once a board hydrates it STAYS
     hydrated for the life of the desk (the never-refetch property):
     the set only grows, so board switches after first visit stay
     instant. Exports never wait on this — exportPng composes from
     state, not the mounted DOM. */
  const [hydrated, setHydrated] = useState<Set<string>>(() => new Set());
  /* on-screen boards hydrate FIRST (owner bug, 2026-08-25: with several
     boards in view — mobiles sit three to a row — the nearest-to-active
     order could spend its early slices on boards past the fold while
     boards the owner was LOOKING at sat as empty frames "for awhile").
     An IntersectionObserver on the board sections keeps a live set of
     viewport-intersecting ids (seeded synchronously so the first idle
     slice already knows the fold); the sweep drains that set top-down
     before the rest. Everything else holds: active board first, one
     board per idle slice, hydrated-forever. */
  const visRef = useRef<Set<string>>(new Set());
  const [visTick, setVisTick] = useState(0);
  const boardIdsKey = boards.map((b) => b.id).join("|");
  useEffect(() => {
    const root = frameRef.current;
    if (!root) return;
    const sections = () => [...root.querySelectorAll<HTMLElement>("section[data-board]")];
    /* zero margin, on purpose: even a sliver of a board peeking at the
       fold showed EMPTY in the owner's screenshot, so any true
       intersection counts — but no lookahead, or a whole second row
       ties as "visible" and the tie-break re-creates the old order */
    const seed = new Set<string>();
    const rr = root.getBoundingClientRect();
    for (const el of sections()) {
      const r = el.getBoundingClientRect();
      if (el.dataset.board && r.bottom > rr.top && r.top < rr.bottom) seed.add(el.dataset.board);
    }
    visRef.current = seed;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      let changed = false;
      for (const en of entries) {
        const id = (en.target as HTMLElement).dataset.board;
        if (!id || en.isIntersecting === visRef.current.has(id)) continue;
        changed = true;
        if (en.isIntersecting) visRef.current.add(id); else visRef.current.delete(id);
      }
      if (changed) setVisTick((t) => t + 1);
    }, { root });
    for (const el of sections()) io.observe(el);
    return () => io.disconnect();
  }, [boardIdsKey]);
  useEffect(() => {
    const ids = boards.map((b) => b.id);
    const ai = Math.max(0, ids.indexOf(activeBoard));
    const vis = visRef.current;
    const pending = ids
      .filter((id) => id !== activeBoard && !hydrated.has(id))
      .sort((a, b) => {
        const va = vis.has(a), vb = vis.has(b);
        if (va !== vb) return va ? -1 : 1;           // on-screen beats off-screen
        if (va) return ids.indexOf(a) - ids.indexOf(b); // on-screen fills top-down
        return Math.abs(ids.indexOf(a) - ai) - Math.abs(ids.indexOf(b) - ai);
      });
    if (!pending.length) return;
    // one board per idle slice — the effect re-runs and schedules the next
    return idleOnce(() => setHydrated((s) => new Set(s).add(pending[0])));
  }, [boards, activeBoard, hydrated, visTick]);
  /* one paint BEAT before any board art commits (the kit curtain's
     chapters-behind-the-curtain pattern): the desk chrome and the dimmed
     stage frames paint instantly, the boards curtain gets its slot, and
     THEN the active board's heavy art render runs. Without the beat the
     first commit is one long task and nothing — feedback included —
     can paint until it ends (the silent gap the owner reported). */
  const [artBeat, setArtBeat] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setArtBeat(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  /* the left tray's full-catalog thumbs (~a hundred renderKit calls in the
     `assets` memo below) used to compute inside the FIRST desk render,
     ahead of the active board's own paint. They wait one idle beat behind
     it now: desk and active board first, the catalog pops in right after.
     Same measured round as the hydration sweep above. */
  const [trayReady, setTrayReady] = useState(false);
  useEffect(() => idleOnce(() => setTrayReady(true)), []);
  // rolling over a tray thumbnail previews the asset large in a viewport
  const [preview, setPreview] = useState<{ name: string; svg: string } | null>(null);
  /* in-place words: the item whose text is being edited on the stage
     (owner: "I need a way to edit the text here on in the right menu" —
     this is the "here"). Double-click opens it; Enter/Escape/blur close.
     Edits commit live through the same setters the panel uses, so the
     board undo lane and persistence are identical either way. */
  const [textEdit, setTextEdit] = useState<string | null>(null);
  // paste-a-URL video backdrop
  const [vidUrl, setVidUrl] = useState("");
  const [vidBusy, setVidBusy] = useState(false);
  const [vidErr, setVidErr] = useState<string | null>(null);
  /* a video backdrop mints a POSTER — its first frame, vaulted like an
     uploaded image (owner: "a screenshot of the first frame so that
     there is a background of some sort"). The still travels everywhere
     the video can't — the saved project, another machine, the Unity
     scene — and the playing video sits above it here. A CORS-shy remote
     host just skips the poster; the video keeps working. */
  const setVideoBg = (url: string, name: string) => {
    const bid = useGen.getState().activeBoard;
    setBoardBg({ bgVideo: url, bgImage: null, bgShow: true });
    void captureVideoPoster(url).then(async (blob) => {
      if (!blob) return;
      const assetId = await importBgAsset(blob, name);
      if (assetId && useGen.getState().activeBoard === bid) setBoardBg({ bgVideo: url, bgImage: null, bgAssetId: assetId, bgShow: true });
    });
  };
  const applyVideoUrl = async () => {
    setVidErr(null); setVidBusy(true);
    const r = await checkVideoUrl(vidUrl);
    setVidBusy(false);
    if (r.err) { setVidErr(r.err); return; }
    setVideoBg(r.url!, "video poster");
    setVidUrl("");
  };
  // session object URLs die with the tab — restore them from the vault
  useEffect(() => { void rehydrateBoardBgs(); }, []);
  // the asset tray and rollover preview are catalogs, never stages — their
  // SMIL loops (damage floats, radar pulses) hold a settled frame
  useEffect(() => {
    stillSmil(document.querySelector(".bd-assets"), true);
    stillSmil(document.querySelector(".bd-preview"), true);
  });
  /* resizable trays (owner: "stretch the left and right trays to my
     liking — a little"). Widths ride CSS vars with hard clamps baked into
     the grid template, so no drag can break the stage; the choice persists
     per browser. */
  const [trayW, setTrayW] = useState<{ l: number; r: number }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("ui-generator-traywidths") || "null");
      if (v && typeof v.l === "number" && typeof v.r === "number") return { l: v.l, r: v.r };
    } catch { /* private mode */ }
    return { l: 238, r: 270 };
  });
  const trayDrag = useRef<{ side: "l" | "r"; x0: number; w0: number } | null>(null);
  const clampTray = (side: "l" | "r", w: number) => (side === "l" ? Math.max(200, Math.min(400, w)) : Math.max(230, Math.min(420, w)));
  const gripDown = (side: "l" | "r") => (e: React.PointerEvent) => {
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* uncaptured drag still works */ }
    trayDrag.current = { side, x0: e.clientX, w0: trayW[side] };
  };
  const gripMove = (e: React.PointerEvent) => {
    const d = trayDrag.current;
    if (!d) return;
    if (!(e.buttons & 1)) { trayDrag.current = null; return; }
    const dx = e.clientX - d.x0;
    const w = clampTray(d.side, d.side === "l" ? d.w0 + dx : d.w0 - dx);
    setTrayW((prev) => {
      const next = { ...prev, [d.side]: w };
      try { localStorage.setItem("ui-generator-traywidths", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  const gripUp = () => { trayDrag.current = null; };
  const act = boards.find((b) => b.id === activeBoard) ?? boards[0];
  const frameRef = useRef<HTMLDivElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  /* My assets (user logos): the drawer's upload door + its last refusal */
  const uaInput = useRef<HTMLInputElement>(null);
  const [uaErr, setUaErr] = useState<string | null>(null);
  const [uaBusy, setUaBusy] = useState(false);
  const dragRef = useRef<{ list: { id: string; ox: number; oy: number; cox: number; coy: number }[]; dx: number; dy: number; fit: number } | null>(null);
  const [frameW, setFrameW] = useState(900);

  /* multi-select (owner): shift-click extends within ONE board. boardSel
     stays the primary; the extras ride alongside. Group drags, arrow-key
     nudges, copy/paste and align all act on the whole set. */
  const [selExtra, setSelExtra] = useState<string[]>([]);
  const selIdsAll = useMemo(() => (boardSel ? [boardSel, ...selExtra] : []), [boardSel, selExtra]);
  const selIdsRef = useRef<string[]>([]);
  selIdsRef.current = selIdsAll;
  // the board clipboard — plain cloned items; paste re-identifies onto the ACTIVE board
  const clipRef = useRef<BoardItem[]>([]);
  useEffect(() => {
    // selection hygiene: extras die with the primary, and with deleted pieces
    if (!boardSel) { if (selIdsRef.current.length > 1) setSelExtra([]); return; }
    const alive = new Set(boards.flatMap((bd) => bd.items).map((b) => b.id));
    setSelExtra((xs) => {
      const next = xs.filter((x) => alive.has(x) && x !== boardSel);
      return next.length === xs.length ? xs : next;
    });
  }, [boardSel, boards]);
  const pickPiece = (bdId: string, id: string, shift: boolean) => {
    setActiveBoard(bdId);
    if (shift && boardSel && boardSel !== id) {
      const primaryBd = boards.find((x) => x.items.some((b) => b.id === boardSel));
      if (primaryBd?.id === bdId) {
        setSelExtra((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
        return;
      }
    }
    if (boardSel !== id) setBoardSel(id);
    if (!shift) setSelExtra([]);
  };
  /* align & distribute (owner). Bounds come from each piece's on-screen
     selection box — the shell-hugging one — so both answer to what the
     eye sees, not to glow padding. */
  const measureSel = () => {
    const bd = boards.find((x) => x.items.some((b) => b.id === boardSel));
    if (!bd) return null;
    const canvas = document.querySelector(`[data-board="${bd.id}"] .bd-canvas`);
    if (!canvas) return null;
    const cr = canvas.getBoundingClientRect();
    const f = fitOf(bd);
    return selIdsAll.flatMap((id) => {
      const host = canvas.querySelector(`[data-bid="${id}"]`);
      const it = bd.items.find((b) => b.id === id);
      if (!host || !it) return [];
      const r = (host.querySelector(".board-selbox") ?? host).getBoundingClientRect();
      return [{ it, l: (r.left - cr.left) / f, t: (r.top - cr.top) / f, w: r.width / f, h: r.height / f }];
    });
  };
  const alignSel = (edge: "left" | "centerh" | "right" | "top" | "middlev" | "bottom") => {
    const rects = measureSel();
    if (!rects || rects.length < 2) return;
    const minL = Math.min(...rects.map((r) => r.l)), maxR = Math.max(...rects.map((r) => r.l + r.w));
    const minT = Math.min(...rects.map((r) => r.t)), maxB = Math.max(...rects.map((r) => r.t + r.h));
    applyBoardItemPatches("align", rects.map(({ it, l, t, w, h }) => {
      const dx = edge === "left" ? minL - l : edge === "right" ? maxR - (l + w) : edge === "centerh" ? (minL + maxR) / 2 - (l + w / 2) : 0;
      const dy = edge === "top" ? minT - t : edge === "bottom" ? maxB - (t + h) : edge === "middlev" ? (minT + maxB) / 2 - (t + h / 2) : 0;
      return { id: it.id, x: Math.round(it.x + dx), y: Math.round(it.y + dy) };
    }));
  };
  /* the GROUP transform box (owner: "scale multiple objects at once") —
     a dashed frame hugging the whole selection, with corner handles that
     scale every piece about the opposite corner. Geometry is measured
     from the same shell-hugging selection boxes as align/distribute,
     after each commit, so the frame follows drags, nudges and the scale
     gesture itself live. */
  const [grpBox, setGrpBox] = useState<{ bd: string; l: number; t: number; w: number; h: number } | null>(null);
  const grsz = useRef<{ x0: number; y0: number; ax: number; ay: number; hpx: number; hpy: number; fMin: number; fMax: number; pieces: { id: string; s0: number; px: number; py: number }[] } | null>(null);
  useEffect(() => {
    if (selIdsAll.length < 2) { setGrpBox((g) => (g ? null : g)); return; }
    const bd = boards.find((x) => x.items.some((b) => b.id === boardSel));
    const rects = bd ? measureSel() : null;
    if (!bd || !rects || rects.length < 2) { setGrpBox((g) => (g ? null : g)); return; }
    const l = Math.min(...rects.map((r) => r.l)), t = Math.min(...rects.map((r) => r.t));
    const w = Math.max(...rects.map((r) => r.l + r.w)) - l, h = Math.max(...rects.map((r) => r.t + r.h)) - t;
    setGrpBox((g) => (g && g.bd === bd.id && Math.abs(g.l - l) < 0.5 && Math.abs(g.t - t) < 0.5 && Math.abs(g.w - w) < 0.5 && Math.abs(g.h - h) < 0.5 ? g : { bd: bd.id, l, t, w, h }));
  }); // measured from the DOM — runs after every commit, self-limits via the equality guard
  /* distribute: equal GAPS along the axis, first and last pieces planted —
     the standard distribute-spacing move. Overlapping pieces just get
     negative gaps, which still spreads them sensibly. */
  const distributeSel = (axis: "h" | "v") => {
    const rects = measureSel();
    if (!rects || rects.length < 3) return;
    const sorted = [...rects].sort((a, b) => (axis === "h" ? a.l - b.l : a.t - b.t));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const span = axis === "h" ? last.l + last.w - first.l : last.t + last.h - first.t;
    const content = sorted.reduce((s, r) => s + (axis === "h" ? r.w : r.h), 0);
    const gap = (span - content) / (sorted.length - 1);
    let cursor = axis === "h" ? first.l : first.t;
    applyBoardItemPatches("distribute", sorted.map((r) => {
      const d = cursor - (axis === "h" ? r.l : r.t);
      cursor += (axis === "h" ? r.w : r.h) + gap;
      return { id: r.it.id, x: Math.round(r.it.x + (axis === "h" ? d : 0)), y: Math.round(r.it.y + (axis === "v" ? d : 0)) };
    }));
  };

  // stage scale follows the frame width — every artboard reads like a device
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const read = () => setFrameW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* ── rows: the desk is a stack of explicit rows. THE rule (owner:
     "let's just do 1 board per row unless it's mobile then we can do 3 —
     I can't have two big boards side by side"): a 16:9 board always
     stands alone at full size; only mobiles share a row, three at most.
     rowsOf NORMALIZES — a doc that carries an illegal mix (legacy data,
     an aspect flip mid-row) simply splits, so the desk can never show
     it. nl still forces a break. A row never scrolls sideways: its
     boards share the frame at one true scale, and the shared canvas
     zoom rides every gesture via the fit factor. */
  const rowsOf = (bs: BoardDef[]) => {
    const rows: BoardDef[][] = [];
    for (const b2 of bs) {
      const cur = rows[rows.length - 1];
      const joins = cur && !b2.nl && b2.aspect === "mobile"
        && cur.every((x) => x.aspect === "mobile") && cur.length < 3;
      if (joins) cur.push(b2); else rows.push([b2]);
    }
    return rows;
  };
  const rowFit = (row: BoardDef[]) => {
    const gaps = 20 * (row.length - 1);
    const sumW = row.reduce((a, b2) => a + STAGE[b2.aspect][0], 0);
    const hCap = Math.min(...row.map((b2) => 820 / STAGE[b2.aspect][1]));
    return Math.min((frameW - 56 - gaps) / sumW, hCap, 1) * zoom;
  };
  const fitOf = (bd: BoardDef) => rowFit(rowsOf(boards).find((r) => r.some((b2) => b2.id === bd.id)) ?? [bd]);

  /* keyboard: Delete removes the selection, Cmd+D duplicates, Cmd+Z / Shift+Cmd+Z
     undo/redo, Cmd+C / Cmd+V copy & paste (paste lands on the ACTIVE board, so
     it carries pieces between boards), arrows nudge — Shift makes them stride. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const st = useGen.getState();
      const ids = selIdsRef.current;
      const selItems = () => st.boards.flatMap((bd) => bd.items).filter((b) => ids.includes(b.id));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redoBoard(); else st.undoBoard();
      } else if (mod && e.key.toLowerCase() === "c" && ids.length) {
        // an honest copy: never hijack a real text-selection copy
        if (String(window.getSelection() ?? "").length) return;
        e.preventDefault();
        clipRef.current = structuredClone(selItems());
      } else if (mod && e.key.toLowerCase() === "v" && clipRef.current.length) {
        e.preventDefault();
        const fresh = st.pasteBoardItems(clipRef.current);
        setSelExtra(fresh.slice(1));
      } else if (mod && e.key.toLowerCase() === "d" && st.boardSel) {
        e.preventDefault();
        st.duplicateBoardItem(st.boardSel);
      } else if (mod && (e.key === "]" || e.key === "[") && st.boardSel) {
        e.preventDefault();
        st.reorderBoardItem(st.boardSel, e.key === "]" ? (e.shiftKey ? "front" : "forward") : (e.shiftKey ? "back" : "backward"));
      } else if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
        e.preventDefault();
        st.removeBoardItems(ids);
      } else if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && ids.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        st.applyBoardItemPatches(`nudge:${ids.join(",")}`,
          selItems().map((b) => ({ id: b.id, x: b.x + dx, y: b.y + dy })));
      } else if (e.key === "Escape" && st.boardSel) {
        // drop the selection without touching the piece
        st.setBoardSel(null);
        setSelExtra([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // asset thumbnails render tight (glow pads collapse) and follow the style;
  // staging-bay pieces show only to the admin until released
  const assets = useMemo(() => {
    if (!trayReady) return []; // catalog thumbs wait one idle beat behind the active board's paint
    const tc = clone(cfg);
    for (const s of Object.values(tc.states)) s.glow = 0;
    /* trophy/startlights are deregistered from the kit-page roster but the
       Board surfaces EVERYTHING (owner: "all kit elements… surface-able by
       search") — they still need honest display names here */
    const EXTRA_NAMES: Partial<Record<KitComponentId, string>> = { trophy: "Trophy cup", startlights: "Start lights" };
    const name = (id: KitComponentId) => KIT_COMPONENTS.find((c) => c.id === id)?.name ?? EXTRA_NAMES[id] ?? id;
    return ASSET_GROUPS.map((g) => ({
      name: g.name,
      // hay = everything search can land on: display name, id, group, synonyms
      items: g.ids.filter((entry) => kitVisible(entry.split("~")[0] as KitComponentId, componentReleases, isAdmin)).map((entry) => {
        const [bid, ov] = entry.split("~");
        const kid = bid as KitComponentId;
        const nm = ov ? `${name(kid)} · ${ov}` : name(kid);
        /* glyph thumbs wear their per-piece fork (the family is born with
           a flat factory design) — a walled tray thumb would promise a
           look that never lands on the board. Other stock thumbs stay the
           master-look catalog they've always been. */
        const gtc = kid.startsWith("glyph") ? applyKitDesign(tc, kitDesigns[kid]) : tc;
        return { id: entry, kitId: kid, ov, name: nm, hay: `${nm} ${entry} ${g.name} ${SEARCH_TERMS[kid] ?? ""}${ov ? ` ${ov} overlay` : ""}`.toLowerCase(), svg: tightenSvg(renderKit(applyKitTextFill(gtc, kitTextFill[kid]), kid, "s", "default", undefined, kitShapes[kid], { icon: resolveKitIcon(kitIcons[kid], undefined), label: kitNoText[kid] ? "" : kitLabels[kid], overlay: ov }), 20) };
      }),
    }));
  }, [trayReady, cfg, kitShapes, kitTextFill, kitIcons, kitLabels, kitNoText, kitDesigns, componentReleases, isAdmin]);

  /* the user's duplicated pieces — live kit citizens like the stock roster
     above. Thumbs render the BASE component wearing the clone's own design
     fork (that fork is the whole point of a clone); a staged base keeps
     its clones admin-only, same gate as the stock entry */
  const cloneAssets = useMemo(() => {
    const tc = clone(cfg);
    for (const s of Object.values(tc.states)) s.glow = 0;
    return Object.entries(kitClones)
      .filter(([, c]) => kitVisible(c.base, componentReleases, isAdmin))
      .map(([cid, c]) => {
        const key = cid as KitComponentId; // per-piece maps are clone-keyed
        const baseName = KIT_COMPONENTS.find((k) => k.id === c.base)?.name ?? c.base;
        return {
          id: cid, kitId: key, name: c.name,
          hay: `${c.name} ${c.kind} ${baseName}`.toLowerCase(),
          svg: tightenSvg(renderKit(applyKitTextFill(applyKitDesign(tc, kitDesigns[key]), kitTextFill[key]), c.base, "s", "default", undefined, kitShapes[key], { icon: resolveKitIcon(kitIcons[key], undefined), label: kitNoText[key] ? "" : kitLabels[key] }), 20),
        };
      });
  }, [cfg, kitClones, kitDesigns, kitShapes, kitTextFill, kitIcons, kitLabels, kitNoText, componentReleases, isAdmin]);

  const selBoard = boards.find((bd) => bd.items.some((b) => b.id === boardSel)) ?? null;
  const sel = selBoard?.items.find((b) => b.id === boardSel) ?? null;

  /* the exact svg a board item shows — shared by display, export and PNG.
     Per-component design forks (kitDesigns) apply here exactly like the
     editor and Kit page — without them the board showed the MASTER design,
     including its state recipes (owner: buttons "showing the hover glowy
     state" that their component fork had tamed). */
  const svgOf = (b: BoardItem): { svg: string; cfg: GenConfig } => {
    if (b.kitId) {
      // a CLONE item renders its base component (renderKit refuses clone
      // ids) while every per-piece read stays keyed by the item's own id
      const bBase = baseOf(b.kitId);
      const kb = bBase === "progress" || bBase === "segbar" ? kitBar[b.kitId] : undefined;
      const pc0 = applyKitTextFill(applyKitDesign(cfg, kitDesigns[b.kitId]), kitTextFill[b.kitId]);
      /* a dialed instance shadow REPLACES the kit's cast for this copy —
         the render calms the kit's own shadow/contact and the compositor
         (or the stage wrapper) paints the dialed one instead */
      const pc = b.shadow?.s ? suppressCastShadow(pc0) : pc0;
      // the editor's per-size text nudges, slot choices and sub-labels ride
      // along — without them the board (and its PNGs) trailed the editor
      // (owner: "changing the speedo component in edit did not update it
      // on the the board")
      const bSize = kitSizes[b.kitId] ?? "l";
      return { svg: renderKit(pc, bBase, bSize, "default", b.v ?? kitVals[b.kitId], kitShapes[b.kitId], { icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: kitNoText[b.kitId] ? "" : (b.label ?? kitLabels[b.kitId]), sub: kitSubs[b.kitId], slots: kitSlotVals[b.kitId], textOy: kitTextOy[`${b.kitId}:${bSize}`], textOx: kitTextOx[`${b.kitId}:${bSize}`], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov, dock: kb?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kb.dockSide ?? "left" } : undefined, bar: kb, row: bBase === "datarow" ? kitRow : undefined, themedText: !!kitDesigns[b.kitId]?.type || !!kitTextFill[b.kitId] }), cfg: pc };
    }
    if (b.stamp) return { svg: stampSvg(cfg, b.stamp), cfg };
    // big glyphs and user logos are raster art — the PNG compositor
    // draws them directly
    if (b.big || b.logo) return { svg: "", cfg };
    const item = library.find((l) => l.id === b.libId);
    if (!item) return { svg: "", cfg };
    return { svg: item.kit ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", item.kit.v, item.kit.shape, item.kit.label !== undefined ? { label: item.kit.label } : undefined) : renderBevel(item.cfg, "default"), cfg: item.cfg };
  };

  const nameOf = (b: BoardItem): string => {
    if (b.stamp) return `"${b.stamp.text}"`;
    if (b.big) return bigGlyphById(b.big.gid)?.name ?? "Big glyph";
    if (b.logo) return userAssets.find((a) => a.id === b.logo!.aid)?.name ?? "My asset";
    // clone-registry first — a copy-* id must never surface as a name
    const kid = b.kitId;
    if (kid) return kitClones[kid]?.name ?? KIT_COMPONENTS.find((c) => c.id === baseOf(kid))?.name ?? kid;
    return library.find((l) => l.id === b.libId)?.name ?? "Piece";
  };

  /* composite one artboard to a PNG at native resolution */
  /* alpha: the no-background cut (owner-approved, field notes #3) — the
     pieces composite onto a fully transparent canvas: no base fill, no
     backdrop, no noise/overlay dressing. The piece-level PNG has shipped
     alpha from day one; this is the whole-board twin. */
  const exportPng = async (bd: BoardDef, opts?: { alpha?: boolean }) => {
    const alpha = !!opts?.alpha;
    const [W, H] = STAGE[bd.aspect];
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    if (!alpha) {
      ctx.fillStyle = "#0D0F16";
      ctx.fillRect(0, 0, W, H);
    }
    if (!alpha && bd.bgVideo && (bd.bgShow ?? true)) {
      // a video backdrop exports its first frame — the still the mock rests on
      await new Promise<void>((res) => {
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.preload = "auto";
        /* remote loops: anonymous CORS or nothing — a tainted frame would
           kill the WHOLE canvas export, so a host that refuses CORS makes
           the video fail to load and the export proceeds without it */
        v.crossOrigin = "anonymous";
        v.onloadeddata = () => {
          try {
            const s = Math.max(W / v.videoWidth, H / v.videoHeight);
            ctx.save();
            ctx.globalAlpha = (bd.bgOpacity ?? 100) / 100;
            const bf = boardBgFilter(bd); if (bf) ctx.filter = bf;
            ctx.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
            ctx.restore();
          } catch { /* frame unavailable — export continues without it */ }
          res();
        };
        v.onerror = () => res();
        v.src = bd.bgVideo!;
      });
    }
    if (!alpha && bd.bgImage && (bd.bgShow ?? true)) {
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          ctx.save();
          ctx.globalAlpha = (bd.bgOpacity ?? 100) / 100;
          const bf = boardBgFilter(bd);
          if (bd.bgFit === "fit") {
            // mirror the stage's Fit mode: blurred over-scanned cover fill,
            // then the WHOLE scene contained — nothing cropped
            const sc = Math.max(W / img.width, H / img.height) * 1.12;
            ctx.filter = [bf, `blur(${Math.round(W * 0.014)}px) brightness(0.72)`].filter(Boolean).join(" ");
            ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc);
            ctx.filter = bf || "none";
            const sf = Math.min(W / img.width, H / img.height);
            ctx.drawImage(img, (W - img.width * sf) / 2, (H - img.height * sf) / 2, img.width * sf, img.height * sf);
          } else {
            const s = Math.max(W / img.width, H / img.height); // cover, cropped to the board
            if (bf) ctx.filter = bf;
            ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
          }
          ctx.restore(); res();
        };
        img.onerror = () => res();
        /* library scenes (and any remote image): anonymous CORS or nothing —
           a tainted frame would kill the whole canvas export */
        if (/^https:\/\//.test(bd.bgImage!)) img.crossOrigin = "anonymous";
        img.src = bd.bgImage!;
      });
    }
    if (!alpha) {
      // background film grain — independent of the overlay (owner: "noise")
      drawBoardNoise(ctx, W, H, bd.bgNoise ?? 0);
      // the overlay stack (tint + its grain + center scrim) — one shared
      // recipe with the Unity background bake, so the two can't drift
      drawBoardOverlays(ctx, W, H, bd);
    }
    for (const b of bd.items) {
      if (b.big) {
        /* big glyph: the PNG itself, the instance's shadow/glow filter on
           the context — same pixels the stage shows (bigGlyphFilter is the
           one shared recipe) */
        const gl = bigGlyphById(b.big.gid);
        if (!gl) continue;
        const s = (b.scale ?? 1) * BIG_GLYPH_BASE;
        await new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            const w = img.width * s, h = img.height * s;
            ctx.save();
            if (b.opacity !== undefined) ctx.globalAlpha = b.opacity / 100;
            /* the canvas is FLAT board space — the stage scales the filter
               inside the instance wrapper, so this bake must scale the
               recipe's px itself or a tiny tile drowns under a full-size
               shadow (pxScale, see bigGlyphFilter) */
            const bf = bigGlyphFilter(cfg, b.big!, b.scale ?? 1);
            if (bf) ctx.filter = bf;
            ctx.translate(b.x + w / 2, b.y + h / 2);
            if (b.rot) ctx.rotate((b.rot * Math.PI) / 180);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore(); res();
          };
          img.onerror = () => res();
          img.src = bigGlyphUrl(gl.id);
        });
        continue;
      }
      if (b.logo) {
        /* user logo: the vaulted/cloud ship copy, the instance's dials as
           the SAME bigGlyphFilter recipe the stage shows — one filter
           string across stage, this compositor and the Unity bake */
        const ua = userAssets.find((a) => a.id === b.logo!.aid);
        if (!ua) continue;
        const url = await bgAssetDisplayUrl(ua.ref).catch(() => null);
        if (!url) continue;
        const s = (b.scale ?? 1) * BIG_GLYPH_BASE;
        await new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            const w = img.width * s, h = img.height * s;
            ctx.save();
            if (b.opacity !== undefined) ctx.globalAlpha = b.opacity / 100;
            // flat board space — scale the filter recipe like the big glyphs
            const bf = bigGlyphFilter(cfg, { gid: "", ...b.logo! }, b.scale ?? 1);
            if (bf) ctx.filter = bf;
            ctx.translate(b.x + w / 2, b.y + h / 2);
            if (b.rot) ctx.rotate((b.rot * Math.PI) / 180);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore(); res();
          };
          img.onerror = () => res();
          img.src = url;
        });
        continue;
      }
      const { svg: svg0, cfg: pc } = svgOf(b);
      if (!svg0) continue;
      // the compositor's raster trip is sealed too — faces ride inside.
      // SMIL loops are stripped: rasterization must get the resting pose,
      // never whatever instant a fade-in loop's clock happened to be at
      const svg = stripSmil(await svgWithFaces(svg0, pc));
      const pad = glowPadOf(pc);
      const s = b.scale ?? 1;
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          const w = img.width * s, h = img.height * s;
          const cx = b.x - pad * s + w / 2, cy = b.y - pad * s + h / 2;
          ctx.save();
          // the instance's opacity ships exactly as the stage shows it
          if (b.opacity !== undefined) ctx.globalAlpha = b.opacity / 100;
          if (b.stamp) { const sf = stampFilter(cfg, b.stamp); if (sf) ctx.filter = sf; }
          /* a kit copy's dialed shadow — flat board space, so the recipe
             scales by the instance (the bigGlyphFilter pxScale lesson) */
          else if (b.kitId && b.shadow?.s) { const kf = kitShadowFilter(b.shadow, s); if (kf) ctx.filter = kf; }
          ctx.translate(cx, cy);
          if (b.rot) ctx.rotate((b.rot * Math.PI) / 180);
          if (b.stamp?.warp && b.stamp.warp.style !== "none" && b.stamp.warp.amount) {
            const wc = warpStampRaster(img, img.width, img.height, b.stamp.warp);
            ctx.drawImage(wc, -w / 2, -(wc.height * s) / 2, w, wc.height * s);
          } else {
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
          }
          ctx.restore(); res();
        };
        img.onerror = () => res();
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
      });
    }
    const slug = bd.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";
    cv.toBlob((bl) => { if (bl) download(`${slug}-${W}x${H}${alpha ? "-transparent" : ""}.png`, bl); }, "image/png");
  };

  /* ── CENTER-based position (owner, field notes #3: "let's snap from
     center") ── the piece's stored x/y stays its box corner (no data
     migration), but every control speaks CENTERS: the Selected panel's
     X/Y reads and writes the visible art's center, and grid snap lands
     centers on the grid — typing the board midpoint centers a crosshair
     exactly. The center OFFSET (art center − stored x) is measured from
     the live DOM: data-shell mapped through the svg (the geometry the
     selection box hugs), the raster shell for warped stamps/big glyphs,
     the host box as the last resort. The offset is translation-invariant,
     so a one-frame DOM lag never skews it. */
  const artRectOf = (bdId: string, it: BoardItem): { l: number; t: number; w: number; h: number } | null => {
    const bd = boards.find((b) => b.id === bdId);
    const canvas = document.querySelector(`[data-board="${bdId}"] .bd-canvas`);
    const host = canvas?.querySelector(`[data-bid="${it.id}"]`) as HTMLElement | null;
    if (!bd || !canvas || !host) return null;
    const f = fitOf(bd);
    const cr = canvas.getBoundingClientRect();
    let r = host.getBoundingClientRect();
    const svg = host.querySelector("svg");
    const img = svg ? null : host.querySelector("img");
    if (svg) {
      const stamp = svg.getAttribute("data-shell")?.split(" ").map(Number);
      const vb = svg.viewBox?.baseVal;
      const sr = svg.getBoundingClientRect();
      if (stamp?.length === 4 && stamp.every(Number.isFinite) && vb?.width && sr.width) {
        const k = sr.width / vb.width;
        r = new DOMRect(sr.left + (stamp[0] - vb.x) * k, sr.top + (stamp[1] - vb.y) * k, stamp[2] * k, stamp[3] * k);
      }
    } else if (img) {
      const stamp = img.getAttribute("data-shell")?.split(" ").map(Number);
      const iw = parseFloat(img.getAttribute("width") ?? "0");
      const ir = img.getBoundingClientRect();
      if (stamp?.length === 4 && stamp.every(Number.isFinite) && iw && ir.width) {
        const k = ir.width / iw;
        r = new DOMRect(ir.left + stamp[0] * k, ir.top + stamp[1] * k, stamp[2] * k, stamp[3] * k);
      }
    }
    return { l: (r.left - cr.left) / f, t: (r.top - cr.top) / f, w: r.width / f, h: r.height / f };
  };
  const artCenterOffsetOf = (bdId: string, it: BoardItem): { cx: number; cy: number } => {
    const r = artRectOf(bdId, it);
    return r ? { cx: r.l + r.w / 2 - it.x, cy: r.t + r.h / 2 - it.y } : { cx: 0, cy: 0 };
  };
  /* snap a piece's position so its CENTER (corner + off) lands on the
     grid; without snap, plain pixel rounding as before */
  const snapPos = (v: number, off: number) => (boardSnap ? Math.round((v + off) / 16) * 16 - off : Math.round(v));

  /* drag-to-place (ported from the homepage board): press an asset, drag a
     ghost across the page, release over any board — the piece lands under
     the cursor. A plain click still adds to the active board. */
  const ghostRef = useRef<{ kitId: KitComponentId; ov?: string; svg: string; x0: number; y0: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ svg: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = ghostRef.current;
      if (!g) return;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 7) return;
      g.moved = true;
      setGhost({ svg: g.svg, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const g = ghostRef.current;
      if (!g) return;
      ghostRef.current = null;
      setGhost(null);
      suppressClick.current = g.moved;
      if (!g.moved) return; // a plain click — the button's onClick handles it
      const boardEl = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-board]");
      if (!boardEl) return;
      const st = useGen.getState();
      const bid = boardEl.getAttribute("data-board")!;
      const bd = st.boards.find((b2) => b2.id === bid);
      const cvs = boardEl.querySelector(".bd-canvas");
      if (!bd || !cvs) return;
      const r = cvs.getBoundingClientRect();
      const f = r.width / STAGE[bd.aspect][0];
      const sv = (v: number) => (st.boardSnap ? Math.round(v / 16) * 16 : Math.round(v));
      st.setActiveBoard(bid);
      /* the drop point is the piece's intended CENTER-ish — snap THAT to
         the grid, then back off the half-size estimate (center snap) */
      st.addBoardItems([{ kitId: g.kitId, ov: g.ov, x: Math.max(0, sv((e.clientX - r.left) / f) - 110), y: Math.max(0, sv((e.clientY - r.top) / f) - 55) }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  const scrollToBoard = (id: string) => {
    frameRef.current?.querySelector(`[data-board="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={`board2${playing ? " playing" : ""}`} style={{ "--trayl": `${trayW.l}px`, "--trayr": `${trayW.r}px` } as React.CSSProperties}>
      <BoardCurtain />
      {/* ── assets ── */}
      <aside className="bd-assets">
        <span className="bd-traygrip bd-traygrip--l" role="separator" aria-orientation="vertical" aria-label="Resize the assets tray"
          title="Drag to widen or narrow the assets tray. Double-click resets."
          onPointerDown={gripDown("l")} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}
          onDoubleClick={() => setTrayW((p) => { const n = { ...p, l: 238 }; try { localStorage.setItem("ui-generator-traywidths", JSON.stringify(n)); } catch { /* private mode */ } return n; })} />
        <div className="bd-h">Assets</div>
        <label className="bd-search"><Search size={13} strokeWidth={2.2} />
          <input placeholder="Search assets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" />
          {q && (
            <button className="bd-searchclear" title="Clear search" aria-label="Clear search"
              onClick={(e) => { e.preventDefault(); setQ(""); }}>
              <X size={12} strokeWidth={2.4} />
            </button>
          )}
        </label>
        <div className="bd-teach">Click a piece to add it to the screen — or drag it straight onto a board.</div>
        <button className="bd-stampbtn" title="Drop the kit's lettering on the board — type any words, size them like a logo"
          onClick={() => useGen.getState().addStampToBoard()}>
          <Type size={13} strokeWidth={2.2} /> Type stamp — your words in the kit's lettering
        </button>
        {/* the PLAIN tier (owner: "a delineation between splash text and
            just good font usage") — same face, flat pickable color, for
            labels that must READ against any backdrop */}
        <button className="bd-stampbtn" title="Plain text in the kit's font — pick its color in the side rail; for labels that must stay readable"
          onClick={() => useGen.getState().addStampToBoard(true)}>
          <Type size={13} strokeWidth={2.2} /> Plain text — the kit's font, your color
        </button>
        <div className="bd-scroll">
          {assets.map((g) => {
            // every typed word must land somewhere in the piece's haystack
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            const items = g.items.filter((it) => terms.every((t) => it.hay.includes(t)));
            if (!items.length) return null;
            return (
              <div key={g.name}>
                <div className="bd-cat">{g.name}</div>
                <div className="bd-grid">
                  {items.map((it) => (
                    <button key={it.id} className="bd-asset" title={`Add ${it.name} to ${act?.name ?? "the board"} — or drag it onto any board`}
                      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } addKitToBoard(it.kitId, it.ov); }}
                      onPointerDown={(e) => { if (e.button === 0) ghostRef.current = { kitId: it.kitId, ov: it.ov, svg: it.svg, x0: e.clientX, y0: e.clientY, moved: false }; }}
                      onPointerEnter={() => setPreview({ name: it.name, svg: svgOf({ id: "pv", libId: "", kitId: it.kitId, ov: it.ov, x: 0, y: 0 } as BoardItem).svg })}
                      onPointerLeave={() => setPreview(null)}>
                      <span dangerouslySetInnerHTML={{ __html: it.svg }} />
                      <i>{it.name}</i>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {/* the user's clones place as LIVE items — kitId carries the
              clone id, so the stage keeps following its edits */}
          {cloneAssets.length > 0 && (() => {
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            const items = cloneAssets.filter((it) => terms.every((t) => it.hay.includes(t)));
            if (!items.length) return null;
            return (
              <div>
                <div className="bd-cat">Your components</div>
                <div className="bd-grid">
                  {items.map((it) => (
                    <button key={it.id} className="bd-asset" title={`Add ${it.name} to ${act?.name ?? "the board"} — or drag it onto any board`}
                      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } addKitToBoard(it.kitId); }}
                      onPointerDown={(e) => { if (e.button === 0) ghostRef.current = { kitId: it.kitId, svg: it.svg, x0: e.clientX, y0: e.clientY, moved: false }; }}
                      onPointerEnter={() => setPreview({ name: it.name, svg: svgOf({ id: "pv", libId: "", kitId: it.kitId, x: 0, y: 0 } as BoardItem).svg })}
                      onPointerLeave={() => setPreview(null)}>
                      <span dangerouslySetInnerHTML={{ __html: it.svg }} />
                      <i>{it.name}</i>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* ── My assets — the user's own uploaded images (owner: "upload
              a transparent png to use as a logo… these assets should live
              in my assets drawer and follow my account"). The registry
              rides the synced workspace doc; the pixels ride the durable-
              assets bucket for account holders (any browser resolves
              them) and the local vault for guests — the backdrop-upload
              contract, gate-free, with the same quiet keep-safe line. ── */}
          {(() => {
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            const items = userAssets.filter((a) => terms.every((t) => `${a.name} my assets logo upload image`.toLowerCase().includes(t)));
            if (!items.length && q) return null;
            return (
              <div>
                <div className="bd-cat">My assets</div>
                {items.length > 0 && (
                  <div className="bd-grid">
                    {items.map((a) => (
                      /* a div-with-role tile, the pages-tray pattern — real
                         <button>s can't nest, and each tile carries its own
                         rename/delete controls */
                      <div key={a.id} className="bd-asset bd-uasset" role="button" tabIndex={0}
                        title={`Add ${a.name} to ${act?.name ?? "the board"}`}
                        onClick={() => addUserAssetToBoard(a.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") addUserAssetToBoard(a.id); }}>
                        <span><UserAssetThumbImg ua={a} /></span>
                        <i>{a.name}</i>
                        <span className="bd-uactl" onClick={(e) => e.stopPropagation()}>
                          <button title={`Rename ${a.name}`} aria-label={`Rename ${a.name}`}
                            onClick={() => {
                              const name = window.prompt("Rename this asset:", a.name);
                              if (name?.trim()) useGen.getState().renameUserAsset(a.id, name.trim());
                            }}><SquarePen size={11} strokeWidth={2.4} /></button>
                          <button className="danger" title={`Delete ${a.name} — board copies of it go too`} aria-label={`Delete ${a.name}`}
                            onClick={() => {
                              const placed = useGen.getState().boards.reduce((n, bd) => n + bd.items.filter((it) => it.logo?.aid === a.id).length, 0);
                              if (window.confirm(placed ? `Delete ${a.name}? Its ${placed} placed cop${placed === 1 ? "y" : "ies"} leave the boards too.` : `Delete ${a.name}?`))
                                useGen.getState().removeUserAsset(a.id);
                            }}><X size={11} strokeWidth={2.4} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="bd-stampbtn" disabled={uaBusy}
                  title="Upload your own image — a transparent PNG makes the best logo; JPG and WebP work too. 2 MB cap; big images downscale on import."
                  onClick={() => uaInput.current?.click()}>
                  <ImagePlus size={13} strokeWidth={2.2} /> {uaBusy ? "Importing…" : "Upload a logo — transparent PNG shines"}
                </button>
                {uaErr && <div className="bd-note bd-vurl-err" role="alert">{uaErr}</div>}
                <BgKeepsafeLine />
                <input ref={uaInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setUaErr(null); setUaBusy(true);
                    void importUserAssetFile(f).then((r) => {
                      setUaBusy(false);
                      if (!r.ok) { setUaErr(r.message); return; }
                      // land it on the active board right away — upload IS intent
                      useGen.getState().addUserAssetToBoard(r.asset.id);
                    });
                  }} />
              </div>
            );
          })()}
          {/* ── Big glyphs — the owner's board-art drop (bigGlyphs.ts).
              Boards-only by mandate; RELEASED to everyone in code (owner
              order, verbatim 2026-08-21: "release the set") — the old
              one-key ledger gate is gone, so a stale ledger row can never
              hide the set again. Thumbs are 128px webp served static; the
              full PNG is fetched only when a glyph is placed. Opaque-
              delivered files stay parked until re-exported with alpha. ── */}
          {(() => {
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            const items = BIG_GLYPHS.filter((g) => !g.opaque).filter((g) => {
              const hay = `${g.name} ${g.id} big glyphs board art ${g.search ?? ""}`.toLowerCase();
              return terms.every((t) => hay.includes(t));
            });
            if (!items.length) return null;
            return (
              <div>
                <div className="bd-cat">Big glyphs <span className="bd-cat-note">AI-generated</span></div>
                <div className="bd-grid">
                  {items.map((g) => (
                    <button key={g.id} className="bd-asset" title={`Add ${g.name} to ${act?.name ?? "the board"}`}
                      onClick={() => useGen.getState().addBigGlyphToBoard(g.id)}>
                      <span><img src={bigGlyphThumb(g.id)} alt={g.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: 64 }} /></span>
                      <i>{g.name}</i>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {library.length > 0 && (
            <div>
              <div className="bd-cat">Saved components</div>
              <div className="bd-grid">
                {library.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())).map((l) => {
                  const art = tightenSvg(l.kit ? renderKit(l.cfg, l.kit.id, l.kit.size, "default", l.kit.v, l.kit.shape, l.kit.label !== undefined ? { label: l.kit.label } : undefined) : renderBevel(l.cfg, "default"), 20);
                  return (
                    <button key={l.id} className="bd-asset" title={`Add ${l.name} to ${act?.name ?? "the board"}`} onClick={() => addToBoard(l.id)}
                      onPointerEnter={() => setPreview({ name: l.name, svg: art })}
                      onPointerLeave={() => setPreview(null)}>
                      <span dangerouslySetInnerHTML={{ __html: art }} />
                      <i>{l.name}</i>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="bd-hint">Click an asset to place it on the active board · ⌘Z undo · ⌘D duplicate · Delete removes</div>
        </div>
      </aside>

      {preview && !ghost && (
        <div className="bd-preview" aria-hidden="true">
          <div className="bd-pvart" dangerouslySetInnerHTML={{ __html: preview.svg }} />
          <div className="bd-pvname">{preview.name}</div>
        </div>
      )}
      {ghost && (
        <div className="bd-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}
          dangerouslySetInnerHTML={{ __html: ghost.svg }} />
      )}

      {/* ── artboards ── */}
      <div className="bd-main">
        <header className="bd-top">
          <div className="bd-title"><h2>The Board</h2><span>Arrange components across artboards.</span></div>
          <div className="bd-aspect" role="radiogroup" aria-label="Active board aspect">
            <button className={act?.aspect === "169" ? "on" : ""} role="radio" aria-checked={act?.aspect === "169"}
              onClick={() => setBoardAspect("169")}><Monitor size={13} strokeWidth={2} /> 16:9</button>
            <button className={act?.aspect === "mobile" ? "on" : ""} role="radio" aria-checked={act?.aspect === "mobile"}
              onClick={() => setBoardAspect("mobile")}><Smartphone size={13} strokeWidth={2} /> Mobile</button>
          </div>
          {/* the glow invites while the board is bare, then goes quiet */}
          <label className={`bd-tpl${act && act.items.length === 0 ? " glow" : ""}`}
            title="Add a full starter screen — pieces land pre-sized and pre-placed, backdrop included">
            <LayoutTemplate size={13} strokeWidth={2} />
            <select value="" aria-label="Add a starter screen"
              onChange={(e) => {
                if (!BOARD_TEMPLATES[e.target.value]) return;
                /* a board with pieces gets ASKED where the starter lands
                   (owner design, field notes #3) — a bare board just deals */
                if (act && act.items.length > 0) setStarterAsk(e.target.value);
                else applyStarter(e.target.value, "stack");
              }}>
              <option value="">Starter screen…</option>
              {Object.keys(BOARD_TEMPLATES)
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="bd-snap"><Grid3x3 size={13} strokeWidth={2} /> Snap to grid
            <input type="checkbox" checked={boardSnap} onChange={(e) => setBoardSnap(e.target.checked)} />
          </label>
          <label className="bd-snap" title="Safe-area guides — keep HUD inside the dashed frames. 16:9 shows action/title safe; Mobile shows notch and home-bar insets. Guides never export.">
            <Shield size={13} strokeWidth={2} /> Safe area
            <input type="checkbox" checked={boardSafe} onChange={(e) => setBoardSafe(e.target.checked)} />
          </label>
          <button className="bd-export" onClick={() => guardExport(() => { if (act) void exportPng(act); })}><Download size={14} strokeWidth={2.2} /> Export PNG</button>
          <button className="bd-export" title="Every piece on a transparent PNG — no backdrop, no base fill; drops straight into an engine or a mockup"
            onClick={() => guardExport(() => { if (act) void exportPng(act, { alpha: true }); })}>
            <Download size={14} strokeWidth={2.2} /> PNG · no background
          </button>
          <button className="bd-export bd-exportall"
            title="Every board as a full-resolution PNG, one after another — the browser may ask once to allow multiple downloads"
            onClick={() => guardExport(() => {
              void (async () => {
                for (const bd of boards) if (bd.items.length || bd.bgImage || bd.bgVideo) await exportPng(bd);
              })();
            })}>
            <Download size={14} strokeWidth={2.2} /> All boards
          </button>
        </header>
        <div className="bd-frame bd-boards" ref={frameRef}
          /* click-away deselects (owner): anywhere that isn't a piece, its
             toolbar, a resize handle, or a board's header controls clears the
             selection — you shouldn't have to select ANOTHER object to let
             go of this one. The per-stage handlers below stay for the fast
             path; this one catches the void between and around boards. */
          onPointerDown={(e) => {
            const t = e.target as HTMLElement;
            if (!t.closest(".board-item, .bd-rszwrap, .bd-abhead")) setBoardSel(null);
          }}>
          {rowsOf(boards).map((row) => {
            const fit = rowFit(row);
            return (
              <div key={row[0].id} className="bd-row">
              {row.map((bd) => {
                const [W, H, aspName] = STAGE[bd.aspect];
                /* the side + exists only where the rule allows a
                   neighbor: mobiles, in a row that isn't full — a 16:9
                   always stands alone (owner) */
                const sideAspect = bd.aspect === "mobile" && row.length < 3 ? ("mobile" as const) : null;
                /* the active board always renders live (even before the
                   idle sweep records it) — activating a sleeping board
                   hydrates it on the spot */
                const live = artBeat && (bd.id === activeBoard || hydrated.has(bd.id));
                return (
              <section key={bd.id} className={`bd-artboard${bd.id === activeBoard ? " on" : ""}`} data-board={bd.id}>
                {/* the header hugs the stage's width and speaks in icons —
                    the words live in the tooltips, the spec line moved
                    UNDER the image (owner: "save space on the persistent
                    menu... reduce downloads, duplicate and clear to their
                    icons only") */}
                <header className="bd-abhead" style={{ width: Math.max(W * fit, 200) }}>
                  <input className="bd-abname" value={bd.name} aria-label="Board name" maxLength={40}
                    onFocus={() => setActiveBoard(bd.id)}
                    onChange={(e) => renameBoard(bd.id, e.target.value)} />
                  <button className="bd-abtool" aria-label={`Export ${bd.name} as PNG`}
                    title={`Export ${bd.name} as a PNG at full ${W} × ${H} resolution — background, overlay and pieces`}
                    onClick={() => guardExport(() => void exportPng(bd))}>
                    <Download size={12} strokeWidth={2.2} />
                  </button>
                  <button className="bd-abtool" aria-label={`Duplicate ${bd.name}`}
                    title={`Duplicate ${bd.name} — pieces, backdrop and darkroom dials, a running start for the next screen`}
                    onClick={() => guardAddBoard(() => duplicateBoard(bd.id))}>
                    <Copy size={12} strokeWidth={2.2} />
                  </button>
                  <button className="bd-abtool" aria-label={`Clear ${bd.name}`}
                    title="Clear this board — every piece and the background"
                    onClick={() => {
                      const hasBg = !!(bd.bgImage || bd.bgVideo);
                      const what = bd.items.length ? `all ${bd.items.length} pieces${hasBg ? " and the background" : ""}` : hasBg ? "the background" : "";
                      if (!what || window.confirm(`Clear ${what} from ${bd.name}?`)) clearBoard(bd.id);
                    }}>
                    <X size={12} strokeWidth={2.2} />
                  </button>
                  <button className="bd-abtool danger" aria-label={`Delete ${bd.name}`} title="Delete this board"
                    onClick={() => { if (bd.items.length === 0 || window.confirm(`Delete ${bd.name} and its ${bd.items.length} pieces?`)) removeBoard(bd.id); }}>
                    <Trash2 size={12} strokeWidth={2.2} />
                  </button>
                </header>
                {/* the stagewrap exists so the + tabs hug the STAGE's true
                    edges — the flow cell around it can be wider than the
                    art when narrow boards share a row */}
                <div className="bd-stagewrap">
                <div className="bd-stage" style={{ width: W * fit, height: H * fit }}
                  onPointerDown={(e) => { setActiveBoard(bd.id); if (e.target === e.currentTarget) setBoardSel(null); }}>
                  {!live ? (
                    /* sleeping board — an exact-stage-size frame that SAYS
                       it's loading (owner bug, 2026-08-25: the old bare dim
                       frame "sat empty for awhile" and read as broken).
                       Pure-CSS skeleton: quiet screen-shaped shimmer blocks,
                       the curtain's pill bar as an indeterminate sweep, and
                       a "Loading board…" line. Art, backdrop and pieces
                       still mount at its idle turn (or the moment it's
                       activated); everything here is absolute inside the
                       fixed-size stage, so the swap shifts nothing. */
                    <div className="bd-sleep" aria-hidden="true">
                      <i className="bd-sleepblock bd-sleepblock--bar" />
                      <i className="bd-sleepblock bd-sleepblock--hero" />
                      <i className="bd-sleepblock bd-sleepblock--foot" />
                      <div className="bd-sleepnote">
                        <span className="bd-sleepbar"><i /></span>
                        <span>Loading board…</span>
                      </div>
                    </div>
                  ) : (<>
                  <BoardBackdrop bd={bd} />
                  {bd.bgVideo && (bd.bgShow ?? true) && (
                    <video className="bd-bg bd-bgvid" src={bd.bgVideo} autoPlay muted loop playsInline
                      style={{ opacity: (bd.bgOpacity ?? 100) / 100, filter: boardBgFilter(bd) }} />
                  )}
                  {(bd.bgNoise ?? 0) > 0 && (bd.bgShow ?? true) && (
                    <div className="bd-noise" style={{ opacity: ((bd.bgNoise ?? 0) / 100) * 0.6 }} />
                  )}
                  {/* overlay sits between the backdrop and the pieces */}
                  {(bd.ovMode ?? "none") !== "none" && (
                    <div className="bd-ov" style={{ background: ovBackground(bd.ovMode!), opacity: (bd.ovStrength ?? 45) / 100, mixBlendMode: (bd.ovBlend ?? "normal") as React.CSSProperties["mixBlendMode"] }} />
                  )}
                  {(bd.ovMode ?? "none") !== "none" && (bd.ovNoise ?? 0) > 0 && (
                    <div className="bd-noise" style={{ opacity: ((bd.ovNoise ?? 0) / 100) * 0.6 }} />
                  )}
                  {(bd.ovCenter ?? 0) > 0 && (
                    <div className="bd-ov" style={{ background: CENTER_SCRIM, opacity: (bd.ovCenter ?? 0) / 100 }} />
                  )}
                  {/* safety guides (owner) — pure view layer, never exported.
                      16:9: broadcast/console action (95%) + title (90%) safe;
                      mobile: notch + home-bar insets in stage units. */}
                  {boardSafe && (
                    <div className="bd-safe" aria-hidden="true">
                      {/* center cross — the composition anchor, both aspects */}
                      <i className="bd-safe__centerv" />
                      <i className="bd-safe__centerh" />
                      {bd.aspect === "169" ? (<>
                        <i className="bd-safe__frame" style={{ inset: "2.5%" }}><b>action safe</b></i>
                        <i className="bd-safe__frame bd-safe__frame--title" style={{ inset: "5%" }}><b>title safe</b></i>
                      </>) : (<>
                        <i className="bd-safe__frame" style={{ top: (47 / 844 * 100) + "%", bottom: (34 / 844 * 100) + "%", left: (12 / 390 * 100) + "%", right: (12 / 390 * 100) + "%" }}><b>device safe</b></i>
                        <i className="bd-safe__notch" />
                        <i className="bd-safe__homebar" />
                      </>)}
                    </div>
                  )}
                  <div className="bd-canvas" style={{ width: W, height: H, transform: `scale(${fit})` }}
                    onPointerDown={(e) => { if (e.target === e.currentTarget) setBoardSel(null); }}>
                    {bd.items.map((b) => (
                      <StagePiece key={b.id} b={b} playing={playing}
                        selected={selIdsAll.includes(b.id)} solo={boardSel === b.id && selIdsAll.length === 1} fit={fit}
                        onTextEdit={b.stamp || (b.kitId && KIT_LABEL_EDITABLE.has(baseOf(b.kitId))) ? () => { pickPiece(bd.id, b.id, false); setTextEdit(b.id); } : undefined}
                        onSelect={(e) => pickPiece(bd.id, b.id, !!e?.shiftKey)}
                        onDragStart={(e) => {
                          // dragging any selected piece carries the whole selection
                          const group = selIdsAll.includes(b.id) && selIdsAll.length > 1
                            ? bd.items.filter((it) => selIdsAll.includes(it.id))
                            : [b];
                          // center offsets captured at grab time — grid snap
                          // lands each piece's visible CENTER on the grid
                          dragRef.current = { list: group.map((it) => ({ id: it.id, ox: it.x, oy: it.y, ...(() => { const c = artCenterOffsetOf(bd.id, it); return { cox: c.cx, coy: c.cy }; })() })), dx: e.clientX, dy: e.clientY, fit };
                        }}
                        onDragMove={(e) => {
                          const d = dragRef.current;
                          if (!d || !d.list.some((g) => g.id === b.id)) return;
                          // same dead-man rule as the resize handles: no button, no gesture
                          if (!(e.buttons & 1)) { dragRef.current = null; return; }
                          const mdx = (e.clientX - d.dx) / d.fit, mdy = (e.clientY - d.dy) / d.fit;
                          applyBoardItemPatches(`grpmove:${d.list.map((g) => g.id).join(",")}`,
                            d.list.map((g) => ({ id: g.id, x: snapPos(g.ox + mdx, g.cox), y: snapPos(g.oy + mdy, g.coy) })));
                        }}
                        onDragEnd={() => { dragRef.current = null; }} />
                    ))}
                    {/* the in-place words editor — floats just above the
                        piece, counter-scaled so type stays readable inside
                        the fit-scaled stage. Live commit through the same
                        setters as the panel field; Enter/Escape/blur close. */}
                    {textEdit && (() => {
                      const eb = bd.items.find((i) => i.id === textEdit);
                      if (!eb || playing) return null;
                      const isStamp = !!eb.stamp;
                      if (!isStamp && !eb.kitId) return null;
                      const val = isStamp ? eb.stamp!.text : (eb.label ?? "");
                      return (
                        <input className="bd-inlineedit" autoFocus aria-label="Edit the words in place"
                          value={val}
                          maxLength={isStamp ? 40 : labelMaxOf(baseOf(eb.kitId!))}
                          placeholder={isStamp ? "Type the words…" : (eb.kitId ? kitLabels[eb.kitId] || "Text — this copy" : "")}
                          style={{ left: eb.x, top: Math.max(4, eb.y - 44 / fit), transform: `scale(${1 / fit})`, transformOrigin: "top left" }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (isStamp) useGen.getState().setBoardItemStamp(eb.id, { text: e.target.value });
                            else useGen.getState().setBoardItemLabel(eb.id, e.target.value);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setTextEdit(null); } }}
                          onBlur={() => setTextEdit(null)} />
                      );
                    })()}
                    {grpBox && grpBox.bd === bd.id && !playing && (
                      /* the frame itself never eats clicks (pointer-events:
                         none) — only its corner handles are interactive */
                      <div className="bd-groupbox" aria-hidden="true" style={{ left: grpBox.l, top: grpBox.t, width: grpBox.w, height: grpBox.h }}>
                        {([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([hx, hy]) => (
                          <span key={`g${hx}${hy}`} className="bd-rszwrap" style={{ left: hx * grpBox.w, top: hy * grpBox.h }}>
                            <span className="bd-rsz2" role="slider" aria-label="Scale the selection" aria-valuenow={100}
                              style={{ transform: `scale(${1 / fit})`, cursor: hx === hy ? "nwse-resize" : "nesw-resize" }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* uncaptured scale still works */ }
                                const pieces = bd.items.filter((it) => selIdsAll.includes(it.id))
                                  .map((it) => ({ id: it.id, s0: it.scale ?? 1, px: it.x, py: it.y, min: boardScaleMin(it) }));
                                if (pieces.length < 2) return;
                                grsz.current = {
                                  x0: e.clientX, y0: e.clientY,
                                  ax: grpBox.l + (1 - hx) * grpBox.w, ay: grpBox.t + (1 - hy) * grpBox.h,
                                  hpx: grpBox.l + hx * grpBox.w, hpy: grpBox.t + hy * grpBox.h,
                                  // clamp the GROUP factor so no piece leaves its own
                                  // floor..2 range mid-gesture — relative spacing never
                                  // warps (big glyphs floor at 5%, the rest at 30%)
                                  fMin: Math.max(...pieces.map((p) => p.min / p.s0)),
                                  fMax: Math.min(...pieces.map((p) => 2 / p.s0)),
                                  pieces,
                                };
                              }}
                              onPointerMove={(e) => {
                                const g = grsz.current;
                                if (!g) return;
                                if (!(e.buttons & 1)) { grsz.current = null; return; }
                                // corners follow the diagonal — both axes, averaged,
                                // exactly like the single-piece transform box
                                const ddx = (e.clientX - g.x0) / fit, ddy = (e.clientY - g.y0) / fit;
                                const rx = Math.abs(g.hpx + ddx - g.ax) / Math.max(1, Math.abs(g.hpx - g.ax));
                                const ry = Math.abs(g.hpy + ddy - g.ay) / Math.max(1, Math.abs(g.hpy - g.ay));
                                const s = Math.max(g.fMin, Math.min(g.fMax, (rx + ry) / 2));
                                transformBoardItems(`grpscale:${g.pieces.map((p) => p.id).join(",")}`,
                                  g.pieces.map((p) => ({ id: p.id, scale: p.s0 * s, x: g.ax + (p.px - g.ax) * s, y: g.ay + (p.py - g.ay) * s })));
                              }}
                              onPointerUp={() => { grsz.current = null; }}
                              onPointerCancel={() => { grsz.current = null; }} />
                          </span>
                        ))}
                      </div>
                    )}
                    {/* the hint is for a truly bare stage — a board wearing a
                        backdrop is already someone's scene, never watermark it
                        (owner: hint text over a fresh upload) */}
                    {bd.items.length === 0 && !bd.bgImage && !bd.bgVideo && <div className="bd-empty"><span>An empty stage — pick a <b>Starter screen</b> above, or click an asset on the left.</span></div>}
                  </div>
                  </>)}
                </div>
                {/* grow the desk in either direction (owner: "plus signs
                    beneath and to the right of boards") — the side +
                    keeps the newcomer ON this row (the row rescales to
                    fit, never scrolls), beneath starts the next row */}
                {sideAspect && (
                  <button className="bd-addtab bd-addtab--r"
                    title={`Add a ${sideAspect === "mobile" ? "mobile" : "16:9"} board beside ${bd.name}${sideAspect !== bd.aspect ? " — the row rescales so both fit" : ""}`}
                    aria-label={`Add a board to the right of ${bd.name}`}
                    onClick={() => guardAddBoard(() => addBoardAfter(bd.id, { aspect: sideAspect }))}>
                    <Plus size={14} strokeWidth={2.2} />
                  </button>
                )}
                <button className="bd-addtab bd-addtab--b" title={`Add a board below ${bd.name}`}
                  aria-label={`Add a board below ${bd.name}`}
                  onClick={() => guardAddBoard(() => addBoardAfter(row[row.length - 1].id, { aspect: bd.aspect, nl: true }))}>
                  <Plus size={14} strokeWidth={2.2} />
                </button>
                </div>
                <span className="bd-abmeta">{aspName} · {W} × {H}</span>
              </section>
                );
              })}
              </div>
            );
          })}
          <button className="bd-addboard-inline" onClick={() => guardAddBoard(addBoard)}><Plus size={14} strokeWidth={2.2} /> Add board</button>
        </div>
      </div>

      {/* ── pages tray + inspector ── */}
      <aside className="bd-side">
        <span className="bd-traygrip bd-traygrip--r" role="separator" aria-orientation="vertical" aria-label="Resize the inspector tray"
          title="Drag to widen or narrow this tray. Double-click resets."
          onPointerDown={gripDown("r")} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}
          onDoubleClick={() => setTrayW((p) => { const n = { ...p, r: 270 }; try { localStorage.setItem("ui-generator-traywidths", JSON.stringify(n)); } catch { /* private mode */ } return n; })} />
        <div className="bd-h">Boards</div>
        <div className="bd-pages">
          {boards.map((bd, i) => (
            <div key={bd.id} className={`bd-page${bd.id === activeBoard ? " on" : ""}`} role="button" tabIndex={0}
              onClick={() => { setActiveBoard(bd.id); scrollToBoard(bd.id); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setActiveBoard(bd.id); scrollToBoard(bd.id); } }}>
              <span className={`bd-pagethumb${bd.aspect === "mobile" ? " mob" : ""}`}
                style={bd.bgImage ? { backgroundImage: `url(${bd.bgImage})` } : undefined}>
                {bd.items.length}
              </span>
              <span className="bd-pagename">{bd.name}</span>
              <span className="bd-pagectl">
                <button title={`Duplicate ${bd.name}`} onClick={(e) => { e.stopPropagation(); guardAddBoard(() => duplicateBoard(bd.id)); }}><Copy size={11} strokeWidth={2.4} /></button>
                <button title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveBoard(bd.id, -1); }}><ArrowUp size={11} strokeWidth={2.4} /></button>
                <button title="Move down" disabled={i === boards.length - 1} onClick={(e) => { e.stopPropagation(); moveBoard(bd.id, 1); }}><ArrowDown size={11} strokeWidth={2.4} /></button>
                <button title={`Delete ${bd.name}`} className="danger"
                  onClick={(e) => { e.stopPropagation(); if (bd.items.length === 0 || window.confirm(`Delete ${bd.name} and its ${bd.items.length} pieces?`)) removeBoard(bd.id); }}>
                  <X size={11} strokeWidth={2.4} />
                </button>
              </span>
            </div>
          ))}
          <button className="bd-addboard" onClick={() => guardAddBoard(addBoard)}><Plus size={13} strokeWidth={2.2} /> Add board</button>
        </div>

        {selIdsAll.length > 1 ? (
          <>
            <div className="bd-h" style={{ marginTop: 16 }}>Selected · {selIdsAll.length} pieces</div>
            <div className="bd-alignrow" role="group" aria-label="Align selection">
              {([["left", "Align left edges", AlignStartVertical],
                ["centerh", "Align horizontal centers", AlignCenterVertical],
                ["right", "Align right edges", AlignEndVertical],
                ["top", "Align top edges", AlignStartHorizontal],
                ["middlev", "Align vertical middles", AlignCenterHorizontal],
                ["bottom", "Align bottom edges", AlignEndHorizontal]] as const).map(([edge, tip, Icon]) => (
                <button key={edge} title={tip} aria-label={tip} onClick={() => alignSel(edge)}>
                  <Icon size={13} strokeWidth={2} />
                </button>
              ))}
            </div>
            <div className="bd-alignrow" role="group" aria-label="Distribute selection">
              <button title="Distribute horizontally — equal gaps, outer pieces planted (3+ pieces)"
                aria-label="Distribute horizontally" disabled={selIdsAll.length < 3}
                onClick={() => distributeSel("h")}>
                <AlignHorizontalSpaceBetween size={13} strokeWidth={2} />
              </button>
              <button title="Distribute vertically — equal gaps, outer pieces planted (3+ pieces)"
                aria-label="Distribute vertically" disabled={selIdsAll.length < 3}
                onClick={() => distributeSel("v")}>
                <AlignVerticalSpaceBetween size={13} strokeWidth={2} />
              </button>
            </div>
            <p className="bd-hint">Drag any selected piece to move the group. Arrow keys nudge (Shift strides). ⌘C then ⌘V on another board carries them over.</p>
            <button className="bd-abtool danger bd-removeall" onClick={() => { removeBoardItems(selIdsAll); setSelExtra([]); }}>
              <Trash2 size={12} strokeWidth={2.2} /> Remove {selIdsAll.length} pieces
            </button>
          </>
        ) : sel ? (
          <>
            <div className="bd-h" style={{ marginTop: 16 }}>Selected</div>
            <div className="bd-selname">{nameOf(sel)}{selBoard ? <em> · {selBoard.name}</em> : null}</div>
            {/* X/Y speak the piece's visible CENTER (owner: "snap from
                center") — typing the board midpoint centers a crosshair
                exactly. Stored coords stay corner-based; the offset maps. */}
            {(() => {
              const co = selBoard ? artCenterOffsetOf(selBoard.id, sel) : { cx: 0, cy: 0 };
              return (
                <div className="bd-row2">
                  <label>X <input type="number" value={Math.round(sel.x + co.cx)} onChange={(e) => moveBoardItem(sel.id, +e.target.value - co.cx, sel.y)} /></label>
                  <label>Y <input type="number" value={Math.round(sel.y + co.cy)} onChange={(e) => moveBoardItem(sel.id, sel.x, +e.target.value - co.cy)} /></label>
                </div>
              );
            })()}
            {/* big glyphs dive to 5% (match-3 tiles on a mobile board need
                ~12%); everything else keeps the 30% legibility floor. The
                typed entry exists because one slider pixel jumps several
                percent at the small end — the owner types 12 and gets 12. */}
            <label className="bd-slider"><span className="bd-sliderhead">Scale ·
              <ScaleEntry id={sel.id} pct={Math.round((sel.scale ?? 1) * 100)} min={Math.round(boardScaleMin(sel) * 100)} />%</span>
              <input type="range" min={Math.round(boardScaleMin(sel) * 100)} max={200} value={Math.round((sel.scale ?? 1) * 100)}
                onChange={(e) => scaleBoardItem(sel.id, +e.target.value / 100)} />
            </label>
            <label className="bd-slider">Rotation · {sel.rot ?? 0}°
              <input type="range" min={-45} max={45} value={sel.rot ?? 0}
                onChange={(e) => rotateBoardItem(sel.id, +e.target.value)} />
            </label>
            {/* instance dials live HERE too — the floating toolbar overlaps
                neighbours in tight stacks (owner: "placement of controls is
                problematic"); the rail is always readable */}
            {sel.kitId && STRETCHABLE.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="9-slice width — the track re-renders wider; caps and knob stay true. The side handles on the piece do the same by hand.">
                Width · {Math.round((sel.stretch ?? 1) * 100)}%
                <input type="range" min={70} max={300} value={Math.round((sel.stretch ?? 1) * 100)}
                  onChange={(e) => useGen.getState().stretchBoardItem(sel.id, +e.target.value / 100, sel.x)}
                  onDoubleClick={() => useGen.getState().stretchBoardItem(sel.id, 1, sel.x)} />
              </label>
            )}
            {sel.kitId && STRETCHABLE_V.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="9-slice height — the shell re-renders taller; walls and rim stay true. The top/bottom handles on the piece do the same by hand.">
                Height · {Math.round((sel.stretchY ?? 1) * 100)}%
                <input type="range" min={70} max={300} value={Math.round((sel.stretchY ?? 1) * 100)}
                  onChange={(e) => useGen.getState().stretchBoardItemV(sel.id, +e.target.value / 100, sel.y)}
                  onDoubleClick={() => useGen.getState().stretchBoardItemV(sel.id, 1, sel.y)} />
              </label>
            )}
            <label className="bd-slider" title="This piece's opacity — ghosted HUD layers, faded scenery. Double-click restores full strength. Exports honor it.">
              Opacity · {sel.opacity ?? 100}%
              <input type="range" min={0} max={100} value={sel.opacity ?? 100}
                onChange={(e) => useGen.getState().setBoardItemOpacity(sel.id, +e.target.value)}
                onDoubleClick={() => useGen.getState().setBoardItemOpacity(sel.id, null)} />
            </label>
            {sel.kitId && VALUE_DRIVEN.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="Value — this piece only (fill level, rarity tier, pose). Double-click to follow the kit again.">
                Value — this piece · {Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}%
                <input type="range" min={0} max={100} value={Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}
                  onChange={(e) => useGen.getState().setBoardItemVal(sel.id, +e.target.value / 100)}
                  onDoubleClick={() => useGen.getState().setBoardItemVal(sel.id, null)} />
              </label>
            )}
            {sel.kitId && KIT_LABEL_EDITABLE.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="Text — this copy only. Clear the field to follow the kit again. Double-clicking the piece on the stage edits in place.">
                The words — this copy
                <input className="bd-abname bd-words" maxLength={labelMaxOf(baseOf(sel.kitId))} aria-label="Instance text"
                  placeholder={kitLabels[sel.kitId] || "Text — this copy"}
                  value={sel.label ?? ""}
                  onChange={(e) => useGen.getState().setBoardItemLabel(sel.id, e.target.value)} />
              </label>
            )}
            {sel.kitId && (() => {
              /* per-copy drop shadow (owner: "you can't always tell if you
                 need a drop shadow at the editing level") — while on, it
                 REPLACES this copy's kit cast shadow; 0 or double-click
                 returns the kit's own. Dials open on the LAST recipe used
                 (sticky by owner mandate), so shadowing a whole screen is
                 dial-once, click-through. */
              const sh = sel.shadow;
              const patch = (p: Partial<NonNullable<typeof sh>> | null) => useGen.getState().setBoardItemShadow(sel.id, p);
              return (<>
                <label className="bd-slider" title="Drop shadow — this copy only. While on it replaces the kit's own cast shadow here; double-click (or 0) follows the kit again. Exports and Unity scenes carry it.">
                  Drop shadow — this copy · {sh?.s ?? 0}%
                  <input type="range" min={0} max={100} value={sh?.s ?? 0}
                    onChange={(e) => patch({ s: +e.target.value })}
                    onDoubleClick={() => patch(null)} />
                </label>
                {!sh?.s && boardShadowLast && (
                  <div className="bd-actions one">
                    <button title="Apply the last shadow you dialed — strength and pose together"
                      onClick={() => patch({ ...boardShadowLast })}>
                      Use my last shadow · {boardShadowLast.s}%
                    </button>
                  </div>
                )}
                {(sh?.s ?? 0) > 0 && (<>
                  <label className="bd-slider">Shadow X · {Math.round(sh!.x ?? 0)}px
                    <input type="range" min={-40} max={40} value={Math.round(sh!.x ?? 0)} onChange={(e) => patch({ x: +e.target.value })}
                      onDoubleClick={() => patch({ x: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow Y · {Math.round(sh!.y ?? 2 + (sh!.s ?? 0) * 0.1)}px
                    <input type="range" min={-40} max={40} value={Math.round(sh!.y ?? 2 + (sh!.s ?? 0) * 0.1)} onChange={(e) => patch({ y: +e.target.value })}
                      onDoubleClick={() => patch({ y: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow blur · {Math.round(sh!.blur ?? 2 + (sh!.s ?? 0) * 0.22)}px
                    <input type="range" min={0} max={60} value={Math.round(sh!.blur ?? 2 + (sh!.s ?? 0) * 0.22)} onChange={(e) => patch({ blur: +e.target.value })}
                      onDoubleClick={() => patch({ blur: undefined })} />
                  </label>
                  <div className="bd-note">Replaces the kit's cast shadow on THIS copy; in Unity it travels as the grounded shadow sibling — planted while the piece lifts and presses.</div>
                </>)}
              </>);
            })()}
            {sel.stamp && (() => {
              /* the stamp's own dials — instance-only, the kit's typography
                 never moves (owner: "basic controls… hue / saturation,
                 brightness/contrast", "drop shadow", "glow") */
              const st = sel.stamp;
              const patch = (p: Partial<typeof st>) => useGen.getState().setBoardItemStamp(sel.id, p);
              return (<>
                <div className="bd-h" style={{ marginTop: 14 }}>{st.plain ? "Plain text" : "Type stamp"}</div>
                {/* the WORDS, said out loud as a field (owner: "I need a way
                    to edit the text here on in the right menu") — type here
                    and the art follows live. One line by design: the
                    specimen renderer draws a single phrase. Double-click
                    the piece on the stage edits in place too. */}
                <label className="bd-slider" title="The words this piece shows — type and the art follows live. Double-clicking the piece on the stage edits in place.">
                  The words
                  <input className="bd-abname bd-words" value={st.text} maxLength={40} aria-label="Stamp text"
                    placeholder="Type the words…"
                    onChange={(e) => patch({ text: e.target.value })} />
                </label>
                {/* the two text tiers (owner): Splash = the kit's full
                    lettering treatment; Plain = the same face, one flat
                    pickable color, for labels that must READ anywhere */}
                <div className="bd-actions bd-fitrow" role="radiogroup" aria-label="Text tier">
                  <button className={!st.plain ? "on" : ""} role="radio" aria-checked={!st.plain}
                    title="The kit's full splash lettering — gradients, outline, glints, the works"
                    onClick={() => patch({ plain: undefined })}>Splash</button>
                  <button className={st.plain ? "on" : ""} role="radio" aria-checked={!!st.plain}
                    title="The kit's font at one flat color you pick — labels that stay readable on any backdrop"
                    onClick={() => { if (!st.plain) patch({ plain: { color: "#FFFFFF" } }); }}>Plain</button>
                </div>
                {st.plain && (
                  <label className="bd-slider bd-inkrow">Text color
                    <input type="color" value={st.plain.color} aria-label="Plain text color"
                      onChange={(e) => patch({ plain: { ...st.plain!, color: e.target.value } })} />
                    <label className="bd-inkchk"><input type="checkbox" checked={!!st.plain.outline}
                      onChange={(e) => patch({ plain: { ...st.plain!, outline: e.target.checked } })} /> Ink outline</label>
                  </label>
                )}
                <label className="bd-slider">Type size · {st.size}%
                  <input type="range" min={25} max={400} value={st.size} onChange={(e) => patch({ size: +e.target.value })} />
                </label>
                <label className="bd-slider">Hue · {st.hue ?? 0}°
                  <input type="range" min={-180} max={180} value={st.hue ?? 0} onChange={(e) => patch({ hue: +e.target.value })}
                    onDoubleClick={() => patch({ hue: 0 })} />
                </label>
                <label className="bd-slider">Saturation · {st.sat ?? 100}%
                  <input type="range" min={0} max={200} value={st.sat ?? 100} onChange={(e) => patch({ sat: +e.target.value })}
                    onDoubleClick={() => patch({ sat: 100 })} />
                </label>
                <label className="bd-slider">Brightness · {st.bright ?? 100}%
                  <input type="range" min={40} max={180} value={st.bright ?? 100} onChange={(e) => patch({ bright: +e.target.value })}
                    onDoubleClick={() => patch({ bright: 100 })} />
                </label>
                <label className="bd-slider">Contrast · {st.contrast ?? 100}%
                  <input type="range" min={40} max={180} value={st.contrast ?? 100} onChange={(e) => patch({ contrast: +e.target.value })}
                    onDoubleClick={() => patch({ contrast: 100 })} />
                </label>
                <label className="bd-slider">Drop shadow · {st.shadow ?? 0}%
                  <input type="range" min={0} max={100} value={st.shadow ?? 0} onChange={(e) => patch({ shadow: +e.target.value })} />
                </label>
                <label className="bd-slider">Glow · {st.glow ?? 0}%
                  <input type="range" min={0} max={100} value={st.glow ?? 0} onChange={(e) => patch({ glow: +e.target.value })} />
                </label>
                <div className="bd-ovmodes" role="radiogroup" aria-label="Warp style">
                  {(["none", "arc", "flag", "bulge"] as const).map((wsty) => (
                    <button key={wsty} className={(st.warp?.style ?? "none") === wsty ? "on" : ""} role="radio" aria-checked={(st.warp?.style ?? "none") === wsty}
                      onClick={() => patch({ warp: { style: wsty, amount: st.warp?.amount ?? 40 } })}>
                      {wsty === "none" ? "No warp" : wsty[0].toUpperCase() + wsty.slice(1)}
                    </button>
                  ))}
                </div>
                {(st.warp?.style ?? "none") !== "none" && (
                  <label className="bd-slider">Warp amount · {st.warp?.amount ?? 0}
                    <input type="range" min={-100} max={100} value={st.warp?.amount ?? 0}
                      onChange={(e) => patch({ warp: { style: st.warp!.style, amount: +e.target.value } })}
                      onDoubleClick={() => patch({ warp: { style: st.warp!.style, amount: 0 } })} />
                  </label>
                )}
                <div className="bd-note">The dials touch only THIS stamp — the kit's typography stays put. Glow wears the kit's Glow color.</div>
              </>);
            })()}
            {sel.big && (() => {
              /* the big glyph's own dials — instance-only, day one by
                 owner mandate ("off the bat I will want to add drop
                 shadows and glows to these"). The stamp dial grain. */
              const bg = sel.big;
              const patch = (p: Partial<typeof bg>) => useGen.getState().setBoardItemBig(sel.id, p);
              const gname = bigGlyphById(bg.gid)?.name ?? "Big glyph";
              return (<>
                <div className="bd-h" style={{ marginTop: 14 }}>{gname}</div>
                <label className="bd-slider">Drop shadow · {bg.shadow ?? 0}%
                  <input type="range" min={0} max={100} value={bg.shadow ?? 0} onChange={(e) => patch({ shadow: +e.target.value })} />
                </label>
                {(bg.shadow ?? 0) > 0 && (<>
                  <label className="bd-slider">Shadow X · {Math.round(bg.shadowX ?? 0)}px
                    <input type="range" min={-40} max={40} value={Math.round(bg.shadowX ?? 0)} onChange={(e) => patch({ shadowX: +e.target.value })}
                      onDoubleClick={() => patch({ shadowX: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow Y · {Math.round(bg.shadowY ?? 2 + (bg.shadow ?? 0) * 0.1)}px
                    <input type="range" min={-40} max={40} value={Math.round(bg.shadowY ?? 2 + (bg.shadow ?? 0) * 0.1)} onChange={(e) => patch({ shadowY: +e.target.value })}
                      onDoubleClick={() => patch({ shadowY: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow blur · {Math.round(bg.shadowBlur ?? 2 + (bg.shadow ?? 0) * 0.22)}px
                    <input type="range" min={0} max={60} value={Math.round(bg.shadowBlur ?? 2 + (bg.shadow ?? 0) * 0.22)} onChange={(e) => patch({ shadowBlur: +e.target.value })}
                      onDoubleClick={() => patch({ shadowBlur: undefined })} />
                  </label>
                </>)}
                <label className="bd-slider">Glow · {bg.glow ?? 0}%
                  <input type="range" min={0} max={100} value={bg.glow ?? 0} onChange={(e) => patch({ glow: +e.target.value })} />
                </label>
                {(bg.glow ?? 0) > 0 && (
                  <label className="bd-slider bd-inkrow">Glow ink
                    <input type="color" value={bg.glowInk ?? (cfg.effects.Glow ?? "#7DF9FF")} aria-label="Glow ink"
                      onChange={(e) => patch({ glowInk: e.target.value })} />
                    <label className="bd-inkchk"><input type="checkbox" checked={!bg.glowInk}
                      onChange={(e) => patch({ glowInk: e.target.checked ? undefined : (cfg.effects.Glow ?? "#7DF9FF") })} /> Kit's glow ink</label>
                  </label>
                )}
                <div className="bd-note">The dials touch only THIS copy. Glow follows the kit's Glow color until you pick your own; shadow pose dials reset on double-click.</div>
              </>);
            })()}
            {sel.logo && (() => {
              /* the user logo's own dials — the big glyph's exact grain,
                 one shared filter recipe across stage / PNG / Unity */
              const lg = sel.logo;
              const patch = (p: Partial<typeof lg>) => useGen.getState().setBoardItemLogo(sel.id, p);
              return (<>
                <div className="bd-h" style={{ marginTop: 14 }}>{nameOf(sel)}</div>
                <label className="bd-slider">Drop shadow · {lg.shadow ?? 0}%
                  <input type="range" min={0} max={100} value={lg.shadow ?? 0} onChange={(e) => patch({ shadow: +e.target.value })} />
                </label>
                {(lg.shadow ?? 0) > 0 && (<>
                  <label className="bd-slider">Shadow X · {Math.round(lg.shadowX ?? 0)}px
                    <input type="range" min={-40} max={40} value={Math.round(lg.shadowX ?? 0)} onChange={(e) => patch({ shadowX: +e.target.value })}
                      onDoubleClick={() => patch({ shadowX: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow Y · {Math.round(lg.shadowY ?? 2 + (lg.shadow ?? 0) * 0.1)}px
                    <input type="range" min={-40} max={40} value={Math.round(lg.shadowY ?? 2 + (lg.shadow ?? 0) * 0.1)} onChange={(e) => patch({ shadowY: +e.target.value })}
                      onDoubleClick={() => patch({ shadowY: undefined })} />
                  </label>
                  <label className="bd-slider">Shadow blur · {Math.round(lg.shadowBlur ?? 2 + (lg.shadow ?? 0) * 0.22)}px
                    <input type="range" min={0} max={60} value={Math.round(lg.shadowBlur ?? 2 + (lg.shadow ?? 0) * 0.22)} onChange={(e) => patch({ shadowBlur: +e.target.value })}
                      onDoubleClick={() => patch({ shadowBlur: undefined })} />
                  </label>
                </>)}
                <label className="bd-slider">Glow · {lg.glow ?? 0}%
                  <input type="range" min={0} max={100} value={lg.glow ?? 0} onChange={(e) => patch({ glow: +e.target.value })} />
                </label>
                {(lg.glow ?? 0) > 0 && (
                  <label className="bd-slider bd-inkrow">Glow ink
                    <input type="color" value={lg.glowInk ?? (cfg.effects.Glow ?? "#7DF9FF")} aria-label="Glow ink"
                      onChange={(e) => patch({ glowInk: e.target.value })} />
                    <label className="bd-inkchk"><input type="checkbox" checked={!lg.glowInk}
                      onChange={(e) => patch({ glowInk: e.target.checked ? undefined : (cfg.effects.Glow ?? "#7DF9FF") })} /> Kit's glow ink</label>
                  </label>
                )}
                <div className="bd-note">Your own art — the kit never restyles it. The dials touch only THIS copy; glow follows the kit's Glow color until you pick your own.</div>
              </>);
            })()}
            {/* stacking order — items render in array order, later = on top
                (owner: "need some layering/stacking order controls") */}
            <div className="bd-h" style={{ marginTop: 14 }}>Layer</div>
            <div className="bd-layer" role="group" aria-label="Stacking order">
              <button title="Bring to front (⇧⌘])" onClick={() => useGen.getState().reorderBoardItem(sel.id, "front")}>
                <BringToFront size={13} strokeWidth={2.2} /> Front
              </button>
              <button title="Bring forward (⌘])" onClick={() => useGen.getState().reorderBoardItem(sel.id, "forward")}>
                <ArrowUp size={13} strokeWidth={2.2} /> Up
              </button>
              <button title="Send backward (⌘[)" onClick={() => useGen.getState().reorderBoardItem(sel.id, "backward")}>
                <ArrowDown size={13} strokeWidth={2.2} /> Down
              </button>
              <button title="Send to back (⇧⌘[)" onClick={() => useGen.getState().reorderBoardItem(sel.id, "back")}>
                <SendToBack size={13} strokeWidth={2.2} /> Back
              </button>
            </div>
            <div className="bd-actions">
              {sel.kitId && (
                <button onClick={() => { useGen.getState().setFocus(sel.kitId!); useGen.getState().setPhase("master"); }}
                  title="Open this component in the editor — every control shapes it live">
                  <SquarePen size={13} strokeWidth={2.2} /> Edit component
                </button>
              )}
              <button onClick={() => duplicateBoardItem(sel.id)} title="Duplicate this piece (⌘D)">
                <Copy size={13} strokeWidth={2.2} /> Duplicate
              </button>
              {sel.kitId && (
                /* rehomed from the retired floating tray — its one unique.
                   The owner's FORWARD-button worry: a piece reworked on the
                   Board (words, value, the component's current look) freezes
                   into a named asset — the master keeps its own life. */
                <button title="Save to my assets — this piece, with this look and label, becomes a reusable asset. The master component stays untouched."
                  onClick={() => {
                    const def = sel.label ?? kitClones[sel.kitId!]?.name ?? KIT_COMPONENTS.find((c) => c.id === baseOf(sel.kitId!))?.name ?? "My asset";
                    const name = window.prompt("Save this piece to your assets as:", def);
                    if (name?.trim()) useGen.getState().saveBoardItemAsAsset(sel.id, name.trim());
                  }}>
                  <BookmarkPlus size={13} strokeWidth={2.2} /> Save to my assets
                </button>
              )}
              <button onClick={() => guardExport(() => { const p = svgOf(sel); void svgWithFaces(p.svg, p.cfg).then((s) => downloadSvg(s, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)); })}
                title="This piece as a crisp, infinitely scalable SVG">
                <Download size={13} strokeWidth={2.2} /> SVG
              </button>
              <button onClick={() => guardExport(() => { const p = svgOf(sel); void downloadPieceRaster(p, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`); })}
                title="This piece as a transparent-background PNG at 2× — drops straight into an engine or a mockup">
                <Download size={13} strokeWidth={2.2} /> PNG
              </button>
              <button className="danger" onClick={() => removeBoardItem(sel.id)} title="Remove (Delete)">
                <Trash2 size={13} strokeWidth={2.2} /> Remove
              </button>
            </div>
            {sel.kitId && <div className="bd-note"><Lock size={11} strokeWidth={2.2} /> Live asset — restyling the kit restyles this piece.</div>}
          </>
        ) : act ? (
          <>
            <div className="bd-h" style={{ marginTop: 16 }}>Background · {act.name}</div>
            {/* bundled scenes — one click dresses the board (the last tile
                is a looping mp4; a PNG export uses its first frame) */}
            <div className="bd-bggrid" aria-label="Bundled backdrops">
              {BACKDROPS.map((bk) => (
                <button key={bk.url} className="bd-bgthumb" title={bk.name}
                  aria-pressed={act.bgImage === bk.url || act.bgVideo === bk.url}
                  onClick={() => (bk.video ? setVideoBg(bk.url, "backdrop poster") : setBoardBg({ bgImage: bk.url, bgVideo: null, bgShow: true }))}>
                  {bk.video ? <video src={bk.url} muted preload="metadata" playsInline /> : <img src={bk.url} alt="" loading="lazy" />}
                  <i>{bk.name}</i>
                </button>
              ))}
            </div>
            {/* the scene library — staged behind the admin flag, and absent
                entirely in cloud-less builds (no bucket to stream from) */}
            {isAdmin && backdropUrl("any") !== null && (
              <BackdropLibrary aspect={act.aspect} current={act.bgImage}
                apply={(url) => setBoardBg({ bgImage: url, bgVideo: null, bgShow: true })} />
            )}
            {/* bring-your-own loop: any direct https .mp4/.webm link — a plain
                string, so it persists like the bundled scenes */}
            <div className="bd-vurl">
              <input value={vidUrl} placeholder="…or paste a direct video URL (.mp4)" aria-label="Video backdrop URL"
                onChange={(e) => { setVidUrl(e.target.value); setVidErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && vidUrl.trim() && !vidBusy) void applyVideoUrl(); }} />
              <button disabled={vidBusy || !vidUrl.trim()} onClick={() => void applyVideoUrl()}>{vidBusy ? "…" : "Set"}</button>
            </div>
            {vidErr && <div className="bd-note bd-vurl-err" role="alert">{vidErr}</div>}
            {(act.bgImage || act.bgVideo) ? (
              <>
                {act.bgImage
                  ? <div className="bd-bgprev" style={{ backgroundImage: `url(${act.bgImage})` }} />
                  : <video className="bd-bgprev" src={act.bgVideo!} autoPlay muted loop playsInline />}
                <div className="bd-actions">
                  <button onClick={() => bgInput.current?.click()}><ImagePlus size={13} strokeWidth={2.2} /> Replace</button>
                  <button className="danger" onClick={() => setBoardBg({ bgImage: null, bgVideo: null })}><X size={13} strokeWidth={2.2} /> Clear</button>
                </div>
                {/* image backdrops choose how they meet the frame: Fill crops
                    to cover, Fit shows the whole scene over a blurred fill —
                    the cure for art whose aspect isn't the board's (owner:
                    portrait scenes read "too big" on the mobile stage) */}
                {act.bgImage && (
                  <div className="bd-actions bd-fitrow" role="radiogroup" aria-label="Background fit">
                    <button className={(act.bgFit ?? "cover") === "cover" ? "on" : ""} role="radio" aria-checked={(act.bgFit ?? "cover") === "cover"}
                      title="Fill the board — the scene covers the frame; overflow is cropped"
                      onClick={() => setBoardBg({ bgFit: "cover" })}>Fill</button>
                    <button className={act.bgFit === "fit" ? "on" : ""} role="radio" aria-checked={act.bgFit === "fit"}
                      title="Show the whole scene — nothing cropped, a blurred fill behind"
                      onClick={() => setBoardBg({ bgFit: "fit" })}>Fit</button>
                  </div>
                )}
                <label className="bd-slider">Opacity · {act.bgOpacity ?? 100}%
                  <input type="range" min={10} max={100} value={act.bgOpacity ?? 100} onChange={(e) => setBoardBg({ bgOpacity: +e.target.value })} />
                </label>
                <label className="bd-slider">Blur · {act.bgBlur ?? 0}px
                  <input type="range" min={0} max={14} value={act.bgBlur ?? 0} onChange={(e) => setBoardBg({ bgBlur: +e.target.value })} />
                </label>
                <label className="bd-slider">Saturation · {act.bgSat ?? 100}%
                  <input type="range" min={0} max={100} value={act.bgSat ?? 100} onChange={(e) => setBoardBg({ bgSat: +e.target.value })} />
                </label>
                <label className="bd-slider">Hue · {act.bgHue ?? 0}°
                  <input type="range" min={-180} max={180} value={act.bgHue ?? 0} onChange={(e) => setBoardBg({ bgHue: +e.target.value })}
                    onDoubleClick={() => setBoardBg({ bgHue: 0 })} />
                </label>
                <label className="bd-slider">Brightness · {act.bgBright ?? 100}%
                  <input type="range" min={40} max={180} value={act.bgBright ?? 100} onChange={(e) => setBoardBg({ bgBright: +e.target.value })}
                    onDoubleClick={() => setBoardBg({ bgBright: 100 })} />
                </label>
                <label className="bd-slider">Contrast · {act.bgContrast ?? 100}%
                  <input type="range" min={40} max={180} value={act.bgContrast ?? 100} onChange={(e) => setBoardBg({ bgContrast: +e.target.value })}
                    onDoubleClick={() => setBoardBg({ bgContrast: 100 })} />
                </label>
                <label className="bd-slider">Noise · {act.bgNoise ?? 0}%
                  <input type="range" min={0} max={100} value={act.bgNoise ?? 0} onChange={(e) => setBoardBg({ bgNoise: +e.target.value })} />
                </label>
                <div className="bd-note">
                  {act.bgVideo
                    ? act.bgVideo.startsWith("blob:")
                      ? "Your uploaded loop plays for this session only — bundled scenes, images and pasted URLs stick around."
                      : act.bgVideo.startsWith("/")
                        ? "The loop plays on the live board; a PNG export uses its first frame."
                        : "A remote loop plays on the live board and persists; the PNG export can include its frame only when the host allows it (CORS)."
                    : "The image crops to the board bounds — cover fit, nothing spills."}
                </div>
              </>
            ) : (
              <div className="bd-actions one">
                <button onClick={() => bgInput.current?.click()}><ImagePlus size={13} strokeWidth={2.2} /> Upload your own — image or mp4</button>
              </div>
            )}
            <BgKeepsafeLine />
            <input ref={bgInput} type="file" accept="image/*,video/mp4,video/webm" hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.type.startsWith("video/")) setVideoBg(URL.createObjectURL(f), f.name + " (poster)");
                  /* ONE copy, in the vault: the ship copy (≤1920) is also
                     the display image, served as a session object URL — the
                     board DOC carries only the tiny bgAssetId, so history,
                     saves and cloud sync never drag pixels (field crash).
                     Signed in, importBgAsset also sends the copy to the
                     account's bucket so it's still there on any browser. */
                  else void normalizeShipCopy(f).then(async (ship) => {
                    const assetId = await importBgAsset(ship, f.name);
                    setBoardBg({ bgImage: URL.createObjectURL(ship), bgAssetId: assetId, bgVideo: null, bgShow: true });
                  });
                }
                e.target.value = "";
              }} />
            <div className="bd-h" style={{ marginTop: 18 }}>Overlay</div>
            <div className="bd-ovmodes" role="radiogroup" aria-label="Overlay mode">
              {(["none", "dark", "light", "vignette"] as const).map((m) => (
                <button key={m} className={(act.ovMode ?? "none") === m ? "on" : ""} role="radio" aria-checked={(act.ovMode ?? "none") === m}
                  onClick={() => setBoardBg({ ovMode: m })}>
                  {m === "none" ? "None" : m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {(act.ovMode ?? "none") !== "none" ? (
              <>
                <label className="bd-slider">Strength · {act.ovStrength ?? 45}%
                  <input type="range" min={0} max={100} value={act.ovStrength ?? 45} onChange={(e) => setBoardBg({ ovStrength: +e.target.value })} />
                </label>
                <label className="bd-slider">Noise · {act.ovNoise ?? 0}%
                  <input type="range" min={0} max={100} value={act.ovNoise ?? 0} onChange={(e) => setBoardBg({ ovNoise: +e.target.value })} />
                </label>
                <label className="bd-select">Blend
                  <select value={act.ovBlend ?? "normal"} aria-label="Overlay blend mode"
                    onChange={(e) => setBoardBg({ ovBlend: e.target.value as BoardDef["ovBlend"] })}>
                    {(["normal", "multiply", "screen", "overlay", "soft-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <div className="bd-note">Sits between the backdrop and your pieces — knock the art back so components pop. Exports include it.</div>
              </>
            ) : (
              <div className="bd-note">A dark, light or vignetted wash with film grain, between the backdrop and the pieces.</div>
            )}
            <label className="bd-slider" title="Dims the middle of the frame — the move games make behind menus so the UI pops. Stacks with the overlay above, or works alone.">
              Center scrim · {act.ovCenter ?? 0}%
              <input type="range" min={0} max={100} value={act.ovCenter ?? 0}
                onChange={(e) => setBoardBg({ ovCenter: +e.target.value })}
                onDoubleClick={() => setBoardBg({ ovCenter: 0 })} />
            </label>
            <div className="bd-h" style={{ marginTop: 18 }}>Stage</div>
            <div className="bd-note">{act.name} · {STAGE[act.aspect][0]} × {STAGE[act.aspect][1]} · shown at {Math.round(fitOf(act) * 100)}% · Export renders at full resolution.</div>
          </>
        ) : null}
      </aside>

      {/* the starter landing modal — GateModal's chrome, three honest
          choices; the backdrop click or × walks away with nothing dealt */}
      {starterAsk && (
        <div className="lootback" role="dialog" aria-modal="true" aria-label="Where should this starter land?"
          onClick={() => setStarterAsk(null)}>
          <div className="lootmodal gatemodal" onClick={(e) => e.stopPropagation()}>
            <span className="lootgrid" aria-hidden="true" />
            <button className="lootclose" aria-label="Close" onClick={() => setStarterAsk(null)}><X size={16} strokeWidth={2.2} /></button>
            <div className="lootkicker"><LayoutTemplate size={14} strokeWidth={2.2} /> STARTER SCREEN</div>
            <h2>THIS BOARD HAS <span className="lootgrad">PIECES</span></h2>
            <p className="lootsub">
              <b>{starterAsk}</b> is ready to deal. Where should it land?
            </p>
            <button className="lootclaim" onClick={() => { const t = starterAsk; setStarterAsk(null); guardAddBoard(() => applyStarter(t, "fresh")); }}>
              <Plus size={15} strokeWidth={2.4} /> A FRESH BOARD
            </button>
            <button className="lootclaim" onClick={() => { const t = starterAsk; setStarterAsk(null); applyStarter(t, "replace"); }}>
              <Copy size={15} strokeWidth={2.4} /> REPLACE THESE PIECES — BACKDROP STAYS
            </button>
            <button className="gatequiet" onClick={() => { const t = starterAsk; setStarterAsk(null); applyStarter(t, "stack"); }}>
              Add on top of what's here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* The keep-safe line under the import control (owner: "when I or a user
   uploads an image we need to know it's gonna be there when we return").
   Guests get the quiet sign-in nudge — their uploads die with this
   browser's cache; account holders get the quiet meter ("34 MB of
   50 MB"), refreshed whenever an asset moves. Cloud off → nothing. */
function BgKeepsafeLine() {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    const refresh = () => { void bgAssetStatusLine().then((s) => { if (!dead) setLine(s); }); };
    refresh();
    const off = onAssetActivity(refresh);
    return () => { dead = true; off(); };
  }, []);
  return line ? <div className="bd-note bd-keepsafe">{line}</div> : null;
}

/** One piece on the stage — draggable, selectable, optionally rotated.
 *  The wrapper takes the art's MEASURED size × scale, so the selection
 *  box always hugs the piece at any scale. Selection grows the on-piece
 *  controls (ported from the homepage board): a floating toolbar above
 *  the shell and a corner drag handle that resizes in place. */
/* A stamp on the stage. Unwarped: the crisp svg itself, restyling live.
   Warped: the svg rasters through the SAME warp op the exports use, so the
   preview is the export. HARDENED after a field crash report ("chrome
   keeps crashing"): re-rasters are debounced past drag ticks, previews cap
   at 2048px (exports still render full-res, one-shot), and frames live as
   object URLs that revoke their predecessor — the old data-URL-per-tick
   version could park hundreds of MB in renderer memory during one drag. */
/* The stage's big-glyph art rides the TIERED rasters, never the original
   (the owner's "boards take a long time to load" round — 8 placed glyphs
   used to pull ~4.4MB of full PNGs just to display at ~400 board px).
   Progressive: the 128 rail thumb (~3KB, usually already cached) paints
   the instant the board opens, and the 512 mid webp (~20KB) swaps in when
   it arrives. The ORIGINAL still feeds every bake — the board PNG
   compositor and the Unity scene/prefab export read bigGlyphUrl untouched,
   so shipped pixels are byte-identical to before this round. A glyph
   whose mid raster hasn't been cut yet (a future drop) falls back to the
   original rather than staying a blurry thumb. */
function BigGlyphStageArt({ cfg, gl, fx }: { cfg: GenConfig; gl: BigGlyphDef; fx: BigGlyphFx }) {
  const [src, setSrc] = useState(() => bigGlyphThumb(gl.id));
  useEffect(() => {
    let dead = false;
    const im = new Image();
    im.onload = () => { if (!dead) setSrc(bigGlyphMid(gl.id)); };
    im.onerror = () => { if (!dead) setSrc(bigGlyphUrl(gl.id)); };
    im.src = bigGlyphMid(gl.id);
    return () => { dead = true; };
  }, [gl.id]);
  const w = Math.round(gl.w * BIG_GLYPH_BASE), h = Math.round(gl.h * BIG_GLYPH_BASE);
  /* data-soft marks the 128px thumb still awaiting its mid swap — the
     boards curtain reads it as "art not sharpened yet", honest progress */
  return <img src={src} width={w} height={h} data-shell={`0 0 ${w} ${h}`} draggable={false}
    data-soft={src.includes("bigglyph-thumbs") ? "1" : undefined}
    alt={gl.name} style={{ display: "block", filter: bigGlyphFilter(cfg, fx) }} />;
}

/* A user logo on the stage — the same footprint contract as a big glyph
   (natural raster × BIG_GLYPH_BASE), the same instance-dial filter. The
   pixels come from the display-url cache (vault-first, then the
   account's cloud copy), so a synced browser paints the logo the moment
   the bytes resolve; until then a correctly-sized blank keeps the
   selection box and drags honest. */
function UserLogoStageArt({ cfg, ua, fx }: { cfg: GenConfig; ua: UserAsset; fx: UserLogoFx }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    void bgAssetDisplayUrl(ua.ref).then((u) => { if (!dead) setSrc(u); }).catch(() => { /* stays blank */ });
    return () => { dead = true; };
  }, [ua.ref]);
  const w = Math.round(ua.w * BIG_GLYPH_BASE), h = Math.round(ua.h * BIG_GLYPH_BASE);
  if (!src) return <span data-shell={`0 0 ${w} ${h}`} aria-label={ua.name} style={{ display: "block", width: w, height: h }} />;
  return <img src={src} width={w} height={h} data-shell={`0 0 ${w} ${h}`} draggable={false}
    alt={ua.name} style={{ display: "block", filter: bigGlyphFilter(cfg, { gid: "", ...fx }) }} />;
}

/** The drawer tile's thumb — the display-url cache again (one object URL
 *  per asset for the page's lifetime, the no-flicker contract). */
function UserAssetThumbImg({ ua }: { ua: UserAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    void bgAssetDisplayUrl(ua.ref).then((u) => { if (!dead) setSrc(u); }).catch(() => { /* tile stays blank */ });
    return () => { dead = true; };
  }, [ua.ref]);
  return src
    ? <img src={src} alt={ua.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: 64 }} />
    : <span aria-hidden="true" style={{ display: "block", width: 40, height: 40, borderRadius: 8, background: "rgba(127,127,127,0.15)" }} />;
}

/* ── the boards curtain — the kit page's loading language, spoken on the
   desk (owner: "after we click boards, we need to see loading bars/
   feedback (or maybe we 'load' it like we do the the kit with a loading
   screen, but only if necessary?)"). Both halves honored:
   · only if necessary — the no-flicker contract: nothing shows unless
     the ENTRY board is still visually incomplete past a 250ms grace
     (warm revisits and fast loads never see it); once shown it holds a
     400ms minimum beat so it never strobes in and out.
   · honest feedback — progress is read off the real stage, never
     theater: the entry board's own images (backdrop, saved-asset art,
     big-glyph rasters still wearing their 128px thumb awaiting the mid
     swap — the data-soft mark), the backdrop video's first frame, and
     the document fonts. The bar is monotonic; a stalled asset can't
     trap the desk (8s failsafe).
   Entry moment only: later board switches ride the hydration sweep's
   existing instant path and stay curtain-free. */
function BoardCurtain() {
  const name = useGen((s) => s.boards.find((b) => b.id === s.activeBoard)?.name);
  const accent = useGen((s) => s.cfg.effects.Bevel ?? "#0E9CC9");
  const [mode, setMode] = useState<"grace" | "on" | "leaving" | "gone">("grace");
  const [prog, setProg] = useState({ p: 0.08, stage: "Setting the desk" });
  const entry = useRef<string | null>(null);
  if (entry.current === null) entry.current = useGen.getState().activeBoard;
  const pMax = useRef(0.08);
  useEffect(() => {
    let dead = false;
    let shownAt = 0;
    const t0 = Date.now();
    const read = () => {
      const el = document.querySelector(`[data-board="${entry.current}"]`);
      if (!el) return { done: false, p: 0.08, stage: "Setting the desk" };
      /* the stage frame commits a beat BEFORE its art (artBeat) — an
         imageless read in that window must not pass for "complete" */
      if (!el.querySelector(".bd-canvas")) return { done: false, p: 0.14, stage: "Setting the desk" };
      const imgs = [...el.querySelectorAll("img")];
      const soft = el.querySelectorAll("img[data-soft]").length;
      const ok = Math.max(0, imgs.filter((im) => im.complete && im.naturalWidth > 0).length - soft);
      const vid = el.querySelector("video");
      const vidOk = !vid || vid.readyState >= 2;
      const fonts = !document.fonts || document.fonts.status === "loaded";
      const artP = imgs.length ? ok / imgs.length : 1;
      return {
        done: artP >= 1 && vidOk && fonts,
        p: 0.18 + 0.12 * (fonts ? 1 : 0) + 0.12 * (vidOk ? 1 : 0) + 0.58 * artP,
        stage: artP < 1 ? (soft ? "Sharpening the glyph art" : "Dressing the boards")
          : !vidOk ? "Starting the backdrop" : !fonts ? "Loading typefaces" : "Polishing",
      };
    };
    const iv = window.setInterval(() => {
      if (dead) return;
      const st = read();
      const now = Date.now();
      if (shownAt === 0) {
        // the grace window — resolve fast and nothing ever shows
        if (st.done) { dead = true; window.clearInterval(iv); setMode("gone"); return; }
        if (now - t0 >= 250) { shownAt = now; setMode("on"); }
        return;
      }
      pMax.current = Math.max(pMax.current, st.p);
      setProg({ p: pMax.current, stage: st.stage });
      if (st.done || now - t0 > 8000) {
        dead = true; window.clearInterval(iv);
        window.setTimeout(() => {
          setMode("leaving");
          window.setTimeout(() => setMode("gone"), 460);
        }, Math.max(0, shownAt + 400 - Date.now()));
      }
    }, 120);
    return () => { dead = true; window.clearInterval(iv); };
  }, []);
  if (mode === "grace" || mode === "gone") return null;
  return (
    <div className={`bd-curtain${mode === "leaving" ? " leaving" : ""}`} role="status" aria-live="polite">
      <div className="kp-curtainbox">
        <span className="kp-curtainkicker">UI Kit Maker</span>
        <h2 className="kp-curtaintitle">Setting up {name ?? "the boards"}</h2>
        <div className="kp-curtainbar" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, prog.p) * 100)}%`, background: accent }} /></div>
        <span className="kp-curtainstage">{prog.stage}…</span>
      </div>
    </div>
  );
}

/* The Scale row's typed entry — one slider pixel jumps several percent at
   the small end of a 5–200 range, so precise tile sizes (the owner's
   match-3 12%) get typed instead. Draft-buffered: "12" must not commit as
   a floor-clamped "1" mid-keystroke and rewrite the field under the
   caret; only in-range values commit, blur (or Enter) resyncs. */
function ScaleEntry({ id, pct, min }: { id: string; pct: number; min: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [id]);
  return (
    <input className="bd-scalenum" type="number" min={min} max={200} aria-label="Scale percent"
      value={draft ?? pct}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const n = Math.round(+v);
        if (Number.isFinite(n) && n >= min && n <= 200) useGen.getState().scaleBoardItem(id, n / 100);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

function StampArt({ cfg, stamp }: { cfg: GenConfig; stamp: NonNullable<BoardItem["stamp"]> }) {
  /* glint stars snap to REAL letterform ink — a stamp rendered before its
     face finished loading snapped to the fallback font's run (the drifting
     stars). Re-render when faces land; the un-cached ink map re-samples. */
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const bump = () => setFontTick((t) => t + 1);
    try { document.fonts?.addEventListener?.("loadingdone", bump); } catch { /* engines without FontFaceSet events */ }
    return () => { try { document.fonts?.removeEventListener?.("loadingdone", bump); } catch { /* symmetric */ } };
  }, []);
  /* a 400% specimen is a real engine render — memo it, or every board
     interaction re-renders every stamp (the tray-click sluggishness) */
  const svg = useMemo(() => stampSvg(cfg, stamp), [cfg, stamp.text, stamp.size, stamp.plain?.color, stamp.plain?.outline, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const warped = !!stamp.warp && stamp.warp.style !== "none" && !!stamp.warp.amount;
  const [frame, setFrame] = useState<{ url: string; w: number; h: number; shell: [number, number, number, number] | null } | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!warped) {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
      setFrame(null); return;
    }
    let on = true;
    const t = window.setTimeout(() => {
      /* the raster trip is sealed — the kit face must ride INSIDE the svg
         or the warped preview speaks a system font (owner report) */
      void svgWithFaces(svg, cfg).then((svgF) => {
        if (!on) return;
        const img = new Image();
        img.onload = () => {
          if (!on) return;
          const k = Math.min(1, 2048 / Math.max(1, img.width));
          const cv0 = document.createElement("canvas");
          cv0.width = Math.max(1, Math.round(img.width * k));
          cv0.height = Math.max(1, Math.round(img.height * k));
          cv0.getContext("2d")!.drawImage(img, 0, 0, cv0.width, cv0.height);
          const wc = warpStampRaster(cv0, cv0.width, cv0.height, stamp.warp!);
          /* the warp frame carries padding the lettering never fills — scan
             the raster's true alpha bounds so the selection box (and grab
             area) hugs the actual type, not the canvas (owner: boxes must
             adhere "to the actual type stamp area") */
          let shell: [number, number, number, number] | null = null;
          try {
            const d = wc.getContext("2d")!.getImageData(0, 0, wc.width, wc.height).data;
            let x0 = wc.width, y0 = wc.height, x1 = 0, y1 = 0;
            for (let py = 0; py < wc.height; py += 2) for (let px = 0; px < wc.width; px += 2) {
              if (d[(py * wc.width + px) * 4 + 3] > 8) {
                if (px < x0) x0 = px; if (px > x1) x1 = px;
                if (py < y0) y0 = py; if (py > y1) y1 = py;
              }
            }
            if (x1 > x0) shell = [x0 / k, y0 / k, (x1 - x0) / k, (y1 - y0) / k];
          } catch { /* tainted or empty — the full frame remains the box */ }
          wc.toBlob((bl) => {
            if (!on || !bl) return;
            const u = URL.createObjectURL(bl);
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = u;
            setFrame({ url: u, w: wc.width / k, h: wc.height / k, shell });
          });
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgF)));
      });
    }, 130); // one raster per settled dial position, not per tick
    return () => { on = false; window.clearTimeout(t); };
  }, [svg, warped, stamp.warp?.style, stamp.warp?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  /* the raster frame is grab-inert: draggable images invite the browser's
     NATIVE drag (a ghost image + pointercancel that kills our capture-based
     move — owner: "hard to grab and move around"), and pointer-events pass
     through so the StagePiece wrapper owns every press */
  return warped && frame
    ? <img src={frame.url} width={frame.w} height={frame.h} draggable={false}
        data-shell={frame.shell ? frame.shell.map((n) => n.toFixed(1)).join(" ") : undefined}
        style={{ filter: stampFilter(cfg, stamp), display: "block", pointerEvents: "none", userSelect: "none" }} alt="" />
    : <span style={{ filter: stampFilter(cfg, stamp), display: "block" }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* depth guard for the shell-miss relay below — dispatchEvent is
   synchronous, so a simple counter bounds any pathological stack */
let boardRelay = 0;
function StagePiece({ b, playing, selected, solo, fit, onSelect, onDragStart, onDragMove, onDragEnd, onTextEdit }: {
  b: BoardItem; playing: boolean; selected: boolean;
  /** the ONE selected piece — toolbar and transform handles only render solo,
   *  so a multi-selection stays a clean field of boxes */
  solo: boolean; fit: number;
  onSelect: (e?: React.PointerEvent) => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  /** word-bearing pieces only (stamps, label-editable kit copies):
   *  double-click opens the in-place words editor. Selection, drag and
   *  the marquee are untouched — dblclick is two stationary clicks. */
  onTextEdit?: () => void;
}) {
  const { cfg, library, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitNoText, kitVals, kitRow, kitBar, kitTextOy, kitTextOx, kitSlotVals, kitSubs, userAssets } = useGen();
  const sc = b.scale ?? 1;
  /* THE FREEZE FIX, part 1 (owner: "Page Unresponsive", every Board visit
     with a backdrop). A fresh applyKitDesign object here on every render
     defeated LiveArt's svg memo, and the renderer's per-call gradient ids
     make byte-different svg for identical input — so each render rewrote
     the DOM, the measurement MutationObserver below fired a microtask,
     setDim scheduled more sync work, and the whole cycle starved the
     event loop forever (CanvasView's deferred cfg lane never caught up).
     A stable fork object breaks the cycle at its source. */
  const kd = b.kitId ? kitDesigns[b.kitId] : undefined;
  const ktf = b.kitId ? kitTextFill[b.kitId] : undefined;
  /* a dialed instance shadow calms the kit's own cast/contact for THIS
     copy (the replace rule) — the dialed silhouette shadow paints as a
     CSS filter on the scaled wrapper below, so it hugs the rendered
     alpha exactly (kitShadowFilter, the one shared recipe) */
  const shOn = !!(b.kitId && b.shadow?.s);
  const forkCfg = useMemo(
    () => (b.kitId ? ((c) => (shOn ? suppressCastShadow(c) : c))(applyKitTextFill(applyKitDesign(cfg, kd), ktf)) : cfg),
    [cfg, b.kitId, kd, ktf, shOn],
  );
  const artRef = useRef<HTMLDivElement>(null);
  // corner-handle resize: screen-px delta → scale, against the piece's
  // unscaled on-screen width captured at grab time
  const rsz = useRef<{ x0: number; y0: number; s0: number; hx: number; anchorX: number; anchorY: number; handX: number; handY: number; shx: number; shy: number; shw: number; shh: number; axf: number; ayf: number } | null>(null);
  // 9-slice side-handle gesture (bar family): stretch factor + planted edge
  const str = useRef<{ x0: number; st0: number; shw0: number; bx0: number; hx: number } | null>(null);
  // the vertical twin (blank panels): height stretch + planted edge
  const strv = useRef<{ y0: number; st0: number; shh0: number; by0: number; hy: number } | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number; shell: [number, number, number, number] | null } | null>(null);
  /* PRIMARY dim source (drift hardening): LiveArt reports width/height/
     data-shell parsed from its memoized svg STRING in a layout effect —
     the overlay updates in the same paint as the art, with no DOM read
     and no observer race. A string without a shell stamp keeps the last
     known shell; the observer's getBBox fallback below owns that case. */
  const onArtDim = useCallback((a: { w: number; h: number; shell: [number, number, number, number] | null }) => {
    setDim((d) => {
      const shell = a.shell ?? d?.shell ?? null;
      return d && d.w === a.w && d.h === a.h && String(d.shell) === String(shell) ? d : { w: a.w, h: a.h, shell };
    });
  }, []);
  useEffect(() => {
    const host = artRef.current;
    if (!host) return;
    const read = () => {
      const svg = host.querySelector("svg");
      let w = svg ? parseFloat(svg.getAttribute("width") ?? "0") : 0;
      let h = svg ? parseFloat(svg.getAttribute("height") ?? "0") : 0;
      /* a WARPED stamp is an <img> frame, not an svg — without this branch
         the wrapper keeps its unwarped size, the bent lettering pokes
         outside the hit area, and the piece is barely grabbable */
      let imgShell: [number, number, number, number] | null = null;
      if (!svg) {
        const img = host.querySelector("img");
        if (img) {
          w = parseFloat(img.getAttribute("width") ?? "0"); h = parseFloat(img.getAttribute("height") ?? "0");
          const raw = img.getAttribute("data-shell")?.split(" ").map(Number);
          if (raw && raw.length === 4 && raw.every(Number.isFinite)) imgShell = raw as [number, number, number, number];
        }
      }
      /* The selection box trusts the engine's own data-shell stamp — the
         rect that hugs the component's silhouette. The old getBBox union
         counted EVERY drawn geometry (contact-shadow ellipses, auras,
         specimen slack), which read as boxes far larger than the art
         (owner: "the bounding boxes for everything is huge"). getBBox
         stays as the fallback for svgs without the stamp. */
      let shell: [number, number, number, number] | null = imgShell;
      if (svg) {
        const raw = svg.getAttribute("data-shell")?.split(" ").map(Number);
        if (raw && raw.length === 4 && raw.every(Number.isFinite)) shell = raw as [number, number, number, number];
        if (!shell) {
          try {
            const bb = (svg as SVGGraphicsElement).getBBox();
            const vb = (svg as SVGSVGElement).viewBox?.baseVal;
            if (bb && bb.width > 0 && bb.height > 0 && vb && vb.width > 0) {
              const kx = w / vb.width || 1, ky = h / vb.height || 1;
              const padX = vb.x < 0 ? vb.x : 0, padY = vb.x < 0 ? vb.x : 0; // LiveArt margins reclaim the x-derived pad on both axes
              shell = [(bb.x - vb.x) * kx + padX, (bb.y - vb.y) * ky + padY, bb.width * kx, bb.height * ky];
            }
          } catch { /* detached / display:none — no shell, box falls back to the full canvas */ }
        }
      }
      if (w && h) setDim((d) => (d && d.w === w && d.h === h && String(d.shell) === String(shell) ? d : { w, h, shell }));
    };
    read();
    /* THE FREEZE FIX, part 2: MutationObserver callbacks are microtasks —
       measuring (and setting state) directly from one lets a re-render's
       DOM write chain straight into the next measurement without ever
       yielding to the event loop. Coalescing through rAF puts a frame
       boundary in the cycle, so even pathological churn can only cost
       one measurement per frame, never a wedged tab.
       Drift hardening: cancel-then-reschedule instead of swallowing
       mutations while a frame is parked — the read always captures the
       LATEST batch, and the cost stays one read per frame. */
    let pend = 0;
    const mo = new MutationObserver(() => {
      if (pend) cancelAnimationFrame(pend);
      pend = requestAnimationFrame(() => { pend = 0; read(); });
    });
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "data-shell"] });
    // text geometry settles once webfonts arrive — re-measure then
    if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(() => read());
    return () => { cancelAnimationFrame(pend); mo.disconnect(); };
  }, []);
  const item = b.kitId || b.stamp || b.big || b.logo ? null : library.find((l) => l.id === b.libId);
  if (!b.kitId && !b.stamp && !b.big && !b.logo && !item) return null;
  return (
    <div className={`board-item${playing ? " playing" : ""}${selected ? " sel" : ""}`} data-bid={b.id}
      style={{ left: b.x, top: b.y, transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
        width: dim ? dim.w * sc : undefined, height: dim ? dim.h * sc : undefined,
        /* play-mode pointer honesty (field notes #3: a card's invisible
           canvas blocked the button beneath it): the item box goes
           pointer-transparent and LiveArt's injected hit rect re-enables
           exactly the shell — clicks and hovers outside any shell fall
           through the stack to the piece that really owns them. Stamps
           and big glyphs are decorative while playing, so they pass
           through whole. onSelect still fires via bubbling from the rect. */
        ...(playing ? { pointerEvents: "none" as const } : {}) }}
      {...(!playing ? {
        onPointerDown: (e: React.PointerEvent) => {
          /* pointer honesty on the stage (owner: "you can click outside
             of it and still grab the object"): the piece's box carries
             the invisible glow pad, so a grab must land on the SHELL.
             A miss hands the event to the next piece under the point —
             the click that used to steal a neighbour now reaches it.
             The relay may only DESCEND the hit stack (an overlapping
             pair would otherwise ping-pong the event forever). */
          const hostEl = e.currentTarget as HTMLElement;
          const svgHit = hostEl.querySelector("svg");
          /* raster pieces (warped stamps, big glyphs) carry their shell on
             the <img> — without this they answered whole-box and their
             padded frames stole clicks from pieces beneath (field notes #3) */
          const imgHit = svgHit ? null : hostEl.querySelector("img");
          const missed = svgHit ? !shellHit(svgHit, e.clientX, e.clientY)
            : imgHit ? !imgShellHit(imgHit, e.clientX, e.clientY) : false;
          if (missed) {
            const self = e.currentTarget as Element;
            const stack = document.elementsFromPoint(e.clientX, e.clientY);
            let iSelf = -1;
            stack.forEach((el, i) => { if (self === el || self.contains(el)) iSelf = i; });
            const below = iSelf >= 0
              ? stack.slice(iSelf + 1).find((el) => el.closest?.(".board-item"))?.closest(".board-item")
              : null;
            if (below && below !== self && boardRelay < 8) {
              boardRelay++;
              try {
                below.dispatchEvent(new PointerEvent("pointerdown", {
                  bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
                  pointerId: e.pointerId, button: e.button, buttons: e.buttons,
                  pointerType: e.pointerType, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey,
                }));
              } finally { boardRelay--; }
            }
            return;
          }
          onSelect(e);
          // a pen lifted mid-gesture can make capture throw — never fatal
          try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* gesture still works uncaptured */ }
          onDragStart(e);
        },
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
      } : { onPointerDown: onSelect })}
      {...(!playing && onTextEdit ? { onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); onTextEdit(); } } : {})}>
      {/* THE DRIFT FIX (verified root cause, 2026-08-17): LiveArt's
          anchorContent pulls its glow pad in with a NEGATIVE TOP MARGIN
          (−pad). A plain block wrapper lets that margin COLLAPSE through
          to this box — transform does not stop parent-child collapse —
          so the art shifted up by pad·fit instead of pad·sc·fit and the
          selection overlay sat off the ink by pad·fit·(1−sc): zero at
          100% scale (why it felt intermittent), ~31px at the reported
          sc=0.36. display:flow-root makes this wrapper a block
          formatting context, which keeps the child margin INSIDE the
          scaled box. The overlay math was measured correct all along. */}
      <div ref={artRef} style={{ display: "flow-root", transform: `scale(${sc})`, transformOrigin: "top left", opacity: b.opacity !== undefined ? b.opacity / 100 : undefined,
        /* the dialed copy shadow — INSIDE the scale wrapper, so the recipe's
           px ride the instance scale for free (the big-glyph contract) */
        filter: shOn ? kitShadowFilter(b.shadow) : undefined }}>
        {b.big ? (() => {
          /* a big glyph is finished raster art at its stage footprint, the
             instance's shadow/glow dials as a CSS filter — bigGlyphFilter
             is the one recipe the PNG compositor and the Unity bake share,
             so what you see is what ships. The pixels the stage shows are
             the tiered display rasters (thumb → mid); the bakes read the
             original (see BigGlyphStageArt). */
          const gl = bigGlyphById(b.big!.gid);
          if (!gl) return null;
          return <BigGlyphStageArt cfg={cfg} gl={gl} fx={b.big!} />;
        })() : b.logo ? (() => {
          /* a user logo is the maker's own raster at the big-glyph stage
             footprint, its dials as the same shared filter recipe */
          const ua = userAssets.find((a) => a.id === b.logo!.aid);
          if (!ua) return null;
          return <UserLogoStageArt cfg={cfg} ua={ua} fx={b.logo!} />;
        })() : b.stamp ? (
          <StampArt cfg={cfg} stamp={b.stamp} />
        ) : b.kitId ? (
          /* per-component design forks apply on the stage exactly like the
             editor and Kit page — the master design (and its state recipes)
             must never leak past a fork here. forkCfg is memoized above:
             a stable object identity is what keeps LiveArt's svg memo (and
             the measurement observer behind it) quiet between real edits.
             A CLONE item hands LiveArt its BASE id (LiveArt refuses clone
             ids) while every per-piece read stays keyed by b.kitId. */
          <LiveArt cfg={forkCfg} playing={playing} anchorContent onArt={onArtDim}
            kit={{ id: baseOf(b.kitId), size: kitSizes[b.kitId] ?? "l", shape: kitShapes[b.kitId], icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: kitNoText[b.kitId] ? "" : (b.label ?? kitLabels[b.kitId]), value: b.v ?? kitVals[b.kitId], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov,
              sub: kitSubs[b.kitId], slots: kitSlotVals[b.kitId],
              textOy: kitTextOy[`${b.kitId}:${kitSizes[b.kitId] ?? "l"}`], textOx: kitTextOx[`${b.kitId}:${kitSizes[b.kitId] ?? "l"}`],
              dock: (baseOf(b.kitId) === "progress" || baseOf(b.kitId) === "segbar") && kitBar[b.kitId]?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kitBar[b.kitId]?.dockSide ?? "left" } : undefined,
              bar: baseOf(b.kitId) === "progress" || baseOf(b.kitId) === "segbar" ? kitBar[b.kitId] : undefined,
              row: baseOf(b.kitId) === "datarow" ? kitRow : undefined,
              themedText: !!kitDesigns[b.kitId]?.type || !!kitTextFill[b.kitId] }} />
        ) : (
          <LiveArt cfg={item!.cfg} playing={playing} anchorContent onArt={onArtDim}
            kit={item!.kit ? { id: item!.kit.id, size: item!.kit.size, shape: item!.kit.shape, label: item!.kit.label, value: item!.kit.v } : undefined} />
        )}
      </div>
      {/* Play is for feeling the screen, not editing it — the selection
          box stays in Design (owner: "when I click play in boards i
          don't want to see the item's bounding box") */}
      {selected && !playing && (
        <i className="board-selbox" aria-hidden="true" style={dim?.shell
          ? { left: dim.shell[0] * sc, top: dim.shell[1] * sc, width: dim.shell[2] * sc, height: dim.shell[3] * sc }
          : { left: 0, top: 0, width: "100%", height: "100%" }} />
      )}
      {solo && !playing && dim && (() => {
        const sh = dim.shell ?? [0, 0, dim.w, dim.h];
        return (
          <>
            {/* the floating piece tray is RETIRED (owner-directed,
                2026-08-17): it clipped at stage edges, covered most of a
                mobile stage, and the right panel's Selected section twins
                every dial. Its one unique — Save to my assets — moved to
                that panel. Selection outline, resize/stretch handles and
                the marquee stay; ⌘D and friends live on the BoardView
                window handler and never depended on the tray. */}
            {/* the transform box: scale from ANY corner, plus top-center and
                bottom-center handlebars (owner: à la Adobe). Every drag
                anchors the OPPOSITE corner/edge — the far side stays planted
                while the piece grows toward the pointer. One coalesced
                history step per gesture (transformBoardItem). Two-mode pieces
                (blank panels) surrender the handlebars: their top/bottom spots
                belong to the vertical 9-SLICE handles — edges stretch, corners
                scale, one meaning per handle. */}
            {([[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1]] as const)
              .filter(([hx]) => !(hx === 0.5 && b.kitId && STRETCHABLE_V.has(baseOf(b.kitId))))
              .map(([hx, hy]) => {
              const bar = hx === 0.5;
              return (
                <span key={`h${hx}${hy}`} className="bd-rszwrap" style={{ left: (sh[0] + hx * sh[2]) * sc, top: (sh[1] + hy * sh[3]) * sc }}>
                  <span className={bar ? "bd-rsz2 bd-rszbar" : "bd-rsz2"} role="slider"
                    aria-label={bar ? "Resize piece (vertical handlebar)" : "Resize piece"} aria-valuenow={Math.round(sc * 100)}
                    style={{ transform: `scale(${1 / fit})`, cursor: bar ? "ns-resize" : hx === hy ? "nwse-resize" : "nesw-resize" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* uncaptured resize still works */ }
                      const axf = hx === 0.5 ? 0.5 : 1 - hx, ayf = 1 - hy;
                      rsz.current = {
                        x0: e.clientX, y0: e.clientY, s0: sc, hx,
                        anchorX: b.x + (sh[0] + axf * sh[2]) * sc,
                        anchorY: b.y + (sh[1] + ayf * sh[3]) * sc,
                        handX: b.x + (sh[0] + hx * sh[2]) * sc,
                        handY: b.y + (sh[1] + hy * sh[3]) * sc,
                        shx: sh[0], shy: sh[1], shw: sh[2], shh: sh[3], axf, ayf,
                      };
                    }}
                    onPointerMove={(e) => {
                      const r = rsz.current;
                      if (!r) return;
                      /* dead-man switch: a gesture only lives while the primary
                         button is down. If the pointerup ever lands elsewhere
                         (capture lost to a mid-drag re-render, release outside
                         the window), a stray hover must NOT keep resizing —
                         that was the "stuck in resize mode" report. */
                      if (!(e.buttons & 1)) { rsz.current = null; return; }
                      const ddx = (e.clientX - r.x0) / fit, ddy = (e.clientY - r.y0) / fit;
                      const rx = Math.abs(r.handX + ddx - r.anchorX) / Math.max(1, Math.abs(r.handX - r.anchorX));
                      const ry = Math.abs(r.handY + ddy - r.anchorY) / Math.max(1, Math.abs(r.handY - r.anchorY));
                      // corners follow the diagonal (both axes, averaged);
                      // the handlebars are pure vertical stretch-to-scale
                      const s2 = Math.max(boardScaleMin(b), Math.min(2, r.s0 * (r.hx === 0.5 ? ry : (rx + ry) / 2)));
                      useGen.getState().transformBoardItem(b.id, s2,
                        r.anchorX - (r.shx + r.axf * r.shw) * s2,
                        r.anchorY - (r.shy + r.ayf * r.shh) * s2);
                    }}
                    onPointerUp={() => { rsz.current = null; }}
                    onPointerCancel={() => { rsz.current = null; }} />
                </span>
              );
            })}
            {/* the bar family's SIDE handles — 9-slice stretch, not scale:
                the track re-renders wider while the far edge stays planted */}
            {b.kitId && STRETCHABLE.has(baseOf(b.kitId)) && ([0, 1] as const).map((shx2) => (
              <span key={`s${shx2}`} className="bd-rszwrap" style={{ left: (sh[0] + shx2 * sh[2]) * sc, top: (sh[1] + 0.5 * sh[3]) * sc }}>
                <span className="bd-rsz2 bd-rszside" role="slider"
                  aria-label="Stretch piece horizontally (9-slice)" aria-valuenow={Math.round((b.stretch ?? 1) * 100)}
                  style={{ transform: `scale(${1 / fit})`, cursor: "ew-resize" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* uncaptured stretch still works */ }
                    str.current = { x0: e.clientX, st0: b.stretch ?? 1, shw0: sh[2] * sc, bx0: b.x, hx: shx2 };
                  }}
                  onPointerMove={(e) => {
                    const r = str.current;
                    if (!r) return;
                    if (!(e.buttons & 1)) { str.current = null; return; }
                    const ddx = (e.clientX - r.x0) / fit;
                    const w2 = Math.max(20, r.hx === 1 ? r.shw0 + ddx : r.shw0 - ddx);
                    const st2 = Math.max(0.7, Math.min(3, r.st0 * (w2 / r.shw0)));
                    // right handle: left edge planted (x keeps). left handle:
                    // right edge planted — x follows the predicted width, which
                    // is exact because the track's shell scales linearly
                    const x2 = r.hx === 1 ? r.bx0 : r.bx0 - r.shw0 * (st2 / r.st0 - 1);
                    useGen.getState().stretchBoardItem(b.id, st2, x2);
                  }}
                  onPointerUp={() => { str.current = null; }}
                  onPointerCancel={() => { str.current = null; }} />
              </span>
            ))}
            {/* the blank panel's TOP/BOTTOM handles — vertical 9-slice: the
                shell re-renders taller while the far edge stays planted */}
            {b.kitId && STRETCHABLE_V.has(baseOf(b.kitId)) && ([0, 1] as const).map((shy2) => (
              <span key={`v${shy2}`} className="bd-rszwrap" style={{ left: (sh[0] + 0.5 * sh[2]) * sc, top: (sh[1] + shy2 * sh[3]) * sc }}>
                <span className="bd-rsz2 bd-rszside bd-rszside--v" role="slider"
                  aria-label="Stretch piece vertically (9-slice)" aria-valuenow={Math.round((b.stretchY ?? 1) * 100)}
                  style={{ transform: `scale(${1 / fit})`, cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* uncaptured stretch still works */ }
                    strv.current = { y0: e.clientY, st0: b.stretchY ?? 1, shh0: sh[3] * sc, by0: b.y, hy: shy2 };
                  }}
                  onPointerMove={(e) => {
                    const r = strv.current;
                    if (!r) return;
                    if (!(e.buttons & 1)) { strv.current = null; return; }
                    const ddy = (e.clientY - r.y0) / fit;
                    const h2 = Math.max(20, r.hy === 1 ? r.shh0 + ddy : r.shh0 - ddy);
                    const st2 = Math.max(0.7, Math.min(3, r.st0 * (h2 / r.shh0)));
                    // bottom handle: top edge planted (y keeps). top handle:
                    // bottom edge planted — y follows the predicted height
                    const y2 = r.hy === 1 ? r.by0 : r.by0 - r.shh0 * (st2 / r.st0 - 1);
                    useGen.getState().stretchBoardItemV(b.id, st2, y2);
                  }}
                  onPointerUp={() => { strv.current = null; }}
                  onPointerCancel={() => { strv.current = null; }} />
              </span>
            ))}
          </>
        );
      })()}
    </div>
  );
}
