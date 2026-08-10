/* SPLASH LETTERING ENGINE — the LetteringBlueprint IR.

   The sketch-phase contract: a blueprint records STRUCTURE AND INTENT
   for a piece of lettering — per-glyph construction plans, line
   relationships, ornaments — plus the op record: every modification
   the director made, with measured parameters and a rationale. The
   record is not bookkeeping; it drives the difference view and the
   self-critique gate ("typeset, not designed" candidates are rejected
   because their record contains nothing structural).

   Blueprints are geometry-only. No color, no material, no light —
   choosing structure happens in black. */

export type TerminalKind = "swash-tail" | "lead-in" | "underline-return";

export interface TerminalPlan {
  kind: TerminalKind;
  /** length in em of the authored size */
  lenEm: number;
  /** vertical drop (+down) in em at the tip */
  dropEm: number;
  /** how strongly the band curves, 0..1 */
  curve: number;
}

export interface GlyphPlan {
  /** global glyph index across the whole phrase */
  index: number;
  char: string;
  /** font glyph id actually used (after any substitution) */
  glyphId: number;
  /** designed OpenType alternate applied instead of the default */
  alternateOf?: number;
  scaleX: number;
  scaleY: number;
  /** degrees, glyph-rigid */
  rotation: number;
  /** em, +down */
  baselineShift: number;
  /** degrees, italic-style lean (reserved: no grammar op drives it yet) */
  shear?: number;
  /** draw order for declared overlaps; higher paints on top */
  zIndex?: number;
  /** extra advance after this glyph, em (optical spacing correction) */
  spacingAdjust: number;
  /** deliberate weld-depth into the PREVIOUS glyph, as a fraction of
   *  measured stroke width (0 = no declared overlap) */
  overlapPrev: number;
  terminal?: TerminalPlan;
}

export type LineWarp =
  | { kind: "none" }
  | { kind: "arch"; k: number }        // crown (+) / valley (−), em at apex
  | { kind: "flag"; k: number }        // linear ramp, em across the line
  | { kind: "bulge"; k: number }       // center glyphs scale up by k
  | { kind: "stagger"; k: number };    // alternating baseline offsets, em

export interface LinePlan {
  text: string;
  /** indices into the blueprint's glyph plans */
  glyphs: number[];
  warp: LineWarp;
  /** uniform scale from Force-to-Column (1 = natural) */
  columnScale: number;
  /** measured interlock: shift up from naive stacking, px at authored
   *  size (0 for the first line) */
  tuckDy: number;
  /** horizontal nudge chosen by the interlock search, px */
  tuckDx: number;
}

/** one applied modification — feeds the difference view verbatim */
export interface OpRecord {
  op:
    | "alternate" | "final-form" | "optical-spacing" | "proportion"
    | "overlap" | "terminal" | "warp" | "interlock" | "column-fit"
    | "weld" | "stagger";
  /** "g3 'e'", "line 2", "pair 4·5", "block" */
  target: string;
  /** measured / chosen parameters, human-readable */
  params: string;
  rationale: string;
}

/** a procedural ornament — underline, swash, plaque, ray. Ornaments
 *  are SEPARATE editable layers anchored to the typography; they may
 *  visually continue a terminal but never mutate the source glyph. */
export interface OrnamentPlan {
  kind: TerminalKind;
  /** glyph plan index the ornament is anchored to */
  anchorGlyph: number;
}

export interface LetteringBlueprint {
  id: string;
  phrase: string;
  fontFamily: string;
  seed: number;
  lines: LinePlan[];
  glyphPlans: GlyphPlan[];
  ornaments: OrnamentPlan[];
  /** weld the whole lockup into one piece of ink downstream */
  weldInk: boolean;
  columnFit: boolean;
  /** em — line advance before interlock */
  lineHeight: number;
  /** one sentence: what shape this lockup is reaching for */
  silhouetteIntent: string;
  /** why this candidate exists — the design idea, not the settings */
  conceptRationale: string;
  ops: OpRecord[];
}

/* ── lens scorecards ─────────────────────────────────────────────── */

export type LensName = "signPainter" | "typeDesigner" | "graffitiWriter" | "posterIllustrator";
export const LENS_NAMES: LensName[] = ["signPainter", "typeDesigner", "graffitiWriter", "posterIllustrator"];
export const LENS_LABELS: Record<LensName, string> = {
  signPainter: "Sign Painter",
  typeDesigner: "Type Designer",
  graffitiWriter: "Graffiti Writer",
  posterIllustrator: "Poster Illustrator",
};

export interface LensScore {
  lens: LensName;
  /** 0–10 */
  score: number;
  notes: string[];
}

export interface Scorecard {
  blueprintId: string;
  lenses: LensScore[];
  /** grammar-weighted aggregate, 0–10 */
  aggregate: number;
  /** hard-gate failures; non-empty = candidate rejected */
  gateFailures: string[];
  /** measured facts the scores were derived from */
  metrics: Record<string, number>;
}
