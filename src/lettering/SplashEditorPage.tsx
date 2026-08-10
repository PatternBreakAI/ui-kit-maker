/* SPLASH 2 EDITOR — first proof of the six-stage surface.
   Unboxed canvas, floating viewport toolbar (backdrop is preview-only),
   live compile of the resolvedTreatment document. Gated: ?lab=splash2 */
import { useEffect, useMemo, useState } from "react";
import type { Font } from "opentype.js";
import { loadOutlineFont } from "@/splash/outline";
import { splashFontDef } from "@/splash/fonts";
import { compileAuthored } from "./authorTile";
import type { AuthoredTreatment } from "./authorTile";
import { CANDY_PALETTES } from "./candyTile";
import { DEFAULT_DOC, STAGES } from "./editorState";
import type { EditorStage, SplashDoc } from "./editorState";

const FONTS = ["Pacifico", "Baloo 2", "Bangers", "Lilita One", "Modak", "Anton"];
const PREVIEW_SCALE = 4;

const docToTreatment = (d: SplashDoc): AuthoredTreatment => ({
  text: d.text,
  palette: CANDY_PALETTES[d.paletteName] ?? CANDY_PALETTES.Bubblegum,
  tracking: d.tracking,
  lineHeight: d.lineHeight,
  align: d.align,
  columnFit: d.columnFit,
  glyphs: d.glyphs,
  weldInk: d.weldInk,
  bevelWidth: d.bevelWidth,
  profile: d.profile,
  extraFills: d.fills.length ? d.fills : undefined,
  pattern: d.pattern,
  depthArrangement: d.depthArrangement,
  glossLayers: d.glossLayers,
  sparkles: d.sparkles,
  scene: d.scene,
  masterScale: PREVIEW_SCALE,
  seed: d.directionSeed,
});

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, margin: "8px 0", font: "500 12px Inter, sans-serif", color: "#ddd" };
const lbl: React.CSSProperties = { width: 84, color: "#999", fontSize: 11 };

export function SplashEditorPage(): JSX.Element {
  const [doc, setDoc] = useState<SplashDoc>(DEFAULT_DOC);
  const [stage, setStage] = useState<EditorStage>("type");
  const [font, setFont] = useState<Font | null>(null);
  const [zoom, setZoom] = useState(1);
  const [backdrop, setBackdrop] = useState<"dark" | "light" | "checker">("dark");

  useEffect(() => {
    void loadOutlineFont(doc.fontFamily, 700, splashFontDef(doc.fontFamily)?.ttf).then((f) => setFont(f));
  }, [doc.fontFamily]);

  const compiled = useMemo(() => {
    if (!font) return null;
    try { return compileAuthored(font, docToTreatment(doc)); } catch { return null; }
  }, [font, doc]);

  const up = (patch: Partial<SplashDoc>): void => setDoc((d) => ({ ...d, ...patch }));

  const exportSvg = (): void => {
    if (!compiled) return;
    const blob = new Blob([compiled.svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `splash-${doc.text.replace(/\W+/g, "-").toLowerCase()}.svg`;
    a.click();
  };

  const bg = backdrop === "dark" ? "#191722" : backdrop === "light" ? "#f2efe9"
    : "repeating-conic-gradient(#2a2733 0% 25%, #221f2b 0% 50%) 0 0/24px 24px";

  return (
    <div style={{ display: "flex", height: "100vh", background: "#141218", fontFamily: "Inter, sans-serif" }}>
      {/* stage rail */}
      <div style={{ width: 76, borderRight: "1px solid #2a2733", padding: "14px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        {STAGES.map((s) => (
          <button key={s.id} onClick={() => setStage(s.id)}
            style={{ background: stage === s.id ? "#332e40" : "none", border: "none", color: stage === s.id ? "#fff" : "#888", font: "600 10px Inter", padding: "10px 4px", cursor: "pointer", borderRadius: 6, margin: "0 6px" }}>
            {s.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={exportSvg} style={{ margin: "0 6px", padding: "10px 4px", background: "#E8378E", color: "#fff", border: "none", borderRadius: 6, font: "700 10px Inter", cursor: "pointer" }}>SVG</button>
      </div>

      {/* control panel for the active stage */}
      <div style={{ width: 250, borderRight: "1px solid #2a2733", padding: 14, overflowY: "auto" }}>
        {stage === "style" && (
          <>
            <div style={{ ...row, color: "#fff", fontWeight: 700 }}>Candy</div>
            <div style={row}><span style={lbl}>palette</span>
              <select value={doc.paletteName} onChange={(e) => up({ paletteName: e.target.value })}>
                {Object.keys(CANDY_PALETTES).map((p) => <option key={p}>{p}</option>)}
              </select></div>
            <div style={{ ...row, color: "#777", fontSize: 11 }}>Composition directions land here next.</div>
          </>
        )}
        {stage === "type" && (
          <>
            <textarea value={doc.text} onChange={(e) => up({ text: e.target.value })} rows={3}
              style={{ width: "100%", background: "#1e1b26", color: "#fff", border: "1px solid #332e40", borderRadius: 6, padding: 8, font: "600 13px Inter" }} />
            <div style={row}><span style={lbl}>font</span>
              <select value={doc.fontFamily} onChange={(e) => up({ fontFamily: e.target.value })}>
                {FONTS.map((f) => <option key={f}>{f}</option>)}
              </select></div>
            <div style={row}><span style={lbl}>tracking</span>
              <input type="range" min={-0.02} max={0.08} step={0.002} value={doc.tracking ?? 0.012} onChange={(e) => up({ tracking: Number(e.target.value) })} /></div>
          </>
        )}
        {stage === "layout" && (
          <>
            <div style={row}><span style={lbl}>line height</span>
              <input type="range" min={0.7} max={1.4} step={0.02} value={doc.lineHeight ?? 1.08} onChange={(e) => up({ lineHeight: Number(e.target.value) })} /></div>
            <div style={row}><span style={lbl}>align</span>
              <select value={doc.align} onChange={(e) => up({ align: e.target.value as SplashDoc["align"] })}>
                <option>left</option><option>center</option><option>right</option>
              </select></div>
            <div style={row}><label><input type="checkbox" checked={doc.columnFit} onChange={(e) => up({ columnFit: e.target.checked })} /> Force to Column</label></div>
            <div style={row}><label><input type="checkbox" checked={doc.weldInk} onChange={(e) => up({ weldInk: e.target.checked })} /> Weld ink</label></div>
          </>
        )}
        {stage === "appearance" && (
          <>
            <div style={row}><span style={lbl}>bevel</span>
              <input type="range" min={1} max={4.5} step={0.1} value={doc.bevelWidth} onChange={(e) => up({ bevelWidth: Number(e.target.value) })} /></div>
            <div style={row}><span style={lbl}>profile</span>
              <select value={doc.profile} onChange={(e) => up({ profile: e.target.value as SplashDoc["profile"] })}>
                <option>rounded</option><option>hard</option>
              </select></div>
            <div style={row}><span style={lbl}>depth</span>
              <select value={doc.depthArrangement} onChange={(e) => up({ depthArrangement: e.target.value as SplashDoc["depthArrangement"] })}>
                <option>default</option><option>swapRings</option>
              </select></div>
          </>
        )}
        {stage === "finish" && (
          <div style={row}><label><input type="checkbox" checked={doc.sparkles} onChange={(e) => up({ sparkles: e.target.checked })} /> Sparkles</label></div>
        )}
        {stage === "scene" && (
          <div style={row}><span style={lbl}>scene</span>
            <select value={doc.scene} onChange={(e) => up({ scene: e.target.value as SplashDoc["scene"] })}>
              <option>none</option><option>stage</option><option>burst</option>
            </select></div>
        )}
      </div>

      {/* THE CANVAS — the whole region, never a card */}
      <div style={{ flex: 1, position: "relative", background: bg, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {compiled ? (
          <div style={{ transform: `scale(${zoom})`, maxWidth: "88%", lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: compiled.svg.replace(/width="\d+" height="\d+"/, `width="100%" height="auto"`) }} />
        ) : (
          <div style={{ color: "#777", font: "600 13px Inter" }}>loading face…</div>
        )}
        {/* floating viewport toolbar — backdrop is preview-only, never exported */}
        <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, background: "#1e1b26cc", border: "1px solid #332e40", borderRadius: 10, padding: "6px 10px" }}>
          {(["dark", "light", "checker"] as const).map((b) => (
            <button key={b} onClick={() => setBackdrop(b)} style={{ background: backdrop === b ? "#332e40" : "none", color: "#ccc", border: "none", borderRadius: 6, font: "600 10px Inter", padding: "4px 8px", cursor: "pointer" }}>{b}</button>
          ))}
          <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} style={{ background: "none", color: "#ccc", border: "none", cursor: "pointer" }}>−</button>
          <span style={{ color: "#888", font: "600 10px Inter", alignSelf: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))} style={{ background: "none", color: "#ccc", border: "none", cursor: "pointer" }}>+</button>
        </div>
      </div>
    </div>
  );
}
