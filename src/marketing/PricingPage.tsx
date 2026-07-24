import { Check, Lock, Sparkles } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";

/* Three columns, no fine print games: what each tier actually does, in the
   product's voice. Pro pricing goes live with Stripe; until then the column
   sells the contents and takes no money. */

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
            <div className="fd-pricing__tag"><Sparkles size={12} strokeWidth={2.4} /> TWO PACKS AT SIGNUP</div>
            <h2>Player</h2>
            <div className="fd-pricing__price">Free<span> · account</span></div>
            <ul>
              {ROWS.map((r) => <li key={r.label}><Check size={13} strokeWidth={2.4} /><span><b>{r.label}:</b> {r.free}</span></li>)}
            </ul>
            <button className="fd-pricing__cta" onClick={() => openAuth("signin")}>Create free account</button>
          </section>
          <section className="fd-pricing__col">
            <h2>Pro</h2>
            <div className="fd-pricing__price">Annual<span> · price at launch</span></div>
            <ul>
              {ROWS.map((r) => <li key={r.label}><Check size={13} strokeWidth={2.4} /><span><b>{r.label}:</b> {r.pro}</span></li>)}
            </ul>
            <button className="fd-pricing__cta fd-pricing__cta--soon" disabled title="Checkout is being wired up — Pro opens soon.">
              <Lock size={13} strokeWidth={2.4} /> Opening soon
            </button>
          </section>
        </div>
        <p className="fd-pricing__fine">License in one line: ship your kits in any product, commercial included — just don't resell or redistribute the assets themselves.</p>
      </main>
    </div>
  );
}
