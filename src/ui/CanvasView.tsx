import { useDeferredValue, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { Hand, Minus, Plus, LayoutGrid, Grip, AlignJustify, Square, SquarePen, Play, ImagePlus, X, PenTool, Microscope, Info } from "lucide-react";
import { routeOf, helpNavigate } from "./smartHelp";
import { LessonBody } from "./LessonCard";
import { t } from "@/shell/i18n";
import { KIT_LESSONS } from "@/generator/model";
import { useGen, kitPicOf, fileToBgDataUrl } from "@/generator/store";
import { normalizeShipCopy } from "@/generator/bgvault";
import { importBgAsset } from "@/generator/assets";
import { capsOf, UPGRADE_LINES } from "@/generator/entitlements";
import { renderBevel, renderKit, padSvg, addShine } from "@/generator/bevel";
import { KIT_COMPONENTS, CANVAS_BGS, STATE_NAMES, KIT_STATE_POSES, applyKitDesign, applyKitTextFill, isDarkBg, resolveKitIcon, baseOf } from "@/generator/model";
import type { GenStateName, KitComponentId } from "@/generator/model";
import { KitPage } from "./KitPage";
import { LiveArt, shellHit, shellRectHit, detachBBoxNoise } from "./LiveArt";
import { BoardView } from "./Board";
import { SliceStage } from "./SliceStage";
import { FirstVisitHints } from "./FirstVisit";

/* state names resolve per render so the homepage's language choice wins */
const capOf = (s: GenStateName) =>
  s === "default" ? t("stDefault") : s === "hover" ? t("stHover") : s === "pressed" ? t("stPressed") : t("stDisabled");

/** A state card's art, centered on its MEASURED ink — not its canvas box.
 *  The render's canvas reserves the sliders' full travel BELOW the shell
 *  (extrusion cap + four-sigma shadow room), so tall pieces carry far more
 *  air under the ink than over it; the card's plain CSS fit then hangs the
 *  visible asset at the card's bottom edge (owner, round 52: "the tray on
 *  the right is misaligned... the asset doesn't appear in the middle of
 *  the container" — an icon button sat 25px low in a 56px card). This
 *  measures the drawn ink (getBBox with the hit/focus/shine helpers
 *  detached — the board's body-box discipline) and translates the svg so
 *  the INK centers in the card, scaling down only when the ink itself
 *  outgrows the card. The glow air is never cropped — it keeps drawing
 *  past the card edges (overflow: visible), now spilling evenly. */
function ScardBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    const svg = box?.querySelector("svg");
    if (!box || !svg) return;
    const center = () => {
      // re-measure from a clean slate — a stale correction skews the rects
      svg.style.transform = "";
      const restore = detachBBoxNoise(svg);
      let bb: DOMRect;
      try { bb = svg.getBBox(); } catch { return; } finally { restore(); }
      const vb = svg.viewBox?.baseVal;
      if (!vb?.width || !vb.height || !bb.width || !bb.height) return;
      const sr = svg.getBoundingClientRect();
      const br = box.getBoundingClientRect();
      if (!sr.width || !br.width) return;
      const kx = sr.width / vb.width, ky = sr.height / vb.height;
      const ix = sr.x + (bb.x - vb.x) * kx, iy = sr.y + (bb.y - vb.y) * ky;
      const iw = bb.width * kx, ih = bb.height * ky;
      // shrink only if the ink itself outgrows the card space (tall pieces
      // whose width-fit size overshoots); never grow — the familiar sizes hold
      const fit = Math.min(1, (br.width - 4) / iw, (br.height - 4) / ih);
      const dx = (br.x + br.width / 2) - (ix + iw / 2);
      const dy = (br.y + br.height / 2) - (iy + ih / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && fit === 1) return;
      svg.style.transformOrigin = `${(ix + iw / 2 - sr.x).toFixed(1)}px ${(iy + ih / 2 - sr.y).toFixed(1)}px`;
      svg.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)${fit < 1 ? ` scale(${fit.toFixed(3)})` : ""}`;
    };
    center();
    // fonts land after first paint and can move the measured ink; the card
    // box can also resize with the layout — both re-center, cheaply (4 cards)
    const ro = new ResizeObserver(center);
    ro.observe(box);
    let dead = false;
    document.fonts?.ready?.then(() => { if (!dead) center(); }).catch(() => {});
    return () => { dead = true; ro.disconnect(); };
  }, [html]);
  return <div className="scard-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CanvasView() {
  const { cfg, update, zoom, setZoom, panMode, setPanMode, gridStyle, setGridStyle, phase, selectedState, setSelectedState, canvasMode, setCanvasMode, bgImage, setBgImage, focus, setFocus, parentId, kitShapes, kitSizes, kitTextOy, kitTextOx, kitTextFill, kitIcons, kitLabels, kitNoText, kitSubs, kitSlotVals, kitVals, kitDesigns, kitPics, kitPicFx, kitRow, kitKind, kitOverlay, setKitOverlay, kitBar, boards, activeBoard, setBoardBg, sliceStage, kitClones } = useGen();
  /* clone-aware: a duplicated piece RENDERS through its base (renderKit and
     LiveArt refuse clone ids), its name lives in the clone registry, and
     every map read stays keyed by the piece's own id */
  const fBase = focus ? baseOf(focus) : null;
  const pieceLabel = (id: string) => kitClones[id]?.name ?? KIT_COMPONENTS.find((c) => c.id === baseOf(id as KitComponentId))?.name ?? id;
  // the state-preview cards trail the live cfg by a frame during drags —
  // they are references, not the thing being edited (see the scard render)
  const scardCfg = useDeferredValue(cfg);
  const actBd = boards.find((b) => b.id === activeBoard);
  const [gridPop, setGridPop] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (gridRef.current && !gridRef.current.contains(e.target as Node)) setGridPop(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const scroller = useRef<HTMLDivElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  // live interaction: hovering/pressing the hero previews those states ("hot"),
  // while edits keep applying to the selected state.
  const [live, setLive] = useState<"hover" | "pressed" | null>(null);
  // the master hero's RESTING shell stamp — unioned into play hit-tests so
  // a posing lift never pulls the hitbox out from under the cursor
  const heroDefShell = useRef<number[] | null>(null);
  const heroHit = (e: React.PointerEvent): boolean => {
    const svgEl = (e.currentTarget as HTMLElement).querySelector("svg");
    return shellHit(svgEl, e.clientX, e.clientY) ||
      (live !== null && !!heroDefShell.current && shellRectHit(svgEl, heroDefShell.current, e.clientX, e.clientY));
  };

  /* ── Smart Help — rollover the art, land on the control ──────────
     Help mode turns the hero into an index of its own layers: hovering
     lists the stamped `data-part` layers under the pointer (deepest
     first), clicking opens the breakout, choosing a layer deep-links
     into the panel (open + scroll + glow). Pure DOM hit-testing over
     the same svg the user is looking at — no geometry duplicated. */
  const [helpOn, setHelpOn] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [helpHover, setHelpHover] = useState<{ x: number; y: number; w: number; h: number; parts: string[] } | null>(null);
  const [helpMenu, setHelpMenu] = useState<{ x: number; y: number; parts: string[] } | null>(null);
  const helpWrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!helpOn) { setHelpHover(null); setHelpMenu(null); } }, [helpOn]);
  useEffect(() => { setLessonOpen(false); }, [focus]);
  useEffect(() => {
    if (!helpMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.(".sh-menu")) setHelpMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setHelpMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [helpMenu]);
  // Escape backs all the way out of Dissect (the menu's own Escape wins first)
  useEffect(() => {
    if (!helpOn) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !helpMenu) setHelpOn(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [helpOn, helpMenu]);
  const partsAt = (cx: number, cy: number): { parts: string[]; top: Element | null } => {
    // data-part only exists on renderer layer groups, so presence IS the
    // containment check — the overlay itself never matches
    const seen = new Set<string>();
    const parts: string[] = [];
    let top: Element | null = null;
    for (const el of document.elementsFromPoint(cx, cy)) {
      let g: Element | null = (el as Element).closest?.("[data-part]") ?? null;
      while (g) {
        const p = g.getAttribute("data-part");
        if (p && !seen.has(p)) { seen.add(p); parts.push(p); if (!top) top = g; }
        g = g.parentElement?.closest?.("[data-part]") ?? null;
      }
    }
    return { parts, top };
  };
  const onHelpMove = (e: React.PointerEvent) => {
    if (helpMenu) return;
    const { parts, top } = partsAt(e.clientX, e.clientY);
    if (!parts.length || !top || !helpWrap.current) { setHelpHover(null); return; }
    const r = (top as SVGGraphicsElement).getBoundingClientRect();
    const host = helpWrap.current.getBoundingClientRect();
    setHelpHover({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height, parts });
  };
  const onHelpClick = (e: React.MouseEvent) => {
    // clicks inside the breakout belong to the breakout
    if ((e.target as Element | null)?.closest?.(".sh-menu")) return;
    const { parts } = partsAt(e.clientX, e.clientY);
    if (!parts.length || !helpWrap.current) return;
    const host = helpWrap.current.getBoundingClientRect();
    if (parts.length === 1) { helpNavigate(parts[0]); return; }
    setHelpMenu({ x: e.clientX - host.left, y: e.clientY - host.top, parts });
  };

  // Design mode locks the canvas to the state being edited; Play mode makes
  // the hero live under the pointer.
  const playing = canvasMode === "play";
  const displayed: GenStateName = phase === "master" && playing && live && selectedState !== "disabled" ? live : selectedState;
  // the hero previews the focused component at its kit-selected size, with its
  // own vertical text nudge — the same key the Typography panel edits, so the
  // slider responds live on the surface the user is actually looking at
  const fSize = focus ? (kitSizes[focus] ?? "l") : "l";
  const fOy = focus ? kitTextOy[`${focus}:${fSize}`] : undefined;
  const fOx = focus ? kitTextOx[`${focus}:${fSize}`] : undefined;
  // bar-family config for the hero: dock + segments follow the store
  const fBar = focus && (fBase === "progress" || fBase === "segbar") ? kitBar[focus] : undefined;
  // the focused piece's idle-motion fork wins over the kit's toggles (the
  // edge line rides applyKitDesign; the wipe wrapper reads this instead)
  const fWipe = (focus ? kitDesigns[focus]?.idle?.wipe : undefined) ?? cfg.idle?.wipe;
  /* variant-aware hero (kitKind's sibling): the ghost card's Edit lands
     on the ghost CONSTRUCTION, not the solid pad (owner: clicking Edit
     showed "the other green joystick") — an explicit opt-in list, so a
     stale overlay can never repose another piece's specimen faces. The
     skill node rides it as a badge-with-states piece (round 61): its
     state tray pins kitOverlay, and the hero must wear the pinned state
     or the state's wells steer art the canvas never draws. */
  const fOv = fBase === "joystick" || fBase === "skillnode" ? (kitOverlay ?? undefined) : undefined;
  const fDock = fBar?.dock ? { icon: resolveKitIcon(kitIcons[focus!], undefined), side: fBar.dockSide ?? "left" as const } : undefined;
  /* the maker's own picture for this piece (round 73) — null until the
     bytes resolve, and null is the icon fallback, not a failure */
  const fPic = kitPicOf(useGen.getState(), focus ?? undefined);
  const fLogo = kitPicOf(useGen.getState(), focus ?? undefined, "logo");
  // padSvg: the hero's box must not change when the Glow slider leaves 0
  const heroSvg = useMemo(
    // the document's idle wipe rides the design canvas too — same clipped
    // glint LiveArt applies on the playing surfaces
    () => ((sv: string) => (fWipe && displayed !== "disabled" ? addShine(sv, { dur: cfg.idle?.freq, sweep: cfg.idle?.wipeDur, width: cfg.idle?.wipeWidth, armed: cfg.idle?.trigger === "hover", blend: cfg.idle?.blend }) : sv))(padSvg(focus ? renderKit(applyKitTextFill(applyKitDesign(cfg, kitDesigns[focus]), kitTextFill[focus]), baseOf(focus), fSize, displayed, kitVals[focus] ?? (baseOf(focus) === "toggle" && displayed === "pressed" ? 0 : undefined), kitShapes[focus], { textOy: fOy, textOx: fOx, icon: resolveKitIcon(kitIcons[focus], undefined), pic: fPic, logo: fLogo, label: kitNoText[focus] ? "" : kitLabels[focus], sub: kitSubs[focus], slots: kitSlotVals[focus], dock: fDock, bar: fBar, row: baseOf(focus) === "datarow" ? kitRow : undefined, kind: baseOf(focus) === "panel" ? (kitKind ?? undefined) : undefined, overlay: fOv, themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }) : parentId !== "button" ? renderKit(cfg, parentId, "l", displayed, kitVals[parentId], kitShapes[parentId], { label: kitNoText[parentId] ? "" : kitLabels[parentId], icon: resolveKitIcon(kitIcons[parentId], undefined) }) : renderBevel(cfg, displayed))),
    /* the maker's own picture belongs in here BY ITS HREF (round 73d): the
       resolved object is a fresh identity every render, so listing it would
       bust the memo constantly, while listing nothing meant the canvas kept
       serving the render made before the bytes arrived — the owner's report
       exactly, "the uploaded image only showed up once I clicked the no
       text checkbox", because that checkbox is in this list and the picture
       was not. */
    [cfg, displayed, focus, parentId, kitShapes, fSize, fOy, fOx, kitRow, kitKind, fOv, kitBar, kitTextFill, kitIcons, kitLabels, kitNoText, kitSubs, kitSlotVals, kitVals, kitDesigns, fPic?.href, fLogo?.href, kitPics, kitPicFx]
  );
  /* ── the hero finds the middle of its workspace ──────────────────────
     The render's canvas reserves the sliders' full travel BELOW the shell
     (extrusion cap + shadow room; padSvg's stable glow pad all around), so
     the visible piece rides high of true center in its slot — the same
     content-sized-not-a-card gap the state cards closed (ScardBody),
     adapted to the workspace: measure the drawn ink (getBBox, bbox noise
     detached) and TRANSLATE the svg so the INK centers in the hero slot.
     Translate only, never scale — the workspace zooms and scrolls and the
     familiar sizes are the editor's truth; and the transform never touches
     the LAYOUT box, so the full-travel reserve keeps holding the box
     constant through slider drags, and pan range + zoom re-anchoring
     (which read the box) keep their math. Hit and selection geometry
     follow for free: shellHit/shellRectHit, Dissect and Smart Help all
     measure the svg's LIVE client rect, which carries the transform.
     While a live pose is up (Play hover/press) the nudge FREEZES at the
     resting measure — re-centering a lifted shell would cancel the very
     press travel the pose exists to show. */
  const heroBox = useRef<HTMLDivElement>(null);
  const [heroNudge, setHeroNudge] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const box = heroBox.current;
    const svg = box?.querySelector("svg");
    // no design svg (LiveArt owns the play-focus hero) or mid-pose: keep
    // the frozen resting nudge
    if (!box || !svg || live !== null) return;
    const center = () => {
      const restore = detachBBoxNoise(svg);
      let bb: DOMRect;
      try { bb = svg.getBBox(); } catch { return; } finally { restore(); }
      const vb = svg.viewBox?.baseVal;
      if (!vb?.width || !vb.height || !bb.width || !bb.height) return;
      // measure the LAYOUT truth — the stamped correction must not skew it
      const prev = svg.style.transform;
      svg.style.transform = "none";
      const sr = svg.getBoundingClientRect();
      const br = box.getBoundingClientRect();
      svg.style.transform = prev;
      if (!sr.width || !br.width) return;
      const kx = sr.width / vb.width, ky = sr.height / vb.height;
      const ix = sr.x + (bb.x - vb.x) * kx + (bb.width * kx) / 2;
      const iy = sr.y + (bb.y - vb.y) * ky + (bb.height * ky) / 2;
      // client rects are screen px; the transform resolves in zoomed CSS px
      const z = Math.max(0.05, zoom);
      const nx = (br.x + br.width / 2 - ix) / z, ny = (br.y + br.height / 2 - iy) / z;
      setHeroNudge((n) => (Math.abs(n.x - nx) < 0.5 && Math.abs(n.y - ny) < 0.5 ? n : { x: nx, y: ny }));
    };
    center();
    // fonts land after first paint and the slot resizes with the layout
    const ro = new ResizeObserver(center);
    ro.observe(box);
    let dead = false;
    document.fonts?.ready?.then(() => { if (!dead) center(); }).catch(() => {});
    return () => { dead = true; ro.disconnect(); };
  }, [heroSvg, zoom, live, playing, focus]);
  // innerHTML swaps mint a NEW svg with no inline style — restamp the nudge
  // after every commit (pose flips included, so press travel stays true)
  useLayoutEffect(() => {
    const svg = heroBox.current?.querySelector("svg");
    if (svg) svg.style.transform = heroNudge.x || heroNudge.y ? `translate(${heroNudge.x.toFixed(1)}px, ${heroNudge.y.toFixed(1)}px)` : "";
  });
  const heroNudgeStyle = heroNudge.x || heroNudge.y ? { transform: `translate(${heroNudge.x.toFixed(1)}px, ${heroNudge.y.toFixed(1)}px)` } : undefined;

  // Fixed order, selected included — the stack never reshuffles.
  const sideStates = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">]
  );
  const dark = isDarkBg(cfg.canvas);
  const capColor = dark ? "rgba(235,238,255,0.62)" : undefined;
  const dotColor = dark ? "rgba(235,238,255,0.16)" : "rgba(24,28,48,0.13)";
  const fineColor = dark ? "rgba(235,238,255,0.07)" : "rgba(24,28,48,0.06)";

  /* Zoom anchors on the viewport's CENTER, not the content's top. The scale
     is applied with the CSS `zoom` property, which — unlike a transform —
     grows the element's real layout box, so the scroller gains genuine
     scroll range and the hand tool can reach every part of the piece.
     (transform: scale() left the box unchanged: the scaled overflow existed
     visually but had no scroll range, so at 200% the piece pinned to the
     top and the hand tool went dead — owner: "the component gets locked at
     the top and you can't use the hand tool to center it".) */
  const lastZoom = useRef(zoom);
  useLayoutEffect(() => {
    const el = scroller.current;
    const prev = lastZoom.current;
    if (!el || prev === zoom) return;
    const k = zoom / prev;
    lastZoom.current = zoom;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!panMode || !scroller.current) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: scroller.current.scrollLeft, st: scroller.current.scrollTop };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    scroller.current.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className={`canvas-wrap${phase !== "master" ? " kitmode" : ""}${phase === "kit" ? " kitread" : ""}`}>
      <div className="canvas-col" style={{ position: "relative" }}>
      <div
        ref={scroller}
        className={`canvas${panMode ? " pan" : ""}`}
        /* the Board owns its own per-artboard backgrounds — the editor's
           backdrop image must never paint behind it (the old
           picture-in-picture bug).

           On the Board the scroller is not an artboard at all: it is the
           DESK the board sits on, and its header ("The Board", the aspect
           pills, Snap to grid, Safe area) is app chrome drawn in app ink.
           Painting it with the kit's canvas colour put a black desk with
           near-black words under a light top bar and light trays in light
           mode (round 68). The desk takes the app's ground from CSS
           instead; the board's own artboard keeps its colour, its
           backdrop and its overlays in .bd-stage, where they belong.

           Round 69 finishes the line: the scroller is an ARTBOARD in
           MASTER phase only — that is the one phase where the piece being
           designed actually stands on it. On the Kit it is the desk under
           a DOCUMENT: the sheet's ground, behind its prose and its section
           chrome, is app furniture and follows the app's theme like the
           top bar beside it. The stage backdrop stays with the artboard
           for the same reason it stays off the Board — a photograph under
           a page of body copy is the same mixing, one layer down. The
           user's canvas colour is untouched and still paints the artboard
           in master phase, where it is their design decision. */
        style={bgImage && phase === "master" ? {
          backgroundColor: cfg.canvas,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : {
          backgroundColor: phase === "master" ? cfg.canvas : undefined,
          // the Kit is a document — it reads on a clean ground, never a grid
          backgroundImage: phase === "kit" ? undefined :
            gridStyle === "dots" ? `radial-gradient(circle, ${dotColor} 1px, transparent 1.4px)` :
            gridStyle === "lines" ? `linear-gradient(${dotColor} 1px, transparent 1px), linear-gradient(90deg, ${dotColor} 1px, transparent 1px)` :
            gridStyle === "fine" ? `linear-gradient(${fineColor} 1px, transparent 1px), linear-gradient(90deg, ${fineColor} 1px, transparent 1px)` :
            gridStyle === "both" ? `radial-gradient(circle, ${dotColor} 1px, transparent 1.4px), linear-gradient(${dotColor} 1px, transparent 1px), linear-gradient(90deg, ${dotColor} 1px, transparent 1px)` :
            undefined,
          backgroundSize: phase === "kit" ? undefined :
            gridStyle === "lines" ? "44px 44px" :
            gridStyle === "fine" ? "24px 24px" :
            gridStyle === "both" ? "22px 22px, 44px 44px, 44px 44px" :
            gridStyle === "dots" ? "22px 22px" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {phase === "master" ? (
          /* the zoom lives on an INNER, content-sized wrapper: CSS zoom
             re-resolves percentages, so zooming the stage itself made the
             hero's max-width:100% cap bite harder as zoom grew — the art
             SHRANK while the label said magnify (owner: "it actually
             starts to get smaller... at 150%"). A width:max-content
             wrapper has no percentages to fight. */
          <div className="stage"><div className="stage-zoom" style={{ zoom }}>
            {focus && (
              <span className="focusrow">
                <button className="focuschip" onClick={() => setFocus(null)} title="Back to the master button">
                  {/* the variant rides the banner ("Joystick · Ghost") so the
                      owner always knows WHICH face the canvas is showing */}
                  <PenTool size={13} strokeWidth={2} /> Editing: {pieceLabel(focus)}{fOv ? ` · ${fOv.charAt(0).toUpperCase()}${fOv.slice(1)}` : ""} (back to button)
                </button>
                {/* the ⓘ lives on the BANNER, always visible while a
                    component is focused — it was buried in a collapsed
                    panel section before, and the owner rightly never
                    found it. The banner is chrome, not art, so the
                    pristine-canvas rule holds. */}
                {KIT_LESSONS[baseOf(focus)] && (
                  <button className={`focuschip focuschip--info${lessonOpen ? " on" : ""}`} aria-expanded={lessonOpen}
                    title={`About ${pieceLabel(focus)}: what it is, what's editable, where it comes from`}
                    onClick={() => setLessonOpen(!lessonOpen)}>
                    <Info size={13} strokeWidth={2.2} />
                  </button>
                )}
                {lessonOpen && KIT_LESSONS[baseOf(focus)] && (
                  <div className="lessonpop"><LessonBody cid={baseOf(focus)} /></div>
                )}
              </span>
            )}
            <div className="state-cap" style={{ color: capColor }}>
              {/* Play mode says WHY the tray is gone — a slimmed panel with
                  no explanation reads as breakage, not a mode */}
              {playing && focus ? "Live: hover, press, drag"
                : playing ? `${capOf(displayed)}${live ? " · live" : ""} · Play: the pencil brings your controls back`
                /* a badge-with-states piece captions its SEMANTIC state —
                   "Default" over a pinned Learned pose read as a lie */
                : fBase && KIT_STATE_POSES[fBase]
                ? (KIT_STATE_POSES[fBase].find((p) => p.id === (kitOverlay ?? null)) ?? KIT_STATE_POSES[fBase][0]).name
                : capOf(displayed)}
            </div>
            {(() => {
              /* jitter guard (field notes #3: "the hitbox shifts when
                 hovering, moving out from under the mouse"): the hover
                 pose LIFTS the drawn shell, and testing only the current
                 stamp let the hitbox slide out from under a cursor parked
                 near the vacated edge — un-hover, drop, re-hover, flicker.
                 Remember the RESTING pose's shell and union it in, the
                 same contract LiveArt's play surfaces carry. */
              if (live === null) {
                const m = /data-shell="([-\d. ]+)"/.exec(heroSvg);
                const stamp = m?.[1].split(" ").map(Number);
                if (stamp?.length === 4 && stamp.every(Number.isFinite)) heroDefShell.current = stamp;
              }
              return null;
            })()}
            {playing && focus ? (
              /* v62: in Play mode the hero IS the live component — sliders
                 drag, toggles flip, bars replay — the same LiveArt engine
                 the kit page runs, at hero scale. It wears the same
                 measured nudge on its WRAPPER — same box, same ink offset,
                 so Design ↔ Play never jump; LiveArt's own hit tests read
                 live rects. */
              <div className="hero-slot hot" style={heroNudgeStyle} onPointerDown={(e) => e.stopPropagation()}>
                <LiveArt playing scale={1} stablePad
                  cfg={applyKitTextFill(applyKitDesign(cfg, kitDesigns[focus]), kitTextFill[focus])}
                  kit={{ id: baseOf(focus), size: fSize, shape: kitShapes[focus], label: kitLabels[focus], sub: kitSubs[focus], slots: kitSlotVals[focus], value: kitVals[focus],
                    icon: resolveKitIcon(kitIcons[focus], undefined), textOy: fOy, textOx: fOx,
                    dock: fDock, bar: fBar,
                    row: baseOf(focus) === "datarow" ? kitRow : undefined,
                    kind: baseOf(focus) === "panel" ? (kitKind ?? undefined) : undefined,
                    overlay: fOv,
                    themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }} />
              </div>
            ) : (
            <div
              ref={heroBox}
              className={`hero-slot${playing ? " hot" : ""}`}
              {...(playing ? {
                /* the hero's hit zone is the SHELL — the reserved glow pad
                   around it stays pointer-dead (shellHit) */
                onPointerEnter: (e: React.PointerEvent) => {
                  if (heroHit(e)) setLive(e.buttons === 1 ? "pressed" : "hover");
                },
                onPointerMove: (e: React.PointerEvent) => {
                  const inside = heroHit(e);
                  setLive((l) => (l === "pressed" ? l : inside ? (l ?? "hover") : null));
                },
                onPointerLeave: () => setLive(null),
                onPointerDown: (e: React.PointerEvent) => {
                  if (!heroHit(e)) return;
                  e.stopPropagation();
                  setLive("pressed");
                },
                onPointerUp: () => setLive("hover"),
                onPointerCancel: () => setLive(null),
              } : {})}
              dangerouslySetInnerHTML={{ __html: heroSvg }}
            />
            )}
          </div></div>
        ) : phase === "board" ? (
          <BoardView playing={playing} />
        ) : (
          <div className="kitwrap" style={{ zoom }}>
            <KitPage />
          </div>
        )}

        {/* the toolbar lives OUTSIDE the scroller so it floats over the canvas
            instead of scrolling away with a long page (the Kit sheet) */}
      </div>

        {/* Smart Help layer — intercepts the pointer over the master stage;
            elementsFromPoint sees the art through it */}
        {helpOn && phase === "master" && (
          <div className="sh-layer" ref={helpWrap} onPointerMove={onHelpMove} onPointerLeave={() => setHelpHover(null)} onClick={onHelpClick}>
            {helpHover && !helpMenu && (<>
              <div className="sh-outline" style={{ left: helpHover.x, top: helpHover.y, width: helpHover.w, height: helpHover.h }} />
              <div className="sh-chip" style={{ left: helpHover.x + helpHover.w / 2, top: helpHover.y - 10 }}>
                {routeOf(helpHover.parts[0]).label}{helpHover.parts.length > 1 ? ` +${helpHover.parts.length - 1} more · click` : " · click to edit"}
              </div>
            </>)}
            {helpMenu && (
              <div className="sh-menu" style={{ left: helpMenu.x, top: helpMenu.y }} role="menu" aria-label="Layers under the pointer">
                <b>Layers here</b>
                {helpMenu.parts.map((p) => {
                  const r = routeOf(p);
                  return (
                    <button key={p} role="menuitem" onClick={() => { setHelpMenu(null); helpNavigate(p); }}>
                      <span>{r.label}</span><i>{r.hint}</i>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* the slicing workbench — the panel's 9-slice preview at working
            size, over the canvas ("we need to be pixel accurate here") */}
        {sliceStage && phase === "master" && <SliceStage />}
        <FirstVisitHints />
        <div className="zoolbar" role="toolbar" aria-label="Canvas tools">
          {/* the Kit page is permanently alive — Design/Play only applies to
              the editor hero and the board */}
          {phase !== "kit" && (<>
          <button className={!playing ? "on" : ""} title="Design mode: canvas stays on the state you're editing"
            aria-pressed={!playing} onClick={() => setCanvasMode("design")}>
            <SquarePen size={17} strokeWidth={1.8} />
          </button>
          {/* while alive the control IS the exit — Play becomes Stop and one
              click lands back in Design (field notes #3: "I didn't realize
              I was in play mode"; owner-approved) */}
          <button className={playing ? "on" : ""}
            title={playing ? "Stop: leave Play and go back to editing" : "Play mode: hover and press the button live"}
            aria-label={playing ? "Stop play mode" : "Play mode"}
            aria-pressed={playing} onClick={() => setCanvasMode(playing ? "design" : "play")}>
            {playing ? <Square size={15} strokeWidth={2} fill="currentColor" /> : <Play size={17} strokeWidth={1.8} />}
          </button>
          {/* Dissect, not "help": the owner named the interaction — the mode
              takes the artwork apart. A question mark undersold it. */}
          {phase === "master" && (
            <button className={helpOn ? "on" : ""} title="Dissect: click any part of the art to see what it is and where to edit it"
              aria-pressed={helpOn} aria-label="Dissect mode" onClick={() => setHelpOn(!helpOn)}>
              <Microscope size={20} strokeWidth={1.7} />
            </button>
          )}
          <span className="zdiv" />
          </>)}
          <button className={panMode ? "on" : ""} title="Pan" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>
            <Hand size={18} strokeWidth={1.8} />
          </button>
          <span className="zdiv" />
          <button title="Zoom out" onClick={() => setZoom(zoom - 0.1)}><Minus size={18} strokeWidth={1.8} /></button>
          <span className="zpct">{Math.round(zoom * 100)}%</span>
          <button title={zoom >= capsOf(useGen.getState().tier).zoomMax ? `Zoom is capped at ${Math.round(capsOf(useGen.getState().tier).zoomMax * 100)}% on this tier. ${UPGRADE_LINES[useGen.getState().tier]}` : "Zoom in"}
            onClick={() => setZoom(zoom + 0.1)}><Plus size={18} strokeWidth={1.8} /></button>
          <span className="zdiv" />
          {phase !== "kit" && (
          <div ref={gridRef} style={{ position: "relative", display: "flex" }}>
            <button className={gridStyle !== "off" ? "on" : ""} title="Grid style" aria-haspopup="menu" aria-expanded={gridPop}
              onClick={() => setGridPop(!gridPop)}>
              <LayoutGrid size={17} strokeWidth={1.8} />
            </button>
            {gridPop && (
              <div className="gridpop" role="menu">
                <button className={gridStyle === "dots" ? "on" : ""} onClick={() => { setGridStyle("dots"); setGridPop(false); }}>
                  <Grip size={15} strokeWidth={1.8} /> Dots
                </button>
                <button className={gridStyle === "lines" ? "on" : ""} onClick={() => { setGridStyle("lines"); setGridPop(false); }}>
                  <AlignJustify size={15} strokeWidth={1.8} /> Lines
                </button>
                <button className={gridStyle === "fine" ? "on" : ""} onClick={() => { setGridStyle("fine"); setGridPop(false); }}>
                  <AlignJustify size={15} strokeWidth={1.4} /> Fine lines
                </button>
                <button className={gridStyle === "both" ? "on" : ""} onClick={() => { setGridStyle("both"); setGridPop(false); }}>
                  <LayoutGrid size={15} strokeWidth={1.8} /> Dots + Lines
                </button>
                <button className={gridStyle === "off" ? "on" : ""} onClick={() => { setGridStyle("off"); setGridPop(false); }}>
                  <Square size={15} strokeWidth={1.8} /> Off
                </button>
              </div>
            )}
          </div>
          )}
          <span className="zdiv" />
          <button title={phase === "board" ? "Upload a background for the ACTIVE artboard. It crops to the board bounds." : "Upload a background image and see your assets on a real game screen"}
            onClick={() => bgInput.current?.click()}
            className={(phase === "board" ? !!actBd?.bgImage : !!bgImage) ? "on" : ""}>
            <ImagePlus size={17} strokeWidth={1.8} />
          </button>
          {(phase === "board" ? actBd?.bgImage : bgImage) && (
            <button title="Clear background image" onClick={() => (phase === "board" ? setBoardBg({ bgImage: null }) : setBgImage(null))}>
              <X size={16} strokeWidth={2} />
            </button>
          )}
          <input ref={bgInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              /* BOARD backdrops go through the VAULT — pixels must never ride
                 the document (field: "site is freezing again" — this button
                 was the one upload path still planting data URLs, which the
                 history stringified on every edit AND persistence stripped on
                 reload, losing the backdrop). The EDITOR backdrop stays a
                 downscaled data URL by design: it travels with the kit
                 payload, so it comes through in shares and saved projects. */
              if (f && phase === "board") {
                void normalizeShipCopy(f).then(async (ship) => {
                  const assetId = await importBgAsset(ship, f.name);
                  setBoardBg({ bgImage: URL.createObjectURL(ship), bgAssetId: assetId, bgVideo: null, bgShow: true });
                });
              } else if (f) void fileToBgDataUrl(f).then((url) => setBgImage(url));
              e.target.value = "";
            }} />
          <span className="zdiv" />
          {CANVAS_BGS.map((b) => (
            <button key={b.id} className={`bgdot${cfg.canvas === b.id ? " on" : ""}`} title={`Canvas: ${b.name}`}
              onClick={() => update((c) => { c.canvas = b.id; })}>
              <span style={{ background: b.id }} />
            </button>
          ))}
          <label className={`bgdot bgcustom${CANVAS_BGS.every((b) => b.id !== cfg.canvas) ? " on" : ""}`}
            title="Custom canvas color. The picker includes an eyedropper.">
            <span style={{ background: CANVAS_BGS.every((b) => b.id !== cfg.canvas) ? cfg.canvas : "conic-gradient(#f66,#fc6,#6f9,#6cf,#96f,#f66)" }} />
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.canvas) ? cfg.canvas : "#ffffff"}
              aria-label="Custom canvas color"
              onChange={(e) => update((c) => { c.canvas = e.target.value.toUpperCase(); })} />
          </label>
        </div>
      </div>

      {phase === "master" && sideStates.length > 0 && (
        <div className="stack" aria-label="State previews">
          {fBase && KIT_STATE_POSES[fBase] ? (
            /* the badge-with-states tray (owner, round 61 correction:
               "instead of two separate objects we should think of this
               like a badge with states") — a semantic-state piece's stack
               shows ITS faces (the toggle On/Off card grammar), and a
               card pins its state: the canvas poses to it and the panel
               opens that state's own wells. selectedState resets so a
               stale pointer-state pin never compounds the pose. */
            KIT_STATE_POSES[fBase].map((p) => {
              const isSel = (kitOverlay ?? null) === p.id;
              return (
                <button className={`scard clickable${isSel ? " sel" : ""}`} key={p.name}
                  onClick={() => { setKitOverlay(p.id); setSelectedState("default"); }} title={`Edit ${p.name}`} aria-pressed={isSel}>
                  <div className="scard-title">{p.name}{isSel ? " · editing" : ""}</div>
                  <ScardBody html={((sv: string) => (fWipe && p.id !== "locked" ? addShine(sv, { dur: cfg.idle?.freq, sweep: cfg.idle?.wipeDur, width: cfg.idle?.wipeWidth, armed: cfg.idle?.trigger === "hover", blend: cfg.idle?.blend }) : sv))(padSvg(renderKit(applyKitTextFill(applyKitDesign(scardCfg, kitDesigns[focus!]), kitTextFill[focus!]), fBase, fSize, "default", kitVals[focus!], kitShapes[focus!], { textOy: fOy, textOx: fOx, icon: resolveKitIcon(kitIcons[focus!], undefined), slots: kitSlotVals[focus!], overlay: p.id ?? undefined, themedText: !!kitDesigns[focus!]?.type || !!kitTextFill[focus!] })))} />
                </button>
              );
            })
          ) : (fBase === "toggle"
            ? ([["default", "On", 1], ["pressed", "Off", 0], ["disabled", "Disabled", 1]] as [GenStateName, string, number][])
            /* the badge's rollover shows the COUNT face wearing the kit's
               hover recipe — without this card that face is unreachable in
               the editor (the owner's "ghost rollover") */
            : fBase === "badge"
            ? ([["default", "Presented", 1], ["hover", "Rollover", 1], ["pressed", "Awarded", 0], ["disabled", "Disabled", 1]] as [GenStateName, string, number][])
            : sideStates.map((s) => [s, capOf(s), undefined] as [GenStateName, string, number | undefined])
          ).map(([s, cap, v]) => (
            <button className={`scard clickable${s === selectedState ? " sel" : ""}`} key={s}
              onClick={() => setSelectedState(s)} title={`Edit ${cap}`} aria-pressed={s === selectedState}>
              <div className="scard-title">{cap}{s === selectedState ? " · editing" : ""}</div>
              {/* the cards render from the DEFERRED cfg: during a slider drag
                  only the hero pays per frame — three extra engine renders per
                  tick were most of the drag's main-thread bill, and the cards
                  catch up the instant the pointer rests */}
              <ScardBody html={((sv: string) => (fWipe && s !== "disabled" ? addShine(sv, { dur: cfg.idle?.freq, sweep: cfg.idle?.wipeDur, width: cfg.idle?.wipeWidth, armed: cfg.idle?.trigger === "hover", blend: cfg.idle?.blend }) : sv))(padSvg(focus ? renderKit(applyKitTextFill(applyKitDesign(scardCfg, kitDesigns[focus]), kitTextFill[focus]), baseOf(focus), fSize, s, v ?? kitVals[focus], kitShapes[focus], { textOy: fOy, textOx: fOx, icon: resolveKitIcon(kitIcons[focus], undefined), label: kitNoText[focus] ? "" : kitLabels[focus], slots: kitSlotVals[focus], dock: fDock, bar: fBar, row: baseOf(focus) === "datarow" ? kitRow : undefined, overlay: fOv, themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }) : parentId !== "button" ? renderKit(scardCfg, parentId, "l", s, v ?? kitVals[parentId], kitShapes[parentId], { label: kitNoText[parentId] ? "" : kitLabels[parentId], icon: resolveKitIcon(kitIcons[parentId], undefined) }) : renderBevel(scardCfg, s))) } />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


