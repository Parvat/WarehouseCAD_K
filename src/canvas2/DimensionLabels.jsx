import { Group, Rect, Line, Text } from 'react-konva'
import { pxToFtIn, getFpWallSegments, getObjectBounds } from '../utils/canvas'
import { spin } from './shapes'

/* ── Dimension labels — ported from the SVG engine, render-only ──────────────
   CanvasUI.jsx's RackLabels/FpSegmentDimLabels and CanvasOverlays.jsx's live
   AisleLabel, redrawn with Konva primitives instead of SVG ones. The number
   formulas (font size, padding, per-bay minimum width, label-count-by-length)
   are ported VERBATIM — this file decides nothing about layout that the SVG
   engine doesn't already decide, it only repaints the same numbers with
   Rect/Line/Text instead of rect/line/text/polygon.

   Column-check conflict marks are explicitly out of scope here (a separate
   overlay, ColumnCheckOverlay.jsx, not part of CanvasUI's dimension labels).

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
  'rack_pushback', 'rack_pallet_flow', 'rack_drive_in', 'rack_drive_through',
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
function LabelPill({ cx, cy, text, fontSize, zoom, color = '#4a9eff', bg = '#0a0d16',
  padX = 4 / zoom, heightScale = 1.5, rx = 2 / zoom, stroke, strokeWidth, opacity = 0.85 }) {
  const w = text.length * fontSize * 0.62 + padX * 2
  const h = fontSize * heightScale
  return (
    <Group listening={false}>
      <Rect x={cx - w / 2} y={cy - h / 2} width={w} height={h}
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
export function RackLabels({ obj, zoom, gridSize }) {
  if (!RACK_LABEL_TYPES.has(obj.type)) return null

  const b = getObjectBounds(obj)
  const bx = b.x, by = b.y, bw = b.width, bh = b.height
  const fs = 11 / zoom
  const clr = '#4a9eff'
  const fmtIn = (px) => pxToFtIn(px, gridSize)
  const nodes = []

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
    nodes.push(
      <Line key="totline" points={[bx, by + bh + 4 / zoom, bx + bw, by + bh + 4 / zoom]}
        stroke={clr} strokeWidth={0.5 / zoom} opacity={0.5} listening={false} />
    )
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
    nodes.push(<LabelPill key="depth" cx={bx + bw + 6 / zoom + (fmtIn(bh).length * fs * 0.62 + (4 / zoom) * 2) / 2} cy={by + bh / 2} text={fmtIn(bh)} fontSize={fs} zoom={zoom} color={clr} />)
  }

  if (obj.type === 'rack_double_row') {
    const beams = obj.beams || [96]
    const upW = ((obj.uprightWidth || 3) / 12) * gridSize
    const flueH = ((obj.flueSpaceIn || 6) / 12) * gridSize
    const rowH = (bh - flueH) / 2
    let cursor = bx + upW
    beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const cx = cursor + beamPx / 2
      if (beamPx > fs * 3.5 + (4 / zoom) * 2) {
        const txt = `${beamIn}"`
        nodes.push(<LabelPill key={'b' + i} cx={cx} cy={by + rowH / 2} text={txt} fontSize={fs} zoom={zoom} color={clr} />)
        const backY = by + rowH + flueH + rowH / 2
        nodes.push(<LabelPill key={'bb' + i} cx={cx} cy={backY} text={txt} fontSize={fs} zoom={zoom} color={clr} />)
      }
      cursor += beamPx + upW
    })
    const totY = by + bh + 14 / zoom
    nodes.push(
      <Line key="totline" points={[bx, by + bh + 4 / zoom, bx + bw, by + bh + 4 / zoom]}
        stroke={clr} strokeWidth={0.5 / zoom} opacity={0.5} listening={false} />
    )
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
    const frontTxt = fmtIn(rowH), frontTw = frontTxt.length * fs * 0.62 + (4 / zoom) * 2
    nodes.push(<LabelPill key="front" cx={bx - 6 / zoom - frontTw / 2} cy={by + rowH / 2} text={frontTxt} fontSize={fs} zoom={zoom} color={clr} />)
    const backTxt = fmtIn(rowH), backTw = backTxt.length * fs * 0.62 + (4 / zoom) * 2
    const backRowMidY = by + rowH + flueH + rowH / 2
    nodes.push(<LabelPill key="back" cx={bx + bw + 6 / zoom + backTw / 2} cy={backRowMidY} text={backTxt} fontSize={fs} zoom={zoom} color={clr} />)
    if (flueH > fs * 2) {
      const flueTxt = `${obj.flueSpaceIn || 6}" flue`
      nodes.push(<LabelPill key="flue" cx={bx + bw / 2} cy={by + rowH + flueH / 2} text={flueTxt} fontSize={fs} zoom={zoom} color="#888" />)
    }
  }

  if (obj.type === 'rack_cantilever') {
    const towers = obj.towers || [36]
    const armIn = towers[0] || 36
    const armTxt = `${armIn}" arm`, armTw = armTxt.length * fs * 0.62 + (4 / zoom) * 2
    nodes.push(<LabelPill key="arm" cx={bx + bw + 6 / zoom + armTw / 2} cy={by + bh / 2} text={armTxt} fontSize={fs} zoom={zoom} color={clr} />)
    const spTxt = '48" spacing', spTw = spTxt.length * fs * 0.62 + (4 / zoom) * 2
    const tSpPx = (48 / 12) * gridSize
    if (tSpPx > spTw && bw > tSpPx) {
      nodes.push(<LabelPill key="spacing" cx={bx + tSpPx / 2} cy={by - 14 / zoom} text={spTxt} fontSize={fs} zoom={zoom} color={clr} />)
    }
    const totY = by + bh + 14 / zoom
    nodes.push(
      <Line key="totline" points={[bx, by + bh + 4 / zoom, bx + bw, by + bh + 4 / zoom]}
        stroke={clr} strokeWidth={0.5 / zoom} opacity={0.5} listening={false} />
    )
    nodes.push(<LabelPill key="total" cx={bx + bw / 2} cy={totY} text={fmtIn(bw)} fontSize={fs} zoom={zoom} color={clr} />)
  }

  if (LANE_RACK_TYPES.has(obj.type)) {
    const lanes = obj.lanes || 2
    const palletDeep = obj.palletDeep || 5
    const upW = ((obj.uprightWidth || 4) / 12) * gridSize
    const ledgePx = (2 / 12) * gridSize
    const clearPx = (1 / 12) * gridSize
    const palletWPx = ((obj.palletWIn || 40) / 12) * gridSize
    const laneWPx = ledgePx * 2 + clearPx * 2 + palletWPx
    const derivedW = (lanes + 1) * upW + lanes * laneWPx

    const wY = by + bh + 14 / zoom
    nodes.push(
      <Line key="wline" points={[bx, by + bh + 4 / zoom, bx + derivedW, by + bh + 4 / zoom]}
        stroke={clr} strokeWidth={0.5 / zoom} opacity={0.5} listening={false} />
    )
    nodes.push(<LabelPill key="width" cx={bx + derivedW / 2} cy={wY} text={fmtIn(derivedW)} fontSize={fs} zoom={zoom} color={clr} />)
    const dTxt = fmtIn(bh), dTw = dTxt.length * fs * 0.62 + (4 / zoom) * 2
    nodes.push(<LabelPill key="depth" cx={bx + derivedW + 6 / zoom + dTw / 2} cy={by + bh / 2} text={dTxt} fontSize={fs} zoom={zoom} color={clr} />)
    const cap = lanes * palletDeep
    const lTxt = `${lanes}L × ${palletDeep}D · ${cap} PAL`
    nodes.push(<LabelPill key="lanes" cx={bx + derivedW / 2} cy={by - 14 / zoom} text={lTxt} fontSize={fs} zoom={zoom} color={clr} />)
  }

  if (!nodes.length) return null
  return <Group name={'racklabels:' + obj.id} listening={false} {...spin(obj, gridSize)}>{nodes}</Group>
}

/* ── Floor plan per-wall dimension labels — always on while the shape is
   selected. Ported from CanvasUI.jsx's FpSegmentDimLabels: a tick-mark
   dimension line, offset outward along each wall's outward normal, plus a
   centred length pill. `activeWallIdx` highlights one wall gold — canvas2
   has no wall-drag interaction yet (render-only scope), so callers simply
   pass null until that lands. */
export function FpDimLabels({ obj, zoom, gridSize, activeWallIdx = null }) {
  const walls = getFpWallSegments(obj, gridSize)
  if (!walls || !walls.length) return null

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
    const clr = isActive ? '#f0b429' : '#4a9eff'
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

  return <Group name={'fpdim:' + obj.id} listening={false} {...spin(obj, gridSize)}>{nodes}</Group>
}

/* ── Aisle label — always visible (gated only by the store's showAisles
   toggle, applied by the caller), computed live from the two rows it
   references. Ported from CanvasOverlays.jsx's AisleLabel — canvas2's
   version drops the moveDelta/getEffectiveDelta live-drag tracking:
   render-only scope, and it reads exactly what RackShape itself reads (the
   rows' current store positions), so it lags a plain drag by the same one
   frame the rack body already does (BUG 6 only special-cased the selection
   outline and resize handles, not every derived overlay). */
export function AisleLabel({ aisle, objects, zoom, gridSize }) {
  const row1 = objects.find(o => o.id === aisle.row1Id)
  const row2 = objects.find(o => o.id === aisle.row2Id)
  if (!row1 || !row2) return null

  const r1 = { x: row1.x, y: row1.y, r: row1.x + row1.width, b: row1.y + row1.height }
  const r2 = { x: row2.x, y: row2.y, r: row2.x + row2.width, b: row2.y + row2.height }

  const yGap = Math.max(r2.x - r1.r, r1.x - r2.r)
  const xGap = Math.max(r2.y - r1.b, r1.y - r2.b)
  const isHoriz = xGap >= yGap

  let aisleWidth, aisleStart, aisleEnd, topRow, bottomRow, leftRow, rightRow
  if (isHoriz) {
    topRow = r1.b < r2.y ? r1 : r2
    bottomRow = r1.b < r2.y ? r2 : r1
    aisleWidth = bottomRow.y - topRow.b
    aisleStart = Math.max(topRow.x, bottomRow.x)
    aisleEnd = Math.min(topRow.r, bottomRow.r)
  } else {
    leftRow = r1.r < r2.x ? r1 : r2
    rightRow = r1.r < r2.x ? r2 : r1
    aisleWidth = rightRow.x - leftRow.r
    aisleStart = Math.max(leftRow.y, rightRow.y)
    aisleEnd = Math.min(leftRow.b, rightRow.b)
  }
  if (aisleWidth <= 0 || aisleEnd <= aisleStart) return null
  const aisleLen = aisleEnd - aisleStart

  const widthTxt = pxToFtIn(aisleWidth, gridSize)
  const userLabel = aisle.label ? `${aisle.label} · ` : ''
  const fullTxt = `${userLabel}${widthTxt}`
  const fs = 13 / zoom
  const aw = 6 / zoom
  const sw = 1.5 / zoom
  const clr = '#f0b429'
  const bdr = '#fbbf24'

  let positions
  if (aisleLen < 20 * gridSize) positions = [aisleStart + aisleLen * 0.5]
  else if (aisleLen < 60 * gridSize) positions = [aisleStart + aisleLen * 0.25, aisleStart + aisleLen * 0.75]
  else positions = [aisleStart + aisleLen * 0.15, aisleStart + aisleLen * 0.5, aisleStart + aisleLen * 0.85]

  const labelMid = isHoriz ? topRow.b + aisleWidth / 2 : leftRow.r + aisleWidth / 2

  return (
    <Group name={'aisle:' + aisle.id} listening={false}>
      {positions.map((pos, i) => {
        const lx = isHoriz ? pos : labelMid
        const ly = isHoriz ? labelMid : pos
        const pad2 = 3 / zoom
        return (
          <Group key={i} listening={false}>
            {isHoriz ? (() => {
              const y1 = topRow.b + pad2, y2 = bottomRow.y - pad2
              return (
                <>
                  <Line points={[lx, y1, lx, y2]} stroke={clr} strokeWidth={sw} listening={false} />
                  <Line closed fill={clr} listening={false} points={[lx, y1, lx - aw / 2, y1 + aw, lx + aw / 2, y1 + aw]} />
                  <Line closed fill={clr} listening={false} points={[lx, y2, lx - aw / 2, y2 - aw, lx + aw / 2, y2 - aw]} />
                </>
              )
            })() : (() => {
              const x1 = leftRow.r + pad2, x2 = rightRow.x - pad2
              return (
                <>
                  <Line points={[x1, ly, x2, ly]} stroke={clr} strokeWidth={sw} listening={false} />
                  <Line closed fill={clr} listening={false} points={[x1, ly, x1 + aw, ly - aw / 2, x1 + aw, ly + aw / 2]} />
                  <Line closed fill={clr} listening={false} points={[x2, ly, x2 - aw, ly - aw / 2, x2 - aw, ly + aw / 2]} />
                </>
              )
            })()}
            <LabelPill cx={lx} cy={ly} text={fullTxt} fontSize={fs} zoom={zoom}
              color="#e2e8f0" bg="#1e2433" padX={6 / zoom} heightScale={2} rx={3 / zoom}
              stroke={bdr} strokeWidth={0.8 / zoom} opacity={0.95} />
          </Group>
        )
      })}
    </Group>
  )
}
