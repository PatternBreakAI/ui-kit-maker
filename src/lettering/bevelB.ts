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

/* ── edge runs: consecutive edges facing toward/away from the key ── */

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
