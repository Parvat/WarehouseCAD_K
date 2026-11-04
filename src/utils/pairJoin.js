// pairJoin.js — a layout saved before a back-to-back pair stayed one object (utils/bayEmpty.js) is joined back on
// load (utils/saveLoad.js deserializeScene): the pieces a one-side delete (or the old face rule) cut a pair into — a
// pair piece and the single(s) carried on from it, sharing an upright — become ONE pair again, the singles' bays
// empty on the side they had lost. Pieces join only when they are pieces of one rack (the same root: `pieceOf`),
// turned the same, line up on the same row and side, and share their end upright (no gap along the run). A single
// whose lost half would now stand on a zone, past the walls or on another rack stays as it is (a zone cut it, and the
// pair can't stand there). A single row cut at a middle bay — a gap — never joins. Pure.

import { innerOutline, boxOnFloor } from './floorGeom'
import { rackFootprint } from '../generate/columnCheck'
import { effectiveRef, DEFAULT_REF } from './elevations'
import { isEmptySide, normEmpty } from './bayEmpty'

const TOL = 1
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
const rootOf = (o) => o.pieceOf || o.id
const isBeam = (o) => !!o && (o.type === 'rack_row' || o.type === 'rack_double_row') && Array.isArray(o.beams) && o.beams.length > 0
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > TOL && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOL

/** World ↔ pair `P`'s own unrotated frame, about its centre. */
function frame(P) {
  const t = (norm(P.rotation) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = P.x + P.width / 2, cy = P.y + P.height / 2
  return {
    toLocal: (x, y) => ({ x: cx + (x - cx) * c + (y - cy) * s, y: cy - (x - cx) * s + (y - cy) * c }),
    toWorld: (x, y) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c }),
  }
}
const worldBox = (F, x0, y0, x1, y1) => {
  const p = [F.toWorld(x0, y0), F.toWorld(x1, y0), F.toWorld(x1, y1), F.toWorld(x0, y1)]
  const xs = p.map(q => q.x), ys = p.map(q => q.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** `objects` with every split pair joined back → { objects, joined: Map(removed id → the pair's id) }. */
export function joinSplitPairs(objects, gridSize = 40) {
  const list = Array.isArray(objects) ? objects : []
  const byRoot = new Map()
  for (const o of list) if (isBeam(o)) { const r = rootOf(o); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(o) }
  const joined = new Map(), replace = new Map()
  const zones = list.filter(o => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0).map(z => ({ x: z.x, y: z.y, w: z.width, h: z.height }))
  const fps = new Map(list.filter(o => typeof o?.type === 'string' && o.type.startsWith('fp_')).map(f => [f.id, f]))
  for (const [root, pieces] of byRoot) {
    if (pieces.length < 2 || !pieces.some(p => p.type === 'rack_double_row') || !pieces.some(p => p.type === 'rack_row')) continue
    const P = pieces.find(p => p.type === 'rack_double_row' && p.id === root) || pieces.find(p => p.type === 'rack_double_row')
    const F = frame(P), upW = ((P.uprightWidth || 3) / 12) * gridSize
    const flue = ((P.flueSpaceIn ?? 9) / 12) * gridSize, rowH = (P.height - flue) / 2
    if (!(rowH > 0)) continue
    const bands = [P.y, P.y + P.height - rowH]
    // each piece in P's frame: its run span and which band (a single) or both (a pair) it stands on
    const local = (o) => {
      if (norm(o.rotation) !== norm(P.rotation) || (o.depthIn ?? 42) !== (P.depthIn ?? 42) || (o.uprightWidth || 3) !== (P.uprightWidth || 3) || (o.parentId ?? null) !== (P.parentId ?? null)) return null
      const c = F.toLocal(o.x + o.width / 2, o.y + o.height / 2), x0 = c.x - o.width / 2, y0 = c.y - o.height / 2
      if (o.type === 'rack_double_row') return Math.abs(y0 - P.y) < TOL && Math.abs(o.height - P.height) < TOL && Math.abs((o.flueSpaceIn ?? 9) - (P.flueSpaceIn ?? 9)) < 0.01 ? { o, x0, x1: x0 + o.width, side: null } : null
      const side = bands.findIndex(b => Math.abs(y0 - b) < TOL)
      return side >= 0 && Math.abs(o.height - rowH) < TOL ? { o, x0, x1: x0 + o.width, side } : null
    }
    let chain = [local(P)]
    if (!chain[0]) continue
    const rest = pieces.filter(p => p !== P).map(local).filter(Boolean)
    const others = list.filter(o => o && typeof o.type === 'string' && o.type.startsWith('rack_') && rootOf(o) !== root).map(rackFootprint)
    const fp = fps.get(P.parentId), floor = fp ? innerOutline(fp, gridSize) : null
    const area = list.find(o => o && o.type === 'racking_area' && o.id === P.areaId)
    const aislePx = (area?.settings?.aisleFt ?? 10.5) * gridSize
    // a single's lost half, where the pair would now stand: on the floor, off every zone and every other rack
    const room = (q) => {
      if (q.side == null) return true
      const y0 = bands[1 - q.side], b = worldBox(F, q.x0 + upW, y0, q.x1 - upW, y0 + rowH)
      if (floor && !boxOnFloor(floor, { x: b.x + TOL, y: b.y + TOL, w: Math.max(0, b.w - 2 * TOL), h: Math.max(0, b.h - 2 * TOL) })) return false
      if (zones.some(z => overlaps(z, b)) || others.some(f => overlaps({ x: f.x, y: f.y, w: f.w, h: f.h }, b))) return false
      /* and that half had its aisle: a half with no aisle in front of it (a wall, a zone) is one the generator cuts
         off on purpose (generate/faceReach.js) — the single it leaves is picked from behind, and stays a single */
      const fy0 = q.side === 1 ? P.y - aislePx : P.y + P.height, front = worldBox(F, q.x0 + upW, fy0, q.x1 - upW, fy0 + aislePx)
      if (floor && !boxOnFloor(floor, { x: front.x + TOL, y: front.y + TOL, w: Math.max(0, front.w - 2 * TOL), h: Math.max(0, front.h - 2 * TOL) })) return false
      return !zones.some(z => overlaps(z, front))
    }
    for (let grew = true; grew;) {
      grew = false
      const lo = chain[0].x0, hi = chain[chain.length - 1].x1
      for (const q of rest) {
        if (chain.includes(q) || !room(q)) continue
        if (Math.abs(q.x0 - (hi - upW)) < TOL) { chain.push(q); grew = true; break }
        if (Math.abs(q.x1 - (lo + upW)) < TOL) { chain.unshift(q); grew = true; break }
      }
    }
    if (chain.length < 2) continue
    // the pair: every piece's bays in run order; a single's bays empty on the side it had lost
    const beams = [], refs = [[], []], empty = [[], []]
    for (const q of chain) q.o.beams.forEach((len, k) => {
      beams.push(len)
      for (const s of [0, 1]) {
        if (q.side == null) { refs[s].push(effectiveRef(q.o, k, s)); empty[s].push(isEmptySide(q.o, k, s)) }
        else if (s === q.side) { refs[s].push(effectiveRef(q.o, k, 0)); empty[s].push(false) }
        else { refs[s].push(DEFAULT_REF); empty[s].push(true) }
      }
    })
    const x0 = chain[0].x0, x1 = chain[chain.length - 1].x1, w = x1 - x0
    const c = F.toWorld((x0 + x1) / 2, P.y + P.height / 2)
    const base = chain.find(q => q.o.id === root)?.o || P
    const merged = { ...P, id: base.id, beams, width: w, x: c.x - w / 2, y: c.y - P.height / 2, elevBays: refs, bayEmpty: empty, activeBayIdx: null, activeBaySide: null }
    delete merged.elevSides
    if (P.elevType == null) delete merged.elevType
    if (merged.id === root) delete merged.pieceOf
    else merged.pieceOf = root
    replace.set(base.id, normEmpty(merged))
    for (const q of chain) if (q.o.id !== base.id) joined.set(q.o.id, base.id)
  }
  if (!joined.size && !replace.size) return { objects: list, joined }
  const out = []
  for (const o of list) {
    if (o && joined.has(o.id)) continue
    out.push(o && replace.has(o.id) ? replace.get(o.id) : o)
  }
  return { objects: out, joined }
}
