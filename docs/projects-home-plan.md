# Projects home — design plan (2026-08-16)

Owner mandate, verbatim: "it's not entirely clear when you're in a new
file… it's almost like you need to 'close' the file and have a home where
you see all your projects?" Field evidence: "Hot Rod" and "Hot Roderick"
saved the same day, no way to tell which was open.

Already shipped this round (the identity half): duplicate saves/renames
auto-suffix to the lowest free number and say so (cloud.ts uniqueName,
ProjectsPanel), designations de-dupe the same way (AdminPage), and the
top bar names the open file with its save state ("Hot Rod 2 · saved 2m
ago" / "unsaved changes" / "draft") plus a spoken flash on every file
switch. This plan is the other half: the HOME those words point at.

## What exists (survey — reuse, don't rebuild)

- ProjectsPanel (src/ui/ProjectsPanel.tsx): the SAVE surface — name box,
  consent moment, row list with open/update/rename/eye/delete. Lives in
  the AuthOverlay popover and embedded on AccountPage.
- StudioPage #/studio "Your work" (src/ui/StudioPage.tsx:214+): already a
  card grid of the user's projects — CardArt live-engine renders, sort,
  open, delete. But it shares the room with the public face, billing and
  doors, and has no rename/duplicate/versions/close.
- CardArt (src/ui/CommunityPage.tsx:71): lazy, intersection-observed,
  LIVE engine render from the project doc — fetchCardDoc
  (community.ts:296) reads by id with no is_public filter, so RLS serves
  the owner's private rows too. Reusable verbatim. No screenshots
  anywhere (house rule).
- File chip plumbing (store.ts): openProjectId + projectSavedAt +
  projectDirty + setOpenProject + flashFile. The home drives these.

## Decision 1 — the home is a route: #/projects

Not the popover: a popover has no URL, no back button, and a grid of
engine cards needs room; the popover stays what it is — the quick-save
surface where the consent moment lives. Not the studio: that room
answers "who am I out there" (avatar, handle, billing); landing there
after closing a file would put your work next to your credit card. The
shell's route switch (src/shell/Shell.tsx:267+) takes one more lazy
entry, same shape as #/studio.

The studio's "Your work" grid then SHRINKS to a recent strip + "All
projects →" so there is exactly one list of truth. The ProjectsPanel
row list likewise gets a footer door to #/projects; its rows stay for
one release and retire once the home proves itself (owner judges on
preview).

## Decision 2 — what the home shows

A grid of engine-rendered project cards (CardArt), newest first, the
studio's sort row carried over. Each card:

- Name + public/private eye + "updated 2m ago" (same agoWord as the
  chip).
- OPEN — the one big affordance; binds the workspace (existing
  loadKitPayload path with projectId + savedAt), flashes "You're now
  working in …", lands in the editor.
- The OPEN file's card wears a visible "OPEN" ring — the home answers
  "which one am I in" at a glance, same words as the chip.
- Overflow verbs: Rename (inline, uniqueName rule, same honest note),
  Duplicate, Delete (confirm), Versions… (phase-gated, below), Share
  link when public.

Duplicate = loadProjectDoc + saveProject under uniqueName(name, list) —
"Hot Rod" duplicates as "Hot Rod 2", exactly the save rule, zero new
server surface. Visibility follows the consent rule for the tier (free/
student duplicates are public like their saves; Pro duplicates start
private). The duplicate does NOT open itself — you stay in your file;
the flash says "Duplicated as 'Hot Rod 2' — you're still in 'Hot Rod'."

## Decision 3 — open/close semantics

- OPEN binds (shipped): openProjectId + savedAt stamp + clean flag.
- CLOSE becomes a real verb — on the file chip's menu and on the open
  card. Closing with unsaved changes asks once, in file words: "Update
  'Hot Rod 2' before closing?" (Update / Save as new file / Close
  without saving — the saved version stays as it was). Then the desk
  resets to a fresh Untitled draft (default cfg + one fresh board —
  the same reset loadKitPayload already performs on project open),
  binding clears, and you land on #/projects. The flash states it:
  "'Hot Rod 2' closed — your desk is clean."
- The chip's click target moves from the popover to #/projects once the
  route lands; the popover keeps living under Save kit.

## Decision 4 — the binding survives reload

Today openProjectId is session-only, so a reload demotes an open file
to "draft" — the chip forgets. Move the binding INTO the synced
ui-generator-* keyspace (a small `ui-generator-openproject` value:
{ id, savedAt }) so it rides the same document as the kit it describes.
That kills the amnesia without resurrecting the I1 staleness vector
(store.ts:446 comment): a cloud workspace pull that replaces the desk
replaces the binding ATOMICALLY with it — binding and kit can never
point at different files, which is precisely the hazard that made the
id session-only. Write it inside loadKitPayload's !viewer block and
setOpenProject; clear it on close. This is the riskiest slice — it
touches the sync invariants — so it ships alone, behind its own probe
run (two-device mispoint scenario stubbed the way the durable-assets
probes stub Supabase).

## Decision 5 — versions compose from phase 2, not before

docs/durable-assets-phase2.md already banked the shape: a
`project_revisions` table (project_id, doc, created_at, keep last N),
affordable now because asset:// refs keep docs kilobytes and old
revisions resolve their backdrops content-addressed, for free. The
home's "Versions…" verb is the UI for it: a dated list, restore banks
the outgoing doc as another revision first (no data loss), then loads
the chosen one as the file's current state — the chip flips to
"unsaved changes"? No: restore WRITES the doc (it's an Update), chip
stays clean and restamps. Every Update (panel button or close-flow)
writes the previous doc to revisions. Gate: needs the migration + the
phase-2 note that the storage GC sweep must count revision docs as
references before any GC ships. Until the table exists the verb simply
doesn't render — same staging rule as everything else.

## Not in this phase

Folders/tags (Pro territory by owner decree — StudioPage.tsx:29),
multi-select, search (revisit past ~30 real projects), offline home,
retiring the popover's row list (one release of overlap first). New
surfaces ship admin-gated per the standing rule until the owner
releases them.

## Slices

H1 route + grid + open/delete + OPEN ring (CardArt, listProjects,
existing open path; chip click retargets) → H2 rename/duplicate
(uniqueName) + Close verb + desk reset + studio/popover doors →
H3 binding into the synced keyspace (reload survival; its own probe
run) → H4 versions (project_revisions migration + Update hook +
Versions… sheet) → preview link to the owner between every slice,
per the ship flow.

## Built 2026-08-16 (owner amendments folded in) — H1+H2 on branch

Shipped on `claude/app-tweaks`, unmerged: #/projects (ProjectsHome),
CardArt grid newest-first, OPEN ring (+ "OPEN · UNSAVED"), open with
unsaved-work confirm, rename (uniqueName), duplicate (no focus steal;
public copies strip boards; the copy's doc takes the copy's name),
delete (deleting the open file settles the desk), Close verb with the
three-door settle sheet (Update / Save as new file / Close without
saving) + closeDesk store action, search-by-name, Import kit on the
home through the ONE settings door (src/generator/settingsImport.ts),
guests get a centered sign-in invitation. Owner amendments beyond this
plan: Spotlight's shelf MOVED here from the kit page ("the kit remains
pure"), a House button in the top bar chrome, and the top bar calmed —
chip = name + amber dot, no ticking clock, sync indicator error-only.
Probes: scratchpad/flame/probe-home-guest.mjs + probe-home-flow.mjs
against the built app on :5301 with mock-home.mjs; home-*.png.

## Deferred (banked, still owed)

- H3 durable binding: openProjectId into the synced ui-generator-*
  keyspace so a reload doesn't demote the open file to "draft" — ships
  alone, with the two-device mispoint probe (see Decision 4).
- H4 versions: project_revisions migration + Update hook + Versions…
  sheet (see Decision 5); the verb doesn't render until the table exists.
- Drag ordering on the home (explicitly NOT required for v1).
- Studio "Your work" grid shrink to a recent strip — for now it keeps
  the full grid plus an "All projects →" door; one list of truth still
  argues for the shrink once the home proves itself.
- ProjectsPanel row-list retirement (one release of overlap first; the
  popover gained its "See all projects →" door).
- Close in the EDITOR chrome (chip menu) — today Close lives on the
  home's open card only; the chip's click lands you next to it.
- i18n for the home's strings (English-first like the admin desk; the
  reused verbs — Open/Delete/Share — already speak all locales).
- Guest promo shelf: the mandate's clean invitation keeps promos off
  the signed-out home; revisit if the owner wants the rail for guests.
