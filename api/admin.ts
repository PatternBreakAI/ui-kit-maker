/* POST /api/admin — the owner's desk: find an account, set its plan.

   WHY A SERVER FUNCTION. Comping a user used to mean hand-written SQL in
   the Supabase editor, which is error-prone and unlogged. The client-side
   is_admin flag (cloud.ts) only decides what RENDERS — this function is
   the enforcement: it verifies the caller's Supabase JWT, reads THE
   CALLER'S OWN profile row with the service role, and refuses anyone the
   database doesn't say is an admin. Nothing the browser claims is
   believed.

   Three actions, nothing else:
     { action: "search",  q }                          → matching profiles
     { action: "setPlan", userId, plan: pro|student|free }
     { action: "adopt",   fromEmail, toEmail, dryRun? }

   adopt moves EVERY kit from one account to another — likes, share
   slugs and gallery listings ride along untouched because only the
   projects.user_id column changes. It exists so an account can be
   retired without losing its work (the house-account era ends by
   folding its kits into the owner's profile, then deleting the empty
   account by hand in Supabase — this desk still deletes no users).
   dryRun resolves both accounts and counts the kits without moving
   anything; the client shows that preview in its confirm dialog.

   setPlan stamps plan_status so a grant is distinguishable from a Stripe
   purchase in the data: 'comped' for grants, 'canceled' for revokes.
   Stripe interaction (see docs/commercial-architecture.md): comped users
   have no subscription, so webhook events can't find them; the webhook
   also refuses to downgrade a 'comped' profile when an OLD subscription
   of theirs dies. A comped user who later genuinely subscribes is
   overwritten to 'active' by the webhook — correct, they're paying now.

   Every action is audit-logged: structured console line (Vercel function
   logs) always, plus a best-effort insert into admin_audit (service-role
   only table) when the v90 migration exists. */

const PLANS = new Set(["pro", "student", "free"]);

const COLS = "id, email, plan_id, plan_status, plan_renews_at, stripe_customer_id, stripe_subscription_id, is_admin, created_at";

type ProfileRow = {
  id: string; email: string | null; plan_id: string | null; plan_status: string | null;
  plan_renews_at: string | null; stripe_customer_id: string | null;
  stripe_subscription_id: string | null; is_admin: boolean | null; created_at: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** What the browser gets to see. The raw Stripe ids stay server-side —
    present/absent is all the desk needs. */
function pub(r: ProfileRow) {
  return {
    id: r.id,
    email: r.email,
    plan: r.plan_id ?? "free",
    status: r.plan_status,
    renewsAt: r.plan_renews_at,
    hasStripe: !!r.stripe_customer_id,
    hasSubscription: !!r.stripe_subscription_id,
    isAdmin: r.is_admin === true,
    createdAt: r.created_at,
  };
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Admin isn't configured on this deployment." }, 503);

  let body: { action?: string; q?: string; userId?: string; plan?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first." }, 401);

  // identity comes from Supabase, never from the request body
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again." }, 401);
  const caller = (await who.json()) as { id?: string; email?: string };
  if (!caller.id) return json({ error: "Your session expired — sign in again." }, 401);

  const svc = { apikey: service, authorization: `Bearer ${service}` };

  // the gate: the CALLER's row must say is_admin, in the database
  const gate = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${caller.id}&select=is_admin`, { headers: svc });
  if (!gate.ok) return json({ error: "Couldn't verify your account — try again." }, 502);
  const me = ((await gate.json()) as { is_admin?: boolean }[])[0];
  if (me?.is_admin !== true) return json({ error: "This desk is admin-only." }, 403);

  /* ── search ──────────────────────────────────────────────────────── */
  if (body.action === "search") {
    // substring match on email; the pattern is neutered to safe characters
    const q = String(body.q ?? "").trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "").slice(0, 80);
    if (q.length < 2) return json({ error: "Give me at least two characters of the email." }, 400);
    const res = await fetch(
      `${supaUrl}/rest/v1/profiles?email=ilike.${encodeURIComponent(`*${q}*`)}&select=${encodeURIComponent(COLS)}&order=created_at.desc&limit=20`,
      { headers: svc },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: `Search failed (${res.status}). ${detail.slice(0, 200)}` }, 502);
    }
    const rows = (await res.json()) as ProfileRow[];
    return json({ users: rows.map(pub) });
  }

  /* ── setPlan ─────────────────────────────────────────────────────── */
  if (body.action === "setPlan") {
    const userId = String(body.userId ?? "");
    const plan = String(body.plan ?? "");
    if (!/^[0-9a-f-]{36}$/.test(userId)) return json({ error: "Bad user id." }, 400);
    if (!PLANS.has(plan)) return json({ error: "Plan must be pro, student or free." }, 400);

    // read the target first — the audit trail wants old→new, and the
    // response wants to warn when Stripe still holds a live subscription
    const tr = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${userId}&select=${encodeURIComponent(COLS)}`, { headers: svc });
    if (!tr.ok) return json({ error: "Couldn't read that account." }, 502);
    const target = ((await tr.json()) as ProfileRow[])[0];
    if (!target) return json({ error: "No account with that id." }, 404);

    /* 'comped' for grants, 'canceled' for revokes — so a comp is never
       mistaken for a Stripe purchase in the data. A comp has no renewal
       date; Stripe's columns are left alone so billing history survives. */
    const patch = {
      plan_id: plan,
      plan_status: plan === "free" ? "canceled" : "comped",
      plan_renews_at: null,
    };
    const up = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      return json({ error: `Couldn't set the plan (${up.status}). ${detail.slice(0, 200)}` }, 502);
    }

    // audit: the console line always lands in the function logs …
    const audit = {
      at: new Date().toISOString(),
      admin: caller.id, adminEmail: caller.email ?? null,
      target: userId, targetEmail: target.email,
      oldPlan: target.plan_id ?? "free", oldStatus: target.plan_status,
      newPlan: plan, newStatus: patch.plan_status,
    };
    console.log(`[admin] setPlan ${JSON.stringify(audit)}`);
    // … and the table gets it too, when the v90 migration has been run
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: userId, action: "setPlan", detail: audit }),
    }).catch(() => { /* audit table not migrated yet — the console line stands */ });

    const live = target.plan_status === "active" || target.plan_status === "trialing" || target.plan_status === "past_due";
    return json({
      ok: true,
      user: pub({ ...target, plan_id: plan, plan_status: patch.plan_status, plan_renews_at: null }),
      warning: live && target.stripe_subscription_id
        ? "This account has a live Stripe subscription — the next Stripe event will overwrite this change. Cancel the subscription in Stripe if the change should stick."
        : null,
    });
  }

  /* ── adopt ───────────────────────────────────────────────────────── */
  if (body.action === "adopt") {
    const clean = (v: unknown) =>
      String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "").slice(0, 120);
    const fromEmail = clean((body as { fromEmail?: unknown }).fromEmail);
    const toEmail = clean((body as { toEmail?: unknown }).toEmail);
    if (!fromEmail.includes("@") || !toEmail.includes("@")) {
      return json({ error: "Give me both emails, exactly as they appear on the accounts." }, 400);
    }
    if (fromEmail === toEmail) return json({ error: "Those are the same account." }, 400);

    // exact-match resolution (ilike without wildcards = case-insensitive equals)
    const byEmail = async (email: string): Promise<ProfileRow | null> => {
      const r = await fetch(
        `${supaUrl}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=${encodeURIComponent(COLS)}&limit=2`,
        { headers: svc },
      );
      if (!r.ok) return null;
      const rows = (await r.json()) as ProfileRow[];
      return rows.length === 1 ? rows[0] : null;
    };
    const from = await byEmail(fromEmail);
    if (!from) return json({ error: `No single account matches ${fromEmail}.` }, 404);
    const to = await byEmail(toEmail);
    if (!to) return json({ error: `No single account matches ${toEmail}.` }, 404);

    // how many kits would move — the preview the confirm dialog shows
    const cr = await fetch(`${supaUrl}/rest/v1/projects?user_id=eq.${from.id}&select=id&limit=1`, {
      headers: { ...svc, prefer: "count=exact" },
    });
    if (!cr.ok) return json({ error: "Couldn't count that account's kits." }, 502);
    const kits = Number((cr.headers.get("content-range") ?? "/0").split("/")[1]) || 0;

    if ((body as { dryRun?: unknown }).dryRun) {
      return json({ ok: true, preview: { fromEmail: from.email, toEmail: to.email, kits } });
    }
    if (kits === 0) return json({ error: `${from.email} has no kits to move.` }, 400);

    const up = await fetch(`${supaUrl}/rest/v1/projects?user_id=eq.${from.id}`, {
      method: "PATCH",
      headers: { ...svc, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ user_id: to.id }),
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      return json({ error: `Couldn't move the kits (${up.status}). ${detail.slice(0, 200)}` }, 502);
    }
    const moved = ((await up.json()) as unknown[]).length;

    const audit = {
      at: new Date().toISOString(),
      admin: caller.id, adminEmail: caller.email ?? null,
      from: from.id, fromEmail: from.email,
      to: to.id, toEmail: to.email, moved,
    };
    console.log(`[admin] adopt ${JSON.stringify(audit)}`);
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: from.id, action: "adopt", detail: audit }),
    }).catch(() => { /* audit table not migrated yet — the console line stands */ });

    return json({ ok: true, moved, fromEmail: from.email, toEmail: to.email });
  }

  return json({ error: "Unknown action." }, 400);
}
