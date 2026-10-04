#!/usr/bin/env python3
"""preview.png for round 2: the pieces assembled from the delivered sprites and the manifest's numbers alone, with a
mock home screen at the foot, at 2x phone scale."""
import json, os
from PIL import Image, ImageDraw, ImageFont

S = os.environ.get("CUT_SCRATCH", os.path.expanduser("~/sob-phone-cut"))
D = f"{S}/deliver/mobile-2"
M = json.load(open(f"{D}/manifest.json"))
P = {p["id"]: p for p in M["pieces"]}
Z, SPR = 2.0, 3.0
FONT = {600: f"{D}/fonts/Literata_12pt-SemiBold.ttf", 700: f"{D}/fonts/Literata_12pt-Bold.ttf", 800: f"{D}/fonts/Literata_12pt-ExtraBold.ttf"}

def load(path):
    return Image.open(f"{D}/{path}").convert("RGBA")

def hex_a(h, a):
    h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(255 * a))

def nine_slice(im, nine_px, out_w, out_h):
    l, r, t, b = nine_px["left"], nine_px["right"], nine_px["top"], nine_px["bottom"]
    W, H = im.size
    if l + r > out_w:
        k = out_w / (l + r); l, r = int(l * k), int(r * k)
    if t + b > out_h:
        k = out_h / (t + b); t, b = int(t * k), int(b * k)
    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    for sx0, sx1, dx0, dx1 in [(0, l, 0, l), (l, W - r, l, out_w - r), (W - r, W, out_w - r, out_w)]:
        for sy0, sy1, dy0, dy1 in [(0, t, 0, t), (t, H - b, t, out_h - b), (H - b, H, out_h - b, out_h)]:
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            out.alpha_composite(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS), (dx0, dy0))
    return out

def place(cv, im, x_pt, y_pt, w_pt=None, h_pt=None, nine=None, spr=SPR):
    if w_pt is not None and nine is not None:
        if round(w_pt * spr) < 1 or round(h_pt * spr) < 1:
            return
        im = nine_slice(im, nine, round(w_pt * spr), round(h_pt * spr))
    im2 = im.resize((max(1, round(im.width / spr * Z)), max(1, round(im.height / spr * Z))), Image.LANCZOS)
    cv.alpha_composite(im2, (round(x_pt * Z), round(y_pt * Z)))

def word(cv, text, cx, cy, lab, fill=None, anchor="mm", size=None):
    fs = size or lab["fontSize"]
    f = ImageFont.truetype(FONT.get(lab.get("fontWeight", 700), FONT[700]), round(fs * Z))
    t = text.upper() if lab.get("case") == "upper" else text
    d = ImageDraw.Draw(cv)
    ls = float(str(lab.get("letterSpacing", "0")).replace("em", "")) * fs * Z
    x, y = cx * Z, cy * Z
    # letter spacing by hand: draw glyph by glyph
    widths = [d.textlength(ch, font=f) for ch in t]
    total = sum(widths) + ls * (len(t) - 1)
    if anchor == "mm":
        x0 = x - total / 2
    elif anchor == "rm":
        x0 = x - total
    else:
        x0 = x
    for sh in lab.get("dropShadow", []):
        xx = x0
        for ch, wch in zip(t, widths):
            d.text((xx + sh["dx"] * Z, y + sh["dy"] * Z), ch, font=f, fill=hex_a(sh["color"], sh["opacity"]), anchor="lm"); xx += wch + ls
    xx = x0
    for ch, wch in zip(t, widths):
        d.text((xx, y), ch, font=f, fill=fill or lab["fill"], anchor="lm"); xx += wch + ls

def plate(cv, pid, variant, x, y, w=None, h=None):
    p = P[pid]; im = load(p["files"][variant]); sh = p["at1x"]["shell"]
    place(cv, im, x - sh["x"], y - sh["y"], None if w is None else w + (p["at1x"]["size"]["w"] - sh["w"]), None if h is None else h + (p["at1x"]["size"]["h"] - sh["h"]), p.get("nineSlicePx"))
    return p

def button(cv, pid, state, x, y, w=None, h=None, text=None):
    p = P[pid]; st = p["states"][state]; im = load(st["file"]); sh = st["at1x"]["shell"]
    place(cv, im, x - sh["x"], y - sh["y"], None if w is None else w + (st["at1x"]["size"]["w"] - sh["w"]), None if h is None else h + (st["at1x"]["size"]["h"] - sh["h"]), st["nineSlicePx"])
    ww, hh = (w or sh["w"]), (h or sh["h"])
    lift = p["pressLift1x"] if state == "pressed" else 0
    if text and "label" in st:
        word(cv, text, x + ww / 2 + st["label"]["seat"]["dx"], y + hh / 2 + st["label"]["seat"]["dy"] + lift, st["label"])
    if "glyph" in p:
        g = load(p["glyph"]["file"]); gs = p["glyph"]["at1x"]
        place(cv, g, x + ww / 2 + gs["seat"]["dx"] - gs["size"]["w"] / 2, y + hh / 2 + gs["seat"]["dy"] - gs["size"]["h"] / 2 + lift)
    return p

def tinted(im, hexc):
    t = Image.new("RGBA", im.size, hex_a(hexc, 1.0)); t.putalpha(im.getchannel("A")); return t

W_PT, H_PT = 874, 300 + 402
cv = Image.new("RGBA", (round(W_PT * Z), round(H_PT * Z)), (28, 32, 44, 255))
d = ImageDraw.Draw(cv)
cap = ImageFont.truetype(FONT[600], 22)
def note(x, y, s):
    d.text((x * Z, y * Z), s, font=cap, fill=(170, 176, 190, 255))

# ── row 1: the recoloured buttons ─────────────────────────────────────────────────────────────────
note(12, 4, "settings · notch-small · notch-danger · lock-in with the timer (default, pressed, disabled) · icon-close")
button(cv, "settings", "default", 12, 20); button(cv, "settings", "pressed", 54, 20)
button(cv, "notch-small", "default", 100, 22, 90, 30, "Last turn"); button(cv, "notch-small", "default", 200, 22, 60, 28, "Sound")
button(cv, "notch-danger", "default", 272, 21, 150, 32, "Sit Down")
def lock_in(x, y, state, text, value):
    p = button(cv, "lock-in", state, x, y, text=text)
    lift = p["pressLift1x"] if state == "pressed" else 0
    bs = p["at1x"]["barSeat"]; T = M["bar"]["timerMobile"]
    place(cv, load(T["track"]["file"]), x + bs["x"], y + bs["y"] + lift, bs["w"], bs["h"], T["track"]["nineSlicePx"])
    fill = T["fills"]["warn" if value < 0.25 else "default"]
    place(cv, load(fill["file"]), x + bs["x"] + 1, y + bs["y"] + 1 + lift, value * 98, 6, fill["nineSlicePx"])
lock_in(436, 10, "default", "Lock In", 0.62); lock_in(580, 10, "pressed", "Skip", 0.18); lock_in(724, 10, "disabled", "No target", 0.0)
button(cv, "icon-close", "default", 862 - 32 - 4, 66)

# ── row 2: the turn banner ────────────────────────────────────────────────────────────────────────
note(12, 76, "turn-banner: default and final, with the glow behind")
b = P["turn-banner"]
for i, (var, txt) in enumerate((("default", "Turn 4"), ("final", "Final turn"))):
    x0, y0 = 12 + i * 436, 92
    g = load(b["files"]["glow"]); gs = b["glow"]["spritePx"]
    place(cv, tinted(g, "#FFE9AE" if var == "default" else "#FFB3A0"), x0 - (gs["w"] / SPR - b["at1x"]["size"]["w"]) / 2, y0 - (gs["h"] / SPR - b["at1x"]["size"]["h"]) / 2)
    place(cv, load(b["files"][var]), x0, y0)
    sh = b["at1x"]["shell"]; lab = b["label"] if var == "default" else b["finalLabel"]
    word(cv, txt, x0 + sh["x"] + sh["w"] / 2 + lab["seat"]["dx"], y0 + sh["y"] + sh["h"] / 2 + lab["seat"]["dy"], lab)

# ── row 3: play with the wipe, the orbs, the gold nameplate ───────────────────────────────────────
note(12, 214, "play with the wipe shine (clipped to the face) · play pressed · meter orbs, round · np-you strip, gold face (the web drop-in)")
px, py = 12, 230
button(cv, "play", "default", px, py, text="Play")
wp = P["wipe"]; wim = load(wp["files"]["wipe"])
st = P["play"]["states"]["default"]; sh = st["at1x"]["shell"]
wall = 2.5
face = (round((px + wall) * Z), round((py + wall) * Z), round((px + 220 - wall) * Z), round((py + 58 - wall) * Z))
layer = Image.new("RGBA", cv.size, (0, 0, 0, 0))
place(layer, wim, px + 110, py)
mask = Image.new("L", cv.size, 0); ImageDraw.Draw(mask).rectangle(face, fill=255)
cv.paste(Image.alpha_composite(cv, Image.composite(layer, Image.new("RGBA", cv.size, (0, 0, 0, 0)), mask)), (0, 0))
button(cv, "play", "pressed", 250, 230, text="Play")
mp = plate(cv, "meter", "orb-gold", 494, 248); word(cv, "7", 494 + 11, 248 + 11.3, mp["label"])
plate(cv, "meter", "orb-blue", 524, 248); word(cv, "12", 524 + 11, 248 + 11.3, mp["label"])
npp = P["np-you"]; strip = load(npp["files"]["strip"])
# the strip is stage px at 2x; on the phone the game draws it at half size: 479 stage px -> 240 pt
sc = 0.5
place(cv, strip, 574 - npp["at1x"]["shell"]["x"] * sc, 236 - npp["at1x"]["shell"]["y"] * sc, spr=2 / sc)
d.ellipse(((574 - 20) * Z, (236 + 47.5 * sc - 24) * Z, (574 + 28) * Z, (236 + 47.5 * sc + 24) * Z), fill=(10, 14, 28, 255), outline=(228, 156, 12, 255), width=4)
word(cv, "Chevon", 574 + 60 + 90, 236 + 95 * sc / 2, npp["label"], size=13)

# ── the home screen mock ──────────────────────────────────────────────────────────────────────────
HY = 300
d.rectangle((0, HY * Z, 874 * Z, (HY + 402) * Z), fill=(34, 40, 58, 255))
note(12, HY - 14, "home screen: top-bar, player-plate, currency chips, rank badge, side panels (gold, blue) with mission rows, photo well and the season pass bar, deck stage and name, tabs with glyphs, toast")
tb = P["home/top-bar"]; place(cv, load(tb["files"]["top-bar"]), 0, HY, 874, 48, tb["nineSlicePx"])
word(cv, "Stand on Business", 437, HY + 22, {"fontSize": 18, "fontWeight": 800, "fill": "#FFE9AE", "letterSpacing": "0.08em", "case": "upper", "dropShadow": [{"dx": 0, "dy": 1, "color": "#22304A", "opacity": 0.6}]})
pp = plate(cv, "home/player-plate", "player-plate", 16, HY + 2)
rs = pp["at1x"]["ring"]
d.ellipse(((16 + rs["cx"] - 20) * Z, (HY + 2 + rs["cy"] - 20) * Z, (16 + rs["cx"] + 20) * Z, (HY + 2 + rs["cy"] + 20) * Z), fill=(10, 14, 28, 255), outline=(224, 169, 42, 255), width=4)
word(cv, "Chevon", 16 + pp["at1x"]["name"]["x"], HY + 2 + pp["at1x"]["name"]["cy"], pp["label"], anchor="lm")
word(cv, "Level 12", 16 + pp["at1x"]["level"]["x"], HY + 2 + pp["at1x"]["level"]["cy"], {**pp["label"], "fontSize": 11, "fontWeight": 600, "case": "as typed"}, anchor="lm")
rb = plate(cv, "home/rank-badge", "rank-badge", 254, HY + 2); word(cv, "12", 254 + 22, HY + 2 + 22.3, rb["label"])
for i, amt in enumerate(("1,240", "3")):
    x0 = 874 - 16 - 84 - i * 92
    cc = plate(cv, "home/currency-chip", "currency-chip", x0, HY + 12)
    cs = cc["at1x"]["coin"]
    d.ellipse(((x0 + cs["cx"] - 9) * Z, (HY + 12 + cs["cy"] - 9) * Z, (x0 + cs["cx"] + 9) * Z, (HY + 12 + cs["cy"] + 9) * Z), fill=(245, 200, 66, 255), outline=(144, 80, 0, 255), width=3)
    word(cv, amt, x0 + cc["at1x"]["amount"]["x"], HY + 12 + cc["at1x"]["amount"]["cy"], cc["label"], anchor="lm")
# side panels
pn = plate(cv, "home/panel", "panel-gold", 16, HY + 64, 196, 156)
word(cv, "Missions", 16 + pn["at1x"]["title"]["x"], HY + 64 + pn["at1x"]["title"]["cy"], pn["label"], anchor="lm")
mr = P["home/mission-row"]
for i, (var, txt, cnt) in enumerate((("mission-row", "Win 2 matches", "1/2"), ("mission-row-complete", "Play a Threat", "1/1"), ("mission-row", "Hold the Docks", "0/1"))):
    y0 = HY + 64 + 22 + i * 32
    plate(cv, "home/mission-row", var, 16 + 10, y0)
    word(cv, txt, 16 + 10 + mr["at1x"]["words"]["x"], y0 + mr["at1x"]["words"]["cy"], mr["label"], anchor="lm")
    word(cv, cnt, 16 + 10 + 176 - mr["at1x"]["count"]["insetX"], y0 + mr["at1x"]["count"]["cy"], {**mr["label"], "fontWeight": 700}, anchor="rm")
plate(cv, "home/panel", "panel-blue", 662, HY + 64, 196, 156)
word(cv, "Season pass", 662 + pn["at1x"]["title"]["x"], HY + 64 + pn["at1x"]["title"]["cy"], pn["label"], anchor="lm")
d.rectangle(((662 + 10) * Z, (HY + 64 + 22) * Z, (662 + 10 + 176) * Z, (HY + 64 + 22 + 72) * Z), fill=(70, 56, 46, 255))
plate(cv, "home/photo-well", "photo-well", 662 + 10, HY + 64 + 22)
pg = M["bar"]["progress"]
place(cv, load(pg["track"]["file"]), 662 + 33, HY + 64 + 108, 130, 5, pg["track"]["nineSlicePx"])
place(cv, load(pg["fills"]["default"]["file"]), 662 + 33, HY + 64 + 108, 130 * 0.45, 5, pg["fills"]["default"]["nineSlicePx"])
word(cv, "Tier 4 · 45%", 662 + 98, HY + 64 + 126, {**pn["label"], "fontSize": 10, "letterSpacing": "0.02em", "case": "as typed", "fontWeight": 600})
# deck stage and name
ds = P["home/deck-stage"]
g = load(ds["files"]["glow"]); gs = ds["glow"]["spritePx"]
place(cv, tinted(g, "#FFE9AE"), 437 - gs["w"] / SPR / 2, HY + 300 + 22 - gs["h"] / SPR / 2)
plate(cv, "home/deck-stage", "deck-stage", 437 - 160, HY + 300)
for i in range(5):
    cx = 437 + (i - 2) * 46; rot = (i - 2) * 6
    card = Image.new("RGBA", (round(56 * Z), round(80 * Z)), (0, 0, 0, 0)); ImageDraw.Draw(card).rectangle((0, 0, 56 * Z - 1, 80 * Z - 1), fill=(60, 48, 40, 255), outline=(224, 169, 42, 255), width=3)
    card = card.rotate(-rot, expand=True, resample=Image.BICUBIC)
    cv.alpha_composite(card, (round(cx * Z - card.width / 2), round((HY + 300 - 36) * Z - card.height / 2)))
dn = plate(cv, "home/deck-name", "deck-name", 437 - 150, HY + 196); word(cv, "Harborlight", 437, HY + 196 + 15.3, dn["label"])
# tabs
tabs = P["home/tab"]
names = (("shop", "Shop"), ("collection", "Cards"), ("album", "Album"), ("ranks", "Ranks"))
x0 = 437 - (4 * 100 + 3 * 8) / 2; y0 = HY + 402 - 21 - 32 - 6
for i, (gl, txt) in enumerate(names):
    x = x0 + i * 108
    plate(cv, "home/tab", "tab-selected" if i == 1 else "tab", x, y0)
    gi = tabs["glyphs"][f"glyph-{gl}"]; gsz = gi["at1x"]["size"]; gb = tabs["at1x"]["glyphBeside"]
    place(cv, load(gi["file"]), x + gb["cx"] - gsz["w"] / 2, y0 + gb["cy"] - gsz["h"] / 2)
    word(cv, txt, x + 34, y0 + 16.3, tabs["label"], anchor="lm")
ts = plate(cv, "home/toast", "toast", 437 - 130, HY + 56); word(cv, "Deck saved.", 437, HY + 56 + 20.3, ts["label"])

cv.convert("RGB").save(f"{D}/preview.png", optimize=True)
print("preview", cv.size, os.path.getsize(f"{D}/preview.png"))
