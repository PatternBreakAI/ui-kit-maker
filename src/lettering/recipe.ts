/* SPLASH LETTERING ENGINE — the TreatmentRecipe and its compiler.

   A treatment is DATA: palette tokens, a light rig, per-role typography
   + depth + material plans, composition constraints, a scene spec. One
   compiler runs every recipe through the same pipeline:

     INTERPRET → TYPESET → COMPOSE → CONSTRUCT → MATERIALIZE → SCENE → EMIT

   Fonts are referenced by family NAME in the recipe (serializable);
   resolved Font objects are supplied by the caller (app loader or
   headless harness). Same text + recipe + fonts + seed = same art.
   Output modes: full treatment, lettering-only, flat silhouette, and a
   grayscale value read — the last two are the art-direction checks. */

import type { Font } from "opentype.js";
import {
  interpret, typesetRole, toGeom, translateCmds, emitPassMajor,
} from "./engine";
import type { CasePolicy, Rhythm, IRRole } from "./engine";
import {
  resolveDepth, resolveMaterial, grayPalette,
} from "./material";
import type { DepthPlan, MaterialRecipe, LightRig, Palette } from "./material";
import { sceneBurst } from "./scene";
import type { BurstSpec } from "./scene";

/* ── the recipe schema (Phase-1 subset of the full model) ───────── */

export interface RoleRecipe {
  fontFamily: string;
  casePolicy: CasePolicy;
  size: number;
  tracking: number;
  rhythm?: Rhythm;
  shear?: number;
  depth: DepthPlan;
  material: MaterialRecipe;
  /** scales strata counts + shadow travel (kickers carry less depth) */
  depthK?: number;
}

export interface TreatmentRecipe {
  id: string;
  version: number;
  palette: Palette;
  light: LightRig;
  hero: RoleRecipe;
  support?: RoleRecipe;
  composition: {
    /** support width as a fraction of hero width (wood-type measure);
     *  short supports are capped — three letters can't draw the curve
     *  five can */
    widthMatch?: number;
    /** px between support bottom and hero top; negative = tuck */
    lineGap: number;
  };
  scene?: BurstSpec;
  /** stage token (the tile color under everything) */
  stage: string;
}

export interface CompiledLockup {
  svg: string;
  lettering: string;
  silhouette: string;
  grayscale: string;
  w: number;
  h: number;
}

/* ── responsive calm-down (ported, proven) ──────────────────────── */

function calm(role: RoleRecipe, chars: number): RoleRecipe {
  if (chars <= 8) return role;
  const k = chars <= 12 ? 0.7 : 0.5;
  return {
    ...role,
    tracking: role.tracking * 0.6,
    rhythm: role.rhythm ? {
      ...role.rhythm,
      arch: (role.rhythm.arch ?? 0) * k,
      centerScale: (role.rhythm.centerScale ?? 0) * k,
      jitter: (role.rhythm.jitter ?? 0) * 0.7,
    } : undefined,
  };
}

/* ── the compiler ───────────────────────────────────────────────── */

export function compileLockup(
  text: string,
  recipe: TreatmentRecipe,
  fonts: { hero: Font; support?: Font },
  seed = 7,
): CompiledLockup {
  /* INTERPRET */
  const plan = interpret(text);

  /* TYPESET (hero) */
  const heroR = calm(recipe.hero, plan.hero.length);
  const heroSpec = {
    font: fonts.hero, casePolicy: heroR.casePolicy, size: heroR.size,
    tracking: heroR.tracking, rhythm: heroR.rhythm, shear: heroR.shear,
  };
  const hero = typesetRole(plan.hero, heroSpec, seed);

  /* TYPESET (support) + width matching */
  let support: ReturnType<typeof typesetRole> | null = null;
  let supportR: RoleRecipe | null = null;
  let supportSize = 0;
  if (plan.support && recipe.support && fonts.support) {
    supportR = calm(recipe.support, plan.support.length);
    supportSize = supportR.size;
    const mk = (size: number) => typesetRole(plan.support!, {
      font: fonts.support!, casePolicy: supportR!.casePolicy, size,
      tracking: supportR!.tracking, rhythm: supportR!.rhythm, shear: supportR!.shear,
    }, seed + 101);
    support = mk(supportSize);
    if (recipe.composition.widthMatch) {
      /* short supports never stretch to the full measure, and pure
         connective kickers ("THE", "OF") subordinate harder still —
         semantic hierarchy is the compiler's job, not the preset's */
      let cap = Math.min(recipe.composition.widthMatch, 0.3 + 0.16 * plan.support.length);
      if (plan.supportIsStop) cap = Math.min(cap, 0.45);
      const k = (hero.w * cap) / Math.max(1, support.w);
      supportSize *= k;
      /* the other axis of subordination: a short support over a LONG
         hero must not balloon in point size while chasing measure — a
         kicker never out-scales the hero's letters */
      const maxSize = heroR.size * (plan.supportIsStop ? 0.62 : 1.0);
      supportSize = Math.min(supportSize, maxSize);
      support = mk(supportSize);
    }
  }

  /* COMPOSE — hero at origin; support centered above, gap or tuck */
  const heroGeom = toGeom(hero.cmds, heroR.size);
  let supportGeom: ReturnType<typeof toGeom> | null = null;
  if (support && supportR) {
    const raw = toGeom(support.cmds, supportSize);
    const dx = (heroGeom.x1 + heroGeom.x2) / 2 - (raw.x1 + raw.x2) / 2;
    const dy = heroGeom.y1 - recipe.composition.lineGap - raw.y2;
    supportGeom = toGeom(translateCmds(support.cmds, dx, dy), supportSize);
  }

  /* CONSTRUCT + MATERIALIZE — palette-resolved IR ops per role */
  const buildOps = (p: Palette): { roles: IRRole[] } => {
    const roles: IRRole[] = [];
    if (supportGeom && supportR) {
      roles.push({
        geom: supportGeom, idp: "s",
        ops: [
          ...resolveDepth(supportR.depth, p, recipe.light, supportR.depthK ?? 1),
          ...resolveMaterial(supportR.material, p, recipe.light),
        ],
      });
    }
    roles.push({
      geom: heroGeom, idp: "h",
      ops: [
        ...resolveDepth(heroR.depth, p, recipe.light, heroR.depthK ?? 1),
        ...resolveMaterial(heroR.material, p, recipe.light),
      ],
    });
    return { roles };
  };

  /* frame */
  const geoms = [heroGeom, ...(supportGeom ? [supportGeom] : [])];
  const x1 = Math.min(...geoms.map((g) => g.x1));
  const x2 = Math.max(...geoms.map((g) => g.x2));
  const y1 = Math.min(...geoms.map((g) => g.y1));
  const y2 = Math.max(...geoms.map((g) => g.y2));
  const pad = 90;
  const fx1 = x1 - pad, fy1 = y1 - pad;
  const fw = x2 - x1 + pad * 2, fh = y2 - y1 + pad * 2.2;
  const vb = `${fx1.toFixed(0)} ${fy1.toFixed(0)} ${fw.toFixed(0)} ${fh.toFixed(0)}`;
  const w = Math.round(fw), h = Math.round(fh);
  const frame = { x1: fx1, y1: fy1, x2: fx1 + fw, y2: fy1 + fh };
  const wrap = (inner: string, dfs: string[], bg: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">` +
    `<rect x="${fx1.toFixed(0)}" y="${fy1.toFixed(0)}" width="${fw.toFixed(0)}" height="${fh.toFixed(0)}" fill="${bg}"/>` +
    (dfs.length ? `<defs>${dfs.join("")}</defs>` : "") + inner + `</svg>`;

  /* EMIT — full color */
  const pal = recipe.palette;
  const defs: string[] = [];
  const { roles } = buildOps(pal);
  const body = emitPassMajor(roles, null, defs);
  const scene = recipe.scene ? sceneBurst(recipe.scene, frame, pal, seed) : "";
  const svg = wrap(scene + body, defs, pal[recipe.stage] ?? "#FFFFFF");
  const lettering = wrap(body, defs, "#FFFFFF");

  /* EMIT — silhouette (flat ink, no scene, no shadow) */
  const silDefs: string[] = [];
  const silhouette = wrap(emitPassMajor(roles, null, silDefs, true), silDefs, "#FFFFFF");

  /* EMIT — grayscale value read (scene included, palette regraded) */
  const gpal = grayPalette(pal);
  const gDefs: string[] = [];
  const gRoles = buildOps(gpal).roles.map((r) => ({ ...r, idp: `g${r.idp}`, ops: r.ops }));
  const gBody = emitPassMajor(gRoles, null, gDefs);
  const gScene = recipe.scene ? sceneBurst(recipe.scene, frame, gpal, seed) : "";
  const grayscale = wrap(gScene + gBody, gDefs, gpal[recipe.stage] ?? "#FFFFFF");

  return { svg, lettering, silhouette, grayscale, w, h };
}
