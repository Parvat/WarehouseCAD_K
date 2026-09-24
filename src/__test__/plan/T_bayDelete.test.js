// Area T — deleting bays keeps the remaining bays where they are drawn, at
// any rotation. Drives the REAL store actions every delete path calls.
import { describe, it, expect, beforeAll } from 'vitest'
import { uprightXs } from '../../render/rackOps'
import { localRectToWorld } from '../../generate/columnCheck'
import { anchoredShrink, bayDeleteAnchor } from '../../utils/bayAnchor'
import { keptRuns } from '../../utils/baySplit'
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

/* Expected world rect of a surviving bay: exactly where it was drawn.
 * End deletes shorten the rack with the other end held; middle deletes
 * (area V) now split it and leave a gap instead of closing up — so in
 * every case no remaining bay moves. */
function expectedAfter(obj, removed) {
  const before = new Map(bayRects(obj, BEAMS.map((_, i) => i)))
  const out = new Map()
  for (let j = 0; j < BEAMS.length; j++) if (!removed.has(j)) out.set(j, round(before.get(j)))
  return out
}

/** The drawn rects of every bay the rack `id` left behind, by ORIGINAL
 *  index: its pieces sit in the store in run order, the first keeping the
 *  original id, the rest right after it. */
function keptBayRects(objects, id, removed) {
  const runs = keptRuns(BEAMS.length, removed)
  const at = objects.findIndex(o => o.id === id)
  const pieces = objects.slice(at, at + runs.length)
  return new Map(pieces.flatMap((p, k) => bayRects(p, runs[k]).map(([i, rr]) => [i, round(rr)])))
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
        expect(keptBayRects(store.getState().objects, 'r', removed)).toEqual(expectedAfter(r, removed))
        store.getState().undo()
        expect(store.getState().objects).toEqual([r])
      })
    }

    it(`T-single ${rotation}°: Delete key on one selected bay (first) — the rest don't move; one undo restores`, () => {
      const r = rack('r', rotation)
      load([r])
      store.getState().deleteSingleBay('r', 0)
      expect(keptBayRects(store.getState().objects, 'r', new Set([0]))).toEqual(expectedAfter(r, new Set([0])))
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
        expect(keptBayRects(store.getState().objects, r.id, removed[r.id])).toEqual(expectedAfter(r, removed[r.id]))
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
