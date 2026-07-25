# Community — launch direction and open decisions
### Owner direction, 2026-07-25 (recorded verbatim in intent)

Launching WITH community. Only Pro keeps generations private; new kits from
everyone else populate a curated community page. Presentation should be fun
— a big button plus a few key components per kit, not a boring grid. Users
need profile pages: picture, name, likes (**no comments**), "use this kit."

## What already exists (don't rebuild)

- `projects` table with `is_public` + unique `share_slug`, private by
  default — the schema comment calls it "groundwork for the opt-in
  showcase" (plan §9 phase 1).
- `#p=slug` public share loading — a shared kit already opens read-only in
  the editor. "Use this kit" is one step past this: clone into the
  visitor's own workspace.
- The engine renders any kit's components live — the "big button + key
  pieces" card can be REAL renders, the same trick as the pricing page HUD.
- Curated shared presets + admin publishing + scheduled release.

## The two decisions that need the owner before any build

1. **Consent framing for public-by-default.** Auto-publishing a user's
   work is a real policy shift: the schema, the Terms and the current UX
   all promise private-by-default today. Publishing must be UNMISSABLE at
   the moment of saving ("Free kits are public — Pro keeps them private"),
   not buried in Terms. Recommended framing: sell it as the feature it is
   ("your kit joins the community gallery") rather than a taking; offer
   Pro as the privacy upgrade at exactly that moment — it is the cleanest
   upgrade prompt the product will ever have.
2. **Where Student sits.** "Only the PRO plans keep generations private" —
   Student is also a paid plan. Decide: Student public (consistent with
   "learning in the open", strengthens community) or private (consistent
   with "same tool as Pro"). Not built until called.

## Shape of the build (phased, once decisions land)

- **Phase C1 — profiles lite:** handle (unique, moderated-on-report),
  display name, avatar (public bucket, size-capped), joined date, their
  public kits. No bios/links at first — less to moderate.
- **Phase C2 — the gallery:** community page fed by public projects in a
  curation queue (admin approves before front-page; the review desk
  pattern reuses directly). Each card = live renders: the kit's primary
  button large, three or four supporting pieces small. Likes (one per
  account, no comments — owner call, and the right one: likes need no
  moderation, comments need a department).
- **Phase C3 — "Use this kit":** clone a public kit into your workspace,
  with attribution kept ("Remixed from @handle's Ember Vault").
- **Moderation stance:** curation-first (nothing reaches the front page
  unreviewed), report button on everything public, admin delete anywhere.
  Avatars and handles are the only free-text/user-media surfaces at
  launch — deliberately small.

## Claims-ledger note

"Community" on any marketing surface stays off until C2 is live — the
cadence rule applies: don't promise the gallery before the gallery exists.
