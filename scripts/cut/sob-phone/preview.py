#!/usr/bin/env python3
"""preview.png for the phone cut: every piece assembled the way the app would, from the delivered sprites and the
manifest's numbers only (nine-slice, seats, label faces), at 2x phone scale so it reads on a laptop."""
import json, os
from PIL import Image, ImageDraw, ImageFont

S = os.environ.get("CUT_SCRATCH", os.path.expanduser("~/sob-phone-cut"))
D = f"{S}/deliver/mobile"
M = json.load(open(f"{D}/manifest.json"))
P = {p["id"]: p for p in M["pieces"]}
Z = 2.0            # preview px per point
SPR = 3.0          # sprite px per point
CIN = f"{D}/fonts/Cinzel-Bold.ttf"; CRI = f"{D}/fonts/CrimsonPro-SemiBold.ttf"

def load(path):
    return Image.open(f"{D}/{path}").convert("RGBA")

def nine_slice(im, nine_px, out_w, out_h):
    """Stretch a sprite to out_w x out_h sprite px keeping the margins (sprite px)."""
    l, r, t, b = nine_px["left"], nine_px["right"], nine_px["top"], nine_px["bottom"]
    W, H = im.size
    if l + r > out_w:  # too narrow for both margins: shrink them together, as a sprite renderer does
        k = out_w / (l + r); l, r = int(l * k), int(r * k)
    if t + b > out_h:
        k = out_h / (t + b); t, b = int(t * k), int(b * k)
    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    xs = [(0, l, 0, l), (l, W - r, l, out_w - r), (W - r, W, out_w - r, out_w)]
    ys = [(0, t, 0, t), (t, H - b, t, out_h - b), (H - b, H, out_h - b, out_h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            cell = im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS)
            out.alpha_composite(cell, (dx0, dy0))
    return out

def place(canvas, im, x_pt, y_pt, w_pt=None, h_pt=None, nine=None):
    """Draw a sprite so its top-left lands at (x_pt, y_pt) points on the canvas; stretch to w_pt x h_pt if given."""
    if w_pt is not None and nine is not None:
        if round(w_pt * SPR) < 1 or round(h_pt * SPR) < 1:
            return (0, 0)
        im = nine_slice(im, nine, round(w_pt * SPR), round(h_pt * SPR))
    im2 = im.resize((max(1, round(im.width / SPR * Z)), max(1, round(im.height / SPR * Z))), Image.LANCZOS)
    canvas.alpha_composite(im2, (round(x_pt * Z), round(y_pt * Z)))
    return im2.size

def word(canvas, text, cx_pt, cy_pt, lab, fill=None, anchor="mm", face=None):
    fs = lab["fontSize"]
    f = ImageFont.truetype(face or (CRI if lab.get("fontFamily") == "Crimson Pro" else CIN), round(fs * Z))
    t = text.upper() if lab.get("fontFamily") != "Crimson Pro" else text
    d = ImageDraw.Draw(canvas)
    x, y = cx_pt * Z, cy_pt * Z
    for sh in lab.get("dropShadow", []):
        d.text((x + sh["dx"] * Z, y + sh["dy"] * Z), t, font=f, fill=hex_a(sh["color"], sh["opacity"]), anchor=anchor)
    d.text((x, y), t, font=f, fill=fill or lab["fill"], anchor=anchor)

def hex_a(h, a):
    h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(255 * a))

def tinted(im, hexc):
    t = Image.new("RGBA", im.size, hex_a(hexc, 1.0)); t.putalpha(im.getchannel("A")); return t

def plate(canvas, pid, variant, x, y, w=None, h=None):
    p = P[pid]; im = load(p["files"][variant])
    sh = p["at1x"]["shell"]
    # sprite top-left so the SHELL's top-left lands at (x, y)
    place(canvas, im, x - sh["x"], y - sh["y"], None if w is None else w + (p["at1x"]["size"]["w"] - sh["w"]), None if h is None else h + (p["at1x"]["size"]["h"] - sh["h"]), p["nineSlicePx"])
    return p

def button(canvas, pid, state, x, y, w=None, h=None, text=None):
    p = P[pid]; st = p["states"][state]; im = load(st["file"]); sh = st["at1x"]["shell"]
    place(canvas, im, x - sh["x"], y - st["at1x"]["shell"]["y"] + (0 if state != "pressed" else 0), None if w is None else w + (st["at1x"]["size"]["w"] - sh["w"]), None if h is None else h + (st["at1x"]["size"]["h"] - sh["h"]), st["nineSlicePx"])
    ww, hh = (w or sh["w"]), (h or sh["h"])
    lift = p["pressLift1x"] if state == "pressed" else 0
    if text and "label" in st:
        word(canvas, text, x + ww / 2 + st["label"]["seat"]["dx"], y + hh / 2 + st["label"]["seat"]["dy"] + lift, st["label"])
    if "glyph" in p:
        g = load(p["glyph"]["file"]); gs = p["glyph"]["at1x"]
        place(canvas, g, x + ww / 2 + gs["seat"]["dx"] - gs["size"]["w"] / 2, y + hh / 2 + gs["seat"]["dy"] - gs["size"]["h"] / 2 + lift)
    return p

def glow(canvas, kind, x, y, w, h, tint):
    g = [v for v in P["glow"]["variants"] if v["id"] == kind][0]
    im = tinted(load(g["file"]), tint); shp = g["at1x"]["shape"]
    pad_l, pad_t = shp["x"], shp["y"]
    full_w, full_h = w + 2 * pad_l, h + 2 * pad_t
    place(canvas, im, x - pad_l, y - pad_t, full_w, full_h, g["nineSlicePx"])

W_PT, H_PT = 874, 402 + 346
cv = Image.new("RGBA", (round(W_PT * Z), round(H_PT * Z)), (24, 28, 40, 255))
d = ImageDraw.Draw(cv)
cap = ImageFont.truetype(CRI, 22)
def note(x, y, s):
    d.text((x * Z, y * Z), s, font=cap, fill=(170, 176, 190, 255))

# ── row 1: the top bar things ─────────────────────────────────────────────────────────────────────
note(12, 4, "settings · notch-small · notch-danger · lock-in with the timer (default, pressed, disabled)")
button(cv, "settings", "default", 12, 20)
button(cv, "settings", "pressed", 54, 20)
button(cv, "notch-small", "default", 100, 22, 90, 30, "Last turn")
button(cv, "notch-small", "default", 200, 22, 60, 28, "Sound")
button(cv, "notch-danger", "default", 272, 21, 150, 32, "Sit Down")
def lock_in(x, y, state, text, value):
    p = button(cv, "lock-in", state, x, y, text=text)
    lift = p["pressLift1x"] if state == "pressed" else 0
    bs = p["at1x"]["barSeat"]; T = M["bar"]["timerMobile"]
    place(cv, load(T["track"]["file"]), x + bs["x"], y + bs["y"] + lift, bs["w"], bs["h"], T["track"]["nineSlicePx"])
    fw = value * (bs["w"] - 2)
    fill = T["fills"]["warn" if value < 0.25 else "default"]
    place(cv, load(fill["file"]), x + bs["x"] + 1, y + bs["y"] + 1 + lift, fw, 6, fill["nineSlicePx"])
lock_in(436, 10, "default", "Lock In", 0.62)
lock_in(580, 10, "pressed", "Skip", 0.18)
lock_in(724, 10, "disabled", "No target", 0.0)

# ── row 2: turn panel, threat column, seats, meter ────────────────────────────────────────────────
note(12, 72, "turn-panel · threat-panel with tiles (gold, blue, red, split) and force badges · seats with stat pills · meter")
tp = plate(cv, "turn-panel", "default", 12, 88)
lp = tp["at1x"]["leftPart"]; rp = tp["at1x"]["rightPart"]
word(cv, "Turn 4 / 8", 12 + lp["label"]["cx"], 88 + lp["label"]["cy"], tp["label"])
word(cv, "of 4", 12 + rp["label"]["cx"], 88 + rp["label"]["cy"], tp["label"])
d.ellipse(((12 + rp["coin"]["cx"] - 15) * Z, (88 + rp["coin"]["cy"] - 15) * Z, (12 + rp["coin"]["cx"] + 15) * Z, (88 + rp["coin"]["cy"] + 15) * Z), outline=(228, 156, 12, 160), width=2)
for i in range(8):
    d.ellipse(((12 + 14 + i * 10 - 3) * Z, (88 + 34 - 3) * Z, (12 + 14 + i * 10 + 3) * Z, (88 + 34 + 3) * Z), fill=(252, 180, 36, 255) if i < 4 else (90, 80, 60, 255))
# threat column
tx, ty = 176, 84
thp = plate(cv, "threat-panel", "default", tx, ty)
word(cv, "Threats (2)", tx + thp["at1x"]["header"]["cx"], ty + thp["at1x"]["header"]["cy"], thp["label"])
tiles = thp["at1x"]["tiles"]; tt = P["threat-tile"]
for i, (var, nm) in enumerate((("gold", "Redliner"), ("blue", "Picket"), ("red", "Smog"))):
    x0, y0 = tx + tiles["x"], ty + tiles["y"] + i * (tiles["h"] + tiles["gap"])
    d.rectangle((x0 * Z, y0 * Z, (x0 + tiles["w"]) * Z, (y0 + tiles["h"]) * Z), fill=(60, 48, 40, 255))
    plate(cv, "threat-tile", var, x0, y0)
    b = tt["band"]; bs = tt["at1x"]["band"]
    place(cv, load(b["file"]), x0 + bs["x"], y0 + bs["y"], bs["w"], bs["h"], b["nineSlicePx"])
    word(cv, nm, x0 + bs["x"] + bs["w"] / 2, y0 + bs["y"] + bs["h"] / 2, b["label"])
    fb = P["force-badge"]; fbv = ["red", "gold", "green"][i]
    plate(cv, "force-badge", fbv, x0 + tiles["w"] - 15 - 1.5, y0 + tiles["h"] - 15 - 1.5)
    word(cv, str(i + 2), x0 + tiles["w"] - 1.5 - 7.5, y0 + tiles["h"] - 1.5 - 7.5 + 0.3, fb["label"], fill="#0C1C36" if fbv == "gold" else None)
# a split tile and a wide badge beside the column, glowing (can land)
glow(cv, "small", 262, 100, 64, 33, "#FCB424")
d.rectangle((262 * Z, 100 * Z, 326 * Z, 133 * Z), fill=(60, 48, 40, 255))
plate(cv, "threat-tile", "split", 262, 100)
place(cv, load(tt["band"]["file"]), 262 + 1.7, 100 + 1.7, 60.6, 16, tt["band"]["nineSlicePx"])
word(cv, "Taney", 262 + 1.7 + 30.3, 100 + 1.7 + 8, tt["band"]["label"])
plate(cv, "force-badge-wide", "gold", 262 + 64 - 28 - 1.5, 100 + 33 - 15 - 1.5)
word(cv, "3/5", 262 + 64 - 1.5 - 14, 100 + 33 - 1.5 - 7.5 + 0.3, P["force-badge-wide"]["label"], fill="#0C1C36")
# seats + pills
sx0, sy0 = 262, 150
for i, (var, pv) in enumerate((("gold", "gold"), ("blue", "blue"), ("moving", "gold"), ("confronting", "blue"), ("empty", None))):
    x0 = sx0 + i * 34
    if var != "empty":
        d.rectangle((x0 * Z, sy0 * Z, (x0 + 27) * Z, (sy0 + 27) * Z), fill=(70, 56, 46, 255))
    if var == "moving":
        glow(cv, "small", x0, sy0, 27, 27, "#3FD97A")
    plate(cv, "seat", var, x0, sy0)
    if pv:
        pp = plate(cv, "stat-pill", pv, x0 + 1, sy0 + 29)
        cells = pp["at1x"]["cells"]
        word(cv, "4", x0 + 1 + cells["influence"]["cx"], sy0 + 29 + cells["cy"], pp["label"], fill=cells["influence"]["fill"])
        word(cv, "2", x0 + 1 + cells["force"]["cx"], sy0 + 29 + cells["cy"], pp["label"], fill=cells["force"]["fill"])
# meter
mx, my = 450, 96
mt = M["bar"]["meter"]; share = 0.6; bw = 120
plate(cv, "meter", "orb-gold", mx, my); word(cv, "7", mx + 11, my + 11.3, P["meter"]["label"])
place(cv, load(mt["track"]["file"]), mx + 24, my + 8.5, bw, 5, mt["track"]["nineSlicePx"])
place(cv, load(mt["fills"]["gold"]["file"]), mx + 24, my + 8.5, bw * share, 5, mt["fills"]["gold"]["nineSlicePx"])
place(cv, load(mt["fills"]["blue"]["file"]), mx + 24 + bw * share, my + 8.5, bw * (1 - share), 5, mt["fills"]["blue"]["nineSlicePx"])
mk = mt["marker"]; place(cv, load(mk["file"]), mx + 24 + bw * share - mk["at1x"]["size"]["w"] / 2, my + 11 - mk["at1x"]["size"]["h"] / 2)
plate(cv, "meter", "orb-blue", mx + 24 + bw + 2, my); word(cv, "5", mx + 24 + bw + 2 + 11, my + 11.3, P["meter"]["label"])
# nameplates
plate(cv, "np-phone-you", "default", 450, 134); word(cv, "Chevon", 450 + 89, 134 + 22.3, P["np-phone-you"]["label"])
plate(cv, "np-phone-opp", "default", 640, 134); word(cv, "Harborlight", 640 + 89, 134 + 22.3, P["np-phone-opp"]["label"])
note(450, 124, "np-phone-you · np-phone-opp")
# turn call + caption
note(12, 218, "turn-call (gold, red) · caption · stat-plate · icon-close · a plate glow (leader, blue)")
plate(cv, "turn-call", "gold", 12, 234); word(cv, "Turn 2 / of 8", 12 + 150, 234 + 33.3, P["turn-call"]["label"])
plate(cv, "turn-call", "red", 322, 234); word(cv, "Final turn", 322 + 150, 234 + 33.3, P["turn-call"]["label"])
plate(cv, "caption", "default", 12, 310); word(cv, "Harborlight commits Force at the Docks.", 12 + 215, 310 + 23.3, P["caption"]["label"])
plate(cv, "stat-plate", "default", 460, 312); word(cv, "12", 460 + 17, 312 + 15.3, P["stat-plate"]["label"])
button(cv, "icon-close", "default", 504, 310)
button(cv, "icon-close", "pressed", 544, 310)
glow(cv, "plate", 640, 232, 200, 120, "#5AA8FF")
d.rectangle((640 * Z, 232 * Z, 840 * Z, 352 * Z), fill=(38, 44, 60, 255), outline=(60, 70, 90, 255))

# ── row 3: the sheet ──────────────────────────────────────────────────────────────────────────────
note(12, 368, "sheet (gold) with the picture well, three stat plates, title, body and the close · deck-panel (blue) · result-panel (iron) with row plates")
shx, shy = 12, 384
sp = plate(cv, "sheet", "gold", shx, shy, 650, 350)
c = sp["at1x"]["content"]
pw = c["pictureWell"]
d.rectangle(((shx + pw["x"]) * Z, (shy + pw["y"]) * Z, (shx + pw["x"] + pw["w"]) * Z, (shy + pw["y"] + pw["h"]) * Z), fill=(70, 56, 46, 255))
plate(cv, "picture-well", "gold", shx + pw["x"], shy + pw["y"])
for i, spr in enumerate(c["statPlates"]):
    plate(cv, "stat-plate", "default", shx + spr["x"], shy + spr["y"]); word(cv, ["3", "1", "4"][i], shx + spr["x"] + 17, shy + spr["y"] + 15.3, P["stat-plate"]["label"])
word(cv, "Ella Baker", shx + c["title"]["x"], shy + c["title"]["y"], sp["label"], anchor="lm")
bl = sp["bodyLabel"]
fb_ = ImageFont.truetype(CRI, round(bl["fontSize"] * Z))
lines = ["Organizer. Quiet work, loud results: the Student Nonviolent", "Coordinating Committee grew from her kitchen table.", "", "Influence 3 at any Location where you already stand."]
for i, ln in enumerate(lines):
    d.text(((shx + c["body"]["x"]) * Z, (shy + c["body"]["y"] + i * bl["fontSize"] * 1.35) * Z), ln, font=fb_, fill=bl["fill"], anchor="lm")
button(cv, "icon-close", "default", shx + 650 - c["close"]["inset"]["x"] - 32, shy + c["close"]["inset"]["y"])
# deck panel (blue) and result panel (iron), scaled down to fit the strip
dpx, dpy = 674, 384
dp = plate(cv, "deck-panel", "blue", dpx, dpy, 190, 110)
word(cv, "Harborlight", dpx + 95, dpy + 18, P["deck-panel"]["label"])
button(cv, "notch-small", "default", dpx + 12, dpy + 110 - 28 - 10, 40, 24, "<")
button(cv, "notch-small", "default", dpx + 190 - 12 - 40, dpy + 110 - 28 - 10, 40, 24, ">")
rpx, rpy = 674, 508
rp_ = plate(cv, "result-panel", "iron", rpx, rpy, 190, 226)
word(cv, "Draw", rpx + 95, rpy + 26, {**P["result-panel"]["label"], "fontSize": 18})
for i in range(3):
    plate(cv, "row-plate", "default", rpx + 14, rpy + 54 + i * 40, 162, 30)
    word(cv, ["The Docks", "Freedom Hall", "Taney's court"][i], rpx + 14 + 81, rpy + 54 + i * 40 + 15.3, P["row-plate"]["label"])
button(cv, "notch-small", "default", rpx + 20, rpy + 226 - 44, 70, 28, "Again")
button(cv, "notch-danger", "default", rpx + 100, rpy + 226 - 44, 70, 28, "Leave")

cv.convert("RGB").save(f"{D}/preview.png", optimize=True)
print("preview", cv.size, os.path.getsize(f"{D}/preview.png"))
