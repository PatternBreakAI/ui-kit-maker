import { useState } from "react";
import { GraduationCap, ShieldCheck, Upload, CheckCircle2, Loader2 } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { submitStudentVerification } from "@/generator/student";

/* #/student — apply for the verified student rate.

   The gate is deliberately human: an educational address plus a current
   student ID, reviewed by a person. No automated .edu regex decides
   anything — a domain check would lock out most of the world (.ac.uk,
   .edu.au, and the many universities on plain national domains) while
   still being trivial to fake.

   PRIVACY: the ID image is written to a private bucket, read only by the
   reviewer, and DELETED the moment a decision is made. We keep the
   decision, the school address and the date — never the document. That
   promise is made on this page because it is a promise we keep in code
   (see the approve step in api/student-review). */

const MAX_MB = 8;

export function StudentPage() {
  const status = useCloudStatus();
  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";

  const [school, setSchool] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooBig = !!file && file.size > MAX_MB * 1024 * 1024;
  const ready = signedIn && !!school.trim() && !!file && !tooBig && attest && !busy;

  const submit = async () => {
    if (!ready || !file) return;
    setBusy(true); setErr(null);
    const e = await submitStudentVerification(school.trim(), file);
    setBusy(false);
    if (e) setErr(e); else setDone(true);
  };

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/pricing")}>← Pricing</button>
        <span className="fd-pricing__mark">PatternBreak</span>
      </header>

      <main className="fd-student">
        <span className="fd-pricing__ico fd-pricing__ico--edu"><GraduationCap size={17} strokeWidth={2.1} /></span>
        <h1>Student access</h1>
        <p className="fd-pricing__sub">
          The same tool professionals ship with, at $15.99 a year instead of $29.99.
          Send us proof you're enrolled and we'll switch your account over.
        </p>

        {done ? (
          <section className="fd-studentcard">
            <p className="fd-studentcard__ok">
              <CheckCircle2 size={18} strokeWidth={2.2} /> Application received
            </p>
            <p>
              We'll review it and email you — usually within a day or two. Once you're
              approved, the student rate appears on the pricing page and you can
              subscribe from there.
            </p>
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>
              Back to the generator
            </button>
          </section>
        ) : (
          <section className="fd-studentcard">
            {!signedIn && (
              <p className="fd-studentcard__warn">
                You'll need an account first — that's what we attach the discount to.{" "}
                <button className="fd-linkbtn" onClick={() => openAuth("signin")}>Sign in or create one</button>.
              </p>
            )}

            <label className="fd-field">
              <span>School email address</span>
              <input type="email" value={school} disabled={!signedIn}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="you@university.edu" autoComplete="email" />
              <small>
                Any educational address — <code>.edu</code>, <code>.ac.uk</code>,
                <code>.edu.au</code> or your institution's own domain. It doesn't have
                to match the address on your account.
              </small>
            </label>

            <label className="fd-field">
              <span>Current student ID</span>
              <div className={`fd-drop${file ? " has-file" : ""}`}>
                <input type="file" accept="image/*,.pdf" disabled={!signedIn}
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); }} />
                <Upload size={16} strokeWidth={2.2} />
                <span>{file ? file.name : "Choose a photo or PDF"}</span>
              </div>
              <small>
                It needs to show your name and a date that hasn't passed. Photos of a
                physical card are fine.
              </small>
              {tooBig && <small className="fd-field__err">That file is over {MAX_MB} MB — try a photo instead of a scan.</small>}
            </label>

            <label className="fd-check">
              <input type="checkbox" checked={attest} disabled={!signedIn}
                onChange={(e) => setAttest(e.target.checked)} />
              <span>I'm currently enrolled at the institution above, and this ID is mine.</span>
            </label>

            <p className="fd-privacy">
              <ShieldCheck size={14} strokeWidth={2.2} />
              <span>
                <b>We delete your ID as soon as we've looked at it.</b> A person reviews
                it, records the decision, and the file is removed. We keep the school
                address and the date — never the document.
              </span>
            </p>

            <button className="fd-pricing__cta fd-pricing__cta--edu" disabled={!ready} onClick={() => void submit()}>
              {busy ? (<><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Sending…</>) : "Send for review"}
            </button>
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
