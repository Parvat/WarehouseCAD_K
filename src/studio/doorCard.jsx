// doorCard.jsx — a door's card (doors-edit round; STUDIO.md, Doors; mockup doors2.png): its number and type in the head with
// its padlock; Type, Width, Height and From left corner typed (each one undo step, refused with a notice when the door
// would leave its wall or overlap a neighbour); its clear space and its gaps to its neighbours, read. Locked: the fields
// greyed (the existing lock rule).

import { useCanvasStore } from '../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { Head, Sec, Grid2, Field, TextInput, SelectField, StaticField, LockedFields, C, MONO } from './cardParts'
import { CardLock } from './CardLock'
import { useLocked } from './useLocked'
import { doorTypes, doorHeightFt, DOOR_HEIGHT_FT } from '../utils/doorTool'
import { doorWall, spanOf, neighbourGaps, doorPlaced, doorsOnWall, doorNumbers } from '../utils/doorWall'
import { doorClearOf } from '../utils/doorClear'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { notify } from '../utils/notice'

const len = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }
const feet = (t) => parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"'))
const NAMES = { struct_egress: 'Man door', struct_loading_dock: 'Dock door', struct_drive_in: 'Drive-in door' }

/** The patch for door `d` put at low end `s0`, `W` wide, `D` deep on its wall — or null with a notice when it would
 *  leave the wall or overlap a door beside it. */
export function doorRefit(objects, d, { s0, W = d.width, D = d.height }, gs = 40) {
  const w = doorWall(d, objects, gs)
  if (!w) return null
  if (!(W > 0)) { notify('A door must be wider than zero.'); return null }
  if (s0 < w.lo - 0.5 || s0 + W > w.hi + 0.5) { notify('The door would pass the corner — not changed.'); return null }
  const others = doorsOnWall(objects, w, gs).filter(o => o.id !== d.id)
  if (others.some(o => { const [a, b] = spanOf(o); return s0 < b - 0.5 && s0 + W > a + 0.5 })) { notify('The door would overlap the door beside it — not changed.'); return null }
  return doorPlaced(d, w, s0, W, D)
}

export function DoorMain({ obj }) {
  const { objects, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40 })))
  const locked = useLocked(obj)
  const w = doorWall(obj, objects, gs), [s0, s1] = spanOf(obj)
  const num = doorNumbers(objects, gs).get(obj.id)
  const commit = (patch) => { if (patch) useCanvasStore.getState().commitObjectUpdate(obj.id, patch) }
  const cur = () => useCanvasStore.getState().objects.find(o => o.id === obj.id)
  const setType = (type) => {
    const d = cur(), spec = doorTypes().find(t => t.type === type)
    if (!d || !spec || type === d.type) return
    const g = doorRefit(useCanvasStore.getState().objects, d, { s0: spanOf(d)[0], D: spec.depthFt * gs }, gs)
    if (!g) return
    const color = spec.color || '#6366f1'
    const typed = d.meta?.heightFt != null && d.meta.heightFt !== DOOR_HEIGHT_FT[d.type]
    commit({ ...g, type: spec.type, label: spec.label, fill: color + '22', stroke: color, snapType: spec.snapType, meta: { ...(d.meta || {}), ...(spec.meta || {}), doorWidth: d.width / gs, heightFt: typed ? d.meta.heightFt : DOOR_HEIGHT_FT[spec.type] } })
  }
  const setWidth = (t) => { const ft = feet(t), d = cur(); if (ft == null || !d || Math.abs(ft * gs - d.width) < 0.01) return; const g = doorRefit(useCanvasStore.getState().objects, d, { s0: spanOf(d)[0], W: ft * gs }, gs); if (g) commit({ ...g, meta: { ...(d.meta || {}), doorWidth: ft } }) }
  const setFrom = (t) => { const ft = feet(t), d = cur(), ww = d && doorWall(d, useCanvasStore.getState().objects, gs); if (ft == null || !ww) return; const s = ww.lo + ft * gs; if (Math.abs(s - spanOf(d)[0]) < 0.01) return; commit(doorRefit(useCanvasStore.getState().objects, d, { s0: s }, gs)) }
  const setHeight = (t) => { const ft = feet(t), d = cur(); if (ft == null || !(ft > 0) || !d) return; commit({ meta: { ...(d.meta || {}), heightFt: ft } }) }
  const gaps = neighbourGaps(obj, objects, gs)
  const nums = doorNumbers(objects, gs)
  const clear = doorClearOf(obj, objects, gs)
  const along = (c) => (doorWall(obj, objects, gs)?.axis === 'y' ? [c.h, c.w] : [c.w, c.h])
  const clearText = clear.length ? `${len(along(clear[0])[0], gs)} × ${len(along(clear[0])[1], gs)}${clear.length > 1 ? (Math.abs(along(clear[0])[1] - along(clear[1])[1]) < 0.5 ? ' each side' : ` / ${len(along(clear[1])[1], gs)}`) : ''}` : '—'
  const fromLabel = w?.axis === 'y' ? 'From top corner' : 'From left corner'
  const gapName = (id, end) => (id ? `to door ${nums.get(id)}` : `to the ${end} corner`)
  const ends = w?.axis === 'y' ? ['top', 'bottom'] : ['left', 'right']
  const heightFt = doorHeightFt(obj)
  return (
    <>
      <Head caption={`${num ? num + ' · ' : ''}${NAMES[obj.type] || 'Door'}`} right={<CardLock obj={obj} />} />
      <Sec aria-label="Door settings">
        <LockedFields locked={locked}>
          <Field label="Type">
            <SelectField words chevron aria="Door type" value={obj.type} onChange={e => setType(e.target.value)}>
              {doorTypes().map(t => <option key={t.type} value={t.type}>{NAMES[t.type] || t.label}</option>)}
            </SelectField>
          </Field>
          <Grid2>
            <Field label="Width"><TextInput aria="Door width" value={len(s1 - s0, gs)} onCommit={setWidth} /></Field>
            <Field label="Height"><TextInput aria="Door height" placeholder="—" value={heightFt ? len(heightFt * gs, gs) : ''} onCommit={setHeight} /></Field>
          </Grid2>
          {w && <Field label={fromLabel}><TextInput aria="From left corner" value={len(s0 - w.lo, gs)} onCommit={setFrom} /></Field>}
        </LockedFields>
        <Field label="Clear space"><StaticField aria="Clear space">{clearText}</StaticField></Field>
        {gaps && (
          <div aria-label="Gaps to neighbours" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[[gaps.prev, gaps.prevDoor, ends[0]], [gaps.next, gaps.nextDoor, ends[1]]].map(([v, id, end]) => v == null ? null : (
              <div key={end} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: C.muted }}>Gap {gapName(id, end)}</span>
                <span data-door-gap={end} style={{ fontFamily: MONO, color: C.strong }}>{len(v, gs)}</span>
              </div>
            ))}
          </div>
        )}
      </Sec>
    </>
  )
}
