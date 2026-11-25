// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows, the same
// computation): ONE label per rack line — a line cut by cross-aisles too (one number), at its outer start only (fixes-x 2;
// was: one per piece) — at its start end only — the left end of a line running across, the top end of
// one running up and down. A back-to-back pair running across gets one label per line, each beside its own line (R16 by
// the top line, R17 by the bottom one); one running up and down keeps one label for both, "R2–R3", at its top. Drawn like the aisle width labels: a
// size in feet (the Label size — render/labelSize.js), drawings' words style (Plus Jakarta Sans, #767C74). A label never
// overlaps another or a dimension label (the aisle and cross-aisle width labels): it shifts along the line's end, else
// it is left out — never grouped into a range (labels-final). Like every label they are drawing-size and show only while
// 11 px or more on screen (CLAUDE.md Rule 8 — canvas2/minText.js). Pure paint (never listens); hidden with the
// Racking layer, and by the View card's Row numbers (on by default; shown anyway while the Tally drawer or its Pop out is open —
// studio/viewPrefs.js). Each label's Konva name is `rack-line-label`.

import { useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackNumbersNow as rackLinesNow } from '../utils/rackLines'   // (rack-followup 5) every rack's number, the beam lines first
import { layerShown } from '../utils/layers'
import { useViewPrefs } from '../studio/viewPrefs'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes, aisleLabelOps, clearanceOpsAll, clearanceSolids } from '../render/labelOps'
import { runColumnCheck, layoutColumns } from '../generate/usableCapacity'
import { clearanceSource } from './clearanceSource'
import { floorUnit } from './minText'
import { faceAisleLabels } from '../generate/faceAisles'
import { gapShown } from './hitTest'
import { equipmentResolver } from '../utils/equipment'
import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { getColumnCheckView } from '../generate/columnCheckView'
import { useLiveObjects } from './live'
import { MIN_TEXT_PX } from './minText'
import { useTextSizes, textLz } from '../utils/textSizes'
import { checkedNos } from '../studio/tally'
import { lineNamer, lineSections, chipText } from '../utils/lineNames'
import { buildingOutline } from '../utils/floorGeom'
import { pointInPolygon } from '../utils/sectionAreas'
import { useLabelObjects, useLabelsHeld } from './settled'
import { useDragPreview } from './dragPreview'   // (drag-perf-bar)
import { RACK_NUMBER } from '../render/rackFamily'   // (rack-design) the rack numbers' colour

const WORDS = RACK_NUMBER, TICK = '#2E7D5B', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
/** The label's size in drawing units: the aisle labels' 10 at the Label size. */
export const ROW_LABEL_PX = 10
/** The labels' font size (world px) at their label scale `lz` (utils/textSizes.js 'row' — CLAUDE.md Rule 8, the CAD text
 *  model: a real text height, scaling with the drawing like geometry). */
export const rowLabelFs = (lz) => ROW_LABEL_PX / lz
void MIN_TEXT_PX
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The labels to draw (world px): [{ key, text, x, y, w, h, align }] — one per line or pair, at its start, off each other
 *  and off `avoid` (boxes); `fs`: the font size (world px). */
export function rowLabelPlaces(lines, fs, avoid = [], name = (n) => 'R' + n) {
  const groups = new Map()
  // a pair up and down: its two lines one label; across: each line its own (beside its own band)
  for (const l of lines) { const k = l.ids.join(',') + (l.vert ? '' : ':' + l.ws); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l) }
  const h = fs * 1.25, gap = fs * 0.5, placed = [], out = []
  for (const [k, ls] of groups) {
    const nos = ls.map(l => l.no).sort((a, b) => a - b), l0 = ls[0]
    // its name (the BOM tab's numbering — utils/lineNames.js): R6, or per section L2
    const text = nos.length > 1 ? `${name(nos[0])}–${name(nos[nos.length - 1])}` : name(nos[0])
    const w = text.length * fs * 0.62 + fs * 0.3
    const s0 = Math.min(...ls.map(l => l.s0)), s1 = Math.max(...ls.map(l => l.s1)), c = (s0 + s1) / 2, half = (s1 - s0) / 2
    // along the line's end: the middle, then stepping either way while the label still sits beside the end
    const steps = [0]
    for (let d = h; d <= half + h / 2; d += h) steps.push(d, -d)
    let at = null
    for (const d of steps) {
      const b = l0.vert ? { x: c + d - w / 2, y: l0.r0 - gap - h, w, h } : { x: l0.r0 - gap - w, y: c + d - h / 2, w, h }
      if (!placed.some(p => meets(p, b)) && !avoid.some(p => meets(p, b))) { at = b; break }
    }
    // (labels-final, Rule 8) no room beside its end: left out until the zoom gives it room — never grouped into a range
    // (was: collapsed into R10–R13). A back-to-back pair up and down keeps its one R2–R3: it is one object.
    if (!at) continue
    placed.push(at)
    out.push({ key: k, text, nos, ...at, align: l0.vert ? 'center' : 'right', vert: l0.vert, r0: l0.r0, s0, s1 })
  }
  return out
}

/* (rack-followup 5) The numbers of the racks that are not beam racks (rackNumbersNow — a drive-in … a shelving unit),
   placed as the mockup draws them (at the start end, beside the rack) in a SECOND pass: the beam lines' labels are placed
   first, exactly as before (so nothing moves on a layout of beam racks), then these keep clear of them, of the aisle width
   labels, of the rack-to-wall / rack-to-rack face widths (FaceAisleLabels) and of every rack — sliding along their end,
   else left out (Rule 8: labels never overlap). */
function otherAvoid(objects, gs) {
  const out = []
  let profile = null
  try { profile = getColumnCheckView().profile || MHE_PROFILES.reach } catch { profile = MHE_PROFILES.reach }
  const R = equipmentResolver(objects, profile)
  const all = R.single ? faceAisleLabels(objects, gs, { profile }) : R.inUse.flatMap(p => faceAisleLabels(objects, gs, { profile: p }).filter(L => R.of(L.rackId).key === p.key))
  const lz = textLz('aisle', gs)
  for (const L of all) if (gapShown(L, objects, gs, R.of(L.rackId), false)) for (const o of aisleLabelOps(L, lz)) if (o.op === 'rect') out.push({ x: o.x, y: o.y, w: o.w, h: o.h })
  // the aisle and cross-aisle width labels whole — their arrows across the gap too, not only their pills
  out.push(...aisleLabelBoxes(objects, gs, undefined, { whole: true }))
  for (const o of objects) if (typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0) { const f = rackFootprint(o); out.push({ x: f.x, y: f.y, w: f.w, h: f.h }) }
  // the column clearances (a column in an aisle: its distance to the faces either side — ColumnClearanceLabels, the
  // warnings drawn always) and the column squares themselves
  try {
    let pbs = false
    try { pbs = !!getColumnCheckView().pickBothSides } catch { /* the default */ }
    const res = runColumnCheck(objects, { profile, gridSize: gs, pickBothSides: pbs })
    const src = res ? clearanceSource({ aisleBlocks: res.aisleBlocks, columns: layoutColumns(objects, gs), objects, preview: null, gridSize: gs, profile, pickBothSides: pbs }) : null
    if (src && src.blocks?.length && src.cols?.length) {
      const clz = 1 / floorUnit(textLz('clearance', gs))
      for (const ops of clearanceOpsAll(src.blocks, (a) => src.cols[a.columnIndex], clz, gs, false, [], { warnings: true, solids: clearanceSolids(objects, gs) })) for (const o of (Array.isArray(ops) ? ops : [ops])) {
        if (o.op === 'rect' || (o.op === 'text' && o.w > 0)) out.push({ x: o.x, y: o.y, w: o.w, h: o.h })
        // its arrow too (a line across the gap): a number never sits on it
        else if (Array.isArray(o.points) && o.points.length >= 4) { const xs = o.points.filter((_, i) => i % 2 === 0), ys = o.points.filter((_, i) => i % 2 === 1), t = (o.strokeWidth || 1) * 2; out.push({ x: Math.min(...xs) - t, y: Math.min(...ys) - t, w: Math.max(...xs) - Math.min(...xs) + 2 * t, h: Math.max(...ys) - Math.min(...ys) + 2 * t }) }
      }
    }
  } catch { /* no column check: nothing more to keep clear of */ }
  for (const c of layoutColumns(objects, gs)) out.push({ x: c.x, y: c.y, w: c.w, h: c.h })
  return out
}
/** (rack-round2 2) The walls (each side of every building as a band its wall's thickness, both faces) and the zones: a
 *  number of a rack that is not a beam rack never touches or crosses one. */
function wallsAndZones(objects, gs) {
  const out = []
  for (const o of objects) {
    if (typeof o?.type !== 'string') continue
    if (o.type.startsWith('zone_') && o.width > 0 && o.height > 0) out.push({ x: o.x, y: o.y, w: o.width, h: o.height })
    if (!o.type.startsWith('fp_')) continue
    const P = buildingOutline(o), t = (o.wallThicknessFt || 0.25) * gs
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length]
      out.push({ x: Math.min(a.x, b.x) - t, y: Math.min(a.y, b.y) - t, w: Math.abs(b.x - a.x) + 2 * t, h: Math.abs(b.y - a.y) + 2 * t })
    }
  }
  return out
}
/** (rack-round2 2) The numbers of the racks that are not beam racks: the spot a beam rack's takes first (beside the start
 *  end, centred — sliding along it), else beside the other end, else above, else below, each the beam labels' gap off
 *  the rack; a spot that touches a wall, a column, a rack, a zone or another label is not taken (a margin round each);
 *  inside the building before outside it. No spot: left out (Rule 8). */
export function otherLabelPlaces(lines, fs, avoid = [], name = (n) => 'R' + n, objects = [], gs = 40) {
  const h = fs * 1.25, gap = fs * 0.5, m = fs * 0.15, placed = [], out = []
  const blocks = [...avoid, ...wallsAndZones(objects, gs)]
  const fps = objects.filter(o => typeof o?.type === 'string' && o.type.startsWith('fp_')).map(o => buildingOutline(o).map(p => [p.x, p.y]))
  const inside = (b) => fps.some(P => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([x, y]) => pointInPolygon(P, x, y)))
  const clear = (b) => { const g = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }; return !placed.some(p => meets(p, g)) && !blocks.some(p => meets(p, g)) }
  for (const l of lines) {
    const text = name(l.no), w = text.length * fs * 0.62 + fs * 0.3
    const c = (l.s0 + l.s1) / 2, half = (l.s1 - l.s0) / 2
    // the rack's box in world: across a run (s) and along it (r)
    const X0 = l.vert ? l.s0 : l.r0, X1 = l.vert ? l.s1 : l.r1, Y0 = l.vert ? l.r0 : l.s0, Y1 = l.vert ? l.r1 : l.s1
    const cands = []
    const steps = [0]; for (let d = h; d <= half + h / 2; d += h) steps.push(d, -d)
    // 1. the start end (as a beam rack's), sliding along it
    for (const d of steps) cands.push(l.vert ? { x: c + d - w / 2, y: l.r0 - gap - h, w, h, align: 'center' } : { x: l.r0 - gap - w, y: c + d - h / 2, w, h, align: 'right' })
    // 2. the other end
    for (const d of steps) cands.push(l.vert ? { x: c + d - w / 2, y: l.r1 + gap, w, h, align: 'center' } : { x: l.r1 + gap, y: c + d - h / 2, w, h, align: 'right' })
    // 3. above, 4. below (centred over the rack)
    const cx = (X0 + X1) / 2
    cands.push({ x: cx - w / 2, y: Y0 - gap - h, w, h, align: 'center' }, { x: cx - w / 2, y: Y1 + gap, w, h, align: 'center' })
    const ok = cands.filter(clear)
    const at = ok.find(inside) || (ok.length && !fps.some(P => pointInPolygon(P, cx, (Y0 + Y1) / 2)) ? ok[0] : null)
    if (!at) continue
    placed.push(at)
    out.push({ key: l.ids.join(',') + ':' + l.ws, text, nos: [l.no], x: at.x, y: at.y, w: at.w, h: at.h, align: at.align, vert: l.vert, r0: l.r0, s0: l.s0, s1: l.s1 })
  }
  return out
}
/** rowLabelPlaces for every rack's number: the beam lines first (as ever), then the others clear of them (otherAvoid,
 *  otherLabelPlaces). */
export function placeRowLabels(lines, fs, avoid = [], name, objects = [], gs = 40) {
  const beam = lines.filter(l => !l.other), oth = lines.filter(l => l.other)
  const p1 = rowLabelPlaces(beam, fs, avoid, name)
  if (!oth.length) return p1
  return [...p1, ...otherLabelPlaces(oth, fs, [...avoid, ...otherAvoid(objects, gs), ...p1], name, objects, gs)]
}


/** How far the labels `places` reach past building `fp`'s outline box on each side (world px): { top, right, bottom,
 *  left } — what runs outside a wall (the column chain, the door chain) steps out past them. */
export function rowReach(fp, places) {
  const r = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!fp || !places?.length) return r
  const p = buildingOutline(fp), x0 = Math.min(...p.map(q => q.x)), x1 = Math.max(...p.map(q => q.x)), y0 = Math.min(...p.map(q => q.y)), y1 = Math.max(...p.map(q => q.y))
  for (const q of places) {
    if (q.x < x0 && q.y + q.h > y0 && q.y < y1) r.left = Math.max(r.left, x0 - q.x)
    if (q.y < y0 && q.x + q.w > x0 && q.x < x1) r.top = Math.max(r.top, y0 - q.y)
    if (q.x + q.w > x1 && q.y + q.h > y0 && q.y < y1) r.right = Math.max(r.right, q.x + q.w - x1)
    if (q.y + q.h > y1 && q.x + q.w > x0 && q.x < x1) r.bottom = Math.max(r.bottom, q.y + q.h - y1)
  }
  return r
}

/** The labels as the canvas draws them now, for a layout that must keep clear of them (the column chain, the door chain):
 *  [] when they are not shown. */
export function useRowPlaces(on) {
  const objects = useLabelObjects()   // (drag-perf-bar) held during a drag, placed once on the drop (settled.js)
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const rowsShown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize), sizes = useTextSizes(s => s.sizes)
  const fs = rowLabelFs(textLz('row', gs, null, sizes))
  return useMemo(() => {
    if (!on || !rowsShown || !layerShown(layers, 'racking')) return []
    const lines = rackLinesNow(objects, gs)
    return lines.length ? placeRowLabels(lines, fs, aisleLabelBoxes(objects, gs, labelSize), lineNamer(objects, T, gs), objects, gs) : []
  }, [on, rowsShown, layers, objects, gs, fs, labelSize, T, sizes])
}

/** (rack-round2 4) Its children moved by the drag's offset, live — the moving rack's own number goes with it. */
function DragOffset({ children }) {
  const dx = useDragPreview(st => st.dx), dy = useDragPreview(st => st.dy)
  return <Group x={dx || 0} y={dy || 0} listening={false}>{children}</Group>
}

export function RackLineLabels() {
  // where the racks are drawn now — a drag moves them before the store (live.js); (drag-perf-bar) held during a drag that
  // does not carry everything, placed once on the drop (settled.js)
  const objects = useLabelObjects()
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const shown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  // (Rule 8, labels-final) placed and drawn at their natural drawing size; under 11 px on screen they hide (minText)
  const sizes = useTextSizes(s => s.sizes)
  const lz = textLz('row', gs, null, sizes), fs = ROW_LABEL_PX / lz, fsL = fs, k0 = 1
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const avoid = useMemo(() => (shown && lines.length ? aisleLabelBoxes(objects, gs, labelSize) : []), [shown, lines.length, objects, gs, labelSize, sizes])
  const namer = useMemo(() => lineNamer(objects, T, gs), [objects, T, gs])
  const places = useMemo(() => placeRowLabels(lines, fsL, avoid, namer, objects, gs), [lines, fsL, avoid, namer, objects, gs])
  // Per section (row-numbering fixes): each chip filled with its section's colour, the text white or dark to read on it
  const secOf = useMemo(() => lineSections(objects, T, gs), [objects, T, gs])
  // the Tally's tallied lines (studio/tally.js): a small green tick just before the label (every line it names checked)
  const checked = useMemo(() => checkedNos(objects, lines, T), [objects, lines, T])
  const held = useLabelsHeld(), movingIds = useDragPreview(s => s.ids)
  if (!shown || !lines.length || !layerShown(layers, 'racking')) return null
  /* (rack-round2 4) nothing left behind: while the labels are held for a drag, the number of a rack that moves is not
     drawn (not at its old place) — it is placed again on the drop. (Riding the drag redrew this whole layer every frame:
     on a big layout the drag went from 16 to 25 ms a frame — measured, docs/reports/rack-round2.md.) */
  const moveOf = (p) => {
    if (!held || !movingIds) return 'still'
    const ids = p.key.split(':')[0].split(','), n = ids.filter(id => movingIds.has(id)).length
    return n === 0 ? 'still' : n === ids.length ? 'moving' : 'hidden'
  }
  const draw = (list) => list.map(p => {
        const col = secOf ? secOf.get(p.nos[0])?.color : null
        const my = p.y + p.h / 2, w0 = p.w / k0, h0 = p.h / k0
        // a plain label: at its right end (a line across) or its middle
        if (!col) return <Text key={p.key} name="rack-line-label" text={p.text} x={p.align === 'right' ? p.x + p.w - w0 : p.x + p.w / 2 - w0 / 2} y={my - h0 / 2} width={w0} height={h0} align={p.align} verticalAlign="middle"
          fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />
        const twL = p.text.length * fsL * 0.62 + fsL * 0.5, cxL = (p.align === 'right' ? p.x + p.w - twL : p.x + p.w / 2 - twL / 2) + twL / 2, tw = twL / k0
        return (
          // (Rule 8) a chip is a label: under 11 px its chip and text hide together (canvas2/minText.js)
          <Group key={p.key} listening={false} minLabel={{ fs, at: { x: cxL, y: my }, box: { w: tw, h: h0 } }}>
            <Rect name="rack-line-chip" x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} fill={col} cornerRadius={fs * 0.25} listening={false} perfectDrawEnabled={false} />
            <Text name="rack-line-label" text={p.text} x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} align="center" verticalAlign="middle"
              fontSize={fs} fontFamily={FONT} fontStyle="600" fill={chipText(col)} listening={false} perfectDrawEnabled={false} />
          </Group>
        )
      })
  const still = places.filter(p => moveOf(p) === 'still'), moving = places.filter(p => moveOf(p) === 'moving')
  return (
    <Group name="rack-line-labels" listening={false}>
      {draw(still)}
      {void moving}
      {still.filter(p => p.nos.length && p.nos.every(n => checked.has(n))).map(p => {
        const tw = p.text.length * fsL * 0.62, start = p.align === 'right' ? p.x + p.w - tw : p.x + p.w / 2 - tw / 2
        const c = start - fsL * 1.05 + fsL / 2, my = p.y + p.h / 2
        return <Text key={'t' + p.key} name="rack-line-tick" text="✓" x={c - fs / 2} y={my - p.h / k0 / 2} width={fs} height={p.h / k0} align="center" verticalAlign="middle"
          fontSize={fs} fontStyle="700" fontFamily={FONT} fill={TICK} listening={false} perfectDrawEnabled={false} />
      })}
    </Group>
  )
}
