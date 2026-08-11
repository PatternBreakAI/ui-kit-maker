/* Boards→Scenes probe — vault round-trip, ship-copy ceiling, saturation
   baking, per-copy labels, zone anchoring, proxy fallback. Pure module
   level (no UI). Needs the dev server on :5199.
   Run: node scripts/probe-scenes.mjs */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.NODE_USE_ENV_PROXY = "1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = JSON.parse(readFileSync(join(ROOT, "docs/salt-pink.settings.json"), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5199/#/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const out = await page.evaluate(async (json) => {
  const { hydrate } = await import("/src/generator/store.ts");
  const { putBgOriginal, getBgOriginal, normalizeShipCopy } = await import("/src/generator/bgvault.ts");
  const { collectExportBoards } = await import("/src/generator/engineExport.ts");
  const cfg = hydrate(JSON.parse(JSON.stringify(json)));
  const res = {};

  // a within-ceiling original: 1600x900 PNG from a canvas
  const cv = document.createElement("canvas");
  cv.width = 1600; cv.height = 900;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#3ab5d8"; ctx.fillRect(0, 0, 1600, 900);
  ctx.fillStyle = "#ffd34d"; ctx.fillRect(100, 100, 600, 400);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  const assetId = await putBgOriginal(blob, "mid.png");
  res.vaultPut = !!assetId;
  const back = await getBgOriginal(assetId);
  res.vaultRoundTrip = !!back && back.blob.size === blob.size;

  // ship-copy ceiling: 4000-wide normalizes to 1920 long side; ≤1920 passes through untouched
  const big = document.createElement("canvas"); big.width = 4000; big.height = 2250;
  big.getContext("2d").fillRect(0, 0, 4000, 2250);
  const bigBlob = await new Promise((r) => big.toBlob(r, "image/png"));
  const shrunk = await normalizeShipCopy(bigBlob);
  const shrunkBmp = await createImageBitmap(shrunk);
  res.shipCopyCeiling = shrunkBmp.width === 1920 && shrunk.type === "image/png";
  res.shipCopyPassThrough = (await normalizeShipCopy(blob)) === blob;

  // saturation bakes into the shipped bytes: pure red at 0% comes back grey
  const red = document.createElement("canvas"); red.width = 64; red.height = 64;
  const rctx = red.getContext("2d");
  rctx.fillStyle = "#ff0000"; rctx.fillRect(0, 0, 64, 64);
  const redId = await putBgOriginal(await new Promise((r) => red.toBlob(r, "image/png")), "red.png");
  const satBoards = [{ id: "s1", name: "Grey", aspect: "169", bgImage: "data:image/png;base64,x", bgAssetId: redId, bgShow: true, bgSat: 0, items: [{ id: "si", libId: "", kitId: "primary", x: 100, y: 100 }] }];
  const satEx = await collectExportBoards({ boards: satBoards, cfg, kitTextFill: {}, kitSizes: {}, kitShapes: {}, kitLabels: {}, kitVals: {} });
  const satBmp = await createImageBitmap(new Blob([satEx[0].bg.bytes]));
  const scv = document.createElement("canvas"); scv.width = 4; scv.height = 4;
  const sctx = scv.getContext("2d"); sctx.drawImage(satBmp, 0, 0, 4, 4);
  const px = sctx.getImageData(1, 1, 1, 1).data;
  res.saturationBaked = satEx[0].bg.saturation === 0 && Math.abs(px[0] - px[1]) < 6 && Math.abs(px[1] - px[2]) < 6;

  const boards = [
    { id: "b1", name: "Main Menu", aspect: "169", bgImage: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", bgAssetId: assetId, bgShow: true, bgOpacity: 90, bgBlur: 2, ovMode: "vignette", ovStrength: 80, items: [
      { id: "i1", libId: "", kitId: "primary", x: 810, y: 470 },                       // dead center
      { id: "i2", libId: "", kitId: "primary", x: 810, y: 640, label: "OPTIONS" },     // center, own words
      { id: "i3", libId: "", kitId: "resource", x: 40, y: 30, scale: 0.8 },            // top-left HUD
      { id: "i4", libId: "", kitId: "iconbtn", x: 1780, y: 950, scale: 0.9, rot: 10 }, // bottom-right
    ] },
    { id: "b2", name: "No Vault", aspect: "mobile", bgImage: cv.toDataURL("image/jpeg", 0.5), bgShow: true, items: [
      { id: "i5", libId: "", kitId: "secondary", x: 60, y: 700 },
    ] },
    { id: "b3", name: "Empty", aspect: "169", items: [] },
  ];
  const st = { boards, cfg, kitTextFill: {}, kitSizes: {}, kitShapes: {}, kitLabels: { primary: "START" }, kitVals: {} };
  const ex = await collectExportBoards(st);
  res.boardCount = ex.length === 2; // Empty skipped
  const b1 = ex[0], b2 = ex[1];
  res.bgOriginalShips = !!b1.bg && b1.bg.original === true && b1.bg.bytes.length === blob.size && /\.png$/.test(b1.bg.file);
  res.bgSettingsRide = b1.bg.opacity === 90 && b1.bg.blur === 2 && b1.bg.saturation === 100 && b1.bg.overlay === "vignette" && b1.bg.overlayStrength === 80;
  res.proxyFallback = !!b2.bg && b2.bg.original === false && b2.bg.bytes.length > 100 && /\.jpg$/.test(b2.bg.file);
  const items = b1.items;
  res.labelRides = items[1].label === "OPTIONS" && items[0].label === null;
  res.centerAnchor = items[0].ax === 0.5 && items[0].ay === 0.5 && items[0].anchor === "middle-center";
  res.cornerAnchors = items[2].ax === 0 && items[2].ay === 1 && items[2].anchor === "top-left" &&
    items[3].ax === 1 && items[3].ay === 0 && items[3].anchor === "bottom-right";
  res.dimsSane = items.every((i) => i.w > 40 && i.h > 20 && i.cx > 0 && i.cy > 0) && items[2].w < items[0].w;
  res.rotRides = items[3].rot === 10;
  res.mobileStage = b2.w === 390 && b2.h === 844;
  return res;
}, json);

let bad = 0;
for (const [k, v] of Object.entries(out)) { console.log(v === true ? "ok  :" : "FAIL:", k, v === true ? "" : JSON.stringify(v)); if (v !== true) bad++; }
await browser.close();
console.log(bad ? "PROBE FAILED" : "PROBE PASSED");
process.exitCode = bad ? 1 : 0;
