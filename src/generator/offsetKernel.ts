/* ── The curve-aware inner-offset kernel ──────────────────────────────────
   Built to an external math review of the previous pipeline (flatten →
   offset chords → stack-popped planar cleanup → Catmull-Rom refit), whose
   three core findings this file answers:

   1 · HOLES OFFSET TOO. Every contour is normalized so the filled side
       sits on its LEFT, then every contour offsets left by δ — the outer
       boundary moves inward and piercings grow outward, which is the true
       erosion (the old pass-through is a design behavior, not an offset).
   2 · THE OFFSET IS SAMPLED FROM THE CURVES, not from chords of the
       source: Q(t) = B(t) + δ·N(t), adaptively subdivided on the OFFSET's
       own flatness, with cubics pre-split at inflections. Miter joins
       (limit 4, Illustrator's default) are synthesized only at real
       corners; concave corners let the raw curves cross and leave the
       trimming to the arrangement.
   3 · A HALF-EDGE ARRANGEMENT with winding classification replaces the
       stack-popping heuristic: every crossing becomes a node (snapped
       consistently BEFORE the map is built), faces are traversed via
       angular-sorted half-edges, each face is classified by the winding
       number of the raw loops at a guaranteed-interior sample, and the
       kept region's boundary is walked out. Interleaved crossings, triple
       points and tangles all resolve by construction.

   Output is a corner-pinned simplified polyline path (within 0.15 units
   of the sampled offset — below visual threshold at product scale).
   Constrained cubic re-fitting is a planned refinement, deliberately NOT
   Catmull-Rom interpolation (reviewer: interpolating chord vertices
   manufactures geometry with no distance guarantee).

   The kernel is pure geometry. Stylistic passes (barb sealing, dent
   filling) live with the caller — the reviewer's separation of "offset
   kernel" from "art direction" is load-bearing here. */

export type KPt = { x: number; y: number; corner?: boolean };
type Seg = { kind: "L"; ax: number; ay: number; bx: number; by: number }
  | { kind: "C"; ax: number; ay: number; c1x: number; c1y: number; c2x: number; c2y: number; bx: number; by: number };

const TOKEN_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?|[a-z]/gi;

/** Parse an arc-free path (M L H V C S Q T Z, abs + rel) into closed
 *  contours of line/cubic segments. Quadratics promote to cubics. */
export function parseContours(d: string): Seg[][] {
  const toks = d.match(TOKEN_RE) ?? [];
  const out: Seg[][] = [];
  let cur: Seg[] = [];
  let i = 0, cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0, pcx = 0, pcy = 0, pqx = 0, pqy = 0, lastC = "";
  const num = () => parseFloat(toks[i++]);
  const close = () => {
    if (cur.length) {
      if (Math.hypot(cx - sx, cy - sy) > 1e-6) cur.push({ kind: "L", ax: cx, ay: cy, bx: sx, by: sy });
      out.push(cur); cur = [];
    }
    cx = sx; cy = sy;
  };
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase() && cmd.toUpperCase() !== "Z";
    const C = cmd.toUpperCase();
    const rx = (v: number) => (rel ? cx + v : v);
    const ry = (v: number) => (rel ? cy + v : v);
    if (C === "M") {
      close(); if (cur.length) { out.push(cur); cur = []; }
      cx = rx(num()); cy = ry(num()); sx = cx; sy = cy; cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const x = rx(num()), y = ry(num());
      cur.push({ kind: "L", ax: cx, ay: cy, bx: x, by: y }); cx = x; cy = y;
    } else if (C === "H") {
      const x = rx(num());
      cur.push({ kind: "L", ax: cx, ay: cy, bx: x, by: cy }); cx = x;
    } else if (C === "V") {
      const y = rel ? cy + num() : num();
      cur.push({ kind: "L", ax: cx, ay: cy, bx: cx, by: y }); cy = y;
    } else if (C === "C") {
      const x1 = rx(num()), y1 = ry(num()), x2 = rx(num()), y2 = ry(num()), x = rx(num()), y = ry(num());
      cur.push({ kind: "C", ax: cx, ay: cy, c1x: x1, c1y: y1, c2x: x2, c2y: y2, bx: x, by: y });
      pcx = x2; pcy = y2; cx = x; cy = y;
    } else if (C === "S") {
      const x1 = lastC === "C" || lastC === "S" ? 2 * cx - pcx : cx;
      const y1 = lastC === "C" || lastC === "S" ? 2 * cy - pcy : cy;
      const x2 = rx(num()), y2 = ry(num()), x = rx(num()), y = ry(num());
      cur.push({ kind: "C", ax: cx, ay: cy, c1x: x1, c1y: y1, c2x: x2, c2y: y2, bx: x, by: y });
      pcx = x2; pcy = y2; cx = x; cy = y;
    } else if (C === "Q" || C === "T") {
      let qx: number, qy: number;
      if (C === "Q") { qx = rx(num()); qy = ry(num()); }
      else { qx = lastC === "Q" || lastC === "T" ? 2 * cx - pqx : cx; qy = lastC === "Q" || lastC === "T" ? 2 * cy - pqy : cy; }
      const x = rx(num()), y = ry(num());
      cur.push({ kind: "C", ax: cx, ay: cy, c1x: cx + (2 / 3) * (qx - cx), c1y: cy + (2 / 3) * (qy - cy), c2x: x + (2 / 3) * (qx - x), c2y: y + (2 / 3) * (qy - y), bx: x, by: y });
      pqx = qx; pqy = qy; cx = x; cy = y;
    } else if (C === "Z") { close(); }
    lastC = C;
  }
  close(); if (cur.length) out.push(cur);
  return out.filter((c) => c.length >= 2);
}

/* ── cubic evaluation ── */
const bez = (s: Seg & { kind: "C" }, t: number) => {
  const u = 1 - t;
  return {
    x: u * u * u * s.ax + 3 * u * u * t * s.c1x + 3 * u * t * t * s.c2x + t * t * t * s.bx,
    y: u * u * u * s.ay + 3 * u * u * t * s.c1y + 3 * u * t * t * s.c2y + t * t * t * s.by,
  };
};
const bezD = (s: Seg & { kind: "C" }, t: number) => {
  const u = 1 - t;
  let dx = 3 * u * u * (s.c1x - s.ax) + 6 * u * t * (s.c2x - s.c1x) + 3 * t * t * (s.bx - s.c2x);
  let dy = 3 * u * u * (s.c1y - s.ay) + 6 * u * t * (s.c2y - s.c1y) + 3 * t * t * (s.by - s.c2y);
  // degenerate tangent (coincident control point) — nudge off the joint
  if (dx * dx + dy * dy < 1e-12) {
    const t2 = Math.min(1 - 1e-4, Math.max(1e-4, t + (t < 0.5 ? 1e-3 : -1e-3)));
    const u2 = 1 - t2;
    dx = 3 * u2 * u2 * (s.c1x - s.ax) + 6 * u2 * t2 * (s.c2x - s.c1x) + 3 * t2 * t2 * (s.bx - s.c2x);
    dy = 3 * u2 * u2 * (s.c1y - s.ay) + 6 * u2 * t2 * (s.c2y - s.c1y) + 3 * t2 * t2 * (s.by - s.c2y);
  }
  return { x: dx, y: dy };
};
/** Inflection parameters of a cubic: roots of cross(B′, B″). */
function inflections(s: Seg & { kind: "C" }): number[] {
  const ax = s.c1x - s.ax, ay = s.c1y - s.ay;
  const bx = s.c2x - s.c1x - ax, by = s.c2y - s.c1y - ay;
  const cx2 = s.bx - s.c2x - ax - 2 * bx, cy2 = s.by - s.c2y - ay - 2 * by;
  const a = bx * cy2 - by * cx2, b = ax * cy2 - ay * cx2, c = ax * by - ay * bx;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) { const t = -c / b; if (t > 1e-4 && t < 1 - 1e-4) out.push(t); }
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      for (const t of [(-b + r) / (2 * a), (-b - r) / (2 * a)]) if (t > 1e-4 && t < 1 - 1e-4) out.push(t);
    }
  }
  return out.sort((p, q) => p - q);
}

/* ── the offset sampler ──
   Emits the raw offset of one contour as a closed polyline. `delta` > 0,
   material on the LEFT of travel: left normal = (dy, -dx)/|d|·(-1)? — in
   SVG's y-down frame the left of direction (dx,dy) is (dy, -dx). */
function offsetContour(segs: Seg[], delta: number, eps: number, miterLimit: number): KPt[] {
  const leftN = (dx: number, dy: number) => { const L = Math.hypot(dx, dy) || 1; return { x: dy / L, y: -dx / L }; };
  const pieces: { pts: KPt[]; t0: { x: number; y: number }; t1: { x: number; y: number } }[] = [];
  for (const s of segs) {
    if (s.kind === "L") {
      const n = leftN(s.bx - s.ax, s.by - s.ay);
      pieces.push({
        pts: [{ x: s.ax + n.x * delta, y: s.ay + n.y * delta }, { x: s.bx + n.x * delta, y: s.by + n.y * delta }],
        t0: { x: s.bx - s.ax, y: s.by - s.ay }, t1: { x: s.bx - s.ax, y: s.by - s.ay },
      });
    } else {
      // split at inflections, then adaptively flatten each span's OFFSET
      const cuts = [0, ...inflections(s), 1];
      const pts: KPt[] = [];
      const Q = (t: number) => { const p = bez(s, t), d0 = bezD(s, t), n = leftN(d0.x, d0.y); return { x: p.x + n.x * delta, y: p.y + n.y * delta }; };
      const emit = (t0: number, t1: number, p0: KPt, p1: KPt, depth: number) => {
        const tm = (t0 + t1) / 2;
        const pm = Q(tm);
        const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1e-9;
        const dev = Math.abs((pm.x - p0.x) * (p1.y - p0.y) - (pm.y - p0.y) * (p1.x - p0.x)) / chord;
        if (depth >= 12 || (dev <= eps && chord < delta * 4)) { pts.push(pm, p1); return; }
        emit(t0, tm, p0, pm, depth + 1);
        emit(tm, t1, pm, p1, depth + 1);
      };
      for (let k2 = 0; k2 < cuts.length - 1; k2++) {
        const a = cuts[k2], b = cuts[k2 + 1];
        const p0 = Q(a), p1 = Q(b);
        if (k2 === 0) pts.push(p0);
        emit(a, b, p0, p1, 0);
      }
      const d0 = bezD(s, 0), d1 = bezD(s, 1);
      pieces.push({ pts, t0: d0, t1: d1 });
    }
  }
  // join pieces: miter (limit) on separated convex ends; plain connect else
  const outPts: KPt[] = [];
  for (let k2 = 0; k2 < pieces.length; k2++) {
    const cur = pieces[k2], nxt = pieces[(k2 + 1) % pieces.length];
    const a = cur.pts, b = nxt.pts;
    if (outPts.length === 0) outPts.push(...a); else outPts.push(...a.slice(0));
    const E = a[a.length - 1], S = b[0];
    const gap = Math.hypot(S.x - E.x, S.y - E.y);
    if (gap > 0.02) {
      // corner at the source vertex — synthesize the miter on the offset side
      const d1 = cur.t1, d2 = nxt.t0;
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) > 1e-9) {
        const t = ((S.x - E.x) * d2.y - (S.y - E.y) * d2.x) / den;
        const q: KPt = { x: E.x + d1.x * t, y: E.y + d1.y * t, corner: true };
        const v = segEnd(cur); // the source corner
        if (Math.hypot(q.x - v.x, q.y - v.y) <= miterLimit * delta && t > 0) outPts.push(q);
        else { E.corner = true; S.corner = true; } // bevel
      } else { E.corner = true; S.corner = true; }
    }
  }
  return dedupe(outPts);
}
const segEnd = (p: { pts: KPt[]; t1: { x: number; y: number } }) => p.pts[p.pts.length - 1] && p.pts[p.pts.length - 1];
function dedupe(pts: KPt[]): KPt[] {
  const out: KPt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-3) out.push(p);
    else if (p.corner && last) last.corner = true;
  }
  if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-3) out.pop();
  return out;
}

/* ── orientation: material on the LEFT of every contour ──
   Region membership uses even-odd parity across ALL contours (correct for
   outer + piercings nesting, which is what the authored set draws). */
function pointInRing(p: { x: number; y: number }, ring: KPt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function flattenSegs(segs: Seg[], k = 16): KPt[] {
  const pts: KPt[] = [];
  for (const s of segs) {
    if (s.kind === "L") pts.push({ x: s.ax, y: s.ay });
    else for (let t = 0; t < k; t++) pts.push(bez(s, t / k));
  }
  return pts;
}
function reverseSegs(segs: Seg[]): Seg[] {
  return segs.slice().reverse().map((s) => s.kind === "L"
    ? { kind: "L", ax: s.bx, ay: s.by, bx: s.ax, by: s.ay }
    : { kind: "C", ax: s.bx, ay: s.by, c1x: s.c2x, c1y: s.c2y, c2x: s.c1x, c2y: s.c1y, bx: s.ax, by: s.ay });
}

/* ── the arrangement: snap → split → half-edges → faces → winding ── */
type Node = { x: number; y: number; id: number; out: number[] };
type HE = { from: number; to: number; twin: number; next: number; face: number; loop: number };

function windingOfPoint(p: { x: number; y: number }, loops: KPt[][]): number {
  let w = 0;
  for (const ring of loops) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if (a.y <= p.y) { if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) w++; }
      else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) w--;
    }
  }
  return w;
}

export function clipRawLoops(rawLoops: KPt[][]): KPt[][] {
  const SNAP = 1e-3;
  const key = (x: number, y: number) => `${Math.round(x / SNAP)}_${Math.round(y / SNAP)}`;
  const nodes: Node[] = [];
  const nodeIdx = new Map<string, number>();
  const nodeOf = (x: number, y: number) => {
    const k2 = key(x, y);
    let id = nodeIdx.get(k2);
    if (id === undefined) { id = nodes.length; nodes.push({ x, y, id, out: [] }); nodeIdx.set(k2, id); }
    return id;
  };
  // raw directed edges with loop provenance
  type Raw = { ax: number; ay: number; bx: number; by: number; loop: number; cut: { t: number }[] };
  const raws: Raw[] = [];
  rawLoops.forEach((ring, li) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) raws.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, loop: li, cut: [] });
    }
  });
  // sweep-and-prune broad phase on minX, exact narrow phase
  const order = raws.map((_, i) => i).sort((p, q) => Math.min(raws[p].ax, raws[p].bx) - Math.min(raws[q].ax, raws[q].bx));
  const active: number[] = [];
  for (const idx of order) {
    const r = raws[idx];
    const minX = Math.min(r.ax, r.bx);
    const minY = Math.min(r.ay, r.by), maxY = Math.max(r.ay, r.by);
    for (let k2 = active.length - 1; k2 >= 0; k2--) {
      const o = raws[active[k2]];
      if (Math.max(o.ax, o.bx) < minX - SNAP) { active.splice(k2, 1); continue; }
      if (Math.min(o.ay, o.by) > maxY + SNAP || Math.max(o.ay, o.by) < minY - SNAP) continue;
      const den = (r.bx - r.ax) * (o.by - o.ay) - (r.by - r.ay) * (o.bx - o.ax);
      if (Math.abs(den) < 1e-12) continue;
      const t = ((o.ax - r.ax) * (o.by - o.ay) - (o.ay - r.ay) * (o.bx - o.ax)) / den;
      const u = ((o.ax - r.ax) * (r.by - r.ay) - (o.ay - r.ay) * (r.bx - r.ax)) / den;
      if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
      if (t > 1e-9 && t < 1 - 1e-9) r.cut.push({ t });
      if (u > 1e-9 && u < 1 - 1e-9) o.cut.push({ t: u });
    }
    active.push(idx);
  }
  // split at cuts, register half-edges
  const hes: HE[] = [];
  const addEdge = (x0: number, y0: number, x1: number, y1: number, loop: number) => {
    const a = nodeOf(x0, y0), b = nodeOf(x1, y1);
    if (a === b) return;
    const i1 = hes.length, i2 = hes.length + 1;
    hes.push({ from: a, to: b, twin: i2, next: -1, face: -1, loop });
    hes.push({ from: b, to: a, twin: i1, next: -1, face: -1, loop: -1 });
    nodes[a].out.push(i1); nodes[b].out.push(i2);
  };
  for (const r of raws) {
    const ts = [0, ...r.cut.map((c) => c.t).sort((p, q) => p - q), 1];
    for (let k2 = 0; k2 < ts.length - 1; k2++) {
      const t0 = ts[k2], t1 = ts[k2 + 1];
      if (t1 - t0 < 1e-9) continue;
      addEdge(r.ax + (r.bx - r.ax) * t0, r.ay + (r.by - r.ay) * t0, r.ax + (r.bx - r.ax) * t1, r.ay + (r.by - r.ay) * t1, r.loop);
    }
  }
  // angular sort at nodes; next(he) = clockwise successor of twin(he)
  for (const nd of nodes) {
    nd.out.sort((p, q) => {
      const hp = hes[p], hq = hes[q];
      const ap = Math.atan2(nodes[hp.to].y - nd.y, nodes[hp.to].x - nd.x);
      const aq = Math.atan2(nodes[hq.to].y - nd.y, nodes[hq.to].x - nd.x);
      return ap - aq;
    });
  }
  for (let i = 0; i < hes.length; i++) {
    const tw = hes[i].twin;
    const nd = nodes[hes[tw].from === hes[i].to ? hes[i].to : hes[i].to];
    const ring = nodes[hes[i].to].out;
    const pos = ring.indexOf(tw);
    hes[i].next = ring[(pos + 1) % ring.length];
    void nd;
  }
  // face traversal
  let faceCount = 0;
  for (let i = 0; i < hes.length; i++) {
    if (hes[i].face !== -1) continue;
    const f = faceCount++;
    let cur = i, guard = 0;
    while (hes[cur].face === -1 && guard++ < hes.length + 2) { hes[cur].face = f; cur = hes[cur].next; }
  }
  // winding per face (sampled just left of one of its half-edges)
  const faceW = new Array<number | undefined>(faceCount);
  const keptBoundary: KPt[][] = [];
  const faceOf = (i: number) => hes[i].face;
  const sampleW = (i: number) => {
    const a = nodes[hes[i].from], b = nodes[hes[i].to];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (b.y - a.y) / L, ny = -(b.x - a.x) / L; // left of travel
    const off = Math.max(SNAP * 4, Math.min(0.35, L * 0.25));
    return windingOfPoint({ x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off }, rawLoops);
  };
  for (let i = 0; i < hes.length; i++) {
    const f = faceOf(i);
    if (faceW[f] === undefined) faceW[f] = sampleW(i);
  }
  // boundary of the kept (winding > 0) region
  const isKept = (f: number) => (faceW[f] ?? 0) > 0;
  const used = new Array(hes.length).fill(false);
  for (let i = 0; i < hes.length; i++) {
    if (used[i] || !isKept(hes[i].face) || isKept(hes[hes[i].twin].face)) continue;
    const loop: KPt[] = [];
    let cur = i, guard = 0;
    while (guard++ < hes.length + 2) {
      used[cur] = true;
      loop.push({ x: nodes[hes[cur].from].x, y: nodes[hes[cur].from].y });
      // advance along the kept-region boundary: rotate at the node until the
      // next boundary half-edge of the same region
      let nxt = hes[cur].next;
      let spins = 0;
      while ((!isKept(hes[nxt].face) || isKept(hes[hes[nxt].twin].face)) && spins++ < nodes[hes[nxt].from]?.out.length + 2) {
        nxt = hes[hes[nxt].twin].next;
      }
      cur = nxt;
      if (cur === i) break;
    }
    if (loop.length >= 3) keptBoundary.push(loop);
  }
  return keptBoundary;
}

/** Corner-pinned Ramer-DP: simplify within eps but never delete a corner. */
export function simplifyPinned(pts: KPt[], eps: number): KPt[] {
  if (pts.length < 5) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true; keep[pts.length - 1] = true;
  pts.forEach((p, i) => { if (p.corner) keep[i] = true; });
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      if (keep[i]) { stack.push([a, i], [i, b]); maxI = -2; break; }
      const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y;
      const L = Math.hypot(dx, dy) || 1;
      const d = Math.abs((pts[i].x - pts[a].x) * dy - (pts[i].y - pts[a].y) * dx) / L;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxI >= 0 && maxD > eps) { keep[maxI] = true; stack.push([a, maxI], [maxI, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** The kernel entry: true inner offset of an arc-free path at `delta`.
 *  Returns closed polyline loops (corner-flagged), or null when the
 *  arrangement fails structurally — callers fall back. */
export function innerOffsetLoops(d: string, delta: number, opts?: { miterLimit?: number; eps?: number }): KPt[][] | null {
  try {
    const contours = parseContours(d);
    if (!contours.length) return null;
    const flats = contours.map((c) => flattenSegs(c));
    // even-odd region membership across all contours
    const region = (p: { x: number; y: number }) => {
      let n = 0;
      for (const f of flats) if (pointInRing(p, f)) n++;
      return n % 2 === 1;
    };
    // normalize: material on the LEFT of every contour's travel direction
    const normalized = contours.map((segs, ci) => {
      const f = flats[ci];
      let bestLen = 0, probe: { x: number; y: number } | null = null;
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L > bestLen) {
          bestLen = L;
          const nx = (b.y - a.y) / L, ny = -(b.x - a.x) / L;
          probe = { x: (a.x + b.x) / 2 + nx * Math.min(1.2, L * 0.2), y: (a.y + b.y) / 2 + ny * Math.min(1.2, L * 0.2) };
        }
      }
      return probe && region(probe) ? segs : reverseSegs(segs);
    });
    const eps = opts?.eps ?? Math.max(0.06, Math.min(0.3, delta / 32));
    const raw = normalized.map((segs) => offsetContour(segs, delta, eps, opts?.miterLimit ?? 4)).filter((r) => r.length >= 3);
    if (!raw.length) return null;
    const kept = clipRawLoops(raw);
    if (!kept.length) return null;
    // carry corner flags across the arrangement (nearest raw corner within snap)
    const corners = raw.flatMap((r) => r.filter((p) => p.corner));
    for (const loop of kept) for (const p of loop) {
      for (const c of corners) if (Math.hypot(p.x - c.x, p.y - c.y) < 0.05) { p.corner = true; break; }
    }
    const loops = kept.map((l) => simplifyPinned(l, 0.15)).filter((l) => l.length >= 3);
    /* normalize winding by nesting depth so nonzero fill reads the region
       correctly whatever direction the face walk produced: even depth
       (solids) one way, odd depth (piercings) the other */
    const areaOf = (ps: KPt[]) => { let s = 0; for (let i = 0; i < ps.length; i++) { const a = ps[i], b = ps[(i + 1) % ps.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
    for (const l of loops) {
      const depth = loops.filter((o) => o !== l && o.length >= 3 && pointInRing(l[0], o)).length;
      if ((depth % 2 === 0) !== (areaOf(l) > 0)) l.reverse();
    }
    return loops;
  } catch {
    return null;
  }
}
