/* SPLASH 2 EDITOR — the document model.

   One piece = one resolvedTreatment: a style chip's recipe plus the
   user's overrides, kept apart so restyling and re-editing compose.
   Every field here is data the editor UI reads and writes; compile
   is a pure function of this document (deterministic, seeded), so
   undo/redo is plain state history.

   Per the owner's art-direction rules: the engine art-directs
   existing type — no generated ornament lines, no glyph mutation.
   Composition directions come from the LetteringDirector; the user
   picks one and owns it from there. */

import type { GlossLayer } from "./gloss";
import type { PatternSpec } from "./pattern";
import type { GradientSpec } from "./engine";
import type { GlyphOverride } from "./authorTile";
import type { CompositionDirection } from "./director";

export type EditorStage = "style" | "type" | "layout" | "appearance" | "finish" | "scene";

export interface LineOverride {
  /** uniform scale multiplier on the line (hierarchy control) */
  scale?: number;
  /** em, extra leading before this line (tuck when negative) */
  leadingAdjust?: number;
  /** px in authored space, horizontal nudge */
  dx?: number;
}

export interface ShapeControls {
  /** glyph-rigid line warps, restrained by design */
  arch?: number;        // −0.2..0.2 crown/valley
  taper?: number;       // −0.3..0.3 per-line scale ramp
  shear?: number;       // −12..12 degrees, whole-block lean
  perspective?: number; // −0.25..0.25 vertical scale ramp
}

export interface ViewportState {
  zoom: number;                 // 1 = fit
  panX: number; panY: number;
  backdrop: "checker" | "light" | "dark" | "color";
  backdropColor?: string;
  /** backdrop is preview-only and never exported */
}

/** the whole editable document — style defaults live in the chip,
 *  user intent lives here, compile merges them */
export interface SplashDoc {
  version: 1;
  /* Style */
  styleChip: "candy";           // one chip in the proof
  paletteName: string;          // palettes are controls within the chip
  /* Type */
  text: string;                 // \n = line breaks
  fontFamily: string;
  compositionDirection: CompositionDirection | null; // null = neutral
  directionSeed: number;        // regenerate variations deterministically
  tracking?: number;            // em
  lineHeight?: number;          // em
  align?: "left" | "center" | "right";
  /* Layout & Shape */
  columnFit: boolean;           // Force to Column (exact legacy rule)
  posterFit: boolean;           // fit block into a target frame aspect
  lines: Record<number, LineOverride>;
  glyphs: GlyphOverride[];      // Reflow / Overlap per glyph
  shape: ShapeControls;
  weldInk: boolean;
  /* Appearance Stack (ordered) */
  bevelWidth: number;
  profile: "rounded" | "hard";
  fills: GradientSpec[];        // stacked, reorderable
  pattern?: PatternSpec;
  depthArrangement: "default" | "swapRings";
  /* Finish */
  glossLayers: GlossLayer[];
  sparkles: boolean;
  /* Scene (exportable, unlike the viewport backdrop) */
  scene: "none" | "stage" | "burst";
  /* selection is UI state but travels with the doc for tool context */
  selection: { level: "composition" | "line" | "glyph"; index: number };
}

export const DEFAULT_DOC: SplashDoc = {
  version: 1,
  styleChip: "candy",
  paletteName: "Bubblegum",
  text: "Sweet\nDreams",
  fontFamily: "Pacifico",
  compositionDirection: null,
  directionSeed: 7,
  align: "center",
  columnFit: false,
  posterFit: false,
  lines: {},
  glyphs: [],
  shape: {},
  weldInk: true,
  bevelWidth: 2.6,
  profile: "rounded",
  fills: [],
  depthArrangement: "default",
  glossLayers: [],
  sparkles: true,
  scene: "none",
  selection: { level: "composition", index: 0 },
};

/** stage list in rail order */
export const STAGES: { id: EditorStage; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "type", label: "Type" },
  { id: "layout", label: "Layout & Shape" },
  { id: "appearance", label: "Appearance" },
  { id: "finish", label: "Finish" },
  { id: "scene", label: "Scene" },
];
