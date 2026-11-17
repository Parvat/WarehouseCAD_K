// ColumnGridAnnot.jsx — a column grid's gridlines, bubbles (A, B, C … across; 1, 2, 3 … down) and dimension chains on the
// plan, while that grid is selected (a column picked in it too) — render/columnAnnot.js lays them out; the PDF always
// draws them. Pure paint, drawn from the live layout so it follows a drag.

import { useMemo } from 'react'
import { Group, Line, Circle, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { columnAnnot, ANNOT } from '../render/columnAnnot'
import { labelScale } from '../render/labelSize'
import { useLabelPrefs } from './labelPrefs'
import { useLiveObjects, useView } from './live'
import { layerShown } from '../utils/layers'
import { gridBuilding } from '../utils/columnGrid'
import { rackLinesNow } from '../utils/rackLines'
import { rowLabelPlaces, rowLabelFs, rowReach } from './RackLineLabels'
import { aisleLabelBoxes } from '../render/labelOps'
import { lineNamer } from '../utils/lineNames'
import { useViewPrefs } from '../studio/viewPrefs'
import { MIN_TEXT_PX, floorUnit } from './minText'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** How far the row numbers (RackLineLabels — the same places) reach past grid `g`'s building's top and left walls. */
function rowClear(g, objects, places) {
  const fp = gridBuilding(objects, g)
  if (!fp || !places.length) return null
  const r = rowReach(fp, places)
  return { top: r.top, left: r.left }
}

/* (col-bubbles round) The bubbles as last drawn — { gridId, axis, i, x, y, r } (world px) — so a press or a hover on one
   finds the gridline it names (canvas2/useCanvasInteraction.js: a bubble dragged moves its line, as the line itself). */
let SPOTS = []
/* ...and the dimension chain's values as last drawn — { gridId, axis, lo, hi, x, y, w, h, fs } (the value's box, world px):
   a click on one types it (ColumnChainEdit.jsx) */
let CHAIN = []
/* ...and the gridlines as last drawn — { gridId, axis, i, x1, y1, x2, y2 }: a press on one drags it (col-bubbles fix) */
let LINES = []
/** The gridline under world point `p` (within 4 screen px of it), or null. */
export function gridLineAt(p, zoom = 1) {
  const pad = 4 / (zoom || 1)
  for (const l of LINES) {
    if (l.axis === 'x' ? (Math.abs(p.x - l.x1) <= pad && p.y >= Math.min(l.y1, l.y2) && p.y <= Math.max(l.y1, l.y2)) : (Math.abs(p.y - l.y1) <= pad && p.x >= Math.min(l.x1, l.x2) && p.x <= Math.max(l.x1, l.x2))) return l
  }
  return null
}
/** The chain value under world point `p` (its box, plus 3 screen px), or null — only where the value is drawn (11 px or
 *  more on screen, and fitting its bay — labels-final). */
export function chainAt(p, zoom = 1) {
  const pad = 3 / (zoom || 1)
  for (const c of CHAIN) if (c.text && c.fs * (zoom || 1) >= MIN_TEXT_PX - 1e-6 && p.x >= c.x - pad && p.x <= c.x + c.w + pad && p.y >= c.y - pad && p.y <= c.y + c.h + pad) return c
  return null
}
/** The chain value drawn for grid `gridId` along `axis` from `lo` (the one being typed), or null. */
export const chainSpot = (gridId, axis, lo) => CHAIN.find(c => c.gridId === gridId && c.axis === axis && Math.abs(c.lo - lo) < 0.5) || null
/** The bubble under world point `p` (its circle as drawn, plus 3 screen px), or null — only while it is drawn: its name
 *  11 px or more on screen (labels-final, CLAUDE.md Rule 8 — a smaller bubble hides and takes no click). */
export function bubbleAt(p, zoom = 1) {
  const z = zoom || 1, pad = 3 / z
  for (const b of SPOTS) {
    if (b.fs > 0 && b.fs * z < MIN_TEXT_PX - 1e-6) continue
    if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + pad) return b
  }
  return null
}
/** A bubble's drawn radius (world px): its drawing size, at any zoom (never grown). */
export const bubbleRadius = (b) => b.r

export function ColumnGridAnnot() {
  const objects = useLiveObjects()
  const { selectedIds, gs, layers, T } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const labelSize = useLabelPrefs(s => s.labelSize)
  const rowsShown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const lz = labelScale(labelSize, gs), { zoom } = useView()
  // (Rule 8, labels-final) laid out at its natural drawing size — the chain's values, the bubbles and the row numbers it
  // keeps clear of (render/columnAnnot.js, render/dimChain.js); under 11 px on screen they hide (minText)
  const lzF = 1 / floorUnit(lz), rowFs = rowLabelFs(lz)
  void zoom
  const grids = layerShown(layers, 'columns') ? objects.filter(o => o.type === 'column_grid' && o.showGrid !== false && selectedIds.includes(o.id)) : []
  // the row numbers where they are drawn (only worked out while a grid is selected)
  const places = useMemo(() => {
    if (!grids.length || !rowsShown || !layerShown(layers, 'racking')) return []
    const lines = rackLinesNow(objects, gs)
    return lines.length ? rowLabelPlaces(lines, rowFs, aisleLabelBoxes(objects, gs, labelSize), lineNamer(objects, T, gs)) : []
  }, [grids.length, rowsShown, layers, objects, gs, rowFs, labelSize, T])
  if (!grids.length) { SPOTS = []; CHAIN = []; LINES = []; return null }
  const spots = []
  SPOTS = spots   // (filled as the grids below draw)
  const chainSpots = []
  CHAIN = chainSpots
  const lineSpots = []
  LINES = lineSpots
  return (
    <Group name="column-annot" listening={false}>
      {grids.map(g => {
        const a = columnAnnot(g, objects, gs, lzF, rowClear(g, objects, places))
        if (a) for (const l of a.lines) lineSpots.push({ gridId: g.id, axis: l.axis, i: l.i, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })
        if (a) for (const b of a.bubbles) spots.push({ gridId: g.id, axis: b.axis, i: b.i, x: b.x, y: b.y, r: b.r, fs: b.fs })
        if (a) for (const c of a.chain) { const w = c.tw + a.fs * 0.4, h = a.fs * 1.3; chainSpots.push({ gridId: g.id, axis: c.axis, lo: c.lo, hi: c.hi, x: c.tx - w / 2, y: c.ty - h / 2, w, h, fs: a.fs, tw: c.tw, text: c.text }) }
        if (!a) return null
        return (
          <Group key={g.id} name={'column-annot:' + g.id} listening={false}>
            {a.lines.map((l, i) => <Line key={'l' + i} name="column-gridline" points={[l.x1, l.y1, l.x2, l.y2]} stroke={ANNOT.line} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
            {a.chain.map((c, i) => (
              <Group key={'c' + i} listening={false}>
                {[...c.segs, ...c.ticks].map((l, k) => <Line key={k} points={l} stroke={ANNOT.ink} strokeWidth={1} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
                {/* (Rule 8, labels-final) at its drawing size: under 11 px hidden (minText); too long for its bay: left out (render/dimChain.js) */}
                <Text name="column-chain-text label-pill" text={c.text} x={c.tx} y={c.ty} width={c.tw + a.fs * 0.4} align="center" wrap="none" offsetX={(c.tw + a.fs * 0.4) / 2} offsetY={a.fs / 2}
                  fontSize={a.fs} fontStyle="600" fontFamily={FONT} fill={ANNOT.ink} listening={false} />
              </Group>
            ))}
            {a.bubbles.map((b, i) => (
              // (Rule 8) a bubble is a label: under 11 px its circle and letter hide together
              <Group key={'b' + i} name="column-bubble label-pill" listening={false} minLabel={{ fs: b.fs, at: { x: b.x, y: b.y }, box: { w: b.r * 2, h: b.r * 2 } }}>
                <Circle x={b.x} y={b.y} radius={b.r} fill={ANNOT.bubbleFill} stroke={ANNOT.bubble} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                <Text name="column-bubble-text" text={b.text} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} align="center" verticalAlign="middle" fontSize={b.fs} fontStyle="600" fontFamily={FONT} fill={ANNOT.bubble} listening={false} />
              </Group>
            ))}
          </Group>
        )
      })}
    </Group>
  )
}
