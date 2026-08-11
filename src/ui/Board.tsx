import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ArrowDown, ArrowUp, BookmarkPlus, BringToFront, Copy, Download, Grid3x3, ImagePlus, LayoutTemplate, Lock, Monitor, Plus, Search, SendToBack, Shield, Smartphone, SquarePen, Trash2, Type, X } from "lucide-react";
import { useGen, rehydrateBoardBgs, boardBgFilter, drawBoardNoise, stampFilter, stampSvg, warpStampRaster } from "@/generator/store";
import { putBgOriginal, normalizeShipCopy } from "@/generator/bgvault";
import { BACKDROP_LIBRARY, BACKDROP_CATEGORIES, backdropThumb, backdropUrl } from "@/generator/backdropLibrary";
import type { BoardDef, BoardItem } from "@/generator/store";
import { renderBevel, renderKit, glowPadOf, VALUE_DRIVEN } from "@/generator/bevel";
import { KIT_COMPONENTS, applyKitDesign, applyKitTextFill, fontByName, kitVisible, resolveKitIcon, KIT_LABEL_EDITABLE, labelMaxOf } from "@/generator/model";
import type { GenConfig, KitComponentId } from "@/generator/model";
import { download, downloadSvg, fontDataUri } from "@/generator/exportUtils";
import { LiveArt, stillSmil, stripSmil } from "./LiveArt";

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
  { name: "Containers & overlays", ids: ["panel", "header", "tab", "dropdown", "dialog", "toast", "tooltip", "listmenu", "choicelist", "scrollbar", "input", "searchfield", "setrow"] },
  { name: "HUD & readouts", ids: ["resource", "chip", "badge", "datarow", "slot", "orb", "ring", "bignum", "xpbar", "vitalbar", "currency", "healthglobe", "manarails", "buffframe", "cooldown", "notifydot", "avatarframe", "nameplate", "loadbar", "spinner", "pagedots", "steps", "stepper"] },
  { name: "Timers", ids: ["flipclock", "stopwatch", "timerdigits"] },
  { name: "Controls", ids: ["toggle", "slider", "progress", "segbar", "emblembar", "vsbar", "hotbar", "segment", "checkbox", "radio", "joystick", "gearicon", "trophyicon", "gifticon"] },
  { name: "Shooter", ids: ["reticle", "crosshair", "hitmarker", "ammo", "magazine", "lives", "minimap", "compass", "killfeed", "weaponwheel", "equipselector", "firebutton", "joystick~ghost", "streakmeter", "waypoint", "capturemeter", "respawn", "dmgarc", "dmgnumber"] },
  { name: "RPG & progression", ids: ["questpanel", "dialoguebox", "partyframe", "unitplate", "invgrid", "rarityframe", "equipslot", "quickslots", "skillnode", "levelnode", "pathconnector", "loottag", "seasontrack", "achievetoast"] },
  { name: "Casual & mobile", ids: ["heartmeter", "energymeter", "movecounter", "orderticket", "booster", "combo", "dailycell", "spinwheel", "popmeter", "starrating"] },
  { name: "Rewards & chests", ids: ["chest", "giftbox", "rewardcard", "qtybadge", "rewardtray", "claimbtn", "chestpanel"] },
  { name: "Racing", ids: ["speedo", "speedo2", "tacho", "circuit", "leaderboard", "laptimes", "telemetry", "startlights"] },
  { name: "Strategy & score", ids: ["buildqueue", "techcard", "scorebug", "trophy"] },
  { name: "Social", ids: ["friendrow", "chatbubble", "clancrest", "emotewheel"] },
  { name: "Card battler", ids: ["cardback", "pack"] },
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
  firebutton: "fire shoot trigger pad thumb button attack weapon armed",
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
type Tpl = { bg?: string; items: { kitId: KitComponentId; x: number; y: number; scale?: number }[] };
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
  "Match-3 round": { items: [
    { kitId: "movecounter", x: 70, y: 55, scale: 0.85 },
    { kitId: "stopwatch", x: 1500, y: 55, scale: 0.7 },
    { kitId: "combo", x: 1520, y: 320, scale: 0.85 },
    ...([0, 1, 2] as const).flatMap((r) => ([0, 1, 2] as const).map((c) => (
      { kitId: "slot" as KitComponentId, x: 730 + c * 160, y: 290 + r * 160, scale: 0.9 }
    ))),
    { kitId: "booster", x: 70, y: 640, scale: 0.85 },
    { kitId: "segbar", x: 660, y: 890 },
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
const STRETCHABLE = new Set<string>(["slider", "progress", "emblembar", "segbar", "vsbar"]);

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

export function BoardView({ playing }: { playing: boolean }) {
  const {
    cfg, boards, activeBoard, library, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitVals, kitRow, kitBar,
    setActiveBoard, addBoard, removeBoard, duplicateBoard, renameBoard, moveBoard, clearBoard, setBoardBg,
    addBoardItems, setBoardAspect, boardSnap, setBoardSnap, boardSafe, setBoardSafe, boardSel, setBoardSel, zoom,
    addToBoard, addKitToBoard, moveBoardItem, scaleBoardItem, rotateBoardItem, removeBoardItem,
    duplicateBoardItem, componentReleases, isAdmin,
    applyBoardItemPatches, removeBoardItems, transformBoardItems,
  } = useGen();
  const [q, setQ] = useState("");
  // rolling over a tray thumbnail previews the asset large in a viewport
  const [preview, setPreview] = useState<{ name: string; svg: string } | null>(null);
  // paste-a-URL video backdrop
  const [vidUrl, setVidUrl] = useState("");
  const [vidBusy, setVidBusy] = useState(false);
  const [vidErr, setVidErr] = useState<string | null>(null);
  const applyVideoUrl = async () => {
    setVidErr(null); setVidBusy(true);
    const r = await checkVideoUrl(vidUrl);
    setVidBusy(false);
    if (r.err) { setVidErr(r.err); return; }
    setBoardBg({ bgVideo: r.url!, bgImage: null, bgShow: true });
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
  const dragRef = useRef<{ list: { id: string; ox: number; oy: number }[]; dx: number; dy: number; fit: number } | null>(null);
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
  const fitOf = (bd: BoardDef) => {
    const [W, H] = STAGE[bd.aspect];
    // the shared canvas zoom drives the boards too (owner: "zoom doesn't
    // work on the boards toolbar") — every gesture divides by fit, so the
    // whole manipulation stack rides along for free
    return Math.min((frameW - 56) / W, 820 / H, 1) * zoom;
  };

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
        return { id: entry, kitId: kid, ov, name: nm, hay: `${nm} ${entry} ${g.name} ${SEARCH_TERMS[kid] ?? ""}${ov ? ` ${ov} overlay` : ""}`.toLowerCase(), svg: renderKit(applyKitTextFill(tc, kitTextFill[kid]), kid, "s", "default", undefined, kitShapes[kid], { icon: resolveKitIcon(kitIcons[kid], undefined), label: kitLabels[kid], overlay: ov }) };
      }),
    }));
  }, [cfg, kitShapes, kitTextFill, kitIcons, kitLabels, componentReleases, isAdmin]);

  const selBoard = boards.find((bd) => bd.items.some((b) => b.id === boardSel)) ?? null;
  const sel = selBoard?.items.find((b) => b.id === boardSel) ?? null;

  /* the exact svg a board item shows — shared by display, export and PNG.
     Per-component design forks (kitDesigns) apply here exactly like the
     editor and Kit page — without them the board showed the MASTER design,
     including its state recipes (owner: buttons "showing the hover glowy
     state" that their component fork had tamed). */
  const svgOf = (b: BoardItem): { svg: string; cfg: GenConfig } => {
    if (b.kitId) {
      const kb = b.kitId === "progress" || b.kitId === "segbar" ? kitBar[b.kitId] : undefined;
      const pc = applyKitTextFill(applyKitDesign(cfg, kitDesigns[b.kitId]), kitTextFill[b.kitId]);
      return { svg: renderKit(pc, b.kitId, kitSizes[b.kitId] ?? "l", "default", b.v ?? kitVals[b.kitId], kitShapes[b.kitId], { icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: b.label ?? kitLabels[b.kitId], stretch: b.stretch, overlay: b.ov, dock: kb?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kb.dockSide ?? "left" } : undefined, bar: kb, row: b.kitId === "datarow" ? kitRow : undefined, themedText: !!kitDesigns[b.kitId]?.type || !!kitTextFill[b.kitId] }), cfg: pc };
    }
    if (b.stamp) return { svg: stampSvg(cfg, b.stamp), cfg };
    const item = library.find((l) => l.id === b.libId);
    if (!item) return { svg: "", cfg };
    return { svg: item.kit ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", item.kit.v, item.kit.shape, item.kit.label ? { label: item.kit.label } : undefined) : renderBevel(item.cfg, "default"), cfg: item.cfg };
  };

  const nameOf = (b: BoardItem): string => {
    if (b.stamp) return `"${b.stamp.text}"`;
    if (b.kitId) return KIT_COMPONENTS.find((c) => c.id === b.kitId)?.name ?? b.kitId;
    return library.find((l) => l.id === b.libId)?.name ?? "Piece";
  };

  /* composite one artboard to a PNG at native resolution */
  const exportPng = async (bd: BoardDef) => {
    const [W, H] = STAGE[bd.aspect];
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0D0F16";
    ctx.fillRect(0, 0, W, H);
    if (bd.bgVideo && (bd.bgShow ?? true)) {
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
    if (bd.bgImage && (bd.bgShow ?? true)) {
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          const s = Math.max(W / img.width, H / img.height); // cover, cropped to the board
          ctx.save();
          ctx.globalAlpha = (bd.bgOpacity ?? 100) / 100;
          const bf = boardBgFilter(bd); if (bf) ctx.filter = bf;
          ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
          ctx.restore(); res();
        };
        img.onerror = () => res();
        /* library scenes (and any remote image): anonymous CORS or nothing —
           a tainted frame would kill the whole canvas export */
        if (/^https:\/\//.test(bd.bgImage!)) img.crossOrigin = "anonymous";
        img.src = bd.bgImage!;
      });
    }
    // background film grain — independent of the overlay (owner: "noise")
    drawBoardNoise(ctx, W, H, bd.bgNoise ?? 0);
    // the overlay layer composites exactly like the live stage: tint (with
    // its blend mode) first, then film grain riding an overlay blend
    const ovMode = bd.ovMode ?? "none";
    if (ovMode !== "none") {
      const GCO: Record<string, GlobalCompositeOperation> = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", "soft-light": "soft-light" };
      ctx.save();
      ctx.globalCompositeOperation = GCO[bd.ovBlend ?? "normal"] ?? "source-over";
      ctx.globalAlpha = (bd.ovStrength ?? 45) / 100;
      if (ovMode === "vignette") {
        const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.3, W / 2, H * 0.42, Math.hypot(W, H) * 0.58);
        g.addColorStop(0, "rgba(4,7,14,0)");
        g.addColorStop(1, "rgba(4,7,14,0.92)");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = ovMode === "dark" ? "#060A14" : "#F4F6FF";
      }
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      drawBoardNoise(ctx, W, H, bd.ovNoise ?? 0);
    }
    // center scrim — same ellipse as the live CSS (62% × 62% at 50% 46%)
    if ((bd.ovCenter ?? 0) > 0) {
      ctx.save();
      ctx.globalAlpha = (bd.ovCenter ?? 0) / 100;
      ctx.translate(W / 2, H * 0.46);
      ctx.scale(W * 0.62, H * 0.62);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "rgba(4,7,14,0.85)");
      g.addColorStop(0.45, "rgba(4,7,14,0.5)");
      g.addColorStop(1, "rgba(4,7,14,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    for (const b of bd.items) {
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
    cv.toBlob((bl) => { if (bl) download(`${slug}-${W}x${H}.png`, bl); }, "image/png");
  };

  const snapV = (v: number) => (boardSnap ? Math.round(v / 16) * 16 : Math.round(v));

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
      st.addBoardItems([{ kitId: g.kitId, ov: g.ov, x: sv(Math.max(0, (e.clientX - r.left) / f - 110)), y: sv(Math.max(0, (e.clientY - r.top) / f - 55)) }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  const scrollToBoard = (id: string) => {
    frameRef.current?.querySelector(`[data-board="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="board2" style={{ "--trayl": `${trayW.l}px`, "--trayr": `${trayW.r}px` } as React.CSSProperties}>
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
          {library.length > 0 && (
            <div>
              <div className="bd-cat">Saved components</div>
              <div className="bd-grid">
                {library.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())).map((l) => {
                  const art = l.kit ? renderKit(l.cfg, l.kit.id, l.kit.size, "default", l.kit.v, l.kit.shape, l.kit.label ? { label: l.kit.label } : undefined) : renderBevel(l.cfg, "default");
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
                const t = BOARD_TEMPLATES[e.target.value];
                if (!t) return;
                addBoardItems(t.items);
                if (t.bg) setBoardBg({ bgImage: t.bg, bgVideo: null, bgShow: true });
              }}>
              <option value="">Starter screen…</option>
              {Object.keys(BOARD_TEMPLATES).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="bd-snap"><Grid3x3 size={13} strokeWidth={2} /> Snap to grid
            <input type="checkbox" checked={boardSnap} onChange={(e) => setBoardSnap(e.target.checked)} />
          </label>
          <label className="bd-snap" title="Safe-area guides — keep HUD inside the dashed frames. 16:9 shows action/title safe; Mobile shows notch and home-bar insets. Guides never export.">
            <Shield size={13} strokeWidth={2} /> Safe area
            <input type="checkbox" checked={boardSafe} onChange={(e) => setBoardSafe(e.target.checked)} />
          </label>
          <button className="bd-export" onClick={() => { if (act) exportPng(act); }}><Download size={14} strokeWidth={2.2} /> Export PNG</button>
          <button className="bd-export bd-exportall"
            title="Every board as a full-resolution PNG, one after another — the browser may ask once to allow multiple downloads"
            onClick={async () => {
              for (const bd of boards) if (bd.items.length || bd.bgImage || bd.bgVideo) await exportPng(bd);
            }}>
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
            if (!t.closest(".board-item, .bd-ptoolwrap, .bd-rszwrap, .bd-abhead")) setBoardSel(null);
          }}>
          {boards.map((bd) => {
            const [W, H, aspName] = STAGE[bd.aspect];
            const fit = fitOf(bd);
            return (
              <section key={bd.id} className={`bd-artboard${bd.id === activeBoard ? " on" : ""}`} data-board={bd.id}>
                <header className="bd-abhead">
                  <input className="bd-abname" value={bd.name} aria-label="Board name" maxLength={40}
                    onFocus={() => setActiveBoard(bd.id)}
                    onChange={(e) => renameBoard(bd.id, e.target.value)} />
                  <span className="bd-abmeta">{aspName} · {W} × {H}</span>
                  <button className="bd-abtool" title={`Export ${bd.name} as a PNG at full ${W} × ${H} resolution — background, overlay and pieces`}
                    onClick={() => void exportPng(bd)}>
                    <Download size={12} strokeWidth={2.2} /> PNG
                  </button>
                  <button className="bd-abtool" title={`Duplicate ${bd.name} — pieces, backdrop and darkroom dials, a running start for the next screen`}
                    onClick={() => duplicateBoard(bd.id)}>
                    <Copy size={12} strokeWidth={2.2} /> Duplicate
                  </button>
                  <button className="bd-abtool" title="Clear every piece from this board"
                    onClick={() => { if (bd.items.length === 0 || window.confirm(`Clear all ${bd.items.length} pieces from ${bd.name}?`)) clearBoard(bd.id); }}>
                    Clear
                  </button>
                  <button className="bd-abtool danger" title="Delete this board"
                    onClick={() => { if (bd.items.length === 0 || window.confirm(`Delete ${bd.name} and its ${bd.items.length} pieces?`)) removeBoard(bd.id); }}>
                    <Trash2 size={12} strokeWidth={2.2} />
                  </button>
                </header>
                <div className="bd-stage" style={{ width: W * fit, height: H * fit }}
                  onPointerDown={(e) => { setActiveBoard(bd.id); if (e.target === e.currentTarget) setBoardSel(null); }}>
                  {bd.bgImage && (bd.bgShow ?? true) && (
                    <div className="bd-bg" style={{ backgroundImage: `url(${bd.bgImage})`, opacity: (bd.bgOpacity ?? 100) / 100, filter: boardBgFilter(bd) }} />
                  )}
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
                        onExport={() => { const p = svgOf(b); void svgWithFaces(p.svg, p.cfg).then((s) => downloadSvg(s, `board-${nameOf(b).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)); }}
                        onSelect={(e) => pickPiece(bd.id, b.id, !!e?.shiftKey)}
                        onDragStart={(e) => {
                          // dragging any selected piece carries the whole selection
                          const group = selIdsAll.includes(b.id) && selIdsAll.length > 1
                            ? bd.items.filter((it) => selIdsAll.includes(it.id))
                            : [b];
                          dragRef.current = { list: group.map((it) => ({ id: it.id, ox: it.x, oy: it.y })), dx: e.clientX, dy: e.clientY, fit };
                        }}
                        onDragMove={(e) => {
                          const d = dragRef.current;
                          if (!d || !d.list.some((g) => g.id === b.id)) return;
                          // same dead-man rule as the resize handles: no button, no gesture
                          if (!(e.buttons & 1)) { dragRef.current = null; return; }
                          const mdx = (e.clientX - d.dx) / d.fit, mdy = (e.clientY - d.dy) / d.fit;
                          applyBoardItemPatches(`grpmove:${d.list.map((g) => g.id).join(",")}`,
                            d.list.map((g) => ({ id: g.id, x: snapV(g.ox + mdx), y: snapV(g.oy + mdy) })));
                        }}
                        onDragEnd={() => { dragRef.current = null; }} />
                    ))}
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
                                  .map((it) => ({ id: it.id, s0: it.scale ?? 1, px: it.x, py: it.y }));
                                if (pieces.length < 2) return;
                                grsz.current = {
                                  x0: e.clientX, y0: e.clientY,
                                  ax: grpBox.l + (1 - hx) * grpBox.w, ay: grpBox.t + (1 - hy) * grpBox.h,
                                  hpx: grpBox.l + hx * grpBox.w, hpy: grpBox.t + hy * grpBox.h,
                                  // clamp the GROUP factor so no piece leaves its own
                                  // 0.3..2 range mid-gesture — relative spacing never warps
                                  fMin: Math.max(...pieces.map((p) => 0.3 / p.s0)),
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
                    {bd.items.length === 0 && <div className="bd-empty"><span>An empty stage — pick a <b>Starter screen</b> above, or click an asset on the left.</span></div>}
                  </div>
                </div>
              </section>
            );
          })}
          <button className="bd-addboard-inline" onClick={addBoard}><Plus size={14} strokeWidth={2.2} /> Add board</button>
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
            <div className="bd-row2">
              <label>X <input type="number" value={Math.round(sel.x)} onChange={(e) => moveBoardItem(sel.id, +e.target.value, sel.y)} /></label>
              <label>Y <input type="number" value={Math.round(sel.y)} onChange={(e) => moveBoardItem(sel.id, sel.x, +e.target.value)} /></label>
            </div>
            <label className="bd-slider">Scale · {Math.round((sel.scale ?? 1) * 100)}%
              <input type="range" min={30} max={200} value={Math.round((sel.scale ?? 1) * 100)}
                onChange={(e) => scaleBoardItem(sel.id, +e.target.value / 100)} />
            </label>
            <label className="bd-slider">Rotation · {sel.rot ?? 0}°
              <input type="range" min={-45} max={45} value={sel.rot ?? 0}
                onChange={(e) => rotateBoardItem(sel.id, +e.target.value)} />
            </label>
            {/* instance dials live HERE too — the floating toolbar overlaps
                neighbours in tight stacks (owner: "placement of controls is
                problematic"); the rail is always readable */}
            {sel.kitId && STRETCHABLE.has(sel.kitId) && (
              <label className="bd-slider" title="9-slice width — the track re-renders wider; caps and knob stay true. The side handles on the piece do the same by hand.">
                Width · {Math.round((sel.stretch ?? 1) * 100)}%
                <input type="range" min={70} max={300} value={Math.round((sel.stretch ?? 1) * 100)}
                  onChange={(e) => useGen.getState().stretchBoardItem(sel.id, +e.target.value / 100, sel.x)}
                  onDoubleClick={() => useGen.getState().stretchBoardItem(sel.id, 1, sel.x)} />
              </label>
            )}
            <label className="bd-slider" title="This piece's opacity — ghosted HUD layers, faded scenery. Double-click restores full strength. Exports honor it.">
              Opacity · {sel.opacity ?? 100}%
              <input type="range" min={0} max={100} value={sel.opacity ?? 100}
                onChange={(e) => useGen.getState().setBoardItemOpacity(sel.id, +e.target.value)}
                onDoubleClick={() => useGen.getState().setBoardItemOpacity(sel.id, null)} />
            </label>
            {sel.kitId && VALUE_DRIVEN.has(sel.kitId) && (
              <label className="bd-slider" title="Value — this piece only (fill level, rarity tier, pose). Double-click to follow the kit again.">
                Value — this piece · {Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}%
                <input type="range" min={0} max={100} value={Math.round((sel.v ?? kitVals[sel.kitId] ?? 0.62) * 100)}
                  onChange={(e) => useGen.getState().setBoardItemVal(sel.id, +e.target.value / 100)}
                  onDoubleClick={() => useGen.getState().setBoardItemVal(sel.id, null)} />
              </label>
            )}
            {sel.kitId && KIT_LABEL_EDITABLE.has(sel.kitId) && (
              <input className="bd-abname" maxLength={labelMaxOf(sel.kitId)} aria-label="Instance text"
                title="Text — this copy only. Clear the field to follow the kit again."
                placeholder={kitLabels[sel.kitId] || "Text — this copy"}
                value={sel.label ?? ""}
                onChange={(e) => useGen.getState().setBoardItemLabel(sel.id, e.target.value)} />
            )}
            {sel.stamp && (() => {
              /* the stamp's own dials — instance-only, the kit's typography
                 never moves (owner: "basic controls… hue / saturation,
                 brightness/contrast", "drop shadow", "glow") */
              const st = sel.stamp;
              const patch = (p: Partial<typeof st>) => useGen.getState().setBoardItemStamp(sel.id, p);
              return (<>
                <div className="bd-h" style={{ marginTop: 14 }}>Type stamp</div>
                <input className="bd-abname" value={st.text} maxLength={40} aria-label="Stamp text"
                  onChange={(e) => patch({ text: e.target.value })} />
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
              <button onClick={() => { const p = svgOf(sel); void svgWithFaces(p.svg, p.cfg).then((s) => downloadSvg(s, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)); }}>
                <Download size={13} strokeWidth={2.2} /> Export asset
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
                  onClick={() => setBoardBg(bk.video ? { bgVideo: bk.url, bgImage: null, bgShow: true } : { bgImage: bk.url, bgVideo: null, bgShow: true })}>
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
            <input ref={bgInput} type="file" accept="image/*,video/mp4,video/webm" hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.type.startsWith("video/")) setBoardBg({ bgVideo: URL.createObjectURL(f), bgImage: null, bgShow: true });
                  /* ONE copy, in the vault: the ship copy (≤1920) is also
                     the display image, served as a session object URL — the
                     board DOC carries only the tiny bgAssetId, so history,
                     saves and cloud sync never drag pixels (field crash) */
                  else void normalizeShipCopy(f).then(async (ship) => {
                    const assetId = await putBgOriginal(ship, f.name);
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
    </div>
  );
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
function StampArt({ cfg, stamp }: { cfg: GenConfig; stamp: NonNullable<BoardItem["stamp"]> }) {
  /* a 400% specimen is a real engine render — memo it, or every board
     interaction re-renders every stamp (the tray-click sluggishness) */
  const svg = useMemo(() => stampSvg(cfg, stamp), [cfg, stamp.text, stamp.size]); // eslint-disable-line react-hooks/exhaustive-deps
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

function StagePiece({ b, playing, selected, solo, fit, onSelect, onDragStart, onDragMove, onDragEnd, onExport }: {
  b: BoardItem; playing: boolean; selected: boolean;
  /** the ONE selected piece — toolbar and transform handles only render solo,
   *  so a multi-selection stays a clean field of boxes */
  solo: boolean; fit: number;
  onSelect: (e?: React.PointerEvent) => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onExport: () => void;
}) {
  const { cfg, library, kitShapes, kitSizes, kitTextFill, kitDesigns, kitIcons, kitLabels, kitVals, kitRow, kitBar } = useGen();
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
  const forkCfg = useMemo(
    () => (b.kitId ? applyKitTextFill(applyKitDesign(cfg, kd), ktf) : cfg),
    [cfg, b.kitId, kd, ktf],
  );
  const artRef = useRef<HTMLDivElement>(null);
  // corner-handle resize: screen-px delta → scale, against the piece's
  // unscaled on-screen width captured at grab time
  const rsz = useRef<{ x0: number; y0: number; s0: number; hx: number; anchorX: number; anchorY: number; handX: number; handY: number; shx: number; shy: number; shw: number; shh: number; axf: number; ayf: number } | null>(null);
  // 9-slice side-handle gesture (bar family): stretch factor + planted edge
  const str = useRef<{ x0: number; st0: number; shw0: number; bx0: number; hx: number } | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number; shell: [number, number, number, number] | null } | null>(null);
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
       one measurement per frame, never a wedged tab. */
    let pend = 0;
    const mo = new MutationObserver(() => {
      if (!pend) pend = requestAnimationFrame(() => { pend = 0; read(); });
    });
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "data-shell"] });
    // text geometry settles once webfonts arrive — re-measure then
    if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(() => read());
    return () => { cancelAnimationFrame(pend); mo.disconnect(); };
  }, []);
  const item = b.kitId || b.stamp ? null : library.find((l) => l.id === b.libId);
  if (!b.kitId && !b.stamp && !item) return null;
  return (
    <div className={`board-item${playing ? " playing" : ""}${selected ? " sel" : ""}`} data-bid={b.id}
      style={{ left: b.x, top: b.y, transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
        width: dim ? dim.w * sc : undefined, height: dim ? dim.h * sc : undefined }}
      {...(!playing ? {
        onPointerDown: (e: React.PointerEvent) => {
          onSelect(e);
          // a pen lifted mid-gesture can make capture throw — never fatal
          try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* gesture still works uncaptured */ }
          onDragStart(e);
        },
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
      } : { onPointerDown: onSelect })}>
      <div ref={artRef} style={{ transform: `scale(${sc})`, transformOrigin: "top left", opacity: b.opacity !== undefined ? b.opacity / 100 : undefined }}>
        {b.stamp ? (
          <StampArt cfg={cfg} stamp={b.stamp} />
        ) : b.kitId ? (
          /* per-component design forks apply on the stage exactly like the
             editor and Kit page — the master design (and its state recipes)
             must never leak past a fork here. forkCfg is memoized above:
             a stable object identity is what keeps LiveArt's svg memo (and
             the measurement observer behind it) quiet between real edits. */
          <LiveArt cfg={forkCfg} playing={playing} anchorContent
            kit={{ id: b.kitId, size: kitSizes[b.kitId] ?? "l", shape: kitShapes[b.kitId], icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: b.label ?? kitLabels[b.kitId], value: b.v ?? kitVals[b.kitId], stretch: b.stretch, overlay: b.ov,
              dock: (b.kitId === "progress" || b.kitId === "segbar") && kitBar[b.kitId]?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kitBar[b.kitId]?.dockSide ?? "left" } : undefined,
              bar: b.kitId === "progress" || b.kitId === "segbar" ? kitBar[b.kitId] : undefined,
              row: b.kitId === "datarow" ? kitRow : undefined,
              themedText: !!kitDesigns[b.kitId]?.type || !!kitTextFill[b.kitId] }} />
        ) : (
          <LiveArt cfg={item!.cfg} playing={playing} anchorContent
            kit={item!.kit ? { id: item!.kit.id, size: item!.kit.size, shape: item!.kit.shape, label: item!.kit.label, value: item!.kit.v } : undefined} />
        )}
      </div>
      {selected && (
        <i className="board-selbox" aria-hidden="true" style={dim?.shell
          ? { left: dim.shell[0] * sc, top: dim.shell[1] * sc, width: dim.shell[2] * sc, height: dim.shell[3] * sc }
          : { left: 0, top: 0, width: "100%", height: "100%" }} />
      )}
      {solo && !playing && dim && (() => {
        const sh = dim.shell ?? [0, 0, dim.w, dim.h];
        const stop = (e: React.PointerEvent) => e.stopPropagation();
        return (
          <>
            {/* the piece's own toolbar — counter-scaled so chips stay
                readable inside the fit-scaled stage */}
            <div className="bd-ptoolwrap" style={{ left: sh[0] * sc, top: sh[1] * sc }}>
              <div className="bd-ptool" style={{ transform: `scale(${1 / fit})` }} onPointerDown={stop}>
                {b.kitId && (
                  <button title="Open this component in the editor"
                    onClick={() => { useGen.getState().setFocus(b.kitId!); useGen.getState().setPhase("master"); }}>
                    <SquarePen size={12} strokeWidth={2.2} />
                  </button>
                )}
                <button title="Duplicate (⌘D)" onClick={() => useGen.getState().duplicateBoardItem(b.id)}>
                  <Copy size={12} strokeWidth={2.2} />
                </button>
                {b.kitId && (
                  /* the owner's FORWARD-button worry: a piece reworked on the
                     Board (words, value, the component's current look) freezes
                     into a named asset — the master keeps its own life */
                  <button title="Save to my assets — this piece, with this look and label, becomes a reusable asset. The master component stays untouched."
                    onClick={() => {
                      const def = b.label ?? KIT_COMPONENTS.find((c) => c.id === b.kitId)?.name ?? "My asset";
                      const name = window.prompt("Save this piece to your assets as:", def);
                      if (name?.trim()) useGen.getState().saveBoardItemAsAsset(b.id, name.trim());
                    }}>
                    <BookmarkPlus size={12} strokeWidth={2.2} />
                  </button>
                )}
                {b.kitId && VALUE_DRIVEN.has(b.kitId) && (
                  /* THIS instance's pose — rarity tier, fill level, needle
                     angle — without touching the kit-wide staged value, so a
                     board can show every tier at once. Double-click clears. */
                  <input type="range" min={0} max={100} className="bd-pval"
                    title="Value — this piece only (rarity tier, fill, pose). Double-click to follow the kit again."
                    aria-label="Instance value"
                    value={Math.round((b.v ?? kitVals[b.kitId] ?? 0.62) * 100)}
                    onChange={(e) => useGen.getState().setBoardItemVal(b.id, +e.target.value / 100)}
                    onDoubleClick={() => useGen.getState().setBoardItemVal(b.id, null)} />
                )}
                {b.stamp && (<>
                  <input type="text" className="bd-ptext" maxLength={40}
                    title="The stamp's words" aria-label="Stamp text"
                    value={b.stamp.text}
                    onChange={(e) => useGen.getState().setBoardItemStamp(b.id, { text: e.target.value })} />
                  <input type="range" min={25} max={400} className="bd-pval"
                    title="Type size — 100% is the kit's own size"
                    aria-label="Stamp size"
                    value={b.stamp.size}
                    onChange={(e) => useGen.getState().setBoardItemStamp(b.id, { size: +e.target.value })} />
                </>)}
                {b.kitId && KIT_LABEL_EDITABLE.has(b.kitId) && (
                  /* THIS instance's words — two START buttons on one screen
                     can say START and OPTIONS. The kit's design keeps
                     flowing through; only the text is pinned. Empty =
                     follow the kit again. */
                  <input type="text" className="bd-ptext" maxLength={labelMaxOf(b.kitId)}
                    title="Text — this copy only. Clear the field to follow the kit again."
                    aria-label="Instance text"
                    placeholder={kitLabels[b.kitId] || "Text — this copy"}
                    value={b.label ?? ""}
                    onChange={(e) => useGen.getState().setBoardItemLabel(b.id, e.target.value)} />
                )}
                <button title="Export this piece as SVG" onClick={onExport}>
                  <Download size={12} strokeWidth={2.2} />
                </button>
                <button className="danger" title="Remove (Delete)" onClick={() => useGen.getState().removeBoardItem(b.id)}>
                  <X size={12} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            {/* the transform box: scale from ANY corner, plus top-center and
                bottom-center handlebars (owner: à la Adobe). Every drag
                anchors the OPPOSITE corner/edge — the far side stays planted
                while the piece grows toward the pointer. One coalesced
                history step per gesture (transformBoardItem). */}
            {([[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1]] as const).map(([hx, hy]) => {
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
                      const s2 = Math.max(0.3, Math.min(2, r.s0 * (r.hx === 0.5 ? ry : (rx + ry) / 2)));
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
            {b.kitId && STRETCHABLE.has(b.kitId) && ([0, 1] as const).map((shx2) => (
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
          </>
        );
      })()}
    </div>
  );
}
