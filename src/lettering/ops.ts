/* SPLASH LETTERING ENGINE — glyph-construction ops (sketch phase).

   The rules of this module:

   · every op MEASURES the actual outline geometry it modifies — gaps,
     stroke widths, penetration depths, negative-space profiles — and
     derives its parameters from those measurements, never from
     hardcoded per-string numbers;
   · every op has a GATE, and failing the gate means falling back to
     the untouched glyph (a boring letter beats a broken one);
   · counters are protected: no op may close or critically shrink an
     interior space;
   · everything is deterministic.

   Coordinates are font-render space: baseline y = 0, y grows DOWN
   (ascenders negative). */

import { flatten } from "@/splash/outline";
import type { Cmd } from "@/splash/outline";

export type Pt = [number, number];

/* ── measurement helpers ─────────────────────────────────────────── */

export const flatContours = (cmds: Cmd[], size: number): Pt[][] => {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const c of flatten(cmds, Math.min(2.5, size / 64))) {
    if (c.type === "M") { if (cur.length >= 3) out.push(cur); cur = [[c.x!, c.y!]]; }
    else if (c.type === "L") cur.push([c.x!, c.y!]);
    else if (c.type === "Z") { if (cur.length >= 3) out.push(cur); cur = []; }
  }
  if (cur.length >= 3) out.push(cur);
  return out;
};

const signedArea = (p: Pt[]): number => {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

const perimeter = (p: Pt[]): number => {
  let l = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    l += Math.hypot(x2 - x1, y2 - y1);
  }
  return l;
};

const inPoly = (x: number, y: number, poly: Pt[]): boolean => {
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** containment depth of each contour within its glyph: odd = counter */
export interface CounterInfo { count: number; minDim: number; totalArea: number }
export function counterStats(polys: Pt[][]): CounterInfo {
  let count = 0, minDim = Infinity, totalArea = 0;
  polys.forEach((p, i) => {
    let depth = 0;
    const [px, py] = p[0];
    polys.forEach((q, j) => { if (i !== j && inPoly(px, py, q)) depth++; });
    if (depth % 2 === 1) {
      count++;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [x, y] of p) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
      minDim = Math.min(minDim, Math.min(x2 - x1, y2 - y1));
      totalArea += Math.abs(signedArea(p));
    }
  });
  return { count, minDim: count ? minDim : Infinity, totalArea };
}

/** stroke-width estimate: ink area over half the boundary length */
export function strokeWidth(polys: Pt[][]): number {
  let area = 0, per = 0;
  const cs = counterStats(polys);
  for (const p of polys) { area += Math.abs(signedArea(p)); per += perimeter(p); }
  area -= 2 * cs.totalArea; // |counter| was summed in once; ink loses it twice
  return per > 1 ? Math.max(1, (2 * area) / per) : 1;
}

/** sorted x-crossings of all contours at row y */
export const rowXs = (polys: Pt[][], y: number): number[] => {
  const xs: number[] = [];
  for (const p of polys) for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    if (y1 > y === y2 > y) continue;
    xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  return xs.sort((a, b) => a - b);
};

/** sorted y-crossings at column x */
export const colYs = (polys: Pt[][], x: number): number[] => {
  const ys: number[] = [];
  for (const p of polys) for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    if (x1 > x === x2 > x) continue;
    ys.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1));
  }
  return ys.sort((a, b) => a - b);
};

export const boundsOfPolys = (polys: Pt[][]): { x1: number; y1: number; x2: number; y2: number } => {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

/* ── optical pair spacing ────────────────────────────────────────── */

export interface PairGapResult { gaps: number[]; adjust: number[] }

/** Measure each adjacent pair's PERCEIVED gap — the tight quartile of
 *  the horizontal clearances sampled across the pair's shared vertical
 *  band — and nudge advances toward the measured median. Metal-era
 *  logic: even the AIR, not the advances. */
export function opticalSpacing(glyphPolys: Pt[][][], size: number): PairGapResult | null {
  const n = glyphPolys.length;
  if (n < 3) return null;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const A = glyphPolys[i], B = glyphPolys[i + 1];
    if (!A.length || !B.length) { gaps.push(NaN); continue; }
    const ba = boundsOfPolys(A), bb = boundsOfPolys(B);
    const y1 = Math.max(ba.y1, bb.y1), y2 = Math.min(ba.y2, bb.y2);
    if (y2 - y1 < size * 0.08) { gaps.push(NaN); continue; }
    const vals: number[] = [];
    for (let k = 0; k < 28; k++) {
      const y = y1 + ((k + 0.5) / 28) * (y2 - y1);
      const xa = rowXs(A, y), xb = rowXs(B, y);
      if (!xa.length || !xb.length) continue;
      vals.push(xb[0] - xa[xa.length - 1]);
    }
    if (vals.length < 5) { gaps.push(NaN); continue; }
    vals.sort((a, b) => a - b);
    gaps.push(vals[Math.floor(vals.length * 0.25)]);
  }
  const real = gaps.filter((g) => !isNaN(g));
  if (real.length < 2) return null;
  const sorted = [...real].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const adjust = gaps.map((g) =>
    isNaN(g) ? 0 : Math.max(-0.08 * size, Math.min(0.08 * size, (median - g) * 0.7)),
  );
  return adjust.some((a) => Math.abs(a) > size * 0.004) ? { gaps, adjust } : null;
}

/* ── contextual overlap ──────────────────────────────────────────── */

/** How far can glyph B slide toward glyph A so the outlines weld by
 *  `targetDepth` px, measured as the mean positive penetration across
 *  shared rows? Returns the (negative) dx, or null when the pair never
 *  reaches the target within maxShift. */
export function solveOverlap(A: Pt[][], B: Pt[][], targetDepth: number, maxShift: number): number | null {
  if (!A.length || !B.length) return null;
  const ba = boundsOfPolys(A), bb = boundsOfPolys(B);
  const y1 = Math.max(ba.y1, bb.y1), y2 = Math.min(ba.y2, bb.y2);
  if (y2 - y1 < 4) return null;
  const rows: { ra: number; lb: number }[] = [];
  for (let k = 0; k < 24; k++) {
    const y = y1 + ((k + 0.5) / 24) * (y2 - y1);
    const xa = rowXs(A, y), xb = rowXs(B, y);
    if (!xa.length || !xb.length) continue;
    rows.push({ ra: xa[xa.length - 1], lb: xb[0] });
  }
  if (rows.length < 5) return null;
  // a weld wants contact through the BAND (a kiss at one row leaves
  // open white wedges), but two round bowls can never reach broad
  // contact without devouring each other — so settle for target depth
  // once digging further stops being lettering and starts being damage
  let atTarget: number | null = null;
  for (let s = 0; s <= 60; s++) {
    const dx = -(s / 60) * maxShift;
    let sum = 0, cnt = 0;
    for (const r of rows) { const p = r.ra - (r.lb + dx); if (p > 0) { sum += p; cnt++; } }
    if (!cnt) continue;
    const mean = sum / cnt;
    if (mean >= targetDepth && atTarget === null) atTarget = dx;
    if (mean >= targetDepth && cnt / rows.length >= 0.68) return dx;
    if (atTarget !== null && mean >= targetDepth * 1.9) return dx;
  }
  return atTarget;
}

/* ── terminal bands (swash tail / lead-in / underline return) ────── */

export interface TerminalBand { contour: Pt[]; anchor: Pt; tip: Pt }

const quad = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};

/** Build a tapered band from a DETECTED terminal anchor (the extreme
 *  baseline-zone point of the glyph's outline). Collision-gated
 *  against `avoid` ink: shortened ×0.72 up to three times, then
 *  abandoned. `dir` +1 exits right (tail), −1 exits left (lead-in). */
export function buildTerminal(
  polys: Pt[][], size: number, dir: 1 | -1,
  lenEm: number, dropEm: number, curve: number,
  avoid: Pt[][], underlineSweep?: { backToX: number; belowY: number },
): TerminalBand | null {
  // anchor: extreme point in the baseline zone
  let anchor: Pt | null = null;
  for (const p of polys) for (const [x, y] of p) {
    if (y < -0.5 * size || y > 0.15 * size) continue;
    if (!anchor || (dir === 1 ? x > anchor[0] : x < anchor[0])) anchor = [x, y];
  }
  if (!anchor) return null;
  const w0 = strokeWidth(polys);

  for (let attempt = 0, len = lenEm * size; attempt < 4; attempt++, len *= 0.72) {
    const drop = dropEm * size;
    let center: Pt[];
    if (underlineSweep) {
      // hug the glyph on the way down, then sweep back beneath the word
      const a: Pt = [anchor[0] + dir * len * 0.22, underlineSweep.belowY];
      const p1a: Pt = [anchor[0] + dir * len * 0.3, anchor[1] + (underlineSweep.belowY - anchor[1]) * 0.6];
      const b: Pt = [underlineSweep.backToX, underlineSweep.belowY + size * 0.02];
      const p1b: Pt = [(a[0] + b[0]) / 2, underlineSweep.belowY + size * 0.09];
      center = [];
      for (let i = 0; i <= 22; i++) center.push(quad(anchor, p1a, a, i / 22));
      for (let i = 1; i <= 22; i++) center.push(quad(a, p1b, b, i / 22));
    } else {
      const p2: Pt = [anchor[0] + dir * len, anchor[1] + drop];
      const p1: Pt = [anchor[0] + dir * len * 0.55, anchor[1] + drop * 0.2 - curve * 0.4 * size];
      center = [];
      for (let i = 0; i <= 34; i++) center.push(quad(anchor, p1, p2, i / 34));
    }
    // taper: attach at ~full stroke, held through the body, dying at
    // the tip — a pen lift, not a hairline the whole way
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i < center.length; i++) {
      const t = i / (center.length - 1);
      const body = t < 0.72 ? 0.98 - 0.4 * (t / 0.72) : 0.58 - 0.38 * ((t - 0.72) / 0.28);
      const w = (w0 * body) / 2;
      const p = center[i], q = center[Math.min(center.length - 1, i + 1)];
      const dxx = q[0] - p[0] || 1e-6, dyy = q[1] - p[1];
      const l = Math.hypot(dxx, dyy);
      left.push([p[0] - (dyy / l) * w, p[1] + (dxx / l) * w]);
      right.push([p[0] + (dyy / l) * w, p[1] - (dxx / l) * w]);
    }
    const contour = [...left, ...right.reverse()];
    // gate: no collision with other ink beyond the attach zone
    let hit = false;
    for (let i = 0; i < center.length && !hit; i++) {
      if (i / (center.length - 1) < 0.25) continue;
      const [cx, cy] = center[i];
      for (const g of avoid) { if (g.length && inPoly(cx, cy, g)) { hit = true; break; } }
    }
    if (!hit) return { contour, anchor, tip: center[center.length - 1] };
  }
  return null;
}

/* ── glyph-rigid line warps ──────────────────────────────────────── */

export interface RigidMove { dy: number; rot: number; scale: number }

/** Arch / flag / bulge / stagger as GLYPH-RIGID moves — each letter is
 *  rotated, shifted or scaled whole, never bent, so counters are
 *  structurally protected. Returns one move per glyph. */
export function rigidWarpMoves(
  centers: number[], lineW: number, size: number,
  warp: { kind: string; k: number },
): RigidMove[] {
  return centers.map((c, i) => {
    const u = lineW > 1 ? (2 * c) / lineW - 1 : 0; // −1..1 across the line
    switch (warp.kind) {
      case "arch": {
        const dy = -warp.k * size * (1 - u * u);
        const rot = (Math.atan((4 * warp.k * size * u) / Math.max(1, lineW)) * 180) / Math.PI;
        return { dy, rot, scale: 1 };
      }
      case "flag": {
        const dy = warp.k * size * u;
        const rot = (Math.atan((2 * warp.k * size) / Math.max(1, lineW)) * 180) / Math.PI;
        return { dy, rot, scale: 1 };
      }
      case "bulge":
        return { dy: 0, rot: 0, scale: 1 + warp.k * (1 - u * u) };
      case "stagger":
        return { dy: (i % 2 ? 1 : -1) * warp.k * size * 0.5, rot: (i % 2 ? -1 : 1) * warp.k * 8, scale: 1 };
      default:
        return { dy: 0, rot: 0, scale: 1 };
    }
  });
}

/* ── line interlock from measured negative space ─────────────────── */

export interface InterlockResult { dy: number; dx: number; minClearance: number }

/** How far can the lower line rise into the upper line's negative
 *  space? Bottom/top ink profiles are sampled per column; the tuck is
 *  the worst-case clearance minus the target gap. A small horizontal
 *  search lets ascenders find descender bays. Never a naive squeeze. */
export function solveInterlock(
  above: Pt[][], below: Pt[][], targetGap: number, dxRange: number,
): InterlockResult | null {
  if (!above.length || !below.length) return null;
  const ba = boundsOfPolys(above), bb = boundsOfPolys(below);
  const x1 = Math.min(ba.x1, bb.x1), x2 = Math.max(ba.x2, bb.x2);
  if (x2 - x1 < 8) return null;
  const N = 96;
  const bot: number[] = [], top: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = x1 + ((i + 0.5) / N) * (x2 - x1);
    const ya = colYs(above, x), yb = colYs(below, x);
    bot.push(ya.length ? ya[ya.length - 1] : -Infinity);
    top.push(yb.length ? yb[0] : Infinity);
  }
  const step = (x2 - x1) / N;
  let best: InterlockResult | null = null;
  const shifts = dxRange > 0 ? [-dxRange, -dxRange / 2, 0, dxRange / 2, dxRange] : [0];
  for (const dx of shifts) {
    const off = Math.round(dx / step);
    let clear = Infinity;
    for (let i = 0; i < N; i++) {
      const j = i - off;
      if (j < 0 || j >= N) continue;
      if (bot[i] === -Infinity || top[j] === Infinity) continue;
      clear = Math.min(clear, top[j] + 0 - bot[i]);
    }
    if (!isFinite(clear)) continue;
    const dy = clear - targetGap;
    if (!best || dy > best.dy) best = { dy, dx, minClearance: clear };
  }
  if (!best || best.dy <= 2) return null;
  return best;
}

/* ── counter-protection gate ─────────────────────────────────────── */

/** true when the modified glyph keeps healthy interior space */
export function countersOk(before: Pt[][], after: Pt[][], size: number): boolean {
  const b = counterStats(before), a = counterStats(after);
  if (a.count < b.count) return false;
  if (b.count === 0) return true;
  return a.minDim >= Math.min(b.minDim * 0.72, 0.045 * size) - 1e-6;
}

/** measured penetration between two glyphs' ink (0 = clear) */
export function measuredPenetration(A: Pt[][], B: Pt[][]): number {
  if (!A.length || !B.length) return 0;
  const ba = boundsOfPolys(A), bb = boundsOfPolys(B);
  const y1 = Math.max(ba.y1, bb.y1), y2 = Math.min(ba.y2, bb.y2);
  if (y2 <= y1) return 0;
  let worst = 0;
  for (let k = 0; k < 20; k++) {
    const y = y1 + ((k + 0.5) / 20) * (y2 - y1);
    const xa = rowXs(A, y), xb = rowXs(B, y);
    if (!xa.length || !xb.length) continue;
    // penetration of intervals, either direction
    const p = Math.min(xa[xa.length - 1], xb[xb.length - 1]) - Math.max(xa[0], xb[0]);
    if (p > worst) worst = p;
  }
  return Math.max(0, worst);
}
