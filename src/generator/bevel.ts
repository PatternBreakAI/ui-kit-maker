import type { GenConfig, GenStateName, EffectRole, Shape, KitComponentId, KitSize, IconDef, StateDesign } from "./model";
import { lighten, darken, hexMix, desaturate, saturate, hexRgba, fontByName, DEFAULT_ICON, ICONS_ENABLED, STOCK_ICONS, KIT_SHAPE , isDarkBg, userShapes } from "./model";
import { iconGroup } from "./icons";
import { silhouetteMeta } from "./silhouettes";
import { importedShape, flattenPath, pointInPoly, selfIntersections, type Pt } from "./importedShapes";
import { stockShape } from "./stockShapes";
import rough from "roughjs";

/* Rough.js draws the hand-drawn *line character* over the approved outline —
   it never designs the silhouette. Fixed seed keeps every render, state card,
   copied code and download byte-identical. Results are memoized per path. */
let roughGen: ReturnType<typeof rough.generator> | null = null;
const inkCache = new Map<string, string>();
function roughInk(d: string, color: string, sw: number): string {
  const key = `${d}|${color}|${sw}`;
  const hit = inkCache.get(key);
  if (hit !== undefined) return hit;
  roughGen ??= rough.generator();
  const drawable = roughGen.path(d, { seed: 7, roughness: 1.7, bowing: 0.9 });
  const out = `<g data-layer="ink" opacity="0.8">` + roughGen.toPaths(drawable)
    .map((p) => `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`)
    .join("") + `</g>`;
  if (inkCache.size > 80) inkCache.clear();
  inkCache.set(key, out);
  return out;
}

// Candy engine v9 — a hard-candy shell built from ordered, independently
// tokenized layers:
//   1 cast shadow   2 extrusion   3 outer rim   4 bevel wall   5 face gradient
//   6 inner edge    7 inner glow  8 curved gloss 9 sharp specular
//   10 lower bloom  11 micro texture  12 text & icon treatment
// Pure (config, state) → SVG string for canvas + copy + exports. The lighting
// angle is the single source of truth: every gradient, the shadow direction,
// the gloss side and the specular position derive from it.

let UID = 0;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ── shape paths ─────────────────────────────────────────────── */
function norm(dx: number, dy: number): [number, number] {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
function polyRounded(v: [number, number][], r: number): string {
  const n = v.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = v[i], prev = v[(i + n - 1) % n], next = v[(i + 1) % n];
    const inV = norm(p[0] - prev[0], p[1] - prev[1]);
    const outV = norm(next[0] - p[0], next[1] - p[1]);
    const a = [p[0] - inV[0] * r, p[1] - inV[1] * r], b = [p[0] + outV[0] * r, p[1] + outV[1] * r];
    d += (i === 0 ? `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} ` : `L ${a[0].toFixed(1)} ${a[1].toFixed(1)} `);
    d += `Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `;
  }
  return d + "Z";
}
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h / 2, w / 2);
  return `M ${x + rr} ${y} H ${x + w - rr} A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} V ${y + h - rr} A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h} H ${x + rr} A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr} V ${y + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`;
}
/* Deterministic hash for authored irregularity (hand-drawn) — same output
   every render, every export, every reload. */
function silhash(i: number): number {
  return ((((i + 7) * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
}
/* One straight run broken into gently wobbling segments — the hand-drawn ink
   line. Offsets are seeded, never random. */
function inkRun(x1: number, y1: number, x2: number, y2: number, wob: number, salt: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.round(len / 56));
  const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const tm = (i + 0.5) / n, t1 = (i + 1) / n;
    const off = silhash(salt + i) * 2 * wob;
    d += `Q ${(x1 + (x2 - x1) * tm + nx * off).toFixed(1)} ${(y1 + (y2 - y1) * tm + ny * off).toFixed(1)} ${(x1 + (x2 - x1) * t1).toFixed(1)} ${(y1 + (y2 - y1) * t1).toFixed(1)} `;
  }
  return d;
}

/* Scale raw SVG path data from its own box into (x, y, w, h). Handles
   M L H V C S Q T A Z, absolute and relative. Arc radii scale per-axis —
   exact under uniform scale; the import spec recommends bezier outlines. */
export function transformPath(d: string, vb: [number, number, number, number], x: number, y: number, w: number, h: number): string {
  const [vx, vy, vw, vh] = vb;
  const sx = w / (vw || 1), sy = h / (vh || 1);
  const toks = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let i = 0, cmd = "";
  const num = () => parseFloat(toks[i++]);
  const px = (v: number, rel: boolean) => (rel ? v * sx : x + (v - vx) * sx).toFixed(2);
  const py = (v: number, rel: boolean) => (rel ? v * sy : y + (v - vy) * sy).toFixed(2);
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase() && cmd !== "z" && cmd !== "Z";
    const C = cmd.toUpperCase();
    if (C === "Z") { out.push("Z"); continue; }
    if (C === "H") { out.push(rel ? "h" : "H", px(num(), rel)); continue; }
    if (C === "V") { out.push(rel ? "v" : "V", py(num(), rel)); continue; }
    if (C === "A") {
      const rx = num(), ry = num(), rot = num(), laf = num(), swf = num(), ex = num(), ey = num();
      out.push(rel ? "a" : "A", (rx * Math.abs(sx)).toFixed(2), (ry * Math.abs(sy)).toFixed(2),
        String(rot), String(laf), String(swf), px(ex, rel), py(ey, rel));
      continue;
    }
    const pairs = C === "C" ? 3 : C === "S" || C === "Q" ? 2 : 1; // M L T
    out.push(rel ? cmd : C);
    for (let k = 0; k < pairs; k++) { out.push(px(num(), rel), py(num(), rel)); }
  }
  return out.join(" ");
}

/** Cap-preserving vector three-slice: the outer `capSrc` source units at each
 *  end scale uniformly with height; only the center band stretches. One
 *  continuous outline — control points are remapped through a piecewise
 *  monotonic x-map, so there are no seams to hide. Falls back to uniform
 *  scaling when the frame is too narrow to hold both rigid caps. */
export function transformPathCapAware(d: string, vb: [number, number, number, number], x: number, y: number, w: number, h: number, capSrc: number): string {
  const [vx, vy, vw, vh] = vb;
  const sy = h / (vh || 1);
  const capW = capSrc * sy;
  const midSrc = vw - capSrc * 2;
  const midW = w - capW * 2;
  if (midSrc <= 4 || midW < midSrc * sy * 0.25) return transformPath(d, vb, x, y, w, h);
  const mx = (X: number): number => {
    const u = X - vx;
    if (u <= capSrc) return x + u * sy;
    if (u >= vw - capSrc) return x + w - (vw - u) * sy;
    return x + capW + (u - capSrc) * (midW / midSrc);
  };
  const my = (Y: number): number => y + (Y - vy) * sy;
  const toks = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let i = 0, cmd = "";
  let cx = vx, cy = vy;
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase() && cmd.toUpperCase() !== "Z";
    const C = cmd.toUpperCase();
    if (C === "Z") { out.push("Z"); continue; }
    if (C === "H") { const X = rel ? cx + num() : num(); out.push("L", mx(X).toFixed(2), my(cy).toFixed(2)); cx = X; continue; }
    if (C === "V") { const Y = rel ? cy + num() : num(); out.push("L", mx(cx).toFixed(2), my(Y).toFixed(2)); cy = Y; continue; }
    if (C === "A") {
      const rxx = num(), ryy = num(), rot = num(), laf = num(), swf = num();
      const X = rel ? cx + num() : num(), Y = rel ? cy + num() : num();
      out.push("A", (rxx * sy).toFixed(2), (ryy * sy).toFixed(2), String(rot), String(laf), String(swf), mx(X).toFixed(2), my(Y).toFixed(2));
      cx = X; cy = Y; continue;
    }
    const pairs = C === "C" ? 3 : C === "S" || C === "Q" ? 2 : 1; // M L T
    out.push(C);
    for (let p = 0; p < pairs; p++) {
      const X = rel ? cx + num() : num(), Y = rel ? cy + num() : num();
      out.push(mx(X).toFixed(2), my(Y).toFixed(2));
      if (p === pairs - 1) { cx = X; cy = Y; }
    }
  }
  return out.join(" ");
}

/* ── true inward offset (Illustrator "Offset Path") ────────────────────────
   Scaling a silhouette into a smaller box is NOT a geometric offset: bumps
   and notches drift, walls pinch, faces escape (measured in the lab). This
   derives the inner shape the way Illustrator does — offset every edge,
   join with miters (bevel past the limit), then resolve the raw tangled
   ring the planar-map way: split at every self-crossing and keep only the
   loops that wind like the source (the non-zero rule). Pinched shapes
   become multiple islands, exactly as Offset Path outputs them.

   Arc-command paths (pill/round rects) are declined by the caller and keep
   the classic scaled inset — their convex geometry never suffered from it. */
const OFFSET_CACHE = new Map<string, string>();
function distToBoundary(p: Pt, poly: Pt[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < min) min = d;
  }
  return min;
}
function simplifyDP(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y;
      const L = Math.hypot(dx, dy) || 1;
      const d = Math.abs((pts[i].x - pts[a].x) * dy - (pts[i].y - pts[a].y) * dx) / L;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps && maxI > 0) { keep[maxI] = true; stack.push([a, maxI], [maxI, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function offsetPathInward(d: string, delta: number): string {
  if (delta <= 0.05) return d;
  const key = `${delta.toFixed(2)}|${d}`;
  const hit = OFFSET_CACHE.get(key);
  if (hit !== undefined) return hit;
  /* Multi-loop silhouettes are first-class: an imported ribbon banner is a
     center panel plus two swallowtail flaps as SEPARATE islands, and every
     island deserves the same face/rim construction. Each solid loop offsets
     independently; a loop the wall consumes (thinner than 2δ) drops alone.
     A loop contained in another is a counter-hole — it passes through
     unoffset so the face keeps the hole without the rim inverting it. */
  const loopsIn = flattenPath(d, 14).filter((l) => l.length >= 3);
  const outs: string[] = [];
  let solidHits = 0;
  for (let li2 = 0; li2 < loopsIn.length; li2++) {
    const raw = loopsIn[li2];
    const isHole = loopsIn.some((other, oi) => oi !== li2 && other.length >= 3 && pointInPoly(raw[0], other));
    if (isHole) {
      outs.push("M " + raw.map((p) => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(" L ") + " Z");
      continue;
    }
    const one = ringOffsetInward(raw, delta);
    if (one) { solidHits++; outs.push(one); }
  }
  // no solid loop survived → report failure so callers use their fallback
  const dOut = solidHits === 0 ? "" : outs.join(" ");
  if (OFFSET_CACHE.size > 400) OFFSET_CACHE.clear();
  OFFSET_CACHE.set(key, dOut);
  return dOut;
}
function ringOffsetInward(raw: Pt[], delta: number): string {
  // dedupe — shared corner endpoints from L/Q handoffs make zero-length edges
  const dd: Pt[] = [];
  for (const p of raw) {
    const last = dd[dd.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.25) dd.push(p);
  }
  if (dd.length > 2 && Math.hypot(dd[0].x - dd[dd.length - 1].x, dd[0].y - dd[dd.length - 1].y) < 0.25) dd.pop();
  if (dd.length < 6) return "";
  /* rotate the ring so it starts mid-way along the LONGEST edge — the DP
     simplifier pins its endpoints, and a start point sitting inside a
     rounded corner would leave un-collapsible seam vertices there */
  let rl = 0, ri = 0;
  for (let i = 0; i < dd.length; i++) {
    const L = Math.hypot(dd[(i + 1) % dd.length].x - dd[i].x, dd[(i + 1) % dd.length].y - dd[i].y);
    if (L > rl) { rl = L; ri = i; }
  }
  const rot = dd.slice(ri + 1).concat(dd.slice(0, ri + 1));
  const mid0 = { x: (rot[rot.length - 1].x + rot[0].x) / 2, y: (rot[rot.length - 1].y + rot[0].y) / 2 };
  const ring = [mid0, ...rot];
  /* attempt ladder: the strict tolerance keeps real curves curved. But when
     soft corner roundings (r slightly above delta) sit right next to acute
     tail tips, their surviving chords separate the two edges whose miter
     must synthesize the receding tip — every corner candidate lands in the
     thin wedge and gets culled, stranding the offset. Retrying with coarser
     collapse turns those corners into sharp vertices, which is the correct
     offset limit there: the wall consumes (r − delta ≈ 0) of rounding. */
  let dOut = "";
  /* rung 0 — fidelity: a sub-pixel tolerance keeps every curve sample, so
     organic outlines offset as dense rings the cubic refit can smooth
     through (measured: the old 4.5px cap left ~18 chord kinks >15° per
     blob). Micro-rounded sharp shapes legitimately strand this attempt —
     their corner candidates all land in thin wedges — and fall through to
     the classic ladder below, whose coarser collapse is what synthesizes
     their miter tips. */
  dOut = offsetAttempt(ring, delta, Math.min(0.9, delta * 0.3), 1.1, delta * 0.8);
  if (!dOut) for (const k of [0.3, 0.55, 0.85]) {
    const eps = Math.min(k === 0.3 ? 4.5 : 8, delta * k);
    /* retries also relax the pinch cull by eps: the chordified boundary sits
       inside the true curve by up to eps, so a genuinely clear point can
       measure up to eps short — the excision pass then resolves the tiny
       tip crossings those borderline points create */
    const cullT = k === 0.3 ? delta * 0.8 : Math.max(delta * 0.5, delta * 0.8 - eps);
    dOut = offsetAttempt(ring, delta, eps, Math.max(1.5, delta * k), cullT);
    if (dOut) break;
  }
  return dOut;
}
function offsetAttempt(ring: Pt[], delta: number, eps: number, mergeR: number, cullT: number): string {
  /* pre-simplify the SOURCE: micro-roundings (r « delta) collapse to sharp
     vertices so their two straight neighbors become adjacent — that's what
     lets the miter join synthesize the receding tip an offset demands.
     Real curves deviate more than the tolerance and keep their samples. */
  const dp = simplifyDP(ring, eps);
  // merge residual near-corner duplets into single sharp vertices
  // (clone — merging averages in place, and the ring is shared by retries)
  const poly: Pt[] = [];
  for (const q of dp) {
    const p = { x: q.x, y: q.y };
    const last = poly[poly.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < mergeR) {
      last.x = (last.x + p.x) / 2; last.y = (last.y + p.y) / 2;
    } else poly.push(p);
  }
  if (poly.length > 2 && Math.hypot(poly[0].x - poly[poly.length - 1].x, poly[0].y - poly[poly.length - 1].y) < mergeR) poly.pop();
  // drop collinear leftovers (incl. the pinned ring-start) — they read as
  // tiny seam kinks on stroked results
  for (let i = poly.length - 1; i >= 0 && poly.length > 4; i--) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
    const L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const dev = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / L;
    if (dev < 0.2) poly.splice(i, 1);
  }
  const n = poly.length;
  if (n < 5) return "";
  // per-EDGE inward normals; side picked empirically on the longest edge
  let li = 0, ll = 0;
  for (let i = 0; i < n; i++) {
    const L = Math.hypot(poly[(i + 1) % n].x - poly[i].x, poly[(i + 1) % n].y - poly[i].y);
    if (L > ll) { ll = L; li = i; }
  }
  const A0 = poly[li], B0 = poly[(li + 1) % n];
  const el = Math.hypot(B0.x - A0.x, B0.y - A0.y) || 1;
  let pnx = (B0.y - A0.y) / el, pny = -(B0.x - A0.x) / el;
  if (!pointInPoly({ x: (A0.x + B0.x) / 2 + pnx * Math.min(2, delta), y: (A0.y + B0.y) / 2 + pny * Math.min(2, delta) }, poly)) { pnx = -pnx; pny = -pny; }
  const side = pnx * (B0.y - A0.y) - pny * (B0.x - A0.x) > 0 ? 1 : -1;
  const dirs: Pt[] = [], nrm: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    dirs.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
    nrm.push({ x: side * (b.y - a.y) / L, y: side * -(b.x - a.x) / L });
  }
  /* Illustrator-style miter joins: intersect each pair of adjacent offset
     edge LINES. This is what synthesizes the NEW vertices an offset needs —
     e.g. the receding tail tips of a swallowtail — which per-vertex normal
     displacement can never produce. */
  const cand: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const eP = (i + n - 1) % n;
    const p = poly[i];
    const ax = p.x + nrm[eP].x * delta, ay = p.y + nrm[eP].y * delta;
    const bx = p.x + nrm[i].x * delta, by = p.y + nrm[i].y * delta;
    const den = dirs[eP].x * dirs[i].y - dirs[eP].y * dirs[i].x;
    if (Math.abs(den) < 1e-4) {
      cand.push({ x: (ax + bx) / 2, y: (ay + by) / 2 });
    } else {
      const t = ((bx - ax) * dirs[i].y - (by - ay) * dirs[i].x) / den;
      const q = { x: ax + dirs[eP].x * t, y: ay + dirs[eP].y * t };
      // past the miter limit, Illustrator bevels: keep BOTH offset endpoints
      // instead of averaging them into a dent
      if (Math.hypot(q.x - p.x, q.y - p.y) > delta * 8) cand.push({ x: ax, y: ay }, { x: bx, y: by });
      else cand.push(q);
    }
  }
  /* ── the Illustrator cleanup, done the way Illustrator does it ──
     The raw mitered ring legitimately self-intersects wherever the wall
     consumes a feature (concave joins loop backwards, pinched waists cross).
     Instead of guessing which crossings to excise, resolve them the planar-
     map way: insert every crossing as a vertex, split the ring into simple
     loops, and keep only loops that wind the SAME WAY as the source — the
     backwards tangles vanish exactly as they do under the non-zero winding
     rule. Pinched shapes correctly become multiple islands. */
  const shoelaceS = (ps: Pt[]) => { let s = 0; for (let i2 = 0; i2 < ps.length; i2++) { const a2 = ps[i2], b2 = ps[(i2 + 1) % ps.length]; s += a2.x * b2.y - b2.x * a2.y; } return s / 2; };
  const srcSign = Math.sign(shoelaceS(poly)) || 1;
  const loops = splitSimpleLoops(cand);
  const minArea = Math.max(6, delta * delta * 0.5);
  const centroid = (ps: Pt[]) => { let sx = 0, sy2 = 0; for (const p of ps) { sx += p.x; sy2 += p.y; } return { x: sx / ps.length, y: sy2 / ps.length }; };
  const kept: Pt[][] = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const ar = shoelaceS(loop);
    if (Math.sign(ar) !== srcSign || Math.abs(ar) < minArea) continue; // backwards tangle or sliver
    if (!pointInPoly(centroid(loop), poly)) continue;
    // a valid offset loop keeps distance from the source wall — spot-check a
    // few vertices; chordification slack mirrors the retry ladder's eps
    let ok = 0, checked = 0;
    for (let s2 = 0; s2 < loop.length; s2 += Math.max(1, Math.floor(loop.length / 8))) {
      checked++;
      if (distToBoundary(loop[s2], poly) >= cullT) ok++;
    }
    if (ok < checked * 0.7) continue;
    const out = simplifyDP(loop, 0.35).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    // per-loop guarantee on the exact rounded points that ship: a loop that
    // still crosses after simplify+rounding is dropped alone
    if (out.length < 3 || selfIntersections(out) > 0) continue;
    kept.push(out);
  }
  if (!kept.length) return "";
  // total-area sanity vs the source — islands legitimately shrink more than
  // a single ring, so the floor is lower than the old single-loop check
  const total = kept.reduce((s3, l) => s3 + Math.abs(shoelaceS(l)), 0);
  if (total < Math.abs(shoelaceS(poly)) * 0.25) return "";
  kept.sort((a2, b2) => Math.abs(shoelaceS(b2)) - Math.abs(shoelaceS(a2)));
  // the refit's cubics can bow past a sub-pixel neck the polyline check
  // cleared — re-verify each SMOOTHED loop and keep the straight-line
  // serialization for any loop the curves would fold (review finding)
  return kept.map((l) => {
    const sm = smoothLoopPath(l);
    if (sm.includes("C")) {
      const flat = flattenPath(sm, 8)[0];
      if (!flat || selfIntersections(flat) > 0) return "M " + l.map((p) => `${p.x} ${p.y}`).join(" L ") + " Z";
    }
    return sm;
  }).join(" ");
}

/* ── cubic refit: the cure for chorded offsets ────────────────────────────
   The planar-map machinery necessarily works on polylines, but its output
   vertices LIE ON the true offset curve — so interpolating cubics through
   them recovers the smooth boundary the chords destroyed. Corner-aware:
   a vertex turning harder than ~35° is a real corner (the offset limit of
   a consumed rounding — hex points, banner tails, miter tips) and stays
   sharp; an edge far longer than both neighbours is a genuine straight
   (DP collapses collinear runs to one span) and stays a line. Everything
   else gets a Catmull-Rom-style tangent — central difference, handles at
   a third of the chord — which is G1 through every sample and cannot
   overshoot further than the handle. Sharp silhouettes classify as all
   corners and emit the exact polyline they always did. */
function smoothLoopPath(l: Pt[]): string {
  const n = l.length;
  const line = () => "M " + l.map((p) => `${p.x} ${p.y}`).join(" L ") + " Z";
  if (n < 8) return line();
  const len: number[] = [], dir: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = l[i], b = l[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    len.push(L); dir.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
  }
  const COS35 = 0.819;
  const corner: boolean[] = [], lineE: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const dp = dir[(i + n - 1) % n];
    corner.push(dp.x * dir[i].x + dp.y * dir[i].y < COS35);
    lineE.push(len[i] > 24 && len[i] > 3 * Math.max(len[(i + n - 1) % n], len[(i + 1) % n]));
  }
  if (corner.every(Boolean)) return line();
  const R = (v: number) => Math.round(v * 10) / 10;
  let out = `M ${l[0].x} ${l[0].y}`;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // chord-tangent (one-sided) at run boundaries: corners, and the ends of
    // straight spans — averaging across either would bow them
    const aCh = corner[i] || lineE[(i + n - 1) % n];
    const bCh = corner[j] || lineE[j];
    if (lineE[i] || (aCh && bCh)) { out += ` L ${l[j].x} ${l[j].y}`; continue; }
    const t0 = aCh ? dir[i] : tangentAt(l, i, n);
    const t1 = bCh ? dir[i] : tangentAt(l, j, n);
    const k3 = len[i] / 3;
    out += ` C ${R(l[i].x + t0.x * k3)} ${R(l[i].y + t0.y * k3)} ${R(l[j].x - t1.x * k3)} ${R(l[j].y - t1.y * k3)} ${l[j].x} ${l[j].y}`;
  }
  return out + " Z";
}
function tangentAt(l: Pt[], i: number, n: number): Pt {
  const p = l[(i + n - 1) % n], q = l[(i + 1) % n];
  const tx = q.x - p.x, ty = q.y - p.y;
  const L = Math.hypot(tx, ty) || 1e-6;
  return { x: tx / L, y: ty / L };
}

/* Split a (possibly self-intersecting) closed ring into simple loops:
   insert every pairwise edge crossing as a shared node, then walk the ring
   with a stack — when a node repeats, the span between its two visits pops
   out as one simple loop. Standard planar decomposition, O(n²) on rings of
   ~40–120 points (cached upstream). */
function splitSimpleLoops(ring: Pt[]): Pt[][] {
  const m = ring.length;
  if (m < 3) return [];
  type Ins = { t: number; node: number };
  const perEdge: Ins[][] = Array.from({ length: m }, () => []);
  const nodes: Pt[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      const a = ring[i], b = ring[(i + 1) % m], c = ring[j], d = ring[(j + 1) % m];
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t <= 1e-3 || t >= 1 - 1e-3 || u <= 1e-3 || u >= 1 - 1e-3) continue;
      const node = nodes.length;
      nodes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      perEdge[i].push({ t, node });
      perEdge[j].push({ t: u, node });
    }
  }
  if (!nodes.length) return [ring];
  type Item = { p: Pt; node: number };
  const seq: Item[] = [];
  for (let i = 0; i < m; i++) {
    seq.push({ p: ring[i], node: -1 });
    perEdge[i].sort((A, B) => A.t - B.t);
    for (const ins of perEdge[i]) seq.push({ p: nodes[ins.node], node: ins.node });
  }
  const loops: Pt[][] = [];
  const stack: Item[] = [];
  const openAt = new Map<number, number>();
  for (const it of seq) {
    const at = it.node >= 0 ? openAt.get(it.node) : undefined;
    if (at !== undefined) {
      const span = stack.splice(at);
      loops.push(span.map((x) => x.p));
      for (const [nd, idx] of [...openAt]) if (idx >= at) openAt.delete(nd);
    }
    if (it.node >= 0) openAt.set(it.node, stack.length);
    stack.push(it);
  }
  if (stack.length >= 3) loops.push(stack.map((x) => x.p));
  return loops;
}

/** Effective wall width for a shape. The banner's tail geometry only reads
 *  clean between 13 and 33 (review-measured), so the renderer clamps what
 *  it consumes — stale or shared configs can't break the tails. `off` drops
 *  the wall entirely: the face fills the whole silhouette. */
export function effectiveWall(width: number, shape: Shape, off?: boolean): number {
  if (off) return 0;
  return shape === "banner" ? Math.min(33, Math.max(13, width)) : width;
}

/** Inner shape at true offset `delta` — falls back to the classic scaled
 *  inset for arc-built paths (pill/round — convex, scaling was never wrong)
 *  and for offsets too deep to survive. */
/* ── portable drop shadow (SVG 1.1) ───────────────────────────────────
   `feDropShadow` is NOT part of SVG 1.1 — it arrived later, in the Filter
   Effects module. Importers that target 1.1 (Illustrator, Affinity,
   Sketch, Inkscape) treat a filter referencing an unknown primitive as an
   error, and the spec says an element in error is NOT RENDERED. That is
   exactly why exported type used to arrive in the layer tree but paint
   nothing: our shells filter with feGaussianBlur / feTurbulence /
   feColorMatrix (all 1.1, all fine) while our TEXT filtered with
   feDropShadow.

   This chain is the portable equivalent — blur the alpha, offset it, flood
   it with the shadow colour, mask, and merge back under the source. It
   rasterizes identically in browsers and parses everywhere.

   Pass `inp`/`out` to stack several: each stage reads the previous merge. */
let SH11 = 0;
export function shadow11(
  dx: number | string, dy: number | string, dev: number | string,
  color: string, op: number | string,
  inp = "SourceGraphic", out?: string,
): string {
  const u = "d" + SH11++;
  const d = typeof dev === "number" ? dev.toFixed(1) : dev;
  return `<feGaussianBlur in="${inp}" stdDeviation="${d}" result="${u}b"/>`
    + `<feOffset in="${u}b" dx="${dx}" dy="${dy}" result="${u}o"/>`
    + `<feFlood flood-color="${color}" flood-opacity="${op}" result="${u}c"/>`
    + `<feComposite in="${u}c" in2="${u}o" operator="in" result="${u}s"/>`
    + `<feMerge${out ? ` result="${out}"` : ""}><feMergeNode in="${u}s"/><feMergeNode in="${inp}"/></feMerge>`;
}

/** Stack shadow specs into one 1.1-safe chain, each reading the last. */
type ShadowSpec = [number | string, number | string, number | string, string, number | string];
export function shadowChain11(specs: ShadowSpec[]): string {
  return specs.map((s, i) => shadow11(
    s[0], s[1], s[2], s[3], s[4],
    i === 0 ? "SourceGraphic" : `m${i - 1}`,
    i === specs.length - 1 ? undefined : `m${i}`,
  )).join("");
}

/* Exact inward offset for polyRounded silhouettes. A polyRounded path
   carries its TRUE corner vertices as the Q control points, so instead of
   flatten → simplify → offset (whose chord tolerance leaves ~eps-sized
   pockets at corner junctions — the visible "kinks" on crisp shells), we
   shift each edge inward by delta along its normal and re-intersect.
   Corner rounding shrinks by delta (the wall consumes it), floored sharp —
   the true parallel-offset limit. Returns "" when the path isn't strict
   polyRounded output (mid-edge Q wobbles, arcs, curves) or the inset
   degenerates — callers fall through to the general machinery. */
function polyRoundedInset(d: string, delta: number): string {
  const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  // strict shape: M x y Q x y x y (L x y Q x y x y)* Z — one Q per corner
  const pts: [number, number][] = [];
  let firstA: [number, number] | null = null;
  let i = 0;
  const num = () => parseFloat(toks[i++] as string);
  if (toks[i++] !== "M") return "";
  firstA = [num(), num()];
  if (toks[i++] !== "Q") return "";
  pts.push([num(), num()]); i += 2; // control = vertex; skip the exit point
  while (i < toks.length && toks[i] !== "Z") {
    if (toks[i++] !== "L") return "";
    i += 2;
    if (toks[i++] !== "Q") return "";
    pts.push([num(), num()]); i += 2;
  }
  // single loop only — a second M after the Z means islands (imported
  // banners): silently insetting just the first loop would eat the rest
  if (toks[i] !== "Z" || i !== toks.length - 1 || pts.length < 3 || pts.length > 16) return "";
  const r0 = Math.hypot(pts[0][0] - firstA[0], pts[0][1] - firstA[1]);
  // interior side: signed area decides which normal points inward
  const n = pts.length;
  let area = 0;
  for (let j = 0; j < n; j++) area += pts[j][0] * pts[(j + 1) % n][1] - pts[(j + 1) % n][0] * pts[j][1];
  const sgn = area > 0 ? 1 : -1;
  const shifted: { px: number; py: number; ex: number; ey: number }[] = [];
  for (let j = 0; j < n; j++) {
    const a = pts[j], c = pts[(j + 1) % n];
    const ex = c[0] - a[0], ey = c[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-6) return "";
    const nx = (sgn * -ey) / len, ny = (sgn * ex) / len;
    shifted.push({ px: a[0] + nx * delta, py: a[1] + ny * delta, ex, ey });
  }
  const inset: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const A = shifted[(j + n - 1) % n], B = shifted[j]; // edges meeting at vertex j
    const den = A.ex * B.ey - A.ey * B.ex;
    if (Math.abs(den) < 1e-9) { inset.push([B.px, B.py]); continue; }
    const t = ((B.px - A.px) * B.ey - (B.py - A.py) * B.ex) / den;
    inset.push([A.px + A.ex * t, A.py + A.ey * t]);
  }
  // degenerate walls (delta past the inradius) flip the winding — bail out
  let area2 = 0;
  for (let j = 0; j < n; j++) area2 += inset[j][0] * inset[(j + 1) % n][1] - inset[(j + 1) % n][0] * inset[j][1];
  if (area2 * area <= 0 || Math.abs(area2) < 4) return "";
  // a locally collapsed edge (concave corner eating its neighbour) reverses
  // direction — the general machinery handles those better than a miter
  for (let j = 0; j < n; j++) {
    const a = inset[j], c = inset[(j + 1) % n];
    if ((c[0] - a[0]) * shifted[j].ex + (c[1] - a[1]) * shifted[j].ey <= 0) return "";
  }
  /* Concentric rounding. The true parallel offset shrinks corner rounding
     arithmetically (r − δ: the wall consumes it), which at heavy softness
     puts a nearly-crisp inner inside a marshmallow outer — it reads as the
     inner "not following the silhouette". Scale the arm by the shape's own
     shrink factor instead — √(area ratio), the similar-shape scale — so the
     inner echoes the outer's roundness at every softness. Clamped to half
     the shortest inset edge: polyRounded applies the arm blindly, and
     overlapping arms would fold the path. */
  let shortest = Infinity;
  for (let j = 0; j < n; j++) {
    const a = inset[j], c = inset[(j + 1) % n];
    shortest = Math.min(shortest, Math.hypot(c[0] - a[0], c[1] - a[1]));
  }
  const out = polyRounded(inset, Math.min(r0 * Math.sqrt(Math.abs(area2 / area)), shortest * 0.49));
  /* The clamp above is GLOBAL: one short inset edge anywhere starves the
     arm at every corner, and an arm below the parallel radius (r0 − δ)
     leaves a near-sharp inner corner poking OUTSIDE the outer's arc —
     verified live on notch/shield/crest/polybar/explorer at small frames,
     high softness, rim-scale deltas (Front Door fleet find, 2026-07-30;
     worst escape 2.7px). Geometry is cheaper to measure than to bound:
     a candidate that escapes the outer is invalid here and falls through
     to the general offset machinery, which stays inside by construction. */
  const outerPoly = flattenPath(d, 10)[0];
  if (outerPoly && outerPoly.length > 2) {
    for (const pt of flattenPath(out, 10)[0] ?? []) {
      if (!pointInPoly(pt, outerPoly) && distToBoundary(pt, outerPoly) > 0.4) return "";
    }
  }
  return out;
}

export function insetShape(shape: Shape, outer: string, x: number, y: number, w: number, h: number, delta: number, softness: number): string {
  if (!/[Aa]/.test(outer)) {
    const exact = polyRoundedInset(outer, delta);
    if (exact) return exact;
    const off = offsetPathInward(outer, delta);
    if (off) return off;
  }
  return shapePath(shape, x + delta, y + delta, w - delta * 2, h - delta * 2, softness);
}

/* Authored artwork — stock or user-imported — keeps its character: fill the
   frame, but never distort the drawn proportions by more than ~1.4x in either
   axis. Beyond that the silhouette scales true-to-shape and centers. */
function fitArtwork(d: string, vb: [number, number, number, number], x: number, y: number, w: number, h: number): string {
  const [, , vw, vh] = vb;
  const natural = (vw || 1) / (vh || 1);
  const stretch = (w / h) / natural;
  const MAXS = 1.42;
  let w2 = w, h2 = h;
  if (stretch > MAXS) w2 = h * natural * MAXS;            // frame far wider than the art
  else if (stretch < 1 / MAXS) h2 = (w / natural) * MAXS; // frame far taller than the art
  return transformPath(d, vb, x + (w - w2) / 2, y + (h - h2) / 2, w2, h2);
}

/* ── horizontal mirror at the path level ─────────────────────────────────
   One transform covers every shape class — procedural (arcs included),
   stock artwork and user imports — because it rewrites the EMITTED path:
   absolute x-coords reflect around the axis, relative dx negate, H stays
   H, arcs flip their sweep and negate their rotation. Winding reverses,
   which every consumer already tolerates (imports arrive either-handed). */
const MIRROR_ARGN: Record<string, number> = { m: 2, l: 2, t: 2, c: 6, s: 4, q: 4, h: 1, v: 1, a: 7, z: 0 };
export function mirrorPathX(d: string, cx: number): string {
  const toks = d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  let out = "", i = 0, cmd = "";
  const flipAbs = (v: number) => 2 * cx - v;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const lower = cmd.toLowerCase();
    const argn = MIRROR_ARGN[lower];
    if (argn === undefined) return d; // unknown command — bail unmirrored
    const rel = cmd === lower;
    out += cmd;
    if (argn === 0) { continue; }
    const args = toks.slice(i, i + argn).map(Number);
    i += argn;
    if (lower === "h") args[0] = rel ? -args[0] : flipAbs(args[0]);
    else if (lower === "v") { /* untouched */ }
    else if (lower === "a") {
      args[2] = -args[2];               // x-axis rotation mirrors
      args[4] = args[4] ? 0 : 1;        // sweep flips
      args[5] = rel ? -args[5] : flipAbs(args[5]);
    } else {
      for (let k2 = 0; k2 < argn; k2 += 2) args[k2] = rel ? -args[k2] : flipAbs(args[k2]);
    }
    out += " " + args.map((v) => (Math.round(v * 100) / 100)).join(" ") + " ";
  }
  return out;
}

export function shapePath(shape: Shape, x: number, y: number, w: number, h: number, softness: number): string {
  // a ~flip id renders its base mirrored around the frame's center line
  if (shape.endsWith("~flip")) return mirrorPathX(shapePath(shape.slice(0, -5) as Shape, x, y, w, h, softness), x + w / 2);
  const imp = importedShape(shape);
  if (imp) {
    // Feasibility-lab imports fill the frame exactly — the lab exists to
    // observe stretch behavior, so no distortion cap applies here. The
    // `:caps` suffix opts a render into the three-slice experiment.
    if (shape.endsWith(":caps")) return transformPathCapAware(imp.path, imp.viewBox, x, y, w, h, imp.capSrc);
    return transformPath(imp.path, imp.viewBox, x, y, w, h);
  }
  if (shape.startsWith("stock:")) {
    const st = stockShape(shape);
    // Stock artwork is authored the same way an import is, so it earns the
    // same treatment: fill the frame, but never distort the drawn
    // proportions past ~1.4x in either axis (see the user: branch below).
    if (st) return fitArtwork(st.d, st.vb, x, y, w, h);
  }
  if (shape.startsWith("user:")) {
    const us = userShapes().find((u) => u.id === shape);
    if (us) {
      return fitArtwork(us.d, us.vb, x, y, w, h);
    }
    return roundRect(x, y, w, h, 4 + softness * 0.52); // registry miss — neutral fallback
  }
  if (shape === "pill") return roundRect(x, y, w, h, h / 2);
  if (shape === "round") return roundRect(x, y, w, h, 4 + softness * 0.52);
  if (shape === "speech") {
    // speech bubble — rounded body + down-left tail as ONE silhouette, so
    // bevel, gloss, glow, extrusion and shadow all wear the tail too. The
    // tail lives inside the frame (bottom band), which keeps every consumer
    // of x/y/w/h honest about the footprint.
    const tailH = Math.min(h * 0.22, 30);
    const bodyH = h - tailH;
    const r = Math.min(Math.min(w, bodyH) * 0.28, 10 + softness * 0.55);
    const yB = y + bodyH;
    const x1 = x + Math.min(w * 0.14, 60);
    const tw = Math.min(w * 0.13, 46);
    const x2 = x1 + tw;
    const tipX = Math.max(x + 2, x1 - tw * 0.6);
    const R = (n: number) => n.toFixed(1);
    return `M ${R(x + r)} ${R(y)} H ${R(x + w - r)} A ${R(r)} ${R(r)} 0 0 1 ${R(x + w)} ${R(y + r)} V ${R(yB - r)} A ${R(r)} ${R(r)} 0 0 1 ${R(x + w - r)} ${R(yB)} H ${R(x2)} L ${R(tipX)} ${R(y + h)} L ${R(x1)} ${R(yB)} H ${R(x + r)} A ${R(r)} ${R(r)} 0 0 1 ${R(x)} ${R(yB - r)} V ${R(y + r)} A ${R(r)} ${R(r)} 0 0 1 ${R(x + r)} ${R(y)} Z`;
  }
  /* ── v19 silhouette library — every layer insets this same geometry ── */
  if (shape === "cutline") {
    // broadcast-clean rectangle: small vertical cuts, wider clipped end caps
    const cx = Math.min(w * 0.14, h * 0.42), cy = h * 0.2;
    const v: [number, number][] = [
      [x + cx, y], [x + w - cx, y], [x + w, y + cy], [x + w, y + h - cy],
      [x + w - cx, y + h], [x + cx, y + h], [x, y + h - cy], [x, y + cy],
    ];
    return polyRounded(v, 2 + softness * 0.2);
  }
  if (shape === "polybar") {
    // strong top chamfer caps, smaller stepped lower corners — automotive rail
    const c = Math.min(w * 0.16, h * 0.6), b = c * 0.45, s = h * 0.26;
    const v: [number, number][] = [
      [x + c, y], [x + w - c, y], [x + w, y + s], [x + w, y + h - s * 0.55],
      [x + w - b, y + h], [x + b, y + h], [x, y + h - s * 0.55], [x, y + s],
    ];
    return polyRounded(v, 2 + softness * 0.18);
  }
  if (shape === "explorer") {
    // capsule with faceted (not circular) end housings
    const c = Math.min(w * 0.13, h * 0.55);
    const v: [number, number][] = [
      [x + c, y], [x + w - c, y],
      [x + w - c * 0.22, y + h * 0.24], [x + w, y + h * 0.5], [x + w - c * 0.22, y + h * 0.76],
      [x + w - c, y + h], [x + c, y + h],
      [x + c * 0.22, y + h * 0.76], [x, y + h * 0.5], [x + c * 0.22, y + h * 0.24],
    ];
    return polyRounded(v, 3 + softness * 0.22);
  }
  if (shape === "fighthud") {
    // opposing arrow brackets with an inward notch — competitive HUD
    const c = Math.min(w * 0.13, h * 0.85), n = c * 0.42;
    const v: [number, number][] = [
      [x + c, y], [x + w - c, y],
      [x + w, y + h * 0.24], [x + w - n, y + h * 0.5], [x + w, y + h * 0.76],
      [x + w - c, y + h], [x + c, y + h],
      [x, y + h * 0.76], [x + n, y + h * 0.5], [x, y + h * 0.24],
    ];
    return polyRounded(v, 1.5 + softness * 0.12);
  }
  if (shape === "crest") {
    // ceremonial plaque: sloped upper corners, shallow center point below
    const c = Math.min(w * 0.18, h * 0.52);
    const v: [number, number][] = [
      [x + c, y], [x + w - c, y], [x + w, y + c * 0.75], [x + w, y + h * 0.82],
      [x + w * 0.5, y + h], [x, y + h * 0.82], [x, y + c * 0.75],
    ];
    return polyRounded(v, 2 + softness * 0.2);
  }
  if (shape === "chunky") {
    // toy capsule: big shoulders + soft inset breaks top and bottom center.
    // Smoothness drives the shoulder radius (calibrated so the shipped
    // Toy Box softness ≈ the original 0.42h look; low = chunky slab)
    const r = Math.min(h * (0.1 + 0.33 * clamp(softness, 0, 100) / 100), w * 0.3);
    const nw = Math.min(w * 0.3, w - 2 * r - 10), nd = h * 0.05;
    const mid = x + w / 2;
    const dipTop = nw > 8 ? `H ${(mid - nw / 2).toFixed(1)} Q ${mid.toFixed(1)} ${(y + nd * 2).toFixed(1)} ${(mid + nw / 2).toFixed(1)} ${y} ` : "";
    const dipBot = nw > 8 ? `H ${(mid + nw / 2).toFixed(1)} Q ${mid.toFixed(1)} ${(y + h - nd * 2).toFixed(1)} ${(mid - nw / 2).toFixed(1)} ${(y + h).toFixed(1)} ` : "";
    return `M ${x + r} ${y} ${dipTop}H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} ${dipBot}H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  if (shape === "kart") {
    // mechanical end caps taller than the center rail — clean stepped waist
    const capW = Math.min(h * 0.8, w * 0.26), inset = h * 0.1, rc = h * 0.3;
    const R = (n: number) => n.toFixed(1);
    return `M ${R(x + capW)} ${R(y + inset)} H ${R(x + w - capW)} V ${y} H ${R(x + w - rc)} `
      + `A ${R(rc)} ${R(rc)} 0 0 1 ${x + w} ${R(y + rc)} V ${R(y + h - rc)} A ${R(rc)} ${R(rc)} 0 0 1 ${R(x + w - rc)} ${y + h} `
      + `H ${R(x + w - capW)} V ${R(y + h - inset)} H ${R(x + capW)} V ${y + h} H ${R(x + rc)} `
      + `A ${R(rc)} ${R(rc)} 0 0 1 ${x} ${R(y + h - rc)} V ${R(y + rc)} A ${R(rc)} ${R(rc)} 0 0 1 ${R(x + rc)} ${y} `
      + `H ${R(x + capW)} Z`;
  }
  if (shape === "mazepill") {
    // arcade capsule — elliptical ends flatter than a true pill;
    // smoothness flattens or plumps the end ellipses (0.62h at full)
    const rx = Math.min(h * (0.18 + 0.44 * clamp(softness, 0, 100) / 100), w * 0.24), ry = h / 2;
    return `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
  }
  if (shape === "blade") {
    // swept side tips, shallow concave top/bottom — regal and fluid
    const sh = Math.min(w * 0.16, h * 1.1), dip = h * 0.1, tipY = y + h / 2;
    return `M ${x} ${tipY} `
      + `Q ${(x + sh * 0.35).toFixed(1)} ${(y + h * 0.1).toFixed(1)} ${(x + sh).toFixed(1)} ${(y + dip * 0.55).toFixed(1)} `
      + `Q ${(x + w / 2).toFixed(1)} ${(y + dip * 1.9).toFixed(1)} ${(x + w - sh).toFixed(1)} ${(y + dip * 0.55).toFixed(1)} `
      + `Q ${(x + w - sh * 0.35).toFixed(1)} ${(y + h * 0.1).toFixed(1)} ${x + w} ${tipY} `
      + `Q ${(x + w - sh * 0.35).toFixed(1)} ${(y + h * 0.9).toFixed(1)} ${(x + w - sh).toFixed(1)} ${(y + h - dip * 0.55).toFixed(1)} `
      + `Q ${(x + w / 2).toFixed(1)} ${(y + h - dip * 1.9).toFixed(1)} ${(x + sh).toFixed(1)} ${(y + h - dip * 0.55).toFixed(1)} `
      + `Q ${(x + sh * 0.35).toFixed(1)} ${(y + h * 0.9).toFixed(1)} ${x} ${tipY} Z`;
  }
  if (shape === "tavern") {
    // carved plaque: gently bowed top/bottom, softly concave side walls
    const bow = h * 0.06, side = Math.max(1.5, w * 0.012), r = Math.min(w, h) * 0.14 * (0.4 + 0.6 * clamp(softness, 0, 100) / 100);
    return `M ${(x + r).toFixed(1)} ${(y + bow * 0.6).toFixed(1)} `
      + `Q ${(x + w / 2).toFixed(1)} ${(y - bow * 0.5).toFixed(1)} ${(x + w - r).toFixed(1)} ${(y + bow * 0.6).toFixed(1)} `
      + `Q ${(x + w).toFixed(1)} ${(y + bow * 0.8).toFixed(1)} ${(x + w - side).toFixed(1)} ${(y + h * 0.26).toFixed(1)} `
      + `Q ${(x + w - side * 2.6).toFixed(1)} ${(y + h / 2).toFixed(1)} ${(x + w - side).toFixed(1)} ${(y + h * 0.74).toFixed(1)} `
      + `Q ${(x + w).toFixed(1)} ${(y + h - bow * 0.8).toFixed(1)} ${(x + w - r).toFixed(1)} ${(y + h - bow * 0.6).toFixed(1)} `
      + `Q ${(x + w / 2).toFixed(1)} ${(y + h + bow * 0.5).toFixed(1)} ${(x + r).toFixed(1)} ${(y + h - bow * 0.6).toFixed(1)} `
      + `Q ${x.toFixed(1)} ${(y + h - bow * 0.8).toFixed(1)} ${(x + side).toFixed(1)} ${(y + h * 0.74).toFixed(1)} `
      + `Q ${(x + side * 2.6).toFixed(1)} ${(y + h / 2).toFixed(1)} ${(x + side).toFixed(1)} ${(y + h * 0.26).toFixed(1)} `
      + `Q ${x.toFixed(1)} ${(y + bow * 0.8).toFixed(1)} ${(x + r).toFixed(1)} ${(y + bow * 0.6).toFixed(1)} Z`;
  }
  if (shape === "kenneyRect") {
    // measured from Kenney UI Pack 2.0 (r = 6/64 h at the shipped softness);
    // Corner softness now drives the radius — 0 is near-sharp, 100 is plush
    return roundRect(x, y, w, h, h * 0.12 * clamp(softness, 0, 100) / 100);
  }
  if (shape === "kenneyTag") {
    // Kenney slide_hangle.svg rotated to read horizontally: 45° shoulders,
    // point depth 10/32 h, corner rounding 2/32 h — all measured, not invented
    const pd = Math.min(h * 0.31, w * 0.2);
    const v: [number, number][] = [
      [x, y], [x + w - pd, y], [x + w, y + h * 0.5], [x + w - pd, y + h], [x, y + h],
    ];
    return polyRounded(v, h * 0.04 + softness * 0.1);
  }
  if (shape === "doboMarquee") {
    // dobo_ui headerAsim: tapered plate over side drapes with rounded feet
    const wo = Math.min(h * 0.26, w * 0.13), ph = h * 0.74, tp = h * 0.05;
    const v: [number, number][] = [
      [x + wo, y], [x + w - wo, y],
      [x + w - wo + wo * 0.18, y + ph * 0.5], [x + w, y + ph * 0.78],
      [x + w - wo * 0.12, y + h], [x + w - wo * 0.85, y + h * 0.86], [x + w - wo - tp, y + ph],
      [x + wo + tp, y + ph],
      [x + wo * 0.85, y + h * 0.86], [x + wo * 0.12, y + h], [x, y + ph * 0.78],
      [x + wo - wo * 0.18, y + ph * 0.5],
    ];
    return polyRounded(v, h * 0.03 + softness * 0.12);
  }
  if (shape === "doboRibbon") {
    // dobo_ui headerBow: tapered plate, swallowtail side tails hanging low
    const wo = Math.min(h * 0.24, w * 0.12), ph = h * 0.72, tp = h * 0.06;
    const v: [number, number][] = [
      [x + wo, y], [x + w - wo, y],
      [x + w - wo - tp * 0.4, y + h * 0.32], [x + w, y + h * 0.42],
      [x + w - wo * 0.5, y + h * 0.66], [x + w, y + h * 0.9],
      [x + w - wo * 0.8, y + h], [x + w - wo - tp, y + ph],
      [x + wo + tp, y + ph], [x + wo * 0.8, y + h],
      [x, y + h * 0.9], [x + wo * 0.5, y + h * 0.66], [x, y + h * 0.42],
      [x + wo + tp * 0.4, y + h * 0.32],
    ];
    return polyRounded(v, h * 0.02 + softness * 0.08);
  }
  if (shape === "doboBracket") {
    // dobo_ui labelAdvanced: bar with half-round side lobes + meeting notches
    const lr = h * 0.3, cy2 = y + h / 2;
    const a = 1.257; // 72° — lobe arc attach angle
    const sinA = Math.sin(a), cosA = Math.cos(a);
    const cxR = x + w - lr * 1.02, cxL = x + lr * 1.02;
    const bx1 = x + lr * 1.45, bx2 = x + w - lr * 1.45; // bar run
    const R = (n: number) => n.toFixed(1);
    // right lobe attach points (top S, bottom E), mirrored on the left
    const SxR = cxR + lr * cosA, SyT = cy2 - lr * sinA, SyB = cy2 + lr * sinA;
    const SxL = cxL - lr * cosA;
    return `M ${R(bx1)} ${y} H ${R(bx2)} `
      + `Q ${R(bx2 + lr * 0.45)} ${y} ${R(SxR)} ${R(SyT)} `
      + `A ${R(lr)} ${R(lr)} 0 0 1 ${R(SxR)} ${R(SyB)} `
      + `Q ${R(bx2 + lr * 0.45)} ${y + h} ${R(bx2)} ${y + h} H ${R(bx1)} `
      + `Q ${R(bx1 - lr * 0.45)} ${y + h} ${R(SxL)} ${R(SyB)} `
      + `A ${R(lr)} ${R(lr)} 0 0 1 ${R(SxL)} ${R(SyT)} `
      + `Q ${R(bx1 - lr * 0.45)} ${y} ${R(bx1)} ${y} Z`;
  }
  if (shape === "deepchamfer") {
    // elongated octagon — cuts nearly half the height, unmistakably angular
    const c = Math.min(w * 0.24, h * 0.44);
    const v: [number, number][] = [
      [x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c],
      [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c],
    ];
    return polyRounded(v, 2 + softness * 0.18);
  }
  if (shape === "banner") {
    // ribbon with swallowtail ends — an inverted V cut into each end
    const c = Math.min(w * 0.13, h * 0.62);
    const v: [number, number][] = [
      [x, y], [x + w, y], [x + w - c, y + h * 0.5], [x + w, y + h],
      [x, y + h], [x + c, y + h * 0.5],
    ];
    return polyRounded(v, 1.5 + softness * 0.12);
  }
  if (shape === "shield") {
    // flat top, straight walls, converging to a bottom center point
    const drop = h * 0.55;
    const v: [number, number][] = [
      [x, y], [x + w, y], [x + w, y + drop],
      [x + w * 0.5, y + h], [x, y + drop],
    ];
    return polyRounded(v, 3 + softness * 0.26);
  }
  if (shape === "pixelstep") {
    // staircase-quantized corners — reads retro at any size
    const st = Math.max(4, Math.round(h / 14)), n = 3;
    let d = `M ${x + n * st} ${y} `;
    for (let i = 0; i < n; i++) d += `H ${x + w - (n - i) * st} V ${y + (i + 1) * st} `;   // top-right stairs down
    d += `H ${x + w} V ${y + h - n * st} `;
    for (let i = 0; i < n; i++) d += `H ${x + w - (i + 1) * st} V ${y + h - n * st + (i + 1) * st} `; // bottom-right stairs
    d += `H ${x + n * st} `;
    for (let i = 0; i < n; i++) d += `H ${x + (n - i) * st} V ${y + h - (i + 1) * st} `;   // bottom-left stairs up
    d += `H ${x} V ${y + n * st} `;
    for (let i = 0; i < n; i++) d += `H ${x + (i + 1) * st} V ${y + n * st - (i + 1) * st} `; // top-left stairs
    return d + "Z";
  }
  if (shape === "handdrawn") {
    // inked plaque: seeded wobble runs + deliberately uneven corner cuts
    const wob = Math.max(1, h * 0.015);
    const r = Math.min(14, h * 0.14) * (0.4 + 0.6 * clamp(softness, 0, 100) / 100);
    const c = [r * 1.2, r * 0.8, r * 1.05, r * 0.9]; // authored, not random
    return `M ${(x + c[0]).toFixed(1)} ${y} `
      + inkRun(x + c[0], y, x + w - c[1], y, wob, 11)
      + `Q ${x + w} ${y} ${x + w} ${(y + c[1]).toFixed(1)} `
      + inkRun(x + w, y + c[1], x + w, y + h - c[2], wob, 29)
      + `Q ${x + w} ${y + h} ${(x + w - c[2]).toFixed(1)} ${y + h} `
      + inkRun(x + w - c[2], y + h, x + c[3], y + h, wob, 47)
      + `Q ${x} ${y + h} ${x} ${(y + h - c[3]).toFixed(1)} `
      + inkRun(x, y + h - c[3], x, y + c[0], wob, 71)
      + `Q ${x} ${y} ${(x + c[0]).toFixed(1)} ${y} Z`;
  }
  if (shape === "hex") {
    const cut = Math.min(h * 0.5, w * 0.18);
    const v: [number, number][] = [
      [x + cut, y], [x + w - cut, y], [x + w, y + h / 2],
      [x + w - cut, y + h], [x + cut, y + h], [x, y + h / 2],
    ];
    return polyRounded(v, 2 + softness * 0.24);
  }
  if (shape === "trapezoid") {
    const t = Math.min(h * 0.28, w * 0.12);
    const v: [number, number][] = [
      [x + t, y], [x + w - t, y], [x + w, y + h], [x, y + h],
    ];
    return polyRounded(v, 3 + softness * 0.3);
  }
  if (shape === "notch") {
    const c = Math.min(34, h * 0.26);
    const v: [number, number][] = [
      [x + c, y], [x + w, y], [x + w, y + h - c],
      [x + w - c, y + h], [x, y + h], [x, y + c],
    ];
    return polyRounded(v, 2 + softness * 0.24);
  }
  const cut = shape === "sharp" ? Math.min(34, h * 0.22) : Math.min(28, h * 0.17);
  const r = shape === "sharp" ? 1.5 : 3 + softness * 0.3;
  const v: [number, number][] = [
    [x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + h - cut],
    [x + w - cut, y + h], [x + cut, y + h], [x, y + h - cut], [x, y + cut],
  ];
  return polyRounded(v, r);
}

/** Five-point star sized into a pattern cell. */
function starPath(cell: number): string {
  const k = (cell * 0.66) / 24, ox = cell * 0.17, oy = cell * 0.17;
  const pts = [[12, 2.2], [14.9, 8.6], [21.8, 9.2], [16.6, 13.9], [18.2, 20.8], [12, 17.2], [5.8, 20.8], [7.4, 13.9], [2.2, 9.2], [9.1, 8.6]];
  return "M " + pts.map(([px, py]) => `${(ox + px * k).toFixed(1)} ${(oy + py * k).toFixed(1)}`).join(" L ") + " Z";
}

function effect(effects: GenConfig["effects"], role: EffectRole): string {
  const e = effects[role];
  if (e) return e;
  const bevel = effects.Bevel ?? "#0E9CC9";
  switch (role) {
    case "Bevel": return bevel;
    case "Glow": return lighten(bevel, 0.55);
    case "Highlight": return "#FFFFFF";
    case "Shadow": return darken(bevel, 0.5);
    case "Inner Fill": return lighten(bevel, 0.15);
  }
}

const bright = (c: string, b: number) => (b >= 0 ? lighten(c, b / 100) : darken(c, -b / 100));

/** Resolve which design renders a state: forked snapshot, else live mirror of
 *  Default. Each field falls back independently so partial saves stay safe. */
function designFor(cfg: GenConfig, state: GenStateName): StateDesign {
  const d = state !== "default" ? cfg.stateDesigns?.[state as Exclude<GenStateName, "default">] : undefined;
  if (!d) return cfg;
  return {
    shape: d.shape ?? cfg.shape, effects: d.effects ?? cfg.effects, face: d.face ?? cfg.face,
    bevel: d.bevel ?? cfg.bevel, candy: d.candy ?? cfg.candy, lighting: d.lighting ?? cfg.lighting,
    shadow: d.shadow ?? cfg.shadow, transparency: d.transparency ?? cfg.transparency, type: d.type ?? cfg.type,
  };
}

interface Geom {
  x: number; y: number; h: number; fs: number; iconSize: number; minW?: number; maxW?: number;
  /** Token scale reference — big containers (panels) pass a smaller value so
   *  walls, rims and depth stay component-scaled instead of ballooning. */
  tokenH?: number;
}


/** One pattern cell for text fills — mirrors the face pattern language at
 *  letterform scale. `ps` is the cell size in viewBox units. */
function textPatternCell(style: string, ps: number, color: string): string {
  const h = (ps / 2).toFixed(1);
  if (style === "dots") return `<circle cx="${h}" cy="${h}" r="${(ps * 0.22).toFixed(1)}" fill="${color}"/>`;
  if (style === "stars") return `<path d="${starPath(ps)}" fill="${color}"/>`;
  if (style === "checker") return `<rect width="${h}" height="${h}" fill="${color}"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${color}"/>`;
  if (style === "halftone") return `<circle cx="${h}" cy="${h}" r="${(ps * 0.3).toFixed(1)}" fill="${color}"/><circle cx="0" cy="0" r="${(ps * 0.16).toFixed(1)}" fill="${color}"/><circle cx="${ps.toFixed(1)}" cy="${ps.toFixed(1)}" r="${(ps * 0.16).toFixed(1)}" fill="${color}"/>`;
  return `<rect width="${(ps / 2).toFixed(1)}" height="${ps.toFixed(1)}" fill="${color}"/>`; // stripes
}

/** Core builder — the candy stack. Width grows with the content. */
function build(cfg: GenConfig, state: GenStateName, g0: Geom, opts: {
  label?: string; iconDef?: IconDef | null; secondary?: boolean; shapeOverride?: Shape; fixedW?: number;
  /** Explicit per-component vertical text adjustment — overrides the theme's. */
  textOy?: number;
  /** Explicit per-component horizontal text adjustment — overrides the theme's. */
  textOx?: number;
  /** Anchor text at its left edge (type specimens) — estimate error then
   *  lands on the ragged right instead of staggering every line. */
  anchorLeft?: boolean;
} = {}): string {
  const id = "b" + UID++;
  const disabled = state === "disabled";
  const adj = cfg.states[state];
  const P = (c: string) => {
    if (disabled) return lighten(desaturate(c, 0.82), 0.1);
    const sat = clamp(adj.saturation ?? 0, -100, 100);
    return bright(sat ? saturate(c, sat / 100) : c, adj.brightness);
  };
  const secondary = !!opts.secondary;
  const D = designFor(cfg, state);
  const shape = opts.shapeOverride ?? D.shape;
  // Imported (feasibility-lab) silhouettes carry their own safe-area and
  // inset metadata — generic fields, looked up once and applied like any
  // registered silhouette's. Undefined for every production shape.
  const impMeta = importedShape(shape);
  const C = D.candy;
  const K = (g0.tokenH ?? g0.h) / 168; // token px scale for kit sizes

  const bevelC = P(effect(D.effects, "Bevel"));
  const glowC = disabled ? "#B9BEC6" : P(effect(D.effects, "Glow"));
  const hiC = P(D.lighting.tint ?? effect(D.effects, "Highlight"));
  const shC = effect(D.effects, "Shadow");
  const fillC = P(effect(D.effects, "Inner Fill"));

  const darkFace = D.face.mode === "dark";
  let face = darkFace ? hexMix(bevelC, "#0B0714", 0.72) : fillC;
  if (secondary) face = hexMix(face, darkFace ? "#100A1C" : "#FFFFFF", 0.78);
  const autoLabel = disabled ? "#A7AAB4"
    : secondary ? (darkFace ? lighten(bevelC, 0.55) : darken(bevelC, 0.12))
    : darkFace ? lighten(bevelC, 0.66) : "#FFFFFF";

  /* ── auto-size geometry: the shape grows with the content ────── */
  const { x, y, h, iconSize: baseIcon } = g0;
  const T2 = D.type;
  const fontDef = fontByName(T2.font);
  const fs = g0.fs * (T2.size / 52);
  const rawLabel = opts.label ?? cfg.content.label ?? "PLAY";
  const cased = T2.case === "upper" ? rawLabel.toUpperCase()
    : T2.case === "lower" ? rawLabel.toLowerCase()
    : T2.case === "title" ? rawLabel.replace(/\b\w/g, (m) => m.toUpperCase())
    : rawLabel;
  const label = esc(cased);

  // Config-driven icons are parked behind ICONS_ENABLED; explicit kit icons
  // (opts.iconDef) still render so the icon-button component keeps working.
  const iconDef = opts.iconDef === null ? null
    : opts.iconDef ?? (ICONS_ENABLED && cfg.icon.show ? (cfg.icon.def ?? DEFAULT_ICON) : null);
  const iconOnly = opts.iconDef !== undefined ? !opts.label : (ICONS_ENABLED && cfg.icon.only && !!iconDef);
  const showText = !iconOnly && label.length > 0;
  const iconSize = baseIcon * (cfg.icon.size / 100);
  const gap = showText && iconDef ? cfg.icon.gap * K : 0;
  const spacingEm = T2.spacing / 100;
  const weightK = 1 + Math.max(0, T2.weight - 700) * 0.0004;
  // width (`wdth`) axis — honored only for faces that really expose it; the
  // glyph advance estimate follows so auto-width stays truthful
  const capsF = fontDef.caps;
  const wdthV = capsF?.wdth && T2.width !== undefined
    ? clamp(T2.width, capsF.wdth[0], capsF.wdth[1]) : undefined;
  const widthK = wdthV !== undefined ? wdthV / 100 : 1;
  const italicPad = T2.italic ? fs * 0.3 : 0; // slanted glyphs overhang their advance
  // left-anchored specimens carry extra right slack — the whole estimate
  // error lands on the ragged right edge instead of splitting across both
  const textW = (showText ? label.length * fs * fontDef.factor * widthK * (1 + spacingEm) * weightK * (opts.anchorLeft ? 1.13 : 1.06) : 0) + italicPad;
  const contentW = textW + (iconDef ? iconSize : 0) + gap;

  /* text-safe area — the silhouette's authored content insets keep labels out
     of caps, tails and bevels, with breathing room that scales with the label
     size. The old padding stands as a floor so compact shapes don't change. */
  const met = silhouetteMeta(shape) ?? impMeta;
  const endRoom = shape === "pill" ? h * 0.16 : 0; // rounded ends eat width
  const basePad = (iconOnly ? Math.max(24, h * 0.2) : Math.max(64 * K, h * 0.42)) + endRoom;
  const safeGap = Math.max(12, fs * 0.35);
  const padL = iconOnly || !met ? basePad : Math.max(basePad, met.content.left * h + safeGap);
  const padR = iconOnly || !met ? basePad : Math.max(basePad, met.content.right * h + safeGap);

  /* Bounds rule: the canvas is sized to the LARGEST state of the component.
     Per-state forks may carry wider type or deeper shells — every state must
     live inside one shared footprint so hover never reflows the layout. */
  const stateWidth = (Dx: StateDesign): number => {
    const Tx = Dx.type;
    const shx = opts.shapeOverride ?? Dx.shape;
    const fsx = g0.fs * (Tx.size / 52);
    const casedX = Tx.case === "upper" ? rawLabel.toUpperCase()
      : Tx.case === "lower" ? rawLabel.toLowerCase()
      : Tx.case === "title" ? rawLabel.replace(/\b\w/g, (m) => m.toUpperCase())
      : rawLabel;
    const capsX = fontByName(Tx.font).caps;
    const wdX = capsX?.wdth && Tx.width !== undefined ? clamp(Tx.width, capsX.wdth[0], capsX.wdth[1]) / 100 : 1;
    const wkX = 1 + Math.max(0, Tx.weight - 700) * 0.0004;
    const itX = Tx.italic ? fsx * 0.3 : 0;
    const twX = (showText ? casedX.length * fsx * fontByName(Tx.font).factor * wdX * (1 + Tx.spacing / 100) * wkX * (opts.anchorLeft ? 1.13 : 1.06) : 0) + itX;
    const cwX = twX + (iconDef ? iconSize : 0) + gap;
    const metX = silhouetteMeta(shx) ?? importedShape(shx);
    const erX = shx === "pill" ? h * 0.16 : 0;
    const bpX = (iconOnly ? Math.max(24, h * 0.2) : Math.max(64 * K, h * 0.42)) + erX;
    const sgX = Math.max(12, fsx * 0.35);
    const pLX = iconOnly || !metX ? bpX : Math.max(bpX, metX.content.left * h + sgX);
    const pRX = iconOnly || !metX ? bpX : Math.max(bpX, metX.content.right * h + sgX);
    return iconOnly ? Math.max(h, cwX + bpX * 2) : Math.max(g0.minW ?? 230 * K, cwX + pLX + pRX);
  };
  const forks = (["hover", "pressed", "disabled"] as const)
    .map((s) => cfg.stateDesigns?.[s]).filter(Boolean) as StateDesign[];
  const minW = opts.fixedW ?? Math.max(stateWidth(cfg), ...forks.map(stateWidth));
  const w = opts.fixedW ?? Math.min(g0.maxW ?? 980, minW);

  /* ── extrusion & lift ─────────────────────────────────────────── */
  const depth = C.extrusion.depth * K * (secondary ? 0.55 : 1);
  const visDepth = Math.max(0, depth);
  const lift = adj.lift;

  // the canvas reserves the extrusion slider's FULL travel, not just the
  // deepest current state: the base line stays fixed while depth edits and
  // state forks raise or sink the face (buttons rise from the ground, they
  // don't grow downward), and nothing on a live page ever changes footprint.
  const depthCap = 48 * K * (secondary ? 0.55 : 1);
  const maxDepth = Math.max(depth, depthCap, ...forks.map((f) => f.candy.extrusion.depth * K * (secondary ? 0.55 : 1)));
  const riseDy = Math.max(0, maxDepth - depth);
  const vw = x * 2 + w, vh = y * 2 + h + Math.ceil(maxDepth) + 40; // generous room so big shadows never clip

  /* The state aura blurs far past the shell (σ up to 30 → ~2.5σ visible reach),
     and pointed silhouettes like the Fighting HUD carry it to the very edge of
     the geometry. Pad the viewport by the strongest glow any state can show —
     the same pad for every state of a component, so the hero, state cards and
     exports all stay aligned while the glow gets room to breathe. */
  const pad = glowPadOf(cfg);

  const wall = effectiveWall(D.bevel.width, shape, D.bevel.off);
  const bw = (wall === 0 ? 0 : secondary ? Math.max(4, wall * 0.7) : wall) * K;
  // Metadata-driven face inset (imported silhouettes only): maxBevelRatio
  // caps the inset a shape can survive, faceInsetScale trims it further.
  // For every production shape bwF === bw — behavior is unchanged.
  const bwF = (impMeta?.maxBevelRatio !== undefined ? Math.min(bw, h * impMeta.maxBevelRatio) : bw) * (impMeta?.faceInsetScale ?? 1);
  const rimW = C.rim.width * K;
  const outer = shapePath(shape, x, y, w, h, D.bevel.softness);
  // v67: TRUE inward offsets (Illustrator "Offset Path") — inner shapes
  // follow the silhouette's actual contour instead of a rescaled clone
  const faceP = insetShape(shape, outer, x, y, w, h, bwF, Math.max(0, D.bevel.softness - 8));
  const rimP = insetShape(shape, outer, x, y, w, h, rimW / 2 + 0.8, D.bevel.softness);

  /* ── key light — global source of truth ──────────────────────── */
  const A = ((D.lighting.angle % 360) + 360) % 360;
  const rad = (A * Math.PI) / 180;
  const lx = Math.cos(rad), ly = -Math.sin(rad); // +l points toward the light
  const gpos = (k: number) => (0.5 + clamp(k, -1, 1) * 0.5).toFixed(3);
  const axis = `x1="${gpos(-lx)}" y1="${gpos(-ly)}" x2="${gpos(lx)}" y2="${gpos(ly)}"`;
  const hiK = (disabled ? 0.35 : 1) * (D.lighting.highlight / 78);
  const lowK = Math.max(0.1, D.lighting.lowlight / 46);

  /* 1 ── cast shadow (grounded — does not travel with the lift) ── */
  const sd = D.shadow.distance * K;
  const sdx = -lx * sd * 0.55;
  const sdy = visDepth + Math.max(1.5, sd * 0.7 - ly * sd * 0.3) + Math.max(0, lift);
  const sBlur = Math.max(0.5, D.shadow.blur * 0.5);
  const shOp = (D.shadow.opacity / 100) * (disabled ? 0.35 : 1);
  const castShadow = shOp > 0.005
    ? `<path d="${outer}" transform="translate(${sdx.toFixed(1)} ${sdy.toFixed(1)})" fill="${shC}" opacity="${shOp.toFixed(2)}" filter="url(#${id}sb)"/>`
    : "";

  /* state aura (hover glow etc.) — own color, or the Glow well.
     The glow wraps the WHOLE extruded silhouette (the composite-silhouette
     canon): solid copies of the outer path swept from the face down to the
     base union together BEFORE the group-level blur, so an extruded piece
     glows around its full 3D mass instead of a face-shaped halo floating
     mid-depth. Flat pieces reduce to the single copy they always had. */
  const auraC = disabled ? "#B9BEC6" : C.aura.color ? P(C.aura.color) : glowC;
  const glowOp = (adj.glow / 100) * (secondary ? 0.4 : 1) * (disabled ? 0 : 1);
  const auraSweep = (() => {
    const n = Math.max(1, Math.ceil(visDepth / 6));
    let s = "";
    for (let i = 0; i <= n; i++) s += `<path d="${outer}" transform="translate(0 ${(lift + (visDepth * i) / n).toFixed(1)})" fill="${auraC}"/>`;
    return s;
  })();
  const aura = glowOp > 0.01
    ? `<g opacity="${Math.min(1, glowOp * 1.35).toFixed(2)}" filter="url(#${id}gb)">${auraSweep}</g>
       <g opacity="${(glowOp * 0.6).toFixed(2)}" filter="url(#${id}gb2)">${auraSweep}</g>`
    : "";

  /* 2 ── extrusion body — a connected solid, not a dark underlay.
     The body keeps the shell's saturation, is lit by the same key light
     (lit flank brighter, far flank darker), darkens toward the ground and
     carries a thin bounce-light lip along its bottom curve. Interpolated
     copies keep the silhouette continuous on soft corners. */
  const dk = C.extrusion.darkness / 100;
  const deepC = hexMix(darken(bevelC, clamp(0.24 + 0.34 * dk, 0, 0.8)), bevelC, 0.18);
  // enough interpolated slices that the side stays a continuous wall even at
  // maximum depth — no scalloping between the cap and the base. (A swept-
  // solid quad wall was tried and rolled back by owner call: with quads the
  // sweeps of opposite-running edges overlap at deep extrusion and the fill
  // rule hollowed the caps until winding was normalized — the stacked
  // construction is the devil we know. Its one flaw stays: stepped copy
  // edges show inside concave notches of multi-loop imports.)
  const nSlices = Math.max(2, Math.ceil(visDepth / 2.5));
  const slices = Array.from({ length: nSlices }, (_, i) => {
    const ty = (visDepth * (i + 1)) / nSlices;
    const last = i === nSlices - 1;
    return `<path d="${outer}" transform="translate(0 ${ty.toFixed(1)})" fill="url(#${id}ext)"${last ? ` stroke="${darken(deepC, 0.35)}" stroke-width="1"` : ""}/>`;
  }).join("");
  // base glow: light caught inside the body, centered under the face
  const egC = C.innerGlow.color ? P(C.innerGlow.color) : glowC;
  const egOp = (C.extrusion.glow / 100) * (disabled ? 0 : 1);
  const baseGlow = egOp > 0.01 && visDepth > 1
    ? `<g clip-path="url(#${id}ec)"><ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h + visDepth * 0.45).toFixed(1)}" rx="${(w * 0.32).toFixed(1)}" ry="${Math.max(8, visDepth * 1.1).toFixed(1)}" fill="url(#${id}eg)" opacity="${egOp.toFixed(2)}"/></g>`
    : "";
  const extrusion = visDepth > 0.3
    ? `<g>
        ${slices}
        <path d="${outer}" transform="translate(0 ${visDepth.toFixed(1)})" fill="url(#${id}extv)"/>
        ${baseGlow}
        <path d="${outer}" transform="translate(0 ${(visDepth - 0.8).toFixed(1)})" fill="none" stroke="${lighten(deepC, 0.38)}" stroke-width="1.2" opacity="0.45"/>
      </g>`
    : "";

  /* contact shadow — grounded occlusion right where the body meets the
     surface; fades as the button lifts, tightens when pressed */
  const contactOp = (C.contact.opacity / 100) * (disabled ? 0.4 : 1) * clamp(1 - Math.max(0, -lift) / 10, 0.25, 1);
  const contact = contactOp > 0.01
    ? `<ellipse cx="${(x + w / 2 + sdx * 0.35).toFixed(1)}" cy="${(y + h + visDepth + Math.max(0, lift) + 1.5).toFixed(1)}" rx="${(w * 0.47).toFixed(1)}" ry="${(5.5 * K + visDepth * 0.22).toFixed(1)}" fill="url(#${id}ct)" opacity="${contactOp.toFixed(2)}"/>`
    : "";

  /* face box (for screen-space layers) — follows the actual face inset */
  const fx0 = x + bwF, fy0 = y + bwF, fw = w - bwF * 2, fh = h - bwF * 2;
  const faceCx = fx0 + fw / 2, faceCy = fy0 + fh / 2;

  /* 7 ── inner glow (own color, or the Glow well; unlit side) */
  const igC = C.innerGlow.color ? P(C.innerGlow.color) : glowC;
  const igOp = (C.innerGlow.opacity / 100) * (disabled ? 0 : 1);
  const igSize = clamp(C.innerGlow.size / 100, 0.05, 1);

  /* pattern overlay — tone-on-tone by default, like printed candy wrap.
     Halftone fades its dot grid along the light axis for that comic-print
     hard-gradient read. */
  const PT = C.pattern;
  const patC = PT.color ? P(PT.color) : darken(face, 0.2);
  const patOp = (PT.type !== "none" ? PT.opacity / 100 : 0) * (disabled ? 0.5 : 1);
  const ps = (8 + PT.scale * 0.9) * K;
  let patternDef = "", patternUse = "";
  if (patOp > 0.005) {
    const rot = ` patternTransform="rotate(${PT.angle})"`;
    const cell = `id="${id}pt" width="${ps.toFixed(1)}" height="${ps.toFixed(1)}" patternUnits="userSpaceOnUse"`;
    if (PT.type === "stripes") patternDef = `<pattern ${cell}${rot}><rect width="${(ps / 2).toFixed(1)}" height="${ps.toFixed(1)}" fill="${patC}"/></pattern>`;
    else if (PT.type === "dots") patternDef = `<pattern ${cell}${rot}><circle cx="${(ps / 2).toFixed(1)}" cy="${(ps / 2).toFixed(1)}" r="${(ps * 0.22).toFixed(1)}" fill="${patC}"/></pattern>`;
    else if (PT.type === "stars") patternDef = `<pattern ${cell}${rot}><path d="${starPath(ps)}" fill="${patC}"/></pattern>`;
    else if (PT.type === "checker") patternDef = `<pattern ${cell}${rot}><rect width="${(ps / 2).toFixed(1)}" height="${(ps / 2).toFixed(1)}" fill="${patC}"/><rect x="${(ps / 2).toFixed(1)}" y="${(ps / 2).toFixed(1)}" width="${(ps / 2).toFixed(1)}" height="${(ps / 2).toFixed(1)}" fill="${patC}"/></pattern>`;
    else if (PT.type === "halftone") {
      patternDef = `<pattern ${cell}${rot}><circle cx="${(ps / 2).toFixed(1)}" cy="${(ps / 2).toFixed(1)}" r="${(ps * 0.3).toFixed(1)}" fill="${patC}"/></pattern>
      <linearGradient id="${id}pmg" ${axis}><stop offset="0" stop-color="#fff"/><stop offset=".85" stop-color="#000"/></linearGradient>
      <mask id="${id}pm"><rect x="${fx0 - 20}" y="${fy0 - 20}" width="${fw + 40}" height="${fh + 40}" fill="url(#${id}pmg)"/></mask>`;
    }
    if (patternDef) {
      const maskAttr = PT.type === "halftone" ? ` mask="url(#${id}pm)"` : "";
      patternUse = `<rect x="${fx0 - 20}" y="${fy0 - 20}" width="${fw + 40}" height="${fh + 40}" fill="url(#${id}pt)" opacity="${patOp.toFixed(2)}"${maskAttr}/>`;
    }
  }

  /* 8 ── broad curved gloss (screen space, flips if lit from below) */
  const flip = ly > 0.25; // light from below
  const gH = fh * clamp(C.gloss.height / 100, 0.08, 0.92);
  const bow = C.gloss.curve * K * (flip ? -1 : 1);
  const apexX = faceCx + lx * fw * 0.12;
  const gy = flip ? fy0 + fh - gH : fy0 + gH;
  const glossPath = flip
    ? `M ${fx0 - 2} ${fy0 + fh + 2} H ${fx0 + fw + 2} V ${gy.toFixed(1)} Q ${apexX.toFixed(1)} ${(gy + bow * 1.8).toFixed(1)} ${fx0 - 2} ${gy.toFixed(1)} Z`
    : `M ${fx0 - 2} ${fy0 - 2} H ${fx0 + fw + 2} V ${gy.toFixed(1)} Q ${apexX.toFixed(1)} ${(gy + bow * 1.8).toFixed(1)} ${fx0 - 2} ${gy.toFixed(1)} Z`;
  const gOpTop = (C.gloss.opacity / 100) * (disabled ? 0.35 : 1);
  const soft = clamp(C.gloss.softness / 100, 0, 1);
  const glossC1 = C.gloss.fill === "highlight" ? hiC : P(C.gloss.tint);
  const glossC2 = C.gloss.fill === "gradient" ? P(C.gloss.tint2) : glossC1;
  const gloss = C.gloss.on && gOpTop > 0.01
    ? `<path d="${glossPath}" fill="url(#${id}gl)"/>`
    : "";

  /* 9 ── specular — six art-directable reflective events, all keyed to the
     light: position sits toward the lit corner, tilt follows the light,
     softness shapes the falloff, stretch shapes the aspect. */
  const SP = C.specular;
  const spSize = SP.size * K;
  const spOp = (SP.intensity / 100) * (disabled ? 0.25 : 1);
  const spAspect = clamp(SP.stretch / 100, 0.1, 1);
  const soft01 = clamp(SP.softness / 100, 0, 1);
  const effSoft = SP.mode === "hard" ? Math.min(soft01, 0.15)
    : SP.mode === "line" ? Math.min(soft01, 0.3)
    : SP.mode === "soft" ? Math.max(soft01, 0.35)
    : soft01;
  const spRx = SP.mode === "line" ? spSize * 2.1 : spSize;
  const spRy = SP.mode === "line" ? Math.max(1.6, spSize * 0.6 * spAspect) : Math.max(2, spSize * spAspect);
  /* v80: every streak mode rides the silhouette. The mark is a stroke of an
     inset copy of the shell outline (so it bends with pills, crests and
     wavy shapes by construction), cut to a streak by a soft horizontal
     window mask. ox travels ±42% of the face — edge to edge; oy maps to how
     deep below the shell edge the band sits. Sweep keeps its full ring. */
  const bandCx = faceCx + lx * fw * 0.22 + (SP.ox / 100) * fw * 0.85;
  const bandInset = bwF * 0.55 + 2 + clamp((SP.oy + 50) / 100, 0, 1) * fh * 0.30;
  const bandW = Math.max(2, spRy * 1.7);
  const bandY = y + bandInset + bandW / 2; // approximate top-edge depth for satellites
  const litTop = ly <= 0.15; // key light above (or near-horizontal) lights the top arc
  let specular = "";
  let specularMaskDefs = "";
  if (SP.on && spOp > 0.01 && spSize > 0.5) {
    if (SP.mode === "sweep") {
      // reflective event hugging the shell's edge curve on the lit side
      const swW = Math.max(2, spSize * 0.32);
      const sweepP = insetShape(shape, outer, x, y, w, h, bwF * 0.55, Math.max(0, D.bevel.softness - 4));
      specular = `<path d="${sweepP}" fill="none" stroke="url(#${id}sw)" stroke-width="${swW.toFixed(1)}" opacity="${spOp.toFixed(2)}"/>`;
    } else {
      const bandP = insetShape(shape, outer, x, y, w, h, bandInset, Math.max(0, D.bevel.softness - 4));
      // half-plane clip keeps the band on the lit arc only
      const halfY1 = litTop ? y - 80 : faceCy + bandW * 0.4;
      const halfY2 = litTop ? faceCy + bandW * 0.4 : y + h + 80;
      const feather = SP.mode === "anime" ? 0.1 : clamp(0.16 + effSoft * 0.34, 0.1, 0.5);
      // window gradient(s) in user space; SP.angle tilts the cut ends
      const win = (gid: string, cx2: number, halfW: number) => `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse"
        x1="${(cx2 - halfW).toFixed(1)}" y1="0" x2="${(cx2 + halfW).toFixed(1)}" y2="0"
        gradientTransform="rotate(${(SP.angle * 0.5).toFixed(1)} ${cx2.toFixed(1)} ${bandY.toFixed(1)})">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="${feather.toFixed(2)}" stop-color="#fff" stop-opacity="1"/>
        <stop offset="${(1 - feather).toFixed(2)}" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>`;
      const maskRect = (gid: string) => `<rect x="${(x - 40).toFixed(1)}" y="${halfY1.toFixed(1)}" width="${(w + 80).toFixed(1)}" height="${(halfY2 - halfY1).toFixed(1)}" fill="url(#${gid})"/>`;
      let windows = "";
      if (SP.mode === "anime") {
        // stylized crisp double-bar: one long swoosh + one short block chasing it
        const b2w = Math.max(3, spSize * 0.66);
        const gapPx = b2w * 0.5 * (SP.gap / 100);
        const longC = bandCx - b2w * 0.75, longR = spSize * 1.1;
        const shortC = longC + longR + gapPx + b2w / 2;
        specularMaskDefs = win(`${id}spw1`, longC, longR) + win(`${id}spw2`, shortC, b2w / 2);
        windows = maskRect(`${id}spw1`) + maskRect(`${id}spw2`);
      } else {
        const halfW = spRx * (SP.mode === "line" ? 1.15 : 1.9);
        specularMaskDefs = win(`${id}spw1`, bandCx, halfW);
        windows = maskRect(`${id}spw1`);
      }
      specularMaskDefs += `<mask id="${id}spm">${windows}</mask>`;
      const band = `<path d="${bandP}" fill="none" stroke="${hiC}" stroke-width="${bandW.toFixed(1)}" opacity="${spOp.toFixed(2)}" mask="url(#${id}spm)"/>`;
      // dual/hard keep their small companion accents, floating off the band
      const dualGap = SP.gap / 100;
      const satDir = litTop ? 1 : -1;
      const sat = SP.mode === "dual"
        ? `<ellipse cx="${(bandCx - spRx * 1.8 * dualGap).toFixed(1)}" cy="${(bandY + satDir * spRy * 2.6 * dualGap).toFixed(1)}" rx="${(spRx * 0.42).toFixed(1)}" ry="${(spRy * 0.5).toFixed(1)}" fill="url(#${id}sp)" opacity="${(spOp * 0.8).toFixed(2)}"/>`
        : SP.mode === "hard"
          ? `<ellipse cx="${(bandCx - spRx * 1.6).toFixed(1)}" cy="${(bandY + satDir * spRy * 2.2).toFixed(1)}" rx="${(spRx * 0.3).toFixed(1)}" ry="${(spRy * 0.4).toFixed(1)}" fill="url(#${id}sp)" opacity="${(spOp * 0.6).toFixed(2)}"/>`
          : "";
      specular = band + sat;
    }
  }

  /* 10 ── lower reflective bloom (bounce light, unlit side) */
  const blOp = (C.bloom.opacity / 100) * (disabled ? 0.3 : 1);
  const blS = clamp(C.bloom.size / 100, 0.05, 1.2);
  const blX = faceCx - lx * fw * 0.16;
  const blY = faceCy - ly * fh * 0.3;
  const bloom = blOp > 0.01
    ? `<ellipse cx="${blX.toFixed(1)}" cy="${blY.toFixed(1)}" rx="${(fw * 0.46 * blS).toFixed(1)}" ry="${(fh * 0.26 * blS).toFixed(1)}" fill="url(#${id}bl)" opacity="${blOp.toFixed(2)}"/>`
    : "";

  /* 11 ── micro texture — contrast-boosted grain that actually reads */
  const nzOp = (C.texture.amount / 100) * 0.6 * (disabled ? 0.4 : 1);
  const nzFreq = (0.25 + (C.texture.scale / 100) * 1.6).toFixed(2);
  const noise = nzOp > 0.005
    ? `<rect x="${fx0}" y="${fy0}" width="${fw}" height="${fh}" filter="url(#${id}nz)" opacity="${nzOp.toFixed(2)}" style="mix-blend-mode:overlay"/>`
    : "";

  /* 6 ── inner edge shading */
  const edgeOp = C.innerEdge.strength / 100;
  const innerEdge = edgeOp > 0.01 && C.innerEdge.width > 0.1
    ? `<path d="${faceP}" fill="none" stroke="url(#${id}ie)" stroke-width="${(C.innerEdge.width * K).toFixed(1)}" opacity="${clamp(edgeOp, 0, 1).toFixed(2)}"/>`
    : "";

  /* ── 12 · content: expanded text & icon treatment ────────────── */
  /* funciri paints carry a solid fallback (SVG 1.1 <paint> syntax): WebKit
     paints nothing at all on a reference it fails to resolve, so the top
     stop keeps the label legible instead of vanishing */
  const tFill = T2.fillMode === "auto" ? autoLabel
    : T2.fillMode === "gradient" ? `url(#${id}tg) ${P(T2.fill)}` : P(T2.fill);
  // Text effects render through a native SVG filter with a generous explicit
  // region — CSS filters on SVG text clip and misrender in Safari, which is
  // exactly the "cut-off italics / invisible emboss" failure. Geometry scales
  // with the type size so a 76px headline carries the same relief as 40px.
  const prims: ShadowSpec[] = [];
  // specs, not markup — shadowChain11 stacks them as portable SVG 1.1
  const fds = (dx: number | string, dy: number | string, dev: number, color: string, op: number | string): ShadowSpec =>
    [dx, dy, dev.toFixed(1), color, op];
  const fsc = fs / 40;
  if (T2.emboss.on && !disabled) {
    // emboss (raised) or deboss (engraved). The relief follows the master
    // light: the highlight offsets toward it, the shade away from it, and
    // deboss flips the pair. Distance, softness and each side's opacity are
    // all independently art-directable.
    const s = clamp(T2.emboss.strength / 100, -1, 1);
    if (s !== 0) {
      const a = Math.abs(s);
      const dist = (T2.emboss.distance ?? 2) * fsc * (0.6 + a * 0.8);
      const ebl = ((0.3 + ((T2.emboss.softness ?? 30) / 100) * 2.6) * fsc).toFixed(1);
      const ebl2 = ((0.3 + ((T2.emboss.shSoftness ?? T2.emboss.softness ?? 30) / 100) * 2.6) * fsc).toFixed(1);
      const sign = s > 0 ? 1 : -1;
      const hx = (lx * dist * sign).toFixed(1), hy = (ly * dist * sign).toFixed(1);
      const sxo = (-lx * dist * sign).toFixed(1), syo = (-ly * dist * sign).toFixed(1);
      const hiO = (a * ((T2.emboss.hiOpacity ?? 70) / 100)).toFixed(2);
      const shO = (a * ((T2.emboss.shOpacity ?? 60) / 100)).toFixed(2);
      prims.push(fds(hx, hy, Number(ebl) * 0.5, T2.emboss.hiColor ?? "#FFFFFF", hiO));
      prims.push(fds(sxo, syo, Number(ebl2) * 0.5, T2.emboss.shColor ?? "#04080E", shO));
    }
  }
  if (T2.shadow.on) prims.push(fds((T2.shadow.x * fsc).toFixed(1), (T2.shadow.y * fsc).toFixed(1), T2.shadow.blur * fsc * 0.5, T2.shadow.color, (T2.shadow.opacity / 100).toFixed(2)));
  if (T2.glow.on && !disabled) {
    prims.push(fds(0, 0, T2.glow.size * 0.3, T2.glow.color, (T2.glow.opacity / 100).toFixed(2)));
    prims.push(fds(0, 0, T2.glow.size * 0.8, T2.glow.color, ((T2.glow.opacity / 100) * 0.6).toFixed(2)));
  }
  /* filterUnits=userSpaceOnUse: Safari synthesizes the italic slant for
     faces with no italic cut (Russo One) but measures the text bbox
     WITHOUT it — a percentage region inherits that lie and clips the
     leaning glyph edges diagonally. An absolute region can't.

     But the region must be BOUNDED (owner report, 2026-07-25: no text at
     all in Safari): Safari refuses to render a filtered element whose
     region rasterizes past its buffer cap, and the old fixed 6000×1800
     region blew that cap at hero scale — thumbnails survived, the big
     canvas text vanished, Chrome tiled and never showed it. Sized here
     from the shell the label lives in plus the largest effect spread. */
  const tfSpread = Math.max(
    T2.glow.on && !disabled ? T2.glow.size * 0.8 * 3 : 0,
    T2.shadow.on ? (Math.abs(T2.shadow.x) + Math.abs(T2.shadow.y) + T2.shadow.blur * 1.5) * fsc : 0,
    8) + fs
    // engines disagree on display-face advances by up to ~25% (Safari
    // especially, with synthesized italics) — the region carries that
    // slack so real glyphs never hit the raster boundary. Still bounded:
    // proportional to this label, nowhere near the Safari buffer cap.
    + textW * 0.25;
  const textFxDef = prims.length
    ? `<filter id="${id}tf" filterUnits="userSpaceOnUse" x="${(x - tfSpread).toFixed(0)}" y="${(y - tfSpread).toFixed(0)}" width="${(w + tfSpread * 2).toFixed(0)}" height="${(h + tfSpread * 2).toFixed(0)}" color-interpolation-filters="sRGB">${shadowChain11(prims)}</filter>`
    : "";
  const textFilter = prims.length ? ` filter="url(#${id}tf)"` : "";
  const outlineStroke = T2.outline.color2 ? `url(#${id}og) ${P(T2.outline.color)}` : P(T2.outline.color);
  /* synthetic weight — single-master display faces can't get heavier from the
     font file, so weights above the shipped master fatten the glyphs optically
     with a same-paint stroke. Variable and multi-weight faces never enter. */
  const fcaps = fontByName(T2.font)?.caps;
  const singleMaster = !!fcaps?.weights && fcaps.weights.length === 1 && !fcaps.wght;
  const synW = singleMaster ? clamp((T2.weight - (fcaps!.weights![0] ?? 400)) / 500, 0, 1) * fs * 0.055 : 0;
  const outlineW = T2.outline.width * (fs / 52);
  const outlineAttrs = T2.outline.on
    ? (synW > 0.05
      // the fattened glyph carries its own same-paint stroke; the ring moves
      // to an underlay so it still shows outside the grown letterform
      ? ` stroke="${tFill}" stroke-width="${synW.toFixed(1)}" stroke-linejoin="round" paint-order="stroke"`
      : ` stroke="${outlineStroke}" stroke-width="${outlineW.toFixed(1)}" stroke-linejoin="round" paint-order="stroke"`)
    : (synW > 0.05 ? ` stroke="${tFill}" stroke-width="${synW.toFixed(1)}" stroke-linejoin="round" paint-order="stroke"` : "");
  const outlineUnder = T2.outline.on && synW > 0.05;

  const iFx = cfg.icon.fx;
  const iFilters: string[] = [];
  if (iFx.emboss && !disabled) iFilters.push(`drop-shadow(0 -1px 0.4px rgba(255,255,255,0.6)) drop-shadow(0 1.6px 1px rgba(4,8,14,0.5))`);
  if (iFx.shadow) iFilters.push(`drop-shadow(0 2px 1.5px rgba(0,0,0,0.4))`);
  if (iFx.glow && !disabled) iFilters.push(`drop-shadow(0 0 5px ${glowC}) drop-shadow(0 0 12px ${hexRgba(glowC, 0.6)})`);
  const iconFilter = iFilters.length ? iFilters.join(" ") : undefined;
  // explicit kit icons (icon button) inherit the typography COLOR treatment
  // (fill/gradient/outline) unless a custom color is set. Effects, opacity
  // and rotation are always the icon's own controls — never the type's —
  // so what the Icons panel shows is exactly what icons do.
  const inheritTypo = !cfg.icon.color && opts.iconDef !== undefined && !!iconDef && !showText;
  const iconColor = disabled ? "#A7AAB4"
    : cfg.icon.color ? P(cfg.icon.color)
    : inheritTypo ? (T2.fillMode === "auto" ? autoLabel : P(T2.fill))
    : (T2.fillMode === "solid" ? P(T2.fill) : autoLabel);


  /* layout — content centers inside the text-safe area, not against the full
     outer silhouette, so asymmetric caps (pointer tags) balance correctly */
  const cx = x + w / 2, cy = y + h / 2;
  const startX = (x + padL + (x + w - padR)) / 2 - contentW / 2;
  const placeLeft = opts.iconDef === undefined && cfg.icon.placement === "left" && !iconOnly;
  const italicShift = T2.italic ? italicPad * 0.35 : 0; // rebalance the lean
  const textX = (placeLeft ? startX + (iconDef ? iconSize + gap : 0) + textW / 2 : startX + textW / 2) - italicShift;
  const tAnchor = opts.anchorLeft ? "start" : "middle";
  // horizontal text nudge — folded into the anchor so the outline, stripes,
  // glints and highlight slab all travel with the glyphs as one unit
  const textOx = opts.textOx ?? T2.ox ?? 0;
  const tTextX = (opts.anchorLeft ? x + padL - italicShift : textX) + textOx * K;
  const iconX = (iconOnly ? cx - iconSize / 2 : placeLeft ? startX : startX + textW + gap) + cfg.icon.ox * K + (iconOnly ? textOx * K : 0);
  // icon-only pieces (awarded badges, icon buttons): the vertical nudge is
  // the icon's nudge — there is no text for it to move
  const iconY = cy - iconSize / 2 + cfg.icon.oy * K + (iconOnly ? (opts.textOy ?? T2.oy ?? 0) * K : 0);
  const textOy = opts.textOy ?? T2.oy ?? 0;

  const T = D.transparency;
  const fontStyle = T2.italic ? ` font-style="italic"` : "";
  // style attr builder — carries the width axis plus any per-layer extras
  const tStyle = (extra = "") => (wdthV !== undefined || extra)
    ? ` style="${wdthV !== undefined ? `font-stretch:${wdthV}%;` : ""}${extra}"` : "";

  /* partial phrase highlight — the first match renders as a brighter,
     illuminated portion of the same material: same font, metrics, outline
     and effects, only the fill lifts toward the highlight/glow tokens */
  const hiRaw = (T2.highlight ?? "").trim();
  const caseFn = (s: string) => T2.case === "upper" ? s.toUpperCase()
    : T2.case === "lower" ? s.toLowerCase()
    : T2.case === "title" ? s.replace(/\b\w/g, (m) => m.toUpperCase())
    : s;
  const hiIdx = hiRaw ? cased.indexOf(caseFn(hiRaw)) : -1;
  const hiLen = hiIdx >= 0 ? caseFn(hiRaw).length : 0;
  const textInner = hiIdx >= 0
    ? `${esc(cased.slice(0, hiIdx))}<tspan fill="url(#${id}thl)">${esc(cased.slice(hiIdx, hiIdx + hiLen))}</tspan>${esc(cased.slice(hiIdx + hiLen))}`
    : label;
  /* burn-through: the lit phrase thins the pattern overlay in step with
     the intensity — light through texture. On pattern-heavy kits this is
     what makes the slider unmissable; fill-opacity (not opacity) because
     SVG 1.1 tspans only honor the former, and it multiplies with the
     overlay element's own opacity. */
  const stripesInner = hiIdx >= 0
    ? (() => {
        const burn = clamp(1 - (T2.highlightBoost ?? 70) / 100, 0, 1);
        return `${esc(cased.slice(0, hiIdx))}<tspan fill-opacity="${burn.toFixed(2)}">${esc(cased.slice(hiIdx, hiIdx + hiLen))}</tspan>${esc(cased.slice(hiIdx + hiLen))}`;
      })()
    : label;

  /* vector glints — a crisp specular slab clipped to the glyphs plus star
     sparkles riding the letter faces. Placement follows the master light,
     exactly like the emboss relief and the shell gloss. */
  const GL2 = T2.glints;
  const glintsOn = !!GL2?.on && showText && !disabled;
  let glintsDefs = "", glintsLayer = "";
  if (glintsOn) {
    const gOp = clamp((GL2!.opacity ?? 55) / 100, 0, 1);
    const gy = cy + 1 + textOy * K;
    const tx0 = opts.anchorLeft ? tTextX : tTextX - textW / 2;
    const gcx = tx0 + textW / 2;
    const bandW = textW * 1.18, bandH = fs * 0.28;
    // user nudge — % of the letter height, applied to slab and stars alike
    const gdx = clamp(GL2!.ox ?? 0, -100, 100) / 100 * fs;
    const gdy = clamp(GL2!.oy ?? 0, -100, 100) / 100 * fs;
    // the slab drifts toward the light and tilts perpendicular to it
    const bcx = gcx + lx * fs * 0.08 + gdx, bcy = gy + ly * fs * 0.24 + gdy;
    const rot = Math.atan2(ly, lx) * 180 / Math.PI + 90;
    const star4 = (sx: number, sy: number, s: number, sr: number) =>
      `<path d="M0 ${(-s).toFixed(1)} L${(s * 0.22).toFixed(1)} ${(-s * 0.22).toFixed(1)} L${s.toFixed(1)} 0 L${(s * 0.22).toFixed(1)} ${(s * 0.22).toFixed(1)} L0 ${s.toFixed(1)} L${(-s * 0.22).toFixed(1)} ${(s * 0.22).toFixed(1)} L${(-s).toFixed(1)} 0 L${(-s * 0.22).toFixed(1)} ${(-s * 0.22).toFixed(1)} Z" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${sr})" fill="#FFFFFF"/>`;
    glintsDefs = `<clipPath id="${id}tgc"><text x="${tTextX.toFixed(1)}" y="${gy.toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" text-anchor="${tAnchor}" dominant-baseline="central">${label}</text></clipPath>`;
    glintsLayer = `<g clip-path="url(#${id}tgc)" opacity="${gOp.toFixed(2)}">
        <rect x="${(bcx - bandW / 2).toFixed(1)}" y="${(bcy - bandH / 2).toFixed(1)}" width="${bandW.toFixed(1)}" height="${bandH.toFixed(1)}" rx="${(bandH / 2).toFixed(1)}" fill="#FFFFFF" transform="rotate(${rot.toFixed(1)} ${bcx.toFixed(1)} ${bcy.toFixed(1)})"/>
        <rect x="${(bcx - bandW * 0.19).toFixed(1)}" y="${(bcy + bandH * 0.75).toFixed(1)}" width="${(bandW * 0.38).toFixed(1)}" height="${(bandH * 0.42).toFixed(1)}" rx="${(bandH * 0.21).toFixed(1)}" fill="#FFFFFF" opacity="0.7" transform="rotate(${rot.toFixed(1)} ${bcx.toFixed(1)} ${bcy.toFixed(1)})"/>
      </g>
      <g opacity="${Math.min(1, gOp * 1.15).toFixed(2)}">
        ${star4(tx0 + textW * 0.16 + lx * fs * 0.06 + gdx, gy - fs * 0.24 + ly * fs * 0.06 + gdy, fs * 0.16, 0)}
        ${star4(tx0 + textW * 0.52 + lx * fs * 0.06 + gdx, gy + fs * 0.16 + ly * fs * 0.06 + gdy, fs * 0.09, 18)}
        ${star4(tx0 + textW * 0.85 + lx * fs * 0.06 + gdx, gy - fs * 0.1 + ly * fs * 0.06 + gdy, fs * 0.125, -14)}
      </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw + pad * 2}" height="${vh + pad * 2}" viewBox="${-pad} ${-pad} ${vw + pad * 2} ${vh + pad * 2}" font-family="'${T2.font}', Inter, sans-serif" data-shell="${x.toFixed(1)} ${(y + riseDy + lift).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" data-shell0="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${label || "component"}, ${state} state">
<defs>
  <linearGradient id="${id}band" ${axis}>
    <stop offset="0" stop-color="${darken(bevelC, clamp(0.3 * lowK, 0, 0.7))}"/>
    <stop offset=".5" stop-color="${bevelC}"/>
    <stop offset="1" stop-color="${lighten(bevelC, clamp(0.45 * hiK, 0, 0.75))}"/>
  </linearGradient>
  <linearGradient id="${id}ext" x1="${lx >= 0 ? 1 : 0}" y1="0.5" x2="${lx >= 0 ? 0 : 1}" y2="0.5">
    <stop offset="0" stop-color="${lighten(deepC, clamp(0.06 + 0.26 * Math.abs(lx) * hiK, 0, 0.5))}"/>
    <stop offset="0.55" stop-color="${deepC}"/>
    <stop offset="1" stop-color="${darken(deepC, clamp(0.05 + 0.2 * Math.abs(lx) * lowK, 0, 0.5))}"/>
  </linearGradient>
  <linearGradient id="${id}extv" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.5" stop-color="${darken(deepC, 0.55)}" stop-opacity="0"/>
    <stop offset="1" stop-color="${darken(deepC, 0.55)}" stop-opacity="0.38"/>
  </linearGradient>
  <radialGradient id="${id}ct">
    <stop offset="0" stop-color="${shC}" stop-opacity="1"/>
    <stop offset="1" stop-color="${shC}" stop-opacity="0"/>
  </radialGradient>
  ${baseGlow ? `<clipPath id="${id}ec"><path d="${outer}" transform="translate(0 ${visDepth.toFixed(1)})"/></clipPath>
  <radialGradient id="${id}eg"><stop offset="0" stop-color="${egC}" stop-opacity="1"/><stop offset="1" stop-color="${egC}" stop-opacity="0"/></radialGradient>` : ""}
  ${patternDef}
  <linearGradient id="${id}rim" ${axis}>
    <stop offset="0" stop-color="${hiC}" stop-opacity="0.45"/>
    <stop offset=".4" stop-color="${hiC}" stop-opacity="0.08"/>
    <stop offset="1" stop-color="${hiC}" stop-opacity="0.95"/>
  </linearGradient>
  <linearGradient id="${id}face" ${axis}>
    <stop offset="0" stop-color="${darken(face, clamp(0.24 * (D.face.contrast / 50) * lowK, 0, 0.6))}"/>
    <stop offset="${clamp(1 - D.face.midpoint / 100, 0.08, 0.92).toFixed(2)}" stop-color="${face}"/>
    <stop offset="1" stop-color="${lighten(face, clamp(0.3 * (D.face.contrast / 50) * hiK, 0, 0.7))}"/>
  </linearGradient>
  <linearGradient id="${id}ie" ${axis}>
    <stop offset="0" stop-color="${hexRgba(lighten(face, 0.55), 0.55)}"/>
    <stop offset=".55" stop-color="${hexRgba(darken(bevelC, 0.35), 0.35)}"/>
    <stop offset="1" stop-color="${hexRgba(darken(bevelC, 0.58), 0.9)}"/>
  </linearGradient>
  <linearGradient id="${id}ig" ${axis}>
    <stop offset="0" stop-color="${igC}" stop-opacity="${igOp.toFixed(2)}"/>
    <stop offset="${igSize.toFixed(2)}" stop-color="${igC}" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="${id}gl" x1="0" y1="${flip ? 1 : 0}" x2="0" y2="${flip ? 0 : 1}">
    <stop offset="0" stop-color="${glossC1}" stop-opacity="${gOpTop.toFixed(2)}"/>
    <stop offset="${(1 - soft * 0.55).toFixed(2)}" stop-color="${hexMix(glossC1, glossC2, 0.6)}" stop-opacity="${(gOpTop * (1 - 0.3 * soft)).toFixed(2)}"/>
    <stop offset="1" stop-color="${glossC2}" stop-opacity="${(gOpTop * (1 - soft)).toFixed(2)}"/>
  </linearGradient>
  <radialGradient id="${id}sp">
    <stop offset="0" stop-color="${hiC}" stop-opacity="1"/>
    <stop offset="${clamp(0.85 - effSoft * 0.7, 0.1, 0.85).toFixed(2)}" stop-color="${hiC}" stop-opacity="1"/>
    <stop offset="${clamp(0.92 - effSoft * 0.35, 0.2, 0.95).toFixed(2)}" stop-color="${hiC}" stop-opacity="${(0.5 - effSoft * 0.25).toFixed(2)}"/>
    <stop offset="1" stop-color="${hiC}" stop-opacity="0"/>
  </radialGradient>
  ${specularMaskDefs}
  ${SP.mode === "sweep" ? `<linearGradient id="${id}sw" ${axis}>
    <stop offset="0" stop-color="${hiC}" stop-opacity="0"/>
    <stop offset="${(0.5 + 0.22 * (1 - effSoft)).toFixed(2)}" stop-color="${hiC}" stop-opacity="0"/>
    <stop offset="${(0.66 + 0.18 * (1 - effSoft)).toFixed(2)}" stop-color="${hiC}" stop-opacity="0.85"/>
    <stop offset="1" stop-color="${hiC}" stop-opacity="1"/>
  </linearGradient>` : ""}
  <radialGradient id="${id}bl">
    <stop offset="0" stop-color="${hiC}" stop-opacity="1"/>
    <stop offset="1" stop-color="${hiC}" stop-opacity="0"/>
  </radialGradient>
  ${T2.fillMode === "gradient" ? `<linearGradient id="${id}tg" gradientUnits="userSpaceOnUse" x1="${tTextX.toFixed(1)}" y1="${(cy + 1 + textOy * K - fs * 0.55).toFixed(1)}" x2="${tTextX.toFixed(1)}" y2="${(cy + 1 + textOy * K + fs * 0.55).toFixed(1)}"><stop offset="0" stop-color="${P(T2.fill)}"/><stop offset="1" stop-color="${P(T2.fill2)}"/></linearGradient>` : ""}
  ${T2.outline.on && T2.outline.color2 ? `<linearGradient id="${id}og" gradientUnits="userSpaceOnUse" x1="${tTextX.toFixed(1)}" y1="${(cy + 1 + textOy * K - fs * 0.55).toFixed(1)}" x2="${tTextX.toFixed(1)}" y2="${(cy + 1 + textOy * K + fs * 0.55).toFixed(1)}"><stop offset="0" stop-color="${P(T2.outline.color)}"/><stop offset="1" stop-color="${P(T2.outline.color2)}"/></linearGradient>` : ""}
  ${hiIdx >= 0 ? (() => {
    const hb = clamp((T2.highlightBoost ?? 70) / 100, 0, 1);
    /* intensity sweeps from the BASE ink (0 = the phrase melts into the
       rest) up to fully lit (100). The old formula anchored both ends on
       the Highlight token — near-white in almost every kit — so the
       slider swept white-to-white and read as dead ("why doesn't
       highlight intensity work"). Anchoring the start on what the other
       glyphs actually wear makes the whole range visible, and the
       glow-tinted bottom stop keeps the lift perceptible even when the
       base ink itself is white. */
    const baseTop = T2.fillMode === "auto" ? autoLabel : P(T2.fill);
    const baseBot = T2.fillMode === "gradient" ? P(T2.fill2) : baseTop;
    /* the halo is what makes the phrase read LIT on kits whose base ink is
       already near-white (a fill-only lift tops out invisible there — owner:
       "highlight this text doesn't work"). Bloom scales with intensity. */
    return `<linearGradient id="${id}thl" gradientUnits="userSpaceOnUse" x1="${tTextX.toFixed(1)}" y1="${(cy + 1 + textOy * K - fs * 0.55).toFixed(1)}" x2="${tTextX.toFixed(1)}" y2="${(cy + 1 + textOy * K + fs * 0.55).toFixed(1)}">
    <stop offset="0" stop-color="${hexMix(baseTop, hexMix(hiC, "#FFFFFF", 0.89), hb)}"/>
    <stop offset="1" stop-color="${hexMix(baseBot, hexMix(glowC, "#FFFFFF", 0.41), hb)}"/>
  </linearGradient>
  <filter id="${id}thf" filterUnits="userSpaceOnUse" x="${(x - tfSpread).toFixed(0)}" y="${(y - tfSpread).toFixed(0)}" width="${(w + tfSpread * 2).toFixed(0)}" height="${(h + tfSpread * 2).toFixed(0)}" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="${(fs * 0.1 * hb).toFixed(1)}" result="thb"/>
    <feFlood flood-color="${glowC}" flood-opacity="${(0.85 * hb).toFixed(2)}"/>
    <feComposite in2="thb" operator="in" result="thh"/>
    <feMerge><feMergeNode in="thh"/><feMergeNode in="thh"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`; })() : ""}
  ${showText && T2.stripes?.on ? (() => { const pcell = fs * 0.3 * clamp((T2.stripes!.scale ?? 100) / 100, 0.25, 4); return `<pattern id="${id}tst" width="${pcell.toFixed(1)}" height="${pcell.toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${T2.stripes!.angle})">${textPatternCell(T2.stripes!.style ?? "stripes", pcell, darken(bevelC, 0.25))}</pattern>`; })() : ""}
  ${glintsDefs}
  ${textFxDef}
  <clipPath id="${id}fc"><path d="${faceP}"/></clipPath>
  <clipPath id="${id}oc"><path d="${outer}"/></clipPath>
  ${(() => {
    /* Blur regions sized in ABSOLUTE units from the blur itself, not
       percentages of the shape's bbox: a soft shadow's gaussian tail runs
       ~3σ past the silhouette, and on squat shapes (the blob set) a
       %-margin is shorter than that — the blur gets guillotined at the
       region edge and reads as a straight line baked into the shadow
       (owner report, staging round). Bounded: tail + travel only. */
    const shTail = 3 * sBlur + Math.abs(sdx) + Math.abs(sdy) + 24;
    const shR = `filterUnits="userSpaceOnUse" x="${(x - shTail).toFixed(0)}" y="${(y - shTail).toFixed(0)}" width="${(w + shTail * 2).toFixed(0)}" height="${(h + visDepth + shTail * 2).toFixed(0)}"`;
    const auraTail = (s2: number) => 3 * s2 + visDepth + 24;
    const auraR = (s2: number) => `filterUnits="userSpaceOnUse" x="${(x - auraTail(s2)).toFixed(0)}" y="${(y - auraTail(s2)).toFixed(0)}" width="${(w + auraTail(s2) * 2).toFixed(0)}" height="${(h + auraTail(s2) * 2).toFixed(0)}"`;
    return `${castShadow ? `<filter id="${id}sb" ${shR}><feGaussianBlur stdDeviation="${sBlur.toFixed(1)}"/></filter>` : ""}
  ${aura ? `<filter id="${id}gb" ${auraR(14)}><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="${id}gb2" ${auraR(30)}><feGaussianBlur stdDeviation="30"/></filter>` : ""}`;
  })()}
  ${noise ? `<filter id="${id}nz" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${nzFreq}" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="2.6" intercept="-0.8"/><feFuncG type="linear" slope="2.6" intercept="-0.8"/><feFuncB type="linear" slope="2.6" intercept="-0.8"/></feComponentTransfer></filter>` : ""}
</defs>
<g opacity="${(adj.opacity / 100).toFixed(2)}" transform="translate(0 ${riseDy.toFixed(1)})">
  ${castShadow ? `<g id="${id}_cast-shadow" data-part="cast-shadow">${castShadow}</g>` : ""}
  ${contact ? `<g id="${id}_contact-shadow" data-part="contact-shadow">${contact}</g>` : ""}
  ${aura ? `<g id="${id}_outer-glow" data-part="outer-glow">${aura}</g>` : ""}
  <g transform="translate(0 ${lift})">
    ${extrusion ? `<g id="${id}_extrusion" data-part="extrusion">${extrusion}</g>` : ""}
    <g id="${id}_shell" data-part="shell" opacity="${(T.frame / 100).toFixed(2)}">
      <path d="${outer}" fill="url(#${id}band)" stroke="${darken(bevelC, disabled ? 0.25 : 0.5)}" stroke-width="1.5"/>
      ${rimW > 0.2 ? `<path d="${rimP}" fill="none" stroke="url(#${id}rim)" stroke-width="${rimW.toFixed(1)}" opacity="${((C.rim.brightness / 100) * (disabled ? 0.5 : 1)).toFixed(2)}"/>` : ""}
      ${shape === "handdrawn" && !disabled ? roughInk(outer, darken(bevelC, 0.58), 1.4 * K) : ""}
    </g>
    <g data-oclip="1" clip-path="url(#${id}oc)">
    <g id="${id}_face" data-part="face" opacity="${(T.interior / 100).toFixed(2)}">
      <path d="${faceP}" fill="url(#${id}face)"/>
      <g clip-path="url(#${id}fc)">
        ${patternUse ? `<g data-part="pattern">${patternUse}</g>` : ""}
        ${igOp > 0.01 ? `<path d="${faceP}" fill="url(#${id}ig)" data-part="inner-glow"/>` : ""}
        ${bloom ? `<g data-part="bloom">${bloom}</g>` : ""}
        ${C.gloss.layer === "above" ? "" : `<g data-part="gloss">${C.gloss.blend && C.gloss.blend !== "normal" ? `<g style="mix-blend-mode:${C.gloss.blend}">${gloss}</g>` : gloss}</g>`}
        ${noise ? `<g data-part="texture">${noise}</g>` : ""}
      </g>
      ${innerEdge}
    </g>
    <g id="${id}_content" data-part="content" opacity="${(T.content / 100).toFixed(2)}">
      ${showText ? `<g data-part="label">` : ""}
      ${showText && outlineUnder ? `<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="none" stroke="${outlineStroke}" stroke-width="${(outlineW + synW).toFixed(1)}" stroke-linejoin="round" text-anchor="${tAnchor}" dominant-baseline="central">${label}</text>` : ""}
      ${showText ? `${textFilter ? `<g${textFilter}>` : ""}<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="${tFill}"${(T2.fillOpacity ?? 100) < 100 ? ` fill-opacity="${(T2.fillOpacity / 100).toFixed(2)}"` : ""}${outlineAttrs} text-anchor="${tAnchor}" dominant-baseline="central">${textInner}</text>${textFilter ? `</g>` : ""}` : ""}
      ${showText && T2.stripes?.on ? `<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="url(#${id}tst)" opacity="${clamp((T2.stripes.opacity ?? 30) / 100, 0, 1).toFixed(2)}" text-anchor="${tAnchor}" dominant-baseline="central">${stripesInner}</text>` : ""}
      ${showText && hiIdx >= 0 && !disabled ? `<g filter="url(#${id}thf)"><text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="none" text-anchor="${tAnchor}" dominant-baseline="central">${esc(cased.slice(0, hiIdx))}<tspan fill="url(#${id}thl)">${esc(cased.slice(hiIdx, hiIdx + hiLen))}</tspan>${esc(cased.slice(hiIdx + hiLen))}</text></g>` : ""}
      ${glintsLayer}
      ${showText ? `</g>` : ""}
      ${iconDef ? `<g data-part="icon">` : ""}${iconDef ? (inheritTypo
        ? `<g${iconFilter ? ` style="filter:${iconFilter}"` : ""}${cfg.icon.opacity < 100 ? ` opacity="${(cfg.icon.opacity / 100).toFixed(2)}"` : ""}>${
            T2.outline.on && !disabled && (cfg.icon.outlineWidth ?? T2.outline.width) > 0.01
              ? iconGroup(iconDef, iconX, iconY, iconSize, T2.outline.color2 ? `url(#${id}og)` : P(T2.outline.color), { strokeWidth: cfg.icon.strokeWidth / 10 + (cfg.icon.outlineWidth ?? T2.outline.width) * 0.85, rotation: cfg.icon.rotation })
              : ""
          }${iconGroup(iconDef, iconX, iconY, iconSize, !disabled && T2.fillMode === "gradient" ? `url(#${id}tg)` : iconColor, { strokeWidth: cfg.icon.strokeWidth / 10, rotation: cfg.icon.rotation })}</g>`
        : iconGroup(iconDef, iconX, iconY, iconSize, iconColor, {
            strokeWidth: cfg.icon.strokeWidth / 10,
            opacity: (cfg.icon.opacity / 100),
            rotation: cfg.icon.rotation,
            filter: iconFilter,
          })) : ""}${iconDef ? `</g>` : ""}
    </g>
    ${C.gloss.layer === "above" ? `<g id="${id}_gloss" data-part="gloss" opacity="${(T.interior / 100).toFixed(2)}" clip-path="url(#${id}fc)"${C.gloss.blend && C.gloss.blend !== "normal" ? ` style="mix-blend-mode:${C.gloss.blend}"` : ""}>${gloss}</g>` : ""}
    ${specular ? `<g id="${id}_specular" data-part="specular" opacity="${(T.interior / 100).toFixed(2)}" clip-path="url(#${id}fc)"${SP.blend && SP.blend !== "normal" ? ` style="mix-blend-mode:${SP.blend}"` : ""}>${specular}</g>` : ""}
    </g>
  </g>
</g>
</svg>`;
}

/** Viewport pad added around the shell so the state glow never clips. The
 *  same value for every state of a component; exports that measure content
 *  insets (nine-slice caps) subtract it. */
export function glowPadOf(cfg: GenConfig): number {
  // the pad reserves the slider's FULL travel whenever any glow is on, so
  // dragging glow strength never resizes the canvas (no page reflow) — and
  // every piece keeps generous, stable air around it
  const maxGlow = Math.max(cfg.states.default.glow, cfg.states.hover.glow, cfg.states.pressed.glow, cfg.states.disabled.glow);
  return maxGlow > 0.5 ? 90 : 0;
}

/** Editor-surface stabilizer: expand a rendered piece's viewport so its
 *  glow pad reads as at least `min` on every side. build() pads 0 or 90
 *  (glowPadOf) — so the FIRST tick of the Glow slider used to change the
 *  root box and reflow the hero and state cards ("when I add a glow the
 *  interface responds"). Reserving the full pad up front keeps the box
 *  constant; scale stays 1:1 and the art doesn't move. Only build()
 *  outputs carry data-shell — custom-root chrome (spinner, health
 *  globe…) never pads, so it passes through unchanged. */
export function padSvg(svg: string, min = 90): string {
  if (!/data-shell="/.test(svg)) return svg;
  const vb = /viewBox="(-?[\d.]+) /.exec(svg);
  const extra = vb ? min + Number(vb[1]) : 0; // viewBox.x is -currentPad
  if (extra <= 0) return svg;
  return svg.replace(/ width="([\d.]+)" height="([\d.]+)" viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/, (_m, w, h, vx, vy, vw, vh) =>
    ` width="${+w + extra * 2}" height="${+h + extra * 2}" viewBox="${+vx - extra} ${+vy - extra} ${+vw + extra * 2} ${+vh + extra * 2}"`);
}

/** The exact outer / rim / face geometry build() derives for a shell —
 *  exported so the feasibility lab's diagnostic overlays audit the REAL
 *  inset math, not a copy of it. Mirrors build()'s derivation (bw, bwF,
 *  rimW, softness offsets); keep the two in lockstep. */
export function shellPaths(cfg: GenConfig, shape: Shape, x: number, y: number, w: number, h: number): { outer: string; rim: string; face: string; bw: number; bwF: number; rimW: number } {
  const D = designFor(cfg, "default");
  const K = h / 168;
  const bw = effectiveWall(D.bevel.width, shape, D.bevel.off) * K;
  const impMeta = importedShape(shape);
  const bwF = (impMeta?.maxBevelRatio !== undefined ? Math.min(bw, h * impMeta.maxBevelRatio) : bw) * (impMeta?.faceInsetScale ?? 1);
  const rimW = D.candy.rim.width * K;
  const outer = shapePath(shape, x, y, w, h, D.bevel.softness);
  return {
    outer,
    face: insetShape(shape, outer, x, y, w, h, bwF, Math.max(0, D.bevel.softness - 8)),
    rim: insetShape(shape, outer, x, y, w, h, rimW / 2 + 0.8, D.bevel.softness),
    bw, bwF, rimW,
  };
}

/** Master component — width follows the label. Margins are 1.5× so large
 *  shadow distances never clip against the invisible canvas bounds. */
export function renderBevel(cfg: GenConfig, state: GenStateName): string {
  return build(cfg, state, { x: 52, y: 36, h: 168, fs: 52, iconSize: 46 });
}

/** Feasibility-lab entry: one shell at an exact frame size. Same build()
 *  pipeline as every production render — nothing here is shape-specific.
 *  `fs` is the pre-scale type size (build multiplies by type.size/52). */
export function renderShell(cfg: GenConfig, state: GenStateName, w: number, h: number, opts: { label?: string; iconDef?: IconDef | null; fs?: number } = {}): string {
  return build(cfg, state, { x: 40, y: 32, h, fs: opts.fs ?? h * 0.31, iconSize: h * 0.3 }, {
    label: opts.label, iconDef: opts.iconDef === undefined ? null : opts.iconDef, fixedW: w,
  });
}

/** Just the typography — the complete text treatment rendered by the same
 *  engine, with the shell, depth, shadows and auras switched off. Drives the
 *  Kit guideline page's type specimens and splash text. */
export interface SpecimenOpts {
  /** Render the string exactly as typed (case treatment off) — for the a–z line. */
  keepCase?: boolean;
  /** Highlight phrase for this specimen (overrides the config's). */
  highlight?: string;
  /** Mutate the cloned type treatment before rendering — the Build Parts
   *  typography recipe uses this to switch layers on and off. */
  mutate?: (c: GenConfig) => void;
}
export function renderTypeSpecimen(cfg: GenConfig, text: string, opts: SpecimenOpts = {}): string {
  const c = JSON.parse(JSON.stringify(cfg)) as GenConfig;
  c.transparency = { frame: 0, interior: 0, content: 100 };
  c.shadow.opacity = 0;
  c.candy.contact.opacity = 0;
  c.candy.extrusion.depth = 0;
  c.stateDesigns = {};
  for (const s of Object.values(c.states)) { s.glow = 0; s.lift = 0; s.opacity = 100; }
  if (opts.keepCase) c.type.case = "none";
  if (opts.highlight !== undefined) c.type.highlight = opts.highlight;
  opts.mutate?.(c);
  // maxW lifted far above the button default — a full alphabet line must
  // never clip against the auto-width cap
  const out = build(c, "default", { x: 26, y: 20, h: 130, fs: 52, iconSize: 0, maxW: 4200 }, { iconDef: null, label: text, anchorLeft: true });
  /* Engines measure display faces differently — Safari draws many of them
     (italics especially) wider than the char-count estimate. Give the canvas
     right-side headroom and let glyphs paint past the viewBox regardless. */
  const slack = c.type.italic ? 64 : 28;
  return out
    .replace(/ width="([\d.]+)"/, (_m, w) => ` width="${(+w + slack).toFixed(0)}"`)
    .replace(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/, (_m, x, y, vw, vh) => `viewBox="${x} ${y} ${(+vw + slack).toFixed(0)} ${vh}" style="overflow:visible"`);
}

/* ── kit components ────────────────────────────────────────────── */
const SIZE_K: Record<KitSize, number> = { s: 0.72, m: 1, l: 1.22 };
const cxOf = (w: number) => w / 2;

/* Genre-standard rarity ramp — shared by the rarity frame and loot tag.
   These are semantic colors (like the pad-button console ring), not theme
   roles: players read rarity by hue before they read any label. */
/** Every piece whose renderer stages a pose from `value` — bars fill,
 *  needles point, tiers pick, toggles flip. Derived mechanically from
 *  the renderKit switch (cases that reference `value`); keep in step
 *  when a new value-driven piece lands. The Component-content Value
 *  slider shows exactly for these. */
export const VALUE_DRIVEN = new Set<KitComponentId>([
  "segment", "checkbox", "radio", "toggle", "slider", "progress", "segbar", "input", "vsbar", "dialog",
  "listmenu", "scrollbar", "pagedots", "steps", "loadbar", "setrow", "notifydot", "avatarframe", "currency",
  "buffframe", "cooldown", "stepper", "healthglobe", "xpbar", "manarails", "questpanel", "choicelist",
  "invgrid", "rarityframe", "compass", "partyframe", "dmgnumber", "loottag", "crosshair", "hitmarker",
  "magazine", "equipselector", "streakmeter", "waypoint", "capturemeter", "respawn", "dmgarc", "weaponwheel",
  "starrating", "pathconnector", "heartmeter", "booster", "spinwheel", "combo", "movecounter", "pricebtn",
  "energymeter", "buildqueue", "unitplate", "popmeter", "endturn", "scorebug", "friendrow", "emotewheel",
  "seasontrack", "hotbar", "resource", "datarow", "orb", "lives", "ring", "flipclock", "stopwatch",
  "timerdigits", "speedo", "speedo2", "tacho", "laptimes", "orderticket",
  "chest", "giftbox", "rewardcard", "rewardtray",
]);

/** Factory rarity tiers — exported so the Panel's palette editor shows
 *  the same names and hues it resets to. */
export const RARITY_FACTORY = [
  { name: "COMMON", c: "#9aa1ac" },
  { name: "UNCOMMON", c: "#22c55e" },
  { name: "RARE", c: "#3b82f6" },
  { name: "EPIC", c: "#a855f7" },
  { name: "LEGENDARY", c: "#f59e0b" },
] as const;
/* cfg.rarity overrides per tier — names and colors are the maker's own
   logic; anything blank falls back to the factory tier */
/** The kit's full five-tier ladder, custom overrides applied — the single
 *  source the renderer, the exports and kit-manifest.json all read. */
export const rarityTiers = (cfg: GenConfig): { name: string; c: string }[] =>
  RARITY_FACTORY.map((f, i) => {
    const ov = cfg.rarity?.[i];
    return { name: ov?.name?.trim() || f.name, c: ov?.c || f.c };
  });
const rarityOf = (cfg: GenConfig, v: number | undefined, fallback = 2) => {
  const i = v === undefined ? fallback : clamp(Math.round(v * (RARITY_FACTORY.length - 1)), 0, RARITY_FACTORY.length - 1);
  return rarityTiers(cfg)[i];
};

/** Dimensional candy ball — knobs for toggles, switches and sliders. */
function candyKnob(cx: number, cy: number, r: number, base: string, dot?: string): string {
  const kid = "kn" + UID++;
  return `<defs><radialGradient id="${kid}" cx="0.35" cy="0.3" r="0.9">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="0.55" stop-color="${lighten(base, 0.78)}"/>
    <stop offset="1" stop-color="${lighten(base, 0.3)}"/>
  </radialGradient></defs>
  <ellipse cx="${cx.toFixed(1)}" cy="${(cy + r * 0.82).toFixed(1)}" rx="${(r * 0.58).toFixed(1)}" ry="${(r * 0.18).toFixed(1)}" fill="rgba(0,0,0,0.32)"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${kid})" stroke="${darken(base, 0.38)}" stroke-width="1.5"/>
  ${dot ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(3, r * 0.3).toFixed(1)}" fill="${dot}"/>` : ""}
  <ellipse cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.44).toFixed(1)}" rx="${(r * 0.34).toFixed(1)}" ry="${(r * 0.19).toFixed(1)}" fill="#FFFFFF" opacity="0.85"/>`;
}

/* Rewards pack · chest tier accents — genre semantics like the pad-button
   console ring: Wood/Iron/Gold are the small/medium/large ladder, Premium
   and Event are the specials. The chest BODY always wears the kit's own
   candy material; only the trim speaks tier. */
const CHEST_TIERS: Record<string, string> = { Wood: "#B07A4A", Iron: "#9AAAB8", Gold: "#F5B23E", Premium: "#A855F7", Event: "#38BDF8" };

/** The chest object — the owner's construction spec, ported
 *  coordinate-for-coordinate from the approved 256-board build: 3/4
 *  game-icon view, barrel lid receding back-left (front arch + mid and
 *  rear hoop crescents with lid strips between), riveted trim rails,
 *  corner posts, chunky feet and the latch-plate + shield lock focal.
 *  PANELS wear the KIT material; trim/hoops/latch wear the tier accent.
 *  Flat fills + one shadow + one highlight per shape — no gradients.
 *  `open` swings the lid group back on the rear-left hinge. */
function chestArt(cx: number, cy: number, w: number, base: string, accent: string, o: { open?: boolean; lock?: boolean; dim?: boolean } = {}): string {
  const s = w / 166;
  // artboard→piece map (bakes the spec build's 1.22×/0.92× proportion pass)
  const X = (px: number) => cx + (1.22 * (px - 124) + 9.75) * s;
  const Y = (py: number) => cy + (0.92 * (py - 132) + 11) * s;
  const n = (v: number) => v.toFixed(1);
  const SX = (v: number) => n(1.22 * v * s); // x-extent (widths)
  const SY = (v: number) => n(0.92 * v * s); // y-extent (heights)
  const gold = o.dim ? "#9AA0A8" : accent;
  const goldDk = darken(gold, 0.18), goldHi = lighten(gold, 0.5);
  const wood = o.dim ? "#7E848D" : lighten(base, 0.05);
  const woodDk = darken(o.dim ? "#7E848D" : base, 0.28), woodHi = lighten(o.dim ? "#7E848D" : base, 0.45);
  const line = darken(gold, 0.55);
  const o4 = `stroke="${line}" stroke-width="${n(Math.max(1.2, 4.4 * s))}" stroke-linejoin="round"`;
  const o2 = `stroke="${line}" stroke-width="${n(Math.max(0.9, 2.6 * s))}" stroke-linejoin="round"`;
  const plank = `stroke="${line}" stroke-width="${n(Math.max(0.7, 1.6 * s))}" opacity="0.55" fill="none"`;
  // ── lid stack: hoop → strip → hoop → strip → front arch + hoop ──
  const lid = `<g${o.open ? ` transform="rotate(-42 ${n(X(58))} ${n(Y(96))})"` : ""}>
    <path ${o4} d="M ${n(X(58))} ${n(Y(96))} L ${n(X(58))} ${n(Y(80))} Q ${n(X(58))} ${n(Y(34))} ${n(X(105))} ${n(Y(34))} Q ${n(X(152))} ${n(Y(34))} ${n(X(152))} ${n(Y(80))} L ${n(X(152))} ${n(Y(96))} L ${n(X(140))} ${n(Y(96))} L ${n(X(140))} ${n(Y(80))} Q ${n(X(140))} ${n(Y(46))} ${n(X(105))} ${n(Y(46))} Q ${n(X(70))} ${n(Y(46))} ${n(X(70))} ${n(Y(80))} L ${n(X(70))} ${n(Y(96))} Z" fill="${gold}"/>
    <path d="M ${n(X(61))} ${n(Y(60))} Q ${n(X(67))} ${n(Y(42))} ${n(X(89))} ${n(Y(37))} L ${n(X(89))} ${n(Y(44))} Q ${n(X(73))} ${n(Y(48))} ${n(X(69))} ${n(Y(62))} Z" fill="${goldHi}" opacity="0.8"/>
    <path ${o4} d="M ${n(X(71))} ${n(Y(102))} L ${n(X(71))} ${n(Y(87))} Q ${n(X(71))} ${n(Y(43))} ${n(X(118))} ${n(Y(43))} L ${n(X(105))} ${n(Y(34))} Q ${n(X(58))} ${n(Y(34))} ${n(X(58))} ${n(Y(80))} L ${n(X(58))} ${n(Y(94))} Z" fill="${wood}"/>
    <path ${plank} d="M ${n(X(66))} ${n(Y(52))} Q ${n(X(76))} ${n(Y(40))} ${n(X(94))} ${n(Y(37))}"/>
    <path ${o4} d="M ${n(X(71))} ${n(Y(102))} L ${n(X(71))} ${n(Y(87))} Q ${n(X(71))} ${n(Y(43))} ${n(X(118))} ${n(Y(43))} Q ${n(X(165))} ${n(Y(43))} ${n(X(165))} ${n(Y(87))} L ${n(X(165))} ${n(Y(102))} L ${n(X(153))} ${n(Y(102))} L ${n(X(153))} ${n(Y(87))} Q ${n(X(153))} ${n(Y(55))} ${n(X(118))} ${n(Y(55))} Q ${n(X(83))} ${n(Y(55))} ${n(X(83))} ${n(Y(87))} L ${n(X(83))} ${n(Y(102))} Z" fill="${gold}"/>
    <path d="M ${n(X(74))} ${n(Y(66))} Q ${n(X(80))} ${n(Y(49))} ${n(X(101))} ${n(Y(45))} L ${n(X(101))} ${n(Y(52))} Q ${n(X(85))} ${n(Y(56))} ${n(X(81))} ${n(Y(68))} Z" fill="${goldHi}" opacity="0.8"/>
    <path ${o4} d="M ${n(X(84))} ${n(Y(108))} L ${n(X(84))} ${n(Y(94))} Q ${n(X(84))} ${n(Y(50))} ${n(X(131))} ${n(Y(50))} L ${n(X(118))} ${n(Y(43))} Q ${n(X(71))} ${n(Y(43))} ${n(X(71))} ${n(Y(87))} L ${n(X(71))} ${n(Y(102))} Z" fill="${wood}"/>
    <path ${plank} d="M ${n(X(79))} ${n(Y(58))} Q ${n(X(89))} ${n(Y(46))} ${n(X(107))} ${n(Y(44))}"/>
    <path ${o4} d="M ${n(X(84))} ${n(Y(110))} L ${n(X(84))} ${n(Y(94))} Q ${n(X(84))} ${n(Y(50))} ${n(X(131))} ${n(Y(50))} Q ${n(X(178))} ${n(Y(50))} ${n(X(178))} ${n(Y(94))} L ${n(X(178))} ${n(Y(110))} Z" fill="${woodDk}"/>
    <path d="M ${n(X(98))} ${n(Y(92))} Q ${n(X(100))} ${n(Y(66))} ${n(X(124))} ${n(Y(62))} L ${n(X(124))} ${n(Y(70))} Q ${n(X(106))} ${n(Y(74))} ${n(X(104))} ${n(Y(92))} Z" fill="${wood}" opacity="0.6"/>
    <path ${o4} d="M ${n(X(84))} ${n(Y(110))} L ${n(X(84))} ${n(Y(94))} Q ${n(X(84))} ${n(Y(50))} ${n(X(131))} ${n(Y(50))} Q ${n(X(178))} ${n(Y(50))} ${n(X(178))} ${n(Y(94))} L ${n(X(178))} ${n(Y(110))} L ${n(X(166))} ${n(Y(110))} L ${n(X(166))} ${n(Y(96))} Q ${n(X(166))} ${n(Y(62))} ${n(X(131))} ${n(Y(62))} Q ${n(X(96))} ${n(Y(62))} ${n(X(96))} ${n(Y(96))} L ${n(X(96))} ${n(Y(110))} Z" fill="${gold}"/>
    <path d="M ${n(X(88))} ${n(Y(74))} Q ${n(X(96))} ${n(Y(56))} ${n(X(118))} ${n(Y(52))} L ${n(X(120))} ${n(Y(58))} Q ${n(X(100))} ${n(Y(62))} ${n(X(94))} ${n(Y(78))} Z" fill="${goldHi}"/>
    <path d="M ${n(X(166))} ${n(Y(84))} L ${n(X(172))} ${n(Y(80))} Q ${n(X(174))} ${n(Y(92))} ${n(X(174))} ${n(Y(106))} L ${n(X(166))} ${n(Y(106))} Z" fill="${goldDk}" opacity="0.8"/>
  </g>`;
  const interior = `<ellipse cx="${n(X(131))}" cy="${n(Y(116))}" rx="${SX(46)}" ry="${SY(9)}" fill="${darken(base, 0.72)}"/>`;
  // ── base box, trim, posts, feet ──
  const box = `<path ${o4} d="M ${n(X(56))} ${n(Y(112))} L ${n(X(88))} ${n(Y(122))} L ${n(X(88))} ${n(Y(184))} L ${n(X(56))} ${n(Y(174))} Z" fill="${woodDk}"/>
    <path ${plank} d="M ${n(X(56))} ${n(Y(142))} L ${n(X(88))} ${n(Y(152))}"/>
    <rect ${o4} x="${n(X(88))}" y="${n(Y(122))}" width="${SX(86)}" height="${SY(62)}" fill="${wood}"/>
    <path ${plank} d="M ${n(X(88))} ${n(Y(152))} L ${n(X(174))} ${n(Y(152))}"/>
    <rect x="${n(X(88))}" y="${n(Y(122))}" width="${SX(86)}" height="${SY(8)}" fill="${woodHi}" opacity="0.45"/>
    <rect x="${n(X(88))}" y="${n(Y(172))}" width="${SX(86)}" height="${SY(12)}" fill="${woodDk}" opacity="0.5"/>
    <path ${o4} d="M ${n(X(52))} ${n(Y(96))} L ${n(X(88))} ${n(Y(107))} L ${n(X(88))} ${n(Y(126))} L ${n(X(52))} ${n(Y(115))} Z" fill="${goldDk}"/>
    <path d="M ${n(X(52))} ${n(Y(96))} L ${n(X(88))} ${n(Y(107))} L ${n(X(88))} ${n(Y(112))} L ${n(X(52))} ${n(Y(101))} Z" fill="${goldHi}" opacity="0.5"/>
    <rect ${o4} x="${n(X(82))}" y="${n(Y(106))}" width="${SX(100)}" height="${SY(20)}" rx="${SY(4)}" fill="${gold}"/>
    <rect x="${n(X(82))}" y="${n(Y(106))}" width="${SX(100)}" height="${SY(6)}" rx="${SY(3)}" fill="${goldHi}" opacity="0.75"/>
    <rect x="${n(X(82))}" y="${n(Y(120))}" width="${SX(100)}" height="${SY(6)}" rx="${SY(3)}" fill="${goldDk}" opacity="0.6"/>
    <path ${o4} d="M ${n(X(50))} ${n(Y(106))} L ${n(X(62))} ${n(Y(110))} L ${n(X(62))} ${n(Y(182))} L ${n(X(50))} ${n(Y(178))} Z" fill="${goldDk}"/>
    <rect ${o4} x="${n(X(82))}" y="${n(Y(118))}" width="${SX(14)}" height="${SY(74)}" rx="${SX(3)}" fill="${gold}"/>
    <rect x="${n(X(85))}" y="${n(Y(118))}" width="${SX(4)}" height="${SY(74)}" fill="${goldHi}" opacity="0.7"/>
    <rect ${o4} x="${n(X(164))}" y="${n(Y(118))}" width="${SX(14)}" height="${SY(74)}" rx="${SX(3)}" fill="${gold}"/>
    <rect x="${n(X(167))}" y="${n(Y(118))}" width="${SX(4)}" height="${SY(74)}" fill="${goldHi}" opacity="0.7"/>
    <rect ${o4} x="${n(X(48))}" y="${n(Y(176))}" width="${SX(20)}" height="${SY(18)}" rx="${SX(4)}" fill="${goldDk}"/>
    <rect ${o4} x="${n(X(78))}" y="${n(Y(188))}" width="${SX(24)}" height="${SY(18)}" rx="${SX(4)}" fill="${gold}"/>
    <rect x="${n(X(78))}" y="${n(Y(188))}" width="${SX(24)}" height="${SY(6)}" rx="${SX(3)}" fill="${goldHi}" opacity="0.6"/>
    <rect ${o4} x="${n(X(160))}" y="${n(Y(188))}" width="${SX(24)}" height="${SY(18)}" rx="${SX(4)}" fill="${gold}"/>
    <rect x="${n(X(160))}" y="${n(Y(188))}" width="${SX(24)}" height="${SY(6)}" rx="${SX(3)}" fill="${goldHi}" opacity="0.6"/>`;
  // ── latch: plate + shield lock + keyhole; padlock rides when locked ──
  const latch = `<rect ${o4} x="${n(X(122))}" y="${n(Y(104))}" width="${SX(34)}" height="${SY(26)}" rx="${SX(6)}" fill="${gold}"/>
    <rect x="${n(X(122))}" y="${n(Y(104))}" width="${SX(34)}" height="${SY(8)}" rx="${SX(4)}" fill="${goldHi}" opacity="0.7"/>
    <path ${o4} d="M ${n(X(127))} ${n(Y(126))} L ${n(X(151))} ${n(Y(126))} Q ${n(X(155))} ${n(Y(152))} ${n(X(139))} ${n(Y(157))} Q ${n(X(123))} ${n(Y(152))} ${n(X(127))} ${n(Y(126))} Z" fill="${gold}"/>
    <path d="M ${n(X(130))} ${n(Y(128))} L ${n(X(134))} ${n(Y(128))} Q ${n(X(132))} ${n(Y(148))} ${n(X(139))} ${n(Y(152))} Q ${n(X(128))} ${n(Y(148))} ${n(X(130))} ${n(Y(128))} Z" fill="${goldHi}" opacity="0.55"/>
    <rect ${o2} x="${n(X(133))}" y="${n(Y(131))}" width="${SX(12)}" height="${SY(15)}" rx="${SX(2.5)}" fill="${goldDk}"/>` +
    (o.lock
      ? `<path d="M ${n(X(133.5))} ${n(Y(136))} v ${SY(-4)} a ${SX(5.5)} ${SY(5.5)} 0 0 1 ${SX(11)} 0 v ${SY(4)}" fill="none" stroke="${darken(gold, 0.35)}" stroke-width="${n(Math.max(1.5, 4 * s))}"/>
        <rect ${o2} x="${n(X(130))}" y="${n(Y(136))}" width="${SX(18)}" height="${SY(13)}" rx="${SX(3)}" fill="${goldDk}"/>
        <circle cx="${n(X(139))}" cy="${n(Y(142))}" r="${SX(2.2)}" fill="${line}"/>`
      : `<circle cx="${n(X(139))}" cy="${n(Y(136.5))}" r="${SX(2.6)}" fill="${line}"/>
        <rect x="${n(X(137.8))}" y="${n(Y(137))}" width="${SX(2.4)}" height="${SY(6.5)}" fill="${line}"/>`) +
    `<g fill="${goldHi}" ${o2}>
      <circle cx="${n(X(100))}" cy="${n(Y(116))}" r="${SX(3.4)}"/>
      <circle cx="${n(X(163))}" cy="${n(Y(116))}" r="${SX(3.4)}"/>
      <circle cx="${n(X(128))}" cy="${n(Y(111))}" r="${SX(2.8)}"/>
      <circle cx="${n(X(150))}" cy="${n(Y(111))}" r="${SX(2.8)}"/>
    </g>`;
  const pool = `<ellipse cx="${n(X(118))}" cy="${n(Y(206))}" rx="${SX(74)}" ry="${SY(7)}" fill="rgba(4,7,14,0.4)"/>`;
  // open: the lid swings back on the rear-left hinge over the emptied box
  return pool + (o.open ? lid + interior + box + latch : box + latch + lid);
}

/* Layer content BEHIND the whole piece (halo rings, auras): lands right
   after the outer state group opens, under cast shadow and shell alike. */
function injectUnder(track: string, extra: string): string {
  return track.replace(/(<g opacity="[^"]*" transform="translate\(0 [^)]*\)">)/, (m0) => m0 + extra);
}

function inject(track: string, extra: string): string {
  /* v72: injected content lands INSIDE the lift group — a hover lift must
     carry wells, fills, dials and emblems with the shell, not leave them
     floating at rest (the "only the frame lifts" bug). The lift group is
     the second-to-last close in every build() render. */
  const tail = "  </g>\n</g>\n</svg>";
  if (track.endsWith(tail)) return track.slice(0, -tail.length) + extra + tail;
  return track.replace("</g>\n</svg>", extra + "</g>\n</svg>");
}

/** Overlay a specular shine band, clipped to the component's face (the
 *  `…fc` clipPath every shell render carries). The band itself is static —
 *  gen.css sweeps `.kit-shine` across the viewBox and reduced-motion turns
 *  it off. Components without a face clip come back unchanged. */
export function addShine(svg: string): string {
  const fc = /clip-path="url\(#([A-Za-z0-9]+)fc\)"/.exec(svg);
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!fc || !vb) return svg;
  const id = fc[1];
  const [, vx, vy, vw, vh] = vb.map(Number);
  const bw = vw * 0.3;
  const grad = `<linearGradient id="${id}shn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.4"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`;
  const band = `<g clip-path="url(#${id}fc)"><g transform="skewX(-14)"><rect class="kit-shine" x="${(vx - bw).toFixed(1)}" y="${(vy - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${(vh * 3).toFixed(1)}" fill="url(#${id}shn)"/></g></g>`;
  return inject(svg.replace("</defs>", grad + "</defs>"), band);
}

/* Stamp the draggable run of a control (slider, progress, segment) onto the
   svg root in viewBox coordinates — play-mode pointer math reads it back and
   stays exact no matter how the art is scaled or padded. */
function stampTrack(svg: string, x: number, w: number): string {
  return svg.replace("<svg ", `<svg data-track="${x.toFixed(1)} ${w.toFixed(1)}" `);
}

/** Per-piece overrides for the Kit page and its pattern mocks — labels,
 *  segment captions and stock-icon swaps. All optional; defaults unchanged.
 *  `expand` grows the canvas around overflow content (the open dropdown's
 *  menu) — needed when the SVG will be consumed as an image file.
 *  `textOy` is the per-component vertical text adjustment (explicit values
 *  win over the theme's; 0 is a valid explicit value).
 *  `sub`/`max`/`addBtn` feed the mobile-game pieces (data row, HUD counter);
 *  `overlay` is a stackable status layer: "locked" | "new" | "check" |
 *  "equipped" | "count:N" | "level:N" | "cooldown:N" | "claimable" | "empty". */
export interface KitOpts {
  /** Container variant for panels — circle, oval, dialogue strip. */
  kind?: "circle" | "oval" | "strip";
  /** Alt tone — muted variant for empty/error titles; inert to hover. */
  tone?: "alt";
  /** Joystick deflection, each axis −1..1. */
  stick?: [number, number];
  label?: string; segments?: string[]; icon?: IconDef | null; expand?: boolean; textOy?: number; textOx?: number;
  /** Docked emblem socket — a silhouette-aware mini shell riding a bar's
   *  end, hosting any glyph (timer, coin, avatar placeholder). The dock
   *  system is one mechanism shared by every bar-family component. */
  dock?: { icon?: IconDef | null; side?: "left" | "right" } | null;
  /** Bar-family config — segment count/gap and snap mode (segbar). */
  bar?: { segments?: number; gap?: number; snap?: boolean };
  /** Slot icon emphasis — >1 makes the icon the star of the tile. */
  iconScale?: number;
  /** Atomic-part render for the engine export: "face" | "needle" |
   *  "segment" | "track" — draws only that layer of a gauge/circuit. */
  part?: string;
  sub?: string; max?: string; addBtn?: boolean; overlay?: string;
  /** Chosen slot values, keyed by slot id (see KIT_SLOTS in model.ts).
   *  The renderer validates against the slot's curated list — a choice
   *  slot never renders a value outside its choices, no matter what the
   *  store carries. */
  slots?: Record<string, string>;
  /** The user has explicitly themed this piece's text (a type fork or a
   *  per-piece text color) — instrument readouts that default to plain AUTO
   *  ink (cooldown) switch to the full type treatment when set. */
  themedText?: boolean;
  /** Data-row content model — independent size/tracking/placement per text
   *  group and slot toggles. Explicit label/sub/value still win per instance. */
  row?: {
    title?: string; sub?: string; subOn?: boolean;
    titleSize?: number; subSize?: number; titleDy?: number; subDy?: number; lineGap?: number; blockDy?: number; subColor?: string | null;
    titleTrack?: number; subTrack?: number;
    avatar?: boolean; progress?: boolean; action?: boolean; value?: number;
  };
}

export function renderKit(cfg: GenConfig, id: KitComponentId, size: KitSize, state: GenStateName = "default", value?: number, shapeOv?: Shape, opts: KitOpts = {}): string {
  if (opts.tone === "alt") {
    // muted variant — same material, drained of celebration
    cfg = JSON.parse(JSON.stringify(cfg)) as GenConfig;
    (["Inner Fill", "Bevel", "Glow"] as const).forEach((key) => {
      const c0 = cfg.effects[key];
      if (c0) cfg.effects[key] = desaturate(hexMix(c0, "#6A7080", 0.42), 0.3);
    });
    for (const st of Object.values(cfg.states)) { st.glow = Math.min(st.glow, 8); }
  }
  const k = SIZE_K[size];
  const bw = cfg.bevel.off ? 0 : cfg.bevel.width;
  // content text on kit pieces (counters, rows, segments) follows the global
  // type Size and vertical nudge exactly like built labels do
  const typeK = clamp(cfg.type.size / 52, 0.5, 2.2);
  // icon stroke weight rides the type controls — 1.0 at the default 24
  const iconWK = clamp((cfg.icon.strokeWidth ?? 24) / 24, 0.35, 1.8);
  const typeOyK = (opts.textOy ?? cfg.type.oy ?? 0);
  const typeOxK = (opts.textOx ?? cfg.type.ox ?? 0);
  const bevel = effect(cfg.effects, "Bevel"), glow = effect(cfg.effects, "Glow");
  // the dragger ball can carry its own color; null follows the Bevel role
  const knobC = cfg.knob?.color ?? bevel;
  /* content-text — the full typography treatment for text the pieces draw
     themselves (counters, segments, rows): fill mode incl. gradients, case,
     italic, tracking, outline, shadow and glow all follow the theme. */
  const contentText = (txt: string, x2: number, y2: number, fs2: number,
    o2: { anchor?: "start" | "middle" | "end"; opacity?: number; track?: number; keepCase?: boolean; autoInk?: string; list?: boolean } = {}) => {
    /* per-state type forks apply to self-drawn text too — editing the
       Pressed state's fill must recolor these lines on the Pressed view,
       exactly like built labels (owner: "change the text color") */
    const T4 = (state !== "default" ? cfg.stateDesigns?.[state as Exclude<GenStateName, "default">]?.type : undefined) ?? cfg.type;
    const gid4 = "ct" + UID++;
    const cased4 = o2.keepCase ? txt
      : T4.case === "upper" ? txt.toUpperCase()
      : T4.case === "lower" ? txt.toLowerCase()
      : T4.case === "title" ? txt.replace(/\b\w/g, (m2) => m2.toUpperCase())
      : txt;
    let defs4 = "", fill4 = o2.autoInk ?? "#FFFFFF";
    if (T4.fillMode === "solid") fill4 = T4.fill;
    else if (T4.fillMode === "gradient") {
      defs4 += `<linearGradient id="${gid4}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T4.fill}"/><stop offset="1" stop-color="${T4.fill2}"/></linearGradient>`;
      fill4 = `url(#${gid4}g)`;
    }
    const fsc4 = fs2 / 40;
    const prims4: ShadowSpec[] = [];
    const fd4 = (dx3: string, dy3: string, dev: number, col: string, op3: string): ShadowSpec =>
      [dx3, dy3, dev.toFixed(1), col, op3];
    if (T4.shadow.on) prims4.push(fd4((T4.shadow.x * fsc4).toFixed(1), (T4.shadow.y * fsc4).toFixed(1), T4.shadow.blur * fsc4 * 0.5, T4.shadow.color, (T4.shadow.opacity / 100).toFixed(2)));
    if (T4.glow.on && state !== "disabled") {
      prims4.push(fd4("0", "0", T4.glow.size * 0.3, T4.glow.color, (T4.glow.opacity / 100).toFixed(2)));
      prims4.push(fd4("0", "0", T4.glow.size * 0.8, T4.glow.color, ((T4.glow.opacity / 100) * 0.6).toFixed(2)));
    }
    /* absolute region — same Safari synthetic-italic fix as ${id}tf, and
       the same bound: an unbounded region trips Safari's filter-buffer
       cap and the text vanishes wholesale. Sized from this text's own
       metrics: estimated run width + the largest effect spread. */
    if (prims4.length) {
      const estW4 = cased4.length * fs2 * 0.8 + Math.abs(o2.track ?? 0) * cased4.length;
      const spread4 = Math.max(
        T4.glow.on && state !== "disabled" ? T4.glow.size * 0.8 * 3 : 0,
        T4.shadow.on ? (Math.abs(T4.shadow.x) + Math.abs(T4.shadow.y) + T4.shadow.blur * 1.5) * fsc4 : 0,
        8) + fs2 * 1.2;
      const rx4 = o2.anchor === "middle" ? x2 - estW4 / 2 : o2.anchor === "end" ? x2 - estW4 : x2;
      defs4 += `<filter id="${gid4}f" filterUnits="userSpaceOnUse" x="${(rx4 - spread4).toFixed(0)}" y="${(y2 + typeOyK * k - fs2 - spread4).toFixed(0)}" width="${(estW4 + spread4 * 2).toFixed(0)}" height="${(fs2 * 2 + spread4 * 2).toFixed(0)}" color-interpolation-filters="sRGB">${shadowChain11(prims4)}</filter>`;
    }
    const outline4 = T4.outline.on && state !== "disabled"
      ? ` stroke="${T4.outline.color}" stroke-width="${(T4.outline.width * (fs2 / 52)).toFixed(1)}" stroke-linejoin="round" paint-order="stroke"`
      : "";
    /* italic optical centering: slanted glyphs overhang to the right, so a
       middle-anchored italic block reads shifted right of true center —
       compensate leftward by ~half the slant overhang (≈0.07em at a 12°
       oblique). Start-anchored text keeps its left edge. */
    const italNudge = T4.italic && o2.anchor === "middle" ? -fs2 * 0.07 : 0;
    // BOTH nudges ride inside the helper so every self-drawn text (counters,
    // rows, segments, flip digits) shifts with the same controls as built
    // labels — vertical used to be per-callsite and read as dead elsewhere
    return (defs4 ? `<defs>${defs4}</defs>` : "") +
      (prims4.length ? `<g filter="url(#${gid4}f)">` : "") +
      `<text x="${(x2 + typeOxK * k + italNudge).toFixed(1)}" y="${(y2 + typeOyK * k).toFixed(1)}" font-family="'${o2.list && cfg.type.listFont ? cfg.type.listFont : T4.font}', Inter, sans-serif" font-size="${fs2.toFixed(1)}" font-weight="${Math.max(700, T4.weight)}"${T4.italic ? ' font-style="italic"' : ""} letter-spacing="${(((o2.track ?? 0) + T4.spacing) / 100).toFixed(3)}em" fill="${fill4}"${(T4.fillOpacity ?? 100) < 100 ? ` fill-opacity="${(T4.fillOpacity / 100).toFixed(2)}"` : ""}${outline4}${o2.anchor ? ` text-anchor="${o2.anchor}"` : ""} dominant-baseline="central" opacity="${(o2.opacity ?? 1).toFixed(2)}">${esc(cased4)}</text>` +
      (prims4.length ? `</g>` : "");
  };
  const wellFill = darken(effect(cfg.effects, "Inner Fill"), 0.72);
  const font = cfg.type.font;
  /* info readouts (percentages, x/y counters) ON THE FACE — ADAPTIVE ink,
     no outline: the color group's darkest role (Shadow) on light faces,
     near-white on dark faces. Not themed; theme voice is contentText. */
  const infoInk = cfg.face.mode === "dark" ? "rgba(255,255,255,0.88)" : darken(effect(cfg.effects, "Shadow"), 0.15);
  const infoText = (txt: string, x2: number, y2: number, fs2: number, anchor2: "start" | "middle" | "end" = "start", w2 = 800) =>
    `<text x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" font-family="Inter, sans-serif" font-size="${fs2.toFixed(1)}" font-weight="${w2}" fill="${infoInk}" text-anchor="${anchor2}" dominant-baseline="central">${esc(txt)}</text>`;
  /* HUD text for SPATIAL pieces and always-dark grounds (live footage,
     instrument wells): white with the tight dark understroke. */
  const hudText = (txt: string, x2: number, y2: number, fs2: number, anchor2: "start" | "middle" | "end" = "start", w2 = 800) =>
    `<text x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" font-family="Inter, sans-serif" font-size="${fs2.toFixed(1)}" font-weight="${w2}" fill="#FFFFFF" text-anchor="${anchor2}" dominant-baseline="central" style="paint-order: stroke; stroke: rgba(8,12,22,0.6); stroke-width: ${Math.max(2, fs2 * 0.17).toFixed(1)}px; stroke-linejoin: round">${esc(txt)}</text>`;
  const wellOf = (w: number, h: number, inset: number) =>
    // the well follows the same silhouette resolution as the shell: the
    // per-component override wins, then the curated default, then the master
    shapePath(shapeOv ?? KIT_SHAPE[id] ?? cfg.shape, 39 + inset, 30 + inset, w - inset * 2, h - inset * 2, Math.max(0, cfg.bevel.softness - 10));
  /* bar-fill styling layers (BarFx): second gradient with a blend mode,
     outer glow, inner shadow — identical on progress, sliders and rows */
  const BFX = cfg.barFx;
  const barFx = (gid: string, bx2: number, by2: number, fw2: number, bh2: number, r2: number) => {
    let defs = "", over = "", open = "", close = "";
    if (fw2 > 1 && BFX?.grad2.on) {
      defs += `<linearGradient id="${gid}g2" x1="0" y1="0" x2="${BFX.grad2.vertical ? 0 : 1}" y2="${BFX.grad2.vertical ? 1 : 0}"><stop offset="0" stop-color="${BFX.grad2.color1}"/><stop offset="1" stop-color="${BFX.grad2.color2}"/></linearGradient>`;
      over += `<path d="${roundRect(bx2, by2, fw2, bh2, r2)}" fill="url(#${gid}g2)" opacity="${(BFX.grad2.opacity / 100).toFixed(2)}"${BFX.grad2.blend !== "normal" ? ` style="mix-blend-mode:${BFX.grad2.blend}"` : ""}/>`;
    }
    if (fw2 > 1 && BFX?.shadow.on) {
      defs += `<linearGradient id="${gid}is" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000814" stop-opacity="${(BFX.shadow.opacity / 100).toFixed(2)}"/><stop offset="0.6" stop-color="#000814" stop-opacity="0"/></linearGradient>`;
      over += `<path d="${roundRect(bx2, by2, fw2, bh2, r2)}" fill="url(#${gid}is)"/>`;
    }
    if (fw2 > 1 && BFX?.glow.on && state !== "disabled") {
      defs += `<filter id="${gid}bg" x="-60%" y="-160%" width="220%" height="420%" color-interpolation-filters="sRGB">${shadow11(0, 0, (BFX.glow.size * 0.6).toFixed(1), BFX.glow.color, (BFX.glow.opacity / 100).toFixed(2))}</filter>`;
      open = `<g filter="url(#${gid}bg)">`; close = "</g>";
    }
    return { defs, over, open, close };
  };
  // style is global; the silhouette can differ per component (user override
  // wins, then the curated default, then the master's shape)
  const sov: Shape | undefined = shapeOv ?? KIT_SHAPE[id];

  /* v67: icons inherit the SAME treatment as type, in every self-drawn
     site — gradient/solid fill, outline pass, disabled dimming. */
  const themedIcon = (defI: IconDef, xI: number, yI: number, sI: number, tone: string, swI = 2.2): string => {
    const T4 = cfg.type;
    if (state === "disabled") return iconGroup(defI, xI, yI, sI, "#A7AAB4", { strokeWidth: swI * iconWK });
    // a CUSTOM icon color (the Icon block's un-inherited well) beats the
    // type treatment in every self-drawn site — same contract as built icons
    // the icon's own outline width outranks the type's when set; 0 = no border
    const owI = cfg.icon.outlineWidth ?? T4.outline.width;
    if (cfg.icon.color) {
      const outlC = T4.outline.on && owI > 0.01 ? iconGroup(defI, xI, yI, sI, T4.outline.color, { strokeWidth: swI * iconWK + owI * 0.8 }) : "";
      return outlC + iconGroup(defI, xI, yI, sI, cfg.icon.color, { strokeWidth: swI * iconWK });
    }
    const gidI = "ti" + UID++;
    const grad = T4.fillMode === "gradient" ? `<defs><linearGradient id="${gidI}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T4.fill}"/><stop offset="1" stop-color="${T4.fill2}"/></linearGradient></defs>` : "";
    const fillI = T4.fillMode === "gradient" ? `url(#${gidI})` : T4.fillMode === "solid" ? T4.fill : tone;
    const outl = T4.outline.on && owI > 0.01 ? iconGroup(defI, xI, yI, sI, T4.outline.color, { strokeWidth: swI * iconWK + owI * 0.8 }) : "";
    return grad + outl + iconGroup(defI, xI, yI, sI, fillI, { strokeWidth: swI * iconWK });
  };

  /* Emblem treatment for the showcase pieces (card back, booster pack):
     the Icons panel's fx dials, honored at piece scale. Glow keeps each
     piece's designed radius; emboss and shadow mirror the built icons'
     recipe, so what the panel toggles is exactly what emblems do. */
  const emblemFx = (glowR: number, glowTint: string): string => {
    const ifx = cfg.icon.fx;
    const f: string[] = [];
    if (ifx.emboss && state !== "disabled") f.push(`drop-shadow(0 ${(-1 * k).toFixed(1)}px ${(0.4 * k).toFixed(1)}px rgba(255,255,255,0.6)) drop-shadow(0 ${(1.6 * k).toFixed(1)}px ${(1 * k).toFixed(1)}px rgba(4,8,14,0.5))`);
    if (ifx.shadow) f.push(`drop-shadow(0 ${(2 * k).toFixed(1)}px ${(1.5 * k).toFixed(1)}px rgba(0,0,0,0.4))`);
    if (ifx.glow && state !== "disabled") f.push(`drop-shadow(0 0 ${glowR.toFixed(0)}px ${glowTint})`);
    return f.length ? ` style="filter: ${f.join(" ")}"` : "";
  };

  /* A standalone glyph in its own WELL (loot tag gem, order-ticket dish,
     reward-card face) honoring the WHOLE Icons panel — size, weight,
     opacity, rotation, fx dials and the color/type treatment — exactly
     what that panel promises ("every glyph in the kit follows this one
     treatment"). Center-anchored so rotation pivots in place. */
  const wellGlyph = (defI: IconDef, cxI: number, cyI: number, baseS: number, tone: string, swI = 2.2): string => {
    const sI = baseS * clamp((cfg.icon.size ?? 100) / 100, 0.4, 2.2);
    const op = (cfg.icon.opacity ?? 100) < 100 ? ` opacity="${(cfg.icon.opacity / 100).toFixed(2)}"` : "";
    const rot = cfg.icon.rotation ? ` transform="rotate(${cfg.icon.rotation} ${cxI.toFixed(1)} ${cyI.toFixed(1)})"` : "";
    return `<g${op}${rot}${emblemFx(Math.max(6, sI * 0.28), glow)}>${themedIcon(defI, cxI - sI / 2, cyI - sI / 2, sI, tone, swI)}</g>`;
  };

  /* ── dock system ────────────────────────────────────────────────
     Renders the emblem SOCKET as a full mini shell (the complete candy
     stack, silhouette-aware) and embeds it over the host bar, centered on
     the track axis. The host canvas grows symmetrically so the socket and
     its glow never clip — in the live app, on the Board or in a PNG. */
  const applyDock = (host: string, dock: NonNullable<KitOpts["dock"]>, shellX: number, shellW: number, cy: number, D: number): string => {
    const dIcon = dock.icon === null ? null : (dock.icon ?? STOCK_ICONS.clock ?? null);
    const piece = build(cfg, state === "disabled" ? "disabled" : "default",
      { x: 33, y: 27, h: D, fs: 0, iconSize: D * 0.5 }, { iconDef: dIcon, label: "", fixedW: D, shapeOverride: sov });
    const pvb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(piece);
    const psh = /data-shell="([-\d. ]+)"/.exec(piece);
    const pw = /width="([\d.]+)"/.exec(piece);
    const ph = /height="([\d.]+)"/.exec(piece);
    if (!pvb || !psh || !pw || !ph) return host;
    const [sx, sy, sw2, sh2] = psh[1].split(" ").map(Number);
    const cx = dock.side === "right" ? shellX + shellW - D * 0.46 : shellX + D * 0.46;
    // inline the piece's CONTENT in a translated group — plain user-space
    // coordinates, no nested-viewport semantics to trip over
    const tx = cx - (sx + sw2 / 2), ty = cy - (sy + sh2 / 2);
    const innerSvg = piece.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    // the piece's canvas box, mapped into host coordinates
    const bxL = +pvb[1] + tx, bxT = +pvb[2] + ty;
    const bxR = bxL + +pvb[3], bxB = bxT + +pvb[4];
    // grow the host canvas symmetrically so the anchor math (glow-pad
    // reclaim reads viewBox.x for both axes) stays true everywhere
    const hvb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(host);
    if (!hvb) return host;
    const [, hx, hy, hw, hh] = hvb.map(Number);
    const need = Math.max(0,
      hx - (bxL - 4),          // left overflow
      hy - (bxT - 4),          // top overflow
      (bxR + 4) - (hx + hw),   // right overflow
      (bxB + 4) - (hy + hh));  // bottom overflow
    const ex = Math.ceil(need);
    let out = host;
    if (ex > 0) {
      out = out
        .replace(/ width="([\d.]+)"/, (_m, w0) => ` width="${(+w0 + ex * 2).toFixed(0)}"`)
        .replace(/ height="([\d.]+)"/, (_m, h0) => ` height="${(+h0 + ex * 2).toFixed(0)}"`)
        .replace(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/, (_m, a, b, c2, d2) =>
          `viewBox="${(+a - ex).toFixed(1)} ${(+b - ex).toFixed(1)} ${(+c2 + ex * 2).toFixed(1)} ${(+d2 + ex * 2).toFixed(1)}"`);
    }
    const shadow = `<ellipse cx="${cx.toFixed(1)}" cy="${(cy + D * 0.46).toFixed(1)}" rx="${(D * 0.44).toFixed(1)}" ry="${(D * 0.1).toFixed(1)}" fill="rgba(0,0,0,0.35)"/>`;
    return inject(out, `<g data-dock="${dock.side ?? "left"}">${shadow}<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)})">${innerSvg}</g></g>`);
  };

  switch (id) {
    case "primary":
      return build(cfg, state, { x: 39, y: 30, h: 136 * k, fs: 42 * k, iconSize: 38 * k }, { label: opts.label, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "secondary":
      return build(cfg, state, { x: 39, y: 30, h: 136 * k, fs: 42 * k, iconSize: 38 * k }, { secondary: true, label: opts.label ?? "Secondary", shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "small":
      return build(cfg, state, { x: 39, y: 30, h: 100 * k, fs: 32 * k, iconSize: 26 * k }, { label: opts.label ?? "GO", iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "ghost":
      return build(cfg, state, { x: 39, y: 30, h: 110 * k, fs: 34 * k, iconSize: 28 * k }, { secondary: true, label: opts.label ?? "Ghost", iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "iconbtn":
      return build(cfg, state, { x: 33, y: 27, h: 132 * k, fs: 0, iconSize: 56 * k }, { iconDef: opts.icon ?? cfg.icon.def ?? DEFAULT_ICON, label: "", fixedW: 132 * k, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "chip":
      return build(cfg, state, { x: 39, y: 30, h: 86 * k, fs: 28 * k, iconSize: 24 * k }, { label: opts.label ?? "NEW", iconDef: opts.icon === undefined ? STOCK_ICONS.star : opts.icon, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "badge":
      // presented (count) → awarded (star) → disabled
      return state === "pressed"
        ? build(cfg, state, { x: 33, y: 27, h: 112 * k, fs: 0, iconSize: 52 * k }, { label: "", iconDef: opts.icon ?? STOCK_ICONS.star, fixedW: 118 * k, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx })
        : build(cfg, state, { x: 33, y: 27, h: 112 * k, fs: 40 * k, iconSize: 0 }, { label: opts.label ?? "12", iconDef: null, fixedW: 118 * k, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "tab":
      return build(cfg, state, { x: 39, y: 30, h: 94 * k, fs: 30 * k, iconSize: 0 }, { label: opts.label ?? "TAB", iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    case "segment": {
      const w = 560 * k, h = 106 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const cy = 30 + h / 2 + 1;
      /* even distribution within the VISUAL bounds: the pill's end caps eat
         horizontal room, so the segment zone starts past them — the outer
         labels get the same air to the edge as every inner gap */
      const capIn = h * 0.2;
      const zoneX = 39 + bw + capIn, zoneW = w - bw * 2 - capIn * 2;
      const segW = zoneW / 3;
      // value picks the active segment (0..2) — play mode drives it live;
      // the resting default stays on the middle segment, as it always has
      const sel = clamp(Math.round(value ?? 1), 0, 2);
      const selX = zoneX + segW * sel;
      const well = `<path d="${roundRect(selX + 4, 30 + bw + 4, segW - 8, h - bw * 2 - 8, (h - bw * 2 - 8) * 0.3)}" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
      const t = (label: string, cx: number, op: number) =>
        contentText(label, cx, cy, 30 * k * typeK, { anchor: "middle", opacity: op });
      const caps = opts.segments && opts.segments.length === 3 ? opts.segments : ["ONE", "TWO", "THREE"];
      return stampTrack(inject(track, well + caps.map((cap, i) => t(cap, zoneX + segW * (i + 0.5), i === sel ? 1 : 0.55)).join("")), zoneX, zoneW);
    }
    case "checkbox": {
      // stateful: a dead (dim) check sits in the well until clicked alive.
      // rendered on the resting state only — checks never grow on hover.
      const lit = (value ?? 1) > 0.5;
      const ch = 118 * k;
      const track = build(cfg, state === "disabled" ? "disabled" : "default", { x: 33, y: 27, h: ch, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: ch, shapeOverride: sov });
      const inset3 = bw + 4;
      const wellP = shapePath(sov ?? cfg.shape, 33 + inset3, 27 + inset3, ch - inset3 * 2, ch - inset3 * 2, Math.max(0, cfg.bevel.softness - 10));
      const ck = lit
        ? iconGroup(STOCK_ICONS.check, 33 + ch * 0.24, 27 + ch * 0.24, ch * 0.52, glow, { strokeWidth: 3 * iconWK, filter: `drop-shadow(0 0 6px ${glow})` })
        : iconGroup(STOCK_ICONS.check, 33 + ch * 0.24, 27 + ch * 0.24, ch * 0.52, "rgba(255,255,255,0.22)", { strokeWidth: 3 * iconWK });
      return inject(track, `<path d="${wellP}" fill="${wellFill}" opacity="0.9"/>` + ck);
    }
    case "radio": {
      // stateful like the checkbox: a dim hollow pip waits in the well and
      // lights solid when selected — resting state only, marks never grow
      const lit2 = (value ?? 1) > 0.5;
      const ch2 = 118 * k;
      const track2 = build(cfg, state === "disabled" ? "disabled" : "default", { x: 33, y: 27, h: ch2, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: ch2, shapeOverride: sov });
      const insetR = bw + 4;
      const wellR = shapePath(sov ?? cfg.shape, 33 + insetR, 27 + insetR, ch2 - insetR * 2, ch2 - insetR * 2, Math.max(0, cfg.bevel.softness - 10));
      const rcx = 33 + ch2 / 2, rcy = 27 + ch2 / 2, rr = ch2 * 0.17;
      const pip = lit2
        ? `<circle cx="${rcx.toFixed(1)}" cy="${rcy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${glow}" style="filter: drop-shadow(0 0 6px ${glow})"/>`
        : `<circle cx="${rcx.toFixed(1)}" cy="${rcy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${(2.5 * iconWK).toFixed(2)}"/>`;
      return inject(track2, `<path d="${wellR}" fill="${wellFill}" opacity="0.9"/>` + pip);
    }
    case "toggle": {
      const on = (value ?? 1) > 0.5;
      // compact premium proportion: shell ≈ 2–2.5× the knob diameter, with the
      // knob filling most of the inner height like a hardware switch
      const w = 148 * k, h = 102 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const knobR = (h - bw * 2) / 2 - 8;
      const kx = on ? 39 + w - inset - 5 - knobR : 39 + inset + 5 + knobR;
      const ky = 30 + h / 2;
      const dot = state === "disabled" ? "#A7AAB4" : on ? glow : "#9AA1AC";
      return inject(track, `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="${on ? 0.92 : 0.96}"/>` + candyKnob(kx, ky, knobR, knobC, dot));
    }
    case "slider": {
      const w = 460 * k, h = 64 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw * 0.7 + 3;
      const gapPad = 5 * k;
      const bh = h - inset * 2 - gapPad * 2;
      const bx = 39 + inset + gapPad, by = 30 + inset + gapPad;
      const trackW = w - inset * 2 - gapPad * 2;
      const gid = "sl" + UID++;
      /* endpoint clamp — the shared range behavior: the thumb stays inside
         the component's outer boundary at 0% and 100% (it may overlap the
         inner track), and the fill ends at the thumb's center */
      const kr = h * 0.42;
      const v01 = clamp(value ?? 0.62, 0, 1);
      const knobX = 39 + Math.max(kr + 1.5, Math.min(w - kr - 1.5, inset + gapPad + trackW * v01));
      const fillW = Math.max(0, knobX - bx);
      const knobY = 30 + h / 2;
      const sfx = barFx(gid, bx, by, fillW, bh, Math.min(bh / 2, fillW / 2));
      /* the mercury follows the silhouette (design canon, same as progress):
         the fill clips to a silhouette-shaped region over the track, so the
         START cap inherits the component's contour on ornate shells. The
         knob still owns the leading edge. Stock stadium: region == pill,
         nothing changes. */
      const clipSl = shapePath(shapeOv ?? KIT_SHAPE[id] ?? cfg.shape, bx, by, trackW, bh, Math.max(0, cfg.bevel.softness - 12));
      return stampTrack(inject(track,
        `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="0.92"/>
         <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>${sfx.defs}<clipPath id="${gid}w"><path d="${clipSl}"/></clipPath></defs>
         ${fillW > 1 ? `<g clip-path="url(#${gid}w)">${sfx.open}<path d="${roundRect(bx, by, fillW, bh, Math.min(bh / 2, fillW / 2))}" fill="url(#${gid})" opacity="${state === "disabled" ? 0.35 : 0.95}"/>${sfx.close}
         <path d="${roundRect(bx + 2 * k, by + bh * 0.08, Math.max(0, fillW - 4 * k), bh * 0.34, bh * 0.17)}" fill="#FFFFFF" opacity="0.3"/>${sfx.over}</g>` : ""}` +
        candyKnob(knobX, knobY, kr, knobC)), bx, trackW);
    }
    case "emblembar": // first-class docked bar — progress with the socket built in
    case "progress": {
      const w = 520 * k, h = 64 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 3;
      const gapPad = 6 * k;
      const bx = 39 + inset + gapPad, by = 30 + inset + gapPad;
      const bh = h - inset * 2 - gapPad * 2;
      const trackW = w - inset * 2 - gapPad * 2;
      const v01p = clamp(value ?? 0.62, 0, 1);
      const fw = trackW * v01p;
      const gid = "pg" + UID++;
      const pfx = barFx(gid, bx, by, fw, bh, bh / 2);
      /* the mercury follows the silhouette (design canon): the fill clips to
         its own silhouette-shaped region, so the left cap always inherits the
         component's contour and a full bar IS the contour. Partial fills keep
         a rounded leading bead on the right. */
      const mercP = shapePath(shapeOv ?? KIT_SHAPE[id] ?? cfg.shape, bx, by, trackW, bh, Math.max(0, cfg.bevel.softness - 12));
      const full = v01p >= 0.995;
      const fx1 = bx + fw;
      const r5 = Math.min(bh / 2, Math.max(2, fw / 2));
      const dimP = state === "disabled" ? 0.35 : 0.95;
      const mercFill = full
        ? `<path d="${mercP}" fill="url(#${gid})" opacity="${dimP}"/>`
        : `<path d="M ${(bx - 2).toFixed(1)} ${by.toFixed(1)} H ${(fx1 - r5).toFixed(1)} Q ${fx1.toFixed(1)} ${by.toFixed(1)} ${fx1.toFixed(1)} ${(by + r5).toFixed(1)} V ${(by + bh - r5).toFixed(1)} Q ${fx1.toFixed(1)} ${(by + bh).toFixed(1)} ${(fx1 - r5).toFixed(1)} ${(by + bh).toFixed(1)} H ${(bx - 2).toFixed(1)} Z" fill="url(#${gid})" opacity="${dimP}"/>`;
      const mercGloss = `<path d="${roundRect(bx - 2, by + bh * 0.08, Math.max(0, fw + 2 - bh * 0.1), bh * 0.34, bh * 0.17)}" fill="#FFFFFF" opacity="0.3"/>`;
      let out = stampTrack(inject(track,
        `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="0.92"/>
         <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>${pfx.defs}<clipPath id="${gid}w"><path d="${mercP}"/></clipPath></defs>
         ${fw > 1 ? `<g clip-path="url(#${gid}w)">${pfx.open}${mercFill}${pfx.close}
         ${mercGloss}${pfx.over}</g>` : ""}`), bx, trackW);
      // emblem bar: the docked socket rides the track end, over the fill —
      // always on for the first-class component (its icon override drives
      // the emblem), opt-in via bar settings for a plain progress bar
      const dockO = opts.dock ?? (id === "emblembar" ? { icon: opts.icon, side: "left" as const } : undefined);
      if (dockO) out = applyDock(out, dockO, 39, w, 30 + h / 2, h * 1.9);
      return out;
    }
    case "segbar": {
      /* Segmented meter — stamina pips, charge cells, boss phases. Every
         cell is an identical rounded rect floating in the well's negative
         space. Snap mode lights whole cells; smooth mode slides one fill
         under the notches. */
      const w = 520 * k, h = 72 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 3;
      const gapPad = 6 * k;
      const bx = 39 + inset + gapPad, by = 30 + inset + gapPad;
      const bh = h - inset * 2 - gapPad * 2;
      const trackW = w - inset * 2 - gapPad * 2;
      const n = clamp(Math.round(opts.bar?.segments ?? 5), 2, 12);
      const gap = clamp(opts.bar?.gap ?? 6, 2, 14) * k;
      const snap = opts.bar?.snap ?? true;
      const v = clamp(value ?? 0.62, 0, 1);
      const cellW = (trackW - gap * (n - 1)) / n;
      const gid = "sg" + UID++;
      // cells clip to the well silhouette so the first and last inherit the
      // theme's corners while middle cells stay squared
      const wellP = wellOf(w, h, inset);
      const clip = `<clipPath id="${gid}c"><path d="${wellP}"/></clipPath>`;
      // cells shade top-to-bottom (candy lighting), never along the bar
      const grad = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>`;
      const dim = state === "disabled" ? 0.35 : 0.95;
      let litCells = "", offCells = "";
      if (snap) {
        const lit = Math.round(v * n);
        for (let i = 0; i < n; i++) {
          const cx0 = bx + i * (cellW + gap);
          // every cell is the SAME rounded rect, floating in the well's
          // negative space — end cells no longer bleed into the caps
          const on = i < lit;
          const body = `<rect x="${cx0.toFixed(1)}" y="${by.toFixed(1)}" width="${cellW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min((2 + cfg.bevel.softness * 0.16) * k, cellW * 0.3, bh / 2).toFixed(1)}" fill="${on ? `url(#${gid})` : "rgba(255,255,255,0.07)"}"${on ? ` opacity="${dim}"` : ""}/>`;
          if (on) litCells += body + `<rect x="${cx0.toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${cellW.toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>`;
          else offCells += body;
        }
      } else {
        const fw2 = trackW * v;
        if (fw2 > 1) {
          // full pill rounding — a squarer radius fought the well's cap curve
          litCells += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${fw2.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="url(#${gid})" opacity="${dim}"/>
            <rect x="${(bx + 3 * k).toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${Math.max(0, fw2 - 6 * k).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>`;
        }
        // the gap notches carve the fill into segments
        for (let i = 1; i < n; i++) {
          const gx = bx + i * (cellW + gap) - gap;
          offCells += `<rect x="${gx.toFixed(1)}" y="${(by - 1).toFixed(1)}" width="${gap.toFixed(1)}" height="${(bh + 2).toFixed(1)}" fill="${wellFill}"/>`;
        }
      }
      const pfx = barFx(gid + "f", bx, by, snap ? trackW * (Math.round(v * n) / n) : trackW * v, bh, bh / 2);
      let out = stampTrack(inject(track,
        `<path d="${wellP}" fill="${wellFill}" opacity="0.92"/>
         <defs>${grad}${clip}${pfx.defs}</defs>
         <g clip-path="url(#${gid}c)" data-seg="${n}">${pfx.open}${litCells}${pfx.close}${offCells}</g>${pfx.over}`), bx, trackW);
      if (opts.dock) out = applyDock(out, opts.dock, 39, w, 30 + h / 2, h * 1.8);
      return out;
    }
    case "input": {
      const w = 560 * k, h = 124 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const tyIn = 30 + h / 2 + 1 + (opts.textOy ?? cfg.type.oy ?? 0) * k;
      // the typeable area is the 9-slice text-safe zone: value and caret clip
      // to it, and data-maxchars tells live hosts when to stop accepting keys
      const gidIn = "in" + UID++;
      const charW = 19 * k * typeK;
      const safeW = w - inset * 2 - 44 * k;
      const maxChars = Math.max(3, Math.floor(safeW / charW));
      // a real value carries the full type treatment; the placeholder stays quiet
      const ph = opts.label
        ? contentText(opts.label, 39 + inset + 20 * k, tyIn, 32 * k * typeK, { keepCase: true })
        : `<text x="${39 + inset + 20 * k}" y="${tyIn.toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${30 * k}" font-style="italic" font-weight="500" fill="rgba(255,255,255,0.55)" dominant-baseline="central">${esc("Type something…")}</text>`;
      const caret = state === "hover"
        ? `<rect x="${(39 + inset + 20 * k + (opts.label ? Math.min(opts.label.length, maxChars) * charW : 0)).toFixed(1)}" y="${(tyIn - 17 * k * typeK).toFixed(1)}" width="${(2.5 * k).toFixed(1)}" height="${(34 * k * typeK).toFixed(1)}" fill="${hexMix(glow, "#FFFFFF", 0.4)}"><animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/></rect>`
        : "";
      return inject(track.replace("<svg ", `<svg data-maxchars="${maxChars}" `),
        `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="0.9"/>` +
        `<defs><clipPath id="${gidIn}"><rect x="${(39 + inset + 6 * k).toFixed(1)}" y="${30 + 2}" width="${(w - inset * 2 - 12 * k).toFixed(1)}" height="${h - 4}"/></clipPath></defs>` +
        `<g clip-path="url(#${gidIn})"><g data-value="1">` + ph + `</g>` + caret.replace("<rect ", '<rect data-caret="1" ') + `</g>`);
    }
    case "header": {
      // resolve the label explicitly: build() treats a missing label with an
      // explicit iconDef as icon-only, which would blank the banner.
      // The shell is sized from a GENEROUS text estimate (display faces run
      // wider than the char factor) plus the silhouette's cap + safe insets,
      // so the label respects the three-slice bounds the guides draw.
      const h5 = 158 * k;
      const lbl5 = (opts.label ?? cfg.content.label) || "BANNER";
      const met5 = silhouetteMeta((sov ?? "banner") as Shape);
      const T5 = cfg.type;
      const fs5 = 46 * k * (T5.size / 52);
      const tw5 = lbl5.length * fs5 * fontByName(T5.font).factor * (1 + T5.spacing / 100) * 1.18 + (T5.italic ? fs5 * 0.35 : 0);
      const inset5 = met5 ? Math.max(met5.content.left, met5.capScale) * h5 + Math.max(12, fs5 * 0.3) : 90 * k;
      const w5 = Math.min(2600 * k, Math.max(430 * k, tw5 + inset5 * 2));
      /* v67: reverted to the classic construction — the label rides the face
         directly (the type was never the problem). The wonky inner shapes are
         fixed at the source now: build() derives face and rim through TRUE
         inward offsets, so the swallowtail's inner contour parallels the
         outer instead of drifting like a rescaled clone. */
      return build(cfg, state, { x: 52, y: 34, h: h5, fs: 46 * k, iconSize: 0, maxW: 2600 * k }, { label: opts.label ?? cfg.content.label, iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx, fixedW: w5 });
    }
    case "panel": {
      // container shell — same recipe, bigger canvas. tokenH keeps walls,
      // rim and depth at component scale instead of scaling with the height.
      // kinds: circle (medallion dialogs), oval (50s-modern), strip (dialogue)
      const dims: Record<KitSize, [number, number]> =
        opts.kind === "circle" ? { s: [300, 300], m: [380, 380], l: [470, 470] }
        : opts.kind === "oval" ? { s: [420, 258], m: [540, 330], l: [680, 415] }
        : opts.kind === "strip" ? { s: [540, 100], m: [700, 124], l: [880, 152] }
        : { s: [430, 290], m: [580, 380], l: [780, 470] };
      const [pw, ph2] = dims[size];
      return build(cfg, state, { x: 42, y: 33, h: ph2, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: pw, shapeOverride: opts.kind ? "pill" : sov });
    }
    case "vsbar": {
      /* Fighting · VS health bar — two mirrored wells drain toward center,
         candy VS medallion on the axis. value drives the LEFT fighter. */
      const w = 860 * k, h = 96 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 110 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 3, gapPad = 6 * k;
      const bx = 39 + inset + gapPad, by = 30 + inset + gapPad;
      const bh = h - inset * 2 - gapPad * 2;
      const trackW = w - inset * 2 - gapPad * 2;
      const cxV = 39 + w / 2;
      const halfW = trackW / 2 - 56 * k;
      const vL = clamp(value ?? 0.72, 0, 1), vR = 0.58;
      const gid = "vs" + UID++;
      const wellP = wellOf(w, h, inset);
      const rC = hexMix("#FF4D5A", glow, 0.25);
      /* the fills follow the silhouette (design canon, same as progress):
         both pills clip to a silhouette-shaped region over the track, so
         the OUTER caps inherit the component's contour — an ornate shell's
         scalloped ends shape the mercury — while the drain edges toward
         center keep their rounded beads. On the stock stadium the region
         equals the pill, so nothing changes there. */
      const clipVs = shapePath(shapeOv ?? KIT_SHAPE[id] ?? cfg.shape, bx, by, trackW, bh, Math.max(0, cfg.bevel.softness - 12));
      const parts = `<path d="${wellP}" fill="${wellFill}" opacity="0.92"/>
        <defs>
        <linearGradient id="${gid}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
        <linearGradient id="${gid}r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${darken(rC, 0.25)}"/><stop offset="1" stop-color="${rC}"/></linearGradient>
        <clipPath id="${gid}w"><path d="${clipVs}"/></clipPath></defs>
        <g data-vs="1" clip-path="url(#${gid}w)">
          ${vL > 0.01 ? `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(halfW * vL).toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="url(#${gid}l)" opacity="${state === "disabled" ? 0.35 : 0.95}"/>
          <rect x="${(bx + bh * 0.16).toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${Math.max(0, halfW * vL - bh * 0.32).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>` : ""}
          ${vR > 0.01 ? `<rect x="${(bx + trackW - halfW * vR).toFixed(1)}" y="${by.toFixed(1)}" width="${(halfW * vR).toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="url(#${gid}r)" opacity="${state === "disabled" ? 0.35 : 0.95}"/>
          <rect x="${(bx + trackW - halfW * vR + bh * 0.16).toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${Math.max(0, halfW * vR - bh * 0.32).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>` : ""}
        </g>` +
        candyKnob(cxV, 30 + h / 2, h * 0.46, knobC) +
        `<text x="${(cxV + typeOxK * k).toFixed(1)}" y="${(30 + h / 2 + 1 + typeOyK * k).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(30 * k * typeK).toFixed(1)}" font-weight="800" font-style="italic" fill="${darken(bevel, 0.6)}" text-anchor="middle" dominant-baseline="central">VS</text>`;
      return stampTrack(inject(track, parts), bx, trackW);
    }
    case "dialog": {
      /* System chrome · dialog — the full modal frame: shell, title, body
         well with quiet placeholder rows, and two candy action capsules.
         The #1 piece every game ships. */
      const w = 640 * k, h = 420 * k;
      /* editing contract: the STATE targets ONE action capsule and the value
         picks WHICH — value < 0.5 arms the primary (CLAIM), ≥ 0.5 arms the
         secondary (LATER). Hover lights the armed capsule, pressed depresses
         it; the frame itself only ever dims for disabled. */
      const armedSecondary = (value ?? 0) >= 0.5;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 10 * k;
      const title = contentText(opts.label ?? "QUEST COMPLETE", 42 + w / 2, 33 + inset + 34 * k, 38 * k * typeK, { anchor: "middle" });
      const wellY = 33 + inset + 68 * k;
      const wellH = h - inset * 2 - 68 * k - 92 * k;
      const well = `<path d="${roundRect(42 + inset + 8 * k, wellY, w - inset * 2 - 16 * k, wellH, 14 * k)}" fill="${wellFill}" opacity="0.85"/>`;
      const lines = [0.84, 0.62, 0.4].map((f, i) =>
        `<rect x="${(42 + inset + 34 * k).toFixed(1)}" y="${(wellY + 26 * k + i * 30 * k).toFixed(1)}" width="${((w - inset * 2 - 68 * k) * f).toFixed(1)}" height="${(12 * k).toFixed(1)}" rx="${(6 * k).toFixed(1)}" fill="rgba(255,255,255,0.2)"/>`).join("");
      const btnH = 56 * k, btnGap = 18 * k;
      const btnW = (w - inset * 2 - 16 * k - btnGap) / 2;
      const btnY = 33 + h - inset - 8 * k - btnH;
      const capBtn = (bx3: number, lbl3: string, primaryB: boolean) => {
        const gid3 = "dg" + UID++;
        const armed = primaryB !== armedSecondary; // the capsule the state drives
        const hot = state === "hover" && armed;
        const press = state === "pressed" && armed;
        const dy3 = press ? 2 * k : 0;
        /* CONTRAST CONTRACT: the capsules run COUNTER to the face — dark
           capsules with light ink on light faces, light capsules with dark
           ink on dark faces. The hue still comes from the Bevel role, only
           the value flips, so every preset keeps its identity AND its
           legibility. Labels take auto ink (the theme font stays). */
        const darkFace = cfg.face.mode === "dark";
        const top3 = primaryB
          ? (darkFace ? lighten(bevel, hot ? 0.66 : press ? 0.44 : 0.58) : darken(bevel, hot ? 0.26 : press ? 0.5 : 0.38))
          : (darkFace ? "rgba(255,255,255,0.72)" : "rgba(10,16,26,0.4)");
        const bot3 = primaryB
          ? (darkFace ? lighten(bevel, press ? 0.14 : 0.24) : darken(bevel, press ? 0.72 : 0.62))
          : (darkFace ? "rgba(255,255,255,0.5)" : "rgba(10,16,26,0.56)");
        const ink3 = darkFace ? darken(bevel, 0.66) : "#FFFFFF";
        const inkOp = primaryB ? 1 : 0.88;
        return `<defs><linearGradient id="${gid3}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top3}"/><stop offset="1" stop-color="${bot3}"/></linearGradient></defs>
          <g transform="translate(0 ${dy3.toFixed(1)})">
          <rect x="${bx3.toFixed(1)}" y="${btnY.toFixed(1)}" width="${btnW.toFixed(1)}" height="${btnH.toFixed(1)}" rx="${(btnH / 2).toFixed(1)}" fill="url(#${gid3})" stroke="${hot ? hexRgba(glow, 0.9) : darkFace ? "rgba(8,14,24,0.55)" : "rgba(255,255,255,0.35)"}" stroke-width="${hot ? 2.2 : 1.4}"${state !== "disabled" && (primaryB || hot) ? ` style="filter: drop-shadow(0 0 ${((hot ? 11 : 6) * k).toFixed(1)}px ${hexRgba(glow, hot ? 0.8 : 0.55)})"` : ""}/>
          <rect x="${(bx3 + btnH * 0.28).toFixed(1)}" y="${(btnY + btnH * 0.14).toFixed(1)}" width="${(btnW - btnH * 0.56).toFixed(1)}" height="${(btnH * 0.24).toFixed(1)}" rx="${(btnH * 0.12).toFixed(1)}" fill="#FFFFFF" opacity="${press ? 0.06 : primaryB ? (hot ? 0.24 : 0.15) : 0.08}"/>
          <text x="${(bx3 + btnW / 2 + (cfg.type.italic ? -23 * k * typeK * 0.07 : 0)).toFixed(1)}" y="${(btnY + btnH / 2 + 1).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(23 * k * typeK).toFixed(1)}" font-weight="${Math.max(700, cfg.type.weight)}"${cfg.type.italic ? ' font-style="italic"' : ""} letter-spacing="0.04em" fill="${ink3}" fill-opacity="${inkOp}" text-anchor="middle" dominant-baseline="central">${esc(lbl3)}</text>
          </g>`;
      };
      const bx0 = 42 + inset + 8 * k;
      // the stamped track spans the button row — in play mode the pointer's
      // x arms whichever capsule it's over (left = CLAIM, right = LATER)
      return stampTrack(inject(shell.replace("<svg ", '<svg data-dialog="1" '),
        title + well + lines + capBtn(bx0, (opts.slots?.cta1 ?? "CLAIM").slice(0, 12), true) + capBtn(bx0 + btnW + btnGap, (opts.slots?.cta2 ?? "LATER").slice(0, 12), false)), bx0, btnW * 2 + btnGap);
    }
    case "toast": {
      /* System chrome · toast — one confirmation strip: accent edge, themed
         check, message, quiet dismiss. */
      const w = 560 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 110 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const stripe = `<rect x="${(39 + inset + 10 * k).toFixed(1)}" y="${(30 + inset + 12 * k).toFixed(1)}" width="${(6 * k).toFixed(1)}" height="${(h - inset * 2 - 24 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${glow}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>`;
      const chk0 = opts.icon ?? STOCK_ICONS.check;
      const chk = chk0 ? themedIcon(chk0, 39 + inset + 30 * k, 30 + h / 2 - 15 * k, 30 * k, glow, 2.6) : "";
      const msg = contentText(opts.label ?? "Progress saved", 39 + inset + 78 * k, 30 + h / 2 + 1, 26 * k * typeK, { keepCase: true });
      const dismiss = infoText("×", 39 + w - inset - 26 * k, 30 + h / 2 + 1, 26 * k, "middle", 700);
      return inject(shell.replace("<svg ", '<svg data-toast="1" '), stripe + chk + msg + dismiss);
    }
    case "tooltip": {
      /* System chrome · tooltip — the kit material in a small bubble with a
         pointer nub; games tooltip in full costume, so the shell stays. */
      const h6 = 84 * k;
      const piece = build(cfg, state, { x: 39, y: 30, h: h6, fs: 26 * k, iconSize: 0 }, { label: opts.label ?? "+15% CRIT CHANCE", iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
      // shell0: injected content rides INSIDE the rise/lift transforms
      const shellM = /data-shell0="([-\d. ]+)"/.exec(piece);
      if (!shellM) return piece;
      const [sx6, sy6, sw6, sh6] = shellM[1].split(" ").map(Number);
      const cx6 = sx6 + sw6 / 2, py6 = sy6 + sh6 - 1.5;
      const nub = `<path d="M ${(cx6 - 15 * k).toFixed(1)} ${py6.toFixed(1)} L ${cx6.toFixed(1)} ${(py6 + 21 * k).toFixed(1)} L ${(cx6 + 15 * k).toFixed(1)} ${py6.toFixed(1)} Z" fill="${darken(bevel, 0.22)}" stroke="${hexRgba(darken(bevel, 0.55), 0.8)}" stroke-width="1.2"/>`;
      const grown = piece
        .replace(/ height="([\d.]+)"/, (_m, h0) => ` height="${(+h0 + 24 * k).toFixed(0)}"`)
        .replace(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/, (_m, a4, b4, c4, d4) => `viewBox="${a4} ${b4} ${c4} ${(+d4 + 24 * k).toFixed(1)}"`);
      return inject(grown.replace("<svg ", '<svg data-tooltip="1" '), nub);
    }
    case "keycap": {
      /* System chrome · key prompt — a keyboard cap in the kit material.
         Wide labels (SPACE, SHIFT) stretch the cap like a real keyboard. */
      const s7 = 112 * k;
      const lbl7 = (opts.label ?? "E").toUpperCase().slice(0, 6);
      const w7 = s7 + Math.max(0, lbl7.length - 1) * 30 * k;
      return build(cfg, state, { x: 39, y: 30, h: s7, fs: 38 * k, iconSize: 0 }, { label: lbl7, iconDef: null, fixedW: w7, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
    }
    case "padbtn": {
      /* System chrome · gamepad face button — round cap with the console
         color ring (A green · B red · X blue · Y gold). */
      const s8 = 112 * k;
      const letter = (opts.label ?? "A").toUpperCase().slice(0, 1);
      const ringC8 = ({ A: "#22c55e", B: "#ef4444", X: "#3b82f6", Y: "#eab308" } as Record<string, string>)[letter] ?? glow;
      const piece = build(cfg, state, { x: 39, y: 30, h: s8, fs: 42 * k, iconSize: 0 }, { label: letter, iconDef: null, fixedW: s8, shapeOverride: "pill", textOy: opts.textOy, textOx: opts.textOx });
      const shellM8 = /data-shell0="([-\d. ]+)"/.exec(piece);
      if (!shellM8) return piece;
      const [sx8, sy8, sw8, sh8] = shellM8[1].split(" ").map(Number);
      const ring8 = `<circle cx="${(sx8 + sw8 / 2).toFixed(1)}" cy="${(sy8 + sh8 / 2).toFixed(1)}" r="${(Math.min(sw8, sh8) / 2 + 5 * k).toFixed(1)}" fill="none" stroke="${ringC8}" stroke-width="${(4 * k).toFixed(1)}" opacity="${state === "disabled" ? 0.3 : 0.9}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(ringC8, 0.7)})"` : ""}/>`;
      return injectUnder(piece.replace("<svg ", '<svg data-padbtn="1" '), ring8);
    }
    case "listmenu": {
      /* System chrome · context / list menu — four rows in the kit material:
         themed glyphs, labels, quiet shortcut hints, one separator; value
         scrubs the highlighted row. */
      const w = 400 * k, rowH = 64 * k, n9 = 4;
      const h = rowH * n9 + 44 * k;
      /* editing contract: hover/pressed restyle the ACTIVE ROW (fill, ring,
         glyph glow); the frame only dims for disabled. */
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      // floor mapping: value sweeps LINEARLY across the rows, so a pointer
      // riding the stamped vertical track highlights the row under it
      const selN = clamp(Math.floor((value ?? 0.4) * n9), 0, n9 - 1);
      const rows: { ic?: IconDef; lbl: string; hint?: string }[] = [
        { ic: STOCK_ICONS.sword ?? STOCK_ICONS.star, lbl: (opts.slots?.row1 ?? "Equip").slice(0, 18), hint: "E" },
        { ic: STOCK_ICONS.gem ?? STOCK_ICONS.star, lbl: (opts.slots?.row2 ?? "Inspect").slice(0, 18), hint: "I" },
        { ic: STOCK_ICONS.shield ?? STOCK_ICONS.star, lbl: (opts.slots?.row3 ?? "Reinforce").slice(0, 18) },
        { ic: STOCK_ICONS.forward ?? STOCK_ICONS.star, lbl: (opts.slots?.row4 ?? "Drop").slice(0, 18), hint: "⌦" },
      ];
      const x0 = 42 + inset + 6 * k, rw = w - inset * 2 - 12 * k;
      let inner9 = "";
      rows.forEach((r9, i) => {
        const ry = 33 + inset + 8 * k + i * rowH;
        const on9 = i === selN && state !== "disabled";
        if (on9) {
          const hotR = state === "hover", pressR = state === "pressed";
          inner9 += `<rect x="${x0.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${(rowH - 6 * k).toFixed(1)}" rx="${(10 * k).toFixed(1)}" fill="${hexRgba(glow, pressR ? 0.4 : hotR ? 0.32 : 0.22)}" stroke="${hexRgba(glow, hotR || pressR ? 0.95 : 0.65)}" stroke-width="${hotR ? 2.2 : 1.4}"${hotR ? ` style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(glow, 0.55)})"` : ""}/>`;
        }
        // small-white rule: a dark understroke beneath every row glyph
        if (r9.ic) inner9 += iconGroup(r9.ic, x0 + 16 * k, ry + (rowH - 6 * k) / 2 - 15 * k, 30 * k, "rgba(8,12,22,0.55)", { strokeWidth: 2.2 * iconWK + 2.2 }) +
          themedIcon(r9.ic, x0 + 16 * k, ry + (rowH - 6 * k) / 2 - 15 * k, 30 * k, on9 ? glow : "#E8ECF2", 2.2);
        inner9 += contentText(r9.lbl, x0 + 62 * k, ry + (rowH - 6 * k) / 2 + 1, 25 * k * typeK, { keepCase: true, list: true, opacity: on9 ? 1 : 0.85 });
        if (r9.hint) inner9 += infoText(r9.hint, x0 + rw - 16 * k, ry + (rowH - 6 * k) / 2 + 1, 19 * k, "end", 700);
        if (i === rows.length - 2) inner9 += `<rect x="${(x0 + 10 * k).toFixed(1)}" y="${(ry + rowH - 4 * k).toFixed(1)}" width="${(rw - 20 * k).toFixed(1)}" height="1.4" fill="rgba(255,255,255,0.16)"/>`;
      });
      return inject(shell.replace("<svg ", `<svg data-listmenu="1" data-vtrack="${(33 + inset + 8 * k).toFixed(1)} ${(rowH * n9).toFixed(1)}" `), inner9);
    }
    case "scrollbar": {
      /* System chrome · scrollbar — vertical strip shell, sunken track,
         candy thumb. value scrubs the thumb. */
      const w = 66 * k, h = 380 * k;
      /* editing contract: hover/pressed restyle the THUMB; the rail only
         dims for disabled. */
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 90 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 5 * k;
      const tx0 = 39 + w / 2;
      const trackW = Math.max(10 * k, w - inset * 2 - 18 * k);
      const ty0 = 30 + inset + 26 * k, th0 = h - inset * 2 - 52 * k;
      const v9 = clamp(value ?? 0.3, 0, 1);
      const thumbH = th0 * 0.32;
      const thumbY = ty0 + (th0 - thumbH) * v9;
      const gid9 = "sb" + UID++;
      const arrows = `<path d="M ${(tx0 - 8 * k).toFixed(1)} ${(30 + inset + 16 * k).toFixed(1)} L ${tx0.toFixed(1)} ${(30 + inset + 5 * k).toFixed(1)} L ${(tx0 + 8 * k).toFixed(1)} ${(30 + inset + 16 * k).toFixed(1)} Z" fill="rgba(255,255,255,0.5)"/>
        <path d="M ${(tx0 - 8 * k).toFixed(1)} ${(30 + h - inset - 16 * k).toFixed(1)} L ${tx0.toFixed(1)} ${(30 + h - inset - 5 * k).toFixed(1)} L ${(tx0 + 8 * k).toFixed(1)} ${(30 + h - inset - 16 * k).toFixed(1)} Z" fill="rgba(255,255,255,0.5)"/>`;
      const parts9 = `<rect x="${(tx0 - trackW / 2).toFixed(1)}" y="${ty0.toFixed(1)}" width="${trackW.toFixed(1)}" height="${th0.toFixed(1)}" rx="${(trackW / 2).toFixed(1)}" fill="${wellFill}" opacity="0.92"/>
        <defs><linearGradient id="${gid9}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lighten(knobC, 0.5)}"/><stop offset="0.5" stop-color="${lighten(knobC, 0.75)}"/><stop offset="1" stop-color="${lighten(knobC, 0.2)}"/></linearGradient></defs>
        <rect x="${(tx0 - trackW / 2 + 1.5).toFixed(1)}" y="${thumbY.toFixed(1)}" width="${(trackW - 3).toFixed(1)}" height="${thumbH.toFixed(1)}" rx="${((trackW - 3) / 2).toFixed(1)}" fill="url(#${gid9})" stroke="${darken(knobC, state === "pressed" ? 0.5 : 0.35)}" stroke-width="1.2"${state === "hover" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>
        <rect x="${(tx0 - trackW * 0.16).toFixed(1)}" y="${(thumbY + 6 * k).toFixed(1)}" width="${(trackW * 0.2).toFixed(1)}" height="${(thumbH - 12 * k).toFixed(1)}" rx="${(trackW * 0.1).toFixed(1)}" fill="#FFFFFF" opacity="0.5"/>` + arrows;
      // the stamped vertical run covers the thumb's travel — play mode drags
      // the thumb along it, exact at any display scale
      return inject(shell.replace("<svg ", `<svg data-scrollbar="1" data-vtrack="${(ty0 + thumbH / 2).toFixed(1)} ${(th0 - thumbH).toFixed(1)}" `), parts9);
    }
    case "pagedots": {
      /* System chrome · pagination dots — carousel position. The active dot
         is a candy knob; value scrubs it. */
      const n0 = 5, dR = 11 * k, gap0 = 30 * k, pad0 = 24;
      const selD = clamp(Math.round((value ?? 0.25) * (n0 - 1)), 0, n0 - 1);
      const W0 = n0 * dR * 2 + (n0 - 1) * (gap0 - dR * 2) + pad0 * 2 + dR * 2;
      const H0 = dR * 4 + pad0;
      let dots = "";
      for (let i = 0; i < n0; i++) {
        const cx0 = pad0 + dR * 2 + i * gap0;
        if (i === selD) dots += candyKnob(cx0, H0 / 2, dR * 1.5, knobC) + (state !== "disabled" ? `<circle cx="${cx0.toFixed(1)}" cy="${(H0 / 2).toFixed(1)}" r="${(dR * 1.9).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.5)}" stroke-width="2" style="filter: drop-shadow(0 0 4px ${hexRgba(glow, 0.6)})"/>` : "");
        else dots += `<circle cx="${cx0.toFixed(1)}" cy="${(H0 / 2).toFixed(1)}" r="${dR.toFixed(1)}" fill="${wellFill}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W0.toFixed(0)}" height="${H0.toFixed(0)}" viewBox="0 0 ${W0.toFixed(0)} ${H0.toFixed(0)}" role="img" aria-label="page ${selD + 1} of ${n0}">${dots}</svg>`;
    }
    case "steps": {
      /* System chrome · step indicator — wizard pips: done (filled, check),
         current (glow ring, number), upcoming (well). value = progress. */
      const nS = 4, sR = 24 * k, railG = 66 * k, padS = 30;
      const vS = clamp(value ?? 0.42, 0, 1);
      const cur = clamp(Math.floor(vS * nS), 0, nS - 1);
      const WS = nS * sR * 2 + (nS - 1) * railG + padS * 2;
      const HS = sR * 2 + padS * 2;
      const cyS = HS / 2;
      let inner0 = "";
      for (let i = 0; i < nS - 1; i++) {
        const xA = padS + sR + i * (sR * 2 + railG) + sR;
        inner0 += `<rect x="${xA.toFixed(1)}" y="${(cyS - 3 * k).toFixed(1)}" width="${railG.toFixed(1)}" height="${(6 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${i < cur ? glow : wellFill}"${i < cur && state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.5)})"` : ""}/>`;
      }
      for (let i = 0; i < nS; i++) {
        const cxS = padS + sR + i * (sR * 2 + railG);
        if (i < cur) {
          inner0 += `<circle cx="${cxS.toFixed(1)}" cy="${cyS.toFixed(1)}" r="${sR.toFixed(1)}" fill="${hexMix(bevel, glow, 0.4)}" stroke="${darken(bevel, 0.35)}" stroke-width="1.5"/>`;
          if (STOCK_ICONS.check) inner0 += iconGroup(STOCK_ICONS.check, cxS - sR * 0.55, cyS - sR * 0.55, sR * 1.1, "#FFFFFF", { strokeWidth: 3 * iconWK });
        } else if (i === cur) {
          const hotS = state === "hover" || state === "pressed";
          inner0 += candyKnob(cxS, cyS, sR * (hotS ? 1.08 : 1), knobC) + (state !== "disabled" ? `<circle cx="${cxS.toFixed(1)}" cy="${cyS.toFixed(1)}" r="${(sR * (hotS ? 1.38 : 1.28)).toFixed(1)}" fill="none" stroke="${hexRgba(glow, hotS ? 0.9 : 0.6)}" stroke-width="${hotS ? 3 : 2.4}" style="filter: drop-shadow(0 0 ${hotS ? 8 : 5}px ${hexRgba(glow, 0.65)})"/>` : "");
          inner0 += contentText(String(i + 1), cxS, cyS + 1, sR * 0.95, { anchor: "middle", keepCase: true, autoInk: darken(bevel, 0.55) });
        } else {
          inner0 += `<circle cx="${cxS.toFixed(1)}" cy="${cyS.toFixed(1)}" r="${sR.toFixed(1)}" fill="${wellFill}" stroke="rgba(255,255,255,0.22)" stroke-width="1.2"/>` +
            contentText(String(i + 1), cxS, cyS + 1, sR * 0.9, { anchor: "middle", keepCase: true, autoInk: "rgba(255,255,255,0.45)", opacity: 0.8 });
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WS.toFixed(0)}" height="${HS.toFixed(0)}" viewBox="0 0 ${WS.toFixed(0)} ${HS.toFixed(0)}" role="img" aria-label="step ${cur + 1} of ${nS}"><g opacity="${state === "disabled" ? 0.45 : 1}">${inner0}</g></svg>`;
    }
    case "spinner": {
      /* System chrome · loading spinner — the ring's material with a live
         rotating sweep; honors reduced state by standing still on disabled. */
      const dSp = ({ s: 74, m: 96, l: 128 } as Record<KitSize, number>)[size] * k;
      const strokeSp = Math.max(7, dSp * 0.12);
      const padSp = 20;
      const cSp = dSp / 2 + padSp;
      const rSp = dSp / 2 - strokeSp / 2;
      const circSp = 2 * Math.PI * rSp;
      const gidS = "sp" + UID++;
      /* game character: the comet stretches as it accelerates and contracts
         as it lands — dash length breathes on a spring curve while the
         rotation runs constant. */
      /* rotation and breathe share one period with symmetric easing — unequal
         durations made the two loops beat against each other, reading as a
         periodic stall. One period, sine-like splines: continuous motion. */
      const spin = state !== "disabled"
        ? `<animateTransform attributeName="transform" type="rotate" from="0 ${cSp} ${cSp}" to="360 ${cSp} ${cSp}" dur="1.2s" repeatCount="indefinite"/>`
        : "";
      const breathe = state !== "disabled"
        ? `<animate attributeName="stroke-dasharray" values="${(circSp * 0.1).toFixed(1)} ${circSp.toFixed(1)}; ${(circSp * 0.44).toFixed(1)} ${circSp.toFixed(1)}; ${(circSp * 0.1).toFixed(1)} ${circSp.toFixed(1)}" keyTimes="0;0.5;1" dur="1.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/>`
        : "";
      const total = dSp + padSp * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}" role="img" aria-label="loading">
<defs><linearGradient id="${gidS}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>
<circle cx="${cSp}" cy="${cSp}" r="${rSp}" fill="none" stroke="${wellFill}" stroke-width="${strokeSp}"/>
<g>${spin}<circle cx="${cSp}" cy="${cSp}" r="${rSp}" fill="none" stroke="url(#${gidS})" stroke-width="${strokeSp}" stroke-linecap="round" stroke-dasharray="${(circSp * 0.28).toFixed(1)} ${circSp.toFixed(1)}" transform="rotate(-90 ${cSp} ${cSp})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(strokeSp * 0.5).toFixed(1)}px ${hexRgba(glow, 0.6)})"` : ""}>${breathe}</circle></g>
</svg>`;
    }
    case "loadbar": {
      /* System chrome · loading bar — label, live fill and the tip slot,
         one strip. value drives the fill. */
      const w = 760 * k, h = 118 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 130 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const vL0 = clamp(value ?? 0.62, 0, 1);
      const gidL = "lb" + UID++;
      const labY = 30 + inset + 16 * k;
      const barY = 30 + h - inset - 40 * k, barH = 30 * k;
      const barX = 39 + inset + 10 * k, barW = w - inset * 2 - 20 * k;
      /* mercury contract: vertical gild (bright crest, saturated body,
         grounded base) + its own outline, so the fill reads against ANY
         face treatment. No tip dot — that affordance belongs to sliders.
         Tips/hints live outside the component. */
      const parts = contentText(opts.label ?? "LOADING", barX + 2, labY, 23 * k * typeK) +
        infoText(`${Math.round(vL0 * 100)}%`, barX + barW - 2, labY, 20 * k, "end") +
        `<rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="${(barH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidL}" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="${lighten(glow, 0.55)}"/>
           <stop offset="0.45" stop-color="${glow}"/>
           <stop offset="1" stop-color="${darken(glow, 0.28)}"/>
         </linearGradient>
         <pattern id="${gidL}p" width="${(16 * k).toFixed(1)}" height="${(16 * k).toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><rect width="${(6 * k).toFixed(1)}" height="${(16 * k).toFixed(1)}" fill="#FFFFFF" opacity="0.14"/></pattern></defs>` +
        (vL0 > 0.02 ? (() => {
          // negative-space canon: the mercury floats in the container pill
          const gL = 3.5 * k, mHL = barH - gL * 2, mWL = Math.max(0, (barW - gL * 2) * vL0);
          return `<rect x="${(barX + gL).toFixed(1)}" y="${(barY + gL).toFixed(1)}" width="${mWL.toFixed(1)}" height="${mHL.toFixed(1)}" rx="${(mHL / 2).toFixed(1)}" fill="url(#${gidL})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>
          <rect x="${(barX + gL).toFixed(1)}" y="${(barY + gL).toFixed(1)}" width="${mWL.toFixed(1)}" height="${mHL.toFixed(1)}" rx="${(mHL / 2).toFixed(1)}" fill="url(#${gidL}p)"/>
          <rect x="${(barX + gL + 5 * k).toFixed(1)}" y="${(barY + gL + 3 * k).toFixed(1)}" width="${Math.max(0, mWL - 10 * k).toFixed(1)}" height="${(mHL * 0.3).toFixed(1)}" rx="${(mHL * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.5"/>`;
        })() : "");
      return inject(shell.replace("<svg ", '<svg data-loadbar="1" '), parts);
    }
    case "setrow": {
      /* System chrome · settings row — label left, live mini-slider right.
         EDITING CONTRACT: value drives the knob (draggable in play mode);
         the row itself has no hover state — the slider is the interaction. */
      const w = 640 * k, h = 100 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 110 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const vS0 = clamp(value ?? 0.7, 0, 1);
      const trX = 39 + w - inset - 250 * k, trW = 180 * k, trH = 14 * k;
      const gidR = "sr" + UID++;
      const gR = 2.5 * k, mHR = trH - gR * 2, mWR = Math.max(0, (trW - gR * 2) * vS0);
      const parts = contentText(opts.label ?? "MUSIC VOLUME", 39 + inset + 18 * k, cy + 1, 24 * k * typeK) +
        `<rect x="${trX.toFixed(1)}" y="${(cy - trH / 2).toFixed(1)}" width="${trW.toFixed(1)}" height="${trH.toFixed(1)}" rx="${(trH / 2).toFixed(1)}" fill="${wellFill}"/>` +
        `<defs><linearGradient id="${gidR}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.5)}"/><stop offset="0.5" stop-color="${glow}"/><stop offset="1" stop-color="${darken(glow, 0.25)}"/></linearGradient></defs>` +
        (mWR > 1 ? `<rect x="${(trX + gR).toFixed(1)}" y="${(cy - mHR / 2).toFixed(1)}" width="${mWR.toFixed(1)}" height="${mHR.toFixed(1)}" rx="${(mHR / 2).toFixed(1)}" fill="url(#${gidR})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.6)})"` : ""}/>` : "") +
        candyKnob(trX + trW * vS0, cy, 15 * k, knobC) +
        infoText(String(Math.round(vS0 * 100)), 39 + w - inset - 18 * k, cy + 1, 20 * k, "end");
      return stampTrack(inject(shell.replace("<svg ", '<svg data-setrow="1" '), parts), trX, trW);
    }
    case "searchfield": {
      /* System chrome · search field — input well with the themed magnifier
         and a quiet clear affordance. */
      const w = 560 * k, h = 112 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const cy = 30 + h / 2;
      const q = opts.label;
      const txt = q
        ? contentText(q, 39 + inset + 72 * k, cy + 1, 28 * k * typeK, { keepCase: true })
        : `<text x="${(39 + inset + 72 * k).toFixed(1)}" y="${cy.toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(27 * k).toFixed(1)}" font-style="italic" font-weight="500" fill="rgba(255,255,255,0.5)" dominant-baseline="central">${esc("Search inventory…")}</text>`;
      const parts = `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="0.9"/>` +
        (STOCK_ICONS.search ? themedIcon(STOCK_ICONS.search, 39 + inset + 22 * k, cy - 17 * k, 34 * k, glow, 2.4) : "") +
        txt +
        (q ? infoText("×", 39 + w - inset - 26 * k, cy, 26 * k, "middle", 700) : "");
      return inject(shell.replace("<svg ", '<svg data-searchfield="1" '), parts);
    }
    case "notifydot": {
      /* System chrome · notification badge — an icon button wearing the
         corner counter. value drives the count. */
      const s = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ic = opts.icon ?? STOCK_ICONS.scroll ?? STOCK_ICONS.info;
      // dead center of the face: the data-shell box IS the shell silhouette
      // (extrusion draws below it), so the glyph centers on the box center;
      // the badge overlapping the glyph's corner is the intended read
      const glyph = ic ? themedIcon(ic, sx + sw / 2 - 38 * k, sy + sh / 2 - 38 * k, 76 * k, hexMix(glow, "#FFFFFF", 0.25), 2.2) : "";
      const count = Math.max(1, Math.min(9, Math.round((value ?? 0.3) * 9)));
      const bcx = sx + sw - 10 * k, bcy = sy + 10 * k, br = 26 * k;
      const badgeC = hexMix("#FF3B4A", glow, 0.12);
      const badge = `<g data-badge="1"><circle cx="${bcx.toFixed(1)}" cy="${bcy.toFixed(1)}" r="${br.toFixed(1)}" fill="${badgeC}" stroke="rgba(255,255,255,0.9)" stroke-width="${(3 * k).toFixed(1)}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(badgeC, 0.7)})"` : ""}/>
        <text x="${bcx.toFixed(1)}" y="${(bcy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(30 * k).toFixed(1)}" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${count}</text></g>`;
      return inject(shell.replace("<svg ", '<svg data-notifydot="1" '), glyph + badge);
    }
    case "avatarframe": {
      /* System chrome · avatar frame — portrait ring with the level chip.
         value drives the level. */
      const s = 176 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: "pill" });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      /* the data-shell box is the SHELL silhouette exactly (extrusion draws
         below it) — the face circle's center IS the box center. The portrait
         fills the face to a hair's margin, so the visible ring is only the
         shell band and reads even all the way around (the old wide face
         margin showed gloss at the top and read as misalignment). */
      const ccx = sx + sw / 2, ccy = sy + sh / 2;
      const pr = Math.min(sw, sh) / 2 - bw - 2.5 * k;
      const gidA = "av" + UID++;
      const lvl = Math.max(1, Math.min(99, Math.round((value ?? 0.12) * 99)));
      const parts = `<defs><clipPath id="${gidA}"><circle cx="${ccx.toFixed(1)}" cy="${ccy.toFixed(1)}" r="${pr.toFixed(1)}"/></clipPath></defs>
        <circle cx="${ccx.toFixed(1)}" cy="${ccy.toFixed(1)}" r="${pr.toFixed(1)}" fill="${wellFill}"/>
        <g clip-path="url(#${gidA})" opacity="${state === "disabled" ? 0.4 : 1}">
          <circle cx="${ccx.toFixed(1)}" cy="${(ccy - pr * 0.28).toFixed(1)}" r="${(pr * 0.34).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
          <ellipse cx="${ccx.toFixed(1)}" cy="${(ccy + pr * 0.75).toFixed(1)}" rx="${(pr * 0.62).toFixed(1)}" ry="${(pr * 0.5).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
        </g>
        ${candyKnob(ccx, sy + sh - 8 * k, 21 * k, knobC)}
        <text x="${ccx.toFixed(1)}" y="${(sy + sh - 7 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(20 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">${lvl}</text>`;
      return inject(shell.replace("<svg ", '<svg data-avatarframe="1" '), parts);
    }
    case "nameplate": {
      /* System chrome · nameplate — player name with a title ribbon. */
      const w = 560 * k, h = 100 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 110 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const nm = opts.label ?? "NOVA_KNIGHT";
      const star = STOCK_ICONS.star ? themedIcon(STOCK_ICONS.star, 39 + inset + 16 * k, cy - 16 * k, 32 * k, "#facc15", 2.4) : "";
      const ribW = 168 * k, ribH = 40 * k;
      const ribX = 39 + w - inset - ribW - 12 * k;
      const gidN = "np" + UID++;
      const ribbon = `<defs><linearGradient id="${gidN}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(bevel, 0.25)}"/><stop offset="1" stop-color="${darken(bevel, 0.15)}"/></linearGradient></defs>
        <rect x="${ribX.toFixed(1)}" y="${(cy - ribH / 2).toFixed(1)}" width="${ribW.toFixed(1)}" height="${ribH.toFixed(1)}" rx="${(ribH / 2).toFixed(1)}" fill="url(#${gidN})" stroke="${hexRgba(darken(bevel, 0.5), 0.6)}" stroke-width="1.2"/>
        <text x="${(ribX + ribW / 2).toFixed(1)}" y="${(cy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(17 * k).toFixed(1)}" font-weight="800" letter-spacing="0.08em" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${esc((opts.slots?.ribbon ?? "PIT CHAMPION").slice(0, 24))}</text>`;
      return inject(shell.replace("<svg ", '<svg data-nameplate="1" '),
        star + contentText(nm, 39 + inset + 58 * k, cy + 1, 24 * k * typeK, { keepCase: true }) + ribbon);
    }
    case "currency": {
      /* System chrome · currency pill — candy coin + amount. value drives
         the amount. */
      const w = 260 * k, h = 84 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 96 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const cy = 30 + h / 2;
      const coinR = (h - inset * 2) * 0.34;
      const coinX = 39 + inset + coinR + 10 * k;
      const amt = opts.label ?? Math.round(clamp(value ?? 0.125, 0, 1) * 9999).toLocaleString("en-US");
      const gidC = "cu" + UID++;
      const coin = `<defs><radialGradient id="${gidC}" cx="0.35" cy="0.3" r="0.95"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.55" stop-color="#FACC15"/><stop offset="1" stop-color="#B45309"/></radialGradient></defs>
        <circle cx="${coinX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${coinR.toFixed(1)}" fill="url(#${gidC})" stroke="#92400E" stroke-width="1.6"/>
        <circle cx="${coinX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(coinR * 0.66).toFixed(1)}" fill="none" stroke="#92400E" stroke-width="1.1" opacity="0.6"/>
        ${STOCK_ICONS.star ? iconGroup(STOCK_ICONS.star, coinX - coinR * 0.45, cy - coinR * 0.45, coinR * 0.9, "#92400E", { strokeWidth: 2.4 * iconWK }) : ""}
        <ellipse cx="${(coinX - coinR * 0.3).toFixed(1)}" cy="${(cy - coinR * 0.42).toFixed(1)}" rx="${(coinR * 0.34).toFixed(1)}" ry="${(coinR * 0.18).toFixed(1)}" fill="#FFFFFF" opacity="0.65"/>`;
      return inject(shell.replace("<svg ", '<svg data-currency="1" '),
        coin + contentText(amt, coinX + coinR + 14 * k, cy + 1, 28 * k * typeK, { keepCase: true }));
    }
    case "buffframe": {
      /* System chrome · buff/debuff frame — timed effect icon with the
         cooldown sweep eating clockwise. value = time REMAINING. */
      const s = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      // clip the sweep to the shell's REAL face path (the fc clip every
      // build render carries) — it hugs whatever silhouette is active
      const fcM = /url\(#([A-Za-z0-9_-]+)fc\)/.exec(shell);
      const fcRef = fcM ? `${fcM[1]}fc` : null;
      // the shell box excludes the extrusion — plain center IS face center
      const ccx = sx + sw / 2, ccy = sy + sh / 2;
      const ic = opts.icon ?? STOCK_ICONS.flask ?? STOCK_ICONS.zap;
      const glyph = ic ? themedIcon(ic, ccx - 30 * k, ccy - 34 * k, 60 * k, hexMix(glow, "#FFFFFF", 0.25), 2.2) : "";
      const vB = clamp(value ?? 0.65, 0, 1);
      // spent-time sector: from "now" (top) sweeping the ELAPSED share
      const spent = 1 - vB;
      const R = Math.max(sw, sh);
      const secs = (8 * vB).toFixed(1);
      let sweep = "";
      if (spent > 0.01 && state !== "disabled" && fcRef) {
        const a1 = -Math.PI / 2, a2 = a1 + spent * Math.PI * 2;
        const large = spent > 0.5 ? 1 : 0;
        sweep = `<g clip-path="url(#${fcRef})">
          <path d="M ${ccx.toFixed(1)} ${ccy.toFixed(1)} L ${(ccx + R * Math.cos(a1)).toFixed(1)} ${(ccy + R * Math.sin(a1)).toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${large} 1 ${(ccx + R * Math.cos(a2)).toFixed(1)} ${(ccy + R * Math.sin(a2)).toFixed(1)} Z" fill="rgba(6,10,18,0.62)"/>
          <line x1="${ccx.toFixed(1)}" y1="${ccy.toFixed(1)}" x2="${(ccx + R * Math.cos(a2)).toFixed(1)}" y2="${(ccy + R * Math.sin(a2)).toFixed(1)}" stroke="${glow}" stroke-width="${(2.4 * k).toFixed(1)}" style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.7)})"/>
        </g>`;
      }
      const timer = `<text x="${ccx.toFixed(1)}" y="${(sy + sh - 14 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(21 * k).toFixed(1)}" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: rgba(0,0,0,0.55); stroke-width: 3px">${secs}s</text>`;
      return inject(shell.replace("<svg ", '<svg data-buffframe="1" '), glyph + sweep + timer);
    }
    case "cooldown": {
      /* System chrome · cooldown radial — a candy instrument, not a pie:
         band-gradient ring, tick crown (lit ticks = time left), glass core
         with rising inner light, dark spent sector, comet sweep edge with a
         hot tip, themed seconds. value = time remaining. */
      const dC = ({ s: 104, m: 136, l: 172 } as Record<KitSize, number>)[size] * k;
      const padC = 26;
      const cC = dC / 2 + padC, rC = dC / 2;
      const ringW = Math.max(8, dC * 0.11);
      const coreR = rC - ringW - 3;
      const vC = clamp(value ?? 0.4, 0, 1);
      const spent = 1 - vC;
      const secs = (6 * vC).toFixed(1);
      const gidD = "cd" + UID++;
      const a1 = -Math.PI / 2, a2 = a1 + spent * Math.PI * 2;
      const large = spent > 0.5 ? 1 : 0;
      const dim = state === "disabled" ? 0.45 : 1;
      // tick crown: 12 marks between core and ring; still-cooling span dim,
      // recovered span lit
      let ticks = "";
      for (let i = 0; i < 12; i++) {
        const ta = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const lit = i / 12 >= spent;
        const r1 = coreR - dC * 0.02, r2 = coreR - dC * 0.09;
        ticks += `<line x1="${(cC + r1 * Math.cos(ta)).toFixed(1)}" y1="${(cC + r1 * Math.sin(ta)).toFixed(1)}" x2="${(cC + r2 * Math.cos(ta)).toFixed(1)}" y2="${(cC + r2 * Math.sin(ta)).toFixed(1)}" stroke="${lit ? glow : "rgba(255,255,255,0.16)"}" stroke-width="${(dC * 0.018).toFixed(1)}" stroke-linecap="round"${lit && state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px ${hexRgba(glow, 0.7)})"` : ""}/>`;
      }
      const sector = spent > 0.01
        ? `<path d="M ${cC} ${cC} L ${(cC + coreR * Math.cos(a1)).toFixed(1)} ${(cC + coreR * Math.sin(a1)).toFixed(1)} A ${coreR.toFixed(1)} ${coreR.toFixed(1)} 0 ${large} 1 ${(cC + coreR * Math.cos(a2)).toFixed(1)} ${(cC + coreR * Math.sin(a2)).toFixed(1)} Z" fill="rgba(4,7,14,0.68)"/>
           <line x1="${cC}" y1="${cC}" x2="${(cC + coreR * Math.cos(a2)).toFixed(1)}" y2="${(cC + coreR * Math.sin(a2)).toFixed(1)}" stroke="url(#${gidD}sw)" stroke-width="${(dC * 0.028).toFixed(1)}" stroke-linecap="round"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.6)})"` : ""}/>`
        : "";
      const total = dC + padC * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}" role="img" aria-label="cooldown ${secs}s">
<defs>
  <linearGradient id="${gidD}r" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${lighten(hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.35), 0.45)}"/>
    <stop offset="0.5" stop-color="${hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.25)}"/>
    <stop offset="1" stop-color="${darken(bevel, 0.32)}"/>
  </linearGradient>
  <radialGradient id="${gidD}core" cx="0.5" cy="0.42" r="0.85">
    <stop offset="0" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.55)}"/>
    <stop offset="0.72" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.78)}"/>
    <stop offset="1" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.86)}"/>
  </radialGradient>
  <radialGradient id="${gidD}rise" cx="0.5" cy="1" r="0.9">
    <stop offset="0" stop-color="${glow}" stop-opacity="0.4"/>
    <stop offset="0.6" stop-color="${glow}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${gidD}sw" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${hexRgba(glow, 0)}"/>
    <stop offset="1" stop-color="${lighten(glow, 0.4)}"/>
  </linearGradient>
</defs>
<g opacity="${dim}">
  <circle cx="${cC}" cy="${cC}" r="${rC}" fill="none" stroke="url(#${gidD}r)" stroke-width="${ringW}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(ringW * 0.5).toFixed(1)}px ${hexRgba(glow, 0.4)})"` : ""}/>
  <path d="M ${(cC - rC * 0.72).toFixed(1)} ${(cC - rC * 0.6).toFixed(1)} A ${rC} ${rC} 0 0 1 ${(cC + rC * 0.72).toFixed(1)} ${(cC - rC * 0.6).toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-width="${(ringW * 0.4).toFixed(1)}" stroke-linecap="round" opacity="${(0.14 + (cfg.candy.gloss?.opacity ?? 40) / 100 * 0.3).toFixed(2)}"/>
  <circle cx="${cC}" cy="${cC}" r="${(rC - ringW / 2 - 0.6).toFixed(1)}" fill="none" stroke="${darken(bevel, 0.5)}" stroke-width="1.1" opacity="0.8"/>
  <circle cx="${cC}" cy="${cC}" r="${(rC + ringW / 2 - 0.6).toFixed(1)}" fill="none" stroke="${lighten(bevel, 0.55)}" stroke-width="1" opacity="0.6"/>
  <circle cx="${cC}" cy="${cC}" r="${coreR.toFixed(1)}" fill="url(#${gidD}core)"/>
  <circle cx="${cC}" cy="${cC}" r="${coreR.toFixed(1)}" fill="url(#${gidD}rise)"/>
  ${ticks}
  ${sector}
  <ellipse cx="${cC}" cy="${(cC - coreR * 0.55).toFixed(1)}" rx="${(coreR * 0.62).toFixed(1)}" ry="${(coreR * 0.22).toFixed(1)}" fill="#FFFFFF" opacity="0.1"/>
  ${opts.themedText
    ? contentText(`${secs}s`, cC, cC + 1, dC * 0.22, { anchor: "middle", keepCase: true, autoInk: "#FFFFFF" })
    : /* readout contract: AUTO ink, no shadow — an instrument dial, not a
         display face. Editing Typography (or the per-piece text color)
         while focused re-themes it via opts.themedText. */
      `<text x="${cC}" y="${cC + 1}" font-family="'${font}', Inter, sans-serif" font-size="${(dC * 0.22).toFixed(1)}" font-weight="${Math.max(700, cfg.type.weight)}" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${secs}s</text>`}
</g>
</svg>`;
    }
    case "stepper": {
      /* System chrome · stepper — minus cap, snapped cells, plus cap.
         value fills the cells. */
      const w = 430 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 104 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 5 * k;
      const cy = 30 + h / 2;
      const capR = 24 * k;
      const nC = 8;
      const vSt = clamp(value ?? 0.62, 0, 1);
      const filled = Math.min(nC, Math.round(vSt * nC) + (state === "pressed" ? 1 : 0));
      const cellsX = 39 + inset + capR * 2 + 24 * k;
      const cellsW = w - inset * 2 - (capR * 2 + 24 * k) * 2;
      const cellW = (cellsW - (nC - 1) * 6 * k) / nC;
      /* editing contract: hover glows the + cap, pressed fills one more
         cell — the strip itself only dims for disabled. */
      const minusX = 39 + inset + capR + 4 * k, plusX = 39 + w - inset - capR - 4 * k;
      const glyphY = cy - 2.5 * k; // optical center: +/− ride high in their circles
      const hotP = state === "hover" && true;
      let inner = candyKnob(minusX, cy, capR, knobC) +
        `<text x="${minusX.toFixed(1)}" y="${glyphY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(32 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">−</text>` +
        (hotP ? `<circle cx="${plusX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(capR * 1.22).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.85)}" stroke-width="2.6" style="filter: drop-shadow(0 0 6px ${hexRgba(glow, 0.6)})"/>` : "") +
        candyKnob(plusX, cy, capR, knobC) +
        `<text x="${plusX.toFixed(1)}" y="${glyphY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(32 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">+</text>`;
      const gidT = "st" + UID++;
      /* negative-space canon: the cell strip sits in ONE sunken container
         well; every cell (filled and empty alike) floats inset within it */
      inner += `<rect x="${(cellsX - 6 * k).toFixed(1)}" y="${(cy - 21 * k).toFixed(1)}" width="${(cellsW + 12 * k).toFixed(1)}" height="${(42 * k).toFixed(1)}" rx="${(10 * k).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidT}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.2)}"/><stop offset="1" stop-color="${bevel}"/></linearGradient></defs>`;
      for (let i = 0; i < nC; i++) {
        const cx0 = cellsX + i * (cellW + 6 * k);
        const on = i < filled;
        inner += `<rect x="${cx0.toFixed(1)}" y="${(cy - 13 * k).toFixed(1)}" width="${cellW.toFixed(1)}" height="${(26 * k).toFixed(1)}" rx="${(5 * k).toFixed(1)}" fill="${on ? `url(#${gidT})` : "rgba(255,255,255,0.1)"}"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(3 * k).toFixed(1)}px ${hexRgba(glow, 0.5)})"` : ""} stroke="${on ? darken(bevel, 0.3) : "rgba(255,255,255,0.12)"}" stroke-width="1"/>`;
      }
      return inject(shell.replace("<svg ", '<svg data-stepper="1" '), inner);
    }
    case "healthglobe": {
      /* RPG · health globe — the Diablo lineage: a glass sphere with the
         liquid inside. The liquid follows the Glow role (same contract as
         the loading-bar mercury); value = fill. */
      const dG = ({ s: 116, m: 148, l: 188 } as Record<KitSize, number>)[size] * k;
      const padG = 30;
      const cG = dG / 2 + padG, rG = dG / 2;
      const rimW = Math.max(7, dG * 0.075);
      const inR = rG - rimW - 2;
      const vG = clamp(value ?? 0.72, 0, 1);
      const gidG = "hg" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const surfY = cG + inR - vG * inR * 2;
      const waveAmp = inR * 0.05;
      /* the liquid is ALIVE: the meniscus rocks between two wave phases and
         bubbles rise to the surface on their own clocks (SMIL — same policy
         as the spinner; disabled stands still) */
      const waveD = (phase: number) => `M ${(cG - inR).toFixed(1)} ${surfY.toFixed(1)} Q ${(cG - inR / 2).toFixed(1)} ${(surfY - waveAmp * 2 * phase).toFixed(1)} ${cG.toFixed(1)} ${surfY.toFixed(1)} T ${(cG + inR).toFixed(1)} ${surfY.toFixed(1)} L ${(cG + inR).toFixed(1)} ${(cG + inR).toFixed(1)} L ${(cG - inR).toFixed(1)} ${(cG + inR).toFixed(1)} Z`;
      const wave = waveD(1);
      const waveAnim = state !== "disabled"
        ? `<animate attributeName="d" values="${waveD(1)};${waveD(-1)};${waveD(1)}" dur="3.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/>`
        : "";
      const floorY = cG + inR;
      const bub = (bx9: number, r9: number, op9: number, dur9: string, delay9: string) => vG > 0.15
        ? `<circle cx="${bx9.toFixed(1)}" cy="${floorY.toFixed(1)}" r="${r9.toFixed(1)}" fill="${lighten(glow, 0.55)}" opacity="0">${state !== "disabled"
            ? `<animate attributeName="cy" values="${(floorY - 4).toFixed(1)};${(surfY + 5).toFixed(1)}" dur="${dur9}" begin="${delay9}" repeatCount="indefinite"/>
               <animate attributeName="opacity" values="0;${op9};${op9};0" keyTimes="0;0.15;0.8;1" dur="${dur9}" begin="${delay9}" repeatCount="indefinite"/>`
            : ""}</circle>`
        : "";
      const bubbles = bub(cG - inR * 0.28, inR * 0.05, 0.55, "2.8s", "0s") +
        bub(cG + inR * 0.18, inR * 0.038, 0.45, "3.4s", "1.1s") +
        bub(cG - inR * 0.05, inR * 0.03, 0.6, "2.3s", "0.6s");
      /* the potion SWIRLS: two soft tinted currents orbit the globe center
         in opposite directions, clipped to the liquid body */
      const swirl = state !== "disabled" && vG > 0.12
        ? `<g clip-path="url(#${gidG}q)">
            <g opacity="0.24"><animateTransform attributeName="transform" type="rotate" from="0 ${cG} ${cG}" to="360 ${cG} ${cG}" dur="7s" repeatCount="indefinite"/><ellipse cx="${(cG - inR * 0.34).toFixed(1)}" cy="${(cG + inR * 0.28).toFixed(1)}" rx="${(inR * 0.46).toFixed(1)}" ry="${(inR * 0.2).toFixed(1)}" fill="${lighten(glow, 0.42)}"/></g>
            <g opacity="0.18"><animateTransform attributeName="transform" type="rotate" from="360 ${cG} ${cG}" to="0 ${cG} ${cG}" dur="9.5s" repeatCount="indefinite"/><ellipse cx="${(cG + inR * 0.3).toFixed(1)}" cy="${(cG + inR * 0.42).toFixed(1)}" rx="${(inR * 0.4).toFixed(1)}" ry="${(inR * 0.17).toFixed(1)}" fill="${darken(glow, 0.3)}"/></g>
          </g>`
        : "";
      const totalG = dG + padG * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalG}" height="${totalG}" viewBox="0 0 ${totalG} ${totalG}" data-healthglobe="1" role="img" aria-label="health ${Math.round(vG * 100)}%">
<defs>
  <linearGradient id="${gidG}r" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${lighten(bevel, 0.42)}"/>
    <stop offset="0.5" stop-color="${bevel}"/>
    <stop offset="1" stop-color="${darken(bevel, 0.3)}"/>
  </linearGradient>
  <radialGradient id="${gidG}glass" cx="0.5" cy="0.4" r="0.85">
    <stop offset="0" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.6)}"/>
    <stop offset="1" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.85)}"/>
  </radialGradient>
  <linearGradient id="${gidG}l" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${lighten(glow, 0.5)}"/>
    <stop offset="0.35" stop-color="${glow}"/>
    <stop offset="1" stop-color="${darken(glow, 0.35)}"/>
  </linearGradient>
  <clipPath id="${gidG}c"><circle cx="${cG}" cy="${cG}" r="${inR.toFixed(1)}"/></clipPath>
  <clipPath id="${gidG}q"><path d="${wave}"/></clipPath>
</defs>
<g opacity="${dim}">
  ${state === "hover" && vG > 0 ? `<circle cx="${cG}" cy="${cG}" r="${(rG + rimW * 0.35).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.45)}" stroke-width="${(rimW * 0.5).toFixed(1)}" style="filter: blur(3px)"/>` : ""}
  <circle cx="${cG}" cy="${cG}" r="${inR.toFixed(1)}" fill="url(#${gidG}glass)"/>
  <g clip-path="url(#${gidG}c)">
    ${vG > 0.01 ? `<path d="${wave}" fill="url(#${gidG}l)"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(inR * 0.12).toFixed(1)}px ${hexRgba(glow, 0.6)})"` : ""}>${waveAnim}</path>
    <ellipse cx="${cG}" cy="${surfY.toFixed(1)}" rx="${(inR * 0.92).toFixed(1)}" ry="${(waveAmp * 1.4).toFixed(1)}" fill="${lighten(glow, 0.55)}" opacity="0.5"/>` : ""}
    ${swirl}
    ${bubbles}
    ${vG > 0.05 ? `<ellipse cx="${cG}" cy="${(cG + inR * 0.8).toFixed(1)}" rx="${(inR * 0.7).toFixed(1)}" ry="${(inR * 0.22).toFixed(1)}" fill="${darken(glow, 0.4)}" opacity="0.5"/>` : ""}
  </g>
  <circle cx="${cG}" cy="${cG}" r="${inR.toFixed(1)}" fill="none" stroke="${darken(bevel, 0.5)}" stroke-width="1.2" opacity="0.8"/>
  <circle cx="${cG}" cy="${cG}" r="${rG.toFixed(1)}" fill="none" stroke="url(#${gidG}r)" stroke-width="${rimW.toFixed(1)}"/>
  <circle cx="${cG}" cy="${cG}" r="${(rG - rimW / 2 - 0.6).toFixed(1)}" fill="none" stroke="${darken(bevel, 0.5)}" stroke-width="1" opacity="0.7"/>
  <circle cx="${cG}" cy="${cG}" r="${(rG + rimW / 2 - 0.6).toFixed(1)}" fill="none" stroke="${lighten(bevel, 0.55)}" stroke-width="1" opacity="0.6"/>
  <ellipse cx="${(cG - inR * 0.3).toFixed(1)}" cy="${(cG - inR * 0.52).toFixed(1)}" rx="${(inR * 0.4).toFixed(1)}" ry="${(inR * 0.18).toFixed(1)}" fill="#FFFFFF" opacity="0.22"/>
</g>
</svg>`;
    }
    case "xpbar": {
      /* RPG · XP bar — level bubble riding the left end, notched track,
         gild fill with a comet head. value = progress; label = the level. */
      const w = 760 * k, h = 108 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 120 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const vX = clamp(value ?? 0.45, 0, 1);
      const lvl = (opts.label ?? "12").slice(0, 3);
      const cy = 30 + h / 2;
      const knobR = 32 * k;
      const knobX = 39 + inset + knobR + 2 * k;
      const gidX = "xp" + UID++;
      const labY = 30 + inset + 14 * k;
      const barH = 28 * k;
      const barX = knobX + knobR + 16 * k, barW = 39 + w - inset - 12 * k - barX;
      const barY = 30 + h - inset - barH - 8 * k;
      let parts = infoText(`${Math.round(vX * 2000).toLocaleString("en-US")} / 2,000 XP`, barX + barW, labY, 19 * k, "end") +
        contentText("NEXT: LV " + (parseInt(lvl, 10) + 1 || "?"), barX + 2, labY, 19 * k * typeK) +
        `<rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="${(barH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidX}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.55)}"/><stop offset="0.45" stop-color="${glow}"/><stop offset="1" stop-color="${darken(glow, 0.28)}"/></linearGradient></defs>`;
      if (vX > 0.02) {
        // negative-space canon: mercury floats in the track, no tip ball
        const gX = 3.5 * k, mHX = barH - gX * 2, mWX = Math.max(0, (barW - gX * 2) * vX);
        parts += `<rect x="${(barX + gX).toFixed(1)}" y="${(barY + gX).toFixed(1)}" width="${mWX.toFixed(1)}" height="${mHX.toFixed(1)}" rx="${(mHX / 2).toFixed(1)}" fill="url(#${gidX})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(glow, 0.65)})"` : ""}/>
          <rect x="${(barX + gX + 4 * k).toFixed(1)}" y="${(barY + gX + 2.5 * k).toFixed(1)}" width="${Math.max(0, mWX - 8 * k).toFixed(1)}" height="${(mHX * 0.32).toFixed(1)}" rx="${(mHX * 0.16).toFixed(1)}" fill="#FFFFFF" opacity="0.5"/>`;
      }
      // level notches — milestone marks cut through track and fill alike
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        parts += `<rect x="${(barX + barW * f - 1.1).toFixed(1)}" y="${(barY + 2).toFixed(1)}" width="2.2" height="${(barH - 4).toFixed(1)}" fill="rgba(0,0,0,0.38)"/>`;
      }
      parts += candyKnob(knobX, cy, knobR, knobC) +
        `<text x="${knobX.toFixed(1)}" y="${(cy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(28 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">${esc(lvl)}</text>`;
      return stampTrack(inject(shell.replace("<svg ", '<svg data-xpbar="1" '), parts), barX, barW);
    }
    case "manarails": {
      /* RPG · twin mana/stamina rails — genre-semantic hues (like the pad
         button's console ring): mana blue, stamina green. value scrubs mana;
         stamina counter-moves so the piece feels alive under the scrub. */
      const w = 560 * k, h = 128 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 130 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const railH = 22 * k;
      const y1 = 30 + h / 2 - railH - 7 * k, y2 = 30 + h / 2 + 7 * k;
      const vM = clamp(value ?? 0.66, 0, 1);
      const vS = clamp(0.15 + (1 - vM) * 0.7, 0, 1);
      const railX = 39 + inset + 58 * k, railW = 39 + w - inset - 16 * k - railX;
      const rail = (ry: number, vR: number, cR: string, ic: IconDef | undefined) => {
        const gidM = "mr" + UID++;
        // negative-space canon: the mercury floats inside the container
        // pill with air on every side
        const gM = 3 * k, mH = railH - gM * 2, mW = Math.max(0, (railW - gM * 2) * vR);
        // dark understroke beneath the tinted glyph — legible on any face
        return (ic ? iconGroup(ic, 39 + inset + 17 * k, ry + railH / 2 - 15 * k, 30 * k, "rgba(8,12,22,0.65)", { strokeWidth: 2.2 * iconWK + 2.4 }) +
          iconGroup(ic, 39 + inset + 17 * k, ry + railH / 2 - 15 * k, 30 * k, lighten(cR, 0.15), { strokeWidth: 2.2 * iconWK }) : "") +
          `<rect x="${railX.toFixed(1)}" y="${ry.toFixed(1)}" width="${railW.toFixed(1)}" height="${railH.toFixed(1)}" rx="${(railH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
          `<defs><linearGradient id="${gidM}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(cR, 0.5)}"/><stop offset="0.45" stop-color="${cR}"/><stop offset="1" stop-color="${darken(cR, 0.3)}"/></linearGradient></defs>` +
          (vR > 0.03 ? `<rect x="${(railX + gM).toFixed(1)}" y="${(ry + gM).toFixed(1)}" width="${mW.toFixed(1)}" height="${mH.toFixed(1)}" rx="${(mH / 2).toFixed(1)}" fill="url(#${gidM})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(cR, 0.6)})"` : ""}/>
            <rect x="${(railX + gM + 3 * k).toFixed(1)}" y="${(ry + gM + 2 * k).toFixed(1)}" width="${Math.max(0, mW - 6 * k).toFixed(1)}" height="${(mH * 0.34).toFixed(1)}" rx="${(mH * 0.17).toFixed(1)}" fill="#FFFFFF" opacity="0.5"/>` : "");
      };
      return inject(shell.replace("<svg ", '<svg data-manarails="1" '),
        rail(y1, vM, "#38bdf8", STOCK_ICONS.flask) + rail(y2, vS, "#4ade80", STOCK_ICONS.zap));
    }
    case "questpanel": {
      /* RPG · quest tracker — quest name, objective rows with check pips,
         progress footer. value = completed share (0..1 over 3 objectives).
         editing contract: hover/pressed strengthen the ACTIVE objective's
         marker; the frame only dims for disabled. */
      const w = 520 * k, h = 384 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 10 * k;
      const x0 = 42 + inset + 16 * k, xr = 42 + w - inset - 16 * k;
      const doneN = clamp(Math.round(clamp(value ?? 0.6, 0, 1) * 3), 0, 3);
      /* data-part stamps: Dissect must identify the words — the title is the
         piece's label (Typography), the eyebrow and objectives are text
         slots (Component content) */
      let inner = `<g data-part="slot-text"><text x="${x0.toFixed(1)}" y="${(33 + inset + 18 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="800" letter-spacing="0.22em" fill="${opts.slots?.eyebrowColor ?? "rgba(255,255,255,0.5)"}" dominant-baseline="central">${esc((opts.slots?.eyebrow ?? "SIDE QUEST").slice(0, 24))}</text></g>` +
        `<g data-part="label">${contentText(opts.label ?? "THE EMBER VAULT", x0, 33 + inset + 52 * k, 30 * k * typeK)}</g>` +
        `<rect x="${x0.toFixed(1)}" y="${(33 + inset + 80 * k).toFixed(1)}" width="${(xr - x0).toFixed(1)}" height="1.4" fill="rgba(255,255,255,0.16)"/>`;
      const objs = [
        { lbl: (opts.slots?.obj1 ?? "Reach the vault gate").slice(0, 40) },
        { lbl: (opts.slots?.obj2 ?? "Recover ember shards").slice(0, 40), count: "1/3" },
        { lbl: (opts.slots?.obj3 ?? "Return to Elder Rowan").slice(0, 40) },
      ];
      const rowY0 = 33 + inset + 102 * k, rowH = 58 * k, pipR = 15 * k;
      objs.forEach((o, i) => {
        const ry = rowY0 + i * rowH + rowH / 2;
        const done = i < doneN;
        const active = i === doneN && state !== "disabled";
        if (done) {
          inner += `<circle cx="${(x0 + pipR).toFixed(1)}" cy="${ry.toFixed(1)}" r="${pipR.toFixed(1)}" fill="${hexMix(bevel, glow, 0.4)}" stroke="${darken(bevel, 0.35)}" stroke-width="1.4"/>` +
            iconGroup(STOCK_ICONS.check, x0 + pipR - pipR * 0.58, ry - pipR * 0.58, pipR * 1.16, "#FFFFFF", { strokeWidth: 3 * iconWK });
        } else {
          const hotQ = active && (state === "hover" || state === "pressed");
          inner += `<circle cx="${(x0 + pipR).toFixed(1)}" cy="${ry.toFixed(1)}" r="${pipR.toFixed(1)}" fill="${wellFill}" stroke="${active ? hexRgba(glow, hotQ ? 1 : 0.7) : "rgba(255,255,255,0.22)"}" stroke-width="${active ? (hotQ ? 2.6 : 1.8) : 1.2}"${active ? ` style="filter: drop-shadow(0 0 ${(hotQ ? 7 : 4) * k}px ${hexRgba(glow, 0.6)})"` : ""}/>`;
        }
        inner += `<g data-part="slot-text">${contentText(o.lbl, x0 + pipR * 2 + 14 * k, ry + 1, 22 * k * typeK, { keepCase: true, list: true, opacity: done ? 0.55 : active ? 1 : 0.75 })}</g>`;
        if (o.count && !done) inner += infoText(o.count, xr, ry + 1, 18 * k, "end");
      });
      const fy = 33 + h - inset - 30 * k, fH = 12 * k;
      const gidQ = "qp" + UID++;
      const fw = (xr - x0) - 56 * k;
      const gQ = 2.5 * k, mHQ = fH - gQ * 2;
      inner += `<rect x="${x0.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fH.toFixed(1)}" rx="${(fH / 2).toFixed(1)}" fill="${wellFill}"/>` +
        `<defs><linearGradient id="${gidQ}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.5)}"/><stop offset="1" stop-color="${darken(glow, 0.25)}"/></linearGradient></defs>` +
        (doneN > 0 ? `<rect x="${(x0 + gQ).toFixed(1)}" y="${(fy + gQ).toFixed(1)}" width="${((fw - gQ * 2) * doneN / 3).toFixed(1)}" height="${mHQ.toFixed(1)}" rx="${(mHQ / 2).toFixed(1)}" fill="url(#${gidQ})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.6)})"` : ""}/>` : "") +
        infoText(`${doneN}/3`, xr, fy + fH / 2 + 1, 18 * k, "end");
      return inject(shell.replace("<svg ", '<svg data-questpanel="1" '), inner);
    }
    case "dialoguebox": {
      /* RPG · dialogue box — speaker plate riding the top edge, two lines,
         bobbing continue arrow. label overrides the first line.
         editing contract: hover/pressed target the CONTINUE ARROW; the
         frame only dims for disabled. */
      const w = 760 * k, h = 230 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 10 * k;
      const plateW = 232 * k, plateH = 46 * k;
      const px0 = 42 + inset + 12 * k, py0 = 33 - plateH * 0.42;
      const gidB = "db" + UID++;
      const plate = `<defs><linearGradient id="${gidB}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(bevel, 0.3)}"/><stop offset="1" stop-color="${darken(bevel, 0.14)}"/></linearGradient></defs>
        <rect x="${px0.toFixed(1)}" y="${py0.toFixed(1)}" width="${plateW.toFixed(1)}" height="${plateH.toFixed(1)}" rx="${(plateH / 2).toFixed(1)}" fill="url(#${gidB})" stroke="${hexRgba(darken(bevel, 0.5), 0.7)}" stroke-width="1.4"/>
        ${contentText((opts.slots?.speaker ?? "ELDER ROWAN").slice(0, 24), px0 + plateW / 2, py0 + plateH / 2 + 1, 19 * k * typeK, { anchor: "middle" })}`;
      // the body is READING text — it speaks the list face (owner: "list
      // font dropdown isn't working here"); the speaker plate is a title
      const line1 = contentText(opts.label ?? "The old road is sealed since the tremor.", 42 + inset + 18 * k, 33 + inset + 46 * k, 23 * k * typeK, { keepCase: true, list: true });
      const line2 = contentText((opts.slots?.line2 ?? "Take the ember pass at first light.").slice(0, 60), 42 + inset + 18 * k, 33 + inset + 82 * k, 23 * k * typeK, { keepCase: true, opacity: 0.8, list: true });
      const ax = 42 + w - inset - 34 * k, ay = 33 + h - inset - 34 * k;
      const hotA = state === "hover" || state === "pressed";
      const arrow = state !== "disabled"
        ? `<g><animateTransform attributeName="transform" type="translate" values="0 0; 0 ${(5 * k).toFixed(1)}; 0 0" dur="1.3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/>
            <path d="M ${(ax - 14 * k).toFixed(1)} ${ay.toFixed(1)} L ${(ax + 14 * k).toFixed(1)} ${ay.toFixed(1)} L ${ax.toFixed(1)} ${(ay + 16 * k).toFixed(1)} Z" fill="${hotA ? lighten(glow, 0.35) : glow}" style="filter: drop-shadow(0 0 ${((hotA ? 9 : 5) * k).toFixed(1)}px ${hexRgba(glow, hotA ? 0.9 : 0.65)})"/></g>`
        : `<path d="M ${(ax - 14 * k).toFixed(1)} ${ay.toFixed(1)} L ${(ax + 14 * k).toFixed(1)} ${ay.toFixed(1)} L ${ax.toFixed(1)} ${(ay + 16 * k).toFixed(1)} Z" fill="rgba(255,255,255,0.3)"/>`;
      return inject(shell.replace("<svg ", '<svg data-dialoguebox="1" '), plate + line1 + line2 + arrow);
    }
    case "choicelist": {
      /* RPG · dialogue choices — three response capsules; value scrubs the
         highlighted one. editing contract: hover/pressed restyle the ACTIVE
         choice; the frame only dims for disabled. */
      const w = 560 * k, rowH = 78 * k, nCh = 3;
      const h = rowH * nCh + 56 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 10 * k;
      // floor mapping — same pointer-track contract as the list menu
      const sel = clamp(Math.floor(clamp(value ?? 0, 0, 1) * nCh), 0, nCh - 1);
      const choices = [(opts.slots?.c1 ?? "Ask about the ruins").slice(0, 40), (opts.slots?.c2 ?? "Show the sealed letter").slice(0, 40), (opts.slots?.c3 ?? "Leave — for now").slice(0, 40)];
      const x0 = 42 + inset + 8 * k, rw = w - inset * 2 - 16 * k;
      let inner = "";
      choices.forEach((c9, i) => {
        const ry = 33 + inset + 10 * k + i * rowH;
        const on9 = i === sel && state !== "disabled";
        const hotC = on9 && state === "hover", pressC = on9 && state === "pressed";
        inner += `<rect x="${x0.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${(rowH - 12 * k).toFixed(1)}" rx="${(14 * k).toFixed(1)}" fill="${on9 ? hexRgba(glow, pressC ? 0.4 : hotC ? 0.32 : 0.22) : "rgba(255,255,255,0.06)"}" stroke="${on9 ? hexRgba(glow, hotC || pressC ? 0.95 : 0.65) : "rgba(255,255,255,0.14)"}" stroke-width="${hotC ? 2.2 : 1.4}"${hotC ? ` style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(glow, 0.55)})"` : ""}/>`;
        if (on9 && STOCK_ICONS.play) inner += themedIcon(STOCK_ICONS.play, x0 + 14 * k, ry + (rowH - 12 * k) / 2 - 11 * k, 22 * k, glow, 2.4);
        inner += contentText(c9, x0 + (on9 ? 48 : 24) * k, ry + (rowH - 12 * k) / 2 + 1, 23 * k * typeK, { keepCase: true, list: true, opacity: on9 ? 1 : 0.8 });
        inner += infoText(String(i + 1), x0 + rw - 18 * k, ry + (rowH - 12 * k) / 2 + 1, 18 * k, "end", 700);
      });
      return inject(shell.replace("<svg ", `<svg data-choicelist="1" data-vtrack="${(33 + inset + 10 * k).toFixed(1)} ${(rowH * nCh).toFixed(1)}" `), inner);
    }
    case "invgrid": {
      /* RPG · inventory grid — 4×3 wells in one panel, mixed contents, one
         selected cell. value scrubs the selection.
         editing contract: hover/pressed strengthen the SELECTED cell's
         ring; the frame only dims for disabled. */
      const cols = 4, rowsI = 3, gap = 10 * k;
      const w = 520 * k;
      const insetI = bw + 12 * k;
      const cell = (w - insetI * 2 - 12 * k - (cols - 1) * gap) / cols;
      const headH = 52 * k;
      const h = insetI * 2 + headH + rowsI * cell + (rowsI - 1) * gap + 14 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const gx0 = 42 + insetI + 6 * k, gy0 = 33 + insetI + headH;
      const items: (keyof typeof STOCK_ICONS | null)[] = ["sword", "shield", "flask", "gem", "scroll", "key", "helmet", "boots", "zap", null, null, null];
      const counts: Record<number, string> = { 2: "5", 3: "14" };
      const sel = clamp(Math.round(clamp(value ?? 0.42, 0, 1) * (cols * rowsI - 1)), 0, cols * rowsI - 1);
      let inner = contentText("INVENTORY", gx0 + 4 * k, 33 + insetI + 22 * k, 23 * k * typeK) +
        infoText("9/12", 42 + w - insetI - 10 * k, 33 + insetI + 22 * k, 19 * k, "end");
      for (let i = 0; i < cols * rowsI; i++) {
        const cxI = gx0 + (i % cols) * (cell + gap), cyI = gy0 + Math.floor(i / cols) * (cell + gap);
        inner += `<rect x="${cxI.toFixed(1)}" y="${cyI.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="${(10 * k).toFixed(1)}" fill="${wellFill}" opacity="0.9"/>`;
        const icKey = items[i];
        if (icKey && STOCK_ICONS[icKey]) inner += themedIcon(STOCK_ICONS[icKey], cxI + cell * 0.22, cyI + cell * 0.22, cell * 0.56, hexMix(glow, "#FFFFFF", 0.3), 2);
        if (counts[i]) inner += `<circle cx="${(cxI + cell - 13 * k).toFixed(1)}" cy="${(cyI + cell - 13 * k).toFixed(1)}" r="${(16 * k).toFixed(1)}" fill="${bevel}" stroke="${darken(bevel, 0.4)}" stroke-width="1.4"/><text x="${(cxI + cell - 13 * k).toFixed(1)}" y="${(cyI + cell - 12 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(17.5 * k).toFixed(1)}" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${esc(counts[i])}</text>`;
        if (i === sel && state !== "disabled") {
          const hotI = state === "hover" || state === "pressed";
          inner += `<rect x="${(cxI - 2).toFixed(1)}" y="${(cyI - 2).toFixed(1)}" width="${(cell + 4).toFixed(1)}" height="${(cell + 4).toFixed(1)}" rx="${(12 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, hotI ? 1 : 0.8)}" stroke-width="${hotI ? 3 : 2.2}" style="filter: drop-shadow(0 0 ${((hotI ? 8 : 5) * k).toFixed(1)}px ${hexRgba(glow, 0.6)})"/>`;
        }
      }
      return inject(shell.replace("<svg ", '<svg data-invgrid="1" '), inner);
    }
    case "rarityframe": {
      /* RPG · rarity frame — the slot whose aura IS the tier. value picks
         the tier (0 common → 1 legendary); hue is genre-semantic, like the
         pad button's console ring. */
      const s = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const tier = rarityOf(cfg, value, 0);
      const hotR9 = state === "hover" || state === "pressed";
      const aura = `<rect x="${(sx - 5 * k).toFixed(1)}" y="${(sy - 5 * k).toFixed(1)}" width="${(sw + 10 * k).toFixed(1)}" height="${(sh + 10 * k).toFixed(1)}" rx="${(18 * k).toFixed(1)}" fill="none" stroke="${tier.c}" stroke-width="${((hotR9 ? 5.5 : 4) * k).toFixed(1)}" opacity="${state === "disabled" ? 0.3 : 0.95}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${((hotR9 ? 10 : 6) * k).toFixed(1)}px ${hexRgba(tier.c, 0.75)})"` : ""}/>`;
      const inset = bw + 5;
      const well = `<path d="${wellOf(s, s, inset)}" fill="${wellFill}" opacity="0.9"/>`;
      const gem = STOCK_ICONS.gem ? iconGroup(STOCK_ICONS.gem, 39 + s / 2 - 27 * k, 30 + s / 2 - 33 * k, 54 * k, state === "disabled" ? "#A7AAB4" : lighten(tier.c, 0.15), { strokeWidth: 2.2 * iconWK }) : "";
      const tag = `<text x="${(39 + s / 2).toFixed(1)}" y="${(30 + s - inset - 12 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(12.5 * k).toFixed(1)}" font-weight="800" letter-spacing="0.14em" fill="${state === "disabled" ? "rgba(255,255,255,0.4)" : lighten(tier.c, 0.35)}" text-anchor="middle" dominant-baseline="central">${esc(tier.name)}</text>`;
      // overlay "frame": engine-export cut — tier-tinted frame + empty well;
      // the item icon and tier word are live engine content
      return injectUnder(inject(shell.replace("<svg ", '<svg data-rarityframe="1" '), well + (opts.overlay === "frame" ? "" : gem + tag)), aura);
    }
    case "equipslot": {
      /* RPG · equipment slot — an empty socket showing WHAT belongs there:
         ghosted gear silhouette + dashed seat. opts.icon picks the gear. */
      const s = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const inset = bw + 5;
      const well = `<path d="${wellOf(s, s, inset)}" fill="${wellFill}" opacity="0.9"/>` +
        `<path d="${wellOf(s, s, inset + 8 * k)}" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="2" stroke-dasharray="6 5"/>`;
      const ic = opts.icon ?? STOCK_ICONS.helmet;
      const ghost = ic ? iconGroup(ic, 39 + s / 2 - 28 * k, 30 + s / 2 - 28 * k, 56 * k, state === "hover" ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.38)", { strokeWidth: 2 * iconWK }) : "";
      return inject(shell.replace("<svg ", '<svg data-equipslot="1" '), well + ghost);
    }
    case "skillnode": {
      /* RPG · skill-tree node — a circular socket with connector stubs; the
         lit stub is the learned path. overlay: "locked" | "learned" |
         (default) available. The node is a real button — build drives its
         hover/pressed states natively. */
      const s = 136 * k;
      const ic = opts.icon ?? STOCK_ICONS.zap ?? null;
      // a locked node shows ONLY the lock — the skill glyph would ghost
      // through the veil and fight it
      const shell = build(cfg, opts.overlay === "locked" ? "disabled" : state, { x: 39, y: 30, h: s, fs: 0, iconSize: 58 * k }, { iconDef: opts.overlay === "locked" ? null : ic, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const cyK = sy + sh / 2; // the shell box excludes the extrusion
      const stubW = 9 * k;
      const stubs = `<line x1="${(sx - 24 * k).toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${(sx + 6 * k).toFixed(1)}" y2="${cyK.toFixed(1)}" stroke="${glow}" stroke-width="${stubW.toFixed(1)}" stroke-linecap="round"${state !== "disabled" && opts.overlay !== "locked" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.6)})"` : ""} opacity="${opts.overlay === "locked" ? 0.25 : 0.95}"/>
        <line x1="${(sx + sw - 6 * k).toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${(sx + sw + 24 * k).toFixed(1)}" y2="${cyK.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="${stubW.toFixed(1)}" stroke-linecap="round"/>`;
      let over = "";
      if (opts.overlay === "locked") {
        const fcM = /url\(#([A-Za-z0-9_-]+)fc\)/.exec(shell);
        if (fcM) over += `<g clip-path="url(#${fcM[1]}fc)"><rect x="${(sx - 4).toFixed(1)}" y="${(sy - 4).toFixed(1)}" width="${(sw + 8).toFixed(1)}" height="${(sh + 8).toFixed(1)}" fill="rgba(6,8,16,0.5)"/></g>`;
        // the lock IS the content on a locked node: big, face-centered, and
        // in the same deactivated gray as every disabled glyph
        over += iconGroup(STOCK_ICONS.lock, sx + sw / 2 - 27 * k, cyK - 27 * k, 54 * k, "#A7AAB4", { strokeWidth: 2 * iconWK });
      } else if (opts.overlay === "learned") {
        over += `<circle cx="${(sx + sw - 8 * k).toFixed(1)}" cy="${(sy + 8 * k).toFixed(1)}" r="${(15 * k).toFixed(1)}" fill="${bevel}" stroke="${darken(bevel, 0.45)}" stroke-width="1.5"/>` +
          iconGroup(STOCK_ICONS.check, sx + sw - 17 * k, sy - 1 * k, 18 * k, "#FFFFFF", { strokeWidth: 3 * iconWK });
      }
      return inject(injectUnder(shell.replace("<svg ", '<svg data-skillnode="1" '), stubs), over);
    }
    case "compass": {
      /* RPG · compass ribbon — a windowed heading strip: cardinal letters in
         the kit type, minor ticks, center needle. value = heading (0..1 →
         0..360°); ticks fade toward the window edges. */
      const w = 640 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 104 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cxC = 39 + w / 2, cy = 30 + h / 2;
      const heading = clamp(value ?? 0.08, 0, 1) * 360;
      const span = 62;
      const pxPerDeg = (w / 2 - inset - 26 * k) / span;
      const gidC9 = "cp" + UID++;
      const wellP = wellOf(w, h, inset + 3 * k);
      let inner = `<defs><clipPath id="${gidC9}"><path d="${wellP}"/></clipPath></defs><path d="${wellP}" fill="${wellFill}" opacity="0.9"/><g clip-path="url(#${gidC9})">`;
      const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
      for (let d9 = 0; d9 < 360; d9 += 15) {
        const delta = ((d9 - heading + 540) % 360) - 180;
        if (Math.abs(delta) > span) continue;
        const x9 = cxC + delta * pxPerDeg;
        const fade = Math.max(0, 1 - Math.pow(Math.abs(delta) / span, 1.6));
        if (d9 % 90 === 0) {
          inner += contentText(names[d9], x9, cy - 4 * k, 30 * k * typeK, { anchor: "middle", keepCase: true, opacity: fade });
        } else if (d9 % 45 === 0) {
          inner += `<text x="${x9.toFixed(1)}" y="${(cy - 3 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.55)" text-anchor="middle" dominant-baseline="central" opacity="${fade.toFixed(2)}">${names[d9]}</text>`;
        }
        inner += `<line x1="${x9.toFixed(1)}" y1="${(cy + 14 * k).toFixed(1)}" x2="${x9.toFixed(1)}" y2="${(cy + (d9 % 45 === 0 ? 26 : 21) * k).toFixed(1)}" stroke="rgba(255,255,255,${d9 % 45 === 0 ? 0.75 : 0.45})" stroke-width="${(d9 % 90 === 0 ? 2.6 : 1.7).toFixed(1)}" opacity="${fade.toFixed(2)}"/>`;
      }
      inner += "</g>";
      const needleTop = 30 + inset + 5 * k;
      inner += `<path d="M ${(cxC - 8 * k).toFixed(1)} ${needleTop.toFixed(1)} L ${(cxC + 8 * k).toFixed(1)} ${needleTop.toFixed(1)} L ${cxC.toFixed(1)} ${(needleTop + 10 * k).toFixed(1)} Z" fill="${glow}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>
        <line x1="${cxC.toFixed(1)}" y1="${(needleTop + 12 * k).toFixed(1)}" x2="${cxC.toFixed(1)}" y2="${(30 + h - inset - 8 * k).toFixed(1)}" stroke="${hexRgba(glow, 0.55)}" stroke-width="${(2 * k).toFixed(1)}"/>`;
      return inject(shell.replace("<svg ", '<svg data-compass="1" '), inner);
    }
    case "partyframe": {
      /* RPG · party member frame — mini portrait, name, HP/MP rails. The
         whole frame is the interactive element (party selection), so the
         shell takes hover/pressed natively. value = HP; MP counter-moves. */
      const w = 400 * k, h = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const cy = 30 + h / 2;
      const pr = 33 * k, pcx = 39 + inset + pr + 8 * k;
      const gidP9 = "pf" + UID++;
      const portrait = `<defs><clipPath id="${gidP9}"><circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}"/></clipPath></defs>
        <circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}" fill="${wellFill}"/>
        <g clip-path="url(#${gidP9})" opacity="${state === "disabled" ? 0.4 : 1}">
          <circle cx="${pcx.toFixed(1)}" cy="${(cy - pr * 0.28).toFixed(1)}" r="${(pr * 0.34).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
          <ellipse cx="${pcx.toFixed(1)}" cy="${(cy + pr * 0.75).toFixed(1)}" rx="${(pr * 0.62).toFixed(1)}" ry="${(pr * 0.5).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
        </g>
        <circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}" fill="none" stroke="${darken(bevel, 0.35)}" stroke-width="1.6"/>
        ${candyKnob(pcx - pr * 0.72, cy + pr * 0.74, 12 * k, knobC)}
        <text x="${(pcx - pr * 0.72).toFixed(1)}" y="${(cy + pr * 0.74 + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">12</text>`;
      const tx0 = pcx + pr + 16 * k, txw = 39 + w - inset - 12 * k - tx0;
      const vHP = clamp(value ?? 0.78, 0, 1);
      const vMP = clamp(0.25 + (1 - vHP) * 0.5, 0, 1);
      const railH = 14 * k;
      const rail9 = (ry: number, vR: number, cR: string) => {
        const gid9b = "pr" + UID++;
        // progress-bar canon: mercury floats in the container with air
        const g9 = 2.5 * k, mH9 = railH - g9 * 2, mW9 = Math.max(0, (txw - g9 * 2) * vR);
        return `<rect x="${tx0.toFixed(1)}" y="${ry.toFixed(1)}" width="${txw.toFixed(1)}" height="${railH.toFixed(1)}" rx="${(railH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>` +
          `<defs><linearGradient id="${gid9b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(cR, 0.45)}"/><stop offset="1" stop-color="${darken(cR, 0.3)}"/></linearGradient></defs>` +
          (vR > 0.04 ? `<rect x="${(tx0 + g9).toFixed(1)}" y="${(ry + g9).toFixed(1)}" width="${mW9.toFixed(1)}" height="${mH9.toFixed(1)}" rx="${(mH9 / 2).toFixed(1)}" fill="url(#${gid9b})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px ${hexRgba(cR, 0.55)})"` : ""}/>` : "");
      };
      const parts = portrait +
        contentText(opts.label ?? "KIRA", tx0, 30 + inset + 20 * k, 24 * k * typeK, { keepCase: true }) +
        // themed like the name — a white ghost glyph vanished on light faces
        (STOCK_ICONS.sword ? themedIcon(STOCK_ICONS.sword, 39 + w - inset - 30 * k, 30 + inset + 8 * k, 22 * k, hexMix(glow, "#FFFFFF", 0.25), 2) : "") +
        rail9(cy + 8 * k, vHP, "#4ade80") + rail9(cy + 28 * k, vMP, "#38bdf8");
      return inject(shell.replace("<svg ", '<svg data-partyframe="1" '), parts);
    }
    case "dmgnumber": {
      /* RPG · floating damage number — shell-free combat type. value scales
         the magnitude; past 0.7 it goes CRIT (burst word + sparks). The
         number itself carries the full type treatment. */
      const vD = clamp(value ?? 0.35, 0, 1);
      const crit = vD > 0.7;
      const amt = opts.label ?? Math.round(120 + vD * 1800).toLocaleString("en-US");
      const fsD = (52 + vD * 36) * k * typeK;
      const WD = 400 * k, HD = 210 * k;
      const cxD = WD / 2, cyD = HD * 0.56;
      const dim = state === "disabled" ? 0.45 : 1;
      let sparks = "";
      if (crit && state !== "disabled") {
        for (let i = 0; i < 6; i++) {
          const aD = (-80 + i * 52) * Math.PI / 180;
          const r1 = fsD * 0.72, r2 = r1 + 16 * k + (i % 2) * 9 * k;
          sparks += `<line x1="${(cxD + r1 * Math.cos(aD)).toFixed(1)}" y1="${(cyD + r1 * Math.sin(aD) * 0.62).toFixed(1)}" x2="${(cxD + r2 * Math.cos(aD)).toFixed(1)}" y2="${(cyD + r2 * Math.sin(aD) * 0.62).toFixed(1)}" stroke="${lighten(glow, 0.3)}" stroke-width="${(3.4 * k).toFixed(1)}" stroke-linecap="round" style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.7)})"/>`;
        }
      }
      const critWord = crit
        ? `<text x="${(cxD + fsD * 0.9).toFixed(1)}" y="${(cyD - fsD * 0.62).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(24 * k).toFixed(1)}" font-weight="900" font-style="italic" letter-spacing="0.08em" fill="${lighten(glow, 0.35)}" text-anchor="middle" dominant-baseline="central" transform="rotate(6 ${(cxD + fsD * 0.9).toFixed(1)} ${(cyD - fsD * 0.62).toFixed(1)})" style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 4px${state !== "disabled" ? `; filter: drop-shadow(0 0 5px ${hexRgba(glow, 0.8)})` : ""}">CRIT!</text>`
        : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WD.toFixed(0)}" height="${HD.toFixed(0)}" viewBox="0 0 ${WD.toFixed(0)} ${HD.toFixed(0)}" data-dmgnumber="1" role="img" aria-label="damage ${amt}">
<g opacity="${dim}">${sparks}<g transform="rotate(-6 ${cxD.toFixed(1)} ${cyD.toFixed(1)})">${contentText(amt, cxD, cyD, fsD, { anchor: "middle", keepCase: true })}</g>${critWord}</g>
</svg>`;
    }
    case "loottag": {
      /* RPG · loot drop tag — ground-loot label: rarity stripe + gem, item
         name, tier word. value picks the tier. */
      const w = 400 * k, h = 92 * k;
      const tier = rarityOf(cfg, value, 2);
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 100 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const hotL9 = state === "hover" || state === "pressed";
      const stripe = `<rect x="${(39 + inset + 12 * k).toFixed(1)}" y="${(30 + inset + 12 * k).toFixed(1)}" width="${(6 * k).toFixed(1)}" height="${(h - inset * 2 - 24 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${tier.c}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${((hotL9 ? 7 : 4) * k).toFixed(1)}px ${hexRgba(tier.c, 0.75)})"` : ""}/>`;
      // the gem follows the tier hue by default; the WHOLE Icons panel
      // (size, weight, opacity, rotation, fx, color) drives it — exactly
      // what that panel's helper promises. null = removed.
      const icL = opts.icon !== undefined ? opts.icon : STOCK_ICONS.gem;
      const gem = icL ? wellGlyph(icL, 39 + inset + 45 * k, cy, 30 * k, lighten(tier.c, 0.15)) : "";
      const name = contentText(opts.label ?? "Ember Blade", 39 + inset + 74 * k, cy - (10 * k), 25 * k * typeK, { keepCase: true });
      const tag = `<text x="${(39 + inset + 74 * k).toFixed(1)}" y="${(cy + 18 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="800" letter-spacing="0.16em" fill="${state === "disabled" ? "rgba(255,255,255,0.4)" : lighten(tier.c, 0.3)}" dominant-baseline="central">${esc(tier.name)}</text>`;
      // overlay "frame": engine-export cut — the bare plate; stripe, item
      // icon, name and tier word are all live engine content
      return inject(shell.replace("<svg ", '<svg data-loottag="1" '), opts.overlay === "frame" ? "" : stripe + gem + name + tag);
    }
    case "crosshair": {
      /* Shooter · crosshair — four ticks + optional dot; spatial UI in the
         Glow role with a dark understroke so it reads on any footage.
         EDITING CONTRACT: value = spread (ticks travel outward);
         overlay = "dot" (dot only) | "t" (no top tick); line weight rides
         the Icon stroke control; color follows the Glow role; disabled dims. */
      const dX = 170 * k;
      const cX = dX / 2;
      const vX9 = clamp(value ?? 0.25, 0, 1);
      const gapX = 10 * k + vX9 * 30 * k, lenX = 22 * k;
      const swX = 4.5 * k * iconWK;
      const dim = state === "disabled" ? 0.4 : 1;
      const variant = opts.overlay ?? "";
      const tick = (x1: number, y1: number, x2: number, y2: number) =>
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(6,10,18,0.7)" stroke-width="${(swX + 2.4).toFixed(1)}" stroke-linecap="round"/>` +
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${glow}" stroke-width="${swX.toFixed(1)}" stroke-linecap="round"${state === "hover" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.8)})"` : ""}/>`;
      let marks = "";
      if (variant !== "dot") {
        if (variant !== "t") marks += tick(cX, cX - gapX - lenX, cX, cX - gapX);
        marks += tick(cX, cX + gapX, cX, cX + gapX + lenX) +
          tick(cX - gapX - lenX, cX, cX - gapX, cX) +
          tick(cX + gapX, cX, cX + gapX + lenX, cX);
      }
      const dotX = variant === "dot" || variant === ""
        ? `<circle cx="${cX}" cy="${cX}" r="${(3.2 * k * iconWK + 1.2).toFixed(1)}" fill="rgba(6,10,18,0.7)"/><circle cx="${cX}" cy="${cX}" r="${(3.2 * k * iconWK).toFixed(1)}" fill="${glow}"/>`
        : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${dX.toFixed(0)}" height="${dX.toFixed(0)}" viewBox="0 0 ${dX.toFixed(0)} ${dX.toFixed(0)}" data-crosshair="1" role="img" aria-label="crosshair"><g opacity="${dim}">${marks}${dotX}</g></svg>`;
    }
    case "hitmarker": {
      /* Shooter · hit marker — four diagonal ticks; past 0.7 it's a CRIT
         (alarm tint, thicker, hot glow) — same threshold language as the
         damage number. EDITING CONTRACT: value = intensity; weight rides
         the Icon stroke; base color follows Glow; crit red is semantic. */
      const dH = 150 * k, cH = dH / 2;
      const vH9 = clamp(value ?? 0.4, 0, 1);
      const crit = vH9 > 0.7;
      const cHc = crit ? hexMix("#FF3B4A", glow, 0.15) : glow;
      const swH = (4 * k + vH9 * 2.5 * k) * iconWK;
      const r1H = 12 * k + vH9 * 6 * k, r2H = r1H + 20 * k + vH9 * 8 * k;
      const dim = state === "disabled" ? 0.4 : 1;
      let ticksH = "";
      for (const [dx9, dy9] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ticksH += `<line x1="${(cH + dx9 * r1H).toFixed(1)}" y1="${(cH + dy9 * r1H).toFixed(1)}" x2="${(cH + dx9 * r2H).toFixed(1)}" y2="${(cH + dy9 * r2H).toFixed(1)}" stroke="rgba(6,10,18,0.7)" stroke-width="${(swH + 2.4).toFixed(1)}" stroke-linecap="round"/>
          <line x1="${(cH + dx9 * r1H).toFixed(1)}" y1="${(cH + dy9 * r1H).toFixed(1)}" x2="${(cH + dx9 * r2H).toFixed(1)}" y2="${(cH + dy9 * r2H).toFixed(1)}" stroke="${cHc}" stroke-width="${swH.toFixed(1)}" stroke-linecap="round"${crit && state !== "disabled" ? ` style="filter: drop-shadow(0 0 4px ${hexRgba(cHc, 0.85)})"` : ""}/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${dH.toFixed(0)}" height="${dH.toFixed(0)}" viewBox="0 0 ${dH.toFixed(0)} ${dH.toFixed(0)}" data-hitmarker="1" role="img" aria-label="hit marker"><g opacity="${dim}">${ticksH}</g></svg>`;
    }
    case "killfeed": {
      /* Shooter · kill-feed row — killer [weapon] victim. EDITING CONTRACT:
         label = killer, sub = victim, icon = the weapon glyph (swappable);
         the whole row takes hover (that's the "you're in this one" flash);
         type drives both names. */
      const w = 600 * k, h = 76 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 86 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 5 * k;
      const cy = 30 + h / 2;
      const icK = opts.icon ?? STOCK_ICONS.crosshair;
      const killer = opts.label ?? "NOVA_KNIGHT";
      const victim = opts.sub ?? "RIVAL_66";
      // display italics run wide — the weapon glyph sits at 58% with real
      // air on both sides so long handles never kiss it
      const parts = contentText(killer, 39 + inset + 16 * k, cy + 1, 21 * k * typeK, { keepCase: true }) +
        (icK ? themedIcon(icK, 39 + w * 0.56 - 15 * k, cy - 15 * k, 30 * k, glow, 2.4) : "") +
        contentText(victim, 39 + w * 0.56 + 26 * k, cy + 1, 20 * k * typeK, { keepCase: true, opacity: 0.75 });
      return inject(shell.replace("<svg ", '<svg data-killfeed="1" '), parts);
    }
    case "magazine": {
      /* Shooter · magazine — round pips deplete as you fire; the count
         keeps the exact number. EDITING CONTRACT: value = rounds left;
         max = capacity label; pips follow the Glow role; disabled dims. */
      const nM = 12;
      const pipW = 13 * k, pipH = 48 * k, gapM2 = 6 * k, padM = 16;
      const cap = parseInt(opts.max ?? "12", 10) || 12;
      const vM9 = clamp(value ?? 0.66, 0, 1);
      const left = Math.round(vM9 * nM);
      const WM = padM * 2 + nM * pipW + (nM - 1) * gapM2 + 96 * k;
      const HM = padM * 2 + pipH;
      const gidM9 = "mg" + UID++;
      let pips = `<defs><linearGradient id="${gidM9}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.5)}"/><stop offset="0.45" stop-color="${glow}"/><stop offset="1" stop-color="${darken(glow, 0.3)}"/></linearGradient></defs>`;
      for (let i = 0; i < nM; i++) {
        const px9 = padM + i * (pipW + gapM2);
        const on = i < left;
        pips += `<rect x="${px9.toFixed(1)}" y="${padM}" width="${pipW.toFixed(1)}" height="${pipH.toFixed(1)}" rx="${(pipW / 2).toFixed(1)}" fill="${on ? `url(#${gidM9})` : "rgba(255,255,255,0.14)"}" stroke="${on ? darken(glow, 0.4) : "rgba(255,255,255,0.18)"}" stroke-width="1"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px ${hexRgba(glow, 0.5)})"` : ""}/>`;
      }
      pips += hudText(`${Math.round(vM9 * cap)} / ${cap}`, WM - padM, HM / 2 + 1, 24 * k, "end");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WM.toFixed(0)}" height="${HM.toFixed(0)}" viewBox="0 0 ${WM.toFixed(0)} ${HM.toFixed(0)}" data-magazine="1" role="img" aria-label="magazine ${Math.round(vM9 * cap)} of ${cap}"><g opacity="${state === "disabled" ? 0.4 : 1}">${pips}</g></svg>`;
    }
    case "equipselector": {
      /* Shooter · equipment selector — a CONTINUOUS carousel: value*3 is a
         fractional position, so LiveArt can tween it and items glide,
         scale and fade like a hardware picker. EDITING CONTRACT: value =
         position (animated in play mode; click right = next, left =
         previous); label = the armed item's name; icon = the armed glyph
         (swappable); hover strengthens the armed ring; disabled dims. */
      const items: { ic?: IconDef; nm: string }[] = [
        { ic: STOCK_ICONS.flask, nm: (opts.slots?.item1 ?? "FIELD TONIC").slice(0, 18) },
        { ic: STOCK_ICONS.zap, nm: (opts.slots?.item2 ?? "SHOCK CHARGE").slice(0, 18) },
        { ic: STOCK_ICONS.gem, nm: (opts.slots?.item3 ?? "PRISM MINE").slice(0, 18) },
      ];
      const nE = items.length;
      const pE = ((clamp(value ?? 0.34, -1, 2) % 1) + 1) % 1 * nE; // 0..3 continuous
      const sideS = 84 * k, midS = 118 * k, gapE = 14 * k, padE = 22;
      const WE = padE * 2 + sideS * 2 + midS + gapE * 2 + 44 * k;
      const HE = padE * 2 + midS + 34 * k;
      const cyE = padE + midS / 2;
      const cxM = WE / 2;
      const slotSp = sideS / 2 + gapE + midS / 2;
      const hotE = state === "hover" || state === "pressed";
      // items positioned by signed distance from the carousel head
      const placed = items.map((it, i) => {
        let dlt = ((i - pE) % nE + nE) % nE; // 0..3
        if (dlt > nE / 2) dlt -= nE;         // → -1.5..1.5
        return { it, i, dlt };
      }).sort((a, b) => Math.abs(b.dlt) - Math.abs(a.dlt));
      const minD = Math.min(...placed.map((p9) => Math.abs(p9.dlt)));
      const armedI = placed.find((p9) => Math.abs(p9.dlt) === minD)!;
      let innerE = "";
      for (const { it, dlt } of placed) {
        const gGh = Math.min(Math.abs(dlt), 1); // 0 armed … 1 ghost
        const s9 = midS + (sideS - midS) * gGh;
        const cx9 = cxM + dlt * slotSp;
        innerE += `<rect x="${(cx9 - s9 / 2).toFixed(1)}" y="${(cyE - s9 / 2).toFixed(1)}" width="${s9.toFixed(1)}" height="${s9.toFixed(1)}" rx="${(12 * k).toFixed(1)}" fill="${wellFill}" opacity="${(0.82 + (1 - gGh) * 0.14).toFixed(2)}" stroke="rgba(255,255,255,${(0.16 + (1 - gGh) * 0.16).toFixed(2)})" stroke-width="1.2"/>`;
        if (it.ic) innerE += gGh < 0.35
          ? themedIcon(it.ic, cx9 - s9 * 0.3, cyE - s9 * 0.3, s9 * 0.6, hexMix(glow, "#FFFFFF", 0.3), 2.2)
          : iconGroup(it.ic, cx9 - s9 * 0.27, cyE - s9 * 0.27, s9 * 0.54, "#AEB6C4", { strokeWidth: 2 * iconWK });
      }
      // armed ring + name live at the fixed center; they fade during travel
      const settle = clamp(1 - minD * 2.2, 0, 1);
      if (settle > 0.02) {
        innerE += `<rect x="${(cxM - midS / 2 - 3).toFixed(1)}" y="${(cyE - midS / 2 - 3).toFixed(1)}" width="${(midS + 6).toFixed(1)}" height="${(midS + 6).toFixed(1)}" rx="${(14 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, (hotE ? 1 : 0.8) * settle)}" stroke-width="${hotE ? 3 : 2.2}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${((hotE ? 8 : 5) * k).toFixed(1)}px ${hexRgba(glow, 0.6 * settle)})"` : ""}/>`;
      }
      const chev = (x9: number, flip: boolean) =>
        `<path d="M ${(x9 + (flip ? 7 : -7) * k).toFixed(1)} ${(cyE - 10 * k).toFixed(1)} L ${(x9 + (flip ? -5 : 5) * k).toFixed(1)} ${cyE.toFixed(1)} L ${(x9 + (flip ? 7 : -7) * k).toFixed(1)} ${(cyE + 10 * k).toFixed(1)}" fill="none" stroke="#9AA6B8" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      innerE = chev(padE + 8 * k, false) + innerE + chev(WE - padE - 8 * k, true);
      innerE += `<g opacity="${settle.toFixed(2)}">${contentText(opts.label ?? armedI.it.nm, cxM, padE + midS + 20 * k, 19 * k * typeK, { anchor: "middle" })}</g>`;
      // the stamped track lets play mode cycle by click side (left/right)
      return stampTrack(`<svg xmlns="http://www.w3.org/2000/svg" width="${WE.toFixed(0)}" height="${HE.toFixed(0)}" viewBox="0 0 ${WE.toFixed(0)} ${HE.toFixed(0)}" data-equipselector="1" role="img" aria-label="equipment selector"><g opacity="${state === "disabled" ? 0.4 : 1}">${innerE}</g></svg>`, padE, WE - padE * 2);
    }
    case "streakmeter": {
      /* Shooter · streak meter — five cells build to ignition; the zap
         lights when the streak is full. EDITING CONTRACT: value = streak
         progress; label = the meter's name; cells follow the Glow role
         with the negative-space canon; disabled dims. */
      const w = 500 * k, h = 92 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 100 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const vS9 = clamp(value ?? 0.64, 0, 1);
      const nS9 = 5;
      const litS = Math.round(vS9 * nS9);
      const full = litS >= nS9;
      const gidS9 = "sk" + UID++;
      // wide-italic label zone: cells start clear of the word
      const cellsX = 39 + inset + 188 * k, cellsW = w - inset * 2 - 188 * k - 92 * k;
      const cellW9 = (cellsW - (nS9 - 1) * 6 * k) / nS9;
      /* negative-space canon: one sunken container, cells float inset */
      let inner = contentText(opts.label ?? "STREAK", 39 + inset + 16 * k, cy + 1, 22 * k * typeK) +
        `<rect x="${(cellsX - 6 * k).toFixed(1)}" y="${(cy - 19 * k).toFixed(1)}" width="${(cellsW + 12 * k).toFixed(1)}" height="${(38 * k).toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidS9}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.45)}"/><stop offset="1" stop-color="${darken(glow, 0.25)}"/></linearGradient></defs>`;
      for (let i = 0; i < nS9; i++) {
        const cx9 = cellsX + i * (cellW9 + 6 * k);
        const on = i < litS;
        inner += `<rect x="${cx9.toFixed(1)}" y="${(cy - 12 * k).toFixed(1)}" width="${cellW9.toFixed(1)}" height="${(24 * k).toFixed(1)}" rx="${(5 * k).toFixed(1)}" fill="${on ? `url(#${gidS9})` : "rgba(255,255,255,0.1)"}" stroke="${on ? darken(glow, 0.35) : "rgba(255,255,255,0.12)"}" stroke-width="1"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(3 * k).toFixed(1)}px ${hexRgba(glow, 0.5)})"` : ""}/>`;
      }
      const zapX = 39 + w - inset - 52 * k;
      inner += (STOCK_ICONS.zap ? (full && state !== "disabled"
        ? `<g style="filter: drop-shadow(0 0 ${(7 * k).toFixed(1)}px ${hexRgba(glow, 0.85)})">${themedIcon(STOCK_ICONS.zap, zapX, cy - 17 * k, 34 * k, lighten(glow, 0.3), 2.4)}</g>`
        : iconGroup(STOCK_ICONS.zap, zapX, cy - 17 * k, 34 * k, "rgba(255,255,255,0.35)", { strokeWidth: 2.2 * iconWK })) : "");
      return inject(shell.replace("<svg ", '<svg data-streakmeter="1" '), inner);
    }
    case "waypoint": {
      /* Shooter · objective waypoint — diamond marker + distance readout;
         spatial UI. EDITING CONTRACT: label = the objective letter;
         value = distance; diamond follows the Glow role; type drives the
         letter; hover strengthens the pulse ring; disabled dims. */
      const WW = 170 * k, HW = 210 * k;
      const cxW = WW / 2, cyW = 78 * k;
      const sW = 40 * k;
      const dist = Math.round(20 + clamp(value ?? 0.3, 0, 1) * 400);
      const hotW = state === "hover" || state === "pressed";
      const gidW = "wp" + UID++;
      const inner = `<defs><linearGradient id="${gidW}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.4)}"/><stop offset="1" stop-color="${darken(glow, 0.2)}"/></linearGradient></defs>
        <rect x="${(cxW - sW / 2).toFixed(1)}" y="${(cyW - sW / 2).toFixed(1)}" width="${sW.toFixed(1)}" height="${sW.toFixed(1)}" rx="${(7 * k).toFixed(1)}" transform="rotate(45 ${cxW.toFixed(1)} ${cyW.toFixed(1)})" fill="url(#${gidW})" stroke="${darken(glow, 0.45)}" stroke-width="2"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${((hotW ? 10 : 6) * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>
        <rect x="${(cxW - sW / 2 - 8 * k).toFixed(1)}" y="${(cyW - sW / 2 - 8 * k).toFixed(1)}" width="${(sW + 16 * k).toFixed(1)}" height="${(sW + 16 * k).toFixed(1)}" rx="${(9 * k).toFixed(1)}" transform="rotate(45 ${cxW.toFixed(1)} ${cyW.toFixed(1)})" fill="none" stroke="${hexRgba(glow, hotW ? 0.8 : 0.45)}" stroke-width="${hotW ? 2.4 : 1.6}"/>` +
        contentText((opts.label ?? "A").slice(0, 1).toUpperCase(), cxW, cyW + 1, 26 * k * typeK, { anchor: "middle", keepCase: true, autoInk: "#FFFFFF" }) +
        hudText(`${dist}${["m","ft","km","mi"].includes(opts.slots?.unit ?? "") ? opts.slots!.unit : "m"}`, cxW, cyW + sW * 0.9 + 26 * k, 21 * k, "middle");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WW.toFixed(0)}" height="${HW.toFixed(0)}" viewBox="0 0 ${WW.toFixed(0)} ${HW.toFixed(0)}" data-waypoint="1" role="img" aria-label="waypoint ${dist} meters"><g opacity="${state === "disabled" ? 0.4 : 1}">${inner}</g></svg>`;
    }
    case "capturemeter": {
      /* Shooter · capture-point meter — the letter ringed by capture
         progress. EDITING CONTRACT: label = point letter; value = capture
         share; ring follows Glow, core follows Inner Fill; type drives
         the letter; hover strengthens the glow; disabled dims. */
      const dCp = ({ s: 108, m: 138, l: 172 } as Record<KitSize, number>)[size] * k;
      const padCp = 24;
      const cCp = dCp / 2 + padCp, rCp = dCp / 2 - 6;
      const ringWc = Math.max(7, dCp * 0.09);
      const vC9 = clamp(value ?? 0.55, 0, 1);
      const circC = 2 * Math.PI * rCp;
      const gidC0 = "cpm" + UID++;
      const hotC9 = state === "hover" || state === "pressed";
      const totalC = dCp + padCp * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalC}" height="${totalC}" viewBox="0 0 ${totalC} ${totalC}" data-capturemeter="1" role="img" aria-label="capture ${Math.round(vC9 * 100)}%">
<defs><linearGradient id="${gidC0}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.35)}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
<radialGradient id="${gidC0}c" cx="0.5" cy="0.42" r="0.85"><stop offset="0" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.6)}"/><stop offset="1" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.85)}"/></radialGradient></defs>
<g opacity="${state === "disabled" ? 0.4 : 1}">
  <circle cx="${cCp}" cy="${cCp}" r="${(rCp - ringWc - 3).toFixed(1)}" fill="url(#${gidC0}c)"/>
  <circle cx="${cCp}" cy="${cCp}" r="${rCp.toFixed(1)}" fill="none" stroke="${wellFill}" stroke-width="${ringWc.toFixed(1)}"/>
  ${vC9 > 0.01 ? `<circle cx="${cCp}" cy="${cCp}" r="${rCp.toFixed(1)}" fill="none" stroke="url(#${gidC0})" stroke-width="${ringWc.toFixed(1)}" stroke-linecap="round" stroke-dasharray="${(circC * vC9).toFixed(1)} ${circC.toFixed(1)}" transform="rotate(-90 ${cCp} ${cCp})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${((hotC9 ? 8 : 5) * k).toFixed(1)}px ${hexRgba(glow, 0.65)})"` : ""}/>` : ""}
  ${contentText((opts.label ?? "B").slice(0, 1).toUpperCase(), cCp, cCp + 1, dCp * 0.34, { anchor: "middle", keepCase: true, autoInk: "#FFFFFF" })}
</g>
</svg>`;
    }
    case "respawn": {
      /* Shooter · respawn timer — a LIVE countdown: value drains linearly
         (click replays; ambient loops it on the kit page), the readout and
         bar warm toward READY GREEN over the last stretch, and at zero the
         piece celebrates — "GO" with a soft expanding pulse.
         EDITING CONTRACT: label = the heading; value = time remaining;
         seconds default to AUTO ink (themedText re-themes); bar follows
         Glow, blending to the semantic ready-green. */
      const w = 340 * k, h = 168 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const cxR9 = 39 + w / 2;
      const vR9 = clamp(value ?? 0.6, 0, 1);
      const done = vR9 <= 0.015;
      const secsR = Math.ceil(vR9 * 10);
      const READY = "#4ADE80";
      // warm toward green across the final 40% of the wait
      const gMix = clamp((0.4 - vR9) / 0.4, 0, 1);
      const inkR = done ? READY : hexMix("#FFFFFF", READY, gMix * 0.85);
      const barC = hexMix(glow, READY, gMix);
      const barW9 = w - inset * 2 - 40 * k, barH9 = 12 * k;
      const barX9 = cxR9 - barW9 / 2, barY9 = 30 + h - inset - 24 * k;
      const gidR9 = "rs" + UID++;
      const gR9 = 2.5 * k, mHR9 = barH9 - gR9 * 2;
      const secCy = 30 + inset + 74 * k;
      /* the big readout wears the THEME'S text armor automatically: the
         preset's outline (or a derived dark stroke) plus its shadow recipe,
         so the ramping ink stays legible on any face */
      const T9 = cfg.type;
      const strokeC9 = T9.outline.on ? T9.outline.color : darken(bevel, 0.55);
      const strokeW9 = (T9.outline.on ? Math.max(2, T9.outline.width) : 2.6) * k;
      const shFx9 = T9.shadow.on
        ? `drop-shadow(${(T9.shadow.x * 0.6).toFixed(1)}px ${(T9.shadow.y * 0.6).toFixed(1)}px ${(T9.shadow.blur * 0.4).toFixed(1)}px ${hexRgba(T9.shadow.color, T9.shadow.opacity / 100)})`
        : `drop-shadow(0 ${(2 * k).toFixed(1)}px ${(2 * k).toFixed(1)}px rgba(6,10,18,0.55))`;
      const bigNum = (txt9: string, fill9: string, fs9: number, glowFx9 = "") =>
        `<g style="filter: ${shFx9}${glowFx9}"><text x="${cxR9.toFixed(1)}" y="${secCy.toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${fs9.toFixed(1)}" font-weight="${Math.max(800, T9.weight)}"${T9.italic ? ' font-style="italic"' : ""} fill="${fill9}" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: ${strokeC9}; stroke-width: ${strokeW9.toFixed(1)}px; stroke-linejoin: round">${esc(txt9)}</text></g>`;
      const secsTxt = done
        ? bigNum("GO", READY, 54 * k, state !== "disabled" ? ` drop-shadow(0 0 ${(8 * k).toFixed(1)}px ${hexRgba(READY, 0.8)})` : "") +
          (state !== "disabled"
            ? `<circle cx="${cxR9.toFixed(1)}" cy="${secCy.toFixed(1)}" r="${(30 * k).toFixed(1)}" fill="none" stroke="${READY}" stroke-width="2">
                 <animate attributeName="r" values="${(30 * k).toFixed(1)};${(58 * k).toFixed(1)}" dur="1.3s" repeatCount="indefinite"/>
                 <animate attributeName="stroke-opacity" values="0.7;0" dur="1.3s" repeatCount="indefinite"/>
               </circle>`
            : "")
        : opts.themedText
          ? contentText(String(secsR), cxR9, secCy, 58 * k * typeK, { anchor: "middle", keepCase: true, autoInk: inkR })
          : bigNum(String(secsR), inkR, 58 * k, gMix > 0.3 && state !== "disabled" ? ` drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(READY, 0.5 * gMix)})` : "");
      const inner = contentText(done ? "REDEPLOY" : (opts.label ?? "RESPAWN IN"), cxR9, 30 + inset + 20 * k, 19 * k * typeK, { anchor: "middle" }) +
        secsTxt +
        `<rect x="${barX9.toFixed(1)}" y="${barY9.toFixed(1)}" width="${barW9.toFixed(1)}" height="${barH9.toFixed(1)}" rx="${(barH9 / 2).toFixed(1)}" fill="${wellFill}"/>` +
        `<defs><linearGradient id="${gidR9}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(barC, 0.45)}"/><stop offset="1" stop-color="${darken(barC, 0.25)}"/></linearGradient></defs>` +
        ((done ? 1 : vR9) > 0.03 ? `<rect x="${(barX9 + gR9).toFixed(1)}" y="${(barY9 + gR9).toFixed(1)}" width="${Math.max(0, (barW9 - gR9 * 2) * (done ? 1 : vR9)).toFixed(1)}" height="${mHR9.toFixed(1)}" rx="${(mHR9 / 2).toFixed(1)}" fill="url(#${gidR9})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(barC, 0.6)})"` : ""}/>` : "");
      return inject(shell.replace("<svg ", '<svg data-respawn="1" '), inner);
    }
    case "dmgarc": {
      /* Shooter · damage-direction arc — the crescent that says WHERE it
         came from; sits around the reticle on live footage. EDITING
         CONTRACT: value = threat direction (0..1 → 360°); the alarm red is
         semantic (like rarity hues); disabled dims. */
      const dA = 260 * k, cA = dA / 2;
      const rA = dA * 0.36, wA = dA * 0.085;
      const ang = clamp(value ?? 0, 0, 1) * 360 - 90;
      const gidA9 = "da" + UID++;
      const a1A = (-38) * Math.PI / 180, a2A = (38) * Math.PI / 180;
      const rOut = rA + wA / 2, rIn = rA - wA / 2;
      const arc = `M ${(cA + rOut * Math.cos(a1A)).toFixed(1)} ${(cA + rOut * Math.sin(a1A)).toFixed(1)} A ${rOut.toFixed(1)} ${rOut.toFixed(1)} 0 0 1 ${(cA + rOut * Math.cos(a2A)).toFixed(1)} ${(cA + rOut * Math.sin(a2A)).toFixed(1)} L ${(cA + rIn * Math.cos(a2A)).toFixed(1)} ${(cA + rIn * Math.sin(a2A)).toFixed(1)} A ${rIn.toFixed(1)} ${rIn.toFixed(1)} 0 0 0 ${(cA + rIn * Math.cos(a1A)).toFixed(1)} ${(cA + rIn * Math.sin(a1A)).toFixed(1)} Z`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${dA.toFixed(0)}" height="${dA.toFixed(0)}" viewBox="0 0 ${dA.toFixed(0)} ${dA.toFixed(0)}" data-dmgarc="1" role="img" aria-label="damage direction">
<defs><radialGradient id="${gidA9}" cx="0.5" cy="0.5" r="0.5"><stop offset="0.62" stop-color="#FF3B4A" stop-opacity="0"/><stop offset="0.82" stop-color="#FF3B4A" stop-opacity="0.9"/><stop offset="1" stop-color="#FF3B4A" stop-opacity="0.2"/></radialGradient></defs>
<g opacity="${state === "disabled" ? 0.35 : 1}" transform="rotate(${(ang + 90).toFixed(1)} ${cA} ${cA})">
  <g transform="rotate(-90 ${cA} ${cA})"><path d="${arc}" fill="url(#${gidA9})" style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px rgba(255,59,74,0.6))"/></g>
</g>
<circle cx="${cA}" cy="${cA}" r="${(2.5 * k).toFixed(1)}" fill="rgba(255,255,255,0.5)"/>
</svg>`;
    }
    case "weaponwheel": {
      /* Shooter · weapon wheel — a real revolver cylinder: value is the
         CONTINUOUS rotation of the chamber ring; the chamber that lands at
         the top (the hammer position) is armed. In play mode, pointing at a
         chamber spins the cylinder until it stops there (LiveArt tweens the
         rotation via data-wheel). EDITING CONTRACT: value = rotation;
         label = the hub's item name; icon = the ARMED chamber's glyph
         (swappable); ring/core/pattern follow the theme roles; hover
         strengthens the armed chamber; disabled dims and stands still. */
      const dW = ({ s: 320, m: 400, l: 480 } as Record<KitSize, number>)[size] * k;
      const padW = 84; // room for the armed chamber's name tag
      const cW = dW / 2 + padW;
      const rimR = dW / 2, rimW9 = Math.max(10, dW * 0.045);
      const orbitR = dW * 0.335, chamberR = dW * 0.115, hubR = dW * 0.16;
      const gidW9 = "ww" + UID++;
      const chambers: { ic?: IconDef; nm: string }[] = [
        { ic: STOCK_ICONS.sword, nm: (opts.slots?.w1 ?? "BLADE").slice(0, 10) },
        { ic: STOCK_ICONS.zap, nm: (opts.slots?.w2 ?? "VOLT").slice(0, 10) },
        { ic: STOCK_ICONS.flask, nm: (opts.slots?.w3 ?? "TONIC").slice(0, 10) },
        { ic: STOCK_ICONS.shield, nm: (opts.slots?.w4 ?? "AEGIS").slice(0, 10) },
        { ic: STOCK_ICONS.key, nm: (opts.slots?.w5 ?? "PICK").slice(0, 10) },
        { ic: STOCK_ICONS.gem, nm: (opts.slots?.w6 ?? "PRISM").slice(0, 10) },
      ];
      const nW = chambers.length;
      const vW = ((clamp(value ?? 0, -1, 2) % 1) + 1) % 1; // rotation, 0..1 turn cw
      /* the hammer sits at 2 O'CLOCK — the armed chamber resolves there,
         magnified, on the TOPMOST layer (over the rim, under nothing) */
      const hamA = -Math.PI / 2 + Math.PI / 3;
      const armedW = ((1 - Math.round(vW * nW)) % nW + nW) % nW;
      const hotW9 = state === "hover" || state === "pressed";
      const live9 = state !== "disabled";
      const dim = live9 ? 1 : 0.4;
      const innerR = rimR - rimW9;
      const wSpan = Math.PI / nW;
      let inner = "";
      // fixed hammer wedge at 2 o'clock — the arming position
      inner += `<path d="M ${cW} ${cW} L ${(cW + innerR * Math.cos(hamA - wSpan)).toFixed(1)} ${(cW + innerR * Math.sin(hamA - wSpan)).toFixed(1)} A ${innerR.toFixed(1)} ${innerR.toFixed(1)} 0 0 1 ${(cW + innerR * Math.cos(hamA + wSpan)).toFixed(1)} ${(cW + innerR * Math.sin(hamA + wSpan)).toFixed(1)} Z" fill="url(#${gidW9}w)"/>`;
      // the cylinder: flute lines + QUIET chamber sockets rotate with the
      // value (the armed chamber renders later, above everything)
      chambers.forEach((_, i) => {
        const aD = ((i + 0.5) / nW + vW) * Math.PI * 2 - Math.PI / 2;
        inner += `<line x1="${(cW + hubR * 1.18 * Math.cos(aD)).toFixed(1)}" y1="${(cW + hubR * 1.18 * Math.sin(aD)).toFixed(1)}" x2="${(cW + (innerR - 4) * Math.cos(aD)).toFixed(1)}" y2="${(cW + (innerR - 4) * Math.sin(aD)).toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
      });
      let armedSvg = "";
      chambers.forEach((ch, i) => {
        const aC = (i / nW + vW) * Math.PI * 2 - Math.PI / 2;
        const ccx9 = cW + orbitR * Math.cos(aC), ccy9 = cW + orbitR * Math.sin(aC);
        const on = i === armedW;
        const rr = chamberR * (on ? 1.34 : 1);
        if (on) {
          armedSvg = `<circle cx="${ccx9.toFixed(1)}" cy="${ccy9.toFixed(1)}" r="${(rr + 5 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.4)}" stroke-width="${(2 * k).toFixed(1)}">${live9 ? `<animate attributeName="stroke-opacity" values="0.55;0.15;0.55" dur="2.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/>` : ""}</circle>
            <circle cx="${ccx9.toFixed(1)}" cy="${ccy9.toFixed(1)}" r="${rr.toFixed(1)}" fill="${hexRgba(darken(effect(cfg.effects, "Inner Fill"), 0.5), 0.97)}" stroke="${hexRgba(glow, hotW9 ? 1 : 0.9)}" stroke-width="${hotW9 ? 3.6 : 2.8}"${live9 ? ` style="filter: drop-shadow(0 0 ${((hotW9 ? 12 : 8) * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>` +
            ((opts.icon ?? ch.ic) ? `<g${live9 ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(glow, 0.8)})"` : ""}>${themedIcon((opts.icon ?? ch.ic)!, ccx9 - rr * 0.5, ccy9 - rr * 0.5, rr, hexMix(glow, "#FFFFFF", 0.15), 2.4)}</g>` : "");
        } else {
          inner += `<circle cx="${ccx9.toFixed(1)}" cy="${ccy9.toFixed(1)}" r="${rr.toFixed(1)}" fill="${hexRgba(darken(effect(cfg.effects, "Inner Fill"), 0.72), 0.8)}" stroke="rgba(255,255,255,0.24)" stroke-width="1.5"/>` +
            (ch.ic ? iconGroup(ch.ic, ccx9 - rr * 0.46, ccy9 - rr * 0.46, rr * 0.92, "#AEB6C4", { strokeWidth: 2 * iconWK }) : "");
        }
      });
      // name tag fixed beside the hammer position, over the rim
      let tagSvg = "";
      {
        const rr = chamberR * 1.34;
        const ccx9 = cW + orbitR * Math.cos(hamA), ccy9 = cW + orbitR * Math.sin(hamA);
        const tagW = 92 * k, tagH = 34 * k;
        const tx0 = ccx9 + rr + 6 * k, ty9 = ccy9;
        tagSvg = `<g${live9 ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.5)})"` : ""}>
          <path d="M ${tx0.toFixed(1)} ${ty9.toFixed(1)} l ${9 * k} ${-tagH / 2} h ${tagW - 9 * k} v ${tagH} h ${-(tagW - 9 * k)} Z" fill="${hexRgba(darken(effect(cfg.effects, "Inner Fill"), 0.55), 0.96)}" stroke="${hexRgba(glow, 0.85)}" stroke-width="1.8"/>
          ${hudText(chambers[armedW].nm, tx0 + tagW / 2 + 4 * k, ty9 + 1, 16 * k, "middle", 900)}
        </g>`;
      }
      const hubNm = opts.label ?? chambers[armedW].nm;
      const totalW = dW + padW * 2;
      // rim comet — bright head chasing a fading tail, one slow orbit
      const cometArc = (a0: number, a1: number, op: number, w9: number) =>
        `<path d="M ${(cW + rimR * Math.cos(a0)).toFixed(1)} ${(cW + rimR * Math.sin(a0)).toFixed(1)} A ${rimR.toFixed(1)} ${rimR.toFixed(1)} 0 0 1 ${(cW + rimR * Math.cos(a1)).toFixed(1)} ${(cW + rimR * Math.sin(a1)).toFixed(1)}" fill="none" stroke="${lighten(glow, 0.35)}" stroke-width="${w9.toFixed(1)}" stroke-linecap="round" opacity="${op}"/>`;
      const sweepArc = live9
        ? `<g><animateTransform attributeName="transform" type="rotate" from="0 ${cW} ${cW}" to="360 ${cW} ${cW}" dur="8s" repeatCount="indefinite"/>${cometArc(-0.9, -0.35, 0.18, rimW9 * 0.45)}${cometArc(-0.35, -0.05, 0.55, rimW9 * 0.55)}</g>`
        : "";
      // theme pattern woven into the cylinder face
      const PT = cfg.candy.pattern;
      const patW = PT && PT.type !== "none" && PT.opacity > 1 ? (() => {
        const ps = Math.max(8, 8 + (PT.scale / 100) * 26);
        const pc = PT.color ? PT.color : lighten(bevel, 0.25);
        return `<pattern id="${gidW9}p" width="${ps.toFixed(1)}" height="${ps.toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${PT.angle ?? 0})">${textPatternCell(PT.type, ps, pc)}</pattern>`;
      })() : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW.toFixed(0)}" height="${totalW.toFixed(0)}" viewBox="0 0 ${totalW.toFixed(0)} ${totalW.toFixed(0)}" data-weaponwheel="1" data-wheel="${cW.toFixed(1)} ${cW.toFixed(1)}" role="img" aria-label="weapon wheel — ${hubNm}">
<defs>
  <linearGradient id="${gidW9}r" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${lighten(hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.35), 0.45)}"/>
    <stop offset="0.5" stop-color="${hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.25)}"/>
    <stop offset="1" stop-color="${darken(bevel, 0.32)}"/>
  </linearGradient>
  <radialGradient id="${gidW9}g" cx="0.5" cy="0.45" r="0.75">
    <stop offset="0" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.55)}" stop-opacity="0.94"/>
    <stop offset="1" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.85)}" stop-opacity="0.96"/>
  </radialGradient>
  <radialGradient id="${gidW9}w" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0.3" stop-color="${glow}" stop-opacity="0.04"/>
    <stop offset="1" stop-color="${glow}" stop-opacity="0.26"/>
  </radialGradient>
  <radialGradient id="${gidW9}h" cx="0.5" cy="0.38" r="0.9">
    <stop offset="0" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.45)}"/>
    <stop offset="1" stop-color="${darken(effect(cfg.effects, "Inner Fill"), 0.78)}"/>
  </radialGradient>
  ${patW}
</defs>
<g opacity="${dim}">
  <circle cx="${cW}" cy="${cW}" r="${(rimR - rimW9 / 2).toFixed(1)}" fill="url(#${gidW9}g)"/>
  ${patW ? `<circle cx="${cW}" cy="${cW}" r="${(innerR - 1).toFixed(1)}" fill="url(#${gidW9}p)" opacity="${((PT!.opacity / 100) * 0.4).toFixed(2)}"/>` : ""}
  ${inner}
  <circle cx="${cW}" cy="${cW}" r="${rimR.toFixed(1)}" fill="none" stroke="url(#${gidW9}r)" stroke-width="${rimW9.toFixed(1)}"${live9 ? ` style="filter: drop-shadow(0 0 ${(rimW9 * 0.7).toFixed(1)}px ${hexRgba(glow, 0.5)})"` : ""}/>
  ${sweepArc}
  <circle cx="${cW}" cy="${cW}" r="${(rimR - rimW9 - 0.6).toFixed(1)}" fill="none" stroke="${darken(bevel, 0.5)}" stroke-width="1" opacity="0.7"/>
  ${armedSvg}
  ${tagSvg}
  <circle cx="${cW}" cy="${cW}" r="${hubR.toFixed(1)}" fill="url(#${gidW9}h)" stroke="${hexRgba(glow, 0.45)}" stroke-width="1.8"/>
  <ellipse cx="${cW}" cy="${(cW - hubR * 0.5).toFixed(1)}" rx="${(hubR * 0.66).toFixed(1)}" ry="${(hubR * 0.26).toFixed(1)}" fill="#FFFFFF" opacity="0.08"/>
  ${contentText(hubNm, cW, cW - 8 * k, dW * 0.056, { anchor: "middle", keepCase: true })}
  <text x="${cW}" y="${(cW + hubR * 0.4).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(dW * 0.026).toFixed(1)}" font-weight="700" letter-spacing="0.18em" fill="rgba(255,255,255,0.45)" text-anchor="middle" dominant-baseline="central">${esc((opts.slots?.hint ?? "RELEASE TO EQUIP").slice(0, 24))}</text>
  <line x1="${(cW - hubR * 0.3).toFixed(1)}" y1="${(cW + hubR * 0.62).toFixed(1)}" x2="${(cW + hubR * 0.3).toFixed(1)}" y2="${(cW + hubR * 0.62).toFixed(1)}" stroke="${hexRgba(glow, 0.6)}" stroke-width="${(2 * k).toFixed(1)}"/>
</g>
</svg>`;
    }
    case "starrating": {
      /* Casual · star-rating result — the stars sit IN a themed pill
         (the frame is the theme, like the mock), on a dark instrument
         well so gold reads anywhere. Earned stars are candy GOLD (results
         semantic); unearned ones are sunken dark silhouettes. Full marks
         celebrates: gold flare over the top rim + a replay chip riding
         the bottom rim. EDITING CONTRACT: value = stars earned (0..1 →
         0..3); click on the kit page replays the pop-in (progress
         family); the shell edits like any pill; disabled dims and stands
         still. */
      const hS9 = 158 * k;
      const vS0 = clamp(value ?? 1, 0, 1);
      const earned = Math.round(vS0 * 3);
      const full = earned >= 3;
      const GOLD = "#FACC15";
      const shell = build(cfg, state, { x: 42, y: 33, h: hS9, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: 430 * k, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2, ccy = sy + sh / 2;
      const insS = bw + 9 * k;
      const wellH = sh - insS * 2;
      // dark instrument well — the legibility canon for data faces
      let inner = `<rect x="${(sx + insS).toFixed(1)}" y="${(sy + insS).toFixed(1)}" width="${(sw - insS * 2).toFixed(1)}" height="${wellH.toFixed(1)}" rx="${(wellH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.82)}" fill-opacity="0.96" stroke="rgba(255,255,255,0.07)" stroke-width="1.2"/>`;
      const gidS0 = "sr" + UID++;
      const starS = Math.min(104 * k, wellH * 0.9), gapS = starS + 12 * k;
      inner += `<defs><radialGradient id="${gidS0}" cx="0.38" cy="0.3" r="0.95"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.55" stop-color="${GOLD}"/><stop offset="1" stop-color="#B45309"/></radialGradient><radialGradient id="${gidS0}h"><stop offset="0" stop-color="${hexRgba(GOLD, 0.55)}"/><stop offset="1" stop-color="${hexRgba(GOLD, 0)}"/></radialGradient><clipPath id="${gidS0}c"><path d="${starPath(starS)}"/></clipPath></defs>`;
      for (let i = 0; i < 3; i++) {
        const on = i < earned;
        const g0x = ccx + (i - 1) * gapS - starS / 2, g0y = ccy - starS / 2;
        inner += `<g transform="translate(${g0x.toFixed(1)} ${g0y.toFixed(1)})"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(GOLD, 0.65)})"` : ""}>
          <path d="${starPath(starS)}" fill="${on ? `url(#${gidS0})` : "rgba(6,10,18,0.5)"}" stroke="${on ? "#92400E" : "rgba(255,255,255,0.16)"}" stroke-width="${(2.2 * k).toFixed(1)}" stroke-linejoin="round"/>
          ${on ? `<g clip-path="url(#${gidS0}c)"><ellipse cx="${(starS * 0.42).toFixed(1)}" cy="${(starS * 0.38).toFixed(1)}" rx="${(starS * 0.13).toFixed(1)}" ry="${(starS * 0.07).toFixed(1)}" fill="#FFFFFF" opacity="0.55"/></g>` : ""}
        </g>`;
      }
      if (full) {
        // the celebration — flare over the top rim + specks, breathing gently
        inner += `<ellipse cx="${(sx + sw * 0.38).toFixed(1)}" cy="${(sy + 2 * k).toFixed(1)}" rx="${(sw * 0.26).toFixed(1)}" ry="${(30 * k).toFixed(1)}" fill="url(#${gidS0}h)"${state !== "disabled" ? `><animate attributeName="opacity" values="0.75;1;0.75" dur="2.8s" repeatCount="indefinite"/></ellipse>` : "/>"}`;
        for (let i = 0; i < 4; i++) {
          const spx = sx + sw * (0.22 + i * 0.13), spy = sy + (i % 2 ? -6 : 4) * k;
          inner += `<circle cx="${spx.toFixed(1)}" cy="${spy.toFixed(1)}" r="${((i % 2 ? 2 : 2.8) * k).toFixed(1)}" fill="${GOLD}" opacity="0.85"/>`;
        }
        // the replay chip — straddles the bottom rim, dressed in Bevel
        const chR = 26 * k, chY = sy + sh - 2 * k;
        const gidS1 = "sr" + UID++;
        inner += `<g${state !== "disabled" ? ` style="filter: drop-shadow(0 2px 3px rgba(6,10,18,0.5))"` : ""}>
          <defs><linearGradient id="${gidS1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(bevel, 0.3)}"/><stop offset="1" stop-color="${darken(bevel, 0.2)}"/></linearGradient></defs>
          <circle cx="${ccx.toFixed(1)}" cy="${chY.toFixed(1)}" r="${chR.toFixed(1)}" fill="url(#${gidS1})" stroke="${lighten(bevel, 0.5)}" stroke-width="${(2.2 * k).toFixed(1)}"/>
          ${iconGroup(STOCK_ICONS.refresh, ccx - 13 * k, chY - 13 * k, 26 * k, "#FFFFFF", { strokeWidth: 2.6 * iconWK })}
        </g>`;
      }
      return inject(shell.replace("<svg ", `<svg data-starrating="1" `), inner);
    }
    case "levelnode": {
      /* Casual · level-map node — a real circular button wearing the level.
         EDITING CONTRACT: label = level number; overlay = "locked" |
         "stars:N" (completed — a candy-star fan over the node's foot,
         center star fronting) | default (current — pulses); build drives
         hover/pressed natively. */
      const s = 150 * k;
      const lvl9 = (opts.label ?? "12").slice(0, 3);
      const locked9 = opts.overlay === "locked";
      const starsM = /^stars:(\d)/.exec(opts.overlay ?? "");
      const shell = build(cfg, locked9 ? "disabled" : state, { x: 39, y: 30, h: s, fs: 54 * k, iconSize: 0 }, { label: locked9 ? "" : lvl9, iconDef: null, fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2, ccy = sy + sh / 2;
      let over = "";
      if (locked9) {
        const fcM = /url\(#([A-Za-z0-9_-]+)fc\)/.exec(shell);
        if (fcM) over += `<g clip-path="url(#${fcM[1]}fc)"><rect x="${(sx - 4).toFixed(1)}" y="${(sy - 4).toFixed(1)}" width="${(sw + 8).toFixed(1)}" height="${(sh + 8).toFixed(1)}" fill="rgba(6,8,16,0.45)"/></g>`;
        over += iconGroup(STOCK_ICONS.lock, ccx - 25 * k, ccy - 25 * k, 50 * k, "#A7AAB4", { strokeWidth: 2 * iconWK });
      } else if (starsM) {
        /* COMPLETED — a candy-star fan over the node's foot (the mock):
           center star biggest and in front, sides tilted outward, the
           aura is the theme's Glow role. Earned order: left, center,
           right. */
        const nSt = clamp(parseInt(starsM[1], 10), 0, 3);
        const GOLD = "#FACC15";
        const gidL = "ln" + UID++;
        const sideS = 50 * k, midS = 68 * k;
        over += `<defs><radialGradient id="${gidL}" cx="0.38" cy="0.3" r="0.95"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.55" stop-color="${GOLD}"/><stop offset="1" stop-color="#B45309"/></radialGradient><clipPath id="${gidL}cs"><path d="${starPath(sideS)}"/></clipPath><clipPath id="${gidL}cm"><path d="${starPath(midS)}"/></clipPath></defs>`;
        const mkStar = (idx: number, dx: number, dy: number, cell: number, rot: number, clip: string) => {
          const on = idx < nSt;
          const tx = ccx + dx - cell / 2, ty = sy + dy - cell / 2;
          return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)})${rot ? ` rotate(${rot} ${(cell / 2).toFixed(1)} ${(cell / 2).toFixed(1)})` : ""}"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(7 * k).toFixed(1)}px ${hexRgba(glow, 0.8)})"` : ""}>
            <path d="${starPath(cell)}" fill="${on ? `url(#${gidL})` : "rgba(10,14,22,0.5)"}" stroke="${on ? "#92400E" : "rgba(255,255,255,0.25)"}" stroke-width="${(1.8 * k).toFixed(1)}" stroke-linejoin="round"/>
            ${on ? `<g clip-path="url(#${gidL}${clip})"><ellipse cx="${(cell * 0.42).toFixed(1)}" cy="${(cell * 0.38).toFixed(1)}" rx="${(cell * 0.13).toFixed(1)}" ry="${(cell * 0.07).toFixed(1)}" fill="#FFFFFF" opacity="0.55"/></g>` : ""}
          </g>`;
        };
        // sides first, center last — the center star fronts the fan
        over += mkStar(0, -sw * 0.5, sh - 24 * k, sideS, -16, "cs") +
          mkStar(2, sw * 0.5, sh - 24 * k, sideS, 16, "cs") +
          mkStar(1, 0, sh - 2 * k, midS, 0, "cm");
        if (nSt > 0 && state !== "disabled") {
          // sparkle specks (round — never the four-point AI star)
          const spk: Array<[number, number, number]> = [[-sw * 0.66, sh - 56 * k, 2], [-sw * 0.3, sh + 4 * k, 1.6], [sw * 0.62, sh - 52 * k, 2.4], [sw * 0.28, sh + 8 * k, 1.5]];
          spk.forEach(([dxS, dyS, rS]) => {
            over += `<circle cx="${(ccx + dxS).toFixed(1)}" cy="${(sy + dyS).toFixed(1)}" r="${(rS * k).toFixed(1)}" fill="#FFFFFF" opacity="0.9"/>`;
          });
        }
      } else if (state !== "disabled") {
        // the CURRENT node calls the player — a soft breathing ring
        over += `<circle cx="${ccx.toFixed(1)}" cy="${ccy.toFixed(1)}" r="${(sw / 2 + 7 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.7)}" stroke-width="${(2.6 * k).toFixed(1)}"><animate attributeName="stroke-opacity" values="0.8;0.25;0.8" dur="2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/></circle>`;
      }
      return inject(shell.replace("<svg ", '<svg data-levelnode="1" '), over);
    }
    case "pathconnector": {
      /* Casual · level-map path — a dotted trail between nodes; beads light
         with progress. EDITING CONTRACT: value = progress along the path;
         lit beads follow the Glow role; disabled dims. */
      const WP9 = 340 * k, HP9 = 130 * k;
      const vP9 = clamp(value ?? 0.6, 0, 1);
      const nB = 9;
      // sampled S-curve (cubic bezier) — the classic saga trail
      const P0 = [16 * k, HP9 * 0.72], P1 = [WP9 * 0.38, HP9 * 0.05], P2 = [WP9 * 0.62, HP9 * 1.15], P3 = [WP9 - 16 * k, HP9 * 0.35];
      const bez = (t: number) => {
        const u = 1 - t;
        return [
          u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
          u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
        ];
      };
      let beads = "";
      for (let i = 0; i < nB; i++) {
        const [bx9, by9] = bez(i / (nB - 1));
        const on = i / (nB - 1) <= vP9;
        const r9 = (on ? 9 : 7) * k;
        beads += on
          ? `<circle cx="${bx9.toFixed(1)}" cy="${by9.toFixed(1)}" r="${r9.toFixed(1)}" fill="${glow}" stroke="${darken(glow, 0.4)}" stroke-width="1.4"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.65)})"` : ""}/><circle cx="${(bx9 - r9 * 0.3).toFixed(1)}" cy="${(by9 - r9 * 0.35).toFixed(1)}" r="${(r9 * 0.3).toFixed(1)}" fill="#FFFFFF" opacity="0.8"/>`
          : `<circle cx="${bx9.toFixed(1)}" cy="${by9.toFixed(1)}" r="${r9.toFixed(1)}" fill="rgba(120,128,148,0.35)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WP9.toFixed(0)}" height="${HP9.toFixed(0)}" viewBox="0 0 ${WP9.toFixed(0)} ${HP9.toFixed(0)}" data-pathconnector="1" role="img" aria-label="path progress"><g opacity="${state === "disabled" ? 0.45 : 1}">${beads}</g></svg>`;
    }
    case "heartmeter": {
      /* Casual · heart meter — lives WITH the refill economy: filled candy
         hearts, the next-heart timer, and the add knob. EDITING CONTRACT:
         value = hearts full (0..1 → 0..5); label = the timer text; hearts
         are semantic red; the shell takes states natively. */
      const w = 470 * k, h = 108 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 116 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const nH = 5;
      const fullH = Math.round(clamp(value ?? 0.6, 0, 1) * nH);
      const HEARTR = "#FF4D6D";
      const hs9 = 40 * k, gapH = 8 * k;
      const hx0 = 39 + inset + 14 * k;
      let hearts = "";
      for (let i = 0; i < nH; i++) {
        const hx = hx0 + i * (hs9 + gapH);
        const on = i < fullH;
        hearts += `<g transform="translate(${hx.toFixed(1)} ${(cy - hs9 / 2).toFixed(1)}) scale(${(hs9 / 24).toFixed(3)})"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(HEARTR, 0.6)})"` : ""}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="${on ? HEARTR : "rgba(120,128,148,0.3)"}" stroke="${on ? darken(HEARTR, 0.35) : "rgba(255,255,255,0.28)"}" stroke-width="1.6" stroke-linejoin="round"/>
          ${on ? `<ellipse cx="8" cy="7.4" rx="3" ry="1.8" fill="#FFFFFF" opacity="0.55"/>` : ""}
        </g>`;
      }
      const timer = infoText(opts.label ?? "NEXT +1 · 2:32", hx0 + nH * (hs9 + gapH) + 8 * k, cy + 1, 17 * k, "start", 700);
      const addX = 39 + w - inset - 26 * k;
      const add = candyKnob(addX, cy, 20 * k, knobC) +
        `<text x="${addX.toFixed(1)}" y="${(cy - 1.5 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(26 * k).toFixed(1)}" font-weight="900" fill="${darken(bevel, 0.55)}" text-anchor="middle" dominant-baseline="central">+</text>`;
      return inject(shell.replace("<svg ", '<svg data-heartmeter="1" '), hearts + timer + add);
    }
    case "booster": {
      /* Casual · booster button — a real circular button with the booster
         glyph and a count badge. EDITING CONTRACT: icon = the booster
         (swappable); value = count; build drives hover/pressed natively. */
      const s = 140 * k;
      const ic = opts.icon ?? STOCK_ICONS.zap;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 62 * k }, { iconDef: ic, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw] = shellM[1].split(" ").map(Number);
      const count = Math.max(0, Math.min(99, Math.round(clamp(value ?? 0.4, 0, 1) * 10)));
      const bcx = sx + sw - 10 * k, bcy = sy + 12 * k, br = 19 * k;
      const badge = count > 0
        ? `<g data-badge="1"><circle cx="${bcx.toFixed(1)}" cy="${bcy.toFixed(1)}" r="${br.toFixed(1)}" fill="${bevel}" stroke="rgba(255,255,255,0.9)" stroke-width="${(2.6 * k).toFixed(1)}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(bevel, 0.6)})"` : ""}/>
          <text x="${bcx.toFixed(1)}" y="${(bcy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(22 * k).toFixed(1)}" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${count}</text></g>`
        : `<g data-badge="1"><rect x="${(bcx - 34 * k).toFixed(1)}" y="${(bcy - 12 * k).toFixed(1)}" width="${(52 * k).toFixed(1)}" height="${(24 * k).toFixed(1)}" rx="${(12 * k).toFixed(1)}" fill="#FACC15" stroke="#92400E" stroke-width="1.4"/>
          <text x="${(bcx - 8 * k).toFixed(1)}" y="${(bcy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(14 * k).toFixed(1)}" font-weight="900" letter-spacing="0.06em" fill="#7C2D12" text-anchor="middle" dominant-baseline="central">FREE</text></g>`;
      return inject(shell.replace("<svg ", '<svg data-booster="1" '), badge);
    }
    case "spinwheel": {
      /* Casual · spin wheel — the fortune wheel, like the mock: paired
         GOLD jackpot wedges opposite each other (gold = jackpot
         semantic), pale/deep blue wedges between, each seamed, glossed
         and carrying a glyph; all-lit rim bulbs; big candy hub with a
         collar; the pointer nests into the rim. EDITING CONTRACT: value
         = the wheel's ROTATION (rest pose centers a gold wedge under the
         pointer) — clicking on the kit page throws a multi-turn spin
         (LiveArt tween); tints/rim follow the theme roles; disabled
         stands still. */
      const dS = ({ s: 300, m: 380, l: 460 } as Record<KitSize, number>)[size] * k;
      const padS = 40;
      const cS = dS / 2 + padS, rS = dS / 2;
      const rimWs = Math.max(12, dS * 0.055);
      const wedgeR = rS - rimWs;
      const gidSW = "sw" + UID++;
      // at rest a GOLD wedge sits centered under the pointer (the mock);
      // LiveArt's throw lands on wedge centers too (+0.5/8 offsets)
      const vSW = ((clamp(value ?? 0.0625, -8, 8) % 1) + 1) % 1;
      const rot = vSW * 360;
      const nWg = 8;
      const GOLD9 = "#FACC15";
      // paired jackpot wedges opposite each other; pale/deep blues between
      const tintOf = (i: number) => (i % 4 === 3 ? GOLD9 : i % 4 === 1 ? hexMix(bevel, glow, 0.55) : lighten(bevel, 0.5));
      const glyphs = [STOCK_ICONS.star, STOCK_ICONS.gem, STOCK_ICONS.zap, STOCK_ICONS.gift];
      let wedges = "";
      for (let i = 0; i < nWg; i++) {
        const a0 = (i / nWg) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / nWg) * Math.PI * 2 - Math.PI / 2;
        const tint = tintOf(i);
        wedges += `<path d="M ${cS} ${cS} L ${(cS + wedgeR * Math.cos(a0)).toFixed(1)} ${(cS + wedgeR * Math.sin(a0)).toFixed(1)} A ${wedgeR.toFixed(1)} ${wedgeR.toFixed(1)} 0 0 1 ${(cS + wedgeR * Math.cos(a1)).toFixed(1)} ${(cS + wedgeR * Math.sin(a1)).toFixed(1)} Z" fill="${tint}" stroke="${darken(bevel, 0.5)}" stroke-width="${(3 * k).toFixed(1)}" stroke-linejoin="round"/>`;
        // per-wedge gloss — a light arc riding the outer edge
        const gA = 0.07;
        wedges += `<path d="M ${(cS + (wedgeR - 5 * k) * Math.cos(a0 + gA)).toFixed(1)} ${(cS + (wedgeR - 5 * k) * Math.sin(a0 + gA)).toFixed(1)} A ${(wedgeR - 5 * k).toFixed(1)} ${(wedgeR - 5 * k).toFixed(1)} 0 0 1 ${(cS + (wedgeR - 5 * k) * Math.cos(a1 - gA)).toFixed(1)} ${(cS + (wedgeR - 5 * k) * Math.sin(a1 - gA)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linecap="round"/>`;
        const am = (a0 + a1) / 2;
        const gx = cS + wedgeR * 0.64 * Math.cos(am), gy = cS + wedgeR * 0.64 * Math.sin(am);
        const gly = glyphs[i % 4];
        if (gly) wedges += `<g transform="rotate(${((am + Math.PI / 2) * 180 / Math.PI).toFixed(1)} ${gx.toFixed(1)} ${gy.toFixed(1)})">${iconGroup(gly, gx - 16 * k, gy - 16 * k, 32 * k, darken(tint, 0.55), { strokeWidth: 2.2 * iconWK })}</g>`;
      }
      // rim bulbs at wedge boundaries — all lit, glowing the theme's Glow
      let bulbs = "";
      for (let i = 0; i < nWg; i++) {
        const aB = (i / nWg) * Math.PI * 2 - Math.PI / 2;
        const bx9 = cS + (rS - rimWs / 2) * Math.cos(aB), by9 = cS + (rS - rimWs / 2) * Math.sin(aB);
        bulbs += `<circle cx="${bx9.toFixed(1)}" cy="${by9.toFixed(1)}" r="${(rimWs * 0.3).toFixed(1)}" fill="#FFFFFF"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 4px ${hexRgba(glow, 0.9)})"` : ""}/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${(dS + padS * 2).toFixed(0)}" height="${(dS + padS * 2).toFixed(0)}" viewBox="0 0 ${(dS + padS * 2).toFixed(0)} ${(dS + padS * 2).toFixed(0)}" data-spinwheel="1" role="img" aria-label="spin wheel">
<defs><linearGradient id="${gidSW}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(hexMix(bevel, glow, 0.45), 0.4)}"/><stop offset="0.5" stop-color="${hexMix(bevel, glow, 0.3)}"/><stop offset="1" stop-color="${darken(bevel, 0.3)}"/></linearGradient><linearGradient id="${gidSW}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(knobC, 0.35)}"/><stop offset="1" stop-color="${darken(knobC, 0.12)}"/></linearGradient></defs>
<g opacity="${state === "disabled" ? 0.45 : 1}">
  <g transform="rotate(${rot.toFixed(2)} ${cS} ${cS})">${wedges}</g>
  <circle cx="${cS}" cy="${cS}" r="${(rS - rimWs / 2).toFixed(1)}" fill="none" stroke="url(#${gidSW}r)" stroke-width="${rimWs.toFixed(1)}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(rimWs * 0.7).toFixed(1)}px ${hexRgba(glow, 0.55)})"` : ""}/>
  ${bulbs}
  <circle cx="${cS}" cy="${cS}" r="${(dS * 0.15).toFixed(1)}" fill="url(#${gidSW}r)" stroke="${darken(bevel, 0.4)}" stroke-width="1.4"/>
  ${candyKnob(cS, cS, dS * 0.115, knobC)}
  <path d="M ${(cS - 16 * k).toFixed(1)} ${(padS - 10 * k).toFixed(1)} h ${(32 * k).toFixed(1)} L ${cS.toFixed(1)} ${(padS + rimWs + 16 * k).toFixed(1)} Z" fill="url(#${gidSW}p)" stroke="${darken(knobC, 0.45)}" stroke-width="${(3 * k).toFixed(1)}" stroke-linejoin="round"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(glow, 0.6)})"` : ""}/>
</g>
</svg>`;
    }
    case "dailycell": {
      /* Casual · daily reward cell — one day of the calendar. EDITING
         CONTRACT: label = the day; icon = the reward glyph (swappable);
         overlay = "check" (claimed, dim) | "locked" (future) | default
         (today — glow ring); build drives states natively. */
      const s = 148 * k;
      const claimed = opts.overlay === "check";
      const locked9 = opts.overlay === "locked";
      const shell = build(cfg, claimed || locked9 ? "disabled" : state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2;
      const ic = opts.icon ?? STOCK_ICONS.gift;
      let over = infoText(opts.label ?? "DAY 4", ccx, sy + 22 * k, 15 * k, "middle", 800) +
        (ic ? (claimed || locked9
          ? iconGroup(ic, ccx - 27 * k, sy + sh / 2 - 22 * k, 54 * k, "#A7AAB4", { strokeWidth: 2 * iconWK })
          : themedIcon(ic, ccx - 27 * k, sy + sh / 2 - 22 * k, 54 * k, hexMix(glow, "#FFFFFF", 0.25), 2.2)) : "");
      if (claimed) {
        over += `<circle cx="${(sx + sw - 12 * k).toFixed(1)}" cy="${(sy + 12 * k).toFixed(1)}" r="${(15 * k).toFixed(1)}" fill="#4ADE80" stroke="rgba(255,255,255,0.9)" stroke-width="2"/>` +
          iconGroup(STOCK_ICONS.check, sx + sw - 21 * k, sy + 3 * k, 18 * k, "#0B3B21", { strokeWidth: 3.4 * iconWK });
      } else if (locked9) {
        over += iconGroup(STOCK_ICONS.lock, ccx - 12 * k, sy + sh - 30 * k, 24 * k, "#A7AAB4", { strokeWidth: 2.2 * iconWK });
      } else if (state !== "disabled") {
        over += `<rect x="${(sx - 5 * k).toFixed(1)}" y="${(sy - 5 * k).toFixed(1)}" width="${(sw + 10 * k).toFixed(1)}" height="${(sh + 10 * k).toFixed(1)}" rx="${(16 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.85)}" stroke-width="${(2.6 * k).toFixed(1)}" style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(glow, 0.55)})"><animate attributeName="stroke-opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/></rect>`;
      }
      return inject(shell.replace("<svg ", '<svg data-dailycell="1" '), over);
    }
    case "combo": {
      /* Casual · combo burst — the big celebration numeral, like the mock:
         an extruded multiplier lit by the theme's GLOW role (blue theme →
         electric blue), a needle-and-spark burst behind it, and a COMBO!
         plate below. All color derives from the theme (Glow for light,
         Bevel for armor/plate) so it re-skins automatically. EDITING
         CONTRACT: value = magnitude (scales the numeral and the burst —
         x4 vs x9 BIG combo); label = the multiplier text; sub (the panel's
         second text field) or overlay = the plate word (defaults COMBO!);
         disabled dims and stands still. */
      const vC0 = clamp(value ?? 0.4, 0, 1);
      const mult = opts.label ?? `×${2 + Math.round(vC0 * 8)}`;
      const plateWord = opts.sub ?? (opts.overlay && !/^(locked|stars:\d)/.test(opts.overlay) ? opts.overlay : "COMBO!");
      const WC = 380 * k, HC = 288 * k;
      const cxC0 = WC / 2, cyC0 = HC * 0.44;
      const fsC = (66 + vC0 * 44) * k * typeK;
      const gidC9 = "cb" + UID++;
      const liteC = hexMix(glow, "#FFFFFF", 0.8), armorC = darken(bevel, 0.62);
      // the burst — needles + sparks on golden-angle spokes, scaled by value
      let burst = "";
      const nR9 = 10 + Math.round(vC0 * 8);
      for (let i = 0; i < nR9; i++) {
        const aR = ((i * 137.5 + 12) % 360) * (Math.PI / 180);
        const jig = 0.75 + ((i * 53) % 7) / 10;
        const r1 = fsC * (0.62 + (i % 3) * 0.1), r2 = r1 + (22 + vC0 * 36) * k * jig;
        burst += `<line x1="${(cxC0 + r1 * Math.cos(aR)).toFixed(1)}" y1="${(cyC0 + r1 * Math.sin(aR) * 0.78).toFixed(1)}" x2="${(cxC0 + r2 * Math.cos(aR)).toFixed(1)}" y2="${(cyC0 + r2 * Math.sin(aR) * 0.78).toFixed(1)}" stroke="${hexRgba(hexMix(glow, "#FFFFFF", 0.35), 0.8)}" stroke-width="${((i % 3 ? 2.2 : 4) * k).toFixed(1)}" stroke-linecap="round"/>`;
        if (i % 2 === 0) burst += `<circle cx="${(cxC0 + (r2 + 9 * k) * Math.cos(aR)).toFixed(1)}" cy="${(cyC0 + (r2 + 9 * k) * Math.sin(aR) * 0.78).toFixed(1)}" r="${((1.6 + ((i * 31) % 3)) * k).toFixed(1)}" fill="${hexRgba(hexMix(glow, "#FFFFFF", 0.6), 0.9)}"/>`;
      }
      const shimmer = state !== "disabled" ? `<animate attributeName="opacity" values="0.75;1;0.75" dur="2.2s" repeatCount="indefinite"/>` : "";
      // the numeral — extruded copies behind, gradient face, dark armor
      const numAttrs = `font-family="'${font}', Inter, sans-serif" font-size="${fsC.toFixed(1)}" font-weight="900" font-style="italic" text-anchor="middle" dominant-baseline="central"`;
      const numeral = `<g transform="rotate(-4 ${cxC0.toFixed(1)} ${cyC0.toFixed(1)})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(9 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}>
  <text x="${(cxC0 + 5 * k).toFixed(1)}" y="${(cyC0 + 6 * k).toFixed(1)}" ${numAttrs} fill="${darken(glow, 0.55)}" style="paint-order: stroke; stroke: ${armorC}; stroke-width: ${(4 * k).toFixed(1)}px; stroke-linejoin: round">${esc(mult)}</text>
  <text x="${(cxC0 + 2.5 * k).toFixed(1)}" y="${(cyC0 + 3 * k).toFixed(1)}" ${numAttrs} fill="${darken(glow, 0.3)}">${esc(mult)}</text>
  <text x="${cxC0.toFixed(1)}" y="${cyC0.toFixed(1)}" ${numAttrs} fill="url(#${gidC9})" style="paint-order: stroke; stroke: ${armorC}; stroke-width: ${(2 * k).toFixed(1)}px; stroke-linejoin: round">${esc(mult)}</text>
</g>`;
      // the COMBO! plate — chamfered corners, dark well fill, glow trim
      const pW = (96 + plateWord.length * 15) * k, pH = 46 * k, ch9 = 9 * k;
      const pcy = cyC0 + fsC * 0.72 + 30 * k;
      const plate = `<g transform="rotate(-3 ${cxC0.toFixed(1)} ${pcy.toFixed(1)})"${state !== "disabled" ? ` style="filter: drop-shadow(0 2px 4px rgba(6,10,18,0.5))"` : ""}>
  <path d="M ${(cxC0 - pW / 2 + ch9).toFixed(1)} ${(pcy - pH / 2).toFixed(1)} h ${(pW - ch9 * 2).toFixed(1)} l ${ch9.toFixed(1)} ${ch9.toFixed(1)} v ${(pH - ch9 * 2).toFixed(1)} l ${(-ch9).toFixed(1)} ${ch9.toFixed(1)} h ${(-(pW - ch9 * 2)).toFixed(1)} l ${(-ch9).toFixed(1)} ${(-ch9).toFixed(1)} v ${(-(pH - ch9 * 2)).toFixed(1)} Z" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.78)}" stroke="${hexMix(glow, "#FFFFFF", 0.4)}" stroke-width="${(2 * k).toFixed(1)}" stroke-linejoin="round"/>
  <text x="${cxC0.toFixed(1)}" y="${(pcy + 0.5).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(21 * k).toFixed(1)}" font-weight="900" font-style="italic" letter-spacing="0.1em" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: rgba(8,12,22,0.55); stroke-width: ${(2.4 * k).toFixed(1)}px; stroke-linejoin: round">${esc(plateWord)}</text>
</g>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${WC.toFixed(0)}" height="${HC.toFixed(0)}" viewBox="0 0 ${WC.toFixed(0)} ${HC.toFixed(0)}" data-combo="1" role="img" aria-label="combo ${mult}">
<defs><linearGradient id="${gidC9}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hexMix(glow, "#FFFFFF", 0.92)}"/><stop offset="0.45" stop-color="${liteC}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>
<g opacity="${state === "disabled" ? 0.45 : 1}">
  <g>${shimmer}${burst}</g>
  ${numeral}
  ${plate}
</g>
</svg>`;
    }
    case "movecounter": {
      /* Casual · move counter — the match-3 corner tile. EDITING CONTRACT:
         value = moves left (0..1 → 0..30); ≤5 goes alarm red and pulses;
         the seconds follow the AUTO-ink instrument contract (themedText
         re-themes). */
      const s = 150 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h: s, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2;
      const moves = Math.round(clamp(value ?? 0.8, 0, 1) * 30);
      const low = moves <= 5;
      const ALARM = "#FF4D5A";
      const inkM = low ? ALARM : cfg.face.mode === "dark" ? "#FFFFFF" : darken(effect(cfg.effects, "Shadow"), 0.1);
      const armorM = cfg.type.outline.on ? cfg.type.outline.color : (cfg.face.mode === "dark" ? darken(bevel, 0.55) : "rgba(255,255,255,0.85)");
      const numY = sy + sh * 0.44;
      const pulse = low && state !== "disabled" ? `<animate attributeName="fill-opacity" values="1;0.5;1" dur="0.9s" repeatCount="indefinite"/>` : "";
      const num = opts.themedText
        ? contentText(String(moves), ccx, numY, 58 * k * typeK, { anchor: "middle", keepCase: true, autoInk: inkM })
        : `<text x="${ccx.toFixed(1)}" y="${numY.toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(58 * k).toFixed(1)}" font-weight="${Math.max(800, cfg.type.weight)}"${cfg.type.italic ? ' font-style="italic"' : ""} fill="${inkM}" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: ${armorM}; stroke-width: ${(2.4 * k).toFixed(1)}px; stroke-linejoin: round">${moves}${pulse}</text>`;
      const over = infoText((opts.slots?.caption ?? "MOVES").slice(0, 12), ccx, sy + sh - 20 * k, 15 * k, "middle", 800) + num;
      return inject(shell.replace("<svg ", '<svg data-movecounter="1" '), over);
    }
    case "orderticket": {
      /* Casual · kitchen order ticket — the cooking-game order rail card:
         punched hanger hole, order number + dish name, recipe lines in the
         READING face, and a countdown bar. EDITING CONTRACT: value = time
         left (1 fresh → 0 overdue; ≤25% goes alarm and pulses); label =
         the dish name; icon = the dish glyph (swappable); the ticket is a
         real button (hover lifts, pressed presses); disabled = SERVED
         (dim + stamp). First resident of the staging bay. */
      const w = 300 * k, h = 372 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const inset = bw + 8 * k;
      const dim = state === "disabled";
      const hole = `<circle cx="${(sx + sw / 2).toFixed(1)}" cy="${(sy + inset + 11 * k).toFixed(1)}" r="${(7 * k).toFixed(1)}" fill="${wellFill}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>`;
      const hx = sx + inset + 14 * k;
      const hy = sy + inset + 52 * k;
      // null = REMOVED (the Icons checkbox) — only undefined falls back to stock
      const icT = opts.icon !== undefined ? opts.icon : STOCK_ICONS.heart;
      const glyph = icT ? wellGlyph(icT, hx + 14 * k, hy - 1 * k, 28 * k, glow) : "";
      const dish = contentText((opts.label ?? "PANCAKE STACK").slice(0, 16), hx + (icT ? 38 * k : 0), hy, 22 * k * typeK, {});
      // the order number rides the hanger-hole row so it never crowds the dish
      const num = infoText((opts.slots?.num ?? "#07").slice(0, 5), sx + sw - inset - 12 * k, sy + inset + 15 * k, 16 * k, "end", 800);
      const py = hy + 24 * k;
      const perf = `<line x1="${(sx + inset + 8 * k).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(sx + sw - inset - 8 * k).toFixed(1)}" y2="${py.toFixed(1)}" stroke="rgba(255,255,255,0.28)" stroke-width="${(1.6 * k).toFixed(1)}" stroke-dasharray="${(6 * k).toFixed(1)} ${(5 * k).toFixed(1)}"/>`;
      const recipe = [(opts.slots?.i1 ?? "Flour · eggs · milk").slice(0, 26), (opts.slots?.i2 ?? "Flip until golden").slice(0, 26), (opts.slots?.i3 ?? "Serve with syrup").slice(0, 26)];
      let linesT = "";
      recipe.forEach((t, i) => {
        const ly = py + 32 * k + i * 34 * k;
        linesT += `<circle cx="${(hx + 5 * k).toFixed(1)}" cy="${ly.toFixed(1)}" r="${(3.2 * k).toFixed(1)}" fill="${dim ? "rgba(255,255,255,0.3)" : glow}"/>` +
          contentText(t, hx + 18 * k, ly, 20 * k * typeK, { keepCase: true, list: true, opacity: dim ? 0.55 : 0.9 });
      });
      const vT = clamp(value ?? 0.62, 0, 1);
      const ALARM = "#FF4D5A";
      const late = vT <= 0.25 && !dim;
      const barC = late ? ALARM : glow;
      const bh2 = 22 * k;
      const bx = sx + inset + 10 * k, bw2 = sw - inset * 2 - 20 * k;
      const by = sy + sh - inset - bh2 - 12 * k;
      const gidT = "ot" + UID++;
      const pulseT = late ? `<animate attributeName="opacity" values="1;0.55;1" dur="0.9s" repeatCount="indefinite"/>` : "";
      const bar = `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw2.toFixed(1)}" height="${bh2.toFixed(1)}" rx="${(bh2 / 2).toFixed(1)}" fill="${wellFill}" opacity="0.9"/>` +
        (vT > 0.02 ? `<defs><linearGradient id="${gidT}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(barC, 0.4)}"/><stop offset="1" stop-color="${darken(barC, 0.2)}"/></linearGradient></defs>
          <rect x="${(bx + 2.5 * k).toFixed(1)}" y="${(by + 2.5 * k).toFixed(1)}" width="${((bw2 - 5 * k) * vT).toFixed(1)}" height="${(bh2 - 5 * k).toFixed(1)}" rx="${((bh2 - 5 * k) / 2).toFixed(1)}" fill="url(#${gidT})"${!dim ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(barC, 0.6)})"` : ""}>${pulseT}</rect>` : "");
      const secs = infoText(`${Math.ceil(vT * 90)}s`, sx + sw - inset - 12 * k, by - 13 * k, 15 * k, "end", 800) +
        infoText("TIME", bx + 2 * k, by - 13 * k, 13 * k, "start", 800);
      // served = done — the happy teal stamp, not the alarm
      const stampC = "#2DD4BF";
      const stamp = dim ? `<g transform="rotate(-14 ${(sx + sw / 2).toFixed(1)} ${(sy + sh * 0.56).toFixed(1)})" opacity="0.9">
        <rect x="${(sx + sw / 2 - 66 * k).toFixed(1)}" y="${(sy + sh * 0.56 - 21 * k).toFixed(1)}" width="${(132 * k).toFixed(1)}" height="${(42 * k).toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="none" stroke="${stampC}" stroke-width="${(3 * k).toFixed(1)}"/>
        <text x="${(sx + sw / 2).toFixed(1)}" y="${(sy + sh * 0.56).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(23 * k).toFixed(1)}" font-weight="900" letter-spacing="0.2em" fill="${stampC}" text-anchor="middle" dominant-baseline="central">SERVED</text></g>` : "";
      return inject(shell.replace("<svg ", '<svg data-orderticket="1" '), hole + glyph + dish + num + perf + linesT + bar + secs + stamp);
    }
    case "chest": {
      /* Rewards · treasure chest — the body wears the KIT material, the
         trim wears the tier accent. EDITING CONTRACT: tier slot =
         Wood(S)/Iron(M)/Gold(L)/Premium/Event; gate slot = Timed
         (countdown plate) / Locked (padlock, no timer) / Plain; value =
         unlock time left (1 just started → 0 READY: aura pulses, ticks
         radiate); hover lifts, pressed squashes; disabled = opened and
         empty. */
      const W9 = 250 * k, H9 = 252 * k;
      const tierN = String(opts.slots?.tier ?? "Gold");
      const accent = CHEST_TIERS[tierN] ?? CHEST_TIERS.Gold;
      const gate = String(opts.slots?.variant ?? "Timed");
      const vC = clamp(value ?? 0.62, 0, 1);
      const dimC = state === "disabled";
      const ready = !dimC && gate !== "Locked" && vC <= 0.02;
      const ladder = tierN === "Wood" ? 0.82 : tierN === "Iron" ? 0.92 : 1;
      const cw = 158 * k * ladder;
      const ccx = W9 / 2, ccy = 96 * k + (state === "pressed" ? 4 * k : 0);
      let inner = "";
      if (ready || state === "hover" || state === "pressed") {
        inner += `<circle cx="${ccx.toFixed(1)}" cy="${(ccy + cw * 0.12).toFixed(1)}" r="${(cw * (ready ? 0.8 : 0.68)).toFixed(1)}" fill="${hexRgba(glow, ready ? 0.16 : 0.09)}">${ready ? `<animate attributeName="opacity" values="1;0.55;1" dur="1.4s" repeatCount="indefinite"/>` : ""}</circle>`;
        if (ready) for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r1 = cw * 0.72, r2 = cw * 0.86;
          inner += `<line x1="${(ccx + Math.cos(a) * r1).toFixed(1)}" y1="${(ccy + cw * 0.12 + Math.sin(a) * r1).toFixed(1)}" x2="${(ccx + Math.cos(a) * r2).toFixed(1)}" y2="${(ccy + cw * 0.12 + Math.sin(a) * r2).toFixed(1)}" stroke="${glow}" stroke-width="${(3.4 * k).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;
        }
      }
      inner += chestArt(ccx, ccy, cw, bevel, accent, { open: dimC, lock: gate === "Locked" && !dimC, dim: dimC });
      // tier keepsakes: Premium wears gem studs, Event wears the star
      if (!dimC && tierN === "Premium" && STOCK_ICONS.gem) inner += themedIcon(STOCK_ICONS.gem, ccx - cw * 0.38, ccy - cw * 0.02, cw * 0.14, lighten(accent, 0.25), 2.2) + themedIcon(STOCK_ICONS.gem, ccx + cw * 0.24, ccy - cw * 0.02, cw * 0.14, lighten(accent, 0.25), 2.2);
      if (!dimC && tierN === "Event" && STOCK_ICONS.star) inner += themedIcon(STOCK_ICONS.star, ccx + cw * 0.26, ccy - cw * 0.46, cw * 0.18, lighten(accent, 0.3), 2.2);
      if (gate === "Timed" && !dimC) {
        const pw = 128 * k, ph = 34 * k, py = H9 - ph - 8 * k;
        const mins = Math.ceil(vC * 480);
        const label9 = ready ? "OPEN!" : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
        inner += `<rect x="${(ccx - pw / 2).toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(ph / 2).toFixed(1)}" fill="${wellFill}" opacity="0.92"/>` +
          (STOCK_ICONS.clock && !ready ? themedIcon(STOCK_ICONS.clock, ccx - pw / 2 + 9 * k, py + ph / 2 - 9 * k, 18 * k, "rgba(255,255,255,0.75)", 2) : "") +
          hudText(label9, ccx + (ready ? 0 : 9 * k), py + ph / 2 + 1, 17 * k, "middle");
      }
      if (dimC) inner += hudText("OPENED", ccx, H9 - 22 * k, 15 * k, "middle");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W9.toFixed(0)}" height="${H9.toFixed(0)}" viewBox="0 0 ${W9.toFixed(0)} ${H9.toFixed(0)}" data-chest="1" role="img" aria-label="${esc(tierN)} chest"><g opacity="${dimC ? 0.55 : 1}">${inner}</g></svg>`;
    }
    case "giftbox": {
      /* Rewards · gift box — candy-material box, ribbon and bow in the
         Glow role. EDITING CONTRACT: tag slot = Plain / Daily (banner) /
         Surprise (?) / Milestone (progress ring); value = readiness
         (at 100% the gift glows ready; Milestone's ring FILLS with it);
         real button; disabled = claimed (dim + check). */
      const W9 = 210 * k, H9 = 216 * k;
      const tag = String(opts.slots?.tag ?? "Plain");
      const vG = clamp(value ?? 0.62, 0, 1);
      const dimG = state === "disabled";
      const readyG = !dimG && vG >= 0.98;
      const gcx = W9 / 2, gcy = 118 * k + (state === "pressed" ? 4 * k : 0);
      const bw9 = 118 * k, bh9 = 92 * k;
      const gid = "gf" + UID++;
      const edge = darken(bevel, 0.5);
      let inner = "";
      if (readyG || state === "hover" || state === "pressed") {
        inner += `<circle cx="${gcx.toFixed(1)}" cy="${gcy.toFixed(1)}" r="${(bw9 * (readyG ? 0.95 : 0.82)).toFixed(1)}" fill="${hexRgba(glow, readyG ? 0.16 : 0.09)}">${readyG ? `<animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite"/>` : ""}</circle>`;
      }
      if (tag === "Milestone") {
        const rM = bw9 * 0.92;
        const circ = 2 * Math.PI * rM;
        inner += `<circle cx="${gcx.toFixed(1)}" cy="${gcy.toFixed(1)}" r="${rM.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="${(6 * k).toFixed(1)}"/>` +
          `<circle cx="${gcx.toFixed(1)}" cy="${gcy.toFixed(1)}" r="${rM.toFixed(1)}" fill="none" stroke="${glow}" stroke-width="${(6 * k).toFixed(1)}" stroke-linecap="round" stroke-dasharray="${(circ * vG).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${gcx.toFixed(1)} ${gcy.toFixed(1)})"${!dimG ? ` style="filter: drop-shadow(0 0 4px ${hexRgba(glow, 0.5)})"` : ""}/>`;
      }
      inner += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(bevel, 0.25)}"/><stop offset="1" stop-color="${darken(bevel, 0.16)}"/></linearGradient></defs>` +
        `<ellipse cx="${gcx.toFixed(1)}" cy="${(gcy + bh9 / 2 + 6 * k).toFixed(1)}" rx="${(bw9 * 0.6).toFixed(1)}" ry="${(7 * k).toFixed(1)}" fill="rgba(4,7,14,0.4)"/>` +
        `<rect x="${(gcx - bw9 / 2).toFixed(1)}" y="${(gcy - bh9 / 2 + 12 * k).toFixed(1)}" width="${bw9.toFixed(1)}" height="${(bh9 - 12 * k).toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="url(#${gid})" stroke="${edge}" stroke-width="1.6"/>` +
        `<rect x="${(gcx - bw9 / 2 - 5 * k).toFixed(1)}" y="${(gcy - bh9 / 2 - 6 * k).toFixed(1)}" width="${(bw9 + 10 * k).toFixed(1)}" height="${(26 * k).toFixed(1)}" rx="${(8 * k).toFixed(1)}" fill="${lighten(bevel, 0.32)}" stroke="${edge}" stroke-width="1.6"/>` +
        `<rect x="${(gcx - 9 * k).toFixed(1)}" y="${(gcy - bh9 / 2 - 6 * k).toFixed(1)}" width="${(18 * k).toFixed(1)}" height="${(bh9 + 12 * k).toFixed(1)}" fill="${dimG ? "#8B8F99" : glow}" opacity="0.9"/>` +
        `<path d="M ${(gcx - 26 * k).toFixed(1)} ${(gcy - bh9 / 2 - 14 * k).toFixed(1)} q ${(8 * k).toFixed(1)} ${(-20 * k).toFixed(1)} ${(26 * k).toFixed(1)} ${(-6 * k).toFixed(1)} q ${(18 * k).toFixed(1)} ${(-14 * k).toFixed(1)} ${(26 * k).toFixed(1)} ${(6 * k).toFixed(1)} q ${(-10 * k).toFixed(1)} ${(10 * k).toFixed(1)} ${(-26 * k).toFixed(1)} ${(8 * k).toFixed(1)} q ${(-16 * k).toFixed(1)} ${(2 * k).toFixed(1)} ${(-26 * k).toFixed(1)} ${(-8 * k).toFixed(1)} Z" fill="${dimG ? "#8B8F99" : lighten(glow, 0.15)}" stroke="${edge}" stroke-width="1.4"/>` +
        `<ellipse cx="${(gcx - bw9 * 0.26).toFixed(1)}" cy="${(gcy - bh9 * 0.1).toFixed(1)}" rx="${(bw9 * 0.14).toFixed(1)}" ry="${(bh9 * 0.16).toFixed(1)}" fill="#FFFFFF" opacity="0.2"/>`;
      if (tag === "Surprise") inner += `<text x="${gcx.toFixed(1)}" y="${(gcy + 10 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(34 * k).toFixed(1)}" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: ${hexRgba(edge, 0.8)}; stroke-width: ${(4 * k).toFixed(1)}px; stroke-linejoin: round">?</text>`;
      if (tag === "Daily") {
        const dw = 74 * k, dh = 26 * k, dy = gcy + bh9 / 2 - dh / 2 - 4 * k;
        inner += `<rect x="${(gcx - dw / 2).toFixed(1)}" y="${dy.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" rx="${(6 * k).toFixed(1)}" fill="${CHEST_TIERS.Gold}" stroke="${darken(CHEST_TIERS.Gold, 0.4)}" stroke-width="1.4"/>` +
          `<text x="${gcx.toFixed(1)}" y="${(dy + dh / 2 + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="900" letter-spacing="0.14em" fill="#3A2A08" text-anchor="middle" dominant-baseline="central">DAILY</text>`;
      }
      if (dimG && STOCK_ICONS.check) inner += themedIcon(STOCK_ICONS.check, gcx + bw9 * 0.3, gcy - bh9 * 0.55, 30 * k, "#2DD4BF", 3);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W9.toFixed(0)}" height="${H9.toFixed(0)}" viewBox="0 0 ${W9.toFixed(0)} ${H9.toFixed(0)}" data-giftbox="1" role="img" aria-label="gift box"><g opacity="${dimG ? 0.55 : 1}">${inner}</g></svg>`;
    }
    case "rewardcard": {
      /* Rewards · reveal card — the card a chest deals out. Its aura walks
         the KIT'S RARITY LADDER (Color → Rarity tiers). EDITING CONTRACT:
         value = rarity tier; label = the reward's name; icon = the reward
         glyph (swappable); qty slot; face slot Mystery = the pre-reveal ?
         silhouette; real button; disabled dims. */
      const w = 190 * k, h = 252 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const tier = rarityOf(cfg, value, 1);
      const dimR = state === "disabled";
      const mystery = (opts.slots?.kind ?? "Revealed") === "Mystery" || opts.overlay === "mystery";
      const hotR = state === "hover" || state === "pressed";
      const aura = `<rect x="${(sx - 5 * k).toFixed(1)}" y="${(sy - 5 * k).toFixed(1)}" width="${(sw + 10 * k).toFixed(1)}" height="${(sh + 10 * k).toFixed(1)}" rx="${(16 * k).toFixed(1)}" fill="none" stroke="${mystery ? "rgba(255,255,255,0.35)" : tier.c}" stroke-width="${((hotR ? 5 : 3.6) * k).toFixed(1)}" opacity="${dimR ? 0.3 : 0.95}"${!dimR && !mystery ? ` style="filter: drop-shadow(0 0 ${((hotR ? 9 : 5.5) * k).toFixed(1)}px ${hexRgba(tier.c, 0.7)})"` : ""}${mystery ? ` stroke-dasharray="${(7 * k).toFixed(1)} ${(6 * k).toFixed(1)}"` : ""}/>`;
      const inset = bw + 6 * k;
      const wcx = sx + sw / 2;
      const well = `<circle cx="${wcx.toFixed(1)}" cy="${(sy + sh * 0.38).toFixed(1)}" r="${(sw * 0.3).toFixed(1)}" fill="${wellFill}" opacity="0.9"/>`;
      const icR = opts.icon !== undefined ? opts.icon : STOCK_ICONS.gem;
      const face = mystery
        ? `<text x="${wcx.toFixed(1)}" y="${(sy + sh * 0.38).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(46 * k).toFixed(1)}" font-weight="900" fill="rgba(255,255,255,0.5)" text-anchor="middle" dominant-baseline="central">?</text>`
        : (icR ? wellGlyph(icR, wcx, sy + sh * 0.38, sw * 0.38, lighten(tier.c, 0.2)) : "");
      const nameR = contentText(mystery ? "???" : (opts.label ?? "SUN SHARD").slice(0, 14), wcx, sy + sh - inset - 52 * k, 20 * k * typeK, { anchor: "middle" });
      const qty = mystery ? "" : `<rect x="${(wcx - 34 * k).toFixed(1)}" y="${(sy + sh - inset - 34 * k).toFixed(1)}" width="${(68 * k).toFixed(1)}" height="${(26 * k).toFixed(1)}" rx="${(13 * k).toFixed(1)}" fill="${hexRgba(tier.c, 0.25)}" stroke="${hexRgba(tier.c, 0.6)}" stroke-width="1.3"/>` +
        `<text x="${wcx.toFixed(1)}" y="${(sy + sh - inset - 20.5 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15.5 * k).toFixed(1)}" font-weight="800" fill="${dimR ? "rgba(255,255,255,0.4)" : lighten(tier.c, 0.35)}" text-anchor="middle" dominant-baseline="central">${esc((opts.slots?.qty ?? "×3").slice(0, 8))}</text>`;
      return injectUnder(inject(shell.replace("<svg ", '<svg data-rewardcard="1" '), well + face + nameR + qty), aura);
    }
    case "qtybadge": {
      /* Rewards · quantity badge — the ×250 corner pill that rides any
         slot or card. EDITING CONTRACT: label = the text; it's the master
         material in miniature, states native. */
      const shell = build(cfg, state, { x: 39, y: 30, h: 58 * k, fs: 22 * k * typeK, iconSize: 0, tokenH: 62 }, { iconDef: null, label: (opts.label ?? "×250").slice(0, 8), shapeOverride: sov });
      return shell.replace("<svg ", '<svg data-qtybadge="1" ');
    }
    case "claimbtn": {
      /* Rewards · claim button — the sweep-the-table action. EDITING
         CONTRACT: mode slot = Claim all (gift glyph) / 2x by ad (play
         badge + gold ×2 ribbon); label overrides the word; a REAL button
         through and through. */
      const w = 320 * k, h = 112 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 118 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ad = String(opts.slots?.mode ?? "Claim all") !== "Claim all";
      const cyB = sy + sh / 2;
      const dimB = state === "disabled";
      let innerB = "";
      if (ad) {
        const pr = 19 * k, px = sx + 34 * k;
        innerB += `<circle cx="${px.toFixed(1)}" cy="${cyB.toFixed(1)}" r="${pr.toFixed(1)}" fill="${hexRgba("#FFFFFF", 0.16)}" stroke="rgba(255,255,255,0.5)" stroke-width="1.6"/>` +
          (STOCK_ICONS.play ? themedIcon(STOCK_ICONS.play, px - 9 * k, cyB - 10 * k, 20 * k, "#FFFFFF", 2.6) : "") +
          contentText((opts.label ?? "2× REWARD").slice(0, 14), px + pr + 12 * k, cyB + 1, 24 * k * typeK, {});
        const rw = 64 * k, rh = 26 * k;
        innerB += `<g transform="rotate(8 ${(sx + sw - 18 * k).toFixed(1)} ${(sy + 4 * k).toFixed(1)})"><rect x="${(sx + sw - rw - 4 * k).toFixed(1)}" y="${(sy - rh * 0.45).toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="${(7 * k).toFixed(1)}" fill="${CHEST_TIERS.Gold}" stroke="${darken(CHEST_TIERS.Gold, 0.4)}" stroke-width="1.4"/><text x="${(sx + sw - rw / 2 - 4 * k).toFixed(1)}" y="${(sy + rh * 0.05).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(14 * k).toFixed(1)}" font-weight="900" letter-spacing="0.08em" fill="#3A2A08" text-anchor="middle" dominant-baseline="central">AD ×2</text></g>`;
      } else {
        const gx = sx + 30 * k;
        innerB += (STOCK_ICONS.gift ? themedIcon(STOCK_ICONS.gift, gx, cyB - 14 * k, 28 * k, dimB ? "#A7AAB4" : glow, 2.2) : "") +
          contentText((opts.label ?? "CLAIM ALL").slice(0, 14), gx + 40 * k, cyB + 1, 25 * k * typeK, {});
      }
      return inject(shell.replace("<svg ", '<svg data-claimbtn="1" '), innerB);
    }
    case "rewardtray": {
      /* Rewards · reward tray — the multi-reward strip. EDITING CONTRACT:
         value = reveal (slots flip ? → revealed left to right; 100% is
         the full summary); title + per-slot qty slots; frame dims only
         for disabled. */
      const w = 560 * k, h = 158 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw] = shellM[1].split(" ").map(Number);
      const inset = bw + 8 * k;
      const dimT = state === "disabled";
      const vT9 = clamp(value ?? 0.62, 0, 1);
      const shown = Math.ceil(vT9 * 4);
      const title = contentText((opts.slots?.title ?? "REWARDS").slice(0, 16), sx + inset + 8 * k, sy + inset + 14 * k, 19 * k * typeK, {});
      const icons = [STOCK_ICONS.gem, STOCK_ICONS.bag, STOCK_ICONS.scroll, STOCK_ICONS.key];
      const qtys = [(opts.slots?.q1 ?? "×120"), (opts.slots?.q2 ?? "×3"), (opts.slots?.q3 ?? "×1"), (opts.slots?.q4 ?? "×2")];
      const cell = 84 * k, gap = 12 * k;
      const rowY = sy + inset + 32 * k;
      let cells = "";
      for (let i = 0; i < 4; i++) {
        const cx9 = sx + inset + 6 * k + i * (cell + gap);
        const on = i < shown && !dimT;
        cells += `<rect x="${cx9.toFixed(1)}" y="${rowY.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="${(10 * k).toFixed(1)}" fill="${wellFill}" opacity="0.9"${on ? ` stroke="${hexRgba(glow, 0.55)}" stroke-width="1.6"` : ""}/>`;
        if (on) {
          if (icons[i]) cells += themedIcon(icons[i], cx9 + cell * 0.28, rowY + cell * 0.14, cell * 0.44, hexMix(glow, "#FFFFFF", 0.3), 2);
          cells += hudText(qtys[i].slice(0, 6), cx9 + cell / 2, rowY + cell * 0.82, 14.5 * k, "middle");
        } else {
          cells += `<text x="${(cx9 + cell / 2).toFixed(1)}" y="${(rowY + cell / 2).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(30 * k).toFixed(1)}" font-weight="900" fill="rgba(255,255,255,0.3)" text-anchor="middle" dominant-baseline="central">?</text>`;
        }
      }
      // the tray's own claim capsule — decorative here; the real action is
      // the Claim button piece
      const pw = 108 * k, ph = 40 * k, px9 = sx + sw - inset - pw - 6 * k, py9 = rowY + cell / 2 - ph / 2;
      const gidT9 = "rt" + UID++;
      const all = shown >= 4 && !dimT;
      cells += `<defs><linearGradient id="${gidT9}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.35)}"/><stop offset="1" stop-color="${darken(glow, 0.22)}"/></linearGradient></defs>` +
        `<rect x="${px9.toFixed(1)}" y="${py9.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(ph / 2).toFixed(1)}" fill="${all ? `url(#${gidT9})` : "rgba(255,255,255,0.1)"}" stroke="${all ? darken(glow, 0.35) : "rgba(255,255,255,0.2)"}" stroke-width="1.5"${all ? ` style="filter: drop-shadow(0 0 5px ${hexRgba(glow, 0.5)})"` : ""}/>` +
        `<text x="${(px9 + pw / 2).toFixed(1)}" y="${(py9 + ph / 2 + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="900" letter-spacing="0.1em" fill="${all ? darken(glow, 0.6) : "rgba(255,255,255,0.45)"}" text-anchor="middle" dominant-baseline="central">CLAIM</text>`;
      return inject(shell.replace("<svg ", '<svg data-rewardtray="1" '), title + cells);
    }
    case "chestpanel": {
      /* Rewards · chest-opening panel — the ceremony stage: burst rays,
         pedestal, the chest, TAP TO OPEN. EDITING CONTRACT: label = the
         headline; hover feeds the rays; pressed squashes the chest;
         disabled dims the whole rite. In an engine the chest is its own
         sprite — this is the stage it lands on. */
      const w = 500 * k, h = 330 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const dimP = state === "disabled";
      const hotP = state === "hover" || state === "pressed";
      const pcx = sx + sw / 2, pcy = sy + sh * 0.56;
      const gidP = "cp" + UID++;
      let innerP = `<clipPath id="${gidP}c"><rect x="${(sx + bw).toFixed(1)}" y="${(sy + bw).toFixed(1)}" width="${(sw - bw * 2).toFixed(1)}" height="${(sh - bw * 2).toFixed(1)}" rx="${(14 * k).toFixed(1)}"/></clipPath><g clip-path="url(#${gidP}c)">`;
      innerP += `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.62)}"/>`;
      let rays = "";
      for (let i = 0; i < 12; i++) {
        const a1 = (i / 12) * 360, spread = 11;
        rays += `<path d="M 0 0 L ${(sw * 0.9).toFixed(1)} ${(-Math.tan((spread / 2) * Math.PI / 180) * sw * 0.9).toFixed(1)} L ${(sw * 0.9).toFixed(1)} ${(Math.tan((spread / 2) * Math.PI / 180) * sw * 0.9).toFixed(1)} Z" fill="${glow}" opacity="${dimP ? 0.04 : hotP ? 0.14 : 0.09}" transform="rotate(${a1})"/>`;
      }
      innerP += `<g transform="translate(${pcx.toFixed(1)} ${pcy.toFixed(1)})"><g>${dimP ? "" : `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="46s" repeatCount="indefinite"/>`}${rays}</g></g>`;
      innerP += `<ellipse cx="${pcx.toFixed(1)}" cy="${(pcy + 58 * k).toFixed(1)}" rx="${(120 * k).toFixed(1)}" ry="${(16 * k).toFixed(1)}" fill="rgba(4,7,14,0.5)"/>`;
      innerP += chestArt(pcx, pcy + (state === "pressed" ? 12 * k : 8 * k), 128 * k, bevel, CHEST_TIERS.Gold, { dim: dimP });
      if (!dimP) for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + 0.6;
        const rr9 = 96 * k + (i % 2) * 26 * k;
        innerP += `<circle cx="${(pcx + Math.cos(ang) * rr9).toFixed(1)}" cy="${(pcy - 10 * k + Math.sin(ang) * rr9 * 0.6).toFixed(1)}" r="${((2.4 + (i % 3)) * k).toFixed(1)}" fill="${lighten(glow, 0.4)}" opacity="0.8"><animate attributeName="opacity" values="0.8;0.2;0.8" dur="${(1.6 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
      }
      innerP += contentText((opts.label ?? "CHEST OPENING").slice(0, 18), pcx, sy + 34 * k, 26 * k * typeK, { anchor: "middle" });
      if (!dimP) innerP += `<g><animate attributeName="opacity" values="1;0.5;1" dur="1.8s" repeatCount="indefinite"/>${hudText("TAP TO OPEN", pcx, sy + sh - 26 * k, 16 * k, "middle")}</g>`;
      innerP += "</g>";
      return inject(shell.replace("<svg ", '<svg data-chestpanel="1" '), innerP);
    }
    case "pricebtn": {
      /* Casual · IAP price button — a REAL buy button: candy coin + price,
         gold value ribbon riding the top edge. EDITING CONTRACT: label =
         the price; build drives hover/pressed natively. */
      const w = 300 * k, h = 118 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 126 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw] = shellM[1].split(" ").map(Number);
      const cy = sy + 59 * k;
      const coinR = 24 * k, coinX = sx + 34 * k;
      const gidP0 = "pb" + UID++;
      const coin = `<defs><radialGradient id="${gidP0}" cx="0.35" cy="0.3" r="0.95"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.55" stop-color="#FACC15"/><stop offset="1" stop-color="#B45309"/></radialGradient></defs>
        <circle cx="${coinX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${coinR.toFixed(1)}" fill="url(#${gidP0})" stroke="#92400E" stroke-width="1.6"/>
        <circle cx="${coinX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(coinR * 0.64).toFixed(1)}" fill="none" stroke="#92400E" stroke-width="1" opacity="0.6"/>
        <ellipse cx="${(coinX - coinR * 0.3).toFixed(1)}" cy="${(cy - coinR * 0.4).toFixed(1)}" rx="${(coinR * 0.32).toFixed(1)}" ry="${(coinR * 0.17).toFixed(1)}" fill="#FFFFFF" opacity="0.65"/>`;
      const price = contentText(opts.label ?? "$4.99", coinX + coinR + 14 * k, cy + 1, 34 * k * typeK, { keepCase: true });
      const ribW = 108 * k, ribH = 26 * k;
      const ribbon = `<g${state !== "disabled" ? ` style="filter: drop-shadow(0 1.5px 2px rgba(6,10,18,0.4))"` : ""}>
        <rect x="${(sx + sw / 2 - ribW / 2).toFixed(1)}" y="${(sy - ribH * 0.44).toFixed(1)}" width="${ribW.toFixed(1)}" height="${ribH.toFixed(1)}" rx="${(ribH / 2).toFixed(1)}" fill="#FACC15" stroke="#92400E" stroke-width="1.4"/>
        <text x="${(sx + sw / 2).toFixed(1)}" y="${(sy - ribH * 0.44 + ribH / 2 + 0.5).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="900" letter-spacing="0.1em" fill="#7C2D12" text-anchor="middle" dominant-baseline="central">${esc((opts.slots?.ribbon ?? "BEST VALUE").slice(0, 16))}</text></g>`;
      return inject(shell.replace("<svg ", '<svg data-pricebtn="1" '), coin + price + ribbon);
    }
    case "energymeter": {
      /* Casual · energy meter — the bolt, ten cells in a sunken container
         (negative-space canon), the count in adaptive ink. EDITING
         CONTRACT: value = energy (0..1 → 0..30 shown / 10 cells); label =
         the count text; bolt is semantic gold. */
      const w = 470 * k, h = 108 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 116 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const vE = clamp(value ?? 0.8, 0, 1);
      const GOLD = "#FACC15";
      const bolt = STOCK_ICONS.zap
        ? iconGroup(STOCK_ICONS.zap, 39 + inset + 12 * k, cy - 17 * k, 34 * k, "rgba(8,12,22,0.65)", { strokeWidth: 2.4 * iconWK + 2.4 }) +
          iconGroup(STOCK_ICONS.zap, 39 + inset + 12 * k, cy - 17 * k, 34 * k, GOLD, { strokeWidth: 2.4 * iconWK })
        : "";
      const nCe = 10;
      const cellsX = 39 + inset + 60 * k, cellsW = w - inset * 2 - 60 * k - 96 * k;
      const cellW9 = (cellsW - (nCe - 1) * 5 * k) / nCe;
      const litE = Math.round(vE * nCe);
      const gidE = "en" + UID++;
      let inner = bolt +
        `<rect x="${(cellsX - 6 * k).toFixed(1)}" y="${(cy - 18 * k).toFixed(1)}" width="${(cellsW + 12 * k).toFixed(1)}" height="${(36 * k).toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidE}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="#D97706"/></linearGradient></defs>`;
      for (let i = 0; i < nCe; i++) {
        const cx9 = cellsX + i * (cellW9 + 5 * k);
        const on = i < litE;
        inner += `<rect x="${cx9.toFixed(1)}" y="${(cy - 11.5 * k).toFixed(1)}" width="${cellW9.toFixed(1)}" height="${(23 * k).toFixed(1)}" rx="${(4.5 * k).toFixed(1)}" fill="${on ? `url(#${gidE})` : "rgba(255,255,255,0.1)"}" stroke="${on ? "#B45309" : "rgba(255,255,255,0.12)"}" stroke-width="1"${on && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(2.5 * k).toFixed(1)}px rgba(250,204,21,0.55))"` : ""}/>`;
      }
      inner += infoText(opts.label ?? `${Math.round(vE * 30)}/30`, 39 + w - inset - 16 * k, cy + 1, 19 * k, "end");
      return inject(shell.replace("<svg ", '<svg data-energymeter="1" '), inner);
    }
    case "buildqueue": {
      /* Strategy · build queue card — what's being made, how long, how many.
         EDITING CONTRACT: label = the unit name; icon = the unit glyph
         (swappable); value = build progress; the card takes states natively
         (it's selectable); bar keeps the negative-space canon. */
      const w = 400 * k, h = 150 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const vB0 = clamp(value ?? 0.55, 0, 1);
      const wellS = h - inset * 2 - 16 * k;
      const wx = 39 + inset + 8 * k, wy = 30 + inset + 8 * k;
      const ic = opts.icon ?? STOCK_ICONS.helmet;
      const tx0 = wx + wellS + 14 * k;
      const barW9 = 39 + w - inset - 12 * k - tx0, barH9 = 14 * k;
      const barY9 = 30 + h - inset - 26 * k;
      const gidB0 = "bq" + UID++;
      const gB = 2.5 * k, mH = barH9 - gB * 2;
      const parts = `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${wellS.toFixed(1)}" height="${wellS.toFixed(1)}" rx="${(12 * k).toFixed(1)}" fill="${wellFill}" opacity="0.92"/>` +
        (ic ? themedIcon(ic, wx + wellS * 0.2, wy + wellS * 0.2, wellS * 0.6, hexMix(glow, "#FFFFFF", 0.25), 2.2) : "") +
        contentText(opts.label ?? "WAR GOLEM", tx0, 30 + inset + 22 * k, 22 * k * typeK) +
        infoText("×3 · 0:42", tx0 + barW9, barY9 - 14 * k, 16 * k, "end", 700) +
        `<rect x="${tx0.toFixed(1)}" y="${barY9.toFixed(1)}" width="${barW9.toFixed(1)}" height="${barH9.toFixed(1)}" rx="${(barH9 / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidB0}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(glow, 0.45)}"/><stop offset="1" stop-color="${darken(glow, 0.25)}"/></linearGradient></defs>` +
        (vB0 > 0.03 ? `<rect x="${(tx0 + gB).toFixed(1)}" y="${(barY9 + gB).toFixed(1)}" width="${Math.max(0, (barW9 - gB * 2) * vB0).toFixed(1)}" height="${mH.toFixed(1)}" rx="${(mH / 2).toFixed(1)}" fill="url(#${gidB0})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.6)})"` : ""}/>` : "");
      return inject(shell.replace("<svg ", '<svg data-buildqueue="1" '), parts);
    }
    case "unitplate": {
      /* Strategy · unit selection plate — portrait, name, HP, two stats.
         EDITING CONTRACT: label = the unit name; value = HP; the whole
         plate is the selection target (native states). */
      const w = 360 * k, h = 132 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8 * k;
      const cy = 30 + h / 2;
      const pr = 33 * k, pcx = 39 + inset + pr + 8 * k;
      const gidU = "up" + UID++;
      const vHP = clamp(value ?? 0.82, 0, 1);
      const HPC = "#4ADE80";
      const tx0 = pcx + pr + 14 * k, txw = 39 + w - inset - 12 * k - tx0;
      const railH = 13 * k, railY = cy + 4 * k;
      const gU = 2.5 * k, mHU = railH - gU * 2;
      const parts = `<defs><clipPath id="${gidU}"><circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}"/></clipPath>
        <linearGradient id="${gidU}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(HPC, 0.4)}"/><stop offset="1" stop-color="${darken(HPC, 0.3)}"/></linearGradient></defs>
        <circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}" fill="${wellFill}"/>
        <g clip-path="url(#${gidU})" opacity="${state === "disabled" ? 0.4 : 1}">
          <circle cx="${pcx.toFixed(1)}" cy="${(cy - pr * 0.28).toFixed(1)}" r="${(pr * 0.34).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
          <ellipse cx="${pcx.toFixed(1)}" cy="${(cy + pr * 0.75).toFixed(1)}" rx="${(pr * 0.62).toFixed(1)}" ry="${(pr * 0.5).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
        </g>
        <circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}" fill="none" stroke="${darken(bevel, 0.35)}" stroke-width="1.6"/>` +
        contentText(opts.label ?? "VANGUARD", tx0, 30 + inset + 18 * k, 23 * k * typeK, { keepCase: true }) +
        `<rect x="${tx0.toFixed(1)}" y="${railY.toFixed(1)}" width="${txw.toFixed(1)}" height="${railH.toFixed(1)}" rx="${(railH / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}"/>` +
        (vHP > 0.04 ? `<rect x="${(tx0 + gU).toFixed(1)}" y="${(railY + gU).toFixed(1)}" width="${Math.max(0, (txw - gU * 2) * vHP).toFixed(1)}" height="${mHU.toFixed(1)}" rx="${(mHU / 2).toFixed(1)}" fill="url(#${gidU}h)"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px ${hexRgba(HPC, 0.55)})"` : ""}/>` : "") +
        (STOCK_ICONS.sword ? iconGroup(STOCK_ICONS.sword, tx0, railY + railH + 8 * k, 18 * k, infoInk, { strokeWidth: 2 * iconWK }) : "") +
        infoText("12", tx0 + 24 * k, railY + railH + 17 * k, 15 * k, "start", 800) +
        (STOCK_ICONS.shield ? iconGroup(STOCK_ICONS.shield, tx0 + 52 * k, railY + railH + 8 * k, 18 * k, infoInk, { strokeWidth: 2 * iconWK }) : "") +
        infoText("8", tx0 + 76 * k, railY + railH + 17 * k, 15 * k, "start", 800);
      return inject(shell.replace("<svg ", '<svg data-unitplate="1" '), parts);
    }
    case "techcard": {
      /* Strategy · tech-tree card — icon medallion, name, cost, connector
         stubs. EDITING CONTRACT: label = the tech name; icon = the glyph
         (swappable); overlay = "done" | "locked" | default (researchable —
         breathing ring); a real button; stubs mark the tree path. */
      const w = 210 * k, h = 250 * k;
      const done9 = opts.overlay === "done";
      const locked9 = opts.overlay === "locked";
      const shell = build(cfg, locked9 ? "disabled" : state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2;
      const cyM = sy + sh * 0.34, mR = sw * 0.24;
      const ic = opts.icon ?? STOCK_ICONS.sword;
      const stubs = `<line x1="${(sx - 22 * k).toFixed(1)}" y1="${(sy + sh / 2).toFixed(1)}" x2="${(sx + 4 * k).toFixed(1)}" y2="${(sy + sh / 2).toFixed(1)}" stroke="${done9 ? glow : "rgba(255,255,255,0.25)"}" stroke-width="${(8 * k).toFixed(1)}" stroke-linecap="round"${done9 && state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(glow, 0.6)})"` : ""}/>
        <line x1="${(sx + sw - 4 * k).toFixed(1)}" y1="${(sy + sh / 2).toFixed(1)}" x2="${(sx + sw + 22 * k).toFixed(1)}" y2="${(sy + sh / 2).toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="${(8 * k).toFixed(1)}" stroke-linecap="round"/>`;
      let over = `<circle cx="${ccx.toFixed(1)}" cy="${cyM.toFixed(1)}" r="${mR.toFixed(1)}" fill="${wellFill}" stroke="rgba(255,255,255,0.25)" stroke-width="1.4"/>` +
        (ic ? (locked9
          ? iconGroup(ic, ccx - mR * 0.55, cyM - mR * 0.55, mR * 1.1, "#A7AAB4", { strokeWidth: 2 * iconWK })
          : themedIcon(ic, ccx - mR * 0.55, cyM - mR * 0.55, mR * 1.1, hexMix(glow, "#FFFFFF", 0.25), 2.2)) : "") +
        contentText(opts.label ?? "IRON EDGE", ccx, sy + sh * 0.66, 20 * k * typeK, { anchor: "middle" });
      const costY = sy + sh - 26 * k;
      if (done9) {
        over += `<circle cx="${ccx.toFixed(1)}" cy="${costY.toFixed(1)}" r="${(14 * k).toFixed(1)}" fill="#4ADE80" stroke="rgba(255,255,255,0.85)" stroke-width="1.8"/>` +
          iconGroup(STOCK_ICONS.check, ccx - 9 * k, costY - 9 * k, 18 * k, "#0B3B21", { strokeWidth: 3.2 * iconWK });
      } else if (locked9) {
        over += iconGroup(STOCK_ICONS.lock, ccx - 11 * k, costY - 11 * k, 22 * k, "#A7AAB4", { strokeWidth: 2.2 * iconWK });
      } else {
        over += `<circle cx="${(ccx - 26 * k).toFixed(1)}" cy="${costY.toFixed(1)}" r="${(11 * k).toFixed(1)}" fill="#FACC15" stroke="#92400E" stroke-width="1.3"/>` +
          infoText("120", ccx - 10 * k, costY + 1, 17 * k, "start", 800);
        if (state !== "disabled") over += `<rect x="${(sx - 5 * k).toFixed(1)}" y="${(sy - 5 * k).toFixed(1)}" width="${(sw + 10 * k).toFixed(1)}" height="${(sh + 10 * k).toFixed(1)}" rx="${(18 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.7)}" stroke-width="${(2.4 * k).toFixed(1)}"><animate attributeName="stroke-opacity" values="0.8;0.3;0.8" dur="2.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"/></rect>`;
      }
      return inject(injectUnder(shell.replace("<svg ", '<svg data-techcard="1" '), stubs), over);
    }
    case "popmeter": {
      /* Strategy · population meter — the supply readout. EDITING CONTRACT:
         value = population share; max = the cap label; past 90% the fill
         warns in alarm red; adaptive count ink. */
      const w = 330 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 104 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const vP0 = clamp(value ?? 0.84, 0, 1);
      const cap = parseInt(opts.max ?? "100", 10) || 100;
      const nearCap = vP0 > 0.9;
      const barC = nearCap ? "#FF4D5A" : glow;
      const usr = STOCK_ICONS.user ? iconGroup(STOCK_ICONS.user, 39 + inset + 10 * k, cy - 24 * k, 30 * k, infoInk, { strokeWidth: 2.2 * iconWK }) : "";
      const cnt = infoText(`${Math.round(vP0 * cap)} / ${cap}`, 39 + inset + 48 * k, cy - 9 * k, 22 * k, "start", 800);
      const barX = 39 + inset + 12 * k, barW9 = w - inset * 2 - 24 * k, barH9 = 12 * k, barY9 = cy + 12 * k;
      const gidP1 = "pm" + UID++;
      const gP = 2.5 * k, mHP = barH9 - gP * 2;
      const parts = usr + cnt +
        `<rect x="${barX.toFixed(1)}" y="${barY9.toFixed(1)}" width="${barW9.toFixed(1)}" height="${barH9.toFixed(1)}" rx="${(barH9 / 2).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>` +
        `<defs><linearGradient id="${gidP1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(barC, 0.4)}"/><stop offset="1" stop-color="${darken(barC, 0.25)}"/></linearGradient></defs>` +
        (vP0 > 0.03 ? `<rect x="${(barX + gP).toFixed(1)}" y="${(barY9 + gP).toFixed(1)}" width="${Math.max(0, (barW9 - gP * 2) * vP0).toFixed(1)}" height="${mHP.toFixed(1)}" rx="${(mHP / 2).toFixed(1)}" fill="url(#${gidP1})"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(barC, 0.6)})"` : ""}/>` : "");
      return inject(shell.replace("<svg ", '<svg data-popmeter="1" '), parts);
    }
    case "endturn": {
      /* Strategy · end-turn button — the chunky radial: a real circular
         button with a turn-timer arc around the face. EDITING CONTRACT:
         label = the top word; value = turn time left (the arc); build
         drives hover/pressed natively. */
      const s = 176 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: s, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2, ccy = sy + sh / 2;
      const vT0 = clamp(value ?? 0.7, 0, 1);
      const arcR = Math.min(sw, sh) / 2 - bw - 6 * k;
      const circT = 2 * Math.PI * arcR;
      const arc = vT0 > 0.01 && state !== "disabled"
        ? `<circle cx="${ccx.toFixed(1)}" cy="${ccy.toFixed(1)}" r="${arcR.toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.75)}" stroke-width="${(4 * k).toFixed(1)}" stroke-linecap="round" stroke-dasharray="${(circT * vT0).toFixed(1)} ${circT.toFixed(1)}" transform="rotate(-90 ${ccx.toFixed(1)} ${ccy.toFixed(1)})" style="filter: drop-shadow(0 0 ${(3 * k).toFixed(1)}px ${hexRgba(glow, 0.55)})"/>`
        : "";
      const words = (opts.label ?? "END TURN").split(" ");
      const text = words.length > 1
        ? contentText(words[0], ccx, ccy - 14 * k, 30 * k * typeK, { anchor: "middle" }) +
          contentText(words.slice(1).join(" "), ccx, ccy + 18 * k, 30 * k * typeK, { anchor: "middle" })
        : contentText(words[0], ccx, ccy + 1, 32 * k * typeK, { anchor: "middle" });
      return inject(shell.replace("<svg ", '<svg data-endturn="1" '), arc + text);
    }
    case "scorebug": {
      /* Strategy · score bug — teams + clock in one instrument strip. Team
         hues are semantic (like the VS bar). EDITING CONTRACT: label/sub =
         the team names; value = match clock; the well keeps everything
         legible on any face. */
      const w = 640 * k, h = 96 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 104 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 5 * k;
      const cy = 30 + h / 2;
      const TA = "#38BDF8", TB = "#FF4D5A";
      const secsM = Math.round(clamp(value ?? 0.52, 0, 1) * 600);
      const clock = `${Math.floor(secsM / 60)}:${String(secsM % 60).padStart(2, "0")}`;
      const wellD = `<path d="${wellOf(w, h, inset)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.82)}" opacity="0.96"/>`;
      const cxS0 = 39 + w / 2;
      const hubW = 108 * k, hubH = h - inset * 2 - 14 * k;
      const parts = wellD +
        `<rect x="${(39 + inset + 8 * k).toFixed(1)}" y="${(cy - 5 * k - 22 * k).toFixed(1)}" width="${(7 * k).toFixed(1)}" height="${(44 * k).toFixed(1)}" rx="${(3.5 * k).toFixed(1)}" fill="${TA}"/>` +
        hudText(opts.label ?? "AZUR", 39 + inset + 26 * k, cy - 13 * k, 18 * k, "start", 800) +
        hudText((opts.slots?.scoreA ?? "2").slice(0, 3), 39 + inset + 26 * k, cy + 15 * k, 26 * k, "start", 900) +
        `<rect x="${(39 + w - inset - 15 * k).toFixed(1)}" y="${(cy - 5 * k - 22 * k).toFixed(1)}" width="${(7 * k).toFixed(1)}" height="${(44 * k).toFixed(1)}" rx="${(3.5 * k).toFixed(1)}" fill="${TB}"/>` +
        hudText(opts.sub ?? "CRIMSON", 39 + w - inset - 26 * k, cy - 13 * k, 18 * k, "end", 800) +
        hudText((opts.slots?.scoreB ?? "1").slice(0, 3), 39 + w - inset - 26 * k, cy + 15 * k, 26 * k, "end", 900) +
        `<rect x="${(cxS0 - hubW / 2).toFixed(1)}" y="${(cy - hubH / 2).toFixed(1)}" width="${hubW.toFixed(1)}" height="${hubH.toFixed(1)}" rx="${(10 * k).toFixed(1)}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>` +
        hudText(clock, cxS0, cy + 1, 26 * k, "middle", 900);
      return inject(shell.replace("<svg ", '<svg data-scorebug="1" '), parts);
    }
    case "friendrow": {
      /* Social · friend row — presence, name, status, the JOIN capsule.
         EDITING CONTRACT: label = the name; value = presence (>0.5
         online); the row takes hover natively; JOIN lights when online. */
      const w = 470 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 104 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 6 * k;
      const cy = 30 + h / 2;
      const online = (value ?? 1) > 0.5;
      const pr = 26 * k, pcx = 39 + inset + pr + 8 * k;
      const gidF = "fr" + UID++;
      const PRES = online ? "#4ADE80" : "#8A93A6";
      const joinW = 86 * k, joinH = 44 * k;
      const joinX = 39 + w - inset - joinW - 8 * k;
      const darkFace9 = cfg.face.mode === "dark";
      const joinFill = online ? (darkFace9 ? lighten(bevel, 0.5) : darken(bevel, 0.45)) : "rgba(120,128,148,0.3)";
      const joinInk = online ? (darkFace9 ? darken(bevel, 0.66) : "#FFFFFF") : infoInk;
      const parts = `<defs><clipPath id="${gidF}"><circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}"/></clipPath></defs>
        <circle cx="${pcx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pr.toFixed(1)}" fill="${wellFill}"/>
        <g clip-path="url(#${gidF})" opacity="${state === "disabled" ? 0.4 : 1}">
          <circle cx="${pcx.toFixed(1)}" cy="${(cy - pr * 0.28).toFixed(1)}" r="${(pr * 0.34).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
          <ellipse cx="${pcx.toFixed(1)}" cy="${(cy + pr * 0.75).toFixed(1)}" rx="${(pr * 0.62).toFixed(1)}" ry="${(pr * 0.5).toFixed(1)}" fill="rgba(255,255,255,0.4)"/>
        </g>
        <circle cx="${(pcx + pr * 0.72).toFixed(1)}" cy="${(cy + pr * 0.72).toFixed(1)}" r="${(8 * k).toFixed(1)}" fill="${PRES}" stroke="rgba(255,255,255,0.9)" stroke-width="2"${online && state !== "disabled" ? ` style="filter: drop-shadow(0 0 3px ${hexRgba(PRES, 0.7)})"` : ""}/>` +
        contentText(opts.label ?? "KAIRO_77", pcx + pr + 14 * k, cy - 10 * k, 21 * k * typeK, { keepCase: true }) +
        infoText(online ? (opts.slots?.status ?? "In Match · Ranked").slice(0, 32) : "Last seen 2h ago", pcx + pr + 14 * k, cy + 15 * k, 14.5 * k, "start", 650) +
        `<rect x="${joinX.toFixed(1)}" y="${(cy - joinH / 2).toFixed(1)}" width="${joinW.toFixed(1)}" height="${joinH.toFixed(1)}" rx="${(joinH / 2).toFixed(1)}" fill="${joinFill}" stroke="${online ? hexRgba(glow, 0.6) : "rgba(255,255,255,0.2)"}" stroke-width="1.4"${online && state === "hover" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(glow, 0.6)})"` : ""}/>` +
        `<text x="${(joinX + joinW / 2).toFixed(1)}" y="${(cy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="900" letter-spacing="0.08em" fill="${joinInk}" text-anchor="middle" dominant-baseline="central">${esc(online ? (opts.slots?.cta ?? "JOIN").slice(0, 10) : "INVITE")}</text>`;
      return inject(shell.replace("<svg ", '<svg data-friendrow="1" '), parts);
    }
    case "chatbubble": {
      /* Social · chat bubble — the kit material speaking, on the SPEECH
         silhouette (the tail is part of the shape, so bevel, gloss, glow,
         extrusion and shadow all wear it). The bubble grows VERTICALLY
         with the message — the label wraps to the inner width and every
         extra line adds a row (the 9-slice promise: width fixed, height
         elastic, text never overruns). EDITING CONTRACT: label = the
         message (wraps + grows the bubble); name/time wear adaptive ink;
         silhouette swaps like any piece. */
      const w = 430 * k;
      const msg = opts.label ?? "gg — same time tomorrow?";
      const fsM = 23 * k * typeK;
      const inset = bw + 8 * k;
      const innerW = w - inset * 2 - 24 * k;
      // conservative glyph-width estimate for display faces (~0.62em)
      const maxCh = Math.max(6, Math.floor(innerW / (fsM * 0.62)));
      const lines: string[] = [];
      let cur = "";
      for (const wd of msg.split(/\s+/).filter(Boolean)) {
        const cand = cur ? cur + " " + wd : wd;
        if (cand.length > maxCh && cur) { lines.push(cur); cur = wd; } else cur = cand;
        while (cur.length > maxCh) { lines.push(cur.slice(0, maxCh)); cur = cur.slice(maxCh); }
      }
      if (cur) lines.push(cur);
      if (!lines.length) lines.push("");
      const lineH = fsM * 1.32;
      // body = padding + header row + message block; the shape adds its tail
      const bodyH = inset * 2 + 30 * k + lines.length * lineH + 8 * k;
      const h = bodyH + Math.min(30, bodyH * 0.28);
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      let parts = infoText((opts.slots?.sender ?? "NOVA_KNIGHT").slice(0, 20), 39 + inset + 12 * k, 30 + inset + 16 * k, 14 * k, "start", 800) +
        infoText((opts.slots?.time ?? "14:02").slice(0, 8), 39 + w - inset - 12 * k, 30 + inset + 16 * k, 13 * k, "end", 650);
      lines.forEach((ln, i) => {
        // message body = reading text → the list face, like dialogue lines
        if (ln) parts += contentText(ln, 39 + inset + 12 * k, 30 + inset + 30 * k + (i + 0.5) * lineH, fsM, { keepCase: true, list: true });
      });
      return inject(shell.replace("<svg ", '<svg data-chatbubble="1" '), parts);
    }
    case "emotewheel": {
      /* Social · emote wheel — six sectors, INSTANT selection (no cylinder:
         emotes must be fast). EDITING CONTRACT: value = selected sector
         (click picks the sector under the pointer); icon = the selected
         emote (swappable); hub shows the pick; disabled dims. */
      const dE = ({ s: 280, m: 350, l: 430 } as Record<KitSize, number>)[size] * k;
      const padE9 = 30;
      const cE = dE / 2 + padE9, rE = dE / 2;
      const hubR = dE * 0.16;
      const gidE9 = "ew" + UID++;
      const emotes = [STOCK_ICONS.heart, STOCK_ICONS.star, STOCK_ICONS.zap, STOCK_ICONS.check, STOCK_ICONS.gem, STOCK_ICONS.warning];
      const nE9 = emotes.length;
      const selE9 = clamp(Math.floor(((clamp(value ?? 0, 0, 0.999)) % 1) * nE9), 0, nE9 - 1);
      const hotE9 = state === "hover" || state === "pressed";
      let sect = "";
      for (let i = 0; i < nE9; i++) {
        const a0 = (i / nE9) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / nE9) * Math.PI * 2 - Math.PI / 2;
        const on = i === selE9;
        const rr = rE - 4;
        sect += `<path d="M ${cE} ${cE} L ${(cE + rr * Math.cos(a0)).toFixed(1)} ${(cE + rr * Math.sin(a0)).toFixed(1)} A ${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(cE + rr * Math.cos(a1)).toFixed(1)} ${(cE + rr * Math.sin(a1)).toFixed(1)} Z" fill="${on ? hexRgba(glow, hotE9 ? 0.4 : 0.3) : hexRgba(darken(effect(cfg.effects, "Inner Fill"), 0.72), 0.85)}" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>`;
        const am = (a0 + a1) / 2;
        const gx = cE + rE * 0.66 * Math.cos(am), gy = cE + rE * 0.66 * Math.sin(am);
        const ic9 = i === selE9 ? (opts.icon ?? emotes[i]) : emotes[i];
        if (ic9) sect += on
          ? `<g${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.75)})"` : ""}>${themedIcon(ic9, gx - 19 * k, gy - 19 * k, 38 * k, hexMix(glow, "#FFFFFF", 0.2), 2.4)}</g>`
          : iconGroup(ic9, gx - 16 * k, gy - 16 * k, 32 * k, "#AEB6C4", { strokeWidth: 2 * iconWK });
      }
      const selIc = opts.icon ?? emotes[selE9];
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${(dE + padE9 * 2).toFixed(0)}" height="${(dE + padE9 * 2).toFixed(0)}" viewBox="0 0 ${(dE + padE9 * 2).toFixed(0)} ${(dE + padE9 * 2).toFixed(0)}" data-emotewheel="1" data-wheel="${cE.toFixed(1)} ${cE.toFixed(1)}" role="img" aria-label="emote wheel">
<defs><linearGradient id="${gidE9}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.35), 0.45)}"/><stop offset="0.5" stop-color="${hexMix(bevel, effect(cfg.effects, "Inner Fill"), 0.25)}"/><stop offset="1" stop-color="${darken(bevel, 0.32)}"/></linearGradient></defs>
<g opacity="${state === "disabled" ? 0.45 : 1}">
  ${sect}
  <circle cx="${cE}" cy="${cE}" r="${rE.toFixed(1)}" fill="none" stroke="url(#${gidE9}r)" stroke-width="${Math.max(8, dE * 0.035).toFixed(1)}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(dE * 0.02).toFixed(1)}px ${hexRgba(glow, 0.45)})"` : ""}/>
  <circle cx="${cE}" cy="${cE}" r="${hubR.toFixed(1)}" fill="${wellFill}" stroke="${hexRgba(glow, 0.45)}" stroke-width="1.6"/>
  ${selIc ? themedIcon(selIc, cE - hubR * 0.5, cE - hubR * 0.5, hubR, hexMix(glow, "#FFFFFF", 0.2), 2.4) : ""}
</g>
</svg>`;
    }
    case "clancrest": {
      /* Social · clan crest — the shield silhouette carrying the emblem and
         tag ribbon. EDITING CONTRACT: label = the clan tag; icon = the
         emblem (swappable); a real button (native states). */
      const s = 180 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h: s, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: s * 0.92, shapeOverride: sov });
      const shellM = /data-shell0="([-\d. ]+)"/.exec(shell);
      if (!shellM) return shell;
      const [sx, sy, sw, sh] = shellM[1].split(" ").map(Number);
      const ccx = sx + sw / 2;
      const ic = opts.icon ?? STOCK_ICONS.sword;
      const emb = ic ? themedIcon(ic, ccx - 34 * k, sy + sh * 0.42 - 34 * k, 68 * k, hexMix(glow, "#FFFFFF", 0.25), 2.4) : "";
      const ribW = 132 * k, ribH = 36 * k;
      const ribY = sy + sh - ribH * 0.4;
      const gidC1 = "cc" + UID++;
      const ribbon = `<g${state !== "disabled" ? ` style="filter: drop-shadow(0 2px 3px rgba(6,10,18,0.45))"` : ""}>
        <defs><linearGradient id="${gidC1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(bevel, 0.3)}"/><stop offset="1" stop-color="${darken(bevel, 0.18)}"/></linearGradient></defs>
        <path d="M ${(ccx - ribW / 2).toFixed(1)} ${ribY.toFixed(1)} l ${(-14 * k).toFixed(1)} ${(ribH / 2).toFixed(1)} l ${(14 * k).toFixed(1)} ${(ribH / 2).toFixed(1)} h ${ribW.toFixed(1)} l ${(14 * k).toFixed(1)} ${(-ribH / 2).toFixed(1)} l ${(-14 * k).toFixed(1)} ${(-ribH / 2).toFixed(1)} Z" fill="url(#${gidC1})" stroke="${hexRgba(darken(bevel, 0.5), 0.7)}" stroke-width="1.4"/>
        <text x="${ccx.toFixed(1)}" y="${(ribY + ribH / 2 + 0.5).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(17 * k).toFixed(1)}" font-weight="900" letter-spacing="0.14em" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" style="paint-order: stroke; stroke: rgba(8,12,22,0.5); stroke-width: 2.4px; stroke-linejoin: round">${esc(opts.label ?? "[NOVA]")}</text></g>`;
      return inject(shell.replace("<svg ", '<svg data-clancrest="1" '), emb + ribbon);
    }
    case "seasontrack": {
      /* Social · season-pass segment — FREE and PREMIUM lanes around the
         level spine. Premium wears gold trim. EDITING CONTRACT: value =
         progress along the segment; premium tiles carry the gold semantic;
         the frame only dims for disabled. */
      const w = 640 * k, h = 210 * k;
      const shell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 10 * k;
      const vS1 = clamp(value ?? 0.5, 0, 1);
      const GOLD = "#FACC15";
      const laneH = 62 * k, tileS = 54 * k;
      const yFree = 33 + inset + 8 * k, yPrem = 33 + h - inset - 8 * k - laneH;
      const spineY = 33 + h / 2;
      const nT = 3;
      const tileXs = Array.from({ length: nT }, (_, i) => 42 + inset + 122 * k + i * ((w - inset * 2 - 192 * k) / (nT - 1)));
      const icsF = [STOCK_ICONS.flask, STOCK_ICONS.scroll, STOCK_ICONS.key];
      const icsP = [STOCK_ICONS.gem, STOCK_ICONS.crosshair, STOCK_ICONS.gift];
      let inner = infoText((opts.slots?.laneA ?? "FREE").slice(0, 12), 42 + inset + 8 * k, yFree + laneH / 2, 13 * k, "start", 800) +
        `<text x="${(42 + inset + 8 * k).toFixed(1)}" y="${(yPrem + laneH / 2).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="800" letter-spacing="0.1em" fill="${GOLD}" dominant-baseline="central" style="paint-order: stroke; stroke: rgba(8,12,22,0.4); stroke-width: 2px">${esc((opts.slots?.laneB ?? "PREMIUM").slice(0, 12))}</text>`;
      // the level spine with progress
      const spX0 = tileXs[0], spX1 = tileXs[nT - 1];
      inner += `<rect x="${(spX0 - 10 * k).toFixed(1)}" y="${(spineY - 5 * k).toFixed(1)}" width="${(spX1 - spX0 + 20 * k).toFixed(1)}" height="${(10 * k).toFixed(1)}" rx="${(5 * k).toFixed(1)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}"/>` +
        (vS1 > 0.02 ? `<rect x="${(spX0 - 10 * k + 2 * k).toFixed(1)}" y="${(spineY - 3 * k).toFixed(1)}" width="${Math.max(0, (spX1 - spX0 + 16 * k) * vS1).toFixed(1)}" height="${(6 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${glow}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px ${hexRgba(glow, 0.6)})"` : ""}/>` : "");
      tileXs.forEach((txX, i) => {
        const reached = i / (nT - 1) <= vS1;
        inner += `<circle cx="${txX.toFixed(1)}" cy="${spineY.toFixed(1)}" r="${(14 * k).toFixed(1)}" fill="${reached ? glow : wellFill}" stroke="${reached ? darken(glow, 0.35) : "rgba(255,255,255,0.25)"}" stroke-width="1.4"/>` +
          `<text x="${txX.toFixed(1)}" y="${(spineY + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="900" fill="${reached ? darken(bevel, 0.6) : infoInk}" text-anchor="middle" dominant-baseline="central">${12 + i}</text>`;
        const fx = txX - tileS / 2;
        inner += `<rect x="${fx.toFixed(1)}" y="${(yFree + (laneH - tileS) / 2).toFixed(1)}" width="${tileS.toFixed(1)}" height="${tileS.toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="${wellFill}" opacity="0.92" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>` +
          (icsF[i] ? themedIcon(icsF[i]!, txX - 15 * k, yFree + laneH / 2 - 15 * k, 30 * k, hexMix(glow, "#FFFFFF", 0.3), 2) : "") +
          `<rect x="${fx.toFixed(1)}" y="${(yPrem + (laneH - tileS) / 2).toFixed(1)}" width="${tileS.toFixed(1)}" height="${tileS.toFixed(1)}" rx="${(9 * k).toFixed(1)}" fill="${wellFill}" opacity="0.92" stroke="${GOLD}" stroke-width="1.6"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 2.5px rgba(250,204,21,0.4))"` : ""}/>` +
          (icsP[i] ? themedIcon(icsP[i]!, txX - 15 * k, yPrem + laneH / 2 - 15 * k, 30 * k, hexMix(glow, "#FFFFFF", 0.3), 2) : "");
      });
      return inject(shell.replace("<svg ", '<svg data-seasontrack="1" '), inner);
    }
    case "achievetoast": {
      /* Social · achievement toast — the gold moment. EDITING CONTRACT:
         label = the achievement name; gold is semantic; the medallion
         carries the star; states native. */
      const w = 560 * k, h = 112 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 120 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 5 * k;
      const cy = 30 + h / 2;
      const gidA0 = "at" + UID++;
      const mR = (h - inset * 2) * 0.36;
      const mX = 39 + inset + mR + 12 * k;
      const med = `<defs><radialGradient id="${gidA0}" cx="0.35" cy="0.3" r="0.95"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.55" stop-color="#FACC15"/><stop offset="1" stop-color="#B45309"/></radialGradient></defs>
        <circle cx="${mX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${mR.toFixed(1)}" fill="url(#${gidA0})" stroke="#92400E" stroke-width="1.8"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px rgba(250,204,21,0.6))"` : ""}/>
        <g transform="translate(${(mX - mR * 0.62).toFixed(1)} ${(cy - mR * 0.62).toFixed(1)})"><path d="${starPath(mR * 1.24)}" fill="#92400E" opacity="0.85"/></g>
        <ellipse cx="${(mX - mR * 0.3).toFixed(1)}" cy="${(cy - mR * 0.42).toFixed(1)}" rx="${(mR * 0.32).toFixed(1)}" ry="${(mR * 0.17).toFixed(1)}" fill="#FFFFFF" opacity="0.6"/>`;
      /* eyebrow ink + keyline answer to their color slots (KIT_SLOTS.achievetoast);
         untouched, the stroke keeps the soft translucent factory dark */
      const eyeC = opts.slots?.eyebrowColor ?? "#FACC15";
      const eyeS = opts.slots?.eyebrowStroke ?? "rgba(8,12,22,0.45)";
      const parts = med +
        `<text x="${(mX + mR + 16 * k).toFixed(1)}" y="${(cy - 15 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="800" letter-spacing="0.18em" fill="${eyeC}" dominant-baseline="central" style="paint-order: stroke; stroke: ${eyeS}; stroke-width: 2.2px">${esc((opts.slots?.eyebrow ?? "ACHIEVEMENT UNLOCKED").slice(0, 28))}</text>` +
        contentText(opts.label ?? "FIRST BLOOD", mX + mR + 16 * k, cy + 14 * k, 26 * k * typeK);
      return inject(shell.replace("<svg ", '<svg data-achievetoast="1" '), parts);
    }
    case "hotbar": {
      /* Sandbox · hotbar — a slot strip in the kit material; the selected
         cell carries the glow ring. value scrubs the selection. */
      const n = 9, cell = 88 * k, gap = 8 * k;
      const w = n * cell + (n - 1) * gap + 36 * k, h = cell + 26 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 118 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const selN = clamp(Math.round((value ?? 0.22) * (n - 1)), 0, n - 1);
      const x0h = 39 + (w - (n * cell + (n - 1) * gap)) / 2;
      const yh = 30 + (h - cell) / 2;
      /* v71: cell corners RIDE the Smoothness slider — on a pill shell the
         silhouette can't round any further, so the cells are where the
         control must visibly live (board-launched hotbars start on pill) */
      const cellR = Math.min(cell / 2, (3 + cfg.bevel.softness * 0.42) * k);
      const icons = [STOCK_ICONS.sword ?? STOCK_ICONS.star, STOCK_ICONS.shield ?? STOCK_ICONS.star, STOCK_ICONS.heart, STOCK_ICONS.gem ?? STOCK_ICONS.star, STOCK_ICONS.star];
      let cells = "";
      for (let i = 0; i < n; i++) {
        const cx0 = x0h + i * (cell + gap);
        const on = i === selN;
        cells += `<path d="${roundRect(cx0, yh, cell, cell, cellR)}" fill="${wellFill}" opacity="${on ? 0.98 : 0.85}"${on ? ` stroke="${glow}" stroke-width="${(3 * k).toFixed(1)}" style="filter: drop-shadow(0 0 ${6 * k}px ${glow})"` : ` stroke="${hexRgba(darken(bevel, 0.4), 0.6)}" stroke-width="1.2"`} data-cell="${i}"/>`;
        const ic = icons[i];
        if (i < icons.length && ic) cells += themedIcon(ic, cx0 + cell * 0.22, yh + cell * 0.22, cell * 0.56, hexMix(glow, "#FFFFFF", 0.3), 2);
        if (i === 0 || i === 3) cells += `<text x="${(cx0 + cell - 8 * k).toFixed(1)}" y="${(yh + cell - 10 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(17 * k).toFixed(1)}" font-weight="800" fill="rgba(255,255,255,0.85)" text-anchor="end">64</text>`;
        cells += infoText(String(i + 1), cx0 + 7 * k, yh + 17 * k, 13 * k, "start", 700);
      }
      return inject(track.replace("<svg ", '<svg data-hotbar="1" '), cells);
    }
    case "cardback": {
      /* Card battler · the set's card back. The theme fills the portrait
         shell, an inner frame line echoes the silhouette at a true offset,
         and the set emblem floats on its own radial glow. opts.label turns
         the back into a deck cover — the nameplate rides the bottom rail. */
      const w = 300 * k, h = 420 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 430 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const gid = "cb" + UID++;
      const frameP = wellOf(w, h, bw + 12 * k);
      const cxC = 39 + w / 2, cyC = 30 + h * (opts.label ? 0.44 : 0.5);
      const emb = opts.icon === null ? null : (opts.icon ?? STOCK_ICONS.gem ?? STOCK_ICONS.star);
      /* the card's own dials (KIT_SLOTS.cardback): emblem footprint,
         corner sparkles, inner frame — first choice is the factory look */
      const slC = opts.slots ?? {};
      const embS = w * (slC.emblem === "Small" ? 0.32 : slC.emblem === "Large" ? 0.56 : slC.emblem === "Hero" ? 0.66 : 0.44);
      const sparklesOn = slC.sparkles !== "Off";
      const frameOn = slC.frame !== "Off";
      const spark = (sx: number, sy: number, r: number) =>
        `<path d="M ${sx.toFixed(1)} ${(sy - r).toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} L ${(sx + r).toFixed(1)} ${sy.toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${sx.toFixed(1)} ${(sy + r).toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${(sx - r).toFixed(1)} ${sy.toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} Z" fill="${hexRgba(hexMix(glow, "#FFFFFF", 0.55), 0.85)}"/>`;
      let parts = `<defs><radialGradient id="${gid}g"><stop offset="0" stop-color="${glow}" stop-opacity="0.5"/><stop offset="0.6" stop-color="${glow}" stop-opacity="0.18"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`;
      if (frameOn) parts += `<path d="${frameP}" fill="none" stroke="${hexRgba(hexMix(glow, "#FFFFFF", 0.25), 0.55)}" stroke-width="${(2.4 * k).toFixed(1)}"/>`;
      if (emb) {
        // data-part stamp: Dissect must find the emblem — it IS this piece's icon
        parts += `<g data-part="icon"><circle cx="${cxC.toFixed(1)}" cy="${cyC.toFixed(1)}" r="${(embS * 0.85).toFixed(1)}" fill="url(#${gid}g)"/>` +
          `<g${emblemFx(10 * k, glow)}>${themedIcon(emb, cxC - embS / 2, cyC - embS / 2, embS, hexMix(glow, "#FFFFFF", 0.35), 1.8)}</g></g>`;
      }
      const inX = 39 + bw + 34 * k, inY = 30 + bw + 34 * k;
      if (sparklesOn) parts += spark(inX, inY, 7 * k) + spark(39 + w - bw - 34 * k, inY, 7 * k) + spark(inX, 30 + h - bw - 34 * k, 5 * k) + spark(39 + w - bw - 34 * k, 30 + h - bw - 34 * k, 5 * k);
      if (opts.label) {
        const py = 30 + h - 76 * k;
        parts += `<g data-part="label"><path d="${roundRect(39 + w * 0.12, py, w * 0.76, 46 * k, 12 * k)}" fill="${wellFill}" opacity="0.94" stroke="${hexRgba(darken(bevel, 0.35), 0.6)}" stroke-width="1"/>` +
          `<text x="${cxC.toFixed(1)}" y="${(py + 23 * k + 1).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(17 * k * typeK).toFixed(1)}" font-weight="800" letter-spacing="1.5" fill="${hexMix(glow, "#FFFFFF", 0.4)}" text-anchor="middle" dominant-baseline="central">${esc(opts.label)}</text></g>`;
      }
      return inject(track.replace("<svg ", '<svg data-cardback="1" '), parts);
    }
    case "pack": {
      /* Card battler · booster pack — the engine body wears crimped foil
         caps top and bottom; the set emblem glows at the heart. Clicking
         it in play mode fires the white-hot ignition + themed burst. */
      const w = 310 * k, h = 430 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 440 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const gid = "pk" + UID++;
      const crimp = (yTop: number) => {
        const chh = 34 * k, cx0 = 39 - 5 * k, cw = w + 10 * k;
        let ridges = "";
        for (let rx = cx0 + 8 * k; rx < cx0 + cw - 6 * k; rx += 9 * k)
          ridges += `<line x1="${rx.toFixed(1)}" y1="${(yTop + 4 * k).toFixed(1)}" x2="${rx.toFixed(1)}" y2="${(yTop + chh - 4 * k).toFixed(1)}" stroke="rgba(255,255,255,0.16)" stroke-width="${(2.2 * k).toFixed(1)}"/>`;
        return `<path d="${roundRect(cx0, yTop, cw, chh, 7 * k)}" fill="${darken(bevel, 0.22)}" stroke="${hexRgba(darken(bevel, 0.5), 0.8)}" stroke-width="1"/>
          <path d="${roundRect(cx0, yTop, cw, chh * 0.45, 7 * k)}" fill="rgba(255,255,255,0.14)"/>${ridges}`;
      };
      const cxP = 39 + w / 2, cyP = 30 + h * 0.44;
      const emb = opts.icon === null ? null : (opts.icon ?? STOCK_ICONS.gem ?? STOCK_ICONS.star);
      const embS = w * 0.4;
      const sparkP = (sx: number, sy: number, r: number) =>
        `<path d="M ${sx.toFixed(1)} ${(sy - r).toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} L ${(sx + r).toFixed(1)} ${sy.toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${sx.toFixed(1)} ${(sy + r).toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${(sx - r).toFixed(1)} ${sy.toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} Z" fill="${hexRgba(hexMix(glow, "#FFFFFF", 0.55), 0.85)}"/>`;
      let parts = `<defs><radialGradient id="${gid}g"><stop offset="0" stop-color="${glow}" stop-opacity="0.5"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`;
      if (emb) {
        // same stamp as the card back — the pack's emblem answers to Dissect too
        parts += `<g data-part="icon"><circle cx="${cxP.toFixed(1)}" cy="${cyP.toFixed(1)}" r="${(embS * 0.8).toFixed(1)}" fill="url(#${gid}g)"/>` +
          `<g${emblemFx(9 * k, glow)}>${themedIcon(emb, cxP - embS / 2, cyP - embS / 2, embS, hexMix(glow, "#FFFFFF", 0.35), 1.8)}</g></g>`;
      }
      parts += sparkP(39 + w * 0.24, 30 + h * 0.26, 6 * k) + sparkP(39 + w * 0.78, 30 + h * 0.32, 8 * k) + sparkP(39 + w * 0.3, 30 + h * 0.66, 5 * k);
      parts += `<g data-part="label"><text x="${cxP.toFixed(1)}" y="${(30 + h * 0.72).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(19 * k * typeK).toFixed(1)}" font-weight="800" letter-spacing="2" fill="${hexMix(glow, "#FFFFFF", 0.4)}" text-anchor="middle" dominant-baseline="central">${esc(opts.label ?? "12 CARDS")}</text></g>`;
      parts += crimp(30 - 2 * k) + crimp(30 + h - 32 * k);
      return inject(track.replace("<svg ", '<svg data-pack="1" '), parts);
    }
    case "resource": {
      /* HUD counter — icon medallion, numeric value, optional /max, optional
         add button. Currency, lives, energy, tickets, materials. */
      const h = 78 * k;
      const val = opts.label ?? "1,250";
      const maxTxt = opts.max ? ` / ${opts.max}` : "";
      const fsV = 30 * k;
      // width breathes with the type scale and leaves real air after the
      // digits — six-figure values must not kiss the trailing wall
      const textW = (val.length + maxTxt.length) * fsV * typeK * 0.66;
      const addW = opts.addBtn ? 46 * k : 0;
      const w = Math.max(164 * k, 66 * k + textW + addW + 62 * k);
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const cy = 30 + h / 2;
      const medR = h * 0.44;
      const noIcon = opts.icon === null; // removed glyph — the value centers
      const icon = opts.icon ?? STOCK_ICONS.gem;
      const dim = state === "disabled" ? 0.45 : 1;
      const parts =
        (noIcon ? "" :
          candyKnob(39 + 6 * k + medR, cy, medR, bevel) +
          themedIcon(icon, 39 + 6 * k + medR - medR * 0.52, cy - medR * 0.52, medR * 1.04, darken(bevel, 0.55), 2.4)) +
        (noIcon
          ? contentText(`${val}${maxTxt}`, 39 + (w - (opts.addBtn ? 46 * k : 0)) / 2, cy + 1, fsV * typeK, { anchor: "middle", keepCase: true, opacity: dim })
          : contentText(val, 39 + 20 * k + medR * 2, cy + 1, fsV * typeK, { keepCase: true, opacity: dim }) +
            /* the divider gets REAL air: 0.7em advance per value glyph (heavy
               italic faces overhang) plus a 0.36em gap — and no leading space
               in the <text>, since SVG collapses it and the slash would kiss
               the last digit (the visual gate caught exactly that) */
            (maxTxt ? `<text x="${(39 + 20 * k + medR * 2 + val.length * fsV * typeK * 0.7 + fsV * typeK * 0.36).toFixed(1)}" y="${(cy + 1 + typeOyK * k).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(fsV * typeK * 0.8).toFixed(1)}" font-weight="650" fill="${infoInk}" dominant-baseline="central">${esc(`/ ${opts.max}`)}</text>` : "")) +
        (opts.addBtn ? candyKnob(39 + w - 8 * k - h * 0.32, cy, h * 0.32, glow) +
          `<text x="${(39 + w - 8 * k - h * 0.32).toFixed(1)}" y="${(cy + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${26 * k}" font-weight="800" fill="${darken(bevel, 0.6)}" text-anchor="middle" dominant-baseline="central">+</text>` : "");
      return inject(track, parts);
    }
    case "datarow": {
      /* Data row — portrait slot, two independent text groups, mini progress,
         trailing action. Characters, missions, inventory, shop rows. */
      const R2 = opts.row ?? {};
      const w = 620 * k;
      /* overlap-proof: type sizes are known before the shell exists, so the
         block's height GROWS with the stack — title line + sub line + bar can
         never collide no matter how big the display face gets (universal
         no-overlap law). 128k stands as the floor so default kits don't move. */
      const sizeK2 = clamp(cfg.type.size / 52, 0.5, 2.2);
      const fsT = 26 * k * sizeK2 * ((R2.titleSize ?? 100) / 100);
      const fsS = 17 * k * Math.max(0.75, sizeK2 * 0.85 + 0.15) * ((R2.subSize ?? 100) / 100);
      const inset = bw + 6;
      const showAvatar = R2.avatar ?? true;
      const showBar = R2.progress ?? true;
      const showAction = R2.action ?? true;
      const lineAdv = Math.max(24 * k, fsT * 0.55 + fsS * 0.78 + 4 * k);
      const subOn = R2.subOn !== false;
      const needH = inset + 16 * k + (subOn ? lineAdv + fsS * 0.6 : fsT * 0.55) + (showBar ? 36 * k : 16 * k) + inset;
      const h = Math.max(128 * k, needH);
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 128 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const slotS = h - inset * 2 - 8;
      const sx = 39 + inset + 6, sy2 = 30 + inset + 4 + 2;
      const icon = opts.icon ?? STOCK_ICONS.user;
      const tx = showAvatar ? sx + slotS + 16 * k : 39 + inset + 12 * k;
      const dim = state === "disabled" ? 0.45 : 1;
      const title = opts.label ?? R2.title ?? "Shadow Knight";
      const sub = opts.sub ?? R2.sub ?? "Level 12 · Warrior";

      const barY = 30 + h - inset - 16 * k;
      const barW = w - (tx - 39) - (showAction ? 90 * k : 34 * k);
      const fillW2 = barW * clamp(value ?? (R2.value !== undefined ? R2.value / 100 : 0.4), 0, 1);
      const gid2 = "dr" + UID++;
      const ov = opts.overlay ?? "";
      // safe text bounds — long labels clip inside the row, never break layout
      const clipW = w - (tx - 39) - (showAction ? 74 * k : 22 * k);
      const parts =
        `<defs><clipPath id="${gid2}c"><rect x="${tx.toFixed(1)}" y="${30 + 2}" width="${clipW.toFixed(1)}" height="${h - 4}"/></clipPath>
         <linearGradient id="${gid2}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>` +
        (showAvatar
          ? `<path d="${roundRect(sx, sy2, slotS, slotS, 10 * k)}" fill="${wellFill}" opacity="0.92"/>` +
            (opts.icon === null ? "" : themedIcon(icon, sx + slotS * 0.2, sy2 + slotS * 0.2, slotS * 0.6, glow, 2))
          : "") +
        `<g clip-path="url(#${gid2}c)">` +
        contentText(title, tx, 30 + inset + 16 * k + ((R2.titleDy ?? 0) + (R2.blockDy ?? 0) + (opts.textOy ?? 0)) * k, fsT, { keepCase: true, track: R2.titleTrack ?? 0, opacity: dim }) +
        /* auto-leading from BOTH line heights: the title's lower half (with
           its depth treatment) plus the subtitle's cap height — big display
           type can never crash into line two (universal no-overlap law) */
        (!subOn ? "" :
          /* auto ink, no outline: the sub line takes the color group's
             DARKEST role (Shadow) on light faces, near-white on dark —
             legible without a stroke */
          `<text x="${tx.toFixed(1)}" y="${(30 + inset + 16 * k + lineAdv + ((R2.subDy ?? 0) + (R2.lineGap ?? 0) + (R2.blockDy ?? 0) + (opts.textOy ?? 0)) * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${fsS.toFixed(1)}" font-weight="650" letter-spacing="${((R2.subTrack ?? 0) / 100).toFixed(3)}em" fill="${R2.subColor ?? (cfg.face.mode === "dark" ? "rgba(255,255,255,0.82)" : darken(effect(cfg.effects, "Shadow"), 0.15))}">${esc(sub)}</text>`) +
        `</g>` +
        (showBar
          /* the mercury sits in a sunken container pill with negative space
             all around — same read as the loading bar, minus the frame */
          ? (() => {
              const trackH = 16 * k, mercH = 10 * k, gapM = (trackH - mercH) / 2;
              const mercW = Math.max(0, fillW2 - gapM * 2);
              const rfx = barFx(gid2, tx + gapM, barY, mercW, mercH, mercH / 2);
              return `<defs>${rfx.defs}</defs><path d="${roundRect(tx, barY - gapM, barW, trackH, trackH / 2)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.8)}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>` +
                (mercW > 1 ? `${rfx.open}<path d="${roundRect(tx + gapM, barY, mercW, mercH, mercH / 2)}" fill="url(#${gid2})" opacity="${dim}"/>${rfx.close}${rfx.over}` : "");
            })()
          : "") +
        (!showAction ? ""
          : ov === "locked"
            ? iconGroup(STOCK_ICONS.lock, 39 + w - 52 * k, 30 + h / 2 - 14 * k, 28 * k, "rgba(255,255,255,0.75)", { strokeWidth: 2.2 * iconWK })
            : ov === "check"
              ? iconGroup(STOCK_ICONS.check, 39 + w - 52 * k, 30 + h / 2 - 14 * k, 28 * k, glow, { strokeWidth: 2.6 * iconWK })
              : ov === "alert"
                ? iconGroup(STOCK_ICONS.warning, 39 + w - 52 * k, 30 + h / 2 - 14 * k, 28 * k, hexMix(glow, "#FFFFFF", 0.3), { strokeWidth: 2.2 * iconWK })
                : iconGroup(STOCK_ICONS.forward, 39 + w - 48 * k, 30 + h / 2 - 12 * k, 24 * k, "rgba(255,255,255,0.6)", { strokeWidth: 2.4 * iconWK }));
      return inject(track, parts);
    }
    case "joystick": {
      // mobile touch stick: circular well, dashed travel ring, candy knob.
      // opts.stick deflects the knob; data-stick lets the host drive it live.
      const d2 = ({ s: 210, m: 270, l: 340 } as const)[size];
      if (opts.overlay === "ghost") {
        // the overlay stick is its own construction — pure strokes and glass
        // fills designed to sit on live gameplay, not a faded solid control
        const pad2 = 18;
        const cxg = d2 / 2 + pad2, cyg = d2 / 2 + pad2;
        const R = d2 / 2, krg = d2 * 0.27;
        const maxOffG = R - krg - 10;
        const sxg = clamp(opts.stick?.[0] ?? 0, -1, 1), syg = clamp(opts.stick?.[1] ?? 0, -1, 1);
        const magG = Math.hypot(sxg, syg), fg = magG > 1 ? 1 / magG : 1;
        const kxg = cxg + sxg * fg * maxOffG, kyg = cyg + syg * fg * maxOffG;
        const rim = hexMix(glow, "#FFFFFF", 0.42);
        const tick = (a: number) => {
          const c = Math.cos(a), s3 = Math.sin(a);
          return `<line x1="${(cxg + c * (R - 7)).toFixed(1)}" y1="${(cyg + s3 * (R - 7)).toFixed(1)}" x2="${(cxg + c * (R + 5)).toFixed(1)}" y2="${(cyg + s3 * (R + 5)).toFixed(1)}" stroke="${rim}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`;
        };
        const chev = (a: number) => {
          const c = Math.cos(a), s3 = Math.sin(a);
          const px = cxg + c * (R - 24), py = cyg + s3 * (R - 24);
          const deg = a * 180 / Math.PI + 90;
          return `<path d="M-8 4 L0 -5 L8 4" fill="none" stroke="${rim}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="0.55" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${deg.toFixed(0)})"/>`;
        };
        const gid = "gj" + UID++;
        const gsvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d2 + pad2 * 2}" height="${d2 + pad2 * 2}" viewBox="0 0 ${d2 + pad2 * 2} ${d2 + pad2 * 2}" role="img" aria-label="joystick overlay, ${state} state">
<defs>
  <radialGradient id="${gid}w"><stop offset="0.55" stop-color="${glow}" stop-opacity="0.05"/><stop offset="0.92" stop-color="${glow}" stop-opacity="0.16"/><stop offset="1" stop-color="${glow}" stop-opacity="0.02"/></radialGradient>
  <radialGradient id="${gid}k" cx="0.38" cy="0.32" r="0.95"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="0.6" stop-color="${rim}" stop-opacity="0.16"/><stop offset="1" stop-color="${rim}" stop-opacity="0.05"/></radialGradient>
</defs>
<g>
  <circle cx="${cxg}" cy="${cyg}" r="${R}" fill="url(#${gid}w)" stroke="${rim}" stroke-width="2.5" opacity="0.9"/>
  <circle cx="${cxg}" cy="${cyg}" r="${(R - 5).toFixed(1)}" fill="none" stroke="${rim}" stroke-width="1" opacity="0.35"/>
  <circle cx="${cxg}" cy="${cyg}" r="${(maxOffG + krg * 0.45).toFixed(1)}" fill="none" stroke="${rim}" stroke-width="1.8" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.7"/>
  ${tick(0)}${tick(Math.PI / 2)}${tick(Math.PI)}${tick(-Math.PI / 2)}
  ${chev(-Math.PI / 2)}${chev(0)}${chev(Math.PI / 2)}${chev(Math.PI)}
  <circle cx="${kxg.toFixed(1)}" cy="${kyg.toFixed(1)}" r="${krg.toFixed(1)}" fill="url(#${gid}k)" stroke="${rim}" stroke-width="2.5" opacity="0.95"/>
  <circle cx="${kxg.toFixed(1)}" cy="${kyg.toFixed(1)}" r="${(krg * 0.42).toFixed(1)}" fill="none" stroke="${rim}" stroke-width="1.5" opacity="0.55"/>
  <circle cx="${kxg.toFixed(1)}" cy="${kyg.toFixed(1)}" r="${(krg * 0.14).toFixed(1)}" fill="${hexMix(glow, "#FFFFFF", 0.6)}" opacity="0.95"/>
</g>
</svg>`;
        return gsvg.replace("<svg ", `<svg data-stick="${cxg} ${cyg} ${maxOffG.toFixed(1)}" `);
      }
      const track = build(cfg, state, { x: 33, y: 27, h: d2, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: d2, shapeOverride: "pill" });
      const inset2 = bw + 5;
      const cx2 = 33 + d2 / 2, cy2 = 27 + d2 / 2;
      const kr2 = d2 * 0.3;
      const maxOff = d2 / 2 - inset2 - kr2 - 7;
      const sx2 = clamp(opts.stick?.[0] ?? 0, -1, 1), sy3 = clamp(opts.stick?.[1] ?? 0, -1, 1);
      const mag = Math.hypot(sx2, sy3), f2 = mag > 1 ? 1 / mag : 1;
      const svg2 = inject(track,
        `<path d="${roundRect(33 + inset2, 27 + inset2, d2 - inset2 * 2, d2 - inset2 * 2, (d2 - inset2 * 2) / 2)}" fill="${wellFill}" opacity="0.94"/>
         <circle cx="${cx2}" cy="${cy2}" r="${(maxOff + kr2 * 0.5).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="3 8"/>` +
        candyKnob(cx2 + sx2 * f2 * maxOff, cy2 + sy3 * f2 * maxOff, kr2, knobC, state === "disabled" ? "#A7AAB4" : glow));
      return svg2.replace("<svg ", `<svg data-stick="${cx2} ${cy2} ${maxOff.toFixed(1)}" `);
    }
    case "slot": {
      /* Portrait / item slot — square frame with stackable status overlays.
         The icon is the replaceable media slot. */
      const s2 = ({ s: 104, m: 128, l: 168 } as Record<KitSize, number>)[size] * k;
      const track = build(cfg, state, { x: 33, y: 27, h: s2, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: s2, shapeOverride: sov });
      const inset = bw + 5;
      const cx2 = 33 + s2 / 2, cy2 = 27 + s2 / 2;
      const inner = s2 - inset * 2;
      const ov = opts.overlay ?? (opts.icon === null ? "empty" : "");
      const dimmed = ov === "locked" || ov.startsWith("cooldown");
      const parts: string[] = [];
      // the well mirrors the slot's own silhouette — a round slot gets a
      // round well, never a rectangular mask inside a circle
      const wellPath = shapePath(sov ?? cfg.shape, 33 + inset, 27 + inset, inner, inner, Math.max(0, cfg.bevel.softness - 10));
      parts.push(`<path d="${wellPath}" fill="${wellFill}" opacity="0.9"/>`);
      if (ov === "empty") {
        parts.push(`<path d="${shapePath(sov ?? cfg.shape, 33 + inset + 8, 27 + inset + 8, inner - 16, inner - 16, Math.max(0, cfg.bevel.softness - 10))}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-dasharray="6 5"/>`);
      } else if (opts.icon && !ov.startsWith("level")) {
        // type treatment: the outline underlay and a lit fill, like the label
        // (level slots skip the icon — the number is the content, nothing
        // may ghost behind it). iconScale > 1 makes the icon the star of
        // the tile — match-3 boards, gem grids.
        const isc = clamp(opts.iconScale ?? 1, 0.5, 1.45);
        parts.push(themedIcon(opts.icon, cx2 - inner * 0.3 * isc, cy2 - inner * 0.3 * isc, inner * 0.6 * isc, hexMix(glow, "#FFFFFF", 0.3), 2));
      }
      if (dimmed) parts.push(`<path d="${wellPath}" fill="rgba(6,8,16,0.62)"/>`);
      if (ov === "locked") parts.push(iconGroup(STOCK_ICONS.lock, cx2 - 13, cy2 - 13, 26, "rgba(255,255,255,0.85)", { strokeWidth: 2.2 * iconWK }));
      if (ov.startsWith("cooldown")) {
        parts.push(`<text x="${cx2.toFixed(1)}" y="${(cy2 + 1).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${inner * 0.32}" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${esc(ov.split(":")[1] ?? "12s")}</text>`);
      }
      if (ov.startsWith("count")) {
        const n = ov.split(":")[1] ?? "1";
        const bx2 = 33 + s2 - inset - 4, by2 = 27 + s2 - inset - 4;
        parts.push(`<circle cx="${bx2}" cy="${by2}" r="15" fill="${bevel}" stroke="${darken(bevel, 0.4)}" stroke-width="1.5"/><text x="${bx2}" y="${by2 + 1}" font-family="Inter, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${esc(n)}</text>`);
      }
      if (ov.startsWith("level")) {
        // the level IS the content — big number in the kit's own type
        const n = ov.split(":")[1] ?? "1";
        parts.push(`<text x="${cx2}" y="${(27 + inset + 13).toFixed(1)}" font-family="Inter, sans-serif" font-size="11" font-weight="800" letter-spacing=".2em" fill="rgba(255,255,255,0.55)" text-anchor="middle" dominant-baseline="central">LV</text>`);
        parts.push(`<text x="${cx2}" y="${(cy2 + 8).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(inner * 0.48).toFixed(1)}" font-weight="800" fill="${hexMix(glow, "#FFFFFF", 0.3)}" stroke="${darken(bevel, 0.5)}" stroke-width="${(inner * 0.03).toFixed(1)}" paint-order="stroke" text-anchor="middle" dominant-baseline="central">${esc(n)}</text>`);
      }
      if (ov === "new") {
        parts.push(`<circle cx="${33 + s2 - inset - 2}" cy="${27 + inset + 2}" r="13" fill="${glow}" stroke="${darken(bevel, 0.45)}" stroke-width="1.5"/><text x="${33 + s2 - inset - 2}" y="${27 + inset + 3}" font-family="Inter, sans-serif" font-size="15" font-weight="900" fill="${darken(bevel, 0.6)}" text-anchor="middle" dominant-baseline="central">!</text>`);
      }
      if (ov === "check" || ov === "equipped" || ov === "claimable") {
        parts.push(`<circle cx="${33 + s2 - inset - 2}" cy="${27 + inset + 2}" r="13" fill="${ov === "claimable" ? glow : bevel}" stroke="${darken(bevel, 0.45)}" stroke-width="1.5"/>` +
          iconGroup(STOCK_ICONS.check, 33 + s2 - inset - 10, 27 + inset - 6, 16, ov === "claimable" ? darken(bevel, 0.6) : "#FFFFFF", { strokeWidth: 3 * iconWK }));
      }
      return inject(track, parts.join(""));
    }
    case "orb": {
      /* Glow orb — a lit candy sphere for streaks, statuses and day markers.
         value > 0.5 = lit: full material with a halo; off = dark glass.
         Inherits the theme's roles; the whole piece is the light. */
      const d3 = ({ s: 56, m: 76, l: 100 } as Record<KitSize, number>)[size] * k;
      const pad3 = 34;
      const lit = (value ?? 1) > 0.5 && state !== "disabled";
      const cx4 = d3 / 2 + pad3, cy4 = d3 / 2 + pad3, r4 = d3 / 2;
      const gid7 = "ob" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const offFace = desaturate(hexMix(bevel, "#20242E", 0.72), 0.5);
      const total3 = d3 + pad3 * 2;
      const totH3 = total3 + 14; // extra floor below the sphere — captions need air
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total3}" height="${totH3}" viewBox="0 0 ${total3} ${totH3}" data-shell="${pad3} ${pad3} ${d3.toFixed(1)} ${d3.toFixed(1)}" role="img" aria-label="glow orb" data-orb="${lit ? "1" : "0"}">
<defs>
  <radialGradient id="${gid7}" cx="0.34" cy="0.28" r="0.95">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="0.34" stop-color="${lit ? lighten(bevel, 0.62) : lighten(offFace, 0.25)}"/>
    <stop offset="0.78" stop-color="${lit ? bevel : offFace}"/>
    <stop offset="1" stop-color="${lit ? darken(bevel, 0.3) : darken(offFace, 0.35)}"/>
  </radialGradient>
  <filter id="${gid7}h" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="${(r4 * 0.42).toFixed(1)}"/></filter>
</defs>
<g opacity="${dim}">
  ${lit ? `<circle cx="${cx4}" cy="${cy4}" r="${(r4 * 1.06).toFixed(1)}" fill="${glow}" filter="url(#${gid7}h)" opacity="0.75"/>` : ""}
  <circle cx="${cx4}" cy="${cy4}" r="${r4.toFixed(1)}" fill="url(#${gid7})" stroke="${lit ? darken(bevel, 0.42) : darken(offFace, 0.4)}" stroke-width="${Math.max(1.5, r4 * 0.06).toFixed(1)}"/>
  <circle cx="${cx4}" cy="${cy4}" r="${(r4 * 0.8).toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="${lit ? 0.28 : 0.1}"/>
  <ellipse cx="${(cx4 - r4 * 0.32).toFixed(1)}" cy="${(cy4 - r4 * 0.42).toFixed(1)}" rx="${(r4 * 0.34).toFixed(1)}" ry="${(r4 * 0.2).toFixed(1)}" fill="#FFFFFF" opacity="${lit ? 0.9 : 0.35}"/>
  <ellipse cx="${cx4}" cy="${(cy4 + r4 * 0.55).toFixed(1)}" rx="${(r4 * 0.5).toFixed(1)}" ry="${(r4 * 0.16).toFixed(1)}" fill="${lit ? glow : "#FFFFFF"}" opacity="${lit ? 0.5 : 0.08}"/>
</g>
</svg>`;
    }
    case "reticle": {
      /* targeting reticle — spatial UI, no shell, semi-transparent strokes.
         kinds: ring (default) and brackets. */
      const d3 = ({ s: 150, m: 190, l: 240 } as const)[size];
      const c3 = d3 / 2;
      // hover / pressed = locked on: everything closes in and burns brighter
      const locked = state === "hover" || state === "pressed";
      const lockC = locked ? hexMix(glow, "#FFFFFF", 0.35) : glow;
      const rc = hexRgba(lockC, locked ? 1 : 0.85), rc2 = hexRgba(lockC, locked ? 0.6 : 0.4);
      const kIn = locked ? 0.78 : 1; // lock-on contraction
      const parts3: string[] = [];
      if (opts.kind === ("brackets" as never) || opts.overlay === "brackets") {
        const L = d3 * 0.2, o2 = d3 * 0.08 + (locked ? d3 * 0.07 : 0);
        const b4 = (x1: number, y1: number, hx: number, hy: number) =>
          `<path d="M ${x1} ${y1 + hy * L} L ${x1} ${y1} L ${x1 + hx * L} ${y1}" fill="none" stroke="${rc}" stroke-width="${locked ? 4.5 : 3.5}" stroke-linecap="round"/>`;
        parts3.push(b4(o2, o2, 1, 1), b4(d3 - o2, o2, -1, 1), b4(o2, d3 - o2, 1, -1), b4(d3 - o2, d3 - o2, -1, -1));
        if (locked) parts3.push(`<circle cx="${c3}" cy="${c3}" r="${d3 * 0.1}" fill="none" stroke="${rc}" stroke-width="2.5"/>`);
        parts3.push(`<circle cx="${c3}" cy="${c3}" r="${locked ? 4.6 : 3.4}" fill="${rc}"/>`);
      } else {
        parts3.push(`<circle cx="${c3}" cy="${c3}" r="${(d3 * 0.36 * kIn).toFixed(1)}" fill="none" stroke="${rc}" stroke-width="${locked ? 4 : 3}"/>`);
        parts3.push(`<circle cx="${c3}" cy="${c3}" r="${(d3 * 0.24 * kIn).toFixed(1)}" fill="none" stroke="${rc2}" stroke-width="1.6"${locked ? "" : ' stroke-dasharray="4 6"'}/>`);
        const rO = d3 * 0.36 * kIn, rT = locked ? d3 * 0.43 : d3 * 0.47;
        ([[c3, c3 - rO, c3, c3 - rT], [c3, c3 + rO, c3, c3 + rT], [c3 - rO, c3, c3 - rT, c3], [c3 + rO, c3, c3 + rT, c3]] as const)
          .forEach(([x1, y1, x2, y2]) => parts3.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${rc}" stroke-width="${locked ? 4 : 3}" stroke-linecap="round"/>`));
        parts3.push(`<circle cx="${c3}" cy="${c3}" r="${locked ? 4.4 : 3.2}" fill="${rc}"/>`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d3}" height="${d3}" viewBox="0 0 ${d3} ${d3}" role="img" aria-label="reticle${locked ? ", locked on" : ""}" style="filter: drop-shadow(0 0 ${locked ? 9 : 5}px ${hexRgba(lockC, locked ? 0.75 : 0.5)})">${parts3.join("")}</svg>`;
    }
    case "minimap": {
      /* mini-map — kinds: round compass, square radar. Well + markers. */
      const round2 = opts.kind !== ("square" as never) && opts.overlay !== "square";
      const d4 = ({ s: 180, m: 230, l: 290 } as const)[size];
      const track = build(cfg, state, { x: 33, y: 27, h: d4, fs: 0, iconSize: 0, tokenH: 132 }, { iconDef: null, label: "", fixedW: d4, shapeOverride: round2 ? "pill" : "round" });
      const inset4 = bw + 5;
      const cx4 = 33 + d4 / 2, cy4 = 27 + d4 / 2;
      const innerR = d4 / 2 - inset4;
      const wellP2 = round2
        ? `M ${cx4 - innerR} ${cy4} a ${innerR} ${innerR} 0 1 0 ${innerR * 2} 0 a ${innerR} ${innerR} 0 1 0 ${-innerR * 2} 0`
        : roundRect(33 + inset4, 27 + inset4, d4 - inset4 * 2, d4 - inset4 * 2, 12);
      const mp: string[] = [`<path d="${wellP2}" fill="${wellFill}" opacity="0.94"/>`];
      mp.push(`<path d="M ${cx4 - innerR} ${cy4} H ${cx4 + innerR} M ${cx4} ${cy4 - innerR} V ${cy4 + innerR}" stroke="rgba(255,255,255,0.1)" stroke-width="1.4"/>`);
      if (!round2) mp.push(`<path d="M ${33 + inset4} ${cy4 - innerR * 0.5} H ${33 + d4 - inset4} M ${33 + inset4} ${cy4 + innerR * 0.5} H ${33 + d4 - inset4} M ${cx4 - innerR * 0.5} ${27 + inset4} V ${27 + d4 - inset4} M ${cx4 + innerR * 0.5} ${27 + inset4} V ${27 + d4 - inset4}" stroke="rgba(255,255,255,0.06)" stroke-width="1.2"/>`);
      // blips + player arrow
      mp.push(`<circle cx="${cx4 - innerR * 0.42}" cy="${cy4 - innerR * 0.3}" r="5" fill="${glow}"/>`);
      mp.push(`<circle cx="${cx4 + innerR * 0.36}" cy="${cy4 + innerR * 0.4}" r="5" fill="${hexMix(glow, "#FFFFFF", 0.4)}"/>`);
      mp.push(`<circle cx="${cx4 + innerR * 0.5}" cy="${cy4 - innerR * 0.48}" r="4" fill="rgba(255,255,255,0.5)"/>`);
      mp.push(`<path d="M ${cx4} ${cy4 - 11} L ${cx4 + 8} ${cy4 + 8} L ${cx4} ${cy4 + 3} L ${cx4 - 8} ${cy4 + 8} Z" fill="#FFFFFF" stroke="${darken(bevel, 0.4)}" stroke-width="1.4"/>`);
      if (round2) mp.push(`<text x="${cx4}" y="${27 + inset4 + 11}" font-family="Inter, sans-serif" font-size="12.5" font-weight="800" fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="central">N</text>`);
      return inject(track, mp.join(""));
    }
    case "ammo": {
      /* ammo counter — magazine / reserve with round pictos, HUD strip. */
      const h5 = 96 * k;
      const cur = opts.label ?? "24", res = opts.max ?? "90";
      const w5 = 132 * k + (cur.length + res.length) * 20 * k * clamp(cfg.type.size / 52, 0.5, 2.2);
      const track = build(cfg, state, { x: 39, y: 30, h: h5, fs: 0, iconSize: 0 }, { iconDef: null, label: "", fixedW: w5, shapeOverride: sov });
      const cy5 = 30 + h5 / 2;
      const bullets = [0, 1, 2].map((i) =>
        `<rect x="${(39 + 16 * k + i * 9 * k).toFixed(1)}" y="${(cy5 - 14 * k + i * 3 * k).toFixed(1)}" width="${5 * k}" height="${(28 - i * 6) * k}" rx="${2.4 * k}" fill="${hexMix(glow, "#FFFFFF", 0.25)}" stroke="${darken(bevel, 0.45)}" stroke-width="1"/>`).join("");
      const txt = contentText(cur, 39 + 48 * k, cy5 + 1, 34 * k * typeK, { keepCase: true }) +
        // small-white rule: the reserve count wears the understroke
        infoText(`/ ${res}`, 39 + 48 * k + cur.length * 21 * k * typeK + 6 * k, cy5 + 4 + typeOyK * k, 18 * k * Math.max(0.8, typeK * 0.85 + 0.15), "start", 700);
      return inject(track, bullets + txt);
    }
    case "lives": {
      /* lives — candy hearts, no container (spatial HUD). value = full/max */
      const n5 = Math.max(1, Math.min(9, parseInt(opts.max ?? "5", 10) || 5));
      const full = Math.max(0, Math.min(n5, parseInt(opts.label ?? "3", 10) || 3));
      const hs = ({ s: 46, m: 58, l: 72 } as const)[size];
      const gap5 = hs * 0.18;
      const W5 = n5 * hs + (n5 - 1) * gap5, H5 = hs * 1.14;
      const hearts = Array.from({ length: n5 }, (_, i) => {
        const x0 = i * (hs + gap5);
        const on = i < full;
        return iconGroup(STOCK_ICONS.heart, x0, hs * 0.08, hs, on ? glow : "rgba(140,146,168,0.35)",
          { strokeWidth: 2.4 * iconWK, filter: on ? `drop-shadow(0 0 6px ${hexRgba(glow, 0.6)})` : undefined });
      }).join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W5}" height="${H5}" viewBox="0 0 ${W5} ${H5}" role="img" aria-label="lives: ${full} of ${n5}">${hearts}</svg>`;
    }
    case "bignum": {
      // celebratory numbers — pure display type, no container
      return renderTypeSpecimen(cfg, opts.label ?? "+9,999");
    }
    case "ring": {
      /* Circular progress / countdown ring — the one piece not built on a
         silhouette. Same wells, same glow language; value drives the arc. */
      const d2 = ({ s: 96, m: 136, l: 184 } as Record<KitSize, number>)[size] * k;
      const stroke2 = Math.max(8, d2 * 0.1);
      const pad2 = 26;
      const cx3 = d2 / 2 + pad2, cy3 = d2 / 2 + pad2;
      const r2 = d2 / 2 - stroke2 / 2;
      const v2 = clamp(value ?? 0.62, 0, 1);
      const circ = 2 * Math.PI * r2;
      const gid3 = "rg" + UID++;
      const label2 = opts.label ?? `${Math.round(v2 * 100)}%`;
      const dim = state === "disabled" ? 0.4 : 1;
      const total2 = d2 + pad2 * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total2}" height="${total2}" viewBox="0 0 ${total2} ${total2}" role="img" aria-label="progress ring">
<defs>
  <linearGradient id="${gid3}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
  <filter id="${gid3}g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<g opacity="${dim}">
  <circle cx="${cx3}" cy="${cy3}" r="${r2}" fill="none" stroke="${wellFill}" stroke-width="${stroke2}"/>
  ${v2 > 0.005 ? `<circle cx="${cx3}" cy="${cy3}" r="${r2}" fill="none" stroke="${glow}" stroke-width="${stroke2}" stroke-linecap="round" stroke-dasharray="${(circ * v2).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx3} ${cy3})" filter="url(#${gid3}g)" opacity="0.55"/>
  <circle cx="${cx3}" cy="${cy3}" r="${r2}" fill="none" stroke="url(#${gid3})" stroke-width="${stroke2}" stroke-linecap="round" stroke-dasharray="${(circ * v2).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx3} ${cy3})"/>` : ""}
  ${contentText(label2, cx3, cy3 + 1, d2 * 0.18, { anchor: "middle", keepCase: true, autoInk: isDarkBg(cfg.canvas) ? "#FFFFFF" : darken(bevel, 0.55) })}
</g>
</svg>`;
    }
    case "flipclock": {
      /* Split-flap countdown — the classic flip board. Tiles derive from
         value·90s (MIN · SEC) or from an explicit "HH:MM:SS"-style label.
         Theme material: dark tiles with the kit's edge color, the kit's own
         type on the digits, labels underneath. The last quarter goes alarm. */
      const v3 = clamp(value ?? 0.62, 0, 1);
      const secs = Math.max(0, Math.round(v3 * 90));
      const two = (n: number) => String(n).padStart(2, "0");
      const segs = (opts.label ?? `${two(Math.floor(secs / 60))}:${two(secs % 60)}`).split(":");
      const tags = [(opts.slots?.tag1 ?? "DAYS").slice(0, 10), (opts.slots?.tag2 ?? "HOURS").slice(0, 10), (opts.slots?.tag3 ?? "MINUTES").slice(0, 10), (opts.slots?.tag4 ?? "SECONDS").slice(0, 10)].slice(4 - Math.min(segs.length, 4));
      const urgent = v3 <= 0.25 && state !== "disabled" && !opts.label;
      const alarm = hexMix("#FF4D5A", bevel, 0.18);
      const dim = state === "disabled" ? 0.45 : 1;
      const tw = 150 * k, th = 176 * k, gap2 = 20 * k, pad3 = 40; // pad grew for shell glow air
      const W2 = segs.length * tw + (segs.length - 1) * gap2 + pad3 * 2;
      const H2 = th + 54 * k + pad3 * 2; // v63: the tag line gets real air below the tiles
      const tileFace = darken(effect(cfg.effects, "Inner Fill"), 0.8);
      const fsD = Math.min(96 * k * typeK, tw * 0.6);
      /* v61: each tile is a REAL themed shell — the full candy stack in the
         kit silhouette, portrait — with the split-flap instrument recessed
         into a dark well so the digits keep their contrast */
      /* container exception (curated defaults): silhouettes that don't read
         at the tile's portrait aspect ship WITHOUT themed containers — the
         split-flap instrument stands alone on its dark well. The timer-safe
         list is curated in silhouettes.ts (`supports` includes "timer");
         imported silhouettes default to bare until a human curates them in. */
      const tMeta = silhouetteMeta(sov ?? cfg.shape);
      const themedTiles = !!tMeta && tMeta.supports.includes("timer");
      const tiles = segs.map((sg, i) => {
        const x = pad3 + i * (tw + gap2);
        const midY = pad3 + th / 2;
        const shellSvg2 = themedTiles ? build(cfg, state === "disabled" ? "disabled" : "default", { x: 33, y: 27, h: th, fs: 0, iconSize: 0 }, { iconDef: null, label: "", shapeOverride: sov, fixedW: tw }) : "";
        const shm = themedTiles ? /data-shell="([-\d. ]+)"/.exec(shellSvg2) : null;
        const [tsx, tsy] = shm ? shm[1].split(" ").map(Number) : [33, 27];
        const tileInner = themedTiles ? shellSvg2.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "") : "";
        const insT = themedTiles ? bw + 5 * k : 3 * k;
        const wellD = themedTiles
          ? shapePath(sov ?? cfg.shape, x + insT, pad3 + insT, tw - insT * 2, th - insT * 2, Math.max(0, cfg.bevel.softness - 10))
          : roundRect(x + insT, pad3 + insT, tw - insT * 2, th - insT * 2, 20 * k);
        const gidT = "fc" + UID++;
        return `${themedTiles ? `<g transform="translate(${(x - tsx).toFixed(1)} ${(pad3 - tsy).toFixed(1)})">${tileInner}</g>` : ""}
          <clipPath id="${gidT}w"><path d="${wellD}"/></clipPath>
          <path d="${wellD}" fill="${tileFace}"${urgent ? ` stroke="${alarm}" stroke-width="2.5"` : themedTiles ? "" : ` stroke="${hexMix(bevel, glow, 0.3)}" stroke-width="2" stroke-opacity="0.55"`}/>
          <g clip-path="url(#${gidT}w)"><rect x="${x}" y="${pad3}" width="${tw}" height="${(th / 2).toFixed(1)}" fill="#FFFFFF" opacity="0.055"/></g>
          ${contentText(sg, x + tw / 2 + 3 * k, midY + 2, fsD, { anchor: "middle", keepCase: true, opacity: dim })}
          <g clip-path="url(#${gidT}w)">
            <rect x="${x}" y="${(midY - 2).toFixed(1)}" width="${tw}" height="4" fill="#04060C" opacity="0.85"/>
            <rect x="${x}" y="${(midY + 2).toFixed(1)}" width="${tw}" height="1.2" fill="#FFFFFF" opacity="0.1"/>
          </g>
          <circle cx="${(x + insT + 7 * k).toFixed(1)}" cy="${midY}" r="${(3.6 * k).toFixed(1)}" fill="#04060C" opacity="0.92"/>
          <circle cx="${(x + tw - insT - 7 * k).toFixed(1)}" cy="${midY}" r="${(3.6 * k).toFixed(1)}" fill="#04060C" opacity="0.92"/>
          <text x="${x + tw / 2}" y="${(pad3 + th + 38 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(12.5 * k).toFixed(1)}" font-weight="800" letter-spacing=".22em" fill="${urgent ? alarm : (isDarkBg(cfg.canvas) ? hexRgba(glow, 0.8) : darken(bevel, 0.3))}" text-anchor="middle" opacity="${dim}">${esc(tags[i] ?? "")}</text>` +
          (i < segs.length - 1
            ? `<circle cx="${(x + tw + gap2 / 2).toFixed(1)}" cy="${(midY - 16 * k).toFixed(1)}" r="${(4 * k).toFixed(1)}" fill="${isDarkBg(cfg.canvas) ? hexRgba(glow, 0.7) : darken(bevel, 0.25)}"/><circle cx="${(x + tw + gap2 / 2).toFixed(1)}" cy="${(midY + 16 * k).toFixed(1)}" r="${(4 * k).toFixed(1)}" fill="${isDarkBg(cfg.canvas) ? hexRgba(glow, 0.7) : darken(bevel, 0.25)}"/>`
            : "");
      }).join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="flip countdown" data-timer="flip"${urgent ? ' data-urgent="1"' : ""}>${tiles}</svg>`;
    }
    case "stopwatch": {
      /* Classic stopwatch — crown on top, candy ring body, tick face, a
         sweep hand plus remaining-time arc, digital readout under center. */
      const d2 = ({ s: 156, m: 196, l: 248 } as Record<KitSize, number>)[size] * k;
      const pad2 = 46; // real air — neighbouring watches must never kiss
      const padB = 96; // v55: generous open ground under the watch — the
                       // caption below must never crowd the body
      const v3 = clamp(value ?? 0.62, 0, 1);
      const secs = Math.max(0, Math.round(v3 * 90));
      const tLabel = opts.label ?? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const urgent = v3 <= 0.25 && state !== "disabled" && !opts.label;
      const alarm = hexMix("#FF4D5A", bevel, 0.18);
      const dim = state === "disabled" ? 0.45 : 1;
      const crownH = 26 * k;
      const W2 = d2 + pad2 * 2, H2 = d2 + crownH + pad2 + padB;
      const cx3 = W2 / 2, cy3 = pad2 + crownH + d2 / 2;
      const r0 = d2 / 2;
      const gid6 = "sw" + UID++;
      const faceR0 = r0 * 0.88; // instrument well radius — fits inside any silhouette
      let ticks = "";
      for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0;
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const rOut = faceR0 - 5 * k, rIn = rOut - (major ? 10 * k : 5.5 * k);
        ticks += `<line x1="${(cx3 + Math.cos(a) * rIn).toFixed(1)}" y1="${(cy3 + Math.sin(a) * rIn).toFixed(1)}" x2="${(cx3 + Math.cos(a) * rOut).toFixed(1)}" y2="${(cy3 + Math.sin(a) * rOut).toFixed(1)}" stroke="#FFFFFF" stroke-width="${major ? 2.4 : 1.2}" opacity="${major ? 0.75 : 0.3}"/>`;
      }
      const aH = v3 * Math.PI * 2 - Math.PI / 2;
      // v61: the body is a REAL themed shell — the full candy stack at watch
      // size, silhouette-aware like every button — with a circular
      // instrument well recessed into its face
      const faceR = faceR0;
      const rHand = faceR - 18 * k;
      const arcR = faceR - 10 * k;
      const large = v3 > 0.5 ? 1 : 0;
      const arc = v3 > 0.01
        ? `<path d="M ${cx3} ${(cy3 - arcR).toFixed(1)} A ${arcR.toFixed(1)} ${arcR.toFixed(1)} 0 ${large} 1 ${(cx3 + Math.cos(aH) * arcR).toFixed(1)} ${(cy3 + Math.sin(aH) * arcR).toFixed(1)}" fill="none" stroke="${urgent ? alarm : glow}" stroke-width="${(5 * k).toFixed(1)}" stroke-linecap="round" opacity="0.4"/>`
        : "";
      // container exception: shapes that don't read as a square watch housing
      // fall back to the neutral circular body (curated `supports: "timer"`)
      const swMeta = silhouetteMeta(sov ?? cfg.shape);
      const swShell = build(cfg, state === "disabled" ? "disabled" : "default", { x: 33, y: 27, h: d2, fs: 0, iconSize: 0 }, { iconDef: null, label: "", shapeOverride: swMeta && swMeta.supports.includes("timer") ? sov : "round", fixedW: d2 });
      const swSh = /data-shell="([-\d. ]+)"/.exec(swShell);
      const [ssx, ssy, ssw, ssh] = swSh ? swSh[1].split(" ").map(Number) : [33, 27, d2, d2];
      const swInner = swShell.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="stopwatch" data-timer="watch"${urgent ? ' data-urgent="1"' : ""}>
<defs>
  <linearGradient id="${gid6}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
</defs>
<g opacity="${dim}">
  <rect x="${(cx3 - 9 * k).toFixed(1)}" y="${(pad2 + 2 * k).toFixed(1)}" width="${(18 * k).toFixed(1)}" height="${(16 * k).toFixed(1)}" rx="${(4 * k).toFixed(1)}" fill="url(#${gid6})" stroke="${darken(bevel, 0.45)}" stroke-width="1.5"/>
  <rect x="${(cx3 - 13 * k).toFixed(1)}" y="${(pad2).toFixed(1)}" width="${(26 * k).toFixed(1)}" height="${(6 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${darken(bevel, 0.3)}"/>
  <g transform="rotate(-42 ${cx3} ${cy3})"><rect x="${(cx3 - 6 * k).toFixed(1)}" y="${(cy3 - r0 - 12 * k).toFixed(1)}" width="${(12 * k).toFixed(1)}" height="${(14 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${darken(bevel, 0.25)}"/></g>
  <g transform="rotate(42 ${cx3} ${cy3})"><rect x="${(cx3 - 6 * k).toFixed(1)}" y="${(cy3 - r0 - 12 * k).toFixed(1)}" width="${(12 * k).toFixed(1)}" height="${(14 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${darken(bevel, 0.25)}"/></g>
  <g transform="translate(${(cx3 - (ssx + ssw / 2)).toFixed(1)} ${(cy3 - (ssy + ssh / 2)).toFixed(1)})">${swInner}</g>
  <circle cx="${cx3}" cy="${cy3}" r="${faceR.toFixed(1)}" fill="${wellFill}"/>
  ${ticks}
  ${arc}
  <line x1="${cx3}" y1="${cy3}" x2="${(cx3 + Math.cos(aH) * rHand).toFixed(1)}" y2="${(cy3 + Math.sin(aH) * rHand).toFixed(1)}" stroke="${urgent ? alarm : hexMix(glow, "#FFFFFF", 0.35)}" stroke-width="${(3.4 * k).toFixed(1)}" stroke-linecap="round"/>
  <line x1="${cx3}" y1="${cy3}" x2="${(cx3 - Math.cos(aH) * 14 * k).toFixed(1)}" y2="${(cy3 - Math.sin(aH) * 14 * k).toFixed(1)}" stroke="${urgent ? alarm : hexMix(glow, "#FFFFFF", 0.35)}" stroke-width="${(3.4 * k).toFixed(1)}" stroke-linecap="round"/>
  ${candyKnob(cx3, cy3, 8 * k, urgent ? alarm : bevel)}
  ${contentText(tLabel, cx3, cy3 + r0 * 0.5, Math.min(d2 * 0.155 * typeK, r0 * 0.42), { anchor: "middle", keepCase: true, opacity: dim })}
</g>
</svg>`;
    }
    case "timerdigits": {
      // just big numbers — the round clock in the kit's full display type,
      // no container. Ticks live when a host drives the value.
      const v3 = clamp(value ?? 0.62, 0, 1);
      const secs = Math.max(0, Math.round(v3 * 90));
      const tLabel = opts.label ?? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const urgent = v3 <= 0.25 && state !== "disabled" && !opts.label;
      return renderTypeSpecimen(cfg, tLabel).replace("<svg ", `<svg data-timer="digits"${urgent ? ' data-urgent="1"' : ""} `);
    }
    case "speedo": {
      /* Classic speedometer — dial, tick ring, red zone, needle. value is
         the speed fraction; the readout derives km/h so hosts rev it live.
         No numerals on the dial: scale marks are geometry, numbers live in
         the readout (engine-replaceable). */
      const d2 = ({ s: 176, m: 216, l: 264 } as Record<KitSize, number>)[size] * k;
      const pad2 = 46;
      const v3 = clamp(value ?? 0.62, 0, 1);
      const part = opts.part;
      /* v71 · form factor: the dial sinks into a real engine housing —
         walls, extrusion, gloss and shadow all come from the theme, so the
         gauge extrudes like every other component. Engine-export part
         layers keep the bare-canvas contract. */
      const useHousing = !part;
      const D = d2 + (bw + 18 * k) * 2;
      const W2 = d2 + pad2 * 2, H2 = d2 + pad2 * 2;
      const cx3 = useHousing ? 39 + D / 2 : W2 / 2, cy3 = useHousing ? 30 + D / 2 : H2 / 2, r0 = d2 / 2;
      const gid8 = "sp" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const A0 = 0.75 * Math.PI, SWEEP = 1.5 * Math.PI; // 270°, opening at the bottom
      const ang = A0 + v3 * SWEEP;
      const alarm = hexMix("#FF4D5A", bevel, 0.18);
      let ticks = "";
      for (let i = 0; i <= 27; i++) {
        const major = i % 3 === 0;
        const a = A0 + (i / 27) * SWEEP;
        const rO = r0 - 12 * k, rI = rO - (major ? 13 * k : 7 * k);
        const red = i / 27 > 0.78;
        ticks += `<line x1="${(cx3 + Math.cos(a) * rI).toFixed(1)}" y1="${(cy3 + Math.sin(a) * rI).toFixed(1)}" x2="${(cx3 + Math.cos(a) * rO).toFixed(1)}" y2="${(cy3 + Math.sin(a) * rO).toFixed(1)}" stroke="${red ? alarm : "#FFFFFF"}" stroke-width="${major ? 3 : 1.4}" opacity="${red ? 0.9 : major ? 0.75 : 0.32}"/>`;
      }
      const needle = `<g${part === "needle" ? "" : ` transform="rotate(0)"`}>` +
        `<line x1="${(cx3 - Math.cos(ang) * 16 * k).toFixed(1)}" y1="${(cy3 - Math.sin(ang) * 16 * k).toFixed(1)}" x2="${(cx3 + Math.cos(ang) * (r0 - 30 * k)).toFixed(1)}" y2="${(cy3 + Math.sin(ang) * (r0 - 30 * k)).toFixed(1)}" stroke="${alarm}" stroke-width="${(4 * k).toFixed(1)}" stroke-linecap="round"/>` +
        candyKnob(cx3, cy3, 9 * k, bevel) + `</g>`;
      const readout = contentText(String(Math.round(v3 * 174)), cx3, cy3 + r0 * 0.5, Math.min(d2 * 0.17, r0 * 0.44) * typeK, { anchor: "middle", keepCase: true, opacity: dim }) +
        `<text x="${cx3}" y="${(cy3 + r0 * 0.82).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">${opts.slots?.unit === "KPH" ? "KPH" : "MPH"}</text>`;
      const face =
        `<circle cx="${cx3}" cy="${cy3}" r="${r0}" fill="url(#${gid8})" stroke="${darken(bevel, 0.45)}" stroke-width="2"/>` +
        `<circle cx="${cx3}" cy="${cy3}" r="${(r0 - 9 * k).toFixed(1)}" fill="${wellFill}"/>` + ticks;
      const inner2 = part === "needle" ? needle : part === "face" ? face : face + needle + readout;
      if (useHousing) {
        const track = build(cfg, state, { x: 39, y: 30, h: D, fs: 0, iconSize: 0, tokenH: 280 }, { iconDef: null, label: "", fixedW: D, shapeOverride: sov });
        return inject(track.replace("<svg ", '<svg data-race="speedo" '),
          `<defs><linearGradient id="${gid8}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs><g opacity="${dim}">${inner2}</g>`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="speedometer" data-race="speedo">
<defs><linearGradient id="${gid8}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>
<g opacity="${dim}">${inner2}</g>
</svg>`;
    }
    case "speedo2": {
      /* Futuristic HUD speedometer — an open arc of segments lighting up to
         the value, digital readout center. Pure light, no body. */
      const d2 = ({ s: 176, m: 216, l: 264 } as Record<KitSize, number>)[size] * k;
      const pad2 = 46;
      const v3 = clamp(value ?? 0.62, 0, 1);
      const part = opts.part;
      // v71 · form factor: same housing rule as the classic dial — the
      // light-segments sit in a recessed well inside the themed shell
      const useHousing = !part;
      const D = d2 + (bw + 18 * k) * 2;
      const W2 = d2 + pad2 * 2, H2 = d2 + pad2 * 2;
      const cx3 = useHousing ? 39 + D / 2 : W2 / 2, cy3 = useHousing ? 30 + D / 2 : H2 / 2, r0 = d2 / 2;
      const gid8 = "s2" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const A0 = 0.75 * Math.PI, SWEEP = 1.5 * Math.PI;
      const N = 24;
      let segs = "";
      for (let i = 0; i < N; i++) {
        const a = A0 + ((i + 0.5) / N) * SWEEP;
        const lit = part === "face" ? false : (i + 0.5) / N <= v3;
        const rO = r0, rI = r0 - 20 * k;
        // unlit segments must survive a light canvas too — white dies there
        const col = lit ? hexMix(bevel, glow, i / N) : useHousing ? "#FFFFFF" : isDarkBg(cfg.canvas) ? "#FFFFFF" : darken(bevel, 0.35);
        segs += `<line x1="${(cx3 + Math.cos(a) * rI).toFixed(1)}" y1="${(cy3 + Math.sin(a) * rI).toFixed(1)}" x2="${(cx3 + Math.cos(a) * rO).toFixed(1)}" y2="${(cy3 + Math.sin(a) * rO).toFixed(1)}" stroke="${col}" stroke-width="${(8 * k).toFixed(1)}" stroke-linecap="round" opacity="${lit ? 0.95 : useHousing ? 0.2 : isDarkBg(cfg.canvas) ? 0.14 : 0.3}"${lit ? ` filter="url(#${gid8}g)"` : ""}/>`;
      }
      if (part === "segment") {
        const segW = 10 * k, segH = 26 * k;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${(segW * 2).toFixed(0)}" height="${(segH + 12).toFixed(0)}" viewBox="0 0 ${(segW * 2).toFixed(0)} ${(segH + 12).toFixed(0)}"><line x1="${segW}" y1="6" x2="${segW}" y2="${segH + 6}" stroke="${glow}" stroke-width="${segW.toFixed(1)}" stroke-linecap="round"/></svg>`;
      }
      const arc = `<circle cx="${cx3}" cy="${cy3}" r="${(r0 - 30 * k).toFixed(1)}" fill="none" stroke="${hexRgba(glow, 0.25)}" stroke-width="1.5" stroke-dasharray="3 7"/>`;
      const readout = part === "face" ? "" :
        contentText(String(Math.round(v3 * 174)), cx3, cy3 - 4 * k, Math.min(d2 * 0.24, r0 * 0.6) * typeK, { anchor: "middle", keepCase: true, opacity: dim }) +
        `<text x="${cx3}" y="${(cy3 + r0 * 0.46).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">${opts.slots?.unit === "KPH" ? "KPH" : "MPH"}</text>`;
      if (useHousing) {
        const track = build(cfg, state, { x: 39, y: 30, h: D, fs: 0, iconSize: 0, tokenH: 280 }, { iconDef: null, label: "", fixedW: D, shapeOverride: sov });
        const well = `<circle cx="${cx3.toFixed(1)}" cy="${cy3.toFixed(1)}" r="${(r0 + 8 * k).toFixed(1)}" fill="${wellFill}" opacity="0.92"/>`;
        return inject(track.replace("<svg ", '<svg data-race="speedo2" '),
          `<defs><filter id="${gid8}g" x="-80%" y="-80%" width="260%" height="260%">${shadow11(0, 0, (4 * k).toFixed(1), glow, 0.7)}</filter></defs><g opacity="${dim}">${well}${segs}${arc}${readout}</g>`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="HUD speedometer" data-race="speedo2">
<defs><filter id="${gid8}g" x="-80%" y="-80%" width="260%" height="260%">${shadow11(0, 0, (4 * k).toFixed(1), glow, 0.7)}</filter></defs>
<g opacity="${dim}">${segs}${arc}${readout}</g>
</svg>`;
    }
    case "tacho": {
      /* Rev meter — the third voice of the diegetic instrument language the
         racing gauges share: dark circular well, marks riding the rim, one
         glow accent, candy hub, readout on the lower face. Here the marks
         ARE the value: fat wedge segments sweep 270°, zone-tinted green →
         amber → red, lit up to the needle. */
      const d2 = ({ s: 176, m: 216, l: 264 } as Record<KitSize, number>)[size] * k;
      const v3 = clamp(value ?? 0.62, 0, 1);
      // v71 · form factor: housed like its siblings — theme walls, extrusion
      const D = d2 + (bw + 18 * k) * 2;
      const cx3 = 39 + D / 2, cy3 = 30 + D / 2, r0 = d2 / 2;
      const gidT2 = "tc" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const A0 = 0.75 * Math.PI, SWEEP = 1.5 * Math.PI;
      const ang = A0 + v3 * SWEEP;
      const alarm = hexMix("#FF4D5A", bevel, 0.15);
      const zone = (t: number) => t < 0.6 ? "#3ECF6A" : t < 0.82 ? "#FFC531" : "#FF4D5A";
      let segsOn = "", segsOff = "";
      for (let i = 0; i < 28; i++) {
        const t0 = i / 27;
        const a = A0 + t0 * SWEEP;
        const rO = r0 - 11 * k, rI = rO - 15 * k;
        const seg = `<line x1="${(cx3 + Math.cos(a) * rI).toFixed(1)}" y1="${(cy3 + Math.sin(a) * rI).toFixed(1)}" x2="${(cx3 + Math.cos(a) * rO).toFixed(1)}" y2="${(cy3 + Math.sin(a) * rO).toFixed(1)}" stroke="${zone(t0)}" stroke-width="${(6.5 * k).toFixed(1)}" stroke-linecap="round" opacity="${t0 <= v3 ? "0.96" : "0.14"}"/>`;
        if (t0 <= v3) segsOn += seg; else segsOff += seg;
      }
      const needle = `<line x1="${(cx3 - Math.cos(ang) * 15 * k).toFixed(1)}" y1="${(cy3 - Math.sin(ang) * 15 * k).toFixed(1)}" x2="${(cx3 + Math.cos(ang) * (r0 - 32 * k)).toFixed(1)}" y2="${(cy3 + Math.sin(ang) * (r0 - 32 * k)).toFixed(1)}" stroke="${v3 > 0.82 ? alarm : "#FFFFFF"}" stroke-width="${(3.6 * k).toFixed(1)}" stroke-linecap="round" opacity="0.92"/>`;
      const readout = contentText((v3 * 9).toFixed(1), cx3, cy3 + r0 * 0.5, Math.min(d2 * 0.16, r0 * 0.42) * typeK, { anchor: "middle", keepCase: true, opacity: dim }) +
        `<text x="${cx3}" y="${(cy3 + r0 * 0.82).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">${esc(opts.slots?.unit === "RPM" ? "RPM" : "RPM ×1000")}</text>`;
      const trackT = build(cfg, state, { x: 39, y: 30, h: D, fs: 0, iconSize: 0, tokenH: 280 }, { iconDef: null, label: "", fixedW: D, shapeOverride: sov });
      return inject(trackT.replace("<svg ", `<svg data-race="tacho"${v3 > 0.82 ? ' data-urgent="1"' : ""} `),
        `<defs>
  <linearGradient id="${gidT2}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${darken(bevel, 0.3)}"/></linearGradient>
  <filter id="${gidT2}g" x="-40%" y="-40%" width="180%" height="180%">${shadow11(0, 0, (3.5 * k).toFixed(1), v3 > 0.82 ? alarm : "#7CE6A0", 0.5)}</filter>
</defs>
<g opacity="${dim}">
  <circle cx="${cx3}" cy="${cy3}" r="${r0}" fill="url(#${gidT2})" stroke="${darken(bevel, 0.45)}" stroke-width="2"/>
  <circle cx="${cx3}" cy="${cy3}" r="${(r0 - 8 * k).toFixed(1)}" fill="${wellFill}"/>
  ${segsOff}<g filter="url(#${gidT2}g)">${segsOn}</g>
  ${needle}
  ${candyKnob(cx3, cy3, 9 * k, bevel)}
  ${readout}
</g>`);
    }
    case "circuit": {
      /* Race circuit mini-map — the fictional KAZURI RING (somewhere in the
         East African highlands): hairpin, ridge climb, long savanna sweep,
         gorge esses, drawn as one closed line. Rendered as a dimensional
         ribbon: isometric squash + extruded walls so elevation reads. */
      const w = 250 * k, h = 175 * k, pad2 = 40;
      const W2 = w + pad2 * 2, H2 = h + pad2 * 2;
      const gid9 = "cc" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const sx3 = w / 220, sy3 = h / 150;
      const d3 = `M ${(30 * sx3 + pad2).toFixed(1)} ${(118 * sy3 + pad2).toFixed(1)} L ${(24 * sx3 + pad2).toFixed(1)} ${(106 * sy3 + pad2).toFixed(1)} Q ${(20 * sx3 + pad2).toFixed(1)} ${(96 * sy3 + pad2).toFixed(1)} ${(28 * sx3 + pad2).toFixed(1)} ${(92 * sy3 + pad2).toFixed(1)} L ${(60 * sx3 + pad2).toFixed(1)} ${(78 * sy3 + pad2).toFixed(1)} Q ${(66 * sx3 + pad2).toFixed(1)} ${(75 * sy3 + pad2).toFixed(1)} ${(64 * sx3 + pad2).toFixed(1)} ${(68 * sy3 + pad2).toFixed(1)} L ${(46 * sx3 + pad2).toFixed(1)} ${(34 * sy3 + pad2).toFixed(1)} Q ${(43 * sx3 + pad2).toFixed(1)} ${(26 * sy3 + pad2).toFixed(1)} ${(50 * sx3 + pad2).toFixed(1)} ${(22 * sy3 + pad2).toFixed(1)} L ${(74 * sx3 + pad2).toFixed(1)} ${(12 * sy3 + pad2).toFixed(1)} Q ${(82 * sx3 + pad2).toFixed(1)} ${(8 * sy3 + pad2).toFixed(1)} ${(88 * sx3 + pad2).toFixed(1)} ${(14 * sy3 + pad2).toFixed(1)} L ${(102 * sx3 + pad2).toFixed(1)} ${(30 * sy3 + pad2).toFixed(1)} Q ${(106 * sx3 + pad2).toFixed(1)} ${(36 * sy3 + pad2).toFixed(1)} ${(114 * sx3 + pad2).toFixed(1)} ${(34 * sy3 + pad2).toFixed(1)} L ${(168 * sx3 + pad2).toFixed(1)} ${(22 * sy3 + pad2).toFixed(1)} Q ${(178 * sx3 + pad2).toFixed(1)} ${(20 * sy3 + pad2).toFixed(1)} ${(182 * sx3 + pad2).toFixed(1)} ${(28 * sy3 + pad2).toFixed(1)} L ${(196 * sx3 + pad2).toFixed(1)} ${(62 * sy3 + pad2).toFixed(1)} Q ${(199 * sx3 + pad2).toFixed(1)} ${(70 * sy3 + pad2).toFixed(1)} ${(192 * sx3 + pad2).toFixed(1)} ${(76 * sy3 + pad2).toFixed(1)} L ${(160 * sx3 + pad2).toFixed(1)} ${(100 * sy3 + pad2).toFixed(1)} Q ${(130 * sx3 + pad2).toFixed(1)} ${(122 * sy3 + pad2).toFixed(1)} ${(96 * sx3 + pad2).toFixed(1)} ${(128 * sy3 + pad2).toFixed(1)} L ${(48 * sx3 + pad2).toFixed(1)} ${(136 * sy3 + pad2).toFixed(1)} Q ${(36 * sx3 + pad2).toFixed(1)} ${(138 * sy3 + pad2).toFixed(1)} ${(32 * sx3 + pad2).toFixed(1)} ${(128 * sy3 + pad2).toFixed(1)} Z`;
      /* dimensional ribbon: the ground shadow sits deepest, then stacked
         wall passes rise to the lit racing line on top */
      const wall = [8, 6.5, 5, 3.5, 2]
        .map((dy, i) => `<path d="${d3}" transform="translate(0 ${(dy * k).toFixed(1)})" fill="none" stroke="${darken(bevel, 0.62 - i * 0.05)}" stroke-width="${(9 * k).toFixed(1)}" stroke-linejoin="round"/>`)
        .join("");
      const startTick = `<line x1="${(26 * sx3 + pad2).toFixed(1)}" y1="${(110 * sy3 + pad2 - 6).toFixed(1)}" x2="${(36 * sx3 + pad2).toFixed(1)}" y2="${(114 * sy3 + pad2 + 4).toFixed(1)}" stroke="${isDarkBg(cfg.canvas) ? "#FFFFFF" : darken(bevel, 0.5)}" stroke-width="3" stroke-dasharray="3 3" opacity="0.9"/>`;
      const track =
        `<ellipse cx="${(W2 / 2).toFixed(1)}" cy="${(H2 / 2 + 16 * k).toFixed(1)}" rx="${(w * 0.52).toFixed(1)}" ry="${(h * 0.4).toFixed(1)}" fill="${hexRgba("#04070E", 0.35)}"/>` +
        wall +
        `<path d="${d3}" fill="none" stroke="${darken(bevel, 0.45)}" stroke-width="${(9 * k).toFixed(1)}" stroke-linejoin="round" opacity="0.95"/>` +
        `<path d="${d3}" fill="none" stroke="${glow}" stroke-width="${(4 * k).toFixed(1)}" stroke-linejoin="round" filter="url(#${gid9}g)"/>` +
        startTick;
      /* isometric squash makes the extrusion read as elevation */
      const iso = (inner: string) => `<g transform="translate(0 ${(H2 * 0.13).toFixed(1)}) scale(1 0.74)">${inner}</g>`;
      if (opts.part === "track") {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}"><defs><filter id="${gid9}g" x="-40%" y="-40%" width="180%" height="180%">${shadow11(0, 0, (3 * k).toFixed(1), glow, 0.55)}</filter></defs>${iso(track)}</svg>`;
      }
      const markers =
        `<circle cx="${(64 * sx3 + pad2).toFixed(1)}" cy="${(68 * sy3 + pad2).toFixed(1)}" r="${(6.5 * k).toFixed(1)}" fill="${glow}" filter="url(#${gid9}g)"/>` +
        `<circle cx="${(150 * sx3 + pad2).toFixed(1)}" cy="${(107 * sy3 + pad2).toFixed(1)}" r="${(5 * k).toFixed(1)}" fill="${isDarkBg(cfg.canvas) ? "#FFFFFF" : darken(bevel, 0.55)}" opacity="0.85"/>` +
        `<circle cx="${(114 * sx3 + pad2).toFixed(1)}" cy="${(34 * sy3 + pad2).toFixed(1)}" r="${(5 * k).toFixed(1)}" fill="${hexMix("#FF4D5A", bevel, 0.18)}" opacity="0.9"/>`;
      const tag = `<text x="${(cxOf(W2)).toFixed(1)}" y="${(H2 - 10).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".3em" fill="${isDarkBg(cfg.canvas) ? hexRgba(glow, 0.7) : darken(bevel, 0.3)}" text-anchor="middle" opacity="${dim}">KAZURI RING · GP CIRCUIT</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="race circuit map" data-race="circuit">
<defs><filter id="${gid9}g" x="-40%" y="-40%" width="180%" height="180%">${shadow11(0, 0, (3 * k).toFixed(1), glow, 0.55)}</filter></defs>
<g opacity="${dim}">${iso(track + markers)}${tag}</g>
</svg>`;
    }
    case "leaderboard": {
      /* Track position list — an INSTRUMENT: the kit shell frames a deep
         dark well (Inner Fill, grounded) and every row reads in bright ink;
         the player's row wears the glow ring. Rows are live engine content
         in real games. */
      const w = 330 * k, h = 250 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8;
      const dim = state === "disabled" ? 0.45 : 1;
      const SLB = opts.slots ?? {};
      const rows = [
        { p: "1", d: (SLB.n1 ?? "HAM").slice(0, 12), gap: (SLB.t1 ?? "1:21.548").slice(0, 10), you: false },
        { p: "2", d: (SLB.n2 ?? "VER").slice(0, 12), gap: (SLB.t2 ?? "+0.842").slice(0, 10), you: false },
        { p: "3", d: (SLB.n3 ?? "YOU").slice(0, 12), gap: (SLB.t3 ?? "+2.156").slice(0, 10), you: true },
        { p: "4", d: (SLB.n4 ?? "LEC").slice(0, 12), gap: (SLB.t4 ?? "+3.271").slice(0, 10), you: false },
        { p: "5", d: (SLB.n5 ?? "PIA").slice(0, 12), gap: (SLB.t5 ?? "+4.712").slice(0, 10), you: false },
      ];
      const x0 = 39 + inset + 16 * k, x1 = 39 + w - inset - 18 * k;
      const headY = 30 + inset + 20 * k;
      const listY0 = 30 + inset + 34 * k;
      const rowH = (h - inset * 2 - 44 * k) / rows.length;
      const gid10 = "lb" + UID++;
      const ink = "rgba(255,255,255,0.9)", ink2 = "rgba(255,255,255,0.55)";
      const wellD = `<path d="${wellOf(w, h, inset)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.82)}" opacity="0.96"/>`;
      const parts = wellD +
        `<defs><linearGradient id="${gid10}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${hexRgba(bevel, 0.45)}"/><stop offset="0.5" stop-color="${hexRgba(glow, 0.5)}"/><stop offset="1" stop-color="${hexRgba(bevel, 0.45)}"/></linearGradient></defs>` +
        `<text x="${x0.toFixed(1)}" y="${headY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(14 * k).toFixed(1)}" font-weight="800" letter-spacing=".18em" fill="rgba(255,255,255,0.92)">${esc((opts.slots?.title ?? "TOP 5").slice(0, 16))}</text>` +
        `<rect x="${(x1 - 30 * k).toFixed(1)}" y="${(headY - 5 * k).toFixed(1)}" width="${(20 * k).toFixed(1)}" height="${(3.5 * k).toFixed(1)}" rx="${(1.8 * k).toFixed(1)}" fill="${hexRgba(glow, 0.7)}"/>` +
        `<rect x="${(x1 - 8 * k).toFixed(1)}" y="${(headY - 5 * k).toFixed(1)}" width="${(8 * k).toFixed(1)}" height="${(3.5 * k).toFixed(1)}" rx="${(1.8 * k).toFixed(1)}" fill="rgba(255,255,255,0.3)"/>` +
        // rank column divider + row hairlines — the instrument grid
        `<line x1="${(x0 + 22 * k).toFixed(1)}" y1="${(listY0 + 3 * k).toFixed(1)}" x2="${(x0 + 22 * k).toFixed(1)}" y2="${(listY0 + rowH * rows.length - 3 * k).toFixed(1)}" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>` +
        rows.map((_, i) => i === 0 ? "" :
          `<line x1="${(x0 - 6 * k).toFixed(1)}" y1="${(listY0 + rowH * i).toFixed(1)}" x2="${(x1 + 6 * k).toFixed(1)}" y2="${(listY0 + rowH * i).toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`).join("") +
        rows.map((r, i) => {
          const yC = listY0 + rowH * (i + 0.5);
          const hl = r.you
            ? `<rect x="${(x0 - 8 * k).toFixed(1)}" y="${(yC - rowH * 0.46).toFixed(1)}" width="${(x1 - x0 + 16 * k).toFixed(1)}" height="${(rowH * 0.92).toFixed(1)}" rx="${(8 * k).toFixed(1)}" fill="url(#${gid10}s)" stroke="${hexRgba(glow, 0.9)}" stroke-width="1.6"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.5)})"` : ""}/>`
            : "";
          const w8 = r.you ? 900 : 700;
          return hl +
            `<text x="${(x0 + 4 * k).toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="${w8}" fill="${r.you ? "#FFFFFF" : ink2}" dominant-baseline="central">${r.p}</text>` +
            `<text x="${(x0 + 34 * k).toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(16 * k).toFixed(1)}" font-weight="${w8}" letter-spacing=".08em" fill="${r.you ? "#FFFFFF" : ink}" dominant-baseline="central">${r.d}</text>` +
            `<text x="${x1.toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13.5 * k).toFixed(1)}" font-weight="${r.you ? 800 : 600}" fill="${r.you ? hexMix(glow, "#FFFFFF", 0.4) : ink2}" text-anchor="end" dominant-baseline="central">${r.gap}</text>`;
        }).join("");
      if (opts.part === "base") return track; // rows are live engine content
      return inject(track, `<g opacity="${dim}">${parts}</g>`).replace("<svg ", `<svg data-race="board" `);
    }
    case "trophy": {
      /* 1st-place trophy — candy gold, the rank lives on the bowl as
         replaceable content. Shell-free celebration asset. */
      const d4 = ({ s: 130, m: 168, l: 214 } as Record<KitSize, number>)[size] * k;
      const pad4 = 44;
      const W2 = d4 + pad4 * 2, H2 = d4 * 1.22 + pad4 * 2;
      const cx3 = W2 / 2;
      const gid11 = "tr" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const gold = hexMix("#F5B93C", bevel, 0.18);
      const goldHi = lighten(gold, 0.45), goldLo = darken(gold, 0.4);
      const bowlW = d4 * 0.72, bowlH = d4 * 0.52;
      const bx = cx3 - bowlW / 2, by = pad4 + d4 * 0.06;
      const rank = opts.label ?? "1";
      const stemY = by + bowlH, baseY = stemY + d4 * 0.2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" data-shell="${bx.toFixed(1)} ${by.toFixed(1)} ${bowlW.toFixed(1)} ${(baseY + d4 * 0.12 - by).toFixed(1)}" role="img" aria-label="first place trophy" data-race="trophy">
<defs>
  <linearGradient id="${gid11}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${goldLo}"/><stop offset="0.35" stop-color="${goldHi}"/><stop offset="0.6" stop-color="${gold}"/><stop offset="1" stop-color="${goldLo}"/></linearGradient>
  <filter id="${gid11}g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${(d4 * 0.05).toFixed(1)}"/></filter>
</defs>
<g opacity="${dim}">
  <ellipse cx="${cx3}" cy="${(baseY + d4 * 0.15).toFixed(1)}" rx="${(bowlW * 0.55).toFixed(1)}" ry="${(d4 * 0.05).toFixed(1)}" fill="rgba(0,0,0,0.35)"/>
  <ellipse cx="${cx3}" cy="${(by + bowlH * 0.34).toFixed(1)}" rx="${(bowlW * 0.72).toFixed(1)}" ry="${(bowlH * 0.62).toFixed(1)}" fill="${gold}" filter="url(#${gid11}g)" opacity="0.3"/>
  <path d="M ${(bx - d4 * 0.14).toFixed(1)} ${(by + bowlH * 0.14).toFixed(1)} q ${(-d4 * 0.16).toFixed(1)} ${(bowlH * 0.32).toFixed(1)} ${(d4 * 0.18).toFixed(1)} ${(bowlH * 0.52).toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${(d4 * 0.055).toFixed(1)}" stroke-linecap="round"/>
  <path d="M ${(bx + bowlW + d4 * 0.14).toFixed(1)} ${(by + bowlH * 0.14).toFixed(1)} q ${(d4 * 0.16).toFixed(1)} ${(bowlH * 0.32).toFixed(1)} ${(-d4 * 0.18).toFixed(1)} ${(bowlH * 0.52).toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${(d4 * 0.055).toFixed(1)}" stroke-linecap="round"/>
  <path d="M ${bx.toFixed(1)} ${by.toFixed(1)} H ${(bx + bowlW).toFixed(1)} V ${(by + bowlH * 0.42).toFixed(1)} Q ${(bx + bowlW).toFixed(1)} ${(by + bowlH).toFixed(1)} ${cx3.toFixed(1)} ${(by + bowlH).toFixed(1)} Q ${bx.toFixed(1)} ${(by + bowlH).toFixed(1)} ${bx.toFixed(1)} ${(by + bowlH * 0.42).toFixed(1)} Z" fill="url(#${gid11})" stroke="${goldLo}" stroke-width="2"/>
  <ellipse cx="${cx3}" cy="${by.toFixed(1)}" rx="${(bowlW / 2).toFixed(1)}" ry="${(d4 * 0.05).toFixed(1)}" fill="${goldHi}" stroke="${goldLo}" stroke-width="1.5"/>
  <ellipse cx="${(bx + bowlW * 0.28).toFixed(1)}" cy="${(by + bowlH * 0.3).toFixed(1)}" rx="${(bowlW * 0.12).toFixed(1)}" ry="${(bowlH * 0.22).toFixed(1)}" fill="#FFFFFF" opacity="0.5"/>
  <path d="M ${(cx3 - d4 * 0.07).toFixed(1)} ${stemY.toFixed(1)} L ${(cx3 - d4 * 0.11).toFixed(1)} ${baseY.toFixed(1)} H ${(cx3 + d4 * 0.11).toFixed(1)} L ${(cx3 + d4 * 0.07).toFixed(1)} ${stemY.toFixed(1)} Z" fill="${darken(gold, 0.15)}" stroke="${goldLo}" stroke-width="1.5"/>
  <path d="${roundRect(cx3 - bowlW * 0.34, baseY, bowlW * 0.68, d4 * 0.08, d4 * 0.02)}" fill="url(#${gid11})" stroke="${goldLo}" stroke-width="1.5"/>
  <path d="${roundRect(cx3 - bowlW * 0.42, baseY + d4 * 0.07, bowlW * 0.84, d4 * 0.06, d4 * 0.02)}" fill="${darken(gold, 0.28)}" stroke="${goldLo}" stroke-width="1.5"/>
  ${rank ? contentText(rank, cx3, by + bowlH * 0.44, d4 * 0.34 * typeK, { anchor: "middle", keepCase: true, opacity: dim }) : ""}
  <path d="M ${(bx + bowlW * 0.82).toFixed(1)} ${(by - d4 * 0.05).toFixed(1)} l ${(d4 * 0.025).toFixed(1)} ${(d4 * 0.05).toFixed(1)} ${(d4 * 0.05).toFixed(1)} ${(d4 * 0.025).toFixed(1)} ${(-d4 * 0.05).toFixed(1)} ${(d4 * 0.025).toFixed(1)} ${(-d4 * 0.025).toFixed(1)} ${(d4 * 0.05).toFixed(1)} ${(-d4 * 0.025).toFixed(1)} ${(-d4 * 0.05).toFixed(1)} ${(-d4 * 0.05).toFixed(1)} ${(-d4 * 0.025).toFixed(1)} ${(d4 * 0.05).toFixed(1)} ${(-d4 * 0.025).toFixed(1)} Z" fill="#FFFFFF" opacity="0.9"/>
</g>
</svg>`;
    }
    case "laptimes": {
      /* Lap comparison — instrument well, labeled axes, dotted traces.
         Every value is live engine data in real games. */
      const w = 350 * k, h = 240 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      if (opts.part === "base") return track;
      const inset = bw + 10;
      const dim = state === "disabled" ? 0.45 : 1;
      const gid12 = "lp" + UID++;
      const x0 = 39 + inset + 14 * k, x1 = 39 + w - inset - 14 * k;
      const y0 = 30 + inset + 40 * k, y1 = 30 + h - inset - 30 * k;
      const px0 = x0 + 38 * k; // room for the time axis
      const you = [72, 68, 65, 66, 62, 63, 60, 58];
      const rival = [70, 69, 66, 67, 64.5, 65, 63, 62];
      const lo = 56, hi = 74;
      const pt = (v: number, i: number, arr: number[]) =>
        [px0 + ((x1 - px0) * i) / (arr.length - 1), y0 + ((v - lo) / (hi - lo)) * (y1 - y0)] as const;
      const line = (arr: number[]) => arr.map((v, i) => pt(v, i, arr).map((n) => n.toFixed(1)).join(",")).join(" ");
      const yLabs = ["1:22.5", "1:22.0", "1:21.5", "1:21.0", "1:20.5"];
      const wellD = `<path d="${wellOf(w, h, inset)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.82)}" opacity="0.96"/>`;
      const grid = [0, 0.25, 0.5, 0.75, 1].map((t, gi) =>
        `<line x1="${px0.toFixed(1)}" y1="${(y0 + (y1 - y0) * t).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(y0 + (y1 - y0) * t).toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 4"/>` +
        `<text x="${x0.toFixed(1)}" y="${(y0 + (y1 - y0) * t).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(9 * k).toFixed(1)}" font-weight="600" fill="rgba(255,255,255,0.6)" dominant-baseline="central">${yLabs[gi]}</text>`).join("") +
        [0.25, 0.5, 0.75].map((t) =>
        `<line x1="${(px0 + (x1 - px0) * t).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(px0 + (x1 - px0) * t).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"/>`).join("");
      const youLast = pt(you[you.length - 1], you.length - 1, you);
      const dots = (arr: number[], c: string, r9: number) => arr.map((v, i) => {
        const [dx9, dy9] = pt(v, i, arr);
        return `<circle cx="${dx9.toFixed(1)}" cy="${dy9.toFixed(1)}" r="${r9.toFixed(1)}" fill="${c}"/>`;
      }).join("");
      const legY = 30 + inset + 16 * k;
      const parts = wellD +
        `<defs><filter id="${gid12}g" x="-60%" y="-60%" width="220%" height="220%">${shadow11(0, 0, (3 * k).toFixed(1), glow, 0.7)}</filter></defs>` +
        `<text x="${x0.toFixed(1)}" y="${legY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(12.5 * k).toFixed(1)}" font-weight="800" letter-spacing=".14em" fill="rgba(255,255,255,0.92)">LAP COMPARISON</text>` +
        `<line x1="${(x1 - 104 * k).toFixed(1)}" y1="${(legY - 3.5 * k).toFixed(1)}" x2="${(x1 - 90 * k).toFixed(1)}" y2="${(legY - 3.5 * k).toFixed(1)}" stroke="${glow}" stroke-width="${(3 * k).toFixed(1)}" stroke-linecap="round"/>` +
        `<text x="${(x1 - 85 * k).toFixed(1)}" y="${legY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.85)">YOU</text>` +
        `<line x1="${(x1 - 56 * k).toFixed(1)}" y1="${(legY - 3.5 * k).toFixed(1)}" x2="${(x1 - 42 * k).toFixed(1)}" y2="${(legY - 3.5 * k).toFixed(1)}" stroke="rgba(255,255,255,0.55)" stroke-width="${(3 * k).toFixed(1)}" stroke-dasharray="3 4" stroke-linecap="round"/>` +
        `<text x="${(x1 - 37 * k).toFixed(1)}" y="${legY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.6)">RIVAL</text>` +
        `<text x="${x1.toFixed(1)}" y="${(legY + 14 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" fill="#4ADE80" text-anchor="end">−0.271</text>` +
        grid +
        `<polyline points="${line(rival)}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="${(2 * k).toFixed(1)}" stroke-dasharray="5 5" stroke-linejoin="round"/>` +
        dots(rival, "rgba(255,255,255,0.6)", 2.6 * k) +
        `<polyline points="${line(you)}" fill="none" stroke="${glow}" stroke-width="${(3 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#${gid12}g)"/>` +
        dots(you, glow, 3 * k) +
        `<circle cx="${youLast[0].toFixed(1)}" cy="${youLast[1].toFixed(1)}" r="${(4.5 * k).toFixed(1)}" fill="${lighten(glow, 0.4)}" filter="url(#${gid12}g)"/>` +
        hudText("LAP 1", px0, y1 + 20 * k, 9.5 * k, "start", 700) +
        hudText("LAP 8", x1, y1 + 20 * k, 9.5 * k, "end", 700);
      return inject(track, `<g opacity="${dim}">${parts}</g>`).replace("<svg ", `<svg data-race="laps" `);
    }
    case "telemetry": {
      /* Telemetry — instrument well, dual axes (% left, km/h right),
         stroked throttle/brake areas, glowing speed trace. Live engine
         data in real games. */
      const w = 350 * k, h = 240 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      if (opts.part === "base") return track;
      const inset = bw + 10;
      const dim = state === "disabled" ? 0.45 : 1;
      const gid13 = "tm" + UID++;
      const x0 = 39 + inset + 14 * k, x1 = 39 + w - inset - 14 * k;
      const y0 = 30 + inset + 40 * k, y1 = 30 + h - inset - 30 * k;
      const px0 = x0 + 28 * k, px1 = x1 - 32 * k;
      const W3 = px1 - px0, H3 = y1 - y0;
      const thr = [1, 1, 0.6, 0.2, 0.5, 1, 1, 0.75, 0.3, 0.7, 1, 1];
      const brk = [0, 0, 0.5, 0.9, 0.2, 0, 0, 0.3, 0.85, 0.15, 0, 0];
      const spd = [0.8, 0.9, 0.7, 0.4, 0.55, 0.8, 0.95, 0.75, 0.45, 0.6, 0.85, 0.98];
      const brkC = hexMix("#FF4D5A", bevel, 0.18);
      const px = (i: number, arr: number[]) => (px0 + (W3 * i) / (arr.length - 1)).toFixed(1);
      const py = (v: number) => (y1 - v * H3).toFixed(1);
      const area = (arr: number[]) => `M ${px0.toFixed(1)} ${y1.toFixed(1)} ` + arr.map((v, i) => `L ${px(i, arr)} ${py(v * 0.5)}`).join(" ") + ` L ${px1.toFixed(1)} ${y1.toFixed(1)} Z`;
      const edge = (arr: number[]) => arr.map((v, i) => `${px(i, arr)},${py(v * 0.5)}`).join(" ");
      const axLab = (tx9: number, ty9: number, s9: string, anchor9: string, fs9 = 9 * k) =>
        `<text x="${tx9.toFixed(1)}" y="${ty9.toFixed(1)}" font-family="Inter, sans-serif" font-size="${fs9.toFixed(1)}" font-weight="600" fill="rgba(255,255,255,0.6)" text-anchor="${anchor9}" dominant-baseline="central">${s9}</text>`;
      const wellD = `<path d="${wellOf(w, h, inset)}" fill="${darken(effect(cfg.effects, "Inner Fill"), 0.82)}" opacity="0.96"/>`;
      const vgrid = [0.25, 0.5, 0.75].map((t) =>
        `<line x1="${(px0 + W3 * t).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(px0 + W3 * t).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="2 4"/>`).join("") +
        [0, 0.5, 1].map((t) =>
        `<line x1="${px0.toFixed(1)}" y1="${(y0 + H3 * t).toFixed(1)}" x2="${px1.toFixed(1)}" y2="${(y0 + H3 * t).toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="2 4"/>`).join("");
      const legY = 30 + inset + 16 * k;
      const parts = wellD +
        `<defs><filter id="${gid13}g" x="-60%" y="-60%" width="220%" height="220%">${shadow11(0, 0, (3 * k).toFixed(1), glow, 0.65)}</filter></defs>` +
        `<text x="${x0.toFixed(1)}" y="${legY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(12.5 * k).toFixed(1)}" font-weight="800" letter-spacing=".14em" fill="rgba(255,255,255,0.92)">TELEMETRY · S2</text>` +
        `<text x="${x1.toFixed(1)}" y="${legY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="800"><tspan fill="#4ADE80">THR</tspan><tspan fill="rgba(255,255,255,0.3)">  </tspan><tspan fill="${brkC}">BRK</tspan><tspan fill="rgba(255,255,255,0.3)">  </tspan><tspan fill="${glow}">SPD</tspan></text>`.replace('font-weight="800">', 'font-weight="800" text-anchor="end">') +
        vgrid +
        axLab(px0 - 6 * k, y0, "100%", "end") + axLab(px0 - 6 * k, y0 + H3 * 0.5, "50%", "end") + axLab(px0 - 6 * k, y1, "0%", "end") +
        axLab(px1 + 6 * k, y0, "300", "start") + axLab(px1 + 6 * k, y0 + 12 * k, "KM/H", "start", 7.5 * k) + axLab(px1 + 6 * k, y0 + H3 * 0.5, "150", "start") +
        `<line x1="${px0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${px0.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>` +
        `<line x1="${px1.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${px1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>` +
        `<path d="${area(thr)}" fill="#4ADE80" opacity="0.22"/>` +
        `<polyline points="${edge(thr)}" fill="none" stroke="#4ADE80" stroke-width="${(1.8 * k).toFixed(1)}" stroke-linejoin="round" opacity="0.85"/>` +
        `<path d="${area(brk)}" fill="${brkC}" opacity="0.26"/>` +
        `<polyline points="${edge(brk)}" fill="none" stroke="${brkC}" stroke-width="${(1.8 * k).toFixed(1)}" stroke-linejoin="round" opacity="0.9"/>` +
        `<polyline points="${spd.map((v, i) => `${px(i, spd)},${py(v)}`).join(" ")}" fill="none" stroke="${glow}" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#${gid13}g)"/>` +
        `<circle cx="${px(0, spd)}" cy="${py(spd[0])}" r="${(3 * k).toFixed(1)}" fill="${glow}"/>` +
        `<circle cx="${px(spd.length - 1, spd)}" cy="${py(spd[spd.length - 1])}" r="${(3.5 * k).toFixed(1)}" fill="${lighten(glow, 0.4)}" filter="url(#${gid13}g)"/>` +
        `<line x1="${px0.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${px1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>` +
        hudText("T4", px0, y1 + 20 * k, 9.5 * k, "start", 700) +
        hudText("T7", px1, y1 + 20 * k, 9.5 * k, "end", 700);
      return inject(track, `<g opacity="${dim}">${parts}</g>`).replace("<svg ", `<svg data-race="telemetry" `);
    }
    case "startlights": {
      /* Start lights — the five-pod countdown gantry. value lights the pods
         one by one; zero is lights-out. Click revs the sequence live. */
      const podR = 22 * k;
      const gapP = 16 * k;
      const housW = podR * 2 * 5 + gapP * 6, housH = podR * 2 + 26 * k;
      const pad5 = 44;
      const W2 = housW + pad5 * 2, H2 = housH + 34 * k + pad5 * 2;
      const hx = pad5, hy = pad5 + 14 * k;
      const v3 = clamp(value ?? 0.6, 0, 1);
      const lit = Math.round(v3 * 5);
      const alarm = hexMix("#FF4D5A", bevel, 0.15);
      const gid14 = "sl" + UID++;
      const dim = state === "disabled" ? 0.45 : 1;
      const isBase = opts.part === "base";
      let pods = "";
      for (let i = 0; i < 5; i++) {
        const cx3 = hx + gapP + podR + i * (podR * 2 + gapP);
        const cy3 = hy + housH / 2;
        const on = !isBase && i < lit;
        pods +=
          `<circle cx="${cx3.toFixed(1)}" cy="${cy3.toFixed(1)}" r="${(podR + 4 * k).toFixed(1)}" fill="${darken(bevel, 0.62)}" stroke="${darken(bevel, 0.4)}" stroke-width="1.5"/>` +
          `<circle cx="${cx3.toFixed(1)}" cy="${cy3.toFixed(1)}" r="${podR.toFixed(1)}" fill="${on ? alarm : hexMix(bevel, "#12141C", 0.78)}"${on ? ` filter="url(#${gid14}g)"` : ""}/>` +
          (on ? `<ellipse cx="${(cx3 - podR * 0.3).toFixed(1)}" cy="${(cy3 - podR * 0.38).toFixed(1)}" rx="${(podR * 0.34).toFixed(1)}" ry="${(podR * 0.2).toFixed(1)}" fill="#FFFFFF" opacity="0.55"/>`
            : `<circle cx="${cx3.toFixed(1)}" cy="${cy3.toFixed(1)}" r="${(podR * 0.72).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`);
      }
      const tag = isBase ? "" :
        `<text x="${(W2 / 2).toFixed(1)}" y="${(hy + housH + 24 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".3em" fill="${lit === 0 ? "#4ADE80" : isDarkBg(cfg.canvas) ? hexRgba(glow, 0.7) : darken(bevel, 0.3)}" text-anchor="middle" opacity="${dim}">${lit === 0 ? "LIGHTS OUT" : "GET READY"}</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" data-shell="${hx.toFixed(1)} ${hy.toFixed(1)} ${housW.toFixed(1)} ${housH.toFixed(1)}" role="img" aria-label="start lights" data-race="lights">
<defs><filter id="${gid14}g" x="-80%" y="-80%" width="260%" height="260%">${shadow11(0, 0, (6 * k).toFixed(1), alarm, 0.8)}</filter></defs>
<g opacity="${dim}">
  <rect x="${(W2 / 2 - 3 * k).toFixed(1)}" y="${(pad5 - 12 * k).toFixed(1)}" width="${(6 * k).toFixed(1)}" height="${(16 * k).toFixed(1)}" fill="${darken(bevel, 0.5)}"/>
  <path d="${roundRect(hx, hy, housW, housH, 14 * k)}" fill="${hexMix(bevel, "#0A0C14", 0.68)}" stroke="${darken(bevel, 0.45)}" stroke-width="2"/>
  ${pods}
  ${tag}
</g>
</svg>`;
    }
    case "dropdown": {
      const btn = build(cfg, state, { x: 39, y: 30, h: 110 * k, fs: 32 * k, iconSize: 30 * k }, { label: opts.label ?? "Select option", iconDef: STOCK_ICONS.chevron, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
      if (state !== "pressed") return btn;
      // pressed = open: the menu drops beneath, drawn from the same palette.
      // The viewBox origin is -glowPad, so the content width is the total
      // minus the pad on both sides (origin is negative or zero).
      const m = btn.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
      if (!m) return btn;
      const vw = +m[3] + 2 * +m[1];
      const bw2 = vw - 78, rowH = 44 * k, pad = 10 * k, menuH = rowH * 3 + pad * 2;
      const my = 30 + 110 * k + 10 * k;
      const face = darken(effect(cfg.effects, "Inner Fill"), 0.55);
      /* The open menu speaks three row voices (owner decision, 2026-07-25):
         resting · HIGHLIGHTED (the row under the cursor) · SELECTED (the
         choice that is currently true). The highlight is the kit's Hover
         language made small: color from the hover state's aura (its candy
         aura, else its Glow role), strength from the hover glow dial. The
         floor keeps the pointer from ever getting lost — a menu with an
         invisible highlight reads as broken, so this is editable within
         reason. Selected gets the check and full-strength text, no bar:
         highlighted moves constantly, selected only changes on commit. */
      const hd = cfg.stateDesigns.hover ?? cfg;
      const hovC = hd.candy.aura.color ?? hd.effects.Glow ?? effect(cfg.effects, "Glow");
      const hovOp = Math.min(0.55, 0.1 + 0.35 * (cfg.states.hover.glow / 100));
      const selCy = my + pad + rowH / 2;
      const check = `<path d="M ${(39 + bw2 - 38 * k).toFixed(1)} ${selCy.toFixed(1)} l ${(7 * k).toFixed(1)} ${(7 * k).toFixed(1)} l ${(14 * k).toFixed(1)} ${(-16 * k).toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-width="${(3.5 * k).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
      /* option rows: text slots (o1–o3, edited in Component content) — esc'd
         because slot text can arrive from OTHER makers' docs on community
         cards; stamped for Dissect; and they're list rows, so the list font
         speaks here when one is set */
      const rows = [(opts.slots?.o1 ?? "Option one").slice(0, 24), (opts.slots?.o2 ?? "Option two").slice(0, 24), (opts.slots?.o3 ?? "Option three").slice(0, 24)].map((t, i) =>
        `${i === 1 ? `<rect x="${39 + 6}" y="${(my + pad + i * rowH).toFixed(1)}" width="${bw2 - 12}" height="${rowH}" rx="${8 * k}" fill="${hexRgba(hovC, hovOp)}"/>` : ""}
         <g data-part="slot-text"><text x="${39 + 20 * k}" y="${(my + pad + i * rowH + rowH / 2).toFixed(1)}" font-family="'${cfg.type.listFont ?? font}', Inter, sans-serif" font-size="${26 * k}" font-weight="600" fill="${i <= 1 ? "#FFFFFF" : "rgba(255,255,255,0.66)"}" dominant-baseline="central">${esc(t)}</text></g>${i === 0 ? check : ""}`).join("");
      const menu = `<g><path d="${roundRect(39, my, bw2, menuH, 12 * k)}" fill="${face}" stroke="${darken(bevel, 0.5)}" stroke-width="1.5"/>${rows}</g>`;
      // the menu overlays below the button (overflow: visible) so the card
      // never reflows — pressing doesn't shift the pointer off the component
      const opened = inject(btn.replace("<svg ", '<svg style="overflow:visible" '), menu);
      if (!opts.expand) return opened;
      // as a downloaded file the SVG is consumed as an image, where root
      // overflow is clipped — grow the canvas so the whole menu survives
      return opened.replace(/height="([\d.]+)" viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/,
        (_all, _h, ox, oy, vbw, vbh) => {
          const newH = Math.max(+vbh, Math.ceil(my + menuH + 16 - +oy));
          return `height="${newH}" viewBox="${ox} ${oy} ${vbw} ${newH}"`;
        });
    }
  }
}
