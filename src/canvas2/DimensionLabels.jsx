import { useMemo, memo } from 'react'
import { Group, Rect, Line, Text } from 'react-konva'
import { equipmentResolver } from '../utils/equipment'
import { getFpWallSegments, getObjectBounds } from '../utils/canvas'
import { pxToFtIn, useUnits } from '../utils/units'   // (units) the project's units
import { spin } from './shapes'
import { buildingDims, DIM_INK } from '../render/buildingDims'
import { aisleLabelLayout, gapShown } from './hitTest'
import { polygonOf } from '../utils/sectionAreas'
import { rackFootprint } from '../generate/columnCheck'
import { getRackCapacity } from '../utils/capacity'
import { levelsResolver } from '../utils/elevations'
import { useCanvasStore } from '../store/useCanvasStore'
import { useColumnCheck } from '../generate/useColumnCheck'
import { useDragPreview } from './dragPreview'
import { clearanceSource } from './clearanceSource'
import { LabelOps } from './LabelOps'
import { floorUnit } from './minText'
import { useRowPlaces } from './RackLineLabels'
import { aisleLabelOps, clearanceOpsAll, clearanceSolids, chipSolids } from '../render/labelOps'
import { crossAisleLabels } from './crossAisles'
import { faceAisleLabels } from '../generate/faceAisles'
import { isEmptySide } from '../utils/bayEmpty'
import { useFlued } from './dragPreview'   // (gen-lock)
import { faceWordsReach } from '../render/rackOps'   // (rack-design)
import { shelvingLabel, shelvingTag } from '../utils/shelving'   // (rack-round3 6)
import { laneEngineOn } from '../racks/laneEngine'   // (r3-drive-in)

/* ── Dimension labels — ported from the SVG engine, render-only ──────────────
   CanvasUI.jsx's RackLabels/FpSegmentDimLabels and CanvasOverlays.jsx's live
   AisleLabel, redrawn with Konva primitives instead of SVG ones. The number
   formulas (font size, padding, per-bay minimum width, label-count-by-length)
   are ported VERBATIM — this file decides nothing about layout that the SVG
   engine doesn't already decide, it only repaints the same numbers with
   Rect/Line/Text instead of rect/line/text/polygon.

   Column-check conflict marks are explicitly out of scope here (a separate
   overlay, BlockedFaceMarks.jsx — canvas2's own, ported from the SVG
   engine's ColumnCheckOverlay.jsx — not part of CanvasUI's dimension
   labels).

   No input: these are listening={false} decoration, exactly like
   SelectionOutline and ResizeHandlesOverlay.

   Bounds come from getObjectBounds(obj) — the SAME function
   handleGeometry.js's computeHandleLayout calls for the resize handles and
   rotate stalk — not a second, ad-hoc obj.x/y/width/height read. BUG 11
   (see CANVAS2_BUGLOG.md) was exactly this file inlining its own bounds
   instead of sharing computeHandleLayout's; for a plain rect rack the two
   were numerically identical, so it read fine here, but a rack type whose
   bounds ever needed deriving (the way floor plans derive theirs from
   fpVerts) would have silently drifted the two apart. One shared source
   means that can't happen again for any future chrome added here.

   Live-drag tracking: useCanvasInteraction's collectDragNodes moves this
   file's Konva groups ('racklabels:'+id, 'fpdim:'+id) by the same delta it
   moves the object body and its selection outline by, so a rack dragged
   across the sheet keeps its labels attached instead of leaving them at the
   pre-drag position until mouseup's store commit repaints them (BUG 11). A
   resize's live preview writes the store every frame regardless (BUG 9), so
   labels on a RESIZING rack were always correct — this only ever affected a
   plain drag. */

const RACK_LABEL_TYPES = new Set([
  'rack_row', 'rack_double_row', 'rack_cantilever',
  'rack_pushback', 'rack_pallet_flow', 'rack_drive_in', 'rack_drive_through', 'rack_shelving',
])
const LANE_RACK_TYPES = new Set(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])

export function rackLabelsEligible(type) {
  return RACK_LABEL_TYPES.has(type)
}

/** One centred pill: a background Rect sized to the text, and a Text node
 *  centred inside it via an explicit width/height box (Konva's align/
 *  verticalAlign are no-ops without one — same fix BUG 10 needed for the
 *  rotate handle's glyph). (cx, cy) is the pill's own centre, matching every
 *  call site's own dmx/dmy-style centre math. */
export function LabelPill({ cx, cy, text, fontSize, zoom, color = '#4a9eff', bg = '#0a0d16',
  padX = 4 / zoom, heightScale = 1.5, rx = 2 / zoom, stroke, strokeWidth, opacity = 0.85 }) {
  const w = text.length * fontSize * 0.62 + padX * 2
  const h = fontSize * heightScale
  return (
    <Group listening={false}>
      <Rect name="label-pill" x={cx - w / 2} y={cy - h / 2} width={w} height={h}
        fill={bg} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} cornerRadius={rx}
        perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />
      <Text x={cx - w / 2} y={cy - h / 2} width={w} height={h}
        text={text} align="center" verticalAlign="middle"
        fontSize={fontSize} fontFamily="JetBrains Mono, monospace" fill={color}
        listening={false} />
    </Group>
  )
}

/* ── Rack dimension labels — beam/bay lengths, total length, depth, arm/lane
   specs. Shown only while the rack is selected (or printing, which canvas2
   has no equivalent of yet — the caller gates this on `selected`). */
export function RackLabels({ obj: stored, zoom, gridSize }) {
  const obj = useFlued(stored)   // (gen-lock) the pair dragged with its live flue: as drawn now
  // (Rule 8 — never over each other) the row numbers as drawn now: an end label (a depth, an arm) keeps off them
  const chips = useRowPlaces(true)
  if (!RACK_LABEL_TYPES.has(obj.type)) return null

  const b = getObjectBounds(obj)
  const bx = b.x, by = b.y, bw = b.width, bh = b.height
  const fs = 11 / zoom
  const clr = '#4a9eff'
  const fmtIn = (px) => pxToFtIn(px, gridSize)
  const nodes = []
  /* An END label (a depth at the rack's end, a double row's front / back, a cantilever's arm): at its end unless that is
     over a row number (or another end label) as drawn — at its drawing size (labels-final: never grown) — then at the rack's
     other end; both taken: left out (CLAUDE.md Rule 8: labels never overlap). Boxes in world px, the rack's turn in them. */
  const sp = spin(obj, gridSize), t = ((obj.rotation || 0) * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t)
  const toW = (x, y) => ({ x: sp.x + (x - sp.offsetX) * cs - (y - sp.offsetY) * sn, y: sp.y + (x - sp.offsetX) * sn + (y - sp.offsetY) * cs })
  const drawnBox = (cx, cy, text) => {
    const w = text.length * fs * 0.62 + (4 / zoom) * 2, h = fs * 1.5
    const ps = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => toW(cx + (a * w) / 2, cy + (c * h) / 2))
    const x0 = Math.min(...ps.map(p => p.x)), y0 = Math.min(...ps.map(p => p.y))
    return { x: x0, y: y0, w: Math.max(...ps.map(p => p.x)) - x0, h: Math.max(...ps.map(p => p.y)) - y0 }
  }
  const meets = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h
  const ends = []
  const endPill = (key, cx, cy, text, alt) => {
    for (const x of [cx, alt]) {
      const bb = drawnBox(x, cy, text)
      if (chips.some(c => meets(c, bb)) || ends.some(e => meets(e, bb))) continue
      ends.push(bb)
      nodes.push(<LabelPill key={key} cx={x} cy={cy} text={text} fontSize={fs} zoom={zoom} color={clr} />)
      return
    }
  }
  const mirror = (cx, mid) => 2 * mid - cx

  if (obj.type === 'rack_row') {
    const beams = obj.beams || [96]
    const upW = ((obj.uprightWidth || 3) / 12) * gridSize
    let cursor = bx + upW
    beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const cx = cursor + beamPx / 2
      if (beamPx > fs * 3.5 + (4 / zoom) * 2) {
        nodes.push(<LabelPill key={'b' + i} cx={cx} cy={by + bh / 2} text={`${beamIn}"`} fontSize={fs} zoom={zoom} color={clr} />)
      }
      cursor += beamPx + upW
    })
    const totY = by + bh + 14 / zoom
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
    const dx = bx + bw + 6 / zoom + (fmtIn(bh).length * fs * 0.62 + (4 / zoom) * 2) / 2
    endPill('depth', dx, by + bh / 2, fmtIn(bh), mirror(dx, bx + bw / 2))
  }

  if (obj.type === 'rack_double_row') {
    const beams = obj.beams || [96]
    const upW = ((obj.uprightWidth || 3) / 12) * gridSize
    const flueH = ((obj.flueSpaceIn || 9) / 12) * gridSize
    const rowH = (bh - flueH) / 2
    let cursor = bx + upW
    beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const cx = cursor + beamPx / 2
      if (beamPx > fs * 3.5 + (4 / zoom) * 2) {
        const txt = `${beamIn}"`
        // an empty bay side has no beam to measure (utils/bayEmpty.js)
        if (!isEmptySide(obj, i, 0)) nodes.push(<LabelPill key={'b' + i} cx={cx} cy={by + rowH / 2} text={txt} fontSize={fs} zoom={zoom} color={clr} />)
        const backY = by + rowH + flueH + rowH / 2
        if (!isEmptySide(obj, i, 1)) nodes.push(<LabelPill key={'bb' + i} cx={cx} cy={backY} text={txt} fontSize={fs} zoom={zoom} color={clr} />)
      }
      cursor += beamPx + upW
    })
    const totY = by + bh + 14 / zoom
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
    const frontTxt = fmtIn(rowH), frontTw = frontTxt.length * fs * 0.62 + (4 / zoom) * 2
    const fx = bx - 6 / zoom - frontTw / 2
    endPill('front', fx, by + rowH / 2, frontTxt, mirror(fx, bx + bw / 2))
    const backTxt = fmtIn(rowH), backTw = backTxt.length * fs * 0.62 + (4 / zoom) * 2
    const backRowMidY = by + rowH + flueH + rowH / 2
    const kx = bx + bw + 6 / zoom + backTw / 2
    endPill('back', kx, backRowMidY, backTxt, mirror(kx, bx + bw / 2))
    if (flueH > fs * 2) {
      const flueTxt = `${obj.flueSpaceIn || 9}" flue`
      nodes.push(<LabelPill key="flue" cx={bx + bw / 2} cy={by + rowH + flueH / 2} text={flueTxt} fontSize={fs} zoom={zoom} color="#888" />)
    }
  }

  if (obj.type === 'rack_cantilever') {
    const towers = obj.towers || [36]
    const armIn = towers[0] || 36
    const armTxt = `${armIn}" arm`, armTw = armTxt.length * fs * 0.62 + (4 / zoom) * 2
    const ax = bx + bw + 6 / zoom + armTw / 2
    endPill('arm', ax, by + bh / 2, armTxt, mirror(ax, bx + bw / 2))
    const spTxt = '48" spacing', spTw = spTxt.length * fs * 0.62 + (4 / zoom) * 2
    const tSpPx = (48 / 12) * gridSize
    if (tSpPx > spTw && bw > tSpPx) {
      nodes.push(<LabelPill key="spacing" cx={bx + tSpPx / 2} cy={by - 14 / zoom} text={spTxt} fontSize={fs} zoom={zoom} color={clr} />)
    }
    const totY = by + bh + 14 / zoom
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
  }

  /* (rack-round3 6) a shelving unit selected: its size label under it (as the other racks' sizes; the rotate handle is over it) — "S1 · 4 units · 48×24 · 5 shelves" */
  if (obj.type === 'rack_shelving') {
    const st = useCanvasStore.getState()
    nodes.push(<LabelPill key="shelving" cx={bx + bw / 2} cy={by + bh + 14 / zoom} text={shelvingLabel(obj, gridSize, shelvingTag(st.objects, obj, gridSize, st.elevations))} fontSize={fs} zoom={zoom} color={clr} />)
  }

  if (LANE_RACK_TYPES.has(obj.type)) {
    const lanes = obj.lanes || 2
    const palletDeep = obj.palletDeep || 5
    const upW = ((obj.uprightWidth || 4) / 12) * gridSize
    const ledgePx = (2 / 12) * gridSize
    const clearPx = (1 / 12) * gridSize
    const palletWPx = ((obj.palletWIn || 40) / 12) * gridSize
    const laneWPx = ledgePx * 2 + clearPx * 2 + palletWPx
    // (r3-drive-in) a rack the lane engine sized: its own width (its clearance and post may be anything)
    const derivedW = laneEngineOn(obj) ? bw : (lanes + 1) * upW + lanes * laneWPx

    // (rack-design) past the face's words (ENTRY, LOAD, PICK), never over them
    const wY = by + bh + faceWordsReach(obj, 'bottom', gridSize) + 14 / zoom
    nodes.push(<LabelPill key="width" cx={bx + derivedW / 2} cy={wY} text={fmtIn(derivedW)} fontSize={fs} zoom={zoom} color={clr} />)
    const dTxt = fmtIn(bh), dTw = dTxt.length * fs * 0.62 + (4 / zoom) * 2
    const lx = bx + derivedW + 6 / zoom + dTw / 2
    endPill('depth', lx, by + bh / 2, dTxt, mirror(lx, bx + derivedW / 2))
    // (lane-positions) lanes × deep × levels (utils/capacity.js), its levels from its elevation type
    const capR = getRackCapacity(obj, undefined, levelsResolver(useCanvasStore.getState().elevations)), cap = capR?.total ?? lanes * palletDeep
    const lTxt = `${lanes}L × ${palletDeep}D × ${capR?.levels ?? 1} · ${cap} PAL`
    nodes.push(<LabelPill key="lanes" cx={bx + derivedW / 2} cy={by - faceWordsReach(obj, 'top', gridSize) - 14 / zoom} text={lTxt} fontSize={fs} zoom={zoom} color={clr} />)
  }

  if (!nodes.length) return null
  return <Group name={'racklabels:' + obj.id} listening={false} {...spin(obj, gridSize)}>{nodes}</Group>
}

/* ── Floor plan per-wall dimension labels — always on while the shape is
   selected. Ported from CanvasUI.jsx's FpSegmentDimLabels: a tick-mark
   dimension line, offset outward along each wall's outward normal, plus a
   centred length pill, every one in the blue building dimension style.
   `activeWallIdx` — the one wall selected (a click on it): the wall line itself is lit in the selection green
   #2E7D5B, 3 screen px over the wall (`wall-select`); its dimension stays blue like the other sides (was: gold). */
/* (col-grid round: dimension lines — render/buildingDims.js: a thin blue line outside the wall, end ticks, dashed
   extension lines from the corners, the length in bold in a break; a rectangle's bottom and right only, an L's or a
   custom shape's every wall. `zoom` is the label scale.) */
export function FpDimLabels({ obj, zoom, gridSize, activeWallIdx = null }) {
  const walls = getFpWallSegments(obj, gridSize)
  if (!walls || !walls.length) return null
  const dims = buildingDims(obj, gridSize, zoom)
  const act = activeWallIdx != null ? walls[activeWallIdx] : null
  return (
    <Group name={'fpdim:' + obj.id} listening={false} {...spin(obj, gridSize)}>
      {act && <Line name="wall-select" points={[act.a.x, act.a.y, act.b.x, act.b.y]} stroke={WALL_SELECT} strokeWidth={3} strokeScaleEnabled={false} lineCap="butt" listening={false} perfectDrawEnabled={false} />}
      {dims.map(d => (
        <Group key={d.wallIdx} name="fp-dim-line" listening={false}>
          {d.line.map((l, k) => <Line key={'l' + k} points={l} stroke={DIM_INK} strokeWidth={1} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
          {d.ticks.map((l, k) => <Line key={'t' + k} points={l} stroke={DIM_INK} strokeWidth={1} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
          {d.ext.map((l, k) => <Line key={'e' + k} points={l} stroke={DIM_INK} strokeWidth={1} dash={[2, 2]} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
          <Text name="fp-dim-value label-pill" text={d.text} x={d.tx} y={d.ty} width={d.tw + d.fs} offsetX={(d.tw + d.fs) / 2} offsetY={d.fs / 2} align="center" rotation={d.angle}
            fontSize={d.fs} fontStyle="700" fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fill={DIM_INK} listening={false} />
        </Group>
      ))}
    </Group>
  )
}

/* A section's sizes (labels-sections, STUDIO.md §7a Sections): its width and length along its edges — every edge's
   length, a custom shape's too — in the building dimension style (FpDimLabels: the line off the edge, its ticks and
   arrowheads, the length in a pill), outside the section. Shown while it is selected, or for every section with the
   View card's Section sizes on. World px; drawn from the live layout (canvas2/live.js via Overlays' previewed
   objects), so it follows a drag. */
export function SectionDimLabels({ obj, zoom, gridSize }) {
  const p = polygonOf(obj)
  if (!p || p.length < 3) return null
  const walls = p.map(([ax, ay], i) => { const [bx, by] = p[(i + 1) % p.length]; return { a: { x: ax, y: ay }, b: { x: bx, y: by }, lenPx: Math.hypot(bx - ax, by - ay) } })
  return <Group name={'secdim:' + obj.id} listening={false}><EdgeDims walls={walls} zoom={zoom} gridSize={gridSize} /></Group>
}

/* The building dimension style along a closed outline's edges (`walls`: [{ a, b, lenPx }]), each dimension outside it. */
const WALL_SELECT = '#2E7D5B'
function EdgeDims({ walls, zoom, gridSize, activeWallIdx = null }) {

  let signedArea = 0
  for (let i = 0; i < walls.length; i++) {
    const j = (i + 1) % walls.length
    signedArea += walls[i].a.x * walls[j].a.y - walls[j].a.x * walls[i].a.y
  }
  const ws = signedArea >= 0 ? 1 : -1
  const fs = 11 / zoom
  const off = 22 / zoom
  const lw = 1 / zoom

  const nodes = walls.map((seg, i) => {
    const ax = seg.a.x, ay = seg.a.y
    const bx = seg.b.x, by = seg.b.y
    const isActive = activeWallIdx === i
    const clr = '#4a9eff'
    const edx = bx - ax, edy = by - ay
    const elen = Math.hypot(edx, edy) || 1
    const nx = ws * edy / elen
    const ny = ws * -edx / elen
    const d1x = ax + nx * off, d1y = ay + ny * off
    const d2x = bx + nx * off, d2y = by + ny * off
    const dmx = (ax + bx) / 2 + nx * off, dmy = (ay + by) / 2 + ny * off
    const label = pxToFtIn(seg.lenPx, gridSize)
    const ux = edx / elen, uy = edy / elen

    return (
      <Group key={i} listening={false}>
        {isActive && <Line name="wall-select" points={[ax, ay, bx, by]} stroke={WALL_SELECT} strokeWidth={3} strokeScaleEnabled={false} lineCap="butt" listening={false} perfectDrawEnabled={false} />}
        <Line points={[d1x, d1y, d2x, d2y]} stroke={clr} strokeWidth={lw} opacity={0.8} listening={false} />
        <Line points={[ax + nx * 4 / zoom, ay + ny * 4 / zoom, d1x, d1y]} stroke={clr} strokeWidth={lw} opacity={0.5} listening={false} />
        <Line points={[bx + nx * 4 / zoom, by + ny * 4 / zoom, d2x, d2y]} stroke={clr} strokeWidth={lw} opacity={0.5} listening={false} />
        <Line closed fill={clr} opacity={0.8} listening={false}
          points={[d1x, d1y, d1x + ux * 6 / zoom + ny * 3 / zoom, d1y + uy * 6 / zoom - nx * 3 / zoom, d1x + ux * 6 / zoom - ny * 3 / zoom, d1y + uy * 6 / zoom + nx * 3 / zoom]} />
        <Line closed fill={clr} opacity={0.8} listening={false}
          points={[d2x, d2y, d2x - ux * 6 / zoom + ny * 3 / zoom, d2y - uy * 6 / zoom - nx * 3 / zoom, d2x - ux * 6 / zoom - ny * 3 / zoom, d2y - uy * 6 / zoom + nx * 3 / zoom]} />
        <LabelPill cx={dmx} cy={dmy} text={label} fontSize={fs} zoom={zoom} color={clr} bg="#0a0d16" heightScale={1.5} opacity={0.92} />
      </Group>
    )
  })

  return <>{nodes}</>
}

/* ── Aisle label — always visible (gated only by the store's showAisles
   toggle, applied by the caller), computed live from the two rows it
   references. Ported from CanvasOverlays.jsx's AisleLabel — canvas2's
   version drops the moveDelta/getEffectiveDelta live-drag tracking:
   render-only scope, and it reads exactly what RackShape itself reads (the
   rows' current store positions), so it lags a plain drag by the same one
   frame the rack body already does (BUG 6 only special-cased the selection
   outline and resize handles, not every derived overlay). */
/* An aisle's label depends on the aisle and its two rows only, so it is a
   memoised item fed exactly those: a drag redraws only the labels of aisles
   beside a moved rack, a selection change redraws none. */
export const AisleLabelItem = memo(function AisleLabelItem({ aisle, row1, row2, lz, gridSize, profile = null, columns = EMPTY }) {
  useUnits()   // (units) redrawn in the new units when the project's change
  return <AisleLabel aisle={aisle} objects={[row1, row2].filter(Boolean)} lz={lz} gridSize={gridSize} profile={profile} columns={columns} />
})

/* Drawing size: `lz` is the Label size scale (render/labelSize.js), never
   the view zoom — a label is a fixed size in feet, like CAD text. */
export function AisleLabel({ aisle, objects, lz, gridSize, profile = null, columns }) {
  /* Geometry from aisleLabelLayout (hitTest.js) — the same stations the pick
     tests against, so a label is exactly as clickable as it is visible.
     rackFootprint-based (BUG 45) through aisleRect, so a 90°-rotated pair
     measures its true gap. */
  /* `profile`: the forklift to grade the aisle against (the warning colours), null when they are off */
  /* `columns`: the layout's column squares — the label slides along the aisle off any column (hitTest.js
     aisleLabelStation), at the size it is drawn */
  const L = aisleLabelLayout(aisle, objects, gridSize, { profile, columns, lz })
  // (rack-round2 8) the chip keeps off its two rows and the columns (a chip that does not fit its aisle goes past one end)
  const solids = useMemo(() => [...clearanceSolids(objects, gridSize), ...(columns || []).map(c => ({ x: c.x, y: c.y, w: c.w ?? c.width, h: c.h ?? c.height }))], [objects, gridSize, columns])
  if (!L) return null
  return <AisleLabelView L={L} name={'aisle:' + aisle.id} lz={lz} solids={solids} />
}

/* A width label drawn from a layout ({ isHoriz, gapLo, gapHi, labelMid,
   positions, text }): an arrow across the gap at each station with the width
   in a pill. Aisle labels and cross-aisle labels both draw through this, so
   they look the same. */
export function AisleLabelView({ L, name, lz, solids = null }) {
  // (rack-round2 8) `solids`: what the chip keeps off (labelOps chipSolids) — a copy, so each chip is laid out on its own
  const ops = useMemo(() => aisleLabelOps(L, lz, { solids: solids ? solids.slice() : null }), [L, lz, solids])
  // (Rule 8) a width shows only when it fits its gap at 11 px or more, off the racks and columns (labels-final)
  return <LabelOps ops={ops} name={name} cover />
}

/* One width label per cross-aisle (crossAisles.js), in the aisle-label style.
   There are only a few, so they are simply derived from the (previewed)
   objects they are given. */
export const CrossAisleLabels = memo(function CrossAisleLabels({ objects, lz, gridSize = 40, profile = null }) {
  // `profile`: grade them as Check layout does (red over a listed cross-aisle), null when the colours are off
  // `lz`: the Label size — a label must sit on clear floor at the size it is drawn
  const list = useMemo(() => crossAisleLabels(objects, gridSize, { profile, lz }), [objects, gridSize, profile, lz])
  return <>{list.map(L => <AisleLabelView key={L.key} L={L} name={'cross-aisle:' + L.key} lz={lz} />)}</>
})

/* The width label of an aisle in front of a face with a zone or a wall across it (generate/faceAisles.js):
   only the failing ones exist, so they draw only with the warning colours on (`profile`), amber / red as
   Check layout lists them. */
export const FaceAisleLabels = memo(function FaceAisleLabels({ objects, lz, gridSize = 40, profile = null }) {
  // each face held to its rack's equipment (utils/equipment.js), as Check layout lists it
  const list = useMemo(() => {
    if (!profile) return []
    const R = equipmentResolver(objects, profile)
    const all = R.single ? faceAisleLabels(objects, gridSize, { profile }) : R.inUse.flatMap(p => faceAisleLabels(objects, gridSize, { profile: p }).filter(L => R.of(L.rackId).key === p.key))
    // a rack and a wall or zone: never across a section edge, never open floor (hitTest.js gapShown)
    return all.filter(L => gapShown(L, objects, gridSize, R.of(L.rackId), false))
  }, [objects, gridSize, profile])
  const solids = useMemo(() => chipSolids(objects, gridSize), [objects, gridSize])   // (rack-round2 8)
  return <>{list.map((L, i) => <AisleLabelView key={L.rackId + ':' + i} L={L} name={'face-aisle:' + L.rackId + ':' + i} lz={lz} solids={solids} />)}</>
})

const EMPTY = []

/* ── Column clearance labels + red aisle warning ─────────────────────────────
   For every column standing in a travel aisle: an arrow on EACH side, from
   the column's edge to the rack face on that side, labelled with the clear
   space. Built orientation-free in aisleMarks.js, so a vertical layout looks
   exactly like a horizontal one turned 90° — same arrows, same pills (it was
   a single fixed-length arrow toward the clearer side only).

   When NEITHER side reaches the forklift's travelFt (`pinched`, the same
   condition as accessibility level 1) the aisle stretch around the column is
   shaded red and both labels turn red. Visual only: capacity and levels are
   not touched. A generated layout never has one (E-no-block); it appears
   when a dealer moves or places racks by hand.

   Live while dragging: a plain drag doesn't write the store until mouseup.
   A drag that carries every rack and column (a building drag) moves the
   held warnings with it, unchanged; any other drag re-runs just the cheap
   aisle part of the column check on the previewed layout
   (clearanceSource.js). Otherwise it draws the full check's own aisleBlocks. */
export function ColumnClearanceLabels({ aisleBlocks, columns, objects, lz: lzSize, gridSize = 40, showLabels = true, avoid = EMPTY, warnings = true, only = null }) {
  // (Rule 8, labels-final) the numbers laid out at their drawing size (the Label size); under 11 px on screen, or not fitting
  // their gap, they are left out
  const lz = 1 / floorUnit(lzSize)
  const ids = useDragPreview(s => s.ids), dx = useDragPreview(s => s.dx), dy = useDragPreview(s => s.dy)
  const { profile, pickBothSides } = useColumnCheck()
  /* clearanceSource.js: a drag carrying every rack and column (a building
     drag) holds the last result and moves it — the warnings cannot change
     mid-drag; any other drag re-runs the cheap aisle part on the preview */
  const src = useMemo(() => clearanceSource({ aisleBlocks, columns, objects, preview: { ids, dx, dy }, gridSize, profile, pickBothSides }),
    [aisleBlocks, columns, objects, ids, dx, dy, gridSize, profile, pickBothSides])
  /* `avoid`: the aisle width labels' boxes as drawn (Overlays.jsx); this group sits at (src.x, src.y), so
     they come into its frame */
  const local = useMemo(() => (src.x || src.y) ? avoid.map(r => ({ ...r, x: r.x - (src.x || 0), y: r.y - (src.y || 0) })) : avoid, [avoid, src.x, src.y])
  // the racks and columns a number may never sit on, in this group's frame
  const solids = useMemo(() => clearanceSolids(objects, gridSize).map(r => ({ ...r, x: r.x - (src.x || 0), y: r.y - (src.y || 0) })), [objects, gridSize, src.x, src.y])
  /* `only`: one column's (a column picked — canvas2/columnPick.js), its square in world px */
  const mine = (a) => { const c = src.cols?.[a.columnIndex]; return !only || (c && Math.abs(c.x + (src.x || 0) - only.x) < 1e-3 && Math.abs(c.y + (src.y || 0) - only.y) < 1e-3) }
  // (doors-edit fixes, Rule 8) every column's numbers laid out in one pass: none lands on another column's
  const all = useMemo(() => {
    const bs = (src.blocks || []).filter(mine)
    return src.cols?.length ? clearanceOpsAll(bs, (a) => src.cols[a.columnIndex], lz, gridSize, showLabels, local, { warnings, solids }) : []
  }, [src, lz, gridSize, showLabels, local, warnings, solids, only])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!src.blocks?.length || !src.cols?.length) return null
  return (
    <Group name="column-clearance-labels" listening={false} x={src.x} y={src.y}>
      {all.map((ops, i) => <LabelOps key={i} ops={ops} name={'aisle-column:' + i} fit={false} />)}
    </Group>
  )
}
