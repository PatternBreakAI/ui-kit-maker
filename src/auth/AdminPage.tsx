import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, ShieldCheck, CreditCard, FolderInput, Rocket, Star, CalendarClock, Trash2, RefreshCw, Users, Activity, Wand2, House, Eye, EyeOff, ChevronLeft, ChevronRight, Megaphone, Plus, SquarePen, GraduationCap, Gamepad2 } from "lucide-react";
import "@/styles/pricing.css";
import { cloudConfig, myProfileTier, accessToken, listHiddenLandingKits, setHiddenLandingKits, listLandingKitOrder, setLandingKitOrder, uniqueName, listPromos, savePromos, readPromosLive, setPromosLive, promoIsLive, type PromoDef, type PromoKind } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import { hydrate, healStateIconPins, PRESET_DEFAULTS, retintText, useGen } from "@/generator/store";
import { PromoCardView } from "@/ui/PromoShelf";
import { applyKitDesign, applyKitTextFill, applyPresetCandy, clampWeight, defaultCandy, defaultConfig, effKitSize, fontByName, migrateKitDesigns, PRESETS, resolveKitIcon, type GenConfig, type KitComponentId, type KitDesign, type KitSize, type Shape } from "@/generator/model";
import { renderBevel, renderKit } from "@/generator/bevel";
import { makeZip, readStoredZip } from "@/generator/exportUtils";
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

/* ── the licence the blessing stamps into the stocked kit ──
   Replaces the personal licence the export pipeline wrote for the
   owner's account. The stocked artifact doubles as the FREE Unity Asset
   Store package, so this is the store/free-kit licence — the body
   sentences are the owner's approved wording VERBATIM (2026-08-25);
   only the header and footer are house dressing. "Brightside" is
   hardcoded by that approved wording (the shelf kit IS Brightside) —
   a different kit on the shelf needs newly blessed words. */
const FREE_KIT_LICENCE = `UI Kit Maker — free kit licence
===============================

Brightside is a free kit from UI Kit Maker (uikitmaker.com),
distributed on the Unity Asset Store under the Asset Store EULA.
Use it in anything you ship, commercial projects included. Don't
resell or redistribute the assets themselves as a pack or template.
Anything you add from your own uploads remains entirely yours.

uikitmaker.com
`;

/* the stocked README's opening words — free-kit framing that matches the
   licence above (ship anything), never the old "evaluation … before
   paying" contradiction */
const FREE_KIT_README_BANNER = `> **Brightside — a free kit from UI Kit Maker.** Everything in this
> folder is yours to ship, commercial projects included (see
> LICENCE.txt). Designed at uikitmaker.com — remix it there: restyle
> every piece, retype every word, re-export, and the new download heals
> this folder in place.

`;

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

/* ── the hero-slider rack ────────────────────────────────────────────
   The admin mirror of the HOMEPAGE HERO SLIDER, and nothing else (owner
   call, 2026-08-16: "the only purpose is the display order of the hero,
   so let's not overcomplicate it"). The old three-section rack (reel /
   style chips / community cards, LIVE/HIDDEN chips) is gone — one flat
   list now, built by the SAME rules the landing applies, so the rack's
   card order IS the homepage's paint order.

   Match keys are lowercase DISPLAY NAMES: the landing checks names on
   every surface. KEEP THE NAME SET IN SYNC with HERO_REEL in
   src/marketing/landingInit.ts. `look` records how the landing builds
   that example, so the rack can draw a real thumbnail: authored looks
   load their full design (PRESET_DEFAULTS — the same JSONs the
   landing's AUTHORED table carries); the rest apply the starter recipe,
   exactly like the app's own preset tray. The style-chip row follows
   this same order feed on its own — chips need no rack of their own. */
type HomeExample = {
  name: string;       // display name — THE feed match key
  look: string;       // starter id the landing resolves the look through
  authored?: boolean; // full authored design (PRESET_DEFAULTS) vs plain recipe
  label?: string;     // label the homepage shows on it (authored looks wear their own words)
};
const REEL_BUILTINS: HomeExample[] = [
  { name: "Grape Jelly", look: "grape-jelly", authored: true },
  { name: "Hard Candy", look: "hard-candy", label: "PLAY" },
  { name: "Schweetheart", look: "schweetheart", authored: true },
  { name: "Neon Versus", look: "neon-versus", authored: true },
  { name: "Oopsie", look: "oopsie", authored: true },
  { name: "Citrus Pop", look: "citrus-pop", authored: true },
  { name: "Bubble Pop", look: "bubble-pop", authored: true },
  { name: "Nope Yep", look: "nope-yep", authored: true },
  { name: "Wager", look: "wager", authored: true },
];

/* names the RETIRED sections (style chips, community cards) could hide
   in their day — the Release Desk's re-add row still answers for them,
   so a legacy hide is never orphaned in the feed with no door back */
const OTHER_BUILTIN_NAMES = ["Deep Ocean", "Forest Sprite", "Hero Chisel", "Glacier Tech", "Grape Arcade", "Abyss Console", "Forge Standard"];

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

/* The built-in reel names. A designated hero wearing one of these names
   TAKES OVER that card: the owner's frozen snapshot wins the seat and
   the art (designating a look by a built-in's name is a deliberate
   replacement, not a clash — the landing applies the same rule). */
const BUILTIN_REEL_NAMES = new Set(REEL_BUILTINS.map((e) => e.name.toLowerCase()));

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

/** one card on the rack — a built-in look, a designated hero, or the
    takeover pair (hero snapshot wearing a built-in's name) */
type RackTile = { name: string; look?: string; art: string | null; heroId?: string; takeover?: boolean };

/* ── Spotlight desk plumbing ─────────────────────────────────────────
   Cards live as ONE ordered array in app_settings (order = shelf
   priority); the desk edits a working copy optimistically and writes
   the whole array back, exactly like the homepage order rack. */

/** id slug from a title, unique against the current lineup — the id is
    the DISMISSAL key, so edits must never re-mint it */
function spotSlug(title: string, taken: PromoDef[]): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "promo";
  if (!taken.some((p) => p.id === base)) return base;
  for (let n = 2; ; n++) if (!taken.some((p) => p.id === `${base}-${n}`)) return `${base}-${n}`;
}

/** what the desk's form edits — dates as YYYY-MM-DD for the inputs */
type SpotDraft = {
  id: string; kind: PromoKind; kicker: string; title: string; body: string;
  ctaRoute: string; ctaLabel: string; publishAt: string; newUntil: string;
  active: boolean; artRef: string; cfg: Record<string, unknown> | null;
};
const EMPTY_DRAFT: SpotDraft = { id: "", kind: "kit", kicker: "", title: "", body: "", ctaRoute: "#/releases", ctaLabel: "", publishAt: "", newUntil: "", active: true, artRef: "", cfg: null };

const draftToPromo = (d: SpotDraft, lineup: PromoDef[]): PromoDef => ({
  id: d.id || spotSlug(d.title || "promo", lineup),
  kind: d.kind, title: d.title.trim() || "Untitled",
  kicker: d.kicker.trim() || undefined,
  body: d.body.trim() || undefined,
  ctaRoute: d.ctaRoute.trim() || "#/releases",
  ctaLabel: d.ctaLabel.trim() || undefined,
  cfg: d.cfg, artRef: d.artRef.trim() || null,
  publishAt: d.publishAt || null, newUntil: d.newUntil || null,
  active: d.active,
});
const promoToDraft = (p: PromoDef): SpotDraft => ({
  id: p.id, kind: p.kind, kicker: p.kicker ?? "", title: p.title, body: p.body ?? "",
  ctaRoute: p.ctaRoute, ctaLabel: p.ctaLabel ?? "", publishAt: (p.publishAt ?? "").slice(0, 10),
  newUntil: (p.newUntil ?? "").slice(0, 10), active: p.active !== false,
  artRef: p.artRef ?? "", cfg: p.cfg ?? null,
});

/* every internal door Spotlight knows how to open — offered as a
   datalist so the route field autocompletes to real destinations */
const SPOT_ROUTES = ["#/releases", "#/how", "#/faq", "#/community", "#/pricing", "#/unity", "#/app", "editor:shape", "editor:typography", "editor:surface", "editor:state"];

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

  /* ── the Unity test kit shelf (Gate Round, 2026-08-17) — status +
     swap. The blessed free-kit zip lives at test-kit/unity-test-kit.zip;
     the swap is clear-then-sign, so the file chosen here goes straight
     browser→storage against a one-time token and is live for every
     registered account the moment the PUT lands. No code, no redeploy.

     THE LICENCE REWRITE (owner call): the zip the owner uploads is their
     OWN export off the live site — the entitlement machinery stamped a
     personal licence into it (Licensed to / Account / Reference). The
     canned kit gets redistributed (every registered user + the Asset
     Store), so a personal stamp must never ride along. Blessing OPENS
     the zip right here in the browser (our exports are stored-entry
     zips — readStoredZip is makeZip's reader half), swaps every
     LICENCE.txt for the free-kit licence above, banners the kit README,
     and re-packs before anything is uploaded. A zip with compressed
     entries isn't one of ours and is refused, not guessed at. */
  const [tkStatus, setTkStatus] = useState<{ stocked: boolean; size: number | null; updatedAt: string | null } | null>(null);
  const [tkBusy, setTkBusy] = useState(false);
  const [tkNote, setTkNote] = useState<string | null>(null);
  const tkFileRef = useRef<HTMLInputElement>(null);
  const loadTkStatus = async () => {
    const { ok, data } = await callAdmin({ action: "testKitStatus" });
    if (ok) setTkStatus({ stocked: !!data.stocked, size: (data.size as number | null) ?? null, updatedAt: (data.updatedAt as string | null) ?? null });
  };
  const swapTk = async (f: File) => {
    if (tkBusy) return;
    setTkBusy(true); setTkNote(null);
    try {
      // 1 · open the export and replace the personal paperwork
      const bytes = new Uint8Array(await f.arrayBuffer());
      const entries = readStoredZip(bytes);
      if (!entries) {
        setTkNote("That zip isn't one of the app's own exports (its entries are compressed or the index doesn't parse) — export the kit fresh from the live site and upload that file unmodified. Nothing was uploaded.");
        return;
      }
      const isPersonalLicence = (p: string) => /(^|\/)LICENCE\.txt$/.test(p) && !/(^|\/)fonts\//.test(p);
      let swapped = 0;
      let licDir: string | null = null;
      const rewritten: { path: string; data: string | Uint8Array }[] = entries.map((e) => {
        if (isPersonalLicence(e.path)) {
          swapped++;
          licDir = e.path.slice(0, e.path.length - "LICENCE.txt".length);
          return { path: e.path, data: FREE_KIT_LICENCE };
        }
        return e;
      });
      if (swapped === 0) {
        setTkNote("No LICENCE.txt in that zip — it doesn't look like an engine export. Export the kit from the live site (the big Unity button on the kit page) and upload that file. Nothing was uploaded.");
        return;
      }
      // the kit README sits beside the licence — open it with the free-kit words
      const readmeAt = rewritten.findIndex((e) => e.path === `${licDir}README.md`);
      if (readmeAt >= 0) {
        const dec = new TextDecoder();
        const old = typeof rewritten[readmeAt].data === "string" ? rewritten[readmeAt].data as string : dec.decode(rewritten[readmeAt].data as Uint8Array);
        rewritten[readmeAt] = { path: rewritten[readmeAt].path, data: FREE_KIT_README_BANNER + old };
      }
      const blob = makeZip(rewritten);

      // 2 · grant + upload the REWRITTEN bytes
      const grant = await callAdmin({ action: "testKitUpload", size: blob.size });
      if (!grant.ok || !grant.data.token || !grant.data.path) {
        setTkNote(String(grant.data.error ?? "Couldn't authorize the upload."));
        return;
      }
      const cfg = cloudConfig();
      if (!cfg) { setTkNote("Cloud isn't configured in this build."); return; }
      const put = await fetch(
        `${cfg.url}/storage/v1/object/upload/sign/${String(grant.data.path)}?token=${encodeURIComponent(String(grant.data.token))}`,
        { method: "PUT", headers: { "content-type": "application/zip" }, body: blob },
      );
      if (!put.ok) {
        setTkNote(`The upload didn't land (${put.status}) — the shelf is empty until a retry succeeds, and registered users see "not stocked yet".`);
        return;
      }
      setTkNote(`Blessed. The personal licence was swapped for the free-kit licence (${swapped} file${swapped === 1 ? "" : "s"}${readmeAt >= 0 ? ", README bannered" : ""}), and the new test kit is what every registered account downloads from this moment on.`);
      void loadTkStatus();
    } finally {
      setTkBusy(false);
    }
  };

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

  /* the hero-slider rack — feeds first (roster + art recipe live at
     module scope, above). homeHidden mirrors hidden_landing_kits: the
     rack mints entries only through Delete now, but the set is still
     what the landing filters on. The thumbnails render once the desk
     opens; a gated mount draws nothing. */
  const [homeHidden, setHomeHidden] = useState<Set<string> | null>(null);
  const [homeNote, setHomeNote] = useState<string | null>(null);
  const [homeBusy, setHomeBusy] = useState(false);
  /* display order — lowercase names, written whole on every move so the
     slider's sort is fully determined. Optimistic flip + rollback.
     Arrows are the primary control; tile drag is an enhancement, and its
     payload lives in a REF — dragstart → dragover can outrun a re-render,
     and a state-only payload leaves dragover reading a stale null closure,
     so the drop never arms. State carries only the visuals. */
  const [homeOrder, setHomeOrder] = useState<string[] | null>(null);
  const homeDragRef = useRef<number | null>(null);
  const [homeDrag, setHomeDrag] = useState<number | null>(null);
  const [homeOver, setHomeOver] = useState<number | null>(null);
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
    for (const ex of REEL_BUILTINS) m.set(ex.name, homeExampleArt(ex));
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
  // the Spotlight attach — a public designation can mint its promo card
  // in the same breath (owner: "whenever I push a new public kit")
  const [relPromote, setRelPromote] = useState(true);
  const [relBusy, setRelBusy] = useState(false);
  const [deskNote, setDeskNote] = useState<string | null>(null);
  const [slate, setSlate] = useState<Desig[] | null>(null);
  const [slateNote, setSlateNote] = useState<string | null>(null);
  /* ── the unified rotation (owner call, 2026-08-16): the rack IS the
     homepage hero slider — built-ins and designated heroes as one
     ordered list, no separate classes. A hero sharing a built-in's name
     takes over that card and its snapshot wins the art. The slate stays
     a passive report wearing the same words. */
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
  /* the rack's list — THE LANDING'S OWN SEATING RULES, step for step
     (src/marketing/landingInit.ts: kitOrder sort, hidden filter with
     the never-blank fallback, then each hero in feed order — name
     takeover in place, splice at ordered rank, unlisted to the end —
     under the 16-hero ceiling; a snapshot the engine can't render never
     joins, exactly like the landing's dry-run). What this returns IS
     what the homepage paints, in the order it paints it. */
  const rackTiles = useMemo((): RackTile[] => {
    const order = homeOrder ?? [];
    const hidden = homeHidden ?? new Set<string>();
    const rank = (...keys: (string | undefined)[]) => {
      for (const k of keys) { if (!k) continue; const i = order.indexOf(k.toLowerCase()); if (i !== -1) return i; }
      return order.length; // unlisted sort behind listed, ties keep source order
    };
    const sorted = REEL_BUILTINS.map((e, i) => [e, rank(e.name, e.look), i] as const)
      .sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map((x) => x[0]);
    const vis = sorted.filter((e) => !hidden.has(e.name.toLowerCase()) && !hidden.has(e.look.toLowerCase()));
    const reel: RackTile[] = (vis.length ? vis : sorted) // a curated-to-nothing reel falls back whole
      .map((e): RackTile => ({ name: e.name, look: e.look, art: homeArt?.get(e.name) ?? null }));
    const placed = new Set<string>();
    for (const d of heroRows.slice(0, REEL_HERO_CEILING)) {
      const lname = d.presetName.toLowerCase();
      if (hidden.has(lname) || placed.has(lname)) continue;
      const art = heroArt.get(d.id) ?? null;
      if (!art) continue; // the landing dry-runs the renderer — an unrenderable snapshot never rides
      const ri = reel.findIndex((t) => t.name.toLowerCase() === lname);
      const entry: RackTile = { name: d.presetName, art, heroId: d.id, takeover: ri !== -1 && !reel[ri].heroId };
      if (ri !== -1) reel[ri] = entry; // the designated snapshot takes the built-in's seat
      else {
        const r = rank(d.presetName);
        let at = reel.length;
        for (let i = 0; i < reel.length; i++) { if (rank(reel[i].name, reel[i].look) > r) { at = i; break; } }
        reel.splice(at, 0, entry);
      }
      placed.add(lname);
    }
    return reel;
  }, [homeOrder, homeHidden, homeArt, heroArt, slate]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveTile = (from: number, to: number) => {
    if (homeBusy || from === to || to < 0 || to >= rackTiles.length) return;
    const seq = [...rackTiles];
    const [m] = seq.splice(from, 1);
    seq.splice(to, 0, m);
    /* the slider's names lead in their new order; entries the rack
       doesn't seat (legacy chip/card ranks, deleted names) keep their
       relative order behind — per-surface ranking only reads relative
       order, so the chip row's own sort survives every reel move */
    const rackKeys = new Set(rackTiles.flatMap((t) => [t.name.toLowerCase(), ...(t.look ? [t.look.toLowerCase()] : [])]));
    const keep = (homeOrder ?? []).filter((k) => !rackKeys.has(k));
    void persistHomeOrder([...seq.map((t) => t.name.toLowerCase()), ...keep]);
  };
  /* Delete — the rack's one verb (owner: "there is no hidden, just
     delete"). A built-in goes onto the hidden_landing_kits feed (the
     landing already filters on it) and off the order list; its re-add
     chip waits on the Release Desk. A designated hero has its HERO
     designation cleared through the desk's existing write path — the
     kit itself stays findable there for re-designation — and a takeover
     hero pulls the built-in wearing its name off the slider too. */
  const deleteTile = async (t: RackTile) => {
    if (homeBusy || !homeHidden) return;
    const lname = t.name.toLowerCase();
    if (t.heroId) {
      if (!window.confirm(
        `Delete "${t.name}" from the hero slider?\n\n` +
        `Its hero designation is cleared — the frozen snapshot goes with it` +
        (t.takeover ? `, and the built-in look wearing this name leaves the slider too (its re-add chip lands on the Release Desk)` : "") +
        `. Re-add it any time from the Release Desk by designating the kit as hero again (give the CDN ~5 minutes).`,
      )) return;
      setHomeBusy(true); setHomeNote(null);
      const { ok, data } = await callAdmin({ action: "undesignate", designationId: t.heroId });
      if (!ok) { setHomeBusy(false); setHomeNote(String(data.error ?? "Couldn't clear the hero designation — nothing changed.")); return; }
      setSlate((s) => (s ?? []).filter((x) => x.id !== t.heroId)); // the card leaves now
      let err: string | null = null;
      if (t.takeover && !homeHidden.has(lname)) {
        const nextHidden = new Set(homeHidden); nextHidden.add(lname);
        err = await setHiddenLandingKits([...nextHidden]);
        if (!err) setHomeHidden(nextHidden);
      }
      const nextOrder = (homeOrder ?? []).filter((k) => k !== lname);
      const err2 = await setLandingKitOrder(nextOrder);
      if (!err2) setHomeOrder(nextOrder);
      setHomeBusy(false);
      setHomeNote(err ?? err2 ?? `Deleted — "${t.name}" leaves the hero slider (~5 min CDN). Designate the kit as hero again on the Release Desk to re-add it.`);
      void loadSlate(); // reconcile with the server's truth
    } else {
      if (!window.confirm(
        `Delete "${t.name}" from the hero slider?\n\n` +
        `Every visitor loses it (give the CDN ~5 minutes). Its chip waits on the Release Desk under "Removed from the hero slider" — Re-add there any time.`,
      )) return;
      setHomeBusy(true); setHomeNote(null);
      const nextHidden = new Set(homeHidden); nextHidden.add(lname);
      const err = await setHiddenLandingKits([...nextHidden]);
      if (err) { setHomeBusy(false); setHomeNote(err); return; }
      setHomeHidden(nextHidden);
      const nextOrder = (homeOrder ?? []).filter((k) => k !== lname && k !== t.look?.toLowerCase());
      const err2 = await setLandingKitOrder(nextOrder);
      if (!err2) setHomeOrder(nextOrder);
      setHomeBusy(false);
      setHomeNote(err2 ?? `Deleted — "${t.name}" leaves the hero slider (~5 min CDN). Its re-add chip is on the Release Desk.`);
    }
  };
  /* the Release Desk's re-add row: every deleted BUILT-IN, as a quiet
     chip (the owner's stated re-add location). Designated heroes need no
     row — re-designating as hero from the desk puts them back. Legacy
     names the retired sections once hid keep a door here too. */
  const [readdNote, setReaddNote] = useState<string | null>(null);
  const deletedBuiltins = useMemo((): { name: string; keys: string[] }[] => {
    if (!homeHidden?.size) return [];
    const out: { name: string; keys: string[] }[] = [];
    for (const e of REEL_BUILTINS) {
      const keys = [e.name.toLowerCase(), e.look.toLowerCase()];
      if (keys.some((k) => homeHidden.has(k))) out.push({ name: e.name, keys });
    }
    for (const n of OTHER_BUILTIN_NAMES) {
      if (homeHidden.has(n.toLowerCase())) out.push({ name: n, keys: [n.toLowerCase()] });
    }
    return out;
  }, [homeHidden]);
  const readdBuiltin = async (b: { name: string; keys: string[] }) => {
    if (homeBusy || !homeHidden) return;
    setHomeBusy(true); setReaddNote(null);
    const nextHidden = new Set(homeHidden);
    for (const k of b.keys) nextHidden.delete(k);
    const err = await setHiddenLandingKits([...nextHidden]);
    if (err) { setHomeBusy(false); setReaddNote(err); return; }
    setHomeHidden(nextHidden);
    // the owner's stated contract: back on at the END of the order —
    // they seat it with the arrows on the rack afterwards
    const lname = b.name.toLowerCase();
    const nextOrder = [...(homeOrder ?? []).filter((k) => k !== lname), lname];
    const err2 = await setLandingKitOrder(nextOrder);
    if (!err2) setHomeOrder(nextOrder);
    setHomeBusy(false);
    setReaddNote(err2 ?? `Re-added — "${b.name}" rides at the end of the slider (~5 min CDN); seat it with the arrows on the rack below.`);
  };
  /* the slate's report of a hero's seat — same data as the rack, so the
     two surfaces can never disagree. DELETED and the feed ceiling are
     the only ways a designated hero stays off the homepage now. */
  const heroReelStatus = (d: Desig): { chip: string; cls: string; word: string } => {
    const key = d.presetName.toLowerCase();
    if (homeHidden?.has(key)) return { chip: "DELETED", cls: "fd-review__chip--no", word: "deleted from the hero slider — designate the kit as hero again to re-add it" };
    if (heroRows.findIndex((x) => x.id === d.id) >= REEL_HERO_CEILING) return { chip: `PAST ${REEL_HERO_CEILING}`, cls: "fd-review__chip--wait", word: `beyond the feed ceiling (${REEL_HERO_CEILING} designated heroes) — delete older ones to let it ride` };
    const seat = rackTiles.findIndex((t) => t.name.toLowerCase() === key);
    const takeover = BUILTIN_REEL_NAMES.has(key) ? " — its snapshot takes over the built-in card of the same name" : "";
    return {
      chip: seat === -1 ? "IN ROTATION" : `SEAT ${seat + 1} OF ${rackTiles.length}`, cls: "fd-review__chip--ok",
      word: `in the homepage rotation at that seat${takeover} (~5 min CDN)`,
    };
  };

  /* ── the Spotlight desk: lineup, gate, form, reorder ─────────────── */
  const [spotCards, setSpotCards] = useState<PromoDef[] | null>(null);
  const [spotErr, setSpotErr] = useState<string | null>(null);
  const [spotLive, setSpotLive] = useState<boolean | null>(null);
  const [spotNote, setSpotNote] = useState<string | null>(null);
  const [spotBusy, setSpotBusy] = useState(false);
  const [spotDraft, setSpotDraft] = useState<SpotDraft | null>(null);
  const [spotEditing, setSpotEditing] = useState<string | null>(null); // id being edited; null = creating
  const spotDragRef = useRef<number | null>(null);
  const [spotDrag, setSpotDrag] = useState<number | null>(null);
  const [spotOver, setSpotOver] = useState<number | null>(null);
  useEffect(() => {
    if (!allowed) return;
    void listPromos().then((cs) => {
      if (cs === null) setSpotErr("Couldn't read the Spotlight lineup — editing is held so a blind save can't clobber it. Refresh to retry.");
      else { setSpotErr(null); setSpotCards(cs); }
    });
    void readPromosLive().then((v) => setSpotLive(v));
  }, [allowed]);
  /* optimistic whole-array write + rollback — and this session's own
     surfaces (kit-page shelf, Looks tile) follow through the store */
  const persistSpot = async (next: PromoDef[], word: string) => {
    const prev = spotCards;
    setSpotCards(next); setSpotBusy(true);
    const err = await savePromos(next);
    setSpotBusy(false);
    setSpotNote(err ?? `${word} The app reads Spotlight straight from Supabase — no CDN wait; makers pick it up on their next visit.`);
    if (err) { setSpotCards(prev); return false; }
    void useGen.getState().refreshPromos();
    return true;
  };
  const flipSpotLive = async () => {
    if (spotLive === null) return;
    const next = !spotLive;
    setSpotLive(next); setSpotBusy(true);
    const err = await setPromosLive(next);
    setSpotBusy(false);
    setSpotNote(err ?? (next
      ? "Spotlight is LIVE — every visitor sees the shelf now."
      : "Spotlight is back to admin-only — the shelf hides for everyone else."));
    if (err) { setSpotLive(!next); return; }
    void useGen.getState().refreshPromos();
  };
  const moveSpot = (from: number, to: number) => {
    if (!spotCards || spotBusy || from === to || to < 0 || to >= spotCards.length) return;
    const next = [...spotCards];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    void persistSpot(next, "Reordered — the shelf plays the first three live cards in this order.");
  };
  const saveSpotDraft = async () => {
    if (!spotDraft || spotCards === null) return;
    if (!spotDraft.title.trim()) { setSpotNote("A card needs a title."); return; }
    if (!/^#\/|^editor:/.test(spotDraft.ctaRoute.trim())) { setSpotNote("The destination must be an internal route — “#/…” or “editor:<section>”. Every card goes somewhere real."); return; }
    const card = draftToPromo(spotDraft, spotCards.filter((p) => p.id !== spotEditing));
    const next = spotEditing
      ? spotCards.map((p) => (p.id === spotEditing ? card : p))
      : [card, ...spotCards]; // a fresh card leads the lineup
    const ok = await persistSpot(next, spotEditing ? `Saved — “${card.title}” is updated in place.` : `Minted — “${card.title}” leads the lineup.`);
    if (ok) { setSpotDraft(null); setSpotEditing(null); }
  };
  const retireSpot = async (p: PromoDef) => {
    if (!spotCards) return;
    if (!window.confirm(`Retire “${p.title}” from Spotlight?\n\nThe card leaves the shelf and the Looks tile for everyone. Dismissals it earned are kept under its id, so re-minting the same id stays quiet for people who dismissed it.`)) return;
    void persistSpot(spotCards.filter((x) => x.id !== p.id), `Retired — “${p.title}” is off the lineup.`);
  };
  /* the Release Desk attach: designating a PUBLIC kit with Promote
     checked auto-mints a card from the PUBLIC-SAFE subset — the preset
     name and the frozen design recipe. Never the deal note, never the
     maker's email: kit_designations is admin-only RLS, so what rides
     into world-readable `promos` is only what the kit page would show
     anyway (the hero-lineup discipline). */
  const mintSpotPromo = async (name: string, cfg: Record<string, unknown> | null, publishDay: string | null) => {
    const cur = (await listPromos()) ?? spotCards; // fresh read — never clobber blind
    if (cur === null) { setSpotNote(`Designated, but the Spotlight read failed — mint “${name}” by hand on the Spotlight desk.`); return; }
    const newUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const card: PromoDef = {
      id: spotSlug(name, cur), kind: "kit", kicker: "New kit", title: name,
      body: "Just landed in the preset packs — apply it from the Looks rack.",
      ctaRoute: "editor:shape", ctaLabel: "Open the Looks rack",
      cfg: cfg ? (JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>) : null,
      publishAt: publishDay, newUntil, active: true,
    };
    const next = [card, ...cur];
    setSpotCards(next); setSpotBusy(true); // optimistic over the FRESH read
    const err = await savePromos(next);
    setSpotBusy(false);
    if (err) { setSpotCards(cur); setSpotNote(`Designated, but the promo didn't save: ${err}`); return; }
    setSpotNote(`Promoted — “${name}” leads Spotlight, NEW through ${newUntil}.`);
    void useGen.getState().refreshPromos();
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
  useEffect(() => { if (allowed) { void loadCensus(0); void loadStats(); void loadTkStatus(); } }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!allowed) return;
    void listHiddenLandingKits().then((keys) => setHomeHidden(new Set(keys.map((s) => s.toLowerCase()))));
    void listLandingKitOrder().then((keys) => setHomeOrder(keys.map((s) => s.toLowerCase())));
    /* the rack renders OTHER looks' faces — authored presets carry real
       typefaces (Shrikhand, Fascinate) this document never loaded. Warm
       every family the roster speaks; the browser re-rasterizes the
       inline SVG text when each face lands (same move as KitPreview). */
    try {
      for (const ex of REEL_BUILTINS) {
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
    setRelName(k.kitName || k.name); setRelNote(""); setRelDate(""); setRelPromote(true);
    const { ok, data } = await callAdmin({ action: "kitDoc", projectId: k.projectId });
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't load that kit.")); setSel(null); return; }
    setDoc(data.doc as Record<string, unknown>);
  };

  const pickStudioPreset = async (s: Studio, p: { upId: string; name: string }) => {
    const picked: Picked = { kind: "studio", userId: s.userId, upId: p.upId, name: p.name, email: s.email };
    setSel(picked); setDoc(null); setDeskNote(null);
    setRelName(p.name); setRelNote(""); setRelDate(""); setRelPromote(true);
    const { ok, data } = await callAdmin({ action: "studioDoc", userId: s.userId, upId: p.upId });
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't load that preset.")); setSel(null); return; }
    setDoc(data.doc as Record<string, unknown>);
  };

  /** returns the FINAL preset name on success (the de-duped one the
   *  slate filed), null when refused/canceled — the Spotlight mint
   *  needs the real name after this clears the bench */
  const designate = async (placement: "hero" | "standard" | "upcoming"): Promise<string | null> => {
    if (!sel || relBusy) return null;
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
    if (!window.confirm(msg)) return null;
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
    if (!ok) { setDeskNote(String(data.error ?? "Couldn't designate that kit.")); return null; }
    /* the re-add door for heroes: a name that was DELETED from the
       slider sits on the hidden_landing_kits feed, and the landing
       filters heroes by name — a fresh designation under that name
       would freeze fine and never ride. Designating as hero IS the
       owner's re-add, so the delete comes off the feed here. */
    if (placement === "hero") {
      const lname = name.toLowerCase();
      if (homeHidden?.has(lname)) {
        const nextHidden = new Set(homeHidden);
        nextHidden.delete(lname);
        const herr = await setHiddenLandingKits([...nextHidden]);
        if (!herr) setHomeHidden(nextHidden);
        else setHomeNote(herr);
      }
    }
    setDeskNote(renamed
      ? `Frozen and filed — "${name}" is on the slate ("${desired}" was already designated, so it took the next free number).`
      : `Frozen and filed — "${name}" is on the slate.`);
    setSel(null); setDoc(null); setKits(null); setStudios([]); setKq("");
    void loadSlate();
    return name;
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
        {/* the applications desk lives HERE now (owner: "I don't need to
            review student applications from the generator, that can live
            in the admin tools") */}
        <p className="fd-fine">
          <button className="fd-ghost" onClick={() => { window.location.hash = "#/review"; }}>
            <GraduationCap size={14} strokeWidth={2} /> Review student &amp; educator applications
          </button>
        </p>

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
            it <b>in the hero slider</b> at a seat you order on the rack below — built-ins and
            designated heroes are one list there, played exactly in that order (~5 min CDN; up to{" "}
            {REEL_HERO_CEILING} designated heroes ride). A hero sharing a built-in's name takes over
            that built-in's card. Each hero row below reports its seat; deleted names sit out until
            you re-add them — designate a deleted hero again, or use a deleted built-in's chip at
            the bottom of this desk.
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
                  {relPublic && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      title="Auto-mint a Spotlight card from the public-safe subset — the preset name and its design recipe. The deal note never leaves the slate.">
                      <input type="checkbox" checked={relPromote} onChange={(e) => setRelPromote(e.target.checked)} />
                      <Megaphone size={14} strokeWidth={2.1} /> Promote on Spotlight
                    </label>
                  )}
                  <div className="fd-desk__acts">
                    <button className="fd-primary fd-desk__go" disabled={relBusy || (!relHero && !relPublic)}
                      onClick={() => void (async () => {
                        /* capture BEFORE designate clears the bench — the
                           promo mint needs the frozen recipe and the date */
                        const cfgSnap = (doc as { cfg?: Record<string, unknown> } | null)?.cfg ?? null;
                        const wantPromo = relPromote && relPublic;
                        const publishDay = relDate || null;
                        if (relHero) await designate("hero");
                        if (relPublic) {
                          const finalName = await designate(relDate ? "upcoming" : "standard");
                          if (finalName && wantPromo) await mintSpotPromo(finalName, cfgSnap, publishDay);
                        }
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

          {deletedBuiltins.length > 0 && (
            <div className="fd-readd">
              <span className="fd-readd__label">Removed from the hero slider:</span>
              {deletedBuiltins.map((b) => (
                <span key={b.name} className="fd-readd__chip">
                  {b.name}
                  <button className="fd-ghost" disabled={homeBusy}
                    title={`Put ${b.name} back on the homepage, at the end of the slider order`}
                    onClick={() => void readdBuiltin(b)}>Re-add</button>
                </span>
              ))}
            </div>
          )}
          {readdNote && <p className="fd-note">{readdNote}</p>}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><House size={17} strokeWidth={2.1} /> Hero slider — display order</h2>
          <p className="fd-fine">
            The homepage hero slider, <b>exactly as it plays</b>: built-ins and designated heroes
            as one list, in this order (the feed is CDN-cached ~5 minutes). The <b>arrows change
            the order</b> — cards drag too. <b>Delete removes a card from the slider</b> for every
            visitor: a built-in keeps a re-add chip on the Release Desk, and a designated hero
            comes back by designating its kit as hero again. A designated hero sharing a built-in's
            name takes over that built-in's card — its frozen snapshot wins the art. The style-chip
            row follows this same order on its own.
          </p>
          {homeHidden === null || homeOrder === null ? (
            <p className="fd-note"><Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> Reading the current lineup…</p>
          ) : (
            <div className="fd-homerack">
              {rackTiles.map((t, i) => {
                const dragging = homeDrag === i;
                const dropover = !dragging && homeOver === i;
                return (
                  <div key={t.heroId ?? t.name}
                    className={`fd-hometile${dragging ? " dragging" : ""}${dropover ? " dropover" : ""}`}
                    draggable
                    title="Drag to reorder the slider"
                    onDragStart={(e) => {
                      homeDragRef.current = i;
                      setHomeDrag(i);
                      e.dataTransfer.effectAllowed = "move";
                      try { e.dataTransfer.setData("text/plain", t.name); } catch { /* older engines */ }
                    }}
                    onDragEnd={() => { homeDragRef.current = null; setHomeDrag(null); setHomeOver(null); }}
                    onDragOver={(e) => {
                      if (homeDragRef.current === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (homeOver !== i) setHomeOver(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const d = homeDragRef.current;
                      if (d !== null && d !== i) moveTile(d, i);
                      homeDragRef.current = null; setHomeDrag(null); setHomeOver(null);
                    }}>
                    {t.art ? (
                      <div className="fd-hometile__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.art }} />
                    ) : (
                      <div className="fd-hometile__art fd-hometile__art--empty">
                        no preview — this look lives only in the front-door bundle
                      </div>
                    )}
                    <div className="fd-hometile__name">
                      <b>{t.name}</b>
                      {t.heroId && <span>designated hero</span>}
                    </div>
                    <div className="fd-hometile__row">
                      <span className="fd-hometile__seat">{i + 1} of {rackTiles.length}</span>
                      <div className="fd-hometile__acts">
                        <button className="fd-ghost fd-hometile__nudge" disabled={homeBusy || i === 0}
                          title={`Play ${t.name} earlier`} aria-label={`Play ${t.name} earlier in the slider`}
                          onClick={() => moveTile(i, i - 1)}>
                          <ChevronLeft size={14} strokeWidth={2.2} />
                        </button>
                        <button className="fd-ghost fd-hometile__nudge" disabled={homeBusy || i === rackTiles.length - 1}
                          title={`Play ${t.name} later`} aria-label={`Play ${t.name} later in the slider`}
                          onClick={() => moveTile(i, i + 1)}>
                          <ChevronRight size={14} strokeWidth={2.2} />
                        </button>
                        <button className="fd-ghost fd-hometile__act" disabled={homeBusy}
                          title={`Delete ${t.name} from the hero slider — re-add it from the Release Desk`}
                          onClick={() => void deleteTile(t)}>
                          <Trash2 size={13} strokeWidth={2.2} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {homeNote && <p className="fd-note">{homeNote}</p>}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><Megaphone size={17} strokeWidth={2.1} /> Spotlight desk</h2>
          <p className="fd-fine">
            The promo shelf on the kit page and the NEW tile in the Looks rack, curated here.
            <b> Order is priority</b> — the shelf plays the first three live cards, the Looks tile
            takes the first live kit card, and "rotating" means you change this lineup. Every card
            needs a real <b>destination</b> ("#/…" pages or "editor:&lt;section&gt;" for a panel
            section). Cards preview below <b>exactly as the kit page renders them</b> — engine art
            from the frozen recipe, expiring NEW badge, one quiet CTA. <b>Spotlight ships
            admin-only</b>: until you flip it live, only admins see the shelf (staged cards stay
            admin-only even after). The app reads these straight from Supabase — no CDN lag;
            makers pick changes up on their next visit. Public kits designated with <b>Promote on
            Spotlight</b> mint their card automatically from the public-safe subset (name +
            recipe; deal notes never leave the slate).
          </p>
          <div className="fd-censusbar">
            <button className={`fd-ghost${spotLive ? " on" : ""}`} disabled={spotBusy || spotLive === null}
              title={spotLive ? "Visible to every visitor — click to pull it back to admin-only" : "Admin-only right now — click to release the shelf to everyone"}
              onClick={() => void flipSpotLive()}>
              {spotLive ? <><Eye size={13} strokeWidth={2.2} /> Live for everyone</> : <><EyeOff size={13} strokeWidth={2.2} /> Admin-only</>}
            </button>
            <button className="fd-ghost" disabled={spotBusy || spotCards === null}
              onClick={() => { setSpotEditing(null); setSpotDraft({ ...EMPTY_DRAFT }); }}>
              <Plus size={13} strokeWidth={2.2} /> New card
            </button>
          </div>
          {spotErr && <p className="fd-note">{spotErr}</p>}

          {spotDraft && (
            <div className="fd-desk">
              {/* the draft, drawn by the SAME component the kit page uses */}
              <div className="pspot pspot--desk" style={{ margin: 0 }}>
                <PromoCardView p={draftToPromo(spotDraft, (spotCards ?? []).filter((p) => p.id !== spotEditing))} admin />
              </div>
              <div className="fd-desk__form">
                <input value={spotDraft.title} maxLength={60} placeholder="title — what the card headlines"
                  onChange={(e) => setSpotDraft({ ...spotDraft, title: e.target.value })} />
                <input value={spotDraft.body} maxLength={120} placeholder="body — ONE line under the title"
                  onChange={(e) => setSpotDraft({ ...spotDraft, body: e.target.value })} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={spotDraft.kind} aria-label="Card kind"
                    onChange={(e) => setSpotDraft({ ...spotDraft, kind: e.target.value as PromoKind })}>
                    <option value="kit">kit</option><option value="tool">tool</option><option value="howto">how-to</option>
                  </select>
                  <input value={spotDraft.kicker} maxLength={24} placeholder="kicker — blank wears the kind's word" style={{ flex: 1, minWidth: 160 }}
                    onChange={(e) => setSpotDraft({ ...spotDraft, kicker: e.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={spotDraft.ctaRoute} list="spot-routes" placeholder="destination — #/releases, editor:shape…" style={{ flex: 1, minWidth: 180 }}
                    onChange={(e) => setSpotDraft({ ...spotDraft, ctaRoute: e.target.value })} />
                  <datalist id="spot-routes">{SPOT_ROUTES.map((r) => <option key={r} value={r} />)}</datalist>
                  <input value={spotDraft.ctaLabel} maxLength={32} placeholder="CTA words — blank says “Take a look”" style={{ flex: 1, minWidth: 160 }}
                    onChange={(e) => setSpotDraft({ ...spotDraft, ctaLabel: e.target.value })} />
                </div>
                <label className="fd-desk__date">
                  <CalendarClock size={14} strokeWidth={2.1} /> goes live — blank is now
                  <input type="date" value={spotDraft.publishAt} onChange={(e) => setSpotDraft({ ...spotDraft, publishAt: e.target.value })} />
                </label>
                <label className="fd-desk__date">
                  <Star size={14} strokeWidth={2.1} /> NEW badge until — blank means no badge
                  <input type="date" value={spotDraft.newUntil} onChange={(e) => setSpotDraft({ ...spotDraft, newUntil: e.target.value })} />
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  title="Off = staged: you preview it everywhere, nobody else sees it">
                  <input type="checkbox" checked={spotDraft.active} onChange={(e) => setSpotDraft({ ...spotDraft, active: e.target.checked })} />
                  <Eye size={14} strokeWidth={2.1} /> Active (off = staged, admin eyes only)
                </label>
                <input value={spotDraft.artRef} placeholder="art override — an asset://<hash> ref (kit cards usually keep their recipe art)"
                  onChange={(e) => setSpotDraft({ ...spotDraft, artRef: e.target.value })} />
                {spotDraft.cfg
                  ? <p className="fd-fine">This card carries a frozen design recipe — the art above is drawn from it live. Recipes come from Promote on Spotlight; editing keeps it.</p>
                  : <p className="fd-fine">No design recipe on this card — it wears its kind's plate (or the asset art above). Kit cards minted from the Release Desk bring their recipe along. Honest limit: asset:// art resolves from each viewer's own account bucket, so today it paints for you and falls back to the plate for everyone else — a public art bucket is phase 2.</p>}
                <div className="fd-desk__acts">
                  <button className="fd-primary fd-desk__go" disabled={spotBusy} onClick={() => void saveSpotDraft()}>
                    {spotBusy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Megaphone size={15} strokeWidth={2.1} />} {spotEditing ? "Save card" : "Mint card"}
                  </button>
                  <button className="fd-ghost" onClick={() => { setSpotDraft(null); setSpotEditing(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="cg-secline">The lineup — first three live cards ride the shelf</div>
          {spotCards === null && !spotErr && <p className="fd-fine"><Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> Reading the lineup…</p>}
          {spotCards !== null && spotCards.length === 0 && <p className="fd-fine">No cards yet — mint one above, or designate a public kit with Promote on Spotlight.</p>}
          {spotCards !== null && spotCards.length > 0 && (() => {
            const shelfSeats = spotCards.filter((p) => promoIsLive(p));
            return (
              <div className="pspot pspot--desk" style={{ margin: 0, maxWidth: "none" }}>
                <div className="pspot-grid">
                  {spotCards.map((p, i) => {
                    const seat = shelfSeats.findIndex((x) => x.id === p.id);
                    const held = p.active !== false && p.publishAt && new Date(p.publishAt).getTime() > Date.now();
                    const chip = p.active === false
                      ? { cls: "fd-review__chip--no", word: "STAGED" }
                      : held ? { cls: "fd-review__chip--wait", word: `HELD → ${String(p.publishAt).slice(0, 10)}` }
                        : seat >= 0 && seat < 3 ? { cls: "fd-review__chip--ok", word: `SEAT ${seat + 1} OF 3` }
                          : { cls: "fd-review__chip--wait", word: "IN LINE" };
                    return (
                      <div key={p.id}
                        className={`pspot-deskcard${spotDrag === i ? " dragging" : ""}${spotOver === i && spotDrag !== i ? " dropover" : ""}`}
                        draggable title="Drag to reorder the lineup"
                        onDragStart={(e) => { spotDragRef.current = i; setSpotDrag(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", p.id); } catch { /* older engines */ } }}
                        onDragEnd={() => { spotDragRef.current = null; setSpotDrag(null); setSpotOver(null); }}
                        onDragOver={(e) => { if (spotDragRef.current === null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (spotOver !== i) setSpotOver(i); }}
                        onDrop={(e) => { e.preventDefault(); const d = spotDragRef.current; if (d !== null && d !== i) moveSpot(d, i); spotDragRef.current = null; setSpotDrag(null); setSpotOver(null); }}>
                        <PromoCardView p={p} admin />
                        <div className="pspot-deskrow">
                          <span className={`fd-review__chip ${chip.cls}`}>{chip.word}</span>
                          <div className="fd-hometile__acts">
                            <button className="fd-ghost fd-hometile__nudge" disabled={spotBusy || i === 0}
                              title={`Play “${p.title}” earlier`} aria-label={`Move ${p.title} earlier in the lineup`}
                              onClick={() => moveSpot(i, i - 1)}><ChevronLeft size={14} strokeWidth={2.2} /></button>
                            <button className="fd-ghost fd-hometile__nudge" disabled={spotBusy || i === spotCards.length - 1}
                              title={`Play “${p.title}” later`} aria-label={`Move ${p.title} later in the lineup`}
                              onClick={() => moveSpot(i, i + 1)}><ChevronRight size={14} strokeWidth={2.2} /></button>
                            <button className="fd-ghost fd-hometile__act" disabled={spotBusy}
                              title={`Edit “${p.title}” — the id (dismissal key) stays`}
                              onClick={() => { setSpotEditing(p.id); setSpotDraft(promoToDraft(p)); window.scrollTo({ top: window.scrollY, behavior: "auto" }); }}>
                              <SquarePen size={13} strokeWidth={2.2} /> Edit
                            </button>
                            <button className="fd-ghost fd-hometile__act" disabled={spotBusy}
                              title={`Retire “${p.title}” from Spotlight for everyone`}
                              onClick={() => void retireSpot(p)}>
                              <Trash2 size={13} strokeWidth={2.2} /> Retire
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {spotNote && <p className="fd-note">{spotNote}</p>}
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

        <section className="fd-card">
          <h2 className="fd-card__title"><Gamepad2 size={17} strokeWidth={2.1} /> Unity test kit shelf</h2>
          <p className="fd-fine">
            The one download every <b>registered</b> account gets: a canned, stock
            kit zip — the same fixed artifact for everyone, never their own design — a free
            kit that's theirs to ship, commercial projects included (the licence inside
            says so), and that proves the import pipeline. It doubles as the FREE
            Unity Asset Store package (the shelf kit: <b>Brightside</b> — the licence names
            it, so a different kit needs new blessed words). The flow: export the kit
            from the live site (the big Unity button on its kit page — boards, scenes and
            all), then upload that exact file here. Blessing opens the zip in this browser,
            <b> swaps your personal licence for the free-kit licence</b>, banners the
            README, re-packs, and ships it — live immediately, no deploy, no code.
          </p>
          <p className="fd-fine">
            {tkStatus === null ? "Checking the shelf…"
              : tkStatus.stocked
                ? <>Stocked: <b>{tkStatus.size ? `${(tkStatus.size / 1048576).toFixed(1)} MB` : "size unknown"}</b>{tkStatus.updatedAt ? ` · blessed ${new Date(tkStatus.updatedAt).toLocaleDateString()}` : ""}</>
                : <b>Not stocked — registered users currently see “the test kit isn't stocked yet.”</b>}
          </p>
          <div className="fd-actions">
            <button className="fd-primary" disabled={tkBusy} onClick={() => tkFileRef.current?.click()}>
              {tkBusy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Gamepad2 size={15} strokeWidth={2.1} />}
              {tkBusy ? "Blessing…" : tkStatus?.stocked ? "Swap the blessed zip…" : "Stock the shelf…"}
            </button>
            <input ref={tkFileRef} type="file" accept=".zip,application/zip" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void swapTk(f); e.target.value = ""; }} />
          </div>
          {tkNote && <p className="fd-note">{tkNote}</p>}
        </section>
      </main>
    </div>
  );
}
