// Stand on Business, phone cut round 2: the Brightside colours and Literata faces. Every piece renders through the
// kit's own renderer on the mobile-cut worktree (vite :5202): renderCutShell for the notched shells, renderKit for the
// ribbon banner, a sharp shell in the Stand on Business gold for the nameplate strip. 1 svg unit = 1 design px = 1/3 pt.
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const S = process.env.CUT_SCRATCH || `${process.env.HOME}/sob-phone-cut`; // round 2 reads cut2/fonts and writes cut2/out under it
const OUT = `${S}/cut2/out`;
mkdirSync(`${OUT}/full`, { recursive: true });
mkdirSync(`${OUT}/preview`, { recursive: true });
const bs = JSON.parse(readFileSync(new URL("../../../src/generator/kit-brightside.json", import.meta.url), "utf8"));
const sob = JSON.parse(readFileSync(new URL("../../../src/generator/kit-stand-on-business.json", import.meta.url), "utf8"));
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const PT = 3;
const GOLD_INK = "#D3A023"; // the glyph gold (the gold Location frame's mid-tone)

const BTN = ["default", "hover", "pressed", "disabled"];
const ONE = ["default"];
// wt = Literata weight; sp = letter spacing in hundredths of an em; fsPt = size at 1x; case upper unless asTyped
const PIECES = [
  // 1 the round-1 buttons in Brightside
  { id: "settings", variant: "default", cfg: "BASE", states: BTN, w: 34, h: 34, cut: 5, tokenH: 84 },
  { id: "settings", variant: "glyph-gear", glyph: "gear", glyphPt: 20, cfg: "BASE", states: ONE, w: 34, h: 34, cut: 5, tokenH: 84 },
  { id: "notch-small", variant: "default", cfg: "BASE", states: BTN, w: 120, h: 32, cut: 7, tokenH: 84, label: "LAST TURN", fsPt: 12, wt: 700, sp: 2 },
  { id: "notch-danger", variant: "default", cfg: "RED", states: BTN, w: 150, h: 32, cut: 7, tokenH: 84, label: "SIT DOWN", fsPt: 12, wt: 700, sp: 2 },
  { id: "lock-in", variant: "default", cfg: "GOLD", states: BTN, w: 134, h: 54, cut: 8, tokenH: 100, label: "LOCK IN", fsPt: 16, wt: 800, sp: 2, textOyPt: -8 },
  { id: "icon-close", variant: "default", cfg: "BASE", states: BTN, w: 32, h: 32, cut: 5, tokenH: 84 },
  { id: "icon-close", variant: "glyph-close", glyph: "close", glyphPt: 16, cfg: "BASE", states: ONE, w: 32, h: 32, cut: 5, tokenH: 84 },
  // 2 the turn banner (the Brightside ribbon, size l, rasterized to 420 pt wide)
  { id: "turn-banner", variant: "default", cfg: "BASE", ribbon: true, states: ONE, label: "TURN 4", fsPt: 30, wt: 700, sp: 8 },
  { id: "turn-banner", variant: "final", cfg: "RED", ribbon: true, states: ONE, label: "FINAL TURN", fsPt: 30, wt: 700, sp: 8 },
  // 3 play
  { id: "play", variant: "default", cfg: "GOLD", states: BTN, w: 220, h: 58, cut: 10, tokenH: 110, label: "PLAY", fsPt: 24, wt: 800, sp: 4 },
  // 4 the meter's numbers, round
  { id: "meter", variant: "orb-gold", cfg: "ORBGOLD", states: ONE, w: 22, h: 22, shape: "pill", tokenH: 60, label: "7", fsPt: 13, wt: 800, sp: 0 },
  { id: "meter", variant: "orb-blue", cfg: "ORBBLUE", states: ONE, w: 22, h: 22, shape: "pill", tokenH: 60, label: "7", fsPt: 13, wt: 800, sp: 0 },
  // 5 your nameplate's face in gold: the game's strip is a sharp shell of the Stand on Business kit, 479 by 95 design px
  //   on the 1920 stage; rendered with bloom and cast shadow kept, like the web cut, at 2x (drop-in) and 3x
  { id: "np-you", variant: "strip", cfg: "NPGOLD", states: ONE, w: 479 / PT, h: 95 / PT, shape: "sharp", tokenH: 110, keepHalo: true, label: "CHEVON", fsPt: 13, wt: 700, sp: 2, stageScale: true },
  // 6 the home screen
  { id: "home", variant: "player-plate", cfg: "BASE", states: ONE, w: 230, h: 44, cut: 8, tokenH: 100, label: "CHEVON", fsPt: 14, wt: 700, sp: 2 },
  { id: "home", variant: "currency-chip", cfg: "BASE", states: ONE, w: 84, h: 24, cut: 4, tokenH: 60, label: "1,240", fsPt: 12, wt: 700, sp: 0, asTyped: true },
  { id: "home", variant: "panel-gold", cfg: "PANELGOLD", states: ONE, w: 196, h: 70, cut: 8, tokenH: 100, pin: true, label: "MISSIONS", fsPt: 9, wt: 700, sp: 22, textOyPt: -24 },
  { id: "home", variant: "panel-blue", cfg: "PANELBLUE", states: ONE, w: 196, h: 70, cut: 8, tokenH: 100, pin: true },
  { id: "home", variant: "mission-row", cfg: "BASE", states: ONE, w: 176, h: 27, cut: 5, tokenH: 72, label: "Win 2 matches", fsPt: 11, wt: 600, sp: 0, asTyped: true },
  { id: "home", variant: "mission-row-complete", cfg: "GREEN", states: ONE, w: 176, h: 27, cut: 5, tokenH: 72 },
  { id: "home", variant: "photo-well", cfg: "BASE", states: ONE, w: 176, h: 72, cut: 8, tokenH: 100, frameOnly: true },
  { id: "home", variant: "deck-stage", cfg: "STAGE", states: ONE, w: 320, h: 44, cut: 10, tokenH: 100, pin: true },
  { id: "home", variant: "deck-name", cfg: "BASE", states: ONE, w: 300, h: 30, cut: 6, tokenH: 84, label: "HARBORLIGHT", fsPt: 20, wt: 800, sp: 2 },
  { id: "home", variant: "tab", cfg: "BASE", states: ONE, w: 100, h: 32, cut: 6, tokenH: 84, label: "SHOP", fsPt: 11, wt: 700, sp: 4 },
  { id: "home", variant: "tab-selected", cfg: "GOLD", states: ONE, w: 100, h: 32, cut: 6, tokenH: 84 },
  ...[["shop", "cart"], ["collection", "layers"], ["album", "image"], ["ranks", "trophy"]].map(([nm, ic]) => ({ id: "home", variant: `glyph-${nm}`, glyph: ic, glyphPt: 18, cfg: "BASE", states: ONE, w: 100, h: 32, cut: 6, tokenH: 84 })),
  { id: "home", variant: "rank-badge", cfg: "GOLD", states: ONE, w: 44, h: 44, cut: 8, tokenH: 84, label: "12", fsPt: 18, wt: 800, sp: 0 },
  { id: "home", variant: "toast", cfg: "BASE", states: ONE, w: 260, h: 40, cut: 7, tokenH: 84, label: "Deck saved.", fsPt: 13, wt: 600, sp: 0, asTyped: true },
].filter((p) => !only || only.test(`${p.id}/${p.variant}`));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${process.env.MAKER_PORT || 5173}/#/app`, { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(2000);

const renders = await page.evaluate(async ({ bs, sob, PIECES, PT, GOLD_INK }) => {
  const b = await import("/src/generator/bevel.ts");
  const m = await import("/src/generator/model.ts");
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const base = bs.cfg;
  const withFx = (c, fx, glow) => { c.effects = { ...c.effects, ...fx }; if (glow) { c.candy.innerGlow.color = glow; c.candy.aura.color = glow; } return c; };
  // Literata on every Brightside face
  const lit = (c) => { c.type = { ...c.type, font: "Literata", weight: 700, spacing: 2, case: "upper" }; return c; };
  const C = {};
  C.BASE = lit(deep(base));
  C.GOLD = withFx(lit(deep(base)), { "Inner Fill": "#F5C842", Bevel: "#E0A92A", Highlight: "#FFF3C4", Glow: "#FFE9AE", Shadow: "#8A5A10" }, "#FFE9AE");
  C.RED = withFx(lit(deep(base)), { "Inner Fill": "#D9463A", Shadow: "#5A1A14", Glow: "#FFB3A0" }, "#FFB3A0");
  C.RED.type = { ...C.RED.type, fill: "#F0F0E4", fill2: "#FFFFFF", shadow: { ...C.RED.type.shadow, color: "#4A1410", opacity: 45 } };
  C.GREEN = withFx(lit(deep(base)), { "Inner Fill": "#6CC46A", Shadow: "#2E6B2E", Glow: "#C8F5C0" }, "#C8F5C0");
  C.PANELGOLD = withFx(lit(deep(base)), { "Inner Fill": "#FFE9AE", Bevel: "#E9CC7A", Glow: "#FFF4CC", Shadow: "#8A6A28" }, "#FFF4CC");
  C.PANELBLUE = withFx(lit(deep(base)), { "Inner Fill": "#DCE9FA", Bevel: "#9FBDE3", Glow: "#CFE3FF", Shadow: "#3A5A8A" }, "#CFE3FF");
  C.STAGE = withFx(lit(deep(base)), { "Inner Fill": "#FFE9AE", Bevel: "#E9CC7A", Glow: "#FFF4CC", Shadow: "#8A6A28" }, "#FFF4CC");
  C.STAGE.candy.innerGlow = { ...C.STAGE.candy.innerGlow, opacity: 60, size: 70 };
  C.ORBGOLD = withFx(lit(deep(base)), { "Inner Fill": "#22304A", Bevel: GOLD_INK, Highlight: "#F8E878", Glow: "#FFE9AE", Shadow: "#3A2A08" }, "#FFE9AE");
  C.ORBGOLD.face = { ...C.ORBGOLD.face, mode: "dark" }; C.ORBGOLD.type = { ...C.ORBGOLD.type, fill: "#FFE9AE", fill2: "#FFFFFF", shadow: { ...C.ORBGOLD.type.shadow, color: "#0A1020", opacity: 60 } };
  C.ORBBLUE = deep(C.ORBGOLD); withFx(C.ORBBLUE, { Bevel: "#4A90E2", Highlight: "#9CCBFF", Glow: "#CFE3FF", Shadow: "#0B1E3A" }, "#CFE3FF");
  // the nameplate strip: Stand on Business plate-A with the gold Location frame's face
  C.NPGOLD = deep(m.applyKitDesign(sob.cfg, sob.kitDesigns["copy-plta-nameplate"]));
  C.NPGOLD.effects = { ...C.NPGOLD.effects, "Inner Fill": GOLD_INK };
  C.NPGOLD.type = { ...C.NPGOLD.type, font: "Literata", weight: 700, spacing: 2, case: "upper", fill: "#22304A", fill2: "#2E3F5E", shadow: { ...C.NPGOLD.type.shadow, on: false },
    emboss: { ...C.NPGOLD.type.emboss, on: true, hiColor: "#FFF6D0", shColor: "#6B4A00", hiOpacity: 45, shOpacity: 35, distance: 1 } };
  const glyphCfg = (c, color) => {
    c.transparency = { frame: 0, interior: 0, content: 100 }; c.shadow.opacity = 0; c.candy.contact.opacity = 0; c.candy.extrusion.depth = 0;
    c.stateDesigns = {}; for (const s of Object.values(c.states)) { s.glow = 0; s.lift = 0; s.opacity = 100; }
    c.icon = { ...c.icon, color, fx: { shadow: false, glow: false, emboss: false }, ox: 0, oy: 0, rotation: 0 }; return c;
  };
  const EXTRA_ICONS = {
    layers: { lib: "lucide", name: "Layers", viewBox: "0 0 24 24", inner: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>', mode: "stroke" },
    image: { lib: "lucide", name: "Image", viewBox: "0 0 24 24", inner: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>', mode: "stroke" },
  };
  const parser = new DOMParser();
  const ser = new XMLSerializer();
  const out = [];
  for (const p of PIECES) {
    let cfg = deep(C[p.cfg]);
    if (p.wt || p.sp !== undefined || p.asTyped) cfg.type = { ...cfg.type, weight: p.wt ?? cfg.type.weight, spacing: p.sp ?? cfg.type.spacing, case: p.asTyped ? "none" : cfg.type.case };
    if (p.frameOnly) cfg.transparency = { ...cfg.transparency, interior: 0 };
    if (p.glyph) cfg = glyphCfg(cfg, GOLD_INK);
    const K = (p.tokenH ?? 168) / 168;
    for (const st of p.states) {
      let svg;
      try {
        if (p.ribbon) {
          const rb = m.applyKitDesign(cfg, bs.kitDesigns.ribbonbanner);
          rb.type = { ...rb.type, size: cfg.type.size }; // the ribbon design's own 140 size dial is for the kit page; the cut sizes its word itself
          svg = b.renderKit(rb, "ribbonbanner", "l", st, undefined, "stock:ribbonclassic", { label: p.label });
        } else {
          const o = { w: p.w * PT, h: p.h * PT, tokenH: p.tokenH, pinDesign: !!p.pin };
          if (p.shape) o.shape = p.shape; else o.cut = p.cut * PT;
          if (p.label) { o.label = p.label; o.fs = (p.fsPt * PT * 52) / cfg.type.size; }
          if (p.textOyPt) o.textOy = (p.textOyPt * PT) / K;
          if (p.glyph) { o.iconDef = m.STOCK_ICONS[p.glyph] || EXTRA_ICONS[p.glyph]; o.iconSize = p.glyphPt * PT; }
          svg = b.renderCutShell(cfg, st, o);
        }
      } catch (e) { out.push({ id: p.id, variant: p.variant, state: st, error: String(e).slice(0, 400) }); continue; }
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const root = doc.documentElement;
      const vb = root.getAttribute("viewBox").split(/\s+/).map(Number);
      const shell = root.getAttribute("data-shell").split(/\s+/).map(Number);
      const shell0 = (root.getAttribute("data-shell0") || root.getAttribute("data-shell")).split(/\s+/).map(Number);
      // the label face: the renderer's own text and its filter chain (built labels sit in g[data-part=label]; the
      // ribbon's word is a contentText seat, the first text in the piece)
      let label = null;
      const lg = root.querySelector('g[data-part="label"]');
      const t = lg ? lg.querySelector("text") : [...root.querySelectorAll("text")].find((n) => n.getAttribute("fill") !== "none");
      if (t) {
        let el = t, filt = "";
        while (el && el !== root) { const f = el.getAttribute && el.getAttribute("filter"); if (f) { filt = f; break; } el = el.parentNode; }
        const fid = /url\(#([^)]+)\)/.exec(filt)?.[1];
        const prims = [];
        if (fid) {
          const f = root.querySelector(`filter[id="${fid}"]`);
          if (f) {
            const nodes = [...f.children];
            for (let i = 0; i < nodes.length; i++) {
              if (nodes[i].tagName === "feGaussianBlur") {
                const blur = Number(nodes[i].getAttribute("stdDeviation"));
                const off = nodes[i + 1]?.tagName === "feOffset" ? nodes[i + 1] : null;
                const flood = nodes[i + 2]?.tagName === "feFlood" ? nodes[i + 2] : null;
                if (off && flood) prims.push({ dx: Number(off.getAttribute("dx")), dy: Number(off.getAttribute("dy")), blurStdDev: blur, color: flood.getAttribute("flood-color"), opacity: Number(flood.getAttribute("flood-opacity")) });
              }
            }
          }
        }
        label = { text: t.textContent, x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")), fontSize: Number(t.getAttribute("font-size")),
          fontWeight: t.getAttribute("font-weight"), letterSpacing: t.getAttribute("letter-spacing"), fill: t.getAttribute("fill"),
          anchor: t.getAttribute("text-anchor"), baseline: t.getAttribute("dominant-baseline"), fontFamily: (t.getAttribute("font-family") || root.getAttribute("font-family")),
          prims, embossHi: cfg.type.emboss?.on ? cfg.type.emboss.hiColor : null, embossSh: cfg.type.emboss?.on ? cfg.type.emboss.shColor : null };
      }
      const strip = (sel) => root.querySelectorAll(sel).forEach((n) => n.remove());
      if (!p.keepHalo) strip('[data-part="bloom"],[data-part="cast-shadow"],[data-part="contact-shadow"],[data-part="outer-glow"]');
      let faceD = null;
      if (p.frameOnly) {
        faceD = root.querySelector('g[data-part="face"] > path')?.getAttribute("d") || null;
        if (faceD) {
          const NS = "http://www.w3.org/2000/svg";
          const kids = [...root.children].filter((n) => n.tagName !== "defs");
          const wrap = doc.createElementNS(NS, "g"); wrap.setAttribute("clip-path", "url(#holeclip)");
          for (const k of kids) wrap.appendChild(k);
          root.appendChild(wrap);
          let defs = root.querySelector("defs");
          if (!defs) { defs = doc.createElementNS(NS, "defs"); root.insertBefore(defs, root.firstChild); }
          const tr = `translate(${(shell[0] - shell0[0]).toFixed(2)} ${(shell[1] - shell0[1]).toFixed(2)})`;
          defs.insertAdjacentHTML("beforeend", `<clipPath id="holeclip"><path transform="${tr}" d="M-3000 -3000 H9000 V9000 H-3000 Z ${faceD}" clip-rule="evenodd"/></clipPath>`);
        }
      }
      const preview = ser.serializeToString(root);
      // the sprite loses the word: built labels by their group, the ribbon's by its text nodes (and their filter group)
      if (lg) lg.remove(); else if (p.ribbon) root.querySelectorAll("text").forEach((n) => { let g = n; while (g.parentNode && g.parentNode !== root && g.parentNode.children.length === 1) g = g.parentNode; g.remove(); });
      const sprite = ser.serializeToString(root);
      const [sx, sy, sw, sh] = shell;
      out.push({ id: p.id, variant: p.variant, state: st, vb, shell, shell0, K, wallPx: (cfg.bevel.off ? 0 : cfg.bevel.width) * K, depthPx: cfg.candy.extrusion.depth * K, cutPx: p.cut ? p.cut * PT : null, shape: p.shape || null,
        w: p.w ?? sw / PT, h: p.h ?? sh / PT, tokenH: p.tokenH ?? 168, cfgName: p.cfg, frameOnly: !!p.frameOnly, holePunched: !!faceD, glyph: p.glyph || null, glyphPt: p.glyphPt || null, ribbon: !!p.ribbon, keepHalo: !!p.keepHalo, stageScale: !!p.stageScale,
        label, sprite, preview, trim: cfg.effects.Bevel, effects: cfg.effects, typeFill: cfg.type.fill, caseRule: cfg.type.case, wt: cfg.type.weight, sp: cfg.type.spacing });
    }
  }
  return out;
}, { bs, sob, PIECES, PT, GOLD_INK });

for (const r of renders.filter((r) => r.error)) console.log("RENDER ERROR", r.id, r.variant, r.state, r.error);
const ok = renders.filter((r) => !r.error);
console.log("rendered", ok.length, "svgs");

const b64 = (f) => readFileSync(f).toString("base64");
const fontCss = [600, 700, 800].map((w, i) => `@font-face{font-family:'Literata';font-weight:${w};src:url(data:font/ttf;base64,${b64(`${S}/cut2/fonts/Literata_12pt-${["SemiBold", "Bold", "ExtraBold"][i]}.ttf`)}) format('truetype');}`).join("\n");
await page.setContent(`<html><head><style>${fontCss} body{margin:0;background:transparent}</style></head><body></body></html>`);
console.log("fonts:", await page.evaluate(async () => { await Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 20px Literata`))); return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`); }));

const geometry = [];
for (const r of ok) {
  const key = `${r.id}__${r.variant}__${r.state}`;
  // the ribbon is drawn at the kit's size l (shell 798.8 wide) and rasterized so the shell is 420 pt = 1260 px wide;
  // the nameplate strip is drawn in stage px and rasterized at 2x (the web drop-in) and 3x
  const scales = r.ribbon ? [["", (420 * PT) / r.shell[2]]] : r.stageScale ? [["@2x", 2], ["@3x", 3]] : [["", 1]];
  for (const [suffix, dpr] of scales) {
    const c2 = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: dpr });
    const pg = await c2.newPage();
    await pg.setContent(`<html><head><style>${fontCss} body{margin:0;background:transparent}</style></head><body></body></html>`);
    await pg.evaluate(async () => { await Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 20px Literata`))); });
    for (const [dir, svg] of [["full", r.sprite], ["preview", r.preview]]) {
      if (dir === "preview" && !/<text|data-part="icon"/.test(svg)) continue;
      await pg.evaluate((svg) => { document.body.innerHTML = `<div id="host" style="display:inline-block;line-height:0">${svg}</div>`; }, svg);
      const el = await pg.$("#host svg");
      await el.screenshot({ path: `${OUT}/${dir}/${key}${suffix}.png`, omitBackground: true });
    }
    await c2.close();
    const { sprite, preview, ...g } = r;
    geometry.push({ ...g, file: `full/${key}${suffix}.png`, raster: dpr, suffix });
  }
}
let merged = geometry;
if (only) { try { const prev = JSON.parse(readFileSync(`${OUT}/geometry.json`, "utf8")); const keys = new Set(geometry.map((g) => g.file)); merged = [...prev.filter((g) => !keys.has(g.file)), ...geometry]; } catch { /* first run */ } }
writeFileSync(`${OUT}/geometry.json`, JSON.stringify(merged, null, 1));
await browser.close();
console.log("done", geometry.length);
