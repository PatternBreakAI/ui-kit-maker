import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { cloudConfig } from "@/generator/cloud";
import { publicProfile, avatarUrl, type CommunityCard } from "@/generator/community";
import { Card } from "./CommunityPage";

/* #/u/<handle> — a maker's public face: avatar, name, their curated kits,
   and the sum of the hearts those kits have collected. Only LISTED public
   kits appear — the profile shows exactly what the gallery shows, so a
   maker's page can never leak something curation hasn't put on stage. */

export function UserPage({ handle }: { handle: string }) {
  const live = !!cloudConfig();
  const [state, setState] = useState<{
    profile: { id: string; handle: string | null; display_name: string | null; avatar_path: string | null } | null;
    cards: CommunityCard[]; error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!live) return;
    let on = true;
    void publicProfile(handle).then((r) => { if (on) setState(r); });
    return () => { on = false; };
  }, [live, handle]);

  const p = state?.profile ?? null;
  const cards = state?.cards ?? [];
  const hearts = cards.reduce((n, c) => n + c.likes, 0);
  const av = avatarUrl(p?.avatar_path ?? null);

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/community")}>← Community Gallery</button>
        <span className="fd-pricing__mark"><i className="fd-pricing__gem" aria-hidden="true" />PatternBreak</span>
      </header>

      <main className="cg">
        {!live ? (
          <section className="fd-studentcard"><p>Community isn't available on this deployment.</p></section>
        ) : state === null ? (
          <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Loading…</p></section>
        ) : state.error ? (
          <section className="fd-studentcard"><p className="fd-pricing__err">{state.error}</p></section>
        ) : !p ? (
          <section className="fd-studentcard">
            <p>No maker goes by <b>@{handle}</b> — they may have changed their handle.</p>
            <p><button className="fd-linkbtn" onClick={() => navigate("#/community")}>Back to the gallery</button></p>
          </section>
        ) : (
          <>
            <div className="cg-profile">
              {av ? <img className="cg-profile__avatar" src={av} alt="" /> : <span className="cg-profile__avatar cg-profile__avatar--empty" aria-hidden="true" />}
              <div>
                <h1 className="cg-profile__name">{p.display_name || `@${p.handle}`}</h1>
                <p className="cg-profile__line">
                  @{p.handle}
                  <span className="cg-profile__stat">{cards.length} {cards.length === 1 ? "kit" : "kits"} in the gallery</span>
                  <span className="cg-profile__stat"><Heart size={12} strokeWidth={2.4} /> {hearts}</span>
                </p>
              </div>
            </div>
            {cards.length === 0 ? (
              <section className="fd-studentcard"><p>Nothing on stage yet — their first curated kit will appear here.</p></section>
            ) : (
              <div className="cg-grid">{cards.map((c) => <Card key={c.id} card={c} admin={false} onChanged={() => {}} />)}</div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
