// textSizeCard.jsx — the Text size controls (CLAUDE.md Rule 8 — the CAD text model, labels-cad round; utils/textSizes.js):
//   - the Text panel (the bottom-right island's Text button — StudioFrame.jsx): one real text height per label type
//     (aisle widths, row numbers, the door chain, door numbers, the column chain and bubbles, building size, zone and
//     section names, clearances), with Reset — the project's own, saved with it;
//   - an object's Text size field in its card (an aisle, a building, a column grid, a zone, a door — its badge): that
//     object's own height (`labelSizeIn`, inches — document data: saved, undoable, printed); empty = the type's.
// A size is a plain number, like a word processor's font size: the text height in INCHES (18 = 1 ft 6 in) — the app's own
// dropdown of the usual sizes (SIZE_OPTIONS), any number typed. Heights were always stored in inches, so a saved project keeps its own.

import { useState, useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TEXT_TYPES, TEXT_TYPE_KEYS, MIN_TEXT_IN, MAX_TEXT_IN, useTextSizes, textInches } from '../utils/textSizes'
import { serializeScene, autoSave } from '../utils/saveLoad'
import { Sec, Field, fieldBox, Btn } from './cardParts'

/** The sizes the dropdown offers (inches of text height). */
export const SIZE_OPTIONS = [6, 8, 9, 10, 12, 14, 18, 24, 36, 48, 72]
/** A size as the field shows it: the number of inches, no unit (18, 13.5). */
export const sizeText = (inches) => (inches > 0 ? String(Math.round(inches * 100) / 100) : '')

/** "18", "13.5" (inches — a plain number, the font size), or "1′-6″", "1.5 ft", "18 in" → inches (within the allowed range),
 *  or null. */
export function parseTextInches(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/\s+/g, ' ')
  let m = t.match(/^(\d+(?:\.\d+)?) ?(?:'|ft|feet) ?-? ?(?:(\d+(?:\.\d+)?) ?(?:"|in|inch|inches)?)?$/)
  let v = null
  if (m) v = +m[1] * 12 + (m[2] ? +m[2] : 0)
  else if ((m = t.match(/^(\d+(?:\.\d+)?) ?(?:"|in|inch|inches|pt)?$/))) v = +m[1]
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

/** A size field — the app's own dropdown (Studio style): the number of inches (or empty, its placeholder the default),
 *  typed, or picked from the list. A click on the field or its arrow opens the list of every size (SIZE_OPTIONS), the
 *  current one highlighted; a click picks it (committed at once); ↑ / ↓ move, Enter picks, Esc closes. Typing commits on
 *  Enter or leaving the field. The list opens below — or upward with no room there — and never over the right Properties
 *  card (from outside it: kept to its left). */
function SizeInput({ inches, placeholder, aria, onCommit }) {
  const show = sizeText(inches)
  const [text, setText] = useState(show)
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const [pos, setPos] = useState(null)
  const wrap = useRef(null)
  useEffect(() => { setText(show); setBad(false) }, [show])
  const done = (raw = text) => {
    if (String(raw).trim() === '') { if (inches > 0) onCommit(null); return }
    const v = parseTextInches(raw)
    if (v == null) { setBad(true); return }
    setBad(false); if (v !== inches) onCommit(v); else setText(show)
  }
  const ROW = 26, LIST_H = SIZE_OPTIONS.length * ROW + 8
  const place = () => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return null
    const below = window.innerHeight - r.bottom - 8 >= LIST_H
    let left = r.left
    // never over the right Properties card: a field outside it keeps its list to the card's left
    const card = document.querySelector('[data-island="right-card"]'), c = card && card.getClientRects().length ? card.getBoundingClientRect() : null
    if (c && !(r.left >= c.left && r.right <= c.right) && left + r.width > c.left - 8) left = Math.max(8, c.left - 8 - r.width)
    return { left, width: r.width, top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - LIST_H) }
  }
  const openList = () => { setPos(place()); setHi(Math.max(0, SIZE_OPTIONS.indexOf(inches))); setOpen(true) }
  const pick = (v) => { setOpen(false); setText(sizeText(v)); setBad(false); if (v !== inches) onCommit(v) }
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target) && !e.target.closest?.('[data-size-list]')) setOpen(false) }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const listId = 'size-list-' + aria.replace(/\W+/g, '-').toLowerCase()
  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-flex', width: 76 }}>
      <input type="text" inputMode="decimal" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="none"
        aria-label={aria} value={text} placeholder={placeholder} className="st-field" aria-invalid={bad || undefined}
        style={{ ...fieldBox(false), width: '100%', paddingRight: 22, ...(bad ? { outline: '1px solid #E5484D' } : null) }}
        onChange={e => setText(e.target.value)}
        onClick={() => { if (!open) openList() }}
        onBlur={() => { if (!open) done() }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) { openList(); return }
            setHi(h => Math.min(SIZE_OPTIONS.length - 1, Math.max(0, (h < 0 ? 0 : h) + (e.key === 'ArrowDown' ? 1 : -1))))
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            // the list open and the field not changed by typing: the highlighted size; else what was typed
            if (open && hi >= 0 && text === show) { pick(SIZE_OPTIONS[hi]); return }
            setOpen(false); done(); return
          }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (open) { setOpen(false); return } setText(show); setBad(false); e.currentTarget.blur() }
        }} />
      <button type="button" tabIndex={-1} aria-label={aria + ' sizes'} onMouseDown={e => e.preventDefault()} onClick={() => (open ? setOpen(false) : openList())}
        style={{ position: 'absolute', right: 2, top: 0, bottom: 0, width: 20, padding: 0, border: 0, background: 'transparent', color: '#9AA29C', fontSize: 9, cursor: 'pointer' }}>▾</button>
      {open && pos && (
        <div role="listbox" id={listId} aria-label={aria + ' sizes'} data-size-list data-card-dark
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: Math.max(pos.width, 64), zIndex: 400, padding: 4, display: 'flex', flexDirection: 'column',
            background: '#1F2321', border: '1px solid #323835', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,18,16,.28)' }}>
          {SIZE_OPTIONS.map((v, i) => {
            const cur = v === inches, lit = i === hi
            return (
              <div key={v} role="option" aria-selected={cur} data-size={v} onMouseDown={e => e.preventDefault()} onClick={() => pick(v)} onMouseEnter={() => setHi(i)}
                style={{ height: ROW, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace", color: cur ? '#7BD3A4' : '#E8EAE6', background: cur ? '#2E4A3C' : lit ? '#2A2F2C' : 'transparent' }}>
                {v}
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}

/** The Text panel: one row per label type — its size (inches), the project's — and Reset. */
export function TextSizePanel() {
  const sizes = useTextSizes(s => s.sizes)
  const setSize = useTextSizes(s => s.setSize), resetAll = useTextSizes(s => s.resetAll)
  return (
    <div role="group" aria-label="Text size" data-text-size-panel style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 6px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 28, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9AA29C' }}>
        <span>Text size</span>
        <button type="button" aria-label="Reset text sizes" disabled={!Object.keys(sizes).length} onClick={() => { resetAll(); save() }}
          style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, textTransform: 'none', letterSpacing: 0, color: Object.keys(sizes).length ? '#7BD3A4' : '#4A514D' }}>Reset</button>
      </div>
      {TEXT_TYPE_KEYS.map(k => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px', alignItems: 'center', gap: 8, minHeight: 30, fontSize: 12, color: '#E8EAE6' }}>
          <span style={{ minWidth: 0 }}>{TEXT_TYPES[k].name}</span>
          <SizeInput inches={sizes[k] || TEXT_TYPES[k].inches} aria={TEXT_TYPES[k].name + ' text size'} placeholder={sizeText(TEXT_TYPES[k].inches)}
            onCommit={(v) => { setSize(k, v == null ? null : v); save() }} />
        </div>
      ))}
    </div>
  )
}
/** (the earlier name — the Text panel was in the View card) */
export const ViewTextSizes = TextSizePanel

/** An object's Text size, in its card: its own size (inches), or empty — the type's (the Text panel's). */
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
      <Field label="Text size" title={'This label’s own text height, in inches — empty: the ' + TEXT_TYPES[type].name.toLowerCase() + ' size in the Text panel (' + sizeText(def) + ')'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SizeInput inches={own > 0 ? own : null} aria="Text size" placeholder={own === undefined ? 'Mixed' : sizeText(def)}
            onCommit={(v) => setLabelSizeIn(useCanvasStore, list.map(o => o.id), v)} />
          <Btn kind="ghost" aria-label="Reset text size" disabled={!(own > 0) && own !== undefined} onClick={() => setLabelSizeIn(useCanvasStore, list.map(o => o.id), null)}
            style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Reset</Btn>
        </div>
      </Field>
    </Wrap>
  )
}
