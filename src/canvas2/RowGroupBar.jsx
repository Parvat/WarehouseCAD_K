import { usePlacement } from '../utils/placement'
import { useRowGroup, clearGroup, applyPending, dismissPending, addRowOf } from '../utils/rowGroupTool'
import { rowsOf } from '../utils/rowGroup'
import { useCanvasStore } from '../store/useCanvasStore'

/* The bottom-of-canvas bar (replaces the section-copy bar and its Copy / Don't copy question):
     - a row being placed (paste, duplicate, the left panel): where it goes, or why it can't;
     - the Row group (utils/rowGroupTool.js): how many rows, Pick rows, ✕;
     - with one row selected: "+ This row" and "+ Same row in other sections";
     - an edit to one group row: "Apply to the other N rows?" — and, when an apply would drop bays, how
       many rows lose how many — with Apply, ✕ and "Always apply"; hovering Apply shows the live preview
       (RowGroupPreview.jsx); the rows that can't take it are listed with the reason.
   Plain DOM — no Konva — so it renders anywhere. */

const wrap = {
  position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60,
  width: 'max-content', maxWidth: 'min(680px, calc(100% - 32px))', display: 'flex', flexDirection: 'column', gap: 6,
}
const box = {
  padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.14)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)',
  display: 'flex', flexDirection: 'column', gap: 4,
}
const line = (color) => ({ fontSize: 11, color, fontFamily: 'var(--font-mono)', lineHeight: 1.35 })
const btn = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid var(--accent-solid, #0B101D)',
  whiteSpace: 'nowrap',
}
const btn2 = { ...btn, background: 'var(--surface, #fff)', color: 'var(--text, #0B101D)', border: '1px solid var(--border, #E6E9EF)' }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #6B7280)', fontSize: 14, lineHeight: 1, padding: '0 2px' }
const row = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }

/** A row as the bar names it: "Section 4, row 7" (stamped), else "Row at 93' across". */
export function rowLabel(key, objects, gridSize = 40) {
  if (key.startsWith('s|')) { const [, , sec, ri] = key.split('|'); return `Section ${sec}, row ${ri}` }
  const r = rowsOf(objects, gridSize).get(key)
  const o = r && objects.find(x => x.id === r.ids[0])
  if (!o) return 'A row'
  const fp = objects.find(x => x.id === o.parentId)
  const vert = ((((o.rotation || 0) % 180) + 180) % 180) === 90
  const at = vert ? (o.x + o.width / 2 - o.height / 2 - (fp?.x || 0)) : (o.y - (fp?.y || 0))
  return `Row at ${Math.round(at / gridSize * 10) / 10}' across`
}

/** The switch, as the top bar's switches look. */
function Switch({ on, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text2, #3A4152)' }}>
      <input type="checkbox" role="switch" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Body() {
  const placing = usePlacement(s => s.active)
  const keys = useRowGroup(s => s.keys)
  const picking = useRowGroup(s => s.picking)
  const pending = useRowGroup(s => s.pending)
  const message = useRowGroup(s => s.message)
  const alwaysApply = useRowGroup(s => s.alwaysApply)
  const setAlwaysApply = useRowGroup(s => s.setAlwaysApply)
  const setPicking = useRowGroup(s => s.setPicking)
  const setHover = useRowGroup(s => s.setHover)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const out = []
  if (placing) {
    out.push(
      <div key="place" role="status" aria-label="Placing row" style={box}>
        <div>{placing.blocked
          ? <span style={{ color: 'var(--red, #C0392B)', fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
          : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: 'var(--text3, #6B7280)' }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: 'var(--text3, #6B7280)' }}> · Esc to cancel</span></div>
        {!placing.blocked && placing.warnings?.length > 0 && placing.warnings.map((t, i) => <div key={i} style={line('var(--amber, #B87309)')}>Check — {t}</div>)}
      </div>)
  }
  const one = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0]) : null
  const rackSelected = one && (one.type === 'rack_row' || one.type === 'rack_double_row')
  if (keys.length || rackSelected) {
    out.push(
      <div key="group" role="status" aria-label="Row group" style={box}>
        <div style={row}>
          {keys.length > 0 && <span style={{ fontWeight: 600 }}>Row group · {keys.length} row{keys.length === 1 ? '' : 's'}</span>}
          {rackSelected && <button style={btn2} aria-label="Add this row to the group" onClick={() => addRowOf(one.id)}>+ This row</button>}
          {rackSelected && <button style={btn2} aria-label="Same row in other sections" title="This row and the rows with its row number in the other sections" onClick={() => addRowOf(one.id, { otherSections: true })}>+ Same row in other sections</button>}
          {keys.length > 0 && (
            <button style={picking ? btn : btn2} aria-pressed={picking} aria-label="Pick rows" onClick={() => setPicking(!picking)}
              title="Click a row to add or remove it; drag a box to add the rows it touches">{picking ? 'Picking rows…' : 'Pick rows'}</button>
          )}
          {keys.length > 0 && <button style={closeBtn} aria-label="Clear the row group" title="Clear the row group (Esc)" onClick={clearGroup}>✕</button>}
        </div>
      </div>)
  }
  if (pending) {
    const s = pending.summary
    out.push(
      <div key="apply" role="alertdialog" aria-label="Apply to the other rows?" style={{ ...box, border: '1px solid var(--accent-solid, #0B101D)' }}>
        <div style={row}>
          <span style={{ fontWeight: 600 }}>{s.text}</span>
          {s.apply > 0 && (
            <button style={btn} aria-label="Apply to the other rows"
              onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
              onFocus={() => setHover(true)} onBlur={() => setHover(false)}
              onClick={applyPending}>Apply</button>
          )}
          <button style={closeBtn} aria-label="Don't apply" title="Don't apply — the edit stays on its own row" onClick={dismissPending}>✕</button>
          <Switch on={alwaysApply} onChange={setAlwaysApply} label="Always apply" />
        </div>
        {s.skipped.length > 0 && (
          <div role="alert" aria-label="Rows skipped" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {s.skipped.map((t, i) => <div key={i} style={line('var(--red, #C0392B)')}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</div>)}
          </div>
        )}
      </div>)
  }
  if (message && !pending) {
    out.push(
      <div key="msg" role="status" aria-label="Row group result" style={box}>
        <div style={row}>
          <span>{message}</span>
          <button style={closeBtn} aria-label="Dismiss" onClick={() => useRowGroup.setState({ message: null })}>×</button>
        </div>
      </div>)
  }
  return out.length ? out : null
}

export function RowGroupBar() {
  return <div style={wrap}><Body /></div>
}
