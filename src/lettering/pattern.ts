/* SPLASH LETTERING ENGINE — patterns that interact with light.

   A PatternSpec is not wallpaper clipped into the type: its mask source
   ties it to the rig. "light-side"/"shadow-side" masks are gradients
   along the key-light axis; "bevel" confines the tile to the chamfer
   ring; "wall" confines it to the depth band. All SVG 1.1: <pattern>
   tiles + <mask> with userSpaceOnUse geometry, no filters, no CSS.

   The four-point AI star is banned house-wide; the sparkle tile uses a
   five-point star. */

import { mulberry32 } from "./engine";
import type { Frame, Geom, IROp, RenderPass } from "./engine";
import { inflateOutline } from "@/generator/extrude";
import type { LightRig } from "./material";
import { tok, lightVec, depthVec } from "./material";
import type { Palette } from "./material";

export interface PatternSpec {
  type: "dots" | "halftone" | "stripes" | "checker" | "grain" | "sparkle";
  /** palette tokens, 1–4 (first is the ink) */
  colors: string[];
  /** tile size in px — in "glyph" space, a FRACTION of the glyph box */
  scale: number;
  /** "composition" (default): one continuous field in canvas space;
   *  "glyph": the tile is sized to each letter's own box, so the
   *  pattern re-fits every glyph */
  space?: "composition" | "glyph";
  angle?: number;
  /** 0..1 — coverage inside the tile */
  density?: number;
  opacity?: number;
  /** phase offset in px */
  offsetX?: number;
  offsetY?: number;
  /** where the pattern is allowed to exist */
  mask?: "full" | "light-side" | "shadow-side" | "bevel" | "wall";
  /** bevel-mask ring width / wall-mask travel, px */
  maskWidth?: number;
  /** render pass (default "material" — over the face, under highlights) */
  pass?: RenderPass;
  /** contract the painted region (stay inside a keyline) */
  inset?: number;
}

/** five-point star path centered at (cx,cy) — NOT the four-point AI star */
const star5 = (cx: number, cy: number, r: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
};

function tile(spec: PatternSpec, p: Palette, id: string, seed: number): string {
  const s = spec.scale;
  const ink = tok(p, spec.colors[0]);
  const ink2 = spec.colors[1] ? tok(p, spec.colors[1]) : ink;
  const den = spec.density ?? 0.5;
  const rot = spec.angle ? ` patternTransform="rotate(${spec.angle.toFixed(1)})"` : "";
  const off = spec.offsetX || spec.offsetY ? ` x="${(spec.offsetX ?? 0).toFixed(1)}" y="${(spec.offsetY ?? 0).toFixed(1)}"` : "";
  // glyph space: tile + content both live in the element's bounding box,
  // so the pattern re-fits every letter it paints
  const glyphSpace = spec.space === "glyph";
  const open = glyphSpace
    ? `<pattern id="${id}" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="${s}" height="${s}"${rot}>`
    : `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}"${off}${rot}>`;
  const r = mulberry32(seed ^ 0x9a77);
  let body = "";
  switch (spec.type) {
    case "dots":
    case "halftone": {
      const dr = s * 0.5 * Math.sqrt(Math.max(0.02, den));
      body = `<circle cx="${(s / 2).toFixed(1)}" cy="${(s / 2).toFixed(1)}" r="${dr.toFixed(2)}" fill="${ink}"/>`;
      break;
    }
    case "stripes": {
      // in glyph space every length is a bbox fraction — no px clamp
      const w = glyphSpace ? s * den : Math.max(0.5, s * den);
      body = `<rect x="0" y="0" width="${w.toFixed(3)}" height="${s}" fill="${ink}"/>`;
      break;
    }
    case "checker": {
      const h = s / 2;
      body = `<rect x="0" y="0" width="${h}" height="${h}" fill="${ink}"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${ink2 === ink ? ink : ink2}"/>`;
      break;
    }
    case "grain": {
      const n = Math.round(6 + den * 18);
      for (let i = 0; i < n; i++) {
        // speck size rides the tile so grain stays visible at any scale
        body += `<circle cx="${(r() * s).toFixed(1)}" cy="${(r() * s).toFixed(1)}" r="${(s * (0.035 + r() * 0.055)).toFixed(2)}" fill="${r() > 0.5 ? ink : ink2}"/>`;
      }
      break;
    }
    case "sparkle": {
      body = `<path d="${star5(s * 0.3, s * 0.32, s * 0.17 * (0.5 + den))}" fill="${ink}"/>` +
        `<circle cx="${(s * 0.74).toFixed(1)}" cy="${(s * 0.68).toFixed(1)}" r="${(s * 0.05).toFixed(2)}" fill="${ink2}"/>` +
        `<circle cx="${(s * 0.62).toFixed(1)}" cy="${(s * 0.2).toFixed(1)}" r="${(s * 0.033).toFixed(2)}" fill="${ink2}"/>`;
      break;
    }
  }
  return open + body + `</pattern>`;
}

/** Build the mask geometry for a pattern op. White reveals. */
function maskDef(
  spec: PatternSpec, id: string, geom: Geom, frame: Frame, rig: LightRig,
): string | null {
  const kind = spec.mask ?? "full";
  if (kind === "full") return null;
  const open = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${(frame.x1 - 50).toFixed(0)}" y="${(frame.y1 - 50).toFixed(0)}" width="${(frame.x2 - frame.x1 + 100).toFixed(0)}" height="${(frame.y2 - frame.y1 + 100).toFixed(0)}">`;
  const bg = `<rect x="${(frame.x1 - 50).toFixed(0)}" y="${(frame.y1 - 50).toFixed(0)}" width="${(frame.x2 - frame.x1 + 100).toFixed(0)}" height="${(frame.y2 - frame.y1 + 100).toFixed(0)}"`;
  if (kind === "light-side" || kind === "shadow-side") {
    // the modulation the halftone workflow wants: a value ramp along the
    // key axis governs where the tile may live
    const [dx, dy] = lightVec(rig.key.angle);
    const cx = (geom.x1 + geom.x2) / 2, cy = (geom.y1 + geom.y2) / 2;
    const rx = (geom.x2 - geom.x1) / 2, ry = (geom.y2 - geom.y1) / 2;
    const ex = Math.abs(dx) * rx + Math.abs(dy) * ry;
    const lit = kind === "light-side";
    const gid = `${id}gr`;
    return open +
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${(cx + dx * ex).toFixed(1)}" y1="${(cy + dy * ex).toFixed(1)}" x2="${(cx - dx * ex).toFixed(1)}" y2="${(cy - dy * ex).toFixed(1)}">` +
      `<stop offset="0" stop-color="${lit ? "#FFFFFF" : "#000000"}"/><stop offset="1" stop-color="${lit ? "#000000" : "#FFFFFF"}"/></linearGradient>` +
      `${bg} fill="url(#${gid})"/></mask>`;
  }
  if (kind === "bevel") {
    // ring between the silhouette and its contraction
    const w = spec.maskWidth ?? 6;
    return open + `${bg} fill="#000"/>` +
      `<path d="${geom.d}" fill="#FFF"/>` +
      `<path d="${inflateOutline(geom.polys, -w, geom.groups)}" fill="#000"/></mask>`;
  }
  if (kind === "wall") {
    // the depth band: silhouette swept along the travel, minus the front
    const w = spec.maskWidth ?? 12;
    const [dx, dy] = depthVec(rig);
    let sweep = "";
    const steps = Math.max(2, Math.round(w / 2));
    for (let i = 1; i <= steps; i++) {
      sweep += `<g transform="translate(${(dx * (w * i) / steps).toFixed(2)} ${(dy * (w * i) / steps).toFixed(2)})"><path d="${geom.d}" fill="#FFF"/></g>`;
    }
    return open + `${bg} fill="#000"/>` + sweep + `<path d="${geom.d}" fill="#000"/></mask>`;
  }
  return null;
}

let patternSerial = 0;
/** for deterministic ids across compiles */
export const resetPatternIds = (): void => { patternSerial = 0; };

/** PatternSpec → an IR op painting the tile over the geometry, masked by
 *  the light where asked. `ns` namespaces the def ids so several
 *  compiled lockups can share one HTML document without id collisions. */
export function resolvePattern(
  spec: PatternSpec, p: Palette, rig: LightRig, geom: Geom, frame: Frame, seed: number, ns = "",
): IROp {
  const id = `${ns}pt${patternSerial++}`;
  const rawDefs = [tile(spec, p, id, seed)];
  const mk = maskDef(spec, `${id}m`, geom, frame, rig);
  if (mk) rawDefs.push(mk);
  return {
    expand: spec.inset ? -spec.inset : undefined,
    paint: `url(#${id})`,
    opacity: spec.opacity,
    pass: spec.pass ?? "material",
    rawDefs,
    mask: mk ? `${id}m` : undefined,
    perGlyph: spec.space === "glyph" || undefined,
  };
}
