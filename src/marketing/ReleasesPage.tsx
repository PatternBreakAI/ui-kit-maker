import { MarketingFooter } from "@/marketing/chrome";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import logoUrl from "../../pb-logo.png";

/* #/releases — public release notes, from the maker to the world. Same
   honesty rule as every marketing surface (docs/output-claims.md): every
   line here describes something a visitor can actually do on the live
   site today, except the clearly-labeled "In the lab" section. Newest
   release sits on top; future rounds prepend an entry. */

type RelItem = { h: string; p: string };
type Release = { date: string; title: string; items: RelItem[]; lab?: RelItem[] };

const RELEASES: Release[] = [
  {
    date: "August 2026",
    title: "The Board grows up",
    items: [
      {
        h: "Transform handles, the way designers are used to",
        p: "Select any piece on the Board and scale it from any of the four corners, or from the top-center and bottom-center handlebars. Whichever handle you grab, the opposite side stays planted — the piece grows toward your pointer, and one undo takes back the whole gesture.",
      },
      {
        h: "Selection boxes that tell the truth",
        p: "Boxes now hug the artwork itself — including warped type stamps, where the box wraps the actual lettering instead of the empty air around it. What you see selected is what you're moving.",
      },
      {
        h: "The Board learns your shortcuts",
        p: "Shift-click selects several pieces; drag any of them and the group moves together, or grab a corner of the group frame and scale them all at once about the opposite corner. Arrow keys nudge (Shift strides), an align rack lines up edges and centers and distributes spacing evenly, ⌘C/⌘V carries pieces between boards, clicking empty space lets go of the selection, and one button exports every board at full resolution.",
      },
      {
        h: "Bars stretch the way they will in your game",
        p: "Sliders, progress bars, segmented meters and the VS health bar grow new side handles: pull an edge and the track re-renders wider — caps, knob and inset stay true instead of distorting, exactly like a nine-slice in an engine. Corners still scale the whole piece proportionally.",
      },
      {
        h: "Blank panels: pull the edges, scale the corners",
        p: "The blank panel now works in two modes. Grab any edge — left, right, top or bottom — and it stretches nine-slice style to the exact footprint your screen needs, the border and rim holding their designed weight. And because every pull is a fresh render, the gloss, pattern and grain are redrawn at the new size, never smeared. Corners still scale the whole panel proportionally, and Width and Height dials in the rail take exact numbers.",
      },
      {
        h: "Any board piece can become an asset",
        p: "Rework a piece on the Board — its words, its value, its look — and save it to your assets under its own name. The master component stays untouched, so a Small tab turned BACK button still leaves you a clean master for the FORWARD one.",
      },
      {
        h: "Boards duplicate, and they travel",
        p: "One click copies a whole artboard — pieces, backdrop and darkroom dials — a running start for the next shell menu in the same family. And the settings file now carries your boards too: export it on one machine, import it on another, and the document arrives whole, backdrops included.",
      },
      {
        h: "A center scrim in the darkroom",
        p: "The vignette's inverse: subtly darken the middle of the frame — the move games make behind menus so the UI pops. It stacks with the vignette and the overlay washes, or works alone, and it exports with the board.",
      },
      {
        h: "Layering, guides, and a center cross",
        p: "Bring pieces forward and back (⌘] and ⌘[ too), toggle safe-area guides on any artboard, and find a new dashed center cross marking the exact middle of the stage — vertically and horizontally — for quick composition checks.",
      },
      {
        h: "Sparkles that always land on the lettering",
        p: "The starry glint styles now read the shape of your actual letters and place every star on a stroke. No more sparkles floating in the gaps — any word, any font.",
      },
      {
        h: "Warped type keeps your font everywhere",
        p: "Arc, flag and bulge stamps render in your kit's real typeface on the stage and in every export — and they're easy to grab and move.",
      },
      {
        h: "Boards arrive in Unity as ready scenes",
        p: "A Pro engine export now carries each artboard into Unity as a built scene: full-resolution background, pieces anchored so they hold their corners at any screen size, and your per-copy words already on the labels.",
      },
      {
        h: "Motion is now user-initiated",
        p: "The animated pieces — damage numbers, radar pulses, the weapon wheel's comets — used to loop in the background on every surface. Now they hold a settled frame while you design, wake under your pointer on the kit page, and run free only in Play mode. Dozens of idle timelines went silent, and PNG exports always capture the clean resting pose.",
      },
      {
        h: "The Board bends to your hand",
        p: "Boards zoom with the toolbar, the side trays stretch to your liking (within safe rails), every piece has its own opacity dial, and the ghost joystick overlay is placeable straight from the assets tray.",
      },
      {
        h: "A cleaner slate, and backdrops left in peace",
        p: "A board's Clear button now clears the whole stage — pieces and background together, and it tells you exactly what's going before it goes. And the empty-stage hint no longer prints itself over a backdrop you just uploaded; it waits for a truly bare board.",
      },
      {
        h: "Faster, steadier, and honest about it",
        p: "A rare freeze on boards with background images was hunted down and fixed at the root. The app also gained a safe mode (add ?safe to the address) with one-click diagnostics, so if anything ever misbehaves on your machine, support starts from evidence instead of guesswork.",
      },
    ],
    lab: [
      {
        h: "A scene library for the Board",
        p: "Eighty-two painted game backdrops — searchable by mood, genre and color — one click from dressing your board, with the darkroom dials working on top.",
      },
      {
        h: "Illustrated icon components",
        p: "A settings gear, a trophy, and a gift box — each one the illustrated object itself wearing your kit's full material treatment, no box around it.",
      },
    ],
  },
];

export function ReleasesPage() {
  usePageScroll();
  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>Open the generator</button>
          <button className="cg-navbtn" onClick={() => navigate("#/community")}>Community Gallery</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg faq rel">
        <h1>Release notes</h1>
        <p className="fd-pricing__sub">
          What&rsquo;s new on UI Kit Maker. We ship in small, frequent rounds — the freshest changes sit at the top.
        </p>

        {RELEASES.map((r) => (
          <section key={r.date} className="rel-entry">
            <div className="rel-datebar">
              <span className="rel-date">{r.date}</span>
              <span className="rel-title">{r.title}</span>
            </div>
            {r.items.map((it) => (
              <article key={it.h} className="rel-item">
                <h3>{it.h}</h3>
                <p>{it.p}</p>
              </article>
            ))}
            {r.lab && r.lab.length > 0 && (
              <>
                <div className="rel-labhead">In the lab — landing soon</div>
                {r.lab.map((it) => (
                  <article key={it.h} className="rel-item rel-item--lab">
                    <h3>{it.h}</h3>
                    <p>{it.p}</p>
                  </article>
                ))}
              </>
            )}
          </section>
        ))}

        <p className="rel-contact">
          Questions, ideas, or something misbehaving? Write to{" "}
          <a href="mailto:info@uikitmaker.com">info@uikitmaker.com</a> — a human reads it.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
