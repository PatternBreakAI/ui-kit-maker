/* True extrusion geometry — the letters get actual sides.

   The morphology sweep in bevel.ts flood-fills one silhouette; these
   functions instead build REAL vector wall planes between a flattened
   front contour and the same contour translated by the extrusion vector
   V. Each boundary edge whose ink-outward normal faces along V produces
   a visible wall; consecutive same-facing edges merge into one strip
   polygon, and every strip is classified by orientation (downward-facing,
   lateral, upward-facing) so the renderer can tone the planes separately
   — the face/side separation professional display lettering is built on.

   All pure geometry: no filters, no DOM. Input polygons come from the
   outline pipeline's flattened glyph boundaries (font winding preserved,
   counters included as their own closed polygons). */

export type Pt = [number, number];
/** Orientation relative to the extrusion travel: `down` = facing nearly
 *  along V (the underside planes, darkest), `mid` = oblique planes (the
 *  PRIMARY wall tone — most of a letter's visible wall), `side` = grazing
 *  planes nearly perpendicular to V (lightest). Three visible values, so
 *  a wall turns through tones instead of jumping a binary seam. */
export type WallClass = "down" | "mid" | "side";
export interface WallGeom {
  /** strip polygons per orientation class, as SVG path data */
  down: string; mid: string; side: string;
  /** the rear silhouette (front contour translated by V) — painted under
   *  the strips it backstops anti-aliasing seams and concave gaps */
  back: string;
}

const F = (n: number) => n.toFixed(2);

/** Shoelace signed area — sign encodes screen-space winding. */
function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Ray-cast containment (+x ray) for hole parity. */
function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Every polygon's ink-outward orientation: a polygon contained in an odd
 *  number of the OTHER polygons bounds a counter (hole) — its ink-outward
 *  normal is its standalone-INWARD one. Containment by parity is robust
 *  against the differing winding conventions fonts actually ship. */
function holeFlags(polys: Pt[][], groups?: number[]): boolean[] {
  return polys.map((poly, i) => {
    if (!poly.length) return false;
    const probe = poly[0];
    let depth = 0;
    polys.forEach((other, j) => {
      // with groups, parity is judged per glyph: an overlapping NEIGHBOR
      // glyph's contour must not flip this contour into a hole (script
      // joins, tucked lockups, union badge geometry)
      if (groups && groups[j] !== groups[i]) return;
      if (j !== i && other.length >= 3 && pointInPoly(probe, other)) depth++;
    });
    return depth % 2 === 1;
  });
}

/** Ink-outward unit normal of edge i (p[i] → p[i+1]). */
function edgeNormal(poly: Pt[], i: number, cw: boolean, hole: boolean): Pt | null {
  const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
  const ex = x2 - x1, ey = y2 - y1;
  const len = Math.hypot(ex, ey);
  if (len < 1e-6) return null;
  // shoelace-positive (screen CW in y-down): standalone-outward = left of travel
  let nx = cw ? ey / len : -ey / len;
  let ny = cw ? -ex / len : ex / len;
  if (hole) { nx = -nx; ny = -ny; } // hole boundary: away-from-ink points INTO the cavity
  return [nx, ny];
}

/** Offset a polygon outward (ink-outward) by `r` using averaged vertex
 *  normals — the cheap stroke-expansion approximation that lets walls
 *  emanate from the OUTERMOST contour band instead of the bare glyph.
 *  Sharp concave self-crossings paint over themselves in the same ink,
 *  which is invisible; good enough for round-joined display lettering. */
function inflatePoly(poly: Pt[], r: number, cw: boolean, hole: boolean): Pt[] {
  // magnitude test: negative r is a real INWARD offset, not a no-op
  if (Math.abs(r) <= 0.01 || poly.length < 3) return poly;
  const n = poly.length;
  const out: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = edgeNormal(poly, (i - 1 + n) % n, cw, hole);
    const next = edgeNormal(poly, i, cw, hole);
    const a = prev ?? next, b = next ?? prev;
    if (!a || !b) { out[i] = poly[i]; continue; }
    let vx = a[0] + b[0], vy = a[1] + b[1];
    const vl = Math.hypot(vx, vy);
    if (vl < 1e-3) { vx = b[0]; vy = b[1]; } // 180° spike — fall back to one side
    else { vx /= vl; vy /= vl; }
    /* Outward (r > 0): NO miter compensation — the contour bands above
       render with round joins, so a mitered wall origin would overshoot
       the border cap at sharp corners and poke out as detached horns
       (review finding). The averaged normal undershoots instead, which
       tucks the wall's corner under the border — invisible, and safe.
       Inward (r < 0): the OPPOSITE is required — an undershot apex stays
       ahead of the properly offset sides and pokes out of the contracted
       shape as a spike, so sharp corners take the miter length (capped;
       over-deep corners are absorbed by the collapse guard). */
    let rr = r;
    if (r < 0) {
      const dot = Math.abs(vx * b[0] + vy * b[1]); // cos(v̂, edge normal)
      rr = r / Math.max(0.34, dot);
    }
    out[i] = [poly[i][0] + vx * rr, poly[i][1] + vy * rr];
  }
  return out;
}

/** Classify by how squarely the plane faces the travel direction. */
const classify = (nx: number, ny: number, ux: number, uy: number): WallClass => {
  const c = nx * ux + ny * uy;
  return c >= 0.75 ? "down" : c <= 0.35 ? "side" : "mid";
};

/** Build the wall strips for one set of boundary polygons extruded along
 *  V=(vx,vy). `inflate` grows the front contour first (ink-outward) so the
 *  body emanates from the outermost contour band, matching the renderer's
 *  construction rule. Returns path data per orientation class + back face. */
export function extrudeWalls(polys: Pt[][], vx: number, vy: number, inflate = 0, groups?: number[]): WallGeom {
  const holes = holeFlags(polys, groups);
  const out: Record<WallClass, string[]> = { down: [], mid: [], side: [] };
  const back: string[] = [];
  const vLen = Math.hypot(vx, vy) || 1;
  const ux = vx / vLen, uy = vy / vLen;

  polys.forEach((raw, pi) => {
    if (raw.length < 3) return;
    const aRaw = signedArea(raw);
    const cw = aRaw > 0;
    const hole = holes[pi];
    const poly = inflatePoly(raw, inflate, cw, hole);
    /* a counter narrower than 2×inflate has been FILLED by the band — the
       inflated boundary passes through itself and re-grows as a phantom
       with inverted or reflected winding (review finding). Detect the
       collapse by area sign flip / near-vanishing area and drop the
       contour entirely: no walls, no back subpath, exactly as if the
       counter never existed. */
    if (inflate > 0.01) {
      const aInf = signedArea(poly);
      if (Math.abs(aInf) < Math.abs(aRaw) * 0.02 || Math.sign(aInf) !== Math.sign(aRaw)) return;
    }
    const n = poly.length;

    // rear silhouette of this boundary
    back.push("M" + poly.map(([x, y]) => `${F(x + vx)} ${F(y + vy)}`).join("L") + "Z");

    /* walk edges; group consecutive visible edges of one class into a
       strip: front run p_i..p_j followed by the back run reversed */
    type Run = { klass: WallClass; pts: Pt[] };
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (let i = 0; i < n; i++) {
      const nrm = edgeNormal(poly, i, cw, hole);
      const p0 = poly[i], p1 = poly[(i + 1) % n];
      const visible = nrm ? nrm[0] * vx + nrm[1] * vy > 1e-6 : false;
      const klass = nrm && visible ? classify(nrm[0], nrm[1], ux, uy) : null;
      if (klass && cur && cur.klass === klass) {
        cur.pts.push(p1);
      } else {
        if (cur) runs.push(cur);
        cur = klass ? { klass, pts: [p0, p1] } : null;
      }
    }
    if (cur) runs.push(cur);
    /* the walk starts mid-boundary arbitrarily — if the first and last runs
       are the same class and share the seam vertex, join them */
    if (runs.length > 1) {
      const first = runs[0], last = runs[runs.length - 1];
      const lp = last.pts[last.pts.length - 1], fp = first.pts[0];
      if (first.klass === last.klass && Math.hypot(lp[0] - fp[0], lp[1] - fp[1]) < 1e-6) {
        first.pts = [...last.pts.slice(0, -1), ...first.pts];
        runs.pop();
      }
    }
    /* tone-flicker smoothing: on curves the segment normal oscillates
       around the 45° class boundary and adjacent slivers alternate tones
       like stripes. A strip shorter than ~40% of the extrusion travel
       can't read as its own plane anyway — absorb it into its longer
       contiguous neighbor (contiguity = shared seam vertex). */
    const runLen = (r: Run) => {
      let l = 0;
      for (let i = 1; i < r.pts.length; i++) l += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
      return l;
    };
    const minLen = Math.max(4, 0.4 * Math.hypot(vx, vy));
    const touches = (a: Run, b: Run) => {
      const ae = a.pts[a.pts.length - 1], bs = b.pts[0];
      return Math.hypot(ae[0] - bs[0], ae[1] - bs[1]) < 1e-6;
    };
    for (let pass = 0; pass < 3; pass++) {
      let merged = false;
      for (let i = 0; i < runs.length && runs.length > 1; i++) {
        if (runLen(runs[i]) >= minLen) continue;
        const prev = i > 0 ? runs[i - 1] : null;
        const next = i < runs.length - 1 ? runs[i + 1] : null;
        const toPrev = prev && touches(prev, runs[i]);
        const toNext = next && touches(runs[i], next);
        const pickPrev = toPrev && (!toNext || runLen(prev!) >= runLen(next!));
        if (pickPrev) { prev!.pts = [...prev!.pts, ...runs[i].pts.slice(1)]; runs.splice(i, 1); i--; merged = true; }
        else if (toNext) { next!.pts = [...runs[i].pts.slice(0, -1), ...next!.pts]; runs.splice(i, 1); i--; merged = true; }
      }
      if (!merged) break;
    }
    for (const run of runs) {
      const front = run.pts.map(([x, y]) => `${F(x)} ${F(y)}`);
      const rear = [...run.pts].reverse().map(([x, y]) => `${F(x + vx)} ${F(y + vy)}`);
      out[run.klass].push("M" + front.join("L") + "L" + rear.join("L") + "Z");
    }
  });

  return { down: out.down.join(""), mid: out.mid.join(""), side: out.side.join(""), back: back.join("") };
}

/** The inflated front silhouette itself (no extrusion) — the cast-shadow
 *  and debug consumers want the same boundary the walls grew from. */
/** One corner-cutting pass (Chaikin): straight runs stay straight,
 *  corners round — the round-join look Offset Path gives inward offsets,
 *  and it melts the tiny bowtie lobes normal-averaging leaves at
 *  crossings down to sub-pixel. */
function chaikin(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** Drop points whose removal deviates the path by less than `tol` —
 *  the corner-cut + fine sampling above earn their smoothness, this
 *  keeps them from paying for it in path bytes. */
function prune(poly: Pt[], tol: number): Pt[] {
  if (poly.length < 8) return poly;
  const out: Pt[] = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    const a = out[out.length - 1], p = poly[i], b = poly[i + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    const dev = Math.abs((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / len;
    if (dev > tol || Math.hypot(p[0] - a[0], p[1] - a[1]) > 60) out.push(p);
  }
  out.push(poly[poly.length - 1]);
  return out.length >= 3 ? out : poly;
}

export function inflateOutline(polys: Pt[][], inflate: number, groups?: number[]): string {
  const holes = holeFlags(polys, groups);
  return polys
    .map((raw, pi) => {
      if (raw.length < 3) return "";
      const aRaw = signedArea(raw);
      const attempt = (r: number): Pt[] | null => {
        const poly = inflatePoly(raw, r, aRaw > 0, holes[pi]);
        if (Math.abs(r) > 0.01) {
          const aInf = signedArea(poly);
          // collapsed contours vanish instead of re-growing as phantoms —
          // filled counters under expansion, swallowed thin strokes under
          // contraction (negative inflate = Offset Path inward)
          if (Math.abs(aInf) < Math.abs(aRaw) * 0.02 || Math.sign(aInf) !== Math.sign(aRaw)) return null;
        }
        return poly;
      };
      let poly = attempt(inflate);
      // graceful degradation for inward offsets: a feature too thin for
      // the full depth keeps a SHALLOWER offset instead of vanishing, so
      // heavy bevel weights never break the letter apart
      if (!poly && inflate < -0.01) poly = attempt(inflate * 0.6) ?? attempt(inflate * 0.35);
      if (!poly) return "";
      if (inflate < -0.01) poly = prune(chaikin(poly), 0.12);
      return "M" + poly.map(([x, y]) => `${F(x)} ${F(y)}`).join("L") + "Z";
    })
    .join("");
}
