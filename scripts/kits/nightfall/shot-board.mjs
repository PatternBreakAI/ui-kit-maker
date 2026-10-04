// Open the editor on the kit worktree (vite :5203), load the Nightfall document the way a shipped kit loads
// (loadKitPayload, not the viewer road), switch to the board phase on the home board, and screenshot the artboard
// with the real renderer. Also reports console errors from the kit page (the chapters) in this state.
import { chromium } from "../node_modules/playwright-core/index.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const S = process.env.KIT_SCRATCH || `${process.env.HOME}/nightfall-kit`;
mkdirSync(`${S}/kit/shots`, { recursive: true });
const kit = JSON.parse(readFileSync(`${process.env.MAKER_ROOT || new URL("../../..", import.meta.url).pathname}/src/generator/kit-nightfall.json`, "utf8"));
const name = process.argv[2] || "board";
const BOARD = process.argv[3] || "nf-home";
const bdef = kit.boards.find((b) => b.id === BOARD) || kit.boards[0];
const ASPECT = { "169": 16 / 9, "iphone-pro-l": 874 / 402, "mobile": 390 / 844 }[bdef.aspect] || 16 / 9;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 2300, height: 1500 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 900)); });
// the sandbox cannot reach Google Fonts: answer the app's font requests with the local cuts so nothing throws
const TTF = { cinzel: readFileSync(`${S}/fonts/Cinzel-Bold.ttf`), crimson: readFileSync(`${S}/fonts/CrimsonPro-SemiBold.ttf`), literata: readFileSync(`${S}/fonts/Literata_12pt-Bold.ttf`) };
await page.route(/fonts\.googleapis\.com/, (route) => {
  const u = route.request().url();
  const fams = [...u.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " "));
  const css = fams.map((f) => {
    const key = /cinzel/i.test(f) ? "cinzel" : /crimson/i.test(f) ? "crimson" : /literata/i.test(f) ? "literata" : null;
    if (!key) return "";
    return [400, 500, 600, 700, 800, 900].map((w) => `@font-face{font-family:'${f}';font-style:normal;font-weight:${w};src:url(http://fonts.gstatic.local/${key}.ttf) format('truetype');}`).join("\n");
  }).join("\n");
  route.fulfill({ status: 200, contentType: "text/css", body: css });
});
await page.route(/fonts\.gstatic\.(com|local)/, (route) => {
  const u = route.request().url();
  const key = /cinzel/i.test(u) ? "cinzel" : /crimson/i.test(u) ? "crimson" : /literata/i.test(u) ? "literata" : "cinzel";
  route.fulfill({ status: 200, contentType: "font/ttf", body: TTF[key] });
});
await page.goto(`http://127.0.0.1:${process.env.MAKER_PORT || 5173}/#/app`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(4000);
const info = await page.evaluate(async ({ BOARD, ...kit }) => {
  // the app's own store module (vite stamps edited modules with ?t=, a bare import would be a second instance)
  const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\/src\/generator\/store\.ts/.test(n)) || "/src/generator/store.ts";
  const st = await import(url);
  st.useGen.getState().loadKitPayload(kit, {});
  await new Promise((r) => setTimeout(r, 1500));
  let g = st.useGen.getState();
  const boardsBefore = g.boards.map((b) => `${b.id}:${b.name}:${b.items.length}`);
  // only the board being shot stands on the desk, so the stage box found below is its own
  st.useGen.setState({ boards: kit.boards.filter((b) => b.id === BOARD), activeBoard: BOARD });
  g = st.useGen.getState();
  g.setPhase("kit");
  await new Promise((r) => setTimeout(r, 2500));
  const kitErr = document.body.innerText.includes("crashed") || !!document.querySelector(".crash, .glitch");
  g.setPhase("board");
  g.setActiveBoard(BOARD);
  return { url, boardsBefore, clones: Object.keys(st.useGen.getState().kitClones || {}), phase: st.useGen.getState().phase, active: st.useGen.getState().activeBoard, kitName: st.useGen.getState().kitName, kitErr };
}, { ...kit, BOARD });
console.log("store:", JSON.stringify(info));
await page.waitForTimeout(7000);
const box = await page.evaluate((ASPECT) => {
  const els = [...document.querySelectorAll("div, section")].map((d) => ({ d, r: d.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 600 && r.height > 250 && Math.abs(r.width / r.height - ASPECT) < 0.03);
  els.sort((a, b) => b.r.width - a.r.width);
  const pick = els.find(({ r }) => r.top > -5 && r.top < 1500) || els[0];
  if (!pick) return null;
  const r = pick.r;
  return { x: r.x, y: r.y, w: r.width, h: r.height, cls: pick.d.className, n: els.length };
}, ASPECT);
console.log("stage box:", JSON.stringify(box));
console.log("banner:", await page.evaluate(() => (document.body.innerText.match(/Something glitched[^\n]*\n?[^\n]*/) || [""])[0].slice(0, 200)));
if (box && box.y >= 0 && box.y + box.h <= 1500) await page.screenshot({ path: `${S}/kit/shots/${name}.png`, clip: { x: box.x, y: box.y, width: box.w, height: box.h }, timeout: 120000 });
await page.screenshot({ path: `${S}/kit/shots/${name}-page.png`, timeout: 120000 });
await browser.close();
console.log("shots written");
