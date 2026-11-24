# gen-lock — Generate under a lock, cursors set once, drags at 4× slower CPU

Branch `gen-lock`. It is cut from `drag-perf-bar` (3557878, pushed but not merged yet), not from master (38d9ffa).
Part 3 measures and fixes the drag that drag-perf-bar left, so it needs that work underneath. Merging gen-lock brings
drag-perf-bar in with it. Status: see the last line.

## 1. Generate, Regenerate and Fill section run with the canvas locked

**What happens now:**
- **While a job runs, the canvas is read-only.** A clear layer over the whole window takes every click, drag and wheel;
  every key except Esc is stopped before the app sees it. Over the plan's middle sits a dark card: the job's name, its
  percentage, a progress bar, "Nothing changes until it finishes. Esc cancels." and **Cancel**
  (`studio/BusyLock.jsx`). The card fades in after 250 ms, so a job that takes less than that never flashes it; the lock
  itself is on from the first frame.
- **Nothing is placed until 100 %.** Between its steps, the store shows the layout exactly as it was before the job
  (`utils/busyJob.js`), so the plan never shows a half-built layout. When the job finishes, the whole result lands in
  **one** store write, as **one** undo step.
- **Cancel or Esc** leaves the layout exactly as before: the store's state, the undo history, and the autosave. The
  autosave is held while a job runs and the finished layout is saved once. Without that, a reload mid-job would have
  restored a half-built layout. The Generate card gets its forklift and wall-clearance draft back.
- **Which jobs:**
  - Generate: the card on an empty plan, the layout menu's Start over, and the start screen;
  - Regenerate: the card, and Project settings' "Regenerate racking";
  - Fill section: the section's selection bar.
  
  A Fill **drag** works its plan out while you drag, so its release places at once; it has nothing to wait on.

**Generate is also much faster.** It placed one object at a time, and every object pushed a full history snapshot and
an autosave. The work grew with the square of the layout's size. It now places everything in one write:

| Building | Generate before | Generate now | Regenerate now |
|---|---|---|---|
| 300 × 500 ft (14,576 positions) | 0.4 s | 0.07 s | 0.04 s |
| 600 × 1,000 ft (57,456 positions) | 6.6 s | 0.35 s | 0.18 s |
| 900 × 1,600 ft (136,864 positions) | 63 s | 1.1 s | 0.7 s |

**Nothing about the result changed.** Generate (three sizes, Auto, Horizontal and Vertical) and Regenerate were run on
two fixtures, on the old code and on this branch:
- the same objects, compared with ids normalised;
- the same layers, undo history, selection and view.

Only the order of objects in the list differs, because the old code's keepers re-ran after every single object it
added.

## 2. Cursors, set once for the whole app (added to Rule 9)

**What was wrong:** inputs already showed the I-beam. The field **boxes** did not. In the Generate card, for example,
the input inside each 128 px box is only as wide as its digits (about 22 px), so most of the field showed the arrow.
Selects showed the arrow too: the Forklift field in Project settings, and the profile list in Rules.

**The fix** (`studio/studio.css`, a handful of rules):
- every text and number field, textarea and editable label shows the I-beam, and so does the box around a field;
- a press anywhere on a field's box puts the caret in its field (`utils/fieldFocus.js`, installed once in App);
- every button, select, tab, menu item, switch and clickable chip shows the pointer;
- a disabled control, and a locked object's fields, show not-allowed.

**REG-cursors** checks every visible field (and its box) and every button on: the Generate card, a rack's card and
bar, the building's card, a rectangle's bar, Project settings, the Layout menu, Rules, and the Text panel. On the old
code it fails on the Generate card's six field boxes, Forklift and the Rules list.

## 3. Drag lag at 4× slower CPU

**Method:**
- the 50,320-position benchmark layout (157 back-to-back pairs and one single rack);
- Chromium at 1440 × 900 with the CPU throttled 4× (CDP);
- 3 runs per case, before and after on the same machine, back to back;
- the production build is `vite build` served by `vite preview`; dev is the Vite dev server;
- frames are timed with `requestAnimationFrame` from the press to the release (the display's frame is 13.3 ms);
- "Before" is the branch's starting point, drag-perf-bar.

| 4× CPU | Before: mean · p95 · frames over 16.7 ms | After: mean · p95 · frames over 16.7 ms |
|---|---|---|
| **Production**, single rack | 28.5 · 80–107 · **255 of 725 (35 %)** | 14.7 · 13.5–27 · **24 of 472 (5 %)** |
| **Production**, back-to-back pair | 33.1 · 80–133 · **353 of 885 (40 %)** | 14.7 · 14–27 · **32 of 517 (6 %)** |
| Dev server, single rack | 26.9 · 67–93 · 240 of 836 (29 %) | 15.2 · 14–27 · 36 of 492 (7 %) |
| Dev server, back-to-back pair | 34.3 · 107–120 · 375 of 943 (40 %) | 15.9 · 27 · 76 of 534 (14 %) |

Without throttling, after the change, every drag runs at the display's rate: mean 13.3–13.6 ms, p95 13.4–13.5,
0–2 frames over.

**What the throttled production build was paying for, per frame** (CPU profile of the moves only):
1. **Every layer redrawn.** Each move called `stage.batchDraw()`, which redrew all five layers: every rack, every aisle
   label, every row number. That is the text drawing at the top of the profile.
2. **The whole canvas re-rendered.** The snap guides were Canvas2's own React state, set to a fresh `[]` on every move,
   so Canvas2, both Overlays parts and every overlay in them re-rendered.
3. **A pair wrote the store every frame.** Its live flue was written to the store on each move, which woke every store
   subscriber and keeper.
4. **The start-of-drag spike.** The selection's outline lived in the same layer as every row number, the section legend
   and the doors' tags, so the first redraw of that layer was expensive.

**The fixes:**
- **Lifted drags** (`canvas2/dragLift.js`). When a drag starts, the dragged nodes (body, outline, handles, labels) move
  into a temporary layer of their own, just above their own layer, so the drawing order is unchanged. The layers they
  left are drawn once. Each frame then draws only the lifted layers. On the drop the nodes go back to their own layer
  and place before the store write.
- **Snap guides on their own layer**, from their own small store (`canvas2/SmartGuideLines.jsx`). A guide that comes or
  goes redraws only the guides.
- **The pair's live flue is held in the drag preview** (`dragPreview.js` `setFluePreview` / `useFlued`). It is drawn
  from there by the pair's own rack, outline, handles and labels, and by the live overlays, then written to the store
  once on the drop, exactly as the last frame used to write it.
- **The overlay layer is split into three, in the same order:** outlines and handles; row numbers, legend, grid notes
  and door tags; then the previews. Lifting a selection now redraws only the first. This was the start-of-drag spike:
  the first frames went from 40–67 ms to 13 ms.
- **Held row numbers no longer subscribe to the drag's offset**, and the live overlays share one preview of the objects
  per frame instead of each building its own.

At 4× the production build still misses about 1 frame in 20 on a rack and 1 in 16 on a pair. The misses are single
frames at 27 ms, spread across the drag, with no spike at the start. What is left per move is React updating the
dragged pair's own nodes and the overlays that follow a drag on purpose (the column clearances, section names, door
badges, the selection bar).

## Decisions made
- **Branched from drag-perf-bar**, for the reason given at the top.
- **The lock covers the whole window**, the islands included. Cancel and Esc are the only way out, so a job can't be
  half-cancelled by a click elsewhere.
- **The card appears after 250 ms.** Below that the job has already finished and nothing flashes.
- **Cancel during Regenerate run from Project settings also drops the settings it was saving.** They are part of the
  same undo step, so "exactly as before" includes them.
- **The snap guides draw on top of everything.** They used to draw inside the overlay layer, under some previews; they
  are guides.

## Tests
- **REG-gen-lock** (new, real clicks, all 4 fixtures, 900 × 1,600 ft building):
  1. Start over: under way, the store, the drawing and the autosave are unchanged and the bar and Cancel are shown. A
     click on a rack, Delete and R reach nothing (counted at the canvas and on the document). Cancel leaves everything
     exactly as before.
  2. Start over to the end: more than 50 racks, one undo step. Ctrl+Z gives the layout as before; Ctrl+Y gives it back.
  3. Regenerate with Esc part-way: exactly as before. Regenerate to the end: one undo step, and Ctrl+Z goes back.
- **REG-cursors** (new, all 4 fixtures): above.
- **REG-drag-lift** (new, real mouse, all 4 fixtures): a rack, then a pair with its live flue, dragged 2 ft. Mid-drag,
  the racks' layer and the row numbers' layer are not redrawn; only the lifted layers are. After the drop, each of the
  dragged nodes is back in its own layer at its own place, nothing lifted is left, and the plan is pixel for pixel what
  a fresh load of the dropped layout draws.
- **Updated** (the same behaviour, new function names):
  - RGN-wire: `regenerateRackingLocked`; Generate's two entries now share one step generator, which stamps what it
    placed.
  - SB-gen-cancel, SH-regen-undo and WC-shared.

## Rule 9 basics on what changed
- **Generate, Regenerate and Fill section:** one undo per run and redo. Esc cancels. Save and reload: the autosave is
  the finished layout, or the old one after Cancel.
- **Drags:** move, snap (guides drawn), Alt for no snap, one undo, the same at every zoom. REG-basics in the full suite
  runs every object type through the contract.
- **Cursors:** the new Rule 9 line.

## Dealer walkthrough
- Generate card → building 900 × 1,600 → layout menu → Start over: the card reads "Generating layout… 85 %" over the
  old plan, with Cancel. Esc: 26 objects before, 26 after, the same layout.
- A section over half the building, then Fill section from its bar: 7 racks placed as one undo step. No page errors.
- Field boxes in the Generate card show the I-beam end to end; a click at a box's right end puts the caret in the field.

## Hand-check (≤ 6)
1. On a big building (Generate card: 900 × 1,600), use Layout menu → Start over. The plan stays as it was with a
   progress card over it. Clicks and keys do nothing. Esc puts everything back.
2. Start over again and let it finish. The new layout appears all at once, and one Ctrl+Z brings the old one back.
3. On that layout, Regenerate and press Cancel part-way: nothing changes. Regenerate again: one undo step.
4. In the Generate card, hover the Building width box: the I-beam across the whole box. Click its right end: the caret
   is in the field. Hover a button: the pointer.
5. Drag a rack, then a back-to-back pair, on the big layout. Both follow the mouse smoothly. The pair's flue widens
   over a column as before, and everything lands where it did.
6. `npm run build` passes.

Status: **ready**. Full suite on its own: 4388 passed, 0 failed tests; one file, X_bayBeam, could not start because its setup hook timed out at 20 s while the suite was running (it imports the store and the panels), so its 105 tests were skipped. Run alone, it passes 105/105, which makes 4493/4493. Its setup hook now allows 120 s, so the suite load no longer skips it. `vite build` passes.
