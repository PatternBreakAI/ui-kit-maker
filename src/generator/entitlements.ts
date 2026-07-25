/* ── Tiers — capabilities as data ────────────────────────────────────
   One table answers every "can they…?" question. The tier comes from live
   auth state: guest (no session), free (signed in), student and pro
   (whichever plan_id the Stripe webhook wrote).

   The paid tiers are enforced where it counts. `/api/export` reads plan_id
   from the database and checks the requested artifact against
   EXPORT_KINDS below, so a tampered client gets a 403 rather than a kit.
   The caps here still drive the UI — what looks locked, what the zoom
   slider allows — which is presentation, not security.

   WHY THE STUDENT LINE FALLS WHERE IT DOES. Student keeps everything you
   need to LEARN and to build a portfolio: the full component kit, every
   preset, cloud saves, the SVG pack and the HTML export. What it doesn't
   include are the SHIPPING artifacts — the engine kit with its Unity
   importer and nine-slice manifest, and the game kit sprite atlas. Those
   are what a studio putting a product on a store needs, and that's the
   honest place to draw the line: learning is discounted, shipping isn't.

   A per-week download cap was considered and rejected. Students iterate —
   design, export, spot a wrong button, fix, export again — so a weekly cap
   breaks the real workflow on day one, while someone sharing files only
   ever needs one download. It would punish the honest case and miss the
   abusive one. Bulk harvesting is already handled by the per-hour rate
   limit in /api/export. */

export type Tier = "guest" | "free" | "student" | "pro";

/** Everything /api/export knows how to issue. */
export type ExportKind = "svg" | "html" | "sheet" | "gamekit" | "engine";

export type TierCaps = {
  /** Canvas zoom ceiling (1 = 100%). Vectors scale forever — the cap is the
      hi-res-screenshot deterrent for non-paying tiers. */
  zoomMax: number;
  /** How many starter presets are usable; the rest render locked. */
  presetLimit: number;
  /** How many kit components render; the rest show as locked teasers. */
  kitComponents: number;
  /** PNG export scale ceiling. */
  pngScaleMax: number;
  /** Any vector-grade export at all — drives whether a menu row reads
      locked. Which ones specifically is EXPORT_KINDS. */
  vectorExports: boolean;
};

/** Which artifacts each tier may take. Enforced server-side. */
export const EXPORT_KINDS: Record<Tier, ExportKind[]> = {
  guest: [],
  free: [],
  student: ["svg", "html", "sheet"],
  pro: ["svg", "html", "sheet", "gamekit", "engine"],
};

export const TIER_CAPS: Record<Tier, TierCaps> = {
  guest:   { zoomMax: 1.0, presetLimit: 4, kitComponents: 5, pngScaleMax: 1, vectorExports: false },
  free:    { zoomMax: 1.5, presetLimit: 6, kitComponents: Infinity, pngScaleMax: 1, vectorExports: false },
  student: { zoomMax: 1.5, presetLimit: Infinity, kitComponents: Infinity, pngScaleMax: 2, vectorExports: true },
  pro:     { zoomMax: 4,   presetLimit: Infinity, kitComponents: Infinity, pngScaleMax: 4, vectorExports: true },
};

export function capsOf(tier: Tier): TierCaps { return TIER_CAPS[tier]; }

/** May this tier take this artifact? The client asks to shape the UI; the
    server asks again before issuing anything. */
export function canExport(tier: Tier, kind: ExportKind): boolean {
  return EXPORT_KINDS[tier].includes(kind);
}

/** The one-line upgrade story for each gate, in the product's voice. */
export const UPGRADE_LINES: Record<Tier, string> = {
  guest: "Sign in free — unlock the full kit, 150% zoom and two preset packs.",
  free: "Go Pro — every preset, vector exports and unlimited zoom.",
  student: "The engine and game kits are the shipping formats — those come with Pro.",
  pro: "",
};
