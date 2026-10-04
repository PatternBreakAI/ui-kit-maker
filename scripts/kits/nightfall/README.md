# Nightfall: how the kit document was authored

`kit-nightfall.json` is a kit document like any other (open it, edit it, save it). These scripts are how it was
first written, kept so the home board can be re-flowed by numbers instead of by hand.

- `make-nightfall.py` writes the document from the Stand on Business one: the night look (dials, per-piece designs,
  words, clones, shapes, icons), no boards.
- `probe-kit.mjs <ids> l` renders pieces through the dev server (`MAKER_PORT`) at board size l and records each
  piece's shell origin to `probe/geom-l.json`; `make-home-board.py` needs that file (a board item's x,y is where the
  piece's own canvas origin lands, so the author backs the shell origin off).
- `make-home-board.py` lays the home screen out in stage px (shell top-left for pieces, cap top for stamps) at phone
  sizes (no word under 11 pt at 874 pt across, taps 34 pt and up) and writes the board into the document.
- `shot-board.mjs` loads the document into the running app the way a shipped kit loads and screenshots the board.
- `compose-cards.py` draws the three deck cards (`card-<id>.webp`) the way the game's own hand card lays them out:
  the art in the frame's window, the name and one-line summary on the parchment, the figures in the medallions, all
  read from the game's content (`GAME_ROOT`, a checkout of CripGod/legacygame).

`KIT_SCRATCH` holds `fonts/` (Literata_12pt-Bold/SemiBold/ExtraBold.ttf and CrimsonPro-SemiBold.ttf: the board author
measures stamps with them for centring, the card composer sets type with them).

## The art

`public/kit-art/nightfall/` is the game's own art (CripGod/legacygame, `public/art/…`), compressed for the sizes it
paints at: the official logo (`landing/sob-logo.webp`), the night lake (`landing/board.jpg`, darkened with a vignette
for the stage background), circular portraits (Harriet Tubman, Frederick Douglass), the three orisha as finished cards
in the game's own frames (`compose-cards.py`), Mansa Musa, Juneteenth, the Great Migration and the Ancestors. The
document's `userAssets` registry names each file with the pixels the board was authored against.
