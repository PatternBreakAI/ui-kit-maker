// Hand-drawn atoms for the phone cut, in the kit's colours: the two glows, the Threat tile's name band, the plan
// timer's phone bar (track, fill, warn fill), the Influence meter's bar (track, gold, blue, marker). Vector SVG
// rasterized through Chromium at 1 unit = 1 px (3x). Geometry for each lands in atoms.json.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.env.CUT_SCRATCH || `${process.env.HOME}/sob-phone-cut`; // the cut's scratch root: fonts/ in, out/ out
const OUT = `${S}/cut/out/atoms`;
mkdirSync(OUT, { recursive: true });
const PT = 3;
const GOLD = ["#E49C0C", "#FCB424"], BLUE = ["#2F6FD6", "#5AA8FF"], WARN = ["#920C21", "#B94A5C"];
const WELL = "#050D19", INK = "#05091A", PARCH = "#F6E4CC";

// a notched rectangle path (chamfer c) at x,y,w,h — same octagon as the kit's `sharp:<cut>` shells
const notch = (x, y, w, h, c, cTop = c, cBot = c) => `M${x + cTop} ${y} H${x + w - cTop} L${x + w} ${y + cTop} V${y + h - cBot} L${x + w - cBot} ${y + h} H${x + cBot} L${x} ${y + h - cBot} V${y + cTop} Z`;
const svg = (w, h, body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
const grad = (id, [a, b]) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

const atoms = [];
// ── glows: white, notched, nine-sliced; reach = how far the light runs out from the shape's edge ──
function glow(id, wPt, hPt, cutPt, reachPt) {
  const w = wPt * PT, h = hPt * PT, c = cutPt * PT, reach = reachPt * PT;
  const pad = reach + 8 * PT; // room for the tail of the blur
  const W = w + 2 * pad, H = h + 2 * pad;
  const sigma = reach / 2.4; // 2.4 sigma out, the glow is below 1/255
  const dil = 2 * PT;
  const body = `<g filter="url(#bl)"><path d="${notch(pad - dil, pad - dil, w + 2 * dil, h + 2 * dil, c + dil * 0.6)}" fill="#FFFFFF"/></g>
<path d="${notch(pad, pad, w, h, c)}" fill="#FFFFFF"/>`;
  const defs = `<filter id="bl" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${sigma.toFixed(2)}"/></filter>`;
  atoms.push({ id, file: `${id}.png`, svg: svg(W, H, body, defs), spritePx: { w: W, h: H }, at1x: { size: { w: W / PT, h: H / PT }, shape: { x: pad / PT, y: pad / PT, w: wPt, h: hPt, cut: cutPt }, reach: reachPt, nineSlice: { left: (pad + c) / PT + 2, right: (pad + c) / PT + 2, top: (pad + c) / PT + 2, bottom: (pad + c) / PT + 2 } }, note: `white glow in the notched shape, ${reachPt} pt reach, nine-sliced; the app tints it and sits it centred under the piece so the shape rect lines up with the piece's shell` });
}
glow("glow-small", 60, 60, 4, 12);
glow("glow-plate", 220, 140, 12, 22);

// ── the Threat tile's name band: dark, notched at the top corners (the tile's inner notch), square below ──
{
  const w = 180, h = 16 * PT, cTop = 10, pad = 0;
  const body = `<path d="${notch(pad, pad, w, h, cTop, cTop, 0)}" fill="${WELL}" fill-opacity="0.82"/><rect x="${cTop}" y="${h - 1.5}" width="${w - 2 * cTop}" height="1.5" fill="${GOLD[0]}" fill-opacity="0.35"/>`;
  atoms.push({ id: "threat-tile-band", file: "band.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, nineSlice: { left: 4, right: 4, top: 4, bottom: 1 } }, note: "the dark band across the top of a Threat tile, for the name; stretch to the tile's inner width, taller for two lines" });
}

// ── the plan timer, phone bar: 8 pt track, 6 pt fill inside it, notched ends ──
{
  const w = 100 * PT, h = 8 * PT, c = 2 * PT;
  const body = `<path d="${notch(0, 0, w, h, c)}" fill="${WELL}" fill-opacity="0.96"/><path d="${notch(0.75, 0.75, w - 1.5, h - 1.5, c - 0.3)}" fill="none" stroke="${GOLD[0]}" stroke-opacity="0.55" stroke-width="1.5"/>`;
  atoms.push({ id: "timer-track-mobile", file: "timer-track-mobile.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, innerWell: { x: 1, y: 1, w: w / PT - 2, h: h / PT - 2 }, nineSlice: { left: 4, right: 4, top: 2, bottom: 2 } }, wellColor: WELL, note: "the plan timer's track for the phone: dark well, thin gold edge, notched ends" });
  const fw = (100 - 2) * PT, fh = 6 * PT, fc = 1.5 * PT;
  const fill = (id, colors) => {
    const body = `<path d="${notch(0, 0, fw, fh, fc)}" fill="url(#g)"/><path d="${notch(0.5, 0.5, fw - 1, fh - 1, fc - 0.2)}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="1"/><rect x="${fc}" y="1.5" width="${fw - 2 * fc}" height="2" fill="#FFFFFF" fill-opacity="0.28"/>`;
    atoms.push({ id, file: `${id}.png`, svg: svg(fw, fh, body, grad("g", colors)), spritePx: { w: fw, h: fh }, at1x: { size: { w: fw / PT, h: fh / PT }, nineSlice: { left: 3, right: 3, top: 2, bottom: 2 } }, colors, note: "sits inside the track at inset 1; width = value times the track's inner width; notched ends arrive with the sprite" });
  };
  fill("timer-fill-mobile", GOLD);
  fill("timer-fill-mobile-warn", WARN);
}

// ── the Influence meter's bar: 5 pt, gold meeting blue, a 7 pt diamond marker ──
{
  const w = 120 * PT, h = 5 * PT, c = 1.3 * PT;
  const body = `<path d="${notch(0, 0, w, h, c)}" fill="${WELL}" fill-opacity="0.96"/><path d="${notch(0.5, 0.5, w - 1, h - 1, c - 0.2)}" fill="none" stroke="${GOLD[0]}" stroke-opacity="0.45" stroke-width="1"/>`;
  atoms.push({ id: "meter-track", file: "bar-track.png", svg: svg(w, h, body), spritePx: { w, h }, at1x: { size: { w: w / PT, h: h / PT }, nineSlice: { left: 3, right: 3, top: 1, bottom: 1 } }, wellColor: WELL, note: "the meter's well; the two fills sit on it edge to edge" });
  const fw = 60 * PT, fh = 5 * PT, fc = 1.3 * PT;
  const seg = (id, colors) => {
    const body = `<path d="${notch(0, 0, fw, fh, fc)}" fill="url(#g)"/><rect x="${fc}" y="1" width="${fw - 2 * fc}" height="1.5" fill="#FFFFFF" fill-opacity="0.28"/><path d="${notch(0.5, 0.5, fw - 1, fh - 1, fc - 0.2)}" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="1"/>`;
    atoms.push({ id, file: `${id}.png`, svg: svg(fw, fh, body, grad("g", colors)), spritePx: { w: fw, h: fh }, at1x: { size: { w: fw / PT, h: fh / PT }, nineSlice: { left: 3, right: 3, top: 1, bottom: 1 } }, colors, note: "a fill segment; gold runs from the left end to the marker, blue from the marker to the right end; the marker covers the join" });
  };
  seg("meter-fill-gold", GOLD);
  seg("meter-fill-blue", BLUE);
  const d = 7 * PT, pad = 4 * PT, W = d + 2 * pad;
  const cx = W / 2, cy = W / 2, r = d / 2;
  const bodyM = `<g filter="url(#sh)"><path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z" fill="${PARCH}" stroke="${GOLD[0]}" stroke-width="2" stroke-linejoin="miter"/></g><path d="M${cx} ${cy - r + 3} L${cx + r - 3} ${cy} L${cx} ${cy + r - 3} L${cx - r + 3} ${cy} Z" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1"/>`;
  const defs = `<filter id="sh" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b"/><feOffset in="b" dy="1.5" result="o"/><feFlood flood-color="${INK}" flood-opacity="0.6" result="c"/><feComposite in="c" in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  atoms.push({ id: "meter-marker", file: "marker.png", svg: svg(W, W, bodyM, defs), spritePx: { w: W, h: W }, at1x: { size: { w: W / PT, h: W / PT }, diamond: { cx: cx / PT, cy: cy / PT, size: 7 }, nineSlice: null }, note: "the 7 pt diamond where gold meets blue, parchment with a gold rim; centre it on the join" });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.setContent(`<html><body style="margin:0;background:transparent"></body></html>`);
for (const a of atoms) {
  await page.evaluate((s) => { document.body.innerHTML = `<div id="host" style="display:inline-block;line-height:0">${s}</div>`; }, a.svg);
  const el = await page.$("#host svg");
  await el.screenshot({ path: `${OUT}/${a.file}`, omitBackground: true });
}
await browser.close();
writeFileSync(`${OUT}/atoms.json`, JSON.stringify(atoms.map(({ svg, ...a }) => a), null, 1));
console.log("atoms", atoms.map((a) => a.file).join(" "));
