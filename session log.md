# WarehouseCAD — Session Log
**Date:** 2026-03-19  
**Project:** `/home/claude/warehouse-cad-clean/` (your local: `D:/Parvat/Ware House/warehouse-cad-v16b/warehouse-cad-clean/`)

---

## Stack
React 18 + SVG + Zustand/Immer + Vite  
`gridSize = 40px/ft`, `1" = 3.33px`

---

## File Locations (your project)

| File | Path |
|---|---|
| `CanvasArea.jsx` | `src/components/Canvas/` |
| `CanvasObjects.jsx` | `src/components/Canvas/` |
| `useCanvasStore.js` | `src/store/` |
| `canvas.js` | `src/utils/` |
| `RackRowPanel.jsx` | `src/components/RightPanel/` |
| `PropertiesPanel.jsx` | `src/components/RightPanel/` |
| `WarehouseObjectPicker.jsx` | `src/components/LeftPanel/` |
| `warehouseObjects.js` | `src/constants/` |

**Import path for RackRowPanel in PropertiesPanel:**
```js
import { RackRowPanel, MultiBayPanel, CantileverPanel } from '../RightPanel/Rackrowpanel'
```

---

## Stable Snapshots
All at `/home/claude/*.STABLE.*` — restore these if anything breaks.

---

## Session Changes — Complete List

### 1. Floor Plan Wall Rendering (evenodd)
**Problem:** SVG stroke splits across path centerline — visually inaccurate wall thickness  
**Fix:** Single `<path fill-rule="evenodd">` — outer polygon + reversed inner polygon = solid wall ring  
**Function added:** `insetPolygon(verts, wt)` in `canvas.js`  
**Rule:** `fpVerts` = outer face. Inner face = `insetPolygon(fpVerts, wallThicknessFt * gridSize)`

### 2. Wall Thickness
**Default:** `wallThicknessFt: 0.25` (3")  
**strokeWidth:** `wallThicknessFt * gridSize = 10px` (full thickness, no multiplier)  
**Wall color:** `#4a5568` (visible slate grey)

### 3. Dimension Labels
**Formula:** `seg.lenPx + strokeWidth = outer face-to-face`  
**Format:** `pxToFtIn` always shows `ft' in"` — `0"` shown as `9'` not `9' 0"`  
**Snap targets:** inner wall face = `b.x + hw` where `hw = strokeWidth/2`

### 4. Object-to-Wall Snap (purple guides)
- Threshold: `30px/zoom`
- Snaps object edges to **inner wall face** only
- Correct directional pairs: `obj.left→innerLeft`, `obj.right→innerRight`
- Purple dotted guide lines (green = object-to-object)

### 5. Wall-to-Object Snap (shrinking walls)
- When dragging FP wall segment, snaps inner face to nearby object edges
- Uses approach-direction detection
- Left wall approaching: `target = ob.x - hw`
- Right wall approaching: `target = ob.x + ob.width + hw`
- Same for top/bottom

### 6. Rack Bay System
**Data model:**
```js
{
  beams: [96, 96, 144],  // inches per bay
  uprightWidth: 3,        // inches
  activeBayIdx: null,
}
```
**Total width:** `uprightWidth × (bays+1) + Σbeams` (all in inches → px)  
**Upright positions:** calculated from actual beam widths, not total width  
**No left/right resize handles** on rack types

### 7. Bay Selection
- **Click between uprights** → selects bay (`activeBayIdx`)
- **Click upright** → row-level selection, clears bay
- **Alt+click bay** → adds to multi-bay selection (`activeBaySelection`)
- **Rubber-band** → selects all bays in box + auto-selects rack rows
- Hit-test in `CanvasArea.hitTestBay()` using correct `toWorld()` coordinates
- Rotation-aware (un-rotates click coords before testing)

### 8. RackRowPanel
Located at `src/components/RightPanel/Rackrowpanel.jsx`  
Exports: `RackRowPanel`, `MultiBayPanel`, `CantileverPanel`

**RackRowPanel** (single rack selected):
- Total length, wall clear, remaining space (green/red)
- Bay list — click to select bay
- Beam size buttons: 72" / 96" / 120" / 144" (all 4, never `.slice`)
- Add bay buttons (all 4 sizes), Remove bay
- Upright 3"/4" selector
- Flue spacing 6"/9"/12" (double row only)

**MultiBayPanel** (shown when `activeBaySelection` has entries):
- Shows bay count + row count
- Change all selected bays beam size
- Delete selected bays
- Clear selection

### 9. Double Row Rack
- Uses same `beams[]` system as rack_row
- `flueSpaceIn` property (6", 9", 12") — stored on object
- Height = `rowH × 2 + flueH`
- Bay highlights show on both rows simultaneously

### 10. Selective Rack = Rack Row with bays:1
- `rack_selective` picker now places `rack_row` type with `bays:1`
- Identical object — full bay management from day 1
- No separate rendering needed

### 11. Multi-Bay Selection
```js
activeBaySelection: [{ objId, bayIdx }]  // global store state
```
**Actions:** `toggleBayInSelection`, `setBaySelection`, `clearBaySelection`, `deleteSelectedBays`, `changeSelectedBaysBeam`

### 12. Cantilever Rack

**Data model:**
```js
{
  type:           'rack_cantilever',
  towers:         [36, 36, 36, 36, 36],  // arm length — ALL same value
  doubleSided:    true,
  towerWidthIn:   10,   // 8" or 10"
  spineDepthIn:   4,
  armThicknessIn: 3,
  activeTowerIdx: null,
}
```

**Dimensions:**
- Tower spacing: **48" center-to-center** (fixed)
- 1 unit = 2 towers = 48" width
- N units = N+1 towers = N × 48" width
- All arms same length (uniform rule)
- Arm lengths: 36", 48", 52", 60", 72"

**Height:**
- Double: `armLength × 2 + 4"`
- Single: `armLength + 4"`

**Rendering:**
- No outer border rect (cuts across arms)
- Transparent hit area (prevents click-through)
- Single-sided: spine at TOP, arms downward
- Double-sided: spine centered, arms both directions
- Tower posts = solid filled rects
- X-brace = diagonal lines first-to-last tower

**CantileverPanel:**
- Tower list (click to select)
- Arm length buttons (changes ALL towers)
- Add/Remove tower
- Single/Double toggle
- Tower width 8"/10"

---

## Key Architectural Rules (must follow in every future change)

1. Never use SVG stroke for wall dimensions — use filled geometry (evenodd)
2. All measurements in world px in state — convert to ft/in only for display
3. Snap to inner wall face — not outer, not centerline
4. Uprights are filled rects — not lines, not strokes
5. No border-radius on architectural objects — `rx={0}` always
6. New object types → add to `warehouseObjects.js` + `ShapeGeometry` switch only
7. Core snap logic lives in `CanvasArea.jsx` — don't duplicate in child components
8. `getObjectBounds` is single source of truth for hit-testing and snap
9. `fpVerts` = outer face always. Inner face = `insetPolygon(fpVerts, wt)`
10. `pxToFtIn` for all labels — never format manually inline
11. `BEAM_OPTIONS.map` never `.slice` in RackRowPanel
12. Cantilever arms are always uniform length — changing one changes all
13. Rack width is controlled by bay/tower panel only — no left/right resize handles

---

## Math Reference

### Rack Row
```
Total inches = uprightWidth × (bays+1) + Σbeams
Example: 3×(3+1) + (96+96+96) = 12 + 288 = 300" = 25'
```

### Rack in 100' Wall
```
Inner clear = 100' - 3" - 3" = 99'6" = 1194"
Starter bay: 3" + 96" + 3" = 102"
Add-on bay:  96" + 3" = 99" (shared upright)
Max bays: 1 + floor((1194-102)/99) = 1 + 11 = 12 bays
```

### Floor Plan Dimensions
```
Bbox W = widthFt × gridSize
Outer = bbox + strokeWidth
Inner clear = bbox - strokeWidth
Wall thickness = wallThicknessFt × gridSize (10px for 3")
```

### Cantilever
```
Width = (towers - 1) × 48"
Height (double) = armLength × 2 + 4"
Height (single) = armLength + 4"
```

---

## What's Next (suggested)
- Drive-in rack rendering review
- Mezzanine rack refinement  
- Export to PDF / DXF
- Dimension annotations (automated)
- Aisle clearance validation for MHE
- Label/zone overlay system

---

---

## Session 2 — 2026-03-20

### New File
- `src/components/Canvas/CanvasOverlays.jsx` — overlay module for aisle labels and future annotations

### Changes

**13. Rack Labels**
- `RackLabels` component in `CanvasObjects.jsx`
- Visible when selected OR `printMode=true`
- Font `11/zoom` = constant screen size
- rack_row: per-bay beam + total length + depth
- rack_double_row: beams both rows + front depth LEFT + back depth RIGHT + flue label
- rack_cantilever: arm length + spacing + total length

**14. Aisle System**
- `aisle` object: `{ type, row1Id, row2Id, label }`
- `createAisle(row1Id, row2Id)` — store action, prevents duplicates
- "Create Aisle Label" button in Properties when 2 rack rows selected
- `showAisles` state + `toggleAisles()` — toggle button in Properties
- `CanvasOverlays.jsx` renders `AisleLabel` using `getEffectiveDelta`
- Arrows with padding, 1/2/3 labels by aisle length
- `getEffectiveDelta` in `canvas.js` — correct drag tracking for overlays

**15. Bug Fixes**
- Bay selection clears when clicking different object (both PAN + SELECT tool paths)
- Bay selection clears when clicking empty canvas
- `showAisles` moved to correct state section in store (was in actions)
- `pxToFtIn` exact feet shows `9'` not `9' 0"`
- Arrow padding — 3px gap from row edges

### Key Rules Added
- `getEffectiveDelta` must be used in any overlay that needs live drag position
- `printMode={true}` prop enables all rack labels for PDF
- Aisle objects are lightweight refs — position always computed live
- `CanvasOverlays` is the single place for all non-rack SVG annotations

---

## Session 3 — 2026-03-20 (continued)

### New Feature: Column Grid (`column_grid`)

**Data model:**
```js
{
  type: 'column_grid',
  spacingX: [spX, spX, spX, ...],  // px per bay — fills FP inner clear
  spacingY: [spY, spY, spY, ...],
  columnW:  10,   // 12" default in px
  columnH:  10,
  colSizeIn: 12,
  showGrid:  true,
  wallAttached: true,
}
```

**Placement workflow:**
- Picker shows Bays X / Bays Y inputs (default 5x4)
- Drop inside FP → snaps to FP inner top-left corner
- Spacing = (innerClear - colWidth) / bays — fits exactly, no wall overlap
- Drop outside FP → centers on canvas with 40ft default spacing
- No parentId set — can be deleted independently

**Hit-test priority (3 passes):**
1. Racks and regular objects (highest)
2. column_grid (middle — always selectable)
3. FP shapes (lowest)

**Column snap:**
- Objects snap to column faces same as walls (purple guides)
- Uses same WALL_THRESH threshold

**ColumnGridPanel (Properties):**
- Column size: 12" / 18" / 24"
- Show/hide grid lines
- Wall-attached / Free toggle
- Bays X/Y: per-bay spacing input (text field, selects on focus, Enter to confirm)
- Add/Remove bay buttons

### Bug Fixes
- column_grid delete now works (no parentId)
- Spacing input: type="text" with onFocus select-all, no spinner arrows
- Grid overlap fixed: spacing = (innerClear - colW) / bays
- Hit-test 3-pass system prevents grid stealing clicks from racks

### Architecture Rules Added
- column_grid never gets parentId — always independently deletable
- column_grid hit-test: always last resort, never blocks rack selection
- Spacing math: always (innerClear - colW) / bays to prevent wall overlap

---

## Session 4 — 2026-03-20 (continued)

### New Stable File
- `AnnotationObjects.STABLE.jsx` — added to stable set (10 files total)

### Dimension Tool Enhancements

**Endpoint snap during draw:**
- `snapToDimPoint` helper in `CanvasArea` — snaps to wall faces, column faces, object bbox edges within 20px/zoom
- Blue circles at both endpoints during draw confirm snap

**H/V constraint:**
- Shift during draw → pure H or V only (not 45 deg)
- Shift while dragging endpoint handles → same H/V lock
- All other line tools retain existing 45 deg snap

**Handle improvements (all line types):**
- Circles replaced with squares — cleaner, consistent
- `annot_dimension` specific: extension lines always visible (solid, same style as dim line), square handles at source points, no selection glow line

**`applyResize` enhancement (`canvas.js`):**
- Added `shiftKey` param — applies H/V constraint for line types
- `ANNOT_LINE_TYPES` imported in `CanvasArea`

**Custom label:**
- `PropertiesPanel` shows "Label override" text input when `annot_dimension` selected
- Selects all on focus, Enter to confirm, empty = auto-measured value

**Extension lines:**
- Always visible (not just on selection)
- Solid, same color/weight as dimension line
- Connect source points to offset dimension line

### Architecture Rules Added
- `annot_dimension` selection: no glow line (source pts don't match visible dim line)
- Extension lines live in `AnnotationObjects` render (always visible), not in handles
- `applyResize` shiftKey param: always pass `e.shiftKey` for line handle drags

---

## Session 5 — 2026-03-24

### Drive-In Rack — Full Implementation

**Rendering (`CanvasObjects.jsx`):**
- Ledges (2" each) flush to upright inner faces — visually distinct from uprights (opacity 0.45 vs 1.0)
- Connectors at internal pallet level boundaries only (not front/back edges)
- Pallets at exact 40"×48" size in clear space between ledges
- Entry arrows per lane at bottom (aisle face)
- Base fill `fillOpacity={0.12}` — subtle overlay
- `ObjectLabel` suppressed — no "Drive-In Rack" text overlap
- `PalletGrid` helper component added for reuse

**Width formula (all three sources must match exactly):**
```
bw = (lanes+1)*upW + lanes*(ledge*2 + clear*2 + palletW)
   = (lanes+1)*(4/12*40) + lanes*(2/12*40*2 + 1/12*40*2 + 40/12*40)
```
`DriveInPanel.recalc`, `WarehouseObjectPicker` placement, and `ShapeGeometry` render all use this same formula.

**`DriveInPanel` (`RackRowPanel.jsx`):**
- Lanes and Deep: text inputs (select-all on focus) — no fixed button limits
- Helper text: `N+1 uprights`, `N×M pal total`
- Upright: 3"/4" buttons
- Pallet size presets + status card (total pallets + footprint)
- `recalc` derives width/height from formula — never stores arbitrary values

**Handle behavior (`canvas.js` + `CanvasObjects.jsx`):**
- `mr`/`br`/`tr` → add lanes right
- `ml`/`bl`/`tl` → add lanes left (x shifts to anchor right edge)
- `bc`/`br`/`bl`/`tl`/`tr` → add pallet deep
- `tc` suppressed (no top-center resize)
- All other handles work including diagonals

### Core Architecture Fix — Rotated Resize (ALL objects)

**Problem:** `applyResize` receives raw world `dx/dy`. When object is rotated, dragging a handle moves in world space but resize math is in object-local space — causing wrong axis resize and position jumping.

**Fix in `CanvasArea.jsx` — two steps applied to ALL rect objects when `rotation !== 0`:**

1. **Counter-rotate `dx/dy`** into object-local space before `applyResize`:
```js
const rad = -rot * Math.PI / 180
rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
```

2. **Anchor-point correction** after `applyResize` — keeps opposite handle world position fixed:
```js
const ax = handle.includes('l') ? 1 : handle.includes('r') ? -1 : 0
const ay = handle.includes('t') ? 1 : handle.includes('b') ? -1 : 0
// compute anchor world pos → back-compute new cx/cy → update x/y
```

**Scope:** Applies to drawing rects, annotation rects, drive-in rack, all rect-type objects. Line/arc/circle types unaffected.

### Cursor Map Fix (`CanvasObjects.jsx`)
Resize cursor now rotates with object rotation:
```js
const dirs = ['n','ne','e','se','s','sw','w','nw']
const steps = Math.round((obj.rotation||0) / 45) % 8
```

### Selection Box Fix
`clipPath` `canvasClip` still present for shape clipping. Dotted selection box at `bounds.x, bounds.y, bounds.width, bounds.height` (no overhang) — never clipped.

---

## Session 5 (continued) — Drive-Through & Pushback Rack Implementation

### New Rack Types Added

**Drive-Through (`rack_drive_through`):**
- Structurally identical to drive-in (ledges, connectors, pallets)
- Entry arrows on BOTH top and bottom faces — FIFO
- `DriveThroughPanel` in Properties: lanes/deep inputs, upright size, pallet size, FIFO mode label
- Variants: 2/3/4-lane × 5/8-deep with correct dimensions

**Pushback (`rack_pushback`):**
- 3" uprights (vs 4" for drive-in/drive-through)
- Inclined cart rails — subtle diagonal lines full depth per lane
- Cart outlines — nested rects per depth position, slightly inset per level suggesting stacked carts
- Small wheel indicators at cart corners
- Entry arrow bottom only — LIFO
- `PushbackPanel` — warns "⚠ Pushback typically max 5-deep" if deep > 5
- Variants: 2/3-lane × 2/3/5-deep

### Architecture changes

**`canvas.js`:**
- `applyResize` lane-rack block now covers all 3: `rack_drive_in || rack_drive_through || rack_pushback`
- Fixed `rot` undefined bug → uses `obj.rotation || 0`

**`CanvasObjects.jsx`:**
- `rack_pushback` removed from `BAY_RACK` set — now uses lane handles not beam handles
- `rack_pushback` removed from old beam label branch in `RackLabels`
- `RACK_LABEL_TYPES` includes `rack_drive_in` and `rack_drive_through`
- Lane rack labels: width below, depth right, `NL × ND · X PAL` above
- `ObjectLabel` suppressed for all 3 lane-based rack types
- Duplicate `PalletGrid` declaration removed

**`RackRowPanel.jsx`:**
- `DriveThroughPanel` exported
- `PushbackPanel` exported with max-deep warning

**`PropertiesPanel.jsx`:**
- `DriveThroughPanel` and `PushbackPanel` wired in