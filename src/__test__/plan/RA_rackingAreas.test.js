// Area RA — racking areas and zones (generate/rackingArea.js,
// utils/rackingAreaTool.js). A Fill racking box becomes a persistent racking
// area with a fixed PATTERN (its rows, pairs, bays and cross-aisles, computed
// once from the drag-start edges); the box is a window on it. Dragging an edge
// extends it (the same pattern carries on: doubles stay doubles, no extra edge
// rows) or shrinks it (whole bays; a cut pair shows the half that fits), and
// shrinking then extending back gives exactly the racks it had; a settings
// change recomputes the pattern; hand edits are warned about first and survive.
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
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, RA, AT, LC, CP, L, rackFootprint }
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
  /** The building's inner wall faces' bounding box (world px). */
  const innerBox = (fp) => { const p = m.FR.innerOutline(fp, GS), xs = p.map(q => q.x), ys = p.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }
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
    // the box as dragged, clipped to the inner wall faces (it never goes past a wall)
    const ib = innerBox(fp)
    expect([a.x, a.y, a.width, a.height]).toEqual([ib.x, fp.y + 40 * GS, ib.w, ib.y + ib.h - (fp.y + 40 * GS)])
    expect(a.settings.orientation).toBe(orientation)
    expect(racks().length).toBeGreaterThan(4)
    for (const r of racks()) { expect(r.areaId).toBe(a.id); expect(a.placed[r.id]).toBe(m.RA.rackSig(r)) }
    expect(m.RA.areaEdits(s().objects, a).count).toBe(0)
    s().undo()
    expect(areaNow()).toBeUndefined()
    expect(racks()).toHaveLength(0)
  })

  it('RA-extend: dragging the top edge up to the wall fills the strip beside the office — up to the office and not into it, the area\'s pattern carried on; every rack more than a bay from the old edge stays the very same object; Check layout clean; one undo', () => {
    const { fp, office, ob } = officeLayout()
    const before = doc(), oldRacks = JSON.parse(JSON.stringify(racks())), n0 = s().history.length
    const oldTop = areaNow().y
    expect(resizeArea({ x: fp.x, y: fp.y, w: fp.width, h: fp.height })).toBe(true)
    expect(question()).toBeNull()
    expect(s().history.length).toBe(n0 + 1)
    // a rack more than a bay from the old edge is untouched by the extend: the same object (a run that
    // stopped short of the edge, where its next whole bay did not fit, carries on past it)
    const away = oldRacks.filter(r => foot(r).y > oldTop + 99 / 12 * GS)
    if (!vert) expect(away.length).toBeGreaterThan(4)
    for (const r of away) expect(s().objects.find(o => o.id === r.id)).toEqual(r)
    const strip = racks().filter(r => foot(r).y < fp.y + 40 * GS - EPS)
    expect(strip.length).toBeGreaterThan(1)
    for (const r of racks()) expect(overlap(foot(r), ob)).toBe(false)
    // up to the office, never past it: the pattern's whole bays (horizontal) or rows (vertical) that fit
    const endGap = office.x - Math.max(...strip.map(r => foot(r).x + foot(r).w))
    expect(endGap).toBeGreaterThanOrEqual(-EPS)
    expect(endGap).toBeLessThan((vert ? (2 * 42 + 9) / 12 + 10.5 : 99 / 12) * GS)
    expectOnPattern()
    expectAisles()
    for (const r of strip) expect(r.areaId).toBe(areaNow().id)
    const ib = innerBox(fp)
    expect([areaNow().y, areaNow().height]).toEqual([ib.y, ib.h])                // dragged past the wall: stopped at its inner face
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

  it.each([['along the rows', 'run'], ['across the rows', 'stack']])('RA-shrink: shrinking %s — racks crossing the new edge are trimmed to the whole bays inside it (a row cut across its depth goes — but a pair keeps a half that still fits, as a single row), nothing is left outside, bays keep their beams; one undo', (_, axis) => {
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
      // trimmed to whole bays: each crossing row still reaches to within one bay (8' 3") of the new edge,
      // on the same uprights (the pattern's), from the same start
      for (const c of crossing) {
        const fc = foot(c), across = alongX ? fc.y : fc.x, start = alongX ? fc.x : fc.y
        const kept = racks().filter(r => Math.abs((alongX ? foot(r).y : foot(r).x) - across) < EPS && Math.abs((alongX ? foot(r).x : foot(r).y) - start) < EPS)
        expect(kept).toHaveLength(1)
        expect(kept[0].type).toBe(c.type)
        const f = foot(kept[0]), end = alongX ? f.x + f.w : f.y + f.h
        expect(edge - end).toBeGreaterThanOrEqual(-EPS)
        expect(edge - end).toBeLessThan(99 / 12 * GS)
        expect(kept[0].beams.length).toBeLessThan(c.beams.length)
      }
    } else {
      for (const c of crossing) expect(racks().some(r => r.id === c.id)).toBe(false)
    }
    expectOnPattern()
    expectAisles()
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

  /** Uprights (run positions, ft) of a rack, and its run start / end. */
  const runOf = (r) => { const f = foot(r); return vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const stackOf = (r) => { const f = foot(r); return vert ? f.x : f.y }
  const uprights = (r) => { const [r0] = runOf(r), u = r.uprightWidth ?? 3, out = [r0 / GS]; let at = r0 / GS; for (const b of r.beams) { at += (u + b) / 12; out.push(at) } return out }
  /** Extend the area across its rows (up for horizontal rows, left for vertical) to `edge`; returns
   *  the template row (the area's row nearest that side, before) and the new racks. */
  const extendAcross = (edge) => {
    const a = areaNow(), before = new Set(racks().map(r => r.id))
    const first = Math.min(...racks().map(stackOf))
    const template = racks().filter(r => Math.abs(stackOf(r) - first) < 1e-6).map(r => JSON.parse(JSON.stringify(r)))
    const box = vert ? { x: edge, y: a.y, w: a.x + a.width - edge, h: a.height } : { x: a.x, y: edge, w: a.width, h: a.y + a.height - edge }
    if (!resizeArea(box)) answer(true)                                   // a hand edit in the area: asked first
    return { template, added: racks().filter(r => !before.has(r.id)) }
  }
  /** Every new row lines up with the template where the template reaches: its uprights there are the
   *  template's (same positions), and a piece the template had whole keeps its exact start, end and
   *  bays. Past the template's reach a piece carries the pattern's own bays on. */
  const expectAligned = (template, added) => {
    const tUp = template.flatMap(uprights)
    const h0 = Math.min(...template.map(t => runOf(t)[0])) / GS, h1 = Math.max(...template.map(t => runOf(t)[1])) / GS
    expect(added.length).toBeGreaterThan(1)
    let whole = 0
    for (const r of added) {
      for (const u of uprights(r)) if (u > h0 + 1e-6 && u < h1 - 1e-6) expect(tUp.some(t => Math.abs(t - u) < 1e-6), `upright at ${u.toFixed(3)}' lines up`).toBe(true)
      const [r0, r1] = runOf(r)
      const same = template.find(t => Math.abs(runOf(t)[0] - r0) < 1e-3 && Math.abs(runOf(t)[1] - r1) < 1e-3)
      if (same) { expect(r.beams).toEqual(same.beams); whole++ }
    }
    expect(whole).toBeGreaterThan(0)
  }

  it('RA-align: extending the area across its rows (up / to the left, to the wall) gives new rows on the area\'s pattern — the same starts, ends, uprights and bays as the rows it placed; a row given its own bays by hand (Match bays) stays as it is and the pattern goes round it; Check layout clean; one undo', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    // a washroom in the top-left corner, as placed from the left panel and dragged there
    s().addObject({ type: 'zone_washroom', label: 'Washroom', x: fp.x + 10, y: fp.y + 10, width: 20 * GS, height: 15 * GS, parentId: fp.id, layerId: 'zones' })
    // the area over the bottom (horizontal) / right (vertical) part — where a mouse puts it, not whole feet
    if (vert) drag({ x: fp.x + fp.width + 61.3, y: fp.y + fp.height + 58.9 }, { x: fp.x + 100.37 * GS, y: fp.y - 59.6 })
    else drag({ x: fp.x + 20.4, y: fp.y + fp.height + 61.7 }, { x: fp.x + fp.width + 58.3, y: fp.y + 50.37 * GS })
    // the row nearest the extension, as placed, then given a bay pattern of its own (120" then 72", the same length)
    const first = Math.min(...racks().map(stackOf))
    const placedRow = racks().filter(o => Math.abs(stackOf(o) - first) < 1e-6).map(o => JSON.parse(JSON.stringify(o)))
    const r = placedRow[0]
    s().commitObjectUpdate(r.id, { beams: r.beams.map((b, i) => (i === 1 ? 120 : i === 2 ? 72 : b)) })
    const edited = JSON.parse(JSON.stringify(s().objects.find(o => o.id === r.id)))
    const before = doc()
    const { added } = extendAcross(vert ? fp.x - 81.7 : fp.y - 79.3)
    if (question()) answer(true)
    expectAligned(placedRow, added)
    expect(s().objects.find(o => o.id === r.id)).toEqual(edited)
    expect(added.some(o => o.beams.includes(120))).toBe(false)
    expectAisles()
    expect(check()).toEqual({ errors: [], warnings: [] })
    s().undo()
    expect(doc()).toEqual(before)
  })

  it.each([['fp_l', 300, 200], ['fp_t', 360, 240]])('RA-align-shape: on a %s, extending across the rows lines the new rows up with the row beside them, inside the walls', (type, w, h) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = s().objects.find(o => o.type === type)
    const inner = m.FR.innerOutline(fp, GS)
    // the area over the bottom (horizontal) / right (vertical) part, extended across the rows to the far wall
    if (vert) drag({ x: fp.x + fp.width, y: fp.y + fp.height }, { x: fp.x + fp.width * 0.55, y: fp.y })
    else drag({ x: fp.x, y: fp.y + fp.height }, { x: fp.x + fp.width, y: fp.y + fp.height * 0.55 })
    expect(racks().length).toBeGreaterThan(2)
    const { template, added } = extendAcross(vert ? fp.x : fp.y)
    expectAligned(template, added)
    const pointIn = (px, py) => { let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const a = inner[i], b = inner[j]; if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) c = !c } return c }
    for (const o of racks()) { const f = foot(o); for (const [x, y] of [[f.x + 0.01, f.y + 0.01], [f.x + f.w - 0.01, f.y + f.h - 0.01]]) expect(pointIn(x, y)).toBe(true) }
    expect(check().errors).toEqual([])
  })

  /* ── The pattern: the area's box is a window on it ── */
  const ftS = (f) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).map(v => v / GS)
  const ftR = (f) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w]).map(v => v / GS)
  /** Every rack of the area sits on its pattern: across, a pair's place (a double) or one half of it
   *  (a single); along, whole bays of one of its runs; stamped with that row and run. */
  const expectOnPattern = () => {
    const a = areaNow(), p = a.pattern, single = p.depthIn / 12, pitch = (p.upIn + p.beamIn) / 12
    expect(p).toBeTruthy()
    for (const r of racks().filter(o => o.areaId === a.id && a.placed[o.id] === m.RA.rackSig(o))) {
      const f = foot(r), [s0, s1] = ftS(f), [r0] = ftR(f)
      const u = p.units.find(q => q.row === r.rowIndex)
      expect(u, `row ${r.rowIndex} is a pattern row`).toBeTruthy()
      const spots = u.type !== 'rack_double_row' ? [[u.s0, u.s0 + u.d]]
        : r.type === 'rack_double_row' ? [[u.s0, u.s0 + u.d]] : [[u.s0, u.s0 + single], [u.s0 + u.d - single, u.s0 + u.d]]
      expect(spots.some(([x, y]) => Math.abs(x - s0) < 1e-6 && Math.abs(y - s1) < 1e-6), `row ${r.rowIndex} on its place across`).toBe(true)
      const pc = p.pieces.find(q => q.sec === r.genSection)
      expect(pc, `section ${r.genSection} is a pattern run`).toBeTruthy()
      const k = (r0 - pc.r0) / pitch
      expect(Math.abs(k - Math.round(k)), `row ${r.rowIndex} on its run's uprights`).toBeLessThan(1e-6)
      expect(Math.round(k) >= 0 && Math.round(k) + r.beams.length <= pc.n).toBe(true)
    }
  }
  /** Never an extra row: any two racks side by side across (overlapping along) are at least an aisle
   *  apart — no single row back-to-back with another row. */
  const expectAisles = () => {
    const aisleFt = m.FR.DEFAULT_FILL_SETTINGS.aisleFt
    const all = racks().map(r => ({ r, s: ftS(foot(r)), q: ftR(foot(r)) }))
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      if (Math.min(a.q[1], b.q[1]) - Math.max(a.q[0], b.q[0]) < 1e-3) continue
      const gap = Math.max(b.s[0] - a.s[1], a.s[0] - b.s[1])
      expect(gap, `${a.r.type} row ${a.r.rowIndex} and ${b.r.type} row ${b.r.rowIndex}: an aisle between`).toBeGreaterThan(aisleFt - 1e-6)
    }
  }
  /** A single row only where its pair is cut: the other half, on the same run, does not fit — past the
   *  box, past the walls, or on a zone. Doubles stay doubles. */
  const expectSinglesCut = () => {
    const a = areaNow(), box = { x: a.x, y: a.y, w: a.width, h: a.height }, single = a.pattern.depthIn / 12
    const fp = s().objects.find(o => o.id === a.parentId), inner = m.FR.innerOutline(fp, GS)
    const pin = (px, py) => { let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const p = inner[i], q = inner[j]; if ((p.y > py) !== (q.y > py) && px < (q.x - p.x) * (py - p.y) / (q.y - p.y) + p.x) c = !c } return c }
    const zones = s().objects.filter(o => o.type.startsWith('zone_')).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
    for (const r of racks().filter(o => o.type === 'rack_row' && o.areaId === a.id)) {
      const u = a.pattern.units.find(q => q.row === r.rowIndex)
      if (u.type !== 'rack_double_row') continue
      const [s0] = ftS(foot(r)), [r0, r1] = ftR(foot(r))
      const o0 = Math.abs(s0 - u.s0) < 1e-6 ? u.s0 + u.d - single : u.s0                 // the other half, across
      const other = vert ? { x: o0 * GS, y: r0 * GS, w: single * GS, h: (r1 - r0) * GS } : { x: r0 * GS, y: o0 * GS, w: (r1 - r0) * GS, h: single * GS }
      const onFloor = (b) => [[b.x + 0.01, b.y + 0.01], [b.x + b.w - 0.01, b.y + 0.01], [b.x + 0.01, b.y + b.h - 0.01], [b.x + b.w - 0.01, b.y + b.h - 0.01]].every(([x, y]) => pin(x, y))
        && !inner.some(p => p.x > b.x + 0.01 && p.x < b.x + b.w - 0.01 && p.y > b.y + 0.01 && p.y < b.y + b.h - 0.01)
      const fits = within(other, box) && onFloor(other) && !zones.some(z => overlap(z, other))
      // or it fits, but its pick face (its outer side) has no aisle: a wall or a zone within an aisle of it
      const aisle = a.pattern.aisleFt
      const f0 = Math.abs(o0 - u.s0) < 1e-6 ? u.s0 - aisle : u.s0 + u.d
      const strip = vert ? { x: f0 * GS, y: r0 * GS, w: aisle * GS, h: (r1 - r0) * GS } : { x: r0 * GS, y: f0 * GS, w: (r1 - r0) * GS, h: aisle * GS }
      const faceOpen = onFloor(strip) && !zones.some(z => overlap(z, strip))
      expect(fits && faceOpen, `single row ${r.rowIndex}: its other half doesn't fit, or can't be picked`).toBe(false)
    }
  }
  /** Every aisle is the forklift aisle: each rack's next rack across (overlapping it along) is
   *  exactly one aisle off — none widened (no slack aisle anywhere), none narrowed. Cross-aisles
   *  run along and aren't read. */
  const expectRegular = () => {
    const aisleFt = m.FR.DEFAULT_FILL_SETTINGS.aisleFt
    const all = racks().map(r => ({ r, s: ftS(foot(r)), q: ftR(foot(r)) }))
    let n = 0
    for (const a of all) {
      const next = all.filter(b => b !== a && b.s[0] >= a.s[1] - 1e-6 && Math.min(a.q[1], b.q[1]) - Math.max(a.q[0], b.q[0]) > 1e-3)
      if (!next.length) continue
      const gap = Math.min(...next.map(b => b.s[0])) - a.s[1]
      expect(gap, `the aisle after ${a.r.type} row ${a.r.rowIndex} (ft)`).toBeCloseTo(aisleFt, 6)
      n++
    }
    expect(n).toBeGreaterThan(0)
  }
  const rackKeys = () => racks().map(o => [o.type, Math.round(o.x * 1e4), Math.round(o.y * 1e4), Math.round(o.width * 1e4), Math.round(o.height * 1e4), o.rotation || 0, o.beams.join('/'), o.rowIndex, o.genSection, o.areaId].join(':')).sort()
  const clean = () => { expect(check()).toEqual({ errors: [], warnings: [] }); expectOnPattern(); expectAisles(); expectSinglesCut(); expectRegular() }
  // [name, type, width, height, the area's share of each] — the area reaches into the L's bar and the T's stem
  const SHAPES = [['rectangle', 'fp_rect', 240, 120, 0.55, 0.6], ['L', 'fp_l', 300, 200, 0.55, 0.8], ['T', 'fp_t', 360, 240, 0.55, 0.6]]
  /** An area over the top-left of the building, dragged from its top-left corner (a little past the
   *  walls, at mouse coordinates). */
  const patternArea = (type, w, h, fw, fh) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = s().objects.find(o => o.type === type)
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width * fw + 7.1, y: fp.y + fp.height * fh + 3.3 })
    expect(racks().length).toBeGreaterThan(3)
    return fp
  }
  const boxNow = () => { const a = areaNow(); return { x: a.x, y: a.y, w: a.width, h: a.height } }
  const bays = () => racks().reduce((t, r) => t + r.beams.length, 0)

  it.each(SHAPES)('RA-window (%s): fill → shrink the right edge → extend it back gives exactly the racks it had (ids aside); the same for the bottom edge; every step on the pattern, clean', (_, type, w, h, fw, fh) => {
    patternArea(type, w, h, fw, fh)
    clean()
    const original = rackKeys(), b0 = boxNow()
    resizeArea({ ...b0, w: b0.w * 0.55 + 3.7 })
    for (const r of racks()) expect(within(foot(r), boxNow())).toBe(true)
    expect(racks().length).toBeGreaterThan(0)
    clean()
    resizeArea(b0)
    expect(rackKeys()).toEqual(original)
    clean()
    resizeArea({ ...b0, h: b0.h * 0.5 + 5.3 })
    for (const r of racks()) expect(within(foot(r), boxNow())).toBe(true)
    clean()
    resizeArea(b0)
    expect(rackKeys()).toEqual(original)
    clean()
  })

  /** Each rack of `before` is still there with every one of its bays: a rack across the same place
   *  reaching over it along (an extend only adds) — a double stays a double; a single the extend gave
   *  its other half to is now a double over it. */
  const expectKept = (before) => {
    for (const b of before) {
      const fb = foot(b), [s0, s1] = ftS(fb), [r0, r1] = ftR(fb)
      const over = racks().find(r => { const f = foot(r), [a0, a1] = ftS(f), [q0, q1] = ftR(f); return a0 <= s0 + 1e-6 && a1 >= s1 - 1e-6 && q0 <= r0 + 1e-6 && q1 >= r1 - 1e-6 })
      expect(over, `${b.type} row ${b.rowIndex} kept`).toBeTruthy()
      if (b.type === 'rack_double_row') expect(over.type, `double row ${b.rowIndex} stays a double`).toBe('rack_double_row')
    }
  }
  it.each(SHAPES)('RA-extend-right (%s): extending the right edge to the wall carries the pattern on — every rack there stays (doubles stay doubles), the new part is the same rows and bays, no single where a pair fits; clean', (_, type, w, h, fw, fh) => {
    const fp = patternArea(type, w, h, fw, fh)
    const before = JSON.parse(JSON.stringify(racks())), n0 = bays()
    const b0 = boxNow()
    resizeArea({ ...b0, w: fp.x + fp.width + 17.9 - b0.x })
    expect(bays()).toBeGreaterThan(n0)
    expectKept(before)
    clean()
  })

  it.each(SHAPES)('RA-extend-down (%s): extending the bottom edge to the wall carries the pattern on — no extra single rows, every rack there stays (the edge single becomes its pair where the pair now fits); clean', (_, type, w, h, fw, fh) => {
    const fp = patternArea(type, w, h, fw, fh)
    const before = JSON.parse(JSON.stringify(racks())), n0 = bays()
    const b0 = boxNow()
    resizeArea({ ...b0, h: fp.y + fp.height + 11.3 - b0.y })
    expect(bays()).toBeGreaterThan(n0)
    expectKept(before)
    clean()
  })

  it.each(SHAPES)('RA-cut-pair (%s): an edge through a back-to-back pair, where only its near half fits, shows that half as a single row — nothing of the far half, nothing past the edge; clean', (_, type, w, h, fw, fh) => {
    patternArea(type, w, h, fw, fh)
    const a = areaNow(), p = a.pattern, single = p.depthIn / 12
    // a pattern pair shown whole now, well inside: the far edge across the rows goes through its far half
    const doubles = [...new Set(racks().filter(r => r.type === 'rack_double_row').map(r => r.rowIndex))]
    const u = p.units.filter(q => doubles.includes(q.row)).sort((x, y) => x.s0 - y.s0)[Math.floor(doubles.length / 2)]
    const edge = (u.s0 + single + 0.6) * GS                              // past the near half, into the flue / far half
    resizeArea(vert ? { x: a.x, y: a.y, w: edge - a.x, h: a.height } : { x: a.x, y: a.y, w: a.width, h: edge - a.y })
    const row = racks().filter(r => r.rowIndex === u.row)
    expect(row.length).toBeGreaterThan(0)
    for (const r of row) { expect(r.type).toBe('rack_row'); expect(ftS(foot(r))[0]).toBeCloseTo(u.s0, 6); expect(ftS(foot(r))[1]).toBeCloseTo(u.s0 + single, 6) }
    for (const r of racks()) expect(ftS(foot(r))[1]).toBeLessThanOrEqual(edge / GS + 1e-6)
    clean()
  })

  it('RA-regular-fill: on 240 × 120 a fill of the whole building has every aisle exactly the forklift aisle — the last one not widened to sit a row flush on the far wall; what is left there is under a pair and an aisle; clean', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width + 7.1, y: fp.y + fp.height + 3.3 })
    expect(racks().length).toBeGreaterThan(4)
    expectRegular()
    const inner = m.FR.innerOutline(fp, GS), far = Math.max(...inner.map(p => (vert ? p.x : p.y))) / GS
    const left = far - Math.max(...racks().map(r => ftS(foot(r))[1]))
    expect(left).toBeGreaterThanOrEqual(-1e-6)
    expect(left).toBeLessThan((2 * 42 + 9) / 12 + m.FR.DEFAULT_FILL_SETTINGS.aisleFt)
    clean()
  })

  it.each(SHAPES)('RA-regular-extend (%s): fill, then extend past the far edge across the rows to the wall — no aisle anywhere wider (or narrower) than the forklift aisle, no wide aisle where the first box ended; shrink back and extend again: identical; clean', (_, type, w, h, fw, fh) => {
    const fp = patternArea(type, w, h, fw, fh)
    expectRegular()
    const b0 = boxNow()
    const past = vert ? { ...b0, w: fp.x + fp.width + 17.9 - b0.x } : { ...b0, h: fp.y + fp.height + 11.3 - b0.y }
    resizeArea(past)
    expectRegular()
    clean()
    const extended = rackKeys()
    resizeArea(b0)
    clean()
    resizeArea(past)
    expect(rackKeys()).toEqual(extended)
  })

  it('RA-pdf: zones are drawn in the PDF (a tinted rectangle with the name), and not when the Zones layer is hidden', async () => {
    const { office } = officeLayout()
    const { buildLayoutSVG } = await import('../../export/pdfExport')
    const svgNow = () => buildLayoutSVG(s().objects, s().layers, GS).svg
    let svg = svgNow()
    expect(svg).toContain(`data-zone="${office.id}"`)
    expect(svg).toMatch(new RegExp(`<rect x="${office.x}" y="${office.y}" width="${office.width}" height="${office.height}" fill="#[0-9a-fA-F]{6}" fill-opacity="0.13"`))
    expect(svg).toMatch(/>Office<\/text>/)
    m.L.setLayer(m.useCanvasStore, 'zones', { visible: false })
    svg = svgNow()
    expect(svg).not.toContain('data-zone=')
    expect(svg).not.toMatch(/>Office<\/text>/)
    expect(svg).toContain('<g')                                           // the racks still print
  })

  it.each([['Keep racks', 0], ['Delete racks', 1]])('RA-delete: deleting a racking area asks "Delete the racks in this area too?" (the delete taken back meanwhile); %s — one undo step, and undo brings the area back exactly', async (label, i) => {
    officeLayout()
    const a = areaNow(), mine = racks().map(r => r.id), n0 = s().history.length, before = doc()
    s().selectObject(a.id); s().deleteSelected(); await tick()
    expect(question().text).toBe('Delete the racks in this area too?')
    expect(question().choices.map(c => c.label)).toEqual(['Keep racks', 'Delete racks'])
    expect(doc()).toEqual(before)
    expect(s().history.length).toBe(n0)
    m.AT.answerChoice(i); await tick()
    expect(question()).toBeNull()
    expect(areaNow()).toBeUndefined()
    expect(s().history.length).toBe(n0 + 1)
    if (label === 'Keep racks') {
      expect(racks().map(r => r.id).sort()).toEqual([...mine].sort())
      for (const r of racks()) expect(r.areaId).toBeUndefined()
      expect(check().errors).toEqual([])
    } else {
      expect(racks()).toHaveLength(0)
      expect(s().objects.some(o => o.type === 'aisle')).toBe(false)
      expect(s().objects.some(o => o.type === 'fp_rect')).toBe(true)
      expect(s().objects.some(o => o.type === 'zone_office')).toBe(true)
    }
    s().undo()
    expect(doc()).toEqual(before)
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

/* The case found in the app (horizontal, the mouse's own coordinates): a washroom top-left, the
   area over the bottom part, its top edge dragged past the wall. The new rows' first aisle off the
   old rows came out 9e-6 px under 10' 6" — fillRects rounded its cut positions to a millionth of a
   foot, and lined up with the rows below, that cut is an aisle edge. Cuts are now merged without
   moving them. */
describe('RA — the app\'s own coordinates', () => {
  it('RA-precision: extending across the rows at mouse coordinates leaves every aisle at its full width — Check layout finds nothing at all', async () => {
    const m = await fresh(), s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation: 'horizontal' })
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    expect([fp.x, fp.y]).toEqual([-4800, -2400])
    s().addObject({ type: 'zone_washroom', label: 'Washroom', x: -4790, y: -2390, width: 800, height: 600, parentId: fp.id, layerId: 'zones' })
    m.FT.startFill({ x: -4780.196329492104, y: -401.19504908237303 + 2859.581732821169 })
    m.FT.moveFill({ x: -4780.196329492104 + 9637.217242851046, y: -401.19504908237303 }, s().objects, GS)
    m.FT.commitFill(m.useCanvasStore)
    const a = s().objects.find(o => o.type === 'racking_area')
    // dragged past the walls: clipped to their inner faces (4790 right, 2390 bottom)
    expect([a.x, a.y, a.width, a.height]).toEqual([-4780.196329492104, -401.19504908237303, 4790 + 4780.196329492104, 2390 + 401.19504908237303])
    s().updateObject(a.id, { y: -2483.3333333333335, height: 4941.72001707213 })
    m.AT.finishAreaResize(m.useCanvasStore, a.id, { x: a.x, y: a.y, w: a.width, h: a.height })
    expect(s().objects.filter(o => o.type === 'rack_double_row' || o.type === 'rack_row').length).toBeGreaterThan(12)
    expect(m.LC.checkLayout(s().objects, { gridSize: GS })).toEqual({ errors: [], warnings: [] })
  })
})
