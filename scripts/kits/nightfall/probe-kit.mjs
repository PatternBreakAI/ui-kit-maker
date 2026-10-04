// Render the Nightfall kit's main pieces through renderKit (size m, default) on the kit worktree (vite :5203),
// on the kit's own canvas colour, into a contact sheet; record every piece's shell size for the board author.
import { chromium } from "../node_modules/playwright-core/index.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const S = process.env.KIT_SCRATCH || `${process.env.HOME}/nightfall-kit`;
mkdirSync(`${S}/kit/probe`, { recursive: true });
const kit = JSON.parse(readFileSync(`${process.env.MAKER_ROOT || new URL("../../..", import.meta.url).pathname}/src/generator/kit-nightfall.json`, "utf8"));
const SIZE = process.argv[3] || "m";
const IDS = (process.argv[2] || "primary,secondary,small,ghost,iconbtn,copy-navg-iconbtn,avatarframe,nameplate,currency,header,panel,copy-play-panel,datarow,chip,copy-done-chip,badge,toast,tab,segment,progress,xpbar,toggle,dialog,coin,tooltip,input,dropdown,pagedots,placeholder").split(",");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:${process.env.MAKER_PORT || 5173}/#/app", { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async ({ kit, IDS, SIZE }) => {
  const b = await import("/src/generator/bevel.ts");
  const m = await import("/src/generator/model.ts");
  const res = {};
  for (const id of IDS) {
    const clone = kit.kitClones[id];
    const base = clone ? clone.base : id;
    const cfg = m.applyKitDesign(kit.cfg, kit.kitDesigns[id]);
    const icon = kit.kitIcons[id] ? kit.kitIcons[id] : undefined;
    const label = kit.kitLabels[id];
    try {
      res[id] = b.renderKit(cfg, base, SIZE, "default", kit.kitVals[id], kit.kitShapes[id], { label, icon, sub: kit.kitSubs[id], segments: base === "segment" && label ? label.split("|") : undefined, overlay: id === "copy-play-panel" ? "strip" : undefined, stretch: id === "copy-play-panel" ? 1.1 : undefined, stretchY: id === "copy-play-panel" ? 0.85 : undefined });
    } catch (e) { res[id] = "ERR " + String(e).slice(0, 300); }
  }
  return res;
}, { kit, IDS, SIZE });
const geom = {};
const b64 = (f) => readFileSync(f).toString("base64");
const fontCss = `@font-face{font-family:'Cinzel';font-weight:700;src:url(data:font/ttf;base64,${b64(`${S}/fonts/Cinzel-Bold.ttf`)}) format('truetype');}
@font-face{font-family:'Crimson Pro';font-weight:600;src:url(data:font/ttf;base64,${b64(`${S}/fonts/CrimsonPro-SemiBold.ttf`)}) format('truetype');}`;
await page.setContent(`<html><head><style>${fontCss} body{margin:0;background:${kit.cfg.canvas}}</style></head><body></body></html>`);
await page.evaluate(() => Promise.all([document.fonts.load("700 20px Cinzel"), document.fonts.load("600 20px 'Crimson Pro'")]));
for (const [id, svg] of Object.entries(out)) {
  if (svg.startsWith("ERR")) { console.log(id, svg); continue; }
  const shell = /data-shell="([^"]+)"/.exec(svg)?.[1]; const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]; const wh = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  geom[id] = { shell: shell?.split(" ").map(Number), vb: vb?.split(" ").map(Number), w: Number(wh?.[1]), h: Number(wh?.[2]) };
  await page.evaluate((svg) => { document.body.innerHTML = `<div id="host" style="display:inline-block;line-height:0">${svg}</div>`; }, svg);
  const el = await page.$("#host svg");
  await el.screenshot({ path: `${S}/kit/probe/${id}.png`, omitBackground: true });
  console.log(id, "shell", shell, "canvas", wh?.[1], wh?.[2]);
}
let mergedGeom = geom;
try { mergedGeom = { ...JSON.parse(readFileSync(`${S}/kit/probe/geom-${SIZE}.json`, "utf8")), ...geom }; } catch { /* first run */ }
writeFileSync(`${S}/kit/probe/geom-${SIZE}.json`, JSON.stringify(mergedGeom, null, 1));
await browser.close();
