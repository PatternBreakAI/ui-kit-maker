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

const prune = (poly: Pt[], tol: number): Pt[] => {
  if (poly.length < 8) return poly;
  const out: Pt[] = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    const a = out[out.length - 1], p = poly[i], b = poly[i + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    const dev = Math.abs((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / len;
    if (dev > tol || Math.hypot(p[0] - a[0], p[1] - a[1]) > 40) out.push(p);
  }
  out.push(poly[poly.length - 1]);
  return out.length >= 3 ? out : poly;
};

/** Weld per-glyph contours into their union. `cellHint` defaults to a
 *  resolution that is sub-half-pixel at the authored (÷16) scale. */
export function weld(polys: Pt[][], groups: number[], cellHint?: number): WeldResult {
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
  const loops = trace(grid, W, H, ox, oy, cell)
    .map((l) => prune(chaikin(chaikin(l)), cell * 0.22));
  const d = loops
    .map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z")
    .join("");
  return { polys: loops, groups: loops.map(() => 0), d };
}
