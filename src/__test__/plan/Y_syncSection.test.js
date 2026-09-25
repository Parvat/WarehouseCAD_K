// Area Y — "Sync section": every other row between the same two cross-aisles
// copies the selected row's bay pattern (beam lengths, in order along the
// run) and its start position along the run, so every upright lines up
// across the aisles. Positions across the aisles and levels don't change.
// Warnings (overlap / past the wall / a crowded cross-aisle) never block.
// One undo for the whole sync.
import { describe, it, expect, beforeAll } from 'vitest'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { uprightXs } from '../../render/rackOps'
import { anchoredResize } from '../../utils/bayAnchor'
import { DEFAULT_RULES } from '../../rules/defaults'
import { sectionRows, planSectionSync, syncWarnings } from '../../utils/syncSection'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const r6 = (v) => +v.toFixed(6)
const strip = (o) => JSON.parse(JSON.stringify(o))
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const sign = (o) => (((o.rotation || 0) % 360 + 360) % 360 >= 180 ? -1 : 1)

/** World run coordinate of every upright's centre, sorted along the run. */
function uprightsAlongRun(o) {
  const { xs, upW } = uprightXs(o, GS)
  const t = ((o.rotation || 0) * Math.PI) / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t))
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  return xs.map(x => {
    const lx = x + upW / 2 - cx
    const wx = cx + lx * c, wy = cy + lx * s
    return r6(rackFootprint(o).rotated ? wy : wx)
  }).sort((a, b) => a - b)
}
/** Beams in world order along the run (+X / +Y). */
const worldBeams = (o) => (sign(o) > 0 ? [...o.beams] : [...o.beams].reverse())

function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)

/** A generated 240 x 120 layout in a building, racks parented to it. */
function generated(orientation) {
  const brief = { lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 240 * GS, height: 120 * GS, wallThicknessFt: 0.25 }
  return [fp, ...racks]
}
/** The two sections along the run: rows sorted by stack, split by run start. */
function sections(objects) {
  const racks = objects.filter(o => o.type === 'rack_double_row' || o.type === 'rack_row')
  const starts = [...new Set(racks.map(r => r6(runOf(rackFootprint(r))[0])))].sort((a, b) => a - b)
  return starts.map(s => racks.filter(r => r6(runOf(rackFootprint(r))[0]) === s))
}

/** Disturb section A so there's something to sync: other rows get shifted,
 *  shortened, re-beamed; the source gets its own pattern (same length). */
function disturb(objects, secA, sourceId) {
  const d = new Map()
  const src = secA.find(r => r.id === sourceId)
  const pat = [...src.beams]; pat[1] = 72; pat[3] = 120
  d.set(sourceId, { beams: pat })
  secA.filter(r => r.id !== sourceId).forEach((r, i) => {
    const f = rackFootprint(r)
    if (i % 3 === 0) d.set(r.id, f.rotated ? { y: r.y + 80 } : { x: r.x + 80 })                                      // shifted 2'
    if (i % 3 === 1) { const beams = r.beams.slice(0, -2); d.set(r.id, { beams, width: ((3 * (beams.length + 1) + 96 * beams.length) / 12) * GS }) }  // 2 bays shorter
    if (i % 3 === 2) d.set(r.id, { beams: r.beams.map((b, k) => (k === 0 ? 144 : b)).slice(0, -1) })                // re-beamed, same count - 1
  })
  return objects.map(o => (d.has(o.id) ? { ...o, ...d.get(o.id) } : o))
}

describe('Y — Sync section', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`Y-sync ${orientation}: every row in the section gets the source's beams and start, uprights aligned; across-aisle positions, levels kept; other section untouched; one undo`, () => {
      const base = generated(orientation)
      const [secA0, secB0] = sections(base)
      const source = secA0[Math.floor(secA0.length / 2)].id
      const start = disturb(base, secA0, source)
      load(start)
      const src = get(source)
      const rows = sectionRows(objs(), source)
      expect(rows.map(r => r.id).sort()).toEqual(secA0.map(r => r.id).sort())
      const before = strip(objs())
      const res = Panel.applySectionSync(store.getState, source)
      expect(res.synced).toBe(secA0.length - 1)
      expect(res.warnings).toEqual([])
      const srcUp = uprightsAlongRun(src), srcRun = runOf(rackFootprint(src))
      for (const r of secA0) {
        const now = get(r.id), was = before.find(o => o.id === r.id)
        expect(worldBeams(now)).toEqual(worldBeams(src))
        expect(runOf(rackFootprint(now)).map(r6)).toEqual(srcRun.map(r6))
        expect(uprightsAlongRun(now)).toEqual(srcUp)
        expect(crossOf(rackFootprint(now)).map(r6)).toEqual(crossOf(rackFootprint(was)).map(r6))
        expect([now.height, now.levels, now.rotation, now.type]).toEqual([was.height, was.levels, was.rotation, was.type])
      }
      for (const r of secB0) expect(get(r.id)).toEqual(before.find(o => o.id === r.id))
      expect(get('fp')).toEqual(before.find(o => o.id === 'fp'))
      store.getState().undo()
      expect(strip(objs())).toEqual(strip(start))
    })

    it(`Y-warn ${orientation}: a rack in a synced row's way (overlap), a neighbour pushed into the cross-aisle, the source past the wall -> those rows listed; the sync still applies`, () => {
      const base = generated(orientation)
      const [secA0, secB0] = sections(base)
      const source = secA0[Math.floor(secA0.length / 2)].id
      const others = secA0.filter(r => r.id !== source)
      const kOverlap = others[0], kCross = others[others.length - 1]
      // 1) kOverlap is two bays short; a lane rack sits in the freed stretch
      const fo = rackFootprint(kOverlap)
      const shortBeams = kOverlap.beams.slice(0, -2)
      const shortW = ((3 * (shortBeams.length + 1) + 96 * shortBeams.length) / 12) * GS
      const obsLen = 200, obsAt = runOf(fo)[0] + shortW + 20
      const [c0, c1] = crossOf(fo)
      const obs = fo.rotated
        ? { id: 'obs', type: 'rack_pushback', x: c0, y: obsAt, width: c1 - c0, height: obsLen }
        : { id: 'obs', type: 'rack_pushback', x: obsAt, y: c0, width: obsLen, height: c1 - c0 }
      // 2) kCross's neighbour across the cross-aisle moved 3' toward it
      const nb = secB0.find(r => { const [a, b] = crossOf(rackFootprint(r)); const [c, d] = crossOf(rackFootprint(kCross)); return a < d && b > c })
      const nbMoved = rackFootprint(nb).rotated ? { ...nb, y: nb.y - 120 } : { ...nb, x: nb.x - 120 }
      const start = base.map(o => (o.id === kOverlap.id ? { ...o, beams: shortBeams, width: shortW, ...anchoredResize(o, { width: shortW }, { x: 'start' }) } : o.id === nb.id ? nbMoved : o)).concat([obs])
      load(start)
      const src = get(source)
      const srcGap = runOf(rackFootprint(nb))[0] - runOf(rackFootprint(src))[1]    // the cross-aisle as generated (px)
      const res = Panel.applySectionSync(store.getState, source)
      const byId = Object.fromEntries(res.warnings.map(w => [w.id, w]))
      expect(Object.keys(byId).sort()).toEqual([kOverlap.id, kCross.id].sort())
      expect(byId[kOverlap.id].overlaps).toEqual(['obs'])
      expect(byId[kCross.id].crossAisleFt).toBe(Math.round(((srcGap - 120) / GS) * 100) / 100)
      expect(byId[kOverlap.id].row).toBe(sectionRows(start, source).findIndex(r => r.id === kOverlap.id) + 1)
      for (const r of secA0) expect(worldBeams(get(r.id))).toEqual(worldBeams(src))   // not blocked
      store.getState().undo()
      expect(strip(objs())).toEqual(strip(start))

      // 3) the source gets a 16' bay at the far end of section B -> past the wall; every other row listed
      const secB = sections(base)[1]
      const sB = secB[Math.floor(secB.length / 2)]
      const farEnd = sign(sB) > 0
      const beams = farEnd ? [...sB.beams, 192] : [192, ...sB.beams]
      const w = ((3 * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * GS
      // grow at the far end of the run, the near end held where it is drawn
      const sBlong = { ...sB, beams, width: w, ...anchoredResize(sB, { width: w }, { x: farEnd ? 'start' : 'end' }) }
      const load2 = base.map(o => (o.id === sB.id ? sBlong : o))
      load(load2)
      const endGapIn = (() => { const f = rackFootprint(sB); const far = f.rotated ? 120 * GS - 0.25 * GS : 240 * GS - 0.25 * GS; return ((far - runOf(f)[1]) / GS) * 12 })()
      const res2 = Panel.applySectionSync(store.getState, sB.id)
      expect(res2.warnings.map(x => x.id).sort()).toEqual(secB.filter(r => r.id !== sB.id).map(r => r.id).sort())
      for (const x of res2.warnings) expect(x.wallOutIn).toBe(Math.round((195 - endGapIn) * 100) / 100)
    })
  }

  /* Rows drawn the other way round (180° / 270°) in the same section: they
   * get the beams reversed so the WORLD pattern and every upright match. */
  for (const [rot, flip] of [[0, 180], [90, 270]]) {
    it(`Y-direction ${rot}°/${flip}° (${rot ? 'vertical' : 'horizontal'}): a row drawn reversed gets the reversed list; uprights aligned; one undo`, () => {
      const along = rot === 90
      const mk = (id, rotation, beams, cross, runStart) => {
        const width = ((3 * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * GS, height = 310
        const runMid = runStart + width / 2
        const cx = along ? cross : runMid, cy = along ? runMid : cross
        return { id, type: 'rack_double_row', x: cx - width / 2, y: cy - height / 2, width, height, beams, uprightWidth: 3, rotation, levels: 4 }
      }
      const a = mk('a', rot, [72, 96, 120, 144], 1000, 400)
      const b = mk('b', flip, [96, 96, 96, 96, 96], 1500, 520)
      const c = mk('c', rot, [96, 96], 2000, 300)
      load([a, b, c])
      Panel.applySectionSync(store.getState, 'a')
      expect(get('b').beams).toEqual([144, 120, 96, 72])
      expect(get('c').beams).toEqual([72, 96, 120, 144])
      expect(uprightsAlongRun(get('b'))).toEqual(uprightsAlongRun(a))
      expect(uprightsAlongRun(get('c'))).toEqual(uprightsAlongRun(a))
      store.getState().undo()
      expect(strip(objs())).toEqual(strip([a, b, c]))
    })
  }

  it('Y-panel: the rack panel shows "Sync section (N other rows)"; a row alone in its section gets a disabled button', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const base = generated('horizontal')
    const [secA] = sections(base)
    load(base)
    Object.assign(store.getInitialState(), store.getState())
    const html = renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: secA[0] }))
    expect(html).toContain(`Sync section (${secA.length - 1} other rows)`)
    const lone = { id: 'lone', type: 'rack_row', x: 0, y: 0, width: 1000, height: 140, beams: [96, 96, 96], uprightWidth: 3 }
    load([lone])
    Object.assign(store.getInitialState(), store.getState())
    const html2 = renderToStaticMarkup(createElement(Panel.RackRowPanel, { obj: lone }))
    expect(html2).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Sync section"|<button[^>]*aria-label="Sync section"[^>]*disabled=""/)
  })
})
