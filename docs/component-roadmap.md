# Component roadmap — 81 shipped → 114 (P1 + P2 COMPLETE)

Current inventory (47): primary, secondary, small, ghost, iconbtn, chip,
badge, tab, segment, header, checkbox, radio, toggle, slider, input,
dropdown, progress, segbar, emblembar, vsbar, hotbar, panel, resource,
datarow, slot, orb, ring, joystick, reticle, minimap, ammo, lives, bignum,
flipclock, stopwatch, timerdigits, speedo, speedo2, tacho, circuit,
leaderboard, trophy, laptimes, telemetry, startlights, cardback, pack.

Coverage today skews toward controls, bars and racing. The gaps, by
breadth of use. Every candidate below is buildable in the existing
engine (silhouette + candy material + type — no illustration work).

## P1 · Universal chrome — 20 ✅ SHIPPED (v80)

| # | Component | Notes |
|---|-----------|-------|
| 1 | Dialog / modal frame | title plate + body + button row; the #1 request in any kit |
| 2 | Toast / notification banner | slide-in strip, icon + message |
| 3 | Tooltip bubble | pointer variants (top/bottom) |
| 4 | Context / list menu | hover + selected rows |
| 5 | Scrollbar | track + candy thumb |
| 6 | Pagination dots | carousel indicator, active state |
| 7 | Step indicator | breadcrumb pips for wizards/onboarding |
| 8 | Loading spinner | radial sweep in the kit material |
| 9 | Loading bar + tip slot | full-screen loading pattern |
| 10 | Key prompt — keyboard | keycap with label (WASD, E, SPACE) |
| 11 | Key prompt — gamepad | A/B/X/Y, bumpers, sticks |
| 12 | Settings row | label + inline control composite |
| 13 | Search field | input variant with glyph + clear |
| 14 | Notification counter dot | badge-on-corner primitive |
| 15 | Avatar / portrait frame | ring + level notch |
| 16 | Nameplate | player name + title ribbon |
| 17 | Currency pill | coin glyph + amount (+delta state) |
| 18 | Buff/debuff frame | timed icon with cooldown sweep |
| 19 | Cooldown radial overlay | wipe overlay for slots/hotbar |
| 20 | Volume/quality stepper | − value + segments |

## Editing contracts — System Chrome

Every chrome piece inherits the master material wholesale (silhouette,
candy, lighting, type); the STATE selector targets the piece's
interactive sub-element, never the whole frame:

| Piece | Hover / pressed target | Extra editable channels |
|---|---|---|
| dialog | the ARMED capsule — value < .5 arms CLAIM, ≥ .5 arms LATER | title text, type, colors |
| listmenu | the row under the pointer (live) / the value-scrubbed row | row labels via content, type |
| scrollbar | thumb (glow / grip) — drags live on the kit page | value = position |
| steps | current pip (ring, scale) | type + colors only |
| stepper | + cap glows; pressed fills one more cell | value = cells |
| loadbar | — (value = fill; heading editable) | mercury follows Glow role |
| cooldown | — (readout defaults to AUTO ink, no shadow; a type fork or per-piece text color re-themes it) | value = time |
| others | frame dims for disabled only | labels/values per piece |

## P2 · RPG / MMO pack — 14 ✅ SHIPPED (v81)

| # | Component | Notes |
|---|-----------|-------|
| 1 | Health globe | liquid sphere; the liquid follows the Glow role |
| 2 | XP bar | level bubble + milestone notches; label = the level |
| 3 | Mana & stamina rails | twin bars; blue/green are genre semantics |
| 4 | Quest tracker | objectives + check pips; value = completed share |
| 5 | Dialogue box | speaker plate + bobbing continue arrow |
| 6 | Dialogue choices | value scrubs the highlighted response |
| 7 | Inventory grid | 4×3 wells, counts, selected cell |
| 8 | Rarity frame | one frame, five tiers; value picks the tier |
| 9 | Equipment slot | ghosted gear silhouette shows what belongs |
| 10 | Skill node | circular socket + connector stubs; lit stub = learned path |
| 11 | Compass ribbon | windowed heading strip; value = heading |
| 12 | Party frame | portrait + HP/MP rails; whole frame is selectable |
| 13 | Damage number | shell-free combat type; >0.7 goes CRIT |
| 14 | Loot tag | rarity stripe + gem + tier word |

### Editing contracts — RPG pack

| Piece | Hover / pressed target | Extra editable channels |
|---|---|---|
| questpanel | active objective's pip (ring, glow) | quest name via label |
| dialoguebox | continue arrow (glow, brightness) | first line via label |
| choicelist | active choice capsule | — |
| invgrid | selected cell's ring | — |
| skillnode | whole node (a real button) | icon swap; overlay = state |
| partyframe | whole frame (party selection) | name via label |
| others | frame; rarity aura brightens | tier/heading/fill via value |

## P3 · Shooter / action pack — 10

crosshair set (spread variants), hit marker, kill-feed row, magazine
visual (bullet pips), equipment selector, streak meter, objective
waypoint (diamond + distance), capture-point meter (A/B/C fill),
respawn timer, damage-direction arc.

## P4 · Casual / mobile pack — 11

star-rating result (0–3), level-map node (lock/stars) + path connector,
hearts row, booster button with count badge, spin-wheel frame, daily
reward calendar cell, combo multiplier burst, move counter tile, price
button (IAP), energy meter.

## P5 · Strategy + social — 12

build queue card, unit selection plate, tech-tree card, population
meter, end-turn button (chunky radial), score bug (teams + clock),
friend row (presence dot), chat bubble, emote wheel frame, clan crest
frame, season-pass track segment (free/premium lanes), achievement
toast.

**Math: 47 + 20 + 14 + 10 + 11 + 12 = 114.**

Sequencing recommendation: P1 first (raises every genre's floor and the
marketing "components" number fastest) — done; then P2 (done) and P4
(the two biggest paying audiences: RPG and mobile-casual), then P3/P5. Each pack lands as
its own version so the kit page grows a chapter at a time, and pack
names double as marketing beats ("the RPG pack just dropped").
