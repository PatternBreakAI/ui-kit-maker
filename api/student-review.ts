/* POST /api/student-review — the reviewer's half of student verification.

   The applicant's half (src/generator/student.ts) can upload an ID and
   file a pending row, and nothing more. This function is the other side:
   an ADMIN lists applications, looks at the document through a short-lived
   signed URL, and decides.

   THE PROMISE THIS FILE EXISTS TO KEEP. The application form tells every
   applicant: "We delete your ID as soon as we've looked at it." That
   sentence is only safe to publish if deletion is welded to the decision —
   one call moves the row AND removes the document, so the promise cannot
   be half-kept by a distracted reviewer. Approve and reject both delete;
   the decision either way IS "we've looked at it".

   Order of operations: the document is deleted BEFORE the decision is
   recorded. If the delete fails the row stays pending and the caller sees
   an error — a decision without a deletion is the one state we promised
   never to create. (The reverse failure — file gone, row still pending —
   is harmless: retrying tolerates the missing file.)

   Identity comes from the caller's Supabase token, re-verified here, and
   the is_admin flag on their profile row — the same column-revoked flag
   that gates preset publishing. The service-role key never leaves this
   function. */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

type Row = {
  id: string; user_id: string; school_email: string; id_path: string | null;
  status: string; note: string | null; created_at: string; reviewed_at: string | null;
};

/** id_path is written by the APPLICANT'S client (RLS lets them insert their
    own pending row with any string in that column). Trust it only inside
    the applicant's own folder — otherwise a hostile application could point
    at another user's document and have the admin's decision delete it. */
function ownPath(r: Pick<Row, "user_id" | "id_path">): string | null {
  const p = r.id_path;
  if (!p || !p.startsWith(`${r.user_id}/`) || p.includes("..") || p.includes("//")) return null;
  return p;
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Review isn't configured on this deployment." }, 503);

  let body: { action?: string; id?: string; note?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const action = body.action;
  if (action !== "list" && action !== "approve" && action !== "reject") {
    return json({ error: "Unknown action." }, 400);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first.", reason: "signin" }, 401);

  // identity from Supabase, never from the request body
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);
  const user = (await who.json()) as { id?: string };
  if (!user.id) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);

  const svc = { apikey: service, authorization: `Bearer ${service}` };

  // the same column-revoked admin flag that gates preset publishing
  const pr = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_admin`, { headers: svc });
  if (!pr.ok) return json({ error: "Couldn't check your account — try again." }, 502);
  const prof = ((await pr.json()) as { is_admin?: boolean }[])[0];
  if (prof?.is_admin !== true) return json({ error: "Reviewing applications is an admin task." }, 403);

  /* ── list ── */
  if (action === "list") {
    const res = await fetch(
      `${supaUrl}/rest/v1/student_verifications?select=id,user_id,school_email,id_path,status,note,created_at,reviewed_at&order=created_at.desc&limit=100`,
      { headers: svc },
    );
    if (!res.ok) return json({ error: "Couldn't load applications." }, 502);
    const rows = (await res.json()) as Row[];

    const out = [];
    for (const r of rows) {
      // a short-lived signed URL for the document, pending rows only —
      // decided rows have no document left to sign, by design
      let idUrl: string | null = null;
      const rp = ownPath(r);
      if (rp && r.status === "pending") {
        const sg = await fetch(`${supaUrl}/storage/v1/object/sign/student-ids/${rp}`, {
          method: "POST",
          headers: { ...svc, "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: 600 }),   // ten minutes — one sitting
        });
        if (sg.ok) {
          const signed = (await sg.json()) as { signedURL?: string };
          if (signed.signedURL) idUrl = `${supaUrl}/storage/v1${signed.signedURL}`;
        }
      }
      // the account email, so a decision can be communicated to the person
      let accountEmail: string | null = null;
      if (r.status === "pending") {
        const au = await fetch(`${supaUrl}/auth/v1/admin/users/${r.user_id}`, { headers: svc });
        if (au.ok) accountEmail = ((await au.json()) as { email?: string }).email ?? null;
      }
      out.push({
        id: r.id, status: r.status, schoolEmail: r.school_email, accountEmail,
        idUrl, note: r.note, createdAt: r.created_at, reviewedAt: r.reviewed_at,
      });
    }
    return json({ applications: out });
  }

  /* ── approve / reject ── */
  const rowId = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(rowId)) return json({ error: "Which application?" }, 400);

  const rr = await fetch(
    `${supaUrl}/rest/v1/student_verifications?id=eq.${rowId}&select=id,user_id,id_path,status`,
    { headers: svc },
  );
  if (!rr.ok) return json({ error: "Couldn't load that application." }, 502);
  const row = ((await rr.json()) as Row[])[0];
  if (!row) return json({ error: "No such application." }, 404);
  if (row.status !== "pending") return json({ error: `Already ${row.status}.` }, 409);

  /* Delete the document FIRST. A 404 means it is already gone (an earlier
     attempt that failed after this step) — that is success, not an error. */
  const delPath = ownPath(row);
  if (delPath) {
    const del = await fetch(`${supaUrl}/storage/v1/object/student-ids/${delPath}`, {
      method: "DELETE",
      headers: svc,
    });
    if (!del.ok && del.status !== 404 && del.status !== 400) {
      return json({ error: "Couldn't delete the ID document — nothing was decided. Try again." }, 502);
    }
  }

  const decided = action === "approve" ? "approved" : "rejected";
  const up = await fetch(`${supaUrl}/rest/v1/student_verifications?id=eq.${rowId}`, {
    method: "PATCH",
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      status: decided,
      note: typeof body.note === "string" ? body.note.slice(0, 400) : null,
      reviewed_at: new Date().toISOString(),
      id_path: null,   // the document is gone; the row must say so
    }),
  });
  if (!up.ok) {
    // file already deleted — retrying is safe, the delete tolerates 404
    return json({ error: "The document was removed but the decision didn't save — try again." }, 502);
  }

  /* Approval does NOT touch plan_id. It unlocks the student price at
     checkout (api/checkout reads the approved row); the plan itself only
     ever changes when Stripe confirms a purchase through the webhook. */
  return json({ ok: true, status: decided });
}
