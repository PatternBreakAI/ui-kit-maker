/* Bake the Google Fonts STATIC-INSTANCE TTF URL table into
   src/generator/exportUtils.ts (between the BAKED-FONT-STATICS markers).

   Why this exists (Unity field round, 2026-08-27, strike three on font
   weights): the export's css2 road needs a legacy User-Agent to be handed
   .ttf URLs, and a BROWSER cannot change its User-Agent — Chromium drops
   the override and fonts.googleapis.com's preflight allows no headers, so
   in the field that road ALWAYS misses and the export fell back to the
   google/fonts repo files, which for variable families are the VARIABLE
   TTF (Fredoka's default instance is wght 300 — "Fredoka Light").
   TextMeshPro renders a variable font's DEFAULT instance, so every kit
   designed at 500-700 shipped visibly thin.

   Node CAN send the legacy UA. This script asks css2 for every catalog
   family at every weight the app can design, records the static-instance
   fonts.gstatic.com TTF paths (that host answers CORS with * and needs no
   UA games), and writes them as data the export fetches directly. The
   export verifies the actual bytes (no fvar + the right OS/2 weight)
   before trusting any entry, so a stale table degrades honestly instead
   of lying.

   Run: node scripts/bake-font-statics.mjs        (rewrites exportUtils.ts)
        node scripts/bake-font-statics.mjs --check (verify only, exit 1 on drift) */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = readFileSync(join(ROOT, "src/generator/model.ts"), "utf8");
const UTILS_PATH = join(ROOT, "src/generator/exportUtils.ts");
const LEGACY_UA = "UIKitMaker-export/1.0 (TTF bundler; +https://uikitmaker.com)";
const CA = process.env.CCR_CA_BUNDLE ?? "/root/.ccr/ca-bundle.crt";

/* ── the catalog, straight from GAME_FONTS ────────────────────────── */
const block = /export const GAME_FONTS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(MODEL);
if (!block) { console.error("bake-font-statics: GAME_FONTS not found in model.ts"); process.exit(1); }
const entries = [];
for (const m of block[1].matchAll(/\{ name: "([^"]+)", css: (null|"[^"]*"), [^\n]*caps: \{ ([^}]*)\}/g)) {
  const name = m[1];
  const capsSrc = m[3];
  let weights = [];
  const wght = /wght: \[(\d+), (\d+)/.exec(capsSrc);
  const list = /weights: \[([\d, ]+)\]/.exec(capsSrc);
  if (wght) {
    const lo = Math.ceil(parseInt(wght[1], 10) / 100) * 100;
    const hi = Math.floor(parseInt(wght[2], 10) / 100) * 100;
    for (let w = lo; w <= hi; w += 100) weights.push(w);
  } else if (list) {
    weights = list[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((w) => w > 0);
  }
  if (weights.length) entries.push({ name, weights });
}
if (!entries.some((e) => e.name === "Inter")) entries.push({ name: "Inter", weights: [] });

const curl = (url) => {
  try {
    return execFileSync("curl", ["-sSg", "--max-time", "30", "--cacert", CA, "-H", "User-Agent: " + LEGACY_UA, url], { maxBuffer: 8 * 1024 * 1024 }).toString();
  } catch { return ""; }
};

const table = {};
let misses = [];
for (const { name, weights } of entries) {
  const famQ = name.replace(/ /g, "+");
  for (const w of weights.length ? weights : [400]) {
    const css = curl(`https://fonts.googleapis.com/css2?family=${famQ}:wght@${w}`)
      || (w === 400 ? curl(`https://fonts.googleapis.com/css2?family=${famQ}`) : "");
    const hit = /url\(https:\/\/fonts\.gstatic\.com\/([^)]+\.ttf)\)/.exec(css);
    if (!hit) { misses.push(`${name}@${w}`); continue; }
    (table[name] ??= {})[w] = hit[1];
    process.stdout.write(`  ${name} ${w} → ${hit[1].slice(0, 60)}…\n`);
  }
}
if (misses.length) console.warn("no static instance URL for: " + misses.join(", ") + " (those weights keep the fallback roads)");

const today = new Date().toISOString().slice(0, 10);
const body =
  `/* BAKED-FONT-STATICS-BEGIN (generated ${today} by scripts/bake-font-statics.mjs — do not hand-edit) */\n` +
  `export const FONT_STATIC_TTF: Record<string, Record<number, string>> = ${JSON.stringify(table, null, 1).replace(/"(\d+)":/g, "$1:")};\n` +
  `/* BAKED-FONT-STATICS-END */`;

const utils = readFileSync(UTILS_PATH, "utf8");
const re = /\/\* BAKED-FONT-STATICS-BEGIN[\s\S]*?BAKED-FONT-STATICS-END \*\//;
if (!re.test(utils)) { console.error("bake-font-statics: markers not found in exportUtils.ts"); process.exit(1); }
const next = utils.replace(re, body);
if (process.argv.includes("--check")) {
  if (next !== utils) { console.error("bake-font-statics: table is stale — run node scripts/bake-font-statics.mjs"); process.exit(1); }
  console.log("bake-font-statics: table is current");
} else {
  writeFileSync(UTILS_PATH, next);
  console.log(`bake-font-statics: wrote ${Object.keys(table).length} families into exportUtils.ts`);
}
