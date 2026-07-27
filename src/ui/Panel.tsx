import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Dices, Layers, Type, LayoutGrid, Search, Search as SearchIcon, X, Settings, Plus, Minus, RotateCcw, Hammer, PenTool, Trash2, Copy, ArrowUpDown, LibraryBig, CheckCircle2, Shapes, Palette, Sun, Box, Lock, LockOpen, Upload, Globe, Star, Clock, GraduationCap, Info, HelpCircle, TextCursorInput } from "lucide-react";
import { useGen } from "@/generator/store";
import { t } from "@/shell/i18n";
import { LessonBody } from "./LessonCard";
import { PRESETS, KIT_SLOTS, KIT_LESSONS, EFFECT_ROLES, ROLE_HINT, STATE_NAMES, GAME_FONTS, TEXT_PRESETS, SPECULAR_MODES, PATTERN_TYPES, SHAPES, ICONS_ENABLED, KIT_COMPONENTS, KIT_SHAPE, BLEND_MODES, defaultStates, applyKitDesign, applyTextPreset, darken, registerCustomFont, pickDesign, fontByName, clampWeight , defaultBarFx, effKitSize, DESIGN_KEYS, presetById, designDiff, mergeKitDesign  } from "@/generator/model";
import type { GenStateName, BlendMode, PatternType, KitComponentId  } from "@/generator/model";
import { ICON_LIBS, loadLib, libLoaded, searchLib, getDef, previewSvg } from "@/generator/icons";
import { ensureFont } from "@/generator/fonts";
import { renderBevel, renderKit, shapePath } from "@/generator/bevel";
import { hydrate, retintText } from "@/generator/store";
import type { LibItem } from "@/generator/store";
import { defaultConfig, defaultCandy, applyPresetCandy  } from "@/generator/model";
import type { GenConfig  } from "@/generator/model";
import { PRESET_DEFAULTS } from "@/generator/store";
import { SILHOUETTES, SILHOUETTE_CATEGORIES } from "@/generator/silhouettes";
import { capsOf, UPGRADE_LINES } from "@/generator/entitlements";
import { openAuth } from "@/shell/authOverlay";

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
      <button title={t("railSettings")} aria-label="Settings"><Settings size={22} strokeWidth={1.7} /></button>
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

function Slider({ label, value, min, max, unit, step, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; step?: number; onChange: (v: number) => void;
}) {
  const clampV = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="ctl">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(+e.target.value)} />
      <span className="valbox">
        <input className="numin" type="number" min={min} max={max} step={step ?? 1} value={value}
          aria-label={`${label} value`}
          onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(clampV(v)); }} />
        <i>{unit}</i>
      </span>
    </div>
  );
}

function Well({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ctl">
      <label>{label}</label>
      <span className="chipwell sm" style={{ background: value }}>
        <input type="color" value={value} aria-label={`${label} color`} onChange={(e) => onChange(e.target.value)} />
      </span>
      <span className="mr-hint">{value.toUpperCase()}</span>
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

export function Panel() {
  const { cfg: cfgMaster, update: updateParent, setPreset: setPresetParent, randomize, randomizeColors, selectedState, setSelectedState, sectionFilter, phase, setPhase, inheritDefaults, makeStateDefault, library, addToLibrary, removeFromLibrary, loadFromLibrary, addToBoard, focus, setFocus, kitShapes, setKitShape, kitDesigns, setKitDesign, kitSizes, kitTextOy, setKitTextOy, kitTextOx, setKitTextOx, kitTextFill, setKitTextFill, kitRow, setKitRow, styleLib, saveStyle, applyStyle, removeStyle, userShapes, addUserShape, removeUserShape, userPresets, applyUserPreset, removeUserPreset, cloudPresets, isAdmin, applyCloudPreset, publishPreset, schedulePreset, removeCloudPresetById, hiddenStarters, hideStarterPreset, restoreStarterPresets, activeCloudPreset, overwriteActivePreset, tier, kitName, canvasMode, boards, activeBoard, setBoardBg, kitIcons, setKitIcon, kitLabels, setKitLabel, kitSubs, setKitSub, kitSlotVals, setKitSlot, kitBar, setKitBar, refreshLibraryItem, replaceConfig, resetAll, panelQuery, setPanelQuery } = useGen();
  const actBd = boards.find((b) => b.id === activeBoard);
  const cfg = focus && kitDesigns[focus] ? applyKitDesign(cfgMaster, kitDesigns[focus]) : cfgMaster;
  const { parentId, setParent } = useGen();
  const [parentErr, setParentErr] = useState<string | null>(null);
  /* parent eligibility: the component must expose the complete recipe —
     a full silhouette shell, an inset face, a typography label and all four
     states — otherwise other components have nothing to inherit from. */
  const PARENT_ELIGIBLE: (typeof focus)[] = ["primary", "secondary", "small", "ghost", "tab", "chip", "badge", "header"];
  /* v67 · "if I can't see it, I can't edit it": with a component focused,
     every DESIGN edit (colors, effects, candy, type, shape, bevel, lighting,
     shadow, transparency) lands on THAT component's fork — the parent design
     only changes when nothing is focused. Non-design fields (content, icon
     rig, state adjusts, canvas) stay global by nature; they still render on
     the focused hero, so the rule holds. */
  const update = (fn: (c: GenConfig) => void) => {
    if (!focus) { updateParent(fn); return; }
    const before = applyKitDesign(cfgMaster, kitDesigns[focus]);
    const merged = JSON.parse(JSON.stringify(before)) as GenConfig;
    if (selectedState !== "default") {
      /* Editing a non-default state of a focused piece: route the design edit
         into that state's fork — the same routing the store's update does —
         because the controls READ from the fork (D = stateDesigns[sel]). The
         old path wrote to the piece's default layer, which the fork masked:
         the control looked dead. Fork on first touch; Default stays put. */
      if (!merged.stateDesigns) merged.stateDesigns = {};
      if (!merged.stateDesigns[selectedState]) merged.stateDesigns[selectedState] = pickDesign(merged);
      const sd = merged.stateDesigns[selectedState]!;
      const t = Object.assign({}, merged, {
        effects: sd.effects, face: sd.face, bevel: sd.bevel, candy: sd.candy,
        lighting: sd.lighting, shadow: sd.shadow, transparency: sd.transparency, type: sd.type,
      }) as GenConfig;
      Object.defineProperty(t, "shape", { get: () => sd.shape, set: (v) => { sd.shape = v; }, enumerable: true, configurable: true });
      fn(t);
      sd.effects = t.effects; sd.face = t.face; sd.bevel = t.bevel; sd.candy = t.candy;
      sd.lighting = t.lighting; sd.shadow = t.shadow; sd.transparency = t.transparency; sd.type = t.type;
      if (JSON.stringify(before.stateDesigns ?? {}) !== JSON.stringify(merged.stateDesigns)) {
        // the piece's state forks pin wholesale — that's their storage grain
        setKitDesign(focus, { ...(kitDesigns[focus] ?? {}), stateDesigns: merged.stateDesigns });
      }
    } else {
      fn(merged);
      // v70: pin only the paths this edit changed — the rest keeps following
      // the parent design live, so the kit stays auto-updating
      const d = designDiff(pickDesign(before), pickDesign(merged));
      if (d) setKitDesign(focus, mergeKitDesign(kitDesigns[focus], d));
    }
    /* state ADJUSTMENTS (the Global sliders) isolate to the piece too — the
       banner says "edits save into this piece", and the owner caught them
       leaking to the whole kit. Pin on first touch; read back the freshest
       lock since the design pin above may have just written it. */
    if (JSON.stringify(before.states) !== JSON.stringify(merged.states)) {
      setKitDesign(focus, mergeKitDesign(useGen.getState().kitDesigns[focus], { states: merged.states }));
    }
    // replay only the non-design portion onto the parent — design keys AND
    // state adjustments stay pinned to the piece
    const mClone = JSON.parse(JSON.stringify(cfgMaster)) as GenConfig;
    fn(mClone);
    const scrub = (c: GenConfig) => { const p = JSON.parse(JSON.stringify(c)) as Record<string, unknown>; for (const k2 of DESIGN_KEYS) delete p[k2]; delete p.states; return JSON.stringify(p); };
    if (scrub(mClone) !== scrub(cfgMaster)) updateParent((c) => { const keep = pickDesign(c); const keepStates = c.states; fn(c); Object.assign(c, keep); c.states = keepStates; });
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
  const [outlines, setOutlines] = useState(false);
  const [silCat, setSilCat] = useState<string>("All");
  const [shapeErr, setShapeErr] = useState<string | null>(null);
  const savedLib = cfg.icon.def?.lib && ICON_LIBS.some((l) => l.id === cfg.icon.def!.lib) ? cfg.icon.def!.lib : "lucide";
  const [browseLib, setBrowseLib] = useState(savedLib);
  const libIsReady = libLoaded(browseLib);

  // v57: the component-icon swap needs the library even while the master
  // icon section stays parked — load it whenever a swappable piece is focused
  const iconSwappable = !!focus && (["iconbtn", "chip", "resource", "slot", "datarow", "badge", "progress", "segbar", "buffframe", "notifydot", "loottag", "skillnode", "equipslot", "toast", "killfeed", "equipselector", "weaponwheel", "booster", "dailycell", "buildqueue", "techcard", "clancrest", "emotewheel"] as KitComponentId[]).includes(focus);
  /* the icon on/off rides every text line whose component can wear a glyph
     (owner call) — swappables plus the master-icon carriers. iconbtn is
     icon-ONLY: hiding its glyph would leave an empty tile, so no checkbox. */
  const iconTogglable = !!focus && focus !== "iconbtn" &&
    (iconSwappable || focus === "primary" || focus === "secondary");
  const labelEditable = !!focus && (["primary", "secondary", "small", "ghost", "chip", "tab", "header", "badge", "resource", "input", "dropdown", "bignum", "ammo", "dialog", "toast", "tooltip", "keycap", "padbtn", "loadbar", "setrow", "searchfield", "nameplate", "currency", "xpbar", "questpanel", "dialoguebox", "partyframe", "dmgnumber", "loottag", "killfeed", "streakmeter", "waypoint", "capturemeter", "respawn", "weaponwheel", "equipselector", "levelnode", "dailycell", "pricebtn", "combo", "heartmeter", "energymeter", "buildqueue", "unitplate", "techcard", "friendrow", "chatbubble", "clancrest", "achievetoast", "scorebug", "endturn", "pack", "cardback"] as KitComponentId[]).includes(focus);
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
  const results = useMemo(
    () => (ICONS_ENABLED || iconSwappable ? searchLib(browseLib, iconQuery, bigGrid ? 60 : 24) : []),
    // libTick re-runs the search once an async library lands
    [browseLib, iconQuery, bigGrid, libTick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Controls read from — and update() writes to — the selected state's own
  // design. Untouched states mirror Default live until first edited.
  const D = selectedState !== "default" ? (cfg.stateDesigns?.[selectedState] ?? cfg) : cfg;
  const presentRoles = EFFECT_ROLES.filter((r) => D.effects[r] !== undefined);
  const missingRoles = EFFECT_ROLES.filter((r) => D.effects[r] === undefined);
  const mapStops = presentRoles.map((r) => D.effects[r]!) as string[];
  const mapBar = mapStops.length > 1 ? `linear-gradient(90deg, ${mapStops.join(", ")})` : mapStops[0] ?? "#ddd";
  const adj = cfg.states[selectedState];
  const T2 = D.type;
  const C = D.candy;
  const palette = { dark: darken(D.effects.Bevel ?? "#0E9CC9", 0.5), glow: D.effects.Glow ?? "#8FF0FF" };
  useEffect(() => { ensureFont(D.type.font); }, [D.type.font]);

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
  return (
    <aside className={`panel${playLocked ? " playlock" : ""}`} ref={panelRef}>
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
      {focus && (() => {
        const fname = KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus;
        const locked = !!kitDesigns[focus];
        /* One clear rule, stated where the user is looking:
           unlocked = edits restyle the WHOLE kit; locked = edits stay on
           THIS piece (they stream straight into its lock — no "update
           lock" step, what you see is what's saved). */
        return (
          <div className="focusnote">
            Editing <b>{fname}</b> — every design edit stays on <b>this piece only</b> (if you can't see it, you can't edit it). Save it as a style to reuse the look elsewhere.
            <button onClick={() => setFocus(null)}>Back to parent design</button>
            <div className="lockrow">
              <button title="Make this component the parent design — the base every unfocused edit styles"
                onClick={() => {
                  if (PARENT_ELIGIBLE.includes(focus)) { setParent(focus); setParentErr(null); }
                  else setParentErr(`${fname} can't be the parent design — a parent must carry the complete recipe (silhouette shell, face, typography label and all four states) so the rest of the kit can inherit from it.`);
                }}>
                <Star size={12} strokeWidth={2.2} /> Make parent design
              </button>
              {parentId === focus && <span className="lockstate">This is the parent design.</span>}
            </div>
            {parentErr && <div className="helper parenterr" role="alert">{parentErr}</div>}
            {locked ? (
              <div className="lockrow">
                <span className="lockstate"><Lock size={12} strokeWidth={2.2} /> Edits save into this piece automatically.</span>
                <button title="Make the whole kit look like this piece, then follow the master again"
                  onClick={() => {
                    const merged = applyKitDesign(useGen.getState().cfg, kitDesigns[focus]);
                    setKitDesign(focus, null);
                    replaceConfig(structuredClone(merged));
                  }}>
                  <Lock size={12} strokeWidth={2.2} /> Push this look to the whole kit
                </button>
                <button title="Drop the overrides — this piece follows the parent design again"
                  onClick={() => setKitDesign(focus, null)}>
                  <LockOpen size={12} strokeWidth={2.2} /> Reset — follow the parent
                </button>
              </div>
            ) : (
              <div className="lockrow">
                <button title="From here on, edits style only this piece — the master and every other piece stay put"
                  onClick={() => setKitDesign(focus, { ...pickDesign(cfg), stateDesigns: structuredClone(cfg.stateDesigns) })}>
                  <Lock size={12} strokeWidth={2.2} /> Style {fname} only (lock it)
                </button>
              </div>
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
        </div>
        <div className="helper">Hover or press the button on the canvas to feel the states live. These sliders shape only <b>{STATE_LABEL[selectedState]}</b>.</div>
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

      {/* ── A · Style (the candy construction) ────────────── */}
      <Section id="shape" title={t("secPresets")} summary={<span className="mapbar" style={{ background: mapBar }} />}>
        <div className="presetgrid">
          {userPresets.map((u) => (
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
          {cloudPresets.map((p) => tier !== "pro" ? (
            <button key={p.id} className="presetcard shared lockedp"
              title={`${p.name} — from the monthly preset packs. ${tier === "guest" ? UPGRADE_LINES.guest : "A new pack drops every month with Pro."}`}
              onClick={() => { if (tier === "guest") openAuth("signin"); else window.location.hash = "#/pricing"; }}>
              <span className="presetart" dangerouslySetInnerHTML={{ __html: p.thumb ?? "" }} />
              <span className="presetname"><Lock size={11} strokeWidth={2.4} /> {p.name}</span>
            </button>
          ) : (
            <button key={p.id} className={`presetcard shared${kitName === p.name ? " on" : ""}${heldUntil(p.publish_at) ? " held" : ""}`}
              title={heldUntil(p.publish_at) ? `${p.name} — held until ${heldUntil(p.publish_at)}. Only you can see it.` : `${p.name} — preset pack`}
              onClick={() => applyCloudPreset(p.id)}>
              {p.thumb ? <span className="presetart" dangerouslySetInnerHTML={{ __html: p.thumb }} /> : <span className="presetart" />}
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
          })}
        </div>
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
        {isAdmin && (<>
          <div className="sublabel">Shared library — admin</div>
          <div className="actionrow">
            {/* Dated publishing is what makes "a new pack every month" keep
                itself: load the whole backlog in one sitting, each with its
                drop date, instead of remembering to publish one a month. */}
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
      </Section>

      {/* ── A2 · Silhouette — pure geometry, material stays ── */}
      <Section id="silhouette" title={t("secSilhouette")} summary={<span>{SHAPES.find((sh) => sh.id === D.shape)?.name.split(" — ")[0]}</span>}>
        {focus && (
          <div className="helper">Picking a silhouette restyles <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name ?? focus}</b> only — its shell, wells and fills all follow. Leave edit mode to change the whole kit.</div>
        )}
        {/* v56: corner smoothness lives at the TOP of the section, always
            visible — it was buried under the import notes and vanished for
            pills, which read as "missing" */}
        <Slider label="Smoothness" value={D.bevel.softness} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.bevel.softness = v; })} />
        {(focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === "pill" && (
          <div className="helper">The pill's ends are already fully round — smoothness shows on cornered silhouettes (rectangles, chamfers, tags…).</div>
        )}
        <div className="silcats" role="radiogroup" aria-label="Silhouette category">
          {["All", ...SILHOUETTE_CATEGORIES].map((cat) => (
            <button key={cat} className={silCat === cat ? "on" : ""} role="radio" aria-checked={silCat === cat}
              onClick={() => setSilCat(cat)}>{cat}</button>
          ))}
        </div>
        <div className="shapegrid">
          {SILHOUETTES.filter((m) => silCat === "All" || m.category === silCat).map((m) => (
            <button key={m.id} className={`shapecard${(focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape) === m.id ? " on" : ""}`} title={`${m.name} — ${m.character}`}
              onClick={() => { if (focus) setKitShape(focus, m.id); else update((c) => { c.shape = m.id; }); }}>
              <svg viewBox="0 0 120 56" aria-hidden="true"><path d={shapePath(m.id, 8, 8, 104, 40, D.bevel.softness)} /></svg>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
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
        <button className="resetstate" onClick={() => setOutlines(true)} title="Judge silhouettes as plain geometry — before materials flatter them">
          <Shapes size={13} strokeWidth={2} /> Outline view — compare raw geometry
        </button>
        </div>
        {shapeErr && <div className="helper" role="alert">{shapeErr}</div>}
        <div className="helper">
          Import spec: a plain flat vector — one closed, <b>filled</b> path (no strokes, groups,
          transforms or images). Draw it around a wide landscape box (about 200 × 100) with the
          outline touching all four edges; the generator stretches it to each component,
          so keep decorative caps inside the outer 30% of the width. Prefer bezier curves
          over arc segments — arcs can distort under stretch. Boolean-union overlapping
          shapes before export; counter-holes are fine.
        </div>
      </Section>

      {/* ── v57/58: Component content — this piece's text and glyph ── */}
      {(iconSwappable || labelEditable || (focus && (KIT_SLOTS[focus] || KIT_LESSONS[focus]))) && focus && (
        <Section id="kiticon" title={t("secKitIcon")}
          summary={<span>{kitIcons[focus] === "none" ? "no icon" : (kitIcons[focus] as { name?: string } | undefined)?.name ?? "stock"}</span>}>
          {KIT_LESSONS[focus] && <InfoCard cid={focus} />}
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
          {(KIT_SLOTS[focus] ?? []).map((slot) => slot.kind === "choice" ? (
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
          ) : slot.kind === "color" ? (
            <div key={slot.id}>
              <Well label={slot.name} value={kitSlotVals[focus]?.[slot.id] ?? slot.def ?? "#FFFFFF"}
                onChange={(v) => setKitSlot(focus, slot.id, v)} />
              {kitSlotVals[focus]?.[slot.id] && (
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
            <input className="tinput" value={kitLabels[focus] ?? ""} maxLength={32}
              placeholder="Specimen text (leave empty for defaults)" aria-label="Component text"
              onChange={(e) => setKitLabel(focus, e.target.value)} />
            {iconTogglable && (
              <label className="check"><input type="checkbox" checked={kitIcons[focus] !== "none"}
                onChange={(e) => setKitIcon(focus, e.target.checked ? null : "none")} /> Icon at the end of the text</label>
            )}
          </>)}
          {subEditable && (
            <input className="tinput" value={kitSubs[focus] ?? ""} maxLength={24}
              placeholder={subFieldName[focus] ?? "Secondary text"} aria-label="Secondary text"
              onChange={(e) => setKitSub(focus, e.target.value)} />
          )}
          {iconSwappable && (<>
          <div className="sublabel">Icon</div>
          <div className="helper">Swap the glyph on <b>{KIT_COMPONENTS.find((c) => c.id === focus)?.name}</b> — the kit page, the Board and every export follow. Remove it and the text recenters. Size, color, weight & effects live under <b>Typography → Icons</b>.</div>
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
            <label className="check"><input type="checkbox" checked={kitBar.segbar?.snap ?? true}
              onChange={(e) => setKitBar("segbar", { snap: e.target.checked })} /> Snap to whole cells</label>
            <div className="helper">Snapped cells light one by one — stamina pips. Off, a single fill slides under the notches — boss-phase style.</div>
          </>)}
        </Section>
      )}

      {outlines && (
        <div className="devoutlines" role="dialog" aria-label="Silhouette outline comparison" onClick={() => setOutlines(false)}>
          <div className="devo-head">
            Raw silhouette geometry — <span style={{ color: "#fff" }}>white outline</span>,
            <span style={{ color: "#c084fc" }}> purple dashes = fixed end caps (never stretch)</span>,
            <span style={{ color: "#4ade80" }}> green = content-safe area</span>. Click anywhere to close.
          </div>
          {SILHOUETTE_CATEGORIES.map((cat) => (
          <div key={cat}>
          <div className="devo-cat">{cat}</div>
          <div className="devo-grid">
            {SILHOUETTES.filter((m) => m.category === cat).map((m) => {
              const W = 250, H = 92, ox = 12, oy = 14, gw = W - 24, gh = H - 28;
              const cap = Math.min(m.capScale * gh, gw * 0.45);
              return (
                <div key={m.id} className={`devo-card${D.shape === m.id ? " on" : ""}`}>
                  <svg viewBox={`0 0 ${W} ${H}`}>
                    <path d={shapePath(m.id, ox, oy, gw, gh, 60)} fill="none" stroke="#fff" strokeWidth="1.6" />
                    <line x1={ox + cap} y1={3} x2={ox + cap} y2={H - 3} stroke="#c084fc" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1={ox + gw - cap} y1={3} x2={ox + gw - cap} y2={H - 3} stroke="#c084fc" strokeWidth="1" strokeDasharray="4 3" />
                    <rect x={ox + m.content.left * gh} y={oy + m.content.top * gh}
                      width={gw - (m.content.left + m.content.right) * gh} height={gh - (m.content.top + m.content.bottom) * gh}
                      fill="none" stroke="#4ade80" strokeWidth="1" strokeDasharray="3 3" />
                  </svg>
                  <div className="devo-name">{m.name}</div>
                  <div className="devo-src">{m.source} · {m.license}</div>
                </div>
              );
            })}
          </div>
          </div>
          ))}
        </div>
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
                  onChange={(e) => update((c) => { c.effects[r] = e.target.value; })} />
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
      </Section>

      {/* ── C · Structure — the object's build ────────────── */}
      <Section id="structure" title={t("secStructure")}>
        {(() => {
          /* the banner's tail geometry only reads clean between 13 and 33 —
             its slider is contained to that range (other shapes keep 2–34) */
          const effShape = focus ? (kitShapes[focus] ?? KIT_SHAPE[focus] ?? D.shape) : D.shape;
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
        <div className="sublabel">Cast shadow</div>
        <Slider label="Distance" value={D.shadow.distance} min={0} max={48} unit="px" onChange={(v) => update((c) => { c.shadow.distance = v; })} />
        <Slider label="Blur" value={D.shadow.blur} min={0} max={60} unit="px" onChange={(v) => update((c) => { c.shadow.blur = v; })} />
        <Slider label="Opacity" value={D.shadow.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.shadow.opacity = v; })} />
        <Slider label="Contact" value={C.contact.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.candy.contact.opacity = v; })} />
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
          <Slider label="Vertical" value={kitRow.titleDy} min={-20} max={20} unit="px" onChange={(v) => setKitRow({ titleDy: v })} />
          <div className="sublabel">Text group B — second line</div>
          <label className="check"><input type="checkbox" checked={kitRow.subOn ?? true} onChange={(e) => setKitRow({ subOn: e.target.checked })} /> Show the second line</label>
          <input className="tinput" value={kitRow.sub} maxLength={40} aria-label="Row subtitle"
            onChange={(e) => setKitRow({ sub: e.target.value })} />
          <Slider label="Size" value={kitRow.subSize} min={50} max={160} unit="%" onChange={(v) => setKitRow({ subSize: v })} />
          <Slider label="Tracking" value={kitRow.subTrack} min={-5} max={20} unit="" onChange={(v) => setKitRow({ subTrack: v })} />
          <Slider label="Vertical" value={kitRow.subDy} min={-40} max={40} unit="px" onChange={(v) => setKitRow({ subDy: v })} />
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
            <input className="tinput" value={kitLabels[focus] ?? ""} maxLength={32} aria-label="Label text"
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
        <Slider label="Size" value={T2.size} min={28} max={140} unit="px" onChange={(v) => update((c) => { c.type.size = v; })} />
        {focus ? (
          <>
            <Slider label="Vertical nudge" value={kitTextOy[`${focus}:${effKitSize(kitSizes[focus])}`] ?? T2.oy ?? 0} min={-20} max={20} unit="px"
              onChange={(v) => setKitTextOy(`${focus}:${effKitSize(kitSizes[focus])}`, v)} />
            <Slider label="Horizontal nudge" value={kitTextOx[`${focus}:${effKitSize(kitSizes[focus])}`] ?? T2.ox ?? 0} min={-20} max={20} unit="px"
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
            <Slider label="Vertical nudge" value={T2.oy ?? 0} min={-20} max={20} unit="px" onChange={(v) => update((c) => { c.type.oy = v; })} />
            <Slider label="Horizontal nudge" value={T2.ox ?? 0} min={-20} max={20} unit="px" onChange={(v) => update((c) => { c.type.ox = v; })} />
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
          <Slider label="Offset X" value={T2.shadow.x} min={-10} max={10} unit="px" onChange={(v) => update((c) => { c.type.shadow.x = v; })} />
          <Slider label="Offset Y" value={T2.shadow.y} min={-10} max={12} unit="px" onChange={(v) => update((c) => { c.type.shadow.y = v; })} />
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
        </FxToggle>
        <FxToggle label="Highlight glints" on={T2.glints?.on ?? false}
          onToggle={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { opacity: 55 }), on: v, opacity: c.type.glints?.opacity ?? 55 }; })}>
          <Slider label="Opacity" value={T2.glints?.opacity ?? 55} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.type.glints = { ...(c.type.glints ?? { on: true }), on: c.type.glints?.on ?? true, opacity: v }; })} />
          <Slider label="Nudge X" value={T2.glints?.ox ?? 0} min={-60} max={60} unit="%" onChange={(v) => update((c) => { c.type.glints = { on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, oy: c.type.glints?.oy, ox: v }; })} />
          <Slider label="Nudge Y" value={T2.glints?.oy ?? 0} min={-60} max={60} unit="%" onChange={(v) => update((c) => { c.type.glints = { on: c.type.glints?.on ?? true, opacity: c.type.glints?.opacity ?? 55, ox: c.type.glints?.ox, oy: v }; })} />
          <div className="helper">Crisp vector highlights riding the letterforms — a specular slab clipped to the glyphs plus star glints. They follow the master Lighting angle; the nudges shift the whole treatment in % of the letter height.</div>
        </FxToggle>
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
        <Slider label="Size" value={cfg.icon.size} min={40} max={170} unit="%" onChange={(v) => update((c) => { c.icon.size = v; })} />
        <Slider label="Weight" value={cfg.icon.strokeWidth} min={5} max={40} unit="/10" onChange={(v) => update((c) => { c.icon.strokeWidth = v; })} />
        {/* the icon border rides Type → Outline width until it takes its own —
            same inherit-with-escape-hatch contract as the color below */}
        {T2.outline.on && (<>
          <Slider label="Outline width" value={cfg.icon.outlineWidth ?? T2.outline.width} min={0} max={8} step={0.5} unit="px"
            onChange={(v) => update((c) => { c.icon.outlineWidth = v; })} />
          {cfg.icon.outlineWidth != null ? (
            <button className="resetstate" title="Drop the icon's own width — the border follows Type → Outline again"
              onClick={() => update((c) => { c.icon.outlineWidth = null; })}>
              <RotateCcw size={13} strokeWidth={2} /> Follow the type outline
            </button>
          ) : (
            <div className="helper">Following <b>Type → Outline</b> — move the slider and the icon border takes its own width. 0 removes it; the text keeps its outline.</div>
          )}
        </>)}
        <Slider label="Opacity" value={cfg.icon.opacity} min={0} max={100} unit="%" onChange={(v) => update((c) => { c.icon.opacity = v; })} />
        <Slider label="Rotation" value={cfg.icon.rotation} min={0} max={360} unit="°" onChange={(v) => update((c) => { c.icon.rotation = v; })} />
        <label className="check"><input type="checkbox" checked={cfg.icon.color === null}
          onChange={(e) => update((c) => { c.icon.color = e.target.checked ? null : "#FFFFFF"; })} /> Inherit type color</label>
        {cfg.icon.color !== null && <Well label="Custom color" value={cfg.icon.color} onChange={(v) => update((c) => { c.icon.color = v; })} />}
        <div className="sublabel">Icon effects</div>
        <div className="fxrow">
          {(["shadow", "glow", "emboss"] as const).map((f) => (
            <button key={f} className={`fxchip${cfg.icon.fx[f] ? " on" : ""}`} aria-pressed={cfg.icon.fx[f]}
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
