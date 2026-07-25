import { useEffect, useState } from "react";
import { Loader2, Search, ShieldCheck, CreditCard } from "lucide-react";
import "@/styles/pricing.css";
import { cloudConfig, myProfileTier, accessToken } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import logoUrl from "../../pb-logo.png";

/* #/admin — the owner's desk: find an account by email, set its plan.

   Nothing links here; the URL is the door. The client-side admin check
   below only decides what renders — the real gate is api/admin.ts, which
   re-verifies is_admin from the database on every call. A non-admin who
   types the URL is bounced to the landing page; one who calls the API
   anyway gets a 403.

   Deliberately minimal: search, three plan buttons, a confirm. No user
   deletion, no impersonation, no editing anything else. */

type Row = {
  id: string; email: string | null; plan: string; status: string | null;
  renewsAt: string | null; hasStripe: boolean; hasSubscription: boolean;
  isAdmin: boolean; createdAt: string | null;
};

const PLANS = ["pro", "student", "free"] as const;

async function callAdmin(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const token = await accessToken();
  if (!token) return { ok: false, data: { error: "Sign in first." } };
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* platform error page */ }
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Couldn't reach the admin service — check your connection." } };
  }
}

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function AdminPage() {
  const cloud = useCloudStatus();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // the render gate: no cloud, signed out, or not an admin → landing page.
  // Boot passes through "signedout" before a session restores, so that
  // state gets a grace period instead of an instant bounce — a refresh on
  // this page must not eject the admin who is standing on it.
  useEffect(() => {
    if (!cloudConfig()) { navigate("#/"); return; }
    if (cloud.state === "off" || cloud.state === "signedout") {
      const t = window.setTimeout(() => navigate("#/"), 2500);
      return () => window.clearTimeout(t);
    }
    if (cloud.state !== "synced" && cloud.state !== "syncing" && cloud.state !== "error") return;
    let on = true;
    void myProfileTier().then((p) => {
      if (!on) return;
      if (p.admin) setAllowed(true); else navigate("#/");
    });
    return () => { on = false; };
  }, [cloud.state]);

  const search = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    const { ok, data } = await callAdmin({ action: "search", q });
    setBusy(false);
    if (!ok) { setNote(String(data.error ?? "Search failed.")); return; }
    setRows((data.users as Row[]) ?? []);
  };

  const setPlan = async (r: Row, plan: (typeof PLANS)[number]) => {
    const verb = plan === "free" ? "revoke the paid plan from" : `comp ${plan.toUpperCase()} to`;
    if (!window.confirm(`Really ${verb} ${r.email ?? r.id}?\n\nGrants are stamped 'comped', revokes 'canceled' — distinguishable from Stripe purchases in the data.`)) return;
    setBusyId(r.id); setNote(null);
    const { ok, data } = await callAdmin({ action: "setPlan", userId: r.id, plan });
    setBusyId(null);
    if (!ok) { setNote(String(data.error ?? "Couldn't set the plan.")); return; }
    setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, ...(data.user as Row) } : x)));
    setNote(data.warning ? String(data.warning) : `Done — ${r.email ?? r.id} is now ${plan}.`);
  };

  if (allowed === null) {
    return (
      <div className="fd-page">
        <main className="fd-page__wrap">
          <p className="fd-lead"><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Checking credentials…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="fd-page">
      <header className="fd-page__bar">
        <a href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }} className="fd-page__brand">
          <img src={logoUrl} alt="" width={24} height={24} /> UI Kit Maker
        </a>
      </header>

      <main className="fd-page__wrap">
        <h1 className="fd-page__h1"><ShieldCheck size={26} strokeWidth={2} /> Admin — plans</h1>

        <section className="fd-card">
          <p className="fd-fine">
            Search an account by email, then set its plan. Every change is audit-logged
            with who did it, to whom, and old→new. Grants ride out Stripe events; a comped
            user who later genuinely subscribes flips to a normal paid plan.
          </p>
          <div className="fd-adminsearch">
            <input
              value={q}
              placeholder="email or part of one — e.g. stephanie@"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            />
            <button className="fd-primary" disabled={busy || q.trim().length < 2} onClick={() => void search()}>
              {busy ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <Search size={15} strokeWidth={2.1} />} Search
            </button>
          </div>
          {note && <p className="fd-note">{note}</p>}

          {rows !== null && (
            rows.length === 0 ? (
              <p className="fd-fine">No accounts match that.</p>
            ) : (
              <div className="fd-adminrows">
                {rows.map((r) => (
                  <div key={r.id} className="fd-adminrow">
                    <div className="fd-adminrow__who">
                      <b>{r.email ?? "(no email on file)"}</b>
                      <span className="fd-adminrow__meta">
                        {r.plan}{r.status ? ` · ${r.status}` : ""}
                        {r.renewsAt ? ` · renews ${fmtDay(r.renewsAt)}` : ""}
                        {r.hasStripe && <> · <CreditCard size={11} strokeWidth={2.4} /> Stripe</>}
                        {r.isAdmin ? " · ADMIN" : ""}
                        {` · joined ${fmtDay(r.createdAt)}`}
                      </span>
                    </div>
                    <div className="fd-adminrow__acts">
                      {PLANS.map((p) => (
                        <button key={p}
                          className={`fd-ghost fd-adminrow__plan${r.plan === p ? " on" : ""}`}
                          disabled={busyId === r.id || r.plan === p}
                          onClick={() => void setPlan(r, p)}>
                          {busyId === r.id ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}
