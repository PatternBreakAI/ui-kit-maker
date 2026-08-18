import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "@/styles/pricing.css"; // the staging bay wears the community desk's cg-curate buttons
import { ChevronDown, Download, Lock, PenTool, Pin, ShieldCheck, SquarePen } from "lucide-react";
import { useGen } from "@/generator/store";
import { CLONE_KINDS, EFFECT_ROLES, KIT_COMPONENTS, PRESETS, ROLE_HINT, SHAPES, STOCK_ICONS, STAGED_KIT, applyKitDesign, applyKitTextFill, baseOf, fontByName, groupOf, hexMix, isDarkBg, effKitSize, kitVisible, resolveKitIcon, sanitizeUnitySlug } from "@/generator/model";
import type { GenConfig, GenStateName, IconDef, KitComponentId, KitSize, Shape } from "@/generator/model";
import { renderBevel, renderKit, renderTypeSpecimen } from "@/generator/bevel";
import { silhouetteMeta, SILHOUETTES } from "@/generator/silhouettes";
import { previewSvg } from "@/generator/icons";
import { downloadSettings, downloadSvg, downloadZip, downloadSpriteSheet, buildSpriteSheetBytes, svgToPngBytesTight, setEmbedFont, fontDataUri } from "@/generator/exportUtils";
import { downloadEngineExport, fetchKitFont, collectExportBoards } from "@/generator/engineExport";
import { updateProjectDoc, loadProjectDoc } from "@/generator/cloud";
import { guardedExport } from "@/generator/exportGate";
import { kitSpecMarkdown, fontNotesMarkdown, kitFontFamilies } from "@/generator/kitDocs";
import { LiveArt, stillSmil } from "./LiveArt";
import { openAuth } from "@/shell/authOverlay";
import { openGate } from "@/shell/gateModal";
import { downloadTestKit } from "@/generator/billing";
import { canExport, UPGRADE_LINES } from "@/generator/entitlements";
import { HeroGL } from "./HeroGL";
import { buildUnityBriefing, type BriefCard } from "./unityBriefing";

/* The Kit — a living guideline sheet in five levels: Foundations, Components,
   Assemblies, Build Parts, Screen Patterns. One renderer draws everything,
   every example is live, and every piece opens in the editor. */

const CHAPTERS: [string, string, string][] = [
  ["foundations", "01", "Foundations"],
  ["components", "02", "Components"],
  ["parts", "03", "Build Parts"],
  ["patterns", "04", "Screen Patterns"],
  ["resources", "05", "Resources"],
];

/* Chapter tabs own the scroll-spy: the active-chapter state used to live on
   KitPage itself, so every chapter crossing while scrolling re-rendered the
   entire page — hundreds of pieces — to repaint one highlighted tab. */
function ChapterTabs() {
  const setPhase = useGen((s) => s.setPhase);
  const kitSizes = useGen((s) => s.kitSizes);
  const setKitSizeAll = useGen((s) => s.setKitSizeAll);
  const releases = useGen((s) => s.componentReleases);
  const kitClones = useGen((s) => s.kitClones);
  const isAdmin = useGen((s) => s.isAdmin);
  /* find a piece by name (owner: "I need search functionality in the
     kit") — data-space search over the component list plus the user's own
     clones, then a walk-down seek: chapters mount lazily, so the target
     may not exist in the DOM until the page has scrolled near it */
  const [q, setQ] = useState("");
  const groupName = (id: KitComponentId) => {
    const g = groupOf(id);
    return g && typeof g === "object" ? g.name : "";
  };
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    // a clone answers to its own name, its classification and its base
    // component's name; visibility follows the chapter's gate (base
    // released — or the admin, who sees staged-base clones there)
    const clones = Object.entries(kitClones)
      .filter(([, c]) => kitVisible(c.base, releases ?? {}, isAdmin))
      .filter(([cid, c]) => `${c.name} ${c.kind} ${KIT_COMPONENTS.find((k) => k.id === c.base)?.name ?? c.base} ${cid}`.toLowerCase().includes(t))
      .map(([cid, c]) => ({ id: cid, name: c.name, tag: c.kind }));
    const stock = KIT_COMPONENTS.filter((c) =>
      kitVisible(c.id, releases ?? {}, false) &&
      (c.name.toLowerCase().includes(t) || c.id.includes(t) || groupName(c.id).toLowerCase().includes(t)),
    ).map((c) => ({ id: c.id as string, name: c.name, tag: groupName(c.id) }));
    return [...clones, ...stock].slice(0, 9);
  }, [q, releases, kitClones, isAdmin]);
  const jumpTo = (id: string) => {
    setQ("");
    const scroller = document.querySelector(".canvas");
    if (!scroller) return;
    let tries = 0;
    const seek = () => {
      const el = document.querySelector<HTMLElement>(`[data-kp="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("kp-glowonce"); void el.offsetWidth; el.classList.add("kp-glowonce");
        window.setTimeout(() => el.classList.remove("kp-glowonce"), 1800);
        return;
      }
      if (++tries > 40) return;
      scroller.scrollBy({ top: 1200 });
      window.setTimeout(seek, 60);
    };
    seek();
  };
  // size is a KIT decision now — one switch up here instead of chips on
  // every cell. Mixed sizes (older saves) read as M until the next click
  // normalizes the kit.
  const sizeAll: KitSize = Object.values(kitSizes).some((v) => effKitSize(v) === "m") ? "m" : "l";
  // the user's clones carry their own chapter — its tab exists only while
  // visible clones do (same pre-document seat as the staging bay)
  const hasClones = Object.values(kitClones).some((c) => kitVisible(c.base, releases ?? {}, isAdmin));
  const chapters: [string, string, string][] = hasClones ? [["yours", "00", "Your components"], ...CHAPTERS] : CHAPTERS;
  const [activeChap, setActiveChap] = useState("foundations");
  useEffect(() => {
    const scroller = document.querySelector(".canvas");
    if (!scroller) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const marks = [...document.querySelectorAll<HTMLElement>("[data-chap]")];
      // above every mark, the FIRST chapter is current — which is the
      // clones chapter whenever one exists
      let current = marks[0]?.dataset.chap ?? "foundations";
      for (const m of marks) if (m.getBoundingClientRect().top < 280) current = m.dataset.chap ?? current;
      setActiveChap((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => { scroller.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <nav className="kp-tabsbar" aria-label="Kit chapters">
      {chapters.map(([id, num, name]) => (
        <button key={id} className={activeChap === id ? "on" : ""}
          onClick={() => {
            setActiveChap(id);
            const el = document.getElementById(`chap-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            // one glow pulse on arrival — "you are here"
            el?.classList.remove("kp-glowonce"); void el?.offsetWidth; el?.classList.add("kp-glowonce");
            window.setTimeout(() => el?.classList.remove("kp-glowonce"), 1800);
          }}>
          <span className="kp-tabnum">{num}</span> {name}
        </button>
      ))}
      <span className="kp-tabfind">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a piece…" aria-label="Find a component"
          onKeyDown={(e) => {
            if (e.key === "Enter" && found[0]) jumpTo(found[0].id);
            if (e.key === "Escape") setQ("");
          }} />
        {found.length > 0 && (
          <span className="kp-findlist" role="listbox">
            {found.map((c) => (
              <button key={c.id} role="option" onClick={() => jumpTo(c.id)}>
                {c.name}<i>{c.tag}</i>
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="kp-tabsizes" role="group" aria-label="Kit size">
        <span className="kp-tabsizelab">Size</span>
        {(["m", "l"] as const).map((s) => (
          <button key={s} className={sizeAll === s ? "on" : ""}
            title={s === "m" ? "Medium — the whole kit" : "Large — the whole kit"}
            onClick={() => setKitSizeAll(s)}>{s.toUpperCase()}</button>
        ))}
      </span>
      <button className="kp-tabedit" onClick={() => setPhase("master")} title="Back to the component editor">
        <PenTool size={13} strokeWidth={2} /> Editor
      </button>
    </nav>
  );
}

const PIECE_SCALE = 0.62;
const PATTERN_SCALE = 0.31;

const clone = (c: GenConfig) => JSON.parse(JSON.stringify(c)) as GenConfig;

/** Static art (type specimens, layer cards) at a uniform physical scale. */
/** Rewrite a specimen's viewBox to hug the text vertically — specimen
 *  canvases reserve glow travel that editorial rows don't need. */
function tightenV(svg: string, px: number, oy = 0): string {
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) return svg;
  if (!svg.includes("overflow:visible")) svg = svg.replace("<svg ", '<svg style="overflow:visible" ');
  // the specimen text sits at y≈86 plus the bottom-anchor rise reserve
  // (48·K, K = 130/168) plus the theme nudge at the same K — mirror the
  // renderer exactly, then hug it
  const K2 = 130 / 168;
  const cy = 86 + 48 * K2 + oy * K2;
  const y0 = cy - px * 0.92, h = px * 1.9;
  // trim the left glow reserve too so every row shares one left edge
  const x0 = 14, w = +vb[1] + +vb[3] - 14;
  return svg
    .replace(vb[0], `viewBox="${x0} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"`)
    .replace(/width="([\d.]+)"/, `width="${w.toFixed(1)}"`)
    .replace(/height="([\d.]+)"/, `height="${h.toFixed(1)}"`);
}

function Art({ svg, scale, className, hug = true }: { svg: string; scale: number; className?: string; hug?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | undefined>(() => {
    const m = svg.match(/width="([\d.]+)"/);
    return m ? +m[1] * scale : undefined;
  });
  /* Hug the real glyphs: engines measure display faces differently and the
     renderer's char estimate leaves right-side slack — measured cropping
     centers title art truly on any stage, in any browser. Fonts can settle
     AFTER the first measure (Safari loads even same-origin faces lazily),
     so the crop re-runs from the pristine box whenever a font lands —
     a stale crop reads as the specimen being masked mid-phrase. */
  useEffect(() => {
    if (!hug) return;
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    if (!el) return;
    const measure = () => {
      try {
        // re-measures must start from the renderer's box, not a prior crop
        if (el.dataset.vb0 === undefined) el.dataset.vb0 = el.getAttribute("viewBox") ?? "";
        else if (el.dataset.vb0) el.setAttribute("viewBox", el.dataset.vb0);
        // measure the RENDERED glyphs, not the paint and not the glint
        // clipPath copy in defs: a text bbox ignores filter shadows, so the
        // crop centers the face — and when the true face runs wider than
        // the renderer's estimate the window GROWS to the glyphs instead of
        // cropping into them
        const t = [...el.querySelectorAll("text")].find((n) => !n.closest("defs")) ?? null;
        const box = (t as SVGGraphicsElement | null)?.getBBox() ?? el.getBBox();
        const vb = el.viewBox.baseVal;
        const padX = 24;
        const x0 = t ? box.x - padX : Math.max(vb.x, box.x - padX);
        const x1 = t ? box.x + box.width + padX : Math.min(vb.x + vb.width, box.x + box.width + padX);
        if (x1 - x0 < 40 || (!t && x1 - x0 >= vb.width - 1)) return;
        el.setAttribute("viewBox", `${x0.toFixed(1)} ${vb.y} ${(x1 - x0).toFixed(1)} ${vb.height}`);
        el.setAttribute("width", (x1 - x0).toFixed(1));
        setW((x1 - x0) * scale);
      } catch { /* not laid out yet */ }
    };
    measure();
    const fonts = document.fonts;
    const onDone = () => measure();
    fonts?.addEventListener?.("loadingdone", onDone);
    // engines that settle fonts without firing loadingdone (or that fired it
    // before this art mounted) still get one late re-measure
    const late = window.setTimeout(measure, 800);
    return () => { fonts?.removeEventListener?.("loadingdone", onDone); window.clearTimeout(late); };
  }, [svg, scale, hug]); // eslint-disable-line react-hooks/exhaustive-deps
  // the reference sheet is a design surface — SMIL loops hold a settled
  // frame here; the playable pieces (LiveArt) wake theirs in Play
  useEffect(() => { stillSmil(ref.current, true); }, [svg]);
  return <div ref={ref} className={`kp-art${className ? " " + className : ""}`} style={{ width: w }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* v56: measured truth for track rails — a connector line must run through
   the VISIBLE shell centers, which trim margins shift per piece and scale.
   Every shell render stamps data-shell (viewBox coords); this hook maps it
   through the client rect and hands the container its real center line
   (--rail-y) plus each node its own (--node-cy). */
function useShellRail(ref: React.RefObject<HTMLDivElement | null>, sel: string) {
  const { cfg, kitDesigns, kitShapes, kitSizes } = useGen();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const position = () => {
      const host = el.getBoundingClientRect();
      if (!host.height) return;
      const centers: number[] = [];
      for (const zone of el.querySelectorAll<HTMLElement>(sel)) {
        const s = zone.querySelector<SVGSVGElement>("svg[data-shell]");
        const parts = (s?.getAttribute("data-shell") ?? "").split(" ").map(Number);
        if (!s || parts.length !== 4 || parts.some(Number.isNaN)) continue;
        const r = s.getBoundingClientRect();
        const vb = s.viewBox.baseVal;
        if (!r.height || !vb.height) continue;
        const cy = r.top + ((parts[1] + parts[3] / 2 - vb.y) / vb.height) * r.height;
        centers.push(cy);
        zone.style.setProperty("--node-cy", `${(cy - zone.getBoundingClientRect().top).toFixed(1)}px`);
      }
      if (centers.length) el.style.setProperty("--rail-y", `${(centers.reduce((a, b) => a + b, 0) / centers.length - host.top).toFixed(1)}px`);
      /* progression truth: the glow fill ends at the CURRENT node — measure
         its shell center-x and hand the rail the fill length in px */
      const rail = el.querySelector<HTMLElement>(".kp-rail3");
      const curS = el.querySelector<SVGSVGElement>(".kp-tnodezone.current svg[data-shell]");
      if (rail && curS) {
        const parts = (curS.getAttribute("data-shell") ?? "").split(" ").map(Number);
        const r = curS.getBoundingClientRect();
        const vb = curS.viewBox.baseVal;
        if (parts.length === 4 && !parts.some(Number.isNaN) && r.width && vb.width) {
          const cx = r.left + ((parts[0] + parts[2] / 2 - vb.x) / vb.width) * r.width;
          el.style.setProperty("--rail-fill", `${Math.max(0, cx - rail.getBoundingClientRect().left).toFixed(1)}px`);
        }
      }
    };
    const raf = requestAnimationFrame(position);
    const ro = new ResizeObserver(position);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ref, sel, cfg, kitDesigns, kitShapes, kitSizes]);
}

interface PieceOpts {
  id: KitComponentId; size?: KitSize; label?: string; segments?: string[];
  icon?: IconDef | null; value?: number; baseState?: GenStateName; scale?: number;
  sub?: string; max?: string; addBtn?: boolean; overlay?: string; iconScale?: number; trim?: boolean; tight?: boolean;
  /** render this instance FLAT — no extrusion, contact or cast shadow.
      Screen patterns that butt tiles edge-to-edge (the match-3 board)
      zero the depth story so cells sit flush like a real board. */
  flat?: boolean;
  kind?: "circle" | "oval" | "strip"; tone?: "alt"; shape?: Shape; shine?: boolean;
  dock?: { icon?: IconDef | null; side?: "left" | "right" } | null;
  bar?: { segments?: number; gap?: number; snap?: boolean };
  /** specimen slot poses — the user's own slot edits still ride on top */
  slots?: Record<string, string>;
}

/* the flat instance recipe (owner on the match-3 board: "take the
   extrusion out of those squares and butt them up against each other") */
function flatPiece(c: GenConfig, flat?: boolean): GenConfig {
  if (!flat) return c;
  const f = JSON.parse(JSON.stringify(c)) as GenConfig;
  f.candy.extrusion.depth = 0;
  f.candy.contact.opacity = 0;
  f.shadow.opacity = 0;
  return f;
}

/** Shared plumbing for every live piece on this page. The page is always
 *  alive — clicking a piece plays it; editing goes through the ✎ button. */
function usePiece(p: PieceOpts) {
  const { cfg, kitClones, kitShapes, kitSizes, kitDesigns, kitLocks, kitTextOy, kitTextOx, kitTextFill, kitIcons, kitLabels, kitNoText, kitSubs, kitSlotVals, kitVals, kitRow, kitBar, setFocus, setKitKind, setKitOverlay } = useGen();
  /* clone-aware (mirrors Panel/CanvasView): a duplicated piece renders
     through its BASE component — renderKit and LiveArt refuse clone ids —
     while every per-piece map read stays keyed by the piece's own id */
  const base = baseOf(p.id);
  // an explicit size (the Primary ramp) is fixed; everything else follows the
  // kit-wide size from the floating nav's M/L switch
  // the documentation shows medium and large only — a stored Small reads as Medium
  const size = p.size ?? effKitSize(kitSizes[p.id]);
  // a pinned component renders its own snapshot, not the master's style —
  // and a per-piece text color rides on top of either. Memoized: a fresh
  // object here on every render (this hook re-runs on ANY store change)
  // defeated LiveArt's svg memo and rewrote every piece's DOM each pass —
  // the same churn that wedged the Board stage (see StagePiece's fix).
  const kd = kitDesigns[p.id];
  const ktf = kitTextFill[p.id];
  const pieceCfg = useMemo(
    () => flatPiece(applyKitTextFill(applyKitDesign(cfg, kd), ktf), p.flat),
    [cfg, kd, ktf, p.flat],
  );
  return {
    cfg: pieceCfg,
    /* two distinct badges (owner: pieces read "locked" here while the
       editor said unlocked): LOCKED is the editor's "finished" freeze
       (kitLocks); PINNED just means the piece keeps its own look
       (kitDesigns) — unlocking keeps the pin by design. */
    locked: !!kitLocks[p.id],
    pinned: !!kitDesigns[p.id],
    size,
    name: kitClones[p.id]?.name ?? KIT_COMPONENTS.find((c) => c.id === base)?.name ?? p.id,
    kit: {
      id: base, size, shape: p.shape ?? kitShapes[p.id],
      // user content overrides beat the specimen's demo text and glyph;
      // an explicit "no icon" instance stays empty
      // slot POSES keep their identity (same rule as the catalog's rk()):
      // a specimen demonstrating "Premium" stays Premium under user edits
      label: kitNoText[p.id] ? "" : (kitLabels[p.id] ?? p.label), slots: p.slots ? { ...kitSlotVals[p.id], ...p.slots } : kitSlotVals[p.id], segments: p.segments,
      icon: resolveKitIcon(kitIcons[p.id], p.icon), value: kitVals[p.id] ?? p.value, baseState: p.baseState,
      sub: kitSubs[p.id] ?? p.sub, max: p.max, addBtn: p.addBtn, overlay: p.overlay, iconScale: p.iconScale,
      // instrument readouts default to plain AUTO ink; an explicit type fork
      // or per-piece text color re-themes them (see KitOpts.themedText)
      themedText: !!kitDesigns[p.id]?.type || !!kitTextFill[p.id],
      // explicit per-component vertical text adjustment (0 is a valid value)
      textOy: kitTextOy[`${p.id}:${size}`],
      textOx: kitTextOx[`${p.id}:${size}`],
      // data rows follow the row model everywhere; a variant's explicit
      // label/sub still wins for its own line
      row: base === "datarow" ? kitRow : undefined,
      kind: p.kind, tone: p.tone,
      // bar-family config: the user's per-component settings ride over the
      // specimen's defaults; the dock glyph follows the icon-swap system
      ...(base === "progress" || base === "segbar" ? (() => {
        const kb = kitBar[p.id];
        // a specimen that DEMOS the dock always keeps it — the panel toggle
        // drives the plain variants, the hero and the Board
        const dockOn = !!p.dock || (kb?.dock ?? false);
        return {
          dock: dockOn ? { icon: resolveKitIcon(kitIcons[p.id], p.dock?.icon), side: kb?.dockSide ?? p.dock?.side ?? "left" } : null,
          bar: { ...p.bar, ...(kb ? { segments: kb.segments ?? p.bar?.segments, gap: kb.gap ?? p.bar?.gap, snap: kb.snap ?? p.bar?.snap } : {}) },
        };
      })() : {}),
    },
    onEdit: () => {
      // the variant card's overlay rides along (the ghost joystick), the
      // stock card clears it — the canvas shows the face that was clicked
      setKitKind(p.kind ?? null); setKitOverlay(p.overlay ?? null); setFocus(p.id);
      // arriving from a piece's Edit button, surface its content controls —
      // text and icon swaps live there and collapsed sections hide them
      useGen.setState((st) => ({ open: { ...st.open, kiticon: true } }));
    },
  };
}

/** Split-button export: the primary click repeats the LAST format used
 *  (engine zip by default); the chevron lists every format with a one-line
 *  description. One click for the common case, nothing buried.
 *  preferId pins an instance's primary to one format regardless of the
 *  remembered pick — the Build Parts pulldown leads with the SVG pack
 *  (owner: that chapter IS the layered-SVG story). */
function ExportMenu({ actions, preferId }: {
  actions: { id: string; name: string; desc: string; busy?: boolean; locked?: boolean; prog?: { done: number; total: number; label: string } | null; run: () => void }[];
  preferId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(() => { try { return preferId ?? localStorage.getItem("ui-generator-lastexport") ?? "engine"; } catch { return preferId ?? "engine"; } });
  /* the progress run wears the kit's GLOW, always (owner) — it's the role
     that reads as light and motion, and on a dark page it carries a moving
     bar better than the bevel, which is a surface color. Bevel only stands
     in for a kit that never set a glow. */
  const accent = useGen((s) => s.cfg.effects.Glow || s.cfg.effects.Bevel || "#0E9CC9");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const primary = actions.find((a) => a.id === last && !a.locked) ?? actions.find((a) => !a.locked) ?? actions[0];
  const fire = (a: (typeof actions)[number]) => {
    if (!a.locked) {
      try { localStorage.setItem("ui-generator-lastexport", a.id); } catch { /* private mode */ }
      setLast(a.id);
    }
    setOpen(false); a.run();
  };
  return (
    <div className="kp-export" ref={ref}>
      <button className="kp-dlall kp-exportmain" style={{ "--kp-accent": accent } as CSSProperties} disabled={primary.busy} onClick={() => fire(primary)} title={primary.desc}>
        <Download size={14} strokeWidth={2.2} />{" "}
        {primary.busy
          ? (primary.prog
            ? (primary.prog.label === "catalog" ? `Packing the visual catalog… ${primary.prog.total > 1 ? `${Math.min(primary.prog.done, primary.prog.total)} of ${primary.prog.total}` : ""}`
              : primary.prog.label === "zip" ? "Zipping…"
              : `Rendering ${Math.min(primary.prog.done + 1, primary.prog.total)} of ${primary.prog.total}…`)
            : "Working…")
          : `Export — ${primary.name}`}
        {primary.busy && primary.prog && (
          <span className="kp-exportprog" style={{ width: `${Math.round((primary.prog.done / Math.max(1, primary.prog.total)) * 100)}%`, background: accent }} />
        )}
      </button>
      <button className="kp-dlall kp-exportarrow" style={{ "--kp-accent": accent } as CSSProperties} aria-haspopup="menu" aria-expanded={open} title="All export formats"
        onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={15} strokeWidth={2.2} />
      </button>
      {open && (
        <div className="kp-exportmenu" role="menu">
          {actions.map((a) => (
            <button key={a.id} role="menuitem" disabled={a.busy} className={a.locked ? "kp-exportlocked" : undefined} onClick={() => fire(a)}>
              <b>{a.locked && <Lock size={11} strokeWidth={2.4} />} {a.name} {a.locked && <i className="protag">PRO</i>}</b><span>{a.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Unity briefing — a loading-screen takeover while the engine zip
 *  builds (owner: "prep people with a 'unity warning' that plays while
 *  they wait… real analysis of your file… did-you-know stuff… a giant
 *  modal"). Cards come pre-computed from THIS kit's state; the modal
 *  cycles them over the real progress bar and leaves when the zip does.
 *  Hide returns to the split-button's slim progress — never a trap. */
function UnityBriefing({ cards, prog, accent, kitName, onHide }: {
  cards: BriefCard[];
  prog: { done: number; total: number; label: string } | null;
  accent: string;
  kitName: string;
  onHide: () => void;
}) {
  const [ix, setIx] = useState(0);
  const [held, setHeld] = useState(false);
  /* owner: "the cards are going by way too fast" — a card holds for a
     full 10s read, the pointer resting on it pauses the clock entirely,
     and a manual dot pick re-arms the whole hold (the timer keys on ix)
     instead of hopping away mid-read */
  useEffect(() => {
    if (held) return;
    const t = window.setTimeout(() => setIx((i) => i + 1), 10000);
    return () => window.clearTimeout(t);
  }, [ix, held]);
  const at = ix % cards.length;
  const card = cards[at];
  const pct = prog ? Math.round((prog.done / Math.max(1, prog.total)) * 100) : 4;
  const stage = !prog ? "Reading your kit"
    : prog.label === "catalog" ? "Packing the visual catalog"
    : prog.label === "zip" ? "Zipping"
    : `Rendering ${Math.min(prog.done + 1, prog.total)} of ${prog.total}`;
  return (
    <div className="kp-brief" role="dialog" aria-modal="true" aria-label="Preparing your Unity kit">
      <div className="kp-briefbox">
        <span className="kp-briefkick">Preparing your Unity kit</span>
        <h2 className="kp-brieftitle">{kitName}</h2>
        <div className="kp-briefbar" aria-hidden="true"><i style={{ width: `${pct}%`, background: accent }} /></div>
        <span className="kp-briefstage" role="status">{stage}…</span>
        <div className="kp-briefcard" key={at} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
          <i className={`kp-brieftag${card.kicker === "DID YOU KNOW" ? " know" : ""}`}>{card.kicker}</i>
          <b>{card.title}</b>
          <p>{card.body}</p>
        </div>
        <div className="kp-briefdots" aria-hidden="true">
          {cards.map((_, i) => <button key={i} className={i === at ? "on" : undefined} tabIndex={-1} onClick={() => setIx(i)} style={i === at ? { background: accent } : undefined} />)}
        </div>
        <button className="kp-briefhide" onClick={onHide}>Hide — the download finishes on its own</button>
      </div>
    </div>
  );
}

/* Specimen deep-dives collapse by default — the type section reads as a
   compact spec sheet, not a poster. */
function KpFold({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`kp-fold${open ? " open" : ""}`}>
      <button className="kp-foldhead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={13} strokeWidth={2.2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} /> {label}
      </button>
      {open && children}
    </div>
  );
}

/** Per-piece random shine timing: each active piece glints on its own clock
 *  (staggered delay) at its own pace (varied duration), so the sweep never
 *  fires in unison across the screen. Recomputed only when shine flips on. */
function useShineVars(active: boolean): React.CSSProperties | undefined {
  return useMemo(
    () => active
      ? ({ "--shine-delay": `-${(Math.random() * 11).toFixed(2)}s`, "--shine-dur": `${(9 + Math.random() * 6).toFixed(2)}s` } as React.CSSProperties)
      : undefined,
    [active],
  );
}

/* Guest tier proves the concept on five components; the rest of the sheet
   stays visible as locked teasers — seeing the kit sells the kit. */
const GUEST_KIT = new Set<KitComponentId>(["primary", "secondary", "small", "ghost", "iconbtn"]);
function LockedPiece({ caption }: { caption: string }) {
  return (
    <figure className="kp-piece kp-lockpiece">
      <button className="kp-lockcard" onClick={() => openAuth("signin")} title={UPGRADE_LINES.guest}>
        <Lock size={15} strokeWidth={2.2} />
        <span>{caption}</span>
        <em>Sign in to unlock</em>
      </button>
    </figure>
  );
}
function pieceName(id: KitComponentId): string {
  return KIT_COMPONENTS.find((c) => c.id === id)?.name ?? id;
}
/* Staging bay: staged pieces render NOWHERE public until released — not
   even as a named locked card (a caption would leak the roadmap). And the
   kit BODY shows them to nobody, admin included: an unreleased piece
   surfacing in the real chapters reads as a leak ("confusing and scary",
   owner). Admins test staged pieces inside the bay, which renders its own
   cards — release is the one gate that lets a piece join the body. */
function useStagedHidden(id: KitComponentId): boolean {
  const rel = useGen((s) => s.componentReleases);
  // a clone gates on its BASE — a copy of a staged piece leaks the piece
  return !kitVisible(baseOf(id), rel, false);
}

/** One specced piece: live art + a caption rail with edit, sizes and export. */
function Piece(p: PieceOpts & { caption: string; ambient?: boolean; bay?: boolean }) {
  // gate as a wrapper so the locked and live variants keep separate hook trees
  const tier = useGen((s) => s.tier);
  const stagedHidden = useStagedHidden(p.id);
  // the bay is the ONE place a staged piece renders — its cards opt out of
  // the gate that keeps staged pieces off every public surface
  if (stagedHidden && !p.bay) return null;
  if (tier === "guest" && !GUEST_KIT.has(baseOf(p.id))) return <LockedPiece caption={p.caption} />;
  return <PieceInner {...p} />;
}
function PieceInner(p: PieceOpts & { caption: string; ambient?: boolean }) {
  const { cfg, locked, pinned, size, name, kit, onEdit } = usePiece(p);
  const tier2 = useGen((s) => s.tier);
  const vectorOk = canExport(tier2, "svg");
  const shineOn = useGen((s) => s.shine);
  // the global toggle now rides the clipped SVG band (masked to the face),
  // not the old card overlay
  const shine = shineOn || !!p.shine;
  const shineVars = useShineVars(shine);
  return (
    <figure className="kp-piece" style={shineVars} data-kp={p.id}>
      <LiveArt cfg={cfg} playing stillLoops scale={p.scale ?? PIECE_SCALE} className="kp-live"
        kit={kit} title={p.caption} ambient={p.ambient} shine={shine} />
      <figcaption className="kp-cap">
        {locked && <Lock className="kp-lockic" size={11} strokeWidth={2.4} aria-label="Locked — finished" />}
        {!locked && pinned && <Pin className="kp-lockic" size={11} strokeWidth={2.4} aria-label="Pinned to its own look" />}
        <span>{p.caption}</span>
        <button className="kp-edit" title={`Edit ${name} in the editor`} aria-label={`Edit ${name}`}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <SquarePen size={13} strokeWidth={2.2} /> Edit
        </button>
        <button className="kp-dl" title={vectorOk ? `Export ${p.caption} SVG` : `SVG export is a Pro format. ${UPGRADE_LINES[tier2]}`} aria-label={`Export ${p.caption} SVG`}
          onClick={(e) => {
            e.stopPropagation();
            if (!vectorOk) { openGate("export"); return; }
            const { cfg: c, kitShapes: ks, kitDesigns: kd, kitTextOy: ko, kitTextOx: kx, kitTextFill: kf, kitSlotVals: kv, kitVals: kval } = useGen.getState();
            const variant = p.caption.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            // a clone exports through its base component wearing the
            // clone-keyed reads; the file is named after the caption —
            // which IS the clone's name on a clone card
            downloadSvg(
              renderKit(applyKitTextFill(applyKitDesign(c, kd[p.id]), kf[p.id]), baseOf(p.id), size, p.baseState ?? "default", kval[p.id] ?? p.value, ks[p.id],
                { label: p.label, segments: p.segments, icon: p.icon, expand: true, textOy: ko[`${p.id}:${size}`], textOx: kx[`${p.id}:${size}`], slots: kv[p.id], themedText: !!kd[p.id]?.type || !!kf[p.id] }),
              `kit-${variant}-${size}.svg`
            );
          }}>
          <Download size={12} strokeWidth={2.2} />
        </button>
      </figcaption>
    </figure>
  );
}

/** A piece inside a pattern or assembly mock — no caption rail, tighter scale.
 *  Compositions show the REAL kit to every tier: the screens are the
 *  brochure, and lock cards inside them read as wreckage (owner, logged-out
 *  Safari FTUE). The sell stays where the value is — grid teasers, exports,
 *  the editor. */
function PPiece(p: PieceOpts & { ambient?: boolean }) {
  const stagedHidden = useStagedHidden(p.id);
  if (stagedHidden) return null;
  return <PPieceInner {...p} />;
}
function PPieceInner(p: PieceOpts & { ambient?: boolean }) {
  const { cfg, name, kit } = usePiece({ ...p, size: p.size ?? "m" });
  const shineVars = useShineVars(!!p.shine);
  return (
    <LiveArt cfg={cfg} playing scale={p.scale ?? PATTERN_SCALE} className="gp-piece" style={shineVars}
      kit={kit} title={name} ambient={p.ambient} trim={p.trim} tight={p.tight} snug={p.flat} shine={p.shine} />
  );
}

/** A piece on a screen-pattern stage — same live plumbing, but the invisible
 *  render canvas is trimmed away so pieces stack at interface rhythm. */
function SPiece(p: PieceOpts & { ambient?: boolean }) {
  const stagedHidden = useStagedHidden(p.id);
  if (stagedHidden) return null;
  return <SPieceInner {...p} />;
}
function SPieceInner(p: PieceOpts & { ambient?: boolean }) {
  return <PPiece {...p} trim={p.trim ?? true} />;
}

/** v55: simple wireframe line drawings for complex screens — the character
 *  stand and item render an inventory needs to read as a real scene. Pure
 *  theme-tinted outlines, never real game art; strokes restyle with the kit. */
function WireArt({ kind, stroke, className }: { kind: "hero" | "gem"; stroke: string; className?: string }) {
  const cls = `sc-wire${className ? " " + className : ""}`;
  if (kind === "gem") {
    return (
      <svg className={cls} viewBox="0 0 84 74" role="img" aria-label="item wireframe" data-wire="gem">
        <g fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
          <path d="M14 26 L28 10 H56 L70 26 L42 64 Z" />
          <path d="M14 26 H70 M28 10 L34 26 L42 64 L50 26 L56 10 M34 26 H50" opacity="0.62" />
          <path d="M75 12 v10 M70 17 h10" opacity="0.55" />
        </g>
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 120 214" role="img" aria-label="character wireframe" data-wire="hero">
      <g fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <circle cx="60" cy="24" r="14" />
        <path d="M60 40 V50" />
        <path d="M34 58 Q60 46 86 58" />
        <path d="M34 58 L30 84 L36 112 Q60 122 84 112 L90 84 L86 58" />
        <path d="M36 78 Q60 88 84 78" strokeDasharray="4 5" opacity="0.55" />
        <path d="M40 108 Q60 116 80 108" strokeDasharray="4 5" opacity="0.55" />
        <path d="M34 60 L18 92 L20 124 M86 60 L102 92 L100 124" />
        <circle cx="20" cy="131" r="5" />
        <circle cx="100" cy="131" r="5" />
        <path d="M46 120 L42 168 L40 196 M74 120 L78 168 L80 196" />
        <path d="M40 196 L28 202 M80 196 L92 202" />
        <ellipse cx="60" cy="206" rx="36" ry="6" strokeDasharray="5 6" opacity="0.5" />
      </g>
    </svg>
  );
}

/* ── v56: Inventory screen — strict three-column page grid ─────────
   Rebuilt to the layout spec: header toolbar, character panel with six
   connected equipment slots, a DOMINANT central inventory grid, item
   details, quick-slots footer. All primary panels are CSS grid — no
   absolute positioning; tiles are ONE reusable component with rarity
   variants; data lives in arrays. The kit's own pieces keep supplying
   chips, tabs, bars and buttons, so the aesthetic is unchanged. */
type InvRarity = "common" | "rare" | "epic" | "legendary";
interface InvItem { name: string; icon: IconDef; qty?: number; rarity: InvRarity; type: string; equipped?: boolean; locked?: boolean; desc?: string }
const INV_ITEMS: (InvItem | null)[] = [
  { name: "Eclipse Gem", icon: STOCK_ICONS.gem, qty: 28, rarity: "epic", type: "Gem", desc: "A radiant gem pulsing with dark energy. Harnesses the power of the eclipse." },
  { name: "Falcon Blade", icon: STOCK_ICONS.sword, rarity: "legendary", type: "Weapon", equipped: true, desc: "Forged for the vanguard — swift as its namesake." },
  { name: "Aegis Plate", icon: STOCK_ICONS.shield, rarity: "rare", type: "Armor", desc: "Layered plate that shrugs off glancing blows." },
  { name: "Stride Boots", icon: STOCK_ICONS.boots, rarity: "rare", type: "Armor", desc: "Every step lands a little further than it should." },
  { name: "Signet Ring", icon: STOCK_ICONS.key, rarity: "epic", type: "Accessory", desc: "Opens doors — some of them literal." },
  { name: "Warm Pendant", icon: STOCK_ICONS.heart, qty: 14, rarity: "rare", type: "Accessory", desc: "Slow, steady mending while worn." },
  { name: "Hex Sigil", icon: STOCK_ICONS.star, qty: 12, rarity: "epic", type: "Rune", desc: "A sigil humming with borrowed starlight." },
  { name: "Field Satchel", icon: STOCK_ICONS.bag, qty: 2, rarity: "common", type: "Container", desc: "Plain, roomy, dependable." },
  { name: "Victory Cup", icon: STOCK_ICONS.trophy, rarity: "legendary", type: "Trophy", desc: "Proof it happened." },
  { name: "Old Scroll", icon: STOCK_ICONS.scroll, qty: 6, rarity: "common", type: "Scroll", desc: "The ink has faded; the promise hasn't." },
  { name: "Field Tonic", icon: STOCK_ICONS.flask, qty: 18, rarity: "common", type: "Consumable", desc: "Bitter. Works." },
  { name: "Ember Shard", icon: STOCK_ICONS.gem, qty: 34, rarity: "rare", type: "Material", desc: "Still warm from the forge." },
  { name: "Frost Shard", icon: STOCK_ICONS.gem, qty: 9, rarity: "rare", type: "Material", desc: "Never melts. Never warms." },
  { name: "Woven Tunic", icon: STOCK_ICONS.shirt, rarity: "common", type: "Armor", desc: "Homespun, but it fits." },
  { name: "Grip Wraps", icon: STOCK_ICONS.hand, rarity: "common", type: "Armor", desc: "For hands that work." },
  { name: "Storm Rune", icon: STOCK_ICONS.zap, qty: 5, rarity: "epic", type: "Rune", locked: true, desc: "Crackles when rain is coming." },
  null, null, null, null,
];
const INV_EQUIP_L = [
  { label: "HELMET", icon: STOCK_ICONS.helmet },
  { label: "WEAPON", icon: STOCK_ICONS.sword },
  { label: "ACCESSORY", icon: STOCK_ICONS.key },
];
const INV_EQUIP_R = [
  { label: "CHEST", icon: STOCK_ICONS.shirt },
  { label: "GLOVES", icon: STOCK_ICONS.hand },
  { label: "BOOTS", icon: STOCK_ICONS.boots },
];
const INV_CORE: [string, string][] = [["ATTACK", "1,250"], ["DEFENSE", "980"], ["CRIT RATE", "24.5%"], ["HP", "2,840"]];
const INV_STATS: [string, number, string][] = [["ATTACK", 0.85, "+120"], ["CRIT", 0.55, "+85"], ["SPEED", 0.4, "+65"], ["LIFESTEAL", 0.3, "+5%"]];

/** Flat glyph in the current ink — the tile icon language. */
function InvIcon({ def, size = 24 }: { def: IconDef; size?: number }) {
  const stroke = def.mode === "stroke";
  return (
    <svg width={size} height={size} viewBox={def.viewBox} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<g fill="${stroke ? "none" : "currentColor"}" stroke="${stroke ? "currentColor" : "none"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${def.inner}</g>` }} />
  );
}

/** ONE tile component for every slot — rarity, quantity, selection and
 *  status flags are variants, never bespoke markup. */
function InvSlot({ item, selected, onSelect, small }: { item: InvItem | null; selected?: boolean; onSelect?: () => void; small?: boolean }) {
  if (!item) return <div className={`inv2-slot empty${small ? " sm" : ""}`} aria-hidden="true" />;
  return (
    <button className={`inv2-slot r-${item.rarity}${selected ? " sel" : ""}${small ? " sm" : ""}`} title={item.name} onClick={onSelect}>
      <InvIcon def={item.icon} size={small ? 20 : 26} />
      {item.qty !== undefined && item.qty > 1 && <i className="inv2-qty">{item.qty}</i>}
      {item.equipped && <i className="inv2-flag"><InvIcon def={STOCK_ICONS.check} size={9} /></i>}
      {item.locked && <i className="inv2-flag lock"><InvIcon def={STOCK_ICONS.lock} size={8} /></i>}
    </button>
  );
}

function InventoryScreen() {
  const cfg = useGen((s) => s.cfg);
  const dark = isDarkBg(cfg.canvas);
  const acc = cfg.effects.Glow ?? "#8FF0FF";
  const wire = dark ? acc : hexMix(cfg.effects.Bevel ?? "#0E9CC9", "#0A0C14", 0.3);
  const [sel, setSel] = useState(0);
  const item = INV_ITEMS[sel] ?? (INV_ITEMS[0] as InvItem);
  return (
    <div className="inv2" style={{ "--inv-acc": acc } as React.CSSProperties}>
      <div className="inv2-toolbar">
        <SPiece id="chip" label="INVENTORY" icon={STOCK_ICONS.bag} scale={0.34} />
        <SPiece id="resource" label="1,250" icon={STOCK_ICONS.gem} scale={0.28} />
        <SPiece id="resource" label="24,580" icon={STOCK_ICONS.star} scale={0.28} />
        <span className="sc-spring" />
        <SPiece id="iconbtn" icon={STOCK_ICONS.gear} scale={0.24} />
        <SPiece id="iconbtn" icon={STOCK_ICONS.close} scale={0.24} />
      </div>
      <div className="inv2-main">
        <section className="inv2-panel inv2-char">
          <span className="inv2-plabel">Character</span>
          <div className="inv2-charhead"><b>SHADOW KNIGHT</b><span>LV 42</span></div>
          <div className="inv2-equip">
            <div className="inv2-eqcol left">
              {INV_EQUIP_L.map((e) => (
                <div className="inv2-eq" key={e.label}>
                  <span>{e.label}</span>
                  <div className="inv2-slot eq"><InvIcon def={e.icon} size={20} /><i className="inv2-conn" aria-hidden="true" /></div>
                </div>
              ))}
            </div>
            <div className="inv2-figure"><WireArt kind="hero" stroke={wire} className="inv2-hero" /></div>
            <div className="inv2-eqcol right">
              {INV_EQUIP_R.map((e) => (
                <div className="inv2-eq" key={e.label}>
                  <span>{e.label}</span>
                  <div className="inv2-slot eq"><InvIcon def={e.icon} size={20} /><i className="inv2-conn" aria-hidden="true" /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="inv2-stats">
            <span className="inv2-plabel">Core stats</span>
            {INV_CORE.map(([l, v]) => <div className="inv2-statline" key={l}><span>{l}</span><b>{v}</b></div>)}
          </div>
          <div className="inv2-charbtn"><SPiece id="small" label="STATS" scale={0.34} /></div>
        </section>
        <section className="inv2-panel inv2-inv">
          <span className="inv2-plabel">Inventory</span>
          <div className="inv2-tabs">
            <SPiece id="tab" label="GEAR" baseState="pressed" scale={0.28} />
            <SPiece id="tab" label="ITEMS" scale={0.28} />
            <SPiece id="tab" label="RUNES" scale={0.28} />
            <SPiece id="tab" label="MATERIALS" scale={0.28} />
          </div>
          <div className="inv2-controls">
            <div className="inv2-ctl">ALL <InvIcon def={STOCK_ICONS.chevron} size={12} /></div>
            <div className="inv2-ctl inv2-ctlbtn"><InvIcon def={STOCK_ICONS.gear} size={13} /></div>
            <div className="inv2-ctl inv2-search"><InvIcon def={STOCK_ICONS.search} size={12} /> Search items…</div>
            <div className="inv2-ctl">SORT: NEWEST <InvIcon def={STOCK_ICONS.chevron} size={12} /></div>
          </div>
          <div className="inv2-grid">
            {INV_ITEMS.map((it, i) => <InvSlot key={i} item={it} selected={i === sel} onSelect={() => setSel(i)} />)}
          </div>
          <div className="inv2-cap">
            <span className="inv2-plabel">Capacity</span>
            <SPiece id="progress" value={0.68} scale={0.3} />
            <b>82 / 120</b>
          </div>
        </section>
        <section className="inv2-panel inv2-detail">
          <span className="inv2-plabel">Item details</span>
          <div className="inv2-item">
            <div className="inv2-itemart">
              {item.name === "Eclipse Gem"
                ? <WireArt kind="gem" stroke={wire} className="inv2-gem" />
                : <InvIcon def={item.icon} size={56} />}
            </div>
            <div className="inv2-itemtext">
              <b>{item.name.toUpperCase()}</b>
              <span className={`inv2-rarity r-${item.rarity}`}>{item.rarity.toUpperCase()} · {item.type.toUpperCase()}</span>
              <p>{item.desc}</p>
            </div>
          </div>
          <div className="inv2-istats">
            {INV_STATS.map(([l, v, d]) => (
              <div className="inv2-istat" key={l}><span>{l}</span><SPiece id="progress" value={v} scale={0.22} /><b>{d}</b></div>
            ))}
          </div>
          <div className="inv2-meta">
            <span>VALUE</span><b><InvIcon def={STOCK_ICONS.gem} size={11} /> 650</b>
            <span>TYPE</span><b>{item.type}</b>
          </div>
          <div className="inv2-actions">
            <SPiece id="primary" label="EQUIP" size="s" scale={0.52} />
            <SPiece id="secondary" label="DISMANTLE" size="s" scale={0.44} />
          </div>
          <div className="inv2-actions2">
            <SPiece id="ghost" label="Compare" size="s" scale={0.34} />
            <SPiece id="ghost" label="Lock" size="s" scale={0.34} />
          </div>
        </section>
      </div>
      <div className="inv2-foot">
        <SPiece id="chip" label="QUICK SLOTS" icon={null} tone="alt" scale={0.3} />
        <InvSlot small item={{ name: "Warm Pendant", icon: STOCK_ICONS.heart, qty: 12, rarity: "rare", type: "Accessory" }} />
        <InvSlot small item={{ name: "Eclipse Gem", icon: STOCK_ICONS.gem, qty: 28, rarity: "epic", type: "Gem" }} />
        <InvSlot small item={{ name: "Hex Sigil", icon: STOCK_ICONS.star, rarity: "epic", type: "Rune" }} />
        <InvSlot small item={{ name: "Storm Rune", icon: STOCK_ICONS.zap, qty: 5, rarity: "epic", type: "Rune" }} />
        <div className="inv2-help">
          <InvIcon def={STOCK_ICONS.info} size={15} />
          <p>Drag items to equip.<br />Right-click for more options.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Playable Match-3 (owner: "show/fake the match 3 working… bonus points
   for it actually being interactive") ────────────────────────────────────
   Five categories, each tile wearing a color overlay for its lane; tapping
   a connected group of 3+ fires the claim celebration — the same white-hot
   ignition + particle burst the CLAIM pieces use — then survivors drop and
   fresh tiles fall in from above. Cleared tiles pay the gem counter, fill
   the level bar and bump the LEVEL chip. Left alone, the board plays a
   move itself on a lazy beat so the card demos the loop hands-off; the
   colors are the demo's own — this stage isn't an editable surface. */
const M3N = 5;
const M3CATS = [
  { icon: "heart", c: "#FF5C8A" }, // hearts · rose candy
  { icon: "gem", c: "#59C2FF" },   // gems · glacier blue
  { icon: "star", c: "#FFC94D" },  // stars · arcade gold
  { icon: "bag", c: "#69D96B" },   // bags · slime green
  { icon: "zap", c: "#B98CFF" },   // bolts · hex violet
] as const;
/* a hand-set opening board: all five lanes on stage, one juicy heart trio
   mid-board inviting the first tap */
const M3START = [
  1, 0, 2, 4, 3,
  2, 0, 1, 3, 4,
  0, 0, 3, 1, 2,
  3, 4, 2, 0, 1,
  4, 2, 1, 3, 0,
];

/** Connected same-category tiles (4-neighborhood flood) around `at`. */
function m3Group(cats: number[], at: number): number[] {
  const want = cats[at];
  const seen = new Set<number>([at]);
  const stack = [at];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / M3N), c = i % M3N;
    for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const j = nr * M3N + nc;
      if (nr < 0 || nr >= M3N || nc < 0 || nc >= M3N || seen.has(j) || cats[j] !== want) continue;
      seen.add(j); stack.push(j);
    }
  }
  return [...seen];
}

type M3Fx = { kind: "burst" | "drop" | "nope"; drop?: number; wave: number };

function Match3Board({ onScore }: { onScore: (cleared: number) => void }) {
  const glowC = useGen((s) => s.cfg.effects.Glow ?? "#8FF0FF");
  /* the tiles ARE the kit's own squares, tinted per lane (owner: "I thought
     you were just going to tint our existing squares") — the flat slot
     piece bakes once per look and rides as each cell's background, with the
     lane color blended over it. Rendered flat + tight-cropped to the shell,
     so the glow reserve never enters the board's box math. */
  const { cfg: m3cfg, kitDesigns: m3kd, kitTextFill: m3tf, kitShapes: m3sh } = useGen();
  const tileUrl = useMemo(() => {
    const c = flatPiece(applyKitTextFill(applyKitDesign(m3cfg, m3kd.slot), m3tf.slot), true);
    const svg = renderKit(c, "slot", "s", "default", undefined, m3sh.slot, { icon: null, label: "", overlay: "empty" });
    const m = /data-shell="([-\d. ]+)"/.exec(svg);
    if (!m) return null;
    const [sx, sy, sw, sh] = m[1].split(" ").map(Number);
    const pad = 2;
    const cropped = svg
      .replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${(sw + pad * 2).toFixed(0)}" height="${(sh + pad * 2).toFixed(0)}"`)
      .replace(/viewBox="[^"]*"/, `viewBox="${(sx - pad).toFixed(1)} ${(sy - pad).toFixed(1)} ${(sw + pad * 2).toFixed(1)} ${(sh + pad * 2).toFixed(1)}"`);
    return `url("data:image/svg+xml,${encodeURIComponent(cropped)}")`;
  }, [m3cfg, m3kd, m3tf, m3sh]);
  const [cats, setCats] = useState<number[]>(M3START);
  const [fx, setFx] = useState<Record<number, M3Fx>>({});
  const busy = useRef(false);
  const lastTouch = useRef(0);
  const board = useRef<HTMLDivElement>(null);
  const inView = useRef(false);
  // the auto-play interval lives outside React's render clock — refs keep it honest
  const catsRef = useRef(cats); catsRef.current = cats;
  const clearRef = useRef<(at: number) => void>(() => {});

  const clear = (at: number) => {
    if (busy.current) return;
    const group = m3Group(catsRef.current, at);
    if (group.length < 3) {
      // a lone tap wiggles "no" — the board teaches by refusing politely
      setFx((f) => ({ ...f, [at]: { kind: "nope", wave: Date.now() } }));
      return;
    }
    busy.current = true;
    const wave = Date.now();
    setFx((f) => ({ ...f, ...Object.fromEntries(group.map((i) => [i, { kind: "burst", wave }])) }));
    window.setTimeout(() => {
      /* gravity: per column, survivors slide down into the cleared wells,
         fresh tiles enter from above — every mover falls its own distance */
      const prev = catsRef.current;
      const next = prev.slice();
      const nfx: Record<number, M3Fx> = {};
      const gone = new Set(group);
      for (let c = 0; c < M3N; c++) {
        let write = M3N - 1;
        for (let r = M3N - 1; r >= 0; r--) {
          const i = r * M3N + c;
          if (gone.has(i)) continue;
          const j = write * M3N + c;
          next[j] = prev[i];
          if (write !== r) nfx[j] = { kind: "drop", drop: write - r, wave };
          write--;
        }
        const entered = write + 1;
        for (let r = write; r >= 0; r--) {
          next[r * M3N + c] = Math.floor(Math.random() * M3CATS.length);
          nfx[r * M3N + c] = { kind: "drop", drop: entered, wave };
        }
      }
      setCats(next);
      // merge, don't replace: untouched cells keep their keys (no remount churn)
      setFx((f) => ({ ...f, ...nfx }));
      onScore(group.length);
      window.setTimeout(() => { busy.current = false; }, 430);
    }, 460);
  };
  clearRef.current = clear;

  useEffect(() => {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = board.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { inView.current = es.some((e) => e.isIntersecting); }, { rootMargin: "80px" });
    io.observe(el);
    const t = window.setInterval(() => {
      // self-demo only while visible, settled, and the user isn't mid-session
      if (!inView.current || busy.current || Date.now() - lastTouch.current < 6500) return;
      const done = new Set<number>();
      const groups: number[][] = [];
      for (let i = 0; i < M3N * M3N; i++) {
        if (done.has(i)) continue;
        const g = m3Group(catsRef.current, i);
        g.forEach((x) => done.add(x));
        if (g.length >= 3) groups.push(g);
      }
      if (groups.length) clearRef.current(groups[Math.floor(Math.random() * groups.length)][0]);
    }, 3400);
    return () => { io.disconnect(); window.clearInterval(t); };
  }, []);

  /* Tiles are the board's OWN candy — the InvSlot precedent: screen
     patterns may draw their tile language directly (the kit's real pieces
     still frame the stage). A live slot piece reserves its glow pad on the
     canvas, which makes it structurally wrong for butted grid cells. */
  return (
    <div className="m3-wrap" ref={board}>
      {cats.map((catIdx, i) => {
        const cat = M3CATS[catIdx];
        const f = fx[i];
        return (
          /* the wave in the key remounts only cells the wave touched,
             restarting their one-shot animations */
          <button key={`${i}:${f?.wave ?? 0}:${f?.kind ?? "s"}`} type="button"
            className={`m3-cell${f?.kind === "burst" ? " m3-burst fx-igniting" : f?.kind === "drop" ? " m3-drop" : f?.kind === "nope" ? " m3-nope" : ""}`}
            style={{ "--m3c": cat.c, "--m3drop": f?.kind === "drop" ? f.drop : 0 } as React.CSSProperties}
            aria-label={`${cat.icon} tile — tap a group of three or more`}
            onPointerUp={() => { lastTouch.current = Date.now(); clear(i); }}>
            <span className={`m3-tile${tileUrl ? " m3-kittile" : ""}`} style={tileUrl ? ({ backgroundImage: tileUrl } as React.CSSProperties) : undefined}>
              {tileUrl && <i className="m3-lane" aria-hidden="true" />}
              <InvIcon def={STOCK_ICONS[cat.icon]} size={26} />
            </span>
            {f?.kind === "burst" && (
              <span className="fx-burstwrap" aria-hidden="true">
                {Array.from({ length: 12 }, (_, p) => {
                  const a = (p / 12) * Math.PI * 2 + (p % 3) * 0.4;
                  const d = 34 + ((p * 29) % 40);
                  const s = 4 + ((p * 11) % 6);
                  const col = p % 3 === 0 ? "#FFFFFF" : p % 3 === 1 ? cat.c : glowC;
                  return <i key={p} style={{ "--dx": `${(Math.cos(a) * d).toFixed(0)}px`, "--dy": `${(Math.sin(a) * d).toFixed(0)}px`, width: s, height: s, background: col } as React.CSSProperties} />;
                })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One screen-pattern specimen: identification above the viewport, the dark
 *  stage as the actual screen, quiet system metadata below. The viewport's
 *  aspect ratio is fixed and every nested piece reserves its largest state,
 *  so no interaction inside can move the card, the grid or the page. */
function Pat({ n, name, cat, comps, asms, lead, wide, bare, children }: {
  n: string; name: string; cat: string; comps: number; asms: number;
  lead: KitComponentId; wide?: boolean; bare?: boolean; children: React.ReactNode;
}) {
  /* v57: the open/edit entry points are parked — patterns are reference
     compositions for now, so the header stays quiet. `lead` is kept in the
     signature for when editing returns. */
  void lead;
  /* fit-to-stage: the compositions are approximate and some run taller than
     the fixed viewport — the centered stage then clips BOTH ends (owner:
     "couple of these patterns are getting cut off", edge pieces' halos
     shorn). Measure and scale the stage to fit, with extra air when the kit
     carries halos so glow completes inside the frame. */
  const glowy = useGen((s) =>
    Object.values(s.cfg.states).some((st) => st.glow > 0.5) || s.cfg.type.glow.on ||
    s.cfg.candy.extrusion.glow > 5 || (s.cfg.candy.innerGlow?.opacity ?? 0) > 5);
  const viewRef = useRef<HTMLDivElement>(null);
  const scRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = viewRef.current, sc = scRef.current;
    if (!view || !sc) return;
    const air = glowy ? 76 : 14;
    const fit = () => {
      sc.style.transform = "";
      const k = Math.min(1, (view.clientHeight - air) / Math.max(1, sc.getBoundingClientRect().height));
      if (k < 0.995) sc.style.transform = `scale(${k.toFixed(3)})`;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(view); ro.observe(sc);
    fit();
    return () => ro.disconnect();
  }, [glowy]);
  return (
    <article className={`pat${wide ? " pat-wide" : ""}`}>
      <header className="pat-head">
        <span className="pat-num">{n}</span>
        <h4 className="pat-name">{name}</h4>
        <span className="pat-cat">{cat}</span>
      </header>
      <div className={`pat-view${bare ? " pat-bare" : ""}`} ref={viewRef}><div className="sc" ref={scRef}>{children}</div></div>
      <footer className="pat-foot">
        <span>{comps} registered components</span>
        <span>{asms} {asms === 1 ? "assembly" : "assemblies"}</span>
        <span>Fully editable</span>
      </footer>
    </article>
  );
}

/** Shared template for terminal states — icon, title, one-line explanation,
 *  primary recovery, secondary escape. Empty and Error are the same system. */
/** One full-screen layout starter — a device-true stage the user can delete.
 *  These are idea starters, not rules; every piece stays live and editable. */
function LayoutCard({ id, name, device, onHide, children }: {
  id: string; name: string; device: "Desktop 16:9" | "Mobile landscape" | "Mobile portrait";
  onHide: (id: string) => void; children: React.ReactNode;
}) {
  const cls = device === "Desktop 16:9" ? "desktop" : device === "Mobile landscape" ? "mobile-l" : "mobile-p";
  return (
    <article className={`lay ${cls}`}>
      <header className="pat-head">
        <h4 className="pat-name">{name}</h4>
        <span className="pat-cat">{device}</span>
        <button className="pat-open" onClick={() => onHide(id)} title="Remove this starter from your kit">Remove ×</button>
      </header>
      <div className="lay-view"><div className="lay-stage">{children}</div></div>
    </article>
  );
}

function StateScreen({ icon, title, line, action }: { icon: IconDef; title: string; line: string; action: string }) {
  return (
    <>
      <SPiece id="badge" baseState="pressed" icon={icon} scale={0.34} />
      <SPiece id="tab" label={title} tone="alt" scale={0.36} />
      <span className="sc-caption dim">{line}</span>
      <div className="sc-row sc-push">
        <SPiece id="small" label={action} scale={0.34} />
        <PPiece id="ghost" label="Back" size="s" scale={0.32} />
      </div>
    </>
  );
}

function Sec({ n, title, anchor, note, wide, children }: { n: string; title: string; anchor?: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`kp-sec${wide ? " kp-wide" : ""}`} data-anchor={anchor}>
      <header className="kp-sechead">
        <span className="kp-num">{n}</span>
        <h2>{title}</h2>
        <span className="kp-rule" />
      </header>
      {note && <p className="kp-note">{note}</p>}
      {children}
    </section>
  );
}

/** Chapter divider — a level of the system, visually senior to any section. */
function Chapter({ n, id, label, blurb }: { n: string; id: string; label: string; blurb: string }) {
  return (
    <div className="kp-chapter" id={`chap-${id}`} data-chap={id}>
      <span className="kp-chapnum" aria-hidden="true">{n}</span>
      <div className="kp-chaptext">
        <span className="kp-chapname">{label}</span>
        <span className="kp-chapblurb">{blurb}</span>
      </div>
      <span className="kp-chapline" />
    </div>
  );
}

/** Below-fold chapters mount as the reader approaches. The page used to
 *  build every chapter's hundreds of filtered SVGs before first paint —
 *  Safari's long blank window on the logged-out first visit. Children come
 *  as a THUNK so React never evaluates a dormant chapter's render work.
 *  The Chapter divider above each Deferred stays mounted, so tab anchors
 *  and deep links keep working; the ghost reserves honest scroll room. */
function Deferred({ estH, eager, onLive, children }: { estH: number; eager?: boolean; onLive?: () => void; children: () => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  useEffect(() => { if (eager && !live) setLive(true); }, [eager, live]);
  // fires AFTER the chapter's content commits — the boot curtain sequences
  // the next chapter on it, so the bar ticks on real completions
  const announced = useRef(false);
  useEffect(() => { if (live && !announced.current) { announced.current = true; onLive?.(); } }, [live, onLive]);
  useEffect(() => {
    if (live) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setLive(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLive(true); }, { rootMargin: "1600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [live]);
  return live ? <>{children()}</> : <div ref={ref} className="kp-ghost" style={{ minHeight: estH }} aria-hidden="true" />;
}

/** Small annotation line under a Build Part — plain editorial text, not pills. */
function Meta({ items }: { items: string[] }) {
  return <div className="kp-meta">{items.map((m) => <span key={m}>{m}</span>)}</div>;
}

/** Structured spec rows — the documentation voice for property readouts.
 *  Key/value lines with one shared left edge; pills stay reserved for real
 *  selections and states. */
function SpecList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="kp-spec">
      {rows.map(([k, v]) => (
        <div className="kp-specline" key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/* color readouts — designers hand these to print and engine pipelines */
function rgbOf(hex: string): [number, number, number] {
  const p = parseInt(hex.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}
function cmykOf(hex: string): string {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return "0 0 0 100";
  const f = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100);
  return `${f(r)} ${f(g)} ${f(b)} ${Math.round(k * 100)}`;
}

/* relative luminance + WCAG-ish contrast for the accessibility read */
function lum(hex: string): number {
  const p = parseInt(hex.slice(1), 16);
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((p >> 16) & 255) + 0.7152 * f((p >> 8) & 255) + 0.0722 * f(p & 255);
}
function contrast(a: string, b: string): number {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function assess(cfg: GenConfig): { level: "Strong" | "Fair" | "Risky"; notes: string[] } {
  const T = cfg.type;
  const face = cfg.face.mode === "dark" ? hexMix(cfg.effects.Bevel ?? "#0E9CC9", "#0B0714", 0.72) : (cfg.effects["Inner Fill"] ?? "#2CC5F0");
  const label = T.fillMode === "auto"
    ? (cfg.face.mode === "dark" ? "#EAF6FF" : "#FFFFFF")
    : T.fillMode === "gradient" ? hexMix(T.fill, T.fill2, 0.5) : T.fill;
  const ratio = contrast(label, face);
  const notes: string[] = [];
  let hard = false;
  if (ratio < 3) { hard = true; notes.push(`Label vs. face contrast is about ${ratio.toFixed(1)}:1 — hard to read for a lot of players. A darker face or brighter fill would help.`); }
  else if (ratio < 4.5) notes.push(`Label contrast is around ${ratio.toFixed(1)}:1 — fine for big display text, but small labels may get murky.`);
  if (T.outline.on && ratio < 4.5) notes.push("The outline is doing real legibility work here — keep it on.");
  if (T.glow.on && T.glow.size > 16 && T.glow.opacity > 85) notes.push("That much glow can halo the letterforms at small sizes — consider easing size or opacity.");
  if (T.spacing < -2) notes.push("Tight negative tracking crowds the glyphs — small text will smudge.");
  if ((T.outline.on && T.outline.width < 1)) notes.push("A sub-1px outline tends to disappear on low-DPI screens.");
  if (cfg.candy.pattern.type !== "none" && cfg.candy.pattern.opacity > 60) notes.push("The face pattern is strong enough to compete with the label — lower its opacity for text-heavy pieces.");
  const level = hard ? "Risky" : notes.length > 1 ? "Fair" : "Strong";
  if (!notes.length) notes.push("Contrast, tracking and effects are all comfortable. No warnings.");
  return { level, notes };
}

/** A live piece row shown at several states, tiny captions underneath. */
function StateStrip({ variants }: {
  variants: { cap: string; piece: PieceOpts }[];
}) {
  return (
    <div className="kp-states">
      {variants.map((v) => (
        <figure className="kp-state" key={v.cap}>
          <PPiece {...v.piece} scale={v.piece.scale ?? 0.3} />
          <figcaption>{v.cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** One motion behavior demo — click replays the behavior on a real piece. */
function MotionDemo({ name, cls, piece, purpose, dur, ease }: {
  name: string; cls: string; piece: PieceOpts; purpose: string; dur: string; ease: string;
}) {
  const [tick, setTick] = useState(0);
  return (
    <button className="kp-part kp-mo" title={`Replay ${name}`}
      onPointerUp={() => setTick((t) => t + 1)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTick((t) => t + 1); } }}>
      <span key={tick} className={`kp-mostage ${cls}`}>
        <PPiece {...piece} scale={piece.scale ?? 0.52} shine />
      </span>
      <span className="kp-partname">{name}</span>
      <span className="kp-mopurpose">{purpose}</span>
      <span className="kp-mospec">{dur} · {ease}</span>
    </button>
  );
}

/* jump into the editor with a section opened — Build Parts are editable by
   opening the layer that produces them */
function openEditor(sec: string) {
  useGen.setState((st) => ({ open: { ...st.open, [sec]: true }, phase: "master" }));
  window.setTimeout(() => document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 90);
}

/** The honest list of effects in a design that nine-slice stretching cannot
 *  carry — they're painted for ONE proportion, and the stretched middle
 *  slice distorts them. Slices still scale cleanly without them; components
 *  that need them intact should be rendered per-size from the app. */
export function sliceRisks(c: GenConfig): string[] {
  const cd = c.candy, r: string[] = [];
  if (cd.gloss.on && cd.gloss.curve > 4 && cd.gloss.opacity > 0) r.push("Curved gloss sweep — its arc spans the whole face, so a stretched middle flattens the curve");
  if (cd.pattern.type !== "none" && cd.pattern.opacity > 0) r.push(`${cd.pattern.type.charAt(0).toUpperCase() + cd.pattern.type.slice(1)} pattern — tiles ${cd.pattern.type === "stripes" ? "skew off their angle" : "stretch out of shape"} wherever the middle slice grows`);
  if (cd.specular.on && cd.specular.intensity > 0) r.push("Specular highlight — placed for one proportion; it drifts and smears when the face stretches");
  if (cd.texture.amount > 0) r.push("Surface grain — stretches into visible streaks in the scaling zones");
  return r;
}

/** Banner rendered with its three-slice guides: fixed caps, stretch middle,
 *  text-safe area — computed from the real silhouette metadata. The demo
 *  scales itself into `fit` px so a very wide banner never dominates the
 *  page; the ruler label reports its true shell width. */
function SliceDemo({ cfg, label, size = "m", fit = 520, ruler }: { cfg: GenConfig; label: string; size?: KitSize; fit?: number; ruler?: boolean }) {
  const { kitShapes, kitTextOy, kitTextOx } = useGen();
  const shape = kitShapes.header ?? "banner";
  const met = silhouetteMeta(shape);
  const oy = kitTextOy[`header:${size}`];
  const hx = kitTextOx[`header:${size}`];
  const svg = useMemo(() => renderKit(cfg, "header", size, "default", undefined, kitShapes.header, { label, textOy: oy, textOx: hx }), [cfg, label, size, kitShapes.header, oy, hx]);
  const geo = useMemo(() => {
    const m = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
    if (!m || !met) return null;
    const pad = -+m[1], total = +m[3];
    const h = 158 * ({ s: 0.72, m: 1, l: 1.22 } as const)[size];
    /* the DRAWN shell stamp is the truth — the old fixed-margin assumption
       (52px each side) drifted every guide as soon as the canvas grew
       around effects (owner: "the standard diagram looks off-centered") */
    const shm = /data-shell="([-\d. ]+)"/.exec(svg) ?? /data-shell0="([-\d. ]+)"/.exec(svg);
    const shv = shm?.[1].split(" ").map(Number);
    const shellW = shv && shv.length === 4 ? shv[2] : total - pad * 2 - 104;
    const cap = met.capScale * h, safe = met.content.left * h;
    const x0 = shv && shv.length === 4 ? shv[0] - +m[1] : pad + 52;
    return {
      total, shellW: Math.round(shellW),
      capL: ((x0 + cap) / total) * 100, capR: ((x0 + shellW - cap) / total) * 100,
      safeL: ((x0 + safe) / total) * 100, safeR: ((x0 + shellW - safe) / total) * 100,
    };
  }, [svg, met, size]);
  const scale = geo ? Math.min(0.44, fit / geo.total) : 0.44;
  return (
    <div>
      <div className="kp-slice">
        <Art svg={svg} scale={scale} hug={false} />
        {geo && (
          <>
            <span className="kp-guide cap" style={{ left: `${geo.capL}%` }} />
            <span className="kp-guide cap" style={{ left: `${geo.capR}%` }} />
            <span className="kp-guide safe" style={{ left: `${geo.safeL}%` }} />
            <span className="kp-guide safe" style={{ left: `${geo.safeR}%` }} />
          </>
        )}
      </div>
      {ruler && geo && <div className="kp-ruler">├─ true shell width ≈ {geo.shellW}px · shown at {Math.round(scale * 100)}% ─┤</div>}
    </div>
  );
}

const SPLASHES = ["SWEET VICTORY", "BONUS BURST", "SUGAR RUSH", "LEVEL UP!", "NEW HIGH SCORE", "MISSION COMPLETE", "READY?", "GAME OVER"];

const ICON_SET: { key: string; name: string }[] = [
  { key: "play", name: "Play" }, { key: "pause", name: "Pause" }, { key: "close", name: "Close" },
  { key: "back", name: "Back" }, { key: "forward", name: "Forward" }, { key: "check", name: "Check" },
  { key: "lock", name: "Lock" }, { key: "unlock", name: "Unlock" }, { key: "gear", name: "Settings" },
  { key: "user", name: "User" }, { key: "bag", name: "Store" }, { key: "volume", name: "Volume" },
  { key: "volumeOff", name: "Muted" }, { key: "info", name: "Info" }, { key: "warning", name: "Warning" },
  { key: "refresh", name: "Refresh" }, { key: "home", name: "Home" }, { key: "search", name: "Search" },
];


/** v67 · connector pattern: the theme's face pattern as a tiny data-URI tile
 *  so DIMENSIONAL CONNECTORS (reward-track rail, waypoint tubes) carry the
 *  same wrap as the components they join. */
function patternTileUrl(cfg: GenConfig): string {
  const PT = cfg.candy.pattern;
  if (!PT || PT.type === "none" || PT.opacity < 2) return "none";
  const c = encodeURIComponent(PT.color ?? "#FFFFFF");
  const o = Math.min(0.5, PT.opacity / 180).toFixed(2);
  const s = Math.max(6, Math.round(6 + PT.scale * 0.06));
  let inner = "";
  if (PT.type === "stripes") inner = `<rect width='${s / 2}' height='${s}' fill='${c}' opacity='${o}'/>`;
  else if (PT.type === "dots" || PT.type === "halftone") inner = `<circle cx='${s / 2}' cy='${s / 2}' r='${s * 0.22}' fill='${c}' opacity='${o}'/>`;
  else if (PT.type === "checker") inner = `<rect width='${s / 2}' height='${s / 2}' fill='${c}' opacity='${o}'/><rect x='${s / 2}' y='${s / 2}' width='${s / 2}' height='${s / 2}' fill='${c}' opacity='${o}'/>`;
  else inner = `<circle cx='${s / 2}' cy='${s / 2}' r='${s * 0.18}' fill='${c}' opacity='${o}'/>`;
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'>`)}${inner.replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}${encodeURIComponent("</svg>")}")`;
}

/* ?kitdebug — a field-diagnosis strip for browsers we can't run ourselves
   (Safari): collects window errors, unhandled rejections and the hero's
   texture status into a visible card, so an owner screenshot carries the
   actual failure instead of a black void. Renders NOTHING without the
   flag in the URL. */
function KitDebugStrip() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!/kitdebug/.test(window.location.search + window.location.hash)) return;
    const push = (m: string) => setLines((l) => [...l.slice(-7), m]);
    const onErr = (e: ErrorEvent) => push(`err: ${e.message} @ ${(e.filename ?? "").split("/").pop()}:${e.lineno}`);
    const onRej = (e: PromiseRejectionEvent) => push(`rejection: ${String(e.reason).slice(0, 200)}`);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    push(`kitdebug · dpr=${window.devicePixelRatio} · ${navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome") ? "safari" : "other"}`);
    const t = window.setTimeout(() => {
      const w = window as unknown as { __heroTex?: string };
      push(`hero: gl=${document.querySelector('[data-gl="on"]') ? "on" : "OFF"} tex=${w.__heroTex ?? "NEVER LOADED"}`);
    }, 5000);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); window.clearTimeout(t); };
  }, []);
  if (!lines.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 10, left: 10, zIndex: 999, maxWidth: 560, background: "rgba(60,10,10,.94)", color: "#ffd9a8", font: "11px/1.5 monospace", padding: "10px 12px", borderRadius: 10, whiteSpace: "pre-wrap", pointerEvents: "none" }}>
      {lines.join("\n")}
    </div>
  );
}

export function KitPage() {
  const { cfg, kitClones, kitDesigns, kitTextFill, setPhase, kitName, setKitName, saveUserPreset, updateMaster, viewer, isAdmin, componentReleases: releases, setComponentRelease } = useGen();
  // the staging bay opens by hand only — it must never pop up mid-demo
  // (owner: "when I'm showing off the site, I don't want that stuff to
  // immediately pop up"), so collapsed is the default every load
  const [bayOpen, setBayOpen] = useState(false);
  // injected showcase strips (screen patterns, collage, playground) are
  // design surfaces — their SMIL loops hold the settled frame too
  useEffect(() => {
    document.querySelectorAll(".gp-piece").forEach((el) => stillSmil(el, true));
  });
  const focusRet = useGen((s) => s.focus);
  const dark = isDarkBg(cfg.canvas);
  const preset = PRESETS.find((p) => p.id === cfg.presetId);
  const sil = SHAPES.find((s) => s.id === cfg.shape)?.name.split(" — ")[0] ?? "Custom";
  const roles = EFFECT_ROLES.filter((r) => cfg.effects[r] !== undefined);
  /* the inner glow's CUSTOM color is a real material voice with no effects
     role behind it — chart it beside the roles wherever chips show (owner:
     "this green color isn't showing up in the 3d or the color swatches...
     let's add it everywhere we display color chips"). When the well follows
     the Color map it IS the Glow role, already charted. */
  const innerGlowChip = cfg.candy.innerGlow.opacity > 0 && cfg.candy.innerGlow.color ? cfg.candy.innerGlow.color : null;
  const label = cfg.content.label || "PLAY";
  const T = cfg.type;
  const caps = fontByName(T.font).caps;
  const typeFx = [
    T.outline.on && "Outline", T.shadow.on && "Shadow",
    T.emboss.on && (T.emboss.strength < 0 ? "Deboss" : "Emboss"), T.glow.on && "Glow",
    T.stripes?.on && "Stripes", T.glints?.on && "Glints",
  ].filter(Boolean) as string[];
  const caseName = { none: "As typed", upper: "Uppercase", lower: "Lowercase", title: "Title Case" }[T.case];

  // the live display test — a real editable instance of the display-text component
  const [splash, setSplash] = useState("SWEET VICTORY");
  const [splashHi, setSplashHi] = useState("VICTORY");
  const [treatOn, setTreatOn] = useState(true);
  /* Highlight intensity drags from LOCAL state and commits once on release:
     every store commit re-renders the page's hundreds of live pieces, so
     per-tick commits made the thumb sticky (owner: "takes a long time to
     drag"). The % readout tracks the drag; the specimen updates on release. */
  const [hbLive, setHbLive] = useState<number | null>(null);
  const commitHb = () => {
    if (hbLive == null) return;
    const v = hbLive;
    updateMaster((c) => { c.type.highlightBoost = v; });
    setHbLive(null);
  };
  const typeOff = (c: GenConfig) => {
    c.type.outline.on = false; c.type.shadow.on = false; c.type.emboss.on = false;
    c.type.glow.on = false; c.type.stripes = { on: false, angle: 45, opacity: 30 };
    c.type.glints = { on: false, opacity: 55 }; c.type.highlight = "";
  };
  /* The typography constructions (~100 filtered specimens: alphabets,
     digits, scale ramp, layer/construction sheets) used to compute in the
     FIRST render pass — before even the generating curtain could paint,
     which is why the type section still felt slow behind it. `heavy`
     flips one breath after mount: the same work runs invisibly behind
     the curtain instead of blocking its entrance. */
  const [heavy, setHeavy] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setHeavy(true), 50); return () => window.clearTimeout(t); }, []);

  const splashArt = useMemo(() => !heavy ? "" : tightenV(renderTypeSpecimen(cfg, splash, {
    highlight: treatOn ? splashHi : undefined,
    mutate: (c) => { c.type.size = 84; if (!treatOn) typeOff(c); },
  }), 84, cfg.type.oy ?? 0), [cfg, splash, splashHi, treatOn, heavy]); // eslint-disable-line react-hooks/exhaustive-deps

  // accessibility read — friendly, hidden behind a disclosure
  const [a11yOpen, setA11yOpen] = useState(false);
  const audit = useMemo(() => assess(cfg), [cfg]);
  // objective rewards render as real display-text specimens, not chips
  const xpArts = useMemo(() => new Map((["+250 XP", "+400 XP", "+350 XP", "+300 XP"] as const).map((x) => [x as string, heavy ? renderTypeSpecimen(cfg, x) : ""])), [cfg, heavy]);

  // screen-pattern group filter — restrained text nav, not capsules
  const [patTab, setPatTab] = useState<"all" | "core" | "outcome" | "state">("all");

  // measured rails: reward track + weekly streak lines pass through the
  // visible shell centers, whatever each node's scale and trim margins are
  const trackRailRef = useRef<HTMLDivElement>(null);
  const weekRailRef = useRef<HTMLDivElement>(null);
  const mapRailRef = useRef<HTMLDivElement>(null);
  useShellRail(trackRailRef, ".kp-tnodezone");
  useShellRail(weekRailRef, ".kp-wkday");
  useShellRail(mapRailRef, ".kp-node");

  /* ── the generating curtain ─────────────────────────────────────────
     The kit page is a GENERATOR's output — hundreds of freshly rendered,
     effect-heavy graphics. Rather than let the assembly show (owner:
     "still unacceptable in the professional sense... maybe some kind of
     loading animation — generating kit"), a curtain covers the build:
     chapters force-mount IN ORDER behind it, the bar ticks on REAL
     completions (never theater), and the page reveals whole. Same show
     in every browser; fast machines just see it briefly. */
  /* bootN counts real completions: 1 = foundations painted (the kick),
     then one per deferred chapter as it commits — 5 = the whole book. */
  const BOOT_DONE = 5;
  const [bootN, setBootN] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [curtain, setCurtain] = useState<"on" | "leaving" | "gone">("on");
  const bootT0 = useRef(Date.now());
  useEffect(() => { document.fonts?.ready?.then(() => setFontsReady(true)).catch(() => setFontsReady(true)); }, []);
  // let each chapter's commit PAINT before the next begins — the curtain
  // hides the work, the double-rAF keeps the bar honest and the page alive
  const bootAdvance = () => requestAnimationFrame(() => requestAnimationFrame(() => setBootN((n) => Math.min(BOOT_DONE, n + 1))));
  useEffect(() => { const t = window.setTimeout(bootAdvance, 250); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    if (curtain !== "on") return;
    if (bootN >= BOOT_DONE && fontsReady) {
      // whole page + real glyphs are in — hold a beat so the bar is seen
      // finishing, then fade (min display keeps warm re-entries flickerless)
      const wait = Math.max(420, 900 - (Date.now() - bootT0.current));
      const t = window.setTimeout(() => setCurtain("leaving"), wait);
      return () => window.clearTimeout(t);
    }
    // failsafe: a stalled stage never traps the reader behind the curtain
    const f = window.setTimeout(() => setCurtain("leaving"), 12000);
    return () => window.clearTimeout(f);
  }, [bootN, fontsReady, curtain]);
  useEffect(() => {
    if (curtain !== "leaving") return;
    const t = window.setTimeout(() => setCurtain("gone"), 450);
    return () => window.clearTimeout(t);
  }, [curtain]);
  /* coming back from the editor lands on the piece you were editing, not
     the top of the page (owner: "when I come back to the kit, I'd like to
     come back to THAT spot"). focus IS the last-edited piece. The jump
     waits for the CURTAIN — a fixed beat used to fire before the deferred
     chapters existed, finding nothing — because by the time it starts
     leaving, every chapter is force-mounted: the scroll lands behind the
     fade and the reader arrives already in place. A second pass once the
     curtain is gone corrects any late reflow. */
  const retDone = useRef(false);
  useEffect(() => {
    if (!focusRet || retDone.current || curtain === "on") return;
    document.querySelector(`[data-kp="${focusRet}"]`)?.scrollIntoView({ block: "center" });
    if (curtain === "gone") retDone.current = true;
  }, [curtain, focusRet]);
  const bootProg = (bootN + (fontsReady ? 1 : 0)) / (BOOT_DONE + 1);
  const bootStage = !fontsReady && bootN === 0 ? "Loading typefaces"
    : ["Laying foundations", "Building components", "Assembling build parts", "Composing screens", "Collecting resources", "Polishing"][Math.min(bootN, 5)];

  // hero disclosure + sticky-nav orientation
  const [aboutOpen, setAboutOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [hiddenLays, setHiddenLays] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ui-generator-hiddenlayouts") ?? "[]"); } catch { return []; }
  });
  /* the Match-3 starter's session HUD — cleared tiles pay the gem counter,
     fill the level bar, bump the LEVEL chip and spend a heart per move */
  const [m3Score, setM3Score] = useState(0);
  const [m3Moves, setM3Moves] = useState(0);
  const [m3Prog, setM3Prog] = useState(0.44);
  const [m3Level, setM3Level] = useState(12);
  const hideLay = (id: string) => setHiddenLays((h) => {
    const next = id === "*reset*" ? [] : [...h, id];
    try { localStorage.setItem("ui-generator-hiddenlayouts", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  /* Paid artifacts ask the server first (see exportGate): the client caps
     still decide how the buttons LOOK, but the file itself is only ever
     produced against a grant issued from plan_id in the database. */
  const gateHandlers = {
    onSignIn: () => openAuth("signin"),
    onUpgrade: () => openGate("export"),
    onMessage: (m: string) => window.alert(m),
  };
  /* the packed sheet is a VISUAL CATALOG; engines get atomic assets */
  const [sheetBusy, setSheetBusy] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineProg, setEngineProg] = useState<{ done: number; total: number; label: string } | null>(null);
  /* the Unity briefing — loading-screen cards of real per-kit analysis
     that take the screen while the zip builds (owner). Computed fresh at
     export start, once the server grant settles the scope. */
  const [brief, setBrief] = useState<BriefCard[] | null>(null);
  const [briefHidden, setBriefHidden] = useState(false);
  /* I1, revised: the Unity slug follows the kit's CURRENT name. Same name →
     same slug, so re-exports keep landing in the same Unity folder and
     overwrite in place. A different name means a different kit (or a
     deliberate rename): fresh folder, version restarts at v1. The old
     never-re-mint rule froze the slug per BROWSER — owner field report: a
     brand-new kit exported as "miami nice". The mint lands in the cloud doc
     too, or reopening the project elsewhere resurrects the old identity. */
  const ensureUnitySlug = (name: string): string => {
    const st = useGen.getState();
    const want = sanitizeUnitySlug(name) ?? "ui-kit";
    if (st.unitySlug !== want) {
      st.setUnitySlug(want);
      st.resetUnityKitVer();
      const pid = st.openProjectId;
      if (pid) void (async () => {
        /* patch ONLY the slug fields into the saved doc — a whole-doc
           write from here silently replaced the project's saved boards
           with whatever the workspace held (review catch), and dropped
           the error besides */
        const { doc } = await loadProjectDoc(pid);
        if (!doc) return;
        const st2 = useGen.getState();
        const err = await updateProjectDoc(pid, { ...(doc as Record<string, unknown>), unitySlug: st2.unitySlug, unityKitVer: st2.unityKitVer });
        if (err) console.warn("UI Kit Maker: Unity slug writeback failed —", err);
      })();
    }
    return want;
  };
  const downloadEngineKit = async () => {
    if (engineBusy) return;
    setEngineBusy(true);
    try {
      await guardedExport("engine", gateHandlers, async (grant) => {
        const st = useGen.getState();
        const name = st.kitName ?? `The ${preset?.name ?? "Custom"} Kit`;
        const uslug = ensureUnitySlug(name);
        const kitVersion = st.bumpUnityKitVer();
        /* the payload scope is the SERVER's call, read from plan_id and
           returned in the grant — a client-side tier flip cannot widen it.
           The tier fallback only covers cloud-off local builds, where the
           whole paid layer is inert anyway. */
        const scope = grant.scope ?? (st.tier === "student" || st.tier === "pro" ? "full" as const : "free" as const);
        const fdef2 = fontByName(st.cfg.type.font);
        /* Boards→Scenes rides the FULL scope only — the server's grant is
           the door (a remix never exits the browser on the free tier) */
        /* the briefing plays from here — the scope is settled, the wait
           is about to be real (board collection + every sprite render) */
        try { setBrief(buildUnityBriefing(st, scope)); setBriefHidden(false); } catch { setBrief(null); }
        /* a failed board collection must never kill the export — but it
           must never be SILENT either: without boards the zip ships no
           scenes and no label variants, and that absence looks like an
           importer bug (round-8 investigation) */
        const exBoards = scope === "full" ? await collectExportBoards(st).catch((e) => { console.warn("UI Kit Maker: board collection failed — this export ships WITHOUT board scenes and label variants", e); return undefined; }) : undefined;
        await downloadEngineExport(
          { cfg: st.cfg, kitDesigns: st.kitDesigns, kitTextFill: st.kitTextFill, kitShapes: st.kitShapes, kitSizes: st.kitSizes, kitSlices: st.kitSlices, kitName: name, slug: uslug, kitVersion, scope, boards: exBoards, releases: st.componentReleases,
            // the maker's own words ride into the bones prefabs' live text
            kitLabels: st.kitLabels, kitNoText: st.kitNoText, kitSubs: st.kitSubs, kitVals: st.kitVals, kitSlotVals: st.kitSlotVals },
          scope === "full" ? () => buildSpriteSheetBytes(sheetEntries(st), `${name} — visual catalog`, st.cfg.type.font, fdef2?.css ?? null,
            (d, t) => setEngineProg({ done: d, total: t, label: "catalog" })) : undefined,
          grant.licence,
          (done, total, label) => setEngineProg({ done, total, label }),
          // a fontless zip is a real defect downstream — say it to the maker's face
          (msg) => window.alert(msg),
        );
      });
    } finally {
      setEngineBusy(false);
      setEngineProg(null);
      setBrief(null);
    }
  };
  /* every catalog entry — components, variants, states — as individual
     layered SVGs. The same list the sprite sheet renders, so what you see
     in the catalog is exactly what lands in the zip. */

  const [shared, setShared] = useState(false);
  /* v67 · Share: the whole kit state rides the URL (deflate + base64url).
     Anyone can view; downloads stay with the owner — real permissions later. */
  const shareKit = async () => {
    const payload = useGen.getState().kitPayload();
    const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = `${location.origin}${location.pathname}#share=${b64}`;
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2200); } catch { window.prompt("Share this kit:", url); }
  };
  const [svgBusy, setSvgBusy] = useState(false);
  const downloadSvgPack = async () => {
    if (svgBusy) return;
    setSvgBusy(true);
    try {
      await guardedExport("svg", gateHandlers, async (grant) => {
      const st = useGen.getState();
      const slug = (s2: string) => s2.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      /* fonts travel with the pack: every face the kit uses is embedded as a
         data-URI @font-face inside each text-bearing SVG (so browsers and
         image pipelines render the real type), and the README carries the
         Google Fonts links for design tools that want the family installed. */
      const fams = [...new Set([st.cfg.type.font, ...Object.values(st.kitDesigns).map((d) => d?.type?.font).filter((f): f is string => !!f)])];
      /* the README's promise, kept in code: resolve each family to a woff2
         data URI once, inline the whole set into every text-bearing SVG.
         Exact-name matches only — fontByName's fallback would embed the
         wrong face's bytes under a custom family's name. */
      const faceRules: string[] = [];
      for (const fam of fams) {
        const fd = fontByName(fam);
        const uri = await fontDataUri(fam, fd.name === fam ? fd.css ?? null : null).catch(() => null);
        if (uri) faceRules.push(`@font-face{font-family:"${fam.replace(/"/g, "")}";src:url(${uri}) format("woff2");}`);
      }
      const faceCss = faceRules.length ? `<style>${faceRules.join("")}</style>` : "";
      const files: { path: string; data: string }[] = sheetEntries(st).map((e) => ({
        path: `svg/${slug(e.name)}.svg`,
        data: faceCss && e.svg.includes("<text") ? e.svg.replace(/(<svg[^>]*>)/, `$1${faceCss}`) : e.svg,
      }));
      /* Paperwork. README = how the pack is built PLUS the full recipe, so a
         designer can rebuild the look by hand. settings.json goes straight
         back into the app. FONT-LICENSE ships because embedding a face IS
         redistribution and the OFL requires its terms to travel with it.
         All plain string work — no server involved. */
      files.push({
        path: "README.md",
        data: [
          "# SVG pack — every kit asset", "",
          "One layered SVG per catalog entry: every component, variant and state,",
          "with your content overrides (text, icons, dock, segments) baked in.",
          "Named groups — cast-shadow, extrusion, shell, face, content, gloss,",
          "specular — import as a readable layer tree.", "",
          fontNotesMarkdown(kitFontFamilies(st.cfg, fams)),
          "## Figma", "Drag any SVG onto the canvas. Ungroup once to reach the layers.",
          "Figma doesn't render SVG filter effects, so soft glows and grain drop",
          "on import — the geometry, gradients, layer names and live text all",
          "arrive intact, ready to restyle with Figma's own effects. Want the",
          "rendered look exactly? Use the PNG exports.", "",
          "## Illustrator", "Open directly; the 'SVG Tiny' warning only concerns re-saving.", "",
          "---", "",
          kitSpecMarkdown(st.cfg, st.kitName ?? "Your kit"),
        ].join("\n"),
      });
      files.push({ path: "settings.json", data: JSON.stringify(st.cfg, null, 2) });
      files.push({ path: "LICENCE.txt", data: grant.licence });
      downloadZip(`${slug(st.kitName ?? "ui-kit")}-svg-pack.zip`, files);
      });
    } finally {
      setSvgBusy(false);
    }
  };
const kitTier = useGen((s) => s.tier);
  /* ── Type Stamps: baked styled phrases for hero text. The app IS the
     phrase factory — type lines, get crisp 4x PNGs of the kit's full
     display treatment, rooted in the SAME Unity folder as the engine kit
     so re-exports overwrite in place. Live UI text stays live; stamps
     cover the moments real games bake anyway. ── */
  const [stampsOpen, setStampsOpen] = useState(false);
  const [stampText, setStampText] = useState("");
  const [stampBusy, setStampBusy] = useState(false);
  const openStamps = () => {
    if (!stampText) {
      const st = useGen.getState();
      setStampText([st.kitName?.toUpperCase() ?? "MY GAME", "SWEET VICTORY", "LEVEL UP!"].join("\n"));
    }
    setStampsOpen(true);
  };
  const runStamps = async () => {
    const phrases = [...new Set(stampText.split("\n").map((s) => s.trim()).filter(Boolean))].slice(0, 24);
    if (!phrases.length || stampBusy) return;
    setStampBusy(true);
    try {
      await guardedExport("engine", gateHandlers, async (grant) => {
        const st = useGen.getState();
        // stamps root in the SAME Unity folder as the engine kit — the slug
        // rule must match ensureUnitySlug or a renamed kit's stamps strand
        const uslug = ensureUnitySlug(st.kitName ?? `The ${preset?.name ?? "Custom"} Kit`);
        /* rasterized SVGs are sealed documents — embed the kit's face or the
           stamps bake with a system fallback font (best effort; the document
           font still styles everything if the fetch fails) */
        const kf = await fetchKitFont(st.cfg.type.font).catch(() => null);
        setEmbedFont(st.cfg.type.font, kf?.bytes ?? null);
        const files: { path: string; data: string | Uint8Array }[] = [];
        for (const p of phrases) {
          const pslug = p.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "stamp";
          const { bytes } = await svgToPngBytesTight(renderTypeSpecimen(st.cfg, p.slice(0, 40)), 4);
          files.push({ path: `UIKitMaker/${uslug}/stamps/${pslug}@4x.png`, data: bytes });
        }
        files.push({
          path: `UIKitMaker/${uslug}/stamps/README.md`,
          data: "# Type Stamps\n\nYour phrases in the kit's full display treatment, baked at 4x —\nfor HERO text: titles, banners, victory moments. They import as ready\nsprites at design size.\n\nRunning UI text stays LIVE text (see the kit's UNITY-README); stamps\nare for the moments real games bake anyway. Need another phrase or a\nrestyle? Type it on uikitmaker.com, download again, extract over the\nsame spot — same overwrite rules as the kit.\n",
        });
        files.push({ path: `UIKitMaker/${uslug}/stamps/LICENCE.txt`, data: grant.licence });
        downloadZip(`${uslug}-type-stamps.zip`, files);
      });
    } finally {
      setEmbedFont("", null);
      setStampBusy(false);
      setStampsOpen(false);
    }
  };
  /* Per artifact, not one blanket flag — though under the Gate Round every
     generated artifact reads locked for guest AND free; what the free tier
     downloads instead is the stock Unity TEST KIT row below. */
  const mayEngine = canExport(kitTier, "engine");
  const maySvg = canExport(kitTier, "svg");
  /* the sprite sheet renders entirely in the browser (no server leg), so
     its gate is client-side by nature: paid tiers only */
  const paidTier = kitTier === "student" || kitTier === "pro";
  const [testKitBusy, setTestKitBusy] = useState(false);
  const runTestKit = async () => {
    if (testKitBusy) return;
    if (kitTier === "guest") { openGate("export"); return; }
    setTestKitBusy(true);
    try {
      const err = await downloadTestKit();
      if (err) window.alert(err);
    } finally {
      setTestKitBusy(false);
    }
  };
  const exportActions = [
    { id: "engine",
      // THE Unity download, named as such (owner call) — Unreal is a
      // promise, not a format, until it gets the same first-class bridge
      name: "Unity kit (ZIP)",
      desc: "Every component as drop-in Unity assets: nine-sliced sprites, wired prefabs, styled live text, in-place restyle on re-import. Unreal support coming soon.",
      busy: engineBusy, locked: !mayEngine, prog: engineProg, run: () => void downloadEngineKit() },
    /* the free tier's one download (Gate Round): a canned, admin-blessed
       STOCK kit — the same evaluation zip for everyone, never this design.
       Guests see it as a register incentive; paid tiers have the real
       thing above, so the row steps aside for them. */
    ...(!paidTier ? [{
      id: "testkit",
      name: "Unity test kit (ZIP) — free",
      desc: kitTier === "guest"
        ? "The stock Hot Rod evaluation kit — sign up free and prove the whole import pipeline (prefabs, scenes, gauges, words) in your engine before paying."
        : "The stock Hot Rod evaluation kit — the same fixed ZIP for everyone, not your design — to prove the whole import pipeline (prefabs, scenes, gauges, words) before you pay.",
      busy: testKitBusy, run: () => void runTestKit(),
    }] : []),
    { id: "svg", name: "SVG pack", desc: "Every component, variant and state as a layered SVG — Illustrator, Penpot and Figma ready.", busy: svgBusy, locked: !maySvg, run: () => void downloadSvgPack() },
    { id: "sprite", name: "Sprite sheet (PNG)", desc: "One labeled catalog image of every asset — for humans, not for slicing.", busy: sheetBusy, locked: !paidTier, run: () => { if (paidTier) void downloadAllAssets(); else openGate("export"); } },
    { id: "stamps", name: "Type stamps (PNG)", desc: "Your phrases in the kit's full display treatment, baked crisp at 4x — hero titles, banners, victory text. Lands in the same Unity folder as the kit.", busy: stampBusy, locked: !mayEngine, run: openStamps },
  ];
  const sheetEntries = (st: ReturnType<typeof useGen.getState>) => {
    {
      const pieceCfg = (cid: KitComponentId) => applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[cid]), st.kitTextFill[cid]);
      const rk = (cid: KitComponentId, name: string, extra: Parameters<typeof renderKit>[6] = {}, v?: number, gstate: GenStateName = "default") => {
        const o = {
          expand: true, textOy: st.kitTextOy[`${cid}:${effKitSize(st.kitSizes[cid])}`], textOx: st.kitTextOx[`${cid}:${effKitSize(st.kitSizes[cid])}`],
          row: cid === "datarow" ? st.kitRow : undefined,
          themedText: !!st.kitDesigns[cid]?.type || !!st.kitTextFill[cid], ...extra,
        };
        // user content overrides ride every catalog entry
        o.icon = resolveKitIcon(st.kitIcons[cid], o.icon);
        o.slots = { ...st.kitSlotVals[cid], ...o.slots };
        if (st.kitNoText[cid]) o.label = ""; else if (o.label === undefined) o.label = st.kitLabels[cid];
        if (o.sub === undefined) o.sub = st.kitSubs[cid];
        if (cid === "progress" || cid === "segbar") {
          const kb = st.kitBar[cid];
          if (o.bar === undefined) o.bar = kb;
          if (o.dock === undefined && kb?.dock) o.dock = { icon: resolveKitIcon(st.kitIcons[cid], undefined), side: kb.dockSide ?? "left" };
        }
        return { cid, name, svg: renderKit(pieceCfg(cid), cid, effKitSize(st.kitSizes[cid]), gstate, v, st.kitShapes[cid], o) };
      };
      const entries = [
        /* the staged Value rides each base entry — the Component-content
           slider's pose is part of the kit, so it exports too */
        ...KIT_COMPONENTS.map((c2) => rk(c2.id, c2.name, {}, st.kitVals[c2.id])),
        rk("panel", "Container · Round", { kind: "circle" }),
        rk("panel", "Container · Oval", { kind: "oval" }),
        rk("panel", "Container · Strip", { kind: "strip" }),
        rk("reticle", "Reticle · Brackets", { overlay: "brackets" }),
        rk("minimap", "Mini-map · Radar", { overlay: "square" }),
        rk("joystick", "Joystick · Ghost", { overlay: "ghost" }),
        rk("slot", "Slot · Level", { icon: STOCK_ICONS.gem, overlay: "level:42" }),
        rk("slot", "Slot · Locked", { icon: STOCK_ICONS.gem, overlay: "locked" }),
        rk("flipclock", "Flip countdown · Urgent", {}, 0.13),
        rk("stopwatch", "Stopwatch · Urgent", {}, 0.13),
        /* the state block — engines skin the full interaction, not just the
           resting pose, so every stateful piece ships its other faces too */
        rk("primary", "Primary · Hover", {}, undefined, "hover"),
        rk("primary", "Primary · Pressed", {}, undefined, "pressed"),
        rk("primary", "Primary · Disabled", {}, undefined, "disabled"),
        rk("secondary", "Secondary · Hover", {}, undefined, "hover"),
        rk("secondary", "Secondary · Disabled", {}, undefined, "disabled"),
        rk("small", "Small · Hover", {}, undefined, "hover"),
        rk("small", "Small · Pressed", {}, undefined, "pressed"),
        rk("iconbtn", "Icon button · Hover", {}, undefined, "hover"),
        rk("iconbtn", "Icon button · Pressed", {}, undefined, "pressed"),
        rk("chip", "Chip · Hover", {}, undefined, "hover"),
        rk("tab", "Tab · Selected", {}, undefined, "pressed"),
        rk("tab", "Tab · Disabled", {}, undefined, "disabled"),
        rk("tabback", "Back tab · Selected", {}, undefined, "pressed"),
        rk("tabback", "Back tab · Disabled", {}, undefined, "disabled"),
        rk("badge", "Badge · Awarded", {}, undefined, "pressed"),
        rk("toggle", "Toggle · Off", {}, 0),
        rk("toggle", "Toggle · Disabled", {}, 1, "disabled"),
        rk("checkbox", "Checkbox · Off", {}, 0),
        rk("radio", "Radio · Off", {}, 0),
        rk("orb", "Glow orb · Off", {}, 0),
        rk("segment", "Segment · First", {}, 0),
        rk("slider", "Slider · Low", {}, 0.15),
        rk("progress", "Progress · Full", {}, 1),
        rk("emblembar", "Emblem bar", {}, 0.55),
        rk("segbar", "Segmented · 3 of 5", {}, 0.62),
        rk("segbar", "Segmented · 8", { bar: { segments: 8 } }, 0.55),
        rk("vsbar", "VS health bar", {}, 0.72),
        rk("hotbar", "Hotbar · slot 3", {}, 0.25),
        rk("dialog", "Dialog"),
        rk("toast", "Toast"),
        rk("tooltip", "Tooltip"),
        rk("keycap", "Keycap · E"),
        rk("keycap", "Keycap · SPACE", { label: "SPACE" }),
        rk("padbtn", "Pad · A"),
        rk("padbtn", "Pad · B", { label: "B" }),
        rk("padbtn", "Pad · X", { label: "X" }),
        rk("padbtn", "Pad · Y", { label: "Y" }),
        rk("listmenu", "List menu", {}, 0.34),
        rk("scrollbar", "Scrollbar", {}, 0.3),
        rk("pagedots", "Page dots", {}, 0.25),
        rk("steps", "Step indicator", {}, 0.42),
        rk("spinner", "Spinner"),
        rk("loadbar", "Loading bar", {}, 0.62),
        rk("setrow", "Settings row", {}, 0.7),
        rk("searchfield", "Search field"),
        rk("searchfield", "Search field · query", { label: "health potion" }),
        rk("notifydot", "Notification badge", {}, 0.3),
        rk("countbadge", "Count badge", {}, 0.03),
        rk("countbadge", "Count badge · 42", {}, 0.42),
        rk("avatarframe", "Avatar frame", {}, 0.12),
        rk("nameplate", "Nameplate"),
        rk("currency", "Currency pill", {}, 0.125),
        rk("buffframe", "Buff frame", {}, 0.65),
        rk("cooldown", "Cooldown radial", {}, 0.4),
        rk("stepper", "Stepper", {}, 0.62),
        rk("cardback", "Card back", {}),
        rk("cardback", "Deck cover", { label: "STARTER · 30" }),
        rk("pack", "Card pack", {}),
        rk("tacho", "Rev meter · 7.4", {}, 0.82),
        rk("input", "Input · Focus", {}, undefined, "hover"),
        rk("input", "Input · Disabled", {}, undefined, "disabled"),
        rk("dropdown", "Dropdown · Open", {}, undefined, "pressed"),
        rk("datarow", "Data row · Selected", {}, undefined, "hover"),
        rk("datarow", "Data row · Disabled", {}, undefined, "disabled"),
        rk("slot", "Slot · Claimable", { icon: STOCK_ICONS.gem, overlay: "claimable" }, undefined, "hover"),
        rk("reticle", "Reticle · Locked", {}, undefined, "hover"),
        rk("ring", "Ring · Complete", {}, 1),
        /* P2/P3 build parts — every meaningful pose of the RPG and shooter
           vocabularies ships in the catalog, same rule as the state block */
        rk("healthglobe", "Health globe · Low", {}, 0.2),
        rk("partyframe", "Party frame · Hurt", {}, 0.24),
        rk("rarityframe", "Rarity · Common", {}, 0),
        rk("rarityframe", "Rarity · Uncommon", {}, 0.25),
        rk("rarityframe", "Rarity · Rare", {}, 0.5),
        rk("rarityframe", "Rarity · Epic", {}, 0.75),
        rk("rarityframe", "Rarity · Legendary", {}, 1),
        rk("equipslot", "Socket · Head", { icon: STOCK_ICONS.helmet }),
        rk("equipslot", "Socket · Chest", { icon: STOCK_ICONS.shirt }),
        rk("equipslot", "Socket · Hands", { icon: STOCK_ICONS.hand }),
        rk("equipslot", "Socket · Feet", { icon: STOCK_ICONS.boots }),
        rk("equipslot", "Socket · Weapon", { icon: STOCK_ICONS.sword }),
        rk("equipslot", "Socket · Offhand", { icon: STOCK_ICONS.shield }),
        rk("skillnode", "Skill node · Learned", { overlay: "learned" }),
        rk("skillnode", "Skill node · Locked", { overlay: "locked" }),
        rk("dmgnumber", "Damage · Critical", {}, 0.9),
        /* the loot tag's FULL ladder ships — a dev skins every tier their
           items can drop at, not just the poster child */
        rk("loottag", "Loot tag · Common", {}, 0),
        rk("loottag", "Loot tag · Uncommon", {}, 0.25),
        rk("loottag", "Loot tag · Rare", {}, 0.5),
        rk("loottag", "Loot tag · Epic", {}, 0.75),
        rk("loottag", "Loot tag · Legendary", { label: "Dawnbreaker" }, 1),
        rk("crosshair", "Crosshair · Wide", {}, 0.85),
        rk("crosshair", "Crosshair · Dot", { overlay: "dot" }),
        rk("hitmarker", "Hit marker · Critical", {}, 0.9),
        rk("killfeed", "Kill feed · You", { label: "YOU", sub: "NOVA_KNIGHT" }, undefined, "hover"),
        rk("magazine", "Magazine · Last rounds", {}, 0.16),
        rk("streakmeter", "Streak · Ignited", {}, 1),
        rk("capturemeter", "Capture · Contested", {}, 0.55),
        rk("respawn", "Respawn · Ready", {}, 0),
        /* P4/P5 build parts — every meaningful pose ships in the catalog */
        rk("starrating", "Stars · Two", {}, 0.67),
        rk("starrating", "Stars · One", {}, 0.34),
        rk("levelnode", "Level node · Completed", { label: "11", overlay: "stars:3" }),
        rk("levelnode", "Level node · Locked", { label: "13", overlay: "locked" }),
        rk("movecounter", "Moves · Last", {}, 0.12),
        // staging-bay pieces list their poses here too — the visibility
        // filter at the end keeps them admin-only until released
        rk("vitalbar", "Vital · Health", { slots: { readout: "1,250 / 1,500", tint: "Health" } }, 0.83),
        rk("vitalbar", "Vital · Mana", { slots: { readout: "650 / 1,000", tint: "Mana" } }, 0.65),
        rk("vitalbar", "Vital · Kit glow", {}, 0.72),
        rk("vitalbar", "Vital · Low", { slots: { readout: "180 / 1,500", tint: "Health" } }, 0.12),
        rk("quickslots", "Quadrant · Loadout", { slots: { q1: "3", q4: "5", active: "Down" } }),
        rk("quickslots", "Quadrant · Custom", { slots: { g1: "Scroll", g2: "Key", g3: "Zap", g4: "Heart", q4: "2" } }),
        rk("quickslots", "Quadrant · Bare", { slots: { g1: "Empty", g2: "Empty", g3: "Empty", g4: "Empty" } }),
        rk("orderticket", "Order ticket · Urgent", {}, 0.1),
        rk("orderticket", "Order ticket · Served", {}, 0.62, "disabled"),
        rk("gearicon", "Settings gear"),
        rk("gearicon", "Settings gear · Disabled", {}, undefined, "disabled"),
        rk("trophyicon", "Trophy"),
        rk("trophyicon", "Trophy · Gold", { overlay: "gold" }),
        rk("trophyicon", "Trophy · Silver", { overlay: "silver" }),
        rk("trophyicon", "Trophy · Bronze", { overlay: "bronze" }),
        rk("trophyicon", "Trophy · Disabled", {}, undefined, "disabled"),
        rk("gifticon", "Gift box"),
        rk("gifticon", "Gift box · Disabled", {}, undefined, "disabled"),
        rk("firebutton", "Fire button"),
        rk("firebutton", "Fire button · Volt armed", {}, 0.3),
        rk("firebutton", "Fire button · Pressed", {}, undefined, "pressed"),
        rk("chest", "Chest · Small wood", { slots: { tier: "Wood", variant: "Plain" } }, 0.4),
        rk("chest", "Chest · Medium iron", { slots: { tier: "Iron", variant: "Plain" } }, 0.4),
        rk("chest", "Chest · Large gold", { slots: { tier: "Gold", variant: "Plain" } }, 0.4),
        rk("chest", "Chest · Premium", { slots: { tier: "Premium", variant: "Plain" } }, 0.4),
        rk("chest", "Chest · Event", { slots: { tier: "Event", variant: "Plain" } }, 0.4),
        rk("chest", "Chest · Timed", {}, 0.55),
        rk("chest", "Chest · Ready", {}, 0),
        rk("chest", "Chest · Locked", { slots: { variant: "Locked" } }, 0.5),
        rk("chest", "Chest · Opened", {}, 0.62, "disabled"),
        rk("giftbox", "Gift · Daily ready", { slots: { tag: "Daily" } }, 1),
        rk("giftbox", "Gift · Surprise", { slots: { tag: "Surprise" } }, 0.4),
        rk("giftbox", "Gift · Milestone", { slots: { tag: "Milestone" } }, 0.7),
        rk("giftbox", "Gift · Claimed", {}, 0.4, "disabled"),
        rk("rewardcard", "Reward · Legendary", {}, 1),
        rk("rewardcard", "Reward · Mystery", { slots: { kind: "Mystery" } }, 0.5),
        rk("rewardtray", "Tray · Revealing", {}, 0.5),
        rk("rewardtray", "Tray · Summary", {}, 1),
        rk("claimbtn", "Claim · 2× by ad", { slots: { mode: "2x by ad" } }),
        rk("dailycell", "Daily · Claimed", { label: "DAY 3", overlay: "check" }),
        rk("dailycell", "Daily · Locked", { label: "DAY 5", overlay: "locked" }),
        rk("booster", "Booster · Free", { icon: STOCK_ICONS.gem }, 0),
        rk("popmeter", "Population · Near cap", {}, 0.95),
        rk("techcard", "Tech · Researched", { label: "KEEN SIGHT", icon: STOCK_ICONS.crosshair, overlay: "done" }),
        rk("techcard", "Tech · Locked", { label: "???", overlay: "locked" }),
        rk("friendrow", "Friend · Offline", { label: "STORM_BREW" }, 0),
      ];
      // the guest catalog is the five proof components — the PNG sheet must
      // not hand over what the page keeps locked. Staging-bay pieces ride
      // only for the admin (or once released) — same rule as the page.
      const vis = entries.filter((e) => kitVisible(e.cid, st.componentReleases, st.isAdmin));
      return st.tier === "guest" ? vis.filter((e) => GUEST_KIT.has(e.cid)) : vis;
    }
  };
  const downloadAllAssets = async () => {
    if (sheetBusy) return;
    setSheetBusy(true);
    try {
      const st = useGen.getState();
      const fdef = fontByName(st.cfg.type.font);
      await downloadSpriteSheet(sheetEntries(st), `${st.kitName ?? `The ${preset?.name ?? "Custom"} Kit`} — visual catalog`, st.cfg.type.font, fdef?.css ?? null);
    } finally {
      setSheetBusy(false);
    }
  };
  // main-menu title — the game's name (preset), not the master button label
  const menuArt = useMemo(() => !heavy ? "" : renderTypeSpecimen(cfg, (preset?.name ?? "CANDY").toUpperCase()), [cfg, preset, heavy]);
  const loadingArt = useMemo(() => !heavy ? "" : renderTypeSpecimen(cfg, "LOADING"), [cfg, heavy]);
  const charRow = (txt: string) => tightenV(renderTypeSpecimen(cfg, txt, { keepCase: true, mutate: (c) => { c.type.size = 52; } }), 52, T.oy ?? 0);
  const alphaUp = useMemo(() => !heavy ? "" : charRow("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), [cfg, heavy]); // eslint-disable-line react-hooks/exhaustive-deps
  const alphaLo = useMemo(() => !heavy ? "" : charRow("abcdefghijklmnopqrstuvwxyz"), [cfg, heavy]); // eslint-disable-line react-hooks/exhaustive-deps
  const digits = useMemo(() => !heavy ? "" : charRow("0123456789 ! ? & % + × / : . , ’ “ ” ( ) [ ]"), [cfg, heavy]); // eslint-disable-line react-hooks/exhaustive-deps

  // display construction — the treatment built up in four inspectable stages
  const conWord = (splash.trim().split(/\s+/)[0] || "LEVEL").slice(0, 8).toUpperCase();
  const conStages = useMemo(() => {
    if (!heavy) return [];
    const base = (c: GenConfig) => { typeOff(c); c.type.size = 62; };
    // the outline stage must SHOW an outline even when the master's outline
    // width is zeroed — the construction sheet demos the layer, not the
    // current setting
    const outlineOn = (c: GenConfig) => {
      c.type.outline.on = true;
      if (!c.type.outline.width || c.type.outline.width < 1.5) c.type.outline.width = 3;
    };
    const defs: [string, (c: GenConfig) => void][] = [
      ["Base fill", (c) => base(c)],
      ["Outline", (c) => { base(c); outlineOn(c); }],
      ["Depth", (c) => {
        base(c); outlineOn(c); c.type.shadow.on = true;
        c.type.emboss.on = true; if (!c.type.emboss.strength) c.type.emboss.strength = 55;
      }],
      ["Highlight + glow", (c) => {
        base(c); outlineOn(c); c.type.shadow.on = true;
        c.type.emboss.on = true; if (!c.type.emboss.strength) c.type.emboss.strength = 55;
        c.type.glow.on = true; c.type.glints = { on: true, opacity: c.type.glints?.opacity ?? 55 };
      }],
    ];
    return defs.map(([name, mutate]) => ({ name, svg: tightenV(renderTypeSpecimen(cfg, conWord, { mutate }), 62, T.oy ?? 0) }));
  }, [cfg, conWord, heavy]); // eslint-disable-line react-hooks/exhaustive-deps

  // scale reference — the same phrase down the whole ramp
  const scaleArts = useMemo(() => !heavy ? [] : ([["Display XL", 128], ["Display L", 96], ["Display M", 64], ["Display S", 40], ["Label", 18]] as const)
    .map(([nm, px]) => ({ nm, px, svg: tightenV(renderTypeSpecimen(cfg, "LEVEL UP", { mutate: (c) => { c.type.size = px; } }), Math.max(px, 16), T.oy ?? 0) })), [cfg, heavy]); // eslint-disable-line react-hooks/exhaustive-deps

  // caps-only faces map lowercase onto the uppercase forms — detect for real
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => { document.fonts?.ready?.then(() => setFontsTick((t) => t + 1)).catch(() => {}); }, [T.font]); // eslint-disable-line react-hooks/exhaustive-deps
  const capsOnly = useMemo(() => {
    void fontsTick;
    try {
      const cv = document.createElement("canvas"); cv.width = 160; cv.height = 64;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      ctx.font = `40px "${T.font}", Inter, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText("agr", 4, 8);
      const lo = cv.toDataURL();
      ctx.clearRect(0, 0, 160, 64);
      ctx.fillText("AGR", 4, 8);
      return lo === cv.toDataURL();
    } catch { return false; }
  }, [T.font, fontsTick]);

  // typography recipe — the current treatment as a live layered stack
  const recipe = useMemo(() => {
    const offAll = (c: GenConfig) => {
      c.type.outline.on = false; c.type.shadow.on = false; c.type.emboss.on = false;
      c.type.glow.on = false; c.type.stripes = { on: false, angle: 45, opacity: 30 };
      c.type.glints = { on: false, opacity: 55 }; c.type.highlight = "";
    };
    const layers: { name: string; on: (c: GenConfig) => void }[] = [{ name: "Live base text · face fill", on: () => {} }];
    if (T.outline.on) layers.push({ name: "+ Outline", on: (c) => { c.type.outline.on = true; } });
    if (T.shadow.on) layers.push({ name: "+ Shadow", on: (c) => { c.type.shadow.on = true; } });
    if (T.emboss.on) layers.push({ name: T.emboss.strength < 0 ? "+ Deboss relief" : "+ Emboss relief", on: (c) => { c.type.emboss.on = true; } });
    if (T.glow.on) layers.push({ name: "+ Glow", on: (c) => { c.type.glow.on = true; } });
    if (T.stripes?.on) layers.push({ name: "+ Stripe mask", on: (c) => { c.type.stripes!.on = true; } });
    if (T.glints?.on) layers.push({ name: "+ Highlight glints", on: (c) => { c.type.glints!.on = true; } });
    layers.push({ name: "+ Highlight phrase", on: (c) => { c.type.highlight = c.content.label.split(" ").pop() ?? ""; } });
    const ons: ((c: GenConfig) => void)[] = [];
    return layers.map((l) => {
      ons.push(l.on);
      const fns = [...ons];
      return { name: l.name, svg: tightenV(renderTypeSpecimen(cfg, label, { mutate: (c) => { offAll(c); fns.forEach((f) => f(c)); c.type.size = 64; } }), 64, cfg.type.oy ?? 0) };
    });
  }, [cfg, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // build-part layer isolation — each card is one layer of the real stack
  const layerCards = useMemo(() => {
    if (!heavy) return [];
    const zero = (c: GenConfig) => {
      c.shadow.opacity = 0; c.candy.contact.opacity = 0; c.candy.extrusion.depth = 0;
      c.transparency = { frame: 0, interior: 0, content: 0 };
      for (const s of Object.values(c.states)) { s.glow = 0; s.lift = 0; }
      c.candy.gloss.on = false; c.candy.specular.on = false; c.candy.pattern.type = "none";
      c.candy.innerGlow.opacity = 0; c.candy.bloom.opacity = 0; c.candy.texture.amount = 0;
      c.candy.extrusion.glow = 0; c.stateDesigns = {};
    };
    const iso = (mut: (c: GenConfig) => void) => {
      const c = clone(cfg); zero(c); mut(c); return renderBevel(c, "default");
    };
    const base = cfg;
    return [
      { name: "Cast shadow", sec: "depth", meta: ["Stretch X/Y", "bottom of stack", "recolor via Shadow well"], svg: iso((c) => { c.shadow.opacity = Math.max(30, base.shadow.opacity); }) },
      { name: "Extrusion body", sec: "structure", meta: ["Stretch X", "under the shell", "depth in px"], svg: iso((c) => { c.candy.extrusion.depth = Math.max(10, base.candy.extrusion.depth); }) },
      { name: "Shell wall + rim", sec: "structure", meta: ["Fixed caps", "stretch middle", "recolor via Bevel well"], svg: iso((c) => { c.transparency.frame = 100; }) },
      { name: "Face gradient", sec: "surface", meta: ["Stretch X/Y", "recolor via Inner Fill", "safe inset = wall"], svg: iso((c) => { c.transparency.interior = 100; }) },
      { name: "Pattern overlay", sec: "surface", meta: ["Repeat", "over the face", "tone-on-tone"], svg: iso((c) => { c.transparency.interior = 100; c.candy.pattern.type = base.candy.pattern.type === "none" ? "stripes" : base.candy.pattern.type; }) },
      { name: "Inner glow", sec: "glow", meta: ["Stretch X/Y", "unlit side", "recolor via Glow well"], svg: iso((c) => { c.transparency.interior = 100; c.candy.innerGlow.opacity = 75; }) },
      { name: "Gloss strip", sec: "gloss", meta: ["Stretch X", "top of face", "curve + softness"], svg: iso((c) => { c.transparency.interior = 100; c.candy.gloss.on = true; }) },
      { name: "Specular streak", sec: "gloss", meta: ["Fixed size", "lit corner", "six modes"], svg: iso((c) => { c.transparency.interior = 100; c.candy.specular.on = true; }) },
      { name: "Outer glow (aura)", sec: "state", meta: ["Stretch X/Y", "behind everything", "per-state"], svg: iso((c) => { c.transparency.frame = 100; c.states.default.glow = 55; }) },
      { name: "Contact shadow", sec: "depth", meta: ["Stretch X", "grounding", "fades on lift"], svg: iso((c) => { c.transparency.frame = 100; c.candy.contact.opacity = 60; }) },
      { name: "Live text treatment", sec: "typography", meta: ["Editable text", "never rasterized", "full recipe below"], svg: iso((c) => { c.transparency.content = 100; }) },
    ];
  }, [cfg, heavy]);

  return (
    <div className={`kitpage${dark ? " dark" : ""}`} style={{ "--kp-pattile": patternTileUrl(cfg) } as React.CSSProperties}>
      {curtain !== "gone" && (
        <div className={`kp-curtain${curtain === "leaving" ? " leaving" : ""}`} role="status" aria-live="polite">
          <div className="kp-curtainbox">
            <span className="kp-curtainkicker">UI Kit Maker</span>
            <h2 className="kp-curtaintitle">Generating {kitName ?? `The ${preset?.name ?? "Custom"} Kit`}</h2>
            <div className="kp-curtainbar" aria-hidden="true"><i style={{ width: `${Math.round(bootProg * 100)}%`, background: cfg.effects.Bevel ?? "#0E9CC9" }} /></div>
            <span className="kp-curtainstage">{bootStage}…</span>
          </div>
        </div>
      )}
      {/* ── the Unity briefing takes the screen while the zip builds ── */}
      {engineBusy && brief && !briefHidden && (
        <UnityBriefing cards={brief} prog={engineProg} accent={cfg.effects.Glow || cfg.effects.Bevel || "#0E9CC9"}
          kitName={kitName ?? `The ${preset?.name ?? "Custom"} Kit`} onHide={() => setBriefHidden(true)} />
      )}
      {/* ── sticky chapter navigation — persistent orientation ── */}
      <ChapterTabs />

      {/* Spotlight moved to the projects home (owner: "the kit remains
          pure, just your work") — no promo shelf here. */}

      {/* ── hero — the system, stated once ── */}
      <header className="kp-hero kp-hero2">
        <div className="kp-heroleft">
          <div className="kp-eyebrow"><span className="kp-verpill">Design System</span> PatternBreak</div>
          {renaming ? (
            <input className="kp-titleedit" autoFocus maxLength={40} aria-label="Kit name"
              defaultValue={kitName ?? `The ${preset?.name ?? "Custom"} Kit`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const changed = v && v !== `The ${preset?.name ?? "Custom"} Kit`;
                setKitName(changed ? v : null);
                if (changed) saveUserPreset(v); // the named look becomes a preset — the original stays
                setRenaming(false);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(false); }} />
          ) : (
            <h1 className="kp-title kp-renamable" onClick={() => setRenaming(true)} title="Click to rename this kit">
              {kitName ?? `The ${preset?.name ?? "Custom"} Kit`} <SquarePen className="kp-renpen" size={17} strokeWidth={2.1} aria-hidden="true" />
            </h1>
          )}
          <p className="kp-sub">A dimensional candy interface system for fast, playful game UI — one material, five levels, everything live.</p>
          <div className="kp-facts">
            {([["5", "Levels"], [String(KIT_COMPONENTS.filter((c) => kitVisible(c.id, releases, false)).length) + "+", "Components"], ["20+", "Assemblies"], [sil, "Silhouette"]] as const).map(([v, l]) => (
              <div className="kp-fact" key={l}><b>{v}</b><span>{l}</span></div>
            ))}
            <button className={`kp-fact kp-a11ybtn${a11yOpen ? ` a11y-${audit.level.toLowerCase()}` : ""}`} aria-expanded={a11yOpen} onClick={() => setA11yOpen((v) => !v)}>
              <b><ShieldCheck size={14} strokeWidth={2.4} /> {a11yOpen ? audit.level : "See score"}</b><span>Accessibility</span>
            </button>
          </div>
          <div className="kp-actrow">
            <button className="kp-editkit" onClick={() => setPhase("master")} title="Open this kit in the editor — every control shapes it live"
              style={{ background: cfg.effects.Bevel ?? "#0E9CC9", color: isDarkBg(cfg.effects.Bevel ?? "#0E9CC9") ? "#ffffff" : "#0d0f16" }}>
              <PenTool size={16} strokeWidth={2.3} /> Edit this Kit
            </button>
            <button className="kp-share" onClick={() => void shareKit()} title="Copy a link that opens this kit for anyone — view only">
              {shared ? "Link copied ✓" : "Share kit"}
            </button>
          </div>
          {viewer ? <div className="kp-viewnote">Shared kit — view only. Ask the owner for the downloads.</div> : <ExportMenu actions={exportActions} />}
          {!viewer && (
            <button className="kp-unitylink" onClick={() => { window.location.hash = "#/unity"; }}
              title="What lands in your project, how the import works, and why re-exports never break a scene.">
              How the Unity kit works →
            </button>
          )}
          {stampsOpen && (
            <div className="kp-stampsheet" role="dialog" aria-label="Type stamps">
              <b>Type Stamps</b>
              <p>One phrase per line (up to 24). Each bakes as a crisp 4× PNG in your kit's full display treatment — for hero text: titles, banners, victory moments. Extract the zip into your Unity project's Assets/ and they land beside the kit, ready as sprites.</p>
              <textarea value={stampText} onChange={(e) => setStampText(e.target.value)} rows={6} maxLength={1200}
                spellCheck={false} autoCorrect="off" autoCapitalize="off"
                placeholder={"SWEET VICTORY\nLEVEL UP!\nGAME OVER"} aria-label="Stamp phrases, one per line" />
              <div className="kp-stampsheet-row">
                <button className="kp-stampgo" disabled={stampBusy} onClick={() => void runStamps()}>{stampBusy ? "Baking…" : "Bake stamps"}</button>
                <button className="kp-stampx" onClick={() => setStampsOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          <div className="kp-roleline" aria-hidden="true">
            {roles.map((r) => <span className="kp-roledot" key={r}><i style={{ background: cfg.effects[r] }} />{r}</span>)}
            {innerGlowChip && <span className="kp-roledot"><i style={{ background: innerGlowChip }} />Inner Glow</span>}
          </div>
          <button className="kp-about" aria-expanded={aboutOpen} onClick={() => setAboutOpen((v) => !v)}>About this kit {aboutOpen ? "–" : "+"}</button>
          {aboutOpen && (
            <div className="kp-reveal"><div>
              <p className="kp-note kp-aboutbody">
                {sil} silhouette · {T.font}. One material recipe at five levels: foundations, finished
                components, Build Parts with containers and assemblies, screen patterns and resources.
                Every specimen is a live render from the same engine that draws the editor canvas;
                each opens in the editor via the ✎ next to its name. Nothing on this page is a mockup.
              </p>
            </div></div>
          )}
          {a11yOpen && (
            <div className="kp-reveal"><div>
              <div className={`kp-a11y ${audit.level.toLowerCase()}`} role="status">
                <b>{audit.level === "Strong" ? "Strong — reads clearly." : audit.level === "Fair" ? "Fair — solid, with a couple of watch-outs." : "Risky — worth a tweak before shipping."}</b>
                <ul>{audit.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                <div className="kp-a11yhow">Computed locally from WCAG contrast ratios and type metrics — no AI involved, nothing leaves the page.</div>
              </div>
            </div></div>
          )}
        </div>
        <HeroGL />
      </header>

      {/* ── 00 · the staging bay — new pieces wait HERE for the owner's
          release. Admin-only: for everyone else the document starts at
          Foundations and these pieces don't exist anywhere on the site. ── */}
      {isAdmin && STAGED_KIT.size > 0 && (() => {
        // released pieces LEAVE the queue (owner call) — they live in the
        // kit proper now; a quiet footer keeps the pull-back reversible
        const inBay = [...STAGED_KIT].filter((sid) => releases[sid] !== "released");
        const releasedStaged = [...STAGED_KIT].filter((sid) => releases[sid] === "released");
        const act = (sid: KitComponentId, next: "released" | "rejected" | null, confirmMsg?: string) => {
          if (confirmMsg && !window.confirm(confirmMsg)) return;
          void setComponentRelease(sid, next).then((err) => { if (err) window.alert(err); });
        };
        if (!bayOpen) return (
          <section className="kp-sec kp-baycollapsed">
            <button className="kp-baytoggle" onClick={() => setBayOpen(true)}>
              <ShieldCheck size={13} strokeWidth={2.2} /> Staging bay · {inBay.length} waiting — only you see this
            </button>
          </section>
        );
        return (
          <Sec n="00" title="The staging bay"
            note="New pieces land here first, visible only to you. Test them across the editor, the Board and the exports, then approve — the piece leaves the bay and appears for every maker the moment you do, no deploy needed. Reject parks it; both are reversible.">
            <button className="kp-baytoggle" onClick={() => setBayOpen(false)}>Collapse the bay</button>
            {inBay.length === 0 && <p className="kp-baynote">The bay is clear — everything staged is released. New pieces will land here.</p>}
            <div className="kp-baygrid">
              {inBay.map((sid) => {
                const status = releases[sid];
                const nm = pieceName(sid);
                return (
                  <div className="kp-bayrow" key={sid}>
                    <div className="kp-tray kp-axis">
                      <Piece id={sid} caption={nm} scale={0.5} bay />
                    </div>
                    <div className="kp-bayside">
                      <span className={`kp-baychip${status === "rejected" ? " rej" : ""}`}>
                        {status === "rejected" ? "Rejected — parked" : "In the bay — only you see this"}
                      </span>
                      <div className="kp-bayacts">
                        <button className="cg-curate cg-curate--add" onClick={() => act(sid, "released", `Release ${nm} to every maker? It leaves the bay and appears across the app the moment you approve.`)}>
                          <ShieldCheck size={13} strokeWidth={2.2} /> Approve — release to everyone
                        </button>
                        {status !== "rejected" ? (
                          <button className="cg-curate cg-curate--danger" onClick={() => act(sid, "rejected")}>Reject</button>
                        ) : (
                          <button className="cg-curate" onClick={() => act(sid, null)}>Restore to the bay</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {releasedStaged.length > 0 && (
              <p className="kp-baynote">
                Released from this bay:{" "}
                {releasedStaged.map((sid, i) => (
                  <span key={sid}>{i > 0 && " · "}<b>{pieceName(sid)}</b>{" "}
                    <button className="cg-curate" onClick={() => act(sid, null, `Pull ${pieceName(sid)} back into the bay? Makers lose it until you release again.`)}>pull back</button>
                  </span>
                ))}
              </p>
            )}
          </Sec>
        );
      })()}

      {/* ── 00 · your components — duplicated pieces, filed by the
          classification chosen at creation. Cards run through the same
          Piece machinery as the catalog: base geometry, the clone's own
          entries. A clone of a staged base renders for the admin alone
          (bay rules); the chapter — and its tab — exists only while
          visible clones do. ── */}
      {(() => {
        const vis = Object.entries(kitClones).filter(([, c]) => kitVisible(c.base, releases, isAdmin));
        if (!vis.length) return null;
        // an unknown classification (a hand-edited save) files under Other
        const kindOf = (k: string) => ((CLONE_KINDS as readonly string[]).includes(k) ? k : "Other");
        const groups = CLONE_KINDS.map((kind) => ({ kind, list: vis.filter(([, c]) => kindOf(c.kind) === kind) })).filter((g) => g.list.length);
        return (
          <>
            <Chapter n="00" id="yours" label="Your components" blurb="Pieces you duplicated — each renders through its base component and restyles alone." />
            {groups.map((g, i) => (
              <Sec key={g.kind} n={String(i + 1).padStart(2, "0")} title={g.kind}>
                <div className="kp-tray">
                  {g.list.map(([cid, c]) => (
                    <Piece key={cid} id={cid as KitComponentId} caption={c.name} bay={isAdmin} />
                  ))}
                </div>
              </Sec>
            ))}
          </>
        );
      })()}

      <Chapter n="01" id="foundations" label="Foundations" blurb="The color roles, material and typography every component inherits." />

      {/* ── 01 · style tokens ── */}
      <Sec n="01" title="Color & Material" note="Five color roles drive the material: face, bevel, glow, shadow and inner fill. Repaint a role and every layer that uses it follows. These are functional roles, not a brand palette.">
        <div className="kp-mat">
          <div className="kp-explode" aria-label="Material layers, top to bottom">
            {([["01", "Glow", "Outer bloom for energy and focus", "Outer glow (aura)"],
               ["02", "Face", "Lit surface that carries the content", "Face gradient"],
               ["03", "Shell", "Wall and rim for shape definition", "Shell wall + rim"],
               ["04", "Body", "Extrusion for physical depth", "Extrusion body"],
               ["05", "Shadow", "Grounding and separation", "Cast shadow"]] as const).map(([n, t, d, layer]) => (
              <div className="kp-exrow" key={n}>
                <div className="kp-exlab"><b>{n} · {t}</b><span>{d}</span></div>
                <Art svg={layerCards.find((l) => l.name === layer)?.svg ?? ""} scale={0.3} />
              </div>
            ))}
          </div>
          <div className="kp-roles2">
            <div className="kp-rolehead">Color roles</div>
            {roles.map((r) => (
              <div className="kp-role2" key={r}>
                <i style={{ background: cfg.effects[r] }} />
                <div className="kp-rolemeta"><b>{r}</b><span>{ROLE_HINT[r]}</span></div>
                <code>{cfg.effects[r]?.toUpperCase()}{"\n"}RGB {rgbOf(cfg.effects[r] ?? "#000000").join(" ")}{"\n"}CMYK {cmykOf(cfg.effects[r] ?? "#000000")}</code>
              </div>
            ))}
            {innerGlowChip && (
              <div className="kp-role2">
                <i style={{ background: innerGlowChip }} />
                <div className="kp-rolemeta"><b>Inner Glow</b><span>Colored light inside the candy — this kit gives it its own voice instead of the Glow role</span></div>
                <code>{innerGlowChip.toUpperCase()}{"\n"}RGB {rgbOf(innerGlowChip).join(" ")}{"\n"}CMYK {cmykOf(innerGlowChip)}</code>
              </div>
            )}
          </div>
        </div>
        <div className="kp-meta">
          <span>Change freely: any role's hue</span>
          <span>Keep related: glow near the bevel family</span>
          <span>Breaks the look: flat fills, removed rim, black shadows at full opacity</span>
        </div>
      </Sec>

      {/* ── 02 · typography ── */}
      <Sec n="02" title="Typography" note="One typeface, one construction system. Display text inherits the same material, outline, depth, and lighting rules as every component in the kit.">
        <div className="kp-typo2">
          <aside className="kp-tyinfo">
            <div className="kp-tyid">
              <b>{T.font}</b>
              <span>Display Typeface</span>
            </div>
            <dl className="kp-tydl">
              {([
                ["Style", T.italic ? "Italic display" : "Display"],
                ["Weight", caps?.wght ? `${T.weight} · variable ${caps.wght[0]}–${caps.wght[1]}` : String(T.weight)],
                ["Case", caseName],
                ["Tracking", `${T.spacing >= 0 ? "" : "−"}${Math.abs(T.spacing)}%`],
                ["Treatment", ["Fill", ...typeFx].join(", ").toLowerCase().replace(/^f/, "F")],
                ["Recommended use", "Titles, rewards, actions, short phrases"],
              ] as const).map(([k2, v2]) => (
                <div className="kp-tyrow" key={k2}><dt>{k2}</dt><dd>{v2}</dd></div>
              ))}
            </dl>
            <div className="kp-tyuse">
              <b className="use">Use it for</b>
              <span>Screen titles · Reward moments · Primary actions · Short status messages</span>
              <b className="avoid">Avoid it for</b>
              <span>Body copy · Long instructions · Dense data · Small labels</span>
            </div>
            <div className="kp-tysrc">
              <a target="_blank" rel="noreferrer" href={`https://fonts.google.com/specimen/${encodeURIComponent(T.font).replace(/%20/g, "+")}`}>Google Fonts</a>
              <i>·</i>
              <a target="_blank" rel="noreferrer" href={`https://github.com/google/fonts/tree/main/ofl/${T.font.toLowerCase().replace(/[^a-z0-9]/g, "")}`}>Open source</a>
              <i>·</i>
              <span>Live text</span>
            </div>
            <div className="kp-tynote">Some treatments show best against one ground — a pale glint fades on light surfaces, a dark emboss sinks into black. Proof the type on both the light and dark stage swatches.</div>
          </aside>

          <div className="kp-tyspec">
            <div className="kp-tylabel">Live display specimen</div>
            <div className="kp-tylivegrid">
              <div className="kp-tyout">
                <Art svg={splashArt} scale={0.85} className="kp-splashmain" />
                <div className="kp-tyanno">Display XL · 128px · {T.spacing >= 0 ? T.spacing : `−${Math.abs(T.spacing)}`}% tracking · {caseName}</div>
              </div>
              <div className="kp-tyctl">
                <label>Primary phrase
                  <span className="kp-tyfield"><input value={splash} maxLength={20} onChange={(e) => setSplash(e.target.value)} aria-label="Splash text" /><i>{splash.length}/20</i></span>
                </label>
                <label>Highlight phrase
                  <span className="kp-tyfield"><input value={splashHi} maxLength={20} onChange={(e) => setSplashHi(e.target.value)} aria-label="Highlight phrase" /><i>{splashHi.length}/20</i></span>
                </label>
                <label className="kp-tyslide">Highlight intensity
                  <span className="kp-tyfield"><input type="range" min={0} max={100} value={hbLive ?? T.highlightBoost ?? 70} aria-label="Highlight intensity"
                    onChange={(e) => setHbLive(+e.target.value)}
                    onPointerUp={commitHb} onKeyUp={commitHb} onBlur={commitHb} /><i>{hbLive ?? T.highlightBoost ?? 70}%</i></span>
                </label>
                <label className="kp-tytog">Treatment
                  <button className={`kp-tyswitch${treatOn ? " on" : ""}`} role="switch" aria-checked={treatOn} aria-label="Treatment on or off"
                    onClick={() => setTreatOn(!treatOn)}><i /></button>
                </label>
              </div>
            </div>

            <KpFold label="Character set & display construction" defaultOpen>
            <div className="kp-tylabel kp-tygap">Character set</div>
            <div className="kp-tychars">
              <span className="kp-tyrowlab">Uppercase</span>
              <Art svg={alphaUp} scale={0.9} />
              <span className="kp-tyrowlab">Lowercase</span>
              <Art svg={alphaLo} scale={0.9} />
              {capsOnly && <p className="kp-tymap">Lowercase maps to uppercase forms.</p>}
              <span className="kp-tyrowlab">Numerals &amp; punctuation</span>
              <Art svg={digits} scale={0.9} />
            </div>

            <div className="kp-tylabel kp-tygap">Display construction</div>
            <div className="kp-tystages">
              {conStages.map((st, i) => (
                <figure key={st.name}>
                  <Art svg={st.svg} scale={0.78} />
                  <figcaption><b>{String(i + 1).padStart(2, "0")}</b> {st.name}</figcaption>
                </figure>
              ))}
            </div>
            </KpFold>
          </div>
        </div>

        <KpFold label="Phrase presets & type scale reference">
        <div className="kp-tyfoot">
          <div className="kp-typresets">
            <div className="kp-tylabel">Phrase presets</div>
            <div className="kp-splashtxts" style={{ fontFamily: `'${T.font}', Inter, sans-serif` }}>
              {SPLASHES.map((sp) => (
                <button key={sp} className={`kp-splashtxt${sp === splash ? " on" : ""}`} title={`Load “${sp}” into the live test`}
                  onClick={() => { setSplash(sp); setSplashHi(sp === "SWEET VICTORY" ? "VICTORY" : ""); }}>{sp}</button>
              ))}
            </div>
            <p className="kp-tymap">Click a preset to load it into the live test.</p>
          </div>
          <div className="kp-tyscale">
            <div className="kp-tylabel">Type scale reference</div>
            {scaleArts.map((r) => (
              <div className="kp-tyrung" key={r.nm}>
                <span>{r.nm}<i>{r.px}px</i></span>
                <Art svg={r.svg} scale={0.68} />
              </div>
            ))}
          </div>
        </div>
        </KpFold>
      </Sec>

      <Chapter n="02" id="components" label="Components" blurb="Finished controls, shown in true relative scale." />
      <Deferred estH={5200} eager={bootN >= 1} onLive={bootAdvance}>{() => <>

      {/* ── 03 · buttons ── */}
      <Sec n="01" title="Buttons" note="Primary carries the master label. The strip below shows every state; hover, press and keyboard-focus are all real.">
        <div className="kp-tray">
          <Piece id="primary" size="l" caption="Primary · L" />
          <Piece id="primary" size="m" caption="Primary · M" />
        </div>
        <div className="kp-tray">
          <Piece id="secondary" caption="Secondary" />
          <Piece id="ghost" caption="Ghost" />
          <Piece id="small" caption="Small" />
          <Piece id="iconbtn" caption="Icon button" />
        </div>
        <StateStrip variants={[
          { cap: "Default", piece: { id: "small", label: "PLAY" } },
          { cap: "Hover / Focus", piece: { id: "small", label: "PLAY", baseState: "hover" } },
          { cap: "Pressed", piece: { id: "small", label: "PLAY", baseState: "pressed" } },
          { cap: "Disabled", piece: { id: "small", label: "PLAY", baseState: "disabled" } },
          // Button · Locked pose parked by the owner (2026-08-15) — restore by uncommenting:
          // { cap: "Locked", piece: { id: "small", label: "", icon: STOCK_ICONS.lock, baseState: "disabled" } },
        ]} />
      </Sec>

      {/* ── 04 · choice controls ── */}
      <Sec n="02" title="Choice Controls" note="Checks, radios and switches share the shell. Toggles flip on click and on Enter or Space.">
        <div className="kp-tray kp-axis">
          <Piece id="checkbox" caption="Checkbox" />
          <Piece id="radio" caption="Radio" />
          <Piece id="toggle" caption="Toggle · On" value={1} />
          <Piece id="toggle" caption="Toggle · Off" value={0} />
          <Piece id="orb" caption="Glow orb · lit" value={1} scale={0.56} />
          <Piece id="orb" caption="Glow orb · off" value={0} scale={0.56} />
        </div>
        <StateStrip variants={[
          { cap: "Off", piece: { id: "toggle", value: 0 } },
          { cap: "On", piece: { id: "toggle", value: 1 } },
          { cap: "Hover / Focus", piece: { id: "toggle", value: 1, baseState: "hover" } },
          { cap: "Disabled", piece: { id: "toggle", value: 1, baseState: "disabled" } },
        ]} />
      </Sec>

      {/* ── 05 · fields ── */}
      <Sec n="03" title="Fields" note="Input wells sunk into the same material. The dropdown opens in place.">
        <div className="kp-tray">
          <Piece id="input" caption="Input · click and type" scale={0.78} />
          <Piece id="dropdown" caption="Dropdown" />
          {/* the open menu overflows its svg — give the caption room below */}
          <div className="kp-tall"><Piece id="dropdown" caption="Dropdown · Open" baseState="pressed" /></div>
        </div>
        <StateStrip variants={[
          { cap: "Empty", piece: { id: "input", scale: 0.46 } },
          { cap: "Filled", piece: { id: "input", label: "player_one", scale: 0.46 } },
          { cap: "Hover / Focus", piece: { id: "input", baseState: "hover", scale: 0.46 } },
          { cap: "Disabled", piece: { id: "input", baseState: "disabled", scale: 0.46 } },
        ]} />
      </Sec>

      {/* ── 06 · sliders & progress ── */}
      <Sec n="04" title="Sliders & Progress" note="Shared range rules: the thumb stays inside the shell at both endpoints and the fill ends at the thumb's center. Progress replays to its configured value on click or Enter. The emblem bar docks a silhouette-aware socket on the track — swap its glyph in Component content; the segmented meter snaps to whole cells or slides one fill under the notches.">
        <div className="kp-tray">
          <Piece id="slider" caption="Slider" value={0.62} />
          <Piece id="progress" caption="Progress" value={0.62} ambient />
        </div>
        <div className="kp-tray">
          <Piece id="emblembar" caption="Emblem bar · docked socket" value={0.55} ambient />
        </div>
        <div className="kp-tray">
          <Piece id="segbar" caption="Segmented · snaps to cells" value={0.62} ambient />
          <Piece id="segbar" caption="Segmented · 8" value={0.55} bar={{ segments: 8 }} ambient />
        </div>
        <div className="kp-subhead">Genre essentials</div>
        <p className="kp-note">Every genre speaks this kit: the fighting VS bar drains toward its candy medallion, the sandbox hotbar carries the material into slot form. Action &amp; shooters lean on the reticle, ammo and mini-map; RPGs on progress, data rows, slots and the reward track; strategy on resources and panels; racing has its own chapter; timers and meters cover survival, sims and sports.</p>
        <div className="kp-row">
          <Piece id="vsbar" caption="VS health bar · fighting" value={0.72} ambient scale={0.5} />
          <Piece id="hotbar" caption="Hotbar · sandbox" value={0.25} ambient scale={0.5} />
        </div>
        <div className="kp-subhead">Card battler</div>
        <p className="kp-note">Every set ships its back as a pair — standard and premium foil (the shine sweep) — and the same back becomes a deck cover the moment it takes a nameplate. Packs carry the crimped foil caps; click one to tear it open with the themed burst.</p>
        <div className="kp-tray">
          <Piece id="cardback" caption="Card back · standard" scale={0.42} />
          <Piece id="cardback" caption="Card back · premium foil" scale={0.42} shine />
          <Piece id="cardback" caption="Deck cover · nameplate" label="STARTER · 30" scale={0.42} />
          <Piece id="pack" caption="Card pack · click to tear open" scale={0.42} />
        </div>
        <StateStrip variants={[
          { cap: "Min", piece: { id: "slider", value: 0, scale: 0.26 } },
          { cap: "25%", piece: { id: "slider", value: 0.25, scale: 0.26 } },
          { cap: "Mid", piece: { id: "slider", value: 0.5, scale: 0.26 } },
          { cap: "75%", piece: { id: "slider", value: 0.75, scale: 0.26 } },
          { cap: "Max", piece: { id: "slider", value: 1, scale: 0.26 } },
        ]} />
      </Sec>

      {/* ── 07 · feedback ── */}
      <Sec n="05" title="Feedback" note="Counts, awards and callouts. A badge awards on click.">
        <div className="kp-tray">
          <Piece id="badge" caption="Badge · Count" label="12" />
          <Piece id="badge" caption="Badge · Awarded" baseState="pressed" />
          <Piece id="chip" caption="Chip" />
        </div>
      </Sec>

      {/* ── 08 · navigation ── */}
      <Sec n="06" title="Navigation" note="Tabs, a segmented switch and the three-slice banner. Caps never distort; text never enters the tails.">
        <div className="kp-tray">
          <Piece id="tab" caption="Tab" label="HOME" />
          <Piece id="tabback" caption="Back tab" label="BACK" />
          <Piece id="tab" caption="Tab" label="STORE" />
          <Piece id="segment" caption="Segmented control" value={1} />
        </div>
        <StateStrip variants={[
          { cap: "Default", piece: { id: "tab", label: "TAB" } },
          { cap: "Hover", piece: { id: "tab", label: "TAB", baseState: "hover" } },
          { cap: "Selected", piece: { id: "tab", label: "TAB", baseState: "pressed" } },
          { cap: "Disabled", piece: { id: "tab", label: "TAB", baseState: "disabled" } },
        ]} />
        <div className="kp-subhead">Banner / Stretch</div>
        <div className="kp-tray kp-banners">
          <div>
            <SliceDemo cfg={applyKitTextFill(applyKitDesign(cfg, kitDesigns.header), kitTextFill.header)} label={label} fit={380} ruler />
            <div className="kp-cap"><span>Standard</span></div>
          </div>
          <div>
            <SliceDemo cfg={applyKitTextFill(applyKitDesign(cfg, kitDesigns.header), kitTextFill.header)} label="CONTINUE YOUR ADVENTURE" size="l" fit={520} ruler />
            <div className="kp-cap"><span>Wide</span></div>
          </div>
        </div>
        <div className="kp-tray">
          <Piece id="header" caption="Banner · editable" />
        </div>
        <div className="kp-meta">
          <span>Fixed caps (dashed magenta)</span><span>Stretch region between caps</span><span>Text-safe area (dashed green)</span>
          <span>Min width ≈ 2× cap</span><span>Recommended label ≤ 18 chars</span><span>Tested to 29 chars (Wide)</span>
        </div>
      </Sec>

      {/* ── 09 · icons ── */}
      <Sec n="07" title="Icons" anchor="icons" note="The functional glyph set, embedded with the same rules everywhere: bare, as icon buttons, and as themed medallions.">
        <div className="kp-icons">
          {ICON_SET.map((ic) => (
            <figure className="kp-icon" key={ic.key} title={ic.name}>
              <span dangerouslySetInnerHTML={{ __html: previewSvg(STOCK_ICONS[ic.key], 27) }} />
              <figcaption>{ic.name}</figcaption>
            </figure>
          ))}
        </div>
        <div className="kp-links">
          <a target="_blank" rel="noreferrer" href="https://lucide.dev/icons/">Lucide icon library ↗</a>
        </div>
        <div className="kp-tray">
          <Piece id="iconbtn" caption="Icon button · Play" icon={STOCK_ICONS.play} />
          <Piece id="iconbtn" caption="Icon button · Settings" icon={STOCK_ICONS.gear} />
          <Piece id="iconbtn" caption="Icon button · Close" icon={STOCK_ICONS.close} />
          <Piece id="badge" caption="Medallion · Trophy" baseState="pressed" icon={STOCK_ICONS.trophy} />
          <Piece id="badge" caption="Medallion · Lock" baseState="pressed" icon={STOCK_ICONS.lock} />
          <Piece id="badge" caption="Medallion · Warning" baseState="pressed" icon={STOCK_ICONS.warning} />
        </div>
      </Sec>

      {/* ── 10 · game HUD & data ── */}
      <Sec n="08" title="Game HUD & Data" note="Counters, rows, slots and rings. Every icon, portrait and value is a replaceable slot.">
        <div className="kp-subhead">HUD counters</div>
        <div className="kp-tray">
          <Piece id="resource" caption="Compact" label="1,250" scale={0.4} />
          <Piece id="resource" caption="Current / max" label="3" max="5" icon={STOCK_ICONS.heart} scale={0.4} />
          <Piece id="resource" caption="With add" label="980" addBtn scale={0.4} />
          <Piece id="resource" caption="Low resource" label="0" max="5" icon={STOCK_ICONS.heart} baseState="hover" scale={0.4} />
          <Piece id="resource" caption="Disabled" label="—" baseState="disabled" scale={0.4} />
        </div>
        <div className="kp-subhead">Data rows</div>
        <div className="kp-tray">
          <Piece id="datarow" caption="Standard" scale={0.42} value={0.4} />
          <Piece id="datarow" caption="Selected" baseState="hover" value={0.4} scale={0.42} />
        </div>
        <div className="kp-tray">
          <Piece id="datarow" caption="Locked" overlay="locked" baseState="disabled" label="???" sub="Reach level 20" value={0} scale={0.42} />
          <Piece id="datarow" caption="Completed" overlay="check" label="Daily Login" sub="Reward ready" value={1} scale={0.42} />
        </div>
        <div className="kp-subhead">Item slots — one family, stackable status overlays</div>
        <div className="kp-slotgrid">
          <Piece id="slot" caption="Empty" icon={null} scale={0.38} />
          <Piece id="slot" caption="Filled" icon={STOCK_ICONS.gem} scale={0.38} />
          <Piece id="slot" caption="Count" icon={STOCK_ICONS.gem} overlay="count:14" scale={0.38} />
          <Piece id="slot" caption="Level" icon={STOCK_ICONS.user} overlay="level:12" scale={0.38} />
          <Piece id="slot" caption="Equipped" icon={STOCK_ICONS.gem} overlay="equipped" scale={0.38} />
          <Piece id="slot" caption="New" icon={STOCK_ICONS.bag} overlay="new" scale={0.38} />
          <Piece id="slot" caption="Claimable" icon={STOCK_ICONS.gem} overlay="claimable" baseState="hover" scale={0.38} />
          <Piece id="slot" caption="Cooldown" icon={STOCK_ICONS.gem} overlay="cooldown:12s" scale={0.38} />
          <Piece id="slot" caption="Locked" icon={STOCK_ICONS.gem} overlay="locked" scale={0.38} />
        </div>
        <Meta items={["Same footprint per size", "icon centered at 60%", "badges pin to corners", "veil states dim the well only", "captions always below"]} />
        <div className="kp-subhead">Touch controls</div>
        <div className="kp-tray">
          <Piece id="joystick" caption="Joystick · drag me" scale={0.44} />
          <Piece id="joystick" caption="Disabled" baseState="disabled" scale={0.44} />
        </div>
        <div className="kp-meta"><span>Knob springs back on release</span><span>Deflection clamps to the travel ring</span><span>data-stick carries the geometry for engine bindings</span></div>
        {/* staging-bay resident — hidden from the public until released */}
        {kitVisible("gearicon", releases, false) && (<>
          <div className="kp-subhead">Settings gear</div>
          <div className="kp-tray">
            <Piece id="gearicon" caption="Settings gear" scale={0.5} />
            <Piece id="gearicon" caption="Disabled" baseState="disabled" scale={0.5} />
          </div>
          <div className="kp-meta"><span>The cog itself wears the kit — face, bevel and extrusion wrap the silhouette</span><span>No shell box; the hub is a recessed well</span><span>A real button — hover and press work</span></div>
        </>)}
        {kitVisible("trophyicon", releases, false) && (<>
          <div className="kp-subhead">Trophy</div>
          <div className="kp-tray">
            <Piece id="trophyicon" caption="Trophy" scale={0.5} />
            <Piece id="trophyicon" caption="Gold" overlay="gold" scale={0.5} />
            <Piece id="trophyicon" caption="Silver" overlay="silver" scale={0.5} />
            <Piece id="trophyicon" caption="Bronze" overlay="bronze" scale={0.5} />
            <Piece id="trophyicon" caption="Disabled" baseState="disabled" scale={0.5} />
          </div>
          <div className="kp-meta"><span>The prize cup wears the kit — crescent handles carry real daylight</span><span>Podium finishes: gold, silver and bronze keep the kit's shapes but contrast its palette — pick them in the Board's assets tray too</span><span>A real button — hover and press work; the state glow rings the whole silhouette</span></div>
        </>)}
        {kitVisible("gifticon", releases, false) && (<>
          <div className="kp-subhead">Gift box</div>
          <div className="kp-tray">
            <Piece id="gifticon" caption="Gift box" scale={0.5} />
            <Piece id="gifticon" caption="Disabled" baseState="disabled" scale={0.5} />
          </div>
          <div className="kp-meta"><span>A 3/4 gift box wearing the kit whole — lid slab, bow loops, receding side</span><span>Ribbon, lid shadow and bow glint ride as overlays on the kit's own material</span><span>A real button — hover and press work</span></div>
        </>)}
        {kitVisible("firebutton", releases, false) && (<>
          <div className="kp-subhead">Fire button</div>
          <div className="kp-tray">
            <Piece id="firebutton" caption="Blade armed" scale={0.5} />
            <Piece id="firebutton" caption="Volt armed" value={0.3} scale={0.5} />
            <Piece id="firebutton" caption="Pressed" baseState="pressed" scale={0.5} />
            <Piece id="firebutton" caption="Disabled" baseState="disabled" scale={0.5} />
          </div>
          <div className="kp-meta"><span>The joystick pad's committed sibling — a big dome nearly filling the well, ringed by danger ticks</span><span>The dome wears the armed weapon's icon; the rest of the armory fans out as its own mini-buttons, a quick-select carousel — Value cycles what's armed, Icons swaps the glyph</span><span>Pressed sinks the dome — a real button</span></div>
        </>)}
        <div className="kp-subhead">Combat & spatial HUD</div>
        <div className="kp-tray kp-axis">
          <Piece id="reticle" caption="Reticle · ring" scale={0.55} />
          <Piece id="reticle" caption="Reticle · brackets" overlay="brackets" scale={0.55} />
          <Piece id="minimap" caption="Mini-map · compass" scale={0.46} />
          <Piece id="minimap" caption="Mini-map · radar" overlay="square" scale={0.46} />
          <Piece id="ammo" caption="Ammo counter" label="24" max="90" scale={0.5} />
          <Piece id="lives" caption="Lives" label="3" max="5" scale={0.72} />
          <Piece id="joystick" caption="Joystick · ghost overlay" overlay="ghost" scale={0.44} />
        </div>
        <div className="kp-meta"><span>Reticles and lives are shell-free spatial UI</span><span>Badges double as spatial markers — pair one with the pulse ring from Onboarding & Map</span><span>The overlay stick is stroke-and-glass — designed to sit on live gameplay</span></div>
        <div className="kp-subhead">Celebration numbers</div>
        <div className="kp-tray">
          <Piece id="bignum" caption="Big number · full type treatment, no container" label="+12,450" scale={0.6} />
        </div>
        <div className="kp-subhead">Progress rings & timers — click one to replay it</div>
        <div className="kp-ringrow">
          <Piece id="ring" size="l" caption="Standard" value={0.62} scale={0.56} />
          <Piece id="ring" size="l" caption="Countdown" value={0.72} label="0:42" scale={0.56} ambient />
          <Piece id="ring" size="l" caption="Nearly done" value={0.94} scale={0.56} />
          <Piece id="ring" size="l" caption="Complete" value={1} label="✓" scale={0.56} />
          <Piece id="ring" size="l" caption="Expired" value={0} label="0:00" baseState="disabled" scale={0.56} />
        </div>
        <div className="kp-subhead">Timers — three voices for the same clock; every one ticks live</div>
        <div className="kp-tray">
          <Piece id="flipclock" caption="Flip countdown · running" value={0.62} scale={0.48} ambient />
          <Piece id="flipclock" caption="Flip countdown · urgent" value={0.13} scale={0.48} />
          <Piece id="flipclock" caption="Flip countdown · event" label="07:11:38" scale={0.42} />
        </div>
        <div className="kp-tray">
          <Piece id="stopwatch" caption="Stopwatch · running" value={0.62} scale={0.52} ambient />
          <Piece id="stopwatch" caption="Stopwatch · urgent" value={0.13} scale={0.52} />
          <Piece id="timerdigits" caption="Timer digits · pure type, no container" value={0.75} scale={0.5} ambient />
        </div>
        <div className="kp-meta"><span>Time derives from the value — hosts tick the value, the readout follows</span><span>Click any timer to replay its drain</span><span>Below 25% remaining, digits, hand and tiles switch to the alarm tint</span></div>
        <div className="kp-subhead">Racing HUD — click a gauge to rev it</div>
        <div className="kp-tray kp-axis kp-race">
          <Piece id="speedo" caption="Speedometer · classic dial" value={0.62} scale={0.52} ambient />
          <Piece id="speedo2" caption="Speedometer · HUD segments" value={0.62} scale={0.52} ambient />
          <Piece id="tacho" caption="Rev meter · green to red" value={0.62} scale={0.52} ambient />
          <Piece id="circuit" caption="Kazuri Ring · live positions" scale={0.56} />
        </div>
        <div className="kp-tray kp-axis kp-race">
          <Piece id="leaderboard" caption="Position list · Top 5" scale={0.52} />
          <Piece id="laptimes" caption="Lap comparison · you vs rival" scale={0.52} />
          <Piece id="telemetry" caption="Telemetry · throttle, brake, speed" scale={0.52} />
        </div>
        <div className="kp-tray kp-axis kp-race">
        </div>
        <div className="kp-meta"><span>Speed derives from the value — 0 to 280 across the sweep</span><span>Past 78% the dial enters the red zone and the readout takes the alarm tint</span><span>Kazuri Ring is drawn as a dimensional ribbon — elevation reads from the extruded walls</span><span>Graphs carry live engine data in real games — the traces here are specimens</span></div>
      </Sec>

      <Sec n="09" title="System Chrome" note="The connective tissue every game ships — the dialog frame, confirmations, tooltips and input prompts, all in the kit material. Key prompts stretch like real keycaps; pad buttons carry console color rings.">
        <div className="kp-tray">
          <Piece id="dialog" caption="Dialog" scale={0.4} />
          <Piece id="toast" caption="Toast" scale={0.52} />
          <Piece id="tooltip" caption="Tooltip" scale={0.56} />
        </div>
        <div className="kp-tray">
          <Piece id="keycap" caption="Key · E" scale={0.54} />
          <Piece id="keycap" label="SPACE" caption="Key · SPACE" scale={0.54} />
          <Piece id="padbtn" caption="Pad · A" scale={0.54} />
          <Piece id="padbtn" label="B" caption="Pad · B" scale={0.54} />
          <Piece id="padbtn" label="X" caption="Pad · X" scale={0.54} />
          <Piece id="padbtn" label="Y" caption="Pad · Y" scale={0.54} />
        </div>
        <div className="kp-tray">
          <Piece id="listmenu" caption="List menu" scale={0.5} />
          <Piece id="scrollbar" caption="Scrollbar" value={0.3} scale={0.5} />
          <Piece id="steps" caption="Step indicator" value={0.42} scale={0.56} />
          <Piece id="pagedots" caption="Page dots" value={0.25} scale={0.62} />
          <Piece id="spinner" caption="Spinner" scale={0.6} />
        </div>
        <div className="kp-tray">
          <Piece id="loadbar" caption="Loading bar" value={0.62} scale={0.5} />
          <Piece id="setrow" caption="Settings row" value={0.7} scale={0.5} />
        </div>
        <div className="kp-tray">
          <Piece id="searchfield" caption="Search field" scale={0.5} />
          <Piece id="notifydot" caption="Notification badge" value={0.3} scale={0.54} />
          {kitVisible("countbadge", releases, false) && <Piece id="countbadge" caption="Count badge" value={0.03} scale={0.8} />}
          <Piece id="avatarframe" caption="Avatar frame" value={0.12} scale={0.54} />
        </div>
        <div className="kp-tray">
          <Piece id="nameplate" caption="Nameplate" scale={0.5} />
          <Piece id="currency" caption="Currency pill" value={0.125} scale={0.54} />
          <Piece id="stepper" caption="Stepper" value={0.62} scale={0.5} />
        </div>
        <div className="kp-tray">
          <Piece id="buffframe" caption="Buff frame" value={0.65} scale={0.54} />
          <Piece id="cooldown" caption="Cooldown radial" value={0.4} scale={0.56} />
        </div>
      </Sec>

      <Sec n="10" title="RPG & MMO" note="The role-playing vocabulary: vitals, quests, dialogue, inventory and progression. Rarity tiers ship with genre-standard names and hues, and they're yours to retune — rename and recolor all five under Color → Rarity tiers in the editor; everything else follows the kit's roles.">
        <div className="kp-subhead">Vitals & progression</div>
        <div className="kp-tray kp-axis">
          <Piece id="healthglobe" caption="Health globe" value={0.72} scale={0.52} />
          <Piece id="healthglobe" caption="Low health" value={0.2} scale={0.52} />
          <Piece id="manarails" caption="Mana & stamina" value={0.66} scale={0.5} />
          <Piece id="xpbar" caption="XP bar · level notches" value={0.45} scale={0.46} />
        </div>
        <div className="kp-subhead">Quests & dialogue</div>
        <div className="kp-tray kp-axis">
          <Piece id="questpanel" caption="Quest tracker" value={0.6} scale={0.44} />
          <Piece id="dialoguebox" caption="Dialogue box" scale={0.44} />
          <Piece id="choicelist" caption="Dialogue choices" value={0} scale={0.44} />
        </div>
        <div className="kp-subhead">Inventory & party</div>
        <div className="kp-tray kp-axis">
          <Piece id="invgrid" caption="Inventory grid" value={0.42} scale={0.46} />
          <Piece id="partyframe" caption="Party frame" value={0.78} scale={0.5} />
          <Piece id="partyframe" caption="Party · hurt" value={0.24} scale={0.5} />
          <Piece id="compass" caption="Compass ribbon · swings live" value={0.08} scale={0.48} ambient />
        </div>
        <div className="kp-subhead">Rarity — one frame, five tiers</div>
        <div className="kp-tray">
          <Piece id="rarityframe" caption="Common" value={0} scale={0.46} />
          <Piece id="rarityframe" caption="Uncommon" value={0.25} scale={0.46} />
          <Piece id="rarityframe" caption="Rare" value={0.5} scale={0.46} />
          <Piece id="rarityframe" caption="Epic" value={0.75} scale={0.46} />
          <Piece id="rarityframe" caption="Legendary" value={1} scale={0.46} />
        </div>
        <div className="kp-subhead">Equipment sockets — the ghost shows what belongs</div>
        <div className="kp-tray">
          <Piece id="equipslot" caption="Head" icon={STOCK_ICONS.helmet} scale={0.46} />
          <Piece id="equipslot" caption="Chest" icon={STOCK_ICONS.shirt} scale={0.46} />
          <Piece id="equipslot" caption="Hands" icon={STOCK_ICONS.hand} scale={0.46} />
          <Piece id="equipslot" caption="Feet" icon={STOCK_ICONS.boots} scale={0.46} />
          <Piece id="equipslot" caption="Weapon" icon={STOCK_ICONS.sword} scale={0.46} />
          <Piece id="equipslot" caption="Offhand" icon={STOCK_ICONS.shield} scale={0.46} />
        </div>
        <div className="kp-subhead">Skill tree & combat feedback</div>
        <div className="kp-tray kp-axis">
          <Piece id="skillnode" caption="Available" scale={0.5} />
          <Piece id="skillnode" caption="Learned" overlay="learned" scale={0.5} />
          <Piece id="skillnode" caption="Locked" overlay="locked" scale={0.5} />
          <Piece id="dmgnumber" caption="Hit" value={0.35} scale={0.5} />
          <Piece id="dmgnumber" caption="Critical" value={0.9} scale={0.5} />
        </div>
        <div className="kp-tray">
          <Piece id="loottag" caption="Loot tag · rare" value={0.5} scale={0.5} />
          <Piece id="loottag" caption="Loot tag · legendary" value={1} label="Dawnbreaker" scale={0.5} />
        </div>
        <Meta items={["Liquid and fills follow the Glow role", "mana/stamina/HP hues are genre semantics", "value scrubs fill, heading, tier and selection", "the lit skill stub is the learned path", "damage numbers are shell-free spatial type"]} />
      </Sec>

      <Sec n="11" title="Shooter & Action" note="The FPS/brawler vocabulary: aim, feedback, loadout and objectives. Spatial pieces (crosshair, markers, arcs) are shell-free and carry a dark understroke so they read on live footage. The weapon wheel follows your pointer's angle — hold and point, like the real thing.">
        <div className="kp-subhead">Aim & feedback</div>
        <div className="kp-tray kp-axis">
          <Piece id="crosshair" caption="Crosshair" value={0.25} scale={0.56} />
          <Piece id="crosshair" caption="Wide spread" value={0.85} scale={0.56} />
          <Piece id="crosshair" caption="Dot" overlay="dot" scale={0.56} />
          <Piece id="hitmarker" caption="Hit" value={0.4} scale={0.56} />
          <Piece id="hitmarker" caption="Critical" value={0.9} scale={0.56} />
          <Piece id="dmgarc" caption="Damage direction" value={0.86} scale={0.5} />
        </div>
        <div className="kp-subhead">Loadout</div>
        <div className="kp-tray kp-axis">
          <Piece id="weaponwheel" caption="Weapon wheel · point to arm" value={0} scale={0.5} />
          <Piece id="equipselector" caption="Equipment selector" value={0.34} scale={0.52} />
        </div>
        <div className="kp-tray kp-axis">
          <Piece id="magazine" caption="Magazine" value={0.66} scale={0.54} />
          <Piece id="magazine" caption="Last rounds" value={0.16} scale={0.54} />
          <Piece id="streakmeter" caption="Streak meter" value={0.64} scale={0.5} />
          <Piece id="streakmeter" caption="Ignited" value={1} scale={0.5} />
        </div>
        <div className="kp-subhead">Objectives & rounds</div>
        <div className="kp-tray kp-axis">
          <Piece id="killfeed" caption="Kill feed" scale={0.5} />
          <Piece id="killfeed" caption="You — flashed" baseState="hover" label="YOU" sub="NOVA_KNIGHT" scale={0.5} />
        </div>
        <div className="kp-tray kp-axis">
          <Piece id="waypoint" caption="Waypoint" value={0.3} scale={0.54} />
          <Piece id="capturemeter" caption="Capture point" value={0.55} scale={0.54} />
          <Piece id="respawn" caption="Respawn timer · counts down" value={0.6} scale={0.5} ambient />
        </div>
        <Meta items={["Crosshair and marker weight ride the Icon stroke control", "value scrubs spread, rounds, streak, capture and direction", "the wheel's value is the pointer's angle in play mode", "crit and alarm reds are semantic, like rarity hues", "every readout keeps the hard-shadow legibility rule"]} />
      </Sec>

      <Sec n="12" title="Casual & Mobile" note="The free-to-play vocabulary: results, saga maps, lives and boosters, spins and daily rewards. Gold, hearts-red and ready-green are genre semantics; everything else follows the kit's roles. Click the stars to replay the pop; click the wheel to throw a spin.">
        <div className="kp-subhead">Results & celebration</div>
        <div className="kp-tray kp-axis">
          <Piece id="starrating" caption="Three stars · click to replay" value={1} scale={0.56} />
          <Piece id="starrating" caption="Two stars" value={0.67} scale={0.56} />
          <Piece id="starrating" caption="One star" value={0.34} scale={0.56} />
          <Piece id="combo" caption="Combo" value={0.3} scale={0.5} />
          <Piece id="combo" caption="Big combo" value={0.85} scale={0.5} />
        </div>
        <div className="kp-subhead">Saga map</div>
        <div className="kp-tray kp-axis">
          <Piece id="levelnode" caption="Current · calls you" label="12" scale={0.52} />
          <Piece id="levelnode" caption="Completed" label="11" overlay="stars:3" scale={0.52} />
          <Piece id="levelnode" caption="Locked" label="13" overlay="locked" scale={0.52} />
          <Piece id="pathconnector" caption="Path · progress" value={0.6} scale={0.52} />
        </div>
        <div className="kp-subhead">Economy & sessions</div>
        <div className="kp-tray kp-axis">
          <Piece id="heartmeter" caption="Heart meter · refill" value={0.6} scale={0.5} />
          <Piece id="energymeter" caption="Energy meter" value={0.8} scale={0.5} />
        </div>
        <div className="kp-tray kp-axis">
          <Piece id="movecounter" caption="Move counter" value={0.8} scale={0.5} />
          <Piece id="movecounter" caption="Last moves" value={0.12} scale={0.5} />
          <Piece id="booster" caption="Booster · ×4" value={0.4} scale={0.5} />
          <Piece id="booster" caption="Booster · free" value={0} icon={STOCK_ICONS.gem} scale={0.5} />
          <Piece id="pricebtn" caption="Price button" scale={0.5} />
        </div>
        <div className="kp-subhead">Rewards</div>
        <div className="kp-tray kp-axis">
          <Piece id="spinwheel" caption="Spin wheel · click to throw" value={0.0625} scale={0.46} />
          <Piece id="dailycell" caption="Today" label="DAY 4" scale={0.5} />
          <Piece id="dailycell" caption="Claimed" label="DAY 3" overlay="check" scale={0.5} />
          <Piece id="dailycell" caption="Tomorrow" label="DAY 5" overlay="locked" scale={0.5} />
        </div>
        {/* staging-bay resident — the whole block (subhead included) hides
            from the public until the owner releases the component */}
        {kitVisible("orderticket", releases, false) && (<>
          <div className="kp-subhead">Kitchen & orders</div>
          <div className="kp-tray kp-axis">
            <Piece id="orderticket" caption="Order ticket" value={0.62} scale={0.5} />
            <Piece id="orderticket" caption="Urgent · pulses" value={0.1} scale={0.5} />
            <Piece id="orderticket" caption="Served" value={0.62} baseState="disabled" scale={0.5} />
          </div>
        </>)}
        <Meta items={["Gold, hearts-red and ready-green are genre semantics", "stars and the spin ride the tween engine", "cells keep the negative-space canon", "counts and timers wear the adaptive ink rule", "level nodes and boosters are real buttons — hover and press work"]} />
      </Sec>

      {/* ── 13 · rewards & chests — the staging-bay pack: the whole Sec
          hides until at least one resident is visible to this viewer ── */}
      {(["chest", "giftbox", "rewardcard", "qtybadge", "rewardtray", "claimbtn", "chestpanel"] as KitComponentId[]).some((rid) => kitVisible(rid, releases, false)) && (
      <Sec n="13" title="Rewards & Chests" note="The economy's happy endings: chests on the small→large ladder plus Premium and Event trims, gifts, reveals, trays and claims. Chest and gift bodies wear the kit's material; tier trims, gold ribbons and ready-green are genre semantics. The reward card's aura walks the kit's rarity tiers.">
        {kitVisible("chest", releases, false) && (<>
          <div className="kp-subhead">The chest ladder</div>
          <div className="kp-tray kp-axis">
            <Piece id="chest" caption="Small · wood" slots={{ tier: "Wood", variant: "Plain" }} value={0.4} scale={0.5} />
            <Piece id="chest" caption="Medium · iron" slots={{ tier: "Iron", variant: "Plain" }} value={0.4} scale={0.5} />
            <Piece id="chest" caption="Large · gold" slots={{ tier: "Gold", variant: "Plain" }} value={0.4} scale={0.5} />
            <Piece id="chest" caption="Premium" slots={{ tier: "Premium", variant: "Plain" }} value={0.4} scale={0.5} />
            <Piece id="chest" caption="Event" slots={{ tier: "Event", variant: "Plain" }} value={0.4} scale={0.5} />
          </div>
          <div className="kp-subhead">Gates & states</div>
          <div className="kp-tray kp-axis">
            <Piece id="chest" caption="Timed · counting down" value={0.55} scale={0.5} />
            <Piece id="chest" caption="Ready to open · pulses" value={0} scale={0.5} />
            <Piece id="chest" caption="Locked · needs a key" slots={{ variant: "Locked" }} scale={0.5} />
            <Piece id="chest" caption="Opened" baseState="disabled" scale={0.5} />
          </div>
        </>)}
        {kitVisible("chestpanel", releases, false) && (<>
          <div className="kp-subhead">The ceremony</div>
          <div className="kp-tray kp-axis">
            <Piece id="chestpanel" caption="Chest-opening panel" scale={0.44} />
          </div>
        </>)}
        {(kitVisible("rewardcard", releases, false) || kitVisible("qtybadge", releases, false)) && (<>
          <div className="kp-subhead">Reveals</div>
          <div className="kp-tray kp-axis">
            {kitVisible("rewardcard", releases, false) && (<>
              <Piece id="rewardcard" caption="Reward reveal · rare" value={0.5} scale={0.5} />
              <Piece id="rewardcard" caption="Legendary" value={1} scale={0.5} />
              <Piece id="rewardcard" caption="Mystery · pre-reveal" slots={{ kind: "Mystery" }} scale={0.5} />
            </>)}
            {kitVisible("qtybadge", releases, false) && <Piece id="qtybadge" caption="Quantity badge" scale={0.5} />}
          </div>
        </>)}
        {(kitVisible("rewardtray", releases, false) || kitVisible("claimbtn", releases, false)) && (<>
          <div className="kp-subhead">Trays & claims</div>
          <div className="kp-tray kp-axis">
            {kitVisible("rewardtray", releases, false) && (<>
              <Piece id="rewardtray" caption="Multiple-reward tray · revealing" value={0.5} scale={0.46} />
              <Piece id="rewardtray" caption="Reward summary · all revealed" value={1} scale={0.46} />
            </>)}
          </div>
          <div className="kp-tray kp-axis">
            {kitVisible("claimbtn", releases, false) && (<>
              <Piece id="claimbtn" caption="Claim all" scale={0.5} />
              <Piece id="claimbtn" caption="Double by ad" slots={{ mode: "2x by ad" }} scale={0.5} />
            </>)}
          </div>
        </>)}
        {(kitVisible("giftbox", releases, false)) && (<>
          <div className="kp-subhead">Gifts & milestones</div>
          <div className="kp-tray kp-axis">
            <Piece id="giftbox" caption="Gift box" value={0.4} scale={0.5} />
            <Piece id="giftbox" caption="Daily gift · ready" slots={{ tag: "Daily" }} value={1} scale={0.5} />
            <Piece id="giftbox" caption="Surprise gift" slots={{ tag: "Surprise" }} value={0.4} scale={0.5} />
            <Piece id="giftbox" caption="Milestone · 70%" slots={{ tag: "Milestone" }} value={0.7} scale={0.5} />
            <Piece id="giftbox" caption="Claimed" baseState="disabled" scale={0.5} />
          </div>
        </>)}
        <Meta items={["Chest bodies and gift boxes are the kit's candy — they restyle with everything else", "tier trims, gold ribbons and ready-green are genre semantics", "the reward card reads the kit's rarity tiers", "timers, reveals and readiness ride the value slider", "chests, gifts, cards and claims are real buttons"]} />
      </Sec>
      )}

      <Sec n="14" title="Strategy & Social" note="The command layer and the people layer: production, tech, turns and scores; friends, chat, emotes, clans and the season pass. Team hues and premium gold are semantics; the emote wheel picks instantly — social is fast.">
        <div className="kp-subhead">Command & production</div>
        <div className="kp-tray kp-axis">
          <Piece id="buildqueue" caption="Build queue" value={0.55} scale={0.5} />
          <Piece id="unitplate" caption="Unit plate" value={0.82} scale={0.5} />
          <Piece id="popmeter" caption="Population" value={0.84} scale={0.5} />
          <Piece id="popmeter" caption="Near cap" value={0.95} scale={0.5} />
        </div>
        <div className="kp-tray kp-axis">
          <Piece id="techcard" caption="Researchable" scale={0.48} />
          <Piece id="techcard" caption="Researched" label="KEEN SIGHT" icon={STOCK_ICONS.crosshair} overlay="done" scale={0.48} />
          <Piece id="techcard" caption="Locked" label="???" overlay="locked" scale={0.48} />
          <Piece id="endturn" caption="End turn · timer arc" value={0.7} scale={0.52} />
        </div>
        <div className="kp-subhead">Match & score</div>
        <div className="kp-tray kp-axis">
          <Piece id="scorebug" caption="Score bug" value={0.52} scale={0.5} />
        </div>
        <div className="kp-subhead">Friends & clans</div>
        <div className="kp-tray kp-axis">
          <Piece id="friendrow" caption="Online · joinable" value={1} scale={0.5} />
          <Piece id="friendrow" caption="Offline" label="STORM_BREW" value={0} scale={0.5} />
          <Piece id="clancrest" caption="Clan crest" scale={0.5} />
        </div>
        <div className="kp-tray kp-axis">
          <Piece id="chatbubble" caption="Chat bubble" scale={0.5} />
          <Piece id="chatbubble" caption="Long message · grows" label="anyone up for one more round before the season resets? need two for the weekly" scale={0.5} />
          <Piece id="emotewheel" caption="Emote wheel · click to pick" value={0} scale={0.48} />
        </div>
        <div className="kp-subhead">Season pass & honors</div>
        <div className="kp-tray kp-axis">
          <Piece id="seasontrack" caption="Season track · free / premium" value={0.5} scale={0.48} />
          <Piece id="achievetoast" caption="Achievement toast" scale={0.5} />
        </div>
        <Meta items={["Team blue/red and premium gold are semantics", "the emote wheel selects instantly — no spin", "the end-turn arc is the turn timer", "score bug and instruments keep the dark-well rule", "plates, cards, crests and rows are real buttons"]} />
      </Sec>

      </>}</Deferred>
      <Chapter n="03" id="parts" label="Build Parts" blurb="The construction vocabulary: parts, containers, assemblies and motion — with downloads." />
      <Deferred estH={6400} eager={bootN >= 2} onLive={bootAdvance}>{() => <>

      {/* ── 14 · build parts ── */}
      <Sec n="01" title="Build Parts" note="Everything in the kit is built from these. Each part opens the layer that produces it in the editor. Downloads are layered SVGs with named groups and nine-slice metadata.">
        {viewer ? <div className="kp-viewnote">Shared kit — view only. Ask the owner for the downloads.</div> : <ExportMenu actions={exportActions} preferId="svg" />}
        <button className="kp-share" onClick={() => void shareKit()} title="Copy a link that opens this kit for anyone — view only">
          {shared ? "Link copied ✓" : "Share kit"}
        </button>
        <div className="kp-dlrow">
          {([["all", "Download full pack"], ["components", "Components"], ["layers", "Material layers"], ["controls", "Control pieces"], ["type", "Typography recipe"], ["assemblies", "Assemblies"]] as const).map(([which, capn]) => (
            <button key={which} title={maySvg ? `Download ${capn.toLowerCase()} as layered SVG` : `Layered SVG packs are a paid format. ${UPGRADE_LINES[kitTier]}`}
              /* These packs are the same layered SVGs the SVG pack ships, so
                 they go through the same server gate — otherwise this row was
                 a way to take every component without a plan. */
              onClick={() => void guardedExport("svg", gateHandlers, (grant) => {
              const st = useGen.getState();
              const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              const files: { path: string; data: string }[] = [];
              if (which === "all" || which === "layers") layerCards.forEach((lc) => files.push({ path: `build-parts/material-layers/${slug(lc.name)}.svg`, data: lc.svg }));
              if (which === "all" || which === "type") recipe.forEach((r) => files.push({ path: `build-parts/typography-recipe/${slug(r.name)}.svg`, data: r.svg }));
              if (which === "all" || which === "controls") (["slider", "toggle", "progress", "badge", "ring", "slot", "resource", "datarow"] as KitComponentId[]).forEach((cid) =>
                files.push({ path: `build-parts/control-pieces/${cid}.svg`, data: renderKit(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[cid]), st.kitTextFill[cid]), cid, "m", "default", undefined, st.kitShapes[cid], { expand: true, themedText: !!st.kitDesigns[cid]?.type || !!st.kitTextFill[cid], slots: st.kitSlotVals[cid], row: cid === "datarow" ? st.kitRow : undefined }) }));
              if (which === "all" || which === "assemblies") {
                // containers + the pieces every assembly is composed from,
                // plus a recipe sheet describing the compositions
                (["s", "m", "l"] as const).forEach((sz) =>
                  files.push({ path: `assemblies/containers/panel-${sz}.svg`, data: renderKit(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns.panel), st.kitTextFill.panel), "panel", sz, "default", undefined, st.kitShapes.panel, { expand: true, themedText: !!st.kitDesigns.panel?.type || !!st.kitTextFill.panel }) }));
                (["circle", "oval", "strip"] as const).forEach((kind) =>
                  files.push({ path: `assemblies/containers/panel-${kind}.svg`, data: renderKit(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns.panel), st.kitTextFill.panel), "panel", "m", "default", undefined, st.kitShapes.panel, { expand: true, themedText: !!st.kitDesigns.panel?.type || !!st.kitTextFill.panel, kind }) }));
                ([["header", "banner"], ["tab", "section-tab"], ["datarow", "list-row"], ["resource", "hud-counter"], ["slot", "item-slot"], ["ring", "progress-ring"], ["chip", "stat-chip"], ["badge", "medallion"]] as [KitComponentId, string][]).forEach(([cid, nm]) =>
                  files.push({ path: `assemblies/pieces/${nm}.svg`, data: renderKit(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[cid]), st.kitTextFill[cid]), cid, effKitSize(st.kitSizes[cid]), "default", undefined, st.kitShapes[cid], { expand: true, themedText: !!st.kitDesigns[cid]?.type || !!st.kitTextFill[cid], slots: st.kitSlotVals[cid], row: cid === "datarow" ? st.kitRow : undefined }) }));
                files.push({
                  path: "assemblies/RECIPES.md",
                  data: [
                    "# Assembly recipes", "",
                    "Assemblies are compositions of registered components — no unique art.",
                    "Rebuild them in any tool by stacking the pieces in this folder:", "",
                    "- Titled panel: panel + tab (top-left, inset 16) + iconbtn (top-right)",
                    "- Confirmation modal: panel-s + header + two buttons, stacked on center axis",
                    "- Toast: chip + small button, right-aligned",
                    "- List row: list-row; selected state = hover render",
                    "- Objective card: tab + medallion + text + progress + chip + small button",
                    "- Reward track: item-slot per milestone, connectors 3px, done = solid",
                    "- Bottom sheet: panel with 18px top radius + handle bar 44×5",
                    "- Waypoint: medallion; the current waypoint adds a 2px pulse ring at +8px",
                  ].join("\n"),
                });
              }
              if (which === "all" || which === "components") KIT_COMPONENTS.filter((c2) => kitVisible(c2.id, st.componentReleases, st.isAdmin)).forEach(({ id: cid }) => {
                const kb = cid === "progress" || cid === "segbar" ? st.kitBar[cid] : undefined;
                files.push({ path: `components/${cid}.svg`, data: renderKit(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[cid]), st.kitTextFill[cid]), cid, effKitSize(st.kitSizes[cid]), "default", st.kitVals[cid], st.kitShapes[cid], { expand: true, themedText: !!st.kitDesigns[cid]?.type || !!st.kitTextFill[cid], icon: resolveKitIcon(st.kitIcons[cid], undefined), label: st.kitNoText[cid] ? "" : st.kitLabels[cid], slots: st.kitSlotVals[cid], textOy: st.kitTextOy[`${cid}:${effKitSize(st.kitSizes[cid])}`], textOx: st.kitTextOx[`${cid}:${effKitSize(st.kitSizes[cid])}`], bar: kb, dock: kb?.dock ? { icon: resolveKitIcon(st.kitIcons[cid], undefined), side: kb.dockSide ?? "left" } : undefined, row: cid === "datarow" ? st.kitRow : undefined }) });
              });
              if (which === "all") {
                files.push({
                  path: "9slice.json",
                  data: JSON.stringify({
                    note: "Fixed-cap insets for stretchable pieces. Values are fractions of the piece's shell height H: the caps are capScale×H px wide and must not stretch; only the center region stretches. content gives the text-safe insets.",
                    // unlisted preview silhouettes stay out of public exports —
                    // EXCEPT ones this kit actually wears: the README tells the
                    // user to slice by this file, so their own shapes must be in it
                    silhouettes: (() => {
                      const used = new Set([st.cfg.shape, ...Object.values(st.kitShapes)]);
                      return SILHOUETTES.filter((s) => !s.preview || st.isAdmin || used.has(s.id)).map((s) => ({ id: s.id, name: s.name, capScale: s.capScale, content: s.content }));
                    })(),
                  }, null, 2),
                });
                files.push({
                  path: "README.md",
                  data: [
                    "# UI Kit asset pack", "",
                    "Layered SVGs from UI Kit Maker. Every component keeps named groups —",
                    "cast-shadow, extrusion, shell, face, content, gloss, specular — so Figma", "imports them as a readable layer tree.", "",
                    "## Figma", "Drag any SVG onto the canvas. Ungroup once to reach the named layers.", "",
                    "## Illustrator", "Open directly. You may see 'Clipping will be lost on roundtrip to Tiny' —",
                    "that warning concerns re-SAVING to the SVG Tiny profile; the artwork imports",
                    "completely. The candy face requires one clip group (gloss, pattern and",
                    "speculars must stay inside the face), which is what triggers the notice.", "",
                    "## Nine-slice scaling", "See 9slice.json: caps are fixed (capScale × shell height), centers stretch.",
                    "The `content` insets are the text-safe area used by the generator itself.",
                    ...(sliceRisks(st.cfg).length
                      ? ["", "## Effects that do not survive stretching",
                        ...sliceRisks(st.cfg).map((r) => `- ${r}`),
                        "Render one-off components from the app when these must stay intact."]
                      : []),
                  ].join("\n"),
                });
              }
              files.push({ path: "LICENCE.txt", data: grant.licence });
              downloadZip(`ui-kit-${which}.zip`, files);
            })}><Download size={12} strokeWidth={2.2} /> {capn}</button>
          ))}
        </div>
        <div className="kp-subhead">Material &amp; structural layers</div>
        <div className="kp-parts">
          {layerCards.map((lc) => (
            <button className="kp-part" key={lc.name} title={`Open ${lc.name} in the editor`} onClick={() => openEditor(lc.sec)}>
              <Art svg={lc.svg} scale={0.26} />
              <span className="kp-partname">{lc.name}</span>
              <Meta items={lc.meta} />
            </button>
          ))}
        </div>
        <div className="kp-subhead">Control pieces</div>
        <div className="kp-tray">
          <Piece id="slider" caption="Track · Fill · Thumb" value={0.62} />
          <Piece id="toggle" caption="Track · Knob" value={1} />
          <Piece id="progress" caption="Fill · Cap" value={0.62} />
          <Piece id="badge" caption="Badge face · rim" label="7" />
        </div>
        <div className="kp-meta">
          <span>Thumb / knob · Fixed, never scales with track</span><span>Track · Stretch X</span>
          <span>Fill · Stretch X, ends at thumb center</span><span>All recolor via the five wells</span>
        </div>
        <div className="kp-subhead">Typography treatment — live layered recipe</div>
        <div className="kp-recipe">
          {recipe.map((r) => (
            <button className="kp-part wide" key={r.name} title="Open Typography in the editor" onClick={() => openEditor("typography")}>
              <Art svg={r.svg} scale={0.62} />
              <span className="kp-partname">{r.name}</span>
            </button>
          ))}
        </div>
      </Sec>

      {/* ── nine-slice & anatomy — the stretch contract, as its own chapter beat ── */}
      <Sec n="02" title="Nine-Slice & Anatomy" note="Corners fixed, edges stretch on one axis, the center stretches on both. Every silhouette ships this contract as data (9slice.json).">
        <p className="kp-note">Every silhouette is procedural three-slice geometry: caps are sized by height and never distort; only the middle stretches. Magenta dashes mark the fixed caps, green marks the text-safe area.</p>
        {sliceRisks(cfg).length > 0 && (
          <div className="kp-slicenote">
            <b>Heads-up — this design carries effects a stretched slice can't keep:</b>
            <ul>{sliceRisks(cfg).map((r) => <li key={r}>{r}</li>)}</ul>
            <span>The exported slices scale cleanly without them. When a piece needs these effects intact at a specific size, render that one-off component straight from the app instead — it repaints every effect for the exact proportion.</span>
          </div>
        )}
        <div className="kp-slices">
          <SliceDemo cfg={cfg} label="GO" fit={300} />
          <SliceDemo cfg={cfg} label={label} fit={380} />
          <SliceDemo cfg={cfg} label="CONTINUE YOUR ADVENTURE" fit={520} ruler />
        </div>
        <div className="kp-meta">
          <span>Left cap · Fixed</span><span>Center · Stretch X</span><span>Right cap · Fixed</span>
          <span>Panel corners · Fixed</span><span>Panel edges · Stretch</span><span>Panel center · Stretch X/Y</span>
        </div>
        <div className="kp-meta"><span>Corners · fixed</span><span>Edges · stretch one axis</span><span>Center · stretches both</span><span>Text stays inside the green safe area</span></div>
      </Sec>

      {/* ── 15 · motion ── */}
      {/* ── 11 · containers & assemblies ── */}
      <Sec n="03" title="Containers & Assemblies" note="Compound pieces built entirely from registered components — no new materials, no one-off styling. Included in the Build Parts downloads.">
        <div className="kp-subhead">Container shapes</div>
        <div className="kp-tray">
          <Piece id="panel" caption="Container · Panel" size="s" scale={0.4} />
          <Piece id="panel" caption="Container · Round" kind="circle" size="s" scale={0.4} />
          <Piece id="panel" caption="Container · Oval" kind="oval" size="s" scale={0.4} />
          <Piece id="panel" caption="Container · Dialogue strip" kind="strip" size="s" scale={0.4} />
        </div>
        <div className="kp-tray">
          <Piece id="panel" size="s" caption="Panel · S" />
          <Piece id="panel" size="m" caption="Panel · M" />
        </div>
        <div className="kp-patterns kp-assemblies">
          <div className="gp-card">
            <div className="gp-title">Titled panel</div>
            <PPiece id="tab" label="INVENTORY" scale={0.48} />
            <PPiece id="panel" size="s" scale={0.62} />
          </div>
          <div className="gp-card">
            <div className="gp-title">Confirmation modal</div>
            <PPiece id="header" label="ARE YOU SURE?" scale={0.42} />
            <span className="gp-label">This can’t be undone.</span>
            <div className="gp-row center">
              <PPiece id="small" label="YES" scale={0.48} />
              <PPiece id="ghost" label="Cancel" size="s" scale={0.48} />
            </div>
            <PPiece id="iconbtn" icon={STOCK_ICONS.close} scale={0.35} />
          </div>
          <div className="gp-card">
            <div className="gp-title">Toast · Tooltip</div>
            <div className="gp-row center">
              <PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.info} scale={0.42} />
              <span className="gp-label">Saved to the cloud</span>
            </div>
            <PPiece id="chip" label="Tooltip text" icon={null} scale={0.48} />
          </div>
          <div className="gp-card">
            <div className="gp-title">List row · Item slot</div>
            <div className="gp-row">
              <PPiece id="iconbtn" icon={STOCK_ICONS.bag} scale={0.38} />
              <span className="gp-label">Mystic Blade</span>
              <PPiece id="iconbtn" icon={STOCK_ICONS.forward} scale={0.32} />
            </div>
            <div className="gp-row center">
              <PPiece id="iconbtn" icon={STOCK_ICONS.gem} scale={0.45} />
              <PPiece id="badge" label="3" scale={0.38} />
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Avatar · Medallion · Stat chips</div>
            <div className="gp-row center">
              <PPiece id="iconbtn" icon={STOCK_ICONS.user} scale={0.45} />
              <PPiece id="badge" baseState="pressed" scale={0.45} />
            </div>
            <div className="gp-row center">
              <PPiece id="chip" label="STR 42" icon={null} scale={0.45} />
              <PPiece id="chip" label="980" icon={STOCK_ICONS.gem} scale={0.45} />
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">HUD strip · Loading</div>
            <div className="gp-row center">
              <PPiece id="chip" label="×3" icon={STOCK_ICONS.heart} scale={0.42} />
              <PPiece id="progress" value={0.62} scale={0.48} ambient />
              <PPiece id="chip" label="980" icon={STOCK_ICONS.gem} scale={0.42} />
            </div>
            <div className="gp-row center">
              <PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.refresh} scale={0.38} />
              <span className="gp-label">Loading level…</span>
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Empty state</div>
            <PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.search} scale={0.48} />
            <PPiece id="tab" label="NOTHING HERE" scale={0.48} />
            <span className="gp-label">Your collection is waiting to begin.</span>
            <PPiece id="small" label="EXPLORE" scale={0.51} />
          </div>
          <div className="gp-card">
            <div className="gp-title">Error state</div>
            <PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.warning} scale={0.48} />
            <PPiece id="tab" label="SOMETHING BROKE" scale={0.48} />
            <span className="gp-label">That didn’t work — try again.</span>
            <div className="gp-row center">
              <PPiece id="small" label="RETRY" scale={0.48} />
              <PPiece id="ghost" label="Back" size="s" scale={0.48} />
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Bottom sheet · collapsed</div>
            <div className="kp-sheet collapsed">
              <span className="kp-handle" />
              <div className="gp-row">
                <span className="gp-label">Squad details</span>
                <PPiece id="iconbtn" icon={STOCK_ICONS.forward} scale={0.5} />
              </div>
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Bottom sheet · expanded</div>
            <div className="kp-sheet">
              <span className="kp-handle" />
              <div className="gp-row"><span className="gp-label">Squad details</span><PPiece id="iconbtn" icon={STOCK_ICONS.close} scale={0.46} /></div>
              <PPiece id="datarow" value={0.4} scale={0.48} />
              <PPiece id="datarow" label="Iron Golem" sub="Level 8 · Tank" value={0.7} scale={0.48} />
              <div className="kp-sheetfoot"><PPiece id="small" label="DEPLOY" scale={0.45} /></div>
            </div>
          </div>
        </div>
      </Sec>

      {/* ── 12 · reward & objectives ── */}
      <Sec n="04" title="Reward Track & Objectives" note="Progression assemblies built from registered components. The track visualizes milestone rewards; objectives drive player progression and grant resources.">
        <div className="kp-subhead">Reward track</div>
        <div className="kp-track3" ref={trackRailRef}>
          <span className="kp-rail3" aria-hidden="true"><i /><em /></span>
          {([
            ["Claimed", "5,000 XP", "done", <SPiece key="a" id="slot" icon={STOCK_ICONS.check} overlay="check" scale={0.84} />, false],
            ["Claimable", "10,000 XP", "done", <SPiece key="b" id="slot" icon={STOCK_ICONS.bag} overlay="claimable" baseState="hover" scale={0.95} />, true],
            ["Current", "20,000 XP", "current", <SPiece key="c" id="slot" shape="pill" icon={STOCK_ICONS.gem} overlay="new" baseState="hover" scale={1.25} />, false],
            ["Upcoming", "30,000 XP", "next", <SPiece key="d" id="slot" icon={STOCK_ICONS.lock} overlay="locked" scale={0.84} />, false],
            ["Final reward", "50,000 XP", "next", <SPiece key="e" id="slot" icon={STOCK_ICONS.trophy} overlay="locked" scale={1.05} />, false],
          ] as [string, string, string, React.ReactNode, boolean][]).map(([capn, xp, st, node, claim]) => (
            <div className={`kp-tstop3 ${st}`} key={capn}>
              <div className={`kp-tnodezone${st === "current" ? " current" : ""}`}>{node}</div>
              <span className="kp-tstate"><i className={`kp-tdot ${st}`} />{capn}</span>
              <span className="kp-txp">{xp}</span>
              {claim && <SPiece id="primary" label="CLAIM REWARD" scale={0.34} />}
            </div>
          ))}
        </div>
        <div className="kp-progrid">
          <div>
            <div className="kp-subhead">Current objectives</div>
            <p className="kp-note">Complete objectives to earn rewards and XP.</p>
            <div className="kp-objlist">
              {([
                [STOCK_ICONS.play, "Play 3 matches", "Jump into any game mode.", "3 / 3", 1, "done", "+250 XP"],
                [STOCK_ICONS.warning, "Deal 5,000 damage", "Damage enemy players.", "2,850 / 5,000", 0.57, "active", "+400 XP"],
                [STOCK_ICONS.trophy, "Win 1 match", "Achieve victory in any mode.", "0 / 1", 0, "idle", "+350 XP"],
                [STOCK_ICONS.star, "Collect 10 power-ups", "Find or earn power-ups.", "6 / 10", 0.6, "active", "+300 XP"],
              ] as [IconDef, string, string, string, number, string, string][]).map(([ic, t, sub, count, v, st, xp]) => (
                <div className="kp-obj" key={t}>
                  <span className="kp-objic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: previewSvg(ic, 22) }} />
                  <div className="kp-objtext"><b>{t}</b><span>{sub}</span></div>
                  <div className="kp-objprog">
                    <span className={`kp-objcount${st === "done" ? " done" : ""}`}>{count}</span>
                    <SPiece id="progress" value={v} scale={0.34} />
                  </div>
                  <span className={`kp-objstate ${st}`}>{st === "done" ? "✓ Completed" : st === "active" ? "In progress" : "Not started"}</span>
                  <Art svg={xpArts.get(xp) ?? renderTypeSpecimen(cfg, xp)} scale={0.34} className="kp-objxp" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="kp-subhead">Weekly bonus</div>
            <p className="kp-note">Complete objectives all week to earn a bonus reward.</p>
            <div className="kp-weekly">
              <span className="sc-caption dim">WEEKLY STREAK</span>
              <div className="kp-wkbig"><b>4</b><span>/ 7 days</span></div>
              <div className="kp-wkdays" ref={weekRailRef}>
                {(["M", "T", "W", "T", "F", "S", "S"] as const).map((d, i) => (
                  <div className="kp-wkday" key={d + i}>
                    <SPiece id="orb" value={i < 4 ? 1 : 0} scale={0.5} />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
              <div className="kp-wkline" />
              <span className="sc-caption dim">BONUS REWARD</span>
              <div className="kp-wkreward">
                <SPiece id="badge" size="l" baseState="pressed" icon={STOCK_ICONS.gem} scale={0.56} />
                <SPiece id="chip" label="+1,000 XP" icon={null} scale={0.46} />
              </div>
            </div>
          </div>
        </div>
        <div className="kp-meta">
          <span>Composed from: Track rail</span><span>Milestone node (item slot)</span><span>Objective item</span><span>Reward chip</span><span>Status badge</span><span>Weekly panel</span>
        </div>
      </Sec>

      {/* ── 13 · onboarding & map ── */}
      <Sec n="05" title="Onboarding & Map" note="Tutorial and map primitives. The spotlight and ring point at components without changing them.">
        <div className="kp-patterns kp-assemblies">
          <div className="gp-card">
            <div className="gp-title">Speech bubble · coachmark</div>
            <div className="kp-bubblerow">
              <PPiece id="iconbtn" icon={STOCK_ICONS.user} scale={0.6} />
              <div className="kp-bubble">Tap the glowing button to start your first quest!</div>
            </div>
            <div className="kp-coach">
              <span className="kp-step">1 / 3</span>
              <span className="gp-label">This is your energy meter.</span>
              <div className="gp-row center">
                <PPiece id="small" label="NEXT" scale={0.56} />
                <PPiece id="ghost" label="Skip" size="s" scale={0.5} />
              </div>
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Spotlight · target ring</div>
            <div className="kp-dim">
              {/* the ring IS the treatment — it points at any registered
                  component without wrapping or altering it */}
              <span className="kp-spot pure">
                <span className="kp-ringpulse" />
                <span className="kp-spothole" />
              </span>
              <span className="kp-pointer">▲</span>
              <span className="gp-label">The ring targets any component — nothing is nested inside it</span>
            </div>
            <div className="kp-dim">
              <span className="kp-locpin"><span className="kp-ringpulse" /><span className="kp-locdot" /></span>
              <span className="gp-label">Current-location marker</span>
            </div>
          </div>
          <div className="gp-card">
            <div className="gp-title">Waypoints · connectors</div>
            <div className="kp-map" ref={mapRailRef}>
              <span className="kp-line done" />
              <span className="kp-line" />
              <div className="kp-nodes">
                <div className="kp-node"><PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.check} scale={0.5} /><span>Done</span></div>
                <div className="kp-node sel"><span className="kp-ringpulse" /><PPiece id="badge" label="4" scale={0.5} baseState="hover" /><span>Current</span></div>
                <div className="kp-node"><PPiece id="badge" baseState="pressed" icon={STOCK_ICONS.lock} scale={0.5} /><span>Locked</span></div>
              </div>
              <div className="gp-row center">
                <PPiece id="iconbtn" icon={STOCK_ICONS.search} scale={0.4} trim />
                <PPiece id="iconbtn" icon={STOCK_ICONS.home} scale={0.4} trim />
              </div>
            </div>
          </div>
        </div>
      </Sec>

      <Sec n="06" title="Motion" note="Parameterized behaviors that apply to any piece. Click a card to replay it. Reduced-motion preference disables all of them.">
        <div className="kp-motion">
          {([
            ["Attention pulse", "mo-pulse", { id: "small" as KitComponentId, label: "CLAIM" }, "Draw the eye to an idle action", "1.26s", "ease-in-out, loops"],
            ["Bounce", "mo-bounce", { id: "badge" as KitComponentId, baseState: "pressed" as GenStateName }, "Celebrate a small win", "0.90s", "spring 0.3 / 1.6"],
            ["Glow cycle", "mo-glow", { id: "chip" as KitComponentId, label: "+500", icon: STOCK_ICONS.gem }, "Ambient shimmer on claimables", "1.98s", "ease-in-out, loops"],
            ["Error shake", "mo-shake", { id: "input" as KitComponentId, label: "Wrong code" }, "Reject an input without a dialog", "0.54s", "ease-in-out"],
            ["Reward pop", "mo-pop", { id: "slot" as KitComponentId, icon: STOCK_ICONS.gem, overlay: "claimable" }, "Reveal a claimable reward", "0.63s", "overshoot 0.2 / 1.8"],
            ["Press compression", "mo-press", { id: "small" as KitComponentId, label: "GO" }, "Tactile press acknowledgement", "0.45s", "ease-out"],
            ["Notification entrance", "mo-slidein", { id: "resource" as KitComponentId, label: "+50" }, "Bring a counter update in from the edge", "0.63s", "decelerate"],
            ["Panel slide", "mo-rise", { id: "tab" as KitComponentId, label: "NEW QUEST" }, "Raise a sheet or panel into view", "0.63s", "decelerate"],
          ] as [string, string, PieceOpts, string, string, string][]).map(([name, cls, piece, purpose, dur, ease]) => (
            <MotionDemo key={cls} name={name} cls={cls} piece={piece} purpose={purpose} dur={dur} ease={ease} />
          ))}
        </div>
        <div className="kp-meta"><span>Durations scale with --mo-dur</span><span>Magnitude scales with --mo-mag</span><span>prefers-reduced-motion disables every behavior</span></div>
      </Sec>

      {/* ── proof of system — the chapter's conclusion ── */}
      <Sec n="07" title="Proof of System" note="The Objective Card as a full game screen, assembled only from registered parts. If the rules hold here, they hold for anything you build.">
        <div className="kp-proof" style={{
          backgroundImage: [
            `radial-gradient(ellipse 70% 90% at 82% 20%, ${hexMix(cfg.effects.Bevel ?? "#0E9CC9", dark ? "#05060C" : "#EDF0F8", 0.55)}, transparent 70%)`,
            `radial-gradient(ellipse 60% 80% at 10% 85%, ${hexMix(cfg.effects.Glow ?? "#8FF0FF", dark ? "#05060C" : "#EDF0F8", 0.6)}, transparent 72%)`,
            `linear-gradient(170deg, var(--st-bg1), var(--st-bg2) 75%)`,
          ].join(", "),
        }}>
          <div className="kp-proofcard">
            <div className="kp-prhead">
              <SPiece id="header" label="DAILY OBJECTIVE" scale={0.4} />
              <span className="lay-spring" />
              <span className="kp-prcap">Time remaining</span>
              <SPiece id="chip" label="14H 37M" icon={null} tone="alt" scale={0.36} />
              <SPiece id="iconbtn" icon={STOCK_ICONS.close} scale={0.3} />
            </div>
            <div className="kp-prmain">
              <div className="kp-prleft">
                <div className="kp-prtitle">
                  <SPiece id="badge" baseState="pressed" icon={STOCK_ICONS.trophy} scale={0.5} />
                  <div>
                    <h3>Win 3 matches in ranked mode</h3>
                    <p>Compete in ranked matches and secure 3 victories to earn your reward.</p>
                  </div>
                </div>
                <span className="kp-prcap">Progress</span>
                <div className="kp-prprog">
                  <SPiece id="progress" value={0.66} ambient scale={0.5} />
                  <b>2 / 3</b>
                </div>
              </div>
              <div className="kp-prrewards">
                <span className="kp-prcap">Rewards</span>
                <div className="kp-prrgrid">
                  <div className="kp-prreward"><SPiece id="slot" icon={STOCK_ICONS.gem} overlay="claimable" scale={0.5} /><b>+250</b><span>gems</span></div>
                  <div className="kp-prreward"><SPiece id="slot" icon={STOCK_ICONS.bag} overlay="count:1" scale={0.5} /><b>Premium crate</b><span>×1</span></div>
                </div>
              </div>
            </div>
            <div className="kp-prtrack">
              <span className="kp-prcap">Milestone tracker</span>
              <div className="kp-prstops">
                {([
                  ["1 win", "50 gems", "done", <SPiece key="1" id="checkbox" scale={0.3} />],
                  ["2 wins", "100 gems", "done", <SPiece key="2" id="checkbox" scale={0.3} />],
                  ["3 wins", "250 + crate", "current", <SPiece key="3" id="badge" baseState="pressed" icon={STOCK_ICONS.trophy} scale={0.4} />],
                  ["5 wins", "500 gems", "next", <SPiece key="5" id="slot" size="s" icon={STOCK_ICONS.lock} overlay="locked" scale={0.32} />],
                  ["7 wins", "Legendary crate", "next", <SPiece key="7" id="slot" size="s" icon={STOCK_ICONS.lock} overlay="locked" scale={0.32} />],
                ] as [string, string, string, React.ReactNode][]).map(([w, prize, st, node], i) => (
                  <div className={`kp-prstop ${st}`} key={w}>
                    {i > 0 && <span className={`kp-prconn ${st === "next" ? "pending" : "done"}`} />}
                    <div className="kp-prnode">{node}</div>
                    <b>{w}</b><span>{prize}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="kp-prfoot">
              <SPiece id="ghost" label="OBJECTIVES" size="s" scale={0.4} />
              <SPiece id="primary" label="CLAIM REWARD" scale={0.56} />
              <SPiece id="ghost" label="SHARE" size="s" scale={0.4} />
            </div>
          </div>
        </div>
        <div className="kp-meta">
          <span>Built entirely from: Foundations (color, type, material)</span><span>Components (buttons, slots, progress)</span><span>Assemblies (banner, tracker, rewards)</span><span>System rules (spacing, radius, glow)</span><span>Backdrop: blurred tints derived from the kit's own color roles</span>
        </div>
      </Sec>

      </>}</Deferred>
      <Chapter n="04" id="patterns" label="Screen Patterns" blurb="Complete screens composed from the system." />
      <Deferred estH={5200} eager={bootN >= 3} onLive={bootAdvance}>{() => <>

      {/* ── 16 · patterns — editorial case study, three meaningful groups ── */}
      <Sec n="01" title="Screen Patterns" wide note="Complete interface compositions built entirely from registered kit components. Every pattern remains live, editable, and connected to the same underlying design system.">
        <nav className="pat-tabs" aria-label="Pattern groups">
          {([["all", "All"], ["core", "Core Screens"], ["outcome", "Feedback & Outcomes"], ["state", "Empty & Error"]] as const).map(([id, name]) => (
            <button key={id} className={patTab === id ? "on" : ""} aria-pressed={patTab === id}
              onClick={() => setPatTab(id)}>{name}</button>
          ))}
        </nav>

        {(patTab === "all" || patTab === "core") && (
          <div className="pat-group">
            <div className="pat-ghead">
              <h3>Core Screens</h3>
              <p>Primary navigation, account and system management screens.</p>
            </div>
            <div className="pat-grid">
              <Pat n="01" name="Main Menu" cat="Core Screen" comps={7} asms={3} lead="primary">
                {/* corner chrome first — the center column below shares ONE axis */}
                <div className="sc-row sc-util sc-menubar">
                  <SPiece id="chip" label="980" icon={STOCK_ICONS.gem} scale={0.32} />
                  <span className="sc-spring" />
                  <SPiece id="badge" label="3" scale={0.26} />
                  <SPiece id="iconbtn" icon={STOCK_ICONS.gear} scale={0.28} />
                </div>
                <Art svg={menuArt} scale={0.5} />
                <SPiece id="primary" label="PLAY" scale={0.64} />
                <div className="sc-stack">
                  <SPiece id="small" label="OPTIONS" scale={0.5} />
                  <SPiece id="small" label="STORE" scale={0.5} />
                </div>
              </Pat>
              <Pat n="02" name="Sign In" cat="Core Screen" comps={5} asms={2} lead="input">
                <SPiece id="header" label="WELCOME BACK" scale={0.34} />
                <span className="sc-caption dim">Sign in to keep your progress.</span>
                <div className="sc-stack sc-push">
                  <SPiece id="input" label="Username" scale={0.38} />
                  <SPiece id="input" label="Password" scale={0.38} />
                </div>
                <SPiece id="primary" label="SIGN IN" size="s" scale={0.4} />
                <div className="sc-push"><SPiece id="ghost" label="Forgot password?" size="s" scale={0.32} /></div>
              </Pat>
              <Pat n="03" name="Settings" cat="Core Screen" comps={6} asms={2} lead="slider">
                <SPiece id="header" label="SETTINGS" scale={0.32} />
                <div className="sc-form sc-push">
                  <div className="sc-set"><span className="sc-lab">Music</span><SPiece id="slider" value={0.8} scale={0.32} /></div>
                  <div className="sc-set"><span className="sc-lab">Sound FX</span><SPiece id="slider" value={0.55} scale={0.32} /></div>
                  <div className="sc-set"><span className="sc-lab">Haptics</span><SPiece id="toggle" value={1} scale={0.26} /></div>
                  <div className="sc-set"><span className="sc-lab">Notifications</span><SPiece id="toggle" value={0} scale={0.26} /></div>
                </div>
                <div className="sc-push"><SPiece id="small" label="DONE" scale={0.68} /></div>
              </Pat>
              <Pat n="04" name="Profile" cat="Core Screen" comps={4} asms={3} lead="progress">
                <div className="sc-row sc-id">
                  <SPiece id="iconbtn" icon={STOCK_ICONS.user} scale={0.44} />
                  <div className="sc-idcol">
                    <span className="sc-name">PLAYER ONE</span>
                    <SPiece id="chip" label="LV 24" icon={STOCK_ICONS.star} scale={0.3} />
                  </div>
                </div>
                <div className="sc-form sc-push">
                  <div className="sc-between"><span className="sc-lab">XP</span><span className="sc-caption dim">3,450 / 5,000</span></div>
                  <SPiece id="progress" value={0.69} ambient scale={0.42} />
                </div>
                <div className="sc-push"><SPiece id="small" label="EDIT PROFILE" scale={0.38} /></div>
              </Pat>
              <Pat n="05" name="Reward" cat="Core Screen" comps={4} asms={2} lead="badge">
                <SPiece id="header" label="LEVEL UP!" scale={0.38} />
                <div className="sc-push"><SPiece id="badge" size="l" baseState="pressed" icon={STOCK_ICONS.star} scale={0.72} /></div>
                <SPiece id="chip" label="+250" icon={STOCK_ICONS.gem} scale={0.42} />
                <div className="sc-push"><SPiece id="primary" label="CLAIM REWARD" size="s" scale={0.44} /></div>
              </Pat>
              <Pat n="06" name="Purchase" cat="Core Screen" comps={5} asms={3} lead="segment">
                <SPiece id="header" label="STORE" scale={0.3} />
                <div className="sc-push"><SPiece id="segment" segments={["500", "1,200", "2,500"]} value={1} scale={0.42} /></div>
                <div className="sc-row">
                  <SPiece id="chip" label="1,200" icon={STOCK_ICONS.gem} scale={0.34} />
                  <span className="sc-caption dim">for</span>
                  <SPiece id="chip" label="$4.99" icon={null} scale={0.34} />
                </div>
                <SPiece id="primary" label="BUY NOW" size="s" scale={0.38} />
                <SPiece id="ghost" label="Cancel" size="s" scale={0.3} />
              </Pat>
              <Pat n="07" name="Inventory" cat="Core Screen" comps={14} asms={6} lead="slot" wide>
                <InventoryScreen />
              </Pat>
            </div>
          </div>
        )}

        {/* (the full-screen Racing HUD pattern is parked — RacingHud.tsx
            stays in the tree for when the kit is ready for it) */}
        {(patTab === "all" || patTab === "outcome") && (
          <div className="pat-group">
            <div className="pat-ghead">
              <h3>Feedback &amp; Outcomes</h3>
              <p>System feedback, progress and end-state compositions.</p>
            </div>
            <div className="pat-grid three">
              <Pat n="08" name="Confirmation" cat="Outcome Screen" comps={3} asms={1} lead="small">
                <div className="sc-modal">
                  <SPiece id="header" label="ARE YOU SURE?" scale={0.26} />
                  <span className="sc-caption">Quitting now will forfeit the match.</span>
                  <div className="sc-row sc-push">
                    <SPiece id="small" label="CONFIRM" scale={0.36} />
                    <SPiece id="ghost" label="Cancel" size="s" scale={0.34} />
                  </div>
                </div>
              </Pat>
              <Pat n="09" name="Loading" cat="Outcome Screen" comps={2} asms={1} lead="progress">
                <Art svg={loadingArt} scale={0.32} />
                <SPiece id="progress" value={0.72} ambient scale={0.48} />
                <span className="sc-caption dim sc-push">Tip: locked doors remember you.</span>
              </Pat>
              <Pat n="10" name="Results — Victory" cat="Outcome Screen" comps={4} asms={2} lead="primary">
                <Art svg={splashArt} scale={0.28} />
                <div className="sc-cluster sc-push">
                  <span className="sc-caption dim">Score</span>
                  <SPiece id="resource" label="12,450" icon={STOCK_ICONS.trophy} scale={0.46} />
                </div>
                <div className="sc-row sc-push">
                  <SPiece id="primary" label="CONTINUE" size="s" scale={0.38} />
                  <SPiece id="ghost" label="Replay" size="s" scale={0.34} />
                </div>
              </Pat>
            </div>
          </div>
        )}

        {(patTab === "all" || patTab === "state") && (
          <div className="pat-group">
            <div className="pat-ghead">
              <h3>Empty &amp; Error States</h3>
              <p>Empty, offline and error handling — one template, two intents.</p>
            </div>
            <div className="pat-grid">
              <Pat n="11" name="Empty State" cat="State Screen" comps={4} asms={1} lead="small">
                <StateScreen icon={STOCK_ICONS.search} title="NO ITEMS YET" line="Complete levels to fill your bag." action="BROWSE STORE" />
              </Pat>
              <Pat n="12" name="Connection Error" cat="State Screen" comps={4} asms={1} lead="small">
                <StateScreen icon={STOCK_ICONS.warning} title="CONNECTION LOST" line="We can’t reach the server." action="RETRY" />
              </Pat>
            </div>
          </div>
        )}
      </Sec>

      {/* ── layout starters — everything working together, at device scale ── */}
      <Sec n="02" title="Layout Starters" wide note="Full screens at true device proportions — idea starters showing the system working together. Remove any you don't want; they're starters, not rules.">
        {hiddenLays.length > 0 && (
          <button className="pat-open kp-layrestore" onClick={() => hideLay("*reset*")}>Restore {hiddenLays.length} removed starter{hiddenLays.length > 1 ? "s" : ""}</button>
        )}
        <div className="lay-grid">
          {!hiddenLays.includes("inventory") && (
            <LayoutCard id="inventory" name="Inventory" device="Desktop 16:9" onHide={hideLay}>
              <div className="lay-row lay-bar">
                <SPiece id="resource" label="12,480" icon={STOCK_ICONS.gem} scale={0.4} />
                <SPiece id="resource" label="4" max="5" icon={STOCK_ICONS.heart} scale={0.4} />
                <span className="lay-spring" />
                <SPiece id="iconbtn" icon={STOCK_ICONS.gear} scale={0.46} />
              </div>
              <div className="lay-row lay-fill">
                <div className="lay-col">
                  <SPiece id="tab" label="WEAPONS" scale={0.4} />
                  <div className="lay-row">
                    <SPiece id="slot" icon={STOCK_ICONS.gem} overlay="level:3" scale={0.4} />
                    <SPiece id="slot" icon={STOCK_ICONS.bag} overlay="count:14" scale={0.4} />
                    <SPiece id="slot" icon={STOCK_ICONS.heart} overlay="equipped" scale={0.4} />
                  </div>
                  <div className="lay-row">
                    <SPiece id="slot" icon={STOCK_ICONS.trophy} overlay="new" scale={0.4} />
                    <SPiece id="slot" overlay="empty" scale={0.4} />
                    <SPiece id="slot" icon={STOCK_ICONS.gem} overlay="locked" scale={0.4} />
                  </div>
                </div>
                <div className="lay-col">
                  <SPiece id="datarow" scale={0.42} value={0.4} />
                  <SPiece id="datarow" label="Iron Golem" sub="Level 8 · Tank" value={0.7} scale={0.42} />
                  <div className="sc-push"><SPiece id="primary" label="EQUIP" size="s" scale={0.44} /></div>
                </div>
              </div>
            </LayoutCard>
          )}
          {!hiddenLays.includes("fight") && (
            <LayoutCard id="fight" name="Fight Screen" device="Desktop 16:9" onHide={hideLay}>
              <div className="lay-row lay-bar">
                <SPiece id="progress" value={0.82} scale={0.42} />
                <SPiece id="resource" label="48" icon={null} scale={0.38} />
                <SPiece id="progress" value={0.55} scale={0.42} />
              </div>
              <div className="lay-row lay-mid">
                <SPiece id="tab" label="ROUND 2" tone="alt" scale={0.4} />
              </div>
              <div className="lay-row lay-foot">
                <SPiece id="joystick" size="s" scale={0.44} />
                <span className="lay-spring" />
                <SPiece id="iconbtn" icon={STOCK_ICONS.close} scale={0.4} />
                <SPiece id="iconbtn" icon={STOCK_ICONS.play} scale={0.46} />
              </div>
            </LayoutCard>
          )}
          {!hiddenLays.includes("runner") && (
            <LayoutCard id="runner" name="Endless Runner" device="Mobile landscape" onHide={hideLay}>
              <div className="lay-row lay-bar">
                <SPiece id="resource" label="1,204" icon={STOCK_ICONS.gem} scale={0.38} />
                <span className="lay-spring" />
                <SPiece id="chip" label="×3" icon={STOCK_ICONS.star} scale={0.46} />
                <SPiece id="iconbtn" icon={STOCK_ICONS.pause} scale={0.34} />
              </div>
              <div className="lay-row lay-mid"><span className="sc-caption dim">tap to jump · hold to glide</span></div>
              <div className="lay-row lay-foot"><SPiece id="progress" value={0.36} ambient scale={0.42} /></div>
            </LayoutCard>
          )}
          {!hiddenLays.includes("word") && (
            <LayoutCard id="word" name="Word Game" device="Mobile portrait" onHide={hideLay}>
              <SPiece id="header" label="WORD RUSH" scale={0.32} />
              <div className="lay-row">
                <SPiece id="slot" icon={null} overlay="count:A" scale={0.34} />
                <SPiece id="slot" icon={null} overlay="count:R" scale={0.34} />
                <SPiece id="slot" icon={null} overlay="count:T" scale={0.34} />
              </div>
              <SPiece id="input" label="Type a word…" scale={0.46} />
              <div className="sc-push"><SPiece id="primary" label="SUBMIT" size="s" scale={0.38} /></div>
              <SPiece id="progress" value={0.62} ambient scale={0.46} />
            </LayoutCard>
          )}
          {!hiddenLays.includes("match3") && (
            <LayoutCard id="match3" name="Match-3" device="Mobile portrait" onHide={hideLay}>
              <div className="lay-row lay-bar">
                <SPiece id="resource" label={String(Math.max(1, 27 - m3Moves))} icon={STOCK_ICONS.heart} scale={0.34} />
                <SPiece id="resource" label={(900 + m3Score).toLocaleString("en-US")} icon={STOCK_ICONS.gem} scale={0.34} />
              </div>
              <Match3Board onScore={(n) => {
                setM3Score((s) => s + n * 10);
                setM3Moves((m) => m + 1);
                setM3Prog((p) => {
                  const p2 = p + n * 0.045;
                  if (p2 >= 1) { setM3Level((l) => l + 1); return p2 - 1; }
                  return p2;
                });
              }} />
              <div className="sc-push"><SPiece id="progress" value={m3Prog} scale={0.58} /></div>
              <SPiece id="chip" label={`LEVEL ${m3Level}`} icon={null} scale={0.34} />
            </LayoutCard>
          )}
        </div>
      </Sec>

      </>}</Deferred>
      <Chapter n="05" id="resources" label="Resources" blurb="Files, formats and integration notes." />
      <Deferred estH={1600} eager={bootN >= 4} onLive={bootAdvance}>{() => <>

      <Sec n="01" title="Export & Integration" note="Layered SVG first — Figma reads the named groups directly. Category downloads sit with Build Parts above; engine sprite kits export from the toolbar.">
        <SpecList rows={[
          ["Figma", "Drop any exported SVG on the canvas; ungroup once for the layer tree (shadow, extrusion, shell, face, content, gloss)"],
          ["Illustrator", "Opens directly. The SVG-Tiny clipping notice concerns re-saving only; imports are complete"],
          ["Unity", "The Unity kit: nine-slice sprites + kit-manifest.json (dims, margins, pivots, tintability), a smart importer, wired example prefabs, styled live text and a press-Play Playground scene; the sprite sheet is a visual catalog only"],
          ["Unreal", "Coming soon"],
          ["Nine-slice", "Caps are capScale × shell height and never stretch; content gives the text-safe insets (9slice.json)"],
          ["Settings", "The whole design as portable JSON — re-import it or share it as a team default"],
        ]} />
        <div className="kp-links">
          <a target="_blank" rel="noreferrer"
            href={`https://github.com/google/fonts/tree/main/ofl/${T.font.toLowerCase().replace(/[^a-z0-9]/g, "")}`}>{T.font} on GitHub ↗</a>
          <a target="_blank" rel="noreferrer"
            href={`https://fonts.google.com/specimen/${encodeURIComponent(T.font).replace(/%20/g, "+")}`}>Google Fonts ↗</a>
          <a href="#settings" onClick={(e) => { e.preventDefault(); downloadSettings(cfg); }}>Download settings JSON ↓</a>
        </div>
      </Sec>

      </>}</Deferred>
      <footer className="kp-foot">UI Kit Maker Design System · five levels, one material recipe, one renderer, zero mockups. <span title="Which build this page is running — compare against the latest merge before judging a change">build {__BUILD_STAMP__}</span></footer>
      <KitDebugStrip />
    </div>
  );
}
