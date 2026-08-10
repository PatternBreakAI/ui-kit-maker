/* SPLASH LETTERING ENGINE — the four art-direction lenses.

   Each candidate blueprint is judged by four professionals who want
   different things. Scores are DETERMINISTIC functions of measured
   geometry plus the blueprint's op record — no randomness, no string
   matching. Hard gates run first: a failed gate rejects the candidate
   outright, whatever its scores.

     Sign Painter        — rhythm, confident silhouette, swash payoff
     Type Designer       — spacing evenness, counter health, restraint
     Graffiti Writer     — interlock nerve, overlap, coverage
     Poster Illustrator  — block mass, aspect, one-shape readability

   The self-critique gate is here too: a candidate whose op record
   amounts to font/scale/tracking/tilt only is "typeset, not designed"
   and dies regardless of how pleasant it looks. */

import type { LetteringBlueprint, LensName, LensScore, Scorecard } from "./blueprint";
import { LENS_NAMES } from "./blueprint";
import { boundsOfPolys, colYs, counterStats, measuredPenetration, rowXs, strokeWidth } from "./ops";
import type { Pt } from "./ops";

/** what the director hands the lenses after realizing a candidate */
export interface RealizedCandidate {
  bp: LetteringBlueprint;
  /** authored size (px) the geometry is expressed in */
  size: number;
  /** per-glyph flattened contours, final positions */
  glyphPolys: Pt[][][];
  /** welded union contours (or all contours when not welded) */
  unionPolys: Pt[][];
  /** worst measured pair penetration in the NEUTRAL typeset, per gap —
   *  the baseline that separates font-natural touching from ours */
  neutralPenetration: number[];
  /** counter count of the neutral typeset */
  neutralCounters: number;
}

const clamp10 = (v: number): number => Math.max(0, Math.min(10, v));
const std = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
};

const OP_WEIGHT: Record<string, number> = {
  "alternate": 2, "final-form": 2, "terminal": 3, "overlap": 2,
  "interlock": 2.5, "warp": 1.5, "stagger": 1.5, "proportion": 1,
  "optical-spacing": 0.5, "column-fit": 0.5, "weld": 1,
};

export interface LensMetrics extends Record<string, number> {
  coverage: number; aspect: number; columnEvenness: number;
  rhythmEnergy: number; spacingEvenness: number; counterHealth: number;
  countersLost: number; overlapNerve: number; interlockTuck: number;
  ornamentCount: number; structureDelta: number; distortionLoad: number;
}

export function measureCandidate(rc: RealizedCandidate): LensMetrics {
  const { bp, size, glyphPolys, unionPolys } = rc;
  const b = boundsOfPolys(unionPolys);
  const w = Math.max(1, b.x2 - b.x1), h = Math.max(1, b.y2 - b.y1);
  const sw = strokeWidth(unionPolys);

  // ink coverage (mean column density) + column evenness of the union
  const colInk: number[] = [];
  for (let i = 0; i < 24; i++) {
    const x = b.x1 + ((i + 0.5) / 24) * w;
    const ys = colYs(unionPolys, x);
    let ink = 0;
    for (let k = 0; k + 1 < ys.length; k += 2) ink += ys[k + 1] - ys[k];
    colInk.push(ink / h);
  }
  const withInk = colInk.filter((c) => c > 0.01);
  const colMean = withInk.length ? withInk.reduce((a, c) => a + c, 0) / withInk.length : 0;
  const columnEvenness = colMean > 0 ? 1 / (1 + std(withInk) / colMean) : 0;

  // rhythm from the plans
  const dys = bp.glyphPlans.map((g) => g.baselineShift);
  const rots = bp.glyphPlans.map((g) => g.rotation);
  const scales = bp.glyphPlans.map((g) => (g.scaleX + g.scaleY) / 2);
  const rhythmEnergy = std(dys) * 6 + std(rots) / 6 + std(scales) * 3;

  // spacing evenness measured on final geometry (perceived pair gaps)
  const gaps: number[] = [];
  for (const line of bp.lines) {
    for (let i = 0; i + 1 < line.glyphs.length; i++) {
      const A = glyphPolys[line.glyphs[i]], B = glyphPolys[line.glyphs[i + 1]];
      if (!A?.length || !B?.length) continue;
      const ba = boundsOfPolys(A), bb = boundsOfPolys(B);
      const y1 = Math.max(ba.y1, bb.y1), y2 = Math.min(ba.y2, bb.y2);
      if (y2 - y1 < size * 0.08) continue;
      const vals: number[] = [];
      for (let k = 0; k < 16; k++) {
        const y = y1 + ((k + 0.5) / 16) * (y2 - y1);
        const xa = rowXs(A, y), xb = rowXs(B, y);
        if (xa.length && xb.length) vals.push(xb[0] - xa[xa.length - 1]);
      }
      if (vals.length >= 4) { vals.sort((a, z) => a - z); gaps.push(vals[Math.floor(vals.length * 0.25)]); }
    }
  }
  const gapMean = gaps.length ? gaps.reduce((a, g) => a + g, 0) / gaps.length : 0;
  const spacingEvenness = gaps.length >= 2 && Math.abs(gapMean) > 0.001 * size
    ? 1 / (1 + std(gaps) / Math.max(size * 0.02, Math.abs(gapMean)))
    : 0.6;

  // counters
  const cs = counterStats(unionPolys);
  const counterHealth = cs.count ? Math.min(1.5, cs.minDim / Math.max(1, sw * 0.5)) : 1;
  const countersLost = Math.max(0, rc.neutralCounters - cs.count - declaredWeldLoss(bp));

  // structure from the record
  const structureDelta = bp.ops.reduce((a, o) => a + (OP_WEIGHT[o.op] ?? 0.5), 0);
  const overlapNerve = bp.glyphPlans.reduce((a, g) => a + g.overlapPrev, 0);
  const interlockTuck = bp.lines.reduce((a, l) => a + l.tuckDy, 0) / Math.max(1, bp.lines.length - 1) / size;
  const ornamentCount = bp.glyphPlans.filter((g) => g.terminal).length;
  const distortionLoad =
    bp.lines.reduce((a, l) => a + (l.warp.kind === "none" ? 0 : Math.abs((l.warp as { k: number }).k)), 0) +
    rots.reduce((a, r) => a + Math.abs(r), 0) / 90 +
    scales.reduce((a, s) => a + Math.abs(s - 1), 0) / 2;

  return {
    coverage: colMean, aspect: w / h, columnEvenness, rhythmEnergy,
    spacingEvenness, counterHealth, countersLost, overlapNerve,
    interlockTuck, ornamentCount, structureDelta, distortionLoad,
  };
}

/** counters legitimately absorbed by DECLARED welds (an 'ee' join may
 *  merge apertures) — small allowance, one per declared overlap */
const declaredWeldLoss = (bp: LetteringBlueprint): number =>
  bp.glyphPlans.filter((g) => g.overlapPrev > 0).length + (bp.weldInk ? 2 : 0);

/* ── hard gates ──────────────────────────────────────────────────── */

export function runGates(rc: RealizedCandidate, m: LensMetrics): string[] {
  const fails: string[] = [];
  const { bp, size, glyphPolys } = rc;

  // the gate is "art-directed, not merely formatted" — a recognizable
  // source font never fails a result; DEFAULT text with no recorded
  // compositional decision does
  if (m.countersLost > 0) fails.push(`counters closed (${m.countersLost} beyond declared welds)`);
  if (m.structureDelta < 1) fails.push("formatted-only: no compositional decisions recorded");

  // undeclared collisions: penetration beyond the neutral typeset's
  let gi = 0;
  const sw = strokeWidth(rc.unionPolys);
  outer: for (const line of bp.lines) {
    for (let i = 0; i + 1 < line.glyphs.length; i++, gi++) {
      const a = line.glyphs[i], z = line.glyphs[i + 1];
      const declared = bp.glyphPlans[z]?.overlapPrev > 0 || bp.weldInk;
      if (declared) continue;
      const pen = measuredPenetration(glyphPolys[a] ?? [], glyphPolys[z] ?? []);
      const base = rc.neutralPenetration[gi] ?? 0;
      if (pen > base + 0.25 * sw) { fails.push(`undeclared collision at glyphs ${a}·${z}`); break outer; }
    }
  }

  for (const g of bp.glyphPlans) {
    if (Math.abs(g.rotation) > 20) { fails.push(`excess rotation ${g.rotation.toFixed(0)}° on '${g.char}'`); break; }
    if (g.scaleX < 0.62 || g.scaleX > 1.7 || g.scaleY < 0.62 || g.scaleY > 1.7) { fails.push(`excess proportion on '${g.char}'`); break; }
  }
  for (const l of bp.lines) {
    if (l.warp.kind !== "none" && Math.abs((l.warp as { k: number }).k) > 0.34) { fails.push("excess warp"); break; }
  }
  if (m.aspect > 9 || m.aspect < 0.12) fails.push("degenerate block aspect");
  if (bp.lines.length > 1) {
    const lh = bp.lineHeight * size;
    for (const l of bp.lines) if (l.tuckDy > 0.62 * lh) { fails.push("interlock beyond legibility"); break; }
  }
  return fails;
}

/* ── the lenses ──────────────────────────────────────────────────── */

type Scorer = (m: LensMetrics) => { score: number; notes: string[] };

const SCORERS: Record<LensName, Scorer> = {
  signPainter: (m) => {
    const notes: string[] = [];
    // owner rule: no generated ornament lines — the gesture must come
    // from the typography itself, so interlock carries the bonus
    let s = 4.2 + Math.min(2.6, m.rhythmEnergy * 2.4) + Math.min(2, m.interlockTuck * 11) + Math.min(1.4, m.overlapNerve * 1.2);
    if (m.rhythmEnergy > 0.25) notes.push("living baseline");
    if (m.interlockTuck > 0.1) notes.push("lines read as one drawn block");
    if (m.rhythmEnergy < 0.06 && m.interlockTuck < 0.04) { s -= 1.6; notes.push("stiff — reads like set type, not brush work"); }
    if (m.distortionLoad > 1.4) { s -= 1.2; notes.push("over-articulated"); }
    return { score: clamp10(s), notes };
  },
  typeDesigner: (m) => {
    const notes: string[] = [];
    let s = 3.4 + m.spacingEvenness * 3.4 + Math.min(2.2, m.counterHealth * 1.8) - Math.min(2.5, m.distortionLoad * 1.1);
    if (m.spacingEvenness > 0.72) notes.push("air between letters is even");
    else if (m.spacingEvenness < 0.5) notes.push("gap rhythm uneven");
    if (m.counterHealth >= 1) notes.push("counters healthy");
    else notes.push("apertures tightening");
    if (m.structureDelta >= 4 && m.distortionLoad < 0.9) { s += 1.2; notes.push("structural, yet disciplined"); }
    // calibrated on the CHAMPIONSHIP owner pick: compression that runs
    // the length of a word costs more counters than it earns nerve
    if (m.overlapNerve > 0.7) { s -= Math.min(2.5, (m.overlapNerve - 0.7) * 1.1); notes.push("compression beyond what the counters can afford"); }
    return { score: clamp10(s), notes };
  },
  graffitiWriter: (m) => {
    const notes: string[] = [];
    let s = 3.2 + Math.min(2.8, m.overlapNerve * 2.2) + Math.min(2.6, m.interlockTuck * 9) + Math.min(1.6, m.coverage * 2.4);
    if (m.overlapNerve > 0.5) notes.push("letters lean on each other — good nerve");
    if (m.interlockTuck > 0.12) notes.push("lines lock into the negative space");
    if (m.overlapNerve === 0 && m.interlockTuck < 0.04) { s -= 1.4; notes.push("polite spacing wastes the wall"); }
    return { score: clamp10(s), notes };
  },
  posterIllustrator: (m) => {
    const notes: string[] = [];
    const aspectFit = 1 - Math.min(1, Math.abs(m.aspect - 1.45) / 1.6);
    let s = 3.4 + aspectFit * 2.6 + m.columnEvenness * 2.4 + Math.min(1.8, m.coverage * 2.6);
    if (m.columnEvenness > 0.7) notes.push("mass reads as one shape");
    if (aspectFit > 0.7) notes.push("block proportion sits well on a poster");
    if (m.coverage < 0.3) { s -= 1; notes.push("silhouette too airy for a poster read"); }
    if (m.rhythmEnergy > 0.2) { s -= Math.min(2.2, (m.rhythmEnergy - 0.2) * 5); notes.push("ranks break formation — poster mass wants discipline"); }
    return { score: clamp10(s), notes };
  },
};

export function scoreCandidate(
  rc: RealizedCandidate,
  lensWeights: Record<LensName, number>,
): Scorecard {
  const metrics = measureCandidate(rc);
  const gateFailures = runGates(rc, metrics);
  const lenses: LensScore[] = LENS_NAMES.map((lens) => {
    const { score, notes } = SCORERS[lens](metrics);
    return { lens, score: Math.round(score * 10) / 10, notes };
  });
  const wSum = LENS_NAMES.reduce((a, l) => a + lensWeights[l], 0) || 1;
  const aggregate = Math.round(
    (lenses.reduce((a, l) => a + l.score * lensWeights[l.lens], 0) / wSum) * 10,
  ) / 10;
  return { blueprintId: rc.bp.id, lenses, aggregate: gateFailures.length ? 0 : aggregate, gateFailures, metrics };
}
