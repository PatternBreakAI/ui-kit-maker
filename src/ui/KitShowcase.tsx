/* ── The shipped kit's public page: the screens up top, the pitch at the
   bottom ──────────────────────────────────────────────────────────────
   Both blocks render ONLY on a `#/kit/<slug>` route (see
   generator/namedKits) — the app's own Kit page never sees them.

   The screens are the whole point of the page. A visitor who followed a
   store listing has five seconds of patience, so the first thing under
   the fold is the seven demo screens themselves — LIVE, through the same
   Board stage the owner composed them on (LiveBoardStage → StagePiece →
   LiveArt, in play mode): hover a button and it lights, press it and it
   sinks, toggles flip, bars fill. Not screenshots, and never a
   click-to-load placeholder — the boards wake themselves one frame at a
   time so the page is alive at rest without a single interaction. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LiveBoardStage, boardStageSize } from "./Board";
import { NAMED_KITS, namedKitPieceCount, namedKitScreens, type NamedKitDef, type NamedKitScreen } from "@/generator/namedKits";
import type { BoardDef } from "@/generator/store";
import { useGen } from "@/generator/store";

/** One screen: a device-true frame at the board's own aspect, its live
 *  stage inside, the card copy under it. The frame reserves its exact
 *  height from the first paint (aspect-ratio on the measured box), so a
 *  board waking up later never shifts the row it sits in. */
function ScreenCard({ screen, board, n, live }: {
  screen: NamedKitScreen; board: BoardDef; n: number; live: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [W, H] = boardStageSize(board.aspect);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the frame is the ruler: stage units → measured px, aspect intact
  const fit = w ? w / W : 0;
  return (
    <figure className="kv-card">
      <div className="kv-frame" ref={box} style={{ aspectRatio: `${W} / ${H}` }}>
        {live && fit > 0 ? (
          <LiveBoardStage bd={board} fit={fit} />
        ) : (
          /* the waking frame — a quiet shaped shimmer at the board's exact
             size, never a button the visitor has to find and press */
          <div className="kv-wake" aria-hidden="true">
            <i className="kv-wakeblock kv-wakeblock--bar" />
            <i className="kv-wakeblock kv-wakeblock--hero" />
            <i className="kv-wakeblock kv-wakeblock--foot" />
          </div>
        )}
      </div>
      <figcaption className="kv-cap">
        <b><span className="kv-capnum">{String(n).padStart(2, "0")}</span>{screen.title}</b>
        {screen.caption && <span>{screen.caption}</span>}
      </figcaption>
    </figure>
  );
}

/** The seven demo screens, at the top of the shipped kit's page.
 *  `onReady` fires once every screen is awake — the Kit page holds its
 *  generating curtain (and its own chapter boot) until then, because on
 *  THIS page the screens are the headline and the book is the appendix. */
export function KitScreens({ kit, onReady }: { kit: NamedKitDef; onReady?: () => void }) {
  const screens = namedKitScreens(kit);
  const count = namedKitPieceCount(kit);
  /* Waking: one board per frame, in reading order. Seven live stages
     (ninety-odd rendered pieces) committed in ONE task would hold the
     page's first paint for seconds; one per frame keeps the thread
     breathing between them and lets each screen paint as it lands.
     Nothing waits on a click, and once a board is awake it stays awake.
     (An idle callback was the first cut — but the Kit book's own boot
     chain runs long tasks back to back, so the screens starved behind it
     for eighteen seconds. Frames, and the book waiting its turn, is what
     makes the top of the page alive in about four.) */
  const [awake, setAwake] = useState(1);
  const rung = useRef(false);
  useEffect(() => {
    if (awake >= screens.length) {
      if (!rung.current) { rung.current = true; onReady?.(); }
      return;
    }
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setAwake((n) => n + 1)));
    return () => cancelAnimationFrame(r);
  }, [awake, screens.length, onReady]);
  if (!screens.length) return null;
  return (
    <section className="kv-screens" aria-label={`${kit.name} demo screens`}>
      <header className="kv-head">
        <div>
          <div className="kv-eyebrow">{kit.name} · Demo screens</div>
          <h2 className="kv-title">{kit.lede}</h2>
        </div>
        <p className="kv-facts">
          <span><b>{screens.length}</b> screens</span>
          {/* both numbers are COUNTED off the shipped boards, never claimed */}
          <span><b>{count.placed}</b> kit pieces placed</span>
          <span><b>{count.distinct}</b> distinct components</span>
          <span>{kit.platform}</span>
        </p>
      </header>
      <div className="kv-grid">
        {screens.map(({ screen, board }, i) => (
          <ScreenCard key={board.id ?? screen.board} screen={screen} board={board} n={i + 1} live={i < awake} />
        ))}
      </div>
      <p className="kv-note">
        Every screen above is running the real components — hover one, press it, drag a slider.
        Nothing here is a screenshot; the whole kit is below.
      </p>
    </section>
  );
}

/* ── The promotional block, at the very bottom ────────────────────────
   Our own things only, and short: the page's job is the demo, not the
   pitch. STORE POLICY — this page is what the Unity Asset Store listing
   links to, and Unity's guidelines forbid a listing's link leading to
   pages that promote competing storefronts. So: no link to any other
   marketplace (itch.io, Gumroad, Fab, ArtStation, …) may EVER be added
   here. No badges, no ratings, no invented endorsements. */
export function KitPromo({ kit }: { kit: NamedKitDef }) {
  const others = Object.values(NAMED_KITS).filter((k) => k.slug !== kit.slug);
  const setPhase = useGen((s) => s.setPhase);
  const setParent = useGen((s) => s.setParent);
  const setFocus = useGen((s) => s.setFocus);
  const openEditor = () => {
    setParent("button");
    setFocus(null);
    setPhase("master");
    document.querySelector(".canvas")?.scrollTo({ top: 0 });
  };
  return (
    <section className="kv-promo" aria-label={`About ${kit.name}`}>
      <div className="kv-promohead">
        <div className="kv-eyebrow">Made with UI Kit Maker</div>
        <h2 className="kv-title">{kit.name} was drawn by the generator on this page — every piece of it.</h2>
      </div>
      {/* the store line, given the top of the block — it is the one thing
          a visitor from the listing might be looking for */}
      <div className="kv-store">
        <div className="kv-storetext">
          {/* the heading tells the truth about the listing's state: it
              only says AVAILABLE once there is a listing to point at */}
          <h3>{kit.storeUrl ? "Available on the Unity Asset Store" : "Coming to the Unity Asset Store"}</h3>
          <p>{kit.name} ships as drop-in Unity assets: nine-sliced sprites, wired prefabs, live text — and the whole kit restyles in place on re-import.</p>
        </div>
        <div className="kv-storeact">
          {kit.storeUrl ? (
            <a className="kv-btn kv-btn--main kv-btn--big" href={kit.storeUrl} target="_blank" rel="noopener noreferrer">
              View the listing
            </a>
          ) : (
            /* NO INVENTED URL. The listing address is a single constant —
               storeUrl in generator/namedKits.ts — and until the owner
               pastes it there this stays an honest line rather than a
               button that goes nowhere. Filling the constant turns it
               into the link above with nothing else to change. */
            <span className="kv-soon">The listing link lands here the day it goes live.</span>
          )}
          <a className="kv-fine" href="#/unity">How the Unity kit works →</a>
        </div>
      </div>
      <div className="kv-promogrid">
        <article className="kv-promocard">
          <h3>Make your own</h3>
          <p>Start from a look, turn the dials once, and the whole kit follows — every component, every state, in the same material.</p>
          <a className="kv-btn kv-btn--main" href="#/app">Open the generator</a>
        </article>
        <article className="kv-promocard">
          <h3>Restyle this one</h3>
          <p>{kit.name} is already loaded. Open it in the editor and push the colour, the bevel, the type — the screens above restyle with it.</p>
          <button className="kv-btn" onClick={openEditor}>Edit {kit.name} live</button>
        </article>
        {/* every OTHER kit we ship, if we ship any — nothing renders while
            Brightside is the only one, and no other storefront ever
            appears in this list (see the store-policy note above) */}
        {others.length > 0 && (
          <article className="kv-promocard">
            <h3>Our other kits</h3>
            <p>Same generator, different material — each one live on its own page.</p>
            {others.map((o) => (
              <a className="kv-btn" key={o.slug} href={`#/kit/${o.slug}`}>{o.name}</a>
            ))}
          </article>
        )}
      </div>
    </section>
  );
}
