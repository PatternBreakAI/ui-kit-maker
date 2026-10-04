#!/usr/bin/env python3
"""The Nightfall kit's Home board: the concept home screen on the 1920 by 1080 stage, sized for the phone in landscape
(874 by 402 pt: no word under 11 pt, taps 34 pt and up), dressed with the game's own art (shipped under
public/kit-art/nightfall and registered in the kit document's userAssets). Positions are the SHELL's top-left in
stage px for pieces (a board item's x,y is where the piece's own canvas origin lands, so the author backs the shell
origin off; geom-l.json from probe-kit.mjs), the cap top for stamps, the art's top-left for pictures."""
import json, os
from PIL import ImageFont

S = os.environ.get("KIT_SCRATCH", os.path.expanduser("~/nightfall-kit"))
MAKER = os.environ.get("MAKER_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
KIT = os.path.join(MAKER, "src/generator/kit-nightfall.json")
k = json.load(open(KIT))
geom = json.load(open(f"{S}/kit/probe/geom-l.json"))
ASSETS = {a["id"]: a for a in k["userAssets"]}
TYPE_SIZE = k["cfg"]["type"]["size"]
CIN = f"{S}/fonts/Literata_12pt-Bold.ttf"; CRI = f"{S}/fonts/CrimsonPro-SemiBold.ttf"  # the display face is Literata; CIN keeps the helper's name
GOLD, DIM_GOLD, CREAM, PALE, INK = "#E6C15A", "#C9A24A", "#F3E6C8", "#D8C8A0", "#2A1E05"
K = 1.22
BIG_GLYPH_BASE = 0.5  # a logo item measures registry w/h × this × scale
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

def art(aid, X, Y, W, glow=None, glow_ink=None, shadow=None, tag="art"):
    """A picture from the kit's shipped art: top-left at (X, Y), W wide; the height follows the art's aspect."""
    a = ASSETS[aid]
    scale = W / (a["w"] * BIG_GLYPH_BASE)
    lg = {"aid": aid}
    if glow: lg["glow"] = glow
    if glow_ink: lg["glowInk"] = glow_ink
    if shadow: lg["shadow"] = shadow
    items.append({"id": nid(tag), "libId": "", "x": round(X, 1), "y": round(Y, 1), "scale": round(scale, 4), "logo": lg})
    return a["h"] * BIG_GLYPH_BASE * scale

def text_w(text, fs, voice=None, spacing_em=0.06):
    f = ImageFont.truetype(CRI if voice else CIN, max(8, round(fs)))
    t = text if voice else text.upper()
    return f.getlength(t) + (0 if voice else spacing_em * fs * max(0, len(t) - 1))

def stamp(text, X, Y, size, color=None, voice=None, cx=None, glow=None, shadow=None, tag="t"):
    """A type stamp: size = % of the kit's type size; X the text's left edge (or cx its centre), Y the top of its
    capitals. The app draws a stamp on its own canvas with the cap box centred at y 123 and the text starting about
    82 px in (measured on the live board), so the item's x,y back those off."""
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

def portrait(cloneId, aid, X, Y, size):
    """A plain portrait ring (no count chip) with the portrait art filling its face."""
    g = geom["avatarframe"]; shell = g["shell"][2]
    scale = size / shell
    piece(cloneId, X, Y, scale, label="", tag="portrait", base="avatarframe")
    bw = 9 * K  # the clone's wall width at board scale
    face = (shell / 2 - bw - 2.5 * K) * 2 * scale
    cx, cy = X + size / 2, Y + size / 2
    art(aid, cx - face / 2, cy - face / 2, face, tag="face")

from PIL import Image
def frame_zones(ref):
    """The game's card frame, read from its own alpha: the portrait window (transparent), the name band and the
    three orb seats, as fractions of the frame's width and height."""
    im = Image.open(f"{MAKER}/public{ref}").convert("RGBA"); a = im.getchannel("A"); W, H = im.size
    # the contiguous transparent run through the window's middle (the frame's outer margins are transparent too)
    y = int(H * 0.3); x0 = x1 = W // 2
    while x0 > 0 and a.getpixel((x0 - 1, y)) < 20: x0 -= 1
    while x1 < W - 1 and a.getpixel((x1 + 1, y)) < 20: x1 += 1
    x = W // 2; y0 = y1 = y
    while y0 > 0 and a.getpixel((x, y0 - 1)) < 20: y0 -= 1
    while y1 < H - 1 and a.getpixel((x, y1 + 1)) < 20: y1 += 1
    return {"win": (x0 / W, y0 / H, (x1 - x0 + 1) / W, (y1 - y0 + 1) / H),
            "name": (0.5, 0.925), "box": (0.5, 0.52, 0.86), "orbTL": (0.154, 0.105), "orbBL": (0.127, 0.879), "orbBR": (0.871, 0.879)}
ZONES = frame_zones("/kit-art/nightfall/character-gold.webp")

def card(aid, frame_aid, X, Y, W, name, cost, infl, force, line, hero=False):
    """A real card: the portrait art in the frame's own window, the game's frame over it, the name on the frame's
    bottom band, the cost and the two figures in its orb seats, a line of rules text on its parchment."""
    fa = ASSETS[frame_aid]; H = W * fa["h"] / fa["w"]
    wx, wy, ww, wh = ZONES["win"]
    art(aid, X + wx * W, Y + wy * H, ww * W)
    art(frame_aid, X, Y, W, shadow=35)
    nx, ny = ZONES["name"]; name_fs = 44 if hero else 36
    stamp(name, 0, Y + ny * H - 0.62 * TYPE_SIZE * name_fs / 100 / 2, name_fs, CREAM, cx=X + nx * W)
    for (fx, fy), val, ink in ((ZONES["orbTL"], cost, "#F3E6C8"), (ZONES["orbBL"], infl, INK), (ZONES["orbBR"], force, "#F3E6C8")):
        sz = 46 if hero else 38
        stamp(str(val), 0, Y + fy * H - 0.62 * TYPE_SIZE * sz / 100 / 2, sz, ink, cx=X + fx * W)
    # the parchment stays bare: the rules text is the game's, and the fan is a deck preview

# ── the top bar ─────────────────────────────────────────────────────────────────────────────────────────
portrait("copy-avyu-avatarframe", "uanfyou", 62, 40, 140)
stamp("Silverlake Slayer", 230, 50, 46, "#F0D890")
stamp("Collection level 47", 230, 90, 40, DIM_GOLD)
piece("progress", 230, 122, 0.31, stretch=240 / (BASE["progress"][0] * 0.31), v=0.78, tag="xp")
stamp("2,340 / 3,000", 486, 124, 40, PALE)
# the official logo, with a soft gold glow behind it
logo_h = art("uanflogo", 959 - 170, 6, 340, glow=42, glow_ink="#F2C94C", tag="logo")
stamp("History plays different", 0, 6 + logo_h + 6, 40, PALE, cx=959)
piece("currency", 1420, 56, 0.54, label="1,250", tag="coins")
piece("currency", 1606, 56, 0.54, label="38", tag="gems")
piece("iconbtn", 1790, 46, 0.47, tag="settings")

# ── left column: season pass with its art, missions under a painted band ───────────────────────────────
panel_box("panel", 52, 216, 454, 178, tag="season")
stamp("Season Pass", 80, 240, 42, GOLD)
stamp("The Great Migration", 80, 276, 46, CREAM, voice="list")
piece("progress", 80, 338, 0.31, stretch=180 / (BASE["progress"][0] * 0.31), v=0.62, tag="seasonbar")
stamp("Tier 12", 0, 340, 40, GOLD, cx=306)
panel_box("copy-card-panel", 372, 236, 120, 96, scale=0.15, tag="seasonframe")
art("uanfseason", 378, 242, 108, tag="seasonart")
panel_box("panel", 52, 414, 454, 366, tag="missions")
art("uanfmissions", 60, 422, 438)
stamp("Missions", 80, 438, 42, GOLD, shadow=50)
stamp("View all", 0, 442, 40, PALE, cx=430, shadow=50)
ROWS = [("Play 3 Events", "1/3", False), ("Win at Harpers Ferry", "0/1", False), ("Break 2 Threats", "2/2", True), ("Stand on Business once", "0/1", False)]
for i, (txt, cnt, done) in enumerate(ROWS):
    y = 540 + i * 58
    strip_box("copy-done-panel" if done else "copy-rowp-panel", 71, y, 420, 50, tag="row")
    piece("copy-navg-iconbtn", 84, y + 11, 0.17, ov="icon:check" if done else "icon:zap", tag="rowglyph")
    stamp(txt, 126, y + 14, 42, "#7CF0A0" if done else CREAM, voice="list")
    stamp(cnt, 0, y + 17, 40, "#7CF0A0" if done else CREAM, cx=458)

# ── centre: the deck as real cards, the opponent line, Play, the mode tabs ─────────────────────────────
stamp("Your deck", 0, 266, 42, GOLD, cx=959)
card("uanfoshun", "uanfframeamethyst", 648, 340, 170, "Oshun", 4, 4, 5, "Sweet water heals the row.")
card("uanfogun", "uanfframeemerald", 1102, 340, 170, "Ogun", 5, 3, 6, "Iron clears the Gate.")
card("uanfshango", "uanfframegold", 844, 302, 230, "Shango", 6, 6, 6, "Thunder: +2 Force at a Location you lead.", hero=True)
piece("iconbtn", 556, 420, 0.47, ov="icon:back", tag="prev")
piece("iconbtn", 1290, 420, 0.47, ov="icon:forward", tag="next")
items.append({"id": nid("dots"), "libId": "", "kitId": "pagedots", "x": 959 - 124 * 0.45, "y": 612, "scale": 0.45})
stamp("Three orisha with the church behind them,", 0, 636, 40, CREAM, voice="list", cx=959)
stamp("Crowther brings a friend across and Seacole tends the Gates.", 0, 664, 40, CREAM, voice="list", cx=959)
stamp("The Pantheon", 0, 698, 36, DIM_GOLD, cx=959)
portrait("copy-avyu-avatarframe", "uanfyou", 664, 722, 72)
piece("chip", 752, 728, 0.56, label="VS Harborlight · Railroad", tag="vs")
portrait("copy-avop-avatarframe", "uanfopp", 1184, 722, 72)
strip_box("copy-play-panel", 689, 800, 541, 88, tag="play")
stamp("Play", 0, 820, 85, INK, cx=959, tag="playword")
piece("segment", 788, 896, 0.48, label="PvP | Practice | Challenges", tag="modes")

# ── right column: the featured event as a full-bleed picture, the daily shop with its card ─────────────
panel_box("panel", 1410, 216, 464, 352, tag="event")
ev_h = art("uanfevent", 1418, 224, 448)
strip_box("copy-rowp-panel", 1418, 224, 448, 52, tag="evhead")
stamp("Featured event", 1435, 238, 42, GOLD)
stamp("View all", 0, 242, 40, PALE, cx=1796)
strip_box("copy-rowp-panel", 1418, 224 + ev_h - 104, 448, 104, tag="caption")
stamp("Juneteenth Weekend", 1435, 224 + ev_h - 92, 48, CREAM, voice="list")
stamp("2d 14h 12m", 0, 224 + ev_h - 86, 36, PALE, cx=1790)
stamp("Freedom moves together.", 1435, 224 + ev_h - 50, 36, GOLD)
panel_box("panel", 1410, 588, 464, 292, tag="shop")
stamp("Daily shop", 1435, 612, 42, GOLD)
stamp("Refreshes in 12h", 0, 616, 36, PALE, cx=1748)
panel_box("copy-card-panel", 1434, 652, 160, 160, scale=0.2, tag="shopframe")
art("uanfmansa", 1442, 660, 144, tag="shopart")
stamp("Mansa Musa", 1616, 676, 54, CREAM, voice="list")
piece("currency", 1610, 724, 0.5, label="400", tag="price")
stamp("New cards and more", 1435, 836, 40, DIM_GOLD)

# ── the foot: the nav bar with four glyph tabs ─────────────────────────────────────────────────────────
strip_box("copy-barp-panel", 284, 956, 1352, 124, tag="navbar")
for x, icon, word in ((430, "icon:cart", "Shop"), ((430 + 959) / 2 - 20, "icon:scroll", "Collection"), ((959 + 1490) / 2 + 20, "icon:map", "Album"), (1490, "icon:trophy", "Ranks")):
    piece("copy-navg-iconbtn", x - 28, 972, 0.35, ov=icon, tag="nav")
    stamp(word, 0, 1032, 40, GOLD, cx=x)
stamp("People. Places. Power.", 0, 1032, 40, "#8C7A50", cx=959)

board = {"id": "nf-home", "name": "home", "aspect": "169", "bgShow": True, "bgImage": "/kit-art/nightfall/bg.webp", "items": items}
k["boards"] = [board]
json.dump(k, open(KIT, "w"), indent=0, ensure_ascii=False)
print("home board:", len(items), "items")
