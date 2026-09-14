# Warehouse CAD — Complete Reference
**Last updated:** 2026-08-10
**Rules & design standard:** see `CLAUDE.md` (this file is the map, that one is the rules)
**Stack:** React 18, SVG, Zustand + Immer, Vite
**Grid:** 40px = 1 ft
**Project local:** `D:/Parvat/Ware House/warehouse-cad-v16b/warehouse-cad-clean/`

---

## Quick File Reference

| What you want to change | File |
|---|---|
| Object click/selection/move/resize | `src/components/Canvas/CanvasArea.jsx` |
| How shapes look (SVG rendering) | `src/components/Canvas/ShapeGeometry.jsx` |
| Selection handles, rack labels, aisle labels | `src/components/Canvas/CanvasUI.jsx` |
| Object/canvas composition | `src/components/Canvas/CanvasObjectCore.jsx` |
| Aisle overlay labels | `src/components/Canvas/CanvasOverlays.jsx` |
| Annotation renderers | `src/components/Canvas/AnnotationObjects.jsx` |
| Object hit test, applyResize, pxToFtIn | `src/utils/canvas.js` |
| PDF export logic | `src/utils/pdfExport.js` |
| Store state, undo/redo, bay delete | `src/store/useCanvasStore.js` |
| Rack row properties panel | `src/components/RightPanel/panels/RackRowPanelCore.jsx` |
| Drive-in/through/pushback/pallet flow panels | `src/components/RightPanel/panels/LaneRackPanels.jsx` |
| Cantilever panel | `src/components/RightPanel/panels/CantileverPanel.jsx` |
| Column grid panel | `src/components/RightPanel/panels/ColumnGridPanel.jsx` |
| Which panel shows for which object | `src/components/RightPanel/PropertiesPanel.jsx` |
| **Left panel (icon rail ⇄ inline accordion)** | `src/components/LeftPanel/FloatingToolbar.jsx` |
| Object picker (legacy — NOT mounted) | `src/components/LeftPanel/WarehouseObjectPicker.jsx` |
| Theme tokens / all three themes | `src/index.css` |
| Design rules + Trace standard | `CLAUDE.md` |
| Object definitions and variants | `src/constants/warehouseObjects.js` |
| Keyboard shortcuts | `src/hooks/useKeyboardShortcuts.js` |
| PDF export modal form | `src/components/Modals/ExportModal.jsx` |

### Barrel files (re-export only — don't edit)
- `src/components/Canvas/CanvasObjects.jsx` → ShapeGeometry, DrawingPreview, CanvasObjects
- `src/components/RightPanel/Rackrowpanel.jsx` → all panel exports

### Not rendered
- `src/components/LeftPanel/index.jsx` — imported by `App.jsx` but never mounted.
  `FloatingToolbar.jsx` is the actual left panel.

---

## Core Architecture Rules

1. All measurements stored in **world px** — display via `pxToFtIn(px, gridSize)`
2. `gridSize = 40` px/ft — never hardcode pixel values without dividing by gridSize
3. `wallThicknessFt = 0.25` (3"), `wallPx = 10px`
4. `fpVerts` = outer face vertices — inner face = `insetPolygon(fpVerts, wallPx)`
5. Snap to **inner** wall face — never outer, never centerline
6. FP shapes use **evenodd** fill winding — critical for hollow walls
7. Uprights are **filled rects** — no stroke-only lines
8. `getObjectBounds` is single source of truth for hit-testing and snap
9. `BEAM_OPTIONS.map` — never `.slice` in RackRowPanelCore
10. `getEffectiveDelta` must be used in overlays needing live drag position
11. **Immer mutations:** use `findIndex` + `s.objects[idx]` not variable reference
12. **Spread arrays before filter in Immer:** `const beams = [...s.objects[idx].beams]`

---

## canvas.js — Key Exports

```js
ANNOT_LINE_TYPES, ANNOT_RECT_TYPES, HANDLES
getObjectBounds(obj)                              // → {x,y,width,height}
applyResize(obj, handle, dx, dy, snapFn, shiftKey) // → updates object
getHandlePositions(bounds, pad)                   // → {tl,tc,tr,ml,mr,bl,bc,br}
pxToFtIn(px, gridSize)                            // → "9'" or "8' 6\""
insetPolygon(verts, amount)                       // → inset polygon vertices
getFpWallSegments(obj)                            // → wall segments
getEffectiveDelta(obj, objects, selectedIds, moveDelta) // → {dx,dy}
objectContains(obj, wx, wy, zoom)                 // rotation-aware hit test
snapToGrid(v, gridSize)
```

### objectContains — rotation-aware (IMPORTANT)
Counter-rotates click point into object local space before bbox test:
```js
const rad = -(rot * Math.PI) / 180
const lx = cx + ldx*cos - ldy*sin
const ly = cy + ldx*sin + ldy*cos
// Test lx/ly against unrotated bbox
```

### applyResize special cases
1. **Beam racks** (`rack_row`, `rack_double_row`): ml/mr adds/removes bays using last/first beam. Returns `height: obj.height` so anchor correction triggers.
2. **Lane racks** (all 4 types): snaps to whole lanes/deep. Returns `height` always.
3. **Lines/annotations**: moves x1/y1 or x2/y2. Shift = H/V lock from fixed endpoint.
4. **Default rect**: adjusts x/y/width/height.

### SNAP_FREE — beam/lane racks use raw dx
```js
const SNAP_FREE = new Set(['rack_row','rack_double_row','rack_pallet_flow'])
const snapFn = SNAP_FREE.has(origObj.type) ? (v => v) : doSnap
```

---

## CanvasArea.jsx — Rotated Resize

### Counter-rotation
```js
const rad = -rot * Math.PI / 180
rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
```

### Anchor-point correction — CRITICAL
Use `origObj.x/y` for old center — NEVER `updates.x/y` (causes bounce):
```js
const ocx = origObj.x + ow/2   // ✓ always origObj
const ocy = origObj.y + oh/2   // ✓ always origObj
// NOT: (updates.x ?? origObj.x) + ow/2  ← causes bounce on left-handle drag
```

### resizingRef guard
```js
const onMouseDown = useCallback((e) => {
  if (resizingRef.current) return  // handle already captured
  ...
```

---

## Lane-Based Rack Geometry

### Formula (must match in 3 places: ShapeGeometry, panel recalc, picker)
```js
laneWPx = ledge(2")*2 + clear(1")*2 + palletWIn
bw = (lanes+1)*upW + lanes*laneWPx
bh = palletDeep * palletDIn
```

### Type comparison
| Type | Uprights | Arrows | Mode | Visual |
|---|---|---|---|---|
| rack_drive_in | 4" | bottom | LIFO | ledges + connectors + pallets |
| rack_drive_through | 4" | both | FIFO | same |
| rack_pushback | 3" | bottom | LIFO | cart outlines + inclined rails |
| rack_pallet_flow | 3" | both | FIFO | rail lines + horizontal rollers every 16" |

### Handle suppression rules (CanvasUI.jsx)
```js
// aisle — no handles at all
if (obj.type === 'aisle') return null

// rack_row, rack_double_row, rack_cantilever — only ml/mr
const BAY_RACK = new Set(['rack_row','rack_double_row','rack_cantilever'])
if (BAY_RACK.has(obj.type) && h !== 'ml' && h !== 'mr') return null

// lane racks — suppress tc only
if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow']
    .includes(obj.type) && h === 'tc') return null

// aisle — no rotate handle
const noRotate = ... || obj.type === 'aisle'
```

---

## useCanvasStore.js — State Shape

```js
{
  objects: [],
  selectedIds: [],
  layers: [],
  groups: [],
  history: [], future: [],
  gridSize: 40,
  activeTool: string,
  activeLayerId: string,
  fillColor, strokeColor, strokeWidth, opacity,
  activeWall: null,
  activeBaySelection: [],
  showAisles: true,
  showExportModal: false,
  wallThicknessFt: 0.25,
  printMode: false,
  currentFilename: string,
}
```

### Key actions
```js
addObject(obj)
updateObject(id, updates)         // live, no history
commitObjectUpdate(id, updates)   // with history push
moveObjects(ids, dx, dy)
deleteSelected()
deleteSingleBay(objId, bayIdx)    // Immer: findIndex + spread beams
deleteSelectedBays()              // multi-select (Alt+click)
selectObject(id, shift?)
createAisle(row1Id, row2Id, label)
toggleAisles() / setExportModal(bool)
undo() / redo()
```

### Immer mutation pattern (CRITICAL)
```js
// WRONG — revoked proxy error
const obj = s.objects.find(o => o.id === id)
obj.beams = newBeams  // ❌

// CORRECT
const idx = s.objects.findIndex(o => o.id === id)
const beams = [...s.objects[idx].beams]  // spread before filter/map
const newBeams = beams.filter(...)
s.objects[idx].beams = newBeams   // ✓ mutate via index
s.objects[idx].width = newW       // ✓
pushHistory(s)
```

---

## Rack Object Data Shapes

```js
// Beam rack (rack_row, rack_double_row)
{ type, x, y, width, height, rotation,
  beams: [96,96,144], uprightWidth: 3,
  palletWIn: 48, palletDIn: 40, activeBayIdx: null }

// Lane rack (rack_drive_in, rack_drive_through, rack_pushback, rack_pallet_flow)
{ type, x, y, width, height, rotation,
  lanes: 2, palletDeep: 5, uprightWidth: 4,
  palletWIn: 40, palletDIn: 48 }

// Aisle (old-style — width computed live from row bounds)
{ type: 'aisle', row1Id, row2Id, label, layerId, locked }
```

---

## RackLabels (CanvasUI.jsx)

Visible when `selected || printMode`:
- `rack_row`, `rack_pallet_flow`: per-bay beam sizes + total width + depth
- `rack_double_row`: both rows beams + flue label + depth
- `rack_cantilever`: arm lengths + total width
- Lane racks: `NL × ND · X PAL` above + width below + depth right

---

## Aisle System

```js
// Created by selecting 2 racks → Properties → "+ Create Aisle Label"
// Store: createAisle(row1Id, row2Id, label)
// Width computed live from rack bounds — never stored
// Visual: CanvasOverlays.jsx — rendered LAST (after both CanvasObjects passes)
// Hit area: ShapeGeometry.jsx aisle case (transparent rect over gap)
// Delete: normal deleteSelected() — aisle is a regular object in objects[]
```

---

## PDF Export

```js
// Files
src/utils/pdfExport.js          // core logic
src/components/Modals/ExportModal.jsx  // form UI

// Import fix — named import required
import { svg2pdf } from 'svg2pdf.js'  // NOT default import

// Format: A1 landscape (841×594mm)
// Title block: bottom-right 180×60mm
// Scale bar: bottom-left, auto-calculated 1:N
// Trigger: exportAsPDF() store action → opens modal
```

---

## Common Patterns

### Add a new panel for an object type
1. Create panel in `panels/` folder
2. Export from `Rackrowpanel.jsx` barrel
3. Add `{obj.type === 'your_type' && <YourPanel obj={obj} />}` in `PropertiesPanel.jsx`

### Add a new rack type
1. Add definition to `warehouseObjects.js`
2. Add rendering case to `ShapeGeometry.jsx`
3. Add handle suppression in `CanvasUI.jsx`
4. Add `applyResize` case in `canvas.js` — always return `height: obj.height`
5. Add panel in `LaneRackPanels.jsx` or `RackRowPanelCore.jsx`
6. Add placement logic in `WarehouseObjectPicker.jsx`

---

## Stable Snapshots

All at `/home/claude/*.STABLE.*` — copy to restore if anything breaks:
```
CanvasArea.STABLE.jsx
CanvasObjects.STABLE.jsx        (barrel)
ShapeGeometry.STABLE.jsx
CanvasUI.STABLE.jsx             (all funcs exported WITH export keyword, getWallDragAxis in imports)
CanvasObjectCore.STABLE.jsx
CanvasOverlays.STABLE.jsx
AnnotationObjects.STABLE.jsx
canvas.STABLE.js
useCanvasStore.STABLE.js
RackRowPanel.STABLE.jsx         (barrel)
RackRowPanelCore.STABLE.jsx
LaneRackPanels.STABLE.jsx
CantileverPanel.STABLE.jsx
ColumnGridPanel.STABLE.jsx
PropertiesPanel.STABLE.jsx
WarehouseObjectPicker.STABLE.jsx
warehouseObjects.STABLE.js
useKeyboardShortcuts.STABLE.js
```

---

## Pending Features (Priority Order)

1. ✅ File splitting (barrel architecture)
2. ✅ Unit tests (34 passing — `src/__tests__/canvas.test.js`)
3. ✅ Pallet flow rack full functionality
4. ✅ Aisle system (clickable, deletable, visibility toggle, bolder labels)
5. ✅ PDF export — use existing `exportToPDF` from `saveLoad.js` (reverted over-engineered approach)
6. ✅ Capacity calculations — `src/utils/capacity.js`, levels input on beam racks, layout total in PropertiesPanel
7. ✅ Grid toggle — already existed in TopBar
8. ✅ Undo indicator — already existed
9. ✅ Zone labels — use `annot_label_box` with fill color (already built)
10. ✅ Cantilever extend via drag — tower add/remove on ml/mr
11. ✅ Bay selection clears on empty canvas click / object switch
12. ✅ Rotated object hit test fix (objectContains rotation-aware)
13. ✅ Rotated resize anchor correction fix (uses origObj.x/y not updates.x/y)
14. ✅ Delete bay fix (deleteSingleBay with Immer findIndex pattern)
15. ✅ UI polish — theme tokens across all chrome, Trace light theme, left panel
    rebuilt as a 50px icon rail that expands to a 240px column with inline
    accordion sections, search, list/grid and a floating pinned tray.
    Flyouts were removed entirely. See `CLAUDE.md`.
16. ⬜ Column grid edit mode
17. ⬜ Forklift clearance warning (aisle too narrow for assigned forklift)
18. ⬜ Scale indicator (always-visible on canvas)

## Known Bugs

- None currently known