// REG — the hand check on studio-bars (one regression test per bug; each fails on the commit that broke it — or that
// first had the behaviour — and passes after the fix):
//   1 a building is picked by its wall: a wall a rack stands 3″ off (the rack's pick padding reaching over it), and an
//     older layout whose Building layer an older Generate locked (a hand lock stays)        — 9707f63
//   2 Delete on a building removes the building only (racks, zones, columns stay), one undo step, a notice with Undo
//   3 a selected building's dimension labels: the selection bar keeps clear of them         — 2bd21c2
//   4 the first click on a rack selects the row, no bay; a second on the same row: its bay  — 8717c60
//   5 a click in a pair's flue: the pair, no bays                                           — e728492
//   6 the Row group tool from the pill (or G) starts empty; only the selection bar's Row group starts from the selection
//   7 the right-click menus: a section-9 icon on the left (an empty slot where none), the shortcut on the right
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
if (!globalThis.document.querySelector) globalThis.document.querySelector = () => null
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const FP = /^fp_/

async function layout(orientation) {
  vi.resetModules()
  const { useCanvasStore: store } = await import('../../store/useCanvasStore')
  const gen = await import('../../generate/traceGenerate'), E = await import('../../utils/elevations')
  const stop = E.installElevationsKeeper(store)
  store.setState({ objects: [], groups: [], elevations: null, selectedIds: [], activeBaySelection: [], activeWall: null, activeTool: 'select', zoom: 0.09, panX: 720, panY: 450, history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
  stop()
  return store
}

describe.each(['horizontal', 'vertical'])('REG — the hand check, %s', (orientation) => {
  let store
  beforeEach(async () => { store = await layout(orientation) })

  it('REG-wall-pick: a press on a wall that a rack beside it reaches only by its pick padding picks the building — the press inside the rack still picks the rack; an older layout\'s Generate-locked Building layer is released on load, a hand lock is kept', async () => {
    const H = await import('../../canvas2/hitTest')
    const st = store.getState(), fp = st.objects.find(o => FP.test(o.type)), gs = st.gridSize || 40, zoom = 0.09
    // the wall rack: a rack whose box comes within 6″ of a wall
    const racks = st.objects.filter(o => /^rack_/.test(o.type))
    let found = null
    for (const r of racks) {
      const b = H.worldBoundsOf(r, st.objects)
      for (const [wx, wy] of [[fp.x, b.y + b.height / 2], [fp.x + fp.width, b.y + b.height / 2], [b.x + b.width / 2, fp.y], [b.x + b.width / 2, fp.y + fp.height]]) {
        if (H.hitTest(st.objects, st.layers, wx, wy, zoom, gs) === r.id && !(wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height)) { found = { r, wx, wy, b }; break }
      }
      if (found) break
    }
    expect(found).toBeTruthy()                                                         // the padding reaches the wall
    expect(H.wallBeatsPadding(st.objects, st.layers, found.wx, found.wy, zoom, gs, found.r)?.objId).toBe(fp.id)
    const inside = { x: found.b.x + found.b.width / 2, y: found.b.y + found.b.height / 2 }
    expect(H.wallBeatsPadding(st.objects, st.layers, inside.x, inside.y, zoom, gs, found.r)).toBe(null)
    expect(read('canvas2/useCanvasInteraction.js')).toMatch(/const padWall = evt\.button === 0 \? wallBeatsPadding\(st\.objects, st\.layers, world\.x, world\.y, view\.current\.zoom, st\.gridSize, hitObj\) : null/)
    // an older layout: the Building layer an older Generate locked — released on load; a hand lock (setLayer) stays
    const SL = await import('../../utils/saveLoad'), L = await import('../../utils/layers')
    const old = JSON.parse(SL.serializeScene(store.getState()))
    old.layers = old.layers.map(l => (l.id === 'building' ? { ...l, locked: true } : l))
    const s1 = {}; SL.deserializeScene(old, s1)
    expect(s1.layers.find(l => l.id === 'building').locked).toBe(false)
    L.setLayer(store, 'building', { locked: true })
    expect(store.getState().layers.find(l => l.id === 'building')).toMatchObject({ locked: true, lockedByHand: true })
    const s2 = {}; SL.deserializeScene(JSON.parse(SL.serializeScene(store.getState())), s2)
    expect(s2.layers.find(l => l.id === 'building').locked).toBe(true)
  })

  it('REG-delete-building: Delete on a building removes the building only — racks, zones and columns stay (loosed from it) — one undo step, a notice with Undo', async () => {
    const D = await import('../../utils/deleteSelection'), N = await import('../../utils/notice')
    const st = store.getState(), fp = st.objects.find(o => FP.test(o.type))
    const kept = (s) => s.objects.filter(o => /^rack_|^zone_|column_grid|^aisle$|racking_area/.test(o.type)).length
    const n0 = kept(st), h0 = st.historyIndex
    store.setState({ selectedIds: [fp.id] })
    D.deleteSelectionWithAreas(store)
    const after = store.getState()
    expect([after.objects.some(o => o.id === fp.id), kept(after), after.historyIndex - h0, after.objects.some(o => o.parentId === fp.id), after.selectedIds]).toEqual([false, n0, 1, false, []])
    expect(N.useNotice.getState()).toMatchObject({ text: 'Building deleted', hint: 'racks, zones and columns kept', undo: true })
    store.getState().undo()
    expect([store.getState().objects.some(o => o.id === fp.id), kept(store.getState())]).toEqual([true, n0])
    // the notice offers Undo
    expect(read('canvas2/RowGroupBar.jsx')).toMatch(/<NoticePill label="Notice" onUndo=\{notice\.undo \? undo\(clearNotice\) : null\}/)
    N.clearNotice()
  })

  it('REG-building-labels: a selected building\'s dimension labels are never under the selection bar — the bar keeps clear of them (they stand 22 out from every wall at the label size)', async () => {
    const SB = await import('../../studio/SelectionBar'), LS = await import('../../render/labelSize')
    const st = store.getState(), fp = st.objects.find(o => FP.test(o.type)), lz = LS.labelScale(LS.DEFAULT_LABEL_SIZE, st.gridSize || 40)
    const view = { zoom: 0.5, panX: 700 - (fp.x + fp.width / 2) * 0.5, panY: 500 - fp.y * 0.5 }   // the building's top wall at y 500
    const plain = SB.screenBox([fp], st.objects, view), withLabels = SB.screenBox([fp], st.objects, view, lz)
    const labelTop = plain.y0 - (22 + 11 * 0.75) / lz * view.zoom                    // the top label's upper edge
    expect(withLabels.y0).toBeLessThanOrEqual(labelTop)
    const at = SB.placeBar(withLabels, 300, 42, { w: 1440, h: 2000 })
    expect(at.top + 42).toBeLessThanOrEqual(labelTop)                                 // the bar stops above the label
    expect(read('studio/SelectionBar.jsx')).toMatch(/const box = screenBox\(what\.objs, objects, \{ zoom, panX, panY \}, labelScale\(labelSize, gridSize\)\)/)
  })

  it('REG-first-click-row: the first click on a rack selects the row with no bay; a second click on the same row drills into the bay', async () => {
    const SEL = await import('../../canvas2/selection'), H = await import('../../canvas2/hitTest'), BS = await import('../../utils/baySides')
    const r = store.getState().objects.find(o => o.type === 'rack_double_row'), gs = store.getState().gridSize || 40
    // a point on one half, over a bay: un-turned frame, then turned with the rack
    const rot = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const lx = r.width / 7, ly = -r.height / 4
    const pt = { x: cx + lx * Math.cos(rot) - ly * Math.sin(rot), y: cy + lx * Math.sin(rot) + ly * Math.cos(rot) }
    const bay = H.hitTestBay(r, pt.x, pt.y, gs)
    expect(bay).not.toBe(null)
    const click = (prev) => SEL.bayForClick({ obj: r, hitId: r.id, prevSelectedIds: prev, bayAt: () => H.hitTestBay(r, pt.x, pt.y, gs), half: () => BS.bayHalfAt(r, pt.x, pt.y, gs) })
    expect([click([]), click(['someone-else']), click([r.id]), click([r.id, 'x'])]).toEqual([null, null, bay, null])
    expect(SEL.bayForClick({ obj: r, hitId: r.id, prevSelectedIds: [], shiftKey: true, bayAt: () => bay, half: () => 0 })).toBe(bay)   // Shift keeps picking bays
  })

  it('REG-flue-pair: a click in a pair\'s flue selects the pair as one row — no bays; a second click there (the rack rule: row, then bay) the two facing bays', async () => {
    const SEL = await import('../../canvas2/selection'), H = await import('../../canvas2/hitTest'), BS = await import('../../utils/baySides')
    const r = store.getState().objects.find(o => o.type === 'rack_double_row'), gs = store.getState().gridSize || 40
    const rot = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2, lx = r.width / 7
    const pt = { x: cx + lx * Math.cos(rot), y: cy + lx * Math.sin(rot) }                 // the flue's middle line
    expect(BS.bayHalfAt(r, pt.x, pt.y, gs)).toBe(null)
    const bay = H.hitTestBay(r, pt.x, pt.y, gs)
    expect(bay).not.toBe(null)
    expect([[], [r.id]].map(prev => SEL.bayForClick({ obj: r, hitId: r.id, prevSelectedIds: prev, bayAt: () => H.hitTestBay(r, pt.x, pt.y, gs) }))).toEqual([null, bay])
  })

  it('REG-row-group-start: the Row group tool from the pill (or G) starts empty — a group the selection bar seeded, or the last one, does not carry over; the selection bar\'s Row group starts from the selection', async () => {
    const RG = await import('../../utils/rowGroupTool'), TS = await import('../../utils/toolSwitch'), A = await import('../../studio/selectionActions')
    const stopW = RG.installRowGroupWatcher(store), stopK = TS.installToolKeeper(store)
    const racks = store.getState().objects.filter(o => o.type === 'rack_double_row')
    // the selection bar's Row group: the group is the selection, the tool on
    store.setState({ selectedIds: [racks[0].id, racks[1].id] })
    A.groupSelectedRows()
    expect([RG.useRowGroup.getState().keys.length, store.getState().activeTool]).toEqual([2, RG.ROW_GROUP_TOOL])
    store.getState().setActiveTool('select')
    expect(RG.useRowGroup.getState().keys.length).toBe(2)                               // the group stays open
    // the pill (or G): the tool comes on — empty, whatever was selected or grouped
    store.setState({ selectedIds: [racks[2].id] })
    store.getState().setActiveTool(RG.ROW_GROUP_TOOL)
    expect(RG.useRowGroup.getState().keys).toEqual([])
    // a box then takes only the rows it touches
    const H = await import('../../canvas2/hitTest'), b = H.worldBoundsOf(racks[3], store.getState().objects)
    RG.startGroupBox({ x: b.x + b.width * 0.4, y: b.y + b.height * 0.4 }); RG.moveGroupBox({ x: b.x + b.width * 0.6, y: b.y + b.height * 0.6 })
    RG.commitGroupBox(store, true, 'select')
    const R2 = await import('../../utils/rowGroup'), rows = R2.rowsOf(store.getState().objects, 40)
    expect(RG.useRowGroup.getState().keys.map(k => R2.resolveKey(rows, k))).toEqual([R2.rowOfRack(rows, racks[3].id)])
    stopK(); stopW?.(); RG.clearGroup()
  })

  it('REG-menu-icons: the right-click menus — each item its section-9 icon on the left (24px; an empty slot where there is none yet) and its working shortcut on the right (faint, mono 11)', async () => {
    const SB = await import('../../studio/SelectionBar')
    const html = renderToStaticMarkup(createElement(SB.MoreItems, { obj: store.getState().objects[0], close: () => {} }))
    const rows = [...html.matchAll(/data-menu-icon="([^"]*)"[\s\S]*?<span style="flex:1[^"]*">([^<]+)<\/span>(?:<span data-menu-keys[^>]*>([^<]+)<\/span>)?/g)].map(m => [m[2], m[1], m[3] || ''])
    expect(rows).toEqual([['Lock', 'Lock', 'Ctrl+L'], ['To back', '', ''], ['Back', '', ''], ['Forward', '', ''], ['To front', '', ''], ['Copy', '', 'Ctrl+C'], ['Cut', '', 'Ctrl+X']])
    expect(html).toMatch(/data-menu-keys="true" style="font-family:[^"]*?JetBrains Mono[^"]*?font-size:11px;color:#7E8680/)
    expect(html).toMatch(/data-menu-icon="Lock" style="width:24px;height:24px/)
    const src = read('studio/SelectionBar.jsx')
    expect(src).toMatch(/<MenuItem icon=\{null\} keys="Ctrl\+V"[^>]*>Paste<\/MenuItem>/)
    expect(src).toMatch(/<MenuItem icon=\{\{ name: 'Fill racking' \}\} keys="F"[^>]*>Fill racking<\/MenuItem>/)
    expect(src).toMatch(/<MenuItem icon=\{\{ name: 'Zones', kind: 'rail' \}\}[\s\S]*?>Add zone<\/MenuItem>/)
    expect(src).toMatch(/ZONE_KINDS\.map\(z => <MenuItem key=\{z\.type\} icon=\{hasIcon\(z\.label, 'object'\) \? \{ name: z\.label, kind: 'object' \} : null\}/)
    // the shortcuts shown all work (the keyboard handler): Ctrl+L, Ctrl+C, Ctrl+X, Ctrl+V, F
    const ks = read('hooks/useKeyboardShortcuts.js')
    for (const k of ["case 'l':", "case 'c':", "case 'x':", "case 'v':", "'f': FILL_TOOL"]) expect([k, ks.includes(k)]).toEqual([k, true])
  })
})


/* ── the same bugs by real clicks (STUDIO.md §8): the app in Chromium, the mouse and keys on the canvas, on a saved
   older layout and a crowded one, both orientations (handCheck/browser.js) ── */
describe('REG — the hand check by real clicks', () => {
  let app
  beforeAll(async () => { const B = await import('./handCheck/browser.js'); app = await B.startApp() }, 240000)
  afterAll(async () => { await app?.close() })
  const FIXTURES = ['older-horizontal', 'older-vertical', 'crowded-horizontal', 'crowded-vertical']
  const T = 120000

  describe.each(FIXTURES)('%s', (name) => {
    let L
    const open = async () => { const B = await import('./handCheck/browser.js'); L = await B.openLayout(app, B.fixture(name)); return L }
    afterEach(async () => { if (L) { expect(L.errors).toEqual([]); await L.page.close(); L = null } })
    const crowded = name.startsWith('crowded')
    const fpOf = () => L.S('return S.getState().objects.find(o => /^fp_/.test(o.type))')
    /** a double row, a point on one half over a bay and a point in its flue (the rack's own frame, turned with it) */
    const pairPoints = async (id) => {
      const r = await L.S('const rs = S.getState().objects.filter(o => o.type === "rack_double_row"); return arg ? rs.find(o => o.id === arg) : rs[Math.floor(rs.length / 2)]', id || null)
      const rot = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2
      const at = (lx, ly) => ({ x: cx + lx * Math.cos(rot) - ly * Math.sin(rot), y: cy + lx * Math.sin(rot) + ly * Math.cos(rot) })
      return { r, half: at(r.width / 7, -r.height / 4), flue: at(r.width / 7, 0) }
    }

    it('REG-wall-pick (click): a click on a wall selects the building — an older layout\'s Generate lock is gone on load; a wall a rack stands 3″ off; a hand lock stays locked after a reload', async () => {
      await open()
      const fp = await fpOf()
      await L.click({ x: fp.x + fp.width / 2, y: fp.y })
      expect(await L.selected()).toEqual([fp.type])
      // the wall beside a rack whose pick padding reaches over it (made so in the crowded layouts)
      const wp = await L.S(`const st = S.getState(), fp = st.objects.find(o => /^fp_/.test(o.type)), ids = arg ? [arg] : st.objects.filter(o => /^rack_/.test(o.type)).map(o => o.id)
        for (const id of ids) { const r = st.objects.find(o => o.id === id), b = H.worldBoundsOf(r, st.objects)
          for (const [x, y] of [[fp.x, b.y + b.height / 2], [fp.x + fp.width, b.y + b.height / 2], [b.x + b.width / 2, fp.y], [b.x + b.width / 2, fp.y + fp.height]])
            if (H.hitTest(st.objects, st.layers, x, y, st.zoom, st.gridSize) === r.id) return { x, y, rack: r.id, type: r.type, c: { x: b.x + b.width / 2, y: b.y + b.height / 2 } } }
        return null`, crowded ? L.meta.wallRack : null)
      if (crowded) expect(wp).toBeTruthy()
      if (wp) {
        await L.page.keyboard.press('Escape'); await L.click(wp)
        expect(await L.selected()).toEqual([fp.type])
        await L.page.keyboard.press('Escape'); await L.click(wp.c)
        expect(await L.selected()).toEqual([wp.type])                                    // inside the rack: the rack
      }
      // a hand lock: the card's padlock (More), then saved and reopened — the wall stays unpickable
      await L.page.getByRole('group', { name: 'More properties' }).getByRole('button').first().click()
      await L.page.getByRole('button', { name: 'Lock Building layer' }).click()
      const saved = await L.S('return SL.serializeScene(S.getState())')
      await L.page.close()
      const B = await import('./handCheck/browser.js'); L = await B.openLayout(app, saved)
      await L.click({ x: fp.x + fp.width / 2, y: fp.y })
      expect(await L.selected()).not.toContain(fp.type)
    }, T)

    it('REG-delete-building (click): click the wall, Delete — the building only goes, racks, zones and columns stay; one undo step; the notice\'s Undo brings it back', async () => {
      await open()
      const fp = await fpOf()
      const kept = () => L.S('return S.getState().objects.filter(o => /^rack_|^zone_|column_grid|^aisle$|racking_area/.test(o.type)).length')
      const n0 = await kept(), h0 = await L.S('return S.getState().historyIndex')
      await L.click({ x: fp.x + fp.width / 2, y: fp.y })
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      expect([await L.S('return S.getState().objects.some(o => /^fp_/.test(o.type))'), await kept(), (await L.S('return S.getState().historyIndex')) - h0]).toEqual([false, n0, 1])
      const notice = L.page.locator('[aria-label="Notice"]')
      expect(await notice.textContent()).toMatch(/Building deleted.*racks, zones and columns kept/)
      await notice.getByRole('button', { name: 'Undo' }).click(); await L.page.waitForTimeout(300)
      expect([await L.S('return S.getState().objects.some(o => /^fp_/.test(o.type))'), await kept()]).toEqual([true, n0])
    }, T)

    it('REG-building-labels (click): a clicked building\'s top dimension label is never under the selection bar', async () => {
      await open()
      const fp = await fpOf()
      await L.click({ x: fp.x + fp.width / 2, y: fp.y })
      await L.page.mouse.move(5, 890); await L.page.waitForTimeout(200)
      const lz = await L.S('return LS.labelScale(P.useLabelPrefs.getState().labelSize, S.getState().gridSize)')
      const top = await L.toScreen({ x: fp.x + fp.width / 2, y: fp.y }), z = await L.S('return S.getState().zoom')
      const band = { y0: top.y - ((22 + 8.25 + 2) / lz) * z, y1: top.y }                // the top label's reach
      const bar = await L.page.locator('[data-selection-bar]').boundingBox()
      expect(bar).toBeTruthy()
      expect(bar.y + bar.height <= band.y0 || bar.y >= band.y1).toBe(true)
      const at = await L.page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el?.closest('[data-selection-bar]') ? 'bar' : el?.tagName }, { x: top.x, y: (band.y0 + band.y1) / 2 })
      expect(at).toBe('CANVAS')
    }, T)

    it('REG-first-click-row (click): the first click on a rack selects the row, no bay; a second click on the same spot its bay — the rack beside a column too', async () => {
      await open()
      const { r, half } = await pairPoints()
      const bay = await L.S('const st = S.getState(); return H.hitTestBay(st.objects.find(o => o.id === arg.id), arg.p.x, arg.p.y, st.gridSize)', { id: r.id, p: half })
      expect(bay).not.toBe(null)
      await L.click(half)
      expect([await L.selected(), (await L.bayOf(r.id)).idx]).toEqual([['rack_double_row'], null])
      await L.click(half)
      expect((await L.bayOf(r.id)).idx).toBe(bay)
      if (crowded) {
        // the rack 3″ off a column: a click just inside its edge by the column is the rack's — the row, no bay
        await L.page.keyboard.press('Escape')
        const p = await L.S(`const st = S.getState(), r = st.objects.find(o => o.id === arg.id), b = H.worldBoundsOf(r, st.objects), c = arg.c, m = 20
          const cx = Math.min(Math.max(c.x + c.width / 2, b.x + m), b.x + b.width - m), cy = Math.min(Math.max(c.y + c.height / 2, b.y + m), b.y + b.height - m)
          return { x: cx, y: cy, type: r.type }`, { id: L.meta.columnRack, c: L.meta.column })
        await L.click(p)
        expect([await L.selected(), (await L.bayOf(L.meta.columnRack)).idx]).toEqual([[p.type], null])
      }
    }, T)

    it('REG-flue-pair (click): a click in a pair\'s flue selects the pair, no bay; a second click on the same spot the two facing bays, one each side', async () => {
      await open()
      const { r, flue } = await pairPoints()
      const bay = await L.S('const st = S.getState(); return H.hitTestBay(st.objects.find(o => o.id === arg.id), arg.p.x, arg.p.y, st.gridSize)', { id: r.id, p: flue })
      expect(bay).not.toBe(null)
      await L.click(flue)
      expect([await L.selected(), await L.bayOf(r.id)]).toEqual([['rack_double_row'], { idx: null, side: null }])
      await L.click(flue)
      expect([await L.selected(), await L.bayOf(r.id)]).toEqual([['rack_double_row'], { idx: bay, side: null }])   // side null: both halves
    }, T)

    it('REG-row-group-start (click): the selection bar\'s Row group starts from the selection, the tool on; the pill starts empty; a box takes only the rows it touches', async () => {
      await open()
      const { r, half } = await pairPoints()
      await L.click(half)
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Row group' }).click(); await L.page.waitForTimeout(200)
      expect([await L.groupRows(), await L.S('return S.getState().activeTool')]).toEqual([1, 'row_group'])
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      const pill = L.page.locator('button[aria-label^="Row group"]:not([data-selection-bar] *)').last()
      await pill.click(); await L.page.waitForTimeout(200)
      expect(await L.groupRows()).toBe(0)
      const other = await L.S('const rs = S.getState().objects.filter(o => o.type === "rack_double_row" && o.id !== arg); const o = rs[0]; return { id: o.id, x: o.x + o.width / 2, y: o.y + o.height / 2 }', r.id)
      await L.drag({ x: other.x - 10, y: other.y - 10 }, { x: other.x + 10, y: other.y + 10 })
      const inGroup = await L.S('const rows = RW.rowsOf(S.getState().objects, S.getState().gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', [other.id, r.id])
      expect([await L.groupRows(), inGroup]).toEqual([1, [true, false]])
    }, T)

    it('REG-row-group-toggle (click): in Row group mode a click on a row puts it in or takes it out, a box adds every row inside; the tool stays on; the bar says "Click or drag rows to group"', async () => {
      await open()
      const ids = await L.S('return S.getState().objects.filter(o => o.type === "rack_double_row").map(o => o.id)')
      const a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      await L.page.locator('button[aria-label^="Row group"]:not([data-selection-bar] *)').last().click(); await L.page.waitForTimeout(200)
      const bar = L.page.locator('[data-mode-bar="row-group"]')
      expect(await bar.locator('[data-mode-hint]').textContent()).toBe('Click or drag rows to group')
      const rowsIn = (list) => L.S('const rows = RW.rowsOf(S.getState().objects, S.getState().gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', list)
      await L.click(a.half)
      expect([await rowsIn([ids[0]]), await L.S('return S.getState().activeTool')]).toEqual([[true], 'row_group'])
      await L.click(b.half)
      expect(await rowsIn([ids[0], ids[ids.length - 1]])).toEqual([true, true])
      await L.click(a.half)                                                             // again: out
      expect([await rowsIn([ids[0], ids[ids.length - 1]]), await L.S('return S.getState().activeTool')]).toEqual([[false, true], 'row_group'])
      // a box over two more rows: both join, the tool still on
      const box = await L.S('const st = S.getState(), rs = arg.map(id => H.worldBoundsOf(st.objects.find(o => o.id === id), st.objects)); return { x0: Math.min(...rs.map(b => b.x + b.width / 2)), y0: Math.min(...rs.map(b => b.y + b.height / 2)), x1: Math.max(...rs.map(b => b.x + b.width / 2)), y1: Math.max(...rs.map(b => b.y + b.height / 2)) }', [ids[1], ids[2]])
      await L.drag({ x: box.x0 - 5, y: box.y0 - 5 }, { x: box.x1 + 5, y: box.y1 + 5 })
      expect([await rowsIn([ids[1], ids[2], ids[ids.length - 1]]), await L.S('return S.getState().activeTool')]).toEqual([[true, true, true], 'row_group'])
      // ✕: the group cleared and Select back
      await bar.getByRole('button', { name: 'Clear the row group' }).click(); await L.page.waitForTimeout(150)
      expect([await L.groupRows(), await L.S('return S.getState().activeTool')]).toEqual([0, 'select'])
    }, T)

    it('REG-menu-icons (click): a right-click on a rack — each item its section-9 icon (an empty slot where none) and its working shortcut', async () => {
      await open()
      const { half } = await pairPoints()
      await L.click(half, { button: 'right' })
      const rows = await L.page.evaluate(() => [...document.querySelectorAll('[role="menu"][aria-label="Object"] [role="menuitem"]')].map(b => [b.querySelector('span[style*="flex: 1"]')?.textContent, b.querySelector('[data-menu-icon]')?.getAttribute('data-menu-icon') ?? 'none', b.querySelector('[data-menu-keys]')?.textContent || '']))
      expect(rows).toEqual([['Lock', 'Lock', 'Ctrl+L'], ['To back', '', ''], ['Back', '', ''], ['Forward', '', ''], ['To front', '', ''], ['Copy', '', 'Ctrl+C'], ['Cut', '', 'Ctrl+X']])
      const slot = await L.page.locator('[role="menu"][aria-label="Object"] [data-menu-icon]').first().boundingBox()
      expect([slot.width, slot.height]).toEqual([24, 24])
    }, T)
  })
})