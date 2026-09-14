# Trace — object design spec (rules-driven, all types)

Each rack is drawn FROM its own data. The rules profile supplies the allowed
values; the placed object already stores the chosen ones and its `width`/`height`
(dimensioned at creation). The renderer's job is to **subdivide that box** by the
object's counts and draw the cues below. Visual target: `trace-rack-type-symbols.svg`.

**Colours (one palette for all):** fill `#DCE8DC` · outline/pine `#14392B` ·
dividers `#3E6B54` · flue/beam `#E0A63C` · column marker `#3B6FB5` ·
conflict red `#C0392B`. Line weight 1–1.5 at normal zoom.

---

## 1 · SELECTIVE (`rack_row`)
- **Reads:** `beams[]` (bays), `uprightWidth`, `width`, `height`.
- **Geometry:** `width = uprightWidth×(bays+1) + Σbeams` (÷12 ×40 px); box height = depth.
- **Draw:** green box, pine outline; a **vertical divider per bay boundary**
  (`beams.length` cells); a **solid pine upright cap** at each end.
  **No centre line.**
- **Tell-apart:** bay cells only.

## 2 · DOUBLE ROW (`rack_double_row`)
- **Reads:** as selective + `flueIn` (default 6").
- **Geometry:** two bands (each = depth), total height = `2×depth + flueIn`.
- **Draw:** two green bands, bay dividers on each; **one orange line at the flue**
  between them (thickness ∝ `flueIn`); end caps span both bands.
- **Tell-apart:** the orange flue line — the ONLY type with it.

## 3 · CANTILEVER (`rack_cantilever`)
- **Reads:** `towers[]` (arm length each), `towerWidthIn`, `spineDepthIn`,
  `armThicknessIn`, tower spacing (48" c-to-c), `doubleSided`.
- **Geometry:** horizontal spine; towers evenly spaced across `width`; arms
  project ⟂ to spine, length per tower; double = arms both sides, single = one.
- **Draw:** arms (thin green rects) up (+down if double) at each tower; spine bar
  (pine @55%); **X-brace** across spine; tower posts (pine @90%) on the spine.
- **Tell-apart:** spine + arms, no bays.

## 4 · DRIVE-IN (`rack_drive_in`) — LIFO
- **Reads:** `lanes`, `palletDeep`, `uprightWidth` (4"), pallet 40×48.
- **Geometry:** width = `lanes` channels; height = `palletDeep` deep.
- **Draw:** box, **vertical lane dividers** (`lanes`); **closed back wall**
  (solid pine on the far end); open entry on the near end; **entry arrows up,
  one end only**.
- **Tell-apart:** closed back + arrows one end.

## 5 · DRIVE-THROUGH (`rack_drive_through`) — FIFO
- **Reads:** as drive-in.
- **Draw:** same lanes, but **both ends open** (no back wall); **arrows through**
  (in one end, out the other).
- **Tell-apart:** arrows both ends, no back wall.

## 6 · PUSH-BACK (`rack_pushback`) — LIFO
- **Reads:** `lanes`, `palletDeep` (2–5), `inclineDeg`.
- **Draw:** box + lane dividers; **`palletDeep` nested cart rects** per lane
  (stacked toward the back = the incline); arrows one end.
- **Tell-apart:** nested carts inside the lanes.

## 7 · PALLET FLOW (`rack_pallet_flow`) — FIFO
- **Reads:** `lanes`, `palletDeep`.
- **Draw:** box + lane dividers; **roller hint** = light dashed lines running the
  depth of each lane; arrows one end (load high side, pick low side).
- **Tell-apart:** dashed rollers + FIFO arrows.

---

## Rendering rules (all types — ties to the zoom-lag fix)
- **Level of detail:** below ~15% zoom, draw each rack as ONE simple green rect
  (skip bay/lane subdivisions — they're illegible anyway). Full detail only when
  zoomed in enough to read it.
- **Cull off-screen:** don't render a rack whose bounds are fully outside the
  viewport.
- **Conflict state:** when the column check flags a rack/aisle, tint the affected
  slot or aisle segment with conflict red `#C0392B` over the normal drawing.

## Not in this spec
The actual React render code goes in the canvas object renderer (a protected
file) — this is the target Claude Code renders each object to, same as the
symbol sheet, now with the geometry rules attached.
