/* SPLASH LETTERING ENGINE — the Scene Stack.

   STAGE → far background → behind-lettering ornament → LETTERING →
   foreground accents. Scene layers are DERIVED, never authored per
   word: they take the composed lockup's bounds + palette tokens + seed
   and build the world around it (Flor's rule: ornament solves
   composition and negative space, it is not garnish).

   Families (the study's experimental set): comic burst, halftone rays,
   speed lines, star/spark field, retro print field + rules + swash,
   arena plaque + glow. Deterministic (mulberry32); pure strings;
   everything crops at the viewBox. Five-point stars only — the
   four-point AI star is banned. */

import { mulberry32 } from "./engine";
import type { Frame } from "./engine";
import type { Palette } from "./material";
import { tok } from "./material";

export interface SceneLayers { far: string; behind: string; fore: string }

export interface HeroBox { x1: number; y1: number; x2: number; y2: number; size: number }

export type SceneSpec =
  | { kind: "comic-burst"; ray: string; dot: string; spark?: string; rayCount?: number; rayOpacity?: number; dotOpacity?: number }
  | { kind: "halftone-rays"; dot: string; rayCount?: number; dotOpacity?: number }
  | { kind: "speed-lines"; tok: string; count?: number; opacity?: number }
  | { kind: "star-field"; tok: string; tok2?: string; count?: number }
  | { kind: "retro-print"; dot: string; rule: string; swash?: { tok: string; keyTok: string } }
  | { kind: "arena"; glow: string; plaque: string; plaqueLine: string; rule: string };

const star5 = (cx: number, cy: number, r: number, rot = 0): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
};

/* ── comic burst (rays + corner halftone) ───────────────────────── */

function burstRays(frame: Frame, fill: string, n: number, opacity: number, r: () => number): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const cx = frame.x1 + w / 2, cy = frame.y1 + h * 0.44;
  const R = Math.hypot(w, h) * 0.75;
  let rays = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.05;
    const half = ((Math.PI * 2) / n) * (0.24 + r() * 0.1);
    const ax = cx + Math.cos(a0 - half) * R, ay = cy + Math.sin(a0 - half) * R;
    const bx = cx + Math.cos(a0 + half) * R, by = cy + Math.sin(a0 + half) * R;
    rays += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}Z" fill="${fill}"/>`;
  }
  return `<g opacity="${opacity.toFixed(2)}">${rays}</g>`;
}

function cornerHalftone(frame: Frame, fill: string, opacity: number, r: () => number): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const corners: [number, number][] = [[frame.x1, frame.y2], [frame.x2, frame.y1]];
  let dots = "";
  const reach = Math.min(w, h) * 0.52;
  const pitch = reach / 7;
  for (const [kx, ky] of corners) {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const gx = (col + (row % 2 ? 0.5 : 0)) * pitch;
        const gy = row * pitch * 0.9;
        const x = kx + (kx === frame.x1 ? gx : -gx);
        const y = ky + (ky === frame.y1 ? gy : -gy);
        const fall = 1 - Math.hypot(gx, gy) / reach;
        if (fall <= 0.05) continue;
        const dotR = pitch * 0.34 * fall * (0.92 + r() * 0.16);
        if (dotR < 1.2) continue;
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${fill}"/>`;
      }
    }
  }
  return `<g opacity="${opacity.toFixed(2)}">${dots}</g>`;
}

/* ── halftone rays: burst wedges built OF dots ──────────────────── */

function halftoneRays(frame: Frame, fill: string, n: number, opacity: number, r: () => number): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const cx = frame.x1 + w / 2, cy = frame.y1 + h * 0.44;
  const R = Math.hypot(w, h) * 0.72;
  let dots = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.04;
    const ux = Math.cos(a), uy = Math.sin(a);
    // march outward; dots grow with the wedge then thin at the tip
    for (let d = R * 0.22; d < R; d += R * 0.055) {
      const t = d / R;
      const wedgeW = d * (Math.PI / n) * 0.62;
      const rows = wedgeW > 14 ? 2 : 1;
      for (let k = 0; k < rows; k++) {
        const lat = rows === 1 ? 0 : (k === 0 ? -0.3 : 0.3) * wedgeW;
        const px = cx + ux * d - uy * lat, py = cy + uy * d + ux * lat;
        const dr = Math.max(1.1, wedgeW * 0.28 * (1 - t * 0.55) * (0.9 + r() * 0.2));
        dots += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${dr.toFixed(1)}" fill="${fill}"/>`;
      }
    }
  }
  return `<g opacity="${opacity.toFixed(2)}">${dots}</g>`;
}

/* ── speed lines ────────────────────────────────────────────────── */

function speedLines(frame: Frame, fill: string, count: number, opacity: number, r: () => number): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const u = Math.min(w, h) / 450; // scale-free stroke unit
  let out = "";
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const y = frame.y1 + h * (0.08 + r() * 0.84);
    const len = w * (0.12 + r() * 0.22);
    const th = (1.6 + r() * 3.4) * u;
    const x0 = left ? frame.x1 : frame.x2;
    const dir = left ? 1 : -1;
    // tapered streak: thick at the frame edge, pointed inward
    out += `<path d="M${x0.toFixed(1)} ${(y - th / 2).toFixed(1)}L${(x0 + dir * len).toFixed(1)} ${y.toFixed(1)}L${x0.toFixed(1)} ${(y + th / 2).toFixed(1)}Z" fill="${fill}"/>`;
  }
  return `<g opacity="${opacity.toFixed(2)}">${out}</g>`;
}

/* ── star / spark field ─────────────────────────────────────────── */

function starField(frame: Frame, fill: string, fill2: string, count: number, r: () => number, avoid?: HeroBox): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const u = Math.min(w, h) / 450; // scale-free ornament unit
  let out = "";
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 8) {
    // alternate halves so the sparks counterweight the composition
    // instead of clustering on one side
    const half = placed % 2;
    const x = frame.x1 + (half ? 0.5 + r() * 0.5 : r() * 0.5) * w;
    const y = frame.y1 + r() * h;
    const m = 20 * u;
    if (avoid && x > avoid.x1 - m && x < avoid.x2 + m && y > avoid.y1 - m && y < avoid.y2 + m) continue;
    const big = r() > 0.62;
    if (big) out += `<path d="${star5(x, y, (4 + r() * 9) * u, r() * Math.PI)}" fill="${fill}"/>`;
    else out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${((1 + r() * 2.2) * u).toFixed(1)}" fill="${fill2}"/>`;
    placed++;
  }
  return out;
}

/* ── retro print field + ornamental rules + underline swash ─────── */

function printField(frame: Frame, fill: string, r: () => number): string {
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const pitch = Math.min(w, h) / 16;
  let out = "";
  for (let row = 0; row * pitch * 0.95 < h; row++) {
    for (let col = 0; col * pitch < w + pitch; col++) {
      const x = frame.x1 + (col + (row % 2 ? 0.5 : 0)) * pitch;
      const y = frame.y1 + row * pitch * 0.95;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(pitch * 0.09 * (0.8 + r() * 0.4)).toFixed(2)}" fill="${fill}"/>`;
    }
  }
  return `<g opacity="0.3">${out}</g>`;
}

/** rules bracket the WHOLE lockup (kicker's ascenders included), so the
 *  finials can never land inside a letterform */
function ornamentalRules(lockup: HeroBox, fill: string): string {
  const cx = (lockup.x1 + lockup.x2) / 2;
  const halfW = (lockup.x2 - lockup.x1) * 0.3;
  const u = lockup.size / 150; // authored at 150 — everything rides size
  const mk = (y: number): string =>
    `<path d="M${(cx - halfW).toFixed(1)} ${y.toFixed(1)}H${(cx + halfW).toFixed(1)}" stroke="${fill}" stroke-width="${(2.4 * u).toFixed(1)}"/>` +
    `<path d="M${(cx - halfW).toFixed(1)} ${(y + 6 * u).toFixed(1)}H${(cx + halfW).toFixed(1)}" stroke="${fill}" stroke-width="${(1.1 * u).toFixed(1)}"/>` +
    `<path d="M${cx.toFixed(2)} ${(y - 5 * u).toFixed(1)}l${(7 * u).toFixed(1)} ${(8 * u).toFixed(1)}-${(7 * u).toFixed(1)} ${(8 * u).toFixed(1)}-${(7 * u).toFixed(1)}-${(8 * u).toFixed(1)}Z" fill="${fill}"/>`;
  return mk(lockup.y1 - lockup.size * 0.34) + mk(lockup.y2 + lockup.size * 0.42);
}

/** ribbon swash under the hero, derived from its bounds — border tone
 *  under a face tone, plus a cast shadow on the SAME down-right travel
 *  as the lettering so the ornament lives under the lockup's one light */
function underlineSwash(hero: HeroBox, faceTok: string, keyTok: string): { behind: string; fore: string } {
  const wSpan = hero.x2 - hero.x1;
  const y0 = hero.y2 + hero.size * 0.14;
  const d = `M${(hero.x1 + wSpan * 0.06).toFixed(1)} ${(y0 - hero.size * 0.02).toFixed(1)} C${(hero.x1 + wSpan * 0.3).toFixed(1)} ${(y0 + hero.size * 0.16).toFixed(1)} ${(hero.x1 + wSpan * 0.62).toFixed(1)} ${(y0 + hero.size * 0.16).toFixed(1)} ${(hero.x2 - wSpan * 0.04).toFixed(1)} ${(y0 - hero.size * 0.06).toFixed(1)}`;
  const wSw = hero.size * 0.085;
  const sh = hero.size * 0.045;
  return {
    behind:
      `<g transform="translate(${sh.toFixed(1)} ${(sh * 1.4).toFixed(1)})" opacity="0.5"><path d="${d}" fill="none" stroke="${keyTok}" stroke-width="${(wSw * 2.6).toFixed(1)}" stroke-linecap="round"/></g>` +
      `<path d="${d}" fill="none" stroke="${keyTok}" stroke-width="${(wSw * 2.6).toFixed(1)}" stroke-linecap="round"/>`,
    fore: `<path d="${d}" fill="none" stroke="${faceTok}" stroke-width="${wSw.toFixed(1)}" stroke-linecap="round"/>`,
  };
}

/* ── arena: glow pool + plaque + rules ──────────────────────────── */

function arenaGlow(frame: Frame, fill: string, dark: string, defs: string[], id: string): string {
  // a spotlight pool + darkened corners — the glow must SHOW at tile
  // size, so both ends of the value move, not just the highlight
  const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
  const cx = frame.x1 + w / 2, cy = frame.y1 + h * 0.4;
  defs.push(
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(Math.max(w, h) * 0.68).toFixed(1)}">` +
    `<stop offset="0" stop-color="${fill}" stop-opacity="0.85"/><stop offset="0.45" stop-color="${fill}" stop-opacity="0.35"/><stop offset="0.75" stop-color="${fill}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${dark}" stop-opacity="0.4"/></radialGradient>`,
  );
  return `<rect x="${frame.x1.toFixed(0)}" y="${frame.y1.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="url(#${id})"/>`;
}

function plaque(box: HeroBox, fill: string, line: string, rule: string): string {
  const padX = box.size * 0.42, padY = box.size * 0.34;
  const x = box.x1 - padX, y = box.y1 - padY;
  const w = box.x2 - box.x1 + padX * 2, h = box.y2 - box.y1 + padY * 2;
  const rx = box.size * 0.12;
  const inset = box.size * 0.08;
  const midY = y + h / 2;
  const ruleY = midY;
  const ruleW = box.size * 0.9;
  const ro = box.size * 0.057, rsw = box.size * 0.021;
  return (
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${fill}"/>` +
    `<rect x="${(x + inset).toFixed(1)}" y="${(y + inset).toFixed(1)}" width="${(w - inset * 2).toFixed(1)}" height="${(h - inset * 2).toFixed(1)}" rx="${(rx * 0.6).toFixed(1)}" fill="none" stroke="${line}" stroke-width="${(box.size * 0.03).toFixed(1)}"/>` +
    // side rules running out from the plaque
    `<path d="M${(x - ruleW).toFixed(1)} ${(ruleY - ro).toFixed(1)}H${x.toFixed(1)}M${(x - ruleW * 0.8).toFixed(1)} ${ruleY.toFixed(1)}H${x.toFixed(1)}M${(x - ruleW).toFixed(1)} ${(ruleY + ro).toFixed(1)}H${x.toFixed(1)}" stroke="${rule}" stroke-width="${rsw.toFixed(1)}"/>` +
    `<path d="M${(x + w).toFixed(1)} ${(ruleY - ro).toFixed(1)}H${(x + w + ruleW).toFixed(1)}M${(x + w).toFixed(1)} ${ruleY.toFixed(1)}H${(x + w + ruleW * 0.8).toFixed(1)}M${(x + w).toFixed(1)} ${(ruleY + ro).toFixed(1)}H${(x + w + ruleW).toFixed(1)}" stroke="${rule}" stroke-width="${rsw.toFixed(1)}"/>` +
    // corner studs
    [[x + inset * 2, y + inset * 2], [x + w - inset * 2, y + inset * 2], [x + inset * 2, y + h - inset * 2], [x + w - inset * 2, y + h - inset * 2]]
      .map(([sx, sy]) => `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${(box.size * 0.035).toFixed(1)}" fill="${line}"/>`)
      .join("")
  );
}

/* ── the stack builder ──────────────────────────────────────────── */

export function buildScene(
  spec: SceneSpec, frame: Frame, hero: HeroBox, lockup: HeroBox,
  p: Palette, seed: number, defs: string[], ns = "",
): SceneLayers {
  const r = mulberry32(seed ^ 0x5ce9e);
  switch (spec.kind) {
    case "comic-burst": {
      const far =
        burstRays(frame, tok(p, spec.ray), spec.rayCount ?? 14, spec.rayOpacity ?? 1, r) +
        cornerHalftone(frame, tok(p, spec.dot), spec.dotOpacity ?? 0.5, r);
      const fore = spec.spark
        ? starField(frame, tok(p, spec.spark), tok(p, spec.spark), 7, r, { ...lockup, size: 0 })
        : "";
      return { far, behind: "", fore };
    }
    case "halftone-rays":
      return { far: halftoneRays(frame, tok(p, spec.dot), spec.rayCount ?? 12, spec.dotOpacity ?? 0.6, r), behind: "", fore: "" };
    case "speed-lines":
      return { far: "", behind: speedLines(frame, tok(p, spec.tok), spec.count ?? 14, spec.opacity ?? 0.75, r), fore: "" };
    case "star-field":
      return { far: starField(frame, tok(p, spec.tok), tok(p, spec.tok2 ?? spec.tok), spec.count ?? 26, r, { ...lockup, size: 0 }), behind: "", fore: "" };
    case "retro-print": {
      const far = printField(frame, tok(p, spec.dot), r);
      let behind = ornamentalRules(lockup, tok(p, spec.rule));
      if (spec.swash) {
        // both swash strokes sit behind the lettering (the hero's own
        // construction tucks over the ribbon where they meet)
        const sw = underlineSwash(hero, tok(p, spec.swash.tok), tok(p, spec.swash.keyTok));
        behind += sw.behind + sw.fore;
      }
      return { far, behind, fore: "" };
    }
    case "arena": {
      const far = arenaGlow(frame, tok(p, spec.glow), tok(p, spec.plaqueLine), defs, `${ns}ar`);
      const behind = plaque(lockup, tok(p, spec.plaque), tok(p, spec.plaqueLine), tok(p, spec.rule));
      return { far, behind, fore: "" };
    }
  }
}
