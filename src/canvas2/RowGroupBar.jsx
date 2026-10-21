import { usePlacement } from '../utils/placement'
import { placingName } from '../utils/placingName'
import { useRowGroup, clearGroup, applyPending, dismissPending } from '../utils/rowGroupTool'
import { rowsOf } from '../utils/rowGroup'
import { useCanvasStore } from '../store/useCanvasStore'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useNotice, clearNotice, NOTICE_MS } from '../utils/notice'

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

/* white, 1px line, radius 4, the theme shadow (index.css .t-float); a text-only chip is 32px high, a bar with
   buttons grows around its 32px buttons. Words in PJS 12; warnings in the amber text, errors in flag. */
const wrap = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 680, minWidth: 0 }
const box = {
  padding: '4px 12px', minHeight: 32, maxWidth: '100%', fontSize: 12, lineHeight: '22px',
  display: 'flex', flexDirection: 'column', gap: 4,
}
const line = (color) => ({ fontSize: 12, color, fontFamily: 'var(--font-ui)', lineHeight: 1.5 })
const WARN = 'var(--warn-fg)', ERR = 'var(--flag)', MUTED = 'var(--steel)'
const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const closeIcon = <X size={16} strokeWidth={1.5} absoluteStrokeWidth />

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
    height: 30, padding: '0 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center',
    background: on ? 'var(--pine)' : 'var(--bg2)', color: on ? 'var(--paper)' : 'var(--ink-2)',
  })
  return (
    <button type="button" role="switch" aria-checked={auto} aria-label="Auto apply"
      title={auto ? 'Auto apply: an edit to one row is applied to the others at once (one undo step)' : 'Ask: after an edit to one row, the bar asks before applying it to the others'}
      onClick={() => onChange(!auto)}
      style={{ display: 'flex', height: 32, padding: 0, overflow: 'hidden', borderRadius: 2, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--bg2)', fontFamily: 'var(--font-ui)' }}>
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
  // a short note (utils/notice.js) — what Ctrl+A kept; it goes after NOTICE_MS
  const notice = useNotice()
  useEffect(() => { if (!notice.text) return; const k = setTimeout(clearNotice, NOTICE_MS); return () => clearTimeout(k) }, [notice.at, notice.text])
  const out = []
  if (notice.text) {
    out.push(
      <div key="notice" role="status" aria-label="Notice" className="t-float" style={box}>
        <div><span>{notice.text}</span>{notice.hint && <span style={{ color: MUTED }}> · {notice.hint}</span>}</div>
      </div>)
  }
  if (placing) {
    out.push(
      <div key="place" role="status" aria-label={`Placing ${placingName(placing.items)}`} className="t-float" style={box}>
        <div><span style={{ fontWeight: 600 }}>Placing {placingName(placing.items)}</span><span style={{ color: MUTED }}> · </span>{placing.blocked
          ? <span style={{ color: ERR, fontWeight: 600 }}>Can't place here — {placing.blocked}</span>
          : <span>Click to place{placing.snapped?.cross || placing.snapped?.run ? <span style={{ color: MUTED }}> · snapped to {[placing.snapped.cross, placing.snapped.run].filter(Boolean).join(', ')}</span> : null}</span>}
          <span style={{ color: MUTED }}> · {placing.escHint || 'Esc to cancel'}</span></div>
        {!placing.blocked && placing.warnings?.length > 0 && placing.warnings.map((t, i) => <div key={i} style={line(WARN)}>Check — {t}</div>)}
      </div>)
  }
  if (keys.length || pending || message) {
    const s = pending && pending.summary
    out.push(
      <div key="group" role="status" aria-label="Row group" className="t-float" style={box}>
        {keys.length > 0 && (
          <div style={row}>
            <span style={{ fontWeight: 600 }}>Row group · {keys.length} row{keys.length === 1 ? '' : 's'}</span>
            <AskAuto auto={alwaysApply} onChange={setAlwaysApply} />
            <button type="button" className="t-icon" style={{ marginLeft: 'auto' }} aria-label="Clear the row group" title="Clear the row group (Esc)" onClick={clearGroup}>{closeIcon}</button>
          </div>
        )}
        {s && (
          <div role="alertdialog" aria-label="Apply to the other rows?" style={row}>
            <span>{s.text}</span>
            {s.apply > 0 && (
              <button type="button" className="t-btn t-btn--primary" aria-label="Apply to the other rows"
                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
                onFocus={() => setHover(true)} onBlur={() => setHover(false)}
                onClick={applyPending}>Apply</button>
            )}
            <button type="button" className="t-btn t-btn--secondary" aria-label="Skip" title="Skip — the edit stays on its own row" onClick={dismissPending}>Skip</button>
          </div>
        )}
        {s && s.warned.length > 0 && (
          <div aria-label="Rows with warnings" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {s.warned.map((t, i) => <div key={i} style={line(WARN)}>Warning — {rowLabel(t.key, objects, gridSize)}: {t.reasons.join(', ')}</div>)}
          </div>
        )}
        {s && s.skipped.length > 0 && (
          <div role="alert" aria-label="Rows skipped" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {s.skipped.map((t, i) => <div key={i} style={line(ERR)}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</div>)}
          </div>
        )}
        {message && !pending && <div aria-label="Row group result" style={{ fontSize: 12, color: 'var(--ink)' }}>{message}</div>}
        {message && !pending && report && (
          <div aria-label="Row group result rows" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {report.warned.map((t, i) => <div key={'w' + i} style={line(WARN)}>Warning — {rowLabel(t.key, objects, gridSize)}: {t.reasons.join(', ')}</div>)}
            {report.skipped.map((t, i) => <div key={'s' + i} style={line(ERR)}>Skipped — {rowLabel(t.key, objects, gridSize)}: {t.reason}</div>)}
          </div>
        )}
      </div>)
  }
  return out.length ? out : null
}

export function RowGroupBar() {
  return <div style={wrap}><Body /></div>
}
