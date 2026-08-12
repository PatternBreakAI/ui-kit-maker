import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, Dices, Layers, Type, LayoutGrid, Search, Search as SearchIcon, X, Settings, Plus, Minus, RotateCcw, Hammer, PenTool, Trash2, Copy, ArrowUpDown, LibraryBig, CheckCircle2, Shapes, Palette, Sun, Box, Lock, LockOpen, Maximize2, Pin, PinOff, Upload, Globe, Star, Clock, GraduationCap, Info, HelpCircle, TextCursorInput, ShieldCheck } from "lucide-react";
import { measureAutoSlice, drawNineSlice } from "./sliceProbe";
import type { SliceProbe } from "./sliceProbe";
import { patternZones } from "./SliceStage";
import { useGen } from "@/generator/store";
import { t } from "@/shell/i18n";
import { LessonBody } from "./LessonCard";
import { PRESETS, KIT_SLOTS, KIT_LESSONS, EFFECT_ROLES, ROLE_HINT, STATE_NAMES, GAME_FONTS, TEXT_PRESETS, SPECULAR_MODES, PATTERN_TYPES, SHAPES, ICONS_ENABLED, KIT_COMPONENTS, KIT_SHAPE, BLEND_MODES, GLINT_STYLES, defaultStates, applyKitDesign, applyTextPreset, darken, registerCustomFont, pickDesign, fontByName, clampWeight , defaultBarFx, effKitSize, DESIGN_KEYS, presetById, designDiff, mergeKitDesign, iconRigDiff, baseShape, isFlipShape, flipShape, labelMaxOf, groupOf, ctaForFont, ctaEntry, fontLang, KIT_SLICEABLE, KIT_LABEL_EDITABLE } from "@/generator/model";
import type { KitSlice } from "@/generator/model";
import type { GenStateName, BlendMode, GlintStyle, PatternType, KitComponentId, KitDesign  } from "@/generator/model";
import { ICON_LIBS, loadLib, libLoaded, searchLib, getDef, previewSvg } from "@/generator/icons";
import { ensureFont } from "@/generator/fonts";
import { renderBevel, renderKit, shapePath, RARITY_FACTORY, VALUE_DRIVEN } from "@/generator/bevel";
import { hydrate, retintText } from "@/generator/store";
import type { LibItem } from "@/generator/store";
import { defaultConfig, defaultCandy, applyPresetCandy  } from "@/generator/model";
import type { GenConfig  } from "@/generator/model";
import { PRESET_DEFAULTS } from "@/generator/store";
import { SILHOUETTES, SILHOUETTE_CATEGORIES, silhouetteMeta } from "@/generator/silhouettes";
import { capsOf, UPGRADE_LINES } from "@/generator/entitlements";
import { openAuth } from "@/shell/authOverlay";
import { currentSession } from "@/generator/cloud";

/* Rendered mini-previews for the style presets — built once, by the same
   renderer as everything else. */
let presetArtCache: { id: string; name: string; svg: string }[] | null = null;
export function presetArt() {
  if (!presetArtCache) presetArtCache = PRESETS.map((p) => {
    let pc: GenConfig;
    if (PRESET_DEFAULTS[p.id]) {
      pc = hydrate(structuredClone(PRESET_DEFAULTS[p.id])); // clone — hydrate keeps references
    } else {
      pc = defaultConfig();
      pc.presetId = p.id; pc.shape = p.shape; pc.bevel = { ...p.bevel }; pc.effects = { ...p.effects };
      const candy = defaultCandy(); applyPresetCandy(candy, p); pc.candy = candy;
      retintText(pc);
    }
    pc.content.label = "PLAY";
    pc.icon.show = false;
    // thumbnails skip the glow viewport pad — the art stays tight in its card
    for (const s of Object.values(pc.states)) s.glow = 0;
    return { id: p.id, name: p.name, svg: renderBevel(pc, "default") };
  });
  return presetArtCache;
}

/* A saved component's thumbnail renders as the piece it actually is — a saved
   slider previews as a slider, not the master button. */
function libThumb(item: LibItem): string {
  return item.kit
    ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", undefined, item.kit.shape)
    : renderBevel(item.cfg, "default");
}

/* Rail buttons jump to their section group — the panel always shows the full
   stack, so nothing critical ever disappears from view. Order mirrors how the
   object is understood: style → color → structure → surface → light →
   reflections → depth → advanced. */
const GROUPS: Record<string, string[]> = {
  states: ["state", "states"],
  style: ["shape"],
  silhouette: ["silhouette"],
  content: ["kiticon", "barsec"],
  color: ["mapping"],
  material: ["structure", "surface", "bars"],
  lighting: ["lighting", "gloss", "glow", "depth"],
  type: ["typography"],
  library: ["library"],
  icons: ["icon"],
};

export function Rail() {
  const { sectionFilter, setSectionFilter, phase, setPhase, focus } = useGen();
  const items = [
    { id: "states", Icon: Globe, label: t("railStates") },
    { id: "style", Icon: Layers, label: t("railStyle") },
    { id: "silhouette", Icon: Shapes, label: t("railSilhouette") },
    // Component content exists only while a piece is focused — the stop
    // appears with the section, never as a dead click (the master's text
    // lives in Typography)
    ...(focus ? [{ id: "content", Icon: TextCursorInput, label: t("railContent") }] : []),
    { id: "color", Icon: Palette, label: t("railColor") },
    { id: "material", Icon: Box, label: t("railMaterial") },
    { id: "lighting", Icon: Sun, label: t("railLighting") },
    { id: "type", Icon: Type, label: t("railType") },
    { id: "library", Icon: LibraryBig, label: t("railLibrary") },
    ...(ICONS_ENABLED ? [{ id: "icons", Icon: Search, label: "Icon library" }] : []),
  ];
  const jump = (id: string) => {
    // section groups live in the editor's inspector — leave the kit or board
    // view first so the rail keeps working everywhere
    if (phase !== "master") setPhase("master");
    // v59: the rail SHUTTLES — every section stays in the tray; the click
    // marks the stop, opens its sections and scrolls the first into view
    setSectionFilter(id);
    useGen.setState((st) => ({ panelQuery: "", open: { ...st.open, ...Object.fromEntries((GROUPS[id] ?? []).map((k) => [k, true])) } }));
    window.setTimeout(() => {
      const first = GROUPS[id]?.[0];
      document.querySelector(`[data-sec="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, phase !== "master" ? 140 : 40);
  };
  return (
    <nav className="rail" aria-label="Sections">
      {/* v58: the two DESTINATIONS lead the rail — the Kit and the Boards
          are where the work lives; section filters follow below */}
      <button title={t("railKit")} aria-label="The Kit"
        className={`rail-dest${phase === "kit" ? " on" : ""}`} onClick={() => setPhase(phase === "kit" ? "master" : "kit")}>
        <Hammer size={21} strokeWidth={1.7} />
      </button>
      <button title={t("railBoard")} aria-label="The Board"
        className={`rail-dest${phase === "board" ? " on" : ""}`} onClick={() => setPhase(phase === "board" ? "master" : "board")}>
        <LayoutGrid size={21} strokeWidth={1.7} />
      </button>
      <span className="rail-div" aria-hidden="true" />
      {items.map(({ id, Icon, label }) => (
        <button key={id} className={sectionFilter === id ? "on" : ""} title={label} aria-label={label}
          aria-pressed={sectionFilter === id}
          onClick={() => jump(id)}>
          <Icon size={22} strokeWidth={1.7} />
        </button>
      ))}
      <span className="gap" />
      {/* Help = the FAQ (owner call: linked from the sidenav). The editor
          state is already saved continuously, so navigating away is safe. */}
      <button title={t("railHelp")} aria-label="Help and FAQ"
        onClick={() => { window.location.hash = "#/faq"; }}>
        <HelpCircle size={22} strokeWidth={1.7} />
      </button>
      {/* the gear = your account: the page when signed in (plan, billing,
          sign-out), the sign-in overlay when not — same door as the
          top bar's person icon, just where thumbs expect settings */}
      <button title={t("railSettings")} aria-label="Account and settings"
        onClick={() => { if (currentSession()) window.location.hash = "#/account"; else openAuth("signin"); }}>
        <Settings size={22} strokeWidth={1.7} />
      </button>
      {/* which build the EDITOR is running — the kit page and homepage
          already carry the stamp, but the editor is where the owner lives
          when judging a deploy ("i've never seen the version number on the
          actual app"). Sha only; the full stamp rides the tooltip. */}
      <span className="rail-build" title={`Build ${__BUILD_STAMP__}`} aria-label={`Build ${__BUILD_STAMP__}`}>
        {__BUILD_STAMP__.split(" ")[0]}
      </span>
    </nav>
  );
}

function Section({ id, title, summary, right, children }: {
  id: string; title: React.ReactNode; summary?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode;
}) {
  const { open, toggle, panelQuery } = useGen();
  const q = (panelQuery ?? "").trim().toLowerCase();
  // v59: the full stack is always in the tray — the rail SHUTTLES to a
  // section instead of filtering the rest away. While searching, every
  // section opens and only the ones whose text matches stay visible.
  const isOpen = !!open[id] || !!q;
  const ref = useRef<HTMLElement>(null);
  const [hit, setHit] = useState(true);
  useEffect(() => {
    if (!q) { setHit(true); return; }
    setHit((ref.current?.textContent ?? "").toLowerCase().includes(q));
  }, [q, children]);
  return (
    <section className="sec" data-sec={id} ref={ref} style={q && !hit ? { display: "none" } : undefined}>
      <div className="sec-head" onClick={() => toggle(id)} role="button" aria-expanded={isOpen} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(id); }}>
        <h3>{title}</h3>
        <span className="sum">
          {right}
          {!isOpen && summary}
          <span className={`chev${isOpen ? " open" : ""}`}><ChevronDown size={17} strokeWidth={2} /></span>
        </span>
      </div>
      {isOpen && <div className="sec-body">{children}</div>}
    </section>
  );
}

function Slider({ label, value, min, max, unit, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; unit: string; step?: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const clampV = (v: number) => Math.max(min, Math.min(max, v));
  /* Drags coalesce to ONE update per animation frame, latest value wins.
     Range inputs fire faster than the editor can re-render (each update
     redraws the hero + every state card synchronously), so an unthrottled
     drag on a heavy kit queued seconds of solid main-thread work — enough
     to trip Chrome's "Page Unresponsive" dialog (field: "site is
     freezing"). The final value always lands; the typed number field
     stays immediate. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const latest = useRef(value);
  const frame = useRef<number | null>(null);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);
  const emit = (v: number) => {
    latest.current = v;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onChangeRef.current(latest.current);
    });
  };
  return (
    <div className="ctl" style={disabled ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 1} value={value} disabled={disabled} onChange={(e) => emit(+e.target.value)} />
      <span className="valbox">
        <input className="numin" type="number" min={min} max={max} step={step ?? 1} value={value} disabled={disabled}
          aria-label={`${label} value`}
          onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(clampV(v)); }} />
        <i>{unit}</i>
      </span>
    </div>
  );
}

/* A liner note that knows which control it belongs to: an ⓘ chip beside a
   short always-visible summary, with the longer explanation folded behind
   the chip (owner: "kinda hard to tell which note is for which control, so
   maybe hide them behind i's"). First adopter: the CTA translation note. */
function InfoNote({ summary, children }: { summary: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "2px 0 6px" }}>
      <button className="fxpeek" aria-label={open ? "Hide note" : "More about this"} aria-expanded={open}
        onClick={() => setOpen(!open)} style={{ flexShrink: 0 }}>
        <Info size={13} strokeWidth={2.2} />
      </button>
      <div className="helper" style={{ margin: 0 }}>
        {summary}
        {open && children ? <> {children}</> : null}
      </div>
    </div>
  );
}

/* The palette pill (Jimi: "As I didn't see a way to save a swatch, I had
   to write down the RGB and enter those values manually") — one cluster
   button beside each working color choice, a quick pick from the palette:
   RECENT — the last colors used anywhere, captured automatically, like
   every other design app (owner) — plus the kit's own role colors under
   "In this kit". Nothing to save or manage; a hover × drops a recent.
   The native color popup is the browser's, so this rail is our "bottom
   of the picker". Recents persist locally and are kit-independent. The
   pill rides `Well` rows only — the Colors section's rows DEFINE the
   palette, so a pick-from-the-palette pill there read as circular
   (owner). */
/* A color counts as "used" once a hand-picked value has sat still for a
   beat — recording every tick while the picker drags would flood the rail
   with intermediate hues, and recording from a value-watching effect
   would swallow preset and project loads too. Handlers call this; only
   real edits record. */
let recentTimer: ReturnType<typeof setTimeout> | undefined;
function recordRecent(hex: string) {
  clearTimeout(recentTimer);
  recentTimer = setTimeout(() => useGen.getState().pushRecentColor(hex), 900);
}

function SwatchMem({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const recent = useGen((s) => s.recentColors);
  const pushRecent = useGen((s) => s.pushRecentColor);
  const rmRecent = useGen((s) => s.rmRecentColor);
  const effects = useGen((s) => s.cfg.effects);
  const [open, setOpen] = useState(false);
  const hex = (value || "#000000").toUpperCase();
  // the kit's live palette, minus anything already in the recents
  const kitHues = useMemo(() => {
    const seen = new Set(recent);
    const out: { hex: string; role: string }[] = [];
    for (const [role, c] of Object.entries(effects ?? {})) {
      const u = String(c).toUpperCase();
      if (!seen.has(u)) { seen.add(u); out.push({ hex: u, role }); }
    }
    return out;
  }, [effects, recent]);
  const peek = [...recent, ...kitHues.map((k) => k.hex)].slice(0, 3);
  const pick = (h: string) => { onChange(h); pushRecent(h); setOpen(false); };
  return (
    <>
      <button className="swmore" title="Recent + kit colors" aria-expanded={open}
        aria-label="Recent and kit colors" onClick={() => setOpen(!open)}>
        {peek.length === 0
          ? <span className="swplus">+</span>
          : peek.map((h) => <i key={h} style={{ background: h }} />)}
      </button>
      {open && (
        <span className="swrail" role="listbox" aria-label="Recent and kit colors">
          {recent.length > 0 && <span className="swcap">Recent</span>}
          {recent.map((h) => (
            <span key={h} className="swdotwrap">
              <button className={`swdot${h === hex ? " cur" : ""}`} style={{ background: h }} title={`Use ${h}`}
                onClick={() => pick(h)} />
              <button className="swx" title={`Remove ${h}`} aria-label={`Remove ${h}`}
                onClick={() => rmRecent(h)}>×</button>
            </span>
          ))}
          {kitHues.length > 0 && <span className="swcap">In this kit</span>}
          {kitHues.map((k) => (
            <button key={k.hex} className={`swdot${k.hex === hex ? " cur" : ""}`} style={{ background: k.hex }} title={`${k.role} — use ${k.hex}`}
              onClick={() => pick(k.hex)} />
          ))}
        </span>
      )}
    </>
  );
}


function Well({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ctl wellrow">
      <label>{label}</label>
      <span className="chipwell sm" style={{ background: value }}>
        <input type="color" value={value} aria-label={`${label} color`}
          onChange={(e) => { onChange(e.target.value); recordRecent(e.target.value); }} />
      </span>
      <span className="mr-hint">{value.toUpperCase()}</span>
      <SwatchMem value={value} onChange={onChange} />
    </div>
  );
}

function SliceEditor({ cid }: { cid: KitComponentId }) {
  const kitSlices = useGen((s) => s.kitSlices);
  const setKitSlice = useGen((s) => s.setKitSlice);
  const setSliceStage = useGen((s) => s.setSliceStage);
  const sliceCfg = useGen((s) => s.cfg);
  const sliceDesigns = useGen((s) => s.kitDesigns);
  const patOn = useMemo(() => patternZones(sliceCfg, sliceDesigns[cid]).any, [sliceCfg, sliceDesigns, cid]);
  const cur = kitSlices[cid] ?? null;
  const [probe, setProbe] = useState<SliceProbe | null>(null);
  const prevRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    setProbe(null);
    void measureAutoSlice(cid).then((m) => { if (!dead) setProbe(m); });
    return () => { dead = true; };
  }, [cid]);
  const seed = probe?.auto ?? null;
  const on = !!cur;
  const vals = cur ?? seed;
  /* LIVE PREVIEW (owner: "the scaling tool should have a live preview of
     how Unity will interpret the file") — this IS Unity's Sliced Image
     algorithm: nine regions, rigid corners, edges stretch one axis, the
     middle both. Composited at full resolution, then fit to the panel. */
  useEffect(() => {
    const out = prevRef.current;
    if (!out || !probe || !vals) return;
    const src = probe.cv;
    const w = src.width, h = src.height;
    const l = Math.min(vals.left, Math.floor(w / 2) - 2), r = Math.min(vals.right, Math.floor(w / 2) - 2);
    const t = Math.min(vals.top, Math.floor(h / 2) - 2), b = Math.min(vals.bottom, Math.floor(h / 2) - 2);
    const W2 = Math.round(w * 1.9), H2 = h;
    const off = document.createElement("canvas");
    off.width = W2; off.height = H2;
    const c2 = off.getContext("2d")!;
    drawNineSlice(c2, src, vals, 0, 0, W2, H2);
    const fit = Math.min(1, 252 / W2);
    out.width = Math.round(W2 * fit); out.height = Math.round(H2 * fit);
    const oc = out.getContext("2d")!;
    oc.clearRect(0, 0, out.width, out.height);
    oc.drawImage(off, 0, 0, out.width, out.height);
    /* guides go on AFTER the fit-scale, at screen resolution — a dark halo
       under a bright dashed core, constant width no matter the sprite size
       (owner: "the 9-slice lines are a little hard to see") */
    const guide = (path: () => void) => {
      oc.beginPath(); path();
      oc.setLineDash([]);
      oc.strokeStyle = "rgba(8,12,24,0.85)";
      oc.lineWidth = 3;
      oc.stroke();
      oc.beginPath(); path();
      oc.setLineDash([5, 4]);
      oc.strokeStyle = "#9fe0ff";
      oc.lineWidth = 1.4;
      oc.stroke();
    };
    const gx = (v: number) => Math.round(v * fit) + 0.5, gy = gx;
    const OW = out.width, OH = out.height;
    guide(() => { oc.moveTo(gx(l), 0); oc.lineTo(gx(l), OH); });
    guide(() => { oc.moveTo(gx(W2 - r), 0); oc.lineTo(gx(W2 - r), OH); });
    guide(() => { oc.moveTo(0, gy(t)); oc.lineTo(OW, gy(t)); });
    guide(() => { oc.moveTo(0, gy(H2 - b)); oc.lineTo(OW, gy(H2 - b)); });
  }, [probe, vals?.left, vals?.right, vals?.top, vals?.bottom]);
  const setField = (k: keyof KitSlice, v: number) => {
    const base = cur ?? seed ?? { left: 40, right: 40, top: 36, bottom: 36 };
    setKitSlice(cid, { ...base, [k]: Math.max(1, Math.round(v || 1)) });
  };
  return (
    <div className="slicebox">
      <span className="fl">Unity slicing
        <button className={`allstateschip${!on ? " on" : ""}`} title="Borders measured from this piece's rendered pixels at export — right for almost every kit."
          onClick={() => setKitSlice(cid, null)}>Auto</button>
        <button className={`allstateschip${on ? " on" : ""}`} title="Set the nine-slice borders yourself — your numbers ship exactly."
          onClick={() => { if (!on) setKitSlice(cid, seed ?? { left: 40, right: 40, top: 36, bottom: 36 }); }}>Custom</button>
        <button className="allstateschip slicebig" title="Open the big slicing workbench on the canvas — zoomed pixels, draggable guides."
          onClick={() => setSliceStage(cid)}><Maximize2 size={11} strokeWidth={2.2} /> Big editor</button>
      </span>
      {probe && vals && (
        <canvas ref={prevRef} className="slicepreview"
          title="Stretched to 1.9x width, drawn exactly as Unity's Sliced Image draws it — corners rigid, middle stretching. Dashed lines are the slice guides. Click for the big editor."
          onClick={() => setSliceStage(cid)} />
      )}
      {on && vals && (
        <div className="slotgrid slicegrid">
          {(["left", "right", "top", "bottom"] as const).map((k) => (
            <label key={k} className="slotcell">
              <span>{k}</span>
              <input className="tinput" type="number" min={1} max={400} value={vals[k]}
                onChange={(e) => setField(k, +e.target.value)} aria-label={`Slice border ${k}`} />
            </label>
          ))}
        </div>
      )}
      <div className="helper">{on
        ? "Design px, all of this piece's sprites and states. Corners stay rigid inside the borders; only the middle stretches."
        : seed
          ? `Auto reads the corner curves off the real pixels — this piece measures ${seed.left} · ${seed.right} · ${seed.top} · ${seed.bottom} px (left · right · top · bottom).`
          : "Auto reads the corner curves off the real pixels at export."}</div>
      {patOn && (
        <div className="helper slicewarn"><AlertTriangle size={11} strokeWidth={2.4} /> This piece wears a pattern — heavy Sliced stretching smears it into noise. Keep the stretch modest, or size the piece near its final proportions before export.</div>
      )}
    </div>
  );
}

function FxToggle({ label, on, onToggle, children }: {
  label: string; on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode;
}) {
  // Effects that are on show their controls; off effects can still be peeked
  // open with the caret so nothing feels hidden.
  const [peek, setPeek] = useState(false);
  const expanded = on || peek;
  return (
    <div className="fxblock">
      <span className="fxhead">
        <button className={`fxchip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(!on)}>{label}</button>
        {!on && children && (
          <button className="fxpeek" aria-label={`${peek ? "Hide" : "Show"} ${label} controls`} onClick={() => setPeek(!peek)}>
            <ChevronDown size={14} strokeWidth={2} style={{ transform: peek ? "rotate(180deg)" : undefined }} />
          </button>
        )}
      </span>
      {expanded && children && <div className={`fxsub${on ? "" : " dim"}`}>{children}</div>}
    </div>
  );
}

/* Progressive disclosure — fine-tuning folds behind a NAMED reveal, so heavy
   sections lead with the controls that define the look. The name says what is
   inside before it opens; nothing is generic "advanced". */
/* Fold state survives section collapse (module map, keyed by label), and an
   active search force-opens every fold — folded controls must stay findable
   by the panel search, which matches rendered text. */
const ADV_OPEN = new Map<string, boolean>();
function Adv({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(ADV_OPEN.get(label) ?? false);
  const searching = useGen((s) => s.panelQuery.trim().length > 0);
  const expanded = open || searching;
  return (
    <div className={`adv${expanded ? " open" : ""}`}>
      <button className="advhead" aria-expanded={expanded} onClick={() => { ADV_OPEN.set(label, !open); setOpen(!open); }}>
        <ChevronRight size={14} strokeWidth={2.2} className="advchev" /> {label}
        {active && !expanded && <span className="advdot" title="Something in here is set away from its default" />}
      </button>
      {expanded && <div className="advbody">{children}</div>}
    </div>
  );
}

/* Naming happens in place — the button becomes a small name field with
   confirm/cancel, replacing the browser prompt() dialog. Enter commits,
   Escape backs out; an async commit can veto with an error message. */
/* ⓘ — the component explains itself: a generated "what can I edit" manual
   from the slot table, then the authored lesson — pattern name, lineage,
   games that do it well, further reading. Links open in NEW TABS (owner
   rule): the reader never loses work to a citation. */
function InfoCard({ cid }: { cid: KitComponentId }) {
  const [open, setOpen] = useState(false);
  const lesson = KIT_LESSONS[cid];
  const name = KIT_COMPONENTS.find((c) => c.id === cid)?.name ?? cid;
  if (!lesson) return null;
  return (
    <div className="infocard">
      <button className="resetstate" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Info size={13} strokeWidth={2.2} /> About {name} {open ? "–" : "+"}
      </button>
      {open && <LessonBody cid={cid} />}
    </div>
  );
}

function NameAction({ icon, label, title, defaultName, placeholder, withDate, onCommit }: {
  icon: React.ReactNode; label: string; title?: string; defaultName?: string; placeholder?: string;
  /** Show a release-date field and pass it to onCommit. Blank = ship now. */
  withDate?: boolean;
  onCommit: (name: string, day?: string) => void | Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { inputRef.current?.focus(); inputRef.current?.select(); } }, [open]);
  const commit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const err = await onCommit(n, day);
      if (err) window.alert(err); else { setOpen(false); setDay(""); }
    } catch (e) {
      // a rejected commit (network drop, failed chunk load) must never
      // strand the field disabled — surface it and leave the name typed
      window.alert(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };
  if (!open) return (
    <button className="resetstate" title={title} onClick={() => { setName(defaultName ?? ""); setOpen(true); }}>{icon} {label}</button>
  );
  return (
    <div className="namerow">
      <input ref={inputRef} className="tinput" value={name} placeholder={placeholder ?? "Name…"} maxLength={80} aria-label={label}
        onChange={(e) => setName(e.target.value)} readOnly={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void commit();
          if (e.key === "Escape" && !busy) setOpen(false);
        }} />
      {withDate && (
        <input className="tinput tinput--day" type="date" value={day} aria-label="Release date — leave blank to publish now"
          title="Release date — leave blank to publish now" readOnly={busy}
          onChange={(e) => setDay(e.target.value)} />
      )}
      <button className="chipbtn" title="Save" aria-label={`${label} — confirm`} disabled={busy || !name.trim()} onClick={() => void commit()}>
        <CheckCircle2 size={14} strokeWidth={2.2} />
      </button>
      <button className="chipbtn" title="Cancel" aria-label={`${label} — cancel`} disabled={busy} onClick={() => setOpen(false)}>
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* A pack's release date is a plain day: the drop happens at UTC midnight,
   so a pack dated the 1st is live everywhere on the 1st. */
function dayToISO(d: string): string | null {
  if (!d) return null;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/** Empty unless the pack is still HELD — a past date is just "live". */
function heldUntil(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t <= Date.now()) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AngleDial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let a = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (a < 0) a += 360;
    onChange(a);
  };
  return (
    <div ref={ref} className="dial" role="slider" aria-label="Lighting angle" aria-valuenow={value} tabIndex={0}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); fromEvent(e); }}
      onPointerMove={(e) => { if (e.buttons) fromEvent(e); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange((value + 5) % 360);
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange((value + 355) % 360);
      }}>
      <span className="hand" style={{ transform: `rotate(${-value}deg)` }} />
    </div>
  );
}

const STATE_LABEL: Record<GenStateName, string> = { default: "Default", hover: "Hover", pressed: "Pressed", disabled: "Disabled" };

/** Font dropdown with each family previewed in its own face. */
function FontPicker({ value, customFonts, onPick }: { value: string; customFonts: string[]; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const names = [...GAME_FONTS.map((f) => f.name), ...customFonts];
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => { if (open) names.forEach(ensureFont); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="fontpick">
      <button className="fieldbox fontpick-btn" aria-label="Font" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <span className="fl">Font</span>
        <span className="fontpick-cur" style={{ fontFamily: `'${value}', Inter, sans-serif` }}>{value}</span>
        <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
      </button>
      {open && (
        <div className="fontpick-pop" role="listbox" aria-label="Fonts">
          {names.map((n) => (
            <button key={n} role="option" aria-selected={n === value} className={n === value ? "on" : ""}
              onClick={() => { onPick(n); setOpen(false); }}>
              <span className="fp-name">{n}</span>
              <span className="fp-preview" style={{ fontFamily: `'${n}', Inter, sans-serif` }}>PLAY</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* the sticky state flag can be silenced for good — the Global badge still
   always names the state being styled */
const STATEFLAG_HUSH_KEY = "ui-generator-stateflag-hush";

export function Panel() {
  const { cfg: cfgMaster, update: updateParent, setPreset: setPresetParent, randomize, randomizeColors, selectedState, setSelectedState, sectionFilter, phase, setPhase, inheritDefaults, makeStateDefault, library, addToLibrary, removeFromLibrary, loadFromLibrary, addToBoard, focus, setFocus, kitShapes, setKitShape, kitDesigns, setKitDesign, kitSizes, kitTextOy, setKitTextOy, kitTextOx, setKitTextOx, kitTextFill, setKitTextFill, kitLocks, toggleKitLock, kitRow, setKitRow, styleLib, saveStyle, applyStyle, removeStyle, userShapes, addUserShape, removeUserShape, userPresets, applyUserPreset, removeUserPreset, cloudPresets, isAdmin, applyCloudPreset, publishPreset, schedulePreset, removeCloudPresetById, hiddenStarters, hideStarterPreset, restoreStarterPresets, hiddenSilhouettes, retireSilhouette, restoreSilhouettes, activeCloudPreset, overwriteActivePreset, tier, kitName, canvasMode, boards, activeBoard, setBoardBg, kitIcons, setKitIcon, kitLabels, setKitLabel, kitSubs, setKitSub, kitSlotVals, setKitSlot, kitVals, setKitVal, kitBar, setKitBar, refreshLibraryItem, replaceConfig, resetAll, panelQuery, setPanelQuery, scope, setScope, allStates, setAllStates } = useGen();
  const actBd = boards.find((b) => b.id === activeBoard);
  const cfg = focus && kitDesigns[focus] ? applyKitDesign(cfgMaster, kitDesigns[focus]) : cfgMaster;
  const { parentId, setParent } = useGen();
  const [parentErr, setParentErr] = useState<string | null>(null);
  /* the state flag announces itself, then gets out of the way (owner:
     "['Styling Pressed'] needs to disappear after a few seconds and you
     should be able to turn it off — from right there"). Every state switch
     revives it for one read, hovering holds it open, and the × on the flag
     silences it forever. */
  const [flagHush, setFlagHush] = useState(() => { try { return localStorage.getItem(STATEFLAG_HUSH_KEY) === "1"; } catch { return false; } });
  const [flagFade, setFlagFade] = useState(false);
  const flagHov = useRef(false);
  const flagOn = (selectedState !== "default" || allStates) && !flagHush;
  useEffect(() => {
    if (!flagOn) return;
    setFlagFade(false);
    let t = 0;
    const arm = () => { t = window.setTimeout(() => (flagHov.current ? arm() : setFlagFade(true)), 6000); };
    arm();
    return () => window.clearTimeout(t);
  }, [flagOn, selectedState, allStates]);
  // the admin publishing desk inside Looks — folded away by default
  const [adminLooksOpen, setAdminLooksOpen] = useState(false);
  // the Looks rack collapses to the freshest few (owner: "we are showing
  // too many looks at once, they should be sorted by newest")
  const [looksAll, setLooksAll] = useState(false);
  /* Shared presets published from the RELEASE DESK carry no stored
     thumbnail — that publish happens on the server, which can't run the SVG
     engine (api/admin.ts sends thumb: null), so the card came up blank
     (owner: "the thumbnail isn't appearing"). The recipe is right there in
     cfg, so draw the art here instead. Memoized per list — this heals every
     past publish with no re-publish and no database work.

     CIRCUIT BREAKER (field: "site freezes before I can do anything"): a
     poisoned cfg can wedge the renderer forever, and this loop runs on
     every signed-in boot — one bad row froze every session. Each render
     marks itself in localStorage before starting and clears the mark on
     completion; a mark that survives means that render killed the tab, so
     every later boot SKIPS that preset (blank card, named in the console)
     instead of freezing again. The key sits OUTSIDE the sync prefix on
     purpose — a local scar, never synced to other devices. */
  const cloudArt = useMemo(() => {
    const GUARD = "forge-thumbguard";
    const readGuard = (): string[] => { try { const v = JSON.parse(localStorage.getItem(GUARD) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
    const writeGuard = (ids: string[]) => { try { localStorage.setItem(GUARD, JSON.stringify(ids)); } catch { /* ignore */ } };
    const out: Record<string, string> = {};
    for (const p of cloudPresets) {
      if (p.thumb) continue;
      const guard = readGuard();
      if (guard.includes(p.id)) {
        console.warn(`Looks: skipping the thumbnail of "${p.name}" (${p.id}) — rendering it froze a previous session. Fix or delete that preset in the Release Desk.`);
        continue;
      }
      try {
        writeGuard([...guard, p.id]);
        const t0 = performance.now();
        const tc = hydrate(JSON.parse(JSON.stringify(p.cfg)) as Record<string, unknown>);
        for (const st of Object.values(tc.states)) st.glow = 0;
        tc.content.label = "PLAY"; tc.icon.show = false;
        out[p.id] = renderBevel(tc, "default");
        const ms = performance.now() - t0;
        if (ms > 2000) console.warn(`Looks: "${p.name}" (${p.id}) thumbnail took ${Math.round(ms)}ms to render — this preset is close to freezing sessions.`);
      } catch { /* a cfg we can't read just stays blank rather than crashing the tray */ }
      finally { writeGuard(readGuard().filter((id) => id !== p.id)); }
    }
    return out;
  }, [cloudPresets]);
  /* Looks thumbs render in each look's own typeface, but a face used to
     load only when a look was APPLIED — the rack sat in fallback lettering
     until clicked (owner: "I have to click on the Looks thumbnails for the
     fonts to load"). Harvest every family the thumb markup actually names
     — starters, cloud packs, user saves — and warm them a few per idle
     beat; the inline SVGs re-render themselves the moment a face lands. */
  useEffect(() => {
    const fams = new Set<string>();
    const harvest = (svg?: string | null) => {
      if (!svg) return;
      for (const m of svg.matchAll(/font-family="'([^']+)'/g)) fams.add(m[1]);
    };
    userPresets.forEach((u) => harvest(u.thumb));
    cloudPresets.forEach((p) => harvest(p.thumb ?? cloudArt[p.id]));
    presetArt().forEach((s) => harvest(s.svg));
    const queue = [...fams];
    let stop = false;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const pump = () => {
      if (stop) return;
      for (const f of queue.splice(0, 3)) { try { ensureFont(f); } catch { /* a face that won't load just stays fallback */ } }
      if (queue.length) { if (idle) idle(pump, { timeout: 1500 }); else window.setTimeout(pump, 400); }
    };
    pump();
    return () => { stop = true; };
  }, [userPresets, cloudPresets, cloudArt]);
  /* parent eligibility: the component must expose the complete recipe —
     a full silhouette shell, an inset face, a typography label and all four
     states — otherwise other components have nothing to inherit from. */
  const PARENT_ELIGIBLE: (typeof focus)[] = ["primary", "secondary", "small", "ghost", "tab", "chip", "badge", "header"];
  /* v67 · "if I can't see it, I can't edit it": with a component focused,
     every DESIGN edit (colors, effects, candy, type, shape, bevel, lighting,
     shadow, transparency) lands on THAT component's fork — the parent design
     only changes when nothing is focused. State adjusts and the icon rig pin
     to the piece on first touch too. Non-design fields (content, canvas)
     stay global by nature; they still render on the focused hero, so the
     rule holds. */
  const update = (fn: (c: GenConfig) => void) => {
    if (!focus) { updateParent(fn); return; }
    const before = applyKitDesign(cfgMaster, kitDesigns[focus]);
    const merged = JSON.parse(JSON.stringify(before)) as GenConfig;
    /* WHERE this edit lands: the focused piece alone, or every member of
       its family when the scope bar says Group (owner: "I need that group
       setting"). Locked pieces are skipped — a lock means finished. The
       edit is authored once on the focused piece and then pinned to each
       target, so the family moves together without the maker repeating
       themselves on five HUD dials. */
    const grp = scope === "group" ? groupOf(focus) : null;
    const targets: KitComponentId[] = grp ? grp.members.filter((m) => !kitLocks[m]) : [focus];
    const pinAll = (patch: KitDesign) => {
      for (const t of targets) setKitDesign(t, mergeKitDesign(useGen.getState().kitDesigns[t], patch));
    };
    if (selectedState !== "default") {
      /* Editing a non-default state of a focused piece: route the design edit
         into that state's fork — the same routing the store's update does —
         because the controls READ from the fork (D = stateDesigns[sel]). The
         old path wrote to the piece's default layer, which the fork masked:
         the control looked dead. Fork on first touch; Default stays put. */
      if (!merged.stateDesigns) merged.stateDesigns = {};
      if (!merged.stateDesigns[selectedState]) merged.stateDesigns[selectedState] = pickDesign(merged);
      const sd = merged.stateDesigns[selectedState]!;
      /* the icon forks LAZILY here too — same contract as the store's update:
         the state edits a working copy, and only an actual icon change pins
         it to THIS state. The old path let the edit land on merged.icon,
         which the rig-pin below stamped onto the whole PIECE — a hover
         recolor painted every state (owner: "still changing every state"). */
      const baseIcon = sd.icon ?? merged.icon;
      const tIcon = JSON.parse(JSON.stringify(baseIcon)) as GenConfig["icon"];
      const t = Object.assign({}, merged, {
        effects: sd.effects, face: sd.face, bevel: sd.bevel, candy: sd.candy,
        lighting: sd.lighting, shadow: sd.shadow, transparency: sd.transparency, type: sd.type,
        icon: tIcon,
      }) as GenConfig;
      Object.defineProperty(t, "shape", { get: () => sd.shape, set: (v) => { sd.shape = v; }, enumerable: true, configurable: true });
      fn(t);
      sd.effects = t.effects; sd.face = t.face; sd.bevel = t.bevel; sd.candy = t.candy;
      sd.lighting = t.lighting; sd.shadow = t.shadow; sd.transparency = t.transparency; sd.type = t.type;
      if (JSON.stringify(t.icon) !== JSON.stringify(baseIcon)) sd.icon = t.icon;
      /* the GLYPH and its POSITION stay one decision for the piece (like
         the typeface) — colour, effects and weight fork per state. Same
         rule as the master path: a glyph that moves between states reads
         as jitter, and states carrying different content still need one
         placement (owner, on the badge: "I need nudge to be
         state-independent"). */
      const gi = sd.icon;
      const glyphKeys = ["show", "placement", "only", "ox", "oy"] as const;
      if (gi && (JSON.stringify(gi.def ?? null) !== JSON.stringify(merged.icon.def ?? null) || glyphKeys.some((k) => gi[k] !== merged.icon[k]))) {
        merged.icon.def = gi.def;
        for (const k of glyphKeys) (merged.icon[k] as unknown) = gi[k];
        for (const other of Object.values(merged.stateDesigns)) {
          if (other?.icon) { other.icon.def = gi.def; for (const k of glyphKeys) (other.icon[k] as unknown) = gi[k]; }
        }
      }
      if (JSON.stringify(before.stateDesigns ?? {}) !== JSON.stringify(merged.stateDesigns)) {
        // state forks pin wholesale — that's their storage grain
        for (const t of targets) setKitDesign(t, { ...(useGen.getState().kitDesigns[t] ?? {}), stateDesigns: merged.stateDesigns });
      }
    } else {
      fn(merged);
      // v70: pin only the paths this edit changed — the rest keeps following
      // the parent design live, so the kit stays auto-updating
      const d = designDiff(pickDesign(before), pickDesign(merged));
      if (d) pinAll(d);
    }
    /* state ADJUSTMENTS (the Global sliders) isolate to the piece too — the
       banner says "edits save into this piece", and the owner caught them
       leaking to the whole kit. Pin on first touch; read back the freshest
       lock since the design pin above may have just written it. */
    if (JSON.stringify(before.states) !== JSON.stringify(merged.states)) {
      pinAll({ states: merged.states });
    }
    /* the icon RIG isolates too — "when I resize an icon, it resizes it
       everywhere" (owner). Pin only the dials this edit moved; untouched
       dials keep following the master rig live. */
    if (JSON.stringify(before.icon) !== JSON.stringify(merged.icon)) {
      const di = iconRigDiff(before.icon, merged.icon);
      if (di) pinAll({ icon: di });
    }
    // replay only the non-design portion onto the parent — design keys,
    // state adjustments AND the icon rig stay pinned to the piece
    const mClone = JSON.parse(JSON.stringify(cfgMaster)) as GenConfig;
    fn(mClone);
    const scrub = (c: GenConfig) => { const p = JSON.parse(JSON.stringify(c)) as Record<string, unknown>; for (const k2 of DESIGN_KEYS) delete p[k2]; delete p.states; delete p.icon; return JSON.stringify(p); };
    if (scrub(mClone) !== scrub(cfgMaster)) updateParent((c) => { const keep = pickDesign(c); const keepStates = c.states; const keepIcon = c.icon; fn(c); Object.assign(c, keep); c.states = keepStates; c.icon = keepIcon; });
  };
  const setPreset = (id: string) => {
    if (!focus) { setPresetParent(id); return; }
    // a preset click while editing restyles ONLY the focused component
    const p = presetById(id);
    const before = applyKitDesign(cfgMaster, kitDesigns[focus]);
    const merged = JSON.parse(JSON.stringify(before)) as GenConfig;
    merged.effects = { ...p.effects };
    merged.bevel = { ...p.bevel };
    merged.shape = p.shape;
    // the starter's face restyles this piece too — same voice as a master apply
    if (p.font) { merged.type.font = p.font; merged.type.weight = clampWeight(fontByName(p.font).caps, p.fontWeight ?? merged.type.weight); }
    applyPresetCandy(merged.candy, p);
    const d = designDiff(pickDesign(before), pickDesign(merged));
    if (d) setKitDesign(focus, mergeKitDesign(kitDesigns[focus], d));
    setKitShape(focus, p.shape);
  };
  const [iconQuery, setIconQuery] = useState("");
  const [libTick, setLibTick] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const [silCat, setSilCat] = useState<string>("All");
  const [shapeErr, setShapeErr] = useState<string | null>(null);
  const savedLib = cfg.icon.def?.lib && ICON_LIBS.some((l) => l.id === cfg.icon.def!.lib) ? cfg.icon.def!.lib : "lucide";
  const [browseLib, setBrowseLib] = useState(savedLib);
  const libIsReady = libLoaded(browseLib);

  // v57: the component-icon swap needs the library even while the master
  // icon section stays parked — load it whenever a swappable piece is focused
  const iconSwappable = !!focus && (["iconbtn", "chip", "resource", "slot", "datarow", "badge", "progress", "segbar", "buffframe", "notifydot", "loottag", "skillnode", "equipslot", "toast", "killfeed", "equipselector", "weaponwheel", "firebutton", "booster", "dailycell", "buildqueue", "techcard", "clancrest", "emotewheel", "cardback", "pack", "orderticket", "rewardcard"] as KitComponentId[]).includes(focus);
  /* the icon on/off rides every text line whose component can wear a glyph
     (owner call) — swappables plus the master-icon carriers. iconbtn is
     icon-ONLY: hiding its glyph would leave an empty tile, so no checkbox. */
  const iconTogglable = !!focus && focus !== "iconbtn" &&
    (iconSwappable || focus === "primary" || focus === "secondary");
  const labelEditable = !!focus && KIT_LABEL_EDITABLE.has(focus);
  /* pieces carrying a SECOND text (the combo plate word) get one more field */
  const subEditable = !!focus && (["combo"] as KitComponentId[]).includes(focus);
  const subFieldName: Partial<Record<KitComponentId, string>> = { combo: "Plate word — e.g. COMBO!" };
  useEffect(() => {
    if (!ICONS_ENABLED && !iconSwappable) return;
    let live = true;
    if (!libLoaded(browseLib)) {
      void loadLib(browseLib).then(() => { if (live) setLibTick((t) => t + 1); });
    }
    return () => { live = false; };
  }, [browseLib, iconSwappable]);

  const bigGrid = sectionFilter === "icons";
  /* the ? beside Rarity tiers — the system explained on demand, not as a
     permanent wall of helper text */
  const [rarityHelp, setRarityHelp] = useState(false);
  const results = useMemo(
    () => (ICONS_ENABLED || iconSwappable ? searchLib(browseLib, iconQuery, bigGrid ? 60 : 24) : []),
    // libTick re-runs the search once an async library lands
    [browseLib, iconQuery, bigGrid, libTick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Controls read from — and update() writes to — the selected state's own
  // design. Untouched states mirror Default live until first edited.
  const D = selectedState !== "default" ? (cfg.stateDesigns?.[selectedState] ?? cfg) : cfg;
  // the icon rig the controls read: the selected state's pinned rig, else the
  // piece/master rig — the same place update() sends the write, so the
  // swatch always shows what the hero shows
  const IC = (selectedState !== "default" ? cfg.stateDesigns?.[selectedState]?.icon : undefined) ?? cfg.icon;
  const presentRoles = EFFECT_ROLES.filter((r) => D.effects[r] !== undefined);
  const missingRoles = EFFECT_ROLES.filter((r) => D.effects[r] === undefined);
  const mapStops = presentRoles.map((r) => D.effects[r]!) as string[];
  const mapBar = mapStops.length > 1 ? `linear-gradient(90deg, ${mapStops.join(", ")})` : mapStops[0] ?? "#ddd";
  const adj = cfg.states[selectedState];
  const T2 = D.type;
  const C = D.candy;
  const palette = { dark: darken(D.effects.Bevel ?? "#0E9CC9", 0.5), glow: D.effects.Glow ?? "#8FF0FF" };
  useEffect(() => { ensureFont(D.type.font); }, [D.type.font]);
  // the list voice loads on demand too — a doc arriving with one set must render it
  useEffect(() => { if (cfg.type.listFont) ensureFont(cfg.type.listFont); }, [cfg.type.listFont]); // eslint-disable-line react-hooks/exhaustive-deps

  // focusing a kit component jumps the panel to the top so the banner is seen
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { if (focus) panelRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [focus]);

  const [fontDraft, setFontDraft] = useState("");
  const addFont = () => {
    const name = fontDraft.trim();
    if (!name) return;
    registerCustomFont(name);
    ensureFont(name);
    update((c) => {
      if (!c.type.customFonts) c.type.customFonts = [];
      if (!c.type.customFonts.includes(name)) c.type.customFonts.push(name);
      c.type.font = name;
    });
    setFontDraft("");
  };

  // (the Kit phase renders no inspector at all — the guideline sheet is the
  // hero and the whole panel column steps aside; see App.tsx)

  if (phase === "board") {
    // Assemble mode: the design controls step aside; only the Library matters.
    return (
      <aside className="panel">
        <div className="sec">
          <div className="sec-head"><h3>Stage</h3></div>
          <div className="sec-body">
            <div className="helper">Assemble mode — add components with +, drag to arrange, use the +/− on a piece to scale it, × to remove. Hit Play (canvas toolbar) to make everything live.</div>
          </div>
        </div>
        <section className="sec">
          <div className="sec-head"><h3>Backdrop</h3></div>
          <div className="sec-body">
            <label className="check"><input type="checkbox" checked={actBd?.bgShow ?? true} onChange={(e) => setBoardBg({ bgShow: e.target.checked })} /> Show background image</label>
            <Slider label="Opacity" value={actBd?.bgOpacity ?? 100} min={10} max={100} unit="%" onChange={(v) => setBoardBg({ bgOpacity: v })} />
            <Slider label="Blur" value={actBd?.bgBlur ?? 0} min={0} max={14} unit="px" onChange={(v) => setBoardBg({ bgBlur: v })} />
            <div className="helper">The ACTIVE artboard's backdrop — upload it in the board's right panel; it crops to the board bounds and never ships in asset exports.</div>
          </div>
        </section>
        <section className="sec">
          <div className="sec-head"><h3>Library</h3><span className="sum">{library.length} saved</span></div>
          <div className="sec-body">
            <div className="libgrid">
              {library.map((item) => (
                <div className="libcard" key={item.id}>
                  <button className="libthumb" title={`Load ${item.name} into the editor`} onClick={() => loadFromLibrary(item.id)}
                    dangerouslySetInnerHTML={{ __html: libThumb(item) }} />
                  <div className="librow">
                    <span className="libname">{item.name}</span>
                    <button className="chipbtn" title="Add to stage" onClick={() => addToBoard(item.id)}><Plus size={14} strokeWidth={2.2} /></button>
                    <button className="chipbtn" title="Update this saved component to the current style" onClick={() => refreshLibraryItem(item.id)}><RotateCcw size={13} strokeWidth={2} /></button>
                    <button className="chipbtn" title="Delete" onClick={() => removeFromLibrary(item.id)}><Trash2 size={13} strokeWidth={2} /></button>
                  </div>
                </div>
              ))}
              {library.length === 0 && <div className="helper">Nothing saved yet — go back to the editor and hit “OK — add to library”.</div>}
            </div>
          </div>
        </section>
        <div className="btnrow">
          <button className="randbtn kit on" onClick={() => setPhase("master")}>
            <PenTool size={16} strokeWidth={1.9} /> Back to editor
          </button>
        </div>
      </aside>
    );
  }

  const playLocked = canvasMode === "play";
  // a FINISHED piece pauses the whole tray the same way play mode does —
  // the focus banner (not a .sec) stays interactive for the unlock
  const finLocked = !!(focus && kitLocks[focus]);
  return (
    <aside className={`panel${playLocked || finLocked ? " playlock" : ""}${finLocked && !playLocked ? " finlock" : ""}`} ref={panelRef}>
      {playLocked && <div className="playnote">Play mode — controls are paused so you can feel the states. Switch back to Design (✎ in the canvas toolbar) to edit.</div>}
      {/* v59: every control is searchable — matching sections open, the
          rest step aside until the query clears */}
      <div className="panelsearch">
        <SearchIcon size={14} strokeWidth={2.1} aria-hidden="true" />
        <input value={panelQuery} placeholder="Search the controls — glow, nudge, weight…" aria-label="Search controls"
          onChange={(e) => setPanelQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setPanelQuery(""); }} />
        {panelQuery && (
          <button title="Clear search" aria-label="Clear search" onClick={() => setPanelQuery("")}>
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {/* search concierge: "slicing" typed with no sliceable piece focused
          used to answer NOTHING (owner hit this on the live preview) — the
          control lives per piece, so the search hands over the pieces */}
      {/slic|nine/i.test(panelQuery) && (!focus || !KIT_SLICEABLE[focus]) && (
        <div className="searchpoint">
          <b>Unity slicing is set on each piece</b>
          <p>The master button ships as the Primary button — pick a piece and its slicing (measured borders, your numbers, the big pixel editor) opens in Component content.</p>
          <div className="sp-chips">
            {(Object.keys(KIT_SLICEABLE) as KitComponentId[]).map((cid) => (
              <button key={cid} onClick={() => setFocus(cid)}>
                {KIT_COMPONENTS.find((c) => c.id === cid)?.name ?? cid}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* ── the STATE FLAG: jumping pieces snaps back to Default, but while
           a non-default state is picked this sticky flag keeps saying so —
           deep in Typography the chip in Global is long scrolled away
           (owner: "need a warning or something") ── */}
      {flagOn && (
        <div className={`stateflag${allStates ? " allstates" : ""}${flagFade ? " hushed" : ""}`} role="status"
          onMouseEnter={() => { flagHov.current = true; }}
          onMouseLeave={() => { flagHov.current = false; }}>
          <AlertTriangle size={13} strokeWidth={2.4} aria-hidden="true" />
          {allStates ? (
            <span><b>All states</b> — every edit becomes the value for Default, Hover, Pressed and Disabled.</span>
          ) : (
            <span>Styling <b>{STATE_LABEL[selectedState]}</b> — every edit lands on this state only.</span>
          )}
          {/* one switch answers the field report: "set any one parameter for
              all states without resetting all states to default" */}
          <button className={`stateflag-all${allStates ? " on" : ""}`} aria-pressed={allStates}
            title={allStates ? "Back to editing one state at a time" : "Every edit you make becomes the value for ALL states — existing state styling stays, only what you touch unifies."}
            onClick={() => setAllStates(!allStates)}>
            {allStates ? "One state" : "All states"}
          </button>
          {selectedState !== "default" && <button onClick={() => setSelectedState("default")}>Back to Default</button>}
          <button className="stateflag-x" aria-label="Turn this reminder off for good"
            title="Turn this reminder off for good — the badge in Global always shows which state you're styling"
            onClick={() => { try { localStorage.setItem(STATEFLAG_HUSH_KEY, "1"); } catch { /* private mode: hushed for the session */ } setFlagHush(true); }}>
            <X size={13} strokeWidth={2.6} />
          </button>
        </div>
      )}
      {/* ── the SCOPE BAR: where edits land, answered before you edit.
           One picker replaces the scattered banner chrome ("Back to parent
           design", "Style X only (pin it)"...). Every verb survives — it
           just lives in one quiet row now. Three scopes: the whole kit, the
           focused piece's FAMILY, or the piece alone. ── */}
      {(() => {
        const fname = focus ? (KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus) : null;
        const pinned = !!(focus && kitDesigns[focus]);
        const frozen = !!(focus && kitLocks[focus]);
        return (
          <div className="scopebar" role="group" aria-label="Where edits land">
            <div className="scopeseg" role="radiogroup" aria-label="Styling scope">
              <button className={!focus ? "on" : ""} role="radio" aria-checked={!focus}
                title="Style the whole kit — edits flow to every piece that follows the kit design"
                onClick={() => setFocus(null)}>Whole kit</button>
              {(() => {
                const grp = groupOf(focus);
                return grp ? (
                  <button className={focus && scope === "group" ? "on" : ""} role="radio" aria-checked={scope === "group"}
                    title={`Style all ${grp.members.length} pieces in ${grp.name} together — locked pieces stay put`}
                    onClick={() => setScope("group")}>Group · {grp.name}</button>
                ) : (
                  <button className="" role="radio" aria-checked={false} disabled
                    title={focus ? `${fname} isn't part of a family — it styles alone` : "Click Edit on a piece that belongs to a family"}>Group</button>
                );
              })()}
              <button className={focus && scope === "piece" ? "on" : ""} role="radio" aria-checked={!!focus && scope === "piece"} disabled={!focus}
                title={focus ? `Design edits stay on ${fname} only` : "Click Edit on any piece — then edits stay on that piece"}
                onClick={() => setScope("piece")}>
                {focus ? `This piece · ${fname}` : "This piece"}
              </button>
            </div>
            {!focus && (
              <div className="scopehint">Styling the <b>whole kit</b> — edits flow to every piece. Click <b>Edit</b> on a piece to style it alone.</div>
            )}
            {focus && frozen && (
              <>
                <div className="scopehint"><Lock size={11} strokeWidth={2.4} /> <b>{fname}</b> is locked — the look is frozen. Its words and data stay yours in <b>Component content</b>.</div>
                <div className="scopeverbs">
                  <button title="Open this piece back up for editing — it keeps its current look"
                    onClick={() => toggleKitLock(focus)}>
                    <LockOpen size={12} strokeWidth={2.2} /> Unlock
                  </button>
                </div>
              </>
            )}
            {focus && !frozen && (
              <>
                <div className="scopehint">
                  {scope === "group" && groupOf(focus)
                    ? <>Design edits restyle all <b>{groupOf(focus)!.members.length} pieces</b> in <b>{groupOf(focus)!.name}</b> at once — locked pieces stay put, and the rest of the kit doesn&apos;t move.</>
                    : <>Design edits stay on <b>{fname}</b> — the rest of the kit stays put. Words and shared data still flow where they should.</>}
                  {parentId === focus && <> · <b>This is the parent design.</b></>}
                </div>
                <div className="scopeverbs">
                  {pinned && (
                    <>
                      <button title="Make the whole kit look like this piece, then follow the kit design again"
                        onClick={() => {
                          const merged = applyKitDesign(useGen.getState().cfg, kitDesigns[focus]);
                          setKitDesign(focus, null);
                          replaceConfig(structuredClone(merged));
                        }}>
                        <Pin size={12} strokeWidth={2.2} /> Push look to whole kit
                      </button>
                      <button title="Drop this piece's own styling — it follows the kit design again"
                        onClick={() => setKitDesign(focus, null)}>
                        <PinOff size={12} strokeWidth={2.2} /> Follow the kit again
                      </button>
                    </>
                  )}
                  {!pinned && (
                    <button title="Pin the whole current look to this piece in one go — edits already stay here either way"
                      onClick={() => setKitDesign(focus, { ...pickDesign(cfg), stateDesigns: structuredClone(cfg.stateDesigns) })}>
                      <Pin size={12} strokeWidth={2.2} /> Pin the whole look
                    </button>
                  )}
                  <button title="Make this piece the parent design — the base every whole-kit edit styles"
                    onClick={() => {
                      if (PARENT_ELIGIBLE.includes(focus)) { setParent(focus); setParentErr(null); }
                      else setParentErr(`${fname} can't be the parent design — a parent must carry the complete recipe (silhouette shell, face, typography label and all four states) so the rest of the kit can inherit from it.`);
                    }}>
                    <Star size={12} strokeWidth={2.2} /> Make parent
                  </button>
                  <button title="Finished with this piece? The look freezes (design, states, nudges, glyph) until you unlock. Words and data stay editable."
                    onClick={() => toggleKitLock(focus)}>
                    <Lock size={12} strokeWidth={2.2} /> Lock — finished
                  </button>
                </div>
                {parentErr && <div className="helper parenterr" role="alert">{parentErr}</div>}
              </>
            )}
          </div>
        );
      })()}
      {/* ── Global — whole-component adjustments per state ── */}
      <Section id="state" title={t("secGlobal")} right={<span className="statebadge">{STATE_LABEL[selectedState]}</span>}>
        <div className="segmini" role="radiogroup" aria-label="State being edited">
          {STATE_NAMES.map((s) => (
            <button key={s} className={selectedState === s ? "on" : ""} role="radio" aria-checked={selectedState === s}
              onClick={() => setSelectedState(s)}>{STATE_LABEL[s]}</button>
          ))}
          {/* the write-through switch lives WITH the state picker — its only
              other home (the sticky flag) never shows on Default, which made
              the feature invisible right where you'd look for it (owner:
              "I can't find this") */}
          <button className={`allstateschip${allStates ? " on" : ""}`} aria-pressed={allStates}
            title={allStates ? "On: every edit becomes the value for ALL states. Click to go back to one-state editing." : "Every edit you make becomes the value for Default, Hover, Pressed and Disabled at once — existing state styling stays, only what you touch unifies."}
            onClick={() => setAllStates(!allStates)}>
            <Layers size={12} strokeWidth={2.2} /> All states
          </button>
        </div>
        <div className="helper">{allStates
          ? <>Hover or press the button on the canvas to feel the states live. <b>All states</b> is on — every edit becomes the value for all four states.</>
          : <>Hover or press the button on the canvas to feel the states live. These sliders shape only <b>{STATE_LABEL[selectedState]}</b>.</>}</div>
        <Slider label="Brightness" value={adj.brightness} min={-30} max={30} unit="" onChange={(v) => update((c) => { c.states[selectedState].brightness = v; })} />
        <Slider label="Saturation" value={adj.saturation ?? 0} min={-100} max={100} unit="" onChange={(v) => update((c) => { c.states[selectedState].saturation = v; })} />
        <Slider label="Glow" value={adj.glow} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.states[selectedState].glow = v; })} />
        <label className="check"><input type="checkbox" checked={C.aura.color === null}
          onChange={(e) => update((c) => { c.candy.aura.color = e.target.checked ? null : (c.effects.Glow ?? "#8FF0FF"); })} /> Glow color from Color map</label>
        {C.aura.color !== null && (
          <Well label="Glow color" value={C.aura.color} onChange={(v) => update((c) => { c.candy.aura.color = v; })} />
        )}
        <Slider label="Lift" value={adj.lift} min={-10} max={10} unit="px" onChange={(v) => update((c) => { c.states[selectedState].lift = v; })} />
        <Slider label="Opacity" value={adj.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.states[selectedState].opacity = v; })} />
        <div className="actionrow">
          <button className="resetstate" onClick={() => update((c) => { c.states[selectedState] = defaultStates()[selectedState]; })}>
            <RotateCcw size={13} strokeWidth={2} /> Reset {STATE_LABEL[selectedState]}
          </button>
          <button className="resetstate" title="Make Hover, Pressed and Disabled mirror the Default design again — a clean base after exploring"
            onClick={inheritDefaults}>
            <Copy size={13} strokeWidth={2} /> Apply Default to all states
          </button>
          {selectedState !== "default" && (
            <button className="resetstate makedefault" title={`Promote this exact ${STATE_LABEL[selectedState]} look — design and adjustments — to be the new Default. Nothing gets lost.`}
              onClick={makeStateDefault}>
              <Star size={13} strokeWidth={2} /> Make {STATE_LABEL[selectedState]} the new Default
            </button>
          )}
        </div>
        {selectedState !== "default" && cfg.stateDesigns?.[selectedState] && (
          <div className="helper">This state has its own design — edits here never touch Default. Happy accident? <b>Make {STATE_LABEL[selectedState]} the new Default</b> keeps it.</div>
        )}
      </Section>

      {/* ── A · Looks — every saved look in ONE place: starters & packs,
           your kits, your styles, and (collapsed) the admin publishing desk.
           The scattered "Publish current…" buttons live here now, behind
           one quiet admin row (owner: "we need to consolidate"). ── */}
      <Section id="shape" title={t("secLooks")} summary={<span className="mapbar" style={{ background: mapBar }} />}>
        {/* NEWEST FIRST, FEWEST SHOWN (owner): your latest saves lead (they
            already store newest-first), pack drops sort by release date,
            starters keep their curated order — and the rack folds to the
            first dozen until Show all. */}
        {(() => {
          const cloudSorted = [...cloudPresets].sort((a, b) => String(b.publish_at ?? "").localeCompare(String(a.publish_at ?? "")));
          const LOOKS_CAP = 12;
          const total = userPresets.length + cloudSorted.length + presetArt().filter((p) => !hiddenStarters.includes(p.id)).length;
          const capLeft = (used: number) => looksAll ? Infinity : Math.max(0, LOOKS_CAP - used);
          const userShow = userPresets.slice(0, looksAll ? undefined : LOOKS_CAP);
          const cloudShow = cloudSorted.slice(0, capLeft(userShow.length));
          const starterCap = capLeft(userShow.length + cloudShow.length);
          return (
            <>
        <div className="presetgrid">
          {userShow.map((u) => (
            <button key={u.id} className={`presetcard user${kitName === u.name ? " on" : ""}`} title={`${u.name} — your saved kit`}
              onClick={() => applyUserPreset(u.id)}>
              {u.thumb ? <span className="presetart" dangerouslySetInnerHTML={{ __html: u.thumb }} /> : <span className="presetart" />}
              <span className="presetname">{u.name}</span>
              <span className="shapedel" role="button" aria-label={`Delete preset ${u.name}`} title="Delete"
                onClick={(e) => { e.stopPropagation(); removeUserPreset(u.id); }}>×</span>
            </button>
          ))}
          {/* The shared library is where the monthly preset packs land, so
              this lock is about the packs — not about capability. A student
              has the whole tool; what they don't have is the pack drops. */}
          {cloudShow.map((p) => tier !== "pro" ? (
            <button key={p.id} className="presetcard shared lockedp"
              title={`${p.name} — from the monthly preset packs. ${tier === "guest" ? UPGRADE_LINES.guest : "A new pack drops every month with Pro."}`}
              onClick={() => { if (tier === "guest") openAuth("signin"); else window.location.hash = "#/pricing"; }}>
              <span className="presetart" dangerouslySetInnerHTML={{ __html: p.thumb ?? cloudArt[p.id] ?? "" }} />
              <span className="presetname"><Lock size={11} strokeWidth={2.4} /> {p.name}</span>
            </button>
          ) : (
            <button key={p.id} className={`presetcard shared${kitName === p.name ? " on" : ""}${heldUntil(p.publish_at) ? " held" : ""}`}
              title={heldUntil(p.publish_at) ? `${p.name} — held until ${heldUntil(p.publish_at)}. Only you can see it.` : `${p.name} — preset pack`}
              onClick={() => applyCloudPreset(p.id)}>
              <span className="presetart" dangerouslySetInnerHTML={{ __html: p.thumb ?? cloudArt[p.id] ?? "" }} />
              <span className="presetname">{p.name}</span>
              {/* Only an admin ever reaches this branch with a held pack —
                  the read policy hides unreleased rows from everyone else. */}
              {isAdmin && heldUntil(p.publish_at) && (
                <span className="presethold" role="button" tabIndex={0}
                  aria-label={`Reschedule ${p.name} — currently held until ${heldUntil(p.publish_at)}`}
                  title="Click to change the release date, or clear it to ship now"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = window.prompt(`Release “${p.name}” on (YYYY-MM-DD) — clear the field to ship it now:`, (p.publish_at ?? "").slice(0, 10));
                    if (next === null) return;
                    void schedulePreset(p.id, dayToISO(next.trim())).then((err) => { if (err) window.alert(err); });
                  }}>
                  <Clock size={10} strokeWidth={2.4} /> {heldUntil(p.publish_at)}
                </span>
              )}
              {isAdmin && (
                <span className="shapedel" role="button" aria-label={`Delete shared preset ${p.name}`} title="Delete for everyone (admin)"
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete the shared preset “${p.name}” for everyone?`)) void removeCloudPresetById(p.id); }}>×</span>
              )}
            </button>
          ))}
          {presetArt().filter((p) => !hiddenStarters.includes(p.id)).map((p, pi) => {
            // the tier gate follows the CURATED index, not the folded view
            const gated = pi >= capsOf(tier).presetLimit;
            return gated ? (
              <button key={p.id} className="presetcard lockedp" title={UPGRADE_LINES[tier]}
                onClick={() => { if (tier === "guest") openAuth("signin"); else window.location.hash = "#/pricing"; }}>
                <span className="presetart" dangerouslySetInnerHTML={{ __html: p.svg }} />
                <span className="presetname"><Lock size={11} strokeWidth={2.4} /> {p.name}</span>
              </button>
            ) : (
              <button key={p.id} className={`presetcard${cfg.presetId === p.id ? " on" : ""}`} title={`${p.name} — starter preset`}
                onClick={() => setPreset(p.id)}>
                <span className="presetart" dangerouslySetInnerHTML={{ __html: p.svg }} />
                <span className="presetname">{p.name}</span>
                {isAdmin && (
                  <span className="shapedel" role="button" aria-label={`Remove starter preset ${p.name}`} title="Remove for everyone (admin) — restorable below"
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove the starter preset “${p.name}” for everyone? You can restore all removed starters later.`)) void hideStarterPreset(p.id).then((err) => { if (err) window.alert(err); }); }}>×</span>
                )}
              </button>
            );
          }).slice(0, starterCap === Infinity ? undefined : starterCap)}
        </div>
        {total > LOOKS_CAP && (
          <button className="pat-open" onClick={() => setLooksAll((v) => !v)}>
            {looksAll ? "Show fewer looks ▴" : `Show all ${total} looks ▾`}
          </button>
        )}
            </>
          );
        })()}
        <div className="helper">Each style is a different candy construction — shell, gloss and depth, not just a palette.</div>
        <div className="actionrow">
          <button className="resetstate" onClick={randomize}>
            <Dices size={14} strokeWidth={2} /> Randomize everything
          </button>
          <NameAction icon={<Copy size={13} strokeWidth={2} />} label="Save current look as a style"
            defaultName={cfg.content.label || "My style"} placeholder="Style name"
            onCommit={(n) => { saveStyle(n); }} />
        </div>
        {styleLib.length > 0 && (<>
          <div className="sublabel">My styles</div>
          <div className="stylegrid">
            {styleLib.map((st) => (
              <div key={st.id} className="stylecard">
                {st.thumb ? (
                  <button className="stylethumb" title={`Apply ${st.name} to the whole kit`} onClick={() => applyStyle(st.id)}
                    dangerouslySetInnerHTML={{ __html: st.thumb }} />
                ) : (
                  <button className="stylethumb blank" title={`Apply ${st.name} to the whole kit`} onClick={() => applyStyle(st.id)}>Aa</button>
                )}
                <div className="stylecard-row">
                  <span className="stylecard-name">{st.name}</span>
                  <button className="x" title="Delete style" aria-label={`Delete ${st.name}`} onClick={() => removeStyle(st.id)}><Trash2 size={11} strokeWidth={2} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="helper">A style is the whole material recipe — colors, surface, lighting, type, state designs. Applying one restyles every component; silhouettes stay put.</div>
        </>)}
        {isAdmin && (
          <div className="adminlooks">
            {/* the publishing desk folds away: it's operator UI, and it used
                to read as product UI ("all these little flat buttons
                'Publish Current' around is confusing" — owner) */}
            <button className="adminlooks-toggle" aria-expanded={adminLooksOpen}
              onClick={() => setAdminLooksOpen(!adminLooksOpen)}>
              <ShieldCheck size={13} strokeWidth={2.2} /> Admin · preset publishing {adminLooksOpen ? "▴" : "▾"}
            </button>
            {adminLooksOpen && (<>
              <div className="actionrow">
                {/* Dated publishing is what makes "a new pack every month"
                    keep itself: load the whole backlog in one sitting, each
                    with its drop date. */}
                <NameAction icon={<Globe size={14} strokeWidth={2} />} label="Publish current…"
                  title="Publish the current style as a preset pack — set a date to hold it until then"
                  placeholder="Pack name — Pro members see it"
                  withDate
                  onCommit={(n, day) => publishPreset(n, dayToISO(day ?? ""))} />
                <button className="resetstate" title="Review student & educator applications — approvals unlock the education price"
                  onClick={() => { window.location.hash = "#/review"; }}>
                  <GraduationCap size={14} strokeWidth={2} /> Review applications
                </button>
                {activeCloudPreset && (
                  <button className="resetstate" onClick={() => {
                    if (window.confirm(`Overwrite the shared preset “${activeCloudPreset.name}” with the current look — for everyone?`)) void overwriteActivePreset().then((err) => { if (err) window.alert(err); });
                  }}>
                    <Upload size={14} strokeWidth={2} /> Overwrite “{activeCloudPreset.name}”
                  </button>
                )}
                {hiddenStarters.length > 0 && (
                  <button className="resetstate" onClick={() => {
                    if (window.confirm(`Restore all ${hiddenStarters.length} removed starter preset${hiddenStarters.length === 1 ? "" : "s"} for everyone?`)) void restoreStarterPresets().then((err) => { if (err) window.alert(err); });
                  }}>
                    <RotateCcw size={14} strokeWidth={2} /> Restore starters ({hiddenStarters.length})
                  </button>
                )}
              </div>
              <div className="helper">Shared presets show for every visitor. Apply one, tweak it, then Overwrite to save the changes back into it.</div>
            </>)}
          </div>
        )}
      </Section>

      {/* ── A2 · Silhouette — pure geometry, material stays ── */}
      <Section id="silhouette" title={t("secSilhouette")} summary={<span>{SHAPES.find((sh) => sh.id === D.shape)?.name.split(" — ")[0]}</span>}>
        {focus && (
          <div className="helper">Picking a silhouette restyles <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus}</b> only — its shell, wells and fills all follow. Leave edit mode to change the whole kit.</div>
        )}
        {/* v56: corner smoothness lives at the TOP of the section, always
            visible — it was buried under the import notes and vanished for
            pills, which read as "missing" */}
        {(() => {
          const effSil = focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape;
          const isGothicSil = !!silhouetteMeta(effSil)?.gothicCut;
          return (<>
            <Slider label="Smoothness" value={D.bevel.softness} min={0} max={100} unit="%" disabled={isGothicSil} onChange={(v) => update((c) => { c.bevel.softness = v; })} />
            {isGothicSil && (
              <div className="helper">The Gothic cuts are authored curves — smoothness doesn't apply to them.</div>
            )}
            {effSil === "pill" && (
              <div className="helper">The pill's ends are already fully round — smoothness shows on cornered silhouettes (rectangles, chamfers, tags…).</div>
            )}
          </>);
        })()}
        <div className="silcats" role="radiogroup" aria-label="Silhouette category">
          {/* a category with nothing the viewer can see (all-preview, e.g.
              Blobs pre-release) would be an empty tab — drop its chip */}
          {["All", ...SILHOUETTE_CATEGORIES.filter((cat) =>
            SILHOUETTES.some((m) => m.category === cat && (!m.preview || isAdmin || (focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === m.id)),
          )].map((cat) => (
            <button key={cat} className={silCat === cat ? "on" : ""} role="radio" aria-checked={silCat === cat}
              onClick={() => setSilCat(cat)}>{cat}</button>
          ))}
        </div>
        <div className="shapegrid">
          {SILHOUETTES
            /* unlisted previews stay out of the public picker while they're
               being evaluated — admins see them to test */
            .filter((m) => !m.preview || isAdmin || (focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === m.id)
            /* retired stock shapes leave the picker for everyone — but only
               the picker. A kit already built on one keeps rendering, and an
               admin still sees it (with the × lit) so it can be restored. */
            .filter((m) => !hiddenSilhouettes.includes(m.id) || isAdmin || (focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === m.id)
            .filter((m) => silCat === "All" || m.category === silCat)
            .map((m) => {
              const retired = hiddenSilhouettes.includes(m.id);
              const stock = m.id.startsWith("stock:");
              return (
            <button key={m.id} className={`shapecard${baseShape(focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === m.id ? " on" : ""}${retired ? " retired" : ""}`}
              title={retired ? `${m.name} — retired from the picker` : `${m.name} — ${m.character}${m.preview && isAdmin ? " (unlisted preview — admins only)" : ""}`}
              onClick={() => { if (focus) setKitShape(focus, m.id); else update((c) => { c.shape = m.id; }); }}>
              <svg viewBox="0 0 120 56" aria-hidden="true"><path d={shapePath(m.id, 8, 8, 104, 40, D.bevel.softness)} /></svg>
              <span>{m.name}</span>
              {stock && isAdmin && (
                <span className="shapedel" role="button"
                  aria-label={retired ? `Restore ${m.name}` : `Retire ${m.name}`}
                  title={retired ? "Retired — restore all below" : "Retire this silhouette for everyone"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (retired) return;
                    if (window.confirm(`Retire "${m.name}" from the silhouette picker for everyone? Kits already using it keep working.`))
                      void retireSilhouette(m.id).then((err) => { if (err) window.alert(err); });
                  }}>×</span>
              )}
            </button>
              );
            })}
        </div>
        {(() => {
          /* the mirror toggle — always present so it never "vanishes";
             disabled (with the reason) on outlines the geometry audit
             measured as mirror-symmetric, where flipping changes nothing */
          const live = focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape;
          const base = baseShape(live);
          const canFlip = !!silhouetteMeta(base)?.flippable || base.startsWith("user:");
          return (
            <button className={`resetstate${isFlipShape(live) ? " on" : ""}`} disabled={!canFlip}
              title={canFlip
                ? "Mirror this silhouette left-to-right — asymmetric cuts point the other way; every surface and export follows"
                : "This silhouette is symmetric left-to-right, so its mirror image is identical — there's nothing to flip"}
              onClick={() => { if (!canFlip) return; const next = flipShape(live); if (focus) setKitShape(focus, next); else update((c) => { c.shape = next; }); }}>
              <ArrowLeftRight size={13} strokeWidth={2} /> Flip horizontally{isFlipShape(live) ? " — mirrored" : canFlip ? "" : " — shape is symmetric"}
            </button>
          );
        })()}
        {isAdmin && hiddenSilhouettes.length > 0 && (
          <button className="resetstate" onClick={() => {
            if (window.confirm(`Restore all ${hiddenSilhouettes.length} retired silhouette${hiddenSilhouettes.length === 1 ? "" : "s"} for everyone?`)) void restoreSilhouettes().then((err) => { if (err) window.alert(err); });
          }}>
            <RotateCcw size={14} strokeWidth={2} /> Restore silhouettes ({hiddenSilhouettes.length})
          </button>
        )}
        {userShapes.length > 0 && (
          <div className="shapegrid">
            {userShapes.map((u) => (
              <button key={u.id} className={`shapecard${(focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === u.id ? " on" : ""}`} title={`${u.name} — imported silhouette`}
                onClick={() => { if (focus) setKitShape(focus, u.id); else update((c) => { c.shape = u.id; }); }}>
                <svg viewBox="0 0 120 56" aria-hidden="true"><path d={shapePath(u.id, 8, 8, 104, 40, D.bevel.softness)} /></svg>
                <span>{u.name}</span>
                <span className="shapedel" role="button" aria-label={`Remove ${u.name}`} title="Remove"
                  onClick={(e) => { e.stopPropagation(); removeUserShape(u.id); }}>×</span>
              </button>
            ))}
          </div>
        )}
        <div className="helper">Silhouette is pure geometry — switching it keeps your material, lighting, colors and type exactly as they are.</div>
        <div className="actionrow">
        <label className="fileadd">
          <Upload size={13} strokeWidth={2} /> Import silhouette (SVG)
          <input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            f.text().then((txt) => {
              const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
              const path = doc.querySelector("path");
              const d = path?.getAttribute("d");
              if (!d) { setShapeErr("No <path> found — flatten the artwork to a single filled path first."); return; }
              const NS = "http://www.w3.org/2000/svg";
              const tmp = document.createElementNS(NS, "svg");
              tmp.setAttribute("style", "position:absolute;opacity:0;pointer-events:none");
              const pp = document.createElementNS(NS, "path");
              pp.setAttribute("d", d);
              tmp.appendChild(pp); document.body.appendChild(tmp);
              const bb = pp.getBBox(); document.body.removeChild(tmp);
              if (!bb.width || !bb.height) { setShapeErr("That path has no area — export the filled outline, not a stroke."); return; }
              setShapeErr(null);
              addUserShape({
                id: `user:${Date.now().toString(36)}`,
                name: f.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").slice(0, 22) || "Custom",
                d, vb: [bb.x, bb.y, bb.width, bb.height],
              });
            });
          }} />
        </label>
        </div>
        {shapeErr && <div className="helper" role="alert">{shapeErr}</div>}
        {/* spec copy is DESIGNER language by owner mandate ("simplify this
            spec for designer/human understandable language") — no path
            jargon, no percentages; the engine measures the rest */}
        <div className="helper">
          How to draw one: <b>one filled shape</b>, flattened — no strokes,
          groups, or images. Draw it wide, at whatever proportions look right.
          Size never matters; only the shape itself does.
        </div>
        <div className="helper">
          The ends of your drawing stay <b>exactly as drawn</b> and the middle
          stretches to fit each piece — so keep spikes and ornaments at the
          ends, give the middle a calm stretch of body, and let the shape touch
          all four edges of the drawing. Holes and floating pieces (a gem over
          a plaque) are welcome — just merge overlapping shapes into one before
          you export.
        </div>
        {/* the designer's dial over the computed label safe-area (owner:
            "let's add margin controls to make this an easy fix for any
            situation") — kit-wide, either direction */}
        <Slider label="Content margin" value={cfg.contentMargin ?? 0} min={-20} max={60} unit="px"
          onChange={(v) => update((c) => { c.contentMargin = v; })} />
        <div className="helper">
          Breathing room between every label and its silhouette's ends, kit-wide.
          Push it up when a word crowds the decoration; pull it negative to hug tighter.
        </div>
      </Section>

      {/* ── v57/58: Component content — this piece's text and glyph.
          VALUE_DRIVEN is part of the gate: plenty of pieces (rarity frame,
          toggle, compass, dials…) carry no text or glyph but DO carry a
          value — without it their slider had no section to live in
          (owner: "I clicked the component editor and nothing"). ── */}
      {(iconSwappable || labelEditable || (focus && (KIT_SLOTS[focus] || KIT_LESSONS[focus] || VALUE_DRIVEN.has(focus) || KIT_SLICEABLE[focus]))) && focus && (
        <Section id="kiticon" title={t("secKitIcon")}
          summary={<span>{(iconSwappable || iconTogglable)
            ? (kitIcons[focus] === "none" ? "no icon" : ((kitIcons[focus] as { name?: string } | undefined)?.name ?? "stock"))
            : (VALUE_DRIVEN.has(focus) ? `value ${Math.round((kitVals[focus] ?? 0.62) * 100)}%` : null)}</span>}>
          {KIT_LESSONS[focus] && <InfoCard cid={focus} />}
          {finLocked && <div className="helper"><Lock size={11} strokeWidth={2.2} /> Locked — the look is frozen, but these words and data fields are yours to edit.</div>}
          {(KIT_SLOTS[focus] ?? []).some((sl) => sl.kind === "free") && (
            <div className="slotgrid">
              {(KIT_SLOTS[focus] ?? []).filter((sl) => sl.kind === "free").map((slot) => (
                <label key={slot.id} className="slotcell">
                  <span>{slot.name}</span>
                  <input className="tinput" value={kitSlotVals[focus]?.[slot.id] ?? ""}
                    placeholder={slot.def ?? ""} maxLength={slot.maxLen ?? 40} aria-label={slot.name}
                    onChange={(e) => setKitSlot(focus, slot.id, e.target.value)} />
                </label>
              ))}
            </div>
          )}
          {/* THE value slider — the control every "driven by the value
              slider" note has been promising (owner: "i don't see the
              component's value slider anywhere"). Stages the resting
              pose; Play mode still animates on top. */}
          {VALUE_DRIVEN.has(focus) && (<>
            <Slider label="Value" value={Math.round((kitVals[focus] ?? 0.62) * 100)} min={0} max={100} unit="%"
              onChange={(v) => setKitVal(focus, v / 100)} />
            {kitVals[focus] !== undefined ? (
              <button className="resetstate" title="Back to the piece's demo value"
                onClick={() => setKitVal(focus, null)}>
                <RotateCcw size={13} strokeWidth={2} /> Demo value
              </button>
            ) : (
              <div className="helper">The resting pose — bars fill, needles point, rarity tiers pick, toggles flip. The kit page, the Board and exports all hold this frame.</div>
            )}
          </>)}
          {KIT_SLICEABLE[focus] && <SliceEditor cid={focus} />}
          {(KIT_SLOTS[focus] ?? []).map((slot) => slot.kind === "choice" && (slot.choices?.length ?? 0) > 4 ? (
            /* many options wear a dropdown — a 12-way radio row per slot
               would be a wall of chips (the emote wheel has eight slots) */
            <label key={slot.id} className="fieldbox" style={{ minWidth: 0 }}>
              <span className="fl">{slot.name}</span>
              <select value={kitSlotVals[focus]?.[slot.id] ?? slot.choices![0]} aria-label={slot.name}
                onChange={(e) => setKitSlot(focus, slot.id, e.target.value === slot.choices![0] ? null : e.target.value)}>
                {slot.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
            </label>
          ) : slot.kind === "choice" ? (
            <div key={slot.id}>
              <div className="sublabel">{slot.name}</div>
              <div className="segmini" role="radiogroup" aria-label={slot.name}>
                {(slot.choices ?? []).map((c) => {
                  const cur = kitSlotVals[focus]?.[slot.id] ?? slot.choices?.[0];
                  return (
                    <button key={c} className={cur === c ? "on" : ""} role="radio" aria-checked={cur === c}
                      onClick={() => setKitSlot(focus, slot.id, c === slot.choices?.[0] ? null : c)}>{c}</button>
                  );
                })}
              </div>
              {slot.note && <div className="helper">{slot.note}</div>}
            </div>
          ) : slot.kind === "color" && !finLocked ? (
            <div key={slot.id}>
              {kitSlotVals[focus]?.[slot.id] !== "none" && (
                <Well label={slot.name} value={kitSlotVals[focus]?.[slot.id] ?? slot.def ?? "#FFFFFF"}
                  onChange={(v) => setKitSlot(focus, slot.id, v)} />
              )}
              {slot.allowNone && (
                /* the slot's OFF switch — stores the "none" sentinel; the
                   renderer skips the feature (owner: "should have a none
                   option for the eyebrow stroke") */
                <label className="check"><input type="checkbox" checked={kitSlotVals[focus]?.[slot.id] === "none"}
                  onChange={(e) => setKitSlot(focus, slot.id, e.target.checked ? "none" : null)} />
                  None — no {slot.name.toLowerCase()}</label>
              )}
              {kitSlotVals[focus]?.[slot.id] && kitSlotVals[focus]?.[slot.id] !== "none" && (
                <button className="resetstate" title="Back to the factory color"
                  onClick={() => setKitSlot(focus, slot.id, null)}>
                  <RotateCcw size={13} strokeWidth={2} /> Factory color
                </button>
              )}
              {slot.note && <div className="helper">{slot.note}</div>}
            </div>
          ) : slot.kind === "value" ? (
            /* no input on purpose — the readout is DRIVEN; say so instead of
               offering a field that would be a lie */
            <div key={slot.id} className="helper"><b>{slot.name}</b> — {slot.note ?? "driven by the value slider."}</div>
          ) : null)}
          {labelEditable && (<>
            <div className="sublabel">Text</div>
            <input className="tinput" value={kitLabels[focus] ?? ""} maxLength={labelMaxOf(focus)}
              placeholder="Specimen text (leave empty for defaults)" aria-label="Component text"
              onChange={(e) => setKitLabel(focus, e.target.value)} />
            {iconTogglable && !finLocked && (
              <label className="check"><input type="checkbox" checked={kitIcons[focus] !== "none"}
                onChange={(e) => setKitIcon(focus, e.target.checked ? null : "none")} /> Icon at the end of the text</label>
            )}
          </>)}
          {subEditable && (
            <input className="tinput" value={kitSubs[focus] ?? ""} maxLength={24}
              placeholder={subFieldName[focus] ?? "Secondary text"} aria-label="Secondary text"
              onChange={(e) => setKitSub(focus, e.target.value)} />
          )}
          {iconSwappable && !finLocked && (<>
          <div className="sublabel">Icon</div>
          <div className="helper">Swap the glyph on <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name}</b> — the kit page, the Board and every export follow. Remove it and the text recenters. Color is right below; size, weight & effects live under <b>Typography → Icons</b>.</div>
          {/* the color, where a human looks for it (owner) — same state and
              routing as the Typography → Icons swatch, just surfaced here */}
          <label className="check"><input type="checkbox" checked={IC.color === null}
            onChange={(e) => update((c) => { c.icon.color = e.target.checked ? null : "#FFFFFF"; })} /> Inherit type color</label>
          {IC.color !== null && (
            <Well label={selectedState !== "default" ? `Color — ${STATE_LABEL[selectedState]} only` : "Icon color"}
              value={IC.color} onChange={(v) => update((c) => { c.icon.color = v; })} />
          )}
          {selectedState !== "default" && (
            <div className="helper">You're editing <b>{STATE_LABEL[selectedState]}</b> — this color pins to that state only. Pick Default in Global to set the resting color.</div>
          )}
          <div className="actionrow">
            <button className={`resetstate${kitIcons[focus] === "none" ? " on" : ""}`} onClick={() => setKitIcon(focus, kitIcons[focus] === "none" ? null : "none")}>
              <Trash2 size={13} strokeWidth={2} /> {kitIcons[focus] === "none" ? "Icon removed — bring it back" : "Remove the icon"}
            </button>
            {kitIcons[focus] && kitIcons[focus] !== "none" && (
              <button className="resetstate" onClick={() => setKitIcon(focus, null)}>
                <RotateCcw size={13} strokeWidth={2} /> Back to the stock glyph
              </button>
            )}
          </div>
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Icon library</span>
            <select value={browseLib} aria-label="Icon library" onChange={(e) => setBrowseLib(e.target.value)}>
              {ICON_LIBS.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.note}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <div className="searchbox">
            <Search size={15} strokeWidth={2} />
            <input value={iconQuery} placeholder={`Search ${ICON_LIBS.find((l) => l.id === browseLib)?.name}...`} aria-label="Search component icons"
              onChange={(e) => setIconQuery(e.target.value)} />
          </div>
          {!libIsReady && <div className="helper">Loading library…</div>}
          <div className="icongrid">
            {results.map((name) => {
              const cur = kitIcons[focus];
              const def = getDef(browseLib, name);
              if (!def) return null;
              const on = cur !== "none" && cur?.lib === browseLib && cur?.name === name;
              return (
                <button key={name} className={on ? "on" : ""} title={name}
                  onClick={() => setKitIcon(focus, def)}
                  dangerouslySetInnerHTML={{ __html: previewSvg(def) }} />
              );
            })}
          </div>
          </>)}
        </Section>
      )}

      {/* ── v61: Bar — the dock system + segment settings ── */}
      {focus && (focus === "progress" || focus === "segbar") && (
        <Section id="barsec" title={t("secBar")}
          summary={<span>{(kitBar[focus]?.dock ?? false) ? "docked" : "plain"}</span>}>
          <div className="sublabel">Emblem socket</div>
          <label className="check"><input type="checkbox" checked={kitBar[focus]?.dock ?? false}
            onChange={(e) => setKitBar(focus, { dock: e.target.checked })} /> Dock a socket on the track</label>
          {(kitBar[focus]?.dock ?? false) && (
            <div className="segmini" role="radiogroup" aria-label="Dock side">
              {(["left", "right"] as const).map((sd) => (
                <button key={sd} className={(kitBar[focus]?.dockSide ?? "left") === sd ? "on" : ""} role="radio"
                  aria-checked={(kitBar[focus]?.dockSide ?? "left") === sd}
                  onClick={() => setKitBar(focus, { dockSide: sd })}>{sd === "left" ? "Left" : "Right"}</button>
              ))}
            </div>
          )}
          <div className="helper">A silhouette-aware mini shell riding the bar's end — the full candy stack at emblem size. Its glyph comes from <b>Component content</b> above; remove the icon there for an empty socket (drop art in-engine).</div>
          {focus === "segbar" && (<>
            <div className="sublabel">Segments</div>
            <Slider label="Segments" value={kitBar.segbar?.segments ?? 5} min={2} max={12} unit="" onChange={(v) => setKitBar("segbar", { segments: v })} />
            <Slider label="Gap" value={kitBar.segbar?.gap ?? 6} min={2} max={14} unit="px" onChange={(v) => setKitBar("segbar", { gap: v })} />
            {/* smooth mode is parked (owner call) — cells light one by one;
                the renderer snaps regardless, so the toggle would lie */}
            <div className="helper">Cells light one by one — stamina pips.</div>
          </>)}
        </Section>
      )}

      {/* ── B · Color — THE color editor ──────────────────── */}
      <Section id="mapping" title={t("secColor")}
        right={
          <span className="inlinectl" onClick={(e) => e.stopPropagation()}>
            <button className="chipbtn" title="Randomize colors" aria-label="Randomize colors" onClick={randomizeColors}>
              <Dices size={14} strokeWidth={2} />
            </button>
          </span>
        }
        summary={<span className="mapbar" style={{ background: mapBar }} />}>
        <span className="mapbar wide" style={{ background: mapBar }} />
        <div className="maplist">
          {presentRoles.map((r) => (
            <div className="maprow" key={r}>
              <span className="chipwell sm" style={{ background: D.effects[r] }}>
                <input type="color" value={D.effects[r]} aria-label={`${r} color`}
                  onChange={(e) => { update((c) => { c.effects[r] = e.target.value; }); recordRecent(e.target.value); }} />
              </span>
              <span className="mr-role">{r}</span>
              <ChevronRight size={12} strokeWidth={2} style={{ color: "var(--ink3)" }} />
              <span className="mr-hint">{ROLE_HINT[r]}</span>
            </div>
          ))}
        </div>
        <div className="chips" style={{ gap: 8 }}>
          <button className="chipbtn" disabled={missingRoles.length === 0} title={missingRoles.length ? `Add ${missingRoles[0]}` : "All effects present"}
            onClick={() => update((c) => { c.effects[missingRoles[0]] = PRESETS.find((p) => p.id === c.presetId)?.effects[missingRoles[0]] ?? "#888888"; })}>
            <Plus size={14} strokeWidth={2} />
          </button>
          <button className="chipbtn" disabled={presentRoles.length <= 1} title="Remove last effect color"
            onClick={() => update((c) => { delete c.effects[presentRoles[presentRoles.length - 1]]; })}>
            <Minus size={14} strokeWidth={2} />
          </button>
          <span className="helper" style={{ alignSelf: "center" }}>component-only · never the shell</span>
        </div>
        {/* ── the rarity system: five tiers, the maker's own names and
            hues — kit-wide by design (owner: "developers will likely
            have their own logic they want to employ") ── */}
        <div className="sublabel subhelp">Rarity tiers
          <button className={`helpdot${rarityHelp ? " on" : ""}`} aria-label="How rarity works"
            aria-expanded={rarityHelp} onClick={() => setRarityHelp((v) => !v)}>?</button>
        </div>
        {rarityHelp && (
          <div className="helper">
            <b>How rarity works:</b> the Value slider on a rarity piece (under Component content)
            picks which tier is displayed — think of it as posing the component for preview and
            export. These five tiers define the system itself: your ranks, your names, your colors.
            It&apos;s one shared system across the whole kit, so your game&apos;s rarity language stays
            consistent everywhere — in your engine, you&apos;d drive the displayed tier from your own
            item data, using these five looks.
          </div>
        )}
        {RARITY_FACTORY.map((f, i) => {
          const ov = cfg.rarity?.[i];
          const setTier = (patch: Partial<{ name: string; c: string }>) => update((c) => {
            const base = c.rarity ?? RARITY_FACTORY.map((t2) => ({ name: t2.name, c: t2.c }));
            c.rarity = base.map((t2, j) => (j === i ? { ...t2, ...patch } : { ...t2 }));
          });
          return (
            <div className="rarityrow" key={f.name}>
              <span className="chipwell sm" style={{ background: ov?.c ?? f.c }}>
                <input type="color" value={ov?.c ?? f.c} aria-label={`Tier ${i + 1} color`}
                  onChange={(e) => { setTier({ c: e.target.value }); recordRecent(e.target.value); }} />
              </span>
              <input className="tinput" value={ov?.name ?? f.name} maxLength={14} aria-label={`Tier ${i + 1} name`}
                placeholder={f.name} onChange={(e) => setTier({ name: e.target.value })} />
            </div>
          );
        })}
        {cfg.rarity && (
          <button className="resetstate" title="Back to the genre-standard tiers"
            onClick={() => update((c) => { c.rarity = null; })}>
            <RotateCcw size={13} strokeWidth={2} /> Factory tiers
          </button>
        )}
      </Section>

      {/* ── C · Structure — the object's build ────────────── */}
      <Section id="structure" title={t("secStructure")}>
        {(() => {
          /* the banner's tail geometry only reads clean between 13 and 33 —
             its slider is contained to that range (other shapes keep 2–34) */
          const effShape = focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape;
          // goth3 runs uncapped like the classics (owner: "remove the 4
          // limit and see what happens with these")
          const wMin = effShape === "banner" ? 13 : 2, wMax = effShape === "banner" ? 33 : 34;
          return (
            <>
              <Slider label="Wall width" value={Math.min(wMax, Math.max(wMin, D.bevel.width))} min={wMin} max={wMax} unit="px"
                onChange={(v) => update((c) => { c.bevel.width = v; c.bevel.off = false; })} />
              <label className="check"><input type="checkbox" checked={D.bevel.off ?? false}
                onChange={(e) => update((c) => { c.bevel.off = e.target.checked; })} /> No wall — face fills the whole silhouette</label>
            </>
          );
        })()}
        <Slider label="Rim width" value={C.rim.width} min={0} max={10} unit="px" onChange={(v) => update((c) => { c.candy.rim.width = v; })} />
        <Slider label="Rim brightness" value={C.rim.brightness} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.rim.brightness = v; })} />
        <Slider label="Inner edge" value={C.innerEdge.strength} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.innerEdge.strength = v; })} />
        <Slider label="Edge width" value={C.innerEdge.width} min={0} max={6} unit="px" onChange={(v) => update((c) => { c.candy.innerEdge.width = v; })} />
        <Slider label="Extrusion depth" value={C.extrusion.depth} min={0} max={48} unit="px" onChange={(v) => update((c) => { c.candy.extrusion.depth = v; })} />
      </Section>

      {/* ── D · Surface ───────────────────────────────────── */}
      <Section id="surface" title={t("secSurface")}
        right={
          <span className="inlinectl" onClick={(e) => e.stopPropagation()}>
            <select className="tinysel" value={D.face.mode} aria-label="Face mode"
              onChange={(e) => update((c) => { c.face.mode = e.target.value as "light" | "dark"; })}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </span>
        }>
        <Slider label="Face contrast" value={D.face.contrast} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.face.contrast = v; })} />
        <Slider label="Gradient mid" value={D.face.midpoint} min={10} max={90} unit="%" onChange={(v) => update((c) => { c.face.midpoint = v; })} />

        <div className="sublabel">Pattern</div>
        <label className="fieldbox" style={{ minWidth: 0 }}>
          <span className="fl">Pattern</span>
          <select value={C.pattern.type} aria-label="Pattern type"
            onChange={(e) => update((c) => { c.candy.pattern.type = e.target.value as typeof C.pattern.type; })}>
            {PATTERN_TYPES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
        </label>
        {C.pattern.type !== "none" && (<>
          <Slider label="Scale" value={C.pattern.scale} min={10} max={100} unit="%" onChange={(v) => update((c) => { c.candy.pattern.scale = v; })} />
          <Slider label="Angle" value={C.pattern.angle} min={0} max={180} unit="°" onChange={(v) => update((c) => { c.candy.pattern.angle = v; })} />
          <Slider label="Opacity" value={C.pattern.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.pattern.opacity = v; })} />
          <label className="check"><input type="checkbox" checked={C.pattern.color === null}
            onChange={(e) => update((c) => { c.candy.pattern.color = e.target.checked ? null : (c.effects.Bevel ?? "#0E9CC9"); })} /> Tone-on-tone (auto)</label>
          {C.pattern.color !== null && (
            <Well label="Pattern color" value={C.pattern.color} onChange={(v) => update((c) => { c.candy.pattern.color = v; })} />
          )}
        </>)}

        <div className="sublabel">Wall pattern</div>
        <label className="fieldbox" style={{ minWidth: 0 }}>
          <span className="fl">Pattern</span>
          <select value={C.pattern.wall?.type ?? "none"} aria-label="Wall pattern type"
            onChange={(e) => update((c) => {
              const t2 = e.target.value as typeof C.pattern.type;
              if (t2 === "none") { c.candy.pattern.wall = undefined; return; }
              // first enable inherits the face knobs as a starting point
              const p = c.candy.pattern;
              c.candy.pattern.wall = { ...(p.wall ?? { scale: p.scale, angle: p.angle, opacity: Math.max(p.opacity, 40), color: p.color }), type: t2 };
            })}>
            {PATTERN_TYPES.map((p) => <option key={p.id} value={p.id}>{p.id === "none" ? "None" : p.name}</option>)}
          </select>
          <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
        </label>
        {C.pattern.wall && C.pattern.wall.type !== "none" && (<>
          <Slider label="Scale" value={C.pattern.wall.scale} min={10} max={100} unit="%" onChange={(v) => update((c) => { if (c.candy.pattern.wall) c.candy.pattern.wall.scale = v; })} />
          <Slider label="Angle" value={C.pattern.wall.angle} min={0} max={180} unit="°" onChange={(v) => update((c) => { if (c.candy.pattern.wall) c.candy.pattern.wall.angle = v; })} />
          <Slider label="Opacity" value={C.pattern.wall.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { if (c.candy.pattern.wall) c.candy.pattern.wall.opacity = v; })} />
          <label className="check"><input type="checkbox" checked={C.pattern.wall.color === null}
            onChange={(e) => update((c) => { if (c.candy.pattern.wall) c.candy.pattern.wall.color = e.target.checked ? null : (c.effects.Bevel ?? "#0E9CC9"); })} /> Tone-on-tone (auto)</label>
          {C.pattern.wall.color !== null && (
            <Well label="Wall pattern color" value={C.pattern.wall.color} onChange={(v) => update((c) => { if (c.candy.pattern.wall) c.candy.pattern.wall.color = v; })} />
          )}
        </>)}

        <div className="sublabel">Micro grain</div>
        <Slider label="Amount" value={C.texture.amount} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.texture.amount = v; })} />
        {C.texture.amount > 0 && (
          <Slider label="Grain size" value={C.texture.scale} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.texture.scale = v; })} />
        )}

        <Adv label="Transparency" active={D.transparency.frame < 100 || D.transparency.interior < 100 || D.transparency.content < 100}>
          <Slider label="Frame" value={D.transparency.frame} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.transparency.frame = v; })} />
          <Slider label="Interior" value={D.transparency.interior} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.transparency.interior = v; })} />
          <Slider label="Text" value={D.transparency.content} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.transparency.content = v; })} />
        </Adv>
      </Section>

      {/* ── E · Lighting ──────────────────────────────────── */}
      <Section id="bars" title={t("secBarsFills")} summary={<span>{cfg.barFx?.grad2.on || cfg.barFx?.glow.on || cfg.barFx?.shadow.on ? "Styled" : "Plain"}</span>}>
        <div className="helper">Styling layers for every bar fill — progress bars, slider fills, data-row bars. One edit restyles all of them.</div>
        <FxToggle label="Second gradient" on={cfg.barFx?.grad2.on ?? false}
          onToggle={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.on = v; })}>
          <Well label="From" value={cfg.barFx?.grad2.color1 ?? "#FFFFFF"} onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.color1 = v; })} />
          <Well label="To" value={cfg.barFx?.grad2.color2 ?? "#7ADCFF"} onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.color2 = v; })} />
          <div className="ctl">
            <label>Blend</label>
            <select value={cfg.barFx?.grad2.blend ?? "soft-light"} aria-label="Bar gradient blend mode"
              onChange={(e) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.blend = e.target.value as BlendMode; })}>
              {(["normal", "multiply", "screen", "overlay", "soft-light", "hard-light"] as const).map((bm) => <option key={bm} value={bm}>{bm}</option>)}
            </select>
          </div>
          <Slider label="Opacity" value={cfg.barFx?.grad2.opacity ?? 55} min={0} max={100} unit="%" onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.opacity = v; })} />
          <label className="checkrow"><input type="checkbox" checked={cfg.barFx?.grad2.vertical ?? true}
            onChange={(e) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.grad2.vertical = e.target.checked; })} /> Vertical sweep</label>
        </FxToggle>
        <FxToggle label="Fill glow" on={cfg.barFx?.glow.on ?? false}
          onToggle={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.glow.on = v; })}>
          <Well label="Color" value={cfg.barFx?.glow.color ?? "#8FF0FF"} onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.glow.color = v; })} />
          <Slider label="Size" value={cfg.barFx?.glow.size ?? 7} min={2} max={18} unit="px" onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.glow.size = v; })} />
          <Slider label="Opacity" value={cfg.barFx?.glow.opacity ?? 70} min={0} max={100} unit="%" onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.glow.opacity = v; })} />
        </FxToggle>
        <FxToggle label="Inner shadow" on={cfg.barFx?.shadow.on ?? false}
          onToggle={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.shadow.on = v; })}>
          <Slider label="Opacity" value={cfg.barFx?.shadow.opacity ?? 40} min={0} max={90} unit="%" onChange={(v) => update((c) => { const b = c.barFx ?? (c.barFx = defaultBarFx()); b.shadow.opacity = v; })} />
        </FxToggle>
        <div className="sublabel">Dragger ball</div>
        <label className="check"><input type="checkbox" checked={(cfg.knob?.color ?? null) === null}
          onChange={(e) => update((c) => { c.knob = { color: e.target.checked ? null : (c.effects.Bevel ?? "#0E9CC9") }; })} /> Knob color from Color map</label>
        {(cfg.knob?.color ?? null) !== null && (
          <Well label="Knob color" value={cfg.knob!.color!} onChange={(v) => update((c) => { c.knob = { color: v }; })} />
        )}
        <div className="helper">The candy ball on sliders, toggles and joysticks. Following the Color map keeps it on the Bevel role.</div>
      </Section>

      <Section id="lighting" title={t("secLighting")} summary={<span>{D.lighting.angle}°</span>}>
        <label className="check"><input type="checkbox" checked={D.lighting.tint != null}
          onChange={(e) => update((c) => { c.lighting.tint = e.target.checked ? (c.effects.Highlight ?? "#FFFFFF") : null; })} /> Tint the key light</label>
        {D.lighting.tint != null && (
          <Well label="Light color" value={D.lighting.tint} onChange={(v) => update((c) => { c.lighting.tint = v; })} />
        )}
        <Slider label="Light angle" value={D.lighting.angle} min={0} max={360} unit="°" onChange={(v) => update((c) => { c.lighting.angle = ((v % 360) + 360) % 360; })} />
        <div className="ctl">
          <label>Direction</label>
          <AngleDial value={D.lighting.angle} onChange={(v) => update((c) => { c.lighting.angle = v; })} />
          <span className="mr-hint">drag the dial or slide above</span>
        </div>
        <Slider label="Highlight" value={D.lighting.highlight} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.lighting.highlight = v; })} />
        <Slider label="Lowlight" value={D.lighting.lowlight} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.lighting.lowlight = v; })} />
        <div className="helper">One key light drives every layer — gradients, gloss side, specular position, extrusion flanks and the shadow direction.</div>
      </Section>

      {/* ── F · Gloss & Reflections ───────────────────────── */}
      <Section id="gloss" title={t("secGloss")}
        right={
          <span className="inlinectl" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={C.gloss.on} aria-label="Gloss on"
              onChange={(e) => update((c) => { c.candy.gloss.on = e.target.checked; })} />
          </span>
        }>
        {C.gloss.on && (<>
        <Slider label="Gloss height" value={C.gloss.height} min={10} max={90} unit="%" onChange={(v) => update((c) => { c.candy.gloss.height = v; })} />
        <Slider label="Curvature" value={C.gloss.curve} min={-40} max={60} unit="px" onChange={(v) => update((c) => { c.candy.gloss.curve = v; })} />
        <Slider label="Gloss opacity" value={C.gloss.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.gloss.opacity = v; })} />
        <Slider label="Softness" value={C.gloss.softness} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.gloss.softness = v; })} />
        <div className="ctl">
          <label>Gloss fill</label>
          <div className="segmini" role="radiogroup" aria-label="Gloss fill">
            {([["highlight", "Auto"], ["custom", "Color"], ["gradient", "Gradient"]] as const).map(([v, t]) => (
              <button key={v} className={C.gloss.fill === v ? "on" : ""} role="radio" aria-checked={C.gloss.fill === v}
                onClick={() => update((c) => { c.candy.gloss.fill = v; })}>{t}</button>
            ))}
          </div>
        </div>
        {C.gloss.fill !== "highlight" && (<>
          <Well label={C.gloss.fill === "gradient" ? "Gloss top" : "Gloss color"} value={C.gloss.tint}
            onChange={(v) => update((c) => { c.candy.gloss.tint = v; })} />
          {C.gloss.fill === "gradient" && (
            <button className="resetstate" onClick={() => update((c) => { const t = c.candy.gloss.tint; c.candy.gloss.tint = c.candy.gloss.tint2; c.candy.gloss.tint2 = t; })}>
              <ArrowUpDown size={13} strokeWidth={2} /> Swap gloss colors
            </button>
          )}
        </>)}
        {C.gloss.fill === "gradient" && (
          <Well label="Gloss bottom" value={C.gloss.tint2}
            onChange={(v) => update((c) => { c.candy.gloss.tint2 = v; })} />
        )}
        <Adv label="Fine-tune gloss" active={(C.gloss.blend ?? "normal") !== "normal" || C.gloss.layer !== "below"}>
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Gloss blend mode</span>
            <select value={C.gloss.blend ?? "normal"} aria-label="Gloss blend mode" onChange={(e) => update((c) => { c.candy.gloss.blend = e.target.value as BlendMode; })}>
              {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <div className="ctl">
            <label>Layering</label>
            <div className="segmini" role="radiogroup" aria-label="Gloss layering">
              {([["below", "Below text"], ["above", "Above text"]] as const).map(([v, t]) => (
                <button key={v} className={C.gloss.layer === v ? "on" : ""} role="radio" aria-checked={C.gloss.layer === v}
                  onClick={() => update((c) => { c.candy.gloss.layer = v; })}>{t}</button>
              ))}
            </div>
          </div>
          <div className="helper">Above text seals the label under the candy shell; below keeps it crisp and UI-like.</div>
        </Adv>
        </>)}
        <div className="sublabel">Specular</div>
        <label className="check"><input type="checkbox" checked={C.specular.on} onChange={(e) => update((c) => { c.candy.specular.on = e.target.checked; })} /> Specular reflections</label>
        {C.specular.on && (<>
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Specular type</span>
            <select value={C.specular.mode} aria-label="Specular type"
              onChange={(e) => update((c) => { c.candy.specular.mode = e.target.value as typeof C.specular.mode; })}>
              {SPECULAR_MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <Slider label="Size" value={C.specular.size} min={4} max={100} unit="px" onChange={(v) => update((c) => { c.candy.specular.size = v; })} />
          <Slider label="Shape" value={C.specular.stretch} min={10} max={100} unit="%" onChange={(v) => update((c) => { c.candy.specular.stretch = v; })} />
          <Slider label="Intensity" value={C.specular.intensity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.specular.intensity = v; })} />
          <Adv label="Fine-tune specular" active={(C.specular.blend ?? "normal") !== "normal"}>
            {C.specular.mode !== "anime" && (
              <Slider label="Softness" value={C.specular.softness} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.specular.softness = v; })} />
            )}
            <label className="fieldbox" style={{ minWidth: 0 }}>
              <span className="fl">Specular blend mode</span>
              <select value={C.specular.blend ?? "normal"} aria-label="Specular blend mode" onChange={(e) => update((c) => { c.candy.specular.blend = e.target.value as BlendMode; })}>
                {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
            </label>
            {(C.specular.mode === "dual" || C.specular.mode === "anime") && (
              <Slider label="Spacing" value={C.specular.gap} min={50} max={300} unit="%" onChange={(v) => update((c) => { c.candy.specular.gap = v; })} />
            )}
            {C.specular.mode !== "sweep" && (<>
              <Slider label="Angle" value={C.specular.angle} min={-80} max={80} unit="°" onChange={(v) => update((c) => { c.candy.specular.angle = v; })} />
              <Slider label="Nudge X" value={C.specular.ox} min={-50} max={50} unit="" onChange={(v) => update((c) => { c.candy.specular.ox = v; })} />
              <Slider label="Nudge Y" value={C.specular.oy} min={-50} max={50} unit="" onChange={(v) => update((c) => { c.candy.specular.oy = v; })} />
              <div className="helper">The mark rides the silhouette's lit edge — Nudge X travels it edge to edge, Nudge Y sets how deep below the shell it sits, Angle tilts the cut of its ends.</div>
            </>)}
          </Adv>
        </>)}
        <div className="sublabel">Lower bloom</div>
        <Slider label="Bloom" value={C.bloom.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.bloom.opacity = v; })} />
        <Slider label="Bloom size" value={C.bloom.size} min={10} max={100} unit="%" onChange={(v) => update((c) => { c.candy.bloom.size = v; })} />
      </Section>

      {/* ── F2 · Glow — light living inside the candy ─────── */}
      <Section id="glow" title={t("secGlow")} summary={<span>{C.innerGlow.opacity}%</span>}>
        <div className="sublabel">Inner glow</div>
        <Slider label="Opacity" value={C.innerGlow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.innerGlow.opacity = v; })} />
        <Slider label="Spread" value={C.innerGlow.size} min={10} max={100} unit="%" onChange={(v) => update((c) => { c.candy.innerGlow.size = v; })} />
        <label className="check"><input type="checkbox" checked={C.innerGlow.color === null}
          onChange={(e) => update((c) => { c.candy.innerGlow.color = e.target.checked ? null : (c.effects.Glow ?? "#8FF0FF"); })} /> Color from Color map</label>
        {C.innerGlow.color !== null && (
          <Well label="Glow color" value={C.innerGlow.color} onChange={(v) => update((c) => { c.candy.innerGlow.color = v; })} />
        )}
        <div className="helper">Colored light inside the candy, rising from the unlit side.</div>
        <div className="sublabel">Base glow</div>
        <Slider label="Base glow" value={C.extrusion.glow} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.extrusion.glow = v; })} />
        <div className="helper">Light caught in the middle of the body, below the lower bloom. Uses the inner-glow color.</div>
      </Section>

      {/* ── G · Depth & Shadow ────────────────────────────── */}
      <Section id="depth" title={t("secDepth")}>
        {/* the contact floor ellipse is retired (owner call) — the cast
            drop shadow is the kit's one grounding layer */}
        <div className="sublabel">Cast shadow</div>
        <Slider label="Distance" value={D.shadow.distance} min={0} max={48} unit="px" onChange={(v) => update((c) => { c.shadow.distance = v; })} />
        <Slider label="Blur" value={D.shadow.blur} min={0} max={60} unit="px" onChange={(v) => update((c) => { c.shadow.blur = v; })} />
        <Slider label="Opacity" value={D.shadow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.shadow.opacity = v; })} />
        <div className="sublabel">Body shading</div>
        <Slider label="Darkness" value={C.extrusion.darkness} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.extrusion.darkness = v; })} />
        <div className="helper">The body is lit by the key light — its flanks brighten and darken as you spin the angle. Pressing compresses it.</div>
      </Section>

      {/* ── Data row — its own control model: two independent text groups,
            slot toggles, safe bounds. Objectives share this editor. ── */}
      {(focus === "datarow") && (
        <Section id="datarowsec" title={t("secDataRow")}>
          <div className="sublabel">Text group A — title</div>
          <input className="tinput" value={kitRow.title} maxLength={32} aria-label="Row title"
            onChange={(e) => setKitRow({ title: e.target.value })} />
          <Slider label="Size" value={kitRow.titleSize} min={60} max={160} unit="%" onChange={(v) => setKitRow({ titleSize: v })} />
          <Slider label="Tracking" value={kitRow.titleTrack} min={-5} max={20} unit="" onChange={(v) => setKitRow({ titleTrack: v })} />
          <Slider label="Nudge Y" value={kitRow.titleDy} min={-20} max={20} unit="px" onChange={(v) => setKitRow({ titleDy: v })} />
          <div className="sublabel">Text group B — second line</div>
          <label className="check"><input type="checkbox" checked={kitRow.subOn ?? true} onChange={(e) => setKitRow({ subOn: e.target.checked })} /> Show the second line</label>
          <input className="tinput" value={kitRow.sub} maxLength={40} aria-label="Row subtitle"
            onChange={(e) => setKitRow({ sub: e.target.value })} />
          <Slider label="Size" value={kitRow.subSize} min={50} max={160} unit="%" onChange={(v) => setKitRow({ subSize: v })} />
          <Slider label="Tracking" value={kitRow.subTrack} min={-5} max={20} unit="" onChange={(v) => setKitRow({ subTrack: v })} />
          <Slider label="Nudge Y" value={kitRow.subDy} min={-40} max={40} unit="px" onChange={(v) => setKitRow({ subDy: v })} />
          <label className="check"><input type="checkbox" checked={(kitRow.subColor ?? null) === null}
            onChange={(e) => setKitRow({ subColor: e.target.checked ? null : "#B7C6DA" })} /> Soft white — the kit's default</label>
          {kitRow.subColor != null && (
            <Well label="Line 2 color" value={kitRow.subColor} onChange={(v) => setKitRow({ subColor: v })} />
          )}
          <div className="sublabel">Leading</div>
          <Slider label="Leading" value={kitRow.lineGap ?? 0} min={-30} max={80} unit="px" onChange={(v) => setKitRow({ lineGap: v })} />
          <Slider label="Block shift" value={kitRow.blockDy ?? 0} min={-24} max={24} unit="px" onChange={(v) => setKitRow({ blockDy: v })} />
          <div className="helper">Leading opens or closes the space between the title and subtitle; block shift rides both lines up or down together.</div>
          <div className="sublabel">Slots</div>
          <label className="check"><input type="checkbox" checked={kitRow.avatar} onChange={(e) => setKitRow({ avatar: e.target.checked })} /> Portrait / icon slot</label>
          <label className="check"><input type="checkbox" checked={kitRow.progress} onChange={(e) => setKitRow({ progress: e.target.checked })} /> Progress bar</label>
          <label className="check"><input type="checkbox" checked={kitRow.action} onChange={(e) => setKitRow({ action: e.target.checked })} /> Trailing action / status</label>
          {kitRow.progress && (
            <Slider label="Progress" value={kitRow.value} min={0} max={100} unit="%" onChange={(v) => setKitRow({ value: v })} />
          )}
          <div className="helper">Long titles clip inside the row's safe text bounds — they never push the layout. Objective rows use this same model.</div>
        </Section>
      )}

      {/* ── H · Typography (content lives here too) ───────── */}
      <Section id="typography" title={t("secTypography")} summary={<span>{cfg.content.label || T2.font}</span>}>
        {/* v60: with a text-bearing component in focus this field edits THAT
            component's label (the same override as Component content) — the
            master's specimen text only shows when nothing is focused */}
        {focus && labelEditable ? (
          <>
            <input className="tinput" value={kitLabels[focus] ?? ""} maxLength={labelMaxOf(focus)} aria-label="Label text"
              placeholder={`${KIT_COMPONENTS.find((c) => c.id === focus)?.name} text — empty for the default`}
              onChange={(e) => setKitLabel(focus, e.target.value)} />
            {iconTogglable && (
              <label className="check"><input type="checkbox" checked={kitIcons[focus] !== "none"}
                onChange={(e) => setKitIcon(focus, e.target.checked ? null : "none")} /> Icon at the end of the text</label>
            )}
            {subEditable && (
              <input className="tinput" value={kitSubs[focus] ?? ""} maxLength={24} aria-label="Secondary text"
                placeholder={subFieldName[focus] ?? "Secondary text"}
                onChange={(e) => setKitSub(focus, e.target.value)} />
            )}
            <div className="helper">This text belongs to <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name}</b> — the kit page, the Board and exports follow. Clear it to fall back to the default.</div>
          </>
        ) : (
          <input className="tinput" value={cfg.content.label} maxLength={32} aria-label="Label text"
            onChange={(e) => update((c) => { c.content.label = e.target.value; })} />
        )}
        {(() => {
          // the translation liner note — only when the label is a dictionary
          // CTA sitting in a language the current face carried in
          const e2 = ctaEntry(focus && labelEditable ? (kitLabels[focus] ?? "") : cfg.content.label);
          const showing = e2 && (focus && labelEditable ? (kitLabels[focus] ?? "") : cfg.content.label).trim() === e2.zh;
          return showing ? (
            <InfoNote summary={<>“{e2.zh}” = <b>{e2.en}</b> — {e2.gloss}.</>}>
              Swapped in automatically for the Chinese face ({fontLang(T2.font) === "zh" ? T2.font : "previous font"}). Type anything to replace it — bespoke labels are never auto-translated. Picking a Latin face swaps a dictionary CTA back to English.
            </InfoNote>
          ) : null;
        })()}
        <input className="tinput" value={T2.highlight ?? ""} maxLength={32} placeholder="Highlight phrase — e.g. VICTORY" aria-label="Highlight phrase"
          onChange={(e) => update((c) => { c.type.highlight = e.target.value; })} />
        <div className="helper">The first matching word or phrase inside the label renders as a brighter, illuminated portion of the same material. Leave empty for none.</div>
        <FontPicker value={T2.font} customFonts={T2.customFonts ?? []}
          onPick={(f) => {
            ensureFont(f);
            update((c) => {
              c.type.font = f;
              // the face's real capabilities bound the weight; width resets
              // to the axis default (or clears for faces without the axis)
              const caps = fontByName(f).caps;
              c.type.weight = clampWeight(caps, c.type.weight);
              c.type.width = caps?.wdth ? caps.wdth[2] : undefined;
              // the CTA takeover — a recognized label follows the face's
              // language (owner: "default chinese words that take over the
              // moment I switch to those fonts"); bespoke labels stay put
              const swap = ctaForFont(c.content.label, f);
              if (swap) c.content.label = swap;
            });
          }} />
        <div className="addfont">
          <input className="tinput" value={fontDraft} placeholder="Add Google Font — exact family name" aria-label="Add Google Font"
            onChange={(e) => setFontDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addFont(); }} />
          <button className="chipbtn" title="Add font" aria-label="Add font" onClick={addFont} disabled={!fontDraft.trim()}>
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="helper">Paste the family name exactly as it appears on fonts.google.com (e.g. “Titan One”).</div>
        <label className="fieldbox" style={{ minWidth: 0 }}>
          <span className="fl">List font</span>
          <select value={cfg.type.listFont ?? ""} aria-label="List font"
            onChange={(e) => { const v = e.target.value || null; if (v) ensureFont(v); update((c) => { c.type.listFont = v; }); }}>
            <option value="">Match the display font</option>
            {GAME_FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
        </label>
        <div className="helper">Reading text — quest lists, menus, choice lists, dialogue lines, chat messages — speaks this face; titles and plates keep the display font. A loud display face is a headline voice, not a reading voice.</div>
        {/* the reading voice's COLOR, one dial for every list-face surface
            (owner: "change the color of this list font and list fonts
            everywhere") — Auto keeps each surface's designed ink; a piece's
            own body-color control (the dialogue box) still wins. */}
        <div className="ctl">
          <label>List ink</label>
          <div className="segmini" role="radiogroup">
            <button className={!T2.listInk ? "on" : ""} role="radio" aria-checked={!T2.listInk}
              onClick={() => update((c) => { c.type.listInk = null; })}>Auto</button>
            <button className={T2.listInk ? "on" : ""} role="radio" aria-checked={!!T2.listInk}
              onClick={() => update((c) => { if (!c.type.listInk) c.type.listInk = "#FFFFFF"; })}>Custom</button>
          </div>
        </div>
        {T2.listInk ? (
          <Well label="List ink" value={T2.listInk} onChange={(v) => update((c) => { c.type.listInk = v; })} />
        ) : (
          <div className="helper">The reading text's color, everywhere the list face speaks. Auto keeps each surface's designed ink; Custom pins your color. The dialogue box's own body color still wins there.</div>
        )}
        <Slider label="Size" value={T2.size} min={28} max={140} unit="px" onChange={(v) => update((c) => { c.type.size = v; })} />
        {/* stacked labels only — the gap between lines, % of factory leading
            (owner: "leading controls for the type, at least here"). Shown
            exactly where it acts; widen the list as more stacks adopt it. */}
        {focus === "endturn" && (
          <Slider label="Leading" value={T2.leading ?? 100} min={60} max={220} unit="%" onChange={(v) => update((c) => { c.type.leading = v; })} />
        )}
        {focus ? (
          <>
            <Slider label="Nudge Y" value={kitTextOy[`${focus}:${effKitSize(kitSizes[focus])}`] ?? T2.oy ?? 0} min={-20} max={20} unit="px"
              onChange={(v) => setKitTextOy(`${focus}:${effKitSize(kitSizes[focus])}`, v)} />
            <Slider label="Nudge X" value={kitTextOx[`${focus}:${effKitSize(kitSizes[focus])}`] ?? T2.ox ?? 0} min={-20} max={20} unit="px"
              onChange={(v) => setKitTextOx(`${focus}:${effKitSize(kitSizes[focus])}`, v)} />
            <div className="helper">
              Component-specific — these nudges belong to <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name}</b> at its current size and never move anything else.
              {(kitTextOy[`${focus}:${effKitSize(kitSizes[focus])}`] !== undefined || kitTextOx[`${focus}:${effKitSize(kitSizes[focus])}`] !== undefined) && (
                <button className="chipbtn" style={{ marginLeft: 8 }} title="Clear this component's nudges — follow the theme again"
                  onClick={() => { setKitTextOy(`${focus}:${effKitSize(kitSizes[focus])}`, null); setKitTextOx(`${focus}:${effKitSize(kitSizes[focus])}`, null); }}>
                  <RotateCcw size={12} strokeWidth={2} />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <Slider label="Nudge Y" value={T2.oy ?? 0} min={-20} max={20} unit="px" onChange={(v) => update((c) => { c.type.oy = v; })} />
            <Slider label="Nudge X" value={T2.ox ?? 0} min={-20} max={20} unit="px" onChange={(v) => update((c) => { c.type.ox = v; })} />
          </>
        )}
        {/* weight follows the face's real capabilities — variable axes get a
            correctly bounded slider, static faces a list of real weights */}
        {(() => {
          const caps = fontByName(T2.font).caps;
          if (caps?.wght) {
            return <Slider label="Weight" value={T2.weight} min={caps.wght[0]} max={caps.wght[1]} step={10} unit="" onChange={(v) => update((c) => { c.type.weight = v; })} />;
          }
          const ws = caps?.weights ?? [T2.weight];
          if (ws.length <= 1) {
            return (<>
              <Slider label="Weight" value={T2.weight} min={ws[0] ?? 400} max={900} step={25} unit="" onChange={(v) => update((c) => { c.type.weight = v; })} />
              <div className="helper">This face ships one master — heavier weights are built optically, fattening the glyphs without touching the metrics.</div>
            </>);
          }
          return (
            <label className="fieldbox" style={{ minWidth: 0 }}>
              <span className="fl">Weight</span>
              <select value={clampWeight(caps ?? {}, T2.weight)} aria-label="Font weight"
                onChange={(e) => update((c) => { c.type.weight = +e.target.value; })}>
                {ws.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
            </label>
          );
        })()}
        {(() => {
          const caps = fontByName(T2.font).caps;
          if (!caps?.wdth) return null;
          return <Slider label="Width" value={T2.width ?? caps.wdth[2]} min={caps.wdth[0]} max={caps.wdth[1]} unit="%" onChange={(v) => update((c) => { c.type.width = v; })} />;
        })()}
        <Slider label="Spacing" value={T2.spacing} min={-5} max={20} unit="" onChange={(v) => update((c) => { c.type.spacing = v; })} />
        <div className="ctl">
          <label>Case</label>
          <div className="segmini" role="radiogroup">
            {([["none", "Aa"], ["upper", "AA"], ["lower", "aa"], ["title", "Ab"]] as const).map(([v, t]) => (
              <button key={v} className={T2.case === v ? "on" : ""} role="radio" aria-checked={T2.case === v}
                onClick={() => update((c) => { c.type.case = v; })}>{t}</button>
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={T2.italic} onChange={(e) => update((c) => { c.type.italic = e.target.checked; })} /> Italic</label>
        {/* while a per-piece text color is pinned, the PIN is the fill control —
            the kit's fill machinery is out-voted (applyKitTextFill wins), so
            showing it dead-but-dimmed buried the live well below a checkbox.
            Swap in the pin editor right here instead. */}
        {focus && kitTextFill[focus] ? (() => {
          const fname = KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus;
          return (<>
            <Well label={`Fill — ${fname} only`} value={kitTextFill[focus]!} onChange={(v) => setKitTextFill(focus, v)} />
            <button className="resetstate" title="Unpin the per-piece text color — this piece follows the kit's fills again"
              onClick={() => setKitTextFill(focus, null)}>
              <RotateCcw size={13} strokeWidth={2} /> Release — rejoin the kit's colors
            </button>
            <div className="helper"><b>Own text color</b> is pinned, so this well drives {fname}'s text. Release it and the kit's fill controls return here.</div>
          </>);
        })() : (<>
        <div className="ctl">
          <label>Fill</label>
          <div className="segmini" role="radiogroup">
            {(["auto", "solid", "gradient"] as const).map((m) => (
              <button key={m} className={T2.fillMode === m ? "on" : ""} role="radio" aria-checked={T2.fillMode === m}
                onClick={() => update((c) => { c.type.fillMode = m; })}>{m[0].toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
        </div>
        {T2.fillMode !== "auto" && <Well label={T2.fillMode === "gradient" ? "Fill top" : "Fill"} value={T2.fill} onChange={(v) => update((c) => { c.type.fill = v; })} />}
        {T2.fillMode === "gradient" && (<>
          <Well label="Fill bottom" value={T2.fill2} onChange={(v) => update((c) => { c.type.fill2 = v; })} />
          <button className="resetstate" title="Swap top and bottom fill colors"
            onClick={() => update((c) => { const t = c.type.fill; c.type.fill = c.type.fill2; c.type.fill2 = t; })}>
            <ArrowUpDown size={13} strokeWidth={2} /> Swap fills
          </button>
        </>)}
        <Slider label="Fill opacity" value={T2.fillOpacity ?? 100} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.fillOpacity = v; })} />
        </>)}

        {/* readout ink — the utilitarian numbers on data pieces (the order
            ticket's #07 and timer, the unit plate's 12/8 stats). Auto keeps
            them legible on any face; a pinned color follows the scope bar
            like every other type control (owner: "how do I edit the black
            text?"). */}
        <div className="ctl">
          <label>Readout ink</label>
          <div className="segmini" role="radiogroup">
            <button className={!T2.infoInk ? "on" : ""} role="radio" aria-checked={!T2.infoInk}
              onClick={() => update((c) => { c.type.infoInk = null; })}>Auto</button>
            <button className={T2.infoInk ? "on" : ""} role="radio" aria-checked={!!T2.infoInk}
              onClick={() => update((c) => { if (!c.type.infoInk) c.type.infoInk = "#FFFFFF"; })}>Custom</button>
          </div>
        </div>
        {T2.infoInk ? (
          <Well label="Readout ink" value={T2.infoInk} onChange={(v) => update((c) => { c.type.infoInk = v; })} />
        ) : (
          <div className="helper">The small working numbers — timers, counts, stats. Auto picks a legible ink from the face; Custom pins your color. Focus a piece to change just that piece.</div>
        )}

        {/* per-piece text color — the escape hatch from "changing text color
            changes it everywhere". Only offered while a component is focused. */}
        {focus && (() => {
          const fname = KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus;
          return (<>
            <div className="sublabel">This piece only</div>
            <label className="check"><input type="checkbox" checked={!!kitTextFill[focus]}
              onChange={(e) => setKitTextFill(focus, e.target.checked ? (T2.fillMode !== "auto" ? T2.fill : "#FFFFFF") : null)} />
              Own text color for <b>{fname}</b></label>
            {kitTextFill[focus] && (
              <div className="helper">Pinned — {fname} keeps its color no matter how the kit changes. The color well lives up in <b>Fill</b>; untick to rejoin the kit.</div>
            )}
          </>);
        })()}

        <label className="fieldbox" style={{ minWidth: 0 }}>
          <span className="fl">Text style preset</span>
          <select value={T2.preset} aria-label="Text style preset"
            onChange={(e) => update((c) => { applyTextPreset(c.type, e.target.value, palette); })}>
            {TEXT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
        </label>
        <div className="helper">Presets fill the controls below — keep tweaking, nothing locks.</div>

        <FxToggle label="Outline" on={T2.outline.on} onToggle={(v) => update((c) => { c.type.outline.on = v; })}>
          <Well label={T2.outline.color2 ? "Stroke top" : "Color"} value={T2.outline.color} onChange={(v) => update((c) => { c.type.outline.color = v; })} />
          <label className="check"><input type="checkbox" checked={T2.outline.color2 !== null}
            onChange={(e) => update((c) => { c.type.outline.color2 = e.target.checked ? darken(c.type.outline.color, 0.35) : null; })} /> Gradient stroke</label>
          {T2.outline.color2 !== null && (
            <button className="resetstate" onClick={() => update((c) => { const t = c.type.outline.color; c.type.outline.color = c.type.outline.color2!; c.type.outline.color2 = t; })}>
              <ArrowUpDown size={13} strokeWidth={2} /> Swap stroke colors
            </button>
          )}
          {T2.outline.color2 !== null && (
            <Well label="Stroke bottom" value={T2.outline.color2} onChange={(v) => update((c) => { c.type.outline.color2 = v; })} />
          )}
          <Slider label="Width" value={T2.outline.width} min={0.5} max={8} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.outline.width = v; })} />
        </FxToggle>
        <FxToggle label="Shadow" on={T2.shadow.on} onToggle={(v) => update((c) => { c.type.shadow.on = v; })}>
          <Well label="Color" value={T2.shadow.color} onChange={(v) => update((c) => { c.type.shadow.color = v; })} />
          <Slider label="Nudge X" value={T2.shadow.x} min={-10} max={10} unit="px" onChange={(v) => update((c) => { c.type.shadow.x = v; })} />
          <Slider label="Nudge Y" value={T2.shadow.y} min={-10} max={12} unit="px" onChange={(v) => update((c) => { c.type.shadow.y = v; })} />
          <Slider label="Blur" value={T2.shadow.blur} min={0} max={12} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.shadow.blur = v; })} />
          <Slider label="Opacity" value={T2.shadow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.shadow.opacity = v; })} />
        </FxToggle>
        <FxToggle label="Emboss / Deboss" on={T2.emboss.on} onToggle={(v) => update((c) => { c.type.emboss.on = v; })}>
          <Slider label="Depth" value={T2.emboss.strength} min={-100} max={100} unit="%" onChange={(v) => update((c) => { c.type.emboss.strength = v; })} />
          <Slider label="Distance" value={T2.emboss.distance ?? 2} min={0} max={8} step={0.5} unit="px" onChange={(v) => update((c) => { c.type.emboss.distance = v; })} />
          <Slider label="Hi softness" value={T2.emboss.softness ?? 30} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.emboss.softness = v; })} />
          <Slider label="Sh softness" value={T2.emboss.shSoftness ?? T2.emboss.softness ?? 30} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.emboss.shSoftness = v; })} />
          <div className="sublabel">Highlight side</div>
          <Well label="Color" value={T2.emboss.hiColor ?? "#FFFFFF"} onChange={(v) => update((c) => { c.type.emboss.hiColor = v; })} />
          <Slider label="Opacity" value={T2.emboss.hiOpacity ?? 70} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.emboss.hiOpacity = v; })} />
          <div className="sublabel">Shadow side</div>
          <Well label="Color" value={T2.emboss.shColor ?? "#04080E"} onChange={(v) => update((c) => { c.type.emboss.shColor = v; })} />
          <Slider label="Opacity" value={T2.emboss.shOpacity ?? 60} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.emboss.shOpacity = v; })} />
          <div className="helper">The relief follows the master light — spin the Lighting angle and the highlight and shade travel with it. Positive embosses, negative debosses.</div>
        </FxToggle>
        <FxToggle label="Glow" on={T2.glow.on} onToggle={(v) => update((c) => { c.type.glow.on = v; })}>
          <Well label="Color" value={T2.glow.color} onChange={(v) => update((c) => { c.type.glow.color = v; })} />
          <Slider label="Size" value={T2.glow.size} min={2} max={24} unit="px" onChange={(v) => update((c) => { c.type.glow.size = v; })} />
          <Slider label="Opacity" value={T2.glow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.glow.opacity = v; })} />
        </FxToggle>
        <FxToggle label="Pattern fill" on={T2.stripes?.on ?? false}
          onToggle={(v) => update((c) => { c.type.stripes = { on: v, angle: c.type.stripes?.angle ?? 45, opacity: c.type.stripes?.opacity ?? 30, style: c.type.stripes?.style ?? "stripes" }; })}>
          <div className="ctl">
            <label>Style</label>
            <select value={T2.stripes?.style ?? "stripes"} aria-label="Text pattern style"
              onChange={(e) => update((c) => { c.type.stripes = { on: c.type.stripes?.on ?? true, angle: c.type.stripes?.angle ?? 45, opacity: c.type.stripes?.opacity ?? 30, style: e.target.value as Exclude<PatternType, "none"> }; })}>
              {PATTERN_TYPES.filter((pt) => pt.id !== "none").map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name.split(" — ")[0]}</option>
              ))}
            </select>
          </div>
          <Slider label="Angle" value={T2.stripes?.angle ?? 45} min={0} max={180} unit="°" onChange={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, opacity: 30 }), on: c.type.stripes?.on ?? true, angle: v, opacity: c.type.stripes?.opacity ?? 30 }; })} />
          <Slider label="Scale" value={T2.stripes?.scale ?? 100} min={25} max={300} unit="%" onChange={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, angle: 45, opacity: 30 }), on: c.type.stripes?.on ?? true, angle: c.type.stripes?.angle ?? 45, opacity: c.type.stripes?.opacity ?? 30, scale: v }; })} />
          <Slider label="Opacity" value={T2.stripes?.opacity ?? 30} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.stripes = { ...(c.type.stripes ?? { on: true, angle: 45 }), on: c.type.stripes?.on ?? true, angle: c.type.stripes?.angle ?? 45, opacity: v }; })} />
          <div className="helper">Any face pattern, inside the letterforms — tone-on-tone from the shell color.</div>
          <div className="helper">Unity export: stays off live labels (one shared text material can't tile right for every label length) — Type Stamps carry it pixel-perfect, and the seamless tile ships in fonts/ for devs who want it anyway.</div>
        </FxToggle>
        <FxToggle label="Highlight glints" on={T2.glints?.on ?? false}
          onToggle={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { opacity: 55 }), on: v, opacity: c.type.glints?.opacity ?? 55 }; })}>
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Glint style</span>
            <select value={T2.glints?.style ?? "slab"} aria-label="Glint style"
              onChange={(e) => update((c) => { c.type.glints = { ...(c.type.glints ?? { opacity: 55 }), on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, style: e.target.value as GlintStyle }; })}>
              {GLINT_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Glint blend mode</span>
            <select value={T2.glints?.blend ?? "normal"} aria-label="Glint blend mode"
              onChange={(e) => update((c) => { c.type.glints = { ...(c.type.glints ?? { opacity: 55 }), on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, blend: e.target.value as BlendMode }; })}>
              {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <Slider label="Opacity" value={T2.glints?.opacity ?? 55} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { on: true }), on: c.type.glints?.on ?? true, opacity: v }; })} />
          <Slider label="Nudge X" value={T2.glints?.ox ?? 0} min={-60} max={60} unit="%" onChange={(v) => update((c) => { c.type.glints = { on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, oy: c.type.glints?.oy, ox: v }; })} />
          <Slider label="Nudge Y" value={T2.glints?.oy ?? 0} min={-60} max={60} unit="%" onChange={(v) => update((c) => { c.type.glints = { on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, ox: c.type.glints?.ox, oy: v }; })} />
          <div className="helper">Crisp vector highlights riding the letterforms — a specular slab clipped to the glyphs plus star glints. They follow the master Lighting angle; the nudges shift the whole treatment in % of the letter height.</div>
          <div className="helper">Unity export: glints are per-letter painting no live-text engine can replay — they ship baked into the sprites and Type Stamps; live labels carry the rest of the treatment.</div>
        </FxToggle>
        <FxToggle label="Ink shine" on={T2.shine?.on ?? false}
          onToggle={(v) => update((c) => { c.type.shine = { size: 4, inset: 2, round: 2, opacity: 100, ...(c.type.shine ?? {}), on: v }; })}>
          <Slider label="Size" value={T2.shine?.size ?? 4} min={1} max={10} step={0.5} unit="px"
            onChange={(v) => update((c) => { c.type.shine = { on: true, inset: 2, round: 2, opacity: 100, ...(c.type.shine ?? {}), size: v }; })} />
          <Slider label="Inset" value={T2.shine?.inset ?? 2} min={0} max={6} step={0.5} unit="px"
            onChange={(v) => update((c) => { c.type.shine = { on: true, size: 4, round: 2, opacity: 100, ...(c.type.shine ?? {}), inset: v }; })} />
          <Slider label="Opacity" value={T2.shine?.opacity ?? 100} min={0} max={100} unit="%"
            onChange={(v) => update((c) => { c.type.shine = { on: true, size: 4, inset: 2, round: 2, ...(c.type.shine ?? {}), opacity: v }; })} />
          <label className="fieldbox" style={{ minWidth: 0 }}>
            <span className="fl">Shine blend mode</span>
            <select value={T2.shine?.blend ?? "normal"} aria-label="Shine blend mode"
              onChange={(e) => update((c) => { c.type.shine = { on: true, size: 4, inset: 2, round: 2, opacity: 100, ...(c.type.shine ?? {}), blend: e.target.value as BlendMode }; })}>
              {BLEND_MODES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
          </label>
          <Adv label="Shine fine-tuning" active={(T2.shine?.round ?? 2) !== 2 || (T2.shine?.color ?? "#FFFFFF") !== "#FFFFFF"}>
            <Slider label="Cap rounding" value={T2.shine?.round ?? 2} min={0} max={6} step={0.5} unit="px"
              onChange={(v) => update((c) => { c.type.shine = { on: true, size: 4, inset: 2, opacity: 100, ...(c.type.shine ?? {}), round: v }; })} />
            <Well label="Shine color" value={T2.shine?.color ?? "#FFFFFF"}
              onChange={(v) => update((c) => { c.type.shine = { on: true, size: 4, inset: 2, round: 2, opacity: 100, ...(c.type.shine ?? {}), color: v }; })} />
          </Adv>
          <div className="helper">Hand-inked light crescents hugging each letterform's lit edges — bowls get shoulder sweeps, stems get caps, all derived from the glyph's own shape. Size is how far the light reaches; Inset floats the ink inside the letter. Follows the master Lighting angle. Blend `overlay` or `soft-light` reads as glassy lift on gradient fills.</div>
          <div className="helper">Unity export: like glints, this is per-letter painting no live-text engine can replay — it ships baked into the sprites and Type Stamps; live labels carry the rest of the treatment.</div>
        </FxToggle>
        <div className="helper">Some treatments read differently against light and dark grounds — a pale glint fades on a light canvas, a dark emboss sinks into a black one. Flip the canvas swatches in the stage toolbar to proof your type both ways.</div>
        {/* data-anchor: Dissect's "icon" deep link lands here — the parked
            standalone Icon section never mounts, so this block is the icon's
            real home (smartHelp.ts routes to it) */}
        <div data-anchor="icons">
        <div className="sublabel">Icons</div>
        {/* the on/off lives here too (owner call): Dissect's Icon row lands
            on this block, so the switch must be visible where you arrive.
            Same state as the text-line checkbox — the focused piece's
            "none" override, or the master's icon.show when nothing is
            focused. iconbtn is icon-only, so no kill switch there. */}
        {focus !== "iconbtn" && (
          <label className="check"><input type="checkbox"
            checked={focus ? kitIcons[focus] !== "none" : cfg.icon.show}
            onChange={(e) => {
              if (focus) setKitIcon(focus, e.target.checked ? null : "none");
              else update((c) => { c.icon.show = e.target.checked; });
            }} /> Icon at the end of the text{focus ? ` — ${KIT_COMPONENTS.find((c) => c.id === focus)?.name}` : ""}</label>
        )}
        {selectedState !== "default" && (
          <div className="helper">Editing <b>{STATE_LABEL[selectedState]}</b> — these dials pin to this state; the other states keep following the main icon.</div>
        )}
        <Slider label="Size" value={IC.size} min={40} max={170} unit="%" onChange={(v) => update((c) => { c.icon.size = v; })} />
        <Slider label="Weight" value={IC.strokeWidth} min={5} max={40} unit="/10" onChange={(v) => update((c) => { c.icon.strokeWidth = v; })} />
        {/* the icon border rides Type → Outline width until it takes its own —
            same inherit-with-escape-hatch contract as the color below */}
        {T2.outline.on && (<>
          <Slider label="Outline width" value={IC.outlineWidth ?? T2.outline.width} min={0} max={8} step={0.5} unit="px"
            onChange={(v) => update((c) => { c.icon.outlineWidth = v; })} />
          {IC.outlineWidth != null ? (
            <button className="resetstate" title="Drop the icon's own width — the border follows Type → Outline again"
              onClick={() => update((c) => { c.icon.outlineWidth = null; })}>
              <RotateCcw size={13} strokeWidth={2} /> Follow the type outline
            </button>
          ) : (
            <div className="helper">Following <b>Type → Outline</b> — move the slider and the icon border takes its own width. 0 removes it; the text keeps its outline.</div>
          )}
        </>)}
        <Slider label="Opacity" value={IC.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.icon.opacity = v; })} />
        <Slider label="Rotation" value={IC.rotation} min={0} max={360} unit="°" onChange={(v) => update((c) => { c.icon.rotation = v; })} />
        {/* the glyph's own position, in the glyph's own house — no more
            detouring through the type nudges to move an icon (owner) */}
        <Slider label="Nudge X" value={IC.ox} min={-50} max={50} unit="px" onChange={(v) => update((c) => { c.icon.ox = v; })} />
        <Slider label="Nudge Y" value={IC.oy} min={-50} max={50} unit="px" onChange={(v) => update((c) => { c.icon.oy = v; })} />
        <label className="check"><input type="checkbox" checked={IC.color === null}
          onChange={(e) => update((c) => { c.icon.color = e.target.checked ? null : "#FFFFFF"; })} /> Inherit type color</label>
        {IC.color !== null && <Well label="Custom color" value={IC.color} onChange={(v) => update((c) => { c.icon.color = v; })} />}
        <div className="sublabel">Icon effects</div>
        <div className="fxrow">
          {(["shadow", "glow", "emboss"] as const).map((f) => (
            <button key={f} className={`fxchip${IC.fx[f] ? " on" : ""}`} aria-pressed={IC.fx[f]}
              onClick={() => update((c) => { c.icon.fx[f] = !c.icon.fx[f]; })}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="helper">Every glyph in the kit (buttons, counters, slots, rows) follows this one treatment — swap a specific component's glyph in <b>Component content</b>. Color inherits the type until you set your own; the effects are always the icon's own, independent of Type.</div>
        </div>
      </Section>


      {/* ── Icon (parked behind ICONS_ENABLED for this phase) ── */}
      {ICONS_ENABLED && (
      <Section id="icon" title="Icon"
        right={
          <span className="inlinectl" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={cfg.icon.show} aria-label="Show icon"
              onChange={(e) => update((c) => { c.icon.show = e.target.checked; })} />
          </span>
        }
        summary={<span>{cfg.icon.show && cfg.icon.def ? cfg.icon.def.name : "off"}</span>}>
        <label className="fieldbox" style={{ minWidth: 0 }}>
          <span className="fl">Icon library</span>
          <select value={browseLib} aria-label="Icon library" onChange={(e) => setBrowseLib(e.target.value)}>
            {ICON_LIBS.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.note}</option>)}
          </select>
          <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
        </label>
        <div className="searchbox">
          <Search size={15} strokeWidth={2} />
          <input value={iconQuery} placeholder={`Search ${ICON_LIBS.find((l) => l.id === browseLib)?.name}...`} aria-label="Search icons"
            onChange={(e) => setIconQuery(e.target.value)} />
        </div>
        {!libIsReady && <div className="helper">Loading library…</div>}
        <div className="icongrid">
          {results.map((name) => {
            const def = getDef(browseLib, name);
            if (!def) return null;
            const on = cfg.icon.def?.lib === browseLib && cfg.icon.def?.name === name;
            return (
              <button key={name} className={on ? "on" : ""} title={name}
                onClick={() => update((c) => { c.icon.def = def; c.icon.show = true; })}
                dangerouslySetInnerHTML={{ __html: previewSvg(def) }} />
            );
          })}
        </div>
        {cfg.icon.show && cfg.icon.def && (<>
          <div className="ctl">
            <label>Placement</label>
            <div className="segmini" role="radiogroup">
              {(["left", "right"] as const).map((p) => (
                <button key={p} className={cfg.icon.placement === p ? "on" : ""} role="radio" aria-checked={cfg.icon.placement === p}
                  onClick={() => update((c) => { c.icon.placement = p; })}>{p[0].toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={cfg.icon.only} onChange={(e) => update((c) => { c.icon.only = e.target.checked; })} /> Icon only (hide label)</label>
          <Slider label="Size" value={cfg.icon.size} min={40} max={170} unit="%" onChange={(v) => update((c) => { c.icon.size = v; })} />
          {cfg.icon.def.mode === "stroke" &&
            <Slider label="Stroke" value={cfg.icon.strokeWidth} min={5} max={40} unit="/10" onChange={(v) => update((c) => { c.icon.strokeWidth = v; })} />}
          <label className="check"><input type="checkbox" checked={cfg.icon.color === null} onChange={(e) => update((c) => { c.icon.color = e.target.checked ? null : "#FFFFFF"; })} /> Match text color</label>
          {cfg.icon.color !== null && <Well label="Color" value={cfg.icon.color} onChange={(v) => update((c) => { c.icon.color = v; })} />}
          <Slider label="Opacity" value={cfg.icon.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.icon.opacity = v; })} />
          <Slider label="Rotation" value={cfg.icon.rotation} min={0} max={360} unit="°" onChange={(v) => update((c) => { c.icon.rotation = v; })} />
          <Slider label="Gap" value={cfg.icon.gap} min={0} max={40} unit="px" onChange={(v) => update((c) => { c.icon.gap = v; })} />
          <Slider label="Nudge X" value={cfg.icon.ox} min={-30} max={30} unit="px" onChange={(v) => update((c) => { c.icon.ox = v; })} />
          <Slider label="Nudge Y" value={cfg.icon.oy} min={-30} max={30} unit="px" onChange={(v) => update((c) => { c.icon.oy = v; })} />
          <div className="sublabel">Icon effects</div>
          <div className="fxrow">
            {(["shadow", "glow", "emboss"] as const).map((f) => (
              <button key={f} className={`fxchip${cfg.icon.fx[f] ? " on" : ""}`} aria-pressed={cfg.icon.fx[f]}
                onClick={() => update((c) => { c.icon.fx[f] = !c.icon.fx[f]; })}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button className="resetstate" onClick={() => update((c) => { c.icon.def = null; c.icon.show = false; c.icon.only = false; })}>
            <Trash2 size={13} strokeWidth={2} /> Remove icon
          </button>
        </>)}
        {(!cfg.icon.show || !cfg.icon.def) && <div className="helper">No icon — the label recenters itself. Pick one above to add it back.</div>}
      </Section>
      )}

      {/* ── Library — approved components ─────────────────── */}
      <Section id="library" title={t("secLibrary")} summary={<span>{library.length} saved</span>}>
        {library.length === 0 && <div className="helper">The flow: design a component → “OK — add to library” saves it here → the + button places it on the stage (Board) → drag to arrange, Play to feel the states.</div>}
        <div className="libgrid">
          {library.map((item) => (
            <div className="libcard" key={item.id}>
              <button className="libthumb" title={`Load ${item.name}`} onClick={() => loadFromLibrary(item.id)}
                dangerouslySetInnerHTML={{ __html: libThumb(item) }} />
              <div className="librow">
                <span className="libname">{item.name}</span>
                <button className="chipbtn" title="Add to stage" aria-label={`Add ${item.name} to the stage`} onClick={() => addToBoard(item.id)}>
                  <Plus size={14} strokeWidth={2.2} />
                </button>
                <button className="chipbtn" title="Delete" aria-label={`Delete ${item.name}`} onClick={() => removeFromLibrary(item.id)}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {library.length > 0 && <div className="helper">Click a thumbnail to load it into the editor. Send to board to sketch layouts.</div>}
      </Section>

      {/* ── States shown ──────────────────────────────────── */}
      <Section id="states" title={t("secStates")} summary={<span>{1 + Object.values(cfg.visible).filter(Boolean).length} states</span>}>
        <label className="check"><input type="checkbox" checked disabled /> Default (hero)</label>
        {(["hover", "pressed", "disabled"] as const).map((s) => (
          <label className="check" key={s}>
            <input type="checkbox" checked={cfg.visible[s]} onChange={(e) => update((c) => { c.visible[s] = e.target.checked; })} />
            {STATE_LABEL[s]}
          </label>
        ))}
      </Section>

      <div className="btnrow">
        <button className={`randbtn${justAdded ? " okflash" : ""}`} title="Approve this component and save it to the library"
          onClick={() => {
            // a focused kit piece saves under its own name — it stays that piece
            addToLibrary(focus ? (KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? "Component") : (cfg.content.label || "Component"));
            setJustAdded(true);
            useGen.setState((st) => ({ open: { ...st.open, library: true } }));
            window.setTimeout(() => setJustAdded(false), 1800);
          }}>
          <CheckCircle2 size={16} strokeWidth={1.9} /> {justAdded ? `✓ Saved — ${library.length} in Library` : "OK — add to library"}
        </button>
      </div>
      {(
        <div className="btnrow">
          <button className="randbtn kit" onClick={() => setPhase("kit")}
            title="Open the Kit — pick which component to work on">
            <Hammer size={16} strokeWidth={1.9} /> The Kit
          </button>
          <button className="randbtn kit" onClick={() => setPhase("board")}
            title="Free sketch area — drag saved components around">
            <LayoutGrid size={16} strokeWidth={1.9} /> Board
          </button>
        </div>
      )}
      <button className="resetall"
        title="Wipe the design, locks, per-piece overrides, library, board and presets — back to the factory kit"
        onClick={() => {
          if (window.confirm("Reset everything?\n\nThis clears the kit design, all locks and per-piece overrides, the library, the board and your saved presets, then restores the factory kit. This cannot be undone.")) resetAll();
        }}>
        Reset everything — back to the factory kit
      </button>
    </aside>
  );
}
