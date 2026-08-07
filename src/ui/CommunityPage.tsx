import { MarketingFooter } from "@/marketing/chrome";
import { useEffect, useRef, useState } from "react";
import { Heart, ExternalLink, Loader2, RefreshCw, Eye, EyeOff, Link2, Check, CircleSlash, RotateCcw, Trash2 } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { t } from "@/shell/i18n";
import { usePageScroll } from "@/shell/usePageScroll";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { cloudConfig, myProfileTier, publicProjectUrl } from "@/generator/cloud";
import { listCommunity, setLike, curateProject, rejectProject, deleteSubmission, fetchCardDoc, avatarUrl, type CommunityCard } from "@/generator/community";
import { hydrate } from "@/generator/store";
import { ensureDocFonts } from "@/generator/fonts";
import { applyKitDesign, applyKitTextFill, type GenConfig, type KitComponentId } from "@/generator/model";
import { LiveArt } from "./LiveArt";
import { renderKit } from "@/generator/bevel";
import { tightenSvg } from "@/marketing/engine";
import logoUrl from "../../pb-logo.png";

/* #/community — the gallery. Community-lite, by decree: one fetch per
   page view, and every card is a LIVE render from the kit's saved
   settings — the engine that draws the editor, drawing in the visitor's
   browser. No screenshots exist anywhere in this feature.

   Curation happens here too: admins see the queue (public, unlisted)
   inline with List/Unlist buttons — the same reuse-the-page pattern as
   the student review desk. */

/* The feed's variety engine (owner call: a fun, Midjourney-ish wall, not
   rows of identical buttons). Each card deterministically picks its hero
   and supporting pieces from POOLS, keyed by the project id — stable per
   kit across loads, varied across the wall, zero server involvement.
   Every id in these pools is verified to render standalone. */
const HERO_POOL: KitComponentId[] = [
  "primary", "speedo", "dialog", "trophy", "flipclock", "healthglobe",
  "equipselector", "weaponwheel", "combo", "leaderboard", "waypoint", "dropdown",
] as KitComponentId[];
const MINI_SETS: { cid: KitComponentId; v?: number }[][] = [
  [{ cid: "progress" as KitComponentId, v: 0.62 }, { cid: "toggle" as KitComponentId, v: 1 }, { cid: "badge" as KitComponentId }],
  [{ cid: "chip" as KitComponentId }, { cid: "orb" as KitComponentId, v: 1 }, { cid: "keycap" as KitComponentId }],
  [{ cid: "currency" as KitComponentId }, { cid: "slider" as KitComponentId, v: 0.5 }, { cid: "notifydot" as KitComponentId }],
  [{ cid: "segbar" as KitComponentId, v: 0.6 }, { cid: "iconbtn" as KitComponentId }, { cid: "cooldown" as KitComponentId, v: 0.4 }],
];
/** cheap stable hash of a uuid string */
function idHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function CardArt({ card }: { card: { id: string } }) {
  /* two refs, one hard rule: React owns `host` (frame, spinner), the
     engine owns `paint` (innerHTML target). Injecting into the React-
     managed node let React try to remove a spinner the injection had
     already destroyed — a removeChild crash that blanked the page the
     first time a card ever loaded successfully. */
  const host = useRef<HTMLDivElement>(null);
  const paint = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  /* the hero is ALIVE from the moment the card loads (owner call): a real
     LiveArt instance, not a screenshot — shine sweeps, gauges rev on a
     staggered first beat, and CLICKS interact with the piece (rev it, flip
     it) rather than navigating. "Use this kit" is the door. */
  const [liveHero, setLiveHero] = useState<{ cfg: GenConfig; cid: KitComponentId; label?: string; slots?: Record<string, string> } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || state !== "idle") return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setState("loading");
      void (async () => {
        const doc = await fetchCardDoc(card.id);
        if (!doc || !paint.current || !host.current) {
          // name the failure — a silent dash taught us nothing in the field
          console.warn("[community] card doc fetch returned nothing", { id: card.id });
          setState("failed"); return;
        }
        try {
          const cfg = hydrate(doc.cfg as Record<string, unknown>) as GenConfig;
          /* the card is ANOTHER maker's kit — its faces are never in this
             visitor's font set. Load every family the doc speaks; the
             browser re-rasterizes the live SVG text as each face lands
             (owner: "thumbnails look true to the author's design"). */
          ensureDocFonts(cfg, doc.kitDesigns);
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
          const h = idHash(card.id);
          const heroCid = HERO_POOL[h % HERO_POOL.length];
          setLiveHero({
            cfg: applyKitTextFill(applyKitDesign(cfg, designs[heroCid]), fills[heroCid]),
            cid: heroCid, label: labels[heroCid], slots: slots[heroCid],
          });
          const small = MINI_SETS[(h >> 4) % MINI_SETS.length].map((p) => piece(p.cid, "s", p.v));
          paint.current.innerHTML =
            `<div class="cg-minis">${small.map((s) => `<span>${s}</span>`).join("")}</div>`;
          /* the maker's stage rides the payload — paint it behind the art.
             Strict base64-image match only: this string enters CSS url(),
             so nothing that could escape it is accepted. Public cards are
             admin-curated before listing, so the stage is seen before it
             is staged. */
          const bg = (doc as { bgImage?: unknown }).bgImage;
          if (typeof bg === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(bg)) {
            host.current.classList.add("cg-art--stage");
            host.current.style.backgroundImage = `url("${bg}")`;
          }
          setState("done");
        } catch (e) {
          console.warn("[community] card render failed", { id: card.id, error: e });
          setState("failed");
        }
      })();
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [card.id, state]);

  return (
    <div ref={host} className="cg-art" aria-hidden="true">
      {liveHero && (
        <div className="cg-hero">
          <LiveArt cfg={liveHero.cfg} playing ambient shine
            kit={{ id: liveHero.cid, size: "l", label: liveHero.label, slots: liveHero.slots }} />
        </div>
      )}
      {/* display:contents so the injected hero/minis join .cg-art's flex */}
      <div ref={paint} style={{ display: "contents" }} />
      {state !== "done" && (
        <span className="cg-art__wait">
          {state === "failed" ? "—" : <Loader2 size={16} strokeWidth={2.2} className="fd-spin" />}
        </span>
      )}
    </div>
  );
}

export function Card({ card, admin, onChanged }: { card: CommunityCard; admin: boolean; onChanged: () => void }) {
  const [liked, setLiked] = useState(card.liked);
  const [count, setCount] = useState(card.likes);
  const [busy, setBusy] = useState(false);
  const cloud = useCloudStatus();
  const signedIn = cloud.state === "synced" || cloud.state === "syncing";

  const heart = async () => {
    if (!signedIn) { openAuth("signin"); return; }
    // optimistic — the community-lite contract: flip now, sync under
    const next = !liked;
    setLiked(next); setCount((c) => c + (next ? 1 : -1));
    const err = await setLike(card.id, next);
    if (err) { setLiked(!next); setCount((c) => c + (next ? -1 : 1)); }
  };

  const curate = async (listed: boolean) => {
    setBusy(true);
    const err = await curateProject(card.id, listed);
    setBusy(false);
    if (err) window.alert(err); else onChanged();
  };

  const reject = async (rejected: boolean) => {
    setBusy(true);
    const err = await rejectProject(card.id, rejected);
    setBusy(false);
    if (err) window.alert(err); else onChanged();
  };

  const nuke = async () => {
    if (!window.confirm(`Delete "${card.name}" entirely? The maker loses this kit — its settings, share link and hearts. This is for spam; a kit you just don't want on the wall should be Rejected instead.`)) return;
    setBusy(true);
    const err = await deleteSubmission(card.id);
    setBusy(false);
    if (err) window.alert(err); else onChanged();
  };

  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (!card.share_slug) return;
    const url = publicProjectUrl(card.share_slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { window.prompt("Link to this kit:", url); }
  };

  const maker = card.display_name || (card.handle ? `@${card.handle}` : "a maker");
  const av = avatarUrl(card.avatar_path);
  // every byline wears a face: the real avatar, or a candy monogram until
  // the maker uploads one
  const face = av
    ? <img className="cg-avatar" src={av} alt="" />
    : <span className="cg-avatar cg-avatar--mono" aria-hidden="true">{maker.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?"}</span>;
  return (
    <article className={`cg-card${card.listed ? "" : " cg-card--queue"}`}>
      {!card.listed && <span className={`cg-queuechip${card.review === "rejected" ? " cg-queuechip--rej" : ""}`}>{card.review === "rejected" ? "REJECTED" : "IN REVIEW"}</span>}
      <CardArt card={card} />
      <div className="cg-meta">
        <div className="cg-title">
          <b>{card.name}</b>
          {card.handle ? (
            <button className="cg-maker" onClick={() => navigate(`#/u/${card.handle}`)}>
              {face}{t("byMaker")} {maker}
            </button>
          ) : (
            <span className="cg-maker cg-maker--plain">{face}{t("byMaker")} {maker}</span>
          )}
        </div>
        <div className="cg-actions">
          <button className={`cg-like${liked ? " on" : ""}`} onClick={() => void heart()}
            aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}>
            <Heart size={14} strokeWidth={2.2} /> {count}
          </button>
          {card.share_slug && (
            <a className="cg-open" href={publicProjectUrl(card.share_slug)} title="Open this kit in the editor — view, then remix">
              <ExternalLink size={13} strokeWidth={2.2} /> {t("useThisKit")}
            </a>
          )}
          {card.share_slug && (
            <button className="cg-open" onClick={() => void share()} title="Copy this kit's link"
              aria-label="Copy this kit's link">
              {copied ? <Check size={13} strokeWidth={2.4} /> : <Link2 size={13} strokeWidth={2.2} />} {copied ? t("copiedBtn") : t("shareBtn")}
            </button>
          )}
          {admin && (
            card.listed
              ? <button className="cg-curate" disabled={busy} onClick={() => void curate(false)}><EyeOff size={13} strokeWidth={2.2} /> Unlist</button>
              : card.review === "rejected"
                ? <>
                    <button className="cg-curate cg-curate--add" disabled={busy} title="Back into the curation queue"
                      onClick={() => void reject(false)}><RotateCcw size={13} strokeWidth={2.2} /> Restore</button>
                    <button className="cg-curate cg-curate--danger" disabled={busy} title="Delete the kit entirely — spam only"
                      onClick={() => void nuke()}><Trash2 size={13} strokeWidth={2.2} /> Delete</button>
                  </>
                : <>
                    <button className="cg-curate cg-curate--add" disabled={busy} onClick={() => void curate(true)}><Eye size={13} strokeWidth={2.2} /> List</button>
                    <button className="cg-curate" disabled={busy} title="Pass — the maker keeps the kit and its share link; it just leaves this queue"
                      onClick={() => void reject(true)}><CircleSlash size={13} strokeWidth={2.2} /> Reject</button>
                    <button className="cg-curate cg-curate--danger" disabled={busy} title="Delete the kit entirely — spam only"
                      onClick={() => void nuke()}><Trash2 size={13} strokeWidth={2.2} /> Delete</button>
                  </>
          )}
        </div>
      </div>
    </article>
  );
}

export function CommunityPage() {
  usePageScroll();
  const live = !!cloudConfig();
  const [cards, setCards] = useState<CommunityCard[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async (isAdmin: boolean) => {
    setLoading(true); setErr(null);
    const { cards: cs, error } = await listCommunity({ includeQueue: isAdmin });
    setLoading(false);
    if (error) setErr(error); else setCards(cs);
  };

  useEffect(() => {
    if (!live) return;
    let on = true;
    void myProfileTier().then((p) => {
      if (!on) return;
      setAdmin(p.admin);
      void refresh(p.admin);
    });
    return () => { on = false; };
  }, [live]);

  const listed = (cards ?? []).filter((c) => c.listed);
  const queue = (cards ?? []).filter((c) => !c.listed && c.review !== "rejected");
  const rejected = (cards ?? []).filter((c) => !c.listed && c.review === "rejected");

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn" onClick={() => navigate("#/studio")}>{t("yourStudio")}</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg">
        <span className="fd-kicker">UI Kit Maker</span>
        <h1>{t("cgTitle")}</h1>
        <p className="fd-pricing__sub">{t("cgSub")}</p>

        {!live ? (
          <section className="fd-studentcard"><p>Community isn't available on this deployment.</p></section>
        ) : err ? (
          <section className="fd-studentcard"><p className="fd-pricing__err">{err}</p></section>
        ) : cards === null ? (
          <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Loading the gallery…</p></section>
        ) : (
          <>
            {admin && queue.length > 0 && (
              <>
                <div className="cg-secline">Curation queue — public kits waiting for a spot <button className="fd-review__refresh" disabled={loading} onClick={() => void refresh(admin)}><RefreshCw size={13} strokeWidth={2.2} /> Refresh</button></div>
                <div className="cg-grid">{queue.map((c) => <Card key={c.id} card={c} admin={admin} onChanged={() => void refresh(admin)} />)}</div>
              </>
            )}
            {admin && rejected.length > 0 && (
              <details className="cg-rejected">
                <summary>Rejected — {rejected.length} · kept out of the queue; restore or delete</summary>
                <div className="cg-grid">{rejected.map((c) => <Card key={c.id} card={c} admin={admin} onChanged={() => void refresh(admin)} />)}</div>
              </details>
            )}
            {listed.length === 0 ? (
              <section className="fd-studentcard">
                <p>The gallery is warming up — the first community kits land here once curated.
                Build something, then hit <b>Save kit</b> in the editor's top bar: free and
                student kits join the curation queue automatically, and Pro kits join when
                you share them.</p>
                <p><button className="fd-pricing__cta" onClick={() => navigate("#/app")}>Open the generator</button></p>
              </section>
            ) : (
              <div className="cg-grid">{listed.map((c) => <Card key={c.id} card={c} admin={admin} onChanged={() => void refresh(admin)} />)}</div>
            )}
          </>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
