import { MarketingFooter } from "@/marketing/chrome";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import logoUrl from "../../pb-logo.png";

/* #/how — the living manual. What UI Kit Maker does, why it's different,
   and how to drive it — with real screenshots of the real product (shot
   in-app, never mocked). Same honesty rule as every marketing surface
   (docs/output-claims.md): every line describes something a visitor can
   do on the live site today. This page GROWS: new features add a block
   to HOW_TOURS or a step to HOW_STEPS; the changelog itself lives at
   #/releases. We say what the engine achieves, never how — the recipe
   stays in the kitchen. */

type Tour = { img: string; alt: string; kicker: string; h: string; points: string[] };

const HOW_TOURS: Tour[] = [
  {
    img: "/how/master.webp",
    alt: "The editor: one master component on a playable canvas, with state cards and style presets",
    kicker: "The editor",
    h: "Design one master: everything follows",
    points: [
      "Every control is a slider, swatch or picker: silhouette, color roles, structure, lighting, pattern, type. No prompts, no drawing skills required.",
      "The canvas is playable. Hover and press your button and it responds exactly like it will in your game, across Default, Hover, Pressed and Disabled.",
      "Style scopes let edits flow to the whole kit, one component group, or a single piece; your call, and one undo takes any of it back.",
      "Stuck for a starting point? Apply a Look, or roll the randomizer until something makes you grin.",
    ],
  },
  {
    img: "/how/kit.webp",
    alt: "The Kit page: a named design system with a five-layer exploded material diagram",
    kicker: "The Kit",
    h: "One recipe becomes a whole design system",
    points: [
      "Your master's recipe fans out to well over a hundred components (buttons, gauges, bars, slots, dialogs, HUD pieces), drawn live, all in the same material.",
      "The kit reads like a real design-system page: foundations, components, build parts and screen patterns, in two sizes, with an accessibility score.",
      "Change the recipe and the entire kit follows. Edit any single piece alone and it keeps your override while the rest stays on the master.",
    ],
  },
  {
    img: "/how/board.webp",
    alt: "The Board: menu buttons staged over a tavern backdrop with darkroom controls",
    kicker: "The Board",
    h: "Stage real screens, not lonely buttons",
    points: [
      "Artboards in 16:9 and mobile. Click pieces in, drag them around, scale from any corner, nudge with the arrow keys, align a selection, and copy/paste between boards.",
      "Dress the scene: backdrops with darkroom dials (opacity, blur, saturation, vignette, a center scrim), plus type stamps that carry your kit's full lettering.",
      "Safe-area guides and a center cross keep compositions honest. Everything exports as full-resolution PNGs, board by board or all at once.",
    ],
  },
  {
    img: "/how/export.webp",
    alt: "The export menu: sprite sheets, SVG, PNG, HTML, and the Unity kit",
    kicker: "Exports",
    h: "It lands in the tools you already use",
    points: [
      "Sprite sheets and PNGs for any engine, real vector SVG for your design tools, HTML for the web.",
      "The Unity export is a working kit, not a folder of images: components arrive as prefabs with states wired, nine-slice set, and your boards as built scenes.",
      "What you export is yours to ship and sell in any game or product. One line the license draws: the kits themselves can't be resold as asset packs.",
    ],
  },
];

const HOW_STEPS: [string, string][] = [
  ["Open the generator", "It runs in your browser: nothing to install, and you can try it without an account."],
  ["Find a look", "Apply a Look, roll the randomizer, or start tuning from the default. The canvas responds live."],
  ["Make it yours", "Colors, silhouette, structure, type, pattern, then check all four states with a hover and a press."],
  ["Walk the kit", "Open The Kit to see the whole system wearing your material. Edit any piece alone if it needs its own voice."],
  ["Stage a screen", "On The Board, drop pieces over a backdrop and feel the game. Export the mock as a PNG to share."],
  ["Take it home", "Export sprite sheets, SVG, HTML, or the Unity kit with your boards as ready scenes."],
];

export function HowPage() {
  usePageScroll();
  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>Open the generator</button>
          <button className="cg-navbtn" onClick={() => navigate("#/releases")}>Release notes</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg faq how">
        <h1>How it works</h1>
        <p className="fd-pricing__sub">
          The living manual: what UI Kit Maker does, why it&rsquo;s different, and how to drive it.
          It grows as the product does; the changelog lives in the <a className="how-inline" href="#/releases">release notes</a>.
        </p>

        <section className="how-why">
          <h2>Why this is different</h2>
          <p>
            <b>No AI. No templates. No gray areas.</b> Every pixel here is drawn by a deterministic
            design engine from your settings. Nothing is scraped, nothing is generated &ldquo;in the
            style of&rdquo; someone else, and the same settings produce the same kit every single time.
            That determinism is the whole trick: because one engine draws everything, your buttons,
            gauges, dialogs and HUD pieces are <em>guaranteed</em> to belong together, a consistency
            image generators can&rsquo;t promise. And because the work is yours, it&rsquo;s yours to
            ship, sell, and call your own.
          </p>
        </section>

        {HOW_TOURS.map((t, i) => (
          <section key={t.kicker} className={`how-tour${i % 2 ? " how-tour--flip" : ""}`}>
            <figure className="how-shot">
              <img src={t.img} alt={t.alt} loading="lazy" decoding="async" />
            </figure>
            <div className="how-copy">
              <span className="how-kicker">{t.kicker}</span>
              <h3>{t.h}</h3>
              <ul>
                {t.points.map((p) => <li key={p.slice(0, 24)}>{p}</li>)}
              </ul>
            </div>
          </section>
        ))}

        <section className="how-steps">
          <h2>Your first kit, in six moves</h2>
          <ol>
            {HOW_STEPS.map(([h, p], i) => (
              <li key={h}>
                <span className="how-stepnum">{i + 1}</span>
                <div><b>{h}</b><p>{p}</p></div>
              </li>
            ))}
          </ol>
          <div className="how-cta">
            <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>Open the generator · free to try</button>
          </div>
        </section>

        <p className="rel-contact">
          Questions this page doesn&rsquo;t answer? The <a href="#/faq">FAQ</a> goes deeper, control by control,
          or write to <a href="mailto:info@uikitmaker.com">info@uikitmaker.com</a>; a human reads it.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
