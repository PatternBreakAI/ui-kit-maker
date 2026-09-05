import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ArrowDown, ArrowUp, BookmarkPlus, BringToFront, Copy, Download, Grid3x3, ImagePlus, LayoutTemplate, Lock, Monitor, Plus, RotateCcw, Search, SendToBack, Shield, Smartphone, SquarePen, Trash2, Type, X } from "lucide-react";
import { useGen, kitPicOf, rehydrateBoardBgs, boardBgFilter, boardScaleMin, boardItemArtShort, drawBoardNoise, drawBoardOverlays, savedPromotable, stampFilter, stampSvg, warpStampRaster, importUserAssetFile, kitShadowFilter, suppressCastShadow } from "@/generator/store";
import type { UserAsset, UserLogoFx } from "@/generator/store";
import { normalizeShipCopy, captureVideoPoster } from "@/generator/bgvault";
import { importBgAsset, bgAssetStatusLine, onAssetActivity, bgAssetDisplayUrl } from "@/generator/assets";
import { BACKDROP_LIBRARY, BACKDROP_CATEGORIES, backdropThumb, backdropUrl } from "@/generator/backdropLibrary";
import type { BoardDef, BoardItem } from "@/generator/store";
import { renderBevel, renderKit, VALUE_DRIVEN } from "@/generator/bevel";
import { CLONE_INELIGIBLE, GLYPH_BUTTONS, KIT_COMPONENTS, applyKitDesign, applyKitTextFill, baseOf, fontByName, kitVisible, resolveKitIcon, KIT_LABEL_EDITABLE, labelMaxOf } from "@/generator/model";
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
  { name: "Buttons", ids: ["primary", "secondary", "small", "ghost", "iconbtn", "slotbtn", "pricebtn", "endturn", "keycap", "padbtn"] },
  /* bottomnav sits with the tabs: it is the same job one level up (a tab
     picks a view inside a screen, the nav bar picks the screen). It had no
     tile at all until round 64 — released out of the bay with nowhere to
     appear, exactly like the ribbon in round 60. */
  { name: "Containers & overlays", ids: ["panel", "header", "ribbonbanner", "tab", "tabback", "bottomnav", "dropdown", "dialog", "toast", "tooltip", "listmenu", "choicelist", "scrollbar", "input", "searchfield", "setrow"] },
  { name: "HUD & readouts", ids: ["resource", "chip", "badge", "datarow", "slot", "orb", "ring", "bignum", "xpbar", "vitalbar", "currency", "healthglobe", "manarails", "buffframe", "cooldown", "notifydot", "countbadge", "avatarframe", "nameplate", "loadbar", "spinner", "pagedots", "steps", "stepper"] },
  { name: "Timers", ids: ["flipclock", "stopwatch", "timerdigits"] },
  { name: "Controls", ids: ["toggle", "slider", "progress", "segbar", "emblembar", "vsbar", "hotbar", "segment", "checkbox", "radio", "joystick", "gearicon", "trophyicon", "trophyicon~gold", "trophyicon~silver", "trophyicon~bronze", "gifticon"] },
  { name: "Shooter", ids: ["reticle", "crosshair", "hitmarker", "ammo", "magazine", "lives", "minimap", "compass", "killfeed", "weaponwheel", "equipselector", "firebutton", "joystick~ghost", "streakmeter", "waypoint", "capturemeter", "respawn", "dmgarc", "dmgnumber"] },
  { name: "RPG & progression", ids: ["questpanel", "dialoguebox", "partyframe", "unitplate", "invgrid", "rarityframe", "equipslot", "quickslots", "skillnode", "levelnode", "pathconnector", "loottag", "seasontrack", "achievetoast"] },
  // boostercard follows booster: the same item, given room to read
  { name: "Casual & mobile", ids: ["heartmeter", "energymeter", "movecounter", "orderticket", "booster", "boostercard", "combo", "dailycell", "spinwheel", "popmeter", "starrating"] },
  { name: "Rewards & chests", ids: ["chest", "giftbox", "rewardcard", "qtybadge", "rewardtray", "claimbtn", "chestpanel"] },
  { name: "Racing", ids: ["speedo", "speedo2", "tacho", "circuit", "leaderboard", "laptimes", "telemetry", "startlights"] },
  { name: "Strategy & score", ids: ["buildqueue", "techcard", "scorebug", "trophy"] },
  { name: "Social", ids: ["friendrow", "chatbubble", "clancrest", "emotewheel"] },
  { name: "Card battler", ids: ["cardback", "cardface", "pack"] },
  /* the semantic glyph rack — registry-derived so the tray and the kit page
     can't drift; the kitVisible filter below keeps it admin-only while
     staged, then per-glyph as releases land. LIVE only — a retired glyph
     leaves the tray while its legacy placements keep rendering. */
  { name: "Semantic glyphs", ids: LIVE_GLYPHS.map((g) => `glyph${g.id}`) },
  /* the glyph-button fleet — registry-derived like the rack above, one
     entry per curated glyph; the kitVisible filter keeps the whole set
     behind its single bay gate until the owner releases it */
  { name: "Glyph buttons", ids: GLYPH_BUTTONS.map((b) => b.id) },
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
  slotbtn: "slot button item frame well glyph icon tile press booster power-up consumable qty count chip",
  ribbonbanner: "ribbon banner heading title announcement objective swallowtail swallow-tail tails classic label",
  countbadge: "notification count red badge alert number unread pip",
  levelnode: "saga map level select world stage lock",
  pathconnector: "saga map path world trail dots",
  heartmeter: "lives hearts refill casual",
  energymeter: "energy stamina lightning refill",
  movecounter: "moves turns remaining casual",
  dailycell: "daily rewards calendar gift streak",
  spinwheel: "spin wheel fortune prize daily lucky",
  booster: "powerup power-up consumable item casual",
  bottomnav: "bottom nav bar navigation tab bar dock destinations menu mobile chrome map quests heroes store badge",
  boostercard: "booster card powerup power-up consumable item shop sku loadout casual quantity effect",
  chest: "reward loot crate treasure win",
  giftbox: "present reward gift daily",
  rewardcard: "reward results win prize claim",
  cardface: "card face front tcg ccg deck collectible creature spell rarity cost attack power mana corner badge number hexagon circle diamond portrait art picture upload",
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

/* The per-copy glyph RACK (rounds 46-53) is retired — every glyph is a
   real button component now, so picking a glyph is placing the right
   piece. The ov grammar it wrote ("icon:<stock>" / "icon:glyph:<id>")
   remains a first-class render road: starter deals, saved boards and the
   engine export all keep consuming it byte-for-byte; the Inspector keeps
   only the Factory reset for a copy that wears one. */

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
  /** ov / v / label / rot ride the same instance fields the Inspector
   *  edits — a starter can pose a mystery card (`ov`), a legendary tier
   *  (`v`), its own words (`label`) or a turned trail bead (`rot`)
   *  without touching the kit-wide settings */
  items: { kitId?: KitComponentId; big?: BigGlyphFx; x: number; y: number; scale?: number; ov?: string; v?: number; label?: string; rot?: number }[];
};
/* The Match-3 board: 7×9 big-glyph tiles at 12% (~52px — the scale-floor
   round's whole point) on the 390×844 stage. The tiles are the set's six
   true fruits (owner: "layout the fruit in a grid"). The deal is HAND-SET
   (round 46): the old matchless formula ((col + 2·row) mod 6) was TOO
   matchless — zero one-swap matches anywhere, so the board read as
   wallpaper, not a puzzle (owner: too hard to read). This deal keeps the
   real-round contract — no dealt 3-run — but plants ELEVEN one-swap
   matches, several of them obvious pair-plus-one shapes near the top,
   with the single bomb kept as the power piece. Checked by script:
   0 dealt runs · 11 legal moves. */
const M3_DEAL = [
  // A apple · B blueberry · N bananas · L lime · G grapes · O orange · X bomb
  "ABBNLOG",
  "NAOBGLO",
  "AAGBBNL",
  "OGNLLBO",
  "GONXAGN",
  "BGGOANA",
  "LBNGOLB",
  "GLLBNOO",
  "ANGGLBN",
];
const M3_KIND: Record<string, string> = { A: "apple", B: "blueberry", N: "bananas", L: "lime", G: "grapes", O: "orange", X: "bomb" };
const M3_GRID: { big: BigGlyphFx; x: number; y: number; scale: number }[] = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 7; c++) {
  const gid = M3_KIND[M3_DEAL[r][c]];
  const gl = bigGlyphById(gid)!;
  M3_GRID.push({
    big: { gid },
    x: Math.round(13 + c * 52 + (52 - gl.w * 0.06) / 2),
    y: Math.round(176 + r * 52 + (52 - gl.h * 0.06) / 2),
    scale: 0.12,
  });
}
const BOARD_TEMPLATES: Record<string, Tpl> = {
  /* Grand title menu on the owner's Ember Isle scene: title over open sky,
     the CTA ladder down the island, wallet strip left, news chrome right. */
  "Main menu": { bg: "/backdrops/lib/ember-isle.webp", items: [
    { kitId: "header", x: 474, y: 0, label: "EMBER ISLE" },
    { kitId: "primary", x: 641, y: 341, scale: 1.2 },
    { kitId: "secondary", x: 670, y: 592, scale: 0.85, label: "OPTIONS" },
    { kitId: "ghost", x: 738, y: 760, scale: 0.8, label: "CREDITS" },
    { kitId: "input", x: 656, y: 879, scale: 0.8 },
    { kitId: "resource", x: 5, y: 6, scale: 0.9 },
    { kitId: "currency", x: 5, y: 108, scale: 0.9, label: "8,420" },
    /* the event rail (round 62) — the casual main menu's left-edge ladder
       of framed glyph buttons: daily gift, prize wheel, mail. REAL buttons
       from the released fleet, not glyphs posed over frames. */
    { kitId: "gbtngift", x: 14, y: 232, scale: 0.55 },
    { kitId: "gbtnprizewheel", x: 14, y: 380, scale: 0.55 },
    { kitId: "gbtnmail", x: 14, y: 528, scale: 0.55 },
    { kitId: "notifydot", x: 1700, y: 5, scale: 0.9 },
    { kitId: "badge", x: 1643, y: 2, scale: 0.7, label: "NEW" },
    { kitId: "iconbtn", x: 1705, y: 172, scale: 0.9 },
    // staged: glyphplay (icon child on the PLAY cta)
    // staged: glyphreplay (icon child on the continue/options row)
    // staged: glyphhome (icon child on the corner iconbtn)
  ] },
  /* Squad FPS HUD — the big rescue sweep: crosshair dead-center with the
     hitmarker riding it, damage arc ringing the screen center, feeds and
     meters at the frame edges the genre way. */
  "FPS HUD": { bg: "/backdrops/fps-ruins.jpg", items: [
    { kitId: "minimap", x: 60, y: 50, scale: 0.9 },
    { kitId: "compass", x: 619, y: 28, scale: 0.8 },
    { kitId: "capturemeter", x: 850, y: 190, scale: 0.85 },
    { kitId: "killfeed", x: 1270, y: 58, scale: 0.75 },
    { kitId: "streakmeter", x: 60, y: 430, scale: 0.85 },
    { kitId: "equipselector", x: 1490, y: 380, scale: 0.85 },
    { kitId: "waypoint", x: 520, y: 300, scale: 0.85 },
    { kitId: "keycap", x: 660, y: 310, scale: 0.8 },
    { kitId: "dmgarc", x: 802, y: 382 },
    { kitId: "crosshair", x: 857, y: 437 },
    { kitId: "hitmarker", x: 918, y: 418, scale: 0.9 },
    { kitId: "dmgnumber", x: 1160, y: 350, scale: 0.85 },
    { kitId: "dmgnumber", x: 1130, y: 240, scale: 0.6 },
    { kitId: "respawn", x: 850, y: 640, scale: 0.9 },
    { kitId: "lives", x: 70, y: 945, scale: 0.9 },
    { kitId: "buffframe", x: 640, y: 800, scale: 0.6 },
    { kitId: "buffframe", x: 760, y: 800, scale: 0.6 },
    { kitId: "hotbar", x: 560, y: 900, scale: 0.85 },
    { kitId: "magazine", x: 1530, y: 878, scale: 0.9 },
    { kitId: "ammo", x: 1550, y: 905 },
    // alt centerpiece: reticle (released) can swap in for the crosshair
    // staged: glyphtarget — icon child on the waypoint marker
    // staged: glyphshield — beside the buff row
    // staged: glyphskull — killfeed row icon (id joins the KitComponentId
    // union when the glyph set releases)
  ] },
  /* Arena brawl HUD over the monster-pit melee: vs banner + score up top,
     nameplates on the combatants, weapon wheel at the thumb line. */
  "Arena HUD": { bg: "/backdrops/lib/monsterfire-melee.webp", items: [
    { kitId: "vsbar", x: 430, y: 36, scale: 0.95 },
    { kitId: "scorebug", x: 600, y: 145, scale: 0.85 },
    { kitId: "chip", x: 1275, y: 155, scale: 0.8 },
    { kitId: "killfeed", x: 1250, y: 250, scale: 0.85 },
    { kitId: "streakmeter", x: 70, y: 230, scale: 0.85 },
    { kitId: "buffframe", x: 70, y: 470, scale: 0.85 },
    { kitId: "nameplate", x: 220, y: 375, scale: 0.75 },
    { kitId: "nameplate", x: 1150, y: 420, scale: 0.75 },
    { kitId: "respawn", x: 730, y: 400, scale: 0.9 },
    { kitId: "minimap", x: 1540, y: 765, scale: 0.9 },
    { kitId: "weaponwheel", x: 725, y: 600, scale: 0.62 },
  ] },
  /* Skill tree & quests: a diamond skill web on the left two-thirds —
     bead trails listed BEFORE nodes so node art paints over trail ends —
     quest rail right, dialogue at the floor. */
  "RPG quest": { bg: "/backdrops/strategy-keep.jpg", items: [
    { kitId: "emblembar", x: 50, y: 40, scale: 0.8 },
    /* the chapter crown (round 62) — the released ribbon banner carries
       the quest-line name over the skill web, its words a live text seat */
    { kitId: "ribbonbanner", x: 705, y: 10, scale: 0.6, label: "EMBER PASS" },
    { kitId: "pathconnector", x: 191, y: 287, scale: 0.5 },
    { kitId: "pathconnector", x: 191, y: 452, scale: 0.5 },
    { kitId: "pathconnector", x: 453, y: 207, scale: 0.5 },
    { kitId: "pathconnector", x: 453, y: 532, scale: 0.5 },
    { kitId: "pathconnector", x: 716, y: 290, scale: 0.5 },
    { kitId: "pathconnector", x: 716, y: 450, scale: 0.5 },
    { kitId: "pathconnector", x: 976, y: 370, scale: 0.5 },
    { kitId: "skillnode", x: 62, y: 314, scale: 0.85 },
    { kitId: "skillnode", x: 334, y: 160, scale: 0.75 },
    { kitId: "skillnode", x: 334, y: 490, scale: 0.75 },
    { kitId: "skillnode", x: 599, y: 165, scale: 0.75 },
    { kitId: "skillnode", x: 599, y: 485, scale: 0.75 },
    { kitId: "skillnode", x: 859, y: 325, scale: 0.75 },
    { kitId: "skillnode", x: 1107, y: 314, scale: 0.85 },
    { kitId: "questpanel", x: 1306, y: 144, scale: 0.8 },
    { kitId: "choicelist", x: 1306, y: 574, scale: 0.8 },
    { kitId: "dialoguebox", x: 466, y: 633, scale: 0.8 },
    { kitId: "xpbar", x: 407, y: 872, scale: 1.1 },
    // staged: glyphquests, glyphlock, glyphcheckmark (node states) — land
    // with their set's release
  ] },
  /* Social tavern: who's-online panel left, bounty board right, the
     barkeep conversation at the hearth, ENTER TOWN on the scene's door. */
  "Tavern hub": { bg: "/backdrops/tavern.jpg", items: [
    { kitId: "panel", x: 60, y: 170, scale: 0.75 },
    { kitId: "friendrow", x: 130, y: 210, scale: 0.78, label: "NOVA_KNIGHT" },
    { kitId: "friendrow", x: 130, y: 310, scale: 0.78, label: "KAIRO_77" },
    { kitId: "friendrow", x: 130, y: 410, scale: 0.78, label: "EMBER_MAE" },
    { kitId: "panel", x: 1170, y: 180, scale: 0.88 },
    { kitId: "datarow", x: 1266, y: 209, scale: 0.68 },
    { kitId: "datarow", x: 1266, y: 343, scale: 0.68 },
    { kitId: "datarow", x: 1266, y: 477, scale: 0.68 },
    { kitId: "chatbubble", x: 330, y: 600, scale: 0.75, label: "anyone up for the ember run?" },
    { kitId: "avatarframe", x: 358, y: 830, scale: 0.85 },
    { kitId: "dialoguebox", x: 555, y: 800, scale: 0.8, label: "Warm yourself. The pass can wait." },
    { kitId: "secondary", x: 751, y: 636, scale: 0.62, label: "ENTER TOWN" },
    { kitId: "iconbtn", x: 1586, y: 36, scale: 0.85 },
    { kitId: "notifydot", x: 1734, y: 36, scale: 0.85 },
  ] },
  /* Card duel table at the midnight club: opponent seat + fan up top, the
     table itself stays open, player seat and deck at the near rail. */
  "Card table": { bg: "/backdrops/lib/midnight-meeple-club.webp", items: [
    { kitId: "vsbar", x: 445, y: 18, scale: 0.9 },
    { kitId: "avatarframe", x: 48, y: 40, scale: 0.8 },
    { kitId: "chip", x: 56, y: 245, scale: 0.85 },
    { kitId: "cardback", x: 675, y: 150, scale: 0.42 },
    { kitId: "cardback", x: 850, y: 134, scale: 0.42 },
    { kitId: "cardback", x: 1025, y: 150, scale: 0.42 },
    { kitId: "energymeter", x: 40, y: 420, scale: 0.85 },
    { kitId: "combo", x: 590, y: 395, scale: 0.8 },
    /* the pot (round 62) — the Crown Coin, released, dressed in the kit's
       own treatment, with its stake count riding beside it */
    // registry-derived glyph id (LIVE_GLYPHS) — the union lists only the
    // hand-carved subset, so the Crown Coin follows the tray's own pattern
    { kitId: "glyphcrowncoin" as KitComponentId, x: 840, y: 420, scale: 0.72 },
    { kitId: "qtybadge", x: 985, y: 640, scale: 0.6, label: "×500" },
    { kitId: "endturn", x: 1660, y: 430, scale: 0.9 },
    { kitId: "pack", x: 1400, y: 650, scale: 0.5 },
    { kitId: "cardback", x: 1630, y: 662, scale: 0.5 },
    { kitId: "emotewheel", x: 245, y: 585, scale: 0.42 },
    { kitId: "avatarframe", x: 48, y: 805, scale: 0.85 },
    { kitId: "chip", x: 250, y: 905, scale: 0.85 },
    // staged: glyphcrown — the winner's crown garnish, lands when the glyph rack releases
  ] },
  /* Open-world street HUD: compass with the waypoint marking a building
     down the block, quest tracker right, pickup + interact prompt mid. */
  "Open world": { bg: "/backdrops/city-streets.jpg", items: [
    { kitId: "heartmeter", x: 70, y: 50, scale: 0.9 },
    { kitId: "compass", x: 640, y: 40, scale: 0.9 },
    { kitId: "waypoint", x: 938, y: 210, scale: 0.85 },
    { kitId: "currency", x: 1400, y: 50, scale: 0.85 },
    { kitId: "iconbtn", x: 1710, y: 48, scale: 0.85 },
    { kitId: "questpanel", x: 1330, y: 300, scale: 0.8 },
    { kitId: "loottag", x: 560, y: 480, scale: 0.85 },
    { kitId: "keycap", x: 703, y: 620, scale: 0.9 },
    { kitId: "minimap", x: 70, y: 730, scale: 0.95 },
    { kitId: "hotbar", x: 435, y: 900, scale: 0.9 },
  ] },
  /* Racing start grid at the palmside pit: gantry centered, timing column
     left, telemetry + the three-gauge dash cluster right. */
  "Racing HUD": { bg: "/backdrops/lib/palmside-pitstop.webp", items: [
    { kitId: "startlights", x: 723, y: 30 },
    { kitId: "chip", x: 95, y: 10, scale: 0.6 },
    { kitId: "laptimes", x: 60, y: 75, scale: 0.9 },
    { kitId: "leaderboard", x: 60, y: 430, scale: 0.8 },
    { kitId: "circuit", x: 60, y: 800, scale: 0.75 },
    { kitId: "telemetry", x: 1435, y: 170, scale: 0.85 },
    { kitId: "tacho", x: 1212, y: 756, scale: 0.48 },
    { kitId: "speedo", x: 1428, y: 716, scale: 0.48 },
    { kitId: "speedo2", x: 1645, y: 736, scale: 0.48 },
    // staged: timerdigits — race clock (release with the timer set)
    // { kitId: "timerdigits", x: 1500, y: 40, scale: 0.9 },
    // staged: glyphcheckpoint, glyphtimer — swappable icon children for the
    // gantry/clock (release with the glyph set)
  ] },
  /* Matchup card on the redline scene: mirrored fighters — frame, crest,
     nameplate, rank shield per side — season record up top, CTA between. */
  "Versus": { bg: "/backdrops/lib/redline-rebellion.webp", items: [
    { kitId: "scorebug", x: 595, y: 0, scale: 0.85 },
    { kitId: "chip", x: 1295, y: 0, scale: 0.9 },
    { kitId: "vsbar", x: 396, y: 128 },
    { kitId: "avatarframe", x: 232, y: 297, scale: 1.15 },
    { kitId: "avatarframe", x: 1351, y: 297, scale: 1.15 },
    { kitId: "clancrest", x: 546, y: 373, scale: 0.75 },
    { kitId: "clancrest", x: 1164, y: 373, scale: 0.75 },
    { kitId: "nameplate", x: 96, y: 619, scale: 0.8 },
    { kitId: "nameplate", x: 1215, y: 619, scale: 0.8 },
    { kitId: "badge", x: 311, y: 739, scale: 0.85 },
    { kitId: "badge", x: 1430, y: 739, scale: 0.85 },
    { kitId: "primary", x: 681, y: 729, scale: 1.05 },
    { kitId: "emblembar", x: 640, y: 954, scale: 0.9 },
  ] },
  /* the owner: "let's have a match 3 mobile template in the dropdown that
     populates the correct match 3 layout" — the real portrait shape: kit
     header (moves + timer + goal bar), the 7×9 tile grid, boosters at the
     thumb line. Released with the set (owner order, 2026-08-21). */
  "Match-3 (mobile)": { aspect: "mobile", bg: "/backdrops/lib/candy-river-quest.webp", items: [
    { kitId: "movecounter", x: 0, y: 0, scale: 0.34 },
    { kitId: "stopwatch", x: 229, y: 0, scale: 0.28 },
    // the pause control is ONE component — an icon button wearing the
    // pause glyph (owner: manipulate an existing component, don't cobble)
    { kitId: "iconbtn", ov: "icon:pause", x: 312, y: 0, scale: 0.28 },
    { kitId: "segbar", x: 70, y: 99, scale: 0.28 },
    ...M3_GRID,
    { kitId: "combo", x: 191, y: 327, scale: 0.42 },
    { kitId: "booster", x: 0, y: 654, scale: 0.38 },
    { kitId: "booster", x: 84, y: 654, scale: 0.38 },
    /* the booster tray's items are REAL framed icons — the slot family
       carrying its glyph as ONE piece (owner's framed-icon rule: use the
       frame+icon components "like the item slots", never a glyph stacked
       over a frame); the qty chip keeps its corner seat */
    { kitId: "slot", ov: "icon:hammer", x: 175, y: 663, scale: 0.34 },
    { kitId: "slot", ov: "icon:magnet", x: 263, y: 663, scale: 0.34 },
    { kitId: "qtybadge", x: 214, y: 676, scale: 0.18 },
    // staged: glyphaddtime — +time chip seated on the stopwatch's dark dial edge
    // staged: glyphtimer — on the segbar's dark left cap
  ] },
  /* Raid party HUD under the twin-moon pagoda: party stack left with the
     player's buff row, boss plate + floating hits, mana rails at the feet. */
  "RPG party": { bg: "/backdrops/lib/twin-moon-pagoda.webp", items: [
    { kitId: "partyframe", x: 45, y: 120, scale: 0.85 },
    { kitId: "buffframe", x: 90, y: 292, scale: 0.42 },
    { kitId: "buffframe", x: 185, y: 292, scale: 0.42 },
    { kitId: "buffframe", x: 280, y: 292, scale: 0.42 },
    { kitId: "partyframe", x: 45, y: 375, scale: 0.85 },
    { kitId: "partyframe", x: 45, y: 535, scale: 0.85 },
    { kitId: "partyframe", x: 45, y: 695, scale: 0.85 },
    { kitId: "nameplate", x: 600, y: 60 },
    { kitId: "dmgnumber", x: 900, y: 240, scale: 0.75 },
    { kitId: "dmgnumber", x: 1160, y: 420, scale: 0.5 },
    { kitId: "chatbubble", x: 40, y: 850, scale: 0.8 },
    { kitId: "manarails", x: 520, y: 760, scale: 0.7 },
    { kitId: "manarails", x: 1120, y: 760, scale: 0.7 },
    { kitId: "xpbar", x: 620, y: 880 },
    // staged: healthglobe · staged: quickslots · staged: vitalbar ·
    // staged: cooldown · staged: glyphheart · staged: glyphenergy
  ] },
  /* Character & inventory: paper-doll panel left (six equip slots around
     the shield silhouette), the 9/12 grid + scrollbar right, compare
     strip on one baseline at the floor. */
  "Inventory": { bg: "/backdrops/lib/teal-banner-keep.webp", items: [
    { kitId: "panel", x: 60, y: 170, scale: 1.05 },
    { kitId: "panel", x: 950, y: 160, scale: 1.12 },
    { kitId: "tabback", x: 70, y: 36, scale: 0.8 },
    { kitId: "tab", x: 920, y: 90, scale: 0.8 },
    { kitId: "tab", x: 1150, y: 90, scale: 0.8 },
    { kitId: "tab", x: 1380, y: 90, scale: 0.8 },
    { kitId: "currency", x: 1600, y: 44, scale: 0.85 },
    { big: { gid: "shield" }, x: 364, y: 315, scale: 0.8 },
    { kitId: "equipslot", x: 130, y: 200, scale: 0.8 },
    { kitId: "equipslot", x: 130, y: 360, scale: 0.8 },
    { kitId: "equipslot", x: 130, y: 520, scale: 0.8 },
    { kitId: "equipslot", x: 690, y: 200, scale: 0.8 },
    { kitId: "equipslot", x: 690, y: 360, scale: 0.8 },
    { kitId: "equipslot", x: 690, y: 520, scale: 0.8 },
    { kitId: "invgrid", x: 1030, y: 200, scale: 0.84 },
    { kitId: "scrollbar", x: 1720, y: 205, scale: 0.9 },
    { kitId: "loottag", x: 1120, y: 590, scale: 0.85 },
    // one REAL framed icon — the slot carries its gem itself (owner's
    // framed-icon rule), not a glyph posed over an empty well
    { kitId: "slot", ov: "icon:gem", x: 150, y: 790, scale: 0.9 },
    { kitId: "rarityframe", x: 430, y: 810, scale: 0.85 },
    { kitId: "qtybadge", x: 528, y: 818, scale: 0.6 },
    { kitId: "stepper", x: 700, y: 830, scale: 0.8 },
    // staged: tooltip — compare callout, lands when System chrome releases
    // staged: datarow — stat readout row under the paper doll
    // staged: glyphkey — key icon child on a grid stack
  ] },
  /* the Brightside saga map, posed on its own owner art: numbered nodes on
     the painted trail (cleared levels wear their star fans, the current one
     pulses, the future one locks), best-result pills beside the cleared
     levels, lives + chapter progress up top, season banner mid, nav below. */
  "Level select": { bg: "/backdrops/brightside/level-select.jpg", aspect: "mobile", items: [
    { kitId: "pathconnector", x: 206, y: 623, scale: 0.3, rot: -54, v: 1 },
    { kitId: "pathconnector", x: 222, y: 512, scale: 0.3, rot: 65, v: 1 },
    { kitId: "pathconnector", x: 198, y: 407, scale: 0.3, rot: -88, v: 1 },
    { kitId: "pathconnector", x: 220, y: 304, scale: 0.3, rot: -68, v: 0.25 },
    { kitId: "levelnode", x: 190, y: 676, scale: 0.22, ov: "stars:3", label: "1" },
    { kitId: "levelnode", x: 273, y: 561, scale: 0.22, ov: "stars:2", label: "2" },
    { kitId: "levelnode", x: 222, y: 454, scale: 0.22, ov: "stars:3", label: "3" },
    { kitId: "levelnode", x: 225, y: 351, scale: 0.22, label: "4" },
    { kitId: "levelnode", x: 267, y: 248, scale: 0.22, ov: "locked", label: "5" },
    { kitId: "starrating", x: 97, y: 686, scale: 0.12, v: 1 },
    { kitId: "starrating", x: 180, y: 571, scale: 0.12, v: 0.67 },
    { kitId: "starrating", x: 129, y: 464, scale: 0.12, v: 1 },
    { kitId: "glyphstar", x: 259, y: 328, scale: 0.09 },
    { kitId: "header", x: 100, y: 10, scale: 0.24, label: "Sky Isles" },
    { kitId: "avatarframe", x: 4, y: 6, scale: 0.22 },
    { kitId: "currency", x: 286, y: 14, scale: 0.22 },
    { kitId: "heartmeter", x: 6, y: 88, scale: 0.22 },
    { kitId: "ring", x: 326, y: 86, scale: 0.2 },
    { kitId: "seasontrack", x: 14, y: 150, scale: 0.24 },
    { kitId: "bottomnav", x: 48, y: 736, scale: 0.37 },
    { kitId: "notifydot", x: 317, y: 757, scale: 0.2 },
    /* trail garnish (round 62) — the treated glyphs released; the
       checkpoint marks the bend past level 2 and the chapter-end crown
       waits by the castle gate. The flag's audition seat now belongs to
       the nav dock, so the pennant stays parked. */
    { kitId: "glyphcheckpoint", x: 291, y: 505, scale: 0.07 },
    { kitId: "glyphcrown", x: 289, y: 168, scale: 0.08 },
    // parked: glyphflag — its trailhead seat sits under the nav dock now
    // { kitId: "glyphflag", x: 155, y: 735, scale: 0.07 },
    // staged: glyphlock — swappable lock child on the sealed level 5
    // { kitId: "glyphlock", x: 281, y: 244, scale: 0.07 },
    // staged: glyphhome — swappable icon child for the nav's MAP cell
    // { kitId: "glyphhome", x: 104, y: 758, scale: 0.07 },
    // staged: glyphprofile — swappable icon child for the nav's HEROES cell
    // { kitId: "glyphprofile", x: 217, y: 758, scale: 0.07 },
    // staged: glyphplay — play affordance riding the current node
    // { kitId: "glyphplay", x: 239, y: 352, scale: 0.08 },
  ] },
  /* Chest-opening rewards ceremony (starter-boards round): the reveal fan
     — rare / legendary / mystery, an orb glowing behind the big pull —
     counts riding each card, the wallet up top, and the claim row with
     its 2×-ad sibling at the thumb line. Composed for the phone portrait
     like the owner's own Victory board (valley backdrop kin). */
  "Victory": { aspect: "mobile", bg: "/backdrops/valley.jpg", items: [
    { kitId: "currency", x: 250, y: 34, scale: 0.34 },
    /* the crown (round 62) — the released ribbon banner replaces the flat
       header: the ceremony's title on the swallow-tail, words a live seat */
    { kitId: "ribbonbanner", x: 5, y: 92, scale: 0.42, label: "CHEST OPENED" },
    // the burst — star + coin spray around the reveal (swappable glyph children)
    { kitId: "glyphstar", x: 48, y: 246, scale: 0.2 },
    { kitId: "glyphstar", x: 300, y: 226, scale: 0.26 },
    /* round 62 containment fix: the coin-spray glyph was glyphcoinstack,
       which sits REJECTED in the live release ledger — a public deal must
       never hand out a withheld piece. The released treated coin takes
       the same seat. */
    { kitId: "glyphcoin", x: 34, y: 304, scale: 0.24 },
    // the glow behind the legendary pull (support) — drawn first, sits behind
    { kitId: "orb", x: 90, y: 376, scale: 1.1 },
    { kitId: "rewardcard", x: 18, y: 420, scale: 0.38, v: 0.5, label: "Sky Crystal" },
    { kitId: "rewardcard", x: 272, y: 420, scale: 0.38, ov: "mystery" },
    { kitId: "rewardcard", x: 133, y: 395, scale: 0.46, v: 1, label: "Sun Shard" },
    // each count rides its card's qty seat (the corner-pill contract)
    { kitId: "qtybadge", x: 28, y: 520, scale: 0.3, label: "×40" },
    { kitId: "qtybadge", x: 158, y: 516, scale: 0.34, label: "×1" },
    { kitId: "qtybadge", x: 289, y: 520, scale: 0.3, label: "×?" },
    /* the "also inside" strip (round 62) — rewardtray released, landed on
       its audition seat (starter-boards/shots/victory-06-garnish.png) */
    { kitId: "rewardtray", x: 40, y: 610, scale: 0.3 },
    { kitId: "claimbtn", x: 14, y: 706, scale: 0.38 },
    { kitId: "claimbtn", x: 200, y: 706, scale: 0.38, ov: "2x" },
    /* Withheld garnish — chest and chestpanel sit REJECTED in the release
       ledger (with giftbox still in the bay); their audition lines wait
       for an owner verdict that reverses that.
       v: 0 poses the chest READY — an opened ceremony, not a 4h58m gate. */
    // rejected: chest — { kitId: "chest", x: 138, y: 580, scale: 0.36, v: 0 },
    // rejected: chestpanel — backplate behind the fan, alternate to the orb glow:
    //   { kitId: "chestpanel", x: 0, y: 350, scale: 0.56 },
    // staged: giftbox — { kitId: "giftbox", x: 30, y: 600, scale: 0.3 },
    // staged: glyphchest — { kitId: "glyphchest" as KitComponentId, x: 330, y: 320, scale: 0.26 },
    // staged: glyphgift — { kitId: "glyphgift" as KitComponentId, x: 24, y: 176, scale: 0.24 },
    // staged: glyphstarformation — { kitId: "glyphstarformation" as KitComponentId, x: 140, y: 14, scale: 0.4 },
  ] },
  /* Settings sheet on the bare navy stage: one full-frame panel, section
     nav + scrollbar left, composed rows right (music, sfx, dropdown, the
     2×2 choice group), profile mini-card bottom-left. */
  "Settings": { items: [
    { kitId: "panel", x: 73, y: 0, scale: 1.7 },
    { kitId: "panel", x: 271, y: 568, scale: 0.6 },
    { kitId: "tab", x: 229, y: 32, scale: 1.0 },
    { kitId: "listmenu", x: 255, y: 199, scale: 0.78 },
    { kitId: "scrollbar", x: 677, y: 245, scale: 0.58 },
    { kitId: "setrow", x: 845, y: 190, scale: 0.72 },
    { kitId: "glyphmusic", x: 791, y: 231, scale: 0.38 },
    { kitId: "slider", x: 845, y: 335, scale: 0.72 },
    { kitId: "glyphsound", x: 791, y: 355, scale: 0.38 },
    { kitId: "toggle", x: 1277, y: 311, scale: 0.72 },
    { kitId: "dropdown", x: 853, y: 444, scale: 0.66 },
    { kitId: "keycap", x: 1185, y: 709, scale: 0.66 },
    { kitId: "checkbox", x: 874, y: 595, scale: 0.62 },
    { kitId: "checkbox", x: 1014, y: 595, scale: 0.62 },
    { kitId: "radio", x: 874, y: 715, scale: 0.62 },
    { kitId: "radio", x: 1014, y: 715, scale: 0.62 },
    { kitId: "input", x: 320, y: 628, scale: 0.58 },
    { kitId: "small", x: 515, y: 725, scale: 0.66 },
    /* the illustrated gear (round 62) — released, landed beside the tab
       (the audition seat, raised and trimmed clear of the list panel) */
    { kitId: "gearicon", x: 505, y: 14, scale: 0.68 },
    // staged: glyphsettings — icon child on the tab (seats unverified — Core-only render)
  ] },
  /* ── New starters (§4B) — every key below ships in STAGED_TEMPLATES
     until the owner releases it ─────────────────────────────────────── */
  /* Touch shooter over the neon convoy: virtual stick + fire cluster at
     the thumbs, wheel open right-mid, map with a medkit blip up top. */
  "Mobile ops HUD": { bg: "/backdrops/lib/neon-convoy.webp", aspect: "mobile", items: [
    { kitId: "minimap", x: 2, y: 36, scale: 0.3 },
    { kitId: "glyphplus", x: 61, y: 103, scale: 0.06 },
    { kitId: "countbadge", x: 68, y: 108, scale: 0.3 },
    { kitId: "vitalbar", x: 161, y: 36, scale: 0.3 },
    { kitId: "cooldown", x: 296, y: 108, scale: 0.3 },
    { kitId: "waypoint", x: 154, y: 200, scale: 0.4 },
    { kitId: "weaponwheel", x: 152, y: 384, scale: 0.3 },
    { kitId: "qtybadge", x: 224, y: 563, scale: 0.3 },
    { kitId: "joystick", x: 2, y: 645, scale: 0.42 },
    // the ability button is a REAL icon button carrying its rocket as one
    // piece (owner's framed-icon rule) — not a glyph over a gamepad cap
    { kitId: "iconbtn", ov: "icon:rocket", x: 167, y: 728, scale: 0.36 },
    { kitId: "firebutton", x: 222, y: 643, scale: 0.42 },
    // NOTE: vitalbar / countbadge / firebutton / glyphplus are staged
    // families — this key stays in STAGED_TEMPLATES until they release
  ] },
  /* Daily bonus sheet: countdown, the 7-day calendar (claimed / today /
     locked), claim under the grid, refill row, carousel pips. */
  "Daily bonus": { aspect: "mobile", bg: "/backdrops/lib/strawberry-skyfall.webp", items: [
    { kitId: "header", x: 39, y: 27, scale: 0.3, label: "DAILY BONUS" },
    { kitId: "flipclock", x: 86, y: 130, scale: 0.32, label: "23:14:09" },
    { kitId: "dailycell", ov: "check", x: 7, y: 241, scale: 0.4, label: "DAY 1" },
    { kitId: "dailycell", ov: "check", x: 94, y: 241, scale: 0.4, label: "DAY 2" },
    { kitId: "dailycell", x: 179, y: 231, scale: 0.46, label: "TODAY" },
    { kitId: "dailycell", x: 279, y: 241, scale: 0.4, label: "DAY 4" },
    { kitId: "dailycell", x: 56, y: 364, scale: 0.4, label: "DAY 5" },
    { kitId: "dailycell", x: 143, y: 364, scale: 0.4, label: "DAY 6" },
    { kitId: "dailycell", ov: "locked", x: 230, y: 364, scale: 0.4, label: "DAY 7" },
    { kitId: "claimbtn", x: 78, y: 500, scale: 0.5, label: "CLAIM" },
    { kitId: "energymeter", x: 71, y: 628, scale: 0.38, v: 0.6 },
    { kitId: "pagedots", x: 120, y: 740, scale: 0.6 },
    // staged: spinwheel, gifticon, glyphcalendar, glyphstreak,
    // glyphprizewheel, glyphticket, glyphpiggybank — land with their sets
  ] },
  /* Store screen, tavern-counter kin of the owner's Shop board: wallet
     pills up top, featured bundle + card-pack SKUs, the gem ladder in
     ascending sizes with a price button per row, nav dock below. */
  "Shop": { aspect: "mobile", bg: "/backdrops/tavern.jpg", items: [
    { kitId: "resource", x: 0, y: 0, scale: 0.3 },
    { kitId: "currency", x: 218, y: 0, scale: 0.3 },
    { kitId: "tab", x: 47, y: 54, scale: 0.38 },
    { kitId: "tab", x: 154, y: 54, scale: 0.38 },
    { kitId: "boostercard", x: 0, y: 124, scale: 0.5 },
    { kitId: "pack", x: 172, y: 130, scale: 0.32 },
    { kitId: "stepper", x: 156, y: 371, scale: 0.3 },
    { kitId: "glyphgem", x: 43, y: 443, scale: 0.24 },
    { kitId: "pricebtn", x: 204, y: 441, scale: 0.3 },
    { kitId: "glyphgem", x: 36, y: 519, scale: 0.28 },
    { kitId: "pricebtn", x: 204, y: 528, scale: 0.3 },
    { kitId: "glyphgem", x: 20, y: 584, scale: 0.36 },
    { kitId: "qtybadge", x: 81, y: 665, scale: 0.3 },
    { kitId: "pricebtn", x: 204, y: 615, scale: 0.3 },
    { kitId: "bottomnav", x: 0, y: 707, scale: 0.4 },
    // staged garnish (dialog confirm sheet, countbadge, glyphcart,
    // glyphsale, glyphcoin, glyphcoinsingle, glyphcoinpile) lands only
    // with its release batch — bottomnav's STORE cell already carries a
    // cart natively
  ] },
  /* Strategy base over the autumnhorn village: build queue docked left,
     unit plates on the villagers, research card right, day bar + wallet
     up top, END TURN at the corner. */
  "Base command": { bg: "/backdrops/lib/autumnhorn-village.webp", items: [
    { kitId: "emblembar", x: 645, y: 35, scale: 0.9 },
    { kitId: "popmeter", x: 40, y: 30, scale: 0.9 },
    { kitId: "resource", x: 1600, y: 30, scale: 0.85 },
    { kitId: "resource", x: 1600, y: 145, scale: 0.85 },
    { kitId: "unitplate", x: 330, y: 290, scale: 0.85 },
    { kitId: "unitplate", x: 950, y: 470, scale: 0.85 },
    { kitId: "unitplate", x: 430, y: 620, scale: 0.85 },
    { kitId: "techcard", x: 1590, y: 370, scale: 0.9 },
    { kitId: "buildqueue", x: 50, y: 825, scale: 0.95 },
    { kitId: "glyphhammer", x: 666, y: 817, scale: 0.42 },
    { kitId: "minimap", x: 1640, y: 735, scale: 0.85 },
    { kitId: "endturn", x: 1420, y: 775, scale: 0.9 },
    // staged: toast — { kitId: "toast", x: 1180, y: 170, scale: 0.85 },
    // staged: glyphshield — { kitId: "glyphshield", x: 1150, y: 500, scale: 0.4 } (over the knight)
  ] },
  /* Clan hall at castlewood: crest + rank medals up top, the top-3 podium
     over the TOP 5 panel, member rows, clan chat + quick-react, nav dock. */
  "Clan hall": { aspect: "mobile", bg: "/backdrops/lib/castlewood-crown.webp", items: [
    { kitId: "clancrest", x: 137, y: 18, scale: 0.5 },
    { kitId: "badge", x: 82, y: 54, scale: 0.3 },
    { kitId: "badge", x: 252, y: 54, scale: 0.3 },
    { kitId: "notifydot", x: 292, y: 28, scale: 0.4 },
    { kitId: "avatarframe", x: 150, y: 138, scale: 0.36 },
    { kitId: "avatarframe", x: 60, y: 152, scale: 0.3 },
    { kitId: "avatarframe", x: 256, y: 152, scale: 0.3 },
    { kitId: "leaderboard", x: 47, y: 226, scale: 0.62 },
    { kitId: "friendrow", x: 24, y: 446, scale: 0.42 },
    { kitId: "friendrow", x: 24, y: 508, scale: 0.42 },
    { kitId: "chatbubble", x: 12, y: 606, scale: 0.34 },
    { kitId: "emotewheel", x: 184, y: 552, scale: 0.3 },
    { kitId: "bottomnav", x: 6, y: 720, scale: 0.53 },
    // staged: trophy, trophyicon, glyphfriends, glyphleaderboard, glyphmail,
    // glyphnotification, glyphtrophy, glyphmedal — suggested seats: glyphmail
    // on the requests bell, glyphtrophy/glyphmedal as swappable badge icons,
    // trophyicon beside the podium champion
  ] },
  /* Loading screen — sparse by design, the scene carries it: tip card
     center with carousel pips, connect steps and the loading bar at the
     foot. Composed 16:9 ON PURPOSE with no aspect key — it reflows onto
     mobile boards instead of retuning them. */
  "Loading": { bg: "/backdrops/lib/frostwhistle-summit.webp", items: [
    { kitId: "panel", x: 625, y: 243, scale: 0.78 },
    { kitId: "pagedots", x: 836, y: 571 },
    { kitId: "steps", x: 723, y: 727, scale: 0.9 },
    { kitId: "loadbar", x: 455, y: 856 },
    // staged: glyphrocket — tip-card illustration; lands when the glyph set releases
    // { kitId: "glyphrocket", x: 760, y: 400, scale: 0.5 },
    // staged: tooltip — floating "did you know" callout beside the tip card
    // { kitId: "tooltip", x: 1350, y: 400, scale: 0.85 },
    // staged: spinner — busy comet beside the loadbar's tail
    // { kitId: "spinner", x: 1590, y: 900, scale: 0.8 },
  ] },
};
/* New starter screens ship GATED — admin-only until the owner releases
   them (standing rule: new assets ship gated). Component staging can't
   carry this: kitVisible filters only the TRAY, and addBoardItems deals
   whatever a template names with no visibility check — so a template
   referencing anything would reach everyone who can select it. The
   option list is therefore the only control point: the pulldown hides
   these keys from non-admins, and applyStarter refuses them too, so a
   stale <select> value can't deal a gated board. Releasing a starter =
   deleting its key here, one owner blessing per change. */
const STAGED_TEMPLATES = new Set<string>([
  "Mobile ops HUD", "Daily bonus", "Shop", "Base command", "Clan hall", "Loading",
]);

const STAGE: Record<"169" | "mobile", [number, number, string]> = {
  "169": [1920, 1080, "16:9"],
  mobile: [390, 844, "Mobile"],
};

/* Tray thumbs are ~40px tall, so the state glows (authored for a piece at
   full size) would smear every tile into a haze — they render glow-less.
   Non-mutating, and it runs AFTER a piece's design fork applies: a fork
   carries its own `states` block, so zeroing the master's first let a
   forked glow straight back in (and mutating the fork's own states object
   would corrupt the store). Identity is preserved when there is nothing
   to zero, which keeps the per-thumb cache below hitting. */
const noGlow = (c: GenConfig): GenConfig => {
  const st = c.states as unknown as Record<string, { glow?: number }>;
  if (!Object.values(st).some((s) => s.glow)) return c;
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(st)) out[k] = { ...s, glow: 0 };
  return { ...c, states: out } as unknown as GenConfig;
};

/* Paste-a-URL video backdrops: vet the link BEFORE the board takes it.
   https only, embeds turned away by name, then a real load test — the
   metadata handshake proves it's a direct video file, not a page. */
const checkVideoUrl = async (raw: string): Promise<{ url?: string; err?: string }> => {
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) return { err: "Paste a full https:// link." };
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return { err: "YouTube / Vimeo pages can't sit under the pieces. Paste a direct .mp4 or .webm file link instead." };
  const ok = await new Promise<boolean>((res) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "metadata";
    const t = window.setTimeout(() => res(false), 8000);
    v.onloadedmetadata = () => { window.clearTimeout(t); res(true); };
    v.onerror = () => { window.clearTimeout(t); res(false); };
    v.src = url;
  });
  return ok ? { url } : { err: "That link didn't play. It needs to be a direct video file (.mp4 / .webm), not a page or an embed." };
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
        <input value={q} placeholder="Search 82 scenes: cozy kitchen, neon, battle…" aria-label="Search the scene library"
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
        <div className="bd-note">No scene matches. Try fewer words, or another genre.</div>
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
          <span>That scene didn't arrive from the cloud. If the storage bucket isn't set up yet: Supabase dashboard → Storage → new <b>public</b> bucket named exactly <b>backgrounds</b>, then drag the 82 .webp files in. The boards light up instantly, no redeploy.</span>
        </div>
      )}
      <div className="bd-note">Scenes stream from the cloud. Your board saves a link, never the pixels.</div>
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

/* Everything between the stage floor and the pieces — backdrop, video,
   film grain, the overlay tint and its grain, the center scrim. ONE
   recipe, shared by the editor's desk and the read-only stage below, so
   a screen shown on the kit's public page can't drift from the same
   screen on the owner's desk. */
function BoardDressing({ bd }: { bd: BoardDef }) {
  return (<>
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
  </>);
}

const noop = () => {};

/** One artboard, LIVE and read-only — the exact stage the desk draws
 *  (same dressing, same StagePiece, same LiveArt engine), running in
 *  PLAY mode: buttons highlight and press, toggles flip, bars fill, and
 *  nothing can be selected, dragged or edited. This is what the shipped
 *  kits' public pages show, so "working" means working — not a picture
 *  of a screen. `fit` scales stage units to the frame the caller
 *  measured; the board's own aspect is never squashed. */
export function LiveBoardStage({ bd, fit }: { bd: BoardDef; fit: number }) {
  const [W, H] = STAGE[bd.aspect];
  return (
    <div className="bd-stage bd-stage--read" style={{ width: W * fit, height: H * fit }}
      onScroll={(e) => {
        // the stage clips with overflow:hidden, but a hidden box still
        // scrolls under focus/scrollIntoView — and a scrolled stage
        // renders the whole board displaced (the desk's invariant)
        const el = e.currentTarget;
        if (el.scrollLeft || el.scrollTop) { el.scrollLeft = 0; el.scrollTop = 0; }
      }}>
      <BoardDressing bd={bd} />
      <div className="bd-canvas" style={{ width: W, height: H, transform: `scale(${fit})` }}>
        {bd.items.map((b) => (
          <StagePiece key={b.id} b={b} playing selected={false} solo={false} fit={fit}
            onSelect={noop} onDragStart={noop} onDragMove={noop} onDragEnd={noop} />
        ))}
      </div>
    </div>
  );
}

/** The stage's true pixel size, per aspect — callers size their frames
 *  from this so a mobile-portrait screen keeps 390 × 844. */
export function boardStageSize(aspect: BoardDef["aspect"]): [number, number] {
  const [w, h] = STAGE[aspect];
  return [w, h];
}

export function BoardView({ playing }: { playing: boolean }) {
  const {
    cfg, boards, activeBoard, library, kitClones, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitNoText, kitVals, kitRow, kitBar, kitTextOy, kitTextOx, kitSlotVals, kitSubs,
    setActiveBoard, addBoard, addBoardAfter, removeBoard, duplicateBoard, renameBoard, moveBoard, clearBoard, setBoardBg,
    setBoardAspect, boardSnap, setBoardSnap, boardSafe, setBoardSafe, boardSel, setBoardSel, zoom, panMode,
    addToBoard, addKitToBoard, moveBoardItem, scaleBoardItem, rotateBoardItem, removeBoardItem,
    duplicateBoardItem, componentReleases, isAdmin, tier,
    applyBoardItemPatches, removeBoardItems, transformBoardItems,
    userAssets, kitAssets, kitPics, addUserAssetToBoard, boardShadowLast,
  } = useGen();
  /* one registry read for every logo road on the desk — the maker's own
     drawer first, then the open document's bundled art, so the stage,
     the piece name and the PNG bake can never disagree about which
     pixels a logo item means */
  const logoAsset = (aid: string) => userAssets.find((a) => a.id === aid) ?? kitAssets.find((a) => a.id === aid);
  /* ── the board's one gate (free-play round, owner mandate 2026-08-26) ──
     exports (board PNG, piece SVG/PNG) are paid — these composites
     render entirely in the browser, so the gate is client-side by
     nature; the modal carries the pitch (sign-up for guests, Pro +
     the free Unity test kit for accounts). Boards themselves are open:
     guests add as many as they like — the old one-board guard is gone. */
  const paidTier = tier === "student" || tier === "pro";
  const guardExport = (run: () => void) => { if (paidTier) run(); else openGate("export"); };
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
    // gated starters never deal for non-admins — the pulldown already
    // hides them, this catches a stale <select> value
    if (STAGED_TEMPLATES.has(tname) && !isAdmin) return;
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
  /* Round 45 · B4 (owner): the Uploads group folds under a caret and
     starts CLOSED on every visit — searching auto-opens it for matches */
  const [uploadsOpen, setUploadsOpen] = useState(false);
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
  /* one live drag gesture (round 56, the owner's field pair):
     · `press` remembers what was grabbed and HOW — selection changes on a
       selected member or under shift are DEFERRED to release-without-
       movement, so the first grab of any member carries the whole group
       (the old press-time collapse was the "they don't all move" bug)
     · `committed` flips once the pointer travels past the 3px slop —
       before that the gesture is still a click and no patch lands
     · `axis` is the shift axis lock (Photoshop convention): chosen by the
       dominant delta when the lock engages, held while shift stays down,
       freed the moment it lifts, re-chosen if it returns */
  const dragRef = useRef<{ list: { id: string; ox: number; oy: number; cox: number; coy: number }[]; dx: number; dy: number; fit: number;
    press: { id: string; bd: string; shift: boolean; member: boolean; multi: boolean };
    committed: boolean; axis: "x" | "y" | null } | null>(null);
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
    if (shift && boardSel === id) {
      /* shift+click toggles membership — the PRIMARY included: the next
         extra takes over as primary, or the selection clears entirely */
      setBoardSel(selExtra[0] ?? null);
      setSelExtra(selExtra.slice(1));
      return;
    }
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
  /* ── the desk pans like a canvas (owner, round-48: "I can scroll
     vertically, but not horizontally. I also need to be able to scroll a
     little bit beyond the canvas bounds") ── the frame scrolls BOTH axes
     natively (two-finger pan, shift+wheel), .bd-desk carries the
     viewport-sized overscroll pad, and the toolbar hand tool drags the
     frame's own scroll position — it used to drag the outer .canvas
     scroller, which has no range on this page, so the hand was dead here. */
  const panDrag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const panDown = (e: React.PointerEvent) => {
    const el = frameRef.current;
    if (!el || !panMode || e.button !== 0) return;
    // chrome still clicks in hand mode — only the desk itself grabs
    if ((e.target as HTMLElement).closest("button, input, select, textarea, .bd-rszwrap")) return;
    e.preventDefault();
    panDrag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const panMove = (e: React.PointerEvent) => {
    const el = frameRef.current;
    if (!el || !panDrag.current) return;
    el.scrollLeft = panDrag.current.sl - (e.clientX - panDrag.current.x);
    el.scrollTop = panDrag.current.st - (e.clientY - panDrag.current.y);
  };
  const panUp = () => { panDrag.current = null; };
  /* entry seat: the overscroll pad must not read as a blank desk — land
     with the first board just under the header, horizontally centered.
     Waits for the REAL frame measure (the 900 seed mis-centers), and
     yields entirely to the return-leg seek when a selection is parked. */
  const seated = useRef(false);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || seated.current) return;
    if (Math.abs(el.getBoundingClientRect().width - frameW) > 3) return;
    const desk = el.querySelector<HTMLElement>(".bd-desk");
    if (!desk) return;
    seated.current = true;
    if (useGen.getState().boardSel) return; // the seek owns this entry
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = Math.max(0, (parseFloat(getComputedStyle(desk).paddingTop) || 0) - 30);
  }, [frameW]);
  /* zoom anchors the view's CENTER, like the master canvas — only the art
     scales (the overscroll pad is constant screen px), so the anchor maps
     the content point under the center, not the raw scroll offset. The
     row sizes are live W*fit styles, so layout is already the new scale
     when this runs. */
  const lastZoom = useRef(zoom);
  useLayoutEffect(() => {
    const el = frameRef.current;
    const prev = lastZoom.current;
    if (!el || prev === zoom) return;
    const k = zoom / prev;
    lastZoom.current = zoom;
    const desk = el.querySelector<HTMLElement>(".bd-desk");
    const cs = desk ? getComputedStyle(desk) : null;
    const padX = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
    const padY = cs ? parseFloat(cs.paddingTop) || 0 : 0;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2 - padX) * k + padX - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2 - padY) * k + padY - el.clientHeight / 2;
  }, [zoom]);
  /* ── rows: the desk is a stack of explicit rows. THE rule (owner:
     "let's just do 1 board per row unless it's mobile then we can do 3 —
     I can't have two big boards side by side"): a 16:9 board always
     stands alone at full size; only mobiles share a row, three at most.
     rowsOf NORMALIZES — a doc that carries an illegal mix (legacy data,
     an aspect flip mid-row) simply splits, so the desk can never show
     it. nl still forces a break. A row shares the frame at one true
     scale, and the shared canvas zoom rides every gesture via the fit
     factor — past 100% the row outgrows the frame and the desk pans to
     reach it (round-48; horizontal used to be clipped). */
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

  /* ── one tray thumb ────────────────────────────────────────────────
     A thumb draws the piece AS IT IS: the same reads svgOf makes for a
     fresh placement of it on a board (owner, round 64: "the assets tray
     in boards isn't updating the thumbnails as the kit piece updates…
     I saw some old thumbs in there"). Before this, only the glyph family
     wore its per-piece design fork and NOTHING wore its slot picks,
     staged value, sub-label, bar/dock config or seat nudges — a piece the
     maker had restyled sat in the tray in its factory clothes.

     The two liberties the tray still takes are its own, not staleness:
     it renders at "s" (a hundred tiles at board scale is a different
     drawer), and glow is zeroed for legibility. Everything else is the
     board's own read, keyed by the piece's id — a clone reads its own
     entries and renders its base, exactly like a clone item on a board. */
  const drawThumb = (key: KitComponentId, base: KitComponentId, ov?: string) => {
    const kb = base === "progress" || base === "segbar" ? kitBar[key] : undefined;
    const nudge = `${key}:${kitSizes[key] ?? "l"}`; // seat nudges are size-keyed, like svgOf's
    const pc = noGlow(applyKitTextFill(applyKitDesign(cfg, kitDesigns[key]), kitTextFill[key]));
    return tightenSvg(renderKit(pc, base, "s", "default", kitVals[key], kitShapes[key], {
      icon: resolveKitIcon(kitIcons[key], undefined),
      pic: kitPicOf({ kitPics, userAssets, kitAssets }, key),
      logo: kitPicOf({ kitPics, userAssets, kitAssets }, key, "logo"),
      label: kitNoText[key] ? "" : kitLabels[key],
      sub: kitSubs[key], slots: kitSlotVals[key],
      textOy: kitTextOy[nudge], textOx: kitTextOx[nudge], overlay: ov,
      dock: kb?.dock ? { icon: resolveKitIcon(kitIcons[key], undefined), side: kb.dockSide ?? "left" } : undefined,
      bar: kb, row: base === "datarow" ? kitRow : undefined,
      themedText: !!kitDesigns[key]?.type || !!kitTextFill[key],
    }), 20);
  };
  /* …and its memo. The tray is ~200 renderKit calls, so one piece's edit
     must not redraw two hundred pieces. The cache key is the IDENTITY of
     every input drawThumb reads — the store replaces these maps and their
     entries wholesale on every edit, so a changed piece always changes its
     key. That is why this cache cannot become the stale thumb it exists to
     prevent: nothing is remembered across a change to anything it drew. */
  const thumbCache = useRef(new Map<string, { k: unknown[]; svg: string }>());
  const thumbOf = (cacheId: string, key: KitComponentId, base: KitComponentId, ov?: string) => {
    const nudge = `${key}:${kitSizes[key] ?? "l"}`;
    const k: unknown[] = [cfg, base, ov, kitDesigns[key], kitTextFill[key], kitShapes[key], kitIcons[key],
      kitLabels[key], kitNoText[key], kitSubs[key], kitSlotVals[key], kitVals[key], kitBar[key],
      kitSizes[key], kitTextOy[nudge], kitTextOx[nudge], base === "datarow" ? kitRow : null];
    const hit = thumbCache.current.get(cacheId);
    if (hit && hit.k.length === k.length && hit.k.every((v, i) => v === k[i])) return hit.svg;
    const svg = drawThumb(key, base, ov);
    thumbCache.current.set(cacheId, { k, svg });
    return svg;
  };

  // asset thumbnails render tight (glow pads collapse) and follow the style;
  // staging-bay pieces show only to the admin until released
  const assets = useMemo(() => {
    if (!trayReady) return []; // catalog thumbs wait one idle beat behind the active board's paint
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
        return { id: entry, kitId: kid, ov, name: nm, hay: `${nm} ${entry} ${g.name} ${SEARCH_TERMS[kid] ?? ""}${ov ? ` ${ov} overlay` : ""}`.toLowerCase(), svg: thumbOf(entry, kid, kid, ov) };
      }),
    }));
    // every map the thumb draws from is a dependency; the per-thumb cache
    // above is what keeps a one-piece edit from redrawing the whole catalog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayReady, cfg, kitShapes, kitTextFill, kitIcons, kitLabels, kitNoText, kitDesigns, kitSubs, kitSlotVals, kitVals, kitBar, kitSizes, kitTextOy, kitTextOx, kitRow, componentReleases, isAdmin]);

  /* the user's duplicated pieces — live kit citizens like the stock roster
     above. Thumbs render the BASE component wearing the clone's own design
     fork (that fork is the whole point of a clone); a staged base keeps
     its clones admin-only, same gate as the stock entry */
  const cloneAssets = useMemo(() => Object.entries(kitClones)
    .filter(([, c]) => kitVisible(c.base, componentReleases, isAdmin))
    .map(([cid, c]) => {
      const key = cid as KitComponentId; // per-piece maps are clone-keyed
      const baseName = KIT_COMPONENTS.find((k) => k.id === c.base)?.name ?? c.base;
      return {
        id: cid, kitId: key, name: c.name,
        hay: `${c.name} ${c.kind} ${baseName}`.toLowerCase(),
        svg: thumbOf(cid, key, c.base),
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg, kitClones, kitDesigns, kitShapes, kitTextFill, kitIcons, kitLabels, kitNoText, kitSubs, kitSlotVals, kitVals, kitBar, kitSizes, kitTextOy, kitTextOx, kitRow, componentReleases, isAdmin]);

  const selBoard = boards.find((bd) => bd.items.some((b) => b.id === boardSel)) ?? null;
  const sel = selBoard?.items.find((b) => b.id === boardSel) ?? null;
  /* the SAVED COMPONENT behind a selection, when that's what it is —
     a `libId` copy with no `kitId` of its own. */
  const selSaved = sel && !sel.kitId && sel.libId ? library.find((l) => l.id === sel.libId) : undefined;
  /* One kit id for the piece the Inspector is acting on: the copy's own
     when it has one, otherwise the clone a saved component becomes the
     moment the maker asks to edit or re-save it. The board promise ("Edit
     component opens it") and the store's mint ask the same question
     (savedPromotable), so the button can never offer what the action
     refuses. */
  const kitIdFor = (b: BoardItem): KitComponentId | null =>
    b.kitId ?? (savedPromotable(library.find((l) => l.id === b.libId))
      ? useGen.getState().promoteSavedToKit(b.libId)
      : null);
  const selEditable = !!sel && (!!sel.kitId || savedPromotable(selSaved));

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
      return { svg: renderKit(pc, bBase, bSize, "default", b.v ?? kitVals[b.kitId], kitShapes[b.kitId], { icon: resolveKitIcon(kitIcons[b.kitId], undefined), pic: kitPicOf({ kitPics, userAssets, kitAssets }, b.kitId), logo: kitPicOf({ kitPics, userAssets, kitAssets }, b.kitId, "logo"), label: kitNoText[b.kitId] ? "" : (b.label ?? kitLabels[b.kitId]), sub: kitSubs[b.kitId], slots: kitSlotVals[b.kitId], textOy: kitTextOy[`${b.kitId}:${bSize}`], textOx: kitTextOx[`${b.kitId}:${bSize}`], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov, dock: kb?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kb.dockSide ?? "left" } : undefined, bar: kb, row: bBase === "datarow" ? kitRow : undefined, themedText: !!kitDesigns[b.kitId]?.type || !!kitTextFill[b.kitId] }), cfg: pc };
    }
    if (b.stamp) return { svg: stampSvg(cfg, b.stamp), cfg };
    // big glyphs and user logos are raster art — the PNG compositor
    // draws them directly
    if (b.big || b.logo) return { svg: "", cfg };
    const item = library.find((l) => l.id === b.libId);
    if (!item) return { svg: "", cfg };
    return { svg: item.kit ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", item.kit.v, item.kit.shape, item.kit.label !== undefined ? { label: item.kit.label } : undefined) : renderBevel(item.cfg, "default"), cfg: item.cfg };
  };

  /* WHERE a piece bottoms out. Every control asks this one function —
     the scale slider, the typed percent, the corner handle and the group
     clamp — and it asks the same measurement the store's own clamp uses,
     so they cannot disagree about a piece's floor. */
  const scaleMinOf = (b: BoardItem) => boardScaleMin(b, boardItemArtShort(useGen.getState(), b));

  const nameOf = (b: BoardItem): string => {
    if (b.stamp) return `"${b.stamp.text}"`;
    if (b.big) return bigGlyphById(b.big.gid)?.name ?? "Big glyph";
    if (b.logo) return logoAsset(b.logo.aid)?.name ?? "My asset";
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
        const ua = logoAsset(b.logo.aid);
        if (!ua) continue;
        const url = await bgAssetDisplayUrl(ua.ref).catch(() => null);
        if (!url) continue;
        const s = (b.scale ?? 1) * BIG_GLYPH_BASE;
        await new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            /* the FOOTPRINT is the registry's w/h, never the raster's own
               (UserAsset.w/h) — identical for an upload, and the one thing
               that keeps a bake honest when the art behind a ref is a
               smaller display tier, the big glyphs' contract */
            const w = ua.w * s, h = ua.h * s;
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
      /* pad reclaim reads the ACTUAL viewBox origin — the same rule the
         stage (LiveArt's anchorContent) and the Unity exporter speak: a
         negative origin is glow pad to pull back so viewBox 0 lands on
         (x,y); a zero/positive origin (type stamps, most custom roots)
         reclaims nothing. For build() shells −origin === glowPadOf, so
         this is identity with the old constant; for custom roots (orb,
         lives, emotewheel, ring…) it retires the 90·s drift where the
         compositor subtracted glowPadOf on glow-armed kits while the
         stage reclaimed their real origin of 0. */
      const vbOr = /viewBox="(-?[\d.]+)/.exec(svg);
      const pad = vbOr && +vbOr[1] < 0 ? -+vbOr[1] : 0;
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
     the cursor. A plain click still adds to the active board. Saved
     components ride the same road via libId. */
  const ghostRef = useRef<{ kitId?: KitComponentId; libId?: string; ov?: string; svg: string; x0: number; y0: number; moved: boolean } | null>(null);
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
      const x = Math.max(0, sv((e.clientX - r.left) / f) - 110), y = Math.max(0, sv((e.clientY - r.top) / f) - 55);
      st.addBoardItems([g.libId ? { libId: g.libId, x, y } : { kitId: g.kitId!, ov: g.ov, x, y }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  const scrollToBoard = (id: string) => {
    frameRef.current?.querySelector(`[data-board="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  /* the roundtrip's RETURN leg (round-48): re-entering the Boards lands on
     the piece you left selected — the frame starts at the top on every
     mount, so a selection parked on a lower board arrived off-screen. The
     scroll runs behind the board curtain; a short seek covers the beat
     where the stage frame commits before its items.
     Round 53 (owner: "come back to the boards, the board's content
     shifts"): the seek used scrollIntoView, which scrolls EVERY scrollable
     ancestor — including the overflow:hidden .bd-stage. A piece whose
     glow-padded box pokes past its board's edge made the browser scroll
     the stage's hidden overflow to center it, displacing the whole board
     canvas inside its frame with no way to scroll it back (reload had no
     parked selection, so cold loads rendered clean — the tell). The seek
     now steers ONLY the frame scroller, by hand. */
  useEffect(() => {
    const sel = useGen.getState().boardSel;
    if (!sel) return;
    let tries = 0;
    let t = 0;
    const seek = () => {
      const frame = frameRef.current;
      const el = frame?.querySelector(`[data-bid="${sel}"]`);
      if (frame && el) {
        const fr = frame.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        frame.scrollLeft += r.left + r.width / 2 - (fr.left + fr.width / 2);
        frame.scrollTop += r.top + r.height / 2 - (fr.top + fr.height / 2);
        return;
      }
      if (++tries <= 20) t = window.setTimeout(seek, 120);
    };
    seek();
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`board2${playing ? " playing" : ""}${panMode ? " pan" : ""}`} style={{ "--trayl": `${trayW.l}px`, "--trayr": `${trayW.r}px` } as React.CSSProperties}>
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
        <div className="bd-teach">Click a piece to add it to the screen, or drag it straight onto a board.</div>
        <button className="bd-stampbtn" title="Drop the kit's lettering on the board: type any words, size them like a logo"
          onClick={() => useGen.getState().addStampToBoard()}>
          <Type size={13} strokeWidth={2.2} /> Type stamp: your words in the kit's lettering
        </button>
        {/* the PLAIN tier (owner: "a delineation between splash text and
            just good font usage") — same face, flat pickable color, for
            labels that must READ against any backdrop */}
        <button className="bd-stampbtn" title="Plain text in the kit's font. Pick its color in the side rail; for labels that must stay readable"
          onClick={() => useGen.getState().addStampToBoard(true)}>
          <Type size={13} strokeWidth={2.2} /> Plain text: the kit's font, your color
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
                    <button key={it.id} className="bd-asset" title={`Add ${it.name} to ${act?.name ?? "the board"}, or drag it onto any board`}
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
            /* a clone minted by Save-to-my-assets already has its tile in
               the Saved components drawer below (LibItem.cloneId) — one
               entity, one tile. It resurfaces here if that drawer entry
               is ever deleted while the clone lives on. */
            const items = cloneAssets.filter((it) => !library.some((l) => l.cloneId === it.id))
              .filter((it) => terms.every((t) => it.hay.includes(t)));
            if (!items.length) return null;
            return (
              <div>
                <div className="bd-cat">Your components</div>
                <div className="bd-grid">
                  {items.map((it) => (
                    <button key={it.id} className="bd-asset" title={`Add ${it.name} to ${act?.name ?? "the board"}, or drag it onto any board`}
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
                          <button className="danger" title={`Delete ${a.name}. Board copies of it go too`} aria-label={`Delete ${a.name}`}
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
                  title="Upload your own image. A transparent PNG makes the best logo; JPG and WebP work too. 2 MB cap; big images downscale on import."
                  onClick={() => uaInput.current?.click()}>
                  <ImagePlus size={13} strokeWidth={2.2} /> {uaBusy ? "Importing…" : "Upload a logo: transparent PNG shines"}
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
            /* Round 45 · B4 (owner): the Uploads group folds under a caret,
               CLOSED by default — 71 tiles of brought-in art shouldn't lead
               the drawer. Everyone sees the group (the set is released in
               code, no admin gate); a live search that matches upload items
               opens the fold for those results, since the maker asked for
               them by name. */
            const open = uploadsOpen || terms.length > 0;
            return (
              <div>
                {/* owner rename 2026-08-28: this class is uploaded artwork
                    (the engine dresses geometry; these are pixels brought IN)
                    — "Uploads" here, "Art" in the Unity export. Provenance
                    is PER-ITEM (owner correction, same day: uploads aren't
                    always AI-generated) — the note rides only entries whose
                    registry row says so, never the whole group. */}
                <button className="bd-cat bd-catfold" aria-expanded={open}
                  title={open ? "Fold the Uploads away" : `Show the ${items.length} upload tiles`}
                  onClick={() => setUploadsOpen((v) => !v)}>
                  Uploads <span className="bd-cat-note">{items.length}</span> {open ? "▾" : "▸"}
                </button>
                {open && (
                <div className="bd-grid">
                  {items.map((g) => (
                    <button key={g.id} className="bd-asset" title={`Add ${g.name} to ${act?.name ?? "the board"}${g.ai ? " · AI-generated" : ""}`}
                      onClick={() => useGen.getState().addBigGlyphToBoard(g.id)}>
                      <span><img src={bigGlyphThumb(g.id)} alt={g.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: 64 }} /></span>
                      <i>{g.name}{g.ai ? <span className="bd-cat-note"> AI</span> : null}</i>
                    </button>
                  ))}
                </div>
                )}
              </div>
            );
          })()}
          {library.length > 0 && (
            <div>
              <div className="bd-cat">Saved components</div>
              <div className="bd-grid">
                {library.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())).map((l) => {
                  /* a save-minted twin (LibItem.cloneId) makes the tile LIVE:
                     it thumbs, places and EDITS the clone — one entity
                     everywhere the owner meets it (owner: "I wanna be able
                     to edit my new GO banner component"). A deleted twin
                     drops the tile back to the frozen-snapshot road (the
                     tombstone), so old saves behave exactly as before. */
                  const live = l.cloneId ? cloneAssets.find((c) => c.id === l.cloneId) : undefined;
                  const art = live?.svg ?? tightenSvg(l.kit ? renderKit(l.cfg, l.kit.id, l.kit.size, "default", l.kit.v, l.kit.shape, l.kit.label !== undefined ? { label: l.kit.label } : undefined) : renderBevel(l.cfg, "default"), 20);
                  // click: the store resolves live vs frozen and lands both
                  // centered in the active board's frame
                  const place = () => { if (suppressClick.current) { suppressClick.current = false; return; } addToBoard(l.id); };
                  return (
                    /* div-with-role, the My-assets tile pattern — real
                       <button>s can't nest, and a live tile carries its
                       own Edit control */
                    <div key={l.id} className="bd-asset bd-sasset" role="button" tabIndex={0}
                      title={`Add ${l.name} to ${act?.name ?? "the board"}, or drag it onto any board`}
                      onClick={place}
                      onKeyDown={(e) => { if (e.key === "Enter") place(); }}
                      onPointerDown={(e) => { if (e.button === 0) ghostRef.current = { ...(live ? { kitId: live.kitId } : { libId: l.id }), svg: art, x0: e.clientX, y0: e.clientY, moved: false }; }}
                      onPointerEnter={() => setPreview({ name: l.name, svg: art })}
                      onPointerLeave={() => setPreview(null)}>
                      <span dangerouslySetInnerHTML={{ __html: art }} />
                      <i>{l.name}</i>
                      {(live || savedPromotable(l)) && (
                        /* the same promise the Board's Inspector makes: a
                           frozen tile joins the kit on this click (its look
                           pinned, its placements rebound) and opens live. */
                        <span className="bd-uactl" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                          <button title={live
                            ? `Edit ${l.name}. Every control shapes this saved component live`
                            : `Edit ${l.name}. It joins the kit as a live piece — the same look, now editable — and every copy of it on your boards follows`}
                            aria-label={`Edit ${l.name}`}
                            onClick={() => {
                              const kid = live?.kitId ?? useGen.getState().promoteSavedToKit(l.id);
                              if (!kid) return;
                              useGen.getState().setFocus(kid);
                              useGen.getState().setPhase("master");
                            }}>
                            <SquarePen size={11} strokeWidth={2.4} /> Edit
                          </button>
                        </span>
                      )}
                    </div>
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
            title="Add a full starter screen: pieces land pre-sized and pre-placed, backdrop included">
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
                .filter((t) => isAdmin || !STAGED_TEMPLATES.has(t))
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="bd-snap"><Grid3x3 size={13} strokeWidth={2} /> Snap to grid
            <input type="checkbox" checked={boardSnap} onChange={(e) => setBoardSnap(e.target.checked)} />
          </label>
          <label className="bd-snap" title="Safe-area guides: keep HUD inside the dashed frames. 16:9 shows action/title safe; Mobile shows notch and home-bar insets. Guides never export.">
            <Shield size={13} strokeWidth={2} /> Safe area
            <input type="checkbox" checked={boardSafe} onChange={(e) => setBoardSafe(e.target.checked)} />
          </label>
          <button className="bd-export" onClick={() => guardExport(() => { if (act) void exportPng(act); })}><Download size={14} strokeWidth={2.2} /> Export PNG</button>
          <button className="bd-export" title="Every piece on a transparent PNG: no backdrop, no base fill. Drops straight into an engine or a mockup"
            onClick={() => guardExport(() => { if (act) void exportPng(act, { alpha: true }); })}>
            <Download size={14} strokeWidth={2.2} /> PNG · no background
          </button>
          <button className="bd-export bd-exportall"
            title="Every board as a full-resolution PNG, one after another. The browser may ask once to allow multiple downloads"
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
            panDown(e);
            const t = e.target as HTMLElement;
            if (!t.closest(".board-item, .bd-rszwrap, .bd-abhead")) setBoardSel(null);
          }}
          onPointerMove={panMove} onPointerUp={panUp} onPointerCancel={panUp}>
          {/* .bd-desk is the scrollable content — it wears the overscroll
              pad (all four sides, ~45% of the window) and sizes to its
              widest row so the trailing pad survives the scroller */}
          <div className="bd-desk">
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
                    title={`Export ${bd.name} as a PNG at full ${W} × ${H} resolution: background, overlay and pieces`}
                    onClick={() => guardExport(() => void exportPng(bd))}>
                    <Download size={12} strokeWidth={2.2} />
                  </button>
                  <button className="bd-abtool" aria-label={`Duplicate ${bd.name}`}
                    title={`Duplicate ${bd.name}: pieces, backdrop and darkroom dials, a running start for the next screen`}
                    onClick={() => duplicateBoard(bd.id)}>
                    <Copy size={12} strokeWidth={2.2} />
                  </button>
                  <button className="bd-abtool" aria-label={`Clear ${bd.name}`}
                    title="Clear this board: every piece and the background"
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
                  onPointerDown={(e) => { setActiveBoard(bd.id); if (e.target === e.currentTarget) setBoardSel(null); }}
                  /* round 53, the invariant keeper: the stage clips with
                     overflow:hidden, but hidden boxes still scroll under
                     scrollIntoView/focus — and a scrolled stage renders the
                     ENTIRE board displaced with no scrollbar to undo it.
                     Any scroll that lands here is a bug; snap it back. */
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollLeft || el.scrollTop) { el.scrollLeft = 0; el.scrollTop = 0; }
                  }}>
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
                  <BoardDressing bd={bd} />
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
                        onSelect={(e) => {
                          /* press-time selection (round 56, the Figma/Photoshop
                             contract): a plain grab of an UNSELECTED piece selects
                             it alone right away; a grab of a selected member
                             changes NOTHING yet — the group must survive the grab
                             (the old press-time collapse was the owner's "they
                             don't all move" bug) — and a shift press defers whole:
                             release-without-movement toggles membership, movement
                             instead becomes a drag under the axis lock. */
                          if (playing) { pickPiece(bd.id, b.id, !!e?.shiftKey); return; }
                          setActiveBoard(bd.id);
                          if (!e?.shiftKey && !selIdsAll.includes(b.id)) { setBoardSel(b.id); setSelExtra([]); }
                        }}
                        onDragStart={(e) => {
                          const member = selIdsAll.includes(b.id);
                          /* the dragged set: any selected member carries the whole
                             selection from the FIRST grab; a shift grab of an
                             outsider stages selection+piece — it only engages if
                             movement commits, and the piece then joins the set */
                          const group = member && selIdsAll.length > 1
                            ? bd.items.filter((it) => selIdsAll.includes(it.id))
                            : e.shiftKey && !member && boardSel && bd.items.some((it) => it.id === boardSel)
                              ? [...bd.items.filter((it) => selIdsAll.includes(it.id)), b]
                              : [b];
                          // center offsets captured at grab time — grid snap
                          // lands each piece's visible CENTER on the grid
                          dragRef.current = { list: group.map((it) => ({ id: it.id, ox: it.x, oy: it.y, ...(() => { const c = artCenterOffsetOf(bd.id, it); return { cox: c.cx, coy: c.cy }; })() })), dx: e.clientX, dy: e.clientY, fit,
                            press: { id: b.id, bd: bd.id, shift: !!e.shiftKey, member, multi: selIdsAll.length > 1 }, committed: false, axis: null };
                        }}
                        onDragMove={(e) => {
                          const d = dragRef.current;
                          /* any MEMBER's handler may drive the gesture — when
                             capture doesn't stick (the pointer-honesty relay,
                             overlapping pieces) the moves arrive via whichever
                             member sits under the pointer */
                          if (!d || !d.list.some((g) => g.id === b.id)) return;
                          // same dead-man rule as the resize handles: no button, no gesture
                          if (!(e.buttons & 1)) { dragRef.current = null; return; }
                          const sdx = e.clientX - d.dx, sdy = e.clientY - d.dy;
                          if (!d.committed) {
                            // under the 3px slop the press is still a click
                            if (Math.hypot(sdx, sdy) < 3) return;
                            d.committed = true;
                            // a shift grab of an outsider joins it to the set as it drags
                            if (d.press.shift && !d.press.member && d.list.length > 1) {
                              const add = d.press.id;
                              setSelExtra((xs) => (xs.includes(add) ? xs : [...xs, add]));
                            }
                          }
                          /* SHIFT+DRAG AXIS LOCK (owner: "constrain the items to
                             vertical or horizontal movement (like photoshop)").
                             The locked axis pins each piece to its grab position —
                             no sideways snap-jump — while the free axis still
                             answers snap-to-grid like any drag. */
                          if (e.shiftKey) { if (!d.axis) d.axis = Math.abs(sdx) >= Math.abs(sdy) ? "x" : "y"; }
                          else d.axis = null;
                          const mdx = sdx / d.fit, mdy = sdy / d.fit;
                          applyBoardItemPatches(`grpmove:${d.list.map((g) => g.id).join(",")}`,
                            d.list.map((g) => ({
                              id: g.id,
                              x: d.axis === "y" ? Math.round(g.ox) : snapPos(g.ox + mdx, g.cox),
                              y: d.axis === "x" ? Math.round(g.oy) : snapPos(g.oy + mdy, g.coy),
                            })));
                        }}
                        onDragEnd={(e) => {
                          const d = dragRef.current;
                          dragRef.current = null;
                          if (!d || !d.list.some((g) => g.id === b.id) || d.committed || e?.type !== "pointerup") return;
                          // released without movement — the deferred click lands
                          // now, always on the piece that was PRESSED
                          if (d.press.shift) pickPiece(d.press.bd, d.press.id, true); // toggle membership
                          else if (d.press.member && d.press.multi) { setBoardSel(d.press.id); setSelExtra([]); } // collapse to the grabbed piece
                        }} />
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
                        <input className="bd-inlineedit" aria-label="Edit the words in place"
                          /* focus WITHOUT scrolling (round 53): autoFocus
                             let the browser scroll the overflow:hidden
                             stage to reveal an edge-hugging editor —
                             the same content-displacing class as the
                             return-leg seek. The dblclick that opened
                             this editor proves the piece is already on
                             screen; no scroll is ever needed. */
                          ref={(el) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }}
                          value={val}
                          maxLength={isStamp ? 40 : labelMaxOf(baseOf(eb.kitId!))}
                          placeholder={isStamp ? "Type the words…" : (eb.kitId ? kitLabels[eb.kitId] || "Text for this copy" : "")}
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
                                  .map((it) => ({ id: it.id, s0: it.scale ?? 1, px: it.x, py: it.y, min: scaleMinOf(it) }));
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
                    {bd.items.length === 0 && !bd.bgImage && !bd.bgVideo && <div className="bd-empty"><span>An empty stage. Pick a <b>Starter screen</b> above, or click an asset on the left.</span></div>}
                  </div>
                  </>)}
                </div>
                {/* grow the desk in either direction (owner: "plus signs
                    beneath and to the right of boards") — the side +
                    keeps the newcomer ON this row (the row rescales to
                    fit, never scrolls), beneath starts the next row */}
                {sideAspect && (
                  <button className="bd-addtab bd-addtab--r"
                    title={`Add a ${sideAspect === "mobile" ? "mobile" : "16:9"} board beside ${bd.name}${sideAspect !== bd.aspect ? ". The row rescales so both fit" : ""}`}
                    aria-label={`Add a board to the right of ${bd.name}`}
                    onClick={() => addBoardAfter(bd.id, { aspect: sideAspect })}>
                    <Plus size={14} strokeWidth={2.2} />
                  </button>
                )}
                <button className="bd-addtab bd-addtab--b" title={`Add a board below ${bd.name}`}
                  aria-label={`Add a board below ${bd.name}`}
                  onClick={() => addBoardAfter(row[row.length - 1].id, { aspect: bd.aspect, nl: true })}>
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
          <button className="bd-addboard-inline" onClick={addBoard}><Plus size={14} strokeWidth={2.2} /> Add board</button>
          </div>
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
                <button title={`Duplicate ${bd.name}`} onClick={(e) => { e.stopPropagation(); duplicateBoard(bd.id); }}><Copy size={11} strokeWidth={2.4} /></button>
                <button title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveBoard(bd.id, -1); }}><ArrowUp size={11} strokeWidth={2.4} /></button>
                <button title="Move down" disabled={i === boards.length - 1} onClick={(e) => { e.stopPropagation(); moveBoard(bd.id, 1); }}><ArrowDown size={11} strokeWidth={2.4} /></button>
                <button title={`Delete ${bd.name}`} className="danger"
                  onClick={(e) => { e.stopPropagation(); if (bd.items.length === 0 || window.confirm(`Delete ${bd.name} and its ${bd.items.length} pieces?`)) removeBoard(bd.id); }}>
                  <X size={11} strokeWidth={2.4} />
                </button>
              </span>
            </div>
          ))}
          <button className="bd-addboard" onClick={addBoard}><Plus size={13} strokeWidth={2.2} /> Add board</button>
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
              <button title="Distribute horizontally: equal gaps, outer pieces planted (3+ pieces)"
                aria-label="Distribute horizontally" disabled={selIdsAll.length < 3}
                onClick={() => distributeSel("h")}>
                <AlignHorizontalSpaceBetween size={13} strokeWidth={2} />
              </button>
              <button title="Distribute vertically: equal gaps, outer pieces planted (3+ pieces)"
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
            {/* big glyphs, user logos and semantic glyph pieces (clones
                included — boardScaleMin resolves through baseOf) dive to 5%
                (match-3 tiles on a mobile board need ~12%; owner from the
                Pause board: "i need to be able to shrink these glyphs
                smaller"). Every other piece floors where its OWN art hits
                BOARD_MIN_ART_PX, so a tall card back reaches ~9% while a
                count badge still stops at 30% — a flat percentage could
                only ever be wrong for one of them (owner, round 67: "I
                need to be able to size the card backs lower than 30%").
                The typed entry exists because one slider pixel jumps several
                percent at the small end — the owner types 12 and gets 12. */}
            <label className="bd-slider"><span className="bd-sliderhead">Scale ·
              <ScaleEntry id={sel.id} pct={Math.round((sel.scale ?? 1) * 100)} min={Math.floor(scaleMinOf(sel) * 100)} />%</span>
              <input type="range" min={Math.floor(scaleMinOf(sel) * 100)} max={200} value={Math.round((sel.scale ?? 1) * 100)}
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
              <label className="bd-slider" title="9-slice width: the track re-renders wider; caps and knob stay true. The side handles on the piece do the same by hand.">
                Width · {Math.round((sel.stretch ?? 1) * 100)}%
                <input type="range" min={70} max={300} value={Math.round((sel.stretch ?? 1) * 100)}
                  onChange={(e) => useGen.getState().stretchBoardItem(sel.id, +e.target.value / 100, sel.x)}
                  onDoubleClick={() => useGen.getState().stretchBoardItem(sel.id, 1, sel.x)} />
              </label>
            )}
            {sel.kitId && STRETCHABLE_V.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="9-slice height: the shell re-renders taller; walls and rim stay true. The top/bottom handles on the piece do the same by hand.">
                Height · {Math.round((sel.stretchY ?? 1) * 100)}%
                <input type="range" min={70} max={300} value={Math.round((sel.stretchY ?? 1) * 100)}
                  onChange={(e) => useGen.getState().stretchBoardItemV(sel.id, +e.target.value / 100, sel.y)}
                  onDoubleClick={() => useGen.getState().stretchBoardItemV(sel.id, 1, sel.y)} />
              </label>
            )}
            <label className="bd-slider" title="This piece's opacity: ghosted HUD layers, faded scenery. Double-click restores full strength. Exports honor it.">
              Opacity · {sel.opacity ?? 100}%
              <input type="range" min={0} max={100} value={sel.opacity ?? 100}
                onChange={(e) => useGen.getState().setBoardItemOpacity(sel.id, +e.target.value)}
                onDoubleClick={() => useGen.getState().setBoardItemOpacity(sel.id, null)} />
            </label>
            {sel.kitId && VALUE_DRIVEN.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="Value for this piece only (fill level, rarity tier, pose). Double-click to follow the kit again.">
                Value for this piece · {Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}%
                <input type="range" min={0} max={100} value={Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}
                  onChange={(e) => useGen.getState().setBoardItemVal(sel.id, +e.target.value / 100)}
                  onDoubleClick={() => useGen.getState().setBoardItemVal(sel.id, null)} />
              </label>
            )}
            {sel.kitId && KIT_LABEL_EDITABLE.has(baseOf(sel.kitId)) && (
              <label className="bd-slider" title="Text for this copy only. Clear the field to follow the kit again. Double-clicking the piece on the stage edits in place.">
                The words for this copy
                <input className="bd-abname bd-words" maxLength={labelMaxOf(baseOf(sel.kitId))} aria-label="Instance text"
                  placeholder={kitLabels[sel.kitId] || "Text for this copy"}
                  value={sel.label ?? ""}
                  onChange={(e) => useGen.getState().setBoardItemLabel(sel.id, e.target.value)} />
              </label>
            )}
            {sel.kitId && sel.ov?.startsWith("icon:") && (
              /* the per-copy glyph RACK is retired (owner, round 54: every
                 glyph now has its own real button — picking a glyph is
                 placing the right piece, or the kit-wide Icons pick), but
                 the ov ROAD it wrote still renders every dealt and
                 hand-set "icon:<stock>" / "icon:glyph:<id>" copy exactly
                 as before. What remains is the honest reset: a copy that
                 WEARS a per-copy glyph can always follow the kit again —
                 a stored dial with no way back would break the
                 editability law. One-way by design. */
              <div className="bd-actions one">
                <button aria-label="Factory glyph: follow the kit"
                  title="This copy wears its own glyph (a starter deal, or a pick from before the per-copy rack retired). Follow the kit again: the family's stock glyph, or your kit-wide pick under Icons. To seat a different glyph, place its glyph button from the tray."
                  onClick={() => useGen.getState().setBoardItemOv(sel.id, null)}>
                  <RotateCcw size={12} strokeWidth={2.2} /> Factory glyph: follow the kit
                </button>
              </div>
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
                <label className="bd-slider" title="Drop shadow for this copy only. While on it replaces the kit's own cast shadow here; double-click (or 0) follows the kit again. Exports and Unity scenes carry it.">
                  Drop shadow for this copy · {sh?.s ?? 0}%
                  <input type="range" min={0} max={100} value={sh?.s ?? 0}
                    onChange={(e) => patch({ s: +e.target.value })}
                    onDoubleClick={() => patch(null)} />
                </label>
                {!sh?.s && boardShadowLast && (
                  <div className="bd-actions one">
                    <button title="Apply the last shadow you dialed: strength and pose together"
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
                  <div className="bd-note">Replaces the kit's cast shadow on THIS copy; in Unity it travels as the grounded shadow sibling, planted while the piece lifts and presses.</div>
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
                <label className="bd-slider" title="The words this piece shows. Type and the art follows live. Double-clicking the piece on the stage edits in place.">
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
                    title="The kit's full splash lettering: gradients, outline, glints, the works"
                    onClick={() => patch({ plain: undefined })}>Splash</button>
                  <button className={st.plain ? "on" : ""} role="radio" aria-checked={!!st.plain}
                    title="The kit's font at one flat color you pick, for labels that stay readable on any backdrop"
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
                <div className="bd-note">The dials touch only THIS stamp. The kit's typography stays put. Glow wears the kit's Glow color.</div>
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
                <div className="bd-note">Your own art. The kit never restyles it. The dials touch only THIS copy; glow follows the kit's Glow color until you pick your own.</div>
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
              {selEditable && (
                /* A saved component is edited like any other piece now: the
                   click brings it into the kit as a live clone of the exact
                   look it was saved at, rebinds every copy of it, and opens
                   THAT. Nothing on the board moves; the frozen snapshot
                   stays in the drawer behind it. */
                <button onClick={() => {
                  const kid = kitIdFor(sel);
                  if (!kid) return;
                  useGen.getState().setFocus(kid);
                  useGen.getState().setPhase("master");
                }}
                  title={sel.kitId
                    ? "Open this component in the editor. Every control shapes it live"
                    : "Open this saved component in the editor. It joins the kit as a live piece — the same look, now editable — and every copy of it on your boards follows"}>
                  <SquarePen size={13} strokeWidth={2.2} /> Edit component
                </button>
              )}
              <button onClick={() => duplicateBoardItem(sel.id)} title="Duplicate this piece (⌘D)">
                <Copy size={13} strokeWidth={2.2} /> Duplicate
              </button>
              {selEditable && (
                /* rehomed from the retired floating tray — its one unique.
                   The owner's FORWARD-button worry: a piece reworked on the
                   Board (words, value, the component's current look) freezes
                   into a named asset — the master keeps its own life.
                   A saved copy can be re-saved too: it joins the kit first
                   (same click, same look), then saves like anything else. */
                <button title={sel.kitId && CLONE_INELIGIBLE.has(baseOf(sel.kitId))
                  /* the two pieces that cannot be duplicated keep their content
                     in store singletons — no clone, so no live twin to open.
                     The tooltip says exactly that rather than promising a
                     button that will not be there. */
                  ? "Save to my assets: this piece, with this look and label, becomes a reusable asset in the drawer. This component can't be duplicated, so the board copy stays as it is and the saved asset is a snapshot. The master component stays untouched."
                  : "Save to my assets: this piece, with this look and label, becomes a reusable asset, and this copy becomes the saved item (Edit component opens it). The master component stays untouched."}
                  onClick={() => {
                    const def = sel.label ?? (sel.kitId
                      ? kitClones[sel.kitId]?.name ?? KIT_COMPONENTS.find((c) => c.id === baseOf(sel.kitId!))?.name
                      : selSaved?.name) ?? "My asset";
                    const name = window.prompt("Save this piece to your assets as:", def);
                    if (!name?.trim()) return;
                    // a saved copy joins the kit before it can be re-saved
                    if (!kitIdFor(sel)) return;
                    useGen.getState().saveBoardItemAsAsset(sel.id, name.trim());
                  }}>
                  <BookmarkPlus size={13} strokeWidth={2.2} /> Save to my assets
                </button>
              )}
              <button onClick={() => guardExport(() => { const p = svgOf(sel); void svgWithFaces(p.svg, p.cfg).then((s) => downloadSvg(s, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)); })}
                title="This piece as a crisp, infinitely scalable SVG">
                <Download size={13} strokeWidth={2.2} /> SVG
              </button>
              <button onClick={() => guardExport(() => { const p = svgOf(sel); void downloadPieceRaster(p, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`); })}
                title="This piece as a transparent-background PNG at 2×. Drops straight into an engine or a mockup">
                <Download size={13} strokeWidth={2.2} /> PNG
              </button>
              <button className="danger" onClick={() => removeBoardItem(sel.id)} title="Remove (Delete)">
                <Trash2 size={13} strokeWidth={2.2} /> Remove
              </button>
            </div>
            {sel.kitId
              ? <div className="bd-note"><Lock size={11} strokeWidth={2.2} /> Live asset: restyling the kit restyles this piece.</div>
              : selSaved
                ? <div className="bd-note">{savedPromotable(selSaved)
                  ? <>Saved component — a frozen snapshot of “{selSaved.name}”. Edit component brings it into the kit as a live piece, and it travels with the kit from then on.</>
                  : <>Saved component — a frozen snapshot of “{selSaved.name}”. This one was saved before pieces could be brought back into the kit, so it stays as it is.</>}</div>
                : null}
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
                      title="Fill the board: the scene covers the frame; overflow is cropped"
                      onClick={() => setBoardBg({ bgFit: "cover" })}>Fill</button>
                    <button className={act.bgFit === "fit" ? "on" : ""} role="radio" aria-checked={act.bgFit === "fit"}
                      title="Show the whole scene: nothing cropped, a blurred fill behind"
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
                      ? "Your uploaded loop plays for this session only. Bundled scenes, images and pasted URLs stick around."
                      : act.bgVideo.startsWith("/")
                        ? "The loop plays on the live board; a PNG export uses its first frame."
                        : "A remote loop plays on the live board and persists; the PNG export can include its frame only when the host allows it (CORS)."
                    : "The image crops to the board bounds: cover fit, nothing spills."}
                </div>
              </>
            ) : (
              <div className="bd-actions one">
                <button onClick={() => bgInput.current?.click()}><ImagePlus size={13} strokeWidth={2.2} /> Upload your own image or mp4</button>
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
                <div className="bd-note">Sits between the backdrop and your pieces. Knock the art back so components pop. Exports include it.</div>
              </>
            ) : (
              <div className="bd-note">A dark, light or vignetted wash with film grain, between the backdrop and the pieces.</div>
            )}
            <label className="bd-slider" title="Dims the middle of the frame: the move games make behind menus so the UI pops. Stacks with the overlay above, or works alone.">
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
            <button className="lootclaim" onClick={() => { const t = starterAsk; setStarterAsk(null); applyStarter(t, "fresh"); }}>
              <Plus size={15} strokeWidth={2.4} /> A FRESH BOARD
            </button>
            <button className="lootclaim" onClick={() => { const t = starterAsk; setStarterAsk(null); applyStarter(t, "replace"); }}>
              <Copy size={15} strokeWidth={2.4} /> REPLACE THESE PIECES, BACKDROP STAYS
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

/* the BODY-BOX discriminator (owner class rule, round 49: glows must fall
   off naturally "without increasing the hit area (and thereby boards
   selection area)"; the Unity export applies the same rule to raycast
   boxes). The old scans took ANY alpha > 8 as ink, so a glow-dressed
   stamp's selection box inflated with its halo. Solid ink and haze are
   separable by construction: a gaussian glow/shadow tail peaks at about
   HALF its pass's opacity just outside the ink edge (a blurred step) and
   decays from there — one pass ≲128, stacked passes stay under ~200 —
   while letterform and outline ink sit at 255 behind a one-pixel AA
   fringe. Scanning solid (≥232) therefore keeps every drawn body and
   sheds every halo, at full designed glow extent on screen. A render
   with no solid ink at all (hairline strokes swallowed by AA at scan
   scale) falls back to the any-alpha box — never no box. */
function scanInkBody(d: Uint8ClampedArray, w: number, h: number): [number, number, number, number] | null {
  let sx0 = w, sy0 = h, sx1 = -1, sy1 = -1; // solid ink body
  let ax0 = w, ay0 = h, ax1 = -1, ay1 = -1; // any alpha — the fallback
  for (let py = 0; py < h; py += 2) for (let px = 0; px < w; px += 2) {
    const a = d[(py * w + px) * 4 + 3];
    if (a > 8) {
      if (px < ax0) ax0 = px; if (px > ax1) ax1 = px;
      if (py < ay0) ay0 = py; if (py > ay1) ay1 = py;
      if (a >= 232) {
        if (px < sx0) sx0 = px; if (px > sx1) sx1 = px;
        if (py < sy0) sy0 = py; if (py > sy1) sy1 = py;
      }
    }
  }
  if (sx1 > sx0 && sy1 >= sy0) return [sx0, sy0, sx1 - sx0, sy1 - sy0];
  if (ax1 > ax0 && ay1 >= ay0) return [ax0, ay0, ax1 - ax0, ay1 - ay0];
  return null;
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
  /* Round 45 · B3 — the UNWARPED stamp's selection box hugs the LETTERING.
     The specimen's own data-shell is the invisible button shell it was
     built on: a fixed 130px-tall canvas with auto-width slack, so the box
     ran far past the glyphs on every side (owner screenshot: "the bounding
     boxes for everything is huge" — text especially, and the oversized
     grab zone stole clicks meant for neighbours). The WARPED path already
     scans its raster's true alpha bounds ("boxes must adhere to the actual
     type stamp area", owner) — this is the same scan for the plain path,
     restamped onto the DOM copy's data-shell only: exports keep reading
     stampSvg() untouched. Debounced like the warp raster; re-runs when
     faces land (svg re-memos on fontTick). */
  const [tightShell, setTightShell] = useState<string | null>(null);
  useEffect(() => {
    if (warped) { setTightShell(null); return; } // the warp raster stamps its own
    let on = true;
    const t = window.setTimeout(() => {
      /* faces are best-effort here: a hung font CDN must not park the scan
         forever — after the race the fallback letterforms still bound the
         ink far tighter than the specimen shell, and the fontTick re-memo
         re-scans with the real face once it lands */
      void Promise.race([
        svgWithFaces(svg, cfg),
        new Promise<string>((r) => window.setTimeout(() => r(svg), 1500)),
      ]).then((svgF) => {
        if (!on) return;
        const img = new Image();
        img.onload = () => {
          if (!on) return;
          const k = Math.min(1, 1600 / Math.max(1, img.width));
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * k));
          cv.height = Math.max(1, Math.round(img.height * k));
          const ctx = cv.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          try {
            // body-box rule: the shell pins to SOLID ink — glow halos render
            // full-size but never widen the selection/grab box (scanInkBody)
            const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
            const bb = scanInkBody(d, cv.width, cv.height);
            if (bb && on) setTightShell([bb[0] / k, bb[1] / k, bb[2] / k, bb[3] / k].map((n) => n.toFixed(1)).join(" "));
          } catch { /* tainted or empty — the specimen shell stands */ }
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgF)));
      });
    }, 160); // one scan per settled render, not per tick
    return () => { on = false; window.clearTimeout(t); };
  }, [svg, warped]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownSvg = useMemo(() => {
    if (warped || !tightShell) return svg;
    return /data-shell="[^"]*"/.test(svg)
      ? svg.replace(/data-shell="[^"]*"/, `data-shell="${tightShell}"`)
      : svg.replace(/<svg /, `<svg data-shell="${tightShell}" `);
  }, [svg, tightShell, warped]);
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
         or the warped preview speaks a system font (owner report). Sealing
         is best-effort though (round 45): a hung font CDN must not park
         the warp raster forever — after the race the fallback letterforms
         still bend and bound correctly, and the fontTick re-memo re-runs
         the trip with the real face once it lands */
      void Promise.race([
        svgWithFaces(svg, cfg),
        new Promise<string>((r) => window.setTimeout(() => r(svg), 1500)),
      ]).then((svgF) => {
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
            // same body-box rule as the unwarped scan: solid ink bounds the
            // box, the bent glow haze stays drawn but un-grabbable
            const d = wc.getContext("2d")!.getImageData(0, 0, wc.width, wc.height).data;
            const bb = scanInkBody(d, wc.width, wc.height);
            if (bb) shell = [bb[0] / k, bb[1] / k, bb[2] / k, bb[3] / k];
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
    : <span style={{ filter: stampFilter(cfg, stamp), display: "block" }} dangerouslySetInnerHTML={{ __html: shownSvg }} />;
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
  /** pointerup carries the deferred click semantics (collapse/toggle);
   *  pointercancel must NOT — a cancelled gesture is not a click */
  onDragEnd: (e?: React.PointerEvent) => void;
  /** word-bearing pieces only (stamps, label-editable kit copies):
   *  double-click opens the in-place words editor. Selection, drag and
   *  the marquee are untouched — dblclick is two stationary clicks. */
  onTextEdit?: () => void;
}) {
  const { cfg, library, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitNoText, kitVals, kitRow, kitBar, kitTextOy, kitTextOx, kitSlotVals, kitSubs, userAssets, kitAssets, kitPics } = useGen();
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
             footprint, its dials as the same shared filter recipe. The
             maker's drawer answers first; a SHIPPED kit's own bundled
             art (kitAssets) answers for the boards a public kit page
             draws, where there is no maker and no vault. */
          const ua = userAssets.find((a) => a.id === b.logo!.aid) ?? kitAssets.find((a) => a.id === b.logo!.aid);
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
            kit={{ id: baseOf(b.kitId), size: kitSizes[b.kitId] ?? "l", shape: kitShapes[b.kitId], icon: resolveKitIcon(kitIcons[b.kitId], undefined), pic: kitPicOf({ kitPics, userAssets, kitAssets }, b.kitId), logo: kitPicOf({ kitPics, userAssets, kitAssets }, b.kitId, "logo"), label: kitNoText[b.kitId] ? "" : (b.label ?? kitLabels[b.kitId]), value: b.v ?? kitVals[b.kitId], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov,
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
                      const s2 = Math.max(boardScaleMin(b, boardItemArtShort(useGen.getState(), b)), Math.min(2, r.s0 * (r.hx === 0.5 ? ry : (rx + ry) / 2)));
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
