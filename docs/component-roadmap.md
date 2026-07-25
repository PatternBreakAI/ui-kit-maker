# Component roadmap — 115 shipped · ROADMAP COMPLETE (P1–P5)

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
| dialog | the capsule UNDER THE POINTER (live) — value < .5 arms CLAIM, ≥ .5 LATER | title text, type, colors |
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

## P3 · Shooter / action pack — 11 ✅ SHIPPED (v82)

| # | Component | Notes |
|---|-----------|-------|
| 1 | Crosshair | value = spread; overlay = dot/t variants |
| 2 | Hit marker | value = intensity; >0.7 goes CRIT (semantic red) |
| 3 | Kill feed | killer [weapon] victim; hover = "you're in this one" |
| 4 | Magazine | round pips; value = rounds left, max = capacity |
| 5 | Equipment selector | three sockets, center armed; value cycles |
| 6 | Streak meter | five cells to ignition; the zap lights when full |
| 7 | Waypoint | diamond + distance; label = objective letter |
| 8 | Capture point | ring fill around the letter; value = capture |
| 9 | Respawn timer | AUTO-ink seconds (cooldown contract) + drain bar |
| 10 | Damage direction | red crescent; value = threat angle |
| 11 | Weapon wheel | revolver-chamber radial; pointer ANGLE arms a chamber live (added per product owner) |

### Editing contracts — Shooter pack

| Piece | Hover / pressed target | Channels |
|---|---|---|
| crosshair, hitmarker | — (spatial) | weight = Icon stroke; color = Glow role; value = spread/intensity |
| killfeed | whole row (the "you" flash) | label = killer, sub = victim, icon = weapon (swappable) |
| magazine | — | value = rounds, max = capacity |
| equipselector | armed ring | value = CONTINUOUS position (tweened glide), label = name, icon = armed glyph |
| streakmeter | frame | value = progress, label = meter name |
| waypoint | pulse ring | label = letter, value = distance |
| capturemeter | ring glow | label = letter, value = capture share |
| respawn | — | label = heading; seconds re-theme via type fork / text color |
| dmgarc | — (spatial) | value = direction; alarm red is semantic |
| weaponwheel | armed chamber | value = cylinder ROTATION — pointing seats the chamber at the 2 o'clock hammer, magnified, topmost, western easing; label = hub name, icon = armed glyph |

## P4 · Casual / mobile pack — 11 ✅ SHIPPED (v83)

| # | Component | Notes |
|---|-----------|-------|
| 1 | Star rating | stars in a themed pill on a dark well; full marks = gold flare + replay chip; click replays |
| 2 | Level node | current pulses; overlay = locked / stars:N (candy-star fan over the foot) |
| 3 | Path connector | saga-trail beads; value = progress |
| 4 | Heart meter | lives + refill timer + add knob (hearts-red semantic) |
| 5 | Booster button | real button; count badge or FREE plate; icon swappable |
| 6 | Spin wheel | paired gold jackpot wedges + glyph wedges, nested pointer, candy hub; value = rotation; click throws |
| 7 | Daily reward | today glows; overlay = check (claimed) / locked |
| 8 | Combo burst | extruded Glow-lit numeral + burst + COMBO! plate; value = magnitude (x4 → x9 BIG) |
| 9 | Move counter | ≤5 goes alarm red and pulses |
| 10 | Price button (IAP) | coin + price + BEST VALUE ribbon; real button |
| 11 | Energy meter | bolt + ten cells (negative-space canon) + count |

### Editing contracts — Casual pack

| Piece | Hover / pressed target | Channels |
|---|---|---|
| levelnode, booster, pricebtn, dailycell | whole piece (real buttons) | label = level/price/day; icon swap on booster/dailycell |
| starrating | shell (pill frame edits like any pill) | value = stars (0..1 → 0..3); full marks shows the replay chip |
| pathconnector, combo | — (spatial/celebration) | value = progress/magnitude; combo: label = multiplier, overlay = plate word |
| spinwheel | — | value = rotation (click = throw) |
| heartmeter, energymeter | frame | value = fill; label = timer/count text |
| movecounter | — | value = moves; AUTO-ink number (themedText re-themes) |

## P5 · Strategy + social — 12 ✅ SHIPPED (v84)

| # | Component | Notes |
|---|-----------|-------|
| 1 | Build queue | unit icon + progress (negative-space) + queue count |
| 2 | Unit plate | portrait, name, HP rail, stat glyphs; selectable |
| 3 | Tech card | medallion + cost; overlay = done/locked; connector stubs |
| 4 | Population | count + bar; >90% warns in alarm red |
| 5 | End turn | chunky radial button; value = turn-timer arc |
| 6 | Score bug | teams + clock in a dark instrument well; team hues semantic |
| 7 | Friend row | presence dot, status, JOIN/INVITE capsule |
| 8 | Chat bubble | SPEECH silhouette (tail in the shape, effects wrap it); message wraps + bubble grows vertically |
| 9 | Emote wheel | six sectors; click picks INSTANTLY (no spin) |
| 10 | Clan crest | shield silhouette + emblem + tag ribbon |
| 11 | Season track | FREE/PREMIUM lanes around the level spine; premium gold |
| 12 | Achievement toast | gold medallion + kicker + name |

### Editing contracts — Strategy + social

| Piece | Hover / pressed target | Channels |
|---|---|---|
| buildqueue, unitplate, techcard, friendrow, clancrest, endturn, achievetoast | whole piece (real buttons/cards) | label = name/tag/price; icon swap on buildqueue/techcard/clancrest |
| emotewheel | selected sector | value = sector (instant click pick); icon = selected emote |
| scorebug | — (instrument well) | label/sub = team names; value = clock |
| popmeter, seasontrack | frame | value = fill/progress; max = cap |
| chatbubble | frame | label = the message |

**Math: 47 + 20 + 14 + 11 + 11 + 12 = 115** (weapon wheel added to P3
per the product owner).

Sequencing: P1 ✅ → P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ — the set is COMPLETE at 115. Each pack lands as
its own version so the kit page grows a chapter at a time, and pack
names double as marketing beats ("the RPG pack just dropped").
