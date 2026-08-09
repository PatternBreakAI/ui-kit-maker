/* SPLASH LETTERING ENGINE — MATERIALIZE.

   MaterialRecipe × LightRig resolve into IR ops. The rule from the
   art-direction study: ONE light rig drives every directional decision —
   diffuse ramp orientation, bevel slope division, specular placement,
   rim side, strata travel, contact + cast shadow direction. Change the
   rig and the whole treatment relights; no op carries a private light.

   Nothing here is ray tracing. Every cue is the vector operation a
   designer would build by hand: the bevel is a three-fill crescent
   sandwich (full silhouette in the lit slope tone, a shade crescent
   shifted off the light, the plateau re-painted contracted and nudged
   toward the light); the specular is a hard band; the rim is the
   crescent the sandwich leaves open on the fill-light side.

   Colors are palette TOKENS resolved at compile time, so a recipe can
   be regraded (or grayscaled) without touching its construction. */

import type { IROp, GradientSpec } from "./engine";

/* ── color math ─────────────────────────────────────────────────── */

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgbHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** mix a→b by t */
export const mix = (a: string, b: string, t: number): string => {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
export const lighten = (c: string, t: number): string => mix(c, "#FFFFFF", t);
export const darken = (c: string, t: number): string => mix(c, "#000000", t);

/** hex → perceptual-luma gray hex (for the grayscale value strip) */
export function grayHex(hex: string): string {
  const [r, g, b] = hexRgb(hex);
  if (!/^#/.test(hex.trim())) return hex;
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const yy = y.toString(16).padStart(2, "0");
  return `#${yy}${yy}${yy}`;
}

/* ── palette ────────────────────────────────────────────────────── */

export type Palette = Record<string, string>;

export const tok = (p: Palette, t: string): string => {
  const v = p[t];
  if (!v) throw new Error(`palette token missing: ${t}`);
  return v;
};

export const grayPalette = (p: Palette): Palette =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, grayHex(v)]));

/* ── the light rig ──────────────────────────────────────────────── */

export interface LightRig {
  key: {
    /** illumination direction, degrees; 90 = light from above */
    angle: number;
    /** 0..1 — high light sits steeper: shorter shadows, higher gloss */
    elevation: number;
    /** 0..1 — scales specular strength and bevel contrast */
    intensity: number;
    color: string;
    /** 0..1 — softens bevel slope edges and speculars */
    softness: number;
  };
  fill: {
    enabled: boolean;
    /** degrees — the bounce/rim side (usually opposing the key) */
    angle: number;
    intensity: number;
    color: string;
    softness: number;
  };
  /** 0..1 — lifts shadow values (never lights anything itself) */
  ambient: number;
  /** strata / extrusion travel — always away from the key light */
  depth: { angle: number; step: number };
  shadow: { len: number; blur: number; opacity: number };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** unit vector TOWARD a light at `angle` (screen coords, y down) */
export const lightVec = (angle: number): [number, number] => [Math.cos(rad(angle)), -Math.sin(rad(angle))];
export const depthVec = (rig: LightRig): [number, number] => [Math.cos(rad(rig.depth.angle)), Math.sin(rad(rig.depth.angle))];

/** shadow travel shortens as the key light climbs */
export const shadowTravel = (rig: LightRig): number => rig.shadow.len * (1 - rig.key.elevation * 0.45);
/** ambient light lifts the shadow, it doesn't move it */
export const shadowOpacity = (rig: LightRig): number => rig.shadow.opacity * (1 - rig.ambient * 0.6);

/* ── DEPTH — the construction part of the appearance ────────────── */

/** A role's rearward construction, palette-token form. Authored at
 *  size 150; `depthK` on the role scales counts/travel for subordinate
 *  roles (a kicker never carries hero-depth strata). */
export interface DepthPlan {
  /** long soft cast shadow (travel/blur/opacity from the rig) */
  shadow?: { tok: string; expand: number };
  /** short dark contact shadow gluing the lettering to the stage */
  contact?: { tok: string; expand: number };
  /** deepest strata: the long dark tail */
  deep?: { tok: string; expand: number; count: number };
  /** accent strata: the near, saturated band */
  accent?: { tok: string; expand: number; count: number };
  /** true extrusion walls instead of strata (physical-coherence styles):
   *  orientation tones derive from the base tone under the key light */
  walls?: { tok: string; depth: number; inflate?: number };
  /** solid cap ring closing the strata (paints at the strata's expand) */
  cap?: { tok: string; expand: number };
  /** contour ring hugging the letters (the cream sticker line) */
  keyline?: { tok: string; expand: number };
}

export function resolveDepth(plan: DepthPlan, p: Palette, rig: LightRig, depthK = 1): IROp[] {
  const [dx, dy] = depthVec(rig);
  const ops: IROp[] = [];
  if (plan.shadow) {
    const t = shadowTravel(rig) * depthK;
    ops.push({
      expand: plan.shadow.expand, paint: tok(p, plan.shadow.tok),
      dx: dx * t, dy: dy * t,
      opacity: shadowOpacity(rig), blur: rig.shadow.blur, pass: "castShadow",
    });
  }
  if (plan.contact) {
    const t = Math.max(2, shadowTravel(rig) * 0.18) * depthK;
    ops.push({
      expand: plan.contact.expand, paint: tok(p, plan.contact.tok),
      dx: dx * t, dy: dy * t,
      opacity: Math.min(1, shadowOpacity(rig) * 2.2), blur: Math.max(0.8, rig.shadow.blur * 0.4), pass: "castShadow",
    });
  }
  if (plan.walls) {
    const base = tok(p, plan.walls.tok);
    const v = plan.walls.depth * depthK;
    ops.push({
      paint: base, pass: "deepStrata",
      walls: {
        dx: dx * v, dy: dy * v, inflate: plan.walls.inflate ?? 0,
        down: darken(base, 0.12 + 0.25 * rig.key.intensity),
        mid: darken(base, 0.32 + 0.2 * rig.key.intensity),
        side: darken(base, 0.5 + 0.18 * rig.key.intensity),
        back: darken(base, 0.55),
      },
    });
  }
  if (plan.deep) {
    ops.push({
      expand: plan.deep.expand, paint: tok(p, plan.deep.tok),
      repeat: { count: Math.max(1, Math.round(plan.deep.count * depthK)), stepX: dx * rig.depth.step, stepY: dy * rig.depth.step },
      pass: "deepStrata",
    });
  }
  if (plan.accent) {
    ops.push({
      expand: plan.accent.expand, paint: tok(p, plan.accent.tok),
      repeat: { count: Math.max(1, Math.round(plan.accent.count * depthK)), stepX: dx * rig.depth.step, stepY: dy * rig.depth.step },
      pass: "shallowStrata",
    });
  }
  if (plan.cap) ops.push({ expand: plan.cap.expand, paint: tok(p, plan.cap.tok), pass: "outerContour" });
  if (plan.keyline) ops.push({ expand: plan.keyline.expand, paint: tok(p, plan.keyline.tok), pass: "keyline" });
  return ops;
}

/* ── MATERIAL — how the face answers the light ──────────────────── */

export interface TokStop { tok: string; position: number; opacity?: number }

/** Diffuse ramp in palette-token form; the angle links to the key light
 *  unless the recipe deliberately unhooks it. */
export interface DiffuseSpec {
  type: GradientSpec["type"];
  stops: TokStop[];
  balance?: number;
  spread?: number;
  hardness?: number;
  repeat?: GradientSpec["repeat"];
  space?: GradientSpec["space"];
  /** default true — angle comes from the rig's key light */
  linkToLight?: boolean;
  angle?: number;
  /** degrees added after light linking (a deliberate off-axis ramp) */
  lightOffset?: number;
}

export interface MaterialRecipe {
  id: string;
  profile: "flat" | "chamfer" | "rounded" | "pillow";
  diffuse: DiffuseSpec;
  bevel?: { width: number; contrast: number; profile: "hard" | "soft" | "rounded" };
  specular?: {
    strength: number;   // 0..1 peak opacity (scaled by key intensity)
    width: number;      // 0..1 band width across the lit span
    hardness: number;   // 0..1 band edge snap
    balance: number;    // 0..1 band center from the lit edge
    tok: string;
    space?: "glyph" | "role";
  };
  rim?: { strength: number; width: number; tok: string };
  /** ordered contract rings over the face — the sports double-inline,
   *  the neon tube core */
  inlines?: { tok: string; inset: number; opacity?: number; blur?: number }[];
  /** emissive halo painted behind the whole construction (neon) */
  glow?: { tok: string; width: number; strength: number };
  /** 0..1 — dampens and widens speculars */
  roughness?: number;
  /** 0..1 — declared for recipes that read as metal (banded ramps, dark
   *  horizon); consumed by recipe authoring, kept for the schema */
  metallic?: number;
}

const resolveDiffuse = (d: DiffuseSpec, p: Palette, rig: LightRig): GradientSpec => ({
  type: d.type,
  stops: d.stops.map((s) => ({ color: tok(p, s.tok), position: s.position, opacity: s.opacity })),
  angle: (d.linkToLight === false ? (d.angle ?? 90) : rig.key.angle + (d.lightOffset ?? 0)),
  balance: d.balance, spread: d.spread, hardness: d.hardness, repeat: d.repeat,
  space: d.space ?? "role",
});

export function resolveMaterial(m: MaterialRecipe, p: Palette, rig: LightRig): IROp[] {
  const ops: IROp[] = [];
  const diffuse = resolveDiffuse(m.diffuse, p, rig);
  const [lx, ly] = lightVec(rig.key.angle);
  const litTok = tok(p, m.diffuse.stops[0].tok);
  const shadeTok = tok(p, m.diffuse.stops[m.diffuse.stops.length - 1].tok);
  const rough = m.roughness ?? 0;

  const hasBevel = m.profile !== "flat" && m.bevel && m.bevel.width > 0.05;
  const rim = m.rim && m.rim.strength > 0.01 && m.rim.width > 0.05 ? m.rim : undefined;

  if (m.glow) {
    ops.push({
      expand: m.glow.width, paint: tok(p, m.glow.tok),
      blur: m.glow.width * 0.9, opacity: Math.min(1, m.glow.strength * (0.6 + 0.4 * rig.key.intensity)),
      pass: "deepStrata",
    });
  }

  if (!hasBevel && !rim) {
    ops.push({ paint: diffuse, pass: "face" });
  } else {
    /* the crescent sandwich — all in the face pass, in order */
    let inset = 0, shiftX = 0, shiftY = 0;
    if (rim) {
      const rimC = mix(tok(p, rim.tok), rig.fill.enabled ? rig.fill.color : tok(p, rim.tok), rig.fill.enabled ? 0.45 : 0);
      ops.push({ paint: rimC, pass: "face", opacity: Math.min(1, rim.strength * (rig.fill.enabled ? 0.4 + rig.fill.intensity : 1)) });
      inset = rim.width * 0.9;
      shiftX = lx * rim.width * 0.55; shiftY = ly * rim.width * 0.55;
    }
    if (hasBevel && m.bevel) {
      const bw = m.bevel.width;
      const con = m.bevel.contrast * (0.6 + 0.4 * rig.key.intensity);
      const soft = m.bevel.profile === "soft" || m.bevel.profile === "rounded" ? Math.max(0.5, bw * 0.16 * (0.5 + rig.key.softness)) : 0;
      const bevelLit = lighten(mix(litTok, rig.key.color, 0.18), con * 0.55);
      const bevelShade = darken(shadeTok, con * 0.6);
      // lit slope: the whole (rim-inset) silhouette
      ops.push({ expand: -inset || undefined, paint: bevelLit, dx: shiftX, dy: shiftY, blur: soft || undefined, pass: "face" });
      // shade crescent: shifted off the light so the lit side stays open
      ops.push({
        expand: -(inset + bw * 0.45), paint: bevelShade,
        dx: shiftX - lx * bw * 0.4, dy: shiftY - ly * bw * 0.4,
        blur: soft || undefined, pass: "face",
      });
      // plateau: the diffuse ramp re-painted, nudged toward the light
      ops.push({
        expand: -(inset + bw), paint: diffuse,
        dx: shiftX + lx * bw * 0.25, dy: shiftY + ly * bw * 0.25,
        pass: "face",
      });
    } else {
      // rim without bevel: diffuse contracted off the rim crescent
      ops.push({ expand: -inset || undefined, paint: diffuse, dx: shiftX, dy: shiftY, pass: "face" });
    }
  }

  for (const inl of m.inlines ?? []) {
    ops.push({
      expand: -inl.inset, paint: tok(p, inl.tok),
      opacity: inl.opacity, blur: inl.blur, pass: "inline",
    });
  }

  if (m.specular && m.specular.strength > 0.01) {
    const sp = m.specular;
    const s = Math.min(1, sp.strength * (0.55 + 0.45 * rig.key.intensity) * (1 - rough * 0.55));
    const width = Math.min(0.9, sp.width * (1 + rough * 0.6));
    const hard = Math.max(0, sp.hardness * (1 - rig.key.softness * 0.6) * (1 - rough * 0.5));
    const c = mix(tok(p, sp.tok), rig.key.color, 0.25);
    const bal = Math.max(width / 2, sp.balance * (1 - (rig.key.elevation - 0.5) * 0.4));
    const b0 = Math.max(0, bal - width / 2), b1 = Math.min(1, bal + width / 2);
    const tz = Math.max(0.015, (1 - hard) * width * 0.5);
    ops.push({
      paint: {
        type: "linear", angle: rig.key.angle, space: sp.space ?? "glyph",
        stops: [
          { color: c, position: Math.max(0, b0 - tz), opacity: 0 },
          { color: c, position: b0, opacity: s },
          { color: c, position: b1, opacity: s },
          { color: c, position: Math.min(1, b1 + tz), opacity: 0 },
        ],
      },
      pass: "highlight",
    });
  }
  return ops;
}
