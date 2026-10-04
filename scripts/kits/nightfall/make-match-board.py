#!/usr/bin/env python3
"""The Nightfall kit's Match board: the game screen (src/ui/screens/MatchScreen.tsx, Battlefield, Hud, Hand) on the
iPhone 18 Pro landscape stage, turn 4 of 6 in the planning phase. The ground is a still from the board clip (the
lakeside plaza under the mountain that loops behind every match). Over it: the two nameplates with their portraits
and the Stand on Business plate between them; three Locations as gold-framed plates with their art, name and both
players' Influence; the opponent's cards above each Location and yours below (a drop slot where you have none); your
hand fanned at the foot; Sit Down, the turn tracker with its coins and the energy coin at the left; Lock In on the
gold standard with its timer at the right. Every number and word is a live stamp, every picture a swappable asset."""
from nfboard import Board, SW, SH, CX, SAFE_L, SAFE_R, SAFE_B, GOLD, DIM_GOLD, CREAM, PALE, INK, geom

BLUE = "#7FB0FF"
b = Board("nf-match", "match", "/kit-art/nightfall/match-bg.webp")
L, R = SAFE_L + 8, SW - SAFE_R - 8

# ── the top: your nameplate, the Stand on Business plate, the opponent's nameplate ──────────────────
b.strip_box("copy-rowp-panel", L, 8, 176, 34, tag="np-you")
b.stamp("Silverlake Slayer", L + 10, 13, 11, CREAM, tag="np")
b.stamp("4/7 in hand · 12 in deck", L + 10, 28, 11, PALE, tag="np")
b.portrait("copy-avyu-avatarframe", "uanfyou", L + 176 - 14, 4, 40)
b.strip_box("copy-blup-panel", R - 176, 8, 176, 34, tag="np-opp")
b.stamp("Harborlight", 0, 13, 11, CREAM, right=R - 10, tag="np")
b.stamp("5/7 in hand · 11 in deck", 0, 28, 11, PALE, right=R - 10, tag="np")
b.portrait("copy-avop-avatarframe", "uanfopp", R - 176 - 34, 4, 40)
b.strip_box("copy-play-panel", CX - 88, 6, 176, 30, tag="sob")
b.stamp("Stand on Business", 0, 6 + 15 - 0.62 * 11 / 2, 11, INK, cx=CX, tag="sobword")
b.stamp("Stakes 2 · Legacy", 0, 40, 11, GOLD, cx=CX, shadow=60, tag="stakes")

# ── the battlefield: three Locations, the opponent's lane above, yours below ────────────────────────
COLS = (CX - 215, CX, CX + 215)
LOCS = (("uanflocharpers", "Harpers Ferry", 7, 5), ("uanflocgreenwood", "Greenwood", 4, 6), ("uanflocmontgomery", "Montgomery", 2, 2))
CW = 42                                      # a lane card's width (the hand's cards are bigger)
for cx, (aid, name, mine, theirs) in zip(COLS, LOCS):
    b.panel_box("copy-card-panel", cx - 98, 114, 196, 132, scale=0.12, tag="loc")
    ah = b.art(aid, cx - 94, 118, 188, tag="locart")
    b.strip_box("copy-rowp-panel", cx - 92, 118 + ah + 4, 184, 22, tag="locband")
    b.stamp(name, 0, 118 + ah + 4 + 11 - 0.62 * 11 / 2, 11, CREAM, cx=cx, tag="locname")
    b.stamp(str(mine), cx - 84, 118 + ah + 4 + 11 - 0.62 * 13 / 2, 13, GOLD, tag="inf")
    b.stamp(str(theirs), 0, 118 + ah + 4 + 11 - 0.62 * 13 / 2, 13, BLUE, right=cx + 84, tag="inf")
# the opponent's cards (face down until revealed; Douglass and Tubman already stand)
b.card("uanfcardback", COLS[0], 81, CW, shadow=30)
b.card("uanfcarddouglass", COLS[1] - 24, 81, CW, shadow=30)
b.card("uanfcardback", COLS[1] + 24, 81, CW, shadow=30)
b.card("uanfcardtubman", COLS[2], 81, CW, shadow=30)
# yours
b.card("uanfcardshango", COLS[0], 276, CW, shadow=30)
b.card("uanfcardoshun", COLS[1] - 24, 276, CW, shadow=30)
b.card("uanfcardogun", COLS[1] + 24, 276, CW, shadow=30)
ph = geom["placeholder"]["shell"]
b.piece("placeholder", COLS[2] - CW / 2, 276 - CW * 713 / 551 / 2, CW * 713 / 551 / 400, stretch=551 / 713, label="", tag="slot")

# ── the foot: Sit Down, the turn tracker and energy at the left; the hand; Lock In and its timer ─────
b.strip_box("copy-dngp-panel", L, 312, 88, 28, tag="sitdown")
b.stamp("Sit Down", 0, 312 + 14 - 0.62 * 11 / 2, 11, CREAM, cx=L + 44, tag="sitword")
b.strip_box("copy-rowp-panel", L, 348, 196, 44, tag="tracker")
b.stamp("Turn 4 of 6", L + 10, 354, 11, GOLD, tag="turn")
cs = 16 / geom["coin"]["shell"][2]
for i in range(6):
    b.piece("coin" if i < 4 else "copy-dimc-coin", L + 10 + i * 20, 372, cs, tag="turncoin", base="coin")
b.stamp("Energy 3 of 5", 0, 354, 11, PALE, right=L + 186, tag="energy")
pi = geom["iconbtn"]["shell"][2] * 0.17
b.piece("iconbtn", L + 100, 312, 0.17, ov="icon:info", tag="log")
# the hand, fanned
HAND = ("uanfcardmansa", "uanfcarddouglass", "uanfcardtubman", "uanfcardoshun")
for i, aid in enumerate(HAND):
    off = (i - 1.5)
    b.card(aid, CX + off * 46, 362 + abs(off) * 5, 56, rot=off * 6, shadow=40)
# Lock In
b.strip_box("copy-play-panel", R - 172, 316, 172, 44, tag="lockin")
b.stamp("Lock in", 0, 316 + 22 - 0.62 * 17 / 2, 17, INK, cx=R - 86, tag="lockword")
ps = 12 / (64 * 1.22)
b.piece("progress", R - 172, 368, ps, stretch=172 / (520 * 1.22 * ps), v=0.62, tag="timer")
b.stamp("0:19", 0, 384, 11, PALE, right=R, tag="clock")

b.write()
