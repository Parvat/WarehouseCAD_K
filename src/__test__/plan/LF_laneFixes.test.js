// LF_laneFixes.test.js — (lane-fixes, docs/reports/lane-fixes.md) PP's answers to the holiday run's questions:
//   0 the drive-in, drive-through and pallet-flow BOMs off behind one setting (stays off); push-back keeps its BOM
//   1 push-back beams = lanes × levels × frame lines
//   2 push-back anchors: 2 per post, the beam racks' line name ("Anchor")
//   3 a new push-back's first beam at 8 in; a saved one keeps its value; every level counted
//   4 the xlsx shows the push-back section (the Tally: REG-lane-fixes); the beam table unchanged
//   5 a shelving unit with an X comes off its usable units
//   6 a beam number straddling a wall goes just outside it, centred on the row; one off the wall does not move
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneNew, laneSpec } from '../../racks/laneEngine'
import { laneParts, laneBom, laneBomTypes, LANE_BOMS_PENDING_ON, LANE_BOM_PENDING, laneTable, pushbackFrameLines, ANCHORS_PER_POST } from '../../racks/laneBom'
import { computeBom, bomCsv } from '../../utils/bom'
import { bomXlsxSheet } from '../../export/bomXlsx'
import { shelvingUsable } from '../../utils/shelving'
import { beamOffWalls } from '../../canvas2/beamOffWalls'

const GS = 40, px = (inch) => (inch / 12) * GS
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (type, over = {}) => ({ id: 'r', type, x: 1000, y: 1000, rotation: 0, ...laneNew(type, GS), ...over })

describe('(lane-fixes 0) drive-in, drive-through and pallet-flow BOMs off until the dealer details are in', () => {
  it('the one setting is OFF, and holds exactly those three types', () => {
    expect(LANE_BOMS_PENDING_ON).toBe(false)
    expect([...LANE_BOM_PENDING].sort()).toEqual(['rack_drive_in', 'rack_drive_through', 'rack_pallet_flow'])
    expect([...laneBomTypes()]).toEqual(['rack_pushback', 'rack_cantilever', 'rack_shelving'])   // (r6-cantilever) + cantilever's own section; (r7-shelving) + shelving's
  })
  it('no section in the BOM, the CSV or the xlsx; listed under "not in this BOM" as before the holiday run', () => {
    for (const name of ['lane-drive', 'lane-flow', 'lanes-horizontal', 'zone-lane']) {
      const f = load(name), b = computeBom(f.objects, f.elevations, { gridSize: GS })
      const lanes = f.objects.filter(o => LANE_BOM_PENDING.has(o.type))
      expect([name, b.types]).toEqual([name, []])
      expect([name, b.flags.find(x => x.key === 'other')?.ids.length]).toEqual([name, lanes.length])
      expect(bomCsv(b)).not.toMatch(/Drive-in|Drive-through|Pallet flow/)
      expect(JSON.stringify(bomXlsxSheet(b).rows)).not.toMatch(/Drive-in|Drive-through|Pallet flow/)
    }
  })
  it('the formulas are kept: behind the setting the three sections come back', () => {
    const f = load('lane-drive')
    expect(laneBom(f.objects, f.elevations, { gridSize: GS, types: laneBomTypes(true) }).map(t => t.name)).toEqual(['Drive-in racking', 'Drive-through racking'])
    expect(laneParts(mk('rack_drive_in'), 4, GS).length).toBe(6)
    expect(laneParts(mk('rack_pallet_flow'), 3, GS).length).toBe(6)
  })
  it('push-back keeps its section (walls-racks: the drive-in flagged, the push-back counted)', () => {
    const f = load('walls-racks'), b = computeBom(f.objects, f.elevations, { gridSize: GS })
    expect(b.types.map(t => t.name)).toEqual(['Push-back racking', 'Cantilever racking', 'Shelving racking'])   // (r6-cantilever) the cantilever counted too; (r7-shelving) the shelving run too
  })
})

describe('(lane-fixes 1, 2, 3) push-back beams, anchors and the first level', () => {
  it('beams = lanes × levels × frame lines, every depth 2 to 6', () => {
    for (const D of [2, 3, 4, 5, 6]) {
      const o = mk('rack_pushback', { palletDeep: D, height: px(D * 52) }), F = pushbackFrameLines(D, o.maxPerFrame)   // (pushback-config) a new rack's own max per frame
      const parts = Object.fromEntries(laneParts(o, 3, GS).map(p => [p.part, p.qty]))
      expect([D, parts.Beam]).toEqual([D, 3 * 3 * F])
      expect([D, parts.Anchor]).toEqual([D, 2 * 4 * 2 * (F - 1)])   // (pushback-frames) 2 per post, 2 posts on each of the N = F − 1 frames on each of the 4 post lines
    }
    expect(ANCHORS_PER_POST).toBe(2)
  })
  it('the anchor line is named as the beam racks\' ("Anchor", no size)', () => {
    const g = load('older-horizontal'), bb = computeBom(g.objects, g.elevations, { gridSize: GS })
    const beamAnchor = bb.lines.find(l => l.part === 'Anchor')
    const pb = laneParts(mk('rack_pushback'), 3, GS).find(p => p.part === 'Anchor')
    expect([pb.part, pb.size]).toEqual([beamAnchor.part, beamAnchor.size])
  })
  it('a new push-back: first beam 8 in; a saved one keeps its value (none saved: 0, as before)', () => {
    expect(laneNew('rack_pushback', GS).firstIn).toBe(8)
    expect(laneSpec(mk('rack_pushback'), GS).heightIn).toBe(8 + 3 * 60)
    const { firstIn, ...old } = mk('rack_pushback'); void firstIn
    expect(laneSpec(old, GS).firstIn).toBe(0)
    for (const o of load('lane-push').objects.filter(x => x.type === 'rack_pushback')) expect(laneSpec(o, GS).firstIn).toBe(o.firstIn ?? 0)
    // the other types' first rail / beam unchanged
    expect([laneNew('rack_drive_in', GS).firstIn, laneNew('rack_pallet_flow', GS).firstIn]).toEqual([8, 0])
  })
  it('the bottom level counts: beams, rail sets and carts for every level', () => {
    const p = Object.fromEntries(laneParts(mk('rack_pushback'), 3, GS).map(q => [q.part, q.qty]))
    expect([p.Beam, p['Rail set'], p.Cart]).toEqual([3 * 3 * 3, 3 * 3, 3 * 3 * 3])
  })
})

describe('(lane-fixes 4) the xlsx: the push-back section as the BOM tab and the CSV show it', () => {
  it('its name and letter lines, Part · Size · P1 · P2 · Total, each part', () => {
    const f = load('lane-push'), b = computeBom(f.objects, f.elevations, { gridSize: GS })
    const rows = bomXlsxSheet(b).rows.map(r => r.map(String))
    const at = rows.findIndex(r => /^Push-back racking/.test(r[0] || ''))
    expect(rows[at][0]).toBe('Push-back racking · P1, P2')
    expect(rows[at + 1]).toEqual(['Part', 'Size', 'P1', 'P2', 'Total'])
    const t = laneTable(b.types[0])
    expect(rows.slice(at + 2, at + 2 + t.parts.length).map(r => r[r.length - 1])).toEqual(t.parts.map(p => String(p.total)))
    expect(rows.slice(at + 2).map(r => r[0])).toEqual(['Frame', 'Row spacer', 'Beam', 'Rail set', 'Cart', 'Entry guide', 'Anchor'])   // (pushback-frames) + row spacers
  })
  it('the beam racks\' table is exactly as it was (no lane section: the same rows, widths and bold rows)', () => {
    for (const name of ['older-horizontal', 'crowded-vertical', 'walls-racks']) {
      const f = load(name), b = computeBom(f.objects, f.elevations, { gridSize: GS })
      const a = bomXlsxSheet({ ...b, types: [] }), c = bomXlsxSheet(b)
      expect(c.rows.slice(0, a.rows.length)).toEqual(a.rows)
      expect(c.widths.slice(0, a.widths.length)).toEqual(a.widths)
      expect(c.merges).toEqual(a.merges)
    }
  })
})

describe('(lane-fixes 5) a shelving unit with an X comes off usable', () => {
  const sh = { id: 's', type: 'rack_shelving', x: 0, y: 0, width: 480, height: 80, rotation: 0 }   // 3 units of 48 in
  it('a zone over one unit: 2 of 3 usable; over none: 3 of 3', () => {
    expect(shelvingUsable([sh], sh, GS)).toEqual({ units: 3, lost: 0, usable: 3 })
    expect(shelvingUsable([sh, { id: 'z', type: 'zone_office', x: 0, y: -20, width: 100, height: 200 }], sh, GS)).toEqual({ units: 3, lost: 1, usable: 2 })
  })
  it('a rack over two units: 1 of 3 usable; a unit covered twice counts once', () => {
    const cv = { id: 'c', type: 'rack_cantilever', x: 170, y: -40, width: 280, height: 160, rotation: 0 }
    const z = { id: 'z', type: 'zone_office', x: 170, y: -20, width: 100, height: 200 }
    const a = shelvingUsable([sh, cv], sh, GS), b = shelvingUsable([sh, cv, z], sh, GS)
    expect(a.lost).toBe(2); expect(b.lost).toBe(2)
  })
})

describe('(lane-fixes 6) a beam number at a wall', () => {
  // a building 0 … 2000 with a 0.5 ft wall (20 px) inside the outline: inner face at x 20
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 2000, height: 1000, wallThicknessFt: 0.5 }
  it('one straddling the west wall goes just outside it, centred on the row; one clear of the wall stays', () => {
    const fs = 15, at = { key: 'a', text: 'R1', x: 5, y: 92, w: 22, h: 18.75, align: 'right', vert: false, r0: 40, s0: 80, s1: 120 }
    const off = { key: 'b', text: 'R2', x: 200, y: 292, w: 22, h: 18.75, align: 'right', vert: false, r0: 240, s0: 280, s1: 320 }
    const out = beamOffWalls([at, off], fs, [], [fp], GS)
    expect(out[1]).toEqual(off)
    expect(out[0].x + out[0].w).toBeLessThan(0)                  // outside the outer face
    expect(out[0].y + out[0].h / 2).toBeCloseTo(100, 6)          // centred on the row
    expect(out[0].wall).toBe(true)
  })
  it('no building: nothing moves', () => {
    const p = [{ key: 'a', text: 'R1', x: 5, y: 92, w: 22, h: 18.75, vert: false, r0: 40, s0: 80, s1: 120 }]
    expect(beamOffWalls(p, 15, [], [], GS)).toBe(p)
  })
})

describe('(lane-fixes 8) pdf-parity: the PDF prints what the plan draws', () => {
  it('every rack number, at the place the plan computes (canvas2/rowLabelPlace.js), in the rack numbers\' colour', async () => {
    const { buildLayoutSVG, rowNumberPlaces } = await import('../../export/pdfExport')
    const { rackNumbersNow } = await import('../../utils/rackLines')
    for (const name of ['older-horizontal', 'crowded-vertical', 'walls-racks', 'lane-push']) {
      const f = load(name), svg = buildLayoutSVG(f.objects, f.layers, GS, { elevations: f.elevations }).svg
      const places = rowNumberPlaces(f.objects, GS, f.elevations)
      const printed = [...svg.matchAll(/data-rack-number="([^"]+)"/g)].map(m => m[1])
      expect([name, printed.length]).toEqual([name, places.length])
      expect(places.length).toBeGreaterThan(0)
      expect(rackNumbersNow(f.objects, GS).length).toBeGreaterThanOrEqual(places.length)
      expect(printed.sort()).toEqual(places.map(p => p.text).sort())
    }
  })
  it('screen-px strokes print at 0.25 mm a px: a rack\'s edge, the slots\' dash, an item\'s box edge, a zone\'s edge', async () => {
    const { buildLayoutSVG } = await import('../../export/pdfExport')
    const objs = [
      { id: 'a', type: 'rack_row', x: 0, y: 0, width: 330, height: 140, beams: [96, 96], uprightWidth: 3 },
      { id: 'f', type: 'mhe_forklift', x: 500, y: 0, width: 100, height: 200, stroke: '#f59e0b', fill: '#f59e0b22', strokeWidth: 2 },
      { id: 'z', type: 'zone_office', x: 0, y: 400, width: 400, height: 300, stroke: '#7c3aed' },
    ]
    const s = buildLayoutSVG(objs, [], GS)
    expect(s.px).toBeGreaterThan(0)
    expect(s.svg).toContain(`stroke-dasharray="${2 * s.px} ${3 * s.px}"`)                     // a beam rack's pallet slots: 2 · 3 px
    expect(s.svg).toContain(`stroke="#f59e0b" stroke-width="${2 * s.px}"`)                     // the forklift's 2 px edge
    expect(s.svg).toContain(`stroke="#7c3aed" stroke-width="${1.5 * s.px}"`)                   // the zone's 1.5 px edge
  })
})

describe('(lane-fixes 5) shelving: the face X marks count too, with the plan\'s truck', () => {
  it('a zone across the run blocking both pick faces: every unit has an X — 0 of 3 usable; without a profile only the covered one', async () => {
    const { MHE_PROFILES } = await import('../../generate/columnCheck')
    const sh = { id: 's', type: 'rack_shelving', x: 0, y: 0, width: 480, height: 80, rotation: 0 }
    const z = { id: 'z', type: 'zone_office', x: 0, y: -40, width: 100, height: 200 }
    const { faceLostMarks } = await import('../../generate/coverLost')
    const marks = faceLostMarks([sh, z], { gridSize: GS, profile: MHE_PROFILES.reach }).filter(m => m.rackId === 's').length
    const u = shelvingUsable([sh, z], sh, GS, MHE_PROFILES.reach)
    expect(marks).toBeGreaterThan(0)
    expect(u).toEqual({ units: 3, lost: 3, usable: 0 })                               // as the plan draws: an X on every unit
    expect(shelvingUsable([sh, z], sh, GS).lost).toBe(1)
  })
})
