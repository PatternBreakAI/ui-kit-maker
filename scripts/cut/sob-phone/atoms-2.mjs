// Round-2 hand-drawn atoms in Brightside colours: the plan timer's phone bar (track, fill, warn), the season pass bar
// (track, fill), the PLAY button's wipe shine, the home screen's top bar. Vector SVG rasterized at 1 unit = 1 px (3x).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.env.CUT_SCRATCH || `${process.env.HOME}/sob-phone-cut`; // round 2 reads cut2/fonts and writes cut2/out under it
const OUT = `${S}/cut2/out/atoms`;
mkdirSync(OUT, { recursive: true });
const PT = 3;
const GOLD = ["#E0A92A", "#FFE9AE"], WARN = ["#C8392F", "#F08A7A"];
const WELL = "#3B3528", INK = "#22304A", PARCH = "#F0F0E4", LIGHTGOLD = "#FFE9AE";
const notch = (x, y, w, h, c, cTop = c, cBot = c) => `M${x + cTop} ${y} H${x + w - cTop} L${x + w} ${y + cTop} V${y + h - cBot} L${x + w - cBot} ${y + h} H${x + cBot} L${x} ${y + h - cBot} V${y + cTop} Z`;
const svg = (w, h, body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
const grad = (id, [a, b]) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const atoms = [];

// ── the plan timer, phone bar, Brightside: a warm dark well with a light-gold edge, gold fill, warn red ──
{
  const w = 100 * PT, h = 8 * PT, c = 2 * PT;
  const body = `<path d="${notch(0, 0, w, h, c)}" fill="${WELL}" fill-opacity="0.92"/><path d="${notch(0.75, 0.75, w - 1.5, h - 1.5, c - 0.3)}" fill="none" stroke="${LIGHTGOLD}" stroke-opacity="0.6" stroke-width="1.5"/>`;
  atoms.push({ id: "timer-track-mobile", file: "timer-track-mobile.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, innerWell: { x: 1, y: 1, w: w / PT - 2, h: h / PT - 2 }, nineSlice: { left: 4, right: 4, top: 2, bottom: 2 } }, wellColor: WELL, note: "the plan timer's track for the phone in Brightside: warm dark well, light-gold edge, notched ends" });
  const fw = 98 * PT, fh = 6 * PT, fc = 1.5 * PT;
  const fill = (id, colors) => {
    const body = `<path d="${notch(0, 0, fw, fh, fc)}" fill="url(#g)"/><path d="${notch(0.5, 0.5, fw - 1, fh - 1, fc - 0.2)}" fill="none" stroke="${INK}" stroke-opacity="0.25" stroke-width="1"/><rect x="${fc}" y="1.5" width="${fw - 2 * fc}" height="2" fill="#FFFFFF" fill-opacity="0.35"/>`;
    atoms.push({ id, file: `${id}.png`, svg: svg(fw, fh, body, grad("g", colors)), spritePx: { w: fw, h: fh }, at1x: { size: { w: fw / PT, h: fh / PT }, nineSlice: { left: 3, right: 3, top: 2, bottom: 2 } }, colors, note: "sits inside the track at inset 1; width = value times the track's inner width; notched ends arrive with the sprite" });
  };
  fill("timer-fill-mobile", GOLD);
  fill("timer-fill-mobile-warn", WARN);
}
// ── the season pass bar, 130 by 5 ──
{
  const w = 130 * PT, h = 5 * PT, c = 1.3 * PT;
  const body = `<path d="${notch(0, 0, w, h, c)}" fill="${INK}" fill-opacity="0.55"/><path d="${notch(0.5, 0.5, w - 1, h - 1, c - 0.2)}" fill="none" stroke="${LIGHTGOLD}" stroke-opacity="0.45" stroke-width="1"/>`;
  atoms.push({ id: "progress-track", file: "progress-track.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, nineSlice: { left: 3, right: 3, top: 1, bottom: 1 } }, note: "the season pass track: ink at 55% with a light-gold edge, notched ends" });
  const fw = 130 * PT, fh = 5 * PT, fc = 1.3 * PT;
  const bodyF = `<path d="${notch(0, 0, fw, fh, fc)}" fill="url(#g)"/><rect x="${fc}" y="1" width="${fw - 2 * fc}" height="1.5" fill="#FFFFFF" fill-opacity="0.35"/>`;
  atoms.push({ id: "progress-fill", file: "progress-fill.png", svg: svg(fw, fh, bodyF, grad("g", GOLD)), spritePx: { w: fw, h: fh }, at1x: { size: { w: fw / PT, h: fh / PT }, nineSlice: { left: 3, right: 3, top: 1, bottom: 1 } }, colors: GOLD, note: "the fill, same size as the track; width = value times the track width, nine-sliced so the notched ends stay" });
}
// ── the PLAY button's wipe shine: a soft white band leaning 15 degrees, feathered to nothing ──
{
  const w = 80 * PT, h = 58 * PT;
  const defs = `<linearGradient id="wipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="0.65" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${(2 * PT).toFixed(1)}"/></filter>`;
  // the band: a rotated rect centred in the canvas, wider than tall so the lean is visible, blurred a touch
  const bw = 34 * PT, bh = h * 1.4;
  const body = `<g filter="url(#soft)" transform="rotate(15 ${w / 2} ${h / 2})"><rect x="${(w / 2 - bw / 2).toFixed(1)}" y="${(h / 2 - bh / 2).toFixed(1)}" width="${bw}" height="${bh}" fill="url(#wipe)"/></g>`;
  atoms.push({ id: "wipe", file: "wipe.png", svg: svg(w, h, body, defs), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, band: { width: 34, lean: 15 }, nineSlice: null },
    recommended: { opacity: 0.55, blend: "additive (screen); normal at 0.35 if additive is unavailable", sweep: "left edge to right edge of the button's face in 0.8 s, every 4 s, clipped to the face" },
    note: "a white band of light 34 pt wide leaning 15 degrees from vertical, feathered to nothing on both sides, blurred 2 pt; the sprite is transparent outside the band" });
}
// ── the home screen's top bar: a faint strip with notched lower corners ──
{
  const w = 874 * PT, h = 48 * PT, c = 8 * PT;
  const body = `<path d="${notch(0, 0, w, h, c, 0, c)}" fill="${PARCH}" fill-opacity="0.14"/><path d="M${c} ${h - 1.5} H${w - c}" stroke="${LIGHTGOLD}" stroke-opacity="0.55" stroke-width="1.5"/><path d="M0 ${h - c} L${c} ${h - 1} M${w} ${h - c} L${w - c} ${h - 1}" stroke="${LIGHTGOLD}" stroke-opacity="0.45" stroke-width="1.5"/>`;
  atoms.push({ id: "top-bar", file: "top-bar.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, nineSlice: { left: 10, right: 10, top: 2, bottom: 10 } }, note: "parchment at 14% with a light-gold rule along its foot; the lower corners notched 8, the top corners square (it runs off the top edge). Nine-sliced for any width." });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 2800, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.setContent(`<html><body style="margin:0;background:transparent"></body></html>`);
for (const a of atoms) {
  await page.evaluate((s) => { document.body.innerHTML = `<div id="host" style="display:inline-block;line-height:0">${s}</div>`; }, a.svg);
  const el = await page.$("#host svg");
  await el.screenshot({ path: `${OUT}/${a.file}`, omitBackground: true });
}
await browser.close();
writeFileSync(`${OUT}/atoms.json`, JSON.stringify(atoms.map(({ svg, ...a }) => a), null, 1));
console.log("atoms", atoms.map((a) => a.file).join(" "));
