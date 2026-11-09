// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows): a small
// label at each end of every line, just past the end, in the drawings' words style (STUDIO.md §2: Plus Jakarta Sans,
// 10 px on screen whatever the zoom, #767C74). A back-to-back pair's two lines each get theirs, side by side across.
// Pure paint (never listens); hidden with the Racking layer. Each label's Konva name is `rack-line-label`.

import { useMemo } from 'react'
import { Group, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackLinesNow } from '../utils/rackLines'
import { layerShown } from '../utils/layers'

const WORDS = '#767C74', FONT = "'Plus Jakarta Sans', system-ui, sans-serif", PX = 10, GAP = 4

export function RackLineLabels() {
  const { objects, gs, zoom, layers } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40, zoom: s.zoom || 1, layers: s.layers })))
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  if (!lines.length || !layerShown(layers, 'racking')) return null
  const fs = PX / zoom, gap = GAP / zoom, w = fs * 2.6, h = fs * 1.2
  const out = []
  for (const l of lines) {
    const c = (l.s0 + l.s1) / 2, text = 'R' + l.no
    for (const end of ['lo', 'hi']) {
      // rows running across: left of the start, right of the end; rows running up and down: above, below
      const p = l.vert
        ? { x: c - w / 2, y: end === 'lo' ? l.r0 - gap - h : l.r1 + gap, align: 'center' }
        : { x: end === 'lo' ? l.r0 - gap - w : l.r1 + gap, y: c - h / 2, align: end === 'lo' ? 'right' : 'left' }
      out.push(<Text key={l.key + end} name="rack-line-label" text={text} x={p.x} y={p.y} width={w} height={h} align={p.align} verticalAlign="middle"
        fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />)
    }
  }
  return <Group name="rack-line-labels" listening={false}>{out}</Group>
}
