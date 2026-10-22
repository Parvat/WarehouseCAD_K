import { useState } from 'react'
import { useCanvasStore } from '../../../store/useCanvasStore'
import { LABEL_SIZES, LABEL_SIZE_NAMES, MIN_LABEL_IN, MAX_LABEL_IN } from '../../../render/labelSize'
import { C, fieldBox, Seg, Btn, SecLabel, Hint } from '../../../studio/cardParts'

/* ── An aisle's own label size ────────────────────────────────────────────────
   Selected aisles can override the global Label size for their own width
   label: a size key's inches, or a custom number of inches. "Default" removes
   the override (the label follows the global setting again); "Apply to all
   aisles" gives every aisle the selection's size. Stored on the aisle as
   labelSizeIn — document data, so it is saved with the layout, undoable and
   printed in the PDF. Cross-aisle labels follow the global size. */

/** Set (inches) or clear (null: back to the global Label size) the label
 *  size of the aisles `ids`. Written without history, then ONE commit: one
 *  undo step. Returns how many aisles changed. */
export function setAisleLabelSize(store, ids, inches) {
  const want = new Set(ids)
  let changed = 0, first = null
  const objects = store.getState().objects.map(o => {
    if (o.type !== 'aisle' || !want.has(o.id)) return o
    if (inches == null) {
      if (o.labelSizeIn == null) return o
      changed++; first = first || o.id
      const { labelSizeIn, ...rest } = o
      return rest
    }
    if (o.labelSizeIn === inches) return o
    changed++; first = first || o.id
    return { ...o, labelSizeIn: inches }
  })
  if (!changed) return 0
  store.setState({ objects })
  store.getState().commitObjectUpdate(first, {})
  return changed
}

/** "30", "30 in", '30"', "2.5'", "2.5 ft" -> inches, or null. */
export function parseLabelInches(text) {
  const t = String(text || '').trim().toLowerCase()
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(in|inch|inches|"|ft|feet|')?$/)
  if (!m) return null
  const v = +m[1] * (m[2] === 'ft' || m[2] === 'feet' || m[2] === "'" ? 12 : 1)
  return v >= MIN_LABEL_IN && v <= MAX_LABEL_IN ? Math.round(v * 100) / 100 : null
}

/* Studio card: a column of card parts (STUDIO.md §3, src/studio/cardParts.jsx). The presets sit in two
   segmented tracks so "Extra large" fits the 268px card. */
const sizeOpt = (k, presetKey, set) => ({ value: k, label: LABEL_SIZE_NAMES[k], title: `${LABEL_SIZES[k]} in text`,
  on: presetKey === k, onClick: () => set(LABEL_SIZES[k]) })

export function AisleLabelSize({ ids }) {
  const objects = useCanvasStore(s => s.objects)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const aisles = objects.filter(o => o.type === 'aisle' && ids.includes(o.id))
  if (!aisles.length) return null
  const vals = [...new Set(aisles.map(a => a.labelSizeIn ?? null))]
  const current = vals.length === 1 ? vals[0] : undefined          // undefined: the selection is mixed
  const presetKey = current == null ? null : Object.keys(LABEL_SIZES).find(k => LABEL_SIZES[k] === current) || null
  const set = (inches) => setAisleLabelSize(useCanvasStore, aisles.map(a => a.id), inches)
  const applyCustom = () => {
    const v = parseLabelInches(text)
    if (v == null) { setBad(text.trim() !== ''); return }
    setBad(false); setText(''); set(v)
  }
  const allAisles = objects.filter(o => o.type === 'aisle').map(o => o.id)
  const status = current === undefined ? 'Mixed sizes'
    : current == null ? 'Follows the global Label size'
    : presetKey ? `${LABEL_SIZE_NAMES[presetKey]} — ${current} in text`
    : `Custom — ${current} in text`
  const keys = Object.keys(LABEL_SIZES)
  return (
    <div role="group" aria-label="Aisle label size" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <SecLabel>Label size{aisles.length > 1 ? ` · ${aisles.length} aisles` : ''}</SecLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Seg aria="Aisle label size presets" options={[
          { value: 'default', label: 'Default', on: current === null, onClick: () => set(null) },
          ...keys.slice(0, 2).map(k => sizeOpt(k, presetKey, set)),
        ]} />
        <Seg aria="Aisle label size presets, large" options={keys.slice(2).map(k => sizeOpt(k, presetKey, set))} />
      </div>
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <input type="text" value={text} placeholder="custom (inches)" aria-label="Custom aisle label size (inches)" className="st-field"
          onChange={e => { setText(e.target.value); setBad(false) }}
          onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
          style={{ ...fieldBox(), flex: 1, ...(bad ? { boxShadow: `inset 0 0 0 1px ${C.danger}` } : null) }} />
        <Btn kind="inset" onClick={applyCustom} style={{ height: 30, padding: '0 12px', borderRadius: 6 }}>Set</Btn>
      </div>
      {bad && <Hint style={{ color: C.danger }}>{MIN_LABEL_IN}–{MAX_LABEL_IN} in, e.g. 30 or 2.5'</Hint>}
      <Hint>{status}</Hint>
      <Btn kind="ghost" style={{ width: '100%', ...(current === undefined ? { color: C.faint, cursor: 'not-allowed' } : null) }} disabled={current === undefined}
        title={current === undefined ? 'Pick one size for the selection first' : 'Give every aisle this label size'}
        onClick={() => setAisleLabelSize(useCanvasStore, allAisles, current)}>
        Apply to all aisles ({allAisles.length})
      </Btn>
    </div>
  )
}
