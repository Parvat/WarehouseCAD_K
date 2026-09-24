// columnMarker.js — where an ENLARGED column marker is drawn.
//
// At overview zoom a 12" column is a few screen px, so ColumnGridShape grows
// its marker to a 6 px floor (BUG 66). Grown around the column's centre, a
// column sitting in a double row's face flush against the flue spills the
// marker across the 9" gap onto the other face, and reads as a column "on the
// joint" when the geometry says it is wholly in one face. This keeps the grown
// marker inside the face (rack band) the column actually sits in, growing away
// from the flue. Drawing only: layout, checks and capacity never read it.

import { localRectToWorld } from '../generate/columnCheck'

const BAND_TYPES = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6

/** Every rack band (a single row's body, each face of a double row) as a
 *  WORLD rect, tagged with its depth axis and which side the flue is on. */
export function rackBandsWorld(racks = [], gridSize = 40) {
  const out = []
  for (const r of racks) {
    if (!BAND_TYPES.has(r.type) || ((r.rotation || 0) % 90) !== 0) continue
    const rotated = ((((r.rotation || 0) % 180) + 180) % 180) === 90
    let bands = [{ y: r.y, h: r.height }]
    if (r.type === 'rack_double_row') {
      const flueH = ((r.flueSpaceIn || 9) / 12) * gridSize
      const rowH = Math.max(0, (r.height - flueH) / 2)
      if (rowH > 0) bands = [{ y: r.y, h: rowH }, { y: r.y + rowH + flueH, h: rowH }]
    }
    const centre = rotated ? r.x + r.width / 2 : r.y + r.height / 2   // world centre along depth (spin is about the centre)
    for (const b of bands) {
      const w = localRectToWorld(r, { x: r.x, y: b.y, w: r.width, h: b.h })
      const lo = rotated ? w.x : w.y, hi = rotated ? w.x + w.w : w.y + w.h
      out.push({
        rect: w, depthAxis: rotated ? 'x' : 'y', lo, hi,
        // a double row's flue is on the side facing the rack's centre
        flueSide: bands.length === 2 ? ((lo + hi) / 2 < centre ? 'hi' : 'lo') : null,
      })
    }
  }
  return out
}

/** The rect to draw for column `col` ({x,y,w,h}, world px) at `zoom`, with a
 *  `minPx` screen floor. Unchanged when the column is already big enough on
 *  screen or sits in no rack band. Inside a band: kept within it along the
 *  depth axis; if the floor is deeper than the band itself, anchored at the
 *  band's flue edge and grown outward, so it never crosses the flue. */
export function columnMarkerRect(col, bands, zoom, minPx) {
  const size = minPx / (zoom || 1)
  const w = Math.max(col.w, size), h = Math.max(col.h, size)
  const g = { x: col.x + col.w / 2 - w / 2, y: col.y + col.h / 2 - h / 2, width: w, height: h }
  if (w === col.w && h === col.h) return g
  const band = bands.find(b => {
    const r = b.rect
    return col.x >= r.x - EPS && col.x + col.w <= r.x + r.w + EPS && col.y >= r.y - EPS && col.y + col.h <= r.y + r.h + EPS
  })
  if (!band) return g
  const key = band.depthAxis, len = key === 'x' ? 'width' : 'height'
  const gLen = g[len]
  if (gLen <= band.hi - band.lo + EPS) {
    g[key] = Math.min(Math.max(g[key], band.lo), band.hi - gLen)
  } else if (band.flueSide === 'hi') {
    g[key] = band.hi - gLen            // flush to the flue edge, growing away from it
  } else if (band.flueSide === 'lo') {
    g[key] = band.lo
  }
  return g
}
