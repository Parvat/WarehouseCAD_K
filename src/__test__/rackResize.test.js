import { describe, it, expect } from 'vitest'
import { bayCountForWidth, resizeRackToWidth, uprightXs } from '../render/rackOps'

const GS = 40
const widthFor = (bays, upIn = 3, beamIn = 96) =>
  ((upIn * (bays + 1) + beamIn * bays) / 12) * GS

const rack = {
  type: 'rack_row', x: 0, y: 0, height: 140,
  beams: [96, 96, 96, 96], uprightWidth: 3, width: widthFor(4),
}

describe('rackOps — resize means bays, not scale', () => {
  it('round-trips: the width of N bays maps back to N bays', () => {
    for (let n = 1; n <= 30; n++) {
      expect(bayCountForWidth(rack, widthFor(n), GS), `${n} bays`).toBe(n)
    }
  })

  it('rounds to the NEAREST bay, so a rack does not resist the pointer', () => {
    const four = widthFor(4), five = widthFor(5)
    const justOver = four + (five - four) * 0.55
    const justUnder = four + (five - four) * 0.45
    expect(bayCountForWidth(rack, justOver, GS)).toBe(5)
    expect(bayCountForWidth(rack, justUnder, GS)).toBe(4)
  })

  it('never collapses a rack below one bay', () => {
    expect(bayCountForWidth(rack, 1, GS)).toBe(1)
    expect(bayCountForWidth(rack, widthFor(1) * 0.1, GS)).toBe(1)
  })

  it('refuses types that have no bays, so they fall back to a plain resize', () => {
    for (const t of ['rack_drive_in', 'rack_cantilever', 'rack_mezzanine', 'rack_shelving']) {
      expect(bayCountForWidth({ ...rack, type: t }, widthFor(6), GS)).toBeNull()
      expect(resizeRackToWidth({ ...rack, type: t }, widthFor(6), GS)).toBeNull()
    }
  })

  it('refuses a degenerate width rather than producing NaN bays', () => {
    expect(bayCountForWidth(rack, 0, GS)).toBeNull()
    expect(bayCountForWidth(rack, -50, GS)).toBeNull()
  })

  it('honours a non-default beam and upright size', () => {
    const wide = { ...rack, beams: [144, 144], uprightWidth: 4 }
    const w = ((4 * 3 + 144 * 2) / 12) * GS
    expect(bayCountForWidth(wide, w, GS)).toBe(2)
  })
})

describe('rackOps — the resize patch keeps width and bays in agreement', () => {
  it('recomputes width from the bay list, not from the dragged value', () => {
    const p = resizeRackToWidth(rack, widthFor(7) + 37, GS)   // a sloppy drag
    expect(p.beams).toHaveLength(7)
    expect(p.width).toBeCloseTo(widthFor(7), 6)               // snapped, not 37 over
  })

  it('grows by repeating the existing beam size', () => {
    const p = resizeRackToWidth(rack, widthFor(6), GS)
    expect(p.beams).toEqual([96, 96, 96, 96, 96, 96])
  })

  it('shrinking keeps the bays that remain, in order', () => {
    const mixed = { ...rack, beams: [72, 96, 120, 144], width: 0 }
    const p = resizeRackToWidth(mixed, widthFor(2, 3, 72), GS)
    expect(p.beams).toEqual([72, 96])
  })

  it('the patched rack measures exactly what uprightXs lays out', () => {
    const p = resizeRackToWidth(rack, widthFor(9), GS)
    const patched = { ...rack, ...p }
    const { xs, upW } = uprightXs(patched, GS)
    expect(xs[xs.length - 1] + upW).toBeCloseTo(patched.x + patched.width, 6)
  })

  it('is stable — resizing to its own width changes nothing', () => {
    const p = resizeRackToWidth(rack, rack.width, GS)
    expect(p.beams).toEqual(rack.beams)
    expect(p.width).toBeCloseTo(rack.width, 6)
  })
})
