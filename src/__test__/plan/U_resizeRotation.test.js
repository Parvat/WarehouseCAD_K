// Area U — every edit that changes a rack's width or height gives, at any
// rotation, exactly the 0° result rotated. Whatever stays fixed at 0° stays
// fixed on screen. Drives the real store; the panel payloads below are built
// with the same formulas the panels use.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { withAnchoredPosition, bayDeleteAnchor } from '../../utils/bayAnchor'
import { uprightXs } from '../../render/rackOps'
import { localRectToWorld } from '../../generate/columnCheck'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store
beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore })

const CX = 2000, CY = 1500   // every test rack is centred here, at every rotation
const beamW = (beams, up) => ((up * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * GS
const rackRow = (rotation, type = 'rack_row') => {
  const beams = [96, 96, 96, 96, 96], w = beamW(beams, 3), h = type === 'rack_double_row' ? (93 / 12) * GS : 140
  return { id: 'r', type, x: CX - w / 2, y: CY - h / 2, width: w, height: h, beams, uprightWidth: 3, flueSpaceIn: type === 'rack_double_row' ? 9 : undefined, rotation }
}
const cantilever = (rotation) => {
  const towers = [36, 36, 36, 36], w = ((towers.length - 1) * 48 / 12) * GS, h = ((36 * 2 + 4) / 12) * GS
  return { id: 'r', type: 'rack_cantilever', x: CX - w / 2, y: CY - h / 2, width: w, height: h, towers, doubleSided: true, spineDepthIn: 4, rotation }
}
const driveIn = (rotation) => {
  const lane = (n, up, pw) => (n + 1) * (up / 12) * GS + n * (((2 * 2 + 1 * 2 + pw) / 12) * GS)
  const w = lane(2, 4, 48), h = 5 * (48 / 12) * GS
  return { id: 'r', type: 'rack_drive_in', x: CX - w / 2, y: CY - h / 2, width: w, height: h, lanes: 2, palletDeep: 5, palletWIn: 48, palletDIn: 48, uprightWidth: 4, rotation }
}
const cantH = (ts, dual) => (((dual ? Math.max(...ts) * 2 + 4 : Math.max(...ts) + 4)) / 12) * GS
const laneRecalc = (o, lanes, deep) => {
  const upPx = (o.uprightWidth / 12) * GS, laneWPx = ((2 * 2 + 1 * 2 + o.palletWIn) / 12) * GS
  return { lanes, palletDeep: deep, palletWIn: o.palletWIn, palletDIn: o.palletDIn, uprightWidth: o.uprightWidth, width: (lanes + 1) * upPx + lanes * laneWPx, height: deep * (o.palletDIn / 12) * GS }
}

/* Each action: make(rotation) -> object, run(obj) applies it through the store. */
const panel = (payload, anchor) => (o) => store.getState().commitObjectUpdate(o.id, withAnchoredPosition(o, payload(o), anchor ? anchor(o) : {}))
const ACTIONS = {
  'store changeSelectedBaysBeam (bay 2 -> 144")': {
    make: rackRow, run: () => { store.setState({ activeBaySelection: [{ objId: 'r', bayIdx: 2 }] }); store.getState().changeSelectedBaysBeam(144) },
  },
  'panel add bay': { make: rackRow, run: panel(o => { const b = [...o.beams, 96]; return { beams: b, width: beamW(b, 3) } }) },
  'panel change bay (bay 1 -> 120")': { make: rackRow, run: panel(o => { const b = [...o.beams]; b[1] = 120; return { beams: b, width: beamW(b, 3) } }) },
  'panel remove bay (last)': { make: rackRow, run: panel(o => { const b = o.beams.slice(0, -1); return { beams: b, width: beamW(b, 3), activeBayIdx: null } }) },
  'panel upright width 3 -> 4"': { make: rackRow, run: panel(o => ({ uprightWidth: 4, width: beamW(o.beams, 4) })) },
  'panel flue 9 -> 12" (double row)': { make: (r) => rackRow(r, 'rack_double_row'), run: panel(o => ({ flueSpaceIn: 12, flueBaseIn: 12, height: o.height + (3 / 12) * GS })) },
  'cantilever add tower': { make: cantilever, run: panel(o => { const t = [...o.towers, 36]; return { towers: t, width: ((t.length - 1) * 48 / 12) * GS } }) },
  'cantilever remove tower': { make: cantilever, run: panel(o => { const t = o.towers.slice(0, -1); return { towers: t, width: ((t.length - 1) * 48 / 12) * GS, activeTowerIdx: null } }) },
  'cantilever arm 36 -> 60"': { make: cantilever, run: panel(o => { const t = o.towers.map(() => 60); return { towers: t, height: cantH(t, true) } }) },
  'cantilever single-sided': { make: cantilever, run: panel(o => ({ doubleSided: false, height: cantH(o.towers, false) })) },
  'lane rack: 3 lanes, 6 deep (width and height)': { make: driveIn, run: panel(o => laneRecalc(o, 3, 6)) },
  /* Column Check "Remove section" and the rack panel's "− Bay" call the
     store's deleteSingleBay (area V). A first-bay remove shortens the rack;
     a middle one splits it — that case is tested in V_baySplit. */
  'Column Check remove section (first bay)': {
    make: rackRow, run: (o) => store.getState().deleteSingleBay(o.id, 0),
  },
}

/** The drawn rack: its box's four corners in world space (local order). */
const corners = (o) => {
  const t = ((o.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const px = (u * o.width) / 2, py = (v * o.height) / 2
    return [+(cx + px * c - py * s).toFixed(6), +(cy + px * s + py * c).toFixed(6)]
  })
}
const spinAbout = ([x, y], deg) => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  return [+(CX + (x - CX) * c - (y - CY) * s).toFixed(6), +(CY + (x - CX) * s + (y - CY) * c).toFixed(6)]
}
function apply(action, rotation) {
  const o = action.make(rotation)
  store.setState({ objects: [JSON.parse(JSON.stringify(o))], activeBaySelection: [], history: [JSON.stringify({ objects: [o], groups: [] })], historyIndex: 0 })
  action.run(store.getState().objects[0])
  return { before: o, after: store.getState().objects[0] }
}

describe('U — any rotation gives exactly the 0° result rotated', () => {
  for (const [name, action] of Object.entries(ACTIONS)) {
    const zero = () => apply(action, 0).after
    for (const rotation of [0, 90, 180, 270]) {
      it(`U ${rotation}°: ${name} — drawn result = the 0° result rotated ${rotation}°; one undo restores`, () => {
        const ref = corners(zero()).map(p => spinAbout(p, rotation))   // the 0° result, rotated (computed first: apply() resets the store)
        const { before, after } = apply(action, rotation)
        expect(corners(after)).toEqual(ref)
        store.getState().undo()
        expect(store.getState().objects).toEqual([before])
      })
    }
  }
})

describe('U — at 0° each edit keeps today\'s fixed point', () => {
  const keepsXY = Object.keys(ACTIONS).filter(n => !n.startsWith('Column Check remove section (first'))
  for (const name of keepsXY) {
    it(`U-0°: ${name} — x and y unchanged (the near/top corner stays)`, () => {
      const { before, after } = apply(ACTIONS[name], 0)
      expect([after.x, after.y]).toEqual([before.x, before.y])
    })
  }
  it('U-0°: Column Check remove section (first bay) — the rest of the rack no longer slides: bays 1-4 stay put', () => {
    const { before, after } = apply(ACTIONS['Column Check remove section (first bay)'], 0)
    const rects = (o, ids) => { const { xs, upW, beams } = uprightXs(o, GS); return beams.map((b, i) => [ids[i], localRectToWorld(o, { x: xs[i] + upW, y: o.y, w: (b / 12) * GS, h: o.height })]) }
    const was = new Map(rects(before, [0, 1, 2, 3, 4]))
    for (const [i, r] of rects(after, [1, 2, 3, 4])) expect(r).toEqual(was.get(i))
  })
})

/* The rack panel's "− Bay" removes the selected bay (activeBayIdx) through
 * the store's deleteSingleBay, like the Delete key. With the FIRST bay
 * selected the far end holds, so bays 1-4 keep their drawn positions
 * exactly, at every rotation. */
describe('U — rack panel "− Bay" with the first bay selected', () => {
  const bayWorld = (o, ids) => {
    const { xs, upW, beams } = uprightXs(o, GS)
    return new Map(beams.map((b, i) => [ids[i], Object.fromEntries(Object.entries(
      localRectToWorld(o, { x: xs[i] + upW, y: o.y, w: (b / 12) * GS, h: o.height })).map(([k, v]) => [k, +v.toFixed(6)]))]))
  }
  for (const rotation of [0, 90, 180, 270]) {
    it(`U-minus-bay ${rotation}°: bays 1-4 stay exactly where they are drawn; one undo restores`, () => {
      const o = { ...rackRow(rotation), activeBayIdx: 0 }
      store.setState({ objects: [JSON.parse(JSON.stringify(o))], activeBaySelection: [], history: [JSON.stringify({ objects: [o], groups: [] })], historyIndex: 0 })
      store.getState().deleteSingleBay(o.id, o.activeBayIdx)
      const before = bayWorld(o, [0, 1, 2, 3, 4]), after = bayWorld(store.getState().objects[0], [1, 2, 3, 4])
      for (const [i, r] of after) expect(r).toEqual(before.get(i))
      store.getState().undo()
      expect(store.getState().objects).toEqual([o])
    })
  }
})

/* Wiring: every size-changing panel commit goes through withAnchoredPosition.
 * The panels are React (no Konva/DOM here), so this reads their source. */
describe('U — every size-changing panel commit is anchored', () => {
  const files = [
    'src/components/RightPanel/panels/RackRowPanelCore.jsx',
    'src/components/RightPanel/panels/CantileverPanel.jsx',
    'src/components/RightPanel/panels/LaneRackPanels.jsx',
  ]
  const calls = (src) => {
    const out = []
    let i = 0
    while ((i = src.indexOf('commitObjectUpdate(', i)) >= 0) {
      let d = 0, j = i + 'commitObjectUpdate'.length
      for (; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')' && --d === 0) break }
      out.push(src.slice(i, j + 1)); i = j
    }
    return out
  }
  for (const f of files) {
    it(`U-wire: ${f.split('/').pop()} — no commit changes width/height without withAnchoredPosition`, () => {
      const src = readFileSync(new URL('../../../' + f, import.meta.url), 'utf8')
      const sized = calls(src).filter(c => /\b(width|height)\s*:/.test(c))
      expect(sized.length).toBeGreaterThan(0)
      expect(sized.filter(c => !/withAnchoredPosition\(/.test(c))).toEqual([])
    })
  }
  const bodyOf = (src, head, len) => src.slice(src.indexOf(head), src.indexOf(head) + len)
  it('U-wire: the rack panel\'s "− Bay" deletes through the store\'s deleteSingleBay (end: shorten, middle: split)', () => {
    const src = readFileSync(new URL('../../../src/components/RightPanel/panels/RackRowPanelCore.jsx', import.meta.url), 'utf8')
    const body = bodyOf(src, 'const removeBay = () => {', 500)
    expect(body).toMatch(/deleteSingleBay\(obj\.id, idxToRemove\)/)
    expect(body).not.toMatch(/commitObjectUpdate\(/)
  })
  it('U-wire: Column Check "Remove section" deletes through deleteSingleBay, using the rotation-aware bayIndex', () => {
    const src = readFileSync(new URL('../../../src/components/RightPanel/ColumnCheckPanel.jsx', import.meta.url), 'utf8')
    const body = bodyOf(src, 'const removeSection = () => {', 900)
    expect(body).toMatch(/const idx = conflict\.bayIndex \?\? bayIndexAt\(/)
    expect(body).toMatch(/deleteSingleBay\(rack\.id, idx\)/)
    expect(body).not.toMatch(/commitObjectUpdate\(/)
  })
})
