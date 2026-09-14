#!/usr/bin/env node
/* check-shipped-shapes — no shipped design carries a bare imported
   silhouette (round 77).

   An imported silhouette is a `user:<id>` shape whose outline lives in the
   maker's own registry. A design that ships with the site (a named kit, a
   bundled preset) draws on machines that never held that registry, so any
   `user:` id it references must travel WITH its outline: a matching record
   under a `userShapes` array in the same file (GenConfig.userShapes). The
   owner's Hot Rod flames drew as a rounded rectangle on the landing page
   and in the app for exactly this reason — the id was there, the outline
   was not. Runs in prebuild beside the other guards. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/generator";
const ID = /^user:([a-z0-9]{1,32})(?:~flip)?$/;
const errors = [];

function walk(v, depth, refs, recs) {
  if (depth > 12 || v == null) return;
  if (typeof v === "string") { const m = ID.exec(v); if (m) refs.add(`user:${m[1]}`); return; }
  if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1, refs, recs); return; }
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "userShapes" && Array.isArray(x)) {
        for (const r of x) if (r && typeof r === "string" === false && typeof r.id === "string" && typeof r.d === "string" && Array.isArray(r.vb) && r.vb.length === 4) recs.add(r.id);
        continue;
      }
      walk(x, depth + 1, refs, recs);
    }
  }
}

let files = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
  const path = join(DIR, f);
  let doc;
  try { doc = JSON.parse(readFileSync(path, "utf8")); } catch (e) { errors.push(`${path}: unreadable JSON (${e.message})`); continue; }
  files++;
  const refs = new Set(), recs = new Set();
  walk(doc, 0, refs, recs);
  for (const id of refs) if (!recs.has(id)) errors.push(`${path}: references imported silhouette "${id}" without its outline — embed it under userShapes (save the design again on the current build) or promote it to a bundled silhouette in importedShapes.ts`);
}

if (errors.length) {
  console.error("shipped-shapes guard FAILED — a shipped design would draw a rectangle where its imported silhouette belongs:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`shipped-shapes guard: OK (${files} shipped JSON file${files === 1 ? "" : "s"}, every imported silhouette travels with its outline)`);
