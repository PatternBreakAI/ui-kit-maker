import { KIT_SLOTS, KIT_LESSONS, KIT_COMPONENTS, type KitComponentId } from "@/generator/model";

/* The body of the ⓘ card — one component, two layers:
   the MANUAL, generated from the slot table (what can I edit, how), and
   the LESSON, authored (what this pattern is, where it comes from, who
   does it well, further reading). Shared by the Panel's About row and the
   canvas banner's ⓘ popover so the two can never drift apart.
   Links open in NEW TABS (owner rule) — never lose work to a citation. */
export function LessonBody({ cid }: { cid: KitComponentId }) {
  const lesson = KIT_LESSONS[cid];
  const slots = KIT_SLOTS[cid] ?? [];
  const name = KIT_COMPONENTS.find((c) => c.id === cid)?.name ?? cid;
  if (!lesson) return null;
  return (
    <div className="infocard__body">
      <p><b>{name}.</b> {lesson.what}</p>
      {slots.length > 0 && (
        <p className="infocard__manual">
          <b>Editable here:</b>{" "}
          {slots.map((sl) => `${sl.name} — ${
            sl.kind === "choice" ? (sl.choices ?? []).join(" or ")
            : sl.kind === "value" ? "driven by the value slider"
            : sl.kind === "free" ? "free text"
            : "fixed"}`).join(" · ")}
        </p>
      )}
      <p>{lesson.history}</p>
      <p><b>Study:</b> {lesson.games}</p>
      {lesson.links.length > 0 && (
        <p className="infocard__links">
          {lesson.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>
          ))}
        </p>
      )}
    </div>
  );
}
