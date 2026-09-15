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
- **Open:**
  (1) bay-select only selects the whole row, not the bay — hitTestBay not wired to selection.
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
