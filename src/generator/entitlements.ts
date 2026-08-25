/* ── Tiers — capabilities as data ────────────────────────────────────
   One table answers every "can they…?" question. The tier comes from live
   auth state: guest (no session), free (signed in), student and pro
   (whichever plan_id the Stripe webhook wrote).

   The paid tiers are enforced where it counts. `/api/export` reads plan_id
   from the database and checks the requested artifact against
   EXPORT_KINDS below, so a tampered client gets a 403 rather than a kit.
   The caps here still drive the UI — what looks locked, what the zoom
   slider allows — which is presentation, not security.

   STUDENT AND PRO HAVE THE SAME CAPABILITY. That is deliberate, and it
   reverses an earlier design that gave students less zoom, smaller PNGs
   and no engine kit. Restricting the OUTPUT punished exactly the people
   the price exists for: a capstone project, a game jam and a class
   assignment all need the engine kit specifically. So the line moved off
   capability and onto the LICENCE, which is how education pricing works
   everywhere else — the student gets the whole tool, and the grant that
   ships with their exports covers coursework, portfolio and non-commercial
   release. Shipping something commercially is what Pro is for.

   That difference is not enforceable in code and is not meant to be. It
   lives in LICENCE_GRANT below, is stamped into every export by
   /api/export, and is stated in the Terms. Enforcement is the same as
   every other education licence in the industry: the artifact carries its
   own terms. */

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
  /** PNG export scale ceiling. Gate Round: PNG export itself is paid-only
      now — the guest/free values only label the locked row. */
  pngScaleMax: number;
  /** Any vector-grade export at all — drives whether a menu row reads
      locked. Which ones specifically is EXPORT_KINDS. */
  vectorExports: boolean;
};

/** Which artifacts each tier may take. Enforced server-side. Student and
    pro are identical here; they differ in LICENCE_GRANT, not in this map.

    GATE ROUND (owner mandate, 2026-08-17): every generated export is
    paid. The free tier's row went from ["engine"] (the old three-piece
    starter, Unity bridge round) to empty — what a free account keeps is
    the project/settings JSON (workflow, not a deliverable), community
    publishing, and the stock Unity TEST KIT: one canned, admin-blessed
    free-kit zip served by /api/test-kit, the same fixed artifact for
    everyone, never their own design. Proving the import pipeline is
    free; exporting YOUR kit is the paid unlock. */
export const EXPORT_KINDS: Record<Tier, ExportKind[]> = {
  guest: [],
  free: [],
  student: ["svg", "html", "sheet", "gamekit", "engine"],
  pro: ["svg", "html", "sheet", "gamekit", "engine"],
};

export const TIER_CAPS: Record<Tier, TierCaps> = {
  guest:   { zoomMax: 1.0, presetLimit: 4, kitComponents: 5, pngScaleMax: 1, vectorExports: false },
  free:    { zoomMax: 1.5, presetLimit: 9, kitComponents: Infinity, pngScaleMax: 1, vectorExports: false },
  student: { zoomMax: 4,   presetLimit: Infinity, kitComponents: Infinity, pngScaleMax: 4, vectorExports: true },
  pro:     { zoomMax: 4,   presetLimit: Infinity, kitComponents: Infinity, pngScaleMax: 4, vectorExports: true },
};

/** What the exported files may be USED for. This — not the feature list —
    is the difference between the two paid tiers. Mirrored verbatim in the
    licence block /api/export stamps into every download; keep the two in
    step, and keep both in step with Terms §5.6. */
export const LICENCE_GRANT: Record<"free" | "student" | "pro", string> = {
  /* Gate Round: /api/export never grants the free plan any more, so no
     licence is stamped for it — this line now describes the one thing a
     free account can download (the stock free kit, whose terms ship
     inside the blessed zip itself: ship anything, commercial included,
     don't resell the assets as a pack). The STUDENT line staying
     non-commercial is not a contradiction — education pricing buys the
     WHOLE tool for their OWN designs; the test kit is one stock look,
     free for everyone. */
  free:
    "The stock Unity test kit is a free kit: use it in anything you ship, " +
    "commercial projects included (its licence rides inside the ZIP). " +
    "Exporting your own designs is the paid unlock.",
  student:
    "Coursework, portfolio, personal projects and non-commercial releases. " +
    "Selling a product built with these assets, or shipping them in anything " +
    "that earns revenue, needs a Pro licence.",
  pro:
    "Any product you make, commercial included, on any number of projects, " +
    "with no attribution required and no seat limit.",
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
  student: "Selling what you build? Pro carries the commercial licence.",
  pro: "",
};
