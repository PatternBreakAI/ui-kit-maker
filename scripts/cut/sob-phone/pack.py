#!/usr/bin/env python3
"""Pack the Stand on Business phone cut: crops, nine-slice margins, composites, label faces, manifest, README."""
import json, hashlib, os, shutil, datetime, re
from PIL import Image, ImageFilter, ImageChops, ImageDraw

S = os.environ.get("CUT_SCRATCH", os.path.expanduser("~/sob-phone-cut"))
OUT = f"{S}/out"
D = f"{S}/deliver/mobile"
PT = 3.0
if os.path.isdir(D):
    shutil.rmtree(D)
os.makedirs(f"{D}/pieces", exist_ok=True)
os.makedirs(f"{D}/bar", exist_ok=True)
os.makedirs(f"{D}/fonts", exist_ok=True)

G = json.load(open(f"{OUT}/geometry.json"))
A = {a["id"]: a for a in json.load(open(f"{OUT}/atoms/atoms.json"))}
R = lambda v, n=2: round(float(v), n)

# ── the brief's numbers per piece id (points) ────────────────────────────────────────────────────────
FS = {"notch-small": 12, "notch-danger": 12, "lock-in": 16, "turn-panel": 11, "threat-panel": 11, "threat-tile": 11,
      "force-badge": 11, "stat-pill": 11, "meter": 12, "sheet": 20, "sheet-body": 15, "stat-plate": 12,
      "np-phone-you": 13, "np-phone-opp": 13, "turn-call": 22, "caption": 16, "deck-panel": 18, "result-panel": 28,
      "row-plate": 12}
BTN_IDS = {"settings", "notch-small", "notch-danger", "lock-in", "icon-close"}
# crop groups: every member of a group shares one crop
def group_key(r):
    i, v = r["id"], r["variant"]
    if r.get("glyph"):
        return f"{i}/{v}"
    if i == "force-badge":
        return "force-badge-wide" if v.startswith("wide-") else "force-badge"
    if i == "result-panel" and v == "row-plate":
        return "row-plate"
    if i == "sheet" and v == "body-face":
        return "sheet-body"
    return i

by_group = {}
for r in G:
    by_group.setdefault(group_key(r), []).append(r)

def alpha_bbox(im):
    return im.getchannel("A").getbbox()

def shell_px(r):
    vx, vy = r["vb"][0], r["vb"][1]
    sx, sy, sw, sh = r["shell"]
    return (sx - vx, sy - vy, sw, sh)

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def rgba_css(hexc, op):
    hexc = hexc.lstrip("#")
    r, g, b = int(hexc[0:2], 16), int(hexc[2:4], 16), int(hexc[4:6], 16)
    return f"rgba({r},{g},{b},{op:g})"

def label_block(r, fs_pt, extra=None):
    """The label face from the renderer's own text and filter chain, rescaled to the brief's size at 1x."""
    L = r.get("label")
    if not L:
        return None
    rendered = L["fontSize"]
    k = (fs_pt * PT) / rendered  # the renderer fit the sample word; the shadow scales with the size
    # the text sits inside the rise + lift groups, whose translation data-shell already carries: measure it
    # against the shell as drawn (x 40, y 32, the cut road's fixed origin) in SVG user space
    sw, sh = r["shell"][2], r["shell"][3]
    cx, cy = 40 + sw / 2, 32 + sh / 2
    hi = (L.get("embossHi") or "").lower(); sh = (L.get("embossSh") or "").lower()
    drop, emb = [], []
    for p in L["prims"]:
        q = {"dx": R(p["dx"] * k / PT), "dy": R(p["dy"] * k / PT), "blurStdDev": R(p["blurStdDev"] * k / PT), "color": p["color"].upper(), "opacity": p["opacity"]}
        (emb if p["color"].lower() in (hi, sh) else drop).append(q)
    css = ", ".join(f"{p['dx']}px {p['dy']}px {R(p['blurStdDev'] * 2)}px {rgba_css(p['color'], p['opacity'])}" for p in drop + emb)
    fam = "Crimson Pro" if "Crimson" in (L.get("fontFamily") or "") else "Cinzel"
    out = {"fill": L["fill"], "fontFamily": fam, "fontSize": fs_pt, "fontWeight": int(L["fontWeight"]), "letterSpacing": L["letterSpacing"],
           "text": L["text"], "seat": {"dx": R((L["x"] - cx) / PT), "dy": R((L["y"] - cy) / PT), "anchor": L["anchor"], "baseline": L["baseline"]},
           "dropShadow": drop, "embossLights": emb, "cssTextShadow": css}
    if extra:
        out.update(extra)
    return out

def nine(shell1x, size1x, cut_pt, wall_pt):
    m = cut_pt + wall_pt + 1
    return {"left": R(shell1x["x"] + m), "right": R(size1x["w"] - (shell1x["x"] + shell1x["w"]) + m),
            "top": R(shell1x["y"] + m), "bottom": R(size1x["h"] - (shell1x["y"] + shell1x["h"]) + m)}

def crop_group(members, pad=1):
    ims = {}
    bb = None
    for r in members:
        if r.get("previewOnly"):
            continue
        im = Image.open(f"{OUT}/{r['file']}").convert("RGBA")
        ims[(r["variant"], r["state"])] = im
        b = alpha_bbox(im)
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    box = (bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad)
    return ims, box

def glow_from(sprite):
    """A white blurred silhouette of the piece, centred, for the app to tint (the web cut's hoverGlow)."""
    pad = 36
    a = sprite.getchannel("A")
    big = Image.new("L", (a.width + 2 * pad, a.height + 2 * pad), 0)
    big.paste(a, (pad, pad))
    bl = big.filter(ImageFilter.GaussianBlur(12))
    bl = bl.point(lambda v: min(255, int(v * 1.7)))
    bl = ImageChops.lighter(bl, big)
    g = Image.new("RGBA", big.size, (255, 255, 255, 255))
    g.putalpha(bl)
    return g, pad

pieces = []
piece_dir = lambda pid: (os.makedirs(f"{D}/pieces/{pid}", exist_ok=True) or f"{D}/pieces/{pid}")

def shell_rec(r, box):
    sx, sy, sw, sh = shell_px(r)
    return {"x": R((sx - box[0]) / PT), "y": R((sy - box[1]) / PT), "w": R(sw / PT), "h": R(sh / PT)}

def common(r, box, size):
    cut_pt, wall_pt = r["cutPx"] / PT, r["wallPx"] / PT
    sh1 = shell_rec(r, box)
    size1 = {"w": R(size[0] / PT), "h": R(size[1] / PT)}
    return cut_pt, wall_pt, sh1, size1

# ── buttons: four states in one crop, glow.png, label per state ──────────────────────────────────────
def pack_button(pid, word=None, fs_pt=None, label_extra=None, seats=None, notes=None, section=None):
    members = [r for r in by_group[pid] if not r.get("glyph")]
    ims, box = crop_group(members)
    size = (box[2] - box[0], box[3] - box[1])
    d = piece_dir(pid)
    states = {}
    default_r = next(r for r in members if r["state"] == "default")
    for r in members:
        im = ims[(r["variant"], r["state"])].crop(box)
        f = f"{d}/{r['state']}.png"; im.save(f, optimize=True)
        cut_pt, wall_pt, sh1, size1 = common(r, box, size)
        ns = nine(sh1, size1, cut_pt, wall_pt)
        st = {"file": f"pieces/{pid}/{r['state']}.png", "spritePx": {"w": size[0], "h": size[1]},
              "at1x": {"size": size1, "shell": sh1, "nineSlice": ns}, "nineSlicePx": {k: round(v * PT) for k, v in ns.items()},
              "pivot": {"x": 0.5, "y": 0.5}}
        if fs_pt:
            st["label"] = label_block(r, fs_pt, label_extra)
        st["sha256"] = sha(f)
        states[r["state"]] = st
    gl, _ = glow_from(ims[("default", "default")].crop(box))
    gf = f"{d}/glow.png"; gl.save(gf, optimize=True)
    lift = R((shell_px(next(r for r in members if r["state"] == "pressed"))[1] - shell_px(default_r)[1]) / PT)
    sh1 = states["default"]["at1x"]["shell"]
    p = {"id": pid, "section": section, "appPiece": pid, "engineFamily": f"cut shell ({default_r['cfgName'].lower()} design, sharp:{R(default_r['cutPx'] / PT)})",
         "word": word, "wordIsLiveText": True,
         "at1x": {"prefW": R(default_r["w"]), "prefH": R(default_r["h"]), "labelDx": states["default"].get("label", {}).get("seat", {}).get("dx", 0) if fs_pt else 0,
                  "labelDy": states["default"].get("label", {}).get("seat", {}).get("dy", 0) if fs_pt else 0, "labelFontSize": fs_pt},
         "pivot": {"x": 0.5, "y": 0.5}, "pressLift1x": lift,
         "hoverGlow": {"file": f"pieces/{pid}/glow.png", "spritePx": {"w": gl.width, "h": gl.height}, "tint": default_r["effects"]["Glow"],
                       "opacityByState": {"default": 0.0, "hover": 0.45, "pressed": 0.6, "disabled": 0.0},
                       "note": "A white blurred silhouette of the piece, centred behind it, tinted with the kit's Glow colour at the opacity per state. Optional; a phone has no hover, so pressed is the one that matters."},
         "states": states}
    if seats:
        p["at1x"].update(seats)
    if notes:
        p["notes"] = notes
    pieces.append(p)
    return p

# ── plates: one state, one or more variants sharing a crop ──────────────────────────────────────────
def pack_plate(pid, group=None, variants=None, word=None, fs_pt=None, label_extra=None, seats=None, notes=None, section=None, extra_files=None, label_from=None, out_names=None):
    group = group or pid
    members = [r for r in by_group[group] if not r.get("glyph") and not r.get("previewOnly")]
    if variants:
        members = [r for r in members if r["variant"] in variants]
    ims, box = crop_group(members)
    size = (box[2] - box[0], box[3] - box[1])
    d = piece_dir(pid)
    files, hashes, trims = {}, {}, {}
    for r in members:
        name = (out_names or {}).get(r["variant"], r["variant"])
        im = ims[(r["variant"], r["state"])].crop(box)
        f = f"{d}/{name}.png"; im.save(f, optimize=True)
        files[name] = f"pieces/{pid}/{name}.png"; hashes[name] = sha(f); trims[name] = r["effects"]["Bevel"]
    r0 = members[0]
    cut_pt, wall_pt, sh1, size1 = common(r0, box, size)
    ns = nine(sh1, size1, cut_pt, wall_pt)
    p = {"id": pid, "section": section, "appPiece": pid, "engineFamily": f"cut shell (sharp:{R(r0['cutPx'] / PT)})", "wordIsLiveText": True,
         "files": files, "spritePx": {"w": size[0], "h": size[1]},
         "at1x": {"size": size1, "shell": sh1, "nineSlice": ns, "prefW": R(r0["w"]), "prefH": R(r0["h"])}, "nineSlicePx": {k: round(v * PT) for k, v in ns.items()},
         "pivot": {"x": 0.5, "y": 0.5}, "trimByVariant": trims}
    if word is not None:
        p["word"] = word
    lr = label_from or r0
    if fs_pt and lr.get("label"):
        p["label"] = label_block(lr, fs_pt, label_extra)
    if seats:
        p["at1x"].update(seats)
    if extra_files:
        for k, (src, note) in extra_files.items():
            shutil.copy(src, f"{d}/{k}.png"); files[k] = f"pieces/{pid}/{k}.png"; hashes[k] = sha(f"{d}/{k}.png")
            p.setdefault("extraNotes", {})[k] = note
    p["sha256"] = hashes
    if notes:
        p["notes"] = notes
    pieces.append(p)
    return p, ims, box, members

def pack_glyph(pid, key, name, button_piece):
    r = by_group[key][0]
    im = Image.open(f"{OUT}/{r['file']}").convert("RGBA")
    b = alpha_bbox(im); pad = 2
    box = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    g = im.crop(box)
    f = f"{D}/pieces/{pid}/{name}.png"; g.save(f, optimize=True)
    sx, sy, sw, sh = shell_px(r)
    gcx, gcy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    button_piece["glyph"] = {"file": f"pieces/{pid}/{name}.png", "spritePx": {"w": g.width, "h": g.height},
                             "at1x": {"size": {"w": R(g.width / PT), "h": R(g.height / PT)}, "drawnAt": r["glyphPt"], "seat": {"dx": R((gcx - (sx + sw / 2)) / PT), "dy": R((gcy - (sy + sh / 2)) / PT)}},
                             "color": "#FCB424", "sha256": sha(f),
                             "note": f"the kit's {r['glyph']} glyph on its own (Lucide, stroke), gold, drawn at {r['glyphPt']} pt; centre it on the button's shell centre plus the seat. Not baked into the button."}

# ═══ 1 settings ═════════════════════════════════════════════════════════════════════════════════════
p = pack_button("settings", section=1, notes="34 by 34, navy face, gold trim, notched 5. The gear is glyph-gear.png, separate.")
pack_glyph("settings", "settings/glyph-gear", "glyph-gear", p)
# ═══ 2 notched buttons ══════════════════════════════════════════════════════════════════════════════
pack_button("notch-small", word="Last turn", fs_pt=FS["notch-small"], section=2,
            notes="Drawn 120 by 32 at 1x, nine-sliced: stretch 50 to 160 wide and 28 to 34 tall through the centre cell. The word is the app's; the label face is for 12 pt, the smallest the brief allows is 11.")
pack_button("notch-danger", word="Sit Down", fs_pt=FS["notch-danger"], section=2,
            notes="150 by 32, the kit's red (gold trim, red face, the small button's design). Nine-sliced like notch-small.")
# ═══ 3 lock in ══════════════════════════════════════════════════════════════════════════════════════
lock = pack_button("lock-in", word="Lock In", fs_pt=FS["lock-in"], section=3,
                   seats={"wordSeat": {"dx": 0, "dy": -8, "note": "the word rides 8 pt above the shell centre (centre line 19 pt below the shell top) so the bar has the foot"},
                          "barSeat": {"x": 17, "y": 37, "w": 100, "h": 8, "note": "relative to the shell's top-left at 1x: 100 by 8, 9 pt up from the shell's bottom edge; use bar/timer-track-mobile.png and timer-fill-mobile.png there (or the web cut's timer at 8 pt tall)"}},
                   notes="134 by 54, parchment face, gold trim, notched 8. One frame for LOCK IN, SKIP, NO TARGET and RESULTS; the app writes the word. Pressed moves the shell down pressLift1x in the same crop; the word and the bar ride with it.")
# ═══ 4 turn panel ═══════════════════════════════════════════════════════════════════════════════════
pack_plate("turn-panel", section=4, word="Turn 4 / 8", fs_pt=FS["turn-panel"],
           seats={"leftPart": {"x": 0, "y": 0, "w": 105, "h": 50, "label": {"cx": 52.5, "cy": 17, "note": "TURN 4 / 8 centred here, 11 pt"}, "crownsRow": {"cx": 52.5, "cy": 34, "note": "the kit's turn-tracker crowns, one per turn, up to 9, centred on this line"}},
                  "rule": {"x": 105, "w": 1, "note": "the thin gold rule, baked in the art at 105 pt from the shell's left edge"},
                  "rightPart": {"x": 105, "y": 0, "w": 45, "h": 50, "coin": {"cx": 127.5, "cy": 19, "size": 30, "note": "the kit's Ducats coin"}, "label": {"cx": 127.5, "cy": 42, "note": "OF 4 centred here, 11 pt"}},
                  "note": "all seats relative to the shell's top-left at 1x; the shell is at.shell inside the sprite"},
           notes="150 by 50, navy, gold trim, notched 9, the rule drawn in. Not meant to stretch; nine-slice margins are given for a wider panel if ever needed (the rule would move; redraw it instead).")
# ═══ 5 threat panel, tiles, force badges ════════════════════════════════════════════════════════════
pack_plate("threat-panel", section=5, word="Threats (2)", fs_pt=FS["threat-panel"],
           seats={"header": {"cx": 36, "cy": 13, "note": "THREATS (2) centred here, 11 pt, parchment"}, "tiles": {"x": 4, "y": 23, "w": 64, "h": 33, "gap": 4, "note": "three tiles stack from here; one alone may stretch taller through the tile's nine-slice"}},
           notes="72 by 125, notched 6, dark red face (the kit's red button design with a deeper Inner Fill #4A0A0C), gold trim. Nine-sliced for a taller column.")
tile, tile_ims, tile_box, tile_members = pack_plate("threat-tile", section=5, variants=["gold", "blue", "red"], fs_pt=FS["threat-tile"],
                                                    seats={"band": {"x": 1.7, "y": 1.7, "w": 60.6, "h": 16, "note": "band.png across the top of the picture, inside the frame's wall; make it taller for a two-line name"},
                                                           "forceBadge": {"anchor": "bottom-right", "inset": 1.5, "note": "the force badge's corner seat"}},
                                                    notes="64 by 33, notched 4, frame only: the picture shows through the hole (the face is cut out of the sprite, no dark fill). Trim in the target's colour; split.png is gold over blue on the diagonal (gold top-left, blue bottom-right). Nine-slice for the taller single tile.")
# the split trim: gold top-left, blue bottom-right, soft diagonal seam
gold = tile_ims[("gold", "default")].crop(tile_box); blue = tile_ims[("blue", "default")].crop(tile_box)
W, H = gold.size
ss = 4
mask = Image.new("L", (W * ss, H * ss), 0)
ImageDraw.Draw(mask).polygon([(0, 0), (W * ss, 0), (0, H * ss)], fill=255)
mask = mask.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
split = Image.composite(gold, blue, mask)
f = f"{D}/pieces/threat-tile/split.png"; split.save(f, optimize=True)
tile["files"]["split"] = "pieces/threat-tile/split.png"; tile["sha256"]["split"] = sha(f); tile["trimByVariant"]["split"] = "gold / blue on the diagonal"
# the band
band = A["threat-tile-band"]
shutil.copy(f"{OUT}/atoms/{band['file']}", f"{D}/pieces/threat-tile/band.png")
tile["band"] = {"file": "pieces/threat-tile/band.png", "spritePx": band["spritePx"], "at1x": band["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in band["at1x"]["nineSlice"].items()},
                "fill": "#050D19 at 82%", "sha256": sha(f"{D}/pieces/threat-tile/band.png"), "note": band["note"],
                "label": label_block(tile_members[0], FS["threat-tile"], {"note": "the name, 11 pt, parchment, up to two lines, centred in the band"})}
pack_plate("force-badge", section=5, group="force-badge", word="3", fs_pt=FS["force-badge"],
           notes="15 by 15, notched 3: red (the kit's red button), gold (the badge's gold face, dark figure) and green (the met colour, the chip-good design). Figure 11 pt.")
pack_plate("force-badge-wide", section=5, group="force-badge-wide", word="3/5", fs_pt=FS["force-badge"], out_names={"wide-red": "red", "wide-gold": "gold", "wide-green": "green"},
           notes="28 by 15, the wide badge for 3/5 while committing; same three colours; nine-slice margins given for anything wider.")
# ═══ 6 seats and stat pill ══════════════════════════════════════════════════════════════════════════
pack_plate("seat", section=6,
           notes="27 by 27, notched 4, frame only (the portrait shows through the hole): gold (yours), blue (theirs), moving (white trim), confronting (red trim). empty is a flat faint well: the dim trim at 60% with a 45% dark fill in the hole, no depth.")
pill, pill_ims, pill_box, pill_members = pack_plate("stat-pill", section=6, word="4", fs_pt=FS["stat-pill"],
                                                    seats={"cells": {"influence": {"x": 0, "w": 12.5, "cx": 6.25, "fill": "#FCB424", "note": "the Influence figure, gold"}, "force": {"x": 12.5, "w": 12.5, "cx": 18.75, "fill": "#FF7A5A", "note": "the Force figure, red"}, "cy": 7, "note": "relative to the shell's top-left; the divider is drawn in the art at the middle"}},
                                                    notes="25 by 14, notched 3, navy face, trim in the owner's colour, a thin divider of the trim colour baked at the middle. The figures are 11 pt in the two fills above (the label block gives the parchment face; swap the fill per cell).")
# ═══ 7 meter ════════════════════════════════════════════════════════════════════════════════════════
pack_plate("meter", section=7, word="7", fs_pt=FS["meter"], out_names={"orb-gold": "orb-gold", "orb-blue": "orb-blue"},
           notes="The Influence numbers: 22 by 22 regular notched octagons (cut 6.44), gold and blue rims, navy face, the figure 12 pt parchment. Octagons, not circles: the kit has no coin here and the brief's rule is notched everywhere. The bar between them is under bar.meter.")
# ═══ 8 sheet, picture well, stat plate, close ═══════════════════════════════════════════════════════
sheet_title = next(r for r in by_group["sheet"] if r["variant"] == "gold")
sheet_body = by_group["sheet-body"][0]
sheetp, _, _, _ = pack_plate("sheet", section=8, fs_pt=FS["sheet"], label_from=sheet_title, label_extra={"role": "title", "note": "the title, Cinzel 20 pt, left-aligned at the content box's top-left (anchor start)"},
                             seats={"content": {"pictureWell": {"x": 18, "y": 18, "w": 168, "h": 220}, "statPlates": [{"x": 18, "y": 246, "w": 34, "h": 30}, {"x": 85, "y": 246, "w": 34, "h": 30}, {"x": 152, "y": 246, "w": 34, "h": 30}],
                                                "title": {"x": 204, "y": 30, "w": 420, "note": "left edge and centre line of the title"}, "body": {"x": 204, "y": 56, "w": 420, "h": 260, "note": "the reading column"},
                                                "close": {"anchor": "top-right", "inset": {"x": 12, "y": 12}, "size": 32}, "note": "a suggested layout at 1x, relative to the shell's top-left; the brief fixes only the well and plate sizes"}},
                             notes="650 by 350, notched 14, navy face in every variant; the trim is gold, blue, red or iron. Nine-sliced (taller for the log).")
sheetp["bodyLabel"] = label_block(sheet_body, FS["sheet-body"], {"role": "body", "note": "the reading face: Crimson Pro 600, 15 pt, as typed (no upper case), parchment, the kit's cast shadow only"})
pack_plate("picture-well", section=8, notes="168 by 220, notched 8, frame only: the picture shows through. gold and iron trims; the sheet's trim colour need not match it.")
pack_plate("stat-plate", section=8, word="12", fs_pt=FS["stat-plate"], out_names={"default": "default"}, notes="34 by 30, notched 6, navy, gold trim; the figure 12 pt parchment.")
p = pack_button("icon-close", section=8, notes="32 by 32, notched 5, navy face, gold trim. The × is glyph-close.png, separate, gold.")
pack_glyph("icon-close", "icon-close/glyph-close", "glyph-close", p)
# ═══ 9 nameplates ═══════════════════════════════════════════════════════════════════════════════════
pack_plate("np-phone-you", section=9, word="(the player's name)", fs_pt=FS["np-phone-you"], out_names={"default": "default"},
           seats={"name": {"cx": 89, "cy": 22, "maxW": 150, "note": "one line centred in the strip, 13 pt; the portrait ring hangs off the end as today"}},
           notes="178 by 44, notched 6, the kit's gold on navy (plate-A). Nine-sliced for a longer name.")
pack_plate("np-phone-opp", section=9, word="(the opponent's name)", fs_pt=FS["np-phone-opp"], out_names={"default": "default"},
           seats={"name": {"cx": 89, "cy": 22, "maxW": 150, "note": "one line centred in the strip, 13 pt"}},
           notes="178 by 44, notched 6, the kit's blue colourway (plate-B: blue trim and blue face), as the web nameplate B.")
# ═══ 11 turn call and caption ═══════════════════════════════════════════════════════════════════════
pack_plate("turn-call", section=11, word="Turn 2 / of 8", fs_pt=FS["turn-call"], notes="300 by 66, notched 12, navy face; gold trim and red trim (FINAL TURN). Word 22 pt centred.")
pack_plate("caption", section=11, word="(the step's line)", fs_pt=FS["caption"], out_names={"default": "default"}, notes="430 by 46, notched 8, dark (the kit's dim header design: deep navy face, muted gold trim). The line is the reading face, Crimson Pro 600, 16 pt, parchment, as typed.")
# ═══ 12 deck and result panels ══════════════════════════════════════════════════════════════════════
pack_plate("deck-panel", section=12, word="(the deck's name)", fs_pt=FS["deck-panel"],
           seats={"content": {"title": {"cx": 168, "cy": 27, "note": "the deck's name, 18 pt, centred"}, "portraits": {"y": 48, "h": 86, "note": "five portraits across"}, "line": {"cx": 168, "cy": 150, "note": "a line of text, the reading face"}, "arrows": {"y": 162, "size": {"w": 50, "h": 28}, "insetX": 14, "note": "notch-small at both ends of the foot, with < and > (the kit's chevron glyph or the app's)"}, "note": "a suggested layout at 1x, relative to the shell's top-left"}},
           notes="336 by 194, notched 12: gold (yours, navy face) and blue (Harborlight's, the blue colourway). Nine-sliced.")
pack_plate("result-panel", section=12, variants=["gold", "blue", "iron"], word="(Victory, Defeat, Draw)", fs_pt=FS["result-panel"],
           seats={"content": {"title": {"cx": 290, "cy": 50, "note": "28 pt centred"}, "rows": [{"x": 30, "y": 96, "w": 520, "h": 34}, {"x": 30, "y": 138, "w": 520, "h": 34}, {"x": 30, "y": 180, "w": 520, "h": 34}], "buttons": {"y": 270, "h": 32, "note": "room for three buttons along the foot, centred"}, "note": "a suggested layout at 1x, relative to the shell's top-left"}},
           notes="580 by 340, notched 14, navy face; trim gold (you win), blue (they win), iron (a draw). Nine-sliced.")
pack_plate("row-plate", section=12, group="row-plate", word="(a Location's line)", fs_pt=FS["row-plate"], out_names={"row-plate": "default"},
           notes="520 by 34, notched 6, the dim design (deep navy, muted gold trim) for the three Location rows in the result panel. Nine-sliced wide. Words 12 pt.")

# ═══ 10 glows, and the two bars ═════════════════════════════════════════════════════════════════════
os.makedirs(f"{D}/pieces/glow", exist_ok=True)
glows = []
for gid, name in (("glow-small", "small"), ("glow-plate", "plate")):
    a = A[gid]; shutil.copy(f"{OUT}/atoms/{a['file']}", f"{D}/pieces/glow/{name}.png")
    glows.append({"id": name, "file": f"pieces/glow/{name}.png", "spritePx": a["spritePx"], "at1x": a["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in a["at1x"]["nineSlice"].items()},
                  "color": "#FFFFFF", "tints": {"canLand": "#FCB424", "underFinger": "#3FD97A", "leader": "#5AA8FF", "lost": "#FF7A5A"}, "note": a["note"]})
pieces.append({"id": "glow", "section": 10, "appPiece": "glow", "files": {g["id"]: g["file"] for g in glows}, "variants": glows,
               "sha256": {g["id"]: sha(f"{D}/{g['file']}") for g in glows},
               "notes": "White, notched, nine-sliced, smooth to nothing. small is drawn around a 60 by 60 notched(4) shape with a 12 pt reach (seats, Gates, tiles); plate around 220 by 140 notched(12) with a 22 pt reach (Location plates). Stretch the centre cell so at1x.shape matches the piece's shell, keep the margins, tint with the colours under tints, and sit it under the piece. Never an outline box."})

def bar_entry(track_id, fills, extra):
    t = A[track_id]
    shutil.copy(f"{OUT}/atoms/{t['file']}", f"{D}/bar/{t['file']}")
    e = {"track": {"file": f"bar/{t['file']}", "spritePx": t["spritePx"], "at1x": t["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in t["at1x"]["nineSlice"].items()}, "wellColor": t.get("wellColor"), "pivot": {"x": 0.5, "y": 0.5}, "sha256": sha(f"{D}/bar/{t['file']}"), "note": t["note"]}, "fills": {}}
    for key, fid in fills.items():
        f = A[fid]; shutil.copy(f"{OUT}/atoms/{f['file']}", f"{D}/bar/{f['file']}")
        e["fills"][key] = {"file": f"bar/{f['file']}", "spritePx": f["spritePx"], "at1x": f["at1x"], "nineSlicePx": {k: round(v * PT) for k, v in f["at1x"]["nineSlice"].items()}, "colors": {"gradient": f["colors"], "note": "bottom to top as drawn"}, "pivot": {"x": 0.5, "y": 0.5}, "sha256": sha(f"{D}/bar/{f['file']}"), "note": f["note"]}
    e.update(extra)
    return e

bar = {
    "timerMobile": bar_entry("timer-track-mobile", {"default": "timer-fill-mobile", "warn": "timer-fill-mobile-warn"}, {
        "id": "timer-mobile", "note": "The plan timer inside Lock In: an 8 pt track with notched ends and a 6 pt fill inside it at inset 1. Fill rect = (1, 1, value times (track width minus 2), 6) at 1x; nine-slice the fill so its notched ends arrive with the sprite. The warn fill is the kit's warn red. The web cut's timer-track and timer-fill also work here at 8 pt tall if round ends are wanted.",
        "geometryAt1x": {"trackShell": {"x": 0, "y": 0, "w": 100, "h": 8}, "fillInset": 1, "fillFullWidth": 98, "fillH": 6, "warnBelow": 0.25}}),
    "meter": bar_entry("meter-track", {"gold": "meter-fill-gold", "blue": "meter-fill-blue"}, {
        "id": "meter", "note": "The Influence meter between the two orbs: a 5 pt track (90 to 140 wide, nine-sliced), the gold fill from the left end to the split, the blue fill from the split to the right end, both nine-sliced; the marker sits centred on the split, over both.",
        "geometryAt1x": {"trackShell": {"x": 0, "y": 0, "w": 120, "h": 5}, "fillInset": 0, "split": "gold width = share times track width", "orbs": {"size": 22, "gap": 2, "note": "pieces/meter orb-gold at the left end, orb-blue at the right, 2 pt clear of the bar"}}}),
}
mk = A["meter-marker"]; shutil.copy(f"{OUT}/atoms/{mk['file']}", f"{D}/bar/{mk['file']}")
bar["meter"]["marker"] = {"file": f"bar/{mk['file']}", "spritePx": mk["spritePx"], "at1x": mk["at1x"], "pivot": {"x": 0.5, "y": 0.5}, "sha256": sha(f"{D}/bar/{mk['file']}"), "note": mk["note"]}

# ═══ fonts ══════════════════════════════════════════════════════════════════════════════════════════
for f in ("Cinzel-Bold.ttf", "CrimsonPro-SemiBold.ttf", "cinzel-OFL.txt", "crimsonpro-OFL.txt"):
    shutil.copy(f"{S}/fonts/{f}", f"{D}/fonts/{f}")

# ═══ manifest ═══════════════════════════════════════════════════════════════════════════════════════
manifest = {
    "kit": "Stand on Business",
    "cut": "phone board: the twelve asset groups of docs/ui-kit-cut/mobile-brief.md, from the kit's own renderer, for the iPhone build in Unity",
    "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "pngScale": 3,
    "units": "Every number under `at1x` is in points (1x) on the 874 by 402 landscape stage. Sprite pixel sizes are 3x: divide sprite px by 3 to get points. `nineSlicePx` is sprite px.",
    "stage": {"w": 874, "h": 402, "homeBar": 21, "note": "iPhone 18 Pro, landscape; the Dynamic Island on one side"},
    "face": {"family": "Cinzel", "file": "fonts/Cinzel-Bold.ttf", "source": "https://fonts.google.com/specimen/Cinzel", "weight": 700, "case": "upper", "letterSpacing": "0.03em",
             "note": "The display face: every button word, title, figure and heading. Size, fill and shadow per piece under pieces[].label (per state for buttons)."},
    "bodyFace": {"family": "Crimson Pro", "file": "fonts/CrimsonPro-SemiBold.ttf", "source": "https://fonts.google.com/specimen/Crimson+Pro", "weight": 600, "case": "as typed", "letterSpacing": "0",
                 "note": "The reading face: the sheet's body, the caption's line, the deck panel's line of text. Face under pieces[sheet].bodyLabel and pieces[caption].label."},
    "states": {"buttons": ["default", "hover", "pressed", "disabled"], "note": "A phone has no hover; hover.png is included because the kit draws it anyway. All states of one piece share one crop. Plates have one state."},
    "shape": {"rule": "notched (chamfered) corners everywhere, straight edges; the cut per piece is in engineFamily (sharp:<cut> in points). The only octagons that read as coins are the meter orbs; there are no circles in this cut.", "highlights": "glows only (pieces/glow), never an outline box"},
    "pieces": pieces,
    "bar": bar,
    "composition": {
        "lockInAndBar": {"lockInShell": {"x": 0, "y": 0, "w": 134, "h": 54}, "barSeat": lock["at1x"]["barSeat"], "wordSeat": lock["at1x"]["wordSeat"], "note": "relative to the Lock In shell's top-left at 1x; the bar is bar.timerMobile"},
        "seatAndPill": {"seat": {"w": 27, "h": 27}, "pill": {"y": 29, "w": 25, "h": 14, "note": "centred under the seat, 2 pt below it"}},
        "meter": {"orbLeft": {"x": 0, "y": 0, "size": 22}, "bar": {"x": 24, "y": 8.5, "h": 5, "note": "between the orbs with 2 pt clear each side; width = meter width minus 48"}, "orbRight": {"anchor": "right", "size": 22}, "marker": {"size": 7, "note": "centred on the gold/blue split"}},
        "threatColumn": {"panel": {"w": 72, "h": 125}, "header": {"cx": 36, "cy": 13}, "tiles": {"x": 4, "y": 23, "w": 64, "h": 33, "gap": 4}, "forceBadgeOnTile": {"anchor": "bottom-right", "inset": 1.5}},
        "sheet": sheetp["at1x"]["content"],
        "veil": {"color": "#05091A", "opacity": 0.72, "note": "the dark scrim under a sheet or a turn call; drawn by the app, no picture"},
        "note": "Seats the brief fixed are exact; the rest are suggestions from the kit's proportions, marked in their notes.",
    },
    "skipped": ["the six buttons, the Stand on Business plate and wordmark, the nameplate rings and chips, the turn tracker's crowns and coins, the plan timer, the card frames, the Gate and Location frames (already cut)",
                "idle motion", "every other component and board", "a Unity package"],
    "engineExportBuild": "renderer road (renderCutShell), maker branch claude/mobile-cut",
    "notices": ["fonts/cinzel-OFL.txt", "fonts/crimsonpro-OFL.txt"],
}
json.dump(manifest, open(f"{D}/manifest.json", "w"), indent=1)
print("pieces", len(pieces))
tot = 0
for root, _, files in os.walk(D):
    for f in files:
        tot += os.path.getsize(os.path.join(root, f))
print("total bytes", tot)
