// Area NA — a pick face with less than the pick width in front of it loses its positions (generate/narrowAisles.js):
// every bay of the face gets the X mark a column's pick-zone block gets, and its positions come off usable
// (generate/usableCapacity.js); the width label stays amber / red. Rack-to-rack aisles: both faces, over the run they
// share — under the pick width no longer a Check layout warning, under the drive width still an error. Faces with a zone
// or the wall in front: area ZF. Both orientations, racks also turned 180° (their bays counted from the other end).
import { describe, it, expect } from 'vitest'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { narrowAisleBlocks, blockedKeys } from '../../generate/narrowAisles'
import { positionRunSpans } from '../../generate/faceAisles'
import { usableCapacity, runColumnCheck } from '../../generate/usableCapacity'
import { MHE_PROFILES, localRectToWorld, rackFootprint } from '../../generate/columnCheck'
import { blockedPositionRects } from '../../render/labelOps'
import { checkLayout } from '../../utils/layoutCheck'
import { planAreaCreate, planAreaResize } from '../../generate/rackingArea'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'

globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
const REACH = MHE_PROFILES.reach
const W = ((3 * 4 + 3 * 96) / 12) * GS, H = ((42 * 2 + 9) / 12) * GS
const fp = { id: 'fp', type: 'fp_rect', x: -4000, y: -4000, width: 8000, height: 8000, wallThicknessFt: 0.25, fpVerts: [{ x: -4000, y: -4000 }, { x: 4000, y: -4000 }, { x: 4000, y: 4000 }, { x: -4000, y: 4000 }] }

describe.each([['horizontal rows', false], ['vertical rows', true]])('NA — %s', (_, vert) => {
  for (const turned of [false, true]) {
    const rot = (vert ? 90 : 0) + (turned ? 180 : 0)
    /** Two pairs `gapFt` apart across, centred on the floor; `a` the lower across. */
    const two = (gapFt) => {
      const pair = (id, acrossC) => { const cx = vert ? acrossC : 0, cy = vert ? 0 : acrossC; return { id, type: 'rack_double_row', parentId: 'fp', x: cx - W / 2, y: cy - H / 2, width: W, height: H, rotation: rot, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4 } }
      return [fp, pair('a', -(H + gapFt * GS) / 2), pair('b', (H + gapFt * GS) / 2)]
    }
    const across = (b) => (vert ? b.x + b.w / 2 : b.y + b.h / 2)
    const tag = turned ? ' (turned 180°)' : ''

    it(`NA-pick${tag}: two pairs 9' apart — no Check layout item; both facing faces X-marked on every bay (the faces toward the aisle, not the far ones), 24 positions each off usable; the label amber`, () => {
      const objs = two(9)
      const c = checkLayout(objs, { gridSize: GS, profile: REACH })
      expect([...c.errors, ...c.warnings].filter(i => /aisle/.test(i.kind))).toEqual([])
      const blocks = narrowAisleBlocks(objs, { profile: REACH, gridSize: GS })
      expect(blocks.map(b => b.rackId + ':' + b.bayIndex).sort()).toEqual(['a:0', 'a:1', 'a:2', 'b:0', 'b:1', 'b:2'])
      // each X sits on the half toward the aisle (between the two racks)
      const mid = 0
      for (const b of blocks) {
        const r = objs.find(o => o.id === b.rackId), f = rackFootprint(r), centre = across(f)
        for (const raw of blockedPositionRects(b, r, GS)) {
          const w = localRectToWorld(r, { x: raw.x, y: raw.y, w: raw.width, h: raw.height })
          expect(Math.abs(across(w) - mid)).toBeLessThan(Math.abs(centre - mid))
        }
      }
      const u = usableCapacity(objs, { profile: REACH, gridSize: GS })
      expect(u.narrowLost).toBe(2 * 3 * 2 * 4)
      expect(u.usable).toBe(u.gross - 48)
    })

    it(`NA-drive${tag}: 7' apart — still the Check layout error "… 7', needs 8' to drive", and the faces X-marked too`, () => {
      const objs = two(7)
      const c = checkLayout(objs, { gridSize: GS, profile: REACH })
      expect(c.errors.filter(i => i.kind === 'aisle-drive').map(i => i.text)).toEqual([expect.stringMatching(/: 7', needs 8' to drive$/)])
      expect(narrowAisleBlocks(objs, { profile: REACH, gridSize: GS }).length).toBe(6)
    })

    it(`NA-wide${tag}: 10' 6" apart, and 2' (set back to back) — nothing marked, nothing lost`, () => {
      for (const ft of [10.5, 2]) {
        expect([ft, narrowAisleBlocks(two(ft), { profile: REACH, gridSize: GS })]).toEqual([ft, []])
        expect([ft, usableCapacity(two(ft), { profile: REACH, gridSize: GS }).narrowLost]).toEqual([ft, 0])
      }
    })

    it(`NA-once${tag}: a column standing in the 9' aisle — the positions it already blocks count once`, () => {
      const objs = two(9)
      // one column (its centre at x, y) in the middle of the aisle, beside the first bay
      const col = { id: 'cg', type: 'column_grid', parentId: 'fp', x: vert ? 0 : -W / 2 + 4.5 * GS, y: vert ? -W / 2 + 4.5 * GS : 0, width: GS, height: GS, spacingX: [], spacingY: [], columnW: GS, columnH: GS }
      const all = [...objs, col]
      const res = runColumnCheck(all, { profile: REACH, gridSize: GS })
      expect(res.pickBlocks.length).toBeGreaterThan(0)                       // the column does block positions
      const keys = blockedKeys(res), n = narrowAisleBlocks(all, { profile: REACH, gridSize: GS, already: keys })
      for (const b of n) for (const p of b.positionIndices) for (const f of b.faces) expect(keys.has(b.rackId + ':' + b.bayIndex + ':' + f + ':' + p)).toBe(false)
      const u = usableCapacity(all, { profile: REACH, gridSize: GS })
      expect(u.inRackLost + u.pickZoneLost + u.narrowLost).toBeLessThanOrEqual(48 + u.inRackLost)
      expect(u.usable).toBe(u.gross - u.inRackLost - u.pickZoneLost - u.narrowLost)
    })

    // ── each position judged on its own slot (the capacity count's slots), not the whole bay ──
    it(`NA-slot-zone${tag}: a washroom 9' in front of a pair, ending 1" into the second bay's first position — bay 1's positions and that one blocked, its second position (open floor in front) usable; ending 1" into the second position blocks it too`, () => {
      const objs = two(9).filter(o => o.id !== 'b'), r = objs.find(o => o.id === 'a'), f = rackFootprint(r)
      const slots = positionRunSpans(r, GS), run = (b) => (vert ? [b.y, b.y + b.h] : [b.x, b.x + b.w])
      const [r0] = run(f), s0 = vert ? f.x : f.y
      // the bays in run order: the second bay's slots, low end first
      const second = [...slots.entries()].map(([bay, list]) => ({ bay, list: [...list].sort((p, q) => p.a - q.a) })).sort((p, q) => p.list[0].a - q.list[0].a)[1]
      for (const [into, blocked] of [[second.list[0].a + GS / 12, [second.list[0].p]], [second.list[1].a + GS / 12, [second.list[0].p, second.list[1].p]]]) {
        const zb = vert ? { x: s0 - 9 * GS - 4 * GS, y: r0, w: 4 * GS, h: into - r0 } : { x: r0, y: s0 - 9 * GS - 4 * GS, w: into - r0, h: 4 * GS }
        const all = [...objs, { id: 'wz', type: 'zone_washroom', label: 'Washroom', x: zb.x, y: zb.y, width: zb.w, height: zb.h }]
        const blocks = narrowAisleBlocks(all, { profile: REACH, gridSize: GS })
        const inSecond = blocks.filter(b => b.bayIndex === second.bay).flatMap(b => b.positionIndices).sort()
        expect([blocked.length, inSecond]).toEqual([blocked.length, [...blocked].sort()])
        const total = blocks.reduce((t, b) => t + b.positionsLost, 0)
        expect(usableCapacity(all, { profile: REACH, gridSize: GS }).narrowLost).toBe(total)
        expect(total).toBe((2 + blocked.length) * 4)                                     // bay 1's two positions + those, 4 levels
      }
    })

    it(`NA-slot-rack${tag}: two pairs 9' apart, the second shifted 1.5 bays along — only the positions facing the stretch they share are blocked: 3 on one face, 4 on the other (the stretch runs to the end of the first rack's last upright, 3.5\" into the next slot — any overlap blocks), not every bay`, () => {
      const objs = two(9), pitch = (99 / 12) * GS, d = 1.5 * pitch
      const shifted = objs.map(o => (o.id === 'b' ? (vert ? { ...o, y: o.y + d } : { ...o, x: o.x + d }) : o))
      const blocks = narrowAisleBlocks(shifted, { profile: REACH, gridSize: GS })
      const per = (id) => blocks.filter(b => b.rackId === id).reduce((t, b) => t + b.positionIndices.length, 0)
      expect([per('a'), per('b')].sort()).toEqual([3, 4])
      expect(usableCapacity(shifted, { profile: REACH, gridSize: GS }).narrowLost).toBe(7 * 4)
    })
  }

  it('NA-fixture: the 12 fills and the four Generate layouts lose nothing — no face has less than the pick width in front of it', () => {
    const turn = (o) => { const t = { ...o, x: o.y, y: o.x, width: o.height, height: o.width }; if (Array.isArray(o.fpVerts)) t.fpVerts = o.fpVerts.map(v => ({ ...v, x: v.y, y: v.x })); if (o.type === 'column_grid') Object.assign(t, { spacingX: o.spacingY, spacingY: o.spacingX, columnW: o.columnH, columnH: o.columnW }); return t }
    const SHAPE_CUTS = { rectangle: [], L: ['bl'], T: ['bl', 'br'] }
    const shaped = (f, cuts) => { if (!cuts.length) return f; const X = (ft) => f.x + ft * GS, Y = (ft) => f.y + ft * GS, Wd = f.width / GS, Hd = f.height / GS; const v = [[0, 0], [Wd, 0]]; if (cuts.includes('br')) v.push([Wd, 170], [Wd - 150, 170], [Wd - 150, Hd]); else v.push([Wd, Hd]); if (cuts.includes('bl')) v.push([150, Hd], [150, 170], [0, 170]); else v.push([0, Hd]); return { ...f, fpVerts: v.map(([x, y]) => ({ x: X(x), y: Y(y) })) } }
    for (const shape of Object.keys(SHAPE_CUTS)) for (const [turned, orientation, stored] of [[vert ? false : true, 'vertical', !vert], [vert ? true : false, 'horizontal', false]]) {
      const objs = REAL_LAYOUT.map(o => (o.type.startsWith('fp_') ? shaped(o, SHAPE_CUTS[shape]) : { ...o })).map(o => (turned ? turn(o) : o))
      const area = objs.find(o => o.type === 'racking_area'), box = { x: area.x, y: area.y, w: area.width, h: area.height }
      const res = stored ? planAreaResize(objs, area.id, box, { gridSize: GS }) : planAreaCreate(objs.filter(o => o !== area), box, { ...area.settings, orientation }, { gridSize: GS, from: { x: box.x, y: box.y } }).objects
      expect([shape, turned, orientation, usableCapacity(res, { profile: REACH, gridSize: GS }).narrowLost]).toEqual([shape, turned, orientation, 0])
    }
    for (const [L, Wd] of vert ? [[250, 500], [300, 420]] : [[500, 250], [420, 300]]) {
      const f = { id: 'g', type: 'fp_rect', x: 0, y: 0, width: L * GS, height: Wd * GS, wallThicknessFt: 0.25, fpVerts: [{ x: 0, y: 0 }, { x: L * GS, y: 0 }, { x: L * GS, y: Wd * GS }, { x: 0, y: Wd * GS }] }
      const ps = sizingSheetLayout({ lengthFt: L, widthFt: Wd, gridXFt: 30, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', orientation: vert ? 'vertical' : 'horizontal', wallClearIn: 3, wallThicknessIn: 3 }, DEFAULT_RULES)
      expect(usableCapacity([f, ...ps.map(placementToObject).map(r => ({ ...r, parentId: 'g' }))], { profile: REACH, gridSize: GS }).narrowLost).toBe(0)
    }
  })

  it('NA-pdf: the PDF draws the same X marks (labelsSVG with the marks on); off, none', async () => {
    const { labelsSVG } = await import('../../export/pdfExport')
    const objs = [fp, ...[-1, 1].map((k, i) => { const acrossC = k * (H + 9 * GS) / 2, cx = vert ? acrossC : 0, cy = vert ? 0 : acrossC; return { id: 'r' + i, type: 'rack_double_row', parentId: 'fp', x: cx - W / 2, y: cy - H / 2, width: W, height: H, rotation: vert ? 90 : 0, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4 } })]
    const svg = (showMarks) => labelsSVG(objs, GS, { labelSize: 'medium', showAisles: true, showMarks, showColumnLabels: true, profile: REACH, pickBothSides: false })
    const RED = '#C0392B'
    const count = (t) => t.split(RED).length - 1
    expect(count(svg(true))).toBeGreaterThan(count(svg(false)))
  })
})
