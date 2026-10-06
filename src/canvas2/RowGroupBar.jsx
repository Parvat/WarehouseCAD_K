import { usePlacement } from '../utils/placement'
import { useRowGroup, clearGroup, applyPending, dismissPending } from '../utils/rowGroupTool'
import { rowsOf } from '../utils/rowGroup'
import { useCanvasStore } from '../store/useCanvasStore'

/* The bottom-of-canvas bar (replaces the section-copy bar and its Copy / Don't copy question):
     - a row being placed (paste, duplicate, the left panel): where it goes, or why it can't;
     - the Row group (utils/rowGroupTool.js; rows picked with the Row group tool): "Row group · N rows",
       one "Ask / Auto apply" switch, ✕;
     - in Ask, after an edit to a group row, the same bar: "Apply to the other N rows?" — with how many rows
       lose how many bays, how many will have warnings and how many are skipped — Apply (primary) and Skip;
       the rows with warnings and the skipped rows listed with their reason; the live preview is on the
       canvas (RowGroupPreview.jsx);
     - the last result ("Applied to 11 rows", "Nothing applied. 3 skipped", "… isn't replayed"), with the rows
       it warned about or skipped listed under it — in Auto apply too, which never asks.
   Plain DOM — no Konva — so it renders anywhere. */

const wrap = {
  position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60,
  width: 'max-content', maxWidth: 'min(680px, calc(100% - 32px))', display: 'flex', flexDirection: 'column', gap: 6,
}
const box = {
  padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.14)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)',
  display: 'flex', flexDirection: 'column', gap: 6,
}
const line = (color) => ({ fontSize: 11, color, fontFamily: 'var(--font-mono)', lineHeight: 1.35 })
const btn = {
  padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid var(--accent-solid, #0B101D)',
  whiteSpace: 'nowrap',
}
const btn2 = { ...btn, fontWeight: 500, background: 'var(--surface, #fff)', color: 'var(--text, #0B101D)', border: '1px solid var(--border, #E6E9EF)' }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3, #6B7280)', fontSize: 14, lineHeight: 1, padding: '0 2px', marginLeft: 'auto' }
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

/** "Ask / Auto apply": one switch, both words shown, the current one filled. */
function AskAuto({ auto, onChange }) {
  const seg = (on) => ({
    padding: '3px 8px', fontSize: 11, borderRadius: 5, whiteSpace: 'nowrap',
    background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2, #3A4152)',
  })
  return (
    <button type="button" role="switch" aria-checked={auto} aria-label="Auto apply"
      title={auto ? 'Auto apply: an edit to one row is applied to the others at once (one undo step)' : 'Ask: after an edit to one row, the bar asks before applying it to the others'}
      onClick={() => onChange(!auto)}
      style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border, #E6E9EF)', background: 'var(--surface2, #F1F3F6)', fontFamily: 'var(--font-ui)' }}>
      <span style={seg(!auto)}>Ask</span>
      <span style={seg(auto)}>Auto apply</span>
    </button>
  )
}

function Body() {
  const placing = usePlacement(s => s.active)
  const keys = useRowGroup(s => s.keys)
  const pending = useRowGroup(s => s.pending)
  const message = useRowGroup(s => s.message)
  const report = useRowGroup(s => s.report)
  const alwaysApply = useRowGroup(s => s.alwaysApply)
  const setAlwaysApply = useRowGroup(s => s.setAlwaysApply)
  const setHover = useRowGroup(s => s.setHover)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const out = []
  if (placing) {
    out.push(
      <div key="place" role="status" aria-label="Placing row" style={box}>
        <div>{placing.blocked
          ? <span style={{ color: 'var(--red, #C0392B)', fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
          : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: 'var(--text3, #6B7280)' }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: 'var(--text3, #6B7280)' }}> · {placing.escHint || 'Esc to cancel'}</span></div>
        {!placing.blocked && placing.warnings?.length > 0 && placing.warnings.map((t, i) => <div key={i} style={line('var(--amber, #B87309)')}>Check — {t}</div>)}
      </div>)
  }
  if (keys.length || pending || message) {
    const s = pending && pending.summary
    out.push(
      <div key="group" role="status" aria-label="Row group" style={box}>
        {keys.length > 0 && (
          <div style={row}>
            <span style={{ fontWeight: 600 }}>Row group · {keys.length} row{keys.length === 1 ? '' : 's'}</span>
            <AskAuto auto={alwaysApply} onChange={setAlwaysApply} />
            <button style={closeBtn} aria-label="Clear the row group" title="Clear the row group (Esc)" onClick={clearGroup}>✕</button>
          </div>
        )}
        {s && (
          <div role="alertdialog" aria-label="Apply to the other rows?" style={row}>
            <span>{s.text}</span>
            {s.apply > 0 && (
              <button style={btn} aria-label="Apply to the other rows"
                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
                onFocus={() => setHover(true)} onBlur={() => setHover(false)}
                onClick={applyPending}>Apply</button>
            )}
            <button style={btn2} aria-label="Skip" title="Skip — the edit stays on its own row" onClick={dismissPending}>Skip</button>
          </div>
        )}
        {s && s.warned.length > 0 && (
          <div aria-label="Rows with warnings" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {s.warned.map((t, i) => <div key={i} style={line('var(--amber, #B87309)')}>Warning — {rowLabel(t.key, objects, gridSize)}: {t.reasons.join(', ')}</div>)}
          </div>
        )}
        {s && s.skipped.length > 0 && (
          <div role="alert" aria-label="Rows skipped" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {s.skipped.map((t, i) => <div key={i} style={line('var(--red, #C0392B)')}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</div>)}
          </div>
        )}
        {message && !pending && <div aria-label="Row group result" style={{ fontSize: 12, color: 'var(--text, #0B101D)' }}>{message}</div>}
        {message && !pending && report && (
          <div aria-label="Row group result rows" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {report.warned.map((t, i) => <div key={'w' + i} style={line('var(--amber, #B87309)')}>Warning — {rowLabel(t.key, objects, gridSize)}: {t.reasons.join(', ')}</div>)}
            {report.skipped.map((t, i) => <div key={'s' + i} style={line('var(--red, #C0392B)')}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</div>)}
          </div>
        )}
      </div>)
  }
  return out.length ? out : null
}

export function RowGroupBar() {
  return <div style={wrap}><Body /></div>
}
