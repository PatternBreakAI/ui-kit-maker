/* SPLASH LETTERING ENGINE — core pipeline (Phase 1).

   The purpose-built engine from the architecture recommendation: pure
   functions, deterministic, no DOM, no kit-engine dependency. The
   pipeline IS the module structure:

     INTERPRET → TYPESET → COMPOSE → CONSTRUCT(IR) → EMIT

   (MATERIALIZE and SCENE live in sibling modules and feed CONSTRUCT/EMIT.)

   Organs lifted from the research prototypes: the typeset/deform
   primitives come from src/splash/outline.ts (layout, flatten, mapCmds,
   bounds), real inward offsets from src/generator/extrude.ts. The IR and
   pass-major compositor are the evolved forms of the experimental
   appearance module. The user's string is never mutated; casing is a
   visual transform. Same text + recipe + seed = same art. */

import type { Font } from "opentype.js";
import { layout, flatten, mapCmds, cmdToD, boundsOf, toGlyphs } from "@/splash/outline";
import type { Cmd } from "@/splash/outline";
import { inflateOutline, extrudeWalls } from "@/generator/extrude";

/* ── deterministic variance ─────────────────────────────────────── */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── INTERPRET — semantic roles ─────────────────────────────────── */

const STOPWORDS = new Set(["THE", "A", "AN", "OF", "AND", "&", "TO", "FOR", "IN", "ON", "WITH", "BY", "AT"]);
const isStop = (w: string) => STOPWORDS.has(w.toUpperCase());

export interface RolePlan { support: string | null; hero: string; supportIsStop: boolean }

/** Candidate role assignments, scored: connective language subordinates
 *  itself; the hero carries the principal phrase; lines balance.
 *  Explicit newlines are the strongest instruction; a manual override
 *  (data model only) beats everything. */
export function interpret(text: string, override?: { support?: string | null; hero: string }): RolePlan {
  if (override) return { support: override.support ?? null, hero: override.hero, supportIsStop: !!override.support && override.support.split(/\s+/).every(isStop) };
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const support = lines[0];
    return { support, hero: lines.slice(1).join(" "), supportIsStop: support.split(/\s+/).every(isStop) };
  }
  const words = (lines[0] ?? "").split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { support: null, hero: words[0] ?? "", supportIsStop: false };
  type Cand = { support: string[]; hero: string[]; score: number };
  const score = (support: string[], hero: string[]): number => {
    if (!hero.length) return -1e9;
    let s = 0;
    if (support.length && support.every(isStop)) s += 30;
    if (support.some((w) => !isStop(w)) && hero.every(isStop)) s -= 100;
    if (isStop(hero[0]) && hero.length > 1) s -= 25;
    if (support.length && !support.some(isStop) && support.join(" ").length > hero.join(" ").length) s -= 12;
    const hl = hero.join(" ").length, sl = support.join(" ").length;
    s -= Math.max(0, hl - 12) * 2 + Math.max(0, sl - 10) * 2;
    if (support.length) s += 6;
    if (support.length && sl <= hl) s += 6;
    return s;
  };
  const cands: Cand[] = [];
  for (let k = 0; k <= Math.min(words.length - 1, 3); k++) {
    cands.push({ support: words.slice(0, k), hero: words.slice(k), score: score(words.slice(0, k), words.slice(k)) });
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  return {
    support: best.support.length ? best.support.join(" ") : null,
    hero: best.hero.join(" "),
    supportIsStop: best.support.length > 0 && best.support.every(isStop),
  };
}

/* ── TYPESET — per-role glyph assembly with authored rhythm ─────── */

export type CasePolicy = "preserve" | "upper" | "title" | "lower";

export interface Rhythm {
  arch?: number;        // baseline arch at center, fraction of size (+up)
  rise?: number;        // linear rise left→right, fraction of size
  centerScale?: number; // center letters larger, + fraction
  rotFollow?: number;   // 0..1 — rotation follows baseline tangent
  jitter?: number;      // 0..1 — seeded variance budget (≤ ~15% of motion)
}

export interface RoleType {
  font: Font;
  casePolicy: CasePolicy;
  size: number;
  tracking: number;     // em
  rhythm?: Rhythm;
  shear?: number;       // degrees forward
}

export const applyCase = (s: string, p: CasePolicy): string =>
  p === "upper" ? s.toUpperCase()
  : p === "lower" ? s.toLowerCase()
  : p === "title" ? s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
  : s;

export interface RoleGeom { cmds: Cmd[][]; w: number }

export function typesetRole(text: string, spec: RoleType, seed: number): RoleGeom {
  const cased = applyCase(text, spec.casePolicy);
  const r = mulberry32(seed);
  const n = Math.max(1, toGlyphs(spec.font, cased).length);
  const rh = spec.rhythm ?? {};
  const jit = rh.jitter ?? 0;
  const u = (i: number) => (n > 1 ? (2 * i) / (n - 1) - 1 : 0);
  const scales: number[] = [];
  for (let i = 0; i < n; i++) scales.push((1 + (rh.centerScale ?? 0) * (1 - u(i) * u(i))) * (1 + jit * 0.05 * (r() * 2 - 1)));
  const laid = layout(spec.font, cased, spec.size, spec.tracking, scales, 0);
  const W = Math.max(1, laid.w);
  const A = (rh.arch ?? 0) * spec.size;
  const R = (rh.rise ?? 0) * spec.size;
  const shearT = Math.tan(((spec.shear ?? 0) * Math.PI) / 180);
  const cmds = laid.glyphs.map((g, i) => {
    const ui = u(i);
    const base = -A * (1 - ui * ui) - R * ((ui + 1) / 2) + jit * spec.size * 0.03 * (r() * 2 - 1);
    const slope = (4 * A * ui) / W - R / W;
    const rot = (rh.rotFollow ?? 0) * Math.atan(slope) + jit * 0.05 * (r() * 2 - 1);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const cx = g.center;
    return mapCmds(g.cmds, (px, py) => {
      const lx = px - cx, ly = py;
      const x2 = cx + lx * cs - ly * sn;
      const y2 = base + lx * sn + ly * cs;
      return [x2 - shearT * y2, y2];
    });
  });
  const b = boundsOf(cmds.flat());
  return { cmds, w: b.maxX - b.minX };
}

/* ── geometry carried through CONSTRUCT/EMIT ────────────────────── */

export interface Geom {
  d: string;
  polys: [number, number][][];
  x1: number; y1: number; x2: number; y2: number;
  /** per-glyph paths — glyph-scoped ops address single letters */
  glyphDs: string[];
  /** per-glyph flattened contours — glyph-scoped CONTRACT ops keep their
   *  per-letter identity instead of degrading to the union offset */
  glyphPolys: [number, number][][][];
}

export function toGeom(cmds: Cmd[][], size: number): Geom {
  const polys: [number, number][][] = [];
  const glyphPolys: [number, number][][][] = [];
  for (const gc of cmds) {
    const mine: [number, number][][] = [];
    let cur: [number, number][] = [];
    for (const c of flatten(gc, size / 22)) {
      if (c.type === "M") { if (cur.length >= 3) mine.push(cur); cur = [[c.x!, c.y!]]; }
      else if (c.type === "L") cur.push([c.x!, c.y!]);
      else if (c.type === "Z") { if (cur.length >= 3) mine.push(cur); cur = []; }
    }
    if (cur.length >= 3) mine.push(cur);
    glyphPolys.push(mine);
    polys.push(...mine);
  }
  const b = boundsOf(cmds.flat());
  return { d: cmds.map(cmdToD).join(""), polys, x1: b.minX, y1: b.minY, x2: b.maxX, y2: b.maxY, glyphDs: cmds.map(cmdToD), glyphPolys };
}

export const translateCmds = (cmds: Cmd[][], dx: number, dy: number): Cmd[][] =>
  cmds.map((gc) => mapCmds(gc, (x, y) => [x + dx, y + dy]));

/* ── CONSTRUCT — the render IR ──────────────────────────────────── */

export type RenderPass =
  | "castShadow" | "deepStrata" | "shallowStrata" | "outerContour"
  | "keyline" | "face" | "inline" | "material" | "highlight";
export const PASS_ORDER: RenderPass[] = [
  "castShadow", "deepStrata", "shallowStrata", "outerContour",
  "keyline", "face", "inline", "material", "highlight",
];

/** The full Gradient IR from the material study. Everything resolves to
 *  plain SVG 1.1 gradients:
 *  - balance/spread position the ramp VECTOR (so repeat/mirror get real
 *    spreadMethod semantics)
 *  - hardness snaps stop transitions into graphic bands ("banded" is
 *    linear with hardness defaulting to 1)
 *  - multi-radial = radial with its focal point pulled toward the light
 *  - space picks the coordinate frame: per-letter, per-role geometry, or
 *    the whole composition */
export interface GradientSpec {
  type: "linear" | "radial" | "banded" | "multi-radial";
  stops: { color: string; position: number; opacity?: number }[];
  /** degrees; 90 = light from above (first stop faces the light) */
  angle?: number;
  /** 0..1 — where the ramp's center sits along the span (default 0.5) */
  balance?: number;
  /** 0..1 — fraction of the span the ramp occupies (default 1) */
  spread?: number;
  /** 0..1 — 0 blends smoothly, 1 snaps into hard bands */
  hardness?: number;
  repeat?: "none" | "repeat" | "mirror";
  space?: "glyph" | "role" | "composition";
}

export type Paint = string | GradientSpec;

export interface IROp {
  /** px offset-path amount: >0 expand (round-join stroke), <0 contract
   *  (true inward offset, features collapse like Offset Path) */
  expand?: number;
  paint: Paint;
  dx?: number; dy?: number;
  repeat?: { count: number; stepX: number; stepY: number };
  opacity?: number;
  blur?: number;
  pass: RenderPass;
  /** raw defs this op depends on (pattern tiles, mask geometry) —
   *  registered once with the op */
  rawDefs?: string[];
  /** id of a mask (in rawDefs) wrapping this op's output — surface
   *  modulation only, dropped in silhouette mode */
  mask?: string;
  /** true vector extrusion: orientation-classed wall strips instead of a
   *  fill of the outline (colors pre-resolved by MATERIALIZE) */
  walls?: { dx: number; dy: number; inflate?: number; down: string; mid: string; side: string; back: string };
  /** paint each glyph's path separately (glyph-space patterns; gradients
   *  with space:"glyph" imply this on their own) */
  perGlyph?: boolean;
}

export interface IRRole { geom: Geom; ops: IROp[]; idp: string }

export interface Frame { x1: number; y1: number; x2: number; y2: number }

/** hardness: between each stop pair, hold the earlier color for `hard`
 *  of the gap so the transition compresses toward a hard band */
const bandStops = (stops: GradientSpec["stops"], hard: number): GradientSpec["stops"] => {
  if (hard <= 0.001 || stops.length < 2) return stops;
  const out = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1], cur = stops[i];
    const gap = cur.position - prev.position;
    if (gap > 0.0001) out.push({ ...prev, position: prev.position + hard * gap });
    out.push(cur);
  }
  return out;
};

const gradientDef = (g: GradientSpec, id: string, gm: Frame, obb: boolean): string => {
  const ang = ((g.angle ?? 90) * Math.PI) / 180;
  const hard = g.hardness ?? (g.type === "banded" ? 1 : 0);
  const stops = bandStops(g.stops, hard)
    .map((s) => `<stop offset="${s.position.toFixed(3)}" stop-color="${s.color}"${s.opacity !== undefined && s.opacity < 1 ? ` stop-opacity="${s.opacity.toFixed(2)}"` : ""}/>`).join("");
  const bal = g.balance ?? 0.5, spr = Math.max(0.02, g.spread ?? 1);
  const sm = g.repeat === "repeat" ? ` spreadMethod="repeat"` : g.repeat === "mirror" ? ` spreadMethod="reflect"` : "";
  const dx = Math.cos(ang), dy = -Math.sin(ang);
  if (g.type === "radial" || g.type === "multi-radial") {
    const focal = g.type === "multi-radial" ? 0.28 : 0;
    if (obb) {
      const r = 0.75 * spr;
      const cx = 0.5, cy = 0.42;
      const fx = cx + dx * r * focal, fy = cy + dy * r * focal;
      return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r.toFixed(3)}"${focal ? ` fx="${fx.toFixed(3)}" fy="${fy.toFixed(3)}"` : ""}${sm}>${stops}</radialGradient>`;
    }
    const cx = (gm.x1 + gm.x2) / 2, cy = (gm.y1 + gm.y2) / 2;
    const r = Math.max(gm.x2 - gm.x1, gm.y2 - gm.y1) * 0.72 * spr;
    const fx = cx + dx * r * focal, fy = cy + dy * r * focal;
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"${focal ? ` fx="${fx.toFixed(1)}" fy="${fy.toFixed(1)}"` : ""}${sm}>${stops}</radialGradient>`;
  }
  // linear/banded — light from `angle`: the FIRST stop faces the light.
  // The ramp VECTOR runs from `balance - spread/2` to `balance + spread/2`
  // along the lit→shade span, so spreadMethod governs the rest.
  if (obb) {
    const lx = 0.5 + dx / 2, ly = 0.5 + dy / 2;   // lit corner of the box
    const sx = 0.5 - dx / 2, sy = 0.5 - dy / 2;   // shade corner
    const t0 = bal - spr / 2, t1 = bal + spr / 2;
    const x1 = lx + (sx - lx) * t0, y1 = ly + (sy - ly) * t0;
    const x2 = lx + (sx - lx) * t1, y2 = ly + (sy - ly) * t1;
    return `<linearGradient id="${id}" x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}"${sm}>${stops}</linearGradient>`;
  }
  const cx = (gm.x1 + gm.x2) / 2, cy = (gm.y1 + gm.y2) / 2;
  const rx = (gm.x2 - gm.x1) / 2, ry = (gm.y2 - gm.y1) / 2;
  const ex = Math.abs(dx) * rx + Math.abs(dy) * ry;
  const lpx = cx + dx * ex, lpy = cy + dy * ex;   // lit end of the span
  const spx = cx - dx * ex, spy = cy - dy * ex;   // shade end
  const t0 = bal - spr / 2, t1 = bal + spr / 2;
  const x1 = lpx + (spx - lpx) * t0, y1 = lpy + (spy - lpy) * t0;
  const x2 = lpx + (spx - lpx) * t1, y2 = lpy + (spy - lpy) * t1;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${sm}>${stops}</linearGradient>`;
};

function opNode(geom: Geom, op: IROp, defs: string[], oid: string, silhouette: boolean, frame?: Frame): string {
  if (!geom.d) return "";
  const ex = op.expand ?? 0;

  // walls: true extrusion strips, orientation-classed by MATERIALIZE
  if (op.walls) {
    const w = op.walls;
    const wg = extrudeWalls(geom.polys, w.dx, w.dy, w.inflate ?? 0);
    const c = silhouette
      ? { down: "#111111", mid: "#111111", side: "#111111", back: "#111111" }
      : w;
    return (
      (wg.back ? `<path d="${wg.back}" fill="${c.back}"/>` : "") +
      (wg.down ? `<path d="${wg.down}" fill="${c.down}"/>` : "") +
      (wg.mid ? `<path d="${wg.mid}" fill="${c.mid}"/>` : "") +
      (wg.side ? `<path d="${wg.side}" fill="${c.side}"/>` : "")
    );
  }

  let fillRef: string;
  const paint = silhouette ? "#111111" : op.paint;
  if (typeof paint === "string") fillRef = paint;
  else {
    const gid = `${oid}g`;
    const gm = paint.space === "composition" && frame ? frame : geom;
    defs.push(gradientDef(paint, gid, gm, paint.space === "glyph"));
    fillRef = `url(#${gid})`;
  }
  if (!silhouette && op.rawDefs) defs.push(...op.rawDefs);
  const perGlyph = op.perGlyph === true || (typeof paint !== "string" && paint.space === "glyph");
  const body = (d: string) =>
    ex > 0.01 ? `<path d="${d}" fill="${fillRef}" stroke="${fillRef}" stroke-width="${(ex * 2).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`
    : `<path d="${d}" fill="${fillRef}"/>`;
  let node: string;
  if (ex < -0.01) {
    // contraction: per-glyph offsets when the paint lives in glyph space
    node = perGlyph
      ? geom.glyphPolys.map((gp) => { const d = inflateOutline(gp, ex); return d ? `<path d="${d}" fill="${fillRef}"/>` : ""; }).join("")
      : `<path d="${inflateOutline(geom.polys, ex)}" fill="${fillRef}"/>`;
  } else {
    node = perGlyph ? geom.glyphDs.map((gd) => body(gd)).join("") : body(geom.d);
  }
  const baseDx = op.dx ?? 0, baseDy = op.dy ?? 0;
  const em: string[] = [];
  if (op.repeat?.count) {
    for (let k = op.repeat.count; k >= 1; k--) {
      em.push(`<g transform="translate(${(baseDx + k * op.repeat.stepX).toFixed(2)} ${(baseDy + k * op.repeat.stepY).toFixed(2)})">${node}</g>`);
    }
  }
  em.push(baseDx || baseDy ? `<g transform="translate(${baseDx.toFixed(2)} ${baseDy.toFixed(2)})">${node}</g>` : node);
  let out = em.join("");
  if (op.blur && op.blur > 0.05 && !silhouette) {
    const fid = `${oid}f`;
    const travX = baseDx + (op.repeat ? op.repeat.count * op.repeat.stepX : 0);
    const travY = baseDy + (op.repeat ? op.repeat.count * op.repeat.stepY : 0);
    const pad = ex + Math.abs(travX) + Math.abs(travY) + op.blur * 4 + 20;
    defs.push(`<filter id="${fid}" filterUnits="userSpaceOnUse" x="${(geom.x1 - pad).toFixed(0)}" y="${(geom.y1 - pad).toFixed(0)}" width="${(geom.x2 - geom.x1 + pad * 2).toFixed(0)}" height="${(geom.y2 - geom.y1 + pad * 2).toFixed(0)}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${op.blur.toFixed(1)}"/></filter>`);
    out = `<g filter="url(#${fid})">${out}</g>`;
  }
  if (silhouette && op.blur) return ""; // shadows don't belong in a silhouette
  if (!silhouette && op.mask) out = `<g mask="url(#${op.mask})">${out}</g>`;
  if (!silhouette && op.opacity !== undefined && op.opacity < 1) out = `<g opacity="${op.opacity.toFixed(2)}">${out}</g>`;
  return out;
}

/* ── EMIT — pass-major, whole-lockup construction ordering ──────── */

/** Every rearward layer for every role paints before any face; the
 *  composition-scoped geometry paints first within each pass (it is the
 *  outermost silhouette); roles paint rear → front. */
export function emitPassMajor(roles: IRRole[], composition: IRRole | null, defs: string[], silhouette = false, frame?: Frame): string {
  let out = "";
  PASS_ORDER.forEach((pass, pi) => {
    for (const r of [composition, ...roles]) {
      if (!r) continue;
      r.ops.forEach((op, oi) => {
        if (op.pass === pass) out += opNode(r.geom, op, defs, `${r.idp}${pi}_${oi}`, silhouette, frame);
      });
    }
  });
  return out;
}
