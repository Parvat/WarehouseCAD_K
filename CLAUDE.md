# Warehouse CAD — Working Guidance

**Companion doc:** `CODEBASE.md` (architecture, file map, data shapes, store API).
This file holds the rules; `CODEBASE.md` holds the map.

---

## Critical Rules

1. **Visual changes only** — CSS variables, inline style values, JSX wrapper markup.
   Never alter logic, store calls, event handlers, or prop names.
2. **Never touch:** `store/useCanvasStore.js`, `utils/canvas.js`, `utils/warehouseSnap.js`,
   `utils/geometricSnap.js`, the `Canvas/*.jsx` logic files, `constants/`.
3. Every existing feature must keep working exactly as-is.
4. If a change *requires* editing a protected file, **stop and report the file + exact change** —
   do not edit it silently. Wait for explicit approval.
5. Verify visual work in the running app, not by reading CSS. Token edits are routinely defeated
   by hardcoded component colors — only pixels prove it.

---

## Open blocker — needs approval to touch a protected file

`Canvas/CanvasObjectCore.jsx` renders the live drag preview. Its switch calls nine path helpers —
`arcPath, arrowPath, trianglePath, diamondPath, starPath, crossPath, lShapePath, tShapePath,
uShapePath` — and its import block (lines 3–6) imports **none** of them. All nine are exported
from `utils/canvas.js`, and `ShapeGeometry.jsx:4` imports its own set correctly.

Result: starting a drag with Arrow, Arc, Triangle, Diamond, Star or Cross throws
`arrowPath is not defined` and white-screens the app. It is a runtime-only failure — the build
passes and the tools are otherwise wired correctly.

The fix is one line in a protected file: add those nine names to the existing
`from '../../utils/canvas'` import. Until that is approved, Arrow and Arc are held out of the
floating toolbar and Triangle/Diamond/Star/Cross are held out of Blocks; both lists carry a
comment saying to restore them the moment the import lands.

---

## Design System

Themes are CSS variable blocks in `src/index.css`, selected by `data-theme` on the root div
(`App.jsx`). Three themes: `studio` (light), `obsidian` (dark), `blueprint`.
Type roles: `--font-ui` / `--font-display` (labels, headers), `--font-mono` (figures, dimensions).

---

## Trace Design Standard (current)

### Light theme = white + ink (monochrome)

```
--bg #F7F8FA · --surface #FFFFFF · --surface2 #F1F3F6 · --border #E6E9EF
--text #0B101D (near-black ink) · --text2 #3A4152 · --text3 #6B7280
```

Accent = **INK** (`#0B101D`), not a color. Active/selected chrome = **solid ink fill + white
text/icon**, so "active" reads clearly without a color accent. Light (`studio`) is the default theme.

Implemented via per-theme `--accent-solid` / `--accent-fg`, so obsidian and blueprint keep their
own tinted-active treatment.

Monochrome applies to **chrome** — surfaces, borders, labels, headers, controls. The one place
color is allowed is the left panel's *item icons*, which carry their category hue (see Icons).

### Left-panel surface family

The library panel runs slightly **warmer** than the app's cool greys, so it reads as its own
plane against the canvas. These are separate tokens, not overrides of `--surface`:

```
--panel-bg #FBFAF8 · --panel-hover #F1F0EB · --panel-border #ECEAE5
--panel-text2 #3A3833 · --panel-text3 #6B675F · --panel-text4 #9A968C
--tile-bg #F4F4F2 · --tile-hover #ECECE9    (neutral, NOT warm cream)
--pin-accent #378ADD · --tool-muted #8A8578
```

**Studio only.** Obsidian and blueprint alias the whole family back to their own surfaces
(`--panel-bg: var(--surface)` and so on), so neither dark theme is touched by the warm tint.
Add any new panel token to all three blocks or the dark themes render it as nothing.

### Chrome uses tokens, never hardcoded hex

Every UI background / border / text = a CSS variable, so all three themes stay consistent.
**Hardcoded hex in chrome is a bug** — it is what caused theme leakage in `TopBar` and
`FloatingToolbar` (a light-grey bar and an indigo accent that never changed with the theme).

### Never theme these — leave hardcoded, intentional

- Canvas object drawing colors (`ShapeGeometry.jsx`, `CanvasUI.jsx`)
- Per-object category identity colors
- The Dark / Light / Blueprint preview swatches
- The pickable color-palette grid

A token accidentally applied to an object color is a bug: `var(--green)` concatenated with an
alpha suffix (`+'22'`) produces invalid CSS.

### Icons — Lucide, one consistent set

Lucide only. One size per context, stroke **~1.5** with `absoluteStrokeWidth` so the rendered
line stays constant across sizes.

**Item icons carry their category color** — 21px, identical treatment in list rows and grid
tiles, so an object looks the same however you browse it:

```
sub-item   racking #165c45 · ops #f59e0b · structural #6366f1 · safety #ef4444 · utilities #3b82f6
section    racking #0E4433 · ops #B87309 · structural #4547C4 · safety #C42B2B · neutral #6B675F
```

A **section header runs one shade deeper than its own children**, so the hierarchy reads as
"the header is the deepest thing in its group". The collapsed rail uses the header shade, since
a rail icon *is* the section. Both are 22px.

**Shapes and Floor plans stay neutral** — #8A8578 for items, #6B675F for their headers. They are
drawing primitives, not domain categories, so they get a grey rather than a hue. Chrome around
the icons (labels, search, chevrons) is still ink and grey; colour lives on the glyph alone.

This reverses the earlier monochrome-panel rule. Category colors were always in the data driving
the *placed object*; they now also tint the icon that places it.

No hand-drawn or mixed icons. Custom warehouse icons, where genuinely needed, are SVGs matched
to Lucide spec: 24×24, stroke 2, `currentColor`, minimal.

Verify a Lucide export exists before importing it — a wrong name renders `undefined` and fails
at runtime, not at build (`conveyor-belt` and `stairs` do not exist in 0.400).

### Left panel pattern

`LeftPanel/FloatingToolbar.jsx` **is** the left panel. (`LeftPanel/index.jsx` exists but is not
rendered by `App.jsx`.) Docked in both states — the canvas starts at the panel's right edge.

| | |
|---|---|
| **Collapsed** | 50px icon rail — logo, pin, tools, search, then one bare icon per section. Clicking a section icon expands the panel and opens that section. |
| **Expanded** | Drag-resizable 150–420px column, 240px on first run. Six sections (Floor Plans, Racking, Ops, Structural, Safety, Blocks) expand **inline**, accordion-style. |

**No flyouts.** That interaction is deleted — it put the primary browse action outside the panel
and needed a second render path that drifted out of sync with the first. Exactly **two** things
float over the canvas, the pinned tray and the drawing toolbar, and both are the same component
(see Floating panels).

**Sections own their items directly** — no intermediate category row. An earlier structure gave
"Racking → Racking → items", which read as duplicated labelling.

**One `ViewToggle`, one `ItemBody`.** Section bodies, search results and the pinned tray all
render through the same body component, so a single global toggle governs list vs grid. The
previous flyout hardcoded tiles and silently ignored the toggle — if you add a surface that
shows items, route it through `ItemBody` rather than writing a third path.

- Section header = category icon (22px, category colour, the **same glyph the collapsed rail
  shows** so the two states stay in sync) + tracked-caps label + chevron on the **right**. No
  count badges.
- **List rows are indented under their header and connected by tree lines.** This reverses the
  earlier "no tree or guide lines anywhere" rule — it is intent, not drift. Grid mode has none.
  The geometry is exact, so build it rather than eyeballing it:
  - rows indent **15px** from the section header, measured header-glyph to row-glyph. The header
    sits flush at the body's left edge with no `padX`, so the row's left padding is `INDENT`
    alone — adding `padX` on top indents by 21px and looks arbitrary.
  - one **1px** vertical spine, `--panel-branch`, running from the first row to the **centre of
    the last row** and stopping there: `(n-1) * (ROW_H + ROW_GAP) + ROW_H/2`.
  - per row, one **1px × 11px** horizontal connector at the row's vertical centre, spanning from
    the spine to the row's left edge. The spine therefore sits `INDENT - CONNECTOR` = 4px in.
  - **straight lines only** — no curves, no rounded elbows, `border-radius: 0`. No connector on
    the section header itself.
  - branches are opt-in (`<ItemBody branches/>`): section bodies get them, search results and
    the pinned tray do not, because neither has a parent header to branch from.
- Tiles are borderless, ~9px radius, `--tile-bg`. Grid columns are
  `repeat(auto-fill, minmax(62px, 1fr))` — **never a hardcoded column count**, so the count
  falls out of whatever width the drag handle left behind and there are no breakpoints to drift.
- Tile labels stay **visible**, not hover-only: hover does not exist on touch. They drop the
  redundant "Rack" (Selective, Cantilever, Drive-In, Drive-Thru, Pushback, Pallet Flow,
  Shelving) and truncate with an ellipsis; the `title` always carries the full name. "Rack Row"
  keeps its noun — cutting to "Row" collides with "Double Row". Ellipsis needs `minWidth:0` on
  the tile *and* the label, or the track sizes to the longest word instead.
- Pin affordance appears on **hover only** (`#B4B0A4` outline). Already-pinned items keep theirs
  visible — otherwise nothing signals what is pinned.
- Drawing tools (Select, Pan, Line, Arrow, Arc, Dimension, Freehand, Text) live in the **floating toolbar**, not
  in the panel — they are actions. Placeable shape *objects* stay in Blocks. The panel's top-row
  button toggles that toolbar; it is labelled "Drawing tools" with `aria-pressed`, because the
  toolbar's own close button already owns the name "Hide drawing tools".
- The footer is **Project Settings** and **Project Properties**, 12px `--panel-muted` labels over
  a 0.5px `--panel-border` rule. Undo/Redo used to live here and were removed — the top bar
  already owns history, and a third copy read as clutter. `FOOTER_H` must track the footer's real
  height or the last row hides underneath it.
- Section order is **Floor Plans first**, then Racking, Ops, Structural, Safety, Blocks.
- Panel preferences — collapsed, **width**, view mode, pinned, usage, **toolbar open/orientation/
  position, tray position** — are presentation state: component state + `localStorage` under
  `trace.leftpanel.v1`, never the canvas store.
- Width has **two writers**, the collapse toggle and the drag handle, sharing **one** stored
  value. Collapsing goes to 50px without overwriting it, so expanding restores the last dragged
  width rather than snapping back to 240.
- The resize handle is a 3px pill you can see inside a 24px strip you can hit, `col-resize`,
  hidden until hover. Drag writes are rAF-coalesced (`useRafWriter`) exactly like the canvas pan
  fix, and `transition` is switched to `none` while dragging or every absolutely-positioned
  control lags a third of a second behind the edge.
- Resizing the panel writes **nothing** to the store — there is no `ResizeObserver` anywhere and
  `panX/panY` are untouched, so world coordinates hold by construction. Verify by measuring a
  placed object's rect against `#canvas-container`'s origin before and after a drag; it must not
  move.

### Floating toolbar palette

The toolbar is the **same surface family as the panel**, not its own shade: `--panel-bg`,
0.5px `--panel-border`, 11px radius, glyphs `--panel-text2`. Active is a soft `--panel-hover`
pill with a `--text` glyph — **not** the solid ink fill used elsewhere for active chrome, which
at toolbar size reads as a heavy black block. Cells are 21px glyph + 8px padding = 37px.

The grip is a 2×3 dot grid (Lucide's `Grip*` glyphs are literally that) spanning the full
cross-axis with a 24px hit area — the touch-target floor — and `grab`/`grabbing` cursors.

### Floating panels

`FloatingPanel` is the **one** drag implementation — grip handle, pointer capture, rAF-throttled
moves, viewport clamping, remembered position. Both the drawing toolbar and the pinned tray use
it. Do not write a second one.

It portals to `document.querySelector('[data-theme]')`, **not `document.body`**. Every colour in
it is a CSS variable and those variables are scoped to the themed div — portalling to body
resolves them all to nothing and the panel renders fully transparent. The portal target must be
read in an effect, not during render: on first mount the div is not committed yet.

Defaults are computed from the live panel width (`W + 24` / `W + 96`) so neither float opens
underneath the panel, and they are offset from each other so opening both does not stack them.

**Expand/collapse is a real animation, not a layout swap.** Logo, pin, tool and chevron are
absolutely positioned and transition `top`/`left`; the search + sections block transitions its
own `top` to close the gap the pin and tool leave behind. `width .32s cubic-bezier(.4,0,.2,1)`
on the panel, labels fade `opacity .18s ease .1s`. Verify by sampling mid-flight — the panel
should measure *between* 50 and 240 partway through, with the pin between its two anchors.

**Layout traps in this file, all silent — no error, just wrong pixels:**
- `box-sizing: border-box` is global, so a fixed grid width must add its own padding back or
  tiles stop fitting and the row collapses to one column. (CSS grid `auto-fill` sidesteps this
  entirely, which is why the tile grid now uses it.)
- A section header and its category row can end up with the same accessible name; keep them
  distinct (`"<name> section"`).
