// textSizeCard.jsx — the Text size controls (CLAUDE.md Rule 8 — the CAD text model, labels-cad round; utils/textSizes.js):
//   - the View card's Text size: one real text height per label type (aisle widths, row numbers, the door chain, door
//     numbers, the column chain and bubbles, building size, zone and section names, clearances), with Reset — the
//     project's own, saved with it (replaces the old Label size setting);
//   - an object's Text size field in its card (an aisle, a building, a column grid, a zone, a door — its badge): that
//     object's own height (\`labelSizeIn\`, inches — document data: saved, undoable, printed); empty = the type's.
// A height reads and types as feet and inches (1′-6″, 18, 18 in, 1.5 ft).

import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TEXT_TYPES, TEXT_TYPE_KEYS, MIN_TEXT_IN, MAX_TEXT_IN, useTextSizes, textInches } from '../utils/textSizes'
import { serializeScene, autoSave } from '../utils/saveLoad'
import { ftIn } from '../utils/bom'
import { Sec, Field, fieldBox, Btn } from './cardParts'

/** "1′-6″", "1'6\"", "18", "18 in", "1.5 ft" → inches (within the allowed range), or null. */
export function parseTextInches(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/\s+/g, ' ')
  let m = t.match(/^(\d+(?:\.\d+)?) ?(?:'|ft|feet) ?-? ?(?:(\d+(?:\.\d+)?) ?(?:"|in|inch|inches)?)?$/)
  let v = null
  if (m) v = +m[1] * 12 + (m[2] ? +m[2] : 0)
  else if ((m = t.match(/^(\d+(?:\.\d+)?) ?(?:"|in|inch|inches)?$/))) v = +m[1]
  if (v == null || !(v >= MIN_TEXT_IN && v <= MAX_TEXT_IN)) return null
  return Math.round(v * 100) / 100
}

/** Set (inches) or clear (null: back to the type's height) the Text size of objects `ids`. One undo step. → changed. */
export function setLabelSizeIn(store, ids, inches) {
  const want = new Set(ids)
  let changed = 0, first = null
  const objects = store.getState().objects.map(o => {
    if (!want.has(o.id)) return o
    if (inches == null) { if (o.labelSizeIn == null) return o; changed++; first = first || o.id; const { labelSizeIn, ...rest } = o; void labelSizeIn; return rest }
    if (o.labelSizeIn === inches) return o
    changed++; first = first || o.id
    return { ...o, labelSizeIn: inches }
  })
  if (!changed) return 0
  store.setState({ objects })
  store.getState().commitObjectUpdate(first, {})
  return changed
}

const save = () => { try { autoSave(serializeScene(useCanvasStore.getState())) } catch { /* storage full or absent */ } }

/** A height typed as feet and inches: the field shows `inches` (or empty, its placeholder the default). */
function HeightInput({ inches, placeholder, aria, onCommit }) {
  const show = inches > 0 ? ftIn(inches) : ''
  const [text, setText] = useState(show)
  const [bad, setBad] = useState(false)
  useEffect(() => { setText(show); setBad(false) }, [show])
  const done = () => {
    if (String(text).trim() === '') { if (inches > 0) onCommit(null); return }
    const v = parseTextInches(text)
    if (v == null) { setBad(true); return }
    setBad(false); if (v !== inches) onCommit(v); else setText(show)
  }
  return (
    <input type="text" aria-label={aria} value={text} placeholder={placeholder} className="st-field" aria-invalid={bad || undefined}
      style={{ ...fieldBox(false), width: 76, ...(bad ? { outline: '1px solid #E5484D' } : null) }}
      onChange={e => setText(e.target.value)} onBlur={done}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); done() } if (e.key === 'Escape') { setText(show); setBad(false); e.currentTarget.blur() } }} />
  )
}

/** The View card's Text size: one row per label type, the project's heights, Reset. */
export function ViewTextSizes() {
  const sizes = useTextSizes(s => s.sizes)
  const setSize = useTextSizes(s => s.setSize), resetAll = useTextSizes(s => s.resetAll)
  return (
    <div role="group" aria-label="Text size" data-view-text-size style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 6px 2px', borderTop: '1px solid #343934', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 26, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9AA29C' }}>
        <span>Text size</span>
        <button type="button" aria-label="Reset text sizes" disabled={!Object.keys(sizes).length} onClick={() => { resetAll(); save() }}
          style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, textTransform: 'none', letterSpacing: 0, color: Object.keys(sizes).length ? '#7BD3A4' : '#4A514D' }}>Reset</button>
      </div>
      {TEXT_TYPE_KEYS.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 30, fontSize: 12, color: '#E8EAE6' }}>
          <span style={{ minWidth: 0 }}>{TEXT_TYPES[k].name}</span>
          <HeightInput inches={sizes[k] || TEXT_TYPES[k].inches} aria={TEXT_TYPES[k].name + ' text size'} placeholder={ftIn(TEXT_TYPES[k].inches)}
            onCommit={(v) => { setSize(k, v == null ? null : v); save() }} />
        </div>
      ))}
    </div>
  )
}

/** An object's Text size, in its card: its own height, or empty — the type's (the View card's). */
export function TextSizeField({ objs, type, bare = false }) {
  const list = (objs || []).filter(Boolean)
  const sizes = useTextSizes(s => s.sizes)
  if (!list.length) return null
  const vals = [...new Set(list.map(o => o.labelSizeIn ?? null))]
  const own = vals.length === 1 ? vals[0] : undefined
  const def = textInches(type, null, sizes)
  const Wrap = bare ? ({ children }) => <>{children}</> : Sec
  return (
    <Wrap>
      <Field label="Text size" title={'This label’s own text height — empty: the ' + TEXT_TYPES[type].name.toLowerCase() + ' size in View › Text size (' + ftIn(def) + ')'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeightInput inches={own > 0 ? own : null} aria="Text size" placeholder={own === undefined ? 'Mixed' : ftIn(def)}
            onCommit={(v) => setLabelSizeIn(useCanvasStore, list.map(o => o.id), v)} />
          <Btn kind="ghost" aria-label="Reset text size" disabled={!(own > 0) && own !== undefined} onClick={() => setLabelSizeIn(useCanvasStore, list.map(o => o.id), null)}
            style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Reset</Btn>
        </div>
      </Field>
    </Wrap>
  )
}
