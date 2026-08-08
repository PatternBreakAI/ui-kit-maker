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

/* Most google/fonts files follow two naming shapes — try those raw URLs
   first (no API call, no rate limit), and only fall back to the API
   directory listing for the long tail. */
async function fetchRawGuess(family: string): Promise<ArrayBuffer | null> {
  const base = family.replace(/[^A-Za-z0-9]/g, "");
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = [`${base}-Regular.ttf`, `${base}[wght].ttf`, `${base}[opsz,wght].ttf`, `${base}[wdth,wght].ttf`, `${base}-Bold.ttf`];
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

export function loadOutlineFont(family: string): Promise<Font | null> {
  let p = FONT_CACHE.get(family);
  if (!p) {
    p = (async () => {
      try {
        const raw = await fetchRawGuess(family);
        if (raw) return parseFont(raw);
        const kf = await fetchKitFont(family);
        if (!kf) return null;
        const buf = kf.bytes.buffer.slice(kf.bytes.byteOffset, kf.bytes.byteOffset + kf.bytes.byteLength);
        return parseFont(buf);
      } catch {
        return null;
      }
    })();
    FONT_CACHE.set(family, p);
  }
  return p;
}

export type WordOutline = { d: string; w: number; dy: number; minY?: number; maxY?: number };

/** Whole-word shape — envelope distortion (the block bends as ONE
 *  object; arc/bulge -1..1, rotate degrees) plus multiline layout:
 *  lineHeight in em (default 1.1) and per-line alignment. */
export type WordFx = {
  arc?: number; bulge?: number; rotate?: number;
  lineHeight?: number; align?: "left" | "center" | "right";
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

/** Kerned glyph layout at baseline y=0, pen from x=0. */
function layout(font: Font, text: string, size: number, spacingEm: number): { glyphs: LaidGlyph[]; w: number } {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const track = spacingEm * size;
  const out: LaidGlyph[] = [];
  let pen = 0;
  let prev: Glyph | null = null;
  glyphs.forEach((g) => {
    if (prev) pen += font.getKerningValue(prev, g) * scale;
    const adv = (g.advanceWidth ?? font.unitsPerEm * 0.5) * scale;
    const cmds = (g.getPath(pen, 0, size).commands as Cmd[]) ?? [];
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
  const laid = lines.map((ln) => layout(font, ln, size, spacingEm));
  const blockW = Math.max(...laid.map((l) => l.w), 1);

  let all: Cmd[] = [];
  let gi = 0; // tilt pattern runs across the whole block
  laid.forEach((line, li) => {
    const xOff = align === "left" ? 0 : align === "right" ? blockW - line.w : (blockW - line.w) / 2;
    const yOff = li * lh;
    for (const g of line.glyphs) {
      let cmds = g.cmds;
      if (tiltK > 0) {
        const a = (ROTS[gi % 10] * tiltK * 1.6 * Math.PI) / 180;
        const dy = BOB[gi % 10] * size * tiltK * 1.4;
        const cs = Math.cos(a), sn = Math.sin(a);
        const cx = g.center;
        cmds = mapCmds(cmds, (px, py) => {
          const lx = px - cx, ly = py;
          return [cx + lx * cs - ly * sn, dy + lx * sn + ly * cs];
        });
      }
      all.push(...mapCmds(cmds, (px, py) => [px + xOff, py + yOff]));
      gi++;
    }
    if (!line.glyphs.length) gi++; // blank lines still advance the pattern
  });

  const arc = fx?.arc ?? 0, bulge = fx?.bulge ?? 0, rot = fx?.rotate ?? 0;
  const b0 = boundsOf(all);
  if (Math.abs(arc) > 0.005 || Math.abs(bulge) > 0.005) {
    // nonlinear envelope over the whole block — flatten so segments bend true
    all = flatten(all, size / 22);
    const midY = (b0.minY + b0.maxY) / 2;
    const span = Math.max(1, b0.maxX - b0.minX);
    all = mapCmds(all, (px, py) => {
      const u = (2 * (px - b0.minX)) / span - 1; // -1 block start, +1 block end
      const env = 1 - u * u;
      let y2 = py;
      if (bulge) y2 = midY + (y2 - midY) * (1 + bulge * 0.55 * env);
      if (arc) y2 -= arc * size * 0.75 * env;
      return [px, y2];
    });
  }
  if (Math.abs(rot) > 0.05) {
    const a = (rot * Math.PI) / 180;
    const cs = Math.cos(a), sn = Math.sin(a);
    const cx = (b0.minX + b0.maxX) / 2, cy0 = (b0.minY + b0.maxY) / 2;
    all = mapCmds(all, (px, py) => {
      const lx = px - cx, ly = py - cy0;
      return [cx + lx * cs - ly * sn, cy0 + lx * sn + ly * cs];
    });
  }

  // normalize: x from 0, vertical center at 0; report the reach
  const b = boundsOf(all);
  const cy = (b.minY + b.maxY) / 2;
  all = mapCmds(all, (px, py) => [px - b.minX, py - cy]);
  return { d: cmdToD(all), w: b.maxX - b.minX, dy: 0, minY: b.minY - cy, maxY: b.maxY - cy };
}
