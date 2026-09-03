/* ── The shipped kit's public page: the screens up top, the pitch at the
   bottom ──────────────────────────────────────────────────────────────
   Both blocks render ONLY on a `#/kit/<slug>` route (see
   generator/namedKits) — the app's own Kit page never sees them.

   The screens are the whole point of the page. A visitor who followed a
   store listing has five seconds of patience, so the first thing under
   the fold is the demo screens themselves — LIVE, through the same
   Board stage the owner composed them on (LiveBoardStage → StagePiece →
   LiveArt, in play mode): hover a button and it lights, press it and it
   sinks, toggles flip, bars fill. Not screenshots, and never a
   click-to-load placeholder — the boards wake themselves one frame at a
   time so the page is alive at rest without a single interaction. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LiveBoardStage, boardStageSize } from "./Board";
import { lookArtOf, starterArt } from "./Panel";
import { tightenSvg } from "@/marketing/engine";
import { ensureFont } from "@/generator/fonts";
import { presetById } from "@/generator/model";
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

/** The demo screens, at the top of the shipped kit's page.
 *  `onReady` fires once every screen is awake — the Kit page holds its
 *  generating curtain (and its own chapter boot) until then, because on
 *  THIS page the screens are the headline and the book is the appendix. */
export function KitScreens({ kit, onReady }: { kit: NamedKitDef; onReady?: () => void }) {
  const screens = namedKitScreens(kit);
  const count = namedKitPieceCount(kit);
  /* Waking: one board per frame, in reading order. Eight live stages
     (a hundred-odd rendered pieces) committed in ONE task would hold the
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
        Every screen above is running the real components. Hover one, press it, drag a slider.
        Nothing here is a screenshot; the whole kit is below.
      </p>
    </section>
  );
}

/* ── The looks wall ───────────────────────────────────────────────────
   The closing argument, and the one claim on this page that cannot be
   faked: the SAME component, drawn by the SAME engine, wearing this
   kit's material and then seven of the shipped starters. Every tile is
   a live render made in the visitor's browser while they look at it, so
   there is nothing here to photograph, mock up or overstate. It is also
   the honest answer to what the tool is for, which a paragraph of copy
   cannot be.

   The art is the app's own preview dressing (lookArtOf / starterArt in
   Panel), so a look reads here exactly as it reads in the Looks rack and
   exactly as it lands when clicked.

   COST. This block sits under the entire kit book, so it must never
   compete with the demo screens at the top of the page. It draws nothing
   at all until the visitor is near it (the Deferred grammar from the Kit
   page), then wakes ONE TILE PER FRAME (the KitScreens grammar), asking
   for each look's typeface as its tile lands. A visitor who never
   scrolls this far pays nothing for it. */
/* Seven starters beside this kit's own material. Chosen for the widest
   spread the rack offers — seven different silhouettes (maze pill, fight
   HUD, cutline, explorer, pill, chunky, round) over seven unrelated
   palettes — so the wall reads as range at a glance rather than as one
   idea recoloured.
   They also all happen to wear a face the site SELF-HOSTS, which is why
   they are these seven and not another seven: this block is the closing
   argument on the page a store listing links to, and a wall of letterforms
   quietly falling back to Inter would undercut the exact claim it makes.
   ensureFont still runs for each of them, so nothing here depends on that
   staying true. */
const LOOKS_WALL = ["citrus-pop", "neon-versus", "obsidian-ember", "deep-ocean", "grape-jelly", "nope-yep", "bubble-pop"];

function LooksWall({ kit }: { kit: NamedKitDef }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [art, setArt] = useState<string[]>([]);
  const tiles = useMemo(
    () => [{ id: "", name: kit.name, here: true }, ...LOOKS_WALL.map((id) => ({ id, name: presetById(id).name, here: false }))],
    [kit.name],
  );
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "500px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near || art.length >= tiles.length) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => {
      const t = tiles[art.length];
      let svg = "";
      try {
        /* the kit's OWN tile reads the live document (getState, not a
           subscription: this page is read-only, and a subscription would
           redraw the whole wall on any unrelated store touch) */
        const cfg = useGen.getState().cfg;
        svg = tightenSvg(t.here ? lookArtOf(cfg) : starterArt(t.id), 20);
        // ask for this look's face as its tile lands, one per frame — the
        // inline SVG text repaints itself when the bytes arrive, and the
        // fitted widths are already right (baked metrics, not the live face)
        const face = t.here ? cfg.type.font : presetById(t.id).font;
        if (face) ensureFont(face);
      } catch { /* a look that will not draw simply leaves its tile empty */ }
      setArt((a) => [...a, svg]);
    }));
    return () => cancelAnimationFrame(r);
  }, [near, art.length, tiles]);
  return (
    <div className="kv-looks" ref={host}>
      <div className="kv-lookgrid">
        {tiles.map((t, i) => (
          <figure className={`kv-look${t.here ? " kv-look--here" : ""}`} key={t.here ? "@this" : t.id}>
            <div className="kv-lookart">
              {art[i]
                ? <div className="kv-looksvg" dangerouslySetInnerHTML={{ __html: art[i] }} />
                : <i className="kv-lookwake" aria-hidden="true" />}
            </div>
            <figcaption>{t.name}{t.here && <i>this page</i>}</figcaption>
          </figure>
        ))}
      </div>
      {/* every word here is something the wall above is already showing —
          the states and the screens have their own proof further up */}
      <p className="kv-note kv-looknote">
        One component, eight looks, all drawn in your browser just now. Shape, material and
        type move together, so {kit.name} is one turn of the dials and so is everything
        beside it.
      </p>
    </div>
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
        <h2 className="kv-title">{kit.name} was drawn by the generator on this page. Every piece of it.</h2>
      </div>
      {/* the argument, in art rather than adjectives (owner: the promo
          "should be heavy on visuals") */}
      <LooksWall kit={kit} />
      {/* the store line, given the top of the block — it is the one thing
          a visitor from the listing might be looking for */}
      <div className="kv-store">
        <div className="kv-storetext">
          {/* the heading tells the truth about the listing's state: it
              only says AVAILABLE once there is a listing to point at */}
          <h3>{kit.storeUrl ? "Available on the Unity Asset Store" : "Coming to the Unity Asset Store"}</h3>
          <p>{kit.name} ships as drop-in Unity assets: nine-sliced sprites, wired prefabs, live text. The whole kit restyles in place on re-import.</p>
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
      {/* the two doors, as one row: the wall above has already made the
          case, so this is a place to go rather than another paragraph */}
      <div className="kv-promoact">
        <a className="kv-btn kv-btn--main kv-btn--big" href="#/app">Open the generator</a>
        <button className="kv-btn kv-btn--big" onClick={openEditor}>Edit {kit.name} live</button>
        {/* every OTHER kit we ship, if we ship any — nothing renders while
            Brightside is the only one, and no other storefront ever
            appears in this list (see the store-policy note above) */}
        {others.map((o) => (
          <a className="kv-btn kv-btn--big" key={o.slug} href={`#/kit/${o.slug}`}>{o.name}</a>
        ))}
      </div>
    </section>
  );
}
