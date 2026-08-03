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
import { renderKit, rarityTiers, textPatternCell, renderTypeSpecimen } from "./bevel";
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

/* ── the kit's faces ship WITH the kit (spec-blessed: OFL/Apache/UFL faces
   travel with their license file, or not at all) — so generated prefab
   labels speak the right font with zero user steps. TTFs come from the
   google/fonts repo at export time; ANY failure degrades to the manifest's
   Google Fonts link and never blocks the export. */
async function fetchKitFont(family: string): Promise<{ file: string; bytes: Uint8Array; licenceName: string; licenceText: string } | null> {
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!slug) return null;
  for (const dir of ["ofl", "apache", "ufl"]) {
    try {
      const res = await fetch(`https://api.github.com/repos/google/fonts/contents/${dir}/${slug}`);
      if (!res.ok) continue;
      const listing = (await res.json()) as { name: string; type: string; download_url: string | null }[];
      if (!Array.isArray(listing)) continue;
      const ttfs = listing.filter((f) => f.type === "file" && /\.ttf$/i.test(f.name) && f.download_url);
      // prefer the static Regular; variable faces ([wght]) are the usual fallback
      const pick = ttfs.find((f) => /-Regular\.ttf$/i.test(f.name)) ?? ttfs.find((f) => f.name.includes("[")) ?? ttfs[0];
      const lic = listing.find((f) => f.type === "file" && /^(OFL\.txt|LICEN[CS]E\.txt|UFL\.txt)$/i.test(f.name) && f.download_url);
      if (!pick?.download_url || !lic?.download_url) continue; // no license file, no binary
      const [fontRes, licRes] = await Promise.all([fetch(pick.download_url), fetch(lic.download_url)]);
      if (!fontRes.ok || !licRes.ok) continue;
      return {
        file: pick.name,
        bytes: new Uint8Array(await fontRes.arrayBuffer()),
        licenceName: lic.name,
        licenceText: await licRes.text(),
      };
    } catch { /* try the next collection */ }
  }
  return null;
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

  /* ── fonts: ship the kit's faces with their licenses ──────────── */
  onProgress?.(pngQueue.length, pngQueue.length + 1, "fonts");
  const famList = [...new Set([st.cfg.type.font, ...(st.cfg.type.listFont ? [st.cfg.type.listFont] : [])])].slice(0, 4);
  let primaryFontFile: string | null = null;
  for (const fam of famList) {
    const got = await fetchKitFont(fam).catch(() => null);
    if (!got) continue;
    const famSlug = fam.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    files.push({ path: `fonts/${got.file}`, data: got.bytes });
    files.push({ path: `fonts/${famSlug}-${got.licenceName}`, data: got.licenceText });
    if (fam === st.cfg.type.font) primaryFontFile = `fonts/${got.file}`;
  }

  /* ── the letterform pattern, as a LIVE-TEXT tile: the app's own rotated
     <pattern> rasterized onto an opaque white ground (TMP's face texture
     MULTIPLIES the face color, so white = untouched fill, pattern strokes
     darken through) — the importer feeds it to the SDF shader's Face
     Texture slot. The kit's angle is snapped to the nearest 45°: those are
     the only rotations where a square window tiles seamlessly (diagonals
     wrap over cell·√2 — lattice vectors v1−v2 and v1+v2 land back on the
     axes). The window is sized so the wrap is exact, then the cell is
     re-derived from it. ── */
  let patternFile: string | null = null;
  let patternAngle = 0;
  let patternReps = 0;
  if (base.type.stripes?.on) {
    const scaleF = Math.max(0.25, Math.min(4, (base.type.stripes.scale ?? 100) / 100));
    patternAngle = ((Math.round((base.type.stripes.angle ?? 45) / 45) * 45) % 180 + 180) % 180;
    const diag = patternAngle % 90 === 45;
    const W = Math.max(8, Math.round(64 * scaleF * (diag ? Math.SQRT2 : 1)));
    const pcell = diag ? W / Math.SQRT2 : W;
    const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` +
      `<rect width="${W}" height="${W}" fill="#FFFFFF"/>` +
      `<defs><pattern id="pbt" width="${pcell.toFixed(4)}" height="${pcell.toFixed(4)}" patternUnits="userSpaceOnUse"${patternAngle ? ` patternTransform="rotate(${patternAngle})"` : ""}>${textPatternCell(base.type.stripes.style ?? "stripes", pcell, darken(bevelC, 0.25))}</pattern></defs>` +
      `<rect width="${W}" height="${W}" fill="url(#pbt)" opacity="${Math.max(0, Math.min(1, (base.type.stripes.opacity ?? 30) / 100)).toFixed(2)}"/></svg>`;
    const tileBytes = (await svgToPngBytes(tile, 2)).bytes;
    files.push({ path: "fonts/face-pattern.png", data: tileBytes });
    patternFile = "fonts/face-pattern.png";
    /* the density the importer should tile at: the app draws cells of
       fontSize·0.3·scale, i.e. 3.33/scale cells per em; prefab labels map
       the texture across the whole line (~2.2em for the shipped PLAY-length
       words), and a diagonal window holds √2 cells per axis */
    patternReps = Math.min(32, Math.max(1, 7.33 / scaleF / (diag ? Math.SQRT2 : 1)));
  }

  /* ── the BAKED ALPHABET FACE (owner-promoted): every glyph rendered by
     the app's own type engine — pattern, glints, gloss, the whole
     treatment — packed into a color font atlas. The importer assembles a
     TextMeshPro font asset from it, so Unity types hero text with the
     app's exact pixels. The SDF face stays the length-proof workhorse;
     this is the showpiece for display text. ── */
  let bakedFace: { file: string; metrics: string; pointSize: number } | null = null;
  try {
    const baked = await bakeAlphabetFace(base);
    if (baked) {
      files.push({ path: "fonts/kitface-baked.png", data: baked.png });
      files.push({ path: "fonts/kitface-baked.json", data: new TextEncoder().encode(baked.metrics) });
      bakedFace = { file: "fonts/kitface-baked.png", metrics: "fonts/kitface-baked.json", pointSize: baked.pointSize };
    }
  } catch (e) {
    console.warn("engine export: alphabet face bake failed — kit ships without it", e);
  }

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
        /* the shipped TTF (with its license beside it) — the importer wires
           generated prefab labels to it; null = fetch failed at export
           time, fall back to the source link above */
        fontFile: primaryFontFile,
        /* the styled-text recipe — enough numbers to rebuild the kit's
           display treatment as a TextMeshPro material preset: face fill
           (or vertex gradient), outline, and glow/underlay */
        style: {
          weight: base.type.weight,
          italic: base.type.italic,
          spacingEmPct: base.type.spacing,
          case: base.type.case,
          fillMode: base.type.fillMode,
          fill: base.type.fill,
          fill2: base.type.fillMode === "gradient" ? base.type.fill2 : null,
          fillOpacity: base.type.fillOpacity ?? 100,
          outline: base.type.outline.on ? { color: base.type.outline.color, color2: base.type.outline.color2, width: base.type.outline.width } : null,
          glow: base.type.glow.on ? { color: base.type.glow.color, size: base.type.glow.size, opacity: base.type.glow.opacity } : null,
          shadow: base.type.shadow.on ? { color: base.type.shadow.color, x: base.type.shadow.x, y: base.type.shadow.y, blur: base.type.shadow.blur, opacity: base.type.shadow.opacity } : null,
          /* the deeper layers — TMP's full Distance Field shader carries
             them as bevel lighting and a face texture */
          emboss: base.type.emboss.on ? { strength: base.type.emboss.strength, distance: base.type.emboss.distance, softness: base.type.emboss.softness } : null,
          lightAngle: base.lighting.angle,
          pattern: patternFile ? { file: patternFile, style: base.type.stripes?.style ?? "stripes", scale: base.type.stripes?.scale ?? 100, angle: patternAngle, reps: Math.round(patternReps * 100) / 100 } : null,
        },
        /* the baked color font — atlas + metrics the importer assembles
           into "KitFace Baked": app-exact glyphs for hero/display text */
        bakedFace,
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
  files.push({ path: "UNITY-README.md", data: unityReadme(st, !!primaryFontFile, bakedFace != null) });
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

/* ── the alphabet bake ──────────────────────────────────────────────
   Self-calibrating: an ink-only "H" (all fx stripped) pins where the pen
   and baseline sit in specimen coordinates; canvas measureText supplies
   the font-true advances; then every glyph renders with the FULL
   treatment and its art box is placed relative to that pen. No guessing
   about effect bleed — the calibration render IS the reference. */
const BAKE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:;%+-'&()";
const BAKE_S = 3; // raster scale over the 52px specimen em → 156px baked em

async function rasterInk(svg: string, scale: number): Promise<{ cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let yy = 0; yy < cv.height; yy++)
    for (let xx = 0; xx < cv.width; xx++)
      if (px[(yy * cv.width + xx) * 4 + 3] > 8) {
        if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
      }
  if (x1 < 0) return null; // nothing opaque (space)
  return { cv, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function bakeAlphabetFace(base: GenConfig): Promise<{ png: Uint8Array; metrics: string; pointSize: number } | null> {
  const family = base.type.font;
  const weight = base.type.weight;
  const italicPfx = base.type.italic ? "italic " : "";
  const fontStr = `${italicPfx}${weight} 52px "${family}"`;
  try { await document.fonts.load(fontStr); } catch { /* measure with what's there */ }
  const mcv = document.createElement("canvas");
  const mx = mcv.getContext("2d")!;
  mx.font = fontStr;
  const fmRef = mx.measureText("Hg");
  const ascent = (fmRef.fontBoundingBoxAscent ?? 41) * BAKE_S;
  const descent = (fmRef.fontBoundingBoxDescent ?? 11) * BAKE_S;

  // calibration: ink-only H → pen x and baseline y in raster coordinates
  const strip = (c: GenConfig) => {
    c.type.size = 52;
    c.type.outline.on = false; c.type.shadow.on = false;
    c.type.glow.on = false; c.type.emboss.on = false;
    c.type.stripes = undefined; c.type.glints = undefined;
  };
  const calBox = await rasterInk(renderTypeSpecimen(base, "H", { keepCase: true, highlight: "", mutate: strip }), BAKE_S);
  if (!calBox) return null;
  const hMet = mx.measureText("H");
  const penX = calBox.x0 + (hMet.actualBoundingBoxLeft ?? 0) * BAKE_S;
  const baseY = calBox.y0 + (hMet.actualBoundingBoxAscent ?? ascent / BAKE_S) * BAKE_S;

  type Baked = { u: number; adv: number; bx: number; by: number; w: number; h: number; cv?: HTMLCanvasElement; sx?: number; sy?: number; x?: number; y?: number };
  const glyphs: Baked[] = [];
  const spacingPx = 52 * ((base.type.spacing ?? 0) / 100) * BAKE_S;
  for (const ch of BAKE_GLYPHS + " ") {
    const adv = mx.measureText(ch).width * BAKE_S + spacingPx;
    if (ch === " ") { glyphs.push({ u: 32, adv, bx: 0, by: 0, w: 0, h: 0 }); continue; }
    const box = await rasterInk(
      renderTypeSpecimen(base, ch, { keepCase: true, highlight: "", mutate: (c) => { c.type.size = 52; } }),
      BAKE_S,
    );
    if (!box) continue; // a face without this glyph — skip, TMP falls back
    glyphs.push({
      u: ch.codePointAt(0)!, adv,
      bx: box.x0 - penX, by: baseY - box.y0,
      w: box.w, h: box.h, cv: box.cv, sx: box.x0, sy: box.y0,
    });
  }
  if (glyphs.length < 10) return null; // face never loaded — don't ship garbage

  // shelf-pack into a 2048-wide atlas, tallest first for tight rows
  const PAD = 2;
  const order = glyphs.filter((g) => g.w > 0).sort((a, b) => b.h - a.h);
  const AW = 2048;
  let cx = PAD, cy = PAD, rowH = 0;
  for (const g of order) {
    if (cx + g.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
    g.x = cx; g.y = cy;
    cx += g.w + PAD;
    if (g.h > rowH) rowH = g.h;
  }
  const AH = cy + rowH + PAD;
  if (AH > 4096) return null; // absurd treatment size — bail rather than truncate
  const atlas = document.createElement("canvas");
  atlas.width = AW; atlas.height = AH;
  const ax = atlas.getContext("2d")!;
  for (const g of order) ax.drawImage(g.cv!, g.sx!, g.sy!, g.w, g.h, g.x!, g.y!, g.w, g.h);
  const png: Uint8Array = await new Promise((resolve, reject) => {
    atlas.toBlob(async (b) => {
      if (!b) { reject(new Error("atlas raster failed")); return; }
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, "image/png");
  });

  const pointSize = 52 * BAKE_S;
  const metrics = JSON.stringify({
    pointSize,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    lineHeight: Math.round((ascent + descent) * 1.06),
    atlasW: AW, atlasH: AH,
    glyphs: glyphs.map((g) => ({
      u: g.u, x: g.x ?? 0, y: g.y ?? 0, w: g.w, h: g.h,
      bx: Math.round(g.bx * 10) / 10, by: Math.round(g.by * 10) / 10,
      adv: Math.round(g.adv * 10) / 10,
    })),
  });
  return { png, metrics, pointSize };
}

/* The 3-step story, tuned per scope — ease of use is the product. */
function unityReadme(st: EngineExportState, fontShipped: boolean, bakedShipped = false): string {
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
the kit's hover/pressed/disabled states on the Button, a label. ${st.scope === "free"
    ? "The starter generates three (PrimaryButton, Chip, ProgressBar); the full kit generates one per component."
    : "Every component family gets one — buttons, panels, rows, slots, badges and more."}
The Project window highlights **${root}/Prefabs** when they land, right
after the Console receipt. They're generated once and never touched
again — edit them freely.

## Restyling everything you've placed (the one rule)

When you change the kit on uikitmaker.com, download again and extract
over the SAME spot. Same folder in, same files over — every button, bar
and chip you already placed in your scenes restyles in place. Unity
tracks each sprite through a .meta file that lives beside it in your
project; the zip never contains .meta files, so overwriting a PNG keeps
its identity and nothing you built ever breaks.

**On macOS you can't actually "extract over"** — Finder never merges
folders, so a re-drop lands as "UIKitMaker 1". That's fine: drop it into
Assets anyway. The importer notices, moves every file home into
Assets/UIKitMaker (your .meta files and identities untouched), removes
the duplicate folder, and re-imports. Drop updates anywhere; the kit
finds its way.

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

Labels are LIVE TEXT, never pixels. ${fontShipped
    ? `Your kit's face ships in **fonts/** with its open-font license
beside it. On Unity 2023.2+ the importer builds **KitFace SDF** from it
automatically and styles the material with the kit's own type recipe;
prefab labels arrive already wearing it. On older editors labels use the
shipped TTF, and the recipe in kit-manifest.json > typography > style is
ready to become a TMP material preset by hand.`
    : `The kit's face is named in kit-manifest.json > typography with its
Google Fonts link — download the TTF, drop it in the project, and swap
it onto the prefab labels (the export couldn't fetch it automatically
this time). The styled-text recipe lives in typography > style.`}

${bakedShipped ? `### KitFace Baked — hero text in the app's exact pixels

Beside the SDF face, the kit ships a BAKED color font: A–z, 0–9 and
punctuation, every glyph rendered by the app's own engine with the FULL
treatment — pattern, glints and gloss included — assembled on import as
**fonts/KitFace Baked.asset**. For titles, buttons and victory text:
set a label's Font Asset to *KitFace Baked*, keep the label color WHITE,
and leave **Color Gradient OFF** — these glyphs come pre-painted, and a
gradient on top tints them muddy. (The opposite of KitFace SDF, where
Color Gradient IS the paint.) It's raster art — crisp at
and below its baked size, softening far beyond, like any bitmap game
font; the SDF face stays the size-proof workhorse for everything else.
Re-exports re-bake the atlas and Regenerate Example Prefabs reassembles
the font in place, so placed labels restyle with the kit.

` : ""}Hand-made SDF labels start WHITE — the fill is a per-label setting,
not a font setting (prefab labels arrive with it wired). One click fixes
it: on the text, tick **Color Gradient** and set Color Preset to
**KitFace Gradient** (in fonts/) — the kit's own fill, and it restyles
with every re-import. Outline, glow, shadow and bevel are already on the
shared face material.

How the type treatment travels: fill and gradient, outline (outside the
letterform, like the app), glow, drop shadow, and emboss (lit from the
kit's own light angle) translate 1:1 onto live text. The letterform
pattern, glints and per-letter gloss stay OFF live labels on purpose —
a shared text material can't carry them correctly for every label a
game might type. They're exactly what Type Stamps are for; the pattern
also ships as a seamless tile (fonts/face-pattern.png, tiling density
in the manifest's pattern.reps) if you want it in the face material's
Face Texture slot for a specific label.
${st.cfg.type.stripes?.on ? `
### The letterform pattern on ONE label, by hand

The kit ships everything needed; it just doesn't apply it for you,
because the right tiling depends on how long each label is.

1. Select the label (e.g. Prefabs > ButtonPrimary > Label).
2. In the Inspector, open the context menu on the material header
   ("KitFace SDF Material") and choose **Create Material Preset** —
   this label gets its own copy; every other label keeps the shared face.
3. In the preset's **Face** section, drag \`fonts/face-pattern.png\`
   into **Texture**, and set **Tiling** X and Y to the \`reps\` number
   from kit-manifest.json > typography > style > pattern.
4. On the text component, set **Horizontal Mapping** to Line and
   **Vertical Mapping** to Match Aspect — the pattern flows across the
   word with square cells, like the app.
5. Label longer than a word or two? Raise Tiling until the cells match
   the rest of your kit (bigger number = smaller cells).

The tile is seamless and pre-rotated to the kit's pattern angle
(snapped to 45°). It multiplies the face color: the white ground leaves
your fill untouched; the pattern strokes tint through.
` : ""}

For pixel-perfect HERO text — titles, banners, victory moments — use
**Type Stamps** on uikitmaker.com: type your phrases, download, extract
into Assets/ — they land in ${root}/stamps as ready sprites in the full
styled treatment, and re-exports overwrite in place like everything else.

## States — and the press-Play Playground

Interactive pieces ship their DESIGNED states (base-hover / base-pressed /
base-disabled next to base). The generated Button prefabs arrive with
Sprite Swap already wired — nothing to reconnect. Hover glow and press
lift are engine-side: tint fx/glow.png behind a piece, nudge the
RectTransform a few px.

Want to feel the states without wiring anything? Open
**${root}/Playground.unity** (generated on first import) and press Play —
it carries a camera, a raycasting canvas, exactly one EventSystem with
the input module your project actually uses, and the examples placed.
If buttons ever ignore the mouse in your OWN scene, the usual suspects
are a duplicate EventSystem (keep exactly one) or an EventSystem whose
input module doesn't match the project's Active Input Handling.
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
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
#if UNITY_2023_2_OR_NEWER
// TextMeshPro ships inside uGUI from 2023.2 — guaranteed to compile.
// Older editors keep legacy Text labels + the recipe JSON (TMP there is a
// separate package we cannot assume, and a missing namespace would kill
// this whole assembly).
using TMPro;
#endif

namespace PatternBreak {
  [Serializable] class PBSlice { public int left, right, top, bottom; }
  [Serializable] class PBPivot { public float x = 0.5f, y = 0.5f; }
  [Serializable] class PBAsset { public string file; public string component; public string part; public string sha256; public PBSlice nineSlice; public PBPivot pivot; }
  [Serializable] class PBStyleOutline { public string color; public string color2; public float width; }
  [Serializable] class PBStyleGlow { public string color; public float size; public float opacity; }
  [Serializable] class PBStyleShadow { public string color; public float x; public float y; public float blur; public float opacity; }
  [Serializable] class PBStyleEmboss { public float strength; public float distance; public float softness; }
  [Serializable] class PBStylePattern { public string file; public string style; public float scale; public float angle; public float reps; } // angle is already baked into the tile; reps = the app-computed tiling density
  [Serializable] class PBStyle { public int weight; public bool italic; public string fillMode; public string fill; public string fill2; public float fillOpacity; public PBStyleOutline outline; public PBStyleGlow glow; public PBStyleShadow shadow; public PBStyleEmboss emboss; public float lightAngle; public PBStylePattern pattern; }
  [Serializable] class PBBakedRef { public string file; public string metrics; public float pointSize; }
  [Serializable] class PBBakedGlyph { public int u; public int x; public int y; public int w; public int h; public float bx; public float by; public float adv; }
  [Serializable] class PBBakedFace { public float pointSize; public float ascent; public float descent; public float lineHeight; public int atlasW; public int atlasH; public PBBakedGlyph[] glyphs; }
  [Serializable] class PBTypography { public string font; public string fontFile; public PBStyle style; public PBBakedRef bakedFace; }
  [Serializable] class PBManifest { public string kit; public string slug; public int kitVersion; public string tier; public int pngScale; public PBTypography typography; public PBAsset[] assets; }
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
      // these sprites ARE the app's pixels — Unity's default block compression
      // mottles the smooth gradients, so the kit imports lossless; re-compress
      // per platform at ship time if you need the memory back
      if (ti.textureCompression != TextureImporterCompression.Uncompressed) { ti.textureCompression = TextureImporterCompression.Uncompressed; changed = true; }
      // and nothing gets silently downscaled: big panels at 2x can pass the
      // 2048 default ceiling, which would quietly soften them
      if (ti.maxTextureSize < 4096) { ti.maxTextureSize = 4096; changed = true; }
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

    /* ── the FIRST-DROP gap, closed. On a fresh drop the whole batch —
       manifest included — can finish importing before this script even
       compiles, so the postprocessor's "manifest arrived" trigger fires
       into an assembly that doesn't contain it yet, and the domain reload
       that follows wipes any pending delayCall (owner repro: empty
       Console, no prefabs). Every domain reload therefore sweeps for
       kits that have a manifest but no receipt and imports them. Cheap
       and idempotent: once the receipt exists, the sweep does nothing. */
    [InitializeOnLoadMethod]
    static void FirstImportSweep() {
      EditorApplication.delayCall += () => {
        var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
        foreach (var guid in manifests) {
          var mPath = AssetDatabase.GUIDToAssetPath(guid);
          var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
          if (!File.Exists(root + "/kit.lock.json")) ImportKit(mPath);
        }
      };
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

      /* ── the styled face + the FONT STORY, told out loud ── */
      bool tmpPending = false;
      Font kitTtf = null;
      if (manifest.typography == null || string.IsNullOrEmpty(manifest.typography.fontFile)) {
        Debug.Log("UI Kit Maker: this export shipped no font file (the fetch failed in the browser at export time) — labels use Unity's built-in face. Re-export from uikitmaker.com to retry.");
      } else {
        kitTtf = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + manifest.typography.fontFile);
        if (kitTtf == null)
          Debug.LogWarning("UI Kit Maker: the kit names " + manifest.typography.fontFile + " but it isn't in the project — was the fonts folder extracted with the rest?");
      }
#if UNITY_2023_2_OR_NEWER
      /* the styled TMP face generates on EVERY import when missing — not
         only alongside prefabs — so projects that already generated their
         prefabs before this feature still receive KitFace SDF. If TMP's
         essentials are absent, they auto-import and BOTH the face and the
         prefabs wait one pass, so labels never lock in unstyled. */
      bool sdfWasThere = File.Exists(root + "/fonts/KitFace SDF.asset");
      if (kitTtf != null && !TmpReady()) tmpPending = RequestEssentials();
      if (kitTtf != null && !tmpPending) EnsureTmpFace(root, manifest, kitTtf);
      // the baked COLOR face needs no TTF — only TMP itself and the atlas
      if (!tmpPending) EnsureBakedFace(root, manifest, false);
      if (!tmpPending) EnsureGradientPreset(root, manifest);
      // the face arriving AFTER the prefabs did (first-ever TMP install
      // ordering) leaves plain labels behind — say so, with the one-click cure
      if (!sdfWasThere && File.Exists(root + "/fonts/KitFace SDF.asset")
          && ((prev != null && prev.prefabsGenerated) || AssetDatabase.IsValidFolder(root + "/Prefabs")))
        Debug.Log("UI Kit Maker: the styled face arrived after your prefabs were generated — run Tools > PatternBreak > Regenerate Example Prefabs to upgrade their labels (your own prefabs are untouched).");
#endif

      /* ── I5: examples appear once, fully wired, then are yours ── */
      bool prefabsReady = (prev != null && prev.prefabsGenerated) || AssetDatabase.IsValidFolder(root + "/Prefabs");
      bool prefabsNew = false;
      if (!prefabsReady && !tmpPending) { prefabsNew = GeneratePrefabs(root, manifest); prefabsReady = prefabsNew; }
#if UNITY_2023_2_OR_NEWER
      if (tmpPending) EditorApplication.delayCall += Apply; // one bounded re-pass once the essentials land
#endif
      if (prefabsNew) {
        // walk the user to the goods: highlight the fresh Prefabs folder
        var folder = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(root + "/Prefabs");
        if (folder != null) EditorGUIUtility.PingObject(folder);
      }
      // press-Play-ready: a scene with camera, canvas, ONE correct EventSystem
      // and the examples placed — built once after this pass settles, then
      // yours (Tools > PatternBreak > Rebuild Kit Playground Scene refreshes).
      // Scenes can't be created mid-import, hence the delayCall.
      if (!File.Exists(root + "/Playground.unity"))
        EditorApplication.delayCall += () => BuildPlayground(root);

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
      // the receipt tells the LABEL story too — no more guessing which face won
      string faceNote = "";
#if UNITY_2023_2_OR_NEWER
      if (File.Exists(root + "/fonts/KitFace SDF.asset")) faceNote = " Labels: KitFace SDF (styled).";
      else if (tmpPending) faceNote = " Styled face: finishing right after the TMP essentials import.";
      else if (kitTtf != null) faceNote = " Labels: shipped TTF.";
#else
      if (kitTtf != null) faceNote = " Labels: shipped TTF.";
#endif
      var line = "UI Kit Maker — '" + kitName + "'" + (manifest.kitVersion > 0 ? " v" + manifest.kitVersion : "")
        + (prev == null ? " imported: " : " updated: ") + manifest.assets.Length + " sprites ("
        + (prev == null ? fresh + " new" : fresh + " new, " + restyled + " restyled, " + same + " unchanged")
        + "; settings: " + applied + " applied, " + already + " already right)."
        + (prefabsNew ? " Wired prefabs are ready in " + root + "/Prefabs — drag one into your Canvas." : "")
        + faceNote;
      if (orphans.Count > 0)
        Debug.LogWarning(line + "\\n" + orphans.Count + " piece(s) are no longer part of this kit but STAY on disk (nothing is deleted without you): "
          + string.Join(", ", orphans.ToArray())
          + "\\nRemove them via Tools > PatternBreak > Review Orphaned Kit Files.");
      else
        Debug.Log(line);
      if (missing > 0)
        Debug.LogWarning("UI Kit Maker: " + missing + " sprites named in " + mPath + " were not found on disk — keep the export's assets folder next to kit-manifest.json, named exactly 'assets'.");
    }

    /* ── the I5 escape hatch, explicit and confirmed: rebuild the GENERATED
       examples with the current sprites and the styled face. Needed when
       the face arrives after the prefabs did (first-ever TMP install
       ordering — owner: "maybe the text baked before the install
       finished"). SaveAsPrefabAsset overwrites in place, so prefab GUIDs
       survive and placed instances restyle; prefabs the user created or
       renamed are never touched. ── */
    [MenuItem("Tools/PatternBreak/Regenerate Example Prefabs")]
    public static void RegeneratePrefabs() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project — drop a kit in first.");
        return;
      }
      if (!EditorUtility.DisplayDialog("UI Kit Maker — regenerate example prefabs",
        "Rebuilds the GENERATED examples in each kit's Prefabs folder (PrimaryButton, Chip, ProgressBar and friends) from the current sprites and the styled face. Same-named generated prefabs are replaced in place — placed instances restyle. Prefabs you created or renamed are not touched.",
        "Regenerate", "Cancel")) return;
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest manifest = null;
        try { manifest = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (manifest == null || manifest.assets == null) continue;
#if UNITY_2023_2_OR_NEWER
        /* regenerating means "give me the kit's CURRENT look" — refresh the
           styled face's material from the manifest recipe too */
        var face = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
        if (face != null && face.material != null) {
          ApplyStyle(face.material, manifest, root);
          EditorUtility.SetDirty(face.material);
          AssetDatabase.SaveAssets();
        }
        // the baked face rebuilds IN PLACE too (same GUID — placed labels keep it)
        EnsureBakedFace(root, manifest, true);
        EnsureGradientPreset(root, manifest);
#endif
        GeneratePrefabs(root, manifest);
        Debug.Log("UI Kit Maker: regenerated the example prefabs under " + root + "/Prefabs.");
      }
    }

    /* ── press Play, nothing to wire: a ready scene with the examples
       placed, a camera, a raycasting canvas and exactly ONE EventSystem
       carrying the input module this project actually uses (the classic
       Play-mode dead-button causes are a duplicate EventSystem or the
       wrong module for the project's input setting). Generated once on
       first import, then it's yours; the menu below rebuilds it. ── */
    static void BuildPlayground(string root) {
      var scenePath = root + "/Playground.unity";
      if (File.Exists(scenePath)) return; // yours after first generation
      var guids = AssetDatabase.FindAssets("t:Prefab", new string[] { root + "/Prefabs" });
      if (guids.Length == 0) return; // prefabs not in yet — the next pass retries
      var scene = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
        UnityEditor.SceneManagement.NewSceneSetup.EmptyScene, UnityEditor.SceneManagement.NewSceneMode.Additive);
      try {
        /* field case: the user deleted the kit folder while the old
           Playground was still OPEN — its file is gone but the editor
           holds the scene, and saving to a path an open scene claims is
           refused. Our new scene is already loaded, so the stale one is
           safely closable; close it before claiming the path. */
        var stale = UnityEngine.SceneManagement.SceneManager.GetSceneByPath(scenePath);
        if (stale.IsValid() && stale != scene) UnityEditor.SceneManagement.EditorSceneManager.CloseScene(stale, true);
        var camGo = new GameObject("Camera", typeof(Camera));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(camGo, scene);
        var cam = camGo.GetComponent<Camera>();
        cam.orthographic = true;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.09f, 0.10f, 0.15f);
        camGo.tag = "MainCamera";

        var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(canvasGo, scene);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920f, 1080f);

        var esGo = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(esGo, scene);
#if ENABLE_LEGACY_INPUT_MANAGER
        esGo.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
#elif ENABLE_INPUT_SYSTEM
        esGo.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#endif

        var prefabs = new List<GameObject>();
        foreach (var g in guids) {
          var p = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(g));
          if (p != null) prefabs.Add(p);
        }
        prefabs.Sort((a, b) => string.CompareOrdinal(a.name, b.name));
        float colX = 90f, y = -90f, colMaxW = 0f; int placed = 0;
        foreach (var prefab in prefabs) {
          var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
          inst.transform.SetParent(canvasGo.transform, false);
          var rt = inst.GetComponent<RectTransform>();
          if (rt == null) continue;
          float w = Mathf.Max(80f, rt.sizeDelta.x), h = Mathf.Max(40f, rt.sizeDelta.y);
          if (y - h < -1020f && y < -91f) { colX += colMaxW + 70f; y = -90f; colMaxW = 0f; }
          rt.anchorMin = new Vector2(0f, 1f); rt.anchorMax = new Vector2(0f, 1f);
          rt.anchoredPosition = new Vector2(colX + w * 0.5f, y - h * 0.5f);
          y -= h + 44f;
          if (w > colMaxW) colMaxW = w;
          placed++;
        }
        /* the sign on the sandbox — the first-session answers, in the scene
           itself (field-driven: "I don't know unity at all"). Quiet, corner,
           built-in font so it works before any kit face exists. */
        Font hintFont = null;
        try { hintFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } catch (Exception) { }
        if (hintFont == null) { try { hintFont = Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch (Exception) { } }
        if (hintFont != null) {
          var hintGo = new GameObject("How to drive", typeof(RectTransform), typeof(CanvasRenderer));
          hintGo.transform.SetParent(canvasGo.transform, false);
          var hrt = hintGo.GetComponent<RectTransform>();
          hrt.anchorMin = new Vector2(1f, 0f); hrt.anchorMax = new Vector2(1f, 0f);
          hrt.pivot = new Vector2(1f, 0f);
          hrt.anchoredPosition = new Vector2(-28f, 28f);
          hrt.sizeDelta = new Vector2(600f, 200f);
          var hint = hintGo.AddComponent<UnityEngine.UI.Text>();
          hint.font = hintFont;
          hint.fontSize = 20;
          hint.alignment = TextAnchor.LowerRight;
          hint.color = new Color(1f, 1f, 1f, 0.5f);
          hint.raycastTarget = false;
          hint.text = "Press Play (top center) to feel hover + press. Edit with Play OFF - Play-mode changes don't stick.\\nRetype any label: expand the piece, select its Label, edit the text box in the Inspector.\\nBroke something? Select the piece > Overrides > Revert All - or drag a fresh copy from Prefabs/.\\nThese are copies; the kit itself can't be damaged from here. Delete this note anytime.";
        }
        if (UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, scenePath))
          Debug.Log("UI Kit Maker: Playground ready — open " + scenePath + " and press Play. Hover/press states are pre-wired (" + placed + " pieces placed).");
        else
          Debug.LogWarning("UI Kit Maker: couldn't save the Playground at " + scenePath + " — go File > New Scene, then Tools > PatternBreak > Rebuild Kit Playground Scene.");
      } finally {
        UnityEditor.SceneManagement.EditorSceneManager.CloseScene(scene, true);
      }
    }

    [MenuItem("Tools/PatternBreak/Rebuild Kit Playground Scene")]
    public static void RebuildPlayground() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project — drop a kit in first.");
        return;
      }
      if (!EditorUtility.DisplayDialog("UI Kit Maker — rebuild the Playground scene",
        "Replaces each kit's Playground.unity with a fresh scene containing the current example prefabs. Changes you made inside the old Playground are lost; every other scene is untouched.",
        "Rebuild", "Cancel")) return;
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        var scenePath = root + "/Playground.unity";
        if (File.Exists(scenePath)) AssetDatabase.DeleteAsset(scenePath);
        BuildPlayground(root);
      }
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
#if UNITY_2023_2_OR_NEWER
    /* ── the styled face, AUTOMATED (owner: "we really need the styling
       to be automated"): a dynamic SDF font asset is generated from the
       shipped TTF once per kit, its material wears the kit's outline and
       glow straight from the manifest recipe, and prefab labels use it
       with the kit's fill (gradient included). Idempotent: the asset is
       created only when missing, so re-imports never churn it and user
       tweaks to the material survive.
       EVERY exit path SPEAKS — a silent fallback here cost a debugging
       round (owner: "I don't see anything in the console"). ── */
    static bool essentialsRequested;
    static bool TmpReady() {
      try { return TMP_Settings.instance != null; } catch (Exception) { return false; }
    }
    /* TMP's Essential Resources (its shaders) only auto-offer when a human
       creates a TMP object from the menu — code-created text needs them
       imported by hand. We do it FOR the user, once. */
    static bool RequestEssentials() {
      if (essentialsRequested) return false;
      string[] candidates = {
        "Packages/com.unity.ugui/Package Resources/TMP Essential Resources.unitypackage",
        "Packages/com.unity.textmeshpro/Package Resources/TMP Essential Resources.unitypackage",
      };
      foreach (var p in candidates) {
        if (File.Exists(p)) {
          essentialsRequested = true;
          AssetDatabase.ImportPackage(p, false);
          Debug.Log("UI Kit Maker: importing TextMeshPro Essential Resources (one-time — needed for the styled face). The kit finishes its styled-text setup right after.");
          return true;
        }
      }
      Debug.LogWarning("UI Kit Maker: TextMeshPro Essential Resources are missing and couldn't be auto-imported. Run Window > TextMeshPro > Import TMP Essential Resources, then Tools > PatternBreak > Reapply Kit Import Settings. Labels use the shipped TTF meanwhile.");
      return false;
    }
    static TMP_FontAsset EnsureTmpFace(string root, PBManifest m, Font ttf) {
      var path = root + "/fonts/KitFace SDF.asset";
      var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(path);
      if (existing != null) return existing;
      if (ttf == null) return null; // the import pass logs the font story
      TMP_FontAsset fa = null;
      try { fa = TMP_FontAsset.CreateFontAsset(ttf); }
      catch (Exception e) {
        Debug.LogWarning("UI Kit Maker: couldn't build the SDF face from " + ttf.name + " (" + e.Message + ") — labels use the shipped TTF instead.");
        return null;
      }
      if (fa == null) {
        Debug.LogWarning("UI Kit Maker: TextMeshPro returned no font asset for " + ttf.name + " — labels use the shipped TTF instead. If TMP Essential Resources just imported, run Tools > PatternBreak > Reapply Kit Import Settings.");
        return null;
      }
      fa.name = "KitFace SDF";
      AssetDatabase.CreateAsset(fa, path);
      if (fa.material != null) {
        fa.material.name = "KitFace SDF Material";
        AssetDatabase.AddObjectToAsset(fa.material, fa);
        ApplyStyle(fa.material, m, root);
      }
      if (fa.atlasTextures != null && fa.atlasTextures.Length > 0 && fa.atlasTextures[0] != null) {
        fa.atlasTextures[0].name = "KitFace SDF Atlas";
        AssetDatabase.AddObjectToAsset(fa.atlasTextures[0], fa);
      }
      AssetDatabase.SaveAssets();
      Debug.Log("UI Kit Maker: generated the styled TextMeshPro face at " + path + " — outline and glow follow the kit's own type recipe.");
      return fa;
    }
    static void ApplyStyle(Material mat, PBManifest m, string root) {
      var s = m != null && m.typography != null ? m.typography.style : null;
      if (mat == null || s == null) return;
      /* CreateFontAsset hands back a material on the MOBILE distance-field
         shader, which has no glow, bevel or face-texture sections — every
         deep-style write below would land on deaf ears. The full shader
         ships with TMP Essential Resources (already in: TmpReady gates us). */
      var full = Shader.Find("TextMeshPro/Distance Field");
      if (full != null) { if (mat.shader != full) mat.shader = full; }
      else Debug.LogWarning("UI Kit Maker: the TextMeshPro/Distance Field shader isn't in this project, so glow, emboss and the face pattern stay off (fill, outline and shadow still apply). Re-importing TMP Essential Resources restores it.");
      Color c;
      if (s.outline != null && !string.IsNullOrEmpty(s.outline.color) && ColorUtility.TryParseHtmlString(s.outline.color, out c)) {
        mat.SetColor("_OutlineColor", c);
        // the app paints the stroke BEHIND the fill (paint-order stroke): the
        // visible band sits OUTSIDE and never eats the character. TMP's outline
        // straddles the edge, so dilate the face by the same amount — the band
        // lands fully outside and the letterform keeps its designed weight.
        float ow = Mathf.Clamp(s.outline.width / 60f, 0.025f, 0.3f);
        mat.SetFloat("_OutlineWidth", ow);
        mat.SetFloat("_FaceDilate", ow);
      }
      /* the full Distance Field shader carries a REAL glow section, so the
         glow and the drop shadow (underlay) can both speak at once */
      if (s.glow != null && !string.IsNullOrEmpty(s.glow.color) && ColorUtility.TryParseHtmlString(s.glow.color, out c)) {
        c.a = Mathf.Clamp01(s.glow.opacity / 100f);
        mat.EnableKeyword("GLOW_ON");
        mat.SetColor("_GlowColor", c);
        mat.SetFloat("_GlowOuter", Mathf.Clamp(s.glow.size / 24f, 0.05f, 1f));
        mat.SetFloat("_GlowPower", 0.75f);
      }
      if (s.shadow != null && !string.IsNullOrEmpty(s.shadow.color) && ColorUtility.TryParseHtmlString(s.shadow.color, out c)) {
        c.a = Mathf.Clamp01(s.shadow.opacity / 100f);
        mat.EnableKeyword("UNDERLAY_ON");
        mat.SetColor("_UnderlayColor", c);
        mat.SetFloat("_UnderlayOffsetX", Mathf.Clamp(s.shadow.x / 50f, -1f, 1f));
        mat.SetFloat("_UnderlayOffsetY", Mathf.Clamp(0f - s.shadow.y / 50f, -1f, 1f));
        mat.SetFloat("_UnderlaySoftness", Mathf.Clamp(s.shadow.blur / 30f, 0f, 1f));
      }
      /* emboss → the shader's bevel + lighting, lit from the kit's angle */
      if (s.emboss != null && Mathf.Abs(s.emboss.strength) > 0.01f) {
        mat.EnableKeyword("BEVEL_ON");
        mat.SetFloat("_Bevel", Mathf.Clamp(Mathf.Abs(s.emboss.strength) / 100f, 0.1f, 1f));
        mat.SetFloat("_BevelWidth", 0.25f);
        mat.SetFloat("_BevelRoundness", 0.35f);
        if (s.emboss.strength < 0f) mat.SetFloat("_BevelOffset", -0.25f);
        mat.SetFloat("_LightAngle", (s.lightAngle + 90f) * Mathf.Deg2Rad);
        mat.SetFloat("_SpecularPower", 1.5f);
      }
      /* the letterform pattern deliberately does NOT ride the face material
         (owner call): one shared material can't tile correctly for every
         label length a developer might type, and a treatment that only works
         for short labels breaks the "it just works" promise. The seamless
         tile still ships (fonts/face-pattern.png, density in the manifest's
         pattern.reps) for anyone who wants it in the Face Texture slot by
         hand — and Type Stamps carry the pattern pixel-perfect. */
    }
    /* ── the BAKED alphabet face: a color font assembled from the atlas the
       app rendered — every glyph the app's exact pixels, pattern, glints
       and gloss included. TMP's internals drift across editor versions,
       so every write is reflection-tolerant and every exit speaks. ── */
    static bool SetField(object target, string name, object value) {
      var f = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
      if (f == null) return false;
      try {
        if (f.FieldType.IsEnum) value = Enum.ToObject(f.FieldType, Convert.ToInt32(value));
        else if (f.FieldType == typeof(int)) value = Convert.ToInt32(value);
        else if (f.FieldType == typeof(float)) value = Convert.ToSingle(value);
        f.SetValue(target, value);
        return true;
      } catch (Exception) { return false; }
    }
    static void EnsureBakedFace(string root, PBManifest m, bool refresh) {
      if (m == null || m.typography == null || m.typography.bakedFace == null || string.IsNullOrEmpty(m.typography.bakedFace.file)) return;
      var assetPath = root + "/fonts/KitFace Baked.asset";
      var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(assetPath);
      // a half-assembled survivor of a failed pass (created, then TMP threw
      // before the tables landed) counts as missing — rebuild it in place
      bool broken = existing != null && (existing.characterTable == null || existing.characterTable.Count == 0);
      if (existing != null && !refresh && !broken) return; // yours after first assembly; Regenerate refreshes
      var jsonPath = root + "/" + m.typography.bakedFace.metrics;
      var texPath = root + "/" + m.typography.bakedFace.file;
      if (!File.Exists(jsonPath)) return;
      var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
      if (tex == null) return; // atlas not imported yet — the next pass retries
      PBBakedFace face = null;
      try { face = JsonUtility.FromJson<PBBakedFace>(File.ReadAllText(jsonPath)); } catch (Exception) { }
      if (face == null || face.glyphs == null || face.glyphs.Length == 0) {
        Debug.LogWarning("UI Kit Maker: " + jsonPath + " unreadable — the baked face is skipped (labels keep the SDF face).");
        return;
      }
      try {
        var shader = Shader.Find("TextMeshPro/Bitmap Custom Atlas"); // samples the atlas in full COLOR
        if (shader == null) shader = Shader.Find("TextMeshPro/Bitmap"); // alpha-only fallback: silhouettes, but working text
        if (shader == null) { Debug.LogWarning("UI Kit Maker: no TextMeshPro Bitmap shader in this project — baked face skipped."); return; }
        var fa = existing != null ? existing : ScriptableObject.CreateInstance<TMP_FontAsset>();
        fa.name = "KitFace Baked";
        /* field report, first assembly attempt: "Upgrading font asset
           [KitFace Baked] to version 1.1.0" then an NRE. A fresh
           TMP_FontAsset has no version stamp, so TMP runs its legacy
           upgrade over internals that were never populated. Stamp it
           current and pre-create the table the upgrade would have built. */
        SetField(fa, "m_Version", "1.1.0");
        var fftField = typeof(TMP_FontAsset).GetField("m_FontFeatureTable", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        if (fftField != null && fftField.GetValue(fa) == null) {
          var fftType = typeof(TMP_FontAsset).Assembly.GetType("TMPro.TMP_FontFeatureTable");
          if (fftType != null) { try { fftField.SetValue(fa, Activator.CreateInstance(fftType)); } catch (Exception) { } }
        }
        object fi = new UnityEngine.TextCore.FaceInfo();
        SetField(fi, "m_FamilyName", (string.IsNullOrEmpty(m.typography.font) ? "Kit" : m.typography.font) + " Baked");
        SetField(fi, "m_StyleName", "Baked");
        SetField(fi, "m_PointSize", face.pointSize);
        SetField(fi, "m_Scale", 1f);
        SetField(fi, "m_LineHeight", face.lineHeight);
        SetField(fi, "m_AscentLine", face.ascent);
        SetField(fi, "m_CapLine", face.ascent * 0.7f);
        SetField(fi, "m_MeanLine", face.ascent * 0.5f);
        SetField(fi, "m_Baseline", 0f);
        SetField(fi, "m_DescentLine", 0f - face.descent);
        SetField(fi, "m_TabWidth", face.pointSize * 2f);
        if (!SetField(fa, "m_FaceInfo", fi)) {
          Debug.LogWarning("UI Kit Maker: this TMP version hides FaceInfo — baked face skipped (labels keep the SDF face).");
          return;
        }
        if (fa.glyphTable == null) SetField(fa, "m_GlyphTable", new List<UnityEngine.TextCore.Glyph>());
        if (fa.characterTable == null) SetField(fa, "m_CharacterTable", new List<TMP_Character>());
        if (fa.glyphTable == null || fa.characterTable == null) {
          Debug.LogWarning("UI Kit Maker: this TMP version hides the glyph tables — baked face skipped.");
          return;
        }
        fa.glyphTable.Clear();
        fa.characterTable.Clear();
        uint gi = 1;
        foreach (var g in face.glyphs) {
          // the JSON is top-origin (canvas); TextCore rects are bottom-origin
          var rect = new UnityEngine.TextCore.GlyphRect(g.x, face.atlasH - g.y - g.h, g.w, g.h);
          var met = new UnityEngine.TextCore.GlyphMetrics(g.w, g.h, g.bx, g.by, g.adv);
          var glyph = new UnityEngine.TextCore.Glyph(gi, met, rect, 1f, 0);
          fa.glyphTable.Add(glyph);
          object ch = null;
          try { ch = Activator.CreateInstance(typeof(TMP_Character), (uint)g.u, fa, glyph); }
          catch (Exception) { try { ch = Activator.CreateInstance(typeof(TMP_Character), (uint)g.u, glyph); } catch (Exception) { } }
          if (ch != null) {
            // field report: glyphs present but text fell back to the default
            // font — a character whose back-pointer to its font asset is null
            // reads as "not here" at render time. Set it no matter which
            // constructor we got.
            SetField(ch, "m_TextAsset", fa);
            fa.characterTable.Add((TMP_Character)ch);
          }
          gi++;
        }
        SetField(fa, "m_AtlasTextures", new Texture2D[] { tex });
        SetField(fa, "m_AtlasWidth", face.atlasW);
        SetField(fa, "m_AtlasHeight", face.atlasH);
        SetField(fa, "m_AtlasPadding", 2);
        SetField(fa, "m_AtlasPopulationMode", 0); // Static — the app owns the atlas
        var mat = fa.material != null ? fa.material : new Material(shader);
        if (fa.material == null) mat.name = "KitFace Baked Material";
        mat.SetTexture("_MainTex", tex);
        if (!SetField(fa, "m_Material", mat)) {
          Debug.LogWarning("UI Kit Maker: couldn't attach the baked face material on this TMP version — baked face skipped.");
          return;
        }
        if (existing == null) {
          AssetDatabase.CreateAsset(fa, assetPath);
          AssetDatabase.AddObjectToAsset(mat, fa);
        }
        fa.ReadFontAssetDefinition();
        EditorUtility.SetDirty(fa);
        AssetDatabase.SaveAssets();
        Debug.Log("UI Kit Maker: baked alphabet face assembled at " + assetPath + " — " + fa.characterTable.Count
          + " glyphs of the app's exact pixels (pattern, glints and gloss included). Put it on any TMP label for hero text: Font Asset = KitFace Baked, label color WHITE. Crisp up to ~" + Mathf.RoundToInt(face.pointSize) + "px, softens beyond — that's bitmap-font physics.");
      } catch (Exception e) {
        Debug.LogWarning("UI Kit Maker: the baked face couldn't self-assemble on this Unity version (" + e.Message + "). The atlas and metrics are intact in fonts/ — send this line to uikitmaker.com and we'll wire it.");
      }
    }
    /* ── the kit's fill as a one-click Color Gradient preset: prefab labels
       arrive wearing the gradient automatically, but a HAND-made text
       starts white (fill is per-label vertex color, not material). The
       preset makes "paint it like the kit" a dropdown pick — and it
       updates on every import, so hand-styled labels restyle with the
       kit like everything else. ── */
    static void EnsureGradientPreset(string root, PBManifest m) {
      var s = m != null && m.typography != null ? m.typography.style : null;
      if (s == null || string.IsNullOrEmpty(s.fill)) return;
      Color top, bot;
      if (!ColorUtility.TryParseHtmlString(s.fill, out top)) return;
      if (s.fillMode != "gradient" || string.IsNullOrEmpty(s.fill2) || !ColorUtility.TryParseHtmlString(s.fill2, out bot)) bot = top;
      var path = root + "/fonts/KitFace Gradient.asset";
      var g = AssetDatabase.LoadAssetAtPath<TMP_ColorGradient>(path);
      bool fresh = g == null;
      if (fresh) g = ScriptableObject.CreateInstance<TMP_ColorGradient>();
      g.colorMode = ColorMode.FourCornersGradient;
      g.topLeft = top; g.topRight = top; g.bottomLeft = bot; g.bottomRight = bot;
      if (fresh) {
        AssetDatabase.CreateAsset(g, path);
        Debug.Log("UI Kit Maker: fill preset ready — on any TMP label, tick Color Gradient and set Color Preset to KitFace Gradient (in fonts/) to paint the text in the kit's own fill.");
      } else EditorUtility.SetDirty(g);
    }
    static void AddTmpLabel(GameObject parent, string text, TMP_FontAsset face, PBStyle s) {
      var go = new GameObject("Label", typeof(RectTransform), typeof(CanvasRenderer));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      var t = go.AddComponent<TextMeshProUGUI>();
      t.text = text;
      t.alignment = TextAlignmentOptions.Center;
      t.fontSize = 40;
      t.raycastTarget = false;
      if (face != null) t.font = face;
      Color top = Color.white, bot = Color.white;
      bool grad = false;
      if (s != null) {
        if (s.fillMode == "gradient" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top) && ColorUtility.TryParseHtmlString(s.fill2 != null ? s.fill2 : "", out bot)) grad = true;
        else if (s.fillMode == "solid" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top)) { }
        else top = Color.white; // "auto" resolves against each face; white is the safe stage ink
        var style = s.italic ? FontStyles.Italic : FontStyles.Normal;
        if (s.weight >= 700) style = style | FontStyles.Bold;
        t.fontStyle = style;
      }
      if (grad) { t.enableVertexGradient = true; t.colorGradient = new VertexGradient(top, top, bot, bot); t.color = Color.white; }
      else t.color = top;
    }
#endif
    static void AddLabel(GameObject parent, string text, Font kitFont, string root, PBManifest m) {
#if UNITY_2023_2_OR_NEWER
      var face = EnsureTmpFace(root, m, kitFont);
      if (face != null) {
        AddTmpLabel(parent, text, face, m != null && m.typography != null ? m.typography.style : null);
        return;
      }
#endif
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
      // the kit's own face ships in fonts/ (license beside it) and wires
      // here automatically; the built-in face only covers a fetch-less
      // zip. For styled DYNAMIC text, build a TMP material preset from
      // kit-manifest.json > typography > style.
      var f = kitFont != null ? kitFont : BuiltinFont();
      if (f != null) t.font = f;
    }
    /* one prefab per component family (owner: "a ton of prefabs") — any
       family shipping a base sprite gets one; state variants wire a
       Button with the kit's own hover/pressed/disabled recipes. */
    static string NiceName(string family) {
      var sb = new System.Text.StringBuilder();
      bool up = true;
      foreach (var ch in family) {
        if (ch == '-') { up = true; continue; }
        sb.Append(up ? char.ToUpperInvariant(ch) : ch);
        up = false;
      }
      return sb.Length > 0 ? sb.ToString() : "Piece";
    }
    static bool FamilyPrefab(string dir, string root, PBAsset baseAsset, string goName, string label, int pngScale, Font kitFont, PBManifest m) {
      var basePath = root + "/" + baseAsset.file;
      var baseSp = S(basePath);
      if (baseSp == null) return false;
      var go = new GameObject(goName, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      var img = go.GetComponent<Image>();
      img.sprite = baseSp;
      bool sliced = baseAsset.nineSlice != null && (baseAsset.nineSlice.left + baseAsset.nineSlice.right + baseAsset.nineSlice.top + baseAsset.nineSlice.bottom) > 0;
      img.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
      if (pngScale > 0)
        go.GetComponent<RectTransform>().sizeDelta = new Vector2(baseSp.rect.width / pngScale, baseSp.rect.height / pngScale);
      var famDir = Path.GetDirectoryName(basePath).Replace("\\\\", "/");
      var hover = S(famDir + "/base-hover.9.png");
      var pressed = S(famDir + "/base-pressed.9.png");
      var disabled = S(famDir + "/base-disabled.9.png");
      if (hover != null || pressed != null || disabled != null) {
        var btn = go.AddComponent<Button>();
        btn.transition = Selectable.Transition.SpriteSwap;
        var ss = new SpriteState();
        ss.highlightedSprite = hover;
        ss.selectedSprite = hover;
        ss.pressedSprite = pressed;
        ss.disabledSprite = disabled;
        btn.spriteState = ss;
      }
      if (label != null) AddLabel(go, label, kitFont, root, m);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    static string DefaultLabel(string family) {
      if (family == "chip") return "NEW";
      if (family == "tab") return "TAB";
      return "PLAY";
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
      // the kit's own face, shipped in fonts/ with its license — labels wire to it
      Font kitFont = null;
      if (m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        kitFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
      if (ProgressPrefab(dir, root, pngScale)) any = true;
      /* every family with a "base" sprite becomes a prefab; the composed
         controls and pure parts opt out (they're layers, not pieces) */
      var labeled = new HashSet<string> { "button-primary", "button-secondary", "button-small", "chip", "tab" };
      /* the data-heavy panels (lap times, leaderboard, telemetry) read as
         empty shells without their live content — their sprites still ship,
         but they don't make useful drag-in prefabs (owner) */
      var skip = new HashSet<string> { "progress", "slider", "toggle", "segbar", "fx", "icons", "dropdown", "rarityframe", "loottag", "speedo", "speedo2", "circuit", "startlights", "laptimes", "leaderboard", "telemetry" };
      foreach (var a in m.assets) {
        if (a == null || string.IsNullOrEmpty(a.component) || a.part != "base") continue;
        if (skip.Contains(a.component)) continue;
        skip.Add(a.component); // one per family
        var label = labeled.Contains(a.component) ? DefaultLabel(a.component) : null;
        if (FamilyPrefab(dir, root, a, NiceName(a.component), label, pngScale, kitFont, m)) any = true;
      }
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
      /* the baked-face atlas is a TEXTURE with exact glyph rects — sprite
         packing, compression or NPOT rounding would all corrupt it */
      if (path.Contains("UIKitMaker/") && path.EndsWith("/fonts/kitface-baked.png")) {
        var bti = (TextureImporter)assetImporter;
        bti.textureType = TextureImporterType.Default;
        bti.mipmapEnabled = false;
        bti.alphaIsTransparency = true;
        bti.textureCompression = TextureImporterCompression.Uncompressed;
        bti.maxTextureSize = 4096;
        bti.npotScale = TextureImporterNPOTScale.None;
        return;
      }
      /* Type Stamps — baked styled phrases exported at 4x — land under the
         kit's stamps/ folder and arrive as ready sprites at design size */
      if (path.Contains("UIKitMaker/") && path.Contains("/stamps/")) {
        var sti = (TextureImporter)assetImporter;
        sti.textureType = TextureImporterType.Sprite;
        sti.spriteImportMode = SpriteImportMode.Single;
        sti.mipmapEnabled = false;
        sti.alphaIsTransparency = true;
        sti.textureCompression = TextureImporterCompression.Uncompressed; // hero text: never blocky
        sti.maxTextureSize = 4096;
        var sset = new TextureImporterSettings();
        sti.ReadTextureSettings(sset);
        sset.spritePixelsPerUnit = 400f; // stamps ship at 4x
        sti.SetTextureSettings(sset);
        return;
      }
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
      /* ── the update valet. macOS never merges folders: a re-drop lands as
         "UIKitMaker 1" (Finder AND Unity both suffix on collision) — a
         forked kit, plus a second copy of this very script that would kill
         the editor assembly (CS0101). Any kit manifest arriving under a
         non-canonical UIKitMaker root gets its files copied HOME (byte
         overwrite; the .meta files at home are untouched, so every GUID
         survives) and the duplicate tree removed before its script copy
         compiles. ── */
      bool valeted = false;
      foreach (var p in imported) {
        var norm = p.Replace("\\\\", "/");
        if (!norm.EndsWith("/kit-manifest.json")) continue;
        var parts = norm.Split('/');
        if (parts.Length < 3 || parts[0] != "Assets") continue;
        var top = parts[1];
        if (top == "UIKitMaker" || !top.StartsWith("UIKitMaker")) continue;
        var dupTop = "Assets/" + top;
        int relocated = 0;
        try {
          foreach (var f in Directory.GetFiles(dupTop, "*", SearchOption.AllDirectories)) {
            var fp = f.Replace("\\\\", "/");
            if (fp.EndsWith(".meta")) continue;
            var rel = fp.Substring(dupTop.Length + 1);
            var dst = "Assets/UIKitMaker/" + rel;
            var dir = Path.GetDirectoryName(dst);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.Copy(fp, dst, true);
            relocated++;
          }
        } catch (Exception e) {
          Debug.LogWarning("UI Kit Maker: couldn't relocate '" + dupTop + "' automatically (" + e.Message + ") — move its contents into Assets/UIKitMaker by hand, then delete it.");
          continue;
        }
        /* the valet may have just replaced this importer itself — the domain
           reload that follows wipes any queued pass, so clear the receipts
           and let the post-reload sweep re-import every kit fresh */
        try {
          if (Directory.Exists("Assets/UIKitMaker"))
            foreach (var lockP in Directory.GetFiles("Assets/UIKitMaker", "kit.lock.json", SearchOption.AllDirectories)) File.Delete(lockP);
        } catch (Exception) { }
        AssetDatabase.DeleteAsset(dupTop);
        valeted = true;
        Debug.Log("UI Kit Maker: that drop landed as '" + top + "' (macOS never merges folders) — " + relocated + " files were moved home into Assets/UIKitMaker and the duplicate folder was removed. Drop updates anywhere; the kit finds its way.");
      }
      if (valeted) {
        cache.Clear();
        EditorApplication.delayCall += () => { AssetDatabase.Refresh(); KitImporter.Apply(); };
        return;
      }
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
