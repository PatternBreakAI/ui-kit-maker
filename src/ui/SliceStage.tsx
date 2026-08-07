import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useGen } from "@/generator/store";
import { KIT_COMPONENTS, applyKitDesign } from "@/generator/model";
import type { KitSlice } from "@/generator/model";
import { measureAutoSlice, renderSliceSprite, drawNineSlice } from "./sliceProbe";
import type { SliceProbe } from "./sliceProbe";

/* The slicing workbench — the panel preview blown up over the canvas
   (owner: "we need to be pixel accurate here... see it big to be
   accurate"). The sprite renders vector-crisp at zoom, the four guides
   are draggable to the pixel (arrow keys nudge ±1, shift ±5), and the
   stretch test below re-draws with Unity's exact Sliced algorithm as
   the guides move. */

const ZOOMS = [1, 2, 3, 4];

/** Does this piece's design wear a pattern (face or wall)? Mirrors the
 *  renderer's resolution, legacy `zone` included. */
export function patternZones(cfg: ReturnType<typeof useGen.getState>["cfg"], design: Parameters<typeof applyKitDesign>[1]): { face: boolean; wall: boolean; any: boolean } {
  const d = applyKitDesign(cfg, design).candy.pattern;
  const zone = d?.zone ?? "face";
  const face = !!d && d.type !== "none" && d.opacity > 1 && zone !== "wall";
  const wall = (!!d?.wall && d.wall.type !== "none" && d.wall.opacity > 1)
    || (zone !== "face" && !!d && d.type !== "none" && d.opacity > 1);
  return { face, wall, any: face || wall };
}

export function SliceStage() {
  const cid = useGen((s) => s.sliceStage)!;
  const setSliceStage = useGen((s) => s.setSliceStage);
  const focus = useGen((s) => s.focus);
  const kitSlices = useGen((s) => s.kitSlices);
  const setKitSlice = useGen((s) => s.setKitSlice);

  const cfg = useGen((s) => s.cfg);
  const kitDesigns = useGen((s) => s.kitDesigns);
  const pat = useMemo(() => patternZones(cfg, kitDesigns[cid]), [cfg, kitDesigns, cid]);

  const cur = kitSlices[cid] ?? null;
  const [probe, setProbe] = useState<SliceProbe | null>(null);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit
  const [stretch, setStretch] = useState(190);
  const benchRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ k: keyof KitSlice; rect: DOMRect } | null>(null);
  const [fitZ, setFitZ] = useState(1);

  const name = KIT_COMPONENTS.find((c) => c.id === cid)?.name ?? cid;
  const seed = probe?.auto ?? null;
  const on = !!cur;
  const vals = cur ?? seed;

  // the piece being sliced follows the editor's focus; leaving it closes us
  useEffect(() => { if (focus !== cid) setSliceStage(null); }, [focus, cid, setSliceStage]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSliceStage(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [setSliceStage]);

  useEffect(() => {
    let dead = false;
    setProbe(null);
    void measureAutoSlice(cid).then((m) => { if (!dead) setProbe(m); });
    return () => { dead = true; };
  }, [cid]);

  // fit zoom: the largest preset whose sprite fits the bench, fractional below 1x
  useEffect(() => {
    if (!probe || !wrapRef.current) return;
    const measure = () => {
      const avail = (wrapRef.current?.clientWidth ?? 600) - 48;
      const availH = (wrapRef.current?.clientHeight ?? 500) * 0.52;
      const z = Math.min(avail / probe.box.w, availH / probe.box.h);
      setFitZ(Math.max(0.5, Math.min(4, z >= 1 ? Math.floor(z) : z)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [probe]);

  const z = zoom ?? fitZ;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  // the sprite at zoom, vector-crisp (dpr-aware backing store)
  useEffect(() => {
    if (!probe) return;
    let dead = false;
    void renderSliceSprite(probe, z * dpr).then((k) => {
      const out = bigRef.current;
      if (dead || !k || !out) return;
      out.width = k.width; out.height = k.height;
      out.style.width = `${Math.round(probe.box.w * z)}px`;
      out.style.height = `${Math.round(probe.box.h * z)}px`;
      out.getContext("2d")!.drawImage(k, 0, 0);
    });
    return () => { dead = true; };
  }, [probe, z, dpr]);

  /* the stretch strip stays at design scale no matter the bench zoom — it
     answers "do the corners survive", not "count the pixels" */
  const stripSrc = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!probe) return;
    let dead = false;
    void renderSliceSprite(probe, dpr).then((k) => {
      if (dead || !k) return;
      stripSrc.current = k;
      drawStrip();
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, dpr]);
  const drawStrip = () => {
    const src = stripSrc.current, out = stripRef.current;
    if (!src || !out || !probe || !vals) return;
    const W2 = Math.round(src.width * (stretch / 100)), H2 = src.height;
    out.width = W2; out.height = H2;
    out.style.width = `${Math.round(W2 / dpr)}px`;
    out.style.height = `${Math.round(H2 / dpr)}px`;
    const c2 = out.getContext("2d")!;
    c2.clearRect(0, 0, W2, H2);
    drawNineSlice(c2, src, {
      left: Math.round(vals.left * dpr), right: Math.round(vals.right * dpr),
      top: Math.round(vals.top * dpr), bottom: Math.round(vals.bottom * dpr),
    }, 0, 0, W2, H2);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(drawStrip, [vals?.left, vals?.right, vals?.top, vals?.bottom, stretch]);

  if (!vals || !probe) {
    return (
      <div className="slicestage" role="dialog" aria-label="Slicing workbench">
        <div className="ss-head"><b>Unity slicing — {name}</b>
          <button className="ss-x" onClick={() => setSliceStage(null)} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="ss-wait">Reading the sprite…</div>
      </div>
    );
  }

  const { box } = probe;
  /* −3 per side keeps l+r ≤ w−6 design px = w−12 exported px — exactly the
     export's engine-sanity floor, so every value this bench permits ships
     verbatim, never scaled */
  const limX = Math.floor(box.w / 2) - 3, limY = Math.floor(box.h / 2) - 3;
  const setField = (k2: keyof KitSlice, v: number) => {
    const lim = k2 === "left" || k2 === "right" ? limX : limY;
    const base = cur ?? seed ?? { left: 40, right: 40, top: 36, bottom: 36 };
    setKitSlice(cid, { ...base, [k2]: Math.max(1, Math.min(lim, Math.round(v))) });
  };

  const startDrag = (k2: keyof KitSlice) => (e: React.PointerEvent) => {
    if (!benchRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { k: k2, rect: benchRef.current.getBoundingClientRect() };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const px = d.k === "left" ? (e.clientX - d.rect.left) / z
      : d.k === "right" ? (d.rect.right - e.clientX) / z
      : d.k === "top" ? (e.clientY - d.rect.top) / z
      : (d.rect.bottom - e.clientY) / z;
    setField(d.k, px);
  };
  const endDrag = () => { dragRef.current = null; };
  const keyNudge = (k2: keyof KitSlice) => (e: React.KeyboardEvent) => {
    const horiz = k2 === "left" || k2 === "right";
    const delta = e.shiftKey ? 5 : 1;
    let dir = 0;
    if (horiz && e.key === "ArrowRight") dir = k2 === "left" ? 1 : -1;
    else if (horiz && e.key === "ArrowLeft") dir = k2 === "left" ? -1 : 1;
    else if (!horiz && e.key === "ArrowDown") dir = k2 === "top" ? 1 : -1;
    else if (!horiz && e.key === "ArrowUp") dir = k2 === "top" ? -1 : 1;
    if (!dir) return;
    e.preventDefault();
    setField(k2, vals[k2] + dir * delta);
  };

  const guide = (k2: keyof KitSlice) => {
    const horiz = k2 === "left" || k2 === "right";
    const pos = k2 === "left" ? vals.left * z
      : k2 === "right" ? (box.w - vals.right) * z
      : k2 === "top" ? vals.top * z
      : (box.h - vals.bottom) * z;
    return (
      <div key={k2}
        className={`ss-guide ${horiz ? "ss-v" : "ss-h"}`}
        style={horiz ? { left: pos } : { top: pos }}
        tabIndex={0} role="slider" aria-label={`${k2} slice border`}
        aria-valuenow={vals[k2]} aria-valuemin={1} aria-valuemax={horiz ? limX : limY}
        onPointerDown={startDrag(k2)} onPointerMove={moveDrag}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onKeyDown={keyNudge(k2)}>
        <i />
        <b className="ss-tag">{k2} {vals[k2]}</b>
      </div>
    );
  };

  return (
    <div className="slicestage" role="dialog" aria-label="Slicing workbench" ref={wrapRef}>
      <div className="ss-head">
        <b>Unity slicing — {name}</b>
        <span className="ss-modes">
          <button className={`allstateschip${!on ? " on" : ""}`} title="Borders measured from the rendered pixels at export."
            onClick={() => setKitSlice(cid, null)}>Auto</button>
          <button className={`allstateschip${on ? " on" : ""}`} title="Your numbers ship exactly — drag the guides or nudge with arrow keys."
            onClick={() => { if (!on) setKitSlice(cid, seed ?? { left: 40, right: 40, top: 36, bottom: 36 }); }}>Custom</button>
        </span>
        <span className="ss-zoom">
          <button className={zoom === null ? "on" : ""} onClick={() => setZoom(null)} title="Fit the sprite to the bench">Fit</button>
          {ZOOMS.map((zz) => (
            <button key={zz} className={zoom === zz ? "on" : ""} onClick={() => setZoom(zz)}>{zz}×</button>
          ))}
        </span>
        <span className="ss-vals">{vals.left} · {vals.right} · {vals.top} · {vals.bottom} px</span>
        <button className="ss-x" onClick={() => setSliceStage(null)} aria-label="Close the workbench"><X size={15} /></button>
      </div>
      <div className="ss-benchwrap">
        <div className="ss-bench" ref={benchRef}
          style={{ width: Math.round(box.w * z), height: Math.round(box.h * z) }}>
          <canvas ref={bigRef} />
          {(["left", "right", "top", "bottom"] as const).map(guide)}
        </div>
      </div>
      {/* the honest bad news, said out loud (owner: "alert the user to the
          noise in 9-slice scaling") — a baked pattern smears under Sliced
          stretching, and the stretch test shows it truthfully */}
      {pat.any && (
        <div className="ss-warn" role="note">
          <AlertTriangle size={13} strokeWidth={2.4} aria-hidden="true" />
          <span>This piece wears a {pat.wall && !pat.face ? "wall " : ""}pattern — Sliced stretching smears it, and the noise grows with the stretch (the test below is honest). Keep the stretch modest, or size the piece close to its final proportions in the app before exporting.</span>
        </div>
      )}
      <div className="ss-striprow">
        <span className="ss-striplabel">Stretch test</span>
        <input type="range" min={110} max={350} value={stretch} aria-label="Stretch test width"
          onChange={(e) => setStretch(+e.target.value)} />
        <span className="ss-stripval">{stretch}%</span>
      </div>
      <div className="ss-stripwrap"><canvas ref={stripRef} /></div>
      <div className="ss-help">
        Drag a guide — or focus it and tap the arrow keys for ±1 px (Shift = 5). Values are design px; the exported PNGs are 2× so they ship doubled. Hover, pressed and disabled share these borders, and {on ? "these exact numbers ship" : "Auto re-measures each export"}.
      </div>
    </div>
  );
}
