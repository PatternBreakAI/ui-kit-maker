/* Shown instead of the editor on small/touch screens — the canvas needs a
   desktop. The rest of the site works fine on mobile; only #/app is gated. */
import { useEffect, useState } from "react";
import { navigate } from "./router";
import logoUrl from "../../pb-logo.png";

export function MobileGate({ viewer }: { viewer: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const prev = { height: document.body.style.height, overflow: document.body.style.overflow };
    document.body.style.height = "auto";
    document.body.style.overflow = "visible";
    return () => {
      document.body.style.height = prev.height;
      document.body.style.overflow = prev.overflow;
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  };

  return (
    <div className="fd-page">
      <header className="fd-page__bar">
        <a href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }} className="fd-page__brand">
          <img src={logoUrl} alt="" width={24} height={24} /> UI Kit Maker
        </a>
      </header>
      <main className="fd-page__center">
        <div className="fd-modal fd-page__card" aria-label="Desktop required">
          <div className="fd-modal__body">
            <h1 className="fd-page__title">Made for the big screen</h1>
            <p className="fd-lead">
              {viewer
                ? "This shared kit opens in the editor, and the editor needs a desktop — panels, precision, a real canvas. We're not supporting mobile just yet."
                : "The editor needs a desktop — panels, precision, a real canvas. We're not supporting mobile just yet."}
            </p>
            <p className="fd-fine">
              Save the link and open it on a bigger screen — everything will be
              exactly where you left it.
            </p>
            <button className="fd-primary" onClick={() => void copy()}>
              {copied ? "Link copied ✓" : "Copy link for later"}
            </button>
            <button className="fd-ghost fd-ghost--wide" onClick={() => navigate("#/")}>
              Browse the site instead
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
