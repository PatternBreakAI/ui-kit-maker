/* POST /api/subscribe — the front door's newsletter form.

   The footer form (front-door workstream, on main since cc71aff) POSTs
   { email, source, locale, website } same-origin and implements this
   contract: 200 or 409 → "You're on the list", anything else → soft
   error. 409 is the repeat-subscriber case and the front-end treats it
   as success — telling someone they're already on the list IS success.

   `website` is a HONEYPOT: humans never see the field, bots fill it.
   A filled honeypot gets a cheerful 200 and nothing else — silence is
   the whole point; an error would teach the bot what happened.

   Rate limiting is in-memory per IP rather than DB-backed like
   /api/export, on purpose: export events belong to an account that
   already trusts us; here we'd be writing IP addresses next to email
   addresses of people who only asked for a newsletter. A warm-instance
   window is plenty for a footer form, and losing it on a cold start
   costs nothing but a few extra Buttondown calls.

   Buttondown is the source of truth for consent and unsubscribes; the
   optional Supabase mirror is only so we own a copy of who signed up. */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const RATE_PER_HOUR = 10;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 3600_000;
  const list = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  if (list.length >= RATE_PER_HOUR) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  // keep the map from growing unbounded on a long-lived instance
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => t <= windowStart)) hits.delete(k);
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) return json({ error: "The mailing list isn't configured on this deployment." }, 503);

  let body: { email?: string; source?: string; locale?: string; website?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  // the honeypot: bots fill it, humans can't see it — swallow silently
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true });
  }

  const email = (body.email ?? "").trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("x-real-ip") || "unknown";
  if (limited(ip)) return json({ error: "Too many sign-ups from here — try again in a bit." }, 429);

  /* tags: source is free-form but short (more sources will come — signup,
     export…); locale only from the front door's seven. Anything odd
     normalizes rather than erroring — a tag is metadata, not a gate. */
  const source = /^[a-z0-9_-]{1,24}$/i.test(body.source ?? "") ? (body.source as string) : "web";
  const locale = ["en", "zh", "fr", "es", "it", "de", "ja"].includes(body.locale ?? "") ? (body.locale as string) : "en";

  let bd: Response;
  try {
    bd = await fetch("https://api.buttondown.com/v1/subscribers", {
      method: "POST",
      headers: { authorization: `Token ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ email_address: email, tags: [source, locale] }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: "The mailing list didn't answer — try again." }, 502);
  }

  if (bd.status === 201) {
    await mirror(email, source, locale);
    return json({ ok: true });
  }

  /* Repeat subscriber: Buttondown answers 400 with an already-exists code.
     The front-end maps 409 to the success UI, which is the right UX. */
  let detail = "";
  try { detail = JSON.stringify(await bd.json()); } catch { /* non-JSON error page */ }
  if (/already[_ ]?(exists|subscribed)/i.test(detail)) {
    return json({ ok: true }, 409);
  }

  // never log the key; the status and error code are diagnosis enough
  console.error(`buttondown ${bd.status}: ${detail.slice(0, 300)}`);
  return json({ error: "The mailing list didn't accept that — try again." }, 502);
}

/** Best-effort copy into our own table. Buttondown remains the record of
    consent; failure here must never fail the sign-up. */
async function mirror(email: string, source: string, locale: string): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return;
  try {
    await fetch(`${supaUrl}/rest/v1/mailing_list?on_conflict=email`, {
      method: "POST",
      headers: {
        apikey: service,
        authorization: `Bearer ${service}`,
        "content-type": "application/json",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ email, source, locale }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* the mirror is a convenience, never a gate */ }
}
