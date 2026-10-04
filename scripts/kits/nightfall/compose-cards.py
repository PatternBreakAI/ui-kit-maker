#!/usr/bin/env python3
"""Pre-compose the three deck cards for the Nightfall home board, the way the game's hand card lays them out
(src/ui/components/CardFace.tsx, the .card.tpl rules): the art in the frame's window, the frame over it, the name big
and black at the top of the parchment with a gold hairline under it, the one-line summary beneath, the figures in the
medallions (green cost, gold Influence, red Force) and the tag on the bottom band. Figures and words come straight
from the game's content (src/engine/content/characters.ts). Output: public/kit-art/nightfall/card-<id>.webp at half the
frame's size (551 by 713)."""
import os
from PIL import Image, ImageDraw, ImageFont

S = os.environ.get("KIT_SCRATCH", os.path.expanduser("~/nightfall-kit"))
GAME = os.environ.get("GAME_ROOT", "/home/user/legacygame")
MAKER = os.environ.get("MAKER_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
OUT = os.environ.get("ART_OUT", os.path.join(MAKER, "public/kit-art/nightfall"))
LIT_XB = f"{S}/fonts/Literata_12pt-ExtraBold.ttf"
LIT_SB = f"{S}/fonts/Literata_12pt-SemiBold.ttf"
LIT_B = f"{S}/fonts/Literata_12pt-Bold.ttf"

# id, frame, name, cost, influence, force, summary, tag line, how high the face sits in the window
CARDS = [
    ("oshun", "character-amethyst", "Oshun", 4, 4, 1, "A friend here +1 for good; each turn your weakest here grows +1.", "Mythic · Yoruba", 0.22),
    ("shango", "character-gold", "Shango", 6, 6, 6, "Thunder: knocks away every weaker opposing Gate Character here.", "Mythic · Yoruba", 0.18),
    ("ogun", "character-emerald", "Ogun", 5, 4, 6, "Fights every Threat here with +2 Force.", "Mythic · Yoruba", 0.22),
]
INK, RULE_INK, HAIRLINE, CREAM = (20, 17, 12, 255), (42, 36, 24, 255), (201, 165, 58, 255), (243, 230, 200, 255)


def window(fr):
    """The art window: the transparent hole, walked out from the frame's centre line."""
    a = fr.getchannel("A"); W, H = fr.size; y = int(H * 0.3); x0 = x1 = W // 2
    while x0 > 0 and a.getpixel((x0 - 1, y)) < 20: x0 -= 1
    while x1 < W - 1 and a.getpixel((x1 + 1, y)) < 20: x1 += 1
    x = W // 2; y0 = y1 = y
    while y0 > 0 and a.getpixel((x, y0 - 1)) < 20: y0 -= 1
    while y1 < H - 1 and a.getpixel((x, y1 + 1)) < 20: y1 += 1
    return x0, y0, x1 + 1, y1 + 1


def parchment(fr):
    """The rules box: the bright plate under the window, measured on the frame's centre line."""
    a = fr.getchannel("A"); rgb = fr.convert("RGB"); W, H = fr.size; x = W // 2
    lit = lambda xx, yy: sum(rgb.getpixel((xx, yy))) > 620 and a.getpixel((xx, yy)) > 200
    runs, s = [], None
    for yy in range(H + 1):
        b = yy < H and lit(x, yy)
        if b and s is None: s = yy
        if not b and s is not None: runs.append((s, yy - 1)); s = None
    y0, y1 = max(runs, key=lambda r: r[1] - r[0])
    y = (y0 + y1) // 2; best, s = None, None
    for xx in range(W + 1):
        b = xx < W and lit(xx, y)
        if b and s is None: s = xx
        if not b and s is not None:
            if best is None or xx - s > best[1] - best[0]: best = (s, xx - 1)
            s = None
    return best[0], y0, best[1], y1


def cover(im, w, h, fy):
    iw, ih = im.size; s = max(w / iw, h / ih); im = im.resize((round(iw * s), round(ih * s)), Image.LANCZOS)
    x = (im.width - w) // 2; y = int((im.height - h) * fy); return im.crop((x, y, x + w, y + h))


def text(d, xy, t, font, fill, shadow=None):
    x, y = xy
    if shadow: d.text((x + 2, y + 3), t, font=font, fill=shadow, anchor="mm")
    d.text((x, y), t, font=font, fill=fill, anchor="mm")


def wrap(d, t, font, width):
    words, lines, cur = t.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=font) <= width or not cur: cur = trial
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines


os.makedirs(OUT, exist_ok=True)
for art, frame, name, cost, infl, force, summary, tag, fy in CARDS:
    fr = Image.open(f"{GAME}/public/art/frames/{frame}.webp").convert("RGBA"); W, H = fr.size
    x0, y0, x1, y1 = window(fr)
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    card.paste(cover(Image.open(f"{GAME}/public/art/characters/{art}.jpg").convert("RGB"), x1 - x0, y1 - y0, fy), (x0, y0))
    card.alpha_composite(fr)
    d = ImageDraw.Draw(card)
    # the parchment: name, hairline, summary (the hand card's own stack)
    px0, py0, px1, py1 = parchment(fr); pw = px1 - px0; pcx = (px0 + px1) / 2
    name_f = ImageFont.truetype(LIT_XB, int(W * 0.062))
    y = py0 + W * 0.03
    d.text((pcx, y), name, font=name_f, fill=INK, anchor="ma")
    y += name_f.size * 1.08 + W * 0.012
    d.line((px0 + pw * 0.08, y, px1 - pw * 0.08, y), fill=HAIRLINE, width=max(2, int(W * 0.003)))
    y += W * 0.022
    sum_f = ImageFont.truetype(LIT_SB, int(W * 0.044))
    for line in wrap(d, summary, sum_f, pw * 0.86)[:4]:
        d.text((pcx, y), line, font=sum_f, fill=RULE_INK, anchor="ma"); y += sum_f.size * 1.14
    # the medallions and the band
    orb = ImageFont.truetype(LIT_XB, int(H * 0.062))
    text(d, (W * 0.154, H * 0.106), str(cost), orb, CREAM, (0, 0, 0, 170))
    text(d, (W * 0.127, H * 0.879), str(infl), orb, (42, 30, 5, 255), (255, 240, 200, 120))
    text(d, (W * 0.871, H * 0.879), str(force), orb, CREAM, (0, 0, 0, 170))
    tag_f = ImageFont.truetype(LIT_B, int(W * 0.03))
    text(d, (W * 0.5, H * 0.937), tag.upper(), tag_f, CREAM, (0, 0, 0, 150))
    card = card.resize((W // 2, H // 2), Image.LANCZOS)
    p = f"{OUT}/card-{art}.webp"; card.save(p, "WEBP", quality=84, method=6)
    print(os.path.basename(p), card.size, os.path.getsize(p) // 1024, "KB", "parchment", (px0, py0, px1, py1))
