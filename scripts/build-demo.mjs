// Builds docs/demo/demo-warehouse.wcad: the 5-minute demo project (docs/RESUME.md).
// The app in Chromium (src/__test__/plan/handCheck/browser.js), the same functions its tools call: the R1 building
// (240' x 120', 25' x 30' column grid, from the older-horizontal fixture), its racks cleared; a row of dock doors and a
// man door on the bottom wall; two sections (Fast pick on the left, Bulk) each filled with the Fill section action; a
// second elevation type (3 levels) on Fast pick; a ceiling (32' clear, sprinklers at 30'). Saved through the app's own serializer.
//   node scripts/build-demo.mjs            (writes the file, then screenshots to docs/demo/)
import { writeFileSync } from 'node:fs'
import { startApp, openLayout, fixture } from '../src/__test__/plan/handCheck/browser.js'

const OUT = new URL('../docs/demo/', import.meta.url)
const app = await startApp()
try {
  const L = await openLayout(app, fixture('older-horizontal'))
  const json = await L.S(`return (async () => {
    const DT = await import('/src/utils/doorTool.js'), SA = await import('/src/utils/sectionAreas.js'), FT = await import('/src/utils/fillTool.js')
    let seq = 0; const nanoid = () => 'demo' + (++seq).toString(36) + Math.random().toString(36).slice(2, 8)
    const PR = await import('/src/utils/project.js'), LC = await import('/src/utils/layoutCheck.js')
    const st0 = S.getState(), gs = st0.gridSize || 40, T0 = st0.elevations
    // the building and its column grid only
    const keep = st0.objects.filter(o => /^fp_/.test(o.type) || o.type === 'column_grid' || o.type === 'elevation_types')
    // the split between the sections: the first that Check passes with no error (Fill does not dodge a column with its
    // frames — docs/RESUME.md, known gaps; a section's edge near a wall snaps onto it, so only the split moves them)
    let tried = []
    for (const splitFt of [100, 102, 104, 98, 106, 96, 108, 110, 94, 112]) {
    seq = 0
    S.setState({ objects: keep, elevations: T0, selectedIds: [] })
    const fp = keep.find(o => /^fp_/.test(o.type)), ft = gs
    // doors on the bottom wall: 8 dock doors at 14' centres, then a man door near the right corner
    const bottom = fp.y + fp.height, types = DT.doorTypes(), dock = types.find(t => t.id === 'struct_loading_dock'), man = types.find(t => t.id === 'struct_egress')
    const add = (o) => S.getState().addObject(o)
    for (let i = 0; i < 8; i++) {
      const at = DT.doorAt(S.getState().objects, { x: fp.x + (40 + i * 14) * ft, y: bottom - 0.1 * ft }, dock, gs, 2 * ft)
      if (at) add(DT.doorObject(at, dock, nanoid))
    }
    const atMan = DT.doorAt(S.getState().objects, { x: fp.x + (fp.width / ft - 12) * ft, y: bottom - 0.1 * ft }, man, gs, 2 * ft)
    if (atMan) add(DT.doorObject(atMan, man, nanoid))
    // two sections: Fast pick (left, to the split), Bulk (the rest)
    const wt = (fp.wallThicknessFt || 0.25) * ft, x0 = fp.x + wt, y0 = fp.y + wt, x1 = fp.x + fp.width - wt, y1 = fp.y + fp.height - wt
    const split = fp.x + splitFt * ft
    const s2 = SA.rectSection({ x: x0, y: y0, w: split - x0, h: y1 - y0 }, S.getState().objects); s2.id = nanoid(); s2.label = 'Fast pick'; add(s2)
    const s1 = SA.rectSection({ x: split, y: y0, w: x1 - split, h: y1 - y0 }, S.getState().objects); s1.id = nanoid(); s1.label = 'Bulk'; add(s1)
    const n1 = FT.fillWholeSection(S, s1.id), n2 = FT.fillWholeSection(S, s2.id)
    // Fast pick: its own elevation type (one level fewer)
    const T = S.getState().elevations, base = T.types.find(t => t.id === T.defaultId) || T.types[0]
    const fast = { ...base, id: 'fast-pick', name: 'Fast pick', levels: base.levels.slice(0, Math.max(2, base.levels.length - 1)) }
    S.setState({ elevations: { ...T, types: [...T.types, fast] } })
    const inFast = (o) => /^rack_/.test(o.type) && SA.contains(S.getState().objects.find(x => x.id === s2.id), o.x + o.width / 2, o.y + o.height / 2)
    S.setState({ objects: S.getState().objects.map(o => (inFast(o) ? { ...o, elevType: fast.id } : o)) })
    S.getState().commitObjectUpdate(s2.id, {})
    // the ceiling: 32' clear, sprinklers at 30'
    if (!PR.defaultCeiling(PR.projectOf(S.getState().elevations))) PR.addCeiling(S, { name: 'Main', clearHeightIn: 32 * 12, sprinklerIn: 30 * 12 })
    LC.runLayoutCheck(S)
    const res = LC.useLayoutCheck.getState().result, errs = (res?.errors || []).map(i => i.text || i.title)
    tried.push({ splitFt, n1, n2, errs, warnings: (res?.warnings || []).length, reminders: (res?.reminders || []).length })
    if (!errs.length) break
    }
    const st = S.getState()
    const counts = {}; for (const o of st.objects) counts[o.type] = (counts[o.type] || 0) + 1
    return { tried, counts, types: st.elevations.types.map(t => [t.id, t.name, t.levels.length]), json: SL.serializeScene(st) }
  })()`)
  console.log(JSON.stringify({ tried: json.tried, counts: json.counts, types: json.types }))
  writeFileSync(new URL('demo-warehouse.wcad', OUT), json.json)
  // the saved file, opened as a user opens it: the plan fitted, a screenshot
  const D = await openLayout(app, json.json)
  await D.page.keyboard.press('Shift+1').catch(() => {})
  await D.page.waitForTimeout(600)
  await D.page.screenshot({ path: new URL('demo-plan.png', OUT).pathname.replace(/^\/(\w:)/, '$1') })
  const check = await D.S('return import("/src/utils/layoutCheck.js").then(M => { const r = M.useLayoutCheck.getState().result; const sh = r ? M.shownCheck(r, S.getState().elevations) : null; return sh ? { errors: sh.errors.map(i => i.text || i.title), warnings: sh.warnings.map(i => i.text || i.title) } : null })')
  console.log('check', JSON.stringify(check))
  console.log('errors', JSON.stringify(D.errors))
} finally { await app.close() }
