# Smart Help — canvas-to-editor deep links (architecture seed)

Status: **not scheduled** — this is the thinking-ahead document the product
owner asked for. It will get its own thread when we build it.

## The idea

Today the big canvas is a picture: there is nothing to click. Smart Help
makes it the *index into the editor*. In help mode:

1. **Rollover** any region of the canvas → a quiet outline appears around
   every component layer under the pointer.
2. **Click** → a breakout menu lists those components (the stage is built
   in layers, so the pointer is usually over several: face, gloss,
   specular, icon, label, badge…).
3. **Choose a component, then choose what to change** ("the glow color",
   "the label text", "this rollover state") →
4. The editor panel **scrolls to that control, opens its fold, and glows
   for a second** — the user is now editing exactly the thing they pointed
   at.

## Why the codebase is already most of the way there

Every mechanism Smart Help needs exists in some form:

- **Layer identity in the render.** Every kit piece stamps `data-*` attrs
  on its svg root (`data-dialog`, `data-track`, `data-vtrack`,
  `data-shell`, `data-badge`, `data-dock`…). The `build()` shells carry a
  named face clipPath (`…fc`) and the layered SVG export already names
  groups for Figma. Extending this to a uniform `data-part="gloss"`,
  `data-part="label"` etc. on inner groups is mechanical, not structural.
- **Hit-testing.** SVG gives us `document.elementsFromPoint()` — walking
  up from the hit element to the nearest `data-part` ancestors yields the
  exact layer stack under the pointer, deepest first. No geometry math.
- **Editor deep links.** The panel already has: `setFocus(componentId)`
  (focused editing), fold state (`ADV_OPEN`, `open` map — the ✎ button
  already force-opens `kiticon`), and `panelQuery` search that force-opens
  folds. A deep link is `{ component, section, control }` → set focus,
  open the section, `scrollIntoView`, add a `.sh-glow` class for ~1.2s.
- **The part → control map.** The Build Parts chapter already documents
  "each part opens the layer that produces it" — that mapping IS the
  Smart Help routing table. We formalize it as data:
  `PART_ROUTES: Record<PartId, { section: string; controls: string[] }>`.

## Proposed pieces

| Piece | Shape |
|---|---|
| `data-part` pass | renderer stamps `data-part` on every self-drawn group (label, icon, well, fill, badge, knob, ring…). One sweep through `renderKit`/`build`. |
| Help mode | a toolbar toggle (`?` key). Canvas gets `pointer-events` listeners; normal editing is untouched when off. |
| Hover outline | one absolutely-positioned SVG rect per hit layer, from `getBoundingClientRect` of the hit group. Cheap, no re-render. |
| Breakout menu | small popover listing the layer stack (component name + part name), deepest first, with thumbnails optional later. |
| Deep link | `helpNavigate(componentId, partId)` → `setFocus` + open section + scroll + glow. Reuses the search force-open plumbing. |
| Control registry | `PART_ROUTES` map co-located with the panel sections so it can't drift; a dev-mode audit warns when a stamped part has no route. |

## Editing-contract prerequisite (already underway)

Smart Help ends at a *control*, so every visible thing needs a control
that actually drives it — the "if you can't see it, you can't edit it"
rule. The per-piece editing contracts (System Chrome + RPG tables in
`component-roadmap.md`) are that guarantee, and every new pack keeps
writing them.

## Related engine note — composite silhouettes for whole-piece effects

The product owner's note (2026-07-24): on compound pieces like the emblem
bar (socket + rail), shadow/glow must wrap the WHOLE composite, not each
part — today each part carries its own halo and the seam shows.

Two implementation routes, in preference order:

1. **Group-level filter.** Render the composite's parts WITHOUT their
   own outer fx, wrap them in one `<g filter="drop-shadow/bloom">` —
   the browser computes the filter from the group's combined alpha, which
   is exactly the union silhouette. Requires `build()` to expose a
   "suppress outer fx" mode so glow/shadow can be re-applied once at the
   composite level.
2. **True path union.** Stitch the silhouette paths (we already have the
   planar winding machinery in `bevel.ts` from the offset rewrite) and
   feed the union to the effect layers. Heavier; only needed if route 1's
   filter fidelity (e.g. layered bloom recipes) proves insufficient.

This also matters to Smart Help: a stitched composite still needs its
parts individually addressable, so the union is an EFFECT-layer concern —
the `data-part` layer tree stays per-part.
