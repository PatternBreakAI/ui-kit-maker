/* Vector outlines for Type Maker — the fundamental move: the word becomes
   ONE compound glyph path, so every stroke, body and wrap paints once
   behind the entire word, and posed words keep true letterforms. The text
   stays editable upstream; outlines regenerate on every edit.

   Font bytes ride the SAME pipeline engine exports use (fetchKitFont →
   real TTF/OTF from the google/fonts repo, licence and all); opentype.js
   only parses. Faces we can't fetch fall back to the <text> pipeline. */

import { parse as parseFont, type Font, type Glyph } from "opentype.js";
import { fetchKitFont } from "@/generator/engineExport";
import type { LetterPlacement } from "./pose";

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

type LaidGlyph = { cmds: Cmd[]; penX: number; adv: number; center: number };

/** Kerned glyph layout at baseline y=0, pen from x=0 — the shared ground
 *  truth for the flat word, the posed word, and pose placement widths. */
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

/** The flat word as one compound path, letter tilt baked into the glyphs. */
export function flatWordOutline(font: Font, text: string, size: number, spacingEm: number, tiltK: number): WordOutline {
  const { glyphs, w } = layout(font, text, size, spacingEm);
  const all: Cmd[] = [];
  glyphs.forEach((g, i) => {
    let cmds = g.cmds;
    if (tiltK > 0) {
      const a = (ROTS[i % 10] * tiltK * 1.6 * Math.PI) / 180;
      const dy = BOB[i % 10] * size * tiltK * 1.4;
      const cs = Math.cos(a), sn = Math.sin(a);
      const cx = g.center;
      cmds = mapCmds(cmds, (px, py) => {
        const lx = px - cx, ly = py;
        return [cx + lx * cs - ly * sn, dy + lx * sn + ly * cs];
      });
    }
    all.push(...cmds);
  });
  return { d: cmdToD(all), w, dy: centralShift(font, size) };
}

/** Advance widths for pose placement — same layout as the outlines, so
 *  the projected frames and the baked geometry always agree. */
export function outlineWidths(font: Font, text: string, size: number, spacingEm: number): number[] {
  return layout(font, text, size, spacingEm).glyphs.map((g) => g.adv);
}

/** The posed word: every glyph's outline pushed through its letter's
 *  projected affine, merged into ONE path normalized to pen-start x=0 and
 *  word-center y=0. One path in → the whole engine treatment (stroke
 *  behind, body, sticker, gloss, glints) wraps the posed word as a unit. */
export function posedWordOutline(font: Font, text: string, size: number, spacingEm: number, tiltK: number, placements: LetterPlacement[]): WordOutline {
  const { glyphs } = layout(font, text, size, spacingEm);
  const co = centralShift(font, size);
  const all: Cmd[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  // placements arrive painter-sorted (far first) — keep that order so the
  // near letters' fills sit above far letters inside the compound path
  for (const p of placements) {
    const g = glyphs[p.i];
    if (!g || !g.cmds.length) continue;
    let cmds = g.cmds;
    if (tiltK > 0) {
      const a = (ROTS[p.i % 10] * tiltK * 1.6 * Math.PI) / 180;
      const dy = BOB[p.i % 10] * size * tiltK * 1.4;
      const cs = Math.cos(a), sn = Math.sin(a);
      const cx = g.center;
      cmds = mapCmds(cmds, (px, py) => {
        const lx = px - cx, ly = py;
        return [cx + lx * cs - ly * sn, dy + lx * sn + ly * cs];
      });
    }
    const [a2, b2, c2, d2, e2, f2] = p.m;
    cmds = mapCmds(cmds, (px, py) => {
      // glyph local frame: advance center on x, central line on y
      const lx = px - g.center, ly = py - co;
      return [a2 * lx + c2 * ly + e2, b2 * lx + d2 * ly + f2];
    });
    for (const c of cmds) {
      if (c.x !== undefined) {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y! < minY) minY = c.y!; if (c.y! > maxY) maxY = c.y!;
      }
    }
    all.push(...cmds);
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const shifted = mapCmds(all, (px, py) => [px - minX, py]);
  return { d: cmdToD(shifted), w: maxX - minX, dy: 0, minY, maxY };
}
