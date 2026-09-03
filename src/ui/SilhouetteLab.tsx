/* ── Silhouette Feasibility Lab ─────────────────────────────────────────────
   Isolated dev page (mounted only for `?lab=silhouettes`) that pushes the
   eight imported silhouettes through the REAL candy/material engine and
   reports honestly on what survives. Nothing here is shape-specific
   rendering: every pixel of every button comes from build() via renderShell,
   with per-shape data limited to path, safe-area metadata and an
   engine-native material preset. Diagnostic overlays audit the exact
   shellPaths geometry build() itself derives. */
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { GenConfig, GenStateName, Shape, SpecularMode } from "../generator/model";
import { defaultConfig, STOCK_ICONS, SPECULAR_MODES, PRESETS, presetById, applyPresetCandy, fontByName } from "../generator/model";
import { renderShell, shellPaths, shapePath, offsetPathInward } from "../generator/bevel";
import { IMPORTED_SHAPES, validateImported, auditInset, type ImportedSilhouette } from "../generator/importedShapes";
import { renderSkinRecipe, type ButtonSkinRecipe } from "../generator/skins";
import { SKIN_RECIPES } from "../generator/skinRecipes";
import { ensureFont } from "../generator/fonts";
import { usePageScroll } from "@/shell/usePageScroll";

/* Engine-native material presets, mapped from the brief's palettes. The
   engine derives its face gradient from ONE Inner Fill hue (+contrast) and
   its extrusion body from the Bevel role — so "face top/bottom" and an
   independently-hued extrusion are approximated, not reproduced. Those
   limits are called out in the findings, not painted over. */
interface LabSkin {
  effects: GenConfig["effects"];
  bevel: { width: number; softness: number };
  faceContrast: number;
  candy: (c: GenConfig["candy"]) => void;
}
const SKINS: Record<string, LabSkin> = {
  twinGrip: {
    effects: { Bevel: "#F6A800", Glow: "#6FC1FF", Highlight: "#FFE59E", Shadow: "#081A4C", "Inner Fill": "#0867DF" },
    bevel: { width: 12, softness: 60 }, faceContrast: 72,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#7FC3FF", tint2: "#EAF9FF", on: true, height: 46, curve: 26, opacity: 74, softness: 60 }; c.specular = { ...c.specular, on: true, mode: "anime", size: 30, intensity: 66 }; c.extrusion = { ...c.extrusion, depth: 14, darkness: 88 }; },
  },
  bossCrown: {
    effects: { Bevel: "#FFB400", Glow: "#FF8FA3", Highlight: "#FFE77A", Shadow: "#5B1900", "Inner Fill": "#D81336" },
    bevel: { width: 8, softness: 35 }, faceContrast: 76,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#FF9DB0", tint2: "#FFE9EE", on: true, height: 42, curve: 20, opacity: 66, softness: 40 }; c.specular = { ...c.specular, on: true, mode: "sweep", size: 20, intensity: 62 }; c.extrusion = { ...c.extrusion, depth: 14, darkness: 84 }; },
  },
  slimeSurge: {
    effects: { Bevel: "#6DB900", Glow: "#D5FF52", Highlight: "#CFFF2B", Shadow: "#174500", "Inner Fill": "#75D708" },
    bevel: { width: 12, softness: 90 }, faceContrast: 70,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#CFFF6E", tint2: "#F2FFDC", on: true, height: 52, curve: 36, opacity: 78, softness: 44 }; c.specular = { ...c.specular, on: true, mode: "dual", size: 28, intensity: 72, softness: 50 }; c.innerGlow = { ...c.innerGlow, opacity: 72, size: 62 }; c.bloom = { opacity: 58, size: 70 }; c.extrusion = { ...c.extrusion, depth: 12, darkness: 78 }; c.pattern = { type: "dots", scale: 62, angle: 0, opacity: 14, color: null }; },
  },
  cogLock: {
    effects: { Bevel: "#C9822B", Glow: "#9FB6D4", Highlight: "#FFE0A0", Shadow: "#24180F", "Inner Fill": "#3E526E" },
    bevel: { width: 14, softness: 20 }, faceContrast: 62,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#9FB6D4", tint2: "#E8F1FA", on: true, height: 34, curve: 10, opacity: 38, softness: 18 }; c.specular = { ...c.specular, on: true, mode: "sweep", size: 18, intensity: 58 }; c.texture = { amount: 34, scale: 52 }; c.extrusion = { ...c.extrusion, depth: 14, darkness: 86 }; c.innerEdge = { strength: 62, width: 3 }; c.pattern = { ...c.pattern, type: "none" }; },
  },
  prizeBow: {
    effects: { Bevel: "#EFA900", Glow: "#FFB7DC", Highlight: "#FFE38A", Shadow: "#65043E", "Inner Fill": "#F12D91" },
    bevel: { width: 12, softness: 85 }, faceContrast: 72,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#FF9DD3", tint2: "#FFE9F5", on: true, height: 50, curve: 32, opacity: 76, softness: 36 }; c.specular = { ...c.specular, on: true, mode: "anime", size: 30, intensity: 84 }; c.bloom = { opacity: 58, size: 68 }; c.extrusion = { ...c.extrusion, depth: 12, darkness: 82 }; },
  },
  monsterBite: {
    effects: { Bevel: "#252525", Glow: "#FF6A5E", Highlight: "#8E8E8E", Shadow: "#120203", "Inner Fill": "#D7191F" },
    bevel: { width: 14, softness: 55 }, faceContrast: 74,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#FF7A72", tint2: "#FFD9D6", on: true, height: 36, curve: 14, opacity: 46, softness: 26 }; c.specular = { ...c.specular, on: true, mode: "line", size: 52, intensity: 56 }; c.extrusion = { ...c.extrusion, depth: 14, darkness: 90 }; c.innerGlow = { ...c.innerGlow, opacity: 64, size: 46 }; c.pattern = { ...c.pattern, type: "none" }; },
  },
  turboWing: {
    effects: { Bevel: "#71879C", Glow: "#62E6FF", Highlight: "#EAF5FF", Shadow: "#071C2B", "Inner Fill": "#00A8E8" },
    bevel: { width: 13, softness: 25 }, faceContrast: 70,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#7FE3FF", tint2: "#EAFBFF", on: true, height: 38, curve: 12, opacity: 52, softness: 22 }; c.specular = { ...c.specular, on: true, mode: "line", size: 56, intensity: 60 }; c.extrusion = { ...c.extrusion, depth: 13, darkness: 84 }; c.pattern = { ...c.pattern, type: "none" }; },
  },
  gemCluster: {
    effects: { Bevel: "#F0A400", Glow: "#EC68FF", Highlight: "#FFE894", Shadow: "#2A0649", "Inner Fill": "#9B21DB" },
    bevel: { width: 13, softness: 20 }, faceContrast: 78,
    candy: (c) => { c.gloss = { ...c.gloss, fill: "gradient", tint: "#D98CFF", tint2: "#F6E7FF", on: true, height: 40, curve: 16, opacity: 60, softness: 24 }; c.specular = { ...c.specular, on: true, mode: "hard", size: 26, intensity: 86 }; c.extrusion = { ...c.extrusion, depth: 13, darkness: 84 }; c.pattern = { ...c.pattern, type: "none" }; },
  },
};

/* Honest feasibility verdicts — written from the measured audits and the
   rendered results, revised whenever either changes. */
type RatingStatus = "PASS" | "PASS WITH PARAMETER LIMITS" | "NEEDS GENERIC ENGINE IMPROVEMENT" | "NOT SUITABLE FOR CURRENT ENGINE";
const RATINGS: Record<string, { status: RatingStatus; reason: string }> = {
  twinGrip: { status: "PASS", reason: "Measured clean through the entire bevel range (≈26u); crevice excursion peaks at 0.6u, under the rim stroke. One honest compromise: the engine derives extrusion tone from the Bevel role, so the gold rim and the brief's navy extrusion can't both be literal." },
  slimeSurge: { status: "PASS", reason: "v67: with true inward offsets the lobe crevices keep a parallel wall at every tested inset. The earlier scaled-inset kisses are gone." },
  cogLock: { status: "PASS", reason: "Friendliest of the eight: face inset measured clean through the whole range (≈26u), narrowest feature 24u. The hybrid finish (low gloss + grain) reads mechanical with zero custom seams or bolts." },
  monsterBite: { status: "PASS", reason: "v67: the engine now derives inner shapes through a TRUE inward offset (the generic improvement this shape was waiting for). The face parallels the bite notches instead of escaping into them; walls hold at the default inset." },
  bossCrown: { status: "PASS WITH PARAMETER LIMITS", reason: "Wave 2, provisional. Crown-peak crevices measured clean only to ≈5u of face inset, so maxBevelRatio 0.05 clamps the face regardless of the slider; within that limit the peaks keep their identity from perimeter geometry alone." },
  prizeBow: { status: "PASS", reason: "Wave 2, provisional. Bow lobes inset cleanly through the full measured range (excursion ≤0.5u); the outline alone carries the bow read. No ribbon objects anywhere." },
  turboWing: { status: "PASS WITH PARAMETER LIMITS", reason: "Wave 2, provisional. Fins measured clean to ≈9u of face inset; maxBevelRatio 0.09 caps deeper settings. The straight-line geometry keeps the label band generous." },
  gemCluster: { status: "PASS", reason: "Wave 2, provisional. Faceted contour insets cleanly through the full measured range; the hard specular mode gives the jewel read with zero attached gemstones." },
};

const STATES: GenStateName[] = ["default", "hover", "pressed", "disabled"];
const ASPECTS = [
  { w: 142, note: "1.42:1 · near-square floor" },
  { w: 200, note: "2:1 · source ratio" },
  { w: 280, note: "2.8:1 · production ceiling" },
  { w: 400, note: "4:1 · stress diagnostic only" },
];
const PX = 1.6; // source-unit → screen px scale for the hero renders

interface Overrides {
  bevelW?: number; rimW?: number; depth?: number; softness?: number;
  gloss?: number; specular?: number; specMode?: SpecularMode;
  shadow?: number; angle?: number; presetAll?: string;
}

function skinnedConfig(s: ImportedSilhouette, ov: Overrides, ignoreOv: boolean, caps: boolean): GenConfig {
  const cfg = defaultConfig();
  const skin = SKINS[s.id];
  cfg.shape = `lab:${s.id}${caps ? ":caps" : ""}` as Shape;
  cfg.effects = { ...skin.effects };
  cfg.bevel = { ...skin.bevel };
  cfg.face = { mode: "light", contrast: skin.faceContrast, midpoint: 50 };
  skin.candy(cfg.candy);
  cfg.content.label = s.label;
  // lab type: same engine treatment, auto (white) fill so eight palettes
  // don't fight the theme's cyan gradient; glow keyed to the skin's Glow.
  cfg.type.fillMode = "auto";
  cfg.type.glow = { ...cfg.type.glow, color: skin.effects.Glow ?? "#8FF0FF" };
  const o = ignoreOv ? {} : ov;
  if (o.presetAll) { const p = presetById(o.presetAll); cfg.effects = { ...p.effects }; cfg.bevel = { ...p.bevel }; applyPresetCandy(cfg.candy, p); }
  if (o.bevelW !== undefined) cfg.bevel.width = o.bevelW;
  if (o.softness !== undefined) cfg.bevel.softness = o.softness;
  if (o.rimW !== undefined) cfg.candy.rim.width = o.rimW;
  if (o.depth !== undefined) cfg.candy.extrusion.depth = o.depth;
  if (o.gloss !== undefined) cfg.candy.gloss.opacity = o.gloss;
  if (o.specular !== undefined) cfg.candy.specular.intensity = o.specular;
  if (o.specMode !== undefined) cfg.candy.specular = { ...cfg.candy.specular, on: true, mode: o.specMode };
  if (o.shadow !== undefined) cfg.shadow.opacity = o.shadow;
  if (o.angle !== undefined) cfg.lighting.angle = o.angle;
  return cfg;
}

/** Type size that respects the 60–140 source band mapped onto width w —
 *  the engine sizes width from text in auto-width mode, but the lab pins
 *  the frame, so the label must yield instead. Returns build()'s pre-scale
 *  fs plus whether the band forced it below the house scale. */
function fitFs(cfg: GenConfig, label: string, w: number, h: number, withIcon: boolean): { fs: number; bandLimited: boolean } {
  const t = cfg.type;
  const scaleK = t.size / 52;
  const factor = fontByName(t.font).factor * (1 + t.spacing / 100) * 1.06;
  const band = w * 0.4 - (withIcon ? h * 0.34 : 0); // x=60..140 of the source box
  const house = h * 0.31 * scaleK;
  const fit = band / Math.max(1, label.length * factor);
  const fsR = Math.min(house, fit);
  return { fs: fsR / scaleK, bandLimited: fit < house };
}

/* ── Layered Skin proof card — recipe-driven assembly vs the single shell.
   Everything rendered here comes from renderSkinRecipe + pure recipe data;
   the side-by-side single-shell render is the same v64 pipeline. */
function SkinCard({ r, wire, uniform }: { r: ButtonSkinRecipe; wire: boolean; uniform: boolean }) {
  const [copied, setCopied] = useState(false);
  const w = 200 * PX, h = 100 * PX;
  const hero = useMemo(() => renderSkinRecipe(r, "default", w, h, { caps: !uniform, wireframe: wire }), [r, w, h, uniform, wire]);
  const shellTwin = useMemo(() => {
    const s = IMPORTED_SHAPES[r.id];
    const cfg = skinnedConfig(s, {}, true, false);
    const f = fitFs(cfg, s.label, w * 0.66, h * 0.66, false);
    return renderShell(cfg, "default", w * 0.66, h * 0.66, { label: s.label, iconDef: null, fs: f.fs });
  }, [r, w, h]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(hero); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ }
  };
  return (
    <article className="slab-card slab-skincard" data-skin-card={r.id}>
      <header className="slab-cardhead">
        <div>
          <h3>{r.name}</h3>
          <p className="slab-dims">{r.parts.length} authored parts · {r.parts.filter((p) => p.mirrorX).length} mirrored · hull = footprint, shadow, extrusion, max clip</p>
        </div>
        <span className="slab-rating slab-rating--pass-lim">LAYERED SKIN</span>
      </header>
      <div className="slab-hero">
        <div className="slab-heroart" dangerouslySetInnerHTML={{ __html: hero }} />
      </div>
      <div className="slab-states" data-role="skin-states">
        {STATES.map((st) => (
          <figure key={st}>
            <div dangerouslySetInnerHTML={{ __html: renderSkinRecipe(r, st, w * 0.55, h * 0.55, { caps: !uniform }) }} />
            <figcaption>{st}</figcaption>
          </figure>
        ))}
      </div>
      <div className="slab-aspects" data-role="skin-aspects">
        {ASPECTS.map((a) => (
          <figure key={a.w} data-aspect={a.w}>
            <div dangerouslySetInnerHTML={{ __html: renderSkinRecipe(r, "default", a.w * 0.82, 82, { caps: !uniform }) }} />
            <figcaption>{a.note}{uniform ? "" : " · caps"}</figcaption>
          </figure>
        ))}
      </div>
      <div className="slab-row">
        <figure className="slab-shellvs" data-role="shell-vs">
          <div dangerouslySetInnerHTML={{ __html: shellTwin }} />
          <figcaption>same hull, single-shell mode (v64)</figcaption>
        </figure>
        <div className="slab-parts" data-role="parts">
          {[...r.parts].sort((a, b) => a.zIndex - b.zIndex).map((p) => (
            <span key={p.id} className="slab-partchip">z{p.zIndex} · {p.id}{p.mirrorX ? " ×2" : ""} · {p.material}</span>
          ))}
        </div>
      </div>
      <div className="slab-actions">
        <button onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy SVG"}</button>
      </div>
    </article>
  );
}

function Card({ s, ov, globals }: {
  s: ImportedSilhouette;
  ov: Overrides;
  globals: { diag: boolean; flat: boolean; inset: boolean; safe: boolean; caps: boolean; icon: boolean; w: number; h: number };
}) {
  const [ignoreOv, setIgnoreOv] = useState(false);
  const [copied, setCopied] = useState("");
  const w = globals.w * PX, h = globals.h * PX;
  const cfg = useMemo(() => skinnedConfig(s, ov, ignoreOv, false), [s, ov, ignoreOv]);
  const { fs, bandLimited } = fitFs(cfg, s.label, w, h, globals.icon);
  const hero = useMemo(
    () => renderShell(cfg, "default", w, h, { label: s.label, iconDef: globals.icon ? STOCK_ICONS.star : null, fs }),
    [cfg, w, h, s.label, globals.icon, fs]);

  // diagnostics — the same shellPaths derivation build() uses, overlaid in
  // the hero's own coordinate space (viewBox + shell offset parsed from it)
  const overlay = useMemo(() => {
    const vb = /viewBox="([-\d. ]+)"/.exec(hero)?.[1];
    const ds = /data-shell="([-\d. ]+)"/.exec(hero)?.[1]?.split(" ").map(Number);
    if (!vb || !ds) return null;
    const sp = shellPaths(cfg, cfg.shape, 40, 32, w, h);
    const ty = ds[1] - 32;
    const safeX = 40 + w * 0.3, safeW = w * 0.4;
    const safeY = 32 + h * s.content.top, safeH = h * (1 - s.content.top - s.content.bottom);
    return { vb, ty, sp, safe: { x: safeX, y: safeY, w: safeW, h: safeH } };
  }, [hero, cfg, w, h, s]);

  // source-space inset audit (thresholds in the brief's logical units)
  const audit = useMemo(() => {
    const soft = cfg.bevel.softness;
    const K = h / 168;
    const bw = cfg.bevel.width * K;
    const bwF = (s.maxBevelRatio !== undefined ? Math.min(bw, h * s.maxBevelRatio) : bw) * (s.faceInsetScale ?? 1);
    const bwSrc = (bwF / h) * 100;
    const shape = cfg.shape;
    const outerSrc = shapePath(shape, 0, 0, 200, 100, soft);
    return {
      bwSrc,
      // v67: audit the REAL derivation — true inward offset, scaled fallback
      ...auditInset((inset) => inset === 0 ? outerSrc : (offsetPathInward(outerSrc, inset) || shapePath(shape, inset, inset, 200 - inset * 2, 100 - inset * 2, Math.max(0, soft - 8))), bwSrc),
    };
  }, [cfg, h, s]);

  const validation = useMemo(() => validateImported(s), [s]);
  const warnings = [...audit.warnings];
  if (!validation.ok) warnings.push("import validation failed: see checks");
  const rating = RATINGS[s.id];

  const copy = async (what: "svg" | "cfg") => {
    const text = what === "svg" ? hero : JSON.stringify({ shape: cfg.shape, path: s.path, config: cfg }, null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1600); } catch { /* clipboard unavailable */ }
  };

  return (
    <article className="slab-card" data-shape={s.id}>
      <header className="slab-cardhead">
        <div>
          <h3>{s.name}</h3>
          <p className="slab-dims">{globals.w}×{globals.h}u · {(globals.w / globals.h).toFixed(2)}:1 · skin “{s.id}” · wave {s.wave}</p>
        </div>
        <span className={`slab-rating slab-rating--${rating.status.split(" ")[0].toLowerCase()}${rating.status.includes("LIMITS") ? "-lim" : ""}`}>{rating.status}</span>
      </header>

      <div className="slab-hero" data-role="hero">
        <div className="slab-heroart" dangerouslySetInnerHTML={{ __html: hero }} />
        {overlay && (globals.diag || globals.safe) && (
          <svg className="slab-overlay" viewBox={overlay.vb} aria-hidden data-role="diag">
            <g transform={`translate(0 ${overlay.ty.toFixed(1)})`}>
              {globals.safe && <rect x={overlay.safe.x} y={overlay.safe.y} width={overlay.safe.w} height={overlay.safe.h} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.7)" strokeDasharray="4 4" data-diag="safe" />}
              {globals.diag && <>
                <path d={overlay.sp.outer} fill="none" stroke="#FF3B30" strokeWidth="1.6" data-diag="outer" />
                <path d={overlay.sp.rim} fill="none" stroke="#FFCC00" strokeWidth="1.3" data-diag="rim" />
                <path d={overlay.sp.face} fill="none" stroke="#32E6FF" strokeWidth="1.6" data-diag="face" />
              </>}
            </g>
          </svg>
        )}
      </div>

      {warnings.length > 0 ? (
        <ul className="slab-warnings" data-role="warnings">{warnings.map((wn, i) => <li key={i}>{wn}</li>)}</ul>
      ) : (
        <p className="slab-clean" data-role="warnings">No geometry warnings at the current inset ({audit.bwSrc.toFixed(1)}u).</p>
      )}
      <p className="slab-audit">
        Face inset {audit.bwSrc.toFixed(1)}u · {audit.maxCleanInset < 0 ? "no clean inset found" : `clean up to ≈${audit.maxCleanInset}u`}
        {s.maxBevelRatio !== undefined && <> · maxBevelRatio {s.maxBevelRatio} applied</>}
        {audit.maxEscape > 0.15 && <> · crevice excursion {audit.maxEscape.toFixed(1)}u</>}
        · narrowest face feature {audit.minFeature === Infinity ? "not measurable" : `${audit.minFeature.toFixed(1)}u`}
        {bandLimited && <> · label sized to the 60–140 band</>}
      </p>

      <div className="slab-states" data-role="states">
        {STATES.map((st) => {
          const sh = renderShell(cfg, st, 200 * PX * 0.55, 100 * PX * 0.55, { label: s.label, iconDef: null, fs: fs * 0.55 });
          return <figure key={st}><div dangerouslySetInnerHTML={{ __html: sh }} /><figcaption>{st}</figcaption></figure>;
        })}
      </div>

      <div className="slab-aspects" data-role="aspects">
        {ASPECTS.map((a) => {
          const capsShape = globals.caps;
          const c2 = skinnedConfig(s, ov, ignoreOv, capsShape);
          const hh = 100 * 0.82, ww = a.w * 0.82;
          const f2 = fitFs(c2, s.label, ww, hh, false);
          const sh = renderShell(c2, "default", ww, hh, { label: s.label, iconDef: null, fs: f2.fs });
          return <figure key={a.w} data-aspect={a.w}><div dangerouslySetInnerHTML={{ __html: sh }} /><figcaption>{a.note}{capsShape ? " · caps" : ""}</figcaption></figure>;
        })}
      </div>

      <div className="slab-row">
        {globals.flat && (
          <figure className="slab-flat" data-role="flat">
            <svg viewBox="0 0 200 100"><path d={s.path} fill="currentColor" /></svg>
            <figcaption>flat silhouette</figcaption>
          </figure>
        )}
        {globals.inset && (
          <figure className="slab-insetprev" data-role="insetprev">
            <svg viewBox="0 0 208 108">
              {(() => { const sp = shellPaths(cfg, cfg.shape, 4, 4, 200, 100); return <>
                <path d={sp.outer} fill="none" stroke="#FF3B30" strokeWidth="1.4" />
                <path d={sp.face} fill="none" stroke="#32E6FF" strokeWidth="1.4" />
              </>; })()}
            </svg>
            <figcaption>outer vs face inset</figcaption>
          </figure>
        )}
        <div className="slab-validation" data-role="validation">
          {validation.checks.map((c) => (
            <span key={c.name} className={c.pass ? "ok" : "bad"} title={c.note ?? ""}>{c.pass ? "✓" : "✕"} {c.name}</span>
          ))}
        </div>
      </div>

      <p className="slab-reason">{rating.reason}</p>

      <div className="slab-actions">
        <button onClick={() => void copy("svg")}>{copied === "svg" ? "Copied ✓" : "Copy SVG"}</button>
        <button onClick={() => void copy("cfg")}>{copied === "cfg" ? "Copied ✓" : "Copy configuration"}</button>
        <button onClick={() => setIgnoreOv((v) => !v)}>{ignoreOv ? "Re-apply globals" : "Reset shape"}</button>
      </div>
    </article>
  );
}

export function SilhouetteLab() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const [ov, setOv] = useState<Overrides>({});
  const [diag, setDiag] = useState(true);
  const [flat, setFlat] = useState(true);
  const [inset, setInset] = useState(true);
  const [safe, setSafe] = useState(false);
  const [caps, setCaps] = useState(false);
  const [icon, setIcon] = useState(false);
  const [wave2, setWave2] = useState(false);
  const [skinWire, setSkinWire] = useState(false);
  const [skinUniform, setSkinUniform] = useState(false);
  const [w, setW] = useState(200);
  const [h, setH] = useState(100);
  useEffect(() => { ensureFont("Russo One"); document.title = "Silhouette Feasibility Lab · FORGE"; }, []);

  const shapes = Object.values(IMPORTED_SHAPES).filter((s) => wave2 || s.wave === 1);
  const set = (k: keyof Overrides) => (e: ChangeEvent<HTMLInputElement>) => setOv((o) => ({ ...o, [k]: +e.target.value }));
  const slider = (label: string, k: keyof Overrides, min: number, max: number, step = 1) => (
    <label className="slab-ctl">
      <span>{label}{ov[k] !== undefined ? ` · ${ov[k]}` : " · per skin"}</span>
      <input type="range" min={min} max={max} step={step} value={(ov[k] as number) ?? (min + max) / 2} onChange={set(k)} data-ctl={k} />
    </label>
  );

  return (
    <div className="slab" data-lab="silhouettes">
      <header className="slab-head">
        <div>
          <h1>Silhouette Feasibility Lab</h1>
          <p>Eight imported silhouettes rendered by the production candy engine: <strong>no custom illustration, no shape-specific code</strong>. Dev-only page; nothing here ships to the kit until the findings are approved. <a href={location.pathname}>← back to the generator</a></p>
        </div>
        <div className="slab-legend">
          <span><i style={{ background: "#FF3B30" }} /> outer</span>
          <span><i style={{ background: "#FFCC00" }} /> rim</span>
          <span><i style={{ background: "#32E6FF" }} /> face inset</span>
          <span><i style={{ background: "rgba(255,255,255,0.5)" }} /> safe band 60–140</span>
        </div>
      </header>

      <section className="slab-controls" aria-label="Lab controls">
        <div className="slab-ctlrow">
          <label className="slab-ctl"><span>Width · {w}u</span><input type="range" min={120} max={420} value={w} onChange={(e) => setW(+e.target.value)} data-ctl="w" /></label>
          <label className="slab-ctl"><span>Height · {h}u</span><input type="range" min={80} max={140} value={h} onChange={(e) => setH(+e.target.value)} data-ctl="h" /></label>
          {slider("Bevel width", "bevelW", 2, 26)}
          {slider("Rim width", "rimW", 0, 8)}
          {slider("Extrusion depth", "depth", 0, 30)}
          {slider("Corner softness", "softness", 0, 100)}
          {slider("Gloss strength", "gloss", 0, 100)}
          {slider("Specular strength", "specular", 0, 100)}
          {slider("Shadow strength", "shadow", 0, 100)}
          {slider("Lighting direction", "angle", 0, 360)}
        </div>
        <div className="slab-ctlrow">
          <label className="slab-ctl slab-ctl--select"><span>Specular mode</span>
            <select value={ov.specMode ?? ""} onChange={(e) => setOv((o) => ({ ...o, specMode: (e.target.value || undefined) as SpecularMode | undefined }))} data-ctl="specMode">
              <option value="">per skin</option>
              {SPECULAR_MODES.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === "sweep" ? " (follows the silhouette)" : ""}</option>)}
            </select>
          </label>
          <label className="slab-ctl slab-ctl--select"><span>Material preset</span>
            <select value={ov.presetAll ?? ""} onChange={(e) => setOv((o) => ({ ...o, presetAll: e.target.value || undefined }))} data-ctl="presetAll">
              <option value="">per shape (lab skins)</option>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name} (production)</option>)}
            </select>
          </label>
          <label className="slab-check"><input type="checkbox" checked={diag} onChange={(e) => setDiag(e.target.checked)} data-ctl="diag" /> Show diagnostics</label>
          <label className="slab-check"><input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} data-ctl="flat" /> Show flat silhouette</label>
          <label className="slab-check"><input type="checkbox" checked={inset} onChange={(e) => setInset(e.target.checked)} data-ctl="inset" /> Show face inset</label>
          <label className="slab-check"><input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} data-ctl="safe" /> Show safe area</label>
          <label className="slab-check"><input type="checkbox" checked={caps} onChange={(e) => setCaps(e.target.checked)} data-ctl="caps" /> Cap-preserving stretch (3-slice experiment)</label>
          <label className="slab-check"><input type="checkbox" checked={icon} onChange={(e) => setIcon(e.target.checked)} data-ctl="icon" /> Icon + label</label>
          <label className="slab-check"><input type="checkbox" checked={wave2} onChange={(e) => setWave2(e.target.checked)} data-ctl="wave2" /> Second wave (4 more shapes, pending first-pass approval)</label>
          <button className="slab-reset" onClick={() => { setOv({}); setW(200); setH(100); setCaps(false); setIcon(false); }} data-ctl="resetall">Reset all</button>
        </div>
      </section>

      <details className="slab-notes">
        <summary>Method & honest limitations</summary>
        <ul>
          <li>Every render is <code>build()</code>, the production pipeline. Per-shape data is limited to the path, safe-area metadata and an engine-native material preset.</li>
          <li>The engine derives its face gradient from <em>one</em> Inner Fill hue + contrast; the brief's three-stop face gradients are approximated, not reproduced.</li>
          <li>The extrusion body's color derives from the Bevel role. An independently-hued extrusion (e.g. Twin Grip's navy under a gold rim) needs a generic engine improvement (an Extrusion color role).</li>
          <li>Corner softness shapes procedural silhouettes only; imported paths keep their authored geometry (softness still reaches the face via the −8 offset rule).</li>
          <li><strong>Specular:</strong> the <em>sweep</em> mode strokes an inset copy of the actual silhouette, so it genuinely follows the contour. The other five modes are light-keyed face events, clipped by the silhouette but not tracing it.</li>
          <li>The three-slice experiment remaps control points through a piecewise x-map: caps stay rigid, only the center band stretches, one continuous outline (no seams). It falls back to uniform scaling when the frame can't hold both caps.</li>
          <li>Imported shapes here bypass the production <code>user:</code> 1.42× distortion cap, because observing stretch is the point of this test.</li>
        </ul>
      </details>

      <section className="slab-skinsec" aria-label="Layered Skin proof">
        <div className="slab-skinhead">
          <h2>Layered Skin: first proof</h2>
          <p>The reference art is an <em>assembly</em>, not one inset shell. Here the strict one-path hull keeps its jobs (footprint, shadow, extrusion, max clip) while a data-driven recipe stacks independently authored parts (rear pieces, chassis, an independent face, mirrored caps) through one reusable <code>renderMaterialPath()</code>. No shape-specific components exist; each design is a recipe entry. Cap-preserving stretch runs every part through the same x-map, so mirrored caps stay rigid.</p>
          <label className="slab-check"><input type="checkbox" checked={skinWire} onChange={(e) => setSkinWire(e.target.checked)} data-ctl="skinwire" /> Show part wireframes</label>
          <label className="slab-check"><input type="checkbox" checked={skinUniform} onChange={(e) => setSkinUniform(e.target.checked)} data-ctl="skinuniform" /> Uniform stretch (compare)</label>
        </div>
        <div className="slab-grid">
          {SKIN_RECIPES.map((r) => <SkinCard key={r.id} r={r} wire={skinWire} uniform={skinUniform} />)}
        </div>
      </section>

      <main className="slab-grid">
        {shapes.map((s) => (
          <Card key={s.id} s={s} ov={ov} globals={{ diag, flat, inset, safe, caps, icon, w, h }} />
        ))}
      </main>
    </div>
  );
}
