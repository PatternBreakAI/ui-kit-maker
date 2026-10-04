#!/usr/bin/env python3
"""The Nightfall kit's Start screen board: the Unity game's first screen, from the owner's glass concept (2026-10-04),
on the iPhone 18 Pro landscape stage (874 by 402 points). Dark see-through glass panels held by gold hairlines over
the night lake; the player's portrait, name and collection bar; the wordmark with its line; the wallet chips and the
gear; Season Pass and Missions down the left; the Pantheon's three cards fanned in the middle with Play on the pointed
gold plate under them; the featured event and the daily shop down the right; one glass bar along the foot carrying the
tabs and the three mode plates. Every word 11 pt or more, every tap 34 pt or more, inside the island's ears."""
from nfboard import Board, SW, SH, CX, SAFE_L, SAFE_R, SAFE_B, GOLD, DIM_GOLD, CREAM, PALE, INK, geom

b = Board("nf-start", "start", "/kit-art/nightfall/bg.webp")
L, R = SAFE_L + 8, SW - SAFE_R - 8
COL = 204
IB = geom["iconbtn"]["shell"][2]             # the icon button's shell at size l; a glyph box of N points is scale N / IB
ps = 12 / (64 * 1.22)                        # a 12 pt tall meter


def glyph(icon, cx, cy, box, ink=False, tag="glyph"):
    """A bare gold (or ink) glyph, box points across, centred at (cx, cy)."""
    b.piece("copy-nvgi-iconbtn" if ink else "copy-navg-iconbtn", cx - box / 2, cy - box / 2, box / IB, ov=icon, tag=tag, base="copy-navg-iconbtn")


# ── the top bar ─────────────────────────────────────────────────────────────────────────────────────
b.portrait("copy-avop-avatarframe", "uanfopp", L, 6, 46)
b.stamp("Silverlake Slayer", L + 56, 10, 12, "#F0D890")
b.stamp("Collection level 47", L + 56, 26, 11, DIM_GOLD)
b.piece("progress", L + 56, 40, ps, stretch=104 / (520 * 1.22 * ps), v=0.78, tag="xp")
b.stamp("2,340 / 3,000", L + 168, 40, 11, PALE)
logo_w = 150
logo_h = b.art("uanflogo", CX - logo_w / 2, 0, logo_w, tag="logo")
b.stamp("Battle for Influence", 0, logo_h + 2, 11, GOLD, cx=CX, shadow=60, tag="tagline")
cs = 26 / geom["currency"]["shell"][3]
b.piece("currency", R - 236, 10, cs, label="1,250", tag="coins")
b.piece("copy-gemc-currency", R - 138, 10, cs, label="38", tag="gems", base="currency")
b.piece("iconbtn", R - 32, 8, 32 / IB, tag="settings")

# ── left column: season pass, missions ─────────────────────────────────────────────────────────────
b.panel_box("panel", L, 60, COL, 62, scale=0.18, tag="season")
b.stamp("Season Pass", L + 12, 68, 11, GOLD)
b.stamp("The Great Migration", L + 12, 84, 12, CREAM, voice="list")
b.piece("progress", L + 12, 104, ps, stretch=108 / (520 * 1.22 * ps), v=0.62, tag="seasonbar")
b.stamp("Tier 12", 0, 104, 11, GOLD, right=L + COL - 12)
b.panel_box("panel", L, 130, COL, 208, scale=0.18, tag="missions")
b.stamp("Missions", L + 12, 140, 11, GOLD)
b.stamp("View all", 0, 140, 11, PALE, right=L + COL - 26)
glyph("icon:forward", L + COL - 17, 144, 14)
ROWS = [("Play 3 Events", "1/3", False), ("Win at Harpers Ferry", "0/1", False), ("Break 2 Threats", "2/2", True), ("Stand on Business once", "0/1", False)]
for i, (txt, cnt, done) in enumerate(ROWS):
    y = 162 + i * 42
    b.strip_box("copy-done-panel" if done else "copy-rowp-panel", L + 10, y, COL - 20, 34, tag="row")
    glyph("icon:check" if done else "icon:dot", L + 26, y + 17, 16, tag="rowglyph")
    b.stamp(txt, L + 40, y + 11, 11, "#7CF0A0" if done else CREAM, voice="list")
    b.stamp(cnt, 0, y + 12, 11, "#7CF0A0" if done else CREAM, right=L + COL - 18)

# ── centre: the Pantheon, Play ──────────────────────────────────────────────────────────────────────
b.stamp("Pantheon", 0, logo_h + 26, 11, GOLD, cx=CX, shadow=60)
b.card("uanfcardoshun", CX - 86, 212, 88, rot=-9)
b.card("uanfcardogun", CX + 86, 212, 88, rot=9)
b.card("uanfcardshango", CX, 204, 108)
b.items.append({"id": b.nid("dots"), "libId": "", "kitId": "pagedots", "x": round(CX - 124 * 0.25, 1), "y": 278, "scale": 0.25})
PW, PH, PY = 290, 46, 292
b.strip_box("copy-play-panel", CX - PW / 2, PY, PW, PH, tag="play")
b.stamp("Play", 0, PY + PH / 2 - 0.62 * 20 / 2, 20, INK, cx=CX, tag="playword")
glyph("icon:back", CX - PW / 2 + 30, PY + PH / 2, 12, ink=True, tag="playend")
glyph("icon:forward", CX + PW / 2 - 30, PY + PH / 2, 12, ink=True, tag="playend")

# ── right column: the featured event, the daily shop ───────────────────────────────────────────────
X = R - COL
b.panel_box("panel", X, 60, COL, 162, scale=0.18, tag="event")
b.stamp("Featured event", X + 12, 68, 11, GOLD)
glyph("icon:forward", X + COL - 17, 72, 14)
b.panel_box("copy-card-panel", X + 8, 84, COL - 16, 92, scale=0.1, tag="eventframe")
b.art("uanfevent", X + 11, 87, COL - 22, tag="eventart")
b.stamp("Juneteenth Weekend", X + 12, 182, 12, CREAM, voice="list")
b.stamp("Freedom moves together.", X + 12, 198, 11, GOLD)
glyph("icon:clock", X + 18, 214, 12)
b.stamp("2d 14h 12m", X + 28, 210, 11, PALE)
b.panel_box("panel", X, 230, COL, 108, scale=0.18, tag="shop")
b.stamp("Daily shop", X + 12, 238, 11, GOLD)
b.stamp("12h left", 0, 238, 11, PALE, right=X + COL - 12)
b.panel_box("copy-card-panel", X + 10, 256, 54, 54, scale=0.07, tag="shopframe")
b.art("uanfmansa", X + 13, 259, 48, tag="shopart")
b.stamp("Mansa Musa", X + 74, 262, 13, CREAM, voice="list")
b.piece("currency", X + 72, 282, cs, label="400", tag="price")
b.stamp("New cards · Cosmetics", X + 12, 322, 11, DIM_GOLD)
glyph("icon:forward", X + COL - 17, 326, 14)

# ── the foot: one glass bar, the tabs as glyph over word, the three mode plates in the middle ───────
BAR_Y, BAR_H = 346, 64
b.strip_box("copy-barp-panel", -12, BAR_Y, SW + 24, BAR_H, tag="navbar")
CY = BAR_Y + 28
for cx, icon, word in ((L + 40, "icon:cart", "Shop"), (L + 128, "icon:scroll", "Collection"), (R - 128, "icon:map", "Compendium"), (R - 40, "icon:shield", "Ranks")):
    glyph(icon, cx, CY - 8, 20, tag="tab")
    b.stamp(word, 0, CY + 8, 11, GOLD, cx=cx, tag="tabword")
for cx, w, icon, word in ((CX - 112, 84, "icon:sword", "PvP"), (CX, 100, "icon:crosshair", "Practice"), (CX + 116, 112, "icon:trophy", "Challenges")):
    b.strip_box("copy-modp-panel", cx - w / 2, CY - 17, w, 34, tag="mode")
    tw = b.stamp(word, 0, CY - 0.62 * 11 / 2, 11, GOLD, cx=cx + 10, tag="modeword")
    glyph(icon, cx + 10 - tw / 2 - 13, CY, 16, tag="modeglyph")
for x in (L + 80, R - 80):
    b.stamp("|", 0, CY - 9, 18, "#5A4A20", cx=x, tag="divider")

b.write(order=("nf-start", "nf-match"))
