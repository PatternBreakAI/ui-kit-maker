/* EXPERIMENTAL — the Typographic Treatment Compiler (not wired to any
   production UI).

   The product thesis from the art-direction research: Splash Text is not
   a machine that changes fonts and adds effects — it reproduces complete
   typographic-treatment WORKFLOWS. A TreatmentRecipe describes the whole
   journey and this module compiles it:

     USER TEXT
       → text interpretation (case policy, role assignment, variants)
       → typographic construction (per-role fonts, width matching,
         gap/tuck, tracking)
       → letter rhythm (authored PROFILES — baseline arch/rise, center
         scale, rotation following the baseline tangent — plus a SMALL
         seeded jitter; never pure per-glyph randomness)
       → smart deformation (shear; more operators later)
       → Appearance Stacks per role (the low-level render IR)
       → procedural ornament (underline swash from hero bounds)
       → SVG

   The user's string is never mutated — casing is a visual transformation.
   Same text + same recipe + same seed = same art, deterministically. */

import type { Font } from "opentype.js";
import { layout, flatten, mapCmds, cmdToD, boundsOf, toGlyphs } from "./outline";
import type { Cmd, OutlineLine } from "./outline";
import { renderAppearanceLine } from "./appearance";
import type { AppearanceEntry } from "./appearance";

/* deterministic PRNG — the "human" variance is seeded, never random */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type CasePolicy = "preserve" | "upper" | "title" | "lower";

/** Authored movement, not jitter sliders: the profiles carry the design,
 *  the seeded variance only roughs the edges (10–15% of total motion). */
export interface Rhythm {
  /** baseline arch height at line center, fraction of size (+ = up) */
  arch?: number;
  /** linear left→right baseline rise, fraction of size (+ = rising) */
  rise?: number;
  /** center letters larger: + fraction at center vs edges */
  centerScale?: number;
  /** 0..1 — how fully glyph rotation follows the baseline tangent */
  rotFollow?: number;
  /** 0..1 — seeded variance budget (rotation/baseline/scale) */
  jitter?: number;
}

export interface RoleSpec {
  font: Font;
  casePolicy: CasePolicy;
  size: number;
  /** tracking in em (negative = tight display setting) */
  tracking: number;
  rhythm?: Rhythm;
  /** forward shear in degrees */
  shear?: number;
  stack: AppearanceEntry[];
}

export interface Treatment {
  id: string;
  hero: RoleSpec;
  support?: RoleSpec;
  /** support width as a fraction of hero width (1 = wood-type equal
   *  measure); undefined = support keeps its natural size */
  widthMatch?: number;
  /** px between support bottom and hero top; negative = tuck/overlap */
  lineGap: number;
  ornament?: "underline-swash";
  /** stage color for the sheet renders */
  stage: string;
}

const applyCase = (s: string, p: CasePolicy): string =>
  p === "upper" ? s.toUpperCase()
  : p === "lower" ? s.toLowerCase()
  : p === "title" ? s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
  : s;

interface BuiltRole { cmds: Cmd[][]; w: number }

/** Assemble one role's glyphs with profiles + seeded variance baked into
 *  the geometry. Baseline-anchored: y=0 is the (undeformed) baseline. */
function buildRole(text: string, spec: RoleSpec, seed: number): BuiltRole {
  const cased = applyCase(text, spec.casePolicy);
  const r = mulberry32(seed);
  const n = Math.max(1, toGlyphs(spec.font, cased).length);
  const rh = spec.rhythm ?? {};
  const jit = rh.jitter ?? 0;
  const u = (i: number) => (n > 1 ? (2 * i) / (n - 1) - 1 : 0);
  // scale profile feeds the ADVANCES so neighbors reflow around it
  const scales: number[] = [];
  for (let i = 0; i < n; i++) {
    scales.push((1 + (rh.centerScale ?? 0) * (1 - u(i) * u(i))) * (1 + jit * 0.05 * (r() * 2 - 1)));
  }
  const laid = layout(spec.font, cased, spec.size, spec.tracking, scales, 0);
  const W = Math.max(1, laid.w);
  const A = (rh.arch ?? 0) * spec.size;
  const R = (rh.rise ?? 0) * spec.size;
  const shearT = Math.tan(((spec.shear ?? 0) * Math.PI) / 180);
  const cmds: Cmd[][] = laid.glyphs.map((g, i) => {
    const ui = u(i);
    // authored baseline: quadratic arch + linear rise (y-down coords)
    const base = -A * (1 - ui * ui) - R * ((ui + 1) / 2) + jit * spec.size * 0.03 * (r() * 2 - 1);
    // rotation follows the baseline tangent, plus a small seeded rough
    const slope = (4 * A * ui) / W - R / W;
    const rot = (rh.rotFollow ?? 0) * Math.atan(slope) + jit * 0.05 * (r() * 2 - 1);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const cx = g.center;
    return mapCmds(g.cmds, (px, py) => {
      const lx = px - cx, ly = py;
      let x2 = cx + lx * cs - ly * sn;
      let y2 = base + lx * sn + ly * cs;
      x2 -= shearT * y2; // forward energy: lean the whole role
      return [x2, y2];
    });
  });
  const b = boundsOf(cmds.flat());
  return { cmds, w: b.maxX - b.minX };
}

/** cmds → the appearance module's line shape (path + flattened polys). */
function toLine(cmds: Cmd[][], size: number): OutlineLine {
  const polys: [number, number][][] = [];
  for (const gc of cmds) {
    let cur: [number, number][] = [];
    for (const c of flatten(gc, size / 22)) {
      if (c.type === "M") { if (cur.length >= 3) polys.push(cur); cur = [[c.x!, c.y!]]; }
      else if (c.type === "L") cur.push([c.x!, c.y!]);
      else if (c.type === "Z") { if (cur.length >= 3) polys.push(cur); cur = []; }
    }
    if (cur.length >= 3) polys.push(cur);
  }
  const b = boundsOf(cmds.flat());
  return {
    d: cmds.map(cmdToD).join(""),
    polys,
    gy1: b.minY, gy2: b.maxY,
    glyphs: cmds.map((gc, i) => { const gb = boundsOf(gc); return { gi: i, x1: gb.minX, y1: gb.minY, x2: gb.maxX, y2: gb.maxY }; }),
  };
}

export interface CompiledTreatment {
  svg: string;
  /** same composition, flat #111 — the silhouette test */
  silhouette: string;
  w: number; h: number;
}

/** TEXT INTERPRETATION: split the user's words into roles. One word →
 *  hero alone. Two → support + hero. Three or more → first word is the
 *  support kicker, the rest join as the hero line. Explicit newlines win. */
function interpret(text: string): { support: string | null; hero: string } {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) return { support: lines[0], hero: lines.slice(1).join(" ") };
  const words = (lines[0] ?? "").split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { support: null, hero: words[0] ?? "" };
  if (words.length === 2) return { support: words[0], hero: words[1] };
  return { support: words[0], hero: words.slice(1).join(" ") };
}

/** RESPONSIVE VARIANT: long heroes calm down — tighter tracking, gentler
 *  rhythm — so the treatment survives any string without shrinking away. */
function calm(spec: RoleSpec, chars: number): RoleSpec {
  if (chars <= 8) return spec;
  const k = chars <= 12 ? 0.7 : 0.5;
  return {
    ...spec,
    tracking: spec.tracking * 0.6,
    rhythm: spec.rhythm ? {
      ...spec.rhythm,
      arch: (spec.rhythm.arch ?? 0) * k,
      centerScale: (spec.rhythm.centerScale ?? 0) * k,
      jitter: (spec.rhythm.jitter ?? 0) * 0.7,
    } : undefined,
  };
}

export function compileTreatment(text: string, t: Treatment, seed = 7): CompiledTreatment {
  const plan = interpret(text);
  const heroSpec = calm(t.hero, plan.hero.length);
  const hero = buildRole(plan.hero, heroSpec, seed);

  let support: BuiltRole | null = null;
  let supportSpec: RoleSpec | null = null;
  if (plan.support && t.support) {
    supportSpec = calm(t.support, plan.support.length);
    support = buildRole(plan.support, supportSpec, seed + 101);
    if (t.widthMatch) {
      /* width matching the wood-type way: resize the ROLE and re-run
         layout so tracking/kerning/rhythm stay honest at the new size.
         CONSTRAINT: a short support word never stretches to the hero's
         full measure — three letters can't draw the curve five can, and
         the reference lockups always let short kickers sit narrower. */
      const cap = Math.min(t.widthMatch, 0.3 + 0.16 * plan.support.length);
      const target = hero.w * cap;
      const k = target / Math.max(1, support.w);
      supportSpec = { ...supportSpec, size: supportSpec.size * k };
      support = buildRole(plan.support, supportSpec, seed + 101);
    }
  }

  // COMPOSITION: hero at origin; support centered above, gap or tuck
  const heroLine = toLine(hero.cmds, heroSpec.size);
  let supportLine: OutlineLine | null = null;
  if (support && supportSpec) {
    const sb = boundsOf(support.cmds.flat());
    const hb = { x1: Math.min(...heroLine.glyphs.map((g) => g.x1)), x2: Math.max(...heroLine.glyphs.map((g) => g.x2)) };
    const dx = (hb.x1 + hb.x2) / 2 - (sb.minX + sb.maxX) / 2;
    const dy = heroLine.gy1 - t.lineGap - sb.maxY;
    supportLine = toLine(support.cmds.map((gc) => mapCmds(gc, (x, y) => [x + dx, y + dy])), supportSpec.size);
  }

  // ORNAMENT: underline swash derived from the hero's bounds — a ribbon
  // curve below the baseline with a small return hook, treated like the
  // lockup (border under face), never hand-authored per word
  let ornament = "";
  let ornamentSil = "";
  if (t.ornament === "underline-swash") {
    const hx1 = Math.min(...heroLine.glyphs.map((g) => g.x1));
    const hx2 = Math.max(...heroLine.glyphs.map((g) => g.x2));
    const wSpan = hx2 - hx1;
    const y0 = heroLine.gy2 + heroSpec.size * 0.14;
    const dpath = `M${(hx1 + wSpan * 0.06).toFixed(1)} ${(y0 - heroSpec.size * 0.02).toFixed(1)} C${(hx1 + wSpan * 0.3).toFixed(1)} ${(y0 + heroSpec.size * 0.16).toFixed(1)} ${(hx1 + wSpan * 0.62).toFixed(1)} ${(y0 + heroSpec.size * 0.16).toFixed(1)} ${(hx2 - wSpan * 0.04).toFixed(1)} ${(y0 - heroSpec.size * 0.06).toFixed(1)}`;
    const faceP = typeof t.hero.stack[t.hero.stack.length - 2]?.paint === "string" ? t.hero.stack[t.hero.stack.length - 2].paint as string : "#F2E7CC";
    const borderE = t.hero.stack.find((e) => (e.expand ?? 0) > 4);
    const borderP = typeof borderE?.paint === "string" ? borderE!.paint as string : "#2A1710";
    const wSw = heroSpec.size * 0.085;
    ornament = `<path d="${dpath}" fill="none" stroke="${borderP}" stroke-width="${(wSw * 2.6).toFixed(1)}" stroke-linecap="round"/>` +
      `<path d="${dpath}" fill="none" stroke="${faceP}" stroke-width="${wSw.toFixed(1)}" stroke-linecap="round"/>`;
    ornamentSil = `<path d="${dpath}" fill="none" stroke="#111" stroke-width="${(wSw * 2.6).toFixed(1)}" stroke-linecap="round"/>`;
  }

  // APPEARANCE: per-role stacks, support first (hero paints over tucks)
  const defs: string[] = [];
  const body =
    (supportLine && supportSpec ? renderAppearanceLine(supportLine, supportSpec.stack, defs, "s") : "") +
    ornament +
    renderAppearanceLine(heroLine, heroSpec.stack, defs, "h");

  // silhouette: same geometry, flat ink, no blur/opacity
  const silStack = (st: AppearanceEntry[]) => st.filter((e) => !e.blur).map((e) => ({ ...e, paint: "#111", opacity: 1 }));
  const silDefs: string[] = [];
  const silBody =
    (supportLine && supportSpec ? renderAppearanceLine(supportLine, silStack(supportSpec.stack), silDefs, "ss") : "") +
    ornamentSil +
    renderAppearanceLine(heroLine, silStack(heroSpec.stack), silDefs, "hs");

  // frame
  const all = [heroLine, ...(supportLine ? [supportLine] : [])];
  const x1 = Math.min(...all.flatMap((l) => l.glyphs.map((g) => g.x1)));
  const x2 = Math.max(...all.flatMap((l) => l.glyphs.map((g) => g.x2)));
  const y1 = Math.min(...all.map((l) => l.gy1));
  const y2 = Math.max(...all.map((l) => l.gy2));
  const pad = 90;
  const vb = `${(x1 - pad).toFixed(0)} ${(y1 - pad).toFixed(0)} ${(x2 - x1 + pad * 2).toFixed(0)} ${(y2 - y1 + pad * 2.2).toFixed(0)}`;
  const w = Math.round(x2 - x1 + pad * 2), h = Math.round(y2 - y1 + pad * 2.2);
  const wrap = (inner: string, dfs: string[], stage: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}"><rect x="${(x1 - pad).toFixed(0)}" y="${(y1 - pad).toFixed(0)}" width="100%" height="100%" fill="${stage}"/><defs>${dfs.join("")}</defs>${inner}</svg>`;
  return { svg: wrap(body, defs, t.stage), silhouette: wrap(silBody, silDefs, "#FFFFFF"), w, h };
}
