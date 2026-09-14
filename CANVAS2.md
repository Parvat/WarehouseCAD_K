# canvas2 — Konva Canvas: Rules & Map

Companion to the SVG-era `CLAUDE.md`/`CODEBASE.md`. Those govern the SVG canvas;
this governs `src/canvas2/`. The SVG engine stayed clean for months *because* it
had this doc and one-job-per-file. canvas2 gets the same discipline — written
down first this time.

**Stack:** React 18, Konva/react-konva, Zustand+Immer (shared store). Grid 40px=1ft.

---

## The 8 rules (read before touching canvas2)

1. **FROZEN BRAIN.** canvas2 only *reads* the store and the shared logic
   (`objects`, generator, columnCheck, capacity, snap, undo, `getObjectBounds`,
   `objectContains`, `applyResize`). It **never edits** the store shape or the
   rack math. Editing them "to make Konva easier" is the line that turns a *new
   canvas* into a *new app* — the rebuild that already failed once. If a change
   seems to need it, STOP and flag it.

2. **ONE OR THE OTHER.** `flag.js` decides the live canvas. ON = only canvas2
   renders and owns input. OFF = only SVG. **Never both.** They share nothing
   but the store. No forwarding, no shared pointer surface. This is what makes
   the old two-renderer bug class impossible.

3. **WORLD COORDS ARE THE ONLY TRUTH.** The view (`{zoom,panX,panY}`) is a lens
   (`viewport.js`), never written back into world coordinates. Everything stored
   and measured is world px.

4. **PICKING = GEOMETRY, NOT KONVA'S HIT GRAPH.** Decide what was clicked with
   the SVG's proven approach — a `hitTest(wx,wy)` that loops objects in z-order
   and returns the first where `objectContains(obj,wx,wy,zoom)` is true — NOT
   `stage.getIntersection`. Konva's hit graph is per-node and silently
   inconsistent (some racks unhittable even with the click inside their rect);
   `objectContains` is type-agnostic and already handles rotation + bays.
   Z-priority: annotations/text → racks/objects → column_grid (only on a real
   column square) → floor plans LAST (so a big building never steals a rack's
   click). Bay picking = the SVG's `hitTestBay`.

5. **ONE PAINTER PER OBJECT.** `Scene.jsx` routes each object to exactly one
   painter (floor → column grid → rack → fallback). Never draw an object twice —
   that was the ghost/decoy bug.

6. **PAN/ZOOM IS IMPERATIVE.** Held in a ref, pushed to the Stage directly,
   store synced on rAF. Never drive the Stage from React props per frame — that
   re-renders every object per mousemove (the old crawl).

7. **VERIFY BY REAL MOUSE, AT ~7% ZOOM, ON A FRESH LAYOUT.** 7% is the
   whole-building view a dealer works at; bugs hide at 100%. A programmatic
   Konva event is NOT a valid interaction test — it bypasses the real path and
   passes while the user's mouse fails. And `npm run build` + tests green does
   NOT mean the app loads — runtime `X is not defined` passes both (seen twice).
   Open the app; confirm zero red console errors.

8. **ONE FILE, ONE JOB.** Keep the separation below. `Canvas2.jsx` was split
   (mirroring the SVG's CanvasArea / CanvasOverlays split) into: `Canvas2.jsx`
   (Stage/layer mounting + view), `useCanvasInteraction.js` (pan/marquee/drag/
   selection input orchestration), and `Overlays.jsx` (selection outline +
   marquee decoration). Keep splitting further as it grows — don't let any one
   of the three regrow into a blob.

---

## File map (each file's single job)

| File | Job | React/Konva? |
|---|---|---|
| `flag.js` | Which canvas is live (one or the other) | no |
| `viewport.js` | Pure view math: screen↔world, zoomAtPoint, wheelFactor, fitView, worldBounds | no |
| `selection.js` | Pure selection + drag geometry: nextSelection, marquee, movedIdsFor, objectCentre, isFloorPlan | no |
| `Scene.jsx` | Composition — route each object to ONE painter, no double-draw | React |
| `shapes.jsx` | The painters: RackShape / FloorPlanShape / ColumnGridShape / FallbackShape — how each draws + its hit area | React/Konva |
| `Canvas2.jsx` | Stage/layer mounting: container sizing, pan/zoom application (imperative) + store sync, composes Scene + Overlays into Layers | React/Konva |
| `useCanvasInteraction.js` | Input/interaction orchestration: the one geometry pick (hitTest/hitTestBay) that drives both selection and drag-arming, pan, marquee, object drag, reparent-after-move | React (hook), no JSX |
| `Overlays.jsx` | Decoration only, never listens: selection outline(s) + marquee rect | React/Konva |
| `debugLog.js` / `DebugPanel.jsx` / `clickDiagnostics.js` | TEMPORARY on-screen diagnostics — DELETE when the interaction bugs are closed | React |

Pure-logic files (`viewport`, `selection`) are the equivalent of SVG's
`canvas.js` — they carry the maths so it can be unit-tested, and they must stay
free of React/Konva/DOM.

---

## Never do

- Edit `store/useCanvasStore.js`, `utils/canvas.js`, the rack math, the
  generator, `columnCheck`, `capacity` — **frozen brain**.
- Use `stage.getIntersection` to decide selection (rule 4).
- Run both renderers at once (rule 2).
- Trust a programmatic "PASS" for a gesture, or "build green" for "it loads"
  (rule 7).
- Draw an object through two painters (rule 5).
- Drive Stage transform from React props per frame (rule 6).

---

## Shared logic canvas2 DEPENDS ON (use these — never reimplement)

canvas2 is a renderer over the frozen brain. These already exist and are
battle-tested in the SVG engine; canvas2 must CALL them, not write its own copy
(a second copy is how the two canvases drift):

| Need | Use | From |
|---|---|---|
| Object bounds (hit/snap truth) | `getObjectBounds(obj)` | utils/canvas.js |
| What was clicked | `objectContains(obj,wx,wy,zoom)` + a ported `hitTest` loop | utils/canvas.js + CanvasArea.jsx |
| Which bay was clicked | ported `hitTestBay(obj,wx,wy)` | CanvasArea.jsx |
| Resize an object | `applyResize(obj,handle,dx,dy,snapFn,shiftKey)` | utils/canvas.js |
| Move (+ fp→children cascade, one undo) | `moveObjects(ids,dx,dy)` | store |
| Re-parent after a move | `attachToParent(id, parentId||undefined)` | store |
| Bay resize → bays not scale | `resizeRackToWidth(obj,newW,gridSize)` | render/rackOps |
| Snap | `snapToGrid`, warehouseSnap, geometricSnap | utils/ |
| ft/in labels | `pxToFtIn(px,gridSize)` | utils/canvas.js |

## Handle rules (Transformer must match SVG's CanvasUI)

- Beam racks (`rack_row`, `rack_double_row`, `rack_cantilever`) → **only ml/mr**
  handles (width = bay count; other handles imply a stretch the object can't do).
- Lane racks (`rack_drive_in`/`through`/`pushback`/`pallet_flow`) → suppress `tc`.
- `aisle` → no handles, no rotate.
- Anchors/rotater must be sized **screenPx / stage-scale** or they vanish at 7%.

## Lane-rack geometry (reference — lives in rackOps/shapes, don't re-derive)

```
laneWPx = ledge(2")*2 + clear(1")*2 + palletWIn
width   = (lanes+1)*uprightW + lanes*laneWPx
height  = palletDeep * palletDIn
```
Beam-rack width = `uprightWidth*(bays+1) + Σbeams`. Both already implemented in
`render/rackOps`; canvas2 reads the draw-ops, it does not recompute geometry.

## Known separate bug (not selection)

Some racks report corrupt world bounds (e.g. −12549..688 — a 13,000px-wide
rack), likely a bad rotation/transform in the geometry. Independent of picking;
fix on its own. Log the offending object's raw fields before fixing.

## Recovery / snapshots

Mirror the SVG discipline: before a risky canvas2 change, commit (git) or copy
the file to `*.STABLE.*`. The pre-canvas2 baseline is preserved in git
(`canvas2-clean-start` branch + filesystem backup). Nothing is ever deleted
without a restore point.

## App-wide docs still apply (NOT copied here on purpose)

The design system (theme tokens, left-panel spec, icon rules, colours) and the
full app file map live in the SVG-era `CLAUDE.md`/`CODEBASE.md` and govern the
whole app, canvas2 included. They are deliberately NOT duplicated here — one
source of truth. Read them for chrome/design; read THIS for canvas2 internals.

## Data shapes (read-only — owned by the store, see CODEBASE.md)

```
Beam rack:  { type:'rack_row'|'rack_double_row', x,y,width,height,rotation,
              beams:[96,...], uprightWidth, palletWIn, palletDIn, activeBayIdx }
Lane rack:  { type:'rack_drive_in'|..., x,y,width,height,rotation,
              lanes, palletDeep, uprightWidth, palletWIn, palletDIn }
Floor plan: { type:'fp_rect'|..., x,y,width,height, fpVerts, parentId... }
```
`getObjectBounds`, `objectContains`, `applyResize` from `utils/canvas.js` are the
shared truth for bounds / hit / resize — canvas2 uses them, never its own copy.

---

## Current status / next

- Rendering (all types, full detail, smooth at Cord scale) — DONE.
- Selection/drag — WORKS for most, but picking uses Konva's hit graph → some
  objects unhittable. **NEXT: switch picking to hitTest+objectContains (rule 4).**
- `Canvas2.jsx` split (rule 8) — DONE: Canvas2.jsx / useCanvasInteraction.js /
  Overlays.jsx.
- Then: delete debug files (rule 7); then Transformer polish → overlays →
  delete SVG (keep headless SVG export only).
