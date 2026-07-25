# Editability audit — "Where do I edit this?"
### 2026-07-25 · every component, every word, every icon

The owner's launch gate, verbatim: *"wherever text and icons appear, the
simple question is — where do I edit this?"* This document is the complete
answer for all 115 components, plus the architecture that fixes it.

## Headline

Of 115 components, **15 draw no words or icons at all** (sliders, spinners,
orbs — nothing to edit, correctly). Of the **100 that do show content**:

| | count | meaning |
|---|---|---|
| ✅ Fully editable | **29** | every word/icon it draws can be changed today |
| 🟡 Partially welded | **63** | the main label usually works; something else is welded on |
| 🔒 Welded shut | **8** | shows words/icons, none changeable: listmenu, choicelist, invgrid, stepper, seasontrack, leaderboard, laptimes, telemetry |

The speedo that prompted this audit is the canonical case: "108" is live
data (the value slider drives it) but "MPH" is welded to the artwork, and
the component is on **neither** of the panel's edit allowlists, so focusing
it shows no content fields at all.

## Why it happens — the two root causes

1. **The renderer welds words on.** Most components read `opts.label` for
   their main text, but everything else — unit labels, eyebrows, buttons
   inside composites, whole demo datasets — is a literal string in the
   drawing code. There is no channel to reach it.
2. **The panel gates fields by hand-kept lists.** The "Component content"
   section only appears for ids on two hardcoded allowlists
   (`labelEditable`: 52 ids, `iconSwappable`: 23 ids — Panel.tsx:431-435).
   `subEditable` is `["combo"]` — one component — even though the renderer
   reads `opts.sub` in five. Any component not on a list gets no fields,
   even when its renderer would honor them.

## The recurring weld patterns (what the fix must cover)

1. **Units welded to live readouts** — MPH, RPM ×1000, m, s, XP, %, /2,000, /30.
   No unit channel exists anywhere.
2. **Eyebrows / section headers** — SIDE QUEST, ACHIEVEMENT UNLOCKED,
   INVENTORY, TOP 5, LAP COMPARISON, TELEMETRY · S2, MOVES, FREE/PREMIUM, LV.
3. **CTA words inside composites** — CLAIM/LATER (dialog), JOIN/INVITE
   (friendrow), RELEASE TO EQUIP (weaponwheel), BEST VALUE (pricebtn),
   PIT CHAMPION (nameplate), +/− knobs, × dismiss.
4. **Whole demo datasets** — listmenu rows, choicelist options, questpanel
   objectives, leaderboard drivers, dropdown options, season-track lanes,
   inventory items, telemetry/lap series.
5. **State words that override the editable label** — REDEPLOY/GO (respawn),
   CRIT! (dmgnumber), LIGHTS OUT/GET READY (startlights).
6. **Second text slots with no wiring** — dialoguebox line 2, chatbubble
   name + timestamp, friendrow status, buildqueue qty/time, unitplate stats,
   techcard cost, scorebug scores, nameplate ribbon.
7. **Placeholders** that bypass the type system — input, searchfield.
8. **Icons welded despite a live icon channel** — ~19 components draw stock
   glyphs `opts.icon` cannot reach; and `ICONS_ENABLED=false` kills the icon
   path on the whole button family (primary/secondary/small/ghost/tab/header).

## How editing works today (the surfaces)

- **kitLabels / kitSubs / kitIcons** in the store, persisted, per component.
- Panel "Component content" section — gated by the allowlists above.
- Panel Typography — edits the focused label, or the master button's when
  nothing qualifies.
- Data-row section — its own title/sub model for one component.
- Kit-page ✎ — jumps to the editor with the content section opened… which
  doesn't exist if the component isn't allowlisted (the speedo experience).
- LiveArt's input specimen accepts typing but never persists it.

For click-to-edit: Smart Help already hit-tests the canvas
(`elementsFromPoint` → `closest("[data-part]")`), but only the 8 simple
button-family components stamp their text with `data-part="label"`. All
other text is DOM-anonymous — the three text helpers emit bare `<text>`.

## The fix — one architecture, not 115 patches

**The rule:** every word the renderer draws must come through a named slot.

Each component declares its text slots — `label`, `sub`, `unit`, `eyebrow`,
`value`, `cta1`, `rows[n]`… — with today's literals as the defaults, so
nothing changes visually until a user edits. One slot table per component
becomes the single source of truth that drives all three surfaces:

1. **The renderer** draws slot text and stamps it: `data-slot="unit"` etc.
   (extend the three text helpers; every text node becomes addressable).
   All slot text passes through `esc()` — the audit found two raw
   interpolations (cardback, pack), fixed 2026-07-25.
2. **The panel** generates its content section from the slot table — the
   allowlists are deleted, and "no fields for this component" becomes
   impossible by construction.
3. **The canvas** gets a text MODE, not hover chrome. Owner decisions,
   2026-07-25, superseding the earlier hover-glow sketch:
   - The canvas is for viewing the artwork in all its splendor — no glowing
     text, no always-on affordances. Pristine by default.
   - Editing enters through the **T tool in the tray**: choose T and the
     text becomes editable in place; leave T and the canvas is art again.
   - **Dynamic readouts stay driven, and that is a feature.** In T mode a
     value readout (the speedo's 108) is labeled as dynamic rather than
     dressed as copy; typing a number DRIVES the component — type 88 and
     the needle sweeps there, wanting the redline version is a legitimate
     art direction. The only styling such text needs is its existing
     nudge (lift/textOy).
   - Unit words welded beside readouts (MPH) are copy, and edit normally.
   - Context: a real audience uses this app to make one beautiful image —
     music videos, t-shirts, album covers, games within games. For them,
     an exact number on the dial IS the deliverable.

## Slot kinds — "editable within reason" (owner, 2026-07-25)

Free text everywhere is wrong, and the owner named the principle: **smart
editing**. Every slot declares a kind, and the kind decides what the T tool
offers when you click it:

| Kind | Click behavior | Examples |
|---|---|---|
| **free** | type anything (per-slot max length) | button labels, names, quest titles, chat messages |
| **choice** | pick from a curated list — no free typing, no exceptions | speedo unit: **MPH ↔ KPH only** (owner call, verbatim "no exceptions"). Each unit slot gets its own curated list (tacho, waypoint distance, timers). The list is per-slot data, so widening one later is an edit, not a redesign. |
| **value** | typing a number DRIVES the component — the needle moves | speedo/tacho readouts, scores, counts, timers |
| **locked** | shows a friendly card: what this is, why it's fixed, and what you CAN do instead | structural glyphs (+/− on the stepper), semantic marks (the checkmark), index numbers |

**No dead clicks.** Clicking anything in T mode always answers. Locked text
never fails silently — it explains itself and points at the alternative
("this checkmark is the done-marker; swap the slot icon instead").

## The "i" card — every component explains itself

Owner requirement: each component carries an **ⓘ** affordance that says what
the component is, what's editable on it, and how. The card is GENERATED from
the slot table — name, one-line description, then each slot with its kind
("Label — free text · Unit — MPH or KPH · Readout — driven by the value
slider"). Because it's generated, it can never drift from the truth the way
the old hand-kept allowlists did. Smart Help's part stamps and help mode are
the natural mount point.

**And the card teaches (owner, 2026-07-25).** The site should be educational
about design itself — UI design, styles, history, the games that defined
each pattern, further reading. So the ⓘ card is two layers:

1. *The manual* (generated from the slot table): what's editable, how.
2. *The lesson* (authored, one per component): what this pattern is called
   in the industry, where it comes from, games that use it brilliantly,
   what makes a good one, and one or two relevant links. The health globe
   points at Diablo; the weapon wheel at its console lineage; the season
   track at the battle-pass era. Industry vocabulary throughout — a student
   should leave knowing the *names* of things.

**Authoring standard** (owner note, 2026-07-25): no vague history. Every
claim names its titles and carries its dates — never "games moved the HUD
behind the car," always "OutRun (1986) through Need for Speed (1994)." The
reader should finish each card with names they can go look up. Links must
be specific or canonical (the Game UI Database over a generic article when
the point is seeing real HUDs), and always open in new tabs.

This is a product pillar, not a tooltip: it is the difference between an
asset tool and a design education that happens to ship assets. It compounds
the student/educator tier ("learn with the real tool" becomes literal) and
it is content no competitor can copy overnight. ~115 short write-ups,
authored once, reviewed by the owner as creative director.

**Links open in new tabs** (owner, 2026-07-25): every external reference in
a lesson card is `target="_blank"` with `rel="noopener noreferrer"` — the
reader never loses their work to a citation.

## Language follows the visitor (owner, 2026-07-25 — separate workstream)

If someone picks a language on the homepage, the APP must adopt it
throughout. The homepage already persists the choice (`ui-generator-lang`
in localStorage, seven locales); the editor simply never reads it.

Honest sizing: this is a major workstream, not a toggle. The editor has
hundreds of strings (panel sections, tooltips, buttons, error messages),
none behind a translation layer today — and the ~115 lesson cards
eventually multiply by seven. Phasing that keeps it honest:

1. **Plumb the choice now** — the editor reads the stored language and a
   string table exists, English-first. Cheap, unblocks everything.
2. **Translate the shell** — the chrome a user touches constantly (section
   names, common buttons, export menu). Bounded, high-visibility.
3. **The long tail** — every tooltip, error and lesson card. Content work
   on the scale of the front door's seven-locale build; plan it as such.

Until phase 2 lands, the honest position is what exists: the SITE speaks
seven languages, the TOOL speaks English. Nothing on the front door should
claim otherwise.

## Build order

| Phase | What | Size |
|---|---|---|
| 0 ✅ | **Proof piece shipped 2026-07-25**: KIT_SLOTS/KIT_LESSONS tables, speedo family unit as MPH↔KPH choice, value slot explained not faked, generated panel controls, two-layer ⓘ card with new-tab links | done — the pattern every sweep component follows |
| 1a ✅ | **Sweep batch 1 shipped 2026-07-25** — 19 components un-welded onto slots: questpanel (eyebrow + 3 objectives), dialoguebox (speaker + line 2), chatbubble (sender + time), friendrow (status + CTA), scorebug (both scores), nameplate ribbon, dialog CTAs, pricebtn ribbon, achievetoast eyebrow, movecounter caption, leaderboard (title + all 5 rows), listmenu (4 rows), choicelist (3), dropdown (3), flipclock (4 tags), equipselector (3 items), seasontrack lanes, weaponwheel (6 chambers + hint), tacho + waypoint units. Free slots render as a generated two-up grid in the panel; slot values flow through every export path (per-piece SVG, catalog, build-parts ZIPs, components ZIP). Three of the eight welded-shut components are now open (leaderboard, listmenu, choicelist). | done |
| 1b | Remaining sweep: laptimes + telemetry + invgrid + hotbar (series/data casts), stepper, second-slot stragglers (buildqueue qty, unitplate stats, techcard cost, partyframe level, xpbar next-label), placeholders (input, searchfield), circuit tag, respawn state words, startlights, compass, rarity vocab — plus data-slot stamps for T-mode | medium — same pattern |
| 2 | T-mode canvas editing riding the stamps: free/choice/value/locked behaviors + the ⓘ card | medium |
| 3 | Icon click-to-swap + un-weld pattern-8 icons | small-medium |
| 4 | Demo datasets as row slots (leaderboard, listmenu…) | medium, can trail launch if the rows are labeled as specimen data |

## The full matrix

Legend: **L**=opts.label (kitLabels) · **S**=opts.sub · **I**=opts.icon ·
**O/M/B/R**=overlay/max/bar/row channels · **V**=value-derived · **HC**=hardcoded.

| # | component | text (source) | icons (source) | verdict |
|---|---|---|---|---|
|1|primary|label = L -> cfg.content.label -> "PLAY"|none (opts.icon never passed)|PARTIAL - icon ignored|
|2|secondary|L ?? "Secondary"|none|PARTIAL - icon ignored|
|3|small|L ?? "GO"|suppressed|PARTIAL - icon ignored|
|4|ghost|L ?? "Ghost"|suppressed|PARTIAL - icon ignored|
|5|iconbtn|none|I ?? default|FULL|
|6|chip|L ?? "NEW"|I (null removes)|FULL|
|7|badge|L ?? "12" (count form)|pressed form: I ?? star|PARTIAL - count variant drops icon|
|8|tab|L ?? "TAB"|suppressed|PARTIAL - icon ignored|
|9|segment|captions via segments channel; HC defaults ONE/TWO/THREE|none|FULL (segments)|
|10|checkbox|none|check HC|PARTIAL - glyph fixed|
|11|radio|none|none|nothing to edit|
|12|toggle|none|none|nothing to edit|
|13|slider|none|none|nothing to edit|
|14|emblembar|none|dock = I ?? clock|FULL|
|15|progress|none|dock via kitBar + I|FULL|
|16|segbar|none|dock via kitBar + I|FULL|
|17|input|value = L; HC placeholder "Type something..."|none|PARTIAL - placeholder HC|
|18|header|L ?? master label ?? "BANNER"|suppressed|PARTIAL - icon ignored|
|19|panel|none|none|nothing to edit|
|20|vsbar|HC "VS"|none|PARTIAL - VS welded|
|21|dialog|title = L; HC "CLAIM" + "LATER"|none|PARTIAL - button words welded|
|22|toast|msg = L; HC "x" dismiss|I ?? check|PARTIAL - dismiss welded|
|23|tooltip|L ?? "+15% CRIT CHANCE"|suppressed|PARTIAL - icon ignored|
|24|keycap|L (first 6 chars)|none|FULL|
|25|padbtn|L (first char); ring hue mapped from letter|none|FULL (text)|
|26|listmenu|4 HC rows + HC key hints|4 HC icons|WELDED SHUT|
|27|scrollbar|none|none|nothing to edit|
|28|pagedots|none|none|nothing to edit|
|29|steps|index numbers|check HC on done|PARTIAL - no label channel|
|30|spinner|none|none|nothing to edit|
|31|loadbar|L ?? "LOADING"; V percent|none|FULL|
|32|setrow|L ?? "MUSIC VOLUME"; V number|none|FULL|
|33|searchfield|query = L; HC placeholder + "x"|search HC|PARTIAL|
|34|notifydot|count = V|I ?? scroll|PARTIAL - L unused|
|35|avatarframe|level = V|none|PARTIAL - no channels|
|36|nameplate|name = L; HC "PIT CHAMPION" ribbon|star HC|PARTIAL|
|37|currency|amount = L ?? V|coin star HC|PARTIAL - coin glyph|
|38|buffframe|V seconds; HC unit "s"|I ?? flask|PARTIAL|
|39|cooldown|V seconds; HC unit "s"|none|PARTIAL - no channels|
|40|stepper|HC "-" and "+"|none|WELDED SHUT|
|41|healthglobe|none|none|nothing to edit|
|42|xpbar|level = L; HC "NEXT: LV", "/ 2,000 XP"|none|PARTIAL - units welded|
|43|manarails|none|flask + zap HC|PARTIAL - icons welded|
|44|questpanel|title = L; HC eyebrow "SIDE QUEST" + 3 objectives + counts|check HC|PARTIAL - everything but title|
|45|dialoguebox|line1 = L; HC speaker "ELDER ROWAN" + line2|none|PARTIAL|
|46|choicelist|3 HC choices|play HC|WELDED SHUT|
|47|invgrid|HC "INVENTORY", counts|12 HC item icons|WELDED SHUT|
|48|rarityframe|tier word from HC vocabulary|gem HC|PARTIAL|
|49|equipslot|none|I ?? helmet|FULL|
|50|skillnode|none|I ?? zap; lock/check semantic|FULL|
|51|compass|HC cardinal letters (semantic)|none|PARTIAL|
|52|partyframe|name = L; HC level "12"|sword HC|PARTIAL|
|53|dmgnumber|amount = L ?? V; HC "CRIT!"|none|PARTIAL|
|54|loottag|name = L; tier word HC vocab|I ?? gem|PARTIAL|
|55|crosshair|none|none|nothing to edit|
|56|hitmarker|none|none|nothing to edit|
|57|killfeed|killer = L; victim = S|I ?? crosshair|FULL|
|58|magazine|V count / cap (max channel)|none|FULL|
|59|equipselector|armed name = L; HC item names|HC glyphs|PARTIAL|
|60|streakmeter|L ?? "STREAK"|zap HC|PARTIAL - icon|
|61|waypoint|letter = L; V distance; HC "m"|none|PARTIAL - unit|
|62|capturemeter|letter = L|none|FULL|
|63|respawn|heading = L; HC "REDEPLOY" + "GO"|none|PARTIAL - state words|
|64|dmgarc|none|none|nothing to edit|
|65|weaponwheel|hub = L; HC 6 chamber names + "RELEASE TO EQUIP"|armed chamber = I; 6 HC glyphs|PARTIAL - heavy|
|66|starrating|none|refresh HC on replay chip|PARTIAL|
|67|levelnode|level = L|lock/stars semantic|FULL|
|68|pathconnector|none|none|nothing to edit|
|69|heartmeter|timer = L; HC "+"|heart path fixed|PARTIAL|
|70|booster|count = V; HC "FREE"|I ?? zap|PARTIAL|
|71|spinwheel|none|4 HC wedge glyphs|PARTIAL - wedges|
|72|dailycell|day = L|I ?? gift; check/lock semantic|FULL|
|73|combo|multiplier = L ?? V; plate word = S|none|FULL|
|74|movecounter|HC "MOVES"; V number|none|PARTIAL - caption|
|75|pricebtn|price = L; HC "BEST VALUE"|shapes|PARTIAL - ribbon|
|76|energymeter|count = L ?? V/30|zap HC x2|PARTIAL - bolts|
|77|buildqueue|name = L; HC "x3 - 0:42"|I ?? helmet|PARTIAL - qty/time|
|78|unitplate|name = L; HC stats 12/8|sword+shield HC|PARTIAL - stats+icons|
|79|techcard|name = L; HC cost "120"|I ?? sword; check/lock semantic|PARTIAL - cost|
|80|popmeter|V count / cap|user HC|PARTIAL - icon|
|81|endturn|L ?? "END TURN"|none|FULL|
|82|scorebug|teams = L + S; HC scores 2/1; clock V|none|PARTIAL - scores|
|83|friendrow|name = L; HC status + JOIN/INVITE|shapes|PARTIAL|
|84|chatbubble|message = L (wrapped); HC name + timestamp|none|PARTIAL|
|85|emotewheel|none|6 HC emotes; selected = I|PARTIAL|
|86|clancrest|tag = L|I ?? sword|FULL|
|87|seasontrack|HC FREE/PREMIUM + tier numbers|6 HC tile icons|WELDED SHUT|
|88|achievetoast|name = L; HC "ACHIEVEMENT UNLOCKED"|star medallion|PARTIAL - eyebrow|
|89|hotbar|HC stack counts; index numbers|5 HC icons|PARTIAL - all content HC|
|90|cardback|deck name = L (now escaped)|I ?? gem; null removes|FULL|
|91|pack|L ?? "12 CARDS" (now escaped)|I ?? gem; null removes|FULL|
|92|resource|value = L; max channel; HC "+"|I ?? gem|PARTIAL - add knob|
|93|datarow|title = L / row.title; sub = S / row.sub|avatar = I; action glyphs semantic|FULL|
|94|joystick|none|none|nothing to edit|
|95|slot|overlay-driven cooldown/count/level; HC "LV", "!"|main = I; lock/check semantic|PARTIAL|
|96|orb|none|none|nothing to edit|
|97|reticle|none|none|nothing to edit|
|98|minimap|HC "N" (round variant)|blips|PARTIAL|
|99|ammo|cur = L; max via M|none|FULL|
|100|lives|counts via L/M|heart HC|PARTIAL - glyph|
|101|bignum|L ?? "+9,999"|none|FULL|
|102|ring|L ?? V percent|none|FULL|
|103|flipclock|digits L ?? V; HC unit tags DAYS/HOURS/...|none|PARTIAL - tags|
|104|stopwatch|L ?? V time|none|FULL|
|105|timerdigits|L ?? V time|none|FULL|
|106|speedo|readout V; HC "MPH"; no L channel|none|PARTIAL|
|107|speedo2|readout V; HC "MPH"|none|PARTIAL|
|108|tacho|readout V; HC "RPM x1000"|none|PARTIAL|
|109|circuit|HC "KAZURI RING - GP CIRCUIT"|none|PARTIAL|
|110|leaderboard|HC "TOP 5" + all 5 rows|none|WELDED SHUT|
|111|trophy|rank = L|none|FULL|
|112|laptimes|HC everything (labels, axes, series)|none|WELDED SHUT|
|113|telemetry|HC everything|none|WELDED SHUT|
|114|startlights|HC "LIGHTS OUT"/"GET READY"|none|PARTIAL|
|115|dropdown|button = L; HC option rows|chevron HC|PARTIAL - rows|

