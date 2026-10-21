// Area ZF — zone follow-ups (canvas2/zoneSelection.js selectedZones, generate/faceAisles.js, utils/pairCarryOn.js,
// generate/rackingArea.js planAreaResize, utils/layoutCheck.js). On the hand-check layout (realLayout.fixture.js),
// rows horizontal as saved and vertical on the layout turned 90°:
//   1. a selected zone shows its size;
//   2. a pick face with a zone or a wall in front of it is graded like a rack-to-rack aisle — amber under the
//      pick width, red under the drive width, listed in Check layout, its width label coloured; a zone covering
//      only part of a bay counts for that bay; a single's back is not a face; a rack in front is the
//      rack-to-rack aisle's business;
//   3. a pair growing over its row's singles takes the bays of EVERY piece it covers (a single split in two
//      included) — the matching rules as before; nothing left under the pair;
//   and two found on the way: a zone refit no longer trims a hand-lengthened rack to the area's box, and two
//   racks of one row overlapping read apart in Check layout.
import { describe, it, expect, vi } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaCreate, planAreaResize } from '../../generate/rackingArea'
import { faceObstacleGaps, faceAisleLabels } from '../../generate/faceAisles'
import { narrowAisleBlocks } from '../../generate/narrowAisles'
import { usableCapacity } from '../../generate/usableCapacity'
import { rackFootprint, MHE_PROFILES } from '../../generate/columnCheck'
import { checkLayout } from '../../utils/layoutCheck'
import { takeOverCarriedBays } from '../../utils/pairCarryOn'
import { geom } from '../../utils/rowGroup'
import { selectedZones } from '../../canvas2/zoneSelection'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'
import * as Panel from '../../components/RightPanel/panels/RackRowPanelCore.jsx'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

const BEAM = new Set(['rack_row', 'rack_double_row'])
const E = 1e-6
const tick = () => new Promise(r => setTimeout(r, 0))
const turn = (o) => { const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }; if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x })); if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW }); return t }
const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
const shaped = (fp, cuts) => { if (!cuts.length) return fp; const X = (ft) => fp.x + ft * GS, Y = (ft) => fp.y + ft * GS, W = fp.width / GS, H = fp.height / GS; const v = [[0, 0], [W, 0]]; if (cuts.includes('br')) v.push([W, 170], [W - 150, 170], [W - 150, H]); else v.push([W, H]); if (cuts.includes('bl')) v.push([150, H], [150, 170], [0, 170]); else v.push([0, H]); return { ...fp, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) } }
/** The fixture filled (a new area over its box), rows horizontal as saved / vertical turned; `hand`: the area gone. */
function fixture(vert, { hand = false, shape = 'rectangle' } = {}) {
  const base = REAL_LAYOUT.filter(o => !BEAM.has(o.type)).map(o => (o.type.startsWith('fp_') ? shaped(o, SHAPE_CUTS[shape]) : { ...o })).map(o => (vert ? turn(o) : o))
  const area = base.find(o => o.type === 'racking_area'), box = { x: area.x, y: area.y, w: area.width, h: area.height }
  let objs = planAreaCreate(base.filter(o => o !== area), box, { ...area.settings, orientation: vert ? 'vertical' : 'horizontal' }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
  if (hand) objs = objs.filter(o => o.type !== 'racking_area').map(o => (o.areaId ? (({ areaId, ...r }) => r)(o) : o))
  return JSON.parse(JSON.stringify(objs))
}
const R = (f, vert) => (vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w]), S = (f, vert) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const boxRS = (vert, r0, r1, s0, s1) => (vert ? { x: s0, y: r0, w: s1 - s0, h: r1 - r0 } : { x: r0, y: s0, w: r1 - r0, h: s1 - s0 })
/** A pair near the middle, with a 60'+ run. */
const midPair = (objs) => {
  const fp = objs.find(o => o.type.startsWith('fp_')), c = { x: fp.x + fp.width / 2, y: fp.y + fp.height / 2 }
  return objs.filter(o => o.type === 'rack_double_row').map(o => ({ o, f: rackFootprint(o) })).filter(p => Math.max(p.f.w, p.f.h) >= 60 * GS)
    .sort((a, b) => Math.hypot(a.f.x + a.f.w / 2 - c.x, a.f.y + a.f.h / 2 - c.y) - Math.hypot(b.f.x + b.f.w / 2 - c.x, b.f.y + b.f.h / 2 - c.y))[0]
}
const zone = (b, type = 'zone_washroom', label = 'Washroom') => ({ id: 'wz', type, label, x: b.x, y: b.y, width: b.w, height: b.h, layerId: 'zones' })
const ORIENT = [['horizontal rows', false], ['vertical rows', true]]

describe.each(ORIENT)('ZF — %s', (_, vert) => {
  it('ZF-label: a selected zone gets its size label (every selected zone; not the one being resized, which draws its own; not a rack)', () => {
    const objs = fixture(vert, { hand: true }), z = objs.find(o => o.type === 'zone_office'), w = objs.find(o => o.type === 'zone_washroom'), r = objs.find(o => BEAM.has(o.type))
    expect(selectedZones(objs, [z.id]).map(o => o.id)).toEqual([z.id])
    expect(selectedZones(objs, [z.id, w.id, r.id]).map(o => o.id).sort()).toEqual([z.id, w.id].sort())
    expect(selectedZones(objs, [z.id, w.id], z.id).map(o => o.id)).toEqual([w.id])
    expect(selectedZones(objs, [r.id])).toEqual([])
  })

  // (before the narrow-aisle change these were Check layout items: amber "… needs 10' 6" to pick", red "… needs 8' to drive")
  it('ZF-face-zone: the user\'s case — a washroom 9\' 9" in front of a pair\'s face: not a Check layout item; every bay of that face along the washroom gets an X mark and its positions come off usable; the label amber; 7\' → the same, the label red; 11\' → nothing', () => {
    for (const [ft, lvl] of [[9.75, 2], [7, 1], [11, 3]]) {
      const objs = fixture(vert, { hand: true }), { o, f } = midPair(objs), [r0, r1] = R(f, vert), [s0] = S(f, vert), rm = (r0 + r1) / 2
      const zb = boxRS(vert, rm - 12 * GS, rm + 12 * GS, s0 - ft * GS - 6 * GS, s0 - ft * GS)
      const all = [...objs, zone(zb)]
      const res = checkLayout(all, { gridSize: GS })
      expect([ft, [...res.errors, ...res.warnings].filter(e => e.ids.includes('wz') && /aisle/.test(e.kind))]).toEqual([ft, []])
      const labels = faceAisleLabels(all, GS).filter(L => L.rackId === o.id)
      const marks = narrowAisleBlocks(all, { gridSize: GS }).filter(b => b.rackId === o.id)
      const u = usableCapacity(all, { profile: MHE_PROFILES.reach, gridSize: GS }), u0 = usableCapacity(objs, { profile: MHE_PROFILES.reach, gridSize: GS })
      if (lvl === 3) { expect([ft, labels, marks, u.usable]).toEqual([ft, [], [], u0.usable]); continue }
      expect(labels.map(L => [L.level, L.text])).toEqual([[lvl, lvl === 1 ? "7'" : `9' 9"`]])
      // the bays along the washroom (24'), one face: every position on them, off usable
      const bays = new Set(marks.map(b => b.bayIndex))
      expect(marks.every(b => b.faces.length === 1 && b.faces[0] === marks[0].faces[0])).toBe(true)
      expect(bays.size).toBeGreaterThanOrEqual(3)
      expect(u0.usable - u.usable).toBe(marks.reduce((t, b) => t + b.positionsLost, 0))
      expect(u.narrowLost).toBe(u0.usable - u.usable + u0.narrowLost)
    }
  })

  it('ZF-face-partial: a zone covering only part of a bay\'s length counts for that bay — the stretch reads its narrowest width over every bay it touches', () => {
    const objs = fixture(vert, { hand: true }), { o, f } = midPair(objs), [r0] = R(f, vert), [s0] = S(f, vert)
    // 2' long, inside the pair's 3rd bay only (its run span 2 pitches + a little in)
    const a = r0 + 2 * 99 / 12 * GS + 2 * GS
    const all = [...objs, zone(boxRS(vert, a, a + 2 * GS, s0 - 9 * GS - 4 * GS, s0 - 9 * GS))]
    const gaps = faceObstacleGaps(all, { gridSize: GS }).filter(g => g.rack.id === o.id)
    expect(gaps.length).toBe(1)
    expect(gaps[0].width / GS).toBeCloseTo(9, 6)
    // the stretch is that one bay
    expect(R(gaps[0].box, vert).map(v => (v - r0) / GS)).toEqual([2 * 99 / 12, 3 * 99 / 12 + 0.25].map(v => expect.closeTo(v, 6)))
  })

  it('ZF-face-wall: a pair whose face stands 5\' off the building\'s wall: that face X-marked bay by bay, its positions off usable, the label red, no Check layout item (before: an error "… and the wall: 5\', needs 8\' to drive"); a single with its back to the wall is not graded', () => {
    const L = vert ? 60 : 100, W = vert ? 100 : 60
    const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: W * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L * GS, y: 0 }, { x: L * GS, y: W * GS }, { x: 0, y: W * GS }] }
    const ps = sizingSheetLayout({ lengthFt: L, widthFt: W, gridXFt: 0, gridYFt: 0, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 3, wallThicknessIn: 3 }, DEFAULT_RULES)
    const racks = ps.map(placementToObject).map((r, i) => ({ ...r, id: 'r' + i, parentId: 'fp' }))
    expect(faceObstacleGaps([fp, ...racks], { gridSize: GS })).toEqual([])            // Generate's wall singles: their backs
    // a pair moved so its face is 5' off the near wall
    const p = racks.find(r => r.type === 'rack_double_row'), g = rackFootprint(p), [ps0] = S(g, vert), d = (0.25 + 5) * GS - ps0
    const moved = racks.filter(r => r.type === 'rack_double_row' && r.id === p.id).map(r => (vert ? { ...r, x: r.x + d } : { ...r, y: r.y + d }))
    const res = checkLayout([fp, ...moved], { gridSize: GS })
    expect(res.errors.filter(e => /aisle/.test(e.kind))).toEqual([])
    const marks = narrowAisleBlocks([fp, ...moved], { gridSize: GS })
    expect(new Set(marks.map(b => b.bayIndex)).size).toBe(p.beams.length)                // every bay of that face
    expect(faceAisleLabels([fp, ...moved], GS).map(L => [L.level, L.text])).toEqual([[1, "5'"]])
    expect(usableCapacity([fp, ...moved], { profile: MHE_PROFILES.reach, gridSize: GS }).narrowLost).toBe(marks.reduce((t, b) => t + b.positionsLost, 0))
  })

  it('ZF-face-rack: a face with a rack nearest in front is the rack-to-rack aisle\'s, not graded here — a zone behind that rack changes nothing', () => {
    const objs = fixture(vert, { hand: true }), { o, f } = midPair(objs), [r0, r1] = R(f, vert), [s0] = S(f, vert), rm = (r0 + r1) / 2
    // the next row across is 10' 6" off; a zone just past it
    const zb = boxRS(vert, rm - 12 * GS, rm + 12 * GS, s0 - 30 * GS, s0 - 22 * GS)
    expect(faceObstacleGaps([...objs, zone(zb)], { gridSize: GS }).filter(g => g.rack.id === o.id)).toEqual([])
  })

  it('ZF-face-fixture: the 12 fills and the four Generate layouts — no face with a zone or a wall in front of it fails (nothing new appears)', () => {
    for (const shape of Object.keys(SHAPE_CUTS)) for (const hand of [false, true]) expect([shape, hand, faceObstacleGaps(fixture(vert, { hand, shape }), { gridSize: GS }).length]).toEqual([shape, hand, 0])
    for (const [L, W] of [[250, 500], [300, 420]]) {
      const [l, w] = vert ? [L, W] : [W, L]
      const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: l * GS, height: w * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: l * GS, y: 0 }, { x: l * GS, y: w * GS }, { x: 0, y: w * GS }] }
      const ps = sizingSheetLayout({ lengthFt: l, widthFt: w, gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 3, wallThicknessIn: 3 }, DEFAULT_RULES)
      expect(faceObstacleGaps([fp, ...ps.map(placementToObject).map(r => ({ ...r, parentId: 'fp' }))], { gridSize: GS }).length).toBe(0)
    }
  })

  it('ZF-take-split: row 12\'s single lengthened by hand to 4 bays, a washroom over its 2nd bay (it splits in two), moved away; the pair grown 4 bays in one action → it takes the bays of BOTH pieces: nothing left under it, no overlap', async () => {
    vi.resetModules()
    const { useCanvasStore: St } = await import('../../store/useCanvasStore')
    const { nanoid } = await import('nanoid')
    const AT = await import('../../utils/rackingAreaTool'), PK = await import('../../utils/pairCarryOn'), AK = await import('../../utils/aisleKeeper')
    AK.installAisleKeeper(St, nanoid); PK.installPairKeeper(St); AT.installAreaKeeper(St)
    const s = () => St.getState()
    // the layout as saved (row 12's pair carrying on as a single), its area gone: racks placed by hand
    const objs0 = REAL_LAYOUT.map(o => ({ ...o })), area = objs0.find(o => o.type === 'racking_area')
    let saved = planAreaResize(objs0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
    if (!vert) saved = saved.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
    saved = JSON.parse(JSON.stringify(saved.filter(o => o.type !== 'racking_area').map(o => (o.areaId ? (({ areaId, ...r }) => r)(o) : o))))
    St.setState({ objects: saved, groups: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: saved, groups: [] })], historyIndex: 0 })
    await tick()
    const row = () => s().objects.filter(o => BEAM.has(o.type) && o.genSection === 2 && o.rowIndex === 12)
    let single = row().find(o => o.type === 'rack_row')
    for (let i = 0; i < 2; i++) { single = s().objects.find(o => o.id === single.id); s().commitObjectUpdate(single.id, Panel.addBayUpdate(single, 96, GS)); await tick(); await tick() }
    single = s().objects.find(o => o.id === single.id)
    const g = geom(single), f = rackFootprint(single), mid = g.r0 + (99 / 12) * GS * 1.5, rot = g.vert
    const zb = rot ? { x: f.x - GS, y: mid - 2 * GS, w: f.w + 2 * GS, h: 4 * GS } : { x: mid - 2 * GS, y: f.y - GS, w: 4 * GS, h: f.h + 2 * GS }
    s().addObject({ type: 'zone_washroom', label: 'Washroom', x: zb.x, y: zb.y, width: zb.w, height: zb.h, parentId: single.parentId, layerId: 'zones' }); await tick(); await tick()
    // the washroom over its 2nd bay: that bay goes, and the 1-bay piece left beside it goes with the cut (zoneCut.js,
    // shorter than 2 bays) — the 2-bay piece stays
    expect(row().filter(o => o.type === 'rack_row').map(o => o.beams.length)).toEqual([2])
    const z = s().objects.find(o => o.type === 'zone_washroom' && Math.abs(o.x - zb.x) < 1)
    s().commitObjectUpdate(z.id, rot ? { x: z.x + 60 * GS } : { y: z.y + 60 * GS }); await tick(); await tick()
    // moved away: the single comes back whole, exactly as it was (4 bays, its own id)
    expect(row().filter(o => o.type === 'rack_row').map(o => [o.id, o.beams.length])).toEqual([[single.id, 4]])
    const pair = row().find(o => o.type === 'rack_double_row')
    let grown = pair
    for (let i = 0; i < 4; i++) grown = { ...grown, ...Panel.addBayUpdate(grown, 96, GS) }
    s().commitObjectUpdate(pair.id, { x: grown.x, y: grown.y, width: grown.width, height: grown.height, beams: grown.beams }); await tick(); await tick()
    expect(row().map(o => o.type)).toEqual(['rack_double_row'])
    expect(row()[0].beams.length).toBe(16)
    expect(checkLayout(s().objects, { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.includes(pair.id))).toEqual([])
  })

  it('ZF-take-rules: every piece on the half gives up the bays the new ones cover exactly; a piece whose bay is off the grid (a 108" beam) keeps it — that overlap stays, and Check layout reads it apart: "Row 12, section 2: the pair overlaps the single by …"', () => {
    const objs0 = REAL_LAYOUT.map(o => ({ ...o })), area = objs0.find(o => o.type === 'racking_area')
    let before = planAreaResize(objs0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
    if (!vert) before = before.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
    const isRow = (o) => BEAM.has(o.type) && o.genSection === 2 && o.rowIndex === 12
    // the single cut in two by hand: its first bay one piece, its second another (same uprights)
    const single = before.find(o => isRow(o) && o.type === 'rack_row'), g = geom(single)
    const [p1, p2] = [0, 1].map(i => ({ ...single, id: 'piece' + i, beams: [96], ...withRunOf(single, g.r0 + i * (99 / 12) * GS) }))
    const split = before.filter(o => o.id !== single.id).concat([p1, p2])
    const pair = split.find(o => isRow(o) && o.type === 'rack_double_row')
    const grow = (k, beam = 96) => { let q = pair; for (let i = 0; i < k; i++) q = { ...q, ...Panel.addBayUpdate(q, beam, GS) }; return split.map(o => (o.id === pair.id ? q : o)) }
    const both = takeOverCarriedBays(split, grow(2), GS, () => 'n')
    expect(both.objects.filter(o => isRow(o) && o.type === 'rack_row')).toEqual([])
    expect(both.taken.map(t => t.single).sort()).toEqual(['piece0', 'piece1'])
    // the second piece a 108" bay: it keeps it, the overlap stays — and reads apart
    const off = split.map(o => (o.id === 'piece1' ? { ...o, ...Panel.changeBayUpdate(o, 0, 108, GS) } : o))
    const after = takeOverCarriedBays(off, grow(2).map(o => (o.id === 'piece1' ? off.find(q => q.id === 'piece1') : o)), GS, () => 'n').objects
    expect(after.filter(o => isRow(o) && o.type === 'rack_row').map(o => o.id)).toEqual(['piece1'])
    const ov = checkLayout(after, { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.includes('piece1'))
    expect(ov.length).toBe(1)
    expect(ov[0].text).toMatch(/^Row 12, section 2: the (pair|single) overlaps the (single|pair) by /)
  })

  it('ZF-refit-keeps: a single lengthened by hand past its Fill area\'s box keeps those bays when a zone is dropped near the area (the area refits over the same box; before, they were trimmed to the box)', async () => {
    vi.resetModules()
    const { useCanvasStore: St } = await import('../../store/useCanvasStore')
    const { nanoid } = await import('nanoid')
    const AT = await import('../../utils/rackingAreaTool'), AK = await import('../../utils/aisleKeeper')
    AK.installAisleKeeper(St, nanoid); AT.installAreaKeeper(St)
    const s = () => St.getState()
    const objs0 = REAL_LAYOUT.map(o => ({ ...o })), area = objs0.find(o => o.type === 'racking_area')
    let saved = planAreaResize(objs0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })
    if (!vert) saved = saved.map(o => { if (!BEAM.has(o.type)) return turn(o); const f = rackFootprint(o), r = ((o.rotation || 0) % 360 + 360) % 360; return { ...o, rotation: r === 270 ? 180 : 0, x: f.y, y: f.x } })
    saved = JSON.parse(JSON.stringify(saved))
    St.setState({ objects: saved, groups: [], selectedIds: [], gridSize: GS, history: [JSON.stringify({ objects: saved, groups: [] })], historyIndex: 0 })
    await tick()
    let single = s().objects.find(o => o.type === 'rack_row' && o.genSection === 2 && o.rowIndex === 12)
    for (let i = 0; i < 2; i++) { single = s().objects.find(o => o.id === single.id); s().commitObjectUpdate(single.id, Panel.addBayUpdate(single, 96, GS)); await tick(); await tick() }
    single = s().objects.find(o => o.id === single.id)
    expect(single.beams.length).toBe(4)
    const a = s().objects.find(o => o.type === 'racking_area'), ab = { x: a.x, y: a.y, w: a.width, h: a.height }
    expect(R(rackFootprint(single), geom(single).vert)[1]).toBeGreaterThan(R(ab, geom(single).vert)[1])           // past the box
    // a staging zone dropped in the area, well away from row 12
    const f = rackFootprint(single), far = geom(single).vert ? { x: f.x - 120 * GS, y: f.y - 60 * GS, w: 30 * GS, h: 30 * GS } : { x: f.x - 60 * GS, y: f.y - 120 * GS, w: 30 * GS, h: 30 * GS }
    s().addObject({ type: 'zone_staging', label: 'Staging', x: far.x, y: far.y, width: far.w, height: far.h, parentId: single.parentId, layerId: 'zones' }); await tick(); await tick()
    expect(s().objects.find(o => o.id === single.id)?.beams.length).toBe(4)
  })
})

/** The single `o` re-placed with its first upright at run position r (world px), one bay. */
function withRunOf(o, r) {
  const g = geom(o), up = ((o.uprightWidth || 3) / 12) * GS, w = (2 * up + (96 / 12) * GS)
  const f = rackFootprint(o)
  if (!g.vert) return { width: w, x: r }
  // a vertical rack is stored turned about its centre: place its centre
  const cx = f.x + f.w / 2, cy = r + w / 2
  return { width: w, x: cx - w / 2, y: cy - o.height / 2 }
}
void MHE_PROFILES
