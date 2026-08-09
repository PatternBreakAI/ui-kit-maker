/* Vector outlines for Splash Text — the fundamental move: the word becomes
   ONE compound glyph path, so every stroke, body and wrap paints once
   behind the entire word, and distortions bend the word as a single
   object. The text stays editable upstream; outlines regenerate on every
   edit.

   Font bytes ride the SAME pipeline engine exports use (fetchKitFont →
   real TTF/OTF from the google/fonts repo, licence and all), with direct
   raw-URL guesses first so no API rate limit ever gates a render;
   opentype.js only parses. Faces we can't fetch fall back to the <text>
   pipeline.

   Distortion follows the Warp.js approach (MIT) — subdivide curves until
   they're locally flat, then push every point through an envelope
   function — implemented directly on the glyph command list so it needs
   no DOM, works in exports, and stays testable headless. */

import { parse as parseFont, type Font, type Glyph } from "opentype.js";
import { fetchKitFont } from "@/generator/engineExport";

const FONT_CACHE = new Map<string, Promise<Font | null>>();

/** Weight → google/fonts static filename fragment. */
const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular",
  500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

/* Most google/fonts files follow two naming shapes — try those raw URLs
   first (no API call, no rate limit), and only fall back to the API
   directory listing for the long tail. A weight-specific static name is
   tried first so multi-master families (Passion One) load the real cut;
   a curated `ttfHint` (exact repo filename) beats all guessing. */
async function fetchRawGuess(family: string, weight: number, ttfHint?: string): Promise<ArrayBuffer | null> {
  const base = family.replace(/[^A-Za-z0-9]/g, "");
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wname = WEIGHT_NAMES[Math.round(weight / 100) * 100];
  const names = [
    ...(ttfHint ? [ttfHint] : []),
    ...(weight !== 400 && wname ? [`${base}-${wname}.ttf`] : []),
    `${base}-Regular.ttf`, `${base}[wght].ttf`, `${base}[opsz,wght].ttf`, `${base}[wdth,wght].ttf`, `${base}-Bold.ttf`,
  ];
  for (const dir of ["ofl", "apache", "ufl"]) {
    for (const name of names) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/${encodeURIComponent(name)}`);
        if (res.ok) return await res.arrayBuffer();
      } catch { /* next candidate */ }
    }
  }
  return null;
}

/** Variable faces carry their weight for real: opentype.js 2 applies the
 *  `wght` axis to the glyph paths. Static faces got the right file above;
 *  faces without the axis ignore the call. */
function applyWeight(font: Font, weight: number): Font {
  try {
    const axes = (font.tables as { fvar?: { axes?: { tag: string; minValue: number; maxValue: number }[] } }).fvar?.axes;
    const wght = axes?.find((a) => a.tag === "wght");
    // opentype.js 2 ships the variation manager without a type declaration
    const vf = font as Font & { variation?: { set(coords: Record<string, number>): void } };
    if (wght && vf.variation) vf.variation.set({ wght: Math.max(wght.minValue, Math.min(wght.maxValue, weight)) });
  } catch { /* static face or unsupported tables — the default instance stands */ }
  return font;
}

export function loadOutlineFont(family: string, weight = 400, ttfHint?: string): Promise<Font | null> {
  const key = `${family}#${weight}`;
  let p = FONT_CACHE.get(key);
  if (!p) {
    p = (async () => {
      try {
        const raw = await fetchRawGuess(family, weight, ttfHint);
        if (raw) return applyWeight(parseFont(raw), weight);
        const kf = await fetchKitFont(family);
        if (!kf) return null;
        const buf = kf.bytes.buffer.slice(kf.bytes.byteOffset, kf.bytes.byteOffset + kf.bytes.byteLength);
        return applyWeight(parseFont(buf), weight);
      } catch {
        return null;
      }
    })();
    FONT_CACHE.set(key, p);
  }
  return p;
}

export type WordOutline = {
  d: string; w: number; dy: number; minY?: number; maxY?: number;
  /** per-glyph hit boxes in the SAME local coords as `d`, each carrying
   *  its global glyph index (the letterScales/tilt counter) — the canvas
   *  hit-tests these so a click lands on ONE letter */
  glyphs?: { gi: number; x1: number; y1: number; x2: number; y2: number }[];
};

/** Whole-word shape — envelope distortion (the block bends as ONE
 *  object; arc/bulge -1..1, rotate degrees) plus multiline layout:
 *  lineHeight in em (default 1.1) and per-line alignment.
 *
 *  fit "column": the instant typography poster — every line scales
 *  UNIFORMLY to one shared measure (the wood-type rule: width grows with
 *  height), so short words go huge and the stack packs into a brick.
 *
 *  groove 0..1: the 60s move (Wilson school) — lines swell and squeeze
 *  vertically while the measure stays pinned; adjacent lines share wavy
 *  boundary curves so they nest into each other, block edges straight. */
export type WordFx = {
  arc?: number; bulge?: number; rotate?: number;
  lineHeight?: number; align?: "left" | "center" | "right";
  fit?: "none" | "column";
  groove?: number;
  /** per-letter size multipliers, indexed by the global glyph counter
   *  (same indexing as tilt: blank lines advance it by one). Scaling is
   *  baseline-anchored and feeds the advances, so neighbors flow around
   *  a resized letter instead of overlapping it. */
  letterScales?: number[];
};

// the engine's letter-tilt pattern, mirrored so the slider means the same
// thing in outline mode and text mode
const ROTS = [-5, 4, -3, 5, -4, 3, -6, 4, -3, 5];
const BOB = [0, -0.045, 0.03, -0.04, 0.045, -0.03, 0.04, -0.045, 0.03, -0.04];

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

const cmdToD = (cmds: Cmd[]): string =>
  cmds.map((c) =>
    c.type === "M" ? `M${c.x!.toFixed(2)} ${c.y!.toFixed(2)}`
    : c.type === "L" ? `L${c.x!.toFixed(2)} ${c.y!.toFixed(2)}`
    : c.type === "C" ? `C${c.x1!.toFixed(2)} ${c.y1!.toFixed(2)} ${c.x2!.toFixed(2)} ${c.y2!.toFixed(2)} ${c.x!.toFixed(2)} ${c.y!.toFixed(2)}`
    : c.type === "Q" ? `Q${c.x1!.toFixed(2)} ${c.y1!.toFixed(2)} ${c.x!.toFixed(2)} ${c.y!.toFixed(2)}`
    : "Z",
  ).join("");

const mapCmds = (cmds: Cmd[], fn: (x: number, y: number) => [number, number]): Cmd[] =>
  cmds.map((c) => {
    const o: Cmd = { type: c.type };
    if (c.x !== undefined) [o.x, o.y] = fn(c.x, c.y!);
    if (c.x1 !== undefined) [o.x1, o.y1] = fn(c.x1, c.y1!);
    if (c.x2 !== undefined) [o.x2, o.y2] = fn(c.x2, c.y2!);
    return o;
  });

/** Flatten curve commands to polyline points at roughly `step` chord
 *  length — envelope functions are nonlinear, so control points alone
 *  would distort wrongly; locally-flat segments bend true. */
function flatten(cmds: Cmd[], step: number): Cmd[] {
  const out: Cmd[] = [];
  let px = 0, py = 0;
  const emit = (x: number, y: number) => out.push({ type: "L", x, y });
  for (const c of cmds) {
    if (c.type === "M") { out.push({ ...c }); px = c.x!; py = c.y!; continue; }
    if (c.type === "Z") { out.push({ type: "Z" }); continue; }
    if (c.type === "L") { emit(c.x!, c.y!); px = c.x!; py = c.y!; continue; }
    // sample curves by control-net length
    const pts: [number, number][] = c.type === "C"
      ? [[px, py], [c.x1!, c.y1!], [c.x2!, c.y2!], [c.x!, c.y!]]
      : [[px, py], [c.x1!, c.y1!], [c.x!, c.y!]];
    let net = 0;
    for (let i = 1; i < pts.length; i++) net += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const n = Math.max(2, Math.ceil(net / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (c.type === "C") {
        const mt = 1 - t;
        emit(
          mt * mt * mt * px + 3 * mt * mt * t * c.x1! + 3 * mt * t * t * c.x2! + t * t * t * c.x!,
          mt * mt * mt * py + 3 * mt * mt * t * c.y1! + 3 * mt * t * t * c.y2! + t * t * t * c.y!,
        );
      } else {
        const mt = 1 - t;
        emit(mt * mt * px + 2 * mt * t * c.x1! + t * t * c.x!, mt * mt * py + 2 * mt * t * c.y1! + t * t * c.y!);
      }
    }
    px = c.x!; py = c.y!;
  }
  return out;
}

type LaidGlyph = { cmds: Cmd[]; penX: number; adv: number; center: number };

/** Some faces' GSUB lookups crash opentype.js 2's shaper outright
 *  (Bangers: "lookupType 6 substFormat 2 is not yet supported"). Fall
 *  back to 1:1 charToGlyph — ligatures are lost, the word is not. */
function toGlyphs(font: Font, text: string): Glyph[] {
  try {
    return font.stringToGlyphs(text);
  } catch {
    return [...text].map((ch) => font.charToGlyph(ch));
  }
}

/** Kerned glyph layout at baseline y=0, pen from x=0. Per-glyph size
 *  multipliers (letterScales, addressed from `gi0`) scale the glyph AND
 *  its advance, baseline-anchored, so the line reflows around edits. */
function layout(font: Font, text: string, size: number, spacingEm: number, scales?: number[], gi0 = 0): { glyphs: LaidGlyph[]; w: number } {
  const glyphs = toGlyphs(font, text);
  const track = spacingEm * size;
  const out: LaidGlyph[] = [];
  let pen = 0;
  let prev: Glyph | null = null;
  glyphs.forEach((g, i) => {
    const sc = Math.max(0.2, Math.min(4, scales?.[gi0 + i] ?? 1));
    const scale = (size * sc) / font.unitsPerEm;
    if (prev) pen += font.getKerningValue(prev, g) * (size / font.unitsPerEm);
    const adv = (g.advanceWidth ?? font.unitsPerEm * 0.5) * scale;
    const cmds = (g.getPath(pen, 0, size * sc).commands as Cmd[]) ?? [];
    out.push({ cmds, penX: pen, adv, center: pen + adv / 2 });
    pen += adv + track;
    prev = g;
  });
  return { glyphs: out, w: Math.max(1, pen - track) };
}

/** Shift from the dominant-central anchor down to the baseline — matches
 *  how browsers center <text dominant-baseline="central">. */
export const centralShift = (font: Font, size: number): number =>
  ((font.ascender + font.descender) / 2) * (size / font.unitsPerEm);

const boundsOf = (cmds: Cmd[]) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cmds) {
    if (c.x !== undefined) {
      if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
      if (c.y! < minY) minY = c.y!; if (c.y! > maxY) maxY = c.y!;
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  return { minX, maxX, minY, maxY };
};

/** The whole block — one word or many lines (Return respected) — as ONE
 *  compound path: per-glyph tilt baked in, then the envelope (arc/bulge)
 *  and in-plane rotation over the entire block, which bends and turns as
 *  a single object. Normalized to x from 0 and vertical CENTER at y=0
 *  (dy 0), so the engine's central anchor lands the block correctly at
 *  any line count. */
export function flatWordOutline(font: Font, text: string, size: number, spacingEm: number, tiltK: number, fx?: WordFx): WordOutline {
  const lines = text.split("\n");
  const lh = (fx?.lineHeight ?? 1.1) * size;
  const align = fx?.align ?? "center";
  // the global glyph counter starts where each line starts — blank lines
  // advance it by one so letterScales/tilt indexing survives empty rows
  const giStarts: number[] = [];
  {
    let g0 = 0;
    for (const ln of lines) { giStarts.push(g0); g0 += Math.max(1, toGlyphs(font, ln).length); }
  }
  const laid = lines.map((ln, li) => layout(font, ln, size, spacingEm, fx?.letterScales, giStarts[li]));
  const nonEmpty = laid.filter((l) => l.glyphs.length).length;
  const fit = fx?.fit === "column" && nonEmpty > 1;
  const groove = Math.min(1, Math.max(0, fx?.groove ?? 0));

  // the shared measure: widest line as set (fit scales the others up to it)
  const blockW = Math.max(...laid.map((l) => l.w), 1);

  /* per-line assembly at local baseline 0, kept PER GLYPH the whole way
     (every later op is a point map, so glyph identity survives — that's
     what makes the canvas click land on one letter). Glyph tilt first
     (it scales with the line, like everything hand-lettered), then the
     column fit's uniform per-line scale, capped so a lone punctuation
     line can't explode the block */
  const placed: Cmd[][][] = [];  // lines → glyphs → cmds
  const gis: number[][] = [];    // parallel global glyph indices
  const scales: number[] = [];
  laid.forEach((line, li) => {
    let gi = giStarts[li];
    const lineGlyphs: Cmd[][] = [];
    const lineGis: number[] = [];
    for (const g of line.glyphs) {
      let gc = g.cmds;
      if (tiltK > 0) {
        const a = (ROTS[gi % 10] * tiltK * 1.6 * Math.PI) / 180;
        const dy = BOB[gi % 10] * size * tiltK * 1.4;
        const cs = Math.cos(a), sn = Math.sin(a);
        const cx = g.center;
        gc = mapCmds(gc, (px, py) => {
          const lx = px - cx, ly = py;
          return [cx + lx * cs - ly * sn, dy + lx * sn + ly * cs];
        });
      }
      lineGlyphs.push(gc);
      lineGis.push(gi);
      gi++;
    }
    const s = fit && line.glyphs.length && line.w > 1 ? Math.min(8, blockW / line.w) : 1;
    placed.push(s !== 1 ? lineGlyphs.map((gc) => mapCmds(gc, (px, py) => [px * s, py * s])) : lineGlyphs);
    gis.push(lineGis);
    scales.push(s);
  });

  // vertical stacking — each line advances by its OWN scaled body, so the
  // fitted block packs like a wood-type brick; horizontal placement per
  // alignment (fit lines all span the measure already)
  let baseline = 0;
  placed.forEach((lineGlyphs, li) => {
    if (li > 0) baseline += lh * scales[li];
    const lw = laid[li].w * scales[li];
    const xOff = fit ? 0 : align === "left" ? 0 : align === "right" ? blockW - lw : (blockW - lw) / 2;
    const b2 = baseline;
    placed[li] = lineGlyphs.map((gc) => mapCmds(gc, (px, py) => [px + xOff, py + b2]));
  });

  /* the groove: per-line vertical remap between shared boundary curves.
     Boundary j (between lines j-1 and j) bows by A_j·(1−u²), directions
     alternating, so one line's swell IS the next line's squeeze — they
     nest. Outer block edges stay pinned: the container is the point. */
  if (groove > 0.005 && nonEmpty > 1) {
    const lb = placed.map((lg) => boundsOf(lg.flat()));
    const n = placed.length;
    const T: number[] = [], B: number[] = [];
    for (let i = 0; i < n; i++) {
      T[i] = i === 0 ? lb[0].minY : (lb[i - 1].maxY + lb[i].minY) / 2;
      B[i] = i === n - 1 ? lb[n - 1].maxY : (lb[i].maxY + lb[i + 1].minY) / 2;
    }
    const amp: number[] = [];
    for (let j = 0; j <= n; j++) {
      if (j === 0 || j === n) { amp[j] = 0; continue; } // block edges pinned
      const above = B[j - 1] - T[j - 1], below = B[j] - T[j];
      amp[j] = groove * 0.42 * Math.min(above, below) * (j % 2 ? 1 : -1);
    }
    for (let i = 0; i < n; i++) {
      if (!placed[i].length) continue;
      const span = Math.max(1, B[i] - T[i]);
      const remap = (px: number, py: number): [number, number] => {
        const u = Math.max(-1, Math.min(1, (2 * px) / blockW - 1));
        const env = 1 - u * u;
        const top = T[i] + amp[i] * env;
        const bot = B[i] + amp[i + 1] * env;
        const v = (py - T[i]) / span;
        return [px, top + v * (bot - top)];
      };
      placed[i] = placed[i].map((gc) => mapCmds(flatten(gc, size / 22), remap));
    }
  }

  // flatten line structure → one glyph list with global indices
  let glyphCmds: Cmd[][] = placed.flat();
  const glyphGis: number[] = gis.flat();

  const arc = fx?.arc ?? 0, bulge = fx?.bulge ?? 0, rot = fx?.rotate ?? 0;
  const b0 = boundsOf(glyphCmds.flat());
  if (Math.abs(arc) > 0.005 || Math.abs(bulge) > 0.005) {
    // nonlinear envelope over the whole block — flatten so segments bend true
    const midY = (b0.minY + b0.maxY) / 2;
    const span = Math.max(1, b0.maxX - b0.minX);
    const env2 = (px: number, py: number): [number, number] => {
      const u = (2 * (px - b0.minX)) / span - 1; // -1 block start, +1 block end
      const env = 1 - u * u;
      let y2 = py;
      if (bulge) y2 = midY + (y2 - midY) * (1 + bulge * 0.55 * env);
      if (arc) y2 -= arc * size * 0.75 * env;
      return [px, y2];
    };
    glyphCmds = glyphCmds.map((gc) => mapCmds(flatten(gc, size / 22), env2));
  }
  if (Math.abs(rot) > 0.05) {
    const a = (rot * Math.PI) / 180;
    const cs = Math.cos(a), sn = Math.sin(a);
    const cx = (b0.minX + b0.maxX) / 2, cy0 = (b0.minY + b0.maxY) / 2;
    glyphCmds = glyphCmds.map((gc) => mapCmds(gc, (px, py) => {
      const lx = px - cx, ly = py - cy0;
      return [cx + lx * cs - ly * sn, cy0 + lx * sn + ly * cs];
    }));
  }

  // normalize: x from 0, vertical center at 0; report the reach and the
  // per-glyph boxes (same coords as d) for canvas hit-testing
  const b = boundsOf(glyphCmds.flat());
  const cy = (b.minY + b.maxY) / 2;
  glyphCmds = glyphCmds.map((gc) => mapCmds(gc, (px, py) => [px - b.minX, py - cy]));
  const glyphs = glyphCmds.map((gc, i) => {
    const gb = boundsOf(gc);
    return { gi: glyphGis[i], x1: gb.minX, y1: gb.minY, x2: gb.maxX, y2: gb.maxY };
  });
  return { d: glyphCmds.map(cmdToD).join(""), w: b.maxX - b.minX, dy: 0, minY: b.minY - cy, maxY: b.maxY - cy, glyphs };
}
