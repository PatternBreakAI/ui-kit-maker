// Pull stills out of the game's webm clips with Chromium (no ffmpeg in the sandbox): each clip is served to the page
// through a route (a data URL of this size never reached loadedmetadata); seek to a few moments, paint the frame to a
// canvas, save a PNG per moment and a meta.json with the clip's size and length.
import { chromium } from "../node_modules/playwright-core/index.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const S = process.env.KIT_SCRATCH || `${process.env.HOME}/nightfall-kit`;
const GAME = `${process.env.GAME_ROOT || `${process.env.HOME}/legacygame`}/public/art/video`;
const OUT = `${S}/kit/landing/frames`;
mkdirSync(OUT, { recursive: true });
const clips = (process.argv[2] || "board,harriet,douglass").split(",");
const times = (process.argv[3] || "0.3,1.5,3,5,8").split(",").map(Number);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// the page and the clips share one origin, so the canvas the frames are painted on stays exportable
await ctx.route(/^http:\/\/clips\.local\//, (route) => {
  const name = route.request().url().split("/").pop();
  if (name === "page.html") return route.fulfill({ status: 200, contentType: "text/html", body: `<video id="v" muted playsinline preload="auto"></video><canvas id="c"></canvas>` });
  try { route.fulfill({ status: 200, contentType: "video/webm", body: readFileSync(`${GAME}/${name}`) }); } catch { route.fulfill({ status: 404, body: "" }); }
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
const meta = {};
for (const c of clips) {
  await page.goto("http://clips.local/page.html");
  const info = await page.evaluate(async ({ c, times }) => {
    const v = document.getElementById("v");
    const ready = new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("video error " + (v.error && v.error.code))); setTimeout(() => rej(new Error("metadata timeout")), 30000); });
    v.src = `http://clips.local/${c}.webm`; v.load();
    await ready;
    const cv = document.getElementById("c"); cv.width = v.videoWidth; cv.height = v.videoHeight;
    const frames = [];
    for (const t of times) {
      if (Number.isFinite(v.duration) && t > v.duration) break;
      await new Promise((res) => { v.onseeked = () => res(); v.currentTime = t; setTimeout(res, 6000); });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      cv.getContext("2d").drawImage(v, 0, 0);
      frames.push({ t, png: cv.toDataURL("image/png").split(",")[1] });
    }
    return { w: v.videoWidth, h: v.videoHeight, duration: v.duration, frames };
  }, { c, times });
  meta[c] = { w: info.w, h: info.h, duration: info.duration, frames: info.frames.map((f) => f.t) };
  for (const f of info.frames) writeFileSync(`${OUT}/${c}-${String(f.t).replace(".", "_")}.png`, Buffer.from(f.png, "base64"));
  console.log(c, info.w, "x", info.h, "dur", Number(info.duration).toFixed(2), "frames", info.frames.length);
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await browser.close();
