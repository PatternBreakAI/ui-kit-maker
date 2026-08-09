/* SPLASH LETTERING ENGINE — SCENE.

   Scene layers are DERIVED, never authored per word: they take the
   composed lockup's bounds + palette tokens + seed and build the stage
   around it. Phase-1 family: the comic BURST — alternating radial
   wedges centered slightly above the lockup, plus halftone dot arcs in
   two opposing corners. Deterministic (mulberry32); pure strings out;
   everything crops at the viewBox so no clipPath is needed. */

import { mulberry32 } from "./engine";
import type { Palette } from "./material";
import { tok } from "./material";

export interface BurstSpec {
  kind: "burst";
  /** wedge fill over the stage color */
  ray: string;
  /** halftone dot token */
  dot: string;
  rayCount?: number;
  rayOpacity?: number;
  dotOpacity?: number;
}

export interface Frame { x1: number; y1: number; x2: number; y2: number }

/** Background layers painted UNDER the lettering (over the stage rect). */
export function sceneBurst(spec: BurstSpec, frame: Frame, p: Palette, seed: number): string {
  const r = mulberry32(seed ^ 0x5ce9e);
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const cx = frame.x1 + w / 2;
  const cy = frame.y1 + h * 0.44; // burst origin rides a touch high
  const R = Math.hypot(w, h) * 0.75;
  const n = spec.rayCount ?? 14;
  const rayFill = tok(p, spec.ray);
  let rays = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.05;
    // wedge width breathes a little so the burst reads hand-cut
    const half = ((Math.PI * 2) / n) * (0.24 + r() * 0.1);
    const ax = cx + Math.cos(a0 - half) * R, ay = cy + Math.sin(a0 - half) * R;
    const bx = cx + Math.cos(a0 + half) * R, by = cy + Math.sin(a0 + half) * R;
    rays += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}Z" fill="${rayFill}"/>`;
  }
  const rayLayer = `<g opacity="${(spec.rayOpacity ?? 1).toFixed(2)}">${rays}</g>`;

  // halftone: a staggered dot GRID in two opposite corners, dot radius
  // decaying with distance from the corner — reads as printed shading,
  // never as strings of beads
  const dotFill = tok(p, spec.dot);
  const corners: [number, number][] = [[frame.x1, frame.y2], [frame.x2, frame.y1]];
  let dots = "";
  const reach = Math.min(w, h) * 0.52;
  const pitch = reach / 7;
  for (const [kx, ky] of corners) {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const gx = (col + (row % 2 ? 0.5 : 0)) * pitch;
        const gy = row * pitch * 0.9;
        const x = kx + (kx === frame.x1 ? gx : -gx);
        const y = ky + (ky === frame.y1 ? gy : -gy);
        const dist = Math.hypot(gx, gy);
        const fall = 1 - dist / reach;
        if (fall <= 0.05) continue;
        const dotR = pitch * 0.34 * fall * (0.92 + r() * 0.16);
        if (dotR < 1.2) continue;
        if (x < frame.x1 - dotR || x > frame.x2 + dotR || y < frame.y1 - dotR || y > frame.y2 + dotR) continue;
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${dotFill}"/>`;
      }
    }
  }
  const dotLayer = `<g opacity="${(spec.dotOpacity ?? 0.5).toFixed(2)}">${dots}</g>`;
  return rayLayer + dotLayer;
}
