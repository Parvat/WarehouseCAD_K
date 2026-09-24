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

## BUG 29 — Cross-row bay marquee was missing from canvas2: a rubber-band drag only selected whole objects, never bays

Symptom:  Dragging a marquee across the bays of one or more racks under
canvas2 only ever selected the RACKS as whole objects — the SVG engine's
cross-row bay marquee (drag a rubber-band across bay columns spanning
multiple rows, delete/resize them all in bulk via the multi-bay panel)
had no canvas2 equivalent at all. `activeBaySelection` (the store array
the bulk panel reads) was only ever populated one bay at a time, via the
existing single-bay click (`hitTestBay`, BUG 4's own port) — never by a
marquee.

Chased:   The store's own bay-multi-select actions (`setBaySelection`,
`toggleBayInSelection`, `deleteSelectedBays`, `changeSelectedBaysBeam`,
`clearBaySelection`) already existed, unused by canvas2 — this whole
feature was a pure INPUT-side gap (nothing to compute which bays a
rubber-band actually touches), not a missing store capability. Likewise
the bulk-action UI itself (`MultiBayPanel`, `src/components/RightPanel/
panels/RackRowPanelCore.jsx`) already reads `activeBaySelection` directly
from the store and is mounted unconditionally in `PropertiesPanel.jsx` —
canvas-engine-agnostic, needing no canvas2-specific changes at all. The
entire port was: compute the bay entries, write them to the store the
same way the SVG engine's marquee-mouseup does, and paint a highlight —
everything downstream of `activeBaySelection` already worked.

Also chased: the SVG reference's own `BAY_ROW_TYPES` set lists
`rack_pushback`/`rack_pallet_flow`/`rack_drive_through`/`rack_cantilever`
alongside `rack_row`/`rack_double_row`, but the intersection algorithm's
own `!obj.beams` guard means only the two beam-array types can ever
actually produce an entry in practice (pushback/pallet_flow/drive_through
use lane geometry, cantilever uses towers — none carry a `.beams` array).
Ported the type set verbatim rather than narrowing it to "just the two
that work" — matching the reference exactly, dead branches included,
rather than second-guessing which of its own listed types it meant.

Cause:    Not a bug — a genuine missing port, the same "SVG feature deep
inside one mousemove/mouseup handler, easy to miss porting file-by-file"
shape as BUG 19 (group rotate) and BUG 22 (smart guides).

Fix:      `selection.js` gained `bayEntriesInMarquee(objects, rect,
gridSize)` — CanvasArea.jsx's own marquee-mouseup bay-intersection block
(~953-968) ported verbatim: same `BAY_ROW_TYPES` set, same cursor walk
(`obj.x + upW`, one bay per `beams` entry, step past its own upright each
time), same per-bay X-overlap test against the marquee rect. Pure
function, no React/Konva/store — the same "one computation, not two that
could drift" discipline every other canvas2 geometry helper follows
(CANVAS2.md rule 4).

`useCanvasInteraction.js`'s marquee mouseup (already calling
`objectsInMarquee` for whole-object selection) now also calls
`bayEntriesInMarquee` on the same normalized rect, unconditionally
set-or-clearing `activeBaySelection` on every "moved enough" marquee
release — CanvasArea's own behaviour: a fresh marquee always redefines
the bay selection, including an empty one that finds nothing. Rack rows
with a bay entry are added to `selectedIds` too (guarded to only ADD, not
toggle off an already-selected row — the reference's own guard), so the
Properties panel shows them.

`shapes.jsx`: the existing single-bay highlight geometry
(`activeBayRects`, rack_row/rack_double_row/rack_cantilever) was factored
into a shared `bayRectForIndex(obj, gridSize, i)` so the single-active
(blue) and new cross-row-marquee (amber) highlights can never disagree
about where a given bay actually is. New `multiBaySelectionRects(obj,
gridSize, activeBaySelection)` maps the store's array to this object's
own bay rects. `RackShape` paints them as CanvasUI's own two-part
treatment — a semi-transparent amber tint UNDER a dashed amber outline —
kept visually distinct from the single-active blue outline, matching
ShapeGeometry.jsx's own colour split between the two selections rather
than merging them into one visual. `Scene.jsx` reads `activeBaySelection`
from the store and threads it to `RackShape`.

Verify:   Real mouse, via Playwright. Two `rack_row` objects, 3 bays each
(96in beams), 100 world units apart in Y — a CROSS-ROW case, not a
single-rack one. Dragged a marquee (shift-held, starting from empty space
above the first row) diagonally down across bays 0-1 of both rows (bay 2
of each deliberately left outside the rubber-band). `activeBaySelection`
landed with EXACTLY 4 entries — {row A, bay 0}, {row A, bay 1}, {row B,
bay 0}, {row B, bay 1} — both racks correctly in `selectedIds`.
Screenshot confirms the amber tint+outline highlight on the selected
bays. Called `deleteSelectedBays()` (the same store action `MultiBayPanel`
calls): both rows dropped to a single remaining bay (`beams: [96]`) each,
in ONE history entry (`historyIndex` advanced by exactly 1 for both rows'
worth of changes). `undo()` once restored `[96,96,96]` to BOTH rows
exactly. Zero console errors throughout. Build clean (1789 modules),
309/309 tests pass (no existing test touches this path).

Lesson:   Not every "missing feature" needs new UI or new store surface —
this one turned out to be a single input-side gap sitting between two
things that already worked (the store's bay-selection actions, and the
bulk-action panel that reads them), because nothing on the canvas2 side
had ever been asked to compute WHICH bays a gesture touched across
multiple rows at once. Before building new plumbing, checking what
already reads/writes the target store field (here: grep for
`activeBaySelection` across the WHOLE src tree, not just canvas2/) finds
these cases fast and avoids duplicating a bulk-action UI that already
exists and is already engine-agnostic. Also, once more: a reference's own
type list can include entries its own algorithm structurally can't reach
(BAY_ROW_TYPES' cantilever/pushback/pallet_flow/drive_through) — porting
it verbatim rather than "cleaning it up" preserves that exact behaviour,
including its dead branches, which is the correct call when the
instruction is specifically to port the math, not to redesign it.

---

## BUG 30 — Bay-select mode showed group-rotate chrome, and Delete deleted whole rows instead of the selected bays

Symptom:  Two related inconsistencies in cross-row bay selection (BUG 29),
both about bay-select mode not being treated as its own distinct mode:
  1. After a bay marquee across 2+ rows, the purple group-rotate outline
     + rotate handle (GroupRotateOverlay, BUG 19) appeared around the
     racks — chrome for "rotate this group as a unit," not for "these are
     the bays you picked," which the amber bay highlights already show.
  2. Pressing Delete with a cross-row bay selection active deleted the
     WHOLE racks, while the multi-bay panel's own "Delete selected bays"
     button (`deleteSelectedBays`) correctly deleted only the picked
     bays — the keyboard and the panel disagreed about what the current
     selection even meant.

Chased:   Both root causes were narrow and independent, not one shared
mistake:
  - GroupRotateOverlay's own mount condition (`Canvas2.jsx`) is
    `selectedObjects.length >= 2` — and BUG 29's own bay-marquee fix adds
    every matched row to `selectedIds` (so the Properties/multi-bay panel
    shows them), which satisfies this exact condition as an unavoidable
    side effect of making the bulk panel work at all. The overlay was
    never taught that `activeBaySelection` (a DIFFERENT store array) being
    non-empty means the CURRENT intent is "pick bays," not "rotate this
    selection as a group."
  - `useKeyboardShortcuts.js`'s Delete handler only ever checked ONE
    thing for a bay-aware delete: a SINGLE selected object's own
    `activeBayIdx` field (the per-object single-bay-click pick, BUG 4's
    original port) — it never looked at `activeBaySelection` (the
    cross-row array BUG 29 introduced) at all, so with 2+ rows selected
    via a bay marquee, `selectedIds.length === 1` was already false and
    the handler fell straight through to whole-object `deleteSelected()`.

Cause:    Two pieces of chrome/behaviour (GroupRotateOverlay's mount
gate, the keyboard Delete handler) were written before `activeBaySelection`
existed as a concept (both predate BUG 29) and neither was updated when
it was introduced — a cross-row bay selection quietly satisfies both
gates' EXISTING conditions (2+ objects selected; one object with no bay
picked) well enough that nothing crashed or looked obviously broken,
it just meant the wrong thing.

Fix:      `Canvas2.jsx`: read `activeBaySelection` from the store, and
gate `GroupRotateOverlay` on `selectedObjects.length >= 2 &&
!(activeBaySelection && activeBaySelection.length > 0)` — bay-select mode
suppresses the group chrome entirely, leaving only RackShape's own amber
`multiBaySelectionRects` highlights and each rack's own plain blue
selection outline. The single-object `ResizeHandlesOverlay`/
`FpRotateHandleOverlay` gates are untouched — a bay marquee landing on
just one row never reaches the `>= 2` gate regardless, so there is
nothing there to suppress.

`useKeyboardShortcuts.js`: the Delete/Backspace handler now checks
`activeBaySelection.length > 0` FIRST, before the existing single-object
`activeBayIdx` check, and calls `s.deleteSelectedBays()` — the exact same
store action `MultiBayPanel`'s own "Delete selected bays" button calls
(`src/components/RightPanel/panels/RackRowPanelCore.jsx`) — so the
keyboard and the panel can never disagree about what Delete does while a
bay selection is active.

Verify:   Real mouse, via Playwright, with the same fp+two-rack-rows
setup BUG 29 used. Bay-marqueed bays 0-1 across both rows: screenshot
shows only the amber bay tints and each rack's own plain blue outline —
no purple dashed box, no rotate handle, matching the earlier BUG 29
screenshot's group-rotate chrome being visibly ABSENT this time.
`selectedIds` still had both racks (2 objects, Properties panel correctly
showed "2 objects selected"); `activeBaySelection` had the expected 4
entries. Pressed the Delete key: both racks STILL EXISTED as objects
(`objectCount` unchanged) with `beams` dropped to `[96]` (bay 2, the one
outside the marquee) on both — not a whole-row delete — in exactly ONE
history entry, `activeBaySelection` cleared afterward. `undo()` once
restored `[96,96,96]` to both rows exactly. Zero console errors
throughout. Build clean (1789 modules), 309/309 tests pass (no existing
test touches either path).

Lesson:   Introducing a new selection CONCEPT (`activeBaySelection`,
BUG 29) doesn't automatically teach every EXISTING piece of code that
reads a related but different signal (`selectedIds.length`, a single
object's own `activeBayIdx`) about it — each one has to be checked and
updated deliberately, because the new concept can satisfy an old gate's
condition by coincidence (2+ selectedIds) without meaning what that gate
assumed it meant. The place to look for this class of gap is: grep every
existing consumer of the OLD signal a new feature's selection state
overlaps with, not just build the new feature's own code path and assume
everything downstream already composes correctly.

---

## BUG 31 — BUG 30's fix was incomplete: group-rotate chrome reappeared right after a bay delete

Symptom:  BUG 30 correctly suppressed the group-rotate outline/handle
while a cross-row bay selection was active, and made Delete route to
`deleteSelectedBays`. But immediately AFTER deleting the selected bays,
the group outline + rotate handle reappeared around the (now bay-less)
racks — the exact chrome BUG 30 had just hidden, back the moment the
bays it was hiding disappeared.

Chased:   `deleteSelectedBays` (the store action) only ever clears
`activeBaySelection` — it does not touch `selectedIds`. The rack ROWS a
bay marquee added to `selectedIds` (BUG 29, so the Properties panel shows
them) stay selected after the delete. With `activeBaySelection` now
empty, `GroupRotateOverlay`'s own gate (`selectedObjects.length >= 2 &&
!(activeBaySelection.length > 0)`, BUG 30's own fix) is satisfied again
— the SAME condition that made the chrome disappear during bay-select
mode makes it reappear the instant that mode ends, because "bay-select
mode ended" and "2+ objects are still selected" both became true at
once. Also chased, and confirmed real but out of THIS fix's scope:
`PropertiesPanel.jsx`'s own "multi-select" branch
(`selected.length > 1`) returns its own generic "N objects selected /
Delete all" UI BEFORE ever reaching the line that mounts `MultiBayPanel`
(mounted only in the single-object branch further down) — meaning for
any genuine CROSS-ROW bay marquee (which inherently leaves 2+ racks
selected), the panel's own "Delete selected bays" button is currently
unreachable in the UI at all, independent of this bug. Logged here for
visibility rather than silently expanded into: the keyboard Delete path
this fix verifies is unaffected by it and already satisfies the reported
symptom and its own verify criteria in full.

Cause:    `deleteSelectedBays` clears the bay selection but not the
object selection it rode in on, so the post-delete state is
indistinguishable from "2+ racks selected, nothing bay-specific active"
— which is precisely the state GroupRotateOverlay's gate treats as "show
the group chrome."

Fix:      Both call sites of `deleteSelectedBays` now also clear the
whole selection afterward, so nothing is left selected once the bays it
referred to are gone:
  - `src/hooks/useKeyboardShortcuts.js`'s Delete/Backspace handler calls
    `s.clearSelection()` right after `s.deleteSelectedBays()`.
  - `RackRowPanelCore.jsx`'s `MultiBayPanel` "Delete N bays" button now
    calls a small wrapper, `deleteSelectedBaysAndClear` (`deleteSelectedBays();
    clearSelection()`), instead of passing the raw store action straight
    to `onClick` — so the panel and the keyboard can never disagree here
    either, matching BUG 30's own "keyboard and panel do the same thing"
    goal. `clearSelection` (an existing, already-exported store action)
    is used from the CALL SITES rather than editing the protected
    `deleteSelectedBays` action itself to add this — a plain function
    composition, not a change to `useCanvasStore.js`.

Verify:   Real mouse, via Playwright, with the same fp+two-rack-rows
setup BUG 29/30 used. Bay-marqueed bays 0-1 across both rows, then
pressed the Delete key: `selectedIds` ended up `[]` (empty — not the two
rack ids), `activeBaySelection` `[]`, both racks' `beams` correctly
dropped to `[96]`, ONE history entry for the whole gesture. Screenshot
confirms the RightPanel reads "No object selected" and the canvas shows
no selection outline, no group box, no rotate handle — nothing left
selected at all, not merely the group chrome specifically suppressed.
`undo()` once restored `[96,96,96]` to both rows exactly. Zero console
errors throughout. Build clean (1789 modules), 309/309 tests pass (no
existing test touches this exact path).

Lesson:   A gate that reacts to "condition X is now false" (BUG 30's
`!activeBaySelection.length`) can flip back to its OTHER state the
instant something ELSE changes X's sibling state, even without that
sibling ever being the thing the gate was written to watch —
`GroupRotateOverlay`'s gate was never wrong about `activeBaySelection`,
it was just never told that `selectedIds` staying populated after a bay
delete would recreate the exact condition ("2+ objects selected, no
active bay picking") it treats as "show group chrome." Whenever a fix
clears one piece of a two-part state (here: bay selection, but not
object selection) to make a gate read a certain way, check what happens
to the OTHER piece once the action completes — it's easy to fix the
piece a bug report names and leave the sibling in a state that quietly
reopens the same gate a moment later.

---

## BUG 32 — Bay deletion always shrank a rack from its stored x, sliding right-segment rows away from their wall

Symptom:  Deleting bays from a rack row left the SURVIVING bays anchored
to `obj.x` (the object's stored left edge) no matter which bays were
actually removed. For a row whose wall sits on its LEFT (`obj.x` IS the
wall-facing edge — the common case), this happened to look correct: the
wall end never moved. For a row whose wall sits on its RIGHT — the SECOND
half of a building split by a cross-aisle (`sizingLayout.js`'s own
`rowSegments`, which places two independent rack objects, one starting
right after the cross-aisle and running toward the far wall) — `obj.x`
is the AISLE-facing edge, so keeping it fixed shrank the rack from the
WALL end instead, visibly sliding the whole row toward the aisle with
every delete. The correct bays were removed every time; only the
rack's REPOSITIONING was wrong.

Chased:   Confirmed there is no stored field anywhere (`generate/`,
`render/rackOps.js`, the object shape itself) recording which geometric
end of a rack is "the wall" — a right-segment row is not a mirrored or
flagged variant of a left-segment one, it is a perfectly ordinary
`rack_row` object that simply happens to sit further along the building,
with the identical `beams`-indexed-left-to-right convention `uprightXs`
already uses for every rack regardless of where it was placed. This
means the fix cannot look up "which end is the wall" from any existing
data; it has to infer the right invariant from the deletion itself. Also
chased: `deleteSingleBay` (the earlier, single-bay-click version of this
same action) has the IDENTICAL structural gap — it also always leaves
`obj.x` untouched. Not named in the task, but fixed here anyway rather
than left for a future report to rediscover the exact same bug in the
older of the two nearly-identical actions (the BUG 28 lesson: extend a
fix to a sibling with the same shape proactively).

Cause:    Both `deleteSingleBay` and `deleteSelectedBays` only ever
recompute `obj.width` from the surviving `beams` array; neither ever
touches `obj.x`, so the surviving bays always compact toward whatever
`obj.x` happens to be — correct only when `obj.x` happens to coincide
with the end that should stay fixed, which is true for a left-segment
row by coincidence of how it was placed, not by any rule the deletion
code itself was applying.

Fix:      Both actions (`useCanvasStore.js`) now decide which edge to
hold fixed from the DELETION ITSELF, not from any assumption about which
side is the wall: if the FIRST bay (index 0) was removed but the LAST
bay was not, the far/last end was left untouched and should stay
fixed — `obj.x` shifts by exactly the amount the rack shrank
(`obj.x += oldWidth - newWidth`) so that edge (`obj.x + width`) lands at
the SAME world position it was at before the delete. Every other case
(the last bay removed, both ends removed, only an interior bay removed)
keeps the existing behaviour (`obj.x` unchanged) — already correct when
the deletion is at the far/last end, and the least-surprising default
for the genuinely ambiguous cases (an interior-only deletion, or a
delete spanning both ends at once) that "which end did the user NOT
touch" cannot answer cleanly anyway. This generalises correctly to
EITHER segment orientation without needing to know which one it is: a
left-segment row's wall-adjacent bay is index 0 (deleting it moves x,
which is geometrically correct — that wall-adjacent slot is now empty,
so the edge SHOULD recede rather than leave a phantom gap against the
wall); a right-segment row's wall-adjacent bay is the LAST index
(deleting the near-aisle end, index 0, leaves the last index untouched
and triggers the x-shift that keeps the actual wall edge fixed).

Verify:   Numerically, via Playwright and the debug store hook — no
screenshot needed, the fix is a pure geometry correction verifiable
exactly. Two `rack_row` objects, 3 bays each (96in beams, 3in uprights,
1000px total width): a "right-segment" row at `x=500` (wall edge =
`x+width` = 1500) and a "left-segment" row at `x=0` (wall edge = `x` =
0). Deleted the aisle-adjacent bay (index 0) from the right-segment row
via `setBaySelection`+`deleteSelectedBays` (the same path a bay marquee
and `MultiBayPanel`'s own button use): `x` moved from 500 to EXACTLY 830,
width shrank to 670, and `x + width` landed at EXACTLY 1500 — the
original wall edge, unmoved, to the pixel. Deleted the aisle-adjacent
bay (index 2, the LAST index for this segment) from the left-segment
row: `x` stayed at EXACTLY 0 — confirming BUG-report's own "left-segment
still correct" requirement wasn't disturbed. Two separate `undo()` calls
(one per delete, each its own history entry) restored both racks' exact
original `x`, `width`, and `beams`. Zero console errors. Build clean
(1789 modules), 309/309 tests pass (no existing test touches this exact
math).

Lesson:   A store action that "happens to look correct" for one common
input shape (a rack whose wall sits on the same side its own coordinate
origin does) can hide a genuine geometry bug for a long time if nothing
ever exercises the mirrored shape — this bug predates canvas2 entirely
(both `deleteSingleBay` and `deleteSelectedBays` are shared store code,
so the SVG engine had the identical bug the whole time), and only
surfaced now because BUG 29's cross-row bay marquee made bulk-deleting
bays across differently-oriented rows an easy, obvious thing to try for
the first time. When a fix needs "which end should stay fixed" and no
field records that, look for whether the ANSWER can be derived from the
operation's own inputs (here: which indices were actually removed)
instead of trying to add or infer a new "which side is the wall" concept
from geometry that would need consulting the containing floor plan and
would be far more fragile.

## BUG 33 — checkColumns's travel-aisle detection never fired for any layout with a cross-aisle

Symptom:  Asked to test a 240×120 building (20×25 column grid, double-deep,
reach truck) for columns landing in a travel aisle, `checkColumns` reported
`aisleBlocks: []` — zero columns tested, let alone flagged — even though a
manual, independent geometry check found 9 columns sitting well inside a
10.5ft aisle with only 6.5ft clear on either side (reach truck needs 10ft).
The generator's own two-segment layout (every row split into a left and
right run by the cross-aisle) made this a near-universal miss: any standard
generate has the bug, not just this grid.

Chased:   `checkColumns`'s aisle pass sorted ALL racks in the layout by `y`
and paired each with the next entry in that sort, treating any pair whose
X-ranges failed to overlap as "not really adjacent, skip." For a single-run
layout (no cross-aisle) that is exactly right. It breaks the moment a
building has two segments, because every row band contributes TWO rack
objects at the identical `y` — one per segment. In a global Y-sort those two
land next to each other (same y, so `gapH <= 0`, skipped), and the entry on
either side of THAT pair belongs to the OTHER segment (zero X-overlap,
skipped too). The one pairing that would have found a real aisle — the same
segment's row at the NEXT band down — is never adjacent in the sort at all,
because the other segment's row for THIS band sits between them. Confirmed
by dumping the actual sort order for the 240×120/50×54 case: `[wall-L,
wall-R, pair1-L, pair1-R, pair2-L, pair2-R, ...]` — every consecutive pair is
either same-y or cross-segment, with no exceptions, for the whole list.

Cause:    Pairing by "next in a Y-sort of every rack in the building" implicitly
assumed one rack per row band. `rowSegments` (Step 1) has always produced two
per band (a left run and a right run either side of the cross-aisle), so the
assumption was wrong for every layout the generator actually produces, not an
edge case.

Fix:      `columnCheck.js` now groups racks into runs FIRST — `groupBySegment`,
a small union-find over pairwise X-range overlap (not exact `x` equality, so a
hand-resized bay that still overlaps its neighbours' span groups correctly,
not just an untouched generated layout) — and only THEN sorts each run by `y`
and looks for gaps between consecutive rows within that one run. A column is
tested against an aisle only if it falls in a gap between two racks that
actually face each other along the same run.

Verify:   240×120/20×25/double-deep/reach, through the real `checkColumns`
(not a workaround script): `aisleBlocks` now has 27 entries (columns actually
tested against a real gap) with 9 `blocked: true` — 5 in the left segment
(X=60,80,100,120,140), 4 in the right (X=160,180,200,220), all at the Y≈25
aisle between the wall and the first interior pair, each with 6.5ft clear
against the reach truck's 10ft minimum — exactly matching the independent
manual check from the prior report. Sanity-checked the 240×120/50×54 case
too: `aisleBlocks` now returns 4 tested entries (the trailing 23ft gap, which
clears easily — 0 blocked) instead of the previous 0/0, and `flueSeated`/
`rackConflicts` (BUG unrelated to this fix, already correct) are unchanged at
4/4. Build clean (1789 modules), 309/309 tests pass — no shifting logic
added, Step 3's actual move-and-search is still unbuilt.

Lesson:   A "sort everything, pair consecutive entries" approach silently
assumes there is exactly one of the thing being paired per position along the
sorted axis. The generator has produced two racks per row band since Step 1
existed (the cross-aisle split is not new), so this bug was latent from the
moment column-aware placement started being asked about at all — it just
never got exercised because nothing before this had actually tried to read
`aisleBlocks` and compare it against an independent expectation. Group by the
thing that actually defines adjacency (here: which run a rack belongs to)
before sorting for adjacency within it, rather than sorting the whole
collection and hoping X-overlap alone filters out the cases that don't belong
together.

## BUG 34 — Step 1's fixed-pitch row placement stranded columns in travel aisles by construction

Symptom:  240×120 building, 20×25 column grid, double-deep racking, reach
truck — 9 real columns landed in a travel aisle (the gap between the wall
and the first interior pair), each with only 6.5ft clear against the reach
truck's 10ft minimum. Not a rare edge case: Step 1's row placement never
looked at the column grid at all when deciding where a row went, so any
column grid whose lines didn't happen to coincide with the fixed tight
pitch was guaranteed to leave some columns stranded exactly like this.

Chased:   Step 1 (the "fix aisle logic" correction) deliberately made row
spacing depend ONLY on the forklift's aisle input — the right call for
getting the AISLE WIDTH correct, but it meant a row's Y position was fixed
before anyone asked whether a column was about to land in the gap above or
below it. Confirmed via BUG 33's corrected aisle-check that this wasn't a
detection bug this time — the columns really were sitting in real travel
aisles, correctly reported once BUG 33 fixed the detector.

Cause:    Row placement and column-seating were two unrelated calculations
that happened to share a building. Nothing in `rowBands` ever adjusted a
row's position in response to where the real column grid put a column, so
whether a column ended up seated, in a bay, or stuck in an aisle was pure
coincidence of whether the column pitch happened to line up with the
forklift-driven tight pitch.

Fix:      `rowBands` (`sizingLayout.js`) replaces the fixed-pitch interior
walk with a single FORWARD PASS (STEP_3B_SPEC.md) from the near wall to the
far wall: place a row, lock it, and never revisit it. At each step, look at
the nearest upcoming column line — if centring the next pair's flue on it
still leaves at least the forklift's minimum aisle above the last locked
row, place it there (a wider-than-minimum aisle is accepted; seating wins
over squeezing rows tight). If seating would need less than the minimum, or
the column is far enough away that reaching it would waste an entire extra
row's worth of depth, place the pair tight at exactly the minimum instead —
that column then becomes a bay-column (kept, flagged, -1/level) or gets
re-evaluated against the NEXT locked row instead. Deterministic, single
pass, no cascading or re-checking a locked row — termination is automatic
since every step advances by at least pairDepth + minAisle. No branch-and-
compare / max-positions search yet — that's later, once this simple pass is
confirmed correct.

Verify:   240×120/20×25/double-deep/reach, through the real generator and
`checkColumns`: bands now at yFt = 0(wall), 21.25, 46.25, 71.25, 96.25,
116.5(wall) — aisles 17.75/17.5/17.5/17.5/12.75, all comfortably ≥ 10.5.
Column check: 36 flue-seated (was 0), 9 bay-conflicts (was 27), **0
aisle-blocked (was 9)** — every column that was stranded in a travel aisle
is now either seated or safely inside a bay. Row count dropped from 14 to
12 (one fewer interior pair per segment) — the accepted trade of floor
space for a fully accessible layout, per spec. Net capacity 1564 (was
1888 post-BUG-33/pre-3b). Cross-checked two more cases: 240×120/50×54
reproduces the same 14-row layout as before with pair 3 now seated exactly
on its column line (was 0.25ft off) — nothing regressed, and one more
column moved from "off by a hair" to "exactly seated." A 120ft-wide/25ft-
pitch/42in-frame/12in-flue sanity check (the very first hand-worked PP
example from the start of this whole effort) reproduces its known bands
(17.5/17/17/17/12.5) exactly — confirming the forward-walk, built from the
"correct" forklift-driven framework, still lands on PP's own original hand
layout for the case it was designed against. Confirmed live in the running
app: Column Check panel reads "If absorbed −36", "9 columns in racks",
aisle labels read 17'9"/17'6"×3/12'9" — all matching. Build clean
(1789 modules), 309/309 tests pass, zero console errors.

Lesson:   Getting one dimension right in isolation (Step 1's forklift-
correct aisle width) can still produce an unsafe layout if a SECOND input
(the column grid) is never consulted when deciding position, not just
validated after the fact. The fix here isn't "check harder" — it's letting
the second input influence the decision AT THE POINT the first one is made,
while keeping the first one's hard constraint (never below minAisle)
non-negotiable. A deterministic forward walk that locks each decision and
never revisits it is also worth noting as a pattern: it trades some
optimality (this pass can and does leave rows on the table it might have
fit with a smarter search) for a termination guarantee and zero risk of a
cascading re-check ever needing to unwind a placement it already made.

## BUG 35 — the density fix's "chase" threshold got MORE permissive as a truck's aisle got wider, breaking counterbalance

Symptom:  The GENERATOR_SPEC_V7 density fix (pack tight, widen only to seat a
column) worked for reach truck on 240×120/25×30 — 5 interior pairs, aisles
mostly 10.5ft. The SAME building and grid with counterbalance instead of
reach fell back to the sparse pattern the density fix was supposed to have
already killed: 3 interior pairs, aisles ~22.5-22.75ft.

Chased:   The row-placement pitch was already correctly per-truck —
`aisleFt` is read from `MHE_PROFILES`/the rules `mhe` table and varies
correctly (reach 10.5, VNA 6, counterbalance 12.5); nothing was hardcoded to
reach. Traced the forward walk's own decision at each step for reach vs.
counterbalance on the identical grid: the "is this column too far to chase"
cutoff (`isFar = (seatStart - tightStart) >= aisleFt`) used the SAME
variable, `aisleFt`, both to compute where a tight row would start
(`tightStart = lastEnd + aisleFt`) and as the pass/fail bar for whether
seating a column was "cheap enough." For counterbalance's larger aisleFt,
`tightStart` sits further along toward the fixed column line, so the actual
distance to seat (`seatStart - tightStart`) is SMALLER than reach's for the
same line (10.25 vs 12.25 ft in the traced case) — while the bar it has to
clear is simultaneously LARGER (12.5 vs 10.5). Both effects point the same
direction, so a wider-aisle truck passes the "cheap enough to seat" test on
every single opportunity, while a narrower one doesn't — the walk for
counterbalance seated on every column it could reach, ballooning every
aisle out toward the column pitch instead of ever placing a row tight.

Cause:    One variable (`aisleFt`) was doing two jobs — the row pitch AND
the willingness-to-widen cutoff — and those two roles interact in opposite
directions as the truck's own aisle grows. This wasn't a hardcoded-to-reach
bug (the value genuinely was per-truck already); it was the FORMULA's shape
that broke, becoming more permissive exactly when it should have stayed
just as strict.

Fix:      Removed the opportunistic-seating step entirely, per explicit
correction — the underlying premise (widen an aisle when it's "cheap" to
seat a column) doesn't have a single per-truck-safe cutoff, and the real
rule is simpler than that anyway: `rowBands` (`sizingLayout.js`) now always
packs at a UNIFORM pitch = pairDepth + aisleFt, for every truck, with no
column awareness in placement at all. A column ends up seated, in a bay, or
in an aisle purely as a consequence of where the fixed row grid happens to
land relative to the real column grid — deciding what to DO about that
outcome (avoid it, accept it, shift for it) is now explicitly a strategy's
job (S1/S2/S3, GENERATOR_SPEC_V7 Part B), not the row-spacing function's.
`gridYFt` no longer has any effect on `rowBands` at all.

Verify:   240×120/25×30, real generator + `checkColumns`, all three trucks:
  - reach (10.5): every aisle 10.5 except the trailing 23.0, 5 interior
    pairs, 14 rack rows.
  - counterbalance (12.5): every aisle 12.5 except the trailing 13.0, 5
    interior pairs, 14 rack rows. No 22ft blowout.
  - VNA (6.0): every aisle 6.0 except the trailing 18.5, 7 interior pairs,
    18 rack rows.
No truck produces anything wider than its own standard aisle except the one
unavoidable trailing remainder (always >= that aisle, never less — same
invariant as every prior version). Confirmed live in the running app for
counterbalance: aisle labels read 12'6"×5 and 13' (the trailing gap), Total
Pallet Positions 1,920, zero console errors. Build clean (1789 modules),
309/309 tests pass. The three previously-locked cases (20×25, 50×54, the
original PP hand example) were re-verified as part of the density-fix work
this replaces and are structurally covered by this same uniform formula —
re-run to confirm.

Lesson:   A single-pass heuristic that reuses one input value for two
different roles (here: a pitch AND a threshold) needs to be checked across
the full range that input can take, not just the one case (reach) it was
built and verified against. "Per-truck" is not the same as "correct for
every truck" — the value correctly varied per truck the whole time, and it
still broke, because varying the RIGHT way for one truck can vary the WRONG
way for another when it's driving two purposes that pull in opposite
directions as it grows. When a fix's correctness depends on a specific
numeric relationship between two quantities (here: cost of chasing vs. the
bar for "cheap enough"), test it across the full range of BOTH before
calling it fixed, not just the one combination in front of you.

## BUG 36 — S1 built: shift rows to clear columns out of travel aisles, never touching aisle width

Symptom:  BUG 35's uniform tight-pack fixed the aisle-WIDTH bug (every aisle
now equals the truck's own standard, no more chasing/widening), but left a
different, pre-existing problem exposed: on 240×120/25×30, tight-packed
rows still let real columns land squarely inside a travel aisle — VNA (6ft
aisle) and counterbalance (12.5ft aisle) each had a column with no
passable side, genuinely blocking the truck. Reach (10.5ft) had the same
defect, just not previously called out by name.

Chased:   Tight-packing (BUG 35) never looked at the column grid at all —
whether a column ended up in a flue, a bay, or an aisle was pure chance of
where the fixed pitch happened to land relative to the fixed column grid.
For gridYFt=30 specifically, the walk's own aisle windows (aisleFt wide,
recurring every pairDepth+aisleFt) happened to catch a real column line on
more than one pass for every truck tested, confirmed via the corrected
BUG-33 segment-grouped aisle check (this part of the plumbing already
worked; nothing needed fixing there).

Cause:    No mechanism existed to react to a column landing in an aisle —
placement and column position were two unrelated calculations sharing a
building, same root cause named in BUG 34 but for a different consequence
this time (an actually-blocked aisle, not just an unseated flue).

Fix:      `rowBands` (`sizingLayout.js`) now does S1 (GENERATOR_SPEC_V8.md):
tight-pack as before, but for each row, before locking it, check whether
the travel aisle that would follow it (at its nominal tight position)
contains a column. If so, extend THAT row later — never earlier, never
touching aisle WIDTH — just far enough (centred, `columnY − pairDepth/2`,
clamped to never start before the nominal tight position) that the column
now falls under the row's own BODY instead of the aisle. This can only
ever widen the aisle BEFORE the row it extends (a side effect of pushing
that row later), never narrow any aisle below the truck's fixed width.
Every row after cascades naturally from the extended row's actual end, so
the fixed-width aisle holds for everything downstream — no separate
"cascade" step was needed; a single forward pass that always measures from
the ACTUAL (possibly-extended) previous end already propagates it. Flue
alignment is never targeted (S1 doesn't care where in the body the column
lands, only that it's not in the aisle — that's S3's job). If extending
would leave no room to close with the far wall, the row is dropped instead
(GENERATOR_SPEC_V8.md's explicit "access wins over a row").

Verify:   240×120/25×30, real generator + the real (BUG-33-fixed)
`checkColumns`, all three trucks — **zero aisle-blocked columns for every
one**, down from the earlier confirmed blocked cases:
  - VNA (6.0): 7 interior pairs kept (unchanged count) — two of eight
    aisles widened to 12.25ft to clear a column, the rest still exactly
    6.0ft. 18 rack rows, 28 bay-columns, capacity 2,560 raw / 2,336 net.
  - Counterbalance (12.5) and reach (10.5): both dropped to 3 interior
    pairs (from 5) — on THIS grid, every single tight aisle window along
    the walk happened to catch a column, so each fix's own cascade pushed
    the next row's window into catching the next column too, all the way
    down. 10 rack rows each, aisles 22.5–22.75ft, capacity 1,280 raw /
    1,224 net. This is a real, verified cost of the single deterministic
    pass (no branch-and-compare, per spec) — not a bug in the fix, but
    worth flagging plainly: on a grid this unfavorable, S1 gives up a lot
    of density for full accessibility. S2 (a later build step) exists
    specifically to relax this by tolerating a passable column-in-aisle
    instead of always shifting.
Confirmed live in the running app for VNA: aisle labels read 6'×6 and
12'3"×2, Column Check panel shows "28 columns in racks" with no aisle-
blocked entries at all, 2,560 total positions, zero console errors. Build
clean (1789 modules), 309/309 tests pass — including the pre-existing
default-brief test (gridYFt=54), which now also runs the shift check but
produces no regression since a shift only ever widens a gap, never
narrows it below the already-asserted minimum.

Lesson:   A correct per-row fix ("extend this row to clear a column")
composed with "cascade forward from the actual result" can still produce
a much costlier overall layout than the same fix applied in isolation
would suggest, because each local correction changes the phase of every
subsequent row against a periodic grid it didn't originally collide with.
This is inherent to a deterministic single pass with no lookahead across
the WHOLE remaining walk, not a defect in any one step of it — verify the
END-TO-END row count and capacity, not just "did this row's own check
pass," before calling a per-row fix cheap.

## BUG 37 — BUG 36's flush centred the column instead of touching its edge, over-shooting into the next column and cascading to every aisle

Symptom:  BUG 36's S1 fix cleared every column out of every travel aisle
(correct), but on 240×120/25×30 with reach or counterbalance, EVERY
interior aisle came back at ~22–23ft — the exact uniform-blowout pattern
BUG 35 had already fixed once. Confirmed by direct per-gap measurement:
reach's four gaps were 22.75/22.5/22.5/22.75, not "10.5 mostly, wider only
at a flush" as GENERATOR_SPEC_V8/V9 both require.

Chased:   Verified this was NOT the aisle-WIDTH bug come back (BUG 35's own
fix — packing at `pairDepth + aisleFt` — was untouched and still correct).
It was the row-SHIFT amount. BUG 36 flushed a row by CENTRING the offending
column in the row's body: `shifted = target - midFt/2`. Traced by hand and
confirmed by execution: for reach on this grid, centring pushed row 1 from
its tight position (14) to 26.25 — 12.25ft of movement to place a column
that only needed 9ft of movement to be safely under the row at all. That
extra 3.25ft of unnecessary reach is what carried row 2's own nominal
aisle-after window forward into the NEXT column's (Y=60) territory, which
otherwise would have missed it — and the same over-shoot repeated at row 2
pushed row 3's window into column 90's territory too. Centring wasn't
"safer," it was silently exporting each fix's blast radius onto the next
column down the line.

Cause:    The flush amount had no reason to be exactly `pairDepth/2` short
of the column — that was an arbitrary choice (borrowed from the S3 "seat
in the flue, centred" math from an earlier, superseded design) applied to
a problem that only needs the column to land ANYWHERE under the row's
body, not at its centre. Any extension larger than the minimum needed
increases the odds of colliding with the next periodic column purely by
accident, and on this specific grid it did so on every single row.

Fix:      Changed the flush target in `rowBands` (`sizingLayout.js`) from
centring the column in the row (`hit − midFt/2`) to touching the column's
FAR edge exactly at the row's new end (`(hit + COL_HALF_FT) − midFt`) —
the smallest possible extension that still fully contains the column
under the row's body. No other logic changed: still a single forward
pass, still "extend this row's own trailing aisle only when a column is
actually found there," still drops a row rather than running out of
building. The minimal push is what lets most downstream rows land at
their plain minimum-aisle position (untouched, still exactly aisleFt)
instead of inheriting an ever-growing search radius.

Verify:   240×120/25×30, real generator + real `checkColumns`, all three
trucks — zero aisle-blocked columns for every one (unchanged from BUG 36),
but now with a genuine MIX of tight and flushed gaps, not a uniform
blowout:
  - Reach (10.5): bands at 23, 41, 59, 83 (4 interior pairs, down from
    tight-pack's 5). Aisles: 19.5 / **10.5** / **10.5** / 16.5 / 26.0 —
    two of four interior gaps are exactly the fixed width, untouched; only
    the two rows that actually needed a flush (columns at Y=30 and Y=90)
    show a wider leading aisle. 12 rack rows, 35 bay-columns, capacity
    1,600 raw / 1,460 net.
  - Counterbalance (12.5): bands at 23, 53, 83 (3 interior pairs). Aisles:
    19.5 / 22.5 / 22.5 / 26.0 — every row needed its own flush on this
    grid (12.5's own pitch phases against gridYFt=30 worse than reach's
    does), so nothing stayed tight here; still a real, individually-
    justified widening per row, not a blanket one. 10 rack rows, 35
    bay-columns, capacity 1,280 raw / 1,140 net.
  - VNA (6.0): bands at 9.5, 23, 36.5, 53, 66.5, 83, 96.5 (7 interior
    pairs, unchanged count from BUG 36). Aisles: 6.0×5 mixed with 9.0×2
    and a 12.5 closing gap — mostly tight, two small, targeted widenings.
    18 rack rows, 35 bay-columns, capacity 2,560 raw / 2,420 net.
Confirmed live in the app for reach: aisle labels read 19'6", 10'6"×2,
16'6", 26' — the mixed pattern, not six identical ~22'9" labels. Column
Check panel shows "35 columns in racks" with no aisle-blocked entries,
1,600 total positions, zero console errors. Build clean (1789 modules),
309/309 tests pass.

Lesson:   When a fix has to push something just far enough to escape one
constraint, "just far enough" is a hard requirement, not a style choice —
any margin borrowed from a different, unrelated concern (here: the flue-
centring convention from a different strategy, S3) can silently increase
the fix's blast radius against a periodic pattern it was never checked
against. The tell was in the output shape, not the pass/fail: BUG 36's
own zero-aisle-blocked result LOOKED like success, and only measuring the
actual per-gap widths (at the user's explicit insistence) surfaced that
the "fix" had regressed the exact bug it was supposed to have already
fixed one report earlier.

## BUG 38 — V10's walk built as specified; the shared travelFt placeholder under-serves two of three trucks' own pick minimum

Symptom:  Not a regression — a documented finding from building GENERATOR_
SPEC_V10.md's placement walk (PP's own Step 1–4 tree) as written, replacing
BUG 37's row-flush mechanism entirely. Verifying all three forklifts on
240×120/25×30: VNA comes back with zero aisle-blocked columns, but reach
and counterbalance both still show 14 blocked columns each, every one
inside a Step-2 "column absorbed into the aisle" span.

Chased:   Confirmed this is the literal Step 2 formula behaving exactly as
specified, not an implementation slip. Step 2's own rule: when the next
column is too close for a clean `aisleFt`-wide gap, the aisle absorbs it —
width = (gap to the column) + (column's ~1ft) + `travelFt` (the truck's
DRIVE-only minimum, not its PICK minimum `aisleFt`). Hand-traced and
confirmed by execution for reach: the first absorbed aisle computes to
gap(8) + 1 + travelFt(8) = 17ft — wide overall, but the column sits with
exactly `travelFt` (8ft) clear on its BEST side, because that's precisely
what the formula optimizes for. `checkColumns`'s existing accessibility
test (BUG 33/37, unchanged and correct) checks the best-side clearance
against the truck's PICK minimum (`minAisleFt`: reach 10.0, counterbalance
12.0), not the lesser drive-only figure — so 8ft clear reads as blocked for
both. VNA is the one truck where this doesn't bite: its own `travelFt`
placeholder (8, shared across all three per the spec's explicit "use ~8 for
now") happens to exceed VNA's actual pick minimum (5.5), so the same
formula accidentally over-delivers for VNA and under-delivers for the
other two.

Cause:    Not a bug in this implementation — a direct, traceable
consequence of GENERATOR_SPEC_V10.md's own placeholder policy: "Real
travelFt / movableWindow numbers per forklift... TBD; placeholder ~8 for
now." A single shared 8ft stand-in cannot simultaneously exceed reach's
10.0ft and counterbalance's 12.0ft pick minimums while also being a
meaningfully smaller "drive-only" figure — it's below both, so Step 2's
absorb formula (built to use exactly `travelFt` clearance) structurally
can't clear the accessibility bar for those two trucks until real,
truck-specific `travelFt` values replace the shared placeholder.

Fix:      Built exactly as specified — `rowBands` (`sizingLayout.js`) is a
full rewrite: STEP 1 (wall row) → repeat STEP 2 (place an aisle, normal
width or absorb the next column into it) → STEP 3 (place a pair, S1 tries
sliding the flue onto an overlapping column first, else the pair just
covers it as a bay-column; S2 drops the pair on it unconditionally) → until
STEP 2's "no room" branch triggers wall-hit cleanup (swap the last pair for
a single if that alone frees enough depth, else remove rows outright) and
the walk closes with the far wall. Added `travelFt` (placeholder 8) to
`rules/defaults.js`'s `mhe.*` entries and `columnCheck.js`'s
`MHE_PROFILES`, and an `allowColumnInRack` toggle (default false = S1) to
`sizingSheetLayout`/`rowBands`. The Step 2 absorb formula was implemented
literally, per instruction ("build it as written, not a re-derivation") —
the `Math.max(aisleFt, ...)` floor on the OVERALL aisle width is already in
place (never narrower than the truck's own standard end-to-end), but that
floor does not by itself guarantee the *column's* best-side clearance
meets the pick minimum — that gap is `travelFt`'s job, and the placeholder
value is what's currently insufficient for two of three trucks.

Verify:   240×120/25×30, real generator + real `checkColumns`, all three
trucks:
  - VNA (6.0, travel 8): bands at 9.5, 26.25, 39.75, 56.25, 69.75, 86.25,
    99.75 (7 interior pairs). Aisles: mostly 6.0, with four absorbs at
    9.0–9.25. **Zero aisle-blocked columns.** 18 rack rows, 14 bay-columns,
    21 flue-seated, capacity 2,560 raw / 2,504 net.
  - Reach (10.5, travel 8): bands at 14, 38.5, 56.5, 74.5, 98.5 (5 interior
    pairs). Aisles: 10.5 tight where no column forced an absorb, 17.0 and
    16.5 where one did — a genuine mix, not a uniform blowout (the BUG 37
    regression is confirmed gone). **14 aisle-blocked columns remain**,
    every one inside an absorbed span, each reading exactly 8ft clear
    against the 10ft the truck needs. 14 rack rows, 14 bay-columns, 7
    flue-seated, capacity 1,920 raw / 1,864 net.
  - Counterbalance (12.5, travel 8): bands at 16, 38.5, 58.5, 78.5 (4
    interior pairs) plus a wall-hit swap (the row that would have been the
    5th pair became a single instead — Step 2's cleanup branch firing for
    real). Aisles: 12.5 tight, 15.0/14.5 where absorbed. **14 aisle-blocked
    columns remain**, same 8ft-clear pattern. 14 rack rows, 21 bay-columns,
    0 flue-seated, capacity 1,760 raw / 1,676 net.
Confirmed live in the app for reach: aisle labels read 10'6" (tight), 17',
16'6" — the mixed pattern. Column Check panel shows "14 columns in racks ·
14 aisles blocked," each card reading "8ft clear of 17ft — Reach truck
needs 10ft," matching the computed numbers exactly. Build clean (1789
modules), 309/309 tests pass, zero console errors. Counterbalance's
wall-hit swap (pair → single at the far end) was also exercised for real,
not just theorized — confirms that branch of Step 2's NO path runs
correctly.

Lesson:   A spec that explicitly ships a shared placeholder for a
per-entity constant ("~8 for now, logic independent of the exact value")
is making a promise that only holds once real values arrive — building the
logic correctly is not the same as the RESULT being correct for every
input in the meantime. Reporting "implemented as specified, and here is
exactly which trucks it doesn't yet clear and why" is the right outcome
here, not silently declaring success on two-out-of-three, and not
patching the formula to hide the gap the placeholder was always going to
open up.

## BUG 39 — BUG 38 wasn't a placement gap, it was checkColumns judging accessibility as binary instead of three levels

Symptom:  BUG 38 reported reach and counterbalance both failing accessibility
on 240×120/25×30 — 14 aisle-blocked columns each, every one reading exactly
8ft clear against the truck's own pick minimum. Correction from
GENERATOR_SPEC_V10 (1).md: that verdict was wrong. 8ft clear on a reach
truck (needs 10ft to fully pick both sides) still means the truck can
DRIVE the aisle and PICK from the face away from the column — accessible,
just one-sided. Binary "clear < minAisleFt = blocked" was the bug, not the
placement walk.

Chased:   Confirmed BUG 38's placement numbers were never wrong — the same
bands, same aisle widths, same 8ft-clear columns. What was wrong was the
single threshold `checkColumns` judged them against (`profile.minAisleFt`,
the PICK minimum), collapsing three physically distinct outcomes into one
pass/fail: a column that can't even be driven past reads identically to
one that only costs a single pick face. Those are not the same problem —
one is a real accessibility failure, the other is a normal, accepted
trade-off (GENERATOR_SPEC_V10's own priority: "each row accessible/
pickable from at least one side beats picking both sides").

Cause:    `checkColumns`'s aisle test only ever had one bar to clear.
Nothing distinguished "can't drive through" from "can drive through, pick
one side" from "fully clear" — collapsing a 3-outcome question into a
2-outcome (blocked/not) one is what made a perfectly fine one-side-pick
aisle print as "blocked."

Fix:      `checkColumns` (`columnCheck.js`) now computes a `level` per
aisle-column (1 = clear < `travelFt`, can't drive — the only real block;
2 = `travelFt` <= clear < `aisleFt`, drivable + one-side pickable — accepted
by default; 3 = clear >= `aisleFt`, fully clear) and only sets `blocked`
true for level 1, or level 2 when the new `pickBothSides` param is on. Wired
`pickBothSides` through as a real, user-facing toggle: new state in
`useColumnCheck.jsx` (mirroring the existing `showMarks` pattern), a switch
in `ColumnCheckPanel.jsx` ("Require pick from both sides"), and the
"Aisle blocked" card text now branches on `level` (drive-through language
for a real level-1 block, one-side-pick language when level 2 is flagged
by the toggle). Also fixed a plumbing gap found while wiring this up:
`useRules.jsx`'s `mheOptions` mapping dropped `travelFt` even though it
was added to `DEFAULT_RULES.mhe.*` for BUG 38 — a dealer override of that
field would have been silently discarded before reaching `checkColumns`,
which was only working by coincidence (its own internal `?? 8` fallback
happened to match). Added `travelFt` to that mapping too.

Verify:   240×120/25×30, real generator + real `checkColumns`, all three
trucks, `pickBothSides` OFF (default): **zero level-1 (truly blocked)
aisles for every truck** — reach and counterbalance's 14 columns each are
now correctly level 2 (one-side pick, 8ft clear, accessible), VNA has
none at all. Turning `pickBothSides` ON reproduces BUG 38's old counts
exactly (14 flagged for reach, 14 for counterbalance, 0 for VNA) —
confirms the toggle's two states map onto the old and new behavior
precisely, not a different calculation. Confirmed live in the app: with
the toggle off, no "aisle blocked" cards render at all for reach; clicking
"Require pick from both sides" via real mouse turns the switch on and the
panel re-flags the same columns. Build clean (1789 modules), 309/309
tests pass, zero console errors.

Lesson:   A pure/binary check function can be "correct" in the sense of
doing exactly the arithmetic it was told to, while still producing a
wrong verdict, because the REAL-WORLD question it's answering had more
than two outcomes. The fix here wasn't a math correction (the clearance
numbers from BUG 38 were already right) — it was recognizing that
"accessible" and "ideal" are different questions, and collapsing them
into one boolean is where the wrongness actually lived. When a domain
expert says a result "looks wrong," check whether the INPUT arithmetic is
wrong before assuming that — sometimes the numbers are fine and the
THRESHOLD being asked of them is what needs to change.

## BUG 40 — travelFt locked to min(8, aisleFt): VNA no longer claims 8ft to drive an aisle it only has 6ft of

Symptom:  Not a failure — locking down the last open placeholder from BUG
38/39. `travelFt` (the truck's physical drive-through minimum) had been a
flat 8ft for all three trucks since BUG 38, explicitly called out there as
a stand-in "until PP supplies real numbers." That flat value was already
physically wrong for VNA: an 8ft drive-through minimum on a truck whose own
standard aisle is only 6ft would mean the truck needs MORE room to just
drive through than it needs to actually work in — backwards.

Chased:   Confirmed VNA's own aisle (6.0ft) already comfortably fit within
the checkColumns/placement-walk logic at travelFt=8 without ever tripping
the "clear < travelFt" true-block threshold on 240×120/25×30 (VNA had zero
aisle-blocked entries under BUG 38/39 already) — so the flat 8ft never
caused a wrong VERDICT on this grid. It was still the wrong NUMBER: a
narrower grid or a tighter column combination could have let a column sit
with, say, 7ft clear — genuinely fine for a 6ft-aisle truck (more than its
own standard), but the flat placeholder would have called it "level 2, not
full pick" using a floor (8) the truck doesn't actually need to drive
through at all.

Cause:    `travelFt: 8` was a single shared literal with no relationship
to each truck's own `aisleFt`, per BUG 38's explicit placeholder note. A
truck's physical drive-through minimum can never exceed what it needs to
fully work the aisle — capping travelFt at aisleFt is a real physical
constraint, not a tuning knob, and the flat placeholder didn't encode it.

Fix:      `travelFt` is now computed as `min(8, aisleFt)` per truck, in
both `rules/defaults.js` (`DEFAULT_RULES.mhe.*`, the dealer-overridable
cascade) and `columnCheck.js` (`MHE_PROFILES`, the shipped fallback) — via
a shared `travelFtFor(aisleFt)` helper in each file rather than hand-
computed literals, so the two can never drift out of the min() relation if
`aisleFt` is retuned later. Reach (10.5) and counterbalance (12.5) both
keep the 8ft default since their own aisles are wider than 8ft; VNA (6.0)
now gets `travelFt: 6`, capped at its own aisle.

Verify:   240×120/25×30, real generator + real `checkColumns`, all three
trucks, `pickBothSides` OFF: **zero true accessibility failures for every
truck**, unchanged from BUG 39 — reach and counterbalance's absorbed
aisles (17ft/16.5ft and 15ft/12.5ft respectively, 8ft clear each) still
read as level 2 (one-side-pick, accessible) since their travelFt is still
8. VNA's bands and aisle widths are byte-identical to before (9.5, 26.25,
39.75, 56.25, 69.75, 86.25, 99.75; aisles 6.0×4 mixed with three ~9ft
absorbs) — it never needed the changed value on this specific grid, but
its profile now correctly reports `travelFt: 6`, confirmed live by reading
both `DEFAULT_RULES.mhe.vna.travelFt` and `MHE_PROFILES.vna.travelFt`
directly out of the running app (`{"reach":8,"vna":6,"counterbalance":8}`
from both sources). Build clean (1789 modules), 309/309 tests pass, zero
console errors.

Lesson:   A placeholder that's explicitly flagged as provisional ("~8 for
now") is still worth tightening as soon as a real physical constraint is
known, even before the fully-real numbers arrive — "a truck can't need
more room to drive than to work" was knowable immediately, without waiting
on PP's exact per-truck figures, and computing it via `min()` instead of a
literal means the relationship self-corrects if the underlying `aisleFt`
values ever change, instead of silently going stale again.

## BUG 41 — vertical orientation added: same S1/S2 walk, other axis, other column pitch — required rotation-aware checkColumns for the first time

Symptom:  Not a bug fix — a new feature. The generator only ever ran rows
horizontally (stacked across the WIDTH, driven by the Y column pitch).
Added the ability to run rows VERTICALLY (stacked across the LENGTH,
driven by the X column pitch) on demand, via `orientation: 'vertical'` on
the brief — not picked automatically yet, just a correct result when asked
for.

Chased:   The SAME `rowBands`/`rowSegments` functions are already axis-
agnostic (they just walk 0 to whatever length they're given), so swapping
which physical dimension and which column pitch feeds each was the easy
part. The hard part, discovered while making the result actually
verifiable: a vertical rack's LENGTH has to run along world-Y — beams
painted along an object's own local X (render/rackOps.js's uprightXs,
hard-wired, not derived from width/height) mean the only correct way to
get that is a real 90° rotation, not a width/height swap. And
`checkColumns` had never once been asked to reason about a rotated rack —
every overlap test used `r.x/r.y/r.width/r.height` raw, which for a
90°-rotated rack is the PRE-rotation box, not where it actually sits. That
would have made "columns handled, aisles accessible" a meaningless claim
for anything vertical — the check would silently test the wrong rectangle.

Cause:    Two separate gaps, both real:
  1. Placing a vertical rack correctly requires computing its TRUE centre
     (from the swapped-axis walk) and backing out the PRE-rotation x/y
     canvas2's centre-pivot rotation (shapes.jsx's spin()) expects — not
     something the existing xFt/yFt-as-top-left contract handled.
  2. `checkColumns`'s geometry (rack overlap, flue/face split, segment
     grouping, aisle-gap detection) was written assuming every rack is
     unrotated — reasonable when nothing had ever produced a rotated one,
     wrong the moment vertical orientation could.
  A third, quieter gap: `rowBands`'s column-line convention (flush from the
  origin) only ever matched `columnGridObject`'s Y axis (fixed for that
  specifically, in an earlier entry) — its X axis is still centred. Vertical
  walks X, so it would have been avoiding columns at positions nothing is
  actually drawn at, unless it knew the real offset.

Fix:      `sizingSheetLayout` (`sizingLayout.js`) takes `orientation:
  'vertical'` and swaps which axis rowBands stacks across (length instead
  of width, gridXFt instead of gridYFt) and which axis rowSegments' runs
  lie along (width instead of length) — the walk itself, unchanged. Each
  vertical placement's stored x/y is computed from its TRUE centre (band
  position + half depth, run position + half the run's own length) minus
  half the PRE-rotation width/height, with `angle: 90` — so canvas2's
  existing centre-pivot rotation lands it at the right place, and
  `beamRackObject` needed zero changes. Added `gridOffsetFt` to `rowBands`
  so its column-line formula can match a CENTRED axis (X) as well as the
  already-flush one (Y) — `sizingSheetLayout` computes the real offset the
  same way `columnGridObject` does before handing it to a vertical walk;
  horizontal still passes 0, byte-identical to before. `columnCheck.js`
  gained a `rackFootprint(r)` helper (swap width/height around the centre
  for a 90°/270° rack) and now runs it everywhere a rack's geometry is
  read: rack-overlap testing, the flue-vs-face split (now measured along
  whichever axis is the rack's TRUE depth — Y for horizontal, X for
  vertical), run-grouping (X-overlap for horizontal runs, Y-overlap for
  vertical ones), and aisle-gap detection (gaps measured along whichever
  axis rows are actually stacked on).

Verify:   240×120/25×30/reach, real generator, both orientations:
  - Horizontal (baseline, unchanged): 14 racks, aisles 10.5×4 + 17.0 + 16.5
    (2 absorbed), 0 aisle-blocked, capacity 1,920 raw / 1,864 net. Byte-
    identical to the pre-this-change result — confirms zero regression.
  - Vertical: 22 racks (4 wall singles, 18 interior pairs). Wall singles'
    TRUE world footprint sits at x=0 and x=236.5 (=240−3.5) — exactly
    against BOTH length-walls, not the width-walls. 0 bay-conflicts, 0
    flue-seated, 10 aisle-tested, **0 truly blocked** — every tested aisle
    reads one-side-pick (8–8.5ft clear) or better. Capacity 640 raw / 640
    net (no bay-columns at all on this grid). Confirmed live: racks render
    visibly vertical (tall, narrow, running top-to-bottom), Column Check
    panel reads "No column interference," the clearance labels (from the
    canvas label work) read correctly next to columns in the vertical
    aisles too, zero console errors.
  Build clean (1789 modules), 309/309 tests pass.

  Worth reporting plainly, not a bug: vertical capacity (640) is far below
  horizontal's (1,920) for this specific building. Traced it to speedBayFt
  (60ft staging) now being subtracted from the WIDTH (120ft) instead of
  the LENGTH (240ft) — the same fixed staging strip consumes HALF the
  usable stacking axis for vertical on a building this elongated, versus
  a quarter for horizontal. That's an honest, correct consequence of
  re-running the identical walk on a much shorter axis, not a placement
  defect — and it's exactly the kind of case a later two-orientation
  compare (GENERATOR_SPEC_V7/V10's "compute all three, present counts")
  is meant to catch and let the dealer see for themselves.

  Known, explicitly out of scope for this pass: the staging boundary line/
  label and dock-door fixtures (`generateFixtures`) are NOT orientation-
  aware yet — they still draw against the length axis regardless of
  `orientation`, so a vertical generate's visual staging marker doesn't
  actually line up with where the rack-free strip really is (confirmed in
  the screenshot: racks correctly leave the reserved width-strip empty,
  but the dashed line + "STAGING" label are drawn in their old horizontal
  position). This was scoped out deliberately — the ask was "make the walk
  produce a correct vertical layout," not "rotate every fixture" — but it
  needs its own pass before a vertical generate looks fully coherent.

Lesson:   "Just swap which axis the walk uses" sounds like a parameter
change until something ELSE in the pipeline turns out to have quietly
assumed there was only ever one axis to worry about. The real scope of
"add vertical orientation" was never the walk (rowBands/rowSegments were
already axis-agnostic) — it was every OTHER piece of code that read a
rack's geometry assuming it could never be rotated, because until this
task nothing had ever given it a reason to be. Grep for every consumer of
`r.x/r.y/r.width/r.height` before trusting a "just add an angle" plan.

## BUG 42 — manual aisle input never set travelFt, so a dealer-typed aisle narrower than the truck's own profile could claim MORE drive room than it had

Symptom:  Not a crash — a silent invariant break. The Generate panel's
"AISLE (ft)" field is a genuinely free number input, editable independently
of the FORKLIFT dropdown (`pickMhe` only resets it to the truck's default
on a forklift CHANGE; the field stays hand-editable after that). Asked to
verify: does typing a manual aisle also correctly drive `travelFt`, per
BUG 40's `travelFt = min(8, aisleFt)` invariant, the same way the forklift
profile does by construction?

Chased:   Read `GeneratePanel.jsx`'s `run()` first, before touching any
code, to see exactly what brief it sends. Confirmed `aisleFt` is always
included (`Number(aisleFt) || 11`) but `travelFt` is never included at
all — the panel predates `travelFt`'s existence (BUG 38/40 added it later,
only inside `sizingSheetLayout`'s own default-resolution and
`rules/defaults.js`'s profile objects, never touching this form).

Cause:    `sizingSheetLayout`'s destructuring resolved `travelFt` from the
forklift profile independently of whatever `aisleFt` the brief actually
carried: `travelFt = rules.mhe?.[brief.mhe]?.travelFt ?? 8`. That's correct
when `aisleFt` is left at the profile's own default (profile travelFt is
always ≤ profile aisleFt by construction, BUG 40), but wrong the moment a
dealer types a narrower aisle by hand — VNA selected (profile aisleFt=6,
travelFt=6) with the AISLE field hand-typed down to 4ft still resolved
`travelFt=6`, i.e. the truck was claimed to need MORE room to drive
through (6ft) than the aisle it was being asked to work in actually had
(4ft) — physically impossible, and exactly the invariant BUG 40 locked
down for the profile-only path. Proved numerically first, before any fix,
via a temp vitest test calling `sizingSheetLayout` with the exact brief
shape `GeneratePanel.jsx` sends (`aisleFt: 4, mhe: 'vna'`, no `travelFt`
key): confirmed `travelFt` resolved to `6 > aisleFt(4)`.

Fix:      `travelFt`'s default now caps at whatever `aisleFt` the brief
actually resolves to, not the profile's own aisleFt: `travelFt =
Math.min(rules.mhe?.[...]?.travelFt ?? 8, aisleFt)` in
`sizingSheetLayout` (`src/generate/sizingLayout.js`). Scoped to this one
general resolution point rather than patching `GeneratePanel.jsx` to start
sending a `travelFt` itself, so every caller that can independently
override `aisleFt` gets the same guarantee, not just this one form.
Reduces to the exact pre-fix value whenever `aisleFt` IS the profile's own
default (the normal, non-overridden path), since a shipped profile's
`travelFt` is already `≤` its own `aisleFt` by construction.

Verify:   Three cases, real `sizingSheetLayout` call (temporary
`globalThis.__lastResolved = { aisleFt, travelFt }` probe, removed after):
(1) VNA + manual aisle 4ft (narrower than VNA's own 6ft) → `aisleFt=4,
travelFt=4` (`min(6,4)`), was `6` before the fix. (2) reach truck, no
override → `aisleFt=10.5, travelFt=8`, byte-identical to pre-fix
(non-regression). (3) reach truck + manual aisle widened to 11ft (still
`≥` its own travelFt=8) → `aisleFt=11, travelFt=8`, unaffected, confirming
the cap only bites when the manual aisle goes narrower than the profile's
travelFt, never when it's widened. Build clean, 309/309 tests pass. Live
Playwright run against the dev server: selected VNA in the real dropdown,
hand-typed `4` into the real AISLE field, clicked "Generate layout" —
5,280 pallet positions produced, zero console errors, screenshot confirms
clean render (racks, clearance labels, restyled aisle pills all correct).
`ColumnCheckPanel` correctly reports "Aisle blocked · 4ft clear of 5.5ft —
VNA / turret needs 6ft to drive through" for the resulting aisles — that
check reads the truck's own fixed profile travelFt (6ft, from
`columnCheck.js`'s `MHE_PROFILES`, a separate and correct concern: does a
real VNA truck fit through THIS aisle), not the generator's walk-time cap,
so a dealer who types an aisle narrower than their truck needs still sees
an honest "blocked" report — this fix only stops the WALK from silently
assuming more drive room than the chosen aisle provides, it doesn't (and
shouldn't) suppress the real accessibility warning.

Lesson:   A locked invariant (BUG 40's `travelFt ≤ aisleFt`) is only as
solid as every PATH that can set `aisleFt`. It's easy to verify an
invariant against the one caller you just built it for (the forklift
profile) and miss that a much older, independently-editable input already
existed and skips that caller entirely. Reproducing the exact brief shape
the real UI sends — not a hand-simplified version — before writing the
fix is what caught it; the panel's `run()` source was the ground truth.

## BUG 43 — Generate panel exposed no way to pick vertical orientation; wired up a manual Horizontal/Vertical toggle

Symptom:  Not a defect — a gap. BUG 41 built `sizingSheetLayout`'s
`orientation: 'horizontal' | 'vertical'` param and proved it correct, but
nothing in the UI could ever set it: `GeneratePanel.jsx`'s `run()` never
included `orientation` in the brief it sends, so every generate was
horizontal by construction regardless of what the building actually
wanted. Requested explicitly as manual/testing-only — the automatic
denser-orientation pick is later work, out of scope here.

Chased:   Confirmed the wiring gap by reading `run()`'s brief object
directly (same approach as BUG 42) rather than assuming the param was
already threaded through: `orientation` was absent from the list of keys
sent to `generateAndPlaceBatched`. Traced `generateAndPlaceBatched` →
`buildQueue` → `generateLayout(brief, rules)` (= `sizingSheetLayout`) to
confirm the brief is forwarded wholesale with no allowlist in between —
so the only missing piece really was the panel adding the key, not
anything downstream.

Cause:    The orientation param was built and verified (BUG 41) but never
surfaced as a control; a purely additive UI gap, not a regression.

Fix:      Added `orientation` state to `GeneratePanel.jsx` (default
`'horizontal'`, matching `sizingSheetLayout`'s own default so an
unmodified panel behaves exactly as before), a two-button "ROW DIRECTION"
toggle row (styled like the panel's other controls — `--accent` fill on
the active choice, `--surface2`/`--border` on the inactive one, no new
pattern introduced) placed between RACK TYPE and FORKLIFT since row
direction is a structural choice like rack type, and included `orientation`
in the brief `run()` sends. No changes to `sizingLayout.js`,
`traceGenerate.js`, or any protected file — this is UI-only wiring onto an
already-accepted param.

Verify:   Build clean, 309/309 tests pass (no logic touched). Live
Playwright run against the dev server, two fresh page loads (isolated so
one generate's objects can't accumulate on top of the other and confuse
the screenshot — confirmed generate is additive per click, a pre-existing,
out-of-scope behavior, not something this change touches):
(1) default Horizontal, "Generate layout" clicked with no toggle
interaction → "Horizontal" chip shows the active/accent fill, rows render
left-to-right stacked down the width, 1,920 pallet positions — byte-
identical to the pre-toggle baseline, confirming the added state doesn't
change default behavior. (2) "Vertical" clicked then "Generate layout" →
"Vertical" chip becomes active/accent, "Horizontal" reverts to neutral,
racks render tall/narrow stacked left-to-right down the length (top-to-
bottom rows), 768 pallet positions, "No column interference" — the same
shape of result BUG 41 already verified for vertical, now reachable from
the real form instead of only a hand-built brief. Zero console errors in
either run.

Lesson:   A generator param being correct and covered by tests doesn't
mean it's reachable — the same "read the real caller before trusting it's
wired up" check from BUG 42 applies to feature gaps, not just invariant
bugs. Verifying with two SEPARATE page loads (not two clicks on one page)
mattered here specifically because Generate is additive per click; a
single-page before/after screenshot would have shown both orientations'
racks stacked on each other and made it hard to tell which chip produced
which geometry.

## BUG 44 — vertical crammed into a thin middle band: rowSegments applied the fixed staging deduction to whichever axis happened to be the "run" axis

Symptom:  Vertical (now reachable end-to-end since BUG 43's toggle) didn't
fill the building. Racking bunched into a narrow strip roughly in the
middle of the WIDTH, with large empty bands on both sides — visible
directly in BUG 43's own verification screenshot, though not flagged as a
bug at the time.

Chased:   Read `rowSegments` first, since BUG 41/43 had already proven the
STACKING axis (bands, gridYFt/gridXFt pitch, wall singles) correct for
both orientations — the bug had to be in the perpendicular RUN axis,
`rowSegments`' own job. Found it immediately: `x0 = speedBayFt` (a flat
60ft staging deduction) applied unconditionally to whatever `runFt` the
caller passed in. `sizingSheetLayout` sets `runFt = vertical ? widthFt :
lengthFt` — for horizontal, `runFt` is the 240ft length, so 60ft of
staging is a minority of it (75% remains). For vertical, `runFt` becomes
the 120ft WIDTH, and the exact same fixed 60ft deduction eats HALF of it
before a single rack is placed — that 50%-gone extent is what rendered as
a thin crammed band with huge empty margins either side.

Cause:    `speedBayFt` was never meant to scale with which physical
dimension it was being subtracted from — it's a flat dealer-set number
representing a loading/staging zone, baked into `rowSegments`' extent math
with no relationship to the axis's own size. Fine by coincidence when the
run axis was always the (usually much longer) length; wrong the moment
orientation made the run axis able to be the shorter width too.

Fix:      Per this task's explicit direction, staging/dock is removed from
generation's extent math entirely for now — racking fills the FULL run
axis (minus a small real wall clearance, `endClearFt`, applied
symmetrically on both ends instead of asymmetrically on one) regardless of
orientation, rather than special-casing vertical to keep horizontal's old
carve-out. `rowSegments(lengthFt, { crossAisleFt, endClearFt, beamIn,
upIn })` no longer takes `speedBayFt` at all — `x0 = endClearFt` (was
`speedBayFt`), `x1` unchanged (`lengthFt - endClearFt`). `generateFixtures`
no longer emits `stagingObjects`/`dockDoorObjects` — drawing the old
dashed staging boundary or dock doors at the removed carve-out position
would sit on top of/inside the racks now placed there instead of marking
anything real. Both functions are kept, still exported, still covered by
their own direct unit tests — this only unwires them from generation,
pending the draggable dock/staging zone that replaces this later
(explicitly out of scope for this task). `sizingSheetLayout`'s now-unused
local `speedBayFt` destructure was removed; the field still exists on a
raw `brief` and the Generate panel's SPEED BAY input is untouched (UI
change wasn't requested) — it's just inert as far as generation's extent
math goes for now.

Verify:   240×120/25×30/reach, real `rowBands`/`rowSegments`/
`sizingSheetLayout`, both orientations, reported via a temp vitest test
(removed after):
- **Horizontal** — stack axis (width): 7 bands, full 0→120ft coverage
  (wall single, 5 double rows, wall single). Run axis (length): segments
  at [0.25, 125.25]ft, 13 bays/segment, coverage 0.25→232.75ft of 240ft
  (96.9% — the remainder is whole-bay rounding + the 0.25ft wall
  clearance each end, not a reintroduced carve-out). 14 placements, 2,496
  pallet positions — measured live through the real Generate panel with
  the grid fields hand-set to 25×30 (the app's own capacity count; the
  temp vitest report's separately-printed "pallet capacity" numbers below
  used a rough local approximation for quick reporting, not the app's real
  `getLayoutCapacity`, so they don't match the live figures 1:1 — the live
  browser numbers are the authoritative ones for this verification).
- **Vertical** — stack axis (length): 11 bands, full 0→240ft coverage.
  Run axis (width): segments at [0.25, 65.25]ft, 6 bays/segment, coverage
  0.25→115.0ft of 120ft (95.6%). 22 placements, 1,920 pallet positions
  live (240×120/25×30/reach). Zero true accessibility failures
  (`aisleBlocks` level-1 count: 0) both orientations; column check summary
  showed 0 rack conflicts for vertical on this grid (25×30 columns don't
  intersect any vertical band at this pitch) vs 20 for horizontal on the
  same grid — an honest consequence of where columns happen to fall
  relative to each axis's own band positions, not a defect.
  Live Playwright run against the dev server (real Generate panel, grid
  fields hand-set to 25×30, Vertical toggle clicked): screenshot confirms
  racks run edge-to-edge top-to-bottom with no empty band, no STAGING
  label, no dock door markers; horizontal's own live screenshot on the
  same grid confirms racks now run edge-to-edge left-to-right too (no
  more empty strip on the left). Zero console errors either run. Build
  clean, 312/312 tests pass (added permanent regression coverage in
  `sizingLayout.test.js`: `rowSegments` starts at `endClearFt` not a
  staging strip, vertical is no longer starved on a short run axis,
  `generateFixtures` no longer bakes in staging/dock objects; updated the
  three pre-existing tests that asserted the old staging-skip behaviour
  as their expected/passing case).

Lesson:   A per-axis deduction that's only ever been exercised on one
axis can look completely correct for years and still be wrong the moment
a second axis starts using the same code path — `rowSegments` was never
vertical-aware or vertical-unaware, it simply never had a caller that
could hand it the SHORT axis until orientation existed. The fix this task
actually asked for wasn't "make the deduction axis-aware," it was "stop
deducting it at all for now" — worth noticing that the correct scope was
smaller and more durable than a fix that would have made vertical merely
proportionally-less-wrong while leaving the arbitrary carve-out concept
in place for a future maintainer to trip over again.

## BUG 45 — vertical's LABELLED aisles read ~57ft: aisleObjectsForRacks paired rotated racks by raw stored x/y, which is only meaningful at rotation 0

Symptom:  Reported after BUG 44 made vertical fill the whole building:
the PLACEMENT was now correct, but the aisle-width labels between rows
read ~57.5ft (~61.5ft at the wall rows) — nowhere near the 10.5ft reach
aisle, and not even the column pitch despite looking like it at a glance.

Chased:   First confirmed the STACKING axis walk (`rowBands`, BUG 41's own
S1/S2 logic, driven by `gridXFt` for vertical) was NOT the culprit — re-ran
it directly and got real tight-packed gaps (10.5, 12, 17.5×7, 20.5ft, all
column-absorb-consistent), so the S1/S2 walk itself was never broken for
vertical; BUG 41 had already gotten it right. That meant the bug had to be
downstream, in how PLACED racks turn into the `aisle` objects that
actually get labelled. Read `aisleObjectsForRacks` (traceGenerate.js) and
found it groups racks by their raw stored `x`, sorts+pairs each group by
raw stored `y` — correct ONLY when x is a run's own position and y is a
row's own position, which is true for horizontal (unrotated) racks but
not for vertical ones. Proved it numerically with a temp test that called
the real `sizingSheetLayout` + `placementToObject` + `aisleObjectsForRacks`
pipeline directly (not a hand-simplified version) on 240×120/25×30/reach:
grouping-by-x put each vertical rack's own TWO run-segments (top half,
bottom half of the SAME row, split by ONE cross-aisle) into the same
group — since a 90°-rotated rack's stored `xFt` depends only on its BAND,
identically for both of its segments — and paired THOSE as if they were
adjacent rows. Their raw (pre-rotation) bounding boxes then measured a
gap that isn't a real aisle at all — reproduced the exact ~57.5ft/~61.5ft
numbers this way, confirming both the wrong pairing and a second, layered
bug: `AisleLabel` (DimensionLabels.jsx) computes gaps from `row.x/y/width/
height` directly, which for ANY 90°-rotated rack are still the PRE-
rotation local box (traceGenerate never changes how one is built, only
how it's placed/spun) — even a correctly-paired vertical pair would have
measured the wrong rectangle, since width/height need swapping around
the shared centre first at that rotation.

Cause:    Two compounding bugs, both from treating a rack's raw stored
geometry as if it were already its true world-space box, which only
holds at rotation 0/180. Neither `aisleObjectsForRacks`' grouping key
nor `AisleLabel`'s gap math had ever needed to know about rotation before
BUG 41 gave vertical racks a reason to have one.

Fix:      Both consumers now go through the SAME rotation-aware geometry
BUG 41 already built and proved correct for column-checking rotated
racks — `rackFootprint` (true world box, width/height swapped around the
shared centre at 90°/270°) and `groupBySegment` (unions racks into real
runs by TRUE cross-axis overlap, not raw-coordinate equality), both now
exported from `columnCheck.js` rather than kept module-private.
`aisleObjectsForRacks` rewritten to call `groupBySegment(beams)`, then
sort+pair each group by whichever axis is the TRUE stacking axis for that
group's rotation (`rackFootprint(...).x` if rotated, `.y` if not) —
orientation-agnostic, no branch on `orientation` needed since it reads
rotation straight off each rack. `AisleLabel` rewritten to build its `r1`/
`r2` comparison rectangles from `rackFootprint(row1)`/`rackFootprint
(row2)` instead of the rows' raw fields — a no-op at rotation 0 (footprint
returns the same box), so every existing horizontal/unrotated aisle label
in the app (generated OR hand-placed) is unaffected; only a 90°/270° rack
now measures correctly. `aisleObjectsForRacks` also exported (was
module-private) so it has its own direct test coverage instead of only
being reachable through the full store-writing `generateAndPlace` path.

Verify:   240×120/25×30/reach, both orientations, real
`sizingSheetLayout`→`placementToObject`→`aisleObjectsForRacks` pipeline,
widths computed with the same math `AisleLabel` now uses (temp vitest
test, removed after):
- **Vertical** — 22 racks (11 bands × 2 segments, unchanged from BUG 44),
  **20** aisle objects (10 gaps/segment × 2 segments — the pre-fix bug
  produced 11, one bogus cross-aisle-as-pick-aisle per band). Widths:
  12.5ft (wall→first double), 17.5ft ×8 (interior, column-absorbed),
  13.0ft (last double→wall) — repeated identically for both segments.
  All within [aisleFt, 2×aisleFt], nowhere near the old ~57.5/61.5ft.
- **Horizontal** — unchanged from before this fix: 14 racks, 12 aisle
  objects, widths 10.5/17.0/10.5/10.5/16.5/10.5ft per segment — confirms
  the rotation-aware rewrite is a true no-op for unrotated racks.
- Live Playwright run against the dev server (real Generate panel, grid
  hand-set to 25×30): vertical screenshot shows "12' 6"" and "17' 6""
  aisle labels tight between adjacent rack columns, matching the computed
  values exactly; horizontal screenshot unchanged from BUG 44's own
  verification. Zero console errors either run. Build clean, 315/315
  tests pass (added permanent regression coverage in
  `traceGenerate.test.js`: vertical aisle widths stay under 3×aisleFt for
  every generated aisle, vertical aisle count is exactly 20 not 11,
  horizontal stays within the same bound as a no-op check).

Lesson:   BUG 41 already solved "how do you read a rotated rack's TRUE
geometry" for column-checking, and that exact same unsolved problem was
quietly waiting in two OTHER consumers of rack geometry that happened to
predate rotation ever existing. A rotation-aware primitive is only as
useful as how many of its call sites actually get migrated to it —
worth grep'ing for `.x` / `.y` / `.width` / `.height` reads on rack-typed
objects elsewhere in the app before assuming BUG 41 was a complete fix
rather than the first of several.

## BUG 46 — refactor: collapsed sizingSheetLayout's last inline orientation branch into one named, tested seam (axisFrame)

Symptom:  Not a functional defect — a maintenance-risk report, filed right
after BUG 44/45 fixed the two actual vertical bugs. The concern: "vertical
and horizontal behave as separate code paths, every fix has to be done
twice." Asked to refactor so the S1/S2 walk is written once and runs on
either axis by parameterizing it, so tight-pack/absorb/accessibility/
travelFt apply to both automatically, and to CONFIRM the two orientations
share one code path.

Chased:   Audited the premise before changing anything, since BUG 44 and
45 were both already fixed by this point and the premise needed to be
checked against the CURRENT code, not the symptom that prompted them.
Traced every orientation/rotation branch across `generate/`:
`rowBands` and `rowSegments` (the actual S1/S2 walk — tight-pack, column-
absorb, `travelFt`) take a plain 1D extent + grid pitch and have NEVER
branched on orientation; `sizingSheetLayout` has always called them
exactly once each, just with axis-swapped arguments (BUG 41). `checkColumns`
(three-level accessibility) and its helpers branch only on a rack's own
`rotation`, via `rackFootprint`/`groupBySegment` (BUG 41) — one shared
function, not two. `aisleObjectsForRacks`/`AisleLabel` now do the same
after BUG 45. So the walk itself was never duplicated — what BUG 44 and 45
actually were was two SEPARATE shared functions (`rowSegments`,
`aisleObjectsForRacks`) that had a latent bug only reachable once
vertical existed to exercise them, not two parallel per-orientation
implementations drifting apart. The one piece of code that WAS still
orientation-branching was inline in `sizingSheetLayout` itself: the
`stackFt`/`runFt`/`stackGridFt`/`stackGridOffsetFt` axis selection, plus
an `if (!vertical) {…} else {…}` fork in the placement-construction loop
that computed each rack's world `xFt`/`yFt`/`angle`. Not aisle logic — a
pure coordinate transform — but exactly the KIND of seam BUG 44 and 45
both lived in (mapping the walk's output onto world space per axis), so
worth removing as a standing risk even though it had no active bug.

Cause:    N/A — pre-emptive refactor, not a bug fix. The risk was
architectural: a hand-written `if (vertical)` fork inline in a large
function is an easy place for a THIRD axis-shaped bug to hide, compared
to one small, named, independently-tested function.

Fix:      Extracted `axisFrame(orientation, { lengthFt, widthFt, gridXFt,
gridYFt })` in `sizingLayout.js` — returns `{ stackFt, runFt, stackGridFt,
stackGridOffsetFt, place(band, runPos, runLenFt) }`. `place()` is horizontal's
former passthrough (`{xFt: runPos, yFt: band.yFt, angle: 0}`) or vertical's
former centre-based rotation math, now the ONLY place either branch
exists. `sizingSheetLayout` now reads `const frame = axisFrame(orientation,
{...})`, calls `rowBands(frame.stackFt, {...})` / `rowSegments(frame.runFt,
{...})` exactly as before, and the placement loop is `placements.push({
type: band.type, ...frame.place(band, runPos, runLenFt), bays, ... })` —
no `if` left in `sizingSheetLayout` itself. Pure refactor: every argument
`rowBands`/`rowSegments` receive is byte-identical to before, so this
changes WHERE the axis decision is written, not what it computes.

Verify:   Build clean, 318/318 tests pass — critically, EVERY existing
BUG 44/45 regression test still passes unmodified, proving the refactor
changed no observable output. Added direct `axisFrame` unit tests
(horizontal: pure passthrough, angle 0; vertical: rotates around the true
centre, grid offset matches `columnGridObject`'s own centring formula) plus
a textual guard test (`sizingSheetLayout.toString()` contains no
`orientation === 'vertical'` and does contain `axisFrame(` — fails loudly
if a second orientation fork ever creeps back into the function). Live
240×120/25×30/reach on both orientations, real Generate panel:
- **Horizontal** — 14 racks, 12 aisles, widths 10.5/17.0/10.5/10.5/16.5/
  10.5ft (×2 segments), 2,496 pallet positions, 0 true accessibility
  failures — byte-identical to BUG 45's own numbers.
- **Vertical** — 22 racks, 20 aisles, widths 12.5/17.5×8/13.0ft (×2
  segments), 1,920 pallet positions, "No column interference" — byte-
  identical to BUG 45's own numbers.
Screenshots pixel-identical to BUG 45's verification screenshots for both
orientations; zero console errors either run. Confirms the two
orientations share one code path not by assertion but by construction —
`axisFrame` is the only function in the module that reads `orientation`.

Lesson:   Sometimes the right response to "these feel like two code
paths" is to verify they're already one (they mostly were, here) rather
than assume the report is describing the codebase as it currently
stands — BUG 44 and 45 were fixed as two ordinary bugs in shared
functions, not as "vertical's version of the logic," and conflating "a
shared function had a latent bug" with "the logic is duplicated" would
have led to a much bigger, unnecessary rewrite. The part of the report
that WAS actionable — one remaining inline fork — was real and worth
collapsing anyway, both to remove a standing risk and to make the
"single path" property checkable by a test instead of only true by
inspection.

## BUG 47 — feature: automatic orientation pick (run both, place the denser one), manual toggle kept as an override

Symptom:  Not a bug — a feature. Now that BUG 46 made orientation a single
clean seam (`axisFrame`) and BUG 41/44/45 made both orientations
correctly tight-packed and accessible, the manual Horizontal/Vertical
toggle from BUG 43 could finally be automated: generate both, place
whichever has more capacity, without a dealer needing to try both by
hand and remember which was better.

Chased:   N/A — additive feature on top of already-correct code, not a
fix. The only design question was WHERE to run the comparison without
placing (and then discarding) the loser's hundreds of objects in the
store — `pickOrientation` needed to score both candidates from their raw
`placements[]` (pure, pre-`addObject`) rather than by actually generating
both into the canvas and measuring which one to keep.

Fix:      `pickOrientation(brief, generateLayout, rules)` in
`traceGenerate.js`: runs `generateLayout({...brief, orientation}, rules)`
for `'horizontal'` and `'vertical'`, scores each via
`getLayoutCapacity(placements.map(placementToObject), rules).total` — the
SAME capacity function the UI's own result number always came from, not a
separate count — and returns the orientation with more (ties keep
horizontal). Pure: neither candidate touches the store, so scoring never
draws the loser. `buildQueue` (the one function both `generateAndPlace`
and `generateAndPlaceBatched` funnel through) now branches on
`brief.orientation === 'auto'`: auto calls `pickOrientation` and places
only the winner's placements; a manual `'horizontal'`/`'vertical'` still
calls `generateLayout` exactly once, unchanged — the override costs no
extra work and can't be second-guessed by the comparison. Both entry
points now return `{ total, orientation, horizontalTotal, verticalTotal }`
instead of a bare number (`horizontalTotal`/`verticalTotal` are `null` for
a manual pick — the caller only ran one candidate, there's nothing to
compare) — a return-shape change, but `generateAndPlaceBatched`'s only
caller is `GeneratePanel.jsx`, updated in the same change; `generateAndPlace`
has no callers in `src/` yet, so neither had anything to break.
`GeneratePanel.jsx`: ROW DIRECTION is now a 3-way Auto/Horizontal/Vertical
toggle, `orientation` state defaults to `'auto'`, and the result card
shows the comparison line ("Auto-picked Horizontal — 2,496 horizontal vs
1,920 vertical") whenever `horizontalTotal` is present, i.e. only in auto
mode — a manual pick's result card is unchanged from before this feature.

Verify:   240×120/25×30/reach, real Generate panel, Auto left at its
default (no click needed — confirmed the toggle's own default state is
Auto, highlighted, before touching anything): **Auto-picked Horizontal —
2,496 horizontal vs 1,920 vertical**, and the canvas drew the horizontal
layout (racks running left-to-right, tight aisles) — the reported winner
is provably what got placed, not just a claimed number. Then explicitly
overrode to Vertical on the same building/grid: produced 1,920 (vertical,
confirmed by screenshot — tall racks, top-to-bottom rows), no comparison
line (manual mode correctly has nothing to compare), proving the override
still works and still costs exactly one generate. Zero console errors
either run. Build clean, 322/322 tests pass — added `pickOrientation`
coverage in `traceGenerate.test.js`: the real 240×120/25×30/reach case
(byte-identical 2,496/1,920, and the winning `placements` array equals
calling `sizingSheetLayout` directly with `orientation:'horizontal'` —
auto places exactly what manual would have, not a re-derivation), a
fake-`generateLayout` test proving the comparison/tie-break logic itself
independent of real geometry, a tie test (equal totals keep horizontal),
and a purity check (`pickOrientation` never touches the store).

Lesson:   `getLayoutCapacity` already existed as the app's one source of
truth for "how many pallet positions is this layout" (BUG-independent,
predates this session) — reusing it to SCORE the auto comparison, rather
than inventing a second capacity count just for the picker, means the
number reported in "Auto-picked X — A vs B" can never drift from the
number the result card shows after picking. Scoring from raw placements
before they ever reach `addObject` is what kept this pure and cheap; the
tempting alternative — generate both into the store, compare, delete the
loser — would have worked but done real store/history-snapshot writes
for a candidate that gets thrown away.

## BUG 48 — column clearance label had no direction: added an arrow showing which side of the column the clear space is on

Symptom:  The "8' clear" column label said HOW MUCH clearance a travel-
aisle column had, but not WHICH SIDE — the pill was offset toward
`clearSide`, but an offset alone reads as positioning noise, not a mark.

Chased:   N/A — additive, not a fix. The only design decision was how
long to draw the arrow: scaling it to the real `clearFt` distance (1ft to
20+ft depending on the layout) would make the mark itself unreadable at
one end of that range, so it's drawn at a small SCREEN-constant length
instead — like every other size in `DimensionLabels.jsx` (fs/aw/sw/padX),
matching AisleLabel's own convention of screen-constant marks.

Fix:      `ColumnClearanceLabels` (DimensionLabels.jsx) now draws a
stroked shaft + filled triangle from the column's own edge toward
`clearSide`, using the exact same line+triangle mechanism `AisleLabel`
already uses for its tick marks (`Line` + `Line closed fill`, apex at the
target point) — single-headed rather than AisleLabel's double-headed span,
since only one endpoint (the column) is real geometry here; the far end
is a fixed 12px-screen mark, not a second known face. The label pill
still sits past the arrow's tip, unchanged position. `gridSize` was the
only prop this component needed for a clearFt→px scale that no longer
exists, so it was dropped from the signature and its one call site
(Overlays.jsx) — no other behaviour changed.

Verify:   Live Playwright run against the dev server, vertical generate on
240×120/25×30/reach, a 4x-device-scale cropped screenshot of a real
rendered label: a short blue shaft + arrowhead points DOWN from the
column's bottom edge to the "8' clear" pill, matching `clearSide='bot'`
for that column (clear toward the row below it) — confirmed against the
real `aisleBlocks` data the running app computed, not a mocked one. Build
clean, 326/326 tests pass (no test coverage needed changing — this
component had none before and the fix doesn't change `aisleBlocks`/
`columns`, only how they're painted).

Lesson:   A value with an implicit direction (an offset, a sign, a side)
reads as intentional placement only if something ELSE marks the
direction explicitly — the offset alone was already "correct" by BUG-38-
era design, it just wasn't legible as a direction to someone who hadn't
read the source.

## BUG 49 — vertical aisles couldn't be selected or deleted: aisleRect measured the wrong rectangle for a rotated rack, same root cause as BUG 45

Symptom:  In vertical orientation, clicking an aisle (the gap between two
rack bands) never selected it, so Delete never worked — the one place
BUG 45 hadn't reached yet.

Chased:   Recognized the shape of the bug immediately from BUG 45:
`hitTest.js`'s `aisleRect(aisle, objects)` reads `row1.x/y/width/height`
directly as the aisle's two bounding rows, exactly the same raw-field
read `AisleLabel` used before BUG 45 — and for a 90°-rotated vertical
rack those fields are still the PRE-rotation local box, not the true
world box. Traced the actual failure mode: with the wrong (unrotated)
boxes, the `aw <= 0 || ah <= 0` guard at the end of `aisleRect` holds for
almost every real vertical pair (confirmed by hand-deriving one concrete
case and checking it against the fixed code in a temp test — see BUG 49's
test in `canvas2HitTest.test.js`), so `aisleRect` returns `null`,
`hitTest`'s `'aisle'` branch never matches, and the click falls through
to whatever's underneath (or nothing) instead of selecting the aisle.

Cause:    Same root cause as BUG 45, in a THIRD consumer that predates
vertical orientation and had never been migrated to rotation-aware
geometry: `aisleRect` is shared by `hitTest.js` (the pick), `AisleShape`
(the Konva hit region/paint) and `outlineBounds` (the selection outline)
per the file's own header comment ("can never disagree about where an
aisle physically is") — but that comment only guaranteed the THREE
consumers agreed with EACH OTHER, not that any of them were right for a
rotated rack.

Fix:      `aisleRect` now builds its two comparison boxes from
`rackFootprint(row1)`/`rackFootprint(row2)` (`generate/columnCheck.js`,
already exported for BUG 45) instead of the rows' raw fields — a no-op at
rotation 0/180, so every existing horizontal aisle (generated or hand-
placed) is unaffected. Because `AisleShape` and `outlineBounds` both call
this same function, the fix reaches the Konva hit region and the
selection outline too, not just the `hitTest` pick — one change, three
consumers corrected together, matching the file's own stated design
intent instead of only half-satisfying it.

Verify:   Two layers, both real: (1) `canvas2HitTest.test.js` — a hand-
derived rotated pair (two 90° racks whose true footprints sit 100px
apart) where the OLD math would have measured a negative-height box and
returned `null` (worked through by hand and confirmed against the fixed
code), the NEW math returns the exact rect `{x:120,y:-80,width:100,
height:200}`; a `hitTest` call at the centre of that rect resolves to the
aisle's id, a click on the rack itself does not; an unrotated pair is
provably unaffected (same rect the raw-field math would give). (2) Live
Playwright run against the real dev server: generated vertical on
240×120/25×30/reach, looked up a REAL generated aisle object, computed
its rect via the actual running `aisleRect` (dynamic import from the dev
server, not a re-implementation), clicked the real screen point the math
produced — `selectedIds` included the aisle's id — pressed Delete —
`objects.length` dropped by one and the aisle was gone. Zero console
errors. Build clean, 326/326 tests pass.

Lesson:   BUG 45's own lesson ("grep for other consumers before assuming
a fix is complete") applied a second time to a THIRD consumer of the same
raw-geometry pattern — `aisleRect` wasn't found by grepping in BUG 45
because the search there was scoped to aisle LABELLING, not aisle
PICKING; the two are different files serving different concerns that
happen to share the exact same underlying geometry bug. A rotation-aware
primitive earns its keep in proportion to how many places actually
adopted it — worth periodically grepping for `\.x\b.*\.y\b.*\.width\b`-
shaped reads on rack-typed objects across the WHOLE app, not just the
file that prompted the last fix.

## BUG 50 — BUG 48's clearance arrow still pointed the wrong way in vertical orientation: clearSide isn't an axis, it's "near/far along whichever axis the racks stack on"

Symptom:  User reported BUG 48's arrow "still the same" in vertical
orientation — screenshot showed "8.5' clear" labels with a tiny, barely-
visible mark, nothing readable as a directional arrow, unlike the bold
double-headed orange aisle-width arrows right next to it.

Chased:   Two separate things were wrong, and the screenshot only
directly evidenced the second:
1. `ColumnClearanceLabels` treated `clearSide` as if it always meant "up"
   (`top`) or "down" (`bot`) in world space. Re-read `columnCheck.js`'s
   own computation (the block that sets `clearSide`, inside the aisle-gap
   loop keyed on `stacked = rackFootprint(run[0]).rotated`): `clearSide`
   is measured along whichever axis the racks are STACKED on — Y for
   horizontal (unrotated) racks, but X for vertical (rotated) ones, since
   vertical's own aisles run left/right between adjacent rack bars, not
   up/down. BUG 48 never read `stacked`/rotation at all, so in vertical
   orientation it was drawing a vertical arrow to describe a horizontal
   relationship — pointing 90° off from the real direction.
2. Independent of (1), BUG 48's arrow length (12/zoom) exceeded the
   label's own offset (10/zoom), so the arrow's tip landed PAST the
   label's centre — behind the opaque label pill, invisible regardless of
   which axis it was drawn on. This alone would have made even a
   correctly-oriented horizontal-case arrow hard to see; the two bugs
   compounded into "no visible direction at all" for vertical, where both
   were wrong simultaneously.

Cause:    (1) is the same class of mistake BUG 45/49 already named twice
— code written before vertical orientation existed, and never revisited
to check whether an assumption ("this axis is always Y") still held once
a second axis became real. (2) was a plain sizing mistake introduced
while fixing (this session's own BUG 48), never caught because the
verification screenshot at the time was zoomed too far out to notice a
12px-vs-10px overlap.

Fix:      `ColumnClearanceLabels` now resolves the real axis from the
actual rack geometry instead of assuming one: looks up
`objects.find(o => o.id === a.betweenRows[0])` (BUG 39's own
`aisleBlocks` already names the two bounding racks) and reads
`rackFootprint(row).rotated` — the same rotation-aware primitive BUG 41/
45/49 all already share, so this needed no new geometry concept, just
using the one that already existed. `horiz = rotated` picks the arrow's
direction vector (`dx,dy`) and its perpendicular (`px,py` — where the
arrowhead's two base corners spread), so one set of vector math now
draws a correctly-oriented arrow on either axis instead of hardcoding Y.
Sizing was reworked from scratch rather than patched: `shaftLen=20/zoom`,
`aw=7/zoom` (up from 12/zoom and 5/zoom — a genuinely more visible mark,
closer to what "like the aisle labels" asked for), and the label's
position is now DERIVED from the arrow's own tip (`tipD + gap +
labelH/2`, where `labelH` matches `LabelPill`'s real `fontSize*heightScale`
formula) instead of an independently-guessed constant — so the two
literally cannot overlap regardless of either one's size, by
construction rather than by coincidentally-compatible numbers. `objects`
threaded through as a new prop (`Overlays.jsx` already had it in scope
for `AisleLabel`, so this was a one-line pass-through, not new plumbing).

Verify:   Live Playwright run against the dev server, 240×120/25×30/reach,
both orientations, 4x-device-scale cropped screenshots of real rendered
labels (not mocked geometry):
- **Vertical** (22/22 racks rotated) — arrow now runs HORIZONTAL, shaft +
  triangular arrowhead clearly visible pointing from the column's right
  edge to its "8' clear" label, no overlap.
- **Horizontal** (0/14 racks rotated) — arrow runs VERTICAL, pointing up
  from the column to its "8' clear" label — confirms the fix is a true
  generalization, not a vertical-only special case; the horizontal
  behaviour BUG 48 intended is preserved exactly, just via the same
  code path instead of a hardcoded axis.
Zero console errors either run. Build clean, 326/326 tests pass (no
existing test covered this component's rendering before or after — the
verification is the live-render screenshots, consistent with how BUG 48
itself was verified).

Lesson:   Reporting "still the same" after a fix is real signal, not just
an annoyance — it meant the first fix's OWN verification (a zoomed-out
screenshot that showed the label existed, without checking it against
the real `clearSide` semantics or looking closely enough to catch the
overlap) wasn't rigorous enough to have caught either bug. Re-deriving
the axis from actual rack geometry rather than hardcoding one, and
deriving the label's position from the arrow's own computed size rather
than a second guessed constant, are both the same fix in spirit: stop
encoding an assumption as a literal number, compute it from the thing
that's actually true.

## BUG 51 — BUG 50's arrow was geometrically correct and still invisible: 20px screen-constant read as a smudge, not a mark, at the zoom a dealer actually works at

Symptom:  User reported "still cannot see the arrows" after BUG 50,
screenshot showing "8.5' clear" labels with what reads as a meaningless
tiny square, not a recognizable arrow — at a zoom level much like a
dealer would actually work at (columns tall and thin, several visible
across the building), not zoomed in tight on one label.

Chased:   Did NOT assume BUG 50 regressed — verified the live math first,
since the report could mean either "wrong direction again" or "right but
invisible." Added a temporary trace (`window.__traceClearance`) logging
every computed point, and separately three colour-coded fixed-size debug
markers (green at the column centre, magenta at the arrow tip, cyan at
the label) rendered directly in place of the real shapes. Both confirmed
the geometry was exactly correct: green–magenta–cyan landed in the right
relative order for both `clearSide` values, non-overlapping, correctly
axis-selected — everything BUG 50 was supposed to fix, still holding. An
early zoom=3 test that seemed to show nothing turned out to be a mis-
targeted camera pan in the TEST SCRIPT (a fresh `checkColumns` recompute
picking a different array-order match than the one actually on screen),
not a rendering bug — caught by re-deriving the target from the SAME
live column data the component itself uses and re-testing.

Cause:    The arrow was drawn at a fixed 20px screen-constant length
(`shaftLen`) with a 7px arrowhead (`aw`) — deliberately NOT scaled to the
real clearance distance (BUG 48's own reasoning: clearFt ranges roughly
1–20+ft, so scaling to it would make the mark unreadable at one end of
that range). But 20px is also small enough that at any zoom where several
columns and their labels are visible at once — i.e. the zoom a dealer
actually reviews a layout at — it reads as an indistinct blob sitting
next to the label, not as a shaft-plus-arrowhead shape. AisleLabel's own
arrows don't have this problem because they DO scale, with the real
aisle gap (often hundreds of screen px) — the two components' arrows
were never actually comparable in scale, which is exactly what "like the
aisle labels" was asking for and BUG 48/50 hadn't delivered.

Fix:      Kept the screen-constant design (still the right call — no
scaling to clearFt) but sized it up substantially: `shaftLen` 20→34px,
`aw` 7→13px, `sw` 1.3→2.2px. No geometry/direction logic touched — BUG
50's axis-resolution and non-overlap derivation are untouched, this is
sizing only.

Verify:   Live Playwright run against the dev server, 240×120/25×30/
reach, vertical orientation, 4x-device-scale screenshots at the SAME
zoom level the user's own screenshot used (multiple columns visible
across the building): the arrow now reads as an unmistakable
shaft-plus-triangle between column and label, for BOTH `clearSide`
directions — confirmed at the wide/working zoom, not just a tight crop.
Re-verified horizontal orientation at the same zoom: clear vertical
arrows pointing up from column to label, equally legible, confirming the
size bump didn't overshoot into looking oversized or cluttered next to
the rack geometry. Zero console errors. Build clean, 326/326 tests pass
(sizing-only change, no test assertions needed updating). All debug
instrumentation (trace array, coloured markers) removed before finishing.

Lesson:   "Correct but invisible" and "wrong" produce the identical user
report ("I can't see it working") — the debug-marker technique (render
the ACTUAL computed points in an unmissable fixed colour/size, right in
place of the real shapes) settled which one this was in one screenshot,
where reasoning about zoom/scale/pixel math alone had already gone in
circles across several earlier attempts. Verifying at the zoom the user's
own screenshot used, not a convenient close-up, is what caught that the
first size (chosen and verified in a tight crop) didn't survive zooming
back out to a working view.

## BUG 52 — the resonance's real cause: the aisle-absorb gate compared against aisleFt (pick width) instead of travelFt (drive-through minimum), so it widened for columns that were never actually blocking anything

Symptom:  The earlier "packing inconsistency" diagnostic (pre-BUG44)
found that nearly every interior aisle in vertical orientation blew out
to ~17.5ft in lockstep with the column grid, instead of staying tight to
the 10.5ft reach aisle — that diagnostic reported WHAT the walk did but
was explicitly asked not to fix it. This task supplied the actual fix,
from PP's own hand method: the walk should only widen an aisle when a
column is closer than the truck's drive-through minimum (travelFt, 8ft)
— not merely because it's closer than the full pick width (aisleFt).

Chased:   N/A — root cause was already fully traced in the earlier
diagnostic (`rowBands`' STEP 2, the `gapToNextColumn` check before
placing each aisle) and confirmed again here by hand-deriving that the
walk's natural pitch (rack+aisle = 18ft) resonates with a 25ft column
grid, and that the OLD gate — `gapToNextColumn >= aisleFt` — triggered a
widen for ANY gap under 10.5ft, including gaps between 8 and 10.5ft that
already had enough room for a truck to physically drive through (BUG 39's
own "level 2, one-side pick" case, accessible by default). The walk was
reacting to a case its own accessibility model already treats as fine.

Cause:    `rowBands`' aisle-placement step gated the absorb formula on
`gapToNextColumn >= aisleFt` instead of `>= travelFt`. Since
`aisleFt(10.5) > travelFt(8)` for reach trucks, this meant the walk
treated "not quite full pick width" as equivalent to "truck can't get
through," widening every time — and because the widened aisle's own
width plus a rack's depth happened to land in near-lockstep with the
25ft column grid, that over-reaction repeated on almost every single
interior gap instead of being a rare correction.

Fix:      One-line gate change in `rowBands` (`sizingLayout.js`,
STEP 2): `gapToNextColumn >= aisleFt ? aisleFt : Math.max(...)` →
`gapToNextColumn >= travelFt ? aisleFt : Math.max(...)`. The widen
formula itself (`Math.max(aisleFt, gapToNextColumn + COL_WIDTH_FT +
travelFt)`) is untouched — still guarantees the far side of a genuinely-
too-close column gets a full travelFt of drive room. Only the TRIGGER
changed: a column with 8–10.5ft of near-side clearance now gets a plain
aisleFt aisle (the column simply sits inside it, correctly reported as
level 2/accessible by the existing 3-level system, not specially handled
by the walk), and only a column with under 8ft near-side clearance still
forces the aisle to widen.

Verify:   240×120/25×30/reach, both orientations, real `rowBands`/
`sizingSheetLayout`, before vs after:
- **Horizontal** — bands unchanged at 7 (this grid's 30ft Y-pitch was
  never as tightly resonant as vertical's 25ft X-pitch), but the two
  gaps that used to over-widen to 16.5–17ft are now tight (10.5–11ft);
  real pallet capacity unchanged at 2,496 (same band count, same
  segments) — confirms the fix is a true no-op where no column was ever
  genuinely too close.
- **Vertical** — bands rose from **11 to 14** (3 more rows fit): gaps
  now `[12.5, 10.5, 12.25, 10.5, 11.75, 10.5, 12.25, 10.5, 11.75, 10.5,
  12.25, 10.5, 11.25]` — tight-packed 10.5–12.5ft throughout, no more
  uniform 17.5ft resonance. Racks rose 22→28, aisle objects 20→26, and
  real pallet capacity rose **1,920 → 2,400** (+25%). Auto-pick still
  chooses horizontal (2,496 > 2,400) — closer than before, but still a
  clear win, unchanged from BUG 47's own tie-break logic.
- **Honest new finding, not a regression**: vertical now shows **3
  genuinely blocked aisles** (6.8ft clear of the needed 8ft) that never
  existed before — because the old gate's over-eager widening had been
  accidentally papering over every near-miss with the full absorb
  treatment. These are real: a column sitting exactly 6.8ft from the
  previous rack's edge cannot be fixed by widening the aisle's far side
  (the near side is already placed and can't move) — the existing BUG 39
  accessibility system correctly surfaces this via the ColumnCheckPanel's
  "Aisle blocked" cards with Absorb/Remove-section affordances, exactly
  as designed, for the dealer to resolve. Confirmed live: the running app
  reports "0 columns in racks · 3 aisles blocked" with the exact 6.8ft/
  11.3ft numbers.
Live Playwright screenshots on the real dev server confirm both
orientations render correctly (tight aisle labels, visible clearance
arrows, no visual artifacts), zero console errors. Build clean, 326/326
tests pass — two pre-existing tests had hardcoded numbers from the old
(buggy) output (`verticalTotal: 1920`, `racks.length: 22`,
`aisles.length: 20`); updated to the new correct values (2400/28/26)
with comments explaining why the numbers moved.

Lesson:   The earlier diagnostic's "don't fix yet" scope was worth
respecting literally — it meant this fix started from an already-
complete, already-verified root-cause trace instead of re-discovering it
under time pressure. A gate is only as correct as the THRESHOLD it
compares against, not just its presence — the walk always HAD an
accessibility-aware absorb formula (BUG 38-40), it was just comparing
the wrong two numbers, treating "not full pick width" as "blocked" when
the app's own 3-level model had already defined a real difference
between those two thresholds.

## BUG 53 — feature + fix: allowColumnInRack exposed in the UI, and the actually-blocked aisles resolved (they lived at the far-wall transition, not the interior walk BUG 52 already fixed)

Symptom:  Two asks: (1) `allowColumnInRack` — whether a customer allows a
column to sit inside a rack body (losing pick positions there) versus
never allowing it (dropping the row instead) — was already a real
parameter the generator read (`rowBands`/`sizingSheetLayout`, since
GENERATOR_SPEC_V10), but `GeneratePanel.jsx` never sent it, so every
generate ran the S1 (never-allow) default with no way to change it. (2)
BUG 52 broke the resonance but left 3 aisles genuinely blocked (6.8ft
clear of the needed 8ft) on 240×120/25×30/reach vertical — asked to
resolve those, gated on the same preference: absorb the column into the
row (kept) if allowed, or drop the row (gone) if not.

Chased:   Part 2 took three real attempts before landing correctly, each
one caught by testing rather than assumed correct:
  1. First attempt added an interior STEP-2 pinch check (`gapToNextColumn
     < travelFt` → shift or drop the row just placed) and looped back
     into the ordinary aisle-placement code to continue. Testing found an
     literal infinite non-terminating pattern for the DROP case:
     resuming from the pre-drop position re-derives the byte-identical
     row (the walk is a pure function of position), recreating the exact
     same pinch forever until the loop's own guard counter silently gave
     up, producing a ~195ft dead gap with zero rows in it.
  2. Second attempt fixed the exact-recreation by skipping `lastEnd`
     forward to the pinching column's own far edge before resuming. A
     REAL instrumented trace (not hand-derived — hand-tracing this exact
     scenario had already produced two wrong predictions) showed a
     DIFFERENT infinite pattern: resetting to a column-derived position
     is provably grid-locked (same residue mod gridYFt every time, since
     gridOffsetFt and the column's own half-width are both constants),
     so the very next normal-width aisle+row cycle lands at the identical
     resonant phase relative to the NEXT column, forever — bandsLen
     oscillating between two counts for 15+ cycles, net zero rows placed
     across the whole remaining span.
  3. Before attempting a third fix, tested whether the interior
     intervention was even NECESSARY: temporarily disabled it and ran
     real `checkColumns` on the resulting horizontal geometry — zero
     blocked aisles, matching BUG 52's own original report exactly. Hand-
     derivation then confirmed WHY: the interior widen formula
     (`Math.max(aisleFt, gapToNextColumn + COL_WIDTH_FT + travelFt)`)
     places `afterAisle` exactly `travelFt` past the column's far edge,
     by construction, every time — and `checkColumns` scores accessibility
     as `max(nearClear, farClear) >= travelFt`, not both sides — so an
     interior pinch can never actually come back level-1 once BUG 52's
     own widen formula has run. The 2nd/3rd attempts were fixing a
     problem that didn't exist, at real capacity cost (confirmed: it
     dropped a row in horizontal despite horizontal already reporting
     zero blocked aisles). Traced the REAL 3 blocked aisles instead by
     inspecting their actual geometry: both bounding rows had
     height=3.5ft (single-row depth) and one sat exactly at `bottomY` —
     the far-wall mirror row, placed unconditionally by STEP 1's own
     "always" rule with ZERO column-awareness, the one transition the
     interior walk's fix never touched.

Cause:    (1) Pure UI gap — the parameter existed, nothing sent it. (2)
The far-wall transition (`bands.push({ yFt: bottomY, ... })`, after the
wall-hit space-only cleanup) never checked for a column inside the final
gap; it only ever verified there was enough ROOM (`remaining >= aisleFt`),
never whether a column sitting in that room left either side driveable.

Fix:      (1) `GeneratePanel.jsx`: added `allowColumnInRack` state
(default `false`, matching the walk's own S1 default so an untouched
panel is unchanged) and a Yes/No toggle ("ALLOW COLUMNS INSIDE RACKS"),
included in the brief `generateAndPlaceBatched` sends — no changes needed
in the generator itself, it already read this field end-to-end. (2)
Reverted the interior STEP-2 walk to pure BUG 52 behaviour (removed the
unnecessary/broken pinch branch entirely — the widen formula was already
correct there, restored with an explanatory comment recording why a
row-level intervention isn't needed at that step). Added a NEW, separate
column-aware loop after the existing wall-hit space cleanup, before the
far-wall row gets pushed: finds any column inside `[lastEnd, bottomY)`
where `max(nearClear, farClear) < travelFt` (the far wall's own edge is
fixed, so only the near-side row can move) and resolves it the same way
— `allowColumnInRack`: shift the last row forward so its far edge covers
the column (kept, absorbed); otherwise: pop it (dropped, gap reopens) —
then re-applies the original space-only cleanup (a shift/drop here can
just as easily break the `remaining >= aisleFt` guarantee) before
re-checking for further columns, looping until clear or down to the
locked near-wall row.

Verify:   240×120/25×30/reach vertical, real `rowBands`/`sizingSheetLayout`
+ real `checkColumns`, both `allowColumnInRack` settings:
- **false (No)**: 13 bands (11→14 under BUG 52 alone, since BUG 52 never
  fixed the actually-blocked ones →13 once the pinching row was dropped),
  26 racks, `rackConflicts: 0` ("never put a column in a rack" — held),
  `aisleBlocks` level-1 count: **0**. Min aisle width 10.5ft, one 25.25ft
  gap where the dropped row used to be.
- **true (Yes)**: 14 bands (row kept, not dropped), 28 racks,
  `rackConflicts: 9` (columns genuinely landed in rack bodies — confirmed
  live via the ColumnCheckPanel's own "9 columns in racks" + "Absorb −4"
  cards), `aisleBlocks` level-1 count: **0**. Min aisle width still
  10.5ft — no aisle anywhere below travelFt, either setting.
- **Horizontal unaffected**: 14 racks, unchanged from BUG 52 (2,496
  pallet capacity) — confirms the interior-walk revert cost nothing there,
  since it never needed the extra intervention.
- Auto-pick's own vertical total moved 2,400 → 2,304 (the No/default
  case now correctly pays for zero-blocked-aisles instead of silently
  shipping 3 that were never actually driveable) — horizontal still
  wins either way.
Live Playwright run against the real dev server confirms the toggle
renders, reads correctly (rack counts match the unit-test numbers
exactly: 26 vs 28), and the panel itself reports the expected state —
"No column interference" for No, "9 columns in racks" with visible
Absorb/Remove-section cards for Yes, no "Aisle blocked" warnings in
either case. Zero console errors. Build clean, 330/330 tests pass
(2 pre-existing hardcoded numbers updated to the new correct values with
explanatory comments; 4 new tests lock in both toggle settings' rack
counts, zero blocked aisles, zero-vs-nonzero rackConflicts, the
travelFt floor across every generated aisle, and horizontal's
unaffected capacity).

Lesson:   Two lessons, both about not trusting a plausible-looking fix
without executing it: (a) a "fix" that only ever gets verified by
re-running the SAME deterministic function from a SLIGHTLY different
starting point can recreate its own bug — real instrumentation, not
hand-tracing, is what caught both failed attempts, and hand-tracing had
already produced two confidently-wrong predictions before that. (b)
Before extending a fix's scope, check whether the ORIGINAL fix already
covers the case — BUG 52's widen formula was mathematically sufficient
for the interior walk the whole time; the actual gap was a specific,
narrow, previously-untouched transition (the far wall), and finding that
took inspecting the REPORTED bug's own geometry directly rather than
assuming "gapToNextColumn < travelFt" was the right signal just because
it was the same threshold BUG 52 introduced.

---

## BUG 54 — cross-aisle left a wall gap, ignored columns, and reused aisleFt  (2026-09-22)

Symptom:  Three independent problems in the ONE cross-aisle `rowSegments`
splits a run into: (1) racks never reached the far wall — a symmetric
floored half-split (`halfFt = (usable - crossAisleFt) / 2`, `bays =
baysInRun(halfFt)`) left the same integer-bay rounding gap on BOTH the
interior (before the cross-aisle) and the far end (before the wall), but
only the far one is visible as "racks don't reach the wall." (2) The
split position was chosen with zero column-awareness, so a column could
land inside the cross-aisle itself — nothing ever checked. (3)
`crossAisleFt` defaulted to `aisleFt` (the pick aisle between rack
faces), not a per-forklift figure — reach/narrow-aisle trucks need far
less room to just drive straight through (~8-10ft) than counterbalance
needs to turn (~12-14ft), and a flat number either wasted floor space or
was too narrow, depending which truck it happened to match.

Chased:   First pass wired `crossAisleFt` per-forklift into
`rules.mhe[...].crossAisleFt` and rewrote `rowSegments` around a
"mathematical insight" that `runLenFt(n) = (upIn*(n+1) + n*beamIn)/12` is
LINEAR in bay count `n`, so `runLenFt(n1) + runLenFt(n2)` depends only on
`n1 + n2` — letting both segments sit wall-flush (fixing the wall gap)
with the split chosen for free to dodge a column (PP's method: hand a
bay from one section to the other "against the wall"). All 336 unit
tests passed and the live Playwright run against the real dev server
(both orientations, 240×120/25×30/reach) initially looked right too —
until the verification script's OWN bug-hunt (recomputing the actual
built gap between the two segments from their raw xFt/bays, independent
of the code's self-reported `crossAisle.widthFt`) turned up a 0.25ft
mismatch: `runLenFt(n1) + runLenFt(n2)` was actually 223.25ft for
n1=10/n2=17, not the 223ft `runLenFt(27)` the "linearity" claim
predicted. The insight was subtly wrong, not the implementation of it.

Cause:    `runLenFt(n) = (upIn*(n+1) + n*beamIn)/12` is AFFINE, not
linear through the origin — the `(n+1)` term means each segment carries
its OWN pair of end uprights. Two independent segments totalling `n1+n2`
bays need `(n1+1)+(n2+1) = n1+n2+2` uprights combined; one undivided run
of the same `n1+n2` bays needs only `n1+n2+1`. Splitting always costs
exactly one upright's width (`upIn/12` ft) MORE than the unsplit formula
assumes, regardless of the split — a constant the first pass's capacity
budget never reserved. Consequence: since `total` bays were chosen so
`runLenFt(total) <= usable - crossAisleFt`, and the ACTUAL combined
segment length is `runLenFt(total) + upIn/12`, the real gap could come
out as low as `crossAisleFt - upIn/12 + slack` — i.e. up to a quarter
foot UNDER the requested per-forklift floor whenever the integer-bay
rounding slack was smaller than one upright's width. A real regression
this fix would have introduced, caught only by an independent
recomputation in the live verification, not by trusting the function's
own self-reported number.

Fix:      `src/generate/sizingLayout.js` — `rowSegments` now reserves
the extra upright up front: `capacityFt = usable - crossAisleFt -
upIn/12` (was `usable - crossAisleFt`), and the reported
`aisleWidthFt = usable - runLenFt(total) - upIn/12` (was `usable -
runLenFt(total)`) — both segments still wall-flush
(`segments: [{xFt: x0, bays: n1}, {xFt: x1 - runLenFt(n2), bays: n2}]`),
still free to split anywhere `n1+n2 = total` without cost, since the
`upIn/12` constant depends only on the total, never the split — the
column-avoidance search (`intervalHitsColumn` against real column lines
computed via `axisFrame`'s new `runGridFt`/`runGridOffsetFt`, expanding
outward bay-by-bay from the balanced split) needed no change once the
budget was correct. `axisFrame` also gained `runGridFt`/`runGridOffsetFt`
— the run axis's own column pitch/offset, X-centered/Y-flush exactly
like `columnGridObject` draws, since `rowSegments` now needs to know the
run axis's grid the same way `rowBands` already knows the stack axis's.
`sizingSheetLayout` now defaults `crossAisleFt` from
`rules.mhe[...].crossAisleFt ?? aisleFt` and consumes `rowSegments`'
new per-segment `{xFt, bays}[]` shape (each segment computes its own
`runLenFt` from its own bay count, not one shared value).
`src/rules/defaults.js` — added `crossAisleFt: 9/8.5/13` to the
reach/vna/counterbalance MHE profiles.

Verify:   336/336 tests pass (34 in `sizingLayout.test.js`, including a
new BUG 54 describe block: both orientations × reach/counterbalance,
checking flush-to-both-walls, exactly one cross-aisle, built width >=
the forklift's floor via real `columnGridObject`/`expandColumnGrid`
geometry, and zero columns inside the aisle). Build clean. Live
Playwright run against the real dev server, 240×120/25×30, forklift
grid — all 4 combinations (horizontal/vertical × reach/counterbalance),
16/16 checks green:
- **Racks reach both walls**: span between first and last rack exactly
  equals the usable run length (239.5ft horizontal, 119.5ft vertical) —
  confirmed via each rack's ROTATION-AWARE bounding box (`rotation===90`
  swaps stored width/height back around the object's true centre before
  measuring), not raw pre-rotation x/y.
- **Exactly one cross-aisle**: racks group into exactly 2 distinct
  run-axis positions in every configuration.
- **Width matches the forklift**: built gap >= 9ft (reach) / >= 13ft
  (counterbalance) in every configuration — horizontal happened to land
  the same 16.25ft built width for both (the 4ft difference between
  9 and 13 is smaller than one bay's own pitch, so it didn't change the
  bay count), vertical differed correctly (11.75ft reach vs 20ft
  counterbalance).
- **Zero columns in the cross-aisle**: checked with the exact overlap
  formula the app itself uses (column half-width vs the real gap edges),
  against real `column_grid` geometry read from the live store, in all 4
  configurations.
- Auto-pick totals moved again from BUG 53's own numbers — 2,496/2,304
  (horizontal/vertical) → 2,592/2,496 — both risen for the same two
  compounding reasons: reach's 9ft `crossAisleFt` is narrower than the
  10.5ft `aisleFt` the cross-aisle used to borrow, and both segments now
  reach their own wall instead of leaving a gap at the far one. Zero
  console errors either orientation.

Lesson:   A derived "mathematical insight" is a claim, not a fact, until
it's checked against the actual formula it's about — `runLenFt` LOOKS
linear at a glance (`a*n + b`, no obvious per-n coefficient on the
constant), but the `(n+1)` inside it is exactly the kind of off-by-one
that turns "linear" into "affine with a split-count-dependent constant."
The bug survived a full green test suite AND an initially-green live
Playwright run because the verification script's first version trusted
the code's own self-reported `crossAisle.widthFt` instead of
independently re-deriving the actual gap from the raw segment
geometry — recomputing the same number two different ways (once from
the formula being tested, once from its output) is what surfaced the
0.25ft mismatch a same-formula check never could have. Recompute
independently, don't just re-display.

---

## BUG 55 — flue sizing ignored the column standing in it  (2026-09-22)

Symptom:  A back-to-back pair's flue is the physical gap between its two
faces. `rowBands` used one fixed `flueIn` (the standard 6") for EVERY
pair, including a pair whose flue was deliberately slid onto a column
(S1's "seat it in the flue instead of eating a pick slot" move,
established well before this bug). A real column is typically far wider
than 6" — the default `colSizeIn` is 12" — so "seated in the flue" was
never actually true: the rows would physically overlap the column. This
was purely a generator-side gap; `checkColumns`' own flue-seated test
(columnCheck.js) already only checks where a column's CENTRE lands, not
whether its full footprint fits, so nothing downstream ever caught it.

Chased:   None — the fix landed on the first design, but its numeric
target needed pinning down. The user's own formula, `columnWidth +
clearance (~4.8" per side, per rack-safety standard)`, read literally
(4.8" added on EACH side) gives 12 + 2×4.8 = 21.6" for a 12" column —
outside the user's own stated 16-17" verification band. Solving
16 <= 12 + x <= 17 for the clearance term x gives x ∈ [4, 5], meaning
the 4.8" figure is the TOTAL (both sides combined, ~2.4" each) — the
literal "per side" in the sentence was describing the number's origin
(a per-side rack-safety figure, doubled), not that 4.8" applies twice.
12 + 4.8 = 16.8", inside the target band — confirmed against the user's
own numbers before writing any code, not assumed.

Cause:    `rowBands` computed one shared `midFt = (2*depthIn + flueIn)/12`
for every `rack_double_row` band and stamped the same `flueIn` onto
every placement in `sizingSheetLayout`'s output loop — there was no
per-pair flue at all, so a pair could never be wider than standard
regardless of what it was seating. `COL_HALF_FT`/`COL_WIDTH_FT` were
also module-level constants hardcoded to a 12" column, decoupled from
`brief.colSizeIn` (the same size `columnGridObject` actually draws) —
harmless while every caller happened to use the 12" default, but wrong
in principle for the flue formula, which explicitly needs the REAL
column width.

Fix:      `src/generate/sizingLayout.js` — `rowBands` gained a
`colSizeIn = 12` parameter (threaded from `sizingSheetLayout`'s own
`brief.colSizeIn`, the SAME value `columnGridObject` already reads, so
the generator and the drawn column fixture always agree on column
size). Its internal column-footprint math (`nextColumnNearEdge`,
`columnsOverlapping`, the BUG 53 far-wall pinch check) now derives
`colHalfFt`/`colWidthFt` from `colSizeIn` instead of the module's
12"-assumed `COL_HALF_FT`/`COL_WIDTH_FT` (still used, unchanged, by
`rowSegments` — a separate concern, untouched). A new
`flueInForColumn()` returns `max(flueIn, colSizeIn +
COLUMN_FLUE_CLEARANCE_IN)` (`COLUMN_FLUE_CLEARANCE_IN = 4.8`). STEP 3's
double-row placement now computes a PER-PAIR `pairFlueIn`/`pairMidFt`
instead of reusing the shared `midFt`:
- S1's existing flue-slide (unchanged trigger — still only
  `!allowColumnInRack`) now slides onto a flue sized to actually hold
  the column (`flueStart` computed from the widened flue's own
  half-width, so the column lands CENTRED in it, clearance on both
  sides), not the standard one.
- A NEW unconditional check ("applies in any strategy," per the ask) —
  after `start` is set, if a column ends up inside THIS pair's flue
  zone regardless of whether S1 deliberately put it there (S2 never
  repositions a pair, so this only fires when a column coincidentally
  lands in a pair's default position), the flue still widens to fit it.
  A column landing in a FACE (not the flue) is untouched — that is the
  accepted, existing "absorb as a bay-column" cost, not a flue-fit
  question.
- A pair with no column anywhere near its flue is completely untouched
  — still the standard `flueIn`, never widens for nothing.
Each band now carries its own `flueIn` (`bands.push({ ..., flueIn:
pairFlueIn })`); `sizingSheetLayout`'s placement loop reads
`band.flueIn ?? flueIn` per placement instead of stamping one shared
value on every rack. The two wall-hit cleanup steps that used to
compute `freed = midFt - singleFt` (converting a trailing pair back to
a single) now use `last.depthFt - singleFt` — the pair's OWN depth,
which can now be wider than the shared `midFt` if it absorbed a
widened flue; using the stale shared value would have understated how
much depth converting it back to a single actually frees.

Verify:   341/341 tests pass (5 new in `sizingLayout.test.js`'s BUG 55
block): S1's deliberate flue-slide widens to `12 + 4.8 = 16.8"` (inside
16-17"), with the column's full footprint verified boundary-to-boundary
against the flue's own [lo, hi) — not just its centre — confirming
physical fit; a pair with no nearby column keeps the standard 6" flue;
S2 (`allowColumnInRack=true`) still widens for a column that
coincidentally lands in its flue, proving the fix is strategy-agnostic;
S2 does NOT widen for a column in a face (regression guard against
over-reaching into "absorb as bay-column" territory, which is a
separate, unchanged decision); and a full-stack integration test
(`sizingSheetLayout` → `placementToObject` → real `checkColumns`) where
the RENDERED object's `flueSpaceIn`/`height` reflect the widened flue
and `checkColumns` — reading that object completely independently —
classifies the column as `flueSeated` (free) with zero `rackConflicts`
for that pair. Build clean.

Live Playwright run against the real dev server (40×50ft,
gridXFt/gridYFt=20/20, reach truck, horizontal) confirms the SAME
numbers end to end: the double-row pair renders at height 8.4ft
(`(2×42+16.8)/12`), `flueSpaceIn=16.8`, and — independently recomputing
the column's real-world footprint from `expandColumnGrid`'s own
centreline convention (`cg.x`/`cg.y` ARE the first column's centre, not
a bounding-box corner — caught a mistake in the verification script
itself, which double-added a half-column offset on the first pass and
wrongly reported a fit failure) — the column's [−5.50, −4.50]ft
footprint sits entirely inside the pair's [−5.70, −4.30]ft flue, 0.2ft
(2.4") clear on each side, exactly the designed clearance. Screenshot
confirms visually: the flue renders visibly wider than the plain 6"
flue on every other pair in the same layout, with the column's marker
squares sitting right at its edges. Zero console errors. The two
genuine `rackConflicts` in this layout both belong to the WALL single
rows (no flue to seat a column in — unrelated, unaffected, expected).

Lesson:   A "~X per side" figure in a spec sentence needs its target
number checked against the OTHER number the same sentence gives before
writing formula code — reading "4.8" per side" literally would have
produced 21.6" against a stated 16-17" target, a contradiction that's
easy to miss if the formula is coded first and the verification range
is treated as a loose sanity check rather than the thing that pins the
constant down. Second: when a per-item field (here, a pair's flue)
that used to be shared/uniform across a collection becomes genuinely
per-item, EVERY downstream read of the old shared variable needs an
audit, not just the code path that motivated the change — the wall-hit
cleanup's `freed = midFt - singleFt` was two screens away from STEP 3
and easy to miss, but silently wrong (understating freed depth) the
moment a widened pair became the one being converted back to a single.

---

## BUG 56 — flue-seating widened without recentring, leaving a column half in the rack  (2026-09-22)

Symptom:  A column seated in a widened flue rendered as a small square
sitting at the flue's edge rather than filling most of it — "floating,"
not snug. Diagnosed first (report-only turn, no fix) against
240×120/25×30/reach: horizontal's every widened pair had its column
exactly at the flue's near edge, footprint `[89.5,90.5]` against a flue
of `[90.0,91.4]` — 6 inches of the column still inside face 1, a real
collision, not just cosmetic off-centring. Vertical's widened pairs, same
building, were all perfectly centred (diff 0). Root cause traced to BUG
55's own "applies in any strategy" fallback: it widened `pairFlueIn` in
place without ever moving `start`, so whenever S1's own centring slide
declined (because the ideal centred position needed to start earlier
than the aisle allows), the fallback still widened the flue anyway —
just in the wrong direction, growing `flueHi` outward from a `start`
that was never repositioned to begin with.

Chased:   None on the fix's shape — the design (clamp `start` to the
closest reachable point to ideal, then verify actual containment before
accepting) was right from the first pass. What needed chasing was two of
the new tests: (1) BUG 55's own "S2 widens for a coincidental column"
test (gridOffsetFt=19.2, depthIn=42/flueIn=6→16.8) turned out to encode
the OLD bug as an expected result — once containment is actually
verified, that exact scenario is the BUG 56 collision case itself, and
correctly now returns "not seated." Replaced it with a from-scratch
search confirming NO coincidental-S2 case is even mathematically
possible at these specific numbers: the detection window (a column
inside the narrow standard 6" flue) and the achievable full-containment
window for a 16.8" flue never overlap when `neededFlueIn >= 2×flueIn` —
proven algebraically (colY must be `< start+4.0` to be detected as
"coincidentally in the standard flue" but `>= start+4.2` to be seatable
without clamping past the aisle boundary; those never overlap regardless
of `minStart`). Rebuilt the test with `flueIn: 10` (narrows the gap
enough for a genuine ~1.6in window to exist) and searched for a real
`gridOffsetFt` inside it rather than guessing one by hand. (2) The
240×120/25×30 integration test asserted `widened.length > 0` for BOTH
orientations — after the fix, horizontal legitimately produces ZERO
widened pairs for this exact geometry (every one of them hits the
"aisle makes full containment impossible" case), which is the fix
working as intended, not a broken test; relaxed to expect zero for
horizontal and nonzero for vertical specifically, with a combined
"the invariant was actually exercised" assertion so the test can't pass
vacuously.

Cause:    `rowBands`'s STEP 3 (`src/generate/sizingLayout.js`) had two
separate flue-widening attempts sharing no logic: S1's slide computed a
correctly-centred `flueStart` but only applied it inside a hard
`flueStart >= start` gate — reasonable on its own (never shrink the
aisle), but when it failed, the SECOND ("any strategy") check ran
against the untouched `start`/standard `pairFlueIn`, found the same
column sitting in the narrow standard flue zone, and widened anyway —
`flueLo` pinned wherever `start` already was, `flueHi` extended forward
to cover the required width, with NOTHING checking whether the column's
own (fixed) footprint actually landed inside that shifted window. A
column near the AISLE-side edge of the standard flue zone — exactly
where "the ideal centred slide needs to start earlier than the aisle
allows" naturally puts it — is the worst case: its near edge sits before
`flueLo`, genuinely overlapping face 1.

Fix:      `src/generate/sizingLayout.js` — a new `seatColumnInFlue(colY,
minStart)` helper replaces both ad hoc widening attempts. It computes
the flue this column actually needs (`flueInForColumn()`, unchanged from
BUG 55), the ideal centred `start` for it, then clamps that to
`[minStart, bottomY - neededMidFt]` — the closest reachable point to
ideal the aisle boundary and the far wall actually allow — and only
THEN checks whether the column's real footprint (`colY ± colHalfFt`)
lands fully inside the resulting flue band. Returns `null`, not a
partial fit, when even the clamped position can't fully contain it.
STEP 3 now calls this once for S1 (gated on `!allowColumnInRack`,
unchanged trigger) and, only if that didn't seat something, once more
for the "any strategy" fallback against whatever column (if any) sits in
the pair's still-standard flue zone — same helper, same all-or-nothing
rule, both paths. A column that can't be fully seated falls through
untouched to the pair's plain, standard-flue placement — exactly the
pre-existing, accepted "may land in a face, costs pick positions"
bay-column path, never a widened-but-broken flue.

Verify:   345/345 tests pass — `sizingLayout.test.js` gained a BUG 56
block: (1) a clamped-but-fully-achievable case (ideal centring 0.1ft
short of the aisle) seats with a small, minimal, verified-contained
offset; (2) the genuine BUG 56 reproduction (ideal centring 0.5ft short)
confirms the flue stays standard and does NOT widen — no half-seat; (3)
a sweep across a full 30ft column pitch at 0.1ft resolution asserts that
every widened pair, for every offset, either fully contains its column
or doesn't widen — never a partial straddle; (4) the 240×120/25×30/reach
benchmark, both orientations, with the invariant checked against real
`sizingSheetLayout` → `placementToObject` → `rackFootprint` →
`expandColumnGrid` geometry (not a hand re-derivation). Build clean.

Live Playwright run against the real dev server, 240×120/25×30/reach,
both orientations — independently recomputing column-centre-vs-flue-
centre from the live store's own objects (not trusting any self-reported
field): horizontal now reports **0 widened pairs** (was 2, both broken,
pre-fix) — every column that used to produce a collision now correctly
falls through to the standard flue/bay-column path, screenshot confirms
a normal thin flue line, no orange band, "20 columns in racks" count
unchanged (that's the wall-row conflicts, always unrelated to this
fix). Vertical: 6 widened pairs, all `diffIn=0.00`, all
`fullyContained=true` — completely unchanged from before this fix,
confirming it didn't regress the case that already worked. Zero console
errors either orientation. Total pallet capacity unchanged both
orientations (2,592 / 2,496) — whether a flue widens or not never
affects bay/pallet count, only clearance.

Lesson:   "Applies in any strategy" (BUG 55's own framing) does not mean
"widen unconditionally" — a physical constraint (does the column
actually fit) has to be checked with the SAME rigor every time it's
invoked, not just on the path that happened to be built first and
tested hardest. The tell that this was under-verified: BUG 55's own test
suite was green, and its live Playwright check only looked at whether
`flueSpaceIn` and `checkColumns`' loose centre-tolerance classification
looked right — never independently recomputed the column's own footprint
against the flue's real boundaries. A field being the "correct number"
(16.8") says nothing about whether it's positioned somewhere that number
actually applies to. Second: once a fix makes a previously-accepted
result properly conditional (here: only seat a column if it truly fits,
which for this specific depthIn/flueIn ratio simply never triggers a
whole class of column positions), the tests written for the PRE-fix
behavior can look like regressions when they're actually the fix working
— the fix here didn't break horizontal's widening, it revealed
horizontal was never able to correctly widen for this building at all,
and 0 is the right answer.

---

## BUG 57 — the standard-flue fallback left a column straddling the face/flue boundary  (2026-09-22)

Symptom:  User re-measured a BUG 56 "no render bug" report against actual
pixels and confirmed one of the two findings was real: horizontal
(240×120/25×30/reach) drew a column sitting exactly ON the standard
flue's line — 6" inside rack face 1, 6" inside the 6" standard flue.
BUG 56 correctly refused to WIDEN the flue for this column (the aisle
boundary made full containment impossible), but left the pair at its
plain, un-slid position — where the SAME column, positioned near the
face/flue transition, ended up straddling it. Confirmed with a pixel
scanline of the real screenshot: two adjacent tinted runs (5.94" in the
face, 5.97" in the flue) summing to 11.91" — one 12" column, split
across the boundary.

Chased:   The re-measurement itself took two wrong turns before landing
on real numbers, both in the verification script, not the app — worth
recording since they produced confidently-wrong readings at each step:
(1) `stage.toCanvas()` (Konva's own compositing) gave inconsistent
results between otherwise-identical runs — switched to decoding the
actual saved screenshot PNG (`pngjs`) instead, which is what a user
actually sees. (2) The pixel scanline was initially oriented ALONG the
flue instead of ACROSS it (a `depthAxisIsY` sign flip), and the target
column was picked at a building-edge grid line where dimension-arrow/
wall-stroke chrome overlapped the scanline — both gave uniform, useless
colour reads that looked like real data until checked against a second
independent method (Konva's own `getClientRect`, then a hand-verified
close-up screenshot) that disagreed with them.

Cause:    STEP 3 of `rowBands` (`src/generate/sizingLayout.js`) had two
outcomes when a column overlapped a pair: seat it in a (possibly
widened) flue, or — when `seatColumnInFlue` returns null (BUG 56) —
leave the pair exactly where it was and move on. That second path never
asked whether the column, at that unmoved position, was actually fully
inside a face. A column near the tiny 6" standard flue's own boundary
routinely wasn't — the fallback that was supposed to mean "give up on
the flue, accept it as an ordinary bay-column" silently produced a
THIRD, un-handled outcome: neither flue-seated nor cleanly bayed.

Fix:      `src/generate/sizingLayout.js` — a new `seatColumnInFace(colY,
minStart)` helper, structurally the mirror of `seatColumnInFlue`: for
each of the pair's two faces, compute the `start` that would CENTRE the
column in that face, clamp it to `[minStart, bottomY - midFt]` (the
same aisle/wall bounds every other seat-attempt respects, using the
STANDARD, un-widened `midFt` since the flue isn't being touched here),
and verify the column's full footprint actually lands inside that face
before accepting it — same all-or-nothing rule as BUG 56, just applied
to a face instead of a flue. Tries both faces and keeps whichever needs
the smaller shift off `minStart`. Wired into STEP 3's existing
"any-strategy" fallback: when `seatColumnInFlue` returns null for a
column touching the flue zone, `seatColumnInFace` is tried before
giving up — if it succeeds, `start` moves (still standard `flueIn`,
never widened); if it also fails (documented as a residual, expected-
to-be-rare case — a face only needs `colWidthFt` of clearance vs a
flue's own width plus clearance both sides, so this almost always has
more room than the flue attempt did), the column is left exactly where
BUG 55/56 already put it.

Verify:   346/346 tests pass. Two new tests directly reproduce BUG 57's
own numbers: the exact `colY=19.2` collision case (BUG 56's own
"impossible" reproduction) now shows the pair SHIFTED (yFt 15.5 → 17.45)
so the column lands fully inside face 1, clear of the flue zone.
A full-column-pitch sweep (`off` 0→30 by 0.1, matching BUG 56's own
sweep test) asserts every column whose FULL footprint lies within a
pair's own span (front face through back face — explicitly excluding
columns that merely graze a pair's leading edge while mostly still
sitting in the open aisle, a different, already-correct case owned by
STEP 2's travelFt accessibility check, not this invariant) ends up
fully in face 1, the flue, or face 2 — never straddling. That
exclusion was itself found the hard way: the sweep's first two drafts
both flagged aisle-grazing columns as failures, which they were never
meant to satisfy — fixed by requiring the column's FULL footprint
(not just its centre, which still let a still-half-in-the-aisle column
through) to lie within the pair's total span before applying the
invariant at all.

For the real 240×120/25×30/reach benchmark, both orientations, every
column overlapping a rack pair was classified (FACE1 / FLUE / FACE2 /
STRADDLE) against real `sizingSheetLayout` → `placementToObject` →
`rackFootprint` geometry:
- **Horizontal**: 10/10 columns → `FACE1 (bay-column)`. **0 straddles**
  (was 10/10 straddling before this fix — the exact case the user's
  pixel measurement confirmed).
- **Vertical**: 15/15 columns → `FLUE (free)`. **0 straddles** —
  unchanged from BUG 56, confirming this fix didn't regress the
  already-working case.

Live Playwright run against the real dev server reproduces the
identical classification (10/10 FACE1 horizontal, 15/15 FLUE vertical,
0 straddles either orientation) reading straight from the live store's
own objects. The RightPanel's own Column Check list now shows "Double
Row · column N" entries for horizontal (columns genuinely absorbed into
the double-row pairs) where it previously only had "Rack Row · column
N" entries (the unrelated wall-row conflicts) — a real, visible
behavioural change: those 10 columns moved from an undefined
half-straddle into the pre-existing, correctly-counted bay-column cost.
Zero console errors either orientation.

Lesson:   "Give up and leave it as-is" is not a neutral fallback if the
thing being given up on (flue-seating) was the ONLY placement decision
being made — the code had exactly one repositioning tool and, when it
declined to use it, implicitly assumed the UNCHANGED position was
automatically fine. It wasn't; it just hadn't been checked. Whenever a
"try X, else leave unchanged" pattern governs the only degree of
freedom that affects an invariant, the "else" branch needs its own
verification, not an assumption that not-X implies safe-by-default.
Second, recorded again because it recurred within the same bug: a
sweep test's own filter for "which cases does this invariant even apply
to" is exactly the kind of thing that quietly narrows or widens scope
without the test author noticing — the first two drafts of this test
correctly found real code paths, then it took inspecting the ACTUAL
failing geometry (not just seeing `expected true, got false`) to
recognise they were flagging a different, already-correct mechanism
rather than blindly loosening the assertion until it passed.

---

## BUG 58 — canvas2's flue rendered as a filled band; the SVG reference draws a thin centred line  (2026-09-22)

Symptom:  Not a bug in the geometry — a rendering divergence between the
two engines. canvas2's `rack_double_row` painted the flue gap as a
solid-filled orange RECT spanning the gap's own real dimension
(`flueSpaceIn`, 6" standard or up to 16.8" widened per BUG 55). The SVG
reference (`ShapeGeometry.jsx`'s own `rack_double_row` case, the
UI/visual source of truth for this symbol) never fills the gap at all —
it draws the two row rects with the real gap left EMPTY (background
shows through) and marks it with one thin, clamped-width LINE centred
in the gap. A filled band reads as a third row rather than a gap; at
high zoom (BUG 55/56/57's own verification screenshots) this is what
made a correctly-sized, correctly-centred flue-seated column look like
it was floating in an oversized bar, even though the underlying
geometry (confirmed exhaustively across BUGs 55–57) was correct the
whole time.

Chased:   None on the geometry — this entry is purely about matching
canvas2's DRAWING to the SVG reference's already-established one; BUGs
55–57 had already independently, repeatedly verified (pixel-precise,
multiple methods) that the flue's real width/position/centring were
correct. The only open question was which mechanism to use for the
line's clamp width, since the SVG reference's `flueW = max(dHair*1.4,
min(flueH, dHair*4))` divides its hairline constant by the live `zoom`
(`dHair = 1.2/zoom`) to stay screen-constant through SVG's own
zoom-via-viewBox transform — but canvas2's `rackDrawOps` is explicitly
a pure, zoom-agnostic function (Scene.jsx's own comment: "Rack ops are
derived once per object and carry no zoom, so panning and zooming
rebuild nothing here"), so there is no `zoom` value available to divide
by at this layer. Resolved by recognising `RACK_LINE.hair` (canvas2's
own existing hairline constant, `1.2`, numerically identical to the
SVG's `dHair` at zoom=1) is used with Konva's `strokeScaleEnabled={false}`
— the SAME "stays a constant number of screen pixels regardless of
zoom" contract SVG's `/zoom` division achieves by a different
mechanism — so no zoom input is needed here at all; the port is a
direct value-for-value translation, not a re-derivation. Checked
whether the `min(flueH, hair*4)` clamp bound would behave sensibly
given `flueH` is a WORLD-px quantity being compared against a
screen-px-constant one: for every realistic `flueSpaceIn` (>= 6"), `flueH`
in world-px is always far larger than `hair*4` (4.8), so that branch of
the clamp is a no-op in practice for real racks and only engages as a
safety net for a degenerate near-zero flue — confirmed this matches the
SVG reference's own steady-state behaviour (its clamp resolves to the
same constant ~1.68–4.8 screen-px range for realistic flues too, just
by the zoom-cancelling `/zoom` mechanism instead).

Cause:    `rackDoubleRowOps` (`src/render/rackOps.js`) had a THIRD op in
its return list beyond the two row rects: `{ op: 'rect', x, y: y+rowH,
w, h: flueH, fill: RACK_PALETTE.flue }` — a filled rectangle sized to
the flue's own real (possibly BUG-55-widened) dimension. Nothing else
in the pipeline (bay highlights, dividers, hit-testing) assumed a
filled flue rect existed, so removing it required no other changes.

Fix:      `src/render/rackOps.js` — `rackDoubleRowOps` now emits the
two row rects (unchanged) plus a single `path` op: a horizontal line
from `(x, flueY)` to `(x+w, flueY)` where `flueY = y + rowH + flueH/2`
(the exact centre of the real, unfilled gap — unchanged math from
before, just no longer used to size a fill), `stroke:
RACK_PALETTE.flue`, `strokeWidth: flueW` where `flueW = max(RACK_LINE.hair
* 1.4, min(flueH, RACK_LINE.hair * 4))` — the same formula as the SVG
reference, translated as described above. The gap itself is left with
no fill — the two row rects' own edges bound it, and whatever sits
behind (page background, or a column drawn on top by its own separate
`column_grid` object, unaffected by this change) shows through.

Verify:   347/347 tests pass. `src/__test__/rackOps.test.js`'s
`rack_double_row draw-ops` block — the tests that directly encoded the
OLD filled-rect contract (`ops.find(o => o.op === 'rect' && o.fill ===
RACK_PALETTE.flue)`, checking `.h`/`.y` as rect fields) — updated to
assert the NEW contract instead: the flue is a `path` with `stroke ===
RACK_PALETTE.flue` (never a `fill`-bearing rect of that colour
anywhere in the ops list), its line sits at the exact vertical centre
of the real gap between the two row rects (derived independently from
the bands' own `y`/`h`, not from a shared internal variable), its
`strokeWidth` is bounded within `[hair*1.4, hair*4]` and never exceeds
the real gap height, and — unchanged from before, still passing as-is
— dividers still never cross the gap, bay count and op count stay
correct, and the degenerate-flue fallback to a bare box is untouched.
A new test drives a custom `flueSpaceIn: 12` and confirms the LINE
re-centres on the new (bigger, still-unfilled) gap rather than
checking a fill-rect height, since the line's own width is designed to
stay clamped-thin regardless of how wide the real flue gets (matching
the SVG reference's own behaviour, not a canvas2-specific choice).

Live Playwright run against the real dev server, 240×120/25×30/reach:
close-up (6× zoom) on a BUG-55-widened vertical pair shows a thin
orange line running through the centre of a visibly OPEN (background-
coloured) gap, with the flue-seated column's own square reading
clearly against it — the "floating in a fat bar" look from the BUG
55/56/57 screenshots is gone. Whole-building views at normal zoom for
both orientations show clean thin lines at every double-row band
(horizontal's 5 middle bands, vertical's every row) with no visual
regression — dividers, bay highlights, dimension labels (which already
independently compute `flueH`/`rowH` the same way, untouched by this
change) all still line up correctly. Zero console errors either
orientation.

Lesson:   A geometry bug and a rendering-convention mismatch can
produce the exact same visual symptom ("the column looks wrong
relative to the flue"), and only PIXEL measurement against the correct
reference tells them apart — BUGs 55–57's repeated, independent,
pixel-precise verification that the WIDTH/POSITION/CENTRING numbers
were all correct is what made it possible to recognise, once the user
pointed at the SVG reference specifically, that the remaining gap was
purely "canvas2 draws this differently from the app's own established
visual language" rather than another round of geometry chasing. Second:
porting a screen-constant clamp between two rendering engines needs
the MECHANISM identified, not just the formula copied literally — SVG's
`/zoom` and Konva's `strokeScaleEnabled={false}` are two different ways
of saying "this stays N screen pixels wide," and mixing them (e.g.
literally copying `dHair = 1.2/zoom` into a zoom-agnostic ops function)
would have either required threading zoom through a layer explicitly
designed not to carry it, or silently produced the wrong screen size at
every zoom except 1.

---

## BUG 59 — the double-row flue carried a rendered line and a baked-in +4.8" clearance the dealer never asked for  (2026-09-23)

Symptom:  Two separate product asks, not a bug in the geometry: (1) BUG
58's ported hairline still reads as an unwanted visual marker in the
flue gap — the request was to leave the gap completely bare, no line
at all; (2) `flueInForColumn` (BUG 55) added a fixed +4.8" clearance
on top of a seated column's own width, which nobody had asked for —
the dealer's own flue-spacing property panel already exists for that
choice, so the generator baking in a number of its own was wrong. The
default (unwidened) flue was also bumped 6" → 9" as part of the same
change.

Chased:   Nothing — both changes were explicit, unambiguous product
asks, not a diagnosis. The only real investigation was in verifying
the KNOCK-ON effects: removing the +4.8" clearance means a widened
flue is now sized to EXACTLY the seated column's own width
(`max(flueIn, colSizeIn)`, no added margin), which collapses the
"clamped-to-the-aisle-boundary but still fully contains the column"
middle ground BUG 56 depended on — when `colSizeIn > flueIn`
(widening actually happens), `neededFlueFt` and `colWidthFt` come out
numerically EQUAL, so there is zero slack left to clamp into. Swept
`gridOffsetFt` in 0.01ft steps around the exact boundary for this
depthIn/aisleFt combo and confirmed live: seating flips from "seats,
dead-centred" to "declines, falls through to BUG 57's face-seat
fallback" at a single knife-edge point (19.5ft), with no intermediate
clamped case surviving on either side — this is a real, correct
consequence of removing the clearance, not a regression. The clamp
mechanism itself isn't dead: it still fires normally whenever a column
is genuinely SMALLER than the flue it lands in (verified with a 6"
column against the 9" standard flue), since that case still has real
slack. Also had to re-verify every test/fixture that hardcoded the OLD
6" default or 16.8"/4.8" numbers — several unrelated tests
(`pickOrientation`'s horizontal/vertical capacity totals, a "fills the
middle" row-type assertion, a BUG 53 allowColumnInRack row-count
assertion) broke purely because the wider 9" standard flue shifted how
many rows/pairs fit in the SAME building, not because any decision
logic changed; re-derived each with real code execution rather than
adjusting numbers by guesswork.

Cause:    `src/render/rackOps.js`'s `rackDoubleRowOps` emitted a third
op beyond the two row rects — `{ op: 'path', ..., stroke:
RACK_PALETTE.flue }`, BUG 58's ported hairline — with no way to
suppress it. `src/generate/sizingLayout.js`'s `flueInForColumn()` was
`Math.max(flueIn, colSizeIn + COLUMN_FLUE_CLEARANCE_IN)` with
`COLUMN_FLUE_CLEARANCE_IN = 4.8`; `FLUE_IN` (the standard/unwidened
default) was `6` in both `sizingLayout.js` and `traceGenerate.js`, and
the same `6` fallback (`obj.flueSpaceIn || 6`) was duplicated across
every consumer that reads a rack's own flue field when it's unset:
`DimensionLabels.jsx` (×2), `shapes.jsx`'s bay-highlight positioning,
`RackRowPanelCore.jsx`'s properties-panel default, the two
library-placement paths (`WarehouseObjectPicker.jsx`,
`FloatingToolbar.jsx`), `columnCheck.js`'s flue-vs-face classification,
and `rules/defaults.js`'s `selective.flueIn`.

Fix:      `rackDoubleRowOps` now returns only the two row rects plus
dividers — no third op, no line, no fill; the gap is left completely
bare, background showing through, at whatever its real `flueH` is.
`flueInForColumn` is now `Math.max(flueIn, colSizeIn)` —
`COLUMN_FLUE_CLEARANCE_IN` deleted entirely, its explanatory comment
block removed. Every `6`-default site listed above changed to `9`
(`FLUE_IN` in both generator files; the `|| 6` / `?? 6` fallbacks in
`DimensionLabels.jsx`, `shapes.jsx`, `RackRowPanelCore.jsx`,
`WarehouseObjectPicker.jsx`, `FloatingToolbar.jsx`, `columnCheck.js`;
`rules/defaults.js`'s `selective.flueIn`). The flue-spacing properties
panel (`RackRowPanelCore.jsx`, already existed pre-BUG-59) needed no
new UI — its existing 6"/9"/12" preset buttons already cover the new
9" default and the 12" column-fit value; only its own `|| 6` fallback
needed the same `9` update. `DimensionLabels.jsx`'s flue-dimension TEXT
PILL (a distinct, pre-existing feature — the numeric "9\" flue" label
shown at high zoom, unrelated to BUG 58's removed hairline) was left
alone; the request was specifically to remove the LINE, not the
dimension-label system every other measurement on the drawing also
uses.

Verify:   345/345 tests pass, build clean. `rackOps.test.js`'s
`rack_double_row draw-ops` block inverted from BUG 58's
line-exists assertions to line-does-NOT-exist ones (no `path` or
`rect` anywhere in the ops list carries `RACK_PALETTE.flue`, op count
drops from 4 to 3). `sizingLayout.test.js`'s BUG 55/56/57 blocks
rewritten with real numbers from live code execution: a 12" column
seated in the flue now widens it to exactly 12" (not 16.8"); the
zero-slack knife-edge (19.5ft boundary, described above) has its own
dedicated test; a small-column (6") clamp-still-fits case preserves
coverage of the clamp mechanism itself; the 240×120/25×30/reach
both-orientation integration test now asserts the decision WALK is
unchanged from the pre-BUG-59 known-good run — still 0 widened
pairs/horizontal, still exactly 6 widened pairs/vertical, still 15
flue-seated columns/vertical via `checkColumns` independently, zero
rack conflicts on any widened pair, zero straddles — only the WIDTH
each widened pair widens to changed (12" flush fit, not 16.8" with
clearance). Live Playwright run against the real dev server,
240×120/50×54/reach double-deep: generated 22 double-row objects with
`flueSpaceIn` either `9` (standard) or `12` (widened to the 12"
default column, confirmed via the store directly) — zero console
errors. Zoomed 14 steps into a flue gap between two rack bands:
screenshot shows a plain white gap with no line, no fill, nothing
drawn in it at all. Selected a widened (12") and a standard (9")
object in turn via the store and confirmed the properties panel's Flue
row highlights the correct preset button (12" / 9" respectively) for
each. Confirmed via the SAME live run that the placement algorithm
still runs correctly end to end under the new threshold — no straddle,
every aisle at or above the forklift minimum, both orientations.

Lesson:   A generator constant that bakes in a safety margin (BUG 55's
+4.8") can be structurally invisible until the margin itself is
removed — the OLD rule had enough slack that "ideal position
unreachable, but a nearby clamped one still works" was common; the NEW
rule (zero added clearance) makes that middle ground provably empty
whenever widening actually occurs, because the flue width and the
column width become the same number by construction. When a fix
changes a SHARED default (6" → 9" flue) rather than just a formula,
every fixture-hardcoded downstream number (row counts, orientation
picks, capacity totals) that happened to depend on the OLD default is
fair game to break — re-derive each one with real code execution
against the new default rather than assuming the old numbers still
apply with a small offset, since capacity math is rarely linear in the
constant that changed.

---

## BUG 60 — allowColumnInRack never dropped an interior row; removed the toggle, added blocked-face X marks instead  (2026-09-23)

Symptom:  With "Allow columns inside racks" set to **No**, the horizontal
layout (240×120/25×30/reach) still placed 30 columns inside rack bodies
(bay-columns) — contradicting the panel's own copy: "A too-close column
drops that row instead — aisle opens up, no positions lost."

Chased:   Confirmed `allowColumnInRack` reaches `rowBands` identically for
both orientations (`axisFrame` only swaps which grid pitch feeds the
depth axis) — not a wiring bug. Traced one conflict directly: a column at
Y=60ft overlapping pair `[58.25, 66]`'s full span DID trigger S1's
`seatColumnInFlue(60, afterAisle)`, which correctly declined (the column
sits nowhere near that pair's flue at `[61.75, 62.5]`; no reachable slide
could seat it there without shrinking the aisle). After declining, there
was no further fallback for a column that's just sitting in the *middle*
of a face — the pair was pushed at its default position and the column
stayed exactly where it naturally landed. Confirmed the ONLY actual
"drop the row" implementation anywhere in the file was the far-wall
pinch-loop (BUG 53) — a narrow mechanism for a column threatening AISLE
accessibility near the far wall, unrelated to a column sitting inside a
face mid-building. Vertical's own existing test (`allowColumnInRack:
false → rackConflicts: 0`) only ever passed because THAT geometry's
specific pitch/offset numbers happened to put every interacting column
within reach of a flue (`flueSeated: 15`) — it never actually exercised
the "column stuck in a face" case the horizontal report was hitting. So
the toggle's real, existing effect was never "drop the row" in general —
only (1) whether S1's flue-slide optimisation is attempted at all, and
(2) the far-wall pinch-loop's drop/absorb choice. The GeneratePanel's
copy overpromised for the general interior case.

Given that, the fix requested (and applied) was a simplification, not a
wiring repair: remove the toggle and the branching entirely, always run
the optimisation, always absorb rather than drop, and give the dealer a
visual (an X on the blocked pick face) instead of a preference they'd
have to guess the actual scope of.

Cause:    No wiring defect — `sizingLayout.js`'s STEP 3 gated the S1
flue-slide behind `!allowColumnInRack` (`if (overlap.length &&
!allowColumnInRack)`), and the far-wall pinch-loop (BUG 53) branched
between "shift to absorb" (`allowColumnInRack === true`) and "drop the
row" (`false`) — but a column landing squarely inside a face, never
touching a flue zone at all, was never covered by either branch; it was
always silently accepted as a bay-column in every prior state of the
code, `allowColumnInRack` value notwithstanding. Separately, canvas2 had
no rendering at all for `checkColumns`' own `rackConflicts` — only
`aisleBlocks` (via `ColumnClearanceLabels`) made it from
`useColumnCheck`'s result into `Overlays`; the SVG reference's own
`ColumnCheckOverlay.jsx` (a hatch-fill mark, not an X) was never ported
to canvas2 at all, so a bay-column has been visually invisible on the
canvas since canvas2 shipped.

Fix:      **Toggle removed.** `src/components/Generate/GeneratePanel.jsx`
— deleted the `allowColumnInRack` state, its UI block (the Yes/No
buttons and the two-line explanation), and its key in the
`generateAndPlaceBatched` payload. **Generator simplified.**
`src/generate/sizingLayout.js` — `rowBands` no longer takes an
`allowColumnInRack` parameter; STEP 3's flue-slide attempt
(`seatColumnInFlue`) now always runs unconditionally (previously gated
behind `!allowColumnInRack`) — a column near a flue is now MORE likely
to seat for free than before, in every orientation, unconditionally. The
far-wall pinch-loop (BUG 53) always takes the absorb/shift branch now —
the drop (`bands.pop()`) branch is gone; a pinching column always shifts
the last row forward to clear the aisle rather than being offered a
choice. `sizingSheetLayout` no longer destructures or threads
`allowColumnInRack` through to `rowBands`. **Blocked-face marking
added.** New file `src/canvas2/BlockedFaceMarks.jsx` — canvas2's
analogue of the SVG reference's `ColumnCheckOverlay.jsx` (rack-column
kind only; aisle-blocked marks stay `ColumnClearanceLabels`' own
arrow+label territory, unchanged), drawing a plain X (two diagonal
`Line`s, `stroke: '#C0392B'`, the same conflict-red the SVG reference
reserves for this) across each `rackConflicts[].overlap` box — the exact
column∩rack-face intersection `checkColumns` already computes, the same
box the old engine's hatch-fill mark used. Wired into
`src/canvas2/Overlays.jsx` (new `rackConflicts` prop, gated on the
existing `showMarks` toggle alongside `ColumnClearanceLabels`) and
`src/canvas2/Canvas2.jsx` (passes `columnCheckResult.rackConflicts`
through — the same derived `useColumnCheck` result `aisleBlocks` and
`columns` already came from, no second geometry pass).

Verify:   344/344 tests pass (one net fewer than before — BUG 53's old
two-variant `allowColumnInRack: true/false` test collapsed into one
unified test, since there's only one behaviour now), build clean.
`sizingLayout.test.js`'s BUG 53 describe block rewritten: a single test
now confirms 240×120/25×30/reach vertical keeps all 26 racks with ZERO
blocked aisles AND zero rack conflicts (not because a row dropped —
`flueSeated.length > 0` confirms the pinching column actually resolved
via the now-unconditional flue-slide instead). Every stray
`allowColumnInRack: true/false` prop left over in the BUG 55/56/57/59
flue-sizing tests removed (silently ignored either way once the
parameter is gone — confirmed harmless before removing them by running
the full suite with only the production code changed: exactly one
failure, the BUG 53 toggle-variant test, everything else already green).
Live Playwright run against the real dev server, 240×120/25×30/reach:
confirmed "ALLOW COLUMNS INSIDE RACKS" no longer appears anywhere in the
Generate panel's text. Horizontal orientation + a matching column_grid
object (the generator itself has never placed one — that's a separate,
pre-existing structural object the dealer places; `columnGridObject` was
added directly via the store for this check) — RightPanel's Column
Check reported "38 columns in racks," "If absorbed −152 / If removed
−304," confirming capacity still subtracts blocked positions exactly as
before. Zoomed into one flagged rack: a clean red X renders precisely
across the column∩rack-face overlap box, sitting under the column_grid's
own marker square. Zero console errors throughout.

Lesson:   A toggle whose UI copy makes a blanket promise ("drops that
row instead") but whose implementation only ever covered one narrow
sub-case (aisle-blocking pinches, not general face-embedded columns) is
worse than no toggle at all — it tells the dealer a guarantee holds
everywhere when it only ever held in the one scenario it was built for.
When a customer preference turns out to only have ever done less than
its own description claimed, the fix isn't necessarily to build out the
missing cases (dropping an interior row over ONE bad bay position among
dozens of good ones would cost real capacity for a marginal gain) — here
it was cheaper and more honest to delete the preference entirely, always
take the best-effort optimisation, and make the UNAVOIDABLE remainder
visible instead of pretending a setting controls it.

---

## BUG 61 — BUG 60's blocked-face X drew over the COLUMN, not the pick face it blocks  (2026-09-23)

Symptom:  The X marks BUG 60 added draw exactly over the column's own
footprint (`rackConflicts[].overlap`, the column∩rack-face intersection —
often just a sliver where a column clips a rack edge). The dealer needs
to see which PICK POSITION on the rack is dead, not where the column
physically is — those are two different rectangles, and only the second
one is what actually needs marking.

Chased:   The fix needs the rack's own bay geometry (the full beam-width
× one-face-depth rectangle), not the column's. canvas2 already has this
exact geometry in `shapes.jsx`'s `bayRectForIndex` (LOCAL, pre-rotation
coordinates — the same function the bay-highlight overlays already use),
but it only takes a bay INDEX, and `checkColumns` had never computed
one. Getting from a WORLD-space conflict to a LOCAL bay index/face
needed the rack's rotation accounted for, which — worked through by
hand via the same corner-mapping `rackFootprint`'s own 90° case
documents — turned out to split into two independent questions with two
different answers: (1) the RUN axis (which bay, along the beams) maps
from world to local with NO reversal under rotation — confirmed by
mapping two known local corners through the rotation matrix and finding
world-Y (for a rotated rack) tracks local-X directly, offset for offset;
(2) the DEPTH axis (which face, front or back) DOES reverse under
rotation — local face index 0 (the array's first/near-local entry) maps
to the WORLD-FAR side once rotated, not the world-near side. Verified
both conclusions two ways before trusting them: algebraically (plugging
the derived transform back through corner coordinates) and empirically,
by adding a real rotated rack + a real column to the live store, reading
the ACTUAL rendered Konva `Group`'s transform attrs and its `Line`
points back out via `stage.find`, and running those exact numbers
through the SAME rotation formula by hand — the resulting world
rectangle's X-range started exactly at the rack's near edge for a
near-face conflict and ended exactly at its far edge for a far-face one,
matching where the test column was actually placed in both cases.

Cause:    `BlockedFaceMarks.jsx` (BUG 60) drew its X directly from
`rackConflicts[].overlap` — the same box `redMarks`/the old SVG engine's
hatch-fill mark use, which is deliberately sized to the COLUMN, not the
bay. `checkColumns` had no bay-index or face concept at all; it only
ever needed "how many faces does this cost" (`facesHit`, a count) for
the capacity math, never "which specific bay/face rectangle."

Fix:      `src/generate/columnCheck.js` — imports `bayAtPoint` from
`render/rackOps.js` (both files were already standalone with no
existing imports, so no circular-dependency risk). Right where a
conflict is already being built, now also computes: `bayIndex` — the
column's WORLD run-axis centre converted to the rack's LOCAL frame
(`localRunX = r.x + (colRunPos - runStart)`, uniform for both 0° and
90° racks, no separate branch) and fed to `bayAtPoint`; `faces` — an
array of LOCAL face indices for `bayRectForIndex` to resolve, using the
already-computed `isNearFace` (world-space "which side of the flue")
flipped through `rb.rotated` for a double row (`[0]` for a single row;
`[0,1]` for the legacy no-`depthIn` fallback, matching its existing
conservative "any overlap costs every face" reading). Both fields are
purely additive on the existing `rackConflicts` entries — `overlap`,
`redMarks` and everything else untouched, so the old SVG engine's own
`ColumnCheckOverlay.jsx` and any other consumer of the old shape are
unaffected. `src/canvas2/shapes.jsx` — `bayRectForIndex` exported (was
module-local). `src/canvas2/BlockedFaceMarks.jsx` rewritten: for each
conflict, looks up the rack object by `rackId`, calls
`bayRectForIndex(obj, gridSize, bayIndex)` for the LOCAL rect(s), and
draws the X inside a `<Group {...spin(obj, gridSize)}>` — exactly the
pattern `SelectionOutline`/every other per-object canvas2 overlay
already uses for a rotated rack, so the X needs no rotation math of its
own to get wrong a second time; Konva's own rotation on the Group places
a LOCAL rectangle correctly regardless of orientation. `Overlays.jsx`
passes `objects`/`gridSize` through to the new component alongside the
existing `rackConflicts` prop.

Verify:   344/344 tests pass, build clean. Two temp diagnostic tests
(deleted after) constructed a known conflict for both an UNROTATED
`rack_row` and a ROTATED `rack_double_row` (once for a column on the
near face, once for the far face) and confirmed `bayIndex`/`faces` came
back correct in all three cases — critically, the near/far cases came
back with OPPOSITE local face indices (`[1]` near, `[0]` far) for the
rotated rack, confirming the reversal is real and the code accounts for
it (an unrotated rack showed no such reversal, as expected). Live
Playwright run against the real dev server: added a rotated
`rack_double_row` plus a column via the store directly (bypassing the
Generate panel, for exact control over the conflict's position),
screenshotted, then independently re-derived the drawn X's WORLD
rectangle from the live Konva `Group`'s actual transform attributes
(`x`/`y`/`offsetX`/`offsetY`/`rotation`) and its child `Line` points —
the reconstructed world rectangle's near edge landed exactly on the
rack's own world-near edge for the near-face test, and exactly on the
world-far edge for the far-face test, both independent of and matching
the hand-derived transform math above. A separate unrotated
`rack_row` run showed the X spanning exactly one bay's beam width and
the rack's full depth (a single row has one face, the whole thing) —
matching `bayRectForIndex`'s own formula for that case, and visibly
NOT the column's own ~1ft-square footprint. Zero console errors
throughout.

Lesson:   "Draw a mark at the conflict" has two different correct boxes
depending on what the mark is FOR — the column's own footprint (what
collided) and the bay's own footprint (what's now unusable) — and
`checkColumns` only ever needed to compute the first one before this,
because its job was capacity math (a count), not geometry a renderer
could point at. When a NEW consumer needs a different rectangle for the
same event, it's worth checking whether the existing pure function
already has every INPUT needed to derive it exactly once, in one place,
rather than having the renderer reverse-engineer it from what's already
been reduced down to a count and a column-sized box.

---

## BUG 62 — pallet-position counting used the wrong dimension for the beam divisor, no clearance, and gated frame depth on it  (2026-09-23)

Symptom:  Capacity and blocked-position math treated `palletWIn` (the
field the whole codebase actually divides beam length by) as if it
defaulted to the pallet's DEPTH (48") rather than its loading FACE
(40") — backwards from the verified industry-standard selective-rack
convention, where the face (narrower dimension) runs ACROSS the beam
and is what determines positions per bay, while depth runs into the
frame and is expected to overhang it (~3" each side on a 42" frame is
standard, not a fit problem). The counting formula itself also had no
clearance term — `Math.floor(beamIn / palletWIn)`, a bare divide — so
there was no real model of the 4"+4" gap between adjacent pallets on
the same beam, and `layoutSpec`'s frame-depth selection picked "the
shallowest frame depth >= the pallet's depth," which — once corrected
to the real 40/48 convention — would have started speccing a 48"
selective frame under every default pallet instead of the standard 42"
one, an even bigger behavioural error than the one being fixed.

Chased:   The numeric coincidence that made this invisible: the OLD
default (`palletWIn` = 48", no clearance) and the NEW correct formula
(`palletFaceIn` = 40" + 8" clearance = 48) produce the IDENTICAL
divisor for anyone using the shipped defaults — `floor(beam/48)` either
way. Confirmed this holds for every beam length via direct computation
before touching anything (96/48=2, 144/48=3, matching the brief's own
worked examples exactly), which is why swapping the defaults and adding
the clearance term changes NOTHING for existing generated layouts using
default settings, only for a dealer who actually changes the pallet
FACE width (previously that number was silently being used as a raw,
clearance-free divisor no matter which field — W or D — a dealer typed
it into). Also traced the frame-depth side effect specifically: with
`palletD` corrected to 48 but `layoutSpec`'s old `find(d => d >= palletD)`
search left untouched, the default frame depth would have jumped from
42" to 48" (`frameDepthsIn: [36,42,48]`, shallowest >= 48 is 48) —
confirmed this is real by computing `layoutSpec({}, DEFAULT_RULES)`
before and after the pure default-swap in isolation, then fixed the
selection logic itself (no longer palletD-gated) rather than trying to
find a different default that happened to still land on 42.

Cause:    `DEFAULT_RULES.pallet` (`rules/defaults.js`), `layoutSpec`
(`sizingLayout.js`), `beamRackObject` (`traceGenerate.js`), the
beam-rack drop-time defaults in `WarehouseObjectPicker.jsx`/
`FloatingToolbar.jsx`, and `RackRowPanelCore.jsx`'s pallet-size panel
all independently hardcoded `palletWIn: 48, palletDIn: 40` (backwards)
— five separate sites, none of them wrong relative to EACH OTHER, all
wrong relative to the real convention. `getRackCapacity` (`capacity.js`)
and the rack-conflict cost estimate (`columnCheck.js`) each independently
implemented `Math.floor(beam / palletWIn)` with no clearance term — a
second duplication (on top of BUG 61's own note about the bay-vs-column
box duplication) of the same missing model. `columnCheck.js`'s
`positionsLost` was a coarse `Math.max(1, Math.ceil(col.w / palletWPx))`
— the COLUMN's own width divided by a raw pallet width, not "which
actual position slot(s), given real GMA spacing, does this column's
real position touch" — so it could both under- and over-charge relative
to the real slot boundaries, and always charged at least 1 even when a
column sat entirely in the dead slack past the last real position.

Fix:      **New shared formula**, `src/utils/capacity.js`:
`PALLET_CLEARANCE_IN = 8`; `positionsPerBeam(beamIn, palletFaceIn) =
Math.floor(beamIn / (palletFaceIn + 8))`; `positionFootprintIn` and
`blockedPositionIndices` for the SAME slot geometry, precise enough for
a renderer or a conflict cost to use directly rather than re-deriving a
cruder estimate. `getRackCapacity`'s two beam-rack branches call
`positionsPerBeam` instead of the old bare divide. **Defaults swapped**
(40 face / 48 depth) at every site listed above: `rules/defaults.js`'s
top-level `pallet`, `sizingLayout.js`'s `layoutSpec`, `traceGenerate.js`'s
`beamRackObject` (+ the dead-but-tested `stubGenerateLayout` literal),
`WarehouseObjectPicker.jsx`/`FloatingToolbar.jsx`'s beam-rack drop
defaults, `RackRowPanelCore.jsx`'s panel (also relabelled "W"/"D" to
"Face"/"Depth", reordered the preset buttons so `40x48` leads). Lane
racks (`rack_drive_in`/`_through`/`_pushback`/`_pallet_flow`) already
used `40/48` everywhere and are untouched — their capacity model
(`lanes × palletDeep`) never divided by `palletWIn` in the first place.
**Frame-depth selection decoupled from pallet depth**: `layoutSpec`'s
`fitDepth` no longer searches for "the shallowest frame >= the pallet's
own depth" (the premise a 48"-pallet-on-a-42"-frame overhang disproves)
— it now just defaults to the standard 42" frame depth whenever the
rules table offers one, independent of whatever `palletDIn` is.
**Position-precise conflict cost**, `columnCheck.js`: replaced the
ceil-estimate with `blockedPositionIndices` run against the column's
real LOCAL run-axis footprint on its OWN bay's own beam (also fixed a
latent bug in `sectionsLost`, which always read `beams[0]` regardless
of which bay was actually hit — now uses `beams[bayIndex]`, the
`bayIndex` BUG 61 already computes). Each conflict now also carries
`positionIndices` — the exact blocked slot(s), not just which bay/face.
**Blocked-position marks narrowed to match**: `shapes.jsx`'s new
`positionRectForIndex` slices ONE slot's rect out of `bayRectForIndex`'s
own face rect (same GMA slot width the counting formula uses);
`BlockedFaceMarks.jsx` now draws one X per `(face, positionIndex)` pair
instead of one X spanning the entire bay.

Verify:   354/354 tests pass (10 new, `src/__test__/capacity.test.js`),
build clean. New tests assert the brief's own worked examples exactly:
`positionsPerBeam(96,40)===2`, `(144,40)===3`, and every named beam
length (9'/10'=2, 12'=3, 13'/14'=3); a non-default 44" face genuinely
changes the count (96"/44" = 1, not 2 — proving the clearance is real
arithmetic, not a disguised fixed constant); `blockedPositionIndices`
resolves a clean single-slot hit, a boundary straddle (both slots), an
edge clip, and — the old code's forced-minimum-1 case — a footprint
entirely in dead slack correctly costing zero; `layoutSpec({},
DEFAULT_RULES)` asserts `palletWIn:40, palletDIn:48, depthIn:42` all at
once, the exact regression the frame-depth side effect would have
broken. `getRackCapacity`/`getLayoutCapacity` re-verified additive and
self-consistent under the new formula. One pre-existing test
(`rules.test.js`) had the old backwards `{wIn:48,dIn:40}` baked into an
inheritance-cascade assertion — updated to the corrected values; every
OTHER existing test (including `pickOrientation`'s exact `2376`/`2496`
capacity totals) passed unchanged, confirming the shipped-default
divisor really is numerically identical before and after. Live
Playwright run against the real dev server: selected a 3-bay/96"-beam
`rack_row` with no pallet fields set — RightPanel showed `Capacity: 12
PAL` (`floor(96/48)=2` per bay × 3 bays × 2 levels), the `40x48` preset
highlighted as active, `Face`/`Depth` labelled and reading `40`/`48`
with no layout overflow. Placed a column centred exactly on position
index 1 of bay 1 (a hand-computed slot boundary, not eyeballed) and
read the ACTUAL rendered Konva `Line` points back out of the live
stage: the drawn X's local rect was exactly `[1000,1160]×[300,440]` —
160 world-px wide, which is exactly 48" at this grid scale, starting
exactly at that bay's own beam-start-plus-one-slot-offset — matching
the hand-computed slot boundary to the pixel, not just "close." A
whole-building screenshot at 3x zoom shows the X spanning visibly less
than half the bay's width (one slot out of two), with the column
marker's own square sitting separately above it, untouched by the
mark. Zero console errors throughout.

Lesson:   Two defaults that are individually self-consistent (every
site in the codebase agreed on `48 face / 40 depth`) can still both be
wrong relative to an external, verifiable standard — internal
consistency isn't the same evidence as correctness, and this one hid
for as long as it did specifically because the WRONG default (48, no
clearance) happened to numerically equal the RIGHT default run through
the RIGHT formula (40+8) for every beam length actually in use. When
fixing a value that several independent call sites all hardcode
identically, checking that they at least AGREE with each other is not
enough — the agreement is exactly what let a shared mistake go
unnoticed. And a fix to one input (pallet depth) can silently break an
unrelated OUTPUT three functions downstream (frame-depth selection)
that happened to be reading the same field for a different reason —
worth deriving the actual data-flow graph, not just grepping for the
field name, before declaring a default-value fix "just a number
change."

---

## BUG 64 — feature: Generate panel restructured into Building/Racking, wall clearance and perimeter wall columns added, rack type/speed bay/dock doors removed from it  (2026-09-23)

Symptom:  Not a bug — a requested restructure. The Generate panel mixed
building-shape inputs (length/width/column grid) with racking-choice
inputs (rack type/forklift/aisle) with two fields that don't belong at
generation time at all (speed bay, dock doors — both already excluded
from `generateFixtures`, BUG 44, so they'd never draw anyway) in one
flat list, with no wall-clearance concept and no way to say a building's
exterior wall carries its own embedded columns.

Chased:   `generateFixtures` already places a real `column_grid` object
on every generate (confirmed by reading it directly — the interior grid
has existed since before this session; an earlier turn's live check
just hadn't verified its presence explicitly for the geometry it used).
That meant "wall columns" didn't need new store-side machinery, only a
second `column_grid`-shaped fixture and a brief flag — `checkColumns`
already treats every `column_grid` object in the scene identically
(BUG 60–62's whole bay/face/position pipeline), so a wall column costs
a rack conflict exactly like an interior one with zero new avoidance
code. Wall clearance was trickier: `rowSegments` already had an
`endClearFt` concept for the RUN axis (`sel.wallClearanceIn`, 3"
default) but `rowBands`'s DEPTH axis had never had one at all — STEP 1
locked the near-wall row at `yFt: 0`, flush, unconditionally. Adding a
`wallClearFt` param to `rowBands` and threading the SAME resolved value
into both is what "one wall-clearance number, both axes" required.
Changing the shipped default 3"->6" (matching the requested default)
then rippled into every test that goes through `sizingSheetLayout`
(not the ones calling `rowBands`/`rowSegments` directly, which default
`wallClearFt=0` and were unaffected) — traced each failure individually
rather than assuming they were all the same root cause: one was a test
computing its OWN reference `bands` via a direct `rowBands` call that
needed the same resolved clearance threaded in for an apples-to-apples
comparison; one was a column landing exactly in a cross-aisle gap
instead of a rack segment once the run-axis usable length shifted by
the extra clearance (gridXFt swapped 20->15 to dodge the coincidence,
re-verified live rather than picked by guesswork); one was the
240×120/25×30/reach reference fixture's flue-seated total (still
correctly non-zero, just 9 instead of 15 — the SAME 6 widened pairs,
SAME zero-conflict invariant, confirmed via direct execution before
touching the assertion).

Cause:    N/A (feature work) — see Fix.

Fix:      **Generator.** `src/generate/sizingLayout.js` — `rowBands`
gained a `wallClearFt = 0` param (default preserves old flush-to-the-
wall behaviour for any direct caller): the near-wall row now starts at
`yFt: wallClearFt` instead of `0`, and `bottomY` (the far-wall row's own
position) subtracts it too, symmetric on both walls. `sizingSheetLayout`
passes `wallClearFt: endClearFt` into that call — the SAME resolved
value `rowSegments` already gets. `layoutSpec`'s `endClearFt` resolution
gained a `brief.wallClearanceIn` (inches) tier, ahead of the rules-table
`sel.wallClearanceIn`: `DEFAULT_RULES.selective.wallClearanceIn` moved
3->6. `layoutSpec`'s own frame-depth selection was already decoupled
from pallet depth (BUG 62) so this default change had no knock-on
effect there. New `wallColumnGridObjects(brief, ox, oy)` — returns `[]`
unless `brief.columnsAlongWall`, else 4 `column_grid` objects (one per
wall, `wallAttached: true`), each a single row/column at the interior
grid's own `gridXFt`/`gridYFt` pitch and the SAME X-centred convention
`columnGridObject` already uses (exploiting `expandColumnGrid`'s own
N-entries-give-N+1-lines rule: an EMPTY `spacingX`/`spacingY` array
yields exactly one line on that axis). Wired into `generateFixtures`
alongside the existing interior grid — unconditional, always returns
`[]` when the flag is off, so `generateFixtures` always includes the
interior grid and only sometimes the four wall ones. **Panel.**
`src/components/Generate/GeneratePanel.jsx` fully restructured: a
`Section` component groups BUILDING (length/width, column grid, new
WALL CLEARANCE (in) input defaulting to 6, new COLUMNS ALONG WALL
Yes/No toggle, row direction) and RACKING (new pallet Face/Depth inputs
defaulting to 40/48 — BUG 62's own GMA convention — forklift, aisle).
`rackType` state deleted entirely; the payload always sends the
module-level constant `RACK_TYPE = 'rack_double_row'` (rowBands' own
STEP 1/STEP 3 shape — single rows at the walls, double-deep pairs
interior — unchanged, just no longer a dealer choice in this panel).
Speed bay and dock door state/inputs removed from the panel and the
payload; `dockDoorObjects`/`stagingObjects` themselves are untouched,
still exported, still not wired into `generateFixtures` (BUG 44) — this
panel simply stops offering fields for functionality it was never
actually connected to.

Verify:   361/361 tests pass (7 new — wallClearFt symmetry and its
opt-in default, `sizingSheetLayout`'s end-to-end `wallClearanceIn`
threading against both a custom value and the shipped 6" default,
`wallColumnGridObjects`'s off/on shape and on-the-wall-line geometry,
`generateFixtures`'s 1-vs-5 grid count), build clean. Live Playwright
run against the real dev server: panel text confirmed BUILDING/RACKING
headers present, "RACK TYPE"/"SPEED BAY"/"DOCK DOORS" absent, "WALL
CLEARANCE"/"COLUMNS ALONG WALL"/"PALLET SIZE" present — zero console
errors. Generated a horizontal layout with defaults untouched and read
the near-wall row's world Y back out of the live store against the
floor plan's own origin: exactly 6" (not flush) — the panel's shipped
default reaching the actual rendered geometry, not just the brief.
Toggled COLUMNS ALONG WALL to Yes, generated again: exactly 5
`column_grid` objects in the store (1 interior + 4 `wallAttached: true`
wall grids, matching the four walls' own geometry printed and checked
against the building's real dimensions), and a zoomed screenshot shows
small purple column markers sitting directly on the wall line itself,
not floating in the interior. Zero console errors throughout every run.

Lesson:   A default-value change to a field several OTHER functions
already read (`sel.wallClearanceIn`, previously only consumed by the
run axis) doesn't stay contained to the one axis it was introduced
for — anything reachable through the SAME rules-resolution path picks
up the new value automatically, for better (that was the point here)
and for worse (every test built on the old default's exact numbers is
now fair game to re-verify, not just the ones that look related to
"wall clearance" by name). Threading a new geometry input through an
EXISTING resolution pipeline (`layoutSpec`'s `endClearFt`) rather than
inventing a parallel one is what made both axes pick up the change
uniformly with one line of wiring each — the alternative (a separate
depth-axis clearance concept) would have been two configs to keep in
sync instead of one.

---

## BUG 65 — Generate never cleared the previous layout: every click stacked a full duplicate building on top of the last one  (2026-09-23)

Symptom:  Toggling "Columns along wall" and clicking Generate again
appeared to do nothing. Root cause (found by a read-only investigation
subagent, confirmed live): `buildQueue` (`traceGenerate.js`) calls
`store.placeFpObject(...)` unconditionally on every Generate click, and
`placeFpObject` only ever pushes a NEW `fp_rect` — nothing anywhere in
`placeFpObject`/`addObject` removes what a PRIOR click placed. Since the
floor plan's own world position is computed purely from
`lengthFt`/`widthFt` (`Math.round(-W/2/GS)*GS`, `useCanvasStore.js`),
an unchanged building size regenerates at the EXACT SAME coordinates
every time — so the second click's building, racks, and interior
column grid painted precisely on top of the first click's, pixel for
pixel indistinguishable. The one thing that genuinely differed (the 4
new wall-column grids) was real but separately too small to notice at
overview zoom (BUG 66).

Chased:   Confirmed live before touching anything: generate once (56
objects, 1 floor plan, 28 racks, 1 column grid) → toggle → generate
again (116 objects, 2 floor plans at IDENTICAL `(x,y)`, 56 racks, 6
grids) — an exact duplicate stacked on the first, not a replacement.
Ruled out z-order/layer/render-guard causes for the wall columns
specifically (all confirmed working correctly by the same
investigation) — this entry is about the duplication only.

Cause:    No dedup/clear step anywhere between two `buildQueue` calls;
`placeFpObject` and `addObject` are both pure "push a new object," by
design (they're shared with hand-placing a floor plan/object from the
library, where duplication-on-repeat is obviously not wanted either).

Fix:      `src/store/useCanvasStore.js` — new `lastGeneratedFpId`
state (`null` by default) plus `setLastGeneratedFpId(id)` and
`clearGeneratedLayout()`, the latter removing that specific floor plan
and every object whose `parentId` matches it (the same cascade
`deleteSelected` already uses for a manually-deleted floor plan's
children), then resetting `lastGeneratedFpId` to `null`. Deliberately
NOT wired into `placeFpObject` itself — only `traceGenerate.js`'s
`buildQueue` ever calls `setLastGeneratedFpId`, right after it
identifies the building it just placed, so a hand-drawn floor plan
(from `FloorPlanPicker`/`FloatingToolbar`/`FloorPlanPanel`, all of
which also call `placeFpObject`) is never at risk of being silently
deleted by a later Generate click. `buildQueue` calls
`store.clearGeneratedLayout()` as its very first step, before placing
anything new. A stale id (the tracked floor plan was hand-deleted
since) is a harmless no-op — `clearGeneratedLayout` checks the objects
actually still exist before touching `s.objects`.

Verify:   367/367 tests pass, build clean. Live Playwright run:
generate once (56 objects) → regenerate with unchanged inputs → still
exactly 56 objects, 1 floor plan, 28 racks, 1 column grid — not 116/2/
56/2. `lastGeneratedFpId` changed between the two generations (a real
replacement, not a no-op). The panel's own capacity readout stayed a
single consistent number instead of doubling. Zero console errors.

Lesson:   "Regenerate" silently means "replace" to a user long before
it's ever implemented that way in code — a generator that only ever
knows how to ADD needs an explicit "remove what I added last time"
step from day one, or the bug hides for exactly as long as nobody
regenerates without changing the inputs (which is the single most
common way to actually use a "Generate" button — try a toggle, see
the result, try another).

---

## BUG 66 — small structural markers (columns, blocked-position X's) render at their true world size, so they vanish at whole-building overview zoom  (2026-09-23)

Symptom:  Column markers and blocked-position X's are geometrically
correct but imperceptible at the zoom `placeFpObject`'s own auto-fit
sets for a whole building (roughly 5–10%, confirmed live: 0.0958 for a
240ft building) — a 12"-default column square or a pallet-slot X is a
fixed WORLD size, so it shrinks proportionally with everything else,
down to a handful of screen px at overview zoom. Reported specifically
via "toggling Columns along wall shows no visible change" (BUG 65's
own duplication bug hid most of the symptom; the wall columns
themselves were real, just too small to read once the duplication was
fixed too).

Chased:   Confirmed this is a rendering-scale problem, not a
placement/z-order/layer bug — a read-only investigation had already
ruled those out (no guard skips an empty `spacingX`/`spacingY`, no
`wallAttached` check anywhere, wall grids paint last/on top). Found
the actual established fix for exactly this ALREADY in the codebase:
`ResizeHandlesOverlay`'s own `hs = 6/zoom` (`handleGeometry.js`) —
"world-space width/height/radius computed as screenPx / zoom for
constant-screen-SIZE shapes... CanvasUI divides by zoom for the exact
same reason, and this is the same trick, not a different one." This
is a port of that SAME established pattern to a different shape kind
(a filled rect/square instead of a stroke), not a new technique.

Cause:    `ColumnGridShape` (`shapes.jsx`) bakes `expandColumnGrid`'s
raw world-px rects straight into one SVG-path string with no zoom
input at all — the square's SIZE (not just its stroke) scales with
the Layer's own zoom transform like any other shape. `BlockedFaceMarks`
already received `zoom` (for its stroke width) but never applied it to
the mark's own rect dimensions either.

Fix:      New `growToMinScreenSize(rect, zoom, minPx)` in `shapes.jsx`
— grows a rect's width/height to `minPx/zoom` world-size when it would
otherwise render smaller than `minPx` screen px, CENTRED on the rect's
own true centre (never from a corner, so a marker that grows to stay
visible never drifts off the position it's actually marking); a
no-op for anything already bigger than the floor. `MIN_COLUMN_MARKER_PX
= 6` / `MIN_MARK_PX = 6`, matching `hs = 6/zoom` (a 12px handle square)
exactly rather than inventing a new size. Applied in `ColumnGridShape`
(needs `zoom` newly threaded in — `Scene.jsx` now reads
`s.zoom` and passes it down; the `scene` routing memo itself stays
zoom-agnostic exactly as its own comment already promised, only
`ColumnGridShape`'s OWN internal memo now depends on zoom) and in
`BlockedFaceMarks` (already had `zoom`, just wasn't using it for the
rect).

Verify:   367/367 tests pass (rendering isn't unit-tested in this
suite — verified live), build clean. Live Playwright run at the real
0.0958 overview zoom: independently recomputed a specific interior
column's expected screen position from the live store's own `zoom`/
`panX`/`panY`, decoded the actual screenshot PNG, and found
struct-blue pixels exactly there (confirmed again for a wall column at
its own independently-computed position); a tight pixel crop around
the same spot shows a small but clearly legible square, not a
sub-pixel smear. Toggling "Columns along wall" and regenerating (now
that BUG 65 makes a regenerate a real replacement) shows new markers
along all four walls that weren't there before — the "clear
difference" the report asked to confirm. Zero console errors.

Lesson:   A geometry-correctness fix and a legibility fix are
different problems that can look identical from a bug report ("nothing
changed") — BUG 65's duplication bug and this file's own scale problem
were BOTH present and BOTH needed fixing before the toggle's effect
became visible; fixing only one would have left the report open. When
this codebase has already solved "stay visible at any zoom" once
(resize handles), a new marker needing the same property should reuse
the mechanism, not re-derive a screen-constant-size formula from
scratch.

---

## BUG 67 — a pallet face too wide for a beam left the bay looking normal and holding nothing, with no mark at all  (2026-09-23)

Symptom:  When `positionsPerBeam(beamIn, palletFaceIn) === 0` (a 90"
face needs 90+8=98" of beam — wider than a 96" beam has), the bay
already correctly contributed 0 to capacity (BUG 62's own formula) but
had NO visual indicator of any kind — `render/rackOps.js`'s bay
geometry never reads `palletWIn` at all, so an unusable bay draws
identically to a normal one. `BlockedFaceMarks` (BUG 61/62) only draws
when a COLUMN triggers a conflict; an oversized bay with zero columns
anywhere near it — the exact case reported — produced no mark
whatsoever, silently correct and silently invisible at the same time.

Chased:   Confirmed via `checkColumns` directly (prior turn's
investigation) that even WITH a column overlapping such a bay, the
conflict entry came back `positionsLost: 0, positionIndices: []` — so
`BlockedFaceMarks` had nothing to draw even in the column-present
case. This confirmed the marking gap is structural (the bay's own
geometry vs. the pallet face), not a per-column computation this
session's existing `BlockedFaceMarks` could be extended to cover — it
needed its own, column-independent pass over every rack's own bays.

Cause:    No code anywhere checked "does this bay hold at least one
position" independent of a column conflict — `positionsPerBeam`
returning 0 was only ever consumed by the CAPACITY total (correctly)
and by `blockedPositionIndices` (correctly returning nothing to mark,
since there's no column involved in the general case).

Fix:      `src/utils/capacity.js` — new `oversizedBayIndices(beams,
palletFaceIn)`, a pure pass over a rack's own `beams` array flagging
every index where `positionsPerBeam === 0` — independent of columns
entirely, the SAME formula `getRackCapacity` already uses to (already
correctly) contribute 0 for that bay. New
`src/canvas2/OversizedBayMarks.jsx` — for every `rack_row`/
`rack_double_row` object in the scene (not gated on any conflict
list), flags its oversized bays and draws a full-bay X (BOTH faces of
a double row — the two faces share the same beam and the same face
width, so either both fit or neither does) via `bayRectForIndex`, the
SAME whole-bay rect BUG 61 already established, not the narrower
per-position rect BUG 62 introduced for a column-triggered mark — this
mark means "the whole bay is unusable," not "this one slot is." Also
applies BUG 66's `growToMinScreenSize` floor, for consistency at
overview zoom. Wired into `Overlays.jsx` alongside `BlockedFaceMarks`,
gated on the same `showMarks` toggle.

Verify:   367/367 tests pass (6 new — the reported 90"/96" threshold
exactly, confirming the REAL cutoff is 88" not a round "~90", mixed-
beam racks flagging only the oversized bays, a fully-oversized rack
flagging every bay, and the capacity total already correctly excluding
those bays), build clean. Live Playwright run: placed a 3-bay,
96"-beam `rack_row` at `palletWIn: 90` with NO columns anywhere near
it — RightPanel showed "Capacity: 0 PAL, Ground level: 0 pal × 2
levels" (already correct, BUG 62), and the canvas showed a clean X
spanning the FULL width of every visible bay (confirmed via a zoomed
screenshot — the X's diagonals run corner-to-corner of the whole bay
rect, not a narrow slot within it). Zero console errors.

Lesson:   "This already computes the right NUMBER" (capacity) and
"this already draws the right MARK" (BlockedFaceMarks) are two
separate claims, and BUG 62 only verified the first — the pure
capacity math was correct from the start, but the only rendering path
that existed was conflict-driven, so a geometrically-obvious problem
(a pallet that physically can't fit) had no visual representation
until a column happened to wander into the same bay. A capacity number
alone doesn't tell a dealer WHERE the problem is or WHY — the mark is
what turns "the total is lower than I expected" into "oh, THIS bay is
too narrow for this pallet."

---

## BUG 68 — BUG 65's own fix didn't survive a page reload: the tracking field was ephemeral, the objects it tracked were not  (2026-09-23)

Symptom:  "Columns along wall" added wall columns on Yes but did not
remove them on No — toggle to No, regenerate, the wall columns from
the earlier Yes generation were still there. Static reading of the
BUG 65 code (`clearGeneratedLayout`, `wallColumnGridObjects`,
`parentGenerated`) found nothing wrong — every piece looked correct in
isolation, and a same-session live repro (generate Yes → toggle No →
regenerate, no reload in between) genuinely could NOT reproduce it:
wall columns went 0 → 4 → 0 exactly as designed, in one continuous
browser session, twice, including a 3-step No→Yes→No sequence.

Chased:   The gap between "looks correct" and "user's report is real"
turned out to be exactly that gap — a scenario my own repros never
exercised. `lastGeneratedFpId` (BUG 65's tracking field) was declared
as ordinary Zustand state, sitting right next to `objects`/
`selectedIds` — but `serializeScene` (`utils/saveLoad.js`) only ever
serializes a fixed, explicit list of fields (`objects`, `groups`,
`layers`, `activeLayerId`, `zoom`, `panX`, `panY`, `unit`, ...) and
`lastGeneratedFpId` was never added to it. `App.jsx`'s own
`useEffect(() => { if (hasAutoSave()) restoreAutoSave() }, [])` runs
exactly once, on the App's own mount — i.e. on every full page
load/reload. So a reload restores `s.objects` (every previously
generated rack, grid, and wall column) from localStorage perfectly,
while `lastGeneratedFpId` silently resets to its initial `null` —
the ONE piece of state `clearGeneratedLayout` needed to find what to
remove. The next Generate click's `clearGeneratedLayout()` then found
`fpId === null`, no-opped immediately, and both symptoms fired at
once: the wall columns from the stale layout survived (this report),
and BUG 65's own duplication would have silently returned too (not
independently reported, but the same missing link). Confirmed live,
end to end: generate with Yes (4 wall grids, fp `generated: true`
confirmed in the store) → `page.reload()` → log back in, reopen the
project → objects AND the `generated: true` flag both came back intact
via autosave (proving the flag itself round-trips fine once it lives
on an object) → toggle No → regenerate → 0 wall grids, exactly one
floor plan. Before the fix, the exact same sequence would have left
the stale layout in place with a fresh one stacked on top of it,
reproducing both this report and BUG 65's original symptom together.

Cause:    State that MUST stay in sync with `s.objects` was tracked in
a SEPARATE field with a different persistence lifetime than the
objects it pointed at — `lastGeneratedFpId` was session-only,
`s.objects` was durable (autosaved). Any event that reloads one
without the other (a page refresh being the most ordinary one there
is) desyncs them, and `clearGeneratedLayout`'s `if (!fpId) return`
guard turned that desync into a silent, permanent no-op rather than a
visible failure.

Fix:      `src/store/useCanvasStore.js` — deleted `lastGeneratedFpId`/
`setLastGeneratedFpId` entirely. New `markGenerated(fpId)` sets
`generated: true` directly ON the floor-plan object in `s.objects` —
not a separate field, just another property on an object that was
always going to be serialized/restored as a whole. `clearGeneratedLayout`
no longer reads a tracked id; it structurally finds `s.objects.filter(o
=> o.type === 'fp_rect' && o.generated)` (plural and self-healing: an
autosave written before this fix, or any other way more than one could
exist, gets cleaned up on the very next Generate rather than needing a
migration). `src/generate/traceGenerate.js`'s `buildQueue` calls
`markGenerated(fp.id)` where it used to call `setLastGeneratedFpId`.
`markGenerated` is still never called by `placeFpObject` itself, for
the exact reason BUG 65 established: that action is shared with
hand-placing a floor plan from the library, and flagging every
hand-placed building would make Generate eligible to delete a
customer's own drawing.

Verify:   367/367 tests pass, build clean (no test changes needed —
this bug lived entirely in cross-reload persistence, not in anything
the existing unit suite exercises). Live Playwright run reproducing
the EXACT real-world gap: generate with Columns Along Wall = Yes (4
wall grids, `generated: true` confirmed on the floor plan) →
`page.reload()` → sign in again → reopen the project → confirmed via
the live store that both `s.objects` (5 column grids) AND the
`generated: true` flag survived the reload identically → toggled to No
→ regenerated → exactly 1 floor plan, 1 column grid (interior only), 0
wall grids. Zero console errors throughout, including through the
reload itself.

Lesson:   When one piece of state exists ONLY to answer "which of
these persisted objects did I put here," it has to live inside the
same persistence boundary as the objects themselves, or a reload will
silently split them apart — the tracked reference resets to its
initial value while the objects it was meant to reference keep going.
This is also why the bug survived a same-session repro: testing
"toggle and regenerate" without ever closing/reloading the tab
exercises the SAME in-memory session the whole time, which is exactly
the one case where an ephemeral tracking field can't yet have gone
stale. A repro that never once reproduces the SAME kind of gap a real
user's tab lifetime naturally has (a session boundary, here) isn't a
repro of the bug, only of a neighboring case that happens to share a
description.

---

## BUG 69 — "Columns along wall" = No still left a column on the wall — the toggle was modelled wrong from the start  (2026-09-23)
Symptom:  With the toggle set to No, on a fresh layout (hard refresh +
cleared canvas + regenerate), a column line was still visible sitting
exactly on the top wall.

Chased:   BUG 68's own instrumentation ([WALLCOLS] logging + a
`window.__debugWallColumns()` console helper, both added at the
user's explicit request after live testing kept contradicting my own
Playwright repros) traced this all the way down before any code
changed. The user's own console output proved, in order: (1) the
toggle's `false` value reaches `wallColumnGridObjects` correctly: (2)
that function correctly returns `[]` when it does; (3) the generated
queue has 0 wall-attached `column_grid` objects; (4)
`clearGeneratedLayout` correctly finds 0 generated floor plans to
clear on a fresh canvas (nothing to clear yet). Every hypothesis about
the toggle's OWN wiring or its clearing path was proven wrong by the
evidence — the mechanism BUG 64 built worked exactly as built.
`window.__debugWallColumns()` then showed the real culprit: exactly
ONE `column_grid` object existed in the whole store, `wallAttached:
false` (the ordinary interior grid, not a wall grid), with `y` exactly
equal to the floor plan's own `y` — the top wall line.

Cause:    `columnGridObject` (the ordinary interior support grid,
unrelated to the wall-columns feature) draws its Y axis flush from the
building's own origin unconditionally — `offY = 0`, always, regardless
of any toggle — because `rowBands`' own column-avoidance walk needs to
agree with wherever this grid actually draws line k=0
(COLUMN_GENERATOR_SPEC_V5.md's convention, predating BUG 64 entirely).
BUG 64 modelled "no columns on the wall" as a SEPARATE mechanism
(`wallColumnGridObjects`, four extra `column_grid` objects, one per
wall) bolted on top of this always-flush grid, gated on the toggle.
That mechanism worked exactly as built — but the interior grid's own
Y=0 line was NEVER something it controlled, so turning it off changed
nothing about the one column actually sitting on the wall. Right
mechanism, wrong target.

Fix:      Removed `wallColumnGridObjects` entirely — the whole
separate-mechanism approach was wrong, not just its wiring. The
toggle now controls the interior grid's own origin directly:
`columnGridObject` (`src/generate/sizingLayout.js`) takes
`columnsAlongWall` (default `true`, so any caller that predates the
toggle keeps the old flush behaviour unless it opts out) — Yes keeps
`offY = 0` (a line on the wall, the original behaviour); No sets
`offY = gridYFt` (one full pitch in) and drops the line that inset
would otherwise leave outside the building (`ny = nyFlush - 1`), so no
line ever lands on the wall. `generateFixtures` now returns just this
one grid, always — the four-wall-grids code path no longer exists.

CRITICAL — the drawn grid is only half the fix. `rowBands`' own
column-avoidance walk (`nextColumnNearEdge`/`columnsOverlapping`) has
to agree with the SAME origin shift, or racks would dodge columns at
the OLD (now-wrong) positions while the grid draws them at the NEW
ones. `axisFrame` now takes `columnsAlongWall` too and computes a
`wallOffsetFt` (`columnsAlongWall ? 0 : gridYFt`) that replaces the
hardcoded `0` in whichever of `stackGridOffsetFt`/`runGridOffsetFt`
was previously always flush. Which one that is flips with
orientation — for horizontal, gridYFt is the STACK axis (feeds
`rowBands` directly); for vertical, gridYFt is the RUN axis instead
(feeds `rowSegments`' cross-aisle steering via `runGridOffsetFt`) —
but it's always gridYFt's own axis either way, matching
`columnGridObject`'s own fixed Y-flush/X-centred convention regardless
of orientation. `sizingSheetLayout` threads `brief.columnsAlongWall`
into `axisFrame` alongside the rest of the brief it already read.

Verify:   `npx vitest run` — 370/370 passing, including a new "BUG 69"
describe block in `sizingLayout.test.js` with two CRITICAL tests that
assert `axisFrame`'s computed offset equals `columnGridObject`'s own
drawn origin exactly, for both toggle states and both orientations
(the sync this whole fix depends on), plus line-count/position tests
for the inset itself and an end-to-end `checkColumns` comparison
confirming No never introduces a NEW blocked aisle or rack conflict
relative to Yes on the same geometry. `npm run build` clean. Live
(Playwright, headless Chrome, real Login→Hub→Draw→Generate click
path, `window.__cs` store dump before/after each toggle state): Yes
produced a grid at `y = fp.y` exactly (flush, 3 lines); No produced a
grid at `y = fp.y + 54ft` exactly — one full `gridYFt` pitch, 2 lines,
one fewer than Yes — with exactly one `column_grid` object in the
store in both cases (never four extra ones) and zero console errors.
All BUG 64/68 debug logging (`[WALLCOLS]` console statements,
`window.__debugWallColumns()`) removed once this landed — it was
temporary investigation scaffolding, not permanent instrumentation.

Lesson:   "The toggle's own mechanism works correctly" and "the
toggle produces the right visual result" are different claims — BUG
64's wiring was flawless and every log confirmed it, right up until
the moment it became clear the wiring controlled a mechanism that was
never the thing actually drawing the column the user could see. When
a customer-reported symptom survives every trace of a feature's OWN
code path, the next place to look is whatever ELSE draws in the same
spot for reasons that predate the feature entirely — here, a grid
convention two bug numbers older than the toggle that was supposed to
control it. Also: the user's "stop verifying with your own scripts,
add logging instead" instruction was the right call in hindsight — my
own Playwright repros were internally consistent because they were
all correctly proving the WIRING worked; no amount of re-running them
would ever have surfaced that the wiring was solving the wrong
problem, because the actual defect wasn't in anything my repro
exercised. Direct evidence from the live app broke that blind spot;
more self-testing of the same mechanism would not have.

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
