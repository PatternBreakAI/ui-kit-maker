import { MarketingFooter } from "@/marketing/chrome";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { usePageScroll } from "@/shell/usePageScroll";
import logoUrl from "../../pb-logo.png";

/* #/support — the support desk (the owner, 2026-09-30, filling in the Unity
   Publisher Portal: "need a customer support section for the uikitmaker.com
   website"). This is the address the Asset Store listing, the publisher
   profile and the zip's own docs point at. Same honesty rule as every
   marketing surface (docs/output-claims.md): every answer below describes
   what the product and the Unity importer actually do today, in the same
   words the importer's Console and the zip's QuickStart use, so a customer
   reads one story in three places. Deeper questions live in the FAQ; this
   page is the short road from "something looks wrong" to "here is what to
   do, and here is where to write". */

const SUPPORT_EMAIL = "info@uikitmaker.com";

const FIRST_CHECKS: [string, string][] = [
  ["Read the Console receipt", "Every import prints one line that starts with \"UI Kit Maker\": what was imported, what changed, and the export build it came from. Most answers are in that line."],
  ["Run Kit Status", "Tools > PatternBreak > Kit Status prints whether the kit imported, which build it is, and whether the fonts came along. Copy that line into your message if you write to us."],
  ["Re-import over the same folder", "Download the kit again and extract it over Assets/UIKitMaker. Sprites, prefabs and fonts restyle in place, and words you typed in Unity are kept. Nothing needs deleting first."],
  ["Regenerate or rebuild", "Tools > PatternBreak > Regenerate Example Prefabs rebuilds the generated prefabs from the current sprites. Rebuild Kit Playground Scene builds a fresh Playground. Prefabs you created, renamed or moved are never touched."],
];

type Qa = { q: string; a: string[] };

const UNITY_QA: Qa[] = [
  {
    q: "The Console says the kit skipped writing a file inside a read-only Unity package.",
    a: [
      "Harmless. Unity keeps the packages it installs in a read-only cache and warns if anything there changes. When something in the editor marks one of those files as changed and a save tries to write it, the kit keeps that one write out of the package and says so, once per file per session. The kit itself only ever writes under Assets/. Nothing needs doing.",
    ],
  },
  {
    q: "Labels came in plain, or the Console says no Font Asset is assigned.",
    a: [
      "The kit's text runs on TextMeshPro. On a project without the TMP Essential Resources the import asks Unity to add them and finishes the build one pass later; if the labels are still plain, run Tools > PatternBreak > Reapply Kit Import Settings.",
      "If the zip was dropped in while the editor was in Play mode, the build waits for Play to stop and then finishes by itself. Press the square Stop button and watch the Console.",
    ],
  },
  {
    q: "Hover and press do nothing while I test in the editor.",
    a: [
      "That is a Unity editor rule, not the kit: with the Input System, pointer events reach the Game view only while it has focus. Click the game once and try again. A real build never has this gate. If you want it gone in the editor, set Edit > Project Settings > Input System Package > Editor Input Behavior In Play Mode to All Device Input Always Goes To Game View.",
    ],
  },
  {
    q: "Buttons ignore the mouse in my own scene.",
    a: [
      "Check for exactly one EventSystem in the scene, and that its input module matches the project's Active Input Handling (the Input System module for the new Input System, the Standalone module for the legacy one). The generated Playground carries the right one; a scene you built by hand may carry two, or the wrong one.",
    ],
  },
  {
    q: "My Playground looks out of date after a re-import.",
    a: [
      "The Playground builds once and is then yours, so a kit update never rewrites it. Tools > PatternBreak > Rebuild Kit Playground Scene builds a fresh one from the current prefabs.",
    ],
  },
  {
    q: "Where are the board scenes?",
    a: [
      "Screens you compose on the app's Board ship as ready scenes when you export your own kit from uikitmaker.com. The kit sold on the Unity Asset Store ships the components only, with no board scenes and none of a maker's uploaded pictures, so it stays a clean starting point for your game.",
    ],
  },
  {
    q: "Something failed to compile, or a script is missing.",
    a: [
      "The kit's scripts live in Assets/UIKitMaker/Editor and Assets/UIKitMaker/Runtime and must exist once. A second copy of the kit anywhere in the project (a drop into an open subfolder, an unmerged folder on macOS) makes Unity report the same classes twice. Keep one UIKitMaker folder, let Unity recompile, and if the Console still shows an error, send us its exact text.",
    ],
  },
];

const APP_QA: Qa[] = [
  {
    q: "Where does my work save?",
    a: ["In your browser as you work, and in your account when you save a project. The FAQ explains what survives clearing browser data and how projects, sharing and the community gallery fit together."],
  },
  {
    q: "What can I export, and what licence does it carry?",
    a: ["Exports of your own design ship with the paid plans, and every paid export embeds a licence file naming your account. The FAQ lists the formats plan by plan and what the commercial and education licences allow."],
  },
  {
    q: "Billing, cancelling, the student rate",
    a: ["Your plan lives on your account page, and billing is managed there. The FAQ's Plans and billing section covers the student rate and how to cancel."],
  },
  {
    q: "Something renders oddly in my browser",
    a: ["We test current Chrome, Edge, Firefox and Safari. If a piece looks wrong in one of them, that is a bug we want: write to us with the browser, its version and a screenshot."],
  },
];

export function SupportPage() {
  usePageScroll();
  const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("UI Kit Maker support")}`;
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

      <main className="cg faq how sup">
        <h1>Support</h1>
        <p className="fd-pricing__sub">
          Help with UI Kit Maker and the Unity kits. The quick checks and answers below cover most of what we hear;
          for anything else, write to us and a person replies.
        </p>

        <section className="sup-grid">
          <div className="sup-card sup-card--mail">
            <span className="how-kicker">Write to us</span>
            <h3><a href={mail}>{SUPPORT_EMAIL}</a></h3>
            <p>A person reads every message and replies. To get you an answer in one round, include:</p>
            <ul>
              <li>the export build: the Console prints <code>[export build …]</code> on import, and the kit page footer shows <code>build …</code></li>
              <li>your Unity version, and the exact Console text if something failed</li>
              <li>a screenshot of what you see, and what you expected instead</li>
            </ul>
          </div>
          <div className="sup-card">
            <span className="how-kicker">Bought the kit on the Unity Asset Store?</span>
            <h3>Same desk, same address</h3>
            <p>
              Inside the zip, <b>Documentation/QuickStart.md</b> is the five-minute start and <b>UNITY-README.md</b> the
              full walkthrough. Tools &gt; PatternBreak &gt; Kit Status tells you which build you have.
            </p>
            <p>
              Want the kit in your own colors, silhouette and type? Every kit can be restyled at{" "}
              <a className="how-inline" href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }}>uikitmaker.com</a> and
              re-exported; the new zip extracts over the same folder and heals in place.
            </p>
          </div>
        </section>

        <section className="how-steps sup-steps">
          <h2>First checks in Unity</h2>
          <ol>
            {FIRST_CHECKS.map(([h, p], i) => (
              <li key={h}>
                <span className="how-stepnum">{i + 1}</span>
                <div><b>{h}</b><p>{p}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="sup-qa">
          <h2>Unity questions</h2>
          {UNITY_QA.map((item) => (
            <div key={item.q} className="sup-item">
              <h3>{item.q}</h3>
              {item.a.map((p) => <p key={p.slice(0, 32)}>{p}</p>)}
            </div>
          ))}
        </section>

        <section className="sup-qa">
          <h2>The app, your account, your exports</h2>
          {APP_QA.map((item) => (
            <div key={item.q} className="sup-item">
              <h3>{item.q}</h3>
              {item.a.map((p) => <p key={p.slice(0, 32)}>{p}</p>)}
            </div>
          ))}
          <p className="sup-more">
            The <a className="how-inline" href="#/faq">FAQ</a> goes deeper, control by control.
          </p>
        </section>

        <nav className="sup-links" aria-label="More pages">
          <a href="#/faq">FAQ</a>
          <a href="#/how">How it works</a>
          <a href="#/unity">The Unity bridge</a>
          <a href="#/releases">Release notes</a>
          <a href="#/terms">Terms of Use</a>
          <a href="#/privacy">Privacy Policy</a>
        </nav>

        <p className="rel-contact">
          Still stuck? <a href={mail}>{SUPPORT_EMAIL}</a>. Tell us what you did, what you saw and what you expected; a human reads it.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
