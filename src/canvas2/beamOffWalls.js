// beamOffWalls.js — (lane-fixes 6, PP) a beam rack number that straddles a wall line goes just outside the wall, centred on
// the row, with the rule the other rack types' numbers use at a wall (RackLineLabels otherLabelPlaces). Pure.
import { buildingOutline, innerOutline } from '../utils/floorGeom'

/** (lane-fixes 6) Every building's straight walls: { dir 'v' | 'h', at (outer face), in (inner face), a, b (its span), out
 *  (−1 / +1: the way out across it), t (thickness) } — otherLabelPlaces' list. */
export function straightWalls(objects, gs) {
  const list = []
  for (const o of objects) {
    if (typeof o?.type !== 'string' || !o.type.startsWith('fp_')) continue
    const P = buildingOutline(o), I = innerOutline(o, gs), t = (o.wallThicknessFt || 0.25) * gs
    if (I.length !== P.length) continue
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ia = I[i]
      if (Math.abs(a.x - b.x) < 0.5) list.push({ dir: 'v', at: a.x, in: ia.x, a: Math.min(a.y, b.y), b: Math.max(a.y, b.y), out: Math.sign(a.x - ia.x), t: Math.max(t, Math.abs(a.x - ia.x)) })
      else if (Math.abs(a.y - b.y) < 0.5) list.push({ dir: 'h', at: a.y, in: ia.y, a: Math.min(a.x, b.x), b: Math.max(a.x, b.x), out: Math.sign(a.y - ia.y), t: Math.max(t, Math.abs(a.y - ia.y)) })
    }
  }
  return list
}
/** (lane-fixes 6, PP) A beam line's number that straddles a wall line (its box meets the wall's band, outer face to inner
 *  face) goes just outside that wall, centred on the row — the same offset and sliding as the other rack types' at a wall
 *  (otherLabelPlaces): max(gap, wall + 2 margins + 1) past the outer face, a half line further if that spot is taken. A
 *  number not touching a wall is exactly where it was; no clear spot outside: it stays. */
export function beamOffWalls(places, fs, avoid, objects, gs) {
  const walls = straightWalls(objects, gs)
  if (!walls.length) return places
  const h = fs * 1.25, gap = fs * 0.5, m = fs * 0.15
  const band = (wl) => (wl.dir === 'v' ? { x: Math.min(wl.at, wl.in), y: wl.a, w: Math.abs(wl.at - wl.in), h: wl.b - wl.a } : { x: wl.a, y: Math.min(wl.at, wl.in), w: wl.b - wl.a, h: Math.abs(wl.at - wl.in) })
  const touch = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6
  const out = places.slice()
  for (let i = 0; i < out.length; i++) {
    const p = out[i], wl = walls.find(w => touch(p, band(w)))
    if (!wl) continue
    const others = [...avoid, ...out.filter((_, k) => k !== i), ...walls.map(band)]
    const clear = (b) => { const g = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }; return !others.some(q => touch(q, g)) }
    // centred on the row: across the row's run (s0 … s1) for a wall across it, else on the label's own middle
    const c = (p.s0 + p.s1) / 2, half = Math.max(0, (p.s1 - p.s0) / 2)
    const sl = [0]; for (let d = h; d <= half + h / 2; d += h) sl.push(d, -d)
    const off0 = Math.max(gap, wl.t + 2 * m + 1), cands = []
    for (const off of [off0, off0 + h / 2, off0 + h]) for (const d of sl) {
      if (wl.dir === 'v') { const cy = p.vert ? p.y + p.h / 2 : c; cands.push({ x: wl.out < 0 ? wl.at - off - p.w : wl.at + off, y: cy + d - p.h / 2, w: p.w, h: p.h, align: 'right' }) }
      else { const cx = p.vert ? c : p.x + p.w / 2; cands.push({ x: cx + d - p.w / 2, y: wl.out < 0 ? wl.at - off - p.h : wl.at + off, w: p.w, h: p.h, align: 'center' }) }
    }
    const at = cands.find(clear)
    if (at) out[i] = { ...p, ...at, wall: true }
  }
  return out
}
