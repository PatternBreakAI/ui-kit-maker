#!/usr/bin/env python3
"""The Nightfall kit's Home board: the concept home screen laid out on the 1920 by 1080 stage from kit pieces and type
stamps. Positions are given as the SHELL's top-left in stage px; the item's x,y is derived from each piece's shell
origin at board size l (geom-l.json from probe-kit.mjs), because a board item's x,y is where the piece's own origin
lands. Writes the board into kit-nightfall.json."""
import json, os
from PIL import ImageFont

S = os.environ.get("KIT_SCRATCH", os.path.expanduser("~/nightfall-kit"))
KIT = os.path.join(os.environ.get("MAKER_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))), "src/generator/kit-nightfall.json")
k = json.load(open(KIT))
geom = json.load(open(f"{S}/kit/probe/geom-l.json"))
TYPE_SIZE = k["cfg"]["type"]["size"]
CIN = f"{S}/fonts/Literata_12pt-Bold.ttf"; CRI = f"{S}/fonts/CrimsonPro-SemiBold.ttf"  # the display face is Literata now; the name CIN stays for the measuring helper
GOLD, DIM_GOLD, CREAM, PALE, INK = "#E6C15A", "#C9A24A", "#F3E6C8", "#D8C8A0", "#2A1E05"
# unstretched bases at size l (k = 1.22): the blank panel, the panel strip, the placeholder window, the progress bar
K = 1.22
BASE = {"panel": (780, 470), "strip": (560 * K, 110 * K), "placeholder": (400, 400), "progress": (520 * K, 64 * K)}
items = []
n = [0]
def nid(tag):
    n[0] += 1
    return f"nf-home-{tag}-{n[0]}"

def piece(kitId, X, Y, scale=1.0, stretch=None, stretchY=None, label=None, ov=None, v=None, tag=None, base=None):
    g = geom.get(kitId) or geom.get(base or kitId)
    sx, sy = (g["shell"][0], g["shell"][1]) if g and g.get("shell") else (0, 0)
    it = {"id": nid(tag or kitId), "libId": "", "kitId": kitId, "x": round(X - sx * scale, 1), "y": round(Y - sy * scale, 1), "scale": round(scale, 4)}
    if stretch is not None: it["stretch"] = round(stretch, 4)
    if stretchY is not None: it["stretchY"] = round(stretchY, 4)
    if label is not None: it["label"] = label
    if ov is not None: it["ov"] = ov
    if v is not None: it["v"] = v
    items.append(it)
    return it

def text_w(text, fs, voice=None, spacing_em=0.06):
    f = ImageFont.truetype(CRI if voice else CIN, max(8, round(fs)))
    t = text if voice else text.upper()
    return f.getlength(t) + (0 if voice else spacing_em * fs * max(0, len(t) - 1))

def stamp(text, X, Y, size, color=None, voice=None, cx=None, glow=None, shadow=None, tag="t"):
    """A type stamp. size = % of the kit's type size; X is the text's left edge (or cx its centre) and Y the top of
    its capitals, in stage px. The app draws a stamp on its own canvas with the cap box centred at y 123 and the text
    starting about 82 px in (measured on the live board), so the item's x,y back those off."""
    fs = TYPE_SIZE * size / 100
    pad_x = 82 + 0.18 * max(0, fs - 14)
    cap_h = (0.9 if voice else 0.62) * fs
    if cx is not None:
        X = cx - text_w(text, fs, voice) / 2
    st = {"text": text, "size": size}
    if color: st["plain"] = {"color": color}
    if voice: st["voice"] = voice
    if glow: st["glow"] = glow
    if shadow: st["shadow"] = shadow
    items.append({"id": nid(tag), "libId": "", "x": round(X - pad_x, 1), "y": round(Y + cap_h / 2 - 123, 1), "scale": 1, "stamp": st})

def panel_box(kitId, X, Y, W, H, scale=0.4, tag=None):
    bw, bh = BASE["panel"]
    return piece(kitId, X, Y, scale, stretch=W / (bw * scale), stretchY=H / (bh * scale), tag=tag, base="panel")

def strip_box(kitId, X, Y, W, H, tag=None):
    bw, bh = BASE["strip"]
    scale = H / bh
    return piece(kitId, X, Y, scale, stretch=W / (bw * scale), stretchY=1.0, ov="strip", tag=tag, base="copy-play-panel")

def window(X, Y, W, H, label):
    return piece("placeholder", X, Y, 1.0, stretch=W / 400, stretchY=H / 400, label=label, tag="win")

# ── top bar ───────────────────────────────────────────────────────────────────────────────────────────
piece("avatarframe", 62, 40, 0.65, tag="portrait")
stamp("Silverlake Slayer", 230, 50, 46, "#F0D890")
stamp("Collection level 47", 230, 90, 40, DIM_GOLD)
piece("progress", 230, 122, 0.31, stretch=240 / (BASE["progress"][0] * 0.31), v=0.78, tag="xp")
stamp("2,340 / 3,000", 486, 124, 40, PALE)
stamp("Stand on Business", 0, 50, 100, GOLD, cx=959, glow=35, shadow=40, tag="wordmark")
stamp("History plays different", 0, 150, 40, PALE, cx=959)
piece("currency", 1420, 56, 0.54, label="1,250", tag="coins")
piece("currency", 1606, 56, 0.54, label="38", tag="gems")
piece("iconbtn", 1790, 46, 0.47, tag="settings")

# ── left column: season pass, missions ────────────────────────────────────────────────────────────────
panel_box("panel", 52, 216, 454, 178, tag="season")
stamp("Season Pass", 80, 240, 42, GOLD)
stamp("The Great Migration", 80, 276, 54, CREAM, voice="list")
piece("progress", 80, 338, 0.31, stretch=300 / (BASE["progress"][0] * 0.31), v=0.62, tag="seasonbar")
stamp("Tier 12", 0, 340, 40, GOLD, cx=440)
panel_box("panel", 52, 414, 454, 366, tag="missions")
stamp("Missions", 80, 438, 42, GOLD)
stamp("View all", 0, 442, 40, PALE, cx=430)
ROWS = [("Play 3 Events", "1/3", False), ("Win at Harpers Ferry", "0/1", False), ("Break 2 Threats", "2/2", True), ("Stand on Business once", "0/1", False)]
for i, (txt, cnt, done) in enumerate(ROWS):
    y = 486 + i * 71
    strip_box("copy-done-panel" if done else "copy-rowp-panel", 71, y, 420, 62, tag="row")
    piece("copy-navg-iconbtn", 84, y + 16, 0.19, ov="icon:check" if done else "icon:zap", tag="rowglyph")
    stamp(txt, 126, y + 19, 44, "#7CF0A0" if done else CREAM, voice="list")
    stamp(cnt, 0, y + 22, 40, "#7CF0A0" if done else CREAM, cx=458)

# ── centre: the deck, the opponent line, Play, the mode tabs ──────────────────────────────────────────
stamp("Your deck", 0, 230, 42, GOLD, cx=959)
window(632, 316, 196, 280, "card")
window(1092, 316, 196, 280, "card")
window(827, 265, 264, 332, "card")
piece("iconbtn", 546, 425, 0.47, ov="icon:back", tag="prev")
piece("iconbtn", 1296, 425, 0.47, ov="icon:forward", tag="next")
stamp("Influence", 0, 612, 38, GOLD, cx=880)
stamp("Force", 0, 612, 38, GOLD, cx=1050)
items.append({"id": nid("dots"), "libId": "", "kitId": "pagedots", "x": 959 - 124 * 0.45, "y": 640, "scale": 0.45})
stamp("Three orisha with the church behind them,", 0, 668, 40, CREAM, voice="list", cx=959)
stamp("Crowther brings a friend across and Seacole tends the Gates.", 0, 698, 40, CREAM, voice="list", cx=959)
stamp("The Pantheon", 0, 732, 36, DIM_GOLD, cx=959)
piece("avatarframe", 664, 756, 0.36, tag="you")
piece("chip", 752, 762, 0.56, label="VS Harborlight · Railroad", tag="vs")
piece("avatarframe", 1178, 756, 0.36, tag="opp")
strip_box("copy-play-panel", 689, 832, 541, 88, tag="play")
stamp("Play", 0, 852, 85, INK, cx=959, tag="playword")
piece("segment", 788, 928, 0.48, label="PvP | Practice | Challenges", tag="modes")

# ── right column: featured event, daily shop ──────────────────────────────────────────────────────────
panel_box("panel", 1410, 216, 464, 352, tag="event")
stamp("Featured event", 1435, 240, 42, GOLD)
stamp("View all", 0, 244, 40, PALE, cx=1796)
window(1424, 276, 436, 170, "event art")
stamp("Juneteenth Weekend", 1435, 458, 54, CREAM, voice="list")
stamp("Freedom moves together.", 1435, 500, 40, GOLD)
stamp("2d 14h 12m", 1435, 532, 40, PALE)
panel_box("panel", 1410, 588, 464, 292, tag="shop")
stamp("Daily shop", 1435, 612, 42, GOLD)
stamp("Refreshes in 12h", 0, 616, 36, PALE, cx=1748)
window(1437, 654, 150, 150, "portrait")
stamp("Mansa Musa", 1610, 676, 54, CREAM, voice="list")
piece("currency", 1604, 724, 0.5, label="400", tag="price")
stamp("New cards and more", 1435, 836, 40, DIM_GOLD)

# ── the foot: the nav bar with four glyph tabs ────────────────────────────────────────────────────────
strip_box("copy-barp-panel", 284, 988, 1352, 92, tag="navbar")
for x, icon, word in ((430, "icon:cart", "Shop"), ((430 + 959) / 2 - 20, "icon:scroll", "Collection"), ((959 + 1490) / 2 + 20, "icon:map", "Album"), (1490, "icon:trophy", "Ranks")):
    piece("copy-navg-iconbtn", x - 28, 994, 0.35, ov=icon, tag="nav")
    stamp(word, 0, 1046, 40, GOLD, cx=x)
stamp("People. Places. Power.", 0, 1046, 40, "#8C7A50", cx=959)

board = {"id": "nf-home", "name": "home", "aspect": "169", "bgShow": False, "items": items}
k["boards"] = [board]
json.dump(k, open(KIT, "w"), indent=0, ensure_ascii=False)
print("home board:", len(items), "items")
