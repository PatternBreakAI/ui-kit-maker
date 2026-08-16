/* POST /api/assets — the quota gate in front of durable backdrop storage.

   WHY A SERVER FUNCTION. Storage quotas are server truth, like plan_id.
   The `bg-assets` bucket deliberately has NO insert policy: a client
   that could insert (or mint its own signed upload URLs — the storage
   API lets any principal with insert rights do that) could skip the
   meter entirely. So the only way bytes get in is the token this
   function mints, and it only mints one after checking the caller's
   tier and their REAL current usage, read from the bucket itself.

   The bytes never pass through here — the function hands back a signed
   upload URL and the browser PUTs straight to storage, so a 6 MB PNG
   doesn't meet a 4.5 MB serverless body limit.

   Object paths are content-addressed per user: <uid>/<sha-256 prefix>.
   Identical files store once per account; the folder prefix is what the
   owner-only read/delete RLS keys off.

   Honest limits of this gate (accepted for phase 1): two parallel
   grants can both pass the check, and a client can lie about `size` in
   the grant — both overshoot by at most one file, because the bucket's
   own file_size_limit (8 MB) caps every object and the NEXT grant sums
   what actually landed. The meter self-corrects; the quota cannot be
   run away from. */

const BUCKET = "bg-assets";
const FILE_CAP = 8 * 1024 * 1024; // matches the bucket's file_size_limit
const QUOTA_FREE = 50 * 1024 * 1024;
const QUOTA_PAID = 1024 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Asset storage isn't configured on this deployment." }, 503);

  let body: { action?: string; hash?: string; size?: number; type?: string };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "Bad request." }, 400); }
  if (body.action !== "grant" && body.action !== "usage") return json({ error: "Unknown action." }, 400);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first." }, 401);

  // identity comes from Supabase, never from the request body
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again." }, 401);
  const caller = (await who.json()) as { id?: string };
  if (!caller.id) return json({ error: "Your session expired — sign in again." }, 401);

  const svc = { apikey: service, authorization: `Bearer ${service}` };

  // tier → quota, read from the profile row (server truth; RLS pins client writes)
  const pr = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${caller.id}&select=plan_id`, { headers: svc });
  if (!pr.ok) return json({ error: "Couldn't verify your account — try again." }, 502);
  const plan = (((await pr.json()) as { plan_id?: string }[])[0]?.plan_id ?? "free");
  const quota = plan === "free" ? QUOTA_FREE : QUOTA_PAID;

  // real usage: what is actually IN the caller's folder right now
  const ls = await fetch(`${supaUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json" },
    body: JSON.stringify({ prefix: caller.id, limit: 10000, offset: 0 }),
  });
  if (!ls.ok) return json({ error: "Couldn't read your storage usage — try again." }, 502);
  const objects = (await ls.json()) as { name?: string; metadata?: { size?: number } | null }[];
  let used = 0;
  const have = new Set<string>();
  for (const o of Array.isArray(objects) ? objects : []) {
    used += Number(o.metadata?.size ?? 0) || 0;
    if (o.name) have.add(o.name);
  }

  if (body.action === "usage") return json({ ok: true, used, quota });

  // ── grant ──
  const hash = String(body.hash ?? "").toLowerCase();
  const size = Number(body.size);
  const type = String(body.type ?? "");
  if (!/^[0-9a-f]{40,64}$/.test(hash)) return json({ error: "Bad asset hash." }, 400);
  if (!Number.isFinite(size) || size <= 0 || size > FILE_CAP) {
    return json({ error: "That image is too large to store — backdrops cap at 8 MB after import." }, 400);
  }
  if (!/^image\//.test(type)) return json({ error: "Only images can be stored as backdrops." }, 400);

  if (have.has(hash)) return json({ ok: true, already: true, used, quota });

  if (used + size > quota) {
    const mb = (n: number) => `${Math.round(n / 1048576)} MB`;
    return json({
      error: plan === "free"
        ? `Your image storage is full (${mb(used)} of ${mb(quota)}) — this backdrop stays on this browser only. Pro includes 1 GB.`
        : `Your image storage is full (${mb(used)} of ${mb(quota)}) — this backdrop stays on this browser only.`,
      used, quota,
    }, 413);
  }

  const sign = await fetch(`${supaUrl}/storage/v1/object/upload/sign/${BUCKET}/${caller.id}/${hash}`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!sign.ok) {
    const detail = await sign.text().catch(() => "");
    return json({ error: `Couldn't authorize the upload (${sign.status}). ${detail.slice(0, 120)}` }, 502);
  }
  const signed = (await sign.json()) as { url?: string };
  const uploadToken = signed.url ? new URL(signed.url, supaUrl).searchParams.get("token") : null;
  if (!uploadToken) return json({ error: "Couldn't authorize the upload — try again." }, 502);

  return json({ ok: true, path: `${caller.id}/${hash}`, token: uploadToken, used, quota });
}
