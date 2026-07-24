/* ── Tiers — capabilities as data ────────────────────────────────────
   One table answers every "can they…?" question. The tier is derived from
   live auth state: guest (no session), free (signed in), pro (plan_id past
   'free', or the admin). IMPORTANT HONESTY: until exports move server-side,
   these gates are product shape, not security — the bundle contains
   everything, and the paid tier's real enforcement arrives with Stripe +
   server functions (plan §12 / Appendix A). plan_id itself is already
   server-truth: RLS pins it to 'free' until entitlement resolution exists. */

export type Tier = "guest" | "free" | "pro";

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
  /** Vector-grade exports (SVG, copy-SVG, HTML, game kit). */
  vectorExports: boolean;
};

export const TIER_CAPS: Record<Tier, TierCaps> = {
  guest: { zoomMax: 1.0, presetLimit: 4, kitComponents: 5, pngScaleMax: 1, vectorExports: false },
  free:  { zoomMax: 1.5, presetLimit: 6, kitComponents: Infinity, pngScaleMax: 1, vectorExports: false },
  pro:   { zoomMax: 4,   presetLimit: Infinity, kitComponents: Infinity, pngScaleMax: 4, vectorExports: true },
};

export function capsOf(tier: Tier): TierCaps { return TIER_CAPS[tier]; }

/** The one-line upgrade story for each gate, in the product's voice. */
export const UPGRADE_LINES: Record<Tier, string> = {
  guest: "Sign in free — unlock the full kit, 150% zoom and two preset packs.",
  free: "Go Pro — every preset, vector exports and unlimited zoom.",
  pro: "",
};
