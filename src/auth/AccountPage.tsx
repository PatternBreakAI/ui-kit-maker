/* #/account — a normal account page: profile, plan, projects, and data
   controls on one scrolling page. Reuses the cloud.ts flows and the shared
   ProjectsPanel; signed-out visitors are sent to the sign-in page. */
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Wand2, LogOut, KeyRound, RefreshCw, FileDown, History,
  CheckCircle2, CloudOff, CloudUpload, CreditCard, Loader2, Crown,
  ShieldCheck, GraduationCap, Eye, Trash2,
} from "lucide-react";
import {
  cloudConfig, clearCloudOverride, signOutCloud,
  syncNow, downloadMyData, hasLocalSnapshot, restoreLocalSnapshot,
  requestPasswordReset, myBilling, myProfileTier,
  listProjects, downloadAccountBackup, deleteMyAccount,
} from "@/generator/cloud";
import "@/styles/pricing.css";
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

  /* ── the danger door ──────────────────────────────────────────────
     Deletion cascades: kits, gallery cards, hearts, profile, studio —
     everything. Normal accounts get a standard respectful flow
     (consequences + backup offer + type-DELETE). The HOUSE account —
     keeper of the seed wall — gets the severe ceremony, by decree. */
  const HOUSE_EMAIL = "info@uikitmaker.com";
  const [deleting, setDeleting] = useState(false);
  const deleteDoor = async () => {
    if (deleting) return;
    const house = (status.email ?? "").toLowerCase() === HOUSE_EMAIL;
    const { projects } = await listProjects();
    const n = projects.length;
    const kits = `${n} saved kit${n === 1 ? "" : "s"}`;

    if (house) {
      if (!window.confirm(
        `⚠️ STOP — THIS IS THE HOUSE ACCOUNT ⚠️\n\n` +
        `PatternBreak itself lives here: ${kits}, including the community wall's ` +
        `official seed kits, their hearts, their share links, and the @patternbreak ` +
        `profile. Deleting this account tears all of it out of the site at once.\n\n` +
        `If you mean to RETIRE it, stop now and use Adopt kits on the admin desk ` +
        `first — that moves every kit to another account unharmed.\n\n` +
        `Continue toward deletion anyway?`,
      )) return;
      if (!window.confirm(
        `Second warning, because this one matters.\n\n` +
        `The moment this goes through, the Community Gallery loses its cards and ` +
        `every "Use this kit" link out in the world goes dead. There is no undo, ` +
        `and support cannot recover any of it — it will no longer exist.\n\n` +
        `Still continue?`,
      )) return;
    } else if (!window.confirm(
      `Delete this account?\n\n` +
      `This permanently erases ${kits} (including any public gallery cards and ` +
      `their hearts), your profile page, and your synced studio with its personal ` +
      `presets.\n\nThere is no undo.`,
    )) return;

    if (window.confirm(
      `Keep a copy first?\n\nOK downloads a full backup — every kit with its ` +
      `complete design, your studio and profile, one JSON file you could rebuild ` +
      `from. Cancel skips the backup.`,
    )) {
      const be = await downloadAccountBackup();
      if (be) { window.alert(`Backup failed (${be}) — stopping here, nothing was deleted.`); return; }
    }

    const word = window.prompt(
      house
        ? `Final gate. Type DELETE (all caps) to erase the HOUSE ACCOUNT forever:`
        : `Final step. Type DELETE (all caps) to erase this account forever:`,
    );
    if (word !== "DELETE") {
      if (word !== null) window.alert("That didn't say DELETE — nothing was touched.");
      return;
    }

    setDeleting(true);
    const err = await deleteMyAccount();
    setDeleting(false);
    if (err) { window.alert(err); return; }
    window.alert("The account and everything it owned has been erased.");
    navigate("#/");
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

  /* Admin card visibility (owner call: the desks get a door in settings,
     for every admin). The flag only decides what RENDERS — each desk
     re-verifies is_admin server-side on every call. */
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void myProfileTier().then((p) => { if (live) setIsAdmin(p.admin); });
    return () => { live = false; };
  }, [signedIn]);

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
  const isStudent = plan?.plan === "student";
  // 'comped' = granted by the owner via the admin desk — no billing exists
  const comped = plan?.status === "comped";
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
                      <Crown size={12} strokeWidth={2.6} /> PRO
                    </span>
                    <span className="fd-plan__desc">
                      The full kit, every preset, unlimited zoom, 4× PNG and all vector exports.
                    </span>
                  </div>
                  <p className="fd-fine">
                    {comped
                      ? "Complimentary Pro — on the house from PatternBreak. No billing, nothing to renew."
                      : plan?.status === "canceled"
                        ? `Cancelled — your Pro access runs until ${fmtDate(plan.renewsAt)}.`
                        : plan?.status === "past_due"
                          ? "We couldn't take the last payment — update your card to keep Pro."
                          : plan?.renewsAt
                            ? `$29.99/year · renews ${fmtDate(plan.renewsAt)}. Cancel anytime; access runs to the end of the term.`
                            : "$29.99/year · renews automatically. Cancel anytime; access runs to the end of the term."}
                  </p>
                </>
              ) : isStudent ? (
                <>
                  <div className="fd-plan">
                    <span className="fd-plan__chip fd-plan__chip--pro">
                      <Crown size={12} strokeWidth={2.6} /> STUDENT / EDUCATOR
                    </span>
                    <span className="fd-plan__desc">
                      Everything Pro has, under the education licence — coursework, portfolio and
                      non-commercial releases.
                    </span>
                  </div>
                  <p className="fd-fine">
                    {comped
                      ? "Complimentary access — on the house from PatternBreak. No billing, nothing to renew."
                      : plan?.status === "canceled"
                        ? `Cancelled — your access runs until ${fmtDate(plan.renewsAt)}.`
                        : plan?.status === "past_due"
                          ? "We couldn't take the last payment — update your card to keep your plan."
                          : plan?.renewsAt
                            ? `$15.99/year · renews ${fmtDate(plan.renewsAt)}. Selling what you build? Pro carries the commercial licence.`
                            : "$15.99/year. Selling what you build? Pro carries the commercial licence."}
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
                {(isPro || isStudent) && !comped ? (
                  <button className="fd-ghost" disabled={planBusy} onClick={() => void manage()}>
                    {planBusy ? <Loader2 size={15} strokeWidth={1.8} className="fd-spin" /> : <CreditCard size={15} strokeWidth={1.8} />}
                    {planBusy ? "Opening…" : "Manage subscription"}
                  </button>
                ) : !isPro && !isStudent ? (
                  <button className="fd-ghost" onClick={() => navigate("#/pricing")}>
                    <Crown size={15} strokeWidth={1.8} /> See what Pro adds
                  </button>
                ) : null}
                {(!isPro && !isStudent || comped) && plan?.hasCustomer && (
                  <button className="fd-ghost" disabled={planBusy} onClick={() => void manage()}>
                    <CreditCard size={15} strokeWidth={1.8} /> Billing history
                  </button>
                )}
              </div>
              {planErr && <p className="fd-note">{planErr}</p>}
            </section>

            {/* ── admin desks (renders for admins only; every desk
                 re-verifies is_admin server-side) ── */}
            {isAdmin && (
              <section className="fd-card">
                <h2 className="fd-card__title"><ShieldCheck size={17} strokeWidth={2.1} style={{ verticalAlign: "-3px" }} /> Admin</h2>
                <p className="fd-fine">
                  Only admin accounts see this card. Comps and plan changes are audit-logged.
                </p>
                <div className="fd-actions">
                  <button className="fd-ghost" onClick={() => navigate("#/admin")}>
                    <CreditCard size={15} strokeWidth={1.8} /> Plans desk
                  </button>
                  <button className="fd-ghost" onClick={() => navigate("#/review")}>
                    <GraduationCap size={15} strokeWidth={1.8} /> Student review
                  </button>
                  <button className="fd-ghost" onClick={() => navigate("#/community")}>
                    <Eye size={15} strokeWidth={1.8} /> Curation queue
                  </button>
                </div>
              </section>
            )}

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

            {/* ── the danger door ── */}
            <section className="fd-card">
              <h2 className="fd-card__title">Delete account</h2>
              <p className="fd-fine">
                Deleting your account erases everything it owns — saved kits, gallery cards
                and their hearts, your profile and studio. The door asks first, offers a full
                backup, and cannot be reopened. A live subscription must be cancelled before
                this door will open.
              </p>
              <button className="fd-ghost fd-danger" disabled={deleting} onClick={() => void deleteDoor()}>
                {deleting ? <Loader2 size={15} strokeWidth={1.8} className="fd-spin" /> : <Trash2 size={15} strokeWidth={1.8} />}
                {deleting ? "Erasing…" : "Delete this account…"}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
