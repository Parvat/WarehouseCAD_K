// Area PB — the shared pairing section by section (BUG 77): neighbourPairs builds its sections from the
// double rows (a cross-aisle splits them; a wall row running past several sections can't merge them), every
// rack joins each section it overlaps, and within a section each line pairs with the next across, as before.
// Untouched layouts pair exactly as before (the frozen copy, reference/neighbourPairs.v1.js); a row deleted in
// one section leaves its neighbours there paired across the wide aisle. The fixture's four fills, four
// Generate layouts, AR's layout with its wall rows unbroken (as BUG 70 makes them), both orientations.
import { describe, it, expect } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize, planAreaCreate } from '../../generate/rackingArea'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { neighbourPairs } from '../../generate/rowAisles'
import { neighbourPairs as neighbourPairsV1 } from './reference/neighbourPairs.v1'
import { generateAndPlace, placementToObject } from '../../generate/traceGenerate'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { checkLayout } from '../../utils/layoutCheck'
import { DEFAULT_RULES } from '../../rules/defaults'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

const BEAM = new Set(['rack_row', 'rack_double_row'])
const beams = (objs) => objs.filter(o => BEAM.has(o.type) && ((o.rotation || 0) % 90) === 0)
const keys = (res) => [...res.pairs.keys()].sort()
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
function fillOf(turned, orientation, stored) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
async function generated(spec) {
  const store = (await import('../../store/useCanvasStore')).useCanvasStore
  store.setState({ objects: [], groups: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace({ gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', dockDoors: 0, ...spec })
  return store.getState().objects
}
const across = (o) => { const f = rackFootprint(o); return f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
const widthFt = (a, b) => (Math.max(across(a)[0], across(b)[0]) - Math.min(across(a)[1], across(b)[1])) / GS
const pairOf = (a, b) => [a.id, b.id].sort().join('|')
const FILLS = [
  ['as saved, vertical', false, 'vertical', true, 56],
  ['as saved, horizontal', false, 'horizontal', false, 54],
  ['turned, vertical', true, 'vertical', false, 54],
  ['turned, horizontal', true, 'horizontal', false, 55],
]

describe('PB-untouched', () => {
  it.each(FILLS)('PB-untouched (fill %s): exactly the pairs of before (%#)', (_, turned, orientation, stored, n) => {
    const b = beams(fillOf(turned, orientation, stored))
    expect(keys(neighbourPairs(b))).toEqual(keys(neighbourPairsV1(b)))
    expect(neighbourPairs(b).pairs.size).toBe(n)
  })
  it.each([
    ['250x500 vertical', { lengthFt: 250, widthFt: 500, orientation: 'vertical' }, 48],
    ['500x250 horizontal', { lengthFt: 500, widthFt: 250, orientation: 'horizontal' }, 48],
    ['300x420 vertical', { lengthFt: 300, widthFt: 420, orientation: 'vertical' }, 45],
    ['420x300 horizontal', { lengthFt: 420, widthFt: 300, orientation: 'horizontal' }, 45],
  ])('PB-untouched (Generate %s): exactly the pairs of before', async (_, spec, n) => {
    const b = beams(await generated(spec))
    expect(keys(neighbourPairs(b))).toEqual(keys(neighbourPairsV1(b)))
    expect(neighbourPairs(b).pairs.size).toBe(n)
  })
})

describe('PB-delete', () => {
  it.each([
    ['as saved, vertical', 14, 30, false, 'vertical', true],
    ['as saved, horizontal', 8, 28.75, false, 'horizontal', false],
  ])('PB-delete (fill %s): row 2/%s deleted — its neighbours in section 2 pair across the wide aisle (%s ft): a width label, no Check layout aisle item (wider than the pick width); nothing else changes', (_, row, w, turned, orientation, stored) => {
    const out = fillOf(turned, orientation, stored)
    const after = out.filter(o => !(BEAM.has(o.type) && o.genSection === 2 && o.rowIndex === row))
    const A = after.find(o => o.type === 'rack_double_row' && o.genSection === 2 && o.rowIndex === row - 1)
    const C = after.find(o => o.type === 'rack_double_row' && o.genSection === 2 && o.rowIndex === row + 1)
    const now = neighbourPairs(beams(after)), before = neighbourPairsV1(beams(after))
    expect(keys(now).filter(k => !before.pairs.has(k))).toEqual([pairOf(A, C)])
    expect(keys(before).filter(k => !now.pairs.has(k))).toEqual([])
    expect(widthFt(A, C)).toBeCloseTo(w, 6)
    const labels = rebuildAisles(after, (() => { let n = 0; return () => 'x' + (++n) })()).objects.filter(o => o.type === 'aisle')
    expect(labels.some(a => [a.row1Id, a.row2Id].sort().join('|') === pairOf(A, C))).toBe(true)
    expect(checkLayout(after, { gridSize: GS, profile: MHE_PROFILES.reach }).errors.concat(checkLayout(after, { gridSize: GS, profile: MHE_PROFILES.reach }).warnings)
      .filter(e => (e.kind === 'aisle-pick' || e.kind === 'aisle-drive') && e.ids.includes(A.id) && e.ids.includes(C.id))).toEqual([])
  })
})

/** AR's layout (240 × 120, two sections) with each wall single made one rack along the whole run, as BUG 70
 *  makes Generate's — the layout where a wall row runs past both sections. */
function arUnbroken(orientation) {
  const brief = { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', ...(orientation === 'vertical' ? { maxRunFt: 100 } : {}) }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const byStack = new Map(), stackFt = orientation === 'vertical' ? 240 : 120
  // the single rows 6" off a wall (not an interior single by the far wall)
  const onWall = (o) => Math.abs(across(o)[0] / GS - 0.5) < 1e-6 || Math.abs(across(o)[1] / GS - (stackFt - 0.5)) < 1e-6
  for (const o of racks.filter(o => o.type === 'rack_row' && onWall(o))) { const k = Math.round(across(o)[0] * 100); if (!byStack.has(k)) byStack.set(k, []); byStack.get(k).push(o) }
  const drop = new Set(), add = []
  for (const list of byStack.values()) {
    if (list.length < 2) continue
    const run = (o) => { const f = rackFootprint(o); return f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
    const s = [...list].sort((a, b) => run(a)[0] - run(b)[0]), first = s[0], f0 = rackFootprint(first)
    const lo = run(first)[0], hi = run(s[s.length - 1])[1]
    const n = Math.floor(((hi - lo) / GS - 0.25) / 8.25), len = ((3 * (n + 1) + 96 * n) / 12) * GS
    add.push(f0.rotated ? { ...first, id: first.id + 'w', beams: Array(n).fill(96), x: f0.x + f0.w / 2 - len / 2, y: lo + len / 2 - f0.w / 2, width: len, genSection: 1 }
      : { ...first, id: first.id + 'w', beams: Array(n).fill(96), width: len, genSection: 1 })
    for (const o of s) drop.add(o.id)
  }
  return [...racks.filter(o => !drop.has(o.id)), ...add]
}

describe.each([['horizontal', 30.25], ['vertical', 29.75]])('PB — %s', (orientation, w) => {
  it('PB-wall: a wall row running past both sections pairs with the first row of each section; with row 2/4 deleted, rows 2/3 and 2/5 pair across the wide aisle — where the old pairing, merging both sections through the wall row, left them unpaired', () => {
    const racks = arUnbroken(orientation)
    const walls = racks.filter(o => o.type === 'rack_row' && o.id.endsWith('w'))
    expect(walls.length).toBe(2)
    const now = neighbourPairs(racks)
    for (const sec of [1, 2]) {
      const rows = racks.filter(o => o.type === 'rack_double_row' && o.genSection === sec)
      const first = rows.reduce((m, o) => (o.rowIndex < m.rowIndex ? o : m)), last = rows.reduce((m, o) => (o.rowIndex > m.rowIndex ? o : m))
      const near = walls.reduce((m, o) => (Math.abs(across(o)[0] - across(first)[0]) < Math.abs(across(m)[0] - across(first)[0]) ? o : m))
      expect(now.pairs.has(pairOf(near, first)), `the wall row and section ${sec}'s first row`).toBe(true)
      void last
    }
    const B = racks.find(o => o.genSection === 2 && o.rowIndex === 4 && o.type === 'rack_double_row')
    const A = racks.find(o => o.genSection === 2 && o.rowIndex === 3), C = racks.find(o => o.genSection === 2 && o.rowIndex === 5)
    const after = racks.filter(o => o !== B)
    expect(neighbourPairs(after).pairs.has(pairOf(A, C))).toBe(true)
    expect(neighbourPairsV1(after).pairs.has(pairOf(A, C))).toBe(false)
    expect(widthFt(A, C)).toBeCloseTo(w, 6)
    // and untouched (nothing deleted), this layout too pairs as before
    expect(keys(now)).toEqual(keys(neighbourPairsV1(racks)))
  })
  it('PB-hand: a building with no double rows (single rows only) pairs as before', () => {
    const singles = sizingSheetLayout({ lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_row' }, DEFAULT_RULES)
      .map((p, i) => ({ ...placementToObject(p), id: 's' + i, parentId: 'fp' }))
    expect(singles.every(o => o.type === 'rack_row')).toBe(true)
    const now = neighbourPairs(singles)
    expect(now.pairs.size).toBeGreaterThan(5)
    expect(keys(now)).toEqual(keys(neighbourPairsV1(singles)))
  })
})
