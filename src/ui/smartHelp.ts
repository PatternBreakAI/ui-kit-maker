import { useGen } from "@/generator/store";

/* Smart Help — the canvas-to-editor routing table.
   Every `data-part` the renderer stamps maps to the Panel section that
   edits it (`data-sec` anchors), with the friendly copy the breakout menu
   shows. Keep this in lockstep with build()'s stamps: a stamped part with
   no route falls back to the master route below.
   See docs/smart-help-architecture.md for the full design. */

export interface PartRoute {
  /** Friendly layer name shown in the breakout menu. */
  label: string;
  /** One line of "what you can change here". */
  hint: string;
  /** Panel section to open + scroll to (the Section's data-sec id). */
  section: string;
  /** Optional landing spot INSIDE the section (a data-anchor stamp) — for
      controls that live partway down a long section, like the icon block
      in Typography. Falls back to the section head when absent. */
  anchor?: string;
}

export const PART_ROUTES: Record<string, PartRoute> = {
  "cast-shadow":    { label: "Cast shadow",    hint: "Distance, blur and opacity of the ground shadow", section: "depth" },
  "outer-glow":     { label: "State glow",     hint: "Per-state aura: pick the state, then set its glow", section: "state" },
  extrusion:        { label: "Extrusion",      hint: "Depth of the solid body; darkness lives in Depth & Shadow", section: "structure" },
  shell:            { label: "Shell & bevel",  hint: "Wall width, softness and rim; the silhouette has its own section", section: "structure" },
  face:             { label: "Face",           hint: "Fills and texture on the candy face; colors live in Color", section: "surface" },
  pattern:          { label: "Face pattern",   hint: "Pattern style, scale, angle and opacity", section: "surface" },
  "inner-glow":     { label: "Inner glow",     hint: "The lit-from-within wash on the unlit side", section: "glow" },
  bloom:            { label: "Bloom",          hint: "Bounce light pooling low on the face", section: "gloss" },
  gloss:            { label: "Gloss",          hint: "The broad curved shine: height, curve, opacity, layer", section: "gloss" },
  specular:         { label: "Specular",       hint: "The reflective event riding the silhouette edge", section: "gloss" },
  texture:          { label: "Micro texture",  hint: "Grain amount and scale", section: "surface" },
  content:          { label: "Content",        hint: "The label and icon block", section: "typography" },
  label:            { label: "Label",          hint: "Text, case, weight, fills, outline, depth effects", section: "typography" },
  /* The standalone Icon section is parked behind ICONS_ENABLED, so this
     routes to where icon controls actually live: the Icons block inside
     Typography. Routing to an unmounted section is a silent dead click —
     the bug the anchor mechanism exists to prevent. */
  icon:             { label: "Icon",           hint: "Size, weight, color and effects. Swap a specific piece's glyph in Component content on the Kit page", section: "typography", anchor: "icons" },
  /* Slot-backed lines (quest objectives, eyebrows…) are typed in Component
     content, not Typography — route to where the field actually is. */
  "slot-text":      { label: "Editable text",  hint: "This line is a text slot. Type it under Component content", section: "kiticon" },
};

/** Anything stamped but unrouted (future parts) lands on the master row. */
export const FALLBACK_ROUTE: PartRoute = { label: "This layer", hint: "Explore the panel sections on the left", section: "state" };

export const routeOf = (part: string): PartRoute => PART_ROUTES[part] ?? FALLBACK_ROUTE;

/** Deep link: open the section, scroll it into view, glow it for a beat.
 *  Reuses the same store `open` map the search force-open rides. */
export function helpNavigate(part: string): void {
  const route = routeOf(part);
  // clear any live panel search — a non-matching query display:nones the
  // target section, which would make this scroll land on nothing
  useGen.setState((st) => ({ panelQuery: "", open: { ...st.open, [route.section]: true } }));
  // let the section body mount before measuring
  window.setTimeout(() => {
    const sec = document.querySelector(`[data-sec="${route.section}"]`);
    if (!sec) return;
    // land on the inner anchor when the route names one and it exists
    const el = (route.anchor && sec.querySelector(`[data-anchor="${route.anchor}"]`)) || sec;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("sh-glow");
    window.setTimeout(() => el.classList.remove("sh-glow"), 1600);
  }, 60);
}
