#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   THE STALE-MEMO GUARD (round 73d)

   This class of bug bit the owner TWICE in one afternoon, the same way
   both times, and neither time was visible in a diff:

     "uploaded picture not showing up ... it didn't even show up when I
      reloaded and navigated away from the page, only when I clicked that
      checkbox"
     "the logo effects don't take place in real-time ... they seemed to
      take effect when I navigated away and navigated back"

   Both were ONE mistake: a useMemo that renders a kit piece, whose
   dependency list holds some of the per-piece maps but not all of them.
   The render is then frozen at whatever the missing map said on first
   paint, and the only way to see a change is to disturb a dependency that
   IS listed — which is exactly why toggling an unrelated checkbox, or
   navigating away and back, "fixed" it.

   The invariant, stated plainly: these maps all feed renderKit for the
   SAME piece, so a memo that watches one of them must watch all of them.
   Watching only some is never correct; it is only ever a bug that has not
   been noticed yet.

   The guard reads dependency arrays and holds them to that. It is
   deliberately dumb — it does not parse JSX or resolve scopes, it looks at
   the arrays themselves — because the failure it prevents is dumb too.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["src/ui/CanvasView.tsx", "src/ui/Board.tsx", "src/ui/KitPage.tsx", "src/ui/Panel.tsx"];

/* The per-piece maps renderKit reads. `kitSlotVals` is the sentinel: it is
   the map every piece-rendering memo already lists, so its presence is a
   reliable marker that this array feeds a piece render. */
const SENTINEL = "kitSlotVals";
const REQUIRED = ["kitPics", "kitPicFx"];

const problems = [];

for (const rel of FILES) {
  let src;
  try { src = readFileSync(join(ROOT, rel), "utf8"); } catch { continue; }
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    /* A dependency array, in either shape the codebase actually uses:
         }, [a, b, c]);          — the array closing the same line
         [a, b, c]               — the array alone on its own line
       The first cut of this guard only matched the first shape and so
       waved through the very file the bug lived in. A guard that has
       never been watched to FAIL is not a guard; this one was
       negative-tested by reintroducing the real bug. */
    const t = line.trim();
    let deps = null;
    const inline = /^[)}\]],\s*\[(.*)\]\s*\)?;?$/.exec(t);
    if (inline) deps = inline[1];
    else {
      const alone = /^\[(.*)\]\s*\)?;?,?$/.exec(t);
      if (alone) deps = alone[1];
    }
    if (deps === null) return;
    if (!deps.includes(SENTINEL)) return;
    const missing = REQUIRED.filter((r) => !deps.includes(r));
    if (missing.length) problems.push({ rel, line: i + 1, missing, deps: deps.slice(0, 90) });
  });
}

if (problems.length) {
  console.error("✗ a piece-rendering memo is missing per-piece maps:\n");
  for (const p of problems) {
    console.error(`• ${p.rel}:${p.line} lists ${SENTINEL} but not ${p.missing.join(" or ")}`);
    console.error(`  deps: [${p.deps}...]`);
  }
  console.error(`
  These maps all feed renderKit for the same piece. A memo that watches one
  and not the others renders once and then goes deaf: the piece freezes at
  whatever the unwatched map said on first paint, and only an unrelated
  edit appears to "fix" it. That is the exact bug the owner reported twice.

  Fix: add the missing map to the dependency array. If a map genuinely
  cannot matter to this render, say so in a comment on the line above and
  add the file to SKIP in scripts/check-live-dials.mjs with the reason.`);
  process.exit(1);
}

console.log("✓ every piece-rendering memo watches all the per-piece maps");
