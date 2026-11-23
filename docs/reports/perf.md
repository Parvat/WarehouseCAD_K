# perf — viewport culling and a 50,000-position benchmark

Branch `perf`, from master (87fcc55). Status: **ready**. Full suite on its own: **4457/4457 green**. Nothing visible changes.

## The benchmark
A layout of **50,240 positions**: a 1,600 × 900 ft building, 157 back-to-back pairs of 20 bays (8′ beams, 4 levels).

Frame times were measured in the running app (Chromium, the dev build, 1440 × 900) by a `requestAnimationFrame`
recorder while:
- the Pan tool drags across the plan at fit;
- 30 wheel steps zoom in and out;
- the Pan tool drags 90 steps zoomed in 8× (about 12% zoom);
- a rack is dragged 60 steps.

The script is in the session scratchpad (`bench.mjs`); it builds the layout in the page, so no fixture is needed.

| Gesture | Before (master): mean · p95 · max | After: mean · p95 · max |
|---|---|---|
| Pan at fit | 13.3 · 13.5 · 13.9 ms | 13.3 · 13.5 · 13.7 ms |
| Zoom | 13.3 · 13.5 · 13.9 ms | 13.3 · 13.5 · 13.9 ms |
| Pan zoomed in 8× | **64.9 · 173.5 · 226.7 ms** | **18.3 · 26.8 · 80.5 ms** |
| Drag a rack | **61.9 · 173.5 · 200.0 ms** | **19.8 · 40.0 · 66.6 ms** |

13.3 ms is the display's frame rate: pan and zoom at fit were already at it, and still are.

## What changed
1. **The real cost was not drawing.** The CPU profile of a drag showed `nearest` in `generate/faceAisles.js`
   (`faceObstacleGaps`, which feeds the face-aisle labels, the X marks and the usable count) taking 6.2 s of
   self time over the 12 s drag. The next item was 0.9 s idle, and nothing else reached 0.8 s. For every bay side of every rack, it scanned every other rack and zone: about a million
   comparisons per frame here. Two changes, with the same answer:
   - the zones and racks that can stand in front of a rack's bays are picked **once per rack** (those sharing its run
     span, the same orientation, not in line with it), not once per bay;
   - the result is **kept for the same objects, grid and truck**, because the canvas, the X marks and the usable count
     ask for it in the same frame.
   
   Same answer: a throwaway test compared the old and new `faceObstacleGaps` and `faceAisleLabels` on the 4 fixtures and
   3 variants each (a zone added, racks moved, racks removed), for 3 trucks. Every result was identical, with gaps
   present. The test is not kept; the old copy was temporary.
2. **Viewport culling** (`canvas2/cullWindow.js`, `canvas2/Scene.jsx`). The scene skips racks, zones and boxes wholly
   outside a padded window around the visible area.
   - The window is the visible area snapped to half-screen cells, at the zoom rounded down to a half power of two,
     padded by at least half a screen. It changes only when a pan or zoom crosses into a new cell, so the scene
     re-renders rarely, not every frame.
   - The visible area always lies inside it.
   - Selected objects are always drawn.
   - Lines, polylines, aisles and anything without a plain box are always drawn.
   - At 8× zoom on the benchmark, 39 to 157 racks are skipped: 822 down to 350 canvas nodes, from 978.

## Nothing visible changes — how it was checked
- **Pixels:** the canvas rendered with culling on and off (`window.__noCull`, a test switch), compared pixel by pixel
  on the benchmark layout at six views (fit; 8× at three places; 24×; 3×). There were **0 differing pixels** at every
  view, while the node count dropped by up to 628.
- **REG-perf-cull** (new, real Pan-tool drag, all 4 fixtures) checks three things:
  - zoomed into a corner: fewer canvas nodes than with culling off, and the same pixels;
  - after a real pan: the same pixels;
  - with a far-off rack selected: the same pixels.

## Decisions made
- **I did not add a level-of-detail drawing.** Scene.jsx forbids it (full detail at every zoom), and culling plus the
  faceAisles fix were enough.
- **The culling switch** (`window.__noCull`) is a test hook only. Nothing in the app sets it.

## Rule 7
No layout rule changed. The face-aisle answer is identical.

## Hand-check (≤ 6)
1. Open a big layout (or Generate a large building) and drag a rack. It follows the mouse smoothly.
2. Zoom in a lot and pan around with the Pan tool. Racks are always there as they come into view; nothing pops in.
3. Select a rack, zoom far away, then pan back. It is still selected and drawn.
4. The face-aisle labels and red X marks look exactly as before.
