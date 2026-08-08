import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { renderTypeSpecimen } from "@/generator/bevel";
import {
  defaultConfig, fontByName, clampWeight, registerCustomFont, applyTextPreset,
  TEXT_PRESETS, PATTERN_TYPES, BLEND_MODES, GLINT_STYLES, darken,
} from "@/generator/model";
import type { GenConfig } from "@/generator/model";
import { ensureFont } from "@/generator/fonts";
import { downloadSvg, downloadPng, inlineKitFace } from "@/generator/exportUtils";
import { fetchKitFont } from "@/generator/engineExport";
import { hydrate } from "@/generator/store";
import { Slider, FxToggle, AngleDial, FontPicker } from "@/ui/controls";
import { TM_PRESETS, tmPresetById } from "./presets";
import type { TmBackdrop } from "./presets";
import { POSE_IDENTITY, poseActive, projectLetters, placementBounds } from "./pose";
import type { Pose } from "./pose";
import "@/styles/typemaker.css";

/* Type Maker — the text-effects generator, built on the kit engine.
   Everything visual renders through renderTypeSpecimen (the same build()
   pipeline as every button on the site); this page owns a private
   GenConfig, a 3D pose, and a backdrop. Persistence deliberately lives
   under a `typemaker-` key: anything under `ui-generator*` is the user's
   real kit document and syncs to the cloud. */

const LS_KEY = "typemaker-v1";

/* ── svg string helpers ─────────────────────────────────────────── */
const parseVb = (svg: string) => {
  const m = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : { x: 0, y: 0, w: 100, h: 100 };
};
const parseAnchor = (svg: string) => {
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"/.exec(svg);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
};

/** Paint a styled backdrop card behind an svg's art by injecting a rect
 *  (plus rays/ambient) right after the opening tag — references resolve
 *  document-wide, so the defs can trail the rect. */
let BD_UID = 0; // several backdropped svgs share the document — ids must not collide
function withBackdrop(svg: string, bd: TmBackdrop | null): string {
  if (!bd) return svg;
  const vb = parseVb(svg);
  const uid = "tmbd" + BD_UID++;
  const rx = Math.min(vb.w, vb.h) * 0.045;
  let rays = "";
  if (bd.rays) {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h * 0.45;
    let wedges = "";
    for (let i = 0; i < 12; i++)
      wedges += `<path d="M0 0 L${vb.w} ${-vb.w * 0.028} L${vb.w} ${vb.w * 0.028} Z" fill="#fff" transform="rotate(${i * 30})"/>`;
    // clip on the OUTER group: clip-path resolves after an element's own
    // transform, so clipping the translated group would drag the window along
    rays = `<g clip-path="url(#${uid}c)"><g opacity="0.06" transform="translate(${cx} ${cy})">${wedges}</g></g>`;
  }
  const amb = bd.ambient
    ? `<ellipse cx="${vb.x + vb.w / 2}" cy="${vb.y + vb.h * 0.42}" rx="${vb.w * 0.5}" ry="${vb.h * 0.55}" fill="url(#${uid}a)" clip-path="url(#${uid}c)"/>`
    : "";
  const inject =
    `<defs><radialGradient id="${uid}g" cx="50%" cy="42%" r="78%"><stop offset="0%" stop-color="${bd.from}"/><stop offset="100%" stop-color="${bd.to}"/></radialGradient>` +
    (bd.ambient ? `<radialGradient id="${uid}a"><stop offset="0%" stop-color="${bd.ambient}" stop-opacity="0.16"/><stop offset="100%" stop-color="${bd.ambient}" stop-opacity="0"/></radialGradient>` : "") +
    `<clipPath id="${uid}c"><rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" rx="${rx.toFixed(1)}"/></clipPath></defs>` +
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" rx="${rx.toFixed(1)}" fill="url(#${uid}g)"/>` +
    rays + amb;
  return svg.replace(/(<svg[^>]*>)/, `$1${inject}`);
}

/** Effect reach beyond the glyph box — the raster pad renderTypeSpecimen
 *  reserves so glow, extrusion and tilt never clip at the canvas edge. */
function fxPadOf(c: GenConfig): number {
  const t = c.type;
  const k = t.size / 52;
  const glow = t.glow.on ? t.glow.size * 0.8 * 3 : 0;
  const dim = t.dim?.on
    ? (t.dim.depth + t.dim.sticker + t.dim.rim) * k + (t.dim.shadow > 0 ? t.dim.depth * k + 18 : 0)
    : 0;
  const sh = t.shadow.on ? Math.abs(t.shadow.x) + Math.abs(t.shadow.y) + t.shadow.blur * 2 : 0;
  const tilt = t.dim?.on && t.dim.tilt > 0 ? t.size * 0.14 : 0;
  return Math.ceil(Math.max(24, glow, dim, sh) + tilt + t.size * 0.04);
}

const caseText = (s: string, mode: GenConfig["type"]["case"]) =>
  mode === "upper" ? s.toUpperCase()
  : mode === "lower" ? s.toLowerCase()
  : mode === "title" ? s.replace(/\b\w/g, (m) => m.toUpperCase())
  : s;

let sharedCtx: CanvasRenderingContext2D | null = null;
const ctx2d = () => (sharedCtx ??= document.createElement("canvas").getContext("2d")!);

/** Compose the posed word: one specimen render per letter, each placed by
 *  its projected affine, far letters painted first. Pure SVG 1.1 out. */
function composePosed(cfg: GenConfig, text: string, pose: Pose, fxPad: number): string {
  const t = cfg.type;
  const shown = caseText(text, t.case);
  const chars = [...shown];
  const ctx = ctx2d();
  ctx.font = `${t.italic ? "italic " : ""}${t.weight} ${t.size}px "${t.font}", Inter, sans-serif`;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const gap = (t.spacing / 100) * t.size;

  const letters = chars.map((ch) =>
    ch.trim() ? renderTypeSpecimen(cfg, ch, { fxPad, keepCase: true }) : null,
  );
  const boxes = letters.map((svg, i) => {
    if (!svg) return { w: 0, h: 0, cx: 0, cy: 0 };
    const vb = parseVb(svg);
    const a = parseAnchor(svg);
    return { w: vb.w, h: vb.h, cx: a.x - vb.x + widths[i] / 2, cy: a.y - vb.y };
  });

  const placed = projectLetters(widths, gap, pose, t.size).filter((p) => letters[p.i]);
  /* canvas bounds hug the GLYPHS, not each letter's full fx canvas — the
     specimen reserves generous blur padding per letter, and a union of
     those mostly-empty boxes buries the word in dead air. Effects may
     paint past the glyph box; the margin (scaled fx reach) absorbs them. */
  const gBoxes = chars.map((_, i) => {
    const w = widths[i] + t.size * 0.3, h = t.size * 1.5;
    return { w, h, cx: w / 2, cy: h / 2 };
  });
  const b = placementBounds(placed, gBoxes);
  const m = Math.ceil(fxPad * 1.8 + t.size * 0.25);
  const W = Math.ceil(b.x1 - b.x0 + m * 2), H = Math.ceil(b.y1 - b.y0 + m * 2);
  const body = placed
    .map((p) => {
      const box = boxes[p.i];
      const inner = letters[p.i]!.replace(
        `<svg xmlns="http://www.w3.org/2000/svg" `,
        `<svg xmlns="http://www.w3.org/2000/svg" x="${(-box.cx).toFixed(1)}" y="${(-box.cy).toFixed(1)}" `,
      );
      return `<g transform="matrix(${p.m.map((v) => v.toFixed(4)).join(" ")})">${inner}</g>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${shown.replace(/"/g, "")}">` +
    `<g transform="translate(${(-b.x0 + m).toFixed(1)} ${(-b.y0 + m).toFixed(1)})">${body}</g></svg>`
  );
}

/* ── tiny local widgets (store-free takes on Panel's patterns) ───── */
function Sec({ title, id, open, onToggle, children }: {
  title: string; id: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <section className={`sec${open ? " open" : ""}`}>
      <button className="sec-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <ChevronRight size={14} strokeWidth={2.4} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .12s" }} />
        <span>{title}</span>
      </button>
      {open && <div className="sec-body">{children}</div>}
    </section>
  );
}

function Well({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="chipwell sm tm-well">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

const DIM_DEFAULT = { on: true, depth: 6, color: null, sticker: 0, stickerColor: "#FFFFFF", rim: 1.5, rimColor: null, shadow: 30, gloss: 0, glossCover: 35, tilt: 0 };

/* ── the page ───────────────────────────────────────────────────── */
export function TypeMakerPage() {
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "null"); } catch { return null; }
  }, []);
  /* deep-link overrides — ?lab=typemaker&style=chrome&text=TURBO&ry=45:
     a shareable look beats "open it and click these five things". Boot-time
     only, like the lab param itself. */
  const boot = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const num = (k: string) => { const v = q.get(k); return v !== null && v !== "" && !Number.isNaN(+v) ? +v : null; };
    return { style: q.get("style"), text: q.get("text"), ry: num("ry"), rx: num("rx"), rz: num("rz"), arc: num("arc"), persp: num("persp") };
  }, []);
  const bootPosed = boot.ry !== null || boot.rx !== null || boot.rz !== null || boot.arc !== null || boot.persp !== null;
  const [cfg, setCfg] = useState<GenConfig>(() => {
    if (boot.style) { const c = defaultConfig(); tmPresetById(boot.style).apply(c); return c; }
    if (saved?.cfg) { try { return hydrate(saved.cfg); } catch { /* fall through */ } }
    const c = defaultConfig();
    tmPresetById("juice-pop").apply(c);
    return c;
  });
  const [text, setText] = useState<string>(boot.text ?? (boot.style ? tmPresetById(boot.style).sampleText : saved?.text ?? "JUICY"));
  const [pose, setPose] = useState<Pose>(bootPosed
    ? { ...POSE_IDENTITY, ry: boot.ry ?? 0, rx: boot.rx ?? 0, rz: boot.rz ?? 0, arc: boot.arc ?? 0, persp: boot.persp ?? POSE_IDENTITY.persp }
    : saved?.pose ?? { ...POSE_IDENTITY });
  const [backdropOn, setBackdropOn] = useState<boolean>(boot.style ? true : saved?.backdropOn ?? true);
  const [presetId, setPresetId] = useState<string>(boot.style ?? saved?.presetId ?? "juice-pop");
  const [pngScale, setPngScale] = useState<number>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({ styles: true, text: true, font: true, dim: true, pose: true, export: true });
  const toggle = useCallback((id: string) => setOpen((o) => ({ ...o, [id]: !o[id] })), []);

  const update = useCallback((fn: (c: GenConfig) => void) => {
    setCfg((prev) => { const n = structuredClone(prev); fn(n); return n; });
  }, []);

  // fonts: register customs, load the active face, re-render when faces land
  useEffect(() => {
    (cfg.type.customFonts ?? []).forEach(registerCustomFont);
    ensureFont(cfg.type.font);
  }, [cfg.type.font, cfg.type.customFonts]);
  useEffect(() => {
    const onDone = () => setFontTick((v) => v + 1);
    document.fonts?.addEventListener?.("loadingdone", onDone);
    return () => document.fonts?.removeEventListener?.("loadingdone", onDone);
  }, []);

  // persistence — typemaker-scoped, never the ui-generator* keyspace
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ cfg, text, pose, backdropOn, presetId })); } catch { /* full/private */ }
    }, 500);
    return () => clearTimeout(t);
  }, [cfg, text, pose, backdropOn, presetId]);

  const preset = tmPresetById(presetId);
  const T = cfg.type;
  const caps = fontByName(T.font)?.caps;

  const finalSvg = useMemo(() => {
    const fxPad = fxPadOf(cfg);
    const art = poseActive(pose)
      ? composePosed(cfg, text || " ", pose, fxPad)
      : renderTypeSpecimen(cfg, text || " ", { fxPad });
    return withBackdrop(art, backdropOn ? preset.backdrop : null);
    // fontTick: glyph metrics and specimen text widths change when faces land
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, text, pose, backdropOn, preset, fontTick]);

  // style cards — each preset rendered by the real engine at card scale
  const cards = useMemo(() =>
    TM_PRESETS.map((p) => {
      const c = defaultConfig();
      p.apply(c);
      c.type.size = 62;
      ensureFont(c.type.font);
      const svg = withBackdrop(renderTypeSpecimen(c, p.sampleText, { fxPad: 24 }), p.backdrop);
      return { id: p.id, name: p.name, blurb: p.blurb, svg };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fontTick]);

  const applyPreset = (id: string) => {
    const p = tmPresetById(id);
    const probe = defaultConfig();
    p.apply(probe);
    ensureFont(probe.type.font);
    update((c) => p.apply(c));
    setPresetId(id);
    setText(p.sampleText);
    setBackdropOn(true);
  };

  // drag to spin — the flagship gesture. Shift-drag rolls.
  const dragRef = useRef<{ x: number; y: number; pose: Pose } | null>(null);
  const onStageDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pose };
  };
  const onStageMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !e.buttons) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    setPose(e.shiftKey
      ? { ...d.pose, rz: cl(d.pose.rz + dx * 0.25, 60) }
      : { ...d.pose, ry: cl(d.pose.ry + dx * 0.35, 80), rx: cl(d.pose.rx - dy * 0.35, 80) });
  };
  const onStageUp = () => { dragRef.current = null; };

  // exports — TopBar's svgWithFace recipe, pointed at the Type Maker scene
  const svgForExport = async (): Promise<string> => {
    const s = finalSvg;
    const fam = T.font;
    const fdef = fontByName(fam);
    const css = fdef.name === fam ? fdef.css : null;
    let out = await inlineKitFace(s, fam, css);
    if (out === s && s.includes("<text")) {
      try {
        const kf = await fetchKitFont(fam);
        if (kf) out = await inlineKitFace(s, fam, null, kf.bytes);
      } catch { /* export never blocks on the network */ }
    }
    return out;
  };
  const slug = (text || "type").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "type";
  const dlSvg = async () => {
    setBusy("svg");
    try { downloadSvg(await svgForExport(), `typemaker-${slug}.svg`); } finally { setBusy(null); }
  };
  const dlPng = async () => {
    setBusy("png");
    try { await downloadPng(await svgForExport(), `typemaker-${slug}@${pngScale}x.png`, pngScale); } finally { setBusy(null); }
  };

  const addFontRef = useRef<HTMLInputElement>(null);
  const addFont = () => {
    const name = addFontRef.current?.value.trim();
    if (!name) return;
    registerCustomFont(name);
    ensureFont(name);
    update((c) => {
      if (!c.type.customFonts.includes(name)) c.type.customFonts.push(name);
      c.type.font = name;
    });
    if (addFontRef.current) addFontRef.current.value = "";
  };

  const dim = T.dim;
  const setDim = (fn: (d: NonNullable<GenConfig["type"]["dim"]>) => void) =>
    update((c) => { c.type.dim = c.type.dim ?? structuredClone(DIM_DEFAULT); fn(c.type.dim); });
  const palette = { dark: darken(cfg.effects.Bevel ?? "#0E9CC9", 0.5), glow: cfg.effects.Glow ?? "#8FF0FF" };

  return (
    <div className="tm-app">
      <aside className="tm-side">
        <div className="tm-brand">
          <span className="tm-mark" style={{ fontFamily: "'Lilita One', Inter, sans-serif" }}>TYPE MAKER</span>
          <span className="tm-sub">experiment · the kit engine, aimed at type</span>
        </div>

        <Sec title="Styles" id="styles" open={!!open.styles} onToggle={toggle}>
          <div className="tm-grid">
            {cards.map((p) => (
              <button key={p.id} className={`tm-card${p.id === presetId ? " on" : ""}`} title={p.blurb} onClick={() => applyPreset(p.id)}>
                <span className="tm-card-art" dangerouslySetInnerHTML={{ __html: p.svg }} />
                <span className="tm-card-name">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="helper">Every style is knobs over the same engine — pick one, then push everything below.</div>
        </Sec>

        <Sec title="Text" id="text" open={!!open.text} onToggle={toggle}>
          <input className="tinput" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} aria-label="Text" />
          <label className="fieldbox" style={{ marginTop: 6 }}>
            <span className="fl">Lit phrase</span>
            <input className="tinput" value={T.highlight ?? ""} maxLength={32} placeholder="none"
              onChange={(e) => update((c) => { c.type.highlight = e.target.value; })} />
          </label>
        </Sec>

        <Sec title="Font" id="font" open={!!open.font} onToggle={toggle}>
          <FontPicker value={T.font} customFonts={T.customFonts} onPick={(n) => {
            ensureFont(n);
            update((c) => {
              c.type.font = n;
              const fcaps = fontByName(n)?.caps;
              if (fcaps) { c.type.weight = clampWeight(fcaps, c.type.weight); c.type.width = fcaps.wdth?.[2]; }
            });
          }} />
          <div className="tm-addfont">
            <input ref={addFontRef} className="tinput" placeholder="Add any Google font…" onKeyDown={(e) => { if (e.key === "Enter") addFont(); }} />
            <button className="chipbtn" onClick={addFont}>Add</button>
          </div>
          <Slider label="Size" value={T.size} min={28} max={160} unit="px" onChange={(v) => update((c) => { c.type.size = v; })} />
          {caps?.wght
            ? <Slider label="Weight" value={T.weight} min={caps.wght[0]} max={caps.wght[1]} step={10} unit="" onChange={(v) => update((c) => { c.type.weight = v; })} />
            : (caps?.weights?.length ?? 0) > 1
              ? <label className="fieldbox"><span className="fl">Weight</span>
                  <select value={T.weight} onChange={(e) => update((c) => { c.type.weight = +e.target.value; })}>
                    {caps!.weights!.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select></label>
              : <Slider label="Weight" value={T.weight} min={caps?.weights?.[0] ?? 400} max={900} step={25} unit="" onChange={(v) => update((c) => { c.type.weight = v; })} />}
          {caps?.wdth && <Slider label="Width" value={T.width ?? caps.wdth[2]} min={caps.wdth[0]} max={caps.wdth[1]} unit="%" onChange={(v) => update((c) => { c.type.width = v; })} />}
          <Slider label="Spacing" value={T.spacing} min={-5} max={20} unit="" onChange={(v) => update((c) => { c.type.spacing = v; })} />
          <div className="segmini" role="radiogroup" aria-label="Case">
            {(["none", "upper", "lower", "title"] as const).map((cs) => (
              <button key={cs} className={T.case === cs ? "on" : ""} onClick={() => update((c) => { c.type.case = cs; })}>
                {cs === "none" ? "Aa" : cs === "upper" ? "AA" : cs === "lower" ? "aa" : "Ab"}
              </button>
            ))}
            <label className="check" style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={T.italic} onChange={(e) => update((c) => { c.type.italic = e.target.checked; })} /> Italic
            </label>
          </div>
        </Sec>

        <Sec title="Fill & metal bands" id="fill" open={!!open.fill} onToggle={toggle}>
          <div className="segmini" role="radiogroup" aria-label="Fill mode">
            {(["auto", "solid", "gradient"] as const).map((fm) => (
              <button key={fm} className={T.fillMode === fm ? "on" : ""} onClick={() => update((c) => { c.type.fillMode = fm; })}>{fm}</button>
            ))}
          </div>
          {T.fillMode !== "auto" && <Well label="Fill" value={T.fill} onChange={(v) => update((c) => { c.type.fill = v; })} />}
          {T.fillMode === "gradient" && !T.fillStops && <Well label="Fill bottom" value={T.fill2} onChange={(v) => update((c) => { c.type.fill2 = v; })} />}
          {T.fillMode === "gradient" && T.fillStops && (
            <>
              <div className="sublabel">Metal bands</div>
              <div className="tm-stops">
                {T.fillStops.map((s, i) => (
                  <input key={i} type="color" value={s.color} title={`Band at ${(s.offset * 100).toFixed(0)}%`}
                    onChange={(e) => update((c) => { c.type.fillStops![i].color = e.target.value; })} />
                ))}
              </div>
              <button className="chipbtn" onClick={() => update((c) => { delete c.type.fillStops; })}>Back to two-color fill</button>
            </>
          )}
          {T.fillMode === "gradient" && !T.fillStops && (
            <button className="chipbtn" onClick={() => update((c) => {
              c.type.fillStops = [
                { offset: 0, color: c.type.fill }, { offset: 0.45, color: c.type.fill2 },
                { offset: 0.52, color: darken(c.type.fill2, 0.3) }, { offset: 1, color: c.type.fill },
              ];
            })}>Split into metal bands</button>
          )}
          <Slider label="Fill opacity" value={T.fillOpacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.fillOpacity = v; })} />
        </Sec>

        <Sec title="Effects" id="fx" open={!!open.fx} onToggle={toggle}>
          <label className="fieldbox"><span className="fl">One-click treatment</span>
            <select value={T.preset} onChange={(e) => update((c) => applyTextPreset(c.type, e.target.value, palette))}>
              {TEXT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <FxToggle label="Outline" on={T.outline.on} onToggle={(v) => update((c) => { c.type.outline.on = v; })}>
            <Well label="Color" value={T.outline.color} onChange={(v) => update((c) => { c.type.outline.color = v; })} />
            <Slider label="Width" value={T.outline.width} min={0.5} max={8} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.outline.width = v; })} />
          </FxToggle>
          <FxToggle label="Shadow" on={T.shadow.on} onToggle={(v) => update((c) => { c.type.shadow.on = v; })}>
            <Well label="Color" value={T.shadow.color} onChange={(v) => update((c) => { c.type.shadow.color = v; })} />
            <Slider label="X" value={T.shadow.x} min={-10} max={10} unit="px" onChange={(v) => update((c) => { c.type.shadow.x = v; })} />
            <Slider label="Y" value={T.shadow.y} min={-10} max={12} unit="px" onChange={(v) => update((c) => { c.type.shadow.y = v; })} />
            <Slider label="Blur" value={T.shadow.blur} min={0} max={12} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.shadow.blur = v; })} />
            <Slider label="Opacity" value={T.shadow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.shadow.opacity = v; })} />
          </FxToggle>
          <FxToggle label="Emboss" on={T.emboss.on} onToggle={(v) => update((c) => { c.type.emboss.on = v; })}>
            <Slider label="Strength" value={T.emboss.strength} min={-100} max={100} unit="" onChange={(v) => update((c) => { c.type.emboss.strength = v; })} />
            <Slider label="Softness" value={T.emboss.softness} min={0} max={100} unit="" onChange={(v) => update((c) => { c.type.emboss.softness = v; })} />
            <Slider label="Distance" value={T.emboss.distance} min={0} max={8} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.emboss.distance = v; })} />
          </FxToggle>
          <FxToggle label="Glow" on={T.glow.on} onToggle={(v) => update((c) => { c.type.glow.on = v; })}>
            <Well label="Color" value={T.glow.color} onChange={(v) => update((c) => { c.type.glow.color = v; })} />
            <Slider label="Size" value={T.glow.size} min={2} max={24} unit="px" onChange={(v) => update((c) => { c.type.glow.size = v; })} />
            <Slider label="Opacity" value={T.glow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.glow.opacity = v; })} />
          </FxToggle>
          <FxToggle label="Glints" on={!!T.glints?.on} onToggle={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { opacity: 50 }), on: v }; })}>
            <label className="fieldbox"><span className="fl">Style</span>
              <select value={T.glints?.style ?? "slab"} onChange={(e) => update((c) => { c.type.glints = { ...(c.type.glints ?? { on: true, opacity: 50 }), style: e.target.value as never }; })}>
                {GLINT_STYLES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select></label>
            <label className="fieldbox"><span className="fl">Blend</span>
              <select value={T.glints?.blend ?? "normal"} onChange={(e) => update((c) => { c.type.glints = { ...(c.type.glints ?? { on: true, opacity: 50 }), blend: e.target.value as never }; })}>
                {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
            <Slider label="Opacity" value={T.glints?.opacity ?? 50} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { on: true }), opacity: v }; })} />
          </FxToggle>
          <FxToggle label="Pattern fill" on={!!T.stripes?.on} onToggle={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { angle: 0, opacity: 30 }), on: v }; })}>
            <label className="fieldbox"><span className="fl">Pattern</span>
              <select value={T.stripes?.style ?? "stripes"} onChange={(e) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, angle: 0, opacity: 30 }), style: e.target.value as never }; })}>
                {PATTERN_TYPES.filter((p) => p.id !== "none").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <Slider label="Angle" value={T.stripes?.angle ?? 0} min={0} max={180} unit="°" onChange={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, opacity: 30 }), angle: v }; })} />
            <Slider label="Opacity" value={T.stripes?.opacity ?? 30} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, angle: 0 }), opacity: v }; })} />
          </FxToggle>
        </Sec>

        <Sec title="Dimension" id="dim" open={!!open.dim} onToggle={toggle}>
          <FxToggle label="Solid body" on={!!dim?.on} onToggle={(v) => setDim((d) => { d.on = v; })}>
            <Slider label="Depth" value={dim?.depth ?? 6} min={0} max={28} step={0.5} unit="" onChange={(v) => setDim((d) => { d.depth = v; })} />
            <Slider label="Sticker wrap" value={dim?.sticker ?? 0} min={0} max={16} step={0.5} unit="" onChange={(v) => setDim((d) => { d.sticker = v; })} />
            <Slider label="Contour" value={dim?.rim ?? 1.5} min={0} max={8} step={0.5} unit="" onChange={(v) => setDim((d) => { d.rim = v; })} />
            <Slider label="Ground shadow" value={dim?.shadow ?? 30} min={0} max={100} unit="%" onChange={(v) => setDim((d) => { d.shadow = v; })} />
            <Slider label="Candy gloss" value={dim?.gloss ?? 0} min={0} max={100} unit="%" onChange={(v) => setDim((d) => { d.gloss = v; })} />
            {(dim?.gloss ?? 0) > 0 && <Slider label="Gloss cover" value={dim?.glossCover ?? 35} min={15} max={70} unit="%" onChange={(v) => setDim((d) => { d.glossCover = v; })} />}
            <Slider label="Letter tilt" value={dim?.tilt ?? 0} min={0} max={100} unit="%" onChange={(v) => setDim((d) => { d.tilt = v; })} />
            <label className="check">
              <input type="checkbox" checked={!dim?.color} onChange={(e) => setDim((d) => { d.color = e.target.checked ? null : darken(T.fillMode === "gradient" ? T.fill2 : T.fill, 0.42); })} />
              Body color from fill
            </label>
            {dim?.color && <Well label="Body" value={dim.color} onChange={(v) => setDim((d) => { d.color = v; })} />}
            {(dim?.sticker ?? 0) > 0 && <Well label="Sticker" value={dim?.stickerColor ?? "#FFFFFF"} onChange={(v) => setDim((d) => { d.stickerColor = v; })} />}
          </FxToggle>
        </Sec>

        <Sec title="3D pose" id="pose" open={!!open.pose} onToggle={toggle}>
          <Slider label="Swing" value={pose.ry} min={-80} max={80} unit="°" onChange={(v) => setPose({ ...pose, ry: v })} />
          <Slider label="Pitch" value={pose.rx} min={-80} max={80} unit="°" onChange={(v) => setPose({ ...pose, rx: v })} />
          <Slider label="Roll" value={pose.rz} min={-60} max={60} unit="°" onChange={(v) => setPose({ ...pose, rz: v })} />
          <Slider label="Perspective" value={pose.persp} min={0} max={100} unit="%" onChange={(v) => setPose({ ...pose, persp: v })} />
          <Slider label="Arch" value={pose.arc} min={-120} max={120} unit="°" onChange={(v) => setPose({ ...pose, arc: v })} />
          <button className="chipbtn" onClick={() => setPose({ ...POSE_IDENTITY })}><RotateCcw size={12} /> Flat again</button>
          <div className="helper">Drag the canvas to spin — hold Shift to roll. Posed letters stay true vectors in every export.</div>
        </Sec>

        <Sec title="Lighting" id="light" open={!!open.light} onToggle={toggle}>
          <div className="tm-dialrow">
            <AngleDial value={cfg.lighting.angle} onChange={(v) => update((c) => { c.lighting.angle = v; })} />
            <Slider label="Angle" value={cfg.lighting.angle} min={0} max={360} unit="°" onChange={(v) => update((c) => { c.lighting.angle = v; })} />
          </div>
          <Slider label="Highlights" value={cfg.lighting.highlight} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.lighting.highlight = v; })} />
          <Slider label="Lowlights" value={cfg.lighting.lowlight} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.lighting.lowlight = v; })} />
        </Sec>

        <Sec title="Backdrop & export" id="export" open={!!open.export} onToggle={toggle}>
          <label className="check">
            <input type="checkbox" checked={backdropOn} onChange={(e) => setBackdropOn(e.target.checked)} />
            Backdrop card (off = transparent art)
          </label>
          <div className="segmini" role="radiogroup" aria-label="PNG scale">
            {[1, 2, 4].map((s) => (
              <button key={s} className={pngScale === s ? "on" : ""} onClick={() => setPngScale(s)}>{s}x</button>
            ))}
          </div>
          <div className="tm-exports">
            <button className="chipbtn on" disabled={busy !== null} onClick={() => void dlSvg()}>{busy === "svg" ? "Working…" : "Download SVG"}</button>
            <button className="chipbtn on" disabled={busy !== null} onClick={() => void dlPng()}>{busy === "png" ? "Working…" : `Download PNG ${pngScale}x`}</button>
          </div>
          <div className="helper">The font travels inside both files — they open true anywhere.</div>
        </Sec>

        <div className="tm-foot">build {__BUILD_STAMP__}</div>
      </aside>

      <main className={`tm-stage-wrap${backdropOn ? "" : " tm-checker"}`}
        onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp}>
        <div className="tm-stage" dangerouslySetInnerHTML={{ __html: finalSvg }} />
      </main>
    </div>
  );
}
