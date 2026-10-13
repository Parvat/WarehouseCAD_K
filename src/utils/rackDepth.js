// rackDepth.js — a beam rack's frame depth changed (the elevation editor's Depth field; the Row group's replay of it).
//
// The depth is the rack's own (rack.depthIn): a single row's box is one depth across, a back-to-back pair's two depths
// and the flue. Changing it re-sizes the box across the run about its centre line, so a pair keeps its flue where it
// was and the aisles on both sides give or take the same; the aisles are re-paired after the edit (aisleKeeper), the
// counts follow. Pure.

const BEAM = new Set(['rack_row', 'rack_double_row'])

/** The update that gives beam rack `r` frame depth `depthIn` (inches) — { depthIn, height, y } (the box re-sized across
 *  about its centre; a turned rack turns about its centre too, so the same y shift holds) — or null when it is not a
 *  beam rack, the depth isn't a length, or nothing changes. */
export function rackDepthUpdate(r, depthIn, gridSize = 40) {
  if (!r || !BEAM.has(r.type) || !(depthIn > 0)) return null
  const d = Math.round(depthIn * 1000) / 1000
  if ((r.depthIn ?? 42) === d) return null
  const acrossIn = r.type === 'rack_double_row' ? 2 * d + (r.flueSpaceIn ?? 9) : d
  const height = (acrossIn / 12) * gridSize
  return { depthIn: d, height, y: r.y + (r.height - height) / 2 }
}
