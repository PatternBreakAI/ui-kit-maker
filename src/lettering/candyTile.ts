/* The candy tile — one compile shared by the Candy Lab page and any
   headless harness. Wraps the Model B2 material (profiled shared-domain
   bevel) with the candy depth construction and optional sparkles.

   The page previews at a low master scale for live typing and exports
   at 16× — same code, different `masterScale`. */

import type { Font } from "opentype.js";
import { typesetRole, toGeom, emitPassMajor } from "./engine";
import type { Frame } from "./engine";
import { resolveDepth } from "./material";
import type { Palette } from "./material";
import { renderBevelB2 } from "./bevelB";
import { scaleRecipe } from "./recipe";
import type { TreatmentRecipe, RoleRecipe } from "./recipe";
import { MATERIALS, DEMO_RIG } from "./materials";

export interface CandyOpts {
  text: string;
  palette: Palette;
  /** ring width request, authored px (the optical limiter may reduce) */
  bevelWidth: number;
  profile: "rounded" | "hard";
  bounce: boolean;
  /** 0 disables the gloss band */
  gloss: number;
  sparkles: boolean;
  /** 4 for live preview, 16 for export */
  masterScale: number;
  seed?: number;
}

export interface CandyTile { svg: string; w: number; h: number; effWidth: number }

/** Candy palettes for the lab — same token shape as the material study. */
export const CANDY_PALETTES: Record<string, Palette> = {
  Bubblegum: MATERIALS.find((m) => m.id === "candy-plastic")!.palette,
  Blueberry: {
    stage: "#E7EEF6", ink: "#101B2E", capTone: "#1F2C55", keyTone: "#EAF3FF",
    f0: "#9FC7FF", f1: "#5E8DF7", f2: "#3054C8", gloss: "#FFFFFF", rimc: "#CFE5FF",
  },
  Mint: {
    stage: "#EAF4EA", ink: "#0F241C", capTone: "#14523F", keyTone: "#EAFFF4",
    f0: "#A9F0CF", f1: "#4FCF9B", f2: "#1E9E6D", gloss: "#FFFFFF", rimc: "#D3FFF0",
  },
  Lemon: {
    stage: "#F7F1DE", ink: "#241C08", capTone: "#6B4E12", keyTone: "#FFF9E3",
    f0: "#FFEE9C", f1: "#FFD44D", f2: "#F0A81D", gloss: "#FFFFFF", rimc: "#FFF6C9",
  },
};

export function renderCandyTile(font: Font, o: CandyOpts): CandyTile {
  const S = o.masterScale;
  const fixture = MATERIALS.find((m) => m.id === "candy-plastic")!;
  const material = {
    ...fixture.material,
    specular: o.gloss > 0.01 && fixture.material.specular
      ? { ...fixture.material.specular, strength: o.gloss }
      : undefined,
  };
  const base: TreatmentRecipe = {
    id: "candy-lab", version: 1, palette: o.palette, light: DEMO_RIG,
    hero: {
      fontFamily: "x", casePolicy: "preserve", size: 150, tracking: 0.012,
      depth: fixture.depth, material,
    } as RoleRecipe,
    composition: { lineGap: 0 }, stage: "stage",
  };
  const R = scaleRecipe(base, S);

  // deterministic id namespace per (text, scale) so several previews can
  // coexist in one document
  let x = 2166136261 >>> 0;
  for (const ch of `${o.text}|${S}|${o.bevelWidth}|${o.profile}`) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  const ns = `cl${x.toString(36)}`;

  const spec = { font, casePolicy: R.hero.casePolicy, size: R.hero.size, tracking: R.hero.tracking };
  const g = toGeom(typesetRole(o.text, spec, o.seed ?? 7).cmds, R.hero.size);
  const pad = R.hero.size * 0.45;
  const frame: Frame = { x1: g.x1 - pad, y1: g.y1 - pad, x2: g.x2 + pad, y2: g.y2 + pad * 1.15 };
  const defs: string[] = [];
  const depth = emitPassMajor(
    [{ geom: g, idp: `${ns}d`, ops: resolveDepth(R.hero.depth, o.palette, R.light, 1) }],
    null, defs, false, frame,
  );
  const face = renderBevelB2(g, R.hero.material, o.palette, R.light, {
    widthReq: o.bevelWidth * S,
    profile: o.profile,
    shading: "directional",
    bounce: o.bounce ? "shadow" : "off",
    bounceTok: o.bounce ? "rimc" : undefined,
    glossSelective: true,
  }, ns, defs, frame);

  let fore = "";
  if (o.sparkles) {
    const star = (cx: number, cy: number, r: number, rot: number): string => {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.42;
        pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
      }
      return `<path d="M${pts.join("L")}Z" fill="${o.palette.gloss}" opacity="0.95"/>`;
    };
    const gw = g.x2 - g.x1, u = R.hero.size / 150;
    fore =
      star(g.x1 + gw * 0.06, g.y1 + (g.y2 - g.y1) * 0.1, 26 * u, 0.3) +
      star(g.x1 + gw * 0.62, g.y1 - (g.y2 - g.y1) * 0.06, 16 * u, 0.9) +
      star(g.x2 - gw * 0.03, g.y1 + (g.y2 - g.y1) * 0.55, 11 * u, 1.7);
  }

  const w = Math.round(frame.x2 - frame.x1), h = Math.round(frame.y2 - frame.y1);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${frame.x1.toFixed(0)} ${frame.y1.toFixed(0)} ${w} ${h}">` +
    `<rect x="${frame.x1.toFixed(0)}" y="${frame.y1.toFixed(0)}" width="${w}" height="${h}" fill="${o.palette.stage}"/>` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") + depth + face.body + fore + `</svg>`;
  return { svg, w, h, effWidth: face.width / S };
}
