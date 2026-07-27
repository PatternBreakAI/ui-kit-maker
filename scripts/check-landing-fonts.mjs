/* Landing font roster guard — runs before every build (npm prebuild).
   The homepage self-hosts its webfonts (no runtime Google Fonts request),
   so the set of @font-face rules in landing.css must exactly cover what
   the page renders:

     required = every "font" value in the authored preset JSONs that
                engine.ts ships to the homepage
              ∪ the FONT_CHIPS the hero offers
              ∪ the generator's default face (plain-preset reel entries)

   A required face with no @font-face = broken type on the live reel
   (falls back to a system font). A hosted face nothing requires = dead
   bytes on every visit. Both fail the build; the messages below say
   which file to touch. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const errors = [];

/* -- required faces ------------------------------------------------- */

/* Authored presets the homepage can render (reel, gallery, how-it-works)
   are exactly the JSONs engine.ts imports. */
const engineSrc = read("src/marketing/engine.ts");
const presetFiles = [...engineSrc.matchAll(/from "@\/generator\/(preset-[a-z0-9-]+\.json)"/g)].map((m) => m[1]);
if (!presetFiles.length) errors.push("No preset imports found in src/marketing/engine.ts — the parser anchor moved; update scripts/check-landing-fonts.mjs.");

const required = new Map(); // face -> why
const collectFonts = (node, out) => {
  if (Array.isArray(node)) { node.forEach((v) => collectFonts(v, out)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "font" && typeof v === "string" && v.trim()) out.add(v.trim());
      else collectFonts(v, out);
    }
  }
};
for (const f of presetFiles) {
  const faces = new Set();
  collectFonts(JSON.parse(read(join("src/generator", f))), faces);
  faces.forEach((face) => required.set(face, (required.get(face) ? required.get(face) + ", " : "") + f));
}

/* The font chips offered on the hero. */
const landingSrc = read("src/marketing/landingInit.ts");
const chipsMatch = landingSrc.match(/const FONT_CHIPS = \[([^\]]+)\]/);
if (!chipsMatch) errors.push("FONT_CHIPS const not found in src/marketing/landingInit.ts — the parser anchor moved; update scripts/check-landing-fonts.mjs.");
else for (const m of chipsMatch[1].matchAll(/"([^"]+)"/g)) required.set(m[1], (required.get(m[1]) ? required.get(m[1]) + ", " : "") + "FONT_CHIPS");

/* The generator's default face — what plain-preset reel entries render with. */
const defMatch = read("src/generator/model.ts").match(/font:\s*"([^"]+)",\s*customFonts/);
if (!defMatch) errors.push("Default font not found in src/generator/model.ts — the parser anchor moved; update scripts/check-landing-fonts.mjs.");
else required.set(defMatch[1], (required.get(defMatch[1]) ? required.get(defMatch[1]) + ", " : "") + "default config");

/* -- hosted faces --------------------------------------------------- */

const css = read("src/styles/landing.css");
const hosted = new Map(); // face -> woff2 basename
for (const rule of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
  const fam = rule.match(/font-family:\s*'([^']+)'/)?.[1];
  const url = rule.match(/url\("([^"]+)"\)/)?.[1];
  if (fam && url) hosted.set(fam, basename(url));
}

/* Chrome CSS may also use a hosted face directly (e.g. "Bungee" on the
   step badge) — such a face is in use even if no preset needs it. */
const chromeCss = css.replace(/@font-face\s*\{[^}]*\}/g, "");
const chromeFaces = new Set([...chromeCss.matchAll(/font-family:[^;}]*?"([^"]+)"/g)].map((m) => m[1]));

/* -- diff ----------------------------------------------------------- */

for (const [face, why] of required) {
  if (!hosted.has(face))
    errors.push(`Missing font "${face}" (needed by: ${why}).\n  Fix: add its latin woff2 to src/marketing/assets/fonts/ and an @font-face to src/styles/landing.css (see the existing block).`);
}
for (const [face, file] of hosted) {
  if (!required.has(face) && !chromeFaces.has(face))
    errors.push(`Orphaned font "${face}" — hosted but nothing on the landing uses it.\n  Fix: remove its @font-face from src/styles/landing.css and delete src/marketing/assets/fonts/${file}.`);
}

/* Axis coverage: a face whose roster entry (model.ts GAME_FONTS) declares
   a wdth axis can be width-dialed by presets — its @font-face must carry a
   font-stretch range (and the woff2 behind it the wdth axis; the css2 URL
   in the fix message serves that file). Fredoka shipped wght-only once and
   authored width silently no-opped on the homepage — never again. */
const modelSrc = read("src/generator/model.ts");
for (const [face] of hosted) {
  const entry = modelSrc.match(new RegExp(`\\{ name: "${face}"[^\\n]*`));
  if (!entry) continue;
  const hasWdth = /caps:\s*\{[^}]*wdth:/.test(entry[0]);
  const rule = css.match(new RegExp(`@font-face\\s*\\{[^}]*'${face}'[^}]*\\}`));
  if (hasWdth && rule && !/font-stretch:/.test(rule[0]))
    errors.push(`Face "${face}" has a wdth axis in the app's roster, but its landing @font-face declares no font-stretch range — authored width will silently no-op.\n  Fix: self-host the multi-axis file (css2?family=${face.replace(/ /g, "+")}:wdth,wght@... latin subset) and add "font-stretch: <min>% <max>%;" to its @font-face.`);
}

const fontsDir = "src/marketing/assets/fonts";
const files = readdirSync(join(root, fontsDir)).filter((f) => f.endsWith(".woff2"));
const referenced = new Set(hosted.values());
for (const [face, file] of hosted) {
  if (!existsSync(join(root, fontsDir, file)))
    errors.push(`@font-face for "${face}" points at ${fontsDir}/${file}, which does not exist.`);
}
for (const f of files) {
  if (!referenced.has(f))
    errors.push(`Orphaned file ${fontsDir}/${f} — no @font-face in landing.css references it.\n  Fix: delete it (or add the @font-face if a preset needs it).`);
}

/* -- verdict -------------------------------------------------------- */

if (errors.length) {
  console.error("✗ landing font roster out of step:\n");
  errors.forEach((e) => console.error("• " + e + "\n"));
  process.exit(1);
}
console.log(`✓ landing fonts in step — ${hosted.size} hosted face(s) cover ${required.size} required (${[...hosted.keys()].join(", ")})`);
