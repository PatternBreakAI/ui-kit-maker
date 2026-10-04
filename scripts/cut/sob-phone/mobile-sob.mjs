// Stand on Business, phone cut: render every piece through the kit's own renderer (renderCutShell on the
// mobile-cut worktree, vite :5202), strip the label / bloom / cast shadow, rasterize at 1 svg unit = 1 px
// (design px = 3x phone px), and write full canvases + geometry for the packer.
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const S = process.env.CUT_SCRATCH || `${process.env.HOME}/sob-phone-cut`; // the cut's scratch root: fonts/ in, out/ out
const OUT = `${S}/cut/out`;
mkdirSync(`${OUT}/full`, { recursive: true });
mkdirSync(`${OUT}/preview`, { recursive: true });
const kit = JSON.parse(readFileSync(new URL("../../../src/generator/kit-stand-on-business.json", import.meta.url), "utf8"));
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;

const PT = 3; // design px per phone point
// ── the piece table (sizes in points; the page turns them into design px) ────────────────────────────────
// cfg: GOLD (the kit) | BLUE (plate-B) | RED (red trim, navy face) | IRON | WHITE | REDFACE (Sit Down: gold trim,
// red face) | DARKRED (gold trim, dark red face) | GREEN (chip-good) | GOLDFACE (badge) | PARCH (secondary) |
// DIM (dark header) | EMPTY (faint well)
const BTN = ["default", "hover", "pressed", "disabled"];
const ONE = ["default"];
const PIECES = [
  // 1 settings
  { id: "settings", variant: "default", cfg: "GOLD", states: BTN, w: 34, h: 34, cut: 5, tokenH: 84 },
  { id: "settings", variant: "glyph-gear", glyph: "gear", glyphPt: 20, cfg: "GOLD", states: ONE, w: 34, h: 34, cut: 5, tokenH: 84 },
  // 2 notched buttons
  { id: "notch-small", variant: "default", cfg: "GOLD", states: BTN, w: 120, h: 32, cut: 7, tokenH: 84, label: "LAST TURN", fsPt: 12 },
  { id: "notch-danger", variant: "default", cfg: "REDFACE", states: BTN, w: 150, h: 32, cut: 7, tokenH: 84, label: "SIT DOWN", fsPt: 12 },
  // 3 lock in
  { id: "lock-in", variant: "default", cfg: "PARCH", states: BTN, w: 134, h: 54, cut: 8, tokenH: 100, label: "LOCK IN", fsPt: 16, textOyPt: -8 },
  // 4 turn panel
  { id: "turn-panel", variant: "default", cfg: "GOLD", states: ONE, w: 150, h: 50, cut: 9, tokenH: 100, label: "TURN 4 / 8", fsPt: 11, textOyPt: -8, pin: true, rule: { xPt: 105 } },
  // 5 threat panel, tiles, force badges
  { id: "threat-panel", variant: "default", cfg: "DARKRED", states: ONE, w: 72, h: 125, cut: 6, tokenH: 100, label: "THREATS (2)", fsPt: 11, textOyPt: -50, pin: true },
  ...["gold", "blue", "red"].map((v) => ({ id: "threat-tile", variant: v, cfg: { gold: "GOLD", blue: "BLUE", red: "RED" }[v], states: ONE, w: 64, h: 33, cut: 4, tokenH: 72, frameOnly: true, label: "NAME", fsPt: 11 })),
  ...["red", "gold", "green"].map((v) => ({ id: "force-badge", variant: v, cfg: { red: "REDFACE", gold: "GOLDFACE", green: "GREEN" }[v], states: ONE, w: 15, h: 15, cut: 3, tokenH: 44, label: "3", fsPt: 11 })),
  ...["red", "gold", "green"].map((v) => ({ id: "force-badge", variant: `wide-${v}`, cfg: { red: "REDFACE", gold: "GOLDFACE", green: "GREEN" }[v], states: ONE, w: 28, h: 15, cut: 3, tokenH: 44, label: "3/5", fsPt: 11 })),
  // 6 seats and stat pill
  ...["gold", "blue", "moving", "confronting"].map((v) => ({ id: "seat", variant: v, cfg: { gold: "GOLD", blue: "BLUE", moving: "WHITE", confronting: "RED" }[v], states: ONE, w: 27, h: 27, cut: 4, tokenH: 72, frameOnly: true })),
  { id: "seat", variant: "empty", cfg: "EMPTY", states: ONE, w: 27, h: 27, cut: 4, tokenH: 72, frameOnly: true, wellFill: 0.45 },
  ...["gold", "blue"].map((v) => ({ id: "stat-pill", variant: v, cfg: { gold: "GOLD", blue: "BLUE" }[v], states: ONE, w: 25, h: 14, cut: 3, tokenH: 44, label: "4", fsPt: 11, divider: true })),
  // 7 meter orbs (the bar atoms are hand drawn in the packer)
  ...["gold", "blue"].map((v) => ({ id: "meter", variant: `orb-${v}`, cfg: { gold: "GOLD", blue: "BLUE" }[v], states: ONE, w: 22, h: 22, cut: 22 / (2 + Math.SQRT2), tokenH: 60, label: "7", fsPt: 12 })),
  // 8 sheet, well, stat plate, close
  ...["gold", "blue", "red", "iron"].map((v) => ({ id: "sheet", variant: v, cfg: v === "blue" ? "BLUETRIM" : v.toUpperCase(), states: ONE, w: 650, h: 350, cut: 14, tokenH: 150, pin: true, flat: true, label: v === "gold" ? "TITLE" : "", fsPt: 20 })),
  { id: "sheet", variant: "body-face", cfg: "GOLD", body: true, states: ONE, w: 650, h: 350, cut: 14, tokenH: 150, pin: true, flat: true, label: "Body text in the reading face.", fsPt: 15, previewOnly: true },
  ...["gold", "iron"].map((v) => ({ id: "picture-well", variant: v, cfg: v.toUpperCase(), states: ONE, w: 168, h: 220, cut: 8, tokenH: 110, frameOnly: true })),
  { id: "stat-plate", variant: "default", cfg: "GOLD", states: ONE, w: 34, h: 30, cut: 6, tokenH: 80, label: "12", fsPt: 12 },
  { id: "icon-close", variant: "default", cfg: "GOLD", states: BTN, w: 32, h: 32, cut: 5, tokenH: 84 },
  { id: "icon-close", variant: "glyph-close", glyph: "close", glyphPt: 16, cfg: "GOLD", states: ONE, w: 32, h: 32, cut: 5, tokenH: 84 },
  // 9 nameplates
  { id: "np-phone-you", variant: "default", cfg: "GOLD", states: ONE, w: 178, h: 44, cut: 6, tokenH: 100, label: "CHEVON", fsPt: 13 },
  { id: "np-phone-opp", variant: "default", cfg: "BLUE", states: ONE, w: 178, h: 44, cut: 6, tokenH: 100, label: "HARBORLIGHT", fsPt: 13 },
  // 11 turn call and caption
  ...["gold", "red"].map((v) => ({ id: "turn-call", variant: v, cfg: v.toUpperCase(), states: ONE, w: 300, h: 66, cut: 12, tokenH: 130, pin: true, label: "TURN 2 / OF 8", fsPt: 22 })),
  { id: "caption", variant: "default", cfg: "DIM", body: true, states: ONE, w: 430, h: 46, cut: 8, tokenH: 110, pin: true, label: "Harborlight commits Force at the Docks.", fsPt: 16 },
  // 12 deck and result panels, row plate
  ...["gold", "blue"].map((v) => ({ id: "deck-panel", variant: v, cfg: v.toUpperCase(), states: ONE, w: 336, h: 194, cut: 12, tokenH: 150, pin: true, flat: true, label: "HARBORLIGHT", fsPt: 18, textOyPt: -70 })),
  ...["gold", "blue", "iron"].map((v) => ({ id: "result-panel", variant: v, cfg: v === "blue" ? "BLUETRIM" : v.toUpperCase(), states: ONE, w: 580, h: 340, cut: 14, tokenH: 150, pin: true, flat: true, label: "VICTORY", fsPt: 28, textOyPt: -120 })),
  { id: "result-panel", variant: "row-plate", cfg: "DIM", states: ONE, w: 520, h: 34, cut: 6, tokenH: 84, pin: true, label: "THE DOCKS", fsPt: 12 },
].filter((p) => !only || only.test(`${p.id}/${p.variant}`));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${process.env.MAKER_PORT || 5173}/#/app`, { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(2000);

const renders = await page.evaluate(async ({ kit, PIECES, PT }) => {
  const b = await import("/src/generator/bevel.ts");
  const m = await import("/src/generator/model.ts");
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const base = kit.cfg;
  const kd = kit.kitDesigns;
  const withFx = (c, fx, glow) => { c.effects = { ...c.effects, ...fx }; if (glow) { c.candy.innerGlow.color = glow; c.candy.aura.color = glow; } return c; };
  const C = {};
  C.GOLD = deep(base);
  C.BLUE = deep(m.applyKitDesign(base, kd["copy-pltb-nameplate"]));
  C.BLUETRIM = withFx(deep(m.applyKitDesign(base, kd["copy-pltb-nameplate"])), { "Inner Fill": "#12305A" });
  C.RED = withFx(deep(base), { Bevel: "#B82A1E", Glow: "#FF7A5A", Highlight: "#E8604A", Shadow: "#3A0606" }, "#FF7A5A");
  C.IRON = withFx(deep(base), { Bevel: "#8A8F98", Glow: "#B8BEC8", Highlight: "#D0D5DD" }, "#B8BEC8");
  C.WHITE = withFx(deep(base), { Bevel: "#E6EAF0", Glow: "#FFFFFF", Highlight: "#FFFFFF" }, "#FFFFFF");
  C.REDFACE = deep(m.applyKitDesign(base, kd.small));
  C.DARKRED = withFx(deep(m.applyKitDesign(base, kd.small)), { "Inner Fill": "#4A0A0C", Shadow: "#2A0404" });
  C.GREEN = deep(m.applyKitDesign(base, kd["copy-chgd-chip"]));
  C.GOLDFACE = deep(m.applyKitDesign(base, kd["copy-lgsp-badge"]));
  C.GOLDFACE.type = { ...C.GOLDFACE.type, fill: "#0C1C36", fill2: "#12305A", shadow: { ...C.GOLDFACE.type.shadow, on: false } };
  C.PARCH = deep(m.applyKitDesign(base, kd.secondary));
  C.DIM = deep(m.applyKitDesign(base, kd["copy-lchd-header"]));
  C.DIM.type = { ...C.DIM.type, fill: "#F6E4CC", fill2: "#E8CFA8" };
  C.EMPTY = deep(m.applyKitDesign(base, kd["copy-lchd-header"]));
  C.EMPTY.transparency = { frame: 60, interior: 0, content: 100 };
  C.EMPTY.candy.extrusion.depth = 0; C.EMPTY.shadow.opacity = 0; C.EMPTY.candy.contact.opacity = 0;
  const bodyType = (c) => { c.type = { ...c.type, font: "Crimson Pro", weight: 600, spacing: 0, case: "none", emboss: { ...c.type.emboss, on: false } }; return c; };
  const glyphCfg = (c, color) => {
    c.transparency = { frame: 0, interior: 0, content: 100 }; c.shadow.opacity = 0; c.candy.contact.opacity = 0; c.candy.extrusion.depth = 0;
    c.stateDesigns = {}; for (const s of Object.values(c.states)) { s.glow = 0; s.lift = 0; s.opacity = 100; }
    c.icon = { ...c.icon, color, fx: { shadow: false, glow: false, emboss: false }, ox: 0, oy: 0, rotation: 0 }; return c;
  };
  const parser = new DOMParser();
  const out = [];
  for (const p of PIECES) {
    let cfg = deep(C[p.cfg]);
    if (p.frameOnly) cfg.transparency = { ...cfg.transparency, interior: 0 };
    if (p.body) cfg = bodyType(cfg);
    if (p.glyph) cfg = glyphCfg(cfg, "#FCB424");
    // grainless: the per-pixel grain (texture) is averaged away at phone scale anyway and makes a 2 MB PNG of a
    // panel; the diamond pattern stays. Only the big nine-sliced panels take it.
    if (p.flat) cfg.candy.texture = { ...(cfg.candy.texture || {}), amount: 0 };
    const K = p.tokenH / 168;
    for (const st of p.states) {
      const o = { w: p.w * PT, h: p.h * PT, cut: p.cut * PT, tokenH: p.tokenH, pinDesign: !!p.pin };
      if (p.label) { o.label = p.label; o.fs = (p.fsPt * PT * 52) / cfg.type.size; }
      if (p.textOyPt) o.textOy = (p.textOyPt * PT) / K;
      if (p.glyph) { o.iconDef = m.STOCK_ICONS[p.glyph]; o.iconSize = p.glyphPt * PT; }
      let svg;
      try { svg = b.renderCutShell(cfg, st, o); } catch (e) { out.push({ id: p.id, variant: p.variant, state: st, error: String(e).slice(0, 400) }); continue; }
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const root = doc.documentElement;
      const vb = root.getAttribute("viewBox").split(/\s+/).map(Number);
      const shell = root.getAttribute("data-shell").split(/\s+/).map(Number);
      // the label face, from the renderer's own text + its filter chain
      let label = null;
      const lg = root.querySelector('g[data-part="label"]');
      if (lg) {
        const t = lg.querySelector("text");
        const filt = (lg.getAttribute("filter") || t?.getAttribute("filter") || lg.querySelector("[filter]")?.getAttribute("filter") || "");
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
        label = t ? {
          text: t.textContent, x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")), fontSize: Number(t.getAttribute("font-size")),
          fontWeight: t.getAttribute("font-weight"), letterSpacing: t.getAttribute("letter-spacing"), fill: t.getAttribute("fill"),
          anchor: t.getAttribute("text-anchor"), baseline: t.getAttribute("dominant-baseline"), fontFamily: (t.getAttribute("font-family") || root.getAttribute("font-family")),
          prims, embossHi: cfg.type.emboss?.on ? cfg.type.emboss.hiColor : null, embossSh: cfg.type.emboss?.on ? cfg.type.emboss.shColor : null, textOpacity: t.getAttribute("opacity"),
        } : null;
      }
      // extras drawn into the art: the turn panel's rule, the stat pill's divider
      const [sx, sy, sw, sh] = shell;
      const wall = 12 * K;
      const trim = cfg.effects.Bevel;
      let extra = "";
      if (p.rule) {
        const rx = sx + p.rule.xPt * PT;
        extra += `<g data-part="rule"><rect x="${(rx - 1.5).toFixed(1)}" y="${(sy + wall + 9).toFixed(1)}" width="3" height="${(sh - 2 * wall - 18).toFixed(1)}" fill="${trim}" opacity="0.8"/><rect x="${(rx + 1.5).toFixed(1)}" y="${(sy + wall + 9).toFixed(1)}" width="1.5" height="${(sh - 2 * wall - 18).toFixed(1)}" fill="#05091A" opacity="0.55"/></g>`;
      }
      if (p.divider) {
        const dx = sx + sw / 2;
        extra += `<g data-part="rule"><rect x="${(dx - 1).toFixed(1)}" y="${(sy + wall + 3).toFixed(1)}" width="2" height="${(sh - 2 * wall - 6).toFixed(1)}" fill="${trim}" opacity="0.7"/></g>`;
      }
      // preview copy keeps the word; the sprite copy loses the word, the bloom and the cast shadow
      const strip = (sel) => root.querySelectorAll(sel).forEach((n) => n.remove());
      strip('[data-part="bloom"],[data-part="cast-shadow"],[data-part="contact-shadow"],[data-part="outer-glow"]');
      if (extra) root.insertAdjacentHTML("beforeend", extra);
      let faceD = null;
      if (p.frameOnly || p.wellFill) {
        faceD = root.querySelector('g[data-part="face"] > path')?.getAttribute("d") || null;
        if (faceD) {
          const NS = "http://www.w3.org/2000/svg";
          const kids = [...root.children].filter((n) => n.tagName !== "defs");
          const wrap = doc.createElementNS(NS, "g"); wrap.setAttribute("clip-path", "url(#holeclip)");
          for (const k of kids) wrap.appendChild(k);
          root.appendChild(wrap);
          let defs = root.querySelector("defs");
          if (!defs) { defs = doc.createElementNS(NS, "defs"); root.insertBefore(defs, root.firstChild); }
          // the face path lives inside the rise + lift groups: carry their translation onto the clip
          const shell0 = root.getAttribute("data-shell0").split(/\s+/).map(Number);
          const tr = `translate(${(shell[0] - shell0[0]).toFixed(2)} ${(shell[1] - shell0[1]).toFixed(2)})`;
          defs.insertAdjacentHTML("beforeend", `<clipPath id="holeclip"><path transform="${tr}" d="M-3000 -3000 H9000 V9000 H-3000 Z ${faceD}" clip-rule="evenodd"/></clipPath>`);
          if (p.wellFill) root.insertAdjacentHTML("beforeend", `<path transform="${tr}" d="${faceD}" fill="#05091A" opacity="${p.wellFill}"/>`);
        }
      }
      const ser = new XMLSerializer();
      const preview = ser.serializeToString(root);
      strip('[data-part="label"]');
      const sprite = ser.serializeToString(root);
      out.push({ id: p.id, variant: p.variant, state: st, vb, shell, K, wallPx: wall, rimPx: cfg.candy.rim.width * K, depthPx: cfg.candy.extrusion.depth * K, cutPx: p.cut * PT, w: p.w, h: p.h, tokenH: p.tokenH, cfgName: p.cfg, frameOnly: !!p.frameOnly, flat: !!p.flat, holePunched: !!faceD, glyph: p.glyph || null, glyphPt: p.glyphPt || null, previewOnly: !!p.previewOnly, label, sprite, preview, trim, effects: cfg.effects });
    }
  }
  return out;
}, { kit, PIECES, PT });

for (const r of renders.filter((r) => r.error)) console.log("RENDER ERROR", r.id, r.variant, r.state, r.error);
const ok = renders.filter((r) => !r.error);
console.log("rendered", ok.length, "svgs");

// ── rasterize: fonts from the local TTFs so the preview copies can show their words ────────────────────
const b64 = (f) => readFileSync(f).toString("base64");
const fontCss = `@font-face{font-family:'Cinzel';font-weight:700;src:url(data:font/ttf;base64,${b64(`${S}/cut/fonts/Cinzel-Bold.ttf`)}) format('truetype');}
@font-face{font-family:'Crimson Pro';font-weight:600;src:url(data:font/ttf;base64,${b64(`${S}/cut/fonts/CrimsonPro-SemiBold.ttf`)}) format('truetype');}`;
await page.setContent(`<html><head><style>${fontCss} body{margin:0;background:transparent}</style></head><body></body></html>`);
const fontsOk = await page.evaluate(async () => { try { await Promise.all([document.fonts.load("700 20px Cinzel"), document.fonts.load("600 20px 'Crimson Pro'")]); } catch (e) { return "ERR " + e; } return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`); });
console.log("fonts:", fontsOk);

const geometry = [];
for (const r of ok) {
  const key = `${r.id}__${r.variant}__${r.state}`;
  const shots = r.previewOnly ? [["preview", r.preview]] : [["full", r.sprite], ["preview", r.preview]];
  for (const [dir, svg] of shots) {
    if (dir === "preview" && !/data-part="label"|data-part="icon"/.test(svg)) continue;
    await page.evaluate((svg) => { document.body.innerHTML = `<div id="host" style="display:inline-block;line-height:0">${svg}</div>`; }, svg);
    const el = await page.$("#host svg");
    await el.screenshot({ path: `${OUT}/${dir}/${key}.png`, omitBackground: true });
  }
  const { sprite, preview, ...g } = r;
  g.file = `full/${key}.png`;
  geometry.push(g);
}
let merged = geometry;
if (only) { // a filtered run refreshes its own entries and keeps the rest
  try { const prev = JSON.parse(readFileSync(`${OUT}/geometry.json`, "utf8")); const keys = new Set(geometry.map((g) => g.file)); merged = [...prev.filter((g) => !keys.has(g.file)), ...geometry]; } catch { /* first run */ }
}
writeFileSync(`${OUT}/geometry.json`, JSON.stringify(merged, null, 1));
await browser.close();
console.log("done", geometry.length);
