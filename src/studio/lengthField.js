// lengthField.js — (units-2) one behaviour for every length input outside the card's NumInput (cardParts.jsx): Project
// settings, the Generate panel, the Fill and Door bars, the elevation. Spread its props on an <input>: it shows the value in
// the project's units (utils/units.js showLengthAs) and, while typed, keeps the words as typed; every form is read
// (parseLengthAs) — 12'6, 12 ft 6 in, 150 in, 3.8 m, 3800 mm, or a bare number in the project unit.
import { useEffect, useRef, useState } from 'react'
import { useUnits, parseLengthAs, showLengthAs } from '../utils/units'

/** `value` the field's number in `unit` ('ft' | 'in'); `onValue(n | null)` — live (each keystroke that reads as a length,
 *  null when emptied) or on Enter / blur only (`live: false`). → props for an <input>. */
export function useLengthField(value, onValue, { unit = 'ft', live = true, min = 0 } = {}) {
  const u = useUnits()
  const shown = showLengthAs(value, unit, u)
  const [text, setText] = useState(shown)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(shown) }, [shown])
  const read = (t) => { if (String(t).trim() === '') return null; const v = parseLengthAs(t, unit, u); return v != null && v >= min ? v : undefined }
  const commit = (t) => { const v = read(t); if (v !== undefined && v !== value) onValue(v) }
  return {
    type: 'text', role: 'spinbutton', inputMode: 'decimal', value: text,
    onFocus: () => { focused.current = true },
    onChange: (e) => { setText(e.target.value); if (live) { const v = read(e.target.value); if (v !== undefined) onValue(v) } },
    onBlur: () => { focused.current = false; if (!live) commit(text); setText(showLengthAs(read(text) ?? value, unit, u)) },
    onKeyDown: (e) => { if (e.key === 'Enter') { if (!live) commit(text); e.currentTarget.blur() } },
  }
}
