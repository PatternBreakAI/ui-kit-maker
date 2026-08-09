/* SPLASH LETTERING ENGINE — the TreatmentRecipe and its compiler.

   A treatment is DATA: palette tokens, a light rig, per-role typography
   + depth + material + pattern plans, composition constraints (including
   a composition-scoped badge construction), a scene spec. One compiler
   runs every recipe through the same pipeline:

     INTERPRET → TYPESET → COMPOSE → CONSTRUCT → MATERIALIZE → SCENE → EMIT

   Fonts are referenced by family NAME in the recipe (serializable);
   resolved Font objects are supplied by the caller (app loader or
   headless harness). Same text + recipe + fonts + seed = same art.
   Emit modes: full treatment, lettering-only, flat silhouette, and a
   grayscale value read — the last two are the art-direction checks. */

import type { Font } from "opentype.js";
import {
  interpret, typesetRole, toGeom, translateCmds, emitPassMajor,
} from "./engine";
import type { CasePolicy, Rhythm, IRRole, Frame } from "./engine";
import {
  resolveDepth, resolveMaterial, grayPalette,
} from "./material";
import type { DepthPlan, MaterialRecipe, LightRig, Palette } from "./material";
import { resolvePattern, resetPatternIds } from "./pattern";
import type { PatternSpec } from "./pattern";
import { buildScene } from "./scene";
import type { SceneSpec, HeroBox } from "./scene";

/* ── the recipe schema ──────────────────────────────────────────── */

export interface RoleRecipe {
  fontFamily: string;
  casePolicy: CasePolicy;
  size: number;
  tracking: number;
  rhythm?: Rhythm;
  shear?: number;
  depth: DepthPlan;
  material: MaterialRecipe;
  /** face patterns (masked by the light where the spec says so) */
  patterns?: PatternSpec[];
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
    /** max connective-kicker point size as a fraction of hero size
     *  (the "article never dominates" rule; default 0.35) */
    stopScale?: number;
    /** composition-scoped construction on the UNION silhouette — the
     *  unified badge: one sticker contour, one cast shadow, one keyline
     *  around the whole lockup */
    badge?: DepthPlan;
  };
  scene?: SceneSpec;
  /** stage token (the tile color under everything) */
  stage: string;
  /** Creative Director pre-implementation declarations (documentation
   *  as data: hierarchy, silhouette, layer order, material, light,
   *  gradient/pattern, ornament) */
  direction?: Record<string, string>;
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
  resetPatternIds();

  /* deterministic id namespace — several compiled lockups can share one
   *  HTML document (galleries, sheets) without def collisions */
  const ns = (() => {
    let x = 2166136261 >>> 0;
    const s = `${recipe.id}|${text}|${seed}`;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(36);
  })();

  /* INTERPRET */
  const plan = interpret(text);

  /* TYPESET (hero) */
  const heroR = calm(recipe.hero, plan.hero.length);
  const heroSpec = {
    font: fonts.hero, casePolicy: heroR.casePolicy, size: heroR.size,
    tracking: heroR.tracking, rhythm: heroR.rhythm, shear: heroR.shear,
  };
  const hero = typesetRole(plan.hero, heroSpec, seed);

  /* TYPESET (support) + width matching + subordination clamps */
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
         hero must not balloon in point size while chasing measure — an
         article stays a small kicker (≤35% of hero height by default) */
      const maxSize = heroR.size * (plan.supportIsStop ? (recipe.composition.stopScale ?? 0.35) : 1.0);
      supportSize = Math.min(supportSize, maxSize);
      support = mk(supportSize);
    }
  }

  /* COMPOSE — hero at origin; support centered above, gap or tuck */
  const heroGeom = toGeom(hero.cmds, heroR.size);
  let supportGeom: ReturnType<typeof toGeom> | null = null;
  let supportCmdsPlaced: typeof hero.cmds | null = null;
  if (support && supportR) {
    const raw = toGeom(support.cmds, supportSize);
    const dx = (heroGeom.x1 + heroGeom.x2) / 2 - (raw.x1 + raw.x2) / 2;
    /* a connective kicker never tucks INTO the hero: its painted outline
       must clear the hero's expanded cap-line, so stop-word supports get
       daylight past the widest hero ring even when the recipe tucks */
    const heroRing = Math.max(
      recipe.hero.depth.cap?.expand ?? 0,
      recipe.hero.depth.keyline?.expand ?? 0,
      recipe.hero.depth.deep?.expand ?? 0,
    );
    const gap = plan.supportIsStop
      ? Math.max(recipe.composition.lineGap, heroRing + 5)
      : recipe.composition.lineGap;
    const dy = heroGeom.y1 - gap - raw.y2;
    supportCmdsPlaced = translateCmds(support.cmds, dx, dy);
    supportGeom = toGeom(supportCmdsPlaced, supportSize);
  }
  const unionGeom = recipe.composition.badge
    ? toGeom([...(supportCmdsPlaced ?? []), ...hero.cmds], heroR.size)
    : null;

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
  const frame: Frame = { x1: fx1, y1: fy1, x2: fx1 + fw, y2: fy1 + fh };
  const heroBox: HeroBox = { x1: heroGeom.x1, y1: heroGeom.y1, x2: heroGeom.x2, y2: heroGeom.y2, size: heroR.size };
  const lockupBox: HeroBox = { x1, y1, x2, y2, size: heroR.size };
  const wrap = (inner: string, dfs: string[], bg: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">` +
    `<rect x="${fx1.toFixed(0)}" y="${fy1.toFixed(0)}" width="${fw.toFixed(0)}" height="${fh.toFixed(0)}" fill="${bg}"/>` +
    (dfs.length ? `<defs>${dfs.join("")}</defs>` : "") + inner + `</svg>`;

  /* CONSTRUCT + MATERIALIZE — palette-resolved IR ops per role */
  const buildOps = (p: Palette): { roles: IRRole[]; composition: IRRole | null } => {
    const rig = recipe.light;
    const roles: IRRole[] = [];
    if (supportGeom && supportR) {
      roles.push({
        geom: supportGeom, idp: `${ns}s`,
        ops: [
          ...resolveDepth(supportR.depth, p, rig, supportR.depthK ?? 1),
          ...resolveMaterial(supportR.material, p, rig),
          ...(supportR.patterns ?? []).map((ps) => resolvePattern(ps, p, rig, supportGeom!, frame, seed + 31, ns)),
        ],
      });
    }
    roles.push({
      geom: heroGeom, idp: `${ns}h`,
      ops: [
        ...resolveDepth(heroR.depth, p, rig, heroR.depthK ?? 1),
        ...resolveMaterial(heroR.material, p, rig),
        ...(heroR.patterns ?? []).map((ps) => resolvePattern(ps, p, rig, heroGeom, frame, seed + 17, ns)),
      ],
    });
    const composition = unionGeom && recipe.composition.badge
      ? { geom: unionGeom, idp: `${ns}c`, ops: resolveDepth(recipe.composition.badge, p, rig, 1) }
      : null;
    return { roles, composition };
  };

  /* EMIT — full color */
  const pal = recipe.palette;
  const defs: string[] = [];
  const built = buildOps(pal);
  const body = emitPassMajor(built.roles, built.composition, defs, false, frame);
  const scene = recipe.scene
    ? buildScene(recipe.scene, frame, heroBox, lockupBox, pal, seed, defs, ns)
    : { far: "", behind: "", fore: "" };
  const svg = wrap(scene.far + scene.behind + body + scene.fore, defs, pal[recipe.stage] ?? "#FFFFFF");
  const lettering = wrap(body, defs, "#FFFFFF");

  /* EMIT — silhouette (flat ink, no scene, no shadow, no masks) */
  const silDefs: string[] = [];
  const silhouette = wrap(emitPassMajor(built.roles, built.composition, silDefs, true, frame), silDefs, "#FFFFFF");

  /* EMIT — grayscale value read (scene included, palette regraded) */
  const gpal = grayPalette(pal);
  const gDefs: string[] = [];
  const gBuilt = buildOps(gpal);
  const gBody = emitPassMajor(gBuilt.roles.map((r) => ({ ...r, idp: `g${r.idp}` })), gBuilt.composition ? { ...gBuilt.composition, idp: `g${ns}c` } : null, gDefs, false, frame);
  const gScene = recipe.scene
    ? buildScene(recipe.scene, frame, heroBox, lockupBox, gpal, seed, gDefs, `g${ns}`)
    : { far: "", behind: "", fore: "" };
  const grayscale = wrap(gScene.far + gScene.behind + gBody + gScene.fore, gDefs, gpal[recipe.stage] ?? "#FFFFFF");

  return { svg, lettering, silhouette, grayscale, w, h };
}
