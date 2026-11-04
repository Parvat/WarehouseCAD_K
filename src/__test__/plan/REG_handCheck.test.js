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
    expect(read('studio/SelectionBar.jsx')).toMatch(/const box = screenBox\(what\.objs, objects, view\), reach = screenBox\(what\.objs, objects, view, lz\)/)
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
    expect(RG.useRowGroup.getState().keys.length).toBe(0)                               // another tool ends the Row group (STUDIO.md §7)
    // the pill (or G): the tool comes on — empty, whatever was selected or grouped
    store.setState({ selectedIds: [racks[2].id] })
    store.getState().setActiveTool(RG.ROW_GROUP_TOOL)
    expect(RG.useRowGroup.getState().keys).toEqual([])
    // a box then takes only the rows it touches
    const H = await import('../../canvas2/hitTest'), b = H.worldBoundsOf(racks[3], store.getState().objects)
    RG.startGroupBox({ x: b.x + b.width * 0.4, y: b.y + b.height * 0.4 }); RG.moveGroupBox({ x: b.x + b.width * 0.6, y: b.y + b.height * 0.6 })
    RG.commitGroupBox(store, true, null)                                              // the tool stays on: another tool would end the group
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
      return { r, half: at(r.width / 7, -r.height / 4), flue: at(r.width / 7, 0), far: at(-r.width / 3, -r.height / 4) }
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
      await L.drag({ x: other.x - 60, y: other.y - 60 }, { x: other.x + 60, y: other.y + 60 })   // a real drag (past 4 px)
      const inGroup = await L.S('const rows = RW.rowsOf(S.getState().objects, S.getState().gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', [other.id, r.id])
      expect([await L.groupRows(), inGroup]).toEqual([1, [true, false]])
    }, T)

    it('REG-row-group-toggle (click): Row group uses the selection rule — Shift+click puts a row in or takes it out, a drag adds the rows it touches (the row nearest the drag start becomes the edit row); a plain click makes the row the edit row with its handles and bar at once, so it can be expanded straight away; the hint reads "Drag or Shift+click rows. Click a row to edit."; Esc leaves Row group with nothing selected and no bar', async () => {
      await open()
      const ids = await openRacks()
      const a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      await L.page.locator('button[aria-label^="Row group"]:not([data-selection-bar] *)').last().click(); await L.page.waitForTimeout(200)
      const mode = L.page.locator('[data-mode-bar="row-group"]')
      expect(await mode.locator('[data-mode-hint]').textContent()).toBe('Drag or Shift+click rows. Click a row to edit.')
      const rowsIn = (list) => L.S('const rows = RW.rowsOf(S.getState().objects, S.getState().gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', list)
      const tool = () => L.S('return S.getState().activeTool')
      await L.shiftClick(a.half)
      await L.shiftClick(b.half)
      expect([await rowsIn([ids[0], ids[ids.length - 1]]), await tool()]).toEqual([[true, true], 'row_group'])
      await L.shiftClick(a.half)                                                        // again: out
      expect(await rowsIn([ids[0], ids[ids.length - 1]])).toEqual([false, true])
      // a plain click: the edit row — selected (its section), its bar and handles at once; the group as it was
      await L.click(b.half)
      const sec = await L.S('return SC.sectionIds(S.getState().objects, arg, S.getState().gridSize || 40)', ids[ids.length - 1])
      expect([(await L.S('return S.getState().selectedIds')).sort(), (await L.bar())?.kind, await tool(), await rowsIn([ids[ids.length - 1]])]).toEqual([[...sec].sort(), 'rack', 'row_group', [true]])
      // expanded straight away: its end handle dragged out a bay — the row grows
      const h = await L.S(`const st = S.getState(), o = st.objects.find(x => x.id === arg), z = st.zoom, lay = HG.computeHandleLayout(o, z), p = lay.positions.mr
        const b = lay.bounds, cx = b.x + b.width / 2, cy = b.y + b.height / 2, t = (o.rotation || 0) * Math.PI / 180
        const w = (q) => ({ x: cx + (q.x - cx) * Math.cos(t) - (q.y - cy) * Math.sin(t), y: cy + (q.x - cx) * Math.sin(t) + (q.y - cy) * Math.cos(t) })
        return { from: w(p), to: w({ x: p.x + 9 * (st.gridSize || 40), y: p.y }), beams: o.beams.length }`, ids[ids.length - 1])
      await L.drag(h.from, h.to)
      expect(await L.S('const o = S.getState().objects.find(x => x.id === arg); return o.beams.length', ids[ids.length - 1])).toBeGreaterThan(h.beams)
      // a drag over two rows: both join; the row nearest where it started is the edit row
      // two rows not yet in the group whose middles are on the open canvas (not under the card or a bar)
      const open2 = []
      for (const id of ids.slice(1, -1)) {
        const c = await L.S('const o = S.getState().objects.find(x => x.id === arg); const b = H.worldBoundsOf(o, S.getState().objects); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }', id)
        const p = await L.toScreen(c)
        if (await L.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p)) open2.push({ id, c })
        if (open2.length === 2) break
      }
      // a box (not a line: two middles side by side share a y) from just off the first row's middle
      const [p1, p2] = open2.map(o => o.c), d = 60
      await L.drag({ x: Math.min(p1.x, p2.x) - d, y: Math.min(p1.y, p2.y) - d }, { x: Math.max(p1.x, p2.x) + d, y: Math.max(p1.y, p2.y) + d })
      const nearFirst = Math.hypot(Math.min(p1.x, p2.x) - p1.x, Math.min(p1.y, p2.y) - p1.y) <= Math.hypot(Math.min(p1.x, p2.x) - p2.x, Math.min(p1.y, p2.y) - p2.y) ? 0 : 1
      expect([await rowsIn(open2.map(o => o.id)), (await L.S('return S.getState().selectedIds')).includes(open2[nearFirst].id), await tool()]).toEqual([[true, true], true, 'row_group'])
      // Esc: out of Row group — nothing selected, no bar, no mode bar
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(200)
      expect([await tool(), await L.groupRows(), await L.S('return S.getState().selectedIds.length'), await L.bar(), await mode.count()]).toEqual(['pan', 0, 0, null, 0])   // back to Pan, the home tool
    }, T)

    /* ── the selection rule (STUDIO.md §7): rows or bays, never both ── */
    /** Double rows (or `type`) whose click points (half, flue, far, middle) are all on the open canvas now, in plan order. */
    const openRacks = async (type = 'rack_double_row', minBays = 1) => {
      const list = await L.S('return S.getState().objects.filter(o => o.type === arg.t && o.beams.length >= arg.n).map(o => o.id)', { t: type, n: minBays })
      const out = []
      for (const id of list) {
        const r = await L.S('return S.getState().objects.find(o => o.id === arg)', id)
        const rot = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2
        const at = (lx, ly) => ({ x: cx + lx * Math.cos(rot) - ly * Math.sin(rot), y: cy + lx * Math.sin(rot) + ly * Math.cos(rot) })
        const pts = [at(r.width / 7, -r.height / 4), at(r.width / 7, 0), at(-r.width / 3, -r.height / 4), at(0, 0), at(r.width * 0.45, 0), at(r.width / 7, r.height / 4)]
        let ok = true
        for (const w of pts) { const p = await L.toScreen(w); if (!(await L.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p))) { ok = false; break } }
        if (ok) out.push(id)
      }
      return out
    }
    /** The first of `ids` (not `not`) whose click points are on the open canvas right now. */
    const openNow = async (ids, not) => {
      for (const id of [...ids].reverse()) {
        if (id === not) continue
        const p = await pairPoints(id)
        let ok = true
        for (const w of [p.half, p.far, p.flue]) { const q = await L.toScreen(w); if (!(await L.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', q))) { ok = false; break } }
        if (ok) return p
      }
      throw new Error('no row on the open canvas')
    }
    const levelOf = () => L.S('const s = S.getState(); return { ids: [...s.selectedIds].sort(), multi: s.activeBaySelection.length, one: s.objects.filter(o => o.activeBayIdx != null).map(o => o.id) }')

    it('REG-select-click (click): a click on a rack selects its row (blue outline, no bay); a click on the same row its bay (filled, the row thin and dashed); a click on another row selects that row and no bay', async () => {
      await open()
      const ids = await openRacks()
      let a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      const bay = await L.S('const st = S.getState(); return H.hitTestBay(st.objects.find(o => o.id === arg.id), arg.p.x, arg.p.y, st.gridSize)', { id: a.r.id, p: a.half })
      await L.click(a.half)
      expect([(await levelOf()).one, (await L.bar())?.kind, (await L.outlines()).map(o => [o.dashed, o.width])]).toEqual([[], 'rack', [[false, 2]]])
      expect(await L.page.evaluate(() => window.Konva.stages[0].find('.bay-pick').length)).toBe(0)
      await L.click(a.half)
      expect([(await L.bayOf(a.r.id)).idx, (await L.bar())?.kind, (await L.outlines()).map(o => [o.dashed, o.width])]).toEqual([bay, 'bay', [[true, 1]]])
      expect(await L.page.evaluate(() => window.Konva.stages[0].find('.bay-pick').length)).toBeGreaterThan(0)
      b = await openNow(ids, a.r.id)
      await L.click(b.half)
      expect([(await levelOf()).one, (await levelOf()).multi, (await L.selected())]).toEqual([[], 0, ['rack_double_row']])
    }, T)

    it('REG-select-shift (click): Shift+click stays at the level — with bays it adds or removes bays in any row (the bay bar), never a row; with rows it adds or removes rows ("2 rows · N positions"), never a bay', async () => {
      await open()
      const ids = await openRacks()
      let a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      await L.click(a.half); await L.click(a.half)                                      // a bay
      b = await openNow(ids, a.r.id)
      await L.shiftClick(b.half)                                                        // a bay in another row
      expect([(await levelOf()).multi, (await levelOf()).ids, (await L.bar())?.kind]).toEqual([2, [a.r.id, b.r.id].sort(), 'bays'])
      const fl = await L.floorPoint()
      await L.shiftClick(fl)                                                            // not a bay: nothing changes
      expect((await levelOf()).multi).toBe(2)
      await L.shiftClick(b.half)                                                        // again: out
      expect([(await levelOf()).one, (await levelOf()).multi]).toEqual([[a.r.id], 0])
      // rows: Esc up to the row, then Shift+click adds a row, never a bay
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      await L.shiftClick(b.half)
      const lv = await levelOf()
      expect([lv.one, lv.multi, lv.ids.includes(a.r.id) && lv.ids.includes(b.r.id), (await L.bar())?.kind]).toEqual([[], 0, true, 'rows'])
      await L.page.mouse.move(5, 890); await L.page.waitForTimeout(200)
      expect((await L.bar()).text).toMatch(/^2 rows · [\d,]+ positions/)
      await L.shiftClick(b.half)
      expect((await levelOf()).ids.includes(b.r.id)).toBe(false)
    }, T)

    it('REG-select-box (click): a drag on the floor selects rows — never bays — replacing the selection; Shift+drag adds rows; a click on the floor selects nothing', async () => {
      await open()
      const fp = await fpOf()
      const at = (fx, fy) => ({ x: fp.x + fp.width * fx, y: fp.y + fp.height * fy })
      const s1 = await L.floorPoint(at(0.12, 0.12)), s2 = await L.floorPoint(at(0.62, 0.62))
      await L.drag(s1, at(0.4, 0.4))
      const one = await levelOf(), types1 = await L.selected()
      expect([one.ids.length > 0, one.multi, one.one, types1.every(t => /^rack_/.test(t))]).toEqual([true, 0, [], true])
      await L.shiftDrag(s2, at(0.9, 0.9))
      const two = await levelOf()
      expect([one.ids.every(id => two.ids.includes(id)), two.ids.length > one.ids.length, two.multi, two.one]).toEqual([true, true, 0, []])
      await L.drag(s2, at(0.9, 0.9))                                                     // a plain drag replaces
      const three = await levelOf()
      expect([three.ids.some(id => one.ids.includes(id) && !two.ids.filter(x => !one.ids.includes(x)).includes(id)), three.ids.length > 0]).toEqual([false, true])
      // a click on the blank floor selects the building (STUDIO.md §7 — it replaced "the floor never selects it")
      await L.click(await L.floorPoint(at(0.5, 0.5)))
      expect((await levelOf()).ids).toEqual([fp.id])
    }, T)

    it('REG-select-esc-delete (click): Esc from bays steps up to their row, from rows clears; Delete with a bay picked deletes only that bay (the row stays), with rows the rows', async () => {
      await open()
      const ids = await openRacks()
      const a = await pairPoints(ids[0])
      await L.click(a.half); await L.click(a.half)
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      const up = await levelOf()
      expect([up.ids.includes(a.r.id), up.one, up.multi, (await L.bar())?.kind]).toEqual([true, [], 0, 'rack'])
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      expect([(await levelOf()).ids, await L.bar()]).toEqual([[], null])
      // Delete at the bay level: one bay less in the row's pieces, the row still there
      // bay sides that hold racking: a pair's empty sides (utils/bayEmpty.js) hold none
      const bays = () => L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg).reduce((t, o) => t + o.beams.length * (o.type === "rack_double_row" ? 2 : 1) - (o.bayEmpty ? o.bayEmpty.flat().filter(Boolean).length : 0), 0)', a.r.id)
      const n0 = await bays()
      await L.click(a.half); await L.click(a.half)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      expect([await L.S('return S.getState().objects.some(o => o.id === arg)', a.r.id), await bays()]).toEqual([true, n0 - 1])
      // Delete at the row level: the row goes
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      await L.click(a.far)                                                              // the row (its section), on a bay still there
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      expect(await L.S('return S.getState().objects.some(o => o.id === arg || o.pieceOf === arg)', a.r.id)).toBe(false)
    }, T)

    it('REG-select-labels (click): one row selected shows its dimension labels; several show no per-row tags — the bar shows the count instead', async () => {
      await open()
      const ids = await openRacks()
      let a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      const base = (await L.pills()).length
      await L.click(a.half)
      expect((await L.pills()).length).toBeGreaterThan(base)
      b = await openNow(ids, a.r.id)
      await L.shiftClick(b.half)
      expect((await L.pills()).length).toBe(base)
      await L.page.mouse.move(5, 890); await L.page.waitForTimeout(200)
      expect((await L.bar()).text).toMatch(/^2 rows · [\d,]+ positions/)
    }, T)

    /* ── D: the bars' buttons hover a step lighter, never darker ── */
    it('REG-button-hover (click): Apply (mint primary) hovers slightly lighter, never darker; Skip (ghost) too; disabled is 45% and still readable; Export likewise', async () => {
      await open()
      const ids = await openRacks()
      // two rows over the same run, so an edit to one replays on the other (the bar asks: Apply)
      const twins = await L.S(`const st = S.getState(), bs = arg.map(id => ({ id, b: H.worldBoundsOf(st.objects.find(o => o.id === id), st.objects), v: ((st.objects.find(o => o.id === id).rotation || 0) % 180) !== 0 }))
        for (const p of bs) for (const q of bs) if (p.id !== q.id && p.v === q.v && (p.v ? Math.abs(p.b.y - q.b.y) < 1 && Math.abs(p.b.height - q.b.height) < 1 : Math.abs(p.b.x - q.b.x) < 1 && Math.abs(p.b.width - q.b.width) < 1)) return [p.id, q.id]
        return null`, ids)
      expect(twins).toBeTruthy()
      const a = await pairPoints(twins[0]), b = await pairPoints(twins[1])
      await L.page.locator('button[aria-label^="Row group"]:not([data-selection-bar] *)').last().click(); await L.page.waitForTimeout(150)
      await L.shiftClick(a.half); await L.shiftClick(b.half); await L.click(a.half)                 // a group, its edit row
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Add bay' }).click(); await L.page.waitForTimeout(400)
      const lum = (rgb) => { const [r, g, b2] = rgb.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b2 }
      const hoverLighter = async (loc) => {
        await L.page.mouse.move(5, 890); await L.page.waitForTimeout(100)
        const before = await loc.evaluate(e => getComputedStyle(e).backgroundColor)
        await loc.hover(); await L.page.waitForTimeout(100)
        const after = await loc.evaluate(e => getComputedStyle(e).backgroundColor)
        return lum(after) - lum(before)
      }
      const apply = L.page.getByRole('button', { name: 'Apply to the other rows' }), skip = L.page.getByRole('button', { name: 'Skip' })
      expect(await apply.count()).toBe(1)
      expect(await hoverLighter(apply)).toBeGreaterThan(0)
      expect(await hoverLighter(skip)).toBeGreaterThan(0)
      expect(await hoverLighter(L.page.getByRole('button', { name: 'Export' }))).toBeGreaterThan(0)
      const dis = await apply.evaluate(e => { e.disabled = true; const cs = getComputedStyle(e); const out = { opacity: cs.opacity, color: cs.color, bg: cs.backgroundColor }; e.disabled = false; return out })
      expect([dis.opacity, dis.color, dis.bg]).toEqual(['0.45', 'rgb(15, 42, 31)', 'rgb(123, 211, 164)'])
    }, T)

    /* ── E: a back-to-back pair is one section until both facing bays go ── */
    it('REG-section-pair (click): a bay deleted on one side keeps the pair ONE object (that side empty) — one selection, one bar, one label set; deleting the facing bay too splits it in two', async () => {
      await open()
      const ids = await openRacks()
      const a = await pairPoints(ids[0])
      const rot = ((a.r.rotation || 0) * Math.PI) / 180, cx = a.r.x + a.r.width / 2, cy = a.r.y + a.r.height / 2
      const other = { x: cx + (a.r.width / 7) * Math.cos(rot) - (a.r.height / 4) * Math.sin(rot), y: cy + (a.r.width / 7) * Math.sin(rot) + (a.r.height / 4) * Math.cos(rot) }   // the facing bay, the other side
      const base0 = (await L.pills()).length
      await L.click(a.half)
      const one0 = (await L.pills()).length - base0
      await L.click(a.half)                                                             // the bay, this side
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      const pieces = () => L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg).map(o => o.id)', a.r.id)
      // the pair stays ONE object (utils/bayEmpty.js): that bay empty on this side, nothing cut off
      expect([(await pieces()).length, await L.S('const o = S.getState().objects.find(x => x.id === arg); return !!(o.bayEmpty && o.bayEmpty.flat().some(Boolean))', a.r.id)]).toEqual([1, true])
      await L.page.keyboard.press('Escape'); await L.page.mouse.move(5, 890); await L.page.waitForTimeout(150)
      const base1 = (await L.pills()).length
      await L.click(a.flue)                                                             // the pair, as one row
      const sel = (await levelOf()).ids
      expect([sel, (await L.bar())?.kind, await L.page.locator('[data-selection-bar]').count()]).toEqual([(await pieces()).sort(), 'rack', 1])
      expect((await L.pills()).length - base1).toBe(one0)                               // one label set, as before
      // the facing bay too: the pair splits — two sections
      await L.click(other)
      expect((await levelOf()).one.length + (await levelOf()).multi).toBe(1)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      await L.click(a.far)                                                              // one side of the gap
      const after = (await levelOf()).ids, all = await pieces()
      expect([after.length > 0, after.length < all.length]).toEqual([true, true])
    }, T)

    it('REG-section-single (click): a single row splits in two sections when a middle bay is deleted', async () => {
      await open()
      const r = await L.S('return S.getState().objects.find(o => o.id === arg)', (await openRacks('rack_row', 3))[0])
      const rot = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2
      const mid = { x: cx, y: cy }, end = { x: cx + (r.width * 0.45) * Math.cos(rot), y: cy + (r.width * 0.45) * Math.sin(rot) }
      await L.click(mid); await L.click(mid)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      const pieces = await L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg).map(o => o.id)', r.id)
      expect(pieces.length).toBe(2)
      await L.click(end)
      expect((await levelOf()).ids.length).toBe(1)
    }, T)

    it('REG-section-group (click): a Row group, then another tool (V): the group ends at once (no stale group); the split after it is a plain one, in two pieces', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 3)
      const a = await pairPoints(ids[0])
      const rot = ((a.r.rotation || 0) * Math.PI) / 180, mid = { x: a.r.x + a.r.width / 2, y: a.r.y + a.r.height / 2 }
      await L.click(a.half)
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Row group' }).click(); await L.page.waitForTimeout(200)
      expect(await L.groupRows()).toBe(1)
      // another tool (V) ends the Row group now (STUDIO.md §7): no group left behind — then the split is a plain one
      await L.page.keyboard.press('v'); await L.page.waitForTimeout(150)
      expect([await L.groupRows(), await L.S('return S.getState().selectedIds.length')]).toEqual([0, 0])
      await L.click(mid); await L.click(mid)                                            // the row, then its middle bay, both sides (the flue)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(400)
      const pieces = await L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg).map(o => o.id)', a.r.id)
      expect([pieces.length, await L.groupRows()]).toEqual([2, 0])
    }, T)

    /* ── F: the selection bar covers no label ── */
    it('REG-bar-labels (click): the selection bar never covers a label — its own dimensions, aisle labels, column clearances — for every rack and the building', async () => {
      await open()
      const racks = await L.S('return S.getState().objects.filter(o => o.type === "rack_double_row" || o.type === "rack_row").map(o => o.id)')
      const fp = await fpOf()
      const covered = []
      const check = async (what) => {
        await L.page.mouse.move(5, 890); await L.page.waitForTimeout(250)
        const bar = await L.bar(), ps = await L.pills()
        if (!bar) return
        for (const p of ps) if (p.x0 < bar.x1 && bar.x0 < p.x1 && p.y0 < bar.y1 && bar.y0 < p.y1) covered.push([what, p.text])
      }
      for (const id of racks) {
        const c = await L.S('const o = S.getState().objects.find(x => x.id === arg); return { x: o.x + o.width / 2, y: o.y + o.height / 2, t: o.type }', id)
        await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(100)
        await L.click(c)
        await check(id)
      }
      await L.page.keyboard.press('Escape')
      await L.click({ x: fp.x + fp.width / 2, y: fp.y })
      await check('building')
      expect(covered).toEqual([])
    }, T)

    /* ── G: the clearance tags go when the action ends ── */
    /* ── the column clearance numbers (C18): when they show, how they look ── */
    const numbers = () => L.page.evaluate(() => { const g = window.Konva.stages[0].findOne('.clearance-numbers'); return g ? g.find('Text').filter(t => t.isVisible()).map(t => t.text()) : [] })
    const numPx = () => L.S('return (9.5 / LS.labelScale(P.useLabelPrefs.getState().labelSize, S.getState().gridSize)) * S.getState().zoom')
    /** The wheel at the canvas middle, \`dy\` a notch; waits out the fade. */
    const wheel = async (dy, n = 1) => { const c = await L.page.locator('#canvas2-container').boundingBox(); await L.page.mouse.move(c.x + c.width * 0.45, c.y + c.height * 0.5); for (let i = 0; i < n; i++) { await L.page.mouse.wheel(0, dy); await L.page.waitForTimeout(40) } await L.page.waitForTimeout(350) }
    const zoomOutTill = async (px) => { for (let i = 0; i < 40 && (await numPx()) >= px; i++) await wheel(40) }

    it('REG-clear-tags (click): the clearance numbers (zoomed out, nothing selected) are not drawn; during a rack drag they are; when the drag ends they go', async () => {
      await open()
      await zoomOutTill(7)
      expect(await numbers()).toEqual([])
      const ids = await openRacks()
      const a = await pairPoints(ids[Math.floor(ids.length / 2)])
      const p = await L.toScreen(a.far)
      await L.page.mouse.move(p.x, p.y); await L.page.mouse.down(); await L.page.mouse.move(p.x + 4, p.y + 4, { steps: 3 }); await L.page.mouse.move(p.x + 6, p.y + 6, { steps: 2 }); await L.page.waitForTimeout(400)
      const during = await numbers()
      await L.page.mouse.up(); await L.page.waitForTimeout(400)
      expect([during.length > 0, await numbers()]).toEqual([true, []])
    }, T)

    it('REG-clear-zoom (click): zoomed in past the threshold (the number 8 px tall) the numbers fade in, and stay until under 7 px (the buffer); C18 look — grey ft-in numbers on thin dotted lines, no arrowheads; no number overlaps a rack or a column', async () => {
      await open()
      await zoomOutTill(7)
      expect(await numbers()).toEqual([])
      // in, a notch at a time: off until 8 px, on from there
      let seen = null
      for (let i = 0; i < 60; i++) {
        await wheel(-25)
        const px = await numPx(), n = (await numbers()).length
        if (px < 8) expect([px < 8, n]).toEqual([true, 0])
        else { seen = px; expect(n).toBeGreaterThan(0); break }
      }
      expect(seen).not.toBe(null)
      // out again, a notch at a time: still on down to 7 px, off under it
      for (let i = 0; i < 60; i++) {
        await wheel(25)
        const px = await numPx(), n = (await numbers()).length
        if (px >= 7) expect(n).toBeGreaterThan(0)
        else { expect(n).toBe(0); break }
      }
      // back in, well past: the look, and no number on a rack or a column
      for (let i = 0; i < 12; i++) await wheel(-60)
      const look = await L.page.evaluate(() => {
        const g = window.Konva.stages[0].findOne('.clearance-numbers')
        if (!g) return null
        const texts = g.find('Text').filter(t => t.isVisible()), lines = g.find('Line')
        return { texts: texts.map(t => [t.text(), t.fill(), t.fontStyle()]), lines: lines.map(l => [l.stroke(), !!(l.dash() && l.dash().length), !!l.closed()]),
          boxes: texts.map(t => { const r = t.getClientRect(); return { x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height } }) }
      })
      expect(look.texts.length).toBeGreaterThan(0)
      for (const [txt, fill, fw] of look.texts) expect([/^\d+′-\d+″$/.test(txt), fill, fw]).toEqual([true, '#767C74', '600'])
      for (const [stroke, dashed, closed] of look.lines) expect([stroke, dashed, closed]).toEqual(['#9AA29C', true, false])
      const solids = await L.S(`const st = S.getState(), z = st.zoom, px = st.panX, py = st.panY
        const racks = st.objects.filter(o => /^rack_/.test(o.type)).map(o => H.worldBoundsOf(o, st.objects))
        const cols = H.columnRectsOf(st.objects, st.gridSize || 40).map(c => ({ x: c.x, y: c.y, width: c.w, height: c.h }))
        return [...racks, ...cols].map(b => ({ x0: b.x * z + px, y0: b.y * z + py, x1: (b.x + b.width) * z + px, y1: (b.y + b.height) * z + py }))`)
      const over = look.boxes.filter(t => solids.some(b => t.x0 < b.x1 - 0.5 && b.x0 < t.x1 - 0.5 && t.y0 < b.y1 - 0.5 && b.y0 < t.y1 - 0.5))
      expect(over).toEqual([])
    }, T)

    // a column the canvas picks (in an aisle, off the walls — one inside a rack or by a wall is the rack's or the wall's)
    const colAt = 'const st = S.getState(), fp = st.objects.find(o => /^fp_/.test(o.type)), cs = H.columnRectsOf(st.objects, st.gridSize || 40).map(c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })); const inset = (p) => Math.min(p.x - fp.x, fp.x + fp.width - p.x, p.y - fp.y, fp.y + fp.height - p.y); return cs.filter(p => inset(p) > 4 * (st.gridSize || 40) && !st.objects.some(o => /^rack_/.test(o.type) && (() => { const b = H.worldBoundsOf(o, st.objects); return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height })())).sort((a, b) => inset(b) - inset(a))[0]'
    /** the clearance numbers' centres on the canvas (canvas px) */
    const numberSpots = () => L.page.evaluate(() => { const g = window.Konva.stages[0].findOne('.clearance-numbers'); return g ? g.find('Text').filter(t => t.isVisible()).map(t => { const r = t.getClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }) : [] })

    it('REG-clear-column (click): a column clicked shows its own clearances even zoomed out; Esc to the whole grid shows all of them; Esc again none', async () => {
      await open()
      await zoomOutTill(7)
      const col = await L.S(colAt)
      expect(col).toBeTruthy()
      await L.click(col)
      expect(await L.selected()).toEqual(['column_grid'])
      await L.page.waitForTimeout(300)
      const one = await numbers()
      expect(one.length).toBeGreaterThan(0)
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(400)
      const all = await numbers()
      expect([await L.selected(), all.length >= one.length]).toEqual([['column_grid'], true])
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(400)
      expect(await numbers()).toEqual([])
    }, T)

    /* ── one column: a click picks it, the Columns layer locked or not ── */
    it('REG-column-pick (click): a click on a column on the LOCKED Columns layer picks that one column — outlined alone, its bar\'s Show clearances that column\'s only; it cannot be moved (drag, arrows) or deleted; Esc steps up to the grid; Ctrl+A still skips it', async () => {
      await open()
      await zoomOutTill(7)
      // the layout as Generate leaves it: the Columns layer locked
      await L.S('const st = S.getState(), l = st.layers.find(x => x.id === "columns"); if (l && !l.locked) st.updateLayer("columns", { locked: true })')
      expect(await L.S('return !!S.getState().layers.find(x => x.id === "columns")?.locked')).toBe(true)
      const c = await L.S(colAt)
      expect(c).toBeTruthy()
      const g0 = await L.S('const g = S.getState().objects.find(o => o.type === "column_grid"); return { id: g.id, x: g.x, y: g.y }')
      await L.click(c)
      const pick = await L.S('return CP.useColumnPick.getState().pick')
      expect([await L.selected(), !!pick && Math.abs(pick.x + pick.w / 2 - c.x) < 1 && Math.abs(pick.y + pick.h / 2 - c.y) < 1]).toEqual([['column_grid'], true])
      // outlined alone: the outline is the column's square, not the grid's box
      const ol = await L.page.evaluate(() => window.Konva.stages[0].find(x => /^sel:/.test(x.name() || '')).map(x => { const r = x.getClientRect({ skipStroke: true }); return [r.width, r.height] }))
      const z = await L.S('return S.getState().zoom')
      expect([ol.length, Math.abs(ol[0][0] - pick.w * z) < 3, Math.abs(ol[0][1] - pick.h * z) < 3]).toEqual([1, true, true])
      // its bar: Show clearances, on — that column's numbers only, on its own lines
      const btn = L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Show clearances' })
      expect([(await L.bar())?.kind, await btn.getAttribute('aria-pressed')]).toEqual(['column', 'true'])
      await L.page.waitForTimeout(300)
      const spots = await numberSpots(), cs = await L.toScreen(c), cv = await L.page.locator('#canvas2-container').boundingBox()
      expect(spots.length).toBeGreaterThan(0)
      // every number is in line with the column (its lines run straight out of it across the aisle)
      const half = Math.max(pick.w, pick.h) * z / 2 + 2
      expect(spots.filter(p => !(Math.abs(p.x + cv.x - cs.x) <= half || Math.abs(p.y + cv.y - cs.y) <= half))).toEqual([])
      await btn.click(); await L.page.waitForTimeout(400)
      expect([await btn.getAttribute('aria-pressed'), await numbers()]).toEqual(['false', []])
      await btn.click(); await L.page.waitForTimeout(400)
      expect((await numbers()).length).toBeGreaterThan(0)
      // locked: a drag from it moves nothing; the arrows move nothing; Delete deletes nothing
      const gs = await L.S('return S.getState().gridSize || 40')
      await L.drag(c, { x: c.x + 3 * gs, y: c.y + 3 * gs })
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape')
      await L.click(c)
      expect(await L.S('return !!CP.useColumnPick.getState().pick')).toBe(true)
      await L.page.keyboard.press('ArrowRight'); await L.page.keyboard.press('Shift+ArrowDown'); await L.page.waitForTimeout(100)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(150)
      expect(await L.S('const g = S.getState().objects.find(o => o.id === arg.id); return g ? { id: g.id, x: g.x, y: g.y } : null', g0)).toEqual(g0)
      // Esc: the whole grid — no pick, the grid still selected, its bar; Delete still deletes nothing; Esc again: nothing
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      expect([await L.S('return CP.useColumnPick.getState().pick'), await L.selected(), (await L.bar())?.kind]).toEqual([null, ['column_grid'], 'column'])
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(150)
      expect(await L.S('return !!S.getState().objects.find(o => o.id === arg)', g0.id)).toBe(true)
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      expect(await L.selected()).toEqual([])
      // Ctrl+A still skips the locked layer
      await L.page.mouse.move(5, 890); await L.page.keyboard.press('Control+a'); await L.page.waitForTimeout(150)
      expect((await L.selected()).includes('column_grid')).toBe(false)
    }, T)

    /* ── bay runs ── */
    it('REG-bay-run (click): with a bay picked, a drag along its row picks the run of bays it crosses in that row; a drag on the floor still selects rows', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 6)
      const a = await pairPoints(ids[0])
      const r = a.r, t = ((r.rotation || 0) * Math.PI) / 180, cx = r.x + r.width / 2, cy = r.y + r.height / 2
      const at = (fx) => ({ x: cx + (r.width * fx) * Math.cos(t) - (-r.height / 4) * Math.sin(t), y: cy + (r.width * fx) * Math.sin(t) + (-r.height / 4) * Math.cos(t) })
      await L.click(at(-0.3)); await L.click(at(-0.3))                                   // a bay
      const b0 = (await L.bayOf(r.id)).idx
      await L.drag(at(-0.3), at(0.1))
      const run = await L.S('return S.getState().activeBaySelection.map(e => e.objId + ":" + e.bayIdx + ":" + (e.side ?? "both"))')
      const idx = run.map(x => Number(x.split(':')[1])).sort((p, q) => p - q)
      expect([run.length > 2, run.every(x => x.startsWith(r.id + ':')), idx[0] === b0 || idx[idx.length - 1] === b0, idx.every((v, i) => !i || v === idx[i - 1] + 1)]).toEqual([true, true, true, true])
      expect(await L.S('const o = S.getState().objects.find(x => x.id === arg); return [o.x, o.y]', r.id)).toEqual([r.x, r.y])   // the rack did not move
      // the floor: rows
      const fp = await fpOf(), s1 = await L.floorPoint({ x: fp.x + fp.width * 0.6, y: fp.y + fp.height * 0.6 })
      await L.drag(s1, { x: fp.x + fp.width * 0.9, y: fp.y + fp.height * 0.9 })
      const lv = await levelOf()
      expect([lv.multi, lv.one, lv.ids.length > 0]).toEqual([0, [], true])
    }, T)

    /* ── Row group: a plain click adds ── */
    it('REG-row-group-add (click): in Row group a plain click on a row not in the group adds it and makes it the edit row; on a group row it makes it the edit row; Shift+click toggles', async () => {
      await open()
      const ids = await openRacks()
      const a = await pairPoints(ids[0]), b = await pairPoints(ids[ids.length - 1])
      await L.page.locator('button[aria-label^="Row group"]:not([data-selection-bar] *)').last().click(); await L.page.waitForTimeout(150)
      const rowsIn = (list) => L.S('const rows = RW.rowsOf(S.getState().objects, S.getState().gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', list)
      await L.click(a.half)
      expect([await rowsIn([a.r.id]), (await levelOf()).ids.includes(a.r.id)]).toEqual([[true], true])
      await L.click(b.half)
      expect([await rowsIn([a.r.id, b.r.id]), (await levelOf()).ids.includes(b.r.id), await L.groupRows()]).toEqual([[true, true], true, 2])
      await L.click(a.half)                                                             // a group row: the edit row, still 2
      expect([await L.groupRows(), (await levelOf()).ids.includes(a.r.id)]).toEqual([2, true])
      await L.shiftClick(a.half)
      expect(await rowsIn([a.r.id, b.r.id])).toEqual([false, true])
    }, T)

    /* ── Delete: a rack's only bay ── */
    it('REG-delete-only-bay (click): with the only bay of a rack picked, Delete deletes the row — one undo step, a notice with Undo', async () => {
      await open()
      const id = (await openRacks('rack_row', 2))[0]
      const r = await L.S('return S.getState().objects.find(o => o.id === arg)', id)
      const mid = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      await L.click(mid)
      for (let i = 0; i < 40 && (await L.S('return S.getState().objects.find(o => o.id === arg)?.beams.length', id)) > 1; i++) {
        await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Remove bay' }).click(); await L.page.waitForTimeout(80)
      }
      const one = await L.S('return S.getState().objects.find(o => o.id === arg)', id)
      expect(one.beams.length).toBe(1)
      const c = { x: one.x + one.width / 2, y: one.y + one.height / 2 }
      await L.page.keyboard.press('Escape'); await L.click(c); await L.click(c)         // its bay
      expect((await L.bayOf(id)).idx).toBe(0)
      const h0 = await L.S('return S.getState().historyIndex')
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      expect([await L.S('return S.getState().objects.some(o => o.id === arg)', id), (await L.S('return S.getState().historyIndex')) - h0]).toEqual([false, 1])
      const notice = L.page.locator('[aria-label="Notice"]')
      expect(await notice.textContent()).toMatch(/Row deleted/)
      await notice.getByRole('button', { name: 'Undo' }).click(); await L.page.waitForTimeout(300)
      expect(await L.S('return S.getState().objects.some(o => o.id === arg)', id)).toBe(true)
    }, T)

    /* ── Add door ── */
    it('REG-door-tool (click): Add door is a tool — hover a wall, the preview snaps to its inner face, a click places the type picked (the library types, width typed), Esc ends it', async () => {
      await open()
      const fp = await fpOf(), gs = await L.S('return S.getState().gridSize || 40'), wt = (fp.wallThicknessFt || 0.25) * gs
      await L.click({ x: fp.x + fp.width * 0.3, y: fp.y })                              // the building, by its top wall
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Add door' }).click(); await L.page.waitForTimeout(150)
      const bar = L.page.locator('[data-mode-bar="door"]')
      expect([await L.S('return S.getState().activeTool'), await bar.getByRole('group', { name: 'Door type' }).getByRole('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))]).toEqual(['door', ['Man Door', 'Dock Door', 'Drive-in Door']])
      // the top wall from outside: the preview against the inner face
      const outside = await L.toScreen({ x: fp.x + fp.width * 0.4, y: fp.y - wt * 0.5 })
      await L.page.mouse.move(outside.x, outside.y); await L.page.waitForTimeout(150)
      const preview = await L.page.evaluate(() => !!window.Konva.stages[0].findOne('.door-preview'))
      expect(preview).toBe(true)
      const n0 = await L.S('return S.getState().objects.length'), h0 = await L.S('return S.getState().historyIndex')
      await L.page.mouse.click(outside.x, outside.y); await L.page.waitForTimeout(200)
      const d1 = await L.S('const o = S.getState().objects; return o[o.length - 1]')
      expect([d1.type, Math.round(d1.width), Math.abs(d1.y - (fp.y + wt)) < 1, (await L.S('return S.getState().objects.length')) - n0, (await L.S('return S.getState().historyIndex')) - h0, await L.S('return S.getState().activeTool')])
        .toEqual(['struct_loading_dock', 9 * gs, true, 1, 1, 'door'])
      // Man door, typed 5 ft, on the left wall from inside
      await bar.getByRole('button', { name: 'Man Door' }).click()
      await bar.getByLabel('Door width (ft)').fill('5'); await bar.getByLabel('Door width (ft)').press('Enter')
      const inside = await L.toScreen({ x: fp.x + wt * 1.5, y: fp.y + fp.height * 0.5 })
      await L.page.mouse.move(inside.x, inside.y); await L.page.waitForTimeout(150); await L.page.mouse.click(inside.x, inside.y); await L.page.waitForTimeout(200)
      const d2 = await L.S('const o = S.getState().objects; return o[o.length - 1]')
      expect([d2.type, Math.round(d2.width), d2.rotation % 180 === 90, Math.abs(d2.x + d2.width / 2 - d2.height / 2 - (fp.x + wt)) < 1]).toEqual(['struct_egress', 5 * gs, true, true])   // 5 ft along the wall, against its inner face
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(150)
      expect([await L.S('return S.getState().activeTool'), await bar.count(), await L.page.evaluate(() => !!window.Konva.stages[0].findOne('.door-preview'))]).toEqual(['pan', 0, false])   // Esc: back to Pan
    }, T)

    it('REG-door-types (click): the door tool offers Man door · Dock door · Drive-in door, in that order; each places at its own width — Man 3 ft, Dock 9 ft, Drive-in 12 ft overhead', async () => {
      await open()
      const fp = await fpOf(), gs = await L.S('return S.getState().gridSize || 40'), wt = (fp.wallThicknessFt || 0.25) * gs
      await L.click({ x: fp.x + fp.width * 0.3, y: fp.y })
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Add door' }).click(); await L.page.waitForTimeout(150)
      const bar = L.page.locator('[data-mode-bar="door"]'), seg = bar.getByRole('group', { name: 'Door type' }).getByRole('button')
      expect(await seg.evaluateAll(bs => bs.map(b => b.textContent.trim()))).toEqual(['Man door', 'Dock door', 'Drive-in door'])
      const place = async (name, fx) => {
        await bar.getByRole('button', { name }).click()
        const width = await bar.getByLabel('Door width (ft)').inputValue()
        const p = await L.toScreen({ x: fp.x + fp.width * fx, y: fp.y - wt * 0.5 })
        await L.page.mouse.move(p.x, p.y); await L.page.waitForTimeout(150); await L.page.mouse.click(p.x, p.y); await L.page.waitForTimeout(200)
        const d = await L.S('const o = S.getState().objects; return o[o.length - 1]')
        return [width, d.type, Math.round(d.width / gs), d.label, d.meta?.doorType ?? null, Math.abs(d.y - (fp.y + wt)) < 1]
      }
      expect(await place('Man Door', 0.25)).toEqual(['3', 'struct_egress', 3, 'Man Door', null, true])
      expect(await place('Dock Door', 0.5)).toEqual(['9', 'struct_loading_dock', 9, 'Dock Door', 'roll-up', true])
      expect(await place('Drive-in Door', 0.75)).toEqual(['12', 'struct_drive_in', 12, 'Drive-in Door', 'overhead', true])
      await L.page.keyboard.press('Escape')
    }, T)

    /* ── 1: the Row group ends with its tool ── */
    it('REG-row-group-done (click): the purple group outline shows only while the Row group tool is on; Done (primary, 28 high, at the right of the mode bar), Esc, ✕ or another tool end the mode — the outline gone at once, nothing selected, no bar', async () => {
      await open()
      const ids = await openRacks()
      const outline = () => L.page.evaluate(() => { const g = window.Konva.stages[0].findOne('.row-group-outline'); return g ? g.find('Rect').length : 0 })
      const mode = L.page.locator('[data-mode-bar="row-group"]')
      const start = async () => {
        const a = await pairPoints(ids[0])
        await L.click(a.far)
        await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Row group' }).click(); await L.page.waitForTimeout(200)
        expect([await L.groupRows(), (await outline()) > 0, await mode.count()]).toEqual([1, true, 1])
      }
      const ended = async () => { await L.page.waitForTimeout(150); expect([await L.groupRows(), await outline(), await L.S('return S.getState().selectedIds.length'), await L.bar(), await mode.count()]).toEqual([0, 0, 0, null, 0]) }
      await start()
      const done = mode.getByRole('button', { name: 'Done' })
      const look = await done.evaluate(b => { const r = b.getBoundingClientRect(), bar = b.closest('[data-mode-bar]').getBoundingClientRect(), close = b.parentElement.querySelector('[aria-label="Clear the row group"]').getBoundingClientRect(); return { h: Math.round(r.height), right: r.left > bar.left + bar.width / 2, beforeClose: r.right <= close.left + 1, cls: b.className } })
      expect(look).toEqual({ h: 28, right: true, beforeClose: true, cls: 'st-primary' })
      await done.click(); await ended()
      await start(); await L.page.keyboard.press('Escape'); await ended()
      await start(); await mode.getByRole('button', { name: 'Clear the row group' }).click(); await ended()
      await start(); await L.page.mouse.move(5, 890); await L.page.keyboard.press('f'); await ended()    // another tool
      await L.page.keyboard.press('Escape')
    }, T)

    /* ── 2: a back-to-back pair is ONE object ── */
    it('REG-pair-one-object (click): a bay deleted on one side leaves the pair ONE object — that bay empty on that side, no positions there; a drag then moves the pair as one', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 4)
      const a = await pairPoints(ids[0]), gs = await L.S('return S.getState().gridSize || 40')
      const cap = () => L.S('const st = S.getState(); return H.columnRectsOf ? st.objects.filter(o => o.id === arg).length : 0', a.r.id)
      await L.click(a.half); await L.click(a.half)
      const b = await L.bayOf(a.r.id)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      const r1 = await L.S('return S.getState().objects.find(o => o.id === arg)', a.r.id)
      expect([await L.S('return S.getState().objects.filter(o => o.pieceOf === arg).length', a.r.id), await cap(), r1.beams.length, !!r1.bayEmpty?.[b.side]?.[b.idx], !!r1.bayEmpty?.[1 - b.side]?.[b.idx]]).toEqual([0, 1, a.r.beams.length, true, false])
      // the row, then a drag across: the pair moves as one, its empty side with it
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(100)
      const t = ((a.r.rotation || 0) * Math.PI) / 180, ax = -Math.sin(t), ay = Math.cos(t)
      await L.click(a.far)
      await L.drag(a.far, { x: a.far.x + ax * gs * 1.5, y: a.far.y + ay * gs * 1.5 })
      const r2 = await L.S('return S.getState().objects.find(o => o.id === arg)', a.r.id)
      expect([r2.x !== r1.x || r2.y !== r1.y, r2.beams.length, JSON.stringify(r2.bayEmpty), await L.S('return S.getState().objects.filter(o => o.pieceOf === arg).length', a.r.id)]).toEqual([true, r1.beams.length, JSON.stringify(r1.bayEmpty), 0])
    }, T)

    it('REG-pair-join-load (click): an older layout whose pair a one-side delete cut into pieces opens with them joined — one pair, those bays empty on the side they lost; it selects and drags as one', async () => {
      const B = await import('./handCheck/browser.js'), F = await import('../../generate/faceReach')
      const data = JSON.parse(B.fixture(name)), gs = data.gridSize || 40
      const pairs = data.objects.filter(o => o.type === 'rack_double_row' && o.beams.length >= 6)
      const r = pairs[Math.floor(pairs.length / 2)]
      let k = 0
      const pieces = F.piecesFromStates(r, r.beams.map((_, i) => (i === 2 || i === 3 ? 'A' : 'D')), { gridSize: gs, newId: () => 'old-' + (++k) })
      expect(pieces.map(p => p.type)).toEqual(['rack_double_row', 'rack_row', 'rack_double_row'])   // as the old delete left them
      data.objects = data.objects.flatMap(o => (o.id === r.id ? pieces : [o]))
      L = await B.openLayout(app, JSON.stringify(data))
      const now = await L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg)', r.id)
      expect([now.length, now[0].type, now[0].beams.length, [2, 3].map(i => [!!now[0].bayEmpty?.[0]?.[i], !!now[0].bayEmpty?.[1]?.[i]])]).toEqual([1, 'rack_double_row', r.beams.length, [[false, true], [false, true]]])
      // one object: a click selects it alone; a drag across moves it whole
      const a = await pairPoints(r.id), t = ((r.rotation || 0) * Math.PI) / 180
      await L.click(a.far)
      expect((await levelOf()).ids).toEqual([r.id])
      await L.drag(a.far, { x: a.far.x - Math.sin(t) * gs * 1.5, y: a.far.y + Math.cos(t) * gs * 1.5 })
      const moved = await L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg)', r.id)
      expect([moved.length, moved[0].x !== now[0].x || moved[0].y !== now[0].y]).toEqual([1, true])
    }, T)

    /* ── 3: the bay selection is a set ── */
    it('REG-bay-toggle (click): Shift+click on a selected bay takes it off — the selection is a set, never one bay twice (the darker double fill)', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 4)
      const a = await pairPoints(ids[0])
      const entries = () => L.S('const st = S.getState(); const m = st.activeBaySelection.length ? st.activeBaySelection : st.objects.filter(o => o.activeBayIdx != null && st.selectedIds.includes(o.id)).map(o => ({ objId: o.id, bayIdx: o.activeBayIdx, side: o.activeBaySide })); return m.map(e => e.objId + ":" + e.bayIdx + ":" + (e.side ?? "both"))')
      const bayKey = (e) => e.split(':').slice(0, 2).join(':')
      await L.click(a.half); await L.click(a.half)                                     // a bay, this side
      const one = await entries()
      expect(one.length).toBe(1)
      await L.shiftClick(a.far)                                                         // another: two
      expect((await entries()).length).toBe(2)
      await L.shiftClick(a.half)                                                        // the first again: off
      const off = await entries()
      expect([off.length, off.includes(one[0])]).toEqual([1, false])
      await L.shiftClick(a.half)                                                        // on again — once
      const on = await entries()
      expect([on.length, new Set(on.map(bayKey)).size]).toEqual([2, 2])
      // the flue picks the bay on both sides; Shift+click on one half of it takes it off — never a second entry
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(100)
      await L.click(a.flue); await L.click(a.flue)
      const both = await entries()
      expect([both.length, both[0].endsWith(':both')]).toEqual([1, true])
      await L.shiftClick(a.far)
      await L.shiftClick(a.half)
      const e2 = await entries(), keys = e2.map(bayKey)
      expect([new Set(keys).size === keys.length, keys.includes(bayKey(both[0]))]).toEqual([true, false])
    }, T)

    /* ── 4: a press and drag on a selected row moves it ── */
    it('REG-row-drag (click): a press and drag on the selected row — or a selected pair from its flue — moves it at the row level (no bay); only a click without movement drills to the bay; a bay run needs a bay picked first', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 4)
      const a = await pairPoints(ids[0]), gs = await L.S('return S.getState().gridSize || 40')
      const t = ((a.r.rotation || 0) * Math.PI) / 180, ax = -Math.sin(t), ay = Math.cos(t)
      const pos = () => L.S('const o = S.getState().objects.find(x => x.id === arg); return [o.x, o.y]', a.r.id)
      await L.click(a.far)                                                              // the row selected
      const p0 = await pos()
      await L.drag(a.far, { x: a.far.x + ax * gs * 1.5, y: a.far.y + ay * gs * 1.5 })
      const p1 = await pos(), lv1 = await levelOf()
      expect([p1[0] !== p0[0] || p1[1] !== p0[1], lv1.one, lv1.multi, lv1.ids.includes(a.r.id)]).toEqual([true, [], 0, true])
      // the selected pair from its flue
      const b = await pairPoints(a.r.id)
      await L.drag(b.flue, { x: b.flue.x - ax * gs * 1.5, y: b.flue.y - ay * gs * 1.5 })
      const p2 = await pos(), lv2 = await levelOf()
      expect([p2[0] !== p1[0] || p2[1] !== p1[1], lv2.one, lv2.multi, lv2.ids.includes(a.r.id)]).toEqual([true, [], 0, true])
      // a click without movement on the selected row: its bay
      const c = await pairPoints(a.r.id)
      await L.click(c.far)
      expect((await levelOf()).one).toEqual([a.r.id])
    }, T)

    /* ── 5: Pan is the home tool ── */
    it('REG-pan-home (click): Pan is the home tool — a tool ends back to it; with Pan a click selects what is under the cursor, a click on the blank floor the building, a drag pans; Esc or a click outside the building clears; with Select (V) a drag on the floor box-selects rows', async () => {
      await open()
      const tool = () => L.S('return S.getState().activeTool'), view = () => L.S('const s = S.getState(); return [s.panX, s.panY]')
      await L.page.mouse.move(5, 890)
      await L.page.keyboard.press('f'); await L.page.waitForTimeout(80); await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(100)
      expect(await tool()).toBe('pan')
      const fp = await fpOf(), ids = await openRacks(), a = await pairPoints(ids[0])
      await L.click(a.far)
      expect([(await levelOf()).ids.includes(a.r.id), await tool()]).toEqual([true, 'pan'])
      const floor = await L.floorPoint({ x: fp.x + fp.width * 0.5, y: fp.y + fp.height * 0.5 })
      await L.click(floor)
      expect(await L.selected()).toEqual([fp.type])
      const v0 = await view()
      await L.drag(floor, { x: floor.x + fp.width * 0.04, y: floor.y + fp.height * 0.04 })
      const v1 = await view()
      expect([v1[0] !== v0[0] || v1[1] !== v0[1], await L.selected()]).toEqual([true, [fp.type]])      // panned; still the building
      await L.page.keyboard.press('Escape'); await L.page.waitForTimeout(100)
      expect([await L.selected(), await tool()]).toEqual([[], 'pan'])
      // a click outside the building (on the open canvas) clears
      await L.click(floor)
      const out = await L.S('const st = S.getState(), f = st.objects.find(o => o.id === arg); return [{ x: f.x - f.width * 0.03, y: f.y + f.height / 2 }, { x: f.x + f.width * 1.03, y: f.y + f.height / 2 }, { x: f.x + f.width / 2, y: f.y - f.height * 0.03 }, { x: f.x + f.width / 2, y: f.y + f.height * 1.03 }]', fp.id)
      let outside = null
      for (const w of out) { const p = await L.toScreen(w); if (await L.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p)) { outside = w; break } }
      expect(outside).toBeTruthy()
      await L.click(outside)
      expect(await L.selected()).toEqual([])
      // Select: a drag on the floor selects rows
      await L.page.mouse.move(5, 890); await L.page.keyboard.press('v'); await L.page.waitForTimeout(80)
      const s1 = await L.floorPoint({ x: fp.x + fp.width * 0.55, y: fp.y + fp.height * 0.55 })
      await L.drag(s1, { x: fp.x + fp.width * 0.9, y: fp.y + fp.height * 0.9 })
      const box = await L.selected()
      expect([box.length > 0, box.every(t => /^rack_/.test(t))]).toEqual([true, true])
    }, T)

    /* ── 6: a building is resized only from its handles ── */
    /** The building's side handle whose square and a point `outFt` along its wall's normal (inward < 0) are on the
     *  open canvas: { i, at (world), n (outward unit normal) }. */
    const sideHandle = async (outFt) => L.S(`const st = S.getState(), f = st.objects.find(o => /^fp_/.test(o.type)), v = f.fpVerts, gs = st.gridSize || 40
      const cx = f.x + f.width / 2, cy = f.y + f.height / 2, out = []
      for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), n = horiz ? { x: 0, y: Math.sign(m.y - cy) || 1 } : { x: Math.sign(m.x - cx) || 1, y: 0 }
        out.push({ i, at: m, n, to: { x: m.x + n.x * arg * gs, y: m.y + n.y * arg * gs } }) }
      return out`, outFt).then(async (list) => {
      for (const h of list) {
        let ok = true
        for (const w of [h.at, h.to]) { const p = await L.toScreen(w); if (!(await L.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p))) ok = false }
        if (ok) return h
      }
      return null
    })
    it('REG-wall-no-resize (click): a press on a wall selects or moves the building, never resizes it; it resizes only from its handles — the corner and side squares shown while it is selected, each hit within 8 screen px', async () => {
      await open()
      const fp = await fpOf(), gs = await L.S('return S.getState().gridSize || 40')
      const size = () => L.S('const f = S.getState().objects.find(o => o.id === arg); return [Math.round(f.width), Math.round(f.height)]', fp.id)
      const s0 = await size()
      const wall = { x: fp.x + fp.width * 0.3, y: fp.y }
      await L.drag(wall, { x: wall.x, y: wall.y + 2 * gs })                            // a press on the wall, dragged inward
      expect([await size(), await L.selected()]).toEqual([s0, [fp.type]])               // not resized
      const handles = await L.page.evaluate(() => window.Konva.stages[0].find(n => /^fphandle:/.test(n.name() || '')).length)
      expect(handles).toBeGreaterThanOrEqual(8)
      // 6 px along the wall from a side square (outside its 8 px hit, still on the wall): a press there moves, never resizes
      const h = await sideHandle(3)
      expect(h).toBeTruthy()
      const p = await L.toScreen(h.at)
      const off = { x: p.x + (h.n.y ? 6 : 0), y: p.y + (h.n.x ? 6 : 0) }
      await L.page.mouse.move(off.x, off.y); await L.page.mouse.down(); await L.page.mouse.move(off.x + h.n.x * 40, off.y + h.n.y * 40, { steps: 6 }); await L.page.mouse.up(); await L.page.waitForTimeout(250)
      expect(await size()).toEqual(s0)
      expect(await L.selected()).toEqual([fp.type])
      // on the square: its wall moves out 3 ft (to the screen px the mouse lands on)
      const h2 = await sideHandle(3), z = await L.S('return S.getState().zoom')
      await L.drag(h2.at, h2.to)
      const s1 = await size(), grew = h2.n.x ? s1[0] - s0[0] : s1[1] - s0[1]
      expect(Math.abs(grew - 3 * gs) <= 1.5 / z).toBe(true)
    }, T)

    /* ── 7: shrinking the building takes the bays that no longer fit ── */
    it('REG-shrink-bays (click): shrinking the building from a side handle removes the bays that no longer fit with the wall clearance — whole bays, rows fully outside — keeps zones and columns (flagged in Check layout); one undo step, "N bays removed" with Undo. Enlarging adds nothing: "Building larger", Fill new space fills the new floor', async () => {
      await open()
      const fp = await fpOf()
      const count = () => L.S('const o = S.getState().objects; return { bays: o.filter(x => x.type === "rack_row" || x.type === "rack_double_row").reduce((t, x) => t + x.beams.length, 0), racks: o.filter(x => /^rack_/.test(x.type)).length, zones: o.filter(x => /^zone_/.test(x.type)).length, grids: o.filter(x => x.type === "column_grid").length }')
      const size = () => L.S('const f = S.getState().objects.find(o => o.id === arg); return [Math.round(f.width), Math.round(f.height)]', fp.id)
      const notice = L.page.locator('[role="status"][aria-label="Notice"]')
      await L.click({ x: fp.x + fp.width * 0.3, y: fp.y })                             // the building, by its wall
      const c0 = await count(), s0 = await size(), h0 = await L.S('return S.getState().historyIndex')
      const h = await sideHandle(-25)
      expect(h).toBeTruthy()
      await L.drag(h.at, h.to); await L.page.waitForTimeout(200)
      const c1 = await count()
      expect([c1.bays < c0.bays, c1.zones, c1.grids, await L.S('return S.getState().historyIndex') - h0]).toEqual([true, c0.zones, c0.grids, 1])
      const text = await notice.textContent()
      expect(text).toMatch(new RegExp('^' + (c0.bays - c1.bays) + ' bays? removed'))
      expect(await notice.getByRole('button', { name: 'Undo' }).count()).toBe(1)
      // what is past the new walls stays, flagged
      const flagged = await L.S('const st = S.getState(); return st.objects.some(o => o.type === "column_grid") ? LC.checkLayout(st.objects, { gridSize: st.gridSize || 40 }).warnings.filter(w => w.kind === "outside-item").length : 1')
      expect(flagged).toBeGreaterThan(0)
      // one undo: the building and every bay back
      await L.page.mouse.move(5, 890); await L.page.keyboard.press('Control+z'); await L.page.waitForTimeout(250)
      expect([await count(), await size()]).toEqual([c0, s0])
      // enlarged: nothing added; the notice offers Fill new space, which fills it
      if (!(await L.selected()).length) await L.click({ x: fp.x + fp.width * 0.3, y: fp.y })
      const g = await sideHandle(20)
      expect(g).toBeTruthy()
      await L.drag(g.at, g.to); await L.page.waitForTimeout(200)
      expect([(await count()).racks, await notice.textContent()]).toEqual([c0.racks, expect.stringMatching(/^Building larger/)])
      await notice.getByRole('button', { name: 'Fill new space' }).click(); await L.page.waitForTimeout(400)
      expect([(await count()).racks > c0.racks, await L.S('return S.getState().activeTool')]).toEqual([true, 'fill_racking'])
      await L.page.keyboard.press('Escape')
    }, T)

    /* ── racking areas: invisible by default ── */
    it('REG-area-visible (click): a racking area is drawn only while Fill racking is on, or while it is hovered or selected; Esc after a fill leaves nothing drawn', async () => {
      await open()
      const fp = await fpOf()
      // room for a fill: a box of rows on the floor, deleted
      const s1 = await L.floorPoint({ x: fp.x + fp.width * 0.55, y: fp.y + fp.height * 0.55 })
      const far = { x: fp.x + fp.width * 0.92, y: fp.y + fp.height * 0.92 }
      await L.drag(s1, far); await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(300)
      await L.page.keyboard.press('f'); await L.page.waitForTimeout(100)
      const f0 = await L.floorPoint({ x: fp.x + fp.width * 0.6, y: fp.y + fp.height * 0.6 })
      await L.drag(f0, { x: fp.x + fp.width * 0.88, y: fp.y + fp.height * 0.88 }); await L.page.waitForTimeout(300)
      const area = await L.S('const a = S.getState().objects.filter(o => o.type === "racking_area"); return a[a.length - 1] || null')
      expect(area).toBeTruthy()
      const drawn = () => L.page.evaluate((id) => window.Konva.stages[0].find(n => (n.name() || '').includes(id)).filter(n => n.getClassName() === 'Group' && n.findOne('Rect')).length > 0, area.id)
      expect([await L.S('return S.getState().activeTool'), await drawn()]).toEqual(['fill_racking', true])
      await L.page.keyboard.press('Escape'); await L.page.mouse.move(5, 890); await L.page.waitForTimeout(200)
      expect([await L.S('return S.getState().activeTool'), await drawn()]).toEqual(['pan', false])   // Esc: back to Pan
      // hovered on its edge: drawn; away: not; picked on its edge: drawn
      const edge = await L.toScreen({ x: area.x + area.width / 2, y: area.y })
      await L.page.mouse.move(edge.x, edge.y); await L.page.waitForTimeout(200)
      const onHover = await drawn()
      await L.page.mouse.move(5, 890); await L.page.waitForTimeout(200)
      const away = await drawn()
      await L.page.mouse.click(edge.x, edge.y); await L.page.waitForTimeout(200)
      expect([onHover, away, (await L.S('return S.getState().selectedIds')).includes(area.id), await drawn()]).toEqual([true, false, true, true])
    }, T)

    /* ── E: pieces a wide gap apart stay in the Row group ── */
    it('REG-section-group-wide (click): a hand row split by deleting a run of bays wider than 10.5′ (picked by a bay run) is two pieces; the Row group it was in ended with V', async () => {
      await open()
      const ids = await openRacks('rack_double_row', 8)
      const a = await pairPoints(ids[0])
      // a hand row: the row copied and pasted in place (Ctrl+C, Ctrl+Shift+V) — the copy carries no generated row stamps
      await L.click(a.far)
      await L.page.keyboard.press('Control+c'); await L.page.keyboard.press('Control+Shift+v'); await L.page.waitForTimeout(300)
      let copy = await L.S('const st = S.getState(); return st.objects.find(o => o.id === st.selectedIds[0])')
      const across = ((copy.rotation || 0) % 180) ? 'ArrowRight' : 'ArrowDown'
      for (let i = 0; i < 9; i++) await L.page.keyboard.press('Shift+' + across)
      await L.page.waitForTimeout(200)
      copy = await L.S('return S.getState().objects.find(o => o.id === arg)', copy.id)
      expect([copy.id !== a.r.id, copy.rowIndex == null || copy.genSection == null]).toEqual([true, true])
      // into a Row group; another tool (V) ends it (STUDIO.md §7) — the split below leaves no group behind
      await L.page.locator('[data-selection-bar]').getByRole('button', { name: 'Row group' }).click(); await L.page.waitForTimeout(150)
      await L.page.keyboard.press('v'); await L.page.waitForTimeout(100)
      expect(await L.groupRows()).toBe(0)
      // a run of four middle bays (over 10.5′), both sides: the flue line
      const t = ((copy.rotation || 0) * Math.PI) / 180, cx = copy.x + copy.width / 2, cy = copy.y + copy.height / 2
      const at = (fx) => ({ x: cx + (copy.width * fx) * Math.cos(t), y: cy + (copy.width * fx) * Math.sin(t) })
      await L.click(at(-0.15)); await L.click(at(-0.15))                                // the row, then its bay (both sides)
      await L.drag(at(-0.15), at(0.2)); await L.page.waitForTimeout(150)               // a bay picked: the drag is a bay run
      expect((await L.S('return S.getState().activeBaySelection.length'))).toBeGreaterThanOrEqual(4)
      await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(400)
      const pieces = await L.S('return S.getState().objects.filter(o => o.id === arg || o.pieceOf === arg).map(o => o.id)', copy.id)
      const inGroup = await L.S('const st = S.getState(), rows = RW.rowsOf(st.objects, st.gridSize || 40), k = RG.useRowGroup.getState().keys.map(x => RW.resolveKey(rows, x)); return arg.map(id => k.includes(RW.rowOfRack(rows, id)))', pieces)
      expect([pieces.length, inGroup.length]).toEqual([2, 2])
    }, T)

    /* ── H: notices fade by themselves ── */
    it('REG-notice-timers (click): plain info goes after 5 s, a notice with Undo after 8 s, the pointer over one pauses it, a question stays until answered', async () => {
      await open()
      await L.page.clock.install()
      const notice = L.page.locator('[aria-label="Notice"]')
      const tick = async (ms) => { await L.page.clock.runFor(ms); await L.page.waitForTimeout(50) }
      // plain info: Ctrl+A's note on what it kept
      await L.page.mouse.move(5, 890); await L.page.keyboard.press('Control+a'); await L.page.waitForTimeout(100)
      expect(await notice.count()).toBe(1)
      await tick(4700); expect(await notice.count()).toBe(1)
      await tick(600); expect(await notice.count()).toBe(0)
      // the pointer over it pauses the clock
      await L.page.keyboard.press('Escape'); await L.page.keyboard.press('Control+a'); await L.page.waitForTimeout(100)
      await tick(1000); await notice.hover(); await tick(7000)
      expect(await notice.count()).toBe(1)
      await L.page.mouse.move(5, 890); await tick(3700); expect(await notice.count()).toBe(1)
      await tick(600); expect(await notice.count()).toBe(0)
      // with Undo: 8 s (a building deleted)
      await L.page.keyboard.press('Escape')
      const fp = await fpOf()
      await L.click({ x: fp.x + fp.width / 2, y: fp.y }); await L.page.keyboard.press('Delete'); await L.page.waitForTimeout(100)
      expect(await notice.locator('button', { hasText: 'Undo' }).count()).toBe(1)
      await tick(7700); expect(await notice.count()).toBe(1)
      await tick(600); expect(await notice.count()).toBe(0)
      // a question stays until it is answered
      await L.S('AP.useAreaPrompt.setState({ question: { text: "Replace the racks in this area?" } })')
      await tick(30000)
      const q = L.page.locator('[aria-label="Racking area question"]')
      expect(await q.count()).toBe(1)
      await q.getByRole('button', { name: 'Cancel' }).click(); await L.page.waitForTimeout(100)
      expect(await q.count()).toBe(0)
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