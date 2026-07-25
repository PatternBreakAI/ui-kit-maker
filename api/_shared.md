# /api — server authority for billing

These are Vercel serverless functions (Node runtime, web-standard
`Request`/`Response` handlers). They are the FIRST server-side code in the
product, and they exist because of Appendix A: `profiles.plan_id` is
server-truth, so only something holding the Supabase **service-role** key
may grant Pro. The browser can ask to upgrade; it can never upgrade itself.

| Route | Method | What it does |
|---|---|---|
| `/api/checkout` | POST | Verifies the caller's Supabase token, finds or creates their Stripe customer, opens a Checkout Session for `STRIPE_PRICE_PRO`, returns the URL. |
| `/api/portal` | POST | Verifies the token, returns a Stripe billing-portal URL so the customer can cancel or update their card. |
| `/api/stripe-webhook` | POST | Verifies the Stripe signature, then flips `plan_id` between `pro` and `free` as subscriptions start, renew, lapse or cancel. |
| `/api/export` | POST | Reads `plan_id` from the database and either refuses or issues an export grant (licence block + reference), logging it for the rate limit. The browser will not assemble a paid artifact without one. |

## Environment variables

| Name | Where it comes from | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | `sk_live_…` (this product runs in live mode). Mark **Sensitive** in Vercel. |
| `STRIPE_PRICE_PRO` | the annual price on the Pro product | `price_…` — price IDs are per-mode, so a test-mode copy would need its own |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint | `whsec_…`, exists only after the endpoint is registered |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → **Secret keys** | the `sb_secret_…` key (or a legacy `service_role` JWT). Bypasses RLS — **Sensitive**, never in the repo or the client. `SUPABASE_SECRET_KEY` is accepted as an alias. |
| `SUPABASE_URL` | Supabase → Settings → API | optional; falls back to `VITE_SUPABASE_URL` |

Every function fails closed: with any variable missing it returns a plain
"billing isn't configured" error rather than half-completing a purchase.

## Testing in live mode without spending money

The product runs in live mode from day one (small audience, no promotion
yet), so there is no test-mode price to point at. To exercise the whole
path — Checkout → webhook → `plan_id` flips to pro → portal cancels —
without a real charge:

1. Stripe → Product catalog → **Coupons** → create a **100% off**, forever
   coupon, then add a **promotion code** to it (e.g. `FOUNDER`).
2. Buy Pro on the live site and enter that code at Checkout — the CTA
   already sends `allow_promotion_codes`, so the field is there.
3. Stripe creates a real $0 subscription: the webhook fires exactly as it
   would for a paid one, and the account flips to Pro for real.
4. Cancel it from Account → Manage subscription to watch the downgrade.

A real card works too — refunding it later costs only Stripe's processing
fee, which refunds do not return.

## Why no Stripe SDK

The functions talk to Stripe's REST API with `fetch` and form-encoded
bodies, and verify webhook signatures with Web Crypto HMAC-SHA256. That
keeps the dependency list untouched, keeps cold starts small, and keeps
the whole flow readable in one file each.

## Registering the webhook (after first deploy)

1. Stripe → Developers → **Webhooks** → **Add endpoint**
2. URL: `https://uikitmaker.com/api/stripe-webhook`
3. Events: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`
4. Copy the signing secret (`whsec_…`) into Vercel as
   `STRIPE_WEBHOOK_SECRET`, then redeploy so functions pick it up.
