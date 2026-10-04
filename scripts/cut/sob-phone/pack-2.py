#!/usr/bin/env python3
"""Pack round 2 of the Stand on Business phone cut (Brightside colours, Literata faces): crops, nine-slice margins,
glows, label faces, manifest and the fonts, into deliver/mobile-2."""
import json, hashlib, os, shutil, datetime
from PIL import Image, ImageFilter, ImageChops

S = os.environ.get("CUT_SCRATCH", os.path.expanduser("~/sob-phone-cut"))
OUT = f"{S}/cut2/out"
D = f"{S}/cut2/deliver/mobile-2"
PT = 3.0
if os.path.isdir(D):
    shutil.rmtree(D)
for d in ("pieces", "bar", "fonts"):
    os.makedirs(f"{D}/{d}", exist_ok=True)

G = json.load(open(f"{OUT}/geometry.json"))
A = {a["id"]: a for a in json.load(open(f"{OUT}/atoms/atoms.json"))}
R = lambda v, n=2: round(float(v), n)
FS = {"notch-small": 12, "notch-danger": 12, "lock-in": 16, "turn-banner": 30, "play": 24, "meter": 13, "np-you": 13,
      "player-plate": 14, "currency-chip": 12, "panel": 9, "mission-row": 11, "deck-name": 20, "tab": 11, "rank-badge": 18, "toast": 13}

def group_key(r):
    i, v = r["id"], r["variant"]
    if r.get("glyph"):
        return f"{i}/{v}"
    if i == "np-you":
        return f"np-you{r['suffix']}"
    if i == "home":
        base = v.replace("-complete", "").replace("-selected", "")
        base = "panel" if base.startswith("panel-") else base
        return f"home/{base}"
    return i

by_group = {}
for r in G:
    by_group.setdefault(group_key(r), []).append(r)

def alpha_bbox(im):
    return im.getchannel("A").getbbox()

def shell_px(r):
    """The shell in the full canvas's pixels (the raster scale applied)."""
    d = r["raster"]
    vx, vy = r["vb"][0], r["vb"][1]
    sx, sy, sw, sh = r["shell"]
    return ((sx - vx) * d, (sy - vy) * d, sw * d, sh * d)

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def rgba_css(hexc, op):
    hexc = hexc.lstrip("#")
    return f"rgba({int(hexc[0:2], 16)},{int(hexc[2:4], 16)},{int(hexc[4:6], 16)},{op:g})"

def label_block(r, fs_pt, extra=None, unit=PT):
    """The label face from the renderer's text + filter chain, rescaled to the brief's size at 1x."""
    L = r.get("label")
    if not L:
        return None
    d = r["raster"]
    rendered_px = L["fontSize"] * d
    k = (fs_pt * unit) / rendered_px
    sw, sh = r["shell"][2], r["shell"][3]
    cx, cy = r["shell0"][0] + sw / 2, r["shell0"][1] + sh / 2  # the text sits in the rise + lift groups: compare with the shell as drawn
    # the renderer's chain is emboss light, emboss dark, then the cast shadow; a state without emboss has the shadow alone
    qs = [{"dx": R(p["dx"] * d * k / unit), "dy": R(p["dy"] * d * k / unit), "blurStdDev": R(p["blurStdDev"] * d * k / unit), "color": p["color"].upper(), "opacity": p["opacity"]} for p in L["prims"]]
    emboss_on = bool(L.get("embossHi"))
    if len(qs) >= 3 or (len(qs) == 2 and emboss_on):
        emb, drop = qs[:2], qs[2:]
    else:
        emb, drop = [], qs
    css = ", ".join(f"{p['dx']}px {p['dy']}px {R(p['blurStdDev'] * 2)}px {rgba_css(p['color'], p['opacity'])}" for p in drop + emb)
    out = {"fill": L["fill"].upper(), "fontFamily": "Literata", "fontWeight": int(L["fontWeight"]), "fontSize": fs_pt, "letterSpacing": L["letterSpacing"],
           "case": "upper" if r.get("caseRule") == "upper" else "as typed", "text": L["text"],
           "seat": {"dx": R((L["x"] - cx) * d / unit), "dy": R((L["y"] - cy) * d / unit), "anchor": L["anchor"], "baseline": L["baseline"]},
           "dropShadow": drop, "embossLights": emb, "cssTextShadow": css}
    if extra:
        out.update(extra)
    return out

def nine(shell1x, size1x, m):
    return {"left": R(shell1x["x"] + m), "right": R(size1x["w"] - (shell1x["x"] + shell1x["w"]) + m),
            "top": R(shell1x["y"] + m), "bottom": R(size1x["h"] - (shell1x["y"] + shell1x["h"]) + m)}

def crop_group(members, pad=1):
    ims, bb = {}, None
    for r in members:
        im = Image.open(f"{OUT}/{r['file']}").convert("RGBA")
        ims[(r["variant"], r["state"])] = im
        b = alpha_bbox(im)
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    return ims, (bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad)

def glow_from(sprite, pad=36, blur=12, gain=1.7):
    a = sprite.getchannel("A")
    big = Image.new("L", (a.width + 2 * pad, a.height + 2 * pad), 0)
    big.paste(a, (pad, pad))
    bl = big.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: min(255, int(v * gain)))
    bl = ImageChops.lighter(bl, big)
    g = Image.new("RGBA", big.size, (255, 255, 255, 255))
    g.putalpha(bl)
    return g

def shell_rec(r, box, unit=PT):
    sx, sy, sw, sh = shell_px(r)
    return {"x": R((sx - box[0]) / unit), "y": R((sy - box[1]) / unit), "w": R(sw / unit), "h": R(sh / unit)}

def margin_pt(r):
    """Nine-slice margin inside the shell edge at 1x: the notch plus the wall plus a point."""
    d = r["raster"]
    cut = (r["cutPx"] or 0) * d / PT
    return cut + r["wallPx"] * d / PT + 1

pieces = []
def pdir(sub):
    os.makedirs(f"{D}/pieces/{sub}", exist_ok=True)
    return f"{D}/pieces/{sub}"

def pack_button(pid, word=None, fs_pt=None, seats=None, notes=None, section=None, glow_pad=36):
    members = [r for r in by_group[pid] if not r.get("glyph")]
    ims, box = crop_group(members)
    size = (box[2] - box[0], box[3] - box[1])
    d = pdir(pid)
    states = {}
    default_r = next(r for r in members if r["state"] == "default")
    for r in members:
        im = ims[(r["variant"], r["state"])].crop(box)
        f = f"{d}/{r['state']}.png"; im.save(f, optimize=True)
        sh1 = shell_rec(r, box); size1 = {"w": R(size[0] / PT), "h": R(size[1] / PT)}
        ns = nine(sh1, size1, margin_pt(r))
        st = {"file": f"pieces/{pid}/{r['state']}.png", "spritePx": {"w": size[0], "h": size[1]}, "at1x": {"size": size1, "shell": sh1, "nineSlice": ns},
              "nineSlicePx": {k: round(v * PT) for k, v in ns.items()}, "pivot": {"x": 0.5, "y": 0.5}}
        if fs_pt:
            st["label"] = label_block(r, fs_pt)
        st["sha256"] = sha(f)
        states[r["state"]] = st
    gl = glow_from(ims[("default", "default")].crop(box), pad=glow_pad)
    gf = f"{d}/glow.png"; gl.save(gf, optimize=True)
    lift = R((shell_px(next(r for r in members if r["state"] == "pressed"))[1] - shell_px(default_r)[1]) / PT)
    lab = states["default"].get("label") or {}
    p = {"id": pid, "section": section, "appPiece": pid, "engineFamily": f"cut shell, Brightside {default_r['cfgName'].lower()} (sharp:{R((default_r['cutPx'] or 0) / PT)})",
         "word": word, "wordIsLiveText": True,
         "at1x": {"prefW": R(default_r["w"]), "prefH": R(default_r["h"]), "labelDx": lab.get("seat", {}).get("dx", 0), "labelDy": lab.get("seat", {}).get("dy", 0), "labelFontSize": fs_pt},
         "pivot": {"x": 0.5, "y": 0.5}, "pressLift1x": lift,
         "hoverGlow": {"file": f"pieces/{pid}/glow.png", "spritePx": {"w": gl.width, "h": gl.height}, "tint": default_r["effects"]["Glow"],
                       "opacityByState": {"default": 0.0, "hover": 0.45, "pressed": 0.6, "disabled": 0.0},
                       "note": "A white blurred silhouette of the piece, centred behind it, tinted with the kit's Glow colour at the opacity per state. Optional."},
         "states": states}
    if seats:
        p["at1x"].update(seats)
    if notes:
        p["notes"] = notes
    pieces.append(p)
    return p

def pack_plate(pid, group=None, sub=None, names=None, word=None, fs_pt=None, label_extra=None, seats=None, notes=None, section=None, label_from=None, unit=PT, frame=None, glow=None):
    """One state, one or more variants sharing a crop. sub = the folder under pieces/, names = output name per variant.
    frame = (W, H, shellX, shellY) fixes the sprite frame instead of the alpha crop (the nameplate drop-in)."""
    group = group or pid
    members = [r for r in by_group[group] if not r.get("glyph")]
    d = pdir(sub or pid)
    files, hashes, trims = {}, {}, {}
    if frame:
        W, H, fx, fy = frame
        ims, box = {}, None
        for r in members:
            im = Image.open(f"{OUT}/{r['file']}").convert("RGBA")
            sx, sy, sw, sh = shell_px(r)
            box = (round(sx - fx), round(sy - fy), round(sx - fx) + W, round(sy - fy) + H)
            ims[(r["variant"], r["state"])] = im
        size = (W, H)
    else:
        ims, box = crop_group(members)
        size = (box[2] - box[0], box[3] - box[1])
    for r in members:
        name = (names or {}).get(r["variant"], r["variant"])
        im = ims[(r["variant"], r["state"])].crop(box)
        f = f"{d}/{name}.png"; im.save(f, optimize=True)
        files[name] = f"pieces/{sub or pid}/{name}.png"; hashes[name] = sha(f); trims[name] = r["effects"]["Bevel"]
    r0 = members[0]
    sh1 = shell_rec(r0, box, unit); size1 = {"w": R(size[0] / unit), "h": R(size[1] / unit)}
    ns = None if r0.get("ribbon") else nine(sh1, size1, margin_pt(r0) if unit == PT else (r0["wallPx"] * r0["raster"] / unit + 10))
    p = {"id": pid, "section": section, "appPiece": pid, "engineFamily": ("the kit's ribbon banner (stock:ribbonclassic, size l)" if r0.get("ribbon") else f"cut shell, Brightside {r0['cfgName'].lower()} ({'shape ' + r0['shape'] if r0.get('shape') else 'sharp:' + str(R((r0['cutPx'] or 0) / PT))})"),
         "wordIsLiveText": True, "files": files, "spritePx": {"w": size[0], "h": size[1]},
         "at1x": {"size": size1, "shell": sh1, "nineSlice": ns, "prefW": R(r0["w"]), "prefH": R(r0["h"])},
         "nineSlicePx": ({k: round(v * unit) for k, v in ns.items()} if ns else None), "pivot": {"x": 0.5, "y": 0.5}, "trimByVariant": trims}
    if word is not None:
        p["word"] = word
    lr = label_from or next((r for r in members if r.get("label")), None)
    if fs_pt and lr and lr.get("label"):
        p["label"] = label_block(lr, fs_pt, label_extra, unit)
    if seats:
        p["at1x"].update(seats)
    if glow:
        gl = glow_from(ims[(members[0]["variant"], "default")].crop(box), **glow)
        gf = f"{d}/{(names or {}).get(members[0]['variant'], members[0]['variant'])}-glow.png" if sub else f"{d}/glow.png"
        gl.save(gf, optimize=True)
        rel = gf[len(D) + 1:]
        files["glow"] = rel; hashes["glow"] = sha(gf)
        p["glow"] = {"file": rel, "spritePx": {"w": gl.width, "h": gl.height}, "tint": r0["effects"]["Glow"], "note": "the piece's white blurred silhouette, centred behind it; tint and fade as the moment wants"}
    p["sha256"] = hashes
    if notes:
        p["notes"] = notes
    pieces.append(p)
    return p

def pack_glyph(key, sub, name, into, color="#D3A023"):
    r = by_group[key][0]
    im = Image.open(f"{OUT}/{r['file']}").convert("RGBA")
    b = alpha_bbox(im); pad = 2
    box = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    g = im.crop(box)
    f = f"{pdir(sub)}/{name}.png"; g.save(f, optimize=True)
    sx, sy, sw, sh = shell_px(r)
    gcx, gcy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    entry = {"file": f"pieces/{sub}/{name}.png", "spritePx": {"w": g.width, "h": g.height},
             "at1x": {"size": {"w": R(g.width / PT), "h": R(g.height / PT)}, "drawnAt": r["glyphPt"], "seat": {"dx": R((gcx - (sx + sw / 2)) / PT), "dy": R((gcy - (sy + sh / 2)) / PT)}},
             "color": color, "sha256": sha(f), "note": f"the {r['glyph']} glyph on its own (Lucide, stroke), gold {color}, drawn at {r['glyphPt']} pt; centre it on the shell centre plus the seat. Not baked."}
    if isinstance(into, dict) and "glyphs" in into:
        into["glyphs"][name] = entry
    else:
        into["glyph"] = entry
    return entry

# ═══ 1 the round-1 buttons in Brightside ═══════════════════════════════════════════════════════════
p = pack_button("settings", section=1, notes="34 by 34, Brightside parchment face and wall, notched 5. The gear is glyph-gear.png, gold, separate.")
pack_glyph("settings/glyph-gear", "settings", "glyph-gear", p)
pack_button("notch-small", word="Last turn", fs_pt=FS["notch-small"], section=1, notes="120 by 32 drawn, nine-sliced 50 to 260 wide and 26 to 36 tall; Brightside parchment (the kit's own button). Word Literata Bold 12 pt, ink.")
pack_button("notch-danger", word="Sit Down", fs_pt=FS["notch-danger"], section=1, notes="150 by 32, Brightside's red: red face, the kit's parchment wall. Word Literata Bold 12 pt, parchment.")
lock = pack_button("lock-in", word="Lock In", fs_pt=FS["lock-in"], section=1,
                   seats={"wordSeat": {"dx": 0, "dy": -8, "note": "the word 8 pt above the shell centre, as in round 1"},
                          "barSeat": {"x": 17, "y": 37, "w": 100, "h": 8, "note": "relative to the shell's top-left at 1x: 100 by 8, 9 pt up from the shell's bottom edge; bar/timer-track-mobile.png and timer-fill-mobile.png go there"}},
                   notes="134 by 54, Brightside gold (the action gold PLAY wears), notched 8. One frame for LOCK IN, SKIP, NO TARGET and RESULTS. Word Literata ExtraBold 16 pt, ink.")
p = pack_button("icon-close", section=1, notes="32 by 32, Brightside parchment, notched 5. The × is glyph-close.png, gold, separate.")
pack_glyph("icon-close/glyph-close", "icon-close", "glyph-close", p)
# ═══ 2 the turn banner ═════════════════════════════════════════════════════════════════════════════
banner = pack_plate("turn-banner", word="Turn 4 / Final turn", fs_pt=FS["turn-banner"], section=2, names={"default": "default", "final": "final"},
                    label_extra={"note": "the kit's own reading seat on the ribbon: centre line 37.75% down the shell (the panel's measure-true reading centre); the game's 35.3% is within a point of it on a 113 pt banner. Letter spacing 0.08em. TURN 4 and FINAL TURN both fit the panel's reading width."},
                    glow={"pad": 60, "blur": 20, "gain": 1.6},
                    notes="The Brightside ribbon banner at the kit's size l, rasterized so the shell is 420 pt wide (113 tall): the parchment panel with its square corners, the V-notched tails behind, the fold triangles, the kit's gloss and glints. Nothing rounded. final.png is the red pose (red face and tails, the kit's parchment wall), its word parchment. Not nine-sliced: the tails are drawn geometry. glow.png is the white silhouette.")
banner["at1x"]["panel"] = {"x": R(banner["at1x"]["shell"]["x"] + banner["at1x"]["shell"]["w"] * 50 / 372), "y": banner["at1x"]["shell"]["y"], "w": R(banner["at1x"]["shell"]["w"] * 272 / 372), "h": R(banner["at1x"]["shell"]["h"] * 72 / 100), "note": "the front panel inside the sprite at 1x; the tails run outside it to the shell's full width"}
banner["at1x"]["readingWidth"] = R(banner["at1x"]["shell"]["w"] * 0.6806)
banner["finalLabel"] = label_block(next(r for r in by_group["turn-banner"] if r["variant"] == "final"), FS["turn-banner"], {"note": "the final pose's word: parchment on red"})
banner["timeline"] = {"note": "the game's own: board darkens 0 to 250 ms; banner pops 0 to 115%, dips to 96%, back to 102%, settles (150 to 750 ms), bell on the dip at 520 ms; holds; winds to 108% and shrinks away fading (1250 to 1600 ms); board back (1300 to 1800 ms). Pivot centre."}
# ═══ 3 play and the wipe ═══════════════════════════════════════════════════════════════════════════
play = pack_button("play", word="Play", fs_pt=FS["play"], section=3, notes="220 by 58, Brightside gold, notched 10. Word Literata ExtraBold 24 pt, ink. The wipe shine is pieces/wipe/wipe.png.")
os.makedirs(f"{D}/pieces/wipe", exist_ok=True)
w = A["wipe"]; shutil.copy(f"{OUT}/atoms/{w['file']}", f"{D}/pieces/wipe/wipe.png")
pieces.append({"id": "wipe", "section": 3, "appPiece": "wipe", "files": {"wipe": "pieces/wipe/wipe.png"}, "spritePx": w["spritePx"], "at1x": w["at1x"], "recommended": w["recommended"],
               "sha256": {"wipe": sha(f"{D}/pieces/wipe/wipe.png")}, "notes": w["note"] + " Sweep it across PLAY's face from left to right in 0.8 s every 4 s, clipped to the face (the shell inset by the wall)."})
# ═══ 4 the meter's numbers, round ══════════════════════════════════════════════════════════════════
pack_plate("meter", word="7", fs_pt=FS["meter"], section=4, names={"orb-gold": "orb-gold", "orb-blue": "orb-blue"},
           notes="22 by 22 circles: a dark face (the Brightside dark-face recipe over the ring's metal) with a gold ring and a blue ring. Figure Literata ExtraBold 13 pt, light gold, centred; one or two digits fit.")
# ═══ 5 your nameplate's face in gold ═══════════════════════════════════════════════════════════════
np2 = pack_plate("np-you", group="np-you@2x", sub="np-you", names={"strip": "strip"}, word="(your name)", fs_pt=FS["np-you"], section=5, unit=2, frame=(1028, 261, 35, 18),
                 label_extra={"units": "the name's size is the game's (13 pt on the phone, Literata Bold); the shadow numbers here are for 13 pt", "note": "ink on gold: the word keeps the Stand on Business emboss (a warm light below, a deep gold dark above), no cast shadow"},
                 notes="A drop-in for public/art/kit/np-you-strip.webp: the same 1028 by 261 sprite at 2x with the shell at the same place (x 35, y 18, 958 by 190), the Stand on Business gold wall, ring seat and chip untouched, the face now the gold Location frame's gold (Inner Fill #D3A023, highlights toward #F8E878, shadows toward #905000 under the kit's lighting). Units for this piece are stage px at 1x (the 1920 by 1080 stage), as for the web cut.")
np2["pngScale"] = 2
np2["units"] = "stage px at 1x; sprite px at 2x"
np3 = pack_plate("np-you-3x", group="np-you@3x", sub="np-you", names={"strip": "strip@3x"}, section=5, unit=3, frame=(1542, 392, 53, 27),
                 notes="The same strip at 3x for the phone (shell at x 53, y 27, 1437 by 285 sprite px). Units: stage px at 1x.")
np3["pngScale"] = 3
np3["units"] = "stage px at 1x; sprite px at 3x"
# ═══ 6 the home screen ═════════════════════════════════════════════════════════════════════════════
tb = A["top-bar"]; shutil.copy(f"{OUT}/atoms/{tb['file']}", f"{pdir('home')}/top-bar.png")
pieces.append({"id": "home/top-bar", "section": 6, "appPiece": "top-bar", "files": {"top-bar": "pieces/home/top-bar.png"}, "spritePx": tb["spritePx"], "at1x": tb["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in tb["at1x"]["nineSlice"].items()},
               "sha256": {"top-bar": sha(f"{D}/pieces/home/top-bar.png")}, "notes": tb["note"]})
pack_plate("home/player-plate", group="home/player-plate", sub="home", names={"player-plate": "player-plate"}, word="(your name)", fs_pt=FS["player-plate"], section=6,
           seats={"ring": {"cx": 22, "cy": 22, "size": 40, "note": "the 40 pt portrait ring, centred on the plate's left end and hanging past it"}, "name": {"x": 50, "cy": 16, "note": "left edge and centre line, Literata Bold 14 pt"}, "level": {"x": 50, "cy": 32, "note": "Literata SemiBold 11 pt under the name"}, "note": "relative to the shell's top-left at 1x"},
           notes="230 by 44, Brightside parchment, notched 8.")
pack_plate("home/currency-chip", group="home/currency-chip", sub="home", names={"currency-chip": "currency-chip"}, word="1,240", fs_pt=FS["currency-chip"], section=6,
           seats={"coin": {"cx": 13, "cy": 12, "size": 20, "note": "the kit's coin (Ducats) or crown, 20 pt, at the left end"}, "amount": {"x": 26, "cy": 12, "note": "left edge and centre line, Literata Bold 12 pt, as typed"}},
           notes="84 by 24, Brightside parchment, notched 4, nine-sliced for a longer amount.")
pack_plate("home/panel", group="home/panel", sub="home", names={"panel-gold": "panel-gold", "panel-blue": "panel-blue"}, word="(a tracked title)", fs_pt=FS["panel"], section=6,
           seats={"title": {"x": 12, "cy": 11, "note": "left edge and centre line at the top, Literata Bold 9 pt, letter spacing 2 pt (0.22em), upper case"}, "content": {"x": 10, "y": 22, "note": "rows start here; the panel stretches 70 to 156 tall through the centre cell"}},
           notes="196 by 70 drawn, nine-sliced to 156; the side panels in a light gold (Brightside's light gold face) and a light blue. Notched 8.")
pack_plate("home/mission-row", group="home/mission-row", sub="home", names={"mission-row": "mission-row", "mission-row-complete": "mission-row-complete"}, word="(the mission)", fs_pt=FS["mission-row"], section=6,
           seats={"words": {"x": 8, "cy": 13.5, "note": "left, Literata SemiBold 11 pt, as typed"}, "count": {"anchor": "right", "insetX": 8, "cy": 13.5, "note": "right, Literata Bold 11 pt"}},
           notes="176 by 27, notched 5: parchment, and the complete pose in Brightside's green face.")
pack_plate("home/photo-well", group="home/photo-well", sub="home", names={"photo-well": "photo-well"}, section=6, notes="176 by 72, notched 8, frame only: the Location photograph shows through the hole.")
pack_plate("home/deck-stage", group="home/deck-stage", sub="home", names={"deck-stage": "deck-stage"}, section=6, glow={"pad": 48, "blur": 16, "gain": 1.6},
           notes="320 by 44, notched 10: a light-gold plinth with a strong inner glow; the cards stand on its top edge. deck-stage-glow.png is its white silhouette to light it from behind.")
pack_plate("home/deck-name", group="home/deck-name", sub="home", names={"deck-name": "deck-name"}, word="(the deck's name)", fs_pt=FS["deck-name"], section=6, notes="300 by 30, parchment, notched 6. Word Literata ExtraBold 20 pt, ink, centred.")
tab = pack_plate("home/tab", group="home/tab", sub="home", names={"tab": "tab", "tab-selected": "tab-selected"}, word="(the tab)", fs_pt=FS["tab"], section=6,
                 seats={"glyphBeside": {"cx": 20, "cy": 16, "note": "the glyph 18 pt at the left, the word from x 34"}, "glyphAbove": {"cx": 50, "cy": 10, "note": "or the glyph above a 9 pt word on the centre line at y 25"}},
                 notes="100 by 32, notched 6: parchment, and the selected pose in Brightside gold. Glyphs gold, separate: glyph-shop (cart), glyph-collection (layers), glyph-album (image), glyph-ranks (trophy).")
tab["glyphs"] = {}
for nm in ("shop", "collection", "album", "ranks"):
    pack_glyph(f"home/glyph-{nm}", "home", f"glyph-{nm}", tab)
pack_plate("home/rank-badge", group="home/rank-badge", sub="home", names={"rank-badge": "rank-badge"}, word="12", fs_pt=FS["rank-badge"], section=6, notes="44 by 44, Brightside gold, notched 8. The rank Literata ExtraBold 18 pt, ink, centred.")
pack_plate("home/toast", group="home/toast", sub="home", names={"toast": "toast"}, word="(a short notice)", fs_pt=FS["toast"], section=6, notes="260 by 40, parchment, notched 7, nine-sliced. Literata SemiBold 13 pt, ink, as typed, centred.")
# the season pass bar lives with the other bars
def bar_entry(track_id, fills, extra):
    t = A[track_id]; shutil.copy(f"{OUT}/atoms/{t['file']}", f"{D}/bar/{t['file']}")
    e = {"track": {"file": f"bar/{t['file']}", "spritePx": t["spritePx"], "at1x": t["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in t["at1x"]["nineSlice"].items()}, "wellColor": t.get("wellColor"), "pivot": {"x": 0.5, "y": 0.5}, "sha256": sha(f"{D}/bar/{t['file']}"), "note": t["note"]}, "fills": {}}
    for key, fid in fills.items():
        f = A[fid]; shutil.copy(f"{OUT}/atoms/{f['file']}", f"{D}/bar/{f['file']}")
        e["fills"][key] = {"file": f"bar/{f['file']}", "spritePx": f["spritePx"], "at1x": f["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in f["at1x"]["nineSlice"].items()}, "colors": {"gradient": f.get("colors"), "note": "bottom to top as drawn"}, "pivot": {"x": 0.5, "y": 0.5}, "sha256": sha(f"{D}/bar/{f['file']}"), "note": f["note"]}
    e.update(extra)
    return e
bar = {
    "timerMobile": bar_entry("timer-track-mobile", {"default": "timer-fill-mobile", "warn": "timer-fill-mobile-warn"}, {"id": "timer-mobile", "note": "The plan timer inside Lock In, Brightside: an 8 pt track with notched ends and a 6 pt fill inside it at inset 1. Fill rect = (1, 1, value times 98, 6) at 1x; nine-slice the fill. The warn fill is Brightside's red.", "geometryAt1x": {"trackShell": {"x": 0, "y": 0, "w": 100, "h": 8}, "fillInset": 1, "fillFullWidth": 98, "fillH": 6, "warnBelow": 0.25}}),
    "progress": bar_entry("progress-track", {"default": "progress-fill"}, {"id": "progress", "note": "The season pass bar on the home screen: 130 by 5, track and fill the same size; fill width = value times 130, nine-sliced.", "geometryAt1x": {"trackShell": {"x": 0, "y": 0, "w": 130, "h": 5}, "fillInset": 0, "fillFullWidth": 130}}),
}
# ═══ fonts ═════════════════════════════════════════════════════════════════════════════════════════
for f in ("Literata_12pt-SemiBold.ttf", "Literata_12pt-Bold.ttf", "Literata_12pt-ExtraBold.ttf", "literata-OFL.txt"):
    shutil.copy(f"{S}/cut2/fonts/{f}", f"{D}/fonts/{f}")
for f in ("CrimsonPro-SemiBold.ttf", "crimsonpro-OFL.txt"):
    shutil.copy(f"{S}/cut/fonts/{f}", f"{D}/fonts/{f}")

manifest = {
    "kit": "Stand on Business, in the Brightside kit's colours",
    "cut": "phone board, round 2: docs/ui-kit-cut/mobile-brief-2.md. The round-1 buttons recoloured in Brightside, the turn banner, PLAY and its wipe, the meter's numbers round, your nameplate's gold face, the home screen's pieces.",
    "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "pngScale": 3,
    "units": "Every number under `at1x` is in points (1x) on the 874 by 402 landscape stage; sprite px are 3x. Exception: the np-you pieces say their own scale (stage px, 2x and 3x sprites), as the web cut did.",
    "stage": {"w": 874, "h": 402, "homeBar": 21},
    "face": {"family": "Literata", "opticalSize": "12pt", "files": {"600": "fonts/Literata_12pt-SemiBold.ttf", "700": "fonts/Literata_12pt-Bold.ttf", "800": "fonts/Literata_12pt-ExtraBold.ttf"},
             "source": "https://fonts.google.com/specimen/Literata", "weights": [600, 700, 800], "case": "upper for button words, titles and the banner; as typed for names, amounts, missions and notices",
             "letterSpacing": "0.02em on words, 0.08em on the banner, 0.22em on the 9 pt tracked titles; per piece under label",
             "note": "The display face. Size, weight, fill per state, shadow and seat are per piece under pieces[].label (per state for buttons). Card names: Literata Bold, line height 1.13 em (the game's rule, no piece here carries them)."},
    "bodyFace": {"family": "Crimson Pro", "file": "fonts/CrimsonPro-SemiBold.ttf", "weight": 600, "note": "The reading face stays Crimson Pro; no round-2 piece carries a reading-face seat, the file travels for completeness."},
    "colours": {"parchment": ["#F0F0E4", "#DFD6C4"], "lightGold": "#FFE9AE", "ink": "#22304A", "glyphGold": "#D3A023", "brightsideFace": "#FAF6ED", "brightsideWall": "#DFD6C4",
                "colourways": {"BASE": "the kit's button: parchment face #FAF6ED, wall #DFD6C4, glow #FFE9AE", "GOLD": "face #F5C842, wall #E0A92A, highlight #FFF3C4, glow #FFE9AE (PLAY, Lock In, the selected tab, the rank badge)",
                               "RED": "face #D9463A, the kit's parchment wall, glow #FFB3A0 (Sit Down, the final-turn banner)", "GREEN": "face #6CC46A, parchment wall (a mission complete)",
                               "PANELGOLD": "face #FFE9AE, wall #E9CC7A (the gold side panel, the deck stage)", "PANELBLUE": "face #DCE9FA, wall #9FBDE3 (the blue side panel)",
                               "ORBGOLD / ORBBLUE": "dark face, ring #D3A023 or #4A90E2"},
                "note": "Brightside has one button look (parchment); the gold, red, green and blue colourways are its bevel recipe in those metals, derived for this cut and listed here so they can be matched in code."},
    "states": {"buttons": ["default", "hover", "pressed", "disabled"], "note": "Hover included because the kit draws it. All states of one piece share one crop. Plates have one state."},
    "shape": {"rule": "notched (chamfered) corners and straight edges everywhere; the cut per piece is in engineFamily (sharp:<cut> in points). The meter orbs are circles by the brief's exception. The ribbon's panel has the kit's square corners and V-notched tails."},
    "pieces": pieces,
    "bar": bar,
    "composition": {
        "lockInAndBar": {"lockInShell": {"x": 0, "y": 0, "w": 134, "h": 54}, "barSeat": lock["at1x"]["barSeat"], "wordSeat": lock["at1x"]["wordSeat"]},
        "turnBanner": {"size": {"w": banner["at1x"]["shell"]["w"], "h": banner["at1x"]["shell"]["h"]}, "wordCentreYFraction": 0.3775, "pivot": "centre", "note": "centre it on the board; the glow behind at the pop"},
        "playAndWipe": {"play": {"w": 220, "h": 58}, "wipe": {"w": 80, "h": 58, "sweep": "x from -80 to 220 over 0.8 s every 4 s, clipped to the face"}},
        "home": {"topBar": {"x": 0, "y": 0, "w": 874, "h": 48}, "playerPlate": {"x": 16, "y": 2, "w": 230, "h": 44}, "currencyChips": {"y": 12, "w": 84, "h": 24, "gap": 8, "anchor": "top-right"},
                 "sidePanels": {"w": 196, "left": {"x": 16, "y": 64}, "right": {"x": 662, "y": 64}}, "deckStage": {"cx": 437, "y": 300, "w": 320, "h": 44}, "deckName": {"cx": 437, "y": 262, "w": 300, "h": 30},
                 "tabs": {"y": 402 - 21 - 32 - 6, "w": 100, "h": 32, "gap": 8, "centred": True}, "rankBadge": {"x": 254, "y": 2, "w": 44, "h": 44}, "toast": {"cx": 437, "y": 56, "w": 260, "h": 40},
                 "note": "a suggested layout at 1x for the home screen; the brief fixed sizes, not seats"},
        "veil": {"color": "#22304A", "opacity": 0.6, "note": "the board's darkening under the turn banner; drawn by the game"},
    },
    "notUsedFromRound1": ["threat-panel", "np-phone-you / np-phone-opp", "glow (the game draws its own)"],
    "skipped": ["everything round 1 delivered that the brief did not ask to recolour (seats, tiles, badges, pills, sheet, panels) stays as cut", "a Unity package"],
    "engineExportBuild": "renderer road (renderCutShell, renderKit ribbonbanner), maker branch claude/mobile-cut",
    "notices": ["fonts/literata-OFL.txt", "fonts/crimsonpro-OFL.txt"],
}
json.dump(manifest, open(f"{D}/manifest.json", "w"), indent=1)
tot = sum(os.path.getsize(os.path.join(root, f)) for root, _, files in os.walk(D) for f in files)
print("pieces", len(pieces), "bytes", tot)
