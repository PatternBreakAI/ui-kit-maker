# Launch checklist

The owner's running list of what must be true before the doors open.
Alpha can start before every box is ticked — this is ordered by risk,
top item first. Check things off by moving them to DONE with a date.

## Before alpha invites go out

1. **Real transactional email (SMTP).** Supabase's built-in mailer is a
   demo courtesy: slow (the owner's own confirmation email took long
   enough to look lost), rate-limited, and not for production. Every
   sign-up confirmation, password reset, and magic link rides this rail.
   Fix: connect a real sender in Supabase → Project Settings → Auth →
   SMTP. Recommended: Resend or Postmark (both have free tiers that
   cover early volume; either wants a DNS record on uikitmaker.com to
   sign the mail). Owner runs the dashboard steps; this session writes
   them out when asked.

2. **Dress the house account.** Sign in as the house account, open
   #/studio, set handle + display name + avatar. Until then the seed
   kits' bylines read "by a maker" with a monogram instead of the brand
   face. (Two minutes, no code.)

3. **Backdrop refill for the seed wall** — the staged versions of the
   seed kits (SQL handed to the owner; run in the Supabase SQL editor).

## Before charging strangers (already true, verify once more at launch)

- Stripe live mode webhook + portal round-trip on a real card.
- Export entitlement server-side (grants, licence stamp, rate limit).
- Legal pages current (#/terms, #/privacy).

## Abuse watch (flip when metrics say so, not before)

The generator runs client-side, so "a bot generating UI all day" costs
us nothing — the watchable edges are the cloud ones:

- **Sign-up spam** → Supabase Auth already rate-limits; the captcha
  toggle (Turnstile/hCaptcha) is one dashboard switch if it appears.
- **Storage bloat** → free tier has no cloud saves; avatars are small
  and folder-confined. Eyeball Database/Storage size monthly.
- **Egress spikes** (gallery scraping) → Supabase dashboard → Usage;
  add caching the day it trends.
- **Card-testing bots** on checkout → Stripe Radar's job; glance at
  the Radar tab after launch week.

Exports, admin API and the hero feed are already rate-limited,
DB-gated and CDN-cached respectively — no action.

## Nice-before-launch, not blocking

- Custom domain on outbound email (matches the SMTP item's DNS work).
- A second admin account as break-glass (comp path already supports it).
- Supabase database backup schedule confirmed (dashboard default is on;
  eyeball it).

## DONE

- (nothing moved here yet)
