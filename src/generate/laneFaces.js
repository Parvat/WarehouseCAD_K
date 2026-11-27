// laneFaces.js — (rack-round2 1) the aisle in front of every face of a rack that is NOT a beam rack: the faces marked
// ENTRY, LOAD or PICK (render/rackOps.js LANE_FACES), a cantilever's arm side, a shelving unit's pick side.
//
// A face needs clear floor in front of it at least the aisle the beam racks' faces need (columnCheck.js aisleLevel —
// the equipment's aisle; under its travel width is level 1, under its aisle level 2), a shelving unit's pick side the
// walkway (Rules: zones.walkwayIn, 44" by default — utils/zoneCheck.js). What blocks it, anywhere in front of the face
// over its length: a wall (the building's inner face), a column, another rack (a mezzanine is a platform: never), a
// zone, a door's clear space. The lane sides and the back can touch anything (as a selective's back). Only short faces
// come back. Read by the canvas (red on the face, the aisle chip — canvas2/Overlays.jsx, live from the drag preview),
// the PDF, Check layout and usable capacity (a short face's positions come off — usableCapacity.js coverLost). Pure.
import { BEAM_TYPES } from '../utils/rackTypes'
import { rackFootprint, aisleLevel, AISLE_MIN_FT, MHE_PROFILES } from './columnCheck'
import { innerOutline, floorSection } from '../utils/floorGeom'
import { fmtLenDown } from '../utils/copyChange'
import { doorClearRects } from '../utils/doorClear'
import { layoutColumns } from './usableCapacity'

const E = 1e-3
const MEZZ = 'rack_mezzanine'
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const norm = (r) => ((((r || 0) % 360) + 360) % 360)

/** Each type's faces, in its own (unrotated) frame: 'top' | 'bottom'. A shelving unit's is decided by what backs it. */
const FACES = {
  rack_drive_in: ['bottom'], rack_drive_through: ['top', 'bottom'], rack_pushback: ['bottom'], rack_pallet_flow: ['top', 'bottom'], rack_carton_flow: ['top', 'bottom'],
}
export const facesOf = (r) => FACES[r.type] || (r.type === 'rack_cantilever' ? ((r.doubleSided ?? true) ? ['top', 'bottom'] : ['bottom']) : [])
export const FACE_WORD = { rack_drive_in: { bottom: 'ENTRY' }, rack_drive_through: { top: 'ENTRY', bottom: 'ENTRY' }, rack_pushback: { bottom: 'LOAD · PICK' }, rack_pallet_flow: { top: 'LOAD', bottom: 'PICK' }, rack_carton_flow: { top: 'LOAD', bottom: 'PICK' } }

/** The world normal of local side `side` of a rack turned `rot` (0 / 90 / 180 / 270, clockwise): [nx, ny]. */
function normalOf(side, rot) {
  const [x, y] = side === 'top' ? [0, -1] : [0, 1], a = (rot * Math.PI) / 180
  return [Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a))]
}
/** The face of footprint `f` facing `n`: { along: 'x' | 'y' (the face runs along), at (its line), a, c (its span),
 *  dir (+1 / −1: the way out along the other axis) }. */
function faceLine(f, [nx, ny]) {
  if (ny) return { along: 'x', at: ny < 0 ? f.y : f.y + f.h, a: f.x, c: f.x + f.w, dir: ny }
  return { along: 'y', at: nx < 0 ? f.x : f.x + f.w, a: f.y, c: f.y + f.h, dir: nx }
}

/** How far the floor in front of face `fl` is clear (world px), up to `look`: the nearest wall, column, rack, zone or
 *  door clear space over its span. → { d, kind } */
export function clearInFront(fl, look, { boxes, poly }) {   // (r9-mezzanine) exported: a pallet gate's face aisle
  let best = { d: look, kind: null }
  const lo = fl.dir > 0 ? fl.at : fl.at - look, hi = fl.dir > 0 ? fl.at + look : fl.at
  const a = fl.a + 1, c = fl.c - 1
  for (const b of boxes) {
    const [b0, b1] = fl.along === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h], [q0, q1] = fl.along === 'x' ? [b.y, b.y + b.h] : [b.x, b.x + b.w]
    if (!(Math.min(c, b1) - Math.max(a, b0) > E)) continue          // not across the face's length
    if (!(Math.min(hi, q1) - Math.max(lo, q0) > E)) continue         // not in front within `look`
    const d = Math.max(0, fl.dir > 0 ? q0 - fl.at : fl.at - q1)
    if (d < best.d) best = { d, kind: b.kind }
  }
  if (poly) for (const u of [a, (a + c) / 2, c]) {
    // the floor across the face's line, through it: its far end in front is the wall (a face on the wall: 0)
    const iv = floorSection(poly, fl.along, u, -1e9, 1e9).find(([p, q]) => p - 1 <= fl.at && fl.at <= q + 1)
    if (!iv) continue
    const d = Math.max(0, fl.dir > 0 ? iv[1] - fl.at : fl.at - iv[0])
    if (d < best.d) best = { d, kind: 'wall' }
  }
  return best
}

/** Every short face of a rack that is not a beam rack: [{ rack, side (its own frame), word, width (world px), level
 *  (1 / 2), kind (what blocks it), face: { x1, y1, x2, y2 } (the face line, world), box (the aisle in front, world),
 *  isHoriz, gapLo, gapHi, labelMid, positions, text — the aisle chip's shape (aisleLabelOps) }]. `walkwayIn`: the
 *  shelving pick side's minimum. */
export function laneFaceGaps(objects, { gridSize = 40, profile = MHE_PROFILES.reach, walkwayIn = 44 } = {}) {
  if (!Array.isArray(objects) || !profile) return []
  const racks = objects.filter(o => isRack(o) && !BEAM_TYPES.has(o.type) && o.type !== MEZZ && norm(o.rotation) % 90 === 0)
  if (!racks.length) return []
  const polys = new Map(), polyOf = (r) => {
    const fp = objects.find(o => o.id === r.parentId && typeof o.type === 'string' && o.type.startsWith('fp_'))
    if (!fp) return null
    if (!polys.has(fp.id)) polys.set(fp.id, innerOutline(fp, gridSize))
    return polys.get(fp.id)
  }
  const fixed = [
    ...objects.filter(isZone).map(z => ({ x: z.x, y: z.y, w: z.width, h: z.height, kind: 'zone' })),
    ...layoutColumns(objects, gridSize).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: 'column' })),
    ...doorClearRects(objects, gridSize).map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, kind: 'door' })),
  ]
  const rackBoxes = objects.filter(o => isRack(o) && o.type !== MEZZ).map(o => { const f = rackFootprint(o); return { id: o.id, x: f.x, y: f.y, w: f.w, h: f.h, kind: 'rack' } })
  const aislePx = profile.aisleFt * gridSize, walkPx = (walkwayIn / 12) * gridSize, backPx = AISLE_MIN_FT * gridSize
  const out = []
  for (const r of racks) {
    const f = rackFootprint(r), rot = norm(r.rotation), poly = polyOf(r)
    const ctx = { boxes: [...fixed, ...rackBoxes.filter(b => b.id !== r.id)], poly }
    let sides = facesOf(r), need = aislePx
    if (r.type === 'rack_shelving') {
      // its pick side: the side NOT backed by a wall or a rack within 2' (as a single selective's face); (rack-round3, PP
      // 2026-11-25 — was: not checked) open on both sides, both are checked; backed on both, its front (bottom) is short
      need = walkPx
      const backed = (s) => { const m = clearInFront(faceLine(f, normalOf(s, rot)), backPx + E, ctx); return (m.kind === 'wall' || m.kind === 'rack') && m.d <= backPx + E }
      const bt = backed('top'), bb = backed('bottom')
      sides = bt && !bb ? ['bottom'] : bb && !bt ? ['top'] : bt && bb ? ['bottom'] : ['top', 'bottom']
      if (r.backToBack) sides = ['top', 'bottom']   // (r7-shelving) two runs sharing the back: each front is its run's pick side
    }
    const nSides = sides.length
    for (const side of sides) {
      const fl = faceLine(f, normalOf(side, rot)), m = clearInFront(fl, need + E, ctx)
      if (!m.kind) continue
      const level = r.type === 'rack_shelving' ? (m.d + E < walkPx ? 1 : 3) : aisleLevel(m.d, profile, gridSize)
      if (level >= 3) continue
      const isHoriz = fl.along === 'x', gapLo = fl.dir > 0 ? fl.at : fl.at - m.d, gapHi = fl.dir > 0 ? fl.at + m.d : fl.at
      const face = isHoriz ? { x1: fl.a, y1: fl.at, x2: fl.c, y2: fl.at } : { x1: fl.at, y1: fl.a, x2: fl.at, y2: fl.c }
      const box = isHoriz ? { x: fl.a, y: gapLo, w: fl.c - fl.a, h: m.d } : { x: gapLo, y: fl.a, w: m.d, h: fl.c - fl.a }
      out.push({ rack: r, rackId: r.id, side, nSides, word: FACE_WORD[r.type]?.[side] || null, width: m.d, level, kind: m.kind, face, box,
        isHoriz, gapLo, gapHi, labelMid: (gapLo + gapHi) / 2, positions: [(fl.a + fl.c) / 2], text: fmtLenDown(m.d, gridSize), runLo: fl.a, runLen: fl.c - fl.a })
    }
  }
  return out
}

/** The red on each short face: a line along it (world px wide `sw`) — the same red as every problem mark. */
export function laneFaceOps(gaps, sw = 3) {
  return gaps.map(g => ({ op: 'line', name: 'lane-face-short', points: [g.face.x1, g.face.y1, g.face.x2, g.face.y2], stroke: '#C0392B', strokeWidth: sw }))
}
