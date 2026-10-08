// Area LC — "Check layout": every problem in the layout, listed, grouped
// ERRORS / WARNINGS; clicking one selects it and zooms to it; the PDF export
// asks when there are errors (never blocks). Every rule is an existing one
// (utils/layoutCheck.js). Both orientations; a HAND-DRAWN building (four
// double rows placed by hand, 11 ft aisles) with one problem made at a time,
// and a clean GENERATED layout.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const LC = await import('../../utils/layoutCheck')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { rackFootprint, MHE_PROFILES } = await import('../../generate/columnCheck')
  const UC = await import('../../generate/usableCapacity'), LO = await import('../../render/labelOps')
  return { useCanvasStore, LC, generateAndPlace, rackFootprint, MHE_PROFILES, UC, LO }
}

const W = ((3 * 4 + 3 * 96) / 12) * GS            // 3 × 96" bays, 3" uprights: 1000 px
const H = ((42 * 2 + 9) / 12) * GS                // 42" deep faces + 9" flue: 310 px
const AISLE = 11 * GS                              // over the reach truck's 10' 6"

const key = (x, y) => Math.round(x * 1000) / 1000 + ',' + Math.round(y * 1000) / 1000

describe.each(['horizontal', 'vertical'])('LC — %s', (orientation) => {
  const rot = orientation === 'vertical' ? 90 : 0
  let m, s, fp
  /** A double row with its centre at (along, across) in the building. */
  const rack = (along, across, extra = {}) => {
    const cx = rot ? across : along, cy = rot ? along : across
    return { type: 'rack_double_row', x: cx - W / 2, y: cy - H / 2, width: W, height: H, rotation: rot, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4, ...extra }
  }
  const across = (d) => (rot ? { x: d } : { y: d })        // a move across, as fields to add
  const racks = () => s().objects.filter(o => o.type === 'rack_double_row')
  const move = (r, dAcross, dAlong = 0) => s().commitObjectUpdate(r.id, rot ? { x: r.x + dAcross, y: r.y + dAlong } : { x: r.x + dAlong, y: r.y + dAcross })
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })
  const kinds = (list) => list.map(i => i.kind)
  /** Hand-drawn: a 400 × 400 building, four double rows across it, 11 ft aisles. */
  const handDrawn = () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 400, heightFt: 400 })
    fp = s().objects.find(o => o.type === 'fp_rect')
    for (let i = 0; i < 4; i++) s().addObject({ ...rack(0, -1500 + i * (H + AISLE)), parentId: fp.id })
  }
  /** One column centred at (along, across). */
  const columnAt = (along, acrossC) => {
    const cx = rot ? acrossC : along, cy = rot ? along : acrossC
    s().addObject({ type: 'column_grid', x: cx, y: cy, spacingX: [100000], spacingY: [100000], columnW: GS, columnH: GS, colSizeIn: 12, parentId: fp.id })
  }
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })
  /** Centres of every X mark the canvas draws for the layout now. */
  const xmarkCentres = () => {
    const res = m.UC.runColumnCheck(s().objects, { gridSize: GS }), out = []
    for (const c of res ? [...res.rackConflicts, ...res.pickBlocks] : []) {
      const ops = m.LO.blockedFaceOps(c, s().objects.find(o => o.id === c.rackId), GS, 1)
      for (let i = 0; i < ops.length; i += 2) { const p = ops[i].points; out.push(key((p[0] + p[2]) / 2, (p[1] + p[3]) / 2)) }
    }
    return out.sort()
  }

  it('LC-clean: a clean generated layout (240 × 120, 30 × 30 grid) and the hand-drawn one have no errors', async () => {
    m.generateAndPlace({ lengthFt: 240, widthFt: 120, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    expect(check().errors).toEqual([])
    const m2 = await fresh(); m = m2
    handDrawn()
    expect(check()).toEqual({ errors: [], warnings: [] })
  })

  it('LC-aisle: an aisle too narrow to drive is an ERROR ("… 7\', needs 8\' to drive"); one it can drive but not pick from is a WARNING ("… 9\', needs 10\' 6\" to pick"); generated rows are named "rows 4 and 5, section 3"', async () => {
    handDrawn()
    const [a, b] = racks()
    move(b, -(AISLE - 7 * GS))                                               // 7' from row a
    let r = check()
    expect(kinds(r.errors)).toEqual(['aisle-drive'])
    expect(r.errors[0].text).toBe("Aisle between double row 1 and double row 2: 7', needs 8' to drive")
    expect(r.errors[0].ids.sort()).toEqual([a.id, b.id].sort())
    move(racks()[1], 2 * GS)                                                 // 9'
    r = check()
    expect(r.errors).toEqual([])
    expect(kinds(r.warnings)).toEqual(['aisle-pick'])
    expect(r.warnings[0].text).toBe("Aisle between double row 1 and double row 2: 9', needs 10' 6\" to pick")
    // generated naming
    const m2 = await fresh(); m = m2
    m.generateAndPlace({ lengthFt: 240, widthFt: 120, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const inS1 = racks().filter(o => o.genSection === 1), k = Math.min(...inS1.map(o => o.rowIndex))
    const r5 = inS1.find(o => o.rowIndex === k), r6 = inS1.find(o => o.rowIndex === k + 1)
    const f5 = m.rackFootprint(r5), f6 = m.rackFootprint(r6)
    const gap = rot ? f6.x - (f5.x + f5.w) : f6.y - (f5.y + f5.h)
    move(r5, gap - 7 * GS)
    expect(check().errors.map(e => e.text)).toContain(`Aisle between rows ${k} and ${k + 1}, section 1: 7', needs 8' to drive`)
  })

  it('LC-overlap: racks overlapping each other — an ERROR naming both, with how far', () => {
    handDrawn()
    const [a, b] = racks()
    move(b, -(AISLE + GS))                                                   // 1' into row a
    const r = check()
    const o = r.errors.find(e => e.kind === 'overlap')
    expect(o.text).toBe("Double row 1 overlaps double row 2 by 1'")
    expect(o.ids.sort()).toEqual([a.id, b.id].sort())
  })

  it('LC-outside: a rack past a wall (how far) and one outside the building — ERRORS', () => {
    handDrawn()
    const [a] = racks()
    const wall = (fp.wallThicknessFt ?? 0.25) * GS, f = m.rackFootprint(a)
    const innerEnd = rot ? fp.y + fp.height - wall : fp.x + fp.width - wall, end = rot ? f.y + f.h : f.x + f.w
    move(a, 0, innerEnd - end + (9 / 12) * GS)                               // along, 9" past the inner face
    let r = check()
    expect(r.errors.find(e => e.kind === 'outside').text).toBe('Double row 1: past the wall by 9"')
    s().addObject(rack(0, 20000))                                            // no building around it
    r = check()
    expect(r.errors.map(e => e.text)).toContain('Double row 5: outside the building')
  })

  it('LC-upright: a column on an upright frame — an ERROR on that rack', () => {
    handDrawn()
    const [a] = racks()
    const f = m.rackFootprint(a)
    const alongStart = rot ? f.y : f.x, acrossStart = rot ? f.x : f.y
    columnAt(alongStart + (1.5 / 12) * GS, acrossStart + (21 / 12) * GS)      // on the first frame, in face 0
    const e = check().errors.find(x => x.kind === 'upright')
    expect(e.text).toBe('Double row 1: a column stands on an upright frame')
    expect(e.ids).toEqual([a.id])
  })

  it('LC-unreachable: a rack with no aisle on any pick side (back to back both ways) — an ERROR; the rows either side are still reachable', () => {
    handDrawn()
    const [a, b, c] = racks()
    move(b, -AISLE)                                                           // back to back with a
    move(c, -2 * AISLE)                                                       // back to back with b
    const r = check()
    expect(r.errors.filter(e => e.kind === 'unreachable').map(e => e.ids[0])).toEqual([b.id])
    expect(r.errors.find(e => e.kind === 'unreachable').text).toBe('Double row 2: no aisle on any pick side — nobody can reach it')
    void a; void c
  })

  it('LC-columns: columns blocking pallets — a WARNING with the count of lost positions', () => {
    handDrawn()
    const [a] = racks()
    const f = m.rackFootprint(a)
    const alongStart = rot ? f.y : f.x, acrossStart = rot ? f.x : f.y
    columnAt(alongStart + ((3 + 48) / 12) * GS, acrossStart + (21 / 12) * GS)  // mid bay 1, face 0
    const w = check().warnings.find(x => x.kind === 'columns-lost')
    expect(w.text).toMatch(/^Double row 1: columns block \d+ pallet positions$/)
    expect(w.positions).toBeGreaterThan(0)
    expect(check().errors).toEqual([])
  })

  it('LC-oversized: a bay too short for the pallet — a WARNING', () => {
    handDrawn()
    const [a] = racks()
    s().commitObjectUpdate(a.id, { beams: [96, 36, 96] })
    const w = check().warnings.find(x => x.kind === 'oversized')
    expect(w.text).toBe('Double row 1: bay 2 (36") too short for a 40" pallet — holds nothing')
  })

  it('LC-angled: an angled rack whose column losses weren\'t checked — a WARNING (only where there are columns)', () => {
    handDrawn()
    const [, , , d] = racks()
    s().commitObjectUpdate(d.id, { rotation: rot + 30 })
    expect(check().warnings.filter(x => x.kind === 'angled')).toEqual([])      // no columns: nothing unchecked
    columnAt(5000, 5000)
    const w = check().warnings.find(x => x.kind === 'angled')
    expect(w.text).toBe(`Double row 4: angled ${rot + 30}° — its column losses weren't checked`)
  })

  it('LC-click: clicking an item selects NOTHING (a selection there is cleared), centres the spot and highlights the problem; the next click on the canvas or the next check clears it, and that click then selects only the row it lands on', () => {
    handDrawn()
    const [a, b, c] = racks()
    move(b, -(AISLE - 7 * GS))
    s().selectGroup([c.id])
    const item = check().errors[0]
    const ids = m.LC.goToIssue(m.useCanvasStore, item, { w: 1200, h: 800 })
    expect(ids.sort()).toEqual([a.id, b.id].sort())                            // involved, not selected
    expect(s().selectedIds).toEqual([])
    expect(m.LC.useLayoutCheck.getState().highlight).toMatchObject({ kind: 'aisle-drive', shapes: item.highlight })
    // the next click: the highlight goes; the click selects the row it lands on, only that one
    m.LC.clearIssueHighlight(); s().selectObject(a.id, false)
    expect(m.LC.useLayoutCheck.getState().highlight).toBe(null)
    expect(s().selectedIds).toEqual([a.id])
    const ci = readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')
    expect(ci).toMatch(/const onStageMouseDown = \(e\) => \{\s*\n\s*const stage = stageRef\.current\s*\n\s*if \(!stage\) return\s*\n\s*\/\/[^\n]*\n\s*clearIssueHighlight\(\)/)
    // a re-check clears it too
    m.LC.goToIssue(m.useCanvasStore, item, { w: 1200, h: 800 })
    m.LC.runLayoutCheck(m.useCanvasStore)
    expect(m.LC.useLayoutCheck.getState().highlight).toBe(null)
    expect(readFileSync('src/canvas2/Canvas2.jsx', 'utf8')).toMatch(/<IssueHighlight \/>/)
    expect(readFileSync('src/canvas2/IssueHighlight.jsx', 'utf8')).toMatch(/<Group ref=\{ref\} name="issue-highlight" listening=\{false\}>/)
    const { zoom, panX, panY } = s()                                            // the spot is centred
    expect((item.box.x + item.box.w / 2) * zoom + panX).toBeCloseTo(600, 6)
    expect((item.box.y + item.box.h / 2) * zoom + panY).toBeCloseTo(400, 6)
  })

  it('LC-highlight: each issue highlights the PROBLEM itself, at the right place — the aisle gap shaded red "7\' · needs 8\'"; the overlap area; the upright frame the column stands on (orange); an unreachable rack outlined red; a too-short bay and the bay that loses pallets shaded', () => {
    handDrawn()
    const [a, b, c, d] = racks()
    const F = (o) => m.rackFootprint(s().objects.find(q => q.id === o.id))
    const near = (p, q) => ['x', 'y', 'w', 'h'].every(k => Math.abs(p[k] - q[k]) < 1e-6)
    const inside = (pt, r) => pt.x >= r.x - 1e-6 && pt.x <= r.x + r.w + 1e-6 && pt.y >= r.y - 1e-6 && pt.y <= r.y + r.h + 1e-6
    const hlOf = (kind) => { const r = check(); return [...r.errors, ...r.warnings].find(i => i.kind === kind).highlight }
    // narrow aisle: the gap between a and b, red, labelled
    move(b, -(AISLE - 7 * GS))
    let h = hlOf('aisle-drive')
    const fa = F(a), fb = F(b)
    const gap = rot ? { x: fa.x + fa.w, y: fa.y, w: fb.x - (fa.x + fa.w), h: fa.h } : { x: fa.x, y: fa.y + fa.h, w: fa.w, h: fb.y - (fa.y + fa.h) }
    expect(h).toHaveLength(1)
    expect(near(h[0], gap)).toBe(true)
    expect(h[0]).toMatchObject({ color: m.LC.HL.red, mode: 'fill', label: "7' · needs 8'" })
    move(racks()[1], AISLE - 7 * GS)
    // overlap: exactly the shared area
    move(racks()[1], -(AISLE + GS))
    h = hlOf('overlap')
    const f1 = F(a), f2 = F(racks()[1])
    const x0 = Math.max(f1.x, f2.x), y0 = Math.max(f1.y, f2.y)
    expect(near(h[0], { x: x0, y: y0, w: Math.min(f1.x + f1.w, f2.x + f2.w) - x0, h: Math.min(f1.y + f1.h, f2.y + f2.h) - y0 })).toBe(true)
    expect(h[0]).toMatchObject({ color: m.LC.HL.red, mode: 'fill' })
    move(racks()[1], AISLE + GS)
    // unreachable: c back to back on both sides → its outline
    move(racks()[1], -AISLE); move(racks()[2], -2 * AISLE)
    h = hlOf('unreachable')
    expect(near(h[0], F(racks()[1]))).toBe(true)
    expect(h[0]).toMatchObject({ color: m.LC.HL.red, mode: 'outline' })
    move(racks()[1], AISLE); move(racks()[2], 2 * AISLE)
    // oversized: bay 2 of d
    s().commitObjectUpdate(d.id, { beams: [96, 36, 96] })
    h = hlOf('oversized')
    const fd = F(d), up = (3 / 12) * GS, alongStart = rot ? fd.y : fd.x
    const b2 = { start: alongStart + up + (96 / 12) * GS + up, len: (36 / 12) * GS }
    expect(h).toHaveLength(1)
    expect(near(h[0], rot ? { x: fd.x, y: b2.start, w: fd.w, h: b2.len } : { x: b2.start, y: fd.y, w: b2.len, h: fd.h })).toBe(true)
    expect(h[0]).toMatchObject({ color: m.LC.HL.amber, mode: 'fill' })
    // column on the first upright of a (face 0): that frame, orange, containing the column
    const fa0 = F(a), aAlong = rot ? fa0.y : fa0.x, aAcross = rot ? fa0.x : fa0.y
    const colAt = { along: aAlong + (1.5 / 12) * GS, across: aAcross + (21 / 12) * GS }
    columnAt(colAt.along, colAt.across)
    h = hlOf('upright')
    const pt = rot ? { x: colAt.across, y: colAt.along } : { x: colAt.along, y: colAt.across }
    expect(h.length).toBeGreaterThanOrEqual(1)
    expect(h.every(q => q.color === m.LC.HL.orange && q.mode === 'fill')).toBe(true)
    expect(h.some(q => inside(pt, q))).toBe(true)
    expect(Math.min(...h.map(q => (rot ? q.h : q.w)))).toBeCloseTo(up, 6)       // an upright's width, not the rack
    // a column mid-bay in b's face: exactly the blocked positions (the X marks' spots), not the bay
    const fbb = F(b), bAlong = rot ? fbb.y : fbb.x, bAcross = rot ? fbb.x : fbb.y
    const mid = { along: bAlong + up + (48 / 12) * GS, across: bAcross + (21 / 12) * GS }
    columnAt(mid.along, mid.across)
    h = hlOf('columns-lost')
    const mp = rot ? { x: mid.across, y: mid.along } : { x: mid.along, y: mid.across }
    expect(h.every(q => q.mode === 'xmark' && q.color === m.LC.HL.red)).toBe(true)
    expect(h.some(q => inside(mp, q))).toBe(true)
    const bayLen = (96 / 12) * GS, depth = (42 / 12) * GS
    for (const q of h) expect(Math.max(q.w, q.h)).toBeLessThan(bayLen)                // one position, never the bay or the row
    for (const q of h) expect(Math.min(q.w, q.h)).toBeLessThanOrEqual(depth + 1e-6)
    expect(xmarkCentres()).toEqual(h.map(q => key(q.x + q.w / 2, q.y + q.h / 2)).sort())
    void c
  })

  it('LC-xmarks: on a generated layout, a section\'s "columns block pallets" highlight is exactly that section\'s X marks — one glowing X per blocked position, none over a whole bay or row', async () => {
    m.generateAndPlace({ lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const items = check().warnings.filter(w => w.kind === 'columns-lost')
    expect(items.length).toBeGreaterThan(1)
    const item = items[1]
    const sec = s().objects.find(o => o.id === item.ids[0]).genSection
    expect(item.text.startsWith(`Section ${sec}:`)).toBe(true)
    // the X marks drawn for that section's racks (render/labelOps.js blockedFaceOps): their centres
    const res = m.UC.runColumnCheck(s().objects, { gridSize: GS })
    const inSec = new Set(s().objects.filter(o => o.genSection === sec).map(o => o.id))
    const centres = []
    for (const c of [...res.rackConflicts, ...res.pickBlocks]) {
      if (!inSec.has(c.rackId)) continue
      const ops = m.LO.blockedFaceOps(c, s().objects.find(o => o.id === c.rackId), GS, 1)
      for (let i = 0; i < ops.length; i += 2) { const p = ops[i].points; centres.push(key((p[0] + p[2]) / 2, (p[1] + p[3]) / 2)) }
    }
    expect(centres.length).toBeGreaterThan(10)
    expect(item.highlight.map(q => key(q.x + q.w / 2, q.y + q.h / 2)).sort()).toEqual(centres.sort())
    const bayLen = (96 / 12) * GS
    expect(item.highlight.every(q => q.mode === 'xmark' && Math.max(q.w, q.h) < bayLen)).toBe(true)
    // the painter draws them as a glowing X
    expect(readFileSync('src/canvas2/IssueHighlight.jsx', 'utf8')).toMatch(/name="issue-hl:xmark"[\s\S]*shadowBlur=\{14\}[\s\S]*<Line points=\{\[0, 0, s\.w, s\.h\]\}/)
  })

  it('LC-zoom: going to an issue keeps the zoom and centres it — at 15 % a column on an upright stays at 15 %, centred; at 5 % (too far out to see) it zooms to 20 %, never more; a long aisle is centred without zooming in', async () => {
    const size = { w: 1200, h: 800 }
    const centred = (b) => { const { zoom, panX, panY } = s(); return Math.abs((b.x + b.w / 2) * zoom + panX - size.w / 2) < 1e-6 && Math.abs((b.y + b.h / 2) * zoom + panY - size.h / 2) < 1e-6 }
    handDrawn()
    const [a] = racks()
    const f = m.rackFootprint(a)
    columnAt((rot ? f.y : f.x) + (1.5 / 12) * GS, (rot ? f.x : f.y) + (21 / 12) * GS)
    const up = check().errors.find(e => e.kind === 'upright')
    expect(Math.max(up.box.w, up.box.h)).toBeLessThan(2 * GS)                  // a small issue: one column
    s().setViewport(0.15, 17, -40)
    m.LC.goToIssue(m.useCanvasStore, up, size)
    expect(s().zoom).toBe(0.15)                                                 // kept
    expect(centred(up.box)).toBe(true)
    s().setViewport(0.05, 0, 0)
    m.LC.goToIssue(m.useCanvasStore, up, size)
    expect(s().zoom).toBe(0.2)                                                  // too far out: 20 %, not more
    expect(centred(up.box)).toBe(true)
    s().setViewport(0.1, 0, 0)
    m.LC.goToIssue(m.useCanvasStore, up, size)
    expect(s().zoom).toBe(0.1)                                                  // 10 % is enough to see: kept
    // a long narrow aisle on a generated layout: centred, no zooming in
    m = await fresh()
    m.generateAndPlace({ lengthFt: 1080, widthFt: 410, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const inS1 = racks().filter(o => o.genSection === 1), k = Math.min(...inS1.map(o => o.rowIndex))
    const r5 = inS1.find(o => o.rowIndex === k), r6 = inS1.find(o => o.rowIndex === k + 1)
    const f5 = m.rackFootprint(r5), f6 = m.rackFootprint(r6)
    move(r5, (rot ? f6.x - (f5.x + f5.w) : f6.y - (f5.y + f5.h)) - 7 * GS)
    const aisle = check().errors.find(e => e.kind === 'aisle-drive' && e.ids.includes(r5.id))
    expect(Math.max(aisle.box.w, aisle.box.h)).toBeGreaterThan(size.w)          // longer than the screen at 100 %
    s().setViewport(0.3, 0, 0)
    m.LC.goToIssue(m.useCanvasStore, aisle, size)
    expect(s().zoom).toBe(0.3)                                                  // not zoomed in (or out) to fit
    expect(centred(aisle.box)).toBe(true)
    expect(readFileSync('src/utils/layoutCheck.js', 'utf8')).not.toMatch(/ISSUE_CONTEXT_FT|ISSUE_MAX_ZOOM|fitBox/)   // the 20 ft / 100 % rule is gone
  })

  it('LC-live: with the list open, every committed change re-checks the LISTED items (debounced) and removes the fixed ones — a narrow aisle fixed disappears without pressing the button, the count follows; a new overlap is NOT added until Check layout is pressed; nothing re-runs mid-drag; the clicked item\'s highlight stays until its issue is fixed; a closed list isn\'t re-checked', async () => {
    const DP = await import('../../canvas2/dragPreview')
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const stop = m.LC.installLiveRecheck(m.useCanvasStore, { delay: 30 })
    try {
      handDrawn()
      const [a, b, , d] = racks()
      move(b, -(AISLE - 7 * GS))                                                   // a narrow aisle
      m.LC.runLayoutCheck(m.useCanvasStore)                                        // the list is open
      const lc = () => m.LC.useLayoutCheck.getState()
      expect(m.LC.checkLabel(lc().result)).toBe('Check layout · 1 error')
      m.LC.goToIssue(m.useCanvasStore, lc().result.errors[0], { w: 1200, h: 800 })
      // an unrelated change: re-checked, the highlight stays (its issue is still there)
      s().commitObjectUpdate(d.id, { beams: [96, 96, 108] }); await sleep(90)
      expect(lc().result.errors.map(e => e.kind)).toEqual(['aisle-drive'])
      expect(lc().highlight).not.toBe(null)
      // fixed by moving the row back: gone, no button pressed; its highlight goes too
      move(racks()[1], AISLE - 7 * GS); await sleep(90)
      expect(lc().result.errors).toEqual([])
      expect(m.LC.checkLabel(lc().result)).toBe('Check layout · no issues')
      expect(lc().highlight).toBe(null)
      // a new overlap: NOT added by the live re-check — only when Check layout is pressed
      move(racks()[1], -(AISLE + GS)); await sleep(90)
      expect(lc().result.errors).toEqual([])
      expect(m.LC.checkLabel(lc().result)).toBe('Check layout · no issues')
      m.LC.runLayoutCheck(m.useCanvasStore)
      expect(lc().result.errors.map(e => e.kind)).toContain('overlap')
      expect(m.LC.checkLabel(lc().result)).toMatch(/^Check layout · \d+ errors?$/)
      const during = lc().result
      // mid-drag: history moves (a live-flue drag writes every frame), no re-check until the drop
      DP.setDragging(true)
      move(racks()[1], AISLE + GS); await sleep(90)
      expect(lc().result).toBe(during)
      DP.setDragging(false); await sleep(90)
      expect(lc().result.errors).toEqual([])                                     // the fixed overlap removed after the drop
      // closed: no re-check
      lc().close()
      const closed = lc().result
      move(racks()[1], -(AISLE + GS)); await sleep(90)
      expect(lc().result).toBe(closed)
      void a
    } finally { stop() }
    expect(m.LC.LIVE_RECHECK_MS).toBe(300)
    expect(readFileSync('src/App.jsx', 'utf8')).toMatch(/installLiveRecheck\(useCanvasStore\)/)
  })

  it('LC-recheck: fixing the problem and pressing again removes it; the button counts ("Check layout · 1 error" → "· no issues")', () => {
    handDrawn()
    const [, b] = racks()
    move(b, -(AISLE - 7 * GS))
    let r = m.LC.runLayoutCheck(m.useCanvasStore)
    expect(m.LC.checkLabel(r)).toBe('Check layout · 1 error')
    expect(m.LC.useLayoutCheck.getState()).toMatchObject({ open: true })
    move(racks()[1], AISLE - 7 * GS)                                           // put it back
    r = m.LC.runLayoutCheck(m.useCanvasStore)
    expect(r.errors).toEqual([])
    expect(m.LC.useLayoutCheck.getState().result.errors).toEqual([])          // what the panel and the button show
    expect(m.LC.checkLabel(r)).toBe('Check layout · no issues')
    expect(m.LC.checkLabel({ errors: [], warnings: [{}, {}] })).toBe('Check layout · 2 warnings')
  })

  it('LC-pdf: with errors the export asks "N errors found. Export anyway?" — Show issues opens the list, Export anyway exports; without errors it exports at once', () => {
    handDrawn()
    let exported = 0
    const doExport = () => { exported++ }
    expect(m.LC.exportWithCheck(m.useCanvasStore, doExport)).toBe(true)        // clean: straight out
    expect(exported).toBe(1)
    const [, b] = racks()
    move(b, -(AISLE + GS))                                                     // an overlap (and more)
    const n = check().errors.length
    expect(m.LC.exportWithCheck(m.useCanvasStore, doExport)).toBe(false)       // asked, not blocked
    expect(exported).toBe(1)
    expect(m.LC.useLayoutCheck.getState().askExport).toEqual({ errors: n })
    m.LC.showIssues()
    expect(m.LC.useLayoutCheck.getState()).toMatchObject({ askExport: null, open: true })
    m.LC.exportWithCheck(m.useCanvasStore, doExport)
    m.LC.exportAnyway(doExport)
    expect(exported).toBe(2)
    expect(m.LC.useLayoutCheck.getState().askExport).toBe(null)
    const dlg = readFileSync('src/components/RightPanel/LayoutCheckPanel.jsx', 'utf8')
    expect(dlg).toMatch(/\{n\} error\{n === 1 \? '' : 's'\} found\. Export anyway\?/)
    expect(readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')).toMatch(/onClick=\{\(\) => exportWithCheck\(useCanvasStore, exportAsPDF\)\}/)
  })
})

describe('LC — one rule each', () => {
  it('LC-reuse: the aisle width rule is one function (aisleLevel) asked by the column check, the copy warnings and Check layout; Check layout only calls the existing checks', () => {
    const src = (f) => readFileSync(f, 'utf8')
    const cc = src('src/generate/columnCheck.js')
    expect(cc).toMatch(/const level {4}= aisleLevel\(clearPx, profile, gridSize\)/)
    expect(src('src/utils/copyChange.js')).toMatch(/aisleLevel\(g, profile, gridSize, gridSize \/ 24\) < 3/)
    const lc = src('src/utils/layoutCheck.js')
    for (const f of ['rowAisleGaps', 'aisleLevel', 'rackReachable', 'runColumnCheck', 'rackIssues', 'oversizedBayIndices']) expect(lc).toMatch(new RegExp(f + '\\('))
    expect(lc).not.toMatch(/aisleFt \* gridSize\) *[<>]|travelFt \?\? 8\) \* gridSize *[<>]/)   // no width compared by hand
    expect(src('src/components/RightPanel/index.jsx')).toMatch(/<LayoutCheckPanel \/>/)
    expect(src('src/components/Toolbar/TopBar.jsx')).toMatch(/<CheckLayoutButton \/>/)
  })
})
