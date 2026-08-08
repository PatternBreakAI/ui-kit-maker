import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderTypeSpecimen } from "@/generator/bevel";
import { registerCustomFont, fontByName } from "@/generator/model";
import { ensureFont } from "@/generator/fonts";
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

  const up = useCallback(<K extends keyof SplashLook>(k: K, v: SplashLook[K]) => setLook((l) => ({ ...l, [k]: v })), []);

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
    const t = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(look)); } catch { /* private mode */ } }, 400);
    return () => clearTimeout(t);
  }, [look]);

  const finalSvg = useMemo(() => {
    const cfg = buildSplashCfg(look);
    const t = cfg.type;
    const k = t.size / 52;
    const fxPad = Math.ceil(
      (look.depth + Math.abs((look.drift / 100) * look.depth) + look.wrap) * k +
      (look.shadow > 0 ? look.depth * k + 18 : 0) + t.size * (0.12 + (look.bounce / 100) * 0.14) + 24,
    );
    const text = look.text || " ";
    if (oFont) {
      const tp = flatWordOutline(oFont, text, t.size, t.spacing / 100, look.bounce / 100, {
        arc: look.arc / 100, bulge: look.bulge / 100, rotate: look.rotate,
      });
      const reach = Math.max(0, Math.max(Math.abs(tp.minY ?? 0), tp.maxY ?? 0) - t.size);
      return renderTypeSpecimen(cfg, text, { fxPad: fxPad + Math.ceil(reach), keepCase: true, textPath: tp });
    }
    return renderTypeSpecimen(cfg, text, { fxPad }); // live text while outlines load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, oFont, fontTick]);

  // exports — outlined SVGs need no font at all; the text fallback embeds one
  const svgForExport = async (): Promise<string> => {
    let s = finalSvg;
    if (look.stage.mode === "color") {
      const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(s);
      if (vb) s = s.replace(/(<svg[^>]*>)/, `$1<rect x="${vb[1]}" y="${vb[2]}" width="${vb[3]}" height="${vb[4]}" fill="${look.stage.color}"/>`);
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

  const Well = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <label className="sp-well"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /><span>{label}</span></label>
  );

  return (
    <div className="sp-app">
      <aside className="sp-side">
        <div className="sp-brand">
          <span className="sp-mark" style={{ fontFamily: "'Modak', 'Lilita One', Inter, sans-serif" }}>SPLASH TEXT</span>
          <span className="sp-sub">super over-illustrated words · one shape, still editable</span>
        </div>

        <div className="sp-group">
          <input className="sp-text" value={look.text} maxLength={32} aria-label="Text"
            onChange={(e) => up("text", e.target.value)} />
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
            <Well label="Blob" value={look.blob} onChange={(v) => up("blob", v)} />
            <label className="sp-check"><input type="checkbox" checked={look.sparkles} onChange={(e) => up("sparkles", e.target.checked)} /> Sparkles</label>
          </div>
        </div>

        <div className="sp-group">
          <div className="sp-h">Body</div>
          <Slider label="Depth" value={look.depth} min={0} max={28} step={0.5} unit="" onChange={(v) => up("depth", v)} />
          <Slider label="Lean" value={look.drift} min={-100} max={100} unit="%" onChange={(v) => up("drift", v)} />
          <Slider label="Wrap" value={look.wrap} min={0} max={16} step={0.5} unit="" onChange={(v) => up("wrap", v)} />
          <Slider label="Shadow" value={look.shadow} min={0} max={60} unit="%" onChange={(v) => up("shadow", v)} />
        </div>

        <div className="sp-group">
          <div className="sp-h">Shape — the word is one object</div>
          <Slider label="Bounce" value={look.bounce} min={0} max={100} unit="%" onChange={(v) => up("bounce", v)} />
          <Slider label="Turn" value={look.rotate} min={-30} max={30} unit="°" onChange={(v) => up("rotate", v)} />
          <Slider label="Arch" value={look.arc} min={-100} max={100} unit="%" onChange={(v) => up("arc", v)} />
          <Slider label="Bulge" value={look.bulge} min={-100} max={100} unit="%" onChange={(v) => up("bulge", v)} />
        </div>

        <div className="sp-group">
          <div className="sp-h">Stage</div>
          <div className="sp-chips">
            {SPLASH_STAGE_CHIPS.map((c) => (
              <button key={c} className={`sp-chip${look.stage.mode === "color" && look.stage.color === c ? " on" : ""}`}
                style={{ background: c }} aria-label={`Stage ${c}`}
                onClick={() => up("stage", { mode: "color", color: c })} />
            ))}
            <label className="sp-chip sp-chip-custom" title="Custom color">
              <input type="color" value={look.stage.color} onChange={(e) => up("stage", { mode: "color", color: e.target.value })} />
            </label>
            <button className={`sp-chip sp-chip-clear${look.stage.mode === "transparent" ? " on" : ""}`} title="Transparent"
              onClick={() => up("stage", { ...look.stage, mode: "transparent" })}>∅</button>
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

      <main className={`sp-stage${look.stage.mode === "transparent" ? " sp-checker" : ""}`}
        style={look.stage.mode === "color" ? { background: look.stage.color } : undefined}>
        <div className="sp-art" dangerouslySetInnerHTML={{ __html: finalSvg }} />
      </main>
    </div>
  );
}
