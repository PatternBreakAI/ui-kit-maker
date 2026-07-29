import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Grid3x3, ImagePlus, LayoutTemplate, Lock, Monitor, Plus, Search, Smartphone, SquarePen, Trash2, X } from "lucide-react";
import { useGen, fileToBgDataUrl } from "@/generator/store";
import type { BoardDef, BoardItem } from "@/generator/store";
import { renderBevel, renderKit, glowPadOf, VALUE_DRIVEN } from "@/generator/bevel";
import { KIT_COMPONENTS, applyKitTextFill, kitVisible, resolveKitIcon } from "@/generator/model";
import type { GenConfig, KitComponentId } from "@/generator/model";
import { download, downloadSvg } from "@/generator/exportUtils";
import { LiveArt } from "./LiveArt";

/* ── The Board v3 — a vertical stack of named artboards ────────────
   Left: searchable asset drawer (live kit components + saved pieces).
   Center: every artboard in a scrolling column; each has its own name,
   aspect, pieces and background (cropped to the board bounds).
   Right: an InDesign-style pages tray to add / reorder / delete boards,
   then the inspector for the selected piece or the active background.
   Cmd+Z undoes (100 levels), Delete removes, Cmd+D duplicates. */

/* The full 113-piece roster, grouped by genre — every component the kit
   ships is placeable (the drawer had frozen at the pre-pack roster). */
const ASSET_GROUPS: { name: string; ids: KitComponentId[] }[] = [
  { name: "Buttons", ids: ["primary", "secondary", "small", "ghost", "iconbtn", "pricebtn", "endturn", "keycap", "padbtn"] },
  { name: "Containers & overlays", ids: ["panel", "header", "tab", "dropdown", "dialog", "toast", "tooltip", "listmenu", "choicelist", "scrollbar", "input", "searchfield", "setrow"] },
  { name: "HUD & readouts", ids: ["resource", "chip", "badge", "datarow", "slot", "orb", "ring", "bignum", "xpbar", "currency", "healthglobe", "manarails", "buffframe", "cooldown", "notifydot", "avatarframe", "nameplate", "loadbar", "spinner", "pagedots", "steps", "stepper"] },
  { name: "Timers", ids: ["flipclock", "stopwatch", "timerdigits"] },
  { name: "Controls", ids: ["toggle", "slider", "progress", "segbar", "emblembar", "vsbar", "hotbar", "segment", "checkbox", "radio", "joystick"] },
  { name: "Shooter", ids: ["reticle", "crosshair", "hitmarker", "ammo", "magazine", "lives", "minimap", "compass", "killfeed", "weaponwheel", "equipselector", "streakmeter", "waypoint", "capturemeter", "respawn", "dmgarc", "dmgnumber"] },
  { name: "RPG & progression", ids: ["questpanel", "dialoguebox", "partyframe", "unitplate", "invgrid", "rarityframe", "equipslot", "skillnode", "levelnode", "pathconnector", "loottag", "seasontrack", "achievetoast"] },
  { name: "Casual & mobile", ids: ["heartmeter", "energymeter", "movecounter", "orderticket", "booster", "combo", "dailycell", "spinwheel", "popmeter", "starrating"] },
  { name: "Racing", ids: ["speedo", "speedo2", "tacho", "circuit", "leaderboard", "laptimes", "telemetry"] },
  { name: "Strategy & score", ids: ["buildqueue", "techcard", "scorebug"] },
  { name: "Social", ids: ["friendrow", "chatbubble", "clancrest", "emotewheel"] },
  { name: "Card battler", ids: ["cardback", "pack"] },
];

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
const OV_TINT: Record<string, string> = { dark: "#060A14", light: "#F4F6FF" };
const ovBackground = (mode: string): string =>
  mode === "vignette"
    ? "radial-gradient(ellipse at 50% 42%, rgba(4,7,14,0) 34%, rgba(4,7,14,0.92) 100%)"
    : OV_TINT[mode] ?? "transparent";

export function BoardView({ playing }: { playing: boolean }) {
  const {
    cfg, boards, activeBoard, library, kitShapes, kitSizes, kitTextFill, kitIcons, kitLabels, kitVals, kitRow, kitBar,
    setActiveBoard, addBoard, removeBoard, renameBoard, moveBoard, clearBoard, setBoardBg,
    addBoardItems, setBoardAspect, boardSnap, setBoardSnap, boardSel, setBoardSel,
    addToBoard, addKitToBoard, moveBoardItem, scaleBoardItem, rotateBoardItem, removeBoardItem,
    duplicateBoardItem, componentReleases, isAdmin,
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
  const act = boards.find((b) => b.id === activeBoard) ?? boards[0];
  const frameRef = useRef<HTMLDivElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; ox: number; oy: number; fit: number } | null>(null);
  const [frameW, setFrameW] = useState(900);

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
    return Math.min((frameW - 56) / W, 820 / H, 1);
  };

  /* keyboard: Delete removes, Cmd+D duplicates, Cmd+Z / Shift+Cmd+Z undo/redo */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const st = useGen.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redoBoard(); else st.undoBoard();
      } else if (mod && e.key.toLowerCase() === "d" && st.boardSel) {
        e.preventDefault();
        st.duplicateBoardItem(st.boardSel);
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.boardSel) {
        e.preventDefault();
        st.removeBoardItem(st.boardSel);
      } else if (e.key === "Escape" && st.boardSel) {
        // drop the selection without touching the piece
        st.setBoardSel(null);
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
    const name = (id: KitComponentId) => KIT_COMPONENTS.find((c) => c.id === id)?.name ?? id;
    return ASSET_GROUPS.map((g) => ({
      name: g.name,
      items: g.ids.filter((id) => kitVisible(id, componentReleases, isAdmin)).map((id) => ({ id, name: name(id), svg: renderKit(applyKitTextFill(tc, kitTextFill[id]), id, "s", "default", undefined, kitShapes[id], { icon: resolveKitIcon(kitIcons[id], undefined), label: kitLabels[id] }) })),
    }));
  }, [cfg, kitShapes, kitTextFill, kitIcons, kitLabels, componentReleases, isAdmin]);

  const selBoard = boards.find((bd) => bd.items.some((b) => b.id === boardSel)) ?? null;
  const sel = selBoard?.items.find((b) => b.id === boardSel) ?? null;

  /* the exact svg a board item shows — shared by display, export and PNG */
  const svgOf = (b: BoardItem): { svg: string; cfg: GenConfig } => {
    if (b.kitId) {
      const kb = b.kitId === "progress" || b.kitId === "segbar" ? kitBar[b.kitId] : undefined;
      return { svg: renderKit(applyKitTextFill(cfg, kitTextFill[b.kitId]), b.kitId, kitSizes[b.kitId] ?? "l", "default", b.v ?? kitVals[b.kitId], kitShapes[b.kitId], { icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: kitLabels[b.kitId], dock: kb?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kb.dockSide ?? "left" } : undefined, bar: kb, row: b.kitId === "datarow" ? kitRow : undefined }), cfg };
    }
    const item = library.find((l) => l.id === b.libId);
    if (!item) return { svg: "", cfg };
    return { svg: item.kit ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", undefined, item.kit.shape) : renderBevel(item.cfg, "default"), cfg: item.cfg };
  };

  const nameOf = (b: BoardItem): string => {
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
            if (bd.bgBlur) ctx.filter = `blur(${bd.bgBlur}px)`;
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
          if (bd.bgBlur) ctx.filter = `blur(${bd.bgBlur}px)`;
          ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
          ctx.restore(); res();
        };
        img.onerror = () => res();
        img.src = bd.bgImage!;
      });
    }
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
      if ((bd.ovNoise ?? 0) > 0) {
        const t = document.createElement("canvas");
        t.width = t.height = 256;
        const tc = t.getContext("2d")!;
        const im = tc.createImageData(256, 256);
        let seed = 48271; // seeded — the same board exports the same pixels
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < im.data.length; i += 4) {
          const v2 = 88 + rnd() * 112;
          im.data[i] = im.data[i + 1] = im.data[i + 2] = v2; im.data[i + 3] = 255;
        }
        tc.putImageData(im, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = ((bd.ovNoise ?? 0) / 100) * 0.6;
        ctx.fillStyle = ctx.createPattern(t, "repeat")!;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    for (const b of bd.items) {
      const { svg, cfg: pc } = svgOf(b);
      if (!svg) continue;
      const pad = glowPadOf(pc);
      const s = b.scale ?? 1;
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          const w = img.width * s, h = img.height * s;
          const cx = b.x - pad * s + w / 2, cy = b.y - pad * s + h / 2;
          ctx.save();
          ctx.translate(cx, cy);
          if (b.rot) ctx.rotate((b.rot * Math.PI) / 180);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
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
  const ghostRef = useRef<{ kitId: KitComponentId; svg: string; x0: number; y0: number; moved: boolean } | null>(null);
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
      st.addBoardItems([{ kitId: g.kitId, x: sv(Math.max(0, (e.clientX - r.left) / f - 110)), y: sv(Math.max(0, (e.clientY - r.top) / f - 55)) }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  const scrollToBoard = (id: string) => {
    frameRef.current?.querySelector(`[data-board="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="board2">
      {/* ── assets ── */}
      <aside className="bd-assets">
        <div className="bd-h">Assets</div>
        <label className="bd-search"><Search size={13} strokeWidth={2.2} />
          <input placeholder="Search assets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" />
        </label>
        <div className="bd-teach">Click a piece to add it to the screen — or drag it straight onto a board.</div>
        <div className="bd-scroll">
          {assets.map((g) => {
            const items = g.items.filter((it) => !q || it.name.toLowerCase().includes(q.toLowerCase()));
            if (!items.length) return null;
            return (
              <div key={g.name}>
                <div className="bd-cat">{g.name}</div>
                <div className="bd-grid">
                  {items.map((it) => (
                    <button key={it.id} className="bd-asset" title={`Add ${it.name} to ${act?.name ?? "the board"} — or drag it onto any board`}
                      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } addKitToBoard(it.id); }}
                      onPointerDown={(e) => { if (e.button === 0) ghostRef.current = { kitId: it.id, svg: it.svg, x0: e.clientX, y0: e.clientY, moved: false }; }}
                      onPointerEnter={() => setPreview({ name: it.name, svg: svgOf({ id: "pv", libId: "", kitId: it.id, x: 0, y: 0 } as BoardItem).svg })}
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
                {library.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())).map((l) => (
                  <button key={l.id} className="bd-asset" title={`Add ${l.name} to ${act?.name ?? "the board"}`} onClick={() => addToBoard(l.id)}
                    onPointerEnter={() => setPreview({ name: l.name, svg: l.kit ? renderKit(l.cfg, l.kit.id, l.kit.size, "default", undefined, l.kit.shape) : renderBevel(l.cfg, "default") })}
                    onPointerLeave={() => setPreview(null)}>
                    <span dangerouslySetInnerHTML={{ __html: l.kit ? renderKit(l.cfg, l.kit.id, l.kit.size, "default", undefined, l.kit.shape) : renderBevel(l.cfg, "default") }} />
                    <i>{l.name}</i>
                  </button>
                ))}
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
          <button className="bd-export" onClick={() => { if (act) exportPng(act); }}><Download size={14} strokeWidth={2.2} /> Export PNG</button>
        </header>
        <div className="bd-frame bd-boards" ref={frameRef}>
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
                    <div className="bd-bg" style={{ backgroundImage: `url(${bd.bgImage})`, opacity: (bd.bgOpacity ?? 100) / 100, filter: bd.bgBlur ? `blur(${bd.bgBlur}px)` : undefined }} />
                  )}
                  {bd.bgVideo && (bd.bgShow ?? true) && (
                    <video className="bd-bg bd-bgvid" src={bd.bgVideo} autoPlay muted loop playsInline
                      style={{ opacity: (bd.bgOpacity ?? 100) / 100, filter: bd.bgBlur ? `blur(${bd.bgBlur}px)` : undefined }} />
                  )}
                  {/* overlay sits between the backdrop and the pieces */}
                  {(bd.ovMode ?? "none") !== "none" && (
                    <div className="bd-ov" style={{ background: ovBackground(bd.ovMode!), opacity: (bd.ovStrength ?? 45) / 100, mixBlendMode: (bd.ovBlend ?? "normal") as React.CSSProperties["mixBlendMode"] }} />
                  )}
                  {(bd.ovMode ?? "none") !== "none" && (bd.ovNoise ?? 0) > 0 && (
                    <div className="bd-noise" style={{ opacity: ((bd.ovNoise ?? 0) / 100) * 0.6 }} />
                  )}
                  <div className="bd-canvas" style={{ width: W, height: H, transform: `scale(${fit})` }}
                    onPointerDown={(e) => { if (e.target === e.currentTarget) setBoardSel(null); }}>
                    {bd.items.map((b) => (
                      <StagePiece key={b.id} b={b} playing={playing} selected={boardSel === b.id} fit={fit}
                        onExport={() => downloadSvg(svgOf(b).svg, `board-${nameOf(b).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)}
                        onSelect={() => { setActiveBoard(bd.id); setBoardSel(b.id); }}
                        onDragStart={(e) => { dragRef.current = { id: b.id, dx: e.clientX, dy: e.clientY, ox: b.x, oy: b.y, fit }; setBoardSel(b.id); }}
                        onDragMove={(e) => {
                          const d = dragRef.current;
                          if (!d || d.id !== b.id) return;
                          moveBoardItem(b.id, snapV(d.ox + (e.clientX - d.dx) / d.fit), snapV(d.oy + (e.clientY - d.dy) / d.fit));
                        }}
                        onDragEnd={() => { dragRef.current = null; }} />
                    ))}
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

        {sel ? (
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
              <button onClick={() => downloadSvg(svgOf(sel).svg, `board-${nameOf(sel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`)}>
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
                  else void fileToBgDataUrl(f).then((url) => setBoardBg({ bgImage: url, bgVideo: null, bgShow: true }));
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
function StagePiece({ b, playing, selected, fit, onSelect, onDragStart, onDragMove, onDragEnd, onExport }: {
  b: BoardItem; playing: boolean; selected: boolean; fit: number;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onExport: () => void;
}) {
  const { cfg, library, kitShapes, kitSizes, kitTextFill, kitIcons, kitLabels, kitVals, kitRow, kitBar } = useGen();
  const sc = b.scale ?? 1;
  const artRef = useRef<HTMLDivElement>(null);
  // corner-handle resize: screen-px delta → scale, against the piece's
  // unscaled on-screen width captured at grab time
  const rsz = useRef<{ x0: number; s0: number; wpx: number } | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number; shell: [number, number, number, number] | null } | null>(null);
  useEffect(() => {
    const host = artRef.current;
    if (!host) return;
    const read = () => {
      const svg = host.querySelector("svg");
      const w = svg ? parseFloat(svg.getAttribute("width") ?? "0") : 0;
      const h = svg ? parseFloat(svg.getAttribute("height") ?? "0") : 0;
      /* v59: the selection box hugs what the eye sees — the union of the
         DRAWN geometry (knobs poking past a slider track, extrusion depth),
         measured with getBBox in viewBox units. Filters (glow, shadows)
         don't count, which is exactly right: glow isn't the component.
         With anchorContent the wrapper origin sits at viewBox 0,0, so a
         geometry rect maps to CSS 1:1 (glow-padded canvases) or × w/vbW
         (plain 0-origin canvases). data-shell stays the fallback. */
      let shell: [number, number, number, number] | null = null;
      if (svg) {
        try {
          const bb = (svg as SVGGraphicsElement).getBBox();
          const vb = (svg as SVGSVGElement).viewBox?.baseVal;
          if (bb && bb.width > 0 && bb.height > 0 && vb && vb.width > 0) {
            const kx = w / vb.width || 1, ky = h / vb.height || 1;
            const padX = vb.x < 0 ? vb.x : 0, padY = vb.x < 0 ? vb.x : 0; // LiveArt margins reclaim the x-derived pad on both axes
            shell = [(bb.x - vb.x) * kx + padX, (bb.y - vb.y) * ky + padY, bb.width * kx, bb.height * ky];
          }
        } catch { /* detached / display:none — fall through to data-shell */ }
        if (!shell) {
          const raw = svg.getAttribute("data-shell")?.split(" ").map(Number);
          if (raw && raw.length === 4 && raw.every(Number.isFinite)) shell = raw as [number, number, number, number];
        }
      }
      if (w && h) setDim((d) => (d && d.w === w && d.h === h && String(d.shell) === String(shell) ? d : { w, h, shell }));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "data-shell"] });
    // text geometry settles once webfonts arrive — re-measure then
    if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(() => read());
    return () => mo.disconnect();
  }, []);
  const item = b.kitId ? null : library.find((l) => l.id === b.libId);
  if (!b.kitId && !item) return null;
  return (
    <div className={`board-item${playing ? " playing" : ""}${selected ? " sel" : ""}`}
      style={{ left: b.x, top: b.y, transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
        width: dim ? dim.w * sc : undefined, height: dim ? dim.h * sc : undefined }}
      {...(!playing ? {
        onPointerDown: (e: React.PointerEvent) => {
          onSelect();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          onDragStart(e);
        },
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerCancel: onDragEnd,
      } : { onPointerDown: onSelect })}>
      <div ref={artRef} style={{ transform: `scale(${sc})`, transformOrigin: "top left" }}>
        {b.kitId ? (
          <LiveArt cfg={applyKitTextFill(cfg, kitTextFill[b.kitId])} playing={playing} anchorContent
            kit={{ id: b.kitId, size: kitSizes[b.kitId] ?? "l", shape: kitShapes[b.kitId], icon: resolveKitIcon(kitIcons[b.kitId], undefined), label: kitLabels[b.kitId], value: b.v ?? kitVals[b.kitId],
              dock: (b.kitId === "progress" || b.kitId === "segbar") && kitBar[b.kitId]?.dock ? { icon: resolveKitIcon(kitIcons[b.kitId], undefined), side: kitBar[b.kitId]?.dockSide ?? "left" } : undefined,
              bar: b.kitId === "progress" || b.kitId === "segbar" ? kitBar[b.kitId] : undefined,
              row: b.kitId === "datarow" ? kitRow : undefined }} />
        ) : (
          <LiveArt cfg={item!.cfg} playing={playing} anchorContent
            kit={item!.kit ? { id: item!.kit.id, size: item!.kit.size, shape: item!.kit.shape } : undefined} />
        )}
      </div>
      {selected && (
        <i className="board-selbox" aria-hidden="true" style={dim?.shell
          ? { left: dim.shell[0] * sc, top: dim.shell[1] * sc, width: dim.shell[2] * sc, height: dim.shell[3] * sc }
          : { left: 0, top: 0, width: "100%", height: "100%" }} />
      )}
      {selected && !playing && dim && (() => {
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
                <button title="Export this piece as SVG" onClick={onExport}>
                  <Download size={12} strokeWidth={2.2} />
                </button>
                <button className="danger" title="Remove (Delete)" onClick={() => useGen.getState().removeBoardItem(b.id)}>
                  <X size={12} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            <span className="bd-rszwrap" style={{ left: (sh[0] + sh[2]) * sc, top: (sh[1] + sh[3]) * sc }}>
              <span className="bd-rsz2" role="slider" aria-label="Resize piece" aria-valuenow={Math.round(sc * 100)}
                style={{ transform: `scale(${1 / fit})` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  rsz.current = { x0: e.clientX, s0: sc, wpx: Math.max(24, dim.w * fit) };
                }}
                onPointerMove={(e) => {
                  const r = rsz.current;
                  if (!r) return;
                  useGen.getState().scaleBoardItem(b.id, Math.max(0.3, Math.min(2, r.s0 + (e.clientX - r.x0) / r.wpx)));
                }}
                onPointerUp={() => { rsz.current = null; }}
                onPointerCancel={() => { rsz.current = null; }} />
            </span>
          </>
        );
      })()}
    </div>
  );
}
