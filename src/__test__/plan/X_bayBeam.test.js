// Area X — per-bay beam length: presets 4'–16' and a custom value, one bay
// or a multi-bay selection across racks, earlier bays fixed and later ones
// sliding at any rotation, pallets per bay recomputed, red warnings (overlap
// / past the wall) that never block, one undo per change. Plus the three
// bugs in its path: wall clear along the rack's own length, the multi-bay
// box across racks, the store action's grid size.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { uprightXs } from '../../render/rackOps'
import { localRectToWorld } from '../../generate/columnCheck'
import { getRackCapacity, oversizedBayIndices, positionsPerBeam } from '../../utils/capacity'
import {
  BEAM_PRESETS_IN, parseBeamIn, wallClearAlong, planBayBeamChange, changeIssues, rackIssues, issuesText,
} from '../../utils/bayBeam'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, PropertiesPanel
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
  PropertiesPanel = (await import('../../components/RightPanel/PropertiesPanel.jsx')).PropertiesPanel
})

const ROTATIONS = [0, 90, 180, 270]
const orient = (r) => (r % 180 === 0 ? 'horizontal' : 'vertical')
const dirOf = (r) => ({ x: Math.round(Math.cos((r * Math.PI) / 180)), y: Math.round(Math.sin((r * Math.PI) / 180)) })
const r6 = (v) => +v.toFixed(6)
const rect6 = (q) => ({ x: r6(q.x), y: r6(q.y), w: r6(q.w), h: r6(q.h) })
const unescape = (h) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/** Drawn world rect of every bay of a rack. */
function bays(o) {
  const { xs, upW, beams } = uprightXs(o, GS)
  return beams.map((b, i) => rect6(localRectToWorld(o, { x: xs[i] + upW, y: o.y, w: (b / 12) * GS, h: o.height })))
}
const shifted = (q, d, px) => rect6({ ...q, x: q.x + d.x * px, y: q.y + d.y * px })

function load(objects, extra = {}) {
  store.setState({
    objects: JSON.parse(JSON.stringify(objects)), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS,
    history: [JSON.stringify({ objects, groups: extra.groups || [] })], historyIndex: 0, ...extra,
  })
  ssrSync()
}
/* Server rendering reads zustand's server snapshot (getInitialState in 4.5),
 * not the live state: copy the live state into it before each render. */
function ssrSync() { Object.assign(store.getInitialState(), store.getState()) }
/** The value cell next to a label in the rack panel's fit box. */
const cell = (html, label) => (html.match(new RegExp(label + '</span><span[^>]*>([^<]+)</span>')) || [])[1]
const render = (C, props = {}) => { ssrSync(); return unescape(renderToStaticMarkup(createElement(C, props))) }
const get = (id) => store.getState().objects.find(o => o.id === id)
const strip = (objs) => JSON.parse(JSON.stringify(objs))

/** An n-bay 96" rack, `depthPx` deep, centred at (cx, cy), at `rotation`. */
function rack(id, rotation, cx, cy, n = 5, extra = {}) {
  const width = ((3 * (n + 1) + 96 * n) / 12) * GS, height = 140
  return { id, type: 'rack_row', x: cx - width / 2, y: cy - height / 2, width, height, beams: Array(n).fill(96), uprightWidth: 3, rotation, levels: 4, palletWIn: 40, ...extra }
}

/* A building W x H ft with 6" walls: inner box is (W - 1) x (H - 1) ft. */
const building = (wFt, hFt) => ({ id: 'fp', type: 'fp_rect', x: 0, y: 0, width: wFt * GS, height: hFt * GS, wallThicknessFt: 0.5 })

/** A rack whose START end (bay 0's side) touches the inner wall it runs away
 *  from, centred across the building. */
function rackAtWall(id, rotation, fp, n) {
  const W = ((3 * (n + 1) + 96 * n) / 12) * GS
  const d = dirOf(rotation), wt = 20
  const x0 = fp.x + wt, x1 = fp.x + fp.width - wt, y0 = fp.y + wt, y1 = fp.y + fp.height - wt
  const start = {
    x: d.x === 1 ? x0 : d.x === -1 ? x1 : (x0 + x1) / 2,
    y: d.y === 1 ? y0 : d.y === -1 ? y1 : (y0 + y1) / 2,
  }
  return rack(id, rotation, start.x + (d.x * W) / 2, start.y + (d.y * W) / 2, n, { parentId: 'fp' })
}

describe('X — per-bay beam length', () => {
  /* ── a. Wall clear along the rack's own length ────────────────────────────
   * Building 300 x 120 ft, 6" walls -> inner 299 x 119 ft = 3588" x 1428".
   * A rack at 0°/180° runs along the 300' side (3588"); at 90°/270° along the
   * 120' side (1428"). The old code always used the X extent (3588").
   * 14 bays of 96" = 3 x 15 + 96 x 14 = 1389" -> 1428 - 1389 = 39" (3' 3")
   * left along 120'. One more 4' bay adds 48 + 3 = 51" -> 1440", past the
   * wall by 12" = 1'. Changing bay 0 to 11' (+36") -> 1425", inside; to 12'
   * (+48") -> 1437", past by 9". The 120 x 300 building swaps the answers. */
  for (const [wFt, hFt] of [[300, 120], [120, 300]]) {
    for (const rotation of ROTATIONS) {
      const alongX = rotation % 180 === 0
      const shortRun = (alongX ? wFt : hFt) === 120
      const expectClear = shortRun ? 1428 : 3588
      it(`X-wall ${wFt}x${hFt} ${rotation}° (${orient(rotation)}): wall clear ${expectClear}", remaining and warnings along the rack's own length`, () => {
        const fp = building(wFt, hFt)
        const r = rackAtWall('r', rotation, fp, 14)
        const objs = [fp, r]
        const c = wallClearAlong(r, objs, GS)
        expect(r6(c.clearIn)).toBe(expectClear)
        expect(r6(c.clearIn - 1389)).toBe(shortRun ? 39 : 2199)
        expect(rackIssues(r, objs, GS)).toEqual({ overlaps: [], wallOutIn: 0 })
        const warnAdd = (b) => issuesText([...changeIssues(objs, new Map([['r', Panel.addBayUpdate(r, b, GS)]]), GS).byId.values()], Panel.fmtFtIn)
        const warnChange = (b) => issuesText([...changeIssues(objs, new Map([['r', Panel.changeBayUpdate(r, 0, b, GS)]]), GS).byId.values()], Panel.fmtFtIn)
        expect(warnAdd(48)).toBe(shortRun ? "passes the wall by 1'" : null)
        expect(warnChange(132)).toBe(null)
        expect(warnChange(144)).toBe(shortRun ? 'passes the wall by 9"' : null)
        // the panel shows the same numbers
        load(objs, { selectedIds: ['r'] })
        const html = render(Panel.RackRowPanel, { obj: r })
        expect(cell(html, 'Wall clear')).toBe(shortRun ? "119'" : "299'")
        expect(cell(html, 'Remaining')).toBe(shortRun ? `3' 3"` : `183' 3"`)
      })
    }
  }

  /* "Remaining" is the room from the rack's far end (where it grows) to the
   * wall ahead, along its own length. A 14-bay rack (1389") centred in the
   * 300 x 120 building: 0°/180° -> (3588 - 1389) / 2 = 1099.5" = 91' 7.5";
   * 90°/270° -> (1428 - 1389) / 2 = 19.5" = 1' 7.5". */
  for (const rotation of ROTATIONS) {
    it(`X-remaining ${rotation}° (${orient(rotation)}): centred rack -> room to the wall ahead ${rotation % 180 === 0 ? `91' 7.5"` : `1' 7.5"`}`, () => {
      const fp = building(300, 120)
      const r = { ...rack('r', rotation, 150 * GS, 60 * GS, 14), parentId: 'fp' }
      const c = wallClearAlong(r, [fp, r], GS)
      expect(r6(c.aheadIn)).toBe(rotation % 180 === 0 ? 1099.5 : 19.5)
      load([fp, r])
      const html = render(Panel.RackRowPanel, { obj: r })
      expect(cell(html, 'Remaining')).toBe(rotation % 180 === 0 ? `91' 7.5"` : `1' 7.5"`)
    })
  }

  /* ── Presets + custom, one bay: bay 2 of 5 changes, bays 0-1 stay, 3-4 slide.
   * Pallets per level on a beam, 40" face: floor((b - 6 + 4) / 44). */
  const PAL = { 48: 1, 60: 1, 72: 1, 84: 1, 96: 2, 102: 2, 108: 2, 120: 2, 132: 2, 144: 3, 156: 3, 168: 3, 180: 4, 192: 4 }
  const VALUES = [...BEAM_PRESETS_IN.map(b => [String(b), b]), ['102', 102], [`8' 6"`, 102], [`9'`, 108]]
  it('X-presets: 4\' to 16\' in 1\' steps', () => {
    expect(BEAM_PRESETS_IN).toEqual([48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192])
  })
  for (const rotation of ROTATIONS) {
    for (const [typed, b] of VALUES) {
      it(`X-bay ${rotation}° (${orient(rotation)}) ${typed === String(b) ? b + '"' : 'custom ' + typed}: bays 0-1 fixed, 3-4 slide ${b - 96}", pallets recomputed; panel path and multi path agree; one undo each`, () => {
        expect(parseBeamIn(typed)).toBe(b)
        const r = rack('r', rotation, 3000, 3000)
        const before = bays(r), d = dirOf(rotation), slide = ((b - 96) / 12) * GS
        const expected = [before[0], before[1], null, shifted(before[3], d, slide), shifted(before[4], d, slide)]
        const check = () => {
          const now = bays(get('r'))
          expect(now[0]).toEqual(expected[0]); expect(now[1]).toEqual(expected[1])
          expect(now[3]).toEqual(expected[3]); expect(now[4]).toEqual(expected[4])
          expect(r6(Math.max(now[2].w, now[2].h))).toBe(r6((b / 12) * GS))
          expect(get('r').beams).toEqual([96, 96, b, 96, 96])
          expect(getRackCapacity(get('r')).total).toBe((2 * 4 + PAL[b]) * 4)
          expect(positionsPerBeam(b, 40)).toBe(PAL[b])
        }
        // the rack panel's "Change beam" (single bay)
        load([r])
        store.getState().commitObjectUpdate('r', Panel.changeBayUpdate(get('r'), 2, b, GS))
        check()
        const single = strip(get('r'))
        store.getState().undo()
        expect(strip(store.getState().objects)).toEqual(strip([r]))
        // the multi-bay box (store action) on the same one bay
        load([r], { activeBaySelection: [{ objId: 'r', bayIdx: 2 }] })
        store.getState().changeSelectedBaysBeam(b)
        check()
        expect(strip(get('r'))).toEqual(single)
        store.getState().undo()
        expect(strip(store.getState().objects)).toEqual(strip([r]))
      })
    }
  }

  /* ── "+ bay" with a preset and a custom value: every existing bay stays put. */
  for (const rotation of ROTATIONS) {
    for (const b of [48, 192, 102]) {
      it(`X-add ${rotation}° (${orient(rotation)}) + ${b}": the 5 bays stay where they are, a 6th of ${b}" at the far end; one undo`, () => {
        const r = rack('r', rotation, 3000, 3000)
        load([r])
        store.getState().commitObjectUpdate('r', Panel.addBayUpdate(get('r'), b, GS))
        const now = bays(get('r'))
        expect(now.slice(0, 5)).toEqual(bays(r))
        expect(get('r').beams).toEqual([96, 96, 96, 96, 96, b])
        expect(getRackCapacity(get('r')).total).toBe((5 * 2 + PAL[b]) * 4)
        store.getState().undo()
        expect(strip(store.getState().objects)).toEqual(strip([r]))
      })
    }
  }

  /* ── Too short a beam: a custom 40" holds no 40" pallet (40 - 6 + 4 = 38 < 44)
   * -> the oversized X for that bay, and 0 pallets in the panel's bay list. */
  it('X-oversized: custom 40" -> bay flagged (oversized X), 0 pallets, panel shows "0 ✕"', () => {
    expect(parseBeamIn('40')).toBe(40)
    const r = rack('r', 90, 3000, 3000)
    load([r])
    store.getState().commitObjectUpdate('r', Panel.changeBayUpdate(get('r'), 2, 40, GS))
    expect(oversizedBayIndices(get('r').beams, 40)).toEqual([2])
    expect(getRackCapacity(get('r')).total).toBe(8 * 4)
    const html = render(Panel.RackRowPanel, { obj: get('r') })
    expect(html).toContain('0 ✕')
  })

  it('X-parse: inches, feet, feet-and-inches; out of range and junk rejected', () => {
    expect(parseBeamIn('102')).toBe(102)
    expect(parseBeamIn('102"')).toBe(102)
    expect(parseBeamIn(`9'`)).toBe(108)
    expect(parseBeamIn(`8'6`)).toBe(102)
    expect(parseBeamIn(`8' 6"`)).toBe(102)
    for (const bad of ['', 'abc', '4', '400', `31'`, '-96']) expect(parseBeamIn(bad)).toBe(null)
  })

  /* ── b. Multi-bay box across two racks, and the change applied to both. */
  for (const rotation of ROTATIONS) {
    it(`X-multi ${rotation}° (${orient(rotation)}): bays on two racks -> the multi-bay box shows (presets + custom); 12' on both, earlier bays fixed, later slide 48", one undo restores both`, () => {
      const d = dirOf(rotation), across = { x: -d.y, y: d.x }
      const r1 = rack('r1', rotation, 3000, 3000)
      const r2 = rack('r2', rotation, 3000 + across.x * 600, 3000 + across.y * 600)
      const sel = [{ objId: 'r1', bayIdx: 1 }, { objId: 'r2', bayIdx: 3 }]
      load([r1, r2], { selectedIds: ['r1', 'r2'], activeBaySelection: sel })
      const html = render(PropertiesPanel)
      expect(html).toContain('2 bays selected across 2 rows')
      expect(html).toContain('Change all to')
      for (const b of BEAM_PRESETS_IN) expect(html).toContain(`aria-label="${b / 12}' beam"`)
      expect(html).toContain('aria-label="Custom beam length"')
      store.getState().changeSelectedBaysBeam(144)
      const slide = (48 / 12) * GS
      const a = bays(r1), b = bays(r2), na = bays(get('r1')), nb = bays(get('r2'))
      expect(na[0]).toEqual(a[0])
      expect(na.slice(2)).toEqual(a.slice(2).map(q => shifted(q, d, slide)))
      expect(nb.slice(0, 3)).toEqual(b.slice(0, 3))
      expect(nb[4]).toEqual(shifted(b[4], d, slide))
      expect(get('r1').beams).toEqual([96, 144, 96, 96, 96])
      expect(get('r2').beams).toEqual([96, 96, 96, 144, 96])
      store.getState().undo()
      expect(strip(store.getState().objects)).toEqual(strip([r1, r2]))
    })
  }

  /* ── Grouped racks: the group branch of the panel shows the multi-bay box
   * too — bays on two grouped racks, and one bay on one grouped rack. */
  for (const rotation of ROTATIONS) {
    it(`X-group ${rotation}° (${orient(rotation)}): bays on grouped racks -> multi-bay box in the group panel; 12' applied to both, earlier bays fixed, group kept, one undo`, () => {
      const d = dirOf(rotation), across = { x: -d.y, y: d.x }
      const r1 = rack('r1', rotation, 3000, 3000)
      const r2 = rack('r2', rotation, 3000 + across.x * 600, 3000 + across.y * 600)
      const groups = [{ id: 'g', ids: ['r1', 'r2'] }]
      // one bay on one grouped rack
      load([r1, r2], { groups, selectedIds: ['r1'], activeBaySelection: [{ objId: 'r1', bayIdx: 2 }] })
      let html = render(PropertiesPanel)
      expect(html).toContain('Group · 2 objects')
      expect(html).toContain('1 bay selected across 1 row')
      // bays on both grouped racks
      const sel = [{ objId: 'r1', bayIdx: 1 }, { objId: 'r2', bayIdx: 3 }]
      load([r1, r2], { groups, selectedIds: ['r1', 'r2'], activeBaySelection: sel })
      html = render(PropertiesPanel)
      expect(html).toContain('Group · 2 objects')
      expect(html).toContain('2 bays selected across 2 rows')
      for (const b of BEAM_PRESETS_IN) expect(html).toContain(`aria-label="${b / 12}' beam"`)
      expect(html).toContain('aria-label="Custom beam length"')
      // no bays selected: the group panel is unchanged (no box)
      load([r1, r2], { groups, selectedIds: ['r1', 'r2'] })
      expect(render(PropertiesPanel)).not.toContain('Change all to')
      // the change itself
      load([r1, r2], { groups, selectedIds: ['r1', 'r2'], activeBaySelection: sel })
      store.getState().changeSelectedBaysBeam(144)
      const slide = (48 / 12) * GS
      const a = bays(r1), b = bays(r2), na = bays(get('r1')), nb = bays(get('r2'))
      expect(na[0]).toEqual(a[0])
      expect(na.slice(2)).toEqual(a.slice(2).map(q => shifted(q, d, slide)))
      expect(nb.slice(0, 3)).toEqual(b.slice(0, 3))
      expect(nb[4]).toEqual(shifted(b[4], d, slide))
      expect(store.getState().groups).toEqual(groups)
      store.getState().undo()
      expect(strip(store.getState().objects)).toEqual(strip([r1, r2]))
      expect(store.getState().groups).toEqual(groups)
    })
  }

  /* ── Overlap warning, never a block. r1 and r2 end to end on one line with a
   * 12" gap. Bay 1 of r1 to 9' (+12") -> touching, no warning; to 10'
   * (+24") -> overlaps r2. The change still goes through. */
  for (const rotation of ROTATIONS) {
    it(`X-overlap ${rotation}° (${orient(rotation)}): +12" touches (no warning), +24" -> "overlaps 1 rack" (panel and multi-bay box), applied anyway`, () => {
      const d = dirOf(rotation)
      const r1 = rack('r1', rotation, 3000, 3000)
      const len = r1.width, gap = GS
      const r2 = rack('r2', rotation, 3000 + d.x * (len + gap), 3000 + d.y * (len + gap))
      const objs = [r1, r2]
      const warnPanel = (b) => issuesText([...changeIssues(objs, new Map([['r1', Panel.changeBayUpdate(r1, 1, b, GS)]]), GS).byId.values()])
      const warnMulti = (b) => issuesText([...changeIssues(objs, planBayBeamChange(objs, [{ objId: 'r1', bayIdx: 1 }], b, GS), GS).byId.values()])
      expect(rackIssues(r1, objs, GS).overlaps).toEqual([])
      expect(warnPanel(108)).toBe(null); expect(warnMulti(108)).toBe(null)
      expect(warnPanel(120)).toBe('overlaps 1 rack'); expect(warnMulti(120)).toBe('overlaps 1 rack')
      load(objs, { activeBaySelection: [{ objId: 'r1', bayIdx: 1 }] })
      store.getState().changeSelectedBaysBeam(120)
      expect(get('r1').beams[1]).toBe(120)
      expect(rackIssues(get('r1'), store.getState().objects, GS).overlaps).toEqual(['r2'])
      const html = render(Panel.RackRowPanel, { obj: get('r1') })
      expect(html).toContain('role="alert"')
      expect(html).toContain('overlaps 1 rack')
    })
  }

  /* ── c. The store action uses the store's grid size (approval pending). At
   * gridSize 20 a 5-bay rack with one 12' bay is 3 x 6 + 4 x 96 + 144 =
   * 546" = 45.5 ft = 910 px. */
  it('X-grid: changeSelectedBaysBeam sizes the rack with the store gridSize (20 px/ft -> 910 px)', () => {
    const r = { ...rack('r', 0, 3000, 3000), width: (498 / 12) * 20 }
    load([r], { gridSize: 20, activeBaySelection: [{ objId: 'r', bayIdx: 2 }] })
    store.getState().changeSelectedBaysBeam(144)
    expect(r6(get('r').width)).toBe(910)
  })

  /* ── Wiring: the panel commits through these helpers, one commit (one
   * undo), never blocked by the wall. */
  it('X-wire: rack panel "Change beam" / "+ bay" commit once via changeBayUpdate / addBayUpdate, no wall block; multi-bay box -> changeSelectedBaysBeam', () => {
    const src = readFileSync(new URL('../../components/RightPanel/panels/RackRowPanelCore.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/const addBay = \(beamIn = 96\) => commitObjectUpdate\(obj\.id, addBayUpdate\(obj, beamIn, gridSize\)\)/)
    expect(src).toMatch(/const changeBay = \(bayIdx, newBeamIn\) => commitObjectUpdate\(obj\.id, changeBayUpdate\(obj, bayIdx, newBeamIn, gridSize\)\)/)
    expect(src).not.toMatch(/fits && changeBay|disabled=\{!fits\}|return\s*\/\/\s*blocked/)
    expect(src).toMatch(/onPick=\{b => changeSelectedBaysBeam\(b\)\}/)
  })
})
