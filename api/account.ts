/* POST /api/account — the one self-serve dangerous door: delete MY account.

   WHY A SERVER FUNCTION. Supabase clients can't delete their own auth
   user with the anon key (correctly — that's an admin API). This
   function verifies the caller's JWT, applies the guard rails, and only
   then swings the axe with the service role. Deletion CASCADES by
   schema: kits, gallery cards, hearts, profile, studio, avatar — the
   whole account, permanently.

   Guard rails, enforced server-side no matter what the browser said:
   - LIVE SUBSCRIPTION → refused. Deleting the profile would orphan a
     billing relationship that keeps charging (Stripe doesn't know our
     rows died). Cancel via the billing portal first; access runs to the
     end of the term, then delete freely.
   - ADMIN ACCOUNT → refused. Owner/staff accounts die only from the
     Supabase dashboard, deliberately outside the product's reach — a
     hijacked admin session must not be able to erase the operators.

   The CLIENT side (AccountPage) owns the ceremony: stern consequence
   popups with live counts, the backup-download offer, type-DELETE
   confirmation. This function assumes none of that happened and stays
   safe anyway. */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Account service isn't configured on this deployment." }, 503);

  let body: { action?: string };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "Bad request." }, 400); }
  if (body.action !== "delete") return json({ error: "Unknown action." }, 400);

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

  const pr = await fetch(
    `${supaUrl}/rest/v1/profiles?id=eq.${caller.id}&select=is_admin,plan_status,stripe_subscription_id,email`,
    { headers: svc },
  );
  if (!pr.ok) return json({ error: "Couldn't verify your account — try again." }, 502);
  const me = ((await pr.json()) as { is_admin?: boolean; plan_status?: string | null; stripe_subscription_id?: string | null; email?: string | null }[])[0];

  if (me?.is_admin === true) {
    return json({ error: "Admin accounts can't be deleted from inside the product — that door only exists in the Supabase dashboard." }, 403);
  }
  const live = me?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(me?.plan_status ?? "");
  if (live) {
    return json({
      error: "You still have a live subscription. Cancel it first from Manage subscription (your access runs to the end of the term), then delete the account — otherwise billing would keep running for an account that no longer exists.",
    }, 409);
  }

  // last words for the log, then the cascade takes everything
  const audit = { at: new Date().toISOString(), user: caller.id, email: me?.email ?? caller.email ?? null };
  console.log(`[account] selfDelete ${JSON.stringify(audit)}`);
  await fetch(`${supaUrl}/rest/v1/admin_audit`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ admin_id: caller.id, target_id: caller.id, action: "selfDelete", detail: audit }),
  }).catch(() => { /* audit row is best-effort; the console line stands */ });

  const del = await fetch(`${supaUrl}/auth/v1/admin/users/${caller.id}`, { method: "DELETE", headers: svc });
  if (!del.ok) {
    const detail = await del.text().catch(() => "");
    return json({ error: `Deletion failed (${del.status}). Nothing was removed. ${detail.slice(0, 160)}` }, 502);
  }
  return json({ ok: true });
}
