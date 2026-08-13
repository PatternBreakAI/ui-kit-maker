import { useCallback, useEffect, useState } from "react";
import { usePageScroll } from "@/shell/usePageScroll";

/* ── slant lab: in-place Safari instrumentation ───────────────────
   The isolated probe page (#/italicprobe) renders clean while the REAL
   editor and kit page clip — so the trigger is contextual. This panel
   (any route + `slantlab` in the URL, e.g. /#/app?slantlab) instruments
   the production DOM itself instead of recreating it:

   overlays — every engine svg gets its viewBox (yellow), shell frame
   (green), label getBBox (magenta) and text-filter region (orange) drawn
   in place, plus a report of the wrapper context Safari actually sees:
   CSS zoom, transforms, css-scale ratio, overflow clippers, compositing
   hints. The suspects ranked by outside review — scale/transform first.

   switches — one-shot DOM surgery on the live page, one variable each:
   italic attrs stripped · text filters unhooked · ancestor overflow
   forced visible · svg roots expanded · zoom/transform flattened.
   Click ONE, screenshot, reload to reset. Nothing touches app state,
   nothing persists, nothing ships to users without the flag. */

const NS = "http://www.w3.org/2000/svg";
const MAXSVGS = 16;

function engineSvgs(): SVGSVGElement[] {
  return [...document.querySelectorAll<SVGSVGElement>("svg[data-shell]")].slice(0, MAXSVGS);
}

function labelText(svg: SVGSVGElement): SVGTextElement | null {
  const scope = svg.querySelector('[data-part="label"]') ?? svg;
  let best: SVGTextElement | null = null, len = 0;
  scope.querySelectorAll("text").forEach((t) => {
    try { const l = (t as SVGTextElement).getComputedTextLength(); if (l > len) { len = l; best = t as SVGTextElement; } } catch { /* unrendered */ }
  });
  return best;
}

function drawRect(svg: SVGSVGElement, x: number, y: number, w: number, h: number, color: string) {
  const r = document.createElementNS(NS, "rect");
  r.setAttribute("data-slantlab", "1");
  r.setAttribute("x", x.toFixed(1)); r.setAttribute("y", y.toFixed(1));
  r.setAttribute("width", Math.max(0, w).toFixed(1)); r.setAttribute("height", Math.max(0, h).toFixed(1));
  r.setAttribute("fill", "none"); r.setAttribute("stroke", color);
  r.setAttribute("stroke-width", "1.5"); r.setAttribute("stroke-dasharray", "6 3");
  r.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(r);
}

interface CtxNote { chain: string[]; cssScale: string; zoomed: string[]; clipped: number; bboxOver: number }

function inspect(svg: SVGSVGElement): CtxNote {
  const vb = svg.viewBox.baseVal;
  const cssScale = vb.width ? (svg.getBoundingClientRect().width / vb.width).toFixed(3) : "?";
  const chain: string[] = [], zoomed: string[] = [];
  let clipped = 0;
  let el: HTMLElement | null = svg.parentElement;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const tags: string[] = [];
    if (cs.transform && cs.transform !== "none") tags.push(`transform:${cs.transform.slice(0, 34)}`);
    const z = (cs as CSSStyleDeclaration & { zoom?: string }).zoom;
    if (z && z !== "1" && z !== "normal") { tags.push(`zoom:${z}`); zoomed.push(el.className.toString().split(" ")[0] || el.tagName); }
    if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") { tags.push(`overflow:${cs.overflow || cs.overflowX}`); clipped++; }
    if (cs.contain && cs.contain !== "none") tags.push(`contain:${cs.contain}`);
    if (cs.filter && cs.filter !== "none") tags.push(`css-filter`);
    if (cs.willChange && cs.willChange !== "auto") tags.push(`will-change:${cs.willChange}`);
    if (tags.length) chain.push(`${(el.className.toString().split(" ")[0] || el.tagName.toLowerCase()).slice(0, 22)} ${tags.join(" ")}`);
    el = el.parentElement;
  }
  let bboxOver = 0;
  const t = labelText(svg);
  if (t) {
    try {
      const bb = t.getBBox();
      bboxOver = Math.max(0, bb.x + bb.width - (vb.x + vb.width), vb.x - bb.x);
      const filt = svg.querySelector('filter[id$="tf"]') as SVGFilterElement | null;
      if (filt && (t.getAttribute("filter") || t.closest("g[filter]"))) {
        bboxOver = Math.max(bboxOver, bb.x + bb.width - (filt.x.baseVal.value + filt.width.baseVal.value), filt.x.baseVal.value - bb.x);
      }
    } catch { /* unrendered */ }
  }
  return { chain, cssScale, zoomed, clipped, bboxOver };
}

export function SlantLab() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const [applied, setApplied] = useState<string[]>([]);
  const [report, setReport] = useState("scanning…");
  const mark = (name: string) => setApplied((a) => (a.includes(name) ? a : [...a, name]));

  const overlay = useCallback(() => {
    document.querySelectorAll("[data-slantlab]").forEach((n) => n.remove());
    const svgs = engineSvgs();
    for (const svg of svgs) {
      const vb = svg.viewBox.baseVal;
      drawRect(svg, vb.x, vb.y, vb.width, vb.height, "#FDE047");
      const shell = svg.getAttribute("data-shell")?.split(" ").map(Number);
      if (shell?.length === 4) drawRect(svg, shell[0], shell[1], shell[2], shell[3], "#34D399");
      const t = labelText(svg);
      if (t) { try { const bb = t.getBBox(); drawRect(svg, bb.x, bb.y, bb.width, bb.height, "#F0F"); } catch { /* fine */ } }
      const filt = svg.querySelector('filter[id$="tf"]') as SVGFilterElement | null;
      if (filt) drawRect(svg, filt.x.baseVal.value, filt.y.baseVal.value, filt.width.baseVal.value, filt.height.baseVal.value, "#FB923C");
    }
    mark("overlay");
  }, []);

  const scan = useCallback(() => {
    const svgs = engineSvgs();
    if (!svgs.length) { setReport("no engine svgs found on this view"); return; }
    const notes = svgs.map(inspect);
    const first = notes[0];
    const overs = notes.filter((n) => n.bboxOver > 0.5).length;
    const scales = [...new Set(notes.map((n) => n.cssScale))].slice(0, 5).join(", ");
    const lines = [
      `${svgs.length} engine svgs · dpr ${window.devicePixelRatio}`,
      `css scale (rendered ÷ viewBox): ${scales}`,
      `label bbox past frame/region: ${overs} of ${svgs.length}`,
      `clipping ancestors on first svg: ${first.clipped}`,
      first.zoomed.length ? `CSS ZOOM active on: ${[...new Set(notes.flatMap((n) => n.zoomed))].join(", ")}` : "no CSS zoom in effect",
      "— first svg wrapper chain —",
      ...(first.chain.length ? first.chain.slice(0, 10) : ["(no transforms/clippers/containment found)"]),
    ];
    setReport(lines.join("\n"));
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => { overlay(); scan(); }, 1200);
    const t2 = setTimeout(() => { overlay(); scan(); }, 4500); // after fonts + lazy mounts
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [overlay, scan]);

  const italicOff = () => {
    engineSvgs().forEach((svg) => {
      svg.querySelectorAll('[font-style="italic"]').forEach((n) => n.removeAttribute("font-style"));
      // the skew-based synthetic italics (post-fix engine) un-slant here too
      svg.querySelectorAll('g[transform*="skewX(-14)"]').forEach((g) => g.removeAttribute("transform"));
    });
    mark("italic OFF"); scan();
  };
  const filtersOff = () => {
    engineSvgs().forEach((svg) => svg.querySelectorAll("[filter]").forEach((n) => {
      if (/url\(["']?#[A-Za-z0-9_-]*(tf|thf|tsh)["']?\)/.test(n.getAttribute("filter") ?? "")) n.removeAttribute("filter");
    }));
    mark("text filters OFF"); scan();
  };
  const unclip = () => {
    let count = 0;
    engineSvgs().forEach((svg) => {
      let el: HTMLElement | null = svg.parentElement;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") { el.style.overflow = "visible"; count++; }
        el = el.parentElement;
      }
    });
    mark(`ancestors unclipped (${count})`); scan();
  };
  const expandRoots = () => {
    engineSvgs().forEach((svg) => {
      const t = labelText(svg);
      const fs = t ? parseFloat(t.getAttribute("font-size") ?? "40") : 40;
      const M = Math.round(fs * 4);
      const vb = svg.viewBox.baseVal;
      const w = parseFloat(svg.getAttribute("width") ?? "0"), h = parseFloat(svg.getAttribute("height") ?? "0");
      if (w && h) { svg.setAttribute("width", String(w + 2 * M)); svg.setAttribute("height", String(h + 2 * M)); }
      svg.setAttribute("viewBox", `${vb.x - M} ${vb.y - M} ${vb.width + 2 * M} ${vb.height + 2 * M}`);
    });
    mark("roots expanded"); scan();
  };
  /* the counter-theory switch: Safari CLAMPS filter regions it can't
     afford to rasterize, and a clamped region lands near the text bbox —
     shearing the last italic glyph's lean. If TIGHT regions heal what
     huge regions couldn't, oversized rasters are the disease. */
  const tightenRegions = () => {
    let count = 0;
    engineSvgs().forEach((svg) => {
      const t = labelText(svg);
      if (!t) return;
      let bb: DOMRect | { x: number; y: number; width: number; height: number };
      try { bb = t.getBBox(); } catch { return; }
      const fs = parseFloat(t.getAttribute("font-size") ?? "40");
      svg.querySelectorAll("filter").forEach((f) => {
        if (!/(?:tf|thf|tsh)$/.test(f.id)) return;
        f.setAttribute("x", (bb.x - fs).toFixed(0));
        f.setAttribute("y", (bb.y - fs).toFixed(0));
        f.setAttribute("width", (bb.width + fs * 2).toFixed(0));
        f.setAttribute("height", (bb.height + fs * 2).toFixed(0));
        count++;
      });
    });
    mark(`regions TIGHT (${count})`); scan();
  };
  const flatten = () => {
    const hits: string[] = [];
    engineSvgs().forEach((svg) => {
      let el: HTMLElement | null = svg.parentElement;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        const z = (cs as CSSStyleDeclaration & { zoom?: string }).zoom;
        if (z && z !== "1" && z !== "normal") { el.style.setProperty("zoom", "1"); hits.push("zoom"); }
        if (cs.transform && cs.transform !== "none") { el.style.transform = "none"; hits.push("transform"); }
        el = el.parentElement;
      }
    });
    mark(`scale flattened (${hits.length || "nothing to flatten"})`); scan();
  };

  const btn: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", margin: "3px 0", padding: "5px 9px", fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)", color: "#E8E9F0", cursor: "pointer" };
  return (
    <div style={{ position: "fixed", right: 14, bottom: 14, zIndex: 99999, width: 320, background: "rgba(12,14,22,0.95)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: 12, color: "#E8E9F0", fontFamily: "ui-monospace, monospace", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", marginBottom: 6 }}>SLANT LAB <span style={{ opacity: 0.5, fontWeight: 400 }}>· one switch, screenshot, reload</span></div>
      <button style={btn} onClick={() => { overlay(); scan(); }}>overlay boundaries + re-scan</button>
      <button style={btn} onClick={italicOff}>1 · italic OFF (in place)</button>
      <button style={btn} onClick={filtersOff}>2 · text filters OFF</button>
      <button style={btn} onClick={unclip}>3 · force ancestors overflow:visible</button>
      <button style={btn} onClick={expandRoots}>4 · expand svg roots +4 font-sizes</button>
      <button style={btn} onClick={flatten}>5 · flatten CSS zoom / transforms</button>
      <button style={btn} onClick={tightenRegions}>6 · SHRINK filter regions to tight</button>
      {applied.length > 0 && (
        <div style={{ fontSize: 11, margin: "7px 0 2px", color: "#FBBF24" }}>APPLIED: {applied.join(" · ")}</div>
      )}
      <pre style={{ fontSize: 10.5, lineHeight: 1.45, whiteSpace: "pre-wrap", margin: "8px 0 0", opacity: 0.9, maxHeight: 220, overflow: "auto" }}>{report}</pre>
      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6 }}>yellow=viewBox · green=frame · magenta=label bbox · orange=filter region</div>
    </div>
  );
}
export default SlantLab;
