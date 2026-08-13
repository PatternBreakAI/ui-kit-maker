import { useEffect, useMemo } from "react";
import { useGen } from "@/generator/store";
import type { GenConfig } from "@/generator/model";
import { renderKit } from "@/generator/bevel";
import { ensureFont } from "@/generator/fonts";
import { usePageScroll } from "@/shell/usePageScroll";

/* ── the type-filter proof sheet ──────────────────────────────────
   Neither working session can run real Safari (containers ship Chromium
   only), and Safari is where SVG filters go to act weird — so this page
   makes a human pass trivial: every type treatment the engine ships,
   rendered live on one scrollable sheet, across the current document's
   face plus two stress faces (thin Silkscreen, heavy Bungee). Open it on
   an iPhone/iPad, scroll, screenshot anything broken, done. Covers both
   lanes' filters: whatever the engine on THIS build supports is what
   renders — when the Type Maker branch lands, its dim/grain/metal
   treatments appear here with no edits (they ride `type`, same as the
   rest). Public but unlinked; the build stamp keeps judgment honest. */

type Mut = (c: GenConfig) => void;
const CASES: { name: string; mut: Mut }[] = [
  { name: "Plain", mut: () => {} },
  { name: "Ink shine", mut: (c) => { c.type.shine = { on: true, size: 5, inset: 2, round: 2, opacity: 100 }; } },
  { name: "Ink shine · overlay · max", mut: (c) => { c.type.shine = { on: true, size: 10, inset: 0, round: 4, opacity: 100, blend: "overlay" }; } },
  { name: "Glints · slab", mut: (c) => { c.type.glints = { on: true, opacity: 70, style: "slab" }; } },
  { name: "Glints · stars", mut: (c) => { c.type.glints = { on: true, opacity: 70, style: "stars" }; } },
  { name: "Glints · streak", mut: (c) => { c.type.glints = { on: true, opacity: 70, style: "streak" }; } },
  { name: "Glints · sheen · overlay", mut: (c) => { c.type.glints = { on: true, opacity: 70, style: "sheen", blend: "overlay" }; } },
  { name: "Emboss", mut: (c) => { c.type.emboss.on = true; } },
  { name: "Deboss", mut: (c) => { c.type.emboss = { ...c.type.emboss, on: true, strength: -60 }; } },
  { name: "Glow", mut: (c) => { c.type.glow.on = true; } },
  { name: "Outline · gradient", mut: (c) => { c.type.outline = { ...c.type.outline, on: true, width: 3, color2: "#FFD166" }; } },
  { name: "Shadow", mut: (c) => { c.type.shadow.on = true; } },
  { name: "Pattern fill", mut: (c) => { c.type.stripes = { on: true, angle: 35, opacity: 45 }; } },
  { name: "Inflate", mut: (c) => { c.type.inflate = { on: true, strength: 70 }; } },
  { name: "Highlight burn", mut: (c) => { c.type.highlight = "SH"; c.type.highlightBoost = 85; c.candy.pattern.type = "stripes"; } },
  { name: "Shine + glints + emboss", mut: (c) => {
      c.type.shine = { on: true, size: 5, inset: 2, round: 2, opacity: 100 };
      c.type.glints = { on: true, opacity: 60, style: "slab" };
      c.type.emboss.on = true;
    } },
];

const STRESS_FONTS = ["Silkscreen", "Bungee"];

export function TypeProofPage() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const cfg = useGen((s) => s.cfg);
  const fonts = useMemo(() => [cfg.type.font, ...STRESS_FONTS.filter((f) => f !== cfg.type.font)], [cfg.type.font]);
  useEffect(() => { fonts.forEach(ensureFont); }, [fonts]);
  const tiles = useMemo(() => {
    const out: { key: string; name: string; font: string; svg: string }[] = [];
    for (const font of fonts) {
      for (const cs of CASES) {
        const c = JSON.parse(JSON.stringify(cfg)) as GenConfig;
        c.stateDesigns = {};
        c.type.font = font;
        cs.mut(c);
        let svg = "";
        try {
          svg = renderKit(c, "primary", "m", "default", undefined, undefined, { label: "SPLASH", icon: null });
        } catch (e) {
          svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text y="20" fill="red">render failed: ${String(e).slice(0, 60)}</text></svg>`;
        }
        out.push({ key: `${font}-${cs.name}`, name: cs.name, font, svg });
      }
    }
    return out;
  }, [cfg, fonts]);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 80px", fontFamily: "Inter, sans-serif" }}>
      {/* the engine's natural canvas carries glow padding — scale each
          tile's svg down to a strip so the sheet scrolls fast on a phone */}
      <style>{`.tpf svg { width: 100%; height: auto; max-height: 150px; }`}</style>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Type filter proof sheet</h1>
      <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 6 }}>
        Every live type treatment × the document face + stress faces. Open on the browser
        under test, scroll, screenshot anything that looks wrong. Rendering is live inline
        SVG — the same markup the editor canvas draws.
      </p>
      <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 24 }}>build {__BUILD_STAMP__}</p>
      {fonts.map((font) => (
        <section key={font} style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 14, opacity: 0.75, margin: "0 0 12px" }}>{font}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {tiles.filter((t) => t.font === font).map((t) => (
              <figure key={t.key} style={{ margin: 0, padding: 10, borderRadius: 12, background: "rgba(128,128,128,0.08)" }}>
                <div className="tpf" style={{ display: "flex", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: t.svg }} />
                <figcaption style={{ fontSize: 11.5, opacity: 0.7, marginTop: 6, textAlign: "center" }}>{t.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
export default TypeProofPage;
