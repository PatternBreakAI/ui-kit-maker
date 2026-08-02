/* ── atomic engine export ─────────────────────────────────────────
   The engine contract: NOTHING replaceable is baked. Every component
   ships as atomic, transparent PNGs (frames and surfaces as nine-slice
   with explicit margins), a manifest with native dimensions, slice
   margins, pivots, tintability and usage, plus Unity import tooling and
   Unreal UMG recipes. Labels are LIVE ENGINE TEXT — the manifest carries
   the display face and its source instead of pixels. The packed sheet is
   a visual catalog only, produced after the atomics. */
import type { GenConfig, KitComponentId, KitDesign, Shape } from "./model";
import { applyKitDesign, applyKitTextFill, darken, lighten, hexRgba, fontByName, KIT_SHAPE, STOCK_ICONS, effKitSize, sanitizeUnitySlug } from "./model";
import { renderKit, rarityTiers } from "./bevel";
import { silhouetteMeta } from "./silhouettes";
import { download, makeZip, svgToPngBytes, svgToPngBytesTight } from "./exportUtils";
import { kitSpecMarkdown, fontNotesMarkdown, kitFontFamilies } from "./kitDocs";

const clone = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
const PNG_SCALE = 2;

interface AssetMeta {
  file: string; component: string; part: string;
  nativeW: number; nativeH: number;
  /** Content hash — the importer's receipt compares these across sends to
      report new / restyled / unchanged without touching file bytes (I2). */
  sha256: string;
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
  /** I1 — the kit's PERMANENT address inside the user's Unity project
      (Assets/UIKitMaker/<slug>/). Minted at first export, survives display
      renames; changing it would orphan everything a user has placed. */
  slug: string;
  /** Monotonic per-export counter for the manifest + import receipts. */
  kitVersion: number;
  /** Free tier ships a STARTER payload (master button + chip + progress —
      states, nine-slice and the overwrite restyle all demonstrated); paid
      tiers ship every component. Same folder, same paths: upgrading later
      lands the full kit over the starter without moving anything. */
  scope: "free" | "full";
}

const sha256Hex = async (data: Uint8Array): Promise<string> => {
  // copy into a plain ArrayBuffer — subtle.digest's type rejects views that
  // could be backed by a SharedArrayBuffer
  const d = await crypto.subtle.digest("SHA-256", data.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

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
  /* nine-slice renders drop the bloom halo too: it reaches past the shell,
     and a sliced sprite must hug its geometry — glows are engine-composed
     (fx/glow.png, states recipe), same contract as shadows */
  const slim = (c: GenConfig) => {
    c.candy.bloom.opacity = 0;
  };
  /* Designed state renders — unlike shell(), state forks are KEPT: the
     hover/pressed/disabled looks are the kit's own recipes, baked so the
     engine can Sprite-Swap them. Outer effects still engine-composed. */
  const stateShell = (id: KitComponentId, state: "hover" | "pressed" | "disabled", opts: Record<string, unknown> = {}) => {
    const c = clone(pieceCfg(id));
    c.shadow.opacity = 0;
    c.candy.contact.opacity = 0;
    for (const s of Object.values(c.states)) s.glow = 0;
    slim(c);
    return renderKit(c, id, effKitSize(st.kitSizes[id]), state, undefined, st.kitShapes[id], { label: "", icon: null, ...opts });
  };

  /* nine-slice margins in PNG pixels: the silhouette's own cap zone plus the
     crop margin — nothing else. Sliced sprites are exported TIGHT (see
     svgToPngBytesTight); the old padded-canvas borders (pad + inset + cap)
     summed past the component's own footprint on effect-heavy kits, and
     Unity draws a sliced image whose borders outgrow the rect as four caps
     of transparent padding with a zero-size center — an invisible button
     (owner report, Unity 6.5). */
  const sliceOf = (id: KitComponentId, shellH: number) => {
    const shape = st.kitShapes[id] ?? KIT_SHAPE[id] ?? st.cfg.shape;
    const met = silhouetteMeta(shape);
    const capX = Math.max(met ? met.capScale * shellH : shellH * 0.3, shellH * 0.22);
    const capY = Math.min(shellH * 0.42, Math.max(shellH * 0.28, capX * 0.8));
    return {
      left: Math.round((capX + 10) * PNG_SCALE),
      right: Math.round((capX + 10) * PNG_SCALE),
      top: Math.round((capY + 10) * PNG_SCALE),
      bottom: Math.round((capY + 10) * PNG_SCALE),
    };
  };

  /* Two-phase build so progress is REAL: sections enqueue their renders
     (cheap synchronous SVG strings), then one raster loop turns them into
     PNGs with an exact done/total — rasterization is where the time goes,
     and a long silent "Working…" reads as a hang (owner report). */
  const pngQueue: { path: string; svg: string; crop: boolean; meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256"> }[] = [];
  const addPng = (path: string, svg: string, meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256">, crop = false): Promise<void> => {
    // own copy of the slice — call sites share one object across variants,
    // and the post-crop clamp adjusts it per asset
    pngQueue.push({ path, svg, crop, meta: { ...meta, nineSlice: meta.nineSlice ? { ...meta.nineSlice } : null } });
    return Promise.resolve();
  };
  const rasterQueue = async () => {
    const total = pngQueue.length + (catalog ? 1 : 0);
    for (let qi = 0; qi < pngQueue.length; qi++) {
      const q = pngQueue[qi];
      onProgress?.(qi, total, q.path);
      const { bytes, w, h } = q.crop ? await svgToPngBytesTight(q.svg, PNG_SCALE) : await svgToPngBytes(q.svg, PNG_SCALE);
      // Last line of defence: whatever the cap math says, borders must leave
      // a real center strip or engines render nothing. Scale down to fit.
      const s = q.meta.nineSlice;
      if (s) {
        const fx = (w - 12) / (s.left + s.right), fy = (h - 12) / (s.top + s.bottom);
        if (fx < 1) { s.left = Math.max(1, Math.floor(s.left * fx)); s.right = Math.max(1, Math.floor(s.right * fx)); }
        if (fy < 1) { s.top = Math.max(1, Math.floor(s.top * fy)); s.bottom = Math.max(1, Math.floor(s.bottom * fy)); }
      }
      files.push({ path: `assets/${q.path}`, data: bytes });
      manifest.push({ file: `assets/${q.path}`, nativeW: w, nativeH: h, sha256: await sha256Hex(bytes), ...q.meta });
    }
    onProgress?.(pngQueue.length, total, catalog ? "catalog" : "zip");
  };

  /* ── tier scope: the free STARTER is three pieces that together demo
     states, nine-slice stretch and the overwrite restyle (spec §1) —
     master button + chip here, progress track/fill below. Everything else
     renders only for the paid full kit. Paths are IDENTICAL in both
     scopes, so an upgrade lands the full kit over the starter in place. */
  const full = st.scope === "full";
  const FREE_NINE = new Set<KitComponentId>(["primary", "chip"]);
  /* the slug becomes a zip path segment in end users' projects — re-apply
     the canonical shape at USE time so nothing traversal-shaped can ride
     in from a poisoned project doc or share link, wherever it was minted */
  const safeSlug = sanitizeUnitySlug(st.slug) ?? "ui-kit";
  // rarity ladder — rendered as frames only in the full kit, but declared
  // here because the manifest's rarity block (full-gated) also reads it
  const tiersR = rarityTiers(st.cfg);

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
    if (!full && !FREE_NINE.has(n.id)) continue;
    const rowOpts = n.id === "datarow" ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never } : {};
    const fullSvg = shell(n.id, rowOpts, slim);
    const slice = sliceOf(n.id, n.h);
    await addPng(`${n.family}/base.9.png`, fullSvg,
      { component: n.family, part: "base", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: n.usage }, true);
    const flatSvg = shell(n.id, rowOpts, (c) => { slim(c); flat(c); });
    await addPng(`${n.family}/base-flat.9.png`, flatSvg,
      { component: n.family, part: "base-flat", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Flat variant (no gloss/specular/pattern) — tint freely or layer your own effects above it." }, true);
    /* interactive pieces ship their DESIGNED states for engine Sprite Swap —
       generic color-tint transitions never match the kit's own recipes */
    if (["primary", "secondary", "small", "chip", "tab", "slot", "datarow"].includes(n.id)) {
      const SWAP: Record<string, string> = { hover: "Highlighted (and Selected)", pressed: "Pressed", disabled: "Disabled" };
      for (const stName of ["hover", "pressed", "disabled"] as const) {
        await addPng(`${n.family}/base-${stName}.9.png`, stateShell(n.id, stName, rowOpts),
          { component: n.family, part: `base-${stName}`, nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `The kit's designed ${stName} state — Sprite Swap slot: ${SWAP[stName]}. Same nine-slice as base. Glow and lift stay engine-composed (fx/glow.png, a small translate).` }, true);
      }
    }
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
  if (full) {
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
  for (let i = 0; i < tiersR.length; i++) {
    await addPng(`rarityframe/${slugR(tiersR[i].name)}.png`, shell("rarityframe", { overlay: "frame" }, undefined, i / (tiersR.length - 1)),
      { component: "rarityframe", part: slugR(tiersR[i].name), nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `Item frame, ${tiersR[i].name} tier — aura pre-tinted ${tiersR[i].c}. Drop the item icon in the well; the tier word is live engine text (see manifest > rarity).` });
  }
  {
    const ltSvg = shell("loottag", { overlay: "frame" }, slim);
    await addPng("loottag/base.9.png", ltSvg,
      { component: "loottag", part: "base", nineSlice: sliceOf("loottag", 92), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Loot-tag plate, bare. Stripe = a rounded rect tinted to the tier color; item name and tier word are live engine text (colors in manifest > rarity)." }, true);
  }

  /* ── dropdown: closed shell, menu plate, and the two row overlays.
     A row's DEFAULT face needs no asset (it's live text on the plate);
     what the engine needs are the two emphasis layers — the hover bar
     and the selected check — as swappable pieces. The bar is this kit's
     Hover recipe made into an asset: the hover state's aura color at the
     hover glow dial's strength. */
  {
    const ddSvg = shell("dropdown", {}, slim);
    await addPng("dropdown/base.9.png", ddSvg,
      { component: "dropdown", part: "base", nineSlice: sliceOf("dropdown", 110), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Closed dropdown shell. The value text and chevron are live engine content." }, true);
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
    const lbSvg = shell("leaderboard", { part: "base" }, slim);
    await addPng("leaderboard/base.9.png", lbSvg, { component: "leaderboard", part: "base", nineSlice: sliceOf("leaderboard", 250), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Position-list panel. Heading, rows and the highlighted player row are live engine content." }, true);
  }
  {
    const lpSvg = shell("laptimes", { part: "base" }, slim);
    await addPng("laptimes/base.9.png", lpSvg, { component: "laptimes", part: "base", nineSlice: sliceOf("laptimes", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Lap-comparison panel. Traces, legend and delta are live engine content." }, true);
    const tmSvg = shell("telemetry", { part: "base" }, slim);
    await addPng("telemetry/base.9.png", tmSvg, { component: "telemetry", part: "base", nineSlice: sliceOf("telemetry", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Telemetry panel. Throttle/brake/speed traces are live engine content." }, true);
  }
  await addPng("startlights/base.png", shell("startlights", { part: "base" }), { component: "startlights", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Start-light gantry, all pods dark. Light the pods with tinted circles (alarm red) from the engine's countdown." });
  } // full scope

  /* ── shared FX blobs — engines compose their own shadows/glows ── */
  const blob = (color: string, opacity: number) =>
    svgWrap(256, 256, `<defs><radialGradient id="g"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="126" fill="url(#g)"/>`);
  await addPng("fx/drop-shadow.png", blob("#04070E", 0.55), { component: "fx", part: "drop-shadow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Soft shadow blob — scale/flatten under any piece." });
  await addPng("fx/glow.png", blob("#FFFFFF", 0.85), { component: "fx", part: "glow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Radial glow blob — tint to the Glow role for auras and pulses." });

  /* ── tintable white icon set (engine swaps freely) ────────────── */
  if (full) for (const [name, def] of Object.entries(STOCK_ICONS)) {
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
      /* I1 — the slug is this kit's permanent identity in the user's
         project; the importer files everything under it and re-exports
         land on the same paths, so placed UI restyles instead of breaking */
      slug: safeSlug,
      kitVersion: st.kitVersion,
      generatorVersion: typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__ : "dev",
      tier: st.scope,
      exported: new Date().toISOString(),
      pngScale: PNG_SCALE,
      rules: [
        "Nothing replaceable is baked: labels, numbers, values, avatars and swappable icons are live engine content.",
        "Nine-slice assets stretch only their center region; margins below are in PNG pixels at pngScale.",
        "Nine-slice bases are cropped tight to the geometry — no shadow/glow padding baked in. Compose glows and shadows in-engine (fx/drop-shadow.png, fx/glow.png, the states recipe).",
        "base.9.png = full material (gloss baked); base-flat.9.png = tintable flat variant for independent effects.",
        "Progress = track + fill; slider = track + fill + thumb; toggle = track + thumb; buttons = base + engine text + separate icon.",
        "Rarity: drive the displayed tier from your item data. rarityframe/ ships one pre-tinted frame per tier; the rarity block below carries the tier names and colors for stripes, tier words and glows.",
        "States: interactive pieces ship base-hover/base-pressed/base-disabled — the kit's designed states, same nine-slice as base. Sprite Swap them; hover glow and press lift stay engine-composed.",
      ],
      typography: {
        font: st.cfg.type.font,
        source: `https://fonts.google.com/specimen/${encodeURIComponent(st.cfg.type.font).replace(/%20/g, "+")}`,
        googleFontsQuery: fdef?.css ?? null,
        note: "Render all labels as live engine text in this face.",
      },
      palette: { bevel: bevelC, glow: glowC, innerFill: innerC, well: wellC, highlight: base.effects.Highlight ?? "#FFFFFF", shadow: base.effects.Shadow ?? darken(bevelC, 0.5) },
      ...(full ? {
        rarity: {
          note: "This kit's five-tier ladder, lowest to highest — names and colors are the maker's own (custom edits included). Pick the tier from your item data: frame = assets/rarityframe/<tier>.png, stripe/glow/tier-word color = the tier's color, tier word = live engine text.",
          tiers: tiersR.map((t, i) => ({ index: i, name: t.name, color: t.c })),
        },
      } : {}),
      assets: manifest,
    }, null, 2),
  });

  /* ── Unity: the importer IS the product's second half. It applies
     borders/pivots idempotently, keeps the I1–I5 overwrite contract, and
     GENERATES wired example prefabs on first import (a text prefab cannot
     carry sprite GUIDs, so the old drag-the-sprite examples are gone —
     the importer builds real ones with real references instead). ── */
  files.push({ path: "UNITY-README.md", data: unityReadme(st) });
  files.push({ path: "Editor/PatternBreakKitImporter.cs", data: UNITY_IMPORTER });

  /* ── Unreal: UMG recipes with this kit's real margins (full kit) ── */
  if (full) {
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
  }

  /* ── OPTIONAL packed atlas — produced last, catalog only ──────── */
  if (full && catalog) {
    const cat = await catalog().catch(() => null);
    if (cat) files.push({ path: "atlas/catalog.png", data: cat });
    files.push({ path: "atlas/README.md", data: "The packed sheet is a VISUAL CATALOG for humans.\nDo not slice it for engine use — build from /assets and kit-manifest.json instead.\n" });
    onProgress?.(pngQueue.length + 1, pngQueue.length + 1, "zip");
  }

  /* paperwork — the recipe by hand, the machine file, the font terms */
  files.push({ path: "README.md", data: kitSpecMarkdown(st.cfg, st.kitName) + "\n" + fontNotesMarkdown(kitFontFamilies(st.cfg)) });
  files.push({ path: "settings.json", data: JSON.stringify(st.cfg, null, 2) });
  if (licence) files.push({ path: "LICENCE.txt", data: licence });

  /* ── I1: everything lives under UIKitMaker/<slug>/ INSIDE the zip, so
     "extract into Assets/" is the whole install — and extracting a later
     export over the same spot is the whole update. .meta files (Unity's
     identity records) live beside each file and are never in the zip, so
     GUIDs survive every overwrite and placed UI restyles in place. ── */
  /* the importer ships OUTSIDE the slug folder — one shared copy at
     UIKitMaker/Editor/ serving every kit. Per-slug copies would compile
     duplicate PatternBreak types into Assembly-CSharp-Editor the moment a
     user installs a second kit (CS0101 — the whole editor assembly dies).
     Its content is kit-independent, so every kit's zip overwrites the same
     file byte-for-byte, and Apply() already walks ALL manifests. */
  const rooted = files.map((f) => ({
    ...f,
    path: f.path === "Editor/PatternBreakKitImporter.cs"
      ? `UIKitMaker/${f.path}`
      : `UIKitMaker/${safeSlug}/${f.path}`,
  }));
  download(`${safeSlug}-engine-kit.zip`, makeZip(rooted));
}

/* The 3-step story, tuned per scope — ease of use is the product. */
function unityReadme(st: EngineExportState): string {
  const root = `Assets/UIKitMaker/${sanitizeUnitySlug(st.slug) ?? "ui-kit"}`;
  return `# ${st.kitName} — Unity, in 3 steps

1. Unzip this download.
2. Drag the **UIKitMaker** folder into your Unity project's **Assets/**
   folder (or extract it straight there).
3. That's it. Unity imports everything by itself: every sprite arrives
   nine-sliced with the right pivots and pixels-per-unit, and ready-made
   prefabs are BUILT FOR YOU in **${root}/Prefabs** — drag one into your
   Canvas and press Play. The Console prints a one-line receipt of what
   happened.

## Where are the prefabs? (they're not in this zip — on purpose)

A prefab file can only reference sprites through the identity (GUID) that
YOUR Unity assigns each PNG at import. A prefab shipped inside a zip
would therefore arrive with every sprite slot empty — the old
drag-it-yourself experience. So the importer builds them INSIDE your
project instead, seconds after the drop, already wired: sliced sprites,
the kit's hover/pressed/disabled states on the Button, a label. Look in
**${root}/Prefabs** once the Console receipt appears. They're generated
once and never touched again — edit them freely.

## Restyling everything you've placed (the one rule)

When you change the kit on uikitmaker.com, download again and extract
over the SAME spot. Same folder in, same files over — every button, bar
and chip you already placed in your scenes restyles in place. Unity
tracks each sprite through a .meta file that lives beside it in your
project; the zip never contains .meta files, so overwriting a PNG keeps
its identity and nothing you built ever breaks.

The importer keeps four promises on every re-import:
- **Nothing is deleted without you.** Pieces removed from the kit stay on
  disk and are listed in the Console; Tools > PatternBreak > Review
  Orphaned Kit Files removes them only when you say so.
- **Unchanged files cost nothing.** The receipt (kit.lock.json) carries a
  hash per sprite, so a re-import reports exactly what's new, what
  restyled and what stayed put — and settings are only re-applied when
  they actually differ.
- **Your prefabs are yours.** The examples in Prefabs/ are generated once,
  on first import, fully wired (sliced sprites, hover/pressed/disabled
  states on the Button, a label). After that the importer never touches
  them — and because your re-exports keep the same sprite files, prefabs
  you've customized restyle automatically anyway.
- **Everything is inspectable.** kit-manifest.json holds every border,
  pivot and hash in plain JSON; kit.lock.json is the last import's
  receipt. No hidden state.

## Labels and fonts

Labels are LIVE TEXT, never pixels. The generated prefabs use Unity's
built-in font so they work in any project; the kit's real face is named
in kit-manifest.json > typography (with its Google Fonts link) — install
it and swap it on the Text, or use TextMeshPro with the same family.

## States

Interactive pieces ship their DESIGNED states (base-hover / base-pressed /
base-disabled next to base). The generated Button prefabs arrive with
Sprite Swap already wired. Hover glow and press lift are engine-side:
tint fx/glow.png behind a piece, nudge the RectTransform a few px.
${st.scope === "free" ? `
## This is the free starter kit

Three pieces — the master button, a chip and the progress bar — with the
complete import pipeline: nine-slice, states, wired prefabs and in-place
restyling all work exactly as they do in the full kit. Upgrading at
uikitmaker.com/#/pricing and re-exporting lands EVERY component in this
same folder — everything you've already placed stays put.
` : ""}
## If something looks unsliced

Tools > PatternBreak > Reapply Kit Import Settings re-runs the pass and
says exactly what it fixed. Everything the importer does is plain data
you could set by hand from kit-manifest.json — the script only saves you
the typing.
`;
}

/* eslint-disable no-useless-escape */
const UNITY_IMPORTER = `// UI Kit Maker / PatternBreak — kit importer. Editor-only; nothing here
// ships into your game build.
//
// THE OVERWRITE CONTRACT this file keeps (extract a newer export over the
// same folder and everything you placed restyles in place):
//  I1  stable addresses — the kit lives at Assets/UIKitMaker/<slug>/ with
//      deterministic sprite paths; re-exports land on the same paths.
//  I2  write over, never delete-and-recreate — newer exports replace bytes
//      in place; .meta files (and so GUIDs) survive, scenes keep pointing
//      at the same assets. The manifest carries a sha256 per sprite so the
//      receipt reports new / restyled / unchanged exactly.
//  I3  nothing disappears silently — pieces removed from the kit stay on
//      disk, are listed loudly, and are deleted only from the explicit
//      Tools > PatternBreak > Review Orphaned Kit Files action.
//  I4  idempotent settings — import settings are applied only when they
//      differ, so repeat imports don't churn the asset database.
//  I5  prefabs generate once — wired examples are created on FIRST import
//      only and never regenerated over files you may have edited.
// Each pass writes kit.lock.json — the receipt behind the report, orphan
// detection and support.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  [Serializable] class PBSlice { public int left, right, top, bottom; }
  [Serializable] class PBPivot { public float x = 0.5f, y = 0.5f; }
  [Serializable] class PBAsset { public string file; public string sha256; public PBSlice nineSlice; public PBPivot pivot; }
  [Serializable] class PBManifest { public string kit; public string slug; public int kitVersion; public string tier; public int pngScale; public PBAsset[] assets; }
  [Serializable] class PBLockEntry { public string file; public string sha256; }
  [Serializable] class PBLock { public string slug; public int kitVersion; public string imported; public bool prefabsGenerated; public PBLockEntry[] files; public string[] orphans; }

  public static class KitImporter {
    /* ── I4: every setting is compared before it is written; the return
       value says whether a reimport is needed at all. INTERNAL, not
       public: PBAsset is assembly-internal, and a public signature over
       an internal type is CS0051 — the whole editor assembly would fail
       to compile and the importer would never run. ── */
    internal static bool Configure(TextureImporter ti, PBAsset a) {
      bool changed = false;
      if (ti.textureType != TextureImporterType.Sprite) { ti.textureType = TextureImporterType.Sprite; changed = true; }
      if (ti.spriteImportMode != SpriteImportMode.Single) { ti.spriteImportMode = SpriteImportMode.Single; changed = true; }
      if (ti.mipmapEnabled) { ti.mipmapEnabled = false; changed = true; }
      if (!ti.alphaIsTransparency) { ti.alphaIsTransparency = true; changed = true; }
      var settings = new TextureImporterSettings();
      ti.ReadTextureSettings(settings);
      var pivot = new Vector2(a.pivot != null ? a.pivot.x : 0.5f, a.pivot != null ? a.pivot.y : 0.5f);
      // art ships at 2x resolution: PPU 200 lands every piece at DESIGN
      // size, so caps keep their designed thickness at any rect size
      if (settings.spriteAlignment != (int)SpriteAlignment.Custom || settings.spritePivot != pivot || settings.spritePixelsPerUnit != 200f) {
        settings.spriteAlignment = (int)SpriteAlignment.Custom;
        settings.spritePivot = pivot;
        settings.spritePixelsPerUnit = 200f;
        ti.SetTextureSettings(settings);
        changed = true;
      }
      if (a.nineSlice != null && (a.nineSlice.left + a.nineSlice.right + a.nineSlice.top + a.nineSlice.bottom) > 0) {
        var border = new Vector4(a.nineSlice.left, a.nineSlice.bottom, a.nineSlice.right, a.nineSlice.top);
        if (ti.spriteBorder != border) { ti.spriteBorder = border; changed = true; }
      }
      return changed;
    }

    [MenuItem("Tools/PatternBreak/Reapply Kit Import Settings")]
    public static void Apply() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project. Drop the whole UIKitMaker folder from the export zip into Assets/ and the import runs by itself.");
        return;
      }
      foreach (var guid in manifests) ImportKit(AssetDatabase.GUIDToAssetPath(guid));
    }

    static void ImportKit(string mPath) {
      var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
      PBManifest manifest = null;
      try { manifest = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
      if (manifest == null || manifest.assets == null || manifest.assets.Length == 0) {
        Debug.LogWarning("UI Kit Maker: " + mPath + " has no asset list — is it the kit-manifest.json from the export zip?");
        return;
      }

      // the previous receipt, if any — its absence means FIRST import
      var lockPath = root + "/kit.lock.json";
      PBLock prev = null;
      if (File.Exists(lockPath)) {
        try { prev = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { prev = null; }
      }
      var prevHash = new Dictionary<string, string>();
      if (prev != null && prev.files != null)
        foreach (var f in prev.files) if (f != null && !string.IsNullOrEmpty(f.file)) prevHash[f.file] = f.sha256;

      int applied = 0, already = 0, missing = 0, fresh = 0, restyled = 0, same = 0;
      try {
        AssetDatabase.StartAssetEditing();
        foreach (var a in manifest.assets) {
          var ti = AssetImporter.GetAtPath(root + "/" + a.file) as TextureImporter;
          if (ti == null) { missing++; continue; }
          if (Configure(ti, a)) { ti.SaveAndReimport(); applied++; } else { already++; }
          string was;
          if (prev == null || !prevHash.TryGetValue(a.file, out was)) fresh++;
          else if (was != a.sha256) restyled++;
          else same++;
        }
      } finally {
        AssetDatabase.StopAssetEditing();
      }

      /* ── I3: anything the last receipt knew that this manifest dropped
         stays on disk and gets named — deletion is a human's click ── */
      var inManifest = new HashSet<string>();
      foreach (var a in manifest.assets) inManifest.Add(a.file);
      var orphans = new List<string>();
      if (prev != null && prev.files != null)
        foreach (var f in prev.files)
          if (f != null && !string.IsNullOrEmpty(f.file) && !inManifest.Contains(f.file) && File.Exists(root + "/" + f.file))
            orphans.Add(f.file);
      if (prev != null && prev.orphans != null)
        foreach (var o in prev.orphans)
          if (!string.IsNullOrEmpty(o) && !inManifest.Contains(o) && !orphans.Contains(o) && File.Exists(root + "/" + o))
            orphans.Add(o);

      /* ── I5: examples appear once, fully wired, then are yours ── */
      bool prefabsReady = (prev != null && prev.prefabsGenerated) || AssetDatabase.IsValidFolder(root + "/Prefabs");
      bool prefabsNew = false;
      if (!prefabsReady) { prefabsNew = GeneratePrefabs(root, manifest); prefabsReady = prefabsNew; }

      // ── the receipt ──
      var receipt = new PBLock();
      receipt.slug = manifest.slug;
      receipt.kitVersion = manifest.kitVersion;
      receipt.imported = DateTime.UtcNow.ToString("o");
      receipt.prefabsGenerated = prefabsReady;
      var entries = new List<PBLockEntry>();
      foreach (var a in manifest.assets) { var e = new PBLockEntry(); e.file = a.file; e.sha256 = a.sha256; entries.Add(e); }
      receipt.files = entries.ToArray();
      receipt.orphans = orphans.ToArray();
      File.WriteAllText(lockPath, JsonUtility.ToJson(receipt, true));

      var kitName = string.IsNullOrEmpty(manifest.kit) ? (string.IsNullOrEmpty(manifest.slug) ? "kit" : manifest.slug) : manifest.kit;
      var line = "UI Kit Maker — '" + kitName + "'" + (manifest.kitVersion > 0 ? " v" + manifest.kitVersion : "")
        + (prev == null ? " imported: " : " updated: ") + manifest.assets.Length + " sprites ("
        + (prev == null ? fresh + " new" : fresh + " new, " + restyled + " restyled, " + same + " unchanged")
        + "; settings: " + applied + " applied, " + already + " already right)."
        + (prefabsNew ? " Wired prefabs are ready in " + root + "/Prefabs — drag one into your Canvas." : "");
      if (orphans.Count > 0)
        Debug.LogWarning(line + "\\n" + orphans.Count + " piece(s) are no longer part of this kit but STAY on disk (nothing is deleted without you): "
          + string.Join(", ", orphans.ToArray())
          + "\\nRemove them via Tools > PatternBreak > Review Orphaned Kit Files.");
      else
        Debug.Log(line);
      if (missing > 0)
        Debug.LogWarning("UI Kit Maker: " + missing + " sprites named in " + mPath + " were not found on disk — keep the export's assets folder next to kit-manifest.json, named exactly 'assets'.");
    }

    /* ── I3's explicit hand: review and remove, never automatic ── */
    [MenuItem("Tools/PatternBreak/Review Orphaned Kit Files")]
    public static void ReviewOrphans() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      var all = new List<string>();
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        var lockPath = root + "/kit.lock.json";
        if (!File.Exists(lockPath)) continue;
        PBLock rec = null;
        try { rec = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { continue; }
        if (rec == null || rec.orphans == null) continue;
        foreach (var o in rec.orphans)
          if (!string.IsNullOrEmpty(o) && File.Exists(root + "/" + o)) all.Add(root + "/" + o);
      }
      if (all.Count == 0) {
        EditorUtility.DisplayDialog("UI Kit Maker", "No orphaned kit files — every sprite on disk is part of the current kit.", "Nice");
        return;
      }
      var listing = string.Join("\\n", all.ToArray());
      if (EditorUtility.DisplayDialog("UI Kit Maker — orphaned kit files",
        "These " + all.Count + " file(s) were part of an earlier version of the kit and are no longer in it. They are safe to remove IF nothing in your scenes still uses them.\\n\\n" + listing,
        "Remove them", "Keep everything")) {
        foreach (var p in all) AssetDatabase.DeleteAsset(p);
        Debug.Log("UI Kit Maker: removed " + all.Count + " orphaned file(s).");
      }
    }

    /* ── generated examples — REAL sprite references (a text prefab can
       never carry the GUIDs your Unity mints at import; building them
       here, after import, is what makes them arrive wired) ── */
    static Sprite S(string path) { return AssetDatabase.LoadAssetAtPath<Sprite>(path); }
    static Font BuiltinFont() {
      try { var f = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); if (f != null) return f; } catch (Exception) { }
      try { return Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch (Exception) { }
      return null;
    }
    static GameObject ImageObject(string n, Sprite sp, int pngScale) {
      var go = new GameObject(n, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      var img = go.GetComponent<Image>();
      img.sprite = sp;
      img.type = Image.Type.Sliced;
      if (sp != null && pngScale > 0)
        go.GetComponent<RectTransform>().sizeDelta = new Vector2(sp.rect.width / pngScale, sp.rect.height / pngScale);
      return go;
    }
    static void AddLabel(GameObject parent, string text) {
      var go = new GameObject("Label", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      var t = go.GetComponent<Text>();
      t.text = text;
      t.alignment = TextAnchor.MiddleCenter;
      t.fontSize = 40;
      t.color = Color.white;
      t.raycastTarget = false;
      var f = BuiltinFont();
      if (f != null) t.font = f;
      // the kit's REAL face is named in kit-manifest.json > typography —
      // install it (or its TMP asset) and swap it here
    }
    static bool ButtonPrefab(string dir, string root, string family, string goName, string label, int pngScale) {
      var baseSp = S(root + "/assets/" + family + "/base.9.png");
      if (baseSp == null) return false;
      var go = ImageObject(goName, baseSp, pngScale);
      var btn = go.AddComponent<Button>();
      var hover = S(root + "/assets/" + family + "/base-hover.9.png");
      var pressed = S(root + "/assets/" + family + "/base-pressed.9.png");
      var disabled = S(root + "/assets/" + family + "/base-disabled.9.png");
      if (hover != null || pressed != null || disabled != null) {
        btn.transition = Selectable.Transition.SpriteSwap;
        var ss = new SpriteState();
        ss.highlightedSprite = hover;
        ss.selectedSprite = hover;
        ss.pressedSprite = pressed;
        ss.disabledSprite = disabled;
        btn.spriteState = ss;
      }
      AddLabel(go, label);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    static bool ProgressPrefab(string dir, string root, int pngScale) {
      var track = S(root + "/assets/progress/track.9.png");
      if (track == null) return false;
      var go = ImageObject("ProgressBar", track, pngScale);
      var fill = S(root + "/assets/progress/fill.9.png");
      if (fill != null) {
        var f = ImageObject("Fill", fill, pngScale);
        f.transform.SetParent(go.transform, false);
        var rt = f.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0f, 0.5f);
        rt.anchorMax = new Vector2(0f, 0.5f);
        rt.pivot = new Vector2(0f, 0.5f);
        rt.anchoredPosition = new Vector2(2f, 0f);
        // staged at 65% — drive Fill's width from your live value
        rt.sizeDelta = new Vector2((track.rect.width / pngScale) * 0.65f, fill.rect.height / pngScale);
      }
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/ProgressBar.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    static bool GeneratePrefabs(string root, PBManifest m) {
      var pngScale = m.pngScale > 0 ? m.pngScale : 2;
      bool createdHere = false;
      if (!AssetDatabase.IsValidFolder(root + "/Prefabs")) {
        var created = AssetDatabase.CreateFolder(root, "Prefabs");
        if (string.IsNullOrEmpty(created)) return false;
        createdHere = true;
      }
      var dir = root + "/Prefabs";
      bool any = false;
      if (ButtonPrefab(dir, root, "button-primary", "PrimaryButton", "PLAY", pngScale)) any = true;
      if (ButtonPrefab(dir, root, "chip", "Chip", "NEW", pngScale)) any = true;
      if (ProgressPrefab(dir, root, pngScale)) any = true;
      // an EMPTY folder must not latch generation off forever — if nothing
      // landed (sprites missing on a manual run), clean up so the next
      // pass gets its first-import chance
      if (!any && createdHere) AssetDatabase.DeleteAsset(dir);
      return any;
    }
  }

  /* Applies manifest settings to kit textures AS THEY IMPORT — covers
     reimports and asset refreshes without anyone running the menu. */
  class KitTexturePostprocessor : AssetPostprocessor {
    static readonly Dictionary<string, PBManifest> cache = new Dictionary<string, PBManifest>();
    void OnPreprocessTexture() {
      var path = assetPath.Replace("\\\\", "/");
      var i = path.LastIndexOf("/assets/");
      if (i < 0) return;
      var root = path.Substring(0, i);
      var mPath = root + "/kit-manifest.json";
      PBManifest manifest;
      if (!cache.TryGetValue(mPath, out manifest)) {
        // guarded like ImportKit's parse: a half-extracted or malformed
        // manifest must degrade to "no settings yet" (the delayCall pass
        // self-heals), not one red error per kit texture
        try { manifest = File.Exists(mPath) ? JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)) : null; }
        catch (Exception) { manifest = null; }
        cache[mPath] = manifest;
      }
      if (manifest == null || manifest.assets == null) return;
      var rel = path.Substring(root.Length + 1);
      foreach (var a in manifest.assets) {
        if (a.file != rel) continue;
        KitImporter.Configure((TextureImporter)assetImporter, a);
        return;
      }
    }
    /* The manifest arriving (or changing) triggers a full pass — on a fresh
       drop the textures may import before the manifest, so the pass at the
       end of the batch is what makes the first import land configured.
       kit.lock.json is written by the pass itself and deliberately does
       NOT retrigger it. */
    static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom) {
      foreach (var p in imported) {
        if (!p.EndsWith("kit-manifest.json")) continue;
        cache.Clear();
        EditorApplication.delayCall += KitImporter.Apply;
        return;
      }
    }
  }
}
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
