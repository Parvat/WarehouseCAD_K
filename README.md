# WarehouseCAD

## Quick Start
```bash
npm install
npm run dev          # Vite picks the next free port if 5173 is taken
npm test             # vitest
npm run build
```

## Docs
| File | What it holds |
|---|---|
| `CLAUDE.md` | Working rules + the Trace design standard |
| `CODEBASE.md` | Architecture map, file reference, store API, data shapes |
| `Warehouse cad architecture.md` | Foundational geometry & measurement rules |

## Structure
```
src/
  App.jsx                          ← Root layout (TopBar / left panel / canvas / right panel)
  main.jsx                         ← Entry point
  index.css                        ← Theme tokens (studio/obsidian/blueprint) + Tailwind
  constants/index.js               ← Tools, units, library data, forklifts
  constants/warehouseObjects.js    ← Object categories, types, variants
  store/useCanvasStore.js          ← Zustand store (all state + actions)
  hooks/useKeyboardShortcuts.js    ← Global keyboard shortcuts
  utils/canvas.js                  ← Snap, hit test, resize, pixel-to-unit helpers
  utils/capacity.js                ← Pallet capacity calculations
  utils/saveLoad.js                ← Save / load / autosave / PDF export
  components/
    Toolbar/TopBar.jsx             ← File/Edit/Zoom/Units/theme + scale switcher
    LeftPanel/
      FloatingToolbar.jsx          ← THE left panel: icon rail ⇄ docked tree,
                                     search, favourites, list/grid, flyouts
      WarehouseObjectPicker.jsx    ← Object picker
      ForkliftPanel.jsx            ← Forklift aisle fit checker
      index.jsx                    ← Legacy container — NOT rendered
    Canvas/
      CanvasArea.jsx               ← Mouse events, pan/zoom, draw engine
      CanvasObjects.jsx            ← Barrel → ShapeGeometry / DrawingPreview
      CanvasUI.jsx                 ← Selection handles, rack + aisle labels
      Rulers.jsx                   ← H/V rulers, level-of-detail ticks
      StatusBar.jsx                ← Bottom status (cursor, zoom, shortcuts)
    RightPanel/
      index.jsx                    ← RightPanel container (USE THIS as entry)
      PropertiesPanel.jsx          ← Selected object props + capacity hero
      panels/                      ← Per-rack-type property panels
      LayerPanel.jsx               ← Layer visibility/lock/add/delete
      TextPanel.jsx                ← Font, size, bold/italic/align, preview
      ColorPanel.jsx               ← Fill/stroke color + palette + opacity
      LabelsPanel.jsx              ← Zone labels/tags
    shared/
      Tooltip.jsx · SectionHeader.jsx
```

## Theming
Three themes — `studio` (light, default), `obsidian` (dark), `blueprint` — are CSS variable
blocks in `src/index.css`, selected by `data-theme` on the root div. All UI chrome reads those
variables; hardcoded hex in chrome is a bug. See `CLAUDE.md` for the full standard.

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| V | Select tool |
| M | Multi-select |
| L | Line |
| A | Arc |
| C | Circle |
| R | Rectangle |
| T | Text |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+C/V/X | Copy/Paste/Cut |
| Ctrl+A | Select all |
| Delete | Delete selected |
| Ctrl+= / Ctrl+- | Zoom in/out |
| Ctrl+0 | Reset zoom |
