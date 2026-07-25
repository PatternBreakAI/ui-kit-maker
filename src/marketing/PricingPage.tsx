import { useState } from "react";
import { Check, Gift, Loader2 } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { cloudConfig } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { startCheckout } from "@/generator/billing";

/* Three columns, no fine print games: what each tier actually does, in the
   product's voice. The Pro column takes real money through Stripe Checkout:
   signed-out visitors are sent to sign-in first (a subscription needs an
   account to attach to), and the upgrade itself is granted server-side by
   the webhook — never by this page. */

const ROWS: { label: string; guest: string; free: string; pro: string }[] = [
  { label: "Kit components", guest: "5 — proof of concept", free: "Full kit", pro: "Full kit" },
  { label: "Starter presets", guest: "4", free: "6 + two packs at signup", pro: "All + shared library" },
  { label: "Zoom", guest: "100%", free: "150%", pro: "Unlimited" },
  { label: "PNG export", guest: "Starter sheet 1×", free: "1×", pro: "Up to 4×" },
  { label: "Vector exports (SVG · HTML · game kit)", guest: "—", free: "—", pro: "Included" },
  { label: "Cloud saves & named projects", guest: "—", free: "Included", pro: "Included" },
  { label: "Share links", guest: "Read-only viewer", free: "Included", pro: "Included" },
];

export function PricingPage() {
  const status = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";
  const billingLive = !!cloudConfig();

  const goPro = async () => {
    setErr(null);
    if (!signedIn) { openAuth("signin"); return; }
    setBusy(true);
    const e = await startCheckout();   // navigates away on success
    if (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
      </header>
      <main>
        <h1>Pick your tier</h1>
        <p className="fd-pricing__sub">Everything is made in your browser and everything you export is yours to ship — the tiers only decide how much of the machine you're holding.</p>
        <div className="fd-pricing__cols">
          <section className="fd-pricing__col">
            <h2>Explorer</h2>
            <div className="fd-pricing__price">Free<span> · no account</span></div>
            <ul>
              {ROWS.map((r) => <li key={r.label}><Check size={13} strokeWidth={2.4} /><span><b>{r.label}:</b> {r.guest}</span></li>)}
            </ul>
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>Open the generator</button>
          </section>
          <section className="fd-pricing__col fd-pricing__col--mid">
            <div className="fd-pricing__tag"><Gift size={12} strokeWidth={2.4} /> TWO PACKS AT SIGNUP</div>
            <h2>Player</h2>
            <div className="fd-pricing__price">Free<span> · account</span></div>
            <ul>
              {ROWS.map((r) => <li key={r.label}><Check size={13} strokeWidth={2.4} /><span><b>{r.label}:</b> {r.free}</span></li>)}
            </ul>
            <button className="fd-pricing__cta" onClick={() => openAuth("signin")}>Create free account</button>
          </section>
          <section className="fd-pricing__col">
            <h2>Pro</h2>
            <div className="fd-pricing__price">$29.99<span> · per year</span></div>
            <ul>
              {ROWS.map((r) => <li key={r.label}><Check size={13} strokeWidth={2.4} /><span><b>{r.label}:</b> {r.pro}</span></li>)}
            </ul>
            <button className="fd-pricing__cta" disabled={busy || !billingLive}
              title={billingLive ? "Secure checkout on Stripe" : "Checkout isn't available on this deployment."}
              onClick={() => void goPro()}>
              {busy ? (<><Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> Opening checkout…</>)
                : signedIn ? "Go Pro — $29.99/year" : "Sign in and go Pro"}
            </button>
            {/* The annual-renewal disclosure of record. It must appear before
                payment: Stripe Managed Payments rejects custom_text, so
                Checkout can't carry it and this line does. Wording tracks
                PRO_ANNUAL_CONSENT in api/checkout.ts — keep them together. */}
            <p className="fd-pricing__renew">
              You'll be charged $29.99 today, plus applicable tax. Renews automatically
              every 12 months at the then-current annual price unless you cancel.
              Cancel anytime from your account — cancelling stops the next charge and
              your Pro access runs to the end of the term.
            </p>
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>
        </div>
        <p className="fd-pricing__fine">License in one line: ship your kits in any product, commercial included — just don't resell or redistribute the assets themselves.</p>
      </main>
    </div>
  );
}
