import { useEffect } from "react";

/* gen.css pins <body> to height:100% / overflow:hidden for the editor —
   correct at #/app, fatal on scrolling pages. The landing and account
   pages each carried a private copy of the unpin ritual; every new
   scrolling route kept forgetting it (the FAQ shipped unscrollable —
   owner report, 2026-07-25). One hook, used by every scrolling page. */
export function usePageScroll() {
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
}
