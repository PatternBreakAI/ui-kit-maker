# Bundled library scenes — INTERIM FILES, swap before release

These 13 scenes back the starter-board templates in `src/ui/Board.tsx`
(`Tpl.bg` needs plain bundled paths — `backdropUrl()` is null in
cloud-less builds, so templates can never point at the storage bucket).

The files here are currently the app's own 320px picker thumbs standing
in at the final filenames: the build sandbox that assembled this round
could not reach the full-res `backgrounds` storage bucket (egress
policy). **Before these boards go live, overwrite each file in place
with the full-res WebP of the same name from the bucket** — same
filenames, no code change anywhere. The two files in
`../brightside/` are already full resolution.

Scenes: ember-isle, monsterfire-melee, midnight-meeple-club,
palmside-pitstop, redline-rebellion, twin-moon-pagoda, teal-banner-keep,
autumnhorn-village, castlewood-crown, neon-convoy, strawberry-skyfall,
candy-river-quest, frostwhistle-summit.

Delete this README when the swap lands.
