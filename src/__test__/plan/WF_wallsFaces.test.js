// Area WF — walls and faces.
//   1. Racking-area boxes and zones stay inside the building: an edge dragged
//      (or a zone dragged) past a wall stops at the wall's inner face, and
//      snaps onto it when close (utils/floorClamp.js) — on a rectangle, an L
//      and a T, live on the canvas and in the area resize itself.
//   2. No pick face without an aisle (generate/faceReach.js): a pair running
//      beside a zone or wall with one face against it loses that face's bays
//      along that stretch — single there, back-to-back elsewhere — in racking
//      areas (the pattern clip) and in Generate. Check layout stays clean, and
//      shrink → extend back still gives the same racks.
// Real store with the app's keepers installed; both orientations.
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
  const FC = await import('../../utils/floorClamp')
  const FG = await import('../../utils/floorGeom')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
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
  return { useCanvasStore, FT, FR, RA, AT, LC, FC, FG, BB, generateAndPlace, rackFootprint }
}

const RACK = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-3
const AISLE = 10.5
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
// [name, type, width, height, the area's share of each, a zone on the floor (ft from the corner: x, y, w, h)]
const SHAPES = [
  ['rectangle', 'fp_rect', 240, 120, 0.55, 0.6, [150, 80, 20, 15]],
  ['L', 'fp_l', 300, 200, 0.55, 0.8, [200, 160, 20, 15]],
  ['T', 'fp_t', 360, 240, 0.55, 0.6, [300, 20, 20, 15]],
]

describe.each(['horizontal', 'vertical'])('WF — %s', (orientation) => {
  const vert = orientation === 'vertical'
  let m, s
  beforeEach(async () => {
    m = await fresh(); s = () => m.useCanvasStore.getState()
    m.FT.useRackingSettings.setState({ ...m.FR.DEFAULT_FILL_SETTINGS, orientation })
    m.AT.useAreaPrompt.setState({ question: null })
  })
  const racks = () => s().objects.filter(o => RACK.has(o.type))
  const areaNow = () => s().objects.find(o => o.type === 'racking_area')
  const fpNow = () => s().objects.find(o => o.type.startsWith('fp_'))
  const foot = (o) => m.rackFootprint(o)
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })
  const drag = (a, b) => { m.FT.startFill(a); m.FT.moveFill(b, s().objects, GS); return m.FT.commitFill(m.useCanvasStore) }
  const boxNow = () => { const a = areaNow(); return { x: a.x, y: a.y, w: a.width, h: a.height } }
  const resizeArea = (box) => {
    const a = areaNow(), old = { x: a.x, y: a.y, w: a.width, h: a.height }
    s().updateObject(a.id, { x: box.x, y: box.y, width: box.w, height: box.h })
    if (!m.AT.finishAreaResize(m.useCanvasStore, a.id, old) && m.AT.useAreaPrompt.getState().question) m.AT.answerArea(true)
  }
  const innerBox = (fp) => { const p = m.FR.innerOutline(fp, GS), xs = p.map(q => q.x), ys = p.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }
  const wallOf = (fp) => innerBox(fp).x - fp.x
  const building = (type, w, h) => { s().placeFpObject({ type, widthFt: w, heightFt: h }); return fpNow() }
  const areaOver = (type, w, h, fw, fh) => {
    const fp = building(type, w, h)
    drag({ x: fp.x - 13.7, y: fp.y - 21.3 }, { x: fp.x + fp.width * fw + 7.1, y: fp.y + fp.height * fh + 3.3 })
    expect(racks().length).toBeGreaterThan(3)
    return fp
  }
  const addZone = (fp, b, parented = true) => {
    s().addObject({ type: 'zone_staging', label: 'Staging', x: b.x, y: b.y, width: b.w, height: b.h, ...(parented ? { parentId: fp.id } : {}), layerId: 'zones' })
    return s().objects.filter(o => o.type === 'zone_staging').pop()
  }
  const rackKeys = () => racks().map(o => [o.type, Math.round(o.x * 1e4), Math.round(o.y * 1e4), Math.round(o.width * 1e4), Math.round(o.height * 1e4), o.rotation || 0, o.beams.join('/'), o.rowIndex, o.genSection].join(':')).sort()

  /* ── 1. Inside the building ── */

  /** The face an area's right edge, dragged out, meets from inside: the right wall — on the T, the
   *  stem's right wall (the area reaches down into the stem). */
  const rightFace = (type, fp) => (type === 'fp_t' ? fp.x + 243 * GS - wallOf(fp) : innerBox(fp).x + innerBox(fp).w)

  it.each(SHAPES)('WF-area-wall (%s): a racking area\'s edge dragged past a wall stops at the wall\'s inner face — live on the canvas and in the resize itself; within 8 px of the face it snaps onto it; pulling it in is free', (_, type, w, h, fw, fh) => {
    const fp = areaOver(type, w, h, fw, fh)
    const a = areaNow(), face = rightFace(type, fp), bottom = innerBox(fp).y + innerBox(fp).h
    // the canvas, live: the right edge dragged 50' past the building
    const live = m.FC.clampResizeUpdates(s().objects, a, { x: a.x, width: fp.x + fp.width + 50 * GS - a.x }, { gridSize: GS, snap: 8 })
    expect(live.x + live.width).toBeCloseTo(face, 6)
    // within 8 px short of the face: snapped onto it
    const near = m.FC.clampResizeUpdates(s().objects, a, { width: face - 4 - a.x }, { gridSize: GS, snap: 8 })
    expect(near.x + near.width).toBeCloseTo(face, 6)
    // pulled in: free
    const pulled = m.FC.clampResizeUpdates(s().objects, a, { width: a.width / 2 }, { gridSize: GS, snap: 8 })
    expect(pulled.width).toBeCloseTo(a.width / 2, 6)
    // the resize itself (the store path the canvas lands on): right, then bottom, past the walls
    resizeArea({ ...boxNow(), w: fp.x + fp.width + 50 * GS - a.x })
    expect(areaNow().x + areaNow().width).toBeCloseTo(face, 6)
    resizeArea({ ...boxNow(), h: fp.y + fp.height + 50 * GS - areaNow().y })
    expect(areaNow().y + areaNow().height).toBeCloseTo(bottom, 6)
    expect(check().errors).toEqual([])
  })

  it.each(SHAPES)('WF-zone-wall (%s): a zone on the floor resized past a wall stops at the face; dragged past one, its leading edge stops at the face; a zone still outside the building moves freely', (_, type, w, h, fw, fh, zb) => {
    const fp = building(type, w, h)
    const z = addZone(fp, { x: fp.x + zb[0] * GS, y: fp.y + zb[1] * GS, w: zb[2] * GS, h: zb[3] * GS })
    const ib = innerBox(fp)
    const r = m.FC.clampResizeUpdates(s().objects, z, { width: fp.x + fp.width + 30 * GS - z.x }, { gridSize: GS })
    expect(r.x + r.width).toBeCloseTo(ib.x + ib.w, 6)
    // dragged down past the wall below it: on the T the bar's bottom wall, else the building's
    const below = type === 'fp_t' ? fp.y + 72 * GS - wallOf(fp) : ib.y + ib.h
    const d = m.FC.clampDragDelta(s().objects, z, 0, 400 * GS, { gridSize: GS })
    expect(z.y + z.height + d.dy).toBeCloseTo(below, 6)
    expect(d.dx).toBe(0)
    // outside the building: no clamp
    const out = addZone(fp, { x: fp.x - 100 * GS, y: fp.y, w: 20 * GS, h: 15 * GS }, false)
    expect(m.FC.clampDragDelta(s().objects, out, -37, 55, { gridSize: GS })).toEqual({ dx: -37, dy: 55 })
    void fw; void fh
  })

  /* ── 2. Every pick face has its aisle ── */

  const ftS = (f) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  const ftR = (f) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
  /** Every bay of every rack can be picked: a double's two faces each have an aisle of clear floor
   *  (on the building's floor, no zone) in front of them; a single, at least one side. */
  const expectFacesReachable = () => {
    const poly = m.FR.innerOutline(fpNow(), GS)
    const zones = s().objects.filter(o => o.type.startsWith('zone_')).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
    const clear = (b) => m.FG.boxOnFloor(poly, b) && !zones.some(z => overlap(z, b))
    const strip = (s0, s1, r0, r1) => (vert ? { x: s0, y: r0, w: s1 - s0, h: r1 - r0 } : { x: r0, y: s0, w: r1 - r0, h: s1 - s0 })
    const A = AISLE * GS
    for (const r of racks()) {
      const f = foot(r), [s0, s1] = ftS(f), [run0] = ftR(f), up = (r.uprightWidth ?? 3) / 12 * GS
      let at = run0
      r.beams.forEach((b, i) => {
        const b0 = at, b1 = at + 2 * up + (b / 12) * GS
        at += up + (b / 12) * GS
        const lo = clear(strip(s0 - A, s0, b0, b1)), hi = clear(strip(s1, s1 + A, b0, b1))
        if (r.type === 'rack_double_row') expect(lo && hi, `double row ${r.rowIndex} bay ${i}: both faces have an aisle`).toBe(true)
        else expect(lo || hi, `single row ${r.rowIndex} bay ${i}: a side with an aisle`).toBe(true)
      })
    }
  }
  /** A zone in the aisle on the far face of a double row shown now (`which`: the middle double row,
   *  or the outermost one — at the edge of the area), 5' deep, 1' off the face, over the middle third
   *  of that row's longest double. Returns the row's double, the zone, and its run range. */
  const zoneBeside = (fp, which) => {
    // the rows with a double at least 8 bays long (room for the zone and 2 bays of pair each side)
    const rows = [...new Set(racks().filter(r => r.type === 'rack_double_row').map(r => r.rowIndex))]
      .map(k => racks().filter(r => r.rowIndex === k && r.type === 'rack_double_row').sort((p, q) => q.beams.length - p.beams.length)[0])
      .filter(r => r.beams.length >= 8)
      .sort((p, q) => ftS(foot(p))[0] - ftS(foot(q))[0])
    expect(rows.length).toBeGreaterThan(1)
    const D = which === 'mid' ? rows[Math.floor(rows.length / 2)] : rows[rows.length - 1]
    const f = foot(D), [, s1] = ftS(f), [r0, r1] = ftR(f), bay = 99 / 12 * GS
    // 4 bays long (more on a long row: its middle third), centred
    const len = Math.max(4 * bay, (r1 - r0) / 3), mid = (r0 + r1) / 2
    const z0 = mid - len / 2, z1 = mid + len / 2
    const zb = vert ? { x: s1 + GS, y: z0, w: 5 * GS, h: z1 - z0 } : { x: z0, y: s1 + GS, w: z1 - z0, h: 5 * GS }
    expect(racks().filter(r => overlap(foot(r), zb))).toHaveLength(0)            // beside the racks, not over them
    return { D: JSON.parse(JSON.stringify(D)), zone: addZone(fp, zb), z0, z1 }
  }
  /** Row D along the zone: single rows only, at its near half; back-to-back beyond the zone. */
  const expectSingleBeside = ({ D, z0, z1 }, rowOf = (r) => r.rowIndex === D.rowIndex) => {
    const bay = 99 / 12 * GS, [ds0] = ftS(foot(D)), depth = (D.depthIn ?? 42) / 12 * GS
    const row = racks().filter(rowOf)
    const along = row.filter(r => { const [a, b] = ftR(foot(r)); return Math.min(b, z1 - bay) - Math.max(a, z0 + bay) > EPS })
    expect(along.length).toBeGreaterThan(0)
    for (const r of along) { expect(r.type, 'beside the zone').toBe('rack_row'); expect(ftS(foot(r))[0]).toBeCloseTo(ds0, 3); expect(ftS(foot(r))[1]).toBeCloseTo(ds0 + depth, 3) }
    const [d0, d1] = ftR(foot(D))
    const away = row.filter(r => r.type === 'rack_double_row' && (() => { const [a, b] = ftR(foot(r)); return a < z0 - 2 * bay && a >= d0 - EPS || b > z1 + 2 * bay && b <= d1 + EPS })())
    expect(away.length, 'back-to-back away from the zone').toBeGreaterThan(0)
  }
  /** Where a double turns single along a row, the single carries straight on from the double's last
   *  upright frame: no gap, exactly one upright of overlap, and that is a shared frame (not an
   *  overlap — Check layout stays clean). Returns how many such joins there are. */
  const expectSharedFrames = () => {
    const rows = new Map()
    for (const r of racks()) { const k = r.rowIndex ?? Math.round(ftS(foot(r))[0]); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(r) }
    let n = 0
    for (const list of rows.values()) {
      list.sort((p, q) => ftR(foot(p))[0] - ftR(foot(q))[0])
      for (let i = 0; i + 1 < list.length; i++) {
        const a = list[i], b = list[i + 1]
        if (a.type === b.type) continue
        const gap = ftR(foot(b))[0] - ftR(foot(a))[1]
        if (gap >= 8.5 * GS) continue                                                  // a cross-aisle between them
        const up = (a.uprightWidth ?? 3) / 12 * GS
        expect(gap / GS, `row ${a.rowIndex}: the single starts on the double's last frame (ft)`).toBeCloseTo(-up / GS, 6)
        expect(m.BB.sharesFrame(a, b, GS)).toBe(true)
        expect(m.BB.rackIssues(a, s().objects, GS).overlaps).not.toContain(b.id)
        n++
      }
    }
    return n
  }
  const expectClean = () => {
    const c = check()
    expect(c.errors.filter(e => e.kind === 'unreachable')).toEqual([])
    expect(c.errors).toEqual([])
    expectFacesReachable()
  }

  it.each(SHAPES.flatMap(sh => [[sh[0] + ', zone mid-area', ...sh.slice(1), 'mid'], [sh[0] + ', zone at the edge of the area', ...sh.slice(1), 'edge']]))('WF-area-face (%s): a zone in the aisle beside a pair — the pair is single along the zone\'s length and back-to-back elsewhere; every pick face has an aisle; Check layout clean; shrink → extend back identical', (_, type, w, h, fw, fh, _zb, which) => {
    const fp = areaOver(type, w, h, fw, fh)
    expectClean()
    const z = zoneBeside(fp, which)
    m.AT.requestAreaRebuild(m.useCanvasStore, areaNow().id, {})               // the area refitted with the zone there
    expectSingleBeside(z)
    expect(expectSharedFrames()).toBeGreaterThan(0)
    expect(check().errors.filter(e => e.kind === 'overlap')).toEqual([])
    expectClean()
    const keys = rackKeys(), b0 = boxNow()
    // pulled in, the right edge staying on its side of every wall (pushed back through an inner wall it would stop there)
    resizeArea({ ...b0, w: b0.w * 0.7 })
    expectClean()
    resizeArea(b0)
    expect(rackKeys()).toEqual(keys)
  })

  it.each(SHAPES)('WF-area-face-fill (%s): a zone placed first, then the area filled over it — the same: single beside the zone, back-to-back elsewhere, clean', (_, type, w, h, fw, fh) => {
    const fp = areaOver(type, w, h, fw, fh)
    const z = zoneBeside(fp, 'mid')
    const box = boxNow()
    s().selectObject(areaNow().id); s().deleteSelected()
    if (m.AT.useAreaPrompt.getState().question) m.AT.answerChoice(1)
    return new Promise(res => setTimeout(res, 0)).then(() => {
      if (m.AT.useAreaPrompt.getState().question) m.AT.answerChoice(1)
      expect(racks()).toHaveLength(0)
      drag({ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h })
      expectSingleBeside(z)
      expectClean()
    })
  })

  it('WF-generate-face: Generate (240 × 120) with a zone in the aisle beside a pair — the pair is single along the zone and back-to-back elsewhere; every pick face has an aisle; Check layout clean', () => {
    const brief = { lengthFt: 240, widthFt: 120, gridXFt: 0, gridYFt: 0, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 }
    m.generateAndPlace(brief)
    const fp = fpNow()
    const z = zoneBeside(fp, 'mid')
    // the zone stays when Generate runs again (it isn't the generated building's)
    s().updateObject(z.zone.id, { parentId: undefined })
    m.generateAndPlace(brief)
    expect(s().objects.some(o => o.type === 'zone_staging')).toBe(true)
    const [ds0] = ftS(foot(z.D))
    expectSingleBeside(z, (r) => { const [a] = ftS(foot(r)); return Math.abs(a - ds0) < EPS })
    expect(expectSharedFrames()).toBeGreaterThan(0)
    expectClean()
  })
})
