/* SPLASH LETTERING ENGINE — the Gloss layer (Finish Stack).

   Gloss is a real editable layer, not a strength slider. Two related
   concepts, per the product model: the broad GLOSS BAND defines the
   highlighted zone; the deterministic FRAGMENT MASK breaks it into
   hand-placed-looking streaks. Phase-1 subset: band + broken modes,
   straight curvature, role scope, clip to face or plateau. All plain
   SVG 1.1 — fragments are round-capped stroked segments carrying a
   cross-band gradient, masked to their clip target. Deterministic. */

import { mulberry32 } from "./engine";
import type { Geom } from "./engine";
import type { LightRig } from "./material";
import { lightVec } from "./material";

export interface GlossLayer {
  mode: "band" | "broken";
  /** used when linkToLight is false */
  angle?: number;
  linkToLight?: boolean;
  /** 0..1 across the face along the light axis (0 = lit edge) */
  position: number;
  /** band thickness, 0..1 of the face's light-axis span */
  width: number;
  /** 0..1 of the band length (band mode; centered) */
  coverage?: number;
  /** 0..1 — 1 = crisp edge on the lit side */
  leadingHardness?: number;
  trailingHardness?: number;
  fragmentCount?: number;
  /** mean fragment length, 0..1 of total band length */
  fragmentLength?: number;
  /** mean gap, 0..1 of total band length */
  fragmentGap?: number;
  /** 0..1 seeded variation of lengths/gaps/thickness */
  fragmentVariation?: number;
  seed?: number;
  color: string;
  opacity: number;
  clipTo: "face" | "plateau";
}

/** Render one gloss layer over a role's geometry. `masks` supplies the
 *  mask ids for the clip targets (face = white glyph; plateau = the
 *  shared plateau mask from the material). */
export function renderGloss(
  geom: Geom,
  layer: GlossLayer,
  rig: LightRig,
  masks: { face: string; plateau?: string },
  ns: string,
  defs: string[],
  li: number,
): string {
  const ang = layer.linkToLight === false ? (layer.angle ?? 60) : rig.key.angle;
  const [lx, ly] = lightVec(ang);          // toward the light
  const ux = -ly, uy = lx;                 // band tangent
  const cx = (geom.x1 + geom.x2) / 2, cy = (geom.y1 + geom.y2) / 2;
  const rx = (geom.x2 - geom.x1) / 2, ry = (geom.y2 - geom.y1) / 2;
  const extL = Math.abs(lx) * rx + Math.abs(ly) * ry;   // light-axis extent
  const extU = Math.abs(ux) * rx + Math.abs(uy) * ry;   // tangent extent
  // band center: position along lit→shade
  const bx = cx + lx * extL - lx * (2 * extL) * layer.position;
  const by = cy + ly * extL - ly * (2 * extL) * layer.position;
  const th = Math.max(2, layer.width * 2 * extL);
  const totalLen = 2 * extU;

  // cross-band gradient: transparent → color → transparent, edge ramps
  // shaped by leading/trailing hardness (leading = lit side)
  const lead = Math.min(1, Math.max(0, layer.leadingHardness ?? 0.8));
  const trail = Math.min(1, Math.max(0, layer.trailingHardness ?? 0.5));
  const gid = `${ns}gl${li}`;
  const e0 = 0.5 * (1 - lead);
  const e1 = 0.5 * (1 - trail);
  defs.push(
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${(bx + lx * th / 2).toFixed(1)}" y1="${(by + ly * th / 2).toFixed(1)}" x2="${(bx - lx * th / 2).toFixed(1)}" y2="${(by - ly * th / 2).toFixed(1)}">` +
    `<stop offset="0" stop-color="${layer.color}" stop-opacity="${lead >= 0.999 ? 1 : 0}"/>` +
    (lead < 0.999 ? `<stop offset="${e0.toFixed(3)}" stop-color="${layer.color}" stop-opacity="1"/>` : "") +
    (trail < 0.999 ? `<stop offset="${(1 - e1).toFixed(3)}" stop-color="${layer.color}" stop-opacity="1"/>` : "") +
    `<stop offset="1" stop-color="${layer.color}" stop-opacity="${trail >= 0.999 ? 1 : 0}"/>` +
    `</linearGradient>`,
  );

  // fragments along the tangent
  const segs: [number, number, number][] = []; // [t0, t1, thicknessK]
  if (layer.mode === "band") {
    const cov = Math.min(1, Math.max(0.05, layer.coverage ?? 1));
    segs.push([-cov / 2, cov / 2, 1]);
  } else {
    const r = mulberry32((layer.seed ?? 7) ^ 0x910b);
    const count = Math.max(1, layer.fragmentCount ?? 5);
    const fl = layer.fragmentLength ?? 0.12;
    const fg = layer.fragmentGap ?? 0.06;
    const fv = layer.fragmentVariation ?? 0.4;
    let t = -0.5 + fg * (0.5 + r() * fv);
    for (let i = 0; i < count && t < 0.5; i++) {
      const len = fl * (1 + (r() * 2 - 1) * fv);
      const t1 = Math.min(0.5, t + len);
      segs.push([t, t1, 0.6 + r() * 0.5]);
      t = t1 + fg * (1 + (r() * 2 - 1) * fv);
    }
  }

  let body = "";
  for (const [t0, t1, tk] of segs) {
    const ax = bx + ux * t0 * totalLen, ay = by + uy * t0 * totalLen;
    const ex = bx + ux * t1 * totalLen, ey = by + uy * t1 * totalLen;
    body += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="url(#${gid})" stroke-width="${(th * tk).toFixed(1)}" stroke-linecap="round"/>`;
  }
  const maskId = layer.clipTo === "plateau" && masks.plateau ? masks.plateau : masks.face;
  return `<g mask="url(#${maskId})" opacity="${layer.opacity.toFixed(2)}">${body}</g>`;
}
