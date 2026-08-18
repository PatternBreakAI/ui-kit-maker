/* ══════════════════════════════════════════════════════════════════════
   BOARD-vs-SCENE PARITY PROBE — the standing receipt tool (rounds 14–16).
   "It's not just about getting this kit right but getting truth from
   our app to unity." — the owner's principle, made mechanical.

   MULTI-KIT (round 16): every row runs against THREE kit recipes —
   default, a War-Chuds-like camo kit, a Hot-Rod-like flame kit — the
   way the owner tests ("I will probably try it against multiple kits
   to prove that it all really works").

   WHAT IT DOES, per kit
   1. Runs a REAL store-flow export (field board: timer, all three
      gauges, minimap, circuit, primary button, leaderboard, telemetry,
      laptimes, loottag) through the CURRENT source.
   2. LEFT column  = the app's own board render of every placed item
      (calmed: cast shadow / contact / state glow / bloom are
      engine-composed by design, never baked).
   3. RIGHT column = the SCENE as Unity will build it, reconstructed
      from the shipped zip alone: sprites shell-to-shell (the importer's
      math), gauge needles rotated to value around the manifest dial
      center, the HUD arc's lit ring from gauge.seg, live KitTrace
      graphs from manifest > chart, the loot tag's tier dress from
      manifest > loot, every text seat, demo layers.
   4. Diffs each item region → per-item table (lostPct / addedPct /
      Δcolor) + one composite PNG per kit (app | scene | diff heat).
   5. GLOW-STATE ROW (round 15): replicates the SHIPPED StateFx C#'s
      RectTransform math for button-primary's halo in four contexts
      (layout row, scaled scene copy, posed copy, drag-in). Semantics
      are DETECTED from the zip's own PatternBreakStateFx.cs — so the
      probe answers old zips honestly too. Asserts center/size/scale
      per context + alphas that follow the kit's own hover/pressed dials
      (distinct only when the dials themselves differ — a kit with
      matched dials ships identical alphas BY DESIGN). These rows are
      HARD: any FAIL exits nonzero.

   HOW TO RUN
     node scripts/parity-probe.mjs
   Writes composites + a summary to .parity-out/ (override: PARITY_OUT).
   Chromium path defaults to /opt/pw-browsers/chromium (override:
   PW_CHROMIUM). Bundles the probe entry itself via esbuild — no build
   step needed, and this tool is NOT part of npm run build (on-demand
   receipts, not a gate).

   KNOWN HONEST GAPS (sandboxes without font network): both columns draw
   a fallback face and scene words are canvas text (canvas and svg
   disagree on synthetic italics), so the timerdigits row's delta is
   dominated by glyph approximation — read its receipt visually. The
   app column calms shadow/contact/state-glow/bloom: engine-composed by
   design, never baked. Lit-segment/trace glow blur compares as flat
   ink. RIVAL's dots draw brighter than its line in the app, so the
   same-paint dot parser leaves the RIVAL rig dotless (round-16 note).
   ══════════════════════════════════════════════════════════════════════ */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.PARITY_OUT ?? join(REPO, ".parity-out");
mkdirSync(OUT, { recursive: true });
const CHROMIUM = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

/* ── 0 · bundle the probe entry from the current source ─────────────── */
const entry = join(OUT, "parity-entry.ts");
writeFileSync(entry, `
import { renderKit } from "@/generator/bevel";
import { downloadEngineExport, collectExportBoards } from "@/generator/engineExport";
import { useGen, hydrate } from "@/generator/store";
import { defaultConfig, applyKitDesign, applyKitTextFill, effKitSize } from "@/generator/model";
(window as unknown as Record<string, unknown>).__probe = { renderKit, downloadEngineExport, collectExportBoards, useGen, hydrate, defaultConfig, applyKitDesign, applyKitTextFill, effKitSize };
`);
const bundle = join(OUT, "parity-bundle.js");
const eb = spawnSync("npx", ["--prefix", REPO, "esbuild", entry, "--bundle", "--format=iife", `--outfile=${bundle}`,
  `--alias:@=${join(REPO, "src")}`, '--define:__BUILD_STAMP__="parity-probe"', "--loader:.woff2=dataurl", "--loader:.png=dataurl"],
  { cwd: REPO, encoding: "utf8" });
if (eb.status !== 0) { console.error(eb.stderr || eb.stdout); process.exit(1); }

const { chromium } = await import(join(REPO, "node_modules/playwright-core/index.mjs"));
const server = createServer((req, res) => {
  if (req.url === "/b.js") { res.setHeader("content-type", "text/javascript"); res.end(readFileSync(bundle)); }
  else { res.setHeader("content-type", "text/html"); res.end("<!doctype html><body>x</body>"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--disable-dev-shm-usage", "--js-flags=--max-old-space-size=4096"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { const t = m.text(); if (!t.startsWith("[prog]")) console.log("[c]", t.slice(0, 200)); });
await page.addInitScript(() => {
  // the sandbox blocks outbound HTTPS but connections HANG — reject fast
  const of = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const s = String(typeof u === "string" ? u : (u && u.url) || u);
    if (s.startsWith("http://127.0.0.1") || s.startsWith("/") || s.startsWith("blob:") || s.startsWith("data:")) return of(u, o);
    return Promise.reject(new TypeError("blocked by probe"));
  };
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__zipBlob = blob; return orig(blob); };
  HTMLAnchorElement.prototype.click = function () {};
});
await page.goto(`http://127.0.0.1:${port}/`);
await page.addScriptTag({ url: `http://127.0.0.1:${port}/b.js` });

const runKit = async (kitName, fixtureJson) => await page.evaluate(async ({ KIT, FIXTURE }) => {
  const P = window.__probe;

  /* ── 1 · the kit recipe + field board through the real store flow ── */
  let cfg = JSON.parse(JSON.stringify(P.defaultConfig()));
  if (KIT === "warchuds-real") {
    /* the owner's REAL kit (round 17): the exact settings export, through
       the app's own import door — migration, healing and workspace forks
       all apply exactly as a user import (settingsImport.ts contract) */
    const parsed = JSON.parse(FIXTURE);
    const ws = parsed.__workspace;
    delete parsed.__workspace;
    P.useGen.getState().loadKitPayload({ cfg: P.hydrate(parsed), ...(ws ?? {}) }, { viewer: false, phase: "master" });
    cfg = JSON.parse(JSON.stringify(P.useGen.getState().cfg));
  } else if (KIT === "warchuds") {
    cfg.shape = "notch";
    cfg.type.font = "Russo One"; cfg.type.italic = true;
    cfg.type.fillMode = "solid"; cfg.type.fill = "#EAF4D8"; cfg.type.fillOpacity = 100;
    cfg.type.outline = { on: true, color: "#1B2A12", color2: null, width: 6 };
    cfg.type.shadow.on = false; cfg.type.glow.on = false; cfg.type.emboss.on = false;
    cfg.type.glints = { on: false, opacity: 70 };
    cfg.effects = { ...cfg.effects, Bevel: "#5C6E3C", Glow: "#B9E36B", Highlight: "#F1F7E2", Shadow: "#22301A", "Inner Fill": "#77894C" };
    cfg.candy.pattern = { ...cfg.candy.pattern, type: "halftone", scale: 80, angle: 0, opacity: 40, color: "#3A4A26" };
  } else if (KIT === "hotrod") {
    cfg.shape = "polybar";
    cfg.type.font = "Russo One"; cfg.type.italic = true;
    cfg.type.fillMode = "gradient"; cfg.type.fill = "#FFF7E8"; cfg.type.fill2 = "#F0B24A"; cfg.type.fillOpacity = 100;
    cfg.type.outline = { on: true, color: "#2A1006", color2: null, width: 6 };
    cfg.type.shadow.on = false; cfg.type.glow.on = false; cfg.type.emboss.on = false;
    cfg.type.glints = { on: false, opacity: 70 };
    cfg.effects = { ...cfg.effects, Bevel: "#C33217", Glow: "#FFC24B", Highlight: "#FFF2D9", Shadow: "#511107", "Inner Fill": "#E4552B" };
  } else {
    cfg.type.fillMode = "solid"; cfg.type.fill = "#FFF3DC"; cfg.type.fillOpacity = 100;
    cfg.type.outline = { on: true, color: "#2A1006", color2: null, width: 6 };
    cfg.type.shadow.on = false; cfg.type.glow.on = false; cfg.type.emboss.on = false;
    cfg.type.glints = { on: false, opacity: 70 };
  }
  if (KIT !== "warchuds-real") P.useGen.setState({ cfg });
  let st = P.useGen.getState();
  st.addBoard();
  st = P.useGen.getState();
  st.addBoardItems([
    { kitId: "timerdigits", x: 120, y: 80 },
    { kitId: "speedo", x: 420, y: 80 },
    { kitId: "speedo2", x: 860, y: 80 },
    { kitId: "tacho", x: 1300, y: 80 },
    { kitId: "minimap", x: 100, y: 540 },
    { kitId: "circuit", x: 420, y: 560 },
    { kitId: "primary", x: 860, y: 620 },
    { kitId: "leaderboard", x: 1340, y: 500 },
    /* the fire button is a GATED prop — board placement is what ships its
       dome rows + sprites, which the fire-press glow row reads (round 18) */
    { kitId: "firebutton", x: 1680, y: 860 },
    { kitId: "telemetry", x: 100, y: 860 },
    { kitId: "laptimes", x: 560, y: 860 },
    { kitId: "loottag", x: 1000, y: 900 },
  ]);
  st = P.useGen.getState();
  const exBoards = await P.collectExportBoards(st);
  await P.downloadEngineExport({
    cfg: st.cfg, kitDesigns: st.kitDesigns, kitTextFill: st.kitTextFill, kitShapes: st.kitShapes,
    kitSizes: st.kitSizes, kitName: "Parity " + KIT, slug: "parity-" + KIT, kitVersion: 16, scope: "full", boards: exBoards,
    kitLabels: st.kitLabels, kitSubs: st.kitSubs, kitVals: st.kitVals, kitSlotVals: st.kitSlotVals,
  }, undefined, undefined, () => {}, () => {});

  /* ── 2 · read the zip (STORE entries) ────────────────────────────── */
  const buf = new Uint8Array(await window.__zipBlob.arrayBuffer());
  const files = new Map();
  {
    const dv = new DataView(buf.buffer, buf.byteOffset);
    let off = 0;
    while (off + 30 <= buf.length) {
      if (dv.getUint32(off, true) !== 0x04034b50) break;
      const sz = dv.getUint32(off + 18, true);
      const nl = dv.getUint16(off + 26, true), xl = dv.getUint16(off + 28, true);
      const name = new TextDecoder().decode(buf.subarray(off + 30, off + 30 + nl));
      const ds = off + 30 + nl + xl;
      files.set(name.replace(/^UIKitMaker\/[^/]+\//, ""), buf.subarray(ds, ds + sz));
      off = ds + sz;
    }
  }
  const m = JSON.parse(new TextDecoder().decode(files.get("kit-manifest.json")));
  const ps = m.pngScale > 0 ? m.pngScale : 2;
  const board = m.boards[m.boards.length - 1];

  const spriteCache = new Map();
  const sprite = async (rel) => {
    if (spriteCache.has(rel)) return spriteCache.get(rel);
    const b = files.get(rel);
    if (!b) { spriteCache.set(rel, null); return null; }
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode " + rel));
      im.src = URL.createObjectURL(new Blob([b], { type: "image/png" }));
    });
    spriteCache.set(rel, img);
    return img;
  };
  const row = (fam, part) => m.assets.find((a) => a && a.component === fam && a.part === part) ?? null;
  const gaugeRow = (fam) => { const r = row(fam, "face"); return r && r.gauge ? r.gauge : null; };
  const hex = (h, fb) => h || fb;
  const lerpHex = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = (sh) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * t));
    return `rgba(${c(16)},${c(8)},${c(0)},0.95)`;
  };
  const mixWhite = (h, t) => {
    const pa = parseInt(h.slice(1), 16);
    const c = (sh) => Math.round(((pa >> sh) & 255) + (255 - ((pa >> sh) & 255)) * t);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  };

  /* ── 3 · per-item render: app truth + scene reconstruction ───────── */
  const CELL = 420;
  /* round 18: the ghost stick is a prefab, not a board piece — it gets
     its own bench row (owner: "make sure to include Joystick-ghost in
     the prefabs"): app overlay render vs the zip's ghost sprites,
     composed exactly the way JoystickGhostPrefab composes them. A LOCAL
     copy — pushing into the store's own board would ride into the NEXT
     kit's export as a bogus board item. */
  /* the firebutton board item exists to SHIP the gated dome art — its
     press parity reads from the manifest stamps in the glow section, not
     from a board-scene pixel row (the scene places a composed rig) */
  const items = [...board.items.filter((b) => b.component !== "firebutton"), { component: "joystickghost", x: 0, y: 0, w: 376, h: 376 }];
  const results = [];
  const rowCanvases = [];

  /* the row verdict: alpha-masked pixel diff of the two CELL canvases */
  const diffPush = (it, A, S) => {
    const da = A.getContext("2d").getImageData(0, 0, CELL, CELL).data;
    const ds = S.getContext("2d").getImageData(0, 0, CELL, CELL).data;
    const D = document.createElement("canvas"); D.width = CELL; D.height = CELL;
    const dxq = D.getContext("2d");
    const di = dxq.createImageData(CELL, CELL);
    let lost = 0, added = 0, inkA = 0, both = 0, dsum = 0;
    for (let i = 0; i < da.length; i += 4) {
      const aA = da[i + 3] > 28, aS = ds[i + 3] > 28;
      if (aA) inkA++;
      if (aA && !aS) { lost++; di.data[i] = 255; di.data[i + 1] = 80; di.data[i + 2] = 80; di.data[i + 3] = 220; }
      else if (!aA && aS) { added++; di.data[i] = 90; di.data[i + 1] = 200; di.data[i + 2] = 255; di.data[i + 3] = 220; }
      else if (aA && aS) {
        both++;
        const d = (Math.abs(da[i] - ds[i]) + Math.abs(da[i + 1] - ds[i + 1]) + Math.abs(da[i + 2] - ds[i + 2])) / 3;
        dsum += d;
        di.data[i] = 40 + Math.min(215, d * 2); di.data[i + 1] = 40; di.data[i + 2] = 40; di.data[i + 3] = d > 24 ? 200 : 60;
      }
    }
    dxq.putImageData(di, 0, 0);
    results.push({
      item: it.component,
      lostPct: Math.round((lost / Math.max(1, inkA)) * 1000) / 10,
      addedPct: Math.round((added / Math.max(1, inkA)) * 1000) / 10,
      meanColorDelta: both ? Math.round((dsum / both) * 10) / 10 : 0,
    });
    rowCanvases.push([A.toDataURL(), S.toDataURL(), D.toDataURL()]);
  };

  const svgToCanvas = (svg, scale) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.ceil(img.width * scale); cv.height = Math.ceil(img.height * scale);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      res(cv);
    };
    img.onerror = () => rej(new Error("svg raster"));
    img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  });

  const KIT_TO_ID = { "button-primary": "primary", "tab-back": "tabback", "header-banner": "header", "list-row": "datarow", "item-slot": "slot" };

  for (const it of items) {
    if (it.component === "joystickghost") {
      /* app column: the exact catalog render ("Joystick · Ghost") through
         the fork pipeline at the same kit size the export used; scene
         column: ghost-base + ghost-thumb from the zip, thumb seated on
         the ring shell's center — JoystickGhostPrefab's own recipe. */
      const kdJ = st.kitDesigns ? st.kitDesigns.joystick : null;
      const cfgJ = JSON.parse(JSON.stringify(P.applyKitTextFill(P.applyKitDesign(cfg, kdJ), st.kitTextFill ? st.kitTextFill.joystick : null)));
      cfgJ.shadow.opacity = 0; cfgJ.candy.contact.opacity = 0; cfgJ.candy.bloom.opacity = 0;
      for (const s of Object.values(cfgJ.states)) s.glow = 0;
      const sizeJ = P.effKitSize(st.kitSizes ? st.kitSizes.joystick : undefined);
      const svgJ = P.renderKit(cfgJ, "joystick", sizeJ, "default", undefined, st.kitShapes ? st.kitShapes.joystick : undefined,
        { overlay: "ghost", icon: null, label: "", slots: st.kitSlotVals ? st.kitSlotVals.joystick : undefined });
      const appJ = await svgToCanvas(svgJ, 1);
      const baseJ = await sprite("assets/joystick/joystick-ghost-base.png");
      const thumbJ = await sprite("assets/joystick/joystick-ghost-thumb.png");
      const rowJ = (m.assets ?? []).find((a) => a && a.file === "assets/joystick/joystick-ghost-base.png");
      const A = document.createElement("canvas"); A.width = CELL; A.height = CELL;
      const S = document.createElement("canvas"); S.width = CELL; S.height = CELL;
      if (baseJ && thumbJ && rowJ && rowJ.shell) {
        const kS = (CELL * 0.9) / Math.max(baseJ.width, baseJ.height);
        const ox = (CELL - baseJ.width * kS) / 2, oy = (CELL - baseJ.height * kS) / 2;
        const sxx = S.getContext("2d");
        sxx.drawImage(baseJ, ox, oy, baseJ.width * kS, baseJ.height * kS);
        const cxJ = rowJ.shell.x + rowJ.shell.w / 2, cyJ = rowJ.shell.y + rowJ.shell.h / 2;
        sxx.drawImage(thumbJ, ox + (cxJ - thumbJ.width / 2) * kS, oy + (cyJ - thumbJ.height / 2) * kS, thumbJ.width * kS, thumbJ.height * kS);
        const kA = kS * (baseJ.width / appJ.width); // pngScale cancels out
        A.getContext("2d").drawImage(appJ, (CELL - appJ.width * kA) / 2, (CELL - appJ.height * kA) / 2, appJ.width * kA, appJ.height * kA);
      }
      diffPush(it, A, S);
      continue;
    }
    const famId = KIT_TO_ID[it.component] ?? it.component;
    const value = it.value == null ? undefined : it.value;
    const cellK = Math.min((CELL * 0.9) / it.w, (CELL * 0.9) / it.h, 1.2);

    /* the app column must ride the SAME per-piece fork pipeline the app
       (and the export) use — applyKitDesign + applyKitTextFill + the
       kitShapes override. The recipe kits carry no forks (no-op), but a
       real owner kit does: War Chuds forks the minimap to "pill" (round
       housing) and re-dresses the loot tag; rendering the root cfg here
       diffed the probe's own blindness, not the export. Calm AFTER the
       fork — a fork's states replace the base states whole. */
    const kdFork = st.kitDesigns ? st.kitDesigns[famId] : null;
    const shapeOv = st.kitShapes ? st.kitShapes[famId] : undefined;
    const cfgCalm = JSON.parse(JSON.stringify(P.applyKitTextFill(P.applyKitDesign(cfg, kdFork), st.kitTextFill ? st.kitTextFill[famId] : null)));
    cfgCalm.shadow.opacity = 0;
    cfgCalm.candy.contact.opacity = 0;
    cfgCalm.candy.bloom.opacity = 0;
    for (const s of Object.values(cfgCalm.states)) s.glow = 0;
    // icon: the BOARD renders default icons (the loot tag's gem) — only
    // pieces the board itself strips pass icon:null
    const appSvg = P.renderKit(cfgCalm, famId, "l", "default", value, shapeOv ?? undefined, { ...(it.component === "loottag" ? {} : { icon: null }), label: it.label ?? undefined });
    const shm = /data-shell0?="([-\d. ]+)"/.exec(appSvg);
    const vbm = /viewBox="(-?[\d.]+) (-?[\d.]+)/.exec(appSvg);
    const shell = shm ? shm[1].split(" ").map(Number) : null;
    const appFull = await svgToCanvas(appSvg, 1);
    const A = document.createElement("canvas"); A.width = CELL; A.height = CELL;
    const ax = A.getContext("2d");
    let kApp = cellK;
    if (shell) {
      kApp = (it.w * cellK) / shell[2];
      const scx = (shell[0] - (vbm ? +vbm[1] : 0)) + shell[2] / 2, scy = (shell[1] - (vbm ? +vbm[2] : 0)) + shell[3] / 2;
      ax.drawImage(appFull, CELL / 2 - scx * kApp, CELL / 2 - scy * kApp, appFull.width * kApp, appFull.height * kApp);
    } else {
      kApp = Math.min((CELL * 0.9) / appFull.width, (CELL * 0.9) / appFull.height, 1.2);
      ax.drawImage(appFull, (CELL - appFull.width * kApp) / 2, (CELL - appFull.height * kApp) / 2, appFull.width * kApp, appFull.height * kApp);
    }

    const S = document.createElement("canvas"); S.width = CELL; S.height = CELL;
    const sx = S.getContext("2d");
    const drawSpriteShellCentered = async (rel, shl) => {
      const img = await sprite(rel);
      if (!img || !shl) return null;
      const scale = (it.w * cellK) / shl.w;
      const cx0 = CELL / 2 - (shl.x + shl.w / 2) * scale;
      const cy0 = CELL / 2 - (shl.y + shl.h / 2) * scale;
      sx.drawImage(img, cx0, cy0, img.width * scale, img.height * scale);
      return { scale, ox: cx0, oy: cy0 };
    };
    const text = (word, xF, yF, fsF, map, o = {}) => {
      const x = map.ox + xF * map.scale, y = map.oy + yF * map.scale;
      const fs = fsF * map.scale;
      sx.save();
      sx.textAlign = o.anchor === "start" ? "left" : o.anchor === "end" ? "right" : "center";
      sx.textBaseline = "middle";
      sx.font = `${o.italic ? "italic " : ""}${o.weight ?? 800} ${fs}px ${o.font ?? "sans-serif"}`;
      if (o.spacing) sx.letterSpacing = `${(o.spacing * fs / 100).toFixed(1)}px`;
      if (o.strokeW) {
        sx.lineJoin = "round";
        sx.lineWidth = o.strokeW * (fs / (52 * map.scale)) * map.scale;
        sx.strokeStyle = o.stroke ?? "#000";
        sx.strokeText(word, x, y);
      }
      sx.fillStyle = o.fill ?? "#FFF";
      sx.globalAlpha = o.alpha ?? 1;
      sx.fillText(word, x, y);
      sx.restore();
    };
    /* every live seat, generically — the panels' words */
    const drawSeats = (assetRow, map, img0) => {
      for (const seat of assetRow?.textSeats ?? []) {
        if (!seat || !seat.text) continue;
        const word = seat.text.replace(/<[^>]+>/g, "");
        text(word, seat.fx * img0.width, seat.fy * img0.height, seat.ffs * img0.height, map, {
          weight: seat.weight || 700, italic: !!seat.italic,
          fill: seat.fillMode === "solid" && seat.fill ? seat.fill : "#FFFFFF",
          alpha: seat.fillOpacity > 0 ? Math.min(1, seat.fillOpacity / 100) : 1,
          strokeW: seat.strokeEmPct > 0.5 ? seat.strokeEmPct * 0.52 * ps : 0,
          stroke: seat.stroke ?? "rgba(8,12,22,0.6)",
          spacing: seat.spacingEmPct ?? 0,
          anchor: seat.anchor ?? "middle",
          font: seat.kit ? undefined : "Inter, sans-serif",
        });
      }
    };
    /* the live KitTrace graphs — from manifest > chart */
    const drawTraces = (assetRow, map) => {
      const ch = assetRow?.chart;
      if (!ch || !(ch.traces ?? []).length) return;
      const zx = (fx) => map.ox + (ch.x0 + (ch.x1 - ch.x0) * fx) * map.scale;
      const zy = (v) => map.oy + (ch.y1 - (ch.y1 - ch.y0) * Math.max(0, Math.min(1, v))) * map.scale;
      for (const t of ch.traces) {
        const n = t.values.length;
        if (n < 2) continue;
        sx.save();
        sx.globalAlpha = (t.alpha || 1) * (t.opacity || 1);
        sx.strokeStyle = t.color; sx.fillStyle = t.color;
        sx.lineWidth = t.w * map.scale / ps * ps; // file px → cell px
        sx.lineJoin = "round"; sx.lineCap = "round";
        if (t.fillOpacity > 0) {
          sx.save();
          sx.globalAlpha = (t.alpha || 1) * t.fillOpacity;
          sx.beginPath();
          sx.moveTo(zx(0), zy(0));
          t.values.forEach((v, i) => sx.lineTo(zx(i / (n - 1)), zy(v)));
          sx.lineTo(zx(1), zy(0));
          sx.closePath(); sx.fill();
          sx.restore();
        }
        if (t.dash) sx.setLineDash([t.w * 1.25, t.w * 1.25]);
        sx.beginPath();
        t.values.forEach((v, i) => (i ? sx.lineTo(zx(i / (n - 1)), zy(v)) : sx.moveTo(zx(0), zy(v))));
        sx.stroke();
        if (t.dots) {
          sx.setLineDash([]);
          t.values.forEach((v, i) => { sx.beginPath(); sx.arc(zx(i / (n - 1)), zy(v), t.w * map.scale * 0.7, 0, Math.PI * 2); sx.fill(); });
        }
        sx.restore();
      }
    };

    if (it.posed) {
      const img = await sprite(it.posed);
      const pk = cellK / ps;
      if (img) sx.drawImage(img, (CELL - img.width * pk) / 2, (CELL - img.height * pk) / 2, img.width * pk, img.height * pk);
    } else if (["speedo", "speedo2", "tacho"].includes(it.component)) {
      const fr = row(it.component, "face");
      const g = gaugeRow(it.component);
      const map = await drawSpriteShellCentered(`assets/${it.component}/${it.component}-face.png`, fr?.shell);
      if (map && g) {
        if (g.seg && g.seg.n > 0 && g.dialX) {
          const segImg = await sprite(`assets/${it.component}/${it.component}-segment.png`);
          if (segImg) {
            const n = Math.round(g.seg.n), rMid = (g.seg.rI + g.seg.rO) / 2;
            for (let i = 0; i < n; i++) {
              if (!((i + 0.5) / n <= (value ?? 0))) continue;
              const a = (g.seg.a0 + ((i + 0.5) / n) * g.seg.sweep) * Math.PI / 180;
              const cxS = map.ox + (g.dialX + Math.cos(a) * rMid) * map.scale;
              const cyS = map.oy + (g.dialY + Math.sin(a) * rMid) * map.scale;
              const tint = document.createElement("canvas");
              tint.width = segImg.width; tint.height = segImg.height;
              const tx = tint.getContext("2d");
              tx.drawImage(segImg, 0, 0);
              tx.globalCompositeOperation = "source-in";
              tx.fillStyle = lerpHex(hex(m.palette?.bevel, "#0E9CC9"), hex(m.palette?.glow, "#8FF0FF"), i / n);
              tx.fillRect(0, 0, tint.width, tint.height);
              sx.save();
              sx.translate(cxS, cyS);
              sx.rotate(a + Math.PI / 2);
              sx.drawImage(tint, -segImg.width * map.scale / 2, -segImg.height * map.scale / 2, segImg.width * map.scale, segImg.height * map.scale);
              sx.restore();
            }
          }
        }
        const nImg = await sprite(`assets/${it.component}/${it.component}-needle.png`);
        if (nImg && g.dialX) {
          const ncx = map.ox + g.dialX * map.scale, ncy = map.oy + g.dialY * map.scale;
          sx.save();
          sx.translate(ncx, ncy);
          sx.rotate((value ?? 0) * 270 * Math.PI / 180);
          sx.drawImage(nImg, -nImg.width * map.scale / 2, -nImg.height * map.scale / 2, nImg.width * map.scale, nImg.height * map.scale);
          sx.restore();
        }
        const scale174 = it.component === "tacho" ? 9 : 174;
        const word = it.component === "tacho" ? ((value ?? 0) * scale174).toFixed(1) : String(Math.round((value ?? 0) * scale174));
        const ink = g.ink ?? {};
        text(word, g.x, g.y, g.fs, map, {
          weight: Math.max(700, ink.weight ?? 700), italic: !!ink.italic, fill: ink.fill ?? "#FFF",
          strokeW: ink.outline ? ink.outline.width * ps : 0, stroke: ink.outline ? ink.outline.color : null,
          spacing: ink.spacingEmPct ?? 0,
        });
        text(it.component === "tacho" ? "RPM ×1000" : "MPH", g.x, g.unitY, g.unitFs, map, { weight: 800, fill: g.unitInk ?? "#FFF", alpha: 0.75, spacing: 24, font: "Inter, sans-serif" });
      }
    } else if (it.component === "timerdigits") {
      const t = m.timer;
      if (t) {
        const fsCell = t.fs * (t.shellH > 4 ? it.h / t.shellH : 1) * cellK;
        sx.save();
        sx.textAlign = "center"; sx.textBaseline = "middle";
        sx.lineJoin = "round";
        const ty = m.typography?.style ?? {};
        sx.font = `${ty.italic ? "italic " : ""}${ty.weight ?? 800} ${fsCell}px sans-serif`;
        if (ty.outline) { sx.lineWidth = ty.outline.width * (fsCell / 52); sx.strokeStyle = ty.outline.color; sx.strokeText(t.word, CELL / 2, CELL / 2); }
        sx.fillStyle = ty.fill ?? "#FFF";
        sx.fillText(t.word, CELL / 2, CELL / 2);
        sx.restore();
      }
    } else if (it.component === "minimap") {
      const mr = row("minimap", "minimap");
      const map = await drawSpriteShellCentered("assets/extras/extras-minimap.png", mr?.shell);
      if (map) {
        const mapImg = await sprite("assets/extras/extras-minimap-map.png");
        if (mapImg && mr?.shell) {
          const ccx = map.ox + (mr.shell.x + mr.shell.w / 2) * map.scale;
          const ccy = map.oy + (mr.shell.y + mr.shell.h / 2) * map.scale;
          sx.drawImage(mapImg, ccx - mapImg.width * map.scale / 2, ccy - mapImg.height * map.scale / 2, mapImg.width * map.scale, mapImg.height * map.scale);
          const wellR = Math.min(mr.shell.w, mr.shell.h) / 2 * 0.38 * map.scale;
          const tintC = hex(m.palette?.glow, "#8FF0FF");
          for (const [bx, by] of [[-wellR * 0.35, -wellR * 0.25], [wellR * 0.3, wellR * 0.4]]) {
            sx.beginPath();
            sx.arc(ccx + bx, ccy + by, 4.5 * cellK, 0, Math.PI * 2);
            sx.fillStyle = tintC; sx.fill();
          }
        }
        const img0 = spriteCache.get("assets/extras/extras-minimap.png");
        if (img0) drawSeats(mr, map, img0);
      }
    } else if (it.component === "circuit") {
      const cr = row("circuit", "track");
      const img = await sprite("assets/circuit/circuit-track.png");
      if (img) {
        const scale = Math.min((it.w * cellK) / img.width, (it.h * cellK) / img.height);
        const map = { ox: CELL / 2 - img.width * scale / 2, oy: CELL / 2 - img.height * scale / 2, scale };
        sx.drawImage(img, map.ox, map.oy, img.width * scale, img.height * scale);
        drawSeats(cr, map, img);
      }
    } else if (["leaderboard", "telemetry", "laptimes", "loottag"].includes(it.component)) {
      const br = row(it.component, "base");
      const map = await drawSpriteShellCentered(`assets/${it.component}/${it.component}-base.9.png`, br?.shell);
      const img0 = spriteCache.get(`assets/${it.component}/${it.component}-base.9.png`);
      if (map && img0) {
        drawTraces(br, map);
        /* the loot tag's tier dress — the importer's default RARE pose,
           re-tinted per the item's staged value like the scene builder */
        if (it.component === "loottag" && br?.loot && br.loot.sw > 0.5) {
          const tiers = m.rarity?.tiers ?? [];
          const ti = it.value > 0 ? Math.min(tiers.length - 1, Math.max(0, Math.round(it.value * (tiers.length - 1)))) : 2;
          const tierC = tiers[ti]?.color ?? "#3b82f6";
          const l = br.loot;
          const stripeImg = await sprite("assets/loottag/loottag-stripe.png");
          if (stripeImg) {
            const tint = document.createElement("canvas");
            tint.width = stripeImg.width; tint.height = stripeImg.height;
            const tx2 = tint.getContext("2d");
            tx2.drawImage(stripeImg, 0, 0);
            tx2.globalCompositeOperation = "source-in";
            tx2.fillStyle = tierC;
            tx2.fillRect(0, 0, tint.width, tint.height);
            sx.drawImage(tint, map.ox + l.sx * map.scale, map.oy + l.sy * map.scale, l.sw * map.scale, l.sh * map.scale);
          }
          const gemImg = await sprite("assets/icons/gem.png");
          if (gemImg) {
            const tint = document.createElement("canvas");
            tint.width = gemImg.width; tint.height = gemImg.height;
            const tx2 = tint.getContext("2d");
            tx2.drawImage(gemImg, 0, 0);
            tx2.globalCompositeOperation = "source-in";
            tx2.fillStyle = mixWhite(tierC, 0.15);
            tx2.fillRect(0, 0, tint.width, tint.height);
            const gs = l.gs * map.scale;
            sx.drawImage(tint, map.ox + l.gx * map.scale - gs / 2, map.oy + l.gy * map.scale - gs / 2, gs, gs);
          }
        }
        drawSeats(br, map, img0);
      }
    } else {
      const br = row(it.component, "base");
      const map = await drawSpriteShellCentered(`assets/${it.component}/${it.component}-base.9.png`, br?.shell)
        ?? await drawSpriteShellCentered(`assets/${it.component}/${it.component}-base.png`, br?.shell);
      const spRow = row(it.component, "specular");
      if (map && spRow) {
        const spImg = await sprite(`assets/${it.component}/${it.component}-specular.png`);
        if (spImg) {
          const shl = spRow.shell ?? br?.shell;
          if (shl) {
            const cx0 = map.ox + (shl.x + shl.w / 2) * map.scale;
            const cy0 = map.oy + (shl.y + shl.h / 2) * map.scale;
            sx.drawImage(spImg, cx0 - spImg.width * map.scale / 2, cy0 - spImg.height * map.scale / 2, spImg.width * map.scale, spImg.height * map.scale);
          }
        }
      }
      if (map && br) {
        const word = it.label ?? br.labelText ?? "";
        if (word && br.labelFs > 1) {
          const ty = m.typography?.style ?? {};
          const lx = (br.shell.x + br.shell.w / 2) + (br.labelDx ?? 0) * ps;
          const ly = (br.shell.y + br.shell.h / 2) + (br.labelDy ?? 0) * ps;
          text(word, lx, ly, br.labelFs * ps, map, {
            weight: ty.weight ?? 800, italic: !!ty.italic, fill: ty.fill ?? "#FFF",
            strokeW: ty.outline ? ty.outline.width * ps : 0, stroke: ty.outline ? ty.outline.color : null,
            spacing: ty.spacingEmPct ?? 0,
          });
        }
      }
    }

    diffPush(it, A, S);
  }

  /* ── 4 · GLOW-STATE GEOMETRY (round 15) — from the shipped C# ────── */
  const glow = { rows: [], mode: "?" };
  {
    const fxCs = new TextDecoder().decode(files.get("Runtime/PatternBreakStateFx.cs") ?? files.get("PatternBreakStateFx.cs") ?? new Uint8Array());
    // stretch mode markers: round 15 wrote a zero offset; round 17 writes
    // the baked-sink slide (zero at rest) — both are the stretch contract
    const stretch = /glowRt\.anchorMax = Vector2\.one/.test(fxCs)
      && (/glowRt\.anchoredPosition = Vector2\.zero/.test(fxCs) || /glowRt\.anchoredPosition = slide/.test(fxCs));
    const legacyCopy = /var tgt = artRt != null \? artRt : rt;/.test(fxCs);
    glow.mode = stretch ? "stretch (round 15)" : legacyCopy ? "LEGACY host-copy (pre-round-15)" : "unknown";
    const gImg = await sprite("assets/button-primary/button-primary-glow.png");
    const bImg = await sprite("assets/button-primary/button-primary-base.9.png");
    const pad = gImg && bImg ? { x: (gImg.width - bImg.width) / 2 / ps, y: (gImg.height - bImg.height) / 2 / ps } : { x: 30, y: 30 };
    let hoverG = 0, pressG = 0;
    for (const f of m.stateFx ?? []) if (f && f.family === "button-primary") {
      if (f.state === "hover") hoverG = f.glow;
      if (f.state === "pressed") pressG = f.glow;
    }
    const aHover = Math.round(Math.min(1, hoverG / 100) * 0.85 * 100) / 100;
    const aPress = Math.round(Math.min(1, pressG / 100) * 0.85 * 100) / 100;
    /* app-truth dials — the same override rule applyKitDesign uses (a
       piece fork's states REPLACE the base states whole, never merge).
       The parity claim is "the zip follows the app's dials", not "the
       dials differ": a kit whose hover and pressed dials genuinely match
       (the owner's real War Chuds: 100/100) ships identical alphas BY
       DESIGN, and calling that a failure would punish the kit for its
       own recipe. Distinctness is only asserted when the dials differ. */
    const appStates = (st.kitDesigns && st.kitDesigns.primary && st.kitDesigns.primary.states) || st.cfg.states;
    const dialHover = Math.round(appStates.hover.glow), dialPress = Math.round(appStates.pressed.glow);
    const followsDials = Math.abs(hoverG - dialHover) <= 0.5 && Math.abs(pressG - dialPress) <= 0.5;
    const dialsDiffer = Math.abs(dialHover - dialPress) > 0.5;
    const V = (x, y) => ({ x, y });
    const resolve = (node) => {
      if (!node.parent) return { xMin: 0, yMin: 0, w: node.sizeDelta.x, h: node.sizeDelta.y, sx: 1, sy: 1 };
      const p = resolve(node.parent);
      const w = (node.anchorMax.x - node.anchorMin.x) * p.w / p.sx + node.sizeDelta.x;
      const h = (node.anchorMax.y - node.anchorMin.y) * p.h / p.sy + node.sizeDelta.y;
      const pivotX = (node.anchorMin.x + (node.anchorMax.x - node.anchorMin.x) * node.pivot.x) * (p.w / p.sx) + node.anchoredPosition.x;
      const pivotY = (node.anchorMin.y + (node.anchorMax.y - node.anchorMin.y) * node.pivot.y) * (p.h / p.sy) + node.anchoredPosition.y;
      const sx2 = p.sx * node.localScale.x, sy2 = p.sy * node.localScale.y;
      const wpx = p.xMin + pivotX * p.sx, wpy = p.yMin + pivotY * p.sy;
      return { xMin: wpx - node.pivot.x * w * sx2, yMin: wpy - node.pivot.y * h * sy2, w: w * sx2, h: h * sy2, sx: sx2, sy: sy2 };
    };
    const center = (r) => V(r.xMin + r.w / 2, r.yMin + r.h / 2);
    const makeHalo = (host, art) => {
      if (stretch) {
        if (art) return { parent: host, anchorMin: art.anchorMin, anchorMax: art.anchorMax, pivot: art.pivot, localScale: art.localScale, sizeDelta: V(art.sizeDelta.x + pad.x * 2, art.sizeDelta.y + pad.y * 2), anchoredPosition: art.anchoredPosition };
        return { parent: host, anchorMin: V(0, 0), anchorMax: V(1, 1), pivot: V(0.5, 0.5), localScale: V(1, 1), sizeDelta: V(pad.x * 2, pad.y * 2), anchoredPosition: V(0, 0) };
      }
      const tgt = art ?? host;
      return { parent: host, anchorMin: tgt.anchorMin, anchorMax: tgt.anchorMax, pivot: tgt.pivot, localScale: tgt.localScale, sizeDelta: V(tgt.sizeDelta.x + pad.x * 2, tgt.sizeDelta.y + pad.y * 2), anchoredPosition: tgt.anchoredPosition };
    };
    const canvas0 = { sizeDelta: V(1920, 1080), anchorMin: V(0, 0), anchorMax: V(1, 1), pivot: V(0.5, 0.5), localScale: V(1, 1), parent: null, anchoredPosition: V(0, 0) };
    const bodyOf = (host) => ({ parent: host, anchorMin: V(0, 0), anchorMax: V(1, 1), pivot: V(0.5, 0.5), sizeDelta: V(0, 0), anchoredPosition: V(0, 0), localScale: V(1, 1) });
    const rowP = { parent: canvas0, anchorMin: V(0.5, 0.5), anchorMax: V(0.5, 0.5), pivot: V(0.5, 0.5), sizeDelta: V(1500, 200), anchoredPosition: V(0, -300), localScale: V(1, 1) };
    const cases = [
      { name: "layout row (3rd)", host: { parent: rowP, anchorMin: V(0, 1), anchorMax: V(0, 1), pivot: V(0.5, 0.5), sizeDelta: V(454, 166), anchoredPosition: V(40 + 2 * 478 + 227, -(17 + 83)), localScale: V(1, 1) }, art: null },
      { name: "scene copy @0.86", host: { parent: canvas0, anchorMin: V(0.5, 0.5), anchorMax: V(0.5, 0.5), pivot: V(0.5, 0.5), sizeDelta: V(454, 166), anchoredPosition: V(-77, 64), localScale: V(0.86, 0.86) }, art: null },
      { name: "posed copy", host: { parent: canvas0, anchorMin: V(0, 1), anchorMax: V(0, 1), pivot: V(0.5, 0.5), sizeDelta: V(330, 130), anchoredPosition: V(420, -260), localScale: V(1, 1) }, art: { anchorMin: V(0.5, 0.5), anchorMax: V(0.5, 0.5), pivot: V(0.5, 0.5), sizeDelta: V(348, 158), anchoredPosition: V(4, -11), localScale: V(1, 1) } },
      { name: "prefab drag-in", host: { parent: canvas0, anchorMin: V(0.5, 0.5), anchorMax: V(0.5, 0.5), pivot: V(0.5, 0.5), sizeDelta: V(454, 166), anchoredPosition: V(250, -180), localScale: V(1, 1) }, art: null },
    ];
    for (const c of cases) {
      if (c.art) c.art.parent = c.host;
      const artNode = c.art ?? bodyOf(c.host);
      const halo = makeHalo(c.host, c.art);
      const rA = resolve(artNode), rH = resolve(halo);
      const cA = center(rA), cH = center(rH);
      const dx = Math.round((cH.x - cA.x) * 10) / 10, dy = Math.round((cH.y - cA.y) * 10) / 10;
      const wantW = rA.w + 2 * pad.x * rA.sx, wantH = rA.h + 2 * pad.y * rA.sy;
      const ok = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(rH.w - wantW) < 0.5 && Math.abs(rH.h - wantH) < 0.5 && Math.abs(rH.sx - rA.sx) < 1e-6;
      glow.rows.push({ ctx: c.name, verdict: ok ? "PASS" : "FAIL", centerDx: dx, centerDy: dy, size: `${Math.round(rH.w)}x${Math.round(rH.h)}`, want: `${Math.round(wantW)}x${Math.round(wantH)}` });
    }
    /* round 18 (replacing round 17's synthetic row): the state slide,
       replayed with REAL values. Round 17's row patched a synthetic −14
       lift and ASSUMED the baked art moves by the manifest lift — the
       exact premise the field broke: the owner's real kit sinks its
       pressed face by the EXTRUSION COLLAPSE (labelStates dy) with every
       lift dial equal, so lift read 0, the halo slid by nothing, and the
       row still passed while the field failed. Now the probe MEASURES
       the art's travel from the shipped swap sprites (face-top row) and
       replays the shipped branch order against the kit's own manifest
       numbers — art and halo must move TOGETHER, and the manifest must
       tell the truth about the bake. */
    {
      const bakedSlide = /BakedSink\(\) \? new Vector2\(0f, liftNow\)/.test(fxCs);
      const rootGuard = /if \(!BakedSink\(\)\)/.test(fxCs);
      const sinkChannel = /pressedLift \+ \(baked \? pressedSink : 0f\)/.test(fxCs);
      const ps2 = m.pngScale > 0 ? m.pngScale : 2;
      const topOf = async (rel) => {
        const im = await sprite(rel);
        if (!im) return null;
        const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
        const cx2 = cv.getContext("2d"); cx2.drawImage(im, 0, 0);
        const dd = cx2.getImageData(0, 0, im.width, im.height).data;
        for (let y = 0; y < im.height; y++) {
          let n = 0;
          for (let x = 0; x < im.width; x++) if (dd[(y * im.width + x) * 4 + 3] > 64) n++;
          if (n > im.width * 0.05) return y;
        }
        return null;
      };
      const baseTop = await topOf("assets/button-primary/button-primary-base.9.png");
      for (const sn of ["hover", "pressed"]) {
        const stTop = await topOf(`assets/button-primary/button-primary-base-${sn}.9.png`);
        if (baseTop == null || stTop == null) {
          glow.rows.push({ ctx: `${sn} slide (swap build)`, verdict: "FAIL", centerDx: 0, centerDy: 0, size: "sprite missing", want: "state sprites" });
          continue;
        }
        const fxRow = (m.stateFx ?? []).find((f) => f && f.family === "button-primary" && f.state === sn) ?? { lift: 0 };
        const lsRow = (m.labelStates ?? []).find((l) => l && l.family === "button-primary" && l.state === sn) ?? { dy: 0 };
        const artUnity = -((stTop - baseTop) / ps2);          // measured, Unity up-positive
        const rootDelta = bakedSlide && rootGuard ? 0 : (fxRow.lift ?? 0);
        const faceTotal = rootDelta + artUnity;               // what the eye sees
        const haloTotal = rootDelta + (bakedSlide ? (fxRow.lift ?? 0) + (sinkChannel ? -(lsRow.dy ?? 0) : 0) : 0);
        const manifestTravel = (fxRow.lift ?? 0) - (lsRow.dy ?? 0);
        const okTogether = Math.abs(haloTotal - faceTotal) <= 1;
        const okManifest = Math.abs(artUnity - manifestTravel) <= 1.5;
        glow.rows.push({
          ctx: `${sn} slide (swap build)`,
          verdict: okTogether && okManifest ? "PASS" : "FAIL",
          centerDx: 0, centerDy: Math.round((haloTotal - faceTotal) * 10) / 10,
          size: `art ${Math.round(artUnity * 10) / 10}, halo ${Math.round(haloTotal * 10) / 10}`,
          want: `together (manifest ${Math.round(manifestTravel * 10) / 10})`,
        });
      }
      if (bakedSlide && rootGuard) glow.mode += " + baked-sink slide (round 17)";
      if (sinkChannel) glow.mode += " + extrusion-collapse sink (round 18)";
    }
    /* round 18: the fire button's press — disc vs icon (owner: "on press
       the center white disc and icon should move"). The disc's trip is
       BAKED (dome-pressed swap): its size is the shell-stamp delta plus
       the dome's designed sink. The icon's trip is what the shipped
       importer arms into FireButton.pressedLift — replayed here from the
       zip's own Editor C#: the stamp-driven FireGlyphTrip, or the old
       dial-only formula on earlier semantics. They must travel together. */
    {
      // shared Editor files sit OUTSIDE the slug folder — dual-key lookup,
      // the same lesson the Runtime lookup learned in round 16
      const impCs = new TextDecoder().decode(files.get("Editor/PatternBreakKitImporter.cs") ?? files.get("PatternBreakKitImporter.cs") ?? new Uint8Array());
      const stampTrip = /static float FireGlyphTrip\(/.test(impCs) && /dP\.shell\.y - d0\.shell\.y/.test(impCs);
      const d0 = (m.assets ?? []).find((a) => a && a.component === "firebutton" && a.part === "dome");
      const dP = (m.assets ?? []).find((a) => a && a.component === "firebutton" && a.part === "dome-pressed");
      if (d0 && dP && d0.shell && dP.shell) {
        const ps3 = m.pngScale > 0 ? m.pngScale : 2;
        const shellMin = Math.min(d0.shell.w, d0.shell.h) / ps3;
        const discTrip = -((dP.shell.y - d0.shell.y) / ps3 + shellMin * 0.016);
        const fxF = (m.stateFx ?? []).find((f) => f && f.family === "firebutton" && f.state === "pressed") ?? { lift: 0 };
        const glyphTrip = stampTrip ? discTrip : (fxF.lift ?? 0) - shellMin * 0.016;
        const ok = Math.abs(glyphTrip - discTrip) <= 0.5;
        glow.rows.push({ ctx: "fire press (disc vs icon)", verdict: ok ? "PASS" : "FAIL", centerDx: 0, centerDy: Math.round((glyphTrip - discTrip) * 10) / 10, size: `disc ${Math.round(discTrip * 10) / 10}, icon ${Math.round(glyphTrip * 10) / 10}`, want: "together" });
      } else {
        glow.rows.push({ ctx: "fire press (disc vs icon)", verdict: "FAIL", centerDx: 0, centerDy: 0, size: "dome rows missing", want: "dome + dome-pressed stamps" });
      }
    }
    glow.pad = pad;
    glow.alphas = {
      hover: aHover, pressed: aPress,
      dials: `app ${dialHover}/${dialPress} -> zip ${hoverG}/${pressG}`,
      distinct: Math.abs(aHover - aPress) > 0.05,
      ok: followsDials && (!dialsDiffer || Math.abs(aHover - aPress) > 0.05),
    };
  }

  /* ── 5 · composite receipt ───────────────────────────────────────── */
  const comp = document.createElement("canvas");
  comp.width = CELL * 3 + 48; comp.height = (CELL + 34) * items.length + 40;
  const cq = comp.getContext("2d");
  cq.fillStyle = "#1b1e26"; cq.fillRect(0, 0, comp.width, comp.height);
  cq.fillStyle = "#dfe3ec"; cq.font = "700 18px sans-serif";
  cq.fillText("APP BOARD RENDER — kit: " + KIT, 16, 26);
  cq.fillText("SCENE FROM THE ZIP", CELL + 32, 26);
  cq.fillText("DIFF (red = lost, blue = added)", CELL * 2 + 48, 26);
  for (let r = 0; r < rowCanvases.length; r++) {
    const y = 40 + r * (CELL + 34);
    cq.fillStyle = "#9aa3b5"; cq.font = "600 15px sans-serif";
    cq.fillText(`${items[r].component}  lost ${results[r].lostPct}% · added ${results[r].addedPct}% · Δcolor ${results[r].meanColorDelta}`, 16, y + 16);
    for (let c = 0; c < 3; c++) {
      const img = new Image();
      await new Promise((res) => { img.onload = res; img.src = rowCanvases[r][c]; });
      cq.drawImage(img, 16 + c * (CELL + 16), y + 22);
    }
  }
  return { results, glow, generatorVersion: m.generatorVersion, composite: comp.toDataURL("image/png") };
}, { KIT: kitName, FIXTURE: fixtureJson ?? null });

let hardFails = 0;
const wcFixture = readFileSync(join(REPO, "scripts/parity-fixtures/war-chuds.slim.json"), "utf8");
for (const kitName of ["default", "warchuds", "hotrod", "warchuds-real"]) {
  const out = await runKit(kitName, kitName === "warchuds-real" ? wcFixture : null);
  console.log(`\n══════ KIT: ${kitName} (export build ${out.generatorVersion}) ══════`);
  console.table(out.results);
  const al = out.glow.alphas;
  console.log(`GLOW-STATE — semantics: ${out.glow.mode}; pad (${out.glow.pad.x}, ${out.glow.pad.y}); alphas hover ${al.hover} / pressed ${al.pressed} — dials ${al.dials} ${al.ok ? (al.distinct ? "(follow dials, distinct)" : "(follow dials; matched dials, identical BY DESIGN)") : "(FAIL: zip does not follow the app's dials)"}`);
  console.table(out.glow.rows);
  const glowFail = out.glow.rows.filter((r) => r.verdict !== "PASS").length + (al.ok ? 0 : 1);
  hardFails += glowFail;
  console.log(glowFail === 0 ? "GLOW ROW: ALL PASS" : `GLOW ROW: ${glowFail} FAILURE(S)`);
  writeFileSync(join(OUT, `parity-${kitName}.png`), Buffer.from(out.composite.split(",")[1], "base64"));
  console.log(`composite written: ${join(OUT, `parity-${kitName}.png`)}`);
}
await browser.close();
server.close();
process.exit(hardFails === 0 ? 0 : 1);
