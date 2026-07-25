/* #/account — a normal account page: profile, plan, projects, and data
   controls on one scrolling page. Reuses the cloud.ts flows and the shared
   ProjectsPanel; signed-out visitors are sent to the sign-in page. */
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Wand2, LogOut, KeyRound, RefreshCw, FileDown, History,
  CheckCircle2, CloudOff, CloudUpload, CreditCard, Loader2, Sparkle,
} from "lucide-react";
import {
  cloudConfig, clearCloudOverride, signOutCloud,
  syncNow, downloadMyData, hasLocalSnapshot, restoreLocalSnapshot,
  requestPasswordReset, myBilling,
} from "@/generator/cloud";
import { openBillingPortal, justUpgraded } from "@/generator/billing";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import logoUrl from "../../pb-logo.png";

const ProjectsPanel = lazy(() =>
  import("@/ui/ProjectsPanel").then((m) => ({ default: m.ProjectsPanel })),
);

/** Renewal dates read as dates, not timestamps. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "the end of the term";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "the end of the term"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function AccountPage() {
  const status = useCloudStatus();
  const cfg = cloudConfig();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";

  useEffect(() => {
    const prev = { height: document.body.style.height, overflow: document.body.style.overflow };
    document.body.style.height = "auto";
    document.body.style.overflow = "visible";
    window.scrollTo(0, 0);
    return () => {
      document.body.style.height = prev.height;
      document.body.style.overflow = prev.overflow;
    };
  }, []);

  // No session (and accounts are available) → sign-in page is the front door.
  useEffect(() => {
    if (cfg && status.state === "signedout") navigate("#/signin");
  }, [cfg, status.state]);

  const sendReset = async () => {
    if (!status.email) return;
    setBusy(true); setNote(null);
    const e = await requestPasswordReset(status.email);
    setBusy(false);
    setNote(e ?? "Password reset email sent — check your inbox.");
  };

  /* ── plan & billing ───────────────────────────────────────────────
     Stripe redirects back the instant payment succeeds, which can beat
     its own webhook by a second or two. So when we arrive with
     ?upgraded=1 we poll the profile for a short while rather than
     announcing a failure that isn't one. */
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof myBilling>>>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(justUpgraded());

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    let tries = 0;
    const read = async () => {
      const b = await myBilling();
      if (!live) return;
      if (b) setPlan(b);
      if (awaiting && b?.plan === "pro") { setAwaiting(false); return; }
      if (awaiting && ++tries < 10) window.setTimeout(() => { void read(); }, 1500);
      else if (awaiting) setAwaiting(false);
    };
    void read();
    return () => { live = false; };
  }, [signedIn, awaiting]);

  const isPro = plan?.plan === "pro";
  const manage = async () => {
    setPlanBusy(true); setPlanErr(null);
    const e = await openBillingPortal();   // navigates away on success
    if (e) { setPlanErr(e); setPlanBusy(false); }
  };

  return (
    <div className="fd-page">
      <header className="fd-page__bar">
        <a href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }} className="fd-page__brand">
          <img src={logoUrl} alt="" width={24} height={24} /> UI Kit Maker
        </a>
        <button className="fd-primary fd-page__open" onClick={() => navigate("#/app")}>
          <Wand2 size={15} strokeWidth={1.9} /> Open the generator
        </button>
      </header>

      <main className="fd-page__wrap">
        <h1 className="fd-page__h1">Your account</h1>

        {!cfg ? (
          <section className="fd-card">
            <p className="fd-lead">Everything you make saves to this browser — no account needed.</p>
            <p className="fd-fine">
              Accounts aren't connected on this deployment yet. Once they are, your
              profile, plan, and cloud projects live here.
            </p>
          </section>
        ) : !signedIn ? (
          <section className="fd-card">
            <p className="fd-lead">Taking you to sign in…</p>
          </section>
        ) : (
          <>
            {/* ── profile ── */}
            <section className="fd-card">
              <h2 className="fd-card__title">Profile</h2>
              <div className="fd-account">
                <div className="fd-account__email">{status.email}</div>
                <div className={`fd-account__status fd-account__status--${status.state}`}>
                  {status.state === "synced" && (
                    <><CheckCircle2 size={15} strokeWidth={2} />
                      Saved to your account{status.syncedAt ? ` · ${new Date(status.syncedAt).toLocaleTimeString()}` : ""}</>
                  )}
                  {status.state === "syncing" && (<><CloudUpload size={15} strokeWidth={2} /> Syncing…</>)}
                  {status.state === "error" && (
                    <><CloudOff size={15} strokeWidth={2} /> Cloud paused — your work is safe locally.{status.detail ? ` ${status.detail}` : ""}</>
                  )}
                </div>
              </div>
              <div className="fd-actions">
                <button className="fd-ghost" disabled={busy} onClick={() => void sendReset()}>
                  <KeyRound size={15} strokeWidth={1.8} /> Change password
                </button>
                <button className="fd-ghost" onClick={() => { void signOutCloud(); navigate("#/"); }}>
                  <LogOut size={15} strokeWidth={1.8} /> Sign out
                </button>
              </div>
              {note && <p className="fd-note">{note}</p>}
            </section>

            {/* ── plan ── */}
            <section className="fd-card">
              <h2 className="fd-card__title">Plan &amp; billing</h2>
              {awaiting ? (
                <div className="fd-plan">
                  <span className="fd-plan__chip fd-plan__chip--wait">
                    <Loader2 size={12} strokeWidth={2.6} className="fd-spin" /> CONFIRMING
                  </span>
                  <span className="fd-plan__desc">Payment received — unlocking Pro on your account…</span>
                </div>
              ) : isPro ? (
                <>
                  <div className="fd-plan">
                    <span className="fd-plan__chip fd-plan__chip--pro">
                      <Sparkle size={12} strokeWidth={2.6} /> PRO
                    </span>
                    <span className="fd-plan__desc">
                      The full kit, every preset, unlimited zoom, 4× PNG and all vector exports.
                    </span>
                  </div>
                  <p className="fd-fine">
                    {plan?.status === "canceled"
                      ? `Cancelled — your Pro access runs until ${fmtDate(plan.renewsAt)}.`
                      : plan?.status === "past_due"
                        ? "We couldn't take the last payment — update your card to keep Pro."
                        : plan?.renewsAt
                          ? `$29.99/year · renews ${fmtDate(plan.renewsAt)}. Cancel anytime; access runs to the end of the term.`
                          : "$29.99/year · renews automatically. Cancel anytime; access runs to the end of the term."}
                  </p>
                </>
              ) : (
                <>
                  <div className="fd-plan">
                    <span className="fd-plan__chip">FREE PLAYER</span>
                    <span className="fd-plan__desc">The full kit in the browser, cloud saves, and 1× PNG exports.</span>
                  </div>
                  <p className="fd-fine">
                    Pro adds every starter preset, unlimited zoom, 4× PNG and the vector
                    exports (SVG, HTML, game kit, engine ZIP) for $29.99 a year.
                  </p>
                </>
              )}
              <div className="fd-actions">
                {isPro ? (
                  <button className="fd-ghost" disabled={planBusy} onClick={() => void manage()}>
                    {planBusy ? <Loader2 size={15} strokeWidth={1.8} className="fd-spin" /> : <CreditCard size={15} strokeWidth={1.8} />}
                    {planBusy ? "Opening…" : "Manage subscription"}
                  </button>
                ) : (
                  <button className="fd-ghost" onClick={() => navigate("#/pricing")}>
                    <Sparkle size={15} strokeWidth={1.8} /> See what Pro adds
                  </button>
                )}
                {!isPro && plan?.hasCustomer && (
                  <button className="fd-ghost" disabled={planBusy} onClick={() => void manage()}>
                    <CreditCard size={15} strokeWidth={1.8} /> Billing history
                  </button>
                )}
              </div>
              {planErr && <p className="fd-note">{planErr}</p>}
            </section>

            {/* ── projects ── */}
            <section className="fd-card">
              <h2 className="fd-card__title">My projects</h2>
              <Suspense fallback={<p className="fd-lead">Loading your projects…</p>}>
                <div className="fd-projects">
                  <ProjectsPanel
                    onBack={() => navigate("#/")}
                    onClose={() => {}}
                    confirmReplace={false}
                    onOpened={() => navigate("#/app")}
                  />
                </div>
              </Suspense>
            </section>

            {/* ── data ── */}
            <section className="fd-card">
              <h2 className="fd-card__title">Your data</h2>
              <p className="fd-fine">
                Your work syncs automatically and stays on this device when you sign out.
              </p>
              <div className="fd-actions">
                <button className="fd-ghost" onClick={() => syncNow()}>
                  <RefreshCw size={15} strokeWidth={1.8} /> Sync now
                </button>
                <button className="fd-ghost" onClick={() => downloadMyData()}>
                  <FileDown size={15} strokeWidth={1.8} /> Download my data
                </button>
                {hasLocalSnapshot() && (
                  <button className="fd-ghost fd-ghost--wide" onClick={() => {
                    if (window.confirm("Bring back the work this device had before your cloud copy loaded? Your account will sync to the restored version.")) restoreLocalSnapshot();
                  }}>
                    <History size={15} strokeWidth={1.8} /> Restore this device's earlier work
                  </button>
                )}
              </div>
              {cfg?.fromOverride && (
                <button className="fd-linkbtn fd-linkbtn--muted" onClick={() => { clearCloudOverride(); window.location.reload(); }}>
                  Disconnect this browser's cloud project
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
