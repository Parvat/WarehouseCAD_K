import { exportLayoutToPDF } from '../export/pdfExport'
// ─── Scene serialization / deserialization ────────────────────────────────────
// Format version — bump when breaking changes are made to the schema
const SCHEMA_VERSION = 1
const LS_KEY = 'warehousecad_autosave'

/** Collect all saveable state from the store snapshot */
export function serializeScene(s) {
  return JSON.stringify({
    version:      SCHEMA_VERSION,
    savedAt:      new Date().toISOString(),
    appName:      'WarehouseCAD',
    // Canvas content
    objects:      s.objects,
    groups:       s.groups || [],
    layers:       s.layers,
    activeLayerId: s.activeLayerId,
    // Viewport
    zoom:         s.zoom,
    panX:         s.panX,
    panY:         s.panY,
    // Settings
    unit:         s.unit,
    scale:        s.scale,
    snapUnit:     s.snapUnit,
    gridSize:     s.gridSize,
    showGrid:     s.showGrid,
    showRulers:   s.showRulers,
    snapToGrid:   s.snapToGrid,
    fpDefaults:   s.fpDefaults,
    // Colors
    fillColor:    s.fillColor,
    strokeColor:  s.strokeColor,
    opacity:      s.opacity,
  })
}

/** Apply a parsed scene back to the store state (immer draft) */
export function deserializeScene(json, s) {
  let data
  try { data = typeof json === 'string' ? JSON.parse(json) : json }
  catch { throw new Error('Invalid file: could not parse JSON') }

  if (data.appName !== 'WarehouseCAD') throw new Error('Not a WarehouseCAD file')
  if (!Array.isArray(data.objects))    throw new Error('File missing objects array')

  // Canvas content
  s.objects      = data.objects
  s.groups       = data.groups || []
  s.layers       = data.layers || s.layers
  s.activeLayerId= data.activeLayerId || s.activeLayerId

  // Viewport
  if (data.zoom)  s.zoom  = data.zoom
  if (data.panX !== undefined) s.panX = data.panX
  if (data.panY !== undefined) s.panY = data.panY

  // Settings
  if (data.unit)       s.unit       = data.unit
  if (data.scale)      s.scale      = data.scale
  if (data.snapUnit)   s.snapUnit   = data.snapUnit
  if (data.gridSize)   s.gridSize   = data.gridSize
  if (data.showGrid    !== undefined) s.showGrid    = data.showGrid
  if (data.showRulers  !== undefined) s.showRulers  = data.showRulers
  if (data.snapToGrid  !== undefined) s.snapToGrid  = data.snapToGrid
  if (data.fpDefaults)               s.fpDefaults  = data.fpDefaults

  // Colors — intentionally not restored so defaults always apply
  if (data.opacity !== undefined) s.opacity = data.opacity

  // Clear transient state
  s.selectedIds  = []
  s.history      = []
  s.historyIndex = -1
}

/** Download a .wcad JSON file */
export function downloadScene(json, filename) {
  const name = filename || `warehouse-${new Date().toISOString().slice(0,10)}.wcad`
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

/** Open a file picker and return the file contents as a string */
export function pickFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.wcad,.json'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      const reader = new FileReader()
      reader.onload  = (ev) => resolve(ev.target.result)
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsText(file)
    }
    input.click()
  })
}

// ─── localStorage auto-save ───────────────────────────────────────────────────
export function autoSave(json) {
  try { localStorage.setItem(LS_KEY, json) } catch {}
}

export function autoLoad() {
  try { return localStorage.getItem(LS_KEY) } catch { return null }
}

export function clearAutoSave() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

export function hasAutoSave() {
  try { return !!localStorage.getItem(LS_KEY) } catch { return false }
}

// ─── Export as PDF ──────────────────────────────────────────────────────────
/* Headless: draws straight from `state.objects` (export/pdfExport.js), never
   from a mounted canvas — see CANVAS2_BUGLOG.md for why the DOM-cloning
   version this replaced could never have worked once the SVG engine is gone.
   `state` is the full store snapshot (useCanvasStore.getState()), passed in
   by the caller rather than read here, matching this file's own
   serializeScene/deserializeScene convention of taking state explicitly. */
export function exportToPDF(filename, state) {
  exportLayoutToPDF(filename, state)
}