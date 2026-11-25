// laneBom.js — (r3-drive-in, r4-push-back, r5-pallet-flow) the BOM of the lane racks: one section per type (Drive-in,
// Drive-through, Push-back, Pallet flow), each under its own letter lines (D1, T1, P1, F1 …). The beam racks' BOM
// (utils/bom.js computeBom: its lines, sections and rows) is not touched. Pure.
//
// THE FORMULAS (per rack; L lanes, D deep, V levels, P = L + 1 post lines; sizes in inches, the depth station S):
//   Drive-in / drive-through
//     Upright (frame)   P × (D + 1)           a post at each station boundary on each post line;  size: overall height
//     Rail arm          2 × L × (D + 1) × V    one per rail per post per level (2 rails a lane)
//     Rail              2 × L × V              length D × S
//     Top tie           L × (D + 1)            across each lane at every post, at the top;          size: lane width
//     Back tie          L × V                  drive-in only: across each lane at the back, a level each; size: lane width
//     Floor guide       2 × L                  when Floor guides is on;                              length D × S
//   Push-back (frame lines F = 2 up to 3 deep, 3 from 4 deep)
//     Upright frame     P × F                  size: overall height × D × S
//     Beam              2 × L × V              front and rear, a level each;                          size: lane width
//     Rail set          L × V
//     Cart              (D − 1) × L × V        the front pallet sits on the rails
//     Entry guide       2 × L                  at the LOAD · PICK face, floor level
//   Pallet flow (frame lines F = ceil(D / 2) + 1)
//     Upright frame     P × F                  size: overall height × D × S
//     Beam              L × V × F              one at each frame line under each lane, a level each;  size: lane width
//     Roller track      2 × L × V              length D × S
//     Speed controller  2 × L × V × ceil(D / 2)  a brake every two pallets on each track
//     Pallet stop       L × V                  at the PICK end
//     Entry guide       2 × L × V              at the LOAD end
import { laneSpec, LANE_NAMES } from './laneEngine'
import { rackNumbersNow } from '../utils/rackLines'
import { lineNamer } from '../utils/lineNames'
import { laneLevels } from '../utils/capacity'
import { levelsResolver } from '../utils/elevations'

const isOn = (o, types) => !!o && types.has(o.type) && o.width > 0 && o.height > 0
const inch = (v) => `${Math.round(v * 100) / 100} in`
const ftIn = (v) => { const t = Math.round(v), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f} ft ${i} in` : `${f} ft` }

/** One rack's parts: [{ part, size, qty }] (the formulas above). `levels`: its levels as counted (capacity's). */
export function laneParts(o, levels, gridSize = 40) {
  const s = laneSpec(o, gridSize), L = s.lanes, D = s.deep, V = Math.max(1, levels), P = L + 1
  const run = D * s.stationIn, lane = inch(s.laneWIn), h = ftIn(s.heightIn)
  if (o.type === 'rack_drive_in' || o.type === 'rack_drive_through') {
    return [
      { part: 'Upright', size: h, qty: P * (D + 1) },
      { part: 'Rail arm', size: '', qty: 2 * L * (D + 1) * V },
      { part: 'Rail', size: ftIn(run), qty: 2 * L * V },
      { part: 'Top tie', size: lane, qty: L * (D + 1) },
      ...(o.type === 'rack_drive_in' ? [{ part: 'Back tie', size: lane, qty: L * V }] : []),
      ...(s.floorGuides ? [{ part: 'Floor guide', size: ftIn(run), qty: 2 * L }] : []),
    ]
  }
  if (o.type === 'rack_pushback') {
    const F = D <= 3 ? 2 : 3
    return [
      { part: 'Upright frame', size: `${h} × ${ftIn(run)}`, qty: P * F },
      { part: 'Beam', size: lane, qty: 2 * L * V },
      { part: 'Rail set', size: `${D} deep`, qty: L * V },
      { part: 'Cart', size: '', qty: (D - 1) * L * V },
      { part: 'Entry guide', size: '', qty: 2 * L },
    ]
  }
  if (o.type === 'rack_pallet_flow') {
    const F = Math.ceil(D / 2) + 1
    return [
      { part: 'Upright frame', size: `${h} × ${ftIn(run)}`, qty: P * F },
      { part: 'Beam', size: lane, qty: L * V * F },
      { part: 'Roller track', size: ftIn(run), qty: 2 * L * V },
      { part: 'Speed controller', size: '', qty: 2 * L * V * Math.ceil(D / 2) },
      { part: 'Pallet stop', size: '', qty: L * V },
      { part: 'Entry guide', size: '', qty: 2 * L * V },
    ]
  }
  return []
}

/** The lane racks' BOM sections, the types in `types` (a Set), in the order drive-in, drive-through, push-back, pallet
 *  flow: [{ id (the type), name ('Drive-in racking'), letter, rows: [{ tag ('D1'), id }], lines: [{ key, part, size,
 *  qty, ids, rows: { [tag]: qty } }] }] — a type with no rack: none. */
export function laneBom(objects, T, { gridSize = 40, types } = {}) {
  const list = (objects || []).filter(o => isOn(o, types))
  if (!list.length) return []
  const nums = rackNumbersNow(objects, gridSize), name = (() => { try { return lineNamer(objects, T, gridSize) } catch { return null } })()
  const tagOf = new Map()
  for (const l of nums) if (l.other) tagOf.set(l.ids[0], (name && name(l.no)) || l.tag)
  const levelsAt = levelsResolver(T)
  const out = []
  for (const type of ['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow']) {
    if (!types.has(type)) continue
    const racks = list.filter(o => o.type === type).map(o => ({ o, tag: tagOf.get(o.id) || '' }))
      .sort((a, b) => (a.tag.length - b.tag.length) || a.tag.localeCompare(b.tag))
    if (!racks.length) continue
    const m = new Map()
    for (const { o, tag } of racks) for (const p of laneParts(o, laneLevels(o, levelsAt), gridSize)) {
      if (!(p.qty > 0)) continue
      const key = p.part + '|' + p.size
      if (!m.has(key)) m.set(key, { key, part: p.part, size: p.size, qty: 0, ids: [], rows: {}, at: m.size })
      const l = m.get(key)
      l.qty += p.qty; if (!l.ids.includes(o.id)) l.ids.push(o.id); l.rows[tag] = (l.rows[tag] || 0) + p.qty
    }
    out.push({ id: type, name: LANE_NAMES[type] + ' racking', rows: racks.map(r => ({ tag: r.tag, id: r.o.id })), lines: [...m.values()].sort((a, b) => a.at - b.at).map(({ at, ...l }) => l) })
  }
  return out
}
