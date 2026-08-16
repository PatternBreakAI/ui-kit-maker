import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, ShieldCheck, CreditCard, FolderInput, Rocket, Star, CalendarClock, Trash2, RefreshCw, Users, Activity, Wand2, House, Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
import "@/styles/pricing.css";
import { cloudConfig, myProfileTier, accessToken, listHiddenLandingKits, setHiddenLandingKits, listLandingKitOrder, setLandingKitOrder, uniqueName } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import { hydrate, healStateIconPins, PRESET_DEFAULTS, retintText } from "@/generator/store";
import { applyKitDesign, applyKitTextFill, applyPresetCandy, clampWeight, defaultCandy, defaultConfig, effKitSize, fontByName, migrateKitDesigns, PRESETS, resolveKitIcon, type GenConfig, type KitComponentId, type KitDesign, type KitSize, type Shape } from "@/generator/model";
import { renderBevel, renderKit } from "@/generator/bevel";
import { ensureDocFonts, ensureFont } from "@/generator/fonts";
import { tightenSvg } from "@/marketing/engine";
import logoUrl from "../../pb-logo.png";

/* #/admin — the owner's desk: find an account by email, set its plan.

   Nothing links here; the URL is the door. The client-side admin check
   below only decides what renders — the real gate is api/admin.ts, which
   re-verifies is_admin from the database on every call. A non-admin who
   types the URL is bounced to the landing page; one who calls the API
   anyway gets a 403.

   Deliberately minimal: search, three plan buttons, an adopt-kits mover,
   a confirm each. No user deletion, no impersonation, no editing anything
   else. Adopt exists to retire an account without losing its work — the
   kits change owner, the empty account is then deleted by hand in
   Supabase (never from here). */

type Row = {
  id: string; email: string | null; plan: string; status: string | null;
  renewsAt: string | null; hasStripe: boolean; hasSubscription: boolean;
  isAdmin: boolean; createdAt: string | null;
};

/* the pulse. Counts can come back null if a table isn't migrated on this
   deployment — the tile shows a dash rather than a lying zero. */
type Stats = {
  signups: number | null; signups7: number | null; paying: number | null;
  kits: number | null; kits7: number | null; exports: number | null; exports7: number | null;
  daily: { day: string; n: number }[];
};

const PLANS = ["pro", "student", "free"] as const;

async function callAdmin(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const token = await accessToken();
  if (!token) return { ok: false, data: { error: "Sign in first." } };
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* platform error page */ }
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Couldn't reach the admin service — check your connection." } };
  }
}

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type FoundKit = { projectId: string; name: string; kitName: string | null; email: string | null; updatedAt: string };
type Studio = {
  userId: string; email: string | null; kitName: string | null; updatedAt: string;
  presets: { upId: string; name: string }[];
};
/* what's on the preview bench: a saved kit, or a personal preset pulled
   straight from a maker's synced studio */
type Picked =
  | { kind: "project"; projectId: string; name: string; email: string | null }
  | { kind: "studio"; userId: string; upId: string; name: string; email: string | null };
type Desig = {
  id: string; kitName: string; presetName: string; placement: string;
  sourceEmail: string | null; dealNote: string | null; createdAt: string; publishAt: string | null;
  /** hero rows only: the frozen snapshot's design recipe, for the rack's tiles */
  cfg?: Record<string, unknown> | null;
};

/* The desk's live preview — the same engine the gallery cards use, but
   synchronous: the doc is already in hand, so the pieces render in a
   memo and land via dangerouslySetInnerHTML (React owns the node; no
   manual innerHTML into React's territory — the gallery taught us). */
function KitPreview({ doc }: { doc: Record<string, unknown> }) {
  /* the desk renders OTHER makers' kits — their faces are never in this
     document's font set, so EQUIP wore a fallback (owner report). Load
     every family the doc speaks; the browser re-rasterizes the inline
     SVG text when each face lands. hydrate() already registered any
     custom fonts, so ensureFont can resolve them. */
  useEffect(() => {
    try {
      ensureDocFonts(hydrate(doc.cfg as Record<string, unknown>), doc.kitDesigns);
    } catch { /* unrenderable docs already report below */ }
  }, [doc]);
  const out = useMemo(() => {
    try {
      /* the same healing the editor runs on project OPEN — the desk reads
         raw saved docs, and older saves store per-piece forks as FULL
         design snapshots. Applied verbatim, a snapshot fork freezes that
         piece at the look it wore when the fork was minted — the badge
         rendered an old design while the editor (which migrates on load)
         showed today's. Migrate first, exactly like loadKitPayload. */
      const cfg = healStateIconPins(hydrate(doc.cfg as Record<string, unknown>) as GenConfig);
      const designs = migrateKitDesigns(cfg, (doc.kitDesigns ?? {}) as Partial<Record<KitComponentId, KitDesign>>).forks;
      const fills = (doc.kitTextFill ?? {}) as Record<string, never>;
      const labels = (doc.kitLabels ?? {}) as Record<string, string>;
      const slots = (doc.kitSlotVals ?? {}) as Record<string, Record<string, string>>;
      /* the WHOLE per-piece story, not just the style forks — the bench
         used to drop kitShapes / sizes / icons / values / bar config and
         the per-size type-seat nudges, so a heavily tuned kit previewed
         as an older version of itself (owner: "the thumbnail isn't
         grabbing the latest imagery"). Same plumbing as the kit page's
         usePiece, doc-fed. Sizes are the kit's own: the seat nudges are
         keyed per size, so forcing a display size un-seats the type. */
      const shapes = (doc.kitShapes ?? {}) as Record<string, Shape>;
      const sizes = (doc.kitSizes ?? {}) as Record<string, KitSize>;
      const icons = (doc.kitIcons ?? {}) as Record<string, Parameters<typeof resolveKitIcon>[0]>;
      const vals = (doc.kitVals ?? {}) as Record<string, number>;
      const subs = (doc.kitSubs ?? {}) as Record<string, string>;
      const oy = (doc.kitTextOy ?? {}) as Record<string, number>;
      const ox = (doc.kitTextOx ?? {}) as Record<string, number>;
      const bars = (doc.kitBar ?? {}) as Record<string, { dock?: boolean; dockSide?: "left" | "right"; segments?: number; gap?: number; snap?: boolean }>;
      /* size follows the kit page's rule EXACTLY: effKitSize(unset) is L,
         so a kit whose sizes map is empty (the nav's L state) previews at
         L here too. The old fixed display sizes rendered the minis a size
         class below the kit page — smaller geometry, smaller type,
         sparser pattern — which read as a stale badge (owner report,
         round two). The card's CSS clamps the box; the ART must be the
         kit's own size. */
      const piece = (cid: KitComponentId, v?: number) => {
        const size = effKitSize(sizes[cid]);
        const kb = bars[cid];
        return tightenSvg(renderKit(
          applyKitTextFill(applyKitDesign(cfg, designs[cid]), fills[cid]),
          cid, size, "default", vals[cid] ?? v, shapes[cid],
          {
            label: labels[cid], slots: slots[cid], sub: subs[cid],
            icon: resolveKitIcon(icons[cid], undefined),
            textOy: oy[`${cid}:${size}`], textOx: ox[`${cid}:${size}`],
            themedText: !!designs[cid]?.type || !!fills[cid],
            ...(cid === "progress" && kb ? {
              dock: kb.dock ? { icon: resolveKitIcon(icons[cid], undefined), side: kb.dockSide ?? "left" } : null,
              bar: { segments: kb.segments, gap: kb.gap, snap: kb.snap },
            } : {}),
          },
        ), 18);
      };
      const html =
        `<div class="cg-hero">${piece("primary" as KitComponentId)}</div>` +
        `<div class="cg-minis">${[
          piece("progress" as KitComponentId, 0.62),
          piece("toggle" as KitComponentId, 1),
          piece("badge" as KitComponentId),
        ].map((s) => `<span>${s}</span>`).join("")}</div>`;
      const bg = doc.bgImage;
      const stage = typeof bg === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(bg) ? bg : null;
      return { html, stage };
    } catch {
      return null;
    }
  }, [doc]);
  if (!out) return <p className="fd-fine">This kit wouldn't render — its payload may be from an old version. Ask the maker to open and re-save it.</p>;
  return (
    <div
      className={`cg-art${out.stage ? " cg-art--stage" : ""}`}
      style={{ borderRadius: 12, ...(out.stage ? { backgroundImage: `url("${out.stage}")` } : {}) }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: out.html }}
    />
  );
}

/* ── homepage curation rack ──────────────────────────────────────────
   The HARDCODED front-door examples (hero reel, style chips, community
   cards) an admin can retire without a deploy. Match keys are lowercase
   DISPLAY NAMES: the landing checks names on every surface, and names
   never collide across surfaces the way shared preset ids do (Grape
   Jelly the reel entry vs Grape Arcade the card). KEEP THE NAME SET IN
   SYNC with HERO_SWATCHES / HERO_REEL / CM_KITS in
   src/marketing/landingInit.ts.

   `look` records how the landing builds that example, so the rack can
   draw a real thumbnail: authored looks load their full design
   (PRESET_DEFAULTS — the same JSONs the landing's AUTHORED table
   carries); the rest apply the starter recipe, exactly like the app's
   own preset tray. Four names sit on BOTH the reel and the chip row —
   one hide covers both, so each is one tile with an "also" note. */
type HomeExample = {
  name: string;       // display name — THE hide key
  look: string;       // starter id the landing resolves the look through
  authored?: boolean; // full authored design (PRESET_DEFAULTS) vs plain recipe
  label?: string;     // label the homepage shows on it (authored looks wear their own words)
  also?: string;      // the same name also curates another surface
};
const HOME_ROSTER: { group: string; entries: HomeExample[] }[] = [
  { group: "Hero reel", entries: [
    { name: "Grape Jelly", look: "grape-jelly", authored: true, also: "also a style chip" },
    { name: "Hard Candy", look: "hard-candy", label: "PLAY", also: "also a style chip" },
    { name: "Schweetheart", look: "schweetheart", authored: true },
    { name: "Neon Versus", look: "neon-versus", authored: true },
    { name: "Oopsie", look: "oopsie", authored: true },
    { name: "Citrus Pop", look: "citrus-pop", authored: true, also: "also a style chip" },
    { name: "Bubble Pop", look: "bubble-pop", authored: true, also: "also a style chip" },
    { name: "Nope Yep", look: "nope-yep", authored: true },
    { name: "Wager", look: "wager", authored: true },
  ] },
  { group: "Style chips", entries: [
    { name: "Deep Ocean", look: "deep-ocean" },
    { name: "Forest Sprite", look: "forest-sprite" },
    { name: "Hero Chisel", look: "hero-chisel" },
    { name: "Glacier Tech", look: "glacier-tech" },
  ] },
  { group: "Community cards", entries: [
    { name: "Grape Arcade", look: "grape-jelly", authored: true, label: "GRAPE" },
    { name: "Abyss Console", look: "deep-ocean", label: "ABYSS" },
    { name: "Forge Standard", look: "hero-chisel", label: "FORGE" },
  ] },
];

/* A group's entries in their DISPLAYED order: ranked by the saved order
   list (same lowercase name keys as the hidden list), unlisted names
   keeping their roster order behind the listed ones — the exact contract
   the landing's kitOrder helper applies to each homepage surface. */
function orderedEntries<T extends { name: string }>(entries: T[], order: string[]): T[] {
  if (!order.length) return entries;
  const rank = (n: string) => { const i = order.indexOf(n.toLowerCase()); return i === -1 ? order.length : i; };
  return entries.map((e, i) => [e, rank(e.name), i] as const)
    .sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map((x) => x[0]);
}

/* One thumbnail per roster entry, by the same engine as everything else.
   Mirrors the app's preset tray recipe (Panel.presetArt): authored looks
   hydrate their complete design and keep their own words; recipe looks
   wear the label the homepage shows. Glow zeroed + viewBox tightened so
   the art sits quiet in its tile. A look that won't resolve returns
   null — the rack shows a labeled placeholder and the toggle still
   works, because the hide list only speaks names. */
function homeExampleArt(ex: HomeExample): string | null {
  try {
    let pc: GenConfig | null = null;
    if (ex.authored && PRESET_DEFAULTS[ex.look]) {
      pc = hydrate(structuredClone(PRESET_DEFAULTS[ex.look]));
    } else {
      const p = PRESETS.find((x) => x.id === ex.look); // no presetById — its fallback would draw the WRONG look
      if (p) {
        pc = defaultConfig();
        pc.presetId = p.id; pc.shape = p.shape; pc.bevel = { ...p.bevel }; pc.effects = { ...p.effects };
        if (p.font) { pc.type.font = p.font; pc.type.weight = clampWeight(fontByName(p.font).caps, p.fontWeight ?? pc.type.weight); }
        const candy = defaultCandy(); applyPresetCandy(candy, p); pc.candy = candy;
        retintText(pc);
      }
    }
    if (!pc) return null;
    if (ex.label || !ex.authored) pc.content.label = ex.label ?? "PLAY";
    pc.icon.show = false;
    for (const s of Object.values(pc.states)) s.glow = 0;
    return tightenSvg(renderBevel(pc, "default"), 20);
  } catch {
    return null;
  }
}

/** parked-forever sentinel (upcoming with no date yet) reads as "parked" */
function releaseWord(d: Desig): string {
  if (d.placement === "hero") return "hero lineup";
  if (!d.publishAt) return "live";
  const t = new Date(d.publishAt).getTime();
  if (t > Date.now() + 1000 * 60 * 60 * 24 * 365 * 20) return "parked — no date yet";
  return t <= Date.now() ? "live" : `releases ${fmtDay(d.publishAt)}`;
}

/* The built-in reel/chip names (community cards are a separate surface).
   A designated hero wearing one of these names COLLAPSES onto that tile:
   the owner's frozen snapshot takes the seat and the art (designating a
   look by a built-in's name is a deliberate replacement, not a clash). */
const BUILTIN_REEL_NAMES = new Set(
  HOME_ROSTER.filter((g) => g.group !== "Community cards")
    .flatMap((g) => g.entries.map((e) => e.name.toLowerCase())));

/* How many designated heroes the homepage feed serves (api/hero-lineup
   and the designations action agree on it). Not a rotation window — the
   rack orders every hero explicitly — just a guard against unbounded
   designation lists; a hero past it is frozen but idle. */
const REEL_HERO_CEILING = 16;

/* A designated hero's tile art, from its frozen snapshot's recipe — the
   same quiet treatment as the built-in tiles (own label, no icon, glow
   zeroed, viewBox tightened). A snapshot that won't render returns null
   and the rack shows a labeled placeholder instead. */
function heroSnapshotArt(cfg: Record<string, unknown>): string | null {
  try {
    const pc = healStateIconPins(hydrate(structuredClone(cfg)) as GenConfig);
    pc.icon.show = false;
    for (const s of Object.values(pc.states)) s.glow = 0;
    return tightenSvg(renderBevel(pc, "default"), 20);
  } catch {
    return null;
  }
}

/** one tile on the rack — a built-in look, a designated hero, or the
    collapsed pair (hero snapshot wearing a built-in's name) */
type RackTile = { name: string; art: string | null; also?: string; heroId?: string };

export function AdminPage() {
  usePageScroll();
  const cloud = useCloudStatus();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [adoptBusy, setAdoptBusy] = useState(false);
  const [adoptNote, setAdoptNote] = useState<string | null>(null);

  // the pulse — four headline numbers and a 14-day signup strip
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const loadStats = async () => {
    setStatsErr(null);
    const { ok, data } = await callAdmin({ action: "stats" });
    if (!ok) { setStatsErr(String(data.error ?? "Couldn't load the pulse.")); return; }
    setStats((data.stats as Stats) ?? null);
  };

  // the census — every account, sorted/filtered server-side
  const [census, setCensus] = useState<{ users: (Row & { kits: number })[]; total: number; page: number } | null>(null);
  const [cSort, setCSort] = useState<"joined" | "email" | "plan" | "status">("joined");
  const [cDir, setCDir] = useState<"asc" | "desc">("desc");
  const [cPlan, setCPlan] = useState<"" | "pro" | "student" | "free">("");
  const [cBusy, setCBusy] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const loadCensus = async (page: number, sort = cSort, dir = cDir, plan = cPlan) => {
    setCBusy(true); setCErr(null);
    const { ok, data } = await callAdmin({ action: "roster", sort, dir, plan, page });
    setCBusy(false);
    if (!ok) { setCErr(String(data.error ?? "Couldn't load the census.")); return; }
    setCensus({ users: (data.users as (Row & { kits: number })[]) ?? [], total: Number(data.total ?? 0), page: Number(data.page ?? 0) });
  };

  /* homepage curation — the visual rack (roster + art recipe live at
     module scope, above). The thumbnails render once the desk opens;
     a gated mount draws nothing. */
  const [homeHidden, setHomeHidden] = useState<Set<string> | null>(null);
  const [homeNote, setHomeNote] = useState<string | null>(null);
  const [homeBusy, setHomeBusy] = useState(false);
  const toggleHomeKit = async (name: string) => {
    if (!homeHidden) return;
    const key = name.toLowerCase();
    const next = new Set(homeHidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHomeHidden(next);
    setHomeBusy(true);
    const err = await setHiddenLandingKits([...next]);
    setHomeBusy(false);
    setHomeNote(err ?? `Saved. The homepage picks this up within ~5 minutes (the feed is CDN-cached); your own next visit applies it too.`);
    if (err) setHomeHidden(homeHidden); // roll the optimistic flip back
  };
  /* display order — the FULL flattened list of lowercase names, group by
     group, written whole on every move so each surface's sort is fully
     determined. Same optimistic flip + rollback as the hide toggle.
     Arrows are the primary control; tile drag is an enhancement, and its
     payload lives in a REF — dragstart → dragover can outrun a re-render,
     and a state-only payload leaves dragover reading a stale null closure,
     so the drop never arms. State carries only the visuals. */
  const [homeOrder, setHomeOrder] = useState<string[] | null>(null);
  const homeDragRef = useRef<{ group: string; index: number } | null>(null);
  const [homeDrag, setHomeDrag] = useState<{ group: string; index: number } | null>(null);
  const [homeOver, setHomeOver] = useState<{ group: string; index: number } | null>(null);
  const persistHomeOrder = async (next: string[]) => {
    const prev = homeOrder;
    setHomeOrder(next);
    setHomeBusy(true);
    const err = await setLandingKitOrder(next);
    setHomeBusy(false);
    setHomeNote(err ?? `Saved. The homepage picks the new order up within ~5 minutes (the feed is CDN-cached); your own next visit applies it too.`);
    if (err) setHomeOrder(prev); // roll the optimistic move back
  };
  // the rack's art — drawn once when the desk opens, not on a gated mount
  const homeArt = useMemo(() => {
    if (!allowed) return null;
    const m = new Map<string, string | null>();
    for (const { entries } of HOME_ROSTER) for (const ex of entries) m.set(ex.name, homeExampleArt(ex));
    return m;
  }, [allowed]);

  // the release desk
  const [kq, setKq] = useState("");
  const [kBusy, setKBusy] = useState(false);
  const [kits, setKits] = useState<FoundKit[] | null>(null);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [sel, setSel] = useState<Picked | null>(null);
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [relName, setRelName] = useState("");
  const [relNote, setRelNote] = useState("");
  const [relDate, setRelDate] = useState("");
  // designation targets — combinable by owner call ("hero and public
  // should be checkboxes, so you can select one or both")
  const [relHero, setRelHero] = useState(false);
  const [relPublic, setRelPublic] = useState(true);
  const [relBusy, setRelBusy] = useState(false);
  const [deskNote, setDeskNote] = useState<string | null>(null);
  const [slate, setSlate] = useState<Desig[] | null>(null);
  const [slateNote, setSlateNote] = useState<string | null>(null);
  /* ── the unified rotation (owner call, 2026-08-16): the rack's Hero
     reel group IS the homepage rotation — built-ins and designated
     heroes as one ordered list, no separate classes. A hero sharing a
     built-in's name collapses onto that tile and its snapshot wins the
     art. The slate stays a passive report wearing the same words. */
  const heroRows = (slate ?? []).filter((d) => d.placement === "hero");
  const heroArt = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of (slate ?? [])) if (d.placement === "hero") m.set(d.id, d.cfg ? heroSnapshotArt(d.cfg) : null);
    return m;
  }, [slate]);
  // hero snapshots speak their own typefaces — warm them like KitPreview
  useEffect(() => {
    for (const d of (slate ?? [])) if (d.placement === "hero" && d.cfg) {
      try { ensureDocFonts(d.cfg); } catch { /* placeholder tiles report below */ }
    }
  }, [slate]);
  const rackGroups = useMemo((): { group: string; tiles: RackTile[] }[] => {
    const order = homeOrder ?? [];
    return HOME_ROSTER.map(({ group, entries }) => {
      if (group !== "Hero reel") {
        return { group, tiles: orderedEntries(entries, order).map((ex): RackTile => ({ name: ex.name, art: homeArt?.get(ex.name) ?? null, also: ex.also })) };
      }
      const heroByName = new Map(heroRows.map((d) => [d.presetName.toLowerCase(), d] as const));
      const unified = entries.map((ex): RackTile => {
        const d = heroByName.get(ex.name.toLowerCase());
        if (!d) return { name: ex.name, art: homeArt?.get(ex.name) ?? null, also: ex.also };
        heroByName.delete(ex.name.toLowerCase()); // one tile, not a clash
        return {
          name: ex.name, heroId: d.id, art: heroArt.get(d.id) ?? null,
          also: ["designated snapshot — replaces the built-in", ex.also].filter(Boolean).join(" · "),
        };
      });
      for (const d of heroRows) {
        if (heroByName.get(d.presetName.toLowerCase()) !== d) continue; // collapsed above, or a duplicate name
        heroByName.delete(d.presetName.toLowerCase());
        unified.push({ name: d.presetName, heroId: d.id, art: heroArt.get(d.id) ?? null, also: "designated hero — frozen on the slate" });
      }
      return { group, tiles: orderedEntries(unified, order) };
    });
  }, [homeOrder, homeArt, heroArt, slate]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveHomeKit = (group: string, shown: { name: string }[], from: number, to: number) => {
    if (homeBusy || from === to || to < 0 || to >= shown.length) return;
    const seq = [...shown];
    const [m] = seq.splice(from, 1);
    seq.splice(to, 0, m);
    const next = rackGroups.flatMap((g) => (g.group === group ? seq : g.tiles).map((t) => t.name.toLowerCase()));
    void persistHomeOrder(next);
  };
  /* the slate's report of a hero's seat — same data as the rack, so the
     two surfaces can never disagree. HIDDEN and the feed ceiling are the
     only ways a designated hero stays off the homepage now. */
  const heroReelStatus = (d: Desig): { chip: string; cls: string; word: string } => {
    const key = d.presetName.toLowerCase();
    if (homeHidden?.has(key)) return { chip: "HIDDEN", cls: "fd-review__chip--no", word: "hidden on the homepage — Restore it on the rack below" };
    if (heroRows.findIndex((x) => x.id === d.id) >= REEL_HERO_CEILING) return { chip: `PAST ${REEL_HERO_CEILING}`, cls: "fd-review__chip--wait", word: `beyond the feed ceiling (${REEL_HERO_CEILING} designated heroes) — delete older ones to let it ride` };
    const reel = (rackGroups.find((g) => g.group === "Hero reel")?.tiles ?? []).filter((t) => !homeHidden?.has(t.name.toLowerCase()));
    const seat = reel.findIndex((t) => t.name.toLowerCase() === key);
    const takeover = BUILTIN_REEL_NAMES.has(key) ? " — its snapshot takes over the built-in tile of the same name" : "";
    return {
      chip: seat === -1 ? "IN ROTATION" : `SEAT ${seat + 1} OF ${reel.length}`, cls: "fd-review__chip--ok",
      word: `in the homepage rotation at that seat${takeover} (~5 min CDN)`,
    };
  };

  // the render gate — an HONEST one: whatever blocks the desk says so in
  // place, with the way back. The old gate silently teleported to the
  // landing page, which read as broken navigation (owner, on preview:
  // "hitting the admin button now just takes me to the front door
  // homepage") — a fresh deploy starts signed out here, and the bounce
  // fired before the session restored. `allowed` still gates every fetch.
  const [gate, setGate] = useState<"checking" | "nocloud" | "signedout" | "denied">("checking");
  useEffect(() => {
    if (!cloudConfig()) { setGate("nocloud"); return; }
    if (cloud.state === "off" || cloud.state === "signedout") {
      // the desk CLOSES when the session ends — a cross-tab sign-out or a
      // failed token refresh mid-visit must not leave the census on screen
      // (review catch: `allowed` was never revoked)
      setAllowed(null);
      // boot passes through "signedout" before a session restores — give
      // it a beat before concluding, then say so instead of bouncing
      setGate("checking");
      const t = window.setTimeout(() => setGate("signedout"), 2500);
      return () => window.clearTimeout(t);
    }
    if (cloud.state !== "synced" && cloud.state !== "syncing" && cloud.state !== "error") { setGate("checking"); return; }
    let on = true;
    setGate("checking");
    void myProfileTier().then((p) => {
      if (!on) return;
      if (p.admin) setAllowed(true); else setGate("denied");
    });
    return () => { on = false; };
  }, [cloud.state]);

  // the census and the pulse load themselves once the desk opens
  useEffect(() => { if (allowed) { void loadCensus(0); void loadStats(); } }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!allowed) return;
    void listHiddenLandingKits().then((keys) => setHomeHidden(new Set(keys.map((s) => s.toLowerCase()))));
    void listLandingKitOrder().then((keys) => setHomeOrder(keys.map((s) => s.toLowerCase())));
    /* the rack renders OTHER looks' faces — authored presets carry real
       typefaces (Shrikhand, Fascinate) this document never loaded. Warm
       every family the roster speaks; the browser re-rasterizes the
       inline SVG text when each face lands (same move as KitPreview). */
    try {
      for (const { entries } of HOME_ROSTER) for (const ex of entries) {
        if (ex.authored && PRESET_DEFAULTS[ex.look]) ensureDocFonts(PRESET_DEFAULTS[ex.look]);
        else { const f = PRESETS.find((x) => x.id === ex.look)?.font; if (f) ensureFont(f); }
      }
    } catch { /* a face that won't load just falls back */ }
  }, [allowed]);

  // qOverride: the census hands an email straight in — state hasn't
  // flushed yet when a row click fires the search
  const search = async (qOverride?: string) => {
    if (busy) return;
    setBusy(true); setNote(null);
    const { ok, data } = await callAdmin({ action: "search", q: qOverride ?? q });
    setBusy(false);
    if (!ok) { setNote(String(data.error ?? "Search failed.")); return; }
    setRows((data.users as Row[]) ?? []);
  };

  const setPlan = async (r: Row, plan: (typeof PLANS)[number]) => {
    const verb = plan === "free" ? "revoke the paid plan from" : `comp ${plan.toUpperCase()} to`;
    if (!window.confirm(`Really ${verb} ${r.email ?? r.id}?\n\nGrants are stamped 'comped', revokes 'canceled' — distinguishable from Stripe purchases in the data.`)) return;
    setBusyId(r.id); setNote(null);
    const { ok, data } = await callAdmin({ action: "setPlan", userId: r.id, plan });
    setBusyId(null);
    if (!ok) { setNote(String(data.error ?? "Couldn't set the plan.")); return; }
    setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, ...(data.user as Row) } : x)));
    setNote(data.warning ? String(data.warning) : `Done — ${r.email ?? r.id} is now ${plan}.`);
  };

  const loadSlate = async () => {
    const { ok, data } = await callAdmin({ action: "designations" });
    if (!ok) { setSlateNote(String(data.error ?? "Couldn't load the slate.")); return; }
    setSlateNote(null);
    setSlate((data.designations as Desig[]) ?? []);
  };
  useEffect(() => { if (allowed === true) void loadSlate(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  const findKits = async () => {
    if (kBusy) return;
    setKBusy(true); setDeskNote(null); setSel(null); setDoc(null);
    const { ok, data } = await callAdmin({ action: "findKits", q: kq });
    setKBusy(false);
    if (!ok) { setDeskNote(String(data.error ?? "Search failed.")); return; }
    setKits((data.kits as FoundKit[]) ?? []);
    setStudios((data.studios as Studio[]) ?? []);
  };

  const pickKit = async (k: FoundKit) => {
    const picked: Picked = { kind: "project", projectId: k.projectId, name: k.kitName || k.name, email: k.email };
    setSel(picked); setDoc(null); setDeskNote(null);
    setRelName(k.kitName || k.name); setRelNote(""); setRelDate("");
    const { ok, data } = await callAdmin({ action: "kitDoc", projectId: k.projectId });
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't load that kit.")); setSel(null); return; }
    setDoc(data.doc as Record<string, unknown>);
  };

  const pickStudioPreset = async (s: Studio, p: { upId: string; name: string }) => {
    const picked: Picked = { kind: "studio", userId: s.userId, upId: p.upId, name: p.name, email: s.email };
    setSel(picked); setDoc(null); setDeskNote(null);
    setRelName(p.name); setRelNote(""); setRelDate("");
    const { ok, data } = await callAdmin({ action: "studioDoc", userId: s.userId, upId: p.upId });
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't load that preset.")); setSel(null); return; }
    setDoc(data.doc as Record<string, unknown>);
  };

  const designate = async (placement: "hero" | "standard" | "upcoming") => {
    if (!sel || relBusy) return;
    const desired = relName.trim() || sel.name;
    /* the same duplicate rule the projects panel enforces (owner mandate,
       2026-08-16): a designation colliding with one ALREADY ON THE SLATE
       — any placement, case-insensitive — takes the lowest free number,
       and the confirm says so before the freeze. Sharing a BUILT-IN
       look's name is untouched: that stays the deliberate takeover of
       the built-in's tile (6f9906c) — this only de-dupes designation
       against designation. */
    const name = uniqueName(desired, (slate ?? []).map((d) => d.presetName));
    const renamed = name === desired ? "" : `\n\nIt files as "${name}" — "${desired}" is already on the slate.`;
    const msg =
      (placement === "hero"
        ? `Freeze "${sel.name}" for the homepage carousel?\n\nThe kit is snapshotted exactly as it is today, with the deal note, and takes a seat in the homepage rotation — order it on the rack below (give the CDN ~5 minutes; up to ${REEL_HERO_CEILING} designated heroes ride). A name shared with a built-in look takes over that built-in's tile.`
        : placement === "standard"
          ? `Release "${name}" to everyone right now?\n\nIt appears in every player's Presets panel immediately, and the kit is snapshotted for the record.`
          : relDate
            ? `Hold "${name}" until ${relDate}?\n\nInvisible to players until that day, then it releases itself. Snapshot and deal note are stored now.`
            : `Park "${name}" as upcoming, no date yet?\n\nInvisible to players until you schedule it. Snapshot and deal note are stored now.`) + renamed;
    if (!window.confirm(msg)) return;
    setRelBusy(true); setDeskNote(null);
    /* the desk draws the card art itself: the publish lands server-side, and
       a server can't run the SVG engine, so a shipped preset used to arrive
       with no thumbnail at all (owner: "the thumbnail isn't appearing").
       Same recipe the editor's own Publish uses — label PLAY, no icon, no
       state glow — so shipped and self-published packs look alike. */
    let thumb: string | null = null;
    try {
      const raw = (doc as { cfg?: Record<string, unknown> } | null)?.cfg;
      if (raw) {
        const tc = hydrate(JSON.parse(JSON.stringify(raw)) as Record<string, unknown>);
        for (const st of Object.values(tc.states)) st.glow = 0;
        tc.content.label = "PLAY"; tc.icon.show = false;
        thumb = renderBevel(tc, "default");
      }
    } catch { /* no thumb rather than a failed release — the tray self-heals from cfg anyway */ }
    const { ok, data } = await callAdmin({
      action: "designate", placement, thumb,
      ...(sel.kind === "project" ? { projectId: sel.projectId } : { studio: { userId: sel.userId, upId: sel.upId } }),
      presetName: name, dealNote: relNote, publishAt: placement === "upcoming" && relDate ? relDate : null,
    });
    setRelBusy(false);
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't designate that kit.")); return; }
    setDeskNote(renamed
      ? `Frozen and filed — "${name}" is on the slate ("${desired}" was already designated, so it took the next free number).`
      : `Frozen and filed — "${name}" is on the slate.`);
    setSel(null); setDoc(null); setKits(null); setStudios([]); setKq("");
    void loadSlate();
  };

  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const refreeze = async (d: Desig) => {
    if (refreshingId) return;
    if (!window.confirm(
      `Re-freeze "${d.presetName}" from the maker's current version?\n\n` +
      `The frozen snapshot is replaced with how the kit looks right now, and the ` +
      `${d.placement === "hero" ? "homepage hero updates to match (give the CDN ~5 minutes)" : "shipped preset updates to match"}. ` +
      `Nothing the maker does reaches players without this click — this IS the approval.`,
    )) return;
    setRefreshingId(d.id); setSlateNote(null);
    const { ok, data } = await callAdmin({ action: "refreeze", designationId: d.id });
    setRefreshingId(null);
    if (!ok) { setSlateNote(String(data.error ?? "Couldn't refresh it.")); return; }
    setSlateNote(`Re-frozen — "${String(data.name)}" now shows the maker's current version.`);
    void loadSlate();
  };

  /* delete a slate row — optimistic like the rack's toggles: the row
     leaves the list on click and comes back only if the server refuses,
     so a tidy-up sweep feels immediate instead of one reload per row. */
  const [removingId, setRemovingId] = useState<string | null>(null);
  const unDesignate = async (d: Desig) => {
    if (removingId) return;
    const shipped = d.placement !== "hero";
    if (!window.confirm(
      `Delete "${d.presetName}" from the slate?\n\n` +
      (shipped ? "Its preset entry is retired too — players lose access to it. " :
        "It leaves the homepage rotation too (give the CDN ~5 minutes). ") +
      "The frozen snapshot is deleted with it.",
    )) return;
    const prev = slate;
    setRemovingId(d.id); setSlateNote(null);
    setSlate((s) => (s ?? []).filter((x) => x.id !== d.id)); // optimistic — the row leaves now
    const { ok, data } = await callAdmin({ action: "undesignate", designationId: d.id });
    setRemovingId(null);
    if (!ok) { setSlate(prev); setSlateNote(String(data.error ?? "Couldn't delete it — the row is back.")); return; }
    setSlateNote(`Deleted — "${d.presetName}" is off the slate${shipped ? " and off the shelf" : ""}.`);
    void loadSlate(); // reconcile with the server's truth
  };

  // preview first (dry run), confirm with real numbers, then move
  const adopt = async () => {
    if (adoptBusy) return;
    setAdoptBusy(true); setAdoptNote(null);
    const pv = await callAdmin({ action: "adopt", fromEmail, toEmail, dryRun: true });
    if (!pv.ok) { setAdoptBusy(false); setAdoptNote(String(pv.data.error ?? "Couldn't preview that move.")); return; }
    const p = pv.data.preview as { fromEmail: string; toEmail: string; kits: number };
    if (p.kits === 0) { setAdoptBusy(false); setAdoptNote(`${p.fromEmail} has no kits to move.`); return; }
    const go = window.confirm(
      `Move ${p.kits} kit${p.kits === 1 ? "" : "s"} from ${p.fromEmail} to ${p.toEmail}?\n\n` +
      `Likes, share links and gallery listings ride along — the cards just change their byline. ` +
      `There is no batch undo (moving them back is another adopt).`,
    );
    if (!go) { setAdoptBusy(false); return; }
    const { ok, data } = await callAdmin({ action: "adopt", fromEmail, toEmail });
    setAdoptBusy(false);
    if (!ok) { setAdoptNote(String(data.error ?? "Couldn't move the kits.")); return; }
    setAdoptNote(`Done — ${String(data.moved)} kit${data.moved === 1 ? "" : "s"} now belong to ${String(data.toEmail)}.`);
    setFromEmail("");
  };

  if (allowed === null) {
    return (
      <div className="fd-page">
        <main className="fd-page__wrap">
          {gate === "signedout" ? (
            <div className="fd-card">
              <div className="fd-card__title">The desk needs you signed in</div>
              <p className="fd-lead">This browser has no session here yet. Preview and live are separate sign-ins — a fresh preview build always starts signed out, even when the live site remembers you.</p>
              <button className="fd-ghost" onClick={() => navigate("#/account")}>Go sign in</button>
              <button className="fd-ghost" onClick={() => navigate("#/")}>Back to the site</button>
            </div>
          ) : gate === "denied" ? (
            <div className="fd-card">
              <div className="fd-card__title">This account isn't on the admin list</div>
              <p className="fd-lead">You're signed in, but this profile doesn't carry the admin flag — or the check itself failed mid-flight. If this is the admin account, try once more.</p>
              <button className="fd-ghost" onClick={() => {
                // a session that ended since the card rendered means SIGN IN,
                // not "still not an admin" (review catch)
                if (cloud.state !== "synced" && cloud.state !== "syncing" && cloud.state !== "error") { setGate("signedout"); return; }
                setGate("checking");
                void myProfileTier().then((p) => { if (p.admin) setAllowed(true); else setGate("denied"); });
              }}>Check again</button>
              <button className="fd-ghost" onClick={() => navigate("#/")}>Back to the site</button>
            </div>
          ) : gate === "nocloud" ? (
            <div className="fd-card">
              <p className="fd-lead">This build has no cloud configured — the desk lives on the deployed site.</p>
              <button className="fd-ghost" onClick={() => navigate("#/")}>Back to the site</button>
            </div>
          ) : (
            <p className="fd-lead"><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Checking credentials…</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="fd-page">
      <header className="fd-page__bar">
        <a href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }} className="fd-page__brand">
          <img src={logoUrl} alt="" width={24} height={24} /> UI Kit Maker
        </a>
        {/* same door the Account page offers — the desk must never be a
            dead end (owner: "should be able to get back to the generator") */}
        <button className="fd-primary fd-page__open" onClick={() => navigate("#/app")}>
          <Wand2 size={15} strokeWidth={1.9} /> Open the generator
        </button>
      </header>

      <main className="fd-page__wrap">
        <h1 className="fd-page__h1"><ShieldCheck size={26} strokeWidth={2} /> Admin — plans</h1>

        {/* the pulse — what happened after people arrived. Traffic itself
            (visitors, referrers) lives in Vercel Web Analytics; this is
            the half that needs an account to be counted. */}
        <section className="fd-card">
          <h2 className="fd-card__title"><Activity size={17} strokeWidth={2.1} /> The pulse</h2>
          {statsErr && <p className="fd-note">{statsErr}</p>}
          {!stats && !statsErr && <p className="fd-fine"><Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> Counting…</p>}
          {stats && (
            <>
              <div className="fd-pulse">
                {([
                  ["Signups", stats.signups, stats.signups7, "in the last 7 days"],
                  ["Paying", stats.paying, null, "pro + student"],
                  ["Kits saved", stats.kits, stats.kits7, "in the last 7 days"],
                  ["Exports", stats.exports, stats.exports7, "in the last 7 days"],
                ] as [string, number | null, number | null, string][]).map(([label, total, recent, sub]) => (
                  <div className="fd-pulse__tile" key={label}>
                    <b>{total === null ? "—" : total.toLocaleString()}</b>
                    <span className="fd-pulse__label">{label}</span>
                    <span className="fd-pulse__sub">
                      {recent === null ? sub : `+${recent.toLocaleString()} ${sub}`}
                    </span>
                  </div>
                ))}
              </div>
              {stats.daily.length > 0 && (
                <div className="fd-pulse__strip" aria-label="Signups per day, last 14 days">
                  {stats.daily.map((d) => {
                    const peak = Math.max(1, ...stats.daily.map((x) => x.n));
                    return (
                      <i key={d.day} title={`${d.day}: ${d.n} signup${d.n === 1 ? "" : "s"}`}
                        style={{ ["--h" as string]: `${Math.round((d.n / peak) * 100)}%` }}
                        className={d.n ? "" : "is-zero"} />
                    );
                  })}
                </div>
              )}
              <p className="fd-fine">
                Signups per day, last 14 days. Visitors, referrers and where they came from
                live in Vercel Web Analytics — this desk only counts people with accounts.
              </p>
            </>
          )}
        </section>

        <section className="fd-card">
          <p className="fd-fine">
            Search an account by email, then set its plan. Every change is audit-logged
            with who did it, to whom, and old→new. Grants ride out Stripe events; a comped
            user who later genuinely subscribes flips to a normal paid plan.
          </p>
          <div className="fd-adminsearch">
            <input
              value={q}
              placeholder="email or part of one — e.g. stephanie@"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            />
            <button className="fd-primary" disabled={busy || q.trim().length < 2} onClick={() => void search()}>
              {busy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Search size={15} strokeWidth={2.1} />} Search
            </button>
          </div>
          {note && <p className="fd-note">{note}</p>}

          {rows !== null && (
            rows.length === 0 ? (
              <p className="fd-fine">No accounts match that.</p>
            ) : (
              <div className="fd-adminrows">
                {rows.map((r) => (
                  <div key={r.id} className="fd-adminrow">
                    <div className="fd-adminrow__who">
                      <b>{r.email ?? "(no email on file)"}</b>
                      <span className="fd-adminrow__meta">
                        {r.plan}{r.status ? ` · ${r.status}` : ""}
                        {r.renewsAt ? ` · renews ${fmtDay(r.renewsAt)}` : ""}
                        {r.hasStripe && <> · <CreditCard size={11} strokeWidth={2.4} /> Stripe</>}
                        {r.isAdmin ? " · ADMIN" : ""}
                        {` · joined ${fmtDay(r.createdAt)}`}
                      </span>
                    </div>
                    <div className="fd-adminrow__acts">
                      {PLANS.map((p) => (
                        <button key={p}
                          className={`fd-ghost fd-adminrow__plan${r.plan === p ? " on" : ""}`}
                          disabled={busyId === r.id || r.plan === p}
                          onClick={() => void setPlan(r, p)}>
                          {busyId === r.id ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><Users size={17} strokeWidth={2.1} /> The census</h2>
          <p className="fd-fine">
            Every account{census ? ` — ${census.total} in all` : ""}. Click a column to sort,
            a plan chip to filter, a row to load that account into the plans card above.
          </p>
          <div className="fd-censusbar">
            {(["", "pro", "student", "free"] as const).map((pl) => (
              <button key={pl || "all"} className={`fd-ghost${cPlan === pl ? " on" : ""}`} disabled={cBusy}
                onClick={() => { setCPlan(pl); void loadCensus(0, cSort, cDir, pl); }}>
                {pl === "" ? "All" : pl[0].toUpperCase() + pl.slice(1)}
              </button>
            ))}
            <button className="fd-ghost" disabled={cBusy} title="Refresh"
              onClick={() => void loadCensus(census?.page ?? 0)}>
              {cBusy ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : <RefreshCw size={13} strokeWidth={2.2} />}
            </button>
          </div>
          {cErr && <p className="fd-note">{cErr}</p>}
          {census && (
            <>
              <table className="fd-census">
                <thead>
                  <tr>
                    {([["email", "Email"], ["plan", "Plan"], ["status", "Status"], ["joined", "Joined"]] as const).map(([k, label]) => (
                      <th key={k}>
                        <button onClick={() => {
                          const d = cSort === k && cDir === "desc" ? "asc" : "desc";
                          setCSort(k); setCDir(d); void loadCensus(0, k, d, cPlan);
                        }}>{label}{cSort === k ? (cDir === "desc" ? " ↓" : " ↑") : ""}</button>
                      </th>
                    ))}
                    <th>Kits</th>
                  </tr>
                </thead>
                <tbody>
                  {census.users.map((r) => (
                    <tr key={r.id} tabIndex={0} title={r.email ? `Load ${r.email} in the plans card` : undefined}
                      onClick={() => { if (r.email) { setQ(r.email); void search(r.email); window.scrollTo({ top: 0, behavior: "smooth" }); } }}
                      onKeyDown={(e) => { if (e.key === "Enter" && r.email) { setQ(r.email); void search(r.email); window.scrollTo({ top: 0, behavior: "smooth" }); } }}>
                      <td>{r.email ?? "(no email on file)"}{r.isAdmin ? <em> · admin</em> : ""}</td>
                      <td>{r.plan}{r.status === "comped" ? "" : r.hasSubscription ? <em> · stripe</em> : ""}</td>
                      <td>{r.status ?? "—"}</td>
                      <td>{fmtDay(r.createdAt)}</td>
                      <td>{r.kits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {census.total > census.users.length && (
                <div className="fd-censusbar">
                  <button className="fd-ghost" disabled={cBusy || census.page === 0} onClick={() => void loadCensus(census.page - 1)}>← Prev</button>
                  <span className="fd-fine">Page {census.page + 1} of {Math.max(1, Math.ceil(census.total / 100))}</span>
                  <button className="fd-ghost" disabled={cBusy || (census.page + 1) * 100 >= census.total} onClick={() => void loadCensus(census.page + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><Rocket size={17} strokeWidth={2.1} /> Release desk</h2>
          <p className="fd-fine">
            Find a kit by <b>either of its names</b> (the save name or the kit-page title) — and if
            nothing's saved, the desk checks live studios too, including <b>personal presets</b> makers
            saved for themselves. Designating <b>freezes a full snapshot as it is right now</b> — the
            maker can change or lose their copy later and your frozen version survives, deal note
            attached. Tick <b>Hero carousel</b>, <b>Public release</b>, or both — one Designate covers
            them. A public release with a <b>date</b> stays invisible to everyone but you until that
            day; with the date blank it lands in every player's Presets panel immediately. Hero puts
            it <b>in the homepage rotation</b> at a seat you order on the rack below — built-ins and
            designated heroes are one list there, played exactly in that order (~5 min CDN; up to{" "}
            {REEL_HERO_CEILING} designated heroes ride). A hero sharing a built-in's name takes over
            that built-in's tile. Each hero row below reports its seat; hidden names sit out.
          </p>
          <div className="fd-adminsearch">
            <input
              value={kq}
              placeholder='kit name or part of one — e.g. "Casino"'
              onChange={(e) => setKq(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void findKits(); }}
            />
            <button className="fd-primary" disabled={kBusy || kq.trim().length < 2} onClick={() => void findKits()}>
              {kBusy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Search size={15} strokeWidth={2.1} />} Find
            </button>
          </div>

          {kits !== null && kits.length === 0 && studios.length === 0 && (
            <p className="fd-fine">No kit answers to that name — saved kits and live studios both came up empty.</p>
          )}
          {kits !== null && kits.length > 0 && (
            <div className="fd-adminrows">
              {kits.map((k) => (
                <button key={k.projectId}
                  className={`fd-adminrow fd-kitrow${sel?.kind === "project" && sel.projectId === k.projectId ? " on" : ""}`}
                  onClick={() => void pickKit(k)}>
                  <span className="fd-adminrow__who">
                    <b>{k.kitName || k.name}</b>
                    <span className="fd-adminrow__meta">
                      {k.kitName && k.kitName !== k.name ? `saved as "${k.name}" · ` : ""}
                      {k.email ?? "unknown maker"} · saved {fmtDay(k.updatedAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {studios.length > 0 && (
            <>
              <p className="fd-fine">Nothing saved under that name — but it's alive in a studio:</p>
              <div className="fd-adminrows">
                {studios.map((s) => (
                  <div key={s.userId} style={{ display: "contents" }}>
                    {s.presets.map((p) => (
                      <button key={p.upId}
                        className={`fd-adminrow fd-kitrow${sel?.kind === "studio" && sel.upId === p.upId ? " on" : ""}`}
                        onClick={() => void pickStudioPreset(s, p)}>
                        <span className="fd-adminrow__who">
                          <b>{p.name}</b>
                          <span className="fd-adminrow__meta">
                            personal preset in {s.email ?? "unknown maker"}'s studio · designatable right here
                          </span>
                        </span>
                      </button>
                    ))}
                    {s.presets.length === 0 && (
                      <div className="fd-adminrow">
                        <span className="fd-adminrow__who">
                          <b>"{s.kitName}"</b>
                          <span className="fd-adminrow__meta">
                            open unsaved in {s.email ?? "unknown maker"}'s studio — ask them to hit
                            Save kit in the editor's top bar, then find it here
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {sel && (
            doc === null ? (
              <p className="fd-fine"><Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> Loading "{sel.name}"…</p>
            ) : (
              <div className="fd-desk">
                <KitPreview doc={doc} />
                <div className="fd-desk__form">
                  <input value={relName} maxLength={80} placeholder="release name — what players will see"
                    onChange={(e) => setRelName(e.target.value)} />
                  <input value={relNote} maxLength={2000} placeholder="deal note — e.g. 50/50 with maker, agreed today"
                    onChange={(e) => setRelNote(e.target.value)} />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={relHero} onChange={(e) => setRelHero(e.target.checked)} />
                    <Star size={14} strokeWidth={2.1} /> Hero carousel
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={relPublic} onChange={(e) => setRelPublic(e.target.checked)} />
                    <Rocket size={14} strokeWidth={2.1} /> Public release
                  </label>
                  {relPublic && (
                    <label className="fd-desk__date">
                      <CalendarClock size={14} strokeWidth={2.1} /> release date — blank goes live now
                      <input type="date" value={relDate} onChange={(e) => setRelDate(e.target.value)}
                        onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* needs a user gesture; the field still types */ } }} />
                    </label>
                  )}
                  <div className="fd-desk__acts">
                    <button className="fd-primary fd-desk__go" disabled={relBusy || (!relHero && !relPublic)}
                      onClick={() => void (async () => {
                        if (relHero) await designate("hero");
                        if (relPublic) await designate(relDate ? "upcoming" : "standard");
                      })()}>
                      {relBusy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Rocket size={15} strokeWidth={2.1} />} Designate
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
          {deskNote && <p className="fd-note">{deskNote}</p>}

          <div className="cg-secline">On the slate</div>
          {slateNote && <p className="fd-fine">{slateNote}</p>}
          {slate !== null && slate.length === 0 && !slateNote && (
            <p className="fd-fine">Nothing designated yet — your first frozen kit lands here.</p>
          )}
          {slate !== null && slate.length > 0 && (
            <div className="fd-adminrows">
              {slate.map((d) => {
                const hero = d.placement === "hero" ? heroReelStatus(d) : null;
                return (
                  <div key={d.id} className="fd-adminrow">
                    <div className="fd-adminrow__who">
                      <b>{d.presetName}{d.presetName !== d.kitName ? <span className="fd-adminrow__meta"> (kit "{d.kitName}")</span> : null}</b>
                      <span className="fd-adminrow__meta">
                        <span className={`fd-review__chip ${d.placement === "standard" ? "fd-review__chip--ok" : "fd-review__chip--wait"}`}>{d.placement.toUpperCase()}</span>
                        {hero && <span className={`fd-review__chip ${hero.cls}`}>{hero.chip}</span>}
                        {" "}{hero ? hero.word : releaseWord(d)} · {d.sourceEmail ?? "unknown maker"} · frozen {fmtDay(d.createdAt)}
                        {d.dealNote ? <> · {d.dealNote}</> : null}
                      </span>
                    </div>
                    <div className="fd-adminrow__acts">
                      <button className="fd-ghost fd-adminrow__plan" disabled={refreshingId === d.id || removingId === d.id}
                        title="Re-freeze from the maker's current version — your approval click"
                        onClick={() => void refreeze(d)}>
                        {refreshingId === d.id
                          ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" />
                          : <RefreshCw size={13} strokeWidth={2.1} />} Refresh
                      </button>
                      <button className="fd-ghost fd-adminrow__plan" disabled={removingId === d.id || refreshingId === d.id}
                        title={`Delete this designation${d.placement === "hero" ? " — it leaves the homepage rotation" : " — players lose the preset"}`}
                        onClick={() => void unDesignate(d)}>
                        {removingId === d.id
                          ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" />
                          : <Trash2 size={13} strokeWidth={2.1} />} Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><House size={17} strokeWidth={2.1} /> Homepage kits</h2>
          <p className="fd-fine">
            The <b>Hero reel group is the homepage rotation</b> — built-ins and designated heroes
            together, one list, and the homepage plays it in exactly this order (built-ins ship
            hardcoded; up to {REEL_HERO_CEILING} designated heroes ride, the feed's ceiling). A
            designated hero sharing a built-in's name <b>takes over that tile</b> — its frozen
            snapshot wins the art. <b>Hide removes a look from the homepage</b> for every visitor,
            no deploy; the tile stays here so you can restore it any time (a hidden designated
            hero stays on the slate too). The <b>arrows change the order</b> within a group (tiles
            drag too). Everything rides the hero-designations feed, CDN-cached ~5 minutes. The
            four looks on both the reel and the chip row keep one tile — their reel position
            drives the chip row too.
          </p>
          {homeHidden === null ? (
            <p className="fd-note"><Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> Reading the current lineup…</p>
          ) : (
            rackGroups.map(({ group, tiles }) => (
              <div key={group} className="fd-homegroup">
                <div className="fd-homegroup__name">{group}</div>
                <div className="fd-homerack">
                  {tiles.map((t, i) => {
                    const off = homeHidden.has(t.name.toLowerCase());
                    const dragging = homeDrag?.group === group && homeDrag.index === i;
                    const dropover = !dragging && homeOver?.group === group && homeOver.index === i;
                    return (
                      <div key={t.heroId ?? t.name}
                        className={`fd-hometile${off ? " off" : ""}${dragging ? " dragging" : ""}${dropover ? " dropover" : ""}`}
                        draggable
                        title="Drag to reorder within the group"
                        onDragStart={(e) => {
                          homeDragRef.current = { group, index: i };
                          setHomeDrag({ group, index: i });
                          e.dataTransfer.effectAllowed = "move";
                          try { e.dataTransfer.setData("text/plain", t.name); } catch { /* older engines */ }
                        }}
                        onDragEnd={() => { homeDragRef.current = null; setHomeDrag(null); setHomeOver(null); }}
                        onDragOver={(e) => {
                          const d = homeDragRef.current;
                          if (!d || d.group !== group) return; // groups don't mix
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (homeOver?.group !== group || homeOver.index !== i) setHomeOver({ group, index: i });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const d = homeDragRef.current;
                          if (d && d.group === group && d.index !== i) moveHomeKit(group, tiles, d.index, i);
                          homeDragRef.current = null; setHomeDrag(null); setHomeOver(null);
                        }}>
                        {t.art ? (
                          <div className="fd-hometile__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.art }} />
                        ) : (
                          <div className="fd-hometile__art fd-hometile__art--empty">
                            {t.heroId
                              ? "no preview — the frozen snapshot didn't render; try Refresh on the slate"
                              : "no preview — this look lives only in the front-door bundle"}
                          </div>
                        )}
                        <div className="fd-hometile__name">
                          <b>{t.name}</b>
                          {t.also && <span>{t.also}</span>}
                        </div>
                        <div className="fd-hometile__row">
                          <span className={`fd-review__chip ${off ? "fd-review__chip--no" : "fd-review__chip--ok"}`}>{off ? "HIDDEN" : "LIVE"}</span>
                          <div className="fd-hometile__acts">
                            <button className="fd-ghost fd-hometile__nudge" disabled={homeBusy || i === 0}
                              title={`Show ${t.name} earlier`} aria-label={`Show ${t.name} earlier in ${group}`}
                              onClick={() => moveHomeKit(group, tiles, i, i - 1)}>
                              <ChevronLeft size={14} strokeWidth={2.2} />
                            </button>
                            <button className="fd-ghost fd-hometile__nudge" disabled={homeBusy || i === tiles.length - 1}
                              title={`Show ${t.name} later`} aria-label={`Show ${t.name} later in ${group}`}
                              onClick={() => moveHomeKit(group, tiles, i, i + 1)}>
                              <ChevronRight size={14} strokeWidth={2.2} />
                            </button>
                            <button className="fd-ghost fd-hometile__act" disabled={homeBusy}
                              title={off ? `Put ${t.name} back on the homepage` : `Remove ${t.name} from the homepage for every visitor${t.heroId ? " (the slate keeps it)" : ""}`}
                              onClick={() => void toggleHomeKit(t.name)}>
                              {off ? <><Eye size={13} strokeWidth={2.2} /> Restore</> : <><EyeOff size={13} strokeWidth={2.2} /> Hide</>}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {homeNote && <p className="fd-note">{homeNote}</p>}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><FolderInput size={17} strokeWidth={2.1} /> Adopt kits</h2>
          <p className="fd-fine">
            Move <b>every kit</b> from one account to another — likes, share links and gallery
            listings ride along, only the byline changes. Made for retiring an account (the house
            account, one day) without losing its work. The emptied account is left in place; if
            it's truly done, delete it by hand in Supabase → Authentication afterwards.
          </p>
          <div className="fd-adminsearch">
            <input
              value={fromEmail}
              placeholder="from — the account giving up its kits"
              onChange={(e) => setFromEmail(e.target.value)}
            />
            <input
              value={toEmail}
              placeholder="to — the account receiving them"
              onChange={(e) => setToEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void adopt(); }}
            />
            <button className="fd-primary"
              disabled={adoptBusy || !fromEmail.includes("@") || !toEmail.includes("@")}
              onClick={() => void adopt()}>
              {adoptBusy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <FolderInput size={15} strokeWidth={2.1} />} Move
            </button>
          </div>
          {adoptNote && <p className="fd-note">{adoptNote}</p>}
        </section>
      </main>
    </div>
  );
}
