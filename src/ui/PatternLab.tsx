/* ── Pattern Wave Lab ───────────────────────────────────────────────────
   Temporary dev harness (mounted only for `?lab=patterns`) for the ten-
   pattern brief: every new cell rendered side by side at the SAME swatch
   size so visual density compares fairly, with the brief's required
   inspections one click away — 50/100/200% scale, rotation, color, a 5×5
   seam field, and the three component contexts (wide button, small square,
   large panel). Reads textPatternCell straight from the engine: what this
   page shows is exactly what the face, the letterforms and the exports
   will wear. */
import { useState } from "react";
import { textPatternCell } from "../generator/bevel";
import { usePageScroll } from "@/shell/usePageScroll";

const WAVE: { id: string; name: string }[] = [
  { id: "circuit", name: "Circuit Board" },
  { id: "hexcells", name: "Hex Cells" },
  { id: "facets", name: "Crystal Facets" },
  { id: "speedlines", name: "Speed Lines" },
  { id: "topo", name: "Topographic Contours" },
  { id: "softcamo", name: "Soft Camouflage" },
  { id: "chainmail", name: "Chainmail" },
  { id: "camoshards", name: "Camo Shards" },
  { id: "bolts", name: "Lightning Bolts" },
  { id: "pixelblocks", name: "Pixel Blocks" },
  { id: "animeburst", name: "Anime Burst" },
  { id: "boltspop", name: "Lightning Bolts \u00b7 Pop" },
  { id: "snowflake", name: "Snowflakes" },
  { id: "tigerstripes", name: "Tiger Stripes" },
];

/** One inline swatch: a rect filled with the live pattern cell. dispW
 *  downsamples the DISPLAY only — the geometry stays true to `ps`, so the
 *  8×4 perceptual-repetition band shows the real 100% pattern, smaller. */
function Swatch(props: { id: string; w: number; h: number; ps: number; color: string; angle: number; bg: string; radius?: number; dispW?: number }) {
  const { id, w, h, ps, color, angle, bg, radius, dispW } = props;
  const pid = `lab-${id}-${Math.round(ps)}-${angle}-${w}`;
  const rot = angle ? ` patternTransform="rotate(${angle})"` : "";
  const dw = dispW ?? w, dh = dispW ? Math.round(h * (dispW / w)) : h;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dw}" height="${dh}" viewBox="0 0 ${w} ${h}">
    <defs><pattern id="${pid}" width="${ps}" height="${ps}" patternUnits="userSpaceOnUse"${rot}>${textPatternCell(id, ps, color)}</pattern></defs>
    <rect width="${w}" height="${h}" rx="${radius ?? 0}" fill="${bg}"/>
    <rect width="${w}" height="${h}" rx="${radius ?? 0}" fill="url(#${pid})" opacity="0.85"/>
  </svg>`;
  return <span dangerouslySetInnerHTML={{ __html: svg }} style={{ display: "block", lineHeight: 0 }} />;
}

/* the review roster: the correction brief's six, plus the reference-scale
   round (bigger softcamo already aboard; tigerstripes is new) */
const SIX = ["topo", "softcamo", "tigerstripes", "chainmail", "camoshards", "bolts", "pixelblocks"];

export function PatternLab() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const [scalePct, setScalePct] = useState(100);
  const [angle, setAngle] = useState(0);
  const [color, setColor] = useState("#1d819a");
  const [bg, setBg] = useState("#e9edf4");
  const [context, setContext] = useState<"swatch" | "seam" | "components" | "review">("swatch");
  // the engine's cell size at Scale 100 is (8 + 100·0.9)·K — the lab shows
  // the same 98-unit rhythm scaled by the inspector's percentage
  const ps = 98 * (scalePct / 100);

  return (
    <div style={{ minHeight: "100vh", background: "#12141C", color: "#E9EDF7", fontFamily: "Inter, system-ui, sans-serif", padding: 28 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Pattern Wave Lab — the fourteen</h1>
      <p style={{ margin: "0 0 18px", color: "#96A0B8", fontSize: 13 }}>
        Same swatch size, same color, same scale — density compares honestly. Seam view tiles 5×5; component view is the brief's three contexts.
      </p>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 20, flexWrap: "wrap", fontSize: 13 }}>
        <label>Scale{" "}
          {[50, 100, 200, 300, 400].map((s) => (
            <button key={s} onClick={() => setScalePct(s)}
              style={{ margin: "0 2px", padding: "4px 10px", borderRadius: 6, border: "1px solid #3A4152", background: scalePct === s ? "#2E5BE0" : "#1B1F2A", color: "#E9EDF7", cursor: "pointer" }}>
              {s}%
            </button>
          ))}
        </label>
        <label>Rotation <input type="range" min={0} max={90} value={angle} onChange={(e) => setAngle(+e.target.value)} /> {angle}°</label>
        <label>Ink <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label>Face <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
        <label>View{" "}
          {(["swatch", "seam", "components", "review"] as const).map((v) => (
            <button key={v} onClick={() => setContext(v)}
              style={{ margin: "0 2px", padding: "4px 10px", borderRadius: 6, border: "1px solid #3A4152", background: context === v ? "#2E5BE0" : "#1B1F2A", color: "#E9EDF7", cursor: "pointer" }}>
              {v}
            </button>
          ))}
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, maxWidth: context === "components" ? 1400 : 1100 }}>
        {(context === "review" ? WAVE.filter((p) => SIX.includes(p.id)) : WAVE).map((p) => (
          <div key={p.id} style={{ background: "#1B1F2A", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{p.name} <span style={{ color: "#5C6B8A" }}>· {p.id}</span></div>
            {context === "swatch" && <Swatch id={p.id} w={460} h={150} ps={ps} color={color} angle={angle} bg={bg} radius={10} />}
            {context === "seam" && <Swatch id={p.id} w={ps * 5} h={ps * 5} ps={ps} color={color} angle={angle} bg={bg} />}
            {context === "components" && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <Swatch id={p.id} w={300} h={82} ps={ps} color={color} angle={angle} bg={bg} radius={18} />
                <Swatch id={p.id} w={82} h={82} ps={ps} color={color} angle={angle} bg={bg} radius={14} />
                <Swatch id={p.id} w={430} h={240} ps={ps} color={color} angle={angle} bg={bg} radius={12} />
              </div>
            )}
            {context === "review" && (
              /* the correction brief's required checks in one card: the
                 three scales side by side, then the 8×4 band — true 100%
                 geometry, display-shrunk — for the PERCEPTUAL repeat test */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  {[49, 98, 196].map((s, i) => (
                    <div key={s}>
                      <div style={{ fontSize: 10.5, color: "#5C6B8A", marginBottom: 3 }}>{[50, 100, 200][i]}%</div>
                      <Swatch id={p.id} w={160} h={110} ps={s} color={color} angle={angle} bg={bg} radius={8} />
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: "#5C6B8A", marginBottom: 3 }}>8 × 4 tiles at 100% — squint for repeats</div>
                  <Swatch id={p.id} w={98 * 8} h={98 * 4} ps={98} color={color} angle={angle} bg={bg} dispW={508} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
