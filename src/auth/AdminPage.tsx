import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldCheck, CreditCard, FolderInput, Rocket, Star, CalendarClock, Trash2, RefreshCw, Users, Activity, Wand2, House } from "lucide-react";
import "@/styles/pricing.css";
import { cloudConfig, myProfileTier, accessToken, listHiddenLandingKits, setHiddenLandingKits } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import { hydrate } from "@/generator/store";
import { applyKitDesign, applyKitTextFill, type GenConfig, type KitComponentId } from "@/generator/model";
import { renderBevel, renderKit } from "@/generator/bevel";
import { ensureDocFonts } from "@/generator/fonts";
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
      const cfg = hydrate(doc.cfg as Record<string, unknown>) as GenConfig;
      const designs = (doc.kitDesigns ?? {}) as Record<string, never>;
      const fills = (doc.kitTextFill ?? {}) as Record<string, never>;
      const labels = (doc.kitLabels ?? {}) as Record<string, string>;
      const slots = (doc.kitSlotVals ?? {}) as Record<string, Record<string, string>>;
      const piece = (cid: KitComponentId, size: "s" | "m" | "l", v?: number) =>
        tightenSvg(renderKit(
          applyKitTextFill(applyKitDesign(cfg, designs[cid]), fills[cid]),
          cid, size, "default", v, undefined,
          { label: labels[cid], slots: slots[cid] },
        ), 18);
      const html =
        `<div class="cg-hero">${piece("primary" as KitComponentId, "l")}</div>` +
        `<div class="cg-minis">${[
          piece("progress" as KitComponentId, "s", 0.62),
          piece("toggle" as KitComponentId, "s", 1),
          piece("badge" as KitComponentId, "s"),
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

/** parked-forever sentinel (upcoming with no date yet) reads as "parked" */
function releaseWord(d: Desig): string {
  if (d.placement === "hero") return "hero lineup";
  if (!d.publishAt) return "live";
  const t = new Date(d.publishAt).getTime();
  if (t > Date.now() + 1000 * 60 * 60 * 24 * 365 * 20) return "parked — no date yet";
  return t <= Date.now() ? "live" : `releases ${fmtDay(d.publishAt)}`;
}

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

  /* homepage curation — the HARDCODED front-door kits (hero reel, swatch
     chips, community cards) an admin can retire without a deploy. Match
     keys are lowercase DISPLAY NAMES: the landing checks names on every
     surface, and names never collide across surfaces the way shared
     preset ids do (Grape Jelly the reel entry vs Grape Arcade the card).
     KEEP IN SYNC with HERO_SWATCHES / HERO_REEL / CM_KITS in
     src/marketing/landingInit.ts. */
  const HOME_ROSTER: { group: string; names: string[] }[] = [
    { group: "Hero reel & style chips", names: ["Grape Jelly", "Hard Candy", "Schweetheart", "Neon Versus", "Oopsie", "Citrus Pop", "Bubble Pop", "Nope Yep", "Wager", "Deep Ocean", "Forest Sprite", "Hero Chisel", "Glacier Tech"] },
    { group: "Community cards", names: ["Grape Arcade", "Abyss Console", "Forge Standard"] },
  ];
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
    const name = relName.trim() || sel.name;
    const msg =
      placement === "hero"
        ? `Freeze "${sel.name}" for the homepage carousel?\n\nThe kit is snapshotted exactly as it is today, with the deal note. (The homepage lineup itself is wired in a separate pass — this stores the frozen kit and your intent.)`
        : placement === "standard"
          ? `Release "${name}" to everyone right now?\n\nIt appears in every player's Presets panel immediately, and the kit is snapshotted for the record.`
          : relDate
            ? `Hold "${name}" until ${relDate}?\n\nInvisible to players until that day, then it releases itself. Snapshot and deal note are stored now.`
            : `Park "${name}" as upcoming, no date yet?\n\nInvisible to players until you schedule it. Snapshot and deal note are stored now.`;
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
    setDeskNote(`Frozen and filed — "${name}" is on the slate.`);
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

  const unDesignate = async (d: Desig) => {
    const shipped = d.placement !== "hero";
    if (!window.confirm(
      `Take "${d.presetName}" off the slate?\n\n` +
      (shipped ? "Its preset entry is retired too — players lose access to it. " : "") +
      "The frozen snapshot is deleted with it.",
    )) return;
    const { ok, data } = await callAdmin({ action: "undesignate", designationId: d.id });
    if (!ok) { setSlateNote(String(data.error ?? "Couldn't remove it.")); return; }
    void loadSlate();
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
            day; with the date blank it lands in every player's Presets panel immediately. Hero files
            it for the homepage carousel (wiring the homepage to read the slate is a separate pass).
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
              {slate.map((d) => (
                <div key={d.id} className="fd-adminrow">
                  <div className="fd-adminrow__who">
                    <b>{d.presetName}{d.presetName !== d.kitName ? <span className="fd-adminrow__meta"> (kit "{d.kitName}")</span> : null}</b>
                    <span className="fd-adminrow__meta">
                      <span className={`fd-review__chip ${d.placement === "standard" ? "fd-review__chip--ok" : "fd-review__chip--wait"}`}>{d.placement.toUpperCase()}</span>
                      {" "}{releaseWord(d)} · {d.sourceEmail ?? "unknown maker"} · frozen {fmtDay(d.createdAt)}
                      {d.dealNote ? <> · {d.dealNote}</> : null}
                    </span>
                  </div>
                  <div className="fd-adminrow__acts">
                    <button className="fd-ghost fd-adminrow__plan" disabled={refreshingId === d.id}
                      title="Re-freeze from the maker's current version — your approval click"
                      onClick={() => void refreeze(d)}>
                      {refreshingId === d.id
                        ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" />
                        : <RefreshCw size={13} strokeWidth={2.1} />} Refresh
                    </button>
                    <button className="fd-ghost fd-adminrow__plan" onClick={() => void unDesignate(d)}>
                      <Trash2 size={13} strokeWidth={2.1} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="fd-card">
          <h2 className="fd-card__title"><House size={17} strokeWidth={2.1} /> Homepage kits</h2>
          <p className="fd-fine">
            The front door's <b>built-in</b> kits — the hero reel, the style chips, and the three
            community cards ship hardcoded. Untick one and it leaves the homepage for every visitor,
            no deploy: the list rides the same feed as hero designations (CDN-cached ~5 minutes).
            Designated heroes are curated in the Release desk above; unticking a name here also
            keeps a same-named hero out of the reel.
          </p>
          {homeHidden === null ? (
            <p className="fd-note"><Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> Reading the current lineup…</p>
          ) : (
            HOME_ROSTER.map(({ group, names }) => (
              <div key={group} className="fd-homegroup">
                <div className="fd-homegroup__name">{group}</div>
                <div className="fd-homegrid">
                  {names.map((nm) => (
                    <label key={nm} className={`fd-homekit${homeHidden.has(nm.toLowerCase()) ? " off" : ""}`}>
                      <input type="checkbox" disabled={homeBusy}
                        checked={!homeHidden.has(nm.toLowerCase())}
                        onChange={() => void toggleHomeKit(nm)} />
                      {nm}
                    </label>
                  ))}
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
