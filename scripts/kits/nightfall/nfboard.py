#!/usr/bin/env python3
"""Shared helpers for the Nightfall boards on the iPhone 18 Pro landscape stage (874 by 402 points; the maker's
"iphone-pro-l" stage, one stage unit = one point). Positions are the SHELL's top-left in points for pieces (a board
item's x,y is where the piece's own canvas origin lands, so the helpers back the shell origin off; geom-l.json from
probe-kit.mjs), the cap top for stamps, the art's top-left for pictures. Stamp sizes are given in points and turned
into the stamp's percentage of the kit's type size. Each board script builds a Board and calls write(), which merges
that one board into the kit document and leaves the others alone."""
import json, os
from PIL import ImageFont

S = os.environ.get("KIT_SCRATCH", os.path.expanduser("~/nightfall-kit"))
MAKER = os.environ.get("MAKER_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
KIT = os.path.join(MAKER, "src/generator/kit-nightfall.json")
FONT_DISPLAY = os.environ.get("NF_FONT_DISPLAY", f"{S}/fonts/Literata_12pt-Bold.ttf")
FONT_READ = os.environ.get("NF_FONT_READ", f"{S}/fonts/CrimsonPro-SemiBold.ttf")

STAGE = "iphone-pro-l"
SW, SH = 874, 402
SAFE_L, SAFE_R, SAFE_B = 62, 62, 21          # the island's ears and the home indicator, in points
CX = SW / 2
K = 1.22                                     # the board renders pieces at size l
BIG_GLYPH_BASE = 0.5                         # a picture item measures registry w/h × this × scale
BASE = {"panel": (780, 470), "strip": (560 * K, 110 * K), "placeholder": (400, 400), "progress": (520 * K, 64 * K)}
GOLD, DIM_GOLD, CREAM, PALE, INK = "#E6C15A", "#C9A24A", "#F3E6C8", "#D8C8A0", "#2A1E05"
MIN_PT = 11                                  # no word under this (the phone brief)

k = json.load(open(KIT))
geom = json.load(open(f"{S}/kit/probe/geom-l.json"))
ASSETS = {a["id"]: a for a in k["userAssets"]}
TYPE_SIZE = k["cfg"]["type"]["size"]


def text_w(text, pt, voice=None, spacing_em=0.06):
    f = ImageFont.truetype(FONT_READ if voice else FONT_DISPLAY, max(8, round(pt)))
    t = text if voice else text.upper()
    return f.getlength(t) + (0 if voice else spacing_em * pt * max(0, len(t) - 1))


class Board:
    def __init__(self, bid, name, bg):
        self.id, self.name, self.bg = bid, name, bg
        self.items, self.n = [], 0

    def nid(self, tag):
        self.n += 1
        return f"{self.id}-{tag}-{self.n}"

    def piece(self, kitId, X, Y, scale=1.0, stretch=None, stretchY=None, label=None, ov=None, v=None, tag=None, base=None):
        g = geom.get(kitId) or geom.get(base or kitId)
        sx, sy = (g["shell"][0], g["shell"][1]) if g and g.get("shell") else (0, 0)
        it = {"id": self.nid(tag or kitId), "libId": "", "kitId": kitId, "x": round(X - sx * scale, 1), "y": round(Y - sy * scale, 1), "scale": round(scale, 4)}
        if stretch is not None: it["stretch"] = round(min(3, max(0.7, stretch)), 4)
        if stretchY is not None: it["stretchY"] = round(min(3, max(0.7, stretchY)), 4)
        if label is not None: it["label"] = label
        if ov is not None: it["ov"] = ov
        if v is not None: it["v"] = v
        self.items.append(it)
        return it

    def art(self, aid, X, Y, W, glow=None, glow_ink=None, shadow=None, rot=None, tag="art"):
        """A picture from the kit's shipped art: top-left at (X, Y) before any turn, W wide; the height follows."""
        a = ASSETS[aid]
        scale = W / (a["w"] * BIG_GLYPH_BASE)
        lg = {"aid": aid}
        if glow: lg["glow"] = glow
        if glow_ink: lg["glowInk"] = glow_ink
        if shadow: lg["shadow"] = shadow
        it = {"id": self.nid(tag), "libId": "", "x": round(X, 1), "y": round(Y, 1), "scale": round(scale, 4), "logo": lg}
        if rot: it["rot"] = rot
        self.items.append(it)
        return a["h"] * BIG_GLYPH_BASE * scale

    def stamp(self, text, X, Y, pt, color=None, voice=None, cx=None, right=None, glow=None, shadow=None, tag="t"):
        """A type stamp: pt the size in points (never under MIN_PT), X the text's left edge, or cx its centre, or right
        its right edge; Y the top of its capitals. The app draws a stamp on its own canvas with the cap box centred at
        y 123 and the text starting about 82 units in (measured on the live board), so the item backs those off."""
        pt = max(MIN_PT, pt)
        size = round(max(15, pt / TYPE_SIZE * 100), 1)
        fs = TYPE_SIZE * size / 100
        pad_x = 82 + 0.18 * max(0, fs - 14)
        cap_h = (0.9 if voice else 0.62) * fs
        if cx is not None: X = cx - text_w(text, fs, voice) / 2
        if right is not None: X = right - text_w(text, fs, voice)
        st = {"text": text, "size": size}
        if color: st["plain"] = {"color": color}
        if voice: st["voice"] = voice
        if glow: st["glow"] = glow
        if shadow: st["shadow"] = shadow
        self.items.append({"id": self.nid(tag), "libId": "", "x": round(X - pad_x, 1), "y": round(Y + cap_h / 2 - 123, 1), "scale": 1, "stamp": st})
        return text_w(text, fs, voice)

    def panel_box(self, kitId, X, Y, W, H, scale=0.2, tag=None):
        bw, bh = BASE["panel"]
        return self.piece(kitId, X, Y, scale, stretch=W / (bw * scale), stretchY=H / (bh * scale), tag=tag, base="panel")

    def strip_box(self, kitId, X, Y, W, H, tag=None):
        """A panel in its strip pose, H tall and W wide (W at most three times the strip's own width at that height)."""
        bw, bh = BASE["strip"]
        scale = H / bh
        return self.piece(kitId, X, Y, scale, stretch=W / (bw * scale), stretchY=1.0, ov="strip", tag=tag, base="copy-play-panel")

    def portrait(self, cloneId, aid, X, Y, size):
        """A plain portrait ring (no count chip) with the portrait art filling its face."""
        g = geom["avatarframe"]; shell = g["shell"][2]
        scale = size / shell
        self.piece(cloneId, X, Y, scale, label="", tag="portrait", base="avatarframe")
        bw = 9 * K
        face = (shell / 2 - bw - 2.5 * K) * 2 * scale
        cx, cy = X + size / 2, Y + size / 2
        self.art(aid, cx - face / 2, cy - face / 2, face, tag="face")

    def card(self, aid, cx, cy, W, rot=0, shadow=45):
        """One of the deck's pre-composed cards, centred at (cx, cy), W wide, turned rot degrees."""
        a = ASSETS[aid]; H = W * a["h"] / a["w"]
        self.art(aid, cx - W / 2, cy - H / 2, W, shadow=shadow, rot=rot, tag="card")
        return H

    def write(self, order=("nf-start", "nf-match")):
        board = {"id": self.id, "name": self.name, "aspect": STAGE, "bgShow": True, "bgImage": self.bg, "items": self.items}
        boards = [b for b in k.get("boards", []) if b["id"] != self.id] + [board]
        boards.sort(key=lambda b: order.index(b["id"]) if b["id"] in order else 99)
        k["boards"] = boards
        json.dump(k, open(KIT, "w"), indent=0, ensure_ascii=False)
        print(f"{self.id}: {len(self.items)} items; boards now {[b['id'] for b in boards]}")
