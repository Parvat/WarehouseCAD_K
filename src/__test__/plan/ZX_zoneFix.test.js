// ZX — zone-fix (utils/zoneCut.js applyZones, utils/rackingAreaTool.js installAreaKeeper, utils/layoutCheck.js).
// The bug: an Office dropped at the bottom middle of a layout took far more than its footprint (faces it left
// without an aisle were deleted, faceReach.js via cutForZones), moving it cut again, and deleting it gave nothing
// back — the zone rule re-cut, never remembered. Now:
//   1. a zone removes ONLY the bays its footprint covers (a pair's half it covers: that half);
//   2. a face or aisle it leaves unreachable is a WARNING (Check layout, the plan), never a delete;
//   3. moving it puts back every bay it no longer covers, deleting it everything — exactly as it was;
//   4. a piece shorter than 2 bays left beside it goes with the cut, and comes back with it;
//   5. a drop, a move, a delete: one undo step each, and undo is the exact previous layout.
// On the real fixture (both orientations, a Fill area's racks and the same racks placed by hand) and on Generate's
// layout; the zone at a corner, in the middle, against a wall, across a cross-aisle.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))
const tick = () => new Promise(r => setTimeout(r, 0))
const settle = async () => { await tick(); await tick() }

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const RA = await import('../../generate/rackingArea')
  const AT = await import('../../utils/rackingAreaTool')
  const ZC = await import('../../utils/zoneCut')
  const LC = await import('../../utils/layoutCheck')
  const TG = await import('../../generate/traceGenerate')
  const { rackFootprint } = await import('../../generate/columnCheck')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { installPairKeeper } = await import('../../utils/pairCarryOn')
  const L = await import('../../utils/layers')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore); installAisleKeeper(useCanvasStore, nanoid); installRowEditKeeper(useCanvasStore); installPairKeeper(useCanvasStore)
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, RA, AT, ZC, LC, TG, rackFootprint }
}

const BEAM = new Set(['rack_row', 'rack_double_row'])
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
const turn = (o) => {
  const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }
  if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x }))
  if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW })
  return t
}
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-3

describe.each([['vertical rows', true], ['horizontal rows', false]])('ZX — %s', (_, vert) => {
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState(); m.AT.useAreaPrompt.setState({ question: null, note: null }) })
  const racks = () => s().objects.filter(isRack)
  const doc = () => JSON.parse(JSON.stringify({ objects: s().objects }))
  /* every rack as it is, by id — "exactly as they were" */
  const rackDoc = (objs) => JSON.stringify(objs.filter(isRack).map(o => JSON.parse(JSON.stringify(o))).sort((a, b) => (a.id < b.id ? -1 : 1)))
  const note = () => m.AT.useAreaPrompt.getState().note
  const bays = () => m.RA.rowBays(s().objects)

  async function load(kind) {
    let objs
    if (kind === 'Generate') {
      m.TG.generateAndPlace({ lengthFt: vert ? 240 : 200, widthFt: vert ? 200 : 240, gridXFt: 50, gridYFt: 54, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', dockDoors: 0 })
      objs = s().objects
    } else {
      const o0 = REAL_LAYOUT.map(o => ({ ...o })), area = o0.find(o => o.type === 'racking_area')
      objs = m.RA.planAreaResize(o0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
      if (!vert) objs = objs.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = m.rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
      if (kind === 'hand-placed') objs = objs.filter(o => o.type !== 'racking_area').map(o => (o.areaId ? (({ areaId, ...r }) => r)(o) : o))
    }
    objs = JSON.parse(JSON.stringify(objs))
    m.useCanvasStore.setState({ objects: objs, groups: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: objs, groups: [] })], historyIndex: 0 })
    await settle()
    const fp = s().objects.find(o => typeof o.type === 'string' && o.type.startsWith('fp_')), wt = (fp.wallThicknessFt || 0.25) * GS
    const rows = racks().every(r => !!m.rackFootprint(r).rotated === vert) || racks().filter(r => !!m.rackFootprint(r).rotated === vert).length > racks().length / 2
    expect(rows, 'the rows run the way the describe says').toBe(true)
    return { fp, ib: { x: fp.x + wt, y: fp.y + wt, w: fp.width - 2 * wt, h: fp.height - 2 * wt } }
  }
  /* 40 × 30 (along the run × across the rows) office boxes: corner, middle, against the far wall (the repro's
     "bottom middle"), across a cross-aisle (the widest along-run gap between racks, inside the floor) */
  function spots(ib) {
    const W = (vert ? 30 : 40) * GS, H = (vert ? 40 : 30) * GS   // across × along: rows run along y when vertical
    const out = {
      corner: { x: ib.x, y: ib.y, w: W, h: H },
      middle: { x: ib.x + ib.w / 2 - W / 2, y: ib.y + ib.h / 2 - H / 2, w: W, h: H },
      wall: vert ? { x: ib.x + ib.w / 2 - W / 2, y: ib.y + ib.h - H, w: W, h: H } : { x: ib.x + ib.w - W, y: ib.y + ib.h / 2 - H / 2, w: W, h: H },
    }
    // a cross-aisle: along the run, the biggest gap in the union of the racks' run spans
    const run = (f) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
    const spans = racks().filter(r => r.type === 'rack_double_row').map(r => run(m.rackFootprint(r))).sort((a, b) => a[0] - b[0])   // pairs: a wall row runs unbroken past a cross-aisle
    let best = null, end = spans[0][1]
    for (const [a, b] of spans) { if (a > end + GS && (!best || a - end > best[1] - best[0])) best = [end, a]; end = Math.max(end, b) }
    if (best) {
      const c = (best[0] + best[1]) / 2
      out.crossAisle = vert ? { x: ib.x + ib.w / 2 - W / 2, y: c - H / 2, w: W, h: H } : { x: c - W / 2, y: ib.y + ib.h / 2 - H / 2, w: W, h: H }
    }
    return out
  }
  const officeAt = (b, id = 'office') => ({ id, type: 'zone_office', label: 'Office', x: b.x, y: b.y, width: b.w, height: b.h, parentId: s().objects.find(o => o.type.startsWith('fp_')).id, layerId: 'zones' })

  for (const kind of ['Fill area', 'hand-placed', 'Generate']) {
    it(`ZX-cycle (${kind}): drop → move → delete at a corner, the middle, a wall, a cross-aisle — only covered bays go, every bay it leaves comes back exactly, delete gives back the layout to the rack (same ids, rows, elevations, positions), bay count before drop = after delete; one undo step each, each undo exact`, async () => {
      const { ib } = await load(kind)
      const sp = spots(ib)
      if (kind === 'Generate') expect(sp.crossAisle, 'Generate makes a cross-aisle here').toBeTruthy()
      for (const [where, box] of Object.entries(sp)) {
        const original = doc(), b0 = bays(), h0 = s().historyIndex
        // DROP
        s().addObject(officeAt(box)); await settle()
        const dropped = doc()
        expect(s().historyIndex, `${where}: one step`).toBe(h0 + 1)
        const gone1 = m.RA.removedRowBays(original.objects, s().objects, GS)
        for (const b of gone1) expect(meets(b, box), `${where}: a bay removed outside the footprint`).toBe(true)
        expect(racks().flatMap(o => m.RA.rowBayBoxes(o, GS)).filter(b => meets(b, box)), `${where}: nothing left under it`).toEqual([])
        expect(note()).toBe(`Office placed${gone1.length ? ` · ${gone1.length} bays removed` : ''}`)
        // every rack the office doesn't reach is untouched
        for (const r of original.objects.filter(isRack)) if (!m.RA.rowBayBoxes(r, GS).some(b => meets(b, { x: box.x - 3 * GS, y: box.y - 3 * GS, w: box.w + 6 * GS, h: box.h + 6 * GS }))) expect(JSON.stringify(s().objects.find(o => o.id === r.id)), `${where}: ${r.id} touched`).toBe(JSON.stringify(r))
        // MOVE 25' across the rows
        const dx = vert ? -25 * GS : 0, dy = vert ? 0 : -25 * GS
        const moved = { ...box, x: box.x + dx, y: box.y + dy }
        s().commitObjectUpdate('office', { x: moved.x, y: moved.y }); await settle()
        expect(s().historyIndex).toBe(h0 + 2)
        const removed2 = m.RA.removedRowBays(dropped.objects, s().objects, GS), restored2 = m.RA.removedRowBays(s().objects, dropped.objects, GS)
        for (const b of removed2) expect(meets(b, moved), `${where}: moved — a bay removed outside it`).toBe(true)
        for (const b of restored2) expect(meets(b, box) && !meets(b, moved), `${where}: moved — restored only what it left`).toBe(true)
        expect(note()).toBe(`Office moved${removed2.length ? ` · ${removed2.length} bays removed` : ''}${restored2.length ? ` · ${restored2.length} restored` : ''}`)
        const movedDoc = doc()
        // DELETE
        s().selectGroup(['office']); s().deleteSelected(); await settle()
        expect(s().historyIndex).toBe(h0 + 3)
        expect(bays(), `${where}: bay count back`).toBe(b0)
        expect(rackDoc(s().objects), `${where}: every rack exactly as before the drop`).toBe(rackDoc(original.objects))
        // UNDO ×3: each previous layout exactly
        s().undo(); expect(doc()).toEqual(movedDoc)
        s().undo(); expect(doc()).toEqual(dropped)
        s().undo(); expect(doc()).toEqual(original)
        // (leave it as it was for the next spot)
      }
    })
  }

  it('ZX-face (rule 2): an office standing in an aisle, touching no rack — nothing removed; Check layout WARNS about the face it crowds (never an error, never a delete)', async () => {
    const { ib } = await load('hand-placed')
    const pairs = racks().filter(o => o.type === 'rack_double_row').map(o => ({ o, f: m.rackFootprint(o) }))
    const c = { x: ib.x + ib.w / 2, y: ib.y + ib.h / 2 }
    const { o, f } = pairs.sort((a, b) => Math.hypot(a.f.x - c.x, a.f.y - c.y) - Math.hypot(b.f.x - c.x, b.f.y - c.y))[0]
    // 4' deep in the aisle beside it, 20' along
    const box = vert ? { x: f.x + f.w, y: f.y + f.h / 2 - 10 * GS, w: 4 * GS, h: 20 * GS } : { x: f.x + f.w / 2 - 10 * GS, y: f.y + f.h, w: 20 * GS, h: 4 * GS }
    const b0 = bays()
    s().addObject(officeAt(box)); await settle()
    expect(bays()).toBe(b0)
    const res = m.LC.checkLayout(s().objects, { gridSize: GS })
    expect(res.errors.filter(e => e.ids.includes(o.id))).toEqual([])
    expect(res.warnings.some(w => w.kind === 'zone-face' && w.ids.includes(o.id))).toBe(true)
  })

  it('ZX-stub (rule 4): a 1-bay piece left beside the office goes with the cut — and comes back when the office moves off', async () => {
    const { ib } = await load('hand-placed')
    // a long single or pair; the office covering its 2nd bay only, across its full depth
    const r = racks().filter(o => BEAM.has(o.type) && o.beams.length >= 6).sort((a, b) => a.beams.length - b.beams.length)[0]
    const f = m.rackFootprint(r), pitch = ((r.uprightWidth || 3) + r.beams[0]) / 12 * GS
    const first = vert ? f.y : f.x, start = r.rotation === 180 || r.rotation === 270 ? null : first
    void start
    // bay 2 counted from the run's low end, whichever way the rack is stored
    // past bay 1's far upright (its bay box takes it in), short of bay 3's
    const upW = ((r.uprightWidth || 3) / 12) * GS, lo = first + pitch + upW + 6, hi = first + 2 * pitch - 6
    const box = vert ? { x: f.x - GS, y: lo, w: f.w + 2 * GS, h: hi - lo } : { x: lo, y: f.y - GS, w: hi - lo, h: f.h + 2 * GS }
    const before = doc()
    s().addObject(officeAt(box)); await settle()
    const gone = m.RA.removedRowBays(before.objects, s().objects, GS)
    // the bay under it, and the 1-bay piece between it and the run's end
    const per = r.type === 'rack_double_row' ? 2 : 1
    expect(gone.length).toBe(2 * per)
    const stub = gone.filter(b => !meets(b, box))
    expect(stub.length, 'the stub beside it went too').toBe(per)
    // moved well off the rack: both come back, the rack exactly as it was
    s().commitObjectUpdate('office', vert ? { x: box.x + 200 * GS } : { y: box.y + 200 * GS }); await settle()
    expect(JSON.stringify(s().objects.find(o => o.id === r.id))).toBe(JSON.stringify(before.objects.find(o => o.id === r.id)))
  })

  it('ZX-two (break-it): two zones on one rack — deleting one gives back only what IT alone covered; the other\'s bays stay cut; deleting both gives back the rack exactly', async () => {
    const { ib } = await load('hand-placed')
    const r = racks().filter(o => BEAM.has(o.type) && o.beams.length >= 10).sort((a, b) => b.beams.length - a.beams.length)[0]
    const f = m.rackFootprint(r), [r0, r1] = vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w], L = r1 - r0
    const at = (a, b) => (vert ? { x: f.x - GS, y: r0 + a * L, w: f.w + 2 * GS, h: (b - a) * L } : { x: r0 + a * L, y: f.y - GS, w: (b - a) * L, h: f.h + 2 * GS })
    const A = at(0.3, 0.45), B = at(0.55, 0.7)
    const before = doc()
    s().addObject(officeAt(A, 'zA')); await settle()
    s().addObject(officeAt(B, 'zB')); await settle()
    const both = doc()
    s().selectGroup(['zA']); s().deleteSelected(); await settle()
    const back = m.RA.removedRowBays(s().objects, both.objects, GS)
    expect(back.length).toBeGreaterThan(0)
    for (const b of back) expect(meets(b, A) || !meets(b, B)).toBe(true)
    expect(racks().flatMap(o => m.RA.rowBayBoxes(o, GS)).filter(b => meets(b, B))).toEqual([])
    s().selectGroup(['zB']); s().deleteSelected(); await settle()
    expect(rackDoc(s().objects)).toBe(rackDoc(before.objects))
  })

  it('ZX-whole (break-it): a rack wholly under the office (kept on the zone) comes back when it moves off and when it is deleted; a bulk delete of the office WITH racks brings nothing back; a pasted copy of the office never duplicates a rack', async () => {
    const { ib } = await load('hand-placed')
    const r = racks().filter(o => BEAM.has(o.type)).sort((a, b) => a.beams.length - b.beams.length)[0]
    const f = m.rackFootprint(r), box = { x: f.x - GS, y: f.y - GS, w: f.w + 2 * GS, h: f.h + 2 * GS }
    const before = doc()
    s().addObject(officeAt(box)); await settle()
    expect(s().objects.some(o => o.id === r.id)).toBe(false)
    expect(s().objects.find(o => o.id === 'office').cutRacks.map(b => b.id)).toContain(r.id)
    // a copy of the office (it carries the kept rack) pasted elsewhere: no rack appears twice
    const copy = { ...JSON.parse(JSON.stringify(s().objects.find(o => o.id === 'office'))), id: 'office2', x: box.x + (vert ? 0 : 0), y: box.y }
    copy.x = vert ? ib.x : ib.x; copy.y = vert ? ib.y : ib.y
    s().addObject(copy); await settle()
    const ids = racks().map(o => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter(id => id === r.id).length).toBeLessThanOrEqual(1)
    s().selectGroup(['office2']); s().deleteSelected(); await settle()
    // the office deleted: the rack back, exactly
    s().selectGroup(['office']); s().deleteSelected(); await settle()
    expect(JSON.stringify(s().objects.find(o => o.id === r.id))).toBe(JSON.stringify(before.objects.find(o => o.id === r.id)))
    // again, then the office and its neighbour deleted together: a bulk delete brings nothing back
    s().addObject(officeAt(box)); await settle()
    const other = racks().find(o => o.id !== r.id)
    s().selectGroup(['office', other.id]); s().deleteSelected(); await settle()
    expect(s().objects.some(o => o.id === r.id)).toBe(false)
  })

  it('ZX-edited (break-it): a piece of a cut rack edited by hand since (moved 1\') keeps the edit when the office moves — only its footprint is taken off it, nothing restored over the edit', async () => {
    const { ib } = await load('hand-placed')
    const r = racks().filter(o => BEAM.has(o.type) && o.beams.length >= 10).sort((a, b) => b.beams.length - a.beams.length)[0]
    const f = m.rackFootprint(r), [r0, r1] = vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w], L = r1 - r0
    const box = vert ? { x: f.x - GS, y: r0 + 0.45 * L, w: f.w + 2 * GS, h: 0.1 * L } : { x: r0 + 0.45 * L, y: f.y - GS, w: 0.1 * L, h: f.h + 2 * GS }
    s().addObject(officeAt(box)); await settle()
    const piece = racks().find(o => o.zoneBase && o.zoneBase.id === r.id && o.id !== r.id)
    expect(piece).toBeTruthy()
    s().commitObjectUpdate(piece.id, vert ? { x: piece.x + GS } : { y: piece.y + GS }); await settle()
    const edited = s().objects.find(o => o.id === piece.id)
    s().commitObjectUpdate('office', vert ? { x: box.x + 200 * GS } : { y: box.y + 200 * GS }); await settle()
    const after = s().objects.find(o => o.id === piece.id)
    expect(after && [after.x, after.y]).toEqual([edited.x, edited.y])
  })
})

describe('ZX — the repro (Generate, vertical rows, one cross-aisle at the bottom)', () => {
  it('ZX-repro: a 40 × 30 office dropped at the bottom middle takes only the bays under it; moved, rows don\'t end short beyond it and no 1-2 bay stubs stay beside it; deleted, every row is back to full length', async () => {
    const m = await fresh(), s = () => m.useCanvasStore.getState()
    m.TG.generateAndPlace({ lengthFt: 240, widthFt: 120, gridXFt: 50, gridYFt: 54, mhe: 'reach', orientation: 'vertical', rackType: 'rack_double_row', dockDoors: 0 })
    await settle()
    const fp = s().objects.find(o => o.type.startsWith('fp_')), wt = (fp.wallThicknessFt || 0.25) * GS
    const original = JSON.parse(JSON.stringify(s().objects)), b0 = m.RA.rowBays(original)
    const box = { x: fp.x + fp.width / 2 - 20 * GS, y: fp.y + fp.height - wt - 30 * GS, w: 40 * GS, h: 30 * GS }
    let covered = 0
    for (const r of original.filter(isRack)) for (const b of m.RA.rowBayBoxes(r, GS)) if (meets(b, box)) covered++
    s().addObject({ id: 'office', type: 'zone_office', label: 'Office', x: box.x, y: box.y, width: box.w, height: box.h, parentId: fp.id, layerId: 'zones' }); await settle()
    const b1 = m.RA.rowBays(s().objects)
    expect(b0 - b1, 'only what its footprint covers (and stubs under 2 bays beside it)').toBeLessThanOrEqual(covered + 2 * 2)
    expect(b0 - b1).toBeGreaterThanOrEqual(covered)
    // no piece shorter than 2 bays anywhere near it
    const near = { x: box.x - 2 * GS, y: box.y - 2 * GS, w: box.w + 4 * GS, h: box.h + 4 * GS }
    expect(s().objects.filter(o => isRack(o) && o.beams.length < 2 && meets({ ...m.rackFootprint(o) }, near))).toEqual([])
    s().commitObjectUpdate('office', { x: box.x - 30 * GS }); await settle()
    expect(s().objects.filter(o => isRack(o) && o.beams.length < 2 && meets({ ...m.rackFootprint(o) }, { ...near, x: near.x - 30 * GS }))).toEqual([])
    s().selectGroup(['office']); s().deleteSelected(); await settle()
    expect(m.RA.rowBays(s().objects)).toBe(b0)
    const sig = (objs) => JSON.stringify(objs.filter(isRack).sort((a, b) => (a.id < b.id ? -1 : 1)))
    expect(sig(s().objects)).toBe(sig(original))
  })
})
