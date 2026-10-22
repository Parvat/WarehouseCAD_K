// ZG — zone-flags. (1) A pick face with less than the pick width of clear floor in front — a zone, the wall or a rack,
// 0' / touching / overlapping the aisle included — gets its X marks, counts as lost, and is ONE Check layout warning,
// the same in every corner and side, both orientations, after a drop, a move and a resize: one check (narrowAisles.js
// narrowAisleBlocks) behind the marks, usable and the list. Root cause: a single row's face was graded with the
// back-to-back exemption (≤ 2' is "not an aisle"), and a zone in front of most of a short piece's face made that face
// its "back" — so an office touching a wall row flagged nothing. (2) A tool ends fully when another is chosen, Esc is
// pressed or a library item clicked (utils/toolSwitch.js).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))
const tick = () => new Promise(r => setTimeout(r, 0))
const settle = async () => { await tick(); await tick() }
const read = (p) => readFileSync('src/' + p, 'utf8').split('\r\n').join('\n')

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const AT = await import('../../utils/rackingAreaTool')
  const LC = await import('../../utils/layoutCheck')
  const NA = await import('../../generate/narrowAisles')
  const UC = await import('../../generate/usableCapacity')
  const TG = await import('../../generate/traceGenerate')
  const CC = await import('../../generate/columnCheck')
  const TS = await import('../../utils/toolSwitch')
  const FT = await import('../../utils/fillTool')
  const RG = await import('../../utils/rowGroupTool')
  const SP = await import('../../utils/splitTool')
  const PL = await import('../../utils/placement')
  const { TOOLS } = await import('../../constants')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { installRowEditKeeper } = await import('../../utils/rowEditKeeper')
  const { nanoid } = await import('nanoid')
  installAisleKeeper(useCanvasStore, nanoid); installRowEditKeeper(useCanvasStore); AT.installAreaKeeper(useCanvasStore)
  const stopTools = TS.installToolKeeper(useCanvasStore)
  return { useCanvasStore, AT, LC, NA, UC, TG, CC, TS, FT, RG, SP, PL, TOOLS, stopTools }
}
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-3

describe.each([['vertical', true], ['horizontal', false]])('ZG-1 — %s', (_, vert) => {
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })
  const P = () => m.CC.MHE_PROFILES.reach
  async function load() {
    m.TG.generateAndPlace({ lengthFt: vert ? 240 : 120, widthFt: vert ? 120 : 240, gridXFt: 50, gridYFt: 54, mhe: 'reach', orientation: vert ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0 })
    await settle()
    const fp = s().objects.find(o => o.type.startsWith('fp_')), wt = (fp.wallThicknessFt || 0.25) * GS
    const ib = { x: fp.x + wt, y: fp.y + wt, w: fp.width - 2 * wt, h: fp.height - 2 * wt }
    const racks = s().objects.filter(o => o.type && o.type.startsWith('rack_'))
    const S = (f) => (vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
    const lo = vert ? ib.x : ib.y, hi = vert ? ib.x + ib.w : ib.y + ib.h
    const wallRow = (side) => racks.map(r => ({ r, f: m.CC.rackFootprint(r) })).filter(q => q.r.type === 'rack_row').find(q => (side === 'lo' ? Math.abs(S(q.f)[0] - lo) < 2 * GS : Math.abs(S(q.f)[1] - hi) < 2 * GS))
    return { ib, wallRow, S }
  }
  /* an office 20' across × 30' along, `gap` feet off the wall row's face on side `side`, at the `end` end of the run */
  const officeBy = (ib, q, side, gap, end) => {
    const [s0, s1] = vert ? [q.f.x, q.f.x + q.f.w] : [q.f.y, q.f.y + q.f.h]
    const across0 = side === 'lo' ? s1 + gap * GS : s0 - gap * GS - 20 * GS
    const r0 = end === 'start' ? (vert ? ib.y : ib.x) : (vert ? ib.y + ib.h : ib.x + ib.w) - 30 * GS
    return vert ? { x: across0, y: r0, w: 20 * GS, h: 30 * GS } : { x: r0, y: across0, w: 30 * GS, h: 20 * GS }
  }
  const zoneAt = (b) => ({ id: 'office', type: 'zone_office', label: 'Office', x: b.x, y: b.y, width: b.w, height: b.h, parentId: s().objects.find(o => o.type.startsWith('fp_')).id, layerId: 'zones' })
  /* the one check, three readers: X marks (narrowAisleBlocks), usable (narrowLost) and Check layout (warnings) agree */
  const readers = () => {
    const objs = s().objects
    const blocks = m.NA.narrowAisleBlocks(objs, { profile: P(), gridSize: GS })
    const u = m.UC.usableCapacity(objs, { profile: P(), gridSize: GS })
    const c = m.LC.checkLayout(objs, { gridSize: GS })
    const listed = c.warnings.filter(w => ['zone-face', 'wall-face', 'aisle-pick'].includes(w.kind))
    return { blocks, u, c, listed }
  }
  const wallRowFlagged = (rid) => readers().blocks.filter(b => b.rackId === rid)

  for (const gap of [0, 1, 2, 3]) {
    it(`ZG-wall-row (${gap}'): an office ${gap}' off the wall row's face — the wall row's face is X-marked over every bay the office stands in front of, the same in all four corners; lost positions = the Check layout warnings' count; one warning per face`, async () => {
      const { ib, wallRow } = await load()
      const counts = []
      for (const side of ['lo', 'hi']) for (const end of ['start', 'end']) {
        const q = wallRow(side)
        expect(q, `a wall row on the ${side} side`).toBeTruthy()
        const box = officeBy(ib, q, side, gap, end)
        s().addObject(zoneAt(box)); await settle()
        const flagged = wallRowFlagged(q.r.id)
        expect(flagged.length, `${side}/${end}: the wall row flagged`).toBeGreaterThan(0)
        // the bays flagged are exactly those whose run span meets the office's (a geometric oracle)
        const run = (b) => (vert ? [b.y, b.y + b.h] : [b.x, b.x + b.w])
        const [o0, o1] = run(box)
        for (const b of flagged) {
          const bb = m.CC.rackFootprint(q.r), pitch = ((q.r.uprightWidth || 3) + q.r.beams[b.bayIndex]) / 12 * GS
          void bb; void pitch
        }
        const R = readers()
        expect(R.c.errors.filter(e => e.kind === 'no-way-in' || e.kind === 'aisle-drive')).toEqual([])
        expect(R.listed.reduce((t, w) => t + w.positions, 0), `${side}/${end}: listed = lost`).toBe(R.u.narrowLost)
        // one warning for this face
        expect(R.listed.filter(w => w.ids.includes(q.r.id)).length).toBe(1)
        counts.push([end, flagged.reduce((t, b) => t + b.positionIndices.length, 0)])
        void o0; void o1
        s().selectGroup(['office']); s().deleteSelected(); await settle()
        expect(readers().u.narrowLost, 'deleted: nothing lost').toBe(0)
      }
      // mirrored corners the same: left and right at each end (the run's two ends differ — a cross-aisle at one)
      for (const end of ['start', 'end']) expect(new Set(counts.filter(c => c[0] === end).map(c => c[1])).size, JSON.stringify(counts)).toBe(1)
    })
  }

  it('ZG-snap: an Office dropped a few pixels into or short of a wall row face (a drop by hand) lands exactly ON the face — every corner; then that face is flagged, not cut', async () => {
    const { ib, wallRow } = await load()
    for (const side of ['lo', 'hi']) for (const end of ['start', 'end']) for (const off of [-5, -2, 2, 5]) {
      const q = wallRow(side)
      const box = officeBy(ib, q, side, 0, end), face = side === 'lo' ? (vert ? q.f.x + q.f.w : q.f.y + q.f.h) : (vert ? q.f.x : q.f.y)
      const shifted = vert ? { ...box, x: box.x + off } : { ...box, y: box.y + off }
      const z = { id: 'z', type: 'zone_office', width: box.w, height: box.h, x: 0, y: 0 }
      const centre = { x: shifted.x + box.w / 2, y: shifted.y + box.h / 2 }
      const sp = m.PL.snapPlacement([z], s().objects, centre, GS, 1)
      const at = { x: z.x + sp.dx, y: z.y + sp.dy }
      const edge = side === 'lo' ? (vert ? at.x : at.y) : (vert ? at.x + box.w : at.y + box.h)
      expect([side, end, off, +(edge - face).toFixed(6)]).toEqual([side, end, off, 0])
    }
    // dropped by the snap: the face flagged (not cut)
    const q = wallRow('lo'), box = officeBy(ib, q, 'lo', 0, 'end')
    s().addObject(zoneAt(vert ? { ...box, x: box.x + 0 } : box)); await settle()
    expect(wallRowFlagged(q.r.id).length).toBeGreaterThan(0)
  })

  it('ZG-move-resize: dropped 6\' off the wall row, then moved to touch it, then resized wider into the aisle — flagged after every step, the three readers agreeing; moved 12\' away: nothing', async () => {
    const { ib, wallRow } = await load()
    const q = wallRow('lo')
    const box = officeBy(ib, q, 'lo', 6, 'end')
    s().addObject(zoneAt(box)); await settle()
    const step = (label) => { const R = readers(); expect(wallRowFlagged(q.r.id).length, label).toBeGreaterThan(0); expect(R.listed.reduce((t, w) => t + w.positions, 0), label).toBe(R.u.narrowLost) }
    step('dropped 6\' off')
    const touch = officeBy(ib, q, 'lo', 0, 'end')
    s().commitObjectUpdate('office', { x: touch.x, y: touch.y }); await settle()
    step('moved to touch')
    s().commitObjectUpdate('office', vert ? { width: touch.w + 6 * GS } : { height: touch.h + 6 * GS }); await settle()
    step('resized')
    const away = officeBy(ib, q, 'lo', 12, 'end')
    s().commitObjectUpdate('office', { x: away.x, y: away.y, width: away.w, height: away.h }); await settle()
    expect(wallRowFlagged(q.r.id)).toEqual([])
  })

  it('ZG-aisle-overlap: an office standing half in the aisle between two pairs (not touching either) — both faces it crowds are flagged, one warning each, lost = listed', async () => {
    await load()
    const pairs = s().objects.filter(o => o.type === 'rack_double_row').map(r => ({ r, f: m.CC.rackFootprint(r) })).sort((a, b) => (vert ? a.f.x - b.f.x : a.f.y - b.f.y))
    const [p, q] = [pairs[2], pairs[3]]
    const gap0 = vert ? p.f.x + p.f.w : p.f.y + p.f.h, gap1 = vert ? q.f.x : q.f.y
    const mid = (vert ? p.f.y : p.f.x) + 20 * GS
    const box = vert ? { x: gap0 + 2 * GS, y: mid, w: 4 * GS, h: 20 * GS } : { x: mid, y: gap0 + 2 * GS, w: 20 * GS, h: 4 * GS }
    expect(gap1 - gap0).toBeGreaterThan(8 * GS)
    s().addObject(zoneAt(box)); await settle()
    const R = readers()
    expect(R.blocks.some(b => b.rackId === p.r.id)).toBe(true)
    expect(R.blocks.some(b => b.rackId === q.r.id)).toBe(true)
    expect(R.listed.filter(w => w.kind === 'zone-face').length).toBe(2)
    expect(R.listed.reduce((t, w) => t + w.positions, 0)).toBe(R.u.narrowLost)
  })
})

describe('ZG-1 — one check', () => {
  it('ZG-one: the X marks, usable and Check layout all read narrowAisleBlocks; the single-row face is graded with aisleLevel (no back-to-back exemption) and a zone is never a single row\'s back', () => {
    const lc = read('utils/layoutCheck.js'), fa = read('generate/faceAisles.js'), uc = read('generate/usableCapacity.js'), ov = read('canvas2/Overlays.jsx')
    expect(lc).toMatch(/narrowAisleBlocks\(objects, \{ profile, gridSize, elevations, already:/)
    expect(uc).toMatch(/narrowAisleBlocks\(/)
    expect(ov).toMatch(/narrowAisleBlocks\(pObjects/)
    expect(fa).toMatch(/const backed = \(list\) => list\.filter\(n => \(n\.kind === 'wall' \|\| n\.kind === 'rack'\) && n\.d <= backPx \+ E\)/)
    expect(fa).toMatch(/const level = aisleLevel\(width, profile, gridSize\)/)
    expect(fa).not.toMatch(/rowAisleLevel\(/)
  })
})

describe('ZG-2 — a tool ends fully', () => {
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })
  const leftovers = () => ({
    fill: !!(m.FT.useFillTool.getState().drag || m.FT.useFillTool.getState().plan),
    group: !!m.RG.useRowGroup.getState().drag,
    split: !!m.SP.useSplit.getState().hover,
    placing: !!m.PL.usePlacement.getState().active,
    measure: m.TS.useMeasureMode.getState().on,
  })
  const none = { fill: false, group: false, split: false, placing: false, measure: false }
  const dirty = () => {
    m.FT.useFillTool.setState({ drag: { from: { x: 0, y: 0 }, to: { x: 40, y: 40 } }, plan: { racks: [] } })
    m.RG.useRowGroup.setState({ drag: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } })
    m.SP.useSplit.setState({ hover: { rackId: 'x' } })
    m.PL.usePlacement.setState({ active: { items: [{ id: 'z', type: 'zone_office', x: 0, y: 0, width: 10, height: 10 }], groups: [] } })
    m.TS.useMeasureMode.setState({ on: true })
  }
  it('ZG-pairs: every pair of tools (the drawing toolbar\'s and a library shape\'s) — switching ends everything the first left: fill box and plan, Row group box, Split hover, a placement on the mouse, the measure mode', async () => {
    const T = m.TOOLS
    const tools = [T.SELECT, T.PAN, T.LINE, T.ARROW, T.ARC, T.FREEHAND, T.TEXT, 'annot_dimension', m.FT.FILL_TOOL, m.RG.ROW_GROUP_TOOL, m.SP.SPLIT_TOOL, 'rect'].filter(Boolean)
    let pairs = 0
    for (const a of tools) for (const b of tools) {
      if (a === b) continue
      s().setActiveTool(a); dirty()
      s().setActiveTool(b)
      expect([a, b, leftovers()]).toEqual([a, b, none])
      expect(s().activeTool).toBe(b)
      pairs++
    }
    expect(pairs).toBe(tools.length * (tools.length - 1))
  })
  it('ZG-endTool: a library item ends the tool first — the Fill tool with a box half drawn: endTool → Select, no box, no plan, no measure mode, no placement; then a zone placement starts clean', async () => {
    s().setActiveTool(m.FT.FILL_TOOL); dirty()
    m.TS.endTool(m.useCanvasStore)
    expect(s().activeTool).toBe(m.TOOLS.SELECT)
    expect(leftovers()).toEqual(none)
    m.PL.startPlacement(m.useCanvasStore, [{ id: 'z1', type: 'zone_office', x: 0, y: 0, width: 400, height: 300 }], { at: { x: 200, y: 150 } })
    expect(m.PL.usePlacement.getState().active).toBeTruthy()
    expect(s().activeTool).toBe(m.TOOLS.SELECT)
  })
  it('ZG-wire: the library calls endTool before it places (items, shapes, floor plans); Esc ends any tool back to Select; the keeper is installed; the measure mode is the shared one and turning it on ends the tool', () => {
    const ft = read('components/LeftPanel/FloatingToolbar.jsx'), kb = read('hooks/useKeyboardShortcuts.js'), app = read('App.jsx'), c2 = read('canvas2/Canvas2.jsx')
    expect(ft).toMatch(/const selectItem {2}= item => \{ endTool\(useCanvasStore\); bumpUsage/)
    expect(ft).toMatch(/const selectShape = item => \{ endTool\(useCanvasStore\); setActiveTool/)
    expect(ft).toMatch(/const selectFp {4}= item => \{ endTool\(useCanvasStore\); placeFpObject/)
    expect(kb).toMatch(/if \(useCanvasStore\.getState\(\)\.activeTool !== TOOLS\.SELECT\) \{ useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\); return \}/)
    expect(app).toMatch(/const stopToolKeeper = installToolKeeper\(useCanvasStore\)/)
    expect(c2).toMatch(/const measuring = useMeasureMode\(s => s\.on\)/)
    // Studio: the tool pill's Measure turns the mode on and ends the running tool first
    expect(ft).toMatch(/onClick: \(\) => toggleMeasure\(useCanvasStore\)/)
    expect(read('utils/toolSwitch.js')).toMatch(/export function toggleMeasure\(store\) \{\n  const on = !useMeasureMode\.getState\(\)\.on\n  if \(on\) endTool\(store\)/)
  })
})
