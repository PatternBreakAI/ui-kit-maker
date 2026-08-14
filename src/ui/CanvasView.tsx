import { useDeferredValue, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { Hand, Minus, Plus, LayoutGrid, Grip, AlignJustify, Square, SquarePen, Play, ImagePlus, X, PenTool, Microscope, Info } from "lucide-react";
import { routeOf, helpNavigate } from "./smartHelp";
import { LessonBody } from "./LessonCard";
import { t } from "@/shell/i18n";
import { KIT_LESSONS } from "@/generator/model";
import { useGen, fileToBgDataUrl } from "@/generator/store";
import { putBgOriginal, normalizeShipCopy } from "@/generator/bgvault";
import { capsOf, UPGRADE_LINES } from "@/generator/entitlements";
import { renderBevel, renderKit, padSvg, addShine } from "@/generator/bevel";
import { KIT_COMPONENTS, CANVAS_BGS, STATE_NAMES , applyKitDesign, applyKitTextFill, isDarkBg, resolveKitIcon } from "@/generator/model";
import type { GenStateName } from "@/generator/model";
import { KitPage } from "./KitPage";
import { LiveArt, shellHit } from "./LiveArt";
import { BoardView } from "./Board";
import { SliceStage } from "./SliceStage";
import { FirstVisitHints } from "./FirstVisit";

/* state names resolve per render so the homepage's language choice wins */
const capOf = (s: GenStateName) =>
  s === "default" ? t("stDefault") : s === "hover" ? t("stHover") : s === "pressed" ? t("stPressed") : t("stDisabled");

export function CanvasView() {
  const { cfg, update, zoom, setZoom, panMode, setPanMode, gridStyle, setGridStyle, phase, selectedState, setSelectedState, canvasMode, setCanvasMode, bgImage, setBgImage, focus, setFocus, parentId, kitShapes, kitSizes, kitTextOy, kitTextOx, kitTextFill, kitIcons, kitLabels, kitSubs, kitSlotVals, kitVals, kitDesigns, kitRow, kitKind, kitBar, boards, activeBoard, setBoardBg, sliceStage } = useGen();
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
  const fBar = focus === "progress" || focus === "segbar" ? kitBar[focus] : undefined;
  const fDock = fBar?.dock ? { icon: resolveKitIcon(kitIcons[focus!], undefined), side: fBar.dockSide ?? "left" as const } : undefined;
  // padSvg: the hero's box must not change when the Glow slider leaves 0
  const heroSvg = useMemo(
    // the document's idle wipe rides the design canvas too — same clipped
    // glint LiveArt applies on the playing surfaces
    () => ((sv: string) => (cfg.idle?.wipe && displayed !== "disabled" ? addShine(sv, { dur: cfg.idle?.freq, blend: cfg.idle?.blend }) : sv))(padSvg(focus ? renderKit(applyKitTextFill(applyKitDesign(cfg, kitDesigns[focus]), kitTextFill[focus]), focus, fSize, displayed, kitVals[focus] ?? (focus === "toggle" && displayed === "pressed" ? 0 : undefined), kitShapes[focus], { textOy: fOy, textOx: fOx, icon: resolveKitIcon(kitIcons[focus], undefined), label: kitLabels[focus], sub: kitSubs[focus], slots: kitSlotVals[focus], dock: fDock, bar: fBar, row: focus === "datarow" ? kitRow : undefined, kind: focus === "panel" ? (kitKind ?? undefined) : undefined, themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }) : parentId !== "button" ? renderKit(cfg, parentId, "l", displayed, kitVals[parentId], kitShapes[parentId], { label: kitLabels[parentId], icon: resolveKitIcon(kitIcons[parentId], undefined) }) : renderBevel(cfg, displayed))),
    [cfg, displayed, focus, parentId, kitShapes, fSize, fOy, fOx, kitRow, kitKind, kitBar, kitTextFill, kitIcons, kitLabels, kitSubs, kitSlotVals, kitVals, kitDesigns]
  );
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
           picture-in-picture bug) */
        style={bgImage && phase !== "board" ? {
          backgroundColor: cfg.canvas,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : {
          backgroundColor: cfg.canvas,
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
                  <PenTool size={13} strokeWidth={2} /> Editing: {KIT_COMPONENTS.find((c) => c.id === focus)?.name} — back to button
                </button>
                {/* the ⓘ lives on the BANNER, always visible while a
                    component is focused — it was buried in a collapsed
                    panel section before, and the owner rightly never
                    found it. The banner is chrome, not art, so the
                    pristine-canvas rule holds. */}
                {KIT_LESSONS[focus] && (
                  <button className={`focuschip focuschip--info${lessonOpen ? " on" : ""}`} aria-expanded={lessonOpen}
                    title={`About ${KIT_COMPONENTS.find((c) => c.id === focus)?.name} — what it is, what's editable, where it comes from`}
                    onClick={() => setLessonOpen(!lessonOpen)}>
                    <Info size={13} strokeWidth={2.2} />
                  </button>
                )}
                {lessonOpen && KIT_LESSONS[focus] && (
                  <div className="lessonpop"><LessonBody cid={focus} /></div>
                )}
              </span>
            )}
            <div className="state-cap" style={{ color: capColor }}>
              {/* Play mode says WHY the tray is gone — a slimmed panel with
                  no explanation reads as breakage, not a mode */}
              {playing && focus ? "Live — hover, press, drag"
                : playing ? `${capOf(displayed)}${live ? " · live" : ""} · Play — the pencil brings your controls back`
                : capOf(displayed)}
            </div>
            {playing && focus ? (
              /* v62: in Play mode the hero IS the live component — sliders
                 drag, toggles flip, bars replay — the same LiveArt engine
                 the kit page runs, at hero scale */
              <div className="hero-slot hot" onPointerDown={(e) => e.stopPropagation()}>
                <LiveArt playing scale={1} stablePad
                  cfg={applyKitTextFill(applyKitDesign(cfg, kitDesigns[focus]), kitTextFill[focus])}
                  kit={{ id: focus, size: fSize, shape: kitShapes[focus], label: kitLabels[focus], sub: kitSubs[focus], slots: kitSlotVals[focus], value: kitVals[focus],
                    icon: resolveKitIcon(kitIcons[focus], undefined), textOy: fOy, textOx: fOx,
                    dock: fDock, bar: fBar,
                    row: focus === "datarow" ? kitRow : undefined,
                    kind: focus === "panel" ? (kitKind ?? undefined) : undefined,
                    themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }} />
              </div>
            ) : (
            <div
              className={`hero-slot${playing ? " hot" : ""}`}
              {...(playing ? {
                /* the hero's hit zone is the SHELL — the reserved glow pad
                   around it stays pointer-dead (shellHit) */
                onPointerEnter: (e: React.PointerEvent) => {
                  if (shellHit((e.currentTarget as HTMLElement).querySelector("svg"), e.clientX, e.clientY)) setLive(e.buttons === 1 ? "pressed" : "hover");
                },
                onPointerMove: (e: React.PointerEvent) => {
                  const inside = shellHit((e.currentTarget as HTMLElement).querySelector("svg"), e.clientX, e.clientY);
                  setLive((l) => (l === "pressed" ? l : inside ? (l ?? "hover") : null));
                },
                onPointerLeave: () => setLive(null),
                onPointerDown: (e: React.PointerEvent) => {
                  if (!shellHit((e.currentTarget as HTMLElement).querySelector("svg"), e.clientX, e.clientY)) return;
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
                {routeOf(helpHover.parts[0]).label}{helpHover.parts.length > 1 ? ` +${helpHover.parts.length - 1} more — click` : " — click to edit"}
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
          <button className={!playing ? "on" : ""} title="Design mode — canvas stays on the state you're editing"
            aria-pressed={!playing} onClick={() => setCanvasMode("design")}>
            <SquarePen size={17} strokeWidth={1.8} />
          </button>
          <button className={playing ? "on" : ""} title="Play mode — hover and press the button live"
            aria-pressed={playing} onClick={() => { setCanvasMode("play"); }}>
            <Play size={17} strokeWidth={1.8} />
          </button>
          {/* Dissect, not "help": the owner named the interaction — the mode
              takes the artwork apart. A question mark undersold it. */}
          {phase === "master" && (
            <button className={helpOn ? "on" : ""} title="Dissect — click any part of the art to see what it is and where to edit it"
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
          <button title={phase === "board" ? "Upload a background for the ACTIVE artboard — it crops to the board bounds" : "Upload a background image — see your assets on a real game screen"}
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
                  const assetId = await putBgOriginal(ship, f.name);
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
            title="Custom canvas color — the picker includes an eyedropper">
            <span style={{ background: CANVAS_BGS.every((b) => b.id !== cfg.canvas) ? cfg.canvas : "conic-gradient(#f66,#fc6,#6f9,#6cf,#96f,#f66)" }} />
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.canvas) ? cfg.canvas : "#ffffff"}
              aria-label="Custom canvas color"
              onChange={(e) => update((c) => { c.canvas = e.target.value.toUpperCase(); })} />
          </label>
        </div>
      </div>

      {phase === "master" && sideStates.length > 0 && (
        <div className="stack" aria-label="State previews">
          {(focus === "toggle" || focus === "badge"
            ? ([["default", focus === "toggle" ? "On" : "Presented", 1], ["pressed", focus === "toggle" ? "Off" : "Awarded", 0], ["disabled", "Disabled", 1]] as [GenStateName, string, number][])
            : sideStates.map((s) => [s, capOf(s), undefined] as [GenStateName, string, number | undefined])
          ).map(([s, cap, v]) => (
            <button className={`scard clickable${s === selectedState ? " sel" : ""}`} key={s}
              onClick={() => setSelectedState(s)} title={`Edit ${cap}`} aria-pressed={s === selectedState}>
              <div className="scard-title">{cap}{s === selectedState ? " · editing" : ""}</div>
              {/* the cards render from the DEFERRED cfg: during a slider drag
                  only the hero pays per frame — three extra engine renders per
                  tick were most of the drag's main-thread bill, and the cards
                  catch up the instant the pointer rests */}
              <div className="scard-body" dangerouslySetInnerHTML={{ __html: ((sv: string) => (cfg.idle?.wipe && s !== "disabled" ? addShine(sv, { dur: cfg.idle?.freq, blend: cfg.idle?.blend }) : sv))(padSvg(focus ? renderKit(applyKitTextFill(applyKitDesign(scardCfg, kitDesigns[focus]), kitTextFill[focus]), focus, fSize, s, v ?? kitVals[focus], kitShapes[focus], { textOy: fOy, textOx: fOx, icon: resolveKitIcon(kitIcons[focus], undefined), label: kitLabels[focus], dock: fDock, bar: fBar, row: focus === "datarow" ? kitRow : undefined, themedText: !!kitDesigns[focus]?.type || !!kitTextFill[focus] }) : parentId !== "button" ? renderKit(scardCfg, parentId, "l", s, v ?? kitVals[parentId], kitShapes[parentId], { label: kitLabels[parentId], icon: resolveKitIcon(kitIcons[parentId], undefined) }) : renderBevel(scardCfg, s))) }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


