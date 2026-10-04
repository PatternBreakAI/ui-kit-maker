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

`KIT_SCRATCH` holds `fonts/` (Literata_12pt-Bold.ttf, CrimsonPro-SemiBold.ttf, used only to measure stamps for centring).

## The art

`public/kit-art/nightfall/` is the game's own art (CripGod/legacygame, `public/art/…`), compressed for the sizes it
paints at: the official logo (`landing/sob-logo.webp`), the night lake (`landing/board.jpg`, darkened with a vignette
for the stage background), circular portraits (Harriet Tubman, Frederick Douglass), the three orisha cropped to the
card frame's portrait window, Mansa Musa, Juneteenth, the Great Migration, the Ancestors, and three of the game's card
frames at half size. The document's `userAssets` registry names each file with the pixels the board was authored
against; `make-home-board.py` reads the frame's portrait window from the frame's own alpha.
