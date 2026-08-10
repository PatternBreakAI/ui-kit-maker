/* SPLASH LETTERING ENGINE — ink welding (union of overlapping glyphs).

   Connected script and deliberately overlapped letters must read as ONE
   piece of ink: the bevel ring, keylines and depth all follow the UNION
   boundary, never the hidden seams inside joins. Until a full polygon
   Boolean kernel earns its place, this is a deterministic grid union:

     contours → per-glyph even-odd scanline fill → OR across glyphs
              → marching squares retrace → corner-cut smooth → prune

   Grid cells are ~0.3px at the authored scale (the engine compiles at
   16× master), so the retraced boundary is visually identical to a true
   union while being immune to every topological edge case. Output is
   plain polygons + path data — the same Geom shape the material
   machinery already consumes. Fully deterministic: no Date, no random. */

type Pt = [number, number];

export interface WeldResult {
  polys: Pt[][];
  /** all contours belong to one welded "glyph" */
  groups: number[];
  d: string;
}

/** even-odd scanline fill of one glyph's contours into the grid */
function fillGlyph(grid: Uint8Array, W: number, H: number, ox: number, oy: number, cell: number, contours: Pt[][]): void {
  for (let row = 0; row < H; row++) {
    const y = oy + (row + 0.5) * cell;
    const xs: number[] = [];
    for (const poly of contours) {
      for (let i = 0, n = poly.length; i < n; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
        if (y1 > y === y2 > y) continue;
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - ox) / cell - 0.5));
      const c1 = Math.min(W - 1, Math.floor((xs[k + 1] - ox) / cell - 0.5));
      for (let c = c0; c <= c1; c++) grid[row * W + c] = 1;
    }
  }
}

/** marching squares over the binary grid → directed boundary loops */
function trace(grid: Uint8Array, W: number, H: number, ox: number, oy: number, cell: number): Pt[][] {
  const g = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y * W + x];
  // directed segments per case, filled region kept on one consistent side
  const segs = new Map<number, number>(); // startKey → endKey
  const keyT = (x: number, y: number) => (y * 2) * (W * 2 + 4) + (x * 2 + 1);
  const keyR = (x: number, y: number) => (y * 2 + 1) * (W * 2 + 4) + (x * 2 + 2);
  const keyB = (x: number, y: number) => (y * 2 + 2) * (W * 2 + 4) + (x * 2 + 1);
  const keyL = (x: number, y: number) => (y * 2 + 1) * (W * 2 + 4) + (x * 2);
  const put = (a: number, b: number) => { segs.set(a, b); };
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const c = (g(x, y) << 3) | (g(x + 1, y) << 2) | (g(x + 1, y + 1) << 1) | g(x, y + 1);
      if (c === 0 || c === 15) continue;
      const T = keyT(x + 1, y + 1), R = keyR(x + 1, y + 1), B = keyB(x + 1, y + 1), L = keyL(x + 1, y + 1);
      switch (c) {
        case 1: put(L, B); break;
        case 2: put(B, R); break;
        case 3: put(L, R); break;
        case 4: put(R, T); break;
        case 5: put(L, T); put(R, B); break;
        case 6: put(B, T); break;
        case 7: put(L, T); break;
        case 8: put(T, L); break;
        case 9: put(T, B); break;
        case 10: put(T, R); put(B, L); break;
        case 11: put(T, R); break;
        case 12: put(R, L); break;
        case 13: put(R, B); break;
        case 14: put(B, L); break;
      }
    }
  }
  const stride = W * 2 + 4;
  const toPt = (k: number): Pt => {
    const ky = Math.floor(k / stride), kx = k % stride;
    return [ox + ((kx / 2) - 1) * cell + cell * 0, oy + ((ky / 2) - 1) * cell];
  };
  const loops: Pt[][] = [];
  while (segs.size) {
    const [start] = segs.keys();
    const loop: Pt[] = [];
    let k: number | undefined = start;
    let guard = 0;
    while (k !== undefined && guard++ < 4_000_000) {
      loop.push(toPt(k));
      const next: number | undefined = segs.get(k);
      segs.delete(k);
      if (next === start) break;
      k = next;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

const chaikin = (poly: Pt[]): Pt[] => {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
};

/* Curvature-aware simplification: accumulate direction change since
   the last kept vertex and keep a point once the boundary has TURNED
   enough (or a straight run exceeds maxSeg). A chord-deviation test
   against the immediate neighbor degenerates on smooth curves — the
   chord always passes next to the candidate — so turning angle is the
   honest signal. */
const prune = (poly: Pt[], maxSeg: number): Pt[] => {
  const n = poly.length;
  if (n < 8) return poly;
  const out: Pt[] = [poly[0]];
  let acc = 0;
  for (let i = 1; i < n - 1; i++) {
    const q = poly[i - 1], p = poly[i], b = poly[i + 1];
    const a1 = Math.atan2(p[1] - q[1], p[0] - q[0]);
    const a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    acc += turn;
    const last = out[out.length - 1];
    if (acc >= 0.085 || Math.hypot(p[0] - last[0], p[1] - last[1]) > maxSeg) {
      out.push(p);
      acc = 0;
    }
  }
  out.push(poly[n - 1]);
  return out.length >= 3 ? out : poly;
};

/** Weld per-glyph contours into their union. `cellHint` defaults to a
 *  resolution that is sub-half-pixel at the authored (÷16) scale.
 *  `minHoleWidth` widens the sliver-fill threshold — pass a fraction
 *  of the measured stroke width so join gaps close like inked
 *  lettering while real counters stay untouched. */
export function weld(polys: Pt[][], groups: number[], cellHint?: number, minHoleWidth?: number): WeldResult {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    if (x < x1) x1 = x; if (x > x2) x2 = x;
    if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  if (!isFinite(x1)) return { polys: [], groups: [], d: "" };
  const w = x2 - x1, h = y2 - y1;
  const cell = cellHint ?? Math.max(2, Math.min(w, h) / 480, w / 1800);
  const ox = x1 - cell * 2, oy = y1 - cell * 2;
  const W = Math.min(2200, Math.ceil((w + cell * 4) / cell));
  const H = Math.min(2200, Math.ceil((h + cell * 4) / cell));
  const grid = new Uint8Array(W * H);
  const nGlyphs = Math.max(...groups) + 1;
  for (let gi = 0; gi < nGlyphs; gi++) {
    const mine = polys.filter((_, i) => groups[i] === gi);
    if (mine.length) fillGlyph(grid, W, H, ox, oy, cell, mine);
  }
  let loops = trace(grid, W, H, ox, oy, cell)
    .map((l) => prune(chaikin(chaikin(l)), cell * 9));
  // fill sliver holes: where two letters meet above and below a join,
  // an honest union keeps a hairline gap — a letterer inks it shut.
  // Slivers are LONG and THIN (mean width ≈ 2·area/perimeter under a
  // couple of cells); genuine counters are orders of magnitude wider.
  const area = (p: Pt[]): number => {
    let a = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  };
  const per = (p: Pt[]): number => {
    let l = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
      l += Math.hypot(x2 - x1, y2 - y1);
    }
    return l;
  };
  const inLoop = (x: number, y: number, poly: Pt[]): boolean => {
    let inside = false;
    for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const holeCut = Math.max(cell * 2.2, minHoleWidth ?? 0);
  loops = loops.filter((l, i) => {
    const width = (2 * Math.abs(area(l))) / Math.max(1, per(l));
    if (width > holeCut) return true;
    let depth = 0;
    for (let j = 0; j < loops.length; j++) if (j !== i && inLoop(l[0][0], l[0][1], loops[j])) depth++;
    return depth % 2 === 0; // keep tiny OUTER islands, drop sliver holes
  });
  const d = loops
    .map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z")
    .join("");
  return { polys: loops, groups: loops.map(() => 0), d };
}
