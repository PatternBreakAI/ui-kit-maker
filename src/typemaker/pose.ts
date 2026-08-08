/* 3D pose for Type Maker — spin the word in space, keep the art vector.

   Each letter is a flat card in 3D: laid along the baseline (optionally
   bent onto an arc), rotated by the pose, then projected through a simple
   pinhole camera. A letter's screen placement is the exact projection of
   its center plus the projected local basis (the Jacobian), i.e. one
   affine matrix per letter. Within a letter the perspective error is
   negligible at glyph scale; across the word the letters genuinely
   converge, shrink and overlap toward the vanishing point — the Superman
   move. Far letters paint first (painter's order), so near letters cover
   them. Everything stays SVG 1.1: the export opens in Figma, Illustrator
   and browsers exactly as posed. */

export type Pose = {
  rx: number;    // pitch, degrees — top of the word tips away/toward
  ry: number;    // yaw, degrees — the Superman swing
  rz: number;    // roll, degrees
  persp: number; // 0..100 — camera pull-in (0 ≈ orthographic)
  arc: number;   // -120..120 degrees of baseline bend across the word
};

export const POSE_IDENTITY: Pose = { rx: 0, ry: 0, rz: 0, persp: 45, arc: 0 };

export function poseActive(p: Pose): boolean {
  return Math.abs(p.rx) > 0.4 || Math.abs(p.ry) > 0.4 || Math.abs(p.rz) > 0.4 || Math.abs(p.arc) > 0.4;
}

export type LetterPlacement = {
  /** SVG matrix(a b c d e f) placing the letter's local frame on screen. */
  m: [number, number, number, number, number, number];
  /** camera-space depth of the letter center — sort desc, far first */
  z: number;
  i: number;
};

type V3 = [number, number, number];

/** Place letters (advance widths in px) along the posed baseline and
 *  project each to a screen affine. `em` scales the camera geometry so a
 *  pose reads the same at any type size. */
export function projectLetters(widths: number[], gap: number, pose: Pose, em: number): LetterPlacement[] {
  const n = widths.length;
  const totalW = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, n - 1);
  const rad = (d: number) => (d * Math.PI) / 180;

  // pen-center x of each letter, word centered on 0
  const centers: number[] = [];
  let pen = -totalW / 2;
  for (let i = 0; i < n; i++) { centers.push(pen + widths[i] / 2); pen += widths[i] + gap; }

  // camera: focal length shrinks as persp grows — 0 is near-orthographic
  const f = em * (26 - 22 * Math.min(1, Math.max(0, pose.persp / 100)));

  const cx = Math.cos(rad(pose.rx)), sx = Math.sin(rad(pose.rx));
  const cy = Math.cos(rad(pose.ry)), sy = Math.sin(rad(pose.ry));
  const cz = Math.cos(rad(pose.rz)), sz = Math.sin(rad(pose.rz));
  // R = Rz · Rx · Ry applied to column vectors
  const rot = (v: V3): V3 => {
    let [X, Y, Z] = v;
    // yaw
    let x1 = X * cy + Z * sy, z1 = -X * sy + Z * cy, y1 = Y;
    // pitch
    let y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx, x2 = x1;
    // roll
    return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
  };

  const arcRad = rad(pose.arc);
  const out: LetterPlacement[] = [];
  for (let i = 0; i < n; i++) {
    // arc bend: the baseline lies on a circle whose chord is the word.
    // φ sweeps with the letter's pen position; positive arc smiles.
    let px = centers[i], py = 0, tilt = 0;
    if (Math.abs(arcRad) > 1e-4) {
      // R carries the bend's sign: positive arc arches the word (ends dip,
      // center rides high — the Superman bow), negative bows it the other way
      const R = totalW / arcRad;
      const phi = centers[i] / R;
      px = R * Math.sin(phi);
      py = R * (1 - Math.cos(phi));
      tilt = phi;
    }
    // letter local basis after arc tilt (rotation in the word plane)
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = rot([px, py, 0]);
    const EX = rot([ct, st, 0]);   // local +x
    const EY = rot([-st, ct, 0]);  // local +y
    // pinhole: screen = f * (x, y) / (f + z); Jacobian at P projects the basis
    const zc = P[2];
    const s = f / Math.max(f * 0.12, f + zc);
    const j = (v: V3): [number, number] => [
      v[0] * s - (P[0] * v[2] * s * s) / f,
      v[1] * s - (P[1] * v[2] * s * s) / f,
    ];
    const ex = j(EX), ey = j(EY);
    out.push({ m: [ex[0], ex[1], ey[0], ey[1], P[0] * s, P[1] * s], z: zc, i });
  }
  // painter's order — far letters first so near letters overlap them
  return out.sort((a, b) => b.z - a.z);
}

/** Axis-aligned screen bounds of a set of placements, given each letter's
 *  local box (the specimen canvas around its center). */
export function placementBounds(placed: LetterPlacement[], boxes: { w: number; h: number; cx: number; cy: number }[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placed) {
    const b = boxes[p.i];
    for (const [lx, ly] of [[-b.cx, -b.cy], [b.w - b.cx, -b.cy], [-b.cx, b.h - b.cy], [b.w - b.cx, b.h - b.cy]] as [number, number][]) {
      const X = p.m[0] * lx + p.m[2] * ly + p.m[4];
      const Y = p.m[1] * lx + p.m[3] * ly + p.m[5];
      if (X < x0) x0 = X; if (X > x1) x1 = X;
      if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
  }
  if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
  return { x0, y0, x1, y1 };
}
