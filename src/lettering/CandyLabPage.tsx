/* CANDY LAB — the owner-testable frontend for the Model B2 candy
   material (?lab=candy). Deliberately minimal: type a word, pick a fat
   face and a candy palette, work the bevel dials, download the 16×
   SVG/PNG. Unlinked from all navigation until released (house rule). */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadOutlineFont } from "@/splash/outline";
import { splashFontDef } from "@/splash/fonts";
import type { Font } from "opentype.js";
import { renderCandyTile, CANDY_PALETTES } from "./candyTile";

const LAB_FONTS = [
  "Baloo 2", "Bangers", "Luckiest Guy", "Titan One", "Modak",
  "Lilita One", "Archivo Black", "Pacifico", "Shrikhand", "Chonburi",
];
const PREVIEW_SCALE = 4;
const EXPORT_SCALE = 16;

const S: Record<string, React.CSSProperties> = {
  page: { display: "flex", height: "100vh", background: "#141018", color: "#EDE7F0", fontFamily: "Inter, system-ui, sans-serif" },
  tray: { width: 268, minWidth: 268, padding: "18px 16px", background: "#1D1622", borderRight: "1px solid #322838", overflowY: "auto" },
  h1: { font: "800 15px/1.2 Inter, sans-serif", letterSpacing: "0.06em", margin: "0 0 2px" },
  sub: { font: "500 11px/1.4 Inter, sans-serif", color: "#9C8FA6", margin: "0 0 14px" },
  label: { font: "700 10px/1 Inter, sans-serif", letterSpacing: "0.1em", color: "#B7A8C2", textTransform: "uppercase", margin: "14px 0 6px", display: "block" },
  input: { width: "100%", boxSizing: "border-box", padding: "8px 10px", background: "#141018", color: "#EDE7F0", border: "1px solid #3A2F42", borderRadius: 8, font: "600 14px Inter, sans-serif" },
  row: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: { padding: "6px 10px", borderRadius: 8, border: "1px solid #3A2F42", background: "#141018", color: "#CFC3D8", font: "600 11px Inter, sans-serif", cursor: "pointer" },
  chipOn: { background: "#EDE7F0", color: "#1D1622", borderColor: "#EDE7F0" },
  slider: { width: "100%" },
  readout: { font: "600 10px Inter, sans-serif", color: "#8F8199" },
  stage: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, overflow: "auto" },
  svgWrap: { maxWidth: "100%", maxHeight: "100%", boxShadow: "0 18px 60px rgba(0,0,0,0.45)", borderRadius: 10, overflow: "hidden", lineHeight: 0 },
  btn: { padding: "9px 12px", borderRadius: 8, border: "none", background: "#EDE7F0", color: "#1D1622", font: "700 12px Inter, sans-serif", cursor: "pointer", width: "100%", marginTop: 8 },
  btn2: { padding: "9px 12px", borderRadius: 8, border: "1px solid #3A2F42", background: "transparent", color: "#EDE7F0", font: "700 12px Inter, sans-serif", cursor: "pointer", width: "100%", marginTop: 8 },
  note: { font: "500 10px/1.5 Inter, sans-serif", color: "#8F8199", marginTop: 12 },
};

function download(name: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function CandyLabPage(): React.ReactElement {
  const [text, setText] = useState("Dream");
  const [fontName, setFontName] = useState("Baloo 2");
  const [paletteName, setPaletteName] = useState("Bubblegum");
  const [bevel, setBevel] = useState(3.0);
  const [profile, setProfile] = useState<"rounded" | "hard">("rounded");
  const [gloss, setGloss] = useState(0.9);
  const [bounce, setBounce] = useState(false);
  const [sparkles, setSparkles] = useState(true);
  const [font, setFont] = useState<Font | null>(null);
  const [fontLoading, setFontLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number>(0);
  const [debouncedText, setDebouncedText] = useState(text);

  useEffect(() => {
    setFontLoading(true);
    void loadOutlineFont(fontName, 700, splashFontDef(fontName)?.ttf).then((f) => {
      setFont(f);
      setFontLoading(false);
    });
  }, [fontName]);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedText(text), 110);
    return () => window.clearTimeout(debounceRef.current);
  }, [text]);

  const opts = useMemo(() => ({
    text: debouncedText.trim() || "Dream",
    palette: CANDY_PALETTES[paletteName],
    bevelWidth: bevel,
    profile,
    bounce,
    gloss,
    sparkles,
  }), [debouncedText, paletteName, bevel, profile, bounce, gloss, sparkles]);

  const tile = useMemo(() => {
    if (!font) return null;
    try {
      return renderCandyTile(font, { ...opts, masterScale: PREVIEW_SCALE });
    } catch {
      return null;
    }
  }, [font, opts]);

  const exportSvg = () => {
    if (!font) return;
    const t = renderCandyTile(font, { ...opts, masterScale: EXPORT_SCALE });
    download(`splash-candy-${opts.text.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "tile"}.svg`, new Blob([t.svg], { type: "image/svg+xml" }));
  };

  const exportPng = () => {
    if (!font || busy) return;
    setBusy(true);
    const t = renderCandyTile(font, { ...opts, masterScale: EXPORT_SCALE });
    const url = URL.createObjectURL(new Blob([t.svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = t.w; canvas.height = t.h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((png) => {
          if (png) download(`splash-candy-${opts.text.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "tile"}.png`, png);
          setBusy(false);
        }, "image/png");
      } else setBusy(false);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setBusy(false); URL.revokeObjectURL(url); };
    img.src = url;
  };

  return (
    <div style={S.page}>
      <div style={S.tray}>
        <h1 style={S.h1}>CANDY LAB</h1>
        <p style={S.sub}>Model B2 material test — profiled shared-domain bevel</p>

        <label style={S.label}>Text</label>
        <input style={S.input} value={text} onChange={(e) => setText(e.target.value)} maxLength={24} />

        <label style={S.label}>Font</label>
        <div style={S.row}>
          {LAB_FONTS.map((f) => (
            <button key={f} style={{ ...S.chip, ...(f === fontName ? S.chipOn : {}) }} onClick={() => setFontName(f)}>{f}</button>
          ))}
        </div>

        <label style={S.label}>Candy</label>
        <div style={S.row}>
          {Object.keys(CANDY_PALETTES).map((p) => (
            <button key={p} style={{ ...S.chip, ...(p === paletteName ? S.chipOn : {}) }} onClick={() => setPaletteName(p)}>{p}</button>
          ))}
        </div>

        <label style={S.label}>Bevel width — {bevel.toFixed(1)}{tile ? ` (used ${tile.effWidth.toFixed(1)})` : ""}</label>
        <input style={S.slider} type="range" min={1} max={6} step={0.1} value={bevel} onChange={(e) => setBevel(Number(e.target.value))} />
        <div style={S.readout}>the optical limiter protects thin letters automatically</div>

        <label style={S.label}>Profile</label>
        <div style={S.row}>
          {(["rounded", "hard"] as const).map((p) => (
            <button key={p} style={{ ...S.chip, ...(p === profile ? S.chipOn : {}) }} onClick={() => setProfile(p)}>{p}</button>
          ))}
        </div>

        <label style={S.label}>Gloss — {Math.round(gloss * 100)}%</label>
        <input style={S.slider} type="range" min={0} max={1} step={0.05} value={gloss} onChange={(e) => setGloss(Number(e.target.value))} />

        <label style={S.label}>Extras</label>
        <div style={S.row}>
          <button style={{ ...S.chip, ...(sparkles ? S.chipOn : {}) }} onClick={() => setSparkles(!sparkles)}>sparkles</button>
          <button style={{ ...S.chip, ...(bounce ? S.chipOn : {}) }} onClick={() => setBounce(!bounce)}>cool bounce</button>
        </div>

        <label style={S.label}>Export (16× master)</label>
        <button style={S.btn} onClick={exportSvg} disabled={!font}>Download SVG</button>
        <button style={S.btn2} onClick={exportPng} disabled={!font || busy}>{busy ? "Rendering PNG…" : "Download PNG"}</button>

        <p style={S.note}>
          Preview compiles at 4× for live typing; downloads bake the full
          16× geometry (a one-word tile is ~7000px wide).
        </p>
      </div>

      <div style={S.stage}>
        {fontLoading || !tile ? (
          <div style={{ color: "#8F8199", font: "600 13px Inter, sans-serif" }}>
            {fontLoading ? "Loading font…" : "Type something to begin"}
          </div>
        ) : (
          <div
            style={S.svgWrap}
            dangerouslySetInnerHTML={{
              __html: tile.svg.replace(/width="\d+" height="\d+"/, `width="100%" height="auto"`),
            }}
          />
        )}
      </div>
    </div>
  );
}
