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
import { renderKit, rarityTiers, textPatternCell, renderTypeSpecimen, userShapeCaps } from "./bevel";
import { silhouetteMeta } from "./silhouettes";
import { download, makeZip, svgToPngBytes, svgToPngBytesTight, svgsToPngBytesTightUnion, glowFromPng, setEmbedFont } from "./exportUtils";
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
export async function fetchKitFont(family: string): Promise<{ file: string; bytes: Uint8Array; licenceName: string; licenceText: string } | null> {
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
  setEmbedFont("", null); // never inherit a stale embed from a crashed export

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
     engine can Sprite-Swap them. Outer effects still engine-composed —
     AND that must hold inside the fork too: a designed state carries its
     own shadow/contact/bloom, and zeroing only the master let them bake
     back in. The hover sprite shipped 32px wider and 74px taller than
     base, so the swap shrank the art inside the same rect and added a
     smudged halo (owner: "the rollovers are weird and incorrect"). Calm
     the fork exactly like the master so all four states share base's
     geometry. */
  const stateShell = (id: KitComponentId, state: "hover" | "pressed" | "disabled", opts: Record<string, unknown> = {}, value?: number) => {
    const c = clone(pieceCfg(id));
    /* forks are PARTIAL (designFor: every field falls back to the master
       independently) — calm only what a fork actually carries, or a
       face-only fork crashes the whole export */
    const calm = (g: { shadow?: GenConfig["shadow"]; candy?: GenConfig["candy"] }) => {
      if (g.shadow) g.shadow.opacity = 0;
      if (g.candy) {
        g.candy.contact.opacity = 0;
        g.candy.bloom.opacity = 0;
      }
    };
    calm(c);
    for (const s of Object.values(c.states)) s.glow = 0;
    for (const f of Object.values(c.stateDesigns)) if (f) calm(f);
    return renderKit(c, id, effKitSize(st.kitSizes[id]), state, value, st.kitShapes[id], { label: "", icon: null, ...opts });
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
    // user imports carry their caps in their drawn proportions — a wide
    // drawing has wide caps, and guessing from height alone put the slice
    // borders inside the decoration
    const met = silhouetteMeta(shape) ?? userShapeCaps(shape);
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
  const pngQueue: { path: string; svg: string; crop: boolean; group?: string; meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256"> }[] = [];
  const addPng = (path: string, svg: string, meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256">, crop = false, group?: string): Promise<void> => {
    // own copy of the slice — call sites share one object across variants,
    // and the post-crop clamp adjusts it per asset
    pngQueue.push({ path, svg, crop, group, meta: { ...meta, nineSlice: meta.nineSlice ? { ...meta.nineSlice } : null } });
    return Promise.resolve();
  };
  /* families whose prefabs swap states, so they are the ones that get an
     aura sprite — kept beside the manifest's stateFx list, which drives the
     runtime that fades it */
  const GLOW_FAMS = new Set(["button-primary", "button-secondary", "button-small", "chip", "tab",
    "list-row", "item-slot", "iconbtn", "checkbox", "radio"]);
  const rasterQueue = async () => {
    const total = pngQueue.length + (catalog ? 1 : 0);
    /* entries sharing a group (a family's rest + swap states) rasterize
       together on ONE union crop box, so every state sprite shares base's
       coordinate space — a pressed sink stays a sink instead of being
       stretched back over the rect, and nothing jumps on swap. Groups
       resolve lazily when their first member is reached, keeping the
       progress bar honest. */
    const byGroup = new Map<string, number[]>();
    pngQueue.forEach((q, i) => { if (q.group) byGroup.set(q.group, [...(byGroup.get(q.group) ?? []), i]); });
    const grouped = new Map<number, { bytes: Uint8Array; w: number; h: number }>();
    for (let qi = 0; qi < pngQueue.length; qi++) {
      const q = pngQueue[qi];
      onProgress?.(qi, total, q.path);
      if (q.group && !grouped.has(qi)) {
        const idxs = byGroup.get(q.group)!;
        const outs = await svgsToPngBytesTightUnion(idxs.map((i) => pngQueue[i].svg), PNG_SCALE);
        idxs.forEach((i, j) => grouped.set(i, outs[j]));
      }
      const { bytes, w, h } = grouped.get(qi) ?? (q.crop ? await svgToPngBytesTight(q.svg, PNG_SCALE) : await svgToPngBytes(q.svg, PNG_SCALE));
      // Last line of defence: whatever the cap math says, borders must leave
      // a real center strip or engines render nothing. Scale down to fit.
      const s = q.meta.nineSlice;
      if (s) {
        /* organic silhouettes can push the cap math past reason — the wavy
           button's slice guides nearly met in the middle, caps ate ~92% of
           the sprite and the type area with it (owner: "this is clearly
           off", then at 35%: "still off... lots more room for text in the
           middle between the concave/convex"). A cap never takes more
           than 25% of the width / 30% of the height per side — the
           stretchable middle is at least HALF the width and 40% of the
           height of every sprite. */
        const maxLR = Math.floor(w * 0.25), maxTB = Math.floor(h * 0.3);
        if (s.left > maxLR) s.left = maxLR;
        if (s.right > maxLR) s.right = maxLR;
        if (s.top > maxTB) s.top = maxTB;
        if (s.bottom > maxTB) s.bottom = maxTB;
        const fx = (w - 12) / (s.left + s.right), fy = (h - 12) / (s.top + s.bottom);
        if (fx < 1) { s.left = Math.max(1, Math.floor(s.left * fx)); s.right = Math.max(1, Math.floor(s.right * fx)); }
        if (fy < 1) { s.top = Math.max(1, Math.floor(s.top * fy)); s.bottom = Math.max(1, Math.floor(s.bottom * fy)); }
      }
      files.push({ path: `assets/${q.path}`, data: bytes });
      manifest.push({ file: `assets/${q.path}`, nativeW: w, nativeH: h, sha256: await sha256Hex(bytes), ...q.meta });
      /* the piece's own aura, derived from the sprite we just made — the
         silhouette blurred exactly the way the app blurs it. Only for the
         families that swap: a panel has no hover to announce. */
      if (q.meta.part === "base" && GLOW_FAMS.has(q.meta.component)) {
        const g = await glowFromPng(bytes, PNG_SCALE);
        files.push({ path: `assets/${q.meta.component}/glow.png`, data: g.bytes });
        manifest.push({
          file: `assets/${q.meta.component}/glow.png`, nativeW: g.w, nativeH: g.h,
          sha256: await sha256Hex(g.bytes), component: q.meta.component, part: "glow",
          nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true,
          usage: "This piece's aura — its silhouette, blurred the way the app blurs it. White, so it tints to any role; the hover glow uses it behind the piece.",
        });
      }
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
    { id: "input", family: "input", h: 124, usage: "Input field surface (well included). Nothing is baked into it — the placeholder ships as a live text layer on the prefab, and the value and caret are engine widgets." },
    { id: "panel", family: "panel", h: 380, usage: "Container / window. Content is engine layout." },
    { id: "header", family: "header-banner", h: 158, usage: "Header banner. Title is live engine text." },
    { id: "datarow", family: "list-row", h: 128, usage: "List row surface. Portrait, texts and bar are separate engine elements." },
    { id: "slot", family: "item-slot", h: 128, usage: "Item slot frame + well. Item icon and count are engine content." },
  ];
  for (const n of NINE) {
    if (!full && !FREE_NINE.has(n.id)) continue;
    /* NOTHING replaceable is baked into a sprite. The input's "Type
       something…" used to ride along as art — the affordance reads well in
       the app, but in Unity it arrived welded to the surface and there was
       no way to take it off (owner: "I didn't realize the text would be
       burned into the image"). It ships as a live text layer on the prefab
       instead: editable, or deletable in one keystroke. */
    const rowOpts: Record<string, unknown> = n.id === "datarow"
      ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never }
      : n.id === "input" ? { placeholder: false } : {};
    const fullSvg = shell(n.id, rowOpts, slim);
    const slice = sliceOf(n.id, n.h);
    /* swap families crop base + states on ONE union box (the group) so the
       four sprites share a coordinate space — see rasterQueue */
    const swap = ["primary", "secondary", "small", "chip", "tab", "slot", "datarow"].includes(n.id);
    await addPng(`${n.family}/base.9.png`, fullSvg,
      { component: n.family, part: "base", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: n.usage }, true, swap ? n.family : undefined);
    const flatSvg = shell(n.id, rowOpts, (c) => { slim(c); flat(c); });
    await addPng(`${n.family}/base-flat.9.png`, flatSvg,
      { component: n.family, part: "base-flat", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Flat variant (no gloss/specular/pattern) — tint freely or layer your own effects above it." }, true);
    /* interactive pieces ship their DESIGNED states for engine Sprite Swap —
       generic color-tint transitions never match the kit's own recipes */
    if (swap) {
      const SWAP: Record<string, string> = { hover: "Highlighted (and Selected)", pressed: "Pressed", disabled: "Disabled" };
      for (const stName of ["hover", "pressed", "disabled"] as const) {
        await addPng(`${n.family}/base-${stName}.9.png`, stateShell(n.id, stName, rowOpts),
          { component: n.family, part: `base-${stName}`, nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `The kit's designed ${stName} state — Sprite Swap slot: ${SWAP[stName]}. Same nine-slice and coordinate space as base (union-cropped together). Glow and lift stay engine-composed (fx/glow.png, a small translate).` }, true, n.family);
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

  /* affordance glyphs SHIP (owner call — the ghost marks, chevron and kit
     icon are how the pieces read; "none" per piece on uikitmaker.com is
     the strip switch, honored end to end): icon undefined here overrides
     shell()'s blanket null back to "as designed" */
  await addPng("checkbox/base.png", shell("checkbox", { icon: undefined }, undefined, 0), { component: "checkbox", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Unchecked box, ghost mark included (as designed). The lit check is a separate tintable glyph (icons/check.png)." });
  await addPng("radio/base.png", shell("radio", { icon: undefined }, undefined, 0), { component: "radio", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Radio shell, ghost pip included (as designed). The lit dot is a separate tintable glyph (icons/dot.png)." });
  await addPng("orb/lit.png", shell("orb", {}, undefined, 1), { component: "orb", part: "lit", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, lit — streaks, statuses, day markers." });
  await addPng("orb/off.png", shell("orb", {}, undefined, 0), { component: "orb", part: "off", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, off (dark glass)." });
  await addPng("badge/base.png", shell("badge"), { component: "badge", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Badge / medallion shell. Number or glyph is engine content." });
  await addPng("iconbtn/base.png", shell("iconbtn", { icon: undefined }), { component: "iconbtn", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Icon button wearing the kit's own glyph. Want it bare for your own icons? Set this piece's icon to 'none' on uikitmaker.com and re-export." });

  /* ── states for the OTHER controls people actually point at. Only the
     nine-slice buttons shipped hover/pressed/disabled, so an icon button,
     a checkbox and a radio arrived inert — you hover them in the Playground
     and nothing happens (owner: "I think it's missing the hover states").
     These bases render on the FULL canvas rather than cropped, so all four
     states already share one geometry — the swap can't shift the art. ── */
  const STATEFUL: { id: KitComponentId; family: string; opts: Record<string, unknown>; value?: number }[] = [
    { id: "iconbtn", family: "iconbtn", opts: { icon: undefined } },
    { id: "checkbox", family: "checkbox", opts: { icon: undefined }, value: 0 },
    { id: "radio", family: "radio", opts: { icon: undefined }, value: 0 },
  ];
  const SWAP_USAGE: Record<string, string> = {
    hover: "Highlighted (and Selected)",
    pressed: "Pressed",
    disabled: "Disabled",
  };
  for (const s of STATEFUL) {
    for (const stName of ["hover", "pressed", "disabled"] as const) {
      await addPng(`${s.family}/base-${stName}.png`, stateShell(s.id, stName, s.opts, s.value),
        { component: s.family, part: `base-${stName}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
          usage: `${SWAP_USAGE[stName]} state — wire as Sprite Swap beside base.png.` });
    }
  }

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
    const ddSvg = shell("dropdown", { icon: undefined }, slim);
    /* the shell's chevron rides ~56 SVG units off the right edge — the
       right border grows past it so nine-slice stretching never touches
       the glyph (the raster clamp still guards the center strip) */
    const ddSlice = sliceOf("dropdown", 110);
    ddSlice.right = Math.max(ddSlice.right, Math.round(80 * PNG_SCALE));
    /* no base-hover/pressed here on purpose: the dropdown is a COMPOSED
       control with no generated prefab, and its emphasis already ships as
       the row-highlight and row-check layers below. Three more full-size
       sprites nobody wires isn't free — a full kit is already 134 MB of
       uncompressed texture. */
    await addPng("dropdown/base.9.png", ddSvg,
      { component: "dropdown", part: "base", nineSlice: ddSlice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Closed dropdown shell, chevron included (as designed, safe inside the right cap). The value text is live engine content." }, true);
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

  /* ── the RIGS (owner round, 2026-08-04): joystick, health globe and
     season track ship as WORKING prefab ingredients, plus bare extras
     shells. Live-content rule holds: no words, numbers or reward icons
     baked anywhere — the shells carry the material, the engine carries
     the content. ── */
  await addPng("joystick/base.png", shell("joystick", { part: "base" }), { component: "joystick", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Touch-stick base — well and travel ring. The importer builds a wired Joystick prefab (PatternBreakJoystick drives the thumb)." });
  await addPng("joystick/thumb.png", shell("joystick", { part: "thumb" }), { component: "joystick", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Touch-stick thumb (candy knob) — PatternBreakJoystick moves it and reports a normalized Vector2." });
  await addPng("globe/rim.png", shell("healthglobe", { part: "rim" }, undefined, 0), { component: "globe", part: "rim", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe bezel — draws ABOVE the liquid." });
  await addPng("globe/glass.png", shell("healthglobe", { part: "glass" }, undefined, 0), { component: "globe", part: "glass", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe glass — the dark sphere behind the liquid; doubles as the liquid's circular mask." });
  await addPng("globe/liquid.png", shell("healthglobe", { part: "liquid" }, undefined, 0), { component: "globe", part: "liquid", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe liquid panel — use a Filled (Vertical) Image masked by the glass; fillAmount IS the health." });
  await addPng("seasontrack/base.png", shell("seasontrack", { part: "shell" }), { component: "seasontrack", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Season track, bare — lanes, spine, nodes and empty reward tiles. Lane names, level numbers and progress are live engine content (PatternBreakSeasonTrack)." });
  await addPng("extras/minimap.png", shell("minimap", { part: "shell" }), { component: "extras", part: "minimap", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Mini-map frame in the kit silhouette — render your map underneath, inside the well." });
  await addPng("extras/movecounter.png", shell("movecounter", { part: "shell" }, undefined, 0.8), { component: "extras", part: "movecounter", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Move-counter tile, bare — the number and caption are live engine text." });
  await addPng("extras/achievement.png", shell("achievetoast", { part: "shell" }), { component: "extras", part: "achievement", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Achievement toast plate with the gold medallion — the announcement and title are live engine text." });

  /* ── STRETCH-SAFE FACES (owner: a diagonal pattern shears when the
     nine-slice middle stretches). The wide, stateless pieces ship their
     face SPLIT: under (shell, rim, fill) → the pattern as a seamless
     tile → over (gloss, grain, inner edge, specular). Stacked in-engine
     the frame stretches, the pattern tiles at constant scale, and the
     gloss stays one sweep — the app's look at any width. Only worth the
     bytes when the kit actually wears a pattern. ── */
  const facePat = base.candy.pattern;
  if (facePat && facePat.type !== "none" && facePat.opacity > 1) {
    for (const [fam, cid] of [["panel", "panel"], ["header", "header"]] as const) {
      const sl = sliceOf(cid as KitComponentId, cid === "panel" ? 380 : 158);
      /* ONE union crop box for the pair (same trick the swap states use):
         cropped apart, the over layer — which has no shell or shadow —
         lands in a tighter box and every gloss sits misplaced once the
         two are stretched over the same rect */
      const grp = `faceLayer-${fam}`;
      await addPng(`${fam}/base-under.9.png`, shell(cid as KitComponentId, { faceLayer: "under" }, slim),
        { component: fam, part: "base-under", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face, LOWER half: shell, rim and fill, no pattern. Sliced. Put the tiled pattern above it (masked), then base-over." }, true, grp);
      await addPng(`${fam}/base-over.9.png`, shell(cid as KitComponentId, { faceLayer: "over" }, slim),
        { component: fam, part: "base-over", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face, UPPER half: gloss, grain, inner edge and specular over transparency. Sliced, drawn last — the gloss stays ONE sweep at any width." }, true, grp);
      /* the STENCIL: the face silhouette alone, opaque. Unity's Mask only
         alpha-clips when its graphic is hidden, so masking with a visible
         art layer gives a RECTANGULAR mask and the pattern spills past
         the shape (field: "pattern mask is off here"). A dedicated hidden
         mask sprite clips exactly, with no glow fringe to leak through. */
      await addPng(`${fam}/base-mask.9.png`, shell(cid as KitComponentId, { faceLayer: "mask" }, slim),
        { component: fam, part: "base-mask", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face STENCIL: the bare face silhouette. Put it on a hidden Mask (Show Mask Graphic OFF) with the tiled pattern as its child — that clips the pattern to the shape exactly." }, true, grp);
    }
    /* the face pattern as a seamless tile: one cell, drawn at the same
       size and angle build() uses, so a Tiled Image reads identical to
       the baked pattern at 1:1 */
    const K1 = 1; // component faces render at K=1 in the export sizes
    const ps = (8 + facePat.scale * 0.9) * K1;
    const ang = ((facePat.angle ?? 0) % 180 + 180) % 180;
    const diag = ang % 90 !== 0;
    const cellW = Math.max(8, Math.round(ps * (diag ? Math.SQRT2 : 1)));
    const patC = facePat.color ? facePat.color : darken(innerC, 0.2);
    const patTile = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellW}" viewBox="0 0 ${cellW} ${cellW}">` +
      `<defs><pattern id="fp" width="${ps.toFixed(3)}" height="${ps.toFixed(3)}" patternUnits="userSpaceOnUse"${ang ? ` patternTransform="rotate(${ang})"` : ""}>${textPatternCell(facePat.type, ps, patC)}</pattern></defs>` +
      `<rect width="${cellW}" height="${cellW}" fill="url(#fp)" opacity="${Math.max(0, Math.min(1, facePat.opacity / 100)).toFixed(2)}"/></svg>`;
    await addPng("fx/face-tile.png", patTile,
      { component: "fx", part: "face-tile", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "The kit's face pattern as ONE seamless cell. Use on a Tiled Image between base-under and base-over — it keeps its angle and rhythm at any size, so stretching never shears it." });
  }
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

  /* ── fonts FIRST: ship the kit's faces with their licenses — and register
     the primary for embedding, because an SVG rasterized through an <img>
     is a SEALED document that cannot see the page's fonts. Without this,
     every <text> in every rasterized export (baked alphabet, stamps, any
     text-bearing sprite) silently falls back to a system face (field: the
     baked MIAMI shipped skinny system glyphs in full kit dress). ── */
  onProgress?.(0, pngQueue.length + 1, "fonts");
  const famList = [...new Set([st.cfg.type.font, ...(st.cfg.type.listFont ? [st.cfg.type.listFont] : [])])].slice(0, 4);
  let primaryFontFile: string | null = null;
  let primaryFontBytes: Uint8Array | null = null;
  for (const fam of famList) {
    const got = await fetchKitFont(fam).catch(() => null);
    if (!got) continue;
    const famSlug = fam.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    files.push({ path: `fonts/${got.file}`, data: got.bytes });
    files.push({ path: `fonts/${famSlug}-${got.licenceName}`, data: got.licenceText });
    if (fam === st.cfg.type.font) { primaryFontFile = `fonts/${got.file}`; primaryFontBytes = got.bytes; }
  }
  setEmbedFont(st.cfg.type.font, primaryFontBytes);

  /* ── rasterise everything queued above, reporting progress ────── */
  await rasterQueue();

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
  let bakedFace: { file: string; metrics: string; pointSize: number; layerFill: string | null; layerStroke: string | null; layerShadow: string | null; layerGlints: string | null } | null = null;
  try {
    /* Pro-only (owner call): the baked faces are the type showpiece — the
       starter keeps the SDF face + gradient preset and upsells the rest.
       No font bytes = the rasterizer would bake SYSTEM glyphs in kit dress
       (review catch: an offline export shipped that silently) — skip the
       bake then too; the SDF face still styles labels from the recipe */
    if (full && !primaryFontBytes) console.warn("engine export: kit font unavailable — the baked alphabet face is skipped this export");
    const baked = full && primaryFontBytes ? await bakeAlphabetFace(base) : null;
    if (baked) {
      files.push({ path: "fonts/kitface-baked.png", data: baked.png });
      files.push({ path: "fonts/kitface-baked.json", data: new TextEncoder().encode(baked.metrics) });
      const lp = baked.layerPngs;
      const lput = (k: "fill" | "stroke" | "shadow" | "glints"): string | null => {
        const d = lp?.[k];
        if (!d) return null;
        const path = `fonts/kitface-baked-${k}.png`;
        files.push({ path, data: d });
        return path;
      };
      bakedFace = { file: "fonts/kitface-baked.png", metrics: "fonts/kitface-baked.json", pointSize: baked.pointSize,
        layerFill: lput("fill"), layerStroke: lput("stroke"), layerShadow: lput("shadow"), layerGlints: lput("glints") };
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
      /* The input's affordance, as NUMBERS rather than baked pixels. The
         renderer draws it at x = (bevel + 4) + 20k from the shell's left
         edge, centred on the well, at 30k — and one SVG px is one prefab
         unit (the sprite rasterizes at pngScale and the prefab divides by
         it again), so these travel straight through. */
      placeholder: (() => {
        const pc = pieceCfg("input");
        const pk = ({ s: 0.72, m: 1, l: 1.22 } as const)[effKitSize(st.kitSizes.input)] ?? 1;
        const pbw = pc.bevel.off ? 0 : pc.bevel.width;
        return {
          text: "Type something…",
          left: Math.round(((pbw + 4) + 20 * pk) * 10) / 10,
          size: Math.round(30 * pk * 10) / 10,
          /* Measured DOWN from the sprite's top edge, because the sprite is
             cropped tight to the geometry and the extrusion hangs below the
             field — so the sprite's middle is NOT the field's middle. The
             importer turns this into a Unity offset once it knows the rect:
             y = rect.height / 2 - centerFromTop. */
          centerFromTop: Math.round(((124 * pk) / 2 + 1 + (pc.type.oy ?? 0) * pk) * 10) / 10,
          color: "#FFFFFF",
          opacity: 55,
          italic: true,
        };
      })(),
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
          /* prefab label font size in design px — the app scales button
             words by the kit's Type Size dial (52 = baseline); hardcoding
             40 left big-type kits with tiny words (owner: "the text sits
             so small in that area") */
          labelSize: Math.round(40 * (base.type.size / 52) * 10) / 10,
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
        /* per-state text ink — the kit's OWN state recipes for live labels
           (owner field report: the face swaps on press but "the text isn't
           following the face" — e.g. a down state that flips the gradient).
           Only states whose designed fork actually changes the ink are
           listed; the importer wires a Label State Ink component that
           applies them in sync with the Button's Sprite Swap. */
        stateStyles: (["hover", "pressed", "disabled"] as const).flatMap((sn) => {
          const f = base.stateDesigns[sn];
          if (!f) return [];
          /* ink entry only when the fork EXPLICITLY changes the text ink
             (designFor: absent .type mirrors the master live) */
          const t = f.type, b = base.type;
          const inkOk = !!t && (t.fillMode === "solid" || t.fillMode === "gradient")
            && !(t.fillMode === b.fillMode && t.fill === b.fill && (t.fillMode !== "gradient" || t.fill2 === b.fill2));
          /* the label RIDES THE FACE: a state that forks its extrusion depth
             sinks/lifts the face top by the delta and the app's label moves
             with it — the owner's Miami pressed state (23 -> 9) is exactly
             this, no ink change at all ("type is not following face") */
          const dy = f.candy ? Math.round((base.candy.extrusion.depth - f.candy.extrusion.depth) * 10) / 10 : 0;
          if (!inkOk && !dy) return [];
          return [{ state: sn, fillMode: inkOk ? t!.fillMode : null, fill: inkOk ? t!.fill : null, fill2: inkOk && t!.fillMode === "gradient" ? t!.fill2 : null, dy }];
        }),
        /* the baked color font — atlas + metrics the importer assembles
           into "KitFace Baked": app-exact glyphs for hero/display text */
        bakedFace,
        note: "Render all labels as live engine text in this face.",
      },
      /* highlight = the app's bloom/aura ink: lighting tint FIRST, Highlight
         role as fallback (bevel's hiC) — emitting only the Highlight left
         tinted-light kits with neutral gray auras in Unity (owner: "the
         glows underneath the components are rendering weird") */
      /* per-FAMILY label state ink: the maker may fork the text on one
         specific button (a piece-scope down state), not the master — the
         master-level typography.stateStyles above would miss it. Same
         qualification rules; family entries win over the master set. */
      /* The hover GLOW and press LIFT, per family. These are the two moves
         the app makes on a state that the sprite deliberately doesn't
         carry: the glow is a soft halo that would blow up the sprite's
         bounds and can't nine-slice, and the lift is a transform. Without
         them a Unity rollover is a quiet face swap — the piece changes but
         nothing announces it (owner: "I'm not getting the glows on hover…
         it's impossible for me to know" whether it hovered at all). */
      stateFx: ([["primary", "button-primary"], ["secondary", "button-secondary"], ["small", "button-small"],
                 ["chip", "chip"], ["tab", "tab"], ["datarow", "list-row"], ["slot", "item-slot"],
                 ["iconbtn", "iconbtn"], ["checkbox", "checkbox"], ["radio", "radio"]] as const).flatMap(([pid, fam]) => {
        const ps = pieceCfg(pid).states;
        return (["default", "hover", "pressed", "disabled"] as const).map((sn) => ({
          family: fam,
          state: sn,
          // a disabled piece never glows, whatever the dial says — the
          // renderer forces it to zero too, and a glowing dead button is
          // the wrong signal in any kit
          glow: sn === "disabled" ? 0 : Math.round(ps[sn].glow),
          /* RELATIVE to the resting state, and that matters: most kits set
             the same lift on all four (Miami is -8 across the board), so
             shipping the absolute number would shove every button off the
             spot the designer put it in the moment the scene woke up. The
             delta is the only part Unity can use. Positive is UP, Unity's
             convention — the app measures the other way. */
          lift: Math.round((ps.default.lift - ps[sn].lift) * 10) / 10,
        }));
      }),
      labelStates: ([["primary", "button-primary"], ["secondary", "button-secondary"], ["small", "button-small"], ["chip", "chip"], ["tab", "tab"]] as const).flatMap(([pid, fam]) => {
        const pc = pieceCfg(pid);
        return (["hover", "pressed", "disabled"] as const).flatMap((sn) => {
          const f = pc.stateDesigns[sn];
          if (!f) return [];
          const t = f.type, b2 = pc.type;
          const inkOk = !!t && (t.fillMode === "solid" || t.fillMode === "gradient")
            && !(t.fillMode === b2.fillMode && t.fill === b2.fill && (t.fillMode !== "gradient" || t.fill2 === b2.fill2));
          const dy = f.candy ? Math.round((pc.candy.extrusion.depth - f.candy.extrusion.depth) * 10) / 10 : 0;
          if (!inkOk && !dy) return [];
          return [{ family: fam, state: sn, fillMode: inkOk ? t!.fillMode : null, fill: inkOk ? t!.fill : null, fill2: inkOk && t!.fillMode === "gradient" ? t!.fill2 : null, dy }];
        });
      }),
      /* per-family label sizes, the APP'S OWN formula (owner: "make sure
         these sizes correlate to what we output from the app"): each
         family's geometry font size x the kit-size factor x the Type Size
         dial over its 52 baseline — the same three numbers renderKit uses */
      labelSizes: ([["primary", "button-primary", 42], ["secondary", "button-secondary", 42], ["small", "button-small", 32], ["chip", "chip", 28], ["tab", "tab", 30]] as const).map(([pid, fam, fs]) => {
        const pc = pieceCfg(pid);
        const sk = ({ s: 0.72, m: 1, l: 1.22 } as const)[effKitSize(st.kitSizes[pid])] ?? 1; // bevel's SIZE_K
        /* x0.74 fit factor: the app WIDENS its shell to the word, a Unity
           rect is fixed — the raw app size crowds it. Owner-calibrated in
           three field passes ("too big" at 1.0/0.78, "too much vertical
           space" at 0.70 — the middle ground); per-font taste stays a
           per-label Inspector edit. */
        return { family: fam, size: Math.round(fs * sk * (pc.type.size / 52) * 0.74 * 10) / 10 };
      }),
      palette: { bevel: bevelC, glow: glowC, innerFill: innerC, well: wellC, highlight: base.lighting.tint ?? base.effects.Highlight ?? "#FFFFFF", shadow: base.effects.Shadow ?? darken(bevelC, 0.5) },
      /* the resting aura around pieces (app: candy.bloom) — deliberately NOT
         baked into sprites (auras overlap what's behind them), composed
         engine-side from fx/glow.png; the Playground shows the pattern */
      bloom: { opacity: base.candy.bloom?.opacity ?? 0, size: base.candy.bloom?.size ?? 0 },
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
  /* illustrated docs, drawn from THIS kit (never stock art) — a failed
     rasterization just means a text-only README, never a failed export */
  let figs: { path: string; data: Uint8Array }[] = [];
  try { figs = await readmeFigures(base); } catch { figs = []; }
  for (const f of figs) files.push(f);
  files.push({ path: "UNITY-README.md", data: unityReadme(st, !!primaryFontFile, bakedFace != null, figs.length > 0) });
  files.push({ path: "Editor/PatternBreakKitImporter.cs", data: UNITY_IMPORTER });
  files.push({ path: "Runtime/PatternBreakHeroLabel.cs", data: HERO_LABEL_RUNTIME });
  files.push({ path: "Runtime/PatternBreakLabelStateInk.cs", data: LABEL_STATE_INK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakTouchStick.cs", data: TOUCH_STICK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakSeasonTrack.cs", data: SEASON_TRACK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakStateFx.cs", data: STATE_FX_RUNTIME });

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
  const sharedScripts = new Set([
    "Editor/PatternBreakKitImporter.cs",
    "Runtime/PatternBreakHeroLabel.cs", "Runtime/PatternBreakLabelStateInk.cs",
    "Runtime/PatternBreakTouchStick.cs", "Runtime/PatternBreakSeasonTrack.cs",
    "Runtime/PatternBreakStateFx.cs",
  ]);
  const rooted = files.map((f) => ({
    ...f,
    path: sharedScripts.has(f.path) ? `UIKitMaker/${f.path}` : `UIKitMaker/${safeSlug}/${f.path}`,
  }));
  download(`${safeSlug}-engine-kit.zip`, makeZip(rooted));
  setEmbedFont("", null); // don't leak the embed into unrelated rasterizations
}

/* ── the alphabet bake ──────────────────────────────────────────────
   Self-calibrating: an ink-only "H" (all fx stripped) pins where the pen
   and baseline sit in specimen coordinates; canvas measureText supplies
   the font-true advances; then every glyph renders with the FULL
   treatment and its art box is placed relative to that pen. No guessing
   about effect bleed — the calibration render IS the reference. */
const BAKE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:;%+-'&()";
const BAKE_S = 3; // raster scale over the 52px specimen em → 156px baked em

async function rasterCanvas(svg: string, scale: number): Promise<HTMLCanvasElement> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return cv;
}
function scanInk(cv: HTMLCanvasElement): { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null {
  const px = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
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
async function rasterInk(svg: string, scale: number): Promise<{ cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null> {
  return scanInk(await rasterCanvas(svg, scale));
}

// exported for direct verification — the bake runs headless-testable this way
export async function bakeAlphabetFace(base: GenConfig): Promise<{ png: Uint8Array; layerPngs: { fill?: Uint8Array; stroke?: Uint8Array; shadow?: Uint8Array; glints?: Uint8Array } | null; metrics: string; pointSize: number } | null> {
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

  /* the type effects' full blur reach, reserved on EVERY bake render — the
     specimen svg says overflow:visible, but a raster clips at the canvas
     edge, and a strong glow baked a hard-edged slab into each glyph cell
     (owner, Unity: "any way to prevent this clipping on the glow?"). The
     SAME pad goes to the calibration render too, so pen/baseline and every
     variant stay in one coordinate frame. Reach mirrors the engine's own
     margins (bevel: glow size*0.8*3; shadow |x|+|y|+blur*1.5). */
  const fxPad = Math.ceil(Math.max(
    base.type.glow.on ? base.type.glow.size * 0.8 * 3 : 0,
    base.type.shadow.on ? Math.abs(base.type.shadow.x) + Math.abs(base.type.shadow.y) + base.type.shadow.blur * 1.5 : 0,
  ));

  // calibration: ink-only H → pen x and baseline y in raster coordinates
  const strip = (c: GenConfig) => {
    c.type.size = 52;
    c.type.outline.on = false; c.type.shadow.on = false;
    c.type.glow.on = false; c.type.emboss.on = false;
    c.type.stripes = undefined; c.type.glints = undefined;
  };
  const calBox = await rasterInk(renderTypeSpecimen(base, "H", { keepCase: true, highlight: "", mutate: strip, fxPad }), BAKE_S);
  if (!calBox) return null;
  const hMet = mx.measureText("H");
  const penX = calBox.x0 + (hMet.actualBoundingBoxLeft ?? 0) * BAKE_S;
  const baseY = calBox.y0 + (hMet.actualBoundingBoxAscent ?? ascent / BAKE_S) * BAKE_S;

  type Baked = { u: number; adv: number; bx: number; by: number; w: number; h: number; cv?: HTMLCanvasElement; sx?: number; sy?: number; x?: number; y?: number };
  /* four treatments per glyph:
     - full: the solo face (everything) — what a single KitFace Baked shows
     - fill: fill + pattern + glints + emboss, NO stroke/shadow/glow
     - stroke: outline + glow only — NO shadow (owner: per-glyph shadows
       painted seams onto neighboring strokes)
     - shadow: the pure cast shadow, isolated by rendering the stroked
       glyph WITH and WITHOUT its shadow and subtracting — one soft
       app-exact shadow layer that sits behind the whole stroke badge
     Shadow → Stroke → Fill stacked reproduces the app's paint order:
     one universal shadow, all strokes merged, no stroke over a fill. */
  const strokeBase = (c: GenConfig) => {
    c.type.size = 52; c.type.fillOpacity = 0;
    c.type.stripes = undefined; c.type.glints = undefined; c.type.emboss.on = false;
  };
  /* the glint FIELD (owner reference: streaks crossing the whole word):
     fixed band offsets so every glyph's bands sit at the same heights —
     adjacent letters' bands align into continuous streaks at type time */
  const GLINT_FIELD = [
    { dy: -0.3, h: 0.16, o: 0.55 },
    { dy: -0.02, h: 0.26, o: 0.9 },
    { dy: 0.34, h: 0.12, o: 0.4 },
  ];
  type VKey = "full" | "fill" | "stroke" | "glints";
  const variants: { key: VKey; mutate: (c: GenConfig) => void; glinted: boolean }[] = [
    { key: "full", mutate: (c) => { c.type.size = 52; }, glinted: true },
    // fill drops glints too — the dedicated Glints layer carries them in
    // the HeroLabel stack (baking them into Fill would double them)
    { key: "fill", mutate: (c) => { c.type.size = 52; c.type.outline.on = false; c.type.shadow.on = false; c.type.glow.on = false; c.type.glints = undefined; }, glinted: false },
    { key: "stroke", mutate: (c) => { strokeBase(c); c.type.shadow.on = false; }, glinted: false },
    { key: "glints", mutate: (c) => { c.type.size = 52; c.type.fillOpacity = 0; c.type.outline.on = false; c.type.shadow.on = false; c.type.glow.on = false; c.type.emboss.on = false; c.type.stripes = undefined; }, glinted: true },
  ];
  const sets: Record<VKey | "shadow", Baked[]> = { full: [], fill: [], stroke: [], glints: [], shadow: [] };
  const hasShadow = !!base.type.shadow.on;
  const spacingPx = 52 * ((base.type.spacing ?? 0) / 100) * BAKE_S;
  /* KERNING PAIRS (owner: "look at how far away the Y is from the other
     letterforms"): per-glyph advances can't carry the pair adjustments
     the browser applies (A·Y, L·T, …). Measure every pair against its
     glyphs' solo widths and ship the non-zero deltas; the importer
     writes them into TMP's pair-adjustment table so Unity spaces baked
     pairs exactly like the app. Same units as the advances. */
  const kerning: { l: number; r: number; k: number }[] = [];
  {
    const solo = new Map<string, number>();
    for (const ch of BAKE_GLYPHS) solo.set(ch, mx.measureText(ch).width);
    for (const a of BAKE_GLYPHS) for (const b of BAKE_GLYPHS) {
      const kp = mx.measureText(a + b).width - solo.get(a)! - solo.get(b)!;
      if (Math.abs(kp) > 0.1) kerning.push({ l: a.codePointAt(0)!, r: b.codePointAt(0)!, k: Math.round(kp * BAKE_S * 10) / 10 });
    }
  }
  for (const ch of BAKE_GLYPHS + " ") {
    const adv = mx.measureText(ch).width * BAKE_S + spacingPx;
    if (ch === " ") {
      for (const k of ["full", "fill", "stroke", "glints", "shadow"] as const)
        sets[k].push({ u: 32, adv, bx: 0, by: 0, w: 0, h: 0 });
      continue;
    }
    const u = ch.codePointAt(0)!;
    /* seeded glint variation (owner: stars on EVERY letter read as
       repetition; the stripe should cross letterforms). Per-glyph seed:
       ~1/3 of glyphs get one star at a scattered spot; the slab bakes
       3x wide so its end-caps fall outside the glyph and neighboring
       letters' stripes fuse into one continuous streak. Kits with
       glints off are untouched (the knobs only shape an active glint). */
    const h32 = (u * 2654435761) >>> 0;
    const rnd = (k: number) => ((h32 >>> (k * 7)) & 127) / 127;
    const glintStars = rnd(0) < 0.36
      ? [{ f: 0.12 + rnd(1) * 0.72, dy: (rnd(2) - 0.5) * 0.56, s: 0.08 + rnd(3) * 0.09, r: rnd(1) * 44 - 22 }]
      : null;
    const push = (key: VKey | "shadow", box: { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null) => {
      if (!box) return;
      sets[key].push({
        u, adv,
        bx: box.x0 - penX, by: baseY - box.y0,
        w: box.w, h: box.h, cv: box.cv, sx: box.x0, sy: box.y0,
      });
    };
    for (const v of variants) {
      const box = await rasterInk(
        renderTypeSpecimen(base, ch, {
          keepCase: true, highlight: "", mutate: v.mutate, fxPad,
          glintBand: v.glinted ? 3 : undefined,
          glintStars: v.glinted ? glintStars : undefined,
          glintBands: v.key === "glints" ? GLINT_FIELD : undefined,
        }),
        BAKE_S,
      );
      if (v.key === "stroke" && box && hasShadow) {
        // shadow isolation: (stroke + shadow) minus (stroke) = the shadow
        const withSh = await rasterCanvas(
          renderTypeSpecimen(base, ch, { keepCase: true, highlight: "", mutate: strokeBase, fxPad }),
          BAKE_S,
        );
        const wcx = withSh.getContext("2d")!;
        wcx.globalCompositeOperation = "destination-out";
        wcx.drawImage(box.cv, 0, 0);
        wcx.globalCompositeOperation = "source-over";
        push("shadow", scanInk(withSh));
      }
      push(v.key, box); // a face without this glyph — skip, TMP falls back
    }
  }
  if (sets.full.length < 10) return null; // face never loaded — don't ship garbage

  // shelf-pack into a 2048-wide atlas, tallest first for tight rows
  const PAD = 2;
  const AW = 2048;
  const pack = (list: Baked[]): number | null => {
    const order = list.filter((g) => g.w > 0).sort((a, b) => b.h - a.h);
    let cx = PAD, cy = PAD, rowH = 0;
    for (const g of order) {
      if (cx + g.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
      g.x = cx; g.y = cy;
      cx += g.w + PAD;
      if (g.h > rowH) rowH = g.h;
    }
    const AH = cy + rowH + PAD;
    return AH > 4096 ? null : AH; // absurd treatment size — bail rather than truncate
  };
  /* Guaranteed fade-out: a glyph's glow/shadow slab must reach ZERO alpha
     inside its own cell — quads butt in the mesh, and a slab still carrying
     ink at the crop line renders as a hard-edged plate around the word
     (owner: "the color has to fade out completely on the outside edge of
     the first and last letters and the tops and bottoms of all letters").
     The letterform's own box says how much of each cell is effect slab; the
     slab's outer stretch (beyond KEEP, which shelters the outline and the
     falloff's bright core) eases to zero with a smoothstep. Cells with no
     slab — plain or outline-only faces — pass through untouched, and
     between letters the neighbors' feathered slabs crossfade instead of
     butting. No dial gets capped; the bake just finishes the fade. */
  const FEATHER_KEEP = 12 * BAKE_S;
  type Slab = { l: number; t: number; r: number; b: number };
  const featherCell = (g: Baked, m: Slab): HTMLCanvasElement | null => {
    const zl = Math.max(0, m.l - FEATHER_KEEP), zr = Math.max(0, m.r - FEATHER_KEEP);
    const zt = Math.max(0, m.t - FEATHER_KEEP), zb = Math.max(0, m.b - FEATHER_KEEP);
    const Z = 4 * BAKE_S; // a zone thinner than this can't fade convincingly
    if (zl < Z && zr < Z && zt < Z && zb < Z) return null;
    const out = document.createElement("canvas");
    out.width = g.w; out.height = g.h;
    const ox = out.getContext("2d")!;
    ox.drawImage(g.cv!, g.sx!, g.sy!, g.w, g.h, 0, 0, g.w, g.h);
    const id = ox.getImageData(0, 0, g.w, g.h);
    const px = id.data;
    const ramp = (d: number, z: number) => { if (z < Z) return 1; const t = Math.min(1, d / z); return t * t * (3 - 2 * t); };
    for (let y = 0; y < g.h; y++) {
      const ay = Math.min(ramp(y, zt), ramp(g.h - 1 - y, zb));
      for (let x = 0; x < g.w; x++) {
        const a = Math.min(ay, ramp(x, zl), ramp(g.w - 1 - x, zr));
        if (a < 1) px[(y * g.w + x) * 4 + 3] *= a;
      }
    }
    ox.putImageData(id, 0, 0);
    return out;
  };
  const rasterAtlas = (list: Baked[], AH: number, slabs?: Map<number, Slab>): Promise<Uint8Array> => {
    const atlas = document.createElement("canvas");
    atlas.width = AW; atlas.height = AH;
    const ax = atlas.getContext("2d")!;
    for (const g of list) if (g.w > 0) {
      const m = slabs?.get(g.u);
      const fc = m ? featherCell(g, m) : null;
      if (fc) ax.drawImage(fc, g.x!, g.y!);
      else ax.drawImage(g.cv!, g.sx!, g.sy!, g.w, g.h, g.x!, g.y!, g.w, g.h);
    }
    return new Promise((resolve, reject) => {
      atlas.toBlob(async (b) => {
        if (!b) { reject(new Error("atlas raster failed")); return; }
        resolve(new Uint8Array(await b.arrayBuffer()));
      }, "image/png");
    });
  };

  /* the letterform's own ink boxes, captured BEFORE the union pass rewrites
     them — each cell's slab margins = how far its effects reach past the
     letter, and that is the room the feather may use */
  const fillBox = new Map(sets.fill.filter((g) => g.w > 0 && g.cv).map((g) => [g.u, { sx: g.sx!, sy: g.sy!, w: g.w, h: g.h }]));
  const slabsVs = (list: Baked[]): Map<number, Slab> => {
    const m = new Map<number, Slab>();
    for (const g of list) {
      const f = fillBox.get(g.u);
      if (!f || g.w <= 0) continue;
      m.set(g.u, {
        l: Math.max(0, f.sx - g.sx!), t: Math.max(0, f.sy - g.sy!),
        r: Math.max(0, (g.sx! + g.w) - (f.sx + f.w)), b: Math.max(0, (g.sy! + g.h) - (f.sy + f.h)),
      });
    }
    return m;
  };

  const fullH = pack(sets.full);
  if (fullH == null) return null;
  const png = await rasterAtlas(sets.full, fullH, slabsVs(sets.full));

  /* ── ONE SKELETON, FOUR SKINS (owner: "think about a foolproof way to
     bind these together"). Every glyph's four layer variants are packed
     in the UNION of their ink boxes, so all four textures share identical
     rects, bearings and advances — the importer builds ONE font asset
     (one kerning table, one Glyph Adjustment Table) and four materials
     that differ only in texture. The layers become incapable of
     disagreeing about layout; the whole face-to-face sync class of bugs
     (torn strokes, half-applied pairs, stale re-flows) has nothing left
     to act on. All variants render on the same specimen grid, so the
     union is box arithmetic and each atlas crops from the variant's
     existing canvas — no re-rendering. */
  const LAYER_KEYS = ["fill", "stroke", "shadow", "glints"] as const;
  const byU = (list: Baked[]) => new Map(list.map((g) => [g.u, g]));
  const maps = { fill: byU(sets.fill), stroke: byU(sets.stroke), shadow: byU(sets.shadow), glints: byU(sets.glints) };
  const skeleton: Baked[] = [];
  for (const ch of BAKE_GLYPHS + " ") {
    const u = ch.codePointAt(0)!;
    const present = LAYER_KEYS.map((k) => maps[k].get(u)).filter((g): g is Baked => !!g);
    if (!present.length) continue;
    const inked = present.filter((g) => g.w > 0);
    if (!inked.length) { skeleton.push(present[0]); continue; } // the space: advance only
    const ux0 = Math.min(...inked.map((g) => g.sx!));
    const uy0 = Math.min(...inked.map((g) => g.sy!));
    const ux1 = Math.max(...inked.map((g) => g.sx! + g.w));
    const uy1 = Math.max(...inked.map((g) => g.sy! + g.h));
    const skel: Baked = { u, adv: present[0].adv, bx: ux0 - penX, by: baseY - uy0, w: ux1 - ux0, h: uy1 - uy0 };
    skeleton.push(skel);
    for (const g of inked) { g.sx = ux0; g.sy = uy0; g.w = skel.w; g.h = skel.h; g.bx = skel.bx; g.by = skel.by; }
  }
  const layersH = pack(skeleton);
  const layerPngs: { fill?: Uint8Array; stroke?: Uint8Array; shadow?: Uint8Array; glints?: Uint8Array } = {};
  if (layersH != null) {
    for (const skel of skeleton)
      for (const k of LAYER_KEYS) { const g = maps[k].get(skel.u); if (g) { g.x = skel.x; g.y = skel.y; } }
    for (const k of LAYER_KEYS)
      // a set with only the space entry means the kit has that layer OFF.
      // stroke (outline + glow) and shadow carry the blurred slabs — they
      // feather; fill is the letterform and glints fuse across letters by
      // design, so both pass through exact.
      if (sets[k].length > 5) layerPngs[k] = await rasterAtlas(sets[k], layersH, k === "stroke" || k === "shadow" ? slabsVs(sets[k]) : undefined);
  }
  const layered = layersH != null && layerPngs.fill && layerPngs.stroke;

  const emit = (list: Baked[]) => list.map((g) => ({
    u: g.u, x: g.x ?? 0, y: g.y ?? 0, w: g.w, h: g.h,
    bx: Math.round(g.bx * 10) / 10, by: Math.round(g.by * 10) / 10,
    adv: Math.round(g.adv * 10) / 10,
  }));
  const pointSize = 52 * BAKE_S;
  const metrics = JSON.stringify({
    pointSize,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    lineHeight: Math.round((ascent + descent) * 1.06),
    atlasW: AW, atlasH: fullH,
    kerning,
    glyphs: emit(sets.full),
    ...(layered ? {
      layersAtlasW: AW, layersAtlasH: layersH,
      // ONE glyph list for every layer — the shared skeleton
      layerGlyphs: emit(skeleton),
    } : {}),
  });
  return { png, layerPngs: layered ? layerPngs : null, metrics, pointSize };
}

/* The kit's ONE runtime script: the HeroLabel sync (owner, on editing a
   four-layer label by hand: "no real point if it is supposed to be
   dynamic"). Everything else the importer does is editor-only, but a
   layered label must follow dynamic text in play mode and in builds, so
   this ships as a real component — tiny and dependency-free on purpose. */
/* Runtime: the two things a state sprite CAN'T carry — the hover glow and
   the press lift. The glow is a soft halo that would blow up the sprite's
   bounds and can't nine-slice; the lift is a transform. Both were promised
   as "engine-composed" in the README and never actually built, so a Unity
   rollover was a quiet face swap (owner: "I'm not getting the glows on
   hover… it's impossible for me to know" whether it hovered). */
const STATE_FX_RUNTIME = `using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Sits beside the Button. Numbers come from the kit's own state dials —
     the same Glow and Lift you set on uikitmaker.com. */
  [AddComponentMenu("UI Kit Maker/State FX")]
  [RequireComponent(typeof(RectTransform))]
  public class StateFx : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler {
    [Header("Look — edited on uikitmaker.com, tune freely here")]
    public Sprite glowSprite;
    [Tooltip("How far the aura sprite overhangs the piece, per side, in UI units.")]
    public Vector2 glowPad;
    public Color glowColor = Color.white;
    [Tooltip("Glow strength 0-100 per state, straight from the kit's Glow dial.")]
    public float restGlow, hoverGlow = 100f, pressedGlow, disabledGlow;
    [Tooltip("Vertical shift in pixels per state — the press sink. Positive is up.")]
    public float restLift, hoverLift, pressedLift;
    [Tooltip("Seconds to cross-fade between states.")]
    public float fade = 0.11f;

    RectTransform rt, glowRt;
    Image glowImg;
    Selectable sel;
    bool over, down;
    float glowNow, glowTo, liftNow, liftTo, baseY;
    bool settling;

    void OnEnable() {
      rt = GetComponent<RectTransform>();
      sel = GetComponent<Selectable>();
      baseY = rt.anchoredPosition.y;
      glowNow = glowTo = Target(out liftTo);
      liftNow = liftTo;
      /* the halo has to draw BEHIND the piece, and in Unity UI a child
         always draws in FRONT of its parent's own graphic — so it is a
         SIBLING inserted just before us. Built at runtime, which also
         keeps it out of the prefab and out of your scene until it's
         actually doing something. */
      if (Application.isPlaying && glowSprite != null && rt.parent != null) BuildGlow();
      Push(true);
    }
    void OnDisable() {
      if (glowRt != null) Destroy(glowRt.gameObject);
      glowRt = null; glowImg = null;
      if (rt != null) rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, baseY);
    }
    void BuildGlow() {
      var go = new GameObject(name + " Glow", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      go.hideFlags = HideFlags.DontSave;
      glowRt = go.GetComponent<RectTransform>();
      glowRt.SetParent(rt.parent, false);
      glowRt.SetSiblingIndex(rt.GetSiblingIndex()); // immediately before us = behind us
      glowRt.anchorMin = rt.anchorMin; glowRt.anchorMax = rt.anchorMax;
      glowRt.pivot = rt.pivot;
      glowRt.localScale = rt.localScale;
      /* sit exactly where the piece sits. Forgetting this parked every halo
         at the parent's anchor origin instead of behind its own button —
         one big blob in the corner (owner: "obviously not aligned, that's
         it cut off screen on the upper left"). */
      glowRt.anchoredPosition = rt.anchoredPosition;
      // the aura sprite is the piece plus a fixed overhang, so the pad is an
      // ADDITIVE offset — correct whether the piece is fixed or stretched
      glowRt.sizeDelta = rt.sizeDelta + glowPad * 2f;
      glowImg = go.GetComponent<Image>();
      glowImg.sprite = glowSprite;
      glowImg.raycastTarget = false;
      glowImg.color = new Color(glowColor.r, glowColor.g, glowColor.b, 0f);
    }
    float Target(out float lift) {
      if (sel != null && !sel.IsInteractable()) { lift = restLift; return disabledGlow; }
      if (down) { lift = pressedLift; return pressedGlow; }
      if (over) { lift = hoverLift; return hoverGlow; }
      lift = restLift; return restGlow;
    }
    void Retarget() { glowTo = Target(out liftTo); settling = true; }
    public void OnPointerEnter(PointerEventData e) { over = true; Retarget(); }
    public void OnPointerExit(PointerEventData e) { over = false; down = false; Retarget(); }
    public void OnPointerDown(PointerEventData e) { down = true; Retarget(); }
    public void OnPointerUp(PointerEventData e) { down = false; Retarget(); }

    /* Update runs ONLY while a transition is in flight — a component that
       ticks forever is how the Playground got slow the first time. */
    void Update() {
      if (!settling) return;
      var step = fade > 0.001f ? Time.unscaledDeltaTime / fade : 1f;
      glowNow = Mathf.MoveTowards(glowNow, glowTo, Mathf.Abs(glowTo - glowNow) * 1f + step * 100f);
      liftNow = Mathf.MoveTowards(liftNow, liftTo, Mathf.Abs(liftTo - liftNow) * 1f + step * 40f);
      if (Mathf.Abs(glowNow - glowTo) < 0.2f && Mathf.Abs(liftNow - liftTo) < 0.05f) {
        glowNow = glowTo; liftNow = liftTo; settling = false;
      }
      Push(false);
    }
    void Push(bool snap) {
      if (snap) { glowNow = glowTo; liftNow = liftTo; }
      if (glowImg != null) glowImg.color = new Color(glowColor.r, glowColor.g, glowColor.b, Mathf.Clamp01(glowNow / 100f) * 0.85f);
      if (rt != null) rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, baseY + liftNow);
      // the halo rides the lift with the piece, or it slides out from under it
      if (glowRt != null) glowRt.anchoredPosition = new Vector2(glowRt.anchoredPosition.x, baseY + liftNow);
    }
  }
}
`;

const HERO_LABEL_RUNTIME = `using UnityEngine;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* One text box for the whole layered hero label — and one TEXT, full
     stop. The Fill child is the only TextMeshPro in the stack: the only
     thing that lays out glyphs, wraps lines or reads the kerning table.
     Shadow, Stroke and Glints are ECHOES — plain CanvasRenderers that
     redraw the Fill's own mesh (the same mesh object, not a copy)
     wearing a different ink texture, behind it or in front of it. A
     layer cannot lag, wrap differently or kern differently, because a
     layer has nothing of its own to be wrong with: one geometry exists
     and every ink repaints it. Probe-proven in the field before it
     shipped — the echo held through live retyping, font-size scrubbing
     and Play mode, exactly where the four-text stack kept tearing. */
  [ExecuteAlways]
  [AddComponentMenu("UI Kit Maker/Hero Label")]
  public class HeroLabel : MonoBehaviour {
#if UNITY_2023_2_OR_NEWER
    [TextArea] public string text = "PLAY";
    public float fontSize = 150f;
    [Tooltip("Character spacing (tracking).")]
    public float spacing = 0f;
    [Tooltip("Word spacing.")]
    public float wordSpacing = 0f;
    [Tooltip("Line height for wrapped labels. Negative pulls lines together. (Field: a line height typed on the text used to leave the old shadow text behind — with echoes every layer follows it natively; this field just makes the value survive re-imports.)")]
    public float lineSpacing = 0f;
    [Tooltip("The button height this label was authored at. When set, resizing the button scales the type proportionally — like scaling. 0 = off.")]
    public float authoredHeight = 0f;
    [Tooltip("Move the whole word inside its button. Y up is positive — raise a word that optically sits low.")]
    public Vector2 nudge = Vector2.zero;
    [Tooltip("TMP margins (left, top, right, bottom). Editing the text's own Margins adopts into this.")]
    public Vector4 margins = Vector4.zero;
    [Header("Layer inks — wired by the importer")]
    [Tooltip("Soft shadow behind the whole word. Empty = this kit has no shadow layer.")]
    public Material shadowInk;
    [Tooltip("Every stroke merged into one band behind every fill. Empty = no stroke layer.")]
    public Material strokeInk;
    [Tooltip("Glint sparks in front of the fills. Empty = no glint layer.")]
    public Material glintsInk;
    string appliedText; float appliedSize; float appliedSpacing; float appliedWordSpacing; float appliedLineSpacing; float appliedK = 1f; Vector2 appliedNudge; Vector4 appliedMargins;
    TextMeshProUGUI tmp;
    CanvasRenderer shadowEcho, strokeEcho, glintsEcho;
    float SizeK() {
      if (authoredHeight < 0.5f) return 1f;
      var p = transform.parent as RectTransform;
      return p != null && p.rect.height > 1f ? p.rect.height / authoredHeight : 1f;
    }
    TextMeshProUGUI Tmp() {
      // cached: destroyed references fail the != null check (Unity's
      // overload) and re-collect on their own
      if (tmp != null) return tmp;
      foreach (var t in GetComponentsInChildren<TextMeshProUGUI>(true)) {
        if (t.gameObject.name == "Fill") { tmp = t; break; }
        if (tmp == null) tmp = t;
      }
      /* the retired four-text construction kept Shadow/Stroke/Glints
         TEXTS beside the Fill. With inks armed those are corpses —
         drawing them doubles every layer — so they sleep here and the
         echoes take over. (The importer rebuilds prefabs properly; this
         covers copies already placed in scenes.) */
      if (tmp != null && (strokeInk != null || shadowInk != null || glintsInk != null))
        foreach (var t in GetComponentsInChildren<TextMeshProUGUI>(true))
          if (t != tmp && (t.gameObject.name == "Shadow" || t.gameObject.name == "Stroke" || t.gameObject.name == "Glints") && t.gameObject.activeSelf)
            t.gameObject.SetActive(false);
      return tmp;
    }
    void OnEnable() { tmp = null; Apply(); }
    void OnTransformChildrenChanged() { tmp = null; }
    void OnDisable() {
      /* echoes SLEEP instead of dying: destroying a child while its
         parent is mid-(de)activation is a Unity error (field: the red
         "Cannot destroy GameObject" line during the probe), and a
         sleeping echo wakes clean with nothing to rebuild */
      if (shadowEcho != null) shadowEcho.gameObject.SetActive(false);
      if (strokeEcho != null) strokeEcho.gameObject.SetActive(false);
      if (glintsEcho != null) glintsEcho.gameObject.SetActive(false);
    }
    void Update() {
      var t = Tmp();
      if (t == null) return;
      if (text != appliedText || fontSize != appliedSize || spacing != appliedSpacing || wordSpacing != appliedWordSpacing || lineSpacing != appliedLineSpacing || nudge != appliedNudge || margins != appliedMargins || !Mathf.Approximately(SizeK(), appliedK)) { Apply(); return; }
      /* Adoption, in the editor AND in play mode: people tune the text
         itself — retype it, scrub Font Size, set Line Spacing, set
         Margins — and the group field follows so the change survives
         re-imports. With one text there is one voice to listen to; the
         four-way arbitration that used to live here is gone with the
         extra texts. */
      if (t.text != appliedText) { text = t.text; Apply(); return; }
      if (t.characterSpacing != appliedSpacing) { spacing = t.characterSpacing; Apply(); return; }
      if (t.wordSpacing != appliedWordSpacing) { wordSpacing = t.wordSpacing; Apply(); return; }
      if (t.lineSpacing != appliedLineSpacing) { lineSpacing = t.lineSpacing; Apply(); return; }
      if (!Mathf.Approximately(t.fontSize, appliedSize * appliedK)) { fontSize = appliedK > 0f ? t.fontSize / appliedK : t.fontSize; Apply(); return; }
      if (t.margin != appliedMargins) { margins = t.margin; Apply(); return; }
    }
    public void SetText(string value) { text = value; Apply(); }
    void Apply() {
      var t = Tmp();
      if (t == null) return;
      var k = SizeK();
      appliedText = text; appliedSize = fontSize; appliedSpacing = spacing; appliedWordSpacing = wordSpacing; appliedLineSpacing = lineSpacing; appliedK = k; appliedNudge = nudge; appliedMargins = margins;
      // auto-fit stays OFF: the group owns the size — TMP re-solving it
      // behind our back is how sizes used to wander
      t.enableAutoSizing = false;
      t.text = text;
      t.fontSize = fontSize * k;
      t.characterSpacing = spacing;
      t.wordSpacing = wordSpacing;
      t.lineSpacing = lineSpacing;
      /* the nudge rides the TEXT, never this root — the press sink
         (LabelStateInk) owns the root's position, and two writers on one
         transform is how things drift. The echoes copy the text's frame,
         so the nudge carries them automatically. */
      t.rectTransform.anchoredPosition = nudge;
      t.margin = margins;
    }
    /* Painted LAST each frame, after every possible layout write, from
       whatever mesh the text owns right now. SetMesh points the echo at
       the text's OWN mesh object — when TMP regenerates the word, the
       echoes are already holding the result. */
    void LateUpdate() {
      var t = Tmp();
      if (t == null) return;
      if (shadowInk != null) PaintEcho(ref shadowEcho, "Shadow (echo)", t, shadowInk);
      if (strokeInk != null) PaintEcho(ref strokeEcho, "Stroke (echo)", t, strokeInk);
      if (glintsInk != null) PaintEcho(ref glintsEcho, "Glints (echo)", t, glintsInk);
      // draw order is sibling order: shadow, stroke, the text, glints
      int i = 0;
      if (shadowEcho != null) Place(shadowEcho.transform, i++);
      if (strokeEcho != null) Place(strokeEcho.transform, i++);
      Place(t.transform, i++);
      if (glintsEcho != null) Place(glintsEcho.transform, i);
    }
    static void Place(Transform tr, int idx) {
      if (tr.GetSiblingIndex() != idx) tr.SetSiblingIndex(idx);
    }
    void PaintEcho(ref CanvasRenderer slot, string echoName, TextMeshProUGUI t, Material ink) {
      if (slot == null) {
        // adopt a survivor before minting one — a domain reload clears
        // these fields, not the scene
        var prior = transform.Find(echoName);
        var go = prior != null ? prior.gameObject : null;
        if (go == null) {
          go = new GameObject(echoName, typeof(RectTransform), typeof(CanvasRenderer));
          // never saved — rebuilt on load, in scenes and prefabs alike,
          // so an echo can never go stale on disk
          go.hideFlags = HideFlags.DontSave;
          go.transform.SetParent(transform, false);
        }
        slot = go.GetComponent<CanvasRenderer>();
        if (slot == null) slot = go.AddComponent<CanvasRenderer>();
      }
      if (!slot.gameObject.activeSelf) slot.gameObject.SetActive(true);
      /* the echo wears the text's exact frame, so the shared mesh lands
         in the same place. Writes are guarded — a RectTransform write
         dirties layout even when the value is unchanged. */
      var rt = (RectTransform)slot.transform;
      var src = t.rectTransform;
      if (rt.anchorMin != src.anchorMin) rt.anchorMin = src.anchorMin;
      if (rt.anchorMax != src.anchorMax) rt.anchorMax = src.anchorMax;
      if (rt.pivot != src.pivot) rt.pivot = src.pivot;
      if (rt.sizeDelta != src.sizeDelta) rt.sizeDelta = src.sizeDelta;
      if (rt.anchoredPosition != src.anchoredPosition) rt.anchoredPosition = src.anchoredPosition;
      if (rt.localRotation != src.localRotation) rt.localRotation = src.localRotation;
      if (rt.localScale != src.localScale) rt.localScale = src.localScale;
      slot.SetMesh(t.mesh);
      slot.SetMaterial(ink, null);
    }
#endif
  }
}
`;

/* Runtime script #2: state ink for live labels (owner field report: on
   press/hover the face sprite swaps but "the text isn't following the
   face" — e.g. a down state that flips the text gradient). SpriteSwap is
   pure engine; the label's ink change must ride the same pointer events,
   in play mode and in builds. Same contract as HeroLabel: tiny,
   dependency-free, wired automatically on example prefabs, usable by hand
   on any button. */
const LABEL_STATE_INK_RUNTIME = `using UnityEngine;
using UnityEngine.EventSystems;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* The kit's designed state recipes for LIVE TEXT: when the face swaps
     (hover / press), the label's ink follows — the same colors the maker
     set on uikitmaker.com. Play-mode behavior only (the importer keeps the
     resting dress in edit mode). Point 'label' at any TMP text to reuse it
     on your own buttons. */
  [AddComponentMenu("UI Kit Maker/Label State Ink")]
  public class LabelStateInk : MonoBehaviour
#if UNITY_2023_2_OR_NEWER
    , IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler
#endif
  {
#if UNITY_2023_2_OR_NEWER
    /* what MOVES: the whole label (single text or a layered stack root) */
    public RectTransform shiftTarget;
    /* what RE-INKS: a single dynamic-color text; null for layered baked
       stacks (their pixels are painted — they only ride the shifts) */
    public TextMeshProUGUI label;
    public bool inkOn;
    public bool restGradient; public Color restTop = Color.white; public Color restBottom = Color.white;
    public bool hoverOn; public bool hoverGradient; public Color hoverTop = Color.white; public Color hoverBottom = Color.white;
    public bool pressedOn; public bool pressedGradient; public Color pressedTop = Color.white; public Color pressedBottom = Color.white;
    /* the label RIDES THE FACE: a state that sinks or lifts the face
       moves the label by the same delta (design px, positive = down) */
    public float hoverShift; public float pressedShift;
    bool over, down; Vector2 basePos; bool basePosSet;
    RectTransform Mover() { return shiftTarget != null ? shiftTarget : (label != null ? label.rectTransform : null); }
    void OnEnable() { over = false; down = false; ApplyCurrent(); }
    void OnDisable() { over = false; down = false; }
    public void OnPointerEnter(PointerEventData e) { over = true; ApplyCurrent(); }
    public void OnPointerExit(PointerEventData e) { over = false; ApplyCurrent(); }
    public void OnPointerDown(PointerEventData e) { down = true; ApplyCurrent(); }
    public void OnPointerUp(PointerEventData e) { down = false; ApplyCurrent(); }
    void ApplyCurrent() {
      var mover = Mover();
      if (mover != null) {
        // base captured lazily at first apply — no scene-load-order games
        if (!basePosSet) { basePos = mover.anchoredPosition; basePosSet = true; }
        float shift = down ? pressedShift : over ? hoverShift : 0f;
        mover.anchoredPosition = basePos + new Vector2(0f, -shift);
      }
      if (label == null || !inkOn) return;
      if (down && pressedOn) Ink(pressedTop, pressedBottom, pressedGradient);
      else if (over && hoverOn) Ink(hoverTop, hoverBottom, hoverGradient);
      else Ink(restTop, restBottom, restGradient);
    }
    void Ink(Color top, Color bottom, bool grad) {
      if (grad) { label.enableVertexGradient = true; label.colorGradient = new VertexGradient(top, top, bottom, bottom); label.color = Color.white; }
      else { label.enableVertexGradient = false; label.color = top; }
    }
    /* edit-mode probes: right-click the component header. If Test Press
       moves the label but a real Play-mode press doesn't, the mechanics
       are fine and the pointer events are the problem — and vice versa.
       Each probe LOGS what it did: "nothing happened" then reads as
       either armed-0 or nothing-wired instead of a shrug. */
    [ContextMenu("Test Press")]
    void TestPress() {
      down = true; ApplyCurrent();
      var mover = Mover();
      Debug.Log("UI Kit Maker test press on '" + gameObject.name + "' — " + (mover == null
        ? "NOTHING WIRED TO MOVE (no shift target on this component)."
        : "holding '" + mover.gameObject.name + "' " + pressedShift + "px down (the armed value). If nothing moved on screen, run this on the piece in the scene Hierarchy, not the prefab file."));
    }
    [ContextMenu("Test Release")]
    void TestRelease() { down = false; over = false; ApplyCurrent(); Debug.Log("UI Kit Maker test release on '" + gameObject.name + "' — back to rest."); }
#endif
  }
}
`;

/* Runtime script #3: the touch stick. The joystick ships as base + thumb
   sprites and this component makes them a WORKING control — the "your
   kit, driving a character, thirty seconds after the drop" demo. */
const TOUCH_STICK_RUNTIME = `using UnityEngine;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Touch stick — press or drag anywhere on the base; the thumb follows
     and Value reports a normalized direction (-1..1 each axis). Poll
     Value in Update, or hook onChanged in the Inspector. */
  [AddComponentMenu("UI Kit Maker/Touch Stick")]
  public class TouchStick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler {
    public RectTransform thumb;
    [Tooltip("Travel radius in px. 0 = automatic (40% of this rect's width).")]
    public float radius = 0f;
    public bool snapBack = true;
    [System.Serializable] public class StickEvent : UnityEngine.Events.UnityEvent<Vector2> {}
    public StickEvent onChanged = new StickEvent();
    public Vector2 Value { get; private set; }
    RectTransform Rt { get { return (RectTransform)transform; } }
    float R { get { return radius > 0.01f ? radius : Rt.rect.width * 0.4f; } }
    void Track(PointerEventData e) {
      Vector2 local;
      if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(Rt, e.position, e.pressEventCamera, out local)) return;
      var v = Vector2.ClampMagnitude(local / R, 1f);
      Value = v;
      if (thumb != null) thumb.anchoredPosition = v * R;
      onChanged.Invoke(v);
    }
    public void OnPointerDown(PointerEventData e) { Track(e); }
    public void OnDrag(PointerEventData e) { Track(e); }
    public void OnPointerUp(PointerEventData e) {
      Value = Vector2.zero;
      if (snapBack && thumb != null) thumb.anchoredPosition = Vector2.zero;
      onChanged.Invoke(Vector2.zero);
    }
  }
}
`;

/* Runtime script #4: the season track's CONTENT rig — the look is baked
   art (edited on uikitmaker.com), the content is live engine text this
   component owns and lays out. Prototyper-first Inspector (owner). */
const SEASON_TRACK_RUNTIME = `using UnityEngine;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* Season track content. THE LOOK IS EDITED ON UIKITMAKER.COM — re-export
     the kit to restyle the track art. This component owns the CONTENT:
     lane names, level numbers and progress, as live text and a live fill
     over the bare track sprite. Anchors are fractions of this rect —
     nudge them in the Inspector if your layout drifts. */
  [ExecuteAlways]
  [AddComponentMenu("UI Kit Maker/Season Track")]
  public class SeasonTrack : MonoBehaviour {
#if UNITY_2023_2_OR_NEWER
    [Header("Content — the LOOK is edited on uikitmaker.com")]
    public string laneA = "FREE";
    public string laneB = "PREMIUM";
    public int firstLevel = 12;
    [Range(0f, 1f)] public float progress = 0.5f;
    [Header("Type")]
    public TMP_FontAsset face;
    public float labelSize = 16f;
    public Color laneAColor = Color.white;
    public Color laneBColor = new Color(0.98f, 0.8f, 0.08f);
    public Color progressColor = new Color(0.4f, 0.9f, 1f, 0.9f);
    [Header("Anchors (fractions of this rect)")]
    public Vector2 laneAAnchor = new Vector2(0.11f, 0.72f);
    public Vector2 laneBAnchor = new Vector2(0.11f, 0.28f);
    public float[] nodeX = new float[] { 0.24f, 0.5f, 0.76f };
    public float nodeY = 0.5f;
    void OnEnable() { Rebuild(); }
    void OnValidate() { if (transform.Find("LaneA") != null) Apply(); }
    TextMeshProUGUI Ensure(string childName) {
      var t = transform.Find(childName);
      var g = t != null ? t.gameObject : null;
      if (g == null) { g = new GameObject(childName, typeof(RectTransform)); g.transform.SetParent(transform, false); }
      var tmp = g.GetComponent<TextMeshProUGUI>();
      if (tmp == null) tmp = g.AddComponent<TextMeshProUGUI>();
      tmp.raycastTarget = false;
      tmp.alignment = TextAlignmentOptions.Center;
      return tmp;
    }
    void Place(RectTransform rt, Vector2 frac, float w, float h) {
      rt.anchorMin = frac; rt.anchorMax = frac; rt.pivot = new Vector2(0.5f, 0.5f);
      rt.anchoredPosition = Vector2.zero; rt.sizeDelta = new Vector2(w, h);
    }
    public void Rebuild() { Apply(); }
    void Apply() {
      var a = Ensure("LaneA");
      a.text = laneA; a.fontSize = labelSize; a.color = laneAColor; if (face != null) a.font = face;
      Place(a.rectTransform, laneAAnchor, 200f, 34f);
      var b = Ensure("LaneB");
      b.text = laneB; b.fontSize = labelSize; b.color = laneBColor; if (face != null) b.font = face;
      Place(b.rectTransform, laneBAnchor, 200f, 34f);
      for (int i = 0; i < nodeX.Length; i++) {
        var n = Ensure("Node" + (i + 1));
        n.text = (firstLevel + i).ToString(); n.fontSize = labelSize * 0.85f; n.color = laneAColor; if (face != null) n.font = face;
        Place(n.rectTransform, new Vector2(nodeX[i], nodeY), 60f, 30f);
      }
      // the progress run rides the spine between the first and last node
      var t = transform.Find("Progress");
      var g = t != null ? t.gameObject : null;
      if (g == null) { g = new GameObject("Progress", typeof(RectTransform), typeof(CanvasRenderer), typeof(UnityEngine.UI.Image)); g.transform.SetParent(transform, false); g.transform.SetSiblingIndex(0); }
      var img = g.GetComponent<UnityEngine.UI.Image>();
      img.color = progressColor; img.raycastTarget = false;
      var prt = (RectTransform)g.transform;
      float x0 = nodeX.Length > 0 ? nodeX[0] : 0.2f;
      float x1 = nodeX.Length > 0 ? nodeX[nodeX.Length - 1] : 0.8f;
      prt.anchorMin = new Vector2(x0, nodeY - 0.012f);
      prt.anchorMax = new Vector2(x0 + (x1 - x0) * Mathf.Clamp01(progress), nodeY + 0.012f);
      prt.offsetMin = Vector2.zero; prt.offsetMax = Vector2.zero;
    }
#endif
  }
}
`;

/* ── README imagery (owner: "let's try to stack the readme with
   imagery"). The plates are drawn by the SAME engine that draws the
   components, from the MAKER'S OWN kit, and rasterized at export time —
   a stock screenshot would show someone else's buttons. Annotations are
   plain SVG in a system face, so the sealed rasterization needs no
   embedded font. ── */
async function readmeFigures(base: GenConfig): Promise<{ path: string; data: Uint8Array }[]> {
  const esc2 = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dimsOf = (svg: string) => {
    const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { w: m ? +m[1] : 0, h: m ? +m[2] : 0 };
  };
  /* the shell's box in the PLATE's coordinates: data-shell0 is stated in
     viewBox units, and the renderer's glow pad pushes the viewBox origin
     negative — miss that and every callout lands off the button */
  const shellOf = (svg: string) => {
    const m = /data-shell0="([-\d. ]+)"/.exec(svg);
    const v = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!m || !v) return null;
    const [x, y, w, h] = m[1].split(" ").map(Number);
    return { x: x - +v[1], y: y - +v[2], w, h };
  };
  const INK = "#E9EDF7", DIM = "#96A0B8", LINE = "#5C6organ".replace("organ", "B8A"); // quiet slate
  const txt = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string } = {}) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="${o.size ?? 15}" font-weight="${o.weight ?? 600}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? "start"}" dominant-baseline="central">${esc2(s)}</text>`;
  const plate = (w: number, h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">` +
    `<rect width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#12141C"/>${body}</svg>`;
  const place = (svg: string, x: number, y: number, s: number) =>
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(4)})">${svg}</g>`;
  const out: { path: string; data: Uint8Array }[] = [];

  /* PLATE 1 — button anatomy: what the prefab is made of, with callouts
     at the real geometry (data-shell0 gives the shell's true box). */
  {
    const btn = renderKit(base, "primary", "l", "default", undefined, undefined, { label: "PLAY" });
    const d = dimsOf(btn), sh = shellOf(btn);
    if (d.w && sh) {
      const s = Math.max(0.3, Math.min(1.05, 430 / sh.w));
      const padX = 40, padY = 34, colGap = 34, colW = 460;
      const rowsSrc: { at: [number, number]; head: string; body: string[] }[] = [
        { at: [0.14, 0.22], head: "base.9 — the sprite",
          body: ["Nine-sliced: stretch it to any size and the", "corners stay crisp. Hover, pressed and", "disabled sprites swap in automatically."] },
        { at: [0.5, 0.5], head: "Label → one Fill text + echo layers",
          body: ["One real text; shadow, stroke and glints are", "echoes — the same letters repainted in the", "app's inks. One geometry, so nothing drifts."] },
        { at: [0.62, 0.84], head: "Hero Label (on the Label object)",
          body: ["One box drives the whole stack: text, size,", "spacing and nudge. Resize the button and", "the word scales with it."] },
      ];
      // the text column sets the rhythm; the plate is only as tall as the
      // taller of the two columns (no acres of empty background)
      const rowH = (r: typeof rowsSrc[number]) => 26 + r.body.length * 21;
      const GAPY = 40;
      const textH = rowsSrc.reduce((a, r) => a + rowH(r), 0) + GAPY * (rowsSrc.length - 1);
      /* frame the SHELL, not the render canvas: the renderer reserves a
         glow pad and a deep shadow allowance below, which as a plate
         reads as acres of empty background */
      const bw2 = sh.w * s, bh = sh.h * s;
      const mX = 58, mTop = 64, mBot = 92;
      const artRegionW = bw2 + mX * 2, artRegionH = bh + mTop + mBot;
      const W = padX + artRegionW + colGap + colW + padX;
      const H = Math.max(artRegionH, textH) + padY * 2 + 18;
      const artTop = 18 + (H - 18 - artRegionH) / 2;
      const bx = padX + mX, by = artTop + mTop;
      const colX = padX + artRegionW + colGap;
      let body = place(btn, bx - sh.x * s, by - sh.y * s, s);
      let cy2 = 18 + (H - 18 - textH) / 2;
      for (const r of rowsSrc) {
        const ax = bx + bw2 * r.at[0], ay = by + bh * r.at[1];
        const ty = cy2 + 10;
        body += `<path d="M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(colX - 20).toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="${LINE}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.8"/>`;
        body += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4.5" fill="${INK}" opacity="0.95"/>`;
        body += txt(colX, ty, r.head, { size: 17, weight: 800 });
        r.body.forEach((l, i) => { body += txt(colX, ty + 25 + i * 21, l, { size: 14, weight: 500, fill: DIM }); });
        cy2 += rowH(r) + GAPY;
      }
      body += txt(padX, 26, "ANATOMY OF A GENERATED PREFAB", { size: 12, weight: 800, fill: DIM });
      const { bytes } = await svgToPngBytes(plate(W, H, body), 2);
      out.push({ path: "docs/button-anatomy.png", data: bytes });
    }
  }

  /* PLATE 2 — the states, as the Button component swaps them. */
  {
    const names: [string, "default" | "hover" | "pressed" | "disabled"][] =
      [["Default", "default"], ["Hover", "hover"], ["Pressed", "pressed"], ["Disabled", "disabled"]];
    const svgs = names.map(([, st2]) => renderKit(base, "primary", "m", st2, undefined, undefined, { label: "PLAY" }));
    const sh0 = shellOf(svgs[0]);
    if (sh0) {
      // framed on the shell (like the anatomy plate) so the strip isn't
      // mostly the renderer's glow allowance
      const s = Math.max(0.28, Math.min(0.85, 250 / sh0.w));
      const mX = 34, mTop = 44, mBot = 52;
      const cellW = sh0.w * s + mX * 2, cellH = sh0.h * s + mTop + mBot;
      const gap = 6, padX = 30, padY = 44;
      const W = padX * 2 + cellW * 4 + gap * 3, H = padY + cellH + 46;
      let body = "";
      svgs.forEach((svg, i) => {
        const x = padX + i * (cellW + gap);
        const shi = shellOf(svg) ?? sh0;
        body += place(svg, x + mX - shi.x * s, padY + mTop - shi.y * s, s);
        body += txt(x + cellW / 2, padY + cellH + 14, names[i][0].toUpperCase(), { size: 12, weight: 800, fill: DIM, anchor: "middle" });
      });
      body += txt(padX, 26, "STATES — PRE-WIRED ON EVERY BUTTON PREFAB", { size: 12, weight: 800, fill: DIM });
      const { bytes } = await svgToPngBytes(plate(W, H, body), 2);
      out.push({ path: "docs/states.png", data: bytes });
    }
  }
  return out;
}

/* The walkthrough deck, tuned per scope — ease of use is the product.
   Owner mandate: reads like a presentation aimed at the Unity dev, one
   idea per slide, boring-but-vital detail in callouts, walking the
   whole export in the order a dev actually meets it. */
function unityReadme(st: EngineExportState, fontShipped: boolean, bakedShipped = false, figures = false): string {
  const root = `Assets/UIKitMaker/${sanitizeUnitySlug(st.slug) ?? "ui-kit"}`;
  return `# ${st.kitName} — the Unity walkthrough

Three steps, then a slide-by-slide tour of the whole export.

1. Unzip this download.
2. Drag the **UIKitMaker** folder into your Unity project's **Assets/**
   folder (or extract it straight there).
3. That's it. Unity imports everything by itself and the Console prints
   a one-line receipt. Ready-made prefabs are BUILT FOR YOU in
   **${root}/Prefabs** — drag one into your Canvas and press Play.

The slides run in the order you'll actually meet things: what imported,
your first scene, states, hero labels, tuning type, stretching wide,
re-exporting. Skim the titles; stop where your question lives.
${figures ? `
![Anatomy of a generated prefab: the nine-sliced sprite, the one-text echo label, and the Hero Label box that drives it](docs/button-anatomy.png)

*Every picture in this README is YOUR kit, rendered at export time —
this is not a stock manual.*
` : ""}
---

## 01 · What just happened when you dropped it

Every sprite arrived nine-sliced with the right pivots and
pixels-per-unit, and the importer BUILT prefabs inside your project,
already wired: sliced sprites, the kit's hover/pressed/disabled states
on the Button, a live label. ${st.scope === "free"
    ? "The starter generates three (PrimaryButton, Chip, ProgressBar); the full kit generates one per component."
    : "Every component family gets one — buttons, panels, rows, slots, badges and more."}
The Project window highlights **${root}/Prefabs** when they land, right
after the Console receipt. They're generated once and never touched
again — edit them freely.

> **Why aren't the prefabs just in the zip?** A prefab file can only
> reference sprites through the identity (GUID) that YOUR Unity assigns
> each PNG at import. A prefab shipped inside a zip would arrive with
> every sprite slot empty — the old drag-it-yourself experience. Built
> inside your project, seconds after the drop, every slot is full.

> **No hidden state.** kit-manifest.json holds every border, pivot and
> hash in plain JSON; kit.lock.json is the last import's receipt.
> Everything the importer does is data you could set by hand — the
> script only saves you the typing.

---

## 02 · Your first scene, in sixty seconds

Drag any prefab from **${root}/Prefabs** into a Canvas, press Play,
mouse over it. That's the kit working — states, glow and press lift
included.

No scene handy? Open **${root}/Playground.unity** (generated on first
import) and press Play: a camera, a raycasting canvas, exactly one
EventSystem with the input module your project actually uses, and every
example placed. The pieces hang off a single **Board** object, scaled
down so the whole kit fits the 1920×1080 canvas — set the Board's Scale
back to 1 to work at true size and scroll around. (Playground.unity is
never overwritten once it exists; **Tools > PatternBreak > Rebuild Kit
Playground Scene** replaces it.)

> **Buttons ignoring the mouse in your own scene?** The usual suspects
> are a duplicate EventSystem (keep exactly one) or an EventSystem
> whose input module doesn't match the project's Active Input Handling.

---

## 03 · States — designed, shipped, pre-wired
${figures ? `
![The four button states — default, hover, pressed and disabled — as the Button component swaps them](docs/states.png)
` : ""}
Interactive pieces ship their DESIGNED states (base-hover /
base-pressed / base-disabled next to base), and the generated Button
prefabs arrive with **Sprite Swap already wired** — nothing to
reconnect. What a swapped sprite can't carry is composed in-engine by
the small **StateFx** runtime on each prefab: the hover glow (the kit's
own glow color over fx/glow.png, shaped to the piece) and the press
lift, driven by pointer events with the exact numbers you set on
uikitmaker.com.

> **The aura, in your own scenes.** The glow field around pieces in the
> app is the kit's bloom, and an aura must overlap whatever sits behind
> it — so it can't ship inside a cropped sprite. Compose it the way the
> Playground does: fx/glow.png behind the piece, tinted the manifest's
> palette.glow, sized by the bloom block. That's the full resting look.

---

## 04 · Labels are live text — never pixels

${fontShipped
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

### The HeroLabel prefab — one text, echo inks

Want the strokes to MERGE behind the letterforms like the app (no
sticker-overlap between tight letters)? That's the **HeroLabel** prefab,
and it works like this: there is ONE real text — the **Fill** — and the
other layers are **echoes**: invisible painters that redraw the very
same letters wearing a different ink. Shadow and stroke echo behind the
word (every stroke fusing into one silent band), glints echo in front.
Because each layer is literally the same letters repainted — one
geometry, one kerning table, one line-wrap — the layers **cannot**
drift, lag, or wrap differently. Not "are kept in sync": there is
nothing separate to sync. Retype the word, scrub the size, change the
line height — the whole stack IS the text. Type on the Fill or on the
root's **Hero Label** box, whichever you reach first; they stay in
step. (The echoes appear in the Hierarchy as "Stroke (echo)" etc. —
they rebuild themselves, never save to disk, and need nothing from
you.) Solo KitFace Baked stays the one-object option.

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

**How faithful is the type?** The baked faces snapshot the app's exact
glyphs — the font instance your kit uses (variable-font width/weight
included), its gradients, patterns and effects — plus each letter's true
width AND the font's kerning pairs, measured in the app and written into
the TMP faces. What can't travel: live variable-font axes (Unity's text
system has no dials for them — the kit's instance is frozen in) and
browser-only shaping extras. If a word ever spaces differently than the
app, re-export first — older zips predate the kerning bake.

---

## 05 · Shaping the word: move, size, leading

Select the **Label** object and use **Hero Label → Nudge** (Y up is
positive). One field and the whole word moves — shadow, stroke and
glints included, because they are repaints of the same letters.

Or just edit the Fill text directly: Font Size, Margins, tracking,
**Line Spacing (leading)** — every layer follows the moment you type,
since there is no separate shadow or stroke object left to fall behind.
(Older kits DID have a separate Shadow text, and a line-height change
could leave it stranded until you matched the number by hand — that
chore is gone; re-import this kit and the old texts retire themselves.)
The Hero Label fields exist to REMEMBER your values so they survive
re-imports; anything you tune on the text adopts into them by itself.

---

## 06 · The kerning clinic: tuning a letter pair by hand

Say the A–Y gap bothers you. The kerning table lives on the **font
asset** — NOT on the text object. Selecting a label shows you the
TextMeshPro component and its material; neither has the table.

1. In the **Project window** open \`${root}/fonts\` and click
   **KitFace Baked Layers** (the blue **F** icon). Shortcut: with a label
   selected, click the little ⊙ target at the right of its *Font Asset*
   field to ping the asset, then click the asset itself.
2. In that asset's Inspector, scroll past Face Info / Generation
   Settings / Atlas & Material to the tables at the very bottom.
   Depending on your TextMesh Pro version the section is called
   **Glyph Adjustment Table** or **Font Feature Table → Glyph Pair
   Adjustment Records**.
3. Find the pair and edit the FIRST (left) glyph's **AX / X Advance** —
   negative pulls the letters together, live in the scene. The right
   glyph's AX is a different thing: it sets the gap AFTER that letter.
4. Mind the case. Every pair is listed separately, and the glyph IDs run
   \`A\`=1…\`Z\`=26, then \`a\`=27…\`z\`=52 — so a button reading PLAY needs
   the row whose right glyph is uppercase **Y (ID 25)**, not lowercase
   \`y\` (ID 51). Sanity check against neighbouring diagonals (A–V, A–W):
   a pair that reads near zero while its neighbours read −14 is usually
   the wrong row.

### Where the numbers come from, and where they live

- **The bake measures your font.** At export we set every letter pair
  against its two letters' solo widths in the browser, at your kit's
  exact font instance, and ship the differences. That's the typeface's
  own kerning, captured — nothing invented.
- **Units are the baked em, not pixels.** The baked em is
  \`${Math.round(52 * 3)}\` units, so \`-14\` is about −0.09 em: roughly
  −5 px on a label rendering near 55. Compare a pair against its
  neighbours (A–V, A–W) rather than guessing an absolute number.
- **There is only ONE table.** The whole hero stack — fill, stroke,
  shadow, glints — is a single font asset, **KitFace Baked Layers**,
  and every label lays its word out exactly once from it. Tune a pair
  and every layer moves AS YOU TYPE, because the other layers are
  repaints of the same letters, not copies with their own tables. There
  is no second place a kerning number could live, so there is nothing
  to sync, nothing to overwrite, and nothing that can lag behind.
- **OX and OY travel too.** Nudge a pair's placement, not just its
  advance, and the whole stack carries it — and it survives re-imports.
- **A half-entered row is safe.** "Add New Glyph Adjustment Record"
  gives you a blank pair; nothing touches your font while you type
  (the bookkeeping pass only reads), and a pair with no numbers yet is
  never mistaken for a tweak.
- **Your edits live in \`fonts/kerning-overrides.json\`.** Saving — or
  just pausing for a second — records your deviations from the shipped
  bake into that file. It is never shipped in a zip, so extracting a new
  export over the same folder cannot clobber it, and every import
  re-applies it onto the rebuilt asset. Reverting a pair back to the
  shipped value removes it from the record.
- **Renaming the kit leaves it behind.** A new kit name mints a new
  Unity folder; copy \`fonts/kerning-overrides.json\` across if you want
  the tuning to follow.
- **To start clean**, delete that file and re-import — you're back to the
  typeface's own spacing.

**Pair not in the list at all?** Then the font itself specifies no kern
for it — the table only carries what the typeface asks for, and plenty
of display faces kern their lowercase thoroughly and their capitals
barely at all. Add the record by hand: **+** at the bottom of the table,
set the first glyph to the left letter's ID and the second to the right
letter's (\`A\`=1 … \`Z\`=26, \`a\`=27 … \`z\`=52 — so A–Y is 1 and 25), then
pull the first glyph's AX negative.

The import receipt tells you the table is really there: each face logs
"N kerning pairs written". If it says KERNING SKIPPED, your TMP version
refused the table — send that line to uikitmaker.com.

**Which asset do I open?** \`fonts/KitFace Baked Layers\` — the only
one with the hero table. Quickest route: double-click the Font Asset
field on a hero label's **Fill** text. (\`KitFace Baked\` beside it is
the solo single-layer face with its own table; the \`KitFace Ink\`
files are materials, not fonts — they carry a layer's pixels and have
no tables at all.)

---

## 07 · Stretching wide — and the diagonal-stripe question

Nine-slice keeps the CORNERS honest and stretches the middle — so a
pattern living in that middle stretches with it. Horizontal and vertical
stripes survive (stretching a stripe along its own axis changes nothing),
but a DIAGONAL shears: pull a 45° chevron to double width and it lands
near 63°, with the bands wider. That's geometry, not a bug — and for the
±20–30% stretches most UI does, nobody sees it.

**You don't pick this at export time.** Sliced and Tiled read the SAME
sprite and the same nine-slice borders — Image Type lives on the Image
component of each instance, not in the asset. So every piece in this kit
can already do either; it's one dropdown on the piece you're placing,
and nothing has to be re-exported.

**Try Tiled where the middle is mostly pattern.** On the piece's
**Image** component set **Image Type** to *Tiled*: Unity repeats the
middle at native scale instead of stretching it, so the pattern keeps its
angle and rhythm at any width. **Pixels Per Unit Multiplier** on the same
component tunes how big the repeat is.

**And know what it costs.** Tiled repeats the WHOLE middle, not just the
pattern — the face gradient and the gloss sweep live in there too, so on
a glossy face you can trade a sheared pattern for a repeated highlight.
Look at both and pick per piece: flat, pattern-heavy faces usually win
with Tiled; glossy gradient faces usually win with Sliced. For a modest
stretch (±20–30%) Sliced is almost always the right answer — the shear
simply isn't visible.

### The stretch-safe face (no compromise)

When a kit wears a pattern, the wide pieces also ship **split into
layers**, and the importer builds them as ready prefabs:
**Panel (tiled face)** and **Header banner (tiled face)** in Prefabs/.

Inside: \`base-under.9\` (shell, rim, fill — Sliced) at the bottom, then a
hidden \`base-mask.9\` carrying a **Mask** with *Show Mask Graphic* OFF —
that clips a Tiled \`fx/face-tile.png\` to the exact silhouette — and
\`base-over.9\` (gloss, grain, inner edge, specular — Sliced) laying the
light back on top. The mask has to be its own hidden layer: Unity only
alpha-clips a stencil when its graphic is hidden, so masking with
visible art gives a RECTANGULAR mask and the pattern spills. Drag
one out and stretch it as far as you like: the frame stretches, the
pattern keeps its exact angle and rhythm, and the gloss stays ONE sweep
instead of repeating. That's the app's look at any width, with no
trade — use these for wide banners, dialog frames and bars that grow.

The plain single-sprite prefabs still ship beside them; they're lighter
(one draw instead of three), so keep those for pieces that barely
stretch.

---

## 08 · Why Unity's lights don't change the kit

The kit is PRE-LIT ART. The gloss sweeps, specular hits, extrusion
shading and glints ARE the lighting — computed by the kit engine and
painted into the pixels, so what you designed is exactly what ships, on
every device, in every project. UI sprites render unlit: skyboxes and
scene lights pass through them by design. Want the light to move? That's
the Lighting angle dial on uikitmaker.com — change it and re-export, and
every gloss, bevel and emboss re-renders from the new direction (the
text bevel on live labels follows it too). Game-time reactions — hover
glow, press lift — are the states plus the fx/ layer, composed in-engine
(slide 03).

---

## 09 · Re-exporting: the one rule

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
  states on the Button, a label). After that the importer never edits
  them — and because your re-exports keep the same sprite files, prefabs
  you've customized restyle automatically anyway. One additive exception:
  examples generated by an older kit version, before state wiring
  existed, get their Button + Sprite Swap added in place on the next
  import (skipped the moment a prefab carries any Selectable — your own
  wiring choices always win).
- **Everything is inspectable.** kit-manifest.json holds every border,
  pivot and hash in plain JSON; kit.lock.json is the last import's
  receipt. No hidden state.
${st.scope === "free" ? `
---

## This is the free starter kit

Three pieces — the master button, a chip and the progress bar — with the
complete import pipeline: nine-slice, states, wired prefabs and in-place
restyling all work exactly as they do in the full kit. Upgrading at
uikitmaker.com/#/pricing and re-exporting lands EVERY component in this
same folder — plus the baked hero fonts (your kit's type as app-exact,
typeable glyphs, with the layered HeroLabel treatment) — and everything
you've already placed stays put.
` : ""}
---

## 10 · When something looks wrong

**You dropped the kit while the game was running.** Unity can't build
scenes or prefabs during Play, so a kit dropped in that window waits:
the Console says **"the editor is in PLAY MODE — press STOP … and the
kit build finishes by itself."** Press Stop and it does. The sprites
land either way, so if you never press Stop you get the new art wearing
the old prefabs — new buttons, dead rollovers. The importer compares
its receipt against the manifest on every launch and finishes the
interrupted build by itself, so this heals even if you quit Unity
mid-Play.

**Something looks unsliced.** Tools > PatternBreak > Reapply Kit Import
Settings re-runs the pass (with Play off) and says exactly what it
fixed.

**Not sure which build a kit is running?** Tools > PatternBreak > Kit
Status tells you, per kit — check it before blaming the export.

**A kerning line says KERNING SKIPPED?** Your TMP version refused the
table — send that Console line to uikitmaker.com.
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
  [Serializable] class PBStyle { public int weight; public bool italic; public float labelSize; public float spacingEmPct; public string fillMode; public string fill; public string fill2; public float fillOpacity; public PBStyleOutline outline; public PBStyleGlow glow; public PBStyleShadow shadow; public PBStyleEmboss emboss; public float lightAngle; public PBStylePattern pattern; }
  [Serializable] class PBBakedRef { public string file; public string metrics; public float pointSize; public string layerFill; public string layerStroke; public string layerShadow; public string layerGlints; }
  [Serializable] class PBBakedGlyph { public int u; public int x; public int y; public int w; public int h; public float bx; public float by; public float adv; }
  [Serializable] class PBBakedKern { public int l; public int r; public float k; }
  /* the maker's hand-tuned pairs, kept beside the faces so a re-import
     restores them (the faces themselves rebuild every drop) */
  [Serializable] class PBKernOv { public int l; public int r; public float k; public float ox; public float oy; }
  [Serializable] class PBKernOvFile { public PBKernOv[] pairs; }
  [Serializable] class PBBakedFace { public float pointSize; public float ascent; public float descent; public float lineHeight; public int atlasW; public int atlasH; public PBBakedKern[] kerning; public PBBakedGlyph[] glyphs; public int layersAtlasW; public int layersAtlasH; public PBBakedGlyph[] layerGlyphs; }
  [Serializable] class PBStateStyle { public string state; public string fillMode; public string fill; public string fill2; public float dy; }
  [Serializable] class PBTypography { public string font; public string fontFile; public PBStyle style; public PBStateStyle[] stateStyles; public PBBakedRef bakedFace; }
  [Serializable] class PBPalette { public string glow; public string highlight; }
  [Serializable] class PBBloom { public float opacity; public float size; }
  [Serializable] class PBLabelState { public string family; public string state; public string fillMode; public string fill; public string fill2; public float dy; }
  [Serializable] class PBStateFx { public string family; public string state; public float glow; public float lift; }
  [Serializable] class PBLabelSize { public string family; public float size; }
  [Serializable] class PBPlaceholder { public string text; public float left; public float size; public float centerFromTop; public string color; public float opacity; public bool italic; }
  [Serializable] class PBManifest { public string kit; public string slug; public int kitVersion; public string generatorVersion; public string tier; public int pngScale; public PBTypography typography; public PBPlaceholder placeholder; public PBLabelState[] labelStates; public PBStateFx[] stateFx; public PBLabelSize[] labelSizes; public PBPalette palette; public PBBloom bloom; public PBAsset[] assets; }
  [Serializable] class PBLockEntry { public string file; public string sha256; }
  [Serializable] class PBLock { public string slug; public int kitVersion; public string generatorVersion; public string imported; public bool prefabsGenerated; public PBLockEntry[] files; public string[] orphans; }

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
      /* Full Rect is REQUIRED by both Sliced and Tiled image types — on a
         Tight mesh Unity warns and mis-draws the stretched middle, which
         is exactly where a maker goes to escape pattern distortion */
      if (settings.spriteAlignment != (int)SpriteAlignment.Custom || settings.spritePivot != pivot
          || settings.spritePixelsPerUnit != 200f || settings.spriteMeshType != SpriteMeshType.FullRect) {
        settings.spriteAlignment = (int)SpriteAlignment.Custom;
        settings.spritePivot = pivot;
        settings.spritePixelsPerUnit = 200f;
        settings.spriteMeshType = SpriteMeshType.FullRect;
        ti.SetTextureSettings(settings);
        changed = true;
      }
      if (a.nineSlice != null && (a.nineSlice.left + a.nineSlice.right + a.nineSlice.top + a.nineSlice.bottom) > 0) {
        var border = new Vector4(a.nineSlice.left, a.nineSlice.bottom, a.nineSlice.right, a.nineSlice.top);
        if (ti.spriteBorder != border) { ti.spriteBorder = border; changed = true; }
      }
      return changed;
    }

    /* One click, whole truth — the debugging loop this kit went through
       pried these facts loose one screenshot at a time: play mode? build
       queued? which export build? fonts in the zip? faces assembled? */
    [MenuItem("Tools/PatternBreak/Kit Status")]
    public static void KitStatus() {
      var sb = new System.Text.StringBuilder();
      sb.Append("UI Kit Maker status — ");
      sb.Append(EditorApplication.isPlayingOrWillChangePlaymode
        ? "editor is in PLAY MODE (kit builds wait for Stop). "
        : "edit mode. ");
      if (SessionState.GetBool("PBKitPlayPending", false)) sb.Append("A kit build is QUEUED and runs when Play stops. ");
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) sb.Append("No kit-manifest.json in this project — drop the UIKitMaker folder from the export zip into Assets/.");
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) { sb.Append("\\n" + mPath + ": unreadable manifest."); continue; }
        sb.Append("\\n'" + (string.IsNullOrEmpty(m.kit) ? m.slug : m.kit) + "'" + (m.kitVersion > 0 ? " v" + m.kitVersion : "")
          + " [export build " + (string.IsNullOrEmpty(m.generatorVersion) ? "UNKNOWN — old zip, re-download" : m.generatorVersion) + "] — ");
        sb.Append(File.Exists(root + "/kit.lock.json") ? "imported. " : "NOT imported yet. ");
        sb.Append(m.typography != null && m.typography.bakedFace != null
          ? "Zip carries the baked hero fonts. "
          : "Zip has NO baked hero fonts (the font fetch failed during export — re-export from uikitmaker.com). ");
#if UNITY_2023_2_OR_NEWER
        sb.Append(AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset") != null
          ? "Layer face assembled (one font asset, four materials)."
          : "Layer face NOT assembled in this project.");
#endif
      }
      Debug.Log(sb.ToString());
#if UNITY_2023_2_OR_NEWER
      /* the sink, family by family — ONE Console entry each: the list
         view truncates entries to two lines, and packing these into the
         header entry hid them behind a click (owner: "didn't get the
         expected text") */
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) continue;
        foreach (var fam in new string[] { "button-primary", "button-secondary", "button-small", "chip", "tab" }) {
          var pf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/" + NiceName(fam) + ".prefab");
          if (pf == null) continue;
          var inkc = pf.GetComponent<LabelStateInk>();
          /* the "export build" tag rides along so a Console search filter
             for "export" (the habit the receipt taught) can't hide these */
          Debug.Log("UI Kit Maker status — " + fam + ": label size " + LabelSize(m, fam)
            + " · press sink expected " + ExpectedShift(m, fam, "pressed") + "px, armed "
            + (inkc != null ? inkc.pressedShift + "px" : "NONE (no state component)")
            + " [export build " + (string.IsNullOrEmpty(m.generatorVersion) ? "UNKNOWN" : m.generatorVersion) + "]");
        }
      }
#endif
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
        // the valet raises this flag before the domain reload wipes its
        // queued pass — honor it by re-importing EVERYTHING once, receipts
        // intact (fully idempotent: unchanged kits report "already right")
        bool force = SessionState.GetBool("PBKitValetPending", false);
        if (force) SessionState.SetBool("PBKitValetPending", false);
        /* a NEW importer version arriving mid-Play recompiles scripts, and
           that domain reload wipes the play-wait subscription — without
           this re-arm, stopping Play finished NOTHING and the kit sat
           half-imported behind old receipts (owner field repro: "now, NO
           type at all"). Re-arm while playing; run the deferred build if
           Play already ended. */
        if (SessionState.GetBool("PBKitPlayPending", false)) {
          if (EditorApplication.isPlayingOrWillChangePlaymode) {
            if (!playWaitArmed) { playWaitArmed = true; EditorApplication.playModeStateChanged += ResumeAfterPlay; }
          } else {
            SessionState.SetBool("PBKitPlayPending", false);
            Debug.Log("UI Kit Maker: Play ended before the last import could finish — completing the kit build now.");
            force = true;
          }
        }
        var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
        foreach (var guid in manifests) {
          var mPath = AssetDatabase.GUIDToAssetPath(guid);
          var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
          if (force || Stale(root, mPath)) ImportKit(mPath);
        }
      };
    }

    /* Does the receipt describe the manifest sitting next to it? "No
       receipt" means a first drop, but a receipt for an OLDER export means
       a drop whose build never finished — and the only reason it wouldn't
       have is that something interrupted it. Play mode is the usual one:
       the build defers to edit mode through a SessionState flag, and
       SessionState dies with the editor. Quit Unity without pressing Stop
       and the old code saw a lock file, called the kit done, and left the
       new sprites sitting beside last export's prefabs — the field shape
       is new art with dead rollovers (owner: "I wasn't able to get the
       rollovers working but I think I imported everything while in play
       mode"). Comparing the receipt heals that on the next launch no
       matter what interrupted the build. */
    static bool Stale(string root, string mPath) {
      var lockPath = root + "/kit.lock.json";
      if (!File.Exists(lockPath)) return true;
      PBLock l = null; PBManifest m = null;
      try { l = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { }
      try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
      if (l == null || m == null) return true; // unreadable either side: rebuild rather than guess
      if (l.kitVersion != m.kitVersion) return true;
      return (l.generatorVersion ?? "") != (m.generatorVersion ?? "");
      /* deliberately NOT "&& l.prefabsGenerated": a kit whose prefabs can't
         build (no TMP yet, say) would then look stale forever, and entering
         Play mode is a domain reload — so every Play would kick off a full
         re-import. The version pair is the honest signal; a genuinely
         prefab-less kit is one Reapply away. */
    }

    /* Play-mode drops half-import: scene creation is forbidden (the
       Playground builder throws InvalidOperationException), TMP essentials
       can't come in cleanly, and prefabs generated in that window are born
       with naked labels (owner field repro on a fresh machine: every layer
       logging "no Font Asset assigned"). Sprites and their import settings
       are handled by the texture postprocessor regardless, so the rest of
       the kit build simply WAITS for edit mode and runs then. */
    static bool playWaitArmed;
    static void ResumeAfterPlay(PlayModeStateChange change) {
      if (change != PlayModeStateChange.EnteredEditMode) return;
      EditorApplication.playModeStateChanged -= ResumeAfterPlay;
      playWaitArmed = false;
      SessionState.SetBool("PBKitPlayPending", false);
      Debug.Log("UI Kit Maker: Play stopped — finishing the kit build now.");
      EditorApplication.delayCall += Apply;
    }
    static void ImportKit(string mPath) {
      if (EditorApplication.isPlayingOrWillChangePlaymode) {
        /* the flag persists across domain reloads (a NEW importer version
           arriving mid-Play recompiles scripts and wipes this class's
           statics — the sweep re-arms the wait from the flag, field repro:
           "now, NO type at all") */
        SessionState.SetBool("PBKitPlayPending", true);
        if (!playWaitArmed) {
          playWaitArmed = true;
          EditorApplication.playModeStateChanged += ResumeAfterPlay;
        }
        /* say it EVERY time — the once-latched version left the Reapply
           menu perfectly mute when run during Play (field: an owner deep
           in a debugging loop, screenshotting an empty Console) */
        Debug.Log("UI Kit Maker: the editor is in PLAY MODE — press STOP (the square, top center) and the kit build finishes by itself.");
        return;
      }
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
      // the baked faces need TMP even when no TTF shipped — request always
      if (!TmpReady()) tmpPending = RequestEssentials();
      if (kitTtf != null && !tmpPending) EnsureTmpFace(root, manifest, kitTtf);
      /* the baked faces refresh on EVERY import (review catch: an
         extract-over rewrites the atlas and metrics, and stale glyph rects
         over a new atlas garble every letter — restyle-in-place demands the
         assembly track the files). They're generated mirrors of kit data,
         like the gradient preset; the asset GUIDs survive the in-place
         rebuild, so placed labels keep their face. */
      if (!tmpPending) EnsureBakedFace(root, manifest, true);
      if (!tmpPending) EnsureGradientPreset(root, manifest);
      /* a full-tier zip born while the browser couldn't fetch the kit font
         ships WITHOUT the baked hero fonts — silently, unless we say so
         (field repro: every hero/button word vanished on the next drop) */
      if (string.Equals(manifest.tier, "full") && (manifest.typography == null || manifest.typography.bakedFace == null))
        Debug.LogWarning("UI Kit Maker: this export shipped WITHOUT the baked hero fonts — the kit's font couldn't be fetched in the browser during export. Labels fall back to the styled SDF face. Re-export from uikitmaker.com (check the connection there) to restore the exact type.");
      /* new text objects are BORN in the kit's face (owner: the custom font
         "should kinda just be there") — set TMP's project-wide default, but
         only while it's still the stock Liberation face; a deliberate user
         choice is never stomped. */
      if (!tmpPending) {
        var sdfFace = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
        if (sdfFace != null && TMP_Settings.instance != null) {
          var curDefault = TMP_Settings.defaultFontAsset;
          if (curDefault == null || curDefault.name.StartsWith("LiberationSans")) {
            var so = new SerializedObject(TMP_Settings.instance);
            var prop = so.FindProperty("m_defaultFontAsset");
            if (prop != null) {
              prop.objectReferenceValue = sdfFace;
              so.ApplyModifiedProperties();
              EditorUtility.SetDirty(TMP_Settings.instance);
              AssetDatabase.SaveAssets();
              Debug.Log("UI Kit Maker: new TextMeshPro texts are now born in the kit's face (project default font = KitFace SDF). Change it anytime in Project Settings > TextMesh Pro > Settings.");
            }
          }
        }
      }
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
      // per-import maintenance for examples generated by OLDER kit versions:
      // missing state wiring is added, stale label dress is re-applied —
      // in place, surgical, no menu hunt (fresh generations are current
      // by construction and skip this)
      if (prefabsReady && !prefabsNew) MaintainExamplePrefabs(root, manifest);
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
      receipt.generatorVersion = manifest.generatorVersion;
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
        + faceNote
        /* which uikitmaker.com BUILD packed this zip — ends the "is this
           the latest download?" guessing game right in the Console */
        + (string.IsNullOrEmpty(manifest.generatorVersion) ? "" : " [export build " + manifest.generatorVersion + "]");
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

        /* NO auras (owner verdict after two calibration rounds: "just get
           rid of the white glow beneath every object") — pieces place
           clean; the bloom recipe stays in kit-manifest.json for anyone
           who wants to compose their own with fx/glow.png. */
        var prefabs = new List<GameObject>();
        foreach (var g in guids) {
          var p = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(g));
          if (p != null) prefabs.Add(p);
        }
        prefabs.Sort((a, b) => string.CompareOrdinal(a.name, b.name));
        /* Everything hangs off one Board, and the Board is scaled to fit the
           canvas at the end. A full kit is wider than 1920 laid out at 1:1,
           and the old code just let the later columns run off the right-hand
           edge: invisible when you press Play, and in the Scene view you had
           to go hunting outside the canvas frame to grab them (owner: "it's
           really difficult dragging these elements around"). Set the Board's
           scale back to 1 for a 1:1 board. */
        var boardGo = new GameObject("Board", typeof(RectTransform));
        boardGo.transform.SetParent(canvasGo.transform, false);
        var board = boardGo.GetComponent<RectTransform>();
        board.anchorMin = new Vector2(0f, 1f); board.anchorMax = new Vector2(0f, 1f);
        board.pivot = new Vector2(0f, 1f);
        float colX = 90f, y = -90f, colMaxW = 0f, deepest = 0f; int placed = 0;
        foreach (var prefab in prefabs) {
          var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
          inst.transform.SetParent(board, false);
          var rt = inst.GetComponent<RectTransform>();
          if (rt == null) continue;
          float w = Mathf.Max(80f, rt.sizeDelta.x), h = Mathf.Max(40f, rt.sizeDelta.y);
          if (y - h < -1020f && y < -91f) { colX += colMaxW + 70f; y = -90f; colMaxW = 0f; }
          rt.anchorMin = new Vector2(0f, 1f); rt.anchorMax = new Vector2(0f, 1f);
          rt.anchoredPosition = new Vector2(colX + w * 0.5f, y - h * 0.5f);
          y -= h + 44f;
          if (-y > deepest) deepest = -y;
          if (w > colMaxW) colMaxW = w;
          placed++;
        }
        float boardW = colX + colMaxW + 90f, boardH = Mathf.Max(deepest + 90f, 200f);
        board.sizeDelta = new Vector2(boardW, boardH);
        // shrink to fit, never blow up a small kit past 1:1
        float fit = Mathf.Min(1f, Mathf.Min(1920f / boardW, 1080f / boardH));
        board.localScale = new Vector3(fit, fit, 1f);
        board.anchoredPosition = new Vector2((1920f - boardW * fit) * 0.5f, -(1080f - boardH * fit) * 0.5f);
        /* no help card in the scene (owner call: the Playground stays
           clean) — the driving instructions live in the README instead */
        if (UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, scenePath))
          Debug.Log("UI Kit Maker: Playground ready — open " + scenePath + " and press Play. Hover/press states are pre-wired (" + placed + " pieces placed).");
        else
          Debug.LogWarning("UI Kit Maker: couldn't save the Playground at " + scenePath + " — go File > New Scene, then Tools > PatternBreak > Rebuild Kit Playground Scene.");
      } finally {
        /* field catch: when the Playground ends up the ONLY loaded scene
           (the stale one was closed, nothing else open), Unity refuses to
           close it and prints a scary warning. Landing inside the freshly
           saved Playground is the nicer outcome anyway — only tidy up when
           another scene is there to return to. */
        if (UnityEngine.SceneManagement.SceneManager.sceneCount > 1)
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
        /* a GRADIENT stroke (color -> color2) has no TMP equivalent — the
           single color used to be the top one, which erased the kit's
           signature bottom hue entirely (Miami: the cyan vanished). The
           midpoint mix at least carries both voices. The EXACT stroke
           lives on the baked faces. */
        Color c2;
        if (!string.IsNullOrEmpty(s.outline.color2) && ColorUtility.TryParseHtmlString(s.outline.color2, out c2)) c = Color.Lerp(c, c2, 0.5f);
        mat.SetColor("_OutlineColor", c);
        // the app paints the stroke BEHIND the fill (paint-order stroke): the
        // visible band sits OUTSIDE and never eats the character. TMP's outline
        // straddles the edge, so dilate the face by the same amount — the band
        // lands fully outside and the letterform keeps its designed weight.
        float ow = Mathf.Clamp(s.outline.width / 60f, 0.025f, 0.3f);
        mat.SetFloat("_OutlineWidth", ow);
        mat.SetFloat("_FaceDilate", ow);
      } else {
        // review catch: restyles must also TAKE effects away — a kit that
        // turned its outline off keeps a stale stroke otherwise
        mat.SetFloat("_OutlineWidth", 0f);
        mat.SetFloat("_FaceDilate", 0f);
      }
      /* the full Distance Field shader carries a REAL glow section, so the
         glow and the drop shadow (underlay) can both speak at once */
      if (s.glow != null && !string.IsNullOrEmpty(s.glow.color) && ColorUtility.TryParseHtmlString(s.glow.color, out c)) {
        c.a = Mathf.Clamp01(s.glow.opacity / 100f);
        mat.EnableKeyword("GLOW_ON");
        mat.SetColor("_GlowColor", c);
        mat.SetFloat("_GlowOuter", Mathf.Clamp(s.glow.size / 24f, 0.05f, 1f));
        mat.SetFloat("_GlowPower", 0.75f);
      } else mat.DisableKeyword("GLOW_ON");
      if (s.shadow != null && !string.IsNullOrEmpty(s.shadow.color) && ColorUtility.TryParseHtmlString(s.shadow.color, out c)) {
        c.a = Mathf.Clamp01(s.shadow.opacity / 100f);
        mat.EnableKeyword("UNDERLAY_ON");
        mat.SetColor("_UnderlayColor", c);
        mat.SetFloat("_UnderlayOffsetX", Mathf.Clamp(s.shadow.x / 50f, -1f, 1f));
        mat.SetFloat("_UnderlayOffsetY", Mathf.Clamp(0f - s.shadow.y / 50f, -1f, 1f));
        mat.SetFloat("_UnderlaySoftness", Mathf.Clamp(s.shadow.blur / 30f, 0f, 1f));
      } else mat.DisableKeyword("UNDERLAY_ON");
      /* emboss → the shader's bevel + lighting, lit from the kit's angle */
      if (s.emboss != null && Mathf.Abs(s.emboss.strength) > 0.01f) {
        mat.EnableKeyword("BEVEL_ON");
        mat.SetFloat("_Bevel", Mathf.Clamp(Mathf.Abs(s.emboss.strength) / 100f, 0.1f, 1f));
        mat.SetFloat("_BevelWidth", 0.25f);
        mat.SetFloat("_BevelRoundness", 0.35f);
        if (s.emboss.strength < 0f) mat.SetFloat("_BevelOffset", -0.25f);
        mat.SetFloat("_LightAngle", (s.lightAngle + 90f) * Mathf.Deg2Rad);
        mat.SetFloat("_SpecularPower", 1.5f);
      } else mat.DisableKeyword("BEVEL_ON");
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
      var jsonPath = root + "/" + m.typography.bakedFace.metrics;
      if (!File.Exists(jsonPath)) return;
      PBBakedFace face = null;
      try { face = JsonUtility.FromJson<PBBakedFace>(File.ReadAllText(jsonPath)); } catch (Exception) { }
      if (face == null || face.glyphs == null || face.glyphs.Length == 0) {
        Debug.LogWarning("UI Kit Maker: " + jsonPath + " unreadable — the baked face is skipped (labels keep the SDF face).");
        return;
      }
      AssembleBakedFont(root, m, refresh, "KitFace Baked", root + "/" + m.typography.bakedFace.file,
        face.glyphs, face.atlasW, face.atlasH, face,
        " glyphs of the app's exact pixels (pattern, glints and gloss included). Put it on any TMP label for hero text: Font Asset = KitFace Baked, label color WHITE.");
      /* ONE GEOMETRY, MANY INKS (owner: "1 character = 3 layers bound
         that move, transform, are affected by the same forces"). The
         whole layer stack is ONE font asset — this one — laid out by ONE
         TextMeshPro text. Stroke, Shadow and Glints are not fonts and
         not texts: they are plain ink materials, drawn by HeroLabel
         re-rendering the text's own mesh behind or in front of it. The
         bake packs every layer's texture over identical glyph rects, so
         the same mesh reads each ink perfectly in register. A layer
         cannot misalign, because there is no second layout to disagree
         with — and nothing left to synchronize. */
      if (!string.IsNullOrEmpty(m.typography.bakedFace.layerFill) && !string.IsNullOrEmpty(m.typography.bakedFace.layerStroke)
          && face.layerGlyphs != null && face.layerGlyphs.Length > 0) {
        AssembleBakedFont(root, m, refresh, "KitFace Baked Layers", root + "/" + m.typography.bakedFace.layerFill,
          face.layerGlyphs, face.layersAtlasW, face.layersAtlasH, face,
          " glyphs — THE layered-label font, and the ONLY place hero type lays out: glyphs, kerning and the Glyph Adjustment Table all live here, once. Stroke, Shadow and Glints redraw this font's own mesh wearing the KitFace Ink materials beside it.");
        EnsureInkMaterial(root, "Stroke", m.typography.bakedFace.layerStroke);
        EnsureInkMaterial(root, "Shadow", m.typography.bakedFace.layerShadow);
        EnsureInkMaterial(root, "Glints", m.typography.bakedFace.layerGlints);
        /* retire the two dead ends this system lived through: the
           per-layer material skins (TMP silently reverts a material whose
           texture isn't the font's own atlas) and the mirror font assets
           (four layout engines kept in step by sync code — the sync
           always lost eventually). The redress pass rebuilds any label
           still wearing either. */
        foreach (var nm in new string[] { "Stroke", "Shadow", "Glints" }) {
          AssetDatabase.DeleteAsset(root + "/fonts/KitFace Layer " + nm + ".mat");
          AssetDatabase.DeleteAsset(root + "/fonts/KitFace Layer " + nm + ".asset");
        }
      }
    }
    /* An ink is the smallest possible asset: UI/Default plus the layer's
       baked texture. No font, no table, no TMP jurisdiction — TMP's
       material validation never sees it, because it never sits on a TMP
       component. */
    static void EnsureInkMaterial(string root, string layerName, string texFile) {
      var path = root + "/fonts/KitFace Ink " + layerName + ".mat";
      if (string.IsNullOrEmpty(texFile)) { AssetDatabase.DeleteAsset(path); return; }
      var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(root + "/" + texFile);
      if (tex == null) return; // atlas not imported yet — the next pass retries
      var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
      if (mat == null) {
        var shader = Shader.Find("UI/Default");
        if (shader == null) { Debug.LogWarning("UI Kit Maker: UI/Default shader missing — the " + layerName + " ink is skipped."); return; }
        mat = new Material(shader);
        mat.mainTexture = tex;
        AssetDatabase.CreateAsset(mat, path);
        return;
      }
      // re-imports retexture in place; the material file (and any tint a
      // user set on it) stays theirs
      if (mat.mainTexture != tex) { mat.mainTexture = tex; EditorUtility.SetDirty(mat); }
    }
    static Material InkMaterial(string root, string layerName) {
      return AssetDatabase.LoadAssetAtPath<Material>(root + "/fonts/KitFace Ink " + layerName + ".mat");
    }
    /* ── kerning plumbing. Pairs are keyed by CHARACTER, not glyph index:
       glyph indices belong to one font asset, characters are the same on
       all four layer faces (and survive a glyph-set change). ── */
    static long PairKey(uint l, uint r) { return ((long)l << 32) | (long)r; }
#if UNITY_2023_2_OR_NEWER
    static Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> ReadFacePairs(TMP_FontAsset fa) {
      var outp = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
      if (fa == null || fa.fontFeatureTable == null || fa.characterTable == null) return outp;
      var uni = new Dictionary<uint, uint>();
      foreach (var c in fa.characterTable) if (c != null && !uni.ContainsKey(c.glyphIndex)) uni[c.glyphIndex] = c.unicode;
      foreach (var r in fa.fontFeatureTable.glyphPairAdjustmentRecords) {
        uint lu, ru;
        // a half-entered Inspector row has glyph index 0 — not a pair yet
        if (!uni.TryGetValue(r.firstAdjustmentRecord.glyphIndex, out lu)) continue;
        if (!uni.TryGetValue(r.secondAdjustmentRecord.glyphIndex, out ru)) continue;
        /* the WHOLE first-record value travels — OX/OY placement nudges
           included, not just the advance (field: an OY typed into the
           table was silently zeroed by the next pass) */
        outp[PairKey(lu, ru)] = r.firstAdjustmentRecord.glyphValueRecord;
      }
      return outp;
    }
    static void WriteFacePairs(TMP_FontAsset fa, Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> pairs) {
      if (fa == null) return;
      // a fresh font asset has no feature table until something makes one —
      // without this every measured pair went nowhere, silently
      if (fa.fontFeatureTable == null) SetField(fa, "m_FontFeatureTable", new TMP_FontFeatureTable());
      var feat = fa.fontFeatureTable;
      if (feat == null || fa.characterTable == null) return;
      var gi = new Dictionary<uint, uint>();
      foreach (var c in fa.characterTable) if (c != null && !gi.ContainsKey(c.unicode)) gi[c.unicode] = c.glyphIndex;
      /* A row the maker is still filling in has a glyph index of 0 on one
         side and resolves to nothing. This rebuild used to drop it, so the
         blank record you get from "Add New Glyph Adjustment Record"
         vanished the instant the sync ran — pressing the button appeared
         to break the table (owner: "it broke on the glyph adjustment
         after pressing add new glyph"). Carry those rows through
         untouched; they become real pairs once both sides are set, and
         the next pass picks them up properly. */
      var inProgress = new List<UnityEngine.TextCore.LowLevel.GlyphPairAdjustmentRecord>();
      foreach (var r in feat.glyphPairAdjustmentRecords)
        if (r.firstAdjustmentRecord.glyphIndex == 0 || r.secondAdjustmentRecord.glyphIndex == 0)
          inProgress.Add(r);
      feat.glyphPairAdjustmentRecords.Clear();
      foreach (var r in inProgress) feat.glyphPairAdjustmentRecords.Add(r);
      foreach (var kv in pairs) {
        uint lu = (uint)(kv.Key >> 32), ru = (uint)(kv.Key & 0xFFFFFFFFL);
        uint li, ri;
        if (!gi.TryGetValue(lu, out li) || !gi.TryGetValue(ru, out ri)) continue;
        var first = new UnityEngine.TextCore.LowLevel.GlyphAdjustmentRecord(li, kv.Value);
        var second = new UnityEngine.TextCore.LowLevel.GlyphAdjustmentRecord(ri, new UnityEngine.TextCore.LowLevel.GlyphValueRecord(0f, 0f, 0f, 0f));
        feat.glyphPairAdjustmentRecords.Add(new UnityEngine.TextCore.LowLevel.GlyphPairAdjustmentRecord(first, second));
      }
      fa.ReadFontAssetDefinition();
      EditorUtility.SetDirty(fa);
    }
    static int ApplyKernOverrides(string root, Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> pairs) {
      var p = root + "/fonts/kerning-overrides.json";
      if (!File.Exists(p)) return 0;
      PBKernOvFile f = null;
      try { f = JsonUtility.FromJson<PBKernOvFile>(File.ReadAllText(p)); } catch (Exception) { }
      if (f == null || f.pairs == null) return 0;
      foreach (var o in f.pairs) pairs[PairKey((uint)o.l, (uint)o.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(o.ox, o.oy, o.k, 0f);
      return f.pairs.Length;
    }
    /* Tune a pair — every layer moves natively (one font asset, one
       table, echoes of one mesh). This pass only RECORDS the tweak to
       fonts/kerning-overrides.json so the next zip re-applies it. */
    static bool s_kernSyncing;
    /* saving the font asset IS the gesture — no menu item to remember
       (owner: "running a tool is a bit cumbersome") */
    public static void SyncKerningQuiet() { SyncKerningCore(true); }
    [MenuItem("Tools/PatternBreak/Sync Label Kerning (usually automatic)")]
    public static void SyncKerning() { SyncKerningCore(false); }
    static void SyncKerningCore(bool auto) {
      if (s_kernSyncing) return; // our own SaveAssets re-enters the save hook
      s_kernSyncing = true;
      try { SyncKerningRun(auto); } finally { s_kernSyncing = false; }
    }
    static void SyncKerningRun(bool auto) {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) { if (!auto) Debug.LogWarning("UI Kit Maker: no kit in this project to sync."); return; }
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) continue;
        /* ONE table now — this pass is a SNAPSHOT, not a reconciliation.
           The whole layer stack reads a single font asset, so a pair tuned
           in its Glyph Adjustment Table moves every layer natively; there
           are no sibling copies to drift, and nothing here writes to the
           font — a row you are half-way through typing cannot be touched.
           All this does is record your deviations from the shipped bake
           into fonts/kerning-overrides.json so the next import re-applies
           them onto the rebuilt asset. */
        var fa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
        if (fa == null) fa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked.asset");
        if (fa == null) continue;
        /* No mirror copy lives here any more. The echo layers draw the
           master's own mesh, so a tuned pair moves every layer THE FRAME
           it lands — there is no second table in the project to bring up
           to date, and the brief catch-up blink the mirrors had is gone
           with them. */
        // what we SHIPPED, so a tweak can be told apart from the bake
        var shipped = new Dictionary<long, float>();
        if (m.typography != null && m.typography.bakedFace != null && !string.IsNullOrEmpty(m.typography.bakedFace.metrics)) {
          var jp = root + "/" + m.typography.bakedFace.metrics;
          if (File.Exists(jp)) {
            PBBakedFace bf = null;
            try { bf = JsonUtility.FromJson<PBBakedFace>(File.ReadAllText(jp)); } catch (Exception) { }
            if (bf != null && bf.kerning != null) foreach (var kp in bf.kerning) shipped[PairKey((uint)kp.l, (uint)kp.r)] = kp.k;
          }
        }
        /* seed from the record: a pair the face LOST (an older importer's
           rebuild) survives — the record is intent, the face only its
           current rendering. A pair the face still carries speaks for
           itself below, so reverting one by hand also clears it here. */
        var rec = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
        var prior = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
        var ovPath = root + "/fonts/kerning-overrides.json";
        if (File.Exists(ovPath)) {
          PBKernOvFile pf = null;
          try { pf = JsonUtility.FromJson<PBKernOvFile>(File.ReadAllText(ovPath)); } catch (Exception) { }
          if (pf != null && pf.pairs != null)
            foreach (var o in pf.pairs) prior[PairKey((uint)o.l, (uint)o.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(o.ox, o.oy, o.k, 0f);
        }
        foreach (var kv in prior) rec[kv.Key] = kv.Value;
        foreach (var kv in ReadFacePairs(fa)) {
          var v = kv.Value;
          float ship;
          bool hasShip = shipped.TryGetValue(kv.Key, out ship);
          bool zero = Mathf.Abs(v.xAdvance) < 0.01f && Mathf.Abs(v.xPlacement) < 0.01f && Mathf.Abs(v.yPlacement) < 0.01f;
          /* an all-zero pair the typeface never shipped is a row still
             being typed (glyphs set, numbers not yet) — never intent */
          if (zero && !hasShip) { rec.Remove(kv.Key); continue; }
          bool dev = (hasShip ? Mathf.Abs(v.xAdvance - ship) > 0.01f : true)
            || Mathf.Abs(v.xPlacement) > 0.01f || Mathf.Abs(v.yPlacement) > 0.01f;
          if (dev) rec[kv.Key] = v;
          else rec.Remove(kv.Key); // back to the shipped value = tweak reverted
        }
        /* nothing to record = nothing to write. An empty file must never
           replace a real one, and deleting the file must STAY deleted. */
        if (rec.Count == 0) {
          if (!auto) Debug.Log("UI Kit Maker: no kerning tweaks to record — the table matches the shipped bake.");
          continue;
        }
        bool changed = rec.Count != prior.Count;
        if (!changed) foreach (var kv in rec) {
          UnityEngine.TextCore.LowLevel.GlyphValueRecord pv;
          if (!prior.TryGetValue(kv.Key, out pv) || Mathf.Abs(pv.xAdvance - kv.Value.xAdvance) > 0.005f
              || Mathf.Abs(pv.xPlacement - kv.Value.xPlacement) > 0.005f || Mathf.Abs(pv.yPlacement - kv.Value.yPlacement) > 0.005f) { changed = true; break; }
        }
        if (!changed && auto) continue; // a quiet pass with nothing new stays quiet
        var tweaks = new List<PBKernOv>();
        foreach (var kv in rec)
          tweaks.Add(new PBKernOv { l = (int)(kv.Key >> 32), r = (int)(kv.Key & 0xFFFFFFFFL),
            k = kv.Value.xAdvance, ox = kv.Value.xPlacement, oy = kv.Value.yPlacement });
        var ovFile = new PBKernOvFile { pairs = tweaks.ToArray() };
        try {
          File.WriteAllText(ovPath, JsonUtility.ToJson(ovFile, true));
          AssetDatabase.ImportAsset(ovPath);
        } catch (Exception e) { Debug.LogWarning("UI Kit Maker: couldn't save your kerning tweaks — " + e.Message); }
        Debug.Log("UI Kit Maker: " + tweaks.Count + " tuned pair(s) recorded to fonts/kerning-overrides.json — every layer already follows (one shared table), and every future import re-applies them.");
      }
    }
#endif
    static void AssembleBakedFont(string root, PBManifest m, bool refresh, string faceName, string texPath, PBBakedGlyph[] glyphs, int atlasW, int atlasH, PBBakedFace face, string note) {
      var assetPath = root + "/fonts/" + faceName + ".asset";
      var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(assetPath);
      // a half-assembled survivor of a failed pass (created, then TMP threw
      // before the tables landed) counts as missing — rebuild it in place
      bool broken = existing != null && (existing.characterTable == null || existing.characterTable.Count == 0);
      if (existing != null && !refresh && !broken) return; // yours after first assembly; Regenerate refreshes
      var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
      if (tex == null) return; // atlas not imported yet — the next pass retries
      try {
        var shader = Shader.Find("TextMeshPro/Bitmap Custom Atlas"); // samples the atlas in full COLOR
        if (shader == null) shader = Shader.Find("TextMeshPro/Bitmap"); // alpha-only fallback: silhouettes, but working text
        if (shader == null) { Debug.LogWarning("UI Kit Maker: no TextMeshPro Bitmap shader in this project — baked face skipped."); return; }
        var fa = existing != null ? existing : ScriptableObject.CreateInstance<TMP_FontAsset>();
        fa.name = faceName;
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
        SetField(fi, "m_FamilyName", (string.IsNullOrEmpty(m.typography.font) ? "Kit" : m.typography.font) + " " + faceName.Replace("KitFace ", ""));
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
        foreach (var g in glyphs) {
          // the JSON is top-origin (canvas); TextCore rects are bottom-origin
          var rect = new UnityEngine.TextCore.GlyphRect(g.x, atlasH - g.y - g.h, g.w, g.h);
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
        /* the app's KERNING PAIRS (owner: "how far away the Y is from the
           other letterforms"): what the typeface says, then the maker's
           own tweaks on top (fonts/kerning-overrides.json). One table on
           one asset is the whole story now — the echo layers draw this
           font's own mesh, so they cannot hold a different table.
           Tolerant: a TMP without the feature table keeps plain
           advances. */
        int kernApplied = 0, kernKept = 0;
        try {
          var pairs = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
          if (face.kerning != null)
            foreach (var kp in face.kerning) pairs[PairKey((uint)kp.l, (uint)kp.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(0f, 0f, kp.k, 0f);
          kernKept = ApplyKernOverrides(root, pairs);
          WriteFacePairs(fa, pairs);
          kernApplied = pairs.Count;
        } catch (Exception) { kernApplied = 0; /* pairs are a refinement — advances stay correct */ }
        SetField(fa, "m_AtlasTextures", new Texture2D[] { tex });
        SetField(fa, "m_AtlasWidth", atlasW);
        SetField(fa, "m_AtlasHeight", atlasH);
        SetField(fa, "m_AtlasPadding", 2);
        SetField(fa, "m_AtlasPopulationMode", 0); // Static — the app owns the atlas
        var mat = fa.material != null ? fa.material : new Material(shader);
        if (fa.material == null) mat.name = faceName + " Material";
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
        Debug.Log("UI Kit Maker: " + faceName + " assembled at " + assetPath + " — " + fa.characterTable.Count
          + note + " Crisp up to ~" + Mathf.RoundToInt(face.pointSize) + "px, softens beyond — that's bitmap-font physics."
          + (kernApplied > 0
            ? " " + kernApplied + " kerning pairs written" + (kernKept > 0 ? " (" + kernKept + " of them YOUR tuned pairs, re-applied from fonts/kerning-overrides.json)" : "") + "."
            : (face.kerning != null && face.kerning.Length > 0
              ? " KERNING SKIPPED — this TMP version wouldn't take a pair-adjustment table, so letter pairs keep their plain advances. Send this line to uikitmaker.com."
              : " This kit's face reported no kerning pairs.")));
      } catch (Exception e) {
        Debug.LogWarning("UI Kit Maker: " + faceName + " couldn't self-assemble on this Unity version (" + e.Message + "). The atlas and metrics are intact in fonts/ — send this line to uikitmaker.com and we'll wire it.");
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
    /* The kit's CURRENT label dress — ink (solid or gradient), weight,
       italic, tracking — shared by prefab generation and by the per-import
       maintenance pass. Words, font size and alignment are never in here:
       those belong to the user. */
    static void TargetInk(PBStyle s, out Color top, out Color bot, out bool grad) {
      top = Color.white; bot = Color.white; grad = false;
      if (s == null) return;
      if (s.fillMode == "gradient" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top) && ColorUtility.TryParseHtmlString(s.fill2 != null ? s.fill2 : "", out bot)) grad = true;
      else if (s.fillMode == "solid" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top)) { }
      else top = Color.white; // "auto" resolves against each face; white is the safe stage ink
    }
    static FontStyles TargetFontStyle(PBStyle s) {
      var style = s != null && s.italic ? FontStyles.Italic : FontStyles.Normal;
      if (s != null && s.weight >= 700) style = style | FontStyles.Bold;
      return style;
    }
    static void StyleLabel(TextMeshProUGUI t, PBStyle s) {
      Color top, bot; bool grad;
      TargetInk(s, out top, out bot, out grad);
      t.fontStyle = TargetFontStyle(s);
      // the kit's tracking: both sides speak hundredths of an em
      if (s != null) t.characterSpacing = s.spacingEmPct;
      if (grad) { t.enableVertexGradient = true; t.colorGradient = new VertexGradient(top, top, bot, bot); t.color = Color.white; }
      else { t.enableVertexGradient = false; t.color = top; }
    }
    static bool LabelCurrent(TextMeshProUGUI t, PBStyle s, TMP_FontAsset face) {
      Color top, bot; bool grad;
      TargetInk(s, out top, out bot, out grad);
      if (face != null && t.font != face) return false;
      if (t.fontStyle != TargetFontStyle(s)) return false;
      if (s != null && !Mathf.Approximately(t.characterSpacing, s.spacingEmPct)) return false;
      if (t.enableVertexGradient != grad) return false;
      if (grad) return t.colorGradient.topLeft == top && t.colorGradient.bottomLeft == bot && t.color == Color.white;
      return t.color == top;
    }
    /* The kit's designed state INK for live labels, wired as a tiny runtime
       component riding the same pointer events as the Button's SpriteSwap
       (field: the face swaps on press but "the text isn't following the
       face"). A fork set on ONE specific button (manifest.labelStates,
       keyed by family) wins over the master typography.stateStyles set;
       only wired when the kit actually forks its text ink. */
    static bool HasStateInk(PBManifest m, string family) {
      if (m == null) return false;
      if (m.typography != null && m.typography.stateStyles != null && m.typography.stateStyles.Length > 0) return true;
      if (m.labelStates != null) foreach (var ls in m.labelStates) if (ls.family == family) return true;
      return false;
    }
    /* ink COLOR forks need the SDF face (its vertex color is dynamic);
       shift-only entries work on any face. This gate decides whether a
       family's label may wear the EXACT baked face instead. */
    static bool HasInkColorFork(PBManifest m, string family) {
      if (m == null) return false;
      if (m.typography != null && m.typography.stateStyles != null)
        foreach (var e in m.typography.stateStyles) if (!string.IsNullOrEmpty(e.fillMode)) return true;
      if (m.labelStates != null)
        foreach (var e in m.labelStates) if (e.family == family && !string.IsNullOrEmpty(e.fillMode)) return true;
      return false;
    }
    /* the label face ladder (owner, on seeing Miami's cyan stroke and
       chevron letter-pattern missing from button labels: "type coming from
       the kit on buttons is not working"): the BAKED face carries the
       app's exact pixels — stroke gradients, letter patterns, glints —
       so any family that doesn't need dynamic ink colors wears it. The
       styled SDF stays the fallback (free tier, offline bakes, ink forks). */
    static TMP_FontAsset BakedLabelFace(PBManifest m, string root, string family) {
      if (HasInkColorFork(m, family)) return null;
      return AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked.asset");
    }
    /* the kit's button-word size: the app scales it by the Type Size dial
       (52 = baseline) — 40 stays the fallback for pre-labelSize manifests */
    static float LabelSize(PBManifest m, string family) {
      // the app's own per-family size, shipped in the manifest; the single
      // style.labelSize covers older zips
      if (m != null && m.labelSizes != null)
        foreach (var e in m.labelSizes) if (e.family == family) return e.size;
      var ty = m != null && m.typography != null ? m.typography.style : null;
      return ty != null && ty.labelSize > 0f ? ty.labelSize : 40f;
    }
    static float ExpectedShift(PBManifest m, string family, string state) {
      if (m == null) return 0f;
      if (m.labelStates != null)
        foreach (var ls in m.labelStates) if (ls.family == family && ls.state == state) return ls.dy;
      if (m.typography != null && m.typography.stateStyles != null)
        foreach (var e in m.typography.stateStyles) if (e.state == state) return e.dy;
      return 0f;
    }
    // kit-sized, and auto-shrinking so a long word never spills the rect
    static void SizeLabel(TextMeshProUGUI t, float ls) {
      t.fontSize = ls;
      t.enableAutoSizing = true;
      t.fontSizeMax = ls;
      t.fontSizeMin = 12f;
    }
    static void AddBakedLabel(GameObject parent, string text, string root, TMP_FontAsset solo, PBManifest m, string family) {
      float ls = LabelSize(m, family);
      var go = new GameObject("Label", typeof(RectTransform));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      var layersFa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      var strokeInk = InkMaterial(root, "Stroke");
      if (layersFa != null && strokeInk != null) {
        /* layered mini-hero, echo construction (owner: "the unified
           background stroke thing and effects pass on the group, instead
           of each individual letter"): ONE text lays the word out; the
           soft shadow and the merged stroke are echoes of its mesh
           painted behind it, the glints in front. HeroLabel builds the
           echoes itself at load — the prefab carries only the text and
           the ink assignments, so nothing here can go stale. */
        var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
        lgo.transform.SetParent(go.transform, false);
        var lrt = lgo.GetComponent<RectTransform>();
        lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
        lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
        var lt = lgo.AddComponent<TextMeshProUGUI>();
        lt.text = text;
        lt.alignment = TextAlignmentOptions.Center;
        // the GROUP owns sizing: auto-fit re-solving the size behind the
        // group's back is how sizes used to wander
        lt.fontSize = ls;
        lt.enableAutoSizing = false;
        lt.raycastTarget = false;
        lt.font = layersFa;
        lt.color = Color.white;
        /* AddComponent fires ExecuteAlways OnEnable BEFORE the fields land
           (a fresh stack briefly applied text=PLAY/size=150 defaults and
           saved that way) — set everything, then re-Apply via SetText */
        var hl = go.AddComponent<HeroLabel>();
        hl.fontSize = ls;
        hl.shadowInk = InkMaterial(root, "Shadow");
        hl.strokeInk = strokeInk;
        hl.glintsInk = InkMaterial(root, "Glints");
        // resizing the BUTTON scales the type with it (owner: "scaling
        // needs to work like scaling") — remember the authored height
        var prt = parent.GetComponent<RectTransform>();
        hl.authoredHeight = prt != null ? prt.rect.height : 0f;
        hl.SetText(text);
        return;
      }
      // solo fallback (kit shipped no layer faces): every glyph carries
      // its own treatment
      go.AddComponent<CanvasRenderer>();
      var t = go.AddComponent<TextMeshProUGUI>();
      t.text = text;
      t.alignment = TextAlignmentOptions.Center;
      SizeLabel(t, ls);
      t.raycastTarget = false;
      t.font = solo;
      t.color = Color.white; // baked glyphs are pre-painted
    }
    /* the label WE generated is the child GameObject named "Label" — a
       single dynamic text OR a layered baked stack root */
    static GameObject FindOurLabelRoot(GameObject go) {
      foreach (var rt in go.GetComponentsInChildren<RectTransform>(true))
        if (rt.gameObject.name == "Label" && rt.gameObject != go) return rt.gameObject;
      return null;
    }
    static string LabelText(GameObject labelRoot, string fallback) {
      var hl = labelRoot.GetComponent<HeroLabel>();
      if (hl != null && !string.IsNullOrEmpty(hl.text)) return hl.text;
      var tmp = labelRoot.GetComponentInChildren<TextMeshProUGUI>(true);
      return tmp != null && !string.IsNullOrEmpty(tmp.text) ? tmp.text : fallback;
    }
    static bool WireLabelStates(GameObject go, GameObject labelRoot, PBManifest m, string family) {
      if (m == null || m.typography == null || labelRoot == null) return false;
      // the whole label moves; only a single dynamic text re-inks
      var label = labelRoot.GetComponent<TextMeshProUGUI>();
      var ty = m.typography;
      var states = new List<PBStateStyle>();
      if (m.labelStates != null)
        foreach (var ls in m.labelStates)
          if (ls.family == family) {
            var fam = new PBStateStyle();
            // dy included: the family entry MASKS the master entry below,
            // so dropping it here silently disarms the press sink (field
            // bug: every button armed 0px while the manifest said 14)
            fam.state = ls.state; fam.fillMode = ls.fillMode; fam.fill = ls.fill; fam.fill2 = ls.fill2; fam.dy = ls.dy;
            states.Add(fam);
          }
      if (ty.stateStyles != null)
        foreach (var ms in ty.stateStyles) {
          bool covered = false;
          foreach (var q in states) if (q.state == ms.state) { covered = true; break; }
          if (!covered) states.Add(ms);
        }
      if (states.Count == 0) {
        // the kit no longer forks its text ink — retire a stale component
        var stale = go.GetComponent<LabelStateInk>();
        if (stale != null) UnityEngine.Object.DestroyImmediate(stale, true);
        return false;
      }
      var ink = go.GetComponent<LabelStateInk>();
      if (ink == null) ink = go.AddComponent<LabelStateInk>();
      ink.shiftTarget = labelRoot.GetComponent<RectTransform>();
      ink.label = label;
      Color top, bot; bool grad;
      TargetInk(ty.style, out top, out bot, out grad);
      ink.restTop = top; ink.restBottom = bot; ink.restGradient = grad;
      ink.inkOn = false; ink.hoverOn = false; ink.pressedOn = false;
      ink.hoverShift = 0f; ink.pressedShift = 0f;
      foreach (var fork in states) {
        // an entry may carry ink colors, a face-riding shift, or both;
        // ink only drives a single dynamic text (baked stacks are painted)
        bool hasInk = label != null && !string.IsNullOrEmpty(fork.fillMode);
        if (hasInk) {
          var forkStyle = new PBStyle();
          forkStyle.fillMode = fork.fillMode; forkStyle.fill = fork.fill; forkStyle.fill2 = fork.fill2;
          TargetInk(forkStyle, out top, out bot, out grad);
        }
        if (fork.state == "hover") { ink.hoverShift = fork.dy; if (hasInk) { ink.inkOn = true; ink.hoverOn = true; ink.hoverTop = top; ink.hoverBottom = bot; ink.hoverGradient = grad; } }
        else if (fork.state == "pressed") { ink.pressedShift = fork.dy; if (hasInk) { ink.inkOn = true; ink.pressedOn = true; ink.pressedTop = top; ink.pressedBottom = bot; ink.pressedGradient = grad; } }
      }
      return true;
    }
    static void AddTmpLabel(GameObject parent, string text, TMP_FontAsset face, PBStyle s, float ls) {
      var go = new GameObject("Label", typeof(RectTransform), typeof(CanvasRenderer));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      var t = go.AddComponent<TextMeshProUGUI>();
      t.text = text;
      t.alignment = TextAlignmentOptions.Center;
      SizeLabel(t, ls);
      t.raycastTarget = false;
      if (face != null) t.font = face;
      StyleLabel(t, s);
    }
#endif
    /* Placed from the manifest's numbers rather than guessed: one SVG pixel
       is one prefab unit (the sprite rasterizes at pngScale and the prefab
       divides by it again), so left and size travel through untouched.
       Stretched anchors + a left margin keep it pinned to the field's left
       edge at any width, which is what a 9-sliced input actually does. */
    static void AddPlaceholder(GameObject parent, string root, PBManifest m, Font kitFont) {
      var ph = m != null ? m.placeholder : null;
      if (ph == null || string.IsNullOrEmpty(ph.text)) return;
      var go = new GameObject("Placeholder (delete or bind)", typeof(RectTransform), typeof(CanvasRenderer));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      /* the sprite is cropped tight to the geometry and the extrusion hangs
         BELOW the field, so the sprite's middle sits lower than the field's.
         The manifest measures down from the top edge; convert once we know
         the rect. */
      var prt = parent.GetComponent<RectTransform>();
      float mid = prt != null ? prt.rect.height * 0.5f : 0f;
      rt.anchoredPosition = new Vector2(0f, mid - ph.centerFromTop);
      Color col;
      if (string.IsNullOrEmpty(ph.color) || !ColorUtility.TryParseHtmlString(ph.color, out col)) col = Color.white;
      col.a = Mathf.Clamp01(ph.opacity / 100f);
#if UNITY_2023_2_OR_NEWER
      var face = EnsureTmpFace(root, m, kitFont);
      if (face != null) {
        var t = go.AddComponent<TextMeshProUGUI>();
        t.text = ph.text;
        t.font = face;
        t.enableAutoSizing = false;
        t.fontSize = ph.size;
        t.alignment = TextAlignmentOptions.Left;   // midline-left: centred vertically, pinned left
        t.margin = new Vector4(ph.left, 0f, ph.left, 0f);
        t.color = col;
        if (ph.italic) t.fontStyle = FontStyles.Italic;
        t.raycastTarget = false;
        return;
      }
#endif
      var u = go.AddComponent<Text>();
      u.text = ph.text;
      u.alignment = TextAnchor.MiddleLeft;
      u.fontSize = Mathf.RoundToInt(ph.size);
      u.color = col;
      u.raycastTarget = false;
      if (ph.italic) u.fontStyle = FontStyle.Italic;
      var f = kitFont != null ? kitFont : BuiltinFont();
      if (f != null) u.font = f;
      rt.offsetMin = new Vector2(ph.left, rt.offsetMin.y);
      rt.offsetMax = new Vector2(-ph.left, rt.offsetMax.y);
    }
    static void AddLabel(GameObject parent, string text, Font kitFont, string root, PBManifest m, string family) {
#if UNITY_2023_2_OR_NEWER
      var face = EnsureTmpFace(root, m, kitFont);
      if (face != null) {
        AddTmpLabel(parent, text, face, m != null && m.typography != null ? m.typography.style : null, LabelSize(m, family));
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
      var hover = State(famDir, "hover");
      var pressed = State(famDir, "pressed");
      var disabled = State(famDir, "disabled");
      if (hover != null || pressed != null || disabled != null) {
        var btn = go.AddComponent<Button>();
        // explicit target: play mode would self-resolve in Awake, but the
        // Inspector shows "None (Graphic)" until then and reads as unwired
        btn.targetGraphic = img;
        btn.transition = Selectable.Transition.SpriteSwap;
        var ss = new SpriteState();
        ss.highlightedSprite = hover;
        // selected stays the RESTING face — mirroring hover here left a
        // clicked button stuck in rollover after the pointer moved away
        ss.selectedSprite = null;
        ss.pressedSprite = pressed;
        ss.disabledSprite = disabled;
        btn.spriteState = ss;
        WireStateFx(go, root, m, baseAsset.component, basePath, pngScale);
      }
      /* the input's affordance, as a LAYER. It used to be painted into the
         surface, which looked right and could never be taken off (owner:
         "I didn't realize the text would be burned into the image"). One
         child named so its job is obvious — retype it, bind it to your
         field's placeholder slot, or select it and press Delete. */
      if (baseAsset.component == "input") AddPlaceholder(go, root, m, kitFont);
      if (label != null) {
#if UNITY_2023_2_OR_NEWER
        // exact pixels first: the baked faces when the kit ships them and
        // the family needs no dynamic ink; the styled SDF otherwise
        var bakedLabelFace = BakedLabelFace(m, root, baseAsset.component);
        if (bakedLabelFace != null) AddBakedLabel(go, label, root, bakedLabelFace, m, baseAsset.component);
        else
#endif
        AddLabel(go, label, kitFont, root, m, baseAsset.component);
      }
#if UNITY_2023_2_OR_NEWER
      // the kit's designed state ink/shift follows the face swap (only
      // wired when the kit forks its states)
      var labelRoot = FindOurLabelRoot(go);
      if (labelRoot != null) WireLabelStates(go, labelRoot, m, baseAsset.component);
#endif
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* A state sprite is nine-sliced on the stretchy families and plain on
       the round ones (an icon button or a radio has nothing to stretch), so
       both names have to be tried. Looking only for ".9.png" is why the
       icon button, checkbox and radio arrived with no Button at all —
       their states shipped, nothing ever read them. */
    static Sprite State(string famDir, string name) {
      var nine = S(famDir + "/base-" + name + ".9.png");
      return nine != null ? nine : S(famDir + "/base-" + name + ".png");
    }
    /* the glow and the lift, wired from the kit's own state dials. Only
       goes on pieces that actually swap — a panel has no hover to announce. */
    static void WireStateFx(GameObject go, string root, PBManifest m, string family, string basePath, int pngScale) {
      if (m == null || m.stateFx == null || m.stateFx.Length == 0) return;
      if (go.GetComponent<StateFx>() != null) return;
      bool any = false;
      float rest = 0f, hover = 0f, press = 0f, dis = 0f, restL = 0f, hoverL = 0f, pressL = 0f;
      foreach (var f in m.stateFx) {
        if (f == null || f.family != family) continue;
        any = true;
        if (f.state == "default") { rest = f.glow; restL = f.lift; }
        else if (f.state == "hover") { hover = f.glow; hoverL = f.lift; }
        else if (f.state == "pressed") { press = f.glow; pressL = f.lift; }
        else if (f.state == "disabled") dis = f.glow;
      }
      if (!any) return;
      var fx = go.AddComponent<StateFx>();
      /* the piece's OWN aura — its silhouette, blurred the way the app
         blurs it. fx/glow.png is a generic radial blob and only stands in
         for a family that ships no aura (owner, on the blob: "looks pretty
         generic… very big and not as soft comparatively"). */
      var baseSp = S(basePath);
      var glowSp = S(Path.GetDirectoryName(basePath).Replace("\\\\", "/") + "/glow.png");
      fx.glowSprite = glowSp != null ? glowSp : S(root + "/assets/fx/glow.png");
      if (glowSp != null && baseSp != null && pngScale > 0)
        fx.glowPad = new Vector2(
          (glowSp.rect.width - baseSp.rect.width) * 0.5f / pngScale,
          (glowSp.rect.height - baseSp.rect.height) * 0.5f / pngScale);
      Color gc;
      if (m.palette == null || string.IsNullOrEmpty(m.palette.glow) || !ColorUtility.TryParseHtmlString(m.palette.glow, out gc)) gc = Color.white;
      fx.glowColor = gc;
      // the manifest already ships lift RELATIVE to rest and Unity-side up
      fx.restGlow = rest; fx.hoverGlow = hover; fx.pressedGlow = press; fx.disabledGlow = dis;
      fx.restLift = restL; fx.hoverLift = hoverL; fx.pressedLift = pressL;
    }
    static bool HasStateFx(PBManifest m, string family) {
      if (m == null || m.stateFx == null) return false;
      foreach (var f in m.stateFx) if (f != null && f.family == family) return true;
      return false;
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
    static void StretchFull(RectTransform rt) {
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
    }
    /* the STRETCH-SAFE face: under (Sliced) masks a Tiled pattern, then
       over (Sliced) lays the gloss back on top. Stretch this to any width
       and the frame stretches, the pattern tiles at constant scale, and
       the gloss stays one sweep — what the app shows, at any size. */
    static bool TiledFacePrefab(string dir, string root, int pngScale, string fam) {
      var under = S(root + "/assets/" + fam + "/base-under.9.png");
      var over = S(root + "/assets/" + fam + "/base-over.9.png");
      var tile = S(root + "/assets/fx/face-tile.png");
      if (under == null || over == null || tile == null) return false;
      var goName = NiceName(fam) + " (tiled face)";
      var go = ImageObject(goName, under, pngScale);
      var ui = go.GetComponent<Image>();
      ui.type = Image.Type.Sliced;
      /* the stencil is its OWN hidden layer. Unity only alpha-clips a
         Mask when Show Mask Graphic is OFF — masking with the visible art
         gives a rectangular stencil, and the pattern spills past the
         silhouette (field report). */
      var maskSp = S(root + "/assets/" + fam + "/base-mask.9.png");
      var maskGo = ImageObject("PatternMask", maskSp != null ? maskSp : under, pngScale);
      maskGo.transform.SetParent(go.transform, false);
      var mi = maskGo.GetComponent<Image>();
      mi.type = Image.Type.Sliced;
      mi.raycastTarget = false;
      StretchFull(maskGo.GetComponent<RectTransform>());
      var mask = maskGo.AddComponent<Mask>();
      mask.showMaskGraphic = false;
      var pat = ImageObject("Pattern", tile, pngScale);
      pat.transform.SetParent(maskGo.transform, false);
      var pi = pat.GetComponent<Image>();
      pi.type = Image.Type.Tiled;
      pi.raycastTarget = false;
      StretchFull(pat.GetComponent<RectTransform>());
      var ov = ImageObject("Over", over, pngScale);
      ov.transform.SetParent(go.transform, false);
      var oi = ov.GetComponent<Image>();
      oi.type = Image.Type.Sliced;
      oi.raycastTarget = false;
      StretchFull(ov.GetComponent<RectTransform>());
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the touch stick, WIRED: base + thumb + PatternBreak.TouchStick —
       drop it on a Canvas, press Play, drag. Value is the direction. */
    static bool JoystickPrefab(string dir, string root, int pngScale) {
      var baseSp = S(root + "/assets/joystick/base.png");
      var thumbSp = S(root + "/assets/joystick/thumb.png");
      if (baseSp == null || thumbSp == null) return false;
      var go = ImageObject("Joystick", baseSp, pngScale);
      var th = ImageObject("Thumb", thumbSp, pngScale);
      th.transform.SetParent(go.transform, false);
      th.GetComponent<Image>().raycastTarget = false;
      var stick = go.AddComponent<TouchStick>();
      stick.thumb = th.GetComponent<RectTransform>();
      float half = (baseSp.rect.width / pngScale) * 0.5f;
      float thumbHalf = (thumbSp.rect.width / pngScale) * 0.5f;
      stick.radius = Mathf.Max(20f, half - thumbHalf - 6f);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Joystick.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the health globe, ALIVE: glass masks a Filled(Vertical) liquid —
       Image.fillAmount IS the health; the rim draws above. */
    static bool GlobePrefab(string dir, string root, int pngScale) {
      var glass = S(root + "/assets/globe/glass.png");
      var rim = S(root + "/assets/globe/rim.png");
      var liquid = S(root + "/assets/globe/liquid.png");
      if (glass == null || rim == null || liquid == null) return false;
      var go = ImageObject("HealthGlobe", glass, pngScale);
      /* the stencil is a HIDDEN copy of the glass: Unity only alpha-clips
         a Mask when its graphic is hidden, so masking with the visible
         glass would clip the liquid to a RECTANGLE (same gotcha the
         tiled face hit in the field) */
      var maskGo = ImageObject("LiquidMask", glass, pngScale);
      maskGo.transform.SetParent(go.transform, false);
      maskGo.GetComponent<Image>().raycastTarget = false;
      var mrt = maskGo.GetComponent<RectTransform>();
      mrt.anchorMin = Vector2.zero; mrt.anchorMax = Vector2.one;
      mrt.offsetMin = Vector2.zero; mrt.offsetMax = Vector2.zero;
      var mask = maskGo.AddComponent<Mask>();
      mask.showMaskGraphic = false;
      var lq = ImageObject("Liquid", liquid, pngScale);
      lq.transform.SetParent(maskGo.transform, false);
      var li = lq.GetComponent<Image>();
      li.type = Image.Type.Filled;
      li.fillMethod = Image.FillMethod.Vertical;
      li.fillOrigin = (int)Image.OriginVertical.Bottom;
      li.fillAmount = 0.72f; // drive this from your live health
      li.raycastTarget = false;
      var lrt = lq.GetComponent<RectTransform>();
      lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
      lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
      var rm = ImageObject("Rim", rim, pngScale);
      rm.transform.SetParent(go.transform, false);
      rm.GetComponent<Image>().raycastTarget = false;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/HealthGlobe.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#if UNITY_2023_2_OR_NEWER
    /* the season track: bare art + PatternBreak.SeasonTrack, which owns
       the CONTENT (lane names, level numbers, progress) as live text —
       its Inspector says so, prototypers edit there (owner). */
    static bool SeasonTrackPrefab(string dir, string root, int pngScale, PBManifest m) {
      var baseSp = S(root + "/assets/seasontrack/base.png");
      if (baseSp == null) return false;
      var go = ImageObject("SeasonTrack", baseSp, pngScale);
      var trackC = go.AddComponent<SeasonTrack>();
      Font kitFont = null;
      if (m != null && m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        kitFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
      trackC.face = EnsureTmpFace(root, m, kitFont);
      trackC.Rebuild();
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/SeasonTrack.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#endif
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
      // the RIGS: working controls composed from their layer sprites
      if (JoystickPrefab(dir, root, pngScale)) any = true;
      if (GlobePrefab(dir, root, pngScale)) any = true;
      // the wide, stateless pieces also get a stretch-safe variant when
      // the kit wears a pattern (the plain Sliced prefab still ships)
      foreach (var tf in new string[] { "panel", "header" }) if (TiledFacePrefab(dir, root, pngScale, tf)) any = true;
#if UNITY_2023_2_OR_NEWER
      if (SeasonTrackPrefab(dir, root, pngScale, m)) any = true;
#endif
      /* every family with a "base" sprite becomes a prefab; the composed
         controls and pure parts opt out (they're layers, not pieces) */
      var labeled = new HashSet<string> { "button-primary", "button-secondary", "button-small", "chip", "tab" };
      /* the data-heavy panels (lap times, leaderboard, telemetry) read as
         empty shells without their live content — their sprites still ship,
         but they don't make useful drag-in prefabs (owner) */
      var skip = new HashSet<string> { "progress", "slider", "toggle", "segbar", "fx", "icons", "dropdown", "rarityframe", "loottag", "speedo", "speedo2", "circuit", "startlights", "laptimes", "leaderboard", "telemetry", "joystick", "globe", "seasontrack", "extras" };
      foreach (var a in m.assets) {
        if (a == null || string.IsNullOrEmpty(a.component) || a.part != "base") continue;
        if (skip.Contains(a.component)) continue;
        skip.Add(a.component); // one per family
        var label = labeled.Contains(a.component) ? DefaultLabel(a.component) : null;
        if (FamilyPrefab(dir, root, a, NiceName(a.component), label, pngScale, kitFont, m)) any = true;
      }
#if UNITY_2023_2_OR_NEWER
      if (HeroLabelPrefab(dir, root)) any = true;
#endif
      // an EMPTY folder must not latch generation off forever — if nothing
      // landed (sprites missing on a manual run), clean up so the next
      // pass gets its first-import chance
      if (!any && createdHere) AssetDatabase.DeleteAsset(dir);
      return any;
    }
    /* Per-import maintenance for OUR example prefabs — the two things that
       must track the kit even though "your prefabs are yours" (owner field
       reports: dead buttons from pre-wiring kits; labels wearing the type
       style from the day they were generated — "legacy text"):
       1. WIRING: a prefab with NO Selectable of any kind whose family
          ships state sprites gets Button + SpriteSwap (one the user
          removed or replaced is a choice we honor).
       2. LABEL DRESS: the label WE generated (named "Label") is re-dressed
          in the kit's CURRENT type — ink, weight, italic, tracking, face.
          Words, size and alignment are the user's and never touched;
          renamed or added texts are skipped entirely.
       Both are surgical, idempotent (nothing saves unless something
       actually changed), and placed copies (the Playground included)
       inherit the result automatically. */
    static void MaintainExamplePrefabs(string root, PBManifest m) {
      var dir = root + "/Prefabs";
      if (!AssetDatabase.IsValidFolder(dir)) return;
      int wired = 0, redressed = 0, purgedGhosts = 0;
      float armedSink = 0f;
#if UNITY_2023_2_OR_NEWER
      var face = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
      var kitStyle = m != null && m.typography != null ? m.typography.style : null;
      // the shipped TTF, for labels rebuilt on the SDF path
      Font mkFont = null;
      if (m != null && m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        mkFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
#endif
      int healed = 0;
      foreach (var g in AssetDatabase.FindAssets("t:Prefab", new string[] { dir })) {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (asset == null) continue;
        var rootImg = asset.GetComponent<Image>();
        if (rootImg == null || rootImg.sprite == null) {
#if UNITY_2023_2_OR_NEWER
          // the HeroLabel prefab (no root Image): a Play-mode or
          // essentials-race import can leave its layers with NO font —
          // re-attach each layer's own baked face, words untouched
          if (rootImg == null && asset.GetComponent<HeroLabel>() != null) HealHeroLabel(root, path, asset, ref healed);
#endif
          continue;
        }
        var spritePath = AssetDatabase.GetAssetPath(rootImg.sprite).Replace("\\\\", "/");
        if (!spritePath.StartsWith(root + "/assets/")) continue; // not this kit's sprite — not ours to touch
        var famDir = Path.GetDirectoryName(spritePath).Replace("\\\\", "/");
        var famName = Path.GetFileName(famDir);
        var hover = State(famDir, "hover");
        var pressed = State(famDir, "pressed");
        var disabled = State(famDir, "disabled");
        bool wantWiring = asset.GetComponent<Selectable>() == null && (hover != null || pressed != null || disabled != null);
        /* a prefab built by an older importer already has its Button, so the
           wiring branch never fires — it would have kept its quiet face swap
           forever without this (owner: "I'm not getting the glows on hover") */
        bool wantFx = (hover != null || pressed != null || disabled != null)
          && asset.GetComponent<StateFx>() == null && HasStateFx(m, famName);
        bool wantDress = false;
#if UNITY_2023_2_OR_NEWER
        if (kitStyle != null) {
          var probeRoot = FindOurLabelRoot(asset);
          if (probeRoot != null) {
            /* the family's target label SHAPE: layered baked stack when the
               kit ships layer faces and needs no dynamic ink; solo baked
               next; styled SDF last — re-dress whenever the current shape
               isn't the target */
            var wantBaked = BakedLabelFace(m, root, famName);
            var probeTmp = probeRoot.GetComponent<TextMeshProUGUI>();
            bool stacked = probeRoot.GetComponent<HeroLabel>() != null;
            var wantMaster = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
            var wantStroke = InkMaterial(root, "Stroke");
            bool layersShip = wantMaster != null && wantStroke != null;
            if (wantBaked != null && layersShip) {
              wantDress = !stacked;
              /* any older stack shape re-dresses to the echo construction:
                 the mirror-era four-text build (more than one text under
                 the root), a text off the master font (deleted mirror
                 assets — field: "no Font Asset assigned"), or ink slots
                 the importer hasn't armed yet */
              if (!wantDress) {
                int texts = 0;
                foreach (var lt in probeRoot.GetComponentsInChildren<TextMeshProUGUI>(true)) {
                  texts++;
                  if (lt.font != wantMaster) wantDress = true;
                }
                var hlInk = probeRoot.GetComponent<HeroLabel>();
                if (texts != 1 || hlInk == null || hlInk.strokeInk != wantStroke) wantDress = true;
              }
            }
            else if (wantBaked != null) wantDress = stacked || probeTmp == null || probeTmp.font != wantBaked || probeTmp.enableVertexGradient || probeTmp.color != Color.white;
            else wantDress = stacked || probeTmp == null || !LabelCurrent(probeTmp, kitStyle, face);
            // the kit's Type Size dial drives the word size — converge
            // labels sized by an older importer (or an older dial).
            // STACKS are judged by the GROUP contract (HeroLabel owns the
            // size; auto-fit is forced OFF per layer — the old per-layer
            // demand would rebuild every healthy stack on every import)
            var hlSize = probeRoot.GetComponent<HeroLabel>();
            if (!wantDress && hlSize != null) {
              if (!Mathf.Approximately(hlSize.fontSize, LabelSize(m, famName))) wantDress = true;
            } else if (!wantDress) {
              var sizeTmp = probeRoot.GetComponentInChildren<TextMeshProUGUI>(true);
              if (sizeTmp != null && (!sizeTmp.enableAutoSizing || !Mathf.Approximately(sizeTmp.fontSizeMax, LabelSize(m, famName))))
                wantDress = true;
            }
            /* dead or stale state wiring re-converges: a script-identity
               break (delete-and-redrop mints a new script GUID) leaves a
               "Behaviour is missing" GHOST — GetComponent returns null,
               SpriteSwap keeps working, and the sink dies silently (field:
               "it still does not move with the button face") */
            /* v-scale arming: a stack built before authoredHeight existed
               can't scale with its button (field: "scaling still isn't
               working") — one rebuild arms it, words preserved */
            if (!wantDress) {
              var hlProbe = probeRoot.GetComponent<HeroLabel>();
              if (hlProbe != null && hlProbe.authoredHeight < 0.5f) wantDress = true;
            }
            if (!wantDress && HasStateInk(m, famName)) {
              var inkNow = asset.GetComponent<LabelStateInk>();
              if (inkNow == null
                  || !Mathf.Approximately(inkNow.pressedShift, ExpectedShift(m, famName, "pressed"))
                  || !Mathf.Approximately(inkNow.hoverShift, ExpectedShift(m, famName, "hover")))
                wantDress = true;
            }
          }
        }
#endif
        if (!wantWiring && !wantDress && !wantFx) continue;
        var contents = PrefabUtility.LoadPrefabContents(path);
        try {
          bool changed = false;
          // sweep dead script references (a delete-and-redrop mints new
          // script GUIDs; the ghosts block nothing but confuse everything)
          foreach (var tr in contents.GetComponentsInChildren<Transform>(true))
            if (GameObjectUtility.RemoveMonoBehavioursWithMissingScript(tr.gameObject) > 0) { purgedGhosts++; changed = true; }
          if (wantWiring && contents.GetComponent<Selectable>() == null) {
            var btn = contents.AddComponent<Button>();
            btn.targetGraphic = contents.GetComponent<Image>();
            btn.transition = Selectable.Transition.SpriteSwap;
            var ss = new SpriteState();
            ss.highlightedSprite = hover;
            // selected stays the RESTING face — mirroring hover here made a
            // clicked button look stuck in rollover (field: "weird and
            // incorrect"); null falls back to the base sprite
            ss.selectedSprite = null;
            ss.pressedSprite = pressed;
            ss.disabledSprite = disabled;
            btn.spriteState = ss;
            WireStateFx(contents, root, m, famName, spritePath, m.pngScale);
            wired++; changed = true;
          }
          if (wantFx && contents.GetComponent<StateFx>() == null) {
            WireStateFx(contents, root, m, famName, spritePath, m.pngScale);
            if (contents.GetComponent<StateFx>() != null) { wired++; changed = true; }
          }
#if UNITY_2023_2_OR_NEWER
          if (wantDress) {
            var oldRoot = FindOurLabelRoot(contents);
            if (oldRoot != null) {
              /* rebuild the label in the target shape, WORDS PRESERVED —
                 per-field surgery across three possible shapes is where
                 stale dress bugs breed */
              var keepText = LabelText(oldRoot, DefaultLabel(famName));
              /* the AUTHORED height survives the rebuild — re-capturing it
                 from the owner's resized rect would silently re-baseline
                 the v-scale to 1 and snap their scaled type back */
              var oldHl = oldRoot.GetComponent<HeroLabel>();
              float keepAuthored = oldHl != null ? oldHl.authoredHeight : 0f;
              Vector2 keepNudge = oldHl != null ? oldHl.nudge : Vector2.zero;
              Vector4 keepMargins = oldHl != null ? oldHl.margins : Vector4.zero;
              // hand-tuned tracking and line height survive too (field:
              // a line height matched up by hand must never be re-lost)
              float keepSpacing = oldHl != null ? oldHl.spacing : 0f;
              float keepWordSpacing = oldHl != null ? oldHl.wordSpacing : 0f;
              float keepLineSpacing = oldHl != null ? oldHl.lineSpacing : 0f;
              UnityEngine.Object.DestroyImmediate(oldRoot);
              var wantBaked = BakedLabelFace(m, root, famName);
              if (wantBaked != null) AddBakedLabel(contents, keepText, root, wantBaked, m, famName);
              else AddLabel(contents, keepText, mkFont, root, m, famName);
              var newRoot = FindOurLabelRoot(contents);
              if (newRoot != null) {
                var newHl = newRoot.GetComponent<HeroLabel>();
                // the maker's own placement and spacing survive the rebuild
                if (newHl != null) {
                  if (keepAuthored >= 0.5f) newHl.authoredHeight = keepAuthored;
                  newHl.nudge = keepNudge; newHl.margins = keepMargins;
                  newHl.spacing = keepSpacing; newHl.wordSpacing = keepWordSpacing; newHl.lineSpacing = keepLineSpacing;
                  newHl.SetText(newHl.text);
                }
              }
              if (newRoot != null) WireLabelStates(contents, newRoot, m, famName);
              var armed = contents.GetComponent<LabelStateInk>();
              if (armed != null && armed.pressedShift != 0f) armedSink = armed.pressedShift;
              redressed++; changed = true;
            }
          }
#endif
          if (changed) PrefabUtility.SaveAsPrefabAsset(contents, path);
        } finally { PrefabUtility.UnloadPrefabContents(contents); }
      }
      if (wired > 0)
        Debug.Log("UI Kit Maker: wired hover/press/disabled states onto " + wired + " example prefab(s) from an earlier kit version — press Play and mouse over them. Copies already placed in scenes (the Playground included) picked the wiring up automatically.");
      if (redressed > 0)
        Debug.Log("UI Kit Maker: re-dressed the label on " + redressed + " example prefab(s) to the kit's current type style (words untouched) — the old dress was frozen at generation time."
          /* the armed sink IN THE RECEIPT: whether press-follow is wired is
             field-checkable from the Console alone (owner loop: "type still
             isn't following the face") */
          + (armedSink != 0f ? " Press sink armed: labels ride the face " + armedSink + "px down while pressed." : " No press sink in this kit's state recipe (labels stay put by design)."));
      if (healed > 0)
        Debug.Log("UI Kit Maker: rebuilt " + healed + " HeroLabel prefab(s) to the echo construction (one text, layer inks) — words preserved; placed copies healed with it.");
      if (purgedGhosts > 0)
        Debug.Log("UI Kit Maker: purged dead script reference(s) on " + purgedGhosts + " prefab(s) (a script identity change from a delete-and-redrop) — the state wiring was rebuilt fresh alongside.");
    }
#if UNITY_2023_2_OR_NEWER
    static void HealHeroLabel(string root, string path, GameObject asset, ref int healed) {
      var master = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      if (master == null) return;
      var strokeInk = InkMaterial(root, "Stroke");
      // the echo shape: exactly one text, on the master font, inks armed
      bool broken = false;
      int texts = 0;
      foreach (var lt in asset.GetComponentsInChildren<TextMeshProUGUI>(true)) {
        texts++;
        if (lt.font != master) broken = true;
      }
      var hl = asset.GetComponent<HeroLabel>();
      if (texts != 1 || hl == null || (strokeInk != null && hl.strokeInk != strokeInk)) broken = true;
      if (!broken) return;
      /* rebuild in place, word preserved — the echo construction is cheap
         and total, and per-field surgery across generations of stack
         shapes is where stale-dress bugs breed */
      var contents = PrefabUtility.LoadPrefabContents(path);
      try {
        var oldHl = contents.GetComponent<HeroLabel>();
        string keepText = oldHl != null && !string.IsNullOrEmpty(oldHl.text) ? oldHl.text : "PLAY";
        float keepSize = oldHl != null && oldHl.fontSize > 1f ? oldHl.fontSize : 150f;
        for (int i = contents.transform.childCount - 1; i >= 0; i--)
          UnityEngine.Object.DestroyImmediate(contents.transform.GetChild(i).gameObject);
        var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
        lgo.transform.SetParent(contents.transform, false);
        var lrt = lgo.GetComponent<RectTransform>();
        lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
        lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
        var t = lgo.AddComponent<TextMeshProUGUI>();
        t.text = keepText;
        t.alignment = TextAlignmentOptions.Center;
        t.fontSize = keepSize;
        t.enableAutoSizing = false;
        t.raycastTarget = false;
        t.font = master;
        t.color = Color.white;
        var newHl = oldHl != null ? oldHl : contents.AddComponent<HeroLabel>();
        newHl.fontSize = keepSize;
        newHl.shadowInk = InkMaterial(root, "Shadow");
        newHl.strokeInk = strokeInk;
        newHl.glintsInk = InkMaterial(root, "Glints");
        newHl.SetText(keepText);
        PrefabUtility.SaveAsPrefabAsset(contents, path);
        healed++;
      } finally { PrefabUtility.UnloadPrefabContents(contents); }
    }
#endif
#if UNITY_2023_2_OR_NEWER
    /* ── HeroLabel: the app's paint order as a prefab. ONE text — the
       Fill — and its echoes: the soft shadow and every stroke merged into
       one silent band behind the whole word, glint sparks in front. The
       word is typed ONCE, on the text or on the root's Hero Label box;
       the echoes are redraws of the same mesh and cannot disagree. ── */
    static bool HeroLabelPrefab(string dir, string root) {
      var layersFa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      var strokeInk = InkMaterial(root, "Stroke");
      if (layersFa == null || strokeInk == null) return false;
      var go = new GameObject("HeroLabel", typeof(RectTransform));
      go.GetComponent<RectTransform>().sizeDelta = new Vector2(900f, 220f);
      var hl = go.AddComponent<HeroLabel>();
      var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
      lgo.transform.SetParent(go.transform, false);
      var lrt = lgo.GetComponent<RectTransform>();
      lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
      lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
      var t = lgo.AddComponent<TextMeshProUGUI>();
      t.text = "PLAY";
      t.alignment = TextAlignmentOptions.Center;
      t.fontSize = 150f;
      t.enableAutoSizing = false;
      t.raycastTarget = false;
      t.font = layersFa;
      t.color = Color.white;
      // shadow + glints are optional layers — an empty slot simply means
      // this kit designed no such ink
      hl.shadowInk = InkMaterial(root, "Shadow");
      hl.strokeInk = strokeInk;
      hl.glintsInk = InkMaterial(root, "Glints");
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/HeroLabel.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#endif
  }

  /* Applies manifest settings to kit textures AS THEY IMPORT — covers
     reimports and asset refreshes without anyone running the menu. */
#if UNITY_2023_2_OR_NEWER
  /* Tune a pair in the Glyph Adjustment Table, pause — the tweak is
     recorded to fonts/kerning-overrides.json by itself so re-imports
     re-apply it. The menu item stays as a manual re-run. */
  /* Saving is not the only moment a pair gets tuned — mostly it isn't the
     moment at all. Typing a number into the Glyph Adjustment Table marks the
     font asset dirty and nothing else, so the save hook below never fired and
     the tweak sat on ONE face: the stroke's Y slid and the fill's Y stayed
     put (owner: "also didn't survive the glyph adjustment"). Inspector edits
     go through Undo, so that is where to listen. Debounced through delayCall
     so a held-down arrow key syncs once, not per keystroke. */
  [InitializeOnLoad]
  static class KitKerningWatch {
    /* Waits for QUIET, not for the next tick. delayCall fires immediately,
       which meant the sync landed in the middle of the maker's interaction
       with the table — while a row was half-entered, or on the very click
       that added one. Every further edit pushes the deadline out, so
       typing a pair, tabbing across and correcting a digit all settle into
       one pass once the hands come off. */
    const double QUIET = 1.5;
    static double dueAt;
    static bool armed;
    static KitKerningWatch() { Undo.postprocessModifications += OnEdit; }
    static UndoPropertyModification[] OnEdit(UndoPropertyModification[] mods) {
      if (mods == null) return mods;
      foreach (var mod in mods) {
        var t = mod.currentValue != null ? mod.currentValue.target : null;
        if (t == null) continue;
#if UNITY_2023_2_OR_NEWER
        if (!(t is TMP_FontAsset)) continue;
        var path = AssetDatabase.GetAssetPath(t);
        if (string.IsNullOrEmpty(path) || !path.Replace("\\\\", "/").Contains("/fonts/KitFace Baked")) continue;
        dueAt = EditorApplication.timeSinceStartup + QUIET;
        if (!armed) { armed = true; EditorApplication.update += Tick; }
        break;
#endif
      }
      return mods;
    }
    static void Tick() {
      if (EditorApplication.timeSinceStartup < dueAt) return;
      EditorApplication.update -= Tick;
      armed = false;
      KitImporter.SyncKerningQuiet();
    }
  }
  class KitKerningAutoSync : UnityEditor.AssetModificationProcessor {
    static string[] OnWillSaveAssets(string[] paths) {
      if (paths == null) return paths;
      foreach (var p in paths) {
        if (p != null && p.EndsWith(".asset") && p.Replace("\\\\", "/").Contains("/fonts/KitFace Baked")) {
          // after the save lands, not during it
          EditorApplication.delayCall += KitImporter.SyncKerningQuiet;
          break;
        }
      }
      return paths;
    }
  }
#endif
  class KitTexturePostprocessor : AssetPostprocessor {
    static readonly Dictionary<string, PBManifest> cache = new Dictionary<string, PBManifest>();
    void OnPreprocessTexture() {
      var path = assetPath.Replace("\\\\", "/");
      /* the baked-face atlas is a TEXTURE with exact glyph rects — sprite
         packing, compression or NPOT rounding would all corrupt it */
      if (path.Contains("UIKitMaker/") && path.Contains("/fonts/kitface-baked") && path.EndsWith(".png")) {
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
        /* the manifest's GRANDPARENT is the dropped kit root (it holds
           <slug>/ and Editor/). Canonical is Assets/UIKitMaker — anything
           else named like the macOS/Unity suffix forks ("UIKitMaker 1"),
           a nested drop (Assets/UIKitMaker/UIKitMaker) or a zip-wrapper's
           inner UIKitMaker gets relocated. Deliberately RENAMED user
           copies ("UIKitMaker-backup") are left alone: destroying a
           backup is worse than the compile error it causes. */
        var slugDir = Path.GetDirectoryName(norm);
        if (string.IsNullOrEmpty(slugDir)) continue;
        var dupTop = Path.GetDirectoryName(slugDir);
        if (string.IsNullOrEmpty(dupTop)) continue;
        dupTop = dupTop.Replace("\\\\", "/");
        if (dupTop == "Assets/UIKitMaker") continue; // home already
        if (dupTop == "Assets" || !dupTop.StartsWith("Assets/")) continue; // never operate on roots
        if (!System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(dupTop), "^UIKitMaker( \\\\d+)?$")) continue;
        if (!Directory.Exists(dupTop)) continue; // a sibling manifest already valeted this tree
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
           reload that follows wipes any queued pass. A session flag survives
           the reload and tells the sweep to re-import EVERY kit; receipts
           stay on disk, so orphan history (I3) survives too (review catch:
           deleting locks silently destroyed deferred-orphan tracking). */
        SessionState.SetBool("PBKitValetPending", true);
        AssetDatabase.DeleteAsset(dupTop);
        // a zip-wrapper husk ("candy-arcade-engine-kit/") left holding nothing
        // gets swept too — but never the canonical folder or Assets itself
        var wrapper = Path.GetDirectoryName(dupTop);
        if (!string.IsNullOrEmpty(wrapper)) {
          wrapper = wrapper.Replace("\\\\", "/");
          try {
            if (wrapper != "Assets" && wrapper != "Assets/UIKitMaker" && Directory.Exists(wrapper)
                && Directory.GetFileSystemEntries(wrapper).Length == 0)
              AssetDatabase.DeleteAsset(wrapper);
          } catch (Exception) { }
        }
        valeted = true;
        Debug.Log("UI Kit Maker: that drop landed at '" + dupTop + "' (folders never merge on drop) — " + relocated + " files were moved home into Assets/UIKitMaker and the duplicate was removed. Drop updates anywhere UIKitMaker-shaped; the kit finds its way.");
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
