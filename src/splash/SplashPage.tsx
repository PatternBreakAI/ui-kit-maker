import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, ImagePlus, Minus, Plus, X } from "lucide-react";
import { renderTypeSpecimen } from "@/generator/bevel";
import { registerCustomFont, fontByName, GAME_FONTS, PATTERN_TYPES } from "@/generator/model";
import { ensureFont } from "@/generator/fonts";
import { fileToBgDataUrl } from "@/generator/store";
import { downloadSvg, downloadPng, inlineKitFace } from "@/generator/exportUtils";
import { Slider, FontPicker, AngleDial, FxToggle } from "@/ui/controls";
import { loadOutlineFont, flatWordOutline } from "./outline";
import { SPLASH_FONT_NAMES, registerSplashFonts, splashFontDef } from "./fonts";
import type { Font } from "opentype.js";
import { buildSplashCfg, SPLASH_DEFAULT, SPLASH_STAGE_CHIPS, SPLASH_STYLES } from "./look";
import type { SplashLook, SplashStyle } from "./look";
import "@/styles/splash.css";

/* SPLASH TEXT — super over-illustrated words. One look, nailed first:
   the flat retro sticker. The whole word is ONE compound vector shape —
   outlines regenerate as you type, every treatment (blob, block
   extrusion, shadow, sparkles) hangs off that single shape, and any
   depth is 2D trompe-l'œil. The UI carries only what this look needs. */

const LS_KEY = "splash-v1";
const STYLES_KEY = "splash-styles-v1";
const TRAY_W_KEY = "splash-trayw";

registerSplashFonts(); // the fat shelf, with true caps — before first render

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
  const mark = useCallback((l: SplashLook) => {
    const now = Date.now();
    if (now - lastPush.current > 400) {
      past.current.push(l);
      if (past.current.length > 60) past.current.shift();
      future.current = [];
    }
    lastPush.current = now;
  }, []);
  const patch = useCallback((p: Partial<SplashLook>) => setLook((l) => { mark(l); return { ...l, ...p }; }), [mark]);
  const up = useCallback(<K extends keyof SplashLook>(k: K, v: SplashLook[K]) => patch({ [k]: v }), [patch]);
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
    void loadOutlineFont(look.font, look.weight, splashFontDef(look.font)?.ttf).then((f) => {
      if (!alive) return;
      setOFont(f);
      setOState(f ? "ready" : "none");
    });
    return () => { alive = false; };
  }, [look.font, look.weight, look.customFonts]);
  useEffect(() => {
    const onDone = () => setFontTick((v) => v + 1);
    document.fonts?.addEventListener?.("loadingdone", onDone);
    return () => document.fonts?.removeEventListener?.("loadingdone", onDone);
  }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Splash Text";
    // Splash chrome is dark — flip the shared Bench widgets (fx chips,
    // sliders, font picker) to their dark set while this page holds the DOM
    const prevTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    return () => {
      document.title = prev;
      if (prevTheme === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = prevTheme;
    };
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

  /* the words open big and centered — recenter the scrollport on boot and
     again when the outlined art swaps in at its final size. Never on look
     edits: that would fight the user's own panning. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [oState]);

  /* the tray edge is a sash, exactly like UIKM's panel — pull it in the
     browser to resize; the width sticks. Same clamp as the kit editor so
     the two apps feel like one system. */
  const [trayW, setTrayW] = useState(() => {
    try { const v = Number(localStorage.getItem(TRAY_W_KEY)); return v >= 300 && v <= 560 ? v : 300; } catch { return 300; }
  });
  const sashFrom = useRef<{ x: number; w: number } | null>(null);
  const onSashDown = (e: React.PointerEvent) => {
    sashFrom.current = { x: e.clientX, w: trayW };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onSashMove = (e: React.PointerEvent) => {
    if (!sashFrom.current) return;
    const v = Math.max(300, Math.min(560, Math.round(sashFrom.current.w + (e.clientX - sashFrom.current.x))));
    setTrayW(v);
    try { localStorage.setItem(TRAY_W_KEY, String(v)); } catch { /* private mode */ }
  };
  const onSashUp = () => { sashFrom.current = null; };

  /* styles — the starter shelf plus the user's own saves. A style is the
     whole look minus the words: applying one restyles what's typed. */
  const [myStyles, setMyStyles] = useState<{ id: string; name: string; style: SplashStyle }[]>(() => {
    try { return JSON.parse(localStorage.getItem(STYLES_KEY) ?? "[]") ?? []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(STYLES_KEY, JSON.stringify(myStyles)); } catch { /* private mode */ }
  }, [myStyles]);
  const styleNameRef = useRef<HTMLInputElement>(null);
  const applyStyle = useCallback((s: SplashStyle) => {
    registerCustomFont(s.font); // no-op for catalog faces
    ensureFont(s.font);
    setLook((l) => {
      past.current.push(l);
      future.current = [];
      lastPush.current = 0;
      return {
        ...l, ...s,
        customFonts: !GAME_FONTS.some((f) => f.name === s.font) && !l.customFonts.includes(s.font)
          ? [...l.customFonts, s.font] : l.customFonts,
        // an uploaded backdrop is content, not style — it survives the switch
        stage: l.stage.image ? { ...s.stage, image: l.stage.image } : { ...s.stage, image: null },
      };
    });
  }, []);
  const saveStyle = () => {
    const name = styleNameRef.current?.value.trim() || `My style ${myStyles.length + 1}`;
    const { text: _t, customFonts: _cf, letterScales: _ls, ...style } = look;
    setMyStyles((arr) => [...arr, {
      id: `u${Date.now().toString(36)}`, name,
      // never bake an uploaded image into a saved style — data URLs would
      // blow past the localStorage quota in a couple of saves
      style: { ...style, stage: { mode: look.stage.mode, color: look.stage.color, image: null } },
    }]);
    if (styleNameRef.current) styleNameRef.current.value = "";
  };

  /* per-letter selection: the outline pipeline reports each glyph's box
     in path-local coords; the engine places that path with one translate
     we read back out of the emitted SVG. A canvas click maps through
     viewBox → translate → boxes and lands on ONE letter. */
  const glyphBoxes = useRef<{ gi: number; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const [selGi, setSelGi] = useState<number | null>(null);

  const finalSvg = useMemo(() => {
    const cfg = buildSplashCfg(look);
    const t = cfg.type;
    const k = t.size / 52;
    // pad grows with the wrap, contours and the DEEPEST line — nothing may
    // clip flat against the canvas or the filter region (0.55 lean baked in)
    const maxDepth = Math.max(look.depth, ...look.lineStyles.map((ls) => ls?.depth ?? 0));
    const ctrW = look.contours.reduce((a, c) => a + c.width, 0);
    const fxPad = Math.ceil(
      (maxDepth + maxDepth * 0.55 + look.strokeW + ctrW) * k +
      (look.shadow > 0 ? maxDepth * k + 18 : 0) + t.size * (0.12 + (look.bounce / 100) * 0.14) + 24,
    );
    const text = look.text || " ";
    if (oFont) {
      const tp = flatWordOutline(oFont, text, t.size, t.spacing / 100, look.bounce / 100, {
        arc: look.arc / 100, bulge: (look.bulgeOn ? look.bulge : 0) / 100,
        lineHeight: look.lineHeight / 100, align: look.align,
        fit: look.posterFit ? "column" : "none", groove: look.groove / 100,
        letterScales: look.letterScales,
      });
      glyphBoxes.current = tp.glyphs ?? [];
      const reach = Math.max(0, Math.max(Math.abs(tp.minY ?? 0), tp.maxY ?? 0) - t.size * 0.7);
      return renderTypeSpecimen(cfg, text.replace(/\n/g, " "), {
        fxPad: fxPad + Math.ceil(reach), keepCase: true,
        textPath: { ...tp, gy1: tp.minY, gy2: tp.maxY },
      });
    }
    // live text while outlines load — single line only, so fold the returns
    glyphBoxes.current = [];
    return renderTypeSpecimen(cfg, text.replace(/\n+/g, " "), { fxPad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, oFont, fontTick]);

  /* local ⇄ screen mapping via the live DOM: every glyph-path layer sits
     in the same translate group, and getScreenCTM folds in EVERY ancestor
     transform (the shell's lift/rise translates, CSS zoom) — string-
     parsing one translate out of the SVG missed those. */
  const artRef = useRef<HTMLDivElement>(null);
  const artCTM = useCallback(() => {
    const g = artRef.current?.querySelector('[data-part="label"] g[transform^="translate("]') as SVGGElement | null;
    return g?.getScreenCTM?.() ?? null;
  }, []);
  const onArtClick = useCallback((e: React.MouseEvent) => {
    if (panMode || !glyphBoxes.current.length) return;
    const m = artCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const pad = 3;
    const hit = glyphBoxes.current.find((g) => pt.x >= g.x1 - pad && pt.x <= g.x2 + pad && pt.y >= g.y1 - pad && pt.y <= g.y2 + pad);
    setSelGi(hit ? hit.gi : null);
  }, [panMode, artCTM]);
  // the selection frame, measured after each render of the art
  const [selRect, setSelRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (selGi === null) { setSelRect(null); return; }
    const box = glyphBoxes.current.find((g) => g.gi === selGi);
    const host = artRef.current;
    const m = artCTM();
    if (!box || !host || !m) { setSelRect(null); return; }
    const hr = host.getBoundingClientRect();
    const p1 = new DOMPoint(box.x1, box.y1).matrixTransform(m);
    const p2 = new DOMPoint(box.x2, box.y2).matrixTransform(m);
    // rects are viewport px; the host lives inside the CSS zoom, so its
    // local coordinate space is viewport ÷ zoom
    setSelRect({ l: (p1.x - hr.left) / zoom, t: (p1.y - hr.top) / zoom, w: (p2.x - p1.x) / zoom, h: (p2.y - p1.y) / zoom });
  }, [selGi, finalSvg, zoom, artCTM]);

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
    <div className="sp-app" style={{ gridTemplateColumns: `${trayW}px 6px 1fr` }}>
      <aside className="sp-side">
        <div className="sp-brand">
          <div className="sp-brand-row">
            <span className="sp-mark" style={{ fontFamily: "'Modak', 'Lilita One', Inter, sans-serif" }}>SPLASH TEXT</span>
            <button className="sp-btn sp-reset" title="Back to the factory look — your words stay (Cmd+Z undoes this too)"
              onClick={() => {
                setLook((l) => {
                  past.current.push(l); future.current = []; lastPush.current = 0;
                  return { ...SPLASH_DEFAULT, text: l.text, customFonts: l.customFonts, letterScales: l.letterScales };
                });
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
          <div className="sp-h">Styles</div>
          <div className="sp-styles">
            {SPLASH_STYLES.map((s) => (
              <button key={s.id} className="sp-btn sp-style" onClick={() => applyStyle(s.style)}>
                <span className="sp-style-dot" style={{ background: `linear-gradient(135deg, ${s.style.fill} 50%, ${s.style.blob} 50%)` }} />
                {s.name}
              </button>
            ))}
            {myStyles.map((s) => (
              <span key={s.id} className="sp-style-mine">
                <button className="sp-btn sp-style" onClick={() => applyStyle(s.style)}>
                  <span className="sp-style-dot" style={{ background: `linear-gradient(135deg, ${s.style.fill} 50%, ${s.style.blob} 50%)` }} />
                  {s.name}
                </button>
                <button className="sp-btn sp-style-x" aria-label={`Delete style ${s.name}`} title="Delete this saved style"
                  onClick={() => setMyStyles((arr) => arr.filter((x) => x.id !== s.id))}>×</button>
              </span>
            ))}
          </div>
          <div className="sp-addfont">
            <input ref={styleNameRef} className="sp-input" placeholder="Name this look…" maxLength={24}
              onKeyDown={(e) => { if (e.key === "Enter") saveStyle(); }} />
            <button className="sp-btn" title="Save the current look as your own style" onClick={saveStyle}>Save style</button>
          </div>
        </div>

        <div className="sp-group">
          <div className="sp-h">Font</div>
          <FontPicker value={look.font} customFonts={look.customFonts} fonts={SPLASH_FONT_NAMES}
            onPick={(n) => {
              ensureFont(n);
              // land on the face's fat default — a variable serif opens at
              // its heavy master, not at skinny 400
              const caps = fontByName(n).caps;
              patch({ font: n, weight: caps?.wght ? caps.wght[2] : caps?.weights?.includes(400) ? 400 : caps?.weights?.[0] ?? 400 });
            }} />
          {(() => {
            /* weight follows the face's REAL capabilities, UIKM's rule:
               variable axes get a true slider (the outlines carry the
               axis), multi-master faces pick a cut, single masters fatten
               optically in the engine */
            const caps = fontByName(look.font).caps;
            if (caps?.wght) {
              return <Slider label="Weight" value={look.weight} min={caps.wght[0]} max={caps.wght[1]} step={10} unit="" onChange={(v) => up("weight", v)} />;
            }
            const ws = caps?.weights ?? [400];
            if (ws.length > 1) {
              return (
                <div className="sp-row" role="radiogroup" aria-label="Weight">
                  {ws.map((w) => <button key={w} className={`sp-btn${look.weight === w ? " on" : ""}`} onClick={() => up("weight", w)}>{w}</button>)}
                </div>
              );
            }
            return <Slider label="Weight" value={look.weight} min={400} max={900} step={25} unit="" onChange={(v) => up("weight", v)} />;
          })()}
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
          <div className="sp-h">Construction</div>
          {look.contours.map((c, i) => (
            <div key={i} className="sp-ctr">
              <Well label={`Band ${i + 1}`} value={c.color} onChange={(v) => up("contours", look.contours.map((x, j) => (j === i ? { ...x, color: v } : x)))} />
              <Slider label="Width" value={c.width} min={0.5} max={12} step={0.5} unit=""
                onChange={(v) => up("contours", look.contours.map((x, j) => (j === i ? { ...x, width: v } : x)))} />
              <button className="sp-btn sp-mini" aria-label={`Remove contour band ${i + 1}`} title="Remove this band"
                onClick={() => up("contours", look.contours.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {look.contours.length < 3 && (
            <div className="sp-row">
              <button className="sp-btn" title="Nested outline bands — face, keyline, border. The body extrudes from the outermost band."
                onClick={() => up("contours", [...look.contours, { width: 3, color: look.contours.length % 2 ? "#F4F1EA" : "#221E1F" }])}>
                + Contour band
              </button>
            </div>
          )}
          <FxToggle label="Inline" on={look.inline.on} onToggle={(v) => up("inline", { ...look.inline, on: v })}>
            <div className="sp-wells">
              <Well label="Color" value={look.inline.color} onChange={(v) => up("inline", { ...look.inline, color: v })} />
            </div>
            <Slider label="Inset" value={look.inline.inset} min={0.5} max={8} step={0.5} unit="" onChange={(v) => up("inline", { ...look.inline, inset: v })} />
            <Slider label="Width" value={look.inline.width} min={0.5} max={6} step={0.5} unit="" onChange={(v) => up("inline", { ...look.inline, width: v })} />
            <div className="sp-note">A band inside the face — varsity, marquee, engraved lettering.</div>
          </FxToggle>
          <FxToggle label="Stroke" on={look.stroke.on} onToggle={(v) => up("stroke", { ...look.stroke, on: v })}>
            <div className="sp-wells">
              <Well label="Color" value={look.stroke.color} onChange={(v) => up("stroke", { ...look.stroke, color: v })} />
            </div>
            <Slider label="Width" value={look.stroke.width} min={0.5} max={12} step={0.5} unit="" onChange={(v) => up("stroke", { ...look.stroke, width: v })} />
            <div className="sp-note">A true contour hugging each letterform — crisp at any size.</div>
          </FxToggle>
          <FxToggle label="Shadow" on={look.dropShadow.on} onToggle={(v) => up("dropShadow", { ...look.dropShadow, on: v })}>
            <div className="sp-wells">
              <Well label="Color" value={look.dropShadow.color} onChange={(v) => up("dropShadow", { ...look.dropShadow, color: v })} />
            </div>
            <Slider label="X" value={look.dropShadow.x} min={-20} max={20} unit="" onChange={(v) => up("dropShadow", { ...look.dropShadow, x: v })} />
            <Slider label="Y" value={look.dropShadow.y} min={-20} max={20} unit="" onChange={(v) => up("dropShadow", { ...look.dropShadow, y: v })} />
            <Slider label="Blur" value={look.dropShadow.blur} min={0} max={20} unit="" onChange={(v) => up("dropShadow", { ...look.dropShadow, blur: v })} />
            <Slider label="Opacity" value={look.dropShadow.opacity} min={0} max={100} unit="%" onChange={(v) => up("dropShadow", { ...look.dropShadow, opacity: v })} />
            <div className="sp-note">Falls behind the letters and stroke, in front of the backsplash.</div>
          </FxToggle>
        </div>

        <div className="sp-group">
          <div className="sp-h">Backsplash</div>
          <FxToggle label="Backsplash" on={look.backsplash} onToggle={(v) => up("backsplash", v)}>
            <div className="sp-wells">
              <Well label="Blob" value={look.blob} onChange={(v) => up("blob", v)} />
              <label className="sp-check"><input type="checkbox" checked={look.blobGrad} onChange={(e) => up("blobGrad", e.target.checked)} /> Gradient</label>
              {look.blobGrad && <Well label="to" value={look.blob2} onChange={(v) => up("blob2", v)} />}
            </div>
            <Slider label="Width" value={look.strokeW} min={0} max={24} step={0.5} unit="" onChange={(v) => up("strokeW", v)} />
            <FxToggle label="Pattern" on={look.blobPattern.on} onToggle={(v) => up("blobPattern", { ...look.blobPattern, on: v })}>
              <div className="sp-wells">
                <select className="sp-input sp-select" value={look.blobPattern.style} aria-label="Backsplash pattern style"
                  onChange={(e) => up("blobPattern", { ...look.blobPattern, style: e.target.value })}>
                  {PATTERN_TYPES.filter((p) => p.id !== "none").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="sp-wells">
                <Well label="Color" value={look.blobPattern.color ?? "#9AA0AA"} onChange={(v) => up("blobPattern", { ...look.blobPattern, color: v })} />
                <button className={`sp-btn sp-mini${look.blobPattern.color === null ? " on" : ""}`} title="Tone-on-tone from the blob color"
                  onClick={() => up("blobPattern", { ...look.blobPattern, color: null })}>Auto</button>
                <select className="sp-input sp-select" value={look.blobPattern.blend} aria-label="Backsplash pattern blend"
                  onChange={(e) => up("blobPattern", { ...look.blobPattern, blend: e.target.value as SplashLook["blobPattern"]["blend"] })}>
                  {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <Slider label="Scale" value={look.blobPattern.scale} min={25} max={300} unit="%" onChange={(v) => up("blobPattern", { ...look.blobPattern, scale: v })} />
              <Slider label="Angle" value={look.blobPattern.angle} min={0} max={180} unit="°" onChange={(v) => up("blobPattern", { ...look.blobPattern, angle: v })} />
              <Slider label="Opacity" value={look.blobPattern.opacity} min={0} max={100} unit="%" onChange={(v) => up("blobPattern", { ...look.blobPattern, opacity: v })} />
            </FxToggle>
          </FxToggle>
        </div>

        <div className="sp-group">
          <div className="sp-h">Light</div>
          <div className="sp-lightrow">
            <AngleDial value={look.lightAngle} onChange={(v) => up("lightAngle", v)} />
            <div className="sp-note">The master light — shine crescents and sparkles swing with it.</div>
          </div>
        </div>

        <div className="sp-group">
          <div className="sp-h">Effects</div>
          <FxToggle label="Wall bevel" on={look.wall.on} onToggle={(v) => up("wall", { ...look.wall, on: v })}>
            <Slider label="Width" value={look.wall.width} min={0.5} max={8} step={0.5} unit="" onChange={(v) => up("wall", { ...look.wall, width: v })} />
            <Slider label="Softness" value={look.wall.soft} min={0} max={100} unit="%" onChange={(v) => up("wall", { ...look.wall, soft: v })} />
            <Slider label="Strength" value={look.wall.strength} min={0} max={100} unit="%" onChange={(v) => up("wall", { ...look.wall, strength: v })} />
            <div className="sp-note">The chiseled candy edge — slopes light and shade with the master light.</div>
          </FxToggle>
          <FxToggle label="Ink shine" on={look.shine} onToggle={(v) => up("shine", v)}>
            <div className="sp-wells">
              <Well label="Color" value={look.shineColor} onChange={(v) => up("shineColor", v)} />
              <select className="sp-input sp-select" value={look.shineBlend} aria-label="Shine blend"
                onChange={(e) => up("shineBlend", e.target.value as SplashLook["shineBlend"])}>
                {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Slider label="Size" value={look.shineSize} min={1} max={10} step={0.5} unit="" onChange={(v) => up("shineSize", v)} />
            <Slider label="Inset" value={look.shineInset} min={0} max={6} step={0.5} unit="" onChange={(v) => up("shineInset", v)} />
            <Slider label="Opacity" value={look.shineOpacity} min={0} max={100} unit="%" onChange={(v) => up("shineOpacity", v)} />
            <Slider label="Roundness" value={look.shineRound} min={0} max={6} step={0.5} unit="" onChange={(v) => up("shineRound", v)} />
          </FxToggle>
          <FxToggle label="Sparkle" on={look.glints.on} onToggle={(v) => up("glints", { ...look.glints, on: v })}>
            <div className="sp-wells">
              <select className="sp-input sp-select" value={look.glints.style} aria-label="Sparkle style"
                onChange={(e) => up("glints", { ...look.glints, style: e.target.value as SplashLook["glints"]["style"] })}>
                {(["slab", "stars", "streak", "sheen"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="sp-input sp-select" value={look.glints.blend} aria-label="Sparkle blend"
                onChange={(e) => up("glints", { ...look.glints, blend: e.target.value as SplashLook["glints"]["blend"] })}>
                {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Slider label="Opacity" value={look.glints.opacity} min={0} max={100} unit="%" onChange={(v) => up("glints", { ...look.glints, opacity: v })} />
          </FxToggle>
          <FxToggle label="Pattern" on={look.pattern.on} onToggle={(v) => up("pattern", { ...look.pattern, on: v })}>
            <div className="sp-wells">
              <select className="sp-input sp-select" value={look.pattern.style} aria-label="Pattern style"
                onChange={(e) => up("pattern", { ...look.pattern, style: e.target.value })}>
                {PATTERN_TYPES.filter((p) => p.id !== "none").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sp-wells">
              <Well label="Color" value={look.pattern.color ?? "#9AA0AA"} onChange={(v) => up("pattern", { ...look.pattern, color: v })} />
              <button className={`sp-btn sp-mini${look.pattern.color === null ? " on" : ""}`} title="Tone-on-tone from the ink color"
                onClick={() => up("pattern", { ...look.pattern, color: null })}>Auto</button>
              <select className="sp-input sp-select" value={look.pattern.blend} aria-label="Pattern blend"
                onChange={(e) => up("pattern", { ...look.pattern, blend: e.target.value as SplashLook["pattern"]["blend"] })}>
                {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Slider label="Scale" value={look.pattern.scale} min={25} max={300} unit="%" onChange={(v) => up("pattern", { ...look.pattern, scale: v })} />
            <Slider label="Angle" value={look.pattern.angle} min={0} max={180} unit="°" onChange={(v) => up("pattern", { ...look.pattern, angle: v })} />
            <Slider label="Opacity" value={look.pattern.opacity} min={0} max={100} unit="%" onChange={(v) => up("pattern", { ...look.pattern, opacity: v })} />
          </FxToggle>
        </div>

        <div className="sp-group">
          <div className="sp-h">Body</div>
          <Slider label="Depth" value={look.depth} min={0} max={28} step={0.5} unit="" onChange={(v) => up("depth", v)} />
          <Slider label="Shadow" value={look.shadow} min={0} max={60} unit="%" onChange={(v) => up("shadow", v)} />
          <Slider label="Gloss" value={look.gloss} min={0} max={100} unit="%" onChange={(v) => up("gloss", v)} />
          {look.gloss > 0 && (
            <>
              <Slider label="Coverage" value={look.glossCover} min={20} max={60} unit="%" onChange={(v) => up("glossCover", v)} />
              <div className="sp-wells">
                <select className="sp-input sp-select" value={look.glossBlend} aria-label="Gloss blend"
                  onChange={(e) => up("glossBlend", e.target.value as SplashLook["glossBlend"])}>
                  {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="sp-group">
          <div className="sp-h">Shape — the word is one object</div>
          <Slider label="Bounce" value={look.bounce} min={0} max={100} unit="%" onChange={(v) => up("bounce", v)} />
          <Slider label="Arch" value={look.arc} min={-100} max={100} unit="%" onChange={(v) => up("arc", v)} />
          <div className="sp-bulge">
            {/* dragging the slider always wakes the effect back up */}
            <Slider label="Bulge" value={look.bulge} min={-100} max={100} unit="%" onChange={(v) => patch({ bulge: v, bulgeOn: true })} />
            <button className={`sp-btn sp-mini${look.bulgeOn ? "" : " on"}`} aria-pressed={!look.bulgeOn}
              title="Mute the bulge — the slider keeps its setting"
              onClick={() => up("bulgeOn", !look.bulgeOn)}>Off</button>
          </div>
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

      <div className="sp-resize" role="separator" aria-orientation="vertical" aria-label="Resize tray"
        onPointerDown={onSashDown} onPointerMove={onSashMove}
        onPointerUp={onSashUp} onPointerCancel={onSashUp} />

      <main className={`sp-stage${look.stage.mode === "transparent" && !look.stage.image ? " sp-checker" : ""}${panMode ? " sp-panning" : ""}`}
        style={look.stage.image
          ? { backgroundImage: `url(${look.stage.image})`, backgroundSize: "cover", backgroundPosition: "center" }
          : look.stage.mode === "color" ? { background: look.stage.color } : undefined}>
        <div ref={scrollRef} className="sp-scroll" onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp}>
          <div className="sp-zoomwrap" style={{ zoom }}>
            <div ref={artRef} className="sp-art" onClick={onArtClick} title={glyphBoxes.current.length ? "Click a letter to size it" : undefined}>
              <div dangerouslySetInnerHTML={{ __html: finalSvg }} />
              {selRect && (
                <span className="sp-letterbox" style={{
                  left: `${selRect.l.toFixed(1)}px`, top: `${selRect.t.toFixed(1)}px`,
                  width: `${selRect.w.toFixed(1)}px`, height: `${selRect.h.toFixed(1)}px`,
                }} />
              )}
            </div>
          </div>
        </div>
        {selGi !== null && (
          <div className="sp-letterbar" role="toolbar" aria-label="Letter size">
            <span className="sp-lb-name">Letter size</span>
            <input type="range" min={40} max={250} step={5} aria-label="Letter size"
              value={Math.round((look.letterScales[selGi] ?? 1) * 100)}
              onChange={(e) => { const arr = [...look.letterScales]; arr[selGi] = +e.target.value / 100; up("letterScales", arr); }} />
            <span className="sp-lb-val">{Math.round((look.letterScales[selGi] ?? 1) * 100)}%</span>
            <button className="sp-btn sp-mini" title="Back to the set size"
              onClick={() => { const arr = [...look.letterScales]; arr[selGi] = 1; up("letterScales", arr); }}>100%</button>
            {look.letterScales.some((s) => s && s !== 1) && (
              <button className="sp-btn sp-mini" title="Clear every per-letter size" onClick={() => up("letterScales", [])}>Clear all</button>
            )}
            <button className="sp-btn sp-mini" aria-label="Done sizing this letter" onClick={() => setSelGi(null)}>✕</button>
          </div>
        )}
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
