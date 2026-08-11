# Commercial architecture — living document

Required by Appendix A of the commercial business plan (July 21, 2026).
This documents what exists **today**, what is deliberately deferred, and
where every boundary for the later phases already lives. It is updated
whenever a commercial phase ships.

## Status: Phase 1 (accounts + cloud saves) — shipped
## Update: named projects + opt-in showcase (v76) — shipped

```
Browser (GitHub Pages, static Vite build)
│  editor, rendering, exports        ← all still client-side & free
│  src/generator/cloud.ts            ← single client-side account boundary
│      │ dynamic import of @supabase/supabase-js (code-split)
│      ▼
Supabase (managed auth + Postgres, RLS everywhere)
   auth.users                        ← identity; passwords never touch our code
   public.profiles                   ← 1:1 with users; plan_id pointer ('free')
   public.plans                      ← capability catalog as data (not code)
   public.workspaces                 ← the cloud save: whole ui-generator-* keyspace
   public.projects                   ← named saves (LIVE, v76); private by default; share_slug publishes
   public.terms_acceptances          ← consent records (version, locale, 13+)
   public.organizations (+members)   ← reserved, deny-all RLS (studio phase)
```

## Authentication flow

- Supabase Auth (email/password, magic link, password reset). No custom
  auth, no password storage, no service-role key anywhere in the client.
- Config resolution: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` baked
  at build time (GitHub Actions secrets), with a per-browser localStorage
  override (`forge-cloud-url`/`forge-cloud-anon`) so the owner can test a
  project against the live static deploy. Unconfigured → the entire layer
  is inert and the app is the local-only build.
- Sign-up records a consent row (version `TERMS_VERSION` in cloud.ts,
  locale, 13+ affirmation) — deferred to the first authenticated session
  when email confirmation is on.

## Cloud-save model

- The document is the app's entire `ui-generator-*` localStorage keyspace,
  as one JSONB (`workspaces.doc`). Whole-doc last-write-wins.
- Change detection: a storage write-hook stamps `forge-cloud-lastedit` the
  moment any synced key changes (signed in or not) and schedules a
  debounced push; a 3 s signature poll (FNV-1a over sorted keys+values)
  backstops it. Tab-hidden flushes whenever the doc is ahead of the cloud.
- Sign-in reconciliation: no server copy → push local; local edited more
  recently than the server row → push local; otherwise the server copy
  wins — the local copy is snapshotted to `forge-cloud-prevlocal` first
  (never overwriting an unrestored snapshot; restorable from the account
  menu), and the page reloads only after the pull verifiably applied.
- Hardening invariants (each closed a reviewed failure mode):
  - **No push before pull** — pushes are gated on a successful
    reconciliation; a failed first pull retries with backoff instead of
    letting a near-empty local doc clobber the cloud copy.
  - **Account-boundary guard** — `forge-cloud-owner` remembers which
    account the local doc belongs to; a different user signing in on the
    same browser never uploads the previous user's work.
  - **Verified pulls, capped reloads** — `applyDoc` verifies the applied
    signature; a per-tab counter stops quota failures from reload-looping.
  - **Serialized, retried, rebasing pushes** — one in-flight push,
    exponential backoff on failure, and a staleness check that re-runs
    reconciliation when another device wrote since our last pull.
  - **Honest chip** — sync errors show as "Cloud paused — saved locally",
    never as a green saved state.
  - **Anonymous work is labeled and shielded** — the first real edit requests
    `navigator.storage.persist()` (guards against storage-pressure eviction,
    e.g. Safari's 7-day sweep), and a signed-out user's chip reads
    "Saved — this browser only", tapping through to sign-in. Deliberate
    data-clearing still erases anonymous work; the cloud account is the
    real safety net.
- The DB keeps one previous revision (`workspaces.previous`, maintained by
  trigger only when the doc actually changes) as a server-side undo.
- Magic links are sign-in only (`shouldCreateUser: false`): account
  creation stays on the consent-gated path, so no account exists without a
  13+/terms record. The consent marker is bound to the accepting email and
  carries the real acceptance timestamp. Draft Terms/Privacy live at
  `public/legal/` and are linked from the sign-up checkbox.

## Named projects + opt-in showcase (v76)

Phase 1 gave every account one auto-synced document (the workspace — "your
current desk"). v76 turns on the reserved `public.projects` boundary so an
account keeps a **library** of named kits — "saved files" beside the desk —
using only the schema and RLS that already shipped. No server functions, so
this stays entirely on the free static tier.

- **Payload contract, single-sourced.** A project stores the same curated
  kit snapshot a share link carries — `store.kitPayload()` (cfg + per-
  component forks, content, sizing, nudges). `shareKit()` and `saveProject()`
  now build from that one function, so a project, a `#share=` URL, and a
  published `#p=` link are byte-identical views of the same kit.
- **Two load paths, one function.** `store.loadKitPayload(p, {viewer})`:
  `viewer:true` (a share / public link) hydrates read-only in memory, exactly
  like a shared kit; `viewer:false` (opening your own project) also persists
  every field to the keys the app boots from, so the opened kit survives
  reload and the write-hook syncs it into the workspace. Opening confirms
  first — it replaces the kit on screen.
- **CRUD in the single client boundary.** `cloud.ts` gains
  `listProjects / saveProject / updateProjectDoc / renameProject /
  deleteProject / setProjectPublic / loadProjectDoc / loadPublicProject`.
  Every owner call carries `user_id = auth.uid()` and is double-guarded by
  RLS; the account menu gates the Projects UI on a live session.
- **Opt-in publish → `share_slug`.** Publishing a project mints a short,
  unguessable slug once (retried on the unlikely collision) and copies a
  `#p=<slug>` link. Anyone — even signed-out — can open it read-only via the
  `is_public` RLS path; the anon key reads that one row and nothing else.
  Unpublishing keeps the slug so the same link re-activates on republish.
  This is the "move shares to `projects.share_slug`" upgrade the known-
  limitations list called for; the self-contained `#share=` URL still works.

Boundaries honored: projects are **private by default**, publishing is an
explicit per-project act, `plan_id` is untouched (nothing here is gated), and
no exporter moved — the first *paid* feature still waits for server authority
(Vercel), never a client flag.

## Admin role + shared presets (v77)

An `is_admin` flag on `profiles` gates the first **server-enforced** capability:
an admin-curated shared-preset library (`public.presets`). Presets are
world-readable — they appear in the Presets panel for every visitor, signed in
or not — and **admin-writable only**, enforced by RLS (the insert/update/delete
policies require the caller's profile to be `is_admin`), never a client flag.
`is_admin` is set out of band (SQL / dashboard); a column-level
`revoke update (is_admin)` makes self-promotion impossible even though a user
may edit their own profile row. The client's admin check is UI gating only.
This is the exact shape the paid-entitlement phase will follow: the capability
lives in the database, the server enforces it, the client only reflects it.

Starter presets (the styles that ship in the bundle — formerly "built-in")
are admin-curatable too: `public.app_settings` (world-readable, admin-writable
key/value, same RLS shape as presets) holds `hidden_starter_presets`, the ids
an admin retired. Retired starters disappear from the Presets panel for every
visitor and are excluded from randomize rolls; an admin-only "Restore removed
starters" button clears the list. Cloud off → empty list → all starters show.

Curation is a full edit loop: applying a shared preset marks it as the
Overwrite target (a fresh publish adopts itself as the target), and the
admin's "Overwrite" action saves the current look back into that preset in
place — same RLS-gated update path, name kept, thumbnail re-rendered by the
one shared snapshot recipe publish uses.

## Tiers (v79) — product shape ahead of Stripe

`src/generator/entitlements.ts` is the one capabilities-as-data table:
guest (no session) / free (signed in) / pro (plan_id past 'free', or the
admin). Gates: zoom ceiling (100/150/unlimited), starter presets (4/6/all
— locked cards stay visible and tap through to sign-in or #/pricing), the
guest kit renders 5 proof components with the rest as locked teasers, PNG
export scale (1×/1×/4×), and vector-grade exports (SVG, HTML, copy-SVG,
game kit, engine zip) are pro-only. The guest PNG catalog filters to the
five unlocked components so the sheet never hands over what the page
locks. Signup celebrates with the loot-pack reveal (the two presets
between the guest and free limits). #/pricing lays the three columns out;
the Pro CTA stays closed until Stripe.

HONEST LIMITATION (Appendix A): every gate is client-side today — product
shape, not security. The bundle contains all presets and exporters. Real
enforcement follows the plan: plan_id is already server-truth (RLS pins
it to 'free'), and the paid tier's exports must move behind server
functions when Stripe lands. Cloud-off (local/dev) builds run at the free
tier so development stays unimpeded.

## Billing (v85) — Stripe, live mode

One product, one price: **UI Kit Maker Pro, $29.99/year**, annual-only
(the deferred "annual-only decision" is now made). Three serverless
functions in `/api` are the product's first server-side code — see
`api/_shared.md` for routes, env vars and the coupon-based live test:

- `POST /api/checkout` verifies the caller's Supabase token, finds or
  creates their Stripe customer, and returns a Checkout URL. It refuses
  if the account is already Pro, and only ever redirects to our own
  origins.
- `POST /api/stripe-webhook` verifies Stripe's HMAC signature (Web
  Crypto, 5-minute replay window) and is **the only writer of `plan_id`**
  — it holds the service-role key, which is what gets past the RLS
  policy pinning client writes to `'free'`. Handles checkout completion
  plus the subscription lifecycle, so a lapse or cancellation downgrades
  as reliably as a purchase upgrades.
- `POST /api/portal` returns a Stripe billing-portal URL — the "cancel
  anytime online" path the subscription terms promise.

New profile columns (`stripe_customer_id`, `stripe_subscription_id`,
`plan_status`, `plan_renews_at`) carry the pointers; all four are
column-revoked from `anon`/`authenticated`, so a client cannot write them
even inside its own row. No Stripe SDK: REST over `fetch`, so the
dependency list and the client bundle are untouched.

## Comped plans (v90) — the admin desk

`POST /api/admin` + the `#/admin` page replace hand-written SQL for
comping accounts. The page is linked from exactly one place — an
admin-only card on the Account page (owner call, 2026-07-25) — and that
card's visibility is cosmetic. The security model is the student-review
desk's:
the client-side `is_admin` flag only decides what renders; the function
re-reads the **caller's own** profile row with the service role on every
call and 403s anyone the database doesn't flag. Admin itself is granted
exactly once, by the owner, in the SQL editor — there is deliberately no
in-app way to grant it:

    update public.profiles set is_admin = true where email = '<owner email>';

**How comps and Stripe coexist.** Grants stamp `plan_status = 'comped'`
(revokes: `'canceled'`), which makes a comp distinguishable from Stripe's
`'active'` in the data. The interaction is safe in all four directions:

1. **Comped, no Stripe history** — subscription events find the profile
   via `stripe_customer_id` or carried metadata; a comped account with
   neither can never be matched, so nothing can clobber it.
2. **Comped, later subscribes for real** — `checkout.session.completed`
   overwrites the comp with `'active'`. Correct: they're paying now, and
   the record should say so.
3. **Comped over an old Stripe customer, old subscription then dies** —
   the webhook's downgrade paths (subscription deleted / lapsed) check
   `plan_status` first and **skip the downgrade when it reads `'comped'`**:
   the owner's grant outranks a lapsed subscription.
4. **Revoked (`plan_id='free'`, `'canceled'`)** — inert; any later real
   purchase proceeds normally.

The desk warns when a target still has a live subscription (case 2 in
reverse: Stripe's next event overwrites the change — cancel in Stripe if
the change should stick). Every action lands in the Vercel function logs
as a structured line and, once the v90 migration is applied, in the
service-role-only `admin_audit` table (who, to whom, old→new, when).

## Paid exports (v85) — server-issued grants

The first capability that is actually *enforced* rather than merely
displayed. `POST /api/export` reads `plan_id` from the profile row (which
no client can write) and either refuses or returns a short-lived grant
carrying a licence block. `src/generator/exportGate.ts` is the single
door every paid artifact passes through — call sites no longer decide
entitlement, so the old "flip a boolean in devtools" bypass now returns
403 instead of a kit.

**Why rasterization stays in the browser.** The engine kit and game kit
ship rasterized PNGs, and our SVG leans on gaussian blur, turbulence and
colour-matrix filters that server-side rasterizers support only
partially. Rendering those on the server would quietly degrade what
customers paid for — a worse outcome than piracy. So the split is:
the server decides *whether* an export happens and stamps it; the
browser does the drawing.

Three deterrents, none of which a normal user ever notices:

1. **Entitlement at the source** — the plan is read from the database per
   export, so a lapsed or downgraded account stops producing artifacts
   immediately, with no client state involved.
2. **A licence block in every bundle** (`LICENCE.txt` in the engine kit,
   SVG pack and game kit) naming the account, the issue time and a
   reference. A redistributed kit is traceable to the account that leaked
   it, and a paying customer gets a provenance record.
3. **A quiet per-account rate limit** (60/hour, logged in
   `public.export_events`) that makes scripted harvesting and wholesale
   account-sharing impractical. Hand-exporting all day never reaches it.

**What this does NOT claim.** The renderer must live in the browser to
draw the canvas, so the SVG of anything on screen is in the DOM and
always copyable. This raises the cost of taking the *assembled* products
— the engine kit, the SVG pack, the sheets — from "flip a flag" to
"rebuild the manifests and tooling yourself, one component at a time".
It does not make the artwork secret, and nothing in the product should
imply it does.

## Pro gating for the Boards era (recommendation, 2026-08-10)

Owner prompt: "think about what to gate for PRO users." The line that has
worked since v85: **creativity is free, professional output is Pro** —
free users fall in love in the browser; the artifact a shipping team
needs is the paid door. Applied to the new surfaces:

| Surface | Tier | Why |
| --- | --- | --- |
| Boards: build, per-instance text/value, backgrounds | Free | Creativity primitive — gating it starves the funnel |
| Board PNG export (1080p mockups) | Free | Shareable mockups ARE the marketing loop |
| **Boards→Scenes Unity export** | **Pro** | The flagship shipping-team artifact; rides the EXISTING `/api/export` grant + licence + rate-limit machinery — no new enforcement surface |
| Full-res background originals in the export zip | Pro | Travels only inside the scene export |
| Engine kit / game kit / SVG pack | Pro (unchanged) | v85 status quo |

The free Asset Store kit ships demo scenes BUILT WITH the Pro pipeline —
the package itself demonstrates what Pro buys, which is the funnel
message ("this was generated; remix it"). Store-listing copy must stay
inside the compliance box: the package is fully functional as delivered;
Pro sells the REMIX-and-re-export loop, never a dependency of the
downloaded kit.

**The invariant that closes the funnel (owner Q, 2026-08-10: "why would
I ever join?"): a remix cannot exit the browser on the free tier.** Free
kits are finished samples WE curate; a user's remixed kit has no free
export path — every artifact that leaves the browser as usable game
assets (engine kit, game kit, SVG pack, and Boards→Scenes when it lands)
passes the `/api/export` grant. Any future export feature routes through
that same gate before it ships. The only free take-away stays the
flattened PNG mockup — a picture of a kit, not a kit — and the free
kit's README/description must say this plainly ("remix free in the
browser; export your remix with Pro") so nobody feels bait-and-switched.

## Security posture (what is and is not protected)

- The anon key is public by design; **all** access control is row-level
  security. Every table has RLS enabled; workspaces/projects/consents are
  owner-only (projects additionally world-readable only when `is_public`).
- `profiles.plan_id` cannot be self-upgraded: the update policy's WITH
  CHECK pins it to 'free' until server-side entitlement resolution exists.
- Honest limitation (per Appendix A): everything the browser renders —
  kit definitions, the renderer, exporters — remains inspectable today.
  Nothing commercially gated ships yet, so nothing needs server authority
  yet. The first paid feature must land server-side (Vercel functions),
  never as a client flag.

## Deliberately deferred (with their reserved boundaries)

| Phase (plan §12)            | Reserved today                                             |
| --------------------------- | ---------------------------------------------------------- |
| Stripe billing              | SHIPPED (v85): live mode, $29.99/yr annual — see Billing above |
| Entitlement service         | capabilities-as-data in `plans.capabilities` (jsonb)        |
| Protected exports           | none client-side to remove later — exporters stay free now  |
| Opt-in showcase             | SHIPPED (v76): named projects + `is_public`/`share_slug`     |
| Studio / classroom seats    | `organizations`, `organization_members` (deny-all RLS)      |
| Data rights                 | Download-my-data in the account menu; deletion via Supabase |

## Known limitations / open items

- Sync is whole-document LWW: two devices editing simultaneously trade the
  document; the server keeps one previous revision. Fine for a single
  designer; revisit before teams.
- Share links now have two shapes: the self-contained `#share=` URL (the
  kit deflated into the link, works with no cloud) and, since v76, a
  published project's short `#p=<share_slug>` link (resolved from the cloud
  by slug). The `#p=` link needs a cloud-configured deployment to resolve;
  where cloud is off it simply no-ops and `#share=` remains the fallback.
- The repo is public and the frontend is on GitHub Pages. Appendix A's
  end-state wants a private repo + Vercel (for server functions and bundle
  privacy). The repo is now Vercel-ready (`vercel.json`, source maps off);
  the click-path — import into Vercel first, then flip the repo private —
  is documented in docs/CLOUD-SETUP.md ("Hide the code"). The bundle the
  browser runs remains inspectable until exports move server-side; that is
  Appendix A's documented limitation, not a regression.
- Terms/Privacy documents are drafts; counsel review is a launch gate
  (plan §10). The consent record stores the accepted version string.

## Rollback

Phase 1 is additive. Removing the two GitHub secrets (or never setting
them) returns every visitor to the exact pre-cloud, local-only behavior.
The Supabase project can be paused or deleted independently; local copies
of work always survive sign-out.
