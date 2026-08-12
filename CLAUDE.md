# UI Kit Maker — working agreements

Live product at uikitmaker.com (Vercel auto-deploys `main`). The owner is the
creative director and final reviewer; they do not read code.

## Ship flow: preview-then-bless (owner mandate, 2026-07-30)

Do NOT merge to `main` without the owner's explicit go-ahead on that change.

1. Develop on your working branch; verify in a real browser before pushing.
2. Push the branch and open a PR. Vercel builds a preview deployment
   automatically (URL pattern:
   `https://ui-kit-maker-git-<branch-with-dashes>-chevon-hicks-projects.vercel.app`).
3. Hand the owner the preview link with a short list of what to check.
4. Merge only after the owner approves. Squash-merge, then reset the working
   branch onto the new `main`.
5. Fast lane: the owner may say "just ship it" for a specific trivial change —
   that permission is per-change, never standing.

When judging a change on any environment, check the build stamp in the kit
page footer ("build <sha> · <date>") against the merge you expect — deploy
lag has burned us before.

Test visual changes at their EXTREMES (max extrusion depth, longest labels,
widest fonts), not just defaults.

## Lanes

- Engine + app (`src/generator/*`, `src/ui/*`, `src/styles/gen.css`,
  `pricing.css`): the app session's lane.
- Homepage (`src/ui/Landing.tsx`, `src/marketing/landingHtml.ts`,
  `src/marketing/landingInit.ts`, `src/styles/landing.css`,
  `src/styles/frontdoor.css`): the Front Door session's lane.
- Reading across lanes is fine; editing across lanes needs a handoff, and any
  cross-lane touch must be called out in the PR body.

## Standing rules

- New assets (components, silhouettes) ship gated (`staged` / preview flags):
  admin-only until the owner releases them.
- Secrets live in Vercel env settings only — never in chat, the repo, or PR
  bodies. Price IDs may appear in chat but not the repo.
- Build with `npm run build` (never bare `vite build` — the font guard runs
  in the npm script).
- Never use the four-point "AI star" (Sparkles/Sparkle) icon anywhere.
- No fabricated social proof, ever.
- Release notes (`#/releases`) update ONLY on the owner's blessing, batch by
  batch (owner mandate, 2026-08-12). The notes never mention: adjustments to
  legal documents, anything involving personal information, or user-account
  internals — account items appear only when they're quality-of-life.
  Staged components stay out of the notes until the owner releases them.
