import { MarketingFooter } from "@/marketing/chrome";
import { useMemo, useState, type ReactNode } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { t, currentLocale } from "@/shell/i18n";
import { usePageScroll } from "@/shell/usePageScroll";
import logoUrl from "../../pb-logo.png";

/* #/faq — the answer desk. Searchable, data-driven, and honest: every
   statement here must agree with docs/output-claims.md, the same rule the
   marketing pages live by. Roadmap answers stay deliberately non-specific
   (owner call) — cadence promises broke enough products already.

   Answers are mini-markdown strings so search can see the full text:
   paragraphs split on blank lines, `**bold**`, `[label](url)` links
   (external links open new tabs), and `· ` lines render as list rows. */

type FaqItem = { q: string; a: string };
type FaqCat = { id: string; name: string; items: FaqItem[] };

const FAQ: FaqCat[] = [
  {
    id: "product",
    name: "The product",
    items: [
      {
        q: "What is UI Kit Maker?",
        a: "A game-UI kit builder that runs entirely in your browser. You shape one material — colors, silhouette, structure, lighting, type — and every component in the kit (115+ of them: buttons, gauges, bars, slots, dialogs, HUD pieces) is drawn live from that one recipe. Change the recipe, the whole kit follows. What you export is real vector art and engine-ready files, not screenshots.",
      },
      {
        q: "Do I need to know how to code or design?",
        a: "No. Everything is sliders, swatches and pickers, and the defaults are already a finished look. If you can adjust a character creator, you can build a kit. The **ⓘ buttons** and **Dissect** mode teach you the vocabulary as you go.",
      },
      {
        q: "What's the difference between a preset and a kit?",
        a: "A **preset** is a style recipe — the full set of choices that make a look (colors, shape, gloss, type, everything). A **kit** is that recipe applied across every component, plus your own edits: labels, icons, per-piece overrides, sizes. You start from a preset, make it yours, and the result is your kit.",
      },
      {
        q: "Does it work on my phone?",
        a: "The editor is desktop-only for now — game UI work wants a big canvas and a pointer. The rest of the site (community, pricing, your account) works everywhere, and shared kit links open on mobile as viewers.",
      },
      {
        q: "Which browsers are supported?",
        a: "Current Chrome, Edge, Firefox and Safari. The renderer leans on real SVG filters, and we test the look across all four — if something renders oddly in your browser, tell us; that's a bug, not your fault.",
      },
      {
        q: "The site speaks my language on the homepage. Does the editor?",
        a: "The language you pick on the homepage follows you into the app — the top bar and core actions are translated in seven languages today (English, 中文, Français, Español, Italiano, Deutsch, 日本語), and more of the editor's surfaces are being translated in waves. Long-form content like the design lessons is English-first for now.",
      },
    ],
  },
  {
    id: "controls",
    name: "The controls, section by section",
    items: [
      {
        q: "Global — states and their dials",
        a: "The four chips at the top (Default, Hover, Pressed, Disabled) choose which **state** you're editing; the artwork and every control below follow the selection. Per state:\n\n· **Brightness** — lightens or darkens the whole piece for that state.\n· **Saturation** — drains or enriches the color; negative reads as \"disabled grey\".\n· **Glow** — the outer aura strength. Hover's glow also drives the dropdown menu's row highlight.\n· **Lift** — vertical travel in pixels; negative raises (hover), positive presses down.\n· **Opacity** — overall transparency, mostly for Disabled.\n\nEdits you make with a non-default state selected fork that state's design, so Hover can be a different color or shape entirely — that's how pressed-state re-skins work.",
      },
      {
        q: "Presets — starter styles and packs",
        a: "One click applies a complete style recipe to the whole kit. Starter presets ship with the product; **preset packs** are curated drops that appear here for Pro members. Applying a preset replaces the style but never your content — labels, icons and per-piece text stay yours. Your canvas color is also left alone; the stage belongs to you.",
      },
      {
        q: "Silhouette — the shape of things",
        a: "Chooses the outline family the material is poured into — pill, slab, chamfer, blade and friends. The silhouette drives how corners, caps and nine-slice stretch zones behave in exports. Components keep their own functional geometry (a gauge stays round); the silhouette shapes the shell-based pieces.",
      },
      {
        q: "Bringing your own silhouette — the import spec",
        a: "You can import your own outline (**Silhouette → Import silhouette (SVG)**) and the whole material system pours into it — walls, rim, gloss, glow, states, exports, all of it. The engine derives every inner layer from that one outline, so the cleaner the path, the better everything downstream looks.\n\n**The file**\n\n· **One closed, filled path.** No strokes, groups, transforms, or images — a stroke has no interior to fill, and a transform moves the geometry away from where the parser reads it.\n· **Boolean-union overlapping shapes before export.** Counter-holes are fine; overlapping siblings are not.\n· Plain SVG out of any vector tool. Nothing else in the file matters.\n\n**The geometry**\n\n· **Draw around a wide landscape box, about 200 × 100**, with the outline touching all four edges. The generator normalizes from those bounds, so a shape floating inside its canvas arrives smaller than you drew it.\n· **Stay near that 2:1 proportion.** Every component stretches the shape to its own size — a tall or square outline distorts hardest when it lands on a wide button.\n· **Keep decorative caps inside the outer 30% of the width.** That band is what nine-slice protects; detail in the middle smears when a piece stretches long.\n· **Prefer bezier curves over arc segments.** Arcs distort under non-uniform stretch in ways beziers don't.\n\nIf a shape imports but its inner wall looks faceted rather than smooth, that's the offset stage, not your file — organic outlines with deep concave curves are the hard case and are being improved.",
      },
      {
        q: "Color — the five roles",
        a: "The kit's palette is five **roles**, not fifty swatches:\n\n· **Bevel** — the shell and wall; the structural color everything else derives from.\n· **Glow** — auras, lit segments, active accents.\n· **Highlight** — gloss and specular events.\n· **Shadow** — grounding and depth.\n· **Inner Fill** — the candy face inside the wall.\n\nChange a role and every component using it updates. The **component-only** picker under the roles recolors just the focused piece — never the shell system. Leave a role empty and it derives itself from Bevel, which is why one color can drive a whole kit.",
      },
      {
        q: "Structure — walls, rims, and depth",
        a: "The physical construction of the shell:\n\n· **Wall width** — how thick the frame is around the face.\n· **No wall** — the face fills the whole silhouette; good for soft, flat-candy looks.\n· **Rim width / Rim brightness** — the thin lit edge where the wall meets the world.\n· **Inner edge** — the crease between wall and face.\n· **Edge width** — the outer contour line's weight.\n· **Extrusion depth** — how far the solid body drops below the face; 0 is flat, higher reads as thick plastic.",
      },
      {
        q: "Surface — the face itself",
        a: "· **Light / Dark** mode — whether the face is brighter or darker than the shell.\n· **Face contrast** — how strongly the face's gradient moves from top to bottom.\n· **Gradient mid** — where the gradient's center sits; low = heavy bottom, high = lit top.\n· **Pattern** — a face texture (stripes, checks, dots and more) with **Scale**, **Angle** and **Opacity**; tone-on-tone from the shell color so it never fights your palette.\n· **Micro texture / Grain** — fine noise that keeps big flat areas from banding.",
      },
      {
        q: "Bars & fills — the liquid inside meters",
        a: "Styling for the fill material inside progress bars, XP bars, health and mana:\n\n· **Second gradient** — a two-stop blend along the fill.\n· **Fill glow** — makes the liquid emit.\n· **Inner shadow** — seats the fill into its track.\n\nThese layer on top of the role colors, so a red health bar and a blue mana bar can share one material.",
      },
      {
        q: "Lighting — one sun for the whole kit",
        a: "· **Angle** — where the light comes from; gloss, specular, emboss and the icon effects all follow it, which is why the kit feels physically consistent.\n· **Highlight / Lowlight** — the strength of the lit and shaded ends.\n· **Tint** — an optional color cast on the light itself (warm sunset, cold lab).",
      },
      {
        q: "Gloss & Reflections — the shine",
        a: "· **Gloss height / bottom / Curvature** — the broad curved sheen across the face: how tall it is, where it ends, how much it bows.\n· **Gloss opacity** — its strength.\n· **Specular** — the crisp reflective event riding the silhouette's edge; several modes from a subtle line to a hard studio flash.\n· **Bloom** — bounce light pooling low on the face, like light caught inside candy.\n\nThe shine sweep you see on the canvas is a preview toggle (the star in the top bar), not baked into exports.",
      },
      {
        q: "Glow — lit from within",
        a: "The inner glow is a soft wash rising from the unlit side of the face — the \"backlit plastic\" effect. One opacity dial; its color comes from the Glow role.",
      },
      {
        q: "Depth & Shadow — how it sits on the ground",
        a: "· **Distance / Blur / Opacity** — the cast shadow dropping from the piece.\n· **Contact** — the tight dark pool right where the body meets the ground; this is what makes a piece feel placed rather than pasted.\n\nEngine exports strip these (your game's lighting owns shadows there); image exports keep them.",
      },
      {
        q: "Typography — the type system",
        a: "· **Font** — curated game-friendly faces, plus **custom font upload** (your own licensed files).\n· **Size, Weight, Italic, Tracking, Case** — the basics; Case forces upper/lower/as-typed.\n· **Fill** — solid or gradient, with opacity.\n· **Outline** — a stroke around the letterforms, one or two colors.\n· **Shadow** — offset, blur, opacity.\n· **Emboss / Deboss** — carved relief that follows the master Lighting angle; positive raises, negative sinks.\n· **Glow** — a luminous halo around the glyphs.\n· **Pattern fill** — any face pattern inside the letters.\n· **Highlight glints** — crisp vector sparkles riding the letterforms.\n\nEvery text-bearing component follows this one treatment; per-piece text color overrides live in Component content.",
      },
      {
        q: "Icons — one treatment for every glyph",
        a: "At the bottom of Typography: **Size**, **Weight** (stroke), **Opacity**, **Rotation**, and color that inherits the type until you set your own. The **Shadow / Glow / Emboss** chips apply the icon's own effects, independent of the text's. Swapping which icon a specific component shows happens in **Component content** on the Kit page — the treatment here stays kit-wide.",
      },
      {
        q: "Component content — labels, slots and per-piece edits",
        a: "Focus any component (or tap its ✎) and this section shows what that piece can say:\n\n· **Free text slots** — labels, values, option rows; type and the art updates live.\n· **Choice slots** — curated swaps like the speedometer's MPH ↔ KPH. Dynamic readouts (the big 108) stay engine-driven on purpose — the ⓘ card explains each one.\n· **Icon swap** — give one piece its own glyph, or remove it.\n\nIf something isn't editable, clicking it tells you why and points at the nearest thing that is — no dead clicks.",
      },
      {
        q: "What are the ⓘ buttons and Dissect mode?",
        a: "**ⓘ** on a focused component opens its card: what the piece is, what's editable, and a short design lesson — real history with dates, named games, and links out to sources. **Dissect** (the microscope in the canvas toolbar) turns your cursor into an inspector: click any part of the art and the panel scrolls to the exact control that edits it, lit up so you can't miss it.",
      },
      {
        q: "Boards — staging on real screens",
        a: "The Board view stages components over background art — upload a screenshot or concept, arrange pieces on it, and judge the kit where it will actually live. Each artboard keeps its own background with opacity, blur and an overlay tint layer to make components pop against busy art.",
      },
    ],
  },
  {
    id: "saving",
    name: "Saving your work",
    items: [
      {
        q: "Where does my work save?",
        a: "Everything you touch saves to your browser automatically as you edit — no save button needed for the work-in-progress. Sign in (free) and the same work syncs to your account and follows you across devices. The cloud icon in the top bar tells you which of those is true right now.",
      },
      {
        q: "What happens if I clear my browser data?",
        a: "Signed out: browser-only work is erased with it — that's why the top bar shows an amber \"this browser only\" chip until you sign in. Signed in: your account copy is safe; a fresh browser pulls it back down.",
      },
      {
        q: "How do I save a kit as a project?",
        a: "**Save kit** in the editor's top bar. Name it, save, done — the kit joins your library, openable from any device. Free and Student kits save public and may be curated into the Community Gallery; Pro kits save private with an eye toggle per kit (and a \"share by default\" switch if you want it).",
      },
      {
        q: "What do the eye icons on my projects mean?",
        a: "The open eye means **public**: the kit has a share link anyone can view, and it may be curated into the Community Gallery. The slashed eye means **private**: only you. Click to flip. Making a public kit private again kills its link and removes it from the community.",
      },
      {
        q: "Can I share a kit without publishing it to the community?",
        a: "A public kit's link is view-only and doesn't put it on the gallery by itself — the gallery is curated by hand, so nothing appears there without being picked. If even a link is too public, the **Export settings** file (a small JSON) can be sent directly and imported by anyone.",
      },
      {
        q: "Do my backgrounds travel with my kit?",
        a: "Yes. An uploaded canvas background is stored with your work, rides your projects and share links, and stages your community card. It's downscaled to travel light. One honest note: the instant \"Share kit\" link carries everything inside the link itself, so with a photo it gets very long — project and community links stay short.",
      },
    ],
  },
  {
    id: "exports",
    name: "Exports — what you get today",
    items: [
      {
        q: "What can I export right now?",
        a: "Every export of **your own design** ships with the paid plans (Pro and Student — same formats):\n\n· **PNG** — transparent, up to 4×.\n· **Layered SVG** — real vectors with named groups (shell, face, content, gloss…).\n· **HTML/CSS** — a self-contained live component page.\n· **Game kit** — the components as production files.\n· **Engine ZIP** — atomic transparent PNGs with nine-slice metadata, a manifest, Unity import tooling and Unreal UMG recipes.\n· **Sprite sheet** — the visual catalog.\n\nFree accounts keep two downloads, deliberately: the **settings JSON** (your full recipe, importable back into the app — your work is never locked in) and the free **Unity test kit** (below). Guests export nothing — signing up is where downloads begin.",
      },
      {
        q: "What is the free Unity test kit?",
        a: "A **free stock kit** every registered account can download — one canned, pre-built Unity ZIP (currently the **Brightside** kit), the same fixed artifact for everyone. It is **not your design**, but it is **yours to ship** — commercial projects included; the licence rides inside the ZIP — and it proves the whole import pipeline (prefabs, scenes, gauges, live text) in your engine before you pay anything. Sign in, open your kit page, and it's in the export menu. When you upgrade, the same flow delivers your own kit instead.",
      },
      {
        q: "Will my SVGs look identical in Figma or Illustrator?",
        a: "The geometry, gradients, layer names and live text arrive intact everywhere — that's the point of layered SVG. The soft effects (glows, blurs, grain) are SVG **filters**, and design tools support those only partially: Figma drops them on import, Illustrator keeps most. So: restyle from the layers in your tool, or use the PNG export when you want the rendered look pixel-exact. This is a design-tool limitation, not a broken file.",
      },
      {
        q: "Do the engine files work in Unity / Unreal?",
        a: "The files are engine-standard on purpose: transparent PNGs, nine-slice margins in a plain manifest, pivots, tint flags. Any engine that can show a sprite can use them — that's not a claim about our cleverness, it's what PNG means. The included Unity importer and Unreal UMG recipes are conveniences on top; if your pipeline is unusual, the raw files still import by hand like any asset pack.",
      },
      {
        q: "What licence do my exports carry?",
        a: "Every paid export embeds a licence file naming your account. **Pro** carries the commercial licence: ship in any product, any number of projects, no attribution, no seat limit. **Student** carries the education licence: coursework, portfolio, personal and non-commercial releases — selling what you build needs Pro. Upgrading later re-exports under the new licence.",
      },
      {
        q: "Is there an export limit?",
        a: "There's a quiet per-account rate limit aimed at scripted harvesting, set high enough that a human exporting all day never meets it. If you somehow do, wait a few minutes.",
      },
      {
        q: "Can I import my own SVGs or assets into the editor?",
        a: "You can import **settings files** (recipes) and **custom fonts** today, and upload background art for the canvas and boards. Importing arbitrary SVG artwork as components isn't a current feature.",
      },
    ],
  },
  {
    id: "plans",
    name: "Plans & billing",
    items: [
      {
        q: "What's free, and what does Pro add?",
        a: "Free is the real editor — full kit, cloud saves, unlimited boards, your settings file, your kits join the community, and the stock **Unity test kit** to prove the import pipeline. Exporting your own designs is the paid unlock: **Pro** ($29.99/year) adds every export format — PNG up to 4×, layered SVG, HTML, game kit, engine ZIP — plus every preset pack, private kits, and the commercial licence. **Student/Educator** ($15.99/year) is the same tool as Pro under an education licence.",
      },
      {
        q: "How does the student rate work?",
        a: "You apply with your school email and a student ID; a human reviews it — no domain regex deciding your fate. Your ID document is deleted the moment the decision is made; we keep the decision, not the document. Approval unlocks the student price on your account's checkout.",
      },
      {
        q: "How do I cancel or manage billing?",
        a: "Account → Manage subscription opens the Stripe billing portal — cancel anytime, access runs to the end of the term. No email required, no retention maze.",
      },
    ],
  },
  {
    id: "community",
    name: "Community",
    items: [
      {
        q: "What is the Community Gallery?",
        a: "A curated wall of kits made by users, at [uikitmaker.com/#/community](#/community) — no account needed to browse. Every card is drawn live in your browser from the kit's actual settings by the same engine that made it. **Use this kit** opens any of them to view and remix.",
      },
      {
        q: "How do I get my kit into the gallery?",
        a: "Save it public (free and student kits already are; Pro flips the eye or sets share-by-default), and it enters the curation queue. A human picks what's featured — nothing reaches the front page unreviewed. Getting picked is about a look with a point of view, not follower counts.",
      },
      {
        q: "What are profiles and the studio?",
        a: "Your **studio** ([#/studio](#/studio)) is your own room: picture, display name, handle, links to billing and settings, and all your kits — sortable, openable, deletable. Claiming a handle gives you a **public page** at uikitmaker.com/#/u/yourhandle showing your curated kits and their hearts. Likes exist; comments don't — that's deliberate.",
      },
      {
        q: "Who can see my work?",
        a: "Private kits: only you, always. Public kits: anyone with the link, and possibly the gallery if curated. Free and Student plans save public — that's part of the deal, said plainly at the save moment. Pro keeps kits private by default. Nothing unreviewed ever appears on a public page of this site.",
      },
    ],
  },
  {
    id: "roadmap",
    name: "The roadmap — honestly",
    items: [
      {
        q: "What new presets are coming?",
        a: "Preset packs are made and banked — plural, finished, waiting — and the release machinery (scheduled drops that unlock on their day) is already built and tested. They'll release on a cadence rather than all at once. We're deliberately not announcing themes or dates: when a pack is buyable or included, you'll see it in the product, not in a promise.",
      },
      {
        q: "Will there be other kits beyond the hard-candy look?",
        a: "Yes — the material system was built to pour more than candy. Other material families are on the bench, and the honest answer on when is: after the current kit's polish bar is met. Same rule as the packs: we show finished things.",
      },
      {
        q: "What's next for editing?",
        a: "The near-term arc: text editing directly on the canvas (type on the art, the art responds — a value change can even drive a gauge's needle), ⓘ design lessons for every component with real history and sources, and deeper translations. The slot system that powers per-piece text is live now and growing component by component.",
      },
      {
        q: "What about more export targets?",
        a: "The engine ZIP is deliberately engine-agnostic (standard PNGs + metadata), so most requests are already covered by hand-import. Deeper conveniences for specific engines are on the radar and will be added as demand shows — not promised until they exist. If you have a pipeline that needs something specific, tell us; real requests set the order.",
      },
      {
        q: "Something's missing from this FAQ.",
        a: "Probably true — the product moves fast. The footer's newsletter is the quiet channel for what's new, and every shipped feature shows up in the product itself before we talk about it anywhere.",
      },
    ],
  },
];

/* mini-markdown: paragraphs, `· ` list rows, **bold**, [label](url) */
function renderInline(s: string, key: number) {
  const parts: (string | ReactNode)[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    if (m[1]) parts.push(<b key={`b${key}-${i++}`}>{m[1]}</b>);
    else if (m[3].startsWith("#")) {
      const to = m[3];
      parts.push(<a key={`l${key}-${i++}`} href={to} onClick={(e) => { e.preventDefault(); navigate(to); }}>{m[2]}</a>);
    } else {
      parts.push(<a key={`l${key}-${i++}`} href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

function Answer({ text }: { text: string }) {
  const blocks = text.split("\n\n");
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("· "))) {
          return <ul key={bi} className="faq-list">{lines.map((l, li) => <li key={li}>{renderInline(l.slice(2), bi * 100 + li)}</li>)}</ul>;
        }
        return <p key={bi}>{renderInline(b, bi)}</p>;
      })}
    </>
  );
}

function Item({ item, id, forceOpen }: { item: FaqItem; id: string; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  return (
    <div className={`faq-item${isOpen ? " open" : ""}`} id={id}>
      <button className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        {item.q}
        <ChevronDown size={16} strokeWidth={2.2} className="faq-chev" />
      </button>
      {isOpen && <div className="faq-a"><Answer text={item.a} /></div>}
    </div>
  );
}

export function FaqPage() {
  usePageScroll();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const cats = useMemo(() => {
    if (!needle) return FAQ;
    return FAQ.map((c) => ({
      ...c,
      items: c.items.filter((it) => (it.q + "\n" + it.a).toLowerCase().includes(needle)),
    })).filter((c) => c.items.length > 0);
  }, [needle]);

  const total = cats.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>{t("openGenerator")}</button>
          <button className="cg-navbtn" onClick={() => navigate("#/community")}>Community Gallery</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg faq">
        <h1>{t("faqTitle")}</h1>
        <p className="fd-pricing__sub">
          {t("faqSub")}
          {currentLocale() !== "en" && <><br /><i>{t("faqEnNote")}</i></>}
        </p>

        <div className="faq-search">
          <Search size={16} strokeWidth={2.2} />
          <input value={q} placeholder={t("faqSearch")}
            onChange={(e) => setQ(e.target.value)} aria-label="Search the FAQ" />
          {q && <button className="faq-clear" aria-label="Clear search" onClick={() => setQ("")}><X size={14} strokeWidth={2.4} /></button>}
        </div>

        {needle && (
          <p className="faq-count">{total === 0 ? "Nothing matches — try a shorter word." : total === 1 ? "1 answer" : `${total} answers`}</p>
        )}

        {cats.map((c) => (
          <section key={c.id} className="faq-cat">
            <h2 className="cg-secline">{c.name}</h2>
            {c.items.map((it, i) => (
              <Item key={it.q} item={it} id={`faq-${c.id}-${i}`} forceOpen={!!needle} />
            ))}
          </section>
        ))}
      </main>
      <MarketingFooter />
    </div>
  );
}
