# canvas2 — Bug Journal

The narrative record of the Konva canvas bugs: what we saw, how long we chased
it, what turned out to be the real cause, and the exact fix. Companion to
`CANVAS2.md` (the rules). Read this before re-debugging anything here — several
of these bugs *look* like each other and we wasted rounds because of it.

The one meta-lesson across all of them:
- **Programmatic "PASS" ≠ works.** Automated Konva-event tests bypass the real
  input path and passed while the user's mouse failed. Every real fix below was
  confirmed only by a real mouse, at ~7% zoom, on a freshly generated layout.
- **Green build + green tests ≠ the app loads.** Runtime `X is not defined`
  passes both and white-screens the app. Always open it and check the console.
- **The old SVG engine was the reference all along.** It stayed clean for months
  because picking, bounds and resize were pure geometry (`objectContains`,
  `getObjectBounds`, `applyResize`) — not renderer hit-testing. Every time we
  drifted from that, it broke; every time we went back to it, it worked.

---

## BUG 1 — Resize/rotate handles broken for ~7 rounds (the long one)

**Symptoms (recurring, kept "coming back"):** rotate icon moved the selection
instead of rotating; no resize anchors; a "dummy" rack rotating in the
background; clicking a handle just started a drag.

**Why it took so long:** this was the migration-on-top-of-SVG era — Konva and SVG
were BOTH live, sharing one pointer surface, forwarding events, with painted
decoy handles on top of Konva's real ones. Every round fixed one real thing
(rotation not applied, decoys, a 1px floor-plan self-rect, missing imports) and
another surfaced, because the underlying arrangement — two renderers straddling
one input surface — kept generating new conflicts. Claude Code repeatedly
reported "verified PASS" because it tested programmatically at 100% zoom; the
user saw it broken at 7% by hand.

**The actual last cause:** the Transformer's anchors/rotater were fixed pixel
sizes inside the zoom-scaled Stage, so at the user's real ~7% zoom they shrank to
sub-pixel — invisible and un-grabbable. You were aiming at a painted decoy at a
different offset and falling through to a drag.

**Resolution:** we stopped patching and did a **clean-start canvas** (see
CANVAS2.md). The straddle, decoys and forwarding were deleted, not fixed. Handle
sizes are now `screenPx / stage-scale`.

**Lesson:** don't run two renderers over one input surface. And a "simple" thing
that fails 7× is usually the wrong architecture, not a stubborn bug.

---

## BUG 2 — Debug panel silently eating clicks

**Symptom:** clicks on racks whose screen position fell under the on-screen debug
panel did nothing — looked exactly like a hit-graph failure.

**Cause:** the debug panel is a DOM box over the canvas; `elementFromPoint`
returned the panel, so the Stage's mousedown never fired. Nothing to do with
Konva at all.

**Fix:** `pointerEvents: none` on the whole panel body; only the header
(buttons) re-enables it. (In `DebugPanel.jsx`.)

**Lesson:** a diagnostic that steals the clicks it exists to diagnose invents a
bug. Rule out the overlay before blaming the renderer.

---

## BUG 3 — Racks intermittently unclickable ("works sometimes")

**How we chased it (wrong turns, recorded so we don't repeat them):**
- Hypothesis "left side dead / right side works" — **disproved by the click log**
  (a left rack selected, the selected rack was on the left).
- Hypothesis "single-rows dead / double-rows work" — **disproved** (a double-row
  failed; a single-row worked).
- Hypothesis "hit-pad overreach steals neighbor's center" — a **real** effect
  found and fixed (asymmetric pad), but it was NOT the main bug.

**What actually found it:** an on-screen click log printing, per click,
`getIntersection` result + whether the point was inside the rack's drawn bounds
and hit-rect bounds. The decisive lines showed clicks **inside both drawn and hit
bounds still returning `getIntersection -> null`.** So the hit shape existed, the
click was on it, and Konva's hit graph *still* missed it — inconsistently, per
node, for reasons that varied (some nodes, some with corrupt bounds).

**Root cause:** relying on Konva's per-shape hit graph (`stage.getIntersection`)
for object picking. It depends on each node's hit region being built perfectly
and is silently inconsistent.

**Fix (the important one):** picking is now **geometry, not Konva's hit graph** —
ported the SVG's `hitTest(wx,wy)` (z-priority: annotations → objects →
column_grid on a real square only → floor plans last) returning the first object
where `objectContains(obj,wx,wy,zoom)` is true, plus `hitTestBay` for bays. This
is type-agnostic: single vs double rows behave identically. (CANVAS2.md rule 4.)

**Lesson:** we found this only when we stopped theorizing and made the code print
what it was doing. Instrument before hypothesizing.

---

## BUG 4 — Some racks not draggable + bay-select flaky (after the picking fix)

**Symptom:** after picking was fixed, everything selected, but some racks
wouldn't drag and single-bay selection was unreliable.

**Root cause:** Konva's native `draggable`/`dragstart` ran its OWN scene-graph
pick — a *second, independent* hit-test — alongside the geometry `hitTest` that
now drove selection. When the two disagreed for the same press, drag silently
failed, and bay-select raced the node's native drag-arm against its own logic.
Two hit-tests, two answers.

**Fix:** one pick drives both. Object nodes now carry **no event props at all** —
no `onMouseDown`, `onTap`, `draggable`, or `cancelBubble`; they are pure paint.
`onStageMouseDown` runs `hitTest` once and that same result both selects and arms
the drag (`beginDrag`). Konva's scene graph decides nothing about input.
(Commit `abb4419`.)

**Lesson:** there must be exactly ONE hit-test. Konva's built-in interactivity
(`draggable`, per-node handlers) is a competing pick — don't mix it with a
geometry pick. Nodes are paint; input is geometry.

---

## BUG 5 — Rack dragged out of a building still moves with it

**Symptom:** drag a rack outside the building, then drag the building — the
moved-out rack came along.

**Cause:** parentage wasn't recomputed after a move, so a rack that left the
building still claimed it as `parentId`, and the store's cascade dutifully
carried it.

**Fix:** after a move, `reparentMoved` recomputes each moved object's parent from
its new centre (`objectContains(fp, centre)`), calling
`attachToParent(id, fp?.id)` — `undefined` clears it. Matches the SVG's own
re-parent-after-move rule. Consequence to know: dragging a rack INTO a building
adopts it (intended).

**Lesson:** parent/child is a fact about position — recompute it whenever
position changes.

---

## BUG 6 — Selection outline stays at old position after a select-and-drag  (commit `c3b5719`)

**Symptom:** dragging a selection moves the objects, but the selection box stays
at the old spot and only snaps over later.

**Chased:** single-object and multi-select drags on an ALREADY-selected object
tested clean (obj/sel matched at every stage) — the bug only reproduced when
the press both selects an unselected object AND starts its drag in one
gesture, the normal way a user actually drags.

**Cause:** `beginDrag` collected the drag node set synchronously inside the
mousedown handler, right after the store write that selects the object. When
the object wasn't already selected, React hasn't committed the new
`<SelectionOutline>` into the Konva tree yet at that instant, so the node scan
never saw it — the outline sat still all through the drag and only caught up
once `moveObjects` forced a real re-render on mouseup.

**Fix:** re-collect the drag node set the moment the drag threshold is first
crossed (`collectDragNodes`, extracted from `beginDrag`), which always lands
after React has flushed the new outline. Also hardened `outlineBounds` to
measure a floor plan's `fpVerts` directly instead of its separate
`obj.x/y/width/height` fields, closing a latent gap between the two.

**Lesson:** a fix verified by "click, wait, then drag" can still miss the bug
that only shows up in "press and drag in one continuous gesture" — test the
gesture the way a mouse actually performs it, not a decomposed version of it.

---

## BUG 7 — Bay click recorded correctly but invisible — read as "selects whole row"  (commit `aea742d`)

**Symptom:** clicking a specific bay inside a rack looked exactly like
clicking the rack itself — the whole-rack selection outline was the only
thing that ever appeared, so bay-level picking read as not wired up at all.

**Chased:** before touching any code, verified what the DATA actually did:
clicked a bay by real mouse, read the object back from the store.
`activeBayIdx` was set correctly, every time. So the pick itself — hitTest →
`selectFromHit` → `hitTestBay` — was never the problem, despite looking
exactly like "hitTestBay not wired to selection" from the screen alone.

**Cause:** `render/rackOps.js`, the shared draw-op geometry canvas2 paints
every rack from, has no notion of `activeBayIdx` at all. The SVG canvas
draws its bay highlight inline in `ShapeGeometry.jsx`, entirely outside the
shared ops — so canvas2 never inherited it. The pick was correct and
completely invisible.

**Fix:** added `activeBayRects` to `shapes.jsx` — a dashed highlight for
`rack_row`, `rack_double_row` and `rack_cantilever` (the three types
`ShapeGeometry.jsx` itself visually highlights; `RACK_BAY_TYPES` answers a
pick for more types than that, but painting a highlight for ones the SVG
canvas has none for isn't mirroring it). Built from `uprightXs`/
`cantileverGeom` in `render/rackOps.js` — the SAME functions
`rackRowOps`/`rackCantileverOps` already use to draw the bays/towers, so the
highlight can never disagree with the drawing or with `hitTestBay`. Also
closed two related gaps against `CanvasArea` found along the way: cantilever
was always writing `activeBayIdx` instead of `activeTowerIdx`, and clicking
the rack but missing every bay (an upright) left a stale highlight instead
of clearing it.

**Verified, real mouse + direct Konva-node read-back:** toggle on/off (click
the same bay twice), switch bay, click an upright to clear it, double-row
highlights both bands for the same bay column, cantilever sets
`activeTowerIdx` with correct highlight geometry, shift-click a second rack
clears the first one's bay (unconditional on shift, matching `CanvasArea`
exactly). 309 tests, build clean, drag/selection sweep still 0/14 failures.

**Lesson:** "the feature looks broken" and "the feature IS broken" are
different claims — check the store before touching the picking code. The
data path here was fine from the start; the bug was a missing renderer, not
a missing wire.

---

## BUG 8 — Building resize/rotate (step 5): two real bugs found building it, not fixed after the fact  *(superseded — see BUG 9)*

**This whole design — Konva's own `Transformer` widget — was replaced after
the fact.** It worked once both bugs below were fixed, but it violated rule 4
on its own terms: the Transformer's anchors are a SECOND, independent Konva
input surface (their own native mousedown handlers), which is precisely what
rule 4 exists to rule out for object picking, and Bug B below is exactly that
class of bug showing up in practice. Rebuilt to hand-painted handles + the
same geometric hitTest everything else uses — see BUG 9. Left in place,
unedited, because the ROOT CAUSES below (the centre-origin Group confusing
Konva's own resize math, cancelBubble not covering the native event) are real
findings about Konva itself, not about this specific design, and are exactly
the kind of thing to check first if a future Konva-widget integration is ever
attempted again here.

canvas2 had no Transformer at all before this — `ResizeTransformer.jsx` was
new, not a repair (and no longer exists — see BUG 9). Logged here anyway
because both bugs below are exactly the class CANVAS2.md rule 4 exists to
prevent someone re-discovering the hard way.

**Bug A — Konva's Transformer, given the real rack Group directly, resizes as
almost-pure position with no scale.**

*Symptom:* dragging `middle-right` outward on a `rack_row` moved the WHOLE
rack sideways by roughly the full drag distance and left width/beams
completely unchanged — visually indistinguishable from an accidental object
drag, not a resize.

*Chased:* first suspected a coordinate-space mixup in `onTransformEnd`
(centre-vs-top-left math) and rewrote the x/y conversion twice with no
change. Only reading the LIVE values back — `shadow.scaleX()` (1.0003, i.e.
no meaningful scale) alongside `node.x()` moved by ~714 world units (the
exact drag distance at that zoom) — showed the Transformer itself was
computing almost no scale change, not that the conversion afterward was wrong.

*Cause:* `RackShape`'s Group (shapes.jsx) is deliberately centre-origin —
`spin()` sets `x = offsetX = cx, y = offsetY = cy` so ROTATION pivots at the
object's centre while its Ops children still draw at plain absolute world
coordinates (the two cancel to identity whenever rotation is 0, which is what
makes the paint side work at all). Konva's Transformer does not expect a
pre-baked offset on the node it manipulates — it assumes a standard,
0,0-origin node when it inverts "here is the box you dragged this into" back
into x/y/scale for that specific node shape, and gets it wrong for one with a
non-zero offset already baked in.

*Fix:* give the Transformer a plain, ordinary, invisible `Rect` PROXY — the
object's own x/y/width/height/rotation, no offset — let Konva manipulate
THAT, and read the result back off it instead of the real Group.
`onTransformEnd` then never touches the real rack node at all until it calls
`commitObjectUpdate`, which re-renders it normally from the store.

**Bug B — after Bug A's fix, resize worked but ALSO silently doubled up with
an ordinary object drag: two history entries, wrong final position.**

*Symptom:* `onTransformEnd` now computed a correct patch (verified by direct
read-back: right x, right bay-quantized width) — but the STORED object ended
up somewhere else entirely, and one resize gesture pushed two undo entries.

*Chased:* assumed a stray second call to `onTransformEnd` (added a call
counter — it fired exactly once, with the correct patch) or a stale Transformer
instance re-attaching mid-drag (ruled out — `objects` never changes during a
transform, only on commit). The actual second write was found by logging
every `moveObjects` call app-wide: one fired mid-gesture with a delta
matching the drag distance almost exactly.

*Cause:* Konva's Transformer sets `e.cancelBubble = true` on its own anchor
mousedown internally (confirmed in Konva's source) — but that only stops
KONVA'S OWN bubbling to ancestor Konva nodes. It does not call the native
`Event.stopPropagation()`, so the underlying browser mousedown still reached
react-konva's `<Stage onMouseDown>` — i.e. this canvas's own
`onStageMouseDown` — which ran its normal `hitTest`, found the rack under the
anchor, and armed an ordinary object-drag through the exact same window
mousemove/mouseup path BUG 4/6 built. Two independent systems answered the
same press: the Transformer resized correctly, and the ordinary drag path
ALSO committed a `moveObjects` for the same mouse movement.

*Fix:* `onStageMouseDown` now walks `e.target`'s ancestor chain for
`getClassName() === 'Transformer'` and returns immediately if found — before
any hitTest, pan, or marquee logic runs. This is CANVAS2.md rule 4's "one
picker" made to hold under a case cancelBubble alone does not cover: our own
handler now explicitly recognizes and defers to Konva's chrome, rather than
trusting a property that only ever governed Konva's own internal tree.

**Also corrected while building this:** `anchorSize` and friends do NOT need
`/zoom` the way the SVG's own hand-drawn handles do — Konva's Transformer
already renders its own UI at a constant screen size regardless of the
Stage's ambient scale. Dividing by zoom (an assumption carried over from BUG
1's diagnosis of the old, abandoned hybrid Transformer) produced anchors
measuring roughly 140px on screen at 7% instead of the intended ~9px —
caught by reading `anchor.getClientRect()` back off a live Stage before ever
trusting a screenshot.

**Verified, real mouse + direct store/Konva-node read-back, all 9
`render/rackOps.js` rack types (`rack_row`, `rack_double_row`,
`rack_drive_in`, `rack_drive_through`, `rack_pushback`, `rack_pallet_flow`,
`rack_cantilever`, `rack_mezzanine`, `rack_shelving`):** selects, correct
`enabledAnchors` per CANVAS2.md's Handle rules, resize grows/shrinks with the
opposite edge pinned (bay-quantized via `resizeRackToWidth` for
`rack_row`/`rack_double_row`, raw geometric width for the rest), rotate turns
around centre, one undo per gesture either way, undo fully reverts. 309
tests, build clean, drag/selection/bay-select/view-fit sweeps all still
green.

**Lesson:** don't trust a library's own documented event-cancellation
semantics to mean what you'd guess across a boundary it wasn't designed to
cross (Konva-internal cancelBubble vs. the native DOM event) — verify with a
call counter, not an assumption. And a plausible one-line fix (the x/y
conversion math) can be completely wrong about WHICH layer of the problem
you're looking at; read the actual runtime values back before rewriting
theory a second time.

---

## BUG 9 — Resize/rotate rebuilt as ported geometry, not Konva's Transformer

BUG 8's Transformer design worked, but it was a second Konva-native input
surface living alongside the one geometric hitTest CANVAS2.md rule 4 says
should decide everything — a real, if contained, violation, and Bug B in
BUG 8 is what that violation looks like when it actually bites. Rebuilt from
scratch: `ResizeTransformer.jsx` deleted; `handleGeometry.js` (pure geometry,
ported from `CanvasUI.jsx`) + `ResizeHandlesOverlay.jsx` (plain painted
Konva shapes, zero event props) take its place. `onStageMouseDown` now calls
`handleHitTest` — the SAME function that decided what to paint — BEFORE the
object hitTest, and arms a resize/rotate drag through the identical window
mousemove/mouseup path object-drag already uses. One picker, provably, not
two that happen not to collide.

Ported verbatim rather than re-derived: `getHandlePositions`/`applyResize`/
`HANDLES` (utils/canvas.js), the per-type handle suppression (`CanvasUI.jsx`),
the rotated-resize anchor correction and the doSnap/SNAP_FREE asymmetry
(`CanvasArea.jsx`). Confirmed directly: dragging `mr` on a 45°-rotated
`rack_row` left the `ml` handle's world position unmoved to within
floating-point noise — the anchor-correction math ported correctly.

**One new bug found in the port, caught by re-running the EXISTING
bay-select regression check (not a fresh one written for this feature) —
exactly why that suite exists:**

*Symptom:* at 7% (whole-building) zoom, clicking a beam rack's first upright
— meant to clear its active bay, an already-shipped behavior — silently did
nothing. `c2bayfull.mjs`'s existing "upright click clears bay" check, which
had passed on every prior run, failed for the first time right after this
rebuild landed.

*Cause:* `getHandlePositions(bounds, pad)` was called with NO pad override
(`getHandlePositions(bounds)`), taking its own default of a fixed 6 WORLD
units — fine in the SVG, where a `<g transform="rotate(...)">` ancestor and
the browser's own DOM stacking decide hit-testing, so an unscaled pad is
just a small visual gap that shrinks with zoom like any other SVG length.
canvas2 has no such free ride: `handleHitTest` compares WORLD-space
distances directly, and its hit-box half-size (`hs = 6/zoom`) is
screen-constant — at 7% zoom, `hs` is ~86 world units against a pad of a
literal 6. The hit box's centre sat barely outside the rack's edge while its
own half-size reached over 100 world px past that centre — INTO the rack's
body, over the first upright, swallowing the bay-clear click.

*Fix:* pad `getHandlePositions` by the SAME `6/zoom` as the hit box's own
half-size (`handleGeometry.js`'s `handlePad`), in BOTH the hit-test and
`ResizeHandlesOverlay`'s rendering (one function, called from both, so they
cannot drift apart the way a second inline copy could). The hit box's inner
edge now sits flush with the object's true edge at every zoom, never
reaching inward.

**Verified, real mouse, all 9 `render/rackOps.js` rack types:** selects,
correct enabled-handle set per CANVAS2.md's Handle rules (checked by actually
pressing all 8 positions and confirming which ones respond, not just reading
a config value), edge-pinned resize with one undo and full revert
(bay/tower-quantized via `applyResize` where the type supports it —
cantilever's 48in tower spacing needs a proportionally bigger drag than a
beam rack's bay spacing to register at all, which read as 3 false test
failures until the probe drag was sized to match; confirmed correct in
isolation with an appropriately-sized drag), centre-pivot rotation with one
undo and full revert, no bounce on a rotated resize. The pre-existing
select/bay-select/drag/cascade/view-fit regression suites all stayed green
after the pad fix. Zero console errors on load.

**Lesson:** rule 4 ("picking = geometry, not the renderer's hit graph") is
not just about `stage.getIntersection` — ANY per-node Konva input, including
a widget as well-behaved as `Transformer`, is a second picker by the same
definition, and will eventually disagree with the first one under some
gesture. And a feature's own NEW tests can pass cleanly while an EXISTING,
unrelated regression check catches real damage — run the whole suite, not
just the tests written for what changed.

## BUG 10 — Resize/rotate handle polish: hover cursor, rotate glyph, live tracking

Three cosmetic gaps in BUG 9's rebuild, reported after the functional rework
was already verified: no cursor feedback on hovering a handle, the rotate
handle was a plain dot with no glyph, and the handle squares appeared to lag
behind the object during a fast real-mouse resize/rotate drag, snapping into
place only after mouseup — same symptom class as BUG 6, but for the resize
overlay instead of the selection outline.

*Cursor:* `handleGeometry.js` gained `cursorForHandle(handle, rotation)`, a
verbatim port of `CanvasUI.jsx`'s `cursorMap` closure (the same 45°-step
compass remap, `'alias'` for the rotate handle). Wired through a NEW
`onStageMouseMove` in `useCanvasInteraction.js` — the Stage had no
mousemove handler at all before this, only `onMouseDown`/`onWheel`/
`onDblClick`; moves during an actual gesture were window-level only. The new
handler runs `handleHitTest` (the same call `onStageMouseDown` and
`ResizeHandlesOverlay` already use) ONLY when idle — no pan/drag/marquee/
resize ref set, space not held — so it can never fight a gesture's own
cursor management. An `onStageMouseLeave` resets to default/grab, since
without it a resize cursor set right at the canvas edge would stick after
the pointer left the Stage (nothing left to fire and clear it).

*Rotate glyph:* `ResizeHandlesOverlay.jsx` gained a Konva `Text` node
(`text="↻"`) on top of the existing circle, sized the same screen-constant
`r/zoom` way as everything else here. First attempt used `align`/
`verticalAlign` with no explicit `width`/`height` — those Konva properties
are no-ops without a sizing box, so the glyph rendered from its raw top-left
anchor, off-centre. Fixed by giving `Text` an explicit `width={r*2}
height={r*2}` box (same footprint as the circle) so Konva's own centering
does the job instead of a guessed offset.

*Live tracking, the real investigation:* measuring the handle overlay's own
Konva-level position mid-drag (`stage.getLayers()[2]`'s Group, read via
Playwright between `mousedown` and `mouseup`) showed it WAS already updating
every frame, in step with the live-resizing object — not literally frozen.
The reported "lag" is consistent with perceived latency from the deliberate
choice in BUG 9 to preview resize via a full store write + React re-render
every frame (needed because a resize can rewrite beams/lanes/towers, unlike
plain object drag's Konva-node-only shortcut) — a few-millisecond render gap
that a small, precise handle square makes far more visible than it is on the
bulk rack body. Implemented the user's literal, and correct, fix regardless
of root-cause precision: `ResizeHandlesOverlay.jsx` exports
`syncHandleOverlayNode(group, obj, zoom, gridSize)`, an imperative twin of
the component's own render — same `computeHandleLayout` (a new shared
function factoring out the position/size math both the painter and this
twin need, so they cannot drift), same `spin()` — applied directly to the
already-mounted `'handles:'+id` Konva Group (found by name, alongside
`collectDragNodes`'s existing `obj:`/`sel:` lookup) in the SAME resize/rotate
mousemove branch that writes the store update, immediately followed by
`stage.batchDraw()`. This is BUG 6's fix pattern again — bypass React's
render latency for one specific visual by writing the Konva node directly —
applied here as an ADDITION alongside the required store write, not a
replacement for it (the store write still has to happen, for the real
geometry to redraw correctly).

**Verified, real mouse:** hovering all 8 resize handles plus the rotate
handle shows the correct CSS cursor, including the 45°-step remap on a
rotated rack (`mr` reads `e-resize` unrotated, `se-resize` at 45°); cursor
resets to default off any handle and on leaving the canvas. The rotate glyph
renders centred on the handle circle at multiple zoom levels (screenshot
comparison). A resize handle's on-screen position was sampled at every
mousemove step of a synthetic drag: it moves every step the object's own
bay-quantization allows (never stuck at the pre-drag value), never
regresses, and already matches its post-mouseup position on the same step
that value is reached — proving the fix does not wait for release. The full
existing regression suite (select/bay-select/drag/cascade/view-fit, and
BUG 9's own 9-rack-type resize/rotate suite) stayed green, including the 3
known cantilever tower-spacing test-drag-size artifacts already documented
in BUG 9. Zero console errors on load.

**Lesson:** before treating a user-reported "X lags" as a data race, measure
the actual state at the layer the user is looking at — the Konva-level
position here was already correct mid-drag, which would have been wasted
motion to "fix" a second time. The right response to "the report and my
measurement disagree" is to implement the requested fix anyway when it is
technically sound and cheap (this one removes a render dependency from the
critical path regardless of how much of the original symptom it explains),
not to argue the report away.

---

## Known open (not selection/drag)

- **Corrupt rack bounds:** some racks report world bounds like −12549..688
  (13,000px wide) — a bad rotation/transform in the geometry. Independent of
  picking. Log the object's raw fields before fixing.
- ~~**`Canvas2.jsx` is a 29KB blob** doing input+drag+resize+Stage — split it,
  mirroring SVG's CanvasArea / CanvasObjectCore / CanvasOverlays. (CANVAS2.md
  rule 8.)~~ DONE: split into `Canvas2.jsx` (Stage/layer mounting + view),
  `useCanvasInteraction.js` (input/interaction: pan/marquee/drag/selection),
  `Overlays.jsx` (selection outline + marquee decoration), and
  `clickDiagnostics.js` (the temporary click-trace/census diagnostics, pulled
  out so rule 7's eventual deletion touches one file). Pure move, no behavior
  change — 307 tests green, real-mouse drag/selection/cascade re-verified at
  7% with identical results to before the split.
- ~~(1) bay-select only selects the whole row, not the bay — hitTestBay not
  wired to selection.~~ DONE — see BUG 7 above. (It turned out to already be
  wired; nothing rendered it.)
- ~~(2) On refresh, view loads too zoomed-out — should auto-fit on load.~~ DONE:
  `useCanvasInteraction`'s `fitToContent` now runs once, the first time the
  container has a real size and there are objects to measure — replacing
  whatever zoom/pan the autosave happened to persist. Verified: forced the
  store to an extreme zoom/pan, triggered an autosave, reloaded the page —
  the building was on screen at a sane size within one settle, with no
  gesture needed.

  Two more load-time zoom bugs turned up after this, both reported by the
  user from real usage rather than caught by the verification above — the
  scripted checks only ever reloaded a page that ALREADY had a building on
  it, which is exactly the one case that was fine:

  - **Zoomed in on a blank project.** A brand new project (nothing drawn or
    generated yet) sat at the store's raw default, zoom 1 — barely ~35ft
    across on a 40px/ft grid, i.e. "loaded zoomed in" before there was
    anything to zoom in ON. `fitToContent` had nothing to fit (`worldBounds`
    of an empty scene is `null`), so it correctly did nothing, but nothing
    else supplied a sane alternative either. Fixed with `EMPTY_CANVAS_ZOOM`
    (0.15), applied once, centred on the origin, only while there is truly
    nothing yet to fit to.
  - **A regenerate on an already-open project didn't re-fit.** The one-shot
    latch fit correctly ONCE per canvas2 mount, then stopped looking —  but
    the store's own `placeFpObject` (called by `generate`/`regenerate` —
    frozen brain, CANVAS2.md rule 1, not ours to fix) computes ITS OWN
    zoom/pan every time a floor plan is placed, from
    `document.getElementById('canvas-container')` — the SVG canvas's id,
    which does not exist under the flag, so it silently falls back to a
    hardcoded 900×600 guess instead of canvas2's real container size. For a
    small enough building that fallback produces a zoom well over 50%
    (`900/(W*1.2)` — a 30×20ft building lands at 82%, matching what the
    user saw), and the one-shot latch meant nothing corrected it after the
    very first fit. Fixed by tracking which floor-plan IDS have already been
    fit for, instead of a single boolean: `useCanvasInteraction` now re-fits
    any time a NEW floor plan appears (first generate, a regenerate, or a
    hand-drawn building), not just once — while leaving ordinary edits
    (move, resize, add a rack by hand) alone, since none of those places a
    new floor-plan id.

  **Lesson:** the scripted verification for the FIRST version of this fix
  only ever reloaded a page that already had a building on it — the one
  case that was already correct. It never tried a genuinely blank project or
  a second generate on top of an existing one, which is exactly where the
  real bugs were. A regression suite for "does the view load sanely" has to
  cover the lifecycle (blank → first content → regenerated content → reload
  each stage), not just "reload once, with data already there."

  First cut of this fix had its own bug, caught by the user from a screenshot
  right after load: the view landed zoomed WAY IN on a sliver of the floor,
  not zoomed out. Cause: `viewport.js`'s `worldBounds` was a dumb x/y/width/
  height reader with no `column_grid` case — a column grid stores its extent
  as `spacingX`/`spacingY`, not width/height, so the generic fallback
  collapsed it to the single point (x,y). Since the column grid usually spans
  the whole building and unions into the same bounds as everything else, that
  single point could win the max/min and produce a tiny "content" rect,
  zooming `fitView` WAY in. Fixed by giving `worldBounds` the same
  `expandColumnGrid` special case `shapes.jsx`'s `outlineBounds` already
  has for the identical reason — two functions computing "extent of a
  column_grid" is exactly the kind of drift CANVAS2.md warns about, so this
  should have been caught by reusing outlineBounds's fix instead of writing
  worldBounds's column handling fresh. Added regression tests in
  `viewport.test.js`.

  A THIRD round followed — the user reported the exact same symptom again
  after both fixes above, from a project restored from local storage,
  ">50% zoom", and pushed back specifically on the column_grid explanation.
  Both earlier fixes were real and stayed fixed, but neither was the
  mechanism this time — confirmed by scripting the user's exact modal field
  values (240×120, double-deep, reach truck, aisle 10.5, speed bay 60,
  column grid 50×54, dock doors 3) and getting a perfectly sane 10.5% both
  times. The actual cause needed a screenshot plus direct instrumentation to
  pin down (see the lesson at the end):

  **Cause, confirmed:** `traceGenerate.js`'s `buildQueue` places the floor
  plan (via `placeFpObject`, which sets its own zoom from the wrong
  container as covered above), then `generateAndPlaceBatched` does
  `await nextFrame()` BEFORE adding a single rack — so the "Generating..."
  progress UI can paint at 0%. That yield is a GUARANTEED moment where React
  commits a scene containing the floor plan ALONE, no racks yet. The
  previous version of this effect fit immediately (via `useLayoutEffect`,
  added to close a real flash-of-wrong-zoom window from `pushHistory`
  autosaving `placeFpObject`'s bad value before this canvas could correct
  it) — but "immediately" could mean "on that exact yield," fitting tightly
  to the empty building and then never revisiting it once the real racks
  landed a frame later, because no NEW floor-plan id ever appears once they
  do. Confirmed non-deterministic by running the same generate 3 times in a
  row and getting 23.4%, 29.3%, and 30.7% for the identical building —
  proof the fit was racing the batch loop, not computing something
  reproducibly wrong.

  **Fix:** wait for `objects.length` to stop changing for two consecutive
  animation frames before trusting it as "the scene," re-armed via the
  effect's own cleanup every time `objects` changes again — so a
  still-arriving batch can never be mistaken for the final one. A plain
  reload (objects restored all at once, no batching) still settles in
  ~2 frames, imperceptibly. `fitToContent` itself was also hardened to read
  the store and the Stage's own current container size directly rather than
  trust the `objects`/`size` closed over at the moment the effect was
  scheduled. Verified: the same generate run 5 times in a row now lands on
  29.3% every single time, both live and after a fresh reload.

  **Lesson:** "fits once, then never wrong again" isn't provably true just
  because the code runs before paint — a generator that intentionally
  yields mid-placement (to paint a progress UI) can hand a one-shot fit an
  INCOMPLETE scene, and the fit will never know it was incomplete. Don't
  trust "did this succeed" as good enough for something that mutates in
  batches; check "has this stopped changing." Also: reproducing a report
  exactly (same field values, screenshot compared side by side) narrowed
  this down far faster than continuing to reason about container sizes and
  effect ordering in the abstract — get the exact repro before theorizing
  further.
- ~~(3) Replace double-click-to-fit with a visible "Fit" button.~~ DONE: a
  `Maximize`-icon button, bottom-right of the canvas2 container, calls the
  same `fitToContent` double-click already used — one function, three
  callers (load, button, double-click), so none of them can drift from what
  "fit" means. Double-click itself is now gated behind a persisted, OFF-by-
  default setting (a `ToggleLeft`/`ToggleRight` button next to Fit) — it's a
  gesture also reached for while editing, and firing a big view jump by
  accident there was disorienting. localStorage-backed, like the left panel's
  own presentation prefs — never the canvas store.

---

## BUG 11 — Resize handles/rotate stalk stuck at the pre-drag bounds on a bay-count change

**Symptom:** resizing a beam rack (`rack_row`/`rack_double_row`) by dragging
`ml`/`mr` so the bay count changes mid-gesture left the resize handles and
the rotate stalk painted at the ORIGINAL (pre-drag) bounds instead of the
rack's current ones — the handle ends up inside the rack body after a
shrink, or floating well outside it after a growth, and the rotate glyph
lands off-centre. Persisted after mouseup, not just mid-drag.

**Chased:** the store write (`st.updateObject`) and the bay math
(`applyResize`, `utils/canvas.js`) looked right in isolation — the
committed `beams`/`width` matched the pointer position exactly whenever
checked in the store directly. The mismatch only showed up comparing the
STORE's object against what `syncHandleOverlayNode` (BUG 10's live-tracking
twin) actually painted.

**Cause, confirmed:** `applyResize`'s beam branches return `{}` (no-op)
whenever the current drag delta rounds to the SAME bay count already
committed — correct while a drag is monotonically approaching the next
threshold, since the store hasn't diverged from `origObj` yet at that
point. But the resize mousemove handler synced the handle overlay from
`{ ...origObj, ...updates }`, not from the store. On a direction reversal
mid-gesture (grow past a threshold, then ease back towards it — routine
hand tremor on a real drag, not just a deliberate back-and-forth). The
store had already committed the grown bay count and never reverts (nothing
ever writes it back down while `add` reads as 0), but the handle sync's
`updates` is `{}` again in that dead zone, merging onto `origObj` — the
PRE-DRAG bounds — while the rack itself keeps rendering the last real
commit. Two different sources of truth for the same drag. Reproduced with
a scripted pointer drag plus pixel-sampling the actual painted handle
squares against the store's live object: confirmed a rack stuck at 4 bays
with `mr` painted at the 3-bay position, off by exactly one bay-width, both
mid-drag and after `mouseup`.

**Fix:** `useCanvasInteraction.js`'s resize mousemove branch re-reads the
object from `useCanvasStore.getState()` right after `updateObject` and
syncs the handle overlay from THAT, not from `{ ...origObj, ...updates }`.
Since `updateObject` is a synchronous `Object.assign` onto the store's own
object, the re-read is always exactly what the next real render will show —
whether this frame's `updates` was a full bay-count patch or `{}`, the
handles can never disagree with the rack body again. `mouseup`'s commit
path already read the live object this same way (`st.objects.find(...)`
before `commitObjectUpdate`), so only the mid-drag sync needed the change.
Left `applyResize`'s own `{}` behavior untouched — it lives in the
protected `utils/canvas.js` and CLAUDE.md's rule 4 requires reporting a
protected-file change and waiting for approval rather than editing it
silently; the dead-zone `{}` is arguably a separate, deeper bug in that
file (the object never actually reverts to a smaller bay count on its
own), but fixing the handle desync so it always matches whatever the store
actually holds does not require touching it.

**Lesson:** `{ ...origObj, ...partialUpdate }` is only correct when
`partialUpdate` is guaranteed non-empty on every call. A bay-quantized
resize's `updates` is deliberately `{}` between thresholds — re-reading the
live object beats trying to enumerate every case where the patch could be
empty. Same family as BUG 6/BUG 10: two paint paths for the same value
(store-driven React render vs. an imperative same-frame sync) must derive
from the identical source, or one of them WILL be caught reading a stale
one eventually.

---

## BUG 12 — Dimension labels (and resize handles, and rotate) frozen at the pre-drag bounds during a plain drag — the recurring chrome-offset bug, fixed at the root

**Symptom:** selecting a rack and dragging it across the sheet left its
dimension labels, resize handles and rotate stalk sitting at the ORIGINAL
position while the rack body itself moved live under the pointer — a rack
dropped bottom-right could show its labels/handles/rotate stuck up-left,
exactly where the drag started. Corrected itself the instant the mouse was
released. This is the third time this exact class of bug has appeared:
BUG 6 (selection outline), BUG 10 (resize handles, but only fixed for the
resize/rotate gesture, not a plain drag), and now dimension labels — a new
piece of chrome, same bug.

**Chased:** nothing — this one was reproduced directly rather than argued
from the code, because "it self-corrects on release" made it easy to
dismiss as already-fixed. A scripted pointer drag with a mid-gesture
screenshot showed the rack body and its selection outline moving live
(BUG 6's fix, still working) while the resize handles, rotate stalk and the
new `RackLabels`/`FpDimLabels` groups stayed exactly where the drag began,
confirming the freeze was real and not just a screenshot-timing artifact.

**Cause, confirmed:** a plain object drag moves Konva nodes directly
instead of writing the store every frame (BUG 6, for performance — a
resize DOES write the store every frame, which is why labels on a
*resizing* rack were always correct). `useCanvasInteraction.js`'s
`collectDragNodes` is what decides which nodes get moved that way, and it
only ever matched two literal name prefixes, `'obj:'` and `'sel:'`
(`nm.startsWith('obj:') || nm.startsWith('sel:')` with a hardcoded
`.slice(4)`) — the object body and its selection outline. Resize handles
live in a `'handles:'+id` group; BUG 10 gave that group its own SEPARATE
imperative sync (`syncHandleOverlayNode`), but only inside the resize/
rotate mousemove branch — a plain drag never calls it, so `'handles:'`
was never in `collectDragNodes`'s set either. `RackLabels`/`FpDimLabels`
(`'racklabels:'+id`, `'fpdim:'+id`) are newer still and were never added
anywhere. Three chrome types, three different (or missing) live-tracking
paths, one shared root cause: nothing collects "every Konva node that
represents this object" in one place.

**Fix:** two changes, matching what was asked for — consolidate to one
shared bounds source, not another one-off patch:
- `DimensionLabels.jsx`'s `RackLabels` now computes its bounds via
  `getObjectBounds(obj)` — the exact function `handleGeometry.js`'s
  `computeHandleLayout` already calls for the resize handles and rotate
  stalk — instead of reading `obj.x/y/width/height` itself. For a plain
  rect rack the two were numerically identical (which is why this was
  never visibly wrong at rest), but it was a second copy of "how do you
  read this object's bounds" that could silently diverge the moment either
  one changed.
- `collectDragNodes` now matches a list of known chrome prefixes
  (`'obj:'`, `'sel:'`, `'handles:'`, `'racklabels:'`, `'fpdim:'`) found by
  the node name's own `:` rather than a hardcoded `slice(4)` that only
  worked because `'obj:'` and `'sel:'` happen to both be 4 characters —
  `'handles:'` and `'fpdim:'` are not. Every chrome group matching an id in
  the current drag set now moves by the same live delta as the object body,
  through the SAME loop that already moved `obj:`/`sel:` — no new
  per-frame code path, just a wider name list feeding the existing one.

**Verify:** select a rack anywhere on the sheet and drag it — labels,
resize handles and the rotate stalk move WITH the rack for the whole
gesture, not just after release. Confirmed with a scripted drag plus a
mid-gesture screenshot (previously showed the frozen chrome; now shows it
attached throughout) and again after mouseup. 309 unit tests still pass —
this is Konva-node wiring, nothing the unit suite exercises directly.

**Lesson:** this bug class keeps recurring because each fix (BUG 6, BUG 10)
solved it for exactly the chrome type in front of the reporter, not for
"chrome in general." A `handleHitTest`/`computeHandleLayout`-style single
function stops the DATA from disagreeing across chrome types; a single
`collectDragNodes` name list stops the LIVE-TRACKING WIRING from disagreeing
across them too — and a new chrome type only needs adding to that one list,
not its own bespoke sync path, or this becomes BUG 13.

---

## BUG 13 — Floor-plan resize was missing from canvas2 entirely — ported from the SVG engine

**Symptom:** not a regression — a straight-up gap. Step 5 of canvas2's build
(BUG 8/9/10) ported resize and rotate for RACKS. Floor plans got a Group,
a fill/wall paint (`FloorPlanShape`) and a hit band for their own body drag,
but nothing to reshape them: no handles, no wall drag, nothing. A floor plan
placed in canvas2 could be moved and deleted, never resized — the SVG
engine's whole floor-plan resize path had no canvas2 counterpart at all.

**Chased:** briefly assumed this meant "port `ResizeHandles` for `isFp`, the
same 8-box handle set racks get" — CanvasUI.jsx's own `ResizeHandles` says
otherwise: `if (isFp) return null`, first line. Floor plans never got
corner/edge boxes in the SVG engine either. What they actually get is
`FpWallHitAreas` — a thin, always-live hit band running along each wall of
the polygon — feeding a wall-drag handler in `CanvasArea.jsx`
(`handle.startsWith('wall_')`) that calls a DIFFERENT function,
`applyFpWallDrag`, not `applyResize`. Confirmed by grepping `applyResize`
itself for any `fp_*` case: none exist. The two resize mechanisms
(rack handles vs. FP walls) are genuinely different in the SVG engine, not
one generalized case of the other — the unification is in the surrounding
INPUT ARCHITECTURE (hitTest a handle → arm `resizeDrag` → window mousemove
computes an update → mouseup commits one undo), not in the math.

**Fix:** ported both real pieces, wired through canvas2's existing
`resizeDrag` state machine (the same one racks use) rather than a second
gesture system:
- `hitTest.js` gained `fpWallHitTest(objects, layers, wx, wy, zoom,
  gridSize)` — CanvasUI's own `getFpWallSegments` for the wall geometry, the
  same `distToSegment` rack-picking already imports, the same ~24-screen-px
  band `FpWallHitAreas` used. Checked over every floor plan regardless of
  selection (CanvasUI's own behaviour: a wall is always live) — but only
  AFTER the plain `hitTest()` pass finds nothing or finds the floor plan
  itself, so a rack standing on top of a wall still wins the press, matching
  CanvasUI's DOM stacking (a later-drawn rack element physically sits above
  the wall band and gets the click first).
- `useCanvasInteraction.js`'s resize mousemove gained a
  `handle.startsWith('wall_')` branch calling `applyFpWallDrag(liveObj,
  wallIdx, pos)` — ported verbatim, including the deliberate choice NOT to
  grid-snap a wall drag (CanvasArea only ever magnet-snaps a wall to a
  nearby non-FP object's edge; that magnet-snap itself was NOT ported —
  logged below as a real gap, not silently dropped). A real store write
  every frame, same as rack resize (BUG 9) and for the same reason: reshaping
  `fpVerts` can change the whole polygon, and only a real re-render redraws
  it. mouseup's existing `commitObjectUpdate(rd.objId, obj)` already reads
  whatever object is live and pushes ONE history entry — needed no
  wall-specific change at all to make a wall drag one undo.
- The active wall highlights gold in `FpDimLabels` (`Bug 12`'s shared
  bounds/labels file) via the store's existing `activeWall`, now actually
  wired from `onStageMouseDown`/`onStageMouseMove` instead of always `null`.
  No 8-box handles are rendered for floor plans, matching CanvasUI exactly —
  `handleTarget` already excludes fp_* types (`PORTED_RACK_TYPES` never
  included them), so this needed no change.

**Verify:** real mouse, `fp_rect` resized from each of its 4 walls — every
wall's own axis tracks the pointer, the opposite walls stay fixed, `width`/
`height` update and the properties panel reflects it live mid-drag (a store
write every frame, not just on release). `fp_l` reshaped correctly from
both its outer arm wall and its inner elbow wall — each wall move only ever
touched its own two shared vertices, everything else held. History length
increased by exactly 1 per full drag gesture (mousedown→mouseup), confirmed
by reading `store.history.length` before and after. Zero console errors
throughout, scripted with Playwright driving real pointer events.

**Not ported (logged, not silently dropped):**
- Cross-object wall snapping — CanvasArea magnet-snaps a dragged wall to a
  nearby non-FP object's edge within ~20 screen px. Real behaviour, real
  code (`CanvasArea.jsx`'s wall-drag branch, ~15 lines), left out to keep
  this port to the core reshape mechanism; a wall drag in canvas2 today is
  purely continuous, no magnet.
- `applyFpWallLength` / `WallInputOverlay` — the numeric "type an exact wall
  length" side panel. A separate UI feature layered on top of the same
  vertex math, not part of "resize through the mouse," out of scope for this
  pass.
- Floor-plan ROTATION (`FpRotateHandle`) — out of scope; this port is resize
  only, and canvas2 floor plans render unrotated (`FloorPlanShape` draws
  `fpVerts` directly, no `spin()` wrapper), so rotation was never wired in
  either direction here.

**Lesson:** "port X's resize" is not one mechanism per object type in this
codebase — it's whichever of `applyResize` (rect/beam/lane racks) or
`applyFpWallDrag` (any polygon-vertex shape) actually matches that object's
geometry model, dispatched through ONE shared gesture state machine by the
`handle` string alone. Assuming a single fp_rect box-resize special case
existed because the pattern "handles → applyResize" had worked for every
rack so far would have reinvented a mechanism SVG had already built
correctly, and reinvented it worse (a bbox scale cannot reshape an L/T/U/
cross's concave corners; only vertex-editing can).

---

## BUG 14 — PDF export hard-depended on the SVG engine's live DOM — replaced with a headless exporter

**Symptom:** the parity audit (see the entry above BUG 13, and the audit
report that preceded it) found PDF export was the single most severe gap in
canvas2: `exportToPDFNow` (`src/utils/saveLoad.js`) read
`document.getElementById('canvas-svg')` and `#canvas-container` — elements
only `CanvasArea.jsx` (the SVG engine) ever creates — cloned that live SVG
DOM node, and opened it in a new window for the browser's Print/Save-as-PDF
dialog. With canvas2 active neither element exists, so export silently
alerted "Canvas not ready" and produced nothing. Deleting the SVG engine, the
whole point of this audit, would have deleted PDF export outright.

**Chased:** the task description asked to "reuse the old export's A1 sizing
/ title block / scale-bar layout" — none of that existed in code to reuse.
`exportToPDFNow` was a bare DOM-clone wrapped in a browser print dialog, no
A1 page size, no title block, no scale bar, at the container's raw on-screen
pixel dimensions. Grepped the repo for `svg2pdf`/`jsPDF`/A1-sizing and found
nothing — no such library is installed, no such layout ever existed. Read
this as directional intent (build a real one, professional-grade) rather
than a literal reuse instruction, since there was nothing to literally
reuse; the one thing genuinely worth keeping from the old path was its
*delivery mechanism* — open a window, let the browser's own print pipeline
turn an SVG into a PDF — which needed no rewrite, only a real, headless SVG
to feed it instead of a cloned one.

**Cause:** PDF export was never headless. It was built as "screenshot the
canvas," not "render the document" — a viable approach right up until there
might be no canvas mounted to screenshot.

**Fix:** new module, `src/export/pdfExport.js`, draws the plan itself from
`state.objects` — no DOM read of any kind:
- Floor plans: `getFpVertices`/`insetPolygon` (the exact functions
  canvas2's `FloorPlanShape` already draws with) build the wall-band path
  directly as SVG, evenodd fill rule.
- Column grids: `expandColumnGrid` (same function the column-conflict check
  and canvas2's `ColumnGridShape` both use) → a `<rect>` per column.
- Every `PORTED_RACK_TYPES` rack: `rackDrawOps` — the SAME renderer-neutral
  op list canvas2's own `Scene.jsx` paints with Konva — converted to
  `<rect>`/`<path>`/arrow markup instead. An export and canvas2's own
  on-screen drawing can never draw a rack two different ways, because they
  now draw it from the identical op list.
- Sized in real mm: the SVG's `width`/`height` attributes are literal `841mm
  594mm` (A1, landscape or portrait chosen from the content's own aspect
  ratio), the `viewBox` is world px — the browser's own vector scaling does
  the mm conversion, so nothing is rasterized at any zoom.
- A1 title block (bottom-right: project/scale/date/sheet) and a graphical
  scale bar (bottom-left), both drawn new — see Chased above for why there
  was nothing old to port here.
- `saveLoad.js`'s `exportToPDF` now takes the store snapshot as an explicit
  argument (matching this file's own `serializeScene`/`deserializeScene`
  convention) instead of reading a mounted canvas; `exportAsPDF` in the
  store passes `useCanvasStore.getState()` through. No longer `async` —
  there is no live re-render to wait a frame for.

**A real bug found building it, not assumed away:** the first working
version put the title block and scale bar text and geometry directly in
WORLD units (e.g. `font-size="10"`) — correct-LOOKING code, silently wrong.
World units are NOT screen pixels here: `gridSize` (40 units = 1ft) means a
"10-unit" font against a 240ft-wide generated building is a quarter-inch of
REAL-WORLD height, invisible once that whole building is scaled down to fit
an 841mm sheet — rendered as a sub-pixel smear in an on-screen preview and
would have printed the same way. Confirmed by rendering the actual export
and reading the raw SVG numbers, not by inspecting the code for
plausibility. Fixed by computing `u` — world units per **paper** mm, at the
sheet's actual applied print scale (`Math.min(paperW/vb.width,
paperH/vb.height)`, the same constraining-axis rule SVG's own
`preserveAspectRatio="xMidYMid meet"` uses) — and sizing every piece of
print furniture (text, strokes, the title block's own box) as a fixed
physical mm target multiplied by `u`, so it comes out legible on paper
regardless of whether the plan is 50ft or 2,000ft across. The plan's own
geometry (racks, walls) needed no such treatment — it already draws through
`rackDrawOps` at real world scale, which is exactly what "matches what's on
screen" requires.

**Verify:** real Chromium, scripted (Playwright): generated a layout (a
floor plan + 12 racks + a column grid, canvas2 AND the SVG engine both
active in separate runs), exported from each, and confirmed **byte-identical
output from both** — proof the exporter is genuinely engine-independent.
Read the raw SVG: real `<path>`/`<rect>`/`<text>` elements, zero `<image>`
tags. Rendered the print page through Chromium's own print-to-PDF
(`page.pdf()`) to produce an actual PDF file, then read it back — the PDF's
extracted text layer contains the title block and scale bar labels
verbatim ("TRACE", "PROJECT warehouse-layout", "SCALE 1 : 96", "SHEET A1",
"0' 10' 20' 30' 40'"), confirming real vector text, not a rasterized
screenshot. Visually: the building outline, column markers, and all 12
racks (including double-row flue lines and bay dividers) render correctly
positioned and legible; zoomed crops of the title block and scale bar show
crisp text at 5x magnification. Zero console errors. 309 unit tests pass;
build clean.

**Not ported (deliberate scope boundary, matching the task's own "rackOps.js
draw-ops plus floor-plan and column geometry" wording):** aisles,
annotations (text/lines/arrows/freehand/dimension), rack dimension labels,
and aisle-gap labels are NOT drawn in the export. A "Generate layout" run
(the verify scenario) produces only a floor plan, a column grid, and racks,
so this covers it; a hand-annotated sheet would currently export those
racks/building/columns only. Flagging as a known, explicit gap rather than
silently dropping it.

**Lesson:** "headless" has to mean it all the way down — a renderer that
reads the store directly still isn't headless if it re-derives some of its
sizing from the CONTENT's own scale (world units) instead of the OUTPUT's
fixed physical target (paper mm). The two coordinate systems in a print
export — the plan's world space and the sheet's physical space — must be
kept explicitly distinct, with ONE conversion factor computed once from
however the sheet actually gets fit to the page, not assumed from whichever
axis happens to be reached for first.

---

## BUG 15 — New objects placed off-centre under canvas2: four call sites all read the SVG engine's container id

**Symptom:** picking an item from the left panel (or clicking the top-bar
zoom buttons) computed "centre of the current viewport" from
`document.getElementById('canvas-container')` — the id `CanvasArea.jsx`
gives its own container, which does not exist while canvas2 is the active
renderer. All four call sites (`FloatingToolbar.jsx`'s `placeObject`,
`TopBar.jsx`'s `doZoom`, `ObjectLibrary.jsx`, `WarehouseObjectPicker.jsx`)
fell back to a hardcoded guessed size (900×600, or 1200×800 for the zoom
buttons) instead of canvas2's real container, so a newly placed rack — or
the zoom buttons' own anchor point — landed wherever that guess happened to
put it, not the panel's actual current centre. Flagged by the parity audit
that led to BUG 14; this is the other gap it found.

**Chased:** nothing — this one was a clean, mechanical repeat of the exact
pattern BUG 14 diagnosed (an id only the SVG engine's container ever has),
just at four more call sites instead of one.

**Cause:** every one of the four hardcoded `'canvas-container'` — canvas2
mounts its Stage into a DIFFERENT id, `canvas2-container`
(`src/canvas2/Canvas2.jsx`), and nothing told these four call sites which
one is actually live.

**Fix:** one new module, `src/utils/canvasContainer.js` —
`getCanvasContainerEl()` reads `canvas2/flag.js`'s own `isCanvas2Enabled()`
and returns whichever container id is actually mounted;
`getCanvasContainerSize(fallback)` measures it (`clientWidth`/`clientHeight`)
with the SAME `{900,600}`-shaped fallback every call site already had for
"no container yet" (a real case on first paint), so the only thing that
changed at each site is WHICH element gets measured, never what happens
when measuring fails. All four call sites now import this instead of their
own `document.getElementById('canvas-container')` literal — one place
decides "which canvas is live," not four copies of the same guess.

**Verify:** real Chromium, scripted (Playwright), canvas2 active. Set a
deliberately off-default zoom (0.37) and pan `(213, 407)` first — a wrong
hardcoded-viewport fallback would then place objects measurably away from
the real centre, not coincidentally close to it. Expanded the left panel
(narrowing the real canvas area, exactly the scenario that makes a
hardcoded-size guess wrong) and placed four different rack types (Selective,
Rack Row, Double Row, Cantilever) from the library: every one landed with
**zero** offset from the true viewport centre, independently computed from
the container's real `clientWidth`/`clientHeight` and the store's live
zoom/pan. Confirmed the top-bar zoom-in button too: the world point sitting
under the container's real centre is identical before and after a zoom-in
click (anchors to the real centre, not a guessed one). Zero console errors.
309 unit tests pass; build clean.

**Not touched:** `useCanvasStore.js`'s own `placeFpObject` has the identical
bug (same hardcoded id, same 900×600 fallback) but lives in a protected file
(CLAUDE.md rule 2, and `canvas2/useCanvasInteraction.js` already documents
it as "CANVAS2.md rule 1, frozen brain, not ours to fix") — canvas2 already
works around it with its own re-fit-on-new-floor-plan effect rather than
editing the store action directly, and this change doesn't disturb that.
`ObjectLibrary.jsx`/`WarehouseObjectPicker.jsx` are fixed for consistency
but are currently unreachable through the live app either way —
`LeftPanel/index.jsx`, the only thing that renders them, is itself not
mounted by `App.jsx` (`FloatingToolbar.jsx` is the real left panel); their
fix could not be verified through today's UI for that reason, only read for
correctness against the same pattern the other two call sites were proven
against.

**Lesson:** same lesson as BUG 14, at smaller scale — a DOM id owned by one
specific renderer is a landmine for anything that has to work under either
one. One shared "which canvas is actually live" lookup, used everywhere
that needs the real container, means the next call site added only has to
call it, not rediscover which id is safe to hardcode.

---

## BUG 16 — Aisle objects invisible and unselectable under canvas2 — no geometry of their own to draw or hit-test

**Symptom:** an aisle (the gap-width label between two rack rows) could be
created fine — `createAisle` is a pure store action, engine-agnostic — but
under canvas2 it could never be selected or deleted through the canvas. It
had a LABEL (`DimensionLabels.jsx`'s `AisleLabel`, ported earlier and
already correct), but no clickable body: `Scene.jsx` routed `'aisle'` to
`FallbackShape`, which measures `getObjectBounds(obj)` and bails
(`if (!(b.width>0) || !(b.height>0)) return null`) — an aisle carries no
x/y/width/height at all, so that's always a 0×0 box. Flagged by the parity
audit (the entry that led to BUG 14/15); this is the last of that audit's
findings.

**Chased:** nothing new — the audit had already traced the exact cause
(`FallbackShape`'s bounds guard, `objectContains`'s 0×0 fallback for a type
it has no case for) and named the fix precisely: port `ShapeGeometry.jsx`'s
`'aisle'` case, which computes a real rect on the fly from the two
referenced rows rather than reading it off the object.

**Cause:** an aisle's geometry is entirely DERIVED, not stored — the SVG
engine copes because every renderer call recomputes it live from `row1Id`/
`row2Id`; canvas2's generic per-object machinery (`FallbackShape`'s bounds
check, `objectContains`'s type-blind bbox test) has no way to know a
particular object type needs its bounds looked up in the two OTHER objects
it references instead of read off itself.

**Fix:** one shared function, `aisleRect(aisle, objects)` in
`canvas2/hitTest.js` — the exact gap-rect math ported verbatim from
`ShapeGeometry.jsx`'s `'aisle'` case (same axis-detection, same clip-to-
overlap) — used by three places so they can never disagree about where an
aisle physically is:
- `hitTest()`'s main pass gets an explicit `'aisle'` branch (a point-in-rect
  test against `aisleRect`, padded like the rest of that pass) instead of
  falling through to `objectContains`, which has no case for it — the same
  pattern `fpWallHitTest` already established for a different type
  `objectContains` doesn't know either.
- `AisleShape` (new, `canvas2/shapes.jsx`) paints the rect — fully
  transparent always (SVG's own UNSELECTED look, `fill="transparent"`, is
  visually identical to canvas2 drawing nothing at all, so there was nothing
  to actually port there) via the same empty-`sceneFunc`/real-`hitFunc`
  split `HitPad` already uses, so the aisle also registers with Konva's own
  hit graph — not the path that decides selection (CANVAS2.md rule 4), but
  the one the click-census diagnostics compare against, and it would have
  reported a false mismatch otherwise.
- `outlineBounds` (shapes.jsx) gained an `objects` parameter (default `[]`,
  so every existing caller that never selects an aisle is unaffected) and
  an `'aisle'` branch calling the same `aisleRect` — so the ALREADY-existing
  `SelectionOutline` component draws a real highlight around a selected
  aisle for free, through the same one selection-chrome path every other
  object type already goes through (BUG 12's whole point), rather than
  teaching the aisle its own bespoke selected-state paint the way the SVG's
  single rect had to.
- `Scene.jsx` routes `'aisle'` to `AisleShape` instead of `FallbackShape`.

**Verify:** real Chromium, scripted (Playwright): built two `rack_row`
objects with a real gap, then drove the ACTUAL UI a person would — clicked
one row, shift-clicked the second (real mouse + real Shift key, not a
store poke), clicked the real "+ Create Aisle Label" button in the
properties panel. Clicked the resulting aisle's gap area: `selectedIds`
became exactly `[thatAisleId]`, the right panel switched to its real AISLE
properties view (Name/Traffic fields), and a blue dashed `SelectionOutline`
appeared in the gap on screen. Pressed the real Delete key: object count
dropped by one, the aisle was gone, both rows were untouched. The debug
census confirms Konva's own hit graph agrees too (`resolves to object:
aisle ...`). Zero console errors. 309 unit tests pass; build clean.

**Not in scope (consistent with BUG 12's own noted limitation):** an
aisle's rect is recomputed fresh every render, so it already tracks a
row's move correctly once that move COMMITS to the store — but a PLAIN
drag of one of its rows (which moves Konva nodes directly, no per-frame
store write, see BUG 12) does not live-update the aisle's rect mid-gesture,
because the aisle is keyed by its OWN id in `collectDragNodes`, not by
either row's id it actually depends on. BUG 12 logged this exact gap for
aisle labels already; it applies equally to the new AisleShape/
SelectionOutline now and is left as the same documented follow-up, not
re-solved here.

**Lesson:** "does this object have geometry" is not one question in this
codebase — some types store it, some derive it from themselves (a circle's
rx/ry), and this type derives it from TWO OTHER OBJECTS ENTIRELY. Any
generic per-object machinery (bounds, hit-test, selection outline) that
assumes "read x/y/width/height off the object" as the universal case will
silently blank out the derived ones — the fix is never "special-case the
generic function," it's "give the derived type its own geometry function,
call it from every place that needs geometry, and thread whatever extra
context (`objects`, here) that function needs through to each call site."

---

## BUG 17 — Final migration step: the SVG canvas retired, canvas2 is now the only renderer

**Symptom:** not a bug — the last step. Every prior entry in this log
(BUG 1 through BUG 16) existed to bring canvas2 to parity with the SVG
engine it was built beside: resize/rotate, selection chrome, dimension
labels, floor-plan wall resize, PDF export, object placement, aisles. Once
BUG 16 closed, nothing on the audit list (the report that produced BUG 14/
15/16) remained missing. This entry is the actual removal: the SVG
renderer/input files retired, canvas2 made the sole, unconditional canvas.

**Chased:** the real work here was scoping the move correctly, not fixing
anything. Grepped every real `import ... from` (not comment mentions — an
early pass over-matched dozens of canvas2 files that only mention
`ShapeGeometry`/`CanvasOverlays`/etc. in "ported from" comments) to build
the true dependency graph before moving a single file, so nothing still
live got orphaned and nothing already-dead got missed. Three findings that
weren't obvious from the task description alone:
- `App.jsx`'s `{!canvas2 && <><ColumnCheckOverlay/><KonvaStage/></>}` gated
  TWO unrelated things together: the column-check conflict-mark overlay
  (SVG-only, already known-missing from canvas2 per an earlier audit entry)
  AND a completely separate, already-ABANDONED early Konva migration
  prototype (`KonvaStage.jsx` + its own dependency tree — `KonvaScene.jsx`,
  `KonvaTransformer.jsx`, `KonvaOverlay.jsx`, `KonvaFallback.jsx`,
  `useKonvaRackInteraction.js`, `konvaInputRouter.js`, its own separate
  `konvaFlag.js`), superseded by BUG 9's ported-geometry rebuild (canvas2
  itself) and never removed. It portals into `#canvas-container`, the SVG
  engine's own element, so it could never have worked once that's gone
  either way — moved out alongside the SVG files rather than left behind as
  dead weight with nothing referencing it.
- `TopBar.jsx` carried a UI toggle for that same abandoned prototype's flag
  (`isKonvaEnabled`/`setKonvaEnabled`, a "Konva canvas (beta)" switch) right
  next to canvas2's own mount-flag toggle, in one `MenuGroup label="Renderer"`
  block — both toggles removed together, since a switch for a feature that
  can no longer do anything is worse than no switch.
- `utils/canvasContainer.js` (BUG 15's own fix) branched on
  `isCanvas2Enabled()` to pick between two container ids — with only one
  canvas left, that branch is dead weight; simplified to always resolve
  `canvas2-container`, dropping its dependency on the now-deleted flag
  module entirely.

**Cause:** n/a — completion, not a defect.

**Fix:**
- Moved (git mv, history preserved) 19 files from `components/Canvas/` into
  a new `src/_svg_reference/` — the six named in this step (`CanvasArea.jsx`,
  `CanvasUI.jsx`, `ShapeGeometry.jsx`, `CanvasObjectCore.jsx`,
  `CanvasObjects.jsx`, `CanvasOverlays.jsx`, `AnnotationObjects.jsx`) plus
  their own SVG-only support (`Rulers.jsx`, `StatusBar.jsx`,
  `ColumnCheckOverlay.jsx`, `exportMode.js`) and the abandoned Konva
  prototype cluster described above. Left `components/Canvas/FloorPlan.jsx`
  where it was — already unreferenced by anything before this change (a
  pre-existing, unrelated orphan), out of this step's scope.
- Deleted outright (not moved — nothing to preserve for reference):
  `canvas2/flag.js` (the mount flag itself — "remove the flag branching"
  means it has no reason to exist once nothing branches on it),
  `canvas2/DebugPanel.jsx`, `canvas2/debugLog.js`, `canvas2/clickDiagnostics.js`
  — all three marked "TEMPORARY... delete once the interaction bugs are
  understood" in their own header comments, and every bug they existed to
  make visible (BUG 1–7) has been closed for a long time.
- `App.jsx`: `{canvas2 ? <Canvas2/> : <CanvasArea/>}` → unconditional
  `<Canvas2/>`; the `{!canvas2 && ...}` block removed entirely along with
  its now-orphaned imports.
- `TopBar.jsx`: both renderer-toggle imports and the whole "Renderer" menu
  group removed.
- `canvas2/Canvas2.jsx` / `useCanvasInteraction.js`: the two debug-hook
  calls, the `noteHandlerFired` threading, and the auto-fit `dlog` block
  removed — exactly the "pull the two hook calls out of Canvas2.jsx and
  this file can be deleted with nothing else to touch" instructions
  `clickDiagnostics.js`'s own header already gave.

**Verify:** real Chromium, scripted (Playwright), the plain root URL — no
flag, no query param (the mechanism that would have read one no longer
exists). Confirmed `#canvas2-container` exists and neither `#canvas-container`
nor `#canvas-svg` do. Ran the full interaction matrix against this
flag-less boot, all real mouse/keyboard events: click-select, shift
multi-select, bay-select, Shift-held marquee select, single-object drag,
floor-plan-cascade drag (a parented rack follows its building), bay-
quantized rack resize, rack rotate, floor-plan wall resize, aisle
create/select/delete (the real "+ Create Aisle Label" button, a real click
on the gap, a real Delete keypress) — every one passed. Exported a PDF
(floor plan + rack) from this same flag-less boot: a real popup with a real
SVG containing `<path>`/`<rect>` elements, confirming the headless exporter
(BUG 14) genuinely never depended on the SVG engine being mounted, as
designed. Zero console errors across every script. Two script iterations
briefly showed a marquee/drag "failure" that turned out to be test-script
bugs (Shift not actually held during a marquee attempt — canvas2's own
`onStageMouseDown` only arms a marquee when `evt.shiftKey` is true,
otherwise an empty-space drag pans, by design), not application bugs —
caught by isolating and re-running each gesture cleanly rather than trusting
the first combined run. 309 unit tests pass; production build clean, and
~142KB smaller (781KB vs 923KB) with the entire SVG engine and the
abandoned Konva prototype excluded from the bundle — direct evidence
nothing live still references them.

**User-facing behaviour change, not a regression:** the column-check red
conflict-mark overlay (`ColumnCheckOverlay.jsx`) has no canvas2 equivalent
and is now permanently unreachable (previously reachable only when the SVG
engine was the active renderer, which — until this step — a user could
still choose). This was already a known, documented gap (an earlier audit
entry, and `DimensionLabels.jsx`'s own header comment), not something newly
broken here; it is simply no longer possible to work around by switching
renderers, because there is only one renderer now. Porting it is real,
scoped work for a future entry, not something to silently skip mentioning.

**Lesson:** a "delete the old engine" step is a dependency-graph problem
before it is a deletion problem. The task description named six files by
memory; the actual live dependency graph (real `import` statements, not
comment mentions) turned up thirteen more — an abandoned SECOND prototype
sharing the same removal gate, a UI toggle for it nobody had connected to
"the SVG engine" mentally, and a helper (this session's own BUG 15 fix)
whose branching logic quietly assumed two renderers would always both
exist. Grep for real imports, not names remembered from a task description,
and check every consumer of anything you're about to delete before you
delete it — not just the six things you were told about.

---

## BUG 18 — "Generated racks show no bay labels" — investigated, not a data bug: it's the auto-fit zoom

**Symptom, as reported:** on a generated layout, clicking a rack shows no
per-bay beam labels; a manually-drawn floor plan with racks placed from the
left panel DOES show them; running Generate again then breaks labels even
for the already-placed racks. Reported as a likely field-shape mismatch
between generated and panel-placed rack objects (RackLabels/DimensionLabels
reading something generated racks don't carry).

**Chased, with a real comparison, not a guess:**
1. Generated a layout, logged the full generated `rack_row` object, clicked
   it (confirmed `selectedIds` resolved correctly), and found per-bay
   labels genuinely absent at the post-generate view.
2. Placed a `rack_row` from the left panel, logged its full object, and
   diffed every field against the generated one. Real differences: `id`,
   `label` text ("Rack Row" vs "Rack Row (multi-bay)"), `x`/`y`/`width`
   (different bay counts, expected), `levels` (generated only),
   `snapType`/`palletDeep` (panel only). Every field `RackLabels`
   (`canvas2/DimensionLabels.jsx`) actually reads — `type`, `x`, `y`,
   `width`, `height`, `beams`, `uprightWidth` — was present, correctly
   typed, and equivalent in shape on both objects. None of the fields that
   genuinely differ (`levels`, `snapType`, `palletDeep`, `label` text) are
   read by the per-bay label code at all.
3. Reproduced the exact reported sequence: placed a floor plan from the
   panel, placed a rack from the panel inside it, selected it — labels
   showed correctly (three `96"` tags, a total-length tag). Ran Generate
   again on the same scene. Diffed the SAME rack object (by id) before vs.
   after: the only field that changed was `activeBayIdx` (an artifact of my
   own re-click landing on a different bay after the view moved) — `beams`,
   `width`, `x`, `y` were byte-identical. The object was untouched.
4. Selected that SAME unchanged object and screenshotted it: no per-bay
   labels, at the zoom Generate's own auto-fit had just set
   (`0.098` — fitting the whole generated warehouse into view). Zoomed
   back in on it, same object, no data change: labels reappeared
   immediately (`96"` visible again at zoom `1.2`).

**Cause: none to fix — the label code is working as designed.**
`RackLabels`' per-bay text has a minimum-screen-width gate
(`beamPx > fs * 3.5 + pad * 2`, where `fs = 11/zoom`), ported verbatim from
the SVG engine's own `RackLabels` — a real bay narrower than ~3.5 characters
of text on screen skips its label rather than render illegible overlapping
text. `zoom` is a single store-global value, not a per-object field, so
this gate necessarily affects every currently-visible rack identically —
old and new, generated and hand-placed. Generate's own auto-fit-to-content
runs after placing the building and all its racks, and at typical generated
warehouse sizes that lands the zoom far below the per-bay threshold — so a
rack selected immediately after Generate predictably shows no per-bay
labels, and running Generate AGAIN (auto-fitting to a now-larger scene, or
just re-fitting) can zoom out past the threshold for racks that were
visible fine a moment earlier, with no change to those racks' own data.
"Panel-placed racks show labels" is explained the same way in reverse:
placing an object from the library doesn't change the view at all, so it's
almost always seen at whatever zoom the user was already editing at —
typically well above the threshold.

**Fix: none shipped.** Confirmed with the user before writing this entry:
this is the same zoom-gated behaviour the SVG engine has always had, not a
canvas2 regression or a data-shape gap between generate and the library.
Changing it (e.g. giving Generate's auto-fit a zoom floor that keeps bay
labels legible, or making the label gate ignore zoom for a selected rack)
would be a deliberate UX decision about when a bay label should be allowed
to render illegibly-small text, not a bug fix — logged here as a real,
considered option for a future entry if the team decides the zoom-out-after-
generate experience should behave differently, but not undertaken
speculatively against a symptom whose actual cause turned out to be
correct, intentional code.

**Verify:** the four-step comparison above (generated object dump, panel
object dump, field diff, before/after-Generate diff of the SAME object,
zoom-back-in re-check) is itself the verification — no code changed, so
the "log both full objects" comparison is the artifact this entry exists
to preserve, not a before/after-a-fix pair. Zero console errors across
every step. No commit beyond this log entry; 309 unit tests and the build
are unaffected (no source changed).

**Lesson:** a user's confident hypothesis about WHERE a bug lives ("some
field is missing") is a lead to test, not a fact to build a fix on top of.
The instruction to "compare field-by-field, log both full objects" was the
right process regardless of whose hypothesis it confirmed — it happened to
disprove this one instead, and the fastest way to find that out was running
the actual comparison rather than reasoning about what COULD differ. A
gate this deliberate (a literal screen-width readability threshold, ported
on purpose from the SVG engine) is exactly the kind of thing that LOOKS
like a missing-field bug from the "some racks show labels, some don't"
symptom alone, and is expensive to mis-diagnose: "fixing" a field that
isn't actually the cause would have shipped a no-op change while leaving
the real (and arguably correct) zoom-dependent behaviour completely
unexplained in the codebase.

---

## BUG 19 — Group rotate was never ported to canvas2: multi-selection had no rotate chrome at all

Symptom:  Selecting 2+ objects under canvas2 showed only the plain per-object
selection outlines — no bounding box, no rotate handle, no way to turn a
multi-object selection as a unit. The SVG engine has always supported this
(CanvasUI.jsx's `GroupOutline`, driven by `CanvasArea.jsx`'s
`onGroupRotateStart`/`groupRotate` drag), but canvas2's resize/rotate input
path hard-gated on `selectedIds.length === 1` everywhere, so a 2+ selection
never got a rotate control at all.

Chased:   The SVG engine's group rotate is keyed off *formal* `groups`
(objects joined by Ctrl+G — `activeGroupIds`/`groupOutlines` in
`CanvasObjectCore.jsx`, filtered from `useCanvasStore`'s persisted `groups`
array), not off the ad-hoc selection. The task asked for the chrome and math
to key off whatever is currently SELECTED (2+ objects, grouped or not) —
a deliberate, narrower scope than a full group-management port, so this
entry does not touch `groups`/`Group`/`Ungroup` at all, only rotate.

Also chased: whether the store needed a new bulk-rotate action generalizing
`rotateGroup(groupId, angleDeg, basePositions)` to accept a raw id list
instead of a persisted `groupId` — `useCanvasStore.js` is protected
(CLAUDE.md rule 2). Resolved without touching it: the exact same
one-store-write-per-object-per-frame-via-`updateObject`-then-
one-`commitObjectUpdate`-to-commit pattern the single-object resize/rotate
gesture already uses (both exported, unprotected actions) gives "N live
writes, ONE history push" for free — `commitObjectUpdate` on any single
member pushes history over the store's *entire* `objects` array, which by
that point already has every other member's rotation written by the
preceding frame's `updateObject` calls.

Cause:    canvas2 had no group-rotate code path at all — not a bug in
existing code, a genuine missing port. `useCanvasInteraction.js`'s handle
check only ever ran for `selectedIds.length === 1`
(`PORTED_RACK_TYPES`-gated), and `Canvas2.jsx`'s `handleTarget` had the same
single-object gate feeding `ResizeHandlesOverlay`. Nothing computed a group
bounding box, hit-tested a group handle, or rotated more than one object at
once.

Fix:      New `src/canvas2/groupRotate.js` — pure geometry/math, no React/
Konva/DOM, ported verbatim from two different SVG sources kept deliberately
separate (matching what the SVG itself does, not "cleaned up" into one):
  - `computeGroupOutline(objs, zoom)` — CanvasUI.jsx's `GroupOutline` bbox +
    handle layout (pad=10, stalk to `-44/zoom`, handle circle `r=10/zoom`).
    Its `gcx/gcy` (getObjectBounds-based bbox centre) is also the ANGLE
    pivot for the drag.
  - `groupRotateHandleHitTest(objs, zoom, wx, wy)` — the same `r*2.5` hit
    circle CanvasUI's own invisible `<circle>` uses.
  - `applyGroupRotation(base, angleDeg)` — `useCanvasStore`'s `rotateGroup`
    reducer body ported verbatim (same `cx?? x1?? x` corner formula, same
    `rotPt`, same per-type branches for circle/line/fpVerts/rect), just fed
    a `Map` of a plain id list's snapshot instead of a persisted group's
    `basePositions`. Recomputes its OWN pivot from `base` — intentionally
    NOT the same value as `computeGroupOutline`'s `gcx/gcy`, because
    `rotateGroup` never received `GroupOutline`'s centre either.

New `src/canvas2/GroupRotateOverlay.jsx` — pure paint (no listeners, no
`spin()`: this box is plain axis-aligned world space, not attached to any
one object's rotation), same colours/dash/sizes as `GroupOutline`. Wired
into `Canvas2.jsx` alongside `ResizeHandlesOverlay`, gated on
`selectedObjects.length >= 2`.

`useCanvasInteraction.js`: a `groupRotateDrag` ref parallel to
`resizeDrag`. `onStageMouseDown` — when 2+ selected, hit-test the group
handle *before* the plain object hitTest (same "handle wins the press"
priority as the single-object case) and start the drag, snapshotting every
selected object. Window `mousemove` — same angle-from-unsnapped-pointer,
5°/45°(shift) snap-to-first-angle flow as the SVG's `groupRotate` branch,
writing every member's rotation live via `updateObject` each frame (a real
store write per frame, same "resize/rotate write every frame" pattern
already used elsewhere, not the imperative-node-move drag trick — group
rotate changes N objects' rotation/position, which only a real re-render
redraws). Window `mouseup` — `commitObjectUpdate` on one member, for the
single `pushHistory` call. Hover-cursor early-return guards
(`onStageMouseMove`/`onStageMouseLeave`) extended to include
`groupRotateDrag.current` alongside the existing gesture refs.

Verify:   Real mouse, via a Playwright script driving actual mousedown/move/
up on the live app (not a synthetic store call): seeded two `rack_row`
objects via the store, selected both, screenshotted the resulting chrome —
dashed purple bounding box around both racks with the stalk+handle centred
above, matching `GroupOutline`'s look exactly. Dragged from the handle to a
point 90° around the pivot: both racks' `rotation` became exactly `90` and
their `x/y` landed at the hand-computed positions for a 90° turn about the
shared bbox centre (150,70)/(50,70 → wait, (50,50) and (-50,50) — see the
script's own worked arithmetic). `historyIndex` advanced by exactly ONE
step across both objects changing. Called `undo()` once: BOTH racks
reverted to their exact pre-rotate `x/y/rotation`, `historyIndex` back to
its pre-drag value. Zero console errors throughout. Build clean (1786
modules), 309/309 tests pass (no existing test touches this path, so no
regressions from the new gate/branches).

Lesson:   When a store action is scoped to a persisted concept (`groupId` +
`s.groups`) but the task needs the same behaviour keyed off a DIFFERENT,
lighter-weight concept (ad-hoc selection), the fix isn't always "generalize
the protected action" — check whether the existing UNPROTECTED building
blocks (`updateObject` for a no-history live write, `commitObjectUpdate`
for a single history push over the WHOLE store) already compose into the
same guarantee. They did here: N `updateObject` calls + 1
`commitObjectUpdate` is exactly "N live writes, one undo," without touching
`useCanvasStore.js` at all. Also: porting math from two DIFFERENT functions
in the SVG source (`GroupOutline`'s visual centre vs. `rotateGroup`'s
recomputed pivot) that happen to disagree with each other is still "don't
reinvent" — unifying them into one pivot would be a real, if minor,
behaviour change from the SVG original, not a cleanup.

---

## BUG 20 — Group rotate outline didn't track the rotating group, and its stroke width scaled with zoom

Symptom:  Two bugs found by the user testing BUG 19's group rotate, both
confirmed with a screenshot: (1) mid-gesture and after commit, the dashed
purple group outline stayed at its ORIGINAL flat, unrotated position and
size while the two selected racks visibly turned to a diagonal — box and
racks completely disagreed about where the selection was. (2) the outline's
stroke got visibly thicker zooming in, unlike every other piece of canvas2
chrome (resize handles, single-object selection outline), which stay a
constant screen-width regardless of zoom.

Chased:   Neither was a regression in the rotation MATH itself — a
console-level check confirmed both racks' `rotation`/`x`/`y` were exactly
correct throughout (same values as BUG 19's own verification). Both bugs
were entirely in `GroupRotateOverlay`/`computeGroupOutline`'s PAINT layer,
not the interaction/store layer BUG 19 added.

Cause (1) — stale outline: `computeGroupOutline` summed each member's RAW
`getObjectBounds(obj)` — the object's own UNROTATED local rect — the same
starting point `spin()` uses for a SINGLE object's chrome. But a single
object's handles/selection outline then get physically turned by wrapping
them in a Konva `Group` with `spin(obj)`'s rotation transform, matching the
object's own rotated Group; `GroupRotateOverlay` never did that (deliberate
at the time — see BUG 19's "No spin() here" note, which reasoned the box
should stay a plain axis-aligned world rect, not realizing that reasoning
only holds for an UNROTATED selection). Once a member actually had
`rotation !== 0` (mid-drag or after a completed group rotate), its raw
unrotated bounds no longer described where it was actually painted, and
summing those stale rectangles produced a box that never moved with the
rotation at all — this is the exact same "chrome computed from bounds that
don't match live reality" root cause as BUGs 6/10/12 (CANVAS2_BUGLOG's own
established recurring pattern), just in a FOURTH piece of chrome that
hadn't existed yet when that pattern was first named.

Cause (2) — stroke scaling with zoom: `GroupRotateOverlay`'s stroke widths
and dash array were ported from CanvasUI.jsx's raw SVG numbers verbatim,
INCLUDING their `/zoom` division — copied as a literal transcription without
registering that the `/zoom` trick and Konva's `strokeScaleEnabled={false}`
(already set on every one of these shapes) are two DIFFERENT, INCOMPATIBLE
mechanisms for the same goal ("stroke stays a constant screen width").
Raw SVG has no non-scaling-stroke primitive, so CanvasUI must manually
divide by zoom to counteract its own coordinate system's zoom-scaling.
Konva's `strokeScaleEnabled={false}` already does this automatically — it
makes Konva treat the given `strokeWidth` number as the FINAL screen-pixel
width regardless of the Stage's zoom scale. Feeding it an ALREADY-divided
number (`5/zoom`) compounded the two: the stroke ended up sized
`(constant) / zoom`, so it shrank at high zoom instead of staying put —
and, empirically, LOOKED like it grew relative to the tiny (also
correctly-scaled) rack geometry around it at low zoom, and vice versa —
the actual bug the user's screenshot-free zoom-in check caught.

Fix:      `src/canvas2/groupRotate.js` — new `rotatedCorners(bounds,
rotation)` helper: the object's own 4 corners, rotated about ITS OWN centre
by ITS OWN `obj.rotation` — literally the same transform `spin()` applies
when painting the object. `computeGroupOutline` now folds every member's
corners (not just its raw x/y/width/height) into the shared min/max, so the
box always encloses what is actually on screen, live during the drag (every
`updateObject` write each frame is a real store write, which re-renders
`GroupRotateOverlay` with fresh live objects — no imperative Konva-node
sync needed, same "real store write, dimension labels track for free"
reasoning BUG 13's floor-plan wall drag already established) and after
commit, for any 2+ selection regardless of how its members got their
current rotation.

`src/canvas2/GroupRotateOverlay.jsx` — stroke widths (`5`, `2.5`, `2`, `2`)
and the dash array (`[8, 4]`) are now plain literals, matching
`strokeScaleEnabled={false}`'s own convention (ResizeHandlesOverlay/
SelectionOutline's — "a small literal strokeWidth for constant-screen-width
lines"), not re-divided by zoom. `cornerRadius` (a genuine geometric SIZE,
not a stroke property — Konva has no `strokeScaleEnabled` equivalent for
it) correctly stays `N / zoom`.

Verify:   Real mouse, via Playwright. Seeded and selected two `rack_row`
objects as in BUG 19, then dragged the group handle through a slow 90°
turn, screenshotting at ~45° and ~90° mid-gesture (not just before/after):
at 45° the dashed box is visibly diagonal-encompassing, no longer axis-
aligned to the ORIGINAL footprint, tightly wrapping the two turning racks
at their CURRENT diagonal extent; at 90° it re-tightens to a narrow
vertical box exactly matching the now-vertical racks. Confirmed the
underlying rotation math is untouched (`rotation: 90`, `x/y` matching
BUG 19's own hand-computed values) — this entry only touched paint.
Zoomed the same committed selection from 1x to 3.5x and screenshotted:
the dashed stroke reads the same thin screen-width at both zooms, no
visible thickening. Zero console errors throughout. Build clean (1786
modules), 309/309 tests pass (no existing test touches this paint-only
path).

Lesson:   The recurring "chrome computed from stale/wrong bounds" bug class
(BUGs 6, 10, 12, and now this one) isn't finished being found just because
the LAST piece of chrome that needed it got fixed — every NEW piece of
selection/gesture chrome added after that fix has to independently earn
the same "read the object's OWN current rotation/position, the way it's
actually painted" discipline; a brand-new component (`GroupRotateOverlay`,
which didn't exist when BUG 12 was written) can reintroduce the identical
class of bug on day one if its bounds math quietly diverges from what
`spin()` does for everything else. Separately: porting a raw-SVG numeric
literal (`5/zoom`) verbatim is only correct when the TARGET renderer has no
equivalent of its own — Konva's `strokeScaleEnabled` already solves the
exact problem SVG's manual `/zoom` division solves, so applying both is
double-compensation, not extra safety. "Port the numbers, not blindly the
formula that produced them" — check what mechanism the destination already
has before re-deriving one by hand.

---

## BUG 21 — Group rotate outline was an axis-aligned bounding box, not a tight box that rotates with the group

Symptom:  Confirmed with a screenshot: BUG 20's fix made the dashed group
outline track the rotating racks (it no longer stayed motionless), but it
did so by staying AXIS-ALIGNED and GROWING to bound whatever the current
rotated footprint was — an AABB of rotated content — instead of turning
AS a rigid box with the group and staying snug around it. The single-object
`SelectionOutline` already rotates a tight box that hugs the one selected
object exactly; the group case looked visibly different (loose, expanding/
contracting as the angle changed) from that established single-object
behaviour.

Chased:   The natural first instinct — "rotate the box by the delta the
current gesture has applied so far" — doesn't generalise past the live
drag: after a rotate is COMMITTED (or for a fresh render with no drag in
progress at all, e.g. re-selecting the same two racks later), there is no
"delta" left to read, only each member's own current `rotation` field. The
box has to be reconstructed correctly from THAT alone, live or static,
the same way `SelectionOutline` reconstructs a single object's box purely
from its current `x/y/width/height/rotation` with no memory of how it got
there.

Cause:    `computeGroupOutline` (BUG 20's version) summed each member's own
ROTATED corners into one shared axis-aligned min/max — mathematically
correct as an enclosing box, but an AABB of a rotated rectangle is
inherently larger than the rectangle itself (and grows/shrinks continuously
as the angle changes), which is why it never looked "snug" the way a
single object's outline does. `SelectionOutline` avoids this entirely: it
draws the object's own UNROTATED bounds, then turns the whole Konva Group
(`spin()`) around the object's own centre — geometry stays tight because
it is never re-measured as an axis-aligned box in the first place, only
rotated as a rigid shape.

Fix:      `computeGroupOutline` (`src/canvas2/groupRotate.js`) now does the
group equivalent of `spin()`, worked out algebraically before writing any
code (see the file's own header comment for the full derivation): every
member of a group rotate shares the exact same rotation `R`
(`applyGroupRotation` adds the identical `angleDeg` to every member), which
means the whole selection is one rigid body turning by `R` around one
point — the same shape `spin()` handles for a single object, generalised
to many.
  1. `P` = the mean of every member's CURRENT bounds-centre — recomputed
     fresh on every call from live positions (not cached from drag-start).
  2. Each member's current centre is de-rotated by `-R` around `P`. Proven
     (not assumed) that this reconstructs the group's TRUE relative
     arrangement exactly for ANY reference point, because rotating a rigid
     formation's relative vectors by `R` and undoing that same `R` always
     cancels algebraically — `P` never has to equal whatever pivot the
     actual rotate gesture used internally, it only has to be reused
     consistently within one call.
  3. Those de-rotated (now axis-aligned again) member rects fold into ONE
     tight local AABB — the box's own unrotated shape, exactly like
     `getObjectBounds` is for a single object.
  4. The caller (`GroupRotateOverlay`) draws that local box inside a Konva
     Group positioned at `P`, OFFSET AT THE SAME `P` (not the box's own
     separately-computed centre — proven algebraically that using the SAME
     point for both position and offset is what makes the placement land
     exactly on the live objects), rotated by `R` — `spin()`'s own
     position+offset+rotate pattern, generalised from "one object's own
     bounds centre" to "the group's shared centroid P".

Verify:   Real mouse, via Playwright, using an ASYMMETRIC pair (a 200x40
and a 100x40 rack at different offsets — a symmetric pair can accidentally
look right under either the old AABB approach or the new oriented one, so
it doesn't distinguish them) selected and dragged through a slow ~75°
rotation. Screenshots at ~45° and ~75° mid-gesture show the dashed box
TILTED at the same angle as the racks, staying tight around their actual
(different-sized, offset) footprint at every intermediate angle — not an
axis-aligned box growing to contain them. Committed state matches the last
mid-drag frame exactly. Both racks landed at the identical `rotation: 75`
(self-consistent — confirms the underlying rotation math, untouched by this
paint-only fix, still agrees). Zero console errors throughout. Build clean
(1786 modules), 309/309 tests pass (no existing test touches this
paint-only path).

Lesson:   "Track the live bounds" (the fix for BUGs 6/10/12/20) and "rotate
rigidly like a single object does" are two DIFFERENT bars, and clearing the
first doesn't mean the second is met — BUG 20 genuinely fixed the outline's
staleness, but the result (a correct, live-tracking AABB) was still visibly
wrong relative to the established single-object convention, because an AABB
of rotated content and a rotated rigid box are not the same shape. When a
new piece of multi-object chrome needs to "match" how existing single-
object chrome behaves, the right question isn't just "does it track the
live object" but "does it use the SAME transform mechanism" — here, that
meant literally reusing `spin()`'s position+offset+rotate pattern rather
than inventing a parallel live-bounds-recompute approach that happened to
also update every frame. Also: when a geometric fix depends on an identity
("using P instead of C still works") that isn't immediately obvious, work
it out algebraically with a concrete asymmetric numeric example BEFORE
writing the code — the derivation here initially seemed to require knowing
`applyGroupRotation`'s own internal pivot, and only checking the algebra by
hand (twice, catching a real error in the first pass) showed that it
doesn't.

---

## BUG 22 — Smart-guide alignment snapping was missing from canvas2's object drag

Symptom:  Dragging a rack near another object's edge or centre under
canvas2 did nothing special — no snap, no alignment guide line — unlike
the SVG engine, which magnet-snaps a dragged object's edges/centres to
nearby objects (and floor-plan inner walls / column faces) and shows a
dashed guide line while it does.

Chased:   The task named `snapToDimPoint` as one of the three things to
port, alongside `snapDelta`/`smartGuides`. Read closely, `snapToDimPoint`
(CanvasArea.jsx ~216) is a DIFFERENT, unrelated feature — the DIMENSION
TOOL's own endpoint snap, used only while DRAWING a new dimension line
(its one call site inside the mousemove handler is in the `drag.type ===
'draw'` branch for `ANNOT.DIMENSION`, never in the `'move'` branch that
handles dragging an existing object). It shares an `onMouseMove`
dependency array with the real move-drag code purely because both live in
one giant callback, not because dragging an object calls it. The actual
object-drag smart-guide feature — the one the task's own verify criteria
describe ("drag a rack near another's edge → it snaps and a guide line
shows") — is a SEPARATE, entirely inline block inside CanvasArea's
`drag.type === 'move'` branch (~688-827), with its own THRESH/SNAP_DIST/
WALL_THRESH/WALL_SNAP constants and its own guide-building logic. Ported
that block; did not port `snapToDimPoint` (out of scope — a different
tool, not touched here, logged so the naming mismatch in the task itself
is on record rather than silently "fixed" by porting the wrong function).

Also chased: how a guide-snap should interact with canvas2's own
grid-snap-while-dragging (`st.snapToGrid`), which the SVG engine does not
have at all for a move — CanvasArea's 'move' branch never calls `doSnap`.
Rather than removing canvas2's already-existing (non-SVG) grid-snap
behaviour, a guide snap now wins over it per-axis when one fires (matching
CanvasArea's own snap being unconditional), with grid-snap remaining the
fallback on an axis with nothing nearby to align to.

Cause:    Not a bug — a genuine missing port, Step-5-scope work that
BUG 12's floor-plan/rack drag port never covered because the SVG feature
it corresponds to (an inline, un-named block deep in one mousemove
handler) is easy to miss when porting file-by-file rather than
gesture-by-gesture.

Fix:      New `src/canvas2/smartGuides.js` — `computeSmartGuides(selectedIds,
objects, gridSize, zoom, dx, dy)`, a pure function ported from CanvasArea's
inline block: partitions objects into `others` (plain edge/centre
snapping), `fpWalls` (floor-plan inner wall faces) and `colGrids` (column
faces), computes the dragged selection's shifted bounds from the RAW
pointer delta, checks every candidate pair against THRESH (6/zoom, for
drawing a guide) and SNAP_DIST/WALL_SNAP (8/zoom and 32/zoom, tighter —
for actually moving the object), and returns de-duplicated guide-line
descriptors plus the best `snapDx`/`snapDy` per axis. No React/Konva/DOM,
so the drag handler (decides what to move) and the painter (decides what
to draw) share one computation (CANVAS2.md rule 4).

`useCanvasInteraction.js`'s plain object-drag mousemove now calls this
every frame with the raw delta, applies `snapDx`/`snapDy` over canvas2's
existing grid-snap on whichever axis fires, and feeds the resulting
`guides` array into a new `smartGuides` piece of React state (mouseup
clears it) — the one deliberate exception to this drag's own "no store
write, no React render per frame" rule (BUG 6/12's `collectDragNodes`
trick still moves the dragged NODES imperatively with zero React
involvement): a few guide-line overlay nodes are cheap to re-render every
frame, the same way `marquee` state already updates live during a marquee
drag, and it is the only way React ever sees the lines to paint them.
Commit is unaffected — `d.delta` already carries whichever (grid- or
guide-) adjusted dx/dy was computed, and mouseup's existing single
`moveObjects(d.ids, d.delta.dx, d.delta.dy)` call was already the "one
history entry for the whole gesture" commit.

`Overlays.jsx` renders the `smartGuides` array as Konva `Line`s — CanvasArea's
own colours (purple `#a78bfa` for wall/column snaps, green `#22c55e` for
object-to-object) and dash pattern, but as plain literal stroke widths
with `strokeScaleEnabled` rather than SVG's raw `/zoom` numbers (BUG 20's
established lesson — Konva's own non-scaling-stroke mechanism, not a
manual re-derivation of it).

Verify:   Real mouse, via Playwright. Placed two racks 100 world units
apart (A's right edge at x=200, B's left edge at x=300) and dragged A by a
raw ~96-unit delta — short of exact alignment, but within SNAP_DIST(8).
Mid-drag screenshot shows a green dashed vertical guide line at the
snapped edge while A's own body is still visibly being dragged (store
`objects` unchanged during the drag — confirms the plain-drag node-move
optimization is untouched). Released: A landed at EXACTLY x=100 (right
edge = 300, perfectly flush with B's left edge), not the approximate
dragged position — confirms the snap, not just the guide, fired.
`historyIndex` advanced by exactly one step for the whole gesture. Called
`undo()` once: A reverted to its exact pre-drag `x=0`, `historyIndex` back
to its pre-drag value. Zero console errors throughout. Build clean (1785
modules), 309/309 tests pass (no existing test touches this path).

Lesson:   A task's own naming of a source function can be wrong without
the underlying request being wrong — `snapToDimPoint` and the real
move-drag snap logic sit a few hundred lines apart in the same file,
solve visually-similar problems (both are "snap this point to something
nearby"), and share one `useCallback`'s dependency array, all of which
make it easy to misattribute one for the other from a skim. Reading the
actual call sites (which branch calls which function) before porting
settled it in minutes and avoided porting a working feature (dimension
tool endpoint snap) into the wrong place while leaving the actually-
requested behaviour (object drag alignment) unbuilt. Also: not every gap
found this late in the migration is a BUG in existing canvas2 code — some
are still-missing ports of real SVG features that simply weren't part of
whatever gesture-by-gesture pass already happened (this one, evidently,
skipped one inline block CanvasArea's own file structure made easy to
miss) — the log entry, and the fix, look the same either way.

---

## BUG 23 — Floor-plan rotation was missing entirely: a building is a container, and canvas2 had no rotate handle for one at all

Symptom:  A floor plan under canvas2 had no rotate control whatsoever —
`handleTarget`'s gate (the resize/rotate handle surface) only ever fired
for `PORTED_RACK_TYPES`, so selecting a building alone showed no chrome
beyond the plain selection outline. The SVG engine has `FpRotateHandle`
(CanvasUI.jsx) for exactly this.

Chased:   The task asked to port "how FpRotateHandle + the store rotate
the fp and cascade to children — match the reference, don't reinvent."
Read closely (every `parentId` reference in CanvasArea.jsx/
CanvasObjectCore.jsx, and the generic `handle === 'rotate'` mousemove
branch both FpRotateHandle and the rack rotate handle share), the SVG
reference has NO cascade-to-children logic anywhere — the generic rotate
branch writes exactly one object's `rotation` field
(`useCanvasStore.getState().updateObject(objId, { rotation: snapped })`)
and nothing else, regardless of whether that object is a rack or a
building. This is a genuine, pre-existing gap in the SVG engine itself
(confirmed, not assumed — the same kind of investigation BUG 22's
`snapToDimPoint` mixup required), not a cascade this file failed to find.
The task's own functional spec and verify criteria ("racks stay in their
relative positions," "one undo reverts all") describe real, necessary
behaviour regardless — built fresh, using the SAME rigid-rotation
decomposition (orbit the shared pivot + spin each member in place)
CANVAS2_BUGLOG's group-rotate entries (BUG 19-21) already established and
proved correct for this exact shape of problem, just scoped to "this fp's
current children by parentId" instead of "the current selection," and
with the pivot pinned to the building's own centre rather than group
rotate's shared-selection centroid.

Also chased: whether the floor plan's own `rotation` field should be
bumped by the delta, matching every OTHER rotatable object. It must NOT
be — canvas2 draws a floor plan purely from `fpVerts` (`FloorPlanShape`
applies no separate rotation transform at all, CANVAS2.md rule 4), so a
building's turn has to be baked directly into fpVerts's own absolute
coordinates, the same way a wall drag (BUG 13) reshapes fpVerts directly
rather than writing a transform. Setting `rotation` ON TOP of that would
double-rotate anything that reads it off an fp object —
`SelectionOutline`'s `spin()`, which measures `outlineBounds` (already the
rotated verts) and would rotate THAT again, turning the selection chrome
away from the true building outline as the delta grows. Children ARE
different: a rack's own paint path (`RackShape`) DOES read `obj.rotation`
via `spin()`, so a child's rotation field has to be bumped by the same
delta, or an axis-aligned rack orbiting a turned building would stay
axis-aligned instead of turning with it — the orbit-alone-with-no-spin
version was checked by hand against the verify criteria ("racks stay in
their relative positions") and rejected: without the spin component a
rack would end up in the right PLACE but the wrong ORIENTATION, still
visibly wrong.

Also chased, proactively (the task's own explicit "live bounds, not
stale — same lesson as the group-rotate/chrome-offset bugs" instruction):
whether the SelectionOutline gets this right for an ALREADY-rotated
building. It did not, on the first pass that would have shipped — the
existing fp branch of `outlineBounds`/`SelectionOutline` draws an
axis-aligned `Rect` from the verts' own bounding box, exactly BUG 20's
mistake (an AABB of rotated content, ballooning past 45° instead of
hugging the walls) if a building actually turned. Fixed before it ever
shipped by giving `SelectionOutline` a dedicated fpVerts branch: trace the
polygon directly with a closed `Line`, no bounding box at all — always
exact, at any angle, because there is no box to keep in sync, only the
same points `FloorPlanShape` itself paints from.

Cause:    Not a bug — a genuine missing port (no fp rotate handle existed
at all) plus one real design decision that had to be made correctly up
front (rotation baked into fpVerts, not a field) rather than copied
blindly from how every OTHER object type already works.

Fix:      New `src/canvas2/fpRotate.js` — `computeFpRotateHandle(fp,
gridSize, zoom)` (FpRotateHandle's own 56/zoom stalk, 8/zoom hit circle —
distinct numbers from the rack rotate handle's 70/zoom, a separate SVG
component with its own constants; uses `outlineBounds`, the fpVerts-
derived TRUE bounds, not `getObjectBounds`'s raw x/y/width/height fields
the SVG source reads — BUG 13's own lesson, a handle anchored to a stale
bbox is exactly the bug class this feature must avoid), 
`fpRotateHandleHitTest`, and `applyFpRotation(fpBase, childrenBase, pivot,
angleDeg)` — rotates the fp's OWN fpVerts directly (no `rotation` field
write) and every child's centre around the SAME fixed pivot plus that
child's own `rotation` field, mirroring `applyGroupRotation`'s per-type
branches but keyed off a snapshot Map of "this fp's current children,"
not the selection.

New `src/canvas2/FpRotateHandleOverlay.jsx` — pure paint, `FpRotateHandle`'s
geometry/colours ported, no `spin()` (the handle reads the LIVE, already-
rotated `outlineBounds` every render — an ordinary React re-render is
"live bounds, not stale" for free, since the drag writes a real store
update every frame, BUG 13's own wall-drag pattern, not BUG 12's zero-
store-write node trick).

`src/canvas2/shapes.jsx`'s `SelectionOutline` gained the fpVerts-tracing
branch described above (a closed `Line`, ahead of the existing `Rect`+
`spin()` fallback used by every other type).

`Canvas2.jsx` — a new `fpRotateTarget` (single-selection, `isFloorPlan`,
parallel to but independent from `handleTarget`'s rack gate) mounts
`FpRotateHandleOverlay`. `useCanvasInteraction.js` — a `fpRotateDrag` ref
parallel to `groupRotateDrag`: `onStageMouseDown` checks the fp handle
(inside the existing `selectedIds.length === 1` branch, alongside — not
instead of — the rack handle check) before the plain hitTest, same
"handle wins the press" priority as every other handle; window
`mousemove` writes `applyFpRotation`'s updates for the fp and every child
via `updateObject` each frame (real store writes, BUG 13's pattern);
window `mouseup` commits ONE history entry via `commitObjectUpdate` on the
fp alone (`pushHistory` snapshots the whole `s.objects` array, children
included). Hover-cursor guards and the idle-hover 'alias' cursor extended
to match.

Verify:   Real mouse, via Playwright. Seeded an `fp_rect` (400×300) with
two ASYMMETRICALLY-placed child racks (a 200×40 at (50,50) and a 100×40-ish
at (250,200) — deliberately off-centre from the building's own centre
(200,150), so "orbit + spin correctly" and "stay tight to the pivot" are
actually being tested, not accidentally satisfied by symmetry). Dragged
the fp's rotate handle through a slow ~90° turn:
  - Screenshot at ~45°: the building is a tight diamond, BOTH racks
    visibly turned to the same diagonal and sit in their correct relative
    positions inside it, and the selection outline traces the diamond
    exactly — not a loose axis-aligned box.
  - At 90° committed: building is now 300×400 (correctly swapped), both
    racks are vertical, selection outline is a tight rectangle matching
    the new orientation.
  - Numerically: fpVerts landed at EXACTLY the hand-computed rotated
    corners ((350,-50),(350,350),(50,350),(50,-50) for a 90° turn around
    pivot (200,150)); rack A landed at EXACTLY (230,30) rotation 90; rack
    B at EXACTLY (80,230) rotation 90 — both matching independently
    hand-derived expected values, not just "looked right."
  - `fp.rotation` stayed `0` throughout (confirms the double-rotation
    trap was avoided).
  - `historyIndex` advanced by exactly ONE step for the whole gesture
    (fp + both children). `undo()` once reverted the fp's fpVerts and
    BOTH racks' x/y/rotation to their exact original values.
  - Zero console errors throughout. Build clean (1789 modules), 309/309
    tests pass (no existing test touches this path).

Lesson:   A task's framing ("match the reference, don't reinvent") is
sound advice for the parts that genuinely exist in the reference, but
applying it uncritically to a part that DOESN'T (the children cascade)
would have meant either fabricating a "port" of code that was never
there, or worse, silently shipping single-object-only rotation while
believing it matched a reference that never covered the container case.
Verifying the reference's actual behaviour (not just its named functions)
before building is the same discipline BUG 22 needed for `snapToDimPoint`,
now needed twice in as many features — worth treating as a standing
habit, not a one-off. Separately: "don't just copy how the last similar
feature worked" is sometimes the correct call even when two features look
architecturally identical (this one and group rotate share the exact same
rigid-rotation math) — group rotate's members ALL get their `rotation`
field bumped because they ALL paint through `spin()`; blindly extending
that same rule to the fp itself would have been wrong, because the fp
does NOT paint through `spin()` — it was necessary to check what the
actual PAINTER does for a given object type before deciding whether
`rotation` is safe to write, not assume architectural symmetry implies
identical treatment. Also: this session's own established pattern
(BUG 20/21 — a fresh piece of chrome can reintroduce the "stale/loose
bounds" bug class on day one) is worth checking PROACTIVELY for every new
chrome component, before it ships and gets its own bug number — done here
for SelectionOutline's fp branch specifically because the task named that
exact lesson explicitly, catching a real, would-have-shipped regression
before any real user (or test) saw it.

---

## BUG 24 — Floor-plan rotate handle bounced/jittered instead of tracking smoothly

Symptom:  During a floor-plan rotate (BUG 23), the rotate-handle pin
visibly bounced — growing away from the building and retreating again as
the drag progressed — instead of sweeping a clean, settled arc the way
the single-object and group rotate handles already do.

Chased:   Not a React-render-timing issue (the first hypothesis worth
ruling out, given BUG 11's "same-frame handle tracking" precedent) — the
fp rotate drag already writes a real store update every frame (BUG 13's
pattern), and BUG 23's own verification already confirmed the underlying
rotation data lands exactly on hand-computed values every frame, live.
The actual cause was geometric, not timing: `computeFpRotateHandle`
anchored the handle to `outlineBounds`' AABB of the LIVE (rotating)
fpVerts — the exact same mistake BUG 20 already diagnosed and fixed for
group rotate's outline, just reintroduced in a brand-new component that
didn't exist yet when BUG 20/21 were written. An axis-aligned bounding
box of a ROTATING rectangle isn't a rigid shape: its width/height (and
therefore its top edge, which the handle was anchored 56px above) grow
toward the shape's own diagonal as it turns past 0° and shrink back down
approaching 90° — non-monotonic, which is exactly a "grows, doesn't
settle" bounce, not smooth tracking.

Group rotate solved this (BUG 21) by wrapping a tight LOCAL shape in ONE
rigid Konva rotation transform (spin()'s own position+offset+rotate
pattern). A floor plan has nothing to hand that transform to — its
rotation is baked directly into fpVerts, not a field a Group could read
(fpRotate.js's own header) — so the SAME fix couldn't be ported directly;
a different rigid anchor was needed that works from vertex DATA alone,
live during a drag or on an already-rotated, freshly-selected building
alike (no separate "how far has this turned" value exists anywhere for
an fp, unlike a rack's `rotation` field or a live drag's own `totalDelta`).

Cause:    `computeFpRotateHandle`'s rx/ry, being derived from
`outlineBounds` (an AABB recomputed fresh from the CURRENT verts every
call), moved along a NON-rigid, non-monotonic path as the polygon
rotated — verified numerically (see Verify): the AABB-anchored handle's
distance from the building's own pivot ranged from 206 to ~306 and back
to ~268 across a 100° sweep of a 400×300 rectangle, a ~100-world-unit
radial bounce, while its ANGLE from the pivot stayed flat (a rectangle's
AABB is always centred on the true centre by symmetry, which is why the
bug reads as "bounces toward/away" rather than "swings side to side").

Fix:      `computeFpRotateHandle` (`src/canvas2/fpRotate.js`) now anchors
to `fpVerts[0]`/`fpVerts[1]` directly — the polygon's own first edge, the
SAME edge every floor-plan shape's `initFpVerts` starts with (its top
wall, for fp_rect/l/l_mirror/t/u/cross alike) — rather than a derived
box. The handle sits a constant screen distance (56/zoom) OUTWARD along
that edge's own normal (the edge direction rotated -90°, verified against
initFpVerts's clockwise winding to point away from the interior), with
the stalk's near-wall point similarly offset (6/zoom). Because `v0`/`v1`
are two REAL points that `applyFpRotation` already rotates exactly every
frame, their midpoint and the normal derived from their direction vector
both rotate PERFECTLY rigidly around the pivot with no separate state to
track — the same rigidity guarantee `spin()` gives a single object,
built from vertex data instead of a transform. `FpRotateHandleOverlay.jsx`
updated to draw the stalk between the new (no-longer-purely-vertical)
near-wall and near-circle points, computed from the same outward normal.

Verify:   Numerically, via Playwright: seeded the same 400×300 `fp_rect`
BUG 23 used, dragged its rotate handle through a slow ~100° sweep in 20
small steps (steps: 3 each, matching a real slow drag), and at each step
computed the handle's distance from the building's own pivot (200,150)
using BOTH the new (fpVerts-edge) formula AND the old (outlineBounds-AABB)
formula it replaced, reading the SAME live, already-verified-correct
fpVerts from the store at every sample. New formula: distance stayed
EXACTLY 206 (variance: 0) across all 20 samples spanning the whole sweep
— a perfect, unwavering arc. Old formula: distance ranged from 206 up to
305.9 and back down to ~256-268 — a ~100-unit non-monotonic bounce,
concretely reproducing the reported symptom and confirming the fix
removes it entirely, not just reduces it. Zero console errors throughout.
Build clean (1789 modules), 309/309 tests pass (no existing test touches
this paint-only path; BUG 23's own rotation-math verification is
untouched by this fix, which only changed WHERE the handle is drawn, not
how the fp/children are rotated).

Lesson:   A bug class documented once (BUG 20's "AABB of rotating content
isn't rigid") doesn't stay fixed just because the ORIGINAL instance of it
got fixed — every NEW piece of chrome for a rotatable object has to
independently earn the same rigidity, and "I already fixed this exact
class of bug for group rotate" is not the same claim as "I applied that
fix here," which BUG 23's own shipped `computeFpRotateHandle` didn't
(despite BUG 23's own bug-log entry explicitly citing BUG 20/21 by name
as the lesson to apply to the SELECTION OUTLINE — the outline got the
fix, the handle quietly didn't, in the same commit). Also: when the
straightforward port of an established fix doesn't apply (group rotate's
Konva-transform trick has no floor-plan equivalent, since there's no
rotation field to hand it), the right move is to find a DIFFERENT rigid
anchor suited to the data that actually exists (two real, already-
correctly-rotating vertices) rather than settling for "at least it's
live" (BUG 23's own `outlineBounds` version WAS live — freshly recomputed
every render — and still wrong, because live and rigid are different
properties and only rigid actually prevents a bounce).

---

## BUG 25 — Shift+drag starting inside a floor plan never started a marquee

Symptom:  Shift+drag over empty canvas correctly started a marquee, but
shift+drag starting INSIDE a floor plan's footprint did nothing visible —
no marquee appeared, and the building itself did not move either (the
press was silently swallowed).

Chased:   `onStageMouseDown`'s shift-check (`if (evt.shiftKey) {
marqueeRef.current = {...} }`) sat AFTER the plain object `hitTest()` and
its own `if (hitId) { selectFromHit(...); beginDrag(...); return }`
block — so any press that `hitTest()` resolved to an object never reached
the shift-check at all, shift held or not. A floor plan's WHOLE
bounding box answers `hitTest()`'s Pass 3 (`objectContains` against the
full rect, not just the ~24-screen-px wall band `FloorPlanShape`'s own
Konva hit area covers), so pressing anywhere inside a building's
footprint — not just on a wall — resolves `hitId` to the floor plan,
taking the object-body branch before shift was ever considered. A
plain rack has the same issue in principle, but its footprint is usually
small enough that a marquee is naturally started just outside it; a
building fills most of the visible canvas, so the interior is exactly
where a real shift-drag was most likely to begin.

Also chased: what shift is supposed to override, precisely — not
everything. The SVG engine's own resize/rotate handles AND its
`FpWallHitAreas` (wall drag) are real DOM elements with their own
`onMouseDown` that call `e.stopPropagation()` before the canvas's own
handler (and its shift-check) ever runs — meaning a handle or a wall
ALWAYS wins the press in the SVG engine, shift held or not, simply
because the more specific listener claims the event first. Only a press
that reaches the CANVAS's own `onMouseDown` (nothing more specific
claimed it) ever consults shift. canvas2 funnels every press through one
`onStageMouseDown`, so matching this precisely meant moving the
shift-check to AFTER the handle checks and the wall-hit-test (both of
which stay exactly where they were), and only BEFORE the plain object
`hitTest()`/`if (hitId)` block — not moving it to the very top of the
function, which would have made shift wrongly override handles and
walls too.

Also chased, before shipping: shift+CLICK (no real drag) on an object is
an existing, working feature — `nextSelection`'s own shiftKey branch
toggles the clicked object in/out of the selection, called today via
`selectFromHit(hitId, !!evt.shiftKey, world)` inside the (now-bypassed
for shift) `if (hitId)` block. Moving the shift-check up would have
silently broken this: a shift+press that never turns into a real drag
would arm a marquee candidate that finds nothing to select on release
(`m.moved` never becomes true), doing nothing at all where today it
toggles the object. The SVG engine avoids this collision structurally —
each object's own `click` (not `mousedown`) DOM listener handles the
toggle independently of whatever the canvas's own `mousedown` armed, so
a mousedown that turns out not to be a drag can start a (harmlessly
abandoned) selbox AND still have the object's own click fire the toggle,
with no explicit code reconciling the two. canvas2 has no second listener
to fall back on, so the equivalent had to be built explicitly.

Cause:    Ordering — the shift-check ran after the exact branch it needed
to run before, for the same reason as the handle/wall checks: the
"what's specifically hit" tests (handles, walls, then plain object) don't
already know shift means "always start a marquee, don't interact with the
body," so nothing skipped straight to it.

Fix:      `onStageMouseDown` (`useCanvasInteraction.js`): computed the
plain `hitId`/`hitObj` and ran the wall-hit-test exactly as before (both
keep their existing precedence over shift, matching the handles/walls
being real, stopPropagation-ing DOM elements in the SVG engine). The
shift-check now sits immediately after the wall-hit-test and before the
`if (hitId) { selectFromHit; beginDrag }` block: if shift is held, arm
`marqueeRef.current` unconditionally — including a `clickHitId: hitId`
field, capturing what a plain click would have hit right now. Window
`mouseup`'s marquee handling gained an `else if (m && !m.moved &&
m.clickHitId)` branch: if the shift-drag never actually moved,
`selectFromHit(m.clickHitId, true, m.from)` reproduces exactly what the
bypassed `if (hitId)` branch used to do for a plain shift-click,
deferred to mouseup so a genuine drag still wins the marquee
interpretation.

Verify:   Real mouse, via Playwright, three scenarios against one floor
plan (with a rack parented inside it):
  - Shift+drag starting in the building's empty interior (well clear of
    the wall band and the rack), dragged across the rack: mid-drag
    screenshot shows the dashed blue marquee rectangle rendering inside
    the building. On release, `selectedIds` included the rack (plus the
    floor plan itself, from `objectsInMarquee`'s own pre-existing,
    separate — and out of this fix's scope — lack of a floor-plan
    exclusion the SVG engine's marquee has); the building's `x` stayed
    at its original value, confirming the press did NOT fall into
    "select and move the building," which is what it did before this fix.
  - A normal (no-shift) press-and-drag on the same building body (a
    different empty interior spot): the floor plan was selected AND
    moved by the drag delta, exactly as before this fix — unaffected.
  - A shift+CLICK (mousedown+mouseup with no real movement) on the rack,
    starting from an empty selection: the rack landed as the sole
    selected id — confirming the existing shift-click-to-toggle behaviour
    still works, no regression from moving the shift-check.
  Zero console errors across all three. Build clean (1789 modules),
  309/309 tests pass (no existing test touches this exact ordering).

Lesson:   "Move a check earlier so it isn't shadowed" is easy to get
half-right: moving it far enough to fix the reported case but not
checking what ELSE used to run before it (here: the wall-hit-test, and
critically, the do-nothing-if-hitId branch that also carried the
existing shift-click-to-toggle behaviour) turns a targeted bug fix into
two new regressions. The SVG reference's real DOM-event architecture
(separate `mousedown`-stoppropagation for handles/walls, a separate
`click` listener for toggle-on-release) doesn't translate as "shift
always wins, full stop" into canvas2's one-function funnel — it
translates as "shift wins over the plain object body specifically,
handles and walls keep their own precedence, and the click-vs-drag
distinction those separate DOM listeners gave for free has to be
rebuilt explicitly with the SAME movedEnough gate every other gesture
here already uses to tell a click from a drag."

---

## BUG 26 — BUG 25's marquee fix selected the floor plan along with the racks inside it

Symptom:  After BUG 25's fix, a shift+drag inside a building correctly
produced a marquee — but the marquee selected the FLOOR PLAN itself
alongside whatever racks it covered, offering a "Group" action for what
looked like an accidental rack+building selection. Shift+clicking a
single rack sometimes ALSO selected the building.

Chased:   BUG 25's own log entry already named this exact gap under
"Also chased" and explicitly flagged it as pre-existing and out of that
fix's scope: `objectsInMarquee` (selection.js) never excluded floor
plans, unlike CanvasArea's own marquee-mouseup (`if (FP_SET.has(obj.type))
return false`, checked before its own overlap test). A marquee that
starts or is dragged over a building necessarily overlaps the building's
own bounding box — which fills most of the visible canvas at any zoom a
marquee is useful at — so it was ALWAYS going to be caught by
`objectsInMarquee`'s plain overlap test alongside anything inside it.

The "shift+click sometimes also selects the building" half of the report
is the SAME bug wearing a different disguise, not a second cause: a
"click" is never perfectly still — a few pixels of incidental movement
during a real shift-click can cross `movedEnough`'s 3px threshold,
turning what was meant as a click into a (tiny) "moved" marquee, which
then runs through the exact same unfiltered `objectsInMarquee` and picks
up the building the press started inside, on top of whatever rack the
click landed on. Confirmed by reasoning through `hitTest`'s own pass
order rather than guessing: a precise, zero-movement click on a rack was
never actually at risk (Pass 1 checks racks before Pass 3 checks floor
plans, so `hitTest` itself already resolves a direct rack click
correctly) — only the accidental-micro-drag path shared the marquee's bug.

Cause:    A single missing exclusion, `objectsInMarquee` never filtering
out floor-plan types, surfacing through two different gesture shapes
(a deliberate drag, and a click whose incidental jitter crossed the
drag threshold) that both ultimately call the same function.

Fix:      `objectsInMarquee` (`selection.js`) now excludes floor plans
unconditionally — `if (isFloorPlan(o)) continue`, ported from
CanvasArea's own marquee filter — rather than requiring the one current
caller to remember to pass it as an opt-in `isVisible` predicate: the
exclusion is a correctness rule for what a marquee even means over a
building (its contents, never the shell), not a situational filter, so
it belongs in the function itself.

Verify:   Real mouse, via Playwright, three scenarios against the same
floor-plan-with-a-parented-rack setup BUG 25 used:
  - Shift+drag from the building's empty interior across the rack:
    `selectedIds` contained ONLY the rack — `includesFp: false,
    includesRack: true` — the building no longer rides along.
  - Shift+click (no real drag) directly on the rack: `selectedIds`
    contained only the rack, confirming the direct-click path (already
    fine per the pass-order reasoning above) still works and the fix
    didn't disturb it.
  - A normal (no-shift) press+drag on the building's own body (unrelated
    to this fix, re-verified so the exclusion didn't overreach): the
    floor plan was still selected AND moved by the drag delta, exactly as
    BUG 25 verified — `objectsInMarquee`'s exclusion only touches the
    marquee-drag/shift-click paths, not a direct plain-click hit on the
    building itself (which goes through `hitTest`'s own object-body
    branch, untouched by this change).
  Zero console errors across all three. Build clean (1789 modules),
  309/309 tests pass (no existing test touches this exact path).

Lesson:   Naming a known-but-out-of-scope gap explicitly in a bug-log
entry (BUG 25's own "Also chased" section flagged this precisely) is
worth doing even under time pressure to ship the actual fix — it turned
this follow-up into a five-minute, already-diagnosed fix instead of a
fresh investigation, and confirms the discipline of writing down "I saw
this, it's real, it's just not what I was asked to fix right now" pays
for itself the moment the deferred issue gets reported back. Also: two
differently-described symptoms ("drag selects the building" and "click
sometimes selects the building") are worth checking for a SHARED root
cause before assuming two fixes are needed — tracing both through the
same `hitTest`/`movedEnough`/`objectsInMarquee` call graph, rather than
patching each report's literal wording separately, found the one place
that actually needed to change.

---

## BUG 27 — BUG 26's fix was incomplete: a floor plan selected BEFORE the marquee still survived it

Symptom:  After BUG 26's fix (excluding floor plans from
`objectsInMarquee`'s own catches), a shift-marquee could STILL leave the
building selected alongside the racks it caught — screenshot showed the
purple group-rotate outline (2+ objects) with the building included.

Chased, per the user's own explicit instructions, empirically rather than
by further guessing: reproduced with the debug store hook by
deliberately selecting the floor plan FIRST (`selectObject(fpId, false)`
— a realistic prior step, e.g. clicking the building to inspect it
before shift-dragging to also grab some racks), THEN performing the
identical shift-marquee BUG 26's own test used. Logged `selectedIds`
before and after: `["<fpId>"]` before, `["<fpId>", "<rackId>"]` after —
the floor plan was never in `objectsInMarquee`'s own returned list (BUG
26 already guarantees that), yet it survived anyway, proving the leak
was NOT in what the marquee catches but in what happens to whatever was
ALREADY selected. Root cause: `selectMultiple` (the store action the
marquee-mouseup calls) only ever ADDS — `s.selectedIds.push(id)` for ids
not already present — it never removes anything, so a floor plan
selected by any EARLIER, unrelated action was never going to be cleared
by BUG 26's fix, however completely that fix excluded the floor plan
from the NEW ids being added. BUG 26 made the marquee stop selecting the
building; it didn't make the marquee stop TOLERATING one.

Cause:    `selectMultiple`'s additive-only semantics, combined with BUG
26's fix only ever touching the NEWLY computed marquee ids and never the
selection state the gesture started with.

Fix:      `useCanvasInteraction.js`'s marquee mouseup, in the
`m.moved && m.to` branch: before adding the marquee's own catches,
filter the CURRENT `selectedIds` to drop any floor-plan entries
(`isFloorPlan`, already imported) and — only if that actually changed
anything — replace the selection with `selectGroup(keep)` (a real
replace, unlike `selectMultiple`'s add-only). `selectMultiple(ids)` for
the marquee's own (already floor-plan-free, per BUG 26) catches still
runs afterward exactly as before. The net effect: whatever was selected
before the gesture, minus any floor plans, plus whatever the marquee's
rectangle covers — the marquee redefines what its own rectangle means,
it does not inherit a building selection from a moment before it began.

Verify:   Real mouse, via Playwright, with the debug store hook printing
`selectedIds` at each step exactly as asked:
  - Reproduced the bug first (pre-fix code path confirmed via the
    investigation script): floor plan selected, then shift-marqueed —
    `selectedIds` ended up `[fpId, rackId]`, matching the reported
    screenshot exactly.
  - Same scenario against the fix: floor plan selected
    (`selectedIds: [fpId]`), then the identical shift-marquee —
    `selectedIds` ended up `[rackId]` only; `includesFp: false`.
  - Cold-start shift-marquee (nothing selected beforehand, BUG 26's own
    scenario): still only the rack — confirms the new `keep`-filter step
    is a no-op when there was nothing to strip, not a behaviour change
    for the already-working case.
  - Shift+click a rack (no drag): still only the rack — the click-fallback
    path (`m.clickHitId`) is untouched by this fix, confirming it wasn't
    itself a second source of the leak.
  - Normal (no-shift) drag on the building's own body: still selects AND
    moves it, exactly as BUG 25 verified — this fix only touches the
    `m.moved && m.to` marquee branch, nothing about a direct plain-click
    hit on the building.
  Zero console errors across all five. Build clean (1789 modules),
  309/309 tests pass (no existing test touches this exact path).

Lesson:   "The new thing this gesture selects doesn't include X" and "the
gesture's final result never includes X" are different guarantees, and
conflating them is exactly how BUG 26 shipped looking complete while
leaving this gap: it correctly stopped `objectsInMarquee` from CATCHING
a floor plan, which is necessary but not sufficient when the store
action consuming that list (`selectMultiple`) is additive rather than
authoritative. Whenever a fix's own verification only tests from a
freshly-cleared selection (as BUG 26's did), it silently assumes nothing
useful survives from before the gesture — worth checking explicitly,
with a NON-empty starting selection, any time a store action is
add-only rather than a full replace. Also: reproducing a report exactly
as the user describes it (a debug hook printing the real store state
before and after, on the SAME gesture sequence they experienced) turned
"the fix didn't work, try again" into a five-line confirmed root cause
before a single line of new code was written — worth doing before
patching a symptom a second time, not just the first.

---

## BUG 28 — Column grid intercepted rack marquee selection, same as the floor plan did

Symptom:  Reported as two things together: "clicking a rack selects the
column grid instead of the rack" and "marquee-selecting rows catches the
column grid too." A generated (or hand-added) column grid spans the
whole building, the same shape of problem BUG 25-27 already fixed for
the floor plan.

Chased:   Investigated both halves independently rather than assuming
two fixes were needed, the same discipline BUG 27 used. `hitTest.js`'s
main function (the geometry-based CLICK picker) turned out to be
ALREADY correct — its own three-pass structure (Pass 1: every ordinary
object including racks, explicitly skipping column_grid/floor plans;
Pass 2: column_grid, but ONLY hit-testing actual column squares with
their own small pad, never the whole bounding box; Pass 3: floor plans
last) has been unchanged since the original geometry-picking port
(`git log` shows the file untouched by this shape of change since
`8717c60`). Verified empirically, not just by reading the code: seeded a
rack DELIBERATELY straddling a column square (the worst-case overlap —
the click point was inside BOTH the rack's body and the column square's
own padded hit box) and clicked it — the rack won, every time, exactly
as Pass 1 returning before Pass 2/3 ever run guarantees. A bare click on
an actual column square (no rack there) still correctly selected the
grid. Part (1) of the report was already fixed; no code changed for it.

Part (2) was real: `objectsInMarquee` (selection.js) excluded floor
plans (BUG 26) but never column_grid — and a REAL column_grid object (as
`generate/sizingLayout.js` actually creates one) carries genuine
`width`/`height` spanning the whole building
(`width: nx*gridXFt*GS + colPx`), so it was always going to be caught by
any marquee rubber-band touching it, exactly like the floor plan before
BUG 26. (A first attempt at reproducing this used a column_grid object
with no `width`/`height` set, which gave a false "already excluded"
result — `getObjectBounds`'s generic fallback treats missing width/height
as 0, so a degenerate object can never overlap anything; fixed the test
setup to match `sizingLayout.js`'s real shape before trusting the result
either way.) Also chased, proactively: BUG 27's own "a pre-existing
selection survives an additive `selectMultiple`" fix only filtered
`isFloorPlan` — a column grid selected before a marquee would have hit
the identical survival bug BUG 27 already diagnosed and fixed for the
building, just unfixed for the grid, so this entry closes that gap too
rather than leaving a second, differently-shaped version of BUG 27 to be
reported back later.

Cause:    Two related but genuinely separate gaps in the same file, both
missing a type this feature has to treat the same as a floor plan:
`objectsInMarquee`'s own exclusion list, and the BUG 27 "keep" filter
that strips a pre-existing exclude-worthy selection before a marquee
adds its own catches.

Fix:      `selection.js`: `objectsInMarquee` now excludes `column_grid`
alongside floor plans. The two exclusions were unified into one exported
predicate, `isMarqueeExcluded(obj)`, rather than duplicating the check —
CanvasArea's own reference marquee filter only names `FP_SET`, not
column_grid, so this is a deliberate improvement beyond a literal port
(the user's own instruction was explicit about wanting it), not a port
of an existing SVG exclusion; noted here rather than silently claimed as
"matching the reference." `useCanvasInteraction.js`'s BUG 27 keep-filter
now calls the SAME `isMarqueeExcluded` instead of `isFloorPlan` directly,
so the "what does a marquee refuse to select, and what does it strip
from a selection it inherits" question is answered in exactly one place
— the two could not have drifted apart again the way BUG 26/27 already
showed they could.

Verify:   Real mouse, via Playwright, with a REALISTIC column_grid
(matching `sizingLayout.js`'s own field shape: `width`/`height` spanning
the building, `spacingX`/`spacingY`/`columnW`/`columnH`) and a rack
deliberately straddling one of its column squares:
  - Click on the rack, at a point also inside the column square's own
    padded hit box: rack selected, grid not — confirms part (1) was
    already correct.
  - Click a bare column square: grid selected — confirms the fix didn't
    overreach and disable direct column-grid selection entirely.
  - Marquee across the rack (cold start, nothing selected before): only
    the rack — grid and floor plan both excluded.
  - Grid selected FIRST, then the identical marquee (the BUG-27-shaped
    repro, now for the grid): grid correctly dropped, only the rack
    remains — confirms the shared `isMarqueeExcluded` predicate closed
    the same survival gap BUG 27 fixed for the floor plan.
  Zero console errors across all four. Build clean (1789 modules),
  309/309 tests pass (no existing test touches this exact path).

Lesson:   A bug report that names two symptoms doesn't guarantee two
root causes, but it also doesn't guarantee ONE — checking each half
independently (here: one already fixed, one real) beats assuming either
answer up front. Separately, the SAME class of gap (BUG 26's missing
exclusion, BUG 27's missing pre-existing-selection strip) recurring for
a SECOND type in the very next report is exactly why BUG 27's own lesson
("whenever a store action is add-only rather than a full replace, check
explicitly with a non-empty starting selection") is worth applying
PROACTIVELY the next time a similar type needs the same treatment,
rather than waiting for it to be reported again — done here by
extending BUG 27's own fix to column_grid in the same commit as BUG 26's
extension, instead of shipping only the newly-reported half and leaving
the other gap for a BUG 29 to rediscover.

---

## Template for new entries

```
## BUG N — one-line symptom  (date / commit)
Symptom:  what the user actually saw.
Chased:   wrong turns tried (so nobody repeats them).
Cause:    the real root cause, technically.
Fix:      the exact change + where.
Lesson:   the general rule that prevents the class of bug.
```
