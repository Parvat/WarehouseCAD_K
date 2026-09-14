import { withFullRender } from '../components/Canvas/exportMode'
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

// ─── Export as PDF (via browser print dialog) ─────────────────────────────────
/* Async because the canvas must be re-rendered WITHOUT viewport culling or rack
   level-of-detail before its SVG is cloned. Both are right for the screen and
   wrong for a printed plan: exporting while zoomed in was producing a PDF with
   only the racks that happened to be on screen, drawn as featureless blocks. */
export async function exportToPDF(filename) {
  await withFullRender(() => exportToPDFNow(filename))
}

function exportToPDFNow(filename) {
  const svg = document.getElementById('canvas-svg')
  const container = document.getElementById('canvas-container')
  if (!svg || !container) { alert('Canvas not ready'); return }

  // Get the SVG content and its rendered dimensions
  const { width, height } = container.getBoundingClientRect()
  const svgClone = svg.cloneNode(true)

  // Strip interactive attributes, set explicit dimensions
  svgClone.removeAttribute('class')
  svgClone.removeAttribute('style')
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgClone.setAttribute('width',  width)
  svgClone.setAttribute('height', height)
  svgClone.setAttribute('viewBox', `0 0 ${width} ${height}`)

  // Strip all interactive UI overlays (handles, guides, selection boxes)
  svgClone.querySelectorAll('[data-ui-overlay]').forEach(el => el.remove())
  // Unhide dimension labels (hidden on screen when not selected, always shown in PDF)
  svgClone.querySelectorAll('.dim-labels-hidden').forEach(el => el.removeAttribute('class'))
  const styles = Array.from(document.styleSheets)
    .flatMap(sheet => {
      try { return Array.from(sheet.cssRules).map(r => r.cssText) }
      catch { return [] }
    }).join('\n')

  // Get current CSS variable values (theme colors) by reading computed styles
  const rootStyles = getComputedStyle(document.documentElement)
  const cssVars = [
    '--bg','--surface','--surface2','--surface3','--border','--border2',
    '--text','--text2','--text3','--accent','--accent-dim','--accent-dimmer',
    '--green','--red','--blue','--blue-dim','--shadow','--shadow-sm',
  ].map(v => `${v}: ${rootStyles.getPropertyValue(v).trim()}`).join(';\n  ')

  const name = filename || 'warehouse-layout'
  const title = name.replace('.wcad','').replace('.pdf','')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    :root { ${cssVars}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: white; }
    .page {
      width: ${width}px;
      height: ${height}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
    }
    svg { display: block; }
    /* Print: fill page, no margins */
    @page { size: auto; margin: 10mm; }
    @media print {
      html, body { width: 100%; height: 100%; }
      .page { width: 100%; height: 100%; page-break-inside: avoid; }
      svg { width: 100%; height: auto; max-height: 100vh; }
      .no-print { display: none !important; }
    }
    /* Print button */
    .toolbar {
      position: fixed; top: 12px; right: 12px; z-index: 999;
      display: flex; gap: 8px;
    }
    .btn {
      padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer;
      font-size: 13px; font-weight: 600; font-family: system-ui;
    }
    .btn-primary { background: #f0b429; color: #13151a; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    ${styles}
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
    <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
  <div class="page">
    ${svgClone.outerHTML}
  </div>
  <script>
    // Auto-focus the window so Ctrl+P works immediately
    window.focus()
  </script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank', `width=${Math.min(width+80, 1600)},height=${Math.min(height+80, 1200)}`)
  if (!win) {
    // Popup blocked — fallback to same-tab
    window.location.href = url
  }
  // Clean up blob URL after window loads
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}