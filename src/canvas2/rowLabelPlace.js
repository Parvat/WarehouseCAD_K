// rowLabelPlace.js — (lane-fixes 8, pdf-parity) where every rack's number goes (R1, R2–R3, D1, S1 …), worked out once in
// drawing units: the canvas (RackLineLabels.jsx) draws these places and the PDF (export/pdfExport.js) prints the same.
// Moved out of RackLineLabels.jsx unchanged so the PDF can use it without Konva. Pure.
import { aisleLabelBoxes, aisleLabelOps, clearanceOpsAll, clearanceSolids } from '../render/labelOps'
import { runColumnCheck, layoutColumns } from '../generate/usableCapacity'
import { clearanceSource } from './clearanceSource'
import { faceAisleLabels } from '../generate/faceAisles'
import { gapShown } from './hitTest'
import { equipmentResolver } from '../utils/equipment'
import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { getColumnCheckView } from '../generate/columnCheckView'
import { textLz } from '../utils/textSizes'
import { buildingOutline, innerOutline } from '../utils/floorGeom'
import { pointInPolygon } from '../utils/sectionAreas'
import { faceWordsReach } from '../render/rackOps'
import { beamOffWalls } from './beamOffWalls'   // (lane-fixes 6)
export { beamOffWalls }
const floorUnit = (lz) => 1 / lz   // (minText.js's, without Konva)

/** The label's size in drawing units: the aisle labels' 10 at the Label size. */
export const ROW_LABEL_PX = 10
/** The labels' font size (world px) at their label scale `lz` (utils/textSizes.js 'row' — CLAUDE.md Rule 8, the CAD text
 *  model: a real text height, scaling with the drawing like geometry). */
export const rowLabelFs = (lz) => ROW_LABEL_PX / lz
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The labels to draw (world px): [{ key, text, x, y, w, h, align }] — one per line or pair, at its start, off each other
 *  and off `avoid` (boxes); `fs`: the font size (world px). */
export function rowLabelPlaces(lines, fs, avoid = [], name = (n) => 'R' + n) {
  const groups = new Map()
  // a pair up and down: its two lines one label; across: each line its own (beside its own band)
  for (const l of lines) { const k = l.ids.join(',') + (l.vert ? '' : ':' + l.ws); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l) }
  const h = fs * 1.25, gap = fs * 0.5, placed = [], out = []
  for (const [k, ls] of groups) {
    const nos = ls.map(l => l.no).sort((a, b) => a - b), l0 = ls[0]
    // its name (the BOM tab's numbering — utils/lineNames.js): R6, or per section L2
    const text = nos.length > 1 ? `${name(nos[0])}–${name(nos[nos.length - 1])}` : name(nos[0])
    const w = text.length * fs * 0.62 + fs * 0.3
    const s0 = Math.min(...ls.map(l => l.s0)), s1 = Math.max(...ls.map(l => l.s1)), c = (s0 + s1) / 2, half = (s1 - s0) / 2
    // along the line's end: the middle, then stepping either way while the label still sits beside the end
    const steps = [0]
    for (let d = h; d <= half + h / 2; d += h) steps.push(d, -d)
    let at = null
    for (const d of steps) {
      const b = l0.vert ? { x: c + d - w / 2, y: l0.r0 - gap - h, w, h } : { x: l0.r0 - gap - w, y: c + d - h / 2, w, h }
      if (!placed.some(p => meets(p, b)) && !avoid.some(p => meets(p, b))) { at = b; break }
    }
    // (labels-final, Rule 8) no room beside its end: left out until the zoom gives it room — never grouped into a range
    // (was: collapsed into R10–R13). A back-to-back pair up and down keeps its one R2–R3: it is one object.
    if (!at) continue
    placed.push(at)
    out.push({ key: k, text, nos, ...at, align: l0.vert ? 'center' : 'right', vert: l0.vert, r0: l0.r0, s0, s1 })
  }
  return out
}

/* (rack-followup 5) The numbers of the racks that are not beam racks (rackNumbersNow — a drive-in … a shelving unit),
   placed as the mockup draws them (at the start end, beside the rack) in a SECOND pass: the beam lines' labels are placed
   first, exactly as before (so nothing moves on a layout of beam racks), then these keep clear of them, of the aisle width
   labels, of the rack-to-wall / rack-to-rack face widths (FaceAisleLabels) and of every rack — sliding along their end,
   else left out (Rule 8: labels never overlap). */
function otherAvoid(objects, gs) {
  const out = []
  let profile = null
  try { profile = getColumnCheckView().profile || MHE_PROFILES.reach } catch { profile = MHE_PROFILES.reach }
  const R = equipmentResolver(objects, profile)
  const all = R.single ? faceAisleLabels(objects, gs, { profile }) : R.inUse.flatMap(p => faceAisleLabels(objects, gs, { profile: p }).filter(L => R.of(L.rackId).key === p.key))
  const lz = textLz('aisle', gs)
  for (const L of all) if (gapShown(L, objects, gs, R.of(L.rackId), false)) for (const o of aisleLabelOps(L, lz)) if (o.op === 'rect') out.push({ x: o.x, y: o.y, w: o.w, h: o.h })
  // the aisle and cross-aisle width labels whole — their arrows across the gap too, not only their pills
  out.push(...aisleLabelBoxes(objects, gs, undefined, { whole: true }))
  for (const o of objects) if (typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0) {
    const f = rackFootprint(o)
    out.push({ x: f.x, y: f.y, w: f.w, h: f.h })
    /* (rack-round3 5) its face words (ENTRY, LOAD, PICK) drawn past its top and bottom faces: a number never on them */
    const rot = ((((o.rotation || 0) % 360) + 360) % 360) / 90 | 0
    for (const side of ['top', 'bottom']) {
      const r = faceWordsReach(o, side, gs)
      if (!r) continue
      // the world side its local top / bottom faces after a turn of rot quarter-turns clockwise
      const w = (['top', 'right', 'bottom', 'left'].indexOf(side) + rot) % 4
      out.push(w === 0 ? { x: f.x, y: f.y - r, w: f.w, h: r } : w === 2 ? { x: f.x, y: f.y + f.h, w: f.w, h: r } : w === 1 ? { x: f.x + f.w, y: f.y, w: r, h: f.h } : { x: f.x - r, y: f.y, w: r, h: f.h })
    }
  }
  // the column clearances (a column in an aisle: its distance to the faces either side — ColumnClearanceLabels, the
  // warnings drawn always) and the column squares themselves
  try {
    let pbs = false
    try { pbs = !!getColumnCheckView().pickBothSides } catch { /* the default */ }
    const res = runColumnCheck(objects, { profile, gridSize: gs, pickBothSides: pbs })
    const src = res ? clearanceSource({ aisleBlocks: res.aisleBlocks, columns: layoutColumns(objects, gs), objects, preview: null, gridSize: gs, profile, pickBothSides: pbs }) : null
    if (src && src.blocks?.length && src.cols?.length) {
      const clz = 1 / floorUnit(textLz('clearance', gs))
      for (const ops of clearanceOpsAll(src.blocks, (a) => src.cols[a.columnIndex], clz, gs, false, [], { warnings: true, solids: clearanceSolids(objects, gs) })) for (const o of (Array.isArray(ops) ? ops : [ops])) {
        if (o.op === 'rect' || (o.op === 'text' && o.w > 0)) out.push({ x: o.x, y: o.y, w: o.w, h: o.h })
        // its arrow too (a line across the gap): a number never sits on it
        else if (Array.isArray(o.points) && o.points.length >= 4) { const xs = o.points.filter((_, i) => i % 2 === 0), ys = o.points.filter((_, i) => i % 2 === 1), t = (o.strokeWidth || 1) * 2; out.push({ x: Math.min(...xs) - t, y: Math.min(...ys) - t, w: Math.max(...xs) - Math.min(...xs) + 2 * t, h: Math.max(...ys) - Math.min(...ys) + 2 * t }) }
      }
    }
  } catch { /* no column check: nothing more to keep clear of */ }
  for (const c of layoutColumns(objects, gs)) out.push({ x: c.x, y: c.y, w: c.w, h: c.h })
  return out
}
/** (rack-round2 2) The walls (each side of every building as a band its wall's thickness, both faces) and the zones: a
 *  number of a rack that is not a beam rack never touches or crosses one. */
function wallsAndZones(objects, gs) {
  const out = []
  for (const o of objects) {
    if (typeof o?.type !== 'string') continue
    if (o.type.startsWith('zone_') && o.width > 0 && o.height > 0) out.push({ x: o.x, y: o.y, w: o.width, h: o.height })
    if (!o.type.startsWith('fp_')) continue
    const P = buildingOutline(o), t = (o.wallThicknessFt || 0.25) * gs
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length]
      out.push({ x: Math.min(a.x, b.x) - t, y: Math.min(a.y, b.y) - t, w: Math.abs(b.x - a.x) + 2 * t, h: Math.abs(b.y - a.y) + 2 * t })
    }
  }
  return out
}
/** (rack-round2 2) The numbers of the racks that are not beam racks: the spot a beam rack's takes first (beside the start
 *  end, centred — sliding along it), else beside the other end, else above, else below, each the beam labels' gap off
 *  the rack; a spot that touches a wall, a column, a rack, a zone or another label is not taken (a margin round each);
 *  inside the building before outside it. No spot: left out (Rule 8). */
export function otherLabelPlaces(lines, fs, avoid = [], name = (n) => 'R' + n, objects = [], gs = 40) {
  const h = fs * 1.25, gap = fs * 0.5, m = fs * 0.15, placed = [], out = []
  const blocks = [...avoid, ...wallsAndZones(objects, gs)]
  const fps = objects.filter(o => typeof o?.type === 'string' && o.type.startsWith('fp_')).map(o => buildingOutline(o).map(p => [p.x, p.y]))
  const inside = (b) => fps.some(P => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([x, y]) => pointInPolygon(P, x, y)))
  const clear = (b) => { const g = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }; return !placed.some(p => meets(p, g)) && !blocks.some(p => meets(p, g)) }
  // (rack-round3 5) every building's straight walls: its outer face `at`, its inner face `in` (innerOutline — the same
  // corner order), along x or y over [a, b]; `out`: −1 / +1, the way out of the building across it
  const near = 2 * gs, wallList = []
  for (const o of objects) {
    if (typeof o?.type !== 'string' || !o.type.startsWith('fp_')) continue
    const P = buildingOutline(o), I = innerOutline(o, gs), t = (o.wallThicknessFt || 0.25) * gs
    if (I.length !== P.length) continue
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ia = I[i]
      if (Math.abs(a.x - b.x) < 0.5) wallList.push({ dir: 'v', at: a.x, in: ia.x, a: Math.min(a.y, b.y), b: Math.max(a.y, b.y), out: Math.sign(a.x - ia.x), t: Math.max(t, Math.abs(a.x - ia.x)) })
      else if (Math.abs(a.y - b.y) < 0.5) wallList.push({ dir: 'h', at: a.y, in: ia.y, a: Math.min(a.x, b.x), b: Math.max(a.x, b.x), out: Math.sign(a.y - ia.y), t: Math.max(t, Math.abs(a.y - ia.y)) })
    }
  }
  /** The walls within 2 ft of side `sd` of the box, outward of it, over its middle. */
  const wallsNear = (sd, X0, X1, Y0, Y1) => wallList.filter(wl => {
    if (sd === 'left' || sd === 'right') {
      const sgn = sd === 'left' ? -1 : 1, x = sd === 'left' ? X0 : X1, cy = (Y0 + Y1) / 2
      return wl.dir === 'v' && wl.out === sgn && wl.a <= cy && cy <= wl.b && sgn * (wl.in - x) >= -1 && sgn * (wl.in - x) <= near
    }
    const sgn = sd === 'top' ? -1 : 1, y = sd === 'top' ? Y0 : Y1, cx = (X0 + X1) / 2
    return wl.dir === 'h' && wl.out === sgn && wl.a <= cx && cx <= wl.b && sgn * (wl.in - y) >= -1 && sgn * (wl.in - y) <= near
  })
  for (const l of lines) {
    const text = name(l.no), w = text.length * fs * 0.62 + fs * 0.3
    const c = (l.s0 + l.s1) / 2, half = (l.s1 - l.s0) / 2
    // the rack's box in world: across a run (s) and along it (r)
    const X0 = l.vert ? l.s0 : l.r0, X1 = l.vert ? l.s1 : l.r1, Y0 = l.vert ? l.r0 : l.s0, Y1 = l.vert ? l.r1 : l.s1
    const cands = []
    const steps = [0]; for (let d = h; d <= half + h / 2; d += h) steps.push(d, -d)
    /* (rack-round3 5) an end or a side within 2 ft of a building wall: the number goes OUTSIDE the building, just past that
       wall, centred on the rack (as the beam racks' at the wall) — the start end first, then the other end, then the sides */
    const order = l.vert ? ['top', 'bottom', 'left', 'right'] : ['left', 'right', 'top', 'bottom']
    const out1 = []
    for (const sd of order) for (const wl of wallsNear(sd, X0, X1, Y0, Y1)) {
      const off0 = Math.max(gap, wl.t + 2 * m + 1), cy = (Y0 + Y1) / 2, cxx = (X0 + X1) / 2
      const along = sd === 'left' || sd === 'right' ? (Y1 - Y0) / 2 : (X1 - X0) / 2, sl = [0]; for (let d = h; d <= along + h / 2; d += h) sl.push(d, -d)
      // just past the wall; a face word drawn into the wall (ENTRY on a face at the wall) in the way: a half line further
      for (const off of [off0, off0 + h / 2, off0 + h]) for (const d of sl) out1.push(sd === 'left' ? { x: wl.at - off - w, y: cy + d - h / 2, w, h, align: 'right' }
        : sd === 'right' ? { x: wl.at + off, y: cy + d - h / 2, w, h, align: 'right' }
        : sd === 'top' ? { x: cxx + d - w / 2, y: wl.at - off - h, w, h, align: 'center' }
        : { x: cxx + d - w / 2, y: wl.at + off, w, h, align: 'center' })
    }
    const atWall = out1.find(clear)
    if (atWall) {
      placed.push(atWall)
      out.push({ key: l.ids.join(',') + ':' + l.ws, text, nos: [l.no], x: atWall.x, y: atWall.y, w: atWall.w, h: atWall.h, align: atWall.align, vert: l.vert, r0: l.r0, s0: l.s0, s1: l.s1, wall: true })
      continue
    }
    // 1. the start end (as a beam rack's), sliding along it
    for (const d of steps) cands.push(l.vert ? { x: c + d - w / 2, y: l.r0 - gap - h, w, h, align: 'center' } : { x: l.r0 - gap - w, y: c + d - h / 2, w, h, align: 'right' })
    // 2. the other end
    for (const d of steps) cands.push(l.vert ? { x: c + d - w / 2, y: l.r1 + gap, w, h, align: 'center' } : { x: l.r1 + gap, y: c + d - h / 2, w, h, align: 'right' })
    // 3. above, 4. below (centred over the rack)
    const cx = (X0 + X1) / 2
    cands.push({ x: cx - w / 2, y: Y0 - gap - h, w, h, align: 'center' }, { x: cx - w / 2, y: Y1 + gap, w, h, align: 'center' })
    const ok = cands.filter(clear)
    const at = ok.find(inside) || (ok.length && !fps.some(P => pointInPolygon(P, cx, (Y0 + Y1) / 2)) ? ok[0] : null)
    if (!at) continue
    placed.push(at)
    out.push({ key: l.ids.join(',') + ':' + l.ws, text, nos: [l.no], x: at.x, y: at.y, w: at.w, h: at.h, align: at.align, vert: l.vert, r0: l.r0, s0: l.s0, s1: l.s1 })
  }
  return out
}
/** rowLabelPlaces for every rack's number: the beam lines first (as ever), then the others clear of them (otherAvoid,
 *  otherLabelPlaces). */
export function placeRowLabels(lines, fs, avoid = [], name, objects = [], gs = 40) {
  const beam = lines.filter(l => !l.other), oth = lines.filter(l => l.other)
  // (text-and-overlap) a beam line's number never on a column either (the demo's R6 sat on a wall column): it slides along
  // its end off it, as off an aisle label — no column near: exactly where it was
  const cols = objects.length ? layoutColumns(objects, gs).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h })) : []
  const p0 = rowLabelPlaces(beam, fs, cols.length ? [...avoid, ...cols] : avoid, name)
  // (lane-fixes 6) a beam number that straddles a wall goes just outside it, centred on the row (the other types' rule)
  const p1 = objects.length ? beamOffWalls(p0, fs, [...avoid, ...cols], objects, gs) : p0
  if (!oth.length) return p1
  return [...p1, ...otherLabelPlaces(oth, fs, [...avoid, ...otherAvoid(objects, gs), ...p1], name, objects, gs)]
}


/** How far the labels `places` reach past building `fp`'s outline box on each side (world px): { top, right, bottom,
 *  left } — what runs outside a wall (the column chain, the door chain) steps out past them. */
export function rowReach(fp, places) {
  const r = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!fp || !places?.length) return r
  const p = buildingOutline(fp), x0 = Math.min(...p.map(q => q.x)), x1 = Math.max(...p.map(q => q.x)), y0 = Math.min(...p.map(q => q.y)), y1 = Math.max(...p.map(q => q.y))
  for (const q of places) {
    if (q.x < x0 && q.y + q.h > y0 && q.y < y1) r.left = Math.max(r.left, x0 - q.x)
    if (q.y < y0 && q.x + q.w > x0 && q.x < x1) r.top = Math.max(r.top, y0 - q.y)
    if (q.x + q.w > x1 && q.y + q.h > y0 && q.y < y1) r.right = Math.max(r.right, q.x + q.w - x1)
    if (q.y + q.h > y1 && q.x + q.w > x0 && q.x < x1) r.bottom = Math.max(r.bottom, q.y + q.h - y1)
  }
  return r
}

