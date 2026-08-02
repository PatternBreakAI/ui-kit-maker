import { useEffect } from "react";
import { GraduationCap, X } from "lucide-react";
import { useTutor } from "@/tutor/tutor";

/* The Tutor's toast — flashes over the canvas like a game hint: in, a beat
   to read, gone. The CTA deep-links to the exact control and glows it. */
export function TutorTip() {
  const { active, dismiss } = useTutor();
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(dismiss, active.ttl ?? 9000);
    return () => window.clearTimeout(t);
  }, [active, dismiss]);
  if (!active) return null;
  return (
    <div className={`tutortip${active.anchor === "cap" ? " tt-anchored" : ""}`} role="status">
      <GraduationCap size={16} strokeWidth={2} className="tt-cap" />
      <div className="tt-copy">
        <b>{active.headline}</b>
        <span>{active.body}</span>
      </div>
      {active.cta && (
        <button className="tt-go" onClick={() => { active.cta!.go(); dismiss(); }}>{active.cta.label}</button>
      )}
      <button className="tt-x" onClick={dismiss} aria-label="Dismiss tip"><X size={13} /></button>
    </div>
  );
}
