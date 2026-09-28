// Area CR — columns are drawn at their REAL size at every zoom: no minimum
// on-screen size, no enlarged marker, no screen-constant outline.
// 1080 x 410, 25 x 30 grid, 12" columns; both orientations.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { columnGridObject } from '../../generate/sizingLayout'
import { expandColumnGrid } from '../../generate/columnCheck'
import { columnGridPath } from '../../render/columnDraw'
import { GS } from './fixtures'

const rectsOf = (d) => [...d.matchAll(/M(-?[\d.e+-]+) (-?[\d.e+-]+)h(-?[\d.e+-]+)v(-?[\d.e+-]+)h(-?[\d.e+-]+)Z/g)]
  .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], back: +m[5] }))

describe.each(['horizontal', 'vertical'])('CR — %s', (orientation) => {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, columnsAlongWall: true, rackType: 'rack_double_row' }
  const grid = columnGridObject(brief, 0, 0)

  it('CR-path: every column is drawn as exactly its own square — the column check\'s rects, 12" x 12", nothing grown', () => {
    const cols = expandColumnGrid(grid, GS)
    const drawn = rectsOf(columnGridPath(grid, GS))
    expect(cols.length).toBeGreaterThan(100)
    expect(drawn).toHaveLength(cols.length)
    drawn.forEach((r, i) => {
      expect([r.x, r.y, r.w, r.h]).toEqual([cols[i].x, cols[i].y, cols[i].w, cols[i].h])
      expect(r.back).toBe(-r.w)
      expect([r.w / GS, r.h / GS]).toEqual([(grid.colSizeIn || 12) / 12, (grid.colSizeIn || 12) / 12])
    })
    expect(columnGridPath({ ...grid, showGrid: false }, GS)).toBe(null)
  })
})

describe('CR — wiring', () => {
  it('CR-wire: the column shape takes no zoom, strokes nothing screen-constant; the scene reads no zoom; the enlarged-marker code is gone', () => {
    const shapes = readFileSync('src/canvas2/shapes.jsx', 'utf8').split(String.fromCharCode(13)).join('')
    const view = shapes.slice(shapes.indexOf('function ColumnGridShapeView('), shapes.indexOf('\n}\n', shapes.indexOf('function ColumnGridShapeView(')))
    expect(view).toMatch(/function ColumnGridShapeView\(\{ obj, gridSize, listening = false, bind \}\)/)
    expect(view).toMatch(/useMemo\(\(\) => columnGridOps\(obj, gridSize\), \[obj, gridSize\]\)/)
    // the outline is in drawing units: its width comes from the ops, never screen-constant
    expect(view).not.toMatch(/zoom|strokeScaleEnabled|MIN_|grow/i)
    expect(view).toMatch(/stroke=\{g\.color\} strokeWidth=\{g\.outlineWidth\}/)
    expect(shapes).not.toMatch(/growToMinScreenSize|MIN_COLUMN_MARKER_PX|columnMarker/)
    const scene = readFileSync('src/canvas2/Scene.jsx', 'utf8')
    expect(scene).not.toMatch(/s => s\.zoom|zoom=\{/)
    expect(scene).toMatch(/<ColumnGridShape key=\{e\.obj\.id\} obj=\{e\.obj\} gridSize=\{gridSize\} listening=\{listening\} bind=\{bind\} \/>/)
    expect(existsSync('src/canvas2/columnMarker.js')).toBe(false)
  })
})
