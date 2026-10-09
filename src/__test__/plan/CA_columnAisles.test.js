// Area CA — the column-in-aisle check and Generate's aisle objects pair rows as the aisle labels do (BUG 75):
// one pairing module (generate/rowAisles.js), no two files importing each other. The column check now sees
// every aisle; usable and the X marks are unchanged (they come from columns in racks and in pick zones,
// never from the aisle pairing). The fixture's four fills, the layout as saved both ways, a Generate layout.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { sharesFrame } from '../../utils/bayBeam'
import { checkLayout } from '../../utils/layoutCheck'
import { bayLedger } from '../../utils/bayLedger'
import { getLayoutCapacity } from '../../utils/capacity'
import { rebuildAisles, neighbourPairs } from '../../utils/aisleRebuild'
import * as RG from '../../utils/rowGroup'
import { SPLIT_TOOL, useSplit, cutOf, hoverSplit, splitAt } from '../../utils/splitTool'
import { usePlacement, movePlacement, commitPlacement, cancelPlacement, placementDistances } from '../../utils/placement'
import { innerOutline } from '../../utils/floorGeom'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { installAisleKeeper } from '../../utils/aisleKeeper'
import { installRowEditKeeper } from '../../utils/rowEditKeeper'
import { installPairKeeper } from '../../utils/pairCarryOn'
import { useRowGroup, installRowGroupWatcher, flushRowGroupWatcher, clearGroup } from '../../utils/rowGroupTool'
import { planInlineDrop, applyJoin } from '../../canvas2/inlineSnap'
import { TOOLS } from '../../constants'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) }

let store, stops = [], seq = 0
const newId = () => 'p' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  // as App.jsx
  stops = [installAisleKeeper(store, newId), installRowEditKeeper(store), installPairKeeper(store), installRowGroupWatcher(store, newId)]
})
afterAll(() => stops.forEach(f => f()))
beforeEach(() => { clearGroup(); usePlacement.setState({ active: null }); useSplit.setState({ hover: null }) })

const BEAM = new Set(['rack_row', 'rack_double_row'])
const strip = (o) => JSON.parse(JSON.stringify(o))
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
function load(objects) {
  const clean = strip(objects)
  store.setState({ objects: clean, groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, zoom: 1, activeTool: SPLIT_TOOL, history: [JSON.stringify({ objects: clean, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const settle = () => flushRowGroupWatcher()
const rowRacks = (sec, ri) => objs().filter(o => BEAM.has(o.type) && o.genSection === sec && o.rowIndex === ri).sort((a, b) => RG.geom(a).r0 - RG.geom(b).r0)
const UP = (o) => ((o.uprightWidth || 3) / 12) * GS
const upsOf = (o) => { const g = RG.geom(o); return RG.uprightsOf(g.r0, g.beams, UP(o), GS) }
const allUps = (racks) => [...new Set(racks.flatMap(upsOf).map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
const totals = () => { const L = bayLedger(objs(), GS); return { bays: L.bays, positions: getLayoutCapacity(objs(), undefined, L).total, uncounted: L.uncountedBays } }
const overlapsIn = (racks) => { const ids = new Set(racks.map(o => o.id)); return checkLayout(objs(), { gridSize: GS }).errors.filter(e => e.kind === 'overlap' && e.ids.every(id => ids.has(id))) }
/** The world point `d` ft along the run from upright k's centre (negative: before it), mid-depth. */
const near = (o, k, d) => { const g = RG.geom(o), along = upsOf(o)[k] + UP(o) / 2 + d * GS, across = (g.s0 + g.s1) / 2; return g.vert ? { x: across, y: along } : { x: along, y: across } }
/** Aisles from row (sec, ri)'s racks, by the other row: { 'sec/row': [width ft, ...] }. */
function aislesOf(sec, ri) {
  const byId = new Map(objs().map(o => [o.id, o])), mine = new Set(rowRacks(sec, ri).map(o => o.id)), out = {}
  for (const a of objs().filter(o => o.type === 'aisle')) {
    const [m, t] = mine.has(a.row1Id) ? [a.row1Id, a.row2Id] : mine.has(a.row2Id) ? [a.row2Id, a.row1Id] : []
    if (!m) continue
    const A = RG.geom(byId.get(m)), B = RG.geom(byId.get(t)), o = byId.get(t)
    const w = Math.round(((Math.max(A.s0, B.s0) - Math.min(A.s1, B.s1)) / GS) * 1000) / 1000;
    (out[o.genSection + '/' + o.rowIndex] = out[o.genSection + '/' + o.rowIndex] || []).push(w)
  }
  for (const k in out) out[k].sort((a, b) => a - b)
  return out
}

/** The live distances the following piece draws, by direction relative to its rack — along+ / along- (the
 *  run), across+ / across- — and along0 / across0 for a 0 gap — as { kind, ft } (ft to 3 decimals). */
function distances() {
  const a = usePlacement.getState().active, out = {}
  const runAxis = RG.geom(a.items[0]).vert ? 'y' : 'x'
  for (const d of placementDistances(a, objs(), GS)) {
    const k = (d.axis === runAxis ? 'along' : 'across') + (d.b > d.a + 1e-9 ? '+' : d.b < d.a - 1e-9 ? '-' : '0')
    out[k] = { kind: d.kind, ft: Math.round(d.ft * 1000) / 1000 }
  }
  return out
}
/** The user's case: the building as saved, emptied, with ONE plain single of 6 bays (8') in the middle. */
function oneRack(vert) {
  const all = savedFill(vert), fp = all.find(o => typeof o.type === 'string' && o.type.startsWith('fp_'))
  const src = all.filter(o => o.type === 'rack_row' && o.genSection === 1).sort((a, b) => b.beams.length - a.beams.length)[0]
  const { rowIndex, genSection, genRunFt, genCrossFt, pieceOf, areaId, ...plain } = src
  const rack = RG.movedAcross(RG.withRun({ ...plain, id: 'R6' }, RG.geom(src).r0 + 60 * GS, Array(6).fill(96), GS), 100 * GS)
  return { objects: [fp, rack], fp, rack }
}
/** The cross-aisle labels drawn for `objects`: their widths in ft (3 decimals). */
const crossLabels = (os) => crossAisleLabels(os, GS).map(c => Math.round((c.gapHi - c.gapLo) / GS * 1000) / 1000)
/** The same racks as ordinary racks: no split link. */
const ordinary = (os) => os.map(o => (o.type === 'rack_row' ? (({ splitOf, pieceOf, ...r }) => ({ ...r, id: 'o' + r.id }))(o) : o))
/** The building's inner faces: [lo, hi] on each world axis. */
const innerBox = (fp) => { const q = innerOutline(fp, GS), xs = q.map(v => v.x), ys = q.map(v => v.y); return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] } }

/** A cut must leave every rack where it was: the same uprights and span, the cut frame shared, no overlap,
 *  no bay lost, the bay ledger's counts unchanged. */
const unchanged = (before, after, t0) => {
  expect(allUps(after)).toEqual(allUps(before))
  const g0 = before.map(RG.geom), g1 = after.map(RG.geom)
  expect([Math.min(...g1.map(g => g.r0)), Math.max(...g1.map(g => g.r1))]).toEqual([Math.min(...g0.map(g => g.r0)), Math.max(...g0.map(g => g.r1))])
  for (let k = 0; k + 1 < after.length; k++) expect(sharesFrame(after[k], after[k + 1], GS)).toBe(true)
  expect(after.reduce((t, o) => t + o.beams.length, 0)).toBe(before.reduce((t, o) => t + o.beams.length, 0))
  expect(overlapsIn(after)).toEqual([])
  expect(totals()).toEqual(t0)
}
/** The single along the wall in section 1 with the most bays. */
const wallSingle = () => objs().filter(o => o.type === 'rack_row' && o.genSection === 1).sort((a, b) => b.beams.length - a.beams.length)[0]


// ── CA: the column-in-aisle check and Generate's aisles on the labels' pairing (BUG 75) ─────────────────────
import { aisleColumnBlocks, MHE_PROFILES } from '../../generate/columnCheck'
import { layoutColumns, usableCapacity, runColumnCheck } from '../../generate/usableCapacity'
import { planAreaCreate } from '../../generate/rackingArea'
import { aisleObjectsForRacks, generateAndPlace } from '../../generate/traceGenerate'
import { clearanceOps, aisleLabelOps } from '../../render/labelOps'
import { aisleLabelLayout } from '../../canvas2/hitTest'
import { clearanceMarks } from '../../canvas2/aisleMarks'
import { labelScale, aisleLabelScale, LABEL_SIZES } from '../../render/labelSize'

const FILLS = [['as saved, vertical', false, 'vertical', true, { cols: 23, usable: 10648, pickLost: 184 }], ['as saved, horizontal', false, 'horizontal', false, { cols: 18, usable: 10512, pickLost: 176 }], ['turned, vertical', true, 'vertical', false, { cols: 18, usable: 10512, pickLost: 176 }], ['turned, horizontal', true, 'horizontal', false, { cols: 23, usable: 10632, pickLost: 184 }]]
function fillOf(turned, orientation, stored) {
  const objs = REAL_LAYOUT.map(o => ({ ...o })).map(o => (turned ? turn(o) : o))
  const area = objs.find(o => o.type === 'racking_area')
  const box = { x: area.x, y: area.y, w: area.width, h: area.height }
  return stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
}
const square = (objects) => objects.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_') && ((o.rotation || 0) % 90) === 0)
const blocksOf = (objects, pickBothSides = false) => aisleColumnBlocks({ racks: square(objects), columns: layoutColumns(objects, GS), profile: MHE_PROFILES.reach, gridSize: GS, pickBothSides })
const pairKey = (a, b) => [a, b].sort().join('|')

describe('CA-fills', () => {
  it.each(FILLS)('CA-fills (%s): the column check looks at every aisle the labels show and finds the columns standing in them (23 / 18 / 18 / 23), every one passable on one side (none blocked); usable and the pick-zone losses — the X marks — are what they were', (_, turned, orientation, stored, want) => {
    const out = fillOf(turned, orientation, stored)
    const { aisleBlocks, redMarks } = blocksOf(out)
    expect(aisleBlocks.length).toBe(want.cols)
    expect(aisleBlocks.every(b => b.level === 2 && !b.blocked)).toBe(true)
    expect(redMarks).toEqual([])
    const u = usableCapacity(out, { profile: MHE_PROFILES.reach, gridSize: GS })
    expect([u.usable, u.pickZoneLost]).toEqual([want.usable, want.pickLost])
    expect(checkLayout(out, { gridSize: GS }).errors.filter(e => /a column leaves/.test(e.text))).toEqual([])
  })
})

describe.each([['vertical', true], ['horizontal', false]])('CA — %s', (_, vert) => {
  it('CA-block: the layout as saved — a column 0.5 ft off a rack face, 9 ft clear on its other side; that row moved 1.5 ft toward it → 7.5 ft clear: the column check BLOCKS it (a red aisle mark) and Check layout reports "a column leaves 7\' 6", needs 8\' to drive"', () => {
    const base = savedFill(vert)
    const b = blocksOf(base).aisleBlocks.find(x => Math.min(x.nearClearFt, x.farClearFt) <= 0.5 && Math.max(x.nearClearFt, x.farClearFt) >= 9)
    expect(b, 'a column 0.5 ft off a face').toBeTruthy()
    // the row on the column's wide side moves 1.5 ft toward it
    const wideId = b.nearClearFt >= b.farClearFt ? b.betweenRows[0] : b.betweenRows[1]
    const other = b.betweenRows.find(id => id !== wideId), gw = RG.geom(base.find(o => o.id === wideId)), go = RG.geom(base.find(o => o.id === other))
    const toward = gw.s0 > go.s0 ? -1 : 1
    const out = base.map(o => (o.id === wideId ? RG.movedAcross(o, toward * 1.5 * GS) : o))
    const after = blocksOf(out).aisleBlocks.find(x => x.columnIndex === b.columnIndex && pairKey(...x.betweenRows) === pairKey(...b.betweenRows))
    expect([after.level, after.blocked, after.clearFt]).toEqual([1, true, 7.5])
    expect(blocksOf(out).redMarks.length).toBeGreaterThan(0)
    const err = checkLayout(out, { gridSize: GS }).errors.find(e => /a column leaves/.test(e.text) && e.ids.includes(wideId))
    expect(err && err.text).toMatch(/: a column leaves 7' 6", needs 8' to drive$/)
  })

  it('CA-both: "Require pick from both sides" on — the one-side-only columns are flagged (blocked, a red mark each) — and usable does not move (it never read the aisle blocks)', () => {
    const base = savedFill(vert)
    const on = blocksOf(base, true)
    expect(on.aisleBlocks.length).toBe(23)
    expect(on.aisleBlocks.every(b => b.blocked)).toBe(true)
    expect(on.redMarks.length).toBe(23)
    const res = runColumnCheck(base, { profile: MHE_PROFILES.reach, gridSize: GS, pickBothSides: true })
    expect(res.summary.blockedAisles).toBe(23)
    const u0 = usableCapacity(base, { profile: MHE_PROFILES.reach, gridSize: GS }).usable
    expect(u0).toBe(10648)                                                        // the layout as saved (turned for horizontal rows): as before
  })

  it('CA-generate: Generate\'s aisle objects are the aisle labels\' pairs — on the layout as saved (where the old pairing found almost none) and on a layout Generate made', () => {
    const base = savedFill(vert)
    const labels = (os) => new Set(rebuildAisles(os).objects.filter(o => o.type === 'aisle').map(a => pairKey(a.row1Id, a.row2Id)))
    const emitted = (os) => new Set(aisleObjectsForRacks(os.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_'))).map(a => pairKey(a.row1Id, a.row2Id)))
    expect([...emitted(base)].sort()).toEqual([...labels(base)].sort())
    expect(emitted(base).size).toBeGreaterThan(40)
    store.setState({ objects: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
    generateAndPlace({ lengthFt: vert ? 250 : 500, widthFt: vert ? 500 : 250, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation: vert ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0 })
    const gen = objs()
    expect([...emitted(gen)].sort()).toEqual([...labels(gen)].sort())
  })
})

describe.each([['vertical', true, 'medium'], ['horizontal', false, 60]])('CA-labels — %s', (_, vert, faceSize) => {
  const kinds = (ops) => ({ lines: ops.filter(o => o.op === 'line').length, polys: ops.filter(o => o.op === 'poly').length, texts: ops.filter(o => o.op === 'text').map(o => o.text) })
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  it('CA-labels: a column at a rack face (9 ft / 0.5 ft) whose two clearance labels would overlap — only the wider side, "9\' clear", is labelled; both arrows stay', () => {
    const base = savedFill(vert), cols = layoutColumns(base, GS), LZ = labelScale(faceSize, GS)
    const face = blocksOf(base).aisleBlocks.find(x => Math.min(x.nearClearFt, x.farClearFt) <= 0.5 && Math.max(x.nearClearFt, x.farClearFt) >= 9)
    expect(face, 'a column 0.5 ft off a face').toBeTruthy()
    expect(kinds(clearanceOps(face, cols[face.columnIndex], LZ, GS, true))).toEqual({ lines: 2, polys: 2, texts: ["9' clear"] })
  })
  it('CA-labels-all: every column in an aisle, every Label size — its drawn labels never overlap, both arrows always draw, and a dropped label is always the narrower side; where they do not collide (horizontal at the default size, the face column included) both stay. Sizes: the four presets and a custom 60 in', () => {
    const base = savedFill(vert), cols = layoutColumns(base, GS), blocks = blocksOf(base).aisleBlocks
    let dropped = 0, kept = 0
    for (const size of [...Object.keys(LABEL_SIZES), 60]) {
      for (const b of blocks) {
        const ops = clearanceOps(b, cols[b.columnIndex], labelScale(size, GS), GS, true), k = kinds(ops)
        expect([k.lines, k.polys]).toEqual([2, 2])
        const t = ops.filter(o => o.op === 'text')
        if (t.length === 2) { expect(hit(t[0], t[1])).toBe(false); kept++ } else {
          expect(t.length).toBe(1)
          expect(t[0].text).toBe(`${Math.max(b.nearClearFt, b.farClearFt)}' clear`)
          dropped++
        }
      }
    }
    expect(dropped).toBeGreaterThan(0)
    expect(kept).toBeGreaterThan(0)
    if (!vert) {
      const face = blocks.find(x => Math.min(x.nearClearFt, x.farClearFt) <= 0.5)
      expect(kinds(clearanceOps(face, cols[face.columnIndex], labelScale('medium', GS), GS, true)).texts).toEqual(["9' clear", "0.5' clear"])
    }
  })
  it('CA-labels-all (aisle labels): at every preset Label size no clearance label overlaps an aisle or cross-aisle width label — it slides along its arrow (centre kept on the arrow) or is hidden; both arrows always draw, its two labels still never overlap; horizontal at the default size, the face column 9 ft label slides clear of the aisle label (vertical: the face column at Large / Extra large, hidden)', () => {
    const base = savedFill(vert), cols = layoutColumns(base, GS), blocks = blocksOf(base).aisleBlocks
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    // the width labels' pills, straight from aisleLabelOps (what the canvas and the PDF draw)
    const aisleBoxes = (size) => [
      ...base.filter(o => o.type === 'aisle').flatMap(a => { const L = aisleLabelLayout(a, base, GS); return L ? aisleLabelOps(L, aisleLabelScale(a, size, GS)) : [] }),
      ...crossAisleLabels(base, GS).flatMap(L => aisleLabelOps(L, labelScale(size, GS))),
    ].filter(o => o.op === 'rect').map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
    let clashedBefore = 0, moved = 0, hiddenByAisle = 0
    for (const size of Object.keys(LABEL_SIZES)) {
      const avoid = aisleBoxes(size), lz = labelScale(size, GS)
      expect(avoid.length).toBeGreaterThan(40)
      for (const b of blocks) {
        const col = cols[b.columnIndex], before = clearanceOps(b, col, lz, GS, true).filter(o => o.op === 'text')
        const ops = clearanceOps(b, col, lz, GS, true, avoid), k = kinds(ops), t = ops.filter(o => o.op === 'text')
        expect([k.lines, k.polys]).toEqual([2, 2])
        for (const x of t) expect(avoid.some(r => hit(x, r)), x.text + ' on an aisle label').toBe(false)
        if (t.length === 2) expect(hit(t[0], t[1])).toBe(false)
        // a label that moved stayed on its arrow: its centre between the column edge and the rack face
        const u = b.axis === 'y' ? 'y' : 'x', len = u === 'y' ? 'h' : 'w'
        const lines = ops.filter(o => o.op === 'line'), polys = ops.filter(o => o.op === 'poly')
        for (const x of t) {
          const was = before.find(y => y.text === x.text)
          if (!was || (was.x === x.x && was.y === x.y)) continue
          moved++
          const i = lines.findIndex((_, j) => clearanceMarks(b, col, lz, GS)[j].label.text === x.text)
          const from = u === 'x' ? lines[i].points[0] : lines[i].points[1], tip = u === 'x' ? polys[i].points[0] : polys[i].points[1]
          const c = x[u] + x[len] / 2
          expect(c).toBeGreaterThanOrEqual(Math.min(from, tip) - 1e-6)
          expect(c).toBeLessThanOrEqual(Math.max(from, tip) + 1e-6)
        }
        for (const y of before) if (avoid.some(r => hit(y, r))) { clashedBefore++; if (!t.some(x => x.text === y.text)) hiddenByAisle++ }
      }
    }
    // vertical: the face column 9 ft label meets one at Large and Extra large and has no room (2, hidden);
    // horizontal: 27 meet one at Medium and up, 18 slide clear, 9 are hidden (the cross-aisle label repeats along it)
    expect([clashedBefore, moved, hiddenByAisle]).toEqual(vert ? [2, 0, 2] : [27, 18, 9])
    if (!vert) {
      const face = blocks.find(x => Math.min(x.nearClearFt, x.farClearFt) <= 0.5), lz = labelScale('medium', GS)
      const t = clearanceOps(face, cols[face.columnIndex], lz, GS, true, aisleBoxes('medium')).filter(o => o.op === 'text')
      const nine = t.find(x => x.text === "9' clear"), was = clearanceOps(face, cols[face.columnIndex], lz, GS, true).find(o => o.op === 'text' && o.text === "9' clear")
      expect(nine, 'the 9 ft label is still drawn').toBeTruthy()
      expect(nine.y).not.toBeCloseTo(was.y, 3)
      expect(nine.x).toBeCloseTo(was.x, 6)
    }
  })
  it('CA-labels-wire: the canvas (Overlays.jsx) and the PDF pass the aisle labels\' boxes to the clearance labels', () => {
    expect(readFileSync('src/canvas2/Overlays.jsx', 'utf8')).toMatch(/<ColumnClearanceLabels [^>]*avoid=\{avoid\}/)
    expect(readFileSync('src/export/pdfExport.js', 'utf8')).toMatch(/clearanceOps\(b, columns\[b\.columnIndex\], lz, gridSize, opts\.showColumnLabels, avoid\)/)
  })
})

describe('CA-graph', () => {
  it('CA-graph: one pairing module, no two files importing each other — rowAisles.js imports only rackFootprint.js and syncSections.js; the aisle labels, Check layout, the column check and Generate import it; rackFootprint.js imports nothing; bayLedger.js and capacity.js share palletFit.js (which imports nothing) and bayLedger.js does not import capacity.js', () => {
    const imports = (f) => [...readFileSync(f, 'utf8').matchAll(/^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1])
    expect(imports('src/generate/rowAisles.js').sort()).toEqual(['../utils/syncSections', './rackFootprint'])
    expect(imports('src/generate/rackFootprint.js')).toEqual([])
    expect(imports('src/utils/syncSections.js')).toEqual(['../generate/rackFootprint'])
    expect(imports('src/generate/columnCheck.js')).toContain('./rowAisles')
    expect(imports('src/utils/aisleRebuild.js')).toContain('../generate/rowAisles')
    expect(imports('src/utils/layoutCheck.js')).toContain('../generate/rowAisles')
    expect(imports('src/generate/traceGenerate.js')).toContain('./rowAisles')
    // positionsPerBeam and its spacing live in palletFit.js: bayLedger.js and capacity.js both use it and never import each other
    expect(imports('src/utils/palletFit.js')).toEqual([])
    expect(imports('src/utils/bayLedger.js')).toContain('./palletFit')
    expect(imports('src/utils/bayLedger.js')).not.toContain('./capacity')
    expect(imports('src/utils/capacity.js')).toContain('./palletFit')
    expect(imports('src/utils/capacity.js')).toContain('./bayLedger')
  })
})
