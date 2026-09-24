// Area T — deleting bays keeps the remaining bays where they are drawn, at
// any rotation. Drives the REAL store actions every delete path calls.
import { describe, it, expect, beforeAll } from 'vitest'
import { uprightXs } from '../../render/rackOps'
import { localRectToWorld } from '../../generate/columnCheck'
import { anchoredShrink, bayDeleteAnchor } from '../../utils/bayAnchor'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store
beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore })

/* A 5-bay 96" rack on 3" uprights: width (6 x 3 + 5 x 96)" = 498" = 1660 px,
 * 42" deep = 140 px, centred at (2000, 1500) whatever its rotation. One bay
 * plus its upright is 99" = 330 px. */
const BEAMS = [96, 96, 96, 96, 96]
const rack = (id, rotation, cx = 2000, cy = 1500) =>
  ({ id, type: 'rack_row', x: cx - 830, y: cy - 70, width: 1660, height: 140, beams: [...BEAMS], uprightWidth: 3, rotation })
const BAY_PX = 330

/** World rect of each bay (by ORIGINAL index), as drawn. */
function bayRects(obj, originalIndex) {
  const { xs, upW, beams } = uprightXs(obj, GS)
  return beams.map((b, i) => [originalIndex[i], localRectToWorld(obj, { x: xs[i] + upW, y: obj.y, w: (b / 12) * GS, h: obj.height })])
}
const round = (r) => ({ x: +r.x.toFixed(6), y: +r.y.toFixed(6), w: +r.w.toFixed(6), h: +r.h.toFixed(6) })

function load(objects) {
  const snap = JSON.stringify({ objects, groups: [] })
  store.setState({ objects: JSON.parse(JSON.stringify(objects)), activeBaySelection: [], selectedIds: [], history: [snap], historyIndex: 0 })
}

/* Expected world rect of a surviving bay: bays on the held end don't move;
 * bays beyond a gap close up toward the held end by the removed length,
 * along the rack's own run direction as drawn. */
function expectedAfter(obj, removed) {
  const anchor = bayDeleteAnchor(BEAMS.length, removed)
  const t = ((obj.rotation || 0) * Math.PI) / 180
  const before = new Map(bayRects(obj, BEAMS.map((_, i) => i)))
  const out = new Map()
  for (let j = 0; j < BEAMS.length; j++) {
    if (removed.has(j)) continue
    // removed bays between this bay and the held end
    const between = [...removed].filter(k => (anchor === 'start' ? k < j : k > j)).length
    const d = between * BAY_PX * (anchor === 'start' ? -1 : 1)     // along local +x
    const r = before.get(j)
    out.set(j, round({ ...r, x: r.x + d * Math.cos(t), y: r.y + d * Math.sin(t) }))
  }
  return out
}

const CASES = {
  start: new Set([0]),          // first bay
  'start pair': new Set([0, 1]),
  middle: new Set([2]),
  end: new Set([4]),            // last bay
  'end pair': new Set([3, 4]),
}

describe('T — deleting bays: remaining bays stay where they are drawn', () => {
  for (const rotation of [0, 90, 180, 270]) {
    for (const [name, removed] of Object.entries(CASES)) {
      it(`T-multi ${rotation}°: delete ${name} (${[...removed]}) — every remaining bay where it should be; one undo restores`, () => {
        const r = rack('r', rotation)
        load([r])
        store.setState({ activeBaySelection: [...removed].map(bayIdx => ({ objId: 'r', bayIdx })) })
        store.getState().deleteSelectedBays()
        const after = store.getState().objects[0]
        const kept = BEAMS.map((_, i) => i).filter(i => !removed.has(i))
        const got = new Map(bayRects(after, kept).map(([i, rr]) => [i, round(rr)]))
        expect(got).toEqual(expectedAfter(r, removed))
        // bays on the held end moved 0 px
        store.getState().undo()
        expect(store.getState().objects).toEqual([r])
      })
    }

    it(`T-single ${rotation}°: Delete key on one selected bay (first) — the rest don't move; one undo restores`, () => {
      const r = rack('r', rotation)
      load([r])
      store.getState().deleteSingleBay('r', 0)
      const got = new Map(bayRects(store.getState().objects[0], [1, 2, 3, 4]).map(([i, rr]) => [i, round(rr)]))
      expect(got).toEqual(expectedAfter(r, new Set([0])))
      store.getState().undo()
      expect(store.getState().objects).toEqual([r])
    })

    it(`T-rows ${rotation}°: one bay selection across three rows (start of one, end of another, middle of a third)`, () => {
      const rows = [rack('a', rotation, 2000, 1500), rack('b', rotation, 2000 + 600, 1500 + 600), rack('c', rotation, 2000 + 1200, 1500 + 1200)]
      const removed = { a: new Set([0]), b: new Set([4]), c: new Set([2]) }
      load(rows)
      store.setState({ activeBaySelection: Object.entries(removed).flatMap(([objId, s]) => [...s].map(bayIdx => ({ objId, bayIdx }))) })
      store.getState().deleteSelectedBays()
      for (const r of rows) {
        const after = store.getState().objects.find(o => o.id === r.id)
        const kept = BEAMS.map((_, i) => i).filter(i => !removed[r.id].has(i))
        expect(new Map(bayRects(after, kept).map(([i, rr]) => [i, round(rr)]))).toEqual(expectedAfter(r, removed[r.id]))
      }
      store.getState().undo()
      expect(store.getState().objects).toEqual(rows)
    })
  }
})

describe('T — the anchor helper', () => {
  it('T-helper: at 0° it is exactly the old rule (x stays / x += width - newWidth), y unchanged', () => {
    const r = rack('r', 0)
    expect(anchoredShrink(r, 1330, 'start')).toEqual({ x: r.x, y: r.y })
    expect(anchoredShrink(r, 1330, 'end')).toEqual({ x: r.x + 330, y: r.y })
  })
  it('T-helper: which end is held', () => {
    expect(bayDeleteAnchor(5, [0])).toBe('end')
    expect(bayDeleteAnchor(5, [0, 1])).toBe('end')
    expect(bayDeleteAnchor(5, [4])).toBe('start')
    expect(bayDeleteAnchor(5, [2])).toBe('start')
    expect(bayDeleteAnchor(5, [0, 4])).toBe('start')
  })
})
