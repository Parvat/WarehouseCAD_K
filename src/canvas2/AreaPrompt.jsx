import { useAreaPrompt, answerArea, answerChoice, dismissAreaNote } from '../utils/rackingAreaTool'

/* The racking area / zone question (utils/rackingAreaTool.js): a racking area
   with hand edits about to be resized or rebuilt, or a zone about to go over
   racks. Continue does it (one undo step); Cancel leaves everything as it was.
   Same bar as the Row group (RowGroupBar), just above it. */
const wrap = {
  position: 'absolute', left: '50%', bottom: 64, transform: 'translateX(-50%)', zIndex: 61,
  width: 'max-content', maxWidth: 'min(640px, calc(100% - 32px))',
}
const box = {
  padding: '8px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
  background: 'var(--surface, #fff)', border: '1px solid var(--accent-solid, #0B101D)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.14)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)',
}
const btn = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid var(--accent-solid, #0B101D)',
}
const btn2 = { ...btn, background: 'var(--surface, #fff)', color: 'var(--text, #0B101D)', border: '1px solid var(--border, #E6E9EF)' }

export function AreaPrompt() {
  const q = useAreaPrompt(s => s.question), note = useAreaPrompt(s => s.note)
  if (!q && note) return (
    <div style={wrap}>
      <div role="status" aria-label="Zone change" style={box}>
        <span style={{ fontWeight: 600 }}>{note}</span>
        <button type="button" aria-label="Dismiss" style={{ ...btn2, padding: '2px 8px' }} onClick={dismissAreaNote}>✕</button>
      </div>
    </div>
  )
  if (!q) return null
  return (
    <div style={wrap}>
      <div role="alertdialog" aria-label="Racking area question" style={box}>
        <span style={{ fontWeight: 600 }}>{q.text}</span>
        {q.choices
          ? q.choices.map((c, i) => <button key={c.label} type="button" style={i === q.choices.length - 1 ? btn : btn2} onClick={() => answerChoice(i)}>{c.label}</button>)
          : <>
              <button type="button" style={btn} onClick={() => answerArea(true)}>Continue</button>
              <button type="button" style={btn2} onClick={() => answerArea(false)}>Cancel</button>
            </>}
      </div>
    </div>
  )
}
