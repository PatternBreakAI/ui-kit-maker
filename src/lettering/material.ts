/* SPLASH LETTERING ENGINE — MATERIALIZE.

   MaterialRecipe × LightRig resolve into IR ops. The rule from the
   art-direction study: ONE light rig drives every directional decision —
   face gradient orientation, per-glyph gloss placement, strata travel,
   cast-shadow travel. Change the rig and the whole treatment relights;
   no op carries its own private light. Colors are palette TOKENS,
   resolved at compile time, so a recipe can be regraded (or grayscaled)
   without touching its construction. */

import type { IROp, GradientSpec } from "./engine";

/* ── the light rig ──────────────────────────────────────────────── */

export interface LightRig {
  /** illumination direction, degrees; 90 = light from above */
  angle: number;
  /** strata / cast-shadow travel direction, degrees in screen terms
   *  (y-down): 56 ≈ down-right — always away from the light */
  depthAngle: number;
  /** px of travel per stratum copy (authored at size 150) */
  depthStep: number;
  /** cast-shadow travel in px (authored at size 150) */
  shadowLen: number;
  shadowBlur: number;
  shadowOpacity: number;
}

export const depthVec = (rig: LightRig): [number, number] => {
  const a = (rig.depthAngle * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

/* ── palette ────────────────────────────────────────────────────── */

export type Palette = Record<string, string>;

export const tok = (p: Palette, t: string): string => {
  const v = p[t];
  if (!v) throw new Error(`palette token missing: ${t}`);
  return v;
};

/** hex → perceptual-luma gray hex (for the grayscale value strip) */
export function grayHex(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const yy = y.toString(16).padStart(2, "0");
  return `#${yy}${yy}${yy}`;
}

export const grayPalette = (p: Palette): Palette =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, grayHex(v)]));

/* ── DEPTH — the construction part of the appearance ────────────── */

/** A role's rearward construction, palette-token form. Authored at
 *  size 150; `depthK` on the role scales counts/travel for subordinate
 *  roles (a kicker never carries hero-depth strata). */
export interface DepthPlan {
  /** soft cast shadow (travel/blur from the rig) */
  shadow?: { tok: string; expand: number };
  /** deepest strata: the long dark tail */
  deep?: { tok: string; expand: number; count: number };
  /** accent strata: the near, saturated band */
  accent?: { tok: string; expand: number; count: number };
  /** solid cap ring closing the strata (paints at the strata's own expand) */
  cap?: { tok: string; expand: number };
  /** contour ring hugging the letters (the cream sticker line) */
  keyline?: { tok: string; expand: number };
}

export function resolveDepth(plan: DepthPlan, p: Palette, rig: LightRig, depthK = 1): IROp[] {
  const [dx, dy] = depthVec(rig);
  const ops: IROp[] = [];
  if (plan.shadow) {
    ops.push({
      expand: plan.shadow.expand, paint: tok(p, plan.shadow.tok),
      dx: dx * rig.shadowLen * depthK, dy: dy * rig.shadowLen * depthK,
      opacity: rig.shadowOpacity, blur: rig.shadowBlur, pass: "castShadow",
    });
  }
  if (plan.deep) {
    ops.push({
      expand: plan.deep.expand, paint: tok(p, plan.deep.tok),
      repeat: { count: Math.max(1, Math.round(plan.deep.count * depthK)), stepX: dx * rig.depthStep, stepY: dy * rig.depthStep },
      pass: "deepStrata",
    });
  }
  if (plan.accent) {
    ops.push({
      expand: plan.accent.expand, paint: tok(p, plan.accent.tok),
      repeat: { count: Math.max(1, Math.round(plan.accent.count * depthK)), stepX: dx * rig.depthStep, stepY: dy * rig.depthStep },
      pass: "shallowStrata",
    });
  }
  if (plan.cap) ops.push({ expand: plan.cap.expand, paint: tok(p, plan.cap.tok), pass: "outerContour" });
  if (plan.keyline) ops.push({ expand: plan.keyline.expand, paint: tok(p, plan.keyline.tok), pass: "keyline" });
  return ops;
}

/* ── MATERIAL — how the face answers the light ──────────────────── */

export interface MaterialRecipe {
  id: string;
  /** face gradient endpoints — lit stop faces the rig */
  face: { lit: string; shade: string };
  /** inner glow: a contracted second gradient (candy translucency) */
  inner?: { lit: string; shade: string; inset: number };
  /** per-glyph sheen band falling from the light — the gloss layer */
  gloss?: { tok: string; opacity: number; span: number };
}

export function resolveMaterial(m: MaterialRecipe, p: Palette, rig: LightRig): IROp[] {
  const ops: IROp[] = [];
  const faceGrad: GradientSpec = {
    type: "linear", angle: rig.angle, space: "role",
    stops: [
      { color: tok(p, m.face.lit), position: 0 },
      { color: tok(p, m.face.shade), position: 1 },
    ],
  };
  ops.push({ paint: faceGrad, pass: "face" });
  if (m.inner) {
    ops.push({
      expand: -m.inner.inset,
      paint: {
        type: "linear", angle: rig.angle, space: "role",
        stops: [
          { color: tok(p, m.inner.lit), position: 0 },
          { color: tok(p, m.inner.shade), position: 1 },
        ],
      },
      pass: "inline",
    });
  }
  if (m.gloss) {
    // a crisp candy band, not a fade: full strength across the lit span,
    // then a fast fall-off — the comic-gloss look
    const g = tok(p, m.gloss.tok);
    const span = Math.max(0.05, Math.min(0.9, m.gloss.span));
    ops.push({
      paint: {
        type: "linear", angle: rig.angle, space: "glyph",
        stops: [
          { color: g, position: 0, opacity: m.gloss.opacity },
          { color: g, position: span, opacity: m.gloss.opacity },
          { color: g, position: Math.min(1, span + 0.04), opacity: 0 },
        ],
      },
      pass: "highlight",
    });
  }
  return ops;
}
