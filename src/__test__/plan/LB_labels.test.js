// Area LB — label changes: ONE width label per aisle (centred), ONE width label
// per cross-aisle (centred, the clear width between the facing racks), and
// the "Column labels" view switch, which hides the clearance arrows and their
// distances but never the red warnings, the X marks or the upright flags.
// 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { aisleLabelLayout, aisleRect } from '../../canvas2/hitTest'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { visibleClearanceMarks, aisleWarningRect, SHORT_COLOR } from '../../canvas2/aisleMarks'
import { pxToFtIn } from '../../utils/canvas'
import { GS } from './fixtures'

let seq = 0
const newId = () => 'a' + (++seq)
function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS }
  return rebuildAisles([fp, ...racks], newId).objects
}

describe.each(['horizontal', 'vertical'])('LB — %s', (orientation) => {
  const objs = layout(orientation)
  const racks = objs.filter(o => o.type && o.type.startsWith('rack_'))
  const aisles = objs.filter(o => o.type === 'aisle')
  const rot = rackFootprint(racks[0]).rotated
  const run = (f) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w]), cross = (f) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
  const byId = new Map(objs.map(o => [o.id, o]))
  // the generator's sections: racks by genSection, with their run / cross extents
  const sections = [...new Set(racks.map(r => r.genSection))].sort((a, b) => a - b).map(s => {
    const f = racks.filter(r => r.genSection === s).map(rackFootprint)
    return { s, r0: Math.min(...f.map(q => run(q)[0])), r1: Math.max(...f.map(q => run(q)[1])), c0: Math.min(...f.map(q => cross(q)[0])), c1: Math.max(...f.map(q => cross(q)[1])) }
  })

  it('LB-aisle: every aisle has exactly ONE label, centred along it — whatever its length — and each aisle belongs to one section', () => {
    expect(aisles.length).toBeGreaterThan(20)
    const perSection = new Map()
    for (const a of aisles) {
      const L = aisleLabelLayout(a, objs, GS), r = aisleRect(a, objs)
      expect(L.positions).toHaveLength(1)
      const [lo, len] = L.isHoriz ? [r.x, r.width] : [r.y, r.height]
      expect(L.positions[0]).toBeCloseTo(lo + len / 2, 6)
      const s1 = byId.get(a.row1Id).genSection, s2 = byId.get(a.row2Id).genSection
      expect(s1).toBe(s2)
      perSection.set(s1, (perSection.get(s1) || 0) + 1)
    }
    // long aisles are the case that used to get three labels
    expect(aisles.some(a => { const r = aisleRect(a, objs); return (rot ? r.height : r.width) >= 60 * GS })).toBe(true)
    // every section has its aisles labelled, one label each
    expect([...perSection.keys()].sort((a, b) => a - b)).toEqual(sections.map(s => s.s))
  })

  it('LB-cross: one label per cross-aisle — the clear width between the facing racks, centred along the gap and across the racks', () => {
    const labels = crossAisleLabels(objs, GS)
    expect(labels).toHaveLength(sections.length - 1)
    labels.forEach((L, i) => {
      const a = sections[i], b = sections[i + 1]
      expect(L.gapLo).toBeCloseTo(a.r1, 6)
      expect(L.gapHi).toBeCloseTo(b.r0, 6)
      expect(L.text).toBe(pxToFtIn(b.r0 - a.r1, GS))
      expect((b.r0 - a.r1) / GS).toBeGreaterThanOrEqual(DEFAULT_RULES.mhe.reach.crossAisleFt - 1e-6)
      expect(L.labelMid).toBeCloseTo((a.r1 + b.r0) / 2, 6)
      expect(L.positions).toEqual([(Math.min(a.c0, b.c0) + Math.max(a.c1, b.c1)) / 2])
      expect(L.isHoriz).toBe(rot)                         // the gap runs along the rows: X for horizontal rows, Y for vertical
    })
  })

  it('LB-cross-drag: a rack moved into a cross-aisle narrows its label to the new clear width', () => {
    const labels = crossAisleLabels(objs, GS)
    const a = sections[0], edge = racks.filter(r => r.genSection === a.s).sort((p, q) => run(rackFootprint(q))[1] - run(rackFootprint(p))[1])[0]
    const moved = objs.map(o => (o.id === edge.id ? { ...o, x: o.x + (rot ? 0 : 2 * GS), y: o.y + (rot ? 2 * GS : 0) } : o))
    const after = crossAisleLabels(moved, GS)
    expect(after[0].gapHi - after[0].gapLo).toBeCloseTo((labels[0].gapHi - labels[0].gapLo) - 2 * GS, 6)
  })
})

describe('LB — Column labels (now part of the Checks layer)', () => {
  // a column in an aisle: 10' gap, the column 1' wide at 4'..5' -> 4' and 5' clear
  const col = { x: 500, y: 4 * GS, w: GS, h: GS }
  const block = (pinched) => ({ axis: 'y', gapStart: 0, gapEnd: 10 * GS, crossStart: 0, crossEnd: 2000, nearClearFt: 4, farClearFt: 5,
    pinched, nearShort: pinched, farShort: pinched })

  it('LB-toggle: off hides the clearance arrows / distances, never the red "under travel" marks or the red aisle shade', () => {
    const ok = block(false), bad = block(true)
    expect(visibleClearanceMarks(ok, col, 1, GS, true)).toHaveLength(2)
    expect(visibleClearanceMarks(ok, col, 1, GS, false)).toEqual([])                 // plain clearances: hidden
    const red = visibleClearanceMarks(bad, col, 1, GS, false)
    expect(red).toHaveLength(2)                                                        // under travel: still shown
    expect(red.every(m => m.short && m.color === SHORT_COLOR && /under travel/.test(m.label.text))).toBe(true)
    expect(aisleWarningRect(bad, col)).not.toBe(null)                                 // the shade doesn't depend on the switch
    // a mixed block: only the short side stays
    const mixed = { ...bad, farShort: false }
    expect(visibleClearanceMarks(mixed, col, 1, GS, false).map(m => m.side)).toEqual(['near'])
  })

  it('LB-toggle-wire: the switch is folded into the Checks layer — gone from the View menu and the prefs; the clearance labels, X marks, upright flags and oversized bays all draw exactly when the Checks layer does (see LY)', () => {
    const top = readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')
    expect(top).not.toMatch(/Column labels|showColumnLabels/)
    const prefs = readFileSync('src/canvas2/labelPrefs.js', 'utf8')
    expect(prefs).not.toMatch(/showColumnLabels|KEY_COLUMN_LABELS/)
    const ov = readFileSync('src/canvas2/Overlays.jsx', 'utf8')
    expect(ov).toMatch(/\{marksOn && <ColumnClearanceLabels [^>]*showLabels \/>\}/)
    expect(ov).not.toMatch(/showColumnLabels/)
    for (const comp of ['BlockedFaceMarks', 'UprightConflictMarks', 'OversizedBayMarks']) {
      const line = ov.split('\n').find(l => l.includes('<' + comp + ' '))
      expect(line, comp).toBeTruthy()
      expect(line).toMatch(/^\s*\{marksOn && </)
    }
    const ops = readFileSync('src/render/labelOps.js', 'utf8')
    expect(ops).toMatch(/visibleClearanceMarks\(block, col, lz, gridSize, showLabels\)/)
    expect(ops).toMatch(/if \(warn\) out\.push\(\{ op: 'rect', name: 'aisle-warning'/)             // the shade whatever the switch says
  })
})
