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
   click-to-load placeholder — the boards wake themselves one idle slice
   at a time so the page is alive at rest without a single interaction. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LiveBoardStage, boardStageSize } from "./Board";
import { namedKitPieceCount, namedKitScreens, type NamedKitDef, type NamedKitScreen } from "@/generator/namedKits";
import type { BoardDef } from "@/generator/store";
import { useGen } from "@/generator/store";

/* one idle-slice callback with a working-anyway timeout (the Board desk's
   own scheduler, kept local so this file pulls nothing extra) */
function idleOnce(fn: () => void): () => void {
  type IdleWin = Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  const w = window as IdleWin;
  let dead = false;
  const run = () => { if (!dead) fn(); };
  const h = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 800 }) : window.setTimeout(run, 120);
  return () => { dead = true; if (w.cancelIdleCallback) w.cancelIdleCallback(h as number); else window.clearTimeout(h as number); };
}

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

/** The seven demo screens, at the top of the shipped kit's page. */
export function KitScreens({ kit }: { kit: NamedKitDef }) {
  const screens = namedKitScreens(kit);
  const count = namedKitPieceCount(kit);
  /* Waking: one board per idle slice, in reading order. Seven live stages
     (ninety-odd rendered pieces) committed in a single task would hold
     the first paint of the whole page; spread over idle slices, the page
     paints immediately and each screen comes up under it. Nothing waits
     on a click, and once a board is awake it stays awake. */
  const [awake, setAwake] = useState(1);
  useEffect(() => {
    if (awake >= screens.length) return;
    return idleOnce(() => setAwake((n) => n + 1));
  }, [awake, screens.length]);
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
          <span><b>{count.placed}</b> pieces placed</span>
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
        <article className="kv-promocard kv-promocard--store">
          <h3>Available on the Unity Asset Store</h3>
          <p>{kit.name} ships as drop-in Unity assets: nine-sliced sprites, wired prefabs, live text — and it restyles in place on re-import.</p>
          {kit.storeUrl ? (
            <a className="kv-btn kv-btn--main" href={kit.storeUrl} target="_blank" rel="noopener noreferrer">
              View on the Unity Asset Store
            </a>
          ) : (
            /* No invented URL: until the owner pastes the listing link
               into namedKits.ts (storeUrl), this stays a plain line
               rather than a dead button. */
            <span className="kv-soon">Listing coming soon</span>
          )}
          <a className="kv-fine" href="#/unity">How the Unity kit works →</a>
        </article>
      </div>
    </section>
  );
}
