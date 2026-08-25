import { MarketingFooter } from "@/marketing/chrome";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import "@/styles/pricing.css";
import logoUrl from "../../pb-logo.png";

/* #/unity — the Unity bridge, told on the site (dev field report: "the
   ReadMe is very comprehensive! Something to this effect on the site itself
   could be handy... there's a lot of value in the Unity integration that
   doesn't come through as concretely on the site").

   Same honesty rule as every marketing surface: each claim here describes
   what the export actually does today — it is the README deck's story,
   retold before the download instead of after it. */

const SECTIONS: { k: string; title: string; body: string[] }[] = [
  {
    k: "drag",
    title: "One drag, working UI",
    body: [
      "Unzip the kit and drag the folder into your project's Assets. That's the whole install: the bundled importer runs on its own, builds the sprites, fonts and prefabs, and files everything under your kit's name.",
      "Drop a ButtonPrimary prefab into a Canvas and press Play — hover glow, press sink, designed pressed and disabled states, styled live text. Nothing to wire.",
    ],
  },
  {
    k: "inside",
    title: "What's in the zip",
    body: [
      "Nine-sliced sprites for every component, with the kit's own hover, pressed and disabled states beside each base — Sprite Swap arrives pre-wired on the buttons.",
      "Working prefabs for the interactive pieces: buttons, progress, a touch joystick, the health globe (its fill is honest: 0 is empty, 1 is the brim), checkbox and radio as both designed pieces AND real Unity Toggles, and a wired ScrollView with a kit-dressed scrollbar.",
      "Your kit's typeface, licensed and ready, plus a baked display face: every glyph rendered by the kit engine — pattern, gloss, glints — assembled into a font Unity types with.",
      "A manifest that describes all of it, so the importer can rebuild precisely — and so can your tools.",
    ],
  },
  {
    k: "text",
    title: "Live text that wears the whole treatment",
    body: [
      "Labels aren't screenshots. One real TextMeshPro text lays out the word; shadow, stroke and glint layers repaint that same geometry in the kit's inks — they cannot drift, lag or wrap differently, because there is nothing separate to sync.",
      "The glint sweep is drawn live across the whole word at your kit's light angle, with your blend mode — retype the label and the streak still crosses it as one piece.",
    ],
  },
  {
    k: "restyle",
    title: "Re-export = restyle in place",
    body: [
      "Change the kit on uikitmaker.com — new colors, new silhouette, new type — and export again. Drop the new folder over the old one: every placed button, bar and panel in your scenes re-dresses where it stands. Layouts, scripts and references stay untouched.",
      "Your own edits are respected on the way through: slice guides you've hand-tuned stay yours.",
    ],
  },
  {
    k: "prelit",
    title: "Pre-lit art, honest pixels",
    body: [
      "The kit is pre-lit: gloss sweeps, bevels, specular hits and extrusion shading are computed by the kit engine and painted into the pixels. Scene lights pass through UI by design, so what you built is exactly what ships — on every device.",
      "Want the light to move? That's the Lighting dial in the generator: change the angle, re-export, and every gloss and bevel re-renders from the new direction.",
    ],
  },
  {
    k: "nine",
    title: "Nine-slice, without the shear",
    body: [
      "Sliced sprites stretch only their middles, so corners stay crisp at any size. Patterned faces can also ship stretch-safe: frame, tiled pattern and gloss as separate layers, so a wide dialog keeps its pattern's rhythm and one clean gloss sweep.",
      "Glows and shadows aren't baked into the geometry — they're composed in-engine from the kit's own aura sprites, which is why buttons sit correctly in layout groups.",
    ],
  },
];

export function UnityPage() {
  usePageScroll();
  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>Open the generator</button>
          <button className="cg-navbtn" onClick={() => navigate("#/faq")}>FAQ</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg faq unitypage">
        <h1>Your kit, in Unity</h1>
        <p className="fd-pricing__sub">
          The export isn't a folder of images — it's a working install. Here's exactly what lands in your
          project and why re-exporting never breaks a scene.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.k} className="unitysec">
            <h2>{s.title}</h2>
            {s.body.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}

        <section className="unitysec unitycta">
          <h2>Try it on your own kit</h2>
          <p>
            Build a kit, open its kit page, and the Unity ZIP is the big export button — every component,
            on the paid plans. Want to feel the import before you commit? A free account includes the{" "}
            <b>Unity test kit</b>: a stock kit ZIP, the same for everyone and yours to ship, that
            proves the whole pipeline — prefabs, scenes, gauges, live text — in your project first.
          </p>
          <div className="unitybtns">
            <button className="fd-primary" onClick={() => navigate("#/app")}>Open the generator</button>
            <button className="cg-navbtn" onClick={() => navigate("#/faq")}>Questions? The FAQ</button>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
