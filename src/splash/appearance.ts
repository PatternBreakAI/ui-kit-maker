/* EXPERIMENTAL — the Appearance Stack (not wired to any production UI).

   The Illustrator-workflow model from the art-direction research: a
   style is an ordered array of appearance entries, each an independent
   re-decoration of the SAME line geometry — exactly the Appearance
   panel's multiple-fills discipline. Four operations only, mirroring
   what the tutorial workflows actually use:

     EXPAND/CONTRACT   Offset Path. Positive grows the silhouette via a
                       round-join same-paint stroke (a true parallel
                       offset visually); negative shrinks via a REAL
                       inward offset of the flattened boundary
                       (extrude.ts), with collapsed features dropping
                       out the way Offset Path drops them.
     PAINT             solid or vertical two-stop gradient.
     TRANSFORM         independent x/y translation.
     REPEAT TRANSFORM  N copies at step x/y — the "Transform effect,
                       20 copies, 1px down-right" move that builds the
                       colored depth strata in every retro tutorial.

   Entries paint in array order (bottom → top). No physics, no lighting,
   no shared solid: layers relate graphically, not physically — that is
   the point of the experiment. */

import type { OutlineLine } from "./outline";
import { inflateOutline } from "@/generator/extrude";

export type AppearancePaint = string | { from: string; to: string };

export interface AppearanceEntry {
  /** px offset-path amount: >0 expand, <0 contract, 0/absent = as-is */
  expand?: number;
  paint: AppearancePaint;
  /** base translation */
  dx?: number;
  dy?: number;
  /** repeated Transform: `count` extra copies at cumulative steps */
  repeat?: { count: number; stepX: number; stepY: number };
  opacity?: number;
  /** soft blur — meant for a final cast-shadow entry only */
  blur?: number;
}

/** Render one line's appearance stack. `idp` seeds deterministic def ids;
 *  defs collect gradients/filters for the caller's <defs>. */
export function renderAppearanceLine(line: OutlineLine, stack: AppearanceEntry[], defs: string[], idp: string): string {
  if (!line.d) return "";
  const xs = line.glyphs.length ? line.glyphs : [{ x1: 0, x2: 100 } as { x1: number; x2: number }];
  const lx1 = Math.min(...xs.map((g) => g.x1)), lx2 = Math.max(...xs.map((g) => g.x2));
  const parts: string[] = [];
  stack.forEach((e, ei) => {
    const ex = e.expand ?? 0;
    let fillRef: string;
    if (typeof e.paint === "string") {
      fillRef = e.paint;
    } else {
      const gid = `${idp}g${ei}`;
      defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${line.gy1.toFixed(1)}" x2="0" y2="${line.gy2.toFixed(1)}"><stop offset="0" stop-color="${e.paint.from}"/><stop offset="1" stop-color="${e.paint.to}"/></linearGradient>`);
      fillRef = `url(#${gid})`;
    }
    let node: string;
    if (ex < -0.01) {
      node = `<path d="${inflateOutline(line.polys as [number, number][][], ex)}" fill="${fillRef}"/>`;
    } else if (ex > 0.01) {
      node = `<path d="${line.d}" fill="${fillRef}" stroke="${fillRef}" stroke-width="${(ex * 2).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    } else {
      node = `<path d="${line.d}" fill="${fillRef}"/>`;
    }
    const baseDx = e.dx ?? 0, baseDy = e.dy ?? 0;
    const em: string[] = [];
    const rep = e.repeat;
    if (rep?.count) {
      // farthest copy first so nearer strata paint over it
      for (let k = rep.count; k >= 1; k--) {
        em.push(`<g transform="translate(${(baseDx + k * rep.stepX).toFixed(2)} ${(baseDy + k * rep.stepY).toFixed(2)})">${node}</g>`);
      }
    }
    em.push(baseDx || baseDy ? `<g transform="translate(${baseDx.toFixed(2)} ${baseDy.toFixed(2)})">${node}</g>` : node);
    let out = em.join("");
    if (e.blur && e.blur > 0.05) {
      const fid = `${idp}b${ei}`;
      const travX = baseDx + (rep ? rep.count * rep.stepX : 0), travY = baseDy + (rep ? rep.count * rep.stepY : 0);
      const pad = ex + Math.abs(travX) + Math.abs(travY) + e.blur * 4 + 20;
      defs.push(`<filter id="${fid}" filterUnits="userSpaceOnUse" x="${(lx1 - pad).toFixed(0)}" y="${(line.gy1 - pad).toFixed(0)}" width="${(lx2 - lx1 + pad * 2).toFixed(0)}" height="${(line.gy2 - line.gy1 + pad * 2).toFixed(0)}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${e.blur.toFixed(1)}"/></filter>`);
      out = `<g filter="url(#${fid})">${out}</g>`;
    }
    if (e.opacity !== undefined && e.opacity < 1) out = `<g opacity="${e.opacity.toFixed(2)}">${out}</g>`;
    parts.push(out);
  });
  return parts.join("");
}
