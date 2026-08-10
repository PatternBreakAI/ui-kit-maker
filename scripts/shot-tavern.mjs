/* Renders the Emerald Tavern staged pieces for review — vital bars and the
   equipment quadrant over light and dark grounds. Needs the dev server on
   :5199. Output: OUT_DIR (default /tmp) / tavern-pieces.jpg */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.NODE_USE_ENV_PROXY = "1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.OUT_DIR ?? "/tmp";
const json = JSON.parse(readFileSync(join(ROOT, "docs/emerald-tavern.settings.json"), "utf8"));

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1150 }, deviceScaleFactor: 1 });
await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  try {
    const r = await fetch(route.request().url(), { headers: { "user-agent": route.request().headers()["user-agent"] ?? "Mozilla/5.0" } });
    await route.fulfill({ status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream", "access-control-allow-origin": "*" }, body: Buffer.from(await r.arrayBuffer()) });
  } catch { await route.abort(); }
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5199/#/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.evaluate(async (json) => {
  const { renderKit } = await import("/src/generator/bevel.ts");
  const { hydrate } = await import("/src/generator/store.ts");
  const { ensureFont } = await import("/src/generator/fonts.ts");
  const cfg = hydrate(json);
  ensureFont(cfg.type.font);
  await document.fonts.ready; await new Promise((r) => setTimeout(r, 800)); await document.fonts.ready;

  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;width:1680px;height:1150px;overflow:hidden;position:relative;font-family:Inter,sans-serif";
  const half = (top, bg) => {
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;left:0;right:0;top:${top};height:575px;background:${bg};display:flex;align-items:center;justify-content:space-evenly`;
    document.body.appendChild(d);
    return d;
  };
  const light = half("0", "linear-gradient(180deg,#a8cdea 0%,#9db98a 100%)");
  const dark = half("575px", "linear-gradient(180deg,#1d2634 0%,#141b26 100%)");
  const cells = [
    ["vitalbar-stack", null],
    ["Quadrant · flask active", { slots: { q1: "3", q4: "5", active: "Down" } }],
    ["Quadrant · resting", { slots: { g1: "Scroll", g2: "Key", g3: "Zap", g4: "Heart", q4: "2" } }],
  ];
  for (const row of [light, dark]) {
    for (const [name, opts] of cells) {
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px";
      const art = document.createElement("div");
      if (name === "vitalbar-stack") {
        art.style.cssText = "width:430px;display:flex;flex-direction:column;gap:2px";
        for (const [v, ro, tint] of [[0.83, "1,250 / 1,500", "Health"], [0.65, "650 / 1,000", "Mana"]]) {
          const one = document.createElement("div");
          one.innerHTML = renderKit(cfg, "vitalbar", "m", "default", v, undefined, { slots: { readout: ro, tint } });
          const svg = one.querySelector("svg");
          svg.removeAttribute("width"); svg.removeAttribute("height");
          svg.style.cssText = "width:100%;height:auto;display:block";
          art.appendChild(one);
        }
      } else {
        art.style.cssText = "width:430px";
        art.innerHTML = renderKit(cfg, "quickslots", "m", "default", undefined, undefined, opts);
        const svg = art.querySelector("svg");
        svg.removeAttribute("width"); svg.removeAttribute("height");
        svg.style.cssText = "width:100%;height:auto;display:block";
      }
      const cap = document.createElement("div");
      cap.textContent = name === "vitalbar-stack" ? "Vital bars · readout above the track" : name;
      cap.style.cssText = `font-size:15px;font-weight:600;color:${row === light ? "#2c3a2c" : "#9fb0c4"}`;
      cell.append(art, cap);
      row.appendChild(cell);
    }
  }
}, json);
await page.waitForTimeout(500);
writeFileSync(join(OUT, "tavern-pieces.jpg"), await page.screenshot({ type: "jpeg", quality: 90 }));
await browser.close();
console.log("→", join(OUT, "tavern-pieces.jpg"));
