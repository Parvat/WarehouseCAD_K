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

## Template for new entries

```
## BUG N — one-line symptom  (date / commit)
Symptom:  what the user actually saw.
Chased:   wrong turns tried (so nobody repeats them).
Cause:    the real root cause, technically.
Fix:      the exact change + where.
Lesson:   the general rule that prevents the class of bug.
```
