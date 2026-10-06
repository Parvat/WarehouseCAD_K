// Area BL — the bay ledger (utils/bayLedger.js): an overlap never counts twice in the pallet / bay totals,
// however it happened. A bay more than half covered by a bay of another rack is counted once (the rack
// placed first keeps it when two cover each other); half a bay or less counts both; Check layout still
// reports the overlap. The capacity headline, usable, Generate's and the fill's totals and the rack panel
// all read it; a future BOM reads its frames. On the hand-check layout as saved (vertical) and turned.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { getLayoutCapacity, getRackCapacity } from '../../utils/capacity'
import { usableCapacity, runColumnCheck } from '../../generate/usableCapacity'
import { checkLayout } from '../../utils/layoutCheck'
import { bayLedger } from '../../utils/bayLedger'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const BEAM = new Set(['rack_row', 'rack_double_row'])
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
function savedFill(vert) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })), area = objs.find(o => o.type === 'racking_area')
  const out = planAreaResize(objs, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
  if (vert) return out
  return out.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
}
const pitch = (99 / 12) * GS, up = (3 / 12) * GS
/** A rack like `src` with `n` 96" bays, its run starting at `r0` and its near side across at `s0` (world px), `depth` px deep. */
const like = (src, id, n, r0, s0, depth = src.height, type = src.type) => {
  const vert = rackFootprint(src).rotated, w = n * pitch + up
  const base = { ...src, id, type, beams: Array(n).fill(96), width: w, height: depth }
  delete base.rowIndex; delete base.genSection; delete base.areaId
  return vert ? { ...base, x: s0 + depth / 2 - w / 2, y: r0 + w / 2 - depth / 2 } : { ...base, x: r0, y: s0 }
}
const geo = (o) => { const f = rackFootprint(o); return f.rotated ? { r0: f.y, r1: f.y + f.h, s0: f.x, s1: f.x + f.w } : { r0: f.x, r1: f.x + f.w, s0: f.y, s1: f.y + f.h } }
const totals = (objs) => { const L = bayLedger(objs, GS); return { bays: L.bays, positions: getLayoutCapacity(objs, undefined, L).total, uncounted: L.uncountedBays, racks: L.rackCount, usable: usableCapacity(objs, { gridSize: GS, ledger: L }).usable, L } }

describe.each([['vertical', true], ['horizontal', false]])('BL — %s', (_, vert) => {
  const base = savedFill(vert)
  const t0 = totals(base)
  const r27 = base.find(o => o.genSection === 2 && o.rowIndex === 7 && o.type === 'rack_double_row')
  const g27 = geo(r27)

  it('BL-base: the layout as saved has no overlap — the ledger counts every bay, the same total as summing each rack', () => {
    expect(t0.uncounted).toBe(0)
    expect(t0.positions).toBe(base.reduce((t, o) => t + (getRackCapacity(o)?.total || 0), 0))
    expect(t0.bays).toBe(base.filter(o => BEAM.has(o.type)).reduce((t, o) => t + o.beams.length, 0))
  })

  it('BL-copy: a copy of row 7 (section 2) exactly on top → +0 bays, +0 positions, usable unchanged; the original (placed first) keeps its bays, the copy\'s 14 are not counted; Check layout still reports the overlap', () => {
    const objs = [...base, { ...r27, id: 'copy' }]
    const t = totals(objs)
    expect([t.bays - t0.bays, t.positions - t0.positions, t.usable - t0.usable, t.racks - t0.racks]).toEqual([0, 0, 0, 0])
    expect(t.uncounted).toBe(14)
    expect(t.L.racks.get(r27.id).uncounted).toBe(0)
    expect(t.L.racks.get('copy')).toMatchObject({ uncounted: 14, positions: 0, bays: 0 })
    expect(checkLayout(objs, { gridSize: GS }).errors.some(e => e.kind === 'overlap' && e.ids.includes('copy'))).toBe(true)
  })

  it('BL-one-bay: a 3-bay copy overlapping row 7 by one bay → +2 bays, +2 bays\' positions; that bay counted once (on row 7)', () => {
    const c = like(r27, 'c3', 3, g27.r1 - pitch - up, g27.s0)
    const objs = [...base, c]
    const t = totals(objs)
    expect(t.bays - t0.bays).toBe(2)
    expect(t.positions - t0.positions).toBe(2 * getRackCapacity({ ...r27, beams: [96] }).total)
    expect(t.L.racks.get('c3').uncounted).toBe(1)
    expect(t.L.racks.get(r27.id).uncounted).toBe(0)
  })

  it('BL-half-pair: a single standing on one half of row 7\'s first bay → counted once: +0 bays, +0 positions (the single\'s bay is fully covered, the pair\'s only half)', () => {
    const half = (42 / 12) * GS
    const s = like(r27, 's1', 1, g27.r0, g27.s0, half, 'rack_row')
    const t = totals([...base, s])
    expect([t.bays - t0.bays, t.positions - t0.positions]).toEqual([0, 0])
    expect(t.L.racks.get('s1').uncounted).toBe(1)
    expect(t.L.racks.get(r27.id).uncounted).toBe(0)
  })

  it('BL-half-bay: a 3-bay copy overlapping row 7 by exactly half a bay counts both (+3 bays); by a little more than half, the bay counts once (+2)', () => {
    const halfBay = pitch / 2 + up / 2
    for (const [over, addBays] of [[halfBay, 3], [halfBay + 0.05 * GS, 2]]) {
      const c = like(r27, 'ch', 3, g27.r1 - over, g27.s0)
      const t = totals([...base, c])
      expect(t.bays - t0.bays, String(over)).toBe(addBays)
    }
  })

  it('BL-usable: usable never exceeds the total — with a copy on a rack that loses positions to columns, those losses aren\'t taken off twice (or taken off the copy)', () => {
    const res = runColumnCheck(base, { gridSize: GS })
    const lossy = base.find(o => BEAM.has(o.type) && [...res.rackConflicts, ...res.pickBlocks].some(c => c.rackId === o.id))
    expect(lossy).toBeTruthy()
    for (const objs of [base, [...base, { ...lossy, id: 'lossy-copy' }], [...base, { ...r27, id: 'copy' }]]) {
      const t = totals(objs)
      expect(t.usable).toBeLessThanOrEqual(t.positions)
    }
    const t = totals([...base, { ...lossy, id: 'lossy-copy' }])
    expect([t.positions, t.usable]).toEqual([t0.positions, t0.usable])
  })

  it('BL-frames: for a future BOM — a bay not counted has no beams; a frame counts when it bounds a counted bay of its rack', () => {
    const c = like(r27, 'c3', 3, g27.r1 - pitch - up, g27.s0)
    const e = totals([...base, c]).L.racks.get('c3')
    // its first bay (along the run) is row 7's last: not counted; the frame between it and the next counts
    const firstAlong = ((c.rotation % 360) + 360) % 360 >= 180 ? c.beams.length - 1 : 0         // a 180° / 270° rack counts its bays from the other end
    expect(e.counted[firstAlong]).toBe(false)
    expect(e.frames.filter(Boolean).length).toBe(3)                               // 4 frames, the outer one of the uncounted bay not counted
    const full = totals([...base, { ...r27, id: 'copy' }]).L.racks.get('copy')
    expect(full.frames.every(f => !f)).toBe(true)
  })

  it('BL-panel: the rack panel shows a rack\'s capacity as counted, with "N bays overlap another rack — not counted"', () => {
    const c = like(r27, 'c3', 3, g27.r1 - pitch - up, g27.s0)
    store.setState({ objects: [...base, c], gridSize: GS })
    Object.assign(store.getInitialState(), store.getState())
    const html = renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: c }))
    expect(html).toContain(`${2 * getRackCapacity({ ...r27, beams: [96] }).total} PAL`)
    expect(html).toContain('1 bay overlap another rack — not counted')
    const plain = renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: r27 }))
    expect(plain).not.toContain('overlap another rack')
  })
})

describe('BL-wire', () => {
  it('BL-cache: the ledger is worked out again only when a rack changes — the same objects, or a change to anything else, give the same ledger; the panels hold it during a drag', () => {
    const base = savedFill(true)
    const a = bayLedger(base, GS)
    expect(bayLedger(base, GS)).toBe(a)
    const zoneMoved = base.map(o => (o.type === 'zone_office' ? { ...o, x: o.x + 40 } : o))
    expect(bayLedger(zoneMoved, GS)).toBe(a)
    const rackMoved = base.map((o, i) => (i === base.findIndex(q => q.type === 'rack_double_row') ? { ...o, x: o.x + 40 } : o))
    expect(bayLedger(rackMoved, GS)).not.toBe(a)
    const hook = readFileSync('src/components/RightPanel/useBayLedger.js', 'utf8')
    expect(hook).toMatch(/if \(dragging && held\.current\) return held\.current/)
    for (const f of ['src/components/RightPanel/PropertiesPanel.jsx', 'src/components/RightPanel/panels/RackRowPanelCore.jsx']) expect(readFileSync(f, 'utf8')).toMatch(/useBayLedger\(objects, gridSize/)
    expect(readFileSync('src/components/RightPanel/PropertiesPanel.jsx', 'utf8')).toMatch(/overlapping bay\{layoutCap\.uncountedBays === 1 \? '' : 's'\} not counted/)
  })
})
