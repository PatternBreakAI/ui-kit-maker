import { create } from "zustand";
import type { GenConfig, GenStateName, IconDef, KitComponentId, KitSize, GridStyle, CandyTokens, Shape, KitDesign, KitSlice } from "./model";
import { defaultConfig, defaultCandy, applyPresetCandy, randomizeConfig, rollStatement, classicRack, presetById, PRESETS, PATTERN_TYPES, GAME_FONTS, customFontNames, ctaForFont, darken, hexMix, registerCustomFont, pickDesign, KIT_COMPONENTS, KIT_SHAPE, KIT_SLOTS, applyKitDesign, applyKitTextFill, setUserShapes, DESIGN_KEYS, effKitSize, migrateKitDesigns, clampWeight, fontByName, sanitizeUnitySlug } from "./model";
import { ensureFont } from "./fonts";
import { delBgOriginal } from "./bgvault";
import { SILHOUETTES } from "./silhouettes";
import type { UserShape } from "./model";
import { renderBevel, renderTypeSpecimen } from "./bevel";
import { getDef } from "./icons";
import { listCloudPresets, publishCloudPreset, updateCloudPreset, deleteCloudPreset, setCloudPresetSchedule, listHiddenStarters, setHiddenStarters, listHiddenSilhouettes, setHiddenSilhouettes, myProfileTier, cloudStatus, listComponentReleases, saveComponentReleases, noteLocalDocReplaced, type CloudPreset, type ReleaseStatus } from "./cloud";
import { capsOf, type Tier } from "./entitlements";
import siteDefaultJson from "./site-default.json";
import bubblePopJson from "./preset-bubble-pop.json";
import neonVersusJson from "./preset-neon-versus.json";
import grapeJellyJson from "./preset-grape-jelly.json";
import citrusPopJson from "./preset-citrus-pop.json";
import wagerJson from "./preset-wager.json";
import schweetheartJson from "./preset-schweetheart.json";
import oopsieJson from "./preset-oopsie.json";
import nopeYepJson from "./preset-nope-yep.json";
import grapeJellyKit from "./preset-grape-jelly.kit.json";

/* Presets with fully authored default designs (Chevon's uploads). */
export const PRESET_DEFAULTS: Record<string, Record<string, any>> = {
  "bubble-pop": bubblePopJson as Record<string, any>,
  "neon-versus": neonVersusJson as Record<string, any>,
  "grape-jelly": grapeJellyJson as Record<string, any>,
  "citrus-pop": citrusPopJson as Record<string, any>,
  wager: wagerJson as Record<string, any>,
  schweetheart: schweetheartJson as Record<string, any>,
  oopsie: oopsieJson as Record<string, any>,
  "nope-yep": nopeYepJson as Record<string, any>,
};

/* A starter's KIT LAYER — the per-piece work that makes it a kit rather than
   a button: forks, silhouettes, icon swaps, words, poses, nudges. Same shape
   the settings file carries under __workspace, and the same shape a user
   preset or a shipped pack travels with. A starter listed here arrives whole;
   one that isn't resets the kit layer to nothing, because a look that carries
   none of a map means "none" — blending would dress the new starter in the
   old one's pieces. Kept in its own file so the front door's authored-preset
   import stays the master look alone. */
export const PRESET_KITS: Record<string, Record<string, any>> = {
  "grape-jelly": grapeJellyKit as Record<string, any>,
};

/* Keep the text treatment's accent colors in step with the shell palette so a
   preset or color roll never leaves a stale outline color behind. */
export function retintText(c: GenConfig) {
  const bevel = c.effects.Bevel ?? "#0E9CC9";
  const glow = c.effects.Glow ?? darken(bevel, -0.4);
  c.type.outline.color = darken(bevel, 0.5);
  if (c.type.outline.color2) c.type.outline.color2 = darken(bevel, 0.7);
  c.type.shadow.color = darken(bevel, 0.62);
  c.type.glow.color = glow;
  // custom solid/gradient fills are the user's — never overwritten
}

/* One snapshot recipe for shared presets — publish and overwrite must agree:
   the stored cfg is the current look verbatim; the thumbnail is the same
   glow-free "PLAY" card a local user preset gets. */
function presetSnapshot(srcCfg: GenConfig): { cfg: GenConfig; thumb: string } {
  const clone = (typeof structuredClone === "function" ? structuredClone : (x: unknown) => JSON.parse(JSON.stringify(x)));
  const cfg = clone(srcCfg) as GenConfig;
  const tc = clone(cfg) as GenConfig;
  for (const st of Object.values(tc.states)) st.glow = 0;
  tc.content.label = "PLAY"; tc.icon.show = false;
  return { cfg, thumb: renderBevel(tc, "default") };
}

const LS_KEY = "ui-generator-v10"; // v10: specular modes, solid extrusion, gloss layering
const LS_KEY_V9 = "ui-generator-v9";
const LS_KEY_V8 = "ui-generator-v8";
// set once the user actually edits — an untouched visitor tracks the site default
const TOUCHED_KEY = "ui-generator-touched";
let persistAsked = false;
export function markTouched() {
  try { localStorage.setItem(TOUCHED_KEY, "1"); } catch { /* ignore */ }
  /* Anonymous work lives only in this browser — the moment it exists, ask the
     browser to shield the origin's storage from storage-pressure eviction
     (Safari's 7-day sweep, low-disk cleanup). Deliberate clearing still wins;
     the real safety net is signing in. */
  if (!persistAsked) {
    persistAsked = true;
    try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
  }
}
/** Has this browser ever made a real edit? (drives the browser-only nudge) */
export function isTouched(): boolean {
  try { return localStorage.getItem(TOUCHED_KEY) === "1"; } catch { return false; }
}

/* Deep-merge saved candy tokens over the current defaults so new fields
   (specular mode, gloss layer, contact…) always arrive with sane values. */
function mergeCandy(base: CandyTokens, saved?: Record<string, any>): CandyTokens {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, any>;
  if (saved) {
    for (const k of Object.keys(base)) {
      if (saved[k] && typeof saved[k] === "object") out[k] = { ...out[k], ...saved[k] };
    }
    // v9 → v10: specular "opacity" became "intensity"
    if (saved.specular?.opacity !== undefined && saved.specular?.intensity === undefined) {
      out.specular.intensity = saved.specular.opacity;
    }
    delete out.specular.opacity;
  }
  return out as CandyTokens;
}

/* One preview build eagerly snapshotted the master icon into every state
   fork, silently freezing it — master icon edits stopped flowing to any
   state the user had touched ("some states aren't updating in real time").
   A pin that still equals the master is pure freeze with no intent behind
   it: drop it so the state follows again. A pin that has since diverged is
   indistinguishable from a deliberate per-state icon, so it stands. */
export function healStateIconPins(cfg: GenConfig): GenConfig {
  for (const sd of Object.values(cfg.stateDesigns ?? {})) {
    if (sd?.icon && JSON.stringify(sd.icon) === JSON.stringify(cfg.icon)) delete sd.icon;
  }
  return cfg;
}

/** Where a look's per-piece kit layer rides inside a stored config.
 *  Declared here because hydrate() runs at module load (the bundled site
 *  default) — anything it touches must already exist. */
export const WORKSPACE_KEY = "__workspace";

export function hydrate(parsed: Record<string, any>): GenConfig {
  const d = defaultConfig();
  // a look's kit layer rides inside the stored config — it is applied
  // separately and must never settle onto the live config
  if (parsed && typeof parsed === "object" && WORKSPACE_KEY in parsed) {
    parsed = { ...parsed }; delete parsed[WORKSPACE_KEY];
  }
  const cfg = {
    ...d, ...parsed,
    candy: mergeCandy(d.candy, parsed.candy),
    type: { ...d.type, ...parsed.type },
    icon: { ...d.icon, ...parsed.icon },
    face: { ...d.face, ...parsed.face },
  } as GenConfig;
  if (!cfg.stateDesigns) cfg.stateDesigns = {};
  if (!cfg.knob) cfg.knob = { color: null };
  // state forks saved before newer candy/icon tokens existed get them merged in
  for (const sd of Object.values(cfg.stateDesigns)) {
    if (sd?.candy) sd.candy = mergeCandy(d.candy, sd.candy);
    if (sd?.icon) sd.icon = { ...d.icon, ...sd.icon };
  }
  /* pattern.zone lived for one day (2026-08-06) before the wall got its own
     spec — fold it in so those kits render pixel-identical: wall/both mirror
     the face tiles into the wall, and "wall" turns the face tiles off */
  const migratePatternZone = (p?: GenConfig["candy"]["pattern"]) => {
    if (!p?.zone) return;
    const z = p.zone;
    delete p.zone;
    if (z === "face") return;
    if (!p.wall || p.wall.type === "none")
      p.wall = { type: p.type, scale: p.scale, angle: p.angle, opacity: p.opacity, color: p.color };
    if (z === "wall") p.type = "none";
  };
  migratePatternZone(cfg.candy.pattern);
  for (const sd of Object.values(cfg.stateDesigns)) migratePatternZone(sd?.candy?.pattern);
  healStateIconPins(cfg);
  if ((cfg.shape as string) === "shard") cfg.shape = "sharp";
  // retired silhouettes map to their closest living relatives
  const RETIRED: Record<string, GenConfig["shape"]> = { chamfer: "sharp", kart: "polybar", deepchamfer: "cutline", doboMarquee: "crest", doboRibbon: "banner" };
  if (RETIRED[cfg.shape as string]) cfg.shape = RETIRED[cfg.shape as string];
  for (const sd of Object.values(cfg.stateDesigns)) {
    if (sd && RETIRED[sd.shape as string]) sd.shape = RETIRED[sd.shape as string];
  }
  (cfg.type.customFonts ?? []).forEach(registerCustomFont);
  return cfg;
}

/* Carry what translates from a v8 save into the candy model. */
function migrateV8(old: Record<string, any>): GenConfig {
  const c = defaultConfig();
  try {
    if (old.effects) c.effects = { ...c.effects, ...old.effects };
    if (old.shape) c.shape = old.shape;
    if (old.presetId) c.presetId = old.presetId;
    if (old.canvas) c.canvas = old.canvas;
    if (old.bevel) c.bevel = { width: old.bevel.width ?? c.bevel.width, softness: old.bevel.softness ?? c.bevel.softness };
    if (old.lighting) c.lighting = {
      angle: old.lighting.angle ?? c.lighting.angle,
      highlight: old.lighting.highlight ?? c.lighting.highlight,
      lowlight: old.lighting.lowlight ?? c.lighting.lowlight,
    };
    if (old.shadow) c.shadow = { ...c.shadow, ...old.shadow };
    if (old.visible) c.visible = { ...c.visible, ...old.visible };
    if (old.states) c.states = { ...c.states, ...old.states };
    if (old.content?.label !== undefined) c.content.label = old.content.label;
    if (old.type) { c.type.font = old.type.font ?? c.type.font; c.type.size = old.type.size ?? c.type.size; }
    if (old.face?.mode) c.face.mode = old.face.mode;
    if (old.content?.placement === "none") c.icon.show = false;
    else if (old.content?.placement) c.icon.placement = old.content.placement;
    if (typeof old.content?.icon === "string") {
      const def = getDef("lucide", old.content.icon);
      if (def) c.icon.def = def;
    }
  } catch { /* fall back to whatever migrated */ }
  return c;
}

/* ── site default — the "admin" path ──────────────────────────────
   On boot the app fetches default-settings.json from its own origin. If
   present, that file IS the universal default: fresh sessions open with it
   and "Reset component" returns to it. Changing the site's default = export
   settings in the app, rename to default-settings.json, upload to the repo.
   No rebuild needed. */
/* The default ships inside the bundle (site-default.json) so first paint is
   always current, and ./default-settings.json — when reachable — overrides it,
   which keeps "upload one JSON" as the admin path. */
let siteDefault: GenConfig | null = hydrate(siteDefaultJson as Record<string, any>);
export function getDefault(): GenConfig {
  const d = siteDefault ?? defaultConfig();
  return (typeof structuredClone === "function" ? structuredClone(d) : JSON.parse(JSON.stringify(d))) as GenConfig;
}
export function fetchSiteDefault(): void {
  fetch("./default-settings.json?ts=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || typeof j !== "object" || !j.presetId || !j.candy) return;
      siteDefault = hydrate(j as Record<string, any>);
      adoptDefaultIfUntouched();
    })
    .catch(() => { adoptDefaultIfUntouched(); /* bundled default stands */ });
}
/* Anyone who has never edited (fresh visitor, or someone who only looked
   around) follows the site default — their library and board are untouched. */
function adoptDefaultIfUntouched(): void {
  if (localStorage.getItem(TOUCHED_KEY) === "1") return;
  const next = getDefault();
  if (JSON.stringify(useGen.getState().cfg) === JSON.stringify(next)) return;
  useGen.setState({ cfg: next });
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function load(): GenConfig {
  try {
    for (const key of [LS_KEY, LS_KEY_V9]) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GenConfig>;
        if (parsed.presetId && parsed.candy && parsed.type) return hydrate(parsed as Record<string, any>);
      }
    }
    const v8 = localStorage.getItem(LS_KEY_V8);
    if (v8) return migrateV8(JSON.parse(v8));
  } catch { /* ignore */ }
  return getDefault();
}

interface GenStore {
  cfg: GenConfig;
  selectedState: GenStateName;
  /* ALL-STATES write-through (dev field report: "set any one parameter for
     all states without resetting all states to default"): with this on,
     whatever an edit changes becomes the value for EVERY state — the
     changed design paths are written into each state fork. Session-scoped;
     the state flag shows it loudly while it's armed. */
  allStates: boolean;
  /* recent colors (Jimi: "I had to write down the RGB"; owner: "the
     latest colors you've been using... like every other design app") —
     captured automatically as colors are used, newest first,
     kit-independent, persisted locally */
  recentColors: string[];
  phase: "master" | "kit" | "board";
  kitSizes: Partial<Record<KitComponentId, KitSize>>;
  zoom: number;
  panMode: boolean;
  gridStyle: GridStyle;
  sectionFilter: string | null;
  /** Live text filter over the editor tray — every control searchable. */
  panelQuery: string;
  setPanelQuery: (q: string) => void;
  /** The big slicing workbench over the canvas (owner: "we need to be
   *  pixel accurate here") — which piece it's open for. Session-only. */
  sliceStage: KitComponentId | null;
  setSliceStage: (cid: KitComponentId | null) => void;
  saveStatus: "saved" | "saving";
  open: Record<string, boolean>;

  panelW: number;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  canvasMode: "design" | "play";
  setCanvasMode: (m: "design" | "play") => void;
  /** Container variant being edited (circle/oval/strip) — set by the kit
   *  page's edit buttons so the canvas shows the piece you clicked. */
  kitKind: "circle" | "oval" | "strip" | null;
  setKitKind: (k: "circle" | "oval" | "strip" | null) => void;
  inheritDefaults: () => void;
  /** Promote the selected state's design + adjustments to be the new Default.
   *  The state then mirrors the new Default again. */
  makeStateDefault: () => void;
  replaceConfig: (next: GenConfig) => void;
  library: LibItem[];
  addToLibrary: (name: string) => void;
  removeFromLibrary: (id: string) => void;
  loadFromLibrary: (id: string) => void;
  /* ── v57: multiple artboards — each with a name, aspect, items and its
     own background. Item actions find their item across ALL boards, so
     selection works anywhere; add actions target the ACTIVE board. */
  boards: BoardDef[];
  activeBoard: string;
  setActiveBoard: (id: string) => void;
  addBoard: () => void;
  removeBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  /** Reorder in the pages tray — InDesign style. */
  moveBoard: (id: string, dir: -1 | 1) => void;
  clearBoard: (id: string) => void;
  /** Patch the ACTIVE board's background (image / show / opacity / blur). */
  setBoardBg: (patch: Partial<Pick<BoardDef, "bgImage" | "bgAssetId" | "bgVideo" | "bgShow" | "bgOpacity" | "bgBlur" | "bgSat" | "bgHue" | "bgBright" | "bgContrast" | "bgNoise" | "ovMode" | "ovStrength" | "ovNoise" | "ovBlend">>) => void;
  addToBoard: (libId: string) => void;
  /** Append a pre-placed set of kit pieces (starter templates). */
  addBoardItems: (items: { kitId: KitComponentId; x: number; y: number; scale?: number }[]) => void;
  /** Drop a live kit component on the board — follows the master style. */
  addKitToBoard: (kitId: KitComponentId) => void;
  duplicateBoardItem: (id: string) => void;
  rotateBoardItem: (id: string, deg: number) => void;
  /** Sets the ACTIVE board's aspect. */
  setBoardAspect: (a: "169" | "mobile") => void;
  boardSnap: boolean;
  setBoardSnap: (v: boolean) => void;
  /** Safety-area guides over every artboard (16:9: action/title safe;
   *  mobile: device insets) — a view-layer overlay, never in exports. */
  boardSafe: boolean;
  setBoardSafe: (v: boolean) => void;
  boardSel: string | null;
  setBoardSel: (id: string | null) => void;
  moveBoardItem: (id: string, x: number, y: number) => void;
  scaleBoardItem: (id: string, scale: number) => void;
  /** Pin THIS instance's value pose (0..1); null returns it to the kit-wide staged value. */
  setBoardItemVal: (id: string, v: number | null) => void;
  /** Pin THIS instance's text; null returns it to the kit-wide specimen label. */
  setBoardItemLabel: (id: string, label: string | null) => void;
  /** Drop a type stamp on the active board. */
  addStampToBoard: () => void;
  /** Edit a stamp's words or size. */
  setBoardItemStamp: (id: string, patch: Partial<{ text: string; size: number }>) => void;
  removeBoardItem: (id: string) => void;
  /** Board history — 100 levels, coalesced for continuous gestures. */
  boardPast: string[];
  boardFuture: string[];
  undoBoard: () => void;
  redoBoard: () => void;
  focus: KitComponentId | null;
  setFocus: (f: KitComponentId | null) => void;
  /** Where design edits land while a piece is focused: on the piece alone,
   *  or across its whole family. Session state — a scope is a stance, not
   *  part of the kit, and it always opens on the safest one. */
  scope: "piece" | "group";
  setScope: (s: "piece" | "group") => void;
  /** v67: the parent design — the component every unfocused edit styles.
   *  Defaults to the plain button; reassignable to any parent-eligible
   *  component (one that carries the complete recipe). */
  parentId: KitComponentId | "button";
  setParent: (id: KitComponentId | "button") => void;
  /** Shared-link viewer mode — hides downloads; never persisted. */
  viewer: boolean;
  hydrateShared: (p: Record<string, unknown>) => void;
  /** The curated, portable kit snapshot — the single payload contract behind
      both share links and named cloud projects (v76). */
  kitPayload: () => Record<string, unknown>;
  /** Unity bridge identity (spec I1, revised): the slug follows the kit's
      CURRENT name at export time. Same name → same slug, so re-exports keep
      overwriting in place; a different name is a different kit (or a
      deliberate rename) and mints a fresh Unity folder. The original
      never-re-mint rule made the slug permanent per BROWSER, not per kit —
      field bug: a brand-new kit exported under the previous kit's name. */
  unitySlug: string | null;
  setUnitySlug: (s: string) => void;
  /** Monotonic kit version stamped into each engine export's manifest —
      the importer's receipt (kit.lock.json) reports "v3 → v4" from it.
      Resets alongside a slug change: a fresh Unity folder starts at v1. */
  unityKitVer: number;
  bumpUnityKitVer: () => number;
  resetUnityKitVer: () => void;
  /** Load a kit payload into the store. `viewer:false` (opening your own
      project) persists every field so the kit survives reload and flows into
      the cloud workspace; `viewer:true` (a share / public link) is in-memory
      read-only, exactly like a shared kit. */
  loadKitPayload: (p: Record<string, unknown>, opts?: { viewer?: boolean; phase?: "master" | "kit"; projectId?: string }) => void;
  /** The cloud project doc the kit on screen came from (session-only) —
      lets the first Unity-slug mint write itself back to that doc, so a
      later reopen can't resurrect a slug-less copy and re-mint under a
      renamed kit (the I1 staleness vector). */
  openProjectId: string | null;
  /** Global shine sweep over every kit piece. */
  shine: boolean;
  setShine: (v: boolean) => void;
  kitShapes: Partial<Record<KitComponentId, Shape>>;
  setKitShape: (id: KitComponentId, shape: Shape) => void;
  kitDesigns: Partial<Record<KitComponentId, KitDesign>>;
  setKitDesign: (id: KitComponentId, d: KitDesign | null) => void;
  /** Per-component vertical text adjustment, keyed `${id}:${size}` so Primary
   *  L/M/S adjust independently. Explicit values (including 0) always win;
   *  the theme's value applies only to components never adjusted. */
  kitTextOy: Partial<Record<string, number>>;
  setKitTextOy: (key: string, v: number | null) => void;
  /** Per-component horizontal text adjustment — same keying as kitTextOy. */
  kitTextOx: Partial<Record<string, number>>;
  setKitTextOx: (key: string, v: number | null) => void;
  /** Bar-family config — dock (emblem socket) + segment settings. */
  kitBar: Partial<Record<KitComponentId, { segments?: number; gap?: number; snap?: boolean; dock?: boolean; dockSide?: "left" | "right" }>>;
  setKitBar: (id: KitComponentId, patch: Partial<{ segments: number; gap: number; snap: boolean; dock: boolean; dockSide: "left" | "right" }> | null) => void;
  /** Per-component text color override — one piece's glyphs go their own
   *  color while global Typography keeps driving everything else. */
  kitTextFill: Partial<Record<KitComponentId, string>>;
  setKitTextFill: (id: KitComponentId, color: string | null) => void;
  /** Finished pieces — a locked component ignores every edit (design,
   *  content, states, nudges) until unlocked. Locking full-pins the look
   *  first so the master can't restyle it either. */
  kitLocks: Partial<Record<KitComponentId, true>>;
  toggleKitLock: (id: KitComponentId) => void;
  /** Per-component icon swap — "none" removes the glyph (text recenters),
   *  null restores the stock one. */
  kitIcons: Partial<Record<KitComponentId, IconDef | "none">>;
  setKitIcon: (id: KitComponentId, def: IconDef | "none" | null) => void;
  /** Per-component label override — null restores the specimen text. */
  kitLabels: Partial<Record<KitComponentId, string>>;
  setKitLabel: (id: KitComponentId, label: string | null) => void;
  /** Per-component STAGED VALUE (0..1) — the resting pose every "driven
   *  by the value slider" note promises: bars fill, needles point, tiers
   *  pick, toggles flip. null restores the piece's demo value. */
  kitVals: Partial<Record<KitComponentId, number>>;
  setKitVal: (id: KitComponentId, v: number | null) => void;
  /** Per-component SECONDARY text override (combo plate word, etc.) —
   *  null restores the piece's default. */
  kitSubs: Partial<Record<KitComponentId, string>>;
  setKitSub: (id: KitComponentId, sub: string | null) => void;
  /** Data rows (and objectives built from them) carry their own two-text-group
   *  content model — independent size, tracking and vertical placement per
   *  group, plus slot toggles. Too intricate for the generic text controls. */
  kitRow: RowCfg;
  setKitRow: (patch: Partial<RowCfg>) => void;
  /** Custom kit name for the guidelines page (null = derived from preset). */
  kitName: string | null;
  setKitName: (v: string | null) => void;
  /** Named full-design snapshots — created by renaming the kit. They appear
   *  at the top of the preset grid and never overwrite the built-ins. */
  userPresets: UserPreset[];
  saveUserPreset: (name: string) => void;
  applyUserPreset: (id: string) => void;
  removeUserPreset: (id: string) => void;
  /** Admin-curated shared presets loaded from the cloud (visible to everyone). */
  cloudPresets: CloudPreset[];
  /** Whether the signed-in user may publish/edit shared presets. */
  isAdmin: boolean;
  /** guest (no session) / free (signed in) / pro (paid plan or the admin). */
  tier: Tier;
  loadCloudPresets: () => Promise<void>;
  applyCloudPreset: (id: string) => void;
  kitSlotVals: Partial<Record<KitComponentId, Record<string, string>>>;
  setKitSlot: (id: KitComponentId, slotId: string, val: string | null) => void;
  /* per-piece Unity 9-slice override, design px — null/absent = the export
     measures the borders from the rendered pixels (the default) */
  kitSlices: Partial<Record<KitComponentId, KitSlice>>;
  setKitSlice: (id: KitComponentId, v: KitSlice | null) => void;
  publishPreset: (name: string, publishAt?: string | null) => Promise<string | null>;
  schedulePreset: (id: string, publishAt: string | null) => Promise<string | null>;
  removeCloudPresetById: (id: string) => Promise<void>;
  /** The shared preset most recently applied — the Overwrite target. */
  activeCloudPreset: { id: string; name: string } | null;
  overwriteActivePreset: () => Promise<string | null>;
  /** Starter-preset ids an admin retired for every visitor (cloud-stored). */
  hiddenStarters: string[];
  hideStarterPreset: (id: string) => Promise<string | null>;
  /** stock silhouettes retired from the picker for everyone (admin curation) */
  hiddenSilhouettes: string[];
  retireSilhouette: (id: string) => Promise<string | null>;
  restoreSilhouettes: () => Promise<string | null>;
  restoreStarterPresets: () => Promise<string | null>;
  /** The staging bay's ledger — staged component id → released/rejected.
   *  Absent = still pending in the bay (admin-only). Cloud-stored. */
  componentReleases: Record<string, ReleaseStatus>;
  setComponentRelease: (id: KitComponentId, status: ReleaseStatus | null) => Promise<string | null>;
  /** Imported flat-vector silhouettes — see the spec in the Silhouette panel. */
  userShapes: UserShape[];
  addUserShape: (u: UserShape) => void;
  removeUserShape: (id: string) => void;
  styleLib: StyleItem[];
  saveStyle: (name: string) => void;
  applyStyle: (id: string) => void;
  removeStyle: (id: string) => void;
  bgImage: string | null;
  setBgImage: (url: string | null) => void;
  helpOn: boolean;
  setHelpOn: (v: boolean) => void;
  refreshLibraryItem: (id: string) => void;

  update: (fn: (c: GenConfig) => void) => void;
  /** Master-grain edit that IGNORES the focused piece. The Kit page's
      foundations controls (typography specimen etc.) always mean the master
      document — update() would route design fields into a focused piece's
      look instead (owner: "the switch works … but the slider doesn't" —
      those drags were landing in the Data row's fork). */
  updateMaster: (fn: (c: GenConfig) => void) => void;
  undo: () => void;
  redo: () => void;
  setPanelW: (w: number) => void;
  setPreset: (id: string) => void;
  randomize: () => void;
  setSelectedState: (s: GenStateName) => void;
  setAllStates: (v: boolean) => void;
  pushRecentColor: (hex: string) => void;
  rmRecentColor: (hex: string) => void;
  setPhase: (p: "master" | "kit" | "board") => void;
  setKitSize: (id: KitComponentId, s: KitSize) => void;
  /** One kit-wide size — the floating nav's M/L switch (owner: per-cell
   *  size chips were noise; size is a kit decision). Locked pieces keep
   *  their own snapshot size. */
  setKitSizeAll: (s: KitSize) => void;
  setZoom: (z: number) => void;
  setPanMode: (v: boolean) => void;
  setGridStyle: (v: GridStyle) => void;
  setSectionFilter: (v: string | null) => void;
  randomizeColors: () => void;
  toggle: (section: string) => void;
  /** Factory reset: clear every persisted kit artifact and reload. */
  resetAll: () => void;
}

/** A saved component remembers *which* kit piece it is (when saved while one
 *  was focused), so the board can render and play it as that piece — a slider
 *  stays a slider. Absent = the master button (all older saves). */
export interface LibKit { id: KitComponentId; size: KitSize; shape?: Shape }
export interface UserPreset { id: string; name: string; cfg: GenConfig; thumb?: string }
export interface LibItem { id: string; name: string; cfg: GenConfig; kit?: LibKit }
export interface StyleItem {
  id: string; name: string;
  style: Pick<GenConfig, "effects" | "face" | "bevel" | "candy" | "lighting" | "shadow" | "transparency" | "type" | "states" | "stateDesigns">;
  /** Rendered at save time by the same engine — the style's face in the list. */
  thumb?: string;
}
export interface BoardItem {
  id: string; libId: string; x: number; y: number; scale?: number;
  /** degrees, applied around the piece center */
  rot?: number;
  /** kit-asset items render the CURRENT design live (no library snapshot) */
  kitId?: KitComponentId;
  /** THIS instance's value pose (0..1) — wins over the kit-wide staged
   *  value, so one board can show a common AND a legendary rarity frame */
  v?: number;
  /** THIS instance's text — two START buttons on one screen can say START
   *  and OPTIONS (owner). Wins over the kit-wide specimen label; absent =
   *  follow the kit. Design changes still flow through live — only the
   *  words are pinned. */
  label?: string;
  /** A TYPE STAMP — the kit's full lettering treatment with no shell
   *  (owner: "temp game logos or just areas where I might need text…
   *  type the word and the ability to size it", then: "basic controls…
   *  hue / saturation, brightness/contrast", "drop shadow", "glow").
   *  size = % of the kit's type size; the adjust dials are INSTANCE-only
   *  (the kit's typography never moves); glow wears the kit's Glow color.
   *  Restyles flow through live like any kit piece. */
  stamp?: {
    text: string; size: number;
    hue?: number;      // -180..180 deg
    sat?: number;      // 0..200 %
    bright?: number;   // 0..200 %
    contrast?: number; // 0..200 %
    shadow?: number;   // 0..100 strength
    glow?: number;     // 0..100 strength
    /** simple warp (owner) — one style, one amount, raster-remapped so
     *  stage, PNG and Unity bake stay pixel-identical */
    warp?: { style: "none" | "arc" | "flag" | "bulge"; amount: number };
  };
}

/** One filter string for a backdrop's darkroom dials — the stage, the PNG
 *  compositor and the Unity bake all speak THIS. Blur last, so the color
 *  grade lands before the haze. */
export function boardBgFilter(bd: Pick<BoardDef, "bgBlur" | "bgSat" | "bgHue" | "bgBright" | "bgContrast">): string | undefined {
  const p: string[] = [];
  if (bd.bgHue) p.push(`hue-rotate(${bd.bgHue}deg)`);
  if ((bd.bgSat ?? 100) < 100) p.push(`saturate(${(bd.bgSat ?? 100) / 100})`);
  if ((bd.bgBright ?? 100) !== 100) p.push(`brightness(${(bd.bgBright ?? 100) / 100})`);
  if ((bd.bgContrast ?? 100) !== 100) p.push(`contrast(${(bd.bgContrast ?? 100) / 100})`);
  if (bd.bgBlur) p.push(`blur(${bd.bgBlur}px)`);
  return p.length ? p.join(" ") : undefined;
}

/** Seeded film grain, shared by the PNG compositor and the Unity bake —
 *  the same board always exports the same pixels. */
export function drawBoardNoise(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  if (amount <= 0) return;
  const t = document.createElement("canvas");
  t.width = t.height = 256;
  const tc = t.getContext("2d")!;
  const im = tc.createImageData(256, 256);
  let seed = 48271;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < im.data.length; i += 4) {
    const v2 = 88 + rnd() * 112;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v2; im.data[i + 3] = 255;
  }
  tc.putImageData(im, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = (amount / 100) * 0.6;
  ctx.fillStyle = ctx.createPattern(t, "repeat")!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** The warp's vertical paint reach (px at raster scale) — canvases pad by
 *  this so a bend never clips. */
export function stampWarpPad(h: number, warp: { style: string; amount: number } | undefined): number {
  if (!warp || warp.style === "none" || !warp.amount) return 0;
  const a = Math.abs(warp.amount) / 100;
  return Math.ceil(warp.style === "bulge" ? h * a * 0.25 : h * (warp.style === "arc" ? 0.5 : 0.25) * a);
}

/** Remap a stamp raster through its warp — 2px column strips, the same
 *  math on every surface. Returns a canvas padded by stampWarpPad. */
export function warpStampRaster(src: CanvasImageSource, w: number, h: number, warp: { style: "none" | "arc" | "flag" | "bulge"; amount: number }): HTMLCanvasElement {
  const pad = stampWarpPad(h, warp);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h + pad * 2));
  const ctx = cv.getContext("2d")!;
  if (!pad) { ctx.drawImage(src, 0, 0); return cv; }
  const A = (warp.amount / 100) * h;
  for (let x = 0; x < w; x += 2) {
    const sw = Math.min(2, w - x);
    const t = (x + sw / 2) / w, u = 2 * t - 1;
    if (warp.style === "bulge") {
      const sY = 1 + (warp.amount / 100) * 0.5 * (1 - u * u);
      const dh = h * sY;
      ctx.drawImage(src, x, 0, sw, h, x, pad + (h - dh) / 2, sw, dh);
    } else {
      const dy = warp.style === "arc" ? -A * 0.5 * (1 - u * u) : A * 0.25 * Math.sin(2 * Math.PI * t);
      ctx.drawImage(src, x, 0, sw, h, x, pad + dy, sw, h);
    }
  }
  return cv;
}

/** A stamp's artwork — the kit's full lettering treatment, shell off.
 *  Size scales the TYPE, so stamps stay vector-crisp at logo scale. */
export function stampSvg(cfg: GenConfig, st: NonNullable<BoardItem["stamp"]>): string {
  return renderTypeSpecimen(cfg, st.text || "GAME TITLE", { mutate: (c) => { c.type.size = Math.max(8, c.type.size * st.size / 100); } });
}

/** One filter string for a stamp's adjust dials — the stage, the board PNG
 *  compositor and the Unity scene bake all speak THIS, so they can't
 *  drift. Glow rides the kit's Glow role. */
export function stampFilter(cfg: GenConfig, st: NonNullable<BoardItem["stamp"]>): string | undefined {
  const p: string[] = [];
  if (st.hue) p.push(`hue-rotate(${st.hue}deg)`);
  if ((st.sat ?? 100) !== 100) p.push(`saturate(${(st.sat ?? 100) / 100})`);
  if ((st.bright ?? 100) !== 100) p.push(`brightness(${(st.bright ?? 100) / 100})`);
  if ((st.contrast ?? 100) !== 100) p.push(`contrast(${(st.contrast ?? 100) / 100})`);
  if (st.shadow) p.push(`drop-shadow(0 ${(2 + st.shadow * 0.1).toFixed(1)}px ${(2 + st.shadow * 0.22).toFixed(1)}px rgba(0,0,0,${(st.shadow / 100 * 0.6).toFixed(2)}))`);
  if (st.glow) {
    const g = cfg.effects.Glow ?? "#7DF9FF";
    p.push(`drop-shadow(0 0 ${(3 + st.glow * 0.22).toFixed(1)}px ${g}) drop-shadow(0 0 ${(6 + st.glow * 0.5).toFixed(1)}px ${g})`);
  }
  return p.length ? p.join(" ") : undefined;
}

/** The stamp filter's paint reach past the glyph raster (px at 1:1) — the
 *  scene bake pads its canvas by this so shadows and glow never clip. */
export function stampFilterPad(st: NonNullable<BoardItem["stamp"]>): number {
  let pad = 0;
  if (st.shadow) pad = Math.max(pad, 2 + st.shadow * 0.1 + (2 + st.shadow * 0.22) * 2);
  if (st.glow) pad = Math.max(pad, (6 + st.glow * 0.5) * 3);
  return Math.ceil(pad);
}
/** One artboard — a named, fixed-resolution stage with its own pieces and
 *  background. Backgrounds are object URLs, so the image itself is
 *  session-only; everything else persists. */
export interface BoardDef {
  id: string;
  name: string;
  aspect: "169" | "mobile";
  items: BoardItem[];
  bgImage?: string | null;
  /** The uploaded ORIGINAL's key in the background vault (bgvault.ts,
   *  IndexedDB, per-browser). bgImage stays the light ≤1920 proxy the
   *  stage drags against; the vault original is what the Unity scene
   *  export ships. Absent = bundled path / pasted URL / pre-vault save —
   *  exports fall back to the proxy. */
  bgAssetId?: string | null;
  /** A looping video backdrop (bundled /backdrops/*.mp4 path, or a
   *  session-only blob: URL from an upload). Exclusive with bgImage. */
  bgVideo?: string | null;
  bgShow?: boolean;
  bgOpacity?: number;
  bgBlur?: number;
  /** The backdrop darkroom (owner: saturation, then "hue / saturation,
   *  brightness/contrast, noise") — all baked into PNG and Unity exports,
   *  so what you see is what ships. 100/0 = untouched. */
  bgSat?: number;      // 0..100
  bgHue?: number;      // -180..180 deg
  bgBright?: number;   // 0..200 %
  bgContrast?: number; // 0..200 %
  bgNoise?: number;    // 0..100 film grain, independent of the overlay's
  /** Overlay between the backdrop and the pieces — a tint-and-grain layer
   *  that makes components pop against busy art. */
  ovMode?: "none" | "dark" | "light" | "vignette";
  ovStrength?: number;  // 0..100 — tint opacity
  ovNoise?: number;     // 0..100 — film-grain amount
  ovBlend?: "normal" | "multiply" | "screen" | "overlay" | "soft-light";
}
/** Two independent text groups + slot toggles for the Data Row family. */
export interface RowCfg {
  title: string; sub: string;
  titleSize: number; subSize: number;     // % of the base row type
  titleDy: number; subDy: number;         // vertical placement, px
  titleTrack: number; subTrack: number;   // letter-spacing, em/100
  avatar: boolean; progress: boolean; action: boolean;
  value: number;                          // progress fill %
  /** Extra distance between the title and subtitle lines (px at M). */
  lineGap?: number;
  /** Rides BOTH text lines up or down together (px at M). */
  blockDy?: number;
  /** Show the second text line at all (default true). */
  subOn?: boolean;
  /** Second line's own color; null follows the kit's soft white. */
  subColor?: string | null;
}
export function defaultRow(): RowCfg {
  return {
    title: "Shadow Knight", sub: "Level 12 · Warrior",
    titleSize: 100, subSize: 100, titleDy: 0, subDy: 0, titleTrack: 0, subTrack: 0,
    avatar: true, progress: true, action: true, value: 40,
  };
}
const LIB_KEY = "ui-generator-library";
const BOARD_KEY = "ui-generator-board";
function loadJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) as T; } catch { /* ignore */ }
  return fallback;
}
function saveJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota — keep in memory */ }
}

/* ── v57: artboard plumbing — persistence, migration, coalesced history ──
   Backgrounds are object URLs, so they are stripped on save (session-only);
   continuous gestures (drag / slider) share one history step via their key. */
type BoardsGet = () => { boards: BoardDef[]; activeBoard: string; boardPast: string[]; boardFuture: string[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSet = (p: any) => void;
let histKey = "";
let histT = 0;
/* data-URL and bundled-path backdrops persist; blob URLs cannot survive a
   reload, so they stay session-only */
const keepBg = (u: string | null | undefined) => (u && !u.startsWith("blob:") && !u.startsWith("data:") ? u : undefined);
const saveBoards = (get: () => { boards: BoardDef[]; activeBoard: string }) =>
  saveJson(BOARD_KEY, { v: 2, active: get().activeBoard, boards: get().boards.map((b) => ({ ...b, bgImage: keepBg(b.bgImage), bgVideo: keepBg(b.bgVideo) })) });

/* ── the fat-pixel rule (field crash: "chrome keeps crashing… freezes
   whenever I click anything in the left tray") ──
   A data-URL backdrop in the board doc meant EVERY board mutation dragged
   ~500KB of base64 through history + localStorage + cloud sync — seconds
   per click on a real document, and the 100-step undo held up to 100
   copies in memory. So: pixels live in the VAULT, the stage shows a
   session object URL, and the persisted doc carries only bgAssetId.
   Boot restores the URLs; legacy data-URL boards migrate into the vault
   the first time they load. */
let bgRehydrated = false;
export async function rehydrateBoardBgs(): Promise<void> {
  if (bgRehydrated || typeof indexedDB === "undefined") return;
  bgRehydrated = true;
  const { getBgOriginal, putBgOriginal } = await import("./bgvault");
  const st = useGen.getState();
  let changed = false;
  const boards = await Promise.all(st.boards.map(async (b) => {
    // vault-backed board whose session URL died with the last tab
    if (b.bgAssetId && (!b.bgImage || b.bgImage.startsWith("blob:"))) {
      const rec = await getBgOriginal(b.bgAssetId);
      if (rec) { changed = true; return { ...b, bgImage: URL.createObjectURL(rec.blob) }; }
      return b;
    }
    // legacy data-URL board — move the pixels into the vault, slim the doc
    if (b.bgImage && b.bgImage.startsWith("data:image/") && !b.bgAssetId) {
      try {
        const blob = await (await fetch(b.bgImage)).blob();
        const id = await putBgOriginal(blob, "migrated");
        if (id) { changed = true; return { ...b, bgImage: URL.createObjectURL(blob), bgAssetId: id }; }
      } catch { /* undecodable — leave it */ }
    }
    return b;
  }));
  if (changed) {
    // no history entry — this is plumbing, not an edit
    useGen.setState({ boards });
    saveBoards(useGen.getState);
  }
}

/** Downscale an uploaded background to a storable data URL (≤1920px,
 *  JPEG) — small enough to persist, big enough for a 16:9 board. */
export async function fileToBgDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(1, 1920 / img.width, 1920 / img.height);
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.width * s));
    cv.height = Math.max(1, Math.round(img.height * s));
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
const pushBoardHistory = (get: BoardsGet, set: LooseSet, key: string | null) => {
  const now = Date.now();
  if (key && key === histKey && now - histT < 900) { histT = now; return; }
  histKey = key ?? "";
  histT = now;
  set({ boardPast: [...get().boardPast, JSON.stringify({ boards: get().boards, active: get().activeBoard })].slice(-100), boardFuture: [] });
};
const mutateBoards = (get: BoardsGet, set: LooseSet, key: string | null, fn: (bs: BoardDef[]) => BoardDef[]) => {
  pushBoardHistory(get, set, key);
  set({ boards: fn(get().boards) });
  saveBoards(get);
};
const mutateItem = (get: BoardsGet, set: LooseSet, key: string, id: string, fn: (b: BoardItem) => BoardItem) =>
  mutateBoards(get, set, key, (bs) => bs.map((bd) => (bd.items.some((b) => b.id === id) ? { ...bd, items: bd.items.map((b) => (b.id === id ? fn(b) : b)) } : bd)));
function loadBoards(): { boards: BoardDef[]; activeBoard: string } {
  const raw = loadJson<unknown>(BOARD_KEY, null);
  if (Array.isArray(raw)) {
    // v1 format: a single flat item list — wrap it as Board 1
    const aspect: "169" | "mobile" = loadJson<string>("ui-generator-boardaspect", "169") === "mobile" ? "mobile" : "169";
    return { boards: [{ id: "ab1", name: "Board 1", aspect, items: raw as BoardItem[] }], activeBoard: "ab1" };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { boards?: unknown }).boards) && (raw as { boards: BoardDef[] }).boards.length) {
    const bs = (raw as { boards: BoardDef[] }).boards.map((b) => ({
      ...b,
      bgImage: b.bgImage && !b.bgImage.startsWith("blob:") ? b.bgImage : null,
      bgVideo: b.bgVideo && !b.bgVideo.startsWith("blob:") ? b.bgVideo : null,
    }));
    const act = (raw as { active?: string }).active;
    return { boards: bs, activeBoard: act && bs.some((b) => b.id === act) ? act : bs[0].id };
  }
  return { boards: [{ id: "ab1", name: "Board 1", aspect: "169", items: [] }], activeBoard: "ab1" };
}

let saveTimer: number | undefined;

/* Undo history — module-level so pushing snapshots never re-renders. Rapid
   slider drags coalesce into one step (350ms window).

   One undo step is the whole DOCUMENT: the master cfg plus every per-piece
   map. History that tracked cfg alone couldn't undo focused-piece edits,
   icon swaps, labels, silhouettes or bar settings (owner: "cmd+z doesn't
   seem to be working for a few things"). The maps update immutably, so
   holding references is a faithful snapshot. kitLocks stay OUT: locking is
   workflow, not a design edit, and undo must never silently unlock a
   finished piece. */
/* ── the kit layer ────────────────────────────────────────────────
   Everything a LOOK carries beyond the master config: silhouette
   overrides, per-piece forks, icon swaps, words, poses, nudges, sizes.
   Owner: "I want ALL changes I make to any look to port over" — so a
   preset or a shipped pack travels with this attached, under
   cfg.__workspace (no schema change, and it rides along wherever a cfg
   goes: personal presets, the studio, the release desk).
   kitLocks stays OUT on purpose: a lock is workflow ("I'm finished with
   this piece"), not part of the look — and a locked piece's DESIGN still
   ports, because locking pins it into kitDesigns. */
const KIT_STORE_KEY: Record<string, string> = {
  kitDesigns: "ui-generator-kitdesigns",
  kitShapes: "ui-generator-kitshapes",
  kitIcons: "ui-generator-kiticons",
  kitLabels: "ui-generator-kitlabels",
  kitSubs: "ui-generator-kitsubs",
  kitTextFill: "ui-generator-kittextfill",
  kitTextOy: "ui-generator-kittextoy",
  kitTextOx: "ui-generator-kittextox",
  kitBar: "ui-generator-kitbar",
  kitSlotVals: "ui-generator-kitslots",
  kitSlices: "ui-generator-kitslices",
  kitVals: "ui-generator-kitvals",
  kitRow: "ui-generator-kitrow",
};
/** Record-shaped keys — a look that carries none of one means "none",
 *  so they reset rather than blending with whatever the user had. */
const WS_MAPS = ["kitDesigns", "kitShapes", "kitIcons", "kitLabels", "kitSubs", "kitTextFill", "kitTextOy", "kitTextOx", "kitBar", "kitSlotVals", "kitVals", "kitSizes", "kitSlices"] as const;

/** The kit layer as it stands right now — what a publish attaches. */
export function workspaceOf(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [...WS_MAPS, "kitRow"]) {
    const v = s[k];
    if (v && typeof v === "object" && Object.keys(v as object).length) out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}
/** Split a stored config into the master config and its kit layer. */
export function splitWorkspace(raw: unknown): { cfg: Record<string, unknown>; ws: Record<string, unknown> | null } {
  const c = JSON.parse(JSON.stringify(raw ?? {})) as Record<string, unknown>;
  const ws = c[WORKSPACE_KEY];
  delete c[WORKSPACE_KEY];
  return { cfg: c, ws: ws && typeof ws === "object" ? (ws as Record<string, unknown>) : null };
}
/** Land a look's kit layer: the whole per-piece layer is replaced, so the
 *  look arrives as it was designed rather than blended with what was here.
 *  A look saved before packs carried a kit layer (ws null) leaves the
 *  user's own per-piece work alone. One Cmd+Z puts everything back —
 *  undo snapshots the whole document. */
function applyWorkspace(ws: Record<string, unknown> | null): void {
  if (!ws) return;
  const patch: Record<string, unknown> = {};
  for (const k of WS_MAPS) {
    const v = ws[k];
    patch[k] = v && typeof v === "object" ? v : {};
    const sk = KIT_STORE_KEY[k];
    if (sk) saveJson(sk, patch[k]);
  }
  if (ws.kitRow && typeof ws.kitRow === "object") {
    patch.kitRow = ws.kitRow;
    saveJson(KIT_STORE_KEY.kitRow, ws.kitRow);
  }
  useGen.setState(patch as Partial<GenStore>);
}

type HistSnap = Pick<GenStore, "cfg" | "kitDesigns" | "kitShapes" | "kitIcons" | "kitLabels" | "kitSubs" | "kitTextFill" | "kitTextOy" | "kitTextOx" | "kitBar" | "kitSlotVals" | "kitVals" | "kitSizes" | "kitRow" | "kitSlices">;
const HIST_KEYS = ["cfg", "kitDesigns", "kitShapes", "kitIcons", "kitLabels", "kitSubs", "kitTextFill", "kitTextOy", "kitTextOx", "kitBar", "kitSlotVals", "kitVals", "kitSizes", "kitRow", "kitSlices"] as const;
const snapOf = (s: GenStore): HistSnap => Object.fromEntries(HIST_KEYS.map((k) => [k, s[k]])) as unknown as HistSnap;
const past: HistSnap[] = [];
const future: HistSnap[] = [];
let lastPush = 0;
/* map setters call this before mutating — same coalescing window update()
   uses, so a drag that fans out over update()+setKitDesign in one gesture
   still lands as ONE undo step */
function pushHistory(s: GenStore) {
  const now = Date.now();
  if (now - lastPush > 350) {
    past.push(snapOf(s));
    if (past.length > 60) past.shift();
    lastPush = now;
  }
  future.length = 0;
}
/* undo/redo restore = what the setters persist — each map to its own key,
   so a reload after an undo doesn't resurrect the undone edit. kitSizes is
   session-only by design and stays unpersisted. */
function persistSnap(s: HistSnap) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s.cfg)); } catch { /* ignore */ }
  const rec = s as unknown as Record<string, unknown>;
  for (const [k, storeKey] of Object.entries(KIT_STORE_KEY)) saveJson(storeKey, rec[k]);
}

/* A starter arrives as a WHOLE KIT: its authored per-piece layer takes over
   from whatever the last look left behind, and a map the starter doesn't
   carry resets to empty rather than blending — otherwise Bubble Pop turns up
   wearing Grape Jelly's forks, words and icon swaps, which reads as the
   preset half-applying. kitLocks stays out on purpose: a lock is workflow
   ("I'm finished with this piece"), not part of the look, exactly as it
   stays out of a published preset. No history push of its own — the
   replaceConfig/update that precedes every call already snapshotted the
   whole document, maps included, so one undo puts the old kit back. */
function presetKitPatch(id: string, cfg: GenConfig): Partial<GenStore> {
  const kit = PRESET_KITS[id] ?? {};
  const patch: Record<string, unknown> = {};
  for (const k of [...WS_MAPS, "kitRow"]) {
    const v = kit[k];
    patch[k] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : {};
  }
  /* the same door a project open uses: a shipped fork is as old as the build
     that authored it, and an unmigrated one renders half-updated once the
     token set moves on (owner, on a shared preset: "fonts, certain states"
     arrived stale) */
  patch.kitDesigns = migrateKitDesigns(cfg, patch.kitDesigns as GenStore["kitDesigns"]).forks;
  // kitSizes is session-only by design, so it lands in state but not on disk
  for (const [k, storeKey] of Object.entries(KIT_STORE_KEY)) if (k in patch) saveJson(storeKey, patch[k]);
  return patch as Partial<GenStore>;
}

function loadPanelW(): number {
  const v = Number(localStorage.getItem("ui-generator-panelw"));
  return v >= 300 && v <= 560 ? v : 340;
}

export const useGen = create<GenStore>((set, get) => ({
  cfg: load(),
  selectedState: "default",
  allStates: false,
  // hand-saved swatches from the earlier design seed the recents once
  recentColors: loadJson<string[]>("ui-generator-recent-colors", loadJson<string[]>("ui-generator-swatches", [])),
  phase: "master",
  kitSizes: {},
  zoom: 1,
  panMode: false,
  gridStyle: "dots" as GridStyle,
  sectionFilter: null,
  panelQuery: "",
  setPanelQuery: (q) => set({ panelQuery: q }),
  sliceStage: null,
  setSliceStage: (cid) => set({ sliceStage: cid }),
  saveStatus: "saved",
  open: { state: true, shape: true, mapping: true, gloss: true },
  panelW: loadPanelW(),
  theme: (localStorage.getItem("ui-generator-theme") === "light" ? "light" : "dark") as "light" | "dark",
  setTheme: (t) => {
    try { localStorage.setItem("ui-generator-theme", t); } catch { /* ignore */ }
    set({ theme: t });
    // the stage follows the shell — users can re-mix the canvas afterwards
    const cfg = (typeof structuredClone === "function" ? structuredClone(get().cfg) : JSON.parse(JSON.stringify(get().cfg))) as GenConfig;
    cfg.canvas = t === "dark" ? "#000000" : "#F4F5F7";
    get().replaceConfig(cfg);
  },
  canvasMode: "design" as const,
  setCanvasMode: (m) => set({ canvasMode: m }),
  library: loadJson<LibItem[]>(LIB_KEY, []),
  addToLibrary: (name) => {
    const { focus, kitSizes, kitShapes, kitDesigns, kitTextOy, kitTextOx, kitTextFill } = get();
    let cfg = (typeof structuredClone === "function" ? structuredClone(get().cfg) : JSON.parse(JSON.stringify(get().cfg))) as GenConfig;
    // a locked component saves with its locked look — the snapshot IS the piece
    if (focus && kitDesigns[focus]) cfg = applyKitDesign(cfg, kitDesigns[focus]);
    // a per-piece text color bakes in the same way
    if (focus && kitTextFill[focus]) cfg = applyKitTextFill(cfg, kitTextFill[focus]);
    // a component-specific text adjustment bakes into the snapshot
    if (focus) {
      const oy = kitTextOy[`${focus}:${effKitSize(kitSizes[focus])}`];
      if (oy !== undefined) cfg.type.oy = oy;
      const ox = kitTextOx[`${focus}:${effKitSize(kitSizes[focus])}`];
      if (ox !== undefined) cfg.type.ox = ox;
    }
    const kit: LibKit | undefined = focus
      ? { id: focus, size: effKitSize(kitSizes[focus]), shape: kitShapes[focus] ?? KIT_SHAPE[focus] }
      : undefined;
    const item: LibItem = { id: "lib" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, cfg, ...(kit ? { kit } : {}) };
    const library = [...get().library, item];
    saveJson(LIB_KEY, library);
    set({ library });
  },
  removeFromLibrary: (id) => {
    const library = get().library.filter((l) => l.id !== id);
    saveJson(LIB_KEY, library);
    set({ library });
    mutateBoards(get, set, null, (bs) => bs.map((bd) => ({ ...bd, items: bd.items.filter((b) => b.libId !== id) })));
  },
  loadFromLibrary: (id) => {
    const item = get().library.find((l) => l.id === id);
    if (item) get().replaceConfig((typeof structuredClone === "function" ? structuredClone(item.cfg) : JSON.parse(JSON.stringify(item.cfg))) as GenConfig);
  },
  ...loadBoards(),
  setActiveBoard: (id) => { if (get().boards.some((b) => b.id === id)) set({ activeBoard: id }); },
  addBoard: () => {
    const id = "ab" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const cur = get().boards.find((b) => b.id === get().activeBoard);
    mutateBoards(get, set, null, (bs) => [...bs, { id, name: `Board ${bs.length + 1}`, aspect: cur?.aspect ?? "169", items: [] }]);
    set({ activeBoard: id, boardSel: null });
    saveBoards(get);
  },
  removeBoard: (id) => {
    const dead = get().boards.find((b) => b.id === id);
    if (dead?.bgAssetId) void delBgOriginal(dead.bgAssetId);
    mutateBoards(get, set, null, (bs) => {
      const rest = bs.filter((b) => b.id !== id);
      // never zero artboards — deleting the last one leaves a fresh empty one
      return rest.length ? rest : [{ id: "ab" + Date.now().toString(36), name: "Board 1", aspect: "169" as const, items: [] }];
    });
    const bs = get().boards;
    if (!bs.some((b) => b.id === get().activeBoard)) set({ activeBoard: bs[0].id, boardSel: null });
    saveBoards(get);
  },
  renameBoard: (id, name) => mutateBoards(get, set, `rename:${id}`, (bs) => bs.map((b) => (b.id === id ? { ...b, name: name.slice(0, 40) } : b))),
  moveBoard: (id, dir) => mutateBoards(get, set, null, (bs) => {
    const i = bs.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const next = [...bs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }),
  clearBoard: (id) => {
    mutateBoards(get, set, null, (bs) => bs.map((b) => (b.id === id ? { ...b, items: [] } : b)));
    set({ boardSel: null });
  },
  setBoardBg: (patch) => {
    /* replacing or clearing a vaulted background retires its ORIGINAL from
       the vault — the proxy in bgImage keeps history/undo displayable, so
       only the heavyweight bytes are reclaimed */
    if ("bgImage" in patch || "bgVideo" in patch || "bgAssetId" in patch) {
      const cur = get().boards.find((b) => b.id === get().activeBoard);
      if (cur?.bgAssetId && cur.bgAssetId !== patch.bgAssetId) void delBgOriginal(cur.bgAssetId);
      if (!("bgAssetId" in patch)) patch = { ...patch, bgAssetId: null };
    }
    mutateBoards(get, set, "bg", (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, ...patch } : b)));
  },
  addToBoard: (libId) => {
    const act = get().boards.find((b) => b.id === get().activeBoard);
    const n = act?.items.length ?? 0;
    const item: BoardItem = { id: "bd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), libId, x: 80 + (n % 3) * 340, y: 80 + Math.floor(n / 3) * 220 };
    mutateBoards(get, set, null, (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, items: [...b.items, item] } : b)));
    set({ phase: "board", boardSel: item.id });
  },
  addBoardItems: (items) => {
    // starter templates: a full set of pieces, pre-sized and pre-placed
    const stamp = Date.now().toString(36);
    const add: BoardItem[] = items.map((it, i) => ({
      id: "bd" + stamp + i + Math.random().toString(36).slice(2, 5),
      libId: "", kitId: it.kitId, x: it.x, y: it.y, ...(it.scale ? { scale: it.scale } : {}),
    }));
    mutateBoards(get, set, null, (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, items: [...b.items, ...add] } : b)));
    set({ boardSel: null });
  },
  addKitToBoard: (kitId) => {
    const act = get().boards.find((b) => b.id === get().activeBoard);
    const n = act?.items.length ?? 0;
    const mob = act?.aspect === "mobile";
    const item: BoardItem = { id: "bd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), libId: "", kitId, x: (mob ? 60 : 640) + (n % 3) * (mob ? 30 : 90), y: (mob ? 240 : 420) + (n % 3) * 60 };
    mutateBoards(get, set, null, (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, items: [...b.items, item] } : b)));
    set({ boardSel: item.id });
  },
  duplicateBoardItem: (id) => {
    let copy: BoardItem | null = null;
    mutateBoards(get, set, null, (bs) => bs.map((bd) => {
      const src = bd.items.find((b) => b.id === id);
      if (!src) return bd;
      copy = { ...src, id: "bd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), x: src.x + 28, y: src.y + 28 };
      return { ...bd, items: [...bd.items, copy] };
    }));
    if (copy) set({ boardSel: (copy as BoardItem).id });
  },
  rotateBoardItem: (id, deg) => mutateItem(get, set, `rot:${id}`, id, (b) => ({ ...b, rot: Math.max(-180, Math.min(180, Math.round(deg))) })),
  setBoardAspect: (a) => mutateBoards(get, set, "aspect", (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, aspect: a } : b))),
  boardSnap: loadJson<boolean>("ui-generator-boardsnap", true),
  setBoardSnap: (v) => { saveJson("ui-generator-boardsnap", v); set({ boardSnap: v }); },
  boardSafe: loadJson<boolean>("ui-generator-boardsafe", false),
  setBoardSafe: (v) => { saveJson("ui-generator-boardsafe", v); set({ boardSafe: v }); },
  boardSel: null,
  setBoardSel: (id) => set({ boardSel: id }),
  moveBoardItem: (id, x, y) => mutateItem(get, set, `move:${id}`, id, (b) => ({ ...b, x, y })),
  scaleBoardItem: (id, scale) => mutateItem(get, set, `scale:${id}`, id, (b) => ({ ...b, scale: Math.max(0.3, Math.min(2, scale)) })),
  setBoardItemVal: (id, v) => mutateItem(get, set, `val:${id}`, id, (b) => {
    const next = { ...b };
    if (v === null) delete next.v; else next.v = Math.max(0, Math.min(1, v));
    return next;
  }),
  setBoardItemLabel: (id, label) => mutateItem(get, set, `label:${id}`, id, (b) => {
    const next = { ...b };
    if (label === null || label === "") delete next.label; else next.label = label;
    return next;
  }),
  addStampToBoard: () => {
    const item: BoardItem = { id: "bd" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), libId: "", x: 560, y: 420, stamp: { text: "GAME TITLE", size: 100 } };
    mutateBoards(get, set, null, (bs) => bs.map((b) => (b.id === get().activeBoard ? { ...b, items: [...b.items, item] } : b)));
    set({ phase: "board", boardSel: item.id });
  },
  setBoardItemStamp: (id, patch) => mutateItem(get, set, `stamp:${id}`, id, (b) => (
    b.stamp ? { ...b, stamp: { ...b.stamp, ...patch, size: Math.max(25, Math.min(400, patch.size ?? b.stamp.size)) } } : b
  )),
  removeBoardItem: (id) => {
    mutateBoards(get, set, null, (bs) => bs.map((bd) => ({ ...bd, items: bd.items.filter((b) => b.id !== id) })));
    if (get().boardSel === id) set({ boardSel: null });
  },
  boardPast: [],
  boardFuture: [],
  undoBoard: () => {
    const past = get().boardPast;
    if (!past.length) return;
    const present = JSON.stringify({ boards: get().boards, active: get().activeBoard });
    const prev = JSON.parse(past[past.length - 1]) as { boards: BoardDef[]; active: string };
    histKey = ""; // an undo breaks any coalescing run
    set({ boards: prev.boards, activeBoard: prev.active, boardPast: past.slice(0, -1), boardFuture: [...get().boardFuture, present].slice(-100), boardSel: null });
    saveBoards(get);
  },
  redoBoard: () => {
    const fut = get().boardFuture;
    if (!fut.length) return;
    const present = JSON.stringify({ boards: get().boards, active: get().activeBoard });
    const next = JSON.parse(fut[fut.length - 1]) as { boards: BoardDef[]; active: string };
    histKey = "";
    set({ boards: next.boards, activeBoard: next.active, boardFuture: fut.slice(0, -1), boardPast: [...get().boardPast, present].slice(-100), boardSel: null });
    saveBoards(get);
  },
  focus: null,
  // choosing a piece to edit lifts any rail focus filter — the user asked
  // for THIS component, so every relevant section must be reachable
  // focusing a piece always lands on the narrow scope AND the Default state:
  // a group edit or a state pick is a deliberate choice, never something you
  // inherit from the last piece (owner: jumping pieces with Pressed still
  // selected kept landing edits on the fork — "that is what is messing me up")
  setFocus: (f) => set({ focus: f, phase: "master", sectionFilter: null, scope: "piece", selectedState: "default" }),
  scope: "piece",
  setScope: (s) => set({ scope: s }),
  parentId: loadJson<KitComponentId | "button">("ui-generator-parent", "button"),
  setParent: (id) => { saveJson("ui-generator-parent", id); set({ parentId: id }); },
  viewer: false,
  unitySlug: loadJson<string | null>("ui-generator-unityslug", null),
  setUnitySlug: (s) => { saveJson("ui-generator-unityslug", s); set({ unitySlug: s }); },
  unityKitVer: loadJson<number>("ui-generator-unitykitver", 0),
  bumpUnityKitVer: () => {
    const n = get().unityKitVer + 1;
    saveJson("ui-generator-unitykitver", n);
    set({ unityKitVer: n });
    return n;
  },
  resetUnityKitVer: () => {
    saveJson("ui-generator-unitykitver", 0);
    set({ unityKitVer: 0 });
  },
  kitPayload: () => {
    const st = get();
    return {
      v: 1, cfg: st.cfg, kitName: st.kitName, kitShapes: st.kitShapes, kitDesigns: st.kitDesigns,
      kitTextFill: st.kitTextFill, kitLabels: st.kitLabels, kitSubs: st.kitSubs, kitIcons: st.kitIcons, kitSizes: st.kitSizes, kitSlotVals: st.kitSlotVals, kitVals: st.kitVals,
      kitBar: st.kitBar, kitTextOy: st.kitTextOy, kitTextOx: st.kitTextOx, kitLocks: st.kitLocks,
      unitySlug: st.unitySlug, unityKitVer: st.unityKitVer,
      // the stage travels with the kit — only portable (data:) backdrops
      bgImage: st.bgImage && st.bgImage.startsWith("data:") ? st.bgImage : null,
    };
  },
  loadKitPayload: (p, opts) => {
    const st = get();
    const viewer = opts?.viewer ?? true;
    set({ activeCloudPreset: null }); // a loaded kit isn't a shared preset — no Overwrite target
    const cfg = healStateIconPins((p.cfg as GenConfig) ?? st.cfg);
    /* the travelling stage: strict base64 image data URLs only — this string
       ends up in CSS url(), so nothing that could break out of it gets in.
       A payload without one keeps the local backdrop (it's workspace). */
    const bg = typeof p.bgImage === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(p.bgImage)
      ? p.bgImage : null;
    const next = {
      cfg,
      kitName: (p.kitName as string) ?? st.kitName,
      kitShapes: (p.kitShapes as GenStore["kitShapes"]) ?? {},
      kitDesigns: migrateKitDesigns(cfg, (p.kitDesigns as GenStore["kitDesigns"]) ?? {}).forks,
      kitTextFill: (p.kitTextFill as GenStore["kitTextFill"]) ?? {},
      kitLabels: (p.kitLabels as GenStore["kitLabels"]) ?? {},
      kitSubs: (p.kitSubs as GenStore["kitSubs"]) ?? {},
      kitIcons: (p.kitIcons as GenStore["kitIcons"]) ?? {},
      kitSlotVals: (p.kitSlotVals as GenStore["kitSlotVals"]) ?? {},
      kitVals: (p.kitVals as GenStore["kitVals"]) ?? {},
      kitSizes: (p.kitSizes as GenStore["kitSizes"]) ?? {},
      kitBar: (p.kitBar as GenStore["kitBar"]) ?? {},
      kitTextOy: (p.kitTextOy as GenStore["kitTextOy"]) ?? {},
      kitTextOx: (p.kitTextOx as GenStore["kitTextOx"]) ?? {},
      kitLocks: (p.kitLocks as GenStore["kitLocks"]) ?? {},
      /* the Unity slug is the PROJECT's identity in the user's Unity
         assets — it must ride project open/save, or a re-export after a
         reload would mint a new slug and orphan everything placed.
         Sanitized on the way in: payloads arrive from share links and
         cloud docs, and the slug becomes a zip path segment. */
      unitySlug: sanitizeUnitySlug(p.unitySlug),
      unityKitVer: (typeof p.unityKitVer === "number" ? p.unityKitVer : 0),
      ...(bg ? { bgImage: bg } : {}),
    };
    if (!viewer) {
      // opening your own project: persist to the same keys the app boots from
      // so it survives reload and the write-hook syncs it to the cloud workspace
      // (kitSizes is session-only in this app, so it is set but not persisted).
      markTouched();
      saveJson(LS_KEY, next.cfg);
      saveJson("ui-generator-kitname", next.kitName);
      saveJson("ui-generator-kitshapes", next.kitShapes);
      saveJson("ui-generator-kitdesigns", next.kitDesigns);
      saveJson("ui-generator-kittextfill", next.kitTextFill);
      saveJson("ui-generator-kitlabels", next.kitLabels);
      saveJson("ui-generator-kitvals", next.kitVals);
      saveJson("ui-generator-kitsubs", next.kitSubs);
      saveJson("ui-generator-kiticons", next.kitIcons);
      saveJson("ui-generator-kitbar", next.kitBar);
      saveJson("ui-generator-kittextoy", next.kitTextOy);
      saveJson("ui-generator-kittextox", next.kitTextOx);
      saveJson("ui-generator-kitlocks", next.kitLocks);
      saveJson("ui-generator-unityslug", next.unitySlug);
      saveJson("ui-generator-unitykitver", next.unityKitVer);
      if (bg) saveJson("ui-generator-bgimage", bg);
      /* the opened project is now the local truth — any cloud pull still in
         flight must NOT stomp it (owner: "I saw it for a second but then
         the [old] version took over") */
      noteLocalDocReplaced();
    }
    // a settings import stays in the editor; project opens land on the kit
    set({ ...next, viewer, phase: opts?.phase ?? "kit", openProjectId: viewer ? null : (opts?.projectId ?? null) });
  },
  openProjectId: null,
  hydrateShared: (p) => get().loadKitPayload(p, { viewer: true }),
  shine: loadJson<boolean>("ui-generator-shine", false),
  setShine: (v) => { saveJson("ui-generator-shine", v); set({ shine: v }); },
  styleLib: loadJson<StyleItem[]>("ui-generator-styles", []),
  saveStyle: (name) => {
    markTouched();
    const c = get().cfg;
    const clone = (typeof structuredClone === "function" ? structuredClone : (x: unknown) => JSON.parse(JSON.stringify(x)));
    const style = clone({
      effects: c.effects, face: c.face, bevel: c.bevel, candy: c.candy, lighting: c.lighting,
      shadow: c.shadow, transparency: c.transparency, type: c.type, states: c.states, stateDesigns: c.stateDesigns,
    }) as StyleItem["style"];
    // thumbnail: the current look, rendered tight (no glow pad) with a short label
    const tc = clone(c) as GenConfig;
    for (const s of Object.values(tc.states)) s.glow = 0;
    tc.content.label = c.content.label || "Aa";
    const thumb = renderBevel(tc, "default");
    const styleLib = [...get().styleLib, { id: String(Date.now()), name, style, thumb }];
    saveJson("ui-generator-styles", styleLib);
    set({ styleLib });
  },
  applyStyle: (id) => {
    const item = get().styleLib.find((x) => x.id === id);
    if (!item) return;
    const next = (typeof structuredClone === "function" ? structuredClone : (x: unknown) => JSON.parse(JSON.stringify(x)))(get().cfg) as GenConfig;
    Object.assign(next, (typeof structuredClone === "function" ? structuredClone : (x: unknown) => JSON.parse(JSON.stringify(x)))(item.style));
    get().replaceConfig(next);
  },
  removeStyle: (id) => {
    const styleLib = get().styleLib.filter((x) => x.id !== id);
    saveJson("ui-generator-styles", styleLib);
    set({ styleLib });
  },
  kitShapes: loadJson<Partial<Record<KitComponentId, Shape>>>("ui-generator-kitshapes", {}),
  setKitShape: (id, shape) => {
    if (get().kitLocks[id]) return; // finished pieces don't move
    markTouched();
    pushHistory(get());
    const kitShapes = { ...get().kitShapes, [id]: shape };
    saveJson("ui-generator-kitshapes", kitShapes);
    set({ kitShapes });
  },
  kitTextFill: loadJson<Partial<Record<KitComponentId, string>>>("ui-generator-kittextfill", {}),
  kitLocks: loadJson<Partial<Record<KitComponentId, true>>>("ui-generator-kitlocks", {}),
  toggleKitLock: (id) => {
    const locks = { ...get().kitLocks };
    if (locks[id]) {
      delete locks[id]; // unlocking keeps the pinned look — just editable again
    } else {
      /* locking seals WHAT'S ON SCREEN: full-pin the merged look (design,
         state forks, state adjustments, icon rig) so the master can't
         restyle it */
      const clone2 = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
      const merged = clone2(applyKitDesign(get().cfg, get().kitDesigns[id]));
      const kitDesigns = { ...get().kitDesigns, [id]: { ...pickDesign(merged), stateDesigns: merged.stateDesigns ?? {}, states: merged.states, icon: merged.icon } };
      saveJson("ui-generator-kitdesigns", kitDesigns);
      set({ kitDesigns });
      locks[id] = true;
    }
    markTouched();
    saveJson("ui-generator-kitlocks", locks);
    set({ kitLocks: locks });
  },
  setKitTextFill: (id, color) => {
    if (get().kitLocks[id]) return; // finished pieces don't move
    markTouched();
    pushHistory(get());
    const kitTextFill = { ...get().kitTextFill };
    if (color) kitTextFill[id] = color; else delete kitTextFill[id];
    saveJson("ui-generator-kittextfill", kitTextFill);
    set({ kitTextFill });
  },
  /* v57: per-component icon swap — the override rides opts.icon everywhere
     the component draws a glyph (kit page, board, exports). */
  kitIcons: loadJson<Partial<Record<KitComponentId, IconDef | "none">>>("ui-generator-kiticons", {}),
  setKitIcon: (id, def) => {
    if (get().kitLocks[id]) return; // finished pieces don't move
    markTouched();
    pushHistory(get());
    const kitIcons = { ...get().kitIcons };
    if (def) kitIcons[id] = def; else delete kitIcons[id];
    saveJson("ui-generator-kiticons", kitIcons);
    set({ kitIcons });
  },
  /* Chosen slot values per component (unit choices etc). Same lifecycle
     as kitLabels: local, synced with the workspace, riding kit payloads. */
  kitSlotVals: loadJson<Partial<Record<KitComponentId, Record<string, string>>>>("ui-generator-kitslots", {}),
  kitSlices: loadJson<Partial<Record<KitComponentId, KitSlice>>>("ui-generator-kitslices", {}),
  setKitSlice: (id, v) => {
    markTouched();
    pushHistory(get());
    const kitSlices = { ...get().kitSlices };
    if (v) kitSlices[id] = v; else delete kitSlices[id];
    saveJson("ui-generator-kitslices", kitSlices);
    set({ kitSlices });
  },
  setKitSlot: (id, slotId, val) => {
    /* a lock freezes the LOOK, not the words — slot DATA stays editable on a
       finished piece (owner: "I need to input data into the input fields").
       Color slots are look, so they stay frozen with the rest. */
    if (get().kitLocks[id] && KIT_SLOTS[id]?.find((s) => s.id === slotId)?.kind === "color") return;
    markTouched();
    pushHistory(get());
    const kitSlotVals = { ...get().kitSlotVals };
    const cur = { ...(kitSlotVals[id] ?? {}) };
    if (val !== null && val !== "") cur[slotId] = val; else delete cur[slotId];
    if (Object.keys(cur).length) kitSlotVals[id] = cur; else delete kitSlotVals[id];
    saveJson("ui-generator-kitslots", kitSlotVals);
    set({ kitSlotVals });
  },
  kitVals: loadJson<Partial<Record<KitComponentId, number>>>("ui-generator-kitvals", {}),
  setKitVal: (id, v) => {
    // a staged value is DATA — editable on locked pieces, like the words
    markTouched();
    pushHistory(get());
    const kitVals = { ...get().kitVals };
    if (v === null) delete kitVals[id]; else kitVals[id] = Math.max(0, Math.min(1, v));
    saveJson("ui-generator-kitvals", kitVals);
    set({ kitVals });
  },
  kitLabels: loadJson<Partial<Record<KitComponentId, string>>>("ui-generator-kitlabels", {}),
  setKitLabel: (id, label) => {
    // words stay editable on a finished piece — the lock freezes the look
    markTouched();
    pushHistory(get());
    const kitLabels = { ...get().kitLabels };
    if (label !== null && label !== "") kitLabels[id] = label; else delete kitLabels[id];
    saveJson("ui-generator-kitlabels", kitLabels);
    set({ kitLabels });
  },
  kitSubs: loadJson<Partial<Record<KitComponentId, string>>>("ui-generator-kitsubs", {}),
  setKitSub: (id, sub) => {
    // words stay editable on a finished piece — the lock freezes the look
    markTouched();
    pushHistory(get());
    const kitSubs = { ...get().kitSubs };
    if (sub !== null && sub !== "") kitSubs[id] = sub; else delete kitSubs[id];
    saveJson("ui-generator-kitsubs", kitSubs);
    set({ kitSubs });
  },
  kitDesigns: (() => {
    // v70: stored full-snapshot forks are re-read as sparse overrides so
    // components resume following the parent design (kit auto-updates)
    const m = migrateKitDesigns(load(), loadJson<Partial<Record<KitComponentId, KitDesign>>>("ui-generator-kitdesigns", {}));
    if (m.changed) saveJson("ui-generator-kitdesigns", m.forks);
    return m.forks;
  })(),
  setKitDesign: (id, d) => {
    if (get().kitLocks[id]) return; // finished pieces don't move
    markTouched();
    pushHistory(get());
    const kitDesigns = { ...get().kitDesigns };
    if (d) kitDesigns[id] = d; else delete kitDesigns[id];
    saveJson("ui-generator-kitdesigns", kitDesigns);
    set({ kitDesigns });
  },
  userPresets: loadJson<UserPreset[]>("ui-generator-userpresets", []),
  saveUserPreset: (name) => {
    markTouched();
    const clone = (typeof structuredClone === "function" ? structuredClone : (x: unknown) => JSON.parse(JSON.stringify(x)));
    const cfg = clone(get().cfg) as GenConfig;
    const tc = clone(cfg) as GenConfig;
    for (const st of Object.values(tc.states)) st.glow = 0;
    tc.content.label = "PLAY"; tc.icon.show = false;
    const thumb = renderBevel(tc, "default");
    // your own presets carry the whole kit too — the per-piece layer rides
    // inside the stored config, so it survives the sync and the studio
    const stored = { ...cfg, [WORKSPACE_KEY]: workspaceOf(get() as unknown as Record<string, unknown>) } as unknown as GenConfig;
    const existing = get().userPresets.find((u) => u.name === name);
    const userPresets = existing
      ? get().userPresets.map((u) => (u.name === name ? { ...u, cfg: stored, thumb } : u))
      : [{ id: "up" + Date.now().toString(36), name, cfg: stored, thumb }, ...get().userPresets];
    saveJson("ui-generator-userpresets", userPresets);
    set({ userPresets });
  },
  applyUserPreset: (id) => {
    const u = get().userPresets.find((x) => x.id === id);
    if (!u) return;
    const { cfg: raw, ws } = splitWorkspace(u.cfg);
    const next = raw as unknown as GenConfig;
    next.canvas = get().cfg.canvas; // presets restyle the component, never the stage
    next.rarity = get().cfg.rarity; // the rarity system is the game's, not the preset's
    get().replaceConfig(next);
    applyWorkspace(ws);             // …and every per-piece change it was saved with
    get().setKitName(u.name);
    set({ activeCloudPreset: null });
  },
  removeUserPreset: (id) => {
    const userPresets = get().userPresets.filter((x) => x.id !== id);
    saveJson("ui-generator-userpresets", userPresets);
    set({ userPresets });
  },
  cloudPresets: [],
  isAdmin: false,
  tier: "guest" as Tier,
  loadCloudPresets: async () => {
    const [presets, hidden, prof, releases, hiddenSils] = await Promise.all([listCloudPresets(), listHiddenStarters(), myProfileTier(), listComponentReleases(), listHiddenSilhouettes()]);
    const admin = prof.admin;
    // cloud-off (local/dev build) is not the funnel — it gets the free tier,
    // not guest lockdown; the live site always has cloud configured.
    // plan_id is server-truth: only the Stripe webhook writes anything but
    // 'free', and it writes 'student' or 'pro' from the price purchased.
    const tier: Tier = admin ? "pro"
      : prof.plan === "student" ? "student"
      : (prof.plan && prof.plan !== "free") ? "pro"
      : prof.plan ? "free"
      : cloudStatus().state === "off" ? "free" : "guest";
    set({ cloudPresets: presets, isAdmin: admin, hiddenStarters: hidden, hiddenSilhouettes: hiddenSils, tier, componentReleases: releases });
    // a lowered zoom ceiling applies immediately, not on the next gesture
    if (get().zoom > capsOf(tier).zoomMax) set({ zoom: capsOf(tier).zoomMax });
    const act = get().activeCloudPreset;
    if (act && !presets.some((p) => p.id === act.id)) set({ activeCloudPreset: null });
  },
  applyCloudPreset: (id) => {
    const p = get().cloudPresets.find((x) => x.id === id);
    if (!p) return;
    const { cfg: raw, ws } = splitWorkspace(p.cfg);
    const next = raw as unknown as GenConfig;
    next.canvas = get().cfg.canvas; // shared presets restyle the component, never the stage
    next.rarity = get().cfg.rarity; // the rarity system is the game's, not the preset's
    get().replaceConfig(next);
    applyWorkspace(ws);             // …and every per-piece change it shipped with
    get().setKitName(p.name);
    set({ activeCloudPreset: { id: p.id, name: p.name } });
  },
  publishPreset: async (name, publishAt = null) => {
    const { cfg, thumb } = presetSnapshot(get().cfg);
    // a pack ships the WHOLE kit: master look + every per-piece change
    const payload = { ...cfg, [WORKSPACE_KEY]: workspaceOf(get() as unknown as Record<string, unknown>) };
    const { preset, error } = await publishCloudPreset(name, payload, thumb, publishAt);
    if (error) return error;
    // the fresh publish becomes the Overwrite target — tweak-and-save flows on
    if (preset) set({ activeCloudPreset: { id: preset.id, name: preset.name } });
    await get().loadCloudPresets();
    return null;
  },
  removeCloudPresetById: async (id) => {
    await deleteCloudPreset(id);
    await get().loadCloudPresets();
  },
  /* Move a pack's release date (or clear it to ship now). Admin-only —
     the read policy is what actually holds a dated pack back. */
  schedulePreset: async (id, publishAt) => {
    const err = await setCloudPresetSchedule(id, publishAt);
    if (err) return err;
    await get().loadCloudPresets();
    return null;
  },
  activeCloudPreset: null,
  overwriteActivePreset: async () => {
    const target = get().activeCloudPreset;
    if (!target) return "Apply a shared preset first — then Overwrite saves your tweaks back into it.";
    const { cfg, thumb } = presetSnapshot(get().cfg);
    // Overwrite ships the whole kit back, same as a fresh publish
    const payload = { ...cfg, [WORKSPACE_KEY]: workspaceOf(get() as unknown as Record<string, unknown>) };
    const err = await updateCloudPreset(target.id, payload, thumb);
    if (err) return err;
    await get().loadCloudPresets();
    return null;
  },
  hiddenStarters: [],
  hideStarterPreset: async (id) => {
    const next = [...new Set([...get().hiddenStarters, id])];
    const err = await setHiddenStarters(next);
    if (!err) set({ hiddenStarters: next });
    return err;
  },
  restoreStarterPresets: async () => {
    const err = await setHiddenStarters([]);
    if (!err) set({ hiddenStarters: [] });
    return err;
  },
  hiddenSilhouettes: [],
  retireSilhouette: async (id) => {
    const next = [...new Set([...get().hiddenSilhouettes, id])];
    const err = await setHiddenSilhouettes(next);
    if (!err) set({ hiddenSilhouettes: next });
    return err;
  },
  restoreSilhouettes: async () => {
    const err = await setHiddenSilhouettes([]);
    if (!err) set({ hiddenSilhouettes: [] });
    return err;
  },
  componentReleases: {},
  setComponentRelease: async (id, status) => {
    const next = { ...get().componentReleases };
    if (status === null) delete next[id]; else next[id] = status;
    const err = await saveComponentReleases(next);
    if (!err) set({ componentReleases: next });
    return err;
  },
  kitName: loadJson<string | null>("ui-generator-kitname", null),
  setKitName: (v) => { markTouched(); saveJson("ui-generator-kitname", v); set({ kitName: v }); },
  userShapes: (() => { const l = loadJson<UserShape[]>("ui-generator-usershapes", []); setUserShapes(l); return l; })(),
  addUserShape: (u) => {
    markTouched();
    const userShapes = [...get().userShapes.filter((x) => x.id !== u.id), u];
    setUserShapes(userShapes); saveJson("ui-generator-usershapes", userShapes);
    set({ userShapes });
  },
  removeUserShape: (id) => {
    markTouched();
    const userShapes = get().userShapes.filter((x) => x.id !== id);
    setUserShapes(userShapes); saveJson("ui-generator-usershapes", userShapes);
    // anything still wearing the removed silhouette falls back to Rounded
    const st = get();
    const kitShapes = Object.fromEntries(Object.entries(st.kitShapes).filter(([, v]) => v !== id));
    set({ userShapes, kitShapes: kitShapes as typeof st.kitShapes });
    if (st.cfg.shape === id) st.update((c) => { c.shape = "round"; });
  },
  kitRow: { ...defaultRow(), ...loadJson<Partial<RowCfg>>("ui-generator-kitrow", {}) },
  setKitRow: (patch) => {
    if (get().kitLocks.datarow) return;
    markTouched();
    pushHistory(get());
    const kitRow = { ...get().kitRow, ...patch };
    saveJson("ui-generator-kitrow", kitRow);
    set({ kitRow });
  },
  kitTextOy: loadJson<Partial<Record<string, number>>>("ui-generator-kittextoy", {}),
  setKitTextOy: (key, v) => {
    if (get().kitLocks[key.split(":")[0] as KitComponentId]) return;
    markTouched();
    pushHistory(get());
    const kitTextOy = { ...get().kitTextOy };
    // null clears the override (back to the theme); 0 is a valid explicit value
    if (v === null) delete kitTextOy[key]; else kitTextOy[key] = v;
    saveJson("ui-generator-kittextoy", kitTextOy);
    set({ kitTextOy });
  },
  kitTextOx: loadJson<Partial<Record<string, number>>>("ui-generator-kittextox", {}),
  setKitTextOx: (key, v) => {
    if (get().kitLocks[key.split(":")[0] as KitComponentId]) return;
    markTouched();
    pushHistory(get());
    const kitTextOx = { ...get().kitTextOx };
    if (v === null) delete kitTextOx[key]; else kitTextOx[key] = v;
    saveJson("ui-generator-kittextox", kitTextOx);
    set({ kitTextOx });
  },
  kitBar: loadJson<GenStore["kitBar"]>("ui-generator-kitbar", {}),
  setKitBar: (id, patch) => {
    if (get().kitLocks[id]) return; // finished pieces don't move
    markTouched();
    pushHistory(get());
    const kitBar = { ...get().kitBar };
    if (patch === null) delete kitBar[id];
    else kitBar[id] = { ...kitBar[id], ...patch };
    saveJson("ui-generator-kitbar", kitBar);
    set({ kitBar });
  },
  bgImage: loadJson<string | null>("ui-generator-bgimage", null),
  setBgImage: (url) => {
    // data URLs persist (and ride the workspace sync + kit payload, so the
    // backdrop travels with shares); blob URLs stay session-only
    if (url === null || url.startsWith("data:")) { markTouched(); saveJson("ui-generator-bgimage", url); }
    set({ bgImage: url });
  },
  helpOn: false,
  setHelpOn: (v) => set({ helpOn: v }),
  refreshLibraryItem: (id) => {
    const clone = typeof structuredClone === "function" ? structuredClone : ((x: unknown) => JSON.parse(JSON.stringify(x)));
    const library = get().library.map((l) => l.id === id ? { ...l, cfg: clone(get().cfg) as GenConfig } : l);
    saveJson(LIB_KEY, library);
    set({ library });
  },
  kitKind: null,
  setKitKind: (k) => { if (get().kitLocks.panel) return; set({ kitKind: k }); },
  inheritDefaults: () => {
    /* A locked focused piece keeps its state forks — and now its state
       adjustments — in the LOCK; the master's aren't the ones on screen, so
       resetting only the master looked like a dead button AND leaked the
       adjustment spread to the whole kit. Focused: mirror the piece's own
       effective states and clear its forks (empty map shields the master's);
       the master and every other piece don't move. */
    const focus0 = get().focus;
    if (focus0 && get().kitLocks[focus0]) return; // finished pieces don't move
    const kd = focus0 ? get().kitDesigns[focus0] : undefined;
    if (focus0 && kd) {
      const eff = kd.states ?? get().cfg.states;
      const st4 = { default: { ...eff.default }, hover: { ...eff.default }, pressed: { ...eff.default }, disabled: { ...eff.default } } as GenConfig["states"];
      const kitDesigns = { ...get().kitDesigns, [focus0]: { ...kd, stateDesigns: {}, states: st4 } };
      saveJson("ui-generator-kitdesigns", kitDesigns);
      set({ kitDesigns });
      return;
    }
    const cfg = (typeof structuredClone === "function" ? structuredClone(get().cfg) : JSON.parse(JSON.stringify(get().cfg))) as GenConfig;
    cfg.states.hover = { ...cfg.states.default };
    cfg.states.pressed = { ...cfg.states.default };
    cfg.states.disabled = { ...cfg.states.default };
    cfg.stateDesigns = {};
    get().replaceConfig(cfg);
  },
  makeStateDefault: () => {
    const sel = get().selectedState;
    if (sel === "default") return;
    const clone2 = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
    const cfg = clone2(get().cfg);
    const focus0 = get().focus;
    if (focus0 && get().kitLocks[focus0]) return; // finished pieces don't move
    const kd0 = focus0 ? get().kitDesigns[focus0] : undefined;
    if (focus0 && kd0) {
      /* What the user SEES on a locked piece is master ⊕ lock — promote THAT
         fork into the piece's pinned design, and ITS state adjustments into
         the piece's pinned states. The master doesn't move at all. */
      const work = clone2(applyKitDesign(cfg, kd0));
      const d = work.stateDesigns?.[sel];
      if (d) {
        for (const key of DESIGN_KEYS) (work as any)[key] = (d as any)[key];
        delete work.stateDesigns![sel];
      }
      work.states.default = { ...work.states[sel] };
      const kitDesigns = { ...get().kitDesigns, [focus0]: { ...pickDesign(work), stateDesigns: work.stateDesigns ?? {}, states: work.states, ...(kd0.icon !== undefined ? { icon: work.icon } : {}) } };
      saveJson("ui-generator-kitdesigns", kitDesigns);
      set({ kitDesigns, selectedState: "default" });
      return;
    }
    const d = cfg.stateDesigns?.[sel];
    if (d) {
      // the state's forked design becomes the root design
      for (const key of DESIGN_KEYS) (cfg as any)[key] = (d as any)[key];
      delete cfg.stateDesigns[sel];
    }
    // its whole-component adjustments become the default baseline too
    cfg.states.default = { ...cfg.states[sel] };
    get().replaceConfig(cfg);
    set({ selectedState: "default" });
  },
  replaceConfig: (nextRaw) => {
    markTouched();
    /* Every wholesale look-swap lands here (shared presets, your presets,
       styles, starters, imports), so this is where a stored config gets
       made whole again: custom font families re-registered (without it
       fontByName falls back to the stock face and the look arrives in the
       wrong type), newer candy/icon tokens merged into state forks (older
       forks otherwise render half-updated), retired silhouettes remapped,
       frozen icon pins healed. Idempotent, so paths that already hydrated
       lose nothing by passing through. Owner: applying a shared preset left
       "fonts, certain states" behind. */
    const next = hydrate(nextRaw as unknown as Record<string, unknown>);
    past.push(snapOf(get()));
    if (past.length > 60) past.shift();
    future.length = 0;
    lastPush = 0;
    set({ cfg: next, saveStatus: "saving" });
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(get().cfg)); } catch { /* ignore */ }
      set({ saveStatus: "saved" });
    }, 300);
  },

  update: (fn) => {
    // a locked focused piece swallows edits whole — the tray is visibly
    // paused, so a silent no-op here is honest, not a dead control
    const lf = get().focus;
    if (lf && get().kitLocks[lf]) return;
    markTouched();
    const prev = get().cfg;
    const snap0 = snapOf(get()); // the pre-edit document — maps included
    // structuredClone is ~3-4x faster than JSON round-tripping — keeps rapid
    // slider drags responsive
    const clone2 = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
    const cfg = clone2(prev);
    /* What-you-see-is-what-you-edit: when the focused piece is LOCKED, its
       snapshot is the design on screen — so edits are applied to a working
       config built from that snapshot and flow back INTO the snapshot.
       The master (and every other piece) doesn't move. Content, states
       and canvas stay shared and land on the master as always. */
    const focus0 = get().focus;
    const lockedId = focus0 && get().kitDesigns[focus0] ? focus0 : null;
    const work = lockedId ? clone2(applyKitDesign(cfg, get().kitDesigns[lockedId])) : cfg;
    const sel = get().selectedState;
    const allStates = get().allStates;
    /* pre-edit snapshot of the surface being edited — the all-states pass
       diffs against it to learn exactly which design paths this edit moved */
    const preSections = allStates ? clone2(work) : null;
    if (sel !== "default") {
      // editing a non-default state: fork its design on first touch, then
      // route all design-field edits into the fork — Default stays untouched
      if (!work.stateDesigns) work.stateDesigns = {};
      if (!work.knob) work.knob = { color: null };
      if (!work.stateDesigns[sel]) work.stateDesigns[sel] = pickDesign(work);
      const d = work.stateDesigns[sel]!;
      /* the icon forks LAZILY: the state edits a working copy, and only an
         actual icon change pins it to this state — otherwise the state
         keeps following the master's icon (a fork born from a non-icon
         edit froze the icon and master edits stopped showing, owner) */
      const baseIcon = d.icon ?? work.icon;
      const tIcon = JSON.parse(JSON.stringify(baseIcon)) as GenConfig["icon"];
      const t = Object.assign({}, work, {
        effects: d.effects, face: d.face, bevel: d.bevel, candy: d.candy,
        lighting: d.lighting, shadow: d.shadow, transparency: d.transparency, type: d.type,
        icon: tIcon,
      }) as GenConfig;
      Object.defineProperty(t, "shape", { get: () => d.shape, set: (v) => { d.shape = v; }, enumerable: true, configurable: true });
      fn(t);
      d.effects = t.effects; d.face = t.face; d.bevel = t.bevel; d.candy = t.candy;
      d.lighting = t.lighting; d.shadow = t.shadow; d.transparency = t.transparency; d.type = t.type;
      if (JSON.stringify(t.icon) !== JSON.stringify(baseIcon)) d.icon = t.icon;
      // the typeface is one decision for the whole component — weight, colors
      // and effects stay state-specific
      if (d.type.font !== work.type.font) {
        work.type.font = d.type.font;
        for (const other of Object.values(work.stateDesigns)) { if (other?.type) other.type.font = d.type.font; }
      }
      /* the GLYPH is one decision for the whole component (like the
         typeface) — colour, effects and weight stay state-specific
         ("I want to be able to change this per state", owner).
         Its POSITION joins that list: a glyph that jumps between states
         reads as jitter, not design, and pieces whose states carry
         different content (the badge's count vs its star) need one
         placement that holds across all of them (owner: "I need nudge to
         be state-independent"). Press-down movement is already the job of
         the Lift slider, which moves the whole piece. */
      const gi = d.icon;
      const glyphKeys = ["show", "placement", "only", "ox", "oy"] as const;
      if (gi && (JSON.stringify(gi.def ?? null) !== JSON.stringify(work.icon.def ?? null) || glyphKeys.some((k) => gi[k] !== work.icon[k]))) {
        work.icon.def = gi.def;
        for (const k of glyphKeys) (work.icon[k] as unknown) = gi[k];
        for (const other of Object.values(work.stateDesigns)) {
          if (other?.icon) { other.icon.def = gi.def; for (const k of glyphKeys) (other.icon[k] as unknown) = gi[k]; }
        }
      }
      work.content = t.content; work.states = t.states; work.visible = t.visible;
      work.canvas = t.canvas; work.presetId = t.presetId;
    } else {
      fn(work);
    }
    /* ── ALL-STATES write-through: the changed design paths become the value
       for every state. Forks are FULL copies (not sparse masks), so the new
       value is written into each one; a state edit pushes to the master
       too, which the pre-fork states inherit. Content, canvas and the
       states-adjustment sliders stay out of it — they are already shared. */
    if (allStates && preSections) {
      const SECTIONS = ["effects", "face", "bevel", "candy", "lighting", "shadow", "transparency", "type"] as const;
      const edited = (sel !== "default" ? (work.stateDesigns?.[sel] ?? work) : work) as unknown as Record<string, unknown>;
      const before = (sel !== "default"
        ? (preSections.stateDesigns?.[sel] ?? pickDesign(preSections))
        : preSections) as unknown as Record<string, unknown>;
      const changes: { path: string[]; v: unknown }[] = [];
      const walk = (a: unknown, b: unknown, path: string[]) => {
        if (a === b) return;
        const obj = (x: unknown) => x !== null && typeof x === "object" && !Array.isArray(x);
        if (obj(a) && obj(b)) {
          const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
          for (const k of keys) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]);
          return;
        }
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ path, v: b });
      };
      for (const sec of SECTIONS) walk(before[sec], edited[sec], [sec]);
      if (changes.length) {
        const setPath = (o: Record<string, unknown>, path: string[], v: unknown) => {
          let t = o;
          for (let i = 0; i < path.length - 1; i++) {
            const k = path[i];
            if (t[k] === null || typeof t[k] !== "object") return; // shape mismatch — skip, don't invent structure
            t = t[k] as Record<string, unknown>;
          }
          t[path[path.length - 1]] = typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
        };
        const targets: Record<string, unknown>[] = [work as unknown as Record<string, unknown>];
        for (const f2 of Object.values(work.stateDesigns ?? {})) if (f2) targets.push(f2 as unknown as Record<string, unknown>);
        for (const t2 of targets) { if (t2 === (edited as unknown)) continue; for (const ch of changes) setPath(t2, ch.path, ch.v); }
      }
    }
    if (lockedId) {
      // design fields → the piece's lock; everything shared → the master
      cfg.content = work.content;
      cfg.visible = work.visible; cfg.canvas = work.canvas; cfg.presetId = work.presetId;
      cfg.knob = work.knob; cfg.barFx = work.barFx; cfg.rarity = work.rarity;
      /* state ADJUSTMENTS isolate to the piece too — "edits save into this
         piece" must hold for the Global sliders. Pin on first touch (or keep
         an existing pin); an untouched piece keeps following the master. */
      const kdPrev = get().kitDesigns[lockedId];
      const statesPin = !!kdPrev?.states || JSON.stringify(work.states) !== JSON.stringify(cfg.states);
      /* the icon RIG isolates the same way — resizing one piece's glyph must
         not resize every glyph in the kit. An unpinned, untouched rig still
         writes through and keeps following the master. */
      const iconPin = !!kdPrev?.icon || JSON.stringify(work.icon) !== JSON.stringify(cfg.icon);
      if (!iconPin) cfg.icon = work.icon;
      const nkd: KitDesign = { ...pickDesign(work), stateDesigns: work.stateDesigns ?? {}, ...(statesPin ? { states: work.states } : {}), ...(iconPin ? { icon: work.icon } : {}) };
      const kitDesigns = { ...get().kitDesigns, [lockedId]: nkd };
      saveJson("ui-generator-kitdesigns", kitDesigns);
      set({ kitDesigns });
    }
    const now = Date.now();
    if (now - lastPush > 350) {
      past.push(snap0);
      if (past.length > 60) past.shift();
      lastPush = now;
    }
    future.length = 0;
    set({ cfg, saveStatus: "saving" });
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(get().cfg)); } catch { /* ignore */ }
      set({ saveStatus: "saved" });
    }, 600);
  },
  updateMaster: (fn) => {
    markTouched();
    const snap0 = snapOf(get());
    const clone2 = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
    const cfg = clone2(get().cfg);
    fn(cfg);
    const now = Date.now();
    if (now - lastPush > 350) {
      past.push(snap0);
      if (past.length > 60) past.shift();
      lastPush = now;
    }
    future.length = 0;
    set({ cfg, saveStatus: "saving" });
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(get().cfg)); } catch { /* ignore */ }
      set({ saveStatus: "saved" });
    }, 600);
  },
  undo: () => {
    const p = past.pop();
    if (!p) return;
    future.push(snapOf(get()));
    lastPush = 0;
    set({ ...p });
    persistSnap(p);
  },
  redo: () => {
    const f = future.pop();
    if (!f) return;
    past.push(snapOf(get()));
    lastPush = 0;
    set({ ...f });
    persistSnap(f);
  },
  setPanelW: (w) => {
    const v = Math.max(300, Math.min(560, Math.round(w)));
    try { localStorage.setItem("ui-generator-panelw", String(v)); } catch { /* ignore */ }
    set({ panelW: v });
  },
  setPreset: (id) => {
    set({ activeCloudPreset: null }); // a starter takes over — Overwrite retargets on next apply
    /* a preset apply REBRANDS the kit — user and cloud presets already
       setKitName to their own name; starters were the one kind that left
       the old name behind (owner field report: a restyled kit kept
       exporting as the previous kit). Clearing the name hands the title
       and the export identity to the starter ("The Toxic Kit" →
       the-toxic-kit) until the maker names it. */
    get().setKitName(null);
    // Bubble Pop ships as a fully authored look (Chevon's bubblepopdefault) —
    // picking it loads that complete design rather than re-mixing tokens
    if (PRESET_DEFAULTS[id]) {
      const next = hydrate(structuredClone(PRESET_DEFAULTS[id]));
      next.canvas = get().cfg.canvas; // presets restyle the component, never the stage
      next.rarity = get().cfg.rarity; // the rarity system is the game's, not the preset's
      get().replaceConfig(next); // pushes the undo snapshot — maps included
      set(presetKitPatch(id, get().cfg));
      return;
    }
    const p = presetById(id);
    get().update((c) => {
      c.presetId = id; c.shape = p.shape; c.bevel = { ...p.bevel }; c.effects = { ...p.effects };
      // the starter's typography voice comes with it — a preset switch that
      // keeps the old face reads as "the fonts don't update"
      if (p.font) { c.type.font = p.font; c.type.weight = clampWeight(fontByName(p.font).caps, p.fontWeight ?? c.type.weight); }
      const candy = defaultCandy();
      applyPresetCandy(candy, p);
      c.candy = candy;
      /* a preset is a COMPLETE style recipe — stale per-state forks from
         the previous look must not survive it, or hover/pressed flash the
         old design (adversarial review find, 2026-07-25: seven starters
         flipped to hard-candy blue on hover over site-default's forks).
         States mirror the new master live again; re-forking is one edit
         away, and undo restores the old forks whole. */
      c.stateDesigns = {};
      retintText(c);
    });
    set(presetKitPatch(id, get().cfg)); // after update(), so its snapshot still holds the old maps
  },
  randomize: () => {
    // one statement per roll — shared with randomizeConfig so the app
    // button and the homepage speak the same taste rules
    const statement = rollStatement();
    const next = randomizeConfig(get().cfg, get().hiddenStarters, statement);
    const roll = (n: number) => Math.floor(Math.random() * n);
    get().update((c) => {
      c.effects = next.effects; // lighting stays put — rolled light angles tilted the speculars askew
      // v67: a third of rolls jump the CONSTRUCTION too — silhouette, bevel
      // and candy build from a random preset — so randomize explores the
      // whole wardrobe instead of recoloring one outfit
      if (Math.random() < 0.34) {
        // retired starters stay retired — rolls draw from the visible wardrobe
        const pool = PRESETS.filter((p) => !get().hiddenStarters.includes(p.id));
        const pr = pool.length ? pool[roll(pool.length)] : PRESETS[roll(PRESETS.length)];
        c.shape = pr.shape;
        c.bevel = { ...pr.bevel };
        applyPresetCandy(c.candy, pr);
      } else {
        // every roll changes the cut. A "cut" statement draws from the
        // full rack including the Gothic drop (owner: "make sure the new
        // silhouettes appear in the relevant random generators"); other
        // statements keep the cut classic so the roll makes ONE loud
        // move. Preset jumps above keep their curated theatrical cuts.
        const rack = statement === "cut"
          ? SILHOUETTES.filter((m) => (m.category === "Buttons" || m.gothicCut) && !m.preview && m.id !== c.shape)
          : classicRack(c.shape);
        c.shape = rack[roll(rack.length)].id;
      }
      /* the wardrobe includes the voice now — every roll picks a fresh
         face from the permanent rack plus registered customs (owner: "we
         need to change the font with the randomizer (every time). you can
         always undo to go back", retiring the old typography-is-sacred
         rule), weight clamped into what the face can show */
      // registry hygiene: users paste specimen URLs into the custom box and
      // the registry keeps them — the roll only wears plausible family names
      /* the voice still changes EVERY roll (owner rule) — but only a
         "font" statement draws from the whole wild rack; other rolls draw
         from the faces the blessed presets wear, so the type stays sturdy
         while something else makes the statement */
      const allFaces = [...GAME_FONTS.map((f) => f.name), ...customFontNames().filter((n2) => !/[:/]/.test(n2) && n2.length < 40)];
      const presetFaces = [...new Set(PRESETS.map((p) => p.font).filter((f2): f2 is string => !!f2))];
      const pool = (statement === "font" ? allFaces : presetFaces.length ? presetFaces : allFaces).filter((f2) => f2 !== c.type.font);
      const faces = pool.length ? pool : allFaces.filter((f2) => f2 !== c.type.font);
      const face = faces[roll(faces.length)];
      ensureFont(face);
      c.type.font = face;
      c.type.weight = clampWeight(fontByName(face).caps, c.type.weight);
      // a roll that lands on a Chinese face carries a recognized CTA into
      // Chinese (and back out) — the same takeover as the font picker
      const swap = ctaForFont(c.content.label, face);
      if (swap) c.content.label = swap;
      // pattern rolls tone-on-tone so it stays harmonious; "none" is rare
      // and every family pulls real, VISIBLE weight
      /* the WHOLE wardrobe, derived from the real list — the roll was
         hardcoded to the original five, so the second pattern wave
         (houndstooth, chevron, waves…) never came up (owner: "is
         randomize everything picking up all the new content?") */
      /* pattern discipline: a "pattern" statement wears it proudly; any
         other roll wears it as quiet texture or not at all — 88% of the
         old rolls wore a pattern, half of them LOUD (owner: "really
         unpleasing"). Angles snap to 15° so diagonals read deliberate. */
      const pats = PATTERN_TYPES.filter((t) => t.id !== "none").map((t) => t.id);
      c.candy.pattern.type = (statement === "pattern" ? false : Math.random() < 0.3) ? "none" : pats[roll(pats.length)];
      c.candy.pattern.color = null;
      c.candy.pattern.opacity = statement === "pattern" ? 36 + roll(23) : 10 + roll(15);
      c.candy.pattern.scale = statement === "pattern" ? 35 + roll(46) : 50 + roll(46);
      c.candy.pattern.angle = roll(13) * 15;
      // glass is its own statement, never a side effect on a busy roll
      c.transparency = statement === "glass"
        ? { frame: 100, interior: 74 + roll(19), content: 100 }
        : { frame: 100, interior: 100, content: 100 };
      // gloss gradient re-tints from the new palette
      const bevel = c.effects.Bevel ?? "#0E9CC9";
      c.candy.gloss.tint = darken(bevel, 0.15);
      c.candy.gloss.tint2 = hexMix(c.effects.Glow ?? "#8FF0FF", "#FFFFFF", 0.5);
      // the stage is the user's workspace — a roll restyles the component only
      retintText(c);
    });
  },
  setSelectedState: (s) => set({ selectedState: s }),
  setAllStates: (v) => set({ allStates: v }),
  pushRecentColor: (hex) => {
    // one canonical casing — <input type="color"> emits lowercase while
    // presets and hand-typed values arrive either way, and two spellings
    // of one color would sit in the rail as duplicates
    const h = (hex || "").toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(h)) return;
    const cur = get().recentColors;
    if (cur[0] === h) return;
    const recentColors = [h, ...cur.filter((s) => s.toUpperCase() !== h)].slice(0, 10);
    saveJson("ui-generator-recent-colors", recentColors);
    set({ recentColors });
  },
  rmRecentColor: (hex) => {
    const h = (hex || "").toUpperCase();
    const recentColors = get().recentColors.filter((s) => s.toUpperCase() !== h);
    saveJson("ui-generator-recent-colors", recentColors);
    set({ recentColors });
  },
  // the kit is a guidelines DOCUMENT — it always opens at reading scale,
  // whatever zoom the editor or board was left at.
  // Leaving the editor also drops play mode: play hides the inspector by
  // design, and a round trip through the kit page brought it back hidden
  // with no visible reason (owner: "the controls are disappearing")
  /* EVERY phase navigation lands in Design mode. The old rule only reset
     Play when LEAVING master, so Board → master carried Play along — and
     Play slims the whole control tray, which reads as the app breaking
     (owner: "the left tray isn't expanded... when I roundtrip"). Play is
     a per-visit gesture, never a stowaway. */
  setPhase: (p) => set({ phase: p, canvasMode: "design" as const, ...(p === "kit" ? { zoom: 1 } : {}) }),
  setKitSize: (id, s) => { if (get().kitLocks[id]) return; pushHistory(get()); set((st) => ({ kitSizes: { ...st.kitSizes, [id]: s } })); },
  setKitSizeAll: (s) => {
    pushHistory(get());
    set((st) => {
      const sizes = { ...st.kitSizes };
      for (const c of KIT_COMPONENTS) { if (!st.kitLocks[c.id]) sizes[c.id] = s; }
      return { kitSizes: sizes };
    });
  },
  setZoom: (z) => set({ zoom: Math.max(0.4, Math.min(capsOf(get().tier).zoomMax, Math.round(z * 10) / 10)) }),
  setPanMode: (v) => set({ panMode: v }),
  setGridStyle: (v) => set({ gridStyle: v }),
  setSectionFilter: (v) => set({ sectionFilter: v }),
  randomizeColors: () => {
    const next = randomizeConfig(get().cfg, get().hiddenStarters);
    get().update((c) => { c.effects = next.effects; retintText(c); });
  },
  toggle: (s) => set((st) => ({ open: { ...st.open, [s]: !st.open[s] } })),
  resetAll: () => {
    /* Factory reset — wipes every persisted kit artifact (design, locks,
       per-piece overrides, nudges, rows, library, board, styles, presets,
       silhouettes, name) and reloads into the shipped default. The page
       theme is the one preference that survives. */
    try {
      const theme = localStorage.getItem("ui-generator-theme");
      Object.keys(localStorage)
        .filter((k2) => k2.startsWith("ui-generator"))
        .forEach((k2) => localStorage.removeItem(k2));
      if (theme) localStorage.setItem("ui-generator-theme", theme);
    } catch { /* storage unavailable — reload still restores defaults */ }
    window.location.reload();
  },
}));

// kick off the site-default fetch once the store exists
fetchSiteDefault();

/* Fonts land AFTER first paint, and the renderer sizes canvases from real
   glyph measurements when the face is loaded (see measureLabel in bevel).
   A fresh cfg identity invalidates every render memo, so the whole app
   re-renders measured the moment a face arrives — without touching undo
   history or persistence. */
if (typeof document !== "undefined" && document.fonts?.addEventListener) {
  document.fonts.addEventListener("loadingdone", () => {
    useGen.setState((st) => ({ cfg: { ...st.cfg } }));
  });
}
