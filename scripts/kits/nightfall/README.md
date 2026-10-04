# Nightfall: how the kit document was authored

`kit-nightfall.json` is a kit document like any other (open it, edit it, save it). These scripts are how it was
first written, kept so the boards can be re-flowed by numbers instead of by hand. The boards sit on the maker's
`iphone-pro-l` stage (iPhone 18 Pro in landscape, 874 by 402 points): one stage unit is one point, no word is under
11 pt, no tap under 34 pt, and the content keeps inside the island's 62-point ears.

- `make-nightfall.py` writes the document from the Stand on Business one: the night look (dials, per-piece designs,
  the glass recipe, words, clones, silhouettes, icons, the art registry), no boards.
- `nfboard.py` is the shared board author: pieces by their shell's top-left, stamps by their cap top in points,
  pictures by their top-left; `write()` merges one board into the document and leaves the others alone.
- `make-start-board.py` lays out the start screen (the owner's glass concept) and `make-match-board.py` the match
  (turn 4 of 6, planning). Run them after `make-nightfall.py`, in that order.
- `probe-kit.mjs <ids> l` renders pieces through the dev server (`MAKER_PORT`) at board size l and records each
  piece's shell origin to `probe/geom-l.json`, which `nfboard.py` reads.
- `shot-board.mjs <name> <boardId>` loads the document into the running app the way a shipped kit loads and
  screenshots that board on its own stage.
- `compose-cards.py` draws the deck's cards (`card-<id>.webp`) the way the game's own hand card lays them out: the art
  in the frame's window, the name and one-line summary on the parchment, the figures in the medallions, every figure
  and word read from the game's content (`GAME_ROOT`, a checkout of CripGod/legacygame); and the card back.
- `grab-frames.mjs` pulls stills out of the game's video clips with Chromium (the match ground is one of them).

`KIT_SCRATCH` holds `fonts/` (Literata_12pt-Bold/SemiBold/ExtraBold.ttf and CrimsonPro-SemiBold.ttf: the board
author measures stamps with them for centring, the card composer sets type with them) and `kit/probe/geom-l.json`.

## The art

`public/kit-art/nightfall/` is the game's own art (CripGod/legacygame, `public/art/…`), compressed for the sizes it
paints at: the official logo (`landing/sob-logo.webp`), the night lake (`landing/board.jpg`, darkened with a vignette
for the start screen's ground), a still of the board clip (`video/board.webm`, the match ground), circular portraits
(Harriet Tubman, Frederick Douglass), six finished cards and the card back (`compose-cards.py`), three Locations
(Harpers Ferry, Greenwood, Montgomery), Mansa Musa, Juneteenth, the Great Migration and the Ancestors. The document's
`userAssets` registry names each file with the pixels the boards were authored against.
