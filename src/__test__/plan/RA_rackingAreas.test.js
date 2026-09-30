// Area RA — racking areas and zones (generate/rackingArea.js,
// utils/rackingAreaTool.js). A Fill racking box becomes a persistent racking
// area; dragging its edge extends it (only the newly covered part is filled,
// by every Fill racking rule) or shrinks it (racks trimmed to whole bays); a
// settings change rebuilds it; hand edits are warned about first and survive.
// Zones (office, staging, washroom, custom) are holes with wall edges for
// every fill, and a zone placed over racks trims them after a question. Each
// of these is one undo step. Real store with the app's keepers installed;
// both orientations; a rectangle (240 × 120 with a 40 × 40 office top-right),
// an L and a T.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const FT = await import('../../utils/fillTool')
  const FR = await import('../../generate/fillRacking')
  const RA = await import('../../generate/rackingArea')
  const AT = await import('../../utils/rackingAreaTool')
  const LC = await import('../../utils/layoutCheck')
  const CP = await import('../../utils/copyPrompt')
  const { rackFootprint } = await import('../../generate/columnCheck')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  CP.installCopyWatcher(useCanvasStore, nanoid)
  AT.installZoneKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, RA, AT, LC, CP, rackFootprint }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-3
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
const within = (a, b) => a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS
const tick = () => new Promise(r => setTimeout(r, 0))

describe.each(['horizontal', 'vertical'])('RA — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
    m.AT.useAreaPrompt.setState({ question: null })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const areaNow = () => s().objects.find(o => o.type === 'racking_area')
  const foot = (o) => m.rackFootprint(o)
  const doc = () => JSON.parse(JSON.stringify({ objects: s().objects }))
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })
  const drag = (a, b) => { m.FT.startFill(a); m.FT.moveFill(b, s().objects, GS); return m.FT.commitFill(m.useCanvasStore) }
  /** Drag the area's edge (the canvas writes the live box, then calls finishAreaResize on release). */
  const resizeArea = (box) => {
    const a = areaNow(), old = { x: a.x, y: a.y, w: a.width, h: a.height }
    s().updateObject(a.id, { x: box.x, y: box.y, width: box.w, height: box.h })
    return m.AT.finishAreaResize(m.useCanvasStore, a.id, old)
  }
  const answer = (go) => m.AT.answerArea(go)
  const question = () => m.AT.useAreaPrompt.getState().question

  /** 240 × 120 with a 40 × 40 office in the top-right corner; the area fills all but the top 40'. */
  const officeLayout = () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    s().addObject({ type: 'zone_office', label: 'Office', x: fp.x + fp.width - 40 * GS, y: fp.y, width: 40 * GS, height: 40 * GS, parentId: fp.id, layerId: 'zones' })
    const office = s().objects.find(o => o.type === 'zone_office')
    const n = drag({ x: fp.x, y: fp.y + fp.height }, { x: fp.x + fp.width, y: fp.y + 40 * GS })
    expect(n).toBeGreaterThan(4)
    return { fp, office, ob: { x: office.x, y: office.y, w: office.width, h: office.height } }
  }

  it('RA-create: a Fill racking box becomes a racking area (dashed outline object on Racking) with the box, the settings and every rack it placed stamped with its id; one undo takes the area and its racks away', () => {
    const { fp } = officeLayout()
    const a = areaNow()
    expect(a).toBeTruthy()
    expect(a.layerId).toBe('racking')
    expect(a.parentId).toBe(fp.id)
    expect([a.x, a.y, a.width, a.height]).toEqual([fp.x, fp.y + 40 * GS, fp.width, fp.height - 40 * GS])
    expect(a.settings.orientation).toBe(orientation)
    expect(racks().length).toBeGreaterThan(4)
    for (const r of racks()) { expect(r.areaId).toBe(a.id); expect(a.placed[r.id]).toBe(m.RA.rackSig(r)) }
    expect(m.RA.areaEdits(s().objects, a).count).toBe(0)
    s().undo()
    expect(areaNow()).toBeUndefined()
    expect(racks()).toHaveLength(0)
  })

  it('RA-extend: dragging the top edge up to the wall fills the strip beside the office — up to the office and not into it (rows flush on it, the row against it single); the racks already there stay exactly as they were; Check layout clean; one undo', () => {
    const { fp, office, ob } = officeLayout()
    const before = doc(), oldRacks = JSON.parse(JSON.stringify(racks())), n0 = s().history.length
    expect(resizeArea({ x: fp.x, y: fp.y, w: fp.width, h: fp.height })).toBe(true)
    expect(question()).toBeNull()
    expect(s().history.length).toBe(n0 + 1)
    for (const r of oldRacks) expect(s().objects.find(o => o.id === r.id)).toEqual(r)
    const strip = racks().filter(r => foot(r).y < fp.y + 40 * GS - EPS)
    expect(strip.length).toBeGreaterThan(1)
    for (const r of racks()) expect(overlap(foot(r), ob)).toBe(false)
    // flush on the office: the strip's racking ends exactly on its left edge
    expect(Math.max(...strip.map(r => foot(r).x + foot(r).w)) - office.x).toBeCloseTo(0, 3)
    if (vert) for (const r of strip) if (Math.abs(foot(r).x + foot(r).w - office.x) < EPS) expect(r.type).toBe('rack_row')
    for (const r of strip) expect(r.areaId).toBe(areaNow().id)
    expect([areaNow().y, areaNow().height]).toEqual([fp.y, fp.height])
    expect(check().errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
  })

  it('RA-edits: with a rack moved by hand, the extend asks first ("You\'ve changed racks in this area. …"); Cancel changes nothing; Continue extends and the hand-moved rack stays where it was put', () => {
    const { fp, ob } = officeLayout()
    // the rack nearest the area's centre (an interior row: moving it keeps it inside)
    const a0 = areaNow(), cx = a0.x + a0.width / 2, cy = a0.y + a0.height / 2
    const dist = (o) => { const f = foot(o); return Math.hypot(f.x + f.w / 2 - cx, f.y + f.h / 2 - cy) }
    const r = [...racks()].sort((p, q) => dist(p) - dist(q))[0]
    s().commitObjectUpdate(r.id, vert ? { x: r.x + GS / 2 } : { y: r.y + GS / 2 })
    const moved = JSON.parse(JSON.stringify(s().objects.find(o => o.id === r.id)))
    expect(m.RA.areaEdits(s().objects, areaNow()).count).toBe(1)
    const before = doc(), n0 = s().history.length
    expect(resizeArea({ x: fp.x, y: fp.y, w: fp.width, h: fp.height })).toBe(false)
    expect(question().text).toBe("You've changed racks in this area. The new part will use the default settings; your changes stay as they are.")
    expect(doc()).toEqual(before)                                         // the area is back where it was while asking
    answer(false)
    expect(question()).toBeNull()
    expect(doc()).toEqual(before)
    expect(s().history.length).toBe(n0)
    resizeArea({ x: fp.x, y: fp.y, w: fp.width, h: fp.height })
    answer(true)
    expect(s().objects.find(o => o.id === r.id)).toEqual(moved)
    expect(racks().filter(o => foot(o).y < fp.y + 40 * GS - EPS).length).toBeGreaterThan(1)
    for (const o of racks()) expect(overlap(foot(o), ob)).toBe(false)
    expect(s().history.length).toBe(n0 + 1)
    s().undo()
    expect(doc()).toEqual(before)
  })

  it.each([['along the rows', 'run'], ['across the rows', 'stack']])('RA-shrink: shrinking %s — racks crossing the new edge are trimmed to the whole bays inside it (a row cut across its depth goes), nothing is left outside, bays keep their beams; one undo', (_, axis) => {
    const { fp } = officeLayout()
    const a = areaNow(), before = doc()
    // pull the far edge in by 37' 5" — not a whole number of bays
    const cut = (37 + 5 / 12) * GS
    const alongX = (axis === 'run') !== vert                             // horizontal rows run along x
    const box = alongX ? { x: a.x, y: a.y, w: a.width - cut, h: a.height } : { x: a.x, y: a.y, w: a.width, h: a.height - cut }
    const edge = alongX ? box.x + box.w : box.y + box.h
    const crossing = racks().filter(r => { const f = foot(r); return alongX ? f.x < edge && f.x + f.w > edge : f.y < edge && f.y + f.h > edge })
    expect(crossing.length).toBeGreaterThan(0)
    expect(resizeArea(box)).toBe(true)
    for (const r of racks()) { expect(within(foot(r), box)).toBe(true); expect(r.beams.every(b => b === 96)).toBe(true) }
    if (axis === 'run') {
      // trimmed to whole bays: each crossing row still reaches to within one bay (8' 3") of the new edge
      for (const c of crossing) {
        const kept = racks().filter(r => r.id === c.id)
        expect(kept).toHaveLength(1)
        const f = foot(kept[0]), end = alongX ? f.x + f.w : f.y + f.h
        expect(edge - end).toBeGreaterThanOrEqual(-EPS)
        expect(edge - end).toBeLessThan(99 / 12 * GS)
        expect(kept[0].beams.length).toBeLessThan(c.beams.length)
      }
    } else {
      for (const c of crossing) expect(racks().some(r => r.id === c.id)).toBe(false)
    }
    expect(m.RA.areaEdits(s().objects, areaNow()).count).toBe(0)       // the app's trim is not a hand edit
    expect(check().errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
    void fp
  })

  it('RA-rebuild: changing the area\'s beam to 108" rebuilds the whole area with it (every rack 108" bays, the area remembers it); with a hand-moved rack it asks first and the moved rack stays; Check layout clean; one undo each', () => {
    const { ob } = officeLayout()
    const a = areaNow(), before = doc()
    expect(m.AT.requestAreaRebuild(m.useCanvasStore, a.id, { beamIn: 108 })).toBe(true)
    expect(racks().length).toBeGreaterThan(4)
    for (const r of racks()) { expect(r.beams.every(b => b === 108)).toBe(true); expect(r.areaId).toBe(a.id); expect(overlap(foot(r), ob)).toBe(false) }
    expect(areaNow().settings.beamIn).toBe(108)
    expect(check().errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
    // hand edit, then rebuild: asked, and the edited rack survives
    const r = racks()[Math.floor(racks().length / 2)]
    s().commitObjectUpdate(r.id, vert ? { x: r.x + GS / 4 } : { y: r.y + GS / 4 })
    const moved = JSON.parse(JSON.stringify(s().objects.find(o => o.id === r.id)))
    expect(m.AT.requestAreaRebuild(m.useCanvasStore, a.id, { beamIn: 108 })).toBe(false)
    expect(question().text).toMatch(/^You've changed racks in this area\./)
    answer(true)
    expect(s().objects.find(o => o.id === r.id)).toEqual(moved)
    for (const o of racks()) if (o.id !== r.id) expect(o.beams.every(b => b === 108)).toBe(true)
    const f = racks().map(foot)
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) expect(overlap(f[i], f[j])).toBe(false)
  })

  it('RA-zone: a staging zone placed over racks asks first (the placing taken back meanwhile); Continue places it and removes / trims the racks under it — no bay left under it; Cancel leaves it unplaced; Check layout clean; one undo', async () => {
    const { fp } = officeLayout()
    const before = doc(), n0 = s().history.length
    const zone = { type: 'zone_staging', label: 'Staging', x: fp.x + 60 * GS, y: fp.y + 70 * GS, width: 40 * GS, height: 30 * GS, parentId: fp.id, layerId: 'zones' }
    const zb = { x: zone.x, y: zone.y, w: zone.width, h: zone.height }
    const under = racks().filter(r => overlap(foot(r), zb)).length
    expect(under).toBeGreaterThan(0)
    s().addObject(zone); await tick()
    expect(question().text).toMatch(/^This staging covers \d+ racks?\. Racks under it will be removed or trimmed to the bays outside it\.$/)
    expect(doc()).toEqual(before)
    expect(s().history.length).toBe(n0)
    answer(false)
    expect(doc()).toEqual(before)
    s().addObject(zone); await tick()
    answer(true); await tick()
    expect(s().objects.some(o => o.type === 'zone_staging')).toBe(true)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb)).toBe(false)
    expect(s().history.length).toBe(n0 + 1)
    expect(question()).toBeNull()
    expect(check().errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
  })

  it('RA-zone-move: moving a zone onto racks asks too; Continue trims them; a zone moved onto clear floor asks nothing', async () => {
    const { fp, office } = officeLayout()
    const n0 = s().history.length
    s().commitObjectUpdate(office.id, { y: office.y + 60 * GS }); await tick()
    expect(question()).not.toBeNull()
    answer(true); await tick()
    const z = s().objects.find(o => o.id === office.id)
    const zb = { x: z.x, y: z.y, w: z.width, h: z.height }
    for (const r of racks()) expect(overlap(foot(r), zb)).toBe(false)
    expect(s().history.length).toBe(n0 + 1)
    // onto clear floor (outside the building): no question
    s().commitObjectUpdate(office.id, { x: fp.x - 100 * GS }); await tick()
    expect(question()).toBeNull()
  })

  it('RA-mouse: with a box and an edge drag landing where a mouse puts them (not whole feet: the top at 39.95\', dragged to 2.17\' past the wall) Check layout finds nothing at all — no aisle a hair under the forklift\'s width', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    s().addObject({ type: 'zone_office', label: 'Office', x: fp.x + fp.width - 40 * GS, y: fp.y, width: 40 * GS, height: 40 * GS, parentId: fp.id, layerId: 'zones' })
    drag({ x: fp.x + 20.3, y: fp.y + fp.height + 61.7 }, { x: fp.x + fp.width + 60.1, y: fp.y + 39.95 * GS })
    expect(check()).toEqual({ errors: [], warnings: [] })
    const a = areaNow()
    resizeArea({ x: a.x, y: fp.y - 2.17 * GS, w: a.width, h: a.y + a.height - (fp.y - 2.17 * GS) })
    expect(racks().filter(r => foot(r).y < fp.y + 39 * GS).length).toBeGreaterThan(1)
    expect(check()).toEqual({ errors: [], warnings: [] })
  })

  it('RA-copy: an area\'s resize is not a row edit — a shrink that trims rows puts nothing in the copy-to-sections set', async () => {
    officeLayout()
    await m.CP.flushCopyWatcher()
    const a = areaNow(), cut = (37 + 5 / 12) * GS
    resizeArea(vert ? { x: a.x, y: a.y, w: a.width, h: a.height - cut } : { x: a.x, y: a.y, w: a.width - cut, h: a.height })
    await m.CP.flushCopyWatcher()
    expect(m.CP.useCopyPrompt.getState().pending ?? null).toBeFalsy()
    expect(m.CP.useCopyPrompt.getState().question ?? null).toBeFalsy()
  })

  it.each([['fp_l', 300, 200], ['fp_t', 360, 240]])('RA-shape: on a %s, an area over one part extended across the rest fills only inside the walls, never into a zone placed there, and stays clean', (type, w, h) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = s().objects.find(o => o.type === type)
    const inner = m.FR.innerOutline(fp, GS)
    // a washroom in the building's lower left
    s().addObject({ type: 'zone_washroom', label: 'Washroom', x: fp.x + 10 * GS, y: fp.y + fp.height - 30 * GS, width: 20 * GS, height: 15 * GS, parentId: fp.id, layerId: 'zones' })
    const wz = s().objects.find(o => o.type === 'zone_washroom'), wb = { x: wz.x, y: wz.y, w: wz.width, h: wz.height }
    drag({ x: fp.x, y: fp.y }, { x: fp.x + fp.width, y: fp.y + fp.height * 0.3 })
    expect(racks().length).toBeGreaterThan(2)
    expect(resizeArea({ x: fp.x, y: fp.y, w: fp.width, h: fp.height })).toBe(true)
    const pointIn = (px, py) => { let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const a = inner[i], b = inner[j]; if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) c = !c } return c }
    for (const r of racks()) {
      const f = foot(r)
      for (const [x, y] of [[f.x + 0.01, f.y + 0.01], [f.x + f.w - 0.01, f.y + 0.01], [f.x + 0.01, f.y + f.h - 0.01], [f.x + f.w - 0.01, f.y + f.h - 0.01]]) expect(pointIn(x, y)).toBe(true)
      expect(overlap(f, wb)).toBe(false)
    }
    expect(racks().length).toBeGreaterThan(8)
    expect(check().errors).toEqual([])
  })
})
