// Area WC — ONE wall clearance (BUG 76): inches from a wall's INNER face to the back of a wall row, default 3",
// 0 allowed, shared by Generate and Fill racking (the Racking settings, utils/fillTool.js; generate/wallClear.js).
// Generate's default layouts come out exactly as before (6" from the outline on a 3" wall = 3" from the face);
// Fill racking, flush before, now keeps the clearance on the walls along the rows (run ends as before); an
// existing racking area stays flush; an old stored value converts (old − wall, not below 0). Plus the core Fill
// behaviours at the default 3", both orientations, and the pair-half fix found on the way.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaCreate, planAreaResize, areaSettings } from '../../generate/rackingArea'
import { patternFill, innerOutline, clearOutline } from '../../generate/fillRacking'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { cutOffRacks } from '../../generate/aisleAccess'
import { rowAisleGaps } from '../../generate/rowAisles'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { clearFromOutline, wallClearOf, WALL_CLEAR_IN } from '../../generate/wallClear'
import { installRowGroupWatcher, flushRowGroupWatcher, clearGroup, addRowOf, applyPending, useRowGroup } from '../../utils/rowGroupTool'
import { DEFAULT_RULES } from '../../rules/defaults'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }

const RACK = new Set(['rack_row', 'rack_double_row'])
const E = 1e-6
const turn = (o) => { const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }; if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x })); if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW }); return t }
const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
const shaped = (fp, cuts) => { if (!cuts.length) return fp; const X = (ft) => fp.x + ft * GS, Y = (ft) => fp.y + ft * GS, W = fp.width / GS, H = fp.height / GS; const v = [[0, 0], [W, 0]]; if (cuts.includes('br')) v.push([W, 170], [W - 150, 170], [W - 150, H]); else v.push([W, H]); if (cuts.includes('bl')) v.push([150, H], [150, 170], [0, 170]); else v.push([0, H]); return { ...fp, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) } }
/** The fixture (a shape of it, turned or not) filled by a NEW area over its box — `settings` on top of the area's
 *  own (no wallClearIn there: the default 3" applies unless given). */
function newFill({ shape = 'rectangle', turned = false, orientation = 'horizontal', settings = {} } = {}) {
  const objs = REAL_LAYOUT.map(o => (o.type.startsWith('fp_') ? shaped(o, SHAPE_CUTS[shape]) : { ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area'), fp = objs.find(o => o.type.startsWith('fp_'))
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  const out = planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation, ...settings }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
  return { out, fp, box, area: out.find(o => o.type === 'racking_area'), vert: orientation === 'vertical' }
}
const acrossOf = (o, vert) => { const f = rackFootprint(o); return (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).map(v => v / GS) }
const runOf = (o, vert) => { const f = rackFootprint(o); return (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w]).map(v => v / GS) }
/** The inner face's stack extent (ft). */
const faces = (fp, vert) => { const sv = innerOutline(fp, GS).map(p => (vert ? p.x : p.y) / GS); return [Math.min(...sv), Math.max(...sv)] }
const keys = (list) => list.filter(o => RACK.has(o.type)).map(o => [o.type, Math.round(o.x * 1e3), Math.round(o.y * 1e3), Math.round(o.width * 1e3), o.rotation || 0, o.beams.join('/'), o.rowIndex, o.genSection].join(':')).sort()
const ORIENT = [['horizontal rows', false, 'horizontal'], ['vertical rows (the layout turned)', true, 'vertical']]

describe('WC — the setting', () => {
  it('WC-convert: an old value (from the outline) is the old value less the wall, never below 0; the default is 3"', () => {
    expect([clearFromOutline(6), clearFromOutline(6, 6), clearFromOutline(2), clearFromOutline(12, 3)]).toEqual([3, 0, 0, 9])
    expect([wallClearOf({ wallClearIn: 0 }), wallClearOf({ wallClearanceIn: 6 }), wallClearOf({}), WALL_CLEAR_IN]).toEqual([0, 3, 3, 3])
  })
  it('WC-shared: the Generate field and the Fill racking options bar edit the ONE Racking setting (no copy), and Generate sends it as the wall clearance', () => {
    const gen = readFileSync('src/components/Generate/GeneratePanel.jsx', 'utf8'), bar = readFileSync('src/canvas2/FillTool.jsx', 'utf8')
    expect(gen).toMatch(/const wallClearIn = useRackingSettings\(s => s\.wallClearIn\)/)
    expect(gen).toMatch(/setSetting\('wallClearIn', n\)/)
    expect(gen).toMatch(/wallClearIn:\s+Number\(wallClearIn\)/)
    expect(gen).not.toMatch(/useState\(6\)/)
    expect(bar).toMatch(/defaultValue=\{s\.wallClearIn\}/)
    expect(bar).toMatch(/s\.setSetting\('wallClearIn', n\)/)
    for (const src of [gen, bar]) expect(src).toMatch(/aria-label="Wall clearance \(in from the wall's inner face\)"/)
  })
})

describe('WC — Generate', () => {
  const brief = (o) => ({ lengthFt: 250, widthFt: 500, gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', ...o })
  const walls = (ps, vert) => ps.map(placementToObject).filter(o => o.type === 'rack_row').map(o => acrossOf(o, vert))
  it.each([['vertical', true], ['horizontal', false]])('WC-generate (%s): the default 3" from the inner face of a 3" wall is exactly the old 6" from the outline — the same placements; 0" puts the wall rows flush on the face; a 6" wall moves them out with it', (orientation, vert) => {
    const now = sizingSheetLayout(brief({ orientation, wallClearIn: 3, wallThicknessIn: 3 }), DEFAULT_RULES)
    const old = sizingSheetLayout(brief({ orientation, wallClearanceIn: 6 }), DEFAULT_RULES)
    expect(JSON.stringify(now)).toBe(JSON.stringify(old))
    const stackFt = vert ? 250 : 500
    const w = (o) => walls(sizingSheetLayout(brief({ orientation, ...o }), DEFAULT_RULES), vert)
    // the near wall row's back at outline + wall + clearance; the far one's the same from the other side
    for (const [o, off] of [[{ wallClearIn: 3, wallThicknessIn: 3 }, 0.5], [{ wallClearIn: 0, wallThicknessIn: 3 }, 0.25], [{ wallClearIn: 3, wallThicknessIn: 6 }, 0.75]]) {
      const ws = w(o), near = Math.min(...ws.map(a => a[0])), far = Math.max(...ws.map(a => a[1]))
      expect([near, stackFt - far]).toEqual([off, off])
    }
    // the run ends stay as before: 6" from the outline whatever the clearance
    const runs = (o) => sizingSheetLayout(brief({ orientation, ...o }), DEFAULT_RULES).map(placementToObject).map(r => runOf(r, vert))
    expect(Math.min(...runs({ wallClearIn: 0 }).map(r => r[0]))).toBe(0.5)
    expect(Math.min(...runs({ wallClearIn: 12 }).map(r => r[0]))).toBe(0.5)
  })
})

describe.each(ORIENT)('WC — Fill racking, %s', (_, turned, orientation) => {
  it('WC-fill: the wall rows sit the clearance off the inner face — 3" by default, 0 flush as before — and nothing moves along the run (the run ends stay)', () => {
    const a = newFill({ turned, orientation }), z = newFill({ turned, orientation, settings: { wallClearIn: 0 } })
    const vert = a.vert, [lo, hi] = faces(a.fp, vert)
    const gap = (out) => { const s = out.filter(o => o.type === 'rack_row').map(o => acrossOf(o, vert)); return [Math.min(...s.map(q => q[0])) - lo, hi - Math.max(...s.map(q => q[1]))].map(v => Math.round(v * 1e6) / 1e6) }
    expect(gap(a.out)).toEqual([0.25, 0.25])
    expect(gap(z.out)).toEqual([0, 0])
    const ends = (out) => { const r = out.filter(o => RACK.has(o.type)).map(o => runOf(o, vert)); return [Math.min(...r.map(q => q[0])), Math.max(...r.map(q => q[1]))] }
    expect(ends(a.out)).toEqual(ends(z.out))
    expect(a.area.settings.wallClearIn).toBe(3)
  })
  it('WC-shrink: at the default 3", shrink across and along, then extend back — the same racks', () => {
    const { out, box, area, vert } = newFill({ turned, orientation })
    const before = keys(out)
    for (const cut of [vert ? { w: box.w - 15.3 * GS } : { h: box.h - 15.3 * GS }, vert ? { h: box.h - 20.3 * GS } : { w: box.w - 20.3 * GS }]) {
      const back = planAreaResize(planAreaResize(out, area.id, { ...box, ...cut }, { gridSize: GS }), area.id, box, { gridSize: GS })
      expect(keys(back)).toEqual(before)
    }
  })
  it('WC-far-wall: at 3", the far edge on a wall ends with a single row at the clearance, full pairs before it, the last aisle at least the forklift aisle', () => {
    const { out, fp, vert } = newFill({ turned, orientation })
    const [, hi] = faces(fp, vert), racks = out.filter(o => RACK.has(o.type))
    const far = racks.filter(o => Math.abs(hi - 0.25 - acrossOf(o, vert)[1]) < E)
    expect(far.length).toBeGreaterThan(0)
    expect(far.every(o => o.type === 'rack_row')).toBe(true)
    // the row before it, across: full pairs, an aisle >= 10.5' between
    const farS0 = Math.min(...far.map(o => acrossOf(o, vert)[0]))
    const before = racks.filter(o => acrossOf(o, vert)[1] <= farS0 + E).reduce((m, o) => Math.max(m, acrossOf(o, vert)[1]), -Infinity)
    const prev = racks.filter(o => Math.abs(acrossOf(o, vert)[1] - before) < E)
    expect(prev.length).toBeGreaterThan(0)
    expect(prev.every(o => o.type === 'rack_double_row')).toBe(true)
    expect(farS0 - before).toBeGreaterThanOrEqual(10.5 - E)
  })
  it('WC-pocket: at 3", the pocket beside the office is opened by the cheapest lane — a lane past the office, exactly the 8\' travel width — and nothing is cut off', () => {
    // the pocket is in the layout's horizontal fill, and in the turned layout's vertical one
    const { out, fp, area } = newFill({ turned, orientation })
    const base = out.filter(o => !(RACK.has(o.type) && o.areaId === area.id)), box = { x: area.x, y: area.y, w: area.width, h: area.height }
    const report = []
    const placed = patternFill(base, box, { ...area.pattern, travelFt: 8 }, { gridSize: GS, report }).racks
    const zoneLanes = report.filter(q => q.kind === 'zone')
    expect(zoneLanes.length).toBeGreaterThan(0)
    expect(zoneLanes.some(q => Math.abs((q.at[1] - q.at[0]) / GS - 8) < 1e-6)).toBe(true)
    expect(cutOffRacks([...base, ...placed], fp, { gridSize: GS, travelFt: 8, aisleFt: 10.5 }).cutOff).toEqual([])
  })
  it('WC-wall-row: at 3", a wall row runs unbroken through the cross-aisles — one rack along its wall while the rows beside it are in sections', () => {
    const { out, vert } = newFill({ turned, orientation })
    const singles = out.filter(o => o.type === 'rack_row'), pairs = out.filter(o => o.type === 'rack_double_row')
    const [lo] = faces(newFill({ turned, orientation }).fp, vert)
    const start = singles.filter(o => Math.abs(acrossOf(o, vert)[0] - lo - 0.25) < E)
    expect(start.length).toBeGreaterThan(0)
    const pairStarts = new Set(pairs.map(o => runOf(o, vert)[0].toFixed(3)))
    expect(pairStarts.size).toBeGreaterThan(1)
    // the start wall's row spans past at least one place where the pairs beside it break (a cross-aisle)
    const r = runOf(start[0], vert)
    expect([...pairStarts].map(Number).some(p => p > r[0] + 1 && p < r[1] - 1)).toBe(true)
  })
})

describe.each(ORIENT)('WC — Row group on a 3" fill, %s', (_, turned, orientation) => {
  let store, stop
  beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore; let n = 0; stop = installRowGroupWatcher(store, () => 'g' + (++n)) })
  afterAll(() => stop && stop())
  it('WC-row-group: a row grouped across its sections and deleted in one — Apply deletes it in every section, one undo step', async () => {
    const { out } = newFill({ turned, orientation })
    const clean = JSON.parse(JSON.stringify(out))
    store.setState({ objects: clean, groups: [], selectedIds: [], activeBaySelection: [], gridSize: GS, history: [JSON.stringify({ objects: clean, groups: [] })], historyIndex: 0 })
    const pairs = clean.filter(o => o.type === 'rack_double_row')
    const rowIdx = pairs.map(o => o.rowIndex).sort((a, b) => a - b)[Math.floor(pairs.length / 2)]
    const src = pairs.find(o => o.rowIndex === rowIdx)
    const across = pairs.filter(o => o.rowIndex === rowIdx)
    expect(new Set(across.map(o => o.genSection)).size).toBeGreaterThan(1)
    clearGroup()
    expect(addRowOf(src.id, { otherSections: true })).toBeGreaterThan(1)
    const ids = store.getState().objects.filter(o => RACK.has(o.type) && o.rowIndex === rowIdx && o.genSection === src.genSection).map(o => o.id)
    store.getState().clearSelection(); store.setState({ selectedIds: ids }); store.getState().deleteSelected()
    await flushRowGroupWatcher()
    const h = store.getState().historyIndex
    expect(useRowGroup.getState().pending).toBeTruthy()
    expect(applyPending()).toBe(true)
    await flushRowGroupWatcher()
    expect(store.getState().objects.filter(o => o.type === 'rack_double_row' && o.rowIndex === rowIdx)).toEqual([])
    expect(store.getState().historyIndex).toBe(h + 1)
  })
})

describe('WC — saved layouts and the pair-half fix', () => {
  it('WC-load: a layout saved with the old 6" (Generate, from the outline) reopens showing 3"; its existing racking area shows 0" (it sat flush) and, refilled over the same box, no rack moves', async () => {
    // the Racking settings remembered the old way (the Generate field, from the outline)
    localStorage.setItem('trace.racking.v1', JSON.stringify({ orientation: 'horizontal', wallClearanceIn: 6 }))
    vi.resetModules()
    const FT = await import('../../utils/fillTool')
    expect(FT.useRackingSettings.getState().wallClearIn).toBe(3)
    expect(FT.useRackingSettings.getState().wallClearanceIn).toBeUndefined()
    localStorage.removeItem('trace.racking.v1')
    // the saved layout: the fixture with its area as saved (filled before the setting existed)
    const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
    const filled = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
    const saved = filled.find(o => o.type === 'racking_area')
    expect(saved.settings.wallClearIn).toBeUndefined()
    const back = {}
    deserializeScene(serializeScene({ objects: filled, groups: [], layers: [], gridSize: GS }), back)
    const reopened = back.objects
    const ra = reopened.find(o => o.type === 'racking_area')
    expect(areaSettings(ra).wallClearIn).toBe(0)
    const again = planAreaResize(reopened, ra.id, { x: ra.x, y: ra.y, w: ra.width, h: ra.height }, { gridSize: GS })
    expect(keys(again)).toEqual(keys(filled))
  })
  it.each(['L', 'T'])('WC-pair-half (%s, turned, horizontal rows): the half of row 2/9 beside the notch carries on from its pair\'s last frame at 42 ft — 10 bays, the shared upright kept — also at 3", where it lies on the wall', (shape) => {
    for (const settings of [{ wallClearIn: 0 }, { wallClearIn: 3 }]) {
      const { out } = newFill({ shape, turned: true, orientation: 'horizontal', settings })
      const half = out.find(o => o.type === 'rack_row' && o.genSection === 2 && o.rowIndex === 9)
      const pair = out.find(o => o.type === 'rack_double_row' && o.genSection === 2 && o.rowIndex === 9)
      expect([runOf(half, false)[0], half.beams.length]).toEqual([42, 10])
      expect(runOf(half, false)[0]).toBeCloseTo(runOf(pair, false)[1] - 0.25, 6)
    }
  })
})
