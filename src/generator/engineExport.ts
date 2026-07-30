/* ── atomic engine export ─────────────────────────────────────────
   The engine contract: NOTHING replaceable is baked. Every component
   ships as atomic, transparent PNGs (frames and surfaces as nine-slice
   with explicit margins), a manifest with native dimensions, slice
   margins, pivots, tintability and usage, plus Unity import tooling and
   Unreal UMG recipes. Labels are LIVE ENGINE TEXT — the manifest carries
   the display face and its source instead of pixels. The packed sheet is
   a visual catalog only, produced after the atomics. */
import type { GenConfig, KitComponentId, KitDesign, Shape } from "./model";
import { applyKitDesign, applyKitTextFill, darken, lighten, hexRgba, fontByName, KIT_SHAPE, STOCK_ICONS, effKitSize } from "./model";
import { renderKit, rarityTiers } from "./bevel";
import { silhouetteMeta } from "./silhouettes";
import { download, makeZip, svgToPngBytes } from "./exportUtils";
import { kitSpecMarkdown, fontNotesMarkdown, kitFontFamilies } from "./kitDocs";

const clone = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
const PNG_SCALE = 2;

interface AssetMeta {
  file: string; component: string; part: string;
  nativeW: number; nativeH: number;
  nineSlice: { left: number; right: number; top: number; bottom: number } | null;
  pivot: { x: number; y: number };
  tintable: boolean;
  usage: string;
}

export interface EngineExportState {
  cfg: GenConfig;
  kitDesigns: Partial<Record<KitComponentId, KitDesign>>;
  kitTextFill: Partial<Record<KitComponentId, string>>;
  kitShapes: Partial<Record<KitComponentId, Shape>>;
  kitSizes: Partial<Record<KitComponentId, "s" | "m" | "l">>;
  kitName: string;
}

/* minimal local geometry helpers (mirror the renderer's recipes) */
const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const rc = Math.min(r, h / 2, w / 2);
  return `M ${x + rc} ${y} H ${x + w - rc} Q ${x + w} ${y} ${x + w} ${y + rc} V ${y + h - rc} Q ${x + w} ${y + h} ${x + w - rc} ${y + h} H ${x + rc} Q ${x} ${y + h} ${x} ${y + h - rc} V ${y + rc} Q ${x} ${y} ${x + rc} ${y} Z`;
};
const svgWrap = (w: number, h: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

/** `licence` is issued by /api/export and rides inside the ZIP — it names
    the account the kit belongs to, so a redistributed bundle is traceable
    back to its source. Reached through guardedExport, never directly. */
export async function downloadEngineExport(st: EngineExportState, catalog?: () => Promise<Uint8Array | null>, licence?: string, onProgress?: (done: number, total: number, label: string) => void): Promise<void> {
  const files: { path: string; data: string | Uint8Array }[] = [];
  const manifest: AssetMeta[] = [];

  const pieceCfg = (id: KitComponentId) => applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[id]), st.kitTextFill[id]);
  const base = pieceCfg("primary");
  const bevelC = base.effects.Bevel ?? "#0E9CC9";
  const glowC = base.effects.Glow ?? lighten(bevelC, 0.55);
  const innerC = base.effects["Inner Fill"] ?? lighten(bevelC, 0.15);
  const wellC = darken(innerC, 0.72);

  /* content-free shell render: no label, no icon, no baked values; the
     cast shadow and contact pool are stripped (the engine owns shadows) */
  const shell = (id: KitComponentId, opts: Record<string, unknown> = {}, mutate?: (c: GenConfig) => void, value?: number) => {
    const c = clone(pieceCfg(id));
    c.stateDesigns = {};
    c.shadow.opacity = 0;
    c.candy.contact.opacity = 0;
    for (const s of Object.values(c.states)) s.glow = 0;
    mutate?.(c);
    return renderKit(c, id, effKitSize(st.kitSizes[id]), "default", value, st.kitShapes[id], { label: "", icon: null, ...opts });
  };
  const flat = (c: GenConfig) => {
    c.candy.gloss.on = false;
    c.candy.specular.on = false;
    c.candy.pattern.type = "none";
  };

  /* nine-slice margins in PNG pixels: swallow the transparent glow pad and
     the fixed canvas inset, then the silhouette's own cap zone */
  const sliceOf = (svg: string, id: KitComponentId, shellH: number) => {
    const pad = Math.max(0, -+(/viewBox="(-?[\d.]+)/.exec(svg)?.[1] ?? 0));
    const shape = st.kitShapes[id] ?? KIT_SHAPE[id] ?? st.cfg.shape;
    const met = silhouetteMeta(shape);
    const capX = Math.max(met ? met.capScale * shellH : shellH * 0.3, shellH * 0.22);
    const capY = Math.min(shellH * 0.42, Math.max(shellH * 0.28, capX * 0.8));
    const xIn = 39, yIn = 30;
    return {
      left: Math.round((pad + xIn + capX) * PNG_SCALE),
      right: Math.round((pad + xIn + capX) * PNG_SCALE),
      top: Math.round((pad + yIn + capY) * PNG_SCALE),
      bottom: Math.round((pad + yIn + capY) * PNG_SCALE),
    };
  };

  /* Two-phase build so progress is REAL: sections enqueue their renders
     (cheap synchronous SVG strings), then one raster loop turns them into
     PNGs with an exact done/total — rasterization is where the time goes,
     and a long silent "Working…" reads as a hang (owner report). */
  const pngQueue: { path: string; svg: string; meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH"> }[] = [];
  const addPng = (path: string, svg: string, meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH">): Promise<void> => {
    pngQueue.push({ path, svg, meta });
    return Promise.resolve();
  };
  const rasterQueue = async () => {
    const total = pngQueue.length + (catalog ? 1 : 0);
    for (let qi = 0; qi < pngQueue.length; qi++) {
      const q = pngQueue[qi];
      onProgress?.(qi, total, q.path);
      const { bytes, w, h } = await svgToPngBytes(q.svg, PNG_SCALE);
      files.push({ path: `assets/${q.path}`, data: bytes });
      manifest.push({ file: `assets/${q.path}`, nativeW: w, nativeH: h, ...q.meta });
    }
    onProgress?.(pngQueue.length, total, catalog ? "catalog" : "zip");
  };

  /* ── nine-sliced frames & surfaces — full material and flat variants ── */
  const NINE: { id: KitComponentId; family: string; h: number; usage: string }[] = [
    { id: "primary", family: "button-primary", h: 136, usage: "Main action button. Nine-slice base + live engine text; add icons as separate images." },
    { id: "secondary", family: "button-secondary", h: 136, usage: "Secondary action. Same construction as primary." },
    { id: "small", family: "button-small", h: 100, usage: "Compact action button." },
    { id: "chip", family: "chip", h: 84, usage: "Pill / chip. Value text is live engine text." },
    { id: "tab", family: "tab", h: 84, usage: "Tab. Selected state = tint or the full-material variant." },
    { id: "input", family: "input", h: 124, usage: "Input field surface (well included). Value + caret are live engine widgets." },
    { id: "panel", family: "panel", h: 380, usage: "Container / window. Content is engine layout." },
    { id: "header", family: "header-banner", h: 158, usage: "Header banner. Title is live engine text." },
    { id: "datarow", family: "list-row", h: 128, usage: "List row surface. Portrait, texts and bar are separate engine elements." },
    { id: "slot", family: "item-slot", h: 128, usage: "Item slot frame + well. Item icon and count are engine content." },
  ];
  for (const n of NINE) {
    const fullSvg = shell(n.id, n.id === "datarow" ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never } : {});
    const slice = sliceOf(fullSvg, n.id, n.h);
    await addPng(`${n.family}/base.9.png`, fullSvg,
      { component: n.family, part: "base", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: n.usage });
    const flatSvg = shell(n.id, n.id === "datarow" ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never } : {}, flat);
    await addPng(`${n.family}/base-flat.9.png`, flatSvg,
      { component: n.family, part: "base-flat", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Flat variant (no gloss/specular/pattern) — tint freely or layer your own effects above it." });
  }

  /* ── controls: separated track / fill / thumb ─────────────────── */
  const capsule = (w: number, h: number, fill: string, extra = "") =>
    svgWrap(w, h, `<path d="${rr(0.5, 0.5, w - 1, h - 1, h / 2)}" fill="${fill}"/>` + extra);
  const grad = (idp: string, a: string, b: string) =>
    `<defs><linearGradient id="${idp}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;

  const trackSvg = (w: number, h: number) => capsule(w, h, wellC);
  const fillSvg = (w: number, h: number) =>
    svgWrap(w, h, grad("f", bevelC, glowC) +
      `<path d="${rr(0.5, 0.5, w - 1, h - 1, h / 2)}" fill="url(#f)"/>` +
      `<path d="${rr(w * 0.03, h * 0.09, w * 0.94, h * 0.34, h * 0.17)}" fill="#FFFFFF" opacity="0.3"/>`);
  const ballSvg = (d: number) => {
    const r = d / 2 - 2;
    return svgWrap(d, d,
      `<defs><radialGradient id="b" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="${lighten(bevelC, 0.78)}"/><stop offset="1" stop-color="${lighten(bevelC, 0.3)}"/></radialGradient></defs>` +
      `<circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="url(#b)" stroke="${darken(bevelC, 0.38)}" stroke-width="2"/>` +
      `<ellipse cx="${d / 2 - r * 0.3}" cy="${d / 2 - r * 0.44}" rx="${r * 0.34}" ry="${r * 0.19}" fill="#FFFFFF" opacity="0.85"/>`);
  };
  const barSlice = (h: number) => ({ left: h, right: h, top: Math.round(h * 0.9), bottom: Math.round(h * 0.9) });

  await addPng("progress/track.9.png", trackSvg(440, 44), { component: "progress", part: "track", nineSlice: barSlice(44), pivot: { x: 0, y: 0.5 }, tintable: true, usage: "Progress track. Stretch horizontally; fill goes above it." });
  await addPng("progress/fill.9.png", fillSvg(440, 36), { component: "progress", part: "fill", nineSlice: barSlice(36), pivot: { x: 0, y: 0.5 }, tintable: false, usage: "Progress fill. Engine drives width/scissor from the live value." });
  // segmented meter — empty well plus one lit cell; the engine tiles cells
  // into the well at its own count/gap. The docked emblem socket ships as
  // the icon-button base: same silhouette, drop any art in the well.
  await addPng("segbar/base.png", shell("segbar", { bar: { segments: 5 } }, undefined, 0), { component: "segbar", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Segmented meter, empty — 5 ghost cells in the themed well. Layer lit cells above." });
  await addPng("segbar/lit.png", shell("segbar", { bar: { segments: 5 } }, undefined, 1), { component: "segbar", part: "lit", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Segmented meter, full — crop one cell for a tile, or scissor horizontally per lit count." });
  await addPng("slider/track.9.png", trackSvg(440, 26), { component: "slider", part: "track", nineSlice: barSlice(26), pivot: { x: 0, y: 0.5 }, tintable: true, usage: "Slider track." });
  await addPng("slider/fill.9.png", fillSvg(440, 20), { component: "slider", part: "fill", nineSlice: barSlice(20), pivot: { x: 0, y: 0.5 }, tintable: false, usage: "Slider filled run, up to the thumb." });
  await addPng("slider/thumb.png", ballSvg(96), { component: "slider", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Slider thumb (candy ball)." });
  await addPng("toggle/track.9.png", capsule(220, 110, wellC, `<path d="${rr(6, 6, 208, 98, 49)}" fill="${hexRgba(bevelC, 0.25)}"/>`), { component: "toggle", part: "track", nineSlice: barSlice(110), pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Toggle track. Tint toward the accent when ON." });
  await addPng("toggle/thumb.png", ballSvg(110), { component: "toggle", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Toggle knob — engine slides it between ends." });

  await addPng("checkbox/base.png", shell("checkbox", {}, undefined, 0), { component: "checkbox", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Unchecked box. The check mark is a separate tintable glyph." });
  await addPng("radio/base.png", shell("radio", {}, undefined, 0), { component: "radio", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Radio shell. The dot is a separate tintable glyph." });
  await addPng("orb/lit.png", shell("orb", {}, undefined, 1), { component: "orb", part: "lit", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, lit — streaks, statuses, day markers." });
  await addPng("orb/off.png", shell("orb", {}, undefined, 0), { component: "orb", part: "off", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, off (dark glass)." });
  await addPng("badge/base.png", shell("badge"), { component: "badge", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Badge / medallion shell. Number or glyph is engine content." });
  await addPng("iconbtn/base.png", shell("iconbtn"), { component: "iconbtn", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Icon button shell. Icon is a separate tintable glyph." });

  /* ── rarity system: one pre-tinted frame per tier + the bare loot plate.
     The tier ladder (this kit's names and colors, custom edits included)
     rides kit-manifest.json > rarity — the engine picks the tier from its
     own item data and renders the tier word as live text. ── */
  const slugR = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tier";
  const tiersR = rarityTiers(st.cfg);
  for (let i = 0; i < tiersR.length; i++) {
    await addPng(`rarityframe/${slugR(tiersR[i].name)}.png`, shell("rarityframe", { overlay: "frame" }, undefined, i / (tiersR.length - 1)),
      { component: "rarityframe", part: slugR(tiersR[i].name), nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `Item frame, ${tiersR[i].name} tier — aura pre-tinted ${tiersR[i].c}. Drop the item icon in the well; the tier word is live engine text (see manifest > rarity).` });
  }
  {
    const ltSvg = shell("loottag", { overlay: "frame" });
    await addPng("loottag/base.9.png", ltSvg,
      { component: "loottag", part: "base", nineSlice: sliceOf(ltSvg, "loottag", 92), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Loot-tag plate, bare. Stripe = a rounded rect tinted to the tier color; item name and tier word are live engine text (colors in manifest > rarity)." });
  }

  /* ── dropdown: closed shell, menu plate, and the two row overlays.
     A row's DEFAULT face needs no asset (it's live text on the plate);
     what the engine needs are the two emphasis layers — the hover bar
     and the selected check — as swappable pieces. The bar is this kit's
     Hover recipe made into an asset: the hover state's aura color at the
     hover glow dial's strength. */
  {
    const ddSvg = shell("dropdown");
    await addPng("dropdown/base.9.png", ddSvg,
      { component: "dropdown", part: "base", nineSlice: sliceOf(ddSvg, "dropdown", 110), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Closed dropdown shell. The value text and chevron are live engine content." });
    await addPng("dropdown/menu.9.png",
      svgWrap(440, 260, `<path d="${rr(1, 1, 438, 258, 14)}" fill="${darken(innerC, 0.55)}" stroke="${darken(bevelC, 0.5)}" stroke-width="1.5"/>`),
      { component: "dropdown", part: "menu", nineSlice: { left: 28, right: 28, top: 28, bottom: 28 }, pivot: { x: 0.5, y: 0 }, tintable: false, usage: "Open-menu plate. Stretch vertically to the option count; option rows are live engine text." });
    const dd = pieceCfg("dropdown");
    const hd = dd.stateDesigns.hover ?? dd;
    const hovC = hd.candy.aura.color ?? hd.effects.Glow ?? glowC;
    const hovOp = Math.min(0.55, 0.1 + 0.35 * (dd.states.hover.glow / 100));
    await addPng("dropdown/row-highlight.9.png",
      svgWrap(440, 88, `<path d="${rr(1, 1, 438, 86, 12)}" fill="${hexRgba(hovC, hovOp)}"/>`),
      { component: "dropdown", part: "row-highlight", nineSlice: { left: 24, right: 24, top: 24, bottom: 24 }, pivot: { x: 0, y: 0.5 }, tintable: true, usage: "The bar for the row under the cursor — derived from this kit's Hover state recipe. Show it on pointer hover AND keyboard/gamepad focus (same visual for both), never on the selected row." });
    await addPng("dropdown/row-check.png",
      svgWrap(96, 96, `<path d="M 24 52 l 15 15 l 33 -37" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
      { component: "dropdown", part: "row-check", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "The selected-row check — marks the choice that is currently TRUE, with full-strength row text. Keep it distinct from the hover bar: highlighted moves constantly, selected only changes on commit." });
  }

  /* ── racing HUD: dial face + needle, segment arc + one segment, track ── */
  await addPng("speedo/face.png", shell("speedo", { part: "face" }, undefined, 0), { component: "speedo", part: "face", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Classic dial face — ticks and red zone only. The km/h readout is live engine text." });
  await addPng("speedo/needle.png", shell("speedo", { part: "needle" }, undefined, 0), { component: "speedo", part: "needle", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Needle at zero (pointing to the sweep start). Rotate up to 270° around the canvas center from live speed." });
  await addPng("speedo2/face.png", shell("speedo2", { part: "face" }, undefined, 0), { component: "speedo2", part: "face", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "HUD segment arc, all 24 segments unlit. Light segments with segment.png copies placed on the same polar grid." });
  await addPng("speedo2/segment.png", shell("speedo2", { part: "segment" }, undefined, 1), { component: "speedo2", part: "segment", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "One lit segment — instance and rotate per step; tint along the palette for the sweep gradient." });
  await addPng("circuit/track.png", shell("circuit", { part: "track" }), { component: "circuit", part: "track", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Circuit ribbon with start/finish tick. Position markers and the venue label are live engine sprites/text." });
  {
    const lbSvg = shell("leaderboard", { part: "base" });
    await addPng("leaderboard/base.9.png", lbSvg, { component: "leaderboard", part: "base", nineSlice: sliceOf(lbSvg, "leaderboard", 250), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Position-list panel. Heading, rows and the highlighted player row are live engine content." });
  }
  {
    const lpSvg = shell("laptimes", { part: "base" });
    await addPng("laptimes/base.9.png", lpSvg, { component: "laptimes", part: "base", nineSlice: sliceOf(lpSvg, "laptimes", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Lap-comparison panel. Traces, legend and delta are live engine content." });
    const tmSvg = shell("telemetry", { part: "base" });
    await addPng("telemetry/base.9.png", tmSvg, { component: "telemetry", part: "base", nineSlice: sliceOf(tmSvg, "telemetry", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Telemetry panel. Throttle/brake/speed traces are live engine content." });
  }
  await addPng("startlights/base.png", shell("startlights", { part: "base" }), { component: "startlights", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Start-light gantry, all pods dark. Light the pods with tinted circles (alarm red) from the engine's countdown." });

  /* ── shared FX blobs — engines compose their own shadows/glows ── */
  const blob = (color: string, opacity: number) =>
    svgWrap(256, 256, `<defs><radialGradient id="g"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="126" fill="url(#g)"/>`);
  await addPng("fx/drop-shadow.png", blob("#04070E", 0.55), { component: "fx", part: "drop-shadow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Soft shadow blob — scale/flatten under any piece." });
  await addPng("fx/glow.png", blob("#FFFFFF", 0.85), { component: "fx", part: "glow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Radial glow blob — tint to the Glow role for auras and pulses." });

  /* ── tintable white icon set (engine swaps freely) ────────────── */
  for (const [name, def] of Object.entries(STOCK_ICONS)) {
    const stroke = def.mode === "stroke";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="${def.viewBox}">` +
      `<g fill="${stroke ? "none" : "#FFFFFF"}" stroke="${stroke ? "#FFFFFF" : "none"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${def.inner}</g></svg>`;
    await addPng(`icons/${name}.png`, svg, { component: "icons", part: name, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "White glyph — tint in-engine; never bake into components." });
  }

  /* ── rasterise everything queued above, reporting progress ────── */
  await rasterQueue();

  /* ── manifest ─────────────────────────────────────────────────── */
  const fdef = fontByName(st.cfg.type.font);
  files.push({
    path: "kit-manifest.json",
    data: JSON.stringify({
      kit: st.kitName,
      exported: new Date().toISOString(),
      pngScale: PNG_SCALE,
      rules: [
        "Nothing replaceable is baked: labels, numbers, values, avatars and swappable icons are live engine content.",
        "Nine-slice assets stretch only their center region; margins below are in PNG pixels at pngScale.",
        "base.9.png = full material (gloss baked); base-flat.9.png = tintable flat variant for independent effects.",
        "Progress = track + fill; slider = track + fill + thumb; toggle = track + thumb; buttons = base + engine text + separate icon.",
        "Rarity: drive the displayed tier from your item data. rarityframe/ ships one pre-tinted frame per tier; the rarity block below carries the tier names and colors for stripes, tier words and glows.",
      ],
      typography: {
        font: st.cfg.type.font,
        source: `https://fonts.google.com/specimen/${encodeURIComponent(st.cfg.type.font).replace(/%20/g, "+")}`,
        googleFontsQuery: fdef?.css ?? null,
        note: "Render all labels as live engine text in this face.",
      },
      palette: { bevel: bevelC, glow: glowC, innerFill: innerC, well: wellC, highlight: base.effects.Highlight ?? "#FFFFFF", shadow: base.effects.Shadow ?? darken(bevelC, 0.5) },
      rarity: {
        note: "This kit's five-tier ladder, lowest to highest — names and colors are the maker's own (custom edits included). Pick the tier from your item data: frame = assets/rarityframe/<tier>.png, stripe/glow/tier-word color = the tier's color, tier word = live engine text.",
        tiers: tiersR.map((t, i) => ({ index: i, name: t.name, color: t.c })),
      },
      assets: manifest,
    }, null, 2),
  });

  /* ── Unity: importer applies borders/pivots straight from the manifest ── */
  files.push({ path: "unity/README.md", data: UNITY_README });
  files.push({ path: "unity/Editor/PatternBreakKitImporter.cs", data: UNITY_IMPORTER });
  files.push({ path: "unity/Examples/PrimaryButton.prefab", data: UNITY_BUTTON_PREFAB });
  files.push({ path: "unity/Examples/ProgressBar.prefab", data: UNITY_PROGRESS_PREFAB });

  /* ── Unreal: UMG recipes with this kit's real margins ─────────── */
  const m = (fam: string) => manifest.find((a) => a.component === fam && a.part === "base")?.nineSlice;
  const bm = m("button-primary"); const pm = m("panel");
  files.push({ path: "unreal/README.md", data: UNREAL_README });
  files.push({
    path: "unreal/UMG_Recipes.md",
    data: UNREAL_RECIPES
      .replace("__BTN_MARGIN__", bm ? `${bm.left}, ${bm.top}, ${bm.right}, ${bm.bottom}` : "48, 40, 48, 40")
      .replace("__PANEL_MARGIN__", pm ? `${pm.left}, ${pm.top}, ${pm.right}, ${pm.bottom}` : "64, 64, 64, 64")
      .replace(/__FONT__/g, st.cfg.type.font),
  });
  files.push({
    path: "unreal/SliceMargins.csv",
    data: "Name,Left,Top,Right,Bottom\n" + manifest.filter((a) => a.nineSlice)
      .map((a) => `${a.component}/${a.part},${a.nineSlice!.left},${a.nineSlice!.top},${a.nineSlice!.right},${a.nineSlice!.bottom}`).join("\n"),
  });

  /* ── OPTIONAL packed atlas — produced last, catalog only ──────── */
  if (catalog) {
    const cat = await catalog().catch(() => null);
    if (cat) files.push({ path: "atlas/catalog.png", data: cat });
    files.push({ path: "atlas/README.md", data: "The packed sheet is a VISUAL CATALOG for humans.\nDo not slice it for engine use — build from /assets and kit-manifest.json instead.\n" });
    onProgress?.(pngQueue.length + 1, pngQueue.length + 1, "zip");
  }

  /* paperwork — the recipe by hand, the machine file, the font terms */
  files.push({ path: "README.md", data: kitSpecMarkdown(st.cfg, st.kitName) + "\n" + fontNotesMarkdown(kitFontFamilies(st.cfg)) });
  files.push({ path: "settings.json", data: JSON.stringify(st.cfg, null, 2) });
  if (licence) files.push({ path: "LICENCE.txt", data: licence });
  download(`${st.kitName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-engine-kit.zip`, makeZip(files));
}

/* eslint-disable no-useless-escape */
const UNITY_README = `# PatternBreak kit — Unity import

1. Copy the whole export (assets/, kit-manifest.json, unity/) into your project's Assets/ folder.
2. Unity compiles Editor/PatternBreakKitImporter.cs and re-imports every PNG:
   sprites get their nine-slice borders, pivots and point-free filtering
   straight from kit-manifest.json. Re-run anytime via
   Tools > PatternBreak > Reapply Kit Import Settings.
3. Open Examples/*.prefab for reference hierarchies. The example Images
   ship without a sprite on purpose (a text file cannot know the GUIDs your
   Unity assigns on import) — drag the named sprite from assets/ onto the
   Image; the type/slicing settings are already in place.
4. Labels are TextMeshPro / UI.Text in the kit's display face (see
   kit-manifest.json > typography). Never bake copy into textures.

Sliced Image setup: Image Type = Sliced, and the borders arrive from the importer.
Progress bar: track Image (sliced) + fill Image (sliced, Fill or scissored by a mask).
Slider: track + fill Images, thumb on the handle rect.

No importer required: everything the script does is plain data you can set by
hand. Each sprite's border (L/R/T/B px) and pivot sit in kit-manifest.json —
open the Sprite Editor, type the four numbers, done. The script only saves you
the typing. If it misbehaves in your Unity version, tell us and work from the
manifest meanwhile — nothing about the assets depends on it.
`;

const UNITY_IMPORTER = `// PatternBreak kit importer — applies nine-slice borders and pivots from
// kit-manifest.json to every exported sprite. Editor-only.
using System.IO;
using UnityEditor;
using UnityEngine;

namespace PatternBreak {
  [System.Serializable] class PBSlice { public int left, right, top, bottom; }
  [System.Serializable] class PBPivot { public float x = 0.5f, y = 0.5f; }
  [System.Serializable] class PBAsset { public string file; public PBSlice nineSlice; public PBPivot pivot; }
  [System.Serializable] class PBManifest { public PBAsset[] assets; }

  public static class KitImporter {
    [MenuItem("Tools/PatternBreak/Reapply Kit Import Settings")]
    public static void Apply() {
      foreach (var guid in AssetDatabase.FindAssets("kit-manifest t:TextAsset")) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        var manifest = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath));
        foreach (var a in manifest.assets) {
          var p = root + "/" + a.file;
          var ti = AssetImporter.GetAtPath(p) as TextureImporter;
          if (ti == null) continue;
          ti.textureType = TextureImporterType.Sprite;
          ti.spriteImportMode = SpriteImportMode.Single;
          ti.mipmapEnabled = false;
          ti.alphaIsTransparency = true;
          var settings = new TextureImporterSettings();
          ti.ReadTextureSettings(settings);
          settings.spriteAlignment = (int)SpriteAlignment.Custom;
          settings.spritePivot = new Vector2(a.pivot.x, a.pivot.y);
          ti.SetTextureSettings(settings);
          if (a.nineSlice != null && (a.nineSlice.left + a.nineSlice.right + a.nineSlice.top + a.nineSlice.bottom) > 0)
            ti.spriteBorder = new Vector4(a.nineSlice.left, a.nineSlice.bottom, a.nineSlice.right, a.nineSlice.top);
          ti.SaveAndReimport();
        }
        Debug.Log("PatternBreak kit import settings applied: " + manifest.assets.Length + " assets under " + root);
      }
    }
  }
}
`;

/* Script references are the com.unity.ugui PACKAGE sources — every C# script
   in a package is {fileID: 11500000} under its .cs meta guid: Image.cs is
   fe87c0e1cc204ed48ad3b37840f39efc, Button.cs 4e29b1a8efbd4b44bb3f3716e73f07ff.
   The older engine-DLL identities (guid f70555f144d8491a825f0804e09c671c)
   come up "Missing (Mono Script)" in Unity 6 (owner report) — the DLL is
   gone, UI moved to the package in 2019.2. Sprites are deliberately
   {fileID: 0}: a text prefab cannot know the guid the user's Unity assigns
   the PNG at import, and any placeholder text there is a per-line console
   error ("Could not extract GUID"). Field lists mirror Unity-serialized
   prefabs verbatim so nothing else deserializes to a surprise default. */
const UNITY_BUTTON_PREFAB = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
# PatternBreak example — PrimaryButton
# Root: RectTransform + CanvasRenderer + Image (Sliced) + Button.
# The Image ships with NO sprite on purpose — drag assets/button-primary/base.9.png
# onto it (Image Type is already Sliced; the importer gives the sprite its
# borders). Add a TextMeshProUGUI child for the label (live text, kit face).
--- !u!1 &100000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 22200000}
  - component: {fileID: 11400000}
  - component: {fileID: 11400002}
  m_Layer: 5
  m_Name: PrimaryButton
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!224 &400000
RectTransform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
  m_AnchorMin: {x: 0.5, y: 0.5}
  m_AnchorMax: {x: 0.5, y: 0.5}
  m_AnchoredPosition: {x: 0, y: 0}
  m_SizeDelta: {x: 400, y: 136}
  m_Pivot: {x: 0.5, y: 0.5}
--- !u!222 &22200000
CanvasRenderer:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_CullTransparentMesh: 1
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: fe87c0e1cc204ed48ad3b37840f39efc, type: 3}
  m_Name:
  m_EditorClassIdentifier:
  m_Material: {fileID: 0}
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_RaycastTarget: 1
  m_RaycastPadding: {x: 0, y: 0, z: 0, w: 0}
  m_Maskable: 1
  m_OnCullStateChanged:
    m_PersistentCalls:
      m_Calls: []
  m_Sprite: {fileID: 0}
  m_Type: 1
  m_PreserveAspect: 0
  m_FillCenter: 1
  m_FillMethod: 4
  m_FillAmount: 1
  m_FillClockwise: 1
  m_FillOrigin: 0
  m_UseSpriteMesh: 0
  m_PixelsPerUnitMultiplier: 1
--- !u!114 &11400002
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: 4e29b1a8efbd4b44bb3f3716e73f07ff, type: 3}
  m_Name:
  m_EditorClassIdentifier:
  m_Navigation:
    m_Mode: 3
    m_WrapAround: 0
    m_SelectOnUp: {fileID: 0}
    m_SelectOnDown: {fileID: 0}
    m_SelectOnLeft: {fileID: 0}
    m_SelectOnRight: {fileID: 0}
  m_Transition: 1
  m_Colors:
    m_NormalColor: {r: 1, g: 1, b: 1, a: 1}
    m_HighlightedColor: {r: 0.9607843, g: 0.9607843, b: 0.9607843, a: 1}
    m_PressedColor: {r: 0.78431374, g: 0.78431374, b: 0.78431374, a: 1}
    m_SelectedColor: {r: 0.9607843, g: 0.9607843, b: 0.9607843, a: 1}
    m_DisabledColor: {r: 0.78431374, g: 0.78431374, b: 0.78431374, a: 0.5019608}
    m_ColorMultiplier: 1
    m_FadeDuration: 0.1
  m_SpriteState:
    m_HighlightedSprite: {fileID: 0}
    m_PressedSprite: {fileID: 0}
    m_SelectedSprite: {fileID: 0}
    m_DisabledSprite: {fileID: 0}
  m_AnimationTriggers:
    m_NormalTrigger: Normal
    m_HighlightedTrigger: Highlighted
    m_PressedTrigger: Pressed
    m_SelectedTrigger: Selected
    m_DisabledTrigger: Disabled
  m_Interactable: 1
  m_TargetGraphic: {fileID: 11400000}
  m_OnClick:
    m_PersistentCalls:
      m_Calls: []
`;

const UNITY_PROGRESS_PREFAB = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
# PatternBreak example — ProgressBar
# Root: RectTransform + CanvasRenderer + Image (Sliced).
# The Image ships with NO sprite on purpose — drag assets/progress/track.9.png
# onto it. Add a Fill child (Image, sprite progress/fill.9.png, type Filled
# Horizontal, or width driven by code — the value is LIVE, never baked).
--- !u!1 &100000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 22200000}
  - component: {fileID: 11400000}
  m_Layer: 5
  m_Name: ProgressBar
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!224 &400000
RectTransform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
  m_AnchorMin: {x: 0.5, y: 0.5}
  m_AnchorMax: {x: 0.5, y: 0.5}
  m_AnchoredPosition: {x: 0, y: 0}
  m_SizeDelta: {x: 440, y: 44}
  m_Pivot: {x: 0.5, y: 0.5}
--- !u!222 &22200000
CanvasRenderer:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_CullTransparentMesh: 1
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: fe87c0e1cc204ed48ad3b37840f39efc, type: 3}
  m_Name:
  m_EditorClassIdentifier:
  m_Material: {fileID: 0}
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_RaycastTarget: 1
  m_RaycastPadding: {x: 0, y: 0, z: 0, w: 0}
  m_Maskable: 1
  m_OnCullStateChanged:
    m_PersistentCalls:
      m_Calls: []
  m_Sprite: {fileID: 0}
  m_Type: 1
  m_PreserveAspect: 0
  m_FillCenter: 1
  m_FillMethod: 4
  m_FillAmount: 1
  m_FillClockwise: 1
  m_FillOrigin: 0
  m_UseSpriteMesh: 0
  m_PixelsPerUnitMultiplier: 1
`;

const UNREAL_README = `# PatternBreak kit — Unreal import

1. Import assets/ into Content/PatternBreak (drag the folder in).
2. UMG widgets cannot ship as text — build them once from
   UMG_Recipes.md; every margin below is exact for THIS kit export.
3. SliceMargins.csv imports as a DataTable if you want the margins
   available to Blueprints/code.
4. All labels are live TextBlocks in the kit's display face (see
   kit-manifest.json > typography). Never bake copy into textures.
`;

const UNREAL_RECIPES = `# UMG recipes — exact values for this export

Margins below are Slate brush margins as FRACTIONS of the image size —
Unreal wants 0..0.5 per side. Compute: side_px / image_px (values are also
in SliceMargins.csv in pixels).

## Button
- Widget: Button (or Border + Button for flat-variant layering)
- Style > Normal/Hovered/Pressed brush: assets/button-primary/base.9.png
  - Draw As: Box
  - Margin (px at export scale): __BTN_MARGIN__  -> divide by the PNG size per side
- Child: TextBlock, font "__FONT__" (live text), plus an optional Image for the icon (assets/icons/*, tinted).

## Panel / window
- Border widget, brush assets/panel/base.9.png, Draw As: Box
- Margin (px): __PANEL_MARGIN__

## Progress bar
- ProgressBar widget
- Style > Background Image: assets/progress/track.9.png (Box)
- Style > Fill Image: assets/progress/fill.9.png (Box)
- Percent is bound to live data.

## Slider
- Slider widget
- Style > Normal Bar: assets/slider/track.9.png; Fill: assets/slider/fill.9.png
- Style > Normal Thumb: assets/slider/thumb.png (Draw As: Image)

## Toggle
- CheckBox widget styled as a switch:
  Unchecked/Checked Image: assets/toggle/track.9.png (tint the checked state
  toward the palette glow), thumb via a child Image animated between ends.

## Checkbox / Radio
- CheckBox widget: Unchecked Image assets/checkbox/base.png;
  Checked = base + assets/icons/check.png (tinted) layered above.
`;
