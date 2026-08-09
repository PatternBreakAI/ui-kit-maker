/* SPLASH LETTERING ENGINE — the authored-treatment composer.

   The resolvedTreatment model from the product doc, headless subset:

     resolvedTreatment = styleRecipe (Candy)
                       + typography/layout overrides (per-glyph included)
                       + appearance overrides (bevel, stacked fills,
                         pattern, depth arrangement)
                       + finish overrides (gloss layers, sparkles)
                       + scene overrides (stage fill, burst)

   Compile order is the canonical one — text → lines → layout →
   per-glyph overrides → ink welding → appearance → material → finish →
   scene — so a layout change regenerates every downstream layer.
   Force to Column reuses the EXACT previous rule from
   src/splash/outline.ts flatWordOutline: per-line uniform scale
   `min(8, blockW / lineW)` to the widest line's measure, stacking by
   each line's own scaled body, fitted lines spanning the measure. */

import type { Font } from "opentype.js";
import { layout, mapCmds, toGlyphs } from "@/splash/outline";
import type { Cmd } from "@/splash/outline";
import { toGeom, emitPassMajor } from "./engine";
import type { Frame, Geom, GradientSpec, IROp } from "./engine";
import { resolveDepth } from "./material";
import type { Palette, DepthPlan } from "./material";
import { renderBevelB2 } from "./bevelB";
import { resolvePattern } from "./pattern";
import type { PatternSpec } from "./pattern";
import { renderGloss } from "./gloss";
import type { GlossLayer } from "./gloss";
import { buildScene } from "./scene";
import { scaleRecipe } from "./recipe";
import type { TreatmentRecipe, RoleRecipe } from "./recipe";
import { MATERIALS, DEMO_RIG } from "./materials";
import { weld } from "./weld";

export interface GlyphOverride {
  /** global glyph index (blank lines don't advance it) */
  index: number;
  scale?: number;
  /** Reflow updates neighboring advances; Overlap intrudes deliberately */
  mode?: "reflow" | "overlap";
  /** baseline shift, authored px (+down) */
  dy?: number;
  /** degrees */
  rot?: number;
  /** extra advance after this glyph, authored px */
  spacingAfter?: number;
}

export interface AuthoredTreatment {
  text: string;                        // \n = line breaks
  palette: Palette;
  /* typography & layout */
  tracking?: number;                   // em
  lineHeight?: number;                 // em, default 1.08
  align?: "left" | "center" | "right";
  columnFit?: boolean;                 // Force to Column
  glyphs?: GlyphOverride[];
  weldInk?: boolean;
  /* appearance */
  bevelWidth?: number;                 // authored px
  profile?: "rounded" | "hard";
  extraFills?: GradientSpec[];         // stacked fills over the plateau
  pattern?: PatternSpec;
  /** "swapRings" demonstrates user-reordered depth: the cream keyline
   *  paints OUTSIDE the cap ring instead of inside it */
  depthArrangement?: "default" | "swapRings";
  /* finish */
  glossLayers?: GlossLayer[];
  sparkles?: boolean;
  /* scene */
  scene?: "none" | "stage" | "burst";
  masterScale?: number;
  seed?: number;
}

export interface AuthoredTile { svg: string; w: number; h: number; effWidth: number }

const hash = (s: string): string => {
  let x = 2166136261 >>> 0;
  for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(36);
};

export function compileAuthored(font: Font, t: AuthoredTreatment): AuthoredTile {
  const S = t.masterScale ?? 16;
  const seed = t.seed ?? 7;
  const fixture = MATERIALS.find((m) => m.id === "candy-plastic")!;
  const base: TreatmentRecipe = {
    id: "candy-authored", version: 1, palette: t.palette, light: DEMO_RIG,
    hero: {
      fontFamily: "x", casePolicy: "preserve", size: 150,
      tracking: t.tracking ?? 0.012, depth: fixture.depth, material: fixture.material,
    } as RoleRecipe,
    composition: { lineGap: 0 }, stage: "stage",
  };
  const R = scaleRecipe(base, S);
  const size = R.hero.size;
  const ns = `at${hash(`${t.text}|${S}|${t.bevelWidth ?? 0}|${t.columnFit ? 1 : 0}|${t.weldInk ? 1 : 0}`)}`;

  /* ── TYPOGRAPHY & LAYOUT ────────────────────────────────────────── */
  const lines = t.text.split("\n");
  const ov = new Map<number, GlyphOverride>();
  (t.glyphs ?? []).forEach((g) => ov.set(g.index, g));

  // reflow scales feed the ADVANCES (outline.ts letterScales semantics)
  const giStarts: number[] = [];
  {
    let g0 = 0;
    for (const ln of lines) { giStarts.push(g0); g0 += Math.max(1, toGlyphs(font, ln).length); }
  }
  const reflowScales: number[] = [];
  {
    let total = 0;
    for (const ln of lines) total += Math.max(1, toGlyphs(font, ln).length);
    for (let i = 0; i < total; i++) {
      const o = ov.get(i);
      reflowScales.push(o && o.scale && o.mode !== "overlap" ? o.scale : 1);
    }
  }
  const laid = lines.map((ln, li) => layout(font, ln, size, R.hero.tracking, reflowScales, giStarts[li]));

  // Force to Column — the exact previous rule
  const blockW = Math.max(...laid.map((l) => l.w), 1);
  const fit = !!t.columnFit && laid.filter((l) => l.glyphs.length).length > 1;
  const lh = (t.lineHeight ?? 1.08) * size;
  const align = t.align ?? "center";

  const cmds: Cmd[][] = [];
  let baseline = 0;
  laid.forEach((line, li) => {
    const s = fit && line.glyphs.length && line.w > 1 ? Math.min(8, blockW / line.w) : 1;
    if (li > 0) baseline += lh * s;
    const lw = line.w * s;
    const xOff = fit ? 0 : align === "left" ? 0 : align === "right" ? blockW - lw : (blockW - lw) / 2;
    let extra = 0; // accumulated spacingAfter within the line
    line.glyphs.forEach((g, k) => {
      const gi = giStarts[li] + k;
      const o = ov.get(gi);
      let gc = g.cmds;
      // per-glyph overrides in glyph-local space (around the advance center)
      if (o && (o.mode === "overlap" && o.scale) || o?.rot || o?.dy) {
        const k2 = o?.mode === "overlap" && o.scale ? o.scale : 1;
        const a = ((o?.rot ?? 0) * Math.PI) / 180;
        const cs = Math.cos(a), sn = Math.sin(a);
        const cx = g.center;
        const dy = (o?.dy ?? 0) * S;
        gc = mapCmds(gc, (px, py) => {
          const lx2 = (px - cx) * k2, ly2 = py * k2;
          return [cx + lx2 * cs - ly2 * sn, dy + lx2 * sn + ly2 * cs];
        });
      }
      const b2 = baseline, x2 = xOff + extra;
      cmds.push(mapCmds(gc, (px, py) => [px * s + x2, py * s + b2]));
      if (o?.spacingAfter) extra += o.spacingAfter * S;
    });
  });

  /* ── INK TOPOLOGY ───────────────────────────────────────────────── */
  let geom: Geom = toGeom(cmds, size);
  if (t.weldInk) {
    const wd = weld(geom.polys, geom.groups);
    geom = {
      d: wd.d, polys: wd.polys, groups: wd.groups,
      x1: geom.x1, y1: geom.y1, x2: geom.x2, y2: geom.y2,
      glyphDs: [wd.d], glyphPolys: [wd.polys],
    };
  }

  /* ── frame ──────────────────────────────────────────────────────── */
  const pad = size * 0.45;
  const frame: Frame = { x1: geom.x1 - pad, y1: geom.y1 - pad, x2: geom.x2 + pad, y2: geom.y2 + pad * 1.15 };
  const defs: string[] = [];

  /* ── DEPTH (appearance arrangement is user data) ────────────────── */
  let depthPlan: DepthPlan = R.hero.depth;
  if (t.depthArrangement === "swapRings") {
    depthPlan = {
      ...R.hero.depth,
      cap: R.hero.depth.keyline && R.hero.depth.cap
        ? { tok: R.hero.depth.keyline.tok, expand: R.hero.depth.cap.expand }
        : R.hero.depth.cap,
      keyline: R.hero.depth.cap && R.hero.depth.keyline
        ? { tok: R.hero.depth.cap.tok, expand: R.hero.depth.keyline.expand }
        : R.hero.depth.keyline,
    };
  }
  const depth = emitPassMajor(
    [{ geom, idp: `${ns}d`, ops: resolveDepth(depthPlan, t.palette, R.light, 1) }],
    null, defs, false, frame,
  );

  /* ── MATERIAL (Candy, Model B2) ─────────────────────────────────── */
  const face = renderBevelB2(geom, R.hero.material, t.palette, R.light, {
    widthReq: (t.bevelWidth ?? 3) * S,
    profile: t.profile ?? "rounded",
    shading: "directional",
    bounce: "off",
    glossSelective: false,
  }, ns, defs, frame);
  // face mask for finish layers; the plateau mask is B2's shared one
  const faceMaskId = `${ns}fm`;
  defs.push(
    `<mask id="${faceMaskId}" maskUnits="userSpaceOnUse" x="${(frame.x1 - 40).toFixed(0)}" y="${(frame.y1 - 40).toFixed(0)}" width="${(frame.x2 - frame.x1 + 80).toFixed(0)}" height="${(frame.y2 - frame.y1 + 80).toFixed(0)}">` +
    `<path d="${geom.d}" fill="#FFF"/></mask>`,
  );
  const plateauMaskId = `${ns}cPm`;

  /* ── stacked fills over the plateau ─────────────────────────────── */
  let fills = "";
  if (t.extraFills?.length) {
    const ops: IROp[] = t.extraFills.map((f) => ({ paint: f, pass: "face" as const, mask: plateauMaskId }));
    fills = emitPassMajor([{ geom, idp: `${ns}xf`, ops }], null, defs, false, frame);
  }

  /* ── pattern layer ──────────────────────────────────────────────── */
  let patternBody = "";
  if (t.pattern) {
    const op = resolvePattern(t.pattern, t.palette, R.light, geom, frame, seed, ns);
    op.mask = plateauMaskId; // patterns decorate the face plateau here
    patternBody = emitPassMajor([{ geom, idp: `${ns}pt`, ops: [op] }], null, defs, false, frame);
  }

  /* ── FINISH: gloss layers + sparkles ────────────────────────────── */
  let finish = "";
  (t.glossLayers ?? []).forEach((gl, li) => {
    finish += renderGloss(geom, gl, R.light, { face: faceMaskId, plateau: plateauMaskId }, ns, defs, li);
  });
  if (t.sparkles) {
    const star = (cx: number, cy: number, r: number, rot: number): string => {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.42;
        pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
      }
      return `<path d="M${pts.join("L")}Z" fill="${t.palette.gloss}" opacity="0.95"/>`;
    };
    const gw = geom.x2 - geom.x1, u = size / 150;
    finish +=
      star(geom.x1 + gw * 0.06, geom.y1 + (geom.y2 - geom.y1) * 0.1, 26 * u, 0.3) +
      star(geom.x1 + gw * 0.62, geom.y1 - (geom.y2 - geom.y1) * 0.06, 16 * u, 0.9) +
      star(geom.x2 - gw * 0.03, geom.y1 + (geom.y2 - geom.y1) * 0.55, 11 * u, 1.7);
  }

  /* ── SCENE (exportable background — never a viewport backdrop) ──── */
  const w = Math.round(frame.x2 - frame.x1), h = Math.round(frame.y2 - frame.y1);
  let far = "", fore = "";
  let bgRect = "";
  if (t.scene && t.scene !== "none") {
    bgRect = `<rect x="${frame.x1.toFixed(0)}" y="${frame.y1.toFixed(0)}" width="${w}" height="${h}" fill="${t.palette.stage}"/>`;
    if (t.scene === "burst") {
      const box = { x1: geom.x1, y1: geom.y1, x2: geom.x2, y2: geom.y2, size };
      const layers = buildScene(
        { kind: "comic-burst", ray: "rimc", dot: "capTone", rayCount: 14, rayOpacity: 0.35, dotOpacity: 0.3 },
        frame, box, box, t.palette, seed, defs, ns,
      );
      far = layers.far;
      fore += layers.fore;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${frame.x1.toFixed(0)} ${frame.y1.toFixed(0)} ${w} ${h}">` +
    bgRect +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    far + depth + face.body + fills + patternBody + finish + fore + `</svg>`;
  return { svg, w, h, effWidth: face.width / S };
}
