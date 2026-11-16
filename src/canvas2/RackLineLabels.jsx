// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows, the same
// computation): ONE label per rack line — a line cut by cross-aisles too (one number), at its outer start only (fixes-x 2;
// was: one per piece) — at its start end only — the left end of a line running across, the top end of
// one running up and down. A back-to-back pair running across gets one label per line, each beside its own line (R16 by
// the top line, R17 by the bottom one); one running up and down keeps one label for both, "R2–R3", at its top. Drawn like the aisle width labels: a
// size in feet (the Label size — render/labelSize.js), drawings' words style (Plus Jakarta Sans, #767C74). A label never
// overlaps another or a dimension label (the aisle and cross-aisle width labels): it shifts along the line's end, else
// it is left out. Like the aisle labels they are drawing-size and always drawn, at any zoom (ui-polish-4 — was: hidden
// under 8 px on screen). Pure paint (never listens); hidden with the
// Racking layer, and by the View card's Row numbers (on by default; shown anyway while the Tally drawer or its Pop out is open —
// studio/viewPrefs.js). Each label's Konva name is `rack-line-label`.

import { useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackLinesNow } from '../utils/rackLines'
import { layerShown } from '../utils/layers'
import { useViewPrefs } from '../studio/viewPrefs'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes } from '../render/labelOps'
import { useLiveObjects, useView } from './live'
import { MIN_TEXT_PX } from './minText'
import { checkedNos } from '../studio/tally'
import { lineNamer, lineSections, chipText } from '../utils/lineNames'
import { buildingOutline } from '../utils/floorGeom'

const WORDS = '#767C74', TICK = '#2E7D5B', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
/** The label's size in drawing units: the aisle labels' 10 at the Label size. */
export const ROW_LABEL_PX = 10
/** The labels' font size at `zoom` (world px): the Label size's, or larger so it is drawn at 11 px (CLAUDE.md Rule 8) —
 *  the labels are placed at the size they are drawn, so they keep off each other at any zoom. */
export const rowLabelFs = (lz, zoom) => Math.max(ROW_LABEL_PX / lz, MIN_TEXT_PX / (zoom || 1))
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
    if (!at) {
      // (Rule 8) no room: collapsed into the label it runs into at the same ends (R10–R13), if that range fits; else left out
      const b0 = l0.vert ? { x: c - w / 2, y: l0.r0 - gap - h, w, h } : { x: l0.r0 - gap - w, y: c - h / 2, w, h }
      const j = out.findIndex(p => p.vert === l0.vert && Math.abs(p.r0 - l0.r0) < h && meets(placed[out.indexOf(p)], b0))
      if (j < 0) continue
      const p = out[j], all = [...p.nos, ...nos].sort((a, b) => a - b)
      const t2 = `${name(all[0])}–${name(all[all.length - 1])}`, w2 = t2.length * fs * 0.62 + fs * 0.3
      const a0 = Math.min(p.s0, s0), a1 = Math.max(p.s1, s1), c2 = (a0 + a1) / 2
      // over the two lines' middle — or, no room there, where the label it joins already stands
      const at2 = (cc) => (l0.vert ? { x: cc - w2 / 2, y: l0.r0 - gap - h, w: w2, h } : { x: l0.r0 - gap - w2, y: cc - h / 2, w: w2, h })
      const free = (b) => !placed.some((q, i) => i !== j && meets(q, b)) && !avoid.some(q => meets(q, b))
      const b2 = [at2(c2), at2(l0.vert ? placed[j].x + placed[j].w / 2 : placed[j].y + placed[j].h / 2)].find(free)
      if (!b2) continue
      placed[j] = b2
      out[j] = { ...p, key: p.key + '+' + k, text: t2, nos: all, s0: a0, s1: a1, ...b2 }
      continue
    }
    placed.push(at)
    out.push({ key: k, text, nos, ...at, align: l0.vert ? 'center' : 'right', vert: l0.vert, r0: l0.r0, s0, s1 })
  }
  return out
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
  const objects = useLiveObjects()
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const rowsShown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  const fs = rowLabelFs(labelScale(labelSize, gs), useView().zoom)
  return useMemo(() => {
    if (!on || !rowsShown || !layerShown(layers, 'racking')) return []
    const lines = rackLinesNow(objects, gs)
    return lines.length ? rowLabelPlaces(lines, fs, aisleLabelBoxes(objects, gs, labelSize), lineNamer(objects, T, gs)) : []
  }, [on, rowsShown, layers, objects, gs, fs, labelSize, T])
}

export function RackLineLabels() {
  // where the racks are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects()
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const shown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  // (Rule 8) placed at the size they are drawn (fsL — so they keep off each other at any zoom), painted at the Label size's
  // drawing size (fs) and grown by the text floor (canvas2/minText.js) into exactly the box they were placed in
  const lz = labelScale(labelSize, gs), fs = ROW_LABEL_PX / lz, fsL = rowLabelFs(lz, useView().zoom), k0 = fsL / fs
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const avoid = useMemo(() => (shown && lines.length ? aisleLabelBoxes(objects, gs, labelSize) : []), [shown, lines.length, objects, gs, labelSize])
  const namer = useMemo(() => lineNamer(objects, T, gs), [objects, T, gs])
  const places = useMemo(() => rowLabelPlaces(lines, fsL, avoid, namer), [lines, fsL, avoid, namer])
  // Per section (row-numbering fixes): each chip filled with its section's colour, the text white or dark to read on it
  const secOf = useMemo(() => lineSections(objects, T, gs), [objects, T, gs])
  // the Tally's tallied lines (studio/tally.js): a small green tick just before the label (every line it names checked)
  const checked = useMemo(() => checkedNos(objects, lines, T), [objects, lines, T])
  if (!shown || !lines.length || !layerShown(layers, 'racking')) return null
  return (
    <Group name="rack-line-labels" listening={false}>
      {places.map(p => {
        const col = secOf ? secOf.get(p.nos[0])?.color : null
        const my = p.y + p.h / 2, w0 = p.w / k0, h0 = p.h / k0
        // a plain label grows about its anchor — its right end (a line across) or its middle
        if (!col) return <Text key={p.key} name="rack-line-label" text={p.text} x={p.align === 'right' ? p.x + p.w - w0 : p.x + p.w / 2 - w0 / 2} y={my - h0 / 2} width={w0} height={h0} align={p.align} verticalAlign="middle"
          fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />
        const twL = p.text.length * fsL * 0.62 + fsL * 0.5, cxL = (p.align === 'right' ? p.x + p.w - twL : p.x + p.w / 2 - twL / 2) + twL / 2, tw = twL / k0
        return (
          // (Rule 8) a chip is a label: under 11 px its chip and text grow together about its centre (canvas2/minText.js)
          <Group key={p.key} listening={false} minLabel={{ fs, at: { x: cxL, y: my }, box: { w: tw, h: h0 } }}>
            <Rect name="rack-line-chip" x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} fill={col} cornerRadius={fs * 0.25} listening={false} perfectDrawEnabled={false} />
            <Text name="rack-line-label" text={p.text} x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} align="center" verticalAlign="middle"
              fontSize={fs} fontFamily={FONT} fontStyle="600" fill={chipText(col)} listening={false} perfectDrawEnabled={false} />
          </Group>
        )
      })}
      {places.filter(p => p.nos.length && p.nos.every(n => checked.has(n))).map(p => {
        const tw = p.text.length * fsL * 0.62, start = p.align === 'right' ? p.x + p.w - tw : p.x + p.w / 2 - tw / 2
        const c = start - fsL * 1.05 + fsL / 2, my = p.y + p.h / 2
        return <Text key={'t' + p.key} name="rack-line-tick" text="✓" x={c - fs / 2} y={my - p.h / k0 / 2} width={fs} height={p.h / k0} align="center" verticalAlign="middle"
          fontSize={fs} fontStyle="700" fontFamily={FONT} fill={TICK} listening={false} perfectDrawEnabled={false} />
      })}
    </Group>
  )
}
