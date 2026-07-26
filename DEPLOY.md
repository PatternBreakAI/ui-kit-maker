# Where UI Kit Maker deploys

Two deployments build from `main` of `PatternBreakAI/ui-kit-maker`. Know
which one you're looking at before debugging "the site".

## Production — https://uikitmaker.com (Vercel)

The real site. Vercel builds this repo (`vercel.json`: `npm run build` →
`dist/`) and serves the serverless functions in `api/` — hero lineup,
checkout, Stripe webhook, account, admin. Those endpoints exist **only**
here.

Deploy state lives in the **Vercel dashboard** → uikitmaker project →
Deployments. If the live site looks stale, compare the current
Production deployment's commit against `main`'s head before touching any
code — a stale or failed Vercel build looks exactly like "the fix didn't
work".

## Mirror — https://patternbreakai.github.io/ui-kit-maker/ (GitHub Pages)

`.github/workflows/pages.yml` rebuilds and redeploys on every push to
`main` (`npm ci && npm run build`). Static only: no `/api/*`, so the
hero feed fails soft and checkout/auth-backed features are dead ends.
Use it to verify the front-end bundle and as CI — the build runs the
font-roster guard (below) and fails on a bad tree.

Pages can serve cached HTML for up to ~10 minutes after a deploy; hard
refresh before concluding anything.

## Build-time guards

`npm run build` runs `scripts/check-landing-fonts.mjs` first (also
directly: `npm run check:fonts`). It fails the build if the landing
needs a font it doesn't self-host, or hosts one nothing uses. Its error
messages name the exact files to fix. See `docs/front-door.md` for the
full font protocol.

## Local

```
npm run dev        # dev server
npm run build      # guard + typecheck + vite build → dist/
npm run preview    # serve dist/
```

## Logo

The app loads `public/pb-logo.png` (exact name); a fallback shows until
it exists.
