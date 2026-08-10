/* SPLASH LETTERING ENGINE — the Lettering Director (sketch phase).

   Before any material exists, the director designs STRUCTURE: it
   generates 8–12 cheap, geometry-only, black-silhouette candidates
   for a phrase from a treatment grammar and a seed, realizes each one
   through the measured construction ops, and hands them to the four
   lenses. Everything here is reusable grammar machinery — no branch
   anywhere keys on a literal phrase.

   Determinism: candidates are a pure function of
   (text, grammar, seed, count). No Date, no Math.random. */

import type { Font, Glyph } from "opentype.js";
import { cmdToD, mapCmds, toGlyphs } from "@/splash/outline";
import type { Cmd } from "@/splash/outline";
import { mulberry32 } from "./engine";
import { inspectFeatures } from "./otfeatures";
import type { FeatureInventory } from "./otfeatures";
import {
  boundsOfPolys, buildTerminal, colYs, counterStats,
  flatContours, measuredPenetration, opticalSpacing, rigidWarpMoves,
  solveInterlock, solveOverlap, strokeWidth,
} from "./ops";
import type { Pt } from "./ops";
import { weld } from "./weld";
import type { LensName } from "./blueprint";
import type { GlyphPlan, LetteringBlueprint, LinePlan, LineWarp, OpRecord, Scorecard } from "./blueprint";
import { scoreCandidate } from "./lenses";
import type { RealizedCandidate } from "./lenses";

/* ── treatment grammar ───────────────────────────────────────────── */

interface Weighted<T> { id: string; w: number; desc: string; v: T }

export interface TreatmentGrammar {
  id: string;
  archetype: "script" | "chunky" | "poster";
  fontFamily: string;
  casePolicy: "title" | "upper" | "preserve";
  tracking: number;          // em
  lineHeight: number;        // em
  weldInk: boolean;
  /** target weld depth as a fraction of measured stroke width */
  overlapDepth: number;
  /** interlock gap target, em */
  tuckTarget: number;
  lensWeights: Record<LensName, number>;
  moves: {
    lines: Weighted<"few" | "many" | "one-word-per-line">[];
    columnFit: Weighted<boolean>[];
    warp: Weighted<LineWarp>[];
    rhythm: Weighted<{ kind: "none" | "bounce" | "tilt"; amp: number }>[];
    proportion: Weighted<{ kind: "none" | "condense" | "initial" | "final"; k: number }>[];
    join: Weighted<{ kind: "none" | "overlap-chain" }>[];
    terminal: Weighted<{ kind: "none" | "tail" | "underline" | "lead-in" }>[];
    alternates: Weighted<{ kind: "none" | "sprinkle" | "final-forms"; p: number }>[];
    interlock: Weighted<boolean>[];
  };
}

const W = <T>(id: string, w: number, desc: string, v: T): Weighted<T> => ({ id, w, desc, v });

export const CANDY_SCRIPT: TreatmentGrammar = {
  id: "candy-script", archetype: "script", fontFamily: "Pacifico",
  casePolicy: "title", tracking: 0.004, lineHeight: 0.92, weldInk: true,
  overlapDepth: 0.45, tuckTarget: 0.05,
  lensWeights: { signPainter: 0.4, typeDesigner: 0.25, graffitiWriter: 0.2, posterIllustrator: 0.15 },
  moves: {
    lines: [W("stack", 3, "one word per line", "one-word-per-line"), W("few", 1, "fewest lines", "few")],
    columnFit: [W("no", 3, "natural measures", false), W("yes", 1, "shared column", true)],
    warp: [
      W("none", 3, "level baseline", { kind: "none" }),
      W("arch", 1.5, "gentle crown", { kind: "arch", k: 0.07 }),
      W("flag", 1, "rising exit", { kind: "flag", k: -0.06 }),
    ],
    rhythm: [W("none", 4, "calm joins", { kind: "none", amp: 0 }), W("tilt", 1, "hand sway", { kind: "tilt", amp: 2.2 })],
    proportion: [
      W("none", 2.5, "even color", { kind: "none", k: 1 }),
      W("initial", 2, "swelled initial", { kind: "initial", k: 1.22 }),
      W("final", 1, "swelled final", { kind: "final", k: 1.18 }),
    ],
    join: [W("none", 1, "font's own joins", { kind: "none" })],
    terminal: [
      W("tail", 2.5, "swash exit stroke", { kind: "tail" }),
      W("underline", 2, "underline return beneath the block", { kind: "underline" }),
      W("lead", 1, "lead-in from the first letter", { kind: "lead-in" }),
      W("none", 1.5, "clean terminals", { kind: "none" }),
    ],
    alternates: [
      W("fina", 2.5, "designed final forms", { kind: "final-forms", p: 1 }),
      W("sprinkle", 1.5, "stylistic alternates", { kind: "sprinkle", p: 0.5 }),
      W("none", 1.5, "default forms", { kind: "none", p: 0 }),
    ],
    interlock: [W("on", 3, "tuck lines into negative space", true), W("off", 1, "open leading", false)],
  },
};

export const CANDY_CHUNKY: TreatmentGrammar = {
  id: "candy-chunky", archetype: "chunky", fontFamily: "Baloo 2",
  casePolicy: "title", tracking: 0.012, lineHeight: 1.02, weldInk: false,
  overlapDepth: 0.3, tuckTarget: 0.06,
  lensWeights: { signPainter: 0.2, typeDesigner: 0.3, graffitiWriter: 0.3, posterIllustrator: 0.2 },
  moves: {
    lines: [W("few", 3, "fewest lines", "few"), W("stack", 1, "one word per line", "one-word-per-line")],
    columnFit: [W("no", 3, "natural measures", false), W("yes", 1, "shared column", true)],
    warp: [
      W("none", 2, "level baseline", { kind: "none" }),
      W("arch", 2, "toy-box crown", { kind: "arch", k: 0.09 }),
      W("bulge", 1.5, "center swell", { kind: "bulge", k: 0.14 }),
      W("stagger", 1, "hopping letters", { kind: "stagger", k: 0.08 }),
    ],
    rhythm: [
      W("bounce", 2.5, "bouncing baseline", { kind: "bounce", amp: 0.035 }),
      W("none", 2, "planted baseline", { kind: "none", amp: 0 }),
      W("tilt", 1, "playful tilt", { kind: "tilt", amp: 4 }),
    ],
    proportion: [
      W("initial", 2, "big initial", { kind: "initial", k: 1.3 }),
      W("none", 2, "even weight", { kind: "none", k: 1 }),
      W("final", 1, "big final", { kind: "final", k: 1.24 }),
    ],
    join: [
      W("overlap", 2.5, "letters weld into one toy", { kind: "overlap-chain" }),
      W("none", 2, "each letter its own candy", { kind: "none" }),
    ],
    terminal: [W("none", 1, "rounded terminals as drawn", { kind: "none" })],
    alternates: [W("sprinkle", 2, "stylistic alternates", { kind: "sprinkle", p: 0.6 }), W("none", 2, "default forms", { kind: "none", p: 0 })],
    interlock: [W("on", 2, "tuck lines", true), W("off", 2, "open leading", false)],
  },
};

export const CANDY_POSTER: TreatmentGrammar = {
  id: "candy-poster", archetype: "poster", fontFamily: "Bangers",
  casePolicy: "upper", tracking: 0.02, lineHeight: 1.0, weldInk: false,
  overlapDepth: 0.3, tuckTarget: 0.045,
  lensWeights: { signPainter: 0.15, typeDesigner: 0.2, graffitiWriter: 0.25, posterIllustrator: 0.4 },
  moves: {
    lines: [W("many", 3, "stack tight lines", "many"), W("few", 1.5, "fewest lines", "few")],
    columnFit: [W("yes", 3, "force to one column", true), W("no", 1, "ragged measures", false)],
    warp: [
      W("none", 2.5, "square block", { kind: "none" }),
      W("flag", 1.5, "kicked last line", { kind: "flag", k: 0.05 }),
      W("arch", 1, "marquee crown", { kind: "arch", k: 0.06 }),
      W("stagger", 1, "punch stagger", { kind: "stagger", k: 0.07 }),
    ],
    rhythm: [
      W("none", 3, "drilled ranks", { kind: "none", amp: 0 }),
      W("bounce", 1, "shout bounce", { kind: "bounce", amp: 0.04 }),
      W("tilt", 1.5, "impact tilt", { kind: "tilt", amp: 3 }),
    ],
    proportion: [
      W("none", 2.5, "even weight", { kind: "none", k: 1 }),
      W("condense", 1.5, "condensed ranks", { kind: "condense", k: 0.88 }),
      W("initial", 1.5, "big initial", { kind: "initial", k: 1.24 }),
    ],
    join: [W("none", 3, "letters hold rank", { kind: "none" }), W("overlap", 1, "welded impact", { kind: "overlap-chain" })],
    terminal: [W("none", 4, "hard stops", { kind: "none" })],
    alternates: [W("none", 3, "default forms", { kind: "none", p: 0 }), W("sprinkle", 1, "case alternates", { kind: "sprinkle", p: 0.4 })],
    interlock: [W("on", 3, "lock the ranks tight", true), W("off", 1, "open leading", false)],
  },
};

/* ── deterministic sampling ──────────────────────────────────────── */

const pick = <T>(r: () => number, opts: Weighted<T>[]): Weighted<T> => {
  const total = opts.reduce((a, o) => a + o.w, 0);
  let t = r() * total;
  for (const o of opts) { t -= o.w; if (t <= 0) return o; }
  return opts[opts.length - 1];
};

const applyCase = (text: string, policy: TreatmentGrammar["casePolicy"]): string =>
  policy === "upper" ? text.toUpperCase()
  : policy === "title" ? text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
  : text;

/** all order-preserving compositions of words into ≤3 lines */
function lineBreaks(words: string[]): string[][] {
  const out: string[][] = [];
  const rec = (i: number, acc: string[]): void => {
    if (acc.length > 3) return;
    if (i === words.length) { if (acc.length) out.push([...acc]); return; }
    for (let take = 1; i + take <= words.length; take++) {
      rec(i + take, [...acc, words.slice(i, i + take).join(" ")]);
    }
  };
  rec(0, []);
  return out;
}

const breakFor = (words: string[], mode: "few" | "many" | "one-word-per-line", r: () => number): string[] => {
  const all = lineBreaks(words);
  const score = (b: string[]): number => {
    const lens = b.map((l) => l.length);
    const mean = lens.reduce((a, l) => a + l, 0) / lens.length;
    const imb = Math.sqrt(lens.reduce((a, l) => a + (l - mean) * (l - mean), 0) / lens.length) / Math.max(1, mean);
    // a lone 1–2 char line (an "&") is only tolerable mid-block
    const runt = b.some((l) => l.length <= 2 && b.length > 1) ? 0.5 : 1;
    const target = mode === "few" ? 1 : mode === "many" ? Math.min(3, words.length) : words.length;
    return runt / (1 + Math.abs(b.length - target)) / (1 + imb);
  };
  const ranked = all.map((b) => ({ b, s: score(b) })).sort((a, z) => z.s - a.s || a.b.join("/").localeCompare(z.b.join("/")));
  // small seeded variety between the top two viable breaks
  return ranked.length > 1 && r() < 0.3 ? ranked[1].b : ranked[0].b;
};

/* ── realization ─────────────────────────────────────────────────── */

export interface Realized {
  bp: LetteringBlueprint;
  /** final positioned per-glyph command lists (terminal bands included) */
  cmds: Cmd[][];
  glyphPolys: Pt[][][];
  unionPolys: Pt[][];
  /** compound path of the whole silhouette */
  d: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

interface CandidateSpec {
  lines: string[];
  columnFit: boolean;
  warp: LineWarp;
  rhythm: { kind: string; amp: number };
  proportion: { kind: string; k: number };
  join: { kind: string };
  terminal: { kind: string };
  alternates: { kind: string; p: number };
  interlock: boolean;
  comboKey: string;
  desc: string[];
  /** neutral typeset: measure nothing, adjust nothing */
  noOps?: boolean;
}

/** realize a candidate spec into geometry, recording every op */
function realizeSpec(
  font: Font, inv: FeatureInventory, g: TreatmentGrammar,
  spec: CandidateSpec, seed: number, id: string, size: number,
): Realized | null {
  const upem = font.unitsPerEm;
  const unit = size / upem;
  const rng = mulberry32(seed ^ 0x5eed);
  const ops: OpRecord[] = [];
  const plans: GlyphPlan[] = [];
  const linePlans: LinePlan[] = [];

  /* per-glyph plan construction (alternates + proportion + rhythm) */
  const lineGlyphIdx: number[][] = [];
  let gi = 0;
  const lineGlyphObjs: Glyph[][] = [];
  spec.lines.forEach((ln) => {
    const glyphs = toGlyphs(font, ln);
    const chars = [...ln];
    const idxs: number[] = [];
    const objs: Glyph[] = [];
    glyphs.forEach((gl, k) => {
      const ch = chars[k] ?? "";
      let glyphId = gl.index;
      let alternateOf: number | undefined;
      if (spec.alternates.kind === "sprinkle") {
        const alts = inv.alternates.get(glyphId);
        if (alts?.length && rng() < spec.alternates.p) {
          alternateOf = glyphId;
          glyphId = alts[Math.floor(rng() * alts.length) % alts.length];
        }
      }
      plans.push({
        index: gi, char: ch, glyphId, alternateOf,
        scaleX: 1, scaleY: 1, rotation: 0, baselineShift: 0,
        spacingAdjust: 0, overlapPrev: 0,
      });
      idxs.push(gi); objs.push(gl); gi++;
    });
    lineGlyphIdx.push(idxs);
    lineGlyphObjs.push(objs);
  });
  // designed final forms (fina): last glyph of every word
  if (spec.alternates.kind === "final-forms" && inv.finalForms.size) {
    let applied = 0;
    spec.lines.forEach((ln, li) => {
      const words = ln.split(" ");
      let k = 0;
      words.forEach((wd) => {
        const lastK = k + [...wd].length - 1;
        const p = plans[lineGlyphIdx[li][lastK]];
        if (p) {
          const fina = inv.finalForms.get(p.glyphId);
          if (fina !== undefined) { p.alternateOf = p.glyphId; p.glyphId = fina; applied++; }
        }
        k += [...wd].length + 1;
      });
    });
    if (applied) ops.push({
      op: "final-form", target: `${applied} word-final glyph${applied > 1 ? "s" : ""}`,
      params: "`fina` substitution",
      rationale: "the type designer drew exit strokes for word-final position — use them before inventing any",
    });
  }
  if (plans.some((p) => p.alternateOf !== undefined && spec.alternates.kind === "sprinkle")) {
    const n = plans.filter((p) => p.alternateOf !== undefined).length;
    ops.push({
      op: "alternate", target: `${n} glyphs`, params: "salt/ssXX alternates",
      rationale: "designed stylistic alternates break the repeated-letter tell",
    });
  }
  // proportion emphasis
  if (spec.proportion.kind === "condense") {
    plans.forEach((p) => { p.scaleX = spec.proportion.k; });
    ops.push({ op: "proportion", target: "all glyphs", params: `width ×${spec.proportion.k}`, rationale: "condensed ranks trade air for impact" });
  } else if (spec.proportion.kind === "initial" || spec.proportion.kind === "final") {
    const li = spec.proportion.kind === "initial" ? 0 : lineGlyphIdx.length - 1;
    const idxs = lineGlyphIdx[li];
    const p = plans[spec.proportion.kind === "initial" ? idxs[0] : idxs[idxs.length - 1]];
    if (p) {
      p.scaleX = p.scaleY = spec.proportion.k;
      ops.push({ op: "proportion", target: `'${p.char}'`, params: `×${spec.proportion.k}`, rationale: "one swelled letter gives the eye a doorway into the block" });
    }
  }
  // rhythm
  if (spec.rhythm.kind === "bounce") {
    plans.forEach((p, i) => {
      p.baselineShift = (i % 2 ? 1 : -1) * spec.rhythm.amp * (0.8 + rng() * 0.4);
      p.rotation = (i % 2 ? -1 : 1) * spec.rhythm.amp * 16 * (0.7 + rng() * 0.6);
    });
    ops.push({ op: "stagger", target: "all glyphs", params: `bounce ±${spec.rhythm.amp}em`, rationale: "a living baseline — letters land like thrown candy, not set type" });
  } else if (spec.rhythm.kind === "tilt") {
    plans.forEach((p, i) => { p.rotation = (i % 2 ? -1 : 1) * spec.rhythm.amp * (0.6 + rng() * 0.8); });
    ops.push({ op: "stagger", target: "all glyphs", params: `tilt ±${spec.rhythm.amp}°`, rationale: "hand sway — no two letters perfectly plumb" });
  }
  if (spec.join.kind === "overlap-chain") {
    plans.forEach((p, i) => { if (i > 0) p.overlapPrev = g.overlapDepth; });
  }

  /* ── layout each line ── */
  const lineCmds: Cmd[][][] = [];
  const lineWs: number[] = [];
  const lineCenters: number[][] = [];
  lineGlyphIdx.forEach((idxs, li) => {
    let pen = 0;
    let prev: Glyph | null = null;
    const cl: Cmd[][] = [];
    const centers: number[] = [];
    idxs.forEach((pi) => {
      const plan = plans[pi];
      const glyph = font.glyphs.get(plan.glyphId) ?? lineGlyphObjs[li][0];
      if (prev) { try { pen += font.getKerningValue(prev, glyph) * unit; } catch { /* substituted ids may miss kern pairs */ } }
      const adv = (glyph.advanceWidth ?? upem * 0.5) * unit * plan.scaleX;
      let cmds = (glyph.getPath(pen, 0, size).commands as Cmd[]) ?? [];
      if (plan.scaleX !== 1 || plan.scaleY !== 1) {
        const px = pen;
        cmds = mapCmds(cmds, (x, y) => [px + (x - px) * plan.scaleX, y * plan.scaleY]);
      }
      cl.push(cmds);
      centers.push(pen + adv / 2);
      pen += adv + g.tracking * size;
      prev = glyph;
    });
    lineCmds.push(cl);
    lineCenters.push(centers);
    lineWs.push(Math.max(1, pen - g.tracking * size));
  });

  /* ── optical pair spacing (measured) ── */
  let spacedPairs = 0; let maxAdj = 0;
  lineCmds.forEach((cl, li) => {
    if (spec.noOps) return;
    const polys = cl.map((c) => flatContours(c, size));
    const res = opticalSpacing(polys, size);
    if (!res) return;
    let shift = 0;
    for (let i = 1; i < cl.length; i++) {
      shift += res.adjust[i - 1] ?? 0;
      if (Math.abs(res.adjust[i - 1] ?? 0) > size * 0.004) {
        spacedPairs++;
        maxAdj = Math.max(maxAdj, Math.abs(res.adjust[i - 1]));
        plans[lineGlyphIdx[li][i]].spacingAdjust = (res.adjust[i - 1] ?? 0) / size;
      }
      if (shift) {
        cl[i] = mapCmds(cl[i], (x, y) => [x + shift, y]);
        lineCenters[li][i] += shift;
      }
    }
    lineWs[li] += shift;
  });
  if (spacedPairs) ops.push({
    op: "optical-spacing", target: `${spacedPairs} pairs`,
    params: `gaps evened to the measured median, max ${maxAdj.toFixed(1)}px`,
    rationale: "even the AIR between letters, not the metal — measured from the outlines, pair by pair",
  });

  /* ── glyph-rigid transforms: rhythm + warp ── */
  lineCmds.forEach((cl, li) => {
    const moves = rigidWarpMoves(lineCenters[li], lineWs[li], size, spec.warp as { kind: string; k: number });
    cl.forEach((cmds, k) => {
      const plan = plans[lineGlyphIdx[li][k]];
      const mv = moves[k];
      const totRot = plan.rotation + mv.rot;
      const totDy = plan.baselineShift * size + mv.dy;
      const sc = mv.scale;
      plan.rotation = Math.round(totRot * 10) / 10;
      plan.baselineShift = Math.round((totDy / size) * 1000) / 1000;
      if (sc !== 1) { plan.scaleX = Math.round(plan.scaleX * sc * 100) / 100; plan.scaleY = Math.round(plan.scaleY * sc * 100) / 100; }
      if (totRot || totDy || sc !== 1) {
        const cx = lineCenters[li][k];
        const a = (totRot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        cl[k] = mapCmds(cmds, (x, y) => {
          const lx = (x - cx) * sc, ly = y * sc;
          return [cx + lx * cs - ly * sn, totDy + lx * sn + ly * cs];
        });
      }
    });
    if (spec.warp.kind !== "none") {
      const wk = spec.warp as { kind: string; k: number };
      ops.push({
        op: "warp", target: `line ${li + 1}`, params: `${wk.kind} k=${wk.k}`,
        rationale: "glyph-rigid envelope — whole letters rotate and shift along the curve; counters never bend",
      });
    }
  });

  /* ── contextual overlap (measured penetration) ── */
  lineCmds.forEach((cl, li) => {
    let chained = 0; let meanDx = 0;
    for (let k = 1; k < cl.length; k++) {
      const plan = plans[lineGlyphIdx[li][k]];
      if (!plan.overlapPrev) continue;
      const A = flatContours(cl[k - 1], size), B = flatContours(cl[k], size);
      if (!A.length || !B.length) { plan.overlapPrev = 0; continue; }
      const sw = Math.min(strokeWidth(A), strokeWidth(B));
      const target = Math.min(plan.overlapPrev, 0.65) * sw;
      const ba2 = boundsOfPolys(A), bb2 = boundsOfPolys(B);
      const narrower = Math.min(ba2.x2 - ba2.x1, bb2.x2 - bb2.x1);
      const dx = solveOverlap(A, B, target, Math.min(size * 0.32, narrower * 0.34));
      if (dx === null) { plan.overlapPrev = 0; continue; }
      // counter gate: weld the PAIR and count surviving apertures —
      // one merged aperture is a lettering move, two is damage
      const shifted = B.map((p) => p.map(([x, y]) => [x + dx, y] as Pt));
      const pairPolys = [...A, ...shifted];
      const pairGroups = [...A.map(() => 0), ...shifted.map(() => 1)];
      const welded = weld(pairPolys, pairGroups);
      const before = counterStats(A).count + counterStats(B).count;
      if (welded.polys.length && counterStats(welded.polys).count < before - 1) {
        plan.overlapPrev = 0; continue;
      }
      for (let m = k; m < cl.length; m++) {
        cl[m] = mapCmds(cl[m], (x, y) => [x + dx, y]);
        lineCenters[li][m] += dx;
      }
      lineWs[li] += dx;
      chained++; meanDx += dx;
    }
    if (chained) ops.push({
      op: "overlap", target: `line ${li + 1}, ${chained} joins`,
      params: `penetration ${(g.overlapDepth * 100).toFixed(0)}% of measured stroke, mean ${(meanDx / chained).toFixed(1)}px`,
      rationale: "letters lean into each other by a measured fraction of their own stroke — welded downstream into one ink",
    });
  });

  /* ── stack lines (Force-to-Column uses the EXACT flatWordOutline rule) ── */
  const blockW = Math.max(...lineWs, 1);
  const fit = spec.columnFit && spec.lines.length > 1;
  const lh = g.lineHeight * size;
  const stacked: Cmd[][][] = [];
  let baseline = 0;
  const lineScales: number[] = [];
  lineCmds.forEach((cl, li) => {
    const s = fit && cl.length && lineWs[li] > 1 ? Math.min(8, blockW / lineWs[li]) : 1;
    lineScales.push(s);
    if (li > 0) baseline += lh * s;
    const lw = lineWs[li] * s;
    const xOff = fit ? 0 : (blockW - lw) / 2;
    const b2 = baseline;
    stacked.push(cl.map((cmds) => mapCmds(cmds, (x, y) => [x * s + xOff, y * s + b2])));
  });
  if (fit) ops.push({
    op: "column-fit", target: "block",
    params: `line scales ${lineScales.map((s) => s.toFixed(2)).join(" · ")}`,
    rationale: "every line earns the same measure — the block becomes one plaque",
  });

  /* ── line interlock from measured negative space ── */
  const linePlansTuck: { dy: number; dx: number }[] = spec.lines.map(() => ({ dy: 0, dx: 0 }));
  if (spec.interlock && stacked.length > 1) {
    let totalTuck = 0;
    for (let li = 1; li < stacked.length; li++) {
      const above = stacked[li - 1].flatMap((c) => flatContours(c, size));
      const below = stacked[li].flatMap((c) => flatContours(c, size));
      const res = solveInterlock(above, below, g.tuckTarget * size * lineScales[li], size * 0.12);
      if (!res) continue;
      const dy = Math.min(res.dy, 0.55 * lh * lineScales[li]);
      for (let m = li; m < stacked.length; m++) {
        stacked[m] = stacked[m].map((c) => mapCmds(c, (x, y) => [x + (m === li ? res.dx : 0), y - dy]));
      }
      linePlansTuck[li] = { dy, dx: res.dx };
      totalTuck += dy;
    }
    if (totalTuck > 2) ops.push({
      op: "interlock", target: "line gaps",
      params: `tucked ${totalTuck.toFixed(0)}px total${linePlansTuck.some((t) => t.dx) ? ", with horizontal nudge" : ""}`,
      rationale: "the gap is solved from the actual ink profiles — ascenders rise into descender bays, never a blind squeeze",
    });
  }

  /* ── terminal actions (after stacking, collision-gated) ── */
  const flat: Cmd[][] = stacked.flat();
  const flatPolys = flat.map((c) => flatContours(c, size));
  if (spec.terminal.kind !== "none" && flat.length) {
    const lastIdxInFlat = flat.length - 1;
    const firstIdxInFlat = 0;
    const attach = spec.terminal.kind === "lead-in" ? firstIdxInFlat : lastIdxInFlat;
    const polys = flatPolys[attach];
    const avoid = flatPolys.filter((_, i) => i !== attach).flat();
    let band = null;
    if (spec.terminal.kind === "underline") {
      const all = flatPolys.flat();
      const bb = boundsOfPolys(all);
      // sweep below the measured bottom of the block
      let bottom = -Infinity;
      for (let i = 0; i < 40; i++) {
        const x = bb.x1 + ((i + 0.5) / 40) * (bb.x2 - bb.x1);
        const ys = colYs(all, x);
        if (ys.length) bottom = Math.max(bottom, ys[ys.length - 1]);
      }
      const sw = strokeWidth(polys);
      band = buildTerminal(polys, size, 1, 0.7, 0.2, 0.3, avoid, {
        backToX: bb.x1 + (bb.x2 - bb.x1) * 0.08,
        belowY: bottom + sw * 0.55,
      });
      if (band) ops.push({
        op: "terminal", target: "last glyph",
        params: `underline return, sweep to ${(((band.tip[0] - bb.x1) / Math.max(1, bb.x2 - bb.x1)) * 100).toFixed(0)}% of block width`,
        rationale: "the exit stroke returns beneath the lockup — measured clear of every descender",
      });
    } else {
      const dir = spec.terminal.kind === "lead-in" ? -1 : 1;
      band = buildTerminal(polys, size, dir as 1 | -1, 1.05, 0.3, 0.42, avoid);
      if (band) ops.push({
        op: "terminal", target: spec.terminal.kind === "lead-in" ? "first glyph" : "last glyph",
        params: `${spec.terminal.kind} from detected baseline-zone terminal, tapered from measured stroke`,
        rationale: "a drawn flourish grows out of the letter's own terminal — anchored to the outline, not floated on top",
      });
    }
    if (band) {
      const bandCmds: Cmd[] = [{ type: "M", x: band.contour[0][0], y: band.contour[0][1] }];
      for (let i = 1; i < band.contour.length; i++) bandCmds.push({ type: "L", x: band.contour[i][0], y: band.contour[i][1] });
      bandCmds.push({ type: "Z" });
      flat[attach] = [...flat[attach], ...bandCmds];
      flatPolys[attach] = flatContours(flat[attach], size);
      const p = plans[attach === firstIdxInFlat ? 0 : plans.length - 1];
      p.terminal = {
        kind: spec.terminal.kind === "lead-in" ? "lead-in" : spec.terminal.kind === "underline" ? "underline-return" : "swash-tail",
        lenEm: 1.05, dropEm: 0.3, curve: 0.42,
      };
    }
  }
  if (g.weldInk || spec.join.kind === "overlap-chain") {
    ops.push({ op: "weld", target: "block", params: "grid union of all ink", rationale: "one piece of ink — bevels and depth will follow the union boundary, never the seams" });
  }

  /* ── assemble the blueprint + union geometry ── */
  spec.lines.forEach((ln, li) => {
    linePlans.push({
      text: ln, glyphs: lineGlyphIdx[li],
      warp: spec.warp, columnScale: lineScales[li],
      tuckDy: linePlansTuck[li].dy, tuckDx: linePlansTuck[li].dx,
    });
  });

  const weldThis = g.weldInk || spec.join.kind === "overlap-chain";
  const allPolys: Pt[][] = [];
  const groups: number[] = [];
  flatPolys.forEach((gp, i) => { for (const p of gp) { allPolys.push(p); groups.push(i); } });
  if (!allPolys.length) return null;
  let unionPolys: Pt[][];
  let d: string;
  if (weldThis) {
    // join gaps close relative to the MEASURED stroke, so welds read
    // as inked lettering while every real counter survives
    const wr = weld(allPolys, groups, undefined, strokeWidth(allPolys) * 0.16);
    unionPolys = wr.polys; d = wr.d;
  } else {
    unionPolys = allPolys;
    d = flat.map(cmdToD).join("");
  }
  const bounds = boundsOfPolys(unionPolys);

  const bp: LetteringBlueprint = {
    id, phrase: spec.lines.join(" "), fontFamily: g.fontFamily, seed,
    lines: linePlans, glyphPlans: plans,
    weldInk: weldThis, columnFit: fit, lineHeight: g.lineHeight,
    silhouetteIntent: spec.desc[0] ?? "",
    conceptRationale: spec.desc.join("; "),
    ops,
  };
  return { bp, cmds: flat, glyphPolys: flatPolys, unionPolys, d, bounds };
}

/* ── neutral typeset (view 1 + gate baselines) ───────────────────── */

export function neutralTypeset(font: Font, lines: string[], g: TreatmentGrammar, size: number): Realized {
  const spec: CandidateSpec = {
    lines, columnFit: false, warp: { kind: "none" },
    rhythm: { kind: "none", amp: 0 }, proportion: { kind: "none", k: 1 },
    join: { kind: "none" }, terminal: { kind: "none" },
    alternates: { kind: "none", p: 0 }, interlock: false,
    comboKey: "neutral", desc: ["neutral typeset"], noOps: true,
  };
  const inv: FeatureInventory = { tags: [], alternates: new Map(), finalForms: new Map() };
  const gNoOps: TreatmentGrammar = { ...g, weldInk: false };
  return realizeSpec(font, inv, gNoOps, spec, 1, "neutral", size)!;
}

/* ── the director ────────────────────────────────────────────────── */

export interface DirectedCandidate {
  bp: LetteringBlueprint;
  realized: Realized;
  card: Scorecard;
}

/** Generate `count` deterministic structural candidates for a phrase.
 *  Geometry only — material never participates in choosing. */
export function generateBlueprints(
  font: Font, text: string, grammar: TreatmentGrammar,
  seed: number, count = 12, size = 300,
): { candidates: DirectedCandidate[]; neutral: Realized; rejectedCombos: number } {
  const inv = inspectFeatures(font);
  const cased = applyCase(text.trim(), grammar.casePolicy);
  const words = cased.split(/\s+/);

  const seen = new Set<string>();
  const candidates: DirectedCandidate[] = [];
  let rejectedCombos = 0;

  // gate baselines must compare like with like: one neutral typeset
  // per LINE-BREAK configuration, cached by break key
  const neutralCache = new Map<string, { real: Realized; pen: number[]; counters: number }>();
  const neutralFor = (lines: string[]): { real: Realized; pen: number[]; counters: number } => {
    const key = lines.join("/");
    let hit = neutralCache.get(key);
    if (hit) return hit;
    const real = neutralTypeset(font, lines, grammar, size);
    const pen: number[] = [];
    real.bp.lines.forEach((l) => {
      for (let i = 0; i + 1 < l.glyphs.length; i++) {
        pen.push(measuredPenetration(
          real.glyphPolys[l.glyphs[i]] ?? [], real.glyphPolys[l.glyphs[i + 1]] ?? [],
        ));
      }
    });
    const counters = real.glyphPolys.reduce((a, gp) => a + counterStats(gp).count, 0);
    hit = { real, pen, counters };
    neutralCache.set(key, hit);
    return hit;
  };
  const defaultBreak = breakFor(words, grammar.moves.lines[0].v, mulberry32(seed));
  const neutral = neutralFor(defaultBreak).real;

  for (let attempt = 0; attempt < count * 10 && candidates.length < count; attempt++) {
    const r = mulberry32((seed * 7919 + attempt * 104729) >>> 0);
    const m = grammar.moves;
    const chosen = {
      lines: pick(r, m.lines), columnFit: pick(r, m.columnFit),
      warp: pick(r, m.warp), rhythm: pick(r, m.rhythm),
      proportion: pick(r, m.proportion), join: pick(r, m.join),
      terminal: pick(r, m.terminal), alternates: pick(r, m.alternates),
      interlock: pick(r, m.interlock),
    };
    const lines = breakFor(words, chosen.lines.v, r);
    const comboKey = [
      lines.join("/"), chosen.columnFit.id, chosen.warp.id, chosen.rhythm.id,
      chosen.proportion.id, chosen.join.id, chosen.terminal.id,
      chosen.alternates.id, chosen.interlock.id,
    ].join("·");
    if (seen.has(comboKey)) continue;
    seen.add(comboKey);
    const spec: CandidateSpec = {
      lines, columnFit: chosen.columnFit.v, warp: chosen.warp.v,
      rhythm: chosen.rhythm.v, proportion: chosen.proportion.v,
      join: chosen.join.v, terminal: chosen.terminal.v,
      alternates: chosen.alternates.v, interlock: chosen.interlock.v,
      comboKey,
      desc: [
        `${lines.length}-line ${chosen.warp.desc}`,
        chosen.rhythm.desc, chosen.proportion.desc, chosen.join.desc,
        chosen.terminal.desc, chosen.alternates.desc,
        chosen.interlock.v ? "interlocked" : "open leading",
        chosen.columnFit.v ? "forced column" : "natural measures",
      ],
    };
    const realized = realizeSpec(font, inv, grammar, spec, seed + attempt, `${grammar.id}-c${candidates.length}`, size);
    if (!realized) { rejectedCombos++; continue; }
    const base = neutralFor(lines);
    const rc: RealizedCandidate = {
      bp: realized.bp, size,
      glyphPolys: realized.glyphPolys, unionPolys: realized.unionPolys,
      neutralPenetration: base.pen, neutralCounters: base.counters,
    };
    const card = scoreCandidate(rc, grammar.lensWeights);
    candidates.push({ bp: realized.bp, realized, card });
  }
  return { candidates, neutral, rejectedCombos };
}

/** black-silhouette SVG for a realized lockup */
export function silhouetteSvg(r: Realized, pad = 0.12): string {
  const w = r.bounds.x2 - r.bounds.x1, h = r.bounds.y2 - r.bounds.y1;
  const p = Math.max(w, h) * pad;
  const W2 = Math.round(w + p * 2), H2 = Math.round(h + p * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="${(r.bounds.x1 - p).toFixed(1)} ${(r.bounds.y1 - p).toFixed(1)} ${W2} ${H2}"><path d="${r.d}" fill="#141414"/></svg>`;
}

/** outline-only view of the same geometry */
export function outlineSvg(r: Realized, pad = 0.12): string {
  const w = r.bounds.x2 - r.bounds.x1, h = r.bounds.y2 - r.bounds.y1;
  const p = Math.max(w, h) * pad;
  const W2 = Math.round(w + p * 2), H2 = Math.round(h + p * 2);
  const sw = Math.max(1, Math.min(w, h) / 220);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="${(r.bounds.x1 - p).toFixed(1)} ${(r.bounds.y1 - p).toFixed(1)} ${W2} ${H2}"><path d="${r.d}" fill="none" stroke="#141414" stroke-width="${sw.toFixed(1)}"/></svg>`;
}
