// Area V — deleting a middle bay leaves a gap (the rack splits), and
// Shift+click toggles single bays in a bay selection.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { uprightXs } from '../../render/rackOps'
import { localRectToWorld, rackFootprint } from '../../generate/columnCheck'
import { applyBayDeletes, keptRuns } from '../../utils/baySplit'
import { toggleBaySelection, inBayMode, bayEntriesInMarquee, setStickyBayMode, isStickyBayMode } from '../../canvas2/selection'
import { hitTestBay } from '../../canvas2/hitTest'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store
beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore })

/* A 5-bay 96" rack on 3" uprights, 1660 x 140 px, centred at (2000, 1500).
 * A beam is 96" = 320 px; a beam plus its upright 99" = 330 px. */
const BEAMS = [96, 96, 96, 96, 96]
const rack = (id, rotation, cx = 2000, cy = 1500, extra = {}) =>
  ({ id, type: 'rack_row', x: cx - 830, y: cy - 70, width: 1660, height: 140, beams: [...BEAMS], uprightWidth: 3, rotation, parentId: 'fp', ...extra })
const r6 = (v) => +v.toFixed(6)
const rect6 = (r) => ({ x: r6(r.x), y: r6(r.y), w: r6(r.w), h: r6(r.h) })

/** Drawn world rects of every bay of every rack piece, in piece order —
 *  the original's kept bay indices map onto them in order. */
function bays(objs) {
  const out = []
  for (const o of objs.filter(q => q.type === 'rack_row')) {
    const { xs, upW, beams } = uprightXs(o, GS)
    beams.forEach((b, i) => out.push(rect6(localRectToWorld(o, { x: xs[i] + upW, y: o.y, w: (b / 12) * GS, h: o.height }))))
  }
  return out
}
/** Empty stretch between two consecutive pieces, along the run (world px). */
function gapsBetweenPieces(objs, rotation) {
  const f = objs.filter(q => q.type === 'rack_row').map(rackFootprint)
  const along = rotation % 180 === 0 ? (q) => [q.x, q.x + q.w] : (q) => [q.y, q.y + q.h]
  const spans = f.map(along).sort((a, b) => a[0] - b[0])
  return spans.slice(1).map((s, i) => r6(s[0] - spans[i][1]))
}
function load(objects, groups = []) {
  store.setState({ objects: JSON.parse(JSON.stringify(objects)), groups: JSON.parse(JSON.stringify(groups)), activeBaySelection: [], selectedIds: [], history: [JSON.stringify({ objects, groups })], historyIndex: 0 })
}
const deleteBays = (entries) => { store.setState({ activeBaySelection: entries }); store.getState().deleteSelectedBays() }

describe('V — a middle bay delete leaves a gap: the rack splits, every bay stays put', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const original = rack('r', rotation)
    const all = bays([original])
    const keep = (removed) => all.filter((_, i) => !removed.includes(i))

    it(`V-middle ${rotation}°: delete bay 2 -> two racks, bays 0,1,3,4 exactly where they were, gap = one 96" beam (320 px); one undo restores`, () => {
      load([original])
      deleteBays([{ objId: 'r', bayIdx: 2 }])
      const objs = store.getState().objects
      expect(objs.filter(o => o.type === 'rack_row')).toHaveLength(2)
      expect(bays(objs)).toEqual(keep([2]))
      expect(gapsBetweenPieces(objs, rotation)).toEqual([320])
      expect(objs.map(o => o.parentId)).toEqual(['fp', 'fp'])
      store.getState().undo()
      expect(store.getState().objects).toEqual([original])
    })

    it(`V-apart ${rotation}°: delete bays 1 and 3 -> three racks, two 320 px gaps, bays 0,2,4 unmoved`, () => {
      load([original])
      deleteBays([{ objId: 'r', bayIdx: 1 }, { objId: 'r', bayIdx: 3 }])
      const objs = store.getState().objects
      expect(objs).toHaveLength(3)
      expect(bays(objs)).toEqual(keep([1, 3]))
      expect(gapsBetweenPieces(objs, rotation)).toEqual([320, 320])
    })

    it(`V-adjacent ${rotation}°: delete bays 1 and 2 -> two racks, ONE gap of 96 + 3 + 96 = 195" (650 px): the upright between them had no bay left`, () => {
      load([original])
      deleteBays([{ objId: 'r', bayIdx: 1 }, { objId: 'r', bayIdx: 2 }])
      const objs = store.getState().objects
      expect(objs).toHaveLength(2)
      expect(bays(objs)).toEqual(keep([1, 2]))
      expect(gapsBetweenPieces(objs, rotation)).toEqual([650])
    })

    it(`V-key ${rotation}°: the Delete key on one middle bay (deleteSingleBay) splits the same way`, () => {
      load([original])
      store.getState().deleteSingleBay('r', 2)
      const objs = store.getState().objects
      expect(objs).toHaveLength(2)
      expect(bays(objs)).toEqual(keep([2]))
      store.getState().undo()
      expect(store.getState().objects).toEqual([original])
    })

    it(`V-ends ${rotation}°: first/last deletes don't split — the rack shortens, the other bays stay put`, () => {
      load([original])
      deleteBays([{ objId: 'r', bayIdx: 0 }])
      expect(store.getState().objects).toHaveLength(1)
      expect(bays(store.getState().objects)).toEqual(keep([0]))
      load([original])
      deleteBays([{ objId: 'r', bayIdx: 4 }])
      expect(store.getState().objects).toHaveLength(1)
      expect(bays(store.getState().objects)).toEqual(keep([4]))
    })
  }

  /* Two facing rows A (split) and B, with an aisle between them. After the
   * split both pieces still face B, so the aisle becomes two: the original
   * (same id and label) on the first piece, a copy on the second. */
  it('V-aisles: an aisle to a split rack is kept for every piece that still faces across it; undo restores the one aisle', () => {
    const A = rack('A', 0, 2000, 1500), B = rack('B', 0, 2000, 1500 + 560)
    const aisle = { id: 'ai', type: 'aisle', row1Id: 'A', row2Id: 'B', label: 'Main', parentId: 'fp' }
    load([A, B, aisle])
    deleteBays([{ objId: 'A', bayIdx: 2 }])
    const objs = store.getState().objects
    const pieces = objs.filter(o => o.type === 'rack_row' && o.id !== 'B').map(o => o.id)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toBe('A')   // the first piece keeps the original id
    const aisles = objs.filter(o => o.type === 'aisle')
    expect(aisles.map(a => [a.row1Id, a.row2Id, a.label]).sort()).toEqual([['A', 'B', 'Main'], [pieces[1], 'B', 'Main']].sort())
    expect(aisles.find(a => a.row1Id === 'A').id).toBe('ai')
    store.getState().undo()
    expect(store.getState().objects).toEqual([A, B, aisle])
  })

  it('V-aisles rotated: the same at 90°', () => {
    const A = rack('A', 90, 2000, 1500), B = rack('B', 90, 2000 + 560, 1500)
    const aisle = { id: 'ai', type: 'aisle', row1Id: 'A', row2Id: 'B', label: '' }
    load([A, B, aisle])
    deleteBays([{ objId: 'A', bayIdx: 2 }])
    const aisles = store.getState().objects.filter(o => o.type === 'aisle')
    expect(aisles).toHaveLength(2)
    expect(new Set(aisles.map(a => a.row2Id))).toEqual(new Set(['B']))
  })

  it('V-groups: every piece joins the groups its rack was in', () => {
    const A = rack('A', 0), C = rack('C', 0, 2000, 3000)
    load([A, C], [{ id: 'g', ids: ['A', 'C'] }])
    deleteBays([{ objId: 'A', bayIdx: 2 }])
    const pieceIds = store.getState().objects.filter(o => o.id !== 'C').map(o => o.id)
    expect(pieceIds).toHaveLength(2)
    expect(new Set(store.getState().groups[0].ids)).toEqual(new Set([...pieceIds, 'C']))
  })

  it('V-helper: kept runs', () => {
    expect(keptRuns(5, new Set([2]))).toEqual([[0, 1], [3, 4]])
    expect(keptRuns(5, new Set([1, 2]))).toEqual([[0], [3, 4]])
    expect(keptRuns(5, new Set([0, 4]))).toEqual([[1, 2, 3]])
  })

  it('V-helper: applyBayDeletes on a plain state gives the same split (no store)', () => {
    const s = { objects: [rack('r', 90)], groups: [] }
    let n = 0
    applyBayDeletes(s, { r: [2] }, () => 'new' + ++n)
    expect(s.objects.map(o => o.id)).toEqual(['r', 'new1'])
    expect(bays(s.objects)).toEqual(bays([rack('r', 90)]).filter((_, i) => i !== 2))
  })
})

describe('V — Shift+click toggles single bays in a bay selection', () => {
  for (const rotation of [0, 90]) {
    const label = rotation ? 'vertical' : 'horizontal'
    /* Two racks side by side along the stack. A marquee catching bays 1-3 of
     * both, then Shift+clicks at bay centres found with hitTestBay — the
     * same rotation-aware pick the canvas uses. */
    const A = rack('A', rotation, 2000, 1500), B = rack(`B`, rotation, rotation ? 2600 : 2000, rotation ? 1500 : 2100)
    const objects = [A, B]
    const centreOf = (o, i) => {
      const { xs, upW } = uprightXs(o, GS)
      const r = localRectToWorld(o, { x: xs[i] + upW, y: o.y, w: 320, h: o.height })
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    }
    const marquee = (() => {
      const pts = [centreOf(A, 1), centreOf(A, 3), centreOf(B, 1), centreOf(B, 3)]
      const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y))
      return { x: x0, y: y0, width: x1 - x0 || 1, height: y1 - y0 || 1 }
    })()
    const keys = (entries) => entries.map(e => `${e.objId}#${e.bayIdx}`).sort()

    it(`V-toggle ${label}: after a marquee, Shift+click a selected bay removes it and Shift+click it again adds it back`, () => {
      const entries = bayEntriesInMarquee(objects, marquee, GS)
      expect(keys(entries)).toEqual(['A#1', 'A#2', 'A#3', 'B#1', 'B#2', 'B#3'])
      const st = { activeBaySelection: entries, selectedIds: ['A', 'B'], objects }
      expect(inBayMode(st)).toBe(true)
      const p = centreOf(A, 2)
      const bay = hitTestBay(A, p.x, p.y, GS)
      expect(bay).toBe(2)
      const off = toggleBaySelection(st, 'A', bay)
      expect(keys(off.entries)).toEqual(['A#1', 'A#3', 'B#1', 'B#2', 'B#3'])
      const on = toggleBaySelection({ ...st, activeBaySelection: off.entries, selectedIds: off.selectedIds }, 'A', bay)
      expect(keys(on.entries)).toEqual(keys(entries))
    })

    it(`V-toggle ${label}: Shift+click an unselected bay of another rack adds it (and selects that rack)`, () => {
      const st = { activeBaySelection: [{ objId: 'A', bayIdx: 0 }], selectedIds: ['A'], objects }
      const next = toggleBaySelection(st, 'B', 4)
      expect(keys(next.entries)).toEqual(['A#0', 'B#4'])
      expect(next.selectedIds.sort()).toEqual(['A', 'B'])
    })

    it(`V-toggle ${label}: toggling a rack's last bay off drops the rack from the selection`, () => {
      const st = { activeBaySelection: [{ objId: 'A', bayIdx: 0 }, { objId: 'B', bayIdx: 1 }], selectedIds: ['A', 'B'], objects }
      const next = toggleBaySelection(st, 'B', 1)
      expect(keys(next.entries)).toEqual(['A#0'])
      expect(next.selectedIds).toEqual(['A'])
    })

    it(`V-toggle ${label}: a single clicked bay (activeBayIdx) plus Shift+click another bay selects both`, () => {
      const objs = [{ ...A, activeBayIdx: 1 }, B]
      const st = { activeBaySelection: [], selectedIds: ['A'], objects: objs }
      expect(inBayMode(st)).toBe(true)
      expect(keys(toggleBaySelection(st, 'A', 3).entries)).toEqual(['A#1', 'A#3'])
    })
  }

  it('V-toggle: toggling the LAST bay off then Shift+clicking it again adds it back (bay mode stays on)', () => {
    const A = rack('A', 90)
    const st = { activeBaySelection: [{ objId: 'A', bayIdx: 2 }], selectedIds: ['A'], objects: [A] }
    setStickyBayMode(true)                        // the bay marquee that made the selection turns bay mode on
    const off = toggleBaySelection(st, 'A', 2)
    expect(off.entries).toEqual([])
    const empty = { activeBaySelection: off.entries, selectedIds: off.selectedIds, objects: [A] }
    expect(inBayMode(empty)).toBe(false)          // nothing is selected any more...
    expect(isStickyBayMode()).toBe(true)          // ...but bay mode is sticky, so the next Shift+click toggles a bay
    expect(toggleBaySelection(empty, 'A', 2).entries).toEqual([{ objId: 'A', bayIdx: 2 }])
    setStickyBayMode(false)
  })

  it('V-toggle: with no bay selection, Shift+click stays a whole-object toggle (not bay mode)', () => {
    expect(inBayMode({ activeBaySelection: [], selectedIds: ['A'], objects: [rack('A', 0)] })).toBe(false)
  })

  it('V-wire: the canvas Shift+click path toggles a bay in bay mode, and bay mode is sticky until a plain click', () => {
    const src = readFileSync(new URL('../../canvas2/useCanvasInteraction.js', import.meta.url), 'utf8')
    expect(src).toMatch(/if \(bay != null && \(inBayMode\(st\) \|\| isStickyBayMode\(\)\)\) \{\s*const next = toggleBaySelection\(st, hit\.id, bay\)/)
    expect(src).toMatch(/st\.setBaySelection\(next\.entries\)\s*st\.selectGroup\(next\.selectedIds\)\s*setStickyBayMode\(true\)/)
    expect(src).toMatch(/if \(!shiftKey\) setStickyBayMode\(false\)/)
  })
})
