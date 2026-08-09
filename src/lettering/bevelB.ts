/* EXPERIMENTAL — Model B: the shared-stroke bevel (Bevel Lab).

   The outside review's verdict on the crescent-sandwich bevel: several
   independently contracted, shifted, clipped silhouettes can never
   reliably agree at sharp tips. Model B replaces them with ONE rule:

     ONE GLYPH SILHOUETTE → ONE SHARED BEVEL DOMAIN → PAINT OVERLAYS

   Construction (all plain SVG 1.1):
   - The original glyph path is NEVER modified — it is both the clip
     and the sole source of every band.
   - The bevel ring is a CENTERED STROKE of width 2×bevelWidth on the
     original path, clipped to the glyph silhouette (the clip keeps the
     stroke's inner half). Same path, same joins, same apex, same
     counters for every band.
   - A complete midtone base ring paints first, so there can never be a
     hole; light- and shade-facing overlays paint INSIDE it as stroked
     edge-runs (edge-normal classification reused from the extrusion
     thinking — but only as LIGHTING, never as boundary geometry).
   - The plateau is a luminance MASK: white glyph minus the same black
     centered stroke (masks honor stroke paint; clipPaths don't).
     Diffuse face and specular are masked by it — the specular can
     never cross the plateau boundary by construction.
   - At thin features the ring closes over the plateau and the feature
     is all bevel; the outer silhouette stays byte-identical.
   - Round joins for candy. No dropped vertices, no reduced-depth
     retries, no Chaikin repair, no independent inset clips. */

import type { Geom, IROp, Frame } from "./engine";
import { emitPassMajor } from "./engine";
import type { MaterialRecipe, Palette, LightRig } from "./material";
import { resolveDiffuse, tok, mix, lighten, darken, lightVec } from "./material";

type Pt = [number, number];

/* ── local winding/parity (same rules as the extrusion module) ───── */

const signedArea = (poly: Pt[]): number => {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

const pointInPoly = (pt: Pt, poly: Pt[]): boolean => {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const holeFlags = (polys: Pt[][], groups: number[]): boolean[] =>
  polys.map((poly, i) => {
    if (!poly.length) return false;
    let depth = 0;
    polys.forEach((other, j) => {
      if (groups[j] !== groups[i]) return;
      if (j !== i && other.length >= 3 && pointInPoly(poly[0], other)) depth++;
    });
    return depth % 2 === 1;
  });

/* ── edge runs ──────────────────────────────────────────────────── */

export interface EdgeRun {
  /** open polyline along the boundary */
  d: string;
  /** mean ink-outward normal */
  nx: number; ny: number;
  /** cosine response vs the key light */
  dot: number;
  /** a representative boundary point (run midpoint) */
  mx: number; my: number;
}

/** Partition every contour into runs of consecutive edges whose outward
 *  normals share a directional BIN (default 12 bins = 30° each), with a
 *  one-edge overlap so neighboring runs blend on the base ring. Edge
 *  geometry feeds PAINT only — never visible boundaries. */
export function binnedRuns(geom: Geom, bins = 12): EdgeRun[] {
  const holes = holeFlags(geom.polys, geom.groups);
  const out: EdgeRun[] = [];
  geom.polys.forEach((poly, pi) => {
    const n = poly.length;
    if (n < 3) return;
    const cw = signedArea(poly) > 0;
    const nrm: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
      const ex = x2 - x1, ey = y2 - y1;
      const len = Math.hypot(ex, ey) || 1;
      let nx = cw ? ey / len : -ey / len;
      let ny = cw ? -ex / len : ex / len;
      if (holes[pi]) { nx = -nx; ny = -ny; }
      nrm.push([nx, ny]);
    }
    const binOf = (i: number) => Math.floor(((Math.atan2(nrm[i][1], nrm[i][0]) + Math.PI) / (2 * Math.PI)) * bins) % bins;
    // find a bin boundary to start at so runs don't split across the seam
    let start = 0;
    for (let i = 0; i < n; i++) if (binOf(i) !== binOf((i - 1 + n) % n)) { start = i; break; }
    let i = start, guard = 0;
    while (guard < n) {
      const b = binOf(i);
      let j = i;
      const idx: number[] = [];
      while (guard < n && binOf(j) === b) { idx.push(j); j = (j + 1) % n; guard++; }
      // one-edge overlap each side
      const ext = [(idx[0] - 1 + n) % n, ...idx, j];
      const pts = ext.map((k) => poly[k % n]);
      pts.push(poly[(ext[ext.length - 1] + 1) % n]);
      let sx = 0, sy = 0;
      for (const k of idx) { sx += nrm[k][0]; sy += nrm[k][1]; }
      const sl = Math.hypot(sx, sy) || 1;
      const mid = poly[idx[Math.floor(idx.length / 2)]];
      out.push({
        d: "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L"),
        nx: sx / sl, ny: sy / sl, dot: 0, mx: mid[0], my: mid[1],
      });
      i = j;
    }
  });
  return out;
}

function edgeRuns(geom: Geom, lx: number, ly: number, thresh: number): { lit: string[]; shade: string[] } {
  const holes = holeFlags(geom.polys, geom.groups);
  const lit: string[] = [], shade: string[] = [];
  geom.polys.forEach((poly, pi) => {
    const n = poly.length;
    if (n < 3) return;
    const cw = signedArea(poly) > 0;
    const cls: number[] = []; // 1 lit, -1 shade, 0 neutral per edge
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
      const ex = x2 - x1, ey = y2 - y1;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) { cls.push(0); continue; }
      let nx = cw ? ey / len : -ey / len;
      let ny = cw ? -ex / len : ex / len;
      if (holes[pi]) { nx = -nx; ny = -ny; }
      const d = nx * lx + ny * ly;
      cls.push(d >= thresh ? 1 : d <= -thresh ? -1 : 0);
    }
    // group consecutive same-class edges into open polylines
    for (const want of [1, -1] as const) {
      let i = 0;
      while (i < n) {
        if (cls[i] !== want) { i++; continue; }
        let j = i;
        while (j < n && cls[j] === want) j++;
        const pts: Pt[] = [];
        for (let k = i; k <= j; k++) pts.push(poly[k % n]);
        const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
        (want === 1 ? lit : shade).push(d);
        i = j;
      }
    }
  });
  return { lit, shade };
}

/* ── the renderer ───────────────────────────────────────────────── */

export interface BevelBView {
  ringOnly?: boolean;
  plateauOnly?: boolean;
}

/** Model B face markup for one role. `ringWidth` is the full inward
 *  extent of the edge zone (rim + bevel of the reference material), in
 *  the same (master-scaled) space as `geom`. */
export function renderBevelB(
  geom: Geom,
  m: MaterialRecipe,
  p: Palette,
  rig: LightRig,
  ringWidth: number,
  ns: string,
  defs: string[],
  frame: Frame,
  view: BevelBView = {},
): string {
  const W2 = (ringWidth * 2).toFixed(1);
  const [lx, ly] = lightVec(rig.key.angle);
  const con = (m.bevel?.contrast ?? 0.35) * (0.6 + 0.4 * rig.key.intensity);
  const litTok = tok(p, m.diffuse.stops[0].tok);
  const shadeTok = tok(p, m.diffuse.stops[m.diffuse.stops.length - 1].tok);
  const ringBase = mix(tok(p, m.diffuse.stops[Math.min(1, m.diffuse.stops.length - 1)].tok), darken(shadeTok, con * 0.5), 0.4);
  const ringLit = lighten(mix(litTok, rig.key.color, 0.18), con * 0.55);
  const ringShade = darken(shadeTok, con * 0.6);

  const clipId = `${ns}bGc`, maskId = `${ns}bPm`;
  defs.push(`<clipPath id="${clipId}"><path d="${geom.d}"/></clipPath>`);
  defs.push(
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${(geom.x1 - 40).toFixed(0)}" y="${(geom.y1 - 40).toFixed(0)}" width="${(geom.x2 - geom.x1 + 80).toFixed(0)}" height="${(geom.y2 - geom.y1 + 80).toFixed(0)}">` +
    `<path d="${geom.d}" fill="#FFF"/>` +
    `<path d="${geom.d}" fill="none" stroke="#000" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</mask>`,
  );

  /* ring: base + directional overlays, all centered strokes on the one
     original path, clipped to the one silhouette */
  const runs = edgeRuns(geom, lx, ly, 0.35);
  const soft = m.bevel?.profile === "soft" || m.bevel?.profile === "rounded"
    ? Math.max(1, ringWidth * 0.1 * (0.5 + rig.key.softness)) : 0;
  let blurOpen = "", blurClose = "";
  if (soft) {
    const fid = `${ns}bBf`;
    const pad = ringWidth + soft * 4 + 20;
    defs.push(`<filter id="${fid}" filterUnits="userSpaceOnUse" x="${(geom.x1 - pad).toFixed(0)}" y="${(geom.y1 - pad).toFixed(0)}" width="${(geom.x2 - geom.x1 + pad * 2).toFixed(0)}" height="${(geom.y2 - geom.y1 + pad * 2).toFixed(0)}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${soft.toFixed(1)}"/></filter>`);
    blurOpen = `<g filter="url(#${fid})">`; blurClose = `</g>`;
  }
  const stroke = (ds: string[], paint: string, w: number, op: number): string =>
    ds.length
      ? `<g opacity="${op.toFixed(2)}">` + ds.map((d) => `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${w.toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`).join("") + `</g>`
      : "";
  const ring =
    `<g clip-path="url(#${clipId})">` +
    `<path d="${geom.d}" fill="none" stroke="${ringBase}" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round"/>` +
    blurOpen +
    stroke(runs.lit, ringLit, ringWidth * 2, 0.92) +           // broad light-facing response
    stroke(runs.shade, ringShade, ringWidth * 1.1, 0.85) +     // narrow opposing shade
    blurClose +
    `</g>`;

  /* plateau: diffuse + specular through the ONE plateau mask */
  const diffuse = resolveDiffuse(m.diffuse, p, rig);
  const ops: IROp[] = [{ paint: diffuse, pass: "face", mask: maskId }];
  if (m.specular && m.specular.strength > 0.01) {
    const sp = m.specular;
    const rough = m.roughness ?? 0;
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
      pass: "highlight", mask: maskId,
    });
  }
  const plateau = emitPassMajor([{ geom, idp: `${ns}bB`, ops }], null, defs, false, frame);

  /* face underpainting first: even if every overlay failed, the glyph
     would still be a solid readable letter */
  const under = `<path d="${geom.d}" fill="${ringBase}"/>`;

  if (view.ringOnly) return under + ring;
  if (view.plateauOnly) return plateau;
  return under + ring + plateau;
}

/* ── MODEL B2 — profiled shared-domain bevel ────────────────────── */

/* The reviewer's correction to Model B's paint: the ring is not a flat
   band with blurred light laid over it — it is a SURFACE with a
   cross-sectional profile. Every boundary run gets a gradient ACROSS
   the bevel width, aligned to its own inward normal: the edge tone
   (from the continuous cosine response against the key light) lives at
   the OUTER edge and fades to TRANSPARENT at the inner edge, blending
   into the plateau. The face gradient underpaints the whole glyph, so
   there is no plateau seam and no continuous dark boundary — the
   strongest transitions sit at the outer edge, which is what makes the
   face read RAISED. */

export interface B2Options {
  /** requested ring width (master space) — the optical limiter may
   *  reduce it for the whole role */
  widthReq: number;
  profile: "rounded" | "hard";
  /** "directional" = B2 profiled runs; "blurred" = Model B's original
   *  overlay treatment (kept as the lab control) */
  shading: "directional" | "blurred";
  /** cool bounce: never a full circumference — shadow-facing runs only */
  bounce: "off" | "shadow";
  bounceTok?: string;
  /** one selective role-space gloss band instead of per-glyph repeats */
  glossSelective?: boolean;
  bins?: number;
}

export interface B2View extends BevelBView { orientationMap?: boolean }

/** Optical width limiter: the largest candidate width that keeps the
 *  plateau dominant. Areas are estimated analytically per glyph
 *  (A − P·W), which is conservative and costs nothing. */
export function opticalWidth(geom: Geom, widthReq: number): number {
  const holes = holeFlags(geom.polys, geom.groups);
  const perGlyph = new Map<number, { a: number; p: number }>();
  geom.polys.forEach((poly, i) => {
    const g = geom.groups[i];
    const e = perGlyph.get(g) ?? { a: 0, p: 0 };
    e.a += Math.abs(signedArea(poly)) * (holes[i] ? -1 : 1);
    let per = 0;
    for (let k = 0, n = poly.length; k < n; k++) {
      const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % n];
      per += Math.hypot(x2 - x1, y2 - y1);
    }
    e.p += per;
    perGlyph.set(g, e);
  });
  const glyphs = [...perGlyph.values()].filter((e) => e.a > 1);
  if (!glyphs.length) return widthReq;
  const median = [...glyphs].sort((x, y) => x.a - y.a)[Math.floor(glyphs.length / 2)].a;
  // plateau ≈ A − P·W + πW² (the corner term matters on rounded faces)
  const plateauOf = (e: { a: number; p: number }, w: number) => Math.max(0, e.a - e.p * w + Math.PI * w * w);
  for (const k of [1, 0.85, 0.7, 0.55, 0.4]) {
    const w = widthReq * k;
    const tot = glyphs.reduce((s, e) => s + e.a, 0);
    const plat = glyphs.reduce((s, e) => s + plateauOf(e, w), 0);
    const principalsOk = glyphs.every((e) => e.a < median * 0.3 || plateauOf(e, w) >= e.a * 0.5);
    if (plat >= tot * 0.7 && principalsOk) return w;
  }
  return widthReq * 0.4;
}

export function renderBevelB2(
  geom: Geom,
  m: MaterialRecipe,
  p: Palette,
  rig: LightRig,
  o: B2Options,
  ns: string,
  defs: string[],
  frame: Frame,
  view: B2View = {},
): { body: string; width: number } {
  const W = opticalWidth(geom, o.widthReq);
  if (o.shading === "blurred") {
    return { body: renderBevelB(geom, m, p, rig, W, ns, defs, frame, view), width: W };
  }
  const W2 = (W * 2).toFixed(1);
  const [lx, ly] = lightVec(rig.key.angle);
  const con = (m.bevel?.contrast ?? 0.35) * (0.6 + 0.4 * rig.key.intensity);
  const stops = m.diffuse.stops;
  const litTok = tok(p, stops[0].tok);
  const midTok = tok(p, stops[Math.min(1, stops.length - 1)].tok);
  const shadeTok = tok(p, stops[stops.length - 1].tok);
  const ringLit = lighten(mix(litTok, rig.key.color, 0.18), con * 0.6);
  const ringShade = darken(shadeTok, con * 0.65);

  const clipId = `${ns}cGc`, maskId = `${ns}cPm`;
  defs.push(`<clipPath id="${clipId}"><path d="${geom.d}"/></clipPath>`);
  defs.push(
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${(geom.x1 - 40).toFixed(0)}" y="${(geom.y1 - 40).toFixed(0)}" width="${(geom.x2 - geom.x1 + 80).toFixed(0)}" height="${(geom.y2 - geom.y1 + 80).toFixed(0)}">` +
    `<path d="${geom.d}" fill="#FFF"/>` +
    `<path d="${geom.d}" fill="none" stroke="#000" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</mask>`,
  );

  const runs = binnedRuns(geom, o.bins ?? 12);
  runs.forEach((r) => { r.dot = r.nx * lx + r.ny * ly; });

  /* orientation map: each run painted by pure directional hue */
  if (view.orientationMap) {
    const WHEEL = ["#E6194B", "#F58231", "#FFE119", "#BFEF45", "#3CB44B", "#42D4F4", "#4363D8", "#911EB4", "#F032E6", "#A9A9A9", "#800000", "#000075"];
    const body =
      `<path d="${geom.d}" fill="#EEE"/>` +
      `<g clip-path="url(#${clipId})">` +
      runs.map((r) => {
        const bin = Math.floor(((Math.atan2(r.ny, r.nx) + Math.PI) / (2 * Math.PI)) * (o.bins ?? 12)) % (o.bins ?? 12);
        return `<path d="${r.d}" fill="none" stroke="${WHEEL[bin % WHEEL.length]}" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }).join("") +
      `</g>`;
    return { body, width: W };
  }

  /* underpaint: the face diffuse across the WHOLE glyph — the plateau
     needs no separate paint and no seam can exist */
  const diffuse = resolveDiffuse(m.diffuse, p, rig);
  const underOps: IROp[] = [{ paint: diffuse, pass: "face" }];
  const under = emitPassMajor([{ geom, idp: `${ns}c`, ops: underOps }], null, defs, false, frame);

  /* base ring: face midtone at low opacity — unifies the zone, never a
     dark outline, guarantees continuity under the runs */
  let ring = `<path d="${geom.d}" fill="none" stroke="${midTok}" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round" opacity="0.3"/>`;

  /* profiled runs: gradient across the bevel width along each run's own
     inward normal; outer edge carries the cosine tone, inner edge is
     transparent into the plateau */
  runs.forEach((r, ri) => {
    const d = r.dot;
    let tone: string, alpha: number;
    if (d >= 0.1) { tone = mix(midTok, ringLit, Math.min(1, d)); alpha = 0.4 + 0.5 * Math.min(1, d); }
    else if (d <= -0.1) { tone = mix(midTok, ringShade, Math.min(1, -d)); alpha = 0.35 + 0.5 * Math.min(1, -d); }
    else { tone = midTok; alpha = 0.16; }
    const gid = `${ns}r${ri}`;
    const x2 = r.mx - r.nx * W, y2 = r.my - r.ny * W;
    const prof = o.profile === "hard"
      ? `<stop offset="0" stop-color="${tone}" stop-opacity="${alpha.toFixed(2)}"/><stop offset="0.62" stop-color="${tone}" stop-opacity="${(alpha * 0.85).toFixed(2)}"/><stop offset="0.8" stop-color="${tone}" stop-opacity="0"/>`
      : `<stop offset="0" stop-color="${tone}" stop-opacity="${alpha.toFixed(2)}"/><stop offset="0.5" stop-color="${tone}" stop-opacity="${(alpha * 0.45).toFixed(2)}"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/>`;
    defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${r.mx.toFixed(1)}" y1="${r.my.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}">${prof}</linearGradient>`);
    ring += `<path d="${r.d}" fill="none" stroke="url(#${gid})" stroke-width="${W2}" stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  /* cool bounce: shadow-facing runs only, narrow, faint */
  if (o.bounce === "shadow" && o.bounceTok) {
    const bc = tok(p, o.bounceTok);
    runs.filter((r) => r.dot <= -0.5).forEach((r) => {
      ring += `<path d="${r.d}" fill="none" stroke="${bc}" stroke-width="${(W * 0.4).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.13"/>`;
    });
  }
  ring = `<g clip-path="url(#${clipId})">${ring}</g>`;

  /* gloss: ONE selective hard band in role space, clipped to the
     plateau — not a mechanical per-glyph repeat */
  let gloss = "";
  if (m.specular && m.specular.strength > 0.01) {
    const sp = m.specular;
    const s = Math.min(1, sp.strength * (0.55 + 0.45 * rig.key.intensity) * (o.glossSelective ? 1.15 : 1));
    const c = mix(tok(p, sp.tok), rig.key.color, 0.25);
    const bal = o.glossSelective ? Math.max(sp.width / 2, 0.24) : Math.max(sp.width / 2, sp.balance);
    const b0 = Math.max(0, bal - sp.width / 2), b1 = Math.min(1, bal + sp.width / 2);
    const ops: IROp[] = [{
      paint: {
        type: "linear", angle: rig.key.angle,
        space: o.glossSelective ? "role" : (sp.space ?? "glyph"),
        stops: [
          { color: c, position: Math.max(0, b0 - 0.02), opacity: 0 },
          { color: c, position: b0, opacity: s },
          { color: c, position: b1, opacity: s },
          { color: c, position: Math.min(1, b1 + 0.02), opacity: 0 },
        ],
      },
      pass: "highlight", mask: maskId,
    }];
    gloss = emitPassMajor([{ geom, idp: `${ns}cg`, ops }], null, defs, false, frame);
  }

  if (view.ringOnly) return { body: `<path d="${geom.d}" fill="${midTok}"/>` + ring, width: W };
  if (view.plateauOnly) return { body: `<g mask="url(#${maskId})">${under}</g>`, width: W };
  return { body: under + ring + gloss, width: W };
}
