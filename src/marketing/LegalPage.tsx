/* Terms of Use and Privacy Policy pages (#/terms · #/privacy), rendering the
   PatternBreak legal package v1 documents with the front-door chrome. */
import { MarketingFooter } from "@/marketing/chrome";
import { useEffect } from "react";
import "@/styles/legal.css";
import { LEGAL_TERMS_HTML } from "./legal-terms";
import { LEGAL_PRIVACY_HTML } from "./legal-privacy";
import { navigate } from "@/shell/router";

export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  useEffect(() => {
    // Same body unlock the landing uses — these are normal scrolling pages.
    const prev = { height: document.body.style.height, overflow: document.body.style.overflow };
    document.body.style.height = "auto";
    document.body.style.overflow = "visible";
    window.scrollTo(0, 0);
    return () => {
      document.body.style.height = prev.height;
      document.body.style.overflow = prev.overflow;
    };
  }, [doc]);

  return (
    <div className="fd-legal">
      <header className="fd-legal__bar">
        <a
          href="#/"
          onClick={(e) => { e.preventDefault(); navigate("#/"); }}
          className="fd-legal__brand"
        >
          ← UI Kit Maker
        </a>
        <nav className="fd-legal__switch">
          <a href="#/terms" aria-current={doc === "terms" ? "page" : undefined}>Terms</a>
          <a href="#/privacy" aria-current={doc === "privacy" ? "page" : undefined}>Privacy</a>
        </nav>
      </header>
      <main
        className="fd-legal__doc"
        dangerouslySetInnerHTML={{ __html: doc === "terms" ? LEGAL_TERMS_HTML : LEGAL_PRIVACY_HTML }}
      />
      <MarketingFooter />
    </div>
  );
}
