import type { GenConfig, GenStateName, EffectRole, Shape, KitComponentId, KitSize, IconDef, StateDesign } from "./model";
import { lighten, darken, hexMix, desaturate, saturate, hexRgba, fontByName, DEFAULT_ICON, ICONS_ENABLED, STOCK_ICONS, KIT_SHAPE , isDarkBg, userShapes } from "./model";
import { iconGroup } from "./icons";
import { silhouetteMeta } from "./silhouettes";
import { importedShape, flattenPath, pointInPoly, selfIntersections, type Pt } from "./importedShapes";
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
  const raw = flattenPath(d, 14)[0] ?? [];
  // dedupe — shared corner endpoints from L/Q handoffs make zero-length edges
  const dd: Pt[] = [];
  for (const p of raw) {
    const last = dd[dd.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.25) dd.push(p);
  }
  if (dd.length > 2 && Math.hypot(dd[0].x - dd[dd.length - 1].x, dd[0].y - dd[dd.length - 1].y) < 0.25) dd.pop();
  if (dd.length < 6) { OFFSET_CACHE.set(key, ""); return ""; }
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
  for (const k of [0.3, 0.55, 0.85]) {
    const eps = Math.min(k === 0.3 ? 4.5 : 8, delta * k);
    /* retries also relax the pinch cull by eps: the chordified boundary sits
       inside the true curve by up to eps, so a genuinely clear point can
       measure up to eps short — the excision pass then resolves the tiny
       tip crossings those borderline points create */
    const cullT = k === 0.3 ? delta * 0.8 : Math.max(delta * 0.5, delta * 0.8 - eps);
    dOut = offsetAttempt(ring, delta, eps, Math.max(1.5, delta * k), cullT);
    if (dOut) break;
  }
  if (OFFSET_CACHE.size > 400) OFFSET_CACHE.clear();
  OFFSET_CACHE.set(key, dOut);
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
  return kept.map((l) => "M " + l.map((p) => `${p.x} ${p.y}`).join(" L ") + " Z").join(" ");
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
export function insetShape(shape: Shape, outer: string, x: number, y: number, w: number, h: number, delta: number, softness: number): string {
  if (!/[Aa]/.test(outer)) {
    const off = offsetPathInward(outer, delta);
    if (off) return off;
  }
  return shapePath(shape, x + delta, y + delta, w - delta * 2, h - delta * 2, softness);
}

export function shapePath(shape: Shape, x: number, y: number, w: number, h: number, softness: number): string {
  const imp = importedShape(shape);
  if (imp) {
    // Feasibility-lab imports fill the frame exactly — the lab exists to
    // observe stretch behavior, so no distortion cap applies here. The
    // `:caps` suffix opts a render into the three-slice experiment.
    if (shape.endsWith(":caps")) return transformPathCapAware(imp.path, imp.viewBox, x, y, w, h, imp.capSrc);
    return transformPath(imp.path, imp.viewBox, x, y, w, h);
  }
  if (shape.startsWith("user:")) {
    const us = userShapes().find((u) => u.id === shape);
    if (us) {
      // Imported artwork keeps its character: fill the frame, but never
      // distort the drawn proportions by more than ~1.4× in either axis.
      // Beyond that, the silhouette scales true-to-shape and centers.
      const [, , vw, vh] = us.vb;
      const natural = (vw || 1) / (vh || 1);
      const target = w / h;
      const stretch = target / natural;
      const MAXS = 1.42;
      let w2 = w, h2 = h;
      if (stretch > MAXS) w2 = h * natural * MAXS;        // frame far wider than the art
      else if (stretch < 1 / MAXS) h2 = (w / natural) * MAXS; // frame far taller than the art
      return transformPath(us.d, us.vb, x + (w - w2) / 2, y + (h - h2) / 2, w2, h2);
    }
    return roundRect(x, y, w, h, 4 + softness * 0.52); // registry miss — neutral fallback
  }
  if (shape === "pill") return roundRect(x, y, w, h, h / 2);
  if (shape === "round") return roundRect(x, y, w, h, 4 + softness * 0.52);
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

  /* state aura (hover glow etc.) — own color, or the Glow well */
  const auraC = disabled ? "#B9BEC6" : C.aura.color ? P(C.aura.color) : glowC;
  const glowOp = (adj.glow / 100) * (secondary ? 0.4 : 1) * (disabled ? 0 : 1);
  const aura = glowOp > 0.01
    ? `<path d="${outer}" transform="translate(0 ${(lift + visDepth * 0.4).toFixed(1)})" fill="${auraC}" opacity="${Math.min(1, glowOp * 1.35).toFixed(2)}" filter="url(#${id}gb)"/>
       <path d="${outer}" transform="translate(0 ${(lift + visDepth * 0.4).toFixed(1)})" fill="${auraC}" opacity="${(glowOp * 0.6).toFixed(2)}" filter="url(#${id}gb2)"/>`
    : "";

  /* 2 ── extrusion body — a connected solid, not a dark underlay.
     The body keeps the shell's saturation, is lit by the same key light
     (lit flank brighter, far flank darker), darkens toward the ground and
     carries a thin bounce-light lip along its bottom curve. Interpolated
     copies keep the silhouette continuous on soft corners. */
  const dk = C.extrusion.darkness / 100;
  const deepC = hexMix(darken(bevelC, clamp(0.24 + 0.34 * dk, 0, 0.8)), bevelC, 0.18);
  // enough interpolated slices that the side stays a continuous wall even at
  // maximum depth — no scalloping between the cap and the base
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
  const tFill = T2.fillMode === "auto" ? autoLabel
    : T2.fillMode === "gradient" ? `url(#${id}tg)` : P(T2.fill);
  // Text effects render through a native SVG filter with a generous explicit
  // region — CSS filters on SVG text clip and misrender in Safari, which is
  // exactly the "cut-off italics / invisible emboss" failure. Geometry scales
  // with the type size so a 76px headline carries the same relief as 40px.
  const prims: string[] = [];
  const fds = (dx: number | string, dy: number | string, dev: number, color: string, op: number | string) =>
    `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${dev.toFixed(1)}" flood-color="${color}" flood-opacity="${op}"/>`;
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
  const textFxDef = prims.length
    ? `<filter id="${id}tf" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">${prims.join("")}</filter>`
    : "";
  const textFilter = prims.length ? ` filter="url(#${id}tf)"` : "";
  const outlineStroke = T2.outline.color2 ? `url(#${id}og)` : P(T2.outline.color);
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw + pad * 2}" height="${vh + pad * 2}" viewBox="${-pad} ${-pad} ${vw + pad * 2} ${vh + pad * 2}" font-family="'${T2.font}', Inter, sans-serif" data-shell="${x.toFixed(1)} ${(y + riseDy + lift).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${label || "component"}, ${state} state">
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
  ${T2.fillMode === "gradient" ? `<linearGradient id="${id}tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P(T2.fill)}"/><stop offset="1" stop-color="${P(T2.fill2)}"/></linearGradient>` : ""}
  ${T2.outline.on && T2.outline.color2 ? `<linearGradient id="${id}og" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P(T2.outline.color)}"/><stop offset="1" stop-color="${P(T2.outline.color2)}"/></linearGradient>` : ""}
  ${hiIdx >= 0 ? (() => { const hb = clamp((T2.highlightBoost ?? 70) / 100, 0, 1); return `<linearGradient id="${id}thl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${hexMix(hiC, "#FFFFFF", 0.25 + 0.64 * hb)}"/>
    <stop offset="1" stop-color="${hexMix(glowC, "#FFFFFF", 0.05 + 0.36 * hb)}"/>
  </linearGradient>`; })() : ""}
  ${showText && T2.stripes?.on ? (() => { const pcell = fs * 0.3 * clamp((T2.stripes!.scale ?? 100) / 100, 0.25, 4); return `<pattern id="${id}tst" width="${pcell.toFixed(1)}" height="${pcell.toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${T2.stripes!.angle})">${textPatternCell(T2.stripes!.style ?? "stripes", pcell, darken(bevelC, 0.25))}</pattern>`; })() : ""}
  ${glintsDefs}
  ${textFxDef}
  <clipPath id="${id}fc"><path d="${faceP}"/></clipPath>
  <clipPath id="${id}oc"><path d="${outer}"/></clipPath>
  ${castShadow ? `<filter id="${id}sb" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${sBlur.toFixed(1)}"/></filter>` : ""}
  ${aura ? `<filter id="${id}gb" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="${id}gb2" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="30"/></filter>` : ""}
  ${noise ? `<filter id="${id}nz" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${nzFreq}" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="2.6" intercept="-0.8"/><feFuncG type="linear" slope="2.6" intercept="-0.8"/><feFuncB type="linear" slope="2.6" intercept="-0.8"/></feComponentTransfer></filter>` : ""}
</defs>
<g opacity="${(adj.opacity / 100).toFixed(2)}" transform="translate(0 ${riseDy.toFixed(1)})">
  ${castShadow ? `<g id="${id}_cast-shadow">${castShadow}</g>` : ""}
  ${contact ? `<g id="${id}_contact-shadow">${contact}</g>` : ""}
  ${aura ? `<g id="${id}_outer-glow">${aura}</g>` : ""}
  <g transform="translate(0 ${lift})">
    ${extrusion ? `<g id="${id}_extrusion">${extrusion}</g>` : ""}
    <g id="${id}_shell" opacity="${(T.frame / 100).toFixed(2)}">
      <path d="${outer}" fill="url(#${id}band)" stroke="${darken(bevelC, disabled ? 0.25 : 0.5)}" stroke-width="1.5"/>
      ${rimW > 0.2 ? `<path d="${rimP}" fill="none" stroke="url(#${id}rim)" stroke-width="${rimW.toFixed(1)}" opacity="${((C.rim.brightness / 100) * (disabled ? 0.5 : 1)).toFixed(2)}"/>` : ""}
      ${shape === "handdrawn" && !disabled ? roughInk(outer, darken(bevelC, 0.58), 1.4 * K) : ""}
    </g>
    <g data-oclip="1" clip-path="url(#${id}oc)">
    <g id="${id}_face" opacity="${(T.interior / 100).toFixed(2)}">
      <path d="${faceP}" fill="url(#${id}face)"/>
      <g clip-path="url(#${id}fc)">
        ${patternUse}
        ${igOp > 0.01 ? `<path d="${faceP}" fill="url(#${id}ig)"/>` : ""}
        ${bloom}
        ${C.gloss.layer === "above" ? "" : (C.gloss.blend && C.gloss.blend !== "normal" ? `<g style="mix-blend-mode:${C.gloss.blend}">${gloss}</g>` : gloss)}
        ${noise}
      </g>
      ${innerEdge}
    </g>
    <g id="${id}_content" opacity="${(T.content / 100).toFixed(2)}">
      ${showText && outlineUnder ? `<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="none" stroke="${outlineStroke}" stroke-width="${(outlineW + synW).toFixed(1)}" stroke-linejoin="round" text-anchor="${tAnchor}" dominant-baseline="central">${label}</text>` : ""}
      ${showText ? `<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="${tFill}"${(T2.fillOpacity ?? 100) < 100 ? ` fill-opacity="${(T2.fillOpacity / 100).toFixed(2)}"` : ""}${outlineAttrs} text-anchor="${tAnchor}" dominant-baseline="central"${textFilter}>${textInner}</text>` : ""}
      ${showText && T2.stripes?.on ? `<text x="${tTextX.toFixed(1)}" y="${(cy + 1 + textOy * K).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${T2.weight}"${fontStyle}${tStyle()} letter-spacing="${spacingEm.toFixed(3)}em" fill="url(#${id}tst)" opacity="${clamp((T2.stripes.opacity ?? 30) / 100, 0, 1).toFixed(2)}" text-anchor="${tAnchor}" dominant-baseline="central">${label}</text>` : ""}
      ${glintsLayer}
      ${iconDef ? (inheritTypo
        ? `<g${iconFilter ? ` style="filter:${iconFilter}"` : ""}${cfg.icon.opacity < 100 ? ` opacity="${(cfg.icon.opacity / 100).toFixed(2)}"` : ""}>${
            T2.outline.on && !disabled
              ? iconGroup(iconDef, iconX, iconY, iconSize, T2.outline.color2 ? `url(#${id}og)` : P(T2.outline.color), { strokeWidth: cfg.icon.strokeWidth / 10 + T2.outline.width * 0.85, rotation: cfg.icon.rotation })
              : ""
          }${iconGroup(iconDef, iconX, iconY, iconSize, !disabled && T2.fillMode === "gradient" ? `url(#${id}tg)` : iconColor, { strokeWidth: cfg.icon.strokeWidth / 10, rotation: cfg.icon.rotation })}</g>`
        : iconGroup(iconDef, iconX, iconY, iconSize, iconColor, {
            strokeWidth: cfg.icon.strokeWidth / 10,
            opacity: (cfg.icon.opacity / 100),
            rotation: cfg.icon.rotation,
            filter: iconFilter,
          })) : ""}
    </g>
    ${C.gloss.layer === "above" ? `<g id="${id}_gloss" opacity="${(T.interior / 100).toFixed(2)}" clip-path="url(#${id}fc)"${C.gloss.blend && C.gloss.blend !== "normal" ? ` style="mix-blend-mode:${C.gloss.blend}"` : ""}>${gloss}</g>` : ""}
    ${specular ? `<g id="${id}_specular" opacity="${(T.interior / 100).toFixed(2)}" clip-path="url(#${id}fc)"${SP.blend && SP.blend !== "normal" ? ` style="mix-blend-mode:${SP.blend}"` : ""}>${specular}</g>` : ""}
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

/** Dimensional candy ball — knobs for toggles, switches and sliders. */
function candyKnob(cx: number, cy: number, r: number, base: string, dot?: string): string {
  const kid = "kn" + UID++;
  return `<defs><radialGradient id="${kid}" cx="0.35" cy="0.3" r="0.9">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="0.55" stop-color="${lighten(base, 0.78)}"/>
    <stop offset="1" stop-color="${lighten(base, 0.3)}"/>
  </radialGradient></defs>
  <ellipse cx="${cx.toFixed(1)}" cy="${(cy + r * 0.6).toFixed(1)}" rx="${(r * 0.92).toFixed(1)}" ry="${(r * 0.3).toFixed(1)}" fill="rgba(0,0,0,0.38)"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${kid})" stroke="${darken(base, 0.38)}" stroke-width="1.5"/>
  ${dot ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(3, r * 0.3).toFixed(1)}" fill="${dot}"/>` : ""}
  <ellipse cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.44).toFixed(1)}" rx="${(r * 0.34).toFixed(1)}" ry="${(r * 0.19).toFixed(1)}" fill="#FFFFFF" opacity="0.85"/>`;
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
    o2: { anchor?: "start" | "middle" | "end"; opacity?: number; track?: number; keepCase?: boolean; autoInk?: string } = {}) => {
    const T4 = cfg.type;
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
    const prims4: string[] = [];
    const fd4 = (dx3: string, dy3: string, dev: number, col: string, op3: string) =>
      `<feDropShadow dx="${dx3}" dy="${dy3}" stdDeviation="${dev.toFixed(1)}" flood-color="${col}" flood-opacity="${op3}"/>`;
    if (T4.shadow.on) prims4.push(fd4((T4.shadow.x * fsc4).toFixed(1), (T4.shadow.y * fsc4).toFixed(1), T4.shadow.blur * fsc4 * 0.5, T4.shadow.color, (T4.shadow.opacity / 100).toFixed(2)));
    if (T4.glow.on && state !== "disabled") {
      prims4.push(fd4("0", "0", T4.glow.size * 0.3, T4.glow.color, (T4.glow.opacity / 100).toFixed(2)));
      prims4.push(fd4("0", "0", T4.glow.size * 0.8, T4.glow.color, ((T4.glow.opacity / 100) * 0.6).toFixed(2)));
    }
    if (prims4.length) defs4 += `<filter id="${gid4}f" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">${prims4.join("")}</filter>`;
    const outline4 = T4.outline.on && state !== "disabled"
      ? ` stroke="${T4.outline.color}" stroke-width="${(T4.outline.width * (fs2 / 52)).toFixed(1)}" stroke-linejoin="round" paint-order="stroke"`
      : "";
    // the horizontal nudge rides inside the helper so every self-drawn text
    // (counters, rows, segments) shifts with the same control as built labels
    return (defs4 ? `<defs>${defs4}</defs>` : "") +
      `<text x="${(x2 + typeOxK * k).toFixed(1)}" y="${y2.toFixed(1)}" font-family="'${T4.font}', Inter, sans-serif" font-size="${fs2.toFixed(1)}" font-weight="${Math.max(700, T4.weight)}"${T4.italic ? ' font-style="italic"' : ""} letter-spacing="${(((o2.track ?? 0) + T4.spacing) / 100).toFixed(3)}em" fill="${fill4}"${(T4.fillOpacity ?? 100) < 100 ? ` fill-opacity="${(T4.fillOpacity / 100).toFixed(2)}"` : ""}${outline4}${prims4.length ? ` filter="url(#${gid4}f)"` : ""}${o2.anchor ? ` text-anchor="${o2.anchor}"` : ""} dominant-baseline="central" opacity="${(o2.opacity ?? 1).toFixed(2)}">${esc(cased4)}</text>`;
  };
  const wellFill = darken(effect(cfg.effects, "Inner Fill"), 0.72);
  const font = cfg.type.font;
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
      defs += `<filter id="${gid}bg" x="-60%" y="-160%" width="220%" height="420%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="${(BFX.glow.size * 0.6).toFixed(1)}" flood-color="${BFX.glow.color}" flood-opacity="${(BFX.glow.opacity / 100).toFixed(2)}"/></filter>`;
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
    const gidI = "ti" + UID++;
    const grad = T4.fillMode === "gradient" ? `<defs><linearGradient id="${gidI}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T4.fill}"/><stop offset="1" stop-color="${T4.fill2}"/></linearGradient></defs>` : "";
    const fillI = T4.fillMode === "gradient" ? `url(#${gidI})` : T4.fillMode === "solid" ? T4.fill : tone;
    const outl = T4.outline.on ? iconGroup(defI, xI, yI, sI, T4.outline.color, { strokeWidth: swI * iconWK + T4.outline.width * 0.8 }) : "";
    return grad + outl + iconGroup(defI, xI, yI, sI, fillI, { strokeWidth: swI * iconWK });
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
      const segW = (w - bw * 2) / 3;
      // value picks the active segment (0..2) — play mode drives it live;
      // the resting default stays on the middle segment, as it always has
      const sel = clamp(Math.round(value ?? 1), 0, 2);
      const selX = 39 + bw + segW * sel;
      const well = `<path d="${roundRect(selX + 4, 30 + bw + 4, segW - 8, h - bw * 2 - 8, (h - bw * 2 - 8) * 0.3)}" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
      const t = (label: string, cx: number, op: number) =>
        contentText(label, cx, cy + typeOyK * k, 30 * k * typeK, { anchor: "middle", opacity: op });
      const caps = opts.segments && opts.segments.length === 3 ? opts.segments : ["ONE", "TWO", "THREE"];
      return stampTrack(inject(track, well + caps.map((cap, i) => t(cap, 39 + bw + segW * (i + 0.5), i === sel ? 1 : 0.55)).join("")), 39 + bw, w - bw * 2);
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
      // slider mercury follows the silhouette too — the left cap clips to a
      // silhouette-shaped region; the knob owns the leading edge
      const mercS = shapePath(shapeOv ?? KIT_SHAPE[id] ?? cfg.shape, bx, by, trackW, bh, Math.max(0, cfg.bevel.softness - 12));
      return stampTrack(inject(track,
        `<path d="${wellOf(w, h, inset)}" fill="${wellFill}" opacity="0.92"/>
         <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>${sfx.defs}<clipPath id="${gid}w"><path d="${mercS}"/></clipPath></defs>
         ${fillW > 1 ? `<g clip-path="url(#${gid}w)">${sfx.open}<path d="${roundRect(bx - 2, by, fillW + 2, bh, Math.min(bh / 2, fillW / 2))}" fill="url(#${gid})" opacity="${state === "disabled" ? 0.35 : 0.95}"/>${sfx.close}
         <path d="${roundRect(bx - 2, by + bh * 0.08, fillW + 2, bh * 0.34, bh * 0.17)}" fill="#FFFFFF" opacity="0.3"/>${sfx.over}</g>` : ""}` +
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
      /* Segmented meter — stamina pips, charge cells, boss phases. The well
         and both END cells inherit the theme silhouette (cells clip to the
         well path); middle cells stay squared. Snap mode lights whole
         cells; smooth mode slides one fill under the notches. */
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
          // end cells overreach into the well's rounded zone — the clip
          // shapes them to the silhouette
          const x0 = i === 0 ? bx - gapPad - inset : cx0;
          const x1 = i === n - 1 ? bx + trackW + gapPad + inset : cx0 + cellW;
          const grow = i === 0 || i === n - 1 ? gapPad : 0;
          const on = i < lit;
          const body = `<rect x="${x0.toFixed(1)}" y="${(by - grow).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(bh + grow * 2).toFixed(1)}" rx="${Math.min((2 + cfg.bevel.softness * 0.16) * k, cellW * 0.3, bh / 2).toFixed(1)}" fill="${on ? `url(#${gid})` : "rgba(255,255,255,0.07)"}"${on ? ` opacity="${dim}"` : ""}/>`;
          if (on) litCells += body + `<rect x="${x0.toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>`;
          else offCells += body;
        }
      } else {
        const fw2 = trackW * v;
        if (fw2 > 1) {
          litCells += `<rect x="${(bx - gapPad - inset).toFixed(1)}" y="${(by - gapPad).toFixed(1)}" width="${(fw2 + gapPad + inset).toFixed(1)}" height="${(bh + gapPad * 2).toFixed(1)}" fill="url(#${gid})" opacity="${dim}"/>
            <rect x="${(bx - gapPad - inset).toFixed(1)}" y="${(by + bh * 0.08).toFixed(1)}" width="${(fw2 + gapPad + inset).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>`;
        }
        // the gap notches carve the fill into segments
        for (let i = 1; i < n; i++) {
          const gx = bx + i * (cellW + gap) - gap;
          offCells += `<rect x="${gx.toFixed(1)}" y="${(by - gapPad).toFixed(1)}" width="${gap.toFixed(1)}" height="${(bh + gapPad * 2).toFixed(1)}" fill="${wellFill}"/>`;
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
      /* v73 · the fills wear FULL rounded caps — the outer end's rounding
         is consumed by the well clip (the rect overhangs it), so only the
         drain edge shows the cap: no more flat corners mid-bar */
      const capR = (bh + gapPad * 2) / 2;
      const parts = `<path d="${wellP}" fill="${wellFill}" opacity="0.92"/>
        <defs><clipPath id="${gid}w"><path d="${wellP}"/></clipPath>
        <linearGradient id="${gid}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
        <linearGradient id="${gid}r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${darken(rC, 0.25)}"/><stop offset="1" stop-color="${rC}"/></linearGradient></defs>
        <g clip-path="url(#${gid}w)" data-vs="1">
          ${vL > 0.01 ? `<rect x="${(bx - gapPad - inset).toFixed(1)}" y="${(by - gapPad).toFixed(1)}" width="${(gapPad + inset + halfW * vL).toFixed(1)}" height="${(bh + gapPad * 2).toFixed(1)}" rx="${capR.toFixed(1)}" fill="url(#${gid}l)" opacity="${state === "disabled" ? 0.35 : 0.95}"/>
          <rect x="${(bx - gapPad - inset).toFixed(1)}" y="${(by + bh * 0.06).toFixed(1)}" width="${(gapPad + inset + halfW * vL - bh * 0.2).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>` : ""}
          ${vR > 0.01 ? `<rect x="${(bx + trackW - halfW * vR).toFixed(1)}" y="${(by - gapPad).toFixed(1)}" width="${(halfW * vR + gapPad + inset).toFixed(1)}" height="${(bh + gapPad * 2).toFixed(1)}" rx="${capR.toFixed(1)}" fill="url(#${gid}r)" opacity="${state === "disabled" ? 0.35 : 0.95}"/>
          <rect x="${(bx + trackW - halfW * vR + bh * 0.2).toFixed(1)}" y="${(by + bh * 0.06).toFixed(1)}" width="${(halfW * vR + gapPad + inset - bh * 0.2).toFixed(1)}" height="${(bh * 0.3).toFixed(1)}" rx="${(bh * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="0.28"/>` : ""}
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
      const shell = build(cfg, state, { x: 42, y: 33, h, fs: 0, iconSize: 0, tokenH: 150 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
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
        const top3 = primaryB ? lighten(bevel, 0.22) : "rgba(255,255,255,0.15)";
        const bot3 = primaryB ? darken(bevel, 0.12) : "rgba(255,255,255,0.05)";
        return `<defs><linearGradient id="${gid3}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top3}"/><stop offset="1" stop-color="${bot3}"/></linearGradient></defs>
          <rect x="${bx3.toFixed(1)}" y="${btnY.toFixed(1)}" width="${btnW.toFixed(1)}" height="${btnH.toFixed(1)}" rx="${(btnH / 2).toFixed(1)}" fill="url(#${gid3})" stroke="${hexRgba(darken(bevel, 0.5), 0.55)}" stroke-width="1.4"${primaryB && state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(6 * k).toFixed(1)}px ${hexRgba(glow, 0.55)})"` : ""}/>
          <rect x="${(bx3 + btnH * 0.28).toFixed(1)}" y="${(btnY + btnH * 0.12).toFixed(1)}" width="${(btnW - btnH * 0.56).toFixed(1)}" height="${(btnH * 0.3).toFixed(1)}" rx="${(btnH * 0.15).toFixed(1)}" fill="#FFFFFF" opacity="${primaryB ? 0.3 : 0.12}"/>
          ${contentText(lbl3, bx3 + btnW / 2, btnY + btnH / 2 + 1, 23 * k * typeK, { anchor: "middle" })}`;
      };
      const bx0 = 42 + inset + 8 * k;
      return inject(shell.replace("<svg ", '<svg data-dialog="1" '),
        title + well + lines + capBtn(bx0, "CLAIM", true) + capBtn(bx0 + btnW + btnGap, "LATER", false));
    }
    case "toast": {
      /* System chrome · toast — one confirmation strip: accent edge, themed
         check, message, quiet dismiss. */
      const w = 560 * k, h = 96 * k;
      const shell = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 110 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 4;
      const stripe = `<rect x="${(39 + inset + 10 * k).toFixed(1)}" y="${(30 + inset + 12 * k).toFixed(1)}" width="${(6 * k).toFixed(1)}" height="${(h - inset * 2 - 24 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" fill="${glow}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(4 * k).toFixed(1)}px ${hexRgba(glow, 0.7)})"` : ""}/>`;
      const chk = STOCK_ICONS.check ? themedIcon(STOCK_ICONS.check, 39 + inset + 30 * k, 30 + h / 2 - 15 * k, 30 * k, glow, 2.6) : "";
      const msg = contentText(opts.label ?? "Progress saved", 39 + inset + 78 * k, 30 + h / 2 + 1, 26 * k * typeK, { keepCase: true });
      const dismiss = `<text x="${(39 + w - inset - 26 * k).toFixed(1)}" y="${(30 + h / 2 + 1).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(26 * k).toFixed(1)}" font-weight="600" fill="rgba(255,255,255,0.4)" text-anchor="middle" dominant-baseline="central">×</text>`;
      return inject(shell.replace("<svg ", '<svg data-toast="1" '), stripe + chk + msg + dismiss);
    }
    case "tooltip": {
      /* System chrome · tooltip — the kit material in a small bubble with a
         pointer nub; games tooltip in full costume, so the shell stays. */
      const h6 = 84 * k;
      const piece = build(cfg, state, { x: 39, y: 30, h: h6, fs: 26 * k, iconSize: 0 }, { label: opts.label ?? "+15% CRIT CHANCE", iconDef: null, shapeOverride: sov, textOy: opts.textOy, textOx: opts.textOx });
      const shellM = /data-shell="([-\d. ]+)"/.exec(piece);
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
      const shellM8 = /data-shell="([-\d. ]+)"/.exec(piece);
      if (!shellM8) return piece;
      const [sx8, sy8, sw8, sh8] = shellM8[1].split(" ").map(Number);
      const ring8 = `<circle cx="${(sx8 + sw8 / 2).toFixed(1)}" cy="${(sy8 + sh8 / 2).toFixed(1)}" r="${(Math.min(sw8, sh8) / 2 + 5 * k).toFixed(1)}" fill="none" stroke="${ringC8}" stroke-width="${(4 * k).toFixed(1)}" opacity="${state === "disabled" ? 0.3 : 0.9}"${state !== "disabled" ? ` style="filter: drop-shadow(0 0 ${(5 * k).toFixed(1)}px ${hexRgba(ringC8, 0.7)})"` : ""}/>`;
      return inject(piece.replace("<svg ", '<svg data-padbtn="1" '), ring8);
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
        cells += `<text x="${(cx0 + 7 * k).toFixed(1)}" y="${(yh + 17 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.4)">${i + 1}</text>`;
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
      const embS = w * 0.44;
      const spark = (sx: number, sy: number, r: number) =>
        `<path d="M ${sx.toFixed(1)} ${(sy - r).toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} L ${(sx + r).toFixed(1)} ${sy.toFixed(1)} L ${(sx + r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${sx.toFixed(1)} ${(sy + r).toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy + r * 0.28).toFixed(1)} L ${(sx - r).toFixed(1)} ${sy.toFixed(1)} L ${(sx - r * 0.28).toFixed(1)} ${(sy - r * 0.28).toFixed(1)} Z" fill="${hexRgba(hexMix(glow, "#FFFFFF", 0.55), 0.85)}"/>`;
      let parts = `<defs><radialGradient id="${gid}g"><stop offset="0" stop-color="${glow}" stop-opacity="0.5"/><stop offset="0.6" stop-color="${glow}" stop-opacity="0.18"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
        <path d="${frameP}" fill="none" stroke="${hexRgba(hexMix(glow, "#FFFFFF", 0.25), 0.55)}" stroke-width="${(2.4 * k).toFixed(1)}"/>`;
      if (emb) {
        parts += `<circle cx="${cxC.toFixed(1)}" cy="${cyC.toFixed(1)}" r="${(embS * 0.85).toFixed(1)}" fill="url(#${gid}g)"/>` +
          `<g style="filter: drop-shadow(0 0 ${(10 * k).toFixed(0)}px ${glow})">${themedIcon(emb, cxC - embS / 2, cyC - embS / 2, embS, hexMix(glow, "#FFFFFF", 0.35), 1.8)}</g>`;
      }
      const inX = 39 + bw + 34 * k, inY = 30 + bw + 34 * k;
      parts += spark(inX, inY, 7 * k) + spark(39 + w - bw - 34 * k, inY, 7 * k) + spark(inX, 30 + h - bw - 34 * k, 5 * k) + spark(39 + w - bw - 34 * k, 30 + h - bw - 34 * k, 5 * k);
      if (opts.label) {
        const py = 30 + h - 76 * k;
        parts += `<path d="${roundRect(39 + w * 0.12, py, w * 0.76, 46 * k, 12 * k)}" fill="${wellFill}" opacity="0.94" stroke="${hexRgba(darken(bevel, 0.35), 0.6)}" stroke-width="1"/>` +
          `<text x="${cxC.toFixed(1)}" y="${(py + 23 * k + 1).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(17 * k * typeK).toFixed(1)}" font-weight="800" letter-spacing="1.5" fill="${hexMix(glow, "#FFFFFF", 0.4)}" text-anchor="middle" dominant-baseline="central">${opts.label}</text>`;
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
        parts += `<circle cx="${cxP.toFixed(1)}" cy="${cyP.toFixed(1)}" r="${(embS * 0.8).toFixed(1)}" fill="url(#${gid}g)"/>` +
          `<g style="filter: drop-shadow(0 0 ${(9 * k).toFixed(0)}px ${glow})">${themedIcon(emb, cxP - embS / 2, cyP - embS / 2, embS, hexMix(glow, "#FFFFFF", 0.35), 1.8)}</g>`;
      }
      parts += sparkP(39 + w * 0.24, 30 + h * 0.26, 6 * k) + sparkP(39 + w * 0.78, 30 + h * 0.32, 8 * k) + sparkP(39 + w * 0.3, 30 + h * 0.66, 5 * k);
      parts += `<text x="${cxP.toFixed(1)}" y="${(30 + h * 0.72).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(19 * k * typeK).toFixed(1)}" font-weight="800" letter-spacing="2" fill="${hexMix(glow, "#FFFFFF", 0.4)}" text-anchor="middle" dominant-baseline="central">${opts.label ?? "12 CARDS"}</text>`;
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
          ? contentText(`${val}${maxTxt}`, 39 + (w - (opts.addBtn ? 46 * k : 0)) / 2, cy + 1 + typeOyK * k, fsV * typeK, { anchor: "middle", keepCase: true, opacity: dim })
          : contentText(val, 39 + 20 * k + medR * 2, cy + 1 + typeOyK * k, fsV * typeK, { keepCase: true, opacity: dim }) +
            /* the divider gets REAL air: 0.7em advance per value glyph (heavy
               italic faces overhang) plus a 0.36em gap — and no leading space
               in the <text>, since SVG collapses it and the slash would kiss
               the last digit (the visual gate caught exactly that) */
            (maxTxt ? `<text x="${(39 + 20 * k + medR * 2 + val.length * fsV * typeK * 0.7 + fsV * typeK * 0.36).toFixed(1)}" y="${(cy + 1 + typeOyK * k).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${(fsV * typeK * 0.8).toFixed(1)}" font-weight="600" fill="rgba(255,255,255,0.55)" dominant-baseline="central">${esc(`/ ${opts.max}`)}</text>` : "")) +
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
          `<text x="${tx.toFixed(1)}" y="${(30 + inset + 16 * k + lineAdv + ((R2.subDy ?? 0) + (R2.lineGap ?? 0) + (R2.blockDy ?? 0) + (opts.textOy ?? 0)) * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${fsS.toFixed(1)}" font-weight="600" letter-spacing="${((R2.subTrack ?? 0) / 100).toFixed(3)}em" fill="${R2.subColor ?? "rgba(255,255,255,0.55)"}">${esc(sub)}</text>`) +
        `</g>` +
        (showBar
          ? (() => { const rfx = barFx(gid2, tx, barY, fillW2, 10 * k, 5 * k); return `<defs>${rfx.defs}</defs><path d="${roundRect(tx, barY, barW, 10 * k, 5 * k)}" fill="${wellFill}" opacity="0.9"/>` +
            (fillW2 > 1 ? `${rfx.open}<path d="${roundRect(tx, barY, fillW2, 10 * k, 5 * k)}" fill="url(#${gid2})" opacity="${dim}"/>${rfx.close}${rfx.over}` : ""); })()
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
      const txt = contentText(cur, 39 + 48 * k, cy5 + 1 + typeOyK * k, 34 * k * typeK, { keepCase: true }) +
        `<text x="${(39 + 48 * k + cur.length * 21 * k * typeK + 6 * k).toFixed(1)}" y="${(cy5 + 4 + typeOyK * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(18 * k * Math.max(0.8, typeK * 0.85 + 0.15)).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.5)" dominant-baseline="central">/ ${esc(res)}</text>`;
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
      const tags = ["DAYS", "HOURS", "MINUTES", "SECONDS"].slice(4 - Math.min(segs.length, 4));
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
        `<text x="${cx3}" y="${(cy3 + r0 * 0.82).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">MPH</text>`;
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
        `<text x="${cx3}" y="${(cy3 + r0 * 0.46).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">MPH</text>`;
      if (useHousing) {
        const track = build(cfg, state, { x: 39, y: 30, h: D, fs: 0, iconSize: 0, tokenH: 280 }, { iconDef: null, label: "", fixedW: D, shapeOverride: sov });
        const well = `<circle cx="${cx3.toFixed(1)}" cy="${cy3.toFixed(1)}" r="${(r0 + 8 * k).toFixed(1)}" fill="${wellFill}" opacity="0.92"/>`;
        return inject(track.replace("<svg ", '<svg data-race="speedo2" '),
          `<defs><filter id="${gid8}g" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="${(4 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.7"/></filter></defs><g opacity="${dim}">${well}${segs}${arc}${readout}</g>`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="HUD speedometer" data-race="speedo2">
<defs><filter id="${gid8}g" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="${(4 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.7"/></filter></defs>
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
        `<text x="${cx3}" y="${(cy3 + r0 * 0.82).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".24em" fill="${hexRgba(glow, 0.75)}" text-anchor="middle" opacity="${dim}">RPM ×1000</text>`;
      const trackT = build(cfg, state, { x: 39, y: 30, h: D, fs: 0, iconSize: 0, tokenH: 280 }, { iconDef: null, label: "", fixedW: D, shapeOverride: sov });
      return inject(trackT.replace("<svg ", `<svg data-race="tacho"${v3 > 0.82 ? ' data-urgent="1"' : ""} `),
        `<defs>
  <linearGradient id="${gidT2}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bevel}"/><stop offset="1" stop-color="${darken(bevel, 0.3)}"/></linearGradient>
  <filter id="${gidT2}g" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="${(3.5 * k).toFixed(1)}" flood-color="${v3 > 0.82 ? alarm : "#7CE6A0"}" flood-opacity="0.5"/></filter>
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
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}"><defs><filter id="${gid9}g" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="${(3 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.55"/></filter></defs>${iso(track)}</svg>`;
      }
      const markers =
        `<circle cx="${(64 * sx3 + pad2).toFixed(1)}" cy="${(68 * sy3 + pad2).toFixed(1)}" r="${(6.5 * k).toFixed(1)}" fill="${glow}" filter="url(#${gid9}g)"/>` +
        `<circle cx="${(150 * sx3 + pad2).toFixed(1)}" cy="${(107 * sy3 + pad2).toFixed(1)}" r="${(5 * k).toFixed(1)}" fill="${isDarkBg(cfg.canvas) ? "#FFFFFF" : darken(bevel, 0.55)}" opacity="0.85"/>` +
        `<circle cx="${(114 * sx3 + pad2).toFixed(1)}" cy="${(34 * sy3 + pad2).toFixed(1)}" r="${(5 * k).toFixed(1)}" fill="${hexMix("#FF4D5A", bevel, 0.18)}" opacity="0.9"/>`;
      const tag = `<text x="${(cxOf(W2)).toFixed(1)}" y="${(H2 - 10).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11 * k).toFixed(1)}" font-weight="800" letter-spacing=".3em" fill="${isDarkBg(cfg.canvas) ? hexRgba(glow, 0.7) : darken(bevel, 0.3)}" text-anchor="middle" opacity="${dim}">KAZURI RING · GP CIRCUIT</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2.toFixed(0)}" height="${H2.toFixed(0)}" viewBox="0 0 ${W2.toFixed(0)} ${H2.toFixed(0)}" role="img" aria-label="race circuit map" data-race="circuit">
<defs><filter id="${gid9}g" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="${(3 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.55"/></filter></defs>
<g opacity="${dim}">${iso(track + markers)}${tag}</g>
</svg>`;
    }
    case "leaderboard": {
      /* Track position list — TOP 5, the player's row lit. The panel is the
         kit shell; every row is live engine content in real games. */
      const w = 330 * k, h = 250 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      const inset = bw + 8;
      const dim = state === "disabled" ? 0.45 : 1;
      const rows = [
        { p: "1", d: "HAM", gap: "1:21.548", you: false },
        { p: "2", d: "VER", gap: "+0.842", you: false },
        { p: "3", d: "YOU", gap: "+2.156", you: true },
        { p: "4", d: "LEC", gap: "+3.271", you: false },
        { p: "5", d: "PIA", gap: "+4.712", you: false },
      ];
      const x0 = 39 + inset + 16 * k, x1 = 39 + w - inset - 18 * k;
      const headY = 30 + inset + 20 * k;
      const rowH = (h - inset * 2 - 40 * k) / rows.length;
      const gid10 = "lb" + UID++;
      const ink = "rgba(255,255,255,0.88)", ink2 = "rgba(255,255,255,0.5)";
      const parts =
        `<defs><linearGradient id="${gid10}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${hexRgba(bevel, 0.55)}"/><stop offset="0.5" stop-color="${hexRgba(glow, 0.55)}"/><stop offset="1" stop-color="${hexRgba(bevel, 0.55)}"/></linearGradient></defs>` +
        `<text x="${x0.toFixed(1)}" y="${headY.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(12 * k).toFixed(1)}" font-weight="800" letter-spacing=".26em" fill="${hexRgba(glow, 0.8)}" opacity="${dim}">TOP 5</text>` +
        rows.map((r, i) => {
          const yC = 30 + inset + 34 * k + rowH * (i + 0.5);
          const hl = r.you
            ? `<rect x="${(x0 - 6 * k).toFixed(1)}" y="${(yC - rowH * 0.44).toFixed(1)}" width="${(x1 - x0 + 12 * k).toFixed(1)}" height="${(rowH * 0.88).toFixed(1)}" rx="${(7 * k).toFixed(1)}" fill="url(#${gid10}s)" stroke="${hexRgba(glow, 0.8)}" stroke-width="1.5"/>`
            : "";
          const w8 = r.you ? 900 : 700;
          return hl +
            `<text x="${(x0 + 4 * k).toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(15 * k).toFixed(1)}" font-weight="${w8}" fill="${r.you ? "#FFFFFF" : ink2}" dominant-baseline="central">${r.p}</text>` +
            `<text x="${(x0 + 30 * k).toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(16 * k).toFixed(1)}" font-weight="${w8}" letter-spacing=".08em" fill="${r.you ? "#FFFFFF" : ink}" dominant-baseline="central">${r.d}</text>` +
            `<text x="${x1.toFixed(1)}" y="${yC.toFixed(1)}" font-family="Inter, sans-serif" font-size="${(13.5 * k).toFixed(1)}" font-weight="600" fill="${r.you ? hexMix(glow, "#FFFFFF", 0.4) : ink2}" text-anchor="end" dominant-baseline="central">${r.gap}</text>`;
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
      /* Lap comparison — two lap-time traces on one techy plot. Every value
         is live engine data in real games; the panel is the kit shell. */
      const w = 340 * k, h = 240 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      if (opts.part === "base") return track;
      const inset = bw + 10;
      const dim = state === "disabled" ? 0.45 : 1;
      const gid12 = "lp" + UID++;
      const x0 = 39 + inset + 14 * k, x1 = 39 + w - inset - 14 * k;
      const y0 = 30 + inset + 34 * k, y1 = 30 + h - inset - 30 * k;
      const you = [72, 68, 65, 66, 62, 63, 60, 58];
      const rival = [70, 69, 66, 67, 64.5, 65, 63, 62];
      const lo = 56, hi = 74;
      const pt = (v: number, i: number, arr: number[]) =>
        `${(x0 + ((x1 - x0) * i) / (arr.length - 1)).toFixed(1)},${(y0 + ((v - lo) / (hi - lo)) * (y1 - y0)).toFixed(1)}`;
      const grid = [0.25, 0.5, 0.75].map((t) =>
        `<line x1="${x0.toFixed(1)}" y1="${(y0 + (y1 - y0) * t).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(y0 + (y1 - y0) * t).toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="3 5"/>`).join("");
      const youPts = you.map((v, i) => pt(v, i, you)).join(" ");
      const last = youPts.split(" ").pop()!.split(",");
      const parts =
        `<defs><filter id="${gid12}g" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="${(3 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.7"/></filter></defs>` +
        `<text x="${x0.toFixed(1)}" y="${(30 + inset + 16 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11.5 * k).toFixed(1)}" font-weight="800" letter-spacing=".22em" fill="${hexRgba(glow, 0.8)}">LAP COMPARISON</text>` +
        `<circle cx="${(x1 - 92 * k).toFixed(1)}" cy="${(30 + inset + 12 * k).toFixed(1)}" r="${(3.5 * k).toFixed(1)}" fill="${glow}"/>` +
        `<text x="${(x1 - 84 * k).toFixed(1)}" y="${(30 + inset + 16 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.75)">YOU</text>` +
        `<circle cx="${(x1 - 48 * k).toFixed(1)}" cy="${(30 + inset + 12 * k).toFixed(1)}" r="${(3.5 * k).toFixed(1)}" fill="rgba(255,255,255,0.5)"/>` +
        `<text x="${(x1 - 40 * k).toFixed(1)}" y="${(30 + inset + 16 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="700" fill="rgba(255,255,255,0.55)">RIVAL</text>` +
        grid +
        `<polyline points="${rival.map((v, i) => pt(v, i, rival)).join(" ")}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="${(2 * k).toFixed(1)}" stroke-dasharray="5 5" stroke-linejoin="round"/>` +
        `<polyline points="${youPts}" fill="none" stroke="${glow}" stroke-width="${(3 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#${gid12}g)"/>` +
        `<circle cx="${last[0]}" cy="${last[1]}" r="${(4.5 * k).toFixed(1)}" fill="${glow}" filter="url(#${gid12}g)"/>` +
        `<text x="${x0.toFixed(1)}" y="${(y1 + 20 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(9.5 * k).toFixed(1)}" font-weight="700" letter-spacing=".12em" fill="rgba(255,255,255,0.4)">LAP 1</text>` +
        `<text x="${x1.toFixed(1)}" y="${(y1 + 20 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(9.5 * k).toFixed(1)}" font-weight="700" letter-spacing=".12em" fill="rgba(255,255,255,0.4)" text-anchor="end">LAP 8</text>` +
        `<text x="${x1.toFixed(1)}" y="${(y0 - 8 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10.5 * k).toFixed(1)}" font-weight="800" fill="#4ADE80" text-anchor="end">−0.7s / LAP</text>`;
      return inject(track, `<g opacity="${dim}">${parts}</g>`).replace("<svg ", `<svg data-race="laps" `);
    }
    case "telemetry": {
      /* Telemetry — throttle / brake / speed traces over one sector. The
         techy pit-wall panel; every trace is live engine data in games. */
      const w = 340 * k, h = 240 * k;
      const track = build(cfg, state, { x: 39, y: 30, h, fs: 0, iconSize: 0, tokenH: 168 }, { iconDef: null, label: "", fixedW: w, shapeOverride: sov });
      if (opts.part === "base") return track;
      const inset = bw + 10;
      const dim = state === "disabled" ? 0.45 : 1;
      const gid13 = "tm" + UID++;
      const x0 = 39 + inset + 14 * k, x1 = 39 + w - inset - 14 * k;
      const y0 = 30 + inset + 34 * k, y1 = 30 + h - inset - 30 * k;
      const W3 = x1 - x0, H3 = y1 - y0;
      // normalized traces along the sector (0..1 of plot height)
      const thr = [1, 1, 0.6, 0.2, 0.5, 1, 1, 0.75, 0.3, 0.7, 1, 1];
      const brk = [0, 0, 0.5, 0.9, 0.2, 0, 0, 0.3, 0.85, 0.15, 0, 0];
      const spd = [0.8, 0.9, 0.7, 0.4, 0.55, 0.8, 0.95, 0.75, 0.45, 0.6, 0.85, 0.98];
      const px = (i: number, arr: number[]) => (x0 + (W3 * i) / (arr.length - 1)).toFixed(1);
      const py = (v: number) => (y1 - v * H3).toFixed(1);
      const area = (arr: number[]) => `M ${x0.toFixed(1)} ${y1.toFixed(1)} ` + arr.map((v, i) => `L ${px(i, arr)} ${py(v * 0.5)}`).join(" ") + ` L ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
      const vgrid = [0.2, 0.4, 0.6, 0.8].map((t) =>
        `<line x1="${(x0 + W3 * t).toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(x0 + W3 * t).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`).join("");
      const parts =
        `<defs><filter id="${gid13}g" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="${(3 * k).toFixed(1)}" flood-color="${glow}" flood-opacity="0.65"/></filter></defs>` +
        `<text x="${x0.toFixed(1)}" y="${(30 + inset + 16 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(11.5 * k).toFixed(1)}" font-weight="800" letter-spacing=".22em" fill="${hexRgba(glow, 0.8)}">TELEMETRY · S2</text>` +
        `<text x="${x1.toFixed(1)}" y="${(30 + inset + 16 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(10 * k).toFixed(1)}" font-weight="700" text-anchor="end"><tspan fill="#4ADE80">THR</tspan><tspan fill="rgba(255,255,255,0.3)"> · </tspan><tspan fill="${hexMix("#FF4D5A", bevel, 0.18)}">BRK</tspan><tspan fill="rgba(255,255,255,0.3)"> · </tspan><tspan fill="${glow}">SPD</tspan></text>` +
        vgrid +
        `<path d="${area(thr)}" fill="#4ADE80" opacity="0.28"/>` +
        `<path d="${area(brk)}" fill="${hexMix("#FF4D5A", bevel, 0.18)}" opacity="0.3"/>` +
        `<polyline points="${spd.map((v, i) => `${px(i, spd)},${py(v)}`).join(" ")}" fill="none" stroke="${glow}" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#${gid13}g)"/>` +
        `<line x1="${x0.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>` +
        `<text x="${x0.toFixed(1)}" y="${(y1 + 20 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(9.5 * k).toFixed(1)}" font-weight="700" letter-spacing=".12em" fill="rgba(255,255,255,0.4)">T4</text>` +
        `<text x="${x1.toFixed(1)}" y="${(y1 + 20 * k).toFixed(1)}" font-family="Inter, sans-serif" font-size="${(9.5 * k).toFixed(1)}" font-weight="700" letter-spacing=".12em" fill="rgba(255,255,255,0.4)" text-anchor="end">T7</text>`;
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
<defs><filter id="${gid14}g" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="${(6 * k).toFixed(1)}" flood-color="${alarm}" flood-opacity="0.8"/></filter></defs>
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
      const hi = effect(cfg.effects, "Glow");
      const rows = ["Option one", "Option two", "Option three"].map((t, i) =>
        `${i === 0 ? `<rect x="${39 + 6}" y="${(my + pad + i * rowH).toFixed(1)}" width="${bw2 - 12}" height="${rowH}" rx="${8 * k}" fill="${hexRgba(hi, 0.22)}"/>` : ""}
         <text x="${39 + 20 * k}" y="${(my + pad + i * rowH + rowH / 2).toFixed(1)}" font-family="'${font}', Inter, sans-serif" font-size="${26 * k}" font-weight="600" fill="${i === 0 ? "#FFFFFF" : "rgba(255,255,255,0.66)"}" dominant-baseline="central">${t}</text>`).join("");
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
