import { fontByName } from "./model";

// Loads a Google Font stylesheet on demand (once per family). The app runs on
// the open web (GitHub Pages / localhost), so fonts.googleapis.com is available.
export function ensureFont(name: string) {
  const def = fontByName(name);
  if (!def.css) return; // Inter ships bundled
  const id = "gf-" + def.css.replace(/[^a-z0-9]/gi, "");
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${def.css}&display=swap`;
  document.head.appendChild(link);
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
