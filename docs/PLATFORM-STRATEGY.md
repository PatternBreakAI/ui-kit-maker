# PatternBreak: suite strategy proposal

Drafted 2026-08-08 at the owner's request ("think of PatternBreak like
Adobe and these apps like Photoshop and Illustrator… propose something
with meta thinking so we can strategize"). Part 1 is the proposal;
Part 2 is a self-contained brief written to paste into ChatGPT for an
outside opinion.

## Part 1 — Proposal

### What we already are (the part most companies have to retrofit)

The codebase is already shaped like a suite, four layers deep:

1. **One engine** — the vector renderer every surface speaks (buttons,
   kits, splash type; extrusion, gloss, shine, patterns, glints, all of
   it). New capability lands once, every app inherits it.
2. **One bench** — shared controls (sliders, toggles, dials, font
   picker, sash) with a frozen API, so apps feel identical in the hand.
3. **One desk** — account, entitlements, export guard, cloud presets.
4. **Thin apps on top** — UI Kit Maker proved it; Splash Text re-proved
   it: a purpose-built surface over the shared core is weeks of work,
   not months, and carries every past innovation forward for free.

That is Adobe's actual architecture (one imaging core under Photoshop,
one vector core under Illustrator, Creative Cloud as glue) — built here
from day one instead of retrofitted over decades.

### The two models on the table

- **A. Distinct apps, shared spine (Adobe/Creative Cloud).** Each app
  has its own name, front door, and muscle memory. The "platform" is
  invisible plumbing: one account, one subscription, one asset library.
- **B. One big platform with apps inside (Canva/Figma).** A single
  workspace; tools are modes of it.

The owner's instinct — B is confusing, and only justified by asset
sharing — matches how the market splits: B wins when the unit of work is
one document many tools touch; A wins when each app produces its own
kind of artifact and users identify with the tool ("I'm a Photoshop
person"). Our artifacts are distinct (a UI kit; a type lockup; next, an
overlay, an emblem, a thumbnail), and our users are game-adjacent makers
who bond with tools. That points at A.

### Recommendation: A on the surface, B in the plumbing

- **Apps stay distinct products** with their own names, front doors and
  memorable URLs (uikitmaker.com stays; Splash Text gets its own door
  when it leaves the lab). Each app is its own acquisition channel —
  its own SEO story, its own "I found this cool tool" share.
- **One account, one yearly subscription, all apps.** Every app added
  makes the same subscription objectively sexier without new pricing
  SKUs. Free tier per app funnels in; the paywall (exports, caps) is
  the same desk-layer gate everywhere.
- **The library is the glue, boards are where it shows.** Kits, splash
  lockups, styles, patterns, palettes, fonts — one asset system, every
  app reads and writes it, and boards are the canvas where assets from
  different apps meet (drop your Splash lockup onto the board next to
  your kit's buttons). This is the one place the "platform" is visible,
  and it's the reason the suite beats five point-tools.
- **A hub, not a mega-app.** patternbreak.com = launcher + library +
  account. It never tries to be a canvas; it routes you to apps and
  holds what you made.
- **Looks become a first-class asset.** The owner's note — "hard candy
  is pretty much nailed, now it's creating variations" — generalizes:
  every app's presets/styles are the same shaped thing (a look over the
  shared engine). One cloud preset system across apps (already agreed
  with the app session), which later opens the community/marketplace
  door: publishing looks, remixing looks, seasonal drops.

### Sequencing

1. Finish Splash to full type parity (in motion) — it's the proof that
   app #2 is cheap and feels native to the family.
2. Extract the shared chrome both apps now duplicate (sash, floater,
   stage chips) into the bench — makes app #3 cheaper still.
3. App #3 from the existing shortlist (Stream Kit / Emblem Maker /
   Thumbnail Text) — pick the one with the strongest standalone search
   demand, since each app is a funnel.
4. Hub + unified library when there are three artifact types to hold.

### Risks to watch

- **Brand spread**: many small apps can read as a grab-bag. Mitigate
  with one visual language (the bench already enforces it) and "by
  PatternBreak" on every door.
- **Maintenance surface**: more apps, more UI to keep true. Mitigate
  with the frozen shared API discipline (already in force) and shared
  chrome extraction.
- **Cross-app confusion**: never make users guess which app to open.
  Each app states its artifact in one line on its front door.

## Part 2 — Brief for ChatGPT (paste from here down)

---

I run a small design-tools company called **PatternBreak** and want your
strategic opinion on how to structure it as a multi-app suite. Please
read the context, then answer the questions at the end.

**What exists today.** Our first product, **UI Kit Maker**
(uikitmaker.com), is a live web app that generates game-style UI kits —
buttons, panels, full component sets — as clean vector SVG/PNG, with a
distinctive "hard candy" look users can crank with deep controls
(bevels, extrusion, gloss, patterns, lighting, per-state designs). It
runs on a yearly subscription with a free tier; paid gates exports and
caps. Our second product, **Splash Text**, is in private lab: a
typography app for super over-illustrated words (retro-sticker
lettering, poster fit, liquid 60s line distortion, ink shine
highlights) aimed at thumbnails, stream titles, posters.

**The strategic asset.** Both apps run on ONE shared vector engine and
ONE shared control library. A new app is a thin surface over that core
— weeks of work, not months — and every engine improvement lands in all
apps at once. Candidate future apps: stream overlay kits, gaming
emblems/logos, YouTube thumbnail text. Our audience is game developers,
streamers, and game-adjacent creators.

**The question.** Two models: (A) Adobe-style — distinct apps with
their own names and websites, glued by one account, one subscription,
and a shared asset library (your saved kits/lockups/styles usable
across apps, meeting on shared "boards"); or (B) Canva-style — one big
platform website with the tools inside it. My instinct: B is confusing
unless asset-sharing is the core experience, and distinct apps are
easier to love and to market ("the more apps under one yearly
subscription, the sexier it is") — but I want pushback if I'm wrong.

**Questions for you:**

1. Which model would you pick for a company at our stage, and why?
   Where does my instinct break down?
2. How would you package and price it — one all-apps subscription, per
   app, or tiers? What do comparable companies' numbers suggest?
3. Naming architecture: company brand vs. app brands — how prominent
   should "PatternBreak" be on each app? Should apps share a naming
   scheme (e.g. "* Maker")?
4. Sequencing: with limited capacity, is the next move a third app, a
   unifying hub/library, or deepening the two existing apps? What
   signal should decide?
5. A "looks/styles" system (one-click complete visual treatments) runs
   across all apps and could become community-publishable. Is a
   marketplace/community layer a distraction now or a moat worth
   starting early?
6. What are the top three risks you see in the multi-app route for a
   tiny team, and the cheapest mitigations?

Be direct and opinionated; number your answers to match the questions.

---
