#!/usr/bin/env python3
"""Author kit-nightfall.json: Stand on Business after dark, from the concept home screen. Starts from the Stand on
Business document (so every field the app expects is present) and re-dials the look; no boards yet (the home board is
authored by make-home-board.py)."""
import json, copy, sys, os
S = os.environ.get("KIT_SCRATCH", os.path.expanduser("~/nightfall-kit"))
W = os.environ.get("MAKER_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
sob = json.load(open(f"{W}/src/generator/kit-stand-on-business.json"))
k = copy.deepcopy(sob)
c = k["cfg"]

GOLD, GOLD_HI, GOLD_LO, CREAM, INK_GOLD, NIGHT, NIGHT_FACE, SHADOW = "#F2C94C", "#F6DC8C", "#8A6410", "#F3E6C8", "#E6C15A", "#0A0F1C", "#0F1626", "#05080F"

c["presetId"] = "royal-vault"
c["shape"] = "sharp"
c["effects"] = {"Bevel": "#C9A24A", "Glow": GOLD, "Highlight": GOLD_HI, "Shadow": SHADOW, "Inner Fill": NIGHT_FACE}
c["face"] = {"mode": "light", "contrast": 30, "midpoint": 50}
c["bevel"] = {"width": 5, "softness": 30}
cd = c["candy"]
cd["extrusion"] = {"depth": 4, "darkness": 85, "glow": 20}
cd["rim"] = {"width": 2, "brightness": 95}
cd["innerEdge"] = {"strength": 45, "width": 2}
cd["innerGlow"] = {"opacity": 10, "size": 40, "color": GOLD}
cd["aura"] = {"color": GOLD}
cd["gloss"] = {**cd["gloss"], "on": False}
cd["specular"] = {**cd["specular"], "on": True, "mode": "soft", "intensity": 8, "softness": 95}
cd["bloom"] = {"opacity": 10, "size": 40}
cd["contact"] = {"opacity": 30}
cd["texture"] = {"amount": 8, "scale": 48}
cd["pattern"] = {"type": "none", "scale": 22, "angle": 0, "opacity": 0, "color": None, "wall": {"type": "none", "scale": 9, "angle": 0, "opacity": 0, "color": None}}
c["lighting"] = {"angle": 90, "highlight": 55, "lowlight": 50}
c["shadow"] = {"distance": 12, "blur": 18, "opacity": 50}
c["transparency"] = {"frame": 100, "interior": 100, "content": 100}
c["content"] = {"label": "Play"}
t = c["type"]
t.update({"font": "Literata", "size": 60, "weight": 700, "spacing": 6, "case": "upper", "fillMode": "solid", "fill": CREAM, "fill2": INK_GOLD, "fillOpacity": 100,
          "shadow": {"on": True, "color": SHADOW, "x": 0, "y": 2, "blur": 2, "opacity": 70},
          "emboss": {"on": True, "strength": -14, "softness": 30, "hiOpacity": 20, "distance": 1, "shOpacity": 35, "hiColor": "#FFF6E0", "shColor": "#05091A"},
          "glow": {"on": False, "color": GOLD, "size": 6, "opacity": 40}, "listFont": "Crimson Pro", "listInk": CREAM, "infoInk": INK_GOLD})
c["icon"] = {**c["icon"], "color": INK_GOLD, "strokeWidth": 22}
c["states"] = {"default": {"brightness": 0, "glow": 0, "lift": 0, "opacity": 100, "saturation": 0},
               "hover": {"brightness": 6, "glow": 40, "lift": 0, "opacity": 100, "saturation": 8},
               "pressed": {"brightness": -6, "glow": 50, "lift": 2, "opacity": 100, "saturation": 8},
               "disabled": {"brightness": -10, "glow": 0, "lift": 0, "opacity": 65, "saturation": -60}}
c["canvas"] = NIGHT
c["knob"] = {"color": GOLD}
c["celebrate"] = "PLAY, Stand on Business"
c["stateDesigns"] = {}

# ── per-piece designs: keep the glyph fleet's flat recipe from Stand on Business, replace everything else ──
kd = {dk: dv for dk, dv in sob["kitDesigns"].items() if dk.startswith("glyph") or dk in ("gearicon", "trophyicon", "gifticon")}
GOLD_FACE = {"effects": {"Bevel": GOLD_LO, "Glow": GOLD, "Highlight": "#FFF0B0", "Shadow": "#2A1E05", "Inner Fill": "#E8B93A"},
             "face": {"mode": "light", "contrast": 55, "midpoint": 50},
             "candy": {"extrusion": {"depth": 8, "darkness": 80, "glow": 30}, "gloss": {"on": True, "height": 42, "curve": 8, "opacity": 22, "softness": 90, "layer": "below", "fill": "highlight", "tint": "#FFFFFF", "tint2": "#FFFFFF"},
                       "innerGlow": {"opacity": 35, "size": 50, "color": "#FFE08A"}, "rim": {"width": 2.5, "brightness": 100}, "aura": {"color": GOLD}},
             "transparency": {"frame": 100, "interior": 100, "content": 100},
             "type": {"fill": "#2A1E05", "fill2": "#4A3608", "shadow": {"on": False, "color": SHADOW, "x": 0, "y": 2, "blur": 2, "opacity": 70},
                      "emboss": {"on": True, "strength": -18, "softness": 30, "hiOpacity": 40, "distance": 1, "shOpacity": 30, "hiColor": "#FFF6D0", "shColor": "#5A4208"}},
             "states": {"default": {"brightness": 0, "glow": 0, "lift": 0, "opacity": 100, "saturation": 0}, "hover": {"brightness": 6, "glow": 60, "lift": 0, "opacity": 100, "saturation": 8},
                        "pressed": {"brightness": -6, "glow": 70, "lift": 2, "opacity": 100, "saturation": 8}, "disabled": {"brightness": -10, "glow": 0, "lift": 0, "opacity": 65, "saturation": -60}}}
kd["primary"] = copy.deepcopy(GOLD_FACE)
kd["badge"] = copy.deepcopy(GOLD_FACE)
kd["coin"] = copy.deepcopy(GOLD_FACE)
kd["claimbtn"] = copy.deepcopy(GOLD_FACE)
kd["ghost"] = {"effects": {**c["effects"], "Bevel": "#1E2638", "Highlight": "#3A4860", "Glow": "#6B7489"}, "candy": {"extrusion": {"depth": 0, "darkness": 85, "glow": 0}, "specular": {**cd["specular"], "on": False}, "innerGlow": {"opacity": 0, "size": 40, "color": GOLD}}, "type": {**t, "fill": INK_GOLD, "fill2": GOLD_HI}}
# the secondary and ghost roads paint their face from the Bevel colour (darkened), so a slate wall gives a dark glass face
kd["secondary"] = {"effects": {**c["effects"], "Bevel": "#2A3450", "Highlight": "#55658A", "Glow": "#6B7489"}, "face": {"mode": "light", "contrast": 30, "midpoint": 50}, "type": {**t, "fill": INK_GOLD, "fill2": GOLD_HI}}
kd["copy-done-panel"] = {"effects": {"Bevel": "#4FD17A", "Glow": "#7CF0A0", "Highlight": "#A8F5C0", "Shadow": "#06301A", "Inner Fill": "#0F2419"}, "candy": {"innerGlow": {"opacity": 18, "size": 40, "color": "#7CF0A0"}}}
kd["copy-rowp-panel"] = {"effects": {"Bevel": "#3A4358", "Glow": "#6B7489", "Highlight": "#6B7489", "Shadow": SHADOW, "Inner Fill": "#0E1424"}, "candy": {"innerGlow": {"opacity": 0, "size": 40, "color": GOLD}, "extrusion": {"depth": 2, "darkness": 85, "glow": 0}}}
kd["copy-barp-panel"] = {"effects": {**c["effects"], "Bevel": "#2A3450", "Highlight": "#3A4860"}, "candy": {"innerGlow": {"opacity": 0, "size": 40, "color": GOLD}, "extrusion": {"depth": 0, "darkness": 85, "glow": 0}}}
kd["small"] = {"effects": dict(c["effects"])}
kd["iconbtn"] = {"effects": {**c["effects"], "Bevel": "#D4AF37"}, "bevel": {"width": 7, "softness": 30}, "icon": {**c["icon"], "color": INK_GOLD}}
kd["avatarframe"] = {"effects": {**c["effects"], "Bevel": "#D4AF37"}, "bevel": {"width": 9, "softness": 30}}
kd["currency"] = {"type": {**t, "fill": CREAM, "spacing": 2, "case": "none"}}
kd["header"] = {"effects": {**c["effects"], "Inner Fill": "#0C1220"}, "type": {**t, "fill": INK_GOLD, "fill2": GOLD_HI, "spacing": 14, "size": 48}}
GLASS = {"gloss": {"on": True, "height": 34, "curve": 14, "opacity": 14, "softness": 92, "layer": "below", "fill": "highlight", "tint": "#FFFFFF", "tint2": "#FFFFFF"},
         "specular": {**cd["specular"], "on": True, "mode": "line", "size": 30, "stretch": 14, "intensity": 22, "softness": 70, "angle": -18},
         "innerEdge": {"strength": 62, "width": 2}, "innerGlow": {"opacity": 22, "size": 56, "color": GOLD}, "rim": {"width": 2.5, "brightness": 100},
         "texture": {"amount": 10, "scale": 48},
         "pattern": {"type": "diamonds", "scale": 40, "angle": 0, "opacity": 4, "color": None, "zone": "face", "wall": {"type": "none", "scale": 9, "angle": 0, "opacity": 0, "color": None}}}
kd["panel"] = {"transparency": {"frame": 100, "interior": 100, "content": 100}, "candy": copy.deepcopy(GLASS)}
kd["dialog"] = {"transparency": {"frame": 100, "interior": 100, "content": 100}}
kd["datarow"] = {"effects": {"Bevel": "#3A4358", "Glow": "#6B7489", "Highlight": "#6B7489", "Shadow": SHADOW, "Inner Fill": "#0E1424"},
                 "candy": {"innerGlow": {"opacity": 0, "size": 40, "color": GOLD}, "extrusion": {"depth": 2, "darkness": 85, "glow": 0}},
                 "type": {**t, "fill": CREAM, "spacing": 1, "case": "none", "weight": 600}}
kd["setrow"] = copy.deepcopy(kd["datarow"])
kd["listmenu"] = copy.deepcopy(kd["datarow"])
kd["tab"] = {"type": {**t, "fill": INK_GOLD, "fill2": GOLD_HI, "spacing": 10, "size": 44}}
kd["tabback"] = copy.deepcopy(kd["tab"])
kd["chip"] = {"type": {**t, "spacing": 2, "size": 44}}
kd["toast"] = {"type": {**t, "font": "Crimson Pro", "size": 52, "weight": 600, "spacing": 0, "case": "none", "emboss": {**t["emboss"], "on": False}}}
kd["tooltip"] = copy.deepcopy(kd["toast"])
kd["input"] = {"type": {**t, "font": "Crimson Pro", "size": 52, "weight": 600, "spacing": 0, "case": "none", "emboss": {**t["emboss"], "on": False}}}
kd["questpanel"] = copy.deepcopy(kd["panel"])
kd["nameplate"] = {"type": {**t, "spacing": 4, "size": 50}}
# the clones: a mission row in its complete pose, and a bare gold glyph for the foot tabs
kd["copy-done-chip"] = {"effects": {"Bevel": "#4FD17A", "Glow": "#7CF0A0", "Highlight": "#A8F5C0", "Shadow": "#06301A", "Inner Fill": "#0F2419"},
                        "type": {**t, "fill": "#7CF0A0", "fill2": "#A8F5C0", "spacing": 2, "size": 44}}
kd["copy-play-panel"] = copy.deepcopy(GOLD_FACE)
kd["copy-play-panel"]["states"]["default"] = {"brightness": 2, "glow": 38, "lift": 0, "opacity": 100, "saturation": 4}
kd["copy-card-panel"] = {"effects": {**c["effects"], "Bevel": "#D4AF37", "Highlight": "#FFF0B0"}, "bevel": {"width": 6, "softness": 30}, "candy": copy.deepcopy(GLASS)}
kd["copy-avyu-avatarframe"] = copy.deepcopy(kd["avatarframe"])
kd["copy-avop-avatarframe"] = copy.deepcopy(kd["avatarframe"])
# the foot's plaques: slate glass for the screens you can go to, the gold face for the screen you are on
kd["copy-navp-panel"] = {"effects": {**c["effects"], "Bevel": "#2A3450", "Highlight": "#55658A", "Glow": "#6B7489", "Inner Fill": "#0E1526"},
                         "transparency": {"frame": 100, "interior": 100, "content": 100},
                         "candy": {**copy.deepcopy(GLASS), "innerGlow": {"opacity": 14, "size": 56, "color": GOLD}, "rim": {"width": 2, "brightness": 90}}}
kd["copy-hmep-panel"] = copy.deepcopy(GOLD_FACE)
kd["copy-hmep-panel"]["states"]["default"] = {"brightness": 2, "glow": 30, "lift": 0, "opacity": 100, "saturation": 4}
kd["copy-navg-iconbtn"] = {"transparency": {"frame": 0, "interior": 0, "content": 100}, "candy": {"extrusion": {"depth": 0, "darkness": 85, "glow": 0}, "contact": {"opacity": 0}, "specular": {**cd["specular"], "on": False}},
                          "shadow": {"distance": 0, "blur": 0, "opacity": 0}, "icon": {**c["icon"], "color": INK_GOLD, "size": 120},
                          "states": {"default": {"brightness": 0, "glow": 0, "lift": 0, "opacity": 100, "saturation": 0}, "hover": {"brightness": 8, "glow": 0, "lift": 0, "opacity": 100, "saturation": 0},
                                     "pressed": {"brightness": -6, "glow": 0, "lift": 1, "opacity": 100, "saturation": 0}, "disabled": {"brightness": -10, "glow": 0, "lift": 0, "opacity": 60, "saturation": -60}}}
# the same bare glyph in ink, for the lit plaque
kd["copy-nvgi-iconbtn"] = copy.deepcopy(kd["copy-navg-iconbtn"])
kd["copy-nvgi-iconbtn"]["icon"] = {**kd["copy-nvgi-iconbtn"]["icon"], "color": "#2A1E05"}
k["kitDesigns"] = kd

k["kitName"] = "Nightfall"
k["kitClones"] = {"copy-done-chip": {"base": "chip", "name": "mission-done", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-navg-iconbtn": {"base": "iconbtn", "name": "nav-glyph", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-nvgi-iconbtn": {"base": "iconbtn", "name": "nav-glyph-ink", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-play-panel": {"base": "panel", "name": "play-plate", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-done-panel": {"base": "panel", "name": "row-done", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-rowp-panel": {"base": "panel", "name": "row", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-barp-panel": {"base": "panel", "name": "nav-ledge", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-navp-panel": {"base": "panel", "name": "nav-plaque", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-hmep-panel": {"base": "panel", "name": "nav-plaque-lit", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-card-panel": {"base": "panel", "name": "card-frame", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-avyu-avatarframe": {"base": "avatarframe", "name": "portrait-you", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"},
                  "copy-avop-avatarframe": {"base": "avatarframe", "name": "portrait-opp", "kind": "Other", "createdAt": "2026-10-04T00:00:00.000Z"}}
# the silhouettes with flavour: Play is a swallowtail standard, the foot a scroll ledge carrying faceted plaques
# (env overrides let the author try the alternates side by side)
PLAY_SHAPE, LEDGE_SHAPE, PLAQUE_SHAPE = os.environ.get("PLAY_SHAPE", "banner"), os.environ.get("LEDGE_SHAPE", "tavern"), os.environ.get("PLAQUE_SHAPE", "hex")
k["kitShapes"] = {"iconbtn": "pill", "avatarframe": "pill", "currency": "pill", "copy-navg-iconbtn": "pill", "copy-nvgi-iconbtn": "pill", "dialoguebox": "speech",
                  "copy-play-panel": PLAY_SHAPE, "copy-barp-panel": LEDGE_SHAPE, "copy-navp-panel": PLAQUE_SHAPE, "copy-hmep-panel": PLAQUE_SHAPE}
GEAR = {"lib": "lucide", "name": "Settings", "viewBox": "0 0 24 24", "inner": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "mode": "stroke"}
CART = {"lib": "lucide", "name": "ShoppingCart", "viewBox": "0 0 24 24", "inner": "<circle cx=\"8\" cy=\"21\" r=\"1\"/><circle cx=\"19\" cy=\"21\" r=\"1\"/><path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\"/>", "mode": "stroke"}
HOME = {"lib": "lucide", "name": "Home", "viewBox": "0 0 24 24", "inner": "<path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/>", "mode": "stroke"}
k["kitIcons"] = {"iconbtn": GEAR, "copy-navg-iconbtn": CART, "copy-nvgi-iconbtn": HOME}
k["kitLabels"] = {"primary": "Play", "secondary": "View all", "small": "Practice", "ghost": "Challenges", "header": "Season Pass", "chip": "Juneteenth Weekend", "copy-done-chip": "Break 2 Threats",
                  "toast": "Deck saved.", "currency": "1,250", "nameplate": "Silverlake Slayer", "badge": "Tier 12", "dialog": "Sit Down?", "setrow": "Music volume", "datarow": "Play 3 Events",
                  "tab": "PvP", "tabback": "Back", "input": "Search the Collection", "dropdown": "Railroad", "tooltip": "History plays different", "questpanel": "Missions", "movecounter": "47",
                  "segment": "PvP | Practice | Challenges", "achievetoast": "Stood on Business", "dialoguebox": "Freedom moves together.", "loottag": "Mansa Musa", "pricebtn": "400"}
k["kitSubs"] = {"datarow": "1/3"}
k["kitVals"] = {"movecounter": 0.47, "progress": 0.6, "xpbar": 0.78}
k["kitTextOy"] = {}
k["kitTextOx"] = {}
k["kitLocks"] = {}
k["kitBar"] = {}
k["kitNoText"] = {**sob.get("kitNoText", {}), "copy-avyu-avatarframe": True, "copy-avop-avatarframe": True}
k["kitTextFill"] = {}
k["kitSlotVals"] = sob.get("kitSlotVals", {})
ART = "/kit-art/nightfall"
k["userAssets"] = [
    {"id": "uanflogo", "name": "Stand on Business logo", "ref": f"{ART}/sob-logo.webp", "w": 900, "h": 595},
    {"id": "uanfyou", "name": "Portrait, Harriet Tubman", "ref": f"{ART}/you.webp", "w": 256, "h": 256},
    {"id": "uanfopp", "name": "Portrait, Frederick Douglass", "ref": f"{ART}/opp.webp", "w": 256, "h": 256},
    {"id": "uanfcardoshun", "name": "Oshun, the card", "ref": f"{ART}/card-oshun.webp", "w": 551, "h": 713},
    {"id": "uanfcardshango", "name": "Shango, the card", "ref": f"{ART}/card-shango.webp", "w": 551, "h": 713},
    {"id": "uanfcardogun", "name": "Ogun, the card", "ref": f"{ART}/card-ogun.webp", "w": 551, "h": 713},
    {"id": "uanfmansa", "name": "Mansa Musa", "ref": f"{ART}/mansa_musa.webp", "w": 512, "h": 512},
    {"id": "uanfevent", "name": "Juneteenth", "ref": f"{ART}/event.webp", "w": 1024, "h": 776},
    {"id": "uanfseason", "name": "The Great Migration", "ref": f"{ART}/season.webp", "w": 600, "h": 450},
    {"id": "uanfmissions", "name": "The Ancestors", "ref": f"{ART}/missions.webp", "w": 1024, "h": 240},
]
k["boards"] = []
out = f"{W}/src/generator/kit-nightfall.json"
json.dump(k, open(out, "w"), indent=0, ensure_ascii=False)
print("wrote", out, os.path.getsize(out), "bytes; designs", len(kd))
