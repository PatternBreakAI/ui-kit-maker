import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, CheckCircle2, XCircle, Loader2, RefreshCw, GraduationCap,
  Clock, ExternalLink, Mail, BadgeCheck,
} from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { cloudConfig, myProfileTier } from "@/generator/cloud";
import { listApplications, decideApplication, type Application } from "@/generator/studentReview";
import logoUrl from "../../pb-logo.png";

/* #/review — the reviewer's desk for student & educator applications.

   Admin-only, and quietly so: a non-admin who finds the URL gets a polite
   sentence, not a login puzzle. The page is a thin skin over
   /api/student-review — every decision it can take is one the server
   re-checks, and the one that matters (approve/reject) deletes the ID
   document in the same server call. This page cannot keep the document;
   there is no button for that on purpose.

   The ten-minute signed URLs mean a list left open over lunch shows
   broken image frames — Refresh mints fresh ones. That is the failure
   mode we want: links that die beat documents that linger. */

/* Dev-only layout harness: `#/review?demo=1` on a local build seeds fake
   rows so the card layout can be seen without a live cloud. Vite strips
   this whole branch from production bundles. */
const DEMO: Application[] = [
  { id: "d1", status: "pending", schoolEmail: "kira@cinema.usc.edu", accountEmail: "kira@gmail.com", idUrl: "demo", note: null, createdAt: new Date(Date.now() - 36e5 * 5).toISOString(), reviewedAt: null },
  { id: "d2", status: "pending", schoolEmail: "j.tan@polyu.edu.hk", accountEmail: "jtan@outlook.com", idUrl: "demo.pdf", note: null, createdAt: new Date(Date.now() - 36e5 * 30).toISOString(), reviewedAt: null },
  { id: "d3", status: "approved", schoolEmail: "amara@risd.edu", accountEmail: null, idUrl: null, note: null, createdAt: new Date(Date.now() - 864e5 * 3).toISOString(), reviewedAt: new Date(Date.now() - 864e5 * 2).toISOString() },
  { id: "d4", status: "rejected", schoolEmail: "sales@notaschool.biz", accountEmail: null, idUrl: null, note: "Domain is a parked commercial site — no institution behind it.", createdAt: new Date(Date.now() - 864e5 * 6).toISOString(), reviewedAt: new Date(Date.now() - 864e5 * 5).toISOString() },
];
const isDemo = () => import.meta.env.DEV && /[?&]demo=1/.test(window.location.hash);

function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PendingCard({ app, onDecided }: { app: Application; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isPdf = !!app.idUrl && /\.pdf(\?|$)/i.test(app.idUrl);

  const decide = async (action: "approve" | "reject") => {
    const label = action === "approve"
      ? `Approve ${app.schoolEmail}? Their checkout switches to the student price, and the ID document is deleted now.`
      : `Reject ${app.schoolEmail}? The ID document is deleted now either way.`;
    if (!window.confirm(label)) return;
    setBusy(action); setErr(null);
    const e = isDemo() ? null : await decideApplication(app.id, action, note);
    setBusy(null);
    if (e) setErr(e); else onDecided();
  };

  return (
    <section className="fd-studentcard fd-review__card">
      <div className="fd-review__who">
        <div>
          <b>{app.schoolEmail}</b>
          <span className="fd-review__meta">
            applied {when(app.createdAt)}
            {app.accountEmail && (
              <>
                {" · account "}
                <a className="fd-review__mail" href={`mailto:${encodeURIComponent(app.accountEmail)}?subject=Your%20UI%20Kit%20Maker%20student%20application`}>
                  {app.accountEmail} <Mail size={11} strokeWidth={2.2} />
                </a>
              </>
            )}
          </span>
        </div>
        <span className="fd-review__chip fd-review__chip--wait"><Clock size={11} strokeWidth={2.6} /> PENDING</span>
      </div>

      {/* the document — the part a human actually judges */}
      {app.idUrl ? (
        isPdf ? (
          <a className="fd-review__doc fd-review__doc--pdf" href={app.idUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} strokeWidth={2.2} /> Open the ID (PDF) — link lives ten minutes
          </a>
        ) : (
          <a className="fd-review__doc" href={app.idUrl} target="_blank" rel="noreferrer" title="Open full size — link lives ten minutes">
            {isDemo()
              ? <span className="fd-review__demoimg">ID document preview</span>
              : <img src={app.idUrl} alt={`ID document for ${app.schoolEmail}`} />}
          </a>
        )
      ) : (
        <p className="fd-rfine">No document on this application — it may have been uploaded before the review flow existed. Decide from the email alone, or ask them to re-apply.</p>
      )}

      <label className="fd-field">
        <span>Note <i className="fd-review__opt">optional — kept on the record, shown to nobody else</i></span>
        <input type="text" value={note} maxLength={400} placeholder="e.g. ID expires next June — flag at renewal"
          onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="fd-review__actions">
        <button className="fd-pricing__cta fd-pricing__cta--edu" disabled={!!busy} onClick={() => void decide("approve")}>
          {busy === "approve" ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <CheckCircle2 size={15} strokeWidth={2.2} />} Approve
        </button>
        <button className="fd-pricing__cta fd-pricing__cta--ghost" disabled={!!busy} onClick={() => void decide("reject")}>
          {busy === "reject" ? <Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> : <XCircle size={15} strokeWidth={2.2} />} Reject
        </button>
      </div>
      <p className="fd-rfine"><ShieldCheck size={12} strokeWidth={2.2} /> Deciding deletes the ID document — that's the promise the form makes, kept in the same call.</p>
      {err && <p className="fd-pricing__err">{err}</p>}
    </section>
  );
}

export function ReviewPage() {
  const status = useCloudStatus();
  const demo = isDemo();
  // the demo harness bypasses the availability gates — it exists precisely
  // for machines with no cloud configured
  const signedIn = demo || status.state === "synced" || status.state === "syncing" || status.state === "error";
  const live = demo || !!cloudConfig();

  const [admin, setAdmin] = useState<boolean | null>(null);   // null = checking
  const [apps, setApps] = useState<Application[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    if (isDemo()) { setApps(DEMO); setLoading(false); return; }
    const { applications, error } = await listApplications();
    setLoading(false);
    if (error) setErr(error); else setApps(applications);
  }, []);

  useEffect(() => {
    if (isDemo()) { setAdmin(true); void refresh(); return; }
    if (!signedIn) { setAdmin(null); return; }
    let liveFlag = true;
    void myProfileTier().then((p) => {
      if (!liveFlag) return;
      setAdmin(p.admin);
      if (p.admin) void refresh();
    });
    return () => { liveFlag = false; };
  }, [signedIn, refresh]);

  const pending = (apps ?? []).filter((a) => a.status === "pending");
  const decided = (apps ?? []).filter((a) => a.status !== "pending");

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/account")}>← Account</button>
        <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
      </header>

      <main className="fd-student fd-review">
        <span className="fd-pricing__ico fd-pricing__ico--edu"><GraduationCap size={17} strokeWidth={2.1} /></span>
        <h1>Application review</h1>
        <p className="fd-pricing__sub">
          Student &amp; educator applications. Approving unlocks the $15.99 rate on that
          account's checkout — the plan itself only changes when they buy.
        </p>

        {!live ? (
          <section className="fd-studentcard"><p>Accounts aren't available on this deployment, so there's nothing to review here.</p></section>
        ) : !signedIn ? (
          <section className="fd-studentcard">
            <p>Sign in with the admin account to review applications.</p>
            <button className="fd-pricing__cta fd-pricing__cta--edu" onClick={() => openAuth("signin")}>Sign in</button>
          </section>
        ) : admin === null ? (
          <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Checking your account…</p></section>
        ) : !admin ? (
          <section className="fd-studentcard"><p>Reviewing applications is an admin task — this account doesn't have that role.</p></section>
        ) : (
          <>
            <div className="fd-review__bar">
              <span>{pending.length === 0 ? "Nothing waiting" : pending.length === 1 ? "1 application waiting" : `${pending.length} applications waiting`}</span>
              <button className="fd-review__refresh" disabled={loading} onClick={() => void refresh()}>
                {loading ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : <RefreshCw size={13} strokeWidth={2.2} />} Refresh
              </button>
            </div>

            {err && <section className="fd-studentcard"><p className="fd-pricing__err">{err}</p></section>}
            {apps === null && !err && (
              <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Loading applications…</p></section>
            )}

            {pending.map((a) => <PendingCard key={a.id} app={a} onDecided={() => void refresh()} />)}

            {apps !== null && pending.length === 0 && !err && (
              <section className="fd-studentcard">
                <p className="fd-studentcard__ok"><CheckCircle2 size={18} strokeWidth={2.2} /> All caught up</p>
                <p>New applications appear here the moment they're filed. The signed links on this page live ten minutes — hit Refresh for fresh ones.</p>
              </section>
            )}

            {decided.length > 0 && (
              <section className="fd-studentcard fd-review__history">
                <h2>Decided</h2>
                {decided.map((a) => (
                  <div className="fd-review__row" key={a.id}>
                    <span className={`fd-review__chip ${a.status === "approved" ? "fd-review__chip--ok" : "fd-review__chip--no"}`}>
                      {a.status === "approved" ? <BadgeCheck size={11} strokeWidth={2.6} /> : <XCircle size={11} strokeWidth={2.6} />}
                      {a.status.toUpperCase()}
                    </span>
                    <span className="fd-review__rowmail">{a.schoolEmail}</span>
                    <span className="fd-review__meta">{a.reviewedAt ? when(a.reviewedAt) : ""}</span>
                    {a.note && <span className="fd-review__note">{a.note}</span>}
                  </div>
                ))}
                <p className="fd-rfine">Decided rows keep the school address, the date and the note — never the document.</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
