import { fontByName } from "./model";

// Loads a Google Font stylesheet on demand (once per family). The app runs on
// the open web (GitHub Pages / localhost), so fonts.googleapis.com is available.
export function ensureFont(name: string) {
  const def = fontByName(name);
  if (!def.css) return; // Inter ships bundled
  const id = "gf-" + def.css.replace(/[^a-z0-9]/gi, "");
  if (document.getElementById(id)) {
    kickLoad(name);
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${def.css}&display=swap`;
  // a stylesheet alone doesn't fetch the FACE until something styled with
  // it lays out — and Safari defers that fetch longer than any engine, so
  // the renderer's estimate-fallback window (wrong widths, cut-off text,
  // layout pops on the kit page) stretches for seconds there. Ask for the
  // face bytes the moment the css arrives.
  link.onload = () => kickLoad(name);
  document.head.appendChild(link);
}

function kickLoad(family: string) {
  try { void document.fonts?.load?.(`16px "${family.replace(/"/g, "")}"`); } catch { /* older engines: the lazy path still works */ }
}

/* ── round 45 · B1: looks land only after their faces do ─────────────────
   Switching looks used to commit the config the instant a card was clicked,
   while the new face was still a stylesheet in flight — the kit painted in
   fallback letterforms against the REAL face's baked widths, then popped
   when the bytes arrived ("the fonts behave SUPER WEIRDLY when clicking
   between looks", owner). These helpers let the look-switch pipeline wait
   for the faces first, bounded so a dead CDN can never wedge the click. */

/** Is this family actually usable right now? fonts.check() alone lies —
 *  it answers TRUE for a family with nothing registered (the pre-stylesheet
 *  window), so "ready" = registered in document.fonts AND check passes
 *  (the same recipe the renderer's ink map uses). */
export function fontReady(name: string): boolean {
  try {
    if (!fontByName(name).css) return true; // Inter ships bundled
    const fam = name.replace(/["']/g, "").toLowerCase();
    const registered = [...document.fonts].some((f) => f.family.replace(/['"]/g, "").toLowerCase() === fam);
    return registered && document.fonts.check(`16px "${name.replace(/"/g, "")}"`);
  } catch { return true; /* engines without FontFaceSet iteration: never block */ }
}

/** Resolves once the family's Google stylesheet has landed (its @font-face
 *  rules exist — before that, document.fonts.load() has nothing to match
 *  and resolves empty immediately). Errors resolve too: fallback stands. */
function styleSheetReady(name: string): Promise<void> {
  const def = fontByName(name);
  if (!def.css) return Promise.resolve();
  ensureFont(name); // idempotent — creates the <link> if it's not there yet
  const id = "gf-" + def.css.replace(/[^a-z0-9]/gi, "");
  const link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link || link.sheet) return Promise.resolve();
  return new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
}

/** Ensure + await a set of families. Resolves when every face is usable or
 *  after `timeoutMs` — the caller commits either way; a face that arrives
 *  late still re-renders through the fonts loadingdone listener. */
const faceGaveUp = new Set<string>(); // families that timed out once — never taxed twice
export async function awaitFonts(names: string[], timeoutMs = 2400): Promise<void> {
  const wanted = [...new Set(names)].filter((n) => typeof n === "string" && !!n && !faceGaveUp.has(n) && !fontReady(n));
  if (!wanted.length) return;
  const timeout = new Promise<void>((r) => window.setTimeout(r, timeoutMs));
  const all = Promise.all(wanted.map(async (n) => {
    await styleSheetReady(n);
    const fam = n.replace(/"/g, "");
    // cover the weights kits actually render with — a static multi-weight
    // family registers one face per weight, and loading only 400 would
    // leave the 700/900 the label wears swapping in late
    for (const spec of [`16px "${fam}"`, `700 16px "${fam}"`, `900 16px "${fam}"`, `italic 700 16px "${fam}"`]) {
      try { await document.fonts?.load?.(spec); } catch { /* fallback stands */ }
    }
  })).then(() => undefined);
  await Promise.race([all, timeout]);
  // a family still not usable hit the timeout — a dead CDN shouldn't tax
  // every later switch, and if it does land the loadingdone re-render has it
  for (const n of wanted) if (!fontReady(n)) faceGaveUp.add(n);
}

/* Every family a saved kit document speaks: the master face + list face,
   each piece's pinned design, and every state fork (states carry their own
   faces since the per-state type round). Surfaces that render OTHER makers'
   kits (gallery cards, release desk) must load all of them, or the
   thumbnail wears a fallback instead of the author's design. Structural on
   purpose — docs arrive as unknown JSON, and a malformed field should skip,
   not throw. */
export function ensureDocFonts(cfg: unknown, kitDesigns?: unknown): void {
  const fams = new Set<string>();
  const addType = (t: unknown) => {
    const ty = t as { font?: unknown; listFont?: unknown } | null | undefined;
    if (typeof ty?.font === "string") fams.add(ty.font);
    if (typeof ty?.listFont === "string") fams.add(ty.listFont);
  };
  const addDesign = (d: unknown) => {
    const dd = d as { type?: unknown; stateDesigns?: Record<string, { type?: unknown } | null> } | null | undefined;
    if (!dd) return;
    addType(dd.type);
    for (const sd of Object.values(dd.stateDesigns ?? {})) addType(sd?.type);
  };
  addDesign(cfg);
  for (const kd of Object.values((kitDesigns ?? {}) as Record<string, unknown>)) addDesign(kd);
  fams.forEach((f) => ensureFont(f));
}
