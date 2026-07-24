/* #/account — a normal account page: profile, plan, projects, and data
   controls on one scrolling page. Reuses the cloud.ts flows and the shared
   ProjectsPanel; signed-out visitors are sent to the sign-in page. */
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Wand2, LogOut, KeyRound, RefreshCw, FileDown, History,
  CheckCircle2, CloudOff, CloudUpload,
} from "lucide-react";
import {
  cloudConfig, clearCloudOverride, signOutCloud,
  syncNow, downloadMyData, hasLocalSnapshot, restoreLocalSnapshot,
  requestPasswordReset,
} from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import logoUrl from "../../pb-logo.png";

const ProjectsPanel = lazy(() =>
  import("@/ui/ProjectsPanel").then((m) => ({ default: m.ProjectsPanel })),
);

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
              <div className="fd-plan">
                <span className="fd-plan__chip">FREE EXPLORER</span>
                <span className="fd-plan__desc">Selected kits and limited PNG exports included.</span>
              </div>
              <p className="fd-fine">
                Paid plans are on the way — there's nothing to manage here yet, and
                you'll never be moved onto one without choosing it.
              </p>
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
