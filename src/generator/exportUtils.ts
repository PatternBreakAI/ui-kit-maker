import type { GenConfig, GenStateName } from "./model";
import { fontByName, STATE_NAMES } from "./model";
import { renderBevel, glowPadOf } from "./bevel";

// Export utilities — every artifact derives from the same renderer string.

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function downloadSvg(svg: string, name: string) {
  download(name, new Blob([svg], { type: "image/svg+xml" }));
}

/* ── minimal ZIP writer (STORE method, no compression, no dependency) ──
   Enough for asset packs: predictable folder paths, UTF-8 names, correct
   CRC-32 so Figma, Finder and Illustrator all open the archive cleanly. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files: { path: string; data: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  // real export time in DOS format — zeroed fields decode as Nov 30 1979,
  // which reads as a broken download in every file manager (owner report)
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name));
    chunks.push(local);
    offset += local.length;
  }
  const centralBlob = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlob.length), u32(offset), u16(0));
  return new Blob([...chunks, centralBlob, end].map((u) => u.buffer as ArrayBuffer), { type: "application/zip" });
}
export function downloadZip(name: string, files: { path: string; data: string | Uint8Array }[]) {
  download(name, makeZip(files));
}

/** Rasterize an SVG string to transparent PNG bytes at the given scale. */
export function svgToPngBytes(svg: string, scale = 2): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * scale));
      cv.height = Math.max(1, Math.round(img.height * scale));
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(async (b) => {
        if (!b) { reject(new Error("raster failed")); return; }
        resolve({ bytes: new Uint8Array(await b.arrayBuffer()), w: cv.width, h: cv.height });
      }, "image/png");
    };
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
}

/** Rasterize an SVG string to PNG bytes cropped to the art's alpha bounding
 *  box (+margin). Nine-slice sprites must hug their geometry: transparent
 *  canvas padding inside a sliced sprite becomes stretched dead air in every
 *  engine, and borders wide enough to span the pad can exceed the component's
 *  own size — Unity then draws caps of pure padding and no center at all. */
export async function svgToPngBytesTight(svg: string, scale = 2, margin = 4): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let yy = 0; yy < cv.height; yy++) {
    for (let xx = 0; xx < cv.width; xx++) {
      if (px[(yy * cv.width + xx) * 4 + 3] > 8) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
    }
  }
  if (x1 < 0) return full; // nothing opaque — keep the full canvas
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  x1 = Math.min(cv.width - 1, x1 + margin); y1 = Math.min(cv.height - 1, y1 + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d")!.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
  return new Promise((resolve, reject) => {
    out.toBlob(async (b) => {
      if (!b) { reject(new Error("crop raster failed")); return; }
      resolve({ bytes: new Uint8Array(await b.arrayBuffer()), w: cw, h: ch });
    }, "image/png");
  });
}

/** Rasterize an SVG string to a transparent PNG at the given scale. */
export function downloadPng(svg: string, name: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width * scale; cv.height = img.height * scale;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => { if (b) { download(name, b); resolve(); } else reject(new Error("raster failed")); }, "image/png");
    };
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
}

/** Self-contained HTML page: the button in every visible state, rendered by
 *  the exact same engine as the canvas. Opens locally with a double-click. */
/* ── labeled PNG sprite sheet ─────────────────────────────────────
   Every asset rasterized at 2x onto one transparent canvas, name labels
   beneath, kit title on top. The display face is embedded into each SVG
   as a data-URI @font-face so sprite text rasterizes true. */

const FONT_CACHE = new Map<string, string | null>();

/** Trim most of a render's glow reserve so sprites pack tight. */
function cropSheetPad(svg: string, keep = 0.3): string {
  // CSS drop-shadow style filters mis-rasterize in image context (solid
  // blocks) — sheet sprites ship without them
  svg = svg.replace(/ style="filter:[^"]*"/g, "");
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) return svg;
  const pad = Math.max(0, -+vb[1]);
  if (pad < 4) return svg;
  const cut = pad * (1 - keep);
  const nw = +vb[3] - cut * 2, nh = +vb[4] - cut * 2;
  return svg
    .replace(vb[0], `viewBox="${(+vb[1] + cut).toFixed(1)} ${(+vb[2] + cut).toFixed(1)} ${nw.toFixed(1)} ${nh.toFixed(1)}"`)
    .replace(/width="([\d.]+)"/, `width="${nw.toFixed(1)}"`)
    .replace(/height="([\d.]+)"/, `height="${nh.toFixed(1)}"`);
}

/** Resolve a Google face to a base64 woff2 data URI (cached; null on failure). */
/** Fetch with a deadline. An export must never wait on the network
    forever — a stalled request used to leave the button reading
    "Working…" with no way back except a reload. */
function fetchDeadline(url: string, ms = 8000): Promise<Response> {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return fetch(url, { signal: (AbortSignal as { timeout(n: number): AbortSignal }).timeout(ms) });
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

export async function fontDataUri(family: string, cssQuery: string | null): Promise<string | null> {
  if (FONT_CACHE.has(family)) return FONT_CACHE.get(family) ?? null;
  let uri: string | null = null;
  try {
    if (cssQuery) {
      const css = await (await fetchDeadline(`https://fonts.googleapis.com/css2?family=${cssQuery}&display=swap`)).text();
      const m = /url\((https:[^)]+\.woff2)\)/.exec(css);
      if (m) {
        const buf = await (await fetchDeadline(m[1])).arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        uri = `data:font/woff2;base64,${btoa(bin)}`;
      }
    }
  } catch { uri = null; }
  FONT_CACHE.set(family, uri);
  return uri;
}

export async function buildSpriteSheetBytes(
  entries: { name: string; svg: string }[],
  title: string,
  fontFamily: string,
  fontCss: string | null,
): Promise<Uint8Array | null> {
  const fontUri = await fontDataUri(fontFamily, fontCss);
  const faceCss = fontUri ? `<defs><style>@font-face{font-family:'${fontFamily}';src:url(${fontUri}) format('woff2');}</style></defs>` : "";
  const imgs = await Promise.all(entries.map((e) => new Promise<{ name: string; img: HTMLImageElement; w: number; h: number } | null>((resolve) => {
    const cropped = cropSheetPad(e.svg);
    const svg = faceCss ? cropped.replace(/(<svg[^>]*>)/, `$1${faceCss}`) : cropped;
    const w = +(/width="([\d.]+)"/.exec(svg)?.[1] ?? 200);
    const h = +(/height="([\d.]+)"/.exec(svg)?.[1] ?? 100);
    const img = new Image();
    img.onload = () => resolve({ name: e.name, img, w, h });
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  })));
  const ok = imgs.filter((x): x is NonNullable<typeof x> => !!x);
  /* pack rows into a 2560-wide sheet — up to 2x, capped so no sprite
     dominates a row and the sheet stays a sane length */
  const SHEET_W = 2560, PAD = 28, LABEL = 44, HEADER = 96;
  type Placed = { name: string; img: HTMLImageElement; x: number; y: number; w: number; h: number };
  const placed: Placed[] = [];
  let x = PAD, y = HEADER, rowH = 0;
  for (const it of ok) {
    const S = Math.min(2, 430 / it.h, 1400 / it.w);
    const w = Math.round(it.w * S), h = Math.round(it.h * S);
    if (x + w + PAD > SHEET_W && x > PAD) { x = PAD; y += rowH + LABEL + PAD; rowH = 0; }
    placed.push({ name: it.name, img: it.img, x, y, w, h });
    rowH = Math.max(rowH, h);
    x += w + PAD;
  }
  const SHEET_H = y + rowH + LABEL + PAD;
  const cv = document.createElement("canvas");
  cv.width = SHEET_W; cv.height = SHEET_H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8b93a3";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText(title, PAD, 54);
  ctx.font = "500 20px Inter, sans-serif";
  ctx.fillText(`${ok.length} assets · rendered live from the kit · @2x`, PAD, 82);
  ctx.textAlign = "center";
  for (const pl of placed) {
    ctx.drawImage(pl.img, pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = "#8b93a3";
    ctx.font = "600 19px Inter, sans-serif";
    ctx.fillText(pl.name.toUpperCase(), pl.x + pl.w / 2, pl.y + pl.h + 30, pl.w + PAD);
  }
  return await new Promise<Uint8Array | null>((resolve) => cv.toBlob(async (blob) => {
    resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : null);
  }, "image/png"));
}

/** The packed sheet stays available as a VISUAL CATALOG download. */
export async function downloadSpriteSheet(
  entries: { name: string; svg: string }[],
  title: string,
  fontFamily: string,
  fontCss: string | null,
): Promise<void> {
  const bytes = await buildSpriteSheetBytes(entries, title, fontFamily, fontCss);
  if (bytes) download("kit-sprite-sheet.png", new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
}

export function buildHtml(cfg: GenConfig): string {
  const font = fontByName(cfg.type.font);
  const fontLink = font.css
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.css}&display=swap">`
    : "";
  const states = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">]
  );
  const cap: Record<GenStateName, string> = { default: "Default", hover: "Hover", pressed: "Pressed", disabled: "Disabled" };
  const dark = cfg.canvas === "#1C1D22" || cfg.canvas === "#000000";
  const ink = dark ? "rgba(235,238,255,0.6)" : "rgba(28,32,44,0.55)";
  const cards = states.map((s) =>
    `<figure><div class="art">${renderBevel(cfg, s)}</div><figcaption>${cap[s]}</figcaption></figure>`
  ).join("\n");
  const label = (cfg.content.label || "component").replace(/[<>&"]/g, "");

  // live, playable button — CSS swaps the pre-rendered state art
  const hasHover = cfg.visible.hover, hasPressed = cfg.visible.pressed;
  const live = `<div class="live" role="button" tabindex="0" aria-label="${label}">
  <span class="s s-default">${renderBevel(cfg, "default")}</span>
  ${hasHover ? `<span class="s s-hover">${renderBevel(cfg, "hover")}</span>` : ""}
  ${hasPressed ? `<span class="s s-pressed">${renderBevel(cfg, "pressed")}</span>` : ""}
</div>`;
  const liveCss = `
  .live { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .live .s { display: none; }
  .live .s-default { display: block; }
  ${hasHover ? `.live:hover .s-default { display: none; } .live:hover .s-hover { display: block; }` : ""}
  ${hasPressed ? `.live:active .s-default, .live:active .s-hover { display: none; } .live:active .s-pressed { display: block; }` : ""}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label} — UI Kit Maker</title>
${fontLink}
<style>
  * { margin: 0; box-sizing: border-box; }
  body { min-height: 100vh; background: ${cfg.canvas}; font-family: system-ui, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding: 48px 24px; }
  .row { display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-end; justify-content: center; }
  figure { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  figcaption { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${ink}; }
  .art svg, .live svg { display: block; }
  .try { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${ink}; }
  footer { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${ink}; opacity: 0.7; }
${liveCss}
</style>
</head>
<body>
${live}
<div class="try">↑ try me — hover &amp; press</div>
<div class="row">
${cards}
</div>
<footer>Made with UI Kit Maker · PatternBreak</footer>
</body>
</html>`;
}

export function downloadHtml(cfg: GenConfig, name: string) {
  download(name, new Blob([buildHtml(cfg)], { type: "text/html" }));
}

/** Full settings as a portable JSON file — re-importable, and shareable as a
 *  new default. */
export function downloadSettings(cfg: GenConfig, workspace?: Record<string, unknown>) {
  /* the settings file is the COMPLETE document now: the master cfg at the
     top level (so older builds still import it), plus the workspace — piece
     forks, shapes, icon swaps, labels, nudges — under __workspace. Without
     it, a "settings" file silently dropped every focused-piece edit. */
  const doc = workspace ? { ...cfg, __workspace: workspace } : cfg;
  download("ui-generator-settings.json", new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
}

/** Game-engine kit: one sprite sheet PNG @2x (states stacked vertically) plus
 *  a JSON manifest with per-state rects and suggested 9-slice insets — the
 *  shape Unity's Sprite Editor and Unreal's UMG box-draw both ingest. */
/** The licence block is issued by /api/export and travels with the kit —
    it names the account the files belong to, so a leaked bundle is
    traceable. Call sites reach this through guardedExport, never directly. */
export async function downloadGameKit(cfg: GenConfig, licence?: string): Promise<void> {
  const scale = 2;
  const states = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">]
  );
  const loaded = await Promise.all(states.map((s) => new Promise<{ s: GenStateName; img: HTMLImageElement }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ s, img });
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(renderBevel(cfg, s))));
  })));
  const w = Math.max(...loaded.map((l) => l.img.width)) * scale;
  const heights = loaded.map((l) => l.img.height * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = heights.reduce((a, b) => a + b, 0);
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const rects: { name: GenStateName; x: number; y: number; width: number; height: number }[] = [];
  let yy = 0;
  loaded.forEach((l, i) => {
    const sw = l.img.width * scale, sh = heights[i];
    ctx.drawImage(l.img, Math.round((w - sw) / 2), yy, sw, sh);
    rects.push({ name: l.s, x: Math.round((w - sw) / 2), y: yy, width: sw, height: sh });
    yy += sh;
  });
  // conservative 9-slice caps: wall + rim + corner sweep + the glow viewport
  // pad the sprites now carry, at sheet scale
  const cap = Math.round((cfg.bevel.width + cfg.candy.rim.width + 34 + glowPadOf(cfg)) * scale);
  const manifest = {
    generator: "UI Kit Maker (PatternBreak)",
    sheet: `ui-${cfg.presetId}-sheet@${scale}x.png`,
    scale,
    label: cfg.content.label,
    states: rects,
    nineSlice: { left: cap, right: cap, top: cap, bottom: cap,
      note: "Suggested border insets in sheet pixels. Unity: Sprite Editor > Border. Unreal: Brush > Margin (divide by width/height for 0–1 values)." },
    engines: {
      unity: "Import sheet as Sprite (2D and UI), Sprite Mode: Multiple, slice with the state rects, set Border for 9-slice, use on UI Image (Sliced).",
      unreal: "Import sheet as Texture2D, make one Material or use DrawAs: Box in a Widget Brush per state rect, set Margin from nineSlice.",
    },
  };
  await new Promise<void>((resolve, reject) => {
    cv.toBlob((b) => { if (b) { download(manifest.sheet, b); resolve(); } else reject(new Error("raster failed")); }, "image/png");
  });
  download(`ui-${cfg.presetId}-kit.json`, new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
  if (licence) download("LICENCE.txt", new Blob([licence], { type: "text/plain" }));
}
