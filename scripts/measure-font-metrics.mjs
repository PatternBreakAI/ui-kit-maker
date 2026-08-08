#!/usr/bin/env node
/* Measures REAL per-glyph advances for every GAME_FONTS face and bakes them
   into src/generator/fontMetricsData.ts.

   Why: the engine laid text out from per-face `factor` estimates until the
   face loaded, then from each browser's own measureText — so Safari and
   Chrome disagreed about every label's width, and every hard boundary
   downstream (canvas frame, filter regions, fit-down) inherited the
   disagreement as cut-off text. Advances measured once, from the font files
   themselves, are the same numbers in every browser: layout becomes
   deterministic AND correct everywhere, first paint included.

   Run: `npm run metrics:fonts` (starts a vite dev server if one isn't
   already on the port — the probe imports the live registry from
   /src/generator/model.ts through it, so the font list can never drift).
   Re-run whenever a face is added to GAME_FONTS or a weight cap changes.

   Requires a Chromium binary: CHROMIUM_PATH env, /opt/pw-browsers/chromium,
   or whatever playwright-core finds on its own. */

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "generator", "fontMetricsData.ts");
const PORT = Number(process.env.METRICS_PORT || 5199);

/* chars 32–126: everything a kit label can type from a US keyboard. Chars
   outside the range fall back to `def` (or full-width for CJK) at runtime. */
const FIRST = 32, LAST = 126;
const ZH_SAMPLE = "游戏开始按钮加载中设置关闭确定取消";
const KERN_SAMPLES = ["PLAY", "SHADOW KNIGHT", "LEVEL 99!", "Warlord's Vault", "AVATAR", "Type something"];

async function serverUp(port) {
  try { const r = await fetch(`http://localhost:${port}/`); return r.ok; } catch { return false; }
}

async function main() {
  let devServer = null;
  if (!(await serverUp(PORT))) {
    console.log(`no dev server on :${PORT} — starting one`);
    devServer = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: false });
    const t0 = Date.now();
    while (!(await serverUp(PORT))) {
      if (Date.now() - t0 > 40000) throw new Error("vite dev server never came up");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  let browser = null;
  const candidates = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium", undefined].filter((c, i, a) => a.indexOf(c) === i);
  for (const executablePath of candidates) {
    try { browser = await chromium.launch(executablePath ? { executablePath } : {}); break; } catch { /* next candidate */ }
  }
  if (!browser) throw new Error("no Chromium found — set CHROMIUM_PATH");

  try {
    const page = await browser.newPage();
    /* Sandboxed sessions can't reach Google Fonts from the browser's own
       network stack (egress proxy), but Node's fetch can (NODE_USE_ENV_PROXY
       — the npm script sets it). Relay the two font hosts through Node; the
       browser's UA rides along so css2 serves the same woff2 subsets a real
       Chrome gets. Outside a sandbox this is a transparent passthrough. */
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      try {
        const req = route.request();
        const r = await fetch(req.url(), { headers: { "user-agent": req.headers()["user-agent"] ?? "" } });
        route.fulfill({
          status: r.status,
          body: Buffer.from(await r.arrayBuffer()),
          headers: {
            "content-type": r.headers.get("content-type") ?? "application/octet-stream",
            "access-control-allow-origin": "*", // font fetches are CORS requests
          },
        });
      } catch { route.abort(); }
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });

    const registry = await page.evaluate(() =>
      import("/src/generator/model.ts").then((m) =>
        m.GAME_FONTS.map((f) => ({ name: f.name, css: f.css, factor: f.factor, caps: f.caps, lang: f.lang }))));
    console.log(`registry: ${registry.length} faces`);

    // one stylesheet per Google family, all in flight together
    await page.evaluate((cssList) => Promise.all(cssList.map((css) => new Promise((res) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${css}&display=swap`;
      link.onload = () => res(null);
      link.onerror = () => res(null); // reported later per-face by fonts.check
      document.head.appendChild(link);
    }))), registry.map((f) => f.css).filter(Boolean));

    /* weight stops: static families measure every listed weight; variable
       ranges measure min/default/max plus 400 & 700 so runtime interpolation
       stays piecewise-honest across the slider's travel. */
    const combos = [];
    for (const f of registry) {
      const caps = f.caps ?? {};
      const stops = caps.weights?.length
        ? [...caps.weights].sort((a, b) => a - b)
        : [...new Set([caps.wght[0], caps.wght[2], 400, 700, caps.wght[1]]
            .filter((w) => w >= caps.wght[0] && w <= caps.wght[1]))].sort((a, b) => a - b);
      combos.push({
        name: f.name,
        family: f.name === "Inter" ? "Inter Variable" : f.name, // bundled Inter registers as "Inter Variable"
        stops,
        italic: !!caps.italic,
        zh: f.lang === "zh",
      });
    }

    const result = await page.evaluate(async ({ combos, FIRST, LAST, ZH_SAMPLE, KERN_SAMPLES }) => {
      const ctx = document.createElement("canvas").getContext("2d");
      const chars = [];
      for (let c = FIRST; c <= LAST; c++) chars.push(String.fromCharCode(c));
      const ascii = chars.join("");
      const out = [], failures = [], kernReport = [];

      const measureArray = (spec) => {
        ctx.font = spec;
        // width at 100px → milli-em is width × 10
        return chars.map((ch) => Math.round(ctx.measureText(ch).width * 10));
      };

      /* fonts.check() answers true for families that were never registered
         (system fallback "counts") — useless as a loaded-verdict. Two honest
         signals instead: fonts.load() returns the matched FontFace list
         (empty = family unknown), and any face whose advances exactly equal
         the fallback's 95-number signature did not really paint. */
      const baseline = measureArray('400 100px "__ukm_no_such_face__"').join(",");

      for (const combo of combos) {
        const sample = ascii + (combo.zh ? ZH_SAMPLE : "");
        const face = { name: combo.name, stops: combo.stops, adv: [], ital: combo.italic ? [] : undefined, def: 0 };
        for (const weight of combo.stops) {
          for (const italic of combo.italic ? [false, true] : [false]) {
            const spec = `${italic ? "italic " : ""}${weight} 100px "${combo.family}"`;
            let ok = false;
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
              try {
                const matched = await Promise.race([
                  document.fonts.load(spec, sample),
                  new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
                ]);
                ok = matched.length > 0;
              } catch { /* retry once, then fail loudly */ }
            }
            const arr = ok ? measureArray(spec) : null;
            if (!arr || arr.join(",") === baseline) { failures.push(spec); continue; }
            (italic ? face.ital : face.adv).push(arr);
            if (!italic && weight === combo.stops[Math.floor(combo.stops.length / 2)]) {
              // kerning honesty check at the middle stop: painted width vs per-char sum
              for (const s of KERN_SAMPLES) {
                const painted = ctx.measureText(s).width * 10;
                let sum = 0;
                for (const ch of s) {
                  const i = ch.charCodeAt(0) - FIRST;
                  sum += i >= 0 && i < arr.length ? arr[i] : 0;
                }
                if (sum > 0) kernReport.push({ face: combo.name, s, ratio: painted / sum });
              }
            }
          }
        }
        if (combo.zh) {
          ctx.font = `${combo.stops[0]} 100px "${combo.family}"`;
          // widest sampled han glyph — the safe side for cursive faces whose
          // han advances vary; live measurement refines once the face loads
          face.def = Math.max(...[...ZH_SAMPLE].map((ch) => Math.round(ctx.measureText(ch).width * 10)));
        } else if (face.adv.length) {
          const a = face.adv[0];
          let sum = 0;
          for (let c = 65; c <= 90; c++) sum += a[c - FIRST];
          face.def = Math.round(sum / 26); // A–Z mean: sane for stray accented caps
        }
        out.push(face);
      }
      return { out, failures, kernReport };
    }, { combos, FIRST, LAST, ZH_SAMPLE, KERN_SAMPLES });

    if (result.failures.length) {
      console.error("FACES THAT NEVER LOADED — refusing to bake a partial table:");
      result.failures.forEach((f) => console.error("  " + f));
      process.exitCode = 1;
      return;
    }

    const worstKern = result.kernReport.sort((a, b) => a.ratio - b.ratio).slice(0, 5);
    console.log("tightest kerning (painted ÷ per-char sum — sums may only over-reserve):");
    worstKern.forEach((k) => console.log(`  ${k.face} "${k.s}": ${k.ratio.toFixed(4)}`));

    // vs the old estimates — the story this table replaces
    console.log("factor drift (old estimate vs measured A–Z mean, worst first):");
    registry
      .map((f) => {
        const face = result.out.find((o) => o.name === f.name);
        return { name: f.name, old: f.factor, real: face ? face.def / 1000 : NaN };
      })
      .sort((a, b) => Math.abs(b.real - b.old) / b.old - Math.abs(a.real - a.old) / a.old)
      .slice(0, 8)
      .forEach((d) => console.log(`  ${d.name}: factor ${d.old} vs measured ${d.real.toFixed(3)}`));

    /* base36, 3 chars per advance (milli-em, 0–46655): 95 advances = one
       285-char string. Compact enough to ship, diffable enough to review. */
    const enc = (arr) => arr.map((v) => Math.max(0, Math.min(46655, v)).toString(36).padStart(3, "0")).join("");
    const lines = result.out.map((f) => {
      const parts = [
        `stops: [${f.stops.join(", ")}]`,
        `def: ${f.def}`,
        `adv: [${f.adv.map((a) => `"${enc(a)}"`).join(", ")}]`,
      ];
      if (f.ital) parts.push(`ital: [${f.ital.map((a) => `"${enc(a)}"`).join(", ")}]`);
      return `  ${JSON.stringify(f.name)}: { ${parts.join(", ")} },`;
    });

    const file = `/* GENERATED by scripts/measure-font-metrics.mjs — do not hand-edit.
   Regenerate with \`npm run metrics:fonts\` after changing GAME_FONTS.

   Per-char advances (chars 32–126) for every registry face, measured once
   from the real font files in headless Chromium and shipped as data so
   every browser lays labels out from the SAME, CORRECT numbers — before
   the face even loads. Values are milli-em, base36, 3 chars per glyph.
   \`stops\` are the measured weights (runtime interpolates between them);
   \`ital\` holds true-italic advances for faces that ship italic files;
   \`def\` covers chars outside the table (widest sampled han glyph for the
   Chinese faces, A–Z mean elsewhere). */

export interface FaceMetrics {
  /** measured weight stops, ascending */
  stops: number[];
  /** per-stop upright advances, base36 ×3 chars, chars 32–126 */
  adv: string[];
  /** per-stop true-italic advances (only faces with real italic files) */
  ital?: string[];
  /** milli-em fallback for chars outside the table */
  def: number;
}

export const FONT_METRICS: Record<string, FaceMetrics> = {
${lines.join("\n")}
};
`;
    writeFileSync(OUT, file);
    console.log(`wrote ${OUT} (${result.out.length} faces, ${(file.length / 1024).toFixed(1)} KB)`);
  } finally {
    await browser.close();
    if (devServer) devServer.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
