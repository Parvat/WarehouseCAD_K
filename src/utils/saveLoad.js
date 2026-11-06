import { exportLayoutToPDF } from '../export/pdfExport'
import { extractLegacy } from './elevations'
import { releaseGeneratedLocks, releaseGeneratedObjectLocks } from './layers'
import { joinSplitPairs } from './pairJoin'
import { rebuildAisles } from './aisleRebuild'
// ─── Scene serialization / deserialization ────────────────────────────────────
// Format version — bump when breaking changes are made to the schema
const SCHEMA_VERSION = 2      // 2: the elevation types as their own field (`elevations`)
const LS_KEY = 'warehousecad_autosave'

/** Collect all saveable state from the store snapshot */
export function serializeScene(s) {
  return JSON.stringify({
    version:      SCHEMA_VERSION,
    savedAt:      new Date().toISOString(),
    appName:      'WarehouseCAD',
    // Canvas content
    objects:      s.objects,
    elevations:   s.elevations ?? null,   // the layout's elevation types (utils/elevations.js)
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
  // the elevation types: their own field; a file from before has them as an object among its objects — moved here
  const legacy = extractLegacy(data.objects)
  // an object lock an earlier Generate set on the column grid is dropped (utils/layers.js releaseGeneratedObjectLocks)
  s.objects      = releaseGeneratedObjectLocks(legacy.objects)
  s.elevations   = data.elevations ?? legacy.table ?? null
  s.groups       = data.groups || []
  // a Building layer an older Generate locked is released (a hand lock stays; Columns as saved) — utils/layers.js releaseGeneratedLocks
  s.layers       = releaseGeneratedLocks(data.layers || s.layers)
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

  // a back-to-back pair is one object (utils/bayEmpty.js): the pieces an older layout cut one into are joined back
  { const j = joinSplitPairs(s.objects, s.gridSize || 40)
    if (j.joined.size) {
      s.objects = rebuildAisles(j.objects).objects
      s.groups = (s.groups || []).map(g => ({ ...g, ids: [...new Set((g.ids || []).map(id => j.joined.get(id) || id))] }))
    } }

  // Clear transient state — the history starts at the layout as opened (the store's snapshot shape), so the first
  // action after opening it can be undone
  s.selectedIds  = []
  s.history      = [JSON.stringify({ objects: s.objects, groups: s.groups, layers: s.layers, elevations: s.elevations ?? null })]
  s.historyIndex = 0
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