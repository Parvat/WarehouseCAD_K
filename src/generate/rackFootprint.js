// rackFootprint.js — a rack's true world footprint, on its own so the modules that measure rows (columnCheck,
// rowAisles, syncSections, aisleRebuild) can share it without importing one another. Re-exported by
// columnCheck.js, where it used to live.

/* A rack's TRUE world footprint. canvas2 rotates every object IN PLACE
 * around its own centre (shapes.jsx's spin()) — a rack's stored x/y/width/
 * height are always the PRE-rotation box (beams along local X, depth along
 * local Y, exactly as traceGenerate.js's beamRackObject builds it, angle or
 * not). For a 90°/270° rack (GENERATOR_SPEC_V10's vertical orientation —
 * the first thing that actually produces one), the real box is centred at
 * that same point with width and height swapped. Every reader of a rack's
 * geometry below needs THIS, not the stored fields raw, or a vertical
 * layout's columns/aisles get tested against the wrong rectangle entirely. */
export function rackFootprint(r) {
  const rot = ((r.rotation || 0) % 180 + 180) % 180
  if (rot === 90) {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    return { x: cx - r.height / 2, y: cy - r.width / 2, w: r.height, h: r.width, rotated: true }
  }
  return { x: r.x, y: r.y, w: r.width, h: r.height, rotated: false }
}
