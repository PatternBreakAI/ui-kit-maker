# The Stand on Business phone cut (sob-phone)

The scripts that cut `docs/ui-kit-cut/mobile/` for the game repo (CripGod/legacygame) from the kit's own renderer.
Nothing here ships in the app; it is the cut's tooling, kept so a re-cut is a command, not an archaeology dig.

1. `npm run dev` (or any vite port; set `MAKER_PORT`), so `renderCutShell` is reachable at `/src/generator/bevel.ts`.
2. `CUT_SCRATCH=<dir>` with `fonts/Cinzel-Bold.ttf`, `fonts/CrimsonPro-SemiBold.ttf` and their OFL notices in it
   (Google Fonts static cuts; the fonts only matter for the preview words).
3. `node scripts/cut/sob-phone/mobile-sob.mjs` renders every piece, variant and state through `renderCutShell`
   (`sharp:<cut>` shells, hole punch for frame-only pieces, the word stripped, its face recorded) into `out/`.
4. `node scripts/cut/sob-phone/atoms.mjs` draws the hand-made atoms (glows, bars, band, marker).
5. `python3 scripts/cut/sob-phone/pack.py` crops, nine-slices, composes the split tile and the glows, writes
   `manifest.json`; `python3 scripts/cut/sob-phone/preview.py` assembles `preview.png` from the delivery alone.
6. Copy `deliver/mobile/` to the game repo's `docs/ui-kit-cut/mobile/` with the README kept there.

`CHROMIUM_PATH` points Playwright at a browser when the default download is not present. Sizes are points; sprites are 3x.
