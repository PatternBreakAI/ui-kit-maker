/* Component surface guard — runs before every build (npm prebuild).

   A component only exists for a maker if they can FIND it. There are exactly
   two places they look:

     the kit page  (src/ui/KitPage.tsx)  — the book, where a piece is shown,
                                           captioned and opened for editing
     the board tray (src/ui/Board.tsx)   — ASSET_GROUPS, where a piece is
                                           picked up and placed

   A piece registered in KIT_COMPONENTS but seated on neither surface is in
   LIMBO: it renders on the demo boards, it ships in the Unity and SVG
   exports, and nobody can reach it. It is worse than missing, because the
   staging bay hides it the moment the owner RELEASES it — release is what
   makes it disappear. The Ribbon Banner spent a round like that (round 60);
   the bottom nav bar and the booster card spent longer (round 64). This
   guard is the "never again": a new component now fails the build until it
   has a seat in the book and a tile in the tray.

   Registry-derived families (the semantic glyph rack, the glyph-button
   fleet) are not listed piece by piece anywhere — all three files map over
   the same registry, so adding a glyph seats it everywhere by construction.
   Those are checked by ANCHOR instead: the derivation must still be present
   in each file. Delete the tray group or the kit-page section and this
   fails, which is the same protection by other means. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const errors = [];

const model = read("src/generator/model.ts");
const board = read("src/ui/Board.tsx");
const page = read("src/ui/KitPage.tsx");

/* -- the catalog ----------------------------------------------------- */

const catalogBlock = /export const KIT_COMPONENTS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(model);
if (!catalogBlock) errors.push("KIT_COMPONENTS not found in src/generator/model.ts — the parser anchor moved; update scripts/check-component-surfaces.mjs.");
const catalog = catalogBlock ? [...catalogBlock[1].matchAll(/\{\s*id:\s*"([a-z0-9]+)"/g)].map((m) => m[1]) : [];
if (catalogBlock && catalog.length < 100)
  errors.push(`Only ${catalog.length} components parsed out of KIT_COMPONENTS — the entry shape changed; update scripts/check-component-surfaces.mjs.`);

/* -- surface 1: the board tray --------------------------------------- */

const trayBlock = /const ASSET_GROUPS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(board);
if (!trayBlock) errors.push("ASSET_GROUPS not found in src/ui/Board.tsx — the parser anchor moved; update scripts/check-component-surfaces.mjs.");
// tray entries are ids, optionally with a "~variant" render suffix
const inTray = new Set(trayBlock ? [...trayBlock[1].matchAll(/"([a-z0-9]+)(?:~[a-z]+)?"/g)].map((m) => m[1]) : []);

/* -- surface 2: the kit page ----------------------------------------- */

/* every way the book names a piece: a <Piece id="…">, a sprite-sheet
   catalog row rk("…"), a kitVisible("…") gate around a block, and the
   Piece-like helpers that take a bare id string */
const inPage = new Set();
for (const re of [/\bid="([a-z0-9]+)"/g, /\brk\("([a-z0-9]+)"/g, /\bkitVisible\("([a-z0-9]+)"/g, /\bid=\{"([a-z0-9]+)"\}/g]) {
  for (const m of page.matchAll(re)) inPage.add(m[1]);
}

/* -- registry-derived families: check the wiring, not the members ----- */

const derived = [
  { name: "the semantic glyph rack (LIVE_GLYPHS)", anchors: [
    ["src/generator/model.ts", model, /\.\.\.LIVE_GLYPHS\.map/],
    ["src/ui/Board.tsx (ASSET_GROUPS)", trayBlock?.[1] ?? "", /LIVE_GLYPHS\.map/],
    ["src/ui/KitPage.tsx", page, /LIVE_GLYPHS\.filter/],
  ] },
  { name: "the glyph-button fleet (GLYPH_BUTTONS)", anchors: [
    ["src/generator/model.ts", model, /\.\.\.GLYPH_BUTTONS\.map/],
    ["src/ui/Board.tsx (ASSET_GROUPS)", trayBlock?.[1] ?? "", /GLYPH_BUTTONS\.map/],
    ["src/ui/KitPage.tsx", page, /GLYPH_BUTTONS\.filter/],
  ] },
];
for (const fam of derived) {
  for (const [where, src, re] of fam.anchors) {
    if (!re.test(src))
      errors.push(`${fam.name} is no longer derived in ${where}.\n  Either it lost its surface (seat it, or the whole family goes invisible) or the derivation was rewritten — update scripts/check-component-surfaces.mjs to match.`);
  }
}

/* -- deliberate exemptions ------------------------------------------- */

/* Every entry here is a piece the catalog registers on purpose that a maker
   is not meant to pick from a tray or find in the book. Each one states WHY.
   This list is meant to stay empty or near it: "it has no seat yet" is not a
   reason, it is the bug. */
const EXEMPT = new Map([
  // (none — every registered component is reachable from both surfaces)
]);

/* -- diff ------------------------------------------------------------ */

for (const id of catalog) {
  if (EXEMPT.has(id)) continue;
  const missing = [];
  if (!inTray.has(id)) missing.push("the board tray (ASSET_GROUPS in src/ui/Board.tsx)");
  if (!inPage.has(id)) missing.push("the kit page (src/ui/KitPage.tsx)");
  if (!missing.length) continue;
  errors.push(
    `"${id}" is registered in KIT_COMPONENTS but has no seat in ${missing.join(" or ")}.\n` +
    `  A piece with no surface still renders on boards and ships in exports, so nobody notices until the owner asks where it went.\n` +
    `  Fix: give it a tile in ASSET_GROUPS (plus a SEARCH_TERMS entry) and a card in the matching kit-page chapter, gated with kitVisible("${id}", releases, false) while it is staged.\n` +
    `  If it genuinely must stay off both surfaces, add it to EXEMPT in scripts/check-component-surfaces.mjs with the reason.`);
}

/* an exemption that stops being true is its own kind of rot */
for (const [id, why] of EXEMPT) {
  if (!catalog.includes(id)) errors.push(`EXEMPT lists "${id}", which is no longer in KIT_COMPONENTS.\n  Fix: drop the entry from scripts/check-component-surfaces.mjs.`);
  else if (inTray.has(id) && inPage.has(id)) errors.push(`EXEMPT lists "${id}" (${why}), but it now has both surfaces.\n  Fix: drop the entry from scripts/check-component-surfaces.mjs.`);
}

/* -- verdict --------------------------------------------------------- */

if (errors.length) {
  console.error("✗ components without a surface:\n");
  errors.forEach((e) => console.error("• " + e + "\n"));
  process.exit(1);
}
console.log(`✓ every component has a surface — ${catalog.length} registered, all reachable from the kit page and the board tray${EXEMPT.size ? ` (${EXEMPT.size} exempt)` : ""}`);
