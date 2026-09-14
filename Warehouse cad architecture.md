# WarehouseCAD — Architecture & Core Logic Reference

> **For architects and warehouse designers. Every inch matters.**
> This document defines the foundational rules. Any future change or addition must respect these principles.

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 18 |
| Canvas | SVG (not Canvas/WebGL — SVG is resolution-independent, zoomable, and measurable) |
| State | Zustand + Immer |
| Scale | `gridSize = 40px/ft` — 1 foot = 40px at zoom=1 |

---

## 1. Coordinate System

```
World coordinates (px):
  Origin (0,0) = top-left
  X increases right
  Y increases down
  1ft = 40px (gridSize)
  1in = 40/12 = 3.33px
```

**Rule:** All object positions and dimensions are stored in **world pixels**. Convert to feet/inches only for display (`pxToFtIn`). Never store feet or inches in state.

---

## 2. Core Data Model

Every object in `useCanvasStore.objects[]`:

```js
{
  id:          nanoid(),       // unique
  type:        string,         // see Object Types below
  x:           number,         // world px — left edge of bounding box
  y:           number,         // world px — top edge of bounding box
  width:       number,         // world px
  height:      number,         // world px
  fill:        string,         // CSS color
  stroke:      string,         // CSS color
  strokeWidth: number,         // world px (for legacy shapes only — FP uses wallThicknessFt)
  opacity:     number,         // 0–1
  layerId:     string,
  parentId?:   string,         // attached to floor plan
  locked?:     boolean,
}
```

**Floor plan objects additionally have:**
```js
{
  wallThicknessFt: number,     // e.g. 0.25 = 3"
  fpVerts:         [{x,y}],    // outer face polygon vertices (world px)
  // shape-specific ratio params: fpStemW, fpBarH, fpUWallT, etc.
}
```

**Warehouse objects additionally have:**
```js
{
  snapType:    string,         // 'end' | 'wall' | 'grid' | 'free' | 'center'
  uprightWidth: number,        // inches (rack objects only, default 3)
  clearance:   { sides, front, back },  // ft — MHE aisle validation
  aisleMin:    number,         // ft — minimum aisle for MHE objects
}
```

---

## 3. Floor Plan — The Fundamental Rules

### 3.1 Wall Rendering (SOLID, NOT STROKED)

Floor plan walls are rendered as **filled geometry** — not SVG stroke. This is architecturally correct because:
- SVG stroke splits across the path centerline (half inside, half outside)
- This makes the visual wall thickness inaccurate and unmeasurable
- Architects need what-you-see = what-you-measure

**Implementation:**
```
Single <path> with fill-rule="evenodd":
  - Outer polygon (fpVerts) + reversed inner polygon
  - SVG evenodd rule fills only the ring between them
  - Ring width = wallThicknessFt × gridSize (exact pixels)
  - Zero stroke on this path
```

**Inner polygon** is computed by `insetPolygon(verts, wt)` in `canvas.js`:
- Uses edge inward-normal bisector method
- At each vertex: offset = `wt × (inwardNormal_edge1 + inwardNormal_edge2)`
- For 90° rectilinear corners: gives exactly `(±wt, ±wt)` per axis
- Correct for both convex AND concave corners (L, T, U, cross shapes)

### 3.2 Wall Dimensions

```
fpVerts = OUTER face coordinates
seg.lenPx = vertex-to-vertex = outer face dimension
Label = pxToFtIn(seg.lenPx) = outer face-to-face ✓
Inner clear = seg.lenPx - 2×wt
```

**For a 9'0" outer rectangular floor plan with 3" walls:**
```
Outer = 9'0" = 108" = 360px (what label shows)
Wall  = 3" = 10px each side
Inner = 360 - 10 - 10 = 340px = 8'6" = 102"
```

### 3.3 Default Wall Thickness

```js
fpDefaults: { wallThicknessFt: 0.25 }  // 3 inches
wallPx = wallThicknessFt * gridSize     // 10px
```

### 3.4 Placement

FP is placed with `widthFt` / `heightFt` as the **outer nominal dimension**:
```js
W = widthFt * gridSize   // bbox = outer face polygon
H = heightFt * gridSize
```
Since `fpVerts` sit on the outer face (not centerline), `W` = outer width directly.

---

## 4. Snap System

### 4.1 Object-to-Object Snap (Smart Guides)
- Threshold: `6px / zoom` (screen pixels)
- Checks: all 9 edge/center combinations per axis
- Visual: **green** dotted guide line
- Applies to: all objects during drag

### 4.2 Object-to-Wall Snap
- Threshold: `30px / zoom` (generous magnet zone)
- Snap target: **inner wall face** = `b.x + wt`, `b.y + wt`, `b.x+w - wt`, `b.y+h - wt`
  where `wt = wallThicknessFt × gridSize`
- Only correct directional pairs:
  - `obj.left → innerLeft`   (object body stays right of left wall)
  - `obj.right → innerRight` (object body stays left of right wall)
  - `obj.top → innerTop`
  - `obj.bottom → innerBottom`
- Visual: **purple** dotted guide line

### 4.3 Wall-to-Object Snap (shrinking walls)
- When dragging a wall segment, snap inner face to nearby object edges
- `hw = wallThicknessFt × gridSize` (full wall thickness, not half)
- Wall approaching from left: `target = ob.x - hw` (inner face touches object left)
- Wall approaching from right: `target = ob.x + ob.width + hw`
- Wall approaching from top: `target = ob.y - hw`
- Wall approaching from bottom: `target = ob.y + ob.height + hw`
- Threshold: `20px / zoom`

---

## 5. Rack Objects — Dimensional Rules

### 5.1 Selective Pallet Rack
```
Total width = uprightWidth + beamLength + uprightWidth
Default:     3"           + 96"         + 3"           = 102" = 8'6"
```

**Placement:**
```js
totalW = (beamLengthFt + uprightFt * 2) * gridSize
```

**Rendering:**
- `rack_selective`: always 2 uprights — left flush, right flush (no center upright)
- `rack_row`: calculates bay count from width → `bays + 1` uprights
- Uprights are **filled rectangles** of width `uprightWidth/12 × gridSize`
- No `rx` (border-radius) — all corners are 90°

### 5.2 Double Row
```
Total depth = rackDepth + flueSpace + rackDepth
Example:     42"        + 6"        + 42"        = 90" = 7'6"
```

### 5.3 Standard Dimensions (US)
| Component | Value |
|---|---|
| Upright width | 3" or 4" (default 3") |
| Beam length | 96" (2-pallet) or 144" (3-pallet) |
| Rack depth | 36", 42", 48" (default 42") |
| Flue space | 6" between back-to-back rows |
| Aisle — counterbalance forklift | 12'–13' |
| Aisle — reach truck | 9'–10' |
| Aisle — VNA | 5.5'–6' |

---

## 6. Object Hierarchy

```
Floor Plan (parent)
  └── Warehouse objects (children via parentId)
        └── Racks, MHE, structural, safety, utilities
              └── Annotations on top of everything
```

**Rules:**
- Children inherit `moveDelta` from parent during drag
- On drop, `parentId` is set by checking which FP contains the object's center point
- FP objects render first (z-order bottom), warehouse objects next, annotations on top

---

## 7. Dimension Display

```js
pxToFtIn(pixels, gridSize):
  totalInches = (pixels / gridSize) * 12
  ft    = Math.floor(totalInches / 12)
  inch  = Math.round(totalInches % 12)
  if inch === 12 → ft+1, inch=0
  if inch === 0  → "${ft}'"          // e.g. 9'
  else           → "${ft}' ${inch}"" // e.g. 8' 6"
```

---

## 8. File Structure

```
src/
  components/
    Canvas/
      CanvasArea.jsx        — mouse events, drag, snap, guides
      CanvasObjects.jsx     — SVG rendering of all object types
      AnnotationObjects.jsx — annotation rendering
    LeftPanel/
      FloorPlanPicker.jsx   — FP tile picker
      DrawingTools.jsx      — drawing tool buttons
      AnnotationPanel.jsx   — annotation tool buttons
      WarehouseObjectPicker.jsx — warehouse object tiles with variants
  store/
    useCanvasStore.js       — Zustand store, all state + actions
  utils/
    canvas.js               — geometry: bounds, snap, insetPolygon, pxToFtIn
    warehouseSnap.js        — warehouse-specific snap: end-to-end, clearance
    geometricSnap.js        — wall geometric snap (point-to-line projection)
  constants/
    warehouseObjects.js     — all warehouse object definitions, variants, snap types
```

---

## 9. Stable Snapshots

Saved at `/home/claude/*.STABLE.*` — restore if core functionality breaks:

| File | What it covers |
|---|---|
| `CanvasArea.STABLE.jsx` | Drag, move, selbox, shift+click multi-select |
| `CanvasObjects.STABLE.jsx` | Resize handles, wall hit areas, FP rotate |
| `canvas.STABLE.js` | Geometry utils |
| `useCanvasStore.STABLE.js` | Move, resize, select, group |

---

## 10. Rules for Future Changes

1. **Never use SVG stroke for dimensions** — use filled geometry (`fill-rule="evenodd"`)
2. **All measurements in world px in state** — convert to ft/in only for display
3. **Snap to inner wall face** — not outer, not centerline
4. **Uprights are filled rects** — not lines, not strokes
5. **No border-radius on architectural objects** — `rx={0}` always
6. **New object types** — add to `warehouseObjects.js` + `ShapeGeometry` switch case only
7. **Core snap logic lives in `CanvasArea.jsx`** — don't duplicate in child components
8. **`getObjectBounds` is the single source of truth** for hit-testing and snap
9. **`fpVerts` = outer face** — always. Inner face = `insetPolygon(fpVerts, wt)`
10. **`pxToFtIn` for all labels** — never format feet/inches manually inline

---

## 11. Key Decisions Log

| Decision | Reason |
|---|---|
| SVG over Canvas/Konva | Resolution-independent, zoomable, CSS-styleable, measurable |
| Filled walls over stroked | SVG stroke splits across path — visually inaccurate for architecture |
| `insetPolygon` for inner face | Correct for all rectilinear shapes incl. concave corners |
| `fpVerts` on outer face | Dimensions measure outer face-to-face as architects expect |
| `gridSize=40px/ft` | Clean integer math: 1ft=40, 3"=10, 6"=20 |
| Wall snap to inner face | Objects touch the structural wall, not its centerline |
| Purple guides for wall snap | Visually distinct from object-to-object (green) |
| Rack uprights as filled rects | Architecturally correct top-down representation |
| Shift+drag always rubber-band | Prevents floor plan from intercepting multi-select |

---

## 12. Cantilever Rack — Architecture

### Data Model
```js
{
  type:           'rack_cantilever',
  towers:         [36, 36, 36, 36, 36],  // arm length in inches — ALL same value
  doubleSided:    true,                   // false = wall-mounted single side
  towerWidthIn:   10,                     // 8" or 10"
  spineDepthIn:   4,                      // always 4"
  armThicknessIn: 3,                      // always 3"
  activeTowerIdx: null,                   // selected tower index
}
```

### Dimensional Rules
- **1 unit** = 2 towers, 1 bay = 48" width
- **N units** = N+1 towers, N bays = N × 48" width
- Tower spacing: always **48" center-to-center**
- All arms must be same length (industry standard)
- Arm lengths: 36", 48", 52", 60", 72"
- Tower widths: 8" or 10"
- Spine depth: 4" always

### Height Calculation
```
Double-sided: height = armLength × 2 + spineDepth
Single-sided: height = armLength + spineDepth
```

### Rendering Rules
- **No outer border rect** — it cuts across arms visually
- Transparent hit area covers full bbox (prevents click-through to floor plan)
- Single-sided: spine at TOP (`by`), arms extend downward
- Double-sided: spine centered, arms extend both up and down
- Spine = solid filled rect (55% opacity)
- X-brace = two diagonal lines first-to-last tower
- Tower posts = solid filled rects on spine
- Arms = hollow rects (fill + stroke)

### Tower Selection
- Click between towers → selects that tower (`activeTowerIdx`)
- Uses `hitTestBay` in CanvasArea (same as rack_row bays)
- Changing arm length → applies to ALL towers (uniform rule)
- Add/remove towers → width recalculates at `(count-1) × 48"`

---

## 13. Rack System Summary

| Type | Data | Width formula | Bay/Tower select |
|---|---|---|---|
| `rack_row` | `beams[]` inches | `upW×(n+1) + Σbeams` | Bay click |
| `rack_double_row` | `beams[]` inches | same as rack_row | Bay click |
| `rack_cantilever` | `towers[]` arm inches | `(n-1) × 48"` | Tower click |

**Rules for all rack types:**
- No left/right resize handles — width controlled by bay/tower panel only
- All use `activeBayIdx` / `activeTowerIdx` stored on object
- All support rubber-band multi-select and Alt+click multi-select
- `MultiBayPanel` shows when `activeBaySelection` has entries

---

---

---
---

## 14. Labels & Overlays

### Rack Labels (`RackLabels` in CanvasObjects.jsx)
- Visible when rack is **selected** OR `printMode=true`
- Font size: `11/zoom` — fixed 11px screen size at any zoom
- `rack_row`: per-bay beam sizes centered in bay + total length below + depth right
- `rack_double_row`: beam sizes in both rows + front depth LEFT + back depth RIGHT + flue label in gap
- `rack_cantilever`: arm length right + tower spacing once top + total length below
- `printMode` prop — PDF module passes `true` to show all labels regardless of selection

### Overlay Module (`CanvasOverlays.jsx`)
Separate component, sibling to `CanvasObjects`, rendered in same SVG transform in `CanvasArea`.

```jsx
<CanvasObjects .../>
<CanvasOverlays zoom={zoom} moveDelta={snapDelta || moveDelta}/>
```

Current overlays: aisle labels  
Future overlays: zone labels, north arrow, scale bar

### Aisle Labels (`AisleLabel` in CanvasOverlays.jsx)
- **Always visible** (respects `showAisles` toggle)
- Position computed live from row bounds — updates during drag
- Uses `getEffectiveDelta(obj, objects, selectedIds, moveDelta)` to track FP drag
- Amber pill style with dimension arrows + padding from row edges
- Short < 20ft → 1 label, Medium 20-60ft → 2 labels, Long > 60ft → 3 labels
- Works for horizontal and vertical aisles

### Aisle Object
```js
{ type: 'aisle', row1Id, row2Id, label: '' }
```
Width/position computed live — never stored. Created via "Create Aisle Label" button in Properties when exactly 2 rack rows selected.

### Show/Hide Aisles
- `showAisles: true` in store initial state
- `toggleAisles()` action
- Toggle button in Properties panel when any aisles exist

### getEffectiveDelta (canvas.js)
```js
getEffectiveDelta(obj, objects, selectedIds, moveDelta)
// Returns {dx,dy} — zero unless obj is selected or its parentId is selected
```
Use wherever live drag position is needed for non-selected objects (overlays, labels).

### pxToFtIn Format
- Exact feet: `9'` (no trailing 0")
- Feet + inches: `8' 6"`
- Never shows `9' 0"` — always `9'`

---

## 15. PDF Export (planned)
- Separate module: `src/utils/pdfExport.js`
- Renders SVG at fixed scale
- Passes `printMode={true}` to `RackLabels` — all labels show
- Aisle labels always show (already always visible)
- Title block, north arrow, scale bar as `CanvasOverlays` additions

---

## 16. Column Grid System

### Object Model
```js
{
  type: 'column_grid',
  x, y,                    // top-left of first column (FP inner corner)
  width, height,           // total grid bbox = bays*spacing + colW
  spacingX: [px, px, ...], // one entry per bay column
  spacingY: [px, px, ...], // one entry per bay row
  columnW: px,             // column width (12"=10px, 18"=15px)
  columnH: px,
  colSizeIn: 12,
  showGrid: true,
  wallAttached: true,      // false = free-standing
  // NO parentId — always independently deletable
}
```

### Placement Math
```
spacing = (innerClear - colW) / bays
innerClear = FP.width - 2 × wallThickness
```
First column at `FP inner corner`, last column right edge = `FP inner right edge` — no overlap.

### Hit-Test Priority (3 passes)
1. All regular objects (racks, annotations) — highest priority
2. column_grid — always selectable, never blocked by being "not yet selected"
3. FP shapes — lowest priority

### Column Snap
Racks snap to column faces (purple guides) at same `WALL_THRESH` as walls.
Snap targets: left face (`cx`), right face (`cx + colW`), top face (`cy`), bottom face (`cy + colH`).

### Picker Config
- Bays X, Bays Y inputs (column count = bays + 1 per axis)
- 12" column size default, adjustable in Properties after placement
- Drop inside FP → fits to FP, snaps to inner corner
- Drop outside FP → 40ft default spacing, centered on canvas

---

## 17. Dimension Annotation Tool

### Drawing
1. Select dimension tool in Annotation panel
2. Click p1 — snaps to wall/column/object edge within 20px/zoom (blue circle confirms)
3. Drag — hold Shift to lock H or V
4. Release at p2 — snaps same way

### Data model
```js
{ type: 'annot_dimension', x1, y1, x2, y2, customLabel?: string }
```
`x1/y1` and `x2/y2` are the **source points** (measured points).  
The visible dim line is rendered offset by `gridSize * 2` in the perpendicular direction.

### Rendering (`AnnotationObjects.jsx`)
- Extension lines: `(x1,y1) → (d1x,d1y)` and `(x2,y2) → (d2x,d2y)` — solid, always visible
- Dim line: `(d1x,d1y) → (d2x,d2y)` with arrowheads
- Label: auto `pxToFtIn(len)` or `obj.customLabel` override

### Selection handles (`ResizeHandles` in `CanvasObjects`)
- **No** selection glow line (source pts ≠ visible dim line — would look wrong)
- Square handles at `x1/y1` and `x2/y2` (source points) — `applyResize` reads these
- Dashes NOT used — extension lines in render already show the connection

### Editing
- Drag square handle → moves that source point
- Hold Shift while dragging → H/V constraint via `applyResize(obj, handle, dx, dy, snapFn, shiftKey)`
- Custom label: Properties panel "Label override" input, empty = auto

### `snapToDimPoint(wx, wy)` in `CanvasArea`
Snaps to nearest: FP inner wall faces, column grid faces, object bbox edges.  
Threshold: `20 / zoom`. Used during draw only (not handle drag — causes self-snap).

### All line-type annotation handles
All use square handles (not circles). H/V Shift constraint works on all.

---

## 18. Rotated Object Resize — Core Architecture

All rect-type object resizing when `rotation !== 0` is handled in `CanvasArea.jsx` in two steps:

### Step 1 — Counter-rotate dx/dy
Mouse delta is in world space. Before passing to `applyResize`, transform into object-local space:
```js
const rad = -rot * Math.PI / 180
rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
```

### Step 2 — Anchor-point position correction
After `applyResize` returns new `width/height`, keep the opposite handle's world position fixed:
```js
const ax = handle.includes('l') ? 1 : handle.includes('r') ? -1 : 0
const ay = handle.includes('t') ? 1 : handle.includes('b') ? -1 : 0
// Anchor world pos = old center + rotate(ax*ow/2, ay*oh/2)
// New center = anchor world - rotate(ax*nw/2, ay*nh/2)
// x = ncx - nw/2, y = ncy - nh/2
```

**Applies to:** All rect objects (drawing shapes, annotation rects, drive-in rack, etc.)
**Does NOT apply to:** Lines, arcs, circles (handled separately)

### Cursor map rotation
```js
const dirs = ['n','ne','e','se','s','sw','w','nw']
const steps = Math.round((obj.rotation||0) / 45) % 8
// Each handle maps to dirs[(base_index + steps) % 8]
```

---

## 19. Drive-In Rack

### Geometry
```
Lane = ledge(2") + clear(1") + pallet_width + clear(1") + ledge(2")
     = pallet_width + 6"
Width = (lanes+1) × upright + lanes × lane
Height = palletDeep × palletDIn
```

### Handle behavior
- `mr`/`tr`/`br` → add lanes right
- `ml`/`tl`/`bl` → add lanes left (returns updated x to anchor right edge)
- `bc`/`br`/`bl`/`tl`/`tr` → add pallet deep
- `tc` suppressed

### `applyResize` for drive-in
Uses pre-rotated `dx/dy` from `CanvasArea`. Returns `{ lanes, palletDeep, width, height, x }`.
`x` only adjusted (for left handles, non-rotated) — rotated case handled by `CanvasArea` anchor correction.

### Width formula must match in 3 places
`ShapeGeometry` render, `DriveInPanel.recalc`, `WarehouseObjectPicker` placement — all must use identical formula or selection box misaligns.

---

## 20. Lane-Based Rack Types

All three types share the same lane geometry formula and `applyResize` logic.

### Types
| Type | Uprights | Arrows | LIFO/FIFO | Max Deep |
|---|---|---|---|---|
| `rack_drive_in` | 4" | bottom only | LIFO | unlimited |
| `rack_drive_through` | 4" | top + bottom | FIFO | unlimited |
| `rack_pushback` | 3" | bottom only | LIFO | 5 recommended |

### Shared geometry formula
```
laneWPx = ledge(2")*2 + clear(1")*2 + palletWIn
bw = (lanes+1)*upW + lanes*laneWPx
bh = palletDeep * palletDIn
```
Must match in 3 places: `ShapeGeometry`, panel `recalc`, `WarehouseObjectPicker` placement.

### Handle rules
- All handles active EXCEPT `tc` (top-center) suppressed
- `rack_pushback` NOT in `BAY_RACK` set — has ml/mr handles

### RackLabels
- `RACK_LABEL_TYPES` includes `rack_drive_in`, `rack_drive_through`
- `rack_pushback` skips beam label branch — uses lane label branch
- Lane label branch shows: width below, depth right, `NL × ND · X PAL` above

### Visual distinction (Pushback only)
- Inclined cart rails: diagonal lines from top to bottom of each lane
- Cart outlines: nested rects with slight inset per depth level
- Wheel indicators: small rects at cart corners

### Panels
- `DriveInPanel` — `rack_drive_in`
- `DriveThroughPanel` — `rack_drive_through`  
- `PushbackPanel` — `rack_pushback`, shows warning if deep > 5

# Warehouse CAD — Architecture Reference
**Last updated:** 2026-03-26
**Stack:** React 18, SVG, Zustand + Immer, Vite
**Grid:** 40px = 1 ft
**Project local:** `D:/Parvat/Ware House/warehouse-cad-v16b/warehouse-cad-clean/`

---

## File Map

| File | Path | Purpose |
|---|---|---|
| `CanvasArea.jsx` | `src/components/Canvas/` | Main canvas: events, pan/zoom, draw, resize, select |
| `CanvasObjects.jsx` | `src/components/Canvas/` | Barrel — re-exports CanvasObjects, DrawingPreview, ShapeGeometry |
| `ShapeGeometry.jsx` | `src/components/Canvas/` | All SVG shape rendering (all rack types, FP, annotations) |
| `CanvasUI.jsx` | `src/components/Canvas/` | ResizeHandles, RackLabels, FP helpers — ALL exported |
| `CanvasObjectCore.jsx` | `src/components/Canvas/` | CanvasObject memo + DrawingPreview + CanvasObjects |
| `CanvasOverlays.jsx` | `src/components/Canvas/` | Aisle labels — rendered AFTER both CanvasObjects passes |
| `AnnotationObjects.jsx` | `src/components/Canvas/` | Annotation renderers |
| `canvas.js` | `src/utils/` | Pure math: bounds, resize, snap, geometry |
| `pdfExport.js` | `src/utils/` | PDF export: A1, title block, scale bar |
| `useCanvasStore.js` | `src/store/` | Zustand store: all state + actions |
| `Rackrowpanel.jsx` | `src/components/RightPanel/` | Barrel — re-exports all panels |
| `panels/RackRowPanelCore.jsx` | `src/components/RightPanel/panels/` | rack_row panel |
| `panels/LaneRackPanels.jsx` | `src/components/RightPanel/panels/` | DriveIn/DriveThrough/Pushback/PalletFlow panels |
| `panels/CantileverPanel.jsx` | `src/components/RightPanel/panels/` | Cantilever panel |
| `panels/ColumnGridPanel.jsx` | `src/components/RightPanel/panels/` | Column grid panel |
| `PropertiesPanel.jsx` | `src/components/RightPanel/` | Routes to correct sub-panel |
| `WarehouseObjectPicker.jsx` | `src/components/LeftPanel/` | Object picker + placement |
| `warehouseObjects.js` | `src/constants/` | Object definitions, variants, snap points |
| `ExportModal.jsx` | `src/components/Modals/` | PDF export form modal |
| `useKeyboardShortcuts.js` | `src/hooks/` | All keyboard shortcuts |

---

## Core Architecture Rules

1. All measurements stored in **world px** — display via `pxToFtIn(px, gridSize)`
2. `gridSize = 40` px/ft
3. `wallThicknessFt = 0.25` (3"), `wallPx = 10px`
4. FP shapes use **evenodd** fill winding
5. Snap to **inner** wall face — never outer
6. Uprights are **filled rects** — not stroke-only
7. `BEAM_OPTIONS.map` — never `.slice`
8. `getEffectiveDelta` must be used in overlays needing live drag position
9. Immer mutations: use `findIndex` + `s.objects[idx]` not variable reference
10. Spread arrays before filter in Immer: `const beams = [...s.objects[idx].beams]`

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

### Handle rules
- `rack_row`, `rack_double_row`, `rack_cantilever` → only `ml`/`mr` (all others suppressed)
- `rack_drive_in`, `rack_drive_through`, `rack_pushback`, `rack_pallet_flow` → suppress `tc` only
- `aisle` → all handles suppressed, no rotate handle

---

## applyResize Special Cases (canvas.js)

1. **Beam racks** (`rack_row`, `rack_double_row`): ml/mr adds/removes bays using last/first beam. Returns `height: obj.height` so anchor correction triggers.
2. **Lane racks** (drive-in/through/pushback/pallet_flow): snaps to whole lanes/deep. Returns `height` always.
3. **Lines/annotations**: moves x1/y1 or x2/y2. Shift = H/V lock from fixed endpoint.
4. **Default rect**: adjusts x/y/width/height.

### Anchor-point correction (CanvasArea.jsx)
For rotated rect objects:
1. Counter-rotate dx/dy: `rdx = dx*cos(-rot) - dy*sin(-rot)`
2. Call applyResize with rdx/rdy
3. Use `origObj.x + ow/2` for old center (never `updates.x`) — prevents bounce
4. Keep opposite handle world position fixed

### SNAP_FREE set
Beam racks + pallet flow use raw dx (no grid snap):
```js
const SNAP_FREE = new Set(['rack_row','rack_double_row','rack_pallet_flow'])
const snapFn = SNAP_FREE.has(origObj.type) ? (v => v) : doSnap
```

---

## objectContains (canvas.js)
Rotation-aware hit test:
```js
// Counter-rotate click point into object local space
const rad = -(rot * Math.PI) / 180
const lx = cx + ldx*cos - ldy*sin
const ly = cy + ldx*sin + ldy*cos
// Then test against unrotated bbox
```

---

## Store Key Actions (useCanvasStore.js)

```js
addObject(obj)
updateObject(id, updates)        // live, no history
commitObjectUpdate(id, updates)  // with history
moveObjects(ids, dx, dy)
deleteSelected()
deleteSingleBay(objId, bayIdx)   // Immer: findIndex + spread beams
deleteSelectedBays()             // multi-select (Alt+click)
selectObject(id, shift?)
createAisle(row1Id, row2Id, label)
toggleAisles()
showExportModal / setExportModal(bool)
undo() / redo()
```

---

## PDF Export

**Files:** `src/utils/pdfExport.js` + `src/components/Modals/ExportModal.jsx`
**Format:** A1 landscape (841×594mm)
**Import fix:** `import { svg2pdf } from 'svg2pdf.js'` (named import, not default)
**Trigger:** `exportAsPDF()` store action → opens ExportModal → `exportToPDFA1(info, objects, gridSize)`
**Title block:** bottom-right, 180×60mm, editable fields
**Scale bar:** bottom-left, auto-calculated 1:N ratio

---

## Aisle System

```js
// Store object
{ type: 'aisle', row1Id, row2Id, label, layerId, locked }
// Width computed live — never stored
// Visual: CanvasOverlays.jsx (rendered LAST — after both CanvasObjects passes)
// Hit area: ShapeGeometry.jsx aisle case (transparent rect over gap)
// Delete: normal deleteSelected() via keyboard or Properties
```

---

## RackLabels (CanvasUI.jsx)

Visible when `selected || printMode`:
- `rack_row`, `rack_pallet_flow`: per-bay beam sizes + total width + depth
- `rack_double_row`: both rows + flue label
- `rack_cantilever`: arm lengths + total width
- Lane racks: `NL × ND · X PAL` above + width below + depth right

---

## Stable Snapshots

All at `/home/claude/*.STABLE.*`:
```
CanvasArea.STABLE.jsx
CanvasObjects.STABLE.jsx        (barrel)
ShapeGeometry.STABLE.jsx
CanvasUI.STABLE.jsx             (all funcs exported, getWallDragAxis in imports)
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

1. ✅ File splitting
2. ✅ Unit tests (34 passing)
3. ✅ Pallet flow rack
4. ✅ Aisle system improvements
5. 🔄 PDF export (modal done, needs svg2pdf import fix)
6. ⬜ Capacity calculations (pallet count per rack, total layout)
7. ⬜ Grid toggle
8. ⬜ Undo indicator
9. ⬜ Zone labels/coloring
10. ⬜ Column grid edit mode

## Known Bugs
- Delete key on beam rack with no bay selected deletes last bay instead of whole rack
  Fix: in useKeyboardShortcuts.js change `obj.beams?.length > 1` to `obj.beams?.length > 1 && obj.activeBayIdx != null`