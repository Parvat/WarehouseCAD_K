// Area RGN — Regenerate racking (REGENERATE_PLAN.md; generate/regenerate.js, traceGenerate.js regenerateRacking,
// components/Generate/GeneratePanel.jsx). On a finished layout Generate asks: Regenerate racking keeps the building,
// zones, hand-placed racks, text, dimensions, layers and elevation types and refills only the generated racks (one
// Fill racking over the building, Generate's settings, the hand-placed racks and zones as obstacles), counting the
// rows and hand edits it loses; Start over is the old Generate.
globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import { rackFootprint } from '../../generate/columnCheck'
import { generateAndPlace, regenerateRacking } from '../../generate/traceGenerate'
import { regenBuilding, regenSummary, planRegenerate, isGeneratedRack, innerBox } from '../../generate/regenerate'
import { installElevationsKeeper } from '../../utils/elevations'
import { addBayUpdate } from '../../components/RightPanel/panels/RackRowPanelCore.jsx'

let store, stopKeeper
beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore; stopKeeper = installElevationsKeeper(store) })
afterAll(() => stopKeeper && stopKeeper())

const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
const objs = () => store.getState().objects
const hist = () => store.getState().historyIndex
const foot = (o) => { const f = rackFootprint(o); return { x: f.x, y: f.y, w: f.w, h: f.h } }
const hit = (a, b, e = 0.5) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > e && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > e
const BRIEF = { lengthFt: 500, widthFt: 250, gridXFt: 30, gridYFt: 30, mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, orientation: 'vertical', rackType: 'rack_double_row', palletWIn: 40, palletDIn: 48, wallClearIn: 0, levels: 4 }

/** A Generate layout of the fixture's building size, then — after generating — an office, a hand-placed rack, a text
 *  and a hand edit (a bay added to one generated rack). */
function generatedThenEdited() {
  store.setState({ objects: [], groups: [], elevations: null, selectedIds: [], activeBaySelection: [], history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  generateAndPlace(BRIEF)
  const fp = objs().find(o => o.type === 'fp_rect')
  const box = innerBox(fp, GS)
  const office = { id: 'office', type: 'zone_office', label: 'Office', x: box.x + box.w - 40 * GS, y: box.y, width: 40 * GS, height: 30 * GS, rotation: 0, parentId: fp.id, layerId: 'zones' }
  const hand = { id: 'hand', type: 'rack_row', x: box.x + 60 * GS, y: box.y + box.h / 2, width: ((3 * 4 + 96 * 3) / 12) * GS, height: (42 / 12) * GS, rotation: 0, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, levels: 4, palletWIn: 40, parentId: fp.id }
  const text = { id: 'note', type: 'text', x: box.x + 10, y: box.y + 10, text: 'Dock side', parentId: fp.id }
  store.getState().commitObjectUpdate(fp.id, {})
  store.setState({ objects: [...objs(), office, hand, text] })
  store.getState().commitObjectUpdate('office', {})
  const edited = objs().find(o => isGeneratedRack(o) && o.type === 'rack_double_row')
  store.getState().commitObjectUpdate(edited.id, addBayUpdate(edited, 96, GS))
  return { fp: objs().find(o => o.id === fp.id), office, hand, text, edited: edited.id }
}

describe('RGN — Regenerate racking', () => {
  it('RGN-record: Generate writes what it placed on its building (genPlaced, one signature per rack); the summary counts the generated rows and racks, the hand edits (a bay added), the hand-placed racks and the zones', () => {
    const L = generatedThenEdited()
    const gen = objs().filter(isGeneratedRack)
    expect(Object.keys(L.fp.genPlaced).length).toBe(gen.length)
    expect(gen.every(o => o.parentId === L.fp.id)).toBe(true)
    const s = regenSummary(objs(), L.fp)
    expect([s.racks.length, s.handEdits, s.editsKnown, s.handPlaced, s.zones]).toEqual([gen.length, 1, true, 1, 1])
    expect(s.rows).toBe(new Set(gen.map(o => o.rowIndex)).size)                         // rows across the building, not per section
    expect(s.rows).toBeLessThan(gen.length)
    expect(regenBuilding(objs()).id).toBe(L.fp.id)
    // a layout generated before the record: edits can't be counted
    const old = objs().map(o => (o.id === L.fp.id ? (({ genPlaced, ...r }) => r)(o) : o))
    expect(regenSummary(old, old.find(o => o.id === L.fp.id)).editsKnown).toBe(false)
  })

  it('RGN-keep: Regenerate keeps the building, the office, the hand-placed rack, the text, the column grid, the layers and the elevation types; replaces every generated rack (the edited one too) with one racking area\'s; nothing on the office or the hand-placed rack; ONE undo step', () => {
    const L = generatedThenEdited()
    const before = objs(), h = hist(), types = JSON.stringify(store.getState().elevations), layers = JSON.stringify(store.getState().layers)
    const oldGen = new Set(before.filter(isGeneratedRack).map(o => o.id))
    const out = regenerateRacking({ ...BRIEF, orientation: 'auto' })
    expect(out).not.toBe(null)
    expect([out.rows > 0, out.handEdits, out.handPlaced]).toEqual([true, 1, 1])
    expect(hist()).toBe(h + 1)
    const now = objs(), get = (id) => now.find(o => o.id === id)
    // kept, untouched
    for (const id of [L.fp.id, 'office', 'hand', 'note', before.find(o => o.type === 'column_grid').id]) {
      const a = before.find(o => o.id === id), b = get(id)
      expect([id, !!b]).toEqual([id, true])
      if (id !== L.fp.id) expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    }
    const fpNow = get(L.fp.id)
    expect([fpNow.x, fpNow.y, fpNow.width, fpNow.height, fpNow.genPlaced]).toEqual([L.fp.x, L.fp.y, L.fp.width, L.fp.height, undefined])
    expect(JSON.stringify(store.getState().layers)).toBe(layers)
    expect(JSON.parse(types).types.map(t => t.id).every(id => store.getState().elevations.types.some(t => t.id === id))).toBe(true)
    // replaced: no old generated rack left; the new ones the new area's, in the building
    const racks = now.filter(isRack)
    expect(racks.filter(o => oldGen.has(o.id)).length).toBe(0)
    const area = now.find(o => o.type === 'racking_area')
    expect(racks.filter(o => o.id !== 'hand').every(o => o.areaId === area.id && o.parentId === L.fp.id)).toBe(true)
    expect(racks.length).toBeGreaterThan(10)
    // the office and the hand-placed rack are obstacles
    const officeBox = { x: L.office.x, y: L.office.y, w: L.office.width, h: L.office.height }
    expect(racks.filter(o => o.id !== 'hand' && hit(foot(o), officeBox)).map(o => o.id)).toEqual([])
    expect(racks.filter(o => o.id !== 'hand' && hit(foot(o), foot(L.hand))).map(o => o.id)).toEqual([])
    // aisles only between racks that exist
    const ids = new Set(now.map(o => o.id))
    expect(now.filter(o => o.type === 'aisle').every(a => ids.has(a.row1Id) && ids.has(a.row2Id))).toBe(true)
    // one undo: exactly the layout before
    store.getState().undo()
    expect(JSON.stringify(objs())).toBe(JSON.stringify(before))
  })

  it('RGN-again: a second Regenerate counts the area\'s own hand edits (a rack removed) and keeps working; \'auto\' keeps the orientation with more positions', () => {
    generatedThenEdited()
    regenerateRacking({ ...BRIEF, orientation: 'auto' })
    const victim = objs().find(o => isRack(o) && o.areaId)
    store.getState().commitObjectUpdate(victim.id, {})
    store.setState({ objects: objs().filter(o => o.id !== victim.id) }); store.getState().commitObjectUpdate('hand', {})
    const fp = regenBuilding(objs()), s = regenSummary(objs(), fp)
    expect([s.handEdits, s.editsKnown, s.handPlaced]).toEqual([1, true, 1])
    const both = ['horizontal', 'vertical'].map(orientation => planRegenerate(objs(), fp, { ...BRIEF, beamIn: 96, orientation }, { gridSize: GS }))
    const auto = planRegenerate(objs(), fp, { ...BRIEF, beamIn: 96, orientation: 'auto' }, { gridSize: GS })
    const pos = (r) => r.objects.filter(o => isRack(o) && o.areaId === r.area.id).length
    const better = pos(both[0]) >= pos(both[1]) ? 'horizontal' : 'vertical'
    expect([auto.orientation === better || pos(both[0]) === pos(both[1]), auto.objects.filter(o => o.type === 'racking_area').length]).toEqual([true, 1])
  })

  it('RGN-fixture: the user\'s fixture (filled), a hand-placed rack added — Regenerate keeps the office, washroom, custom zone and the hand-placed rack, racks clear of all of them; the area\'s hand edits counted', () => {
    const o0 = REAL_LAYOUT.map(o => ({ ...o })), area = o0.find(o => o.type === 'racking_area')
    const filled = JSON.parse(JSON.stringify(planAreaResize(o0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS })))
    const fp = filled.find(o => o.type === 'fp_rect'), box = innerBox(fp, GS)
    // a hand-placed rack in an open spot by the wall, and one area rack edited (a bay added)
    const hand = { id: 'hand', type: 'rack_row', x: box.x + 5 * GS, y: box.y + box.h - 8 * GS, width: ((3 * 3 + 96 * 2) / 12) * GS, height: (42 / 12) * GS, rotation: 0, beams: [96, 96], uprightWidth: 3, depthIn: 42, levels: 4, palletWIn: 40, parentId: fp.id }
    const ed = filled.find(o => isRack(o) && o.areaId)
    const objects = [...filled.map(o => (o.id === ed.id ? { ...o, ...addBayUpdate(o, 96, GS) } : o)), hand]
    const s = regenSummary(objects, regenBuilding(objects))
    expect([s.handEdits >= 1, s.handPlaced, s.zones, s.areas.length]).toEqual([true, 1, 3, 1])
    const r = planRegenerate(objects, regenBuilding(objects), { orientation: 'auto', beamIn: 96, palletWIn: 40, palletDIn: 48, mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, wallClearIn: 0, levels: 4 }, { gridSize: GS })
    const zones = objects.filter(o => o.type.startsWith('zone_'))
    expect(zones.every(z => JSON.stringify(r.objects.find(o => o.id === z.id)) === JSON.stringify(z))).toBe(true)
    expect(JSON.stringify(r.objects.find(o => o.id === 'hand'))).toBe(JSON.stringify(hand))
    const racks = r.objects.filter(o => isRack(o) && o.id !== 'hand')
    expect(racks.length).toBeGreaterThan(20)
    expect(racks.filter(o => zones.some(z => hit(foot(o), { x: z.x, y: z.y, w: z.width, h: z.height })) || hit(foot(o), foot(hand))).map(o => o.id)).toEqual([])
    expect(r.objects.filter(o => o.type === 'racking_area').length).toBe(1)
  })

  it('RGN-elevations: Regenerate keeps elevation choices — each new rack side takes the elevation of the old generated bay-sides it overlaps most; elsewhere the layout default', () => {
    generatedThenEdited()
    const E = { ...store.getState().elevations }
    const B = { ...E.types[0], id: 'B', name: '6 levels · 30\'', levels: Array.from({ length: 6 }, (_, k) => ({ beamIn: k * 58, palletHeightIn: 48, loadLb: 2000 })), uprightHeightIn: 360 }
    // the western third of the generated racks carries B
    const fp = objs().find(o => o.type === 'fp_rect'), box = innerBox(fp, GS), west = box.x + box.w / 3
    const isWest = (o) => { const f = foot(o); return f.x + f.w / 2 < west }
    const T2 = { ...E, types: [...E.types, B] }
    store.setState({ elevations: T2, objects: objs().map(o => (isGeneratedRack(o) && isWest(o) ? { ...o, elevType: 'B', levels: 6 } : o)) })
    store.getState().commitObjectUpdate(fp.id, {})
    regenerateRacking({ ...BRIEF, orientation: 'vertical' })
    const now = objs().filter(o => isRack(o) && o.areaId)
    const typed = (o) => { const tb = store.getState().elevations; const v = o.elevBays?.[0]?.[0] ?? o.elevSides?.[0] ?? o.elevType ?? tb.defaultId; return v === '*' ? tb.defaultId : v }
    const westNew = now.filter(isWest), eastNew = now.filter(o => foot(o).x > west + 20 * GS)
    expect([westNew.length > 3, eastNew.length > 3]).toEqual([true, true])
    expect(westNew.filter(o => typed(o) === 'B').length / westNew.length).toBeGreaterThan(0.8)
    expect(eastNew.every(o => typed(o) !== 'B')).toBe(true)
    expect(store.getState().elevations.types.some(x => x.id === 'B')).toBe(true)
  })

  it('RGN-wire: on a layout the Generate card (C4) says what Regenerate keeps and loses — "Keeps zones, doors and columns. Replaces racking." and the hand edits lost, or that they can\'t be detected — and its primary regenerates; Start over with a new building is the layout menu\'s, behind a confirm', () => {
    const src = readFileSync(new URL('../../components/Generate/GeneratePanel.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/const onLayout = !!fp && objects\.some\(o => o\.parentId === fp\.id\)/)
    expect(src).toMatch(/const ask = useMemo\(\(\) => \(onLayout \? regenSummary\(objects, fp\) : null\), \[onLayout, objects, fp\]\)/)
    expect(src).toMatch(/if \(onLayout\) regenerate\(\)\s+else startOver\(\)/)
    expect(src).toMatch(/Keeps zones, doors and columns\. Replaces racking\./)
    expect(src).toMatch(/Hand edits to these racks can't be detected/)
    expect(src).toMatch(/hand edit\$\{ask\.handEdits === 1 \? '' : 's'\} to generated racks will be lost/)
    expect(src).toMatch(/regenerateRacking\(genBrief\(pr, mheOptions\), \{ rules, beamIn: useRackingSettings\.getState\(\)\.beamIn \?\? 96, before: /)
    expect(src).toMatch(/const outcome = await startOverLayout\(useCanvasStore, \{ rules, mheOptions, onProgress: setProgress, project: next, before: /)
    expect(/>Start over</.test(src)).toBe(false)                                                       // not in the card
    // the card never runs past the window: its fields scroll, the footer stays
    expect(src).toMatch(/flex: '0 1 auto', minHeight: 0, overflowY: 'auto'/)
    const gf = readFileSync(new URL('../../utils/genFields.js', import.meta.url), 'utf8')
    expect(gf).toMatch(/return generateAndPlaceBatched\(genBrief\(project \|\| projectOf\(store\.getState\(\)\.elevations\), mheOptions\), \{ onProgress, rules, before \}\)/)
    const menu = readFileSync(new URL('../../components/Toolbar/TopBar.jsx', import.meta.url), 'utf8')
    expect(menu).toMatch(/<MenuItem onClick=\{\(\) => setConfirmStart\(true\)\}>Start over with a new building…<\/MenuItem>/)
    expect(menu).toMatch(/role="group" aria-label="Start over with a new building"[\s\S]*>Cancel<\/button>[\s\S]*onClick=\{startOver\}[^>]*>Start over<\/button>/)
    expect(menu).toMatch(/const startOver = \(\) => \{ onClose\(\); startOverLayout\(useCanvasStore, \{ rules, mheOptions \}\) \}/)
    const tg = readFileSync(new URL('../../generate/traceGenerate.js', import.meta.url), 'utf8')
    expect((tg.match(/stampGenPlaced\(queue\)\r?\n\s*endOneStep\(kept\)/g) || []).length).toBe(2)
  })
})
