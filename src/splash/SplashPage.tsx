import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, ImagePlus, Minus, Plus, X } from "lucide-react";
import { renderTypeSpecimen } from "@/generator/bevel";
import { registerCustomFont, fontByName, PATTERN_TYPES } from "@/generator/model";
import { ensureFont } from "@/generator/fonts";
import { fileToBgDataUrl } from "@/generator/store";
import { downloadSvg, downloadPng, inlineKitFace } from "@/generator/exportUtils";
import { Slider, FontPicker } from "@/ui/controls";
import { loadOutlineFont, flatWordOutline } from "./outline";
import type { Font } from "opentype.js";
import { buildSplashCfg, SPLASH_DEFAULT, SPLASH_STAGE_CHIPS } from "./look";
import type { SplashLook } from "./look";
import "@/styles/splash.css";

/* SPLASH TEXT — super over-illustrated words. One look, nailed first:
   the flat retro sticker. The whole word is ONE compound vector shape —
   outlines regenerate as you type, every treatment (blob, block
   extrusion, shadow, sparkles) hangs off that single shape, and any
   depth is 2D trompe-l'œil. The UI carries only what this look needs. */

const LS_KEY = "splash-v1";

/* Module scope, deliberately: defined inside the page component this was a
   NEW component type every render, so React remounted the native color
   input on each change and the browser's picker dialog snapped shut
   (owner report: "click on it anywhere and it disappears"). */
function Well({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="sp-well"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /><span>{label}</span></label>
  );
}

export function SplashPage() {
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as SplashLook | null; } catch { return null; }
  }, []);
  const boot = useMemo(() => new URLSearchParams(window.location.search).get("text"), []);
  const [look, setLook] = useState<SplashLook>(() => ({ ...SPLASH_DEFAULT, ...(saved ?? {}), ...(boot ? { text: boot } : {}) }));
  const [busy, setBusy] = useState<string | null>(null);
  const [pngScale, setPngScale] = useState(2);
  const [oFont, setOFont] = useState<Font | null>(null);
  const [oState, setOState] = useState<"loading" | "ready" | "none">("loading");
  const [fontTick, setFontTick] = useState(0);

  /* look-level undo — Cmd+Z / Shift+Cmd+Z, UIKM-style coalescing so a
     slider drag lands as one step. The text field keeps the browser's own
     text undo; everything else routes here. */
  const past = useRef<SplashLook[]>([]);
  const future = useRef<SplashLook[]>([]);
  const lastPush = useRef(0);
  const up = useCallback(<K extends keyof SplashLook>(k: K, v: SplashLook[K]) => setLook((l) => {
    const now = Date.now();
    if (now - lastPush.current > 400) {
      past.current.push(l);
      if (past.current.length > 60) past.current.shift();
      future.current = [];
    }
    lastPush.current = now;
    return { ...l, [k]: v };
  }), []);
  const undo = useCallback(() => setLook((l) => {
    const p = past.current.pop();
    if (!p) return l;
    future.current.push(l);
    lastPush.current = 0;
    return p;
  }), []);
  const redo = useCallback(() => setLook((l) => {
    const f = future.current.pop();
    if (!f) return l;
    past.current.push(l);
    lastPush.current = 0;
    return f;
  }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return; // native field undo wins there
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // the live face for the text fallback + glyph outlines for the real thing
  useEffect(() => {
    look.customFonts.forEach(registerCustomFont);
    ensureFont(look.font);
    let alive = true;
    setOState("loading");
    void loadOutlineFont(look.font).then((f) => {
      if (!alive) return;
      setOFont(f);
      setOState(f ? "ready" : "none");
    });
    return () => { alive = false; };
  }, [look.font, look.customFonts]);
  useEffect(() => {
    const onDone = () => setFontTick((v) => v + 1);
    document.fonts?.addEventListener?.("loadingdone", onDone);
    return () => document.fonts?.removeEventListener?.("loadingdone", onDone);
  }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Splash Text";
    return () => { document.title = prev; };
  }, []);

  /* canvas zoom + pan — the kit editor's floater recipe: CSS `zoom` on an
     inner content-sized wrapper (percentages re-resolve there), zoom
     anchored on the viewport center, pan as drag-to-scroll. */
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastZoom = useRef(1);
  useEffect(() => {
    const el = scrollRef.current;
    const prev = lastZoom.current;
    if (!el || prev === zoom) return;
    const k = zoom / prev;
    lastZoom.current = zoom;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
  }, [zoom]);
  const zoomTo = useCallback((z: number) => setZoom(Math.min(4, Math.max(0.25, Math.round(z * 100) / 100))), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.25, Math.round((z - Math.sign(e.deltaY) * 0.1) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const onPanDown = (e: React.PointerEvent) => {
    if (!panMode && e.button !== 1) return;
    const el = scrollRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };
  const onPanMove = (e: React.PointerEvent) => {
    const p = panRef.current, el = scrollRef.current;
    if (!p || !el || !e.buttons) return;
    el.scrollLeft = p.sl - (e.clientX - p.x);
    el.scrollTop = p.st - (e.clientY - p.y);
  };
  const onPanUp = () => { panRef.current = null; };
  const bgInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(look)); } catch { /* private mode */ } }, 400);
    return () => clearTimeout(t);
  }, [look]);

  const finalSvg = useMemo(() => {
    const cfg = buildSplashCfg(look);
    const t = cfg.type;
    const k = t.size / 52;
    // pad grows with the wrap — a big stroke must never clip flat against
    // the canvas or the filter region (0.55 lean baked into the look)
    const fxPad = Math.ceil(
      (look.depth + look.depth * 0.55 + look.strokeW) * k +
      (look.shadow > 0 ? look.depth * k + 18 : 0) + t.size * (0.12 + (look.bounce / 100) * 0.14) + 24,
    );
    const text = look.text || " ";
    if (oFont) {
      const tp = flatWordOutline(oFont, text, t.size, t.spacing / 100, look.bounce / 100, {
        arc: look.arc / 100, bulge: look.bulge / 100,
        lineHeight: look.lineHeight / 100, align: look.align,
        fit: look.posterFit ? "column" : "none", groove: look.groove / 100,
      });
      const reach = Math.max(0, Math.max(Math.abs(tp.minY ?? 0), tp.maxY ?? 0) - t.size * 0.7);
      return renderTypeSpecimen(cfg, text.replace(/\n/g, " "), {
        fxPad: fxPad + Math.ceil(reach), keepCase: true,
        textPath: { ...tp, gy1: tp.minY, gy2: tp.maxY },
      });
    }
    // live text while outlines load — single line only, so fold the returns
    return renderTypeSpecimen(cfg, text.replace(/\n+/g, " "), { fxPad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, oFont, fontTick]);

  // exports — outlined SVGs need no font at all; the text fallback embeds one
  const svgForExport = async (): Promise<string> => {
    let s = finalSvg;
    const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(s);
    if (vb && look.stage.image) {
      // the upload is already a downscaled data URL — embeddable as-is
      s = s.replace(/(<svg[^>]*>)/, `$1<image href="${look.stage.image}" x="${vb[1]}" y="${vb[2]}" width="${vb[3]}" height="${vb[4]}" preserveAspectRatio="xMidYMid slice"/>`);
    } else if (vb && look.stage.mode === "color") {
      s = s.replace(/(<svg[^>]*>)/, `$1<rect x="${vb[1]}" y="${vb[2]}" width="${vb[3]}" height="${vb[4]}" fill="${look.stage.color}"/>`);
    }
    if (s.includes("<text")) {
      const fdef = fontByName(look.font);
      s = await inlineKitFace(s, look.font, fdef.name === look.font ? fdef.css : null);
    }
    return s;
  };
  const slug = (look.text || "splash").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "splash";
  const dlSvg = async () => { setBusy("svg"); try { downloadSvg(await svgForExport(), `splash-${slug}.svg`); } finally { setBusy(null); } };
  const dlPng = async () => { setBusy("png"); try { await downloadPng(await svgForExport(), `splash-${slug}@${pngScale}x.png`, pngScale); } finally { setBusy(null); } };

  const addFontRef = useRef<HTMLInputElement>(null);
  const addFont = () => {
    const name = addFontRef.current?.value.trim();
    if (!name) return;
    registerCustomFont(name);
    ensureFont(name);
    setLook((l) => ({ ...l, font: name, customFonts: l.customFonts.includes(name) ? l.customFonts : [...l.customFonts, name] }));
    if (addFontRef.current) addFontRef.current.value = "";
  };

  return (
    <div className="sp-app">
      <aside className="sp-side">
        <div className="sp-brand">
          <div className="sp-brand-row">
            <span className="sp-mark" style={{ fontFamily: "'Modak', 'Lilita One', Inter, sans-serif" }}>SPLASH TEXT</span>
            <button className="sp-btn sp-reset" title="Back to the factory look (Cmd+Z undoes this too)"
              onClick={() => {
                try { localStorage.removeItem(LS_KEY); } catch { /* private mode */ }
                setLook((l) => { past.current.push(l); future.current = []; lastPush.current = 0; return { ...SPLASH_DEFAULT }; });
              }}>
              Reset
            </button>
          </div>
          <span className="sp-sub">super over-illustrated words · one shape, still editable</span>
        </div>

        <div className="sp-group">
          <textarea className="sp-text" value={look.text} maxLength={96} rows={Math.min(5, Math.max(2, look.text.split("\n").length))}
            aria-label="Text" spellCheck={false}
            onChange={(e) => up("text", e.target.value)} />
          <div className="sp-row">
            <button className={`sp-btn${look.posterFit ? " on" : ""}`} title="Every line scales to one column — the instant typography poster. Stays editable; refits as you type."
              onClick={() => up("posterFit", !look.posterFit)}>Poster fit</button>
          </div>
          <Slider label="Groove" value={look.groove} min={0} max={100} unit="%" onChange={(v) => up("groove", v)} />
          <div className="sp-row">
            <Slider label="Line height" value={look.lineHeight} min={80} max={160} unit="%" onChange={(v) => up("lineHeight", v)} />
          </div>
          {!look.posterFit && (
            <div className="sp-row" role="radiogroup" aria-label="Alignment">
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={`sp-btn${look.align === a ? " on" : ""}`} onClick={() => up("align", a)}>{a}</button>
              ))}
            </div>
          )}
        </div>

        <div className="sp-group">
          <div className="sp-h">Font</div>
          <FontPicker value={look.font} customFonts={look.customFonts} onPick={(n) => { ensureFont(n); up("font", n); }} />
          <div className="sp-addfont">
            <input ref={addFontRef} className="sp-input" placeholder="Add any Google font…" onKeyDown={(e) => { if (e.key === "Enter") addFont(); }} />
            <button className="sp-btn" onClick={addFont}>Add</button>
          </div>
          {oState === "loading" && <div className="sp-note">Outlining the face…</div>}
          {oState === "none" && <div className="sp-note">Couldn't outline this face — live text for now.</div>}
        </div>

        <div className="sp-group">
          <div className="sp-h">Ink</div>
          <div className="sp-wells">
            <Well label="Letters" value={look.fill} onChange={(v) => up("fill", v)} />
            <label className="sp-check"><input type="checkbox" checked={look.inkGrad} onChange={(e) => up("inkGrad", e.target.checked)} /> Gradient</label>
            {look.inkGrad && <Well label="to" value={look.fill2} onChange={(v) => up("fill2", v)} />}
          </div>
        </div>

        <div className="sp-group">
          <div className="sp-h">Stroke</div>
          <div className="sp-wells">
            <Well label="Blob" value={look.blob} onChange={(v) => up("blob", v)} />
            <label className="sp-check"><input type="checkbox" checked={look.blobGrad} onChange={(e) => up("blobGrad", e.target.checked)} /> Gradient</label>
            {look.blobGrad && <Well label="to" value={look.blob2} onChange={(v) => up("blob2", v)} />}
          </div>
          <Slider label="Width" value={look.strokeW} min={0} max={24} step={0.5} unit="" onChange={(v) => up("strokeW", v)} />
        </div>

        <div className="sp-group">
          <div className="sp-h">Shine</div>
          <div className="sp-wells">
            <label className="sp-check"><input type="checkbox" checked={look.shine} onChange={(e) => up("shine", e.target.checked)} /> On</label>
            {look.shine && <Well label="Color" value={look.shineColor} onChange={(v) => up("shineColor", v)} />}
            {look.shine && (
              <select className="sp-input sp-select" value={look.shineBlend} aria-label="Shine blend"
                onChange={(e) => up("shineBlend", e.target.value as SplashLook["shineBlend"])}>
                {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>
          {look.shine && (
            <>
              <Slider label="Size" value={look.shineSize} min={1} max={10} step={0.5} unit="" onChange={(v) => up("shineSize", v)} />
              <Slider label="Inset" value={look.shineInset} min={0} max={6} step={0.5} unit="" onChange={(v) => up("shineInset", v)} />
              <Slider label="Roundness" value={look.shineRound} min={0} max={6} step={0.5} unit="" onChange={(v) => up("shineRound", v)} />
            </>
          )}
        </div>

        <div className="sp-group">
          <div className="sp-h">Pattern</div>
          <div className="sp-wells">
            <label className="sp-check"><input type="checkbox" checked={look.pattern.on} onChange={(e) => up("pattern", { ...look.pattern, on: e.target.checked })} /> On</label>
            {look.pattern.on && (
              <select className="sp-input sp-select" value={look.pattern.style} aria-label="Pattern style"
                onChange={(e) => up("pattern", { ...look.pattern, style: e.target.value })}>
                {PATTERN_TYPES.filter((p) => p.id !== "none").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          {look.pattern.on && (
            <>
              <Slider label="Scale" value={look.pattern.scale} min={25} max={300} unit="%" onChange={(v) => up("pattern", { ...look.pattern, scale: v })} />
              <Slider label="Angle" value={look.pattern.angle} min={0} max={180} unit="°" onChange={(v) => up("pattern", { ...look.pattern, angle: v })} />
              <Slider label="Opacity" value={look.pattern.opacity} min={0} max={100} unit="%" onChange={(v) => up("pattern", { ...look.pattern, opacity: v })} />
            </>
          )}
        </div>

        <div className="sp-group">
          <div className="sp-h">Body</div>
          <Slider label="Depth" value={look.depth} min={0} max={28} step={0.5} unit="" onChange={(v) => up("depth", v)} />
          <Slider label="Shadow" value={look.shadow} min={0} max={60} unit="%" onChange={(v) => up("shadow", v)} />
        </div>

        <div className="sp-group">
          <div className="sp-h">Shape — the word is one object</div>
          <Slider label="Bounce" value={look.bounce} min={0} max={100} unit="%" onChange={(v) => up("bounce", v)} />
          <Slider label="Arch" value={look.arc} min={-100} max={100} unit="%" onChange={(v) => up("arc", v)} />
          <Slider label="Bulge" value={look.bulge} min={-100} max={100} unit="%" onChange={(v) => up("bulge", v)} />
        </div>

        <div className="sp-group">
          <div className="sp-h">Export</div>
          <div className="sp-row">
            {[1, 2, 4].map((s) => (
              <button key={s} className={`sp-btn${pngScale === s ? " on" : ""}`} onClick={() => setPngScale(s)}>{s}x</button>
            ))}
          </div>
          <div className="sp-row">
            <button className="sp-btn on" disabled={busy !== null} onClick={() => void dlSvg()}>{busy === "svg" ? "Working…" : "SVG"}</button>
            <button className="sp-btn on" disabled={busy !== null} onClick={() => void dlPng()}>{busy === "png" ? "Working…" : `PNG ${pngScale}x`}</button>
          </div>
          <div className="sp-note">Outlined SVG needs no font installed — it opens true anywhere.</div>
        </div>

        <div className="sp-foot">build {__BUILD_STAMP__}</div>
      </aside>

      <main className={`sp-stage${look.stage.mode === "transparent" && !look.stage.image ? " sp-checker" : ""}${panMode ? " sp-panning" : ""}`}
        style={look.stage.image
          ? { backgroundImage: `url(${look.stage.image})`, backgroundSize: "cover", backgroundPosition: "center" }
          : look.stage.mode === "color" ? { background: look.stage.color } : undefined}>
        <div ref={scrollRef} className="sp-scroll" onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp}>
          <div className="sp-zoomwrap" style={{ zoom }}>
            <div className="sp-art" dangerouslySetInnerHTML={{ __html: finalSvg }} />
          </div>
        </div>
        <div className="sp-floater" role="toolbar" aria-label="Canvas">
          <button className={panMode ? "on" : ""} title="Pan (or drag with the middle button)" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>
            <Hand size={17} strokeWidth={1.8} />
          </button>
          <span className="sp-zdiv" />
          <button title="Zoom out" onClick={() => zoomTo(zoom - 0.1)}><Minus size={17} strokeWidth={1.8} /></button>
          <span className="sp-zpct" onClick={() => zoomTo(1)} title="Back to 100%">{Math.round(zoom * 100)}%</span>
          <button title="Zoom in (Cmd+scroll works too)" onClick={() => zoomTo(zoom + 0.1)}><Plus size={17} strokeWidth={1.8} /></button>
          <span className="sp-zdiv" />
          <button title="Background image — see the words on a real screen" className={look.stage.image ? "on" : ""}
            onClick={() => bgInput.current?.click()}>
            <ImagePlus size={16} strokeWidth={1.8} />
          </button>
          {look.stage.image && (
            <button title="Clear background image" onClick={() => up("stage", { ...look.stage, image: null })}>
              <X size={15} strokeWidth={2} />
            </button>
          )}
          <input ref={bgInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fileToBgDataUrl(f).then((url) => up("stage", { ...look.stage, image: url }));
              e.target.value = "";
            }} />
          <span className="sp-zdiv" />
          {SPLASH_STAGE_CHIPS.map((c) => (
            <button key={c} className={`sp-chip${look.stage.mode === "color" && !look.stage.image && look.stage.color === c ? " on" : ""}`}
              style={{ background: c }} aria-label={`Stage ${c}`} title={`Stage ${c}`}
              onClick={() => up("stage", { mode: "color", color: c, image: null })} />
          ))}
          <label className="sp-chip sp-chip-custom" title="Custom stage color">
            <input type="color" value={look.stage.color} onChange={(e) => up("stage", { mode: "color", color: e.target.value, image: null })} />
          </label>
          <button className={`sp-chip sp-chip-clear${look.stage.mode === "transparent" && !look.stage.image ? " on" : ""}`} title="Transparent (exports transparent art)"
            onClick={() => up("stage", { mode: "transparent", color: look.stage.color, image: null })}>∅</button>
        </div>
      </main>
    </div>
  );
}
