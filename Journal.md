# Warehouse CAD — Complete Application Journal

> **How to use this file**: Every bug fix and feature is tagged with a version (e.g. `v16-3`).  
> When something breaks, tell me the version number and I'll know exactly what to revert.

---

## Application Overview

A 2D warehouse floor plan editor built with:
- **React + Vite** — UI framework
- **SVG** — all rendering (no Canvas API, no Fabric.js)
- **Zustand + Immer** — state management with undo/redo history
- **Tailwind CSS** — styling

### File Map
```
src/
  App.jsx
  main.jsx
  index.css                        Global styles + CSS variables for themes
  constants/index.js               TOOLS enum, UNITS, DEFAULT_LAYERS, OBJECT_LIBRARY, FORKLIFTS
  store/useCanvasStore.js          All state + actions
  hooks/useKeyboardShortcuts.js    Keyboard shortcuts
  utils/canvas.js                  Pure geometry (snap, paths, hit-test, wall drag)
  components/
    Toolbar/TopBar.jsx             Cut/Copy/Paste/Undo/Redo/Zoom/Units
    LeftPanel/
      index.jsx                    LeftPanel container
      DrawingTools.jsx             Line/Arc/Circle/Rect/L/T/U shapes
      FloorPlanPicker.jsx          6 fp shape tiles → placeFpObject
      ForkliftPanel.jsx            Aisle fit checker
      ObjectLibrary.jsx            Pre-built warehouse objects (racks, doors, etc.)
      CustomObjects.jsx            Save/reuse custom selections
    Canvas/
      CanvasArea.jsx               Mouse events, pan/zoom, draw engine, smart guides
      CanvasObjects.jsx            Renders all SVG objects
      FloorPlan.jsx                Floor plan shape rendering
      Rulers.jsx                   H/V rulers
      StatusBar.jsx                Bottom status bar
    RightPanel/
      PropertiesPanel.jsx          Object X/Y/W/H/Rotation/wall-thickness
      LayerPanel.jsx               Layer visibility/lock/add/delete
      ColorPanel.jsx               Fill/stroke/opacity
      TextPanel.jsx                Font settings
      LabelsPanel.jsx              Zone labels
    shared/
      Tooltip.jsx
      SectionHeader.jsx
```

---

## Store Reference

| State | Type | Default | Notes |
|---|---|---|---|
| `activeTool` | string | `TOOLS.PAN` | Current active tool |
| `zoom` | number | 1 | Viewport scale |
| `panX/panY` | number | 80 | Viewport offset |
| `gridSize` | number | 40 | Pixels per foot |
| `snapUnit` | string | `'in'` | `'ft'|'in'|'half-in'` |
| `objects` | Object[] | `[]` | All canvas objects |
| `selectedIds` | string[] | `[]` | Current selection |
| `activeWall` | `{objId,wallIdx}\|null` | null | Selected wall segment |
| `groups` | `{id,ids[]}[]` | `[]` | Grouped object sets |
| `layers` | Layer[] | DEFAULT_LAYERS | 5 default layers |
| `clipboard` | Object[] | `[]` | Cut/copy buffer |

### Key Store Actions
```
setViewport(z, px, py)            atomic zoom+pan (no two-render race)
placeFpObject({type,widthFt,heightFt})  place fp at viewport center + auto-zoom-to-fit
addObject(obj)                    add + push history
updateObject(id, partial)         immer patch, NO history push (live drag)
commitObjectUpdate(id, obj)       immer patch + push history (on mouseUp)
moveObjects(ids, dx, dy)          move selected + cascade to fp children + push history
attachToParent(childId, parentId) set/clear parentId on a child object
deleteSelected()                  delete + clean up orphaned parentIds + push history
selectObject(id, addToSel)
setActiveWall({objId,wallIdx}|null)
undo() / redo()
```

---

## Object Shape Reference

### Common fields (all objects)
```
id, type, layerId, opacity, rotation, strokeWidth
fill, stroke, noFill
parentId?       → id of fp this object is attached to (sticky movement)
label?          → text label shown inside shape
```

### Floor Plan shapes (`fp_rect`, `fp_l`, `fp_l_mirror`, `fp_t`, `fp_u`, `fp_cross`)
```
x, y, width, height         bounding box
fpVerts                     vertex array [{x,y}] — source of truth for rendering
wallThicknessFt             stroke width in feet
labelFontSize               watermark text size
showWallLabel               show interior clear dim
```

### Regular shapes (`rect`, `circle`, `line`, `arc`, `triangle`, `diamond`, `star`, `cross`, `arrow`, `l_shape`, `t_shape`, `u_shape`)
```
rect:    x, y, width, height
circle:  cx, cy, rx, ry
line:    x1, y1, x2, y2
arc:     x1, y1, x2, y2, bend
text:    x, y, text, fontSize, fontFamily, bold, italic, underline
```

---

## Known Bugs — Do Not Reintroduce

| Bug | Root Cause | Fix Applied |
|---|---|---|
| `arcCtrl.x` crash on select | `arcCtrl` computed without null guard | `isArc && arcCtrl && (...)` |
| Stray `)}` after inner handle | JSX nesting error | Keep arc + wall handle blocks independent |
| `getObjectBounds` returns 0,0,0,0 for fp_* | switch fallthrough | All fp_* types listed in bounds switch |
| T-shape both sides move when dragging one | `fpTStemW` was symmetric | Now `fpTStemL`/`fpTStemR` independent |
| Cross both sides move when dragging one | `fpCrossW/H` were symmetric | 4 independent edge ratios |
| Wall input loses focus after 1 digit | `key={...-${lenFt}}` remounted on every update | `WallInputOverlay` has own useState |
| Rotate handle overlaps dim labels | `bounds.y - 30/zoom` too close | `bounds.y - 70/zoom` |
| Drag drops when moving mouse fast (1st fix) | window listeners re-registered on every `resizing` state change | Ref pattern: `onMouseMoveRef` / `onMouseUpRef` |
| Wall snap-back when crossing bbox boundary | `applyFpWallDrag(origObj)` used frozen drag-start object | Changed to `liveObj` from store |
| deleteSelected left ghost parentId refs | only deleted selected, didn't touch children | Now clears `parentId` on children of deleted fp |

---

## Complete Version History

---

### v13–v15 — Core Architecture

**Tech stack decision**: SVG rendering (not Canvas/Fabric) for hit-testing accuracy.  
**State**: Zustand + Immer chosen for ergonomic mutation syntax + undo/redo snapshots.  
**Coord system**: World coordinates in pixels, 1 foot = 40px (`gridSize`). All positions stored in world space.

**Features built:**
- Pan (drag empty canvas), zoom (scroll wheel toward cursor), space+drag temporary pan
- Object selection, multi-select (shift+click), group select
- Resize handles (8 edges + corners), rotation handle
- Undo/redo stack (60-snapshot ring buffer)
- Layer system (5 default layers, visibility + lock)
- Copy/paste/cut with offset nudge
- Drawing tools: Line, Arc, Circle, Rect, Triangle, Diamond, Star, Cross, Arrow, L/T/U shapes
- Floor plan shapes: fp_rect, fp_l, fp_l_mirror, fp_t, fp_u, fp_cross
- Wall system: clickable hit areas per wall segment, drag to resize walls
- Rulers (H/V with unit ticks at current zoom)
- Status bar (cursor position in ft/in)
- Object library (racks, doors, items)
- Forklift aisle checker

---

### v16 — Wall System Overhaul

#### v16-1 — T-shape wall cursor wrong
**Bug**: Walls 1 and 7 on fp_t (short vertical outer walls) showed `ns-resize` cursor but should show `ew-resize` (they expand width, not height).  
**Fix**: `getWallDragAxis` in `canvas.js` returns `'x'` for walls 1 and 7 on `fp_t`. `applyFpWallDrag` wall 1 → `{ width: pos.x - obj.x }`, wall 7 → `{ x: pos.x, width: ... }`.

#### v16-2 — Wall input box overlapped short walls
**Bug**: The floating wall dimension input appeared on top of the wall being edited.  
**Fix**: `OFFSET_PX` in `WallInputOverlay` increased from 52px to 80px outward screen-space from the wall midpoint.

#### v16-3 — Drag dropped when mouse left SVG boundary
**Bug**: `onMouseMove` and `onMouseUp` were only bound to the SVG element. Moving mouse fast → leaving SVG → mouseUp never fired → object stuck moving on next enter.  
**Fix**: `useEffect` in `CanvasArea` binds both handlers to `window` for component lifetime. SVG bindings kept as-is.

#### v16-4 — Per-wall dimension labels
**Feature**: Added `FpSegmentDimLabels` component. Shows a tick-mark dimension line for every wall segment, offset outward. Visible when fp is selected. Uses winding direction (signed area) to compute outward normals reliably.

#### v16-5 — T-shape inner step walls expand bbox
**Bug**: Dragging walls 2/6 (inner horizontal step on T) would not expand the shape if dragged below the bottom edge.  
**Fix**: `applyFpWallDrag` fp_t case — walls 2/6 now expand `height` while preserving bar depth in absolute pixels.

#### v16-6 — L/L-mirror inner walls expand bbox
**Bug**: Same issue as v16-5 but for L-shapes — inner walls couldn't push past outer edge.  
**Fix**: `applyFpWallDrag` fp_l/fp_l_mirror case now expands bounding box when dragged past outer edge.

#### v16c-1 — Wall snap-back bug during bbox-expanding drag
**Bug**: Dragging a wall that expands the bbox (e.g. T-shape wall 6 down) would snap back on every frame because `applyFpWallDrag(origObj, ...)` used the frozen drag-start object. `origObj.fpTBarHL` was still 0.3 (start value) so the recalculation from that ratio undid the live movement.  
**Fix**: `onMouseMove` wall drag now reads `liveObj = useCanvasStore.getState().objects.find(...)` — the live post-update object — on every frame.

#### v16c-2 — Drag drops on fast mouse movement (root fix)
**Bug**: Previous window listener approach re-registered on every `resizing` state change (because `onMouseMove` had `resizing` in its dep array). Brief gap between unregister and re-register lost mouseup events.  
**Fix**: Refs pattern — `onMouseMoveRef.current` and `onMouseUpRef.current` always point to latest callback. Window listeners registered **once** on mount, never removed/re-added. Zero re-registration gaps.

#### v16h — Wall dimension input + theme system
**Bug**: Typing a new wall length in the floating input did nothing visually. `applyFpWallLength` was returning old ratio-based props (`fpStemW`, `fpTBarHR` etc.) but shapes now render exclusively from `fpVerts`.  
**Fix**: `applyFpWallLength` completely rewritten to be vertex-based (same approach as `applyFpWallDrag`) — gets current `fpVerts`, moves wall endpoints to achieve target length, returns `{ fpVerts, x, y, width, height }`.

**Bug**: `FpDimLabels` reference error — component was deleted in the dim system rewrite but still referenced.  
**Fix**: Removed all references to `FpDimLabels`, replaced with `FpSegmentDimLabels` for all shapes.

**Bug**: `getBoundingClientRect` on null ref during early render (WallInputOverlay).  
**Fix**: Added null guard before reading `el.getBoundingClientRect()`.

**Bug**: Stray bbox corner resize handles and rotate icon visible on fp shapes.  
**Fix**: `ResizeHandles` returns null for fp objects (`isFp` check), fp shapes use `FpRotateHandle` instead.

**Feature — Theme system**:
- 3 themes: Obsidian (dark), Studio (light), Blueprint (engineering blue)
- 3 font sizes: S/M/L via CSS variables
- CSS variables on `data-theme` + `data-scale` attributes on root element
- Theme + scale stored in Zustand, applied via `useEffect` in App.jsx

**Feature — Space+drag pan**:
- Space held → temporary pan mode (like Figma/AutoCAD), any tool
- Middle mouse button → pan regardless of active tool
- Ctrl+0 → fit all objects to screen (bounding box of all objects)

---

### v17 — Drawing Tools + Parent-Child Floor Plan System

#### v17-A — Click-to-place shapes
**File**: `CanvasArea.jsx`  
**Before**: Drawing tools required click+drag to define the shape's bounding box.  
**After**: Single click drops a 4ft×3ft default shape centered on the click point. Drag still works to set custom size. Line/Arc still require drag (need 2 distinct points). Default fill for click-placed shapes is white `#ffffff`. After placing any shape, tool auto-resets to PAN.

#### v17-B — Smooth preview rendering
**File**: `CanvasArea.jsx`  
**Bug**: Fast mouse movement caused React render backlog — preview lagged behind cursor.  
**Fix**: RAF-throttled preview updates via `previewRafRef`. `requestAnimationFrame` ensures max 60fps preview, cancels pending frame before scheduling new one.

#### v17-C — CSS shape transitions
**File**: `CanvasObjects.jsx`  
**Feature**: `fill`, `stroke`, `opacity` changes on shapes animate over 80ms `ease-out`. Applied to both `pathCommon` and `lineCommon` in `ShapeGeometry` via inline `style.transition`.

#### v17-D — PAN tool object movement
**File**: `CanvasArea.jsx`  
**Before**: PAN tool only panned — clicking an object did nothing useful.  
**After**: Clicking an object while PAN is active selects it and starts a move drag. Clicking empty canvas still pans.

#### v17-E — Parent-child sticky movement (core floor plan system)
**Files**: `useCanvasStore.js`, `CanvasObjects.jsx`  
**Feature**: Objects placed inside a floor plan get `parentId = fp.id`. When the fp moves, all children move with it.

**Implementation details**:
- New `parentId` field on child objects
- `moveObjects` in store: after moving selected fp objects, iterates all objects checking `obj.parentId` — if parent was in the moved set, child moves by same `dx/dy`
- `CanvasObjects` export: computes `movingFpIds` (selected fp objects during drag), passes `effectiveDelta` to each `CanvasObject` — selected objects get `moveDelta`, children of moving fp get same `moveDelta`, everything else gets `null`
- `CanvasObject` dx/dy: removed `selected &&` gate — trusts pre-filtered `effectiveDelta`
- `deleteSelected`: now also iterates remaining objects and clears `parentId` if the referenced fp was deleted
- New store action: `attachToParent(childId, parentId)` — sets or clears `parentId`

**Bug introduced and fixed**: `selected && moveDelta` gate was accidentally restored in a later edit, breaking child movement. Fixed by removing the gate again.

#### v17-F — Draw directly on floor plan
**File**: `CanvasArea.jsx`  
**Bug**: Clicking on a floor plan with a draw tool active triggered `hitTest`, which found the fp, set up a move drag, and returned early. Drawing never started. Since shapes were always placed on empty canvas, `parentId` was never set → children never moved with fp.  
**Fix**: Draw tool `hitTest` now skips fp objects (`FP_TYPES_SET` check). Clicks on fp with draw tool always start drawing, never move the fp. Parent detection uses `p1` (the actual click/start point) not the shape center.

#### v17-G — Library items attach to floor plan
**File**: `ObjectLibrary.jsx`  
**Before**: Library items dropped at random offset (`100 + Math.random() * 200`), never got `parentId`.  
**After**: Items drop at viewport center. `zoom`, `panX`, `panY` used to convert screen center → world coords. `parentId` set if viewport center is geometrically inside an fp (`objectContains`).

#### v17-H — Floor plan clickable + moveable
**File**: `CanvasObjects.jsx`  
**Bug**: `FpWallHitAreas` placed invisible thick lines (24px) over all fp walls. Every wall had `onMouseDown={e => { e.stopPropagation(); ... }}` — this silently swallowed the mousedown event before it reached the SVG's main `onMouseDown`. Clicking anywhere near the fp border never selected or started a move drag.  
**Fix**: `FpWallHitAreas` accepts `selected` prop. Wall `onMouseDown` only calls `stopPropagation()` + starts wall-drag when fp is **already selected**. When not selected, click propagates to SVG → `hitTest` → select + move drag.  
**Side effect**: Wall resize cursor now shows `move` instead of resize cursor when fp is not selected.

#### v17-I — PAN as default tool + full multi-select in PAN mode
**Files**: `CanvasArea.jsx`, `useCanvasStore.js`  
**Change**: Default `activeTool` changed from `TOOLS.SELECT` → `TOOLS.PAN` in store.  
**Change**: After placing any drawn shape, tool resets to `TOOLS.PAN` (was `TOOLS.SELECT`).  
**Feature — PAN mode selection**:
- Click object → select + move drag (with group awareness)
- Click fp object → select + move drag
- Shift held → **always** starts rubber-band selbox before hitTest (works anywhere including inside fp)
- Shift+drag → rubber-band box adds to selection without clearing existing

#### v17-J — Fix parentId fallback + selbox inside fp
**Files**: `CanvasArea.jsx`, `ObjectLibrary.jsx`  
**Bug 1**: Both files had `|| objects.find(o => FP_TYPES_SET.has(o.type))` fallback on the parent detection. This assigned `parentId` to every single object placed anywhere in the scene as long as any fp existed. Result: moving the fp moved ALL objects in the scene.  
**Fix**: Removed fallback entirely. `parentId` only assigned when click/drop point is geometrically inside fp bounds (`objectContains`).

**Bug 2**: Dragging inside the fp to rubber-band select objects was impossible. `hitTest` found the fp → started move drag → selbox never started.  
**Fix**: Shift check now comes **before** `hitTest`. Shift+drag always starts selbox regardless of what object is underneath the cursor.

#### v17-K — Dynamic parentId re-evaluation on move
**File**: `CanvasArea.jsx`  
**Bug**: Dragging an object created outside the fp onto the fp didn't attach it. `parentId` was only assigned at creation time.  
**Fix**: After every move commit (`moveObjects`), iterates all moved non-fp objects, reads their post-move center coordinates from the store (Immer mutates synchronously), hit-tests against all fp objects, calls `attachToParent`:
- Center inside fp → `attachToParent(id, fp.id)` — attaches
- Center outside all fps → `attachToParent(id, undefined)` — detaches
- Handles all coordinate types: rect (`x/y/width/height`), circle (`cx/cy`), line/arc (`x1/y1/x2/y2`)

#### v17-L — Smart Alignment Guides
**File**: `CanvasArea.jsx`  
**Feature**: Dynamic alignment guides + magnetic snap during any move drag.

**How it works**:
1. Every `mousemove` during a move drag computes the bounding box of all selected objects shifted by current `dx/dy`
2. Checks 9 alignment pairs against every non-selected object on both axes:
   - Left↔Left, Left↔Right, Left↔Center
   - Right↔Left, Right↔Right, Right↔Center
   - Center↔Left, Center↔Right, Center↔Center
   - Same 9 on Y axis (Top/Bottom/CenterY)
3. **Within 6px screen space** → green dashed guide line appears spanning full extent of both objects + 20px overshoot
4. **Within 8px screen space** → `snapDelta` adjusts the position to lock exactly on the alignment axis
5. Guide lines deduplicated + spans merged to cover all aligned objects
6. `CanvasObjects` receives `snapDelta || moveDelta` so visual position is always snapped
7. On mouseUp: commit uses `snapDelta` for accurate final position; guides cleared

**New state**: `snapDelta` (snapped visual delta), `smartGuides` ([{axis, val, from, to}])

---

## Geometry Utilities Reference (`utils/canvas.js`)

### Path Generators
```js
lShapePath(x, y, w, h, stemW=0.3, stemH=0.3)
lMirrorPath(x, y, w, h, stemW=0.3, stemH=0.3)
tShapePath(x, y, w, h, barH=0.3, bhl=0.3, stemL=0.325, stemR=0.675)
uShapePath(x, y, w, h, wallT=0.28, openH=0.62)
crossPath(x, y, w, h, lxt, rxt, tyr, byr, lxb, rxb, tyl, byl)
arcPath(x1, y1, x2, y2, bend=0.35)
trianglePath / diamondPath / starPath / arrowPath
```

### Wall System
```js
getFpWallSegments(obj, gridSize)
  → [{index, a:{x,y}, b:{x,y}, lenPx, lenFt, label}]

applyFpWallDrag(obj, wallIndex, pos)
  → partial update {} for live drag (uses liveObj not origObj)

applyFpWallLength(obj, wallIndex, newLenFt, gridSize)
  → partial update {} for typed input (vertex-based)

getWallDragAxis(objType, wallIndex)
  → 'x' | 'y' | null
```

### Hit Testing
```js
objectContains(obj, wx, wy)   → boolean (6px padding)
distToSegment(p, a, b)        → number
getObjectBounds(obj)          → {x, y, width, height}
getHandlePositions(bounds)    → {tl, tc, tr, ml, mr, bl, bc, br}
applyResize(obj, handle, dx, dy, snapFn) → partial update
```

---

## Mouse Event Flow

### onMouseDown dispatch order (PAN tool)
1. Shift held → start selbox (before hitTest — works inside fp)
2. HitTest non-fp object → select + move drag
3. HitTest fp object → select + move drag
4. Empty canvas → pan drag

### onMouseMove dispatch
1. `resizingRef.current` set → handle resize (arcCtrl / rotate / wall_N / edge handles)
2. `drag.type === 'pan'` → `setPan`
3. `drag.type === 'move'` → compute `moveDelta` + smart guides + `snapDelta`
4. `drag.type === 'selbox'` → update selbox rect
5. `drag.type === 'draw'` → RAF-throttled preview update

### onMouseUp dispatch
1. Resizing active → `commitObjectUpdate` + clear
2. `drag.type === 'move' && moved` → `moveObjects(snapDelta)` + re-evaluate parentId + clear guides
3. `drag.type === 'selbox'` → `selectMultiple` objects in box
4. `drag.type === 'draw'` → place shape + assign parentId + reset to PAN tool