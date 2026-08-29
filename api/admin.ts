/* POST /api/admin — the owner's desk: find an account, set its plan.

   WHY A SERVER FUNCTION. Comping a user used to mean hand-written SQL in
   the Supabase editor, which is error-prone and unlogged. The client-side
   is_admin flag (cloud.ts) only decides what RENDERS — this function is
   the enforcement: it verifies the caller's Supabase JWT, reads THE
   CALLER'S OWN profile row with the service role, and refuses anyone the
   database doesn't say is an admin. Nothing the browser claims is
   believed.

   The actions, nothing else:
     { action: "search",  q }                          → matching profiles
     { action: "stats" }                               → the pulse: headline counts
     { action: "roster",  sort?, dir?, plan?, page? }  → the census: every account, pageable
     { action: "setPlan", userId, plan: pro|student|free }
     { action: "adopt",   fromEmail, toEmail, dryRun? }
     { action: "findKits", q }                         → kits by name, any account
     { action: "kitDoc", projectId }                   → one kit's doc, for preview
     { action: "designate", projectId, placement, presetName, publishAt?, dealNote? }
     { action: "designations" }                        → the release slate
     { action: "undesignate", designationId }
     { action: "testKitStatus" }                       → is the blessed free-kit zip stocked?
     { action: "testKitUpload", size }                 → signed upload URL to swap the blessed zip

   The release desk (find → preview → designate) exists for the pack
   pipeline: a maker emails the owner an awesome kit, they agree to
   release it on a profit share, and the desk FREEZES the kit as it is
   that day — full doc snapshot into kit_designations (v91, admin-only
   table) with the deal note. The maker changing or deleting their copy
   later can't touch the agreement. 'standard' also publishes a live
   preset row, 'upcoming' publishes one held by publish_at (invisible to
   non-admins until the date), 'hero' stores intent for the homepage
   lineup.

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

  /* ── stats ───────────────────────────────────────────────────────────
     The pulse: the four numbers worth a glance, each with a 7-day figure
     beside the lifetime one. Counts come from PostgREST's exact count
     header (limit=1, prefer count=exact) — the rows themselves are never
     shipped, so this stays cheap no matter how big the tables get.

     Deliberately NOT traffic: visitors, referrers and bounce live in
     Vercel Web Analytics, which sees people who never sign in. This desk
     answers the other half — of the people who arrived, how many stayed,
     built something, and shipped it. */
  if (body.action === "stats") {
    const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
    const d7 = since(7), d14 = since(14);

    /* one count, no rows: PostgREST reports the total in content-range */
    const countOf = async (path: string): Promise<number | null> => {
      const res = await fetch(`${supaUrl}/rest/v1/${path}${path.includes("?") ? "&" : "?"}select=id&limit=1`, {
        headers: { ...svc, prefer: "count=exact" },
      });
      if (!res.ok) return null;
      return Number((res.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) || 0;
    };

    const [signups, signups7, paying, kits, kits7, exports, exports7] = await Promise.all([
      countOf("profiles"),
      countOf(`profiles?created_at=gte.${d7}`),
      countOf("profiles?plan_id=in.(pro,student)"),
      countOf("projects"),
      countOf(`projects?created_at=gte.${d7}`),
      countOf("export_events"),
      countOf(`export_events?created_at=gte.${d7}`),
    ]);

    /* 14 daily signup buckets — the only place rows are read, and only
       the timestamp column, capped. Missing days come back as zeros so
       the client can draw a fixed-width strip without gaps. */
    const daily: { day: string; n: number }[] = [];
    const sr = await fetch(
      `${supaUrl}/rest/v1/profiles?created_at=gte.${d14}&select=created_at&order=created_at.asc&limit=5000`,
      { headers: svc },
    );
    if (sr.ok) {
      const tally = new Map<string, number>();
      for (const r of (await sr.json()) as { created_at: string }[]) {
        const day = String(r.created_at).slice(0, 10);
        tally.set(day, (tally.get(day) ?? 0) + 1);
      }
      for (let i = 13; i >= 0; i--) {
        const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        daily.push({ day, n: tally.get(day) ?? 0 });
      }
    }

    return json({ stats: { signups, signups7, paying, kits, kits7, exports, exports7, daily } });
  }

  /* ── roster ──────────────────────────────────────────────────────── */
  if (body.action === "roster") {
    /* the census: every account, sortable and pageable server-side.
       Sort keys are whitelisted — nothing from the request reaches the
       query as raw text. */
    const b = body as { sort?: string; dir?: string; plan?: string; page?: number };
    const SORTS: Record<string, string> = { joined: "created_at", email: "email", plan: "plan_id", status: "plan_status" };
    const sort = SORTS[String(b.sort ?? "joined")] ?? "created_at";
    const dir = String(b.dir ?? "desc") === "asc" ? "asc" : "desc";
    const plan = String(b.plan ?? "");
    const page = Math.max(0, Math.min(500, Math.floor(Number(b.page ?? 0)) || 0));
    const SIZE = 100;
    let url = `${supaUrl}/rest/v1/profiles?select=${encodeURIComponent(COLS)}&order=${sort}.${dir}.nullslast&limit=${SIZE}&offset=${page * SIZE}`;
    if (plan === "free") url += "&or=(plan_id.is.null,plan_id.eq.free)";
    else if (plan === "pro" || plan === "student") url += `&plan_id=eq.${plan}`;
    const res = await fetch(url, { headers: { ...svc, prefer: "count=exact" } });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: `Roster failed (${res.status}). ${detail.slice(0, 200)}` }, 502);
    }
    const rows = (await res.json()) as ProfileRow[];
    const total = Number((res.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) || rows.length;
    // kit counts for this page's accounts — one query, tallied here
    const kits = new Map<string, number>();
    if (rows.length) {
      const kr = await fetch(`${supaUrl}/rest/v1/projects?user_id=in.(${rows.map((r) => r.id).join(",")})&select=user_id`, { headers: svc });
      if (kr.ok) for (const k of (await kr.json()) as { user_id: string }[]) kits.set(k.user_id, (kits.get(k.user_id) ?? 0) + 1);
    }
    return json({ users: rows.map((r) => ({ ...pub(r), kits: kits.get(r.id) ?? 0 })), total, page, pageSize: SIZE });
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

  /* ── findKits — any account's kits, by either of a kit's names ───── */
  if (body.action === "findKits") {
    // kit names are free text; only pattern/filter metacharacters are
    // stripped (comma and parens would break the or=() syntax below)
    const q = String((body as { q?: unknown }).q ?? "").trim().replace(/[%_\\,()*]/g, "").slice(0, 80);
    if (q.length < 2) return json({ error: "Give me at least two characters of the kit's name." }, 400);
    const pat = encodeURIComponent(`*${q}*`);
    /* a kit answers to TWO names: the save-dialog name (projects.name) and
       the kit-page title stored inside the doc (doc->>kitName). "YASS
       DESERT SUNSET" taught us people search the one they can see. */
    const res = await fetch(
      `${supaUrl}/rest/v1/projects?or=(name.ilike.${pat},doc->>kitName.ilike.${pat})&select=id,name,user_id,updated_at,kitName:doc->>kitName&order=updated_at.desc&limit=10`,
      { headers: svc },
    );
    if (!res.ok) return json({ error: `Search failed (${res.status}).` }, 502);
    const rows = (await res.json()) as { id: string; name: string; kitName: string | null; user_id: string; updated_at: string }[];

    /* nothing saved under that name? check the live studios — the design
       may exist only in someone's auto-synced working doc: as the open
       kit's title, or as a PERSONAL PRESET the maker saved for themselves
       (userpresets never leave their browser+sync; "my wife made a preset
       and I couldn't find it" taught us both). workspaces.doc mirrors
       localStorage, so every value is a JSON-encoded string. */
    let studios: {
      userId: string; email: string | null; kitName: string | null; updatedAt: string;
      presets: { upId: string; name: string }[];
    }[] = [];
    if (rows.length === 0) {
      const ws = await fetch(
        `${supaUrl}/rest/v1/workspaces?or=(doc->>ui-generator-kitname.ilike.${pat},doc->>ui-generator-userpresets.ilike.${pat})&select=user_id,updated_at,kn:doc->>ui-generator-kitname,ups:doc->>ui-generator-userpresets&order=updated_at.desc&limit=3`,
        { headers: svc },
      ).catch(() => null);
      if (ws?.ok) {
        const wrows = (await ws.json()) as { user_id: string; updated_at: string; kn: string | null; ups: string | null }[];
        const emap = new Map<string, string | null>();
        if (wrows.length) {
          const pr = await fetch(
            `${supaUrl}/rest/v1/profiles?id=in.(${wrows.map((r) => r.user_id).join(",")})&select=id,email`,
            { headers: svc },
          );
          if (pr.ok) for (const p of (await pr.json()) as { id: string; email: string | null }[]) emap.set(p.id, p.email);
        }
        const needle = q.toLowerCase();
        studios = wrows.map((r) => {
          let kn: string | null = null;
          try { kn = r.kn ? (JSON.parse(r.kn) as string) : null; } catch { kn = r.kn; }
          let presets: { upId: string; name: string }[] = [];
          try {
            const ups = r.ups ? (JSON.parse(r.ups) as { id?: string; name?: string }[]) : [];
            presets = ups
              .filter((u) => u && typeof u.id === "string" && typeof u.name === "string" && u.name.toLowerCase().includes(needle))
              .map((u) => ({ upId: u.id as string, name: u.name as string }));
          } catch { /* malformed mirror — the kit-title hint still helps */ }
          return { userId: r.user_id, email: emap.get(r.user_id) ?? null, kitName: kn, updatedAt: r.updated_at, presets };
        }).filter((s) => s.presets.length > 0 || (s.kitName ?? "").toLowerCase().includes(needle));
      }
    }

    const emails = new Map<string, string | null>();
    if (rows.length) {
      const pr = await fetch(
        `${supaUrl}/rest/v1/profiles?id=in.(${rows.map((r) => r.user_id).join(",")})&select=id,email`,
        { headers: svc },
      );
      if (pr.ok) for (const p of (await pr.json()) as { id: string; email: string | null }[]) emails.set(p.id, p.email);
    }
    return json({
      kits: rows.map((r) => ({
        projectId: r.id, name: r.name, kitName: r.kitName, updatedAt: r.updated_at,
        email: emails.get(r.user_id) ?? null,
      })),
      studios,
    });
  }

  /* ── kitDoc — one kit's full doc, for the desk's live preview ────── */
  if (body.action === "kitDoc") {
    const pid = String((body as { projectId?: unknown }).projectId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(pid)) return json({ error: "Bad kit id." }, 400);
    const res = await fetch(`${supaUrl}/rest/v1/projects?id=eq.${pid}&select=name,doc`, { headers: svc });
    if (!res.ok) return json({ error: "Couldn't read that kit." }, 502);
    const row = ((await res.json()) as { name: string; doc: unknown }[])[0];
    if (!row) return json({ error: "That kit is gone." }, 404);
    return json({ name: row.name, doc: row.doc });
  }

  /* shared by studioDoc + designate: pull one personal preset out of a
     maker's synced studio and shape it like a kit doc. The preset's cfg
     IS the whole artifact — that's what a preset is. */
  const studioPreset = async (userId: string, upId: string): Promise<{ name: string; doc: Record<string, unknown> } | { error: string; status: number }> => {
    if (!/^[0-9a-f-]{36}$/.test(userId)) return { error: "Bad account id.", status: 400 };
    if (!/^[a-z0-9]{1,32}$/.test(upId)) return { error: "Bad preset id.", status: 400 };
    const res = await fetch(
      `${supaUrl}/rest/v1/workspaces?user_id=eq.${userId}&select=ups:doc->>ui-generator-userpresets`,
      { headers: svc },
    );
    if (!res.ok) return { error: "Couldn't read that studio.", status: 502 };
    const row = ((await res.json()) as { ups: string | null }[])[0];
    if (!row?.ups) return { error: "That studio has no personal presets any more.", status: 404 };
    let entry: { id?: string; name?: string; cfg?: unknown } | undefined;
    try {
      entry = (JSON.parse(row.ups) as { id?: string; name?: string; cfg?: unknown }[]).find((u) => u?.id === upId);
    } catch { /* malformed mirror */ }
    if (!entry || !entry.cfg || typeof entry.name !== "string") {
      return { error: "That preset is gone from the maker's studio — search again.", status: 404 };
    }
    return { name: entry.name, doc: { cfg: entry.cfg, kitName: entry.name, fromStudioPreset: true } };
  };

  /* ── studioDoc — a personal preset from a maker's synced studio ──── */
  if (body.action === "studioDoc") {
    const b = body as { userId?: unknown; upId?: unknown };
    const got = await studioPreset(String(b.userId ?? ""), String(b.upId ?? ""));
    if ("error" in got) return json({ error: got.error }, got.status);
    return json({ name: got.name, doc: got.doc });
  }

  /* ── designate — freeze the kit and put it on the slate ──────────── */
  if (body.action === "designate") {
    const b = body as {
      projectId?: unknown; studio?: { userId?: unknown; upId?: unknown };
      placement?: unknown; presetName?: unknown; publishAt?: unknown; dealNote?: unknown;
      thumb?: unknown;
    };
    /* card art, drawn by the desk in the browser (no SVG engine out here).
       Shape- and size-checked: it goes straight into a card's innerHTML, so
       only an <svg …> document of sane size is allowed through. */
    const rawThumb = typeof b.thumb === "string" ? b.thumb.trim() : "";
    const thumb = rawThumb.startsWith("<svg") && rawThumb.length <= 400_000 ? rawThumb : null;
    const placement = String(b.placement ?? "");
    const presetName = String(b.presetName ?? "").trim().slice(0, 80);
    const dealNote = String(b.dealNote ?? "").trim().slice(0, 2000) || null;
    let publishAt: string | null = null;
    if (b.publishAt != null && b.publishAt !== "") {
      const d = new Date(String(b.publishAt));
      if (isNaN(d.getTime())) return json({ error: "That release date doesn't parse." }, 400);
      publishAt = d.toISOString();
    }
    if (!["hero", "standard", "upcoming"].includes(placement)) return json({ error: "Placement must be hero, standard or upcoming." }, 400);
    if (!presetName) return json({ error: "Give the release a name." }, 400);

    /* the source is either a saved kit (projects row) or a personal
       preset living in a maker's synced studio — both freeze the same way */
    let proj: { name: string; user_id: string; doc: Record<string, unknown> };
    let sourceProjectId: string | null = null;
    let sourceUpId: string | null = null;
    if (b.studio) {
      const userId = String(b.studio.userId ?? "");
      const upId = String(b.studio.upId ?? "");
      const got = await studioPreset(userId, upId);
      if ("error" in got) return json({ error: got.error }, got.status);
      proj = { name: got.name, user_id: userId, doc: got.doc };
      sourceUpId = upId;
    } else {
      const pid = String(b.projectId ?? "");
      if (!/^[0-9a-f-]{36}$/.test(pid)) return json({ error: "Bad kit id." }, 400);
      const pr = await fetch(`${supaUrl}/rest/v1/projects?id=eq.${pid}&select=name,user_id,doc`, { headers: svc });
      if (!pr.ok) return json({ error: "Couldn't read that kit." }, 502);
      const row = ((await pr.json()) as { name: string; user_id: string; doc: Record<string, unknown> }[])[0];
      if (!row) return json({ error: "That kit is gone — did the maker delete it?" }, 404);
      proj = row;
      sourceProjectId = pid;
    }
    if (!proj.doc || typeof proj.doc !== "object" || !proj.doc.cfg) {
      return json({ error: "That kit's saved payload has no design in it — open and re-save it first." }, 400);
    }
    const owner = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${proj.user_id}&select=email`, { headers: svc });
    const ownerEmail = owner.ok ? (((await owner.json()) as { email: string | null }[])[0]?.email ?? null) : null;

    /* standard ships now; upcoming ships held (publish_at future is
       invisible to non-admins by the presets read policy — no date given
       means parked far out until the owner schedules it); hero is intent
       only, nothing enters the public presets table. */
    /* a shipped pack carries the WHOLE kit, not just the master look
       (owner: "I want ALL changes I make to any look to port over").
       A saved project keeps its per-piece layer beside the config; a
       studio preset already carries its own inside it. Locks are workflow,
       not look — they stay behind. The clone REGISTRY (kitClones) must
       ride with the clone-keyed rows the other maps already freeze, or a
       designated kit's duplicated pieces arrive id-less. */
    const KIT_LAYER = ["kitClones", "kitShapes", "kitDesigns", "kitTextFill", "kitLabels", "kitSubs",
      "kitIcons", "kitSlotVals", "kitVals", "kitBar", "kitTextOy", "kitTextOx", "kitSizes", "kitRow"];
    const srcCfg = (proj.doc.cfg ?? {}) as Record<string, unknown>;
    let presetCfg: Record<string, unknown> = srcCfg;
    if (!srcCfg.__workspace) {
      const layer: Record<string, unknown> = {};
      for (const k of KIT_LAYER) {
        const v = (proj.doc as Record<string, unknown>)[k];
        if (v && typeof v === "object" && Object.keys(v as object).length) layer[k] = v;
      }
      if (Object.keys(layer).length) presetCfg = { ...srcCfg, __workspace: layer };
    }

    let presetId: string | null = null;
    if (placement === "standard" || placement === "upcoming") {
      const publish = placement === "standard" ? null : (publishAt ?? "2099-01-01T00:00:00Z");
      const ins = await fetch(`${supaUrl}/rest/v1/presets`, {
        method: "POST",
        headers: { ...svc, "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ name: presetName, cfg: presetCfg, thumb, created_by: caller.id, publish_at: publish }),
      });
      if (!ins.ok) {
        const detail = await ins.text().catch(() => "");
        return json({ error: `Couldn't publish the preset (${ins.status}). ${detail.slice(0, 200)}` }, 502);
      }
      presetId = (((await ins.json()) as { id: string }[])[0]?.id) ?? null;
    }

    const desig = {
      kit_name: proj.name, preset_name: presetName, placement,
      preset_id: presetId, source_project_id: sourceProjectId, source_user_id: proj.user_id,
      source_up_id: sourceUpId,
      source_email: ownerEmail, deal_note: dealNote,
      snapshot: proj.doc, created_by: caller.id,
    };
    let dr = await fetch(`${supaUrl}/rest/v1/kit_designations`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify(desig),
    });
    if (!dr.ok) {
      /* pre-0092 database: the refresh-source column doesn't exist yet.
         Designating still works — Refresh just falls back to name-match. */
      const firstErr = await dr.clone().text().catch(() => "");
      if (firstErr.includes("source_up_id")) {
        const { source_up_id: _drop, ...legacy } = desig;
        void _drop;
        dr = await fetch(`${supaUrl}/rest/v1/kit_designations`, {
          method: "POST",
          headers: { ...svc, "content-type": "application/json", prefer: "return=representation" },
          body: JSON.stringify(legacy),
        });
      }
    }
    if (!dr.ok) {
      const detail = await dr.text().catch(() => "");
      // don't leave a half-designation: retire the preset row we just made
      if (presetId) {
        await fetch(`${supaUrl}/rest/v1/presets?id=eq.${presetId}`, { method: "DELETE", headers: svc }).catch(() => {});
      }
      return json({ error: `Couldn't freeze the snapshot (${dr.status}) — is migration 0091 applied? ${detail.slice(0, 200)}` }, 502);
    }
    const made = (((await dr.json()) as { id: string; created_at: string }[])[0]);

    const audit = {
      at: new Date().toISOString(), admin: caller.id, adminEmail: caller.email ?? null,
      project: sourceProjectId, source: sourceProjectId ? "kit" : "studio-preset",
      kit: proj.name, maker: ownerEmail, placement, presetName, presetId,
      snapshotBytes: JSON.stringify(proj.doc).length,
    };
    console.log(`[admin] designate ${JSON.stringify(audit)}`);
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: proj.user_id, action: "designate", detail: audit }),
    }).catch(() => { /* audit table not migrated yet — the console line stands */ });

    return json({
      ok: true,
      designation: {
        id: made?.id ?? null, kitName: proj.name, presetName, placement,
        sourceEmail: ownerEmail, dealNote, publishAt: placement === "standard" ? null : publishAt,
        createdAt: made?.created_at ?? new Date().toISOString(),
      },
    });
  }

  /* ── designations — the slate, without the heavy snapshots. EXCEPT the
     hero rows: the admin rack draws real engine tiles for designated
     heroes now, so their design recipes (cfg only, never the full kit
     layer) ride along in a second, capped fetch. ───────────────────── */
  if (body.action === "designations") {
    const res = await fetch(
      `${supaUrl}/rest/v1/kit_designations?select=id,kit_name,preset_name,placement,preset_id,source_email,deal_note,created_at&order=created_at.desc&limit=50`,
      { headers: svc },
    );
    if (!res.ok) return json({ error: `Couldn't load the slate (${res.status}) — is migration 0091 applied?` }, 502);
    const rows = (await res.json()) as { id: string; kit_name: string; preset_name: string; placement: string; preset_id: string | null; source_email: string | null; deal_note: string | null; created_at: string }[];
    const dates = new Map<string, string | null>();
    const pids = rows.map((r) => r.preset_id).filter(Boolean) as string[];
    if (pids.length) {
      const ps = await fetch(`${supaUrl}/rest/v1/presets?id=in.(${pids.join(",")})&select=id,publish_at`, { headers: svc });
      if (ps.ok) for (const p of (await ps.json()) as { id: string; publish_at: string | null }[]) dates.set(p.id, p.publish_at);
    }
    // same ceiling as the public hero-lineup feed — rack and homepage agree
    const cfgs = new Map<string, unknown>();
    if (rows.some((r) => r.placement === "hero")) {
      const hr = await fetch(
        `${supaUrl}/rest/v1/kit_designations?placement=eq.hero&select=id,cfg:snapshot->cfg&order=created_at.desc&limit=16`,
        { headers: svc },
      ).catch(() => null);
      if (hr?.ok) for (const h of (await hr.json()) as { id: string; cfg: unknown }[]) cfgs.set(h.id, h.cfg);
    }
    return json({
      designations: rows.map((r) => ({
        id: r.id, kitName: r.kit_name, presetName: r.preset_name, placement: r.placement,
        sourceEmail: r.source_email, dealNote: r.deal_note, createdAt: r.created_at,
        publishAt: r.preset_id ? (dates.get(r.preset_id) ?? null) : null,
        ...(r.placement === "hero" && cfgs.has(r.id) ? { cfg: cfgs.get(r.id) } : {}),
      })),
    });
  }

  /* ── refreeze — re-approve a designation from the maker's CURRENT
     version. The freeze is the moderation gate: edits never reach the
     homepage or the Presets panel on their own; this click is the owner
     saying "the new version is approved too." Snapshot is replaced, and
     the linked preset row's recipe (if any) moves with it — name,
     placement, schedule and deal note all stay. ──────────────────────── */
  if (body.action === "refreeze") {
    const did = String((body as { designationId?: unknown }).designationId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(did)) return json({ error: "Bad designation id." }, 400);
    const rr = await fetch(
      `${supaUrl}/rest/v1/kit_designations?id=eq.${did}&select=id,kit_name,preset_name,placement,preset_id,source_project_id,source_user_id,source_up_id`,
      { headers: svc },
    ).then(async (r) => (r.ok ? r : /* pre-0092: no source_up_id column */ fetch(
      `${supaUrl}/rest/v1/kit_designations?id=eq.${did}&select=id,kit_name,preset_name,placement,preset_id,source_project_id,source_user_id`,
      { headers: svc },
    )));
    if (!rr.ok) return json({ error: "Couldn't read that designation." }, 502);
    const row = ((await rr.json()) as {
      id: string; kit_name: string; preset_name: string; placement: string; preset_id: string | null;
      source_project_id: string | null; source_user_id: string | null; source_up_id?: string | null;
    }[])[0];
    if (!row) return json({ error: "That designation is gone." }, 404);

    let fresh: { name: string; doc: Record<string, unknown> } | null = null;
    if (row.source_project_id) {
      const pr = await fetch(`${supaUrl}/rest/v1/projects?id=eq.${row.source_project_id}&select=name,doc`, { headers: svc });
      if (!pr.ok) return json({ error: "Couldn't read the source kit." }, 502);
      const p = ((await pr.json()) as { name: string; doc: Record<string, unknown> }[])[0];
      if (!p) return json({ error: "The maker deleted the source kit — the frozen version is all that's left. Remove and re-designate if there's a new source." }, 404);
      fresh = { name: p.name, doc: p.doc };
    } else if (row.source_user_id) {
      // studio-preset source: by stored local id, else by name (legacy rows)
      const ws = await fetch(
        `${supaUrl}/rest/v1/workspaces?user_id=eq.${row.source_user_id}&select=ups:doc->>ui-generator-userpresets`,
        { headers: svc },
      );
      if (!ws.ok) return json({ error: "Couldn't read the maker's studio." }, 502);
      const ups = ((await ws.json()) as { ups: string | null }[])[0]?.ups;
      let entry: { id?: string; name?: string; cfg?: unknown } | undefined;
      try {
        const list = ups ? (JSON.parse(ups) as { id?: string; name?: string; cfg?: unknown }[]) : [];
        entry = (row.source_up_id ? list.find((u) => u?.id === row.source_up_id) : undefined)
          ?? list.find((u) => u?.name === row.kit_name)
          ?? list.find((u) => u?.name === row.preset_name);
      } catch { /* malformed mirror */ }
      if (!entry?.cfg || typeof entry.name !== "string") {
        return json({ error: "The preset is gone from the maker's studio — the frozen version is all that's left. Remove and re-designate if there's a new source." }, 404);
      }
      fresh = { name: entry.name, doc: { cfg: entry.cfg, kitName: entry.name, fromStudioPreset: true } };
    } else {
      return json({ error: "This designation has no source recorded — remove it and designate the kit again once." }, 400);
    }
    if (!fresh.doc.cfg) return json({ error: "The current version has no design payload — ask the maker to re-save." }, 400);

    const up1 = await fetch(`${supaUrl}/rest/v1/kit_designations?id=eq.${did}`, {
      method: "PATCH",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ kit_name: fresh.name, snapshot: fresh.doc }),
    });
    if (!up1.ok) return json({ error: `Couldn't replace the snapshot (${up1.status}).` }, 502);
    if (row.preset_id) {
      const up2 = await fetch(`${supaUrl}/rest/v1/presets?id=eq.${row.preset_id}`, {
        method: "PATCH",
        headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ cfg: fresh.doc.cfg, updated_at: new Date().toISOString() }),
      });
      if (!up2.ok) return json({ error: `Snapshot updated, but the shipped preset didn't take (${up2.status}) — hit Refresh again.` }, 502);
    }

    const audit = {
      at: new Date().toISOString(), admin: caller.id, adminEmail: caller.email ?? null,
      designation: did, kit: fresh.name, presetName: row.preset_name, placement: row.placement,
      snapshotBytes: JSON.stringify(fresh.doc).length,
    };
    console.log(`[admin] refreeze ${JSON.stringify(audit)}`);
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: row.source_user_id ?? caller.id, action: "refreeze", detail: audit }),
    }).catch(() => { /* audit table optional — the console line stands */ });

    return json({ ok: true, name: fresh.name });
  }

  /* ── undesignate — take it off the slate (and off the shelf) ─────── */
  if (body.action === "undesignate") {
    const did = String((body as { designationId?: unknown }).designationId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(did)) return json({ error: "Bad designation id." }, 400);
    const rr = await fetch(`${supaUrl}/rest/v1/kit_designations?id=eq.${did}&select=id,kit_name,preset_name,placement,preset_id,source_email`, { headers: svc });
    if (!rr.ok) return json({ error: "Couldn't read that designation." }, 502);
    const row = ((await rr.json()) as { id: string; kit_name: string; preset_name: string; placement: string; preset_id: string | null; source_email: string | null }[])[0];
    if (!row) return json({ error: "Already gone." }, 404);
    if (row.preset_id) {
      const pd = await fetch(`${supaUrl}/rest/v1/presets?id=eq.${row.preset_id}`, { method: "DELETE", headers: svc });
      if (!pd.ok) return json({ error: `Couldn't retire the preset (${pd.status}).` }, 502);
    }
    const dd = await fetch(`${supaUrl}/rest/v1/kit_designations?id=eq.${did}`, { method: "DELETE", headers: svc });
    if (!dd.ok) return json({ error: `Couldn't remove the designation (${dd.status}).` }, 502);

    const audit = {
      at: new Date().toISOString(), admin: caller.id, adminEmail: caller.email ?? null,
      designation: did, kit: row.kit_name, presetName: row.preset_name, placement: row.placement, maker: row.source_email,
    };
    console.log(`[admin] undesignate ${JSON.stringify(audit)}`);
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: caller.id, action: "undesignate", detail: audit }),
    }).catch(() => { /* audit table not migrated yet — the console line stands */ });

    return json({ ok: true });
  }

  /* ── the Unity test kit's shelf (Gate Round, 2026-08-17) ─────────────
     The registered tier's free download is ONE canned stock kit zip —
     served by /api/test-kit from the private `test-kit` bucket at a fixed
     object path. These two actions are how the owner stocks and swaps the
     blessed artifact WITHOUT a code change or redeploy: status reads the
     shelf, upload mints a one-time signed URL so the browser PUTs the new
     zip straight to storage (a kit zip would blow the function body
     limit). The bucket is created lazily on first upload, so the desk
     works even before migration 0095 has been pasted. */
  const TK_BUCKET = "test-kit";
  const TK_OBJECT = "unity-test-kit.zip";
  const TK_CAP = 250 * 1024 * 1024;

  if (body.action === "testKitStatus") {
    const ls = await fetch(`${supaUrl}/storage/v1/object/list/${TK_BUCKET}`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100, offset: 0 }),
    });
    const objects = ls.ok ? ((await ls.json()) as { name?: string; updated_at?: string; metadata?: { size?: number } | null }[]) : [];
    const blessed = Array.isArray(objects) ? objects.find((o) => o.name === TK_OBJECT) : undefined;
    return json({
      ok: true,
      stocked: !!blessed,
      size: blessed ? Number(blessed.metadata?.size ?? 0) || null : null,
      updatedAt: blessed?.updated_at ?? null,
    });
  }

  if (body.action === "testKitUpload") {
    const size = Number((body as { size?: unknown }).size);
    if (!Number.isFinite(size) || size <= 0 || size > TK_CAP) {
      return json({ error: `That file doesn't look like a kit zip — it must be under ${Math.round(TK_CAP / 1048576)} MB.` }, 400);
    }

    // the shelf may predate migration 0095 — build it on first use
    const mk = await fetch(`${supaUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json" },
      body: JSON.stringify({ id: TK_BUCKET, name: TK_BUCKET, public: false, file_size_limit: TK_CAP }),
    });
    if (!mk.ok) {
      const detail = await mk.text().catch(() => "");
      // an existing bucket answers 400/409 — that is the normal steady state
      if (mk.status !== 400 && mk.status !== 409 && !/already exists/i.test(detail)) {
        return json({ error: `Couldn't prepare the test-kit shelf (${mk.status}). ${detail.slice(0, 120)}` }, 502);
      }
      /* a bucket keeps the file_size_limit it was BORN with — raising
         TK_CAP alone leaves an old shelf capped at the old number, so
         the exists path re-asserts the current cap before signing */
      const up = await fetch(`${supaUrl}/storage/v1/bucket/${TK_BUCKET}`, {
        method: "PUT",
        headers: { ...svc, "content-type": "application/json" },
        body: JSON.stringify({ public: false, file_size_limit: TK_CAP }),
      });
      if (!up.ok) {
        const d2 = await up.text().catch(() => "");
        return json({ error: `The shelf's stored size limit wouldn't raise (${up.status}). ${d2.slice(0, 120)}` }, 502);
      }
    }

    /* clear-then-sign instead of upsert: signed upload URLs refuse to
       overwrite, and threading upsert claims through them is fragile.
       If the upload after the delete fails, the shelf is empty until the
       admin retries — /api/test-kit says "not stocked yet" honestly. */
    await fetch(`${supaUrl}/storage/v1/object/${TK_BUCKET}/${TK_OBJECT}`, { method: "DELETE", headers: svc }).catch(() => { /* nothing to clear */ });

    const sign = await fetch(`${supaUrl}/storage/v1/object/upload/sign/${TK_BUCKET}/${TK_OBJECT}`, {
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

    const audit = {
      at: new Date().toISOString(), admin: caller.id, adminEmail: caller.email ?? null,
      bucket: TK_BUCKET, object: TK_OBJECT, size,
    };
    console.log(`[admin] testKitUpload ${JSON.stringify(audit)}`);
    await fetch(`${supaUrl}/rest/v1/admin_audit`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: caller.id, target_id: caller.id, action: "testKitUpload", detail: audit }),
    }).catch(() => { /* audit table optional — the console line stands */ });

    return json({ ok: true, path: `${TK_BUCKET}/${TK_OBJECT}`, token: uploadToken });
  }

  return json({ error: "Unknown action." }, 400);
}
