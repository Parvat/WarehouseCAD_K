// Area RT — the rack type registry (R1, docs/EPICS.md; utils/rackTypes.js): one place says what each rack type is.
// Its names are exactly the tables it replaced (R1 changes no text), and no file keeps its own list of the beam racks.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RACK_TYPES, BEAM_TYPES, LANE_TYPES, namesFor, flowOf, isBeamType, isLaneType } from '../../utils/rackTypes'

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const files = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!/__test__|_svg_reference/.test(p)) files(p, out) } else if (/\.(js|jsx)$/.test(n)) out.push(p) } return out }

describe('RT — the rack type registry', () => {
  it('RT-families: the beam racks are the selective single and pair; the lane racks the four deep-lane types with their flow', () => {
    expect([...BEAM_TYPES]).toEqual(['rack_row', 'rack_double_row'])
    expect([...LANE_TYPES]).toEqual(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])
    expect([...LANE_TYPES].map(flowOf)).toEqual(['LIFO', 'FIFO', 'LIFO', 'FIFO'])
    expect([isBeamType('rack_row'), isBeamType('rack_drive_in'), isLaneType('rack_pushback'), isLaneType('rack_cantilever')]).toEqual([true, false, true, false])
    // every library rack type has an entry
    const lib = readFileSync(join(SRC, 'constants/warehouseObjects.js'), 'utf8')
    const libTypes = [...new Set([...lib.matchAll(/type: '(rack_\w+)'/g)].map(m => m[1]))]
    expect(libTypes.filter(t => !RACK_TYPES[t])).toEqual([])
  })

  it('RT-names: each place’s names exactly as before the registry', () => {
    expect(namesFor('card')).toEqual({ rack_row: 'Selective', rack_double_row: 'Back-to-back', rack_drive_in: 'Drive-in', rack_drive_through: 'Drive-through', rack_pushback: 'Pushback', rack_pallet_flow: 'Pallet flow', rack_cantilever: 'Cantilever' })
    expect(namesFor('check')).toEqual({ rack_row: 'Single row', rack_double_row: 'Double row', rack_cantilever: 'Cantilever rack', rack_drive_in: 'Drive-in rack', rack_drive_through: 'Drive-through rack', rack_pushback: 'Pushback rack', rack_pallet_flow: 'Pallet flow rack', rack_mezzanine: 'Mezzanine', rack_shelving: 'Shelving unit' })
    expect(namesFor('generate')).toEqual({ rack_row: 'Rack Row', rack_double_row: 'Double Row', rack_drive_in: 'Drive-In Rack', rack_drive_through: 'Drive-Through Rack', rack_pushback: 'Push-Back Rack', rack_pallet_flow: 'Pallet-Flow Rack' })
  })

  it('RT-one-place: no file outside the registry keeps its own list of the beam racks (protected files excepted)', () => {
    const PROTECTED = /store[\\/]useCanvasStore|utils[\\/]canvas\.js|warehouseSnap|geometricSnap|components[\\/]Canvas[\\/]|constants[\\/]/
    const copies = files(SRC).filter(f => !PROTECTED.test(f) && !/rackTypes\.js$/.test(f)).filter(f => /new Set\(\[\s*'rack_row',\s*'rack_double_row'\s*\]\)/.test(readFileSync(f, 'utf8')))
    expect(copies).toEqual([])
  })
})
