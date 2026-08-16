import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Package, Wand2, X } from "lucide-react";
import { useGen, hydrate, healStateIconPins } from "@/generator/store";
import { promoIsLive, promoIsNew, type PromoDef } from "@/generator/cloud";
import type { GenConfig } from "@/generator/model";
import { renderBevel } from "@/generator/bevel";
import { tightenSvg } from "@/marketing/engine";
import { ensureDocFonts } from "@/generator/fonts";
import { isAssetRef, resolveBgAsset } from "@/generator/assets";
import { navigate } from "@/shell/router";
import { stillSmil } from "./LiveArt";

/* ── Spotlight — "promo areas like adobe" (owner mandate) ─────────────
   A slim shelf of promo cards in the gallery's cg-card language: engine-
   rendered art, kicker / title / one-line body / ONE quiet CTA. House
   culture from the Tutor system applies verbatim: every card has a real
   destination, nothing is a modal, nothing blocks input, and nothing
   animates unbidden — art holds a still until the card is hovered.
   Max three cards show; "rotating" the lineup means the admin changes
   it on the Spotlight desk, never an autoplaying carousel. */

/** A card's engine art from its frozen design recipe — heroSnapshotArt's
 *  exact quiet treatment (own label, no icon, glow zeroed, viewBox
 *  tightened). A recipe that won't render returns null and the card
 *  falls back to its kind plate. */
export function promoArt(cfg: Record<string, unknown>): string | null {
  try {
    const pc = healStateIconPins(hydrate(structuredClone(cfg)) as GenConfig);
    pc.icon.show = false;
    for (const s of Object.values(pc.states)) s.glow = 0;
    return tightenSvg(renderBevel(pc, "default"), 20);
  } catch {
    return null;
  }
}

/** The default kicker when a card doesn't bring its own words. */
export function promoKicker(p: PromoDef): string {
  return p.kicker?.trim() || (p.kind === "kit" ? "New kit" : p.kind === "tool" ? "New tool" : "How-to");
}

/* every internal route Spotlight is allowed to speak — pages via
   navigate(), Panel sections via the smart-help move */
export function promoGo(route: string): void {
  if (route.startsWith("editor:")) {
    const sec = route.slice("editor:".length);
    navigate("#/app");
    useGen.getState().setPhase("master");
    // the smart-help move: clear any panel search (it display:nones the
    // target), force the section open, then land on it with a glow beat
    useGen.setState((st) => ({ panelQuery: "", open: { ...st.open, [sec]: true } }));
    window.setTimeout(() => {
      const el = document.querySelector(`[data-sec="${sec}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("sh-glow");
      window.setTimeout(() => el.classList.remove("sh-glow"), 1600);
    }, 90);
    return;
  }
  navigate(route);
}

const KIND_ICON = {
  kit: <Package size={30} strokeWidth={1.7} />,
  tool: <Wand2 size={30} strokeWidth={1.7} />,
  howto: <BookOpen size={30} strokeWidth={1.7} />,
} as const;

/** One Spotlight card — the same markup on the kit page and the admin
 *  desk's live preview, so the desk can never lie about the render. */
export function PromoCardView({ p, seen, admin, onDismiss, onGo }: {
  p: PromoDef;
  seen?: boolean;
  /** admins see staged/held state chips in place */
  admin?: boolean;
  /** absent = no dismiss control (the desk preview, the Looks tile) */
  onDismiss?: () => void;
  /** the desk preview overrides navigation; the shelf routes for real */
  onGo?: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const [hov, setHov] = useState(false);
  // the card speaks its own typefaces — warm them like every other desk
  useEffect(() => {
    if (p.cfg) { try { ensureDocFonts(p.cfg); } catch { /* falls back */ } }
  }, [p.cfg]);
  const art = useMemo(() => (p.cfg ? promoArt(p.cfg) : null), [p.cfg]);
  /* asset:// art rides the durable-assets resolver: vault first, then the
     account's cloud copy — same door as board backdrops */
  const [artUrl, setArtUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!p.artRef || !isAssetRef(p.artRef)) { setArtUrl(null); return; }
    let url: string | null = null;
    let on = true;
    void resolveBgAsset(p.artRef).then((rec) => {
      if (!rec || !on) return;
      url = URL.createObjectURL(rec.blob);
      setArtUrl(url);
    });
    return () => { on = false; if (url) URL.revokeObjectURL(url); };
  }, [p.artRef]);
  // the stillness rule: SMIL loops in the art park until the card wakes
  useEffect(() => { stillSmil(host.current, !hov); }, [hov, art]);
  const isNew = promoIsNew(p);
  const held = p.publishAt && new Date(p.publishAt).getTime() > Date.now();
  return (
    <article ref={host} className={`pspot-card${seen ? " seen" : ""}`}
      onPointerEnter={() => setHov(true)} onPointerLeave={() => setHov(false)}>
      {isNew && <span className="pspot-new">NEW</span>}
      {admin && p.active === false && <span className="pspot-chip">STAGED</span>}
      {admin && p.active !== false && held && <span className="pspot-chip">HELD</span>}
      {onDismiss && (
        <button className="pspot-x" aria-label={`Dismiss “${p.title}”`} title="Seen it — quiet this card"
          onClick={onDismiss}><X size={13} strokeWidth={2.4} /></button>
      )}
      <div className="pspot-art" aria-hidden="true">
        {art ? (
          <span dangerouslySetInnerHTML={{ __html: art }} />
        ) : artUrl ? (
          <img src={artUrl} alt="" />
        ) : (
          <span className="pspot-plate">{KIND_ICON[p.kind]}</span>
        )}
      </div>
      <div className="pspot-meta">
        <span className="pspot-kicker">{promoKicker(p)}</span>
        <b className="pspot-title">{p.title}</b>
        {p.body && <span className="pspot-body">{p.body}</span>}
        <button className="pspot-cta" onClick={() => (onGo ? onGo() : promoGo(p.ctaRoute))}>
          {p.ctaLabel?.trim() || "Take a look"} →
        </button>
      </div>
    </article>
  );
}

/** The kit page's Spotlight strip — under the chapter tabs, above the
 *  hero. Gated by the owner's global switch; admins preview the full
 *  lineup in place (staged rule) with an honest "not live" chip. Per-
 *  card dismissal de-emphasizes and rides cloud sync via promoSeen. */
export function PromoShelf() {
  const promos = useGen((s) => s.promos);
  const promosLive = useGen((s) => s.promosLive);
  const isAdmin = useGen((s) => s.isAdmin);
  const promoSeen = useGen((s) => s.promoSeen);
  const markPromoSeen = useGen((s) => s.markPromoSeen);
  if (!promosLive && !isAdmin) return null;
  const cards = (isAdmin ? promos : promos.filter((p) => promoIsLive(p))).slice(0, 3);
  if (cards.length === 0) return null;
  return (
    <section className="pspot" aria-label="Spotlight — what's new">
      <div className="pspot-head">
        Spotlight
        {isAdmin && !promosLive && <span className="pspot-gatechip">admin preview — not live yet</span>}
      </div>
      <div className="pspot-grid">
        {cards.map((p) => (
          <PromoCardView key={p.id} p={p} admin={isAdmin}
            seen={promoSeen.includes(p.id)} onDismiss={() => markPromoSeen(p.id)} />
        ))}
      </div>
    </section>
  );
}
