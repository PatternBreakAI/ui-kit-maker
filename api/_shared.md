# /api — server authority for billing

These are Vercel serverless functions (Node runtime, web-standard
`Request`/`Response` handlers).

> **Export a NAMED HTTP METHOD, never a default.**
> `export async function POST(req: Request): Promise<Response>`
>
> A `export default function handler(req)` is read as the Node
> `(req, res) => void` signature: Vercel **ignores the returned Response**,
> nothing ever writes to `res`, and the invocation hangs until the 300s
> ceiling and 504s. That cost us a day of "the export service didn't
> answer" — every function here was affected, including checkout and the
> webhook. The platform log names it exactly:
> `WARN: default export returned a Response`.
>
> A bonus: with a named method, the platform answers non-POST requests
> with 405 for free, so no method guard is needed in the handler.

They are the first server-side code in the product, and they exist because
of Appendix A: `profiles.plan_id` is server-truth, so only something holding
the Supabase **service-role** key may grant Pro. The browser can ask to
upgrade; it can never upgrade itself.

| Route | Method | What it does |
|---|---|---|
| `/api/checkout` | POST | Verifies the caller's Supabase token, finds or creates their Stripe customer, opens a Checkout Session, returns the URL. The price is chosen **server-side**: `STRIPE_PRICE_STUDENT` if the account has an approved `student_verifications` row, `STRIPE_PRICE_PRO` otherwise. The client never names a price, so the student rate cannot be requested by tampering. |
| `/api/portal` | POST | Verifies the token, returns a Stripe billing-portal URL so the customer can cancel or update their card. |
| `/api/stripe-webhook` | POST | Verifies the Stripe signature, then moves `plan_id` between `pro`, `student` and `free` as subscriptions start, renew, lapse or cancel. Which paid plan is read back off the **price that was actually purchased** (`planOf`), not off anything the client said. |
| `/api/subscribe` | POST | The front door's newsletter form. Honeypot-filled submissions get a silent 200 (never teach the bot). Valid emails forward to Buttondown with `[source, locale]` tags; 201 → 200 `{ok:true}`, repeat subscriber → 409 `{ok:true}` (the front-end shows success — correct for a repeat), other Buttondown failures → 502 with the status logged and the key never logged. In-memory per-IP rate limit (10/hour) — deliberately NOT DB-backed like export's: we don't write IPs next to newsletter emails. Mirrors successes into `mailing_list` (service-role only), best-effort; Buttondown stays the record of consent. |
| `/api/export` | POST | Reads `plan_id` from the database and either refuses or issues an export grant (licence block + reference), logging it for the rate limit. The browser will not assemble a paid artifact without one. |
| `/api/student-review` | POST | Admin-only (the column-revoked `is_admin` flag). `{action:"list"}` returns applications with ten-minute signed URLs to view pending IDs; `{action:"approve"\|"reject", id}` records the decision **and deletes the ID document in the same call** — the document goes first, so the "we delete your ID" promise on the application form cannot be half-kept. Approval never touches `plan_id`; it only lets `/api/checkout` reach for the student price. |
| `/api/admin` | POST | Admin-only, same gate: the CALLER's own profile row must say `is_admin` (read with the service role — nothing the client claims is believed). `{action:"search", q}` finds accounts by email substring (Stripe ids stay server-side; the client only learns present/absent). `{action:"setPlan", userId, plan}` comps or revokes: grants stamp `plan_status='comped'`, revokes `'canceled'`, so a comp is never mistaken for a Stripe purchase. Every change is audit-logged (structured console line + best-effort `admin_audit` insert). Serves the `#/admin` page (linked only from the Account page's admin-only card). |

## Environment variables

| Name | Where it comes from | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | `sk_live_…` (this product runs in live mode). Mark **Sensitive** in Vercel. |
| `STRIPE_PRICE_PRO` | the annual price on the Pro product | `price_…` — price IDs are per-mode, so a test-mode copy would need its own |
| `STRIPE_PRICE_STUDENT` | the annual price on the Student product | `price_…`. **Optional, and its absence is silent by design**: without it `planOf()` in the webhook falls back to `pro` for every paid subscription, so an approved student who buys gets charged the Pro price and lands on the Pro plan. Nobody who paid is ever downgraded — but nobody reaches the student plan either. Set it before approving anyone. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint | `whsec_…`, exists only after the endpoint is registered |
| `BUTTONDOWN_API_KEY` | Buttondown → Settings → API | the mailing-list token. Without it `/api/subscribe` answers 503 and the footer form shows its soft error. Mark **Sensitive**. |
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
