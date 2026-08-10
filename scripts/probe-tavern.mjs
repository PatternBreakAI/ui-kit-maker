/* Free-kit component probe — engine assertions for the staged pieces
   (vitalbar, quickslots), the healthglobe level badge, readout ink,
   eyebrow-stroke none and composite content margin, including the
   adversarial-review scenarios: factory config at size s, wall width 34,
   byte-cleanliness, grid alignment. Runs against the LAUNCH kit settings
   (Salt Pink — the live hero snapshot; owner pick, 2026-08-10); point
   KIT_SETTINGS at another settings JSON to probe a different kit.
   Needs the dev server on :5199. Run: node scripts/probe-tavern.mjs */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.NODE_USE_ENV_PROXY = "1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = JSON.parse(readFileSync(join(ROOT, process.env.KIT_SETTINGS ?? "docs/salt-pink.settings.json"), "utf8"));

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5199/#/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const out = await page.evaluate(async (json) => {
  const { renderKit, VALUE_DRIVEN } = await import("/src/generator/bevel.ts");
  const { hydrate } = await import("/src/generator/store.ts");
  const model = await import("/src/generator/model.ts");
  const cfg = hydrate(json);
  const res = {};

  // ── vitalbar ──
  const vbH = renderKit(cfg, "vitalbar", "m", "default", 0.83, undefined, { slots: { readout: "1,250 / 1,500", tint: "Health" } });
  const vbM = renderKit(cfg, "vitalbar", "m", "default", 0.65, undefined, { slots: { readout: "650 / 1,000", tint: "Mana" } });
  const vbG = renderKit(cfg, "vitalbar", "m", "default", 0.72);
  res.vbHealthHue = vbH.includes("#4ade80") && vbH.includes("1,250 / 1,500");
  res.vbManaHue = vbM.includes("#38bdf8") && vbM.includes("650 / 1,000");
  res.vbGlowFollows = vbG.includes(cfg.effects.Glow) && !vbG.includes("#4ade80");
  // two-storey layout: the readout prints ABOVE the track, never on it
  const tail = vbH.slice(vbH.indexOf("data-vitalbar"));
  const readoutY = parseFloat((/<text[^>]* y="([\d.]+)"/.exec(tail) ?? [])[1]);
  const trackY = parseFloat((/<rect x="[\d.]+" y="([\d.]+)"[^>]*rx=/.exec(tail) ?? [])[1]);
  res.vbReadoutAboveTrack = Number.isFinite(readoutY) && Number.isFinite(trackY) && readoutY + 14 <= trackY;
  res.vbValueDriven = VALUE_DRIVEN.has("vitalbar");

  // ── healthglobe badge ──
  const hgPlain = renderKit(cfg, "healthglobe", "m", "default", 0.72);
  const hgLvl = renderKit(cfg, "healthglobe", "m", "default", 0.72, undefined, { slots: { lvl: "24" } });
  res.globePlainNoText = !hgPlain.includes("<text");
  res.globeBadge = hgLvl.includes("<text") && hgLvl.includes(">24<");
  res.globeNoGhostLine = !/\n[ \t]+\n<\/g>/.test(hgPlain);
  const hgRim = renderKit(cfg, "healthglobe", "m", "default", 0.72, undefined, { part: "rim", slots: { lvl: "24" } });
  res.rigLayersClean = !hgRim.includes("<text");

  // ── quickslots ──
  const qs = renderKit(cfg, "quickslots", "m", "default", undefined, undefined, { slots: { q1: "3", q4: "5" } });
  res.qsRenders = qs.includes('data-quickslots="1"') && qs.includes(">3<") && qs.includes(">5<");
  res.qsOnePiece = (qs.match(/<svg /g) || []).length === 1;
  res.qsDisc = qs.includes("radialGradient") && (qs.match(/<line /g) || []).length >= 4;
  res.qsFourTiles = (qs.match(/<g transform="translate/g) || []).length >= 4 && !qs.includes("stroke-dasharray");
  const qsBare = renderKit(cfg, "quickslots", "m", "default", undefined, undefined, { slots: { g1: "Empty", g2: "Empty", g3: "Empty", g4: "Empty" } });
  res.qsEmptyArms = (qsBare.match(/stroke-dasharray/g) || []).length === 4;
  const qsHot = renderKit(cfg, "quickslots", "m", "default", undefined, undefined, { slots: { active: "Down" } });
  res.qsActiveRing = qsHot.includes('stroke-width="3.5"') && !qs.includes('stroke-width="3.5"');
  const qsHotDis = renderKit(cfg, "quickslots", "m", "disabled", undefined, undefined, { slots: { active: "Down" } });
  res.qsActiveCalmDisabled = !/stroke-width="3\.5" style="filter: drop-shadow/.test(qsHotDis);
  res.qsIgnoresRetiredCentre = !renderKit(cfg, "quickslots", "m", "default", undefined, undefined, { slots: { g5: "Flask", q5: "2" } }).includes(">2<");

  // ── the review's scenarios: factory config, size s, wall width 34 ──
  const factory = hydrate(model.defaultConfig());
  const negAttr = (svg) => /(?:width|height|rx|ry|r)="-/.test(svg);
  const negArc = (svg) => /A -/.test(svg);
  res.vbFactorySClean = !negAttr(renderKit(factory, "vitalbar", "s", "default", 0.72));
  const wall34 = hydrate(model.defaultConfig()); wall34.bevel.width = 34; wall34.bevel.off = false;
  res.vbWall34Clean = ["s", "m", "l"].every((sz) => !negAttr(renderKit(wall34, "vitalbar", sz, "default", 0.5)));
  const qsFacS = renderKit(factory, "quickslots", "s", "default", undefined, undefined, { slots: { g1: "Empty", g2: "Empty", g3: "Empty", g4: "Empty" } });
  res.qsFactorySClean = !negArc(qsFacS) && !negAttr(qsFacS);

  // ── grid alignment: tiles must sit ON the coded grid, not ~30px south
  //    (build's rise reserve, compensated via data-shell) ──
  const dom = document.createElement("div");
  dom.innerHTML = renderKit(cfg, "quickslots", "m", "default");
  document.body.appendChild(dom);
  const tops = [...dom.querySelectorAll("svg > g[transform]")].map((g) => g.getBBox().y + g.transform.baseVal.consolidate().matrix.f);
  dom.remove();
  const sorted = [...tops].sort((a, b) => a - b);
  // N ink top ≈ 42 - ~12px overhang; span = 2*D9 = 252 at size m
  res.qsGridAligned = tops.length >= 4 && sorted[0] < 55 && Math.abs((sorted[sorted.length - 1] - sorted[0]) - 252) < 10;

  // ── readout ink: a pinned Typography color out-votes the adaptive pick ──
  const cfgInk = hydrate(JSON.parse(JSON.stringify(json))); cfgInk.type.infoInk = "#FF00AA";
  res.readoutInkUnit = renderKit(cfgInk, "unitplate", "m", "default", 0.82).includes('fill="#FF00AA"');
  res.readoutInkTicket = renderKit(cfgInk, "orderticket", "m", "default", 0.62).includes('fill="#FF00AA"');
  res.readoutInkAutoHolds = !renderKit(cfg, "unitplate", "m", "default", 0.82).includes('fill="#FF00AA"');

  // ── eyebrow stroke: the "none" sentinel removes the keyline entirely ──
  res.eyebrowStrokeFactory = renderKit(cfg, "achievetoast", "m", "default").includes("paint-order: stroke");
  res.eyebrowStrokeNone = !renderKit(cfg, "achievetoast", "m", "default", undefined, undefined, { slots: { eyebrowStroke: "none" } }).includes("paint-order: stroke");

  // ── content margin reaches composites; extremes never invert geometry ──
  const wide = hydrate(JSON.parse(JSON.stringify(json))); wide.contentMargin = 60;
  const shellW = (svg) => parseFloat((/data-shell0="[-\d.]+ [-\d.]+ ([\d.]+)/.exec(svg) ?? [])[1]);
  res.marginGrowsCounter = shellW(renderKit(wide, "resource", "m", "default")) > shellW(renderKit(cfg, "resource", "m", "default")) + 60;
  const wall34m = hydrate(model.defaultConfig()); wall34m.bevel.width = 34; wall34m.contentMargin = 60;
  const hugAll = hydrate(model.defaultConfig()); hugAll.contentMargin = -20;
  res.marginExtremesClean = ["s", "m", "l"].every((sz) => [wall34m, hugAll].every((c) =>
    !negAttr(renderKit(c, "orderticket", sz, "default", 0.62)) &&
    !negAttr(renderKit(c, "unitplate", sz, "default", 0.82)) &&
    !negAttr(renderKit(c, "resource", sz, "default"))));
  return res;
}, json);

let bad = 0;
for (const [k, v] of Object.entries(out)) { console.log(v === true ? "ok  :" : "FAIL:", k); if (v !== true) bad++; }
await browser.close();
console.log(bad ? "PROBE FAILED" : "PROBE PASSED");
process.exitCode = bad ? 1 : 0;
