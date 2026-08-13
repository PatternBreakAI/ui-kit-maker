import { useEffect, useMemo, useRef, useState } from "react";
import { useGen } from "@/generator/store";
import type { GenConfig } from "@/generator/model";
import { defaultConfig, clampWeight, fontByName } from "@/generator/model";
import { renderKit } from "@/generator/bevel";
import { tableLabelEm } from "@/generator/fontMetrics";
import { ensureFont } from "@/generator/fonts";
import { usePageScroll } from "@/shell/usePageScroll";

/* ── the italic clip probe ────────────────────────────────────────
   A Safari diagnostic, not a production surface. Outside review (ChatGPT,
   2026-08-08) ranked the remaining cut-off suspects: synthetic-italic
   painted bounds → filter clipping around italic text → width math. This
   page isolates each variable with STRING SURGERY on one rendered SVG —
   the config never changes between variants, so exactly one thing moves
   per column:

     CURRENT      untouched production output
     NORMAL       same bytes, font-style="italic" attributes removed
     NO FILTER    same bytes, the text-filter references removed
     HUGE REGION  same bytes, filter regions + canvas grown by 4 font-sizes

   Rows pit a face with a REAL italic file against faces Safari must
   synthesize — if true italic behaves and synthetic clips, caught red-
   handed. Every tile measures its own painted run IN THE VIEWING BROWSER
   (getComputedTextLength + getBBox) and prints the numbers, so a Safari
   screenshot of this page carries the diagnosis. Rectangles: cyan = the
   engine's reserved text box, magenta = this browser's getBBox. */

const SUFFIXES = ["tf", "thf", "tsh"] as const;

interface Variants { current: string; normal: string; nofilter: string; huge: string }

function makeVariants(svg: string): Variants {
  const rid = /<filter id="([A-Za-z0-9_-]+)tf"/.exec(svg)?.[1] ?? null;
  const normal = svg.split(' font-style="italic"').join("");
  let nofilter = svg;
  if (rid) for (const suf of SUFFIXES) nofilter = nofilter.split(` filter="url(#${rid}${suf})"`).join("");
  const fsM = /data-part="label"[\s\S]*?font-size="([\d.]+)"/.exec(svg);
  const M = Math.round((fsM ? parseFloat(fsM[1]) : 40) * 4);
  let huge = svg;
  if (rid) {
    huge = huge.replace(
      new RegExp(`(<filter id="${rid}(?:tf|thf|tsh)" filterUnits="userSpaceOnUse" )x="(-?[\\d.]+)" y="(-?[\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`, "g"),
      (_m, pre, x, y, w, h) => `${pre}x="${+x - M}" y="${+y - M}" width="${+w + 2 * M}" height="${+h + 2 * M}"`,
    );
  }
  huge = huge.replace(
    /(<svg[^>]*? )width="(-?[\d.]+)" height="(-?[\d.]+)" viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/,
    (_m, pre, w, h, vx, vy, vw, vh) =>
      `${pre}width="${+w + 2 * M}" height="${+h + 2 * M}" viewBox="${+vx - M} ${+vy - M} ${+vw + 2 * M} ${+vh + 2 * M}"`,
  );
  return { current: svg, normal, nofilter, huge };
}

interface Reading {
  ctl: number;        // getComputedTextLength — painted advance, this browser
  bbW: number;        // getBBox width
  reserved: number;   // the engine's reserved text width (recomputed)
  overFrame: number;  // px the bbox pokes past the svg canvas
  overRegion: number | null; // px past the tf filter region (null = no filter)
  fontLoaded: boolean;
}

const NS = "http://www.w3.org/2000/svg";

function measureTile(host: HTMLElement, cfg: GenConfig, label: string): Reading | null {
  const svgEl = host.querySelector("svg");
  if (!svgEl) return null;
  svgEl.querySelectorAll("[data-probe]").forEach((n) => n.remove());
  const scope = svgEl.querySelector('[data-part="label"]') ?? svgEl;
  let best: SVGTextElement | null = null, ctl = 0;
  scope.querySelectorAll("text").forEach((t) => {
    try { const l = (t as SVGTextElement).getComputedTextLength(); if (l > ctl) { ctl = l; best = t as SVGTextElement; } } catch { /* unrendered */ }
  });
  if (!best) return null;
  const bt = best as SVGTextElement;
  const bb = bt.getBBox();
  const tx = parseFloat(bt.getAttribute("x") ?? "0");
  const ty = parseFloat(bt.getAttribute("y") ?? "0");
  const fs = parseFloat(bt.getAttribute("font-size") ?? "0");
  const T = cfg.type;
  const w = clampWeight(fontByName(T.font).caps, T.weight);
  const em = tableLabelEm(label, T.font, w, !!T.italic);
  const weightK = 1 + Math.max(0, T.weight - 700) * 0.0004;
  const reserved = em !== null
    ? (em + label.length * T.spacing / 100) * fs * weightK * 1.02 + (T.italic ? fs * 0.3 : 0)
    : NaN;
  const vb = svgEl.viewBox.baseVal;
  const overFrame = Math.max(0, bb.x + bb.width - (vb.x + vb.width), vb.x - bb.x);
  const filt = svgEl.querySelector('filter[id$="tf"]') as SVGFilterElement | null;
  let overRegion: number | null = null;
  const anchored = bt.getAttribute("filter") || bt.closest("g[filter]");
  if (filt && anchored) {
    const fx = filt.x.baseVal.value, fw = filt.width.baseVal.value;
    overRegion = Math.max(0, bb.x + bb.width - (fx + fw), fx - bb.x);
  }
  const draw = (x: number, y: number, rw: number, rh: number, color: string) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("data-probe", "1");
    r.setAttribute("x", x.toFixed(1)); r.setAttribute("y", y.toFixed(1));
    r.setAttribute("width", Math.max(0, rw).toFixed(1)); r.setAttribute("height", Math.max(0, rh).toFixed(1));
    r.setAttribute("fill", "none"); r.setAttribute("stroke", color);
    r.setAttribute("stroke-width", "1.5"); r.setAttribute("stroke-dasharray", "5 3");
    r.setAttribute("vector-effect", "non-scaling-stroke");
    svgEl.appendChild(r);
  };
  if (Number.isFinite(reserved)) draw(tx - reserved / 2, ty - fs * 0.62, reserved, fs * 1.24, "#22D3EE");
  draw(bb.x, bb.y, bb.width, bb.height, "#F0F"); // this browser's opinion
  const spec = `${T.italic ? "italic " : ""}${w} 16px "${T.font}"`;
  let fontLoaded = false;
  try { fontLoaded = document.fonts.check(spec); } catch { /* keep false */ }
  return { ctl, bbW: bb.width, reserved, overFrame, overRegion, fontLoaded };
}

const VARIANT_META: { key: keyof Variants; title: string; note: string }[] = [
  { key: "current", title: "CURRENT", note: "untouched production render" },
  { key: "normal", title: "NORMAL", note: "same svg, italic attribute stripped" },
  { key: "nofilter", title: "NO FILTER", note: "same svg, text filters unhooked" },
  { key: "huge", title: "HUGE REGION", note: "same svg, regions + canvas +4 font-sizes" },
];

export function ItalicProbePage() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const cfg = useGen((s) => s.cfg);
  const rows = useMemo(() => {
    const mk = (name: string, note: string, build: () => { c: GenConfig; label: string }) => {
      const { c, label } = build();
      c.stateDesigns = {};
      let variants: Variants | null = null;
      let error = "";
      try {
        variants = makeVariants(renderKit(c, "primary", "m", "default", undefined, undefined, { label, icon: null }));
      } catch (e) { error = String(e).slice(0, 120); }
      return { name, note, cfg: c, label, variants, error };
    };
    return [
      mk("Your kit — italic forced on", "your exact face, size, spacing, effects", () => {
        const c = JSON.parse(JSON.stringify(cfg)) as GenConfig;
        c.type.italic = true;
        return { c, label: (cfg as GenConfig & { content?: { label?: string } }).content?.label || "PLAY" };
      }),
      mk("Chango — SYNTHETIC italic", "no italic file exists; Safari must fake the slant", () => {
        const c = defaultConfig();
        c.type.font = "Chango"; c.type.italic = true; c.type.weight = 900; c.type.size = 64; c.type.spacing = 4;
        return { c, label: "SHADOW KNIGHT" };
      }),
      mk("Exo 2 — TRUE italic file", "same settings as the Chango row, real italic face", () => {
        const c = defaultConfig();
        c.type.font = "Exo 2"; c.type.italic = true; c.type.weight = 900; c.type.size = 64; c.type.spacing = 4;
        return { c, label: "SHADOW KNIGHT" };
      }),
    ];
  }, [cfg]);

  useEffect(() => { rows.forEach((r) => ensureFont(r.cfg.type.font)); }, [rows]);

  const hostsRef = useRef(new Map<string, HTMLDivElement>());
  const [readings, setReadings] = useState<Record<string, Reading | null>>({});
  const [pass, setPass] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      const next: Record<string, Reading | null> = {};
      for (const row of rows) {
        if (!row.variants) continue;
        for (const v of VARIANT_META) {
          const host = hostsRef.current.get(`${row.name}|${v.key}`);
          next[`${row.name}|${v.key}`] = host ? measureTile(host, row.cfg, row.label.toUpperCase()) : null;
        }
      }
      setReadings(next);
    };
    run();
    document.fonts?.ready?.then(() => { setTimeout(() => { run(); if (alive) setPass((p) => p + 1); }, 300); });
    const t = setTimeout(run, 3000); // late CJK/variable subsets
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pass === 0]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 20px 90px", fontFamily: "Inter, sans-serif", color: "#E8E9F0", background: "#101018", minHeight: "100vh" }}>
      <style>{`.ipb svg { width: 100%; height: auto; max-height: 170px; display: block; }`}</style>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Italic clip probe</h1>
      <p style={{ opacity: 0.75, fontSize: 13, marginBottom: 2, maxWidth: 860 }}>
        Open this page in the browser under test and screenshot the whole thing. Each row is ONE
        rendered button; the four columns change exactly one variable via surgery on the same SVG
        bytes. Cyan dashes = the width the engine reserved. Magenta dashes = the text bounds THIS
        browser reports. If CURRENT clips and NORMAL doesn&apos;t → italic geometry. If NO FILTER
        rescues it → the filter region is the guillotine. If only HUGE REGION rescues it → our
        boxes are too small for this browser&apos;s italic paint. If nothing rescues it → WebKit
        text rendering itself.
      </p>
      <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 26 }}>build {__BUILD_STAMP__} · diagnostic only — nothing here changes the product</p>
      {rows.map((row) => (
        <section key={row.name} style={{ marginBottom: 42 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 2px" }}>{row.name}</h2>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 12px" }}>{row.note}</p>
          {!row.variants ? (
            <p style={{ color: "#F87171", fontSize: 13 }}>render failed: {row.error}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {VARIANT_META.map((v) => {
                const key = `${row.name}|${v.key}`;
                const r = readings[key];
                const over = r ? Math.max(r.overFrame, r.overRegion ?? 0) : 0;
                const bad = !!r && over > 0.5;
                return (
                  <figure key={v.key} style={{ margin: 0, padding: 10, borderRadius: 12, background: "rgba(128,128,128,0.09)", border: `1.5px solid ${!r ? "rgba(128,128,128,0.2)" : bad ? "#F87171" : "#34D399"}` }}>
                    <figcaption style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 8 }}>{v.title}
                      <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 8, fontSize: 11 }}>{v.note}</span>
                    </figcaption>
                    <div
                      className="ipb"
                      ref={(el) => { if (el) hostsRef.current.set(key, el); }}
                      dangerouslySetInnerHTML={{ __html: row.variants![v.key] }}
                    />
                    <div style={{ fontSize: 11, marginTop: 8, fontFamily: "ui-monospace, monospace", opacity: 0.85, lineHeight: 1.5 }}>
                      {r ? (
                        <>
                          <span style={{ color: bad ? "#F87171" : "#34D399", fontWeight: 700 }}>{bad ? `OVERFLOW ${over.toFixed(1)}px` : "CONTAINED"}</span>
                          {" · "}painted {r.ctl.toFixed(1)} · bbox {r.bbW.toFixed(1)} · reserved {Number.isFinite(r.reserved) ? r.reserved.toFixed(1) : "n/a"}
                          {r.overRegion !== null ? ` · past region ${r.overRegion.toFixed(1)}` : " · unfiltered"}
                          {r.fontLoaded ? "" : " · FONT NOT LOADED YET"}
                        </>
                      ) : "measuring…"}
                    </div>
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <p style={{ opacity: 0.45, fontSize: 11.5, maxWidth: 860 }}>
        Numbers are in SVG user units, measured live by this browser. getBBox may not include a
        synthetic slant&apos;s lean, so trust the pixels first and the magenta box second. The cyan
        reserve should always cover the magenta box with room to spare.
      </p>
    </div>
  );
}
export default ItalicProbePage;
