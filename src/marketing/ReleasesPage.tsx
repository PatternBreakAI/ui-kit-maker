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
    title: "Copies with a mind of their own",
    items: [
      {
        h: "Duplicate any piece",
        p: "Every component grows a Duplicate action: name the copy, file it under a classification, and restyle it as hard as you like — the original never moves, and kit-wide restyles never touch your copy. Duplicates live in their own \"Your components\" chapter on the kit page, place on boards as live pieces, ride every save and sync, and arrive in Unity scenes with their exact design, states and words.",
      },
      {
        h: "The ghost joystick takes its own ink",
        p: "The translucent overlay stick gets a Ghost color well — and editing it from its card now lands you on the actual ghost in the editor, recoloring live, instead of the solid pad.",
      },
      {
        h: "Controls answer from every state",
        p: "A subtle editor flaw dropped certain kit-wide edits — idle motion among them — whenever a non-Default state was selected. Every dial now lands no matter which state you're standing on, and invisible depth-effect geometry no longer steals clicks from small pieces like checkboxes and radios.",
      },
      {
        h: "The material diagram tells your truth",
        p: "The exploded-view diagram's token now mirrors your real Icon button — your silhouette, your styling, your swapped glyph — updating live as you edit.",
      },
    ],
  },
  {
    date: "August 2026",
    title: "What you design is what ships",
    items: [
      {
        h: "Unity prefabs match the app, to the letter",
        p: "A kit's Unity prefabs now bake at the exact proportions the app draws — words in place — and every label lands at the app's exact size and seat, even on decorated shapes that deliberately sit their type off-center. Resize a prefab and the type scales with the geometry instead of drifting.",
      },
      {
        h: "Statement buttons keep their pose",
        p: "Stretch a dramatic silhouette on a board — a long tail, a deep bevel — and the exported scene ships an engine render at that exact pose: nothing cropped, hover and press wearing their designed skins, the label seated where the app seated it, and the click still sinks. Pieces no longer vanish when the scene plays, and video backdrops arrive with a poster frame.",
      },
      {
        h: "A resting shimmer, two ways",
        p: "Idle motion joins the kit: a wipe shine that sweeps each face and rests, and an edge shine that runs a spark around the silhouette. Turn them on kit-wide or per piece, tune the rhythm and blend, and both ride into Unity as removable components. Type stamps mask the sweep to the letterforms themselves — light moves through the words, never over their box.",
      },
      {
        h: "The segmented selector reads on any background",
        p: "Its off cells grow their own dials — how present the quiet options are, from a whisper to full strength, and whether they keep the kit's full type styling or drop to plain ink — so the unselected words stay readable on loud backdrops without touching the selected cell.",
      },
      {
        h: "Badges edit what rollover shows",
        p: "The badge gains a Rollover card in the editor, so the count face's hover look — the state you actually see on rollover — is finally editable. And an awarded badge that's been clicked off now rests on its count instead of trading faces under the pointer.",
      },
      {
        h: "Claims celebrate wherever the words say so",
        p: "The white-hot claim celebration now fires on any piece whose visible words say CLAIM — however the label was set — in the app and in exported Unity scenes and prefabs alike.",
      },
      {
        h: "Draw your own silhouette, with guide rails",
        p: "Registered makers can download an SVG starter template for silhouette drawing: end-zone shading, a calm middle, plain-language rules to delete before saving, and a sample shape to replace. Icons also nudge three times farther, for compositions that pin a glyph hard to one edge.",
      },
      {
        h: "Diagrams that tell the truth",
        p: "The slicing bench's stretch diagram now measures its guides from your actual silhouette instead of assuming a centered one — an off-center design shows off-center guides, because that's what your button really does. And the export's guide explains when to reach for a ready scene piece versus a prefab.",
      },
    ],
  },
  {
    date: "August 2026",
    title: "The menagerie",
    items: [
      {
        h: "Five more hand-drawn patterns",
        p: "Zebra, Leopard, Dirt, Grime and Día de los Muertos join the shelf — animal pelts, weathered grunge, and a sugar-skull lace with every petal and eye socket drawn by hand. Like the rest of the drawn wave, they recolor to your ink, tile seamlessly at any scale, and ride into every export, Unity and web alike.",
      },
    ],
  },
  {
    date: "August 2026",
    title: "The hand-drawn wave",
    items: [
      {
        h: "Four patterns, drawn by hand",
        p: "Tiger Stripes, Camo · Angular, Camo · Classic and Flames join the pattern menu — drawn in the studio as real vector tiles, not generated. The engine keeps the drawings exactly as they left the pen: they recolor to your ink, tile seamlessly at any scale, and ride into every export. They retire the generated Soft Camouflage and Camo Shards — kits that used those keep rendering camouflage, upgraded to the drawn pair.",
      },
      {
        h: "A deeper pattern shelf",
        p: "Circuit Board, Hex Cells, Crystal Facets, Speed Lines, Topographic Contours, Chainmail, Lightning Bolts (plus a friendlier Pop variant), Pixel Blocks, Anime Burst and Snowflakes fill out the menu — every one a seamless tile that stays crisp at any size, on the face or the extruded wall. And the pattern Scale dial now reaches 260, so a single motif can sweep across a whole panel.",
      },
      {
        h: "Your kit as a web page",
        p: "The HTML download grew up: a Pro export now packs your entire kit — every piece, every state — as crisp 2× images with a stylesheet that wires hover, press and disabled for you, fluid nine-slice variants for the stretchy families, a showcase page to browse it all offline, and your licence in the box. Drop the folder into any site or web game and your kit just works.",
      },
      {
        h: "Find any piece by name",
        p: "The kit page grew a search box: type a few letters and jump straight to any component, instead of scrolling the shelf to find the one speedometer.",
      },
      {
        h: "Little moments, wired",
        p: "The gift box erupts in a white flash the instant it's claimed — in the app and in exported Unity scenes alike. Inventory tiles select with a click and a highlight ring that travels to Unity too, and the Board only grabs a piece when you click its actual artwork, so stacked pieces stop stealing each other's clicks.",
      },
      {
        h: "The app forgives a bad save",
        p: "If anything saved in your browser ever gets mangled — an interrupted save, an ancient format — the editor now sets that one value aside and opens anyway, instead of going dark. And on a genuinely bad day, the error screen says what actually happened and offers a safe mode that starts fresh without touching your saved work.",
      },
    ],
  },
  {
    date: "August 2026",
    title: "Scenes to the pixel",
    items: [
      {
        h: "Settings screens that play",
        p: "A Pro engine export's slider and switch arrive as real, wired Unity controls: drag the knob and it glides along your styled track; click the switch and the candy knob slides across and trades its ON/OFF dot. The values you posed on the Board arrive live too — scenes open with every slider at its mark and every switch already thrown.",
      },
      {
        h: "Knobs land exactly where you drew them",
        p: "We measured the export against the app, pixel by pixel, and retired a subtle seating offset that could float a knob and its fill a few pixels off the bar on deep-relief kits. Every slider knob, fill and switch knob now sits on its track to the pixel, at any extrusion depth — and the slider's fill is clipped at the value line the way the app draws it, so the mercury's gradient never compresses. Measured, not eyeballed.",
      },
      {
        h: "The fire button carries your arsenal",
        p: "Swipe across the fire button in a scene and the center glyph cycles through your weapons — drawn in your kit's own inks, outline, glow and all — exactly the carousel the Board previews. Tap, and it deals.",
      },
      {
        h: "Patterns keep their rhythm when pieces stretch",
        p: "Stretch a patterned piece wide on a board and the Unity scene now swaps in a tiled face: the frame stretches, the pattern tiles at its designed scale, and the gloss stays one clean sweep. No more smeared texture on wide buttons.",
      },
      {
        h: "Your words keep their size",
        p: "Labels placed on boards used to arrive in scenes a shade smaller than the Board showed. They now land at exactly the size you set — the export carries both the prefab's fitted size and the scene's true one, and uses the right one in the right place.",
      },
      {
        h: "Fresh Unity projects, first try",
        p: "The importer now stands up cleanly in a brand-new project: its scripts live behind their own assembly definitions (a stray second copy of the kit can no longer take the editor down with it), the input-system reference resolves itself, and the scene builder no longer trips over an unsaved Untitled scene. When anything is skipped, the Console says exactly what and why — and every import announces its build stamp, so you always know which zip you're running.",
      },
      {
        h: "Boards click back",
        p: "Difficulty rows select like the radio groups they are, countdowns tick m:ss, damage numbers pop on cue, and the minimap sweeps its radar behind a clearly-labeled demo script you can delete. The gloss highlight also rides into every prefab as its own overlay layer, drawn last — just like the app draws it.",
      },
      {
        h: "A reading voice for lists",
        p: "Friend rows, chat lines and other list surfaces stop borrowing a hardcoded face: they follow your kit's List font, and a new List ink control in Typography gives them their own color apart from the display voice.",
      },
      {
        h: "Pointer tags point both ways",
        p: "The Pointer Tag silhouette gains its mirror twin — Pointer Tag · Reverse — a true pixel mirror with the text box swapped to match, so BACK and NEXT can bracket a screen with matching geometry.",
      },
    ],
  },
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
        h: "Backdrops choose how they meet the frame",
        p: "A new Fill / Fit switch in the darkroom for image backgrounds. Fill covers the board edge to edge, cropping the overflow — today's look. Fit shows the whole scene, nothing cropped, floating over a softly blurred fill of itself — the cure for art whose aspect isn't the board's, like a portrait scene on a modern phone stage. Exports render whichever you chose, exactly as the stage shows it.",
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
