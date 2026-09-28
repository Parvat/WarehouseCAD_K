import { createContext, useContext, useMemo, useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { checkColumns, aisleColumnBlocks, MHE_PROFILES } from './columnCheck'
import { layoutColumns, layoutFloors } from './usableCapacity'
import { useRules } from '../rules/useRules'
import { useDragPreview } from '../canvas2/dragPreview'

/* ── Column / forklift grid check — the app-side wiring ──────────────────────
   columnCheck.js is the pure brain; this is the only place that calls it.

   The result is DERIVED, not imperatively recalculated. An effect that fired
   "on activate" is exactly what was broken before — it had to enumerate every
   trigger (grid toggled on, build resized, cross-aisle changed, rack dragged)
   and went stale the moment one was missed. A useMemo over the store's
   `objects` array cannot go stale: every one of those triggers is an object
   mutation, so they all land here for free, including placing the column grid
   in the first place.

   Nothing is written to the canvas store. The check is a read-only lens over
   it, plus two pieces of local presentation state (the forklift choice and the
   per-conflict absorb/remove decision). */

const EMPTY_RESULT = {
  rackConflicts: [],
  flueSeated:    [],
  pickBlocks:    [],
  uprightHits:   [],
  aisleBlocks:   [],
  redMarks:      [],
  summary: {
    profile: '', rackConflicts: 0, flueSeated: 0, blockedAisles: 0,
    positionsLostIfAbsorb: 0, positionsLostToPickZone: 0, columnsOnUprights: 0, sectionsLostIfRemove: 0,
  },
}

/* Type-agnostic by construction. The brief calls for selective single/double,
   cantilever/long and mixed layouts — rather than enumerate a set that would
   drift as rack types are added, take everything the app calls a rack and let
   checkColumns (which is itself type-agnostic) decide. */
export const isRack = o => typeof o?.type === 'string' && o.type.startsWith('rack_')

/* A conflict's identity has to survive a re-run of the check, so decisions
   stick while the user drags racks around. */
export const conflictKey = c => `${c.rackId}:${c.columnIndex}`

/* ── Only re-check when the geometry changed ─────────────────────────────────
   Any change to the store's objects makes a new `objects` array — a bay
   highlight, the building's row baseline, a label. The check reads none of
   that, so its three inputs (racks, columns, floors) keep their previous
   array while their content is the same, and the check reruns only when one
   of them really changed. A rack's key is everything on it except the fields
   below, which are selection / bookkeeping, not geometry; it is cached per
   object, so an edit re-keys only the racks it touched. */
const NOT_GEOMETRY = new Set(['activeBayIdx', 'activeTowerIdx', 'rowIndex', 'genSection', 'genRunFt', 'genCrossFt', 'pieceOf'])
const keyOf = new WeakMap()
export const rackGeometryKey = (r) => {
  let k = keyOf.get(r)
  if (k === undefined) { k = JSON.stringify(r, (key, v) => (NOT_GEOMETRY.has(key) ? undefined : v)); keyOf.set(r, k) }
  return k
}
export const sameRacks = (a, b) => a.length === b.length && a.every((r, i) => r === b[i] || rackGeometryKey(r) === rackGeometryKey(b[i]))
export const sameRects = (a, b) => a.length === b.length && a.every((q, i) => q === b[i] || (q.x === b[i].x && q.y === b[i].y && q.w === b[i].w && q.h === b[i].h))
export const sameFloors = (a, b) => a.length === b.length && a.every((f, i) => f === b[i] || JSON.stringify(f) === JSON.stringify(b[i]))

/** `next`, or the previous value when it is `same` as it. */
function useSame(next, same) {
  const ref = useRef(next)
  if (ref.current !== next && !same(ref.current, next)) ref.current = next
  return ref.current
}

const Ctx = createContext(null)

export function ColumnCheckProvider({ children }) {
  const objects  = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize)

  /* The forklift input. Lives here rather than inside GeneratePanel so the
     panel, the overlay and the conflict list all read one value — the profile
     drives both the generated aisle width and the clearance the check tests. */
  const [mheKey, setMheKey]       = useState('reach')
  const [showMarks, setShowMarks] = useState(true)
  /* GENERATOR_SPEC_V10.md's 3-level accessibility rule: a column with clear
     space on only one side is accessible by default (drivable + pickable
     from the far side) — this toggle is the customer preference that says
     otherwise, when they want every aisle pickable from BOTH faces. */
  const [pickBothSides, setPickBothSides] = useState(false)
  const [resolutions, setRes]     = useState({})   // conflictKey -> 'absorb' | 'removed'

  /* The truck profile comes from the resolved rules table, not columnCheck's
     shipped constant — that is the whole point of the cascade: a dealer who
     designs 11ft reach aisles gets their clearance tested here, and a customer
     who overrides it gets theirs, without either editing the check. The
     shipped MHE_PROFILES remain the floor if a profile omits a truck. */
  const { mheOptions } = useRules()
  const profile = mheOptions[mheKey] || MHE_PROFILES[mheKey] || MHE_PROFILES.reach

  /* A hidden grid is a grid that is switched off — ColumnGridPanel's
     Visible/Hidden button writes `showGrid`, and toggling it back on is one
     of the recalc triggers the brief asks for. Kept as its own memo (not
     inlined into `result`'s) so a renderer that needs a column's actual
     position — e.g. a clearance label at columns[aisleBlocks[i].columnIndex]
     — doesn't have to re-expand the grid itself. */
  const columns = useSame(useMemo(() => layoutColumns(objects, gridSize), [objects, gridSize]), sameRects)

  /* Building outlines for the pick-zone check: a single row against a wall
     has no aisle on that side, so it has one pick side, not two. fpVerts are
     absolute world points with any rotation already baked in. */
  const floors = useSame(useMemo(() => layoutFloors(objects), [objects]), sameFloors)
  const racks = useSame(useMemo(() => objects.filter(isRack), [objects]), sameRacks)

  /* During a drag (dragPreview's `dragging`: a plain or live-flue drag, a
     resize, a rotate) the full check is held at its last result and only its
     cheap aisle part reruns, on the layout as it stands this frame — the
     clearance labels stay live, the in-rack / pick-zone / upright work waits
     for the drop, where it runs once. The last full result is kept with its
     inputs, so a drop that changed nothing doesn't run it again. */
  const dragging = useDragPreview(s => s.dragging)
  const last = useRef(null)
  const result = useMemo(() => {
    const inputs = { racks, columns, profile, gridSize, pickBothSides, floors }
    const l = last.current
    const same = l && Object.keys(inputs).every(k => l.inputs[k] === inputs[k])
    if (dragging) {
      const held = l ? l.result : EMPTY_RESULT
      if (same || !racks.length || !columns.length) return held
      return { ...held, aisleBlocks: aisleColumnBlocks({ racks, columns, profile, gridSize, pickBothSides }).aisleBlocks }
    }
    if (same) return l.result
    const full = (!racks.length || !columns.length) ? EMPTY_RESULT : checkColumns(inputs)
    last.current = { inputs, result: full }
    return full
  }, [dragging, racks, columns, gridSize, profile, pickBothSides, floors])

  /* Absorb is the default, so it is the absence of a decision, not a stored
     one — the customer keeps the rack and eats `positionsLost`. Only "remove
     section" is a real edit, and it is applied to the rack by the panel. */
  const setResolution = useCallback((key, mode) => {
    setRes(r => (r[key] === mode ? r : { ...r, [key]: mode }))
  }, [])

  const value = useMemo(() => ({
    result, columns, profile, mheKey, setMheKey,
    showMarks, setShowMarks,
    pickBothSides, setPickBothSides,
    resolutions, setResolution,
  }), [result, columns, profile, mheKey, showMarks, pickBothSides, resolutions, setResolution])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useColumnCheck() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useColumnCheck must be used inside <ColumnCheckProvider>')
  return ctx
}
