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
  const RG = await import('../../utils/rowGroupTool')
  const { rackFootprint } = await import('../../generate/columnCheck')
  const BB = await import('../../utils/bayBeam')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  installRowEditKeeper(useCanvasStore)
  RG.installRowGroupWatcher(useCanvasStore, nanoid)
  AT.installAreaKeeper(useCanvasStore)
  return { useCanvasStore, FT, FR, RA, AT, LC, RG, L, BB, rackFootprint }
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
    // (not the rows under the office: they reach the floor by a travel path, area AA, and the extend changes that way in)
    const underOffice = (r) => vert && foot(r).x + foot(r).w > office.x + EPS
    const away = oldRacks.filter(r => foot(r).y > oldTop + 99 / 12 * GS && !underOffice(r))
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
    // (not a wall row: one runs the area's whole length, so its centre is often the nearest)
    const r = [...racks()].filter(o => !flushOnWall(o)).sort((p, q) => dist(p) - dist(q))[0]
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
    const { fp, office } = officeLayout()
    const a = areaNow(), before = doc()
    // pull the far edge in by 37' 5" — not a whole number of bays
    const cut = (37 + 5 / 12) * GS
    const alongX = (axis === 'run') !== vert                             // horizontal rows run along x
    const box = alongX ? { x: a.x, y: a.y, w: a.width - cut, h: a.height } : { x: a.x, y: a.y, w: a.width, h: a.height - cut }
    const edge = alongX ? box.x + box.w : box.y + box.h
    // (not the rows under the office: they reach the floor by a travel path, area AA, which the shrink may move)
    const crossing = racks().filter(r => { const f = foot(r); return (alongX ? f.x < edge && f.x + f.w > edge : f.y < edge && f.y + f.h > edge) && !(axis === 'run' && vert && f.x + f.w > office.x + EPS) })
    expect(crossing.length).toBeGreaterThan(0)
    expect(resizeArea(box)).toBe(true)
    for (const r of racks()) { expect(within(foot(r), box)).toBe(true); expect(r.beams.every(b => b === 96)).toBe(true) }
    if (axis === 'run') {
      // trimmed to whole bays: each crossing row still reaches to within one bay (8' 3") of the new edge,
      // on the same uprights (the pattern's), from the same start
      for (const c of crossing) {
        const fc = foot(c), across = alongX ? fc.y : fc.x, start = alongX ? fc.x : fc.y
        const kept = racks().filter(r => Math.abs((alongX ? foot(r).y : foot(r).x) - across) < EPS && Math.abs((alongX ? foot(r).x : foot(r).y) - start) < EPS)
        // a piece with no whole bay left inside the new edge goes
        if (edge - start < 99 / 12 * GS - EPS) { expect(kept).toHaveLength(0); continue }
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
    const all = racks(), f = all.map(foot)
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) if (!m.BB.sharesFrame(all[i], all[j], GS)) expect(overlap(f[i], f[j])).toBe(false)
  })

  it('RA-zone: a staging zone placed over racks no area manages asks first (the placing taken back meanwhile); Continue places it and removes / trims the racks under it — no bay left under it; Cancel leaves it unplaced; Check layout clean but for the dead-end aisles the zone now closes (no area refits these racks); one undo', async () => {
    const { fp } = officeLayout()
    // the area deleted, its racks kept: racks no area manages
    s().selectObject(areaNow().id); s().deleteSelected(); await tick()
    m.AT.answerChoice(0); await tick()
    expect(areaNow()).toBeUndefined()
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
    // the zone closes the aisles of the row pieces between it and the wall: Check layout says so (no area refits these racks)
    expect(check().errors.filter(e => e.kind !== 'no-way-in')).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
  })

  it('RA-zone-area: a staging zone dropped over a racking area refits it at once — nothing asked, no bay left under the zone, the area\'s racks still on its pattern; ONE undo step with the zone, and one undo restores both exactly', async () => {
    const { fp } = officeLayout()
    const before = doc(), n0 = s().history.length
    const zone = { type: 'zone_staging', label: 'Staging', x: fp.x + 60 * GS, y: fp.y + 70 * GS, width: 40 * GS, height: 30 * GS, parentId: fp.id, layerId: 'zones' }
    const zb = { x: zone.x, y: zone.y, w: zone.width, h: zone.height }
    expect(racks().filter(r => overlap(foot(r), zb)).length).toBeGreaterThan(0)
    s().addObject(zone); await tick()
    expect(question()).toBeNull()
    expect(s().objects.some(o => o.type === 'zone_staging')).toBe(true)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb)).toBe(false)
    expectOnPattern()
    expect(s().history.length).toBe(n0 + 1)
    expect(check().errors).toEqual([])
    s().undo()
    expect(doc()).toEqual(before)
  })

  it('RA-zone-move: a zone moved or resized inside an area refits it on release, one undo step each — moved onto the racks clears them; moved back, every rack returns at its exact pattern place; grown, the racks under it go; shrunk back, they return', async () => {
    const { office } = officeLayout()
    const original = rackKeys(), n0 = s().history.length
    const zb = (z) => ({ x: z.x, y: z.y, w: z.width, h: z.height })
    // moved down onto the racks
    s().commitObjectUpdate(office.id, { y: office.y + 60 * GS }); await tick()
    expect(question()).toBeNull()
    let z = s().objects.find(o => o.id === office.id)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb(z))).toBe(false)
    expect(s().history.length).toBe(n0 + 1)
    expect(check().errors).toEqual([])
    // moved back where it was: the racks return, exactly
    s().commitObjectUpdate(office.id, { y: office.y }); await tick()
    expect(rackKeys()).toEqual(original)
    expect(s().history.length).toBe(n0 + 2)
    // grown 30' down into the area: the racks under it go (and pairs beside it turn single)
    s().commitObjectUpdate(office.id, { height: office.height + 30 * GS }); await tick()
    z = s().objects.find(o => o.id === office.id)
    expect(rackKeys()).not.toEqual(original)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb(z))).toBe(false)
    expect(check().errors).toEqual([])
    // shrunk back: they return at their pattern places
    s().commitObjectUpdate(office.id, { height: office.height }); await tick()
    expect(rackKeys()).toEqual(original)
    expect(question()).toBeNull()
    // one undo: the shrink and its refit together
    s().undo()
    z = s().objects.find(o => o.id === office.id)
    expect(z.height).toBe(office.height + 30 * GS)
    for (const r of racks()) for (const b of m.RA.bayBoxes(r, GS)) expect(overlap(b, zb(z))).toBe(false)
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
    const p = areaNow().pattern, pitch = (p.upIn + p.beamIn) / 12, g0 = p.pieces[0].r0
    for (const r of added) {
      // a wall row runs unbroken on the one grid the pattern fixes (area AA): its uprights on that grid
      if (flushOnWall(r)) {
        for (const u of uprights(r)) { const g = (u - g0) / pitch; expect(Math.abs(g - Math.round(g)), `wall row upright at ${u.toFixed(3)}' on the pattern's grid`).toBeLessThan(1e-6) }
        continue
      }
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
  /** A single row flush on a wall face across (area AA: a far edge on a wall ends with one, off the
   *  regular pattern, the aisle before it wider). */
  const flushOnWall = (r) => {
    if (r.type !== 'rack_row') return false
    const fp = s().objects.find(o => o.id === r.parentId) || s().objects.find(o => o.type.startsWith('fp_'))
    const faces = m.FR.innerOutline(fp, GS).map(p => (vert ? p.x : p.y) / GS), [s0, s1] = ftS(foot(r))     // feet, as ftS
    return faces.some(v => Math.abs(v - s1) < 1e-3 || Math.abs(v - s0) < 1e-3)
  }
  const meetR = (x, y) => Math.min(x[1], y[1]) - Math.max(x[0], y[0]) > 1e-3
  /** Area AA, the second-last row toward the wall: how far pattern row `row` may sit off its place,
   *  toward the far wall — worked out here, independently of the fill, from the zones and the single
   *  flush on the far wall. Only the last pair before that wall single; only for a zone on its start
   *  side closer than an aisle (overlapping it along); Δ = the aisle less that clearance, and only
   *  within the last aisle's slack. 0 when the row may not slide. */
  const slideOf = (row) => {
    const a = areaNow(), p = a?.pattern
    if (!p) return 0
    const dirS = p.dirS || 1, aisle = p.aisleFt, u = p.units.find(q => q.row === row)
    if (!u || u.type !== 'rack_double_row') return 0
    const own = racks().filter(o => o.areaId === a.id)
    const mine = own.filter(o => o.rowIndex === row && !flushOnWall(o))
    const mid = u.s0 + u.d / 2
    const walls = own.filter(o => flushOnWall(o) && dirS * (ftS(foot(o))[0] - mid) > 0 && mine.some(q => meetR(ftR(foot(q)), ftR(foot(o)))))
    if (!mine.length || !walls.length) return 0
    const wallNear = dirS > 0 ? Math.min(...walls.map(o => ftS(foot(o))[0])) : Math.max(...walls.map(o => ftS(foot(o))[1]))
    const lo = dirS > 0 ? u.s0 + u.d : wallNear, hi = dirS > 0 ? wallNear : u.s0
    // the last row before the wall single: no other rack of the area between them
    if (own.some(o => o.rowIndex !== row && !walls.includes(o) && ftS(foot(o))[1] > lo + 1e-6 && ftS(foot(o))[0] < hi - 1e-6 && mine.some(q => meetR(ftR(foot(q)), ftR(foot(o)))))) return 0
    const slack = hi - lo - aisle, start = dirS > 0 ? u.s0 : u.s0 + u.d
    let by = 0
    for (const z of s().objects.filter(o => o.type.startsWith('zone_'))) {
      const zb = { x: z.x, y: z.y, w: z.width, h: z.height }, [z0, z1] = ftS(zb)
      if (!mine.some(q => meetR(ftR(foot(q)), ftR(zb)))) continue
      const c = dirS > 0 ? start - z1 : z0 - start
      if (c > -1e-6 && c < aisle - 1e-6) by = Math.max(by, aisle - c)
    }
    return by > 1e-6 && by <= slack + 1e-6 ? by : 0
  }
  /** The pattern unit as rack `r` sits: moved by exactly its Δ (slideOf) when it sits there, else at its
   *  pattern place — so a row off its place by anything else still fails. */
  const unitAt = (r) => {
    const p = areaNow()?.pattern, u = p?.units.find(q => q.row === r.rowIndex)
    if (!u || flushOnWall(r)) return u
    const by = slideOf(r.rowIndex)
    if (!by) return u
    const v = { ...u, s0: u.s0 + (p.dirS || 1) * by }, single = p.depthIn / 12, [s0, s1] = ftS(foot(r))
    const spots = r.type === 'rack_double_row' ? [[v.s0, v.s0 + v.d]] : [[v.s0, v.s0 + single], [v.s0 + v.d - single, v.s0 + v.d]]
    return spots.some(([x, y]) => Math.abs(x - s0) < 1e-6 && Math.abs(y - s1) < 1e-6) ? v : u
  }
  /** Area AA, along the run: the floor at run position `at` (ft) beside rack `r` (mid-depth), and the
   *  zones and other racks across from it. */
  const alongCtx = (r) => {
    const fp = s().objects.find(o => o.id === r.parentId) || s().objects.find(o => o.type.startsWith('fp_')), inner = m.FR.innerOutline(fp, GS)
    const [s0, s1] = ftS(foot(r)), mid = (s0 + s1) / 2
    const pin = (at) => { const px = (vert ? mid : at) * GS, py = (vert ? at : mid) * GS; let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const P = inner[i], Q = inner[j]; if ((P.y > py) !== (Q.y > py) && px < (Q.x - P.x) * (py - P.y) / (Q.y - P.y) + P.x) c = !c } return c }
    const across = (b) => Math.min(ftS(b)[1], s1) - Math.max(ftS(b)[0], s0) > 1e-3
    const zones = s().objects.filter(o => o.type.startsWith('zone_')).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })).filter(across)
    const others = racks().filter(o => o !== r).map(foot).filter(across)
    return { pin, zones, others }
  }
  /** Area AA, item 2, strictly: a pocket row pushed tight against the building wall — one end exactly on
   *  the wall, the other facing a zone or a lane at least the travel width (8'), nothing between. */
  const tightOnWall = (r) => {
    const [r0, r1] = ftR(foot(r)), { pin, zones, others } = alongCtx(r), T = 8, up = 3 / 12
    for (const high of [true, false]) {
      const wallEnd = high ? !pin(r1 + 0.05) && pin(r1 - 0.05) : !pin(r0 - 0.05) && pin(r0 + 0.05)
      if (!wallEnd) continue
      // the near end: the nearest zone or rack the other way
      const near = [...zones.map(b => ({ b, zone: true })), ...others.map(b => ({ b, zone: false }))]
        .map(({ b, zone }) => ({ at: high ? ftR(b)[1] : ftR(b)[0], zone })).filter(q => (high ? q.at <= r0 + up + 1e-6 : q.at >= r1 - up - 1e-6))
        .sort((a, b) => (high ? b.at - a.at : a.at - b.at))[0]
      if (!near) return true
      const gap = high ? r0 - near.at : near.at - r1
      return near.zone || gap >= T - 1e-6
    }
    return false
  }
  /** Area AA, item 3, strictly: a row run on past its run's end toward a zone or a wall stops within a bay
   *  of it — one more bay would land on the zone or leave the floor — with no rack in that space. */
  const runOnToFixed = (r, high) => {
    const p = areaNow().pattern, pitch = (p.upIn + p.beamIn) / 12
    const [r0, r1] = ftR(foot(r)), { pin, zones, others } = alongCtx(r)
    const q0 = high ? r1 : r0 - pitch, q1 = high ? r1 + pitch : r0
    if (others.some(b => Math.min(ftR(b)[1], q1) - Math.max(ftR(b)[0], q0) > 1e-3)) return false
    return zones.some(b => Math.min(ftR(b)[1], q1) - Math.max(ftR(b)[0], q0) > 1e-3) || !pin(high ? q1 - 0.05 : q0 + 0.05)
  }
  const expectOnPattern = () => {
    const a = areaNow(), p = a.pattern, single = p.depthIn / 12, pitch = (p.upIn + p.beamIn) / 12
    expect(p).toBeTruthy()
    for (const r of racks().filter(o => o.areaId === a.id && a.placed[o.id] === m.RA.rackSig(o))) {
      const f = foot(r), [s0, s1] = ftS(f), [r0] = ftR(f)
      const u = unitAt(r)                                              // its pattern place, or slid by exactly its Δ
      expect(u, `row ${r.rowIndex} is a pattern row`).toBeTruthy()
      const spots = u.type !== 'rack_double_row' ? [[u.s0, u.s0 + u.d]]
        : r.type === 'rack_double_row' ? [[u.s0, u.s0 + u.d]] : [[u.s0, u.s0 + single], [u.s0 + u.d - single, u.s0 + u.d]]
      if (!flushOnWall(r)) expect(spots.some(([x, y]) => Math.abs(x - s0) < 1e-6 && Math.abs(y - s1) < 1e-6), `row ${r.rowIndex} on its place across`).toBe(true)
      const pc = p.pieces.find(q => q.sec === r.genSection)
      expect(pc, `section ${r.genSection} is a pattern run`).toBeTruthy()
      if (flushOnWall(r)) {
        // a wall row runs unbroken (area AA): its bays on the one grid the pattern fixes — its first run's uprights carried on
        const g = (r0 - p.pieces[0].r0) / pitch
        expect(Math.abs(g - Math.round(g)), `wall row ${r.rowIndex} on the pattern's grid`).toBeLessThan(1e-6)
        continue
      }
      const k = (r0 - pc.r0) / pitch
      if (Math.abs(k - Math.round(k)) > 1e-6) {
        // off its run's uprights only as a pocket row pushed tight against the wall (area AA), no more bays than its run
        expect(tightOnWall(r) && r.beams.length <= pc.n, `row ${r.rowIndex} on its run's uprights`).toBe(true)
        continue
      }
      const kk = Math.round(k)
      // past its run's end only where it runs on to a zone or a wall (area AA), within a bay of it
      if (kk < 0) expect(runOnToFixed(r, false), `row ${r.rowIndex} within its run (start)`).toBe(true)
      if (kk + r.beams.length > pc.n) expect(runOnToFixed(r, true), `row ${r.rowIndex} within its run (end)`).toBe(true)
    }
  }
  /** Never an extra row: any two racks side by side across (overlapping along) are at least an aisle
   *  apart — no single row back-to-back with another row. A single carrying on from a double's last
   *  upright frame (they share it) is one line, not two rows. */
  const expectAisles = () => {
    const aisleFt = m.FR.DEFAULT_FILL_SETTINGS.aisleFt
    const all = racks().map(r => ({ r, s: ftS(foot(r)), q: ftR(foot(r)) }))
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      if (Math.min(a.q[1], b.q[1]) - Math.max(a.q[0], b.q[0]) < 1e-3) continue
      if (m.BB.sharesFrame(a.r, b.r, GS)) continue                      // a single carrying on from a double's last frame
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
      if (flushOnWall(r)) continue                                    // moved out onto the far wall (area AA), not a cut half
      const u = unitAt(r)
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
      // (nor within an aisle of the single flush on the far wall, area AA: there the pair can't stay whole)
      const faceOpen = onFloor(strip) && !zones.some(z => overlap(z, strip)) && !racks().some(q => q !== r && flushOnWall(q) && overlap(foot(q), strip))
      expect(fits && faceOpen, `single row ${r.rowIndex}: its other half doesn't fit, or can't be picked`).toBe(false)
    }
  }
  /** Every aisle is the forklift aisle: each rack's next rack across (overlapping it along) is
   *  exactly one aisle off — none widened (no slack aisle anywhere), none narrowed — but for the aisle
   *  before a single flush on the far wall (area AA), at least one. Cross-aisles run along and aren't read. */
  /** The lanes the way-in step cut for the area as it stands in the store (its pattern refit from the
   *  store's objects): each { r: [along], s: [across] } in feet, exactly the strip it carved. */
  const wayInLanes = () => {
    const a = areaNow()
    if (!a?.pattern) return []
    const report = []
    m.FR.patternFill(s().objects.filter(o => !(RACK.has(o.type) && o.areaId === a.id)), boxNow(), a.pattern, { gridSize: GS, report })
    return report.map(q => ({ r: q.at.map(v => v / GS), s: q.across.map(v => v / GS) }))
  }
  const expectRegular = () => {
    const aisleFt = m.FR.DEFAULT_FILL_SETTINGS.aisleFt
    const lanes = wayInLanes()
    const all = racks().map(r => ({ r, s: ftS(foot(r)), q: ftR(foot(r)) }))
    let n = 0
    for (const a of all) {
      // (the nearest rack across, overlapping along by more than an upright; one meeting it along by less
      // than one bay is only a corner — a bay carried on past a wall line, the rows across ending short of
      // it — when the floor between is wider than the aisle: no aisle to measure, see below)
      const pat = areaNow()?.pattern, bayFt = ((pat?.beamIn ?? 96) + 2 * (pat?.upIn ?? 3)) / 12, upFt = (pat?.upIn ?? 3) / 12
      const next = all.filter(b => b !== a && b.s[0] >= a.s[1] - 1e-6 && Math.min(a.q[1], b.q[1]) - Math.max(a.q[0], b.q[0]) > upFt + 1e-3)
      if (!next.length) continue
      const b = next.reduce((p, q) => (q.s[0] < p.s[0] ? q : p)), gap = b.s[0] - a.s[1]
      if (Math.min(a.q[1], b.q[1]) - Math.max(a.q[0], b.q[0]) < bayFt - 1e-3 && gap > aisleFt + 1e-6 && !flushOnWall(b.r)) continue
      // a gap with a zone in it is not an aisle (an office between two rows)
      const g0 = Math.max(a.q[0], b.q[0]), g1 = Math.min(a.q[1], b.q[1])
      const strip = vert ? { x: a.s[1] * GS, y: g0 * GS, w: gap * GS, h: (g1 - g0) * GS } : { x: g0 * GS, y: a.s[1] * GS, w: (g1 - g0) * GS, h: gap * GS }
      if (gap > 1e-6 && s().objects.some(o => o.type.startsWith('zone_') && overlap({ x: o.x, y: o.y, w: o.width, h: o.height }, strip))) continue
      // nor a gap a way-in lane runs through: exactly its span — the two racks meet along only within the lane, which crosses the whole gap
      if (gap > 1e-6 && lanes.some(l => l.r[0] <= g0 + 1e-6 && l.r[1] >= g1 - 1e-6 && l.s[0] <= a.s[1] + 1e-6 && l.s[1] >= b.s[0] - 1e-6)) continue
      // the aisle before a single flush on the far wall may be wider: that single moved out onto the wall
      if (flushOnWall(b.r)) expect(gap, `the aisle after ${a.r.type} row ${a.r.rowIndex} (ft)`).toBeGreaterThanOrEqual(aisleFt - 1e-6)
      else {
        // the aisle before the second-last row slid toward the wall (area AA) is wider by exactly its Δ
        const pu = areaNow()?.pattern.units.find(q => q.row === b.r.rowIndex), bu = b.r.areaId ? unitAt(b.r) : pu
        const wider = pu && bu && bu !== pu ? Math.abs(bu.s0 - pu.s0) : 0
        expect(gap, `the aisle after ${a.r.type} row ${a.r.rowIndex} (ft)`).toBeCloseTo(aisleFt + wider, 6)
      }
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

  it('RA-copy: an area\'s resize is not a Row group edit — with every row in the group, a shrink that trims rows offers no apply and says nothing', async () => {
    officeLayout()
    await m.RG.flushRowGroupWatcher()
    m.RG.clearGroup()
    for (const r of racks()) m.RG.addRowOf(r.id)
    expect(m.RG.useRowGroup.getState().keys.length).toBeGreaterThan(1)
    const a = areaNow(), cut = (37 + 5 / 12) * GS
    resizeArea(vert ? { x: a.x, y: a.y, w: a.width, h: a.height - cut } : { x: a.x, y: a.y, w: a.width - cut, h: a.height })
    await m.RG.flushRowGroupWatcher()
    expect(m.RG.useRowGroup.getState().pending).toBe(null)
    expect(m.RG.useRowGroup.getState().message).toBe(null)
    m.RG.clearGroup()
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

  /* ── Area AA: the second-last row slides toward the wall ── */
  /** The whole building filled from its top-left corner (the far edge across the rows on the wall);
   *  the last pair before the single flush on the far wall: its pattern unit, its longest double
   *  beside a wall single, and the last aisle's slack there (ft). */
  const fillWhole = (type, w, h) => {
    s().placeFpObject({ type, widthFt: w, heightFt: h })
    const fp = s().objects.find(o => o.type === type)
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width + 7.1, y: fp.y + fp.height + 3.3 })
    return fp
  }
  const lastPair = () => {
    const a = areaNow(), p = a.pattern
    expect(p.dirS).toBe(1)
    const own = racks().filter(o => o.areaId === a.id), far = Math.max(...own.map(o => ftS(foot(o))[1]))
    const walls = own.filter(o => flushOnWall(o) && Math.abs(ftS(foot(o))[1] - far) < 1e-6)
    const before = own.filter(o => !walls.includes(o) && walls.some(q => meetR(ftR(foot(o)), ftR(foot(q)))))
    const top = Math.max(...before.map(o => ftS(foot(o))[1]))
    const row = before.find(o => Math.abs(ftS(foot(o))[1] - top) < 1e-6).rowIndex
    const u = p.units.find(q => q.row === row)
    const len = (o) => ftR(foot(o))[1] - ftR(foot(o))[0]
    const rk = before.filter(o => o.rowIndex === row && o.type === 'rack_double_row' && walls.some(q => meetR(ftR(foot(o)), ftR(foot(q))))).sort((x, y) => len(y) - len(x))[0]
    if (!rk || u.type !== 'rack_double_row') return null
    const wallNear = Math.min(...walls.filter(q => meetR(ftR(foot(rk)), ftR(foot(q)))).map(q => ftS(foot(q))[0]))
    return { u, row, rk, slack: wallNear - (u.s0 + u.d) - p.aisleFt, aisle: p.aisleFt, pitch: (p.upIn + p.beamIn) / 12, upFt: p.upIn / 12, beamFt: p.beamIn / 12 }
  }
  /** An office on the row's start side whose edge comes `c` feet short of its start face, 6' deep
   *  across, `along` feet along centred at `at` (ft, along the run). */
  const officeOff = (fp, u, c, at, along) => {
    const e = u.s0 - c
    const b = vert ? { x: (e - 6) * GS, y: (at - along / 2) * GS, w: 6 * GS, h: along * GS } : { x: (at - along / 2) * GS, y: (e - 6) * GS, w: along * GS, h: 6 * GS }
    s().addObject({ type: 'zone_office', label: 'Office', x: b.x, y: b.y, width: b.w, height: b.h, parentId: fp.id, layerId: 'zones' })
    return b
  }
  const rowNow = (row) => racks().filter(o => o.areaId === areaNow().id && o.rowIndex === row && !flushOnWall(o))
  const baysOf = (list) => list.reduce((t, o) => t + o.beams.length, 0)
  const acrossAt = (list, s0, d) => list.every(r => { const [a0, a1] = ftS(foot(r)), single = areaNow().pattern.depthIn / 12
    return r.type === 'rack_double_row' ? Math.abs(a0 - s0) < 1e-6 && Math.abs(a1 - (s0 + d)) < 1e-6 : [s0, s0 + d - single].some(x => Math.abs(a0 - x) < 1e-6) })
  /** The building, cut across (½' at a time) until the whole fill's last row before the far-wall
   *  single is a full pair with 2–9' of slack; with `slack`, cut further to leave exactly that. */
  const fitBuilding = async (type, w, h, slack = null) => {
    const build = async (k) => {
      m = await fresh(); s = () => m.useCanvasStore.getState()
      m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
      m.AT.useAreaPrompt.setState({ question: null })
      const fp = vert ? fillWhole(type, w - k, h) : fillWhole(type, w, h - k)
      return { fp, L: lastPair() }
    }
    for (let k = 0; k <= 20; k += 0.5) {
      const got = await build(k)
      if (!got.L || got.L.slack < 2 || got.L.slack > 9) continue
      if (slack == null) return got
      const fit = await build(k + got.L.slack - slack)
      expect(fit.L.slack).toBeCloseTo(slack, 6)
      return fit
    }
    throw new Error('no size leaves a full last pair with slack')
  }
  const SLIDE = [['rectangle', 'fp_rect', 240, 120], ['L', 'fp_l', 300, 200], ['T', 'fp_t', 360, 240]]

  it.each(SLIDE)('RA-slide (%s): an office on the start side of the last pair before the far-wall single, closer than an aisle — the WHOLE row slides toward the wall by exactly the aisle less that clearance: a full pair beside the office, its start face an aisle off its edge, nothing of its run lost, the aisle before it that much wider, every aisle ≥ the aisle; shrink → extend back identical; clean', async (_, type, w, h) => {
    const { fp, L } = await fitBuilding(type, w, h)
    clean()
    const by = Math.min(1.5, L.slack), before = baysOf(rowNow(L.row))
    const [r0, r1] = ftR(foot(L.rk))
    const office = officeOff(fp, L.u, L.aisle - by, (r0 + r1) / 2, 20)
    await tick()
    // the strict helpers first: a row off its place by anything but its Δ fails here
    clean()
    expect(slideOf(L.row)).toBeCloseTo(by, 6)
    // the whole row, along its full length: at the pattern place moved by exactly Δ
    const row = rowNow(L.row)
    expect(acrossAt(row, L.u.s0 + by, L.u.d), 'every rack of the row slid by Δ').toBe(true)
    // beside the office: a full pair, its start face exactly an aisle off the office's edge
    const beside = row.filter(r => meetR(ftR(foot(r)), ftR(office)))
    expect(beside.length).toBeGreaterThan(0)
    for (const r of beside) {
      expect(r.type).toBe('rack_double_row')
      expect(ftS(foot(r))[0] - ftS(office)[1]).toBeCloseTo(L.aisle, 6)
    }
    expect(baysOf(row), 'nothing of the row\'s run lost').toBe(before)
    clean()
    // shrink → extend back: identical — across (the far edge off the wall: no wall row, so no slide), and
    // along. Shallow cuts: an edge dragged back across a T's inner corner stops at that wall (floorClamp)
    const keys = rackKeys(), b0 = boxNow()
    for (const cut of vert ? [{ w: b0.w - 15.3 * GS }, { h: b0.h - 20.3 * GS }] : [{ h: b0.h - 15.3 * GS }, { w: b0.w - 20.3 * GS }]) {
      resizeArea({ ...b0, ...cut })
      const cutRow = rowNow(L.row)
      if (('w' in cut) === vert && cutRow.length) expect(acrossAt(cutRow, L.u.s0 + by, L.u.d), 'across: no wall row, so the row is not slid').toBe(false)
      clean()
      resizeArea(b0)
      expect(boxNow()).toEqual(b0)
      expect(rackKeys()).toEqual(keys)
    }
    clean()
  })

  it.each(SLIDE)('RA-slide-slack (%s, the building cut across to leave 2\' of slack): when the last aisle\'s slack is less than the slide the office needs, the row stays at its pattern place (the half facing the office loses its bays there, as before); clean', async (_, type, w, h) => {
    const { fp, L } = await fitBuilding(type, w, h, 2)
    clean()
    const need = L.slack + 0.75
    expect(need, 'a clearance to the office that the slack can\'t make up').toBeLessThan(L.aisle)
    const [r0, r1] = ftR(foot(L.rk))
    const office = officeOff(fp, L.u, L.aisle - need, (r0 + r1) / 2, 20)
    await tick()
    expect(slideOf(L.row)).toBe(0)
    const row = rowNow(L.row)
    expect(acrossAt(row, L.u.s0, L.u.d), 'the row at its pattern place').toBe(true)
    // beside the office only the far half is left
    const beside = row.filter(r => meetR(ftR(foot(r)), ftR(office)))
    expect(beside.length).toBeGreaterThan(0)
    for (const r of beside) expect(r.type).toBe('rack_row')
    clean()
  })

  it('RA-slide-column (rectangle): building columns standing in the row\'s flue, where the slid row\'s face would land on them — the slide would lose usable positions (X marks), so the row stays where it is; the same office with no columns: the row slides', async () => {
    const run = async (columns) => {
      m = await fresh(); s = () => m.useCanvasStore.getState()
      m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
      m.AT.useAreaPrompt.setState({ question: null })
      const fp = fillWhole('fp_rect', 240, 120)
      const L = lastPair(), by = Math.min(1.5, L.slack), p = areaNow().pattern
      const [r0, r1] = ftR(foot(L.rk))
      // the columns: on the row's flue line, one in each of three bays along the rack (not under the office)
      const flue = L.u.s0 + p.depthIn / 12 + p.flueIn / 24
      const bayMid = (k) => r0 + L.upFt + L.beamFt / 2 + k * L.pitch
      const along = [1, 3, 5].map(bayMid)
      if (columns) for (const a of along) {
        const c = vert ? { x: flue * GS, y: a * GS } : { x: a * GS, y: flue * GS }
        s().addObject({ type: 'column_grid', x: c.x, y: c.y, spacingX: [], spacingY: [], columnW: GS, columnH: GS, colSizeIn: 12, parentId: fp.id })
      }
      await tick()
      // the office faces one bay of the row, away from the columns
      const n = Math.floor((r1 - r0) / L.pitch)
      const office = officeOff(fp, L.u, L.aisle - by, bayMid(n - 2), 2)
      await tick()
      return { L, by, row: rowNow(L.row), office }
    }
    const bare = await run(false)
    expect(acrossAt(bare.row, bare.L.u.s0 + bare.by, bare.L.u.d), 'no columns: the row slides').toBe(true)
    const held = await run(true)
    expect(acrossAt(held.row, held.L.u.s0, held.L.u.d), 'columns: the row stays at its pattern place').toBe(true)
    // the reason: slid, it would lose usable positions to the columns; here none are lost in the row
    const res = m.LC.checkLayout(s().objects, { gridSize: GS })
    expect(res.errors).toEqual([])
    clean()
  })

  it('RA-regular-strict: the strict aisle check still catches a real over-wide aisle — one row of a regular fill moved 1\' 6" across by hand: the check fails', () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width + 7.1, y: fp.y + fp.height + 3.3 })
    expectRegular()
    // an interior pair, full length along (it faces rows either side over many bays)
    const pairs = racks().filter(o => o.type === 'rack_double_row').sort((p, q) => ftS(foot(p))[0] - ftS(foot(q))[0])
    const r = pairs[Math.floor(pairs.length / 2)]
    s().commitObjectUpdate(r.id, vert ? { x: r.x + 1.5 * GS } : { y: r.y + 1.5 * GS })
    expect(() => expectRegular()).toThrow()
  })

  it('RA-regular-strict-lanes: with way-in lanes cut (an office pocket), the strict aisle check still catches a real over-wide aisle away from them — one row moved 1\' 6" across: the check fails', async () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 240, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    // an office 30' off the near wall: its pocket is opened by a lane
    const ob = vert ? { x: fp.x + 40 * GS, y: fp.y + 30 * GS, w: 30 * GS, h: 30 * GS } : { x: fp.x + 30 * GS, y: fp.y + 40 * GS, w: 30 * GS, h: 30 * GS }
    s().addObject({ type: 'zone_office', label: 'Office', x: ob.x, y: ob.y, width: ob.w, height: ob.h, parentId: fp.id, layerId: 'zones' })
    await tick()
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width + 7.1, y: fp.y + fp.height + 3.3 })
    expect(wayInLanes().length, 'a lane cut').toBeGreaterThan(0)
    expectRegular()
    // an interior pair at least 20' from every lane (across or along) and from the office, moved by hand
    const lanes = wayInLanes(), s0s = racks().map(o => ftS(foot(o))[0]), lo = Math.min(...s0s), hi = Math.max(...s0s)
    const far = (q0, q1, a0, a1) => q1 < a0 - 20 || q0 > a1 + 20
    const pairs = racks().filter(o => { if (o.type !== 'rack_double_row') return false; const [s0, s1] = ftS(foot(o)), [r0, r1] = ftR(foot(o))
      return s0 > lo + 20 && s1 < hi - 20 && [...lanes, { s: ftS(ob), r: ftR(ob) }].every(l => far(s0, s1, l.s[0], l.s[1]) || far(r0, r1, l.r[0], l.r[1])) })
      .sort((p, q) => ftS(foot(p))[0] - ftS(foot(q))[0])
    const r = pairs[0]
    expect(r).toBeTruthy()
    s().commitObjectUpdate(r.id, vert ? { x: r.x + 1.5 * GS } : { y: r.y + 1.5 * GS })
    expect(() => expectRegular()).toThrow()
  })

  it.each(SLIDE)('RA-half-on (%s): a zone over one half of a pair only (3" into it, off the bay grid along) — the other half carries on from the pair\'s last frame, sharing that upright: no bay with an aisle in front left empty; clean', async (_, type, w, h) => {
    const fp = fillWhole(type, w, h)
    const p = areaNow().pattern, pitch = (p.upIn + p.beamIn) / 12, single = p.depthIn / 12, up = p.upIn / 12
    // a long interior pair, away from the walls across
    const s0s = racks().map(o => ftS(foot(o))[0]), lo = Math.min(...s0s), hi = Math.max(...s0s)
    const pair = racks().filter(o => o.type === 'rack_double_row' && o.beams.length >= 8 && ftS(foot(o))[0] > lo + 30 && ftS(foot(o))[1] < hi - 30)
      .sort((a, b) => b.beams.length - a.beams.length)[0]
    expect(pair, 'a long interior pair').toBeTruthy()
    const [p0, p1] = ftS(foot(pair)), [r0] = ftR(foot(pair)), row = pair.rowIndex
    // the office: from 3 bays and 3' in along, 20' long; across, from 6' before the pair to 3" into it
    const o0 = r0 + 3 * pitch + 3
    const zb = vert ? { x: (p0 - 6) * GS, y: o0 * GS, w: 6.25 * GS, h: 20 * GS } : { x: o0 * GS, y: (p0 - 6) * GS, w: 20 * GS, h: 6.25 * GS }
    s().addObject({ type: 'zone_office', label: 'Office', x: zb.x, y: zb.y, width: zb.w, height: zb.h, parentId: fp.id, layerId: 'zones' })
    await tick()
    clean()
    const mine = racks().filter(o => o.rowIndex === row)
    const before = mine.find(o => o.type === 'rack_double_row' && Math.abs(ftS(foot(o))[0] - p0) < 1e-6 && ftR(foot(o))[1] <= o0 + 1e-6 && ftR(foot(o))[1] > o0 - pitch)
    const half = mine.find(o => o.type === 'rack_row' && Math.abs(ftS(foot(o))[0] - (p1 - single)) < 1e-6 && Math.abs(ftS(foot(o))[1] - p1) < 1e-6 && ftR(foot(o))[0] < o0 + 20)
    expect(before, 'the pair stops at its last whole bay before the office').toBeTruthy()
    expect(half, 'the free half beside the office').toBeTruthy()
    expect(ftR(foot(half))[0], 'the half starts on the pair\'s last frame').toBeCloseTo(ftR(foot(before))[1] - up, 6)
    expect(m.BB.sharesFrame(before, half, GS)).toBe(true)
  })

  /* ── Area AA: a wall row runs unbroken ── */
  /** Every single flush on a wall runs as far as it can: one more bay of the pattern's grid at either end
   *  would leave the box or the floor, or land on a zone or a travel path the way in cut (its report). */
  const expectWallRowsWhole = () => {
    const a = areaNow(), p = a.pattern, pitch = (p.upIn + p.beamIn) / 12
    const fp = s().objects.find(o => o.id === a.parentId), inner = m.FR.innerOutline(fp, GS)
    const pin = (px, py) => { let c = false; for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) { const P = inner[i], Q = inner[j]; if ((P.y > py) !== (Q.y > py) && px < (Q.x - P.x) * (py - P.y) / (Q.y - P.y) + P.x) c = !c } return c }
    const onFloor = (b) => [[b.x + 0.01, b.y + 0.01], [b.x + b.w - 0.01, b.y + 0.01], [b.x + 0.01, b.y + b.h - 0.01], [b.x + b.w - 0.01, b.y + b.h - 0.01]].every(([x, y]) => pin(x, y))
      && !inner.some(q => q.x > b.x + 0.01 && q.x < b.x + b.w - 0.01 && q.y > b.y + 0.01 && q.y < b.y + b.h - 0.01)
    const zones = s().objects.filter(o => o.type.startsWith('zone_')).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
    const report = []
    m.FR.patternFill(s().objects.filter(o => !(RACK.has(o.type) && o.areaId === a.id)), boxNow(), p, { gridSize: GS, report })
    const lanes = report.map(q => q.at).filter(Boolean)
    const box = boxNow()
    const walls = racks().filter(o => o.areaId === a.id && flushOnWall(o))
    expect(walls.length).toBeGreaterThan(0)
    for (const r of walls) {
      const [s0, s1] = ftS(foot(r)), [r0, r1] = ftR(foot(r))
      for (const [q0, q1] of [[r0 - pitch, r0], [r1, r1 + pitch]]) {
        const b = vert ? { x: s0 * GS, y: q0 * GS, w: (s1 - s0) * GS, h: (q1 - q0) * GS } : { x: q0 * GS, y: s0 * GS, w: (q1 - q0) * GS, h: (s1 - s0) * GS }
        const lane = lanes.some(([l0, l1]) => Math.min(l1, q1 * GS) - Math.max(l0, q0 * GS) > EPS)
        const fits = within(b, box) && onFloor(b) && !zones.some(z => overlap(z, b)) && !racks().some(o => o !== r && overlap(foot(o), b)) && !lane
        expect(fits, `wall row ${r.rowIndex} stops where one more bay fits (${q0.toFixed(2)}–${q1.toFixed(2)}')`).toBe(false)
      }
    }
    return walls
  }
  /** Where the pattern's rows (not the wall rows) break along the run: their cross-aisles (ft). */
  const crossAisles = () => {
    const a = areaNow(), rows = new Map()
    for (const o of racks().filter(o => o.areaId === a.id && !flushOnWall(o))) { if (!rows.has(o.rowIndex)) rows.set(o.rowIndex, []); rows.get(o.rowIndex).push(ftR(foot(o))) }
    const out = []
    for (const list of rows.values()) { list.sort((x, y) => x[0] - y[0]); for (let i = 1; i < list.length; i++) if (list[i][0] - list[i - 1][1] >= a.pattern.aisleFt - 1e-6) out.push([list[i - 1][1], list[i][0]]) }
    return out
  }

  it.each(SLIDE)('RA-wall-row (%s, max run 60\'): a single flush on a wall — the start wall\'s and the far wall\'s — is one rack per stretch of wall: not broken where a cross-aisle meets it (it runs on through, longer than the max run), its bays on the pattern\'s grid, as far as whole bays fit; shrink → extend back identical; clean', async (_, type, w, h) => {
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation, maxRunFt: 60 })
    fillWhole(type, w, h)
    clean()
    const walls = expectWallRowsWhole()
    const ca = crossAisles()
    expect(ca.length, 'the rows have cross-aisles').toBeGreaterThan(0)
    // a wall row runs on through every cross-aisle beside it, longer than the max run
    const through = walls.filter(r => { const [r0, r1] = ftR(foot(r)); return ca.some(([c0, c1]) => r0 < c0 - 1e-6 && r1 > c1 + 1e-6) })
    expect(through.length, 'a wall row runs through a cross-aisle').toBeGreaterThan(0)
    for (const r of through) expect(ftR(foot(r))[1] - ftR(foot(r))[0]).toBeGreaterThan(60)
    // shrink → extend back: identical (along, across)
    const keys = rackKeys(), b0 = boxNow()
    for (const cut of vert ? [{ h: b0.h - 20.3 * GS }, { w: b0.w - 15.3 * GS }] : [{ w: b0.w - 20.3 * GS }, { h: b0.h - 15.3 * GS }]) {
      resizeArea({ ...b0, ...cut })
      clean()
      expectWallRowsWhole()
      resizeArea(b0)
      expect(boxNow()).toEqual(b0)
      expect(rackKeys()).toEqual(keys)
    }
  })

  it('RA-wall-zone (rectangle, max run 60\'): a zone against the far wall still interrupts its wall row — two racks, one either side of it, each running up to it by whole bays; none under it; clean', async () => {
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation, maxRunFt: 60 })
    const fp = fillWhole('fp_rect', 240, 120)
    const ib = innerBox(fp)
    // an office 20' along × 12' across, against the far wall, in the middle along the run
    const z = vert ? { x: ib.x + ib.w - 12 * GS, y: ib.y + ib.h / 2 - 10 * GS, w: 12 * GS, h: 20 * GS } : { x: ib.x + ib.w / 2 - 10 * GS, y: ib.y + ib.h - 12 * GS, w: 20 * GS, h: 12 * GS }
    s().addObject({ type: 'zone_office', label: 'Office', x: z.x, y: z.y, width: z.w, height: z.h, parentId: fp.id, layerId: 'zones' })
    await tick()
    clean()
    const far = vert ? ib.x + ib.w : ib.y + ib.h
    const farWall = racks().filter(o => flushOnWall(o) && Math.abs((vert ? foot(o).x + foot(o).w : foot(o).y + foot(o).h) - far) < 1e-3)
    expect(farWall).toHaveLength(2)
    for (const o of racks()) expect(overlap(foot(o), z), 'nothing under the office').toBe(false)
    expectWallRowsWhole()
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
