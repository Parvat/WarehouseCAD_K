// LV — every canvas overlay reads positions the live way (tally-2, canvas2/live.js). A drag moves the Konva nodes of what
// it drags and writes the store only on the drop; a pan moves the Stage at once and writes the store's pan a frame later.
// An overlay drawn from the store's objects lagged a drag, then jumped; one placed from the store's pan trailed a pan.
// This scan fails when an overlay reads positions any other way; the behaviour itself is REG-live-overlays (real mouse).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const files = (dir) => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap(d => (d.isDirectory() ? files(join(dir, d.name)) : /\.(jsx?|tsx?)$/.test(d.name) ? [join(dir, d.name)] : []))
const OVERLAY_DIRS = ['canvas2', 'studio']
const all = OVERLAY_DIRS.flatMap(files).map(f => ({ f: f.split('\\').join('/'), src: readFileSync(join(SRC, f), 'utf8') }))

/* Konva files that read the store's objects and need not be live, each for its reason. A new overlay is not added here
   to get past the scan: it uses useLiveObjects() (canvas2/live.js). */
const NOT_LIVE = {
  'canvas2/Canvas2.jsx': 'the canvas itself: builds the scene and runs the drag',
  'canvas2/CopyChange.jsx': 'the placement ghost: follows the pointer while placing, when nothing is dragged',
  'canvas2/SplitPreview.jsx': 'the Split tool\u2019s preview: shown while splitting, when nothing is dragged',
}

describe('LV — canvas overlays read live positions', () => {
  it('LV-pan: no overlay reads the store\u2019s pan (zoom / panX / panY land a frame after the Stage moves) — only the canvas\u2019s own adopt / seed / write lines, marked live-ok, and the helper', () => {
    const bad = []
    for (const { f, src } of all) {
      if (f === 'canvas2/live.js') continue
      src.split(/\r?\n/).forEach((line, i) => {
        if (/\b(s|st|state)\.pan[XY]\b|getState\(\)\.pan[XY]/.test(line) && !/live-ok/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('LV-objects: every Konva overlay that draws from the store\u2019s objects uses the live objects (useLiveObjects, or the drag preview itself) — never the saved positions during a drag', () => {
    const bad = []
    for (const { f, src } of all) {
      if (!/from 'react-konva'/.test(src) || NOT_LIVE[f]) continue
      const readsObjects = /\bs\.objects\b|getState\(\)\.objects\b/.test(src)
      const live = /useLiveObjects|previewObjects|useDragPreview/.test(src)
      if (readsObjects && !live) bad.push(f)
    }
    expect(bad).toEqual([])
  })

  it('LV-helper: the canvas publishes the transform it applies, in the same call (Canvas2 apply → publishView)', () => {
    const c = all.find(x => x.f === 'canvas2/Canvas2.jsx').src
    expect(c).toMatch(/st\.position\(\{ x: v\.panX, y: v\.panY \}\)\s*\n\s*st\.batchDraw\(\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*publishView\(v\)/)
    for (const f of ['canvas2/RackLineLabels.jsx', 'canvas2/SectionNames.jsx', 'canvas2/TallyHighlight.jsx', 'canvas2/HoverHighlight.jsx', 'canvas2/ZoneEdit.jsx', 'canvas2/RowGroupPreview.jsx', 'canvas2/SectionShape.jsx', 'canvas2/ColumnLineLabels.jsx', 'canvas2/SectionBar.jsx'])
      expect([f, /useLiveObjects\(\)/.test(all.find(x => x.f === f).src)]).toEqual([f, true])
    for (const f of ['studio/SelectionBar.jsx', 'canvas2/ColumnLineLabels.jsx', 'canvas2/SectionBar.jsx', 'canvas2/IssueHighlight.jsx'])
      expect([f, /useView\(\)/.test(all.find(x => x.f === f).src)]).toEqual([f, true])
  })
})
