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

## Template for new entries

```
## BUG N — one-line symptom  (date / commit)
Symptom:  what the user actually saw.
Chased:   wrong turns tried (so nobody repeats them).
Cause:    the real root cause, technically.
Fix:      the exact change + where.
Lesson:   the general rule that prevents the class of bug.
```
